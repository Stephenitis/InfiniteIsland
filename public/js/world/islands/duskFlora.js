// Ambient Glowcap Marsh placement (69d), pure and cached per terrain module. No gameplay state or Three.js.
// buildDuskFlora(island, mod) -> { layers, solids, falls, pondSpot, hash(), summary() } in world coordinates.
// Ground footprints keep the 69c lanes, landing, notch, water and cliff clear; lilies alone float on inland water.
// cliffSurface(mod, island, x, z, y) projects a shelf/fall onto the actual noisy wall, below the hidden rim.
import { DUSK_SMALL, WATER_LEVEL } from '../../config.js';
import { mulberry32 } from '../../utils/rng.js';
import { polyDist } from './scatter.js';
import { buildDuskPlacement, LANE_HALF } from './duskPlacement.js';

const cache = new WeakMap();
export function cliffSurface(mod, island, x, z, y) {
  const L = mod.layout, e = 0.5;
  const dx = L.cliffC(x + e, z) - L.cliffC(x - e, z), dz = L.cliffC(x, z + e) - L.cliffC(x, z - e);
  const len = Math.hypot(dx, dz) || 1, nx = dx / len, nz = dz / len;
  let lo = -7, hi = 8;
  for (let k = 0; k < 24; k++) {
    const t = (lo + hi) / 2;
    if (mod.height(island.x + x + nx * t, island.z + z + nz * t) < y) lo = t; else hi = t;
  }
  return { x: island.x + x + nx * lo, z: island.z + z + nz * lo, nx, nz };
}

export function buildDuskFlora(island, mod) {
  if (cache.has(mod)) return cache.get(mod);
  const L = mod.layout, P = buildDuskPlacement(island, mod), rng = mulberry32(island.seed + 6941);
  const layers = Object.fromEntries(Object.keys(DUSK_SMALL.counts).map((k) => [k, []]));
  const solid = new Set(['stump', 'log', 'rock']);
  const footprints = DUSK_SMALL.footprints;
  const safe = (x, z, r, water = false) => {
    const lx = x - island.x, lz = z - island.z;
    if (Math.hypot(lx - L.landing.x, lz - L.landing.z) < 30 + r || Math.hypot(lx - L.notch.x, lz - L.notch.z) < 24 + r) return false;
    if (L.cliffC(lx, lz) > -6 - r || L.coastT(lx, lz) < 7 + r) return false;
    if (P.lanes.some((l) => polyDist(l, x, z) < LANE_HALF + r)) return false;
    if (water) return true;
    if (P.items.some((p) => Math.hypot(x - p.x, z - p.z) < p.baseR + r + 0.3)) return false;
    const h = mod.height(x, z);
    for (let k = 0; k < 9; k++) {
      const a = k * Math.PI / 4, px = x + (k === 8 ? 0 : Math.cos(a) * r), pz = z + (k === 8 ? 0 : Math.sin(a) * r);
      if (mod.height(px, pz) < WATER_LEVEL + 0.05 || !mod.walkable(px, pz) || Math.abs(mod.height(px, pz) - h) > 0.5) return false;
      if (!['marsh', 'mud'].includes(mod.groundType(px, pz))) return false;
    }
    return true;
  };
  const surfaces = [...L.ponds.map((p) => ({ ...p, rx: p.r, rz: p.r })), { ...L.lagoon, id: 'dusk-lagoon' }];
  const record = (kind, x, z, s, extra = {}) => ({ id: `dusk-${kind}-${layers[kind].length + 1}`, kind, x, z, y: mod.height(x, z), rot: rng() * Math.PI * 2, s, r: footprints[kind] * s, ...extra });
  const solids = [];
  // A few tight local clumps, then scattered clumps across the marsh. A single instance draws a whole clump.
  for (const kind of Object.keys(layers).filter((k) => !['reed', 'lily', 'shelf'].includes(k))) {
    for (let t = 0; t < 24000 && layers[kind].length < DUSK_SMALL.counts[kind]; t++) {
      const x = island.x - 172 + rng() * 344, z = island.z + 8 + rng() * 110, s = 0.7 + rng() * 0.55, r = footprints[kind] * s;
      if (!safe(x, z, r)) continue;
      if (solids.some((p) => Math.hypot(x - p.x, z - p.z) < r + p.r + 0.5)) continue;
      const it = record(kind, x, z, s); layers[kind].push(it); if (solid.has(kind)) solids.push(it);
    }
  }
  for (let t = 0; t < 32000 && layers.reed.length < DUSK_SMALL.counts.reed; t++) {
    const a = rng() * Math.PI * 2, b = surfaces[Math.floor(rng() * surfaces.length)], s = 0.7 + rng() * 0.5;
    let x = island.x + b.x + Math.cos(a) * b.rx * (1.04 + rng() * 0.2), z = island.z + b.z + Math.sin(a) * b.rz * (1.04 + rng() * 0.2);
    if (t % 3 === 0) { // Stream banks get their own share, including long reaches between chain ponds.
      const stream = L.streams[Math.floor(rng() * L.streams.length)], k = Math.floor(rng() * (stream.pts.length - 1));
      const p = stream.pts[k], q = stream.pts[k + 1], u = rng(), dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz), side = rng() < 0.5 ? -1 : 1;
      x = island.x + p[0] + dx * u - dz / len * 3.3 * side; z = island.z + p[1] + dz * u + dx / len * 3.3 * side;
    }
    if (safe(x, z, footprints.reed * s)) layers.reed.push(record('reed', x, z, s));
  }
  for (const b of surfaces) {
    const n = b.id === 'dusk-lagoon' ? DUSK_SMALL.lagoonLilies : Math.max(2, Math.round(b.rx * 0.8));
    for (let t = 0, placed = 0; t < 1600 && placed < n && layers.lily.length < DUSK_SMALL.counts.lily; t++) {
      const a = rng() * Math.PI * 2, d = 0.57 + rng() * 0.23, s = 0.65 + rng() * 0.35;
      const x = island.x + b.x + Math.cos(a) * b.rx * d, z = island.z + b.z + Math.sin(a) * b.rz * d, r = footprints.lily * s;
      if (!safe(x, z, r, true) || layers.lily.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + r + 0.15)) continue;
      let wet = true;
      for (let k = 0; k < 9; k++) { const angle = k * Math.PI / 4; if (mod.height(x + (k === 8 ? 0 : Math.cos(angle) * r), z + (k === 8 ? 0 : Math.sin(angle) * r)) > WATER_LEVEL - 0.07) wet = false; }
      if (!wet) continue;
      layers.lily.push(record('lily', x, z, s, { y: WATER_LEVEL + DUSK_SMALL.lilyLift, surface: b.id })); placed++;
    }
  }
  // Shelves anchor to the actual terrain, never float in front of its noisy signed-distance contour.
  for (let t = 0; t < 3000 && layers.shelf.length < DUSK_SMALL.counts.shelf; t++) {
    const k = Math.floor(rng() * (L.cliff.length - 1)), a = L.cliff[k], b = L.cliff[k + 1], u = rng(), x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u;
    if (L.coastT(x, z) < 14 || Math.hypot(x - L.notch.x, z - L.notch.z) < 24 || L.falls.some((f) => Math.hypot(x - f.x, z - f.z) < 4)) continue;
    const y = 5 + rng() * 32, q = cliffSurface(mod, island, x, z, y), s = 0.65 + rng() * 0.8;
    layers.shelf.push({ id: `dusk-shelf-${layers.shelf.length + 1}`, kind: 'shelf', x: q.x, z: q.z, y, rot: Math.atan2(-q.nx, -q.nz), s, r: footprints.shelf * s });
  }
  const falls = L.falls.map((f) => {
    const path = [];
    for (let y = mod.plateauTop - 0.15; y > WATER_LEVEL; y -= 1.5) {
      const q = cliffSurface(mod, island, f.x, f.z, y);
      path.push({ x: q.x - q.nx * 0.22, z: q.z - q.nz * 0.22, y });
    }
    const stream = L.streams.find((s) => s.id === f.id.replace('fall-', 'stream-')) || L.streams[L.falls.indexOf(f)], p = stream.pts[0];
    path.push({ x: island.x + p[0], z: island.z + p[1], y: WATER_LEVEL + 0.04 });
    return { id: f.id, path, foot: path[path.length - 1] };
  });
  const lilyPond = surfaces.find((b) => b.id !== 'dusk-lagoon' && layers.lily.some((l) => l.surface === b.id));
  let pondSpot = null;
  if (lilyPond) {
    for (let k = 0; k < 32 && !pondSpot; k++) {
      const a = k * Math.PI / 16, x = island.x + lilyPond.x + Math.cos(a) * lilyPond.rx * 1.4, z = island.z + lilyPond.z + Math.sin(a) * lilyPond.rz * 1.4;
      if (mod.walkable(x, z) && mod.height(x, z) > WATER_LEVEL && [...solids, ...P.items.map((p) => ({ ...p, r: p.baseR }))].every((p) => Math.hypot(x - p.x, z - p.z) > p.r + 1.5)) pondSpot = { x, z };
    }
  }
  const hash = () => { let h = 2166136261; for (const [kind, items] of Object.entries(layers)) for (const it of items) for (const c of `${kind}:${it.x.toFixed(3)},${it.y.toFixed(3)},${it.z.toFixed(3)},${it.s.toFixed(3)},${it.rot.toFixed(3)};`) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(16).padStart(8, '0'); };
  const out = { layers, solids, falls, pondSpot, hash, summary: () => ({ counts: Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, v.length])), solids: solids.length, falls: falls.length, hash: hash(), pondSpot }) };
  cache.set(mod, out); return out;
}
