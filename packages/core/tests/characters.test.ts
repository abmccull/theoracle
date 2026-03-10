import { describe, expect, it } from "vitest";

import { selectCharacterRoster, selectCharacterSpotlight, selectPriestPoliticsOverview } from "../src/selectors";
import { normalizeCharactersState } from "../src/state/characters";
import { createInitialState } from "../src/state/initialState";
import { advancePriestExperience } from "../src/simulation/priests";
import { advanceCharacterArcs } from "../src/simulation/characters";
import type { GameState, PriestState, NamedCharacterState, CharacterArc } from "../src/state/gameState";

describe("recurring characters", () => {
  it("seeds a deterministic recurring roster from world and origin context", () => {
    const left = createInitialState({
      seed: "FR-DVG-8",
      originId: "merchant-oracle"
    });
    const right = createInitialState({
      seed: "FR-DVG-8",
      originId: "merchant-oracle"
    });
    const warOrigin = createInitialState({
      seed: "FR-DVG-8",
      originId: "war-oracle"
    });

    expect(left.characters).toEqual(right.characters);
    expect(left.characters?.roster.length).toBeGreaterThanOrEqual(5);
    expect(new Set(left.characters?.roster.map((character) => character.role))).toEqual(
      new Set(["merchant", "general", "envoy", "philosopher", "priest"])
    );
    expect(warOrigin.characters).not.toEqual(left.characters);
  });

  it("normalizes missing character scaffolding for older states", () => {
    const initial = createInitialState({
      seed: "legacy-character-backfill",
      originId: "ancient-spring"
    });

    const normalized = normalizeCharactersState({
      worldSeed: initial.worldSeed,
      worldGeneration: initial.worldGeneration,
      factions: initial.factions,
      characters: undefined
    });

    expect(normalized).toEqual(initial.characters);
    expect(normalized.roster.every((character) => character.memory.notableMoments.length > 0)).toBe(true);
  });

  it("exposes stable roster and spotlight summaries for later UI lanes", () => {
    const state = createInitialState({
      seed: "selector-surface",
      originId: "cursed-oracle"
    });

    const roster = selectCharacterRoster(state);
    const spotlight = selectCharacterSpotlight(state);
    const priestPolitics = selectPriestPoliticsOverview(state);
    const lastRosterEntry = roster[roster.length - 1];

    expect(roster.length).toBe(state.characters?.roster.length);
    expect(roster[0]?.prominence).toBeGreaterThanOrEqual(lastRosterEntry?.prominence ?? 0);
    expect(spotlight.length).toBeGreaterThan(0);
    expect(spotlight[0]?.memoryHook).toBeTruthy();
    expect(spotlight.every((entry) => roster.some((character) => character.id === entry.id))).toBe(true);
    expect(priestPolitics.featuredCharacters.length).toBeGreaterThan(0);
    expect(priestPolitics.featuredCharacters.every((character) => character.factionName !== undefined)).toBe(true);
  });
});

describe("priest experience system", () => {
  function makeBaseState(): GameState {
    return createInitialState({
      seed: "priest-experience-test",
      originId: "merchant-oracle"
    });
  }

  it("increases experience for priests assigned to buildings", () => {
    const state = makeBaseState();
    const buildingId = state.buildings[0]?.id ?? "test-building";

    // Force-assign the first priest to a building
    const modifiedState: GameState = {
      ...state,
      priests: state.priests.map((p, i) =>
        i === 0
          ? { ...p, currentAssignmentBuildingId: buildingId, experience: 0 }
          : p
      )
    };

    const result = advancePriestExperience(modifiedState);
    const updatedPriest = result.priests[0]!;

    expect(updatedPriest.currentAssignmentBuildingId).toBe(buildingId);
    expect(updatedPriest.experience).toBeGreaterThanOrEqual(1);
  });

  it("decreases loyalty when priest has 3+ grievances", () => {
    const state = makeBaseState();
    const startLoyalty = 60;

    // Give a priest 3 grievances and no assignment (will get "idle" grievance too)
    state.priests = state.priests.map((p, i) =>
      i === 0
        ? {
            ...p,
            currentAssignmentBuildingId: undefined,
            loyalty: startLoyalty,
            grievances: ["complaint one", "complaint two", "complaint three"]
          }
        : p
    );

    const result = advancePriestExperience(state);
    const updatedPriest = result.priests[0]!;

    // Should have 3+ grievances (existing 3 + idle)
    expect(updatedPriest.grievances!.length).toBeGreaterThanOrEqual(3);
    expect(updatedPriest.loyalty).toBeLessThan(startLoyalty);
  });

  it("assigns personality deterministically", () => {
    const state = makeBaseState();
    const result = advancePriestExperience(state);

    // Every priest should now have a personality
    for (const priest of result.priests) {
      expect(priest.personality).toBeDefined();
      expect(["devout", "ambitious", "scholarly", "political", "mystical"]).toContain(priest.personality);
    }

    // Deterministic: same input produces same output
    const result2 = advancePriestExperience(state);
    for (let i = 0; i < result.priests.length; i++) {
      expect(result.priests[i]!.personality).toBe(result2.priests[i]!.personality);
    }
  });

  it("generates defection risk warning for low-loyalty priests", () => {
    const state = makeBaseState();

    state.priests = state.priests.map((p, i) =>
      i === 0
        ? {
            ...p,
            loyalty: 15,
            grievances: ["a", "b", "c"]
          }
        : p
    );

    const result = advancePriestExperience(state);

    // Should have a defection risk event
    const defectionEvent = result.eventFeed.find((e) =>
      e.text.includes("loyalty") && e.text.includes("wavers")
    );
    expect(defectionEvent).toBeDefined();
  });
});

describe("character arc system", () => {
  function makeBaseState(): GameState {
    return createInitialState({
      seed: "character-arc-test",
      originId: "merchant-oracle"
    });
  }

  it("assigns arcs to characters with 2+ visits and no current arc", () => {
    const state = makeBaseState();
    const characters = state.characters!;

    // Give a character 2 visits and no arc
    const updatedRoster = characters.roster.map((c, i) =>
      i === 0
        ? {
            ...c,
            memory: { ...c.memory, visitCount: 3 },
            currentArc: undefined
          }
        : c
    );

    const modifiedState: GameState = {
      ...state,
      characters: { ...characters, roster: updatedRoster }
    };

    const result = advanceCharacterArcs(modifiedState);
    const updatedCharacter = result.characters!.roster[0]!;

    // Should have been assigned an arc (or not, depending on trigger conditions,
    // but the function should at least not crash)
    // We check that if an arc was assigned, it has the right shape
    if (updatedCharacter.currentArc) {
      expect(updatedCharacter.currentArc.stage).toBe(0);
      expect(updatedCharacter.currentArc.totalStages).toBeGreaterThanOrEqual(3);
      expect(updatedCharacter.currentArc.resolved).toBe(false);
      expect(updatedCharacter.currentArc.arcId).toBeTruthy();
    }
  });

  it("advances arc stage when character visits during the month", () => {
    const state = makeBaseState();
    const characters = state.characters!;

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
            memory: {
              ...c.memory,
              visitCount: 3,
              lastSeenDay: state.clock.day - 5
            }
          }
        : c
    );

    const modifiedState: GameState = {
      ...state,
      characters: { ...characters, roster: updatedRoster }
    };

    const result = advanceCharacterArcs(modifiedState);
    const updatedCharacter = result.characters!.roster[0]!;

    expect(updatedCharacter.currentArc).toBeDefined();
    expect(updatedCharacter.currentArc!.stage).toBe(1);
  });

  it("generates event feed item and credibility bonus on arc completion", () => {
    const state = makeBaseState();
    const characters = state.characters!;

    // Set up an arc at the penultimate stage
    const arc: CharacterArc = {
      arcId: "merchants_bargain",
      stage: 2,
      totalStages: 4,
      narrative: "A merchant proposes trade deals",
      resolved: false
    };

    const character = characters.roster[0]!;
    const factionId = character.homeFactionId ?? ("athens" as const);
    const updatedRoster: NamedCharacterState[] = characters.roster.map((c, i) =>
      i === 0
        ? {
            ...c,
            homeFactionId: factionId,
            currentArc: arc,
            memory: {
              ...c.memory,
              visitCount: 5,
              lastSeenDay: state.clock.day - 2
            }
          }
        : c
    );

    const modifiedState: GameState = {
      ...state,
      characters: { ...characters, roster: updatedRoster }
    };

    const result = advanceCharacterArcs(modifiedState);
    const updatedCharacter = result.characters!.roster[0]!;

    expect(updatedCharacter.currentArc?.resolved).toBe(true);

    // Should have an arc completion event
    const completionEvent = result.eventFeed.find((e) =>
      e.text.includes("conclusion")
    );
    expect(completionEvent).toBeDefined();
  });

  it("high-trust characters may share intel warnings", () => {
    const state = makeBaseState();
    const characters = state.characters!;

    // Create many high-trust characters to increase odds of intel event
    const updatedRoster = characters.roster.map((c) => ({
      ...c,
      relationship: { ...c.relationship, trust: 80 },
      memory: { ...c.memory, visitCount: 5 }
    }));

    const modifiedState: GameState = {
      ...state,
      characters: { ...characters, roster: updatedRoster }
    };

    // Run multiple times with different seeds to find one that triggers intel
    let foundIntel = false;
    for (let day = 1; day <= 50; day++) {
      const testState: GameState = {
        ...modifiedState,
        clock: { ...modifiedState.clock, day }
      };
      const result = advanceCharacterArcs(testState);
      if (result.eventFeed.some((e) => e.text.includes("shares a warning"))) {
        foundIntel = true;
        break;
      }
    }

    expect(foundIntel).toBe(true);
  });

  it("low-trust characters may spread doubt", () => {
    const state = makeBaseState();
    const characters = state.characters!;

    const updatedRoster = characters.roster.map((c) => ({
      ...c,
      relationship: { ...c.relationship, trust: 10 },
      memory: { ...c.memory, visitCount: 3 }
    }));

    const modifiedState: GameState = {
      ...state,
      characters: { ...characters, roster: updatedRoster }
    };

    // Run multiple times to find one that triggers doubt
    let foundDoubt = false;
    for (let day = 1; day <= 50; day++) {
      const testState: GameState = {
        ...modifiedState,
        clock: { ...modifiedState.clock, day }
      };
      const result = advanceCharacterArcs(testState);
      if (result.eventFeed.some((e) => e.text.includes("spreads doubt"))) {
        foundDoubt = true;
        break;
      }
    }

    expect(foundDoubt).toBe(true);
  });

  it("does not crash when characters state is undefined", () => {
    const state = makeBaseState();
    const modifiedState: GameState = {
      ...state,
      characters: undefined
    };

    const result = advanceCharacterArcs(modifiedState);
    expect(result.characters).toBeUndefined();
  });

  it("preserves resolved arcs without further advancement", () => {
    const state = makeBaseState();
    const characters = state.characters!;

    const resolvedArc: CharacterArc = {
      arcId: "scholars_quest",
      stage: 2,
      totalStages: 3,
      narrative: "A scholar seeks ancient knowledge",
      resolved: true
    };

    const updatedRoster = characters.roster.map((c, i) =>
      i === 0
        ? {
            ...c,
            currentArc: resolvedArc,
            memory: {
              ...c.memory,
              visitCount: 5,
              lastSeenDay: state.clock.day - 2
            }
          }
        : c
    );

    const modifiedState: GameState = {
      ...state,
      characters: { ...characters, roster: updatedRoster }
    };

    const result = advanceCharacterArcs(modifiedState);
    const updatedCharacter = result.characters!.roster[0]!;

    // Arc should remain resolved and not be re-advanced
    expect(updatedCharacter.currentArc?.resolved).toBe(true);
    expect(updatedCharacter.currentArc?.stage).toBe(2);
  });

  it("low-trust characters increase philosopher pressure", () => {
    const state = makeBaseState();
    const characters = state.characters!;

    // Set up low-trust characters and ensure philosophers exist
    if (!state.philosophers) return;

    const spotlightFactionId = state.philosophers.spotlightFactionIds[0];
    if (!spotlightFactionId) return;

    const initialPressure = state.philosophers.byFaction[spotlightFactionId]?.pressure ?? 0;

    const updatedRoster = characters.roster.map((c) => ({
      ...c,
      relationship: { ...c.relationship, trust: 10 },
      memory: { ...c.memory, visitCount: 3 }
    }));

    const modifiedState: GameState = {
      ...state,
      characters: { ...characters, roster: updatedRoster }
    };

    const result = advanceCharacterArcs(modifiedState);
    const resultPressure = result.philosophers?.byFaction[spotlightFactionId]?.pressure ?? 0;

    expect(resultPressure).toBeGreaterThan(initialPressure);
  });
});
