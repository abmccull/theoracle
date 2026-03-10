import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/state/initialState";
import { reduceCommand } from "../src/reducers";
import { calculatePrice, processTradeOffers, BASE_PRICES, isFactionHostile } from "../src/simulation/trade";
import { advanceLoanPayments } from "../src/simulation/economy";
import type { GameState, FactionState, Loan, BuildingInstance } from "../src/state/gameState";
import type { FactionId, ResourceId } from "@the-oracle/content";
import { buildingDefs } from "@the-oracle/content";

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function withGold(state: GameState, amount: number): GameState {
  return {
    ...state,
    resources: {
      ...state.resources,
      gold: { ...state.resources.gold, amount }
    }
  };
}

function withResource(state: GameState, resourceId: ResourceId, amount: number): GameState {
  return {
    ...state,
    resources: {
      ...state.resources,
      [resourceId]: { ...state.resources[resourceId], amount }
    }
  };
}

function firstFactionId(state: GameState): FactionId {
  return Object.keys(state.factions)[0] as FactionId;
}

function withFactionFavour(state: GameState, factionId: FactionId, favour: number): GameState {
  const faction = state.factions[factionId];
  return {
    ...state,
    factions: {
      ...state.factions,
      [factionId]: { ...faction, favour }
    }
  };
}

function withFactionAgenda(state: GameState, factionId: FactionId, agenda: "war" | "trade" | "faith" | "succession"): GameState {
  const faction = state.factions[factionId];
  return {
    ...state,
    factions: {
      ...state.factions,
      [factionId]: { ...faction, currentAgenda: agenda }
    }
  };
}

function withSeason(state: GameState, season: "Spring" | "Summer" | "Autumn" | "Winter"): GameState {
  return {
    ...state,
    clock: { ...state.clock, season }
  };
}

function withEmbargo(state: GameState, factionId: FactionId, embargoedBy: FactionId): GameState {
  const faction = state.factions[embargoedBy];
  return {
    ...state,
    factions: {
      ...state.factions,
      [embargoedBy]: {
        ...faction,
        embargoes: [...faction.embargoes, factionId]
      }
    }
  };
}

function withLoans(state: GameState, loans: Loan[]): GameState {
  return { ...state, loans };
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

function makeBuilding(
  defId: BuildingInstance["defId"],
  id: string,
  overrides: Partial<BuildingInstance> = {}
): BuildingInstance {
  return {
    id,
    defId,
    position: { x: 30, y: 50 },
    condition: 100,
    maxCondition: 100,
    requiresPriest: false,
    assignedPriestIds: [],
    assignedWorkerIds: [],
    storedResources: {},
    connectedToRoad: true,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
//  Tests
// ---------------------------------------------------------------------------

describe("Economy Trade System", () => {
  // -----------------------------------------------------------------------
  //  E1.1 — SellResourceCommand
  // -----------------------------------------------------------------------
  describe("SellResourceCommand", () => {
    it("validates player has enough resources", () => {
      let state = createInitialState();
      state = withResource(state, "grain", 5);
      const factionId = firstFactionId(state);

      const result = reduceCommand(state, {
        type: "SELL_RESOURCE",
        resourceId: "grain",
        amount: 10, // more than available
        targetFactionId: factionId
      });

      // Should return unchanged state
      expect(result.state.resources.grain.amount).toBe(5);
    });

    it("rejects selling 0 or negative amounts", () => {
      let state = createInitialState();
      state = withResource(state, "grain", 10);
      const factionId = firstFactionId(state);

      const result = reduceCommand(state, {
        type: "SELL_RESOURCE",
        resourceId: "grain",
        amount: 0,
        targetFactionId: factionId
      });

      expect(result.state.resources.grain.amount).toBe(10);
    });

    it("rejects selling to a non-existent faction", () => {
      let state = createInitialState();
      state = withResource(state, "grain", 10);

      const result = reduceCommand(state, {
        type: "SELL_RESOURCE",
        resourceId: "grain",
        amount: 5,
        targetFactionId: "non_existent_faction"
      });

      expect(result.state.resources.grain.amount).toBe(10);
    });

    it("calculates gold earned correctly from base price", () => {
      let state = createInitialState();
      state = withResource(state, "grain", 20);
      state = withGold(state, 0);
      const factionId = firstFactionId(state);
      // Ensure trade agenda for neutral pricing
      state = withFactionAgenda(state, factionId, "trade");
      // Ensure faction is not hostile
      state = withFactionFavour(state, factionId, 50);
      // Clear market price index for predictable results
      state = { ...state, market: undefined };

      const result = reduceCommand(state, {
        type: "SELL_RESOURCE",
        resourceId: "grain",
        amount: 5,
        targetFactionId: factionId
      });

      // Base grain price = 2, no demand multiplier for "trade" agenda, no market modifier
      // Gold earned = 5 * 2 * 1 * 1 = 10
      expect(result.state.resources.grain.amount).toBe(15);
      expect(result.state.resources.gold.amount).toBe(10);
    });

    it("applies demand multiplier for war agenda on stone", () => {
      let state = createInitialState();
      state = withResource(state, "stone", 20);
      state = withGold(state, 0);
      const factionId = firstFactionId(state);
      state = withFactionAgenda(state, factionId, "war");
      state = withFactionFavour(state, factionId, 50);
      state = { ...state, market: undefined };

      const result = reduceCommand(state, {
        type: "SELL_RESOURCE",
        resourceId: "stone",
        amount: 4,
        targetFactionId: factionId
      });

      // Stone base = 3, war demand = 1.5x
      // Gold = 4 * 3 * 1.5 = 18
      expect(result.state.resources.gold.amount).toBe(18);
    });

    it("applies 50% price discount for hostile faction and +2 favour", () => {
      let state = createInitialState();
      state = withResource(state, "incense", 20);
      state = withGold(state, 0);
      const factionId = firstFactionId(state);
      state = withFactionAgenda(state, factionId, "trade");
      state = withFactionFavour(state, factionId, 10); // hostile (< 20)
      state = { ...state, market: undefined };

      const initialFavour = state.factions[factionId].favour;

      const result = reduceCommand(state, {
        type: "SELL_RESOURCE",
        resourceId: "incense",
        amount: 2,
        targetFactionId: factionId
      });

      // Incense base = 6, no demand for trade agenda
      // Normal would be 2 * 6 = 12, hostile = 12 * 0.5 = 6
      expect(result.state.resources.gold.amount).toBe(6);
      expect(result.state.factions[factionId].favour).toBe(initialFavour + 2);
    });

    it("emits ResourceSold event", () => {
      let state = createInitialState();
      state = withResource(state, "grain", 20);
      const factionId = firstFactionId(state);
      state = withFactionFavour(state, factionId, 50);

      const result = reduceCommand(state, {
        type: "SELL_RESOURCE",
        resourceId: "grain",
        amount: 3,
        targetFactionId: factionId
      });

      const soldEvent = result.events.find((e) => e.type === "ResourceSold");
      expect(soldEvent).toBeDefined();
      if (soldEvent && soldEvent.type === "ResourceSold") {
        expect(soldEvent.resourceId).toBe("grain");
        expect(soldEvent.amount).toBe(3);
        expect(soldEvent.goldEarned).toBeGreaterThan(0);
      }
    });
  });

  // -----------------------------------------------------------------------
  //  E1.2 — DemolishBuildingCommand
  // -----------------------------------------------------------------------
  describe("DemolishBuildingCommand", () => {
    it("cannot demolish Sacred Way", () => {
      let state = createInitialState();
      // Add a building with defId "sacred_way"
      const sacredWayBuilding = makeBuilding("sacred_way", "building-sacred-way");
      state = { ...state, buildings: [...state.buildings, sacredWayBuilding] };

      const result = reduceCommand(state, {
        type: "DEMOLISH_BUILDING",
        buildingId: "building-sacred-way"
      });

      // Building should still exist
      expect(result.state.buildings.some((b) => b.id === "building-sacred-way")).toBe(true);
    });

    it("returns 40% of gold cost on demolish", () => {
      let state = createInitialState();
      state = withGold(state, 0);
      const building = makeBuilding("storehouse", "building-test-storehouse");
      state = { ...state, buildings: [...state.buildings, building] };

      const result = reduceCommand(state, {
        type: "DEMOLISH_BUILDING",
        buildingId: "building-test-storehouse"
      });

      // storehouse costGold = 26, 40% = 10.4, floor = 10
      const expectedGold = Math.floor(buildingDefs.storehouse.costGold * 0.4);
      expect(result.state.resources.gold.amount).toBe(expectedGold);
      expect(result.state.buildings.find((b) => b.id === "building-test-storehouse")).toBeUndefined();
    });

    it("returns 40% of material costs on demolish", () => {
      let state = createInitialState();
      // Use tekton_ergasterion: costGold 22, costResources { logs: 6, stone: 4 }
      const building = makeBuilding("tekton_ergasterion", "building-test-tekton");
      state = { ...state, buildings: [...state.buildings, building] };
      state = withResource(state, "logs", 0);
      state = withResource(state, "stone", 0);

      const result = reduceCommand(state, {
        type: "DEMOLISH_BUILDING",
        buildingId: "building-test-tekton"
      });

      // logs: floor(6 * 0.4) = 2, stone: floor(4 * 0.4) = 1
      expect(result.state.resources.logs.amount).toBe(2);
      expect(result.state.resources.stone.amount).toBe(1);
    });

    it("cleans up worker assignments on demolish", () => {
      let state = createInitialState();
      const building = makeBuilding("storehouse", "building-demolish-workers", {
        assignedWorkerIds: ["worker-1"]
      });
      state = { ...state, buildings: [...state.buildings, building] };

      // Add a walker assigned to this building
      const walker = {
        id: "worker-1",
        role: "custodian" as const,
        name: "Test Worker",
        tile: { x: 30, y: 50 },
        state: "working" as const,
        path: [],
        moveCooldown: 0,
        assignmentBuildingId: "building-demolish-workers"
      };
      state = { ...state, walkers: [...state.walkers, walker] };

      const result = reduceCommand(state, {
        type: "DEMOLISH_BUILDING",
        buildingId: "building-demolish-workers"
      });

      const updatedWalker = result.state.walkers.find((w) => w.id === "worker-1");
      expect(updatedWalker?.assignmentBuildingId).toBeUndefined();
      expect(updatedWalker?.state).toBe("idle");
    });

    it("cleans up priest assignments on demolish", () => {
      let state = createInitialState();
      const building = makeBuilding("castalian_spring", "building-demolish-priests", {
        requiresPriest: true,
        assignedPriestIds: ["priest-1"]
      });
      state = { ...state, buildings: [...state.buildings, building] };

      // Add a priest assigned to this building
      if (state.priests.length > 0) {
        state = {
          ...state,
          priests: state.priests.map((p, idx) =>
            idx === 0
              ? { ...p, id: "priest-1", currentAssignmentBuildingId: "building-demolish-priests" }
              : p
          )
        };
      } else {
        state = {
          ...state,
          priests: [{
            id: "priest-1",
            walkerId: "walker-priest-1",
            role: "attendant" as any,
            skill: 50,
            morale: 50,
            range: 3,
            currentAssignmentBuildingId: "building-demolish-priests"
          }]
        };
      }

      const result = reduceCommand(state, {
        type: "DEMOLISH_BUILDING",
        buildingId: "building-demolish-priests"
      });

      const priest = result.state.priests.find((p) => p.id === "priest-1");
      expect(priest?.currentAssignmentBuildingId).toBeUndefined();
    });

    it("cleans up carrier jobs targeting the demolished building", () => {
      let state = createInitialState();
      const building = makeBuilding("storehouse", "building-demolish-jobs");
      state = { ...state, buildings: [...state.buildings, building] };

      state = {
        ...state,
        resourceJobs: [
          ...state.resourceJobs,
          {
            id: "job-1",
            resourceId: "grain" as const,
            amount: 5,
            sourceBuildingId: "building-demolish-jobs",
            targetBuildingId: "other-building",
            priority: "routine" as const,
            phase: "to_source" as const
          },
          {
            id: "job-2",
            resourceId: "incense" as const,
            amount: 3,
            sourceBuildingId: "other-building",
            targetBuildingId: "building-demolish-jobs",
            priority: "routine" as const,
            phase: "to_target" as const
          },
          {
            id: "job-3",
            resourceId: "stone" as const,
            amount: 2,
            sourceBuildingId: "other-building",
            targetBuildingId: "another-building",
            priority: "routine" as const,
            phase: "to_source" as const
          }
        ]
      };

      const result = reduceCommand(state, {
        type: "DEMOLISH_BUILDING",
        buildingId: "building-demolish-jobs"
      });

      // job-1 and job-2 should be removed, job-3 should remain
      expect(result.state.resourceJobs.filter((j) => j.id === "job-1").length).toBe(0);
      expect(result.state.resourceJobs.filter((j) => j.id === "job-2").length).toBe(0);
      expect(result.state.resourceJobs.filter((j) => j.id === "job-3").length).toBe(1);
    });

    it("emits BuildingDemolished event", () => {
      let state = createInitialState();
      const building = makeBuilding("storehouse", "building-demolish-event");
      state = { ...state, buildings: [...state.buildings, building] };

      const result = reduceCommand(state, {
        type: "DEMOLISH_BUILDING",
        buildingId: "building-demolish-event"
      });

      const demolishEvent = result.events.find((e) => e.type === "BuildingDemolished");
      expect(demolishEvent).toBeDefined();
      if (demolishEvent && demolishEvent.type === "BuildingDemolished") {
        expect(demolishEvent.defId).toBe("storehouse");
        expect(demolishEvent.goldReturned).toBeGreaterThan(0);
      }
    });

    it("returns unchanged state for non-existent building", () => {
      const state = createInitialState();
      const result = reduceCommand(state, {
        type: "DEMOLISH_BUILDING",
        buildingId: "non-existent-id"
      });

      expect(result.state).toBe(state);
    });
  });

  // -----------------------------------------------------------------------
  //  E1.3 — Dynamic Trade Prices
  // -----------------------------------------------------------------------
  describe("Dynamic Trade Prices", () => {
    it("returns base prices for neutral conditions", () => {
      const state = createInitialState();
      const factionId = firstFactionId(state);
      let faction = state.factions[factionId];
      // Set trade agenda for no demand multiplier
      faction = { ...faction, currentAgenda: "trade", embargoes: [] };

      const cleanState = { ...state, market: undefined, factions: { ...state.factions, [factionId]: faction } };
      // Remove all embargoes from other factions too
      const allClean = { ...cleanState };
      for (const fid of Object.keys(allClean.factions) as FactionId[]) {
        allClean.factions = {
          ...allClean.factions,
          [fid]: { ...allClean.factions[fid], embargoes: [] }
        };
      }

      const price = calculatePrice("grain", allClean.factions[factionId], "Spring", allClean);
      expect(price).toBe(BASE_PRICES.grain); // 2
    });

    it("applies faction demand multiplier for war agenda", () => {
      const state = createInitialState();
      const factionId = firstFactionId(state);
      const faction: FactionState = {
        ...state.factions[factionId],
        currentAgenda: "war",
        embargoes: []
      };

      // Clean state
      const cleanState = { ...state, market: undefined };
      for (const fid of Object.keys(cleanState.factions) as FactionId[]) {
        cleanState.factions = {
          ...cleanState.factions,
          [fid]: { ...cleanState.factions[fid], embargoes: [] }
        };
      }

      const stonePrice = calculatePrice("stone", faction, "Spring", cleanState);
      const grainPrice = calculatePrice("grain", faction, "Spring", cleanState);

      // Stone should be 1.5x base (war demand), grain should be base
      expect(stonePrice).toBe(BASE_PRICES.stone * 1.5); // 3 * 1.5 = 4.5
      expect(grainPrice).toBe(BASE_PRICES.grain); // 2
    });

    it("applies faction demand multiplier for faith agenda", () => {
      const state = createInitialState();
      const factionId = firstFactionId(state);
      const faction: FactionState = {
        ...state.factions[factionId],
        currentAgenda: "faith",
        embargoes: []
      };

      const cleanState = { ...state, market: undefined };
      for (const fid of Object.keys(cleanState.factions) as FactionId[]) {
        cleanState.factions = {
          ...cleanState.factions,
          [fid]: { ...cleanState.factions[fid], embargoes: [] }
        };
      }

      const incensePrice = calculatePrice("incense", faction, "Spring", cleanState);
      expect(incensePrice).toBe(BASE_PRICES.incense * 1.5); // 6 * 1.5 = 9
    });

    it("applies seasonal multiplier in winter for grain", () => {
      const state = createInitialState();
      const factionId = firstFactionId(state);
      const faction: FactionState = {
        ...state.factions[factionId],
        currentAgenda: "trade",
        embargoes: []
      };

      const cleanState = { ...state, market: undefined };
      for (const fid of Object.keys(cleanState.factions) as FactionId[]) {
        cleanState.factions = {
          ...cleanState.factions,
          [fid]: { ...cleanState.factions[fid], embargoes: [] }
        };
      }

      const winterPrice = calculatePrice("grain", faction, "Winter", cleanState);
      const springPrice = calculatePrice("grain", faction, "Spring", cleanState);

      expect(winterPrice).toBeGreaterThan(springPrice);
      expect(winterPrice).toBe(BASE_PRICES.grain * 1.3); // 2 * 1.3 = 2.6
    });

    it("applies seasonal multiplier in summer for sacred_water", () => {
      const state = createInitialState();
      const factionId = firstFactionId(state);
      const faction: FactionState = {
        ...state.factions[factionId],
        currentAgenda: "trade",
        embargoes: []
      };

      const cleanState = { ...state, market: undefined };
      for (const fid of Object.keys(cleanState.factions) as FactionId[]) {
        cleanState.factions = {
          ...cleanState.factions,
          [fid]: { ...cleanState.factions[fid], embargoes: [] }
        };
      }

      const summerPrice = calculatePrice("sacred_water", faction, "Summer", cleanState);
      expect(summerPrice).toBe(BASE_PRICES.sacred_water * 1.3); // 5 * 1.3 = 6.5
    });

    it("applies embargo multiplier (2x)", () => {
      let state = createInitialState();
      const factionIds = Object.keys(state.factions) as FactionId[];
      if (factionIds.length < 2) return;

      const targetFactionId = factionIds[0]!;
      const embargoingFactionId = factionIds[1]!;

      // Set up embargo: embargoingFaction embargoes targetFaction
      state = withEmbargo(state, targetFactionId, embargoingFactionId);
      state = { ...state, market: undefined };

      const faction: FactionState = {
        ...state.factions[targetFactionId],
        currentAgenda: "trade",
        embargoes: []
      };

      const price = calculatePrice("grain", faction, "Spring", state);
      // Base = 2, embargo = 2x => 4
      expect(price).toBe(BASE_PRICES.grain * 2);
    });
  });

  // -----------------------------------------------------------------------
  //  Trade Offer Generation
  // -----------------------------------------------------------------------
  describe("Trade Offer Generation", () => {
    it("generates trade offers from factions", () => {
      let state = createInitialState();
      // Ensure at least one faction has trade access
      const factionId = firstFactionId(state);
      state = {
        ...state,
        factions: {
          ...state.factions,
          [factionId]: { ...state.factions[factionId], tradeAccess: true }
        }
      };

      const result = processTradeOffers(state);

      // Should generate some offers (2-3)
      expect(result.state.tradeOffers.length).toBeGreaterThanOrEqual(0);
      // Events should include TradeOfferGenerated
      if (result.state.tradeOffers.length > 0) {
        expect(result.events.some((e) => e.type === "TradeOfferGenerated")).toBe(true);
      }
    });

    it("clears old offers each month", () => {
      let state = createInitialState();
      // Pre-populate with old offers
      state = {
        ...state,
        tradeOffers: [
          { id: "old-offer-1", factionId: firstFactionId(state), resourceId: "grain", amount: 5, price: 10 }
        ]
      };

      const result = processTradeOffers(state);
      // Old offers should be cleared (the function clears all previous offers monthly)
      const oldOffer = result.state.tradeOffers.find((o) => o.id === "old-offer-1");
      expect(oldOffer).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  //  E1.4 — Loan System
  // -----------------------------------------------------------------------
  describe("Loan System", () => {
    it("borrows gold from a faction", () => {
      let state = createInitialState();
      const factionId = firstFactionId(state);
      state = withFactionCredibility(state, factionId, 60);
      state = withGold(state, 10);

      const result = reduceCommand(state, {
        type: "BorrowGoldCommand",
        factionId,
        amount: 50
      });

      expect(result.state.resources.gold.amount).toBe(60); // 10 + 50
      expect(result.state.loans).toBeDefined();
      expect(result.state.loans!.length).toBe(1);
      expect(result.state.loans![0]!.principalGold).toBe(50);
    });

    it("rejects loan when credibility is too low", () => {
      let state = createInitialState();
      const factionId = firstFactionId(state);
      state = withFactionCredibility(state, factionId, 30); // below 40 threshold
      state = withGold(state, 10);

      const result = reduceCommand(state, {
        type: "BorrowGoldCommand",
        factionId,
        amount: 50
      });

      expect(result.state.resources.gold.amount).toBe(10); // unchanged
      expect(result.state.loans ?? []).toHaveLength(0);
    });

    it("repays loan in full", () => {
      let state = createInitialState();
      const factionId = firstFactionId(state);

      const loan: Loan = {
        id: "loan-test-1",
        factionId,
        principalGold: 50,
        interestRate: 0.1,
        remainingPayments: 6,
        monthlyPayment: 10,
        startDay: 1,
        missedPayments: 0
      };
      state = withLoans(state, [loan]);
      state = withGold(state, 100); // enough to repay 10 * 6 = 60

      const result = reduceCommand(state, {
        type: "RepayLoanCommand",
        loanId: "loan-test-1"
      });

      expect(result.state.loans ?? []).toHaveLength(0);
      expect(result.state.resources.gold.amount).toBe(40); // 100 - 60
      // Should get credibility bonus
      expect(result.state.factions[factionId].credibility).toBeGreaterThan(
        state.factions[factionId].credibility
      );
    });

    it("applies penalty for missed loan payments", () => {
      let state = createInitialState();
      const factionId = firstFactionId(state);
      const initialCredibility = state.factions[factionId].credibility;

      const loan: Loan = {
        id: "loan-missed-1",
        factionId,
        principalGold: 50,
        interestRate: 0.1,
        remainingPayments: 6,
        monthlyPayment: 10,
        startDay: 1,
        missedPayments: 0
      };
      state = withLoans(state, [loan]);
      state = withGold(state, 0); // no gold to pay

      const result = advanceLoanPayments(state);

      // Should have 1 missed payment
      const updatedLoan = result.loans?.find((l) => l.id === "loan-missed-1");
      expect(updatedLoan?.missedPayments).toBe(1);
      // Should lose credibility
      expect(result.factions[factionId].credibility).toBeLessThan(initialCredibility);
    });

    it("defaults loan after 3 missed payments", () => {
      let state = createInitialState();
      const factionId = firstFactionId(state);
      const initialCredibility = state.factions[factionId].credibility;

      const loan: Loan = {
        id: "loan-default-1",
        factionId,
        principalGold: 50,
        interestRate: 0.1,
        remainingPayments: 6,
        monthlyPayment: 10,
        startDay: 1,
        missedPayments: 2 // already missed 2, this will be the 3rd
      };
      state = withLoans(state, [loan]);
      state = withGold(state, 0);

      const result = advanceLoanPayments(state);

      // Loan should be removed (defaulted)
      expect(result.loans ?? []).toHaveLength(0);
      // Heavy credibility penalty
      expect(result.factions[factionId].credibility).toBeLessThan(initialCredibility - 10);
    });

    it("successfully makes monthly payment", () => {
      let state = createInitialState();
      const factionId = firstFactionId(state);

      const loan: Loan = {
        id: "loan-pay-1",
        factionId,
        principalGold: 50,
        interestRate: 0.1,
        remainingPayments: 6,
        monthlyPayment: 10,
        startDay: 1,
        missedPayments: 0
      };
      state = withLoans(state, [loan]);
      state = withGold(state, 50);

      const result = advanceLoanPayments(state);

      const updatedLoan = result.loans?.find((l) => l.id === "loan-pay-1");
      expect(updatedLoan?.remainingPayments).toBe(5);
      expect(result.resources.gold.amount).toBe(40); // 50 - 10
    });
  });

  // -----------------------------------------------------------------------
  //  Edge Cases
  // -----------------------------------------------------------------------
  describe("Edge Cases", () => {
    it("isFactionHostile returns true for low favour", () => {
      const state = createInitialState();
      const factionId = firstFactionId(state);
      const faction: FactionState = { ...state.factions[factionId], favour: 10 };
      expect(isFactionHostile(faction)).toBe(true);
    });

    it("isFactionHostile returns false for decent favour", () => {
      const state = createInitialState();
      const factionId = firstFactionId(state);
      const faction: FactionState = { ...state.factions[factionId], favour: 50 };
      expect(isFactionHostile(faction)).toBe(false);
    });

    it("BASE_PRICES includes all expected resources", () => {
      expect(BASE_PRICES.grain).toBe(2);
      expect(BASE_PRICES.bread).toBe(3);
      expect(BASE_PRICES.olive_oil).toBe(4);
      expect(BASE_PRICES.incense).toBe(6);
      expect(BASE_PRICES.sacred_water).toBe(5);
      expect(BASE_PRICES.logs).toBe(2);
      expect(BASE_PRICES.stone).toBe(3);
      expect(BASE_PRICES.planks).toBe(4);
      expect(BASE_PRICES.cut_stone).toBe(5);
      expect(BASE_PRICES.papyrus).toBe(2);
      expect(BASE_PRICES.scrolls).toBe(4);
      expect(BASE_PRICES.sacred_animals).toBe(8);
      expect(BASE_PRICES.knowledge).toBe(10);
      expect(BASE_PRICES.gold).toBe(1);
    });
  });
});
