// Trails (PLAN Step 33b): reusable, pure and seeded (no three.js, no registries), so every screen computes the same trail, the terrain painter, the prop
// placement and the Node tests all read ONE description. A trail is one entry of config.js PATHS:
//   { id, island, name, points: [[lx, lz], ...] (island-local control points), width, wobble, seed, surface: 'snow' | 'dirt', marker: { every, side } }
//
//   const p = getPath('frost-camp')            -> { id, def, island, width, samples: [[lx, lz], ...] (island-local, ~0.75 u apart), cum: [arc length], length }
//   pathsOf('frost')                           the built paths of an island
//   pathWorld(island, p)                       the same samples in WORLD coordinates
//   pathPolylines(island)                      every path of the island as a thin world polyline (3 u spacing): "lanes" that props / gathering spots keep clear  (paths with `lane: false`, Step 68a, are left out)
//   pathDist(island, p, x, z)                  distance from a WORLD point to the centre line (cheap bbox reject first)
//   pathPaint(island, x, z) -> { w, surface }  the strongest paint weight 0..1 of any path of the island at a WORLD point (solid in the core, soft edge)
//   pathMarkers(island, p) -> [{ x, z, s, side, tx, tz }]   lantern post spots (world), one every def.marker.every u, alternating sides; (tx, tz) points at the trail
//   pointAt(island, p, s, lateral) -> { x, z, tx, tz }   a world point `s` u along the trail, `lateral` u to the side (+ = to the right of the walking direction)
//
// The curve: a Catmull-Rom spline through the control points, resampled by arc length, plus a seeded sideways wobble that fades to zero at both ends (so the
// trail still starts and ends exactly on its control points). Step 37a added Emberleaf's trail as a second PATHS entry.
import { PATHS } from '../config.js';
import { mulberry32 } from '../utils/rng.js';
import { sstep } from './islands/util.js';

const STEP = 0.75;               // u between samples
const CORE = 0.34, EDGE = 0.72;   // paint: solid up to width * CORE from the centre line, gone by width * EDGE

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return [0, 1].map((k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
}

/** Build one path (island-local samples). */
export function buildPath(def) {
  const pts = def.points;
  // 1. the raw spline, densely
  const dense = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < 24; k++) dense.push(catmull(p0, p1, p2, p3, k / 24));
  }
  dense.push(pts[pts.length - 1].slice());
  // 2. resample by arc length
  const raw = [dense[0]];
  let carry = 0;
  for (let i = 1; i < dense.length; i++) {
    let [ax, az] = dense[i - 1];
    const [bx, bz] = dense[i];
    let seg = Math.hypot(bx - ax, bz - az);
    while (carry + seg >= STEP) {
      const u = (STEP - carry) / seg;
      ax += (bx - ax) * u; az += (bz - az) * u;
      raw.push([ax, az]);
      seg = Math.hypot(bx - ax, bz - az); carry = 0;
    }
    carry += seg;
  }
  raw.push(pts[pts.length - 1].slice());
  // 3. the seeded wobble, perpendicular to the curve, fading out at both ends
  const rng = mulberry32(def.seed >>> 0);
  const ph = [rng() * 6.283, rng() * 6.283, rng() * 6.283];
  let total = 0;
  for (let i = 1; i < raw.length; i++) total += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]);
  const samples = [], cum = [];
  let s = 0;
  for (let i = 0; i < raw.length; i++) {
    if (i > 0) s += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]);
    const a = raw[Math.max(0, i - 1)], b = raw[Math.min(raw.length - 1, i + 1)];
    const tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / tl, nz = (b[0] - a[0]) / tl;
    const taper = sstep(0, 9, s) * sstep(0, 9, total - s);
    const off = def.wobble * taper * (0.62 * Math.sin(s * 0.11 + ph[0]) + 0.38 * Math.sin(s * 0.27 + ph[1]) + 0.2 * Math.sin(s * 0.5 + ph[2]));
    samples.push([raw[i][0] + nx * off, raw[i][1] + nz * off]);
    cum.push(s);
  }
  // 4. the real arc length of the wobbled curve (so markers are evenly spaced along what players walk)
  let L = 0;
  for (let i = 1; i < samples.length; i++) { L += Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1]); cum[i] = L; }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of samples) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  return { id: def.id, def, island: def.island, width: def.width, samples, cum, length: L, bbox: { minX, maxX, minZ, maxZ } };
}

const _built = new Map();
export function getPath(id) {
  if (_built.has(id)) return _built.get(id);
  const def = PATHS.find((p) => p.id === id);
  if (!def) return null;
  const b = buildPath(def);
  _built.set(id, b);
  return b;
}
export const pathsOf = (islandId) => PATHS.filter((p) => p.island === islandId).map((p) => getPath(p.id));

export const pathWorld = (island, p) => p.samples.map(([x, z]) => [island.x + x, island.z + z]);

/** Thin polylines of every path of an island, world coordinates (the "lanes" the placement keeps clear). */
export function pathPolylines(island, spacing = 3) {
  const every = Math.max(1, Math.round(spacing / STEP));
  return pathsOf(island.id).filter((p) => p.def.lane !== false).map((p) => {
    const w = pathWorld(island, p);
    const out = w.filter((_, i) => i % every === 0);
    if (out[out.length - 1] !== w[w.length - 1]) out.push(w[w.length - 1]);
    return out;
  });
}

/** Distance from a WORLD point to the path's centre line. */
export function pathDist(island, p, x, z) {
  const lx = x - island.x, lz = z - island.z, S = p.samples;
  let best = Infinity;
  for (let i = 0; i + 1 < S.length; i++) {
    const ax = S[i][0], az = S[i][1], dx = S[i + 1][0] - ax, dz = S[i + 1][1] - az;
    const l2 = dx * dx + dz * dz || 1;
    let u = ((lx - ax) * dx + (lz - az) * dz) / l2;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const d = Math.hypot(lx - (ax + dx * u), lz - (az + dz * u));
    if (d < best) best = d;
  }
  return best;
}

/** Paint weight 0..1 of a path at distance d from its centre line. */
export const pathWeightAt = (p, d) => 1 - sstep(p.width * CORE, p.width * EDGE, d);

/** The strongest paint of any path of this island at a WORLD point: { w, surface } (w = 0 when none is near). */
export function pathPaint(island, x, z) {
  const lx = x - island.x, lz = z - island.z;
  let w = 0, surface = null;
  for (const p of pathsOf(island.id)) {
    const e = p.width * EDGE, b = p.bbox;
    if (lx < b.minX - e || lx > b.maxX + e || lz < b.minZ - e || lz > b.maxZ + e) continue;
    const k = pathWeightAt(p, pathDist(island, p, x, z));
    if (k > w) { w = k; surface = p.def.surface; }
  }
  return { w, surface };
}

/** A WORLD point `s` u along the path (clamped), `lateral` u to the right of the walking direction. */
export function pointAt(island, p, s, lateral = 0) {
  const S = p.samples, C = p.cum;
  s = Math.max(0, Math.min(p.length, s));
  let i = 0;
  while (i + 2 < C.length && C[i + 1] < s) i++;
  const k = C[i + 1] > C[i] ? (s - C[i]) / (C[i + 1] - C[i]) : 0;
  const x = S[i][0] + (S[i + 1][0] - S[i][0]) * k, z = S[i][1] + (S[i + 1][1] - S[i][1]) * k;
  const tl = Math.hypot(S[i + 1][0] - S[i][0], S[i + 1][1] - S[i][1]) || 1;
  const tx = (S[i + 1][0] - S[i][0]) / tl, tz = (S[i + 1][1] - S[i][1]) / tl;
  // "right of the walking direction" in a +z-is-south map: rotate the tangent by +90 deg (x east, z south => right-hand side)
  const rx = -tz, rz = tx;
  return { x: island.x + x + rx * lateral, z: island.z + z + rz * lateral, tx, tz };
}

/** Lantern posts along a path: every def.marker.every u (first one `every` u in, none in the last 7 u), alternating sides, `side` u from the centre line. */
export function pathMarkers(island, p) {
  const m = p.def.marker;
  if (!m) return [];
  const out = [];
  for (let s = m.every * 0.8, i = 0; s < p.length - 7; s += m.every, i++) {
    const side = i % 2 ? -1 : 1;
    const q = pointAt(island, p, s, side * m.side);
    out.push({ x: q.x, z: q.z, s, side, tx: side * q.tz, tz: -side * q.tx });     // (tx, tz) = unit vector from the post towards the trail's centre line
  }
  return out;
}

/** Debug / tests. */
export function pathSummary() {
  return PATHS.map((def) => { const p = getPath(def.id); return { id: p.id, island: p.island, length: +p.length.toFixed(1), samples: p.samples.length, width: p.width, surface: def.surface }; });
}
