/**
 * Road auto-tiling via 4-bit connection bitmask.
 *
 * Each road tile encodes which cardinal neighbours are also roads:
 *   bit 0 (1) = North
 *   bit 1 (2) = East
 *   bit 2 (4) = South
 *   bit 3 (8) = West
 *
 * 16 possible values (0–15) map to sprite variants:
 *   0  = isolated dot
 *   1  = dead-end south (connects north only)
 *   2  = dead-end west  (connects east only)
 *   3  = corner NE
 *   4  = dead-end north (connects south only)
 *   5  = straight N-S
 *   6  = corner SE
 *   7  = T north-east-south
 *   8  = dead-end east  (connects west only)
 *   9  = corner NW
 *   10 = straight E-W
 *   11 = T north-east-west
 *   12 = corner SW
 *   13 = T north-south-west
 *   14 = T east-south-west
 *   15 = crossroads
 */

import type { Coord } from "../state/gameState";

export type RoadMask = number; // 0–15

/**
 * Compute the 4-bit connection mask for a road at (x, y).
 */
export function roadConnectionMask(x: number, y: number, roads: Coord[]): RoadMask {
  const roadSet = new Set(roads.map((r) => `${r.x},${r.y}`));
  let mask = 0;
  if (roadSet.has(`${x},${y - 1}`)) mask |= 1; // North
  if (roadSet.has(`${x + 1},${y}`)) mask |= 2; // East
  if (roadSet.has(`${x},${y + 1}`)) mask |= 4; // South
  if (roadSet.has(`${x - 1},${y}`)) mask |= 8; // West
  return mask as RoadMask;
}

/**
 * Pre-compute masks for all roads in one pass (avoids repeated Set creation).
 */
export function computeAllRoadMasks(roads: Coord[]): Map<string, RoadMask> {
  const roadSet = new Set(roads.map((r) => `${r.x},${r.y}`));
  const masks = new Map<string, RoadMask>();

  for (const road of roads) {
    let mask = 0;
    if (roadSet.has(`${road.x},${road.y - 1}`)) mask |= 1;
    if (roadSet.has(`${road.x + 1},${road.y}`)) mask |= 2;
    if (roadSet.has(`${road.x},${road.y + 1}`)) mask |= 4;
    if (roadSet.has(`${road.x - 1},${road.y}`)) mask |= 8;
    masks.set(`${road.x},${road.y}`, mask as RoadMask);
  }

  return masks;
}
