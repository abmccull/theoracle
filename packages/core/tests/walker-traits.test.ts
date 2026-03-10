import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/state/initialState";
import { createBuildingAt } from "../src/simulation/updateDay";
import {
  walkerHasTrait,
  computeSkillLevel,
  getSkillMultiplier,
  getMoraleMultiplier,
  getWorkerEfficiency,
  advanceWorkerMorale,
} from "../src/simulation/updateDay";
import { processFoodConsumption, HUNGER_STARVING_TICKS } from "../src/simulation/food";
import { advanceWorkerPhases } from "../src/simulation/production";
import { reduceCommand } from "../src/reducers";
import { buildingDefs, WALKER_TRAIT_IDS, walkerTraitDefs } from "@the-oracle/content";
import type {
  BuildingInstance,
  GameEvent,
  GameState,
  WalkerInstance,
  WalkerTraitId,
} from "../src/state/gameState";

// ── Helpers ──

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
    experience: 0,
    skillLevel: 1,
    morale: 50,
    ...overrides,
  };
}

function makeCarrier(
  id: string,
  tile = { x: 10, y: 10 },
  overrides: Partial<WalkerInstance> = {}
): WalkerInstance {
  return {
    id,
    role: "carrier",
    name: `Carrier ${id}`,
    tile,
    state: "idle",
    path: [],
    moveCooldown: 0,
    fatigue: 0,
    haulingSkill: 1,
    supplyRadius: 5,
    experience: 0,
    skillLevel: 1,
    morale: 50,
    ...overrides,
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
  return {
    ...base,
    condition: def.maxCondition,
    storedResources: { ...def.startingResources },
    constructionProgress: base.constructionWork ?? 0,
    assignedWorkerIds: [],
    ...overrides,
  };
}

function baseState(): GameState {
  return createInitialState();
}

function stateWithWalkers(walkers: WalkerInstance[], buildings?: BuildingInstance[]): GameState {
  const state = baseState();
  return {
    ...state,
    walkers,
    buildings: buildings ?? state.buildings,
  };
}

// ── Tests ──

describe("Walker Trait System", () => {
  describe("Trait Definitions", () => {
    it("defines all 8 walker traits", () => {
      expect(WALKER_TRAIT_IDS.length).toBe(8);
      expect(WALKER_TRAIT_IDS).toContain("industrious");
      expect(WALKER_TRAIT_IDS).toContain("devout");
      expect(WALKER_TRAIT_IDS).toContain("shrewd");
      expect(WALKER_TRAIT_IDS).toContain("hardy");
      expect(WALKER_TRAIT_IDS).toContain("swift");
      expect(WALKER_TRAIT_IDS).toContain("skilled_builder");
      expect(WALKER_TRAIT_IDS).toContain("careful");
      expect(WALKER_TRAIT_IDS).toContain("charismatic");
    });

    it("each trait has a name, description, and effect", () => {
      for (const traitId of WALKER_TRAIT_IDS) {
        const def = walkerTraitDefs[traitId];
        expect(def.id).toBe(traitId);
        expect(def.name.length).toBeGreaterThan(0);
        expect(def.description.length).toBeGreaterThan(0);
        expect(def.effect.key.length).toBeGreaterThan(0);
        expect(def.effect.value).toBeGreaterThan(0);
      }
    });
  });

  describe("Trait Assignment on Hire", () => {
    it("assigns 0-2 traits when hiring a custodian", () => {
      let state = baseState();
      // Give enough gold
      state = {
        ...state,
        resources: {
          ...state.resources,
          gold: { ...state.resources.gold, amount: 100 },
        },
        // Need housing capacity — add a building with housing
        buildings: [
          ...state.buildings,
          makeBuilding("ergasterion", "erg-1", { x: 35, y: 50 }),
        ],
      };

      // Hire multiple workers to test trait variance
      const traitCounts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const result = reduceCommand(state, { type: "HireWorkerCommand", role: "custodian" });
        const newWalker = result.state.walkers[result.state.walkers.length - 1];
        const traitCount = newWalker.traits?.length ?? 0;
        expect(traitCount).toBeLessThanOrEqual(2);
        traitCounts.push(traitCount);
        // Use the new state for next hire so nextId changes
        state = result.state;
      }
      // At least some workers should have traits (probabilistic but with seeded RNG, deterministic)
      expect(traitCounts.some((c) => c > 0)).toBe(true);
    });

    it("assigns default morale of 50 to new workers", () => {
      let state = baseState();
      state = {
        ...state,
        resources: {
          ...state.resources,
          gold: { ...state.resources.gold, amount: 100 },
        },
        buildings: [
          ...state.buildings,
          makeBuilding("ergasterion", "erg-1", { x: 35, y: 50 }),
        ],
      };

      const result = reduceCommand(state, { type: "HireWorkerCommand", role: "custodian" });
      const newWalker = result.state.walkers[result.state.walkers.length - 1];
      expect(newWalker.morale).toBe(50);
      expect(newWalker.experience).toBe(0);
      expect(newWalker.skillLevel).toBe(1);
    });

    it("never assigns duplicate traits to the same walker", () => {
      let state = baseState();
      state = {
        ...state,
        resources: {
          ...state.resources,
          gold: { ...state.resources.gold, amount: 500 },
        },
        buildings: [
          ...state.buildings,
          makeBuilding("ergasterion", "erg-1", { x: 35, y: 50 }),
        ],
      };

      for (let i = 0; i < 20; i++) {
        const result = reduceCommand(state, { type: "HireWorkerCommand", role: "custodian" });
        const newWalker = result.state.walkers[result.state.walkers.length - 1];
        if (newWalker.traits && newWalker.traits.length === 2) {
          expect(newWalker.traits[0]).not.toBe(newWalker.traits[1]);
        }
        state = result.state;
      }
    });
  });

  describe("walkerHasTrait helper", () => {
    it("returns true when walker has the trait", () => {
      const walker = makeCustodian("w1", undefined, { traits: ["industrious", "hardy"] });
      expect(walkerHasTrait(walker, "industrious")).toBe(true);
      expect(walkerHasTrait(walker, "hardy")).toBe(true);
    });

    it("returns false when walker lacks the trait", () => {
      const walker = makeCustodian("w1", undefined, { traits: ["industrious"] });
      expect(walkerHasTrait(walker, "swift")).toBe(false);
    });

    it("returns false when walker has no traits", () => {
      const walker = makeCustodian("w1");
      expect(walkerHasTrait(walker, "industrious")).toBe(false);
    });
  });

  describe("Skill Level System", () => {
    it("computes correct skill levels from experience thresholds", () => {
      expect(computeSkillLevel(0)).toBe(1);
      expect(computeSkillLevel(10)).toBe(1);
      expect(computeSkillLevel(19)).toBe(1);
      expect(computeSkillLevel(20)).toBe(2);
      expect(computeSkillLevel(39)).toBe(2);
      expect(computeSkillLevel(40)).toBe(3);
      expect(computeSkillLevel(59)).toBe(3);
      expect(computeSkillLevel(60)).toBe(4);
      expect(computeSkillLevel(79)).toBe(4);
      expect(computeSkillLevel(80)).toBe(5);
      expect(computeSkillLevel(100)).toBe(5);
    });

    it("skill multiplier gives +5% per level above 1", () => {
      expect(getSkillMultiplier(makeCustodian("w1", undefined, { skillLevel: 1 }))).toBeCloseTo(1.0);
      expect(getSkillMultiplier(makeCustodian("w1", undefined, { skillLevel: 2 }))).toBeCloseTo(1.05);
      expect(getSkillMultiplier(makeCustodian("w1", undefined, { skillLevel: 3 }))).toBeCloseTo(1.10);
      expect(getSkillMultiplier(makeCustodian("w1", undefined, { skillLevel: 4 }))).toBeCloseTo(1.15);
      expect(getSkillMultiplier(makeCustodian("w1", undefined, { skillLevel: 5 }))).toBeCloseTo(1.20);
    });

    it("defaults to level 1 when skillLevel is undefined", () => {
      const walker = makeCustodian("w1");
      delete walker.skillLevel;
      expect(getSkillMultiplier(walker)).toBeCloseTo(1.0);
    });
  });

  describe("Morale System", () => {
    it("getMoraleMultiplier returns 0.5 for low morale (<20)", () => {
      expect(getMoraleMultiplier(makeCustodian("w1", undefined, { morale: 0 }))).toBe(0.5);
      expect(getMoraleMultiplier(makeCustodian("w1", undefined, { morale: 10 }))).toBe(0.5);
      expect(getMoraleMultiplier(makeCustodian("w1", undefined, { morale: 19 }))).toBe(0.5);
    });

    it("getMoraleMultiplier returns 1.1 for high morale (>70)", () => {
      expect(getMoraleMultiplier(makeCustodian("w1", undefined, { morale: 71 }))).toBe(1.1);
      expect(getMoraleMultiplier(makeCustodian("w1", undefined, { morale: 80 }))).toBe(1.1);
      expect(getMoraleMultiplier(makeCustodian("w1", undefined, { morale: 100 }))).toBe(1.1);
    });

    it("getMoraleMultiplier returns 1.0 for normal morale (20-70)", () => {
      expect(getMoraleMultiplier(makeCustodian("w1", undefined, { morale: 20 }))).toBe(1.0);
      expect(getMoraleMultiplier(makeCustodian("w1", undefined, { morale: 50 }))).toBe(1.0);
      expect(getMoraleMultiplier(makeCustodian("w1", undefined, { morale: 70 }))).toBe(1.0);
    });

    it("morale increases when fed + housed + working", () => {
      const walker = makeCustodian("w1", undefined, {
        morale: 50,
        hungerTicks: 0,
        homeBuildingId: "building-1",
        assignmentBuildingId: "building-2",
      });
      const state = stateWithWalkers([walker]);
      const result = advanceWorkerMorale(state);
      expect(result.walkers[0].morale).toBe(51);
    });

    it("morale decreases by 5 when starving", () => {
      const walker = makeCustodian("w1", undefined, {
        morale: 50,
        hungerTicks: HUNGER_STARVING_TICKS + 1,
      });
      const state = stateWithWalkers([walker]);
      const result = advanceWorkerMorale(state);
      expect(result.walkers[0].morale).toBe(45);
    });

    it("morale caps at 80 from positive growth", () => {
      const walker = makeCustodian("w1", undefined, {
        morale: 80,
        hungerTicks: 0,
        homeBuildingId: "building-1",
        assignmentBuildingId: "building-2",
      });
      const state = stateWithWalkers([walker]);
      const result = advanceWorkerMorale(state);
      // Should not exceed 80 from positive growth
      expect(result.walkers[0].morale).toBe(80);
    });

    it("morale does not go below 0", () => {
      const walker = makeCustodian("w1", undefined, {
        morale: 2,
        hungerTicks: HUNGER_STARVING_TICKS + 1,
      });
      const state = stateWithWalkers([walker]);
      const result = advanceWorkerMorale(state);
      expect(result.walkers[0].morale).toBe(0);
    });

    it("does not change morale for pilgrims", () => {
      const pilgrim: WalkerInstance = {
        id: "p1",
        role: "pilgrim",
        name: "Pilgrim 1",
        tile: { x: 10, y: 10 },
        state: "visiting",
        path: [],
        moveCooldown: 0,
        morale: 50,
      };
      const state = stateWithWalkers([pilgrim]);
      const result = advanceWorkerMorale(state);
      expect(result.walkers[0].morale).toBe(50);
    });
  });

  describe("Worker Efficiency (Combined)", () => {
    it("industrious trait gives 1.2x efficiency", () => {
      const walker = makeCustodian("w1", undefined, {
        traits: ["industrious"],
        skillLevel: 1,
        morale: 50,
      });
      expect(getWorkerEfficiency(walker)).toBeCloseTo(1.2);
    });

    it("skill level 5 gives 1.2x efficiency", () => {
      const walker = makeCustodian("w1", undefined, {
        skillLevel: 5,
        morale: 50,
      });
      expect(getWorkerEfficiency(walker)).toBeCloseTo(1.2);
    });

    it("high morale gives 1.1x efficiency", () => {
      const walker = makeCustodian("w1", undefined, {
        skillLevel: 1,
        morale: 80,
      });
      expect(getWorkerEfficiency(walker)).toBeCloseTo(1.1);
    });

    it("low morale gives 0.5x efficiency", () => {
      const walker = makeCustodian("w1", undefined, {
        skillLevel: 1,
        morale: 10,
      });
      expect(getWorkerEfficiency(walker)).toBeCloseTo(0.5);
    });

    it("stacks industrious + skill 5 + high morale", () => {
      const walker = makeCustodian("w1", undefined, {
        traits: ["industrious"],
        skillLevel: 5,
        morale: 80,
      });
      // 1.2 * 1.2 * 1.1 = 1.584
      expect(getWorkerEfficiency(walker)).toBeCloseTo(1.584);
    });

    it("no traits, level 1, normal morale gives 1.0x", () => {
      const walker = makeCustodian("w1", undefined, {
        skillLevel: 1,
        morale: 50,
      });
      expect(getWorkerEfficiency(walker)).toBeCloseTo(1.0);
    });
  });

  describe("Hardy Trait — Hunger Reduction", () => {
    it("hardy walker accumulates hunger slower", () => {
      const hardyWalker = makeCustodian("w1", undefined, {
        traits: ["hardy"],
        hungerTicks: 0,
      });
      const normalWalker = makeCustodian("w2", undefined, {
        hungerTicks: 0,
      });
      const state = stateWithWalkers([hardyWalker, normalWalker]);
      // Process one tick of food with no food available
      const result = processFoodConsumption(state, []);
      const updatedHardy = result.walkers.find((w) => w.id === "w1")!;
      const updatedNormal = result.walkers.find((w) => w.id === "w2")!;
      // Hardy should accumulate at 0.7 rate, normal at 1.0
      expect(updatedHardy.hungerTicks).toBeCloseTo(0.7);
      expect(updatedNormal.hungerTicks).toBe(1);
    });
  });

  describe("Swift Trait — Movement Speed", () => {
    it("swift walker has reduced moveCooldown", () => {
      // We test indirectly by checking the trait definition
      const swiftDef = walkerTraitDefs.swift;
      expect(swiftDef.effect.key).toBe("movement_speed");
      expect(swiftDef.effect.value).toBe(0.25);
    });
  });

  describe("Skilled Builder Trait — Construction Speed", () => {
    it("trait definition has correct effect", () => {
      const def = walkerTraitDefs.skilled_builder;
      expect(def.effect.key).toBe("construction_speed");
      expect(def.effect.value).toBe(0.30);
    });
  });

  describe("Devout Trait — Repair Speed", () => {
    it("trait definition has correct effect", () => {
      const def = walkerTraitDefs.devout;
      expect(def.effect.key).toBe("repair_speed");
      expect(def.effect.value).toBe(0.15);
    });
  });

  describe("Experience Gain Edge Cases", () => {
    it("experience caps at 100", () => {
      expect(computeSkillLevel(100)).toBe(5);
      expect(computeSkillLevel(150)).toBe(5);
    });

    it("max experience walker has correct skill multiplier", () => {
      const walker = makeCustodian("w1", undefined, {
        experience: 100,
        skillLevel: 5,
      });
      expect(getSkillMultiplier(walker)).toBeCloseTo(1.20);
    });
  });

  describe("Morale Edge Cases", () => {
    it("morale 100 stays valid after positive update", () => {
      const walker = makeCustodian("w1", undefined, {
        morale: 100,
        hungerTicks: 0,
        homeBuildingId: "b1",
        assignmentBuildingId: "b2",
      });
      const state = stateWithWalkers([walker]);
      const result = advanceWorkerMorale(state);
      // 100 is above 80 cap for positive growth — should remain 100
      expect(result.walkers[0].morale).toBe(100);
    });

    it("starvation can reduce morale below 80", () => {
      const walker = makeCustodian("w1", undefined, {
        morale: 84,
        hungerTicks: HUNGER_STARVING_TICKS + 1,
      });
      const state = stateWithWalkers([walker]);
      const result = advanceWorkerMorale(state);
      expect(result.walkers[0].morale).toBe(79);
    });

    it("combined fed+working and starving applies both effects", () => {
      // Starving overrides fed since hungerTicks > 0 means fed is false
      const walker = makeCustodian("w1", undefined, {
        morale: 50,
        hungerTicks: HUNGER_STARVING_TICKS + 1,
        homeBuildingId: "b1",
        assignmentBuildingId: "b2",
      });
      const state = stateWithWalkers([walker]);
      const result = advanceWorkerMorale(state);
      // hungerTicks > 0 means not fed, so no +1 bonus; but starving → -5
      expect(result.walkers[0].morale).toBe(45);
    });
  });
});
