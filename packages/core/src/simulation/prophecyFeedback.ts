import type {
  FactionId,
  FactionAgenda,
  FactionState,
  GameState,
  ProphecyRecord,
  ProphecyReinterpretation,
  ProphecyReinterpretationSpin
} from "../state/gameState";

function hash(seed: number, salt: string): number {
  let value = seed ^ 0x9e3779b9;
  for (let index = 0; index < salt.length; index += 1) {
    value = Math.imul(value ^ salt.charCodeAt(index), 0x45d9f3b);
    value ^= value >>> 15;
  }
  return (value >>> 0) / 4294967296;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const SPIN_NARRATIVES: Record<ProphecyReinterpretationSpin, string[]> = {
  supportive: [
    "embraces the oracle's words as confirmation of their own ambitions",
    "finds common cause with the prophecy's implications",
    "uses the reading to rally support for their agenda"
  ],
  hostile: [
    "denounces the prophecy as a fabrication serving rival interests",
    "claims the oracle has been corrupted by foreign influence",
    "publicly questions whether Delphi speaks for the gods at all"
  ],
  exploitative: [
    "twists the prophecy's meaning to justify aggressive expansion",
    "reframes the oracle's words to pressure neighboring states",
    "uses the reading as leverage in ongoing trade negotiations"
  ],
  dismissive: [
    "shrugs off the prophecy as irrelevant to their affairs",
    "notes the oracle's words with polite indifference",
    "records the prophecy without comment or action"
  ]
};

const AGENDAS: FactionAgenda[] = ["war", "trade", "faith", "succession"];

/**
 * Determines the spin a faction applies to a prophecy based on faction profile,
 * relations with the requesting faction, and how relevant the prophecy domain is.
 */
function determineSpin(
  state: GameState,
  factionId: FactionId,
  originalFactionId: FactionId,
  prophecyRecord: ProphecyRecord,
  seed: number
): ProphecyReinterpretationSpin {
  const faction = state.factions[factionId];
  if (!faction) return "dismissive";

  const originalFaction = state.factions[originalFactionId];
  if (!originalFaction) return "dismissive";

  const relation = faction.relations[originalFactionId] ?? 0;
  const isAtWar = faction.activeConflicts.includes(originalFactionId);
  const prophecyDomain = prophecyRecord.semantics[0]?.domain;
  const agendaAligned = (prophecyDomain === "military" && faction.currentAgenda === "war")
    || (prophecyDomain === "economic" && faction.currentAgenda === "trade")
    || (prophecyDomain === "spiritual" && faction.currentAgenda === "faith");

  // Strong hostility or active conflict -> hostile
  if (isAtWar || relation < -30) {
    return "hostile";
  }

  // Good relations -> supportive
  if (relation > 30 && faction.credibility > 40) {
    return "supportive";
  }

  // Agenda alignment with low relations -> exploitative
  if (agendaAligned && relation <= 10) {
    return "exploitative";
  }

  // Use deterministic hash for remaining ambiguous cases
  const roll = hash(seed, `${factionId}:spin`);
  if (roll < 0.3) return "supportive";
  if (roll < 0.55) return "hostile";
  if (roll < 0.75) return "exploitative";
  return "dismissive";
}

/**
 * Generates 2-3 reinterpretations from non-requesting factions after prophecy delivery.
 */
export function generateReinterpretations(
  state: GameState,
  prophecyRecord: ProphecyRecord
): ProphecyReinterpretation[] {
  const factionIds = Object.keys(state.factions) as FactionId[];
  const nonRequestingFactions = factionIds.filter((fId) => fId !== prophecyRecord.factionId);

  if (nonRequestingFactions.length === 0) return [];

  const baseSeed = state.worldSeed + prophecyRecord.dayIssued * 13;

  // Determine count: 2-3 reinterpretations
  const countRoll = hash(baseSeed, "reinterpretation-count");
  const count = countRoll < 0.5 ? 2 : 3;

  // Select factions deterministically
  const sortedFactions = [...nonRequestingFactions].sort((a, b) => {
    const scoreA = hash(baseSeed, `pick:${a}`);
    const scoreB = hash(baseSeed, `pick:${b}`);
    return scoreA - scoreB;
  });
  const selectedFactions = sortedFactions.slice(0, Math.min(count, sortedFactions.length));

  const prophecyDomain = prophecyRecord.semantics[0]?.domain;

  return selectedFactions.map((factionId, index) => {
    const seed = baseSeed + index * 37;
    const spin = determineSpin(state, factionId, prophecyRecord.factionId, prophecyRecord, seed);

    const narratives = SPIN_NARRATIVES[spin];
    const narrativeIndex = Math.floor(hash(seed, `${factionId}:narrative`) * narratives.length);
    const factionName = state.factions[factionId]?.name ?? factionId;
    const narrative = `${factionName} ${narratives[narrativeIndex]}`;

    let credibilityImpact: number;
    switch (spin) {
      case "hostile":
        credibilityImpact = -Math.round(2 + hash(seed, `${factionId}:impact`) * 3);
        break;
      case "exploitative":
        credibilityImpact = -Math.round(1 + hash(seed, `${factionId}:impact`) * 2);
        break;
      case "supportive":
        credibilityImpact = Math.round(1 + hash(seed, `${factionId}:impact`) * 2);
        break;
      case "dismissive":
        credibilityImpact = -1;
        break;
    }

    // Behavior shift: exploitative spin shifts to random agenda,
    // hostile spin on war-domain prophecy shifts toward war agenda
    let behaviorShift: FactionAgenda | undefined;
    if (spin === "exploitative") {
      const agendaRoll = Math.floor(hash(seed, `${factionId}:agenda`) * AGENDAS.length);
      behaviorShift = AGENDAS[agendaRoll];
    } else if (spin === "hostile" && prophecyDomain === "military") {
      behaviorShift = "war";
    } else if (spin === "supportive" && prophecyDomain === "spiritual") {
      behaviorShift = "faith";
    }

    return {
      id: `reinterp-${prophecyRecord.id}-${factionId}`,
      prophecyId: prophecyRecord.id,
      factionId,
      originalFactionId: prophecyRecord.factionId,
      spin,
      narrative,
      credibilityImpact,
      behaviorShift,
      dayCreated: prophecyRecord.dayIssued
    };
  });
}

/**
 * Advances belief strength for all unresolved prophecy records.
 * Called monthly. Modifies belief +-3-8 per month based on conditions.
 */
export function advanceBeliefStrength(state: GameState): GameState {
  const history = state.consultation.history;
  let changed = false;
  let updatedHistory = history;

  for (let i = 0; i < history.length; i++) {
    const record = history[i]!;
    if (record.resolved) continue;
    if (record.beliefStrength === undefined) continue;

    const faction = state.factions[record.factionId];
    if (!faction) continue;

    const reinterpretations = record.reinterpretations ?? [];
    const supportiveCount = reinterpretations.filter((r) => r.spin === "supportive").length;
    const hostileCount = reinterpretations.filter((r) => r.spin === "hostile").length;

    // Philosopher threat pressure
    const philosopherPressure = state.philosophers
      ? Object.values(state.philosophers.byFaction).reduce(
          (sum, p) => sum + (p.active ? p.pressure : 0),
          0
        ) / Math.max(1, Object.keys(state.philosophers.byFaction).length)
      : 0;

    // Rival oracle pressure
    const rivalPressure = state.rivalOracles?.totalPressure ?? 0;

    // Growth conditions
    const highCredibility = faction.credibility > 60;
    const supportiveDominates = supportiveCount > hostileCount;
    const lowPhilosopherThreats = philosopherPressure < 30;

    // Decay conditions
    const hostileDominates = hostileCount > supportiveCount;
    const highRivalPressure = rivalPressure > 50;

    const seed = state.worldSeed + state.clock.month * 7 + i * 11;
    const magnitude = 3 + Math.round(hash(seed, `belief:${record.id}`) * 5); // 3-8

    let delta = 0;
    if (highCredibility && supportiveDominates && lowPhilosopherThreats) {
      delta = magnitude;
    } else if (hostileDominates || highRivalPressure) {
      delta = -magnitude;
    } else if (highCredibility) {
      delta = Math.round(magnitude * 0.4);
    } else {
      delta = -Math.round(magnitude * 0.3);
    }

    const newStrength = clamp(record.beliefStrength + delta, 0, 100);
    if (newStrength === record.beliefStrength) continue;

    if (!changed) {
      updatedHistory = [...history];
      changed = true;
    }

    updatedHistory[i] = {
      ...record,
      beliefStrength: newStrength
    };
  }

  if (!changed) return state;

  // Check for high-belief prophecies that should influence world events
  let eventFeed = state.eventFeed;
  for (const record of updatedHistory) {
    if (
      record.beliefStrength !== undefined
      && record.beliefStrength > 70
      && !record.resolved
    ) {
      const originalRecord = history.find((r) => r.id === record.id);
      if (originalRecord?.beliefStrength !== undefined && originalRecord.beliefStrength <= 70) {
        // Just crossed the threshold
        const factionName = state.factions[record.factionId]?.name ?? record.factionId;
        eventFeed = [
          {
            id: `event-belief-${record.id}-${state.clock.day}`,
            day: state.clock.day,
            text: `The prophecy delivered to ${factionName} has taken root in the minds of the people, shaping events across Hellas.`
          },
          ...eventFeed
        ].slice(0, 8);
      }
    }
  }

  return {
    ...state,
    consultation: {
      ...state.consultation,
      history: updatedHistory
    },
    eventFeed
  };
}

/**
 * Applies behavior shifts from reinterpretations to faction agendas.
 * Called from advancePoliticalClimate to wire reinterpretation behavior into politics.
 * - Hostile reinterpretation of war prophecy → 30% chance faction shifts to war agenda
 * - Supportive reinterpretation of faith prophecy → 20% chance faction shifts to faith agenda
 */
export function applyBehaviorShifts(
  factions: Record<FactionId, FactionState>,
  state: GameState
): Record<FactionId, FactionState> {
  const history = state.consultation.history;
  let updatedFactions = factions;

  for (const record of history) {
    if (record.resolved) continue;
    const reinterpretations = record.reinterpretations ?? [];

    for (const reinterp of reinterpretations) {
      if (!reinterp.behaviorShift) continue;

      const faction = updatedFactions[reinterp.factionId];
      if (!faction) continue;

      // Already on this agenda, skip
      if (faction.currentAgenda === reinterp.behaviorShift) continue;

      const seed = state.worldSeed + state.clock.month * 17 + reinterp.dayCreated * 7;
      const roll = hash(seed, `shift:${reinterp.factionId}:${reinterp.prophecyId}`);

      // Hostile war reinterpretation: 30% chance to shift to war
      if (reinterp.spin === "hostile" && reinterp.behaviorShift === "war") {
        if (roll < 0.3) {
          updatedFactions = {
            ...updatedFactions,
            [reinterp.factionId]: {
              ...faction,
              currentAgenda: "war"
            }
          };
        }
        continue;
      }

      // Supportive faith reinterpretation: 20% chance to shift to faith
      if (reinterp.spin === "supportive" && reinterp.behaviorShift === "faith") {
        if (roll < 0.2) {
          updatedFactions = {
            ...updatedFactions,
            [reinterp.factionId]: {
              ...faction,
              currentAgenda: "faith"
            }
          };
        }
        continue;
      }
    }
  }

  return updatedFactions;
}

/**
 * Applies influence shifts from completed interpretation branches.
 * - Supportive branch: +3 relation with oracle-aligned factions
 * - Hostile branch: -3 relation, potential embargo trigger if relations drop below -40
 */
export function applyInterpretationBranchEffects(state: GameState): GameState {
  const arcState = state.prophecyArcs;
  if (!arcState) return state;

  let nextFactions = state.factions;
  let nextEventFeed = state.eventFeed;

  for (const arc of arcState.arcs) {
    if (arc.status !== "active" && arc.status !== "fulfilled") continue;

    for (const branch of arc.interpretationBranches) {
      if (!branch.adopted) continue;

      const branchFaction = nextFactions[branch.factionId];
      if (!branchFaction) continue;

      // Apply influence shift to bilateral relations with the arc's requesting faction
      if (branch.factionId === arc.factionId) continue; // Skip self-relations

      const currentRelation = branchFaction.relations[arc.factionId] ?? 0;
      let delta: number;

      if (branch.alignment === "supportive") {
        delta = 3;
      } else if (branch.alignment === "hostile") {
        delta = -3;
      } else {
        continue; // neutral/exploitative don't apply direct relation shifts here
      }

      const newRelation = Math.max(-100, Math.min(100, currentRelation + delta));

      // Update both sides of the relation
      const arcFaction = nextFactions[arc.factionId];
      if (!arcFaction) continue;

      const arcRelation = arcFaction.relations[branch.factionId] ?? 0;
      const newArcRelation = Math.max(-100, Math.min(100, arcRelation + delta));

      nextFactions = {
        ...nextFactions,
        [branch.factionId]: {
          ...branchFaction,
          relations: {
            ...branchFaction.relations,
            [arc.factionId]: newRelation
          },
          // Trigger embargo if hostile and relations drop below -40
          embargoes: branch.alignment === "hostile" && newRelation < -40
            && !branchFaction.embargoes.includes(arc.factionId)
            ? [...branchFaction.embargoes, arc.factionId]
            : branchFaction.embargoes
        },
        [arc.factionId]: {
          ...nextFactions[arc.factionId]!,
          relations: {
            ...nextFactions[arc.factionId]!.relations,
            [branch.factionId]: newArcRelation
          }
        }
      };

      // Emit embargo event
      if (branch.alignment === "hostile" && newRelation < -40 && !branchFaction.embargoes.includes(arc.factionId)) {
        nextEventFeed = [
          {
            id: `event-embargo-branch-${arc.id}-${branch.factionId}`,
            day: state.clock.day,
            text: `${branchFaction.name} has declared an embargo against ${arcFaction.name}, provoked by hostile readings of the prophecy.`
          },
          ...nextEventFeed
        ].slice(0, 8);
      }
    }
  }

  return {
    ...state,
    factions: nextFactions,
    eventFeed: nextEventFeed
  };
}
