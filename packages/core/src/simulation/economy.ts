import type {
  DomainTag,
  EventFeedItem,
  FactionId,
  GameState,
  Loan,
  MarketState,
  PatronContract,
  ResourceId
} from "../state/gameState";

function hash(seed: number): number {
  let value = seed + 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const TRADEABLE_RESOURCES: ResourceId[] = [
  "grain", "olive_oil", "incense", "sacred_water", "sacred_animals",
  "bread", "olives", "papyrus", "scrolls", "logs", "stone", "planks", "cut_stone"
];

export function createInitialMarketState(): MarketState {
  return {
    priceIndex: Object.fromEntries(TRADEABLE_RESOURCES.map((r) => [r, 1.0])) as Partial<Record<ResourceId, number>>,
    supplyPressure: {},
    demandPressure: {},
    lastUpdateMonth: 0
  };
}

export function updateMarketPrices(state: GameState): GameState {
  const market = state.market ?? createInitialMarketState();
  const factions = state.factions;
  const nextId = state.nextId;
  let feedItems: EventFeedItem[] = [];
  let idCounter = nextId;

  const supplyPressure: Partial<Record<ResourceId, number>> = {};
  const demandPressure: Partial<Record<ResourceId, number>> = {};
  const newPriceIndex: Partial<Record<ResourceId, number>> = {};

  for (const resourceId of TRADEABLE_RESOURCES) {
    const resourceState = state.resources[resourceId];
    if (!resourceState) continue;

    // Supply pressure: high stockpile relative to capacity pushes prices down
    const fillRatio = resourceState.amount / Math.max(1, resourceState.capacity);
    supplyPressure[resourceId] = clamp(fillRatio - 0.4, 0, 1);

    // Demand pressure from active wars (grain and incense go up during conflicts)
    let demand = 0;
    const warringFactions = Object.values(factions).filter((f) => f.activeConflicts.length > 0);

    if (warringFactions.length > 0) {
      if (resourceId === "grain" || resourceId === "bread") {
        demand += warringFactions.length * 0.15;
      }
      if (resourceId === "incense" || resourceId === "sacred_water") {
        demand += warringFactions.length * 0.1;
      }
    }

    // Trade disruptions: embargoes increase demand pressure
    const embargoCount = Object.values(factions).reduce((sum, f) => sum + f.embargoes.length, 0);
    if (embargoCount > 0) {
      demand += embargoCount * 0.05;
    }

    // Seasonal factors
    if (state.clock.season === "Winter" && (resourceId === "grain" || resourceId === "bread" || resourceId === "olives")) {
      demand += 0.2;
    }
    if (state.clock.season === "Summer" && resourceId === "sacred_water") {
      demand += 0.15;
    }

    demandPressure[resourceId] = clamp(demand, 0, 1);

    // Compute new price
    const oldPrice = market.priceIndex[resourceId] ?? 1.0;
    const supply = supplyPressure[resourceId] ?? 0;
    const demandVal = demandPressure[resourceId] ?? 0;
    const rawPrice = oldPrice * (1 + demandVal * 0.1 - supply * 0.1);
    const newPrice = clamp(rawPrice, 0.5, 2.5);
    newPriceIndex[resourceId] = Math.round(newPrice * 100) / 100;

    // Generate event feed for significant price swings (>20% change)
    const change = Math.abs(newPrice - oldPrice) / Math.max(0.01, oldPrice);
    if (change > 0.2) {
      const direction = newPrice > oldPrice ? "surged" : "dropped";
      feedItems.push({
        id: `event-market-${idCounter++}`,
        day: state.clock.day,
        text: `Market: ${resourceId.replace(/_/g, " ")} prices ${direction} by ${Math.round(change * 100)}%.`
      });
    }
  }

  const newMarket: MarketState = {
    priceIndex: newPriceIndex,
    supplyPressure,
    demandPressure,
    lastUpdateMonth: state.clock.month
  };

  return {
    ...state,
    market: newMarket,
    nextId: idCounter,
    eventFeed: [...feedItems, ...state.eventFeed].slice(0, 8)
  };
}

export function advancePatronContracts(state: GameState): GameState {
  const patrons = state.patrons;
  if (!patrons || patrons.length === 0) return state;

  let resources = state.resources;
  let factions = state.factions;
  let feedItems: EventFeedItem[] = [];
  let idCounter = state.nextId;

  // Check recent prophecies this month for domain/polarity matching
  const recentProphecies = state.consultation.history.filter((p) => {
    const prophecyMonth = Math.ceil(p.dayIssued / 30);
    return prophecyMonth === state.clock.month;
  });

  const updatedPatrons = patrons.map((patron) => {
    if (!patron.active) return patron;

    // Pay gold per month
    const goldState = resources.gold;
    resources = {
      ...resources,
      gold: {
        ...goldState,
        amount: goldState.amount + patron.goldPerMonth
      }
    };

    // Check satisfaction based on prophecy delivery
    let satisfactionDelta = 0;
    const matchingProphecy = recentProphecies.find((p) => {
      const consultation = state.consultation.history.find((h) => h.id === p.id);
      if (!consultation) return false;
      // Check if the prophecy's faction domain matches patron's demanded domain
      const domainMatch = p.factionId === patron.factionId;
      if (patron.demandedPolarity === "favorable") {
        return domainMatch && p.semantics.some((s) => s.polarity === "favorable");
      }
      return domainMatch;
    });

    if (matchingProphecy) {
      satisfactionDelta = 10;
    } else {
      satisfactionDelta = -5;
    }

    const newSatisfaction = clamp(patron.satisfactionScore + satisfactionDelta, 0, 100);

    // Patron withdraws on low satisfaction
    if (newSatisfaction < 20) {
      const faction = factions[patron.factionId];
      factions = {
        ...factions,
        [patron.factionId]: {
          ...faction,
          credibility: clamp(faction.credibility - 3, 0, 100),
          history: [`Patron from ${faction.name} withdrew, dissatisfied.`, ...faction.history].slice(0, 4)
        }
      };
      feedItems.push({
        id: `event-patron-withdraw-${idCounter++}`,
        day: state.clock.day,
        text: `A patron of ${faction.name} has withdrawn support, dissatisfied with recent prophecies.`
      });
      return { ...patron, satisfactionScore: newSatisfaction, active: false };
    }

    return { ...patron, satisfactionScore: newSatisfaction };
  });

  // Generate new patron offers from factions with high credibility
  const factionIds = Object.keys(factions) as FactionId[];
  const seed = state.worldSeed + state.clock.month * 31 + state.clock.year * 367;

  for (let i = 0; i < factionIds.length; i++) {
    const factionId = factionIds[i]!;
    const faction = factions[factionId];
    if (faction.credibility <= 50) continue;

    // Already have an active patron from this faction?
    const existing = updatedPatrons.find((p) => p.factionId === factionId && p.active);
    if (existing) continue;

    const roll = hash(seed + i * 13);
    if (roll > 0.05) continue;

    const domains: DomainTag[] = ["military", "economic", "spiritual"];
    const domain = domains[Math.floor(hash(seed + i * 7) * domains.length)]!;
    const polarity: "favorable" | "any" = hash(seed + i * 11) > 0.5 ? "favorable" : "any";
    const goldPerMonth = Math.round(8 + hash(seed + i * 19) * 12);
    const durationMonths = Math.round(3 + hash(seed + i * 23) * 6);

    updatedPatrons.push({
      id: `patron-${idCounter++}`,
      factionId,
      goldPerMonth,
      demandedDomain: domain,
      demandedPolarity: polarity,
      satisfactionScore: 60,
      startDay: state.clock.day,
      durationMonths,
      active: false // pending offer, not yet accepted
    });

    feedItems.push({
      id: `event-patron-offer-${idCounter++}`,
      day: state.clock.day,
      text: `${faction.name} offers patronage: ${goldPerMonth} gold/month for ${domain} prophecies.`
    });
  }

  return {
    ...state,
    patrons: updatedPatrons,
    resources,
    factions,
    nextId: idCounter,
    eventFeed: [...feedItems, ...state.eventFeed].slice(0, 8)
  };
}

export function advanceLoanPayments(state: GameState): GameState {
  const loans = state.loans;
  if (!loans || loans.length === 0) return state;

  let resources = state.resources;
  let factions = state.factions;
  let feedItems: EventFeedItem[] = [];
  let idCounter = state.nextId;

  const updatedLoans = loans.map((loan) => {
    if (loan.remainingPayments <= 0) return loan;

    const goldAvailable = resources.gold.amount;

    if (goldAvailable >= loan.monthlyPayment) {
      // Deduct payment
      resources = {
        ...resources,
        gold: {
          ...resources.gold,
          amount: goldAvailable - loan.monthlyPayment
        }
      };

      const remaining = loan.remainingPayments - 1;

      if (remaining <= 0) {
        feedItems.push({
          id: `event-loan-paid-${idCounter++}`,
          day: state.clock.day,
          text: `Loan from ${factions[loan.factionId].name} fully repaid.`
        });
      }

      return {
        ...loan,
        remainingPayments: remaining,
        missedPayments: 0
      };
    } else {
      // Insufficient gold
      const missed = loan.missedPayments + 1;
      const faction = factions[loan.factionId];

      if (missed >= 3) {
        // Loan defaults
        factions = {
          ...factions,
          [loan.factionId]: {
            ...faction,
            credibility: clamp(faction.credibility - 15, 0, 100),
            favour: clamp(faction.favour - 10, 0, 100),
            history: [`Delphi defaulted on a loan. Trust shattered.`, ...faction.history].slice(0, 4)
          }
        };
        feedItems.push({
          id: `event-loan-default-${idCounter++}`,
          day: state.clock.day,
          text: `Loan from ${faction.name} has defaulted! Severe credibility loss.`
        });
        return { ...loan, missedPayments: missed, remainingPayments: 0 };
      } else {
        factions = {
          ...factions,
          [loan.factionId]: {
            ...faction,
            credibility: clamp(faction.credibility - 5, 0, 100),
            history: [`Delphi missed a loan payment.`, ...faction.history].slice(0, 4)
          }
        };
        feedItems.push({
          id: `event-loan-missed-${idCounter++}`,
          day: state.clock.day,
          text: `Missed loan payment to ${faction.name}. (${missed}/3 before default)`
        });
        return { ...loan, missedPayments: missed };
      }
    }
  });

  // Remove fully defaulted loans (missedPayments >= 3) and fully paid loans
  const activeLoans = updatedLoans.filter(
    (loan) => loan.remainingPayments > 0 && loan.missedPayments < 3
  );

  return {
    ...state,
    loans: activeLoans.length > 0 ? activeLoans : undefined,
    resources,
    factions,
    nextId: idCounter,
    eventFeed: [...feedItems, ...state.eventFeed].slice(0, 8)
  };
}
