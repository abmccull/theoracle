import { describe, expect, it } from "vitest";

import { generateReinterpretations, advanceBeliefStrength } from "../src/simulation/prophecyFeedback";
import { createProphecyArc } from "../src/simulation/prophecyArcs";
import { createInitialState } from "../src/state/initialState";
import type { FactionId, GameState, ProphecyRecord, TileSemantics } from "../src/state/gameState";
import { createInitialProphecyArcState } from "../src/state/prophecy";

const sampleSemantics: TileSemantics = {
  target: "army",
  action: "triumph",
  polarity: "favorable",
  ambiguity: "balanced",
  timeHorizon: "seasonal",
  domain: "military"
};

function makeProphecyRecord(overrides?: Partial<ProphecyRecord>): ProphecyRecord {
  return {
    id: "prophecy-test-1",
    factionId: "athens" as FactionId,
    dayIssued: 10,
    text: "the army shall triumph before harvest",
    tileIds: ["a", "b", "c"],
    semantics: [sampleSemantics],
    clarity: 65,
    value: 70,
    risk: 30,
    depth: 55,
    depthBand: "grounded",
    dueDay: 30,
    resolved: false,
    ...overrides
  };
}

function makeState(overrides?: Partial<GameState>): GameState {
  const base = createInitialState();
  return {
    ...base,
    ...overrides
  };
}

describe("Prophecy Feedback System", () => {
  describe("generateReinterpretations", () => {
    it("produces 2-3 reinterpretations from non-requesting factions", () => {
      const state = makeState();
      const record = makeProphecyRecord();
      const reinterpretations = generateReinterpretations(state, record);

      expect(reinterpretations.length).toBeGreaterThanOrEqual(2);
      expect(reinterpretations.length).toBeLessThanOrEqual(3);

      // None should be from the requesting faction
      for (const r of reinterpretations) {
        expect(r.factionId).not.toBe(record.factionId);
        expect(r.originalFactionId).toBe(record.factionId);
        expect(r.prophecyId).toBe(record.id);
      }
    });

    it("assigns valid spin types to each reinterpretation", () => {
      const state = makeState();
      const record = makeProphecyRecord();
      const reinterpretations = generateReinterpretations(state, record);

      const validSpins = ["supportive", "hostile", "exploitative", "dismissive"];
      for (const r of reinterpretations) {
        expect(validSpins).toContain(r.spin);
      }
    });

    it("determines hostile spin for factions at war", () => {
      const state = makeState();
      // Set a faction at war with the requesting faction
      const targetFactionId = Object.keys(state.factions).find(
        (fId) => fId !== "athens"
      ) as FactionId;

      state.factions[targetFactionId] = {
        ...state.factions[targetFactionId],
        activeConflicts: ["athens" as FactionId]
      };

      const record = makeProphecyRecord();
      const reinterpretations = generateReinterpretations(state, record);

      const warFactionReinterp = reinterpretations.find((r) => r.factionId === targetFactionId);
      if (warFactionReinterp) {
        expect(warFactionReinterp.spin).toBe("hostile");
        expect(warFactionReinterp.credibilityImpact).toBeLessThan(0);
      }
    });

    it("assigns negative credibility impact for hostile spins", () => {
      const state = makeState();
      const record = makeProphecyRecord();
      const reinterpretations = generateReinterpretations(state, record);

      for (const r of reinterpretations) {
        if (r.spin === "hostile") {
          expect(r.credibilityImpact).toBeLessThanOrEqual(-2);
          expect(r.credibilityImpact).toBeGreaterThanOrEqual(-5);
        }
        if (r.spin === "supportive") {
          expect(r.credibilityImpact).toBeGreaterThanOrEqual(1);
          expect(r.credibilityImpact).toBeLessThanOrEqual(3);
        }
      }
    });

    it("generates narrative text for each reinterpretation", () => {
      const state = makeState();
      const record = makeProphecyRecord();
      const reinterpretations = generateReinterpretations(state, record);

      for (const r of reinterpretations) {
        expect(r.narrative.length).toBeGreaterThan(10);
      }
    });

    it("is deterministic given the same seed", () => {
      const state = makeState();
      const record = makeProphecyRecord();
      const first = generateReinterpretations(state, record);
      const second = generateReinterpretations(state, record);

      expect(first).toEqual(second);
    });
  });

  describe("advanceBeliefStrength", () => {
    it("grows belief when faction credibility is high and supportive reinterpretations dominate", () => {
      const state = makeState();
      const record = makeProphecyRecord({
        beliefStrength: 50,
        reinterpretations: [
          {
            id: "r1",
            prophecyId: "prophecy-test-1",
            factionId: "sparta" as FactionId,
            originalFactionId: "athens" as FactionId,
            spin: "supportive",
            narrative: "Sparta approves",
            credibilityImpact: 2,
            dayCreated: 10
          },
          {
            id: "r2",
            prophecyId: "prophecy-test-1",
            factionId: "corinth" as FactionId,
            originalFactionId: "athens" as FactionId,
            spin: "supportive",
            narrative: "Corinth approves",
            credibilityImpact: 1,
            dayCreated: 10
          }
        ]
      });

      // Set high credibility for requesting faction
      const updatedState: GameState = {
        ...state,
        factions: {
          ...state.factions,
          athens: {
            ...state.factions.athens,
            credibility: 80
          }
        },
        consultation: {
          ...state.consultation,
          history: [record]
        }
      };

      const result = advanceBeliefStrength(updatedState);
      const updatedRecord = result.consultation.history[0]!;
      expect(updatedRecord.beliefStrength).toBeGreaterThan(50);
    });

    it("decays belief when hostile reinterpretations dominate", () => {
      const state = makeState();
      const record = makeProphecyRecord({
        beliefStrength: 50,
        reinterpretations: [
          {
            id: "r1",
            prophecyId: "prophecy-test-1",
            factionId: "sparta" as FactionId,
            originalFactionId: "athens" as FactionId,
            spin: "hostile",
            narrative: "Sparta denounces",
            credibilityImpact: -3,
            dayCreated: 10
          },
          {
            id: "r2",
            prophecyId: "prophecy-test-1",
            factionId: "corinth" as FactionId,
            originalFactionId: "athens" as FactionId,
            spin: "hostile",
            narrative: "Corinth denounces",
            credibilityImpact: -4,
            dayCreated: 10
          }
        ]
      });

      const updatedState: GameState = {
        ...state,
        consultation: {
          ...state.consultation,
          history: [record]
        }
      };

      const result = advanceBeliefStrength(updatedState);
      const updatedRecord = result.consultation.history[0]!;
      expect(updatedRecord.beliefStrength).toBeLessThan(50);
    });

    it("skips resolved prophecies", () => {
      const state = makeState();
      const record = makeProphecyRecord({
        beliefStrength: 50,
        resolved: true
      });

      const updatedState: GameState = {
        ...state,
        consultation: {
          ...state.consultation,
          history: [record]
        }
      };

      const result = advanceBeliefStrength(updatedState);
      const updatedRecord = result.consultation.history[0]!;
      expect(updatedRecord.beliefStrength).toBe(50);
    });

    it("generates event feed item when beliefStrength crosses 70 threshold", () => {
      const state = makeState();
      const record = makeProphecyRecord({
        beliefStrength: 68,
        reinterpretations: [
          {
            id: "r1",
            prophecyId: "prophecy-test-1",
            factionId: "sparta" as FactionId,
            originalFactionId: "athens" as FactionId,
            spin: "supportive",
            narrative: "Sparta approves",
            credibilityImpact: 2,
            dayCreated: 10
          },
          {
            id: "r2",
            prophecyId: "prophecy-test-1",
            factionId: "corinth" as FactionId,
            originalFactionId: "athens" as FactionId,
            spin: "supportive",
            narrative: "Corinth approves",
            credibilityImpact: 1,
            dayCreated: 10
          }
        ]
      });

      const updatedState: GameState = {
        ...state,
        factions: {
          ...state.factions,
          athens: {
            ...state.factions.athens,
            credibility: 80
          }
        },
        consultation: {
          ...state.consultation,
          history: [record]
        }
      };

      const result = advanceBeliefStrength(updatedState);
      const updatedRecord = result.consultation.history[0]!;

      if (updatedRecord.beliefStrength! > 70) {
        const feedItem = result.eventFeed.find((e) => e.id.includes("belief"));
        expect(feedItem).toBeDefined();
        expect(feedItem!.text).toContain("taken root");
      }
    });
  });

  describe("ProphecyArc chain tracking", () => {
    it("sets chainLength to 1 for a faction's first arc in a domain", () => {
      const state = makeState();
      const record = makeProphecyRecord({ depthBand: "grounded" });
      const arc = createProphecyArc(record, state);

      expect(arc).not.toBeNull();
      expect(arc!.chainLength).toBe(1);
      expect(arc!.isGrandProphecy).toBe(false);
      expect(arc!.grandProphecyBonus).toBeUndefined();
    });

    it("increments chainLength for subsequent arcs in the same domain/faction", () => {
      const state = makeState();
      const arcState = createInitialProphecyArcState();

      // Create two existing arcs for same faction + domain
      const existingArcs = [
        {
          id: "arc-1",
          rootProphecyId: "p-1",
          label: "Test arc 1",
          domain: "military" as const,
          factionId: "athens" as FactionId,
          startDay: 1,
          expectedEndDay: 60,
          status: "active" as const,
          milestones: [],
          interpretationBranches: [],
          followUpObligations: [],
          chainLength: 1
        },
        {
          id: "arc-2",
          rootProphecyId: "p-2",
          label: "Test arc 2",
          domain: "military" as const,
          factionId: "athens" as FactionId,
          startDay: 30,
          expectedEndDay: 90,
          status: "active" as const,
          milestones: [],
          interpretationBranches: [],
          followUpObligations: [],
          chainLength: 2
        }
      ];

      const stateWithArcs = {
        ...state,
        prophecyArcs: {
          ...arcState,
          arcs: existingArcs
        }
      };

      const record = makeProphecyRecord({ depthBand: "deep" });
      const arc = createProphecyArc(record, stateWithArcs);

      expect(arc).not.toBeNull();
      expect(arc!.chainLength).toBe(3);
      expect(arc!.isGrandProphecy).toBe(true);
      expect(arc!.grandProphecyBonus).toBe(1.5);
    });

    it("activates Grand Prophecy bonus at chainLength >= 3", () => {
      const state = makeState();
      const arcState = createInitialProphecyArcState();

      // Need 2 existing arcs to reach chainLength 3
      const existingArcs = Array.from({ length: 2 }, (_, i) => ({
        id: `arc-existing-${i}`,
        rootProphecyId: `p-${i}`,
        label: `Arc ${i}`,
        domain: "military" as const,
        factionId: "athens" as FactionId,
        startDay: i * 30,
        expectedEndDay: (i + 1) * 60,
        status: "active" as const,
        milestones: [],
        interpretationBranches: [],
        followUpObligations: []
      }));

      const stateWithArcs = {
        ...state,
        prophecyArcs: {
          ...arcState,
          arcs: existingArcs
        }
      };

      const record = makeProphecyRecord({ depthBand: "grounded" });
      const arc = createProphecyArc(record, stateWithArcs);

      expect(arc).not.toBeNull();
      expect(arc!.isGrandProphecy).toBe(true);
      expect(arc!.grandProphecyBonus).toBe(1.5);
    });

    it("does not activate Grand Prophecy for different domains", () => {
      const state = makeState();
      const arcState = createInitialProphecyArcState();

      // 2 arcs but in economic domain, new prophecy is military
      const existingArcs = Array.from({ length: 2 }, (_, i) => ({
        id: `arc-existing-${i}`,
        rootProphecyId: `p-${i}`,
        label: `Arc ${i}`,
        domain: "economic" as const,
        factionId: "athens" as FactionId,
        startDay: i * 30,
        expectedEndDay: (i + 1) * 60,
        status: "active" as const,
        milestones: [],
        interpretationBranches: [],
        followUpObligations: []
      }));

      const stateWithArcs = {
        ...state,
        prophecyArcs: {
          ...arcState,
          arcs: existingArcs
        }
      };

      const record = makeProphecyRecord({ depthBand: "grounded" });
      const arc = createProphecyArc(record, stateWithArcs);

      expect(arc).not.toBeNull();
      expect(arc!.chainLength).toBe(1);
      expect(arc!.isGrandProphecy).toBe(false);
    });
  });
});
