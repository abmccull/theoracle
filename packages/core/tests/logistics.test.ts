import { describe, expect, it } from "vitest";

import { reduceCommand } from "../src/reducers";
import { createInitialState } from "../src/state/initialState";
import { runSimulationTick } from "../src/simulation/updateDay";

/** Inject a sacred_spring deposit near the given tile so castalian_spring can be placed. */
function injectSacredSpringDeposit(state: ReturnType<typeof createInitialState>, nearX: number, nearY: number) {
  const key = `${nearX},${nearY}`;
  return {
    ...state,
    grid: {
      ...state.grid,
      terrainDeposits: {
        ...(state.grid.terrainDeposits ?? {}),
        [key]: { type: "sacred_spring" as const, currentYield: 9999, maxYield: 9999, regenPerDay: 0.15 }
      }
    }
  };
}

describe("Oracle logistics", () => {
  it("queues and delivers precinct resources to needy buildings", () => {
    let state = createInitialState();
    const roadTiles = Array.from({ length: 10 }, (_, i) => ({ x: 28 + i, y: 50 }));
    for (const tile of roadTiles) {
      state = reduceCommand(state, { type: "PlaceRoadCommand", tile }).state;
    }

    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "storehouse", tile: { x: 28, y: 48 } }).state;
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "inner_sanctum", tile: { x: 30, y: 48 } }).state;
    // Inject deposit so castalian_spring placement passes proximity check
    state = injectSacredSpringDeposit(state, 32, 47);
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "castalian_spring", tile: { x: 32, y: 48 } }).state;
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "eternal_flame_brazier", tile: { x: 34, y: 49 } }).state;

    const brazier = state.buildings.find((b) => b.defId === "eternal_flame_brazier");
    const sanctum = state.buildings.find((b) => b.defId === "inner_sanctum");
    expect(brazier).toBeDefined();
    expect(sanctum).toBeDefined();

    state = {
      ...state,
      buildings: state.buildings.map((b) => {
        if (b.defId === "eternal_flame_brazier") return { ...b, storedResources: { ...b.storedResources, olive_oil: 0 } };
        if (b.defId === "inner_sanctum") return { ...b, storedResources: { ...b.storedResources, incense: 0, sacred_water: 0 } };
        return b;
      })
    };

    const nextState = runSimulationTick(state, 600).state;
    expect(nextState.buildings.find((b) => b.defId === "eternal_flame_brazier")?.storedResources.olive_oil ?? 0).toBeGreaterThan(0);
    expect(nextState.buildings.find((b) => b.defId === "inner_sanctum")?.storedResources.incense ?? 0).toBeGreaterThan(0);
    expect(nextState.buildings.find((b) => b.defId === "inner_sanctum")?.storedResources.sacred_water ?? 0).toBeGreaterThan(0);
    expect(nextState.walkers.find((w) => w.role === "carrier")?.assignedJobId).toBeUndefined();
  });

  it("balances stock between storehouses before precinct shortages become critical", () => {
    let state = createInitialState();
    const roadTiles = Array.from({ length: 10 }, (_, i) => ({ x: 27 + i, y: 50 }));
    for (const tile of roadTiles) {
      state = reduceCommand(state, { type: "PlaceRoadCommand", tile }).state;
    }

    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "storehouse", tile: { x: 27, y: 48 } }).state;
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "storehouse", tile: { x: 32, y: 48 } }).state;

    const [west, east] = state.buildings.filter((b) => b.defId === "storehouse");
    state = {
      ...state,
      buildings: state.buildings.map((b) => {
        if (b.id === west?.id) return { ...b, storedResources: { olive_oil: 12, incense: 8, grain: 16 } };
        if (b.id === east?.id) return { ...b, storedResources: { olive_oil: 0, incense: 0, grain: 0 } };
        return b;
      })
    };

    const nextState = runSimulationTick(state, 1).state;
    const jobs = nextState.resourceJobs.filter((j) => j.sourceBuildingId === west?.id && j.targetBuildingId === east?.id);
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.some((j) => j.resourceId === "olive_oil")).toBe(true);
  });

  it("chooses the nearest stocked storehouse when feeding sacred buildings", () => {
    let state = createInitialState();
    const roadTiles = Array.from({ length: 14 }, (_, i) => ({ x: 26 + i, y: 50 }));
    for (const tile of roadTiles) {
      state = reduceCommand(state, { type: "PlaceRoadCommand", tile }).state;
    }

    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "storehouse", tile: { x: 26, y: 48 } }).state;
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "storehouse", tile: { x: 32, y: 48 } }).state;
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "inner_sanctum", tile: { x: 34, y: 48 } }).state;
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "eternal_flame_brazier", tile: { x: 36, y: 49 } }).state;

    const [west, east] = state.buildings.filter((b) => b.defId === "storehouse");
    const sanctum = state.buildings.find((b) => b.defId === "inner_sanctum");
    const brazier = state.buildings.find((b) => b.defId === "eternal_flame_brazier");
    state = {
      ...state,
      buildings: state.buildings.map((b) => {
        if (b.id === west?.id) return { ...b, storedResources: { olive_oil: 8, incense: 8, grain: 10 } };
        if (b.id === east?.id) return { ...b, storedResources: { olive_oil: 5, incense: 5, grain: 10 } };
        if (b.id === sanctum?.id) return { ...b, storedResources: { incense: 0, sacred_water: 0 } };
        if (b.id === brazier?.id) return { ...b, storedResources: { olive_oil: 0 } };
        return b;
      })
    };

    const nextState = runSimulationTick(state, 1).state;
    const sanctumJob = nextState.resourceJobs.find((j) => j.targetBuildingId === sanctum?.id && j.resourceId === "incense");
    const brazierJob = nextState.resourceJobs.find((j) => j.targetBuildingId === brazier?.id && j.resourceId === "olive_oil");
    expect(sanctumJob?.sourceBuildingId).toBe(east?.id);
    expect(brazierJob?.sourceBuildingId).toBe(east?.id);
  });

  it("queues supply jobs for the new grain, altar, and olive chains", () => {
    let state = createInitialState();
    state = {
      ...state,
      resources: {
        ...state.resources,
        gold: {
          ...state.resources.gold,
          amount: 999
        }
      }
    };
    const roadTiles = Array.from({ length: 16 }, (_, i) => ({ x: 26 + i, y: 50 }));
    for (const tile of roadTiles) {
      state = reduceCommand(state, { type: "PlaceRoadCommand", tile }).state;
    }

    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "storehouse", tile: { x: 26, y: 48 } }).state;
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "granary", tile: { x: 28, y: 48 } }).state;
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "kitchen", tile: { x: 30, y: 48 } }).state;
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "animal_pen", tile: { x: 32, y: 48 } }).state;
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "sacrificial_altar", tile: { x: 34, y: 48 } }).state;
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "olive_press", tile: { x: 36, y: 48 } }).state;
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "incense_store", tile: { x: 38, y: 48 } }).state;

    const storehouse = state.buildings.find((b) => b.defId === "storehouse");
    const kitchen = state.buildings.find((b) => b.defId === "kitchen");
    const animalPen = state.buildings.find((b) => b.defId === "animal_pen");
    const altar = state.buildings.find((b) => b.defId === "sacrificial_altar");
    const olivePress = state.buildings.find((b) => b.defId === "olive_press");
    const incenseStore = state.buildings.find((b) => b.defId === "incense_store");

    state = {
      ...state,
      buildings: state.buildings.map((b) => {
        if (b.id === storehouse?.id) return { ...b, storedResources: { grain: 20, incense: 10, olives: 8, papyrus: 4, olive_oil: 4 } };
        if (b.id === kitchen?.id) return { ...b, storedResources: { grain: 0, bread: 0 } };
        if (b.id === animalPen?.id) return { ...b, storedResources: { grain: 0, sacred_animals: 1 } };
        if (b.id === altar?.id) return { ...b, assignedPriestIds: ["priest-1"], storedResources: { sacred_animals: 0, incense: 0 } };
        if (b.id === olivePress?.id) return { ...b, storedResources: { olives: 0, olive_oil: 0 } };
        if (b.id === incenseStore?.id) return { ...b, storedResources: { incense: 0, papyrus: 0 } };
        return b;
      })
    };

    const nextState = runSimulationTick(state, 1).state;
    expect(nextState.resourceJobs.some((j) => j.targetBuildingId === kitchen?.id && j.resourceId === "grain")).toBe(true);
    expect(nextState.resourceJobs.some((j) => j.targetBuildingId === olivePress?.id && j.resourceId === "olives")).toBe(true);
    expect(nextState.resourceJobs.some((j) => j.targetBuildingId === altar?.id && j.resourceId === "sacred_animals")).toBe(true);
    expect(nextState.resourceJobs.some((j) => j.targetBuildingId === incenseStore?.id && j.resourceId === "incense")).toBe(true);
  });

  it("processes kitchen, animal pen, olive press, and altar recipes once supplied", () => {
    let state = createInitialState();
    const roadTiles = Array.from({ length: 10 }, (_, i) => ({ x: 28 + i, y: 50 }));
    for (const tile of roadTiles) {
      state = reduceCommand(state, { type: "PlaceRoadCommand", tile }).state;
    }

    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "kitchen", tile: { x: 28, y: 48 } }).state;
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "animal_pen", tile: { x: 30, y: 48 } }).state;
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "olive_press", tile: { x: 32, y: 48 } }).state;
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "sacrificial_altar", tile: { x: 34, y: 48 } }).state;

    const kitchen = state.buildings.find((b) => b.defId === "kitchen");
    const animalPen = state.buildings.find((b) => b.defId === "animal_pen");
    const olivePress = state.buildings.find((b) => b.defId === "olive_press");
    const altar = state.buildings.find((b) => b.defId === "sacrificial_altar");

    state = {
      ...state,
      buildings: state.buildings.map((b) => {
        if (b.id === kitchen?.id) return { ...b, assignedWorkerIds: ["worker-kitchen"], storedResources: { grain: 6, bread: 0 } };
        if (b.id === animalPen?.id) return { ...b, assignedWorkerIds: ["worker-pen"], storedResources: { grain: 5, sacred_animals: 0 } };
        if (b.id === olivePress?.id) return { ...b, storedResources: { olives: 5, olive_oil: 0 } };
        if (b.id === altar?.id) return { ...b, assignedPriestIds: ["priest-1"], storedResources: { sacred_animals: 1.2, incense: 1.6 } };
        return b;
      }),
      walkers: [
        ...state.walkers,
        {
          id: "worker-kitchen", role: "custodian" as const, name: "Kitchen Worker",
          tile: { x: 28, y: 48 }, state: "idle" as const, path: [] as { x: number; y: number }[],
          moveCooldown: 0, assignmentBuildingId: kitchen?.id
        },
        {
          id: "worker-pen", role: "custodian" as const, name: "Pen Worker",
          tile: { x: 30, y: 48 }, state: "idle" as const, path: [] as { x: number; y: number }[],
          moveCooldown: 0, assignmentBuildingId: animalPen?.id
        }
      ]
    };

    const nextState = runSimulationTick(state, 1800).state;
    expect(nextState.buildings.find((b) => b.id === kitchen?.id)?.storedResources.bread ?? 0).toBeGreaterThan(0);
    expect(nextState.buildings.find((b) => b.id === animalPen?.id)?.storedResources.sacred_animals ?? 0).toBeGreaterThan(0);
    expect(nextState.buildings.find((b) => b.id === olivePress?.id)?.storedResources.olive_oil ?? 0).toBeGreaterThan(0);
    expect(nextState.buildings.find((b) => b.id === altar?.id)?.storedResources.sacred_animals ?? 100).toBeLessThan(1.2);
    // Allow tiny float drift from degradation tick
    expect(nextState.buildings.find((b) => b.id === altar?.id)?.condition ?? 0).toBeGreaterThanOrEqual((altar?.condition ?? 0) - 0.01);
  });

  it("adds extra carriers and keeps critical sacred jobs ahead of routine rebalancing", () => {
    let state = createInitialState();
    const roadTiles = Array.from({ length: 14 }, (_, i) => ({ x: 26 + i, y: 50 }));
    for (const tile of roadTiles) {
      state = reduceCommand(state, { type: "PlaceRoadCommand", tile }).state;
    }

    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "storehouse", tile: { x: 26, y: 48 } }).state;
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "storehouse", tile: { x: 32, y: 48 } }).state;
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "inner_sanctum", tile: { x: 34, y: 48 } }).state;
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "eternal_flame_brazier", tile: { x: 36, y: 49 } }).state;

    const [west, east] = state.buildings.filter((b) => b.defId === "storehouse");
    const sanctum = state.buildings.find((b) => b.defId === "inner_sanctum");
    const brazier = state.buildings.find((b) => b.defId === "eternal_flame_brazier");
    // East storehouse has actual stock for sacred supply (oil=5, incense=4) but is
    // understocked vs buffer targets (oil<6, grain<10), so routine rebalancing still triggers.
    // Critical sacred jobs source from east (closer to brazier/sanctum) and succeed because
    // carriers can pick up real resources — not just projected amounts from pending transfers.
    state = {
      ...state,
      buildings: state.buildings.map((b) => {
        if (b.id === west?.id) return { ...b, storedResources: { olive_oil: 20, incense: 16, grain: 24 } };
        if (b.id === east?.id) return { ...b, storedResources: { olive_oil: 5, incense: 4, grain: 2 } };
        if (b.id === sanctum?.id) return { ...b, storedResources: { incense: 0, sacred_water: 0 } };
        if (b.id === brazier?.id) return { ...b, storedResources: { olive_oil: 0 } };
        return b;
      })
    };

    const nextState = runSimulationTick(state, 1).state;
    const carriers = nextState.walkers.filter((w) => w.role === "carrier");
    const assignedJobs = nextState.resourceJobs.filter((j) => j.assignedWalkerId);
    expect(carriers.length).toBeGreaterThan(1);
    expect(assignedJobs.length).toBeGreaterThan(0);
    expect(assignedJobs.every((j) => j.priority !== "routine")).toBe(true);
    expect(nextState.resourceJobs.some((j) => j.priority === "routine" && !j.assignedWalkerId)).toBe(true);
  });

  it("prefers fresher carriers with enough range for critical long-haul jobs", () => {
    let state = createInitialState();
    const roadTiles = Array.from({ length: 10 }, (_, i) => ({ x: 28 + i, y: 50 }));
    for (const tile of roadTiles) {
      state = reduceCommand(state, { type: "PlaceRoadCommand", tile }).state;
    }

    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "storehouse", tile: { x: 28, y: 48 } }).state;
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "eternal_flame_brazier", tile: { x: 34, y: 49 } }).state;

    const storehouse = state.buildings.find((b) => b.defId === "storehouse");
    const brazier = state.buildings.find((b) => b.defId === "eternal_flame_brazier");

    state = {
      ...state,
      buildings: state.buildings.map((b) => {
        if (b.id === storehouse?.id) return { ...b, storedResources: { olive_oil: 8, incense: 2, grain: 6 } };
        if (b.id === brazier?.id) return { ...b, storedResources: { olive_oil: 0 } };
        return b;
      }),
      walkers: [
        ...state.walkers.filter((w) => w.role !== "carrier"),
        {
          id: "walker-carrier-weary",
          role: "carrier" as const,
          name: "Weary Carrier",
          tile: { x: 28, y: 50 },
          state: "idle" as const,
          path: [],
          moveCooldown: 0,
          fatigue: 84,
          haulingSkill: 40,
          supplyRadius: 3
        },
        {
          id: "walker-carrier-fresh",
          role: "carrier" as const,
          name: "Fresh Carrier",
          tile: { x: 31, y: 50 },
          state: "idle" as const,
          path: [],
          moveCooldown: 0,
          fatigue: 12,
          haulingSkill: 74,
          supplyRadius: 10
        }
      ]
    };

    const nextState = runSimulationTick(state, 1).state;
    const brazierJob = nextState.resourceJobs.find((j) => j.targetBuildingId === brazier?.id && j.resourceId === "olive_oil");
    const freshCarrier = nextState.walkers.find((w) => w.id === "walker-carrier-fresh");
    expect(brazierJob?.assignedWalkerId).toBe("walker-carrier-fresh");
    expect(freshCarrier?.fatigue ?? 0).toBeGreaterThan(12);
  });

  it("lets idle carriers recover fatigue between haul waves", () => {
    const base = createInitialState();
    const state = {
      ...base,
      walkers: base.walkers.map((w) =>
        w.role === "carrier" ? { ...w, fatigue: 46 } : w
      )
    };

    const nextState = runSimulationTick(state, 30).state;
    const carrier = nextState.walkers.find((w) => w.role === "carrier");
    expect(carrier?.fatigue ?? 100).toBeLessThan(46);
  });
});
