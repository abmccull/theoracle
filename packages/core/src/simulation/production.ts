/**
 * Multi-phase worker production for extraction buildings.
 *
 * Workers assigned to buildings with a `productionCycle` follow a state machine:
 *   IDLE → WALKING_TO_DEPOSIT → GATHERING → RETURNING → PROCESSING → STORING → IDLE
 *
 * Processing buildings (those without productionCycle) continue to use the
 * existing recipe system in processBuildings().
 */

import { buildingDefs } from "@the-oracle/content";

import type {
  BuildingInstance,
  GameEvent,
  GameState,
  ProductionPhase,
  ResourceId,
  WalkerInstance
} from "../state/gameState";
import { isBuildingUnderConstruction } from "../state/gameState";
import { findNearestDeposit, depleteDeposit } from "../terrain/deposits";
import { findPath } from "./updateDay";

// ── Helpers ──

/** Resolve the output resource from a building's first recipe produces key. */
function getGatherResourceId(building: BuildingInstance): ResourceId | undefined {
  const def = buildingDefs[building.defId];
  if (!def.recipes || def.recipes.length === 0) return undefined;
  const produces = def.recipes[0].produces;
  const keys = Object.keys(produces) as ResourceId[];
  return keys[0];
}

/** Max search distance for deposit lookup — derived from requiredNearbyTerrain. */
function getMaxDepositDistance(building: BuildingInstance): number {
  const def = buildingDefs[building.defId];
  return def.requiredNearbyTerrain?.maxDistance ?? 5;
}

/** Seasonal yield multiplier for grain_field buildings. */
function getSeasonalYieldMultiplier(
  defId: BuildingInstance["defId"],
  season: string
): number {
  if (defId !== "grain_field") return 1.0;
  switch (season) {
    case "Winter": return 0; // idle — no cycle starts
    case "Spring": return 1.3;
    case "Summer": return 0.5;
    case "Autumn": return 1.5;
    default: return 1.0;
  }
}

/** Check if a grain_field should idle (no new cycles) in the current season. */
function shouldIdleForSeason(
  defId: BuildingInstance["defId"],
  season: string
): boolean {
  return defId === "grain_field" && season === "Winter";
}

function storageCapFor(building: BuildingInstance, resourceId: ResourceId): number {
  return buildingDefs[building.defId].storageCaps?.[resourceId] ?? Number.POSITIVE_INFINITY;
}

// ── Main Export ──

/**
 * Advance the production-phase state machine for every assigned custodian
 * at an extraction building (one with `productionCycle`).
 *
 * Call BEFORE processBuildings() so worker phases tick before recipe processing.
 */
export function advanceWorkerPhases(
  state: GameState,
  events: GameEvent[]
): { state: GameState; events: GameEvent[] } {
  let nextState = state;

  // Index buildings that have production cycles and are operational
  const productionBuildings = nextState.buildings.filter((b) => {
    const def = buildingDefs[b.defId];
    return def.productionCycle && !isBuildingUnderConstruction(b);
  });

  if (productionBuildings.length === 0) {
    return { state: nextState, events };
  }

  // Build a set of building IDs for quick lookup
  const prodBuildingIds = new Set(productionBuildings.map((b) => b.id));

  // Process each walker that is assigned to a production-cycle building
  const updatedWalkers: WalkerInstance[] = [];
  let buildingsMap = new Map(nextState.buildings.map((b) => [b.id, b]));
  let resources = nextState.resources;
  let grid = nextState.grid;

  for (const walker of nextState.walkers) {
    // Only process custodians assigned to production-cycle buildings
    if (
      walker.role !== "custodian" ||
      !walker.assignmentBuildingId ||
      !prodBuildingIds.has(walker.assignmentBuildingId)
    ) {
      updatedWalkers.push(walker);
      continue;
    }

    const building = buildingsMap.get(walker.assignmentBuildingId);
    if (!building) {
      updatedWalkers.push(walker);
      continue;
    }

    const def = buildingDefs[building.defId];
    const cycle = def.productionCycle!;
    const phase: ProductionPhase = walker.productionPhase ?? "idle";

    let w = { ...walker };

    switch (phase) {
      case "idle": {
        // Check if we should start a new cycle
        if (shouldIdleForSeason(building.defId, nextState.clock.season)) {
          // Grain fields idle in winter
          w.productionPhase = "idle";
          break;
        }

        const depositCoord = findNearestDeposit(
          // Use current grid state for deposit lookup
          { ...nextState, grid } as GameState,
          building.position,
          cycle.depositType,
          getMaxDepositDistance(building)
        );

        if (!depositCoord) {
          // No viable deposit — stay idle
          w.productionPhase = "idle";
          break;
        }

        // Start walking to deposit
        const pathToDeposit = findPath(nextState, walker.tile, depositCoord);
        w = {
          ...w,
          productionPhase: "walking_to_deposit",
          gatherTargetTile: depositCoord,
          path: pathToDeposit,
          state: "moving",
          phaseProgress: 0,
          phaseWork: 0
        };
        break;
      }

      case "walking_to_deposit": {
        // Check if walker has arrived at the deposit tile
        const target = w.gatherTargetTile;
        if (target && w.tile.x === target.x && w.tile.y === target.y) {
          w = {
            ...w,
            productionPhase: "gathering",
            phaseProgress: 0,
            phaseWork: cycle.gatherTicks,
            path: [],
            state: "working"
          };
        }
        // Otherwise, movement is handled by moveWalkers()
        break;
      }

      case "gathering": {
        const progress = (w.phaseProgress ?? 0) + 1;
        const work = w.phaseWork ?? cycle.gatherTicks;

        if (progress >= work) {
          // Gathering complete — deplete deposit and determine yield
          const gatherTarget = w.gatherTargetTile;
          if (!gatherTarget) {
            // Shouldn't happen, but recover gracefully
            w.productionPhase = "idle";
            break;
          }

          // Determine actual yield from deposit
          const depositKey = `${gatherTarget.x},${gatherTarget.y}`;
          const deposit = grid.terrainDeposits?.[depositKey];
          const seasonMult = getSeasonalYieldMultiplier(building.defId, nextState.clock.season);
          const rawYield = cycle.gatherYield * seasonMult;
          const actualYield = deposit
            ? Math.min(rawYield, deposit.currentYield)
            : rawYield;

          // Deplete the deposit
          const depletedState = depleteDeposit(
            { ...nextState, grid } as GameState,
            gatherTarget,
            actualYield
          );
          grid = depletedState.grid;

          const gatherResourceId = getGatherResourceId(building);

          // Build path back to building
          const pathBack = findPath(nextState, w.tile, building.position);

          w = {
            ...w,
            productionPhase: "returning",
            phaseProgress: 0,
            phaseWork: 0,
            gatherAmount: actualYield,
            gatherResourceId: gatherResourceId,
            path: pathBack,
            state: "moving"
          };
        } else {
          w = {
            ...w,
            phaseProgress: progress
          };
        }
        break;
      }

      case "returning": {
        // Check if walker has arrived back at building
        if (
          w.tile.x === building.position.x &&
          w.tile.y === building.position.y
        ) {
          w = {
            ...w,
            productionPhase: "processing",
            phaseProgress: 0,
            phaseWork: cycle.processTicks,
            path: [],
            state: "working"
          };
        }
        // Otherwise, movement handled by moveWalkers()
        break;
      }

      case "processing": {
        const progress = (w.phaseProgress ?? 0) + 1;
        const work = w.phaseWork ?? cycle.processTicks;

        if (progress >= work) {
          w = {
            ...w,
            productionPhase: "storing",
            phaseProgress: 0,
            phaseWork: 0
          };
        } else {
          w = {
            ...w,
            phaseProgress: progress
          };
        }
        break;
      }

      case "storing": {
        const resourceId = w.gatherResourceId;
        const amount = w.gatherAmount ?? 0;

        if (resourceId && amount > 0) {
          // Add to building storage (capped)
          const currentStored = building.storedResources[resourceId] ?? 0;
          const cap = storageCapFor(building, resourceId);
          const actualDeposit = Math.min(amount, cap - currentStored);

          if (actualDeposit > 0) {
            const updatedBuilding: BuildingInstance = {
              ...building,
              storedResources: {
                ...building.storedResources,
                [resourceId]: currentStored + actualDeposit
              }
            };
            buildingsMap.set(building.id, updatedBuilding);

            // Update global resource ledger
            const ledgerEntry = resources[resourceId];
            if (ledgerEntry) {
              resources = {
                ...resources,
                [resourceId]: {
                  ...ledgerEntry,
                  amount: Math.min(
                    ledgerEntry.capacity,
                    ledgerEntry.amount + actualDeposit
                  ),
                  trend: actualDeposit
                }
              };
            }

            events.push({
              type: "ResourceProduced",
              resourceId,
              amount: actualDeposit,
              buildingId: building.id
            });
          }
        }

        // Clear gather fields, return to idle
        w = {
          ...w,
          productionPhase: "idle",
          state: "idle",
          phaseProgress: 0,
          phaseWork: 0,
          gatherResourceId: undefined,
          gatherAmount: undefined,
          gatherTargetTile: undefined,
          path: []
        };
        break;
      }
    }

    updatedWalkers.push(w);
  }

  // Rebuild buildings array from map
  const updatedBuildings = nextState.buildings.map(
    (b) => buildingsMap.get(b.id) ?? b
  );

  nextState = {
    ...nextState,
    walkers: updatedWalkers,
    buildings: updatedBuildings,
    resources,
    grid
  };

  return { state: nextState, events };
}
