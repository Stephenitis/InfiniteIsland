// Glowcap crumbs (PLAN Step 72b): a deterministic subset of the 69d violet mushroom clumps becomes pickable. Pure data, world coordinates, cached per terrain module; it only READS the existing
// flora plan (islands/duskFlora.js layer `mushroom`), so no placement hash moves (69c a3374631, 69d dc5f974e stay pinned).
//
//   planDuskCrumbs(island?, mod?) -> { clumps: [{ ...floraItem, id, ref }], hash() }     the CRUMB_COUNT clumps nearest the marsh hearth (greedy, CRUMB_APART apart, outside the hearth's own zone),
//                                    in a stable order: nearest first. `id` is the flora item's own id ('dusk-mushroom-N'); gathering.js appends one 'mushroom' record per clump after Frostpine's.
//   duskCrumbRuntime                 the bridge between gathering (which hides / regrows a picked clump) and the CURRENT small-flora visuals (duskSmallVisuals.js attaches/detaches on every
//                                    build, so world.rebuild('duskcrown') cannot lose a picked state): setClump(item, on, k), attach(api), detach(), hooks (re-apply after an attach).
import { ISLANDS } from '../../config.js';
import { getIslandModule } from './registry.js';
import { buildDuskFlora } from './duskFlora.js';
import { duskHearthLayout } from './duskHearth.js';

export const CRUMB_COUNT = 16, CRUMB_APART = 7, CRUMB_MAX = 95;
const cache = new WeakMap();

export function planDuskCrumbs(island = ISLANDS.find((i) => i.id === 'duskcrown'), mod = getIslandModule('duskcrown')) {
  const hit = cache.get(mod);
  if (hit) return hit;
  const flora = buildDuskFlora(island, mod), hearth = duskHearthLayout(island, mod), f = hearth.fire;
  const d = (c) => Math.hypot(c.x - f.x, c.z - f.z);
  const pool = flora.layers.mushroom.filter((c) => d(c) > hearth.zone.r + 1 && d(c) <= CRUMB_MAX).sort((a, b) => d(a) - d(b) || (a.id < b.id ? -1 : 1));
  const clumps = [];
  for (const c of pool) {
    if (clumps.length >= CRUMB_COUNT) break;
    if (clumps.every((o) => Math.hypot(c.x - o.x, c.z - o.z) >= CRUMB_APART)) clumps.push(c);
  }
  for (const c of pool) { if (clumps.length >= CRUMB_COUNT) break; if (!clumps.includes(c)) clumps.push(c); }          // (never fewer than CRUMB_COUNT when the pool has them: relax the spacing)
  const hash = () => { let h = 2166136261; for (const c of clumps) for (const ch of `${c.id}:${c.x.toFixed(3)},${c.z.toFixed(3)};`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0).toString(16).padStart(8, '0'); };
  const plan = { clumps, hash };
  cache.set(mod, plan);
  return plan;
}

export const duskCrumbRuntime = {
  api: null,                    // the current visuals' { setItem(item, on, k) } ({} while none is built)
  hooks: [],
  attach(api) { this.api = api; for (const h of this.hooks) h(); },
  detach(api) { if (!api || this.api === api) this.api = null; },
  setClump(item, on, k = 1) { if (this.api) this.api.setItem(item, on, k); },
};
