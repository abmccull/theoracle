import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/state/initialState";
import { reduceCommand } from "../src/reducers";
import {
  createInitialMarketState,
  updateMarketPrices,
  advancePatronContracts,
  advanceLoanPayments
} from "../src/simulation/economy";
import type { GameState, Loan, MarketState, PatronContract } from "../src/state/gameState";
import type { FactionId } from "@the-oracle/content";

function withMarket(state: GameState, market: MarketState): GameState {
  return { ...state, market };
}

function withPatrons(state: GameState, patrons: PatronContract[]): GameState {
  return { ...state, patrons };
}

function withLoans(state: GameState, loans: Loan[]): GameState {
  return { ...state, loans };
}

function withGold(state: GameState, amount: number): GameState {
  return {
    ...state,
    resources: {
      ...state.resources,
      gold: { ...state.resources.gold, amount }
    }
  };
}

function withFactionCredibility(state: GameState, factionId: FactionId, credibility: number): GameState {
  const faction = state.factions[factionId];
  return {
    ...state,
    factions: {
      ...state.factions,
      [factionId]: { ...faction, credibility }
    }
  };
}

function firstFactionId(state: GameState): FactionId {
  return Object.keys(state.factions)[0] as FactionId;
}

describe("Economy System", () => {
  describe("Market Prices", () => {
    it("updates price index based on supply and demand", () => {
      let state = createInitialState();
      const market = createInitialMarketState();
      state = withMarket(state, market);

      // Clear all active conflicts so only supply pressure matters
      const peacefulFactions = { ...state.factions };
      for (const fid of Object.keys(peacefulFactions) as FactionId[]) {
        peacefulFactions[fid] = { ...peacefulFactions[fid], activeConflicts: [], embargoes: [] };
      }
      state = { ...state, factions: peacefulFactions };

      // Fill grain to capacity to create strong supply pressure
      state = {
        ...state,
        resources: {
          ...state.resources,
          grain: { ...state.resources.grain, amount: state.resources.grain.capacity, capacity: state.resources.grain.capacity }
        }
      };

      const updated = updateMarketPrices(state);
      const grainPrice = updated.market!.priceIndex.grain!;
      // High supply should push price below 1.0
      expect(grainPrice).toBeLessThan(1.0);
    });

    it("clamps prices to [0.5, 2.5] range", () => {
      let state = createInitialState();
      // Create extreme market conditions
      const market: MarketState = {
        priceIndex: { grain: 0.3, incense: 3.0 },
        supplyPressure: {},
        demandPressure: {},
        lastUpdateMonth: 0
      };
      state = withMarket(state, market);

      const updated = updateMarketPrices(state);
      const grainPrice = updated.market!.priceIndex.grain!;
      const incensePrice = updated.market!.priceIndex.incense!;
      expect(grainPrice).toBeGreaterThanOrEqual(0.5);
      expect(incensePrice).toBeLessThanOrEqual(2.5);
    });

    it("increases demand pressure during wars", () => {
      let state = createInitialState();
      state = withMarket(state, createInitialMarketState());

      // Give some factions active conflicts
      const factionIds = Object.keys(state.factions) as FactionId[];
      if (factionIds.length >= 2) {
        const f1 = factionIds[0]!;
        const f2 = factionIds[1]!;
        state = {
          ...state,
          factions: {
            ...state.factions,
            [f1]: { ...state.factions[f1], activeConflicts: [f2] },
            [f2]: { ...state.factions[f2], activeConflicts: [f1] }
          }
        };
      }

      const updated = updateMarketPrices(state);
      const grainDemand = updated.market!.demandPressure.grain ?? 0;
      expect(grainDemand).toBeGreaterThan(0);
    });
  });

  describe("Patron Contracts", () => {
    it("pays gold monthly for active patrons", () => {
      let state = createInitialState();
      const factionId = firstFactionId(state);
      const initialGold = state.resources.gold.amount;
      const patron: PatronContract = {
        id: "patron-1",
        factionId,
        goldPerMonth: 10,
        demandedDomain: "military",
        demandedPolarity: "any",
        satisfactionScore: 60,
        startDay: 1,
        durationMonths: 6,
        active: true
      };
      state = withPatrons(state, [patron]);

      const updated = advancePatronContracts(state);
      expect(updated.resources.gold.amount).toBe(initialGold + 10);
    });

    it("decreases satisfaction when no matching prophecy this month", () => {
      let state = createInitialState();
      const factionId = firstFactionId(state);
      const patron: PatronContract = {
        id: "patron-1",
        factionId,
        goldPerMonth: 10,
        demandedDomain: "military",
        demandedPolarity: "any",
        satisfactionScore: 60,
        startDay: 1,
        durationMonths: 6,
        active: true
      };
      state = withPatrons(state, [patron]);

      const updated = advancePatronContracts(state);
      const updatedPatron = updated.patrons!.find((p) => p.id === "patron-1")!;
      expect(updatedPatron.satisfactionScore).toBe(55); // -5 for no matching prophecy
    });

    it("withdraws patron when satisfaction drops below 20", () => {
      let state = createInitialState();
      const factionId = firstFactionId(state);
      const patron: PatronContract = {
        id: "patron-1",
        factionId,
        goldPerMonth: 10,
        demandedDomain: "military",
        demandedPolarity: "any",
        satisfactionScore: 22, // will drop to 17 with -5
        startDay: 1,
        durationMonths: 6,
        active: true
      };
      const initialCredibility = state.factions[factionId].credibility;
      state = withPatrons(state, [patron]);

      const updated = advancePatronContracts(state);
      const updatedPatron = updated.patrons!.find((p) => p.id === "patron-1")!;
      expect(updatedPatron.active).toBe(false);
      expect(updated.factions[factionId].credibility).toBe(initialCredibility - 3);
    });
  });

  describe("Loan System", () => {
    it("creates a loan with BorrowGoldCommand", () => {
      let state = createInitialState();
      const factionId = firstFactionId(state);
      state = withFactionCredibility(state, factionId, 60);

      const result = reduceCommand(state, {
        type: "BorrowGoldCommand",
        factionId,
        amount: 100
      });

      expect(result.state.loans).toHaveLength(1);
      const loan = result.state.loans![0]!;
      expect(loan.principalGold).toBe(100);
      expect(loan.factionId).toBe(factionId);
      expect(loan.remainingPayments).toBe(12);
      expect(loan.interestRate).toBeGreaterThan(0);
      // Gold should increase
      expect(result.state.resources.gold.amount).toBeGreaterThan(state.resources.gold.amount);
    });

    it("rejects BorrowGoldCommand when credibility is below 40", () => {
      let state = createInitialState();
      const factionId = firstFactionId(state);
      state = withFactionCredibility(state, factionId, 30);

      const result = reduceCommand(state, {
        type: "BorrowGoldCommand",
        factionId,
        amount: 100
      });

      // Should be unchanged
      expect(result.state.loans).toBeUndefined();
    });

    it("deducts monthly payment from gold", () => {
      let state = createInitialState();
      const factionId = firstFactionId(state);
      const loan: Loan = {
        id: "loan-1",
        factionId,
        principalGold: 100,
        interestRate: 0.05,
        remainingPayments: 6,
        monthlyPayment: 20,
        startDay: 1,
        missedPayments: 0
      };
      state = withLoans(state, [loan]);
      state = withGold(state, 200);

      const updated = advanceLoanPayments(state);
      expect(updated.resources.gold.amount).toBe(180);
      const updatedLoan = updated.loans!.find((l) => l.id === "loan-1")!;
      expect(updatedLoan.remainingPayments).toBe(5);
    });

    it("defaults loan after 3 missed payments", () => {
      let state = createInitialState();
      const factionId = firstFactionId(state);
      const initialCredibility = state.factions[factionId].credibility;
      const loan: Loan = {
        id: "loan-1",
        factionId,
        principalGold: 100,
        interestRate: 0.05,
        remainingPayments: 3,
        monthlyPayment: 20,
        startDay: 1,
        missedPayments: 2 // next miss will be 3 => default
      };
      state = withLoans(state, [loan]);
      state = withGold(state, 0); // No gold to pay

      const updated = advanceLoanPayments(state);
      // Defaulted loan should be removed
      expect(updated.loans).toBeUndefined();
      // Severe credibility loss
      expect(updated.factions[factionId].credibility).toBe(Math.max(0, initialCredibility - 15));
    });

    it("repays loan early with RepayLoanCommand", () => {
      let state = createInitialState();
      const factionId = firstFactionId(state);
      const loan: Loan = {
        id: "loan-1",
        factionId,
        principalGold: 100,
        interestRate: 0.05,
        remainingPayments: 6,
        monthlyPayment: 20,
        startDay: 1,
        missedPayments: 0
      };
      state = withLoans(state, [loan]);
      state = withGold(state, 500);
      const initialCredibility = state.factions[factionId].credibility;

      const result = reduceCommand(state, {
        type: "RepayLoanCommand",
        loanId: "loan-1"
      });

      // Loan removed
      expect(result.state.loans).toHaveLength(0);
      // Gold deducted (6 * 20 = 120)
      expect(result.state.resources.gold.amount).toBe(500 - 120);
      // Credibility boost
      expect(result.state.factions[factionId].credibility).toBe(Math.min(100, initialCredibility + 2));
    });
  });
});
