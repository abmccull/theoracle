import { eventChainDefs, eventChainDefById } from "@the-oracle/content";
import type { EventTriggerCondition, EventStageOutcome } from "@the-oracle/content";
import type { ActiveEventChain, GameEvent, GameState } from "../state/gameState";
import { getAbsoluteDay } from "./clock";
import { applyBilateralRelationDelta } from "./events";

function seededRandom(seed: number): number {
  const state = ((seed * 1103515245 + 12345) & 0x7fffffff);
  return state / 0x7fffffff;
}

// ── Campaign Pacing ──

export type GamePhase = "early" | "mid" | "late";

export function getGamePhase(year: number): GamePhase {
  if (year <= 3) return "early";
  if (year <= 8) return "mid";
  return "late";
}

export function getPacingModifier(phase: GamePhase): { crisisMod: number; conflictMod: number } {
  switch (phase) {
    case "early": return { crisisMod: 0.5, conflictMod: 0.8 };
    case "mid": return { crisisMod: 1.0, conflictMod: 1.2 };
    case "late": return { crisisMod: 1.5, conflictMod: 1.5 };
  }
}

function getActiveChainCount(state: GameState): number {
  return (state.eventChains ?? []).filter((c) => !c.resolved).length;
}

function isChainDomainActive(state: GameState, domain: string): boolean {
  const chains = state.eventChains ?? [];
  return chains.some((c) => {
    if (c.resolved) return false;
    const def = eventChainDefById[c.defId];
    return def?.domain === domain;
  });
}

/** Returns true if any military-domain event chain is currently active. */
export function isMilitaryChainActive(state: GameState): boolean {
  return isChainDomainActive(state, "military");
}

/** Returns true if any plague disaster chain is currently active (unresolved). */
export function isPlagueChainActive(state: GameState): boolean {
  const chains = state.eventChains ?? [];
  return chains.some((c) => c.defId === "disaster-plague" && !c.resolved);
}

/** Returns true if a prophecy chain was successfully resolved recently (within 60 days). */
export function hasProphecyChainResolvedRecently(state: GameState): boolean {
  const day = getAbsoluteDay(state.clock);
  const chains = state.eventChains ?? [];
  return chains.some((c) => {
    if (!c.resolved || !c.resolvedDay) return false;
    const def = eventChainDefById[c.defId];
    if (!def) return false;
    // Check spiritual domain chains that resolved successfully (within 60 days)
    return def.domain === "spiritual" && (day - c.resolvedDay) <= 60;
  });
}

/**
 * Computes the effective trigger probability adjustment for disaster chains
 * based on cross-chain interactions:
 * - Active war chain: +20% trigger chance for disaster chains
 * - Recent prophecy resolution: +10 threshold on crisis triggers (modeled as -0.02 probability)
 */
export function getDisasterProbabilityModifier(state: GameState): number {
  let modifier = 0;
  if (isMilitaryChainActive(state)) {
    modifier += 0.2; // +20% relative increase
  }
  if (hasProphecyChainResolvedRecently(state)) {
    modifier -= 0.1; // -10% relative decrease (prophecy reduces crisis pressure)
  }
  return modifier;
}

function checkCondition(condition: EventTriggerCondition, state: GameState): boolean {
  const day = getAbsoluteDay(state.clock);

  switch (condition.kind) {
    case "resource_below":
      return state.resources[condition.resourceId].amount < condition.threshold;
    case "resource_above":
      return state.resources[condition.resourceId].amount > condition.threshold;
    case "faction_credibility_below": {
      if (condition.factionId) {
        return state.factions[condition.factionId].credibility < condition.threshold;
      }
      return Object.values(state.factions).some((f) => f.credibility < condition.threshold);
    }
    case "faction_debt_above":
      return Object.values(state.factions).some((f) => f.debt > condition.threshold);
    case "faction_at_war":
      return Object.values(state.factions).some((f) => f.activeConflicts.length > 0);
    case "philosopher_stage":
      if (!state.philosophers) return false;
      return Object.values(state.philosophers.byFaction).some((p) => p.stage === condition.stage);
    case "rival_pressure_above":
      return (state.rivalOracles?.totalPressure ?? 0) > condition.threshold;
    case "reputation_tier":
      return state.campaign.reputation.currentTier === condition.tier;
    case "age_reached":
      return state.age?.currentAgeId === condition.ageId;
    case "prophecy_failed_recently": {
      const history = state.consultation.history;
      return history.some((p) => p.resolved && (p.credibilityDelta ?? 0) < 0 && p.resolvedDay !== undefined && day - p.resolvedDay <= condition.withinDays);
    }
    case "prophecy_succeeded_recently": {
      const history = state.consultation.history;
      return history.some((p) => p.resolved && (p.credibilityDelta ?? 0) > 0 && p.resolvedDay !== undefined && day - p.resolvedDay <= condition.withinDays);
    }
    case "building_count_above":
      if (condition.defId) {
        return state.buildings.filter((b) => b.defId === condition.defId).length > condition.count;
      }
      return state.buildings.length > condition.count;
    case "season":
      return state.clock.season === condition.season;
    case "season_is":
      return state.clock.season === condition.season;
    case "random_chance":
      return seededRandom(state.worldSeed + day * 31 + (state.eventChains?.length ?? 0) * 7) < condition.probability;
    case "consultation_pending":
      return state.consultation.mode === "pending";
    case "crisis_active":
      return state.campaign.worldMap.crisisChains.some((c) => c.stage === "active");
    case "active_chain_count": {
      const count = getActiveChainCount(state);
      if (condition.min !== undefined && count < condition.min) return false;
      if (condition.max !== undefined && count > condition.max) return false;
      return true;
    }
    case "chain_domain_active":
      return isChainDomainActive(state, condition.domain);
  }
}

function allConditionsMet(conditions: EventTriggerCondition[], state: GameState): boolean {
  return conditions.every((c) => checkCondition(c, state));
}

const DISASTER_CHAIN_IDS = new Set([
  "disaster-plague",
  "disaster-earthquake",
  "disaster-flood",
  "disaster-drought",
  "disaster-locust-swarm",
  "disaster-wildfire"
]);

/** IDs of chains related to faction conflicts (for pacing modifier). */
const CONFLICT_CHAIN_IDS = new Set([
  "faction-conflict-escalation",
  "faction-war-buildup",
  "hegemon-pressure"
]);

/**
 * Check all conditions with cross-chain interaction modifiers and game pacing.
 * For disaster chains, the random_chance probability is adjusted by
 * military chain presence (+20%) and recent prophecy resolution (-10%).
 * All chains with random_chance are further adjusted by campaign pacing:
 * - Early game: crisis 50% reduction, conflict 20% reduction
 * - Mid game: conflict 20% increase
 * - Late game: crisis 50% increase, conflict 50% increase
 */
function allConditionsMetWithCrossChain(
  conditions: EventTriggerCondition[],
  state: GameState,
  defId: string
): boolean {
  const isDisaster = DISASTER_CHAIN_IDS.has(defId);
  const isConflict = CONFLICT_CHAIN_IDS.has(defId);
  const phase = getGamePhase(state.clock.year);
  const pacing = getPacingModifier(phase);

  if (!isDisaster && !isConflict) {
    // Still apply pacing to generic chains with random_chance
    if (phase === "early") {
      return conditions.every((c) => {
        if (c.kind === "random_chance") {
          return checkCondition({ ...c, probability: c.probability * pacing.crisisMod }, state);
        }
        return checkCondition(c, state);
      });
    }
    return allConditionsMet(conditions, state);
  }

  const crossChainModifier = isDisaster ? getDisasterProbabilityModifier(state) : 0;
  const pacingModifier = isConflict ? (pacing.conflictMod - 1) : (pacing.crisisMod - 1);
  const totalModifier = crossChainModifier + pacingModifier;

  return conditions.every((c) => {
    if (c.kind === "random_chance" && totalModifier !== 0) {
      const adjustedProbability = c.probability * (1 + totalModifier);
      return checkCondition({ ...c, probability: adjustedProbability }, state);
    }
    return checkCondition(c, state);
  });
}

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
            amount: Math.max(0, Math.min(res.capacity, res.amount + outcome.amount))
          }
        }
      };
    }
    case "faction_relation_delta":
      return {
        ...state,
        factions: applyBilateralRelationDelta(state.factions, outcome.factionA, outcome.factionB, outcome.delta)
      };
    case "credibility_delta": {
      const faction = state.factions[outcome.factionId];
      if (!faction) return state;
      return {
        ...state,
        factions: {
          ...state.factions,
          [outcome.factionId]: {
            ...faction,
            credibility: Math.max(0, Math.min(100, faction.credibility + outcome.delta))
          }
        }
      };
    }
    case "reputation_delta": {
      return {
        ...state,
        campaign: {
          ...state.campaign,
          reputation: {
            ...state.campaign.reputation,
            score: Math.max(0, state.campaign.reputation.score + outcome.delta)
          }
        }
      };
    }
    case "philosopher_pressure": {
      if (!state.philosophers) return state;
      const factionEntry = Object.entries(state.philosophers.byFaction).find(
        ([, p]) => p.philosopherId === outcome.philosopherId
      );
      if (!factionEntry) return state;
      const [fId, pState] = factionEntry;
      return {
        ...state,
        philosophers: {
          ...state.philosophers,
          byFaction: {
            ...state.philosophers.byFaction,
            [fId]: { ...pState, pressure: Math.max(0, pState.pressure + outcome.delta) }
          }
        }
      };
    }
    case "rival_pressure": {
      if (!state.rivalOracles) return state;
      return {
        ...state,
        rivalOracles: {
          ...state.rivalOracles,
          roster: state.rivalOracles.roster.map((r) =>
            r.id === outcome.rivalId
              ? { ...r, pressure: Math.max(0, Math.min(r.pressureCap, r.pressure + outcome.delta)) }
              : r
          ),
          totalPressure: Math.max(0, state.rivalOracles.totalPressure + outcome.delta)
        }
      };
    }
    case "building_damage": {
      return {
        ...state,
        buildings: state.buildings.map((b) => {
          if (outcome.defId && b.defId !== outcome.defId) return b;
          return { ...b, condition: Math.max(0, b.condition - outcome.conditionLoss) };
        })
      };
    }
    case "unlock_event_chain": {
      const chainDef = eventChainDefById[outcome.chainId];
      if (!chainDef) return state;
      const chains = state.eventChains ?? [];
      // Don't activate if already active
      const alreadyActive = chains.some((c) => c.defId === chainDef.id && !c.resolved);
      if (alreadyActive) return state;
      const day = getAbsoluteDay(state.clock);
      const firstStage = chainDef.stages[0];
      if (!firstStage) return state;
      const hasPendingChoice = !!(firstStage.choiceA || firstStage.choiceB);
      const newChain: ActiveEventChain = {
        id: `chain-${chainDef.id}-${day}`,
        defId: chainDef.id,
        currentStageId: firstStage.id,
        startDay: day,
        stageStartDay: day,
        pendingChoice: hasPendingChoice,
        resolved: false
      };
      // Apply first stage outcomes (but avoid infinite recursion by not recursing unlock_event_chain)
      let nextState: GameState = {
        ...state,
        eventChains: [...chains, newChain]
      };
      for (const stageOutcome of firstStage.outcomes) {
        if (stageOutcome.kind !== "unlock_event_chain") {
          nextState = applyOutcome(stageOutcome, nextState);
        }
      }
      return nextState;
    }
    case "pilgrim_surge":
    case "trade_disruption":
    case "spawn_consultation":
    case "add_burden":
      // These are handled by the caller or have UI implications
      return state;
  }
}

function applyOutcomes(outcomes: EventStageOutcome[], state: GameState): GameState {
  let next = state;
  for (const outcome of outcomes) {
    next = applyOutcome(outcome, next);
  }
  return next;
}

export function advanceEventChains(state: GameState, events: GameEvent[]): GameState {
  const day = getAbsoluteDay(state.clock);
  let nextState = state;
  const chains = [...(state.eventChains ?? [])];
  const feedItems: GameState["eventFeed"] = [];

  // 1. Advance active chains
  for (let i = 0; i < chains.length; i++) {
    const chain = chains[i];
    if (chain.resolved) continue;
    if (chain.pendingChoice) continue; // Waiting for player

    const def = eventChainDefById[chain.defId];
    if (!def) continue;

    const currentStage = def.stages.find((s) => s.id === chain.currentStageId);
    if (!currentStage) continue;

    // Check if stage duration has elapsed
    const daysSinceStageStart = day - chain.stageStartDay;
    if (daysSinceStageStart < currentStage.durationDays) continue;

    // Apply choice outcomes if applicable
    if (chain.choiceMade) {
      const choiceOutcomes = chain.choiceMade === "a"
        ? currentStage.choiceA?.outcomes ?? []
        : currentStage.choiceB?.outcomes ?? [];
      nextState = applyOutcomes(choiceOutcomes, nextState);
    }

    // Determine next stage
    let nextStageId: string | undefined;
    if (currentStage.nextStageCondition && checkCondition(currentStage.nextStageCondition, nextState)) {
      nextStageId = currentStage.nextStageId;
    } else if (currentStage.nextStageId && !currentStage.nextStageCondition) {
      nextStageId = currentStage.nextStageId;
    }

    if (nextStageId) {
      const nextStage = def.stages.find((s) => s.id === nextStageId);
      if (nextStage) {
        // Apply next stage's entry outcomes
        nextState = applyOutcomes(nextStage.outcomes, nextState);

        const hasPendingChoice = !!(nextStage.choiceA || nextStage.choiceB);
        chains[i] = {
          ...chain,
          currentStageId: nextStageId,
          stageStartDay: day,
          choiceMade: undefined,
          pendingChoice: hasPendingChoice
        };
        events.push({ type: "EventChainAdvanced", chainId: chain.id, stageId: nextStageId });
        feedItems.push({
          id: `event-chain-${chain.id}-${nextStageId}-${day}`,
          day: state.clock.day,
          text: `${def.label}: ${nextStage.label} — ${nextStage.description}`
        });
        continue;
      }
    }

    // No next stage = chain complete
    chains[i] = { ...chain, resolved: true, resolvedDay: day };
    events.push({ type: "EventChainCompleted", chainId: chain.id, defId: chain.defId });
    feedItems.push({
      id: `event-chain-complete-${chain.id}-${day}`,
      day: state.clock.day,
      text: `${def.label} has concluded.`
    });
  }

  // 2. Check for new chain triggers
  for (const def of eventChainDefs) {
    // Check max concurrent
    const activeCount = chains.filter((c) => c.defId === def.id && !c.resolved).length;
    if (activeCount >= def.maxConcurrent) continue;

    // Check cooldown
    const lastResolved = chains
      .filter((c) => c.defId === def.id && c.resolved)
      .sort((a, b) => (b.resolvedDay ?? 0) - (a.resolvedDay ?? 0))[0];
    if (lastResolved && lastResolved.resolvedDay && (day - lastResolved.resolvedDay) < def.triggerCooldownDays) continue;

    // Also check from start day for first occurrence
    const lastStarted = chains
      .filter((c) => c.defId === def.id)
      .sort((a, b) => b.startDay - a.startDay)[0];
    if (lastStarted && (day - lastStarted.startDay) < def.triggerCooldownDays) continue;

    // Check trigger conditions (with cross-chain interaction modifiers)
    if (!allConditionsMetWithCrossChain(def.triggerConditions, nextState, def.id)) continue;

    // Trigger new chain!
    const firstStage = def.stages[0];
    if (!firstStage) continue;

    const hasPendingChoice = !!(firstStage.choiceA || firstStage.choiceB);
    const newChain: ActiveEventChain = {
      id: `chain-${def.id}-${day}`,
      defId: def.id,
      currentStageId: firstStage.id,
      startDay: day,
      stageStartDay: day,
      pendingChoice: hasPendingChoice,
      resolved: false
    };

    // Apply first stage outcomes
    nextState = applyOutcomes(firstStage.outcomes, nextState);
    chains.push(newChain);
    feedItems.push({
      id: `event-chain-start-${newChain.id}-${day}`,
      day: state.clock.day,
      text: `${def.label}: ${firstStage.label} — ${firstStage.description}`
    });
  }

  // Clean up old resolved chains (keep last 20)
  const resolved = chains.filter((c) => c.resolved);
  const active = chains.filter((c) => !c.resolved);
  const keepResolved = resolved.slice(-20);

  return {
    ...nextState,
    eventChains: [...active, ...keepResolved],
    eventFeed: [...feedItems, ...nextState.eventFeed].slice(0, 8)
  };
}
