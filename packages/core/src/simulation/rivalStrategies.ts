import type {
  DomainTag,
  EventFeedItem,
  FactionId,
  FactionState,
  GameState,
  RivalOraclesState,
  RivalOracleState,
  RivalStrategy
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

function clampPercent(value: number): number {
  return clamp(Math.round(value), 0, 100);
}

const STRATEGIES: RivalStrategy[] = ["aggressive", "subversive", "diplomatic"];
const DOMAINS: DomainTag[] = ["military", "economic", "spiritual"];

/**
 * Determine a rival's strategy based on their stats and patron.
 */
function determineStrategy(rival: RivalOracleState, seed: number): RivalStrategy {
  if (rival.strategy) {
    return rival.strategy;
  }
  const roll = hash(seed + rival.id.length * 17, `strategy-${rival.id}`);
  return STRATEGIES[Math.floor(roll * STRATEGIES.length)]!;
}

/**
 * Determine a rival's vulnerability domain.
 */
function determineVulnerability(rival: RivalOracleState, seed: number): DomainTag {
  if (rival.vulnerabilityDomain) {
    return rival.vulnerabilityDomain;
  }
  // Vulnerability is in a domain different from their favored one
  const filtered = DOMAINS.filter((d) => d !== rival.favoredDomain);
  const roll = hash(seed + rival.id.length * 23, `vuln-${rival.id}`);
  return filtered[Math.floor(roll * filtered.length)]!;
}

/**
 * Generate a narrative describing the rival's next planned operation.
 */
function generateOperationNarrative(rival: RivalOracleState, strategy: RivalStrategy): string {
  switch (strategy) {
    case "aggressive":
      return `${rival.name} is preparing a direct assault on Delphi's patron network, targeting gold reserves and credibility.`;
    case "subversive":
      return `${rival.name} is orchestrating a whisper campaign against Delphi, spreading doubt among the faithful.`;
    case "diplomatic":
      return `${rival.name} is courting alliances with factions hostile to Delphi, seeking to isolate the oracle politically.`;
  }
}

/**
 * Advance rival strategies on monthly tick.
 * Each strategy type produces different effects.
 */
export function advanceRivalStrategies(state: GameState): GameState {
  if (!state.rivalOracles) {
    return state;
  }

  const day = state.clock.day;
  let nextFactions = { ...state.factions };
  let nextGold = state.resources.gold.amount;
  const feedItems: EventFeedItem[] = [];

  const updatedRoster = state.rivalOracles.roster.map((rival) => {
    if (!rival.active) {
      return rival;
    }

    const strategy = determineStrategy(rival, state.worldSeed);
    const vulnerability = determineVulnerability(rival, state.worldSeed);
    const patron = nextFactions[rival.patronFactionId];

    // Determine if high intel reveals operations
    const highIntel = rival.intel >= 60;
    const operationNarrative = highIntel
      ? generateOperationNarrative(rival, strategy)
      : rival.currentOperationNarrative;

    // Determine if weakness is known (intel >= 70)
    const weaknessKnown = rival.intel >= 70 || rival.weaknessKnown === true;

    let updatedRival = {
      ...rival,
      strategy,
      vulnerabilityDomain: vulnerability,
      weaknessKnown,
      currentOperationNarrative: operationNarrative
    };

    // Apply strategy effects
    switch (strategy) {
      case "aggressive": {
        // Patron poaching: gold loss -5
        nextGold = Math.max(0, nextGold - 5);
        // Direct credibility attack: -2 to player's reputation via faction credibility erosion
        if (patron) {
          nextFactions = {
            ...nextFactions,
            [rival.patronFactionId]: {
              ...patron,
              credibility: clampPercent(patron.credibility + 2) // Rival's patron gains credibility
            }
          };
        }
        // Only surface to event feed when pressure is significant
        if (rival.pressure >= 40) {
          feedItems.push({
            id: `event-rival-aggressive-${rival.id}-${day}`,
            day,
            text: `${rival.name} aggressively poaches pilgrims, costing Delphi gold and credibility.`
          });
        }
        break;
      }
      case "subversive": {
        // Whisper campaign: credibility erosion -1/month on a random faction
        const factionIds = Object.keys(nextFactions) as FactionId[];
        const targetIdx = Math.floor(hash(state.worldSeed + day * 59 + rival.id.length, `subversive-target-${rival.id}`) * factionIds.length);
        const targetFactionId = factionIds[targetIdx]!;
        const targetFaction = nextFactions[targetFactionId];
        if (targetFaction) {
          nextFactions = {
            ...nextFactions,
            [targetFactionId]: {
              ...targetFaction,
              credibility: clampPercent(targetFaction.credibility - 1)
            }
          };
        }
        // Counter-rite: consultation quality -10% (represented as slight pythia debuff handled elsewhere)
        break;
      }
      case "diplomatic": {
        // Form alliances with factions, reduce player's faction relations
        if (patron) {
          // Rival's patron faction reduces favour toward player
          const factionIds = Object.keys(nextFactions) as FactionId[];
          for (const factionId of factionIds) {
            if (factionId === rival.patronFactionId) continue;
            const faction = nextFactions[factionId];
            if (!faction) continue;
            const relations = { ...faction.relations };
            const currentRelation = relations[rival.patronFactionId] ?? 50;
            // Rival diplomacy makes their patron's relations better with others, squeezing player
            relations[rival.patronFactionId] = clampPercent(currentRelation + 1);
            nextFactions = {
              ...nextFactions,
              [factionId]: { ...faction, relations }
            };
          }
        }
        break;
      }
    }

    return updatedRival;
  });

  // Check for defeated rivals (pressure -> 0)
  const finalRoster = updatedRoster.map((rival) => {
    if (rival.active && rival.pressure <= 0) {
      feedItems.push({
        id: `event-rival-defeated-${rival.id}-${day}`,
        day,
        text: `${rival.name} has been vanquished! Delphi's credibility surges as the rival oracle crumbles.`
      });
      return { ...rival, active: false };
    }
    return rival;
  });

  // Credibility surge for defeated rivals
  const defeatedCount = updatedRoster.filter((r) => r.active && r.pressure <= 0).length;
  let nextPythia = state.pythia;
  if (defeatedCount > 0) {
    nextPythia = {
      ...nextPythia,
      prestige: clampPercent(nextPythia.prestige + 10 * defeatedCount)
    };
  }

  const nextRivalOracles: RivalOraclesState = {
    ...state.rivalOracles,
    roster: finalRoster,
    totalPressure: finalRoster.length > 0
      ? Math.round(finalRoster.filter((r) => r.active).reduce((sum, r) => sum + r.pressure, 0) / Math.max(1, finalRoster.filter((r) => r.active).length))
      : 0
  };

  let nextState: GameState = {
    ...state,
    rivalOracles: nextRivalOracles,
    factions: nextFactions,
    pythia: nextPythia,
    resources: {
      ...state.resources,
      gold: { ...state.resources.gold, amount: nextGold }
    }
  };

  if (feedItems.length > 0) {
    nextState = {
      ...nextState,
      eventFeed: [...nextState.eventFeed, ...feedItems.slice(0, 1)].slice(0, 8)
    };
  }

  return nextState;
}
