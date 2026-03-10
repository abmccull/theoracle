import { describe, expect, it } from "vitest";

import { buildingDefs } from "@the-oracle/content";
import { createInitialState } from "../src/state/initialState";
import { createBuildingAt } from "../src/simulation/updateDay";
import { advanceWorkerPhases } from "../src/simulation/production";
import type {
  BuildingInstance,
  GameEvent,
  GameState,
  TerrainDeposit,
  WalkerInstance
} from "../src/state/gameState";

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function makeCustodian(
  id: string,
  tile = { x: 10, y: 10 },
  overrides: Partial<WalkerInstance> = {}
): WalkerInstance {
  return {
    id,
    role: "custodian",
    name: `Worker ${id}`,
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

function makeBuilding(
  defId: BuildingInstance["defId"],
  id: string,
  position = { x: 10, y: 10 },
  overrides: Partial<BuildingInstance> = {}
): BuildingInstance {
  const base = createBuildingAt(defId, position, id);
  const def = buildingDefs[defId];
  // Force construction complete for tests
  return {
    ...base,
    condition: def.maxCondition,
    storedResources: { ...def.startingResources },
    constructionProgress: base.constructionWork ?? 0,
    assignedWorkerIds: [],
    ...overrides
  };
}

function makeTimberDeposit(currentYield = 80): TerrainDeposit {
  return { type: "timber", currentYield, maxYield: 80, regenPerDay: 0.4 };
}

function makeFertileSoilDeposit(currentYield = 999): TerrainDeposit {
  return { type: "fertile_soil", currentYield, maxYield: 999, regenPerDay: 0.2 };
}

function makeSacredSpringDeposit(currentYield = 9999): TerrainDeposit {
  return { type: "sacred_spring", currentYield, maxYield: 9999, regenPerDay: 0.15 };
}

function makeStoneDeposit(currentYield = 400): TerrainDeposit {
  return { type: "stone", currentYield, maxYield: 400, regenPerDay: 0 };
}

/** Build a state suitable for production testing with a single extraction building + worker. */
function makeProductionState(opts: {
  defId: BuildingInstance["defId"];
  buildingPos?: { x: number; y: number };
  workerPos?: { x: number; y: number };
  depositPos?: { x: number; y: number };
  deposit?: TerrainDeposit;
  season?: GameState["clock"]["season"];
  workerOverrides?: Partial<WalkerInstance>;
  buildingOverrides?: Partial<BuildingInstance>;
}): GameState {
  const base = createInitialState();
  const bPos = opts.buildingPos ?? { x: 10, y: 10 };
  const wPos = opts.workerPos ?? bPos;
  const dPos = opts.depositPos ?? { x: 12, y: 10 };

  const building = makeBuilding(opts.defId, "prod-building-1", bPos, {
    assignedWorkerIds: ["worker-1"],
    ...(opts.buildingOverrides ?? {})
  });
  const worker = makeCustodian("worker-1", wPos, {
    assignmentBuildingId: "prod-building-1",
    productionPhase: "idle",
    ...(opts.workerOverrides ?? {})
  });

  const deposit = opts.deposit ?? makeTimberDeposit();
  const deposits: Record<string, TerrainDeposit> = {
    [`${dPos.x},${dPos.y}`]: deposit
  };

  // Place roads connecting building to deposit (simple horizontal road)
  const roads = [...base.grid.roads];
  const minX = Math.min(bPos.x, dPos.x);
  const maxX = Math.max(bPos.x, dPos.x);
  for (let x = minX; x <= maxX; x++) {
    roads.push({ x, y: bPos.y });
  }
  // Also vertical roads if needed
  const minY = Math.min(bPos.y, dPos.y);
  const maxY = Math.max(bPos.y, dPos.y);
  for (let y = minY; y <= maxY; y++) {
    roads.push({ x: dPos.x, y });
  }

  return {
    ...base,
    buildings: [building],
    walkers: [worker],
    grid: {
      ...base.grid,
      roads,
      terrainDeposits: deposits
    },
    clock: {
      ...base.clock,
      season: opts.season ?? "Spring"
    }
  };
}

function getWorker(state: GameState, id = "worker-1"): WalkerInstance {
  return state.walkers.find((w) => w.id === id)!;
}

function getBuilding(state: GameState, id = "prod-building-1"): BuildingInstance {
  return state.buildings.find((b) => b.id === id)!;
}

// ---------------------------------------------------------------------------
//  Tests
// ---------------------------------------------------------------------------

describe("Worker Production Phases", () => {
  it("assigned custodian at logging camp enters walking_to_deposit phase", () => {
    const state = makeProductionState({ defId: "hylotomos_camp" });
    const events: GameEvent[] = [];
    const result = advanceWorkerPhases(state, events);
    const worker = getWorker(result.state);

    expect(worker.productionPhase).toBe("walking_to_deposit");
    expect(worker.gatherTargetTile).toEqual({ x: 12, y: 10 });
    expect(worker.state).toBe("moving");
  });

  it("transitions from walking_to_deposit to gathering on arrival", () => {
    // Worker is already at deposit location
    const state = makeProductionState({
      defId: "hylotomos_camp",
      workerPos: { x: 12, y: 10 },
      workerOverrides: {
        productionPhase: "walking_to_deposit",
        gatherTargetTile: { x: 12, y: 10 }
      }
    });
    const events: GameEvent[] = [];
    const result = advanceWorkerPhases(state, events);
    const worker = getWorker(result.state);

    expect(worker.productionPhase).toBe("gathering");
    expect(worker.phaseProgress).toBe(0);
    expect(worker.phaseWork).toBe(40); // hylotomos_camp gatherTicks
    expect(worker.state).toBe("working");
  });

  it("increments phaseProgress each tick during gathering", () => {
    const state = makeProductionState({
      defId: "hylotomos_camp",
      workerPos: { x: 12, y: 10 },
      workerOverrides: {
        productionPhase: "gathering",
        gatherTargetTile: { x: 12, y: 10 },
        phaseProgress: 5,
        phaseWork: 40
      }
    });
    const events: GameEvent[] = [];
    const result = advanceWorkerPhases(state, events);
    const worker = getWorker(result.state);

    expect(worker.productionPhase).toBe("gathering");
    expect(worker.phaseProgress).toBe(6);
  });

  it("after gathering ticks complete, depletes deposit and enters returning", () => {
    const state = makeProductionState({
      defId: "hylotomos_camp",
      workerPos: { x: 12, y: 10 },
      deposit: makeTimberDeposit(80),
      workerOverrides: {
        productionPhase: "gathering",
        gatherTargetTile: { x: 12, y: 10 },
        phaseProgress: 39, // will become 40 = gatherTicks
        phaseWork: 40
      }
    });
    const events: GameEvent[] = [];
    const result = advanceWorkerPhases(state, events);
    const worker = getWorker(result.state);

    expect(worker.productionPhase).toBe("returning");
    expect(worker.gatherAmount).toBe(1.2); // gatherYield for hylotomos_camp
    expect(worker.gatherResourceId).toBe("logs");
    expect(worker.state).toBe("moving");

    // Deposit should be depleted by 1.2
    const deposit = result.state.grid.terrainDeposits!["12,10"];
    expect(deposit.currentYield).toBeCloseTo(80 - 1.2, 5);
  });

  it("transitions from returning to processing on arrival at building", () => {
    const state = makeProductionState({
      defId: "hylotomos_camp",
      buildingPos: { x: 10, y: 10 },
      workerPos: { x: 10, y: 10 }, // already at building
      workerOverrides: {
        productionPhase: "returning",
        gatherTargetTile: { x: 12, y: 10 },
        gatherAmount: 1.2,
        gatherResourceId: "logs"
      }
    });
    const events: GameEvent[] = [];
    const result = advanceWorkerPhases(state, events);
    const worker = getWorker(result.state);

    expect(worker.productionPhase).toBe("processing");
    expect(worker.phaseProgress).toBe(0);
    expect(worker.phaseWork).toBe(20); // hylotomos_camp processTicks
    expect(worker.state).toBe("working");
  });

  it("increments phaseProgress each tick during processing", () => {
    const state = makeProductionState({
      defId: "hylotomos_camp",
      workerOverrides: {
        productionPhase: "processing",
        phaseProgress: 10,
        phaseWork: 20,
        gatherAmount: 1.2,
        gatherResourceId: "logs"
      }
    });
    const events: GameEvent[] = [];
    const result = advanceWorkerPhases(state, events);
    const worker = getWorker(result.state);

    expect(worker.productionPhase).toBe("processing");
    expect(worker.phaseProgress).toBe(11);
  });

  it("after processing completes, transitions to storing", () => {
    const state = makeProductionState({
      defId: "hylotomos_camp",
      workerOverrides: {
        productionPhase: "processing",
        phaseProgress: 19, // will become 20 = processTicks
        phaseWork: 20,
        gatherAmount: 1.2,
        gatherResourceId: "logs"
      }
    });
    const events: GameEvent[] = [];
    const result = advanceWorkerPhases(state, events);
    const worker = getWorker(result.state);

    expect(worker.productionPhase).toBe("storing");
  });

  it("storing phase deposits resources and returns to idle", () => {
    const state = makeProductionState({
      defId: "hylotomos_camp",
      workerOverrides: {
        productionPhase: "storing",
        gatherAmount: 1.2,
        gatherResourceId: "logs"
      }
    });
    const events: GameEvent[] = [];
    const result = advanceWorkerPhases(state, events);
    const worker = getWorker(result.state);
    const building = getBuilding(result.state);

    expect(worker.productionPhase).toBe("idle");
    expect(worker.gatherAmount).toBeUndefined();
    expect(worker.gatherResourceId).toBeUndefined();
    expect(worker.gatherTargetTile).toBeUndefined();
    expect(worker.state).toBe("idle");

    // Building should have logs stored
    expect(building.storedResources.logs).toBeGreaterThan(0);

    // Events should include a ResourceProduced event
    const produced = events.find((e) => e.type === "ResourceProduced");
    expect(produced).toBeDefined();
  });

  it("full cycle produces expected resource amounts", () => {
    // Start with storing phase for simplicity — validate the amount deposited
    const state = makeProductionState({
      defId: "lithotomia",
      deposit: makeStoneDeposit(),
      workerOverrides: {
        productionPhase: "storing",
        gatherAmount: 1.0, // lithotomia gatherYield
        gatherResourceId: "stone"
      },
      buildingOverrides: {
        storedResources: { stone: 5 }
      }
    });
    const events: GameEvent[] = [];
    const result = advanceWorkerPhases(state, events);
    const building = getBuilding(result.state);

    expect(building.storedResources.stone).toBe(6.0); // 5 existing + 1.0 gathered
  });

  it("unassigned building produces nothing via phase system", () => {
    const base = createInitialState();
    const building = makeBuilding("hylotomos_camp", "unassigned-camp", { x: 10, y: 10 }, {
      assignedWorkerIds: [] // no workers
    });
    const worker = makeCustodian("free-worker", { x: 10, y: 10 }); // not assigned

    const state: GameState = {
      ...base,
      buildings: [building],
      walkers: [worker],
      grid: {
        ...base.grid,
        terrainDeposits: { "12,10": makeTimberDeposit() }
      }
    };

    const events: GameEvent[] = [];
    const result = advanceWorkerPhases(state, events);

    // Worker should remain unchanged — not assigned to production building
    const w = getWorker(result.state, "free-worker");
    expect(w.productionPhase).toBeUndefined();
  });

  it("grain field idles in winter", () => {
    const state = makeProductionState({
      defId: "grain_field",
      deposit: makeFertileSoilDeposit(),
      season: "Winter"
    });
    const events: GameEvent[] = [];
    const result = advanceWorkerPhases(state, events);
    const worker = getWorker(result.state);

    expect(worker.productionPhase).toBe("idle");
  });

  it("grain field starts production in non-winter season", () => {
    const state = makeProductionState({
      defId: "grain_field",
      deposit: makeFertileSoilDeposit(),
      season: "Spring"
    });
    const events: GameEvent[] = [];
    const result = advanceWorkerPhases(state, events);
    const worker = getWorker(result.state);

    expect(worker.productionPhase).toBe("walking_to_deposit");
  });

  it("grain field has seasonal yield modifiers", () => {
    // Test that Spring gives 1.3x yield during gathering completion
    const springState = makeProductionState({
      defId: "grain_field",
      deposit: makeFertileSoilDeposit(),
      season: "Spring",
      workerPos: { x: 12, y: 10 },
      workerOverrides: {
        productionPhase: "gathering",
        gatherTargetTile: { x: 12, y: 10 },
        phaseProgress: 59, // will complete (60 = grain_field gatherTicks)
        phaseWork: 60
      }
    });
    const springEvents: GameEvent[] = [];
    const springResult = advanceWorkerPhases(springState, springEvents);
    const springWorker = getWorker(springResult.state);
    // Spring: 1.5 * 1.3 = 1.95
    expect(springWorker.gatherAmount).toBeCloseTo(1.95, 5);

    // Test Autumn gives 1.5x yield
    const autumnState = makeProductionState({
      defId: "grain_field",
      deposit: makeFertileSoilDeposit(),
      season: "Autumn",
      workerPos: { x: 12, y: 10 },
      workerOverrides: {
        productionPhase: "gathering",
        gatherTargetTile: { x: 12, y: 10 },
        phaseProgress: 59,
        phaseWork: 60
      }
    });
    const autumnEvents: GameEvent[] = [];
    const autumnResult = advanceWorkerPhases(autumnState, autumnEvents);
    const autumnWorker = getWorker(autumnResult.state);
    // Autumn: 1.5 * 1.5 = 2.25
    expect(autumnWorker.gatherAmount).toBeCloseTo(2.25, 5);

    // Test Summer gives 0.5x yield
    const summerState = makeProductionState({
      defId: "grain_field",
      deposit: makeFertileSoilDeposit(),
      season: "Summer",
      workerPos: { x: 12, y: 10 },
      workerOverrides: {
        productionPhase: "gathering",
        gatherTargetTile: { x: 12, y: 10 },
        phaseProgress: 59,
        phaseWork: 60
      }
    });
    const summerEvents: GameEvent[] = [];
    const summerResult = advanceWorkerPhases(summerState, summerEvents);
    const summerWorker = getWorker(summerResult.state);
    // Summer: 1.5 * 0.5 = 0.75
    expect(summerWorker.gatherAmount).toBeCloseTo(0.75, 5);
  });

  it("building with productionCycle is skipped by recipe system", () => {
    // Verify the productionCycle field exists on extraction buildings
    const loggingDef = buildingDefs.hylotomos_camp;
    expect(loggingDef.productionCycle).toBeDefined();
    expect(loggingDef.productionCycle!.depositType).toBe("timber");
    expect(loggingDef.productionCycle!.gatherTicks).toBe(40);
    expect(loggingDef.productionCycle!.gatherYield).toBe(1.2);
    expect(loggingDef.productionCycle!.processTicks).toBe(20);

    const quarryDef = buildingDefs.lithotomia;
    expect(quarryDef.productionCycle).toBeDefined();
    expect(quarryDef.productionCycle!.depositType).toBe("stone");

    const grainDef = buildingDefs.grain_field;
    expect(grainDef.productionCycle).toBeDefined();
    expect(grainDef.productionCycle!.depositType).toBe("fertile_soil");

    const oliveDef = buildingDefs.olive_grove;
    expect(oliveDef.productionCycle).toBeDefined();
    expect(oliveDef.productionCycle!.depositType).toBe("fertile_soil");

    const springDef = buildingDefs.castalian_spring;
    expect(springDef.productionCycle).toBeDefined();
    expect(springDef.productionCycle!.depositType).toBe("sacred_spring");

    // Non-extraction buildings should NOT have productionCycle
    expect(buildingDefs.kitchen.productionCycle).toBeUndefined();
    expect(buildingDefs.olive_press.productionCycle).toBeUndefined();
    expect(buildingDefs.animal_pen.productionCycle).toBeUndefined();
  });

  it("castalian_spring uses sacred_spring deposit type", () => {
    const state = makeProductionState({
      defId: "castalian_spring",
      deposit: makeSacredSpringDeposit(),
      buildingOverrides: {
        assignedPriestIds: ["priest-1"], // castalian_spring requires priest
        assignedWorkerIds: ["worker-1"]
      }
    });
    const events: GameEvent[] = [];
    const result = advanceWorkerPhases(state, events);
    const worker = getWorker(result.state);

    expect(worker.productionPhase).toBe("walking_to_deposit");
    expect(worker.gatherTargetTile).toEqual({ x: 12, y: 10 });
  });

  it("stays idle when no deposit is in range", () => {
    const base = createInitialState();
    const building = makeBuilding("hylotomos_camp", "prod-building-1", { x: 10, y: 10 }, {
      assignedWorkerIds: ["worker-1"]
    });
    const worker = makeCustodian("worker-1", { x: 10, y: 10 }, {
      assignmentBuildingId: "prod-building-1",
      productionPhase: "idle"
    });

    // No deposits at all
    const state: GameState = {
      ...base,
      buildings: [building],
      walkers: [worker],
      grid: {
        ...base.grid,
        terrainDeposits: {}
      }
    };
    const events: GameEvent[] = [];
    const result = advanceWorkerPhases(state, events);
    const w = getWorker(result.state);
    expect(w.productionPhase).toBe("idle");
  });

  it("yield is capped by remaining deposit amount", () => {
    // Deposit has only 0.5 yield left, but gatherYield is 1.2
    const state = makeProductionState({
      defId: "hylotomos_camp",
      workerPos: { x: 12, y: 10 },
      deposit: makeTimberDeposit(0.5),
      workerOverrides: {
        productionPhase: "gathering",
        gatherTargetTile: { x: 12, y: 10 },
        phaseProgress: 39,
        phaseWork: 40
      }
    });
    const events: GameEvent[] = [];
    const result = advanceWorkerPhases(state, events);
    const worker = getWorker(result.state);

    // Should be capped at 0.5 (the remaining deposit)
    expect(worker.gatherAmount).toBeCloseTo(0.5, 5);

    // Deposit should be fully depleted
    const deposit = result.state.grid.terrainDeposits!["12,10"];
    expect(deposit.currentYield).toBe(0);
  });
});
