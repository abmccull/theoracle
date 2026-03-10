import { describe, expect, it } from "vitest";

import { reduceCommand } from "../src/reducers";
import { createInitialState } from "../src/state/initialState";
import { isBuildingUnderConstruction } from "../src/state/gameState";
import { runSimulationTick } from "../src/simulation/updateDay";
import { buildingDefs } from "@the-oracle/content";

describe("Construction system", () => {
  /**
   * Helper: set constructionWork on a building def temporarily for testing.
   * Since no content defs currently have constructionWork, we patch the runtime
   * building state directly after placement.
   */
  function patchBuildingConstruction(
    state: ReturnType<typeof createInitialState>,
    defId: string,
    constructionWork: number
  ) {
    return {
      ...state,
      buildings: state.buildings.map((b) =>
        b.defId === defId
          ? { ...b, constructionProgress: 0, constructionWork, condition: 0, storedResources: {} }
          : b
      )
    };
  }

  it("building with constructionWork starts under construction", () => {
    let state = createInitialState();
    // Place a road and a storehouse
    state = reduceCommand(state, { type: "PlaceRoadCommand", tile: { x: 28, y: 50 } }).state;
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "storehouse", tile: { x: 28, y: 48 } }).state;

    // Patch it to have construction requirements
    state = patchBuildingConstruction(state, "storehouse", 5);
    const building = state.buildings.find((b) => b.defId === "storehouse")!;

    expect(isBuildingUnderConstruction(building)).toBe(true);
    expect(building.constructionProgress).toBe(0);
    expect(building.constructionWork).toBe(5);
    expect(building.condition).toBe(0);
    // No starting resources while under construction
    expect(Object.keys(building.storedResources).length).toBe(0);
  });

  it("construction does not advance without a nearby custodian", () => {
    let state = createInitialState();
    state = reduceCommand(state, { type: "PlaceRoadCommand", tile: { x: 28, y: 50 } }).state;
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "storehouse", tile: { x: 28, y: 48 } }).state;
    state = patchBuildingConstruction(state, "storehouse", 10);

    // Remove all custodian walkers
    state = { ...state, walkers: state.walkers.filter((w) => w.role !== "custodian") };

    const nextState = runSimulationTick(state, 600).state;
    const building = nextState.buildings.find((b) => b.defId === "storehouse")!;
    expect(building.constructionProgress).toBe(0);
    expect(isBuildingUnderConstruction(building)).toBe(true);
  });

  it("construction advances when a custodian is nearby", () => {
    let state = createInitialState();
    state = reduceCommand(state, { type: "PlaceRoadCommand", tile: { x: 28, y: 50 } }).state;
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "storehouse", tile: { x: 28, y: 48 } }).state;
    state = patchBuildingConstruction(state, "storehouse", 10);

    const buildingPos = state.buildings.find((b) => b.defId === "storehouse")!.position;

    // Place a custodian walker within range (2 tiles)
    state = {
      ...state,
      walkers: [
        ...state.walkers,
        {
          id: "test-custodian",
          role: "custodian" as const,
          name: "Test Worker",
          tile: { x: buildingPos.x + 1, y: buildingPos.y },
          state: "idle" as const,
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
        }
      ]
    };

    const nextState = runSimulationTick(state, 600).state;
    const building = nextState.buildings.find((b) => b.defId === "storehouse")!;
    expect(building.constructionProgress).toBeGreaterThan(0);
  });

  it("construction completes and grants starting resources + full condition", () => {
    let state = createInitialState();
    state = reduceCommand(state, { type: "PlaceRoadCommand", tile: { x: 28, y: 50 } }).state;
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "storehouse", tile: { x: 28, y: 48 } }).state;

    // Set constructionWork to 1 so it completes in a single tick
    state = patchBuildingConstruction(state, "storehouse", 1);

    const buildingPos = state.buildings.find((b) => b.defId === "storehouse")!.position;
    state = {
      ...state,
      walkers: [
        ...state.walkers,
        {
          id: "test-custodian",
          role: "custodian" as const,
          name: "Test Worker",
          tile: { x: buildingPos.x, y: buildingPos.y },
          state: "idle" as const,
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
        }
      ]
    };

    const result = runSimulationTick(state, 600);
    const building = result.state.buildings.find((b) => b.defId === "storehouse")!;
    const def = buildingDefs["storehouse"];

    expect(isBuildingUnderConstruction(building)).toBe(false);
    expect(building.constructionProgress).toBe(1);
    expect(building.condition).toBeCloseTo(def.maxCondition, 0);

    // Check that starting resources were granted (carriers may add more, so use >=)
    for (const [resourceId, amount] of Object.entries(def.startingResources) as [string, number][]) {
      expect((building.storedResources as Record<string, number | undefined>)[resourceId] ?? 0).toBeGreaterThanOrEqual(amount);
    }

    // Check ConstructionComplete event was emitted
    const constructionEvent = result.events.find((e) => e.type === "ConstructionComplete");
    expect(constructionEvent).toBeDefined();
  });

  it("buildings under construction skip recipe/upkeep processing", () => {
    let state = createInitialState();
    // Place road + storehouse
    state = reduceCommand(state, { type: "PlaceRoadCommand", tile: { x: 28, y: 50 } }).state;
    state = reduceCommand(state, { type: "PlaceBuildingCommand", defId: "storehouse", tile: { x: 28, y: 48 } }).state;

    const building = state.buildings.find((b) => b.defId === "storehouse")!;
    const buildingId = building.id;

    // Set under construction with high work
    state = {
      ...state,
      buildings: state.buildings.map((b) =>
        b.id === buildingId
          ? { ...b, constructionProgress: 0, constructionWork: 100, condition: 0, storedResources: {} }
          : b
      )
    };

    // Remove custodians so construction doesn't advance
    state = { ...state, walkers: state.walkers.filter((w) => w.role !== "custodian") };

    const nextState = runSimulationTick(state, 600).state;
    const result = nextState.buildings.find((b) => b.id === buildingId);

    expect(result).toBeDefined();
    // Building should still be under construction with no progress
    expect(result!.constructionProgress).toBe(0);
    expect(isBuildingUnderConstruction(result!)).toBe(true);
    // Condition should remain 0 (no repair while under construction)
    expect(result!.condition).toBe(0);
  });

  it("isBuildingUnderConstruction returns false for completed buildings", () => {
    expect(isBuildingUnderConstruction({
      id: "test", defId: "storehouse", position: { x: 0, y: 0 },
      condition: 100, maxCondition: 100, requiresPriest: false,
      assignedPriestIds: [], assignedWorkerIds: [], storedResources: {}, connectedToRoad: false
    })).toBe(false);

    // constructionWork: 0 means instant build
    expect(isBuildingUnderConstruction({
      id: "test", defId: "storehouse", position: { x: 0, y: 0 },
      condition: 100, maxCondition: 100, requiresPriest: false,
      assignedPriestIds: [], assignedWorkerIds: [], storedResources: {}, connectedToRoad: false,
      constructionWork: 0, constructionProgress: 0
    })).toBe(false);

    // Completed: progress >= work
    expect(isBuildingUnderConstruction({
      id: "test", defId: "storehouse", position: { x: 0, y: 0 },
      condition: 100, maxCondition: 100, requiresPriest: false,
      assignedPriestIds: [], assignedWorkerIds: [], storedResources: {}, connectedToRoad: false,
      constructionWork: 5, constructionProgress: 5
    })).toBe(false);

    // Under construction: progress < work
    expect(isBuildingUnderConstruction({
      id: "test", defId: "storehouse", position: { x: 0, y: 0 },
      condition: 0, maxCondition: 100, requiresPriest: false,
      assignedPriestIds: [], assignedWorkerIds: [], storedResources: {}, connectedToRoad: false,
      constructionWork: 5, constructionProgress: 2
    })).toBe(true);
  });
});
