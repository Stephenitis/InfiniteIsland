// Duskcrown's giant and titan mushrooms (Step 69c): the pure, seeded PLACEMENT. No three.js; gameplay (duskWorld.js: stem colliders), the visuals (duskVisuals.js) and the tests share it.
// It reads the terrain and the layout, it never changes them (the terrain / layout hash pins are untouched).
//
//   const p = buildDuskPlacement(island, mod)           cached per height module
//   p.items      every mushroom { id, kind, x, z, y, rot, s, baseR, capR, capUnder, capTop, ... } (world coordinates, y = the ground under the stem); giants first, then titans
//   p.giants / p.titans                                  the same records split by class (titan = kind 'titan')
//   p.lanes      the reserved walking lanes (world polylines [[x, z], ...] from the landing): stems keep LANE_HALF + their radius off them; 69d and later steps reuse them
//   p.groves     [{ x, z, n }]  the densest clusters (debug goto 'duskGrove'); p.spots { grove, titans }  safe stand points (world) or null
//   p.hash()     short digest of the plan (determinism pin);  p.summary()  counts for the debug panel
//   MUSH         the shape table shared with duskAssets.js (base size at scale 1: stem, cap, tiers) and the scale range of each kind
//   fadeRecord(item)  -> { id, x, z, r, y0, y1 }  the cap volume the canopy fade tests (see duskFade.js)
//
// Rules: stems stand on dry 'marsh' only, off the landing beach (34 u + radius), the reserved notch, every pond and its mud shelf, the lagoon, the streams, the cliff-foot band and the
// lanes; giants form groves (low-frequency noise); TITANS (caps 16-22 u up) stand only in the strip along the cliff foot or along the coast, where the gameplay camera does not need to pass under them.
import { createNoise2D } from '../../utils/noise.js';
import { mulberry32 } from '../../utils/rng.js';
import { polyDist } from './scatter.js';
import { CLIFF_W } from './duskLayout.js';

export const LANE_HALF = 4.0;                 // a lane's half width (stems keep this + their own radius clear)
export const COUNTS = { giants: 56, titans: 10 };

/** Base shapes at scale 1 (units). stemH = height of the underside above the ground; the cap rises capH above its rim; tiers = side caps on the stem [{ y, r, a }]. */
export const MUSH = {
  'giant-a': { stemR: 0.85, baseR: 1.4, stemH: 3.4, capR: 3.6, capH: 1.8, bulge: 1.05, bulbs: 5, scale: [0.85, 1.45], tallScale: [0.95, 1.35], tallY: 1.45, tiers: [] },
  'giant-b': { stemR: 0.95, baseR: 1.6, stemH: 3.0, capR: 4.4, capH: 2.0, bulge: 1.2, bulbs: 7, scale: [0.9, 1.4], tallScale: [0.95, 1.35], tallY: 1.45, tiers: [{ y: 1.3, r: 1.5, a: 0.7 }, { y: 2.0, r: 1.15, a: 3.9 }] },
  titan: { stemR: 2.2, baseR: 3.6, stemH: 15.2, capR: 9.6, capH: 4.6, bulge: 2.5, bulbs: 12, scale: [0.8, 1.1], tiers: [{ y: 5.0, r: 3.2, a: 0.4 }, { y: 8.5, r: 2.8, a: 2.6 }, { y: 11.5, r: 2.4, a: 4.8 }] },
};
export const RIM_LIFT = 0.2;                  // the cap's rim sits this far above the underside centre (so the underside is a shallow dish)

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const cache = new WeakMap();

/** Walkability BFS from the landing (2 u steps would be slow: 3 u), then a route to the reachable point nearest each target. Lanes are world polylines, landing first. */
function duskLanes(island, mod, L) {
  const step = 3, half = L.bounds, key = (x, z) => `${x},${z}`, cx = island.x, cz = island.z;
  const start = [Math.round(L.landing.x / step) * step, Math.round(L.landing.z / step) * step];
  const valid = new Map();
  const ok = (x, z) => {
    const k = key(x, z);
    if (!valid.has(k)) valid.set(k, Math.abs(x) < half.halfX - 6 && Math.abs(z) < half.halfZ - 6 && L.cliffC(x, z) < -2 && mod.height(cx + x, cz + z) > 0.15 && mod.walkable(cx + x, cz + z));
    return valid.get(k);
  };
  const queue = [start], parents = new Map([[key(...start), null]]);
  for (let i = 0; i < queue.length; i++) {
    const [x, z] = queue[i];
    for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const nx = x + dx, nz = z + dz, k = key(nx, nz);
      if (parents.has(k) || !ok(nx, nz) || !mod.walkable(cx + x + dx / 2, cz + z + dz / 2)) continue;
      parents.set(k, [x, z]); queue.push([nx, nz]);
    }
  }
  const route = (tx, tz) => {
    let end = queue.reduce((a, b) => (Math.hypot(a[0] - tx, a[1] - tz) <= Math.hypot(b[0] - tx, b[1] - tz) ? a : b));
    const lane = [];
    while (end) { lane.push([cx + end[0], cz + end[1]]); end = parents.get(key(...end)); }
    return lane.reverse();
  };
  const lg = L.lagoon;
  const targets = [
    [lg.x - lg.rx * 1.35, lg.z],                                          // the lagoon's west shore
    [L.notch.x, L.cliffZAt(L.notch.x) + 11],                              // below the reserved notch
    ...L.streams.map((s) => [s.pts[0][0], s.pts[0][1] + 6]),                // the foot of each waterfall's stream
    [-140, 42], [124, 74],                                                // the west lobe, the south-east corner
    [lg.x + lg.rx * 0.2, lg.z + lg.rz * 1.45],                             // south of the lagoon
  ];
  return targets.map(([tx, tz]) => [[cx + L.landing.x, cz + L.landing.z], ...route(tx, tz)]);
}

export function buildDuskPlacement(island, mod) {
  if (cache.has(mod)) return cache.get(mod);
  const L = mod.layout, cx = island.x, cz = island.z;
  const lanes = duskLanes(island, mod, L);
  const rng = mulberry32((island.seed + 6901) >>> 0);
  const nGrove = createNoise2D(island.seed + 6907), nBand = createNoise2D(island.seed + 6911);
  const lg = L.lagoon, lgMin = Math.min(lg.rx, lg.rz);
  const laneBox = lanes.map((l) => ({ l, x0: Math.min(...l.map((q) => q[0])), x1: Math.max(...l.map((q) => q[0])), z0: Math.min(...l.map((q) => q[1])), z1: Math.max(...l.map((q) => q[1])) }));
  const nearLane = (x, z, d) => laneBox.some((b) => x > b.x0 - d && x < b.x1 + d && z > b.z0 - d && z < b.z1 + d && polyDist(b.l, x, z) < d);

  // ---- the shared keep-clear test (island-local x / z, `r` = the stem's base radius)
  function clearOf(lx, lz, r) {
    if (Math.hypot(lx - L.landing.x, lz - L.landing.z) < 30 + r) return false;
    if (Math.hypot(lx - L.notch.x, lz - L.notch.z) < 24 + r) return false;
    if (L.cliffC(lx, lz) > -(0.8 * r + CLIFF_W + 2.2)) return false;                      // the cliff wall + its foot band (the cliff line is noisy by 1.5)
    if (L.lagoonS(lx, lz) < 1.3 + (0.7 * r + 3) / lgMin) return false;
    for (const p of L.ponds) if (Math.hypot(lx - p.x, lz - p.z) < p.r * 1.3 + 0.8 * r + 0.8) return false;
    for (const s of L.streams) for (let k = 0; k < s.pts.length - 1; k++) {
      const a = s.pts[k], b = s.pts[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
      const u = clamp01(((lx - a[0]) * dx + (lz - a[1]) * dz) / l2);
      if (Math.hypot(lx - a[0] - dx * u, lz - a[1] - dz * u) < 4.8 + 0.5 * r) return false;
    }
    const wx = cx + lx, wz = cz + lz;
    if (mod.groundType(wx, wz) !== 'marsh') return false;
    if (nearLane(wx, wz, LANE_HALF + 0.6 * r)) return false;
    const h = mod.height(wx, wz);
    for (let i = 0; i < 6; i++) {                                                   // a ring of dry, level-ish ground round the base
      const a = i * Math.PI / 3, px = wx + Math.cos(a) * (r + 0.8), pz = wz + Math.sin(a) * (r + 0.8);
      const t = mod.groundType(px, pz);
      if (t === 'water' || t === 'rock' || t === 'sand' || t === 'wetsand' || Math.abs(mod.height(px, pz) - h) > 0.7) return false;
    }
    return true;
  }
  const rec = (kind, lx, lz) => {
    const m = MUSH[kind], tall = kind !== 'titan' && rng() < 0.5, sr = tall ? m.tallScale : m.scale;     // about half the giants are the tall class (old heights), mixed within groves
    const s = sr[0] + (sr[1] - sr[0]) * rng(), sy = tall ? s * m.tallY : s, tint = rng();
    const wx = cx + lx, wz = cz + lz, y = mod.height(wx, wz);
    return {
      kind, x: +wx.toFixed(2), z: +wz.toFixed(2), y: +y.toFixed(3), rot: +(rng() * Math.PI * 2).toFixed(3), s: +s.toFixed(3), sy: +sy.toFixed(3), tall, tint: +tint.toFixed(3),
      baseR: +(m.baseR * s).toFixed(2), stemR: +(m.stemR * s).toFixed(2), capR: +(m.capR * s).toFixed(2),
      capUnder: +(y + (m.stemH - 0.6 * m.bulge) * sy).toFixed(2), capTop: +(y + (m.stemH + RIM_LIFT + m.capH) * sy).toFixed(2),
    };
  };
  const apart = (list, kind, lx, lz) => {                                           // caps may touch but stems keep a walkable gap
    const m = MUSH[kind];
    return list.every((o) => {
      const om = MUSH[o.kind], dx = cx + lx - o.x, dz = cz + lz - o.z, d2 = dx * dx + dz * dz, a = m.baseR * 1.2 + o.baseR + 2.2, b = 0.38 * (m.capR + om.capR);
      return d2 > a * a && d2 > b * b;
    });
  };

  // ---- titans: along the cliff foot (10..34 u from the wall) or the coast (11..30 u inland)
  const titans = [];
  for (let tries = 0; tries < 60000 && titans.length < COUNTS.titans; tries++) {
    const lx = -176 + rng() * 352, lz = 4 + rng() * 122;
    const c = L.cliffC(lx, lz), t = L.coastT(lx, lz);
    const foot = c < -10.5 && c > -34, coast = t > 12 && t < 30 && lz > 30;
    if (!foot && !coast) continue;
    if (nBand(lx * 0.02, lz * 0.02) < -0.35) continue;                               // not an unbroken wall of them
    if (titans.some((o) => Math.hypot(cx + lx - o.x, cz + lz - o.z) < 22)) continue;
    if (!clearOf(lx, lz, MUSH.titan.baseR * MUSH.titan.scale[1])) continue;
    titans.push(rec('titan', lx, lz));
  }
  // ---- giants: groves across the marsh
  const giants = [];
  for (let tries = 0; tries < 160000 && giants.length < COUNTS.giants; tries++) {
    const lx = -176 + rng() * 352, lz = 12 + rng() * 118;
    const kind = rng() < 0.45 ? 'giant-b' : 'giant-a';
    const grove = nGrove(lx * 0.022 + 1.3, lz * 0.022 - 0.7) + 0.4 * nGrove(lx * 0.06, lz * 0.06);
    if (grove < -0.18) continue;
    const m = MUSH[kind];
    if (!apart(giants, kind, lx, lz) || !apart(titans, kind, lx, lz)) continue;
    if (!clearOf(lx, lz, m.baseR * m.scale[1])) continue;
    giants.push(rec(kind, lx, lz));
  }
  giants.forEach((g, i) => { g.id = `dusk-giant-${String(i + 1).padStart(3, '0')}`; });
  titans.forEach((g, i) => { g.id = `dusk-titan-${String(i + 1).padStart(2, '0')}`; });
  const items = [...giants, ...titans];

  // ---- the densest groves (giants within 16 u of each giant); a debug stand point in the thick of the biggest one
  const groves = giants.map((g) => ({ x: g.x, z: g.z, n: giants.filter((o) => Math.hypot(o.x - g.x, o.z - g.z) < 16).length })).sort((a, b) => b.n - a.n || a.x - b.x);
  const standNear = (x, z, avoid) => {
    for (let r = 0; r < 30; r += 1.5) for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (mod.groundType(px, pz) !== 'marsh' || !mod.walkable(px, pz)) continue;
      if (items.some((o) => Math.hypot(px - o.x, pz - o.z) < o.baseR + 1.6)) continue;
      if (lanes.length && avoid === 'lane' && !lanes.some((l) => polyDist(l, px, pz) < 2)) continue;
      return { x: +px.toFixed(2), z: +pz.toFixed(2) };
    }
    return null;
  };
  const spots = { grove: groves.length ? standNear(groves[0].x, groves[0].z + 5) : null, titans: null };
  if (titans.length) {                                                              // the titan nearest the cliff foot's middle, stood on its south side
    const t = titans.reduce((a, b) => (Math.abs(a.x + 40) <= Math.abs(b.x + 40) ? a : b));
    spots.titans = standNear(t.x, t.z + t.baseR + 6);
  }

  function hash() {
    let h = 2166136261 >>> 0;
    const mix = (v) => { const n = Math.round(v * 100); h = Math.imul(h ^ (n & 0xffff), 16777619) >>> 0; h = Math.imul(h ^ (n >> 16), 16777619) >>> 0; };
    for (const o of items) { mix(o.kind === 'titan' ? 3 : o.kind === 'giant-b' ? 2 : 1); mix(o.x); mix(o.z); mix(o.s); mix(o.sy); mix(o.rot); }
    for (const l of lanes) for (const q of l) { mix(q[0]); mix(q[1]); }
    return h.toString(16).padStart(8, '0');
  }
  const out = {
    items, giants, titans, lanes, groves: groves.slice(0, 5), spots, hash, laneHalf: LANE_HALF,
    summary: () => ({ giants: giants.length, giantA: giants.filter((g) => g.kind === 'giant-a').length, giantB: giants.filter((g) => g.kind === 'giant-b').length, titans: titans.length, lanes: lanes.length, hash: hash(), spots }),
  };
  cache.set(mod, out);
  return out;
}

/** The cap volume the canopy fade tests: a vertical cylinder (radius r, from the underside y0 to the top y1). */
export function fadeRecord(item) {
  return { id: item.id, x: item.x, z: item.z, r: item.capR * 0.92, y0: item.capUnder - 0.3, y1: item.capTop };
}
