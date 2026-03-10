import { describe, expect, it } from "vitest";

import { createInitialState } from "../src/state/initialState";
import { reduceCommand } from "../src/reducers";
import {
  generateTerrainDeposits,
  hasDepositInRange,
  findNearestDeposit,
  depleteDeposit
} from "../src/terrain/deposits";
import { generateTileTerrain } from "../src/terrain/generate";
import type { TerrainDeposit } from "../src/state/gameState";

function makeDeposits(seed: number, width = 60, height = 60) {
  return generateTerrainDeposits(seed, width, height, (x, y) =>
    generateTileTerrain(seed, x, y, width, height)
  );
}

describe("Terrain Deposits", () => {
  it("generates expected deposit types for known seeds", () => {
    const deposits = makeDeposits(7);
    const types = new Set(Object.values(deposits).map((d) => d.type));

    // At minimum, forest and limestone exist in every generated map
    expect(types.has("timber")).toBe(true);
    expect(types.has("stone")).toBe(true);

    // Verify deposit properties
    const firstTimber = Object.values(deposits).find((d) => d.type === "timber")!;
    expect(firstTimber.maxYield).toBe(80);
    expect(firstTimber.regenPerDay).toBe(0.4);
    expect(firstTimber.currentYield).toBe(firstTimber.maxYield);

    const firstStone = Object.values(deposits).find((d) => d.type === "stone")!;
    expect(firstStone.maxYield).toBe(400);
    expect(firstStone.regenPerDay).toBe(0);
    expect(firstStone.currentYield).toBe(firstStone.maxYield);
  });

  it("generates deposits deterministically for the same seed", () => {
    const depositsA = makeDeposits(42);
    const depositsB = makeDeposits(42);
    expect(Object.keys(depositsA).length).toBe(Object.keys(depositsB).length);
    expect(depositsA).toEqual(depositsB);
  });

  it("generates different deposits for different seeds", () => {
    const depositsA = makeDeposits(42);
    const depositsB = makeDeposits(999);
    // The exact deposit counts should differ between seeds
    const keysA = Object.keys(depositsA).sort();
    const keysB = Object.keys(depositsB).sort();
    // Not every seed produces the same layout
    expect(keysA).not.toEqual(keysB);
  });
});

describe("hasDepositInRange", () => {
  const deposits: Record<string, TerrainDeposit> = {
    "10,10": { type: "timber", currentYield: 80, maxYield: 80, regenPerDay: 0.4 },
    "15,10": { type: "stone", currentYield: 400, maxYield: 400, regenPerDay: 0 }
  };

  it("returns true when deposit exists within distance", () => {
    expect(hasDepositInRange(deposits, { x: 11, y: 10 }, "timber", 3)).toBe(true);
    expect(hasDepositInRange(deposits, { x: 10, y: 12 }, "timber", 3)).toBe(true);
    expect(hasDepositInRange(deposits, { x: 13, y: 10 }, "timber", 3)).toBe(true);
  });

  it("returns false when no deposit in range", () => {
    expect(hasDepositInRange(deposits, { x: 20, y: 20 }, "timber", 3)).toBe(false);
    // Stone at 15,10 — distance from 10,10 is 5, exceeds maxDistance 3
    expect(hasDepositInRange(deposits, { x: 10, y: 10 }, "stone", 3)).toBe(false);
  });

  it("returns false when wrong deposit type is in range", () => {
    expect(hasDepositInRange(deposits, { x: 10, y: 10 }, "fertile_soil", 3)).toBe(false);
  });
});

describe("findNearestDeposit", () => {
  it("finds closest matching deposit", () => {
    const state = createInitialState();
    const deposits: Record<string, TerrainDeposit> = {
      "10,10": { type: "timber", currentYield: 80, maxYield: 80, regenPerDay: 0.4 },
      "12,10": { type: "timber", currentYield: 80, maxYield: 80, regenPerDay: 0.4 },
      "20,10": { type: "timber", currentYield: 80, maxYield: 80, regenPerDay: 0.4 }
    };
    const testState = {
      ...state,
      grid: { ...state.grid, terrainDeposits: deposits }
    };

    const nearest = findNearestDeposit(testState, { x: 11, y: 10 }, "timber", 5);
    expect(nearest).toEqual({ x: 10, y: 10 });
  });

  it("returns null when no deposit in range", () => {
    const state = createInitialState();
    const deposits: Record<string, TerrainDeposit> = {
      "50,50": { type: "timber", currentYield: 80, maxYield: 80, regenPerDay: 0.4 }
    };
    const testState = {
      ...state,
      grid: { ...state.grid, terrainDeposits: deposits }
    };

    const nearest = findNearestDeposit(testState, { x: 10, y: 10 }, "timber", 5);
    expect(nearest).toBeNull();
  });

  it("skips depleted deposits", () => {
    const state = createInitialState();
    const deposits: Record<string, TerrainDeposit> = {
      "10,10": { type: "timber", currentYield: 0, maxYield: 80, regenPerDay: 0.4 },
      "14,10": { type: "timber", currentYield: 50, maxYield: 80, regenPerDay: 0.4 }
    };
    const testState = {
      ...state,
      grid: { ...state.grid, terrainDeposits: deposits }
    };

    const nearest = findNearestDeposit(testState, { x: 11, y: 10 }, "timber", 5);
    expect(nearest).toEqual({ x: 14, y: 10 });
  });
});

describe("depleteDeposit", () => {
  it("reduces currentYield", () => {
    const state = createInitialState();
    const deposits: Record<string, TerrainDeposit> = {
      "10,10": { type: "timber", currentYield: 80, maxYield: 80, regenPerDay: 0.4 }
    };
    const testState = {
      ...state,
      grid: { ...state.grid, terrainDeposits: deposits }
    };

    const depleted = depleteDeposit(testState, { x: 10, y: 10 }, 30);
    expect(depleted.grid.terrainDeposits!["10,10"].currentYield).toBe(50);
  });

  it("clamps yield to zero and records depleted day", () => {
    const state = createInitialState();
    const deposits: Record<string, TerrainDeposit> = {
      "10,10": { type: "timber", currentYield: 10, maxYield: 80, regenPerDay: 0.4 }
    };
    const testState = {
      ...state,
      grid: { ...state.grid, terrainDeposits: deposits }
    };

    const depleted = depleteDeposit(testState, { x: 10, y: 10 }, 20);
    expect(depleted.grid.terrainDeposits!["10,10"].currentYield).toBe(0);
    expect(depleted.grid.terrainDeposits!["10,10"].depletedDay).toBe(testState.clock.day);
  });

  it("returns state unchanged when no deposit at tile", () => {
    const state = createInitialState();
    const depleted = depleteDeposit(state, { x: 99, y: 99 }, 10);
    expect(depleted).toBe(state);
  });
});

describe("Building placement with deposit validation", () => {
  it("rejects hylotomos_camp when no timber deposit in range", () => {
    let state = createInitialState();
    // Clear all deposits
    state = { ...state, grid: { ...state.grid, terrainDeposits: {} } };
    // Place road row and attempt building adjacent to it (use same tile pattern as reducer.test.ts)
    state = reduceCommand(state, { type: "PlaceRoadCommand", tile: { x: 30, y: 50 } }).state;
    state = reduceCommand(state, { type: "PlaceRoadCommand", tile: { x: 31, y: 50 } }).state;
    // Storehouse is 2x2, placed at (30,48) — occupies (30,48),(31,48),(30,49),(31,49)
    // (30,49) is adjacent to road at (30,50) — placement should succeed
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "storehouse", tile: { x: 30, y: 48 } }).state;
    // Now try hylotomos_camp (1x1) at (32,49) — adjacent to (31,50) if we add that road
    state = reduceCommand(state, { type: "PlaceRoadCommand", tile: { x: 32, y: 50 } }).state;
    state = reduceCommand(state, { type: "PlaceRoadCommand", tile: { x: 33, y: 50 } }).state;
    // Place the camp at (33,49) — 1x1, adjacent to road at (33,50)
    const result = reduceCommand(state, {
      type: "PlaceBuildingCommand",
      defId: "hylotomos_camp",
      tile: { x: 33, y: 49 }
    });
    // Should be rejected because no timber deposit in range
    expect(result.state.buildings.filter((b) => b.defId === "hylotomos_camp")).toHaveLength(0);
  });

  it("accepts hylotomos_camp when timber deposit is in range", () => {
    let state = createInitialState();
    // Place a timber deposit near the build site
    state = {
      ...state,
      grid: {
        ...state.grid,
        terrainDeposits: {
          ...(state.grid.terrainDeposits ?? {}),
          "33,48": { type: "timber", currentYield: 80, maxYield: 80, regenPerDay: 0.4 }
        }
      }
    };
    state = reduceCommand(state, { type: "PlaceRoadCommand", tile: { x: 30, y: 50 } }).state;
    state = reduceCommand(state, { type: "PlaceRoadCommand", tile: { x: 31, y: 50 } }).state;
    state = reduceCommand(state, { type: "PlaceRoadCommand", tile: { x: 32, y: 50 } }).state;
    state = reduceCommand(state, { type: "PlaceRoadCommand", tile: { x: 33, y: 50 } }).state;
    const result = reduceCommand(state, {
      type: "PlaceBuildingCommand",
      defId: "hylotomos_camp",
      tile: { x: 33, y: 49 }
    });
    expect(result.state.buildings.filter((b) => b.defId === "hylotomos_camp")).toHaveLength(1);
  });

  it("rejects grain_field when no fertile_soil deposit in range", () => {
    let state = createInitialState();
    state = { ...state, grid: { ...state.grid, terrainDeposits: {} } };
    state = reduceCommand(state, { type: "PlaceRoadCommand", tile: { x: 30, y: 50 } }).state;
    state = reduceCommand(state, { type: "PlaceRoadCommand", tile: { x: 31, y: 50 } }).state;
    state = reduceCommand(state, { type: "PlaceRoadCommand", tile: { x: 32, y: 50 } }).state;
    state = reduceCommand(state, { type: "PlaceRoadCommand", tile: { x: 33, y: 50 } }).state;
    const result = reduceCommand(state, {
      type: "PlaceBuildingCommand",
      defId: "grain_field",
      tile: { x: 33, y: 49 }
    });
    expect(result.state.buildings.filter((b) => b.defId === "grain_field")).toHaveLength(0);
  });

  it("allows buildings without requiredNearbyTerrain regardless of deposits", () => {
    let state = createInitialState();
    state = { ...state, grid: { ...state.grid, terrainDeposits: {} } };
    // Storehouse is 2x2, use the proven pattern from reducer.test.ts
    state = reduceCommand(state, { type: "PlaceRoadCommand", tile: { x: 30, y: 50 } }).state;
    const result = reduceCommand(state, {
      type: "PlaceBuildingCommand",
      defId: "storehouse",
      tile: { x: 30, y: 48 }
    });
    expect(result.state.buildings.filter((b) => b.defId === "storehouse")).toHaveLength(1);
  });
});
