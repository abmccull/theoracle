import { festivalDefs, festivalDefById } from "@the-oracle/content";
import type { EventStageOutcome } from "@the-oracle/content";
import type { ActiveFestival, GameState, ResourceId, Season, WeatherCondition } from "../state/gameState";
import { getAbsoluteDay } from "./clock";

// ── Deterministic RNG helpers (same pattern as worldGen) ──

function hashUint(n: number): number {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

function seededUnit(seed: number, salt: number): number {
  return hashUint(seed ^ Math.imul(salt, 0x9e3779b1)) / 0xffffffff;
}

// ── Apply outcomes (mirrors eventChains.ts applyOutcome) ──

function applyOutcome(outcome: EventStageOutcome, state: GameState): GameState {
  switch (outcome.kind) {
    case "resource_delta": {
      const res = state.resources[outcome.resourceId];
      return {
        ...state,
        resources: {
          ...state.resources,
          [outcome.resourceId]: {
            ...res,
            amount: Math.max(0, Math.min(res.capacity, res.amount + outcome.amount)),
          },
        },
      };
    }
    case "reputation_delta":
      return {
        ...state,
        campaign: {
          ...state.campaign,
          reputation: {
            ...state.campaign.reputation,
            score: Math.max(0, state.campaign.reputation.score + outcome.delta),
          },
        },
      };
    case "pilgrim_surge":
      // Pilgrim surge is recorded as an event feed item; no direct state mutation beyond that.
      return state;
    default:
      return state;
  }
}

function applyOutcomes(outcomes: EventStageOutcome[], state: GameState): GameState {
  let s = state;
  for (const o of outcomes) {
    s = applyOutcome(o, s);
  }
  return s;
}

// ── Resource demand checking ──

function checkResourceDemands(
  state: GameState,
  demands: Partial<Record<string, number>>
): boolean {
  for (const [resId, amount] of Object.entries(demands)) {
    if (amount === undefined || amount <= 0) continue;
    const resource = state.resources[resId as ResourceId];
    if (!resource || resource.amount < amount) return false;
  }
  return true;
}

function deductResourceDemands(
  state: GameState,
  demands: Partial<Record<string, number>>
): GameState {
  let s = state;
  for (const [resId, amount] of Object.entries(demands)) {
    if (amount === undefined || amount <= 0) continue;
    const res = s.resources[resId as ResourceId];
    if (!res) continue;
    s = {
      ...s,
      resources: {
        ...s.resources,
        [resId]: { ...res, amount: Math.max(0, res.amount - amount) },
      },
    };
  }
  return s;
}

// ── Festival stage helpers ──

export type FestivalStage = "preparation" | "ceremony" | "resolution";

/** Determines the current festival stage based on elapsed days. */
export function getFestivalStage(festival: ActiveFestival, currentDay: number): FestivalStage {
  const totalDuration = festival.endDay - festival.startDay;
  const elapsed = currentDay - festival.startDay;

  if (elapsed <= 2) return "preparation";
  if (elapsed >= totalDuration - 1) return "resolution";
  return "ceremony";
}

// ── Festival complications ──

export type FestivalComplicationType = "plague_outbreak" | "raid_scare" | "storm";

export type FestivalComplication = {
  festivalDefId: string;
  complicationType: FestivalComplicationType;
  day: number;
};

/**
 * Checks whether a festival complication should trigger for an active festival.
 * 5% chance per day during the ceremony stage.
 */
export function checkFestivalComplication(
  festival: ActiveFestival,
  currentDay: number,
  seed: number
): FestivalComplicationType | null {
  if (festival.resolved) return null;

  const stage = getFestivalStage(festival, currentDay);
  if (stage !== "ceremony") return null;

  // 5% chance per day of a complication
  const roll = seededUnit(seed, currentDay * 37 + hashStringCode(festival.defId));
  if (roll >= 0.05) return null;

  // Determine which complication
  const typeRoll = seededUnit(seed, currentDay * 53 + hashStringCode(festival.defId) + 1);
  if (typeRoll < 0.33) return "plague_outbreak";
  if (typeRoll < 0.66) return "raid_scare";
  return "storm";
}

function hashStringCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return h;
}

/**
 * Apply a festival complication's effects to the game state.
 * - plague_outbreak: skip food bonus (reputation penalty)
 * - raid_scare: reduce pilgrim surge (reputation penalty)
 * - storm: double resource costs (resource penalty)
 */
export function applyFestivalComplication(
  state: GameState,
  complicationType: FestivalComplicationType
): GameState {
  switch (complicationType) {
    case "plague_outbreak":
      return {
        ...state,
        campaign: {
          ...state.campaign,
          reputation: {
            ...state.campaign.reputation,
            score: Math.max(0, state.campaign.reputation.score - 3),
          },
        },
      };
    case "raid_scare":
      return {
        ...state,
        campaign: {
          ...state.campaign,
          reputation: {
            ...state.campaign.reputation,
            score: Math.max(0, state.campaign.reputation.score - 2),
          },
        },
      };
    case "storm": {
      // Storm doubles resource pressure — lose some gold and grain
      const gold = state.resources["gold"];
      const grain = state.resources["grain"];
      return {
        ...state,
        resources: {
          ...state.resources,
          gold: { ...gold, amount: Math.max(0, gold.amount - 10) },
          grain: { ...grain, amount: Math.max(0, grain.amount - 5) },
        },
      };
    }
  }
}

// ── Festival advancement ──

export function advanceFestivals(state: GameState): GameState {
  const day = getAbsoluteDay(state.clock);
  const { month, year } = state.clock;

  // Avoid double-triggering within the same month
  if (state.lastFestivalCheck === month + year * 12) return state;

  let nextState: GameState = {
    ...state,
    lastFestivalCheck: month + year * 12,
    festivals: [...(state.festivals ?? [])],
  };

  // 1) Check for new festivals to activate
  for (const def of festivalDefs) {
    if (def.month !== month) continue;
    if (def.frequency === "quadrennial" && year % 4 !== 0) continue;

    // Already active or resolved this cycle?
    const existing = nextState.festivals!.find(
      (f) => f.defId === def.id && !f.resolved
    );
    if (existing) continue;

    // Already resolved this year for this festival?
    const alreadyResolved = nextState.festivals!.find(
      (f) => f.defId === def.id && f.resolved && f.startDay > day - 360
    );
    if (alreadyResolved) continue;

    const festival: ActiveFestival = {
      defId: def.id,
      startDay: day,
      endDay: day + def.durationDays,
      resourcesMet: false,
      resolved: false,
    };

    nextState = {
      ...nextState,
      festivals: [...nextState.festivals!, festival],
      eventFeed: [
        {
          id: `event-festival-warning-${def.id}-${day}`,
          day,
          text: `The ${def.name} approaches! Prepare the required offerings.`,
        },
        ...nextState.eventFeed,
      ].slice(0, 12),
    };
  }

  // 2) Resolve festivals whose endDay has been reached
  const updatedFestivals: ActiveFestival[] = [];
  for (const festival of nextState.festivals!) {
    if (festival.resolved) {
      updatedFestivals.push(festival);
      continue;
    }

    if (day < festival.endDay) {
      // Check for mid-festival complications during active festivals
      const complication = checkFestivalComplication(festival, day, nextState.worldSeed);
      if (complication) {
        nextState = applyFestivalComplication(nextState, complication);
        nextState = {
          ...nextState,
          eventFeed: [
            {
              id: `event-festival-complication-${festival.defId}-${day}`,
              day,
              text: complication === "plague_outbreak"
                ? "A plague outbreak disrupts the festival! The food offerings are tainted."
                : complication === "raid_scare"
                  ? "Reports of raiders nearby cause panic among festival pilgrims!"
                  : "A sudden storm batters the festival grounds, doubling the cost of celebrations!",
            },
            ...nextState.eventFeed,
          ].slice(0, 12),
        };
      }
      updatedFestivals.push(festival);
      continue;
    }

    // Festival has ended — resolve it
    const def = festivalDefById(festival.defId);
    if (!def) {
      updatedFestivals.push({ ...festival, resolved: true });
      continue;
    }

    const resourcesMet = checkResourceDemands(nextState, def.resourceDemands);
    const resolved: ActiveFestival = {
      ...festival,
      resourcesMet,
      resolved: true,
    };
    updatedFestivals.push(resolved);

    if (resourcesMet) {
      nextState = deductResourceDemands(nextState, def.resourceDemands);
      nextState = applyOutcomes(def.successRewards, nextState);
      nextState = {
        ...nextState,
        eventFeed: [
          {
            id: `event-festival-success-${def.id}-${day}`,
            day,
            text: `The ${def.name} was celebrated with great splendor! The gods are pleased.`,
          },
          ...nextState.eventFeed,
        ].slice(0, 12),
      };
    } else {
      nextState = applyOutcomes(def.failurePenalties, nextState);
      nextState = {
        ...nextState,
        eventFeed: [
          {
            id: `event-festival-failure-${def.id}-${day}`,
            day,
            text: `The ${def.name} was poorly provisioned. The people murmur in disappointment.`,
          },
          ...nextState.eventFeed,
        ].slice(0, 12),
      };
    }
  }

  return {
    ...nextState,
    festivals: updatedFestivals,
  };
}

// ── Weather system ──

const SEASON_WEATHER: Record<Season, WeatherCondition[]> = {
  Spring: ["normal", "flood"],
  Summer: ["normal", "drought", "heat_wave"],
  Autumn: ["normal", "flood"],
  Winter: ["normal", "harsh_winter"],
};

export function advanceWeather(state: GameState): GameState {
  const { season, year, month } = state.clock;
  const seed = state.worldSeed;
  const roll = seededUnit(seed, year * 13 + month * 7);

  // 70% normal, 30% split among season-appropriate weather
  if (roll < 0.7) {
    return { ...state, weather: "normal" };
  }

  const options = SEASON_WEATHER[season].filter((w) => w !== "normal");
  if (options.length === 0) {
    return { ...state, weather: "normal" };
  }

  const idx = Math.floor(seededUnit(seed, year * 31 + month * 17) * options.length);
  const weather = options[idx] ?? "normal";

  return { ...state, weather };
}

// ── Weather effects on production ──

export type WeatherModifiers = Partial<Record<ResourceId, number>>;

export function getWeatherModifiers(weather: WeatherCondition | undefined): WeatherModifiers {
  switch (weather) {
    case "drought":
      return { grain: -0.3 }; // grain production -30%
    case "flood":
      return { sacred_water: 0.5 }; // sacred water +50%
    case "harsh_winter":
      return { grain: -0.2, olive_oil: -0.2 }; // production drops
    case "heat_wave":
      return { grain: -0.2, sacred_water: -0.3 }; // water sources dry up
    case "normal":
    default:
      return {};
  }
}
