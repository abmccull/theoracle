import {
  advisorDefs,
  difficultyDefById,
  defaultFactionStates,
  originDefById,
  pythiaArchetypeDefById,
  scenarioDefs,
  type DifficultyId,
  type FactionId,
  type PythiaArchetypeId,
  type OriginId,
  type ResourceId,
  type ScenarioId
} from "@the-oracle/content";

import type {
  BuildingInstance,
  CampaignState,
  FactionState,
  GameState,
  PriestState,
  WalkerInstance
} from "./gameState";
import { createInitialAgeState } from "./ages";
import { normalizeCarrierWalker } from "./carriers";
import { createInitialCampaignState, syncCampaignState } from "./campaign";
import { createInitialCharactersState } from "./characters";
import { createInitialEspionageState } from "./espionage";
import { createInitialExcavationState } from "./excavation";
import { createInitialLegacyState } from "./legacy";
import { createInitialLineageState } from "./lineage";
import { createInitialAchievementProgress } from "../simulation/achievements";
import { createInitialPhilosophersState } from "./philosophers";
import { createInitialPriestPoliticsState } from "./priestPolitics";
import { createInitialProphecyArcState } from "./prophecy";
import { createInitialRivalOraclesState } from "./rivalOracles";
import { createInitialWorldHistoryState } from "./worldHistory";
import { generateTerrainDeposits } from "../terrain/deposits";
import { generateTileTerrain } from "../terrain/generate";
import {
  DEFAULT_WORLD_LINKS,
  buildWorldGeneration,
  normalizeDifficultyId,
  normalizeOriginId,
  normalizePythiaArchetypeId,
  normalizeScenarioId,
  normalizeStartingRegionId,
  normalizeSeedInput,
  type GeneratedFactionSetup,
  type NewRunOptions,
  type WorldGenerationState
} from "./worldGen";

const baseResources: Record<ResourceId, { amount: number; capacity: number; trend: number }> = {
  gold: { amount: 120, capacity: 500, trend: 0 },
  sacred_water: { amount: 30, capacity: 120, trend: 0 },
  olive_oil: { amount: 18, capacity: 100, trend: 0 },
  incense: { amount: 12, capacity: 80, trend: 0 },
  grain: { amount: 40, capacity: 150, trend: 0 },
  sacred_animals: { amount: 0, capacity: 24, trend: 0 },
  bread: { amount: 0, capacity: 80, trend: 0 },
  olives: { amount: 0, capacity: 80, trend: 0 },
  papyrus: { amount: 0, capacity: 50, trend: 0 },
  scrolls: { amount: 0, capacity: 40, trend: 0 },
  logs: { amount: 20, capacity: 60, trend: 0 },
  stone: { amount: 20, capacity: 60, trend: 0 },
  planks: { amount: 0, capacity: 40, trend: 0 },
  cut_stone: { amount: 0, capacity: 40, trend: 0 },
  knowledge: { amount: 0, capacity: 200, trend: 0 }
};

type InitialStateInput = number | string | NewRunOptions;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scenarioFor(scenarioId: ScenarioId) {
  return scenarioDefs.find((scenario) => scenario.id === scenarioId) ?? scenarioDefs[0]!;
}

function createWalker(id: string, role: WalkerInstance["role"], name: string, x: number, y: number): WalkerInstance {
  const walker: WalkerInstance = {
    id,
    role,
    name,
    tile: { x, y },
    state: "idle",
    path: [],
    moveCooldown: 0
  };

  return role === "carrier" ? normalizeCarrierWalker(walker, 0) : walker;
}

function createStarterWalkers(): { walkers: WalkerInstance[]; priests: PriestState[] } {
  const priestWalker = createWalker("walker-priest-1", "priest", "Lykos", 30, 50);
  const custodianWalker = createWalker("walker-custodian-1", "custodian", "Doros", 31, 50);
  const carrierWalker = createWalker("walker-carrier-1", "carrier", "Myrine", 32, 50);

  return {
    walkers: [priestWalker, custodianWalker, carrierWalker],
    priests: [
      {
        id: "priest-1",
        walkerId: priestWalker.id,
        role: "attendant",
        skill: 58,
        morale: 72,
        range: 12
      }
    ]
  };
}

function resolveRunOptions(seedOrOptions: InitialStateInput = 7, originId?: OriginId): {
  seed: number;
  seedText: string;
  originId: OriginId;
  scenarioId: ScenarioId;
  difficultyId: DifficultyId;
  pythiaArchetypeId: PythiaArchetypeId;
  startingRegionId: string;
  worldGeneration: WorldGenerationState;
} {
  const seedInput = typeof seedOrOptions === "object" && seedOrOptions !== null ? seedOrOptions.seed : seedOrOptions;
  const selectedOrigin = typeof seedOrOptions === "object" && seedOrOptions !== null
    ? seedOrOptions.originId
    : originId;
  const selectedScenario = typeof seedOrOptions === "object" && seedOrOptions !== null
    ? seedOrOptions.scenarioId
    : undefined;
  const selectedDifficulty = typeof seedOrOptions === "object" && seedOrOptions !== null
    ? seedOrOptions.difficultyId
    : undefined;
  const selectedPythiaArchetype = typeof seedOrOptions === "object" && seedOrOptions !== null
    ? seedOrOptions.pythiaArchetypeId
    : undefined;
  const selectedStartingRegion = typeof seedOrOptions === "object" && seedOrOptions !== null
    ? seedOrOptions.startingRegionId
    : undefined;
  const { seed, seedText } = normalizeSeedInput(seedInput);
  const normalizedOriginId = normalizeOriginId(selectedOrigin);
  const normalizedScenarioId = normalizeScenarioId(selectedScenario);
  const normalizedDifficultyId = normalizeDifficultyId(selectedDifficulty);
  const normalizedPythiaArchetypeId = normalizePythiaArchetypeId(selectedPythiaArchetype);
  const normalizedStartingRegionId = normalizeStartingRegionId(selectedStartingRegion);

  return {
    seed,
    seedText,
    originId: normalizedOriginId,
    scenarioId: normalizedScenarioId,
    difficultyId: normalizedDifficultyId,
    pythiaArchetypeId: normalizedPythiaArchetypeId,
    startingRegionId: normalizedStartingRegionId,
    worldGeneration: buildWorldGeneration({
      seed: seedText,
      originId: normalizedOriginId,
      scenarioId: normalizedScenarioId,
      difficultyId: normalizedDifficultyId,
      pythiaArchetypeId: normalizedPythiaArchetypeId,
      startingRegionId: normalizedStartingRegionId
    })
  };
}

function mergeTraits(baseTraits: GameState["pythia"]["traits"], extraTraits: readonly GameState["pythia"]["traits"][number][] = []) {
  return [...new Set([...baseTraits, ...extraTraits])];
}

function createInitialResources(
  worldGeneration: WorldGenerationState,
  options: {
    scenarioId: ScenarioId;
    difficultyId: DifficultyId;
    pythiaArchetypeId: PythiaArchetypeId;
  }
): GameState["resources"] {
  const origin = originDefById[worldGeneration.originId];
  const scenario = scenarioFor(options.scenarioId);
  const difficulty = difficultyDefById[options.difficultyId];
  const pythiaArchetype = pythiaArchetypeDefById[options.pythiaArchetypeId];
  const isBaselineOrigin = worldGeneration.originId === "upstart-shrine";
  const economyShift = isBaselineOrigin ? 0 : Math.round(((worldGeneration.economic.meter ?? 50) - 50) / 10);
  const climateShift = isBaselineOrigin ? 0 : Math.round(((worldGeneration.climate.meter ?? 50) - 50) / 18);
  const divineShift = isBaselineOrigin ? 0 : Math.round(((worldGeneration.divineMood.meter ?? 50) - 50) / 20);
  const densityShift = isBaselineOrigin ? 0 : Math.round(((worldGeneration.oracleDensity.meter ?? 50) - 50) / 18);
  const resources = structuredClone(baseResources);

  if (typeof scenario.startingConditions?.gold === "number") {
    resources.gold.amount = clamp(scenario.startingConditions.gold, 0, resources.gold.capacity);
  }

  const adjustments: Partial<Record<ResourceId, number>> = {
    gold: economyShift * 10,
    grain: climateShift * 6,
    olive_oil: economyShift * 2 + climateShift * 2,
    incense: divineShift * 2 + densityShift,
    sacred_water: divineShift * 2 + climateShift,
    papyrus: Math.max(0, economyShift),
    olives: Math.max(0, climateShift * 2)
  };

  for (const [resourceId, delta] of Object.entries(adjustments) as [ResourceId, number][]) {
    resources[resourceId].amount = clamp(resources[resourceId].amount + delta, 0, resources[resourceId].capacity);
    resources[resourceId].trend = delta;
  }

  for (const [resourceId, delta] of Object.entries(origin.startingResources ?? {}) as [ResourceId, number][]) {
    resources[resourceId].amount = clamp(resources[resourceId].amount + delta, 0, resources[resourceId].capacity);
    resources[resourceId].trend += delta;
  }

  for (const [resourceId, delta] of Object.entries(difficulty.startingResources ?? {}) as [ResourceId, number][]) {
    resources[resourceId].amount = clamp(resources[resourceId].amount + delta, 0, resources[resourceId].capacity);
    resources[resourceId].trend += delta;
  }

  for (const [resourceId, delta] of Object.entries(pythiaArchetype.startingResources ?? {}) as [ResourceId, number][]) {
    resources[resourceId].amount = clamp(resources[resourceId].amount + delta, 0, resources[resourceId].capacity);
    resources[resourceId].trend += delta;
  }

  return resources;
}

function relationCompatibility(left: FactionState, right: FactionState): number {
  let score = 0;

  if (left.profile === right.profile) {
    score += 10;
  }
  if (left.currentAgenda === right.currentAgenda) {
    score += 6;
  }
  if (left.tradeAccess && right.tradeAccess) {
    score += 5;
  }
  if (left.currentAgenda === "war" && right.currentAgenda === "trade") {
    score -= 8;
  }
  if (left.currentAgenda === "faith" && right.profile === "scheming") {
    score -= 5;
  }

  return score;
}

function seededRelationDelta(seed: number, leftId: string, rightId: string): number {
  const basis = normalizeSeedInput(`${seed}:${leftId}:${rightId}`).seed;
  return (basis % 23) - 11;
}

function buildFactionsWithRelations(seed: number, factions: Record<FactionId, FactionState>): Record<FactionId, FactionState> {
  const entries = Object.entries(factions) as [FactionId, FactionState][];
  let next = factions;

  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const [leftId] = entries[leftIndex]!;
      const [rightId] = entries[rightIndex]!;
      const left = next[leftId];
      const right = next[rightId];
      const delta = relationCompatibility(left, right) + seededRelationDelta(seed, leftId, rightId);
      const relation = clamp((left.relations[rightId] ?? 0) + delta, -90, 90);

      next = {
        ...next,
        [leftId]: {
          ...left,
          relations: {
            ...left.relations,
            [rightId]: relation
          }
        },
        [rightId]: {
          ...right,
          relations: {
            ...right.relations,
            [leftId]: relation
          }
        }
      };
    }
  }

  return next;
}

function addFactionDiplomacy(factions: Record<FactionId, FactionState>): Record<FactionId, FactionState> {
  const next = structuredClone(factions);
  const ids = Object.keys(next) as FactionId[];

  for (const factionId of ids) {
    const faction = next[factionId];
    const relations = Object.entries(faction.relations) as [FactionId, number][];
    const treaties = relations
      .filter(([, value]) => value >= 26)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 2)
      .map(([id]) => id);
    const embargoes = relations
      .filter(([, value]) => value <= -26 || !next[factionId].tradeAccess)
      .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
      .slice(0, 2)
      .map(([id]) => id);
    const conflicts = relations
      .filter(([id, value]) => value <= -48 || (faction.currentAgenda === "war" && next[id].currentAgenda !== "faith"))
      .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
      .slice(0, 2)
      .map(([id]) => id);

    next[factionId].treaties = [...new Set(treaties)];
    next[factionId].embargoes = [...new Set(embargoes.filter((id) => id !== factionId))];
    next[factionId].activeConflicts = [...new Set(conflicts.filter((id) => id !== factionId))];
  }

  return next;
}

function createInitialFactions(
  worldGeneration: WorldGenerationState,
  options: {
    scenarioId: ScenarioId;
    difficultyId: DifficultyId;
    startingRegionId: string;
  }
): Record<FactionId, FactionState> {
  const difficulty = difficultyDefById[options.difficultyId];
  const scenario = scenarioFor(options.scenarioId);
  const base = {} as Record<FactionId, FactionState>;

  for (const faction of defaultFactionStates) {
    const generated = worldGeneration.factions.find((entry) => entry.id === faction.id) as GeneratedFactionSetup | undefined;
    const scenarioFactionMod = scenario.startingConditions?.factionMod?.[faction.id];
    base[faction.id] = {
      ...faction,
      profile: generated?.profile ?? faction.profile,
      currentAgenda: generated?.agenda ?? faction.currentAgenda,
      tradeAccess: generated?.tradeAccess ?? faction.tradeAccess,
      credibility: clamp(
        faction.credibility
        + (generated?.credibilityDelta ?? 0)
        + (difficulty.factionModifiers?.credibility ?? 0)
        + (scenarioFactionMod?.credibility ?? 0),
        0,
        100
      ),
      favour: clamp(
        faction.favour
        + (generated?.favourDelta ?? 0)
        + (difficulty.factionModifiers?.favour ?? 0)
        + (scenarioFactionMod?.favour ?? 0),
        0,
        100
      ),
      dependence: clamp(
        faction.dependence
        + (generated?.dependenceDelta ?? 0)
        + (difficulty.factionModifiers?.dependence ?? 0),
        0,
        100
      ),
      debt: clamp(
        faction.debt
        + (generated?.debtDelta ?? 0)
        + (difficulty.factionModifiers?.debt ?? 0),
        0,
        100
      ),
      treaties: [],
      embargoes: [],
      activeConflicts: [],
      relations: { ...faction.relations },
      history: [generated?.note ?? `${faction.name} opens the run under its default posture.`]
    };
  }

  return addFactionDiplomacy(buildFactionsWithRelations(worldGeneration.seed, base));
}

export function createInitialBuildings(): BuildingInstance[] {
  return [];
}

export function createInitialCampaign(seedOrOptions: InitialStateInput = 7, maybeOriginId?: OriginId): CampaignState {
  const { worldGeneration, originId, scenarioId, difficultyId, startingRegionId } = resolveRunOptions(seedOrOptions, maybeOriginId);
  const origin = originDefById[originId];
  const scenario = scenarioFor(scenarioId);
  const difficulty = difficultyDefById[difficultyId];
  const base = createInitialCampaignState(scenarioId);
  const generatedPressures: CampaignState["worldMap"]["activePressures"] = worldGeneration.regions
    .map((region) => {
      const topPressure = region.pressures[0];
      if (!topPressure || !region.controllingFactionId) {
        return undefined;
      }

      const kind: CampaignState["worldMap"]["activePressures"][number]["kind"] =
        topPressure.label === "Trade route strain"
          ? "trade"
          : topPressure.label === "Doctrinal agitation"
            ? "consultation"
            : "conflict";
      const value = Number(topPressure.value ?? region.pressure);
      const severity: CampaignState["worldMap"]["activePressures"][number]["severity"] = value >= 75 ? "critical" : value >= 55 ? "rising" : "low";

      return {
        id: `pressure-${region.id}-${kind}`,
        factionId: region.controllingFactionId,
        nodeId: region.id,
        kind,
        severity,
        value
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((left, right) => right.value - left.value || left.id.localeCompare(right.id))
    .slice(0, 4);

  const generatedCrises: CampaignState["worldMap"]["crisisChains"] = worldGeneration.regions
    .filter((region) => region.pressure >= 62)
    .sort((left, right) => right.pressure - left.pressure || left.id.localeCompare(right.id))
    .slice(0, 2)
    .map((region) => ({
      id: `crisis-${region.id}`,
      label: `${region.label} ${region.hegemon.split(" ")[0]} squeeze`,
      nodeId: region.id,
      factionId: region.controllingFactionId,
      stage: region.pressure >= 78 ? "active" : "rumor",
      pressure: region.pressure,
      stepsCompleted: region.pressure >= 78 ? 2 : 1
    }));
  const recommendedTier = scenario.startingConditions?.reputation;
  const initialScore = clamp(
    (recommendedTier === "recognized" ? 20 : recommendedTier === "revered" ? 50 : recommendedTier === "panhellenic" ? 85 : 0)
    + (origin.campaignModifiers?.reputation ?? 0)
    + Math.max(0, difficulty.factionModifiers?.credibility ?? 0),
    0,
    100
  );

  return syncCampaignState({
    ...base,
    reputation: {
      ...base.reputation,
      score: initialScore
    },
    treasury: {
      ...base.treasury,
      totalGoldInvested: Math.max(0, origin.campaignModifiers?.treasuryProgress ?? 0)
    },
    worldMap: {
      selectedNodeId: startingRegionId,
      nodes: worldGeneration.regions.map((region) => ({
        id: region.id,
        label: region.label,
        position: region.position,
        controllingFactionId: region.controllingFactionId,
        tags: region.tags,
        pressure: region.pressure,
        unrest: region.unrest,
        connectedNodeIds: region.connectedNodeIds
      })),
      links: DEFAULT_WORLD_LINKS.map((link) => ({
        ...link,
        kind: link.kind === "pilgrim" ? "road" : link.kind,
        tradeFlow: link.kind === "sea" ? 56 : link.kind === "mountain" ? 24 : 44,
        risk: link.kind === "sea" ? 18 : link.kind === "mountain" ? 26 : 14
      })),
      activePressures: generatedPressures,
      crisisChains: generatedCrises
    },
    winCondition: {
      ...base.winCondition,
      summary: `${base.winCondition.summary} Origin ${origin.title ?? origin.label} · ${scenario.label} · ${difficulty.label} difficulty.`
    }
  });
}

function applyStartingRegionBenefits(
  resources: GameState["resources"],
  factions: Record<FactionId, FactionState>,
  worldGeneration: WorldGenerationState,
  startingRegionId: string
): { resources: GameState["resources"]; factions: Record<FactionId, FactionState>; note?: string } {
  const region = worldGeneration.regions.find((entry) => entry.id === startingRegionId);
  if (!region) {
    return { resources, factions };
  }

  let nextResources = resources;
  let nextFactions = factions;

  const addResource = (resourceId: ResourceId, amount: number) => {
    nextResources = {
      ...nextResources,
      [resourceId]: {
        ...nextResources[resourceId],
        amount: clamp(nextResources[resourceId].amount + amount, 0, nextResources[resourceId].capacity),
        trend: nextResources[resourceId].trend + amount
      }
    };
  };

  if (region.tags.includes("port")) {
    addResource("gold", 14);
    addResource("papyrus", 2);
  }
  if (region.tags.includes("pass")) {
    addResource("grain", 10);
    addResource("sacred_animals", 1);
  }
  if (region.tags.includes("sanctuary")) {
    addResource("sacred_water", 8);
    addResource("incense", 2);
  }
  if (region.controllingFactionId) {
    const faction = nextFactions[region.controllingFactionId];
    addResource(faction.favoredResource, 6);
    nextFactions = {
      ...nextFactions,
      [region.controllingFactionId]: {
        ...faction,
        credibility: clamp(faction.credibility + 4, 0, 100),
        favour: clamp(faction.favour + 8, 0, 100),
        history: [`${region.label} opens as Delphi's first political anchor.`, ...faction.history].slice(0, 4)
      }
    };
  }

  return {
    resources: nextResources,
    factions: nextFactions,
    note: `${region.label} opens as the first city in focus.`
  };
}

export function createInitialState(seedOrOptions: InitialStateInput = 7, maybeOriginId?: OriginId): GameState {
  const { walkers, priests } = createStarterWalkers();
  const {
    seed,
    seedText,
    originId,
    scenarioId,
    difficultyId,
    pythiaArchetypeId,
    startingRegionId,
    worldGeneration
  } = resolveRunOptions(seedOrOptions, maybeOriginId);
  const origin = originDefById[originId];
  const difficulty = difficultyDefById[difficultyId];
  const pythiaArchetype = pythiaArchetypeDefById[pythiaArchetypeId];
  const resources = createInitialResources(worldGeneration, {
    scenarioId,
    difficultyId,
    pythiaArchetypeId
  });
  const campaign = createInitialCampaign({
    seed: seedText,
    originId,
    scenarioId,
    difficultyId,
    pythiaArchetypeId,
    startingRegionId
  });
  const factions = createInitialFactions(worldGeneration, {
    scenarioId,
    difficultyId,
    startingRegionId
  });
  const buildings = createInitialBuildings();
  const pythia = {
    name: pythiaArchetype.name,
    attunement: clamp(68 + (origin.pythiaModifiers?.attunement ?? 0) + (pythiaArchetype.pythiaModifiers?.attunement ?? 0) + (difficulty.pythiaModifiers?.attunement ?? 0), 0, 100),
    physicalHealth: clamp(74 + (origin.pythiaModifiers?.physicalHealth ?? 0) + (pythiaArchetype.pythiaModifiers?.physicalHealth ?? 0) + (difficulty.pythiaModifiers?.physicalHealth ?? 0), 0, 100),
    mentalClarity: clamp(71 + (origin.pythiaModifiers?.mentalClarity ?? 0) + (pythiaArchetype.pythiaModifiers?.mentalClarity ?? 0) + (difficulty.pythiaModifiers?.mentalClarity ?? 0), 0, 100),
    tranceDepth: clamp(55 + (origin.pythiaModifiers?.tranceDepth ?? 0) + (pythiaArchetype.pythiaModifiers?.tranceDepth ?? 0) + (difficulty.pythiaModifiers?.tranceDepth ?? 0), 0, 100),
    prestige: clamp(41 + (origin.pythiaModifiers?.prestige ?? 0) + (pythiaArchetype.pythiaModifiers?.prestige ?? 0) + (difficulty.pythiaModifiers?.prestige ?? 0), 0, 100),
    needs: {
      purification: clamp(36 + (origin.pythiaModifiers?.purification ?? 0) + (pythiaArchetype.pythiaModifiers?.purification ?? 0) + (difficulty.pythiaModifiers?.purification ?? 0), 0, 100),
      rest: clamp(22 + (origin.pythiaModifiers?.rest ?? 0) + (pythiaArchetype.pythiaModifiers?.rest ?? 0) + (difficulty.pythiaModifiers?.rest ?? 0), 0, 100),
      pilgrimageCooldown: clamp(80 + (origin.pythiaModifiers?.pilgrimageCooldown ?? 0), 0, 100),
      food: 20
    },
    traits: mergeTraits(
      pythiaArchetype.startingTraits?.length ? pythiaArchetype.startingTraits : ["visionary", "diplomatic"],
      origin.pythiaModifiers?.addTraits
    )
  };
  const openingBenefits = applyStartingRegionBenefits(resources, factions, worldGeneration, startingRegionId);
  const characters = createInitialCharactersState({
    worldSeed: seed,
    worldGeneration,
    factions: openingBenefits.factions
  });
  const priestPolitics = createInitialPriestPoliticsState({
    worldSeed: seed,
    clock: {
      tick: 0,
      day: 1,
      month: 1,
      year: 1,
      season: "Spring",
      tickOfDay: 0,
      ticksPerDay: 600,
      speed: 1,
      paused: false
    },
    factions: openingBenefits.factions,
    priests,
    pythia,
    characters,
    walkers,
    buildings
  });
  const philosophers = createInitialPhilosophersState({
    worldSeed: seed,
    worldGeneration,
    factions: openingBenefits.factions
  });
  return {
    worldSeed: seed,
    worldSeedText: seedText,
    originId,
    runConfig: {
      scenarioId,
      difficultyId,
      pythiaArchetypeId,
      startingRegionId
    },
    worldGeneration,
    clock: {
      tick: 0,
      day: 1,
      month: 1,
      year: 1,
      season: "Spring",
      tickOfDay: 0,
      ticksPerDay: 600,
      speed: 1,
      paused: false
    },
    grid: {
      width: 60,
      height: 60,
      roads: [],
      terrainDeposits: generateTerrainDeposits(
        seed,
        60,
        60,
        (x, y) => generateTileTerrain(seed, x, y, 60, 60)
      )
    },
    resources: openingBenefits.resources,
    buildings,
    walkers,
    priests,
    priestPolitics,
    pythia,
    factions: openingBenefits.factions,
    characters,
    philosophers,
    age: createInitialAgeState(),
    espionage: createInitialEspionageState(),
    excavation: createInitialExcavationState(seed),
    achievements: createInitialAchievementProgress(),
    lineage: createInitialLineageState(),
    legacy: createInitialLegacyState(),
    prophecyArcs: createInitialProphecyArcState(),
    worldHistory: createInitialWorldHistoryState(),
    rivalOracles: createInitialRivalOraclesState({
      worldSeed: seed,
      worldGeneration,
      factions: openingBenefits.factions,
      pythia
    }),
    consultation: {
      mode: "idle",
      history: []
    },
    consequences: [],
    advisorMessages: [
      {
        id: "advisor-origin-hierophant",
        advisorId: advisorDefs[0]?.id ?? "hierophant",
        text: origin.advisorIntro,
        severity: worldGeneration.scoreModifier >= 7 ? "warn" : "info"
      },
      {
        id: "advisor-origin-diplomat",
        advisorId: advisorDefs.find((advisor) => advisor.id === "diplomat")?.id ?? "diplomat",
        text: worldGeneration.politicalClimate,
        severity: worldGeneration.pressures.some((pressure) => pressure.severity === "critical") ? "warn" : "info"
      }
    ],
    eventFeed: [
      {
        id: "event-origin",
        day: 1,
        text: `${origin.title ?? origin.label}: ${origin.summary}`
      },
      {
        id: "event-world",
        day: 1,
        text: worldGeneration.summary
      },
      {
        id: "event-scenario",
        day: 1,
        text: `${scenarioFor(scenarioId).label} begins on ${difficulty.label} difficulty with ${pythia.name} at the tripod.`
      },
      ...(openingBenefits.note ? [{
        id: "event-starting-region",
        day: 1,
        text: openingBenefits.note
      }] : []),
      {
        id: "event-intro",
        day: 1,
        text: "The precinct is quiet. Lay the Sacred Way before dawn pilgrims arrive."
      }
    ],
    tradeOffers: [],
    resourceJobs: [],
    campaign: {
      ...campaign,
      worldMap: {
        ...campaign.worldMap,
        selectedNodeId: startingRegionId
      }
    },
    ui: {
      activeTool: "select"
    },
    lastAutosaveDay: 0,
    nextId: 10
  };
}
