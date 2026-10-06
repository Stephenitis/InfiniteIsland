// Seeded pineapple plants and dark-soil dig spots, appended after Frostpine's sync records, plus the Emberleaf tool pickup spots (Step 37a).
import { sampleEmberSpots, buildEmberPlacement } from './emberPlacement.js';
import { landingFor } from './scatter.js';
import { getPath, pointAt } from '../paths.js';

const _plans = new WeakMap();
export function planEmberGathering(island, mod) {
  if (_plans.has(mod)) return _plans.get(mod);
  const plants = sampleEmberSpots(island, mod, { area: 'jungle', count: 26, seed: 31, minDist: 9 });
  const herbs = plants.slice(0, 16).map((n, i) => ({ ...n, id: `ember-pineapple-${i}` }));
  const digs = plants.slice(16).map((n, i) => ({ ...n, id: `ember-dig-${i}`, snow: false }));
  const plan = { herbs, digs };
  _plans.set(mod, plan);
  return plan;
}

// The Emberleaf tool pickups (Step 32b left them for "Step 30 or later"; Step 37a adds them). Ten, with the original five in a fixed order that world/items.js appends after Frostpine's: a
// shovel and an axe near the bridge landing (two seed finds need digging, bamboo needs an axe), then a hammer and a sword along the garden trail, and a spare shovel
// by the garden's approach. Spots come from the same keep-clear sampler as everything else (off lanes, the trail, the garden, the reserved waterfall), away from the
// pineapple plants and dig spots; each takes the nearest free candidate to its anchor, so the result is deterministic from the island seed.
export const EMBER_TOOL_KINDS = ['axe', 'shovel', 'hammer', 'sword', 'shovel', 'axe', 'shovel', 'hammer', 'sword', 'shovel'];
export function planEmberTools(island, mod) {
  const g = planEmberGathering(island, mod), trail = getPath('ember-garden'), landing = landingFor(island);
  const along = (s) => pointAt(island, trail, s, 0);
  const anchors = [landing, landing, along(trail.length * 0.5), along(trail.length * 0.72), along(trail.length * 0.9),
    { x: island.x - 45, z: island.z + 38 }, { x: island.x + 58, z: island.z - 42 },
    { x: island.x - 25, z: island.z - 5 }, along(trail.length * 0.25), { x: island.x + 50, z: island.z + 30 }];
  const cands = sampleEmberSpots(island, mod, { area: 'jungle', count: 80, seed: 3303, r: 1.2, minDist: 7 })
    .filter((p) => [...g.herbs, ...g.digs].every((q) => Math.hypot(p.x - q.x, p.z - q.z) > 3));
  const used = new Set(), out = [];
  const placement = buildEmberPlacement(island, mod);
  EMBER_TOOL_KINDS.forEach((kind, i) => {
    let best = -1, bd = Infinity;
    cands.forEach((p, j) => {
      if (used.has(j)) return;
      // Preserve the original five spots; added tools must not compete with seed flowers for Interact.
      if (i >= 5 && placement.flowers.some((f) => f.interactive && Math.hypot(p.x - f.x, p.z - f.z) < 4)) return;
      const d = Math.hypot(p.x - anchors[i].x, p.z - anchors[i].z);
      if (d < bd) { bd = d; best = j; }
    });
    if (best < 0) throw new Error('Emberleaf has too few clear tool spots');
    used.add(best);
    out.push({ kind, x: cands[best].x, z: cands[best].z });
  });
  return out;
}
