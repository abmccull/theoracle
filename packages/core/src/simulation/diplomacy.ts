import type {
  EventFeedItem,
  FactionDemand,
  FactionDemandType,
  FactionId,
  FactionState,
  GameState,
  Treaty
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

const DEMAND_TYPES: FactionDemandType[] = ["tribute", "exclusive_consultation", "favorable_reading", "resource_access"];
const DEMAND_DESCRIPTIONS: Record<FactionDemandType, string> = {
  tribute: "demands a tribute of gold to maintain their favor",
  exclusive_consultation: "demands exclusive consultation rights for a season",
  favorable_reading: "demands a favorable reading for their next campaign",
  resource_access: "demands preferential access to sacred resources"
};

const MONTHS_PER_OBLIGATION_CHECK = 3;
const DAYS_PER_MONTH = 30;

/**
 * Advance diplomacy systems on monthly tick.
 * Processes active treaties, generates faction demands, and handles expired demands.
 */
export function advanceDiplomacy(state: GameState): GameState {
  const day = state.clock.day;
  const treaties = state.treaties ?? [];
  const demands = state.demands ?? [];
  const feedItems: EventFeedItem[] = [];
  let nextFactions = { ...state.factions };
  let nextGold = state.resources.gold.amount;
  let nextCredibility = 0; // accumulator for pythia prestige changes

  // --- Process active treaties ---
  const nextTreaties: Treaty[] = [];
  for (const treaty of treaties) {
    if (!treaty.active) {
      nextTreaties.push(treaty);
      continue;
    }

    // Deduct monthly gold
    if (treaty.goldPerMonth > 0) {
      if (nextGold >= treaty.goldPerMonth) {
        nextGold -= treaty.goldPerMonth;
      } else {
        // Cannot afford: break the treaty
        nextTreaties.push({ ...treaty, active: false, obligationsMet: false });
        const faction = nextFactions[treaty.factionId];
        if (faction) {
          nextFactions = {
            ...nextFactions,
            [treaty.factionId]: {
              ...faction,
              credibility: clampPercent(faction.credibility - 5),
              favour: clampPercent(faction.favour - 10)
            }
          };
        }
        feedItems.push({
          id: `event-treaty-break-${treaty.id}-${day}`,
          day,
          text: `Treaty with ${nextFactions[treaty.factionId]?.name ?? treaty.factionId} has broken down due to unpaid obligations.`
        });
        continue;
      }
    }

    // Check obligation fulfillment after 3 months
    const monthsActive = Math.floor((day - treaty.startDay) / DAYS_PER_MONTH);
    if (monthsActive > 0 && monthsActive % MONTHS_PER_OBLIGATION_CHECK === 0) {
      // Obligation check: faction must still be allied (favour > 20)
      const faction = nextFactions[treaty.factionId];
      if (faction && faction.favour < 20) {
        nextTreaties.push({ ...treaty, active: false, obligationsMet: false });
        nextFactions = {
          ...nextFactions,
          [treaty.factionId]: {
            ...faction,
            credibility: clampPercent(faction.credibility - 5),
            favour: clampPercent(faction.favour - 10)
          }
        };
        feedItems.push({
          id: `event-treaty-unfulfilled-${treaty.id}-${day}`,
          day,
          text: `Treaty with ${faction.name} collapsed after obligations went unfulfilled for too long.`
        });
        continue;
      }
    }

    // Apply treaty benefits
    const faction = nextFactions[treaty.factionId];
    if (faction) {
      switch (treaty.kind) {
        case "trade_access":
          // +10% trade offers from faction handled via tradeAccess flag
          if (!faction.tradeAccess) {
            nextFactions = {
              ...nextFactions,
              [treaty.factionId]: { ...faction, tradeAccess: true }
            };
          }
          break;
        case "mutual_defense":
          // Faction helps vs rivals: reduce rival pressure targeting this faction's patron
          break;
        case "consultation_priority":
          // Faction consults more often: boost favour slightly each month
          nextFactions = {
            ...nextFactions,
            [treaty.factionId]: {
              ...faction,
              favour: clampPercent(faction.favour + 1)
            }
          };
          break;
      }
    }

    nextTreaties.push({ ...treaty, obligationsMet: true });
  }

  // Apply mutual_defense treaty benefits to rival pressure
  let nextRivalOracles = state.rivalOracles;
  const defenseAllies = nextTreaties.filter((t) => t.active && t.kind === "mutual_defense");
  if (defenseAllies.length > 0 && nextRivalOracles) {
    const allyFactionIds = new Set(defenseAllies.map((t) => t.factionId));
    const updatedRoster = nextRivalOracles.roster.map((rival) => {
      if (allyFactionIds.has(rival.patronFactionId)) {
        // Allied factions' rival oracles face reduced pressure
        return { ...rival, pressure: clampPercent(rival.pressure - 2) };
      }
      return rival;
    });
    nextRivalOracles = { ...nextRivalOracles, roster: updatedRoster };
  }

  // --- Generate new demands ---
  const nextDemands: FactionDemand[] = [];
  for (const demand of demands) {
    if (demand.resolved) {
      nextDemands.push(demand);
      continue;
    }

    // Check expiration
    if (day > demand.expiresDay) {
      const faction = nextFactions[demand.factionId];
      if (faction) {
        nextFactions = {
          ...nextFactions,
          [demand.factionId]: {
            ...faction,
            credibility: clampPercent(faction.credibility - 3),
            favour: clampPercent(faction.favour - 5)
          }
        };
      }
      feedItems.push({
        id: `event-demand-expired-${demand.id}-${day}`,
        day,
        text: `An unanswered demand from ${nextFactions[demand.factionId]?.name ?? demand.factionId} has damaged your standing.`
      });
      nextDemands.push({ ...demand, resolved: true });
      continue;
    }

    nextDemands.push(demand);
  }

  // Generate new demands from high-credibility factions (10% chance per faction per month)
  const factionEntries = Object.entries(nextFactions) as [FactionId, FactionState][];
  for (const [factionId, faction] of factionEntries) {
    if (faction.credibility <= 60 || faction.favour <= 30) {
      continue;
    }

    const roll = hash(state.worldSeed + day * 47 + factionId.length * 31, `demand-${factionId}-${day}`);
    if (roll > 0.10) {
      continue;
    }

    // Don't generate if faction already has unresolved demand
    if (nextDemands.some((d) => d.factionId === factionId && !d.resolved)) {
      continue;
    }

    const typeRoll = hash(state.worldSeed + day * 53 + factionId.length * 37, `demand-type-${factionId}-${day}`);
    const demandType = DEMAND_TYPES[Math.floor(typeRoll * DEMAND_TYPES.length)]!;
    const goldAmount = demandType === "tribute"
      ? Math.round(10 + hash(state.worldSeed + day * 61 + factionId.length * 41, `demand-gold-${factionId}`) * 20)
      : undefined;

    const newDemand: FactionDemand = {
      id: `demand-${factionId}-${day}`,
      factionId,
      demandType,
      description: `${faction.name} ${DEMAND_DESCRIPTIONS[demandType]}`,
      goldAmount,
      dayIssued: day,
      expiresDay: day + DAYS_PER_MONTH * 2,
      resolved: false
    };

    nextDemands.push(newDemand);
    feedItems.push({
      id: `event-demand-new-${newDemand.id}`,
      day,
      text: `${faction.name} ${DEMAND_DESCRIPTIONS[demandType]}.`
    });
  }

  // --- Apply changes ---
  let nextState: GameState = {
    ...state,
    treaties: nextTreaties,
    demands: nextDemands.slice(-50), // Keep last 50 demands
    resources: {
      ...state.resources,
      gold: { ...state.resources.gold, amount: nextGold }
    },
    factions: nextFactions
  };

  if (nextRivalOracles && nextRivalOracles !== state.rivalOracles) {
    nextState = { ...nextState, rivalOracles: nextRivalOracles };
  }

  if (feedItems.length > 0) {
    nextState = {
      ...nextState,
      eventFeed: [...nextState.eventFeed, ...feedItems.slice(0, 1)].slice(0, 8)
    };
  }

  return nextState;
}
