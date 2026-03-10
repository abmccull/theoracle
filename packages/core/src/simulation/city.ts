import { buildingDefs } from "@the-oracle/content";
import type {
  CityProsperity,
  CityTier,
  FactionId,
  GameEvent,
  GameState,
  OracleImpactEvent
} from "../state/gameState";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Sum passive effects of a given kind across all completed buildings.
 */
function sumPassiveEffect(state: GameState, kind: string): number {
  return state.buildings.reduce((total, building) => {
    // Skip buildings under construction
    if ((building.constructionWork ?? 0) > 0 && (building.constructionProgress ?? 0) < (building.constructionWork ?? 0)) {
      return total;
    }
    const def = buildingDefs[building.defId];
    if (!def?.passiveEffects) return total;
    const conditionRatio = building.maxCondition > 0 ? building.condition / building.maxCondition : 1;
    return total + def.passiveEffects
      .filter((effect) => effect.kind === kind)
      .reduce((sum, effect) => sum + effect.value * conditionRatio, 0);
  }, 0);
}

export function calculateVisitorCapacity(state: GameState): number {
  return Math.max(1, Math.round(sumPassiveEffect(state, "pilgrim_capacity")));
}

export function calculateTradeRevenue(state: GameState): number {
  return sumPassiveEffect(state, "trade_income");
}

export function calculateDonationRevenue(state: GameState): number {
  return sumPassiveEffect(state, "donation");
}

function averageFactionCredibility(state: GameState): number {
  const factions = Object.values(state.factions);
  if (factions.length === 0) return 0;
  return factions.reduce((sum, faction) => sum + faction.credibility, 0) / factions.length;
}

function buildingPrestige(state: GameState): number {
  return sumPassiveEffect(state, "prestige");
}

function visitorSatisfaction(state: GameState): number {
  const breadAmount = state.resources.bread?.amount ?? 0;
  const grainAmount = state.resources.grain?.amount ?? 0;
  const foodScore = clamp(breadAmount + grainAmount * 0.5, 0, 50);

  // Average building condition
  const completedBuildings = state.buildings.filter(
    (b) => !((b.constructionWork ?? 0) > 0 && (b.constructionProgress ?? 0) < (b.constructionWork ?? 0))
  );
  const avgCondition = completedBuildings.length > 0
    ? completedBuildings.reduce((sum, b) => sum + b.condition / b.maxCondition, 0) / completedBuildings.length * 100
    : 50;

  return clamp((foodScore + avgCondition) / 2, 0, 100);
}

function unresolvedCrises(state: GameState): number {
  return state.campaign.worldMap.crisisChains.filter((c) => c.stage !== "resolution").length;
}

function factionConflictCount(state: GameState): number {
  return Object.values(state.factions).filter((f) => f.activeConflicts.length > 0).length;
}

function activeTradeRouteCount(state: GameState): number {
  // Links with positive trade flow represent active trade routes
  return state.campaign.worldMap.links.filter((link) => link.tradeFlow > 0).length;
}

export function calculateProsperity(state: GameState): number {
  const reputationScore = state.campaign.reputation.score;
  const avgCredibility = averageFactionCredibility(state);
  const treasuryCompleted = state.campaign.treasury.completed;
  const activeRoutes = activeTradeRouteCount(state);
  const prestige = buildingPrestige(state);
  const satisfaction = visitorSatisfaction(state);
  const crises = unresolvedCrises(state);
  const conflicts = factionConflictCount(state);

  return clamp(
    Math.round(
      reputationScore * 0.25 +
      avgCredibility * 0.20 +
      treasuryCompleted * 8 +
      activeRoutes * 5 +
      prestige * 0.15 +
      satisfaction * 0.10 -
      crises * 10 -
      conflicts * 5
    ),
    0,
    100
  );
}

export function determineCityTier(prosperity: number): CityTier {
  if (prosperity >= 75) return "panhellenic_center";
  if (prosperity >= 50) return "city";
  if (prosperity >= 25) return "town";
  return "village";
}

const CITY_TIER_MULTIPLIER: Record<CityTier, number> = {
  village: 1,
  town: 1.5,
  city: 2,
  panhellenic_center: 3
};

export const DEFAULT_CITY_PROSPERITY: CityProsperity = {
  prosperityScore: 10,
  pilgrimAttraction: 10,
  tradeRevenue: 0,
  donationRevenue: 0,
  visitorCount: 0,
  visitorCapacity: 3,
  growthRate: 0,
  cityTier: "village"
};

function calculatePilgrimAttraction(state: GameState): number {
  const reputationScore = state.campaign.reputation.score;
  const recentProphecies = state.consultation.history;
  const now = (state.clock.year - 1) * 360 + (state.clock.month - 1) * 30 + state.clock.day;

  // Recent prophecy outcomes influence attraction
  let prophecyBonus = 0;
  for (const prophecy of recentProphecies) {
    if (now - prophecy.dayIssued > 90) continue;
    const delta = prophecy.credibilityDelta ?? 0;
    prophecyBonus += delta > 0 ? 2 : delta < 0 ? -3 : 0;
  }

  return clamp(
    Math.round(reputationScore * 0.4 + prophecyBonus + (state.cityProsperity?.pilgrimAttraction ?? 10) * 0.3),
    0,
    100
  );
}

export function advanceCityGrowth(state: GameState): GameState {
  const prosperityScore = calculateProsperity(state);
  const cityTier = determineCityTier(prosperityScore);
  const visitorCap = calculateVisitorCapacity(state);
  const tradeRev = calculateTradeRevenue(state);
  const donationRev = calculateDonationRevenue(state);
  const pilgrimAttraction = calculatePilgrimAttraction(state);
  const current = state.cityProsperity ?? DEFAULT_CITY_PROSPERITY;

  const growthRate = prosperityScore > 50 ? 0.02 : prosperityScore > 25 ? 0.01 : 0;

  const cityProsperity: CityProsperity = {
    prosperityScore,
    pilgrimAttraction,
    tradeRevenue: tradeRev,
    donationRevenue: donationRev,
    visitorCount: current.visitorCount,
    visitorCapacity: visitorCap,
    growthRate,
    cityTier
  };

  return {
    ...state,
    cityProsperity
  };
}

export function processVisitorEconomy(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const current = state.cityProsperity ?? DEFAULT_CITY_PROSPERITY;
  const baseRate = 0.002;
  const tierMultiplier = CITY_TIER_MULTIPLIER[current.cityTier];
  const attractionBonus = 1 + current.pilgrimAttraction / 100;

  let visitorCount = current.visitorCount;

  // Spawn pilgrims if under capacity
  if (visitorCount < current.visitorCapacity) {
    const spawnRate = baseRate * tierMultiplier * attractionBonus;
    visitorCount = Math.min(current.visitorCapacity, visitorCount + spawnRate);
  }

  // Natural attrition: visitors leave over time
  visitorCount = Math.max(0, visitorCount - 0.0005);

  // Visitors consume food (bread at 0.005/tick, half of workers)
  const breadConsumed = visitorCount * 0.005;
  const currentBread = state.resources.bread?.amount ?? 0;
  const actualBreadConsumed = Math.min(currentBread, breadConsumed);

  // Visitors contribute gold (0.001/tick per visitor)
  const goldContributed = visitorCount * 0.001;
  const currentGold = state.resources.gold?.amount ?? 0;
  const goldCapacity = state.resources.gold?.capacity ?? 500;

  const nextResources = {
    ...state.resources,
    bread: {
      ...state.resources.bread,
      amount: Math.max(0, currentBread - actualBreadConsumed)
    },
    gold: {
      ...state.resources.gold,
      amount: Math.min(goldCapacity, currentGold + goldContributed)
    }
  };

  const nextState: GameState = {
    ...state,
    resources: nextResources,
    cityProsperity: {
      ...current,
      visitorCount
    }
  };

  return { state: nextState, events };
}

export function applyOracleImpact(state: GameState, event: OracleImpactEvent): GameState {
  const current = state.cityProsperity ?? DEFAULT_CITY_PROSPERITY;

  switch (event.kind) {
    case "prophecy_success_streak":
      return {
        ...state,
        cityProsperity: {
          ...current,
          pilgrimAttraction: clamp(current.pilgrimAttraction + 15, 0, 100)
        }
      };

    case "prophecy_failure_streak":
      return {
        ...state,
        cityProsperity: {
          ...current,
          pilgrimAttraction: clamp(current.pilgrimAttraction - 20, 0, 100)
        }
      };

    case "reputation_tier_up": {
      const newProsperity = calculateProsperity(state);
      const newTier = determineCityTier(newProsperity);
      return {
        ...state,
        cityProsperity: {
          ...current,
          prosperityScore: newProsperity,
          cityTier: newTier
        }
      };
    }

    case "reputation_tier_down":
      return {
        ...state,
        cityProsperity: {
          ...current,
          tradeRevenue: current.tradeRevenue / 2
        }
      };

    case "crisis_resolved":
      return {
        ...state,
        cityProsperity: {
          ...current,
          prosperityScore: clamp(current.prosperityScore + 10, 0, 100)
        }
      };

    case "crisis_escalated":
      return {
        ...state,
        cityProsperity: {
          ...current,
          prosperityScore: clamp(current.prosperityScore - 15, 0, 100)
        }
      };

    case "festival_success":
      return {
        ...state,
        cityProsperity: {
          ...current,
          prosperityScore: clamp(current.prosperityScore + 5, 0, 100),
          visitorCount: current.visitorCount + 8
        }
      };

    case "festival_failure":
      return {
        ...state,
        cityProsperity: {
          ...current,
          prosperityScore: clamp(current.prosperityScore - 8, 0, 100)
        }
      };

    default:
      return state;
  }
}
