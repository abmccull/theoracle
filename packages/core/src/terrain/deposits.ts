/**
 * Terrain deposit generation and query functions.
 *
 * Deposits are natural resources bound to terrain tiles:
 *   - Forest tiles → timber deposits
 *   - Limestone tiles → stone deposits
 *   - Grass tiles near water → fertile_soil deposits
 *   - Water tiles near sacred_ground → sacred_spring deposits
 *
 * Key format matches terrainOverrides: "x,y" strings.
 */

import { buildingDefs } from "@the-oracle/content";
import type { TerrainDepositType } from "@the-oracle/content";
import type { Coord, GameEvent, GameState, Season, TerrainDeposit } from "../state/gameState";
import { generateTileTerrain, type TerrainType } from "./generate";

// ── Deposit Defaults ──

const DEPOSIT_DEFAULTS: Record<TerrainDepositType, Omit<TerrainDeposit, "currentYield">> = {
  timber: { type: "timber", maxYield: 80, regenPerDay: 0.4 },
  stone: { type: "stone", maxYield: 400, regenPerDay: 0 },
  fertile_soil: { type: "fertile_soil", maxYield: 999, regenPerDay: 0.2 },
  sacred_spring: { type: "sacred_spring", maxYield: 9999, regenPerDay: 0.15 }
};

// ── Helpers ──

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

function manhattanDistance(a: Coord, b: Coord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function hasTerrainNearby(
  terrainAt: (x: number, y: number) => TerrainType,
  cx: number,
  cy: number,
  targetTerrain: TerrainType,
  radius: number,
  width: number,
  height: number
): boolean {
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      if (dx === 0 && dy === 0) continue;
      if (Math.abs(dx) + Math.abs(dy) > radius) continue;
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (terrainAt(nx, ny) === targetTerrain) return true;
    }
  }
  return false;
}

// ── Generation ──

/**
 * Scan all tiles and create deposit records based on terrain type.
 * Pure function — deterministic for a given seed and grid size.
 */
export function generateTerrainDeposits(
  seed: number,
  width: number,
  height: number,
  terrainAt: (x: number, y: number) => TerrainType
): Record<string, TerrainDeposit> {
  const deposits: Record<string, TerrainDeposit> = {};

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const terrain = terrainAt(x, y);

      if (terrain === "forest") {
        // Forest tiles (not boundary — skip edge rows) → timber
        if (x > 2 && y > 2 && x < width - 3 && y < height - 3) {
          const defaults = DEPOSIT_DEFAULTS.timber;
          deposits[tileKey(x, y)] = { ...defaults, currentYield: defaults.maxYield };
        }
      } else if (terrain === "limestone") {
        const defaults = DEPOSIT_DEFAULTS.stone;
        deposits[tileKey(x, y)] = { ...defaults, currentYield: defaults.maxYield };
      } else if (terrain === "grass") {
        // Grass tiles within 3 of water → fertile_soil
        if (hasTerrainNearby(terrainAt, x, y, "water", 3, width, height)) {
          const defaults = DEPOSIT_DEFAULTS.fertile_soil;
          deposits[tileKey(x, y)] = { ...defaults, currentYield: defaults.maxYield };
        }
      } else if (terrain === "water") {
        // Water tiles within 2 of sacred_ground → sacred_spring
        if (hasTerrainNearby(terrainAt, x, y, "sacred_ground", 2, width, height)) {
          const defaults = DEPOSIT_DEFAULTS.sacred_spring;
          deposits[tileKey(x, y)] = { ...defaults, currentYield: defaults.maxYield };
        }
      }
    }
  }

  return deposits;
}

// ── Queries ──

/**
 * Check if any deposit of the given type exists within maxDistance (Manhattan)
 * of the given tile.
 */
export function hasDepositInRange(
  terrainDeposits: Record<string, TerrainDeposit>,
  tile: Coord,
  depositType: TerrainDepositType,
  maxDistance: number
): boolean {
  for (const [key, deposit] of Object.entries(terrainDeposits)) {
    if (deposit.type !== depositType) continue;
    const [xStr, yStr] = key.split(",");
    const dx = Math.abs(Number(xStr) - tile.x);
    const dy = Math.abs(Number(yStr) - tile.y);
    if (dx + dy <= maxDistance) return true;
  }
  return false;
}

/**
 * Find the nearest deposit of the given type to the building tile,
 * within maxDistance (Manhattan). Returns the coordinate or null.
 */
export function findNearestDeposit(
  state: GameState,
  buildingTile: Coord,
  depositType: TerrainDepositType,
  maxDistance: number
): Coord | null {
  const deposits = state.grid.terrainDeposits ?? {};
  let bestCoord: Coord | null = null;
  let bestDist = Infinity;

  for (const [key, deposit] of Object.entries(deposits)) {
    if (deposit.type !== depositType) continue;
    if (deposit.currentYield <= 0) continue;
    const [xStr, yStr] = key.split(",");
    const coord: Coord = { x: Number(xStr), y: Number(yStr) };
    const dist = manhattanDistance(buildingTile, coord);
    if (dist <= maxDistance && dist < bestDist) {
      bestDist = dist;
      bestCoord = coord;
    }
  }

  return bestCoord;
}

/**
 * Deplete a deposit at the given tile by the specified amount.
 * Returns a new state with the updated deposit.
 */
export function depleteDeposit(
  state: GameState,
  tile: Coord,
  amount: number
): GameState {
  const key = tileKey(tile.x, tile.y);
  const deposits = state.grid.terrainDeposits ?? {};
  const deposit = deposits[key];
  if (!deposit) return state;

  const newYield = Math.max(0, deposit.currentYield - amount);
  return {
    ...state,
    grid: {
      ...state.grid,
      terrainDeposits: {
        ...deposits,
        [key]: {
          ...deposit,
          currentYield: newYield,
          depletedDay: newYield <= 0 ? (state.clock?.day ?? 0) : deposit.depletedDay
        }
      }
    }
  };
}

// ── Regeneration ──

/** Seasonal fertility recovery rates per day. */
const FERTILE_SOIL_RECOVERY: Record<Season, number> = {
  Winter: 2.0,
  Spring: 2.0,
  Summer: 0.5,
  Autumn: 1.0
};

/** Timber regrowth stage thresholds (days since depletion). */
const TIMBER_REGROWTH_THRESHOLDS = [0, 30, 60, 90] as const;
const TIMBER_FULL_REGROWTH_DAY = 120;
const TIMBER_PASSIVE_REGEN = 0.1;

/**
 * Check whether a fertile_soil deposit at the given key has an active building
 * (one with assigned workers) within its required range.
 */
function isFertileDepositActive(
  state: GameState,
  depositKey: string
): boolean {
  const [xStr, yStr] = depositKey.split(",");
  const depositCoord: Coord = { x: Number(xStr), y: Number(yStr) };

  for (const building of state.buildings) {
    const def = buildingDefs[building.defId];
    if (!def?.requiredNearbyTerrain) continue;
    if (def.requiredNearbyTerrain.depositType !== "fertile_soil") continue;
    if (building.assignedWorkerIds.length === 0) continue;

    const dist = manhattanDistance(building.position, depositCoord);
    if (dist <= def.requiredNearbyTerrain.maxDistance) {
      return true;
    }
  }

  return false;
}

/**
 * Regenerate all terrain deposits for a single day tick.
 * Pure function — returns new state and any events emitted.
 *
 * Called once per day in the simulation loop.
 */
export function regenerateDeposits(
  state: GameState
): { state: GameState; events: GameEvent[] } {
  const deposits = state.grid.terrainDeposits;
  if (!deposits) return { state, events: [] };

  const currentDay = state.clock.day;
  const season = state.clock.season;
  const events: GameEvent[] = [];
  let changed = false;
  const updatedDeposits: Record<string, TerrainDeposit> = {};

  for (const [key, deposit] of Object.entries(deposits)) {
    let updated: TerrainDeposit = deposit;

    switch (deposit.type) {
      case "timber": {
        if (deposit.currentYield <= 0) {
          // Fully depleted — advance regrowth stages
          const depletedDay = deposit.depletedDay ?? currentDay;
          const daysSinceDepletion = currentDay - depletedDay;

          // Calculate regrowth stage based on days since depletion
          let stage = 0;
          if (daysSinceDepletion >= 90) stage = 3;
          else if (daysSinceDepletion >= 60) stage = 2;
          else if (daysSinceDepletion >= 30) stage = 1;

          if (daysSinceDepletion >= TIMBER_FULL_REGROWTH_DAY && stage === 3) {
            // Full tree — start regenerating yield
            const newYield = Math.min(
              deposit.maxYield,
              deposit.currentYield + deposit.regenPerDay
            );
            updated = {
              ...deposit,
              depletedDay,
              regrowthStage: stage,
              currentYield: newYield
            };
          } else {
            updated = {
              ...deposit,
              depletedDay,
              regrowthStage: stage
            };
          }
        } else {
          // Not fully depleted — passive regen
          const newYield = Math.min(
            deposit.maxYield,
            deposit.currentYield + TIMBER_PASSIVE_REGEN
          );
          updated = { ...deposit, currentYield: newYield };
        }
        break;
      }

      case "stone": {
        // No regeneration. Emit event if just depleted (yield is 0 and no depletedDay yet).
        if (deposit.currentYield <= 0 && deposit.depletedDay === undefined) {
          events.push({
            type: "DepositDepleted",
            tileKey: key,
            depositType: "stone"
          });
          updated = { ...deposit, depletedDay: currentDay };
        }
        // Otherwise stays as-is — stone never regenerates
        break;
      }

      case "fertile_soil": {
        if (deposit.currentYield < deposit.maxYield) {
          const baseRate = FERTILE_SOIL_RECOVERY[season];
          const isFallow = !isFertileDepositActive(state, key);
          const rate = isFallow ? baseRate * 2 : baseRate;
          const newYield = Math.min(deposit.maxYield, deposit.currentYield + rate);
          updated = { ...deposit, currentYield: newYield };
        }
        break;
      }

      case "sacred_spring": {
        // Reset to maxYield at start of each day
        updated = { ...deposit, currentYield: deposit.maxYield };
        break;
      }
    }

    if (updated !== deposit) {
      changed = true;
    }
    updatedDeposits[key] = updated;
  }

  if (!changed) return { state, events };

  return {
    state: {
      ...state,
      grid: {
        ...state.grid,
        terrainDeposits: updatedDeposits
      }
    },
    events
  };
}
