import { describe, expect, it } from "vitest";

import { createInitialState } from "../src/state/initialState";
import { regenerateDeposits } from "../src/terrain/deposits";
import type { GameState, Season, TerrainDeposit } from "../src/state/gameState";

/** Helper to create a minimal state with custom deposits, season, and day. */
function makeState(
  deposits: Record<string, TerrainDeposit>,
  overrides: { day?: number; season?: Season; buildings?: GameState["buildings"] } = {}
): GameState {
  const base = createInitialState();
  return {
    ...base,
    clock: {
      ...base.clock,
      day: overrides.day ?? 100,
      season: overrides.season ?? "Spring"
    },
    grid: {
      ...base.grid,
      terrainDeposits: deposits
    },
    buildings: overrides.buildings ?? []
  };
}

// ── Timber ──

describe("Timber deposit regeneration", () => {
  it("regenerates 0.1/day passively when yield > 0", () => {
    const state = makeState({
      "10,10": { type: "timber", currentYield: 50, maxYield: 80, regenPerDay: 0.4 }
    });

    const result = regenerateDeposits(state);
    expect(result.state.grid.terrainDeposits!["10,10"].currentYield).toBeCloseTo(50.1);
  });

  it("sets depletedDay when fully depleted and starts at stage 0", () => {
    const state = makeState(
      {
        "10,10": { type: "timber", currentYield: 0, maxYield: 80, regenPerDay: 0.4 }
      },
      { day: 50 }
    );

    const result = regenerateDeposits(state);
    const deposit = result.state.grid.terrainDeposits!["10,10"];
    expect(deposit.depletedDay).toBe(50);
    expect(deposit.regrowthStage).toBe(0);
    expect(deposit.currentYield).toBe(0);
  });

  it("advances regrowth stage at day 30 threshold", () => {
    const state = makeState(
      {
        "10,10": {
          type: "timber",
          currentYield: 0,
          maxYield: 80,
          regenPerDay: 0.4,
          depletedDay: 10,
          regrowthStage: 0
        }
      },
      { day: 40 } // 30 days since depletion
    );

    const result = regenerateDeposits(state);
    expect(result.state.grid.terrainDeposits!["10,10"].regrowthStage).toBe(1);
    expect(result.state.grid.terrainDeposits!["10,10"].currentYield).toBe(0);
  });

  it("advances regrowth stage at day 60 threshold", () => {
    const state = makeState(
      {
        "10,10": {
          type: "timber",
          currentYield: 0,
          maxYield: 80,
          regenPerDay: 0.4,
          depletedDay: 10,
          regrowthStage: 1
        }
      },
      { day: 70 } // 60 days since depletion
    );

    const result = regenerateDeposits(state);
    expect(result.state.grid.terrainDeposits!["10,10"].regrowthStage).toBe(2);
  });

  it("advances regrowth stage at day 90 threshold", () => {
    const state = makeState(
      {
        "10,10": {
          type: "timber",
          currentYield: 0,
          maxYield: 80,
          regenPerDay: 0.4,
          depletedDay: 10,
          regrowthStage: 2
        }
      },
      { day: 100 } // 90 days since depletion
    );

    const result = regenerateDeposits(state);
    expect(result.state.grid.terrainDeposits!["10,10"].regrowthStage).toBe(3);
    // Not yet at 120 days, so yield still 0
    expect(result.state.grid.terrainDeposits!["10,10"].currentYield).toBe(0);
  });

  it("starts yield regeneration at 0.4/day after day 120 (stage 3)", () => {
    const state = makeState(
      {
        "10,10": {
          type: "timber",
          currentYield: 0,
          maxYield: 80,
          regenPerDay: 0.4,
          depletedDay: 10,
          regrowthStage: 3
        }
      },
      { day: 130 } // 120 days since depletion
    );

    const result = regenerateDeposits(state);
    expect(result.state.grid.terrainDeposits!["10,10"].regrowthStage).toBe(3);
    expect(result.state.grid.terrainDeposits!["10,10"].currentYield).toBeCloseTo(0.4);
  });

  it("does not exceed maxYield during passive regen", () => {
    const state = makeState({
      "10,10": { type: "timber", currentYield: 79.95, maxYield: 80, regenPerDay: 0.4 }
    });

    const result = regenerateDeposits(state);
    expect(result.state.grid.terrainDeposits!["10,10"].currentYield).toBe(80);
  });

  it("does not exceed maxYield during post-regrowth regen", () => {
    // When yield is still 0 and full regrowth period passed, regen is 0.4/day
    const state = makeState(
      {
        "10,10": {
          type: "timber",
          currentYield: 0,
          maxYield: 80,
          regenPerDay: 0.4,
          depletedDay: 10,
          regrowthStage: 3
        }
      },
      { day: 131 } // 121 days since depletion, well past 120
    );

    const result = regenerateDeposits(state);
    // Should add 0.4, capped at maxYield
    expect(result.state.grid.terrainDeposits!["10,10"].currentYield).toBeCloseTo(0.4);

    // Now test the cap: once yield > 0, passive regen takes over (0.1/day)
    const state2 = makeState(
      {
        "10,10": {
          type: "timber",
          currentYield: 79.95,
          maxYield: 80,
          regenPerDay: 0.4
        }
      }
    );
    const result2 = regenerateDeposits(state2);
    expect(result2.state.grid.terrainDeposits!["10,10"].currentYield).toBe(80);
  });
});

// ── Stone ──

describe("Stone deposit regeneration", () => {
  it("stays at 0 forever — no regeneration", () => {
    const state = makeState(
      {
        "10,10": {
          type: "stone",
          currentYield: 0,
          maxYield: 400,
          regenPerDay: 0,
          depletedDay: 50
        }
      },
      { day: 200 }
    );

    const result = regenerateDeposits(state);
    expect(result.state.grid.terrainDeposits!["10,10"].currentYield).toBe(0);
  });

  it("emits DepositDepleted event when first depleted (no depletedDay)", () => {
    const state = makeState(
      {
        "10,10": { type: "stone", currentYield: 0, maxYield: 400, regenPerDay: 0 }
      },
      { day: 75 }
    );

    const result = regenerateDeposits(state);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({
      type: "DepositDepleted",
      tileKey: "10,10",
      depositType: "stone"
    });
    expect(result.state.grid.terrainDeposits!["10,10"].depletedDay).toBe(75);
  });

  it("does not emit DepositDepleted event repeatedly", () => {
    const state = makeState({
      "10,10": {
        type: "stone",
        currentYield: 0,
        maxYield: 400,
        regenPerDay: 0,
        depletedDay: 50
      }
    });

    const result = regenerateDeposits(state);
    expect(result.events).toHaveLength(0);
  });
});

// ── Fertile Soil ──

describe("Fertile soil regeneration", () => {
  it("recovers at 2.0/day in winter", () => {
    const state = makeState(
      {
        "10,10": { type: "fertile_soil", currentYield: 100, maxYield: 999, regenPerDay: 0.2 }
      },
      { season: "Winter" }
    );

    const result = regenerateDeposits(state);
    // Fallow (no buildings) so 2x rate: 2.0 * 2 = 4.0
    expect(result.state.grid.terrainDeposits!["10,10"].currentYield).toBeCloseTo(104);
  });

  it("recovers at 2.0/day in spring", () => {
    const state = makeState(
      {
        "10,10": { type: "fertile_soil", currentYield: 100, maxYield: 999, regenPerDay: 0.2 }
      },
      { season: "Spring" }
    );

    const result = regenerateDeposits(state);
    // Fallow: 2.0 * 2 = 4.0
    expect(result.state.grid.terrainDeposits!["10,10"].currentYield).toBeCloseTo(104);
  });

  it("recovers at 0.5/day in summer", () => {
    const state = makeState(
      {
        "10,10": { type: "fertile_soil", currentYield: 100, maxYield: 999, regenPerDay: 0.2 }
      },
      { season: "Summer" }
    );

    const result = regenerateDeposits(state);
    // Fallow: 0.5 * 2 = 1.0
    expect(result.state.grid.terrainDeposits!["10,10"].currentYield).toBeCloseTo(101);
  });

  it("recovers at 1.0/day in autumn", () => {
    const state = makeState(
      {
        "10,10": { type: "fertile_soil", currentYield: 100, maxYield: 999, regenPerDay: 0.2 }
      },
      { season: "Autumn" }
    );

    const result = regenerateDeposits(state);
    // Fallow: 1.0 * 2 = 2.0
    expect(result.state.grid.terrainDeposits!["10,10"].currentYield).toBeCloseTo(102);
  });

  it("fallow fields (no active building) recover at 2x rate", () => {
    // No buildings at all = fallow
    const state = makeState(
      {
        "10,10": { type: "fertile_soil", currentYield: 100, maxYield: 999, regenPerDay: 0.2 }
      },
      { season: "Summer", buildings: [] }
    );

    const result = regenerateDeposits(state);
    // Summer base: 0.5, fallow 2x: 1.0
    expect(result.state.grid.terrainDeposits!["10,10"].currentYield).toBeCloseTo(101);
  });

  it("active building (workers assigned, within range) uses base rate (not 2x)", () => {
    const base = createInitialState();
    const state: GameState = {
      ...base,
      clock: { ...base.clock, day: 100, season: "Summer" },
      grid: {
        ...base.grid,
        terrainDeposits: {
          "10,10": { type: "fertile_soil", currentYield: 100, maxYield: 999, regenPerDay: 0.2 }
        }
      },
      buildings: [
        {
          id: "farm-1",
          defId: "grain_field",
          position: { x: 10, y: 10 },
          condition: 100,
          maxCondition: 100,
          requiresPriest: false,
          assignedPriestIds: [],
          assignedWorkerIds: ["worker-1"], // active workers
          storedResources: {},
          connectedToRoad: true
        }
      ]
    };

    const result = regenerateDeposits(state);
    // Summer base: 0.5, NOT fallow: 0.5
    expect(result.state.grid.terrainDeposits!["10,10"].currentYield).toBeCloseTo(100.5);
  });

  it("building with no workers is treated as fallow", () => {
    const base = createInitialState();
    const state: GameState = {
      ...base,
      clock: { ...base.clock, day: 100, season: "Summer" },
      grid: {
        ...base.grid,
        terrainDeposits: {
          "10,10": { type: "fertile_soil", currentYield: 100, maxYield: 999, regenPerDay: 0.2 }
        }
      },
      buildings: [
        {
          id: "farm-1",
          defId: "grain_field",
          position: { x: 10, y: 10 },
          condition: 100,
          maxCondition: 100,
          requiresPriest: false,
          assignedPriestIds: [],
          assignedWorkerIds: [], // no workers
          storedResources: {},
          connectedToRoad: true
        }
      ]
    };

    const result = regenerateDeposits(state);
    // Summer base: 0.5, fallow 2x: 1.0
    expect(result.state.grid.terrainDeposits!["10,10"].currentYield).toBeCloseTo(101);
  });

  it("does not exceed maxYield", () => {
    const state = makeState(
      {
        "10,10": { type: "fertile_soil", currentYield: 998, maxYield: 999, regenPerDay: 0.2 }
      },
      { season: "Winter" }
    );

    const result = regenerateDeposits(state);
    expect(result.state.grid.terrainDeposits!["10,10"].currentYield).toBe(999);
  });

  it("does not regenerate when already at maxYield", () => {
    const state = makeState(
      {
        "10,10": { type: "fertile_soil", currentYield: 999, maxYield: 999, regenPerDay: 0.2 }
      },
      { season: "Winter" }
    );

    const result = regenerateDeposits(state);
    expect(result.state.grid.terrainDeposits!["10,10"].currentYield).toBe(999);
  });
});

// ── Sacred Spring ──

describe("Sacred spring regeneration", () => {
  it("resets to maxYield each day", () => {
    const state = makeState({
      "10,10": { type: "sacred_spring", currentYield: 500, maxYield: 9999, regenPerDay: 0.15 }
    });

    const result = regenerateDeposits(state);
    expect(result.state.grid.terrainDeposits!["10,10"].currentYield).toBe(9999);
  });

  it("resets from zero to maxYield", () => {
    const state = makeState({
      "10,10": { type: "sacred_spring", currentYield: 0, maxYield: 9999, regenPerDay: 0.15 }
    });

    const result = regenerateDeposits(state);
    expect(result.state.grid.terrainDeposits!["10,10"].currentYield).toBe(9999);
  });
});

// ── General ──

describe("General deposit regeneration", () => {
  it("returns same state reference when no deposits exist", () => {
    const base = createInitialState();
    const state = { ...base, grid: { ...base.grid, terrainDeposits: undefined } };
    const result = regenerateDeposits(state);
    expect(result.state).toBe(state);
  });

  it("returns same state reference when nothing changed", () => {
    // Stone at full yield, fertile_soil at max — nothing to change
    const state = makeState({
      "10,10": { type: "stone", currentYield: 400, maxYield: 400, regenPerDay: 0, depletedDay: undefined },
      "20,20": { type: "fertile_soil", currentYield: 999, maxYield: 999, regenPerDay: 0.2 }
    });

    const result = regenerateDeposits(state);
    // Stone with yield > 0 and fertile at max: no changes
    expect(result.state).toBe(state);
    expect(result.events).toHaveLength(0);
  });

  it("handles multiple deposit types in the same tick", () => {
    const state = makeState(
      {
        "5,5": { type: "timber", currentYield: 50, maxYield: 80, regenPerDay: 0.4 },
        "10,10": { type: "stone", currentYield: 0, maxYield: 400, regenPerDay: 0 },
        "15,15": { type: "fertile_soil", currentYield: 100, maxYield: 999, regenPerDay: 0.2 },
        "20,20": { type: "sacred_spring", currentYield: 100, maxYield: 9999, regenPerDay: 0.15 }
      },
      { season: "Winter", day: 50 }
    );

    const result = regenerateDeposits(state);
    // Timber: passive regen 0.1
    expect(result.state.grid.terrainDeposits!["5,5"].currentYield).toBeCloseTo(50.1);
    // Stone: depleted, event emitted
    expect(result.state.grid.terrainDeposits!["10,10"].currentYield).toBe(0);
    expect(result.state.grid.terrainDeposits!["10,10"].depletedDay).toBe(50);
    // Fertile: winter fallow 2.0 * 2 = 4.0
    expect(result.state.grid.terrainDeposits!["15,15"].currentYield).toBeCloseTo(104);
    // Sacred spring: reset to max
    expect(result.state.grid.terrainDeposits!["20,20"].currentYield).toBe(9999);
    // One event for stone depletion
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe("DepositDepleted");
  });
});
