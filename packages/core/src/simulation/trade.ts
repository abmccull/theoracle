import type {
  EventFeedItem,
  FactionId,
  FactionState,
  GameEvent,
  GameState,
  ResourceId,
  Season,
  TradeOffer
} from "../state/gameState";

function hash(seed: number): number {
  let value = seed + 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export const BASE_PRICES: Record<ResourceId, number> = {
  grain: 2,
  bread: 3,
  olive_oil: 4,
  incense: 6,
  sacred_water: 5,
  logs: 2,
  stone: 3,
  planks: 4,
  cut_stone: 5,
  papyrus: 2,
  scrolls: 4,
  sacred_animals: 8,
  knowledge: 10,
  gold: 1,
  olives: 2
};

const AGENDA_DEMAND: Record<string, Partial<Record<ResourceId, number>>> = {
  war: { stone: 1.5, logs: 1.5, planks: 1.5, cut_stone: 1.5 },
  faith: { incense: 1.5, sacred_water: 1.5, sacred_animals: 1.3 },
  trade: {},
  succession: { gold: 1.2, scrolls: 1.3 }
};

const SEASON_DEMAND: Record<Season, Partial<Record<ResourceId, number>>> = {
  Winter: { grain: 1.3, bread: 1.3 },
  Summer: { sacred_water: 1.3 },
  Spring: {},
  Autumn: {}
};

/**
 * Calculate the effective trade price for a resource given faction and seasonal context.
 */
export function calculatePrice(
  resourceId: ResourceId,
  faction: FactionState,
  season: Season,
  state: GameState
): number {
  const base = BASE_PRICES[resourceId] ?? 1;

  // Faction agenda demand multiplier
  const agendaMultipliers = AGENDA_DEMAND[faction.currentAgenda] ?? {};
  const agendaMultiplier = agendaMultipliers[resourceId] ?? 1;

  // Seasonal multiplier
  const seasonMultipliers = SEASON_DEMAND[season] ?? {};
  const seasonMultiplier = seasonMultipliers[resourceId] ?? 1;

  // Embargo multiplier: if any faction has an embargo active, prices rise
  let embargoMultiplier = 1;
  const allFactions = Object.values(state.factions) as FactionState[];
  const hasActiveEmbargo = allFactions.some(
    (f) => f.embargoes.includes(faction.id)
  );
  if (hasActiveEmbargo) {
    embargoMultiplier = 2;
  }

  // Market price index modifier (if market state exists)
  const marketMultiplier = state.market?.priceIndex[resourceId] ?? 1;

  return Math.round(base * agendaMultiplier * seasonMultiplier * embargoMultiplier * marketMultiplier * 100) / 100;
}

/**
 * Check if a faction is considered hostile (low favour).
 */
export function isFactionHostile(faction: FactionState): boolean {
  return faction.favour < 20;
}

const TRADEABLE_RESOURCES: ResourceId[] = [
  "grain", "bread", "olive_oil", "incense", "sacred_water", "sacred_animals",
  "papyrus", "scrolls", "logs", "stone", "planks", "cut_stone"
];

/**
 * Monthly trade offer generation — creates 2-3 offers from factions.
 */
export function processTradeOffers(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const factionIds = Object.keys(state.factions) as FactionId[];
  if (factionIds.length === 0) return { state, events };

  const seed = state.worldSeed + state.clock.month * 37 + state.clock.year * 397;
  const offerCount = 2 + (hash(seed) > 0.5 ? 1 : 0); // 2 or 3 offers

  let newOffers: TradeOffer[] = [];
  let feedItems: EventFeedItem[] = [];
  let idCounter = state.nextId;

  // Remove expired offers (older than 30 days)
  const currentOffers = state.tradeOffers.filter(
    (offer) => {
      // Keep offers from this month (created within last 30 days roughly)
      const offerAge = state.clock.day - parseInt(offer.id.replace(/[^0-9]/g, "").slice(-4) || "0", 10);
      // Simple approach: keep only current month's offers, clear old ones
      return false; // Clear all old offers each month
    }
  );

  for (let i = 0; i < offerCount; i++) {
    const factionIndex = Math.floor(hash(seed + i * 17) * factionIds.length);
    const factionId = factionIds[factionIndex]!;
    const faction = state.factions[factionId];

    // Skip factions with no trade access
    if (!faction.tradeAccess) continue;

    // Pick a resource based on faction agenda
    const resourceIndex = Math.floor(hash(seed + i * 31) * TRADEABLE_RESOURCES.length);
    const resourceId = TRADEABLE_RESOURCES[resourceIndex]!;

    const price = calculatePrice(resourceId, faction, state.clock.season, state);
    const amount = Math.ceil(3 + hash(seed + i * 43) * 8); // 3-10 units

    const offerId = `trade-offer-${idCounter++}`;
    const offer: TradeOffer = {
      id: offerId,
      factionId,
      resourceId,
      amount,
      price: Math.round(price * amount)
    };

    newOffers.push(offer);
    events.push({
      type: "TradeOfferGenerated",
      offerId,
      factionId,
      resourceId
    });

    feedItems.push({
      id: `event-trade-offer-${idCounter++}`,
      day: state.clock.day,
      text: `${faction.name} offers ${amount} ${resourceId.replace(/_/g, " ")} for ${offer.price} gold.`
    });
  }

  return {
    state: {
      ...state,
      tradeOffers: [...currentOffers, ...newOffers],
      nextId: idCounter,
      eventFeed: [...feedItems, ...state.eventFeed].slice(0, 12)
    },
    events
  };
}
