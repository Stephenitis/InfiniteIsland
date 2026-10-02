// Step 34a: Frostpine's eight hungry critters: the pure spawn plan (deterministic, two per species, walkable, off lanes / trail / camp / lake, spaced, reachable from the landing),
// the den assignment, the roam points, the hint / roam logic helpers and the collider mover.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ISLANDS, CRITTERS, FROST_CAMP, PATH_CLEARANCE } from '../public/js/config.js';
import { getIslandModule } from '../public/js/world/islands/registry.js';
import { buildFrostPlacement, frostLanes, trailGap, LANE_HALF, LAKE_CLEAR } from '../public/js/world/islands/frostPlacement.js';
import { planFrostGathering } from '../public/js/world/islands/frostGathering.js';
import { planCritters, MIN_APART } from '../public/js/world/islands/critterPlan.js';
import { campDist, campReserved } from '../public/js/world/islands/frostCamp.js';
import { polyDist, landingFor } from '../public/js/world/islands/scatter.js';
import { createHint, pickNextStop, hopsFor, arc } from '../public/js/game/critterLogic.js';
import { addCollider, moveCollider, resolveCircle, removeCollider } from '../public/js/world/colliders.js';
import { getItem } from '../public/js/game/catalog.js';
import { getToolAction } from '../public/js/items/tools.js';

const island = ISLANDS.find((i) => i.id === 'frost');
const mod = getIslandModule('frost');
const plan = planCritters(island, mod);
const P = buildFrostPlacement(island, mod);
const lanes = frostLanes(island);

test('eight critters, two of each species, stable ids, the food of each species', () => {
  assert.equal(plan.length, 8);
  assert.deepEqual(plan.map((c) => c.id), CRITTERS.spots.map((s) => s.id));
  for (const sp of CRITTERS.species) {
    const mine = plan.filter((c) => c.species === sp);
    assert.equal(mine.length, 2, sp);
    assert.deepEqual(mine.map((c) => c.index).sort(), [0, 1]);
    for (const c of mine) {
      assert.equal(c.id, `critter-${sp}-${c.index}`);
      assert.equal(c.food, CRITTERS.food[sp]);
      assert.ok(getItem(c.food), `catalog item ${c.food}`);
    }
  }
  assert.deepEqual(CRITTERS.food, { fox: 'snow-truffle', squirrel: 'pinecone', rabbit: 'mint', grouse: 'lingonberry' });
});

test('the plan is deterministic (a second computation matches exactly)', () => {
  const again = JSON.parse(JSON.stringify(plan));
  assert.deepEqual(JSON.parse(JSON.stringify(planCritters(island, mod))), again);
});

test('spawn points: walkable grass / snow, off the lanes, trail, camp clearing, lake, landing, solids and gathering spots; spaced apart', () => {
  const landing = landingFor(island);
  const gather = planFrostGathering(island, mod);
  const spots = [...gather.bushes, ...gather.herbs, ...gather.mushrooms, ...gather.digs];
  for (const c of plan) {
    const { x, z } = c.spawn;
    assert.ok(mod.walkable(x, z), `${c.id} walkable`);
    assert.ok(['grass', 'snow'].includes(mod.groundType(x, z)), `${c.id} ground ${mod.groundType(x, z)}`);
    assert.ok(Math.abs(mod.height(x, z) - c.spawn.y) < 1e-9);
    assert.ok(lanes.every((l) => polyDist(l, x, z) >= LANE_HALF), `${c.id} on a lane`);
    assert.ok(trailGap(island, x, z) >= PATH_CLEARANCE, `${c.id} on the trail`);
    assert.ok(campDist(island, x, z) >= FROST_CAMP.clear, `${c.id} in the camp clearing`);
    assert.ok(mod.lakeDist(x, z) > LAKE_CLEAR - 1, `${c.id} at the lake`);
    assert.ok(Math.hypot(x - landing.x, z - landing.z) > 14, `${c.id} at the landing`);
    for (const o of P.solids) assert.ok(Math.hypot(o.x - x, o.z - z) >= o.r + 0.5, `${c.id} inside a solid`);
    for (const g of spots) assert.ok(Math.hypot(g.x - x, g.z - z) >= 2, `${c.id} on a gathering spot`);
  }
  for (let i = 0; i < plan.length; i++) {
    for (let j = i + 1; j < plan.length; j++) {
      assert.ok(Math.hypot(plan[i].spawn.x - plan[j].spawn.x, plan[i].spawn.z - plan[j].spawn.z) >= MIN_APART, `${plan[i].id} / ${plan[j].id} too close`);
    }
  }
});

test('the critters are spread over the island: lake shore, plateau, near the peaks and far meadows', () => {
  const zones = plan.map((c) => c.zone).join('|');
  for (const w of ['lake', 'plateau', 'peaks', 'meadow', 'forest']) assert.ok(zones.includes(w), w);
  assert.ok(plan.some((c) => mod.height(c.spawn.x, c.spawn.z) > 7), 'someone lives on the plateau');
  assert.ok(plan.filter((c) => mod.lakeDist(c.spawn.x, c.spawn.z) < 17).length >= 1, 'a lake-shore critter');
});

test('every spawn point can be walked to from the bridge landing (grid flood fill over walkable ground)', () => {
  const landing = landingFor(island), step = 1.5, half = island.radius + 6;
  const key = (i, j) => i * 1000 + j;
  const toCell = (x, z) => [Math.round((x - island.x) / step), Math.round((z - island.z) / step)];
  const seen = new Set(), queue = [];
  const [li, lj] = toCell(landing.x, landing.z - 6);
  queue.push([li, lj]);
  seen.add(key(li, lj));
  while (queue.length) {
    const [i, j] = queue.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const a = i + di, b = j + dj;
      if (Math.abs(a * step) > half || Math.abs(b * step) > half || seen.has(key(a, b))) continue;
      const x = island.x + a * step, z = island.z + b * step;
      if (!mod.walkable(x, z) || mod.height(x, z) < 0.05) continue;
      seen.add(key(a, b));
      queue.push([a, b]);
    }
  }
  for (const c of plan) {
    const [i, j] = toCell(c.spawn.x, c.spawn.z);
    assert.ok(seen.has(key(i, j)), `${c.id} is not reachable`);
  }
});

test('roam points: at least three, all within the roam radius, on good ground, and every straight line between two of them stays on it', () => {
  for (const c of plan) {
    assert.ok(c.wander.length >= 3 && c.wander.length <= CRITTERS.wanderMax, c.id);
    const pts = [c.spawn, ...c.wander];
    for (const p of c.wander) {
      assert.ok(Math.hypot(p.x - c.spawn.x, p.z - c.spawn.z) <= CRITTERS.wander + 1e-6, `${c.id} roams too far`);
      assert.ok(mod.walkable(p.x, p.z) && ['grass', 'snow'].includes(mod.groundType(p.x, p.z)));
      assert.ok(trailGap(island, p.x, p.z) >= 0.6 && campDist(island, p.x, p.z) >= FROST_CAMP.clear);
    }
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        for (let k = 0; k <= 10; k++) {
          const x = pts[i].x + (pts[j].x - pts[i].x) * k / 10, z = pts[i].z + (pts[j].z - pts[i].z) * k / 10;
          assert.ok(mod.walkable(x, z) && ['grass', 'snow'].includes(mod.groundType(x, z)), `${c.id} path crosses bad ground`);
          for (const o of P.solids) assert.ok(Math.hypot(o.x - x, o.z - z) >= o.r + 0.3, `${c.id} path crosses a solid`);
        }
      }
    }
  }
});

test('dens: each critter gets its own reserved camp den spot, two per species side by side', () => {
  const dens = campReserved(island).dens;
  assert.equal(dens.length, 8);
  plan.forEach((c, i) => assert.deepEqual(c.den, dens[i]));
  assert.equal(new Set(plan.map((c) => `${c.den.x},${c.den.z}`)).size, 8);
  for (const sp of CRITTERS.species) {
    const ds = plan.map((c, i) => [c, i]).filter(([c]) => c.species === sp).map(([, i]) => i);
    assert.equal(Math.abs(ds[0] - ds[1]), 1, `${sp} dens are neighbours`);
  }
});

test('the hint fires once when a player comes close, re-arms after they leave, and reminds a lingering player after the cooldown', () => {
  const h = createHint({ near: 5, reset: 8, cooldown: 10 });
  assert.equal(h.check(20, 0), false);
  assert.equal(h.check(4.5, 1), true);
  assert.equal(h.check(4, 2), false);                  // still close, not re-armed
  assert.equal(h.check(6.5, 3), false);                // between near and reset: not re-armed yet
  assert.equal(h.check(4.9, 4), false);
  assert.equal(h.check(9, 5), false);                  // left: re-armed
  assert.equal(h.check(3, 5.5), true);                 // (more than the 3 s guard since the last hint)
  assert.equal(h.check(8.5, 6), false);
  assert.equal(h.check(3, 6.5), false);                // re-armed but inside the 3 s guard
  assert.equal(h.check(3, 9), true);
  assert.equal(h.check(3, 15), false);
  assert.equal(h.check(3, 19.5), true);                // lingering: the reminder after the cooldown
});

test('roam helpers: the next stop is never the current one and covers every other stop; hops and the hop arc', () => {
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const n = pickNextStop(5, 2, rnd);
    assert.notEqual(n, 2);
    assert.ok(n >= 0 && n < 5);
    seen.add(n);
  }
  assert.deepEqual([...seen].sort(), [0, 1, 3, 4]);
  assert.equal(pickNextStop(1, 0, rnd), 0);
  assert.equal(hopsFor(0.1, 0.85), 1);
  assert.equal(hopsFor(2, 0.85), 3);
  assert.equal(arc(0), 0);
  assert.equal(arc(0.5), 1);
  assert.equal(arc(1), 0);
});

test('moveCollider re-files a collider so the new position blocks and the old one is free', () => {
  const c = addCollider({ x: 500, z: 500, r: 0.5 });
  const probe = { x: 500.2, z: 500 };
  resolveCircle(probe, 0.3);
  assert.ok(Math.hypot(probe.x - 500, probe.z - 500) >= 0.8 - 1e-6, 'blocks at the old place');
  assert.ok(moveCollider(c, 509, 503));
  const old = { x: 500.2, z: 500 };
  resolveCircle(old, 0.3);
  assert.equal(old.x, 500.2, 'free at the old place');
  const fresh = { x: 509.2, z: 503 };
  resolveCircle(fresh, 0.3);
  assert.ok(Math.hypot(fresh.x - 509, fresh.z - 503) >= 0.8 - 1e-6, 'blocks at the new place');
  removeCollider(c);
});

test('a critter is never chopped, broken or dug: a held tool on it is a plain interact', () => {
  const crit = { type: 'critter' };
  for (const kind of ['axe', 'sword', 'lightsaber', 'hammer', 'shovel']) assert.equal(getToolAction({ state: 'held', kind }, crit), null, kind);
});
