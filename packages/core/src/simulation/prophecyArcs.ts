import type { DomainTag, EventFeedItem, FactionId, GameState, ProphecyRecord } from "../state/gameState";
import type {
  ProphecyArc,
  ProphecyArcMilestone,
  ProphecyContradiction,
  ProphecyFollowUp,
  ProphecyInterpretationBranch
} from "../state/prophecy";
import { createInitialProphecyArcState, detectContradiction } from "../state/prophecy";
import { getAbsoluteDay } from "./clock";

function hash(seed: number): number {
  let value = seed + 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function pick<T>(items: readonly T[], seed: number): T {
  return items[Math.floor(hash(seed) * items.length) % items.length]!;
}

/** Determines how many milestones to generate based on prophecy depth band */
function milestonesForDepthBand(depthBand: string | undefined): number {
  switch (depthBand) {
    case "oracular": return 4;
    case "deep": return 3;
    case "grounded": return 2;
    default: return 1;
  }
}

/** Duration in days for the arc based on the depth band */
function arcDurationForDepthBand(depthBand: string | undefined): number {
  switch (depthBand) {
    case "oracular": return 180;
    case "deep": return 120;
    case "grounded": return 60;
    default: return 30;
  }
}

const MILESTONE_LABELS_BY_DOMAIN: Record<DomainTag, string[]> = {
  military: ["Muster the forces", "First engagement reported", "Battle outcome known", "Campaign assessed"],
  economic: ["Trade routes respond", "Harvest yields measured", "Treasury impact felt", "Economic reckoning"],
  spiritual: ["Omens observed", "Rites performed in response", "Pilgrimage patterns shift", "Divine judgment rendered"]
};

/** Creates a ProphecyArc from a delivered prophecy record */
export function createProphecyArc(
  record: ProphecyRecord,
  state: GameState
): ProphecyArc | null {
  // Only create arcs for prophecies with meaningful depth
  if (!record.depthBand || record.depthBand === "shallow") {
    return null;
  }

  const domain = record.semantics[0]?.domain as DomainTag | undefined;
  if (!domain) {
    return null;
  }

  const absoluteDay = getAbsoluteDay(state.clock);
  const arcDuration = arcDurationForDepthBand(record.depthBand);
  const milestoneCount = milestonesForDepthBand(record.depthBand);
  const labels = MILESTONE_LABELS_BY_DOMAIN[domain] ?? MILESTONE_LABELS_BY_DOMAIN.spiritual;

  const milestones: ProphecyArcMilestone[] = Array.from({ length: milestoneCount }, (_, index) => ({
    id: `milestone-${record.id}-${index}`,
    label: labels[index] ?? `Milestone ${index + 1}`,
    dueDay: absoluteDay + Math.round((arcDuration / (milestoneCount + 1)) * (index + 1)),
    completed: false
  }));

  const followUps: ProphecyFollowUp[] = record.depthBand === "oracular" || record.depthBand === "deep"
    ? [{
        id: `followup-${record.id}-0`,
        kind: "reaffirmation" as const,
        dueDay: absoluteDay + Math.round(arcDuration * 0.5),
        fulfilled: false
      }]
    : [];

  const primaryTarget = record.semantics[0]?.target ?? "oracle";
  const label = `${primaryTarget[0]!.toUpperCase()}${primaryTarget.slice(1)} ${record.semantics[0]?.action ?? "prophecy"} arc`;

  // Count chain length: how many arcs this faction already has for the same domain
  const existingArcs = (state.prophecyArcs?.arcs ?? []).filter(
    (a) => a.factionId === record.factionId && a.domain === domain
  );
  const chainLength = existingArcs.length + 1;
  const isGrandProphecy = chainLength >= 3;

  return {
    id: `arc-${record.id}`,
    rootProphecyId: record.id,
    label,
    domain,
    factionId: record.factionId,
    startDay: absoluteDay,
    expectedEndDay: absoluteDay + arcDuration,
    status: "active",
    milestones,
    interpretationBranches: [],
    followUpObligations: followUps,
    chainLength,
    isGrandProphecy,
    grandProphecyBonus: isGrandProphecy ? 1.5 : undefined
  };
}

/** Generates interpretation branches from factions observing the prophecy */
function generateInterpretationBranches(
  arc: ProphecyArc,
  state: GameState,
  seed: number
): ProphecyInterpretationBranch[] {
  const factionIds = Object.keys(state.factions) as FactionId[];
  const relevantFactions = factionIds.filter((fId) => {
    const faction = state.factions[fId];
    if (!faction) return false;
    // The requesting faction + any faction with strong credibility stakes
    return fId === arc.factionId || faction.credibility > 50 || faction.favour > 40;
  });

  const alignments: ProphecyInterpretationBranch["alignment"][] = ["supportive", "hostile", "neutral", "exploitative"];
  const readingPhrases: Record<ProphecyInterpretationBranch["alignment"], string[]> = {
    supportive: [
      "sees this as validation of their own cause",
      "interprets the oracle's words as a mandate for their agenda"
    ],
    hostile: [
      "claims the prophecy was fabricated to undermine them",
      "warns that the oracle serves their rivals"
    ],
    neutral: [
      "waits for events to confirm or deny the reading",
      "records the prophecy without public comment"
    ],
    exploitative: [
      "twists the prophecy to justify new trade demands",
      "uses the reading to pressure neighboring states"
    ]
  };

  return relevantFactions.map((fId, index) => {
    const faction = state.factions[fId];
    const isRequester = fId === arc.factionId;
    const alignment = isRequester
      ? "supportive"
      : pick(alignments, seed + index * 7 + 3);
    const phrases = readingPhrases[alignment];
    const reading = `${faction?.name ?? fId} ${pick(phrases, seed + index * 11 + 5)}`;
    const influenceShift = alignment === "supportive" ? 3
      : alignment === "hostile" ? -4
      : alignment === "exploitative" ? -2
      : 0;

    return {
      factionId: fId,
      reading,
      alignment,
      influenceShift,
      adopted: isRequester
    };
  });
}

/** Advances all active prophecy arcs -- call monthly */
export function advanceProphecyArcs(state: GameState): GameState {
  const arcState = state.prophecyArcs ?? createInitialProphecyArcState();
  const currentDay = getAbsoluteDay(state.clock);

  // Skip if we already checked this day
  if (arcState.lastArcCheckDay >= currentDay) {
    return state;
  }

  let updatedArcs = arcState.arcs;
  const updatedContradictions = arcState.contradictions;
  let totalArcsCompleted = arcState.totalArcsCompleted;
  let newAdvisorMessages = [...state.advisorMessages];
  let nextFactions = state.factions;
  let nextId = state.nextId;
  let knowledgeFromArcs = 0;

  updatedArcs = updatedArcs.map((arc) => {
    if (arc.status !== "active") return arc;

    // Check milestones past due
    const updatedMilestones = arc.milestones.map((milestone) => {
      if (milestone.completed || milestone.dueDay > currentDay) return milestone;
      // Auto-complete milestone with a deterministic outcome
      const seed = state.worldSeed + milestone.dueDay * 31 + arc.startDay;
      const succeeded = hash(seed) > 0.35;
      return {
        ...milestone,
        completed: true,
        completedDay: currentDay,
        outcome: succeeded
          ? "Events confirmed this stage of the prophecy."
          : "This milestone passed without clear fulfillment."
      };
    });

    // Generate interpretation branches if we don't have any yet and first milestone was reached
    let branches = arc.interpretationBranches;
    if (branches.length === 0 && updatedMilestones.some((m) => m.completed)) {
      branches = generateInterpretationBranches(arc, state, state.worldSeed + arc.startDay);
    }

    // Check if arc has expired
    const allMilestonesProcessed = updatedMilestones.every((m) => m.completed);
    const pastEnd = currentDay >= arc.expectedEndDay;
    let status: ProphecyArc["status"] = arc.status;

    if (allMilestonesProcessed && pastEnd) {
      const successfulMilestones = updatedMilestones.filter((m) => m.outcome?.includes("confirmed")).length;
      status = successfulMilestones >= Math.ceil(updatedMilestones.length / 2) ? "fulfilled" : "failed";
      totalArcsCompleted += 1;
    }

    return {
      ...arc,
      status,
      milestones: updatedMilestones,
      interpretationBranches: branches
    };
  });

  // Apply credibility impacts for failed arcs
  for (const arc of updatedArcs) {
    if (arc.status === "failed" && !arcState.arcs.find((a) => a.id === arc.id && a.status === "failed")) {
      // This arc just failed in this tick
      const faction = nextFactions[arc.factionId];
      if (faction) {
        const failPenalty = Math.round(5 * (arc.grandProphecyBonus ?? 1));
        nextFactions = {
          ...nextFactions,
          [arc.factionId]: {
            ...faction,
            credibility: Math.max(0, faction.credibility - failPenalty)
          }
        };
        newAdvisorMessages = [
          {
            id: `advisor-arc-failed-${nextId}`,
            advisorId: "high_priest",
            text: `The prophecy arc "${arc.label}" has failed to manifest. ${faction.name}'s trust in Delphi may waver.`,
            severity: "warn" as const
          },
          ...newAdvisorMessages
        ].slice(0, 6);
        nextId += 1;
      }
    }
    if (arc.status === "fulfilled" && !arcState.arcs.find((a) => a.id === arc.id && a.status === "fulfilled")) {
      const faction = nextFactions[arc.factionId];
      if (faction) {
        const fulfillBonus = Math.round(4 * (arc.grandProphecyBonus ?? 1));
        nextFactions = {
          ...nextFactions,
          [arc.factionId]: {
            ...faction,
            credibility: Math.min(100, faction.credibility + fulfillBonus)
          }
        };
      }
      // Knowledge bonus from fulfilled arc
      knowledgeFromArcs += 1;
    }
  }

  // Apply knowledge from fulfilled arcs
  let nextResources = state.resources;
  if (knowledgeFromArcs > 0 && nextResources.knowledge) {
    nextResources = {
      ...nextResources,
      knowledge: {
        ...nextResources.knowledge,
        amount: nextResources.knowledge.amount + knowledgeFromArcs,
        trend: knowledgeFromArcs
      }
    };
  }

  return {
    ...state,
    nextId,
    factions: nextFactions,
    resources: nextResources,
    advisorMessages: newAdvisorMessages,
    prophecyArcs: {
      arcs: updatedArcs,
      contradictions: updatedContradictions,
      totalArcsCompleted,
      totalContradictions: arcState.totalContradictions,
      lastArcCheckDay: currentDay
    }
  };
}

/** Scans all existing prophecy records for contradictions with a new prophecy */
export function scanForContradictions(
  state: GameState,
  newRecord: ProphecyRecord
): { contradictions: ProphecyContradiction[]; advisorMessages: GameState["advisorMessages"] } {
  const arcState = state.prophecyArcs ?? createInitialProphecyArcState();
  const existingRecords = state.consultation.history;
  const currentDay = getAbsoluteDay(state.clock);
  const found: ProphecyContradiction[] = [];
  let advisorMessages = [...state.advisorMessages];
  let nextId = state.nextId;

  const newSemantics = newRecord.semantics.map((s) => ({
    target: s.target,
    action: s.action,
    polarity: s.polarity,
    domain: s.domain
  }));

  for (const existing of existingRecords) {
    if (existing.id === newRecord.id) continue;
    if (existing.resolved) continue;

    const existingSemantics = existing.semantics.map((s) => ({
      target: s.target,
      action: s.action,
      polarity: s.polarity,
      domain: s.domain
    }));

    const contradiction = detectContradiction(
      { id: existing.id, semantics: existingSemantics },
      { id: newRecord.id, semantics: newSemantics },
      currentDay
    );

    if (contradiction) {
      // Check we haven't already detected this exact pair
      const alreadyKnown = arcState.contradictions.some(
        (c) =>
          (c.prophecyIdA === contradiction.prophecyIdA && c.prophecyIdB === contradiction.prophecyIdB) ||
          (c.prophecyIdA === contradiction.prophecyIdB && c.prophecyIdB === contradiction.prophecyIdA)
      );
      if (!alreadyKnown) {
        found.push(contradiction);
        advisorMessages = [
          {
            id: `advisor-contradiction-${nextId}`,
            advisorId: "high_priest",
            text: `A ${contradiction.severity} contradiction detected: ${contradiction.description}. Delphi's credibility is at stake.`,
            severity: contradiction.severity === "catastrophic" ? "critical" as const : "warn" as const
          },
          ...advisorMessages
        ].slice(0, 6);
        nextId += 1;
      }
    }
  }

  return { contradictions: found, advisorMessages };
}

/** Resolves due follow-up obligations on active prophecy arcs -- call monthly */
export function resolveFollowUp(state: GameState): GameState {
  const arcState = state.prophecyArcs ?? createInitialProphecyArcState();
  const currentDay = getAbsoluteDay(state.clock);

  let nextFactions = state.factions;
  let nextEventFeed = state.eventFeed;
  let nextConsultation = state.consultation;
  let changed = false;

  const updatedArcs = arcState.arcs.map((arc) => {
    if (arc.status !== "active") return arc;

    const updatedFollowUps = arc.followUpObligations.map((followUp) => {
      // Skip already-resolved or not-yet-due follow-ups
      if (followUp.fulfilledDay !== undefined || followUp.dueDay > currentDay) return followUp;

      changed = true;

      if (followUp.fulfilled) {
        // Fulfilled follow-up: credibility bonus (+2) + belief strength boost (+5)
        const faction = nextFactions[arc.factionId];
        if (faction) {
          nextFactions = {
            ...nextFactions,
            [arc.factionId]: {
              ...faction,
              credibility: Math.min(100, faction.credibility + 2)
            }
          };
        }

        // Boost belief strength on the root prophecy record
        const historyIndex = nextConsultation.history.findIndex((r) => r.id === arc.rootProphecyId);
        if (historyIndex >= 0) {
          const record = nextConsultation.history[historyIndex]!;
          if (record.beliefStrength !== undefined) {
            const updatedHistory = [...nextConsultation.history];
            updatedHistory[historyIndex] = {
              ...record,
              beliefStrength: Math.min(100, record.beliefStrength + 5)
            };
            nextConsultation = { ...nextConsultation, history: updatedHistory };
          }
        }

        nextEventFeed = [
          {
            id: `event-followup-fulfilled-${arc.id}-${followUp.id}`,
            day: state.clock.day,
            text: `The ${followUp.kind} obligation for "${arc.label}" has been fulfilled, strengthening Delphi's authority.`
          },
          ...nextEventFeed
        ].slice(0, 8);

        return { ...followUp, fulfilledDay: currentDay };
      } else {
        // Unfulfilled follow-up: credibility penalty (-3)
        const faction = nextFactions[arc.factionId];
        if (faction) {
          nextFactions = {
            ...nextFactions,
            [arc.factionId]: {
              ...faction,
              credibility: Math.max(0, faction.credibility - 3)
            }
          };
        }

        nextEventFeed = [
          {
            id: `event-followup-unfulfilled-${arc.id}-${followUp.id}`,
            day: state.clock.day,
            text: `The ${followUp.kind} obligation for "${arc.label}" went unfulfilled. ${nextFactions[arc.factionId]?.name ?? arc.factionId}'s trust in the oracle wavers.`
          },
          ...nextEventFeed
        ].slice(0, 8);

        return { ...followUp, fulfilledDay: currentDay };
      }
    });

    if (updatedFollowUps === arc.followUpObligations) return arc;
    return { ...arc, followUpObligations: updatedFollowUps };
  });

  if (!changed) return state;

  return {
    ...state,
    factions: nextFactions,
    eventFeed: nextEventFeed,
    consultation: nextConsultation,
    prophecyArcs: {
      ...arcState,
      arcs: updatedArcs
    }
  };
}

/** Resolves unresolved contradictions on prophecy arcs -- call monthly */
export function resolveContradictions(state: GameState): GameState {
  const arcState = state.prophecyArcs ?? createInitialProphecyArcState();
  const unresolvedContradictions = arcState.contradictions.filter((c) => !c.resolved);

  if (unresolvedContradictions.length === 0) return state;

  let nextFactions = state.factions;
  let nextEventFeed = state.eventFeed;
  let totalContradictions = arcState.totalContradictions;
  let nextCampaign = state.campaign;

  const updatedContradictions = arcState.contradictions.map((contradiction) => {
    if (contradiction.resolved) return contradiction;

    // Apply credibility impact (-5) to the faction that noticed the contradiction
    // Find the arc associated with one of the prophecies to determine the faction
    const relatedArc = arcState.arcs.find(
      (a) => a.rootProphecyId === contradiction.prophecyIdA || a.rootProphecyId === contradiction.prophecyIdB
    );
    const factionId = relatedArc?.factionId;

    if (factionId) {
      const faction = nextFactions[factionId];
      if (faction) {
        nextFactions = {
          ...nextFactions,
          [factionId]: {
            ...faction,
            credibility: Math.max(0, faction.credibility - 5)
          }
        };
      }
    }

    // Generate narrative event
    nextEventFeed = [
      {
        id: `event-contradiction-resolved-${contradiction.id}`,
        day: state.clock.day,
        text: `A ${contradiction.severity} contradiction in Delphi's prophecies has been publicly acknowledged: ${contradiction.description}.`
      },
      ...nextEventFeed
    ].slice(0, 8);

    totalContradictions += 1;

    // Catastrophic contradictions (oracular depth band arcs) trigger crisis chain event
    if (contradiction.severity === "catastrophic") {
      const targetNode = nextCampaign.worldMap.nodes.find(
        (n) => n.controllingFactionId === factionId
      ) ?? nextCampaign.worldMap.nodes[0];

      if (targetNode) {
        const crisisChain = {
          id: `crisis-contradiction-${contradiction.id}`,
          label: `Oracular Crisis: ${contradiction.description}`,
          nodeId: targetNode.id,
          factionId,
          stage: "active" as const,
          pressure: 60,
          stepsCompleted: 0
        };

        nextCampaign = {
          ...nextCampaign,
          worldMap: {
            ...nextCampaign.worldMap,
            crisisChains: [...nextCampaign.worldMap.crisisChains, crisisChain]
          }
        };

        nextEventFeed = [
          {
            id: `event-crisis-contradiction-${contradiction.id}`,
            day: state.clock.day,
            text: `The catastrophic contradiction has triggered a crisis of faith across the Hellenic world. Delphi's very legitimacy is questioned.`
          },
          ...nextEventFeed
        ].slice(0, 8);
      }
    }

    // Set arc status to "contradicted" for related arcs
    return {
      ...contradiction,
      resolved: true,
      resolutionReport: `Contradiction resolved on day ${state.clock.day}: ${contradiction.description}`
    };
  });

  // Update arc statuses for contradicted arcs
  const updatedArcs = arcState.arcs.map((arc) => {
    if (arc.status !== "active") return arc;
    const hasContradiction = updatedContradictions.some(
      (c) =>
        c.resolved &&
        !arcState.contradictions.find((oc) => oc.id === c.id)?.resolved &&
        (c.prophecyIdA === arc.rootProphecyId || c.prophecyIdB === arc.rootProphecyId)
    );
    if (hasContradiction) {
      return { ...arc, status: "contradicted" as const };
    }
    return arc;
  });

  return {
    ...state,
    factions: nextFactions,
    eventFeed: nextEventFeed,
    campaign: nextCampaign,
    prophecyArcs: {
      ...arcState,
      arcs: updatedArcs,
      contradictions: updatedContradictions,
      totalContradictions
    }
  };
}
