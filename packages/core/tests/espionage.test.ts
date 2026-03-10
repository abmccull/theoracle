import { describe, expect, it } from "vitest";

import { createInitialEspionageState } from "../src/state/espionage";
import { createInitialState } from "../src/state/initialState";
import { reduceCommand } from "../src/reducers";
import { advanceEspionage } from "../src/simulation/espionage";
import type { GameState } from "../src/state/gameState";
import type { EspionageAgent, EspionageState } from "../src/state/espionage";

function stateWithGold(amount: number): GameState {
  const state = createInitialState();
  return {
    ...state,
    resources: {
      ...state.resources,
      gold: { ...state.resources.gold, amount }
    }
  };
}

function stateWithAgent(overrides?: Partial<EspionageAgent>): GameState {
  const state = stateWithGold(200);
  const agent: EspionageAgent = {
    id: "agent-1",
    name: "Melas",
    cover: "merchant",
    targetFactionId: "athens",
    skill: 50,
    loyalty: 60,
    compromised: false,
    recruitedDay: 1,
    morale: 60,
    experience: 0,
    status: "available",
    missionCooldownDays: 5,
    ...overrides
  };
  const espionage: EspionageState = {
    ...createInitialEspionageState(),
    agents: [agent]
  };
  return { ...state, espionage };
}

describe("espionage", () => {
  describe("RecruitAgentCommand with enhanced fields", () => {
    it("recruits agent with morale, experience, status, and cooldown", () => {
      const state = stateWithGold(100);
      const { state: next } = reduceCommand(state, {
        type: "RecruitAgentCommand",
        cover: "merchant",
        targetFactionId: "athens"
      });

      const agent = next.espionage!.agents[0]!;
      expect(agent.morale).toBe(60);
      expect(agent.experience).toBe(0);
      expect(agent.status).toBe("available");
      expect(agent.missionCooldownDays).toBe(5);
      expect(agent.cover).toBe("merchant");
    });

    it("assigns a trait with ~30% chance based on seed", () => {
      // Run multiple recruits to find one with a trait
      let foundTrait = false;
      let foundNoTrait = false;
      const validTraits = new Set(["silver_tongue", "shadow_walker", "code_breaker", "double_agent", "master_of_disguise"]);

      for (let seed = 0; seed < 50; seed++) {
        const state = stateWithGold(500);
        const seeded = { ...state, worldSeed: seed };
        const { state: next } = reduceCommand(seeded, {
          type: "RecruitAgentCommand",
          cover: "scholar",
          targetFactionId: "athens"
        });
        const agent = next.espionage!.agents[0]!;
        if (agent.trait) {
          foundTrait = true;
          expect(validTraits.has(agent.trait)).toBe(true);
        } else {
          foundNoTrait = true;
        }
        if (foundTrait && foundNoTrait) break;
      }
      // With 30% chance and 50 seeds, we should see both outcomes
      expect(foundTrait).toBe(true);
      expect(foundNoTrait).toBe(true);
    });
  });

  describe("DeployAgentCommand", () => {
    it("creates operation and sets agent status to deployed", () => {
      const state = stateWithAgent();
      const { state: next } = reduceCommand(state, {
        type: "DeployAgentCommand",
        agentId: "agent-1",
        operationKind: "sabotage_rival",
        targetId: "rival-1"
      });

      const agent = next.espionage!.agents.find((a) => a.id === "agent-1")!;
      expect(agent.status).toBe("deployed");

      const op = next.espionage!.operations.find((o) => o.agentId === "agent-1");
      expect(op).toBeDefined();
      expect(op!.kind).toBe("sabotage_rival");
      expect(op!.status).toBe("active");
      expect(op!.successChance).toBeGreaterThanOrEqual(0.15);
      expect(op!.successChance).toBeLessThanOrEqual(0.85);
      expect(op!.detectionRisk).toBeGreaterThanOrEqual(0.05);
      expect(op!.detectionRisk).toBeLessThanOrEqual(0.5);
      expect(op!.narrative).toBeDefined();
      expect(op!.narrative!.length).toBeGreaterThan(0);
    });

    it("rejects deployment of compromised agent", () => {
      const state = stateWithAgent({ status: "compromised", compromised: true });
      const { state: next } = reduceCommand(state, {
        type: "DeployAgentCommand",
        agentId: "agent-1",
        operationKind: "sabotage_rival",
        targetId: "rival-1"
      });

      // Should not create an operation
      const ops = next.espionage?.operations ?? [];
      expect(ops.filter((o) => o.agentId === "agent-1" && o.status === "active")).toHaveLength(0);
    });

    it("rejects deployment during cooldown", () => {
      const state = stateWithAgent({ lastMissionDay: 5, missionCooldownDays: 5 });
      // Set day to 8 (before cooldown ends at day 10)
      const stateWithDay = {
        ...state,
        clock: { ...state.clock, day: 8 }
      };
      const { state: next } = reduceCommand(stateWithDay, {
        type: "DeployAgentCommand",
        agentId: "agent-1",
        operationKind: "sabotage_rival",
        targetId: "rival-1"
      });

      const ops = next.espionage?.operations ?? [];
      expect(ops.filter((o) => o.agentId === "agent-1" && o.status === "active")).toHaveLength(0);
    });
  });

  describe("RecallAgentCommand", () => {
    it("returns agent to available with morale penalty", () => {
      const state = stateWithAgent({ status: "deployed", morale: 60 });
      // Add an active operation for the agent
      const withOp: GameState = {
        ...state,
        espionage: {
          ...state.espionage!,
          operations: [
            {
              id: "op-1",
              kind: "sabotage_rival",
              agentId: "agent-1",
              targetId: "rival-1",
              startDay: 1,
              duration: 8,
              status: "active"
            }
          ]
        }
      };

      const { state: next } = reduceCommand(withOp, {
        type: "RecallAgentCommand",
        agentId: "agent-1"
      });

      const agent = next.espionage!.agents.find((a) => a.id === "agent-1")!;
      expect(agent.status).toBe("available");
      expect(agent.morale).toBe(55); // 60 - 5

      const op = next.espionage!.operations.find((o) => o.id === "op-1")!;
      expect(op.status).toBe("failed");
      expect(op.result).toContain("recalled");
    });
  });

  describe("RansomAgentCommand", () => {
    it("ransoms captured agent for gold", () => {
      const state = stateWithAgent({ status: "captured", compromised: true, skill: 50 });
      const { state: next } = reduceCommand(state, {
        type: "RansomAgentCommand",
        agentId: "agent-1"
      });

      const agent = next.espionage!.agents.find((a) => a.id === "agent-1")!;
      expect(agent.status).toBe("available");
      expect(agent.compromised).toBe(false);
      // Ransom cost: 10 + experience * 0.5 = 10 + 0 = 10
      expect(next.resources.gold.amount).toBe(200 - 10);
      // Loyalty reduced by 15
      expect(agent.loyalty).toBe(45); // 60 - 15
      // Morale reduced by 20
      expect(agent.morale).toBe(40); // 60 - 20
    });

    it("rejects ransom of non-captured agent", () => {
      const state = stateWithAgent({ status: "available" });
      const original = state.resources.gold.amount;
      const { state: next } = reduceCommand(state, {
        type: "RansomAgentCommand",
        agentId: "agent-1"
      });

      // Gold should be unchanged
      expect(next.resources.gold.amount).toBe(original);
    });

    it("rejects ransom when gold is insufficient", () => {
      const state = stateWithAgent({ status: "captured", compromised: true, skill: 50 });
      const poorState = {
        ...state,
        resources: {
          ...state.resources,
          gold: { ...state.resources.gold, amount: 5 }
        }
      };
      const { state: next } = reduceCommand(poorState, {
        type: "RansomAgentCommand",
        agentId: "agent-1"
      });

      const agent = next.espionage!.agents.find((a) => a.id === "agent-1")!;
      expect(agent.status).toBe("captured");
    });
  });

  describe("trait bonuses in simulation", () => {
    it("silver_tongue agent has higher success on recruit_informant", () => {
      // Deploy two agents on recruit_informant - one with silver_tongue, one without
      const baseState = stateWithGold(200);
      const agentWithTrait: EspionageAgent = {
        id: "agent-trait",
        name: "Kyra",
        cover: "merchant",
        targetFactionId: "athens",
        skill: 50,
        loyalty: 60,
        compromised: false,
        recruitedDay: 1,
        morale: 60,
        experience: 0,
        status: "available",
        trait: "silver_tongue",
        missionCooldownDays: 5
      };
      const agentWithout: EspionageAgent = {
        ...agentWithTrait,
        id: "agent-no-trait",
        name: "Nikos",
        trait: undefined
      };

      const stateReady: GameState = {
        ...baseState,
        espionage: {
          ...createInitialEspionageState(),
          agents: [agentWithTrait, agentWithout]
        }
      };

      // Deploy both
      const { state: after1 } = reduceCommand(stateReady, {
        type: "DeployAgentCommand",
        agentId: "agent-trait",
        operationKind: "recruit_informant",
        targetId: "rival-1"
      });
      const { state: after2 } = reduceCommand(after1, {
        type: "DeployAgentCommand",
        agentId: "agent-no-trait",
        operationKind: "recruit_informant",
        targetId: "rival-1"
      });

      const opTrait = after2.espionage!.operations.find((o) => o.agentId === "agent-trait")!;
      const opNoTrait = after2.espionage!.operations.find((o) => o.agentId === "agent-no-trait")!;

      // silver_tongue adds 0.15 to success chance for recruit_informant
      expect(opTrait.successChance!).toBeGreaterThan(opNoTrait.successChance!);
      expect(opTrait.successChance! - opNoTrait.successChance!).toBeCloseTo(0.15, 1);
    });
  });

  describe("morale and experience updates on resolution", () => {
    it("updates morale and experience when operation resolves", () => {
      const agent: EspionageAgent = {
        id: "agent-1",
        name: "Melas",
        cover: "merchant",
        targetFactionId: "athens",
        skill: 50,
        loyalty: 60,
        compromised: false,
        recruitedDay: 1,
        morale: 60,
        experience: 10,
        status: "deployed",
        missionCooldownDays: 5
      };
      const state: GameState = {
        ...stateWithGold(200),
        clock: { ...stateWithGold(200).clock, day: 20 },
        espionage: {
          agents: [agent],
          operations: [
            {
              id: "op-resolve",
              kind: "protect_oracle",
              agentId: "agent-1",
              targetId: "oracle",
              startDay: 5,
              duration: 6,
              status: "active"
            }
          ],
          counterIntelEvents: [],
          networkStrength: 30
        }
      };

      const result = advanceEspionage(state);
      const updatedAgent = result.espionage!.agents.find((a) => a.id === "agent-1")!;
      const resolvedOp = result.espionage!.operations.find((o) => o.id === "op-resolve")!;

      // Operation should be resolved (not active anymore)
      expect(resolvedOp.status).not.toBe("active");

      // Agent should have updated morale and experience
      if (resolvedOp.status === "success") {
        expect(updatedAgent.morale).toBe(65); // 60 + 5
        expect(updatedAgent.experience).toBe(18); // 10 + 8
      } else if (resolvedOp.status === "failed") {
        expect(updatedAgent.morale).toBe(50); // 60 - 10
        expect(updatedAgent.experience).toBe(13); // 10 + 3
      }
      // detected status may also reduce morale further via capture logic
    });
  });

  describe("network strength evolution", () => {
    it("network strength increases with uncompromised agents", () => {
      const state: GameState = {
        ...stateWithGold(200),
        espionage: {
          agents: [
            { id: "a1", name: "A", cover: "merchant", targetFactionId: "athens", skill: 50, loyalty: 50, compromised: false, recruitedDay: 1 },
            { id: "a2", name: "B", cover: "pilgrim", targetFactionId: "athens", skill: 40, loyalty: 50, compromised: false, recruitedDay: 1 },
            { id: "a3", name: "C", cover: "priest", targetFactionId: "athens", skill: 30, loyalty: 50, compromised: true, recruitedDay: 1 }
          ],
          operations: [],
          counterIntelEvents: [],
          networkStrength: 10
        }
      };

      const result = advanceEspionage(state);
      // 2 uncompromised agents: base 10 + 2*8 = 26
      expect(result.espionage!.networkStrength).toBeGreaterThanOrEqual(20);
    });
  });

  describe("backward compatibility", () => {
    it("old agents without enhanced fields work in DeployAgentCommand", () => {
      const oldAgent: EspionageAgent = {
        id: "old-agent",
        name: "Phila",
        cover: "scholar",
        targetFactionId: "athens",
        skill: 45,
        loyalty: 55,
        compromised: false,
        recruitedDay: 1
        // No morale, experience, status, trait, etc.
      };
      const state: GameState = {
        ...stateWithGold(200),
        espionage: {
          ...createInitialEspionageState(),
          agents: [oldAgent]
        }
      };

      const { state: next } = reduceCommand(state, {
        type: "DeployAgentCommand",
        agentId: "old-agent",
        operationKind: "intercept_prophecy",
        targetId: "rival-1"
      });

      const agent = next.espionage!.agents.find((a) => a.id === "old-agent")!;
      expect(agent.status).toBe("deployed");
      const op = next.espionage!.operations.find((o) => o.agentId === "old-agent");
      expect(op).toBeDefined();
      expect(op!.status).toBe("active");
    });

    it("old agents without enhanced fields work in advanceEspionage", () => {
      const oldAgent: EspionageAgent = {
        id: "old-agent",
        name: "Phila",
        cover: "scholar",
        targetFactionId: "athens",
        skill: 45,
        loyalty: 55,
        compromised: false,
        recruitedDay: 1
      };
      const state: GameState = {
        ...stateWithGold(200),
        clock: { ...stateWithGold(200).clock, day: 20 },
        espionage: {
          agents: [oldAgent],
          operations: [
            {
              id: "op-old",
              kind: "sabotage_rival",
              agentId: "old-agent",
              targetId: "rival-1",
              startDay: 5,
              duration: 8,
              status: "active"
            }
          ],
          counterIntelEvents: [],
          networkStrength: 20
        }
      };

      // Should not throw
      const result = advanceEspionage(state);
      expect(result.espionage).toBeDefined();
      const resolvedOp = result.espionage!.operations.find((o) => o.id === "op-old")!;
      expect(resolvedOp.status).not.toBe("active");
    });
  });

  describe("LaunchEspionageOperationCommand still works", () => {
    it("creates operation via legacy command", () => {
      const state = stateWithAgent();
      const { state: next } = reduceCommand(state, {
        type: "LaunchEspionageOperationCommand",
        agentId: "agent-1",
        operationKind: "intercept_prophecy",
        targetId: "rival-1"
      });

      const op = next.espionage!.operations.find((o) => o.agentId === "agent-1");
      expect(op).toBeDefined();
      expect(op!.status).toBe("active");
      expect(op!.kind).toBe("intercept_prophecy");
    });
  });
});
