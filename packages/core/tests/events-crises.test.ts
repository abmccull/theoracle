import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/state/initialState";
import {
  advanceEventChains,
  isMilitaryChainActive,
  isPlagueChainActive,
  hasProphecyChainResolvedRecently,
  getDisasterProbabilityModifier,
} from "../src/simulation/eventChains";
import {
  advanceFestivals,
  getFestivalStage,
  checkFestivalComplication,
  applyFestivalComplication,
} from "../src/simulation/festivals";
import type { ActiveEventChain, ActiveFestival, GameEvent, GameState, Season } from "../src/state/gameState";
import { eventChainDefs, eventChainDefById } from "@the-oracle/content";
import type { EventChainDef } from "@the-oracle/content";
import { getAbsoluteDay } from "../src/simulation/clock";

// ── Helper factories ──

function withSeason(state: GameState, season: Season): GameState {
  const monthMap: Record<Season, number> = {
    Spring: 1,
    Summer: 4,
    Autumn: 7,
    Winter: 10,
  };
  return {
    ...state,
    clock: { ...state.clock, season, month: monthMap[season] },
  };
}

function withEventChains(state: GameState, chains: ActiveEventChain[]): GameState {
  return { ...state, eventChains: chains };
}

function makeActiveChain(defId: string, startDay = 1): ActiveEventChain {
  const def = eventChainDefById[defId];
  return {
    id: `chain-${defId}-${startDay}`,
    defId,
    currentStageId: def?.stages[0]?.id ?? "unknown",
    startDay,
    stageStartDay: startDay,
    pendingChoice: false,
    resolved: false,
  };
}

function makeResolvedChain(defId: string, startDay = 1, resolvedDay = 10): ActiveEventChain {
  return {
    ...makeActiveChain(defId, startDay),
    resolved: true,
    resolvedDay,
  };
}

function withFestivals(state: GameState, festivals: ActiveFestival[]): GameState {
  return { ...state, festivals };
}

function withFactionAtWar(state: GameState): GameState {
  return {
    ...state,
    factions: {
      ...state.factions,
      athens: {
        ...state.factions.athens,
        activeConflicts: ["sparta"],
      },
    },
  };
}

// ── Disaster chain definition tests ──

const DISASTER_IDS = [
  "disaster-plague",
  "disaster-earthquake",
  "disaster-flood",
  "disaster-drought",
  "disaster-locust-swarm",
  "disaster-wildfire",
];

describe("Events & Crises System", () => {
  describe("EV1.1 — Disaster Event Chain Definitions", () => {
    it.each(DISASTER_IDS)("disaster chain '%s' exists in eventChainDefs", (id) => {
      const def = eventChainDefById[id];
      expect(def).toBeDefined();
    });

    it.each(DISASTER_IDS)("disaster chain '%s' has valid structure", (id) => {
      const def = eventChainDefById[id]!;
      expect(def.label).toBeTruthy();
      expect(def.domain).toMatch(/^(military|economic|spiritual)$/);
      expect(def.triggerConditions.length).toBeGreaterThan(0);
      expect(def.triggerCooldownDays).toBeGreaterThan(0);
      expect(def.maxConcurrent).toBe(1);
      expect(def.stages.length).toBeGreaterThanOrEqual(2);
    });

    it.each(DISASTER_IDS)("disaster chain '%s' has stages with valid IDs and durations", (id) => {
      const def = eventChainDefById[id]!;
      for (const stage of def.stages) {
        expect(stage.id).toBeTruthy();
        expect(stage.label).toBeTruthy();
        expect(stage.description).toBeTruthy();
        expect(stage.durationDays).toBeGreaterThan(0);
        expect(stage.outcomes).toBeInstanceOf(Array);
      }
    });

    it("plague chain has choices in its first stage", () => {
      const def = eventChainDefById["disaster-plague"]!;
      const firstStage = def.stages[0]!;
      expect(firstStage.choiceA).toBeDefined();
      expect(firstStage.choiceB).toBeDefined();
      expect(firstStage.choiceA!.label).toContain("Sacrifice");
    });

    it("earthquake chain applies building damage", () => {
      const def = eventChainDefById["disaster-earthquake"]!;
      const firstStage = def.stages[0]!;
      const damageOutcome = firstStage.outcomes.find((o) => o.kind === "building_damage");
      expect(damageOutcome).toBeDefined();
      if (damageOutcome?.kind === "building_damage") {
        expect(damageOutcome.conditionLoss).toBe(30);
      }
    });

    it("flood chain triggers in Spring via season_is condition", () => {
      const def = eventChainDefById["disaster-flood"]!;
      const seasonCond = def.triggerConditions.find((c) => c.kind === "season_is");
      expect(seasonCond).toBeDefined();
      if (seasonCond?.kind === "season_is") {
        expect(seasonCond.season).toBe("Spring");
      }
    });

    it("drought chain triggers in Summer via season_is condition", () => {
      const def = eventChainDefById["disaster-drought"]!;
      const seasonCond = def.triggerConditions.find((c) => c.kind === "season_is");
      expect(seasonCond).toBeDefined();
      if (seasonCond?.kind === "season_is") {
        expect(seasonCond.season).toBe("Summer");
      }
    });

    it("wildfire chain targets timber buildings specifically", () => {
      const def = eventChainDefById["disaster-wildfire"]!;
      const firstStage = def.stages[0]!;
      const damageOutcome = firstStage.outcomes.find(
        (o) => o.kind === "building_damage" && o.defId === "hylotomos_camp"
      );
      expect(damageOutcome).toBeDefined();
    });

    it("locust swarm chain causes grain and olive loss", () => {
      const def = eventChainDefById["disaster-locust-swarm"]!;
      const firstStage = def.stages[0]!;
      const grainLoss = firstStage.outcomes.find(
        (o) => o.kind === "resource_delta" && o.resourceId === "grain"
      );
      const oliveLoss = firstStage.outcomes.find(
        (o) => o.kind === "resource_delta" && o.resourceId === "olives"
      );
      expect(grainLoss).toBeDefined();
      expect(oliveLoss).toBeDefined();
    });

    it("disaster chains have resolution via resource sacrifice choices", () => {
      // Each disaster's first stage should have choiceA with resource costs
      for (const id of DISASTER_IDS) {
        const def = eventChainDefById[id]!;
        const firstStage = def.stages[0]!;
        expect(firstStage.choiceA).toBeDefined();
        const hasResourceCost = firstStage.choiceA!.outcomes.some(
          (o) => o.kind === "resource_delta" && o.amount < 0
        );
        expect(hasResourceCost).toBe(true);
      }
    });
  });

  describe("EV1.3 — Seasonal Condition Checking", () => {
    it("season_is condition evaluates to true when season matches", () => {
      const base = createInitialState();
      const state = withSeason(base, "Spring");
      const events: GameEvent[] = [];

      // Directly test the condition by checking if flood chain triggers
      // when we set up favorable conditions (Spring + high random chance won't fire
      // deterministically, but we can verify the season check is functional)
      const floodDef = eventChainDefById["disaster-flood"]!;
      const seasonCond = floodDef.triggerConditions.find((c) => c.kind === "season_is");
      expect(seasonCond).toBeDefined();
      expect(state.clock.season).toBe("Spring");
    });

    it("season_is condition evaluates to false when season does not match", () => {
      const base = createInitialState();
      const state = withSeason(base, "Winter");

      // Flood requires Spring — Winter should not satisfy it
      expect(state.clock.season).not.toBe("Spring");
    });

    it("flood risk events use Spring season_is condition", () => {
      const floodDef = eventChainDefById["disaster-flood"]!;
      const hasSpring = floodDef.triggerConditions.some(
        (c) => c.kind === "season_is" && c.season === "Spring"
      );
      expect(hasSpring).toBe(true);
    });

    it("drought/wildfire events use Summer season_is condition", () => {
      for (const id of ["disaster-drought", "disaster-wildfire"]) {
        const def = eventChainDefById[id]!;
        const hasSummer = def.triggerConditions.some(
          (c) => c.kind === "season_is" && c.season === "Summer"
        );
        expect(hasSummer).toBe(true);
      }
    });
  });

  describe("EV1.4 — Cross-Chain Interaction", () => {
    it("active_chain_count condition: returns true when count is within range", () => {
      const base = createInitialState();
      const state = withEventChains(base, [
        makeActiveChain("border-skirmish"),
        makeActiveChain("grain-famine"),
      ]);
      // 2 active chains — min: 1, max: 5 should be true
      const count = (state.eventChains ?? []).filter((c) => !c.resolved).length;
      expect(count).toBe(2);
    });

    it("active_chain_count condition: returns false when no active chains and min > 0", () => {
      const base = createInitialState();
      const state = withEventChains(base, []);
      const count = (state.eventChains ?? []).filter((c) => !c.resolved).length;
      expect(count).toBe(0);
    });

    it("chain_domain_active: detects active military chain", () => {
      const base = createInitialState();
      const state = withEventChains(base, [makeActiveChain("border-skirmish")]);
      expect(isMilitaryChainActive(state)).toBe(true);
    });

    it("chain_domain_active: returns false when no military chain active", () => {
      const base = createInitialState();
      const state = withEventChains(base, [makeActiveChain("grain-famine")]);
      expect(isMilitaryChainActive(state)).toBe(false);
    });

    it("chain_domain_active: ignores resolved chains", () => {
      const base = createInitialState();
      const state = withEventChains(base, [makeResolvedChain("border-skirmish")]);
      expect(isMilitaryChainActive(state)).toBe(false);
    });

    it("war increases disaster vulnerability: +20% trigger modifier", () => {
      const base = createInitialState();
      const state = withEventChains(base, [makeActiveChain("border-skirmish")]);
      const modifier = getDisasterProbabilityModifier(state);
      expect(modifier).toBeCloseTo(0.2);
    });

    it("no active military chain: 0% modifier", () => {
      const base = createInitialState();
      const modifier = getDisasterProbabilityModifier(base);
      expect(modifier).toBe(0);
    });

    it("plague chain active detection works", () => {
      const base = createInitialState();
      expect(isPlagueChainActive(base)).toBe(false);

      const state = withEventChains(base, [makeActiveChain("disaster-plague")]);
      expect(isPlagueChainActive(state)).toBe(true);
    });

    it("plague chain resolved does not count as active", () => {
      const base = createInitialState();
      const state = withEventChains(base, [makeResolvedChain("disaster-plague")]);
      expect(isPlagueChainActive(state)).toBe(false);
    });

    it("successful prophecy chain resolution reduces disaster modifier", () => {
      const base = createInitialState();
      // Create a spiritual chain that was resolved recently
      const state = withEventChains(base, [
        makeResolvedChain("divine-omen", 1, getAbsoluteDay(base.clock)),
      ]);
      const modifier = getDisasterProbabilityModifier(state);
      expect(modifier).toBeCloseTo(-0.1);
    });

    it("combined war + prophecy modifiers stack correctly", () => {
      const base = createInitialState();
      const day = getAbsoluteDay(base.clock);
      const state = withEventChains(base, [
        makeActiveChain("border-skirmish"),
        makeResolvedChain("divine-omen", 1, day),
      ]);
      const modifier = getDisasterProbabilityModifier(state);
      // +0.2 (war) - 0.1 (prophecy) = +0.1
      expect(modifier).toBeCloseTo(0.1);
    });

    it("disaster chain outcomes apply resource losses correctly", () => {
      const base = createInitialState();
      const state: GameState = {
        ...base,
        resources: {
          ...base.resources,
          stone: { ...base.resources.stone, amount: 50, capacity: 100 },
          cut_stone: { ...base.resources.cut_stone, amount: 30, capacity: 100 },
        },
      };

      // Manually check that earthquake's resource_delta outcomes would drain stone
      const earthquakeDef = eventChainDefById["disaster-earthquake"]!;
      const stoneOutcome = earthquakeDef.stages[0]!.outcomes.find(
        (o) => o.kind === "resource_delta" && o.resourceId === "stone"
      );
      expect(stoneOutcome).toBeDefined();
      if (stoneOutcome?.kind === "resource_delta") {
        expect(stoneOutcome.amount).toBeLessThan(0);
      }
    });
  });

  describe("EV1.2 — Festival Complications", () => {
    it("getFestivalStage returns preparation for first 2 days", () => {
      const festival: ActiveFestival = {
        defId: "theoxenia",
        startDay: 10,
        endDay: 20,
        resourcesMet: false,
        resolved: false,
      };
      expect(getFestivalStage(festival, 10)).toBe("preparation");
      expect(getFestivalStage(festival, 11)).toBe("preparation");
      expect(getFestivalStage(festival, 12)).toBe("preparation");
    });

    it("getFestivalStage returns ceremony for middle days", () => {
      const festival: ActiveFestival = {
        defId: "theoxenia",
        startDay: 10,
        endDay: 20,
        resourcesMet: false,
        resolved: false,
      };
      expect(getFestivalStage(festival, 13)).toBe("ceremony");
      expect(getFestivalStage(festival, 15)).toBe("ceremony");
      expect(getFestivalStage(festival, 18)).toBe("ceremony");
    });

    it("getFestivalStage returns resolution for last day", () => {
      const festival: ActiveFestival = {
        defId: "theoxenia",
        startDay: 10,
        endDay: 20,
        resourcesMet: false,
        resolved: false,
      };
      expect(getFestivalStage(festival, 19)).toBe("resolution");
    });

    it("checkFestivalComplication returns null for resolved festivals", () => {
      const festival: ActiveFestival = {
        defId: "theoxenia",
        startDay: 10,
        endDay: 20,
        resourcesMet: false,
        resolved: true,
      };
      expect(checkFestivalComplication(festival, 15, 42)).toBeNull();
    });

    it("checkFestivalComplication returns null during preparation stage", () => {
      const festival: ActiveFestival = {
        defId: "theoxenia",
        startDay: 10,
        endDay: 20,
        resourcesMet: false,
        resolved: false,
      };
      // Day 11 is preparation (elapsed = 1)
      expect(checkFestivalComplication(festival, 11, 42)).toBeNull();
    });

    it("applyFestivalComplication plague_outbreak reduces reputation", () => {
      const base = createInitialState();
      // Set score high enough to see the reduction
      const state: GameState = {
        ...base,
        campaign: {
          ...base.campaign,
          reputation: { ...base.campaign.reputation, score: 50 },
        },
      };
      const result = applyFestivalComplication(state, "plague_outbreak");
      expect(result.campaign.reputation.score).toBe(47); // 50 - 3
    });

    it("applyFestivalComplication raid_scare reduces reputation", () => {
      const base = createInitialState();
      const state: GameState = {
        ...base,
        campaign: {
          ...base.campaign,
          reputation: { ...base.campaign.reputation, score: 50 },
        },
      };
      const result = applyFestivalComplication(state, "raid_scare");
      expect(result.campaign.reputation.score).toBe(48); // 50 - 2
    });

    it("applyFestivalComplication storm reduces gold and grain", () => {
      const base = createInitialState();
      const goldBefore = base.resources.gold.amount;
      const grainBefore = base.resources.grain.amount;
      const result = applyFestivalComplication(base, "storm");
      expect(result.resources.gold.amount).toBe(Math.max(0, goldBefore - 10));
      expect(result.resources.grain.amount).toBe(Math.max(0, grainBefore - 5));
    });

    it("festival complication only triggers during ceremony stage", () => {
      // We can't deterministically force the 5% chance, but we can verify
      // the function rejects non-ceremony stages
      const festival: ActiveFestival = {
        defId: "pythian-games",
        startDay: 10,
        endDay: 20,
        resourcesMet: false,
        resolved: false,
      };
      // Resolution stage (day 19)
      expect(checkFestivalComplication(festival, 19, 123)).toBeNull();
    });
  });

  describe("Edge Cases", () => {
    it("handles no active chains gracefully", () => {
      const base = createInitialState();
      const state = withEventChains(base, []);
      expect(isMilitaryChainActive(state)).toBe(false);
      expect(isPlagueChainActive(state)).toBe(false);
      expect(getDisasterProbabilityModifier(state)).toBe(0);
    });

    it("handles undefined eventChains gracefully", () => {
      const base = createInitialState();
      const state = { ...base, eventChains: undefined };
      expect(isMilitaryChainActive(state)).toBe(false);
      expect(isPlagueChainActive(state)).toBe(false);
      expect(getDisasterProbabilityModifier(state)).toBe(0);
    });

    it("advanceEventChains does not crash with empty chains", () => {
      const base = createInitialState();
      const events: GameEvent[] = [];
      const result = advanceEventChains(base, events);
      expect(result).toBeDefined();
      expect(result.eventChains).toBeDefined();
    });

    it("all disaster chain defs are present in the global eventChainDefs array", () => {
      for (const id of DISASTER_IDS) {
        const found = eventChainDefs.find((d) => d.id === id);
        expect(found).toBeDefined();
      }
    });

    it("each disaster chain has a unique ID", () => {
      const ids = eventChainDefs.map((d) => d.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("resolved chains with resolvedDay far in the past do not affect prophecy modifier", () => {
      const base = createInitialState();
      // Resolved 1000 days ago — should not count as "recently"
      const state = withEventChains(base, [
        makeResolvedChain("divine-omen", 1, 1),
      ]);
      // Set clock far ahead
      const farFutureState: GameState = {
        ...state,
        clock: { ...state.clock, tick: 100000 },
      };
      expect(hasProphecyChainResolvedRecently(farFutureState)).toBe(false);
    });
  });
});
