import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/state/initialState";
import {
  calculateProsperity,
  determineCityTier,
  calculateVisitorCapacity,
  calculateTradeRevenue,
  calculateDonationRevenue,
  advanceCityGrowth,
  processVisitorEconomy,
  applyOracleImpact,
  DEFAULT_CITY_PROSPERITY
} from "../src/simulation/city";
import { selectCityProsperity, selectVisitorStatus } from "../src/selectors";
import type {
  BuildingInstance,
  CityProsperity,
  CityTier,
  FactionId,
  FactionState,
  GameState,
  OracleImpactEvent,
  ResourceId
} from "../src/state/gameState";

function withBuildings(state: GameState, buildings: BuildingInstance[]): GameState {
  return { ...state, buildings };
}

function withResource(state: GameState, resourceId: ResourceId, amount: number): GameState {
  const res = state.resources[resourceId];
  if (!res) return state;
  return {
    ...state,
    resources: {
      ...state.resources,
      [resourceId]: { ...res, amount }
    }
  };
}

function withReputation(state: GameState, score: number): GameState {
  return {
    ...state,
    campaign: {
      ...state.campaign,
      reputation: {
        ...state.campaign.reputation,
        score
      }
    }
  };
}

function withCityProsperity(state: GameState, overrides: Partial<CityProsperity>): GameState {
  return {
    ...state,
    cityProsperity: {
      ...(state.cityProsperity ?? DEFAULT_CITY_PROSPERITY),
      ...overrides
    }
  };
}

function withFactionCredibility(state: GameState, credibility: number): GameState {
  const factions = { ...state.factions };
  for (const id of Object.keys(factions) as FactionId[]) {
    factions[id] = { ...factions[id], credibility };
  }
  return { ...state, factions };
}

function withTreasuryCompleted(state: GameState, completed: number): GameState {
  return {
    ...state,
    campaign: {
      ...state.campaign,
      treasury: {
        ...state.campaign.treasury,
        completed
      }
    }
  };
}

function makeBuilding(defId: string, condition = 100, maxCondition = 100): BuildingInstance {
  return {
    id: `building-${defId}-${Math.random().toString(36).slice(2, 6)}`,
    defId: defId as BuildingInstance["defId"],
    position: { x: 30, y: 50 },
    condition,
    maxCondition,
    requiresPriest: false,
    assignedPriestIds: [],
    assignedWorkerIds: [],
    storedResources: {},
    connectedToRoad: true
  };
}

function withCrisisChains(state: GameState, chains: { stage: "rumor" | "active" | "resolution" }[]): GameState {
  return {
    ...state,
    campaign: {
      ...state.campaign,
      worldMap: {
        ...state.campaign.worldMap,
        crisisChains: chains.map((c, i) => ({
          id: `crisis-${i}`,
          label: `Crisis ${i}`,
          nodeId: "delphi",
          stage: c.stage,
          pressure: 50,
          stepsCompleted: 1
        }))
      }
    }
  };
}

function withFactionConflicts(state: GameState, factionId: FactionId, conflicts: FactionId[]): GameState {
  return {
    ...state,
    factions: {
      ...state.factions,
      [factionId]: {
        ...state.factions[factionId],
        activeConflicts: conflicts
      }
    }
  };
}

describe("City Prosperity System", () => {
  describe("calculateProsperity", () => {
    it("returns a value between 0 and 100", () => {
      const state = createInitialState();
      const prosperity = calculateProsperity(state);
      expect(prosperity).toBeGreaterThanOrEqual(0);
      expect(prosperity).toBeLessThanOrEqual(100);
    });

    it("increases with higher reputation score", () => {
      const base = createInitialState();
      const low = calculateProsperity(withReputation(base, 10));
      const high = calculateProsperity(withReputation(base, 80));
      expect(high).toBeGreaterThan(low);
    });

    it("increases with higher faction credibility", () => {
      const base = createInitialState();
      const low = calculateProsperity(withFactionCredibility(base, 20));
      const high = calculateProsperity(withFactionCredibility(base, 80));
      expect(high).toBeGreaterThan(low);
    });

    it("increases with completed dedications", () => {
      const base = createInitialState();
      const none = calculateProsperity(withTreasuryCompleted(base, 0));
      const some = calculateProsperity(withTreasuryCompleted(base, 3));
      expect(some).toBeGreaterThan(none);
    });

    it("decreases with unresolved crises", () => {
      const base = createInitialState();
      const calm = calculateProsperity(base);
      const crisis = calculateProsperity(
        withCrisisChains(base, [{ stage: "active" }, { stage: "rumor" }])
      );
      expect(crisis).toBeLessThan(calm);
    });

    it("decreases with faction conflicts", () => {
      // Clear all conflicts first, then add some
      let peaceful = createInitialState();
      const factionIds = Object.keys(peaceful.factions) as FactionId[];
      for (const id of factionIds) {
        peaceful = withFactionConflicts(peaceful, id, []);
      }
      const peacefulScore = calculateProsperity(peaceful);
      let warring = { ...peaceful };
      warring = withFactionConflicts(warring, "athens", ["sparta"]);
      warring = withFactionConflicts(warring, "sparta", ["athens"]);
      const warringScore = calculateProsperity(warring);
      expect(warringScore).toBeLessThan(peacefulScore);
    });

    it("clamps to 0 with extremely negative factors", () => {
      let state = createInitialState();
      state = withReputation(state, 0);
      state = withFactionCredibility(state, 0);
      state = withCrisisChains(state, [
        { stage: "active" }, { stage: "active" }, { stage: "active" },
        { stage: "active" }, { stage: "active" }
      ]);
      const prosperity = calculateProsperity(state);
      expect(prosperity).toBe(0);
    });

    it("increases with buildings that have prestige effects", () => {
      const base = createInitialState();
      const noPrestige = calculateProsperity(withBuildings(base, []));
      const withPrestigeBuildings = calculateProsperity(
        withBuildings(base, [
          makeBuilding("inner_sanctum"),
          makeBuilding("library"),
          makeBuilding("scriptorium")
        ])
      );
      expect(withPrestigeBuildings).toBeGreaterThan(noPrestige);
    });

    it("does not count buildings under construction", () => {
      const base = createInitialState();
      const constructing: BuildingInstance = {
        ...makeBuilding("library"),
        constructionWork: 10,
        constructionProgress: 3
      };
      const prosperityConstructing = calculateProsperity(withBuildings(base, [constructing]));
      const prosperityNone = calculateProsperity(withBuildings(base, []));
      expect(prosperityConstructing).toBe(prosperityNone);
    });
  });

  describe("determineCityTier", () => {
    it("returns village for 0-24", () => {
      expect(determineCityTier(0)).toBe("village");
      expect(determineCityTier(24)).toBe("village");
    });

    it("returns town for 25-49", () => {
      expect(determineCityTier(25)).toBe("town");
      expect(determineCityTier(49)).toBe("town");
    });

    it("returns city for 50-74", () => {
      expect(determineCityTier(50)).toBe("city");
      expect(determineCityTier(74)).toBe("city");
    });

    it("returns panhellenic_center for 75+", () => {
      expect(determineCityTier(75)).toBe("panhellenic_center");
      expect(determineCityTier(100)).toBe("panhellenic_center");
    });

    it("handles exact boundary values", () => {
      expect(determineCityTier(24)).toBe("village");
      expect(determineCityTier(25)).toBe("town");
      expect(determineCityTier(49)).toBe("town");
      expect(determineCityTier(50)).toBe("city");
      expect(determineCityTier(74)).toBe("city");
      expect(determineCityTier(75)).toBe("panhellenic_center");
    });
  });

  describe("calculateVisitorCapacity", () => {
    it("returns at least 1 with no buildings", () => {
      const state = withBuildings(createInitialState(), []);
      expect(calculateVisitorCapacity(state)).toBeGreaterThanOrEqual(1);
    });

    it("sums pilgrim_capacity from buildings", () => {
      const state = withBuildings(createInitialState(), [
        makeBuilding("xenon"),         // pilgrim_capacity: 6
        makeBuilding("stoa_of_columns") // pilgrim_capacity: 4
      ]);
      const capacity = calculateVisitorCapacity(state);
      expect(capacity).toBe(10);
    });

    it("scales with building condition", () => {
      const full = withBuildings(createInitialState(), [
        makeBuilding("xenon", 100, 100)
      ]);
      const damaged = withBuildings(createInitialState(), [
        makeBuilding("xenon", 50, 100)
      ]);
      expect(calculateVisitorCapacity(full)).toBeGreaterThan(calculateVisitorCapacity(damaged));
    });

    it("ignores buildings under construction", () => {
      const building: BuildingInstance = {
        ...makeBuilding("xenon"),
        constructionWork: 10,
        constructionProgress: 2
      };
      const state = withBuildings(createInitialState(), [building]);
      expect(calculateVisitorCapacity(state)).toBe(1); // minimum
    });
  });

  describe("calculateTradeRevenue", () => {
    it("returns 0 with no trade buildings", () => {
      const state = withBuildings(createInitialState(), []);
      expect(calculateTradeRevenue(state)).toBe(0);
    });

    it("sums trade_income from buildings", () => {
      const state = withBuildings(createInitialState(), [
        makeBuilding("agora_market") // trade_income: 4
      ]);
      expect(calculateTradeRevenue(state)).toBe(4);
    });
  });

  describe("calculateDonationRevenue", () => {
    it("returns 0 with no donation buildings", () => {
      const state = withBuildings(createInitialState(), []);
      expect(calculateDonationRevenue(state)).toBe(0);
    });

    it("sums donation effects from buildings", () => {
      const state = withBuildings(createInitialState(), [
        makeBuilding("xenon"),          // donation: 3
        makeBuilding("sacred_theater")  // donation: 4
      ]);
      expect(calculateDonationRevenue(state)).toBe(7);
    });
  });

  describe("advanceCityGrowth", () => {
    it("initializes city prosperity when none exists", () => {
      const state = createInitialState();
      const result = advanceCityGrowth(state);
      expect(result.cityProsperity).toBeDefined();
      expect(result.cityProsperity!.prosperityScore).toBeGreaterThanOrEqual(0);
      expect(result.cityProsperity!.cityTier).toBeDefined();
    });

    it("updates all prosperity fields", () => {
      const state = createInitialState();
      const result = advanceCityGrowth(state);
      const cp = result.cityProsperity!;
      expect(typeof cp.prosperityScore).toBe("number");
      expect(typeof cp.pilgrimAttraction).toBe("number");
      expect(typeof cp.tradeRevenue).toBe("number");
      expect(typeof cp.donationRevenue).toBe("number");
      expect(typeof cp.visitorCapacity).toBe("number");
      expect(typeof cp.growthRate).toBe("number");
      expect(typeof cp.cityTier).toBe("string");
    });

    it("preserves existing visitor count", () => {
      let state = createInitialState();
      state = withCityProsperity(state, { visitorCount: 5 });
      const result = advanceCityGrowth(state);
      expect(result.cityProsperity!.visitorCount).toBe(5);
    });

    it("sets positive growth rate for prosperous cities", () => {
      let state = createInitialState();
      state = withReputation(state, 80);
      state = withFactionCredibility(state, 70);
      state = withTreasuryCompleted(state, 5);
      const result = advanceCityGrowth(state);
      expect(result.cityProsperity!.growthRate).toBeGreaterThan(0);
    });

    it("sets zero growth rate for struggling settlements", () => {
      let state = createInitialState();
      state = withReputation(state, 0);
      state = withFactionCredibility(state, 0);
      state = withBuildings(state, []);
      const result = advanceCityGrowth(state);
      expect(result.cityProsperity!.growthRate).toBe(0);
    });
  });

  describe("processVisitorEconomy", () => {
    it("spawns visitors when under capacity", () => {
      let state = createInitialState();
      state = withCityProsperity(state, {
        visitorCount: 0,
        visitorCapacity: 10,
        pilgrimAttraction: 50,
        cityTier: "town"
      });
      const result = processVisitorEconomy(state);
      expect(result.state.cityProsperity!.visitorCount).toBeGreaterThan(0);
    });

    it("does not exceed visitor capacity", () => {
      let state = createInitialState();
      state = withCityProsperity(state, {
        visitorCount: 10,
        visitorCapacity: 10,
        pilgrimAttraction: 100,
        cityTier: "panhellenic_center"
      });
      const result = processVisitorEconomy(state);
      // Should not increase beyond capacity (may decrease from attrition)
      expect(result.state.cityProsperity!.visitorCount).toBeLessThanOrEqual(10);
    });

    it("visitors consume bread", () => {
      let state = createInitialState();
      state = withResource(state, "bread", 50);
      state = withCityProsperity(state, {
        visitorCount: 10,
        visitorCapacity: 20,
        pilgrimAttraction: 50,
        cityTier: "city"
      });
      const result = processVisitorEconomy(state);
      expect(result.state.resources.bread.amount).toBeLessThan(50);
    });

    it("visitors contribute gold", () => {
      let state = createInitialState();
      const initialGold = state.resources.gold.amount;
      state = withCityProsperity(state, {
        visitorCount: 10,
        visitorCapacity: 20,
        pilgrimAttraction: 50,
        cityTier: "city"
      });
      const result = processVisitorEconomy(state);
      expect(result.state.resources.gold.amount).toBeGreaterThan(initialGold);
    });

    it("bread consumption does not go negative", () => {
      let state = createInitialState();
      state = withResource(state, "bread", 0);
      state = withCityProsperity(state, {
        visitorCount: 10,
        visitorCapacity: 20,
        pilgrimAttraction: 50,
        cityTier: "city"
      });
      const result = processVisitorEconomy(state);
      expect(result.state.resources.bread.amount).toBeGreaterThanOrEqual(0);
    });

    it("gold does not exceed capacity", () => {
      let state = createInitialState();
      state = withResource(state, "gold", 499);
      state = withCityProsperity(state, {
        visitorCount: 100,
        visitorCapacity: 200,
        pilgrimAttraction: 100,
        cityTier: "panhellenic_center"
      });
      const result = processVisitorEconomy(state);
      expect(result.state.resources.gold.amount).toBeLessThanOrEqual(500);
    });

    it("spawns faster at higher city tiers", () => {
      const base = createInitialState();
      const village = withCityProsperity(base, {
        visitorCount: 0, visitorCapacity: 100, pilgrimAttraction: 50, cityTier: "village"
      });
      const panhellenicCenter = withCityProsperity(base, {
        visitorCount: 0, visitorCapacity: 100, pilgrimAttraction: 50, cityTier: "panhellenic_center"
      });
      const villageResult = processVisitorEconomy(village);
      const panhellenicResult = processVisitorEconomy(panhellenicCenter);
      expect(panhellenicResult.state.cityProsperity!.visitorCount)
        .toBeGreaterThan(villageResult.state.cityProsperity!.visitorCount);
    });

    it("spawns faster with higher pilgrim attraction", () => {
      const base = createInitialState();
      const lowAttraction = withCityProsperity(base, {
        visitorCount: 0, visitorCapacity: 100, pilgrimAttraction: 10, cityTier: "town"
      });
      const highAttraction = withCityProsperity(base, {
        visitorCount: 0, visitorCapacity: 100, pilgrimAttraction: 90, cityTier: "town"
      });
      const lowResult = processVisitorEconomy(lowAttraction);
      const highResult = processVisitorEconomy(highAttraction);
      expect(highResult.state.cityProsperity!.visitorCount)
        .toBeGreaterThan(lowResult.state.cityProsperity!.visitorCount);
    });

    it("returns events array", () => {
      const state = createInitialState();
      const result = processVisitorEconomy(state);
      expect(Array.isArray(result.events)).toBe(true);
    });
  });

  describe("applyOracleImpact", () => {
    it("prophecy_success_streak increases pilgrim attraction", () => {
      let state = createInitialState();
      state = withCityProsperity(state, { pilgrimAttraction: 40 });
      const result = applyOracleImpact(state, { kind: "prophecy_success_streak" });
      expect(result.cityProsperity!.pilgrimAttraction).toBe(55);
    });

    it("prophecy_failure_streak decreases pilgrim attraction", () => {
      let state = createInitialState();
      state = withCityProsperity(state, { pilgrimAttraction: 40 });
      const result = applyOracleImpact(state, { kind: "prophecy_failure_streak" });
      expect(result.cityProsperity!.pilgrimAttraction).toBe(20);
    });

    it("prophecy_failure_streak clamps to 0", () => {
      let state = createInitialState();
      state = withCityProsperity(state, { pilgrimAttraction: 10 });
      const result = applyOracleImpact(state, { kind: "prophecy_failure_streak" });
      expect(result.cityProsperity!.pilgrimAttraction).toBe(0);
    });

    it("prophecy_success_streak clamps to 100", () => {
      let state = createInitialState();
      state = withCityProsperity(state, { pilgrimAttraction: 90 });
      const result = applyOracleImpact(state, { kind: "prophecy_success_streak" });
      expect(result.cityProsperity!.pilgrimAttraction).toBe(100);
    });

    it("reputation_tier_up recalculates city tier", () => {
      let state = createInitialState();
      state = withReputation(state, 80);
      state = withFactionCredibility(state, 70);
      state = withTreasuryCompleted(state, 5);
      state = withCityProsperity(state, { cityTier: "village" });
      const result = applyOracleImpact(state, { kind: "reputation_tier_up" });
      // Should recalculate based on actual prosperity
      expect(result.cityProsperity!.cityTier).toBeDefined();
    });

    it("reputation_tier_down halves trade revenue", () => {
      let state = createInitialState();
      state = withCityProsperity(state, { tradeRevenue: 20 });
      const result = applyOracleImpact(state, { kind: "reputation_tier_down" });
      expect(result.cityProsperity!.tradeRevenue).toBe(10);
    });

    it("crisis_resolved boosts prosperity by 10", () => {
      let state = createInitialState();
      state = withCityProsperity(state, { prosperityScore: 40 });
      const result = applyOracleImpact(state, { kind: "crisis_resolved" });
      expect(result.cityProsperity!.prosperityScore).toBe(50);
    });

    it("crisis_escalated reduces prosperity by 15", () => {
      let state = createInitialState();
      state = withCityProsperity(state, { prosperityScore: 40 });
      const result = applyOracleImpact(state, { kind: "crisis_escalated" });
      expect(result.cityProsperity!.prosperityScore).toBe(25);
    });

    it("crisis_escalated clamps to 0", () => {
      let state = createInitialState();
      state = withCityProsperity(state, { prosperityScore: 5 });
      const result = applyOracleImpact(state, { kind: "crisis_escalated" });
      expect(result.cityProsperity!.prosperityScore).toBe(0);
    });

    it("festival_success boosts prosperity and visitors", () => {
      let state = createInitialState();
      state = withCityProsperity(state, { prosperityScore: 40, visitorCount: 5 });
      const result = applyOracleImpact(state, { kind: "festival_success" });
      expect(result.cityProsperity!.prosperityScore).toBe(45);
      expect(result.cityProsperity!.visitorCount).toBe(13);
    });

    it("festival_failure reduces prosperity by 8", () => {
      let state = createInitialState();
      state = withCityProsperity(state, { prosperityScore: 40 });
      const result = applyOracleImpact(state, { kind: "festival_failure" });
      expect(result.cityProsperity!.prosperityScore).toBe(32);
    });
  });

  describe("selectCityProsperity", () => {
    it("returns defaults when no city prosperity exists", () => {
      const state = createInitialState();
      const cp = selectCityProsperity(state);
      expect(cp.prosperityScore).toBe(DEFAULT_CITY_PROSPERITY.prosperityScore);
      expect(cp.cityTier).toBe("village");
    });

    it("returns existing city prosperity", () => {
      let state = createInitialState();
      state = withCityProsperity(state, { prosperityScore: 60, cityTier: "city" });
      const cp = selectCityProsperity(state);
      expect(cp.prosperityScore).toBe(60);
      expect(cp.cityTier).toBe("city");
    });
  });

  describe("selectVisitorStatus", () => {
    it("returns default values when no city prosperity exists", () => {
      const state = createInitialState();
      const status = selectVisitorStatus(state);
      expect(status.count).toBe(0);
      expect(status.capacity).toBe(3);
      expect(status.tier).toBe("village");
      expect(status.satisfaction).toBeGreaterThanOrEqual(0);
      expect(status.satisfaction).toBeLessThanOrEqual(100);
    });

    it("reflects current visitor status", () => {
      let state = createInitialState();
      state = withCityProsperity(state, {
        visitorCount: 7,
        visitorCapacity: 15,
        cityTier: "town"
      });
      const status = selectVisitorStatus(state);
      expect(status.count).toBe(7);
      expect(status.capacity).toBe(15);
      expect(status.tier).toBe("town");
    });
  });

  describe("DEFAULT_CITY_PROSPERITY", () => {
    it("has sensible default values", () => {
      expect(DEFAULT_CITY_PROSPERITY.prosperityScore).toBe(10);
      expect(DEFAULT_CITY_PROSPERITY.pilgrimAttraction).toBe(10);
      expect(DEFAULT_CITY_PROSPERITY.visitorCount).toBe(0);
      expect(DEFAULT_CITY_PROSPERITY.visitorCapacity).toBe(3);
      expect(DEFAULT_CITY_PROSPERITY.cityTier).toBe("village");
      expect(DEFAULT_CITY_PROSPERITY.tradeRevenue).toBe(0);
      expect(DEFAULT_CITY_PROSPERITY.donationRevenue).toBe(0);
      expect(DEFAULT_CITY_PROSPERITY.growthRate).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("handles state with no buildings", () => {
      const state = withBuildings(createInitialState(), []);
      const prosperity = calculateProsperity(state);
      expect(prosperity).toBeGreaterThanOrEqual(0);
      const capacity = calculateVisitorCapacity(state);
      expect(capacity).toBeGreaterThanOrEqual(1);
    });

    it("handles state with no factions", () => {
      const state = { ...createInitialState(), factions: {} as GameState["factions"] };
      // Should not throw
      const prosperity = calculateProsperity(state);
      expect(prosperity).toBeGreaterThanOrEqual(0);
    });

    it("handles max prosperity score", () => {
      let state = createInitialState();
      state = withReputation(state, 100);
      state = withFactionCredibility(state, 100);
      state = withTreasuryCompleted(state, 10);
      state = withBuildings(state, [
        makeBuilding("inner_sanctum"),
        makeBuilding("library"),
        makeBuilding("scriptorium"),
        makeBuilding("sacred_theater"),
        makeBuilding("treasury_of_nations"),
        makeBuilding("stoa_of_columns")
      ]);
      const prosperity = calculateProsperity(state);
      expect(prosperity).toBeLessThanOrEqual(100);
    });

    it("processVisitorEconomy works with default city prosperity", () => {
      const state = createInitialState();
      // Should not throw even without cityProsperity initialized
      const result = processVisitorEconomy(state);
      expect(result.state).toBeDefined();
      expect(result.events).toBeDefined();
    });

    it("applyOracleImpact works with default city prosperity", () => {
      const state = createInitialState();
      const result = applyOracleImpact(state, { kind: "crisis_resolved" });
      expect(result.cityProsperity).toBeDefined();
      expect(result.cityProsperity!.prosperityScore).toBe(
        DEFAULT_CITY_PROSPERITY.prosperityScore + 10
      );
    });
  });
});
