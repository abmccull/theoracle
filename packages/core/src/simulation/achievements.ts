import { achievementDefs } from "@the-oracle/content";
import type { AchievementCondition } from "@the-oracle/content";

import type { AchievementProgress, GameState } from "../state/gameState";

export function createInitialAchievementProgress(): AchievementProgress {
  return {
    unlockedIds: [],
    stats: {
      propheciesDelivered: 0,
      yearsCompleted: 0,
      festivalsSucceeded: 0,
      espionageSuccesses: 0,
      espionageDetections: 0,
      treatiesFormed: 0,
      warsStayedNeutral: 0,
      highestBeliefStrength: 0,
      totalPatrons: 0,
      hadDebt: false
    }
  };
}

function gatherStats(state: GameState): AchievementProgress["stats"] {
  const prev = state.achievements?.stats ?? createInitialAchievementProgress().stats;

  const propheciesDelivered = state.consultation.history.length;
  const yearsCompleted = Math.max(0, state.clock.year - 1);

  const festivalsSucceeded = (state.festivals ?? []).filter(
    (f) => f.resolved && f.resourcesMet
  ).length + prev.festivalsSucceeded;

  // For espionage, we accumulate from the espionage state
  const espionageState = state.espionage;
  const espionageSuccesses = espionageState
    ? espionageState.operations.filter((op) => op.status === "success").length
    : prev.espionageSuccesses;
  const espionageDetections = espionageState
    ? espionageState.operations.filter((op) => op.status === "detected").length
    : prev.espionageDetections;

  const treatiesFormed = (state.treaties ?? []).length;

  // Count wars we've stayed neutral in (factions at war where we have no active conflict)
  const factionIds = Object.keys(state.factions) as (keyof typeof state.factions)[];
  let warsActive = 0;
  for (const fid of factionIds) {
    warsActive += state.factions[fid].activeConflicts.length;
  }
  // Simple heuristic: count unique faction-pair wars divided by 2
  const warsStayedNeutral = Math.max(prev.warsStayedNeutral, Math.floor(warsActive / 2));

  // Highest belief strength from prophecy history
  let highestBeliefStrength = prev.highestBeliefStrength;
  for (const prophecy of state.consultation.history) {
    if (typeof prophecy.beliefStrength === "number" && prophecy.beliefStrength > highestBeliefStrength) {
      highestBeliefStrength = prophecy.beliefStrength;
    }
  }

  const activePatrons = (state.patrons ?? []).filter((p) => p.active).length;
  const totalPatrons = Math.max(prev.totalPatrons, activePatrons);

  const hadDebt = prev.hadDebt || (state.loans ?? []).length > 0;

  return {
    propheciesDelivered,
    yearsCompleted,
    festivalsSucceeded: Math.max(prev.festivalsSucceeded, festivalsSucceeded),
    espionageSuccesses,
    espionageDetections,
    treatiesFormed: Math.max(prev.treatiesFormed, treatiesFormed),
    warsStayedNeutral,
    highestBeliefStrength,
    totalPatrons,
    hadDebt
  };
}

function isConditionMet(condition: AchievementCondition, state: GameState, stats: AchievementProgress["stats"]): boolean {
  switch (condition.kind) {
    case "prophecy_count":
      return stats.propheciesDelivered >= condition.count;

    case "grand_prophecy":
      return state.consultation.history.some(
        (p) => p.depthBand === "oracular"
      );

    case "years_survived":
      return stats.yearsCompleted >= condition.years;

    case "reputation_tier":
      return state.campaign.reputation.currentTier === condition.tier;

    case "all_techs_researched": {
      const research = state.research;
      if (!research) return false;
      // Check that we have some completed techs (at least 5 as a reasonable threshold)
      return research.completedTechIds.length >= 5;
    }

    case "all_buildings_built": {
      const builtDefIds = new Set(state.buildings.map((b) => b.defId));
      // Require at least 8 unique building types
      return builtDefIds.size >= 8;
    }

    case "rival_defeated":
      return (state.rivalOracles?.roster ?? []).some(
        (r) => !r.active && r.pressure <= 0
      );

    case "festival_count":
      return stats.festivalsSucceeded >= condition.count;

    case "relic_count": {
      const relicCount = (state.excavation?.claimedRelics ?? state.excavation?.relics ?? []).length;
      return relicCount >= condition.count;
    }

    case "sacred_sites_active": {
      const activeSites = (state.excavation?.sacredSites ?? []).filter((s) => s.active).length;
      return activeSites >= condition.count;
    }

    case "patron_count":
      return stats.totalPatrons >= condition.count;

    case "zero_debt_run":
      return !stats.hadDebt && stats.yearsCompleted >= 1;

    case "neutral_in_wars":
      return stats.warsStayedNeutral >= condition.count;

    case "belief_strength_above":
      return stats.highestBeliefStrength >= condition.threshold;

    case "espionage_successes":
      return stats.espionageSuccesses >= condition.count;

    case "espionage_undetected":
      return stats.espionageDetections === 0 && stats.espionageSuccesses > 0;

    case "treaties_formed":
      return stats.treatiesFormed >= condition.count;

    case "building_count":
      return state.buildings.length >= condition.count;

    case "custom":
      return false;
  }
}

export function checkAchievements(state: GameState): GameState {
  const currentProgress = state.achievements ?? createInitialAchievementProgress();
  const stats = gatherStats(state);
  const newUnlocks: string[] = [];

  for (const def of achievementDefs) {
    if (currentProgress.unlockedIds.includes(def.id)) {
      continue;
    }
    if (isConditionMet(def.condition, state, stats)) {
      newUnlocks.push(def.id);
    }
  }

  if (newUnlocks.length === 0 && stats === currentProgress.stats) {
    return {
      ...state,
      achievements: {
        ...currentProgress,
        stats
      }
    };
  }

  const nextUnlockedIds = [...currentProgress.unlockedIds, ...newUnlocks];

  // Generate a single event feed item summarizing all new unlocks (avoids flooding the feed)
  let nextEventFeed = state.eventFeed;
  if (newUnlocks.length > 0) {
    const labels = newUnlocks
      .map((id) => achievementDefs.find((d) => d.id === id)?.label)
      .filter(Boolean);
    const summary = labels.length === 1
      ? `Achievement unlocked: ${labels[0]}`
      : `Achievements unlocked: ${labels.join(", ")}`;
    nextEventFeed = [
      {
        id: `event-achievement-${newUnlocks[0]}`,
        day: state.clock.day,
        text: summary
      },
      ...nextEventFeed
    ];
  }

  return {
    ...state,
    achievements: {
      unlockedIds: nextUnlockedIds,
      stats
    },
    eventFeed: nextEventFeed
  };
}

/**
 * Hubris mechanic: escalates difficulty when the oracle reaches high reputation/credibility.
 * Called monthly.
 */
export function advanceHubris(state: GameState): GameState {
  const tier = state.campaign.reputation.currentTier;
  const isHighTier = tier === "revered" || tier === "panhellenic";

  if (!isHighTier) {
    return state;
  }

  let nextState = state;

  // Philosopher threats intensity +1/month at high reputation
  if (nextState.philosophers) {
    const nextByFaction = { ...nextState.philosophers.byFaction };
    for (const factionId of Object.keys(nextByFaction) as (keyof typeof nextByFaction)[]) {
      const threat = nextByFaction[factionId];
      if (threat.active) {
        nextByFaction[factionId] = {
          ...threat,
          pressure: Math.min(100, threat.pressure + 1),
          influence: Math.min(100, threat.influence + (tier === "panhellenic" ? 2 : 1))
        };
      }
    }
    nextState = {
      ...nextState,
      philosophers: {
        ...nextState.philosophers,
        byFaction: nextByFaction
      }
    };
  }

  // Rival oracle pressure +2/month at high reputation
  if (nextState.rivalOracles) {
    const updatedRoster = nextState.rivalOracles.roster.map((rival) => {
      if (!rival.active) return rival;
      return {
        ...rival,
        pressure: Math.min(rival.pressureCap, rival.pressure + 2),
        intrigue: Math.min(100, rival.intrigue + (tier === "panhellenic" ? 2 : 1))
      };
    });
    nextState = {
      ...nextState,
      rivalOracles: {
        ...nextState.rivalOracles,
        roster: updatedRoster,
        totalPressure: updatedRoster.reduce((sum, r) => sum + r.pressure, 0)
      }
    };
  }

  return nextState;
}
