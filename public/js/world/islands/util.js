// Shared helpers for the big islands (frost.js, ember.js): smoothstep maths, the coast / beach profile and the
// "headland" (spit) that reaches towards the home island so a bridge only has to cross ~26 u of open sea.
// Everything is pure and deterministic. Island functions work in WORLD coordinates; `lx, lz` below are island-local.
import { createNoise2D } from '../../utils/noise.js';
import { SEA_FLOOR, HEIGHT_BEACH, HEIGHT_MEADOW, ISLAND_MESH_MARGIN } from '../../config.js';

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/** Beach profile: sea floor at t <= -1.5, shoreline (h = 0) at t ~ 3.8, flat beach shelf from t = 5 (a bit steeper than home's). */
export const BEACH_T0 = -1.5;
export const BEACH_T1 = 5.0;
const SPIT_MAX_T = 7.5;
export function beachHeight(t) {
  return SEA_FLOOR + (HEIGHT_BEACH - SEA_FLOOR) * sstep(BEACH_T0, BEACH_T1, t);
}
/** Beach -> meadow rise (same tier heights as home). */
export function meadowRise(t) {
  return (HEIGHT_MEADOW - HEIGHT_BEACH) * sstep(8.5, 13, t);
}

/** Half extent of an island's terrain mesh square. */
export const meshHalf = (island) => island.radius + ISLAND_MESH_MARGIN;

/**
 * Builds the coast: inland(x, z) = distance inland from the (irregular) coastline, positive on land.
 * opts.spits: [{ ax, az, bx, bz, r }] capsules (world coords) merged into the island; opts.noiseScale: low-frequency
 * coast wobble. t is clamped so the sea floor is exactly SEA_FLOOR at the mesh edge (no seam to a neighbouring mesh).
 */
export function makeCoast(island, opts = {}) {
  const cx = island.x, cz = island.z, half = meshHalf(island);
  const nCoastA = createNoise2D(island.seed + 11);
  const nCoastB = createNoise2D(island.seed + 13);
  const nWob = createNoise2D(island.seed + 17);
  const R0 = island.radius - 2;
  const amp1 = opts.amp1 ?? 7.0, amp2 = opts.amp2 ?? 3.2, ns = opts.noiseScale ?? 0.03;
  const spits = opts.spits ?? [];
  return function inland(x, z) {
    const lx = x - cx, lz = z - cz;
    const r = Math.hypot(lx, lz);
    const a = Math.atan2(lz, lx);
    const ca = Math.cos(a), sa = Math.sin(a);
    const R = R0 + amp1 * nCoastA(ca * 1.3 + 3, sa * 1.3 + 3) + amp2 * nCoastB(ca * 3.1 + 11, sa * 3.1 - 5);
    const wob = 2.0 * nWob(x * ns, z * ns);
    let t = R - r + wob;
    for (const s of spits) {
      const abx = s.bx - s.ax, abz = s.bz - s.az;
      const u = clamp01(((x - s.ax) * abx + (z - s.az) * abz) / (abx * abx + abz * abz));
      const d = Math.hypot(x - (s.ax + abx * u), z - (s.az + abz * u));
      const ts = Math.min(s.r - d + 0.6 * wob, SPIT_MAX_T);   // stay on the flat beach shelf (below meadowRise) so the spit has no ridge
      if (ts > t) t = ts;
    }
    const edge = half - Math.max(Math.abs(lx), Math.abs(lz));
    const cap = edge + BEACH_T0;
    return t < cap ? t : cap;
  };
}
