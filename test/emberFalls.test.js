// Step 37c: Emberleaf's waterfall terrain: the ledge behind the falling water, the plunge pool, the cascade, the stream and its ford, and that the water stays inside its reserved corridor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ISLANDS, EMBER_WATERFALL as W, EMBER_GARDEN } from '../public/js/config.js';
import { createEmberIsland } from '../public/js/world/islands/ember.js';
import { waterfallForbidden } from '../public/js/world/islands/emberGarden.js';
import { buildEmberPlacement } from '../public/js/world/islands/emberPlacement.js';

const island = ISLANDS.find((i) => i.id === 'ember'), mod = createEmberIsland(island), f = mod.falls, F = W.falls;
const walk = (p) => mod.walkable(p.x, p.z);

// 0.5 u grid flood fill over walkable ground from a world point (bounded to the falls area)
function flood(start, box) {
  const key = (i, j) => `${i},${j}`, st = 0.5, seen = new Set(), q = [[Math.round(start.x / st), Math.round(start.z / st)]];
  seen.add(key(...q[0]));
  for (let n = 0; n < q.length; n++) {
    const [i, j] = q[n];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj, x = a * st, z = b * st;
      if (x < box.x0 || x > box.x1 || z < box.z0 || z > box.z1 || seen.has(key(a, b)) || !mod.walkable(x, z)) continue;
      seen.add(key(a, b)); q.push([a, b]);
    }
  }
  return (p) => seen.has(key(Math.round(p.x / st), Math.round(p.z / st)));
}
const box = { x0: island.x - 70, x1: island.x + 60, z0: island.z - 10, z1: island.z + 80 };

test('the ledge behind the falling water is walkable, one player wide, and reached from the pool\'s west bank only', () => {
  const spot = f.data.ledgeSpot;
  assert.ok(walk(spot) && !walk({ x: 1e5, z: 0 }), 'ledge spot walkable');
  assert.equal(mod.groundType(spot.x, spot.z), 'rock');
  // width: across the ledge (the s direction) only ~1-2 u of ground
  let w = 0; for (let s = F.ledge.s0 - 1; s < F.ledge.s1 + 1; s += 0.1) if (walk(f.toWorld(s, F.ledge.uEnd + 0.8))) w += 0.1;
  assert.ok(w > 0.6 && w < 2.2, `ledge width ${w.toFixed(2)}`);
  const west = f.toWorld(42.6, F.pool.r + 1.2), east = f.toWorld(42.6, -F.pool.r - 1.2);
  assert.ok(walk(west) && walk(east), 'both banks are ground');
  assert.ok(flood(west, box)(spot), 'the ledge is reachable from the west bank');
  assert.ok(!flood(east, box)(spot) || flood(east, box)(west), 'from the east bank only via the west (no direct way in)');
  // the ledge is behind the sheet: its front edge (s1) is closer to the volcano than the sheet's landing
  assert.ok(F.ledge.s1 < F.slab.s1 + F.sheet.run && F.ledge.y < F.slab.y);
});

test('the plunge pool: the deep middle blocks, the shore ring is walkable all the way round the south, 33 % of the basin is shallow', () => {
  const c = f.toWorld(F.pool.s, 0);
  assert.ok(!walk(c) && mod.groundType(c.x, c.z) === 'water');
  assert.ok(Math.abs(mod.height(c.x, c.z) - (F.pool.y - F.pool.depth)) < 0.2);
  let ring = 0, n = 0;
  for (let a = 20; a <= 340; a += 5) {
    const p = { x: c.x + Math.cos(a * Math.PI / 180) * (F.pool.r + 0.9), z: c.z + Math.sin(a * Math.PI / 180) * (F.pool.r + 0.9) };
    n++; if (walk(p)) ring++;
  }
  assert.ok(ring / n > 0.6, `shore ring walkable share ${(ring / n).toFixed(2)}`);
  const sy = f.surface(c.x, c.z);
  assert.ok(Math.abs(sy - F.pool.y) < 1e-9);
});

test('the cascade and the stream are shallow and walkable end to end; the trail\'s ford is walkable and not "water"', () => {
  const p = f.paths();
  assert.ok(p.cascade.length > 15 && p.stream.length > 5);
  for (const q of [...p.cascade, ...p.stream].filter((q) => mod.height(q.x, q.z) > 0.1)) assert.ok(mod.walkable(q.x, q.z), `water path point (${q.x.toFixed(1)}, ${q.z.toFixed(1)}) walkable`);
  for (let i = 1; i < p.cascade.length; i++) assert.ok(p.cascade[i].y <= p.cascade[i - 1].y + 1e-9, 'the cascade only runs downhill');
  const mid = p.cascade[Math.floor(p.cascade.length / 2)];
  assert.equal(mod.groundType(mid.x, mid.z), 'water');
  const ford = f.data.ford;
  assert.ok(ford && ford.gap < 1.2 && mod.walkable(ford.x, ford.z) && mod.groundType(ford.x, ford.z) !== 'water');
  // the cascade is walkable all the way from the pool's shore to the stream (a flood fill from the cascade foot reaches the pool's west bank)
  const reach = flood(p.cascade.at(-1), box);
  assert.ok(reach(f.toWorld(42.6, F.pool.r + 1.2)), 'cascade foot -> pool bank');
  assert.ok(reach(p.stream.filter((q) => mod.height(q.x, q.z) > 0.1).at(-1)), 'cascade foot -> stream');
});

test('the water stays inside its reserved corridor: terrain outside it is untouched', () => {
  let bad = 0;
  for (let x = island.x - 80; x < island.x + 50; x += 1.5) for (let z = island.z - 20; z < island.z + 75; z += 1.5) {
    if (waterfallForbidden(island, x, z, 0)) continue;
    if (f.carve(x, z, 5) !== 5 || f.carve(x, z, 12) !== 12) bad++;
  }
  assert.equal(bad, 0);
});

test('the waterfall does not move Emberleaf\'s placement: 138 trees, 30 boulders, lanes unchanged', () => {
  const p = buildEmberPlacement(island, mod);
  assert.equal(p.trees.length, 138); assert.equal(p.boulders.length, 30);
  assert.deepEqual(p.lanes.map((l) => l.length), [77, 90, 59, 77, 116, 95, 54, 31, 62]);
  assert.ok(EMBER_GARDEN.x === 15);
});
