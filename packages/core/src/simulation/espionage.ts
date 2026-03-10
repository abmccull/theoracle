import type { GameState, PriestSecret, PriestSecretKind } from "../state/gameState";
import type { EspionageAgent, EspionageOperation, EspionageState, CounterIntelEvent, EspionageOperationReward } from "../state/espionage";
import { createInitialEspionageState } from "../state/espionage";

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

const SECRET_KINDS: PriestSecretKind[] = ["corruption", "heresy", "rivalry", "forbidden_knowledge"];

/**
 * Calculate trait bonus for success threshold.
 */
function getTraitSuccessBonus(agent: EspionageAgent, operationKind: EspionageOperation["kind"]): number {
  if (!agent.trait) return 0;
  switch (agent.trait) {
    case "silver_tongue":
      return operationKind === "recruit_informant" ? 0.15 : 0;
    case "code_breaker":
      return operationKind === "intercept_prophecy" ? 0.25 : 0;
    case "double_agent":
      return operationKind === "sabotage_rival" ? 0.10 : 0;
    default:
      return 0;
  }
}

/**
 * Calculate trait bonus for detection reduction.
 */
function getTraitDetectionReduction(agent: EspionageAgent): number {
  if (!agent.trait) return 0;
  if (agent.trait === "shadow_walker") return -0.20;
  if (agent.trait === "master_of_disguise") return -0.15;
  return 0;
}

/**
 * Generate a reward for a successful operation.
 */
function generateReward(operation: EspionageOperation): EspionageOperationReward | undefined {
  switch (operation.kind) {
    case "intercept_prophecy":
      return { kind: "intercept_prophecy", factionId: operation.targetId, consultationInsight: true };
    case "plant_false_omen":
      return { kind: "plant_false_omen", factionId: operation.targetId };
    case "recruit_informant":
      return { kind: "recruit_informant", factionId: operation.targetId, credibilityBonus: 5 };
    case "sabotage_rival":
      return { kind: "sabotage", rivalId: operation.targetId, pressureDelta: -8 };
    case "protect_oracle":
      return { kind: "protect_oracle", defenseBonus: 10, durationDays: 15 };
    default:
      return undefined;
  }
}

function resolveOperation(
  state: GameState,
  operation: EspionageOperation,
  espionage: EspionageState
): { operation: EspionageOperation; counterIntelEvent?: CounterIntelEvent; agentUpdates?: Partial<EspionageAgent> } {
  const agent = espionage.agents.find((a) => a.id === operation.agentId);
  if (!agent) {
    return {
      operation: { ...operation, status: "failed", result: "Agent lost." },
      agentUpdates: undefined
    };
  }

  const rivalIntel = state.rivalOracles?.roster.find((r) => r.id === operation.targetId)?.intel ?? 30;

  // Factor in morale and experience
  const moraleModifier = ((agent.morale ?? 60) - 50) * 0.003; // -0.15 to +0.15
  const experienceModifier = (agent.experience ?? 0) * 0.002; // 0 to +0.20
  const traitBonus = getTraitSuccessBonus(agent, operation.kind);

  const successRoll = hash(state.worldSeed + operation.startDay * 17, `${operation.id}:resolve`);
  const baseThreshold = (agent.skill * 0.6 + espionage.networkStrength * 0.2 - rivalIntel * 0.3) / 100;
  const successThreshold = baseThreshold + 0.3 + moraleModifier + experienceModifier + traitBonus;
  const succeeded = successRoll < clamp(successThreshold, 0.15, 0.85);

  const detectionRoll = hash(state.worldSeed + operation.startDay * 23, `${operation.id}:detect`);
  const baseDetection = (rivalIntel * 0.4 - agent.skill * 0.25 - espionage.networkStrength * 0.1) / 100;
  const traitDetectionReduction = getTraitDetectionReduction(agent);
  const detectionThreshold = baseDetection + 0.1 + traitDetectionReduction;
  const detected = detectionRoll < clamp(detectionThreshold, 0.05, 0.5);

  // Generate narrative
  const narrative: string[] = [];

  let result: string;
  switch (operation.kind) {
    case "intercept_prophecy":
      result = succeeded ? "Intercepted a rival prophecy, gaining strategic insight." : "The prophecy slipped through unnoticed.";
      narrative.push(succeeded ? "The agent observed rival priests in secret council." : "Enemy precautions thwarted surveillance.");
      break;
    case "plant_false_omen":
      result = succeeded ? "A false omen has been planted, sowing confusion among rivals." : "The false omen was seen through.";
      narrative.push(succeeded ? "Whispers of a fabricated sign spread among the people." : "The deception unraveled before taking root.");
      break;
    case "recruit_informant":
      result = succeeded ? "A new informant has been turned inside the target faction." : "The recruitment attempt was rebuffed.";
      narrative.push(succeeded ? "Gold and promises secured a new pair of loyal ears." : "The target proved incorruptible.");
      break;
    case "sabotage_rival":
      result = succeeded ? "Rival operations disrupted through careful sabotage." : "Sabotage failed; the rival remains undisturbed.";
      narrative.push(succeeded ? "Key supplies went missing at a crucial moment." : "Guards spotted the agent before damage was done.");
      break;
    case "protect_oracle":
      result = succeeded ? "Oracle defenses strengthened against infiltration." : "Protection efforts yielded no tangible benefit.";
      narrative.push(succeeded ? "New safeguards sealed potential security gaps." : "The defensive perimeter remains unchanged.");
      break;
    case "seed_philosopher":
      result = succeeded ? "A philosopher now carries ideas favorable to Delphi." : "The philosopher proved resistant to influence.";
      narrative.push(succeeded ? "Subtle persuasion shifted the thinker's perspective." : "Philosophical stubbornness proved unassailable.");
      break;
    default:
      result = succeeded ? "Operation completed." : "Operation failed.";
  }

  // Determine agent morale/experience updates
  const agentUpdates: Partial<EspionageAgent> = {};
  if (succeeded) {
    agentUpdates.morale = clamp((agent.morale ?? 60) + 5, 0, 100);
    agentUpdates.experience = clamp((agent.experience ?? 0) + 8, 0, 100);
  } else {
    agentUpdates.morale = clamp((agent.morale ?? 60) - 10, 0, 100);
    agentUpdates.experience = clamp((agent.experience ?? 0) + 3, 0, 100);
  }
  agentUpdates.status = "available";
  agentUpdates.lastMissionDay = state.clock.day;

  // Handle captured state on detection
  let finalStatus: EspionageOperation["status"];
  if (detected) {
    finalStatus = "detected";
    // Severe detection may result in capture
    const captureRoll = hash(state.worldSeed + operation.startDay * 29, `${operation.id}:capture`);
    if (captureRoll < 0.3) {
      agentUpdates.status = "captured";
      agentUpdates.morale = clamp((agent.morale ?? 60) - 30, 0, 100);
      narrative.push("The agent was captured by enemy forces!");
    } else {
      agentUpdates.status = "compromised";
      agentUpdates.morale = clamp((agent.morale ?? 60) - 15, 0, 100);
    }
  } else {
    finalStatus = succeeded ? "success" : "failed";
  }

  const reward = succeeded ? generateReward(operation) : undefined;

  let counterIntelEvent: CounterIntelEvent | undefined;
  if (detected) {
    counterIntelEvent = {
      id: `counter-intel-${state.clock.day}-${operation.id}`,
      day: state.clock.day,
      description: `Agent ${agent.name}'s ${operation.kind.replace(/_/g, " ")} operation was detected by counter-intelligence.`,
      severityDelta: succeeded ? 3 : 6
    };
  }

  return {
    operation: {
      ...operation,
      status: finalStatus,
      result,
      successChance: clamp(successThreshold, 0.15, 0.85),
      detectionRisk: clamp(detectionThreshold, 0.05, 0.5),
      reward,
      narrative
    },
    counterIntelEvent,
    agentUpdates
  };
}

function generatePriestSecrets(state: GameState): GameState {
  const day = state.clock.day;
  let priests = state.priests;
  let changed = false;

  for (let index = 0; index < priests.length; index++) {
    const priest = priests[index]!;
    const roll = hash(state.worldSeed + day * 31 + index * 53, `${priest.id}:secret`);
    // ~8% chance per month per priest
    if (roll > 0.08) {
      continue;
    }

    const kindRoll = hash(state.worldSeed + day * 41 + index * 67, `${priest.id}:secret-kind`);
    const kind = SECRET_KINDS[Math.floor(kindRoll * SECRET_KINDS.length)]!;
    const severity = Math.round(20 + hash(state.worldSeed + day * 59 + index * 71, `${priest.id}:severity`) * 60);
    const existingSecrets = priest.secrets ?? [];

    // Don't pile up too many secrets
    if (existingSecrets.length >= 3) {
      continue;
    }

    const newSecret: PriestSecret = {
      id: `secret-${priest.id}-${day}`,
      kind,
      severity
    };

    if (!changed) {
      priests = [...priests];
      changed = true;
    }
    priests[index] = {
      ...priest,
      secrets: [...existingSecrets, newSecret]
    };
  }

  return changed ? { ...state, priests } : state;
}

function evaluateSuccessionContest(state: GameState): GameState {
  const politics = state.priestPolitics;
  if (!politics) {
    return state;
  }

  // Trigger succession contest when dominant bloc shifts AND high pressure
  const highPressure = politics.overallPressure >= 65;
  const existingContest = politics.successionContest;

  if (existingContest?.active) {
    // Resolve contest after 15 days
    if (state.clock.day - existingContest.startDay >= 15) {
      const frontRunner = existingContest.frontRunnerId ?? existingContest.candidates[0];
      return {
        ...state,
        priestPolitics: {
          ...politics,
          successionContest: {
            ...existingContest,
            active: false
          },
          overallPressure: Math.max(0, politics.overallPressure - 10)
        },
        priests: state.priests.map((p, i) => ({
          ...p,
          successionRank: p.id === frontRunner ? 1 : i + 2
        }))
      };
    }
    return state;
  }

  // Start new contest if conditions are met
  if (highPressure && !existingContest) {
    const candidates = state.priests
      .filter((p) => {
        const profile = politics.priests[p.id];
        return profile && profile.influence >= 40;
      })
      .map((p) => p.id);

    if (candidates.length >= 2) {
      const profiles = candidates.map((id) => {
        const priest = state.priests.find((p) => p.id === id);
        const politicalProfile = politics.priests[id];
        const experience = priest?.experience ?? 0;
        const priestLoyalty = priest?.loyalty ?? 50;
        return {
          id,
          score: (politicalProfile?.influence ?? 0)
            + (politicalProfile?.loyalty ?? 0) * 0.3
            + experience * 0.4
            + priestLoyalty * 0.3
        };
      });
      profiles.sort((a, b) => b.score - a.score);

      return {
        ...state,
        priestPolitics: {
          ...politics,
          successionContest: {
            active: true,
            candidates,
            frontRunnerId: profiles[0]?.id,
            startDay: state.clock.day
          }
        }
      };
    }
  }

  return state;
}

/**
 * Interrogate a captured enemy agent. 5-day process.
 * Success chance: 40% base + 10% per interrogator skill level (skill/10).
 * On success, reveals rival network strength and faction secrets as advisor messages.
 */
export function interrogateAgent(
  state: GameState,
  agentId: string
): GameState {
  const espionage = state.espionage ?? createInitialEspionageState();
  const agent = espionage.agents.find((a) => a.id === agentId);
  if (!agent) return state;

  const agentStatus = agent.status ?? (agent.compromised ? "compromised" : "available");
  if (agentStatus !== "captured") return state;

  // Start or progress interrogation
  const progress = (agent.interrogationProgress ?? 0) + 1;
  if (progress < 5) {
    // Still in progress
    return {
      ...state,
      espionage: {
        ...espionage,
        agents: espionage.agents.map((a) =>
          a.id === agentId
            ? {
                ...a,
                interrogationProgress: progress,
                interrogationStartDay: a.interrogationStartDay ?? state.clock.day
              }
            : a
        )
      }
    };
  }

  // Interrogation complete - check success
  const interrogatorSkill = Math.max(...espionage.agents
    .filter((a) => a.id !== agentId && (a.status ?? "available") === "available")
    .map((a) => a.skill), 0);
  const successChance = 0.4 + (interrogatorSkill / 10) * 0.1;
  const roll = hash(state.worldSeed + state.clock.day * 43, `${agentId}:interrogate`);
  const succeeded = roll < clamp(successChance, 0.1, 0.95);

  const advisorMessages = [...state.advisorMessages];
  if (succeeded) {
    // Reveal rival network strength
    advisorMessages.push({
      id: `intel-${state.clock.day}-${agentId}`,
      advisorId: "spymaster",
      text: `Interrogation of ${agent.name} reveals the enemy network has strength ${espionage.networkStrength}. Their faction ${agent.targetFactionId} harbors hidden agendas.`,
      severity: "info"
    });
  }

  // Reset interrogation state
  return {
    ...state,
    advisorMessages,
    espionage: {
      ...espionage,
      agents: espionage.agents.map((a) =>
        a.id === agentId
          ? {
              ...a,
              interrogationProgress: 0,
              interrogationStartDay: undefined
            }
          : a
      )
    },
    eventFeed: [
      {
        id: `event-interrogation-${state.clock.day}-${agentId}`,
        day: state.clock.day,
        text: succeeded
          ? `Interrogation of captured agent ${agent.name} yielded valuable intelligence.`
          : `Interrogation of captured agent ${agent.name} failed to extract useful information.`
      },
      ...state.eventFeed
    ].slice(0, 8)
  };
}

/**
 * Check for turncoat on agent capture. 20% chance the captured agent defects.
 */
function checkTurncoat(
  state: GameState,
  agentId: string,
  espionage: EspionageState
): { espionage: EspionageState; turncoat: boolean; eventText?: string } {
  const agent = espionage.agents.find((a) => a.id === agentId);
  if (!agent) return { espionage, turncoat: false };

  const roll = hash(state.worldSeed + state.clock.day * 47, `${agentId}:turncoat`);
  if (roll >= 0.20) return { espionage, turncoat: false };

  // Agent defects — remove from roster
  return {
    espionage: {
      ...espionage,
      agents: espionage.agents.filter((a) => a.id !== agentId),
      networkStrength: Math.max(0, espionage.networkStrength - 10)
    },
    turncoat: true,
    eventText: `Agent ${agent.name} has defected to the enemy! They now work as a double agent against us.`
  };
}

/**
 * Calculate ransom cost for a captured agent.
 */
export function getRansomCost(agent: EspionageAgent): number {
  return Math.round(10 + (agent.experience ?? 0) * 0.5);
}

/**
 * Calculate recruitment cost for a new agent.
 */
export function getRecruitmentCost(skill: number): number {
  return Math.round(15 + skill * 0.5);
}

/**
 * Process monthly upkeep for espionage network.
 * Deployed agent: 3 gold each.
 * Network maintenance: 5 gold base + 2 per active agent.
 * Failure to pay → morale drops, network strength decays.
 */
export function processEspionageUpkeep(state: GameState): GameState {
  const espionage = state.espionage ?? createInitialEspionageState();
  if (espionage.agents.length === 0) return state;

  const activeAgents = espionage.agents.filter(
    (a) => (a.status ?? "available") !== "retired" && (a.status ?? "available") !== "captured"
  );
  const deployedCost = activeAgents.length * 3;
  const maintenanceCost = 5 + activeAgents.length * 2;
  const totalCost = deployedCost + maintenanceCost;

  const currentGold = state.resources.gold.amount;

  if (currentGold >= totalCost) {
    // Pay upkeep
    return {
      ...state,
      resources: {
        ...state.resources,
        gold: {
          ...state.resources.gold,
          amount: currentGold - totalCost,
          trend: -totalCost
        }
      },
      espionage: {
        ...espionage,
        lastUpkeepMonth: state.clock.month
      }
    };
  }

  // Cannot pay — morale drops, network decays
  return {
    ...state,
    espionage: {
      ...espionage,
      lastUpkeepMonth: state.clock.month,
      agents: espionage.agents.map((a) => ({
        ...a,
        morale: Math.max(0, (a.morale ?? 60) - 10)
      })),
      networkStrength: Math.max(0, espionage.networkStrength - 5)
    },
    eventFeed: [
      {
        id: `event-upkeep-fail-${state.clock.day}`,
        day: state.clock.day,
        text: "Insufficient gold for espionage upkeep. Agent morale drops and network weakens."
      },
      ...state.eventFeed
    ].slice(0, 8)
  };
}

export function advanceEspionage(state: GameState): GameState {
  const espionage = state.espionage ?? createInitialEspionageState();
  const day = state.clock.day;

  // Progress and resolve completed operations
  let nextOperations = espionage.operations;
  const newCounterIntelEvents: CounterIntelEvent[] = [];
  let changed = false;
  let nextAgents = espionage.agents;
  let agentsChanged = false;

  // Track agent updates from operation resolution
  const agentUpdateMap = new Map<string, Partial<EspionageAgent>>();

  for (let index = 0; index < nextOperations.length; index++) {
    const operation = nextOperations[index]!;
    if (operation.status !== "active") {
      continue;
    }

    if (day >= operation.startDay + operation.duration) {
      if (!changed) {
        nextOperations = [...nextOperations];
        changed = true;
      }
      const resolution = resolveOperation(state, operation, espionage);
      nextOperations[index] = resolution.operation;
      if (resolution.counterIntelEvent) {
        newCounterIntelEvents.push(resolution.counterIntelEvent);
      }
      if (resolution.agentUpdates) {
        agentUpdateMap.set(operation.agentId, resolution.agentUpdates);
      }
    }
  }

  // Apply agent updates from resolved operations
  if (agentUpdateMap.size > 0) {
    if (!agentsChanged) {
      nextAgents = [...nextAgents];
      agentsChanged = true;
    }
    for (let index = 0; index < nextAgents.length; index++) {
      const agent = nextAgents[index]!;
      const updates = agentUpdateMap.get(agent.id);
      if (updates) {
        nextAgents[index] = {
          ...agent,
          ...updates,
          // If agent was captured/compromised by operation, also set compromised flag for backward compat
          compromised: updates.status === "compromised" || updates.status === "captured" || agent.compromised
        };
      }
    }
  }

  // Counter-intelligence: rivals may compromise agents (only those not already handled)
  for (let index = 0; index < nextAgents.length; index++) {
    const agent = nextAgents[index]!;
    if (agent.compromised || agentUpdateMap.has(agent.id)) {
      continue;
    }
    const rivalIntel = state.rivalOracles?.roster
      .filter((r) => r.patronFactionId === agent.targetFactionId)
      .reduce((max, r) => Math.max(max, r.intel), 0) ?? 0;
    const compromiseRoll = hash(state.worldSeed + day * 37 + index * 43, `${agent.id}:compromise`);
    const compromiseThreshold = (rivalIntel * 0.3 - agent.skill * 0.2 - agent.loyalty * 0.1) / 100;
    if (compromiseRoll < clamp(compromiseThreshold, 0.01, 0.12)) {
      if (!agentsChanged) {
        nextAgents = [...nextAgents];
        agentsChanged = true;
      }
      nextAgents[index] = { ...agent, compromised: true, status: "compromised" };
      newCounterIntelEvents.push({
        id: `counter-intel-compromised-${day}-${agent.id}`,
        day,
        description: `Agent ${agent.name} has been compromised while operating as a ${agent.cover}.`,
        severityDelta: 8
      });
    }
  }

  // Update network strength
  const activeAgentCount = nextAgents.filter((a) => !a.compromised).length;
  const successfulOps = nextOperations.filter((op) => op.status === "success").length;
  const detectedOps = nextOperations.filter((op) => op.status === "detected").length;
  const networkStrength = clamp(
    Math.round(
      10 + activeAgentCount * 8 + successfulOps * 3 - detectedOps * 5
      - newCounterIntelEvents.reduce((sum, e) => sum + e.severityDelta, 0) * 0.5
    ),
    0,
    100
  );

  // Check for turncoat on newly captured agents
  const turncoatEvents: string[] = [];
  for (const [agentId, updates] of agentUpdateMap.entries()) {
    if (updates.status === "captured") {
      const turncoatResult = checkTurncoat(
        state,
        agentId,
        { ...espionage, agents: nextAgents, operations: nextOperations, counterIntelEvents: espionage.counterIntelEvents, networkStrength }
      );
      if (turncoatResult.turncoat) {
        nextAgents = turncoatResult.espionage.agents;
        agentsChanged = true;
        if (turncoatResult.eventText) {
          turncoatEvents.push(turncoatResult.eventText);
        }
      }
    }
  }

  // Track consecutive failures for network exposure
  let consecutiveFailures = espionage.consecutiveFailures ?? 0;
  let networkExposed = false;
  for (const op of nextOperations) {
    const wasActive = espionage.operations.find((o) => o.id === op.id);
    if (wasActive?.status !== "active") continue;
    if (op.status === "failed" || op.status === "detected") {
      consecutiveFailures++;
    } else if (op.status === "success") {
      consecutiveFailures = 0;
    }
  }
  if (consecutiveFailures >= 3) {
    networkExposed = true;
  }

  // Prophecy interaction flags from newly resolved operations
  let falseOmenTargets = [...(espionage.falseOmenTargets ?? [])];
  let oracleProtectionActive = espionage.oracleProtectionActive ?? false;
  const advisorMessages = [...state.advisorMessages];

  for (const op of nextOperations) {
    if (op.status !== "success") continue;
    const wasActive = espionage.operations.find((o) => o.id === op.id);
    if (wasActive?.status !== "active") continue;

    if (op.kind === "plant_false_omen") {
      // Set flag to reduce next consultation omen_quality for target faction by 20%
      if (!falseOmenTargets.includes(op.targetId)) {
        falseOmenTargets.push(op.targetId);
      }
    }
    if (op.kind === "intercept_prophecy") {
      // Reveal upcoming faction agenda shift
      advisorMessages.push({
        id: `intel-intercept-${day}-${op.id}`,
        advisorId: "spymaster",
        text: `Our agents have intercepted a rival prophecy from faction ${op.targetId}. Their agenda may shift soon — prepare accordingly.`,
        severity: "warn"
      });
    }
    if (op.kind === "protect_oracle") {
      // Block next rival oracle operation
      oracleProtectionActive = true;
    }
  }

  const nextEspionage: EspionageState = {
    agents: nextAgents,
    operations: nextOperations.slice(-50), // Keep last 50 operations
    counterIntelEvents: [...newCounterIntelEvents, ...espionage.counterIntelEvents].slice(0, 20),
    networkStrength,
    consecutiveFailures,
    falseOmenTargets,
    oracleProtectionActive,
    lastUpkeepMonth: espionage.lastUpkeepMonth
  };

  let nextState: GameState = {
    ...state,
    espionage: nextEspionage,
    advisorMessages
  };

  // Apply operation effects to rival oracles
  for (const op of nextOperations) {
    if (op.status !== "success") continue;
    // Only process newly resolved ops (those that resolved this tick)
    const wasActive = espionage.operations.find((o) => o.id === op.id);
    if (wasActive?.status !== "active") continue;

    if (op.kind === "sabotage_rival" && nextState.rivalOracles) {
      nextState = {
        ...nextState,
        rivalOracles: {
          ...nextState.rivalOracles,
          roster: nextState.rivalOracles.roster.map((r) =>
            r.id === op.targetId
              ? { ...r, pressure: Math.max(0, r.pressure - 8), intrigue: Math.max(0, r.intrigue - 5) }
              : r
          )
        }
      };
    }
    if (op.kind === "intercept_prophecy" && nextState.rivalOracles) {
      nextState = {
        ...nextState,
        rivalOracles: {
          ...nextState.rivalOracles,
          roster: nextState.rivalOracles.roster.map((r) =>
            r.id === op.targetId
              ? { ...r, intel: Math.min(100, r.intel + 10), visibility: Math.min(100, r.visibility + 6) }
              : r
          )
        }
      };
    }
    if (op.kind === "protect_oracle") {
      nextState = {
        ...nextState,
        pythia: {
          ...nextState.pythia,
          attunement: Math.min(100, nextState.pythia.attunement + 2),
          prestige: Math.min(100, nextState.pythia.prestige + 1)
        }
      };
    }
  }

  // Espionage event chain triggers
  const espionageEventFeed: GameState["eventFeed"] = [];
  for (const op of nextOperations) {
    const wasActive = espionage.operations.find((o) => o.id === op.id);
    if (wasActive?.status !== "active") continue;

    // Successful sabotage → "Rival Disgrace" chain trigger
    if (op.status === "success" && op.kind === "sabotage_rival") {
      espionageEventFeed.push({
        id: `event-sabotage-chain-${day}-${op.id}`,
        day,
        text: `Successful sabotage against ${op.targetId} may trigger a rival's public disgrace.`
      });
    }

    // Agent captured → "Intelligence Breach" chain trigger
    const capturedUpdate = agentUpdateMap.get(op.agentId);
    if (capturedUpdate?.status === "captured") {
      espionageEventFeed.push({
        id: `event-capture-chain-${day}-${op.id}`,
        day,
        text: "An agent's capture raises the specter of an intelligence breach."
      });
    }
  }

  // Network exposure → crisis-level event
  if (networkExposed) {
    espionageEventFeed.push({
      id: `event-network-exposed-${day}`,
      day,
      text: "Three consecutive operation failures have exposed the Oracle's espionage network! A crisis looms."
    });
    // Also emit advisor warning
    nextState = {
      ...nextState,
      advisorMessages: [
        ...nextState.advisorMessages,
        {
          id: `advisor-network-exposed-${day}`,
          advisorId: "spymaster",
          text: "Oracle's Network Exposed! Our espionage operations have suffered repeated failures. Rivals are now aware of our intelligence activities.",
          severity: "critical"
        }
      ]
    };
  }

  // Failed espionage counter-event: emit advisor warning on any newly failed ops
  for (const op of nextOperations) {
    const wasActive = espionage.operations.find((o) => o.id === op.id);
    if (wasActive?.status !== "active") continue;
    if (op.status === "detected") {
      nextState = {
        ...nextState,
        advisorMessages: [
          ...nextState.advisorMessages,
          {
            id: `advisor-detected-${day}-${op.id}`,
            advisorId: "spymaster",
            text: `Our ${op.kind.replace(/_/g, " ")} operation was detected. Counter-intelligence may be closing in.`,
            severity: "warn"
          }
        ]
      };
    }
  }

  // Add turncoat events to feed
  for (const text of turncoatEvents) {
    espionageEventFeed.push({
      id: `event-turncoat-${day}-${espionageEventFeed.length}`,
      day,
      text
    });
  }

  // Add feed items for counter-intel events and espionage events
  const allNewFeedItems = [
    ...newCounterIntelEvents.slice(0, 2).map((event) => ({
      id: `event-${event.id}`,
      day,
      text: event.description
    })),
    ...espionageEventFeed
  ];

  if (allNewFeedItems.length > 0) {
    nextState = {
      ...nextState,
      eventFeed: [...allNewFeedItems, ...nextState.eventFeed].slice(0, 8)
    };
  }

  // Process monthly upkeep
  if (state.clock.month !== (espionage.lastUpkeepMonth ?? -1)) {
    nextState = processEspionageUpkeep(nextState);
  }

  // Generate priest secrets (monthly)
  nextState = generatePriestSecrets(nextState);

  // Evaluate succession contest
  nextState = evaluateSuccessionContest(nextState);

  return nextState;
}
