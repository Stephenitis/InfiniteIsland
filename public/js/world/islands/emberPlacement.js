// Emberleaf placement is pure and seeded. Gameplay and rebuildable visuals share these records.
// buildEmberPlacement / sampleEmberSpots keep solids off shores, features and connected walking lanes.
import { EMBER_PROPS } from '../../config.js';
import { mulberry32, range } from '../../utils/rng.js';
import { createNoise2D } from '../../utils/noise.js';
import { EMBER_FEATURES as F } from './ember.js';
import { scatter, safeSpot, landingFor, polyDist } from './scatter.js';
import { angleDiff } from './util.js';

export const EMBER_LAYOUT = EMBER_PROPS;
export const EMBER_AREAS = {
  jungle: (mod, x, z) => mod.groundType(x, z) === 'grass' && mod.inland(x, z) > 14 && mod.height(x, z) < 6.5,
  soil: (mod, x, z) => ['grass', 'dirt', 'blacksand'].includes(mod.groundType(x, z)) && mod.inland(x, z) > 5,
};

// A walkability BFS reserves real routes around terrace cliffs rather than straight lines through them.
export function emberLanes(island, mod) {
  const step = 2, start = [-112, -46], key = (x, z) => `${x},${z}`;
  const queue = [start], parents = new Map([[key(...start), null]]);
  const valid = new Map();
  const ok = (x, z) => {
    const k = key(x, z);
    if (!valid.has(k)) valid.set(k, Math.abs(x) <= 116 && Math.abs(z) <= 116 && mod.height(island.x + x, island.z + z) > 0.05 && mod.walkable(island.x + x, island.z + z));
    return valid.get(k);
  };
  for (let i = 0; i < queue.length; i++) {
    const [x, z] = queue[i];
    for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const nx = x + dx, nz = z + dz, k = key(nx, nz);
      if (parents.has(k) || !ok(nx, nz)) continue;
      if (![0.25, 0.5, 0.75].every((u) => mod.walkable(island.x + x + dx * u, island.z + z + dz * u))) continue;
      parents.set(k, [x, z]); queue.push([nx, nz]);
    }
  }
  const targets = [[F.lagoon.x - 15, F.lagoon.z], [F.spring.x, F.spring.z]];
  for (const a of F.rampAngles) for (const d of [43, 14]) targets.push([F.volcano.x + Math.cos(a) * d, F.volcano.z + Math.sin(a) * d]);
  return targets.map(([tx, tz]) => {
    let end = queue.reduce((a, b) => Math.hypot(a[0] - tx, a[1] - tz) < Math.hypot(b[0] - tx, b[1] - tz) ? a : b);
    const lane = [];
    while (end) { lane.push([island.x + end[0], island.z + end[1]]); end = parents.get(key(...end)); }
    lane.reverse();
    lane.unshift([landingFor(island).x, landingFor(island).z]);
    return lane;
  });
}

export function emberForbidden(island, mod, lanes, x, z, pad = 0) {
  const landing = landingFor(island), lx = x - island.x, lz = z - island.z;
  const d = Math.hypot(lx - F.volcano.x, lz - F.volcano.z), a = Math.atan2(lz - F.volcano.z, lx - F.volcano.x);
  return Math.hypot(x - landing.x, z - landing.z) < EMBER_LAYOUT.landingClear + pad
    || Math.hypot(lx - F.lagoon.x, lz - F.lagoon.z) < 15 + pad
    || Math.hypot(lx - F.spring.x, lz - F.spring.z) < 7 + pad
    || d < 26 + pad || (d < 56 && F.rampAngles.some((ra) => angleDiff(a, ra) < 0.46))
    || lanes.some((l) => polyDist(l, x, z) < EMBER_LAYOUT.laneHalf + pad);
}

const cache = new WeakMap();
export function buildEmberPlacement(island, mod) {
  if (cache.has(mod)) return cache.get(mod);
  const lanes = emberLanes(island, mod), solids = [], rng = mulberry32(island.seed + 1001), noise = createNoise2D(island.seed + 500);
  const free = (x, z, r) => solids.every((s) => Math.hypot(s.x - x, s.z - z) > s.r + r + 1);
  const spots = (count, seed, r, types = ['grass'], cluster = false) => scatter(island, {
    seed: island.seed + seed, target: count, minDist: r * 2 + 2, tries: 40000,
    accept(x, z, random) {
      if (emberForbidden(island, mod, lanes, x, z, r) || !free(x, z, r)) return null;
      if (cluster && noise(x * 0.04, z * 0.04) < -0.2 + random() * 0.3) return null;
      return safeSpot(mod, x, z, mod.height(x, z), types, 0.3) ? 'spot' : null;
    },
  });
  const record = (p, layer, r, solid = false) => {
    const s = range(rng, 0.85, 1.25);
    const item = { ...p, layer, variant: layer, y: mod.height(p.x, p.z) - 0.03, rot: rng() * Math.PI * 2, sx: s, sy: s, sz: s, s, r, color: '#ffffff' };
    if (solid) solids.push({ x: p.x, z: p.z, r });
    return item;
  };
  const kinds = ['banana', 'coconut', 'jungle', 'breadfruit'];
  const trees = spots(EMBER_LAYOUT.trees, 1002, 0.65, ['grass'], true).map((p, i) => record(p, kinds[i % 4], 0.65, true));
  trees.push(...spots(EMBER_LAYOUT.bamboo, 1003, 0.55).map((p) => record(p, 'bamboo', 0.55, true)));
  const boulders = spots(EMBER_LAYOUT.boulders, 1004, 1.2, ['grass', 'rock', 'dirt', 'blacksand']).map((p) => {
    const b = record(p, 'basalt', 1.2, true); b.ground = b.y; b.y += 0.62 * b.sy; return b;
  });
  const ferns = spots(EMBER_LAYOUT.ferns, 1005, 0.2).map((p) => record(p, 'fern', 0.2));
  const flowers = spots(EMBER_LAYOUT.flowers, 1006, 0.2).map((p, i) => ({ ...record(p, i % 2 ? 'hibiscus' : 'plumeria', 0.2), interactive: i < 24 }));
  const decor = spots(5, 1007, 1).map((p) => record(p, 'tiki', 1, true));
  const beach = spots(1, 1008, 2, ['sand', 'blacksand']);
  decor.push(...beach.map((p) => record(p, 'canoe', 2, true)));
  const data = { trees, boulders, ferns, flowers, decor, solids, lanes };
  cache.set(mod, data); return data;
}

export function sampleEmberSpots(island, mod, { area = 'jungle', count = 16, seed = 0, r = 0.6, minDist = 4 } = {}) {
  const p = buildEmberPlacement(island, mod), predicate = typeof area === 'function' ? area : EMBER_AREAS[area];
  if (!predicate) throw new Error(`Unknown Emberleaf area: ${area}`);
  return scatter(island, { seed: island.seed + 2000 + seed, target: count, minDist, tries: 40000, accept(x, z) {
    if (emberForbidden(island, mod, p.lanes, x, z, r) || !predicate(mod, x, z, mod.height(x, z))) return null;
    if (p.solids.some((s) => Math.hypot(x - s.x, z - s.z) < s.r + r + 2)) return null;
    return safeSpot(mod, x, z, mod.height(x, z), ['grass', 'dirt', 'blacksand'], 0.3) ? 'spot' : null;
  } }).map((n) => ({ ...n, y: mod.height(n.x, n.z), rot: 0, s: 1 }));
}
