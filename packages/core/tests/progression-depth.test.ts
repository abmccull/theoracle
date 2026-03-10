import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/state/initialState";
import {
  isGrandConsultationAvailable,
  activateGrandConsultation,
  resolveGrandConsultation,
  shouldTriggerSacredPilgrimage,
  startSacredPilgrimage,
  completeSacredPilgrimage,
  isPriestOnPilgrimage
} from "../src/simulation/events";
import {
  advanceCampaignState,
  syncCampaignState,
  ensureMilestones,
  checkBuildingMilestones,
  checkFactionTrustMilestones,
  checkAgeMilestones
} from "../src/state/campaign";
import {
  getGamePhase,
  getPacingModifier,
  getDisasterProbabilityModifier
} from "../src/simulation/eventChains";
import type { GameState, FactionState, FactionId, CampaignState, ProgressionMilestones } from "../src/state/gameState";

// ── Helper Factories ──

function baseState(): GameState {
  return createInitialState(42);
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

function withReputationTier(state: GameState, tier: "obscure" | "recognized" | "revered" | "panhellenic"): GameState {
  const scoreMap = { obscure: 5, recognized: 25, revered: 55, panhellenic: 90 };
  const updated = withReputation(state, scoreMap[tier]);
  return {
    ...updated,
    campaign: syncCampaignState(updated.campaign)
  };
}

function withBuildings(state: GameState, count: number): GameState {
  const buildings = Array.from({ length: count }, (_, i) => ({
    id: `building-${i}`,
    defId: "storehouse" as const,
    position: { x: 2 + i, y: 2 },
    condition: 100,
    maxCondition: 100,
    requiresPriest: false,
    assignedPriestIds: [] as string[],
    assignedWorkerIds: [] as string[],
    storedResources: {},
    connectedToRoad: true
  }));
  return { ...state, buildings };
}

function withFactionCredibility(state: GameState, factionId: FactionId, credibility: number): GameState {
  return {
    ...state,
    factions: {
      ...state.factions,
      [factionId]: {
        ...state.factions[factionId],
        credibility
      }
    }
  };
}

function withAge(state: GameState, ageId: string): GameState {
  return {
    ...state,
    age: {
      currentAgeId: ageId as any,
      currentAgeIndex: 0,
      ageHistory: [{ ageId: ageId as any, startYear: 1, startDay: 1 }],
      lastAgeCheckYear: 1
    }
  };
}

function withYear(state: GameState, year: number): GameState {
  return {
    ...state,
    clock: { ...state.clock, year }
  };
}

function withMilestones(state: GameState, milestones: Partial<ProgressionMilestones>): GameState {
  return {
    ...state,
    campaign: {
      ...state.campaign,
      milestones: {
        buildingMilestones: milestones.buildingMilestones ?? [],
        factionTrustMilestones: milestones.factionTrustMilestones ?? [],
        ageMilestones: milestones.ageMilestones ?? []
      }
    }
  };
}

function withGrandConsultation(state: GameState, active: boolean): GameState {
  return {
    ...state,
    campaign: {
      ...state.campaign,
      grandConsultationActive: active
    }
  };
}

// ── PR1.1: Decline Recovery Mechanics ──

describe("Progression Depth", () => {
  describe("PR1.1 — Grand Consultation", () => {
    it("is available when reputation is in obscure tier", () => {
      const state = withReputationTier(baseState(), "obscure");
      expect(isGrandConsultationAvailable(state)).toBe(true);
    });

    it("is not available when reputation is in recognized tier", () => {
      const state = withReputationTier(baseState(), "recognized");
      expect(isGrandConsultationAvailable(state)).toBe(false);
    });

    it("is not available when reputation is in revered tier", () => {
      const state = withReputationTier(baseState(), "revered");
      expect(isGrandConsultationAvailable(state)).toBe(false);
    });

    it("is not available when already active", () => {
      let state = withReputationTier(baseState(), "obscure");
      state = withGrandConsultation(state, true);
      expect(isGrandConsultationAvailable(state)).toBe(false);
    });

    it("activateGrandConsultation sets the flag on campaign state", () => {
      const state = withReputationTier(baseState(), "obscure");
      const activated = activateGrandConsultation(state);
      expect(activated.campaign.grandConsultationActive).toBe(true);
    });

    it("deep prophecy grants +15 reputation bonus", () => {
      let state = withReputationTier(baseState(), "obscure");
      state = withGrandConsultation(state, true);
      const before = state.campaign.reputation.score;
      const result = resolveGrandConsultation(state, "deep");
      expect(result.state.campaign.reputation.score).toBe(before + 15);
      expect(result.state.campaign.grandConsultationActive).toBe(false);
      expect(result.feedItems.length).toBe(1);
      expect(result.feedItems[0]!.text).toContain("succeeds");
    });

    it("oracular prophecy grants +15 reputation bonus", () => {
      let state = withReputationTier(baseState(), "obscure");
      state = withGrandConsultation(state, true);
      const before = state.campaign.reputation.score;
      const result = resolveGrandConsultation(state, "oracular");
      expect(result.state.campaign.reputation.score).toBe(before + 15);
    });

    it("shallow prophecy penalizes -10 reputation", () => {
      let state = withReputation(baseState(), 15);
      state = withGrandConsultation(state, true);
      const result = resolveGrandConsultation(state, "shallow");
      expect(result.state.campaign.reputation.score).toBe(5);
      expect(result.state.campaign.grandConsultationActive).toBe(false);
      expect(result.feedItems.length).toBe(1);
      expect(result.feedItems[0]!.text).toContain("fails");
    });

    it("grounded prophecy penalizes -10 reputation", () => {
      let state = withReputation(baseState(), 12);
      state = withGrandConsultation(state, true);
      const result = resolveGrandConsultation(state, "grounded");
      expect(result.state.campaign.reputation.score).toBe(2);
    });

    it("reputation cannot go below 0 on failure", () => {
      let state = withReputation(baseState(), 3);
      state = withGrandConsultation(state, true);
      const result = resolveGrandConsultation(state, "shallow");
      expect(result.state.campaign.reputation.score).toBe(0);
    });

    it("does nothing if grand consultation is not active", () => {
      const state = withReputationTier(baseState(), "obscure");
      const result = resolveGrandConsultation(state, "deep");
      expect(result.feedItems.length).toBe(0);
      expect(result.state).toBe(state);
    });
  });

  // ── PR1.1: Sacred Pilgrimage ──

  describe("PR1.1 — Sacred Pilgrimage", () => {
    it("triggers when reputation is below revered tier", () => {
      const state = withReputationTier(baseState(), "recognized");
      // Use a seed that produces hash < 0.10
      // We test multiple seeds to find one that triggers
      let triggered = false;
      for (let seed = 0; seed < 200; seed++) {
        if (shouldTriggerSacredPilgrimage(state, seed)) {
          triggered = true;
          break;
        }
      }
      expect(triggered).toBe(true);
    });

    it("does not trigger when reputation is revered", () => {
      const state = withReputationTier(baseState(), "revered");
      let triggered = false;
      for (let seed = 0; seed < 200; seed++) {
        if (shouldTriggerSacredPilgrimage(state, seed)) {
          triggered = true;
          break;
        }
      }
      expect(triggered).toBe(false);
    });

    it("does not trigger when reputation is panhellenic", () => {
      const state = withReputationTier(baseState(), "panhellenic");
      let triggered = false;
      for (let seed = 0; seed < 200; seed++) {
        if (shouldTriggerSacredPilgrimage(state, seed)) {
          triggered = true;
          break;
        }
      }
      expect(triggered).toBe(false);
    });

    it("does not trigger when already on pilgrimage", () => {
      let state = withReputationTier(baseState(), "recognized");
      state = {
        ...state,
        campaign: {
          ...state.campaign,
          sacredPilgrimage: { priestId: "p1", returnDay: 100 }
        }
      };
      let triggered = false;
      for (let seed = 0; seed < 200; seed++) {
        if (shouldTriggerSacredPilgrimage(state, seed)) {
          triggered = true;
          break;
        }
      }
      expect(triggered).toBe(false);
    });

    it("does not trigger with no priests", () => {
      let state = withReputationTier(baseState(), "recognized");
      state = { ...state, priests: [] };
      let triggered = false;
      for (let seed = 0; seed < 200; seed++) {
        if (shouldTriggerSacredPilgrimage(state, seed)) {
          triggered = true;
          break;
        }
      }
      expect(triggered).toBe(false);
    });

    it("startSacredPilgrimage marks priest and sets return day", () => {
      const state = withReputationTier(baseState(), "recognized");
      const result = startSacredPilgrimage(state);
      expect(result.state.campaign.sacredPilgrimage).toBeDefined();
      expect(result.state.campaign.sacredPilgrimage!.priestId).toBe(state.priests[0]!.id);
      expect(result.state.campaign.sacredPilgrimage!.returnDay).toBeGreaterThan(0);
      expect(result.feedItems.length).toBe(1);
      expect(result.feedItems[0]!.text).toContain("Sacred Pilgrimage");
    });

    it("completeSacredPilgrimage grants +8 reputation", () => {
      let state = withReputation(baseState(), 30);
      // Set up a pilgrimage that's ready to return
      const absoluteDay = (state.clock.year - 1) * 360 + (state.clock.month - 1) * 30 + state.clock.day;
      state = {
        ...state,
        campaign: {
          ...state.campaign,
          sacredPilgrimage: { priestId: state.priests[0]!.id, returnDay: absoluteDay - 1 }
        }
      };
      const result = completeSacredPilgrimage(state);
      expect(result.state.campaign.reputation.score).toBe(38);
      expect(result.state.campaign.sacredPilgrimage).toBeUndefined();
      expect(result.feedItems.length).toBe(1);
      expect(result.feedItems[0]!.text).toContain("concludes");
    });

    it("completeSacredPilgrimage does nothing if return day not reached", () => {
      let state = withReputation(baseState(), 30);
      const absoluteDay = (state.clock.year - 1) * 360 + (state.clock.month - 1) * 30 + state.clock.day;
      state = {
        ...state,
        campaign: {
          ...state.campaign,
          sacredPilgrimage: { priestId: state.priests[0]!.id, returnDay: absoluteDay + 10 }
        }
      };
      const result = completeSacredPilgrimage(state);
      expect(result.state.campaign.reputation.score).toBe(30);
      expect(result.feedItems.length).toBe(0);
    });

    it("isPriestOnPilgrimage returns correct status", () => {
      let state = baseState();
      state = {
        ...state,
        campaign: {
          ...state.campaign,
          sacredPilgrimage: { priestId: "priest-1", returnDay: 100 }
        }
      };
      expect(isPriestOnPilgrimage(state, "priest-1")).toBe(true);
      expect(isPriestOnPilgrimage(state, "priest-2")).toBe(false);
    });
  });

  // ── PR1.2: Mid-Game Milestones ──

  describe("PR1.2 — Building Milestones", () => {
    it("triggers at 10 buildings", () => {
      const state = withBuildings(baseState(), 10);
      const milestones = ensureMilestones();
      const result = checkBuildingMilestones(state, milestones, 1);
      expect(result.milestones.buildingMilestones).toContain(10);
      expect(result.prestigeBonus).toBe(3);
      expect(result.feedItems.length).toBe(1);
    });

    it("triggers at 20 buildings", () => {
      const state = withBuildings(baseState(), 20);
      const milestones = ensureMilestones({ buildingMilestones: [10] });
      const result = checkBuildingMilestones(state, milestones, 1);
      expect(result.milestones.buildingMilestones).toContain(20);
      expect(result.prestigeBonus).toBe(3);
    });

    it("triggers multiple milestones at once for 30 buildings with no prior milestones", () => {
      const state = withBuildings(baseState(), 30);
      const milestones = ensureMilestones();
      const result = checkBuildingMilestones(state, milestones, 1);
      expect(result.milestones.buildingMilestones).toEqual(expect.arrayContaining([10, 20, 30]));
      expect(result.prestigeBonus).toBe(9); // 3 per milestone
      expect(result.feedItems.length).toBe(3);
    });

    it("does not re-trigger already reached milestones", () => {
      const state = withBuildings(baseState(), 15);
      const milestones = ensureMilestones({ buildingMilestones: [10] });
      const result = checkBuildingMilestones(state, milestones, 1);
      expect(result.milestones.buildingMilestones).toEqual([10]);
      expect(result.prestigeBonus).toBe(0);
      expect(result.feedItems.length).toBe(0);
    });
  });

  describe("PR1.2 — Faction Trust Milestones", () => {
    it("triggers when faction credibility >= 80", () => {
      const state = withFactionCredibility(baseState(), "athens", 82);
      const milestones = ensureMilestones();
      const result = checkFactionTrustMilestones(state.factions, milestones, 1);
      expect(result.milestones.factionTrustMilestones).toContain("athens");
      expect(result.goldReward).toBe(10);
      expect(result.feedItems.length).toBe(1);
      expect(result.feedItems[0]!.text).toContain("deep trust");
    });

    it("does not trigger below 80 credibility", () => {
      const state = withFactionCredibility(baseState(), "athens", 75);
      const milestones = ensureMilestones();
      const result = checkFactionTrustMilestones(state.factions, milestones, 1);
      expect(result.milestones.factionTrustMilestones).not.toContain("athens");
      expect(result.goldReward).toBe(0);
    });

    it("does not re-trigger already tracked faction", () => {
      const state = withFactionCredibility(baseState(), "athens", 85);
      const milestones = ensureMilestones({ factionTrustMilestones: ["athens"] });
      const result = checkFactionTrustMilestones(state.factions, milestones, 1);
      expect(result.goldReward).toBe(0);
      expect(result.feedItems.length).toBe(0);
    });

    it("triggers for multiple factions simultaneously", () => {
      let state = withFactionCredibility(baseState(), "athens", 85);
      state = withFactionCredibility(state, "sparta", 80);
      const milestones = ensureMilestones();
      const result = checkFactionTrustMilestones(state.factions, milestones, 1);
      expect(result.milestones.factionTrustMilestones).toContain("athens");
      expect(result.milestones.factionTrustMilestones).toContain("sparta");
      expect(result.goldReward).toBe(20);
    });
  });

  describe("PR1.2 — Age Transition Milestones", () => {
    it("grants +5 reputation on archaic→classical transition", () => {
      const state = withAge(baseState(), "classical");
      const milestones = ensureMilestones({ ageMilestones: ["archaic"] });
      const result = checkAgeMilestones(state, milestones, 1);
      expect(result.reputationBonus).toBe(5);
      expect(result.milestones.ageMilestones).toContain("classical");
      expect(result.feedItems.length).toBe(1);
      expect(result.feedItems[0]!.text).toContain("Classical Age");
    });

    it("grants +10 reputation on classical→hellenic transition", () => {
      const state = withAge(baseState(), "hellenic");
      const milestones = ensureMilestones({ ageMilestones: ["archaic", "classical"] });
      const result = checkAgeMilestones(state, milestones, 1);
      expect(result.reputationBonus).toBe(10);
      expect(result.milestones.ageMilestones).toContain("hellenic");
    });

    it("grants +10 reputation on hellenistic transition", () => {
      const state = withAge(baseState(), "hellenistic");
      const milestones = ensureMilestones({ ageMilestones: ["archaic", "classical", "hellenic"] });
      const result = checkAgeMilestones(state, milestones, 1);
      expect(result.reputationBonus).toBe(10);
      expect(result.milestones.ageMilestones).toContain("hellenistic");
    });

    it("does not re-trigger already tracked age milestone", () => {
      const state = withAge(baseState(), "classical");
      const milestones = ensureMilestones({ ageMilestones: ["archaic", "classical"] });
      const result = checkAgeMilestones(state, milestones, 1);
      expect(result.reputationBonus).toBe(0);
      expect(result.feedItems.length).toBe(0);
    });

    it("returns zero bonus when no age state exists", () => {
      const state = baseState();
      const noAge = { ...state, age: undefined };
      const milestones = ensureMilestones();
      const result = checkAgeMilestones(noAge, milestones, 1);
      expect(result.reputationBonus).toBe(0);
    });
  });

  // ── PR1.3: Campaign Pacing ──

  describe("PR1.3 — Game Phase Detection", () => {
    it("year 1 is early phase", () => {
      expect(getGamePhase(1)).toBe("early");
    });

    it("year 3 is early phase", () => {
      expect(getGamePhase(3)).toBe("early");
    });

    it("year 4 is mid phase", () => {
      expect(getGamePhase(4)).toBe("mid");
    });

    it("year 5 is mid phase", () => {
      expect(getGamePhase(5)).toBe("mid");
    });

    it("year 8 is mid phase", () => {
      expect(getGamePhase(8)).toBe("mid");
    });

    it("year 9 is late phase", () => {
      expect(getGamePhase(9)).toBe("late");
    });

    it("year 10 is late phase", () => {
      expect(getGamePhase(10)).toBe("late");
    });

    it("year 20 is late phase", () => {
      expect(getGamePhase(20)).toBe("late");
    });
  });

  describe("PR1.3 — Pacing Modifiers", () => {
    it("early phase has crisisMod 0.5 (50% reduction)", () => {
      const mod = getPacingModifier("early");
      expect(mod.crisisMod).toBe(0.5);
    });

    it("early phase has conflictMod 0.8 (20% reduction)", () => {
      const mod = getPacingModifier("early");
      expect(mod.conflictMod).toBe(0.8);
    });

    it("mid phase has crisisMod 1.0 (normal)", () => {
      const mod = getPacingModifier("mid");
      expect(mod.crisisMod).toBe(1.0);
    });

    it("mid phase has conflictMod 1.2 (20% increase)", () => {
      const mod = getPacingModifier("mid");
      expect(mod.conflictMod).toBe(1.2);
    });

    it("late phase has crisisMod 1.5 (50% increase)", () => {
      const mod = getPacingModifier("late");
      expect(mod.crisisMod).toBe(1.5);
    });

    it("late phase has conflictMod 1.5 (50% increase)", () => {
      const mod = getPacingModifier("late");
      expect(mod.conflictMod).toBe(1.5);
    });
  });

  // ── Edge Cases ──

  describe("Edge Cases", () => {
    it("ensureMilestones returns empty arrays when undefined", () => {
      const milestones = ensureMilestones(undefined);
      expect(milestones.buildingMilestones).toEqual([]);
      expect(milestones.factionTrustMilestones).toEqual([]);
      expect(milestones.ageMilestones).toEqual([]);
    });

    it("ensureMilestones preserves existing data", () => {
      const milestones = ensureMilestones({
        buildingMilestones: [10],
        factionTrustMilestones: ["athens"],
        ageMilestones: ["archaic"]
      });
      expect(milestones.buildingMilestones).toEqual([10]);
      expect(milestones.factionTrustMilestones).toEqual(["athens"]);
      expect(milestones.ageMilestones).toEqual(["archaic"]);
    });

    it("all milestones already reached produces no new events", () => {
      const state = withBuildings(withAge(baseState(), "hellenistic"), 35);
      const milestones = ensureMilestones({
        buildingMilestones: [10, 20, 30],
        factionTrustMilestones: [],
        ageMilestones: ["archaic", "classical", "hellenic", "hellenistic"]
      });
      const buildingResult = checkBuildingMilestones(state, milestones, 1);
      const ageResult = checkAgeMilestones(state, milestones, 1);
      expect(buildingResult.feedItems.length).toBe(0);
      expect(ageResult.feedItems.length).toBe(0);
    });
  });
});
