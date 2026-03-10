import { describe, expect, it } from "vitest";
import { buildingDefs, resourceDefs } from "@the-oracle/content";
import type { ResourceId } from "@the-oracle/content";
import { processSpoilage } from "../src/simulation/spoilage";
import { createInitialState } from "../src/state/initialState";
import type { BuildingInstance, GameState, Season } from "../src/state/gameState";

const TICKS_PER_DAY = 600;

/**
 * Helper: create a minimal game state with specific buildings, season, etc.
 * for focused spoilage testing.
 */
function makeSpoilageState(overrides?: {
  season?: Season;
  buildings?: BuildingInstance[];
}): GameState {
  const base = createInitialState();
  return {
    ...base,
    clock: {
      ...base.clock,
      ticksPerDay: TICKS_PER_DAY,
      season: overrides?.season ?? "Spring"
    },
    buildings: overrides?.buildings ?? base.buildings
  };
}

/** Helper: create a building instance with specific stored resources and condition. */
function makeBuilding(
  defId: BuildingInstance["defId"],
  stored: Partial<Record<ResourceId, number>>,
  opts?: { condition?: number; maxCondition?: number; id?: string }
): BuildingInstance {
  const def = buildingDefs[defId];
  return {
    id: opts?.id ?? `test-${defId}`,
    defId,
    position: { x: 0, y: 0 },
    condition: opts?.condition ?? def.maxCondition,
    maxCondition: opts?.maxCondition ?? def.maxCondition,
    requiresPriest: def.requiresPriest,
    assignedPriestIds: [],
    assignedWorkerIds: [],
    storedResources: stored,
    connectedToRoad: true
  };
}

/**
 * Simulate N ticks of spoilage on a state, returning the final state.
 */
function runSpoilageTicks(state: GameState, ticks: number): GameState {
  let s = state;
  for (let i = 0; i < ticks; i++) {
    s = processSpoilage(s);
  }
  return s;
}

describe("Resource spoilage system (Sprint 5)", () => {
  it("grain decays at ~1%/day in a basic building", () => {
    const initial = 100;
    const building = makeBuilding("kitchen", { grain: initial });
    const state = makeSpoilageState({ buildings: [building] });

    // Run for one full day (600 ticks)
    const after = runSpoilageTicks(state, TICKS_PER_DAY);
    const remaining = after.buildings[0]!.storedResources.grain!;

    // Expected: ~1% decay per day → ~99 remaining
    // Exact: 100 * (1 - 0.01/600)^600 ≈ 99.005
    expect(remaining).toBeGreaterThan(98);
    expect(remaining).toBeLessThan(100);
    // Check approximately 1% lost
    const lost = initial - remaining;
    expect(lost).toBeCloseTo(1.0, 0);
  });

  it("bread decays at ~2%/day in a basic building", () => {
    const initial = 100;
    const building = makeBuilding("kitchen", { bread: initial });
    const state = makeSpoilageState({ buildings: [building] });

    const after = runSpoilageTicks(state, TICKS_PER_DAY);
    const remaining = after.buildings[0]!.storedResources.bread!;

    // ~2% decay per day → ~98 remaining
    const lost = initial - remaining;
    expect(lost).toBeCloseTo(2.0, 0);
  });

  it("olives decay at ~0.8%/day", () => {
    const initial = 100;
    const building = makeBuilding("olive_press", { olives: initial });
    const state = makeSpoilageState({ buildings: [building] });

    const after = runSpoilageTicks(state, TICKS_PER_DAY);
    const remaining = after.buildings[0]!.storedResources.olives!;

    const lost = initial - remaining;
    expect(lost).toBeCloseTo(0.8, 0);
  });

  it("sacred animals decay at ~0.3%/day", () => {
    const initial = 100;
    const building = makeBuilding("animal_pen", { sacred_animals: initial });
    // animal_pen has spoilageReduction 0.30, so effective rate = 0.003 * 0.30 = 0.0009/day
    // For this test, use a building WITHOUT reduction to verify base rate
    const storehouseBuilding = makeBuilding("kitchen", { sacred_animals: initial });
    // kitchen has no storageCaps for sacred_animals in content but that doesn't matter for spoilage logic
    const state = makeSpoilageState({ buildings: [storehouseBuilding] });

    const after = runSpoilageTicks(state, TICKS_PER_DAY);
    const remaining = after.buildings[0]!.storedResources.sacred_animals!;

    const lost = initial - remaining;
    expect(lost).toBeCloseTo(0.3, 0);
  });

  it("granary reduces grain spoilage by 80%", () => {
    const initial = 100;
    const granaryBuilding = makeBuilding("granary", { grain: initial });
    const plainBuilding = makeBuilding("kitchen", { grain: initial });

    const granaryState = makeSpoilageState({ buildings: [granaryBuilding] });
    const plainState = makeSpoilageState({ buildings: [plainBuilding] });

    const afterGranary = runSpoilageTicks(granaryState, TICKS_PER_DAY);
    const afterPlain = runSpoilageTicks(plainState, TICKS_PER_DAY);

    const granaryLoss = initial - afterGranary.buildings[0]!.storedResources.grain!;
    const plainLoss = initial - afterPlain.buildings[0]!.storedResources.grain!;

    // Granary has spoilageReduction { grain: 0.20 }, so loss should be ~20% of plain loss
    const ratio = granaryLoss / plainLoss;
    expect(ratio).toBeCloseTo(0.20, 1);
  });

  it("summer increases spoilage by 1.5x for grain", () => {
    const initial = 100;
    const building = makeBuilding("kitchen", { grain: initial });

    const springState = makeSpoilageState({ season: "Spring", buildings: [building] });
    const summerState = makeSpoilageState({ season: "Summer", buildings: [building] });

    const afterSpring = runSpoilageTicks(springState, TICKS_PER_DAY);
    const afterSummer = runSpoilageTicks(summerState, TICKS_PER_DAY);

    const springLoss = initial - afterSpring.buildings[0]!.storedResources.grain!;
    const summerLoss = initial - afterSummer.buildings[0]!.storedResources.grain!;

    // Summer should be ~1.5x the spring loss
    const ratio = summerLoss / springLoss;
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it("low condition (< 50%) doubles spoilage", () => {
    const initial = 100;
    const goodBuilding = makeBuilding("kitchen", { grain: initial }, { condition: 95, maxCondition: 100 });
    const badBuilding = makeBuilding("kitchen", { grain: initial }, { condition: 30, maxCondition: 100 });

    const goodState = makeSpoilageState({ buildings: [goodBuilding] });
    const badState = makeSpoilageState({ buildings: [badBuilding] });

    const afterGood = runSpoilageTicks(goodState, TICKS_PER_DAY);
    const afterBad = runSpoilageTicks(badState, TICKS_PER_DAY);

    const goodLoss = initial - afterGood.buildings[0]!.storedResources.grain!;
    const badLoss = initial - afterBad.buildings[0]!.storedResources.grain!;

    // Low condition multiplier for grain is 2.0
    const ratio = badLoss / goodLoss;
    expect(ratio).toBeCloseTo(2.0, 1);
  });

  it("non-perishables (gold, stone) do not decay", () => {
    const building = makeBuilding("storehouse", { gold: 100 } as Partial<Record<ResourceId, number>>);
    const state = makeSpoilageState({ buildings: [building] });

    const after = runSpoilageTicks(state, TICKS_PER_DAY);
    // Gold has no spoilage config, so it stays unchanged
    expect(after.buildings[0]!.storedResources.gold).toBe(100);
  });

  it("stone does not decay", () => {
    const building = makeBuilding("lithotomia", { stone: 50 });
    const state = makeSpoilageState({ buildings: [building] });

    const after = runSpoilageTicks(state, TICKS_PER_DAY);
    expect(after.buildings[0]!.storedResources.stone).toBe(50);
  });

  it("sacred_water in castalian_spring barely decays (90% reduction)", () => {
    const initial = 100;
    const springBuilding = makeBuilding("castalian_spring", { sacred_water: initial });
    const plainBuilding = makeBuilding("kitchen", { sacred_water: initial });

    const springState = makeSpoilageState({ buildings: [springBuilding] });
    const plainState = makeSpoilageState({ buildings: [plainBuilding] });

    const afterSpring = runSpoilageTicks(springState, TICKS_PER_DAY);
    const afterPlain = runSpoilageTicks(plainState, TICKS_PER_DAY);

    const springLoss = initial - afterSpring.buildings[0]!.storedResources.sacred_water!;
    const plainLoss = initial - afterPlain.buildings[0]!.storedResources.sacred_water!;

    // castalian_spring has spoilageReduction { sacred_water: 0.10 }, so loss ~10% of plain
    const ratio = springLoss / plainLoss;
    expect(ratio).toBeCloseTo(0.10, 1);
  });

  it("spoilage updates global resources ledger", () => {
    const initial = 100;
    const building = makeBuilding("kitchen", { grain: initial });
    const state = makeSpoilageState({ buildings: [building] });

    // Sync global resources to match building storage for a clean test
    const syncedState: GameState = {
      ...state,
      resources: {
        ...state.resources,
        grain: { ...state.resources.grain, amount: initial }
      }
    };

    const after = runSpoilageTicks(syncedState, TICKS_PER_DAY);
    const buildingLoss = initial - after.buildings[0]!.storedResources.grain!;
    const globalLoss = initial - after.resources.grain.amount;

    // Global ledger should decrease by the same amount as building storage
    expect(globalLoss).toBeCloseTo(buildingLoss, 6);
    expect(globalLoss).toBeGreaterThan(0);
  });

  it("buildings under construction do not spoil resources", () => {
    const building: BuildingInstance = {
      ...makeBuilding("kitchen", { grain: 100 }),
      constructionWork: 10,
      constructionProgress: 3
    };
    const state = makeSpoilageState({ buildings: [building] });

    const after = runSpoilageTicks(state, TICKS_PER_DAY);
    expect(after.buildings[0]!.storedResources.grain).toBe(100);
  });

  it("zero-amount resources are not affected", () => {
    const building = makeBuilding("kitchen", { grain: 0 });
    const state = makeSpoilageState({ buildings: [building] });

    const after = runSpoilageTicks(state, TICKS_PER_DAY);
    expect(after.buildings[0]!.storedResources.grain).toBe(0);
  });

  it("storehouse reduces grain spoilage by 50%", () => {
    const initial = 100;
    const storehouseBuilding = makeBuilding("storehouse", { grain: initial });
    const plainBuilding = makeBuilding("kitchen", { grain: initial });

    const storehouseState = makeSpoilageState({ buildings: [storehouseBuilding] });
    const plainState = makeSpoilageState({ buildings: [plainBuilding] });

    const afterStorehouse = runSpoilageTicks(storehouseState, TICKS_PER_DAY);
    const afterPlain = runSpoilageTicks(plainState, TICKS_PER_DAY);

    const storehouseLoss = initial - afterStorehouse.buildings[0]!.storedResources.grain!;
    const plainLoss = initial - afterPlain.buildings[0]!.storedResources.grain!;

    // Storehouse has spoilageReduction { grain: 0.50 }, so loss should be ~50% of plain loss
    const ratio = storehouseLoss / plainLoss;
    expect(ratio).toBeCloseTo(0.50, 1);
  });

  it("storehouse reduces bread spoilage by 50%", () => {
    const initial = 100;
    const storehouseBuilding = makeBuilding("storehouse", { bread: initial });
    const plainBuilding = makeBuilding("kitchen", { bread: initial });

    const storehouseState = makeSpoilageState({ buildings: [storehouseBuilding] });
    const plainState = makeSpoilageState({ buildings: [plainBuilding] });

    const afterStorehouse = runSpoilageTicks(storehouseState, TICKS_PER_DAY);
    const afterPlain = runSpoilageTicks(plainState, TICKS_PER_DAY);

    const storehouseLoss = initial - afterStorehouse.buildings[0]!.storedResources.bread!;
    const plainLoss = initial - afterPlain.buildings[0]!.storedResources.bread!;

    const ratio = storehouseLoss / plainLoss;
    expect(ratio).toBeCloseTo(0.50, 1);
  });

  it("storehouse reduces olives spoilage by 50%", () => {
    const initial = 100;
    const storehouseBuilding = makeBuilding("storehouse", { olives: initial });
    const plainBuilding = makeBuilding("kitchen", { olives: initial });

    const storehouseState = makeSpoilageState({ buildings: [storehouseBuilding] });
    const plainState = makeSpoilageState({ buildings: [plainBuilding] });

    const afterStorehouse = runSpoilageTicks(storehouseState, TICKS_PER_DAY);
    const afterPlain = runSpoilageTicks(plainState, TICKS_PER_DAY);

    const storehouseLoss = initial - afterStorehouse.buildings[0]!.storedResources.olives!;
    const plainLoss = initial - afterPlain.buildings[0]!.storedResources.olives!;

    const ratio = storehouseLoss / plainLoss;
    expect(ratio).toBeCloseTo(0.50, 1);
  });

  it("granary also reduces bread spoilage by 80%", () => {
    const initial = 100;
    const granaryBuilding = makeBuilding("granary", { bread: initial });
    const plainBuilding = makeBuilding("kitchen", { bread: initial });

    const granaryState = makeSpoilageState({ buildings: [granaryBuilding] });
    const plainState = makeSpoilageState({ buildings: [plainBuilding] });

    const afterGranary = runSpoilageTicks(granaryState, TICKS_PER_DAY);
    const afterPlain = runSpoilageTicks(plainState, TICKS_PER_DAY);

    const granaryLoss = initial - afterGranary.buildings[0]!.storedResources.bread!;
    const plainLoss = initial - afterPlain.buildings[0]!.storedResources.bread!;

    const ratio = granaryLoss / plainLoss;
    expect(ratio).toBeCloseTo(0.20, 1);
  });

  it("animal_pen reduces sacred_animals spoilage by 70%", () => {
    const initial = 100;
    const penBuilding = makeBuilding("animal_pen", { sacred_animals: initial });
    const plainBuilding = makeBuilding("kitchen", { sacred_animals: initial });

    const penState = makeSpoilageState({ buildings: [penBuilding] });
    const plainState = makeSpoilageState({ buildings: [plainBuilding] });

    const afterPen = runSpoilageTicks(penState, TICKS_PER_DAY);
    const afterPlain = runSpoilageTicks(plainState, TICKS_PER_DAY);

    const penLoss = initial - afterPen.buildings[0]!.storedResources.sacred_animals!;
    const plainLoss = initial - afterPlain.buildings[0]!.storedResources.sacred_animals!;

    // animal_pen has spoilageReduction { sacred_animals: 0.30 }, so loss ~30% of plain
    const ratio = penLoss / plainLoss;
    expect(ratio).toBeCloseTo(0.30, 1);
  });

  it("summer does not increase sacred_water spoilage (summerMultiplier = 1.0)", () => {
    const initial = 100;
    const building = makeBuilding("kitchen", { sacred_water: initial });

    const springState = makeSpoilageState({ season: "Spring", buildings: [building] });
    const summerState = makeSpoilageState({ season: "Summer", buildings: [building] });

    const afterSpring = runSpoilageTicks(springState, TICKS_PER_DAY);
    const afterSummer = runSpoilageTicks(summerState, TICKS_PER_DAY);

    const springLoss = initial - afterSpring.buildings[0]!.storedResources.sacred_water!;
    const summerLoss = initial - afterSummer.buildings[0]!.storedResources.sacred_water!;

    // sacred_water has summerMultiplier 1.0, so no difference
    const ratio = summerLoss / springLoss;
    expect(ratio).toBeCloseTo(1.0, 1);
  });

  it("low condition uses 1.5x multiplier for sacred_water (not 2.0)", () => {
    const initial = 100;
    const goodBuilding = makeBuilding("kitchen", { sacred_water: initial }, { condition: 95, maxCondition: 100 });
    const badBuilding = makeBuilding("kitchen", { sacred_water: initial }, { condition: 30, maxCondition: 100 });

    const goodState = makeSpoilageState({ buildings: [goodBuilding] });
    const badState = makeSpoilageState({ buildings: [badBuilding] });

    const afterGood = runSpoilageTicks(goodState, TICKS_PER_DAY);
    const afterBad = runSpoilageTicks(badState, TICKS_PER_DAY);

    const goodLoss = initial - afterGood.buildings[0]!.storedResources.sacred_water!;
    const badLoss = initial - afterBad.buildings[0]!.storedResources.sacred_water!;

    // sacred_water lowConditionMultiplier is 1.5
    const ratio = badLoss / goodLoss;
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it("combined modifiers: summer + low condition stacks multiplicatively for grain", () => {
    const initial = 100;
    // Baseline: spring, good condition
    const baseBuilding = makeBuilding("kitchen", { grain: initial }, { condition: 95, maxCondition: 100 });
    // Combined: summer, low condition
    const comboBuilding = makeBuilding("kitchen", { grain: initial }, { condition: 30, maxCondition: 100 });

    const baseState = makeSpoilageState({ season: "Spring", buildings: [baseBuilding] });
    const comboState = makeSpoilageState({ season: "Summer", buildings: [comboBuilding] });

    const afterBase = runSpoilageTicks(baseState, TICKS_PER_DAY);
    const afterCombo = runSpoilageTicks(comboState, TICKS_PER_DAY);

    const baseLoss = initial - afterBase.buildings[0]!.storedResources.grain!;
    const comboLoss = initial - afterCombo.buildings[0]!.storedResources.grain!;

    // Summer 1.5x * lowCondition 2.0x = 3.0x combined
    const ratio = comboLoss / baseLoss;
    expect(ratio).toBeCloseTo(3.0, 0);
  });

  it("multiple buildings accumulate spoilage deltas in global ledger", () => {
    const initial = 100;
    const building1 = makeBuilding("kitchen", { grain: initial }, { id: "kitchen-1" });
    const building2 = makeBuilding("kitchen", { grain: initial }, { id: "kitchen-2" });

    const state: GameState = {
      ...makeSpoilageState({ buildings: [building1, building2] }),
      resources: {
        ...makeSpoilageState().resources,
        grain: { ...makeSpoilageState().resources.grain, amount: 200 }
      }
    };

    const after = runSpoilageTicks(state, TICKS_PER_DAY);

    const b1Loss = initial - after.buildings[0]!.storedResources.grain!;
    const b2Loss = initial - after.buildings[1]!.storedResources.grain!;
    const globalLoss = 200 - after.resources.grain.amount;

    // Each building loses ~1%, so total global loss should be ~2
    expect(b1Loss).toBeCloseTo(1.0, 0);
    expect(b2Loss).toBeCloseTo(1.0, 0);
    expect(globalLoss).toBeCloseTo(b1Loss + b2Loss, 4);
  });

  it("condition exactly at 50% does not trigger low condition multiplier", () => {
    const initial = 100;
    // condition/maxCondition = 50/100 = 0.5 — NOT less than 0.5
    const borderBuilding = makeBuilding("kitchen", { grain: initial }, { condition: 50, maxCondition: 100 });
    const goodBuilding = makeBuilding("kitchen", { grain: initial }, { condition: 95, maxCondition: 100 });

    const borderState = makeSpoilageState({ buildings: [borderBuilding] });
    const goodState = makeSpoilageState({ buildings: [goodBuilding] });

    const afterBorder = runSpoilageTicks(borderState, TICKS_PER_DAY);
    const afterGood = runSpoilageTicks(goodState, TICKS_PER_DAY);

    const borderLoss = initial - afterBorder.buildings[0]!.storedResources.grain!;
    const goodLoss = initial - afterGood.buildings[0]!.storedResources.grain!;

    // At exactly 50%, no multiplier should apply — losses should be equal
    const ratio = borderLoss / goodLoss;
    expect(ratio).toBeCloseTo(1.0, 1);
  });

  it("resource amount never goes below zero after extended spoilage", () => {
    // Very small amount that should reach zero well within 10 days
    const building = makeBuilding("kitchen", { bread: 0.001 });
    const state: GameState = {
      ...makeSpoilageState({ buildings: [building] }),
      resources: {
        ...makeSpoilageState().resources,
        bread: { ...makeSpoilageState().resources.bread, amount: 0.001 }
      }
    };

    // Run 10 full days of spoilage (bread decays at 2%/day)
    const after = runSpoilageTicks(state, TICKS_PER_DAY * 10);
    expect(after.buildings[0]!.storedResources.bread!).toBeGreaterThanOrEqual(0);
    expect(after.resources.bread.amount).toBeGreaterThanOrEqual(0);
  });

  it("building with empty storedResources returns same state reference", () => {
    const building = makeBuilding("kitchen", {});
    const state = makeSpoilageState({ buildings: [building] });

    const after = processSpoilage(state);
    // No changes — should return same reference
    expect(after).toBe(state);
  });

  it("building with only non-perishables returns same state reference", () => {
    const building = makeBuilding("storehouse", { gold: 50, stone: 100 } as Partial<Record<ResourceId, number>>);
    const state = makeSpoilageState({ buildings: [building] });

    const after = processSpoilage(state);
    // No perishable resources changed — should return same reference
    expect(after).toBe(state);
  });

  it("logs and planks do not decay", () => {
    const building = makeBuilding("storehouse", { logs: 75, planks: 40 } as Partial<Record<ResourceId, number>>);
    const state = makeSpoilageState({ buildings: [building] });

    const after = runSpoilageTicks(state, TICKS_PER_DAY);
    expect(after.buildings[0]!.storedResources.logs).toBe(75);
    expect(after.buildings[0]!.storedResources.planks).toBe(40);
  });

  it("completed construction building does spoil resources", () => {
    // constructionWork = constructionProgress means complete
    const building: BuildingInstance = {
      ...makeBuilding("kitchen", { grain: 100 }),
      constructionWork: 10,
      constructionProgress: 10
    };
    const state = makeSpoilageState({ buildings: [building] });

    const after = runSpoilageTicks(state, TICKS_PER_DAY);
    // Should have decayed since construction is complete
    expect(after.buildings[0]!.storedResources.grain!).toBeLessThan(100);
  });
});
