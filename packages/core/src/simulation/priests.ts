import type {
  EventFeedItem,
  GameState,
  PriestPersonality,
  PriestState
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

const PERSONALITIES: PriestPersonality[] = ["devout", "ambitious", "scholarly", "political", "mystical"];

function assignPersonality(priest: PriestState, worldSeed: number): PriestPersonality {
  const roll = hash(worldSeed, `personality:${priest.id}`);
  return PERSONALITIES[Math.floor(roll * PERSONALITIES.length) % PERSONALITIES.length]!;
}

function computeGrievances(priest: PriestState, state: GameState): string[] {
  const grievances: string[] = [...(priest.grievances ?? [])];

  // Idle priests (no assignment) get a grievance
  if (!priest.currentAssignmentBuildingId) {
    const idleGrievance = "idle without assignment";
    if (!grievances.includes(idleGrievance)) {
      grievances.push(idleGrievance);
    }
  }

  // Overworked: assigned to a damaged building
  if (priest.currentAssignmentBuildingId) {
    const building = state.buildings.find(
      (b) => b.id === priest.currentAssignmentBuildingId
    );
    if (building && building.condition < building.maxCondition * 0.3) {
      const overworkedGrievance = "assigned to damaged building";
      if (!grievances.includes(overworkedGrievance)) {
        grievances.push(overworkedGrievance);
      }
    }
  }

  return grievances;
}

export function advancePriestExperience(state: GameState): GameState {
  const feedItems: EventFeedItem[] = [];
  let nextId = state.nextId;

  const updatedPriests = state.priests.map((priest) => {
    let experience = priest.experience ?? 0;
    let loyalty = priest.loyalty ?? 50;
    const personality = priest.personality ?? assignPersonality(priest, state.worldSeed);

    // Priests assigned to buildings: +1 experience per month
    if (priest.currentAssignmentBuildingId) {
      experience = clamp(experience + 1, 0, 100);
    }

    // Check for successful consultation involvement:
    // If priest was assigned during a consultation that resulted in a prophecy this month
    if (priest.currentAssignmentBuildingId) {
      const recentProphecies = state.consultation.history.filter(
        (prophecy) => !prophecy.resolved && prophecy.dayIssued >= state.clock.day - 30
      );
      if (recentProphecies.length > 0) {
        experience = clamp(experience + 3, 0, 100);
      }
    }

    // Excavation find bonus: check if excavation had recent discoveries
    if (
      state.excavation &&
      state.excavation.relics.length > 0 &&
      priest.currentAssignmentBuildingId
    ) {
      const recentRelics = state.excavation.relics.filter(
        (relic) => "discoveredDay" in relic && typeof relic.discoveredDay === "number" && relic.discoveredDay >= state.clock.day - 30
      );
      if (recentRelics.length > 0) {
        experience = clamp(experience + 5, 0, 100);
      }
    }

    // Compute grievances
    const grievances = computeGrievances(priest, state);

    // 3+ grievances: loyalty decreases by 5/month
    if (grievances.length >= 3) {
      loyalty = clamp(loyalty - 5, 0, 100);
    }

    // Low loyalty (<20): trigger defection risk warning
    if (loyalty < 20) {
      const walker = state.walkers.find((w) => w.id === priest.walkerId);
      const priestName = walker?.name ?? priest.id;
      feedItems.push({
        id: `event-priest-defection-risk-${nextId}`,
        day: state.clock.day,
        text: `${priestName}'s loyalty to the oracle wavers dangerously. Defection is possible.`
      });
      nextId += 1;
    }

    return {
      ...priest,
      experience,
      personality,
      loyalty,
      grievances
    } satisfies PriestState;
  });

  return {
    ...state,
    priests: updatedPriests,
    nextId,
    eventFeed: [...feedItems, ...state.eventFeed]
  };
}
