// Frostpine's eight hungry critters, PLACEMENT only (PLAN Step 34a). Pure + deterministic (no three.js, no registries), so every screen computes the same spawn
// points, a visuals rebuild can never move one and the Node tests can check the rules (test/critters.test.js).
//
//   planCritters(island, mod) -> [{
//     id        'critter-fox-0' ... (stable; Step 34b's sync domain keys on it)
//     species   'fox' | 'squirrel' | 'rabbit' | 'grouse'        index 0 | 1 = which of the species' two
//     food      the catalog item it wants (config CRITTERS.food)
//     zone      human description of the area ('west forest edge'), for tests / debug
//     spawn     { x, z, y }   the fixed WILD spawn point (world coordinates)
//     wander    [{ x, z }]    the places its idle roam may visit (all within CRITTERS.wander of the spawn; every point and every straight line between any two of them,
//                              or between one of them and the spawn, is walkable, off solids, off the painted trail, the lake and the camp clearing)
//     den       { x, z, r }   its own reserved den spot at the camp (frostCamp.js campReserved().dens; two per species, next to each other)
//     radius    collider radius
//   }]
// Each spot is the nearest valid ground to the anchor in config CRITTERS.spots (a ring search, no randomness): walkable grass or snow above the beach, gentle slope, clear of the
// bridge landing, the walking lanes (incl. the camp trail), the plateau ramps, the lake, the camp clearing, every placed solid and every gathering spot, and at least MIN_APART
// from every other critter. 'tree' spots stand beside a tree (squirrels). Frostpine's placement is NOT touched (critters take what is left), so nothing else moves.
import { CRITTERS, FROST_CAMP, PATH_CLEARANCE } from '../../config.js';
import { FROST_FEATURES } from './frost.js';
import { angleDiff } from './util.js';
import { polyDist, landingFor } from './scatter.js';
import { buildFrostPlacement, frostLanes, trailGap, LANDING_CLEAR, LANE_HALF, LAKE_CLEAR } from './frostPlacement.js';
import { planFrostGathering } from './frostGathering.js';
import { campDist, campReserved } from './frostCamp.js';

export const MIN_APART = 14;               // u between any two critters' spawn points
export const SPOT_SOLID_GAP = 1.1;         // u between a spawn point and the edge of a solid prop
const TAU = Math.PI * 2;

const _cache = new Map();
export function planCritters(island, mod) {
  if (_cache.has(island.id)) return _cache.get(island.id);
  const place = buildFrostPlacement(island, mod);
  const gather = planFrostGathering(island, mod);
  const gatherSpots = [...gather.bushes, ...gather.herbs, ...gather.mushrooms, ...gather.digs];
  const landing = landingFor(island), lanes = frostLanes(island), F = FROST_FEATURES;
  const dens = campReserved(island).dens;
  const laneD = (x, z) => { let d = Infinity; for (const l of lanes) d = Math.min(d, polyDist(l, x, z)); return d; };
  const nearRamp = (x, z) => {
    const dx = x - island.x - F.plateau.x, dz = z - island.z - F.plateau.z, d = Math.hypot(dx, dz);
    if (d < F.plateau.r - 22 || d > F.plateau.r + 15) return false;
    const a = Math.atan2(dz, dx);
    return F.rampAngles.some((ra) => angleDiff(a, ra) < 0.42);
  };
  const solidGap = (x, z) => { let g = Infinity; for (const o of place.solids) g = Math.min(g, Math.hypot(o.x - x, o.z - z) - o.r); return g; };
  const treeGap = (x, z) => { let g = Infinity; for (const t of place.trees) g = Math.min(g, Math.hypot(t.x - x, t.z - z) - t.r); return g; };

  /** Ground a critter may stand on (the roaming points use this one). */
  const groundOk = (x, z, gap) => {
    const g = mod.groundType(x, z);
    if ((g !== 'grass' && g !== 'snow') || !mod.walkable(x, z)) return false;
    const h = mod.height(x, z);
    if (h < 1.0 || mod.inland(x, z) < 11) return false;
    if (Math.hypot(mod.height(x + 0.6, z) - h, mod.height(x, z + 0.6) - h) / 0.6 > 0.45) return false;
    if (mod.lakeDist(x, z) < LAKE_CLEAR - 1) return false;
    if (campDist(island, x, z) < FROST_CAMP.clear + 1) return false;
    if (trailGap(island, x, z) < 0.6) return false;
    return solidGap(x, z) >= gap;
  };
  /** A spawn point: groundOk plus clear of the landing, the lanes / ramps / trail, the gathering spots. */
  const spotOk = (x, z) => {
    if (!groundOk(x, z, SPOT_SOLID_GAP)) return false;
    if (landing && Math.hypot(x - landing.x, z - landing.z) < LANDING_CLEAR + 2) return false;
    if (nearRamp(x, z) || laneD(x, z) < LANE_HALF + 0.6) return false;
    if (trailGap(island, x, z) < PATH_CLEARANCE + 1.2 || campDist(island, x, z) < FROST_CAMP.clear + 3) return false;
    return gatherSpots.every((o) => (o.x - x) ** 2 + (o.z - z) ** 2 >= 2.4 * 2.4);
  };
  const segOk = (a, b) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.35));
    for (let i = 1; i < n; i++) if (!groundOk(a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n, 0.55)) return false;
    return true;
  };

  const out = [];
  CRITTERS.spots.forEach((s, i) => {
    const ax = island.x + s.x, az = island.z + s.z;
    let spawn = null;
    search: for (let r = 0; r <= 24 && !spawn; r += 1) {
      const n = r === 0 ? 1 : Math.min(48, Math.round(TAU * r / 1.2));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + i * 0.7;
        const x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r;
        if (!spotOk(x, z)) continue;
        if (s.near === 'tree') { const g = treeGap(x, z); if (g < 0.4 || g > 3.2) continue; }
        if (out.some((o) => Math.hypot(o.spawn.x - x, o.spawn.z - z) < MIN_APART)) continue;
        const p = { x, z, y: mod.height(x, z) };
        const wander = roamPoints(p, i, groundOk, segOk);
        if (wander.length < 3) continue;
        spawn = p; out.push(finish(s, i, p, wander, dens)); break search;
      }
    }
    if (!spawn) throw new Error(`critterPlan: no valid spot for ${s.id}`);
  });
  _cache.set(island.id, out);
  return out;
}

/** The idle-roam points round a spawn: up to CRITTERS.wanderMax points within CRITTERS.wander, every straight line between any two (and the spawn) stays on good ground. */
function roamPoints(p, i, groundOk, segOk) {
  const pts = [];
  const radii = [CRITTERS.wander, CRITTERS.wander * 0.55];
  for (const r of radii) {
    for (let k = 0; k < 12 && pts.length < CRITTERS.wanderMax; k++) {
      const a = ((k * 5) % 12) / 12 * TAU + i * 0.9;       // (every 5th of 12 steps: the picks end up spread round the circle)
      const q = { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r };
      if (!groundOk(q.x, q.z, 0.95) || !segOk(p, q)) continue;
      if (pts.some((o) => !segOk(o, q))) continue;
      pts.push(q);
    }
  }
  return pts;
}

function finish(s, i, spawn, wander, dens) {
  return {
    id: s.id, species: s.species, index: Number(s.id.slice(s.id.lastIndexOf('-') + 1)), food: CRITTERS.food[s.species], zone: s.zone, spawn, wander,
    den: { ...dens[i] }, radius: CRITTERS.radius[s.species],
  };
}
