// Frostpine Isle GATHERING spots, PLACEMENT only (Step 29b). Pure + seeded from the island seed (no three.js, no registries), so every screen computes
// the same bushes / herbs / mushrooms / dig spots, a visuals rebuild can never move one, and the Node tests can check the rules.
//
//   planFrostGathering(island, mod) -> {
//     bushes:    [{ id, x, y, z, rot, s, area }]   lingonberry bushes (low dark-green shrubs with red berries), meadow + forest edges
//     herbs:     [{ id, x, y, z, rot, s, area }]   mountain mint, meadow + lake shore
//     mushrooms: [{ id, x, y, z, rot, s, area }]   chanterelles, in the forest, preferably tucked up to a tree
//     digs:      [{ id, x, y, z, rot, snow }]      the initial dig spots (shovel), snowfield + meadow; `snow` = on snow ground (white mound / hole)
//   }
// `id` is stable and unique across kinds ('frost-bush-0', 'frost-herb-3', 'frost-mush-7', 'frost-dig-2'); gathering.js appends these lists after home's
// in its own (index based) sync ids, so they never collide with home's. `y` is the terrain height. Every spot keeps SPACING from every other spot
// (the interact prompt must be unambiguous) and comes from sampleFrostSpots(), which already avoids the landing, lanes, ramps, the lake and every solid.
//
// 29b only places the initial spots: dig spots that were dug re-appear elsewhere through gathering.js (host timer, `world.frost.sampleSpots`).
import { mulberry32 } from '../../utils/rng.js';
import { sampleFrostSpots, buildFrostPlacement } from './frostPlacement.js';

export const FROST_GATHER = { bushes: 12, herbs: 16, mushrooms: 16, digs: 9 };
export const SPACING = 2.6;          // u between any two gathering spots (of any kind)

const _cache = new Map();
export function planFrostGathering(island, mod) {
  if (_cache.has(island.id)) return _cache.get(island.id);
  const place = buildFrostPlacement(island, mod);
  const rng = mulberry32(island.seed + 7700);
  const taken = [];                  // every accepted spot, any kind
  const free = (x, z) => taken.every((o) => (o.x - x) ** 2 + (o.z - z) ** 2 >= SPACING * SPACING);
  const treeD = (x, z) => { let d = Infinity; for (const t of place.trees) d = Math.min(d, Math.hypot(t.x - x, t.z - z) - t.r); return d; };

  /** Take up to `count` spots of `area` (several candidate batches, minDist apart), `near` optionally ranks the candidates (lower = better). */
  const take = (area, count, seed, { r = 0.6, minDist = 3.5, near = null } = {}) => {
    let cands = sampleFrostSpots(island, mod, { area, count: count * 5, seed, r, minDist });
    if (near) cands = cands.map((c) => ({ c, k: near(c.x, c.z) })).sort((a, b) => a.k - b.k).map((o) => o.c);
    const out = [];
    for (const c of cands) {
      if (out.length >= count) break;
      if (!free(c.x, c.z)) continue;
      taken.push(c); out.push(c);
    }
    return out;
  };

  const kinds = (list, kind, area, sMin, sMax) => list.map((c, i) => ({
    id: `frost-${kind}-${i}`, x: c.x, y: c.y, z: c.z, rot: rng() * Math.PI * 2, s: sMin + rng() * (sMax - sMin), area,
  }));

  // dig spots first (they need the most open ground), then bushes, mushrooms, herbs
  const digSnow = take('snowfield', Math.ceil(FROST_GATHER.digs * 0.55), 11, { r: 0.8, minDist: 12 });
  const digMeadow = take('meadow', FROST_GATHER.digs - digSnow.length, 12, { r: 0.8, minDist: 12 });
  const digs = [...digSnow, ...digMeadow].map((c, i) => ({
    id: `frost-dig-${i}`, x: c.x, y: c.y, z: c.z, rot: rng() * Math.PI * 2, snow: digSnow.includes(c),
  }));

  const bMeadow = take('meadow', Math.ceil(FROST_GATHER.bushes / 2), 21, { r: 0.8, minDist: 6 });
  const bForest = take('forest', FROST_GATHER.bushes - bMeadow.length, 22, { r: 0.8, minDist: 6, near: (x, z) => Math.abs(treeD(x, z) - 2.2) });   // forest EDGE: a couple of units off a trunk
  const bushes = [...kinds(bMeadow, 'bush', 'meadow', 1.2, 1.5), ...kinds(bForest, 'bush', 'forest', 1.2, 1.5)].map((b, i) => ({ ...b, id: `frost-bush-${i}` }));

  const mush = take('forest', FROST_GATHER.mushrooms, 31, { r: 0.5, minDist: 3.2, near: (x, z) => Math.max(0, treeD(x, z) - 1.0) });
  const mushrooms = kinds(mush, 'mush', 'forest', 1.3, 1.7);

  const hMeadow = take('meadow', Math.ceil(FROST_GATHER.herbs * 0.55), 41, { r: 0.5, minDist: 4 });
  const hShore = take('lakeShore', FROST_GATHER.herbs - hMeadow.length, 42, { r: 0.5, minDist: 4 });
  const herbs = [...kinds(hMeadow, 'herb', 'meadow', 1.7, 2.1), ...kinds(hShore, 'herb', 'lakeShore', 1.7, 2.1)].map((h, i) => ({ ...h, id: `frost-herb-${i}` }));

  const plan = { bushes, herbs, mushrooms, digs, spacing: SPACING };
  _cache.set(island.id, plan);
  return plan;
}
