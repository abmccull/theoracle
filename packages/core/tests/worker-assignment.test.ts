import { describe, expect, it } from "vitest";

import { reduceCommand } from "../src/reducers";
import { createInitialState } from "../src/state/initialState";
import { createBuildingAt } from "../src/simulation/updateDay";
import { selectPopulationSummary, selectBuildingStaffingStatus } from "../src/selectors";
import type { GameState, WalkerInstance, BuildingInstance } from "../src/state/gameState";

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

function makeCarrier(id: string, name: string): WalkerInstance {
  return {
    ...makeCustodian(id, name),
    role: "carrier"
  };
}

/**
 * Creates a state with a grain_field (requires custodian staffing) injected directly,
 * a storehouse (no custodian staffing), and two custodian walkers.
 */
function setupTestState(): GameState {
  let state = createInitialState();

  // Inject a grain_field directly (bypasses placement validation — we're testing assignment, not placement)
  const grainField = createBuildingAt("grain_field", { x: 28, y: 49 }, "test-grain-field");
  const storehouse = createBuildingAt("storehouse", { x: 30, y: 49 }, "test-storehouse");

  state = {
    ...state,
    buildings: [...state.buildings, grainField, storehouse],
    walkers: [
      makeCustodian("custodian-1", "Worker 1"),
      makeCustodian("custodian-2", "Worker 2")
    ]
  };

  return state;
}

function findGrainField(state: GameState): BuildingInstance {
  return state.buildings.find((b) => b.id === "test-grain-field")!;
}

function findStorehouse(state: GameState): BuildingInstance {
  return state.buildings.find((b) => b.id === "test-storehouse")!;
}

describe("AssignWorkerCommand", () => {
  it("assigns a custodian to a building with staffing requirement", () => {
    const state = setupTestState();
    const grainField = findGrainField(state);

    const result = reduceCommand(state, {
      type: "AssignWorkerCommand",
      walkerId: "custodian-1",
      buildingId: grainField.id
    });

    const updatedBuilding = result.state.buildings.find((b) => b.id === grainField.id)!;
    expect(updatedBuilding.assignedWorkerIds).toContain("custodian-1");

    const updatedWalker = result.state.walkers.find((w) => w.id === "custodian-1")!;
    expect(updatedWalker.assignmentBuildingId).toBe(grainField.id);
    expect(updatedWalker.state).toBe("idle");
    expect(updatedWalker.path).toEqual([]);
  });

  it("emits a WalkerAssigned event", () => {
    const state = setupTestState();
    const grainField = findGrainField(state);

    const result = reduceCommand(state, {
      type: "AssignWorkerCommand",
      walkerId: "custodian-1",
      buildingId: grainField.id
    });

    const event = result.events.find((e) => e.type === "WalkerAssigned");
    expect(event).toBeDefined();
  });

  it("rejects non-custodian walkers", () => {
    let state = setupTestState();
    state = {
      ...state,
      walkers: [...state.walkers, makeCarrier("carrier-1", "Carrier 1")]
    };
    const grainField = findGrainField(state);

    const result = reduceCommand(state, {
      type: "AssignWorkerCommand",
      walkerId: "carrier-1",
      buildingId: grainField.id
    });

    const building = result.state.buildings.find((b) => b.id === grainField.id)!;
    expect(building.assignedWorkerIds).not.toContain("carrier-1");
  });

  it("rejects if building has no staffing.custodians requirement", () => {
    const state = setupTestState();
    const storehouse = findStorehouse(state);

    const result = reduceCommand(state, {
      type: "AssignWorkerCommand",
      walkerId: "custodian-1",
      buildingId: storehouse.id
    });

    const updatedStorehouse = result.state.buildings.find((b) => b.id === storehouse.id)!;
    expect(updatedStorehouse.assignedWorkerIds).toHaveLength(0);
  });

  it("rejects if building is at max staffing", () => {
    let state = setupTestState();
    const grainField = findGrainField(state);

    // Assign first worker (grain_field requires 1 custodian)
    state = reduceCommand(state, {
      type: "AssignWorkerCommand",
      walkerId: "custodian-1",
      buildingId: grainField.id
    }).state;

    // Try to assign second worker — should be rejected (max is 1)
    const result = reduceCommand(state, {
      type: "AssignWorkerCommand",
      walkerId: "custodian-2",
      buildingId: grainField.id
    });

    const building = result.state.buildings.find((b) => b.id === grainField.id)!;
    expect(building.assignedWorkerIds).toHaveLength(1);
    expect(building.assignedWorkerIds).toContain("custodian-1");
    expect(building.assignedWorkerIds).not.toContain("custodian-2");
  });

  it("rejects if walker is already assigned to another building", () => {
    let state = setupTestState();
    const grainField = findGrainField(state);

    // Add a second grain field
    const secondField = createBuildingAt("grain_field", { x: 32, y: 49 }, "test-grain-field-2");
    state = { ...state, buildings: [...state.buildings, secondField] };

    // Assign custodian-1 to first grain field
    state = reduceCommand(state, {
      type: "AssignWorkerCommand",
      walkerId: "custodian-1",
      buildingId: grainField.id
    }).state;

    // Try to assign custodian-1 to second grain field — should be rejected
    const result = reduceCommand(state, {
      type: "AssignWorkerCommand",
      walkerId: "custodian-1",
      buildingId: secondField.id
    });

    const building2 = result.state.buildings.find((b) => b.id === secondField.id)!;
    expect(building2.assignedWorkerIds).not.toContain("custodian-1");
  });

  it("rejects if walker does not exist", () => {
    const state = setupTestState();
    const grainField = findGrainField(state);

    const result = reduceCommand(state, {
      type: "AssignWorkerCommand",
      walkerId: "nonexistent",
      buildingId: grainField.id
    });

    const building = result.state.buildings.find((b) => b.id === grainField.id)!;
    expect(building.assignedWorkerIds).toHaveLength(0);
  });

  it("rejects if building does not exist", () => {
    const state = setupTestState();

    const result = reduceCommand(state, {
      type: "AssignWorkerCommand",
      walkerId: "custodian-1",
      buildingId: "nonexistent"
    });

    const walker = result.state.walkers.find((w) => w.id === "custodian-1")!;
    expect(walker.assignmentBuildingId).toBeUndefined();
  });
});

describe("UnassignWorkerCommand", () => {
  it("removes worker from building and clears walker fields", () => {
    let state = setupTestState();
    const grainField = findGrainField(state);

    // Assign first
    state = reduceCommand(state, {
      type: "AssignWorkerCommand",
      walkerId: "custodian-1",
      buildingId: grainField.id
    }).state;

    // Then unassign
    const result = reduceCommand(state, {
      type: "UnassignWorkerCommand",
      walkerId: "custodian-1",
      buildingId: grainField.id
    });

    const building = result.state.buildings.find((b) => b.id === grainField.id)!;
    expect(building.assignedWorkerIds).not.toContain("custodian-1");
    expect(building.assignedWorkerIds).toHaveLength(0);

    const walker = result.state.walkers.find((w) => w.id === "custodian-1")!;
    expect(walker.assignmentBuildingId).toBeUndefined();
    expect(walker.productionPhase).toBeUndefined();
    expect(walker.gatherTargetTile).toBeUndefined();
    expect(walker.phaseProgress).toBeUndefined();
    expect(walker.phaseWork).toBeUndefined();
    expect(walker.gatherResourceId).toBeUndefined();
    expect(walker.gatherAmount).toBeUndefined();
    expect(walker.state).toBe("idle");
    expect(walker.path).toEqual([]);
  });

  it("rejects if worker is not assigned to the specified building", () => {
    const state = setupTestState();
    const grainField = findGrainField(state);

    const result = reduceCommand(state, {
      type: "UnassignWorkerCommand",
      walkerId: "custodian-1",
      buildingId: grainField.id
    });

    // State unchanged
    expect(result.state).toBe(state);
  });

  it("rejects if building does not exist", () => {
    const state = setupTestState();

    const result = reduceCommand(state, {
      type: "UnassignWorkerCommand",
      walkerId: "custodian-1",
      buildingId: "nonexistent"
    });

    expect(result.state).toBe(state);
  });
});

describe("selectPopulationSummary — assigned/unassigned counts", () => {
  it("reports all custodians as unassigned when none are assigned", () => {
    const state = setupTestState();
    const summary = selectPopulationSummary(state);

    expect(summary.custodians.current).toBe(2);
    expect(summary.custodians.assigned).toBe(0);
    expect(summary.custodians.unassigned).toBe(2);
  });

  it("reports correct assigned/unassigned split after assignment", () => {
    let state = setupTestState();
    const grainField = findGrainField(state);

    state = reduceCommand(state, {
      type: "AssignWorkerCommand",
      walkerId: "custodian-1",
      buildingId: grainField.id
    }).state;

    const summary = selectPopulationSummary(state);
    expect(summary.custodians.assigned).toBe(1);
    expect(summary.custodians.unassigned).toBe(1);
  });
});

describe("selectBuildingStaffingStatus", () => {
  it("returns needs_worker for unstaffed building with requirement", () => {
    const state = setupTestState();
    const grainField = findGrainField(state);

    const status = selectBuildingStaffingStatus(state, grainField.id);
    expect(status).toBeDefined();
    expect(status!.status).toBe("needs_worker");
    expect(status!.requiredCustodians).toBe(1);
    expect(status!.assignedWorkerIds).toHaveLength(0);
  });

  it("returns fully_staffed for building with required workers assigned", () => {
    let state = setupTestState();
    const grainField = findGrainField(state);

    state = reduceCommand(state, {
      type: "AssignWorkerCommand",
      walkerId: "custodian-1",
      buildingId: grainField.id
    }).state;

    const status = selectBuildingStaffingStatus(state, grainField.id);
    expect(status!.status).toBe("fully_staffed");
    expect(status!.assignedWorkerNames).toContain("Worker 1");
  });

  it("returns no_workers_required for buildings without staffing need", () => {
    const state = setupTestState();
    const storehouse = findStorehouse(state);

    const status = selectBuildingStaffingStatus(state, storehouse.id);
    expect(status!.status).toBe("no_workers_required");
    expect(status!.requiredCustodians).toBe(0);
  });

  it("returns undefined for nonexistent building", () => {
    const state = setupTestState();
    const status = selectBuildingStaffingStatus(state, "nonexistent");
    expect(status).toBeUndefined();
  });
});
