import { describe, expect, it } from "vitest";

import { reduceCommand } from "../src/reducers";
import { createInitialState } from "../src/state/initialState";
import { advanceDiplomacy } from "../src/simulation/diplomacy";
import { advanceRivalStrategies } from "../src/simulation/rivalStrategies";
import type { GameState, FactionDemand, Treaty } from "../src/state/gameState";

function stateWithFavour(state: GameState, factionId: string, favour: number): GameState {
  const faction = state.factions[factionId as keyof typeof state.factions];
  if (!faction) return state;
  return {
    ...state,
    factions: {
      ...state.factions,
      [factionId]: { ...faction, favour }
    }
  };
}

describe("diplomacy", () => {
  it("creates a treaty via ProposeTreatyCommand when faction favour > 30", () => {
    let state = createInitialState({ seed: "diplomacy-001", originId: "merchant-oracle" });
    state = stateWithFavour(state, "athens", 50);
    state = {
      ...state,
      resources: {
        ...state.resources,
        gold: { ...state.resources.gold, amount: 100 }
      }
    };

    const result = reduceCommand(state, {
      type: "ProposeTreatyCommand",
      factionId: "athens",
      offerType: "trade_access",
      goldPerMonth: 5
    });

    expect(result.state.treaties).toBeDefined();
    expect(result.state.treaties!.length).toBe(1);
    expect(result.state.treaties![0]!.factionId).toBe("athens");
    expect(result.state.treaties![0]!.kind).toBe("trade_access");
    expect(result.state.treaties![0]!.active).toBe(true);
    expect(result.state.treaties![0]!.goldPerMonth).toBe(5);
    // Initial gold deducted
    expect(result.state.resources.gold.amount).toBe(95);
  });

  it("rejects treaty proposal when faction favour <= 30", () => {
    let state = createInitialState({ seed: "diplomacy-002", originId: "merchant-oracle" });
    state = stateWithFavour(state, "sparta", 20);

    const result = reduceCommand(state, {
      type: "ProposeTreatyCommand",
      factionId: "sparta",
      offerType: "mutual_defense"
    });

    // No treaty created — state unchanged or event feed has rejection message
    const treaties = result.state.treaties ?? [];
    expect(treaties.length).toBe(0);
    expect(result.state.eventFeed.some((item) => item.text.includes("refuses"))).toBe(true);
  });

  it("deducts monthly gold for active treaties in advanceDiplomacy", () => {
    let state = createInitialState({ seed: "diplomacy-003", originId: "merchant-oracle" });
    state = {
      ...state,
      resources: {
        ...state.resources,
        gold: { ...state.resources.gold, amount: 50 }
      },
      treaties: [
        {
          id: "treaty-test-1",
          factionId: "athens",
          kind: "trade_access",
          goldPerMonth: 10,
          startDay: 1,
          active: true,
          obligationsMet: true
        }
      ]
    };

    const result = advanceDiplomacy(state);

    expect(result.resources.gold.amount).toBe(40);
    expect(result.treaties![0]!.active).toBe(true);
  });

  it("breaks treaty when player cannot afford monthly gold", () => {
    let state = createInitialState({ seed: "diplomacy-004", originId: "merchant-oracle" });
    state = {
      ...state,
      resources: {
        ...state.resources,
        gold: { ...state.resources.gold, amount: 3 }
      },
      treaties: [
        {
          id: "treaty-test-2",
          factionId: "corinth",
          kind: "mutual_defense",
          goldPerMonth: 8,
          startDay: 1,
          active: true,
          obligationsMet: true
        }
      ]
    };

    const result = advanceDiplomacy(state);

    expect(result.treaties![0]!.active).toBe(false);
    expect(result.treaties![0]!.obligationsMet).toBe(false);
    // Credibility and favour damaged
    expect(result.factions.corinth.credibility).toBeLessThan(state.factions.corinth.credibility);
    expect(result.factions.corinth.favour).toBeLessThan(state.factions.corinth.favour);
  });

  it("generates demands from high-credibility factions", () => {
    // This test verifies the demand generation logic deterministically
    let state = createInitialState({ seed: "diplomacy-demands", originId: "merchant-oracle" });
    // Set all factions to high credibility and favour to maximize demand generation chance
    const factionIds = Object.keys(state.factions) as (keyof typeof state.factions)[];
    let factions = { ...state.factions };
    for (const fid of factionIds) {
      factions = {
        ...factions,
        [fid]: { ...factions[fid], credibility: 90, favour: 80 }
      };
    }
    state = { ...state, factions };

    // Run diplomacy multiple times with different day values to find one that generates a demand
    let foundDemand = false;
    for (let day = 1; day <= 100; day++) {
      const testState = {
        ...state,
        clock: { ...state.clock, day }
      };
      const result = advanceDiplomacy(testState);
      if ((result.demands ?? []).some((d) => !d.resolved)) {
        foundDemand = true;
        break;
      }
    }
    expect(foundDemand).toBe(true);
  });

  it("handles demand response: accept gives credibility and favour", () => {
    let state = createInitialState({ seed: "diplomacy-accept", originId: "merchant-oracle" });
    state = {
      ...state,
      resources: {
        ...state.resources,
        gold: { ...state.resources.gold, amount: 100 }
      },
      demands: [
        {
          id: "demand-test-1",
          factionId: "athens",
          demandType: "tribute",
          description: "Athens demands tribute",
          goldAmount: 15,
          dayIssued: 1,
          expiresDay: 60,
          resolved: false
        }
      ]
    };
    const origCredibility = state.factions.athens.credibility;

    const result = reduceCommand(state, {
      type: "RespondToDemandsCommand",
      demandId: "demand-test-1",
      response: "accept"
    });

    expect(result.state.demands![0]!.resolved).toBe(true);
    expect(result.state.resources.gold.amount).toBe(85); // 100 - 15
    expect(result.state.factions.athens.credibility).toBe(Math.min(100, origCredibility + 2));
  });

  it("handles demand response: negotiate reduces cost by 50%", () => {
    let state = createInitialState({ seed: "diplomacy-negotiate", originId: "merchant-oracle" });
    state = {
      ...state,
      resources: {
        ...state.resources,
        gold: { ...state.resources.gold, amount: 100 }
      },
      demands: [
        {
          id: "demand-test-2",
          factionId: "thebes",
          demandType: "tribute",
          description: "Thebes demands tribute",
          goldAmount: 20,
          dayIssued: 1,
          expiresDay: 60,
          resolved: false
        }
      ]
    };

    const result = reduceCommand(state, {
      type: "RespondToDemandsCommand",
      demandId: "demand-test-2",
      response: "negotiate"
    });

    expect(result.state.demands![0]!.resolved).toBe(true);
    expect(result.state.resources.gold.amount).toBe(90); // 100 - ceil(20/2)
  });

  it("handles demand response: refuse costs credibility and favour", () => {
    let state = createInitialState({ seed: "diplomacy-refuse", originId: "merchant-oracle" });
    state = {
      ...state,
      demands: [
        {
          id: "demand-test-3",
          factionId: "sparta",
          demandType: "favorable_reading",
          description: "Sparta demands a favorable reading",
          dayIssued: 1,
          expiresDay: 60,
          resolved: false
        }
      ]
    };
    const origCredibility = state.factions.sparta.credibility;
    const origFavour = state.factions.sparta.favour;

    const result = reduceCommand(state, {
      type: "RespondToDemandsCommand",
      demandId: "demand-test-3",
      response: "refuse"
    });

    expect(result.state.demands![0]!.resolved).toBe(true);
    expect(result.state.factions.sparta.credibility).toBe(Math.max(0, origCredibility - 2));
    expect(result.state.factions.sparta.favour).toBe(Math.max(0, origFavour - 5));
  });

  it("rival strategy assigns strategy and affects state", () => {
    let state = createInitialState({ seed: "rival-strat-001", originId: "merchant-oracle" });
    // Ensure rivals exist
    expect(state.rivalOracles?.roster.length).toBeGreaterThanOrEqual(1);

    const result = advanceRivalStrategies(state);

    // All active rivals should have a strategy assigned
    const activeRivals = result.rivalOracles!.roster.filter((r) => r.active);
    for (const rival of activeRivals) {
      expect(["aggressive", "subversive", "diplomatic"]).toContain(rival.strategy);
    }
  });

  it("high intel reveals rival operation narrative", () => {
    let state = createInitialState({ seed: "rival-intel-001", originId: "merchant-oracle" });
    // Set first rival's intel to >= 60 to trigger narrative reveal
    const roster = state.rivalOracles!.roster.map((rival, idx) =>
      idx === 0 ? { ...rival, intel: 75, active: true } : rival
    );
    state = {
      ...state,
      rivalOracles: { ...state.rivalOracles!, roster }
    };

    const result = advanceRivalStrategies(state);

    const firstRival = result.rivalOracles!.roster.find((r) => r.id === state.rivalOracles!.roster[0]!.id);
    expect(firstRival?.currentOperationNarrative).toBeTruthy();
    expect(firstRival?.weaknessKnown).toBe(true); // intel >= 70
  });

  it("counter-strike reduces rival pressure when conditions met", () => {
    let state = createInitialState({ seed: "counter-strike", originId: "merchant-oracle" });
    const roster = state.rivalOracles!.roster.map((rival, idx) =>
      idx === 0 ? { ...rival, pressure: 85, weaknessKnown: true, active: true } : rival
    );
    state = {
      ...state,
      rivalOracles: { ...state.rivalOracles!, roster }
    };

    const rivalId = state.rivalOracles!.roster[0]!.id;
    const result = reduceCommand(state, {
      type: "CounterStrikeRivalCommand",
      rivalId
    });

    const rival = result.state.rivalOracles!.roster.find((r) => r.id === rivalId);
    expect(rival!.pressure).toBe(55); // 85 - 30
    expect(result.state.eventFeed.some((item) => item.text.includes("Counter-strike"))).toBe(true);
  });

  it("defeated rival (pressure 0) triggers credibility surge", () => {
    let state = createInitialState({ seed: "rival-defeat", originId: "merchant-oracle" });
    const roster = state.rivalOracles!.roster.map((rival, idx) =>
      idx === 0 ? { ...rival, pressure: 0, active: true } : rival
    );
    state = {
      ...state,
      rivalOracles: { ...state.rivalOracles!, roster }
    };

    const origPrestige = state.pythia.prestige;
    const result = advanceRivalStrategies(state);

    // The rival with pressure 0 should be deactivated
    const defeatedRival = result.rivalOracles!.roster.find((r) => r.id === state.rivalOracles!.roster[0]!.id);
    expect(defeatedRival?.active).toBe(false);
    // Prestige surge
    expect(result.pythia.prestige).toBeGreaterThan(origPrestige);
  });
});
