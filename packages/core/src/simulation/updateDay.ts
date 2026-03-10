import { ageDefs, buildingDefs, legendaryConsultationDefs, legendaryConsultationIds, resourceDefs, techDefById } from "@the-oracle/content";
import type { LegendaryConsultationId, TechId } from "@the-oracle/content";

import type {
  BuildingInstance,
  GameEvent,
  GameState,
  PriestPoliticsState,
  ResourceId,
  ResourceTransferJob,
  WorldClock,
  WalkerInstance,
  WalkerState
} from "../state/gameState";
import { isBuildingUnderConstruction } from "../state/gameState";
import { advanceAge, createInitialAgeState } from "../state/ages";
import { advanceCampaignState } from "../state/campaign";
import { carrierProfileForIndex, normalizeCarrierWalker } from "../state/carriers";
import { advancePriestPoliticsState } from "../state/priestPolitics";
import { advanceRivalOracles } from "../state/rivalOracles";
import {
  applyBilateralRelationDelta,
  advancePoliticalClimate,
  advanceWorldHistory,
  evaluateResolutionObservers,
  generateAdvisorMessages,
  applyAdvisorPersonality,
  maybeCreateConsultation,
  resolveConsequence,
  updateFactionMemory
} from "./events";
import { getAbsoluteDay } from "./clock";
import { narrateAgeTransition } from "../textgen/worldNarrator";
import { advanceDecline } from "./decline";
import { updateMarketPrices, advancePatronContracts, advanceLoanPayments } from "./economy";
import { processTradeOffers } from "./trade";
import { advanceEspionage } from "./espionage";
import { advanceEventChains } from "./eventChains";
import { advanceProphecyArcs, resolveFollowUp, resolveContradictions } from "./prophecyArcs";
import { advanceBeliefStrength, applyInterpretationBranchEffects } from "./prophecyFeedback";
import { advanceDiplomacy } from "./diplomacy";
import { advanceRivalStrategies } from "./rivalStrategies";
import { processFoodConsumption, HUNGER_STARVING_TICKS, STARVING_EFFICIENCY } from "./food";
import { advancePriestExperience } from "./priests";
import { advanceCharacterArcs } from "./characters";
import { advanceFestivals, advanceWeather } from "./festivals";
import { checkAchievements, advanceHubris } from "./achievements";
import { processSpoilage } from "./spoilage";
import { advanceWorkerPhases } from "./production";
import { regenerateDeposits } from "../terrain/deposits";
import { advanceCityGrowth, processVisitorEconomy, DEFAULT_CITY_PROSPERITY } from "./city";
import type { WalkerTraitId } from "../state/gameState";

// ── Walker Trait & Skill Helpers ──

/** Check if a walker has a specific trait. */
export function walkerHasTrait(walker: WalkerInstance, traitId: WalkerTraitId): boolean {
  return walker.traits?.includes(traitId) ?? false;
}

/** Skill level thresholds: 0→L1, 20→L2, 40→L3, 60→L4, 80→L5. */
export function computeSkillLevel(experience: number): number {
  if (experience >= 80) return 5;
  if (experience >= 60) return 4;
  if (experience >= 40) return 3;
  if (experience >= 20) return 2;
  return 1;
}

/** Each skill level: +5% production efficiency (multiplicative with traits). */
export function getSkillMultiplier(walker: WalkerInstance): number {
  const level = walker.skillLevel ?? 1;
  return 1 + (level - 1) * 0.05;
}

/** Get morale-based efficiency multiplier. Low (<20) → 0.5, High (>70) → 1.1, else 1.0. */
export function getMoraleMultiplier(walker: WalkerInstance): number {
  const morale = walker.morale ?? 50;
  if (morale < 20) return 0.5;
  if (morale > 70) return 1.1;
  return 1.0;
}

/** Get the combined worker efficiency from traits, skill, and morale. */
export function getWorkerEfficiency(walker: WalkerInstance): number {
  let multiplier = 1.0;
  if (walkerHasTrait(walker, "industrious")) multiplier *= 1.20;
  multiplier *= getSkillMultiplier(walker);
  multiplier *= getMoraleMultiplier(walker);
  return multiplier;
}

/** Ritual building IDs that benefit from the devout trait. */
const RITUAL_BUILDING_IDS = new Set(["inner_sanctum", "sacrificial_altar", "eternal_flame_brazier", "sacred_theater"]);

function coordKey(x: number, y: number): string {
  return `${x},${y}`;
}

function isRoad(state: GameState, x: number, y: number): boolean {
  return state.grid.roads.some((road) => road.x === x && road.y === y);
}

function neighbors(x: number, y: number): { x: number; y: number }[] {
  return [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 }
  ];
}

export function findPath(state: GameState, start: { x: number; y: number }, goal: { x: number; y: number }): { x: number; y: number }[] {
  if (start.x === goal.x && start.y === goal.y) {
    return [];
  }

  const queue = [start];
  const cameFrom = new Map<string, string>();
  const visited = new Set<string>([coordKey(start.x, start.y)]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of neighbors(current.x, current.y)) {
      if (next.x < 0 || next.x >= state.grid.width || next.y < 0 || next.y >= state.grid.height) {
        continue;
      }
      const nextKey = coordKey(next.x, next.y);
      if (visited.has(nextKey)) {
        continue;
      }
      const canUse = isRoad(state, next.x, next.y) || (next.x === goal.x && next.y === goal.y);
      if (!canUse) {
        continue;
      }
      visited.add(nextKey);
      cameFrom.set(nextKey, coordKey(current.x, current.y));
      if (next.x === goal.x && next.y === goal.y) {
        const path = [goal];
        let cursor = coordKey(goal.x, goal.y);
        while (cursor !== coordKey(start.x, start.y)) {
          const previous = cameFrom.get(cursor);
          if (!previous) {
            break;
          }
          const [px, py] = previous.split(",").map(Number);
          if (px === start.x && py === start.y) {
            break;
          }
          path.unshift({ x: px, y: py });
          cursor = previous;
        }
        return path;
      }
      queue.push(next);
    }
  }

  return [];
}

function nearestRoad(state: GameState, building: BuildingInstance): { x: number; y: number } | undefined {
  return neighbors(building.position.x, building.position.y).find((tile) => isRoad(state, tile.x, tile.y));
}

function updateResourceLedger(
  resources: GameState["resources"],
  resourceId: ResourceId,
  delta: number
): GameState["resources"] {
  return {
    ...resources,
    [resourceId]: {
      ...resources[resourceId],
      amount: Math.max(0, Math.min(resources[resourceId].capacity, resources[resourceId].amount + delta)),
      trend: delta
    }
  };
}

function buildingById(state: GameState, buildingId: string): BuildingInstance | undefined {
  return state.buildings.find((building) => building.id === buildingId);
}

function totalStoredResource(state: GameState, resourceId: ResourceId, excludingBuildingId?: string): number {
  return state.buildings.reduce((total, building) => {
    if (excludingBuildingId && building.id === excludingBuildingId) {
      return total;
    }
    return total + (building.storedResources[resourceId] ?? 0);
  }, 0);
}

function storedAmount(building: BuildingInstance, resourceId: ResourceId): number {
  return building.storedResources[resourceId] ?? 0;
}

function tileDistance(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

/** Computes the production multiplier from adjacency bonuses.  Returns 1 when no bonuses apply. */
export function computeAdjacencyMultiplier(
  building: BuildingInstance,
  allBuildings: BuildingInstance[],
  buildingDef: { adjacencyBonuses?: { nearDefId: string; bonusKind: string; value: number; maxDistance: number }[] }
): number {
  if (!buildingDef.adjacencyBonuses?.length) return 1;
  let multiplier = 1;
  for (const bonus of buildingDef.adjacencyBonuses) {
    if (bonus.bonusKind !== "production") continue;
    const nearby = allBuildings.some((b) => {
      if (b.id === building.id) return false;
      if (b.defId !== bonus.nearDefId) return false;
      const dist = Math.abs(b.position.x - building.position.x) + Math.abs(b.position.y - building.position.y);
      return dist <= bonus.maxDistance;
    });
    if (nearby) multiplier += bonus.value;
  }
  return multiplier;
}

const storehouseBufferTargets: Partial<Record<ResourceId, number>> = {
  olive_oil: 6,
  incense: 4,
  grain: 10,
  olives: 6,
  papyrus: 3,
  bread: 4,
  sacred_water: 8,
  sacred_animals: 1,
  scrolls: 3
};

const productionInputTargets: Partial<Record<BuildingInstance["defId"], Partial<Record<ResourceId, number>>>> = {
  granary: { grain: 18 },
  kitchen: { grain: 6 },
  animal_pen: { grain: 5 },
  olive_press: { olives: 5 },
  incense_store: { incense: 5, papyrus: 2 },
  sacrificial_altar: { sacred_animals: 1.25, incense: 1.2 },
  papyrus_reed_bed: { sacred_water: 3 },
  scriptorium: { papyrus: 3 },
  library: { scrolls: 3 }
};

/** Base storage cap from building def, plus any tech-based storage bonuses. */
function storageCapFor(building: BuildingInstance, resourceId: ResourceId, state?: GameState): number {
  const baseCap = buildingDefs[building.defId].storageCaps?.[resourceId] ?? Number.POSITIVE_INFINITY;
  if (baseCap === Number.POSITIVE_INFINITY) return baseCap;
  if (!state?.research?.completedTechIds.length) return baseCap;

  let techBonus = 0;
  for (const techId of state.research.completedTechIds) {
    const tech = techDefById[techId];
    if (!tech) continue;
    for (const effect of tech.effects) {
      if (effect.kind === "storage_bonus" && effect.resourceId === resourceId) {
        techBonus += effect.bonusCapacity;
      }
    }
  }
  return baseCap + techBonus;
}

function rebalanceStorehouseBuffers(state: GameState): GameState {
  let nextState = state;

  for (const storehouseId of state.buildings.filter((building) => building.defId === "storehouse").map((building) => building.id)) {
    const storehouse = buildingById(nextState, storehouseId);
    if (!storehouse) {
      continue;
    }

    let storedResources = storehouse.storedResources;

    for (const [resourceId, targetAmount] of Object.entries(storehouseBufferTargets) as [Exclude<ResourceId, "gold">, number][]) {
      const currentAmount = storedResources[resourceId] ?? 0;
      const surplusElsewhere = nextState.buildings.some((building) =>
        building.defId === "storehouse"
          && building.id !== storehouse.id
          && (building.storedResources[resourceId] ?? 0) > targetAmount + 0.75
      );
      if (surplusElsewhere) {
        continue;
      }
      const otherStored = totalStoredResource(nextState, resourceId, storehouse.id);
      const targetLocalAmount = Math.min(targetAmount, Math.max(0, nextState.resources[resourceId].amount - otherStored));
      if (currentAmount >= targetLocalAmount) {
        continue;
      }

      storedResources = {
        ...storedResources,
        [resourceId]: targetLocalAmount
      };
    }

    if (storedResources !== storehouse.storedResources) {
      nextState = {
        ...nextState,
        buildings: nextState.buildings.map((building) =>
          building.id === storehouse.id
            ? {
                ...building,
                storedResources
              }
            : building
        )
      };
    }
  }

  return nextState;
}

function queueJob(
  state: GameState,
  sourceBuildingId: string,
  targetBuildingId: string,
  resourceId: ResourceTransferJob["resourceId"],
  amount: number,
  priority: ResourceTransferJob["priority"]
): GameState {
  const duplicate = state.resourceJobs.some((job) =>
    job.sourceBuildingId === sourceBuildingId
      && job.targetBuildingId === targetBuildingId
      && job.resourceId === resourceId
  );
  if (duplicate || amount <= 0) {
    return state;
  }

  return {
    ...state,
    resourceJobs: [
      ...state.resourceJobs,
      {
        id: `job-${state.nextId}`,
        resourceId,
        amount,
        sourceBuildingId,
        targetBuildingId,
        priority,
        phase: "to_source"
      }
    ],
    nextId: state.nextId + 1
  };
}

function jobPriorityRank(priority: ResourceTransferJob["priority"]): number {
  switch (priority) {
    case "critical":
      return 3;
    case "high":
      return 2;
    default:
      return 1;
  }
}

function normalizeCarrierFleet(state: GameState): GameState {
  let carrierIndex = 0;
  let changed = false;
  const walkers = state.walkers.map((walker) => {
    if (walker.role !== "carrier") {
      return walker;
    }
    const normalized = normalizeCarrierWalker(walker, carrierIndex);
    carrierIndex += 1;
    if (normalized !== walker) {
      changed = true;
    }
    return normalized;
  });

  return changed ? { ...state, walkers } : state;
}

function carrierRouteDistance(state: GameState, job: ResourceTransferJob): number {
  const sourceBuilding = buildingById(state, job.sourceBuildingId);
  const targetBuilding = buildingById(state, job.targetBuildingId);
  if (!sourceBuilding || !targetBuilding) {
    return Number.MAX_SAFE_INTEGER;
  }

  return tileDistance(sourceBuilding.position, targetBuilding.position);
}

function carrierDispatchScore(
  state: GameState,
  resourceJobs: ResourceTransferJob[],
  walker: WalkerInstance,
  job: ResourceTransferJob
): number {
  const sourceBuilding = buildingById(state, job.sourceBuildingId);
  if (!sourceBuilding) {
    return Number.MAX_SAFE_INTEGER;
  }

  const fatigue = walker.fatigue ?? 0;
  const haulingSkill = walker.haulingSkill ?? 55;
  const supplyRadius = (walker.supplyRadius ?? 8) + getTechCarrierCapacityBonus(state);
  const distanceToSource = tileDistance(walker.tile, sourceBuilding.position);
  const haulDistance = carrierRouteDistance(state, job);
  const radiusOverage = Math.max(0, haulDistance - supplyRadius);
  const sharedHubLoad = resourceJobs.filter((entry) =>
    entry.assignedWalkerId
      && entry.id !== job.id
      && (
        entry.sourceBuildingId === job.sourceBuildingId
        || entry.sourceBuildingId === job.targetBuildingId
        || entry.targetBuildingId === job.sourceBuildingId
        || entry.targetBuildingId === job.targetBuildingId
      )
  ).length;
  const baseTravelCost = distanceToSource * 4 + haulDistance * 3;
  const fatiguePenalty = fatigue * (job.priority === "critical" ? 1.4 : job.priority === "high" ? 1.1 : 0.85);
  const radiusPenalty = radiusOverage * 18;
  const congestionPenalty = sharedHubLoad * 6;
  const skillCredit = haulingSkill * (job.priority === "critical" ? 0.55 : 0.35);
  const priorityCredit = jobPriorityRank(job.priority) * 40;

  return baseTravelCost + fatiguePenalty + radiusPenalty + congestionPenalty - skillCredit - priorityCredit;
}

function scheduleResourceJobs(state: GameState): GameState {
  let nextState = state;
  const projectedDeltas = new Map<string, number>();
  const projectionKey = (buildingId: string, resourceId: ResourceId) => `${buildingId}:${resourceId}`;
  const projectedStored = (building: BuildingInstance, resourceId: ResourceId) =>
    storedAmount(building, resourceId) + (projectedDeltas.get(projectionKey(building.id, resourceId)) ?? 0);
  const rememberTransfer = (sourceBuildingId: string, targetBuildingId: string, resourceId: ResourceTransferJob["resourceId"], amount: number) => {
    const sourceKey = projectionKey(sourceBuildingId, resourceId);
    const targetKey = projectionKey(targetBuildingId, resourceId);
    projectedDeltas.set(sourceKey, (projectedDeltas.get(sourceKey) ?? 0) - amount);
    projectedDeltas.set(targetKey, (projectedDeltas.get(targetKey) ?? 0) + amount);
  };
  const queueProjectedJob = (
    sourceBuildingId: string,
    targetBuildingId: string,
    resourceId: ResourceTransferJob["resourceId"],
    amount: number,
    priority: ResourceTransferJob["priority"]
  ) => {
    const safeAmount = Math.max(0, Math.round(amount * 10) / 10);
    if (safeAmount <= 0) {
      return;
    }
    const before = nextState.resourceJobs.length;
    nextState = queueJob(nextState, sourceBuildingId, targetBuildingId, resourceId, safeAmount, priority);
    if (nextState.resourceJobs.length > before) {
      rememberTransfer(sourceBuildingId, targetBuildingId, resourceId, safeAmount);
    }
  };
  const pickBestSource = (
    targetBuilding: BuildingInstance,
    resourceId: ResourceTransferJob["resourceId"],
    minimumAmount: number,
    predicate: (building: BuildingInstance) => boolean
  ): BuildingInstance | undefined =>
    nextState.buildings
      .filter((building) => building.id !== targetBuilding.id && predicate(building) && projectedStored(building, resourceId) >= minimumAmount)
      .sort((left, right) =>
        tileDistance(left.position, targetBuilding.position) - tileDistance(right.position, targetBuilding.position)
        || projectedStored(right, resourceId) - projectedStored(left, resourceId)
        || left.id.localeCompare(right.id)
      )[0];

  const storehouses = nextState.buildings.filter((building) => building.defId === "storehouse");
  const springs = nextState.buildings.filter((building) => building.defId === "castalian_spring");
  const sanctums = nextState.buildings.filter((building) => building.defId === "inner_sanctum");
  const braziers = nextState.buildings.filter((building) => building.defId === "eternal_flame_brazier");

  const granaries = nextState.buildings.filter((building) => building.defId === "granary");
  const kitchens = nextState.buildings.filter((building) => building.defId === "kitchen");
  const animalPens = nextState.buildings.filter((building) => building.defId === "animal_pen");
  const altarBuildings = nextState.buildings.filter((building) => building.defId === "sacrificial_altar");
  const olivePresses = nextState.buildings.filter((building) => building.defId === "olive_press");
  const incenseStores = nextState.buildings.filter((building) => building.defId === "incense_store");
  const reedBeds = nextState.buildings.filter((building) => building.defId === "papyrus_reed_bed");
  const scriptoriums = nextState.buildings.filter((building) => building.defId === "scriptorium");
  const libraries = nextState.buildings.filter((building) => building.defId === "library");

  for (const [resourceId, targetAmount] of Object.entries(storehouseBufferTargets) as [Exclude<ResourceId, "gold">, number][]) {
    const understockedStorehouses = [...storehouses]
      .filter((storehouse) => projectedStored(storehouse, resourceId) < targetAmount - 0.25)
      .sort((left, right) => projectedStored(left, resourceId) - projectedStored(right, resourceId));

    for (const targetStorehouse of understockedStorehouses) {
      const sourceStorehouse = pickBestSource(
        targetStorehouse,
        resourceId,
        1,
        (building) => building.defId === "storehouse" && projectedStored(building, resourceId) > targetAmount + 0.75
      );
      if (!sourceStorehouse) {
        continue;
      }

      const targetDeficit = targetAmount - projectedStored(targetStorehouse, resourceId);
      const sourceSurplus = projectedStored(sourceStorehouse, resourceId) - targetAmount;
      queueProjectedJob(
        sourceStorehouse.id,
        targetStorehouse.id,
        resourceId,
        Math.min(3, targetDeficit, sourceSurplus),
        "routine"
      );
    }
  }

  for (const brazier of braziers) {
    const currentOil = projectedStored(brazier, "olive_oil");
    if (currentOil >= 3) {
      continue;
    }
    const sourceStorehouse = pickBestSource(
      brazier,
      "olive_oil",
      1,
      (building) => building.defId === "storehouse"
    );
    if (!sourceStorehouse) {
      continue;
    }
    queueProjectedJob(
      sourceStorehouse.id,
      brazier.id,
      "olive_oil",
      Math.min(4, Math.max(1, 6 - currentOil), projectedStored(sourceStorehouse, "olive_oil")),
      currentOil < 1.25 ? "critical" : "high"
    );
  }

  for (const sanctum of sanctums) {
    const currentIncense = projectedStored(sanctum, "incense");
    if (currentIncense < 1.5) {
      const sourceStorehouse = pickBestSource(
        sanctum,
        "incense",
        1,
        (building) => building.defId === "storehouse"
      );
      if (sourceStorehouse) {
        queueProjectedJob(
          sourceStorehouse.id,
          sanctum.id,
          "incense",
          Math.min(3, Math.max(1, 3 - currentIncense), projectedStored(sourceStorehouse, "incense")),
          state.consultation.mode === "open" || currentIncense < 0.8 ? "critical" : "high"
        );
      }
    }

    const currentWater = projectedStored(sanctum, "sacred_water");
    if (currentWater < 1.5) {
      const sourceSpring = [...springs]
        .filter((spring) => spring.id !== sanctum.id && projectedStored(spring, "sacred_water") >= 1)
        .sort((left, right) =>
          tileDistance(left.position, sanctum.position) - tileDistance(right.position, sanctum.position)
          || projectedStored(right, "sacred_water") - projectedStored(left, "sacred_water")
          || left.id.localeCompare(right.id)
        )[0];
      if (sourceSpring) {
        queueProjectedJob(
          sourceSpring.id,
          sanctum.id,
          "sacred_water",
          Math.min(3, Math.max(1, 3 - currentWater), projectedStored(sourceSpring, "sacred_water")),
          state.consultation.mode === "open" || currentWater < 0.8 ? "critical" : "high"
        );
      }
    }
  }

  const queueInputIfNeeded = (
    targetBuilding: BuildingInstance,
    resourceId: ResourceTransferJob["resourceId"],
    preferredSourceDefs: BuildingInstance["defId"][],
    priority: ResourceTransferJob["priority"]
  ) => {
    const targetAmount = productionInputTargets[targetBuilding.defId]?.[resourceId] ?? 0;
    if (targetAmount <= 0 || projectedStored(targetBuilding, resourceId) >= targetAmount) {
      return;
    }

    const sourceBuilding = pickBestSource(
      targetBuilding,
      resourceId,
      0.75,
      (building) => preferredSourceDefs.includes(building.defId)
    );
    if (!sourceBuilding) {
      return;
    }

    const openCapacity = Math.max(0, storageCapFor(targetBuilding, resourceId, state) - projectedStored(targetBuilding, resourceId));
    if (openCapacity <= 0) {
      return;
    }

    queueProjectedJob(
      sourceBuilding.id,
      targetBuilding.id,
      resourceId,
      Math.min(
        Math.max(0.75, targetAmount - projectedStored(targetBuilding, resourceId)),
        projectedStored(sourceBuilding, resourceId),
        openCapacity,
        4
      ),
      priority
    );
  };

  for (const granary of granaries) {
    queueInputIfNeeded(granary, "grain", ["storehouse"], "routine");
  }

  for (const kitchen of kitchens) {
    queueInputIfNeeded(kitchen, "grain", ["granary", "storehouse"], "high");
  }

  for (const animalPen of animalPens) {
    queueInputIfNeeded(animalPen, "grain", ["granary", "storehouse"], "routine");
  }

  for (const olivePress of olivePresses) {
    queueInputIfNeeded(olivePress, "olives", ["storehouse"], "high");
  }

  for (const incenseStore of incenseStores) {
    queueInputIfNeeded(incenseStore, "incense", ["storehouse"], "routine");
    queueInputIfNeeded(incenseStore, "papyrus", ["storehouse"], "routine");
  }

  for (const altar of altarBuildings) {
    queueInputIfNeeded(altar, "sacred_animals", ["animal_pen"], "high");
    queueInputIfNeeded(
      altar,
      "incense",
      ["incense_store", "storehouse"],
      projectedStored(altar, "sacred_animals") >= 0.5 ? "high" : "routine"
    );
  }

  for (const reedBed of reedBeds) {
    queueInputIfNeeded(reedBed, "sacred_water", ["castalian_spring", "storehouse"], "high");
  }

  for (const scriptorium of scriptoriums) {
    queueInputIfNeeded(scriptorium, "papyrus", ["incense_store", "storehouse"], "high");
  }

  for (const library of libraries) {
    queueInputIfNeeded(library, "scrolls", ["scriptorium", "incense_store", "storehouse"], "routine");
  }

  return nextState;
}

function ensureCarrierStaffing(state: GameState): GameState {
  const carrierCount = state.walkers.filter((walker) => walker.role === "carrier").length;
  const storehouses = state.buildings.filter((building) => building.defId === "storehouse");
  const desiredCount = Math.min(3, 1 + Math.max(0, storehouses.length - 1) + (state.resourceJobs.length >= 4 ? 1 : 0));
  if (carrierCount >= desiredCount) {
    return state;
  }

  const spawnAnchor = storehouses[carrierCount - 1] ?? storehouses[storehouses.length - 1];
  const spawnTile = spawnAnchor ? nearestRoad(state, spawnAnchor) ?? spawnAnchor.position : { x: 32, y: 50 };
  const profile = carrierProfileForIndex(carrierCount);

  return {
    ...state,
    walkers: [
      ...state.walkers,
      {
        id: `walker-carrier-${state.nextId}`,
        role: "carrier",
        name: carrierCount === 0 ? "Myrine" : `Carrier ${carrierCount + 1}`,
        tile: spawnTile,
        state: "idle",
        path: [],
        moveCooldown: 0,
        homeBuildingId: spawnAnchor?.id,
        fatigue: profile.fatigue,
        haulingSkill: profile.haulingSkill,
        supplyRadius: profile.supplyRadius
      }
    ],
    nextId: state.nextId + 1
  };
}

function assignCarrierJobs(state: GameState): GameState {
  let resourceJobs = [...state.resourceJobs];
  const walkers = [...state.walkers];

  let idleCarrierIndices = walkers
    .map((walker, index) => ({ walker, index }))
    .filter(({ walker }) => walker.role === "carrier" && !walker.assignedJobId && walker.path.length === 0);

  while (idleCarrierIndices.length > 0) {
    const unassignedJobs = resourceJobs.filter((entry) => !entry.assignedWalkerId);
    if (unassignedJobs.length === 0) {
      break;
    }

    let bestPair:
      | {
          index: number;
          walker: WalkerInstance;
          job: ResourceTransferJob;
          score: number;
        }
      | undefined;

    for (const candidate of idleCarrierIndices) {
      for (const job of unassignedJobs) {
        const score = carrierDispatchScore(state, resourceJobs, candidate.walker, job);
        if (!bestPair || score < bestPair.score || (score === bestPair.score && job.id.localeCompare(bestPair.job.id) < 0)) {
          bestPair = {
            index: candidate.index,
            walker: candidate.walker,
            job,
            score
          };
        }
      }
    }

    if (!bestPair) {
      break;
    }

    const sourceBuilding = buildingById(state, bestPair.job.sourceBuildingId);
    if (!sourceBuilding) {
      idleCarrierIndices = idleCarrierIndices.filter((candidate) => candidate.index !== bestPair.index);
      continue;
    }

    resourceJobs = resourceJobs.map((entry) =>
      entry.id === bestPair.job.id ? { ...entry, assignedWalkerId: bestPair.walker.id, phase: "to_source" } : entry
    );
    walkers[bestPair.index] = {
      ...bestPair.walker,
      assignedJobId: bestPair.job.id,
      state: "hauling",
      path: findPath(state, bestPair.walker.tile, nearestRoad(state, sourceBuilding) ?? sourceBuilding.position)
    };
    idleCarrierIndices = idleCarrierIndices.filter((candidate) => candidate.index !== bestPair.index);
  }

  return {
    ...state,
    resourceJobs,
    walkers
  };
}

function assignWalkerTargets(state: GameState): GameState {
  const buildingsById = new Map(state.buildings.map((building) => [building.id, building]));

  const walkers = state.walkers.map<WalkerInstance>((walker) => {
    if (walker.path.length > 0 || walker.moveCooldown > 0) {
      return walker;
    }

    if (walker.role === "priest") {
      const priest = state.priests.find((entry) => entry.walkerId === walker.id);
      if (priest?.currentAssignmentBuildingId) {
        const assignment = buildingsById.get(priest.currentAssignmentBuildingId);
        const home = priest.homeBuildingId ? buildingsById.get(priest.homeBuildingId) : undefined;
        const roadTarget = assignment ? nearestRoad(state, assignment) ?? assignment.position : undefined;
        const homeTarget = home ? nearestRoad(state, home) ?? home.position : { x: 30, y: 53 };
        const target = walker.state === "working" ? homeTarget : roadTarget;
        if (target) {
          return {
            ...walker,
            state: (walker.state === "working" ? "moving" : "working") as WalkerState,
            path: findPath(state, walker.tile, target)
          };
        }
      }
    }

    if (walker.role === "custodian" && !walker.assignmentBuildingId) {
      const degraded = [...state.buildings].sort((left, right) => left.condition - right.condition)[0];
      if (degraded && degraded.condition < degraded.maxCondition) {
        const target = nearestRoad(state, degraded) ?? degraded.position;
        return {
          ...walker,
          state: "repairing" as WalkerState,
          path: findPath(state, walker.tile, target)
        };
      }
    }

    if (walker.role === "carrier") {
      if (walker.assignedJobId) {
        const job = state.resourceJobs.find((entry) => entry.id === walker.assignedJobId);
        const targetBuilding = job
          ? buildingsById.get(job.phase === "to_source" ? job.sourceBuildingId : job.targetBuildingId)
          : undefined;
        if (job && targetBuilding) {
          const targetTile = nearestRoad(state, targetBuilding) ?? targetBuilding.position;
          if (walker.tile.x === targetTile.x && walker.tile.y === targetTile.y) {
            return walker;
          }
          return {
            ...walker,
            state: (job.phase === "to_source" ? "hauling" : "delivering") as WalkerState,
            path: findPath(state, walker.tile, targetTile)
          };
        }
      }

      if (walker.carrying) {
        return {
          ...walker,
          state: "idle"
        };
      }
    }

    if (walker.role === "pilgrim") {
      const targetBuilding = state.buildings.find((building) => building.defId === "castalian_spring")
        ?? state.buildings.find((building) => building.defId === "inner_sanctum");
      if (targetBuilding) {
        return {
          ...walker,
          state: "visiting" as WalkerState,
          path: findPath(state, walker.tile, nearestRoad(state, targetBuilding) ?? targetBuilding.position)
        };
      }
    }

    return walker;
  });

  return {
    ...state,
    walkers
  };
}

function moveWalkers(state: GameState): GameState {
  const walkers = state.walkers.map<WalkerInstance>((walker) => {
    const isCarrier = walker.role === "carrier";
    const activeCarrierJob = isCarrier && Boolean(
      walker.assignedJobId
        || walker.carrying
        || walker.state === "hauling"
        || walker.state === "delivering"
    );
    const haulingSkill = walker.haulingSkill ?? 55;
    const fatigueDelta = isCarrier
      ? activeCarrierJob
        ? Math.max(0.08, 0.18 - haulingSkill / 700)
        : -(0.18 + haulingSkill / 900)
      : 0;
    const nextFatigue = isCarrier
      ? Math.max(0, Math.min(100, (walker.fatigue ?? 0) + fatigueDelta))
      : undefined;

    if (walker.moveCooldown > 0) {
      return {
        ...walker,
        moveCooldown: walker.moveCooldown - 1,
        fatigue: nextFatigue
      };
    }

    const [next, ...rest] = walker.path;
    if (!next) {
      return {
        ...walker,
        fatigue: nextFatigue
      };
    }

    const movedFatigue = isCarrier
      ? Math.max(0, Math.min(100, (nextFatigue ?? walker.fatigue ?? 0) + (activeCarrierJob ? 0.45 : 0.08)))
      : nextFatigue;
    const fatigueSlowdown = isCarrier ? Math.floor((movedFatigue ?? 0) / 30) : 0;
    const baseCooldown = 6 + fatigueSlowdown;
    const swiftReduction = walkerHasTrait(walker, "swift") ? 0.25 : 0;
    const finalCooldown = Math.max(1, Math.round(baseCooldown * (1 - swiftReduction)));

    return {
      ...walker,
      tile: next,
      path: rest,
      moveCooldown: finalCooldown,
      fatigue: movedFatigue
    };
  });

  return {
    ...state,
    walkers
  };
}

function advanceConstruction(building: BuildingInstance, state: GameState, events: GameEvent[]): BuildingInstance {
  if (!isBuildingUnderConstruction(building)) {
    return building;
  }
  const work = building.constructionWork!;
  const progress = building.constructionProgress ?? 0;

  // Each tick, an unassigned custodian near the building advances construction by 1 work unit
  const nearbyCustodian = state.walkers.find(
    (walker) => walker.role === "custodian"
      && !walker.assignmentBuildingId
      && Math.abs(walker.tile.x - building.position.x) <= 2
      && Math.abs(walker.tile.y - building.position.y) <= 2
  );
  if (!nearbyCustodian) {
    return building;
  }

  const speedMultiplier = getTechConstructionSpeedMultiplier(state);
  const builderBonus = walkerHasTrait(nearbyCustodian, "skilled_builder") ? 1.30 : 1.0;
  const nextProgress = Math.min(work, progress + 1 * speedMultiplier * builderBonus);
  if (nextProgress >= work) {
    // Construction complete — grant starting resources and full condition
    const def = buildingDefs[building.defId];
    events.push({ type: "ConstructionComplete", buildingId: building.id, defId: building.defId });
    return {
      ...building,
      constructionProgress: work,
      condition: def.maxCondition,
      storedResources: { ...def.startingResources }
    };
  }
  return { ...building, constructionProgress: nextProgress };
}

function processBuildings(state: GameState, events: GameEvent[]): GameState {
  let resources = state.resources;
  const buildings = state.buildings.map((building) => {
    const def = buildingDefs[building.defId];
    let next = advanceConstruction(building, state, events);

    // Skip all processing for buildings still under construction
    if (isBuildingUnderConstruction(next)) {
      return next;
    }
    next = { ...next };

    if (building.defId === "eternal_flame_brazier") {
      const oil = next.storedResources.olive_oil ?? 0;
      const consumption = (def.upkeep.olive_oil ?? 0) * getTechUpkeepMultiplier(state, "eternal_flame_brazier", "olive_oil");
      const actualConsumption = Math.min(oil, consumption);
      const nextOil = Math.max(0, oil - actualConsumption);
      next = {
        ...next,
        storedResources: {
          ...next.storedResources,
          olive_oil: nextOil
        }
      };
      if (actualConsumption > 0) {
        events.push({ type: "ResourceConsumed", resourceId: "olive_oil", amount: actualConsumption });
        resources = updateResourceLedger(resources, "olive_oil", -actualConsumption);
      }
      if (nextOil <= 0.05) {
        next = {
          ...next,
          condition: Math.max(0, next.condition - 0.02)
        };
      }
    }

    if (building.defId === "inner_sanctum") {
      const incenseUpkeepMult = getTechUpkeepMultiplier(state, "inner_sanctum", "incense");
      const incenseDemand = (state.consultation.mode === "open" ? 0.035 : 0.01) * incenseUpkeepMult;
      const waterDemand = state.consultation.mode === "open" ? 0.03 : 0.008;
      const availableIncense = next.storedResources.incense ?? 0;
      const availableWater = next.storedResources.sacred_water ?? 0;
      const actualIncense = Math.min(availableIncense, incenseDemand);
      const actualWater = Math.min(availableWater, waterDemand);
      next = {
        ...next,
        storedResources: {
          ...next.storedResources,
          incense: Math.max(0, availableIncense - actualIncense),
          sacred_water: Math.max(0, availableWater - actualWater)
        }
      };
      if (actualIncense > 0) {
        events.push({ type: "ResourceConsumed", resourceId: "incense", amount: actualIncense });
        resources = updateResourceLedger(resources, "incense", -actualIncense);
      }
      if (actualWater > 0) {
        events.push({ type: "ResourceConsumed", resourceId: "sacred_water", amount: actualWater });
        resources = updateResourceLedger(resources, "sacred_water", -actualWater);
      }
    }

    const processRecipeBuilding = () => {
      if (def.productionCycle) return; // handled by advanceWorkerPhases
      if (!def.recipes || def.recipes.length === 0) {
        return;
      }

      for (const recipe of def.recipes) {
        if (recipe.requiresRoles?.length && next.assignedPriestIds.length === 0) {
          continue;
        }

        let throughput = recipe.dailyRate / state.clock.ticksPerDay;

        // Worker-gated production: if building requires custodians, check assignedWorkerIds
        const requiredCustodians = def.staffing?.custodians ?? 0;
        if (requiredCustodians > 0 && !recipe.requiresRoles?.length) {
          if (next.assignedWorkerIds.length === 0) {
            continue; // No workers assigned — skip production
          }
          const staffingRatio = Math.min(1, next.assignedWorkerIds.length / requiredCustodians);
          throughput *= staffingRatio;

          // Worker efficiency: hunger, traits (industrious), skill level, and morale
          const workers = next.assignedWorkerIds
            .map((id) => state.walkers.find((w) => w.id === id))
            .filter(Boolean) as WalkerInstance[];
          if (workers.length > 0) {
            const avgEfficiency = workers.reduce((sum, w) => {
              let eff = 1.0;
              if ((w.hungerTicks ?? 0) >= HUNGER_STARVING_TICKS) eff = STARVING_EFFICIENCY;
              // Apply trait, skill, and morale multipliers
              eff *= getWorkerEfficiency(w);
              return sum + eff;
            }, 0) / workers.length;
            throughput *= avgEfficiency;
          }
        }
        if (throughput <= 0) {
          continue;
        }

        for (const [resourceId, amount] of Object.entries(recipe.consumes) as [ResourceId, number][]) {
          if (!amount) {
            continue;
          }
          const available = next.storedResources[resourceId] ?? 0;
          throughput = Math.min(throughput, available / amount);
        }

        for (const [resourceId, amount] of Object.entries(recipe.produces) as [ResourceId, number][]) {
          if (!amount) {
            continue;
          }
          const openCapacity = Math.max(0, storageCapFor(next, resourceId, state) - (next.storedResources[resourceId] ?? 0));
          throughput = Math.min(throughput, openCapacity / amount);
        }

        // Seasonal production multiplier — only raw resources have seasonal curves
        let seasonalMult = 1.0;
        for (const resourceId of Object.keys(recipe.produces) as ResourceId[]) {
          const rDef = resourceDefs.find((r) => r.id === resourceId);
          const mult = rDef?.seasonalMultipliers?.[state.clock.season as "Spring" | "Summer" | "Autumn" | "Winter"];
          if (mult !== undefined) {
            seasonalMult = Math.min(seasonalMult, mult);
          }
        }
        throughput *= seasonalMult;

        // Tech-based production bonus
        throughput *= getTechProductionMultiplier(state, building.defId, recipe.id);

        // Relic and sacred site production bonus
        const relicProductionBonus = getRelicBonus(state, "resource_production");
        const sacredProductionBonus = getSacredSiteBonus(state, "resource_production");
        if (relicProductionBonus > 0 || sacredProductionBonus > 0) {
          throughput *= 1 + (relicProductionBonus + sacredProductionBonus) / 100;
        }

        // Adjacency bonus
        throughput *= computeAdjacencyMultiplier(next, state.buildings, def);

        // Condition-based efficiency — no penalty above 80%, linear ramp below
        const conditionRatio = next.condition / next.maxCondition;
        const conditionEfficiency = conditionRatio >= 0.8 ? 1.0
          : conditionRatio >= 0.5 ? 0.6 + (conditionRatio - 0.5) * (0.4 / 0.3)
          : conditionRatio * 1.2;
        throughput *= conditionEfficiency;

        if (throughput <= 0) {
          continue;
        }

        for (const [resourceId, amount] of Object.entries(recipe.consumes) as [ResourceId, number][]) {
          if (!amount) {
            continue;
          }
          const delta = amount * throughput;
          next = {
            ...next,
            storedResources: {
              ...next.storedResources,
              [resourceId]: Math.max(0, (next.storedResources[resourceId] ?? 0) - delta)
            }
          };
          resources = updateResourceLedger(resources, resourceId, -delta);
          events.push({ type: "ResourceConsumed", resourceId, amount: delta });
        }

        for (const [resourceId, amount] of Object.entries(recipe.produces) as [ResourceId, number][]) {
          if (!amount) {
            continue;
          }
          const delta = amount * throughput;
          next = {
            ...next,
            storedResources: {
              ...next.storedResources,
              [resourceId]: Math.min(storageCapFor(next, resourceId, state), (next.storedResources[resourceId] ?? 0) + delta)
            }
          };
          resources = updateResourceLedger(resources, resourceId, delta);
        }

        if (building.defId === "sacrificial_altar") {
          next = {
            ...next,
            condition: Math.min(next.maxCondition, next.condition + throughput * 4)
          };
        }
      }
    };

    if (def.recipes && def.recipes.length > 0) {
      processRecipeBuilding();
    }

    if (next.requiresPriest && next.assignedPriestIds.length === 0) {
      const degradedCondition = Math.max(0, next.condition - 0.03);
      if (Math.floor(degradedCondition) !== Math.floor(next.condition)) {
        events.push({ type: "BuildingDegraded", buildingId: next.id, condition: degradedCondition });
      }
      next = {
        ...next,
        condition: degradedCondition
      };
    }

    // Universal slow age decay: ~2.4 condition/day = ~42 days to fully degrade
    const AGE_DECAY_PER_TICK = 0.0005;
    next = { ...next, condition: Math.max(0, next.condition - AGE_DECAY_PER_TICK) };

    return next;
  });

  return {
    ...state,
    buildings,
    resources
  };
}

function processCarriers(state: GameState): GameState {
  let nextState = state;

  for (const job of state.resourceJobs) {
    if (!job.assignedWalkerId) {
      continue;
    }

    const walker = nextState.walkers.find((entry) => entry.id === job.assignedWalkerId);
    if (!walker || walker.path.length > 0) {
      continue;
    }

    const sourceBuilding = buildingById(nextState, job.sourceBuildingId);
    const targetBuilding = buildingById(nextState, job.targetBuildingId);
    if (!sourceBuilding || !targetBuilding) {
      continue;
    }

    if (job.phase === "to_source") {
      const available = sourceBuilding.storedResources[job.resourceId] ?? 0;
      const transferAmount = Math.min(job.amount, available);
      if (transferAmount <= 0) {
        nextState = {
          ...nextState,
          resourceJobs: nextState.resourceJobs.filter((entry) => entry.id !== job.id),
          walkers: nextState.walkers.map((entry) =>
            entry.id === walker.id
              ? { ...entry, assignedJobId: undefined, state: "idle", carrying: undefined, carryingAmount: undefined }
              : entry
          )
        };
        continue;
      }

      nextState = {
        ...nextState,
        buildings: nextState.buildings.map((building) =>
          building.id === sourceBuilding.id
            ? {
                ...building,
                storedResources: {
                  ...building.storedResources,
                  [job.resourceId]: Math.max(0, (building.storedResources[job.resourceId] ?? 0) - transferAmount)
                }
              }
            : building
        ),
        resourceJobs: nextState.resourceJobs.map((entry) =>
          entry.id === job.id ? { ...entry, phase: "to_target", amount: transferAmount } : entry
        ),
        walkers: nextState.walkers.map((entry) =>
          entry.id === walker.id
            ? {
                ...entry,
                carrying: job.resourceId,
                carryingAmount: transferAmount,
                state: "delivering",
                path: findPath(nextState, entry.tile, nearestRoad(nextState, targetBuilding) ?? targetBuilding.position)
              }
            : entry
        )
      };
      continue;
    }

    nextState = {
      ...nextState,
      buildings: nextState.buildings.map((building) =>
        building.id === targetBuilding.id
          ? {
              ...building,
              storedResources: {
                ...building.storedResources,
                [job.resourceId]: (building.storedResources[job.resourceId] ?? 0) + (walker.carryingAmount ?? job.amount)
              }
            }
          : building
      ),
      resourceJobs: nextState.resourceJobs.filter((entry) => entry.id !== job.id),
      walkers: nextState.walkers.map((entry) =>
        entry.id === walker.id
          ? {
              ...entry,
              carrying: undefined,
              carryingAmount: undefined,
              assignedJobId: undefined,
              state: "idle",
              path: []
            }
          : entry
      )
    };
  }

  return nextState;
}

function processCustodianRepairs(state: GameState): GameState {
  const custodian = state.walkers.find((walker) => walker.role === "custodian" && !walker.assignmentBuildingId && walker.path.length === 0 && walker.state === "repairing");
  if (!custodian) {
    return state;
  }

  const isDevout = walkerHasTrait(custodian, "devout");

  const buildings = state.buildings.map((building) => {
    if (Math.abs(building.position.x - custodian.tile.x) + Math.abs(building.position.y - custodian.tile.y) > 2) {
      return building;
    }
    const baseRepair = 0.12;
    const devoutBonus = isDevout && RITUAL_BUILDING_IDS.has(building.defId) ? 0.15 : 0;
    return {
      ...building,
      condition: Math.min(building.maxCondition, building.condition + baseRepair * (1 + devoutBonus))
    };
  });

  return {
    ...state,
    buildings
  };
}

function applyFactionReactions(
  factions: GameState["factions"],
  reactions: ReturnType<typeof evaluateResolutionObservers>
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

function resolveDueConsequences(state: GameState, events: GameEvent[]): GameState {
  const absoluteDay = getAbsoluteDay(state.clock);
  const historyById = new Map(state.consultation.history.map((entry) => [entry.id, entry]));
  const resolvedProphecies = new Map<
    string,
    {
      resolvedDay: number;
      resolutionReport: string;
      credibilityDelta: number;
    }
  >();
  let nextFactions = state.factions;
  const feedItems: GameState["eventFeed"] = [];
  const resolved = state.consequences.map((consequence) => {
    if (consequence.resolved || consequence.dueDay > absoluteDay) {
      return consequence;
    }
    const prophecy = historyById.get(consequence.prophecyId);
    if (!prophecy) {
      return consequence;
    }

    const { delta, report } = resolveConsequence(consequence, prophecy.semantics);
    const faction = nextFactions[consequence.factionId];
    resolvedProphecies.set(consequence.prophecyId, {
      resolvedDay: absoluteDay,
      resolutionReport: report,
      credibilityDelta: delta
    });
    // F1.4 — Track faction memory on consequence resolution
    const success = delta > 0;
    const updatedFaction = updateFactionMemory(
      {
        ...faction,
        credibility: Math.max(0, Math.min(100, faction.credibility + delta)),
        lastOutcome: report,
        history: [report, ...faction.history].slice(0, 4)
      },
      success
    );
    nextFactions = {
      ...nextFactions,
      [consequence.factionId]: updatedFaction
    };
    const observerReactions = evaluateResolutionObservers(
      {
        ...state,
        factions: nextFactions
      },
      consequence.factionId,
      consequence.outcome,
      delta
    );
    nextFactions = applyFactionReactions(nextFactions, observerReactions);
    feedItems.unshift({
      id: `event-resolution-${consequence.id}`,
      day: state.clock.day,
      text: report
    });
    if (observerReactions[0]) {
      feedItems.unshift({
        id: `event-resolution-observer-${consequence.id}-${observerReactions[0].factionId}`,
        day: state.clock.day,
        text: observerReactions[0].historyEntry
      });
    }
    events.push({ type: "ConsequenceResolved", consequenceId: consequence.id, factionId: consequence.factionId, delta });

    return {
      ...consequence,
      resolved: true,
      credibilityDelta: delta,
      report
    };
  });

  return {
    ...state,
    consultation: {
      ...state.consultation,
      history: state.consultation.history.map((entry) => {
        const resolution = resolvedProphecies.get(entry.id);
        if (!resolution) {
          return entry;
        }
        return {
          ...entry,
          resolved: true,
          resolvedDay: resolution.resolvedDay,
          resolutionReport: resolution.resolutionReport,
          credibilityDelta: resolution.credibilityDelta
        };
      })
    },
    factions: nextFactions,
    consequences: resolved,
    eventFeed: [...feedItems, ...state.eventFeed].slice(0, 8)
  };
}

function spawnPilgrimIfNeeded(state: GameState): GameState {
  const pilgrimCount = state.walkers.filter((walker) => walker.role === "pilgrim").length;
  const roadNearGate = isRoad(state, 30, 58) || isRoad(state, 30, 57) || isRoad(state, 29, 58);
  if (!roadNearGate || pilgrimCount >= 3 || state.clock.tickOfDay % 200 !== 0) {
    return state;
  }

  return {
    ...state,
    walkers: [
      ...state.walkers,
      {
        id: `walker-pilgrim-${state.nextId}`,
        role: "pilgrim",
        name: `Pilgrim ${state.nextId}`,
        tile: { x: 30, y: 58 },
        state: "idle",
        path: [],
        moveCooldown: 0
      }
    ],
    nextId: state.nextId + 1
  };
}

function cleanupPilgrims(state: GameState): GameState {
  return {
    ...state,
    walkers: state.walkers.filter((walker) => !(walker.role === "pilgrim" && walker.path.length === 0 && walker.tile.x === 30 && walker.tile.y >= 58))
  };
}

function describePriestPoliticsShift(
  state: GameState,
  previousPressure: number,
  previousStatus?: PriestPoliticsState["status"]
): string | undefined {
  const politics = state.priestPolitics;
  if (!politics) {
    return undefined;
  }

  const dominantBloc = politics.blocs.find((bloc) => bloc.id === politics.dominantBlocId);
  const pressureDelta = politics.overallPressure - previousPressure;
  const statusChanged = previousStatus !== undefined && previousStatus !== politics.status;

  if (!statusChanged && Math.abs(pressureDelta) < 8) {
    return undefined;
  }

  const pressureText = pressureDelta > 0 ? `Pressure rises to ${politics.overallPressure}.` : `Pressure eases to ${politics.overallPressure}.`;
  return `${dominantBloc?.label ?? "Priestly factions"} take the chamber. ${pressureText} ${politics.currentIssue}`;
}

function getRelicBonus(state: GameState, effectType: string): number {
  const claimed = state.excavation?.claimedRelics ?? [];
  return claimed.reduce((sum, relic) =>
    relic.effect.type === effectType ? sum + relic.effect.value : sum, 0
  );
}

function getSacredSiteBonus(state: GameState, effectType: string): number {
  const sites = state.excavation?.sacredSites ?? [];
  return sites
    .filter((s) => s.active)
    .reduce((sum, site) =>
      sum + site.bonuses.reduce((bSum, b) => b.type === effectType ? bSum + b.value : bSum, 0),
    0);
}

function advanceExcavations(state: GameState): GameState {
  const excavation = state.excavation;
  if (!excavation) {
    return state;
  }

  let nextExcavation = excavation;
  const excavationFeedItems: GameState["eventFeed"] = [];

  for (const site of nextExcavation.sites) {
    if (site.status !== "excavating") {
      continue;
    }

    // Dig rate: base 0.5 per day, +0.3 if priest assigned, plus skill and relic bonuses
    const assignedPriest = site.assignedPriestId
      ? state.priests.find((p) => p.id === site.assignedPriestId)
      : undefined;
    const priestSkillBonus = assignedPriest ? assignedPriest.skill / 200 : 0;
    const relicSkillBonus = getRelicBonus(state, "priest_skill") / 100;
    const digRate = (assignedPriest ? 0.8 : 0.5) + priestSkillBonus + relicSkillBonus;
    const newDepth = Math.min(site.maxDepth, site.depth + digRate);
    const previousWholeDepth = Math.floor(site.depth);
    const currentWholeDepth = Math.floor(newDepth);

    let updatedLayers = site.layers;
    // Reveal any newly reached layers
    if (currentWholeDepth > previousWholeDepth) {
      updatedLayers = site.layers.map((layer) => {
        if (layer.depth <= currentWholeDepth && !layer.revealed) {
          const revealedLayer = { ...layer, revealed: true };

          if (revealedLayer.contents === "pottery") {
            excavationFeedItems.push({
              id: `event-excavation-pottery-${site.id}-${layer.depth}-${state.clock.day}`,
              day: state.clock.day,
              text: `Excavators unearth pottery fragments at depth ${layer.depth} of ${site.id.replace(/-/g, " ")}.`
            });
          } else if (revealedLayer.contents === "relic" || revealedLayer.contents === "sacred_fragment") {
            excavationFeedItems.push({
              id: `event-excavation-relic-${site.id}-${layer.depth}-${state.clock.day}`,
              day: state.clock.day,
              text: `A significant find at depth ${layer.depth}! ${revealedLayer.contents === "sacred_fragment" ? "A sacred fragment glows with ancient power." : "A relic of the old world is uncovered."}`
            });
          } else if (revealedLayer.contents === "ancient_chamber") {
            excavationFeedItems.push({
              id: `event-excavation-chamber-${site.id}-${layer.depth}-${state.clock.day}`,
              day: state.clock.day,
              text: `Workers break through into an ancient chamber beneath the precinct! The air hums with residual power.`
            });
            // Discovering an ancient chamber also discovers the nearest undiscovered sacred site
            const undiscoveredSacred = nextExcavation.sacredSites.find((s) => !s.discovered);
            if (undiscoveredSacred) {
              nextExcavation = {
                ...nextExcavation,
                sacredSites: nextExcavation.sacredSites.map((s) =>
                  s.id === undiscoveredSacred.id
                    ? { ...s, discovered: true }
                    : s
                )
              };
              excavationFeedItems.push({
                id: `event-sacred-discovered-${undiscoveredSacred.id}-${state.clock.day}`,
                day: state.clock.day,
                text: `A ${undiscoveredSacred.kind.replace(/_/g, " ")} has been discovered! It can be activated with the proper rites.`
              });
            }
          }

          return revealedLayer;
        }
        return layer;
      });
    }

    const exhausted = newDepth >= site.maxDepth;
    const newStatus = exhausted ? "exhausted" as const : "excavating" as const;

    if (exhausted) {
      excavationFeedItems.push({
        id: `event-excavation-exhausted-${site.id}-${state.clock.day}`,
        day: state.clock.day,
        text: `Excavation at ${site.id.replace(/-/g, " ")} has reached bedrock. No further digging is possible.`
      });
    }

    nextExcavation = {
      ...nextExcavation,
      sites: nextExcavation.sites.map((s) =>
        s.id === site.id
          ? {
              ...s,
              depth: newDepth,
              status: newStatus,
              layers: updatedLayers,
              assignedPriestId: exhausted ? undefined : s.assignedPriestId
            }
          : s
      )
    };
  }

  // Chance to discover undiscovered sites (roughly every 10 days one might be found)
  const undiscoveredSites = nextExcavation.sites.filter((s) => s.status === "undiscovered");
  if (undiscoveredSites.length > 0 && state.clock.day % 10 === 0) {
    const siteToDiscover = undiscoveredSites[0];
    nextExcavation = {
      ...nextExcavation,
      sites: nextExcavation.sites.map((s) =>
        s.id === siteToDiscover.id
          ? { ...s, status: "discovered" as const }
          : s
      )
    };
    excavationFeedItems.push({
      id: `event-excavation-discovered-${siteToDiscover.id}-${state.clock.day}`,
      day: state.clock.day,
      text: `Scouts have found a promising excavation site at (${siteToDiscover.tile.x}, ${siteToDiscover.tile.y}).`
    });
  }

  return {
    ...state,
    excavation: nextExcavation,
    eventFeed: [...excavationFeedItems, ...state.eventFeed].slice(0, 8),
    advisorMessages: excavationFeedItems.length > 0
      ? [
          ...excavationFeedItems.map((item) => ({
            id: `advisor-excavation-${item.id}`,
            advisorId: "hierophant",
            text: item.text,
            severity: "info" as const
          })),
          ...state.advisorMessages
        ].slice(0, 4)
      : state.advisorMessages
  };
}

function advanceLegendaryAvailability(state: GameState): GameState {
  const year = state.clock.year;
  const completedIds = new Set(
    (state.legendaryProgress ?? [])
      .filter((p) => p.completed)
      .map((p) => p.consultationId)
  );
  const inProgressIds = new Set(
    (state.legendaryProgress ?? [])
      .filter((p) => !p.completed)
      .map((p) => p.consultationId)
  );
  const previousAvailable = state.availableLegendary ?? [];

  const newlyAvailable: LegendaryConsultationId[] = legendaryConsultationIds.filter((id) => {
    const def = legendaryConsultationDefs[id];
    return year >= def.minYear && !completedIds.has(id) && !inProgressIds.has(id);
  });

  // Detect newly appearing consultations (not previously in the list)
  const previousSet = new Set(previousAvailable);
  const announcements = newlyAvailable.filter((id) => !previousSet.has(id));

  let nextState: GameState = {
    ...state,
    availableLegendary: newlyAvailable
  };

  for (const id of announcements) {
    const def = legendaryConsultationDefs[id];
    nextState = {
      ...nextState,
      advisorMessages: [
        {
          id: `advisor-legendary-arrival-${id}`,
          advisorId: "hierophant",
          text: `Word reaches Delphi that ${def.figure} seeks the oracle's counsel. A legendary consultation awaits.`,
          severity: "warn" as const
        },
        ...nextState.advisorMessages
      ].slice(0, 5),
      eventFeed: [
        {
          id: `event-legendary-arrival-${id}`,
          day: nextState.clock.day,
          text: `${def.figure} has arrived to consult the oracle.`
        },
        ...nextState.eventFeed
      ].slice(0, 8)
    };
  }

  return nextState;
}

/** Computes the combined production multiplier from completed tech effects. */
function getTechProductionMultiplier(state: GameState, buildingDefId: string, recipeId: string): number {
  if (!state.research?.completedTechIds.length) return 1;
  let multiplier = 1;
  for (const techId of state.research.completedTechIds) {
    const tech = techDefById[techId];
    if (!tech) continue;
    for (const effect of tech.effects) {
      if (effect.kind === "production_bonus" && effect.buildingId === buildingDefId && effect.recipeId === recipeId) {
        multiplier *= effect.multiplier;
      }
    }
  }
  return multiplier;
}

/** Computes the upkeep multiplier from completed tech effects. */
function getTechUpkeepMultiplier(state: GameState, buildingDefId: string, resourceId: string): number {
  if (!state.research?.completedTechIds.length) return 1;
  let multiplier = 1;
  for (const techId of state.research.completedTechIds) {
    const tech = techDefById[techId];
    if (!tech) continue;
    for (const effect of tech.effects) {
      if (effect.kind === "upkeep_reduction" && effect.buildingId === buildingDefId && effect.resourceId === resourceId) {
        multiplier *= effect.multiplier;
      }
    }
  }
  return multiplier;
}

/** Computes the construction speed multiplier from completed tech effects. */
function getTechConstructionSpeedMultiplier(state: GameState): number {
  if (!state.research?.completedTechIds.length) return 1;
  let multiplier = 1;
  for (const techId of state.research.completedTechIds) {
    const tech = techDefById[techId];
    if (!tech) continue;
    for (const effect of tech.effects) {
      if (effect.kind === "construction_speed") {
        multiplier *= effect.multiplier;
      }
    }
  }
  return multiplier;
}

/** Computes the carrier supply radius bonus from completed tech effects. */
function getTechCarrierCapacityBonus(state: GameState): number {
  if (!state.research?.completedTechIds.length) return 0;
  let bonus = 0;
  for (const techId of state.research.completedTechIds) {
    const tech = techDefById[techId];
    if (!tech) continue;
    for (const effect of tech.effects) {
      if (effect.kind === "carrier_capacity") {
        bonus += effect.bonus;
      }
    }
  }
  return bonus;
}

function advanceResearch(state: GameState, events: GameEvent[]): GameState {
  if (!state.research?.activeTechId) return state;

  const tech = techDefById[state.research.activeTechId];
  if (!tech) return state;

  const knowledgePerTick = state.resources.knowledge.amount > 0
    ? Math.min(state.resources.knowledge.amount, 0.01)
    : 0;

  if (knowledgePerTick <= 0) return state;

  const newProgress = state.research.activeTechProgress + knowledgePerTick;
  const newKnowledgeAmount = state.resources.knowledge.amount - knowledgePerTick;

  if (newProgress >= tech.knowledgeCost) {
    events.push({ type: "TechResearched", techId: state.research.activeTechId });
    return {
      ...state,
      resources: {
        ...state.resources,
        knowledge: {
          ...state.resources.knowledge,
          amount: Math.max(0, newKnowledgeAmount)
        }
      },
      research: {
        ...state.research,
        activeTechId: undefined,
        activeTechProgress: 0,
        knowledgeAccumulated: state.research.knowledgeAccumulated + tech.knowledgeCost,
        completedTechIds: [...state.research.completedTechIds, state.research.activeTechId]
      }
    };
  }

  return {
    ...state,
    resources: {
      ...state.resources,
      knowledge: {
        ...state.resources.knowledge,
        amount: Math.max(0, newKnowledgeAmount)
      }
    },
    research: {
      ...state.research,
      activeTechProgress: newProgress
    }
  };
}

/** Advance worker experience: +1 per 100 ticks when in "working" state. */
function advanceWorkerExperience(state: GameState): GameState {
  let changed = false;
  const walkers = state.walkers.map((walker) => {
    if (walker.role === "pilgrim" || walker.role === "priest") return walker;
    if (walker.state !== "working") return walker;
    const exp = Math.min(100, (walker.experience ?? 0) + 1);
    const newLevel = computeSkillLevel(exp);
    if (exp === (walker.experience ?? 0) && newLevel === (walker.skillLevel ?? 1)) return walker;
    changed = true;
    return {
      ...walker,
      experience: exp,
      skillLevel: newLevel,
    };
  });
  return changed ? { ...state, walkers } : state;
}

/** Daily morale update for workers. */
export function advanceWorkerMorale(state: GameState): GameState {
  let changed = false;
  const walkers = state.walkers.map((walker) => {
    if (walker.role === "pilgrim" || walker.role === "priest") return walker;
    const currentMorale = walker.morale ?? 50;
    let delta = 0;

    const isFed = (walker.hungerTicks ?? 0) === 0;
    const isHoused = walker.homeBuildingId !== undefined;
    const isWorking = walker.assignmentBuildingId !== undefined;
    const isStarving = (walker.hungerTicks ?? 0) >= HUNGER_STARVING_TICKS;

    if (isFed && isHoused && isWorking) {
      delta += 1; // Fed + housed + working → +1/day (cap 80 enforced below)
    }
    if (isStarving) {
      delta -= 5; // Starving → -5/day
    }

    if (delta === 0) return walker;

    let newMorale = currentMorale + delta;
    // Cap at 80 for positive growth, floor at 0
    newMorale = Math.max(0, Math.min(100, newMorale));
    // Positive-only growth caps at 80
    if (delta > 0 && newMorale > 80) newMorale = Math.max(currentMorale, 80);

    if (newMorale === currentMorale) return walker;
    changed = true;
    return { ...walker, morale: newMorale };
  });
  return changed ? { ...state, walkers } : state;
}

export function runSimulationTick(
  state: GameState,
  tickCount: number,
  options?: {
    previousClock?: WorldClock;
  }
): { state: GameState; events: GameEvent[] } {
  let nextState = normalizeCarrierFleet(state);
  const events: GameEvent[] = [];
  const previousClock = options?.previousClock ?? state.clock;

  for (let index = 0; index < tickCount; index += 1) {
    nextState = rebalanceStorehouseBuffers(nextState);
    nextState = scheduleResourceJobs(nextState);
    nextState = ensureCarrierStaffing(nextState);
    nextState = assignCarrierJobs(nextState);
    nextState = assignWalkerTargets(nextState);
    nextState = moveWalkers(nextState);
    nextState = processCarriers(nextState);
    const workerPhaseResult = advanceWorkerPhases(nextState, events);
    nextState = workerPhaseResult.state;
    nextState = processBuildings(nextState, events);
    nextState = processCustodianRepairs(nextState);
    nextState = processFoodConsumption(nextState, events);
    // Sprint 5: Resource spoilage
    nextState = processSpoilage(nextState);
    // Worker experience gain: +1 experience per 100 ticks when working
    if (nextState.clock.tick % 100 === 0) {
      nextState = advanceWorkerExperience(nextState);
    }
    nextState = advanceResearch(nextState, events);
    // Initialize city prosperity if missing
    if (!nextState.cityProsperity) {
      nextState = { ...nextState, cityProsperity: DEFAULT_CITY_PROSPERITY };
    }
    // Process visitor economy every 10 ticks
    if (nextState.clock.tick % 10 === 0) {
      const visitorResult = processVisitorEconomy(nextState);
      nextState = visitorResult.state;
      events.push(...visitorResult.events);
    }
    nextState = spawnPilgrimIfNeeded(nextState);
    nextState = cleanupPilgrims(nextState);
    nextState = {
      ...nextState,
      pythia: {
        ...nextState.pythia,
        needs: {
          purification: Math.min(100, nextState.pythia.needs.purification + 0.02),
          rest: Math.min(100, nextState.pythia.needs.rest + (nextState.consultation.mode === "open" ? 0.08 : 0.015)),
          pilgrimageCooldown: Math.max(0, nextState.pythia.needs.pilgrimageCooldown - 0.01),
          food: Math.min(100, nextState.pythia.needs.food + 0.018)
        }
      }
    };
  }

  if (nextState.clock.day !== previousClock.day) {
    // Daily morale processing for workers
    nextState = advanceWorkerMorale(nextState);
    events.push({ type: "DayAdvanced", day: nextState.clock.day });
    const previousPressure = nextState.priestPolitics?.overallPressure ?? 0;
    const previousStatus = nextState.priestPolitics?.status;
    const rivalUpdate = advanceRivalOracles(nextState);
    const politicsState: GameState = {
      ...nextState,
      factions: rivalUpdate.factions,
      rivalOracles: rivalUpdate.rivalOracles
    };
    nextState = {
      ...politicsState,
      priestPolitics: advancePriestPoliticsState(politicsState)
    };
    const priestPoliticsShift = describePriestPoliticsShift(nextState, previousPressure, previousStatus);
    for (const incident of rivalUpdate.incidents.slice(0, 2)) {
      events.push({
        type: "RivalOracleOperation",
        rivalId: incident.rivalId,
        operationId: incident.operationId,
        day: nextState.clock.day
      });
    }
    nextState.eventFeed = [
      ...rivalUpdate.feedItems,
      ...(priestPoliticsShift
        ? [{
            id: `event-priest-politics-${nextState.clock.day}`,
            day: nextState.clock.day,
            text: priestPoliticsShift
          }]
        : []),
      {
        id: `event-day-${nextState.clock.day}`,
        day: nextState.clock.day,
        text: `Day ${nextState.clock.day}: the precinct opens with ${nextState.resources.gold.amount.toFixed(0)} gold in reserve.`
      },
      ...nextState.eventFeed
    ].slice(0, 8);
  }

  if (nextState.clock.day !== previousClock.day && nextState.excavation) {
    nextState = advanceExcavations(nextState);
  }

  if (nextState.clock.day !== previousClock.day) {
    const depositRegen = regenerateDeposits(nextState);
    nextState = depositRegen.state;
    events.push(...depositRegen.events);
  }

  if (nextState.clock.day !== previousClock.day) {
    nextState = advanceEventChains(nextState, events);
  }

  if (nextState.clock.day !== previousClock.day && nextState.consultation.mode === "idle") {
    const consultation = maybeCreateConsultation(nextState);
    if (consultation) {
      nextState.consultation = {
        ...nextState.consultation,
        mode: "pending",
        current: consultation
      };
    }
  }

  if (nextState.clock.month !== previousClock.month) {
    const politicalUpdate = advancePoliticalClimate(nextState);
    const campaignUpdate = advanceCampaignState(
      {
        ...nextState,
        factions: politicalUpdate.factions,
        philosophers: politicalUpdate.philosophers,
        tradeOffers: politicalUpdate.tradeOffers
      },
      politicalUpdate.factions
    );
    const hegemonRepDelta = politicalUpdate.reputationDelta ?? 0;
    nextState = {
      ...nextState,
      factions: politicalUpdate.factions,
      philosophers: politicalUpdate.philosophers,
      tradeOffers: politicalUpdate.tradeOffers,
      ...(politicalUpdate.resources ? { resources: politicalUpdate.resources } : {}),
      campaign: {
        ...campaignUpdate.campaign,
        reputation: {
          ...campaignUpdate.campaign.reputation,
          score: Math.max(0, campaignUpdate.campaign.reputation.score + hegemonRepDelta)
        },
        worldMap: {
          ...campaignUpdate.campaign.worldMap,
          ...(politicalUpdate.links ? { links: politicalUpdate.links } : {})
        }
      },
      eventFeed: [...politicalUpdate.feedItems, ...campaignUpdate.feedItems, ...nextState.eventFeed]
    };

    // Advance world history AFTER faction politics processing
    nextState = advanceWorldHistory(nextState);

    // Advance age system at year boundaries
    if (nextState.clock.year !== previousClock.year) {
      const currentAgeState = nextState.age ?? createInitialAgeState();
      const previousAgeId = currentAgeState.currentAgeId;
      const updatedAgeState = advanceAge(currentAgeState, nextState.clock.year, nextState.clock.day, nextState.endlessMode);

      if (updatedAgeState.currentAgeId !== previousAgeId) {
        const newAgeDef = ageDefs[updatedAgeState.currentAgeIndex]!;
        const previousAgeDef = ageDefs[currentAgeState.currentAgeIndex]!;
        const ageNarration = narrateAgeTransition(
          previousAgeDef.name,
          newAgeDef.name,
          nextState.worldSeed + nextState.clock.year * 97
        );
        nextState = {
          ...nextState,
          age: updatedAgeState,
          advisorMessages: [
            {
              id: `advisor-age-${newAgeDef.id}`,
              advisorId: "hierophant",
              text: `The ${newAgeDef.name} has begun. ${newAgeDef.description}`,
              severity: "warn" as const
            },
            ...nextState.advisorMessages
          ].slice(0, 5),
          eventFeed: [
            {
              id: `event-age-${newAgeDef.id}`,
              day: nextState.clock.day,
              text: ageNarration
            },
            ...nextState.eventFeed
          ].slice(0, 8)
        };
      } else {
        nextState = {
          ...nextState,
          age: updatedAgeState
        };
      }

      // Check for newly available legendary consultations
      nextState = advanceLegendaryAvailability(nextState);
    }

    // Advance espionage monthly
    nextState = advanceEspionage(nextState);

    // Advance prophecy arcs monthly
    nextState = advanceProphecyArcs(nextState);

    // Resolve follow-up obligations and contradictions monthly
    nextState = resolveFollowUp(nextState);
    nextState = resolveContradictions(nextState);

    // Advance prophecy belief strength monthly
    nextState = advanceBeliefStrength(nextState);

    // Apply interpretation branch effects monthly
    nextState = applyInterpretationBranchEffects(nextState);

    // Advance decline mechanics monthly
    nextState = advanceDecline(nextState);

    // Advance economy systems monthly
    nextState = updateMarketPrices(nextState);
    nextState = advancePatronContracts(nextState);
    nextState = advanceLoanPayments(nextState);

    // Generate monthly trade offers
    const tradeResult = processTradeOffers(nextState);
    nextState = tradeResult.state;

    // Advance diplomacy and rival strategies monthly
    nextState = advanceDiplomacy(nextState);
    nextState = advanceRivalStrategies(nextState);

    // Advance priest experience and character arcs monthly
    nextState = advancePriestExperience(nextState);
    nextState = advanceCharacterArcs(nextState);

    // Advance festivals monthly
    nextState = advanceFestivals(nextState);

    // Advance city growth monthly
    nextState = advanceCityGrowth(nextState);

    // Advance achievements and hubris monthly
    nextState = checkAchievements(nextState);
    nextState = advanceHubris(nextState);

    // Advance weather at season transitions
    if (nextState.clock.season !== previousClock.season) {
      nextState = advanceWeather(nextState);
    }

    // Final event feed trim for the monthly block
    if (nextState.eventFeed.length > 12) {
      nextState = {
        ...nextState,
        eventFeed: nextState.eventFeed.slice(0, 12)
      };
    }
  }

  nextState = resolveDueConsequences(nextState, events);
  const rawAdvisorMessages = generateAdvisorMessages(nextState);
  const advisorResult = applyAdvisorPersonality(nextState, rawAdvisorMessages);
  nextState.advisorMessages = advisorResult.messages;
  nextState = {
    ...nextState,
    advisorHistory: advisorResult.advisorHistory,
    advisorAccuracy: advisorResult.advisorAccuracy
  };

  if (nextState.clock.day > nextState.lastAutosaveDay && nextState.clock.day % 30 === 0) {
    events.push({ type: "AutosaveTriggered", day: nextState.clock.day });
    nextState = {
      ...nextState,
      lastAutosaveDay: nextState.clock.day
    };
  }

  return {
    state: nextState,
    events
  };
}

export function createBuildingAt(defId: BuildingInstance["defId"], tile: { x: number; y: number }, id: string): BuildingInstance {
  const def = buildingDefs[defId];
  const work = def.constructionWork ?? 0;
  const underConstruction = work > 0;
  return {
    id,
    defId,
    position: tile,
    condition: underConstruction ? 0 : def.maxCondition,
    maxCondition: def.maxCondition,
    requiresPriest: def.requiresPriest,
    assignedPriestIds: [],
    assignedWorkerIds: [],
    // Don't grant starting resources until construction is complete
    storedResources: underConstruction ? {} : { ...def.startingResources },
    connectedToRoad: defId === "sacred_way",
    ...(underConstruction ? { constructionProgress: 0, constructionWork: work } : {})
  };
}
