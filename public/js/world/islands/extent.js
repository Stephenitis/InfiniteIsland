// Island extents (Step 69a): the SQUARE-per-island assumption (radius + ISLAND_MESH_MARGIN) generalised to a rectangle. Pure, no three.js.
//
//   meshExtent(island)   -> { halfX, halfZ }   half sizes of the island's terrain mesh rectangle centred on (island.x, island.z)
//   frameExtent(island)  -> { halfX, halfZ }   half sizes of the coast frame (the mesh minus the margin)
//   islandGap(island, x, z)                    coast distance of a point: > 0 outside, < 0 on the island (regions.js / the view manager read it)
//
// An ISLANDS entry may carry `halfX` / `halfZ` (the frame; Duskcrown is 330 x 220 u). Entries without them are the old squares,
// `radius` each way, so home / Frostpine / Emberleaf / Storybook Cay get exactly the numbers they always had (the golden tests pin it).
// HOME keeps its own 150 u terrain square (WORLD_SIZE) in terrainMesh.js / water.js; it never goes through meshExtent.
import { ISLAND_MESH_MARGIN } from '../../config.js';

export function frameExtent(island) {
  return { halfX: island.halfX ?? island.radius, halfZ: island.halfZ ?? island.radius };
}

export function meshExtent(island) {
  const f = frameExtent(island);
  return { halfX: f.halfX + ISLAND_MESH_MARGIN, halfZ: f.halfZ + ISLAND_MESH_MARGIN };
}

/** True when the island is a rectangle/ellipse rather than the classic square/circle. */
export const isRectangular = (island) => island.halfX !== undefined || island.halfZ !== undefined;

/**
 * Coast distance of a point. A classic island keeps `hypot - radius` exactly (the old regions.js rule). A rectangular one uses the
 * first-order distance to its elliptical frame, (rho - 1) / |grad rho|, which is exact on the axes and good enough for the
 * enter / exit thresholds of the view manager (60 / 72 u) everywhere else.
 */
export function islandGap(island, x, z) {
  const dx = x - island.x, dz = z - island.z;
  if (!isRectangular(island)) return Math.hypot(dx, dz) - island.radius;
  const { halfX: a, halfZ: b } = frameExtent(island);
  const rho = Math.hypot(dx / a, dz / b);
  const g = Math.hypot(dx / (a * a), dz / (b * b));
  if (g < 1e-9) return -Math.min(a, b);
  return (rho - 1) * rho / g;
}
