import type { BuildingDefId, TechDef, TechId, WalkerTraitId } from "@the-oracle/content";
import { buildingDefs, eventChainDefById, legendaryConsultationDefs, techDefById, techDefs, WALKER_TRAIT_IDS } from "@the-oracle/content";

import type { GameEvent, GameState, Loan, LegendaryConsultationProgress, PatronContract, PriestCouncilBlocId, Treaty, FactionDemand } from "../state/gameState";
import { isBuildingUnderConstruction } from "../state/gameState";
import { canPlaceBuilding, isFootprintAdjacentToRoad } from "../terrain/footprint";
import { hasDepositInRange } from "../terrain/deposits";
import { isBuildableTerrain, resolveTileTerrain } from "../terrain/generate";
import type { EspionageAgent, EspionageAgentTrait, EspionageOperation, EspionageOperationKind } from "../state/espionage";
import { createInitialEspionageState } from "../state/espionage";
import type { ExcavationSite, Relic, SacredSite } from "../state/excavation";
import { createInitialState } from "../state/initialState";
import { syncCampaignState } from "../state/campaign";
import {
  buildProphecyDepthSummary,
  buildProphecyInterpretation,
  buildProphecyScaffold,
  selectPopulationSummary
} from "../selectors";
import { getAbsoluteDay } from "../simulation/clock";
import { createBuildingAt } from "../simulation/updateDay";
import {
  applyBilateralRelationDelta,
  createConsequence,
  evaluateDeliveryObservers,
  maybeCreateConsultation,
  scorePlacedTiles
} from "../simulation/events";
import { createProphecyArc, scanForContradictions } from "../simulation/prophecyArcs";
import { interrogateAgent } from "../simulation/espionage";
import { generateReinterpretations } from "../simulation/prophecyFeedback";
import { createInitialLegacyState, computeLegacyScore, generateLegacyArtifact } from "../state/legacy";
import { createInitialLineageState, recordRunInLineage, burdenDefById } from "../state/lineage";
import type { BurdenId } from "../state/lineage";
import { createInitialProphecyArcState } from "../state/prophecy";
import { narrateProphecyDelivery, narrateContradiction } from "../textgen/prophecyNarrator";
import type { GameCommand } from "../commands/types";

function coordEquals(left: { x: number; y: number }, right: { x: number; y: number }): boolean {
  return left.x === right.x && left.y === right.y;
}

function hasSacredWay(state: GameState): boolean {
  return state.grid.roads.length > 0;
}

function isTileOpen(state: GameState, tile: { x: number; y: number }): boolean {
  const roadTaken = state.grid.roads.some((road) => coordEquals(road, tile));
  const buildingTaken = state.buildings.some((building) => coordEquals(building.position, tile));
  return !roadTaken && !buildingTaken;
}

function nextStateWithEvent(state: GameState, eventText: string): GameState {
  return {
    ...state,
    nextId: state.nextId + 1,
    eventFeed: [
      {
        id: `event-${state.nextId}`,
        day: state.clock.day,
        text: eventText
      },
      ...state.eventFeed
    ].slice(0, 8)
  };
}

/** Returns the set of building IDs unlocked by completed tech effects. */
function getUnlockedBuildingIds(state: GameState): Set<string> {
  const ids = new Set<string>();
  const completedTechs = state.research?.completedTechIds ?? [];
  for (const techId of completedTechs) {
    const tech = techDefById[techId];
    if (!tech) continue;
    for (const effect of tech.effects) {
      if (effect.kind === "unlock_building") {
        ids.add(effect.buildingId);
      }
    }
  }
  return ids;
}

/** Returns true if a building requires a tech unlock_building effect and the player has it. */
function isBuildingTechUnlocked(state: GameState, defId: string): boolean {
  // Check if any tech has an unlock_building effect for this building
  const needsUnlock = techDefs.some((tech) =>
    tech.effects.some((e) => e.kind === "unlock_building" && e.buildingId === defId)
  );
  if (!needsUnlock) return true; // No tech gates this building
  return getUnlockedBuildingIds(state).has(defId);
}

function appendFactionHistory(state: GameState, factionId: keyof GameState["factions"], text: string): GameState["factions"] {
  const faction = state.factions[factionId];
  return {
    ...state.factions,
    [factionId]: {
      ...faction,
      history: [text, ...faction.history].slice(0, 4)
    }
  };
}

function applyObserverReactions(
  factions: GameState["factions"],
  reactions: ReturnType<typeof evaluateDeliveryObservers>
): GameState["factions"] {
  let nextFactions = factions;

  for (const reaction of reactions) {
    const faction = nextFactions[reaction.factionId];
    nextFactions = {
      ...nextFactions,
      [reaction.factionId]: {
        ...faction,
        favour: Math.max(0, Math.min(100, faction.favour + reaction.favourDelta)),
        credibility: Math.max(0, Math.min(100, faction.credibility + reaction.credibilityDelta)),
        dependence: Math.max(0, Math.min(100, faction.dependence + reaction.dependenceDelta)),
        history: [reaction.historyEntry, ...faction.history].slice(0, 4)
      }
    };
    nextFactions = applyBilateralRelationDelta(nextFactions, reaction.factionId, reaction.counterpartyFactionId, reaction.relationDelta);
  }

  return nextFactions;
}

function applyStartingResourceLedger(state: GameState, storedResources: GameState["buildings"][number]["storedResources"]): GameState["resources"] {
  let resources = state.resources;

  for (const [resourceId, amount] of Object.entries(storedResources) as [keyof typeof storedResources, number][]) {
    if (!amount) {
      continue;
    }
    resources = {
      ...resources,
      [resourceId]: {
        ...resources[resourceId],
        amount: resources[resourceId].amount + amount,
        trend: amount
      }
    };
  }

  return resources;
}

function enrichConsultationPreview(
  consultation: NonNullable<GameState["consultation"]["current"]>,
  pythia: GameState["pythia"]
): NonNullable<GameState["consultation"]["current"]> {
  const tileById = new Map(consultation.tilePool.map((tile) => [tile.id, tile]));
  const placedTiles = consultation.placedTileIds
    .map((tileId) => tileById.get(tileId))
    .filter((tile): tile is NonNullable<GameState["consultation"]["current"]>["tilePool"][number] => Boolean(tile));
  const depthSummary = buildProphecyDepthSummary({
    tiles: placedTiles,
    omenReports: consultation.omenReports,
    score: consultation.scorePreview,
    pythia
  });

  return {
    ...consultation,
    scorePreview: {
      ...consultation.scorePreview,
      depth: depthSummary.depth,
      depthBand: depthSummary.depthBand
    }
  };
}

function buildLogisticsLabScenario(seed: number): GameState {
  const baseState = createInitialState(seed);
  const roads = Array.from({ length: 14 }, (_, index) => ({ x: 27 + index, y: 50 }));
  const priestQuarters = createBuildingAt("priest_quarters", { x: 28, y: 49 }, "building-logistics-quarters");
  const westStorehouse = {
    ...createBuildingAt("storehouse", { x: 29, y: 49 }, "building-logistics-storehouse-west"),
    storedResources: {
      olive_oil: 15,
      incense: 7,
      grain: 18,
      olives: 9,
      papyrus: 4
    }
  };
  const granary = {
    ...createBuildingAt("granary", { x: 30, y: 49 }, "building-logistics-granary"),
    storedResources: {
      grain: 2,
      bread: 0
    }
  };
  const spring = {
    ...createBuildingAt("castalian_spring", { x: 31, y: 49 }, "building-logistics-spring"),
    assignedPriestIds: ["priest-1"],
    storedResources: {
      sacred_water: 10
    }
  };
  const kitchen = {
    ...createBuildingAt("kitchen", { x: 32, y: 49 }, "building-logistics-kitchen"),
    storedResources: {
      grain: 0.2,
      bread: 0
    }
  };
  const sanctum = {
    ...createBuildingAt("inner_sanctum", { x: 33, y: 49 }, "building-logistics-sanctum"),
    assignedPriestIds: ["priest-1"],
    storedResources: {
      incense: 0.2,
      sacred_water: 0.2
    }
  };
  const altar = {
    ...createBuildingAt("sacrificial_altar", { x: 34, y: 49 }, "building-logistics-altar"),
    assignedPriestIds: ["priest-1"],
    storedResources: {
      sacred_animals: 0,
      incense: 0
    }
  };
  const brazier = {
    ...createBuildingAt("eternal_flame_brazier", { x: 35, y: 49 }, "building-logistics-brazier"),
    assignedPriestIds: ["priest-1"],
    storedResources: {
      olive_oil: 0.3
    }
  };
  const incenseStore = {
    ...createBuildingAt("incense_store", { x: 36, y: 49 }, "building-logistics-incense-store"),
    storedResources: {
      incense: 0.3,
      papyrus: 0.4
    }
  };
  const olivePress = {
    ...createBuildingAt("olive_press", { x: 37, y: 49 }, "building-logistics-olive-press"),
    storedResources: {
      olives: 0.4,
      olive_oil: 0.1
    }
  };
  const animalPen = {
    ...createBuildingAt("animal_pen", { x: 38, y: 49 }, "building-logistics-animal-pen"),
    storedResources: {
      grain: 0.4,
      sacred_animals: 1
    }
  };
  const eastStorehouse = {
    ...createBuildingAt("storehouse", { x: 39, y: 49 }, "building-logistics-storehouse-east"),
    storedResources: {
      olive_oil: 0.2,
      incense: 0.1,
      grain: 1,
      olives: 0,
      bread: 0
    }
  };

  return {
    ...baseState,
    clock: {
      ...baseState.clock,
      day: 10,
      month: 1,
      tick: (10 - 1) * baseState.clock.ticksPerDay,
      tickOfDay: 0
    },
    grid: {
      ...baseState.grid,
      roads
    },
    resources: {
      ...baseState.resources,
      gold: {
        ...baseState.resources.gold,
        amount: 164
      },
      sacred_water: {
        ...baseState.resources.sacred_water,
        amount: 40
      },
      olive_oil: {
        ...baseState.resources.olive_oil,
        amount: 34
      },
      incense: {
        ...baseState.resources.incense,
        amount: 16
      },
      grain: {
        ...baseState.resources.grain,
        amount: 58
      },
      olives: {
        ...baseState.resources.olives,
        amount: 14
      },
      bread: {
        ...baseState.resources.bread,
        amount: 0
      },
      sacred_animals: {
        ...baseState.resources.sacred_animals,
        amount: 2
      },
      papyrus: {
        ...baseState.resources.papyrus,
        amount: 6
      }
    },
    buildings: [priestQuarters, westStorehouse, granary, spring, kitchen, sanctum, altar, brazier, incenseStore, olivePress, animalPen, eastStorehouse],
    walkers: baseState.walkers.map((walker) => {
      if (walker.role === "priest") {
        return {
          ...walker,
          tile: { x: 28, y: 49 },
          homeBuildingId: priestQuarters.id
        };
      }
      if (walker.role === "custodian") {
        return {
          ...walker,
          tile: { x: 35, y: 50 }
        };
      }
      if (walker.role === "carrier") {
        return {
          ...walker,
          tile: { x: 29, y: 50 },
          homeBuildingId: westStorehouse.id
        };
      }
      return walker;
    }),
    priests: baseState.priests.map((priest) => ({
      ...priest,
      homeBuildingId: priestQuarters.id,
      currentAssignmentBuildingId: spring.id
    })),
    ui: {
      activeTool: "select",
      selectedEntityId: kitchen.id,
      selectedEntityKind: "building"
    },
    eventFeed: [
      {
        id: "event-logistics-lab",
        day: 10,
        text: "The quartermasters prepare a strained logistics exercise with two storehouses and multiple production chains straining the carriers at once."
      }
    ],
    resourceJobs: [],
    nextId: 40
  };
}

function buildCampaignLabScenario(seed: number): GameState {
  const baseState = createInitialState(seed);
  const day = 45;
  const tick = (day - 1) * baseState.clock.ticksPerDay;

  return {
    ...baseState,
    clock: {
      ...baseState.clock,
      day,
      month: 2,
      tick,
      tickOfDay: 0
    },
    campaign: syncCampaignState(
      {
        ...baseState.campaign,
        reputation: {
          ...baseState.campaign.reputation,
          score: 24
        },
        treasury: {
          ...baseState.campaign.treasury,
          totalGoldInvested: 110,
          nextMilestoneGold: 180
        },
        patronMilestones: ["Secured the first ring of local patrons."],
        worldMap: {
          ...baseState.campaign.worldMap,
          selectedNodeId: "corinth",
          activePressures: [
            {
              id: "pressure-corinth-caravans",
              factionId: "corinth",
              nodeId: "corinth",
              kind: "trade",
              severity: "rising",
              value: 56
            }
          ],
          crisisChains: [
            {
              id: "crisis-grain-corridor",
              label: "Grain Corridor Friction",
              nodeId: "corinth",
              factionId: "corinth",
              stage: "rumor",
              pressure: 42,
              stepsCompleted: 1
            }
          ]
        }
      },
      day
    ),
    eventFeed: [
      {
        id: "event-campaign-lab",
        day,
        text: "Delphi's name is starting to travel. Regional merchants and patrons now watch its fortunes."
      },
      ...baseState.eventFeed
    ].slice(0, 8)
  };
}

function buildWorldMapLabScenario(seed: number): GameState {
  const baseState = buildCampaignLabScenario(seed);
  const day = 72;

  return {
    ...baseState,
    clock: {
      ...baseState.clock,
      day,
      month: 3,
      tick: (day - 1) * baseState.clock.ticksPerDay,
      tickOfDay: 0
    },
    campaign: syncCampaignState(
      {
        ...baseState.campaign,
        reputation: {
          ...baseState.campaign.reputation,
          score: 58
        },
        treasury: {
          ...baseState.campaign.treasury,
          completed: 1,
          totalGoldInvested: 210,
          nextMilestoneGold: 300,
          lastDedicationDay: 61
        },
        patronMilestones: [
          ...baseState.campaign.patronMilestones,
          "Dedicated the first treasury offering to secure wider Hellenic notice."
        ],
        worldMap: {
          ...baseState.campaign.worldMap,
          selectedNodeId: "athens",
          activePressures: [
            {
              id: "pressure-athens-fleet",
              factionId: "athens",
              nodeId: "athens",
              kind: "conflict",
              severity: "critical",
              value: 81
            },
            {
              id: "pressure-sparta-border",
              factionId: "sparta",
              nodeId: "sparta",
              kind: "consultation",
              severity: "rising",
              value: 64
            }
          ],
          crisisChains: [
            {
              id: "crisis-athens-sparta",
              label: "League Fracture",
              nodeId: "athens",
              factionId: "athens",
              stage: "active",
              pressure: 74,
              stepsCompleted: 2
            }
          ]
        },
        winCondition: {
          ...baseState.campaign.winCondition,
          completed: false
        }
      },
      day
    ),
    eventFeed: [
      {
        id: "event-world-map-lab",
        day,
        text: "The wider Greek world is now leaning on Delphi, and one regional crisis chain is gathering force."
      },
      ...baseState.eventFeed
    ].slice(0, 8)
  };
}

export function reduceCommand(state: GameState, command: GameCommand): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let nextState = state;

  switch (command.type) {
    case "PlaceRoadCommand": {
      if (!isTileOpen(nextState, command.tile)) {
        return { state, events };
      }
      // Check terrain buildability for road placement
      const roadTerrain = resolveTileTerrain(
        nextState.worldSeed,
        command.tile.x,
        command.tile.y,
        nextState.grid.terrainOverrides,
        nextState.grid.width,
        nextState.grid.height
      );
      if (!isBuildableTerrain(roadTerrain)) {
        return { state, events };
      }

      nextState = {
        ...nextState,
        grid: {
          ...nextState.grid,
          roads: [...nextState.grid.roads, command.tile]
        }
      };
      nextState = nextStateWithEvent(nextState, `Sacred Way extended to (${command.tile.x}, ${command.tile.y}).`);
      events.push({ type: "BuildingPlaced", buildingId: `road-${command.tile.x}-${command.tile.y}`, defId: "sacred_way" });
      break;
    }
    case "PlaceBuildingCommand": {
      const def = buildingDefs[command.defId];
      if (!def) {
        return { state, events };
      }
      // Use footprint-aware placement check
      if (
        !canPlaceBuilding(nextState, command.defId as BuildingDefId, command.tile) ||
        !hasSacredWay(nextState) ||
        !isFootprintAdjacentToRoad(nextState, command.defId as BuildingDefId, command.tile)
      ) {
        return { state, events };
      }

      // Check tech requirement (explicit requiredTech on building def)
      if (def.requiredTech) {
        const completedTechs = nextState.research?.completedTechIds ?? [];
        if (!completedTechs.includes(def.requiredTech)) {
          return { state, events };
        }
      }

      // Check unlock_building tech effect requirement
      if (!isBuildingTechUnlocked(nextState, command.defId)) {
        return { state, events };
      }

      // Check terrain deposit proximity requirement
      if (def.requiredNearbyTerrain) {
        const deposits = nextState.grid.terrainDeposits ?? {};
        if (!hasDepositInRange(deposits, command.tile, def.requiredNearbyTerrain.depositType, def.requiredNearbyTerrain.maxDistance)) {
          return { state, events };
        }
      }

      // Check gold affordability
      if (nextState.resources.gold.amount < def.costGold) {
        return { state, events };
      }

      // Check material resource affordability
      const costResources = def.costResources ?? {};
      for (const [resourceId, amount] of Object.entries(costResources)) {
        if ((nextState.resources[resourceId as keyof typeof nextState.resources] as { amount: number } | undefined)?.amount ?? 0 < (amount ?? 0)) {
          return { state, events };
        }
      }

      const buildingId = `building-${nextState.nextId}`;
      const building = createBuildingAt(command.defId, command.tile, buildingId);
      const underConstruction = isBuildingUnderConstruction(building);

      // Deduct gold
      let updatedResources = {
        ...nextState.resources,
        gold: {
          ...nextState.resources.gold,
          amount: Math.max(0, nextState.resources.gold.amount - def.costGold),
          trend: -def.costGold
        }
      };

      // Deduct material costs
      for (const [resourceId, amount] of Object.entries(costResources)) {
        const key = resourceId as keyof typeof updatedResources;
        const current = updatedResources[key] as { amount: number; capacity: number; trend: number };
        if (current) {
          updatedResources = {
            ...updatedResources,
            [key]: { ...current, amount: Math.max(0, current.amount - (amount ?? 0)) }
          };
        }
      }

      nextState = {
        ...nextState,
        buildings: [...nextState.buildings, building],
        nextId: nextState.nextId + 1,
        resources: underConstruction
          ? updatedResources
          : applyStartingResourceLedger({ ...nextState, resources: updatedResources }, building.storedResources)
      };

      if (command.defId === "priest_quarters" && !nextState.priests[0]?.homeBuildingId) {
        nextState = {
          ...nextState,
          priests: nextState.priests.map((priest, index) =>
            index === 0 ? { ...priest, homeBuildingId: buildingId } : priest
          ),
          walkers: nextState.walkers.map((walker) =>
            walker.id === nextState.priests[0]?.walkerId
              ? { ...walker, homeBuildingId: buildingId, tile: { x: command.tile.x, y: command.tile.y } }
              : walker
          )
        };
      }

      nextState = nextStateWithEvent(nextState, underConstruction ? `${def.name} construction begun.` : `${def.name} completed.`);
      events.push({ type: "BuildingPlaced", buildingId, defId: command.defId });
      break;
    }
    case "AssignPriestCommand": {
      const building = nextState.buildings.find((entry) => entry.id === command.buildingId);
      const priest = nextState.priests.find((entry) => entry.id === command.priestId);
      if (!building || !priest) {
        return { state, events };
      }

      nextState = {
        ...nextState,
        buildings: nextState.buildings.map((entry) =>
          entry.id === building.id
            ? { ...entry, assignedPriestIds: Array.from(new Set([...entry.assignedPriestIds, command.priestId])) }
            : entry
        ),
        priests: nextState.priests.map((entry) =>
          entry.id === priest.id ? { ...entry, currentAssignmentBuildingId: building.id } : entry
        )
      };
      events.push({ type: "WalkerAssigned", walkerId: priest.walkerId, buildingId: building.id });
      nextState = nextStateWithEvent(nextState, `${nextState.walkers.find((walker) => walker.id === priest.walkerId)?.name ?? "Priest"} assigned to ${buildingDefs[building.defId].name}.`);
      break;
    }
    case "SetGameSpeedCommand": {
      nextState = {
        ...nextState,
        clock: {
          ...nextState.clock,
          speed: command.speed,
          paused: command.speed === 0
        }
      };
      break;
    }
    case "SetToolCommand": {
      nextState = {
        ...nextState,
        ui: {
          ...nextState.ui,
          activeTool: command.tool
        }
      };
      break;
    }
    case "SelectEntityCommand": {
      nextState = {
        ...nextState,
        ui: {
          ...nextState.ui,
          selectedEntityId: command.entityId,
          selectedEntityKind: command.entityKind
        }
      };
      break;
    }
    case "HoverTileCommand": {
      nextState = {
        ...nextState,
        ui: {
          ...nextState.ui,
          hoveredTile: command.tile
        }
      };
      break;
    }
    case "StartConsultationCommand": {
      const currentConsultation = nextState.consultation.current;
      if (nextState.consultation.mode === "pending" && currentConsultation) {
        const enrichedConsultation = enrichConsultationPreview(currentConsultation, nextState.pythia);
        nextState = {
          ...nextState,
          clock: {
            ...nextState.clock,
            paused: true
          },
          consultation: {
            ...nextState.consultation,
            mode: "open",
            current: enrichedConsultation
          }
        };
        events.push({
          type: "ConsultationStarted",
          consultationId: enrichedConsultation.id,
          factionId: enrichedConsultation.factionId
        });
      }
      break;
    }
    case "PlaceProphecyTileCommand": {
      if (nextState.consultation.mode !== "open" || !nextState.consultation.current) {
        return { state, events };
      }
      const existing = new Set(nextState.consultation.current.placedTileIds);
      existing.add(command.tileId);
      const placedTiles = nextState.consultation.current.tilePool.filter((tile) => existing.has(tile.id));
      const nextScorePreview = scorePlacedTiles(placedTiles, nextState.pythia);
      const depthSummary = buildProphecyDepthSummary({
        tiles: placedTiles,
        omenReports: nextState.consultation.current.omenReports,
        score: nextScorePreview,
        pythia: nextState.pythia
      });
      nextState = {
        ...nextState,
        consultation: {
          ...nextState.consultation,
          current: {
            ...nextState.consultation.current,
            placedTileIds: [...existing],
            scorePreview: {
              ...nextScorePreview,
              depth: depthSummary.depth,
              depthBand: depthSummary.depthBand
            }
          }
        }
      };
      break;
    }
    case "RemoveProphecyTileCommand": {
      if (nextState.consultation.mode !== "open" || !nextState.consultation.current) {
        return { state, events };
      }
      const existing = nextState.consultation.current.placedTileIds.filter((tileId) => tileId !== command.tileId);
      const placedTiles = nextState.consultation.current.tilePool.filter((tile) => existing.includes(tile.id));
      const nextScorePreview = scorePlacedTiles(placedTiles, nextState.pythia);
      const depthSummary = buildProphecyDepthSummary({
        tiles: placedTiles,
        omenReports: nextState.consultation.current.omenReports,
        score: nextScorePreview,
        pythia: nextState.pythia
      });
      nextState = {
        ...nextState,
        consultation: {
          ...nextState.consultation,
          current: {
            ...nextState.consultation.current,
            placedTileIds: existing,
            scorePreview: {
              ...nextScorePreview,
              depth: depthSummary.depth,
              depthBand: depthSummary.depthBand
            }
          }
        }
      };
      break;
    }
    case "DeliverProphecyCommand": {
      const currentConsultation = nextState.consultation.current;
      if (nextState.consultation.mode !== "open" || !currentConsultation) {
        return { state, events };
      }

      const placedTiles = currentConsultation.tilePool.filter((tile) => currentConsultation.placedTileIds.includes(tile.id));
      if (placedTiles.length < 3) {
        return { state, events };
      }

      const score = scorePlacedTiles(placedTiles, nextState.pythia);
      let depthSummary = buildProphecyDepthSummary({
        tiles: placedTiles,
        omenReports: currentConsultation.omenReports,
        score,
        pythia: nextState.pythia
      });

      // Scroll consultation bonus — knowledge economy enhances clarity
      let scrollClarityBonus = 0;
      let scrollsConsumed = 0;
      const scrollAmount = nextState.resources.scrolls?.amount ?? 0;
      if (scrollAmount >= 5) {
        scrollClarityBonus = Math.round(score.clarity * 0.08);
        scrollsConsumed = 1;
      } else if (scrollAmount >= 2) {
        scrollClarityBonus = Math.round(score.clarity * 0.04);
        scrollsConsumed = 1;
      }
      if (scrollsConsumed > 0) {
        score.clarity += scrollClarityBonus;
        depthSummary = buildProphecyDepthSummary({
          tiles: placedTiles,
          omenReports: currentConsultation.omenReports,
          score,
          pythia: nextState.pythia
        });
        nextState = {
          ...nextState,
          resources: {
            ...nextState.resources,
            scrolls: {
              ...nextState.resources.scrolls,
              amount: nextState.resources.scrolls.amount - scrollsConsumed,
              trend: -scrollsConsumed
            }
          }
        };
      }

      const prophecyId = `prophecy-${nextState.nextId}`;
      const absoluteDay = getAbsoluteDay(nextState.clock);
      const scaffold = buildProphecyScaffold(placedTiles);
      const record = {
        id: prophecyId,
        factionId: currentConsultation.factionId,
        dayIssued: absoluteDay,
        text: placedTiles.map((tile) => tile.text).join(" "),
        tileIds: placedTiles.map((tile) => tile.id),
        semantics: placedTiles.map((tile) => tile.semantics),
        clarity: score.clarity,
        value: score.value,
        risk: score.risk,
        depth: depthSummary.depth,
        depthBand: depthSummary.depthBand,
        omenReliability: depthSummary.omenReliability,
        omenConsensus: depthSummary.omenConsensus,
        scaffold,
        dueDay: absoluteDay + 20,
        resolved: false
      };
      const interpretation = buildProphecyInterpretation(nextState, {
        factionId: record.factionId,
        semantics: record.semantics,
        depth: record.depth,
        depthBand: record.depthBand,
        risk: record.risk,
        value: record.value,
        dayIssued: record.dayIssued,
        dueDay: record.dueDay
      });
      const faction = nextState.factions[currentConsultation.factionId];
      const diplomaticBonus = nextState.pythia.traits.includes("diplomatic") ? 1 : 0;
      let credibilityDelta = score.value >= 60 && score.risk < 75 ? 8 + diplomaticBonus : score.risk >= 85 ? -6 : 3 + diplomaticBonus;
      // Apply credibility_bonus from completed techs (only to positive gains)
      if (credibilityDelta > 0) {
        let credibilityMultiplier = 1;
        for (const techId of nextState.research?.completedTechIds ?? []) {
          const td = techDefById[techId];
          if (!td) continue;
          for (const eff of td.effects) {
            if (eff.kind === "credibility_bonus") credibilityMultiplier *= eff.multiplier;
          }
        }
        credibilityDelta = Math.round(credibilityDelta * credibilityMultiplier);
      }
      const consequence = createConsequence(nextState, prophecyId, currentConsultation.factionId, record.semantics);
      // --- Prophecy Feedback: set initial belief strength and generate reinterpretations ---
      const initialBeliefStrength = record.clarity ?? 50;
      const reinterpretations = generateReinterpretations(nextState, { ...record, interpretation });

      const consultationNote = `Day ${nextState.clock.day}: Delphi answered ${faction.name} with a ${score.risk >= 80 ? "dangerously specific" : score.value >= 70 ? "persuasive" : "guarded"} prophecy.`;
      const factionsWithHistory = appendFactionHistory(nextState, faction.id, consultationNote);
      const observerReactions = evaluateDeliveryObservers(nextState, faction.id, record.semantics, score);
      const factionsWithObservers = applyObserverReactions(factionsWithHistory, observerReactions);

      nextState = {
        ...nextState,
        nextId: nextState.nextId + 1,
        resources: {
          ...nextState.resources,
          gold: {
            ...nextState.resources.gold,
            amount: nextState.resources.gold.amount + currentConsultation.paymentOffered,
            trend: currentConsultation.paymentOffered
          }
        },
        factions: {
          ...factionsWithObservers,
          [faction.id]: {
            ...factionsWithObservers[faction.id],
            credibility: Math.max(0, Math.min(100, faction.credibility + credibilityDelta)),
            favour: Math.max(0, Math.min(100, faction.favour + (score.value > 55 ? 4 + diplomaticBonus : -2)))
          }
        },
        consultation: {
          mode: "idle",
          history: [{ ...record, interpretation, beliefStrength: initialBeliefStrength, reinterpretations }, ...nextState.consultation.history],
          current: undefined
        },
        consequences: [consequence, ...nextState.consequences],
        pythia: {
          ...nextState.pythia,
          needs: {
            ...nextState.pythia.needs,
            purification: Math.max(0, nextState.pythia.needs.purification - 18),
            rest: Math.min(100, nextState.pythia.needs.rest + 18)
          }
        },
        clock: {
          ...nextState.clock,
          paused: false
        }
      };

      const deliveryNarration = narrateProphecyDelivery(record, faction.name, nextState.worldSeed + absoluteDay);
      nextState = nextStateWithEvent(nextState, deliveryNarration);
      nextState = nextStateWithEvent(nextState, `Sacred Record inscribed: ${depthSummary.depthBand} depth, ${depthSummary.omenConsensus} omens.`);
      if (scrollsConsumed > 0) {
        nextState = nextStateWithEvent(nextState, `Ancient scrolls guided the prophecy \u2014 clarity enhanced by ${scrollClarityBonus}.`);
      }
      if (observerReactions[0]) {
        nextState = nextStateWithEvent(nextState, observerReactions[0].historyEntry);
      }
      events.push({ type: "ProphecyDelivered", prophecyId: record.id, factionId: record.factionId });
      events.push({ type: "CredibilityChanged", factionId: faction.id, delta: credibilityDelta });

      // --- Knowledge generation from consultation depth ---
      let knowledgeFromDepth = 0;
      if (depthSummary.depthBand === "deep") knowledgeFromDepth = 1;
      else if (depthSummary.depthBand === "oracular") knowledgeFromDepth = 2;
      if (knowledgeFromDepth > 0) {
        nextState = {
          ...nextState,
          resources: {
            ...nextState.resources,
            knowledge: {
              ...nextState.resources.knowledge,
              amount: nextState.resources.knowledge.amount + knowledgeFromDepth,
              trend: knowledgeFromDepth
            }
          }
        };
        nextState = nextStateWithEvent(nextState, `${depthSummary.depthBand === "oracular" ? "Oracular" : "Deep"} prophecy yields +${knowledgeFromDepth} knowledge.`);
      }

      // --- Prophecy Arc creation ---
      const fullRecord = { ...record, interpretation };
      const newArc = createProphecyArc(fullRecord, nextState);
      if (newArc) {
        const existingArcState = nextState.prophecyArcs ?? createInitialProphecyArcState();
        nextState = {
          ...nextState,
          prophecyArcs: {
            ...existingArcState,
            arcs: [newArc, ...existingArcState.arcs]
          }
        };
      }

      // --- Contradiction detection ---
      const contradictionScan = scanForContradictions(nextState, fullRecord);
      if (contradictionScan.contradictions.length > 0) {
        const currentArcState = nextState.prophecyArcs ?? createInitialProphecyArcState();
        nextState = {
          ...nextState,
          advisorMessages: contradictionScan.advisorMessages,
          prophecyArcs: {
            ...currentArcState,
            contradictions: [...contradictionScan.contradictions, ...currentArcState.contradictions],
            totalContradictions: currentArcState.totalContradictions + contradictionScan.contradictions.length
          }
        };
        // Apply credibility impact from contradictions
        for (const contradiction of contradictionScan.contradictions) {
          const credFaction = nextState.factions[faction.id];
          if (credFaction) {
            nextState = {
              ...nextState,
              factions: {
                ...nextState.factions,
                [faction.id]: {
                  ...credFaction,
                  credibility: Math.max(0, credFaction.credibility + contradiction.credibilityImpact)
                }
              }
            };
          }
          nextState = nextStateWithEvent(
            nextState,
            narrateContradiction(contradiction, nextState.worldSeed + contradiction.detectedDay)
          );
        }
      }

      break;
    }
    case "RepairBuildingCommand": {
      const building = nextState.buildings.find((entry) => entry.id === command.buildingId);
      if (!building) {
        return { state, events };
      }
      const repairNeeded = building.maxCondition - building.condition;
      if (repairNeeded < 1) {
        return { state, events };
      }
      const repairCost = Math.ceil(repairNeeded * 0.15);
      if (nextState.resources.gold.amount < repairCost) {
        nextState = nextStateWithEvent(nextState, `Cannot repair ${buildingDefs[building.defId].name}: need ${repairCost} gold.`);
        return { state: nextState, events };
      }
      nextState = {
        ...nextState,
        resources: {
          ...nextState.resources,
          gold: {
            ...nextState.resources.gold,
            amount: nextState.resources.gold.amount - repairCost,
            trend: -repairCost
          }
        },
        buildings: nextState.buildings.map((entry) =>
          entry.id === building.id
            ? { ...entry, condition: entry.maxCondition }
            : entry
        )
      };
      nextState = nextStateWithEvent(nextState, `${buildingDefs[building.defId].name} repaired for ${repairCost} gold.`);
      break;
    }
    case "RestPythiaCommand": {
      const restNeed = nextState.pythia.needs.rest;
      if (restNeed <= 4) {
        return { state, events };
      }

      nextState = {
        ...nextState,
        pythia: {
          ...nextState.pythia,
          mentalClarity: Math.min(100, nextState.pythia.mentalClarity + 8),
          physicalHealth: Math.min(100, nextState.pythia.physicalHealth + 5),
          tranceDepth: Math.max(10, nextState.pythia.tranceDepth - 3),
          needs: {
            ...nextState.pythia.needs,
            rest: Math.max(0, nextState.pythia.needs.rest - 24)
          }
        }
      };
      nextState = nextStateWithEvent(nextState, `${nextState.pythia.name} is given quiet rest and returns steadier to the tripod.`);
      break;
    }
    case "PurifyPythiaCommand": {
      if (nextState.resources.sacred_water.amount < 2 || nextState.resources.incense.amount < 1) {
        nextState = nextStateWithEvent(nextState, "Purification failed: the rite requires 2 sacred water and 1 incense.");
        return { state: nextState, events };
      }

      nextState = {
        ...nextState,
        resources: {
          ...nextState.resources,
          sacred_water: {
            ...nextState.resources.sacred_water,
            amount: nextState.resources.sacred_water.amount - 2,
            trend: -2
          },
          incense: {
            ...nextState.resources.incense,
            amount: nextState.resources.incense.amount - 1,
            trend: -1
          }
        },
        pythia: {
          ...nextState.pythia,
          attunement: Math.min(100, nextState.pythia.attunement + 4),
          mentalClarity: Math.min(100, nextState.pythia.mentalClarity + 6),
          needs: {
            ...nextState.pythia.needs,
            purification: Math.max(0, nextState.pythia.needs.purification - 28)
          }
        }
      };
      nextState = nextStateWithEvent(nextState, `${nextState.pythia.name} undergoes a purification rite with spring water and incense.`);
      break;
    }
    case "StartNewRunCommand": {
      nextState = createInitialState({
        seed: command.seed ?? state.worldSeedText ?? state.worldSeed,
        originId: command.originId ?? state.originId,
        scenarioId: command.scenarioId ?? state.runConfig.scenarioId,
        difficultyId: command.difficultyId ?? state.runConfig.difficultyId,
        pythiaArchetypeId: command.pythiaArchetypeId ?? state.runConfig.pythiaArchetypeId,
        startingRegionId: command.startingRegionId ?? state.runConfig.startingRegionId
      });
      break;
    }
    case "InjectScenarioCommand": {
      if (command.scenario === "foundation") {
        nextState = createInitialState({
          seed: state.worldSeedText ?? state.worldSeed,
          originId: state.originId
        });
      }
      if (command.scenario === "low-incense") {
        nextState = {
          ...nextState,
          resources: {
            ...nextState.resources,
            incense: {
              ...nextState.resources.incense,
              amount: 3
            }
          }
        };
      }
      if (command.scenario === "consultation-ready") {
        const scenarioDay = 15;
        const scenarioMonth = 1;
        const absoluteDayOffset = (nextState.clock.year - 1) * 360 + (scenarioMonth - 1) * 30 + (scenarioDay - 1);
        const stagedState = {
          ...nextState,
          clock: {
            ...nextState.clock,
            day: scenarioDay,
            month: scenarioMonth,
            tick: absoluteDayOffset * nextState.clock.ticksPerDay,
            tickOfDay: 0
          }
        };
        nextState = {
          ...stagedState,
          consultation: {
            ...stagedState.consultation,
            mode: "pending",
            current: (() => {
              const consultation = maybeCreateConsultation(stagedState);
              return consultation ? enrichConsultationPreview(consultation, stagedState.pythia) : consultation;
            })()
          }
        };
      }
      if (command.scenario === "logistics-lab") {
        nextState = buildLogisticsLabScenario(state.worldSeed);
      }
      if (command.scenario === "campaign-lab") {
        nextState = buildCampaignLabScenario(state.worldSeed);
      }
      if (command.scenario === "world-map-lab") {
        nextState = buildWorldMapLabScenario(state.worldSeed);
      }
      break;
    }
    case "IssuePriestDecreeCommand": {
      if (!nextState.priestPolitics) {
        return { state, events };
      }
      if (command.decreeType === "calm") {
        nextState = {
          ...nextState,
          priestPolitics: {
            ...nextState.priestPolitics,
            overallPressure: Math.max(0, nextState.priestPolitics.overallPressure - 5),
            blocs: nextState.priestPolitics.blocs.map((bloc) => ({
              ...bloc,
              tension: Math.max(0, bloc.tension - 10)
            })),
            lastUpdatedDay: nextState.clock.day
          }
        };
      } else if (command.decreeType === "reform") {
        nextState = {
          ...nextState,
          priestPolitics: {
            ...nextState.priestPolitics,
            blocs: nextState.priestPolitics.blocs.map((bloc) =>
              bloc.id === "reformers"
                ? { ...bloc, support: bloc.support + 8 }
                : { ...bloc, tension: bloc.tension + 5 }
            ),
            lastUpdatedDay: nextState.clock.day
          }
        };
      } else if (command.decreeType === "investigate") {
        nextState = {
          ...nextState,
          priestPolitics: {
            ...nextState.priestPolitics,
            overallPressure: nextState.priestPolitics.overallPressure + 3,
            unity: Math.max(0, nextState.priestPolitics.unity - 5),
            lastUpdatedDay: nextState.clock.day
          }
        };
      }
      break;
    }
    case "DismissPriestCommand": {
      const priestToRemove = nextState.priests.find((entry) => entry.id === command.priestId);
      if (!priestToRemove) {
        return { state, events };
      }
      nextState = {
        ...nextState,
        priests: nextState.priests.filter((entry) => entry.id !== command.priestId)
      };
      if (nextState.priestPolitics) {
        const remainingPriests = { ...nextState.priestPolitics.priests };
        delete remainingPriests[command.priestId];
        nextState = {
          ...nextState,
          priestPolitics: {
            ...nextState.priestPolitics,
            overallPressure: nextState.priestPolitics.overallPressure + 10,
            priests: remainingPriests
          }
        };
      }
      break;
    }
    case "EndorseBlocCommand": {
      if (!nextState.priestPolitics) {
        return { state, events };
      }
      nextState = {
        ...nextState,
        priestPolitics: {
          ...nextState.priestPolitics,
          dominantBlocId: command.blocId as PriestCouncilBlocId,
          blocs: nextState.priestPolitics.blocs.map((bloc) =>
            bloc.id === command.blocId
              ? { ...bloc, support: bloc.support + 10 }
              : { ...bloc, support: Math.max(0, bloc.support - 3) }
          )
        }
      };
      break;
    }
    case "AdvanceTickCommand":
    case "SaveGameCommand":
    case "LoadGameCommand": {
      break;
    }
    case "PurchaseTradeOfferCommand": {
      const offer = nextState.tradeOffers.find((entry) => entry.id === command.offerId);
      if (!offer || nextState.resources.gold.amount < offer.price) {
        return { state, events };
      }

      const storehouse = nextState.buildings.find((building) => building.defId === "storehouse");
      nextState = {
        ...nextState,
        tradeOffers: nextState.tradeOffers.filter((entry) => entry.id !== offer.id),
        resources: {
          ...nextState.resources,
          gold: {
            ...nextState.resources.gold,
            amount: nextState.resources.gold.amount - offer.price,
            trend: -offer.price
          },
          [offer.resourceId]: {
            ...nextState.resources[offer.resourceId],
            amount: nextState.resources[offer.resourceId].amount + offer.amount,
            trend: offer.amount
          }
        },
        buildings: nextState.buildings.map((building) =>
          building.id === storehouse?.id
            ? {
                ...building,
                storedResources: {
                  ...building.storedResources,
                  [offer.resourceId]: (building.storedResources[offer.resourceId] ?? 0) + offer.amount
                }
              }
            : building
        )
      };
      nextState = nextStateWithEvent(nextState, `${offer.amount} ${offer.resourceId.replace("_", " ")} purchased from ${offer.factionId} for ${offer.price.toFixed(0)} gold.`);
      events.push({ type: "TradePurchased", offerId: offer.id, resourceId: offer.resourceId, amount: offer.amount });
      break;
    }
    case "BeginExcavationCommand": {
      const excavation = nextState.excavation;
      if (!excavation) {
        return { state, events };
      }
      const site = excavation.sites.find((s) => s.id === command.siteId);
      if (!site || site.status !== "discovered") {
        return { state, events };
      }
      // Find an unassigned priest to work the excavation
      const availablePriest = nextState.priests.find((p) => !p.currentAssignmentBuildingId);
      nextState = {
        ...nextState,
        excavation: {
          ...excavation,
          sites: excavation.sites.map((s): ExcavationSite =>
            s.id === command.siteId
              ? {
                  ...s,
                  status: "excavating",
                  assignedPriestId: availablePriest?.id
                }
              : s
          )
        }
      };
      nextState = nextStateWithEvent(
        nextState,
        `Excavation begun at site (${site.tile.x}, ${site.tile.y}).${availablePriest ? ` ${nextState.walkers.find((w) => w.id === availablePriest.walkerId)?.name ?? "A priest"} oversees the dig.` : ""}`
      );
      break;
    }
    case "ClaimRelicCommand": {
      const excavation = nextState.excavation;
      if (!excavation) {
        return { state, events };
      }
      const site = excavation.sites.find((s) => s.id === command.siteId);
      if (!site) {
        return { state, events };
      }
      const layer = site.layers.find((l) => l.depth === command.layerDepth);
      if (!layer || !layer.revealed || !layer.relicId) {
        return { state, events };
      }
      // Find the pre-generated relic
      const relic = excavation.relics.find((r) => r.id === layer.relicId);
      if (!relic) {
        return { state, events };
      }
      const claimedRelic: Relic = {
        ...relic,
        discoveredDay: nextState.clock.day
      };
      // Add to claimed relics collection
      const newClaimedRelics = [...(excavation.claimedRelics ?? []), claimedRelic];

      nextState = {
        ...nextState,
        excavation: {
          ...excavation,
          sites: excavation.sites.map((s): ExcavationSite =>
            s.id === command.siteId
              ? {
                  ...s,
                  layers: s.layers.map((l) =>
                    l.depth === command.layerDepth
                      ? { ...l, relicId: undefined }
                      : l
                  )
                }
              : s
          ),
          relics: [
            ...excavation.relics.filter((r) => r.id !== layer.relicId),
            claimedRelic
          ],
          claimedRelics: newClaimedRelics
        }
      };
      nextState = nextStateWithEvent(
        nextState,
        `Relic claimed: ${claimedRelic.name} (${claimedRelic.kind}) — ${claimedRelic.effect.type.replace(/_/g, " ")} +${claimedRelic.effect.value}.`
      );

      // Check collection milestones
      const milestoneLabels = [
        { count: 3, label: "Curious Collection" },
        { count: 6, label: "Notable Archive" },
        { count: 10, label: "Renowned Treasury" },
        { count: 15, label: "Legendary Vault" }
      ];
      const milestone = milestoneLabels.find((m) => m.count === newClaimedRelics.length);
      if (milestone) {
        nextState = nextStateWithEvent(
          nextState,
          `Collection milestone reached: "${milestone.label}" (${milestone.count} relics)!`
        );
      }
      break;
    }
    case "ActivateSacredSiteCommand": {
      const excavation = nextState.excavation;
      if (!excavation) {
        return { state, events };
      }
      const sacredSite = excavation.sacredSites.find((s) => s.id === command.siteId);
      if (!sacredSite || !sacredSite.discovered || sacredSite.active) {
        return { state, events };
      }
      // Activation costs: 20 gold + 3 incense
      const goldCost = 20;
      const incenseCost = 3;
      if (nextState.resources.gold.amount < goldCost || nextState.resources.incense.amount < incenseCost) {
        nextState = nextStateWithEvent(nextState, `Cannot activate ${sacredSite.kind.replace(/_/g, " ")}: requires ${goldCost} gold and ${incenseCost} incense.`);
        return { state: nextState, events };
      }
      nextState = {
        ...nextState,
        resources: {
          ...nextState.resources,
          gold: {
            ...nextState.resources.gold,
            amount: nextState.resources.gold.amount - goldCost,
            trend: -goldCost
          },
          incense: {
            ...nextState.resources.incense,
            amount: nextState.resources.incense.amount - incenseCost,
            trend: -incenseCost
          }
        },
        excavation: {
          ...excavation,
          sacredSites: excavation.sacredSites.map((s): SacredSite =>
            s.id === command.siteId
              ? { ...s, active: true }
              : s
          )
        }
      };
      nextState = nextStateWithEvent(
        nextState,
        `Sacred site activated: ${sacredSite.kind.replace(/_/g, " ")} — ${sacredSite.bonuses.map((b) => `${b.type.replace(/_/g, " ")} +${b.value}`).join(", ")}.`
      );
      break;
    }
    case "LaunchEspionageOperationCommand": {
      const espionage = nextState.espionage ?? createInitialEspionageState();
      const agent = espionage.agents.find((a) => a.id === command.agentId);
      if (!agent || agent.compromised) {
        return { state, events };
      }
      const alreadyActive = espionage.operations.some((op) => op.agentId === command.agentId && op.status === "active");
      if (alreadyActive) {
        return { state, events };
      }
      const durationMap: Record<EspionageOperationKind, number> = {
        intercept_prophecy: 5,
        plant_false_omen: 7,
        recruit_informant: 10,
        sabotage_rival: 8,
        protect_oracle: 6,
        seed_philosopher: 12
      };
      const newOperation: EspionageOperation = {
        id: `espionage-op-${nextState.nextId}`,
        kind: command.operationKind,
        agentId: command.agentId,
        targetId: command.targetId,
        startDay: nextState.clock.day,
        duration: durationMap[command.operationKind],
        status: "active"
      };
      nextState = {
        ...nextState,
        nextId: nextState.nextId + 1,
        espionage: {
          ...espionage,
          operations: [...espionage.operations, newOperation]
        }
      };
      nextState = nextStateWithEvent(nextState, `An agent begins a ${command.operationKind.replace(/_/g, " ")} operation.`);
      break;
    }
    case "InvestigatePriestCommand": {
      const priest = nextState.priests.find((p) => p.id === command.priestId);
      if (!priest) {
        return { state, events };
      }
      // Costs 3 political pressure
      if (nextState.priestPolitics) {
        nextState = {
          ...nextState,
          priestPolitics: {
            ...nextState.priestPolitics,
            overallPressure: Math.min(100, nextState.priestPolitics.overallPressure + 3),
            unity: Math.max(0, nextState.priestPolitics.unity - 4)
          }
        };
      }
      const hiddenSecrets = (priest.secrets ?? []).filter((s) => !s.discoveredDay);
      if (hiddenSecrets.length > 0) {
        const secretToReveal = hiddenSecrets[0]!;
        nextState = {
          ...nextState,
          priests: nextState.priests.map((p) =>
            p.id === command.priestId
              ? {
                  ...p,
                  secrets: (p.secrets ?? []).map((s) =>
                    s.id === secretToReveal.id
                      ? { ...s, discoveredDay: nextState.clock.day }
                      : s
                  )
                }
              : p
          )
        };
        const walker = nextState.walkers.find((w) => w.id === priest.walkerId);
        nextState = nextStateWithEvent(nextState, `Investigation reveals ${walker?.name ?? "a priest"} harbors a secret: ${secretToReveal.kind.replace(/_/g, " ")}.`);
      } else {
        const walker = nextState.walkers.find((w) => w.id === priest.walkerId);
        nextState = nextStateWithEvent(nextState, `Investigation of ${walker?.name ?? "the priest"} found nothing of note.`);
      }
      break;
    }
    case "RecruitAgentCommand": {
      const espionageState = nextState.espionage ?? createInitialEspionageState();
      const agentNames = ["Melas", "Kyra", "Nikos", "Thais", "Damastes", "Phila", "Ariston", "Korinna", "Dromon", "Eudoxia"];
      const nameIndex = (nextState.worldSeed + nextState.nextId * 7) % agentNames.length;
      const AGENT_TRAITS: EspionageAgentTrait[] = ["silver_tongue", "shadow_walker", "code_breaker", "double_agent", "master_of_disguise"];
      const traitRoll = (nextState.worldSeed + nextState.nextId * 29) % 100;
      const assignedTrait: EspionageAgentTrait | undefined = traitRoll < 30
        ? AGENT_TRAITS[(nextState.worldSeed + nextState.nextId * 31) % AGENT_TRAITS.length]
        : undefined;
      const agentSkill = 30 + ((nextState.worldSeed + nextState.nextId * 13) % 30);
      // Recruitment cost: base 15 + skill * 0.5
      const recruitCost = Math.round(15 + agentSkill * 0.5);
      if (nextState.resources.gold.amount < recruitCost) {
        nextState = nextStateWithEvent(nextState, `Cannot recruit agent: requires ${recruitCost} gold.`);
        return { state: nextState, events };
      }
      const newAgent: EspionageAgent = {
        id: `agent-${nextState.nextId}`,
        name: agentNames[nameIndex]!,
        cover: command.cover,
        targetFactionId: command.targetFactionId,
        skill: agentSkill,
        loyalty: 50 + ((nextState.worldSeed + nextState.nextId * 19) % 30),
        compromised: false,
        recruitedDay: nextState.clock.day,
        morale: 60,
        experience: 0,
        trait: assignedTrait,
        status: "available",
        missionCooldownDays: 5
      };
      nextState = {
        ...nextState,
        nextId: nextState.nextId + 1,
        resources: {
          ...nextState.resources,
          gold: {
            ...nextState.resources.gold,
            amount: nextState.resources.gold.amount - recruitCost,
            trend: -recruitCost
          }
        },
        espionage: {
          ...espionageState,
          agents: [...espionageState.agents, newAgent],
          networkStrength: Math.min(100, espionageState.networkStrength + 5)
        }
      };
      nextState = nextStateWithEvent(nextState, `A new agent, ${newAgent.name}, has been recruited as a ${command.cover} targeting ${command.targetFactionId}.`);
      break;
    }
    case "DeployAgentCommand": {
      const espionageDeploy = nextState.espionage ?? createInitialEspionageState();
      const deployAgent = espionageDeploy.agents.find((a) => a.id === command.agentId);
      if (!deployAgent) {
        return { state, events };
      }
      // Check agent is available (support both old agents without status and new ones)
      const agentStatus = deployAgent.status ?? (deployAgent.compromised ? "compromised" : "available");
      if (agentStatus !== "available") {
        nextState = nextStateWithEvent(nextState, `Agent ${deployAgent.name} is not available for deployment (${agentStatus}).`);
        return { state: nextState, events };
      }
      // Check cooldown
      if (deployAgent.lastMissionDay !== undefined && deployAgent.missionCooldownDays !== undefined) {
        const cooldownEnd = deployAgent.lastMissionDay + deployAgent.missionCooldownDays;
        if (nextState.clock.day < cooldownEnd) {
          nextState = nextStateWithEvent(nextState, `Agent ${deployAgent.name} is still resting from their last mission.`);
          return { state: nextState, events };
        }
      }
      // Check no active operation
      const alreadyDeployed = espionageDeploy.operations.some((op) => op.agentId === command.agentId && op.status === "active");
      if (alreadyDeployed) {
        return { state, events };
      }
      const deployDurationMap: Record<EspionageOperationKind, number> = {
        intercept_prophecy: 5,
        plant_false_omen: 7,
        recruit_informant: 10,
        sabotage_rival: 8,
        protect_oracle: 6,
        seed_philosopher: 12
      };
      // Pre-calculate success chance and detection risk
      const rivalIntelDeploy = nextState.rivalOracles?.roster.find((r) => r.id === command.targetId)?.intel ?? 30;
      const moraleModDeploy = ((deployAgent.morale ?? 60) - 50) * 0.003;
      const expModDeploy = (deployAgent.experience ?? 0) * 0.002;
      let traitBonusDeploy = 0;
      if (deployAgent.trait === "silver_tongue" && command.operationKind === "recruit_informant") traitBonusDeploy = 0.15;
      if (deployAgent.trait === "code_breaker" && command.operationKind === "intercept_prophecy") traitBonusDeploy = 0.25;
      if (deployAgent.trait === "double_agent" && command.operationKind === "sabotage_rival") traitBonusDeploy = 0.10;
      const baseSuccessDeploy = (deployAgent.skill * 0.6 + espionageDeploy.networkStrength * 0.2 - rivalIntelDeploy * 0.3) / 100;
      const successChance = Math.max(0.15, Math.min(0.85, baseSuccessDeploy + 0.3 + moraleModDeploy + expModDeploy + traitBonusDeploy));
      let detectionReductionDeploy = 0;
      if (deployAgent.trait === "shadow_walker") detectionReductionDeploy = -0.20;
      if (deployAgent.trait === "master_of_disguise") detectionReductionDeploy = -0.15;
      const baseDetectionDeploy = (rivalIntelDeploy * 0.4 - deployAgent.skill * 0.25 - espionageDeploy.networkStrength * 0.1) / 100;
      const detectionRisk = Math.max(0.05, Math.min(0.5, baseDetectionDeploy + 0.1 + detectionReductionDeploy));

      const deployOperation: EspionageOperation = {
        id: `espionage-op-${nextState.nextId}`,
        kind: command.operationKind,
        agentId: command.agentId,
        targetId: command.targetId,
        startDay: nextState.clock.day,
        duration: deployDurationMap[command.operationKind],
        status: "active",
        successChance,
        detectionRisk,
        narrative: [`Agent ${deployAgent.name} has been deployed on a ${command.operationKind.replace(/_/g, " ")} mission.`]
      };
      nextState = {
        ...nextState,
        nextId: nextState.nextId + 1,
        espionage: {
          ...espionageDeploy,
          operations: [...espionageDeploy.operations, deployOperation],
          agents: espionageDeploy.agents.map((a) =>
            a.id === command.agentId
              ? { ...a, status: "deployed" as const }
              : a
          )
        }
      };
      nextState = nextStateWithEvent(nextState, `Agent ${deployAgent.name} deployed on a ${command.operationKind.replace(/_/g, " ")} operation.`);
      break;
    }
    case "RecallAgentCommand": {
      const espionageRecall = nextState.espionage ?? createInitialEspionageState();
      const recallAgent = espionageRecall.agents.find((a) => a.id === command.agentId);
      if (!recallAgent) {
        return { state, events };
      }
      // Abort any active operation
      const activeOp = espionageRecall.operations.find((op) => op.agentId === command.agentId && op.status === "active");
      const updatedOps = activeOp
        ? espionageRecall.operations.map((op) =>
            op.id === activeOp.id ? { ...op, status: "failed" as const, result: "Operation aborted: agent recalled." } : op
          )
        : espionageRecall.operations;
      nextState = {
        ...nextState,
        espionage: {
          ...espionageRecall,
          operations: updatedOps,
          agents: espionageRecall.agents.map((a) =>
            a.id === command.agentId
              ? {
                  ...a,
                  status: "available" as const,
                  morale: Math.max(0, (a.morale ?? 60) - 5),
                  lastMissionDay: nextState.clock.day
                }
              : a
          )
        }
      };
      nextState = nextStateWithEvent(nextState, `Agent ${recallAgent.name} has been recalled from their mission.`);
      break;
    }
    case "RansomAgentCommand": {
      const espionageRansom = nextState.espionage ?? createInitialEspionageState();
      const ransomAgent = espionageRansom.agents.find((a) => a.id === command.agentId);
      if (!ransomAgent) {
        return { state, events };
      }
      const ransomStatus = ransomAgent.status ?? (ransomAgent.compromised ? "compromised" : "available");
      if (ransomStatus !== "captured") {
        nextState = nextStateWithEvent(nextState, `Agent ${ransomAgent.name} is not captured and cannot be ransomed.`);
        return { state: nextState, events };
      }
      // Ransom cost: 10 + experience * 0.5
      const ransomCost = Math.round(10 + (ransomAgent.experience ?? 0) * 0.5);
      if (nextState.resources.gold.amount < ransomCost) {
        nextState = nextStateWithEvent(nextState, `Cannot ransom agent: requires ${ransomCost} gold.`);
        return { state: nextState, events };
      }
      nextState = {
        ...nextState,
        resources: {
          ...nextState.resources,
          gold: {
            ...nextState.resources.gold,
            amount: nextState.resources.gold.amount - ransomCost,
            trend: -ransomCost
          }
        },
        espionage: {
          ...espionageRansom,
          agents: espionageRansom.agents.map((a) =>
            a.id === command.agentId
              ? {
                  ...a,
                  status: "available" as const,
                  compromised: false,
                  loyalty: Math.max(0, a.loyalty - 15),
                  morale: Math.max(0, (a.morale ?? 60) - 20)
                }
              : a
          )
        }
      };
      nextState = nextStateWithEvent(nextState, `Agent ${ransomAgent.name} has been ransomed for ${ransomCost} gold.`);
      break;
    }
    case "InterrogateAgentCommand": {
      const espionageInterrogate = nextState.espionage ?? createInitialEspionageState();
      const interrogateTarget = espionageInterrogate.agents.find((a) => a.id === command.agentId);
      if (!interrogateTarget) {
        return { state, events };
      }
      const interrogateStatus = interrogateTarget.status ?? (interrogateTarget.compromised ? "compromised" : "available");
      if (interrogateStatus !== "captured") {
        nextState = nextStateWithEvent(nextState, `Agent ${interrogateTarget.name} is not captured and cannot be interrogated.`);
        return { state: nextState, events };
      }
      // Delegate to the interrogation function
      nextState = interrogateAgent(nextState, command.agentId);
      break;
    }
    case "TriggerEndOfRunCommand": {
      const legacy = nextState.legacy ?? createInitialLegacyState();
      const score = computeLegacyScore(nextState);
      const artifact = generateLegacyArtifact(nextState);
      nextState = {
        ...nextState,
        legacy: {
          ...legacy,
          phase: "terminal",
          legacyScore: score,
          legacyArtifact: artifact
        },
        clock: {
          ...nextState.clock,
          paused: true,
          speed: 0
        }
      };
      nextState = nextStateWithEvent(nextState, "The oracle's story has ended. A legacy artifact has been generated.");
      break;
    }
    case "BeginLegendaryConsultationCommand": {
      const legendaryDef = legendaryConsultationDefs[command.consultationId];
      if (!legendaryDef) {
        return { state, events };
      }
      const available = nextState.availableLegendary ?? [];
      if (!available.includes(command.consultationId)) {
        return { state, events };
      }
      const existingProgress = nextState.legendaryProgress ?? [];
      const alreadyStarted = existingProgress.some(
        (p) => p.consultationId === command.consultationId
      );
      if (alreadyStarted) {
        return { state, events };
      }
      const newProgress: LegendaryConsultationProgress = {
        consultationId: command.consultationId,
        currentStage: 0,
        startDay: nextState.clock.day,
        completed: false
      };
      nextState = {
        ...nextState,
        legendaryProgress: [...existingProgress, newProgress]
      };
      nextState = nextStateWithEvent(
        nextState,
        `${legendaryDef.figure} has begun a legendary consultation at the oracle.`
      );
      break;
    }
    case "AdvanceLegendaryStageCommand": {
      const advDef = legendaryConsultationDefs[command.consultationId];
      if (!advDef) {
        return { state, events };
      }
      const progress = (nextState.legendaryProgress ?? []).find(
        (p) => p.consultationId === command.consultationId && !p.completed
      );
      if (!progress) {
        return { state, events };
      }
      const nextStageIndex = progress.currentStage + 1;
      const isFinalStage = nextStageIndex >= advDef.stages.length;

      if (isFinalStage) {
        const reward = advDef.reward;
        const updatedProgress = (nextState.legendaryProgress ?? []).map((p) =>
          p.consultationId === command.consultationId
            ? { ...p, currentStage: nextStageIndex, completed: true, completedDay: nextState.clock.day }
            : p
        );
        let updatedFactions = { ...nextState.factions };
        for (const factionId of Object.keys(updatedFactions) as Array<keyof typeof updatedFactions>) {
          const faction = updatedFactions[factionId];
          updatedFactions = {
            ...updatedFactions,
            [factionId]: {
              ...faction,
              credibility: Math.min(100, faction.credibility + Math.round(reward.credibilityBonus / Object.keys(updatedFactions).length))
            }
          };
        }
        const updatedResources = {
          ...nextState.resources,
          gold: {
            ...nextState.resources.gold,
            amount: nextState.resources.gold.amount + reward.goldBonus
          }
        };
        const updatedCampaign = {
          ...nextState.campaign,
          reputation: {
            ...nextState.campaign.reputation,
            score: nextState.campaign.reputation.score + reward.reputationBonus
          }
        };
        nextState = {
          ...nextState,
          legendaryProgress: updatedProgress,
          factions: updatedFactions,
          resources: updatedResources,
          campaign: updatedCampaign,
          advisorMessages: [
            {
              id: `advisor-legendary-${command.consultationId}-complete`,
              advisorId: "hierophant",
              text: `The legendary consultation with ${advDef.figure} is complete! The oracle's fame echoes across the Hellenic world. +${reward.goldBonus} gold, +${reward.reputationBonus} reputation.`,
              severity: "info" as const
            },
            ...nextState.advisorMessages
          ].slice(0, 4)
        };
        nextState = nextStateWithEvent(
          nextState,
          `${advDef.figure} departs, satisfied. The oracle has gained legendary renown.`
        );
      } else {
        const updatedProgress = (nextState.legendaryProgress ?? []).map((p) =>
          p.consultationId === command.consultationId
            ? { ...p, currentStage: nextStageIndex }
            : p
        );
        const nextStageDef = advDef.stages[nextStageIndex];
        nextState = {
          ...nextState,
          legendaryProgress: updatedProgress,
          advisorMessages: [
            {
              id: `advisor-legendary-${command.consultationId}-stage-${nextStageIndex}`,
              advisorId: "hierophant",
              text: `${advDef.figure} poses another question. ${nextStageDef?.hint ?? "Consider your response carefully."}`,
              severity: "info" as const
            },
            ...nextState.advisorMessages
          ].slice(0, 4)
        };
        nextState = nextStateWithEvent(
          nextState,
          `${advDef.figure} leans forward with another question for the oracle.`
        );
      }
      break;
    }
    case "StartNewLineageRunCommand": {
      // Preserve existing lineage across runs
      const previousLineage = nextState.lineage ?? createInitialLineageState();
      const newState = createInitialState({
        seed: command.seedText,
        originId: command.originId
      });

      // Apply burden effects
      let burdenedState = { ...newState };
      const activeBurdens: BurdenId[] = [...command.burdens];

      for (const burdenId of activeBurdens) {
        switch (burdenId) {
          case "no_trade": {
            const updatedFactions = { ...burdenedState.factions };
            for (const fid of Object.keys(updatedFactions) as Array<keyof typeof updatedFactions>) {
              updatedFactions[fid] = { ...updatedFactions[fid], tradeAccess: false };
            }
            burdenedState = { ...burdenedState, factions: updatedFactions };
            break;
          }
          case "hostile_factions": {
            const updatedFactions = { ...burdenedState.factions };
            for (const fid of Object.keys(updatedFactions) as Array<keyof typeof updatedFactions>) {
              const f = updatedFactions[fid];
              updatedFactions[fid] = {
                ...f,
                credibility: Math.max(0, f.credibility - 15),
                favour: Math.max(0, f.favour - 10)
              };
            }
            burdenedState = { ...burdenedState, factions: updatedFactions };
            break;
          }
          case "fragile_pythia": {
            burdenedState = {
              ...burdenedState,
              pythia: {
                ...burdenedState.pythia,
                physicalHealth: Math.max(10, burdenedState.pythia.physicalHealth - 25),
                mentalClarity: Math.max(10, burdenedState.pythia.mentalClarity - 20),
                attunement: Math.max(10, burdenedState.pythia.attunement - 10)
              }
            };
            break;
          }
          case "scarce_resources": {
            const updatedResources = { ...burdenedState.resources };
            for (const [key, value] of Object.entries(updatedResources) as Array<[keyof typeof updatedResources, typeof updatedResources[keyof typeof updatedResources]]>) {
              updatedResources[key] = {
                ...value,
                amount: Math.floor(value.amount * 0.5),
                capacity: Math.floor(value.capacity * 0.75)
              };
            }
            burdenedState = { ...burdenedState, resources: updatedResources };
            break;
          }
          case "aggressive_rivals": {
            if (burdenedState.rivalOracles) {
              const updatedRoster = burdenedState.rivalOracles.roster.map((rival) => ({
                ...rival,
                pressure: Math.min(rival.pressureCap, rival.pressure + 25),
                intrigue: Math.min(100, rival.intrigue + 15)
              }));
              burdenedState = {
                ...burdenedState,
                rivalOracles: {
                  ...burdenedState.rivalOracles,
                  roster: updatedRoster,
                  totalPressure: updatedRoster.reduce((sum, r) => sum + r.pressure, 0)
                }
              };
            }
            break;
          }
          case "short_seasons":
            // Effect is checked in decline.ts — lower thresholds
            break;
          case "hostile_philosophers": {
            if (burdenedState.philosophers) {
              const nextByFaction = { ...burdenedState.philosophers.byFaction };
              for (const fid of Object.keys(nextByFaction) as Array<keyof typeof nextByFaction>) {
                const threat = nextByFaction[fid];
                nextByFaction[fid] = {
                  ...threat,
                  pressure: Math.min(100, Math.round(threat.pressure * 1.2)),
                  influence: Math.min(100, Math.round(threat.influence * 1.2))
                };
              }
              burdenedState = {
                ...burdenedState,
                philosophers: {
                  ...burdenedState.philosophers,
                  byFaction: nextByFaction
                }
              };
            }
            break;
          }
          case "unstable_weather":
            // Effect is checked in festivals.ts — more severe weather events
            break;
          case "aggressive_patrons": {
            // Patron satisfaction starts lower
            const updatedPatrons = (burdenedState.patrons ?? []).map((p) => ({
              ...p,
              satisfactionScore: Math.max(0, p.satisfactionScore - 20)
            }));
            burdenedState = { ...burdenedState, patrons: updatedPatrons };
            break;
          }
          case "expensive_construction":
            // Effect is checked in building placement — costs +30%
            break;
          case "weak_spring": {
            burdenedState = {
              ...burdenedState,
              resources: {
                ...burdenedState.resources,
                sacred_water: {
                  ...burdenedState.resources.sacred_water,
                  capacity: Math.floor(burdenedState.resources.sacred_water.capacity * 0.75),
                  amount: Math.floor(burdenedState.resources.sacred_water.amount * 0.75)
                }
              }
            };
            break;
          }
          case "rival_oracle_surge": {
            if (burdenedState.rivalOracles) {
              const updatedRoster = burdenedState.rivalOracles.roster.map((rival) => ({
                ...rival,
                pressure: Math.min(rival.pressureCap, Math.max(40, rival.pressure))
              }));
              burdenedState = {
                ...burdenedState,
                rivalOracles: {
                  ...burdenedState.rivalOracles,
                  roster: updatedRoster,
                  totalPressure: updatedRoster.reduce((sum, r) => sum + r.pressure, 0)
                }
              };
            }
            break;
          }
        }
      }

      // Apply carryover bonuses from lineage
      for (const bonus of previousLineage.carryoverBonuses) {
        switch (bonus.kind) {
          case "starting_gold":
            burdenedState = {
              ...burdenedState,
              resources: {
                ...burdenedState.resources,
                gold: {
                  ...burdenedState.resources.gold,
                  amount: burdenedState.resources.gold.amount + bonus.value
                }
              }
            };
            break;
          case "starting_reputation":
            burdenedState = {
              ...burdenedState,
              campaign: {
                ...burdenedState.campaign,
                reputation: {
                  ...burdenedState.campaign.reputation,
                  score: burdenedState.campaign.reputation.score + bonus.value
                }
              }
            };
            break;
          case "priest_skill":
            burdenedState = {
              ...burdenedState,
              priests: burdenedState.priests.map((p) => ({
                ...p,
                skill: Math.min(100, p.skill + bonus.value)
              }))
            };
            break;
          case "resource_capacity": {
            const updatedResources = { ...burdenedState.resources };
            for (const [key, value] of Object.entries(updatedResources) as Array<[keyof typeof updatedResources, typeof updatedResources[keyof typeof updatedResources]]>) {
              updatedResources[key] = {
                ...value,
                capacity: value.capacity + bonus.value
              };
            }
            burdenedState = { ...burdenedState, resources: updatedResources };
            break;
          }
          case "consultation_quality":
            burdenedState = {
              ...burdenedState,
              pythia: {
                ...burdenedState.pythia,
                attunement: Math.min(100, burdenedState.pythia.attunement + bonus.value)
              }
            };
            break;
        }
      }

      nextState = {
        ...burdenedState,
        lineage: previousLineage,
        endlessMode: command.endlessMode,
        activeBurdens
      };
      nextState = nextStateWithEvent(nextState, `A new lineage run begins. ${activeBurdens.length > 0 ? `Burdens: ${activeBurdens.map((b) => burdenDefById[b].name).join(", ")}.` : "No burdens active."}`);
      break;
    }
    case "RecordLineageRunCommand": {
      const lineage = nextState.lineage ?? createInitialLineageState();
      const artifact = nextState.legacy?.legacyArtifact ?? generateLegacyArtifact(nextState);
      const runId = `run-${lineage.totalRuns + 1}-${Date.now().toString(36)}`;

      // Compute burden score multiplier
      const activeBurdensForMultiplier = nextState.activeBurdens ?? [];
      let multiplier = 1;
      for (const burdenId of activeBurdensForMultiplier) {
        multiplier *= burdenDefById[burdenId].scoreMultiplier;
      }

      // Apply multiplier to artifact score
      const adjustedArtifact: typeof artifact = {
        ...artifact,
        finalScore: Math.round(artifact.finalScore * multiplier)
      };

      const updatedLineage = recordRunInLineage(
        lineage,
        adjustedArtifact,
        nextState.originId,
        nextState.worldSeedText,
        runId
      );

      nextState = {
        ...nextState,
        lineage: updatedLineage,
        legacy: {
          ...(nextState.legacy ?? createInitialLegacyState()),
          legacyArtifact: adjustedArtifact
        }
      };
      nextState = nextStateWithEvent(nextState, `Run recorded in lineage. Lineage score: ${updatedLineage.lineageScore}. Total runs: ${updatedLineage.totalRuns}.`);
      break;
    }
    case "HireWorkerCommand": {
      const hireCost = command.role === "carrier" ? 8 : 6;
      if (nextState.resources.gold.amount < hireCost) break;

      const pop = selectPopulationSummary(nextState);
      const rolePop = command.role === "carrier" ? pop.carriers : pop.custodians;
      if (rolePop.current >= rolePop.cap) break;

      const spawnAnchor = nextState.buildings.find((b) => b.defId === "storehouse");
      const spawnTile = spawnAnchor ? spawnAnchor.position : { x: 32, y: 50 };
      const workerId = `walker-${command.role}-${nextState.nextId}`;

      // Assign 0-2 random traits using seeded RNG
      const traitSeed = nextState.worldSeed + nextState.nextId * 37;
      const traitCountRoll = (traitSeed >>> 0) % 100;
      const traitCount = traitCountRoll < 30 ? 0 : traitCountRoll < 75 ? 1 : 2;
      const assignedTraits: WalkerTraitId[] = [];
      if (traitCount > 0) {
        const idx1 = ((traitSeed * 7 + 13) >>> 0) % WALKER_TRAIT_IDS.length;
        assignedTraits.push(WALKER_TRAIT_IDS[idx1]);
        if (traitCount > 1) {
          let idx2 = ((traitSeed * 17 + 29) >>> 0) % WALKER_TRAIT_IDS.length;
          if (idx2 === idx1) idx2 = (idx2 + 1) % WALKER_TRAIT_IDS.length;
          assignedTraits.push(WALKER_TRAIT_IDS[idx2]);
        }
      }

      nextState = {
        ...nextState,
        resources: {
          ...nextState.resources,
          gold: { ...nextState.resources.gold, amount: nextState.resources.gold.amount - hireCost }
        },
        walkers: [
          ...nextState.walkers,
          {
            id: workerId,
            role: command.role,
            name: command.role === "carrier" ? `Carrier ${pop.carriers.current + 1}` : `Worker ${pop.custodians.current + 1}`,
            tile: spawnTile,
            state: "idle" as const,
            path: [],
            moveCooldown: 0,
            homeBuildingId: spawnAnchor?.id,
            traits: assignedTraits.length > 0 ? assignedTraits : undefined,
            experience: 0,
            skillLevel: 1,
            morale: 50,
            ...(command.role === "carrier" ? { fatigue: 0, haulingSkill: 1, supplyRadius: 5 } : {})
          }
        ],
        nextId: nextState.nextId + 1
      };

      events.push({
        type: "feed",
        text: `Hired a new ${command.role}.`
      } as unknown as GameEvent);
      break;
    }
    case "StartResearchCommand": {
      const techDef = techDefById[command.techId];
      if (!techDef) break;

      // Ensure research state exists
      const research = nextState.research ?? {
        knowledgeAccumulated: 0,
        activeTechProgress: 0,
        completedTechIds: [] as TechId[]
      };

      // Already completed?
      if (research.completedTechIds.includes(command.techId)) break;

      // Already researching this tech?
      if (research.activeTechId === command.techId) break;

      // Check prerequisites
      if (techDef.requires) {
        const missingPrereq = techDef.requires.some(
          (req) => !research.completedTechIds.includes(req)
        );
        if (missingPrereq) break;
      }

      nextState = {
        ...nextState,
        research: {
          ...research,
          activeTechId: command.techId,
          activeTechProgress: 0
        }
      };
      break;
    }
    case "SELECT_RESEARCH": {
      const selectTechDef = techDefById[command.techId as TechId];
      if (!selectTechDef) break;

      const selectResearch = nextState.research ?? {
        knowledgeAccumulated: 0,
        activeTechProgress: 0,
        completedTechIds: [] as TechId[]
      };

      // Already completed?
      if (selectResearch.completedTechIds.includes(command.techId as TechId)) {
        events.push({ type: "feed", text: `Research on "${selectTechDef.name}" is already complete.` } as unknown as GameEvent);
        break;
      }

      // Already researching this tech?
      if (selectResearch.activeTechId === command.techId) {
        events.push({ type: "feed", text: `Already researching "${selectTechDef.name}".` } as unknown as GameEvent);
        break;
      }

      // Check prerequisites
      if (selectTechDef.requires) {
        const missingPrereqs = selectTechDef.requires.filter(
          (req) => !selectResearch.completedTechIds.includes(req)
        );
        if (missingPrereqs.length > 0) {
          events.push({ type: "feed", text: `Cannot research "${selectTechDef.name}" — missing prerequisites.` } as unknown as GameEvent);
          break;
        }
      }

      nextState = {
        ...nextState,
        research: {
          ...selectResearch,
          activeTechId: command.techId as TechId,
          activeTechProgress: 0
        }
      };
      events.push({ type: "feed", text: `Research started: ${selectTechDef.name}.` } as unknown as GameEvent);
      break;
    }
    case "CancelResearchCommand": {
      if (!nextState.research?.activeTechId) break;

      nextState = {
        ...nextState,
        research: {
          ...nextState.research,
          activeTechId: undefined,
          activeTechProgress: 0
        }
      };
      break;
    }
    case "EventChainChoiceCommand": {
      const chains = nextState.eventChains;
      if (!chains) return { state, events };

      const chainIndex = chains.findIndex((c) => c.id === command.chainInstanceId);
      if (chainIndex === -1) return { state, events };

      const chain = chains[chainIndex];
      if (!chain.pendingChoice || chain.resolved) return { state, events };

      const def = eventChainDefById[chain.defId];
      if (!def) return { state, events };

      const stage = def.stages.find((s) => s.id === chain.currentStageId);
      if (!stage) return { state, events };

      const choiceLabel = command.choice === "a"
        ? stage.choiceA?.label ?? "Option A"
        : stage.choiceB?.label ?? "Option B";

      nextState = {
        ...nextState,
        eventChains: chains.map((c, idx) =>
          idx === chainIndex
            ? { ...c, pendingChoice: false, choiceMade: command.choice }
            : c
        )
      };

      nextState = nextStateWithEvent(nextState, `Oracle chose: ${choiceLabel} (${def.label})`);
      break;
    }
    case "AcceptPatronCommand": {
      const patrons = nextState.patrons ?? [];
      const contractIndex = patrons.findIndex((p) => p.id === command.contractId);
      if (contractIndex === -1) return { state, events };
      const contract = patrons[contractIndex]!;
      if (contract.active) return { state, events };

      nextState = {
        ...nextState,
        patrons: patrons.map((p, idx) =>
          idx === contractIndex ? { ...p, active: true, startDay: nextState.clock.day } : p
        )
      };
      nextState = nextStateWithEvent(nextState, `Accepted patronage from ${nextState.factions[contract.factionId].name}: ${contract.goldPerMonth} gold/month.`);
      break;
    }

    case "RejectPatronCommand": {
      const patrons = nextState.patrons ?? [];
      const contractIndex = patrons.findIndex((p) => p.id === command.contractId);
      if (contractIndex === -1) return { state, events };

      const contract = patrons[contractIndex]!;
      const faction = nextState.factions[contract.factionId];

      nextState = {
        ...nextState,
        patrons: patrons.filter((_, idx) => idx !== contractIndex),
        factions: {
          ...nextState.factions,
          [contract.factionId]: {
            ...faction,
            credibility: Math.max(0, faction.credibility - 1)
          }
        }
      };
      nextState = nextStateWithEvent(nextState, `Declined patronage offer from ${faction.name}.`);
      break;
    }

    case "BorrowGoldCommand": {
      const faction = nextState.factions[command.factionId];
      if (!faction) return { state, events };
      if (faction.credibility < 40) return { state, events };
      if (command.amount <= 0) return { state, events };

      // Interest rate based on faction profile
      const baseRate = faction.profile === "mercantile" ? 0.08
        : faction.profile === "scheming" ? 0.12
        : faction.profile === "devout" ? 0.04
        : 0.06;
      const credibilityDiscount = (faction.credibility - 40) / 600; // max ~0.1 discount
      const interestRate = Math.max(0.02, baseRate - credibilityDiscount);
      const durationMonths = 12;
      const totalOwed = command.amount * (1 + interestRate * durationMonths);
      const monthlyPayment = Math.ceil(totalOwed / durationMonths);

      const loan: Loan = {
        id: `loan-${nextState.nextId}`,
        factionId: command.factionId,
        principalGold: command.amount,
        interestRate,
        remainingPayments: durationMonths,
        monthlyPayment,
        startDay: nextState.clock.day,
        missedPayments: 0
      };

      const currentLoans = nextState.loans ?? [];
      nextState = {
        ...nextState,
        loans: [...currentLoans, loan],
        resources: {
          ...nextState.resources,
          gold: {
            ...nextState.resources.gold,
            amount: nextState.resources.gold.amount + command.amount
          }
        },
        nextId: nextState.nextId + 1
      };
      nextState = nextStateWithEvent(nextState, `Borrowed ${command.amount} gold from ${faction.name} at ${Math.round(interestRate * 100)}% interest.`);
      break;
    }

    case "RepayLoanCommand": {
      const loans = nextState.loans ?? [];
      const loanIndex = loans.findIndex((l) => l.id === command.loanId);
      if (loanIndex === -1) return { state, events };

      const loan = loans[loanIndex]!;
      const remainingBalance = loan.monthlyPayment * loan.remainingPayments;
      const goldAvailable = nextState.resources.gold.amount;

      if (goldAvailable < remainingBalance) return { state, events };

      const faction = nextState.factions[loan.factionId];
      nextState = {
        ...nextState,
        loans: loans.filter((_, idx) => idx !== loanIndex),
        resources: {
          ...nextState.resources,
          gold: {
            ...nextState.resources.gold,
            amount: goldAvailable - remainingBalance
          }
        },
        factions: {
          ...nextState.factions,
          [loan.factionId]: {
            ...faction,
            credibility: Math.min(100, faction.credibility + 2),
            history: [`Delphi repaid a loan early. Trust grows.`, ...faction.history].slice(0, 4)
          }
        }
      };
      nextState = nextStateWithEvent(nextState, `Repaid loan to ${faction.name} in full. (+2 credibility)`);
      break;
    }

    case "ProposeTreatyCommand": {
      const faction = nextState.factions[command.factionId];
      if (!faction) return { state, events };

      // Require faction relations > 30 (favour)
      if (faction.favour <= 30) {
        nextState = nextStateWithEvent(nextState, `${faction.name} refuses the treaty proposal — relations are too poor.`);
        return { state: nextState, events };
      }

      // Check if treaty already exists with this faction for same kind
      const existingTreaties = nextState.treaties ?? [];
      if (existingTreaties.some((t) => t.active && t.factionId === command.factionId && t.kind === command.offerType)) {
        return { state, events };
      }

      const goldPerMonth = command.goldPerMonth ?? (command.offerType === "trade_access" ? 5 : command.offerType === "mutual_defense" ? 8 : 3);

      // Deduct initial gold payment (first month)
      if (nextState.resources.gold.amount < goldPerMonth) {
        nextState = nextStateWithEvent(nextState, `Not enough gold to initiate treaty with ${faction.name}.`);
        return { state: nextState, events };
      }

      const treaty: Treaty = {
        id: `treaty-${nextState.nextId}`,
        factionId: command.factionId,
        kind: command.offerType,
        goldPerMonth,
        startDay: nextState.clock.day,
        active: true,
        obligationsMet: true
      };

      nextState = {
        ...nextState,
        treaties: [...existingTreaties, treaty],
        resources: {
          ...nextState.resources,
          gold: {
            ...nextState.resources.gold,
            amount: nextState.resources.gold.amount - goldPerMonth
          }
        },
        factions: {
          ...nextState.factions,
          [command.factionId]: {
            ...faction,
            credibility: Math.min(100, faction.credibility + 2),
            favour: Math.min(100, faction.favour + 3)
          }
        },
        nextId: nextState.nextId + 1
      };
      nextState = nextStateWithEvent(nextState, `Treaty of ${command.offerType.replace(/_/g, " ")} signed with ${faction.name}. (${goldPerMonth} gold/month)`);
      break;
    }

    case "RespondToDemandsCommand": {
      const demands = nextState.demands ?? [];
      const demandIndex = demands.findIndex((d) => d.id === command.demandId);
      if (demandIndex === -1) return { state, events };

      const demand = demands[demandIndex]!;
      if (demand.resolved) return { state, events };

      const faction = nextState.factions[demand.factionId];
      if (!faction) return { state, events };

      const updatedDemands = [...demands];

      switch (command.response) {
        case "accept": {
          // Fulfill demand
          let goldCost = demand.goldAmount ?? 0;
          if (demand.demandType === "tribute" && nextState.resources.gold.amount < goldCost) {
            nextState = nextStateWithEvent(nextState, `Not enough gold to fulfill ${faction.name}'s tribute demand.`);
            return { state: nextState, events };
          }

          updatedDemands[demandIndex] = { ...demand, resolved: true };
          nextState = {
            ...nextState,
            demands: updatedDemands,
            resources: demand.demandType === "tribute"
              ? {
                  ...nextState.resources,
                  gold: { ...nextState.resources.gold, amount: nextState.resources.gold.amount - goldCost }
                }
              : nextState.resources,
            factions: {
              ...nextState.factions,
              [demand.factionId]: {
                ...faction,
                credibility: Math.min(100, faction.credibility + 2),
                favour: Math.min(100, faction.favour + 3)
              }
            }
          };
          nextState = nextStateWithEvent(nextState, `Accepted ${faction.name}'s demand. (+2 credibility, +3 favour)`);
          break;
        }
        case "negotiate": {
          // Reduce demand by 50%
          const reducedGold = demand.goldAmount ? Math.ceil(demand.goldAmount / 2) : 0;
          if (demand.demandType === "tribute" && nextState.resources.gold.amount < reducedGold) {
            nextState = nextStateWithEvent(nextState, `Not enough gold to negotiate ${faction.name}'s demand.`);
            return { state: nextState, events };
          }

          updatedDemands[demandIndex] = { ...demand, resolved: true, goldAmount: reducedGold };
          nextState = {
            ...nextState,
            demands: updatedDemands,
            resources: demand.demandType === "tribute"
              ? {
                  ...nextState.resources,
                  gold: { ...nextState.resources.gold, amount: nextState.resources.gold.amount - reducedGold }
                }
              : nextState.resources
          };
          nextState = nextStateWithEvent(nextState, `Negotiated ${faction.name}'s demand down to half. Relations remain stable.`);
          break;
        }
        case "refuse": {
          updatedDemands[demandIndex] = { ...demand, resolved: true };
          nextState = {
            ...nextState,
            demands: updatedDemands,
            factions: {
              ...nextState.factions,
              [demand.factionId]: {
                ...faction,
                credibility: Math.max(0, faction.credibility - 2),
                favour: Math.max(0, faction.favour - 5)
              }
            }
          };
          nextState = nextStateWithEvent(nextState, `Refused ${faction.name}'s demand. (-2 credibility, -5 favour)`);
          break;
        }
      }
      break;
    }

    case "CounterStrikeRivalCommand": {
      if (!nextState.rivalOracles) return { state, events };

      const rivalIndex = nextState.rivalOracles.roster.findIndex((r) => r.id === command.rivalId);
      if (rivalIndex === -1) return { state, events };

      const rival = nextState.rivalOracles.roster[rivalIndex]!;

      // Require: pressure > 80 and weakness known
      if (rival.pressure <= 80 || !rival.weaknessKnown) {
        nextState = nextStateWithEvent(nextState, `Cannot counter-strike ${rival.name} — conditions not met.`);
        return { state: nextState, events };
      }

      const updatedRoster = [...nextState.rivalOracles.roster];
      const newPressure = Math.max(0, rival.pressure - 30);
      updatedRoster[rivalIndex] = { ...rival, pressure: newPressure };

      nextState = {
        ...nextState,
        rivalOracles: {
          ...nextState.rivalOracles,
          roster: updatedRoster,
          totalPressure: updatedRoster.length > 0
            ? Math.round(updatedRoster.filter((r) => r.active).reduce((sum, r) => sum + r.pressure, 0) / Math.max(1, updatedRoster.filter((r) => r.active).length))
            : 0
        }
      };
      nextState = nextStateWithEvent(nextState, `Counter-strike against ${rival.name}! Rival pressure reduced by 30.`);
      break;
    }

    case "AssignWorkerCommand": {
      const building = nextState.buildings.find((b) => b.id === command.buildingId);
      const walker = nextState.walkers.find((w) => w.id === command.walkerId);

      // Validation: walker must exist, be a custodian
      if (!building || !walker || walker.role !== "custodian") {
        return { state, events };
      }

      // Validation: building must have staffing.custodians requirement
      const assignDef = buildingDefs[building.defId];
      if (!assignDef.staffing?.custodians || assignDef.staffing.custodians <= 0) {
        return { state, events };
      }

      // Validation: building not already at full staffing
      if (building.assignedWorkerIds.length >= assignDef.staffing.custodians) {
        return { state, events };
      }

      // Validation: worker not already assigned to another building
      const alreadyAssigned = nextState.buildings.some(
        (b) => b.assignedWorkerIds.includes(command.walkerId)
      );
      if (alreadyAssigned) {
        return { state, events };
      }

      nextState = {
        ...nextState,
        buildings: nextState.buildings.map((b) =>
          b.id === building.id
            ? { ...b, assignedWorkerIds: [...b.assignedWorkerIds, command.walkerId] }
            : b
        ),
        walkers: nextState.walkers.map((w) =>
          w.id === walker.id
            ? { ...w, assignmentBuildingId: building.id, state: "idle" as const, path: [] }
            : w
        )
      };
      events.push({ type: "WalkerAssigned", walkerId: walker.id, buildingId: building.id });
      nextState = nextStateWithEvent(nextState,
        `${walker.name} assigned to ${assignDef.name}.`
      );
      break;
    }

    case "UnassignWorkerCommand": {
      const building = nextState.buildings.find((b) => b.id === command.buildingId);
      const walker = nextState.walkers.find((w) => w.id === command.walkerId);

      if (!building || !walker) {
        return { state, events };
      }

      if (!building.assignedWorkerIds.includes(command.walkerId)) {
        return { state, events };
      }

      nextState = {
        ...nextState,
        buildings: nextState.buildings.map((b) =>
          b.id === building.id
            ? { ...b, assignedWorkerIds: b.assignedWorkerIds.filter((id) => id !== command.walkerId) }
            : b
        ),
        walkers: nextState.walkers.map((w) =>
          w.id === walker.id
            ? {
                ...w,
                assignmentBuildingId: undefined,
                productionPhase: undefined,
                gatherTargetTile: undefined,
                phaseProgress: undefined,
                phaseWork: undefined,
                gatherResourceId: undefined,
                gatherAmount: undefined,
                state: "idle" as const,
                path: []
              }
            : w
        )
      };
      events.push({ type: "WalkerAssigned", walkerId: walker.id, buildingId: building.id });
      nextState = nextStateWithEvent(nextState,
        `${walker.name} unassigned from ${buildingDefs[building.defId].name}.`
      );
      break;
    }

    case "SELL_RESOURCE": {
      if (command.amount <= 0) return { state, events };

      const factionId = command.targetFactionId as keyof GameState["factions"];
      const faction = nextState.factions[factionId];
      if (!faction) return { state, events };

      const resource = nextState.resources[command.resourceId];
      if (!resource || resource.amount < command.amount) return { state, events };

      // Calculate price using base prices + faction demand
      const basePrices: Record<string, number> = {
        grain: 2, bread: 3, olive_oil: 4, incense: 6, sacred_water: 5,
        logs: 2, stone: 3, planks: 4, cut_stone: 5, papyrus: 2,
        scrolls: 4, sacred_animals: 8, knowledge: 10, gold: 1, olives: 2
      };
      const basePrice = basePrices[command.resourceId] ?? 1;

      // Faction agenda demand multiplier
      const agendaDemand: Record<string, string[]> = {
        war: ["stone", "logs", "planks", "cut_stone"],
        faith: ["incense", "sacred_water", "sacred_animals"]
      };
      const demandResources = agendaDemand[faction.currentAgenda] ?? [];
      const demandMultiplier = demandResources.includes(command.resourceId) ? 1.5 : 1;

      // Market price index
      const marketMultiplier = nextState.market?.priceIndex[command.resourceId] ?? 1;

      let goldEarned = Math.round(command.amount * basePrice * demandMultiplier * marketMultiplier);

      // Hostile faction: 50% price but +2 relations
      const isHostile = faction.favour < 20;
      if (isHostile) {
        goldEarned = Math.round(goldEarned * 0.5);
      }

      nextState = {
        ...nextState,
        resources: {
          ...nextState.resources,
          [command.resourceId]: {
            ...resource,
            amount: resource.amount - command.amount,
            trend: -command.amount
          },
          gold: {
            ...nextState.resources.gold,
            amount: nextState.resources.gold.amount + goldEarned
          }
        },
        factions: isHostile
          ? {
              ...nextState.factions,
              [factionId]: {
                ...faction,
                favour: Math.min(100, faction.favour + 2),
                history: [`Delphi traded goods despite tensions. Relations thaw.`, ...faction.history].slice(0, 4)
              }
            }
          : nextState.factions
      };

      events.push({
        type: "ResourceSold",
        resourceId: command.resourceId,
        amount: command.amount,
        goldEarned,
        factionId: factionId as import("@the-oracle/content").FactionId
      });
      const hostileNote = isHostile ? " (hostile discount, +2 favour)" : "";
      nextState = nextStateWithEvent(nextState,
        `Sold ${command.amount} ${command.resourceId.replace(/_/g, " ")} to ${faction.name} for ${goldEarned} gold.${hostileNote}`
      );
      break;
    }

    case "DEMOLISH_BUILDING": {
      const buildingIndex = nextState.buildings.findIndex((b) => b.id === command.buildingId);
      if (buildingIndex === -1) return { state, events };

      const building = nextState.buildings[buildingIndex]!;

      // Cannot demolish Sacred Way
      if (building.defId === "sacred_way") {
        nextState = nextStateWithEvent(nextState, `The Sacred Way cannot be demolished.`);
        return { state: nextState, events };
      }

      const def = buildingDefs[building.defId];

      // Calculate 40% resource return
      const goldReturned = Math.floor((def.costGold ?? 0) * 0.4);
      let resources = nextState.resources;
      resources = {
        ...resources,
        gold: {
          ...resources.gold,
          amount: resources.gold.amount + goldReturned
        }
      };

      // Return 40% of costResources
      if (def.costResources) {
        for (const [resId, cost] of Object.entries(def.costResources) as [string, number][]) {
          const key = resId as keyof typeof resources;
          if (resources[key]) {
            const returned = Math.floor(cost * 0.4);
            if (returned > 0) {
              resources = {
                ...resources,
                [key]: {
                  ...resources[key],
                  amount: Math.min(resources[key].capacity, resources[key].amount + returned)
                }
              };
            }
          }
        }
      }

      // Clean up worker assignments — unassign workers assigned to this building
      const walkers = nextState.walkers.map((w) => {
        if (w.assignmentBuildingId === command.buildingId || w.homeBuildingId === command.buildingId) {
          return {
            ...w,
            assignmentBuildingId: w.assignmentBuildingId === command.buildingId ? undefined : w.assignmentBuildingId,
            homeBuildingId: w.homeBuildingId === command.buildingId ? undefined : w.homeBuildingId,
            productionPhase: undefined,
            gatherTargetTile: undefined,
            phaseProgress: undefined,
            phaseWork: undefined,
            gatherResourceId: undefined,
            gatherAmount: undefined,
            state: "idle" as const,
            path: [] as { x: number; y: number }[]
          };
        }
        return w;
      });

      // Clean up priest assignments
      const priests = nextState.priests.map((p) => {
        if (p.currentAssignmentBuildingId === command.buildingId || p.homeBuildingId === command.buildingId) {
          return {
            ...p,
            currentAssignmentBuildingId: p.currentAssignmentBuildingId === command.buildingId ? undefined : p.currentAssignmentBuildingId,
            homeBuildingId: p.homeBuildingId === command.buildingId ? undefined : p.homeBuildingId
          };
        }
        return p;
      });

      // Clean up carrier jobs targeting this building
      const resourceJobs = nextState.resourceJobs.filter(
        (job) => job.sourceBuildingId !== command.buildingId && job.targetBuildingId !== command.buildingId
      );

      // Remove building
      const buildings = nextState.buildings.filter((_, idx) => idx !== buildingIndex);

      nextState = {
        ...nextState,
        buildings,
        walkers,
        priests,
        resourceJobs,
        resources
      };

      events.push({
        type: "BuildingDemolished",
        buildingId: command.buildingId,
        defId: building.defId,
        goldReturned
      });
      nextState = nextStateWithEvent(nextState,
        `Demolished ${def.name}. Recovered ${goldReturned} gold${def.costResources ? " and materials" : ""}.`
      );
      break;
    }

    default:
      break;
  }

  return {
    state: nextState,
    events
  };
}
