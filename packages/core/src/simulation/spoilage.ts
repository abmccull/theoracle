import { buildingDefs, resourceDefs } from "@the-oracle/content";
import type { ResourceId } from "@the-oracle/content";
import type { GameState } from "../state/gameState";
import { isBuildingUnderConstruction } from "../state/gameState";

/**
 * Sprint 5: Resource spoilage system.
 *
 * Each tick, perishable resources stored in buildings decay at a rate
 * derived from the resource's spoilage config. Decay is modified by:
 *   - Summer season (summerMultiplier)
 *   - Low building condition (< 50% of maxCondition → lowConditionMultiplier)
 *   - Building-level spoilage reduction (e.g. granary preserves grain)
 *
 * The global resources ledger is decremented in lockstep with building storage.
 */

/** Pre-index resource spoilage configs for O(1) lookup. */
const spoilageByResource = new Map(
  resourceDefs
    .filter((r) => r.spoilage != null)
    .map((r) => [r.id, r.spoilage!] as const)
);

export function processSpoilage(state: GameState): GameState {
  const isSummer = state.clock.season === "Summer";

  // Accumulate global resource deltas across all buildings
  const globalDeltas: Partial<Record<ResourceId, number>> = {};
  let buildingsChanged = false;

  const nextBuildings = state.buildings.map((building) => {
    // Skip buildings under construction — no resources spoil in them
    if (isBuildingUnderConstruction(building)) return building;

    const stored = building.storedResources;
    if (!stored || Object.keys(stored).length === 0) return building;

    const def = buildingDefs[building.defId];
    const lowCondition = building.condition / building.maxCondition < 0.5;

    let changed = false;
    const nextStored = { ...stored };

    for (const resourceId of Object.keys(stored) as ResourceId[]) {
      const amount = stored[resourceId];
      if (amount == null || amount <= 0) continue;

      const spoilage = spoilageByResource.get(resourceId);
      if (!spoilage) continue;

      // Base per-tick rate
      let rate = spoilage.baseRatePerDay / state.clock.ticksPerDay;

      // Season modifier
      if (isSummer) {
        rate *= spoilage.summerMultiplier;
      }

      // Low condition modifier
      if (lowCondition) {
        rate *= spoilage.lowConditionMultiplier;
      }

      // Building spoilage reduction (e.g. granary grain: 0.20 means rate is 20% of base)
      const reduction = def?.spoilageReduction?.[resourceId];
      if (reduction != null) {
        rate *= reduction;
      }

      const decay = amount * rate;
      if (decay <= 0) continue;

      const newAmount = Math.max(0, amount - decay);
      nextStored[resourceId] = newAmount;
      globalDeltas[resourceId] = (globalDeltas[resourceId] ?? 0) - decay;
      changed = true;
    }

    if (!changed) return building;
    buildingsChanged = true;
    return { ...building, storedResources: nextStored };
  });

  if (!buildingsChanged) return state;

  // Apply global resource deltas
  const nextResources = { ...state.resources };
  for (const [resourceId, delta] of Object.entries(globalDeltas) as [ResourceId, number][]) {
    const current = nextResources[resourceId];
    if (current) {
      nextResources[resourceId] = {
        ...current,
        amount: Math.max(0, current.amount + delta)
      };
    }
  }

  return {
    ...state,
    buildings: nextBuildings,
    resources: nextResources
  };
}
