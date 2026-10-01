// Pure, seeded placement helpers shared by the big islands' prop code (emberPlacement.js and frostPlacement.js).
// No three.js: Node-tested through the frost placement tests.
//
//   scatter(island, { seed, target, minDist, tries, accept })   rejection-sample spots; accept(x, z, rng) -> kind string | null; spots keep `minDist` apart
//   safeSpot(mod, x, z, h, types, maxSlope)                      flat enough, and a ring of points around it is allowed ground at about the same height
//   landingFor(island)                                           the far landing { x, z } of the bridge that ends on this island (or null)
//   polyDist(poly, x, z)                                         distance from a point to a polyline [[x, z], ...] (world coordinates)
import { BRIDGES, ISLAND_MESH_MARGIN } from '../../config.js';
import { mulberry32 } from '../../utils/rng.js';

const TAU = Math.PI * 2;
const RING = [0, 1, 2, 3, 4, 5].map((i) => [Math.cos((i / 6) * TAU) * 2.0, Math.sin((i / 6) * TAU) * 2.0]);

/**
 * Rejection-sample up to `target` spots on the island: `accept(x, z)` returns a kind string or null. Spots keep `minDist` apart (hash grid).
 * Pure + seeded, so every screen gets the same placements.
 */
export function scatter(island, { seed, target, minDist, tries, accept }) {
  const rng = mulberry32(seed);
  const half = island.radius + ISLAND_MESH_MARGIN - 6;
  const cell = minDist;
  const grid = new Map();
  const out = [];
  for (let t = 0; t < tries && out.length < target; t++) {
    const x = island.x + (rng() * 2 - 1) * half, z = island.z + (rng() * 2 - 1) * half;
    const kind = accept(x, z, rng);
    if (!kind) continue;
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    let clear = true;
    for (let i = cx - 1; i <= cx + 1 && clear; i++) {
      for (let j = cz - 1; j <= cz + 1 && clear; j++) {
        const l = grid.get(i * 73856093 ^ j * 19349663);
        if (l) for (const o of l) if ((o.x - x) ** 2 + (o.z - z) ** 2 < minDist * minDist) { clear = false; break; }
      }
    }
    if (!clear) continue;
    const key = cx * 73856093 ^ cz * 19349663;
    const item = { x, z, kind };
    (grid.get(key) || grid.set(key, []).get(key)).push(item);
    out.push(item);
  }
  return out;
}

/** True if the point is flat enough and every ring point around it is allowed ground at about the same height (keeps props off shores, ramps, ice, lava). */
export function safeSpot(mod, x, z, h, types, maxSlope) {
  const e = 0.8;
  if (Math.hypot((mod.height(x + e, z) - h) / e, (mod.height(x, z + e) - h) / e) > maxSlope) return false;
  for (const [ox, oz] of RING) {
    const px = x + ox, pz = z + oz, ph = mod.height(px, pz);
    if (Math.abs(ph - h) > 0.5 || !types.includes(mod.groundType(px, pz))) return false;
    if (Math.hypot((mod.height(px + e, pz) - ph) / e, (mod.height(px, pz + e) - ph) / e) > maxSlope + 0.1) return false;
  }
  return true;
}

/** The far landing of the bridge that ends on this island (props keep clear of it). */
export function landingFor(island) {
  const b = BRIDGES.find((e) => e.to === island.id);
  return b ? { x: b.bx, z: b.bz } : null;
}

/** Distance from (x, z) to a polyline of [x, z] points (a "lane" that must stay walkable). */
export function polyDist(poly, x, z) {
  let best = Infinity;
  for (let i = 0; i + 1 < poly.length; i++) {
    const ax = poly[i][0], az = poly[i][1], bx = poly[i + 1][0], bz = poly[i + 1][1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    let u = ((x - ax) * dx + (z - az) * dz) / l2;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const d = Math.hypot(x - (ax + dx * u), z - (az + dz * u));
    if (d < best) best = d;
  }
  return best;
}
