import { describe, expect, it } from "vitest";

import {
  characterArcDefs,
  characterArcDefById,
  envoyDialogues,
  factionDefs
} from "@the-oracle/content";
import type { BranchCondition, FactionId } from "@the-oracle/content";
import { createInitialState } from "../src/state/initialState";
import { advanceCharacterArcs, checkBranchCondition } from "../src/simulation/characters";
import { applyAdvisorPersonality } from "../src/simulation/events";
import type { GameState, CharacterArc, AdvisorMessage, NamedCharacterState } from "../src/state/gameState";

// ── N1.1: Character Arc Stage Narratives ──

describe("character arc stage narratives", () => {
  it("all character arcs have narrative text on every stage", () => {
    for (const arc of characterArcDefs) {
      expect(arc.stageDefs.length).toBe(arc.stages);
      for (let i = 0; i < arc.stages; i++) {
        const stage = arc.stageDefs[i]!;
        expect(stage.narrative).toBeTruthy();
        expect(stage.narrative.length).toBeGreaterThan(20);
      }
    }
  });

  it("narrative text contains interpolation placeholders", () => {
    const allNarratives = characterArcDefs.flatMap((arc) =>
      arc.stageDefs.map((s) => s.narrative)
    );
    const withFaction = allNarratives.filter((n) => n.includes("{factionName}"));
    const withOracle = allNarratives.filter((n) => n.includes("{oracleName}"));

    // Most narratives should reference at least one placeholder
    expect(withFaction.length).toBeGreaterThan(0);
    expect(withOracle.length).toBeGreaterThan(0);
    // At least half of all narratives should have some placeholder
    const withAny = allNarratives.filter(
      (n) => n.includes("{factionName}") || n.includes("{oracleName}")
    );
    expect(withAny.length).toBeGreaterThanOrEqual(allNarratives.length / 2);
  });

  it("all 8 character arc definitions exist", () => {
    expect(characterArcDefs.length).toBe(8);
    const ids = characterArcDefs.map((a) => a.id);
    expect(ids).toContain("generals_gambit");
    expect(ids).toContain("merchants_bargain");
    expect(ids).toContain("exiles_return");
    expect(ids).toContain("priests_doubt");
    expect(ids).toContain("queens_secret");
    expect(ids).toContain("scholars_quest");
    expect(ids).toContain("ambassadors_mission");
    expect(ids).toContain("heirs_claim");
  });

  it("stageDefs count matches stages count for every arc", () => {
    for (const arc of characterArcDefs) {
      expect(arc.stageDefs.length).toBe(arc.stages);
    }
  });
});

// ── N1.2: Faction Envoy Personality ──

describe("faction envoy dialogues", () => {
  const allFactionIds: FactionId[] = factionDefs.map((f) => f.id);

  it("envoy dialogues exist for all factions", () => {
    for (const factionId of allFactionIds) {
      expect(envoyDialogues[factionId]).toBeDefined();
    }
  });

  it("each faction has 3-5 dialogue lines", () => {
    for (const factionId of allFactionIds) {
      const lines = envoyDialogues[factionId]!;
      expect(lines.length).toBeGreaterThanOrEqual(3);
      expect(lines.length).toBeLessThanOrEqual(5);
    }
  });

  it("Athens dialogue has intellectual/philosophical tone", () => {
    const lines = envoyDialogues.athens;
    const keywords = ["wisdom", "question", "knowledge", "truth", "reason", "Socrates", "owl"];
    const matchCount = lines.filter((line) =>
      keywords.some((kw) => line.toLowerCase().includes(kw.toLowerCase()))
    ).length;
    expect(matchCount).toBeGreaterThanOrEqual(2);
  });

  it("Sparta dialogue has direct military tone", () => {
    const lines = envoyDialogues.sparta;
    const keywords = ["march", "shields", "spears", "prophecy", "patience"];
    const matchCount = lines.filter((line) =>
      keywords.some((kw) => line.toLowerCase().includes(kw.toLowerCase()))
    ).length;
    expect(matchCount).toBeGreaterThanOrEqual(2);
  });

  it("Corinth dialogue has mercantile tone", () => {
    const lines = envoyDialogues.corinth;
    const keywords = ["trade", "profit", "deal", "value", "gold", "exchange", "warehouses", "ships"];
    const matchCount = lines.filter((line) =>
      keywords.some((kw) => line.toLowerCase().includes(kw.toLowerCase()))
    ).length;
    expect(matchCount).toBeGreaterThanOrEqual(2);
  });

  it("Thebes dialogue has mystical/spiritual tone", () => {
    const lines = envoyDialogues.thebes;
    const keywords = ["sacred", "divine", "rites", "prayer", "reverent", "heavens", "mystery", "fasted"];
    const matchCount = lines.filter((line) =>
      keywords.some((kw) => line.toLowerCase().includes(kw.toLowerCase()))
    ).length;
    expect(matchCount).toBeGreaterThanOrEqual(2);
  });

  it("Argos dialogue has proud/boastful tone", () => {
    const lines = envoyDialogues.argos;
    const keywords = ["honor", "lineage", "heroes", "Heracles", "equal", "legacy", "lesser"];
    const matchCount = lines.filter((line) =>
      keywords.some((kw) => line.toLowerCase().includes(kw.toLowerCase()))
    ).length;
    expect(matchCount).toBeGreaterThanOrEqual(2);
  });

  it("Miletus dialogue has scholarly/academic tone", () => {
    const lines = envoyDialogues.miletus;
    const keywords = ["study", "scholars", "curious", "knowledge", "evidence", "research", "observe"];
    const matchCount = lines.filter((line) =>
      keywords.some((kw) => line.toLowerCase().includes(kw.toLowerCase()))
    ).length;
    expect(matchCount).toBeGreaterThanOrEqual(2);
  });

  it("all dialogue lines are non-empty strings", () => {
    for (const factionId of allFactionIds) {
      for (const line of envoyDialogues[factionId]!) {
        expect(typeof line).toBe("string");
        expect(line.length).toBeGreaterThan(10);
      }
    }
  });
});

// ── N1.3: Prophecy Outcome Branching ──

describe("prophecy outcome branching", () => {
  it("branch condition types are valid across all arc stages", () => {
    const validConditions: (BranchCondition | undefined)[] = [
      "prophecy_success",
      "prophecy_failure",
      "neutral",
      undefined
    ];

    for (const arc of characterArcDefs) {
      for (const stage of arc.stageDefs) {
        expect(validConditions).toContain(stage.branchCondition);
      }
    }
  });

  it("at least some arcs have prophecy_success branch conditions", () => {
    const withSuccess = characterArcDefs.flatMap((a) => a.stageDefs).filter(
      (s) => s.branchCondition === "prophecy_success"
    );
    expect(withSuccess.length).toBeGreaterThan(0);
  });

  it("at least some arcs have prophecy_failure branch conditions", () => {
    const withFailure = characterArcDefs.flatMap((a) => a.stageDefs).filter(
      (s) => s.branchCondition === "prophecy_failure"
    );
    expect(withFailure.length).toBeGreaterThan(0);
  });

  it("prophecy_success branch condition gates advancement when recent prophecy failed", () => {
    const state = createInitialState({ seed: "branch-test-success", originId: "ancient-spring" });

    // Add a failed prophecy to history
    const stateWithFailedProphecy: GameState = {
      ...state,
      consultation: {
        ...state.consultation,
        history: [
          {
            id: "prophecy-1",
            factionId: "athens",
            dayIssued: state.clock.day - 10,
            text: "A prophecy that failed",
            tileIds: [],
            semantics: [],
            clarity: 50,
            value: 50,
            risk: 50,
            dueDay: state.clock.day - 5,
            resolved: true,
            resolvedDay: state.clock.day - 5,
            credibilityDelta: -5 // negative = failure
          }
        ]
      }
    };

    // checkBranchCondition should return false for prophecy_success with only failed prophecies
    expect(checkBranchCondition("prophecy_success", stateWithFailedProphecy)).toBe(false);
  });

  it("prophecy_failure branch condition gates advancement when recent prophecy succeeded", () => {
    const state = createInitialState({ seed: "branch-test-failure", originId: "ancient-spring" });

    const stateWithSuccessfulProphecy: GameState = {
      ...state,
      consultation: {
        ...state.consultation,
        history: [
          {
            id: "prophecy-2",
            factionId: "sparta",
            dayIssued: state.clock.day - 10,
            text: "A prophecy that succeeded",
            tileIds: [],
            semantics: [],
            clarity: 70,
            value: 70,
            risk: 30,
            dueDay: state.clock.day - 5,
            resolved: true,
            resolvedDay: state.clock.day - 5,
            credibilityDelta: 5 // positive = success
          }
        ]
      }
    };

    // checkBranchCondition should return false for prophecy_failure with only successful prophecies
    expect(checkBranchCondition("prophecy_failure", stateWithSuccessfulProphecy)).toBe(false);
  });

  it("neutral branch condition always advances regardless of prophecy history", () => {
    const state = createInitialState({ seed: "branch-neutral", originId: "ancient-spring" });
    expect(checkBranchCondition("neutral", state)).toBe(true);
    expect(checkBranchCondition(undefined, state)).toBe(true);

    // Even with explicit failure history, neutral always passes
    const stateWithFailure: GameState = {
      ...state,
      consultation: {
        ...state.consultation,
        history: [
          {
            id: "prophecy-3",
            factionId: "athens",
            dayIssued: state.clock.day - 10,
            text: "Failed prophecy",
            tileIds: [],
            semantics: [],
            clarity: 50,
            value: 50,
            risk: 50,
            dueDay: state.clock.day - 5,
            resolved: true,
            resolvedDay: state.clock.day - 5,
            credibilityDelta: -10
          }
        ]
      }
    };
    expect(checkBranchCondition("neutral", stateWithFailure)).toBe(true);
  });

  it("prophecy_success branch blocks arc advancement in advanceCharacterArcs", () => {
    const state = createInitialState({ seed: "arc-branch-block", originId: "merchant-oracle" });
    const characters = state.characters!;

    // Use generals_gambit which has prophecy_success on stage 1
    const arc: CharacterArc = {
      arcId: "generals_gambit",
      stage: 0,
      totalStages: 3,
      narrative: "A general seeks war prophecy",
      resolved: false
    };

    const updatedRoster = characters.roster.map((c, i) =>
      i === 0
        ? {
            ...c,
            currentArc: arc,
            memory: { ...c.memory, visitCount: 3, lastSeenDay: state.clock.day - 5 }
          }
        : c
    );

    // State with only failed prophecies — prophecy_success condition should block
    const modifiedState: GameState = {
      ...state,
      characters: { ...characters, roster: updatedRoster },
      consultation: {
        ...state.consultation,
        history: [
          {
            id: "prophecy-block",
            factionId: "athens",
            dayIssued: state.clock.day - 20,
            text: "Failed",
            tileIds: [],
            semantics: [],
            clarity: 50,
            value: 50,
            risk: 50,
            dueDay: state.clock.day - 10,
            resolved: true,
            resolvedDay: state.clock.day - 10,
            credibilityDelta: -5
          }
        ]
      }
    };

    const result = advanceCharacterArcs(modifiedState);
    const updatedCharacter = result.characters!.roster[0]!;

    // Should NOT have advanced because prophecy_success condition was not met
    expect(updatedCharacter.currentArc!.stage).toBe(0);
  });

  it("no prophecy history allows advancement by default", () => {
    const state = createInitialState({ seed: "no-history", originId: "ancient-spring" });
    // With no prophecy history, branch conditions should not block
    expect(checkBranchCondition("prophecy_success", state)).toBe(true);
    expect(checkBranchCondition("prophecy_failure", state)).toBe(true);
  });
});

// ── N1.4: Advisor Personality Development ──

describe("advisor personality development", () => {
  function makeBaseState(): GameState {
    return createInitialState({ seed: "advisor-personality", originId: "merchant-oracle" });
  }

  it("tracks advisor message history (last 3 per advisor)", () => {
    const state = makeBaseState();
    const messages: AdvisorMessage[] = [
      { id: "a1", advisorId: "treasurer", text: "Low on gold.", severity: "warn" },
      { id: "a2", advisorId: "treasurer", text: "Incense running low.", severity: "warn" },
      { id: "a3", advisorId: "hierophant", text: "Rest the Pythia.", severity: "warn" }
    ];

    const result = applyAdvisorPersonality(state, messages);
    expect(result.advisorHistory.treasurer).toHaveLength(2);
    expect(result.advisorHistory.hierophant).toHaveLength(1);
    expect(result.advisorHistory.treasurer).toContain("Low on gold.");
    expect(result.advisorHistory.treasurer).toContain("Incense running low.");
  });

  it("limits history to 3 messages per advisor", () => {
    const state: GameState = {
      ...makeBaseState(),
      advisorHistory: {
        treasurer: ["Old msg 1", "Old msg 2", "Old msg 3"]
      }
    };

    const messages: AdvisorMessage[] = [
      { id: "a1", advisorId: "treasurer", text: "New warning.", severity: "warn" }
    ];

    const result = applyAdvisorPersonality(state, messages);
    expect(result.advisorHistory.treasurer!.length).toBeLessThanOrEqual(3);
    expect(result.advisorHistory.treasurer).toContain("New warning.");
  });

  it("adds [Trusted] prefix when advisor accuracy exceeds 70%", () => {
    const state: GameState = {
      ...makeBaseState(),
      advisorAccuracy: {
        treasurer: { correct: 8, total: 10 } // 80% accuracy
      }
    };

    const messages: AdvisorMessage[] = [
      { id: "a1", advisorId: "treasurer", text: "Watch the grain stores.", severity: "warn" }
    ];

    const result = applyAdvisorPersonality(state, messages);
    expect(result.messages[0]!.text).toMatch(/^\[Trusted\]/);
  });

  it("adds [Uncertain] prefix when advisor accuracy is below 30%", () => {
    const state: GameState = {
      ...makeBaseState(),
      advisorAccuracy: {
        diplomat: { correct: 1, total: 10 } // 10% accuracy
      }
    };

    const messages: AdvisorMessage[] = [
      { id: "a1", advisorId: "diplomat", text: "Faction tensions rising.", severity: "warn" }
    ];

    const result = applyAdvisorPersonality(state, messages);
    expect(result.messages[0]!.text).toMatch(/^\[Uncertain\]/);
  });

  it("does not add prefix when accuracy data is insufficient (< 3 total)", () => {
    const state: GameState = {
      ...makeBaseState(),
      advisorAccuracy: {
        treasurer: { correct: 2, total: 2 } // 100% but only 2 samples
      }
    };

    const messages: AdvisorMessage[] = [
      { id: "a1", advisorId: "treasurer", text: "Some warning.", severity: "warn" }
    ];

    const result = applyAdvisorPersonality(state, messages);
    expect(result.messages[0]!.text).not.toMatch(/^\[Trusted\]/);
    expect(result.messages[0]!.text).not.toMatch(/^\[Uncertain\]/);
  });

  it("detects conflicting advice between advisors", () => {
    const state = makeBaseState();

    const messages: AdvisorMessage[] = [
      { id: "a1", advisorId: "treasurer", text: "Everything is fine.", severity: "info" },
      { id: "a2", advisorId: "shadow", text: "Crisis imminent!", severity: "critical" }
    ];

    const result = applyAdvisorPersonality(state, messages);

    // The info-severity message should note disagreement with the critical advisor
    const infoMsg = result.messages.find((m) => m.advisorId === "treasurer");
    expect(infoMsg!.text).toContain("disagrees with");
  });

  it("initializes advisor accuracy from empty state", () => {
    const state = makeBaseState();
    // No advisorAccuracy set

    const messages: AdvisorMessage[] = [
      { id: "a1", advisorId: "hierophant", text: "Warning about incense.", severity: "warn" }
    ];

    const result = applyAdvisorPersonality(state, messages);
    expect(result.advisorAccuracy).toBeDefined();
    expect(result.advisorHistory.hierophant).toBeDefined();
  });
});
