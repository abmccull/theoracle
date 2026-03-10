import { characterArcDefs, characterArcDefById, type CharacterArcDef, type BranchCondition } from "@the-oracle/content";

import type {
  CharacterArc,
  EventFeedItem,
  GameState,
  NamedCharacterState
} from "../state/gameState";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hash(seed: number, text: string): number {
  let value = seed ^ 0x9e3779b9;
  for (let index = 0; index < text.length; index += 1) {
    value = Math.imul(value ^ text.charCodeAt(index), 0x45d9f3b);
    value ^= value >>> 15;
  }
  return (value >>> 0) / 4294967296;
}

function matchesTrigger(arc: CharacterArcDef, state: GameState): boolean {
  switch (arc.triggerCondition) {
    case "any":
      return true;
    case "high_trust":
      // Checked per-character; always potentially valid
      return true;
    case "low_trust":
      return true;
    case "war":
      return Object.values(state.factions).some(
        (f) => f.currentAgenda === "war" || f.activeConflicts.length > 0
      );
    case "succession":
      return Object.values(state.factions).some(
        (f) => f.currentAgenda === "succession"
      );
    case "trade":
      return Object.values(state.factions).some(
        (f) => f.currentAgenda === "trade" && f.tradeAccess
      );
    default:
      return false;
  }
}

function selectArcForCharacter(
  character: NamedCharacterState,
  state: GameState
): CharacterArcDef | undefined {
  const eligible = characterArcDefs.filter((arc) => {
    if (!matchesTrigger(arc, state)) return false;
    // high_trust arcs require trust > 60
    if (arc.triggerCondition === "high_trust" && character.relationship.trust <= 60) return false;
    // low_trust arcs require trust < 20
    if (arc.triggerCondition === "low_trust" && character.relationship.trust >= 20) return false;
    return true;
  });

  if (eligible.length === 0) return undefined;

  const roll = hash(state.worldSeed + state.clock.day, `arc:${character.id}`);
  return eligible[Math.floor(roll * eligible.length) % eligible.length];
}

/**
 * Checks whether recent prophecy history satisfies a branch condition.
 * Looks at the last 3 resolved prophecies within the last 90 days.
 */
export function checkBranchCondition(
  condition: BranchCondition | undefined,
  state: GameState
): boolean {
  // neutral or undefined always passes
  if (!condition || condition === "neutral") return true;

  const recentProphecies = state.consultation.history
    .filter((p) => p.resolved && p.resolvedDay !== undefined && p.resolvedDay >= state.clock.day - 90)
    .sort((a, b) => (b.resolvedDay ?? 0) - (a.resolvedDay ?? 0))
    .slice(0, 3);

  if (recentProphecies.length === 0) {
    // No prophecy history — cannot evaluate, allow advancement by default
    return true;
  }

  if (condition === "prophecy_success") {
    // At least one recent prophecy had a positive credibility outcome
    return recentProphecies.some((p) => (p.credibilityDelta ?? 0) > 0);
  }

  if (condition === "prophecy_failure") {
    // At least one recent prophecy had a negative credibility outcome
    return recentProphecies.some((p) => (p.credibilityDelta ?? 0) < 0);
  }

  return true;
}

function advanceArc(arc: CharacterArc, _visitCount: number, state: GameState): CharacterArc {
  const nextStage = clamp(arc.stage + 1, 0, arc.totalStages - 1);

  // Check branch condition on the next stage
  const arcDef = characterArcDefById[arc.arcId];
  if (arcDef) {
    const nextStageDef = arcDef.stageDefs[nextStage];
    if (nextStageDef?.branchCondition && !checkBranchCondition(nextStageDef.branchCondition, state)) {
      // Branch condition not met — do not advance
      return arc;
    }
  }

  const resolved = nextStage >= arc.totalStages - 1;

  // Use the stage-specific narrative if available, otherwise keep the arc-level narrative
  const narrative = arcDef?.stageDefs[nextStage]?.narrative ?? arc.narrative;

  return {
    ...arc,
    stage: nextStage,
    narrative,
    resolved
  };
}

export function advanceCharacterArcs(state: GameState): GameState {
  const characters = state.characters;
  if (!characters) return state;

  const feedItems: EventFeedItem[] = [];
  let nextId = state.nextId;
  let credibilityBonuses: { factionId: string; delta: number }[] = [];

  // Track advisor messages for this tick
  const advisorHistory = state.advisorHistory ?? {};

  const updatedRoster = characters.roster.map((character) => {
    // Characters with active arcs: advance if they have a new visit
    if (character.currentArc && !character.currentArc.resolved) {
      // Check if character had a visit this month (visitCount incremented)
      if (character.memory.visitCount > 0 && character.memory.lastSeenDay !== undefined && character.memory.lastSeenDay >= state.clock.day - 30) {
        const advancedArc = advanceArc(character.currentArc, character.memory.visitCount, state);

        // If arc didn't actually advance (branch condition not met), return unchanged
        if (advancedArc.stage === character.currentArc.stage) {
          return character;
        }

        if (advancedArc.resolved) {
          feedItems.push({
            id: `event-arc-complete-${nextId}`,
            day: state.clock.day,
            text: `${character.displayName}'s story reaches its conclusion: ${advancedArc.narrative}`
          });
          nextId += 1;

          // Arc completion: credibility bonus for the character's faction
          if (character.homeFactionId) {
            credibilityBonuses.push({
              factionId: character.homeFactionId,
              delta: 3
            });
          }
        }

        return {
          ...character,
          currentArc: advancedArc
        };
      }

      return character;
    }

    // High-trust characters (trust > 60): may share intel warnings
    if (character.relationship.trust > 60 && character.memory.visitCount >= 2) {
      // Intel sharing generates event feed items
      if (hash(state.worldSeed + state.clock.day, `intel:${character.id}`) < 0.15) {
        feedItems.push({
          id: `event-intel-${nextId}`,
          day: state.clock.day,
          text: `${character.displayName} shares a warning about unrest in ${character.anchorRegionId ?? "a distant region"}.`
        });
        nextId += 1;
      }
    }

    // Low-trust characters (trust < 20): may spread doubt
    if (character.relationship.trust < 20 && character.memory.visitCount >= 1) {
      if (hash(state.worldSeed + state.clock.day, `doubt:${character.id}`) < 0.2) {
        feedItems.push({
          id: `event-doubt-${nextId}`,
          day: state.clock.day,
          text: `${character.displayName} spreads doubt about the oracle's authority among visiting delegations.`
        });
        nextId += 1;
      }
    }

    // New arc assignment: characters without arcs who visit 2+ times
    if (!character.currentArc && character.memory.visitCount >= 2) {
      const arcDef = selectArcForCharacter(character, state);
      if (arcDef) {
        const newArc: CharacterArc = {
          arcId: arcDef.id,
          stage: 0,
          totalStages: arcDef.stages,
          narrative: arcDef.stageDefs[0]?.narrative ?? arcDef.description,
          resolved: false
        };

        return {
          ...character,
          currentArc: newArc
        };
      }
    }

    return character;
  });

  // Apply credibility bonuses to factions
  let factions = state.factions;
  for (const bonus of credibilityBonuses) {
    const faction = factions[bonus.factionId as keyof typeof factions];
    if (faction) {
      factions = {
        ...factions,
        [bonus.factionId]: {
          ...faction,
          credibility: clamp(faction.credibility + bonus.delta, 0, 100)
        }
      };
    }
  }

  // Low-trust characters increase philosopher pressure
  let philosophers = state.philosophers;
  if (philosophers) {
    const doubtCount = updatedRoster.filter(
      (c) => c.relationship.trust < 20 && c.memory.visitCount >= 1
    ).length;
    if (doubtCount > 0) {
      const spotlightFactionId = philosophers.spotlightFactionIds[0];
      if (spotlightFactionId && philosophers.byFaction[spotlightFactionId]) {
        philosophers = {
          ...philosophers,
          byFaction: {
            ...philosophers.byFaction,
            [spotlightFactionId]: {
              ...philosophers.byFaction[spotlightFactionId],
              pressure: clamp(
                philosophers.byFaction[spotlightFactionId].pressure + doubtCount,
                0,
                100
              )
            }
          }
        };
      }
    }
  }

  return {
    ...state,
    characters: {
      ...characters,
      roster: updatedRoster
    },
    factions,
    philosophers,
    advisorHistory,
    nextId,
    eventFeed: [...feedItems, ...state.eventFeed]
  };
}
