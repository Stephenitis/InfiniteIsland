// Pure, shared layout for garden structure meshes and persistent collider identities.
import { EMBER_GARDEN, EMBER_WATERFALL, FIRES } from '../../config.js';
import { gardenReserved, fromPolar } from './emberGarden.js';
export function gardenStageLayout(island, mod) {
  const reserved = gardenReserved(island, mod), fire = FIRES.find((f) => f.id === 'ember');
  const ground = (p) => ({ ...p, y: mod.height(p.x, p.z) });
  const arch = reserved.stages[0];
  const trellises = [arch, ground(fromPolar(island, EMBER_GARDEN.zone.a + 0.1, 38.8))].map((p) => ({ ...p, posts: [-1.35, 1.35].map((dx) => ground({ x: p.x + dx, z: p.z, r: 0.13 })) }));
  const stepping = [];
  for (let d = 41; d <= 57; d += 1.5) {
    const p = ground(fromPolar(island, EMBER_GARDEN.zone.a, d));
    if (Math.hypot(p.x - fire.x, p.z - fire.z) > 3.8) stepping.push(p);
  }
  const inlet = reserved.stages[1];
  const pool = ground({ x: island.x + EMBER_WATERFALL.pool.x + EMBER_WATERFALL.pool.r * 0.75, z: island.z + EMBER_WATERFALL.pool.z });
  // Follow the outside of the west edge; it never crosses a planting bed or the hearth.
  const pipe = [pool, ground({ x: inlet.x - 2.4, z: pool.z + 4 }), ground({ x: inlet.x - 2.4, z: inlet.z }), inlet];
  const channels = [];
  for (const tier of EMBER_GARDEN.tiers) {
    const ring = [];
    for (let da = -0.34; da <= 0.341; da += 0.034) ring.push(ground(fromPolar(island, EMBER_GARDEN.zone.a + da, tier.d - 2.3)));
    channels.push(ring);
  }
  const descent = EMBER_GARDEN.tiers.map((t) => ground(fromPolar(island, EMBER_GARDEN.zone.a + 0.34, t.d - 2.3)));
  channels.push(descent);
  const arbour = reserved.stages[2];
  arbour.posts = [-0.65, 0.65].map((dx) => ground({ x: arbour.x + dx, z: arbour.z, r: 0.07 }));
  const pavilion = { x: fire.x, z: fire.z, y: mod.height(fire.x, fire.z), posts: [[-3.1,-3.1], [3.1,-3.1], [-3.1,3.1], [3.1,3.1]].map(([dx,dz]) => ground({ x: fire.x + dx, z: fire.z + dz, r: 0.16 })) };
  const boxes = [-1, 1].map((s) => ground({ x: arbour.x + s * 0.9, z: arbour.z + 0.6, r: 0.4 }));
  const colliders = { 1: trellises.flatMap((t) => t.posts), 2: [], 3: [...pavilion.posts, ...arbour.posts, ...boxes] };
  return { reserved, trellises, stepping, pipe, channels, arbour, pavilion, boxes, colliders };
}
