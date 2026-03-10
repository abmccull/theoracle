import { describe, expect, it } from "vitest";

import { reduceCommand } from "../src/reducers";
import { createInitialState } from "../src/state/initialState";
import { createBuildingAt, runSimulationTick } from "../src/simulation/updateDay";
import type { GameState, WalkerInstance } from "../src/state/gameState";

function makeCustodian(id: string, name: string, tile = { x: 30, y: 50 }): WalkerInstance {
  return {
    id,
    role: "custodian",
    name,
    tile,
    state: "idle",
    path: [],
    moveCooldown: 0,
    homeBuildingId: undefined,
    assignmentBuildingId: undefined,
    destination: undefined,
    carrying: undefined,
    carryingAmount: undefined,
    assignedJobId: undefined,
    fatigue: 0,
    haulingSkill: 1,
    supplyRadius: 5
  };
}

/**
 * Creates a state with a grain_field injected directly and two custodians.
 * Grain_field starts with grain: 2 (startingResources) and produces grain via recipe.
 */
function setupProductionState(): GameState {
  let state = createInitialState();

  // Inject a grain_field directly (with extra bread to sustain worker food consumption)
  const grainField = {
    ...createBuildingAt("grain_field", { x: 28, y: 49 }, "test-grain-field"),
    storedResources: { grain: 2, bread: 8 }
  };

  state = {
    ...state,
    buildings: [...state.buildings, grainField],
    walkers: [
      makeCustodian("custodian-1", "Worker 1"),
      makeCustodian("custodian-2", "Worker 2")
    ]
  };

  return state;
}

describe("Production gating", () => {
  it("grain_field with no assigned worker produces 0 grain", () => {
    const state = setupProductionState();
    const grainField = state.buildings.find((b) => b.id === "test-grain-field")!;
    const initialGrain = grainField.storedResources.grain ?? 0;

    // Run many ticks without assigning any worker
    const result = runSimulationTick(state, 600);

    const updatedField = result.state.buildings.find((b) => b.id === "test-grain-field")!;
    const finalGrain = updatedField.storedResources.grain ?? 0;

    // Grain should not have increased (no worker assigned)
    expect(finalGrain).toBeLessThanOrEqual(initialGrain);
  });

  it("kitchen with 1 assigned worker produces bread (recipe-based production gating)", () => {
    let state = setupProductionState();

    // Inject a kitchen with grain (recipe input) and bread for worker food
    const kitchen = {
      ...createBuildingAt("kitchen", { x: 30, y: 49 }, "test-kitchen-gated"),
      storedResources: { grain: 20, bread: 8 }
    };
    state = { ...state, buildings: [...state.buildings, kitchen] };

    // Assign a worker to the kitchen
    state = reduceCommand(state, {
      type: "AssignWorkerCommand",
      walkerId: "custodian-1",
      buildingId: "test-kitchen-gated"
    }).state;

    // Run simulation
    const result = runSimulationTick(state, 600);
    const updatedKitchen = result.state.buildings.find((b) => b.id === "test-kitchen-gated")!;
    const finalBread = updatedKitchen.storedResources.bread ?? 0;

    // Bread should have been produced via recipe system (kitchen has no productionCycle)
    expect(finalBread).toBeGreaterThan(0);
  });

  it("kitchen with no assigned worker produces 0 bread", () => {
    let state = setupProductionState();

    // Inject a kitchen with grain
    const kitchen = {
      ...createBuildingAt("kitchen", { x: 30, y: 49 }, "test-kitchen"),
      storedResources: { grain: 10, bread: 0 }
    };
    state = { ...state, buildings: [...state.buildings, kitchen] };

    // Run ticks without assigning worker
    const result = runSimulationTick(state, 600);
    const updatedKitchen = result.state.buildings.find((b) => b.id === "test-kitchen")!;
    const finalBread = updatedKitchen.storedResources.bread ?? 0;

    // No bread should be produced (no worker assigned)
    expect(finalBread).toBeLessThanOrEqual(0.001);
  });

  it("kitchen with assigned worker produces bread from grain", () => {
    let state = setupProductionState();

    // Inject a kitchen with grain
    const kitchen = {
      ...createBuildingAt("kitchen", { x: 30, y: 49 }, "test-kitchen"),
      storedResources: { grain: 10, bread: 0 }
    };
    state = { ...state, buildings: [...state.buildings, kitchen] };

    // Assign a worker to the kitchen
    state = reduceCommand(state, {
      type: "AssignWorkerCommand",
      walkerId: "custodian-1",
      buildingId: "test-kitchen"
    }).state;

    // Run ticks
    const result = runSimulationTick(state, 600);
    const updatedKitchen = result.state.buildings.find((b) => b.id === "test-kitchen")!;
    const finalBread = updatedKitchen.storedResources.bread ?? 0;

    // Bread should have been produced
    expect(finalBread).toBeGreaterThan(0);
  });

  it("assigned custodians are excluded from construction duties", () => {
    let state = setupProductionState();

    // Assign custodian-1 to grain field
    state = reduceCommand(state, {
      type: "AssignWorkerCommand",
      walkerId: "custodian-1",
      buildingId: "test-grain-field"
    }).state;

    // Inject a building under construction
    const storehouse = {
      ...createBuildingAt("storehouse", { x: 30, y: 49 }, "test-storehouse"),
      constructionProgress: 0,
      constructionWork: 100,
      condition: 0,
      storedResources: {}
    };
    state = { ...state, buildings: [...state.buildings, storehouse] };

    // Put the assigned custodian right next to the construction site
    state = {
      ...state,
      walkers: state.walkers.map((w) =>
        w.id === "custodian-1"
          ? { ...w, tile: { x: 30, y: 49 } }
          : w
      ).filter((w) => w.id !== "custodian-2") // Remove unassigned one
    };

    // Run a tick
    const result = runSimulationTick(state, 1);
    const building = result.state.buildings.find((b) => b.id === "test-storehouse")!;

    // Construction should NOT advance — the only nearby custodian is assigned to grain_field
    expect(building.constructionProgress).toBe(0);
  });

  it("unassigned custodians still perform construction", () => {
    let state = setupProductionState();

    // Inject a building under construction
    const storehouse = {
      ...createBuildingAt("storehouse", { x: 30, y: 49 }, "test-storehouse"),
      constructionProgress: 0,
      constructionWork: 100,
      condition: 0,
      storedResources: {}
    };
    state = { ...state, buildings: [...state.buildings, storehouse] };

    // Put an unassigned custodian right next to the construction site
    state = {
      ...state,
      walkers: [
        { ...makeCustodian("custodian-free", "Free Worker"), tile: { x: 30, y: 49 } }
      ]
    };

    const result = runSimulationTick(state, 1);
    const building = result.state.buildings.find((b) => b.id === "test-storehouse")!;

    // Construction should advance — custodian is unassigned
    expect(building.constructionProgress).toBeGreaterThan(0);
  });
});
