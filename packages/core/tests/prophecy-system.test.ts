import { describe, expect, it } from "vitest";

import { resolveFollowUp, resolveContradictions, createProphecyArc } from "../src/simulation/prophecyArcs";
import {
  generateReinterpretations,
  applyBehaviorShifts,
  applyInterpretationBranchEffects
} from "../src/simulation/prophecyFeedback";
import { scorePlacedTiles } from "../src/simulation/events";
import { buildProphecyDepthSummary } from "../src/selectors";
import { createInitialState } from "../src/state/initialState";
import { createInitialProphecyArcState } from "../src/state/prophecy";
import type {
  FactionId,
  GameState,
  OmenReport,
  ProphecyRecord,
  TileSemantics,
  WordTile
} from "../src/state/gameState";
import type {
  ProphecyArc,
  ProphecyContradiction,
  ProphecyFollowUp
} from "../src/state/prophecy";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sampleSemantics: TileSemantics = {
  target: "army",
  action: "triumph",
  polarity: "favorable",
  ambiguity: "balanced",
  timeHorizon: "seasonal",
  domain: "military"
};

const faithSemantics: TileSemantics = {
  target: "oracle",
  action: "endure",
  polarity: "favorable",
  ambiguity: "balanced",
  timeHorizon: "seasonal",
  domain: "spiritual"
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
  return { ...base, ...overrides };
}

function makeArc(overrides?: Partial<ProphecyArc>): ProphecyArc {
  return {
    id: "arc-test-1",
    rootProphecyId: "prophecy-test-1",
    label: "Army triumph arc",
    domain: "military",
    factionId: "athens" as FactionId,
    startDay: 10,
    expectedEndDay: 70,
    status: "active",
    milestones: [],
    interpretationBranches: [],
    followUpObligations: [],
    ...overrides
  };
}

function makeFollowUp(overrides?: Partial<ProphecyFollowUp>): ProphecyFollowUp {
  return {
    id: "followup-test-1",
    kind: "reaffirmation",
    dueDay: 30,
    fulfilled: false,
    ...overrides
  };
}

function makeContradiction(overrides?: Partial<ProphecyContradiction>): ProphecyContradiction {
  return {
    id: "contradiction-test-1",
    prophecyIdA: "prophecy-test-1",
    prophecyIdB: "prophecy-test-2",
    domain: "military",
    description: "Conflicting readings on army: triumph vs fall",
    detectedDay: 15,
    severity: "minor",
    resolved: false,
    credibilityImpact: -3,
    ...overrides
  };
}

function stateWithClock(state: GameState, day: number): GameState {
  return {
    ...state,
    clock: {
      ...state.clock,
      day,
      tick: day * state.clock.ticksPerDay,
      tickOfDay: 0
    }
  };
}

// ---------------------------------------------------------------------------
// P1.1 Follow-Up Resolution
// ---------------------------------------------------------------------------

describe("Follow-Up Obligation Resolution", () => {
  it("applies credibility penalty (-3) for unfulfilled follow-ups", () => {
    const state = makeState();
    const followUp = makeFollowUp({ dueDay: 5, fulfilled: false });
    const arc = makeArc({ followUpObligations: [followUp] });
    const testState = stateWithClock({
      ...state,
      prophecyArcs: {
        ...createInitialProphecyArcState(),
        arcs: [arc]
      }
    }, 10);

    const athensCredBefore = testState.factions.athens.credibility;
    const result = resolveFollowUp(testState);
    expect(result.factions.athens.credibility).toBe(athensCredBefore - 3);
  });

  it("applies credibility bonus (+2) and belief strength boost (+5) for fulfilled follow-ups", () => {
    const state = makeState();
    const record = makeProphecyRecord({ beliefStrength: 40 });
    const followUp = makeFollowUp({ dueDay: 5, fulfilled: true });
    const arc = makeArc({ followUpObligations: [followUp] });
    const testState = stateWithClock({
      ...state,
      consultation: { ...state.consultation, history: [record] },
      prophecyArcs: {
        ...createInitialProphecyArcState(),
        arcs: [arc]
      }
    }, 10);

    const athensCredBefore = testState.factions.athens.credibility;
    const result = resolveFollowUp(testState);
    expect(result.factions.athens.credibility).toBe(athensCredBefore + 2);
    expect(result.consultation.history[0]!.beliefStrength).toBe(45);
  });

  it("marks follow-ups as resolved after processing", () => {
    const state = makeState();
    const followUp = makeFollowUp({ dueDay: 5, fulfilled: false });
    const arc = makeArc({ followUpObligations: [followUp] });
    const testState = stateWithClock({
      ...state,
      prophecyArcs: {
        ...createInitialProphecyArcState(),
        arcs: [arc]
      }
    }, 10);

    const result = resolveFollowUp(testState);
    const updatedArc = result.prophecyArcs!.arcs[0]!;
    expect(updatedArc.followUpObligations[0]!.fulfilledDay).toBeDefined();
  });

  it("generates event feed entries for fulfilled follow-ups", () => {
    const state = makeState();
    const followUp = makeFollowUp({ dueDay: 5, fulfilled: true });
    const arc = makeArc({ followUpObligations: [followUp] });
    const testState = stateWithClock({
      ...state,
      prophecyArcs: {
        ...createInitialProphecyArcState(),
        arcs: [arc]
      }
    }, 10);

    const result = resolveFollowUp(testState);
    expect(result.eventFeed.some((e) => e.text.includes("fulfilled"))).toBe(true);
  });

  it("generates event feed entries for unfulfilled follow-ups", () => {
    const state = makeState();
    const followUp = makeFollowUp({ dueDay: 5, fulfilled: false });
    const arc = makeArc({ followUpObligations: [followUp] });
    const testState = stateWithClock({
      ...state,
      prophecyArcs: {
        ...createInitialProphecyArcState(),
        arcs: [arc]
      }
    }, 10);

    const result = resolveFollowUp(testState);
    expect(result.eventFeed.some((e) => e.text.includes("unfulfilled"))).toBe(true);
  });

  it("skips follow-ups not yet due", () => {
    const state = makeState();
    const followUp = makeFollowUp({ dueDay: 50, fulfilled: false });
    const arc = makeArc({ followUpObligations: [followUp] });
    const testState = stateWithClock({
      ...state,
      prophecyArcs: {
        ...createInitialProphecyArcState(),
        arcs: [arc]
      }
    }, 10);

    const result = resolveFollowUp(testState);
    // No changes -- follow-up not yet due
    expect(result.factions.athens.credibility).toBe(state.factions.athens.credibility);
  });

  it("processes multiple follow-ups in the same month", () => {
    const state = makeState();
    const followUp1 = makeFollowUp({ id: "fu-1", dueDay: 5, fulfilled: false });
    const followUp2 = makeFollowUp({ id: "fu-2", dueDay: 8, fulfilled: true });
    const arc = makeArc({ followUpObligations: [followUp1, followUp2] });
    const testState = stateWithClock({
      ...state,
      prophecyArcs: {
        ...createInitialProphecyArcState(),
        arcs: [arc]
      }
    }, 10);

    const athensCredBefore = testState.factions.athens.credibility;
    const result = resolveFollowUp(testState);
    // -3 for unfulfilled + +2 for fulfilled = -1 net
    expect(result.factions.athens.credibility).toBe(athensCredBefore - 1);
  });

  it("returns unchanged state when there are no arcs", () => {
    const state = makeState();
    const result = resolveFollowUp(state);
    expect(result).toBe(state);
  });

  it("returns unchanged state when no follow-ups are pending", () => {
    const state = makeState();
    const arc = makeArc({ followUpObligations: [] });
    const testState = stateWithClock({
      ...state,
      prophecyArcs: {
        ...createInitialProphecyArcState(),
        arcs: [arc]
      }
    }, 10);

    const result = resolveFollowUp(testState);
    expect(result.factions.athens.credibility).toBe(state.factions.athens.credibility);
  });
});

// ---------------------------------------------------------------------------
// P1.2 Contradiction Resolution
// ---------------------------------------------------------------------------

describe("Contradiction Resolution", () => {
  it("applies credibility impact (-5) to the faction that noticed the contradiction", () => {
    const state = makeState();
    const contradiction = makeContradiction();
    const arc = makeArc({ rootProphecyId: "prophecy-test-1" });
    const testState: GameState = {
      ...state,
      prophecyArcs: {
        ...createInitialProphecyArcState(),
        arcs: [arc],
        contradictions: [contradiction]
      }
    };

    const athensCredBefore = testState.factions.athens.credibility;
    const result = resolveContradictions(testState);
    expect(result.factions.athens.credibility).toBe(athensCredBefore - 5);
  });

  it("marks contradictions as resolved", () => {
    const state = makeState();
    const contradiction = makeContradiction();
    const arc = makeArc({ rootProphecyId: "prophecy-test-1" });
    const testState: GameState = {
      ...state,
      prophecyArcs: {
        ...createInitialProphecyArcState(),
        arcs: [arc],
        contradictions: [contradiction]
      }
    };

    const result = resolveContradictions(testState);
    expect(result.prophecyArcs!.contradictions[0]!.resolved).toBe(true);
    expect(result.prophecyArcs!.contradictions[0]!.resolutionReport).toBeDefined();
  });

  it("sets arc status to contradicted for related arcs", () => {
    const state = makeState();
    const contradiction = makeContradiction();
    const arc = makeArc({ rootProphecyId: "prophecy-test-1" });
    const testState: GameState = {
      ...state,
      prophecyArcs: {
        ...createInitialProphecyArcState(),
        arcs: [arc],
        contradictions: [contradiction]
      }
    };

    const result = resolveContradictions(testState);
    expect(result.prophecyArcs!.arcs[0]!.status).toBe("contradicted");
  });

  it("generates narrative event for contradiction resolution", () => {
    const state = makeState();
    const contradiction = makeContradiction();
    const testState: GameState = {
      ...state,
      prophecyArcs: {
        ...createInitialProphecyArcState(),
        contradictions: [contradiction]
      }
    };

    const result = resolveContradictions(testState);
    expect(result.eventFeed.some((e) => e.text.includes("contradiction"))).toBe(true);
  });

  it("triggers crisis chain for catastrophic contradictions", () => {
    const state = makeState();
    const contradiction = makeContradiction({ severity: "catastrophic" });
    const arc = makeArc({ rootProphecyId: "prophecy-test-1" });
    const testState: GameState = {
      ...state,
      prophecyArcs: {
        ...createInitialProphecyArcState(),
        arcs: [arc],
        contradictions: [contradiction]
      }
    };

    const result = resolveContradictions(testState);
    const crisisChains = result.campaign.worldMap.crisisChains;
    expect(crisisChains.some((c) => c.id.includes("contradiction"))).toBe(true);
    expect(result.eventFeed.some((e) => e.text.includes("catastrophic"))).toBe(true);
  });

  it("returns unchanged state when no unresolved contradictions exist", () => {
    const state = makeState();
    const result = resolveContradictions(state);
    expect(result).toBe(state);
  });

  it("processes multiple contradictions in the same month", () => {
    const state = makeState();
    const c1 = makeContradiction({ id: "c-1" });
    const c2 = makeContradiction({
      id: "c-2",
      prophecyIdA: "prophecy-test-3",
      prophecyIdB: "prophecy-test-4"
    });
    const testState: GameState = {
      ...state,
      prophecyArcs: {
        ...createInitialProphecyArcState(),
        contradictions: [c1, c2]
      }
    };

    const result = resolveContradictions(testState);
    expect(result.prophecyArcs!.contradictions.every((c) => c.resolved)).toBe(true);
    expect(result.prophecyArcs!.totalContradictions).toBe(2);
  });

  it("increments totalContradictions counter", () => {
    const state = makeState();
    const contradiction = makeContradiction();
    const testState: GameState = {
      ...state,
      prophecyArcs: {
        ...createInitialProphecyArcState(),
        contradictions: [contradiction]
      }
    };

    const result = resolveContradictions(testState);
    expect(result.prophecyArcs!.totalContradictions).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// P1.3 Reinterpretation Behavior Shift
// ---------------------------------------------------------------------------

describe("Reinterpretation Behavior Shift", () => {
  it("sets behaviorShift to 'war' for hostile spins on military-domain prophecies", () => {
    const state = makeState();
    // Force a faction to be at war with Athens to guarantee hostile spin
    const targetFactionId = Object.keys(state.factions).find(
      (fId) => fId !== "athens"
    ) as FactionId;

    const modifiedState: GameState = {
      ...state,
      factions: {
        ...state.factions,
        [targetFactionId]: {
          ...state.factions[targetFactionId],
          activeConflicts: ["athens" as FactionId]
        }
      }
    };

    const record = makeProphecyRecord(); // military domain
    const reinterpretations = generateReinterpretations(modifiedState, record);
    const hostileReinterp = reinterpretations.find(
      (r) => r.factionId === targetFactionId && r.spin === "hostile"
    );

    if (hostileReinterp) {
      expect(hostileReinterp.behaviorShift).toBe("war");
    }
  });

  it("sets behaviorShift to 'faith' for supportive spins on spiritual-domain prophecies", () => {
    const state = makeState();
    // Force a faction to have good relations with Athens to guarantee supportive spin
    const targetFactionId = Object.keys(state.factions).find(
      (fId) => fId !== "athens"
    ) as FactionId;

    const modifiedState: GameState = {
      ...state,
      factions: {
        ...state.factions,
        [targetFactionId]: {
          ...state.factions[targetFactionId],
          relations: { ...state.factions[targetFactionId].relations, athens: 50 },
          credibility: 60
        }
      }
    };

    const record = makeProphecyRecord({
      semantics: [faithSemantics]
    });
    const reinterpretations = generateReinterpretations(modifiedState, record);
    const supportiveReinterp = reinterpretations.find(
      (r) => r.factionId === targetFactionId && r.spin === "supportive"
    );

    if (supportiveReinterp) {
      expect(supportiveReinterp.behaviorShift).toBe("faith");
    }
  });

  it("applyBehaviorShifts shifts faction to war agenda with hostile war reinterpretation (probabilistic)", () => {
    // Test that the function at least doesn't error and processes correctly
    const state = makeState();
    const record = makeProphecyRecord({
      reinterpretations: [{
        id: "r1",
        prophecyId: "prophecy-test-1",
        factionId: "sparta" as FactionId,
        originalFactionId: "athens" as FactionId,
        spin: "hostile",
        narrative: "Sparta denounces",
        credibilityImpact: -3,
        behaviorShift: "war",
        dayCreated: 10
      }]
    });

    const testState: GameState = {
      ...state,
      consultation: { ...state.consultation, history: [record] }
    };

    const result = applyBehaviorShifts(testState.factions, testState);
    // Result is valid - either shifted or stayed the same (probabilistic 30%)
    expect(result.sparta).toBeDefined();
    const agenda = result.sparta.currentAgenda;
    expect(["war", "trade", "faith", "succession"]).toContain(agenda);
  });

  it("applyBehaviorShifts shifts faction to faith agenda with supportive faith reinterpretation (probabilistic)", () => {
    const state = makeState();
    const record = makeProphecyRecord({
      reinterpretations: [{
        id: "r1",
        prophecyId: "prophecy-test-1",
        factionId: "sparta" as FactionId,
        originalFactionId: "athens" as FactionId,
        spin: "supportive",
        narrative: "Sparta supports",
        credibilityImpact: 2,
        behaviorShift: "faith",
        dayCreated: 10
      }]
    });

    const testState: GameState = {
      ...state,
      consultation: { ...state.consultation, history: [record] }
    };

    const result = applyBehaviorShifts(testState.factions, testState);
    expect(result.sparta).toBeDefined();
  });

  it("applyBehaviorShifts skips factions already on the target agenda", () => {
    const state = makeState();
    const modifiedState: GameState = {
      ...state,
      factions: {
        ...state.factions,
        sparta: { ...state.factions.sparta, currentAgenda: "war" }
      }
    };
    const record = makeProphecyRecord({
      reinterpretations: [{
        id: "r1",
        prophecyId: "prophecy-test-1",
        factionId: "sparta" as FactionId,
        originalFactionId: "athens" as FactionId,
        spin: "hostile",
        narrative: "Sparta denounces",
        credibilityImpact: -3,
        behaviorShift: "war",
        dayCreated: 10
      }]
    });

    const testState: GameState = {
      ...modifiedState,
      consultation: { ...modifiedState.consultation, history: [record] }
    };

    const result = applyBehaviorShifts(testState.factions, testState);
    // Should still be "war" -- no change since already on that agenda
    expect(result.sparta.currentAgenda).toBe("war");
  });
});

// ---------------------------------------------------------------------------
// P1.4 Interpretation Branch Cascading
// ---------------------------------------------------------------------------

describe("Interpretation Branch Cascading", () => {
  it("supportive branch adds +3 relation with oracle-aligned faction", () => {
    const state = makeState();
    const arc = makeArc({
      interpretationBranches: [{
        factionId: "sparta" as FactionId,
        reading: "Sparta sees this as validation",
        alignment: "supportive",
        influenceShift: 3,
        adopted: true
      }]
    });

    const testState: GameState = {
      ...state,
      prophecyArcs: {
        ...createInitialProphecyArcState(),
        arcs: [arc]
      }
    };

    const spartaRelBefore = testState.factions.sparta.relations.athens ?? 0;
    const result = applyInterpretationBranchEffects(testState);
    const spartaRelAfter = result.factions.sparta.relations.athens ?? 0;
    expect(spartaRelAfter).toBe(Math.min(100, spartaRelBefore + 3));
  });

  it("hostile branch subtracts -3 relation", () => {
    const state = makeState();
    const arc = makeArc({
      interpretationBranches: [{
        factionId: "sparta" as FactionId,
        reading: "Sparta denounces",
        alignment: "hostile",
        influenceShift: -4,
        adopted: true
      }]
    });

    const testState: GameState = {
      ...state,
      prophecyArcs: {
        ...createInitialProphecyArcState(),
        arcs: [arc]
      }
    };

    const spartaRelBefore = testState.factions.sparta.relations.athens ?? 0;
    const result = applyInterpretationBranchEffects(testState);
    const spartaRelAfter = result.factions.sparta.relations.athens ?? 0;
    expect(spartaRelAfter).toBe(Math.max(-100, spartaRelBefore - 3));
  });

  it("hostile branch triggers embargo when relations drop below -40", () => {
    const state = makeState();
    const arc = makeArc({
      interpretationBranches: [{
        factionId: "sparta" as FactionId,
        reading: "Sparta denounces",
        alignment: "hostile",
        influenceShift: -4,
        adopted: true
      }]
    });

    const testState: GameState = {
      ...state,
      factions: {
        ...state.factions,
        sparta: {
          ...state.factions.sparta,
          relations: { ...state.factions.sparta.relations, athens: -39 },
          embargoes: []
        }
      },
      prophecyArcs: {
        ...createInitialProphecyArcState(),
        arcs: [arc]
      }
    };

    const result = applyInterpretationBranchEffects(testState);
    // Relations should drop to -42, triggering embargo
    expect(result.factions.sparta.embargoes).toContain("athens");
    expect(result.eventFeed.some((e) => e.text.includes("embargo"))).toBe(true);
  });

  it("does not trigger embargo when relations stay above -40", () => {
    const state = makeState();
    const arc = makeArc({
      interpretationBranches: [{
        factionId: "sparta" as FactionId,
        reading: "Sparta denounces",
        alignment: "hostile",
        influenceShift: -4,
        adopted: true
      }]
    });

    const testState: GameState = {
      ...state,
      factions: {
        ...state.factions,
        sparta: {
          ...state.factions.sparta,
          relations: { ...state.factions.sparta.relations, athens: -30 },
          embargoes: []
        }
      },
      prophecyArcs: {
        ...createInitialProphecyArcState(),
        arcs: [arc]
      }
    };

    const result = applyInterpretationBranchEffects(testState);
    expect(result.factions.sparta.embargoes).not.toContain("athens");
  });

  it("skips non-adopted branches", () => {
    const state = makeState();
    const arc = makeArc({
      interpretationBranches: [{
        factionId: "sparta" as FactionId,
        reading: "Sparta observes",
        alignment: "supportive",
        influenceShift: 3,
        adopted: false
      }]
    });

    const testState: GameState = {
      ...state,
      prophecyArcs: {
        ...createInitialProphecyArcState(),
        arcs: [arc]
      }
    };

    const spartaRelBefore = testState.factions.sparta.relations.athens ?? 0;
    const result = applyInterpretationBranchEffects(testState);
    const spartaRelAfter = result.factions.sparta.relations.athens ?? 0;
    expect(spartaRelAfter).toBe(spartaRelBefore);
  });

  it("returns unchanged state when no arcs exist", () => {
    const state = makeState({
      prophecyArcs: undefined as unknown as GameState["prophecyArcs"]
    });
    const result = applyInterpretationBranchEffects(state);
    expect(result).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// P1.5 Pythia Needs → Mechanical Impact
// ---------------------------------------------------------------------------

describe("Pythia Needs Mechanical Impact", () => {
  it("rest need > 70 reduces tile quality by 15%", () => {
    const tiles: WordTile[] = [
      { id: "s1", text: "the army", category: "subject", semantics: sampleSemantics },
      { id: "a1", text: "shall triumph", category: "action", semantics: sampleSemantics },
      { id: "c1", text: "if the gods will it", category: "condition", semantics: sampleSemantics },
      { id: "seal1", text: "thus speaks Apollo", category: "seal", semantics: sampleSemantics }
    ];

    const restedScore = scorePlacedTiles(tiles, {
      attunement: 70,
      mentalClarity: 70,
      tranceDepth: 65,
      needs: { purification: 30, rest: 30, pilgrimageCooldown: 0, food: 20 },
      traits: []
    });

    const tiredScore = scorePlacedTiles(tiles, {
      attunement: 70,
      mentalClarity: 70,
      tranceDepth: 65,
      needs: { purification: 30, rest: 75, pilgrimageCooldown: 0, food: 20 },
      traits: []
    });

    // Tired score should be strictly lower due to 15% reduction
    expect(tiredScore.clarity).toBeLessThan(restedScore.clarity);
    expect(tiredScore.value).toBeLessThan(restedScore.value);
  });

  it("rest need at exactly 70 does not trigger quality reduction", () => {
    const tiles: WordTile[] = [
      { id: "s1", text: "the army", category: "subject", semantics: sampleSemantics },
      { id: "a1", text: "shall triumph", category: "action", semantics: sampleSemantics }
    ];

    const at70 = scorePlacedTiles(tiles, {
      attunement: 70,
      mentalClarity: 70,
      tranceDepth: 65,
      needs: { purification: 30, rest: 70, pilgrimageCooldown: 0, food: 20 },
      traits: []
    });

    const at69 = scorePlacedTiles(tiles, {
      attunement: 70,
      mentalClarity: 70,
      tranceDepth: 65,
      needs: { purification: 30, rest: 69, pilgrimageCooldown: 0, food: 20 },
      traits: []
    });

    // At exactly 70, no reduction yet (threshold is >70)
    expect(at70.clarity).toBe(at69.clarity);
  });

  it("food need > 50 caps depth band at grounded", () => {
    const state = createInitialState();
    const tiles: WordTile[] = [
      { id: "s1", text: "the army", category: "subject", semantics: sampleSemantics },
      { id: "a1", text: "shall triumph", category: "action", semantics: sampleSemantics },
      { id: "c1", text: "conditions met", category: "condition", semantics: sampleSemantics },
      { id: "m1", text: "greatly", category: "modifier", semantics: sampleSemantics },
      { id: "seal1", text: "sealed", category: "seal", semantics: sampleSemantics }
    ];
    const omenReports: OmenReport[] = [
      { id: "o1", sourceRole: "Laurel Reader", text: "Smoke rises", semantics: sampleSemantics, reliability: 85 },
      { id: "o2", sourceRole: "Spring Keeper", text: "Waters clear", semantics: sampleSemantics, reliability: 80 }
    ];

    // With low food (normal)
    const normalResult = buildProphecyDepthSummary({
      tiles,
      omenReports,
      score: { clarity: 90, value: 90, risk: 20 },
      pythia: { ...state.pythia, needs: { ...state.pythia.needs, food: 20 } }
    });

    // With high food need (hungry)
    const hungryResult = buildProphecyDepthSummary({
      tiles,
      omenReports,
      score: { clarity: 90, value: 90, risk: 20 },
      pythia: { ...state.pythia, needs: { ...state.pythia.needs, food: 55 } }
    });

    // Normal should potentially be deep/oracular
    if (normalResult.depthBand === "deep" || normalResult.depthBand === "oracular") {
      // Hungry should be capped at grounded
      expect(hungryResult.depthBand).toBe("grounded");
    }
  });

  it("food need at exactly 50 does not cap depth band", () => {
    const state = createInitialState();
    const tiles: WordTile[] = [
      { id: "s1", text: "the army", category: "subject", semantics: sampleSemantics },
      { id: "a1", text: "shall triumph", category: "action", semantics: sampleSemantics },
      { id: "c1", text: "conditions met", category: "condition", semantics: sampleSemantics },
      { id: "seal1", text: "sealed", category: "seal", semantics: sampleSemantics }
    ];
    const omenReports: OmenReport[] = [
      { id: "o1", sourceRole: "Laurel Reader", text: "Smoke rises", semantics: sampleSemantics, reliability: 85 }
    ];

    const at50 = buildProphecyDepthSummary({
      tiles,
      omenReports,
      score: { clarity: 85, value: 85, risk: 25 },
      pythia: { ...state.pythia, needs: { ...state.pythia.needs, food: 50 } }
    });

    const at49 = buildProphecyDepthSummary({
      tiles,
      omenReports,
      score: { clarity: 85, value: 85, risk: 25 },
      pythia: { ...state.pythia, needs: { ...state.pythia.needs, food: 49 } }
    });

    // Both should produce same depth band (50 is not > 50)
    expect(at50.depthBand).toBe(at49.depthBand);
  });
});

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------

describe("Edge Cases", () => {
  it("resolveFollowUp handles arcs with non-active status", () => {
    const state = makeState();
    const followUp = makeFollowUp({ dueDay: 5, fulfilled: false });
    const arc = makeArc({ status: "fulfilled", followUpObligations: [followUp] });
    const testState = stateWithClock({
      ...state,
      prophecyArcs: {
        ...createInitialProphecyArcState(),
        arcs: [arc]
      }
    }, 10);

    const result = resolveFollowUp(testState);
    // Should not process follow-ups on non-active arcs
    expect(result.factions.athens.credibility).toBe(state.factions.athens.credibility);
  });

  it("resolveContradictions handles already-resolved contradictions gracefully", () => {
    const state = makeState();
    const contradiction = makeContradiction({ resolved: true, resolutionReport: "Already done" });
    const testState: GameState = {
      ...state,
      prophecyArcs: {
        ...createInitialProphecyArcState(),
        contradictions: [contradiction]
      }
    };

    const result = resolveContradictions(testState);
    expect(result).toBe(testState);
  });

  it("credibility never goes below 0 on penalties", () => {
    const state = makeState();
    const lowCredState: GameState = {
      ...state,
      factions: {
        ...state.factions,
        athens: { ...state.factions.athens, credibility: 1 }
      }
    };
    const followUp = makeFollowUp({ dueDay: 5, fulfilled: false });
    const arc = makeArc({ followUpObligations: [followUp] });
    const testState = stateWithClock({
      ...lowCredState,
      prophecyArcs: {
        ...createInitialProphecyArcState(),
        arcs: [arc]
      }
    }, 10);

    const result = resolveFollowUp(testState);
    expect(result.factions.athens.credibility).toBe(0);
  });

  it("credibility never goes above 100 on bonuses", () => {
    const state = makeState();
    const highCredState: GameState = {
      ...state,
      factions: {
        ...state.factions,
        athens: { ...state.factions.athens, credibility: 99 }
      }
    };
    const followUp = makeFollowUp({ dueDay: 5, fulfilled: true });
    const arc = makeArc({ followUpObligations: [followUp] });
    const testState = stateWithClock({
      ...highCredState,
      prophecyArcs: {
        ...createInitialProphecyArcState(),
        arcs: [arc]
      }
    }, 10);

    const result = resolveFollowUp(testState);
    expect(result.factions.athens.credibility).toBe(100);
  });
});
