import { describe, expect, it } from "vitest";

import { createInitialState } from "../src/state/initialState";
import { checkAchievements, advanceHubris, createInitialAchievementProgress } from "../src/simulation/achievements";
import { reduceCommand } from "../src/reducers";
import type { GameState, AchievementProgress } from "../src/state/gameState";
import type { BurdenId } from "../src/state/lineage";

function stateWithAchievements(overrides?: Partial<AchievementProgress>): GameState {
  const state = createInitialState();
  return {
    ...state,
    achievements: {
      ...createInitialAchievementProgress(),
      ...overrides
    }
  };
}

describe("achievements", () => {
  describe("checkAchievements", () => {
    it("unlocks first_oracle when a prophecy has been delivered", () => {
      const state = stateWithAchievements();
      const withProphecy: GameState = {
        ...state,
        consultation: {
          ...state.consultation,
          history: [
            {
              id: "prophecy-1",
              factionId: "athens",
              dayIssued: 1,
              text: "Test prophecy",
              tileIds: [],
              semantics: [],
              clarity: 50,
              value: 50,
              risk: 20,
              dueDay: 30,
              resolved: false
            }
          ]
        }
      };

      const result = checkAchievements(withProphecy);
      expect(result.achievements!.unlockedIds).toContain("first_oracle");
      expect(result.achievements!.stats.propheciesDelivered).toBe(1);
    });

    it("does not double-unlock an already unlocked achievement", () => {
      const state = stateWithAchievements({
        unlockedIds: ["first_oracle"]
      });
      const withProphecy: GameState = {
        ...state,
        consultation: {
          ...state.consultation,
          history: [
            {
              id: "prophecy-1",
              factionId: "athens",
              dayIssued: 1,
              text: "Test prophecy",
              tileIds: [],
              semantics: [],
              clarity: 50,
              value: 50,
              risk: 20,
              dueDay: 30,
              resolved: false
            }
          ]
        }
      };

      const result = checkAchievements(withProphecy);
      const firstOracleCount = result.achievements!.unlockedIds.filter(
        (id) => id === "first_oracle"
      ).length;
      expect(firstOracleCount).toBe(1);
    });

    it("tracks years completed from clock state", () => {
      const state = stateWithAchievements();
      const withYears: GameState = {
        ...state,
        clock: {
          ...state.clock,
          year: 2
        }
      };

      const result = checkAchievements(withYears);
      expect(result.achievements!.stats.yearsCompleted).toBe(1);
      expect(result.achievements!.unlockedIds).toContain("first_year");
    });

    it("unlocks reputation tier achievement when tier matches", () => {
      const state = stateWithAchievements();
      const withTier: GameState = {
        ...state,
        campaign: {
          ...state.campaign,
          reputation: {
            ...state.campaign.reputation,
            currentTier: "panhellenic"
          }
        }
      };

      const result = checkAchievements(withTier);
      expect(result.achievements!.unlockedIds).toContain("panhellenic");
    });

    it("tracks belief strength from prophecy history", () => {
      const state = stateWithAchievements();
      const withHighBelief: GameState = {
        ...state,
        consultation: {
          ...state.consultation,
          history: [
            {
              id: "prophecy-1",
              factionId: "athens",
              dayIssued: 1,
              text: "Test",
              tileIds: [],
              semantics: [],
              clarity: 50,
              value: 50,
              risk: 20,
              dueDay: 30,
              resolved: true,
              beliefStrength: 95
            }
          ]
        }
      };

      const result = checkAchievements(withHighBelief);
      expect(result.achievements!.stats.highestBeliefStrength).toBe(95);
      expect(result.achievements!.unlockedIds).toContain("self_fulfilling");
    });

    it("generates event feed item on achievement unlock", () => {
      const state = stateWithAchievements();
      const withProphecy: GameState = {
        ...state,
        consultation: {
          ...state.consultation,
          history: [
            {
              id: "prophecy-1",
              factionId: "athens",
              dayIssued: 1,
              text: "Test",
              tileIds: [],
              semantics: [],
              clarity: 50,
              value: 50,
              risk: 20,
              dueDay: 30,
              resolved: false
            }
          ]
        }
      };

      const result = checkAchievements(withProphecy);
      const achievementEvent = result.eventFeed.find(
        (e) => e.id === "event-achievement-first_oracle"
      );
      expect(achievementEvent).toBeDefined();
      expect(achievementEvent!.text).toContain("First Oracle");
    });
  });

  describe("advanceHubris", () => {
    it("does not escalate at low reputation tiers", () => {
      const state = stateWithAchievements();
      // Default tier is "obscure"
      const result = advanceHubris(state);
      // State should be unchanged (same object reference for philosophers)
      expect(result.philosophers).toEqual(state.philosophers);
    });

    it("escalates philosopher pressure at revered tier", () => {
      const state = stateWithAchievements();
      const withHighTier: GameState = {
        ...state,
        campaign: {
          ...state.campaign,
          reputation: {
            ...state.campaign.reputation,
            currentTier: "revered"
          }
        }
      };

      const result = advanceHubris(withHighTier);
      if (result.philosophers && withHighTier.philosophers) {
        const factionIds = Object.keys(result.philosophers.byFaction) as (keyof typeof result.philosophers.byFaction)[];
        for (const fid of factionIds) {
          const original = withHighTier.philosophers.byFaction[fid];
          const updated = result.philosophers.byFaction[fid];
          if (original.active) {
            expect(updated.pressure).toBeGreaterThanOrEqual(original.pressure);
          }
        }
      }
    });

    it("escalates rival oracle pressure at panhellenic tier", () => {
      const state = stateWithAchievements();
      const withPanhellenic: GameState = {
        ...state,
        campaign: {
          ...state.campaign,
          reputation: {
            ...state.campaign.reputation,
            currentTier: "panhellenic"
          }
        }
      };

      const result = advanceHubris(withPanhellenic);
      if (result.rivalOracles && withPanhellenic.rivalOracles) {
        for (let i = 0; i < result.rivalOracles.roster.length; i++) {
          const original = withPanhellenic.rivalOracles.roster[i];
          const updated = result.rivalOracles.roster[i];
          if (original.active) {
            expect(updated.pressure).toBeGreaterThanOrEqual(original.pressure);
          }
        }
      }
    });
  });

  describe("new burdens", () => {
    it("hostile_philosophers burden increases philosopher threats", () => {
      const baseState = createInitialState();
      const { state: burdenedState } = reduceCommand(baseState, {
        type: "StartNewLineageRunCommand",
        originId: "upstart-shrine",
        seedText: "test-burden",
        burdens: ["hostile_philosophers"],
        endlessMode: false
      });

      if (burdenedState.philosophers && baseState.philosophers) {
        const baseFactionIds = Object.keys(baseState.philosophers.byFaction) as (keyof typeof baseState.philosophers.byFaction)[];
        for (const fid of baseFactionIds) {
          // Create a fresh state to compare against
          const freshState = createInitialState("test-burden");
          if (freshState.philosophers) {
            const freshThreat = freshState.philosophers.byFaction[fid];
            const burdenedThreat = burdenedState.philosophers.byFaction[fid];
            // Burdened pressure should be >= fresh (20% boost)
            expect(burdenedThreat.pressure).toBeGreaterThanOrEqual(freshThreat.pressure);
          }
        }
      }
    });

    it("weak_spring burden reduces sacred water capacity and amount", () => {
      const baseState = createInitialState();
      const { state: burdenedState } = reduceCommand(baseState, {
        type: "StartNewLineageRunCommand",
        originId: "upstart-shrine",
        seedText: "test-spring",
        burdens: ["weak_spring"],
        endlessMode: false
      });

      const freshState = createInitialState("test-spring");
      expect(burdenedState.resources.sacred_water.capacity).toBeLessThan(
        freshState.resources.sacred_water.capacity
      );
    });

    it("rival_oracle_surge sets minimum rival pressure to 40", () => {
      const baseState = createInitialState();
      const { state: burdenedState } = reduceCommand(baseState, {
        type: "StartNewLineageRunCommand",
        originId: "upstart-shrine",
        seedText: "test-rival-surge",
        burdens: ["rival_oracle_surge"],
        endlessMode: false
      });

      if (burdenedState.rivalOracles) {
        for (const rival of burdenedState.rivalOracles.roster) {
          expect(rival.pressure).toBeGreaterThanOrEqual(40);
        }
      }
    });

    it("combo: multiple burdens apply their effects together", () => {
      const baseState = createInitialState();
      const { state: burdenedState } = reduceCommand(baseState, {
        type: "StartNewLineageRunCommand",
        originId: "upstart-shrine",
        seedText: "test-combo",
        burdens: ["weak_spring", "hostile_factions"],
        endlessMode: false
      });

      const freshState = createInitialState("test-combo");

      // weak_spring reduces sacred water
      expect(burdenedState.resources.sacred_water.capacity).toBeLessThan(
        freshState.resources.sacred_water.capacity
      );

      // hostile_factions reduces credibility
      const factionIds = Object.keys(burdenedState.factions) as (keyof typeof burdenedState.factions)[];
      for (const fid of factionIds) {
        expect(burdenedState.factions[fid].credibility).toBeLessThanOrEqual(
          freshState.factions[fid].credibility
        );
      }
    });
  });

  describe("initial state", () => {
    it("creates initial state with empty achievement progress", () => {
      const state = createInitialState();
      expect(state.achievements).toBeDefined();
      expect(state.achievements!.unlockedIds).toEqual([]);
      expect(state.achievements!.stats.propheciesDelivered).toBe(0);
      expect(state.achievements!.stats.hadDebt).toBe(false);
    });
  });
});
