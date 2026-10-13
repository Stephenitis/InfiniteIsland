// Emberleaf placement is pure and seeded. Gameplay and rebuildable visuals share these records.
// buildEmberPlacement / sampleEmberSpots keep solids off shores, features and connected walking lanes.
//
// Step 37a: the terrace garden (a wedge round the middle terraces, emberGarden.js), the garden trail (a lane + its torch posts and two signposts, claimed as solids first) and the
// RESERVED waterfall corridor of Step 37c (fall line, plunge pool, stream) are kept clear of everything (props, gathering spots, tool pickups). The two garden routes (hearth -> each
// volcano ramp's foot) are lanes too, so the garden is reachable from both ramps. All of this reshuffled Emberleaf's seeded placement ONCE (Emberleaf is not saved, so only ids move).
import { EMBER_PROPS, EMBER_GARDEN } from '../../config.js';
import { mulberry32, range } from '../../utils/rng.js';
import { createNoise2D } from '../../utils/noise.js';
import { EMBER_FEATURES as F } from './ember.js';
import { scatter, safeSpot, landingFor, polyDist } from './scatter.js';
import { angleDiff } from './util.js';
import { pathPolylines } from '../paths.js';
import { gardenZone, gardenSigns, gardenPosts, waterfallForbidden, gardenDecor, trellisPoles, gardenReserved } from './emberGarden.js';
import { LAVA_MOUTH, lavaMouthReserved } from './lavaMouth.js';
import { coveReserved } from './emberCove.js';

export const EMBER_LAYOUT = EMBER_PROPS;
export const EMBER_AREAS = {
  jungle: (mod, x, z) => mod.groundType(x, z) === 'grass' && mod.inland(x, z) > 14 && mod.height(x, z) < 6.5,
  soil: (mod, x, z) => ['grass', 'dirt', 'blacksand'].includes(mod.groundType(x, z)) && mod.inland(x, z) > 5,
};

// A walkability BFS reserves real routes around terrace cliffs rather than straight lines through them.
function bfsTree(island, mod, start) {
  const step = 2, key = (x, z) => `${x},${z}`;
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
  // the route (world points, start first) to the reachable grid point nearest (tx, tz)
  return (tx, tz) => {
    let end = queue.reduce((a, b) => Math.hypot(a[0] - tx, a[1] - tz) < Math.hypot(b[0] - tx, b[1] - tz) ? a : b);
    const lane = [];
    while (end) { lane.push([island.x + end[0], island.z + end[1]]); end = parents.get(key(...end)); }
    return lane.reverse();
  };
}

/** The routes: 0-5 from the landing (lagoon, spring, both ramps' 43 u and 14 u points), 6-7 from the garden hearth to each ramp's foot, 8 the garden trail itself. */
export function emberLanes(island, mod) {
  const landing = landingFor(island);
  const fromLanding = bfsTree(island, mod, [-112, -46]);
  const targets = [[F.lagoon.x - 15, F.lagoon.z], [F.spring.x, F.spring.z]];
  for (const a of F.rampAngles) for (const d of [43, 14]) targets.push([F.volcano.x + Math.cos(a) * d, F.volcano.z + Math.sin(a) * d]);
  const lanes = targets.map(([tx, tz]) => [[landing.x, landing.z], ...fromLanding(tx, tz)]);
  const fromGarden = bfsTree(island, mod, [Math.round(EMBER_GARDEN.x / 2) * 2, Math.round(EMBER_GARDEN.z / 2) * 2 + 2]);
  for (const a of F.rampAngles) lanes.push(fromGarden(F.volcano.x + Math.cos(a) * 43, F.volcano.z + Math.sin(a) * 43));
  lanes.push(...pathPolylines(island));                                   // the garden trail (a lane of its own, 3 u spacing)
  return lanes;
}

export function emberForbidden(island, mod, lanes, x, z, pad = 0) {
  const landing = landingFor(island), lx = x - island.x, lz = z - island.z;
  const d = Math.hypot(lx - F.volcano.x, lz - F.volcano.z), a = Math.atan2(lz - F.volcano.z, lx - F.volcano.x);
  return Math.hypot(x - landing.x, z - landing.z) < EMBER_LAYOUT.landingClear + pad
    || Math.hypot(lx - F.lagoon.x, lz - F.lagoon.z) < 15 + pad
    || Math.hypot(lx - F.spring.x, lz - F.spring.z) < 7 + pad
    || d < 26 + pad || (d < 56 && F.rampAngles.some((ra) => angleDiff(a, ra) < 0.46))
    || gardenZone(island, x, z, pad) || waterfallForbidden(island, x, z, pad)
    || lanes.some((l) => polyDist(l, x, z) < EMBER_LAYOUT.laneHalf + pad);
}

const cache = new WeakMap();
export function buildEmberPlacement(island, mod) {
  if (cache.has(mod)) return cache.get(mod);
  const lanes = emberLanes(island, mod), solids = [], rng = mulberry32(island.seed + 1001), noise = createNoise2D(island.seed + 500);
  const free = (x, z, r) => solids.every((s) => Math.hypot(s.x - x, s.z - z) > s.r + r + 1);
  // the trail's torch posts and the two signposts first (nothing may land on them), then the trellis poles of the garden's bare site
  const signs = gardenSigns(island), posts = gardenPosts(island, mod);
  for (const q of posts) solids.push({ x: q.x, z: q.z, r: 0.3 });
  for (const q of signs) solids.push({ x: q.x, z: q.z, r: 0.6 });
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
  const garden = gardenDecor(island, mod), trellis = { ...garden.trellis, poleList: trellisPoles(island, mod, garden.trellis) };
  const reserved = gardenReserved(island, mod);                           // Step 37b: the 16 plots + Mossback's spot (the visuals draw the beds, world/garden.js + world/mossback.js own the gameplay)
  // Step 60: Cinder Tubes' mouth stands in a CLEARING of this placement (nothing above moved: test/cinder.test.js compares the hashes); claiming it last keeps it that way and everything that
  // is placed or respawned later (dig spots, seeds) keeps off it through lavaMouthReserved
  solids.push({ x: LAVA_MOUTH.x, z: LAVA_MOUTH.z, r: LAVA_MOUTH.keepClear - 0.5 });
  const data = { trees, boulders, ferns, flowers, decor, solids, lanes, signs, posts, garden: { stones: garden.stones, weeds: garden.weeds, trellis, plots: reserved.plots, mossback: reserved.mossback } };
  cache.set(mod, data); return data;
}

export function sampleEmberSpots(island, mod, { area = 'jungle', count = 16, seed = 0, r = 0.6, minDist = 4 } = {}) {
  const p = buildEmberPlacement(island, mod), predicate = typeof area === 'function' ? area : EMBER_AREAS[area];
  if (!predicate) throw new Error(`Unknown Emberleaf area: ${area}`);
  return scatter(island, { seed: island.seed + 2000 + seed, target: count, minDist, tries: 40000, accept(x, z) {
    if (emberForbidden(island, mod, p.lanes, x, z, r) || lavaMouthReserved(x, z, r) || !predicate(mod, x, z, mod.height(x, z))) return null;
    if (p.solids.some((s) => Math.hypot(x - s.x, z - s.z) < s.r + r + 2)) return null;
    return safeSpot(mod, x, z, mod.height(x, z), ['grass', 'dirt', 'blacksand'], 0.3) ? 'spot' : null;
  } }).filter((n) => !coveReserved(n.x, n.z, r, island)).map((n) => ({ ...n, y: mod.height(n.x, n.z), rot: 0, s: 1 }));
}
