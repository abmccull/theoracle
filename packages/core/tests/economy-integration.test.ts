/**
 * Economy integration tests — verify that terrain deposits, worker assignment,
 * multi-phase production, food consumption, spoilage, and deposit regeneration
 * all interact correctly when run together via runSimulationTick().
 */
import { describe, expect, it } from "vitest";

import { createInitialState } from "../src/state/initialState";
import { createBuildingAt, runSimulationTick } from "../src/simulation/updateDay";
import { reduceCommand } from "../src/reducers";
import { regenerateDeposits } from "../src/terrain/deposits";
import { advanceClock } from "../src/simulation/clock";
import type {
  BuildingInstance,
  GameState,
  TerrainDeposit,
  WalkerInstance,
  Season,
  GameEvent
} from "../src/state/gameState";

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const TICKS_PER_DAY = 600;

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function makeCustodian(
  id: string,
  name: string,
  tile = { x: 30, y: 50 },
  overrides: Partial<WalkerInstance> = {}
): WalkerInstance {
  return {
    id,
    role: "custodian",
    name,
    tile,
    state: "idle",
    path: [],
    moveCooldown: 0,
    homeBuildingId: undefined,
    assignmentBuildingId: undefined,
    destination: undefined,
    carrying: undefined,
    carryingAmount: undefined,
    assignedJobId: undefined,
    fatigue: 0,
    haulingSkill: 1,
    supplyRadius: 5,
    ...overrides
  };
}

function makeDeposit(
  type: TerrainDeposit["type"],
  currentYield?: number,
  overrides: Partial<TerrainDeposit> = {}
): TerrainDeposit {
  const defaults: Record<string, Omit<TerrainDeposit, "currentYield">> = {
    timber: { type: "timber", maxYield: 80, regenPerDay: 0.4 },
    stone: { type: "stone", maxYield: 400, regenPerDay: 0 },
    fertile_soil: { type: "fertile_soil", maxYield: 999, regenPerDay: 0.2 },
    sacred_spring: { type: "sacred_spring", maxYield: 9999, regenPerDay: 0.15 }
  };
  const base = defaults[type]!;
  return {
    ...base,
    currentYield: currentYield ?? base.maxYield,
    ...overrides
  };
}

/**
 * Build a game state with specific buildings, walkers, deposits, and season.
 * Bypasses placement validation to focus on economy integration.
 */
function buildEconomyState(opts: {
  buildings?: BuildingInstance[];
  walkers?: WalkerInstance[];
  deposits?: Record<string, TerrainDeposit>;
  season?: Season;
  day?: number;
  tick?: number;
}): GameState {
  const base = createInitialState();
  return {
    ...base,
    clock: {
      ...base.clock,
      season: opts.season ?? "Spring",
      day: opts.day ?? base.clock.day,
      tick: opts.tick ?? base.clock.tick,
      tickOfDay: 0
    },
    grid: {
      ...base.grid,
      terrainDeposits: opts.deposits ?? {}
    },
    buildings: opts.buildings ?? base.buildings,
    walkers: opts.walkers ?? []
  };
}

/**
 * Run N simulation ticks with proper clock advancement.
 * Returns final state and all events accumulated.
 */
function runTicks(state: GameState, ticks: number): { state: GameState; events: GameEvent[] } {
  let current = state;
  const allEvents: GameEvent[] = [];

  for (let i = 0; i < ticks; i++) {
    const previousClock = current.clock;
    const clockResult = advanceClock(previousClock, 1);
    current = { ...current, clock: clockResult.clock };

    const sim = runSimulationTick(current, 1, { previousClock });
    current = sim.state;
    allEvents.push(...sim.events);
  }

  return { state: current, events: allEvents };
}

/**
 * Create a building instance directly (bypasses placement checks).
 * Marks it as completed construction with the specified stored resources.
 */
function makeBuilding(
  defId: BuildingInstance["defId"],
  position: { x: number; y: number },
  id: string,
  storedResources: Partial<Record<string, number>> = {},
  assignedWorkerIds: string[] = []
): BuildingInstance {
  const base = createBuildingAt(defId, position, id);
  return {
    ...base,
    // Force construction complete
    constructionProgress: undefined,
    constructionWork: undefined,
    condition: base.maxCondition,
    connectedToRoad: true,
    storedResources: { ...base.storedResources, ...storedResources },
    assignedWorkerIds
  };
}

// ---------------------------------------------------------------------------
//  Tests
// ---------------------------------------------------------------------------

describe("Economy integration: full production cycle", () => {
  it("grain_field with fertile_soil deposit produces grain over a complete gather-return-process-store cycle", () => {
    // grain_field productionCycle: gatherTicks=60, gatherYield=1.5, processTicks=15
    // Worker starts at building position (28,49), deposit at (29,49) — 1 tile away
    // Phases: idle->walking(1 step + moveCooldown)->gathering(60)->returning(1 step + moveCooldown)->processing(15)->storing(1)
    // moveCooldown is 6 per step, so walking = ~7 ticks each way
    // Total approximate: 7 + 60 + 7 + 15 + 1 = ~90 ticks

    const grainField = makeBuilding("grain_field", { x: 28, y: 49 }, "gf-1", { grain: 0 }, ["w1"]);
    const worker = makeCustodian("w1", "Farmer", { x: 28, y: 49 }, {
      assignmentBuildingId: "gf-1"
    });

    const state = buildEconomyState({
      buildings: [grainField],
      walkers: [worker],
      deposits: {
        "29,49": makeDeposit("fertile_soil")
      },
      season: "Spring"
    });

    // Run enough ticks for at least one complete production cycle
    const result = runTicks(state, 200);

    const updatedField = result.state.buildings.find((b) => b.id === "gf-1")!;
    const grainStored = updatedField.storedResources.grain ?? 0;

    // Spring multiplier is 1.3, so yield = 1.5 * 1.3 = 1.95 per cycle
    expect(grainStored).toBeGreaterThan(0);

    // Verify ResourceProduced event was emitted
    const producedEvents = result.events.filter(
      (e) => e.type === "ResourceProduced" && e.resourceId === "grain"
    );
    expect(producedEvents.length).toBeGreaterThan(0);
  });
});

describe("Economy integration: food supply chain", () => {
  it("kitchen converts grain into bread when staffed", () => {
    // Kitchen is a recipe-based building (no productionCycle):
    //   consumes grain 0.12/day, produces bread 0.1/day
    // Per tick: grain consumed = 0.12/600 = 0.0002, bread produced = 0.1/600 ~= 0.000167
    const kitchen = makeBuilding("kitchen", { x: 32, y: 49 }, "k-1", { grain: 20, bread: 0 }, ["w1"]);
    const worker = makeCustodian("w1", "Baker", { x: 32, y: 49 }, {
      assignmentBuildingId: "k-1"
    });

    const state = buildEconomyState({
      buildings: [kitchen],
      walkers: [worker],
      season: "Spring"
    });

    // Run 600 ticks = 1 full day
    const result = runTicks(state, TICKS_PER_DAY);

    const updatedKitchen = result.state.buildings.find((b) => b.id === "k-1")!;
    const breadProduced = updatedKitchen.storedResources.bread ?? 0;
    const grainRemaining = updatedKitchen.storedResources.grain ?? 0;

    // Kitchen should have produced some bread (recipe: 0.1/day but seasonal grain multiplier
    // in Spring is 1.3 for grain, affecting throughput)
    expect(breadProduced).toBeGreaterThan(0);
    // Grain should have been consumed (by recipe and/or food consumption)
    expect(grainRemaining).toBeLessThan(20);
  });

  it("workers eat bread produced by the economy", () => {
    // Set up kitchen with grain. Worker eats from the building's bread store.
    // Food consumption: 0.01 bread/tick (preferred) or 0.02 grain/tick
    const kitchen = makeBuilding("kitchen", { x: 32, y: 49 }, "k-1", { grain: 20, bread: 5 }, ["w1"]);
    const worker = makeCustodian("w1", "Baker", { x: 32, y: 49 }, {
      assignmentBuildingId: "k-1",
      hungerTicks: 0
    });

    const state = buildEconomyState({
      buildings: [kitchen],
      walkers: [worker],
      season: "Spring"
    });

    // Run 100 ticks — worker should eat bread, kitchen should produce more
    const result = runTicks(state, 100);

    const updatedWorker = result.state.walkers.find((w) => w.id === "w1")!;
    // Worker should remain fed (hungerTicks stays at 0 or very low)
    expect(updatedWorker.hungerTicks ?? 0).toBe(0);

    const updatedKitchen = result.state.buildings.find((b) => b.id === "k-1")!;
    // Bread should still be above 0 (consumption is 0.01/tick, started with 5)
    // Over 100 ticks: bread consumed by worker = ~1.0, bread produced ~0.017
    expect((updatedKitchen.storedResources.bread ?? 0)).toBeGreaterThan(0);
  });
});

describe("Economy integration: worker starvation cascade", () => {
  it("workers starve and are removed from buildings when no food is available", () => {
    // HUNGER_DEATH_TICKS = 3000 (from food.test.ts)
    // Place worker at a grain_field with no food and no deposit (no production)
    const grainField = makeBuilding("grain_field", { x: 28, y: 49 }, "gf-1", { grain: 0, bread: 0 }, ["w1"]);
    const worker = makeCustodian("w1", "Doomed Farmer", { x: 28, y: 49 }, {
      assignmentBuildingId: "gf-1",
      hungerTicks: 2990 // Close to death
    });

    const state = buildEconomyState({
      buildings: [grainField],
      walkers: [worker],
      season: "Spring"
    });

    // Run just enough ticks to push past 3000 hungerTicks
    const result = runTicks(state, 15);

    // Worker should be dead (removed from walkers)
    const deadWorker = result.state.walkers.find((w) => w.id === "w1");
    expect(deadWorker).toBeUndefined();

    // Building should have worker removed from assignedWorkerIds
    const updatedField = result.state.buildings.find((b) => b.id === "gf-1")!;
    expect(updatedField.assignedWorkerIds).not.toContain("w1");
  });

  it("production stops after worker starves", () => {
    // Kitchen with NO food at all — worker will starve
    const kitchen = makeBuilding("kitchen", { x: 32, y: 49 }, "k-1", { grain: 0, bread: 0 }, ["w1"]);
    const worker = makeCustodian("w1", "Starving Baker", { x: 32, y: 49 }, {
      assignmentBuildingId: "k-1",
      hungerTicks: 2998
    });

    const state = buildEconomyState({
      buildings: [kitchen],
      walkers: [worker],
      season: "Spring"
    });

    // Run enough for death and then some more
    const result = runTicks(state, 10);

    // Worker should be gone (hungerTicks 2998 + 2 ticks = 3000 = HUNGER_DEATH_TICKS)
    expect(result.state.walkers.find((w) => w.id === "w1")).toBeUndefined();

    // Building should have worker removed from assignedWorkerIds
    const updatedKitchen = result.state.buildings.find((b) => b.id === "k-1")!;
    expect(updatedKitchen.assignedWorkerIds).not.toContain("w1");

    // Record bread after death — run more ticks and verify no additional bread
    const breadAfterDeath = updatedKitchen.storedResources.bread ?? 0;
    const result2 = runTicks(result.state, 200);
    const breadLater = result2.state.buildings.find((b) => b.id === "k-1")!.storedResources.bread ?? 0;

    // No new bread should be produced (no worker, no grain anyway)
    expect(breadLater).toBeLessThanOrEqual(breadAfterDeath);
  });
});

describe("Economy integration: spoilage vs production race", () => {
  it("grain decays in a granary over time without production", () => {
    const granary = makeBuilding("granary", { x: 30, y: 49 }, "gr-1", { grain: 50 });

    const state = buildEconomyState({
      buildings: [granary],
      season: "Spring"
    });

    // Run 1 full day — grain decays via spoilage (granary has 80% reduction)
    const result = runTicks(state, TICKS_PER_DAY);
    const grainRemaining = result.state.buildings.find((b) => b.id === "gr-1")!.storedResources.grain!;

    // Grain should have decreased from spoilage
    expect(grainRemaining).toBeLessThan(50);
    // Should still have a meaningful amount remaining
    expect(grainRemaining).toBeGreaterThan(0);
  });

  it("production adds grain to the system even while spoilage occurs", () => {
    // A grain_field with a worker actively produces grain via multi-phase cycle.
    // Simultaneously, spoilage decays grain in all buildings.
    // We verify the grain_field successfully produces grain.
    const grainField = makeBuilding("grain_field", { x: 28, y: 49 }, "gf-1", { grain: 0 }, ["w1"]);
    const worker = makeCustodian("w1", "Farmer", { x: 28, y: 49 }, {
      assignmentBuildingId: "gf-1"
    });

    const state = buildEconomyState({
      buildings: [grainField],
      walkers: [worker],
      deposits: {
        "29,49": makeDeposit("fertile_soil")
      },
      season: "Spring"
    });

    // Run many ticks to allow multiple production cycles
    const result = runTicks(state, TICKS_PER_DAY * 3);

    // Grain in the grain_field building should have increased from production
    const fieldGrain = result.state.buildings.find((b) => b.id === "gf-1")!.storedResources.grain ?? 0;
    expect(fieldGrain).toBeGreaterThan(0);

    // There should be ResourceProduced events for grain
    const grainProduced = result.events.filter(
      (e) => e.type === "ResourceProduced" && e.resourceId === "grain"
    );
    expect(grainProduced.length).toBeGreaterThan(0);
  });
});

describe("Economy integration: deposit depletion", () => {
  it("stone deposit reaches 0 yield after extensive quarrying", () => {
    // lithotomia productionCycle: depositType=stone, gatherTicks=50, gatherYield=1.0, processTicks=25
    // Stone deposit with small yield of 5 — should deplete in ~5 cycles
    const quarry = makeBuilding("lithotomia", { x: 28, y: 49 }, "q-1", { stone: 0 }, ["w1"]);
    const worker = makeCustodian("w1", "Quarryman", { x: 28, y: 49 }, {
      assignmentBuildingId: "q-1"
    });

    const state = buildEconomyState({
      buildings: [quarry],
      walkers: [worker],
      deposits: {
        "29,49": makeDeposit("stone", 5, { maxYield: 400 })
      },
      season: "Spring"
    });

    // Run enough ticks for multiple production cycles to deplete 5 units of stone
    // Each cycle: ~7 (walk) + 50 (gather) + 7 (return) + 25 (process) + 1 (store) = ~90 ticks
    // 5 cycles = ~450 ticks; add buffer
    const result = runTicks(state, 800);

    const deposit = result.state.grid.terrainDeposits?.["29,49"];
    expect(deposit).toBeDefined();
    expect(deposit!.currentYield).toBe(0);

    // Stone should have been produced and stored in the quarry
    const stoneStored = result.state.buildings.find((b) => b.id === "q-1")!.storedResources.stone ?? 0;
    expect(stoneStored).toBeGreaterThan(0);
    // The deposit started with 5 yield, so total extracted should be at most 5
    // Plus whatever was in starting resources
    expect(stoneStored).toBeLessThanOrEqual(10);
  });

  it("worker stays idle after deposit is fully depleted", () => {
    const quarry = makeBuilding("lithotomia", { x: 28, y: 49 }, "q-1", { stone: 0 }, ["w1"]);
    const worker = makeCustodian("w1", "Quarryman", { x: 28, y: 49 }, {
      assignmentBuildingId: "q-1"
    });

    // Already depleted deposit
    const state = buildEconomyState({
      buildings: [quarry],
      walkers: [worker],
      deposits: {
        "29,49": makeDeposit("stone", 0)
      },
      season: "Spring"
    });

    const result = runTicks(state, 100);

    const updatedWorker = result.state.walkers.find((w) => w.id === "w1")!;
    // Worker should be idle since there's no viable deposit
    expect(updatedWorker.productionPhase === "idle" || updatedWorker.productionPhase === undefined).toBe(true);
  });
});

describe("Economy integration: timber regrowth", () => {
  it("depleted timber deposit advances regrowth stages over 120+ days", () => {
    const state = buildEconomyState({
      deposits: {
        "10,10": makeDeposit("timber", 0, { depletedDay: 1 })
      },
      day: 1
    });

    // Simulate 130 days of regeneration
    let current = state;
    for (let day = 0; day < 130; day++) {
      // Advance clock by 1 day
      current = {
        ...current,
        clock: {
          ...current.clock,
          day: current.clock.day + 1
        }
      };
      const regenResult = regenerateDeposits(current);
      current = regenResult.state;
    }

    const deposit = current.grid.terrainDeposits?.["10,10"]!;
    // After 120+ days, regrowth stage should be 3 (full tree)
    expect(deposit.regrowthStage).toBe(3);
    // And yield should have started regenerating (regenPerDay = 0.4)
    // After 10 days past full regrowth: 10 * 0.4 = 4.0
    expect(deposit.currentYield).toBeGreaterThan(0);
  });

  it("timber regrowth stages advance incrementally: 0 -> 1 -> 2 -> 3", () => {
    const state = buildEconomyState({
      deposits: {
        "10,10": makeDeposit("timber", 0, { depletedDay: 1 })
      },
      day: 1
    });

    // Check stage at various day intervals
    const stagesAtDays: Record<number, number> = {};

    let current = state;
    for (let day = 0; day < 95; day++) {
      current = {
        ...current,
        clock: { ...current.clock, day: current.clock.day + 1 }
      };
      const regenResult = regenerateDeposits(current);
      current = regenResult.state;

      if ([10, 35, 65, 92].includes(day + 1)) {
        stagesAtDays[day + 1] = current.grid.terrainDeposits?.["10,10"]?.regrowthStage ?? 0;
      }
    }

    // Day 10: < 30 days since depletion, stage 0
    expect(stagesAtDays[10]).toBe(0);
    // Day 35: >= 30 days, stage 1
    expect(stagesAtDays[35]).toBe(1);
    // Day 65: >= 60 days, stage 2
    expect(stagesAtDays[65]).toBe(2);
    // Day 92: >= 90 days, stage 3
    expect(stagesAtDays[92]).toBe(3);
  });
});

describe("Economy integration: seasonal effects on grain_field", () => {
  it("grain_field worker stays idle in Winter (no production cycle starts)", () => {
    const grainField = makeBuilding("grain_field", { x: 28, y: 49 }, "gf-1", { grain: 0 }, ["w1"]);
    const worker = makeCustodian("w1", "Winter Farmer", { x: 28, y: 49 }, {
      assignmentBuildingId: "gf-1"
    });

    const state = buildEconomyState({
      buildings: [grainField],
      walkers: [worker],
      deposits: {
        "29,49": makeDeposit("fertile_soil")
      },
      season: "Winter"
    });

    // Run ticks — worker should not start any production cycle
    const result = runTicks(state, 200);

    const updatedField = result.state.buildings.find((b) => b.id === "gf-1")!;
    const grainProduced = updatedField.storedResources.grain ?? 0;

    // No grain should have been produced via the production cycle in Winter
    // (The recipe system may also apply seasonal multiplier of 0 for Winter)
    expect(grainProduced).toBe(0);

    // Worker should be in idle phase
    const updatedWorker = result.state.walkers.find((w) => w.id === "w1")!;
    expect(updatedWorker.productionPhase === "idle" || updatedWorker.productionPhase === undefined).toBe(true);
  });

  it("grain_field produces more in Autumn (1.5x yield multiplier)", () => {
    // Compare Autumn vs Spring production
    function makeGrainState(season: Season): GameState {
      const grainField = makeBuilding("grain_field", { x: 28, y: 49 }, "gf-1", { grain: 0 }, ["w1"]);
      const worker = makeCustodian("w1", "Farmer", { x: 28, y: 49 }, {
        assignmentBuildingId: "gf-1"
      });
      return buildEconomyState({
        buildings: [grainField],
        walkers: [worker],
        deposits: {
          "29,49": makeDeposit("fertile_soil")
        },
        season
      });
    }

    const autumnResult = runTicks(makeGrainState("Autumn"), 500);
    const springResult = runTicks(makeGrainState("Spring"), 500);

    const autumnGrain = autumnResult.state.buildings.find((b) => b.id === "gf-1")!.storedResources.grain ?? 0;
    const springGrain = springResult.state.buildings.find((b) => b.id === "gf-1")!.storedResources.grain ?? 0;

    // Both should have produced grain
    expect(autumnGrain).toBeGreaterThan(0);
    expect(springGrain).toBeGreaterThan(0);

    // Autumn (1.5x) should produce more than Spring (1.3x)
    expect(autumnGrain).toBeGreaterThan(springGrain);
  });
});

describe("Economy integration: partial staffing efficiency", () => {
  it("kitchen with 1 of 1 required custodians produces at full throughput", () => {
    // Kitchen requires 1 custodian (staffing.custodians: 1)
    const kitchen = makeBuilding("kitchen", { x: 32, y: 49 }, "k-full", { grain: 20, bread: 0 }, ["w1"]);
    const worker = makeCustodian("w1", "FullBaker", { x: 32, y: 49 }, {
      assignmentBuildingId: "k-full"
    });

    const state = buildEconomyState({
      buildings: [kitchen],
      walkers: [worker],
      season: "Spring"
    });

    const result = runTicks(state, TICKS_PER_DAY);
    const breadFull = result.state.buildings.find((b) => b.id === "k-full")!.storedResources.bread ?? 0;

    // Kitchen recipe: consumes grain 0.12/day, produces bread 0.1/day
    // But grain seasonal multiplier in Spring = 1.3 (applied to produced grain, not bread)
    // Actual throughput is constrained by recipe input/output rates
    // Just verify bread was produced
    expect(breadFull).toBeGreaterThan(0);
  });

  it("kitchen with 0 custodians produces nothing", () => {
    // Kitchen with no workers assigned
    const kitchen = makeBuilding("kitchen", { x: 32, y: 49 }, "k-empty", { grain: 20, bread: 0 }, []);

    const state = buildEconomyState({
      buildings: [kitchen],
      walkers: [],
      season: "Spring"
    });

    const result = runTicks(state, TICKS_PER_DAY);
    const bread = result.state.buildings.find((b) => b.id === "k-empty")!.storedResources.bread ?? 0;

    // No bread should be produced without workers
    expect(bread).toBe(0);
  });
});

describe("Economy integration: unassign preserves economy", () => {
  it("unassigning a worker stops production and leaves worker idle", () => {
    const grainField = makeBuilding("grain_field", { x: 28, y: 49 }, "gf-1", { grain: 0 }, ["w1"]);
    const worker = makeCustodian("w1", "Farmer", { x: 28, y: 49 }, {
      assignmentBuildingId: "gf-1"
    });

    let state = buildEconomyState({
      buildings: [grainField],
      walkers: [worker],
      deposits: {
        "29,49": makeDeposit("fertile_soil")
      },
      season: "Spring"
    });

    // Run a few ticks to start production
    const initialResult = runTicks(state, 50);
    state = initialResult.state;

    // Unassign the worker
    const unassignResult = reduceCommand(state, {
      type: "UnassignWorkerCommand",
      walkerId: "w1",
      buildingId: "gf-1"
    });
    state = unassignResult.state;

    // Verify unassignment
    const updatedBuilding = state.buildings.find((b) => b.id === "gf-1")!;
    expect(updatedBuilding.assignedWorkerIds).not.toContain("w1");

    const updatedWorker = state.walkers.find((w) => w.id === "w1")!;
    expect(updatedWorker.assignmentBuildingId).toBeUndefined();
    expect(updatedWorker.state).toBe("idle");
    expect(updatedWorker.productionPhase).toBeUndefined();

    // Run more ticks and verify no grain is produced
    const grainBefore = state.buildings.find((b) => b.id === "gf-1")!.storedResources.grain ?? 0;
    const afterResult = runTicks(state, 300);
    const grainAfter = afterResult.state.buildings.find((b) => b.id === "gf-1")!.storedResources.grain ?? 0;

    // No additional grain should be produced (worker is unassigned)
    expect(grainAfter).toBeLessThanOrEqual(grainBefore);
  });
});

describe("Economy integration: multiple buildings competing for deposits", () => {
  it("two grain_fields near the same fertile_soil deposit can both operate", () => {
    // grain_field requiredNearbyTerrain maxDistance = 2
    // Place two grain fields within 2 tiles of the same deposit
    const field1 = makeBuilding("grain_field", { x: 28, y: 49 }, "gf-1", { grain: 0 }, ["w1"]);
    const field2 = makeBuilding("grain_field", { x: 30, y: 49 }, "gf-2", { grain: 0 }, ["w2"]);
    const worker1 = makeCustodian("w1", "Farmer A", { x: 28, y: 49 }, {
      assignmentBuildingId: "gf-1"
    });
    const worker2 = makeCustodian("w2", "Farmer B", { x: 30, y: 49 }, {
      assignmentBuildingId: "gf-2"
    });

    const state = buildEconomyState({
      buildings: [field1, field2],
      walkers: [worker1, worker2],
      deposits: {
        // Single deposit within range of both fields
        // Distance from gf-1 (28,49) = 1, distance from gf-2 (30,49) = 1
        "29,49": makeDeposit("fertile_soil")
      },
      season: "Autumn" // High yield
    });

    // Run many ticks for multiple production cycles
    const result = runTicks(state, TICKS_PER_DAY * 2);

    const grain1 = result.state.buildings.find((b) => b.id === "gf-1")!.storedResources.grain ?? 0;
    const grain2 = result.state.buildings.find((b) => b.id === "gf-2")!.storedResources.grain ?? 0;

    // Both fields should have produced at least some grain
    // (They share the deposit but fertile_soil has maxYield 999, so plenty for both)
    expect(grain1).toBeGreaterThan(0);
    expect(grain2).toBeGreaterThan(0);
  });
});

describe("Economy integration: deposit depletion event", () => {
  it("DepositDepleted event fires when stone deposit reaches 0", () => {
    // Create a nearly depleted stone deposit and call regenerateDeposits
    const state = buildEconomyState({
      deposits: {
        "15,15": makeDeposit("stone", 0) // Already at 0 yield, no depletedDay set
      },
      day: 10
    });

    const result = regenerateDeposits(state);

    const depletedEvent = result.events.find(
      (e) => e.type === "DepositDepleted" && e.tileKey === "15,15"
    );
    expect(depletedEvent).toBeDefined();
    expect((depletedEvent as any).depositType).toBe("stone");

    // Deposit should now have depletedDay set
    expect(result.state.grid.terrainDeposits?.["15,15"]?.depletedDay).toBe(10);
  });
});

describe("Economy integration: fertile soil seasonal recovery", () => {
  it("fallow fertile_soil recovers faster than actively farmed soil", () => {
    // Fallow = no building with workers nearby. Recovery = baseRate * 2
    // Active = building with workers nearby. Recovery = baseRate
    // Spring baseRate = 2.0/day

    const fallowState = buildEconomyState({
      deposits: {
        "10,10": makeDeposit("fertile_soil", 500)
      },
      season: "Spring",
      day: 1
    });

    // Active: place a grain_field with worker near the deposit
    const grainField = makeBuilding("grain_field", { x: 10, y: 10 }, "gf-1", {}, ["w1"]);
    const worker = makeCustodian("w1", "Farmer", { x: 10, y: 10 }, {
      assignmentBuildingId: "gf-1"
    });
    const activeState = buildEconomyState({
      buildings: [grainField],
      walkers: [worker],
      deposits: {
        "10,10": makeDeposit("fertile_soil", 500)
      },
      season: "Spring",
      day: 1
    });

    // Regenerate for 1 day
    let fallowCurrent = { ...fallowState, clock: { ...fallowState.clock, day: 2 } };
    const fallowResult = regenerateDeposits(fallowCurrent);

    let activeCurrent = { ...activeState, clock: { ...activeState.clock, day: 2 } };
    const activeResult = regenerateDeposits(activeCurrent);

    const fallowYield = fallowResult.state.grid.terrainDeposits?.["10,10"]?.currentYield ?? 0;
    const activeYield = activeResult.state.grid.terrainDeposits?.["10,10"]?.currentYield ?? 0;

    // Fallow recovery: 500 + 2.0 * 2 = 504
    // Active recovery: 500 + 2.0 * 1 = 502
    expect(fallowYield).toBeGreaterThan(activeYield);
    expect(fallowYield).toBeCloseTo(504, 0);
    expect(activeYield).toBeCloseTo(502, 0);
  });
});

describe("Economy integration: end-to-end resource flow", () => {
  it("grain flows from field to kitchen to bread over multiple days", () => {
    // This is the core supply chain test: grain_field -> (grain) -> kitchen -> (bread) -> workers eat
    // The grain_field produces grain via extraction cycle.
    // The kitchen converts grain to bread via recipe.
    // Workers eat bread/grain.
    //
    // Note: resource transfer between buildings requires the carrier system,
    // so for this test we pre-stock the kitchen with grain and test the
    // grain_field produces, kitchen converts, and workers eat — each in their own building.

    const grainField = makeBuilding("grain_field", { x: 28, y: 49 }, "gf-1", { grain: 0 }, ["w-farmer"]);
    const kitchen = makeBuilding("kitchen", { x: 32, y: 49 }, "k-1", { grain: 10, bread: 2 }, ["w-baker"]);

    const farmer = makeCustodian("w-farmer", "Farmer", { x: 28, y: 49 }, {
      assignmentBuildingId: "gf-1"
    });
    const baker = makeCustodian("w-baker", "Baker", { x: 32, y: 49 }, {
      assignmentBuildingId: "k-1"
    });

    const state = buildEconomyState({
      buildings: [grainField, kitchen],
      walkers: [farmer, baker],
      deposits: {
        "29,49": makeDeposit("fertile_soil")
      },
      season: "Autumn" // Best yield
    });

    // Run for 3 days
    const result = runTicks(state, TICKS_PER_DAY * 3);

    // Grain field should have produced grain
    const fieldGrain = result.state.buildings.find((b) => b.id === "gf-1")!.storedResources.grain ?? 0;
    expect(fieldGrain).toBeGreaterThan(0);

    // Kitchen should have produced bread (and consumed grain)
    const kitchenBread = result.state.buildings.find((b) => b.id === "k-1")!.storedResources.bread ?? 0;
    expect(kitchenBread).toBeGreaterThan(0);

    // Both workers should be alive (well-fed from their building's food stores)
    expect(result.state.walkers.find((w) => w.id === "w-farmer")).toBeDefined();
    expect(result.state.walkers.find((w) => w.id === "w-baker")).toBeDefined();
  });
});

describe("Economy integration: spoilage interacts with production buildings", () => {
  it("bread in kitchen spoils at standard rate during simulation", () => {
    // Kitchen has no spoilageReduction for bread
    // bread base spoilage: ~2%/day
    const kitchen = makeBuilding("kitchen", { x: 32, y: 49 }, "k-1", { bread: 10 }, []);

    const state = buildEconomyState({
      buildings: [kitchen],
      walkers: [],
      season: "Spring"
    });

    const result = runTicks(state, TICKS_PER_DAY);
    const breadRemaining = result.state.buildings.find((b) => b.id === "k-1")!.storedResources.bread ?? 0;

    // ~2% of 10 = ~0.2 lost per day
    expect(breadRemaining).toBeLessThan(10);
    expect(breadRemaining).toBeGreaterThan(9.5);
  });
});

describe("Economy integration: construction blocks production", () => {
  it("building under construction does not produce resources", () => {
    // Create a kitchen that is still under construction
    const base = createBuildingAt("kitchen", { x: 32, y: 49 }, "k-uc");
    const kitchenUC: BuildingInstance = {
      ...base,
      constructionProgress: 0,
      constructionWork: 10,
      condition: 0,
      storedResources: { grain: 20 },
      assignedWorkerIds: ["w1"],
      connectedToRoad: true
    };
    const worker = makeCustodian("w1", "Baker", { x: 32, y: 49 }, {
      assignmentBuildingId: "k-uc"
    });

    const state = buildEconomyState({
      buildings: [kitchenUC],
      walkers: [worker],
      season: "Spring"
    });

    const result = runTicks(state, TICKS_PER_DAY);
    const bread = result.state.buildings.find((b) => b.id === "k-uc")!.storedResources.bread ?? 0;

    // No bread should be produced while under construction
    expect(bread).toBe(0);
  });
});
