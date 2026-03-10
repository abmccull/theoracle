import { buildingDefs } from "@the-oracle/content";

import type {
  BuildingInstance,
  EventFeedItem,
  GameEvent,
  GameState,
  ResourceId,
  WalkerInstance
} from "../state/gameState";

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

/** Grain consumed per worker per simulation tick. */
const FOOD_PER_WORKER_PER_TICK = 0.02;

/** Bread consumed per worker per tick (more nutritionally efficient). */
const BREAD_PER_WORKER_PER_TICK = 0.01;

/** Hunger ticks before "starving" status (50 % efficiency). ~2 days at 600 ticks/day. */
export const HUNGER_STARVING_TICKS = 1200;

/** Hunger ticks before the worker dies. ~5 days at 600 ticks/day. */
const HUNGER_DEATH_TICKS = 3000;

/** Production efficiency multiplier when a worker is starving. */
export const STARVING_EFFICIENCY = 0.5;

/** Manhattan-distance radius for unassigned workers seeking a storage building. */
const FOOD_SEARCH_RADIUS = 10;

/** Throttle interval (in ticks) for food-shortage messages per building. */
const FOOD_SHORTAGE_MESSAGE_INTERVAL = 200;

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function manhattanDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function isStorageBuilding(building: BuildingInstance): boolean {
  return building.defId === "storehouse" || building.defId === "granary";
}

/**
 * Try to consume food from a building's storedResources.
 * Prefers bread, falls back to grain.
 * Returns { fed, updatedResources }.
 */
function tryConsumeFood(
  storedResources: Partial<Record<ResourceId, number>>
): { fed: boolean; updatedResources: Partial<Record<ResourceId, number>> } {
  const bread = storedResources.bread ?? 0;
  if (bread >= BREAD_PER_WORKER_PER_TICK) {
    return {
      fed: true,
      updatedResources: {
        ...storedResources,
        bread: bread - BREAD_PER_WORKER_PER_TICK
      }
    };
  }

  const grain = storedResources.grain ?? 0;
  if (grain >= FOOD_PER_WORKER_PER_TICK) {
    return {
      fed: true,
      updatedResources: {
        ...storedResources,
        grain: grain - FOOD_PER_WORKER_PER_TICK
      }
    };
  }

  return { fed: false, updatedResources: storedResources };
}

// ---------------------------------------------------------------------------
//  Main tick function
// ---------------------------------------------------------------------------

export function processFoodConsumption(
  state: GameState,
  events: GameEvent[]
): GameState {
  // Mutable copies we will fold back immutably at the end.
  const buildingMap = new Map<string, BuildingInstance>(
    state.buildings.map((b) => [b.id, { ...b, storedResources: { ...b.storedResources } }])
  );

  const walkerUpdates = new Map<string, WalkerInstance>();
  const removedWalkerIds = new Set<string>();
  const feedItems: EventFeedItem[] = [];
  let nextId = state.nextId;
  const tick = state.clock.tick;

  // Collect priest walkerIds so we know which walkers are priests.
  const priestWalkerIds = new Set<string>(state.priests.map((p) => p.walkerId));

  // Build a map from priestWalkerId -> priest.homeBuildingId for priest food source.
  const priestHomeBuildingByWalkerId = new Map<string, string>();
  for (const priest of state.priests) {
    if (priest.homeBuildingId) {
      priestHomeBuildingByWalkerId.set(priest.walkerId, priest.homeBuildingId);
    }
  }

  // Process each walker that is a custodian, carrier, or has a priest representation.
  for (const walker of state.walkers) {
    // Skip pilgrims -- they don't consume food.
    if (walker.role === "pilgrim") {
      continue;
    }

    let fed = false;
    let sourceBuildingId: string | undefined;

    if (priestWalkerIds.has(walker.id)) {
      // --- Priest walker: consume from home building (priest_quarters) ---
      sourceBuildingId = priestHomeBuildingByWalkerId.get(walker.id);
    } else if (walker.assignmentBuildingId) {
      // --- Assigned custodian/carrier: consume from assigned building ---
      sourceBuildingId = walker.assignmentBuildingId;
    } else {
      // --- Unassigned custodian/carrier: find nearest storage building ---
      let bestDist = FOOD_SEARCH_RADIUS + 1;
      for (const [id, building] of buildingMap) {
        if (!isStorageBuilding(building)) continue;
        const dist = manhattanDistance(walker.tile, building.position);
        if (dist <= FOOD_SEARCH_RADIUS && dist < bestDist) {
          bestDist = dist;
          sourceBuildingId = id;
        }
      }
    }

    // Attempt consumption from source building.
    if (sourceBuildingId) {
      const building = buildingMap.get(sourceBuildingId);
      if (building) {
        const result = tryConsumeFood(building.storedResources);
        if (result.fed) {
          fed = true;
          building.storedResources = result.updatedResources;
        }
      }
    }

    // Update hunger state. Hardy trait reduces hunger accumulation by 30%.
    const currentHunger = walker.hungerTicks ?? 0;
    const isHardy = walker.traits?.includes("hardy") ?? false;
    const hungerIncrement = isHardy ? 0.7 : 1;
    const newHunger = fed ? 0 : currentHunger + hungerIncrement;

    if (newHunger >= HUNGER_DEATH_TICKS) {
      // Worker dies from starvation.
      removedWalkerIds.add(walker.id);
      feedItems.push({
        id: `event-starvation-${nextId++}`,
        day: state.clock.day,
        text: `${walker.name} has perished from starvation.`
      });
      continue;
    }

    if (newHunger !== currentHunger) {
      walkerUpdates.set(walker.id, {
        ...(walkerUpdates.get(walker.id) ?? walker),
        hungerTicks: newHunger
      });
    }
  }

  // Emit food shortage messages (throttled per building).
  if (tick % FOOD_SHORTAGE_MESSAGE_INTERVAL === 0) {
    const hungryByBuilding = new Map<string, number>();

    for (const walker of state.walkers) {
      if (removedWalkerIds.has(walker.id)) continue;
      const updated = walkerUpdates.get(walker.id);
      const hunger = (updated ?? walker).hungerTicks ?? 0;
      if (hunger <= 0) continue;

      const buildingId = walker.assignmentBuildingId;
      if (!buildingId) continue;
      hungryByBuilding.set(buildingId, (hungryByBuilding.get(buildingId) ?? 0) + 1);
    }

    for (const [buildingId] of hungryByBuilding) {
      const building = buildingMap.get(buildingId);
      if (!building) continue;
      const def = buildingDefs[building.defId];
      feedItems.push({
        id: `event-food-shortage-${nextId++}`,
        day: state.clock.day,
        text: `${def.name} workers are going hungry!`
      });
    }
  }

  // --- Assemble immutable result ---

  // Remove dead walkers from buildings' assignedWorkerIds.
  const updatedBuildings = state.buildings.map((building) => {
    const mapped = buildingMap.get(building.id);
    const storedResources = mapped ? mapped.storedResources : building.storedResources;

    const hasRemovedWorkers = building.assignedWorkerIds.some((id) => removedWalkerIds.has(id));

    if (storedResources === building.storedResources && !hasRemovedWorkers) {
      return building;
    }

    return {
      ...building,
      storedResources,
      assignedWorkerIds: hasRemovedWorkers
        ? building.assignedWorkerIds.filter((id) => !removedWalkerIds.has(id))
        : building.assignedWorkerIds
    };
  });

  // Remove dead walkers and apply hunger updates.
  const updatedWalkers = state.walkers
    .filter((w) => !removedWalkerIds.has(w.id))
    .map((w) => walkerUpdates.get(w.id) ?? w);

  // Remove priests whose walkers died.
  const updatedPriests = removedWalkerIds.size > 0
    ? state.priests.filter((p) => !removedWalkerIds.has(p.walkerId))
    : state.priests;

  return {
    ...state,
    buildings: updatedBuildings,
    walkers: updatedWalkers,
    priests: updatedPriests,
    nextId,
    eventFeed: feedItems.length > 0
      ? [...feedItems, ...state.eventFeed].slice(0, 8)
      : state.eventFeed
  };
}
