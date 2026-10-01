// Home island height field (Step 27a: moved here unchanged from terrain.js; terrain.js is now the multi-island dispatcher).
//
// Layout (world units, island centred on the origin, +Z is "south"/towards the default camera):
//   * beach ring   (height ~0.3)  – sand, dips into the sea
//   * meadow       (height ~1.5)  – grass
//   * plateau      (height ~3.5)  – north-west, steep dirt cliffs with two explicit walkable ramps
//   * pond         – basin carved below WATER_LEVEL so the single ocean plane fills it
//   * stream       – shallow channel from the plateau foot down to the pond (has its own ribbon mesh, see water.js)
// Everything here is pure and deterministic; the golden test (test/terrain.test.js) pins its values.
import { createNoise2D, fbm } from '../../utils/noise.js';
import {
  WATER_LEVEL, ISLAND_RADIUS, WORLD_SEED,
  HEIGHT_BEACH, HEIGHT_MEADOW, HEIGHT_PLATEAU, DEEP_WATER_BLOCK,
} from '../../config.js';

export { ISLAND_RADIUS };

// ---------------------------------------------------------------------------------------------
// Layout constants (exported so props / water / player code can reason about the same features)
// ---------------------------------------------------------------------------------------------
export const SPAWN = { x: 2, z: 12 };
export const POND = { x: 20, z: 8, rx: 4.8, rz: 4.0 };          // approximate water outline
export const PLATEAU = { x: -10, z: -24, radius: 15 };
export const RAMP_ANGLES = [1.45, Math.PI];                     // where the plateau ramps leave the plateau (radians, atan2(dz,dx))
export const POND_BOTTOM = -0.8;
export const MAX_WALK_SLOPE = 0.8;                               // gradient (rise/run) above which ground is "cliff"

const STREAM_HALF_WIDTH = 1.3;
const STREAM_DEPTH = 0.5;

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

const nA = createNoise2D(WORLD_SEED);
const nB = createNoise2D(WORLD_SEED + 7);

// ---------------------------------------------------------------------------------------------
// Stream path (Catmull-Rom through control points, sampled ~1u apart)
// ---------------------------------------------------------------------------------------------
const STREAM_CONTROL = [
  [0.4, -12.2], [3.0, -8.0], [5.0, -4.0], [5.5, 0.5], [9.0, 4.0], [13.0, 6.0], [17.5, 7.6],
];

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function buildStreamPath() {
  const c = STREAM_CONTROL;
  const pts = [];
  for (let i = 0; i < c.length - 1; i++) {
    const p0 = c[Math.max(0, i - 1)], p1 = c[i], p2 = c[i + 1], p3 = c[Math.min(c.length - 1, i + 2)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.round(len));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      pts.push({ x: catmull(p0[0], p1[0], p2[0], p3[0], t), z: catmull(p0[1], p1[1], p2[1], p3[1], t) });
    }
  }
  const last = c[c.length - 1];
  pts.push({ x: last[0], z: last[1] });
  return pts;
}

/** Dense polyline (~1u spacing) running from the plateau foot down to the pond. */
export const STREAM_PATH = buildStreamPath();
export { STREAM_HALF_WIDTH };

const STREAM_BOUNDS = (() => {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of STREAM_PATH) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const m = 4;
  return { minX: minX - m, maxX: maxX + m, minZ: minZ - m, maxZ: maxZ + m };
})();

/** Distance from (x,z) to the stream centre line (Infinity when far away). */
export function streamDistance(x, z) {
  const b = STREAM_BOUNDS;
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return Infinity;
  let best = Infinity;
  for (let i = 0; i < STREAM_PATH.length - 1; i++) {
    const a = STREAM_PATH[i], c = STREAM_PATH[i + 1];
    const abx = c.x - a.x, abz = c.z - a.z;
    const t = clamp01(((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz));
    const dx = x - (a.x + abx * t), dz = z - (a.z + abz * t);
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// ---------------------------------------------------------------------------------------------
// Height field
// ---------------------------------------------------------------------------------------------
/** Distance "inland" from the (irregular) coastline: positive on land, negative at sea. */
export function inlandDistance(x, z) {
  const r = Math.hypot(x, z);
  const a = Math.atan2(z, x);
  const ca = Math.cos(a), sa = Math.sin(a);
  const R = ISLAND_RADIUS - 2
    + 4.0 * nA(ca * 1.2 + 3, sa * 1.2 + 3)
    + 1.8 * nA(ca * 2.9 + 11, sa * 2.9 - 5);
  return R - r + 2.0 * nB(x * 0.05, z * 0.05);
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/** How strongly (0..1) the point lies in one of the explicit ramp wedges of the plateau. */
function rampMask(x, z) {
  const a = Math.atan2(z - PLATEAU.z, x - PLATEAU.x);
  let m = 0;
  for (const ra of RAMP_ANGLES) m = Math.max(m, 1 - sstep(0.24, 0.5, angleDiff(a, ra)));
  return m;
}

/** Pure, deterministic terrain height. Sea floor is about -3, beach 0.3, meadow 1.5, plateau 3.5. */
export function getHeight(x, z) {
  const t = inlandDistance(x, z);

  // Beach shelf that dips into the sea, then the soft ramp up to the meadow.
  let h = -3 + (HEIGHT_BEACH + 3) * sstep(-6, 4.5, t);
  h += (HEIGHT_MEADOW - HEIGHT_BEACH) * sstep(9, 13.5, t);

  // Plateau: cliff edge is narrow, but inside the ramp wedges the transition is stretched out (walkable).
  const dxp = x - PLATEAU.x, dzp = z - PLATEAU.z;
  const pf = PLATEAU.radius - Math.hypot(dxp, dzp) + 2.6 * nB(x * 0.06 + 20, z * 0.06 - 9);
  if (pf > 0) {
    const edgeW = 2.4 + 7.4 * rampMask(x, z);
    h += (HEIGHT_PLATEAU - HEIGHT_MEADOW) * sstep(0, edgeW, pf);
  }

  // Gentle rolling detail on land only
  h += sstep(8, 14, t) * 0.3 * fbm(x * 0.045, z * 0.045, 3, 2, 0.5, nB);

  // Flat spot around the spawn
  const ds = Math.hypot(x - SPAWN.x, z - SPAWN.z);
  if (ds < 10) h = lerp(h, HEIGHT_MEADOW, 1 - sstep(4, 10, ds));

  // Pond basin (dips below WATER_LEVEL so the ocean plane fills it)
  const pd = Math.hypot((x - POND.x) / 1.2, z - POND.z) + 0.5 * nB(x * 0.25 + 5, z * 0.25);
  if (pd < 8.5) h = lerp(h, POND_BOTTOM, 1 - sstep(2.2, 8.4, pd));

  // Stream channel
  const sd = streamDistance(x, z);
  if (sd < 2.7) h -= STREAM_DEPTH * (1 - sstep(0.7, 2.6, sd));

  return h;
}

/** Steepness (rise over run) via central differences. */
export function getSlope(x, z, e = 0.5) {
  const gx = (getHeight(x + e, z) - getHeight(x - e, z)) / (2 * e);
  const gz = (getHeight(x, z + e) - getHeight(x, z - e)) / (2 * e);
  return Math.hypot(gx, gz);
}

/** 'sand' | 'grass' | 'dirt' | 'water' | 'wetsand' */
export function getGroundType(x, z) {
  const h = getHeight(x, z);
  if (h < WATER_LEVEL - 0.03) return 'water';
  if (streamDistance(x, z) < STREAM_HALF_WIDTH * 0.85) return 'water';
  if (h < WATER_LEVEL + 0.2) return 'wetsand';
  if (h > 0.5 && getSlope(x, z) > 0.6) return 'dirt';
  if (inlandDistance(x, z) < 10.5) return 'sand';
  return 'grass';
}

/** Walkable = not deep water and not a cliff face. */
export function isWalkable(x, z) {
  if (getHeight(x, z) < WATER_LEVEL - DEEP_WATER_BLOCK) return false;
  return getSlope(x, z, 0.4) < MAX_WALK_SLOPE;
}

/** Second noise field, shared with the home terrain mesh colouring (sand glints, dirt mottling). */
export const homeNoiseB = nB;
