import type { FactionId } from "./gameState";

export type EspionageAgentCover = "merchant" | "pilgrim" | "priest" | "scholar";

export type EspionageAgentTrait =
  | "silver_tongue"    // +15% recruit success
  | "shadow_walker"    // -20% detection chance
  | "code_breaker"     // +25% intercept success
  | "double_agent"     // Can turn enemy agents
  | "master_of_disguise"; // Can change cover mid-mission

export type EspionageAgentStatus = "available" | "deployed" | "compromised" | "captured" | "retired";

export type EspionageOperationKind =
  | "intercept_prophecy"
  | "plant_false_omen"
  | "recruit_informant"
  | "sabotage_rival"
  | "protect_oracle"
  | "seed_philosopher";

export type EspionageAgent = {
  id: string;
  name: string;
  cover: EspionageAgentCover;
  targetFactionId: FactionId;
  skill: number;
  loyalty: number;
  compromised: boolean;
  recruitedDay: number;
  // Enhanced fields (optional for backward compatibility)
  morale?: number; // 0-100, affects success chance
  experience?: number; // 0-100, grows with successful ops
  trait?: EspionageAgentTrait;
  status?: EspionageAgentStatus;
  lastMissionDay?: number;
  missionCooldownDays?: number; // Rest period between missions
  interrogationProgress?: number; // 0-5, tracks interrogation days
  interrogationStartDay?: number; // Day interrogation started
};

export type EspionageOperationStatus = "active" | "success" | "failed" | "detected";

export type EspionageOperationReward =
  | { kind: "intel"; rivalId: string; amount: number }
  | { kind: "sabotage"; rivalId: string; pressureDelta: number }
  | { kind: "recruit_informant"; factionId: string; credibilityBonus: number }
  | { kind: "intercept_prophecy"; factionId: string; consultationInsight: boolean }
  | { kind: "protect_oracle"; defenseBonus: number; durationDays: number }
  | { kind: "plant_false_omen"; factionId: string; agendaShift?: string };

export type EspionageOperation = {
  id: string;
  kind: EspionageOperationKind;
  agentId: string;
  targetId: string;
  startDay: number;
  duration: number;
  status: EspionageOperationStatus;
  result?: string;
  // Enhanced fields (optional for backward compatibility)
  successChance?: number;
  detectionRisk?: number;
  reward?: EspionageOperationReward;
  narrative?: string[];
};

export type CounterIntelEvent = {
  id: string;
  day: number;
  description: string;
  severityDelta: number;
};

export type EspionageState = {
  agents: EspionageAgent[];
  operations: EspionageOperation[];
  counterIntelEvents: CounterIntelEvent[];
  networkStrength: number;
  consecutiveFailures?: number; // Track consecutive failed operations for network exposure
  falseOmenTargets?: string[]; // Faction IDs affected by plant_false_omen (reduces omen quality)
  oracleProtectionActive?: boolean; // True when protect_oracle blocks next rival operation
  lastUpkeepMonth?: number; // Track last month upkeep was processed
};

export function createInitialEspionageState(): EspionageState {
  return {
    agents: [],
    operations: [],
    counterIntelEvents: [],
    networkStrength: 10
  };
}
