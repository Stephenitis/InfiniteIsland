// Frostpine Isle props, PLACEMENT only (Step 29a). Pure + seeded from the island seed (no three.js, no registries), so every screen computes
// the same trees / boulders / flowers, a visuals rebuild can never move anything, and the Node tests can check the rules.
//   buildFrostPlacement(island, mod) -> {
//     trees:    [{ layer, variant, snow, x, y, z, rot, sx, sy, r, color }]  choppable (variant 'spruce' | 'pine' | 'sapling' | 'birch'; layer = mesh kind:
//                                  'spruce' | 'spruceSnow' | 'pine' | 'pineSnow' | 'birch'). Saplings reuse the pine / spruce mesh, small.
//     boulders: [{ layer, snow, x, y, z, ground, rot, sx, sy, sz, r, color }] breakable granite ('boulder' | 'boulderSnow'); y = mesh centre, ground = terrain under it
//     flowers:  [{ layer, x, y, z, rot, s, color, interactive }]            'edelweiss' | 'gentian'; `interactive` ones boing (type 'flower')
//     tufts:    [{ x, y, z, rot, s, color }]                                snowy grass / heather, decorative
//     logs:     [{ x, y, z, rot, s, r, circles }]                           fallen logs (colliders: `circles` = [[x, z], ...] world centres of radius r)
//     spires:   [{ x, y, z, rot, s, r }]                                    icicle-rock clusters near the peaks and the lake
//     reeds:    [{ x, y, z, rot, s }]                                       frozen cattails round the lake
//     snowmen:  [{ x, y, z, rot, s, look, r }]                              decorative snowmen (look 0..2 = scarf colour)
//     solids:   [{ x, z, r }]                                               everything solid above, for spot sampling
//   }
// Rules (all tested in test/frostPlacement.test.js): nothing within LANDING_CLEAR of the bridge landing, on the frozen lake / its banks, on the
// plateau ramps, on the walking lanes that connect landing -> south ramp / lake / east + west ramps (FROST_LANES), on steep ground or on the
// beach tier (trees, boulders). Open glades come from a low-frequency "forest clump" noise, so the forest is dense in places and empty in others.
//
// 29b hooks: FROST_AREAS (named spawn areas) + sampleFrostSpots() pick valid ground per area for gathering spots (bushes, herbs, mushrooms, dig spots).
import { mulberry32, range } from '../../utils/rng.js';
import { createNoise2D } from '../../utils/noise.js';
import { FROST_FEATURES } from './frost.js';
import { scatter, safeSpot, landingFor, polyDist } from './scatter.js';
import { angleDiff } from './util.js';

const TAU = Math.PI * 2;
export const LANDING_CLEAR = 14;        // u: nothing stands within this distance of the bridge landing
export const LANE_HALF = 3.4;           // u: half width of the walking lanes (trees / boulders keep this + their radius away)
export const LAKE_CLEAR = 12.6;         // lakeDist (see frost.js): props stay outside the ice and its banks (reeds / birches sit just outside)

/** Walking lanes, island-local [x, z] (x east, z south): landing -> south ramp, -> lake, and from the south ramp foot to the east / west ramps. */
export const FROST_LANES_LOCAL = [
  [[9.5, 114.5], [9.5, 10], [7.5, 0], [0, -7]],
  [[9.5, 66], [18, 66], [28, 56], [38, 46]],
  [[0, -7], [20, -7], [30, -15], [34, -25], [34, -35], [36.6, -38.5]],
  [[0, -7], [-20, -7], [-30, -17], [-38, -27], [-40, -37], [-40, -47], [-36, -57]],   // (waypoints from a walkability BFS with clearance: the west ramp foot is reached round the plateau's west cliff)
];
export function frostLanes(island) {
  return FROST_LANES_LOCAL.map((l) => l.map(([x, z]) => [island.x + x, island.z + z]));
}

// Near-white tints (multiplied with the baked vertex colours) give every tree its own shade without extra materials / geometry.
const GREEN_TINTS = ['#ffffff', '#eaffe9', '#dcf5ff', '#f2ffe0', '#e4ffef'];
const BIRCH_TINTS = ['#ffffff', '#fffbd9', '#f0ffd0', '#ffeec2'];
const ROCK_TINTS = ['#ffffff', '#eef2ff', '#e0e8fa', '#f6f2ff'];
const FLOWER_TINTS = ['#ffffff', '#fffbe8', '#f2f7ff'];
const pickOf = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

/** Named areas for gathering-spot placement (29b). Each is a predicate on the island module + position. */
export const FROST_AREAS = {
  meadow: (mod, x, z, h) => mod.groundType(x, z) === 'grass' && h >= 1.0 && h < 2.4 && mod.inland(x, z) >= 13,
  forest: (mod, x, z, h) => mod.groundType(x, z) === 'grass' && h >= 2.4 && h < 6.0,
  snowfield: (mod, x, z, h) => mod.groundType(x, z) === 'snow' && h >= 5.5,
  lakeShore: (mod, x, z, h) => mod.groundType(x, z) === 'grass' && mod.lakeDist(x, z) > LAKE_CLEAR && mod.lakeDist(x, z) < 20,
  anyGround: (mod, x, z, h) => { const g = mod.groundType(x, z); return (g === 'grass' || g === 'snow') && h >= 1.0 && mod.inland(x, z) >= 11; },
};

const _cache = new Map();
export function buildFrostPlacement(island, mod) {
  if (_cache.has(island.id)) return _cache.get(island.id);
  const F = FROST_FEATURES, cx = island.x, cz = island.z;
  const landing = landingFor(island);
  const lanes = frostLanes(island);
  const cluster = createNoise2D(island.seed + 500);
  const laneD = (x, z) => { let d = Infinity; for (const l of lanes) d = Math.min(d, polyDist(l, x, z)); return d; };
  const nearRamp = (x, z) => {                       // the three plateau ramps and the cliff foot in front of them stay clear
    const dx = x - cx - F.plateau.x, dz = z - cz - F.plateau.z, d = Math.hypot(dx, dz);
    if (d < F.plateau.r - 22 || d > F.plateau.r + 15) return false;
    const a = Math.atan2(dz, dx);
    return F.rampAngles.some((ra) => angleDiff(a, ra) < 0.42);
  };
  const forbidden = (x, z, pad = 0) => (
    (landing && Math.hypot(x - landing.x, z - landing.z) < LANDING_CLEAR + pad)
    || mod.lakeDist(x, z) < LAKE_CLEAR + pad * 0.3
    || nearRamp(x, z)
  );

  const solids = [];
  const freeOfSolids = (x, z, r, gap = 0.5) => {
    for (let i = 0; i < solids.length; i++) {
      const o = solids[i], m = r + o.r + gap;
      const dx = x - o.x, dz = z - o.z;
      if (dx * dx + dz * dz < m * m) return false;
    }
    return true;
  };
  const claim = (x, z, r) => solids.push({ x, z, r });

  // ---------------------------------------------------------------------------------------- conifers
  const rngT = mulberry32(island.seed + 1001);
  const conifers = scatter(island, {
    seed: island.seed + 1002, target: 96, minDist: 4.2, tries: 40000,
    accept(x, z, rng) {
      if (forbidden(x, z, 2)) return null;
      const t = mod.inland(x, z);
      if (t < 13) return null;                                       // not on the beach tier
      const h = mod.height(x, z);
      if (h < 1.0 || h > 9.0) return null;
      const n = cluster(x * 0.038, z * 0.038) * 0.5 + 0.5;          // forest clumps with glades between
      const dense = h < 2.4 ? 0.6 : h > 6.2 ? 0.46 : 0.36;          // sparse on the meadow, dense in the foothill forest
      if (n < dense + 0.28 * rng()) return null;
      if (laneD(x, z) < LANE_HALF + 0.8) return null;
      if (!safeSpot(mod, x, z, h, ['grass', 'snow'], 0.3)) return null;
      return h;                                                       // (the scatter helper only needs a truthy "kind")
    },
  });
  const trees = [];
  const addConifer = (c) => {
    const h = mod.height(c.x, c.z);
    const snow = mod.groundType(c.x, c.z) === 'snow' || h > 6.2;
    const roll = rngT();
    let variant;
    if (h < 2.4) variant = roll < 0.3 ? 'sapling' : roll < 0.75 ? 'pine' : 'spruce';
    else if (h > 6.2) variant = roll < 0.12 ? 'sapling' : roll < 0.62 ? 'spruce' : 'pine';
    else variant = roll < 0.1 ? 'sapling' : roll < 0.62 ? 'spruce' : 'pine';
    const shape = variant === 'sapling' ? (rngT() < 0.5 ? 'pine' : 'spruce') : variant;
    let sx, sy;
    if (variant === 'sapling') { sx = range(rngT, 0.38, 0.52); sy = sx * range(rngT, 1.0, 1.2); }
    else if (variant === 'spruce') { sx = range(rngT, 0.72, 1.0); sy = sx * range(rngT, 1.08, 1.32); }       // (about 15% smaller than the first draft: chunky, not towering)
    else { sx = range(rngT, 0.8, 1.1); sy = sx * range(rngT, 0.9, 1.08); }
    const t = {
      layer: shape + (snow ? 'Snow' : ''), variant, snow, x: c.x, z: c.z, y: h - 0.05, rot: rngT() * TAU, sx, sy,
      r: Math.max(0.3, 0.5 * sx), color: pickOf(rngT, GREEN_TINTS),
    };
    trees.push(t);
    claim(t.x, t.z, t.r + 0.5);
  };
  for (const c of conifers) addConifer(c);
  // a few more on the alpine plateau itself, so the snow-capped trees read as a feature of the high ground
  for (const c of scatter(island, {
    seed: island.seed + 1016, target: 12, minDist: 6, tries: 30000,
    accept(x, z) {
      if (forbidden(x, z, 2) || laneD(x, z) < LANE_HALF + 0.8) return null;
      const h = mod.height(x, z);
      if (h < 6.3 || h > 9.0 || !freeOfSolids(x, z, 0.6, 3.5) || !safeSpot(mod, x, z, h, ['snow', 'grass'], 0.3)) return null;
      return h;
    },
  })) addConifer(c);

  // Birches: along the meadow and round the lake, never in the dense forest
  const rngB = mulberry32(island.seed + 1003);
  const birchSpots = scatter(island, {
    seed: island.seed + 1004, target: 24, minDist: 4.2, tries: 30000,
    accept(x, z, rng) {
      if (forbidden(x, z, 1)) return null;
      if (mod.inland(x, z) < 14) return null;
      const h = mod.height(x, z);
      if (h < 0.9 || h > 3.4) return null;
      const ld = mod.lakeDist(x, z);
      const lakeSide = ld > LAKE_CLEAR + 0.6 && ld < 30;
      if (!lakeSide && rng() < 0.55) return null;                     // mostly lakeside, a few on the meadow
      if (laneD(x, z) < LANE_HALF + 0.6) return null;
      if (!freeOfSolids(x, z, 0.6, 2.2)) return null;
      if (!safeSpot(mod, x, z, h, ['grass'], 0.28)) return null;
      return h;
    },
  });
  for (const c of birchSpots) {
    const sx = range(rngB, 0.82, 1.1);
    const t = {
      layer: 'birch', variant: 'birch', snow: false, x: c.x, z: c.z, y: mod.height(c.x, c.z) - 0.05, rot: rngB() * TAU, sx, sy: sx * range(rngB, 0.95, 1.15),
      r: 0.4 * sx, color: pickOf(rngB, BIRCH_TINTS),
    };
    trees.push(t);
    claim(t.x, t.z, t.r + 0.5);
  }

  // ---------------------------------------------------------------------------------------- granite boulders
  const rngR = mulberry32(island.seed + 1005);
  const boulders = [];
  const rockSpots = scatter(island, {
    seed: island.seed + 1006, target: 30, minDist: 6.5, tries: 30000,
    accept(x, z, rng) {
      if (forbidden(x, z, 1.5)) return null;
      if (mod.inland(x, z) < 12) return null;
      const h = mod.height(x, z);
      if (h < 0.9 || h > 8.9) return null;
      if (laneD(x, z) < LANE_HALF + 0.5) return null;
      if (!freeOfSolids(x, z, 1.0, 1.4)) return null;
      if (!safeSpot(mod, x, z, h, ['grass', 'snow'], 0.4)) return null;
      return h;
    },
  });
  for (const c of rockSpots) {
    const h = mod.height(c.x, c.z);
    const s = range(rngR, 0.75, 1.85);
    const snow = h > 5.2 || mod.groundType(c.x, c.z) === 'snow' ? true : rngR() < 0.25;
    const rot = rngR() * TAU, sx = s * range(rngR, 0.92, 1.15), sy = s * range(rngR, 0.85, 1.15), sz = s * range(rngR, 0.92, 1.15);
    const rr = 0.75 * s;
    const ground = Math.min(h, mod.height(c.x + rr, c.z), mod.height(c.x - rr, c.z), mod.height(c.x, c.z + rr), mod.height(c.x, c.z - rr));
    const b = {                                                      // y = where the mesh centre sits (home rocks: ground + 0.62 * height, so the base sinks in a little)
      layer: snow ? 'boulderSnow' : 'boulder', snow, x: c.x, z: c.z, y: ground + 0.62 * sy, ground, rot, sx, sy, sz, r: 0.82 * s, color: pickOf(rngR, ROCK_TINTS),
    };
    boulders.push(b);
    claim(b.x, b.z, b.r);
  }

  // ---------------------------------------------------------------------------------------- icicle rocks (spires)
  const rngS = mulberry32(island.seed + 1007);
  const spires = [];
  const spireOk = (x, z) => {
    if (forbidden(x, z, 1) || laneD(x, z) < LANE_HALF + 0.4) return false;
    const h = mod.height(x, z), g = mod.groundType(x, z);
    if (h < 0.9 || g === 'ice' || g === 'water' || g === 'sand' || g === 'wetsand') return false;
    if (Math.hypot(mod.height(x + 0.8, z) - h, mod.height(x, z + 0.8) - h) / 0.8 > 0.6) return false;
    return freeOfSolids(x, z, 0.6, 0.8);
  };
  for (const p of F.peaks) {                                          // a few at the foot of every peak
    for (let k = 0, got = 0; k < 40 && got < 3; k++) {
      const a = rngS() * TAU, d = p.r * range(rngS, 0.8, 1.45);
      const x = cx + p.x + Math.cos(a) * d, z = cz + p.z + Math.sin(a) * d;
      if (!spireOk(x, z)) continue;
      spires.push({ x, z, y: mod.height(x, z) - 0.05, rot: rngS() * TAU, s: range(rngS, 0.8, 1.5), r: 0.55 });
      claim(x, z, 0.6); got++;
    }
  }
  for (let k = 0, got = 0; k < 160 && got < 4; k++) {                 // and a few at the lake
    const a = rngS() * TAU;
    const x = cx + F.lake.x + Math.cos(a) * F.lake.rx * range(rngS, 1.25, 1.7), z = cz + F.lake.z + Math.sin(a) * F.lake.rz * range(rngS, 1.25, 1.7);
    if (!spireOk(x, z)) continue;
    spires.push({ x, z, y: mod.height(x, z) - 0.05, rot: rngS() * TAU, s: range(rngS, 0.7, 1.2), r: 0.55 });
    claim(x, z, 0.6); got++;
  }

  // ---------------------------------------------------------------------------------------- fallen logs
  const rngL = mulberry32(island.seed + 1008);
  const logs = [];
  const logSpots = scatter(island, {
    seed: island.seed + 1009, target: 9, minDist: 9, tries: 20000,
    accept(x, z) {
      if (forbidden(x, z, 1.5) || mod.inland(x, z) < 14) return null;
      const h = mod.height(x, z);
      if (h < 1.0 || h > 6.6 || laneD(x, z) < LANE_HALF + 1.6) return null;
      if (!freeOfSolids(x, z, 1.8, 0.8) || !safeSpot(mod, x, z, h, ['grass', 'snow'], 0.25)) return null;
      return h;
    },
  });
  for (const c of logSpots) {
    const rot = rngL() * TAU, s = range(rngL, 0.9, 1.25), half = 1.35 * s;
    const ca = Math.cos(rot), sa = Math.sin(rot);
    const circles = [-1, 0, 1].map((k) => [c.x + ca * half * 0.8 * k, c.z - sa * half * 0.8 * k]);   // the log lies along local +X (rotation.y = rot)
    const ends = [circles[0], circles[2]];
    if (ends.some(([ex, ez]) => !freeOfSolids(ex, ez, 0.4, 0.3) || !FROST_AREAS.anyGround(mod, ex, ez, mod.height(ex, ez)))) continue;
    const L = { x: c.x, z: c.z, y: mod.height(c.x, c.z) + 0.1, rot, s, r: 0.42 * s, circles };
    logs.push(L);
    for (const [px, pz] of circles) claim(px, pz, L.r);
  }

  // ---------------------------------------------------------------------------------------- snowmen
  const rngM = mulberry32(island.seed + 1010);
  const snowmen = [];
  const manOk = (x, z, minLane = 4.2) => {
    if (forbidden(x, z, 1.5) || mod.inland(x, z) < 14) return false;
    const h = mod.height(x, z), g = mod.groundType(x, z);
    if (h < 1.0 || (g !== 'grass' && g !== 'snow') || laneD(x, z) < minLane) return false;
    return freeOfSolids(x, z, 0.8, 1.6) && safeSpot(mod, x, z, h, ['grass', 'snow'], 0.25);
  };
  const addMan = (x, z, faceX, faceZ) => {
    const s = range(rngM, 0.95, 1.2);
    const m = { x, z, y: mod.height(x, z) - 0.03, rot: Math.atan2(faceX - x, faceZ - z) + range(rngM, -0.4, 0.4), s, look: snowmen.length % 3, r: 0.62 * s };
    snowmen.push(m);
    claim(x, z, m.r);
  };
  // two hand-placed greeters: one beside the landing lane (about 22 u inland, off to the side) and one on the lake bank
  const spotNear = (px, pz, valid) => {
    for (let k = 0; k < 120; k++) {
      const a = k * 2.399, d = 0.5 + k * 0.35;
      const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      if (valid(x, z)) return [x, z];
    }
    return null;
  };
  const greet = spotNear(cx + 16.5, cz + 90, manOk);
  if (greet) addMan(greet[0], greet[1], cx + 9.5, cz + 98);
  const bank = spotNear(cx + F.lake.x - F.lake.rx - 6, cz + F.lake.z + 6, manOk);
  if (bank) addMan(bank[0], bank[1], cx + F.lake.x, cz + F.lake.z);
  const manSpots = scatter(island, {
    seed: island.seed + 1011, target: 5, minDist: 26, tries: 24000,
    accept(x, z) { return manOk(x, z, 6) && laneD(x, z) < 26 && mod.height(x, z) < 6.5 ? 'man' : null; },
  });
  for (const c of manSpots) if (freeOfSolids(c.x, c.z, 0.8, 1.6)) addMan(c.x, c.z, c.x + range(rngM, -1, 1), c.z + range(rngM, 0.2, 1));

  // ---------------------------------------------------------------------------------------- flowers (edelweiss, gentian) + snow tufts
  const rngF = mulberry32(island.seed + 1012);
  const flowers = [];
  const flowerOk = (x, z) => {
    const g = mod.groundType(x, z);
    if (g !== 'grass' && g !== 'snow') return false;
    const h = mod.height(x, z);
    if (h < 1.0 || mod.inland(x, z) < 12.5 || mod.lakeDist(x, z) < LAKE_CLEAR || nearRamp(x, z)) return false;
    if (landing && Math.hypot(x - landing.x, z - landing.z) < LANDING_CLEAR - 3) return false;
    if (Math.hypot(mod.height(x + 0.6, z) - h, mod.height(x, z + 0.6) - h) / 0.6 > 0.5) return false;
    return freeOfSolids(x, z, 0.15, 0.3);
  };
  const patches = scatter(island, {
    seed: island.seed + 1013, target: 18, minDist: 11, tries: 12000,
    accept(x, z) { return flowerOk(x, z) && freeOfSolids(x, z, 1.5, 0.2) ? 'patch' : null; },
  });
  for (const p of patches) {
    const h = mod.height(p.x, p.z);
    const main = h > 3.4 ? 'edelweiss' : (rngF() < 0.5 ? 'gentian' : 'edelweiss');
    const n = 7 + Math.floor(rngF() * 6), rad = range(rngF, 1.4, 2.6);
    let got = 0;
    for (let k = 0; k < n * 4 && got < n; k++) {
      const a = rngF() * TAU, d = Math.sqrt(rngF()) * rad;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (!flowerOk(x, z) || flowers.some((f) => (f.x - x) ** 2 + (f.z - z) ** 2 < 0.36)) continue;
      flowers.push({ layer: rngF() < 0.78 ? main : (main === 'edelweiss' ? 'gentian' : 'edelweiss'), x, z, y: mod.height(x, z) - 0.02, rot: rngF() * TAU, s: range(rngF, 0.95, 1.4), color: pickOf(rngF, FLOWER_TINTS), interactive: false });
      got++;
    }
  }
  // ~26 interactive (boing) flowers, spread out
  let boing = 0;
  const picked = [];
  for (let tries = 0; tries < 900 && boing < 26 && flowers.length; tries++) {
    const f = flowers[Math.floor(rngF() * flowers.length)];
    if (f.interactive || picked.some((q) => (q.x - f.x) ** 2 + (q.z - f.z) ** 2 < 9)) continue;
    f.interactive = true; picked.push(f); boing++;
  }

  const tufts = [];
  const tuftSpots = scatter(island, {
    seed: island.seed + 1014, target: 340, minDist: 1.7, tries: 14000,
    accept(x, z, rng) {
      if (rng() < 0.2) return null;
      if (!flowerOk(x, z)) return null;
      return 'tuft';
    },
  });
  for (const c of tuftSpots) tufts.push({ x: c.x, z: c.z, y: mod.height(c.x, c.z) - 0.02, rot: rngF() * TAU, s: range(rngF, 0.65, 1.15), color: pickOf(rngF, FLOWER_TINTS) });

  // ---------------------------------------------------------------------------------------- frozen cattails round the lake
  const rngC = mulberry32(island.seed + 1015);
  const reeds = [];
  for (let k = 0; k < 400 && reeds.length < 15; k++) {
    const a = rngC() * TAU, f = range(rngC, 1.12, 1.4);
    const x = cx + F.lake.x + Math.cos(a) * F.lake.rx * f, z = cz + F.lake.z + Math.sin(a) * F.lake.rz * f;
    const ld = mod.lakeDist(x, z), g = mod.groundType(x, z), h = mod.height(x, z);
    if (ld < 11.2 || ld > 15.5 || g === 'ice' || g === 'water' || h < 0.3 || h > 1.6) continue;
    if (laneD(x, z) < 2.2 || reeds.some((r) => (r.x - x) ** 2 + (r.z - z) ** 2 < 6) || !freeOfSolids(x, z, 0.5, 0.4)) continue;
    reeds.push({ x, z, y: h - 0.08, rot: rngC() * TAU, s: range(rngC, 0.9, 1.35) });
  }

  const out = { trees, boulders, flowers, tufts, logs, spires, reeds, snowmen, solids };
  _cache.set(island.id, out);
  return out;
}

/**
 * 29b hook: pick valid spots for gathering objects (bushes, herbs, mushrooms, dig spots ...) on Frostpine, deterministically from `seed`.
 *   sampleFrostSpots(island, mod, { area: 'forest', count: 12, seed: 7, r: 0.6, minDist: 5 }) -> [{ x, z, y }]
 * `area` is a key of FROST_AREAS (or a custom (mod, x, z, h) predicate). Spots avoid the landing, lanes, ramps, the lake and every placed solid
 * (trees, boulders, snowmen, logs, spires) by `r` + a margin, and stay `minDist` from each other. Pure, so host and replicas agree.
 */
export function sampleFrostSpots(island, mod, { area = 'anyGround', count = 8, seed = 1, r = 0.6, minDist = 4, tries = 6000 } = {}) {
  const place = buildFrostPlacement(island, mod);
  const pred = typeof area === 'function' ? area : FROST_AREAS[area];
  if (!pred) throw new Error(`unknown frost area: ${area}`);
  const landing = landingFor(island), lanes = frostLanes(island), F = FROST_FEATURES;
  const rng = mulberry32(island.seed + 5000 + seed);
  const half = island.radius - 4;
  const out = [];
  for (let t = 0; t < tries && out.length < count; t++) {
    const x = island.x + (rng() * 2 - 1) * half, z = island.z + (rng() * 2 - 1) * half;
    const h = mod.height(x, z);
    if (!pred(mod, x, z, h)) continue;
    if (landing && Math.hypot(x - landing.x, z - landing.z) < LANDING_CLEAR - 4) continue;
    if (mod.lakeDist(x, z) < LAKE_CLEAR - 1) continue;
    const dx = x - island.x - F.plateau.x, dz = z - island.z - F.plateau.z, d = Math.hypot(dx, dz);
    if (d > F.plateau.r - 22 && d < F.plateau.r + 15 && F.rampAngles.some((ra) => angleDiff(Math.atan2(dz, dx), ra) < 0.42)) continue;
    if (lanes.some((l) => polyDist(l, x, z) < 1.8)) continue;
    if (Math.hypot(mod.height(x + 0.6, z) - h, mod.height(x, z + 0.6) - h) / 0.6 > 0.4) continue;
    if (place.solids.some((o) => (o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + r + 0.5) ** 2)) continue;
    if (out.some((o) => (o.x - x) ** 2 + (o.z - z) ** 2 < minDist * minDist)) continue;
    out.push({ x, z, y: h });
  }
  return out;
}
