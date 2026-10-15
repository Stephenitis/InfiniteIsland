// Duskcrown's landing dock (PLAN Step 71): a short pier on the south shore, east of the landing beach, where Marlo's outrigger moors on the Duskcrown side of the crossing. Pure data (no three.js),
// world coordinates, deterministic from the island module (the shore is found by scanning the real terrain), so the dock cannot drift from the coast.
//
//   duskDockLayout(island?, mod?)  -> {
//     base {x, z}          the pier's landward end, on the wet sand (the pier runs SOUTH, +z, out to sea)       deck { x, z0, z1, w, top }   the plank strip
//     posts [{x, z}]       mooring posts (small colliders on the first two)                                      berth { x, z, yaw }   where the hull lies (west of the pier, bow to the shore)
//     seaward {x, z}       unit vector out to sea from the berth (the crossing path leaves / arrives along it)    marlo { x, z, yaw }   where the skipper stands
//     prompt { x, z, y }   the "Sail home" interactable                                                          arrive [{x, z} x 4]   one beach spot per global player slot (walkable, >= 1.5 u apart)
//     colliders [{x, z, r}] pier posts                                                                          zone { x, z, r }      the area the dock claims (placement keeps clear; tests check lanes / ponds)
//   }
// The landing beach is flora-free within 30 u (duskPlacement / duskFlora), the dock sits 13 u east of the landing and keeps clear of every lane polyline (lanes run along the beach at z + 1).
import { ISLANDS } from '../../config.js';
import { getIslandModule } from './registry.js';

export const DOCK = { dx: 13, deckW: 1.8, deckLen: 8.0, deckTop: 0.62, berthSide: 3.1, berthAlong: 6.2 };

const cache = new WeakMap();
export function duskDockLayout(island = ISLANDS.find((i) => i.id === 'duskcrown'), mod = getIslandModule('duskcrown')) {
  const hit = cache.get(island);
  if (hit && hit.mod === mod) return hit.layout;
  const L = mod.layout, x0 = island.x + L.landing.x + DOCK.dx, zl = island.z + L.landing.z;
  let shoreZ = zl + 3;
  for (let z = zl - 2; z < zl + 30; z += 0.25) if (mod.walkable(x0, z) && mod.height(x0, z) >= 0.05) shoreZ = z;       // the last dry, walkable cell going south
  const groundY = (x, z) => Math.max(mod.height(x, z), 0.05);
  const base = { x: x0, z: shoreZ + 0.4 };
  const deck = { x: x0, z0: shoreZ + 0.6, z1: shoreZ + 0.6 + DOCK.deckLen, w: DOCK.deckW, top: DOCK.deckTop };
  const berth = { x: x0 - DOCK.berthSide, z: shoreZ + DOCK.berthAlong, yaw: Math.PI };
  const posts = [{ x: x0 - 1.05, z: shoreZ + 1.0 }, { x: x0 + 1.05, z: shoreZ + 1.0 }, { x: x0 - 1.05, z: shoreZ + 7.6 }, { x: x0 + 1.05, z: shoreZ + 7.6 }];
  const marlo = { x: x0 + 2.6, z: shoreZ - 1.5 };
  marlo.yaw = Math.atan2(berth.x - marlo.x, berth.z - marlo.z);
  const prompt = { x: x0 - 0.2, z: shoreZ - 0.5, y: groundY(x0, shoreZ - 0.5) };
  const colliders = posts.slice(0, 2).map((p) => ({ x: p.x, z: p.z, r: 0.3 }));
  // One arrival spot per global slot: a deterministic scan of the beach west of the pier base (walkable, not on a collider, 1.5 u apart, nobody within 1.4 u of Marlo or the prompt).
  const arrive = [];
  const ok = (x, z) => mod.walkable(x, z) && mod.height(x, z) >= 0.12
    && colliders.every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + 0.8)
    && Math.hypot(x - marlo.x, z - marlo.z) >= 1.8 && Math.hypot(x - prompt.x, z - prompt.z) >= 1.0
    && arrive.every((a) => Math.hypot(x - a.x, z - a.z) >= 1.5);
  for (let r = 2.2; r <= 9 && arrive.length < 4; r += 0.8) {
    for (let k = 0; k < 24 && arrive.length < 4; k++) {
      const a = Math.PI * (0.55 + (k / 24) * 0.9);                        // the arc of the beach facing north-west (inland of the pier, west of Marlo)
      const x = x0 - 0.5 + Math.cos(a) * r, z = shoreZ - 0.5 + Math.sin(a) * r;
      if (z < shoreZ + 0.3 && ok(x, z)) arrive.push({ x: +x.toFixed(2), z: +z.toFixed(2) });
    }
  }
  arrive.sort((a, b) => a.x - b.x || a.z - b.z);
  const layout = {
    base, deck, posts, berth, seaward: { x: 0, z: 1 }, marlo, prompt, arrive, colliders,
    shoreZ, zone: { x: x0 - 1, z: shoreZ + 3, r: 9 },
  };
  cache.set(island, { mod, layout });
  return layout;
}
