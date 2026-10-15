// Duskcrown's marsh hearth and its fishing ponds (PLAN Step 72a). Pure data (no three.js), world coordinates, deterministic from the island module (the ground is read from the real terrain), so the
// hearth cannot drift from the marsh. The fire's island-local spot is config DUSK_HEARTH (FIRES 'dusk' needs it before any terrain exists); this module derives everything round it.
//
//   duskHearthLayout(island?, mod?) -> {
//     fire {x, z, y}          the hearth (= FIRES 'dusk')                      seats [{x, z, angle}]   the four capstool seats (world/campfire.js builds them from FIRES[].bench)
//     stable {x, z, r, yaw}   RESERVED for Step 73's pet stable (nothing is built here yet; r = the circle it claims)
//     rods [{x, z}]           the four Glowline Rod pickup spots (one per possible player), just outside the fire's keep-clear ring
//     zone {x, z, r}          the disc the hearth, stable and rods claim: tests check lanes / ponds / dock / placements stay out of it
//   }
//   duskFishPonds(island?, mod?) -> [{ id, x, z, rx, rz, depth, deep, lagoon }]   every fishable water body in world coordinates (the 25-40 `dusk-pond-NN` and the lagoon, an ellipse);
//                                `deep` = the lagoon and the deepest third of the ponds (the only places an orange 'chance' spot can appear, game/fishingLogic.js)
import { ISLANDS, DUSK_HEARTH, FISHING } from '../../config.js';
import { getIslandModule } from './registry.js';

const TAU = Math.PI * 2;
const cache = new WeakMap();

export function duskHearthLayout(island = ISLANDS.find((i) => i.id === 'duskcrown'), mod = getIslandModule('duskcrown')) {
  const hit = cache.get(island);
  if (hit && hit.mod === mod) return hit.layout;
  const H = DUSK_HEARTH, fx = island.x + H.x, fz = island.z + H.z;
  const fire = { x: fx, z: fz, y: Math.max(mod.height(fx, fz), 0.05) };
  const seats = H.angles.map((a) => ({ x: fx + Math.cos(a) * H.ring, z: fz + Math.sin(a) * H.ring, angle: a }));
  const flat = (x, z) => mod.walkable(x, z) && mod.height(x, z) >= 0.3 && mod.slopeAt(x, z, 0.4) <= 0.25;
  // The stable (Step 73): the first flat, dry circle east of the fire (towards the dock side), 9 u out; scanned deterministically.
  let stable = null;
  for (const da of [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 1.0, -1.0]) {
    const a = -0.25 + da, x = fx + Math.cos(a) * 9.5, z = fz + Math.sin(a) * 9.5;
    if (flat(x, z) && [0, 1, 2, 3, 4, 5].every((k) => flat(x + Math.cos(k * TAU / 6) * 3, z + Math.sin(k * TAU / 6) * 3))) { stable = { x: +x.toFixed(2), z: +z.toFixed(2), r: 4.2, yaw: Math.atan2(fx - x, fz - z) }; break; }
  }
  if (!stable) stable = { x: +(fx + 9.5).toFixed(2), z: +fz.toFixed(2), r: 4.2, yaw: -HALF_PI };
  // The rods: four spots on a ring just outside the keep-clear radius, scanned from the north-west round to the south-west so the party sees them as it walks up from the beach; flat dry ground only,
  // at least 2.4 u apart and out of the stable's circle.
  const rods = [], R = H.clear + 1.6;
  for (let k = 0; k < 48 && rods.length < 4; k++) {
    const a = -2.3 + (k / 48) * TAU * 0.78, x = fx + Math.cos(a) * R, z = fz + Math.sin(a) * R;
    if (!flat(x, z) || Math.hypot(x - stable.x, z - stable.z) < stable.r + 1.2 || rods.some((r) => Math.hypot(x - r.x, z - r.z) < 2.4)) continue;
    rods.push({ x: +x.toFixed(2), z: +z.toFixed(2) });
  }
  const layout = { fire, seats, stable, rods, zone: { x: fx, z: fz, r: 9.5 + stable.r + 1 } };
  cache.set(island, { mod, layout });
  return layout;
}

const HALF_PI = Math.PI / 2;

export function duskFishPonds(island = ISLANDS.find((i) => i.id === 'duskcrown'), mod = getIslandModule('duskcrown')) {
  const ponds = mod.ponds.map((p) => ({ id: p.id, x: island.x + p.x, z: island.z + p.z, rx: p.r, rz: p.r, depth: p.depth, deep: false, lagoon: false }));
  const ranked = [...ponds].sort((a, b) => b.depth - a.depth || (a.id < b.id ? -1 : 1));
  for (const p of ranked.slice(0, Math.max(1, Math.round(ponds.length * FISHING.deepFrac)))) p.deep = true;
  const l = mod.lagoon;
  ponds.push({ id: 'dusk-lagoon', x: island.x + l.x, z: island.z + l.z, rx: l.rx, rz: l.rz, depth: l.depth, deep: true, lagoon: true });
  return ponds;
}
