import { describe, expect, it } from "vitest";

import { createInitialState } from "../src/state/initialState";
import { createBuildingAt, runSimulationTick } from "../src/simulation/updateDay";
import { processFoodConsumption, HUNGER_STARVING_TICKS, STARVING_EFFICIENCY } from "../src/simulation/food";
import type { GameState, WalkerInstance, BuildingInstance, GameEvent, PriestState } from "../src/state/gameState";

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

function makeCarrier(id: string, name: string, tile = { x: 30, y: 50 }): WalkerInstance {
  return makeCustodian(id, name, tile, { role: "carrier" });
}

function makePilgrim(id: string, name: string, tile = { x: 30, y: 50 }): WalkerInstance {
  return makeCustodian(id, name, tile, { role: "pilgrim" });
}

function makePriestWalker(
  id: string,
  name: string,
  tile = { x: 30, y: 50 },
  overrides: Partial<WalkerInstance> = {}
): WalkerInstance {
  return makeCustodian(id, name, tile, { role: "priest", ...overrides });
}

function makePriestState(
  id: string,
  walkerId: string,
  homeBuildingId?: string
): PriestState {
  return {
    id,
    walkerId,
    role: "attendant",
    skill: 50,
    morale: 80,
    range: 5,
    homeBuildingId
  };
}

function makeStorehouse(
  id: string,
  position = { x: 30, y: 50 },
  storedResources: Partial<Record<string, number>> = {}
): BuildingInstance {
  const base = createBuildingAt("storehouse", position, id);
  return {
    ...base,
    storedResources: { ...base.storedResources, ...storedResources }
  };
}

function makeGranary(
  id: string,
  position = { x: 30, y: 50 },
  storedResources: Partial<Record<string, number>> = {}
): BuildingInstance {
  const base = createBuildingAt("granary", position, id);
  return {
    ...base,
    storedResources: { ...base.storedResources, ...storedResources }
  };
}

function makeGrainField(
  id: string,
  position = { x: 28, y: 49 },
  storedResources: Partial<Record<string, number>> = {}
): BuildingInstance {
  const base = createBuildingAt("grain_field", position, id);
  return {
    ...base,
    storedResources: { ...base.storedResources, ...storedResources }
  };
}

function makePriestQuarters(
  id: string,
  position = { x: 30, y: 50 },
  storedResources: Partial<Record<string, number>> = {}
): BuildingInstance {
  const base = createBuildingAt("priest_quarters", position, id);
  return {
    ...base,
    storedResources: { ...base.storedResources, ...storedResources }
  };
}

function setupBaseState(overrides?: Partial<GameState>): GameState {
  const base = createInitialState();
  return { ...base, ...overrides };
}

/** Set the tick on a state for food-shortage message throttle tests. */
function withTick(state: GameState, tick: number): GameState {
  return { ...state, clock: { ...state.clock, tick } };
}

// ---------------------------------------------------------------------------
//  Tests
// ---------------------------------------------------------------------------

describe("Food consumption", () => {
  // -----------------------------------------------------------------------
  //  1. Bread-first consumption
  // -----------------------------------------------------------------------

  it("prefers bread over grain when both are available", () => {
    let state = setupBaseState();
    const field = makeGrainField("test-field", { x: 28, y: 49 }, { bread: 2, grain: 5 });
    const worker = makeCustodian("w1", "Worker 1", { x: 28, y: 49 }, {
      assignmentBuildingId: "test-field"
    });

    state = {
      ...state,
      buildings: [...state.buildings, { ...field, assignedWorkerIds: ["w1"] }],
      walkers: [worker]
    };

    const initialBread = state.buildings.find((b) => b.id === "test-field")!.storedResources.bread ?? 0;
    const initialGrain = state.buildings.find((b) => b.id === "test-field")!.storedResources.grain ?? 0;

    const result = processFoodConsumption(state, []);

    const updatedField = result.buildings.find((b) => b.id === "test-field")!;
    const finalBread = updatedField.storedResources.bread ?? 0;
    const finalGrain = updatedField.storedResources.grain ?? 0;

    // Bread should decrease by 0.01
    expect(initialBread - finalBread).toBeCloseTo(0.01, 4);
    // Grain should remain unchanged (bread was preferred)
    expect(finalGrain).toBe(initialGrain);
  });

  it("consumes bread at 0.01 per tick", () => {
    let state = setupBaseState();
    const field = makeGrainField("test-field", { x: 28, y: 49 }, { bread: 2, grain: 0 });
    const worker = makeCustodian("w1", "Worker 1", { x: 28, y: 49 }, {
      assignmentBuildingId: "test-field"
    });

    state = {
      ...state,
      buildings: [...state.buildings, { ...field, assignedWorkerIds: ["w1"] }],
      walkers: [worker]
    };

    const result = processFoodConsumption(state, []);
    const updatedField = result.buildings.find((b) => b.id === "test-field")!;

    expect(2 - (updatedField.storedResources.bread ?? 0)).toBeCloseTo(0.01, 4);
  });

  // -----------------------------------------------------------------------
  //  2. Grain fallback
  // -----------------------------------------------------------------------

  it("falls back to grain when no bread available", () => {
    let state = setupBaseState();
    const field = makeGrainField("test-field", { x: 28, y: 49 }, { bread: 0, grain: 5 });
    const worker = makeCustodian("w1", "Worker 1", { x: 28, y: 49 }, {
      assignmentBuildingId: "test-field"
    });

    state = {
      ...state,
      buildings: [...state.buildings, { ...field, assignedWorkerIds: ["w1"] }],
      walkers: [worker]
    };

    const result = processFoodConsumption(state, []);
    const updatedField = result.buildings.find((b) => b.id === "test-field")!;
    const finalGrain = updatedField.storedResources.grain ?? 0;

    // Grain should decrease by FOOD_PER_WORKER_PER_TICK (0.02)
    expect(5 - finalGrain).toBeCloseTo(0.02, 4);
  });

  it("falls back to grain when bread is below threshold", () => {
    let state = setupBaseState();
    // Bread below 0.01 threshold
    const field = makeGrainField("test-field", { x: 28, y: 49 }, { bread: 0.005, grain: 5 });
    const worker = makeCustodian("w1", "Worker 1", { x: 28, y: 49 }, {
      assignmentBuildingId: "test-field"
    });

    state = {
      ...state,
      buildings: [...state.buildings, { ...field, assignedWorkerIds: ["w1"] }],
      walkers: [worker]
    };

    const result = processFoodConsumption(state, []);
    const updatedField = result.buildings.find((b) => b.id === "test-field")!;

    // Bread should remain unchanged (not enough for a tick)
    expect(updatedField.storedResources.bread).toBeCloseTo(0.005, 6);
    // Grain should decrease
    expect(5 - (updatedField.storedResources.grain ?? 0)).toBeCloseTo(0.02, 4);
  });

  // -----------------------------------------------------------------------
  //  3. Hunger accumulation
  // -----------------------------------------------------------------------

  it("hungerTicks increments when no food available", () => {
    let state = setupBaseState();
    const field = makeGrainField("test-field", { x: 28, y: 49 }, { bread: 0, grain: 0 });
    const worker = makeCustodian("w1", "Worker 1", { x: 28, y: 49 }, {
      assignmentBuildingId: "test-field",
      hungerTicks: 0
    });

    state = {
      ...state,
      buildings: [...state.buildings, { ...field, assignedWorkerIds: ["w1"] }],
      walkers: [worker]
    };

    const result = processFoodConsumption(state, []);
    const updatedWorker = result.walkers.find((w) => w.id === "w1")!;

    expect(updatedWorker.hungerTicks).toBe(1);
  });

  it("hungerTicks accumulates over multiple ticks without food", () => {
    let state = setupBaseState();
    const field = makeGrainField("test-field", { x: 28, y: 49 }, { bread: 0, grain: 0 });
    const worker = makeCustodian("w1", "Worker 1", { x: 28, y: 49 }, {
      assignmentBuildingId: "test-field",
      hungerTicks: 100
    });

    state = {
      ...state,
      buildings: [...state.buildings, { ...field, assignedWorkerIds: ["w1"] }],
      walkers: [worker]
    };

    const result = processFoodConsumption(state, []);
    const updatedWorker = result.walkers.find((w) => w.id === "w1")!;

    expect(updatedWorker.hungerTicks).toBe(101);
  });

  // -----------------------------------------------------------------------
  //  4. Fed resets hunger
  // -----------------------------------------------------------------------

  it("hungerTicks resets to 0 when food is consumed", () => {
    let state = setupBaseState();
    const field = makeGrainField("test-field", { x: 28, y: 49 }, { bread: 2, grain: 5 });
    const worker = makeCustodian("w1", "Worker 1", { x: 28, y: 49 }, {
      assignmentBuildingId: "test-field",
      hungerTicks: 500
    });

    state = {
      ...state,
      buildings: [...state.buildings, { ...field, assignedWorkerIds: ["w1"] }],
      walkers: [worker]
    };

    const result = processFoodConsumption(state, []);
    const updatedWorker = result.walkers.find((w) => w.id === "w1")!;

    expect(updatedWorker.hungerTicks).toBe(0);
  });

  // -----------------------------------------------------------------------
  //  5. Starvation death
  // -----------------------------------------------------------------------

  it("worker at HUNGER_DEATH_TICKS is removed from walkers", () => {
    let state = setupBaseState();
    const field = makeGrainField("test-field", { x: 28, y: 49 }, { bread: 0, grain: 0 });
    const worker = makeCustodian("w1", "Worker 1", { x: 28, y: 49 }, {
      assignmentBuildingId: "test-field",
      hungerTicks: 3000 - 1
    });

    state = {
      ...state,
      buildings: [...state.buildings, { ...field, assignedWorkerIds: ["w1"] }],
      walkers: [worker]
    };

    const result = processFoodConsumption(state, []);

    expect(result.walkers.find((w) => w.id === "w1")).toBeUndefined();
  });

  it("starved worker removed from building.assignedWorkerIds", () => {
    let state = setupBaseState();
    const field = makeGrainField("test-field", { x: 28, y: 49 }, { bread: 0, grain: 0 });
    const worker = makeCustodian("w1", "Worker 1", { x: 28, y: 49 }, {
      assignmentBuildingId: "test-field",
      hungerTicks: 3000 - 1
    });

    state = {
      ...state,
      buildings: [...state.buildings, { ...field, assignedWorkerIds: ["w1"] }],
      walkers: [worker]
    };

    const result = processFoodConsumption(state, []);

    const updatedField = result.buildings.find((b) => b.id === "test-field")!;
    expect(updatedField.assignedWorkerIds).not.toContain("w1");
  });

  it("starvation death generates event feed message with walker name", () => {
    let state = setupBaseState();
    const field = makeGrainField("test-field", { x: 28, y: 49 }, { bread: 0, grain: 0 });
    const worker = makeCustodian("w1", "Alexios", { x: 28, y: 49 }, {
      assignmentBuildingId: "test-field",
      hungerTicks: 3000 - 1
    });

    state = {
      ...state,
      buildings: [...state.buildings, { ...field, assignedWorkerIds: ["w1"] }],
      walkers: [worker],
      eventFeed: []
    };

    const result = processFoodConsumption(state, []);

    expect(result.eventFeed.length).toBeGreaterThan(0);
    const starvationEvent = result.eventFeed.find((e) => e.text.includes("perished from starvation"));
    expect(starvationEvent).toBeDefined();
    expect(starvationEvent!.text).toContain("Alexios");
  });

  it("starvation death increments nextId", () => {
    let state = setupBaseState();
    const field = makeGrainField("test-field", { x: 28, y: 49 }, { bread: 0, grain: 0 });
    const worker = makeCustodian("w1", "Worker 1", { x: 28, y: 49 }, {
      assignmentBuildingId: "test-field",
      hungerTicks: 3000 - 1
    });

    const initialNextId = state.nextId;
    state = {
      ...state,
      buildings: [...state.buildings, { ...field, assignedWorkerIds: ["w1"] }],
      walkers: [worker],
      eventFeed: []
    };

    const result = processFoodConsumption(state, []);

    expect(result.nextId).toBeGreaterThan(initialNextId);
  });

  // -----------------------------------------------------------------------
  //  6. Unassigned custodian eats from nearest storage
  // -----------------------------------------------------------------------

  it("unassigned custodian eats from nearest storehouse", () => {
    let state = setupBaseState();
    const storehouse = makeStorehouse("test-storehouse", { x: 31, y: 50 }, { grain: 10, bread: 5 });
    const worker = makeCustodian("w1", "Worker 1", { x: 30, y: 50 });

    state = {
      ...state,
      buildings: [...state.buildings, storehouse],
      walkers: [worker]
    };

    const result = processFoodConsumption(state, []);
    const updatedStorehouse = result.buildings.find((b) => b.id === "test-storehouse")!;

    // Should have consumed bread (preferred)
    expect((updatedStorehouse.storedResources.bread ?? 0)).toBeLessThan(5);
  });

  it("unassigned custodian eats from nearest granary", () => {
    let state = setupBaseState();
    const granary = makeGranary("test-granary", { x: 31, y: 50 }, { grain: 10, bread: 0 });
    const worker = makeCustodian("w1", "Worker 1", { x: 30, y: 50 });

    state = {
      ...state,
      buildings: [...state.buildings, granary],
      walkers: [worker]
    };

    const result = processFoodConsumption(state, []);
    const updatedGranary = result.buildings.find((b) => b.id === "test-granary")!;

    expect((updatedGranary.storedResources.grain ?? 0)).toBeLessThan(10);
  });

  it("unassigned custodian picks the nearest storage building", () => {
    let state = setupBaseState();
    const farStore = makeStorehouse("far-store", { x: 38, y: 50 }, { grain: 10, bread: 5 });
    const closeStore = makeStorehouse("close-store", { x: 32, y: 50 }, { grain: 10, bread: 5 });
    const worker = makeCustodian("w1", "Worker 1", { x: 30, y: 50 });

    state = {
      ...state,
      buildings: [...state.buildings, farStore, closeStore],
      walkers: [worker]
    };

    const result = processFoodConsumption(state, []);
    const updatedClose = result.buildings.find((b) => b.id === "close-store")!;
    const updatedFar = result.buildings.find((b) => b.id === "far-store")!;

    // Closer storehouse should lose bread
    expect((updatedClose.storedResources.bread ?? 0)).toBeLessThan(5);
    // Far storehouse should be untouched
    expect(updatedFar.storedResources.bread).toBe(5);
  });

  it("unassigned custodian beyond search radius gets no food", () => {
    let state = setupBaseState();
    // Storehouse 11 tiles away (beyond FOOD_SEARCH_RADIUS of 10)
    const storehouse = makeStorehouse("test-storehouse", { x: 41, y: 50 }, { grain: 10, bread: 5 });
    const worker = makeCustodian("w1", "Worker 1", { x: 30, y: 50 });

    state = {
      ...state,
      buildings: [...state.buildings, storehouse],
      walkers: [worker]
    };

    const result = processFoodConsumption(state, []);
    const updatedWorker = result.walkers.find((w) => w.id === "w1")!;

    expect(updatedWorker.hungerTicks).toBe(1);
    const updatedStore = result.buildings.find((b) => b.id === "test-storehouse")!;
    expect(updatedStore.storedResources.bread).toBe(5);
    expect(updatedStore.storedResources.grain).toBe(10);
  });

  it("unassigned custodian ignores non-storage buildings", () => {
    let state = setupBaseState();
    // grain_field is not a storage building
    const field = makeGrainField("test-field", { x: 31, y: 50 }, { grain: 10, bread: 5 });
    const worker = makeCustodian("w1", "Worker 1", { x: 30, y: 50 });

    state = {
      ...state,
      buildings: [...state.buildings, field],
      walkers: [worker]
    };

    const result = processFoodConsumption(state, []);
    const updatedWorker = result.walkers.find((w) => w.id === "w1")!;

    expect(updatedWorker.hungerTicks).toBe(1);
  });

  // -----------------------------------------------------------------------
  //  7. Priest eats from home building
  // -----------------------------------------------------------------------

  it("priest walker eats from homeBuildingId", () => {
    let state = setupBaseState();
    const quarters = makePriestQuarters("test-quarters", { x: 30, y: 50 }, { bread: 5, grain: 10 });
    const priestWalker = makePriestWalker("priest-w1", "High Priest", { x: 35, y: 55 });
    const priest = makePriestState("priest-1", "priest-w1", "test-quarters");

    state = {
      ...state,
      buildings: [...state.buildings, quarters],
      walkers: [priestWalker],
      priests: [priest]
    };

    const result = processFoodConsumption(state, []);
    const updatedQuarters = result.buildings.find((b) => b.id === "test-quarters")!;

    // Priest should have consumed bread from home building
    expect((updatedQuarters.storedResources.bread ?? 0)).toBeLessThan(5);
  });

  it("priest walker without home building goes hungry", () => {
    let state = setupBaseState();
    const priestWalker = makePriestWalker("priest-w1", "Wandering Priest", { x: 30, y: 50 });
    const priest = makePriestState("priest-1", "priest-w1", undefined);

    state = {
      ...state,
      walkers: [priestWalker],
      priests: [priest]
    };

    const result = processFoodConsumption(state, []);
    const updatedPriest = result.walkers.find((w) => w.id === "priest-w1")!;

    expect(updatedPriest.hungerTicks).toBe(1);
  });

  it("priest eats from home building regardless of distance", () => {
    let state = setupBaseState();
    // Home building very far from walker position
    const quarters = makePriestQuarters("test-quarters", { x: 80, y: 80 }, { bread: 5, grain: 10 });
    const priestWalker = makePriestWalker("priest-w1", "Distant Priest", { x: 5, y: 5 });
    const priest = makePriestState("priest-1", "priest-w1", "test-quarters");

    state = {
      ...state,
      buildings: [...state.buildings, quarters],
      walkers: [priestWalker],
      priests: [priest]
    };

    const result = processFoodConsumption(state, []);
    const updatedQuarters = result.buildings.find((b) => b.id === "test-quarters")!;

    // Should still consume from home building (no distance check for priests)
    expect((updatedQuarters.storedResources.bread ?? 0)).toBeLessThan(5);
  });

  // -----------------------------------------------------------------------
  //  8. Pilgrims don't eat
  // -----------------------------------------------------------------------

  it("pilgrim walkers are skipped entirely", () => {
    let state = setupBaseState();
    const storehouse = makeStorehouse("test-storehouse", { x: 30, y: 50 }, { bread: 5, grain: 10 });
    const pilgrim = makePilgrim("pilgrim-1", "Pilgrim Visitor", { x: 30, y: 50 });

    state = {
      ...state,
      buildings: [...state.buildings, storehouse],
      walkers: [pilgrim]
    };

    const result = processFoodConsumption(state, []);
    const updatedStorehouse = result.buildings.find((b) => b.id === "test-storehouse")!;
    const updatedPilgrim = result.walkers.find((w) => w.id === "pilgrim-1")!;

    // No food consumed
    expect(updatedStorehouse.storedResources.bread).toBe(5);
    expect(updatedStorehouse.storedResources.grain).toBe(10);
    // Pilgrim should not have hungerTicks modified
    expect(updatedPilgrim.hungerTicks).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  //  9. Food shortage messages (tick % 200 === 0)
  // -----------------------------------------------------------------------

  it("emits food shortage messages when tick % 200 === 0 and workers are hungry", () => {
    let state = setupBaseState();
    const field = makeGrainField("test-field", { x: 28, y: 49 }, { bread: 0, grain: 0 });
    const worker = makeCustodian("w1", "Worker 1", { x: 28, y: 49 }, {
      assignmentBuildingId: "test-field",
      hungerTicks: 50
    });

    state = {
      ...state,
      buildings: [...state.buildings, { ...field, assignedWorkerIds: ["w1"] }],
      walkers: [worker],
      eventFeed: []
    };
    state = withTick(state, 200);

    const result = processFoodConsumption(state, []);

    const shortageEvent = result.eventFeed.find((e) => e.text.includes("going hungry"));
    expect(shortageEvent).toBeDefined();
    expect(shortageEvent!.text).toContain("Grain Field");
  });

  it("does not emit food shortage messages when tick is not a multiple of 200", () => {
    let state = setupBaseState();
    const field = makeGrainField("test-field", { x: 28, y: 49 }, { bread: 0, grain: 0 });
    const worker = makeCustodian("w1", "Worker 1", { x: 28, y: 49 }, {
      assignmentBuildingId: "test-field",
      hungerTicks: 50
    });

    state = {
      ...state,
      buildings: [...state.buildings, { ...field, assignedWorkerIds: ["w1"] }],
      walkers: [worker],
      eventFeed: []
    };
    state = withTick(state, 201);

    const result = processFoodConsumption(state, []);

    const shortageEvent = result.eventFeed.find((e) => e.text.includes("going hungry"));
    expect(shortageEvent).toBeUndefined();
  });

  it("does not emit food shortage when all workers are fed", () => {
    let state = setupBaseState();
    const field = makeGrainField("test-field", { x: 28, y: 49 }, { bread: 5, grain: 10 });
    const worker = makeCustodian("w1", "Worker 1", { x: 28, y: 49 }, {
      assignmentBuildingId: "test-field",
      hungerTicks: 0
    });

    state = {
      ...state,
      buildings: [...state.buildings, { ...field, assignedWorkerIds: ["w1"] }],
      walkers: [worker],
      eventFeed: []
    };
    state = withTick(state, 200);

    const result = processFoodConsumption(state, []);

    const shortageEvent = result.eventFeed.find((e) => e.text.includes("going hungry"));
    expect(shortageEvent).toBeUndefined();
  });

  it("food shortage messages are grouped by building (one per building)", () => {
    let state = setupBaseState();
    const field = makeGrainField("test-field", { x: 28, y: 49 }, { bread: 0, grain: 0 });
    const w1 = makeCustodian("w1", "Worker 1", { x: 28, y: 49 }, {
      assignmentBuildingId: "test-field",
      hungerTicks: 50
    });
    const w2 = makeCustodian("w2", "Worker 2", { x: 28, y: 49 }, {
      assignmentBuildingId: "test-field",
      hungerTicks: 50
    });

    state = {
      ...state,
      buildings: [...state.buildings, { ...field, assignedWorkerIds: ["w1", "w2"] }],
      walkers: [w1, w2],
      eventFeed: []
    };
    state = withTick(state, 200);

    const result = processFoodConsumption(state, []);

    const shortageEvents = result.eventFeed.filter((e) => e.text.includes("going hungry"));
    expect(shortageEvents).toHaveLength(1);
  });

  it("emits food shortage at tick 0 (0 % 200 === 0)", () => {
    let state = setupBaseState();
    const field = makeGrainField("test-field", { x: 28, y: 49 }, { bread: 0, grain: 0 });
    const worker = makeCustodian("w1", "Worker 1", { x: 28, y: 49 }, {
      assignmentBuildingId: "test-field",
      hungerTicks: 10
    });

    state = {
      ...state,
      buildings: [...state.buildings, { ...field, assignedWorkerIds: ["w1"] }],
      walkers: [worker],
      eventFeed: []
    };
    state = withTick(state, 0);

    const result = processFoodConsumption(state, []);

    const shortageEvent = result.eventFeed.find((e) => e.text.includes("going hungry"));
    expect(shortageEvent).toBeDefined();
  });

  // -----------------------------------------------------------------------
  //  10. Dead walker cleanup removes priest entries
  // -----------------------------------------------------------------------

  it("starved priest walker is removed from state.priests", () => {
    let state = setupBaseState();
    const quarters = makePriestQuarters("test-quarters", { x: 30, y: 50 }, { bread: 0, grain: 0 });
    const priestWalker = makePriestWalker("priest-w1", "Starving Priest", { x: 30, y: 50 }, {
      hungerTicks: 3000 - 1
    });
    const priest = makePriestState("priest-1", "priest-w1", "test-quarters");

    state = {
      ...state,
      buildings: [...state.buildings, quarters],
      walkers: [priestWalker],
      priests: [priest]
    };

    const result = processFoodConsumption(state, []);

    expect(result.walkers.find((w) => w.id === "priest-w1")).toBeUndefined();
    expect(result.priests.find((p) => p.walkerId === "priest-w1")).toBeUndefined();
  });

  it("surviving priests remain when another priest starves", () => {
    let state = setupBaseState();
    const quarters = makePriestQuarters("test-quarters", { x: 30, y: 50 }, { bread: 0, grain: 0 });
    const dyingPriestWalker = makePriestWalker("priest-dying", "Dying Priest", { x: 30, y: 50 }, {
      hungerTicks: 3000 - 1
    });
    const dyingPriest = makePriestState("priest-d", "priest-dying", "test-quarters");

    const quarters2 = makePriestQuarters("quarters-2", { x: 32, y: 50 }, { bread: 5, grain: 10 });
    const survivingPriestWalker = makePriestWalker("priest-alive", "Living Priest", { x: 32, y: 50 });
    const survivingPriest = makePriestState("priest-a", "priest-alive", "quarters-2");

    state = {
      ...state,
      buildings: [...state.buildings, quarters, quarters2],
      walkers: [dyingPriestWalker, survivingPriestWalker],
      priests: [dyingPriest, survivingPriest]
    };

    const result = processFoodConsumption(state, []);

    expect(result.priests.find((p) => p.walkerId === "priest-dying")).toBeUndefined();
    expect(result.priests.find((p) => p.walkerId === "priest-alive")).toBeDefined();
  });

  // -----------------------------------------------------------------------
  //  Additional edge cases
  // -----------------------------------------------------------------------

  it("carrier walkers consume food normally", () => {
    let state = setupBaseState();
    const field = makeGrainField("test-field", { x: 28, y: 49 }, { bread: 5, grain: 0 });
    const carrier = makeCarrier("c1", "Carrier 1", { x: 28, y: 49 });
    const carrierAssigned: WalkerInstance = { ...carrier, assignmentBuildingId: "test-field" };

    state = {
      ...state,
      buildings: [...state.buildings, { ...field, assignedWorkerIds: ["c1"] }],
      walkers: [carrierAssigned]
    };

    const result = processFoodConsumption(state, []);
    const updatedField = result.buildings.find((b) => b.id === "test-field")!;

    expect((updatedField.storedResources.bread ?? 0)).toBeLessThan(5);
  });

  it("eventFeed is capped at 8 entries", () => {
    let state = setupBaseState();
    const existingFeed = Array.from({ length: 7 }, (_, i) => ({
      id: `existing-${i}`,
      day: 1,
      text: `Existing event ${i}`
    }));

    const buildings: BuildingInstance[] = [];
    const walkers: WalkerInstance[] = [];
    for (let i = 0; i < 3; i++) {
      const field = makeGrainField(`field-${i}`, { x: 28 + i * 2, y: 49 }, { bread: 0, grain: 0 });
      buildings.push({ ...field, assignedWorkerIds: [`w-${i}`] });
      walkers.push(makeCustodian(`w-${i}`, `Worker ${i}`, { x: 28 + i * 2, y: 49 }, {
        assignmentBuildingId: `field-${i}`,
        hungerTicks: 3000 - 1
      }));
    }

    state = {
      ...state,
      buildings: [...state.buildings, ...buildings],
      walkers,
      eventFeed: existingFeed
    };

    const result = processFoodConsumption(state, []);

    expect(result.eventFeed.length).toBeLessThanOrEqual(8);
  });

  it("no state changes when there are no walkers", () => {
    let state = setupBaseState();
    state = { ...state, walkers: [] };

    const result = processFoodConsumption(state, []);

    expect(result.walkers).toHaveLength(0);
    expect(result.eventFeed).toBe(state.eventFeed);
  });

  // -----------------------------------------------------------------------
  //  Exported constants
  // -----------------------------------------------------------------------

  it("exports HUNGER_STARVING_TICKS = 1200", () => {
    expect(HUNGER_STARVING_TICKS).toBe(1200);
  });

  it("exports STARVING_EFFICIENCY = 0.5", () => {
    expect(STARVING_EFFICIENCY).toBe(0.5);
  });

  // -----------------------------------------------------------------------
  //  Starving efficiency integration test
  // -----------------------------------------------------------------------

  it("starving worker has reduced production throughput", () => {
    // Run 1 tick per scenario to isolate hunger-efficiency effect.
    // processBuildings runs BEFORE processFoodConsumption, so on tick 1
    // the starving worker's hungerTicks is still >= HUNGER_STARVING_TICKS.
    // Use kitchen (has staffing.custodians: 1, recipe consumes grain → bread).
    const base = setupBaseState();

    // Scenario A: well-fed worker
    const fedState: GameState = {
      ...base,
      buildings: [...base.buildings, {
        ...createBuildingAt("kitchen", { x: 32, y: 49 }, "k-fed"),
        storedResources: { grain: 20, bread: 0 },
        assignedWorkerIds: ["wf"]
      }],
      walkers: [makeCustodian("wf", "Fed", { x: 32, y: 49 }, {
        assignmentBuildingId: "k-fed",
        hungerTicks: 0
      })]
    };

    // Scenario B: starving worker
    const starvingState: GameState = {
      ...base,
      buildings: [...base.buildings, {
        ...createBuildingAt("kitchen", { x: 32, y: 49 }, "k-starving"),
        storedResources: { grain: 20, bread: 0 },
        assignedWorkerIds: ["ws"]
      }],
      walkers: [makeCustodian("ws", "Starving", { x: 32, y: 49 }, {
        assignmentBuildingId: "k-starving",
        hungerTicks: HUNGER_STARVING_TICKS
      })]
    };

    const fedResult = runSimulationTick(fedState, 1);
    const starvingResult = runSimulationTick(starvingState, 1);

    const fedBread = fedResult.state.buildings.find((b) => b.id === "k-fed")!.storedResources.bread ?? 0;
    const starvingBread = starvingResult.state.buildings.find((b) => b.id === "k-starving")!.storedResources.bread ?? 0;

    // Both should produce bread on first tick
    expect(fedBread).toBeGreaterThan(0);
    expect(starvingBread).toBeGreaterThan(0);

    // Starving worker produces at STARVING_EFFICIENCY (0.5)
    const ratio = starvingBread / fedBread;
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
  });
});
