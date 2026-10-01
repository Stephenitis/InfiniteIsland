// Step 29a: Frostpine props. Placement rules (nothing on the lake / ramps / landing zone / walking lanes / steep ground), determinism, counts,
// stable interactable ids of the gameplay data, the spot-sampling hook for 29b, the loot table and the chunk layer's per-instance hiding.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ISLANDS } from '../public/js/config.js';
import { getIslandModule } from '../public/js/world/islands/registry.js';
import { FROST_FEATURES } from '../public/js/world/islands/frost.js';
import {
  buildFrostPlacement, sampleFrostSpots, frostLanes, FROST_AREAS, LANDING_CLEAR, LANE_HALF, LAKE_CLEAR,
} from '../public/js/world/islands/frostPlacement.js';
import { polyDist, landingFor } from '../public/js/world/islands/scatter.js';
import { angleDiff } from '../public/js/world/islands/util.js';
import { lootFor, rollCount, rollDrop, LOOT } from '../public/js/world/lootTable.js';
import { buildChunkedLayer } from '../public/js/world/propChunks.js';
import { getAsset } from '../public/js/world/islands/frostAssets.js';
import { getInteractables, clearInteractables } from '../public/js/world/interactables.js';
import { clearColliders, getColliders } from '../public/js/world/colliders.js';

const island = ISLANDS.find((i) => i.id === 'frost');
const mod = getIslandModule('frost');
const P = buildFrostPlacement(island, mod);
const landing = landingFor(island);
const lanes = frostLanes(island);
const laneDist = (x, z) => Math.min(...lanes.map((l) => polyDist(l, x, z)));
const F = FROST_FEATURES;

test('conifer tiers have distinct facet normals for visible toon bands', () => {
  for (const layer of ['spruce', 'spruceSnow', 'pine', 'pineSnow']) {
    const geo = getAsset(layer).geo;
    const p = geo.attributes.position, n = geo.attributes.normal;
    const sides = new Set();
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) < 1.6 || p.getY(i) > 3.5 || Math.hypot(p.getX(i), p.getZ(i)) < 0.5) continue;
      sides.add(`${n.getX(i).toFixed(2)},${n.getZ(i).toFixed(2)}`);
    }
    assert.ok(sides.size >= 6, `${layer} lost its faceted side lighting`);
  }
});
const inRampWedge = (x, z) => {
  const dx = x - island.x - F.plateau.x, dz = z - island.z - F.plateau.z, d = Math.hypot(dx, dz);
  return d > F.plateau.r - 22 && d < F.plateau.r + 15 && F.rampAngles.some((ra) => angleDiff(Math.atan2(dz, dx), ra) < 0.42);
};
const all = () => [
  ...P.trees.map((o) => ({ k: 'tree', ...o })), ...P.boulders.map((o) => ({ k: 'boulder', ...o })), ...P.flowers.map((o) => ({ k: 'flower', ...o })),
  ...P.tufts.map((o) => ({ k: 'tuft', ...o })), ...P.logs.map((o) => ({ k: 'log', ...o })), ...P.spires.map((o) => ({ k: 'spire', ...o })),
  ...P.reeds.map((o) => ({ k: 'reed', ...o })), ...P.snowmen.map((o) => ({ k: 'snowman', ...o })),
];

test('placement is deterministic (a fresh module instance gives the identical result)', async () => {
  const fresh = await import('../public/js/world/islands/frostPlacement.js?fresh');
  const again = fresh.buildFrostPlacement(island, mod);
  assert.notEqual(again, P);
  assert.equal(JSON.stringify(again), JSON.stringify(P));
});

test('counts are in the expected ranges (trees about 2.5-3x home: 35 trees + 8 palms)', () => {
  assert.ok(P.trees.length >= 110 && P.trees.length <= 150, `trees ${P.trees.length}`);
  assert.ok(P.trees.filter((t) => t.variant === 'birch').length >= 15);
  assert.ok(P.trees.filter((t) => t.variant === 'spruce').length >= 25);
  assert.ok(P.trees.filter((t) => t.variant === 'pine').length >= 25);
  assert.ok(P.trees.some((t) => t.snow) && P.trees.some((t) => !t.snow));
  assert.ok(P.boulders.length >= 22 && P.boulders.length <= 40, `boulders ${P.boulders.length}`);
  assert.ok(P.boulders.some((b) => b.snow) && P.boulders.some((b) => !b.snow));
  assert.ok(P.flowers.length >= 100 && P.flowers.length <= 260);
  const boing = P.flowers.filter((f) => f.interactive).length;
  assert.ok(boing >= 15 && boing <= 30, `boing ${boing}`);
  assert.ok(P.snowmen.length >= 4 && P.snowmen.length <= 10);
  assert.ok(P.logs.length >= 3 && P.spires.length >= 6 && P.reeds.length >= 6 && P.tufts.length >= 150);
});

test('nothing near the bridge landing, on the ice, on the ramps or on steep ground', () => {
  for (const o of all()) {
    const near = Math.hypot(o.x - landing.x, o.z - landing.z);
    assert.ok(near >= (o.k === 'flower' || o.k === 'tuft' ? 10 : LANDING_CLEAR), `${o.k} ${near.toFixed(1)} u from the landing`);
    assert.notEqual(mod.groundType(o.x, o.z), 'ice', `${o.k} on the ice`);
    assert.notEqual(mod.groundType(o.x, o.z), 'water');
    assert.ok(mod.lakeDist(o.x, o.z) >= (o.k === 'reed' ? 11.2 : LAKE_CLEAR - 0.01), `${o.k} on the lake bank (${mod.lakeDist(o.x, o.z).toFixed(1)})`);
    assert.ok(!inRampWedge(o.x, o.z), `${o.k} on a ramp`);
    assert.ok(Number.isFinite(o.y));
  }
  for (const o of [...P.trees, ...P.boulders, ...P.snowmen, ...P.logs]) {
    assert.ok(mod.walkable(o.x, o.z), 'solid prop on unwalkable ground');
    assert.ok(mod.inland(o.x, o.z) >= 12, 'solid prop on the beach tier');
  }
});

test('the walking lanes stay clear of solid props', () => {
  for (const o of [...P.trees, ...P.boulders, ...P.snowmen, ...P.spires]) {
    assert.ok(laneDist(o.x, o.z) >= LANE_HALF, `${o.layer || o.k} ${laneDist(o.x, o.z).toFixed(1)} u from a lane`);
  }
  for (const l of P.logs) for (const [x, z] of l.circles) assert.ok(laneDist(x, z) >= 2, 'log on a lane');
});

test('every lane is walkable terrain from end to end (no cliff on the way)', () => {
  for (const lane of lanes) {
    for (let i = 0; i + 1 < lane.length; i++) {
      const [ax, az] = lane[i], [bx, bz] = lane[i + 1];
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5);
      for (let k = 0; k <= n; k++) assert.ok(mod.walkable(ax + (bx - ax) * k / n, az + (bz - az) * k / n), `lane point ${i}/${k} not walkable`);
    }
  }
});

test('solids do not overlap each other', () => {
  const s = [...P.trees.map((o) => [o.x, o.z, o.r]), ...P.boulders.map((o) => [o.x, o.z, o.r]), ...P.snowmen.map((o) => [o.x, o.z, o.r])];
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
    assert.ok(Math.hypot(s[i][0] - s[j][0], s[i][1] - s[j][1]) >= s[i][2] + s[j][2], 'two solids overlap');
  }
});

test('the forest has glades: dense clumps and open patches of tree ground', () => {
  const cells = new Map();                                            // trees per 20 u cell (world-aligned)
  for (const t of P.trees) { const k = `${Math.floor(t.x / 20)},${Math.floor(t.z / 20)}`; cells.set(k, (cells.get(k) || 0) + 1); }
  assert.ok(Math.max(...cells.values()) >= 6, 'no dense clump');
  let ground = 0, empty = 0;                                          // cells whose centre is tree ground (grass / snow, above the beach, not the lake)
  for (let x = Math.floor((island.x - 110) / 20); x <= Math.floor((island.x + 110) / 20); x++) {
    for (let z = Math.floor((island.z - 110) / 20); z <= Math.floor((island.z + 110) / 20); z++) {
      const wx = x * 20 + 10, wz = z * 20 + 10;
      if (mod.inland(wx, wz) < 13 || mod.groundType(wx, wz) === 'ice' || mod.height(wx, wz) < 1) continue;
      ground++;
      if (!cells.has(`${x},${z}`)) empty++;
    }
  }
  assert.ok(ground > 40 && empty / ground >= 0.15, `glades: ${empty} of ${ground} cells are empty`);
});

test('sampleFrostSpots (29b hook): deterministic, valid ground, clear of every placed solid, lane, ramp and the lake', () => {
  for (const area of Object.keys(FROST_AREAS)) {
    const a = sampleFrostSpots(island, mod, { area, count: 10, seed: 3, r: 0.6, minDist: 4 });
    const b = sampleFrostSpots(island, mod, { area, count: 10, seed: 3, r: 0.6, minDist: 4 });
    assert.deepEqual(a, b);
    assert.ok(a.length >= 5, `${area}: only ${a.length} spots`);
    for (const s of a) {
      assert.ok(FROST_AREAS[area](mod, s.x, s.z, s.y));
      assert.ok(laneDist(s.x, s.z) >= 1.8 && !inRampWedge(s.x, s.z));
      assert.ok(mod.lakeDist(s.x, s.z) >= LAKE_CLEAR - 1);
      for (const o of P.solids) assert.ok(Math.hypot(o.x - s.x, o.z - s.z) >= o.r + 0.6, 'spot inside a solid');
    }
  }
  assert.throws(() => sampleFrostSpots(island, mod, { area: 'nowhere' }));
});

test('loot table: every variant is covered, rolls stay in range, chop / fell hooks stay empty (29b fills shake + extra)', () => {
  for (const v of ['spruce', 'pine', 'sapling', 'birch', 'granite']) assert.ok(lootFor(v), v);
  assert.equal(lootFor('oak'), null);
  assert.equal(lootFor(undefined), null);
  for (let i = 0; i < 200; i++) {
    const n = rollCount(LOOT.spruce.logs);
    assert.ok(n >= 2 && n <= 3);
    const s = rollCount(LOOT.granite.stone);
    assert.ok(s >= 1 && s <= 2);
  }
  assert.equal(rollDrop(LOOT.pine.chop), 0);
  assert.equal(rollDrop(LOOT.pine.fell), 0);
  assert.equal(rollDrop(LOOT.pine.shake, () => 0.9), 0);                // a 50 % shake that rolls 0.9: no cone
  assert.equal(rollDrop(LOOT.pine.shake, () => 0.1), 1);
  assert.equal(rollDrop({ item: 'pinecone', chance: 1 }), 1);
  assert.equal(rollDrop({ item: 'pinecone', chance: 1, count: [2, 2] }), 2);
  assert.equal(rollDrop({ item: 'x', chance: 0 }), 0);
});

test('chunk layer: setItemVisible hides and restores exactly one instance', () => {
  const items = [{ x: 1, y: 0, z: 1, rot: 0.5, sx: 1.2, sy: 1.4 }, { x: 3, y: 0, z: 2, rot: 1, s: 1 }, { x: 90, y: 0, z: 90, s: 1 }];
  const layer = buildChunkedLayer({ name: 't', geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial(), items, origin: { x: 0, z: 0 } });
  const m = new THREE.Matrix4(), v = new THREE.Vector3();
  const scaleOf = (item) => { const w = layer.locate(item); w.mesh.getMatrixAt(w.index, m); return v.setFromMatrixScale(m).clone(); };
  const before = [scaleOf(items[0]), scaleOf(items[1])];
  assert.ok(Math.abs(before[0].z - items[0].sx) < 1e-6);           // the stationary tree matches its shaking proxy's X/Z scale
  assert.ok(layer.setItemVisible(items[0], false));
  assert.equal(scaleOf(items[0]).length(), 0);
  assert.ok(scaleOf(items[1]).equals(before[1]));
  layer.setItemVisible(items[0], true);
  assert.ok(Math.abs(scaleOf(items[0]).y - 1.4) < 1e-6 && Math.abs(scaleOf(items[0]).x - 1.2) < 1e-6);
  assert.ok(Math.abs(scaleOf(items[0]).z - items[0].sx) < 1e-6);
  assert.equal(layer.setItemVisible({ x: 0 }, false), false);
  assert.equal(layer.chunks.length, 2);                                         // two items share a chunk, the far one has its own
  layer.dispose();
});

test('gameplay data: stable consecutive interactable ids in placement order, colliders for every solid', async () => {
  clearInteractables(); clearColliders();
  const fresh = await import('../public/js/world/islands/frostWorld.js?ids');
  const data = fresh.registerFrostGameplay(island);
  const ints = getInteractables();
  const expected = P.trees.length + P.boulders.length + P.snowmen.length + P.flowers.filter((f) => f.interactive).length + P.signs.length;   // (+ the camp signposts, Step 33b)
  assert.equal(ints.length, expected);
  assert.equal(data.harvestables.length, P.trees.length + P.boulders.length);
  ints.forEach((it, i) => assert.equal(it.id, ints[0].id + i, 'ids are consecutive'));
  ints.slice(0, P.trees.length).forEach((it, i) => {
    assert.equal(it.type, 'tree');
    assert.equal(it.object.userData.variant, P.trees[i].variant);
    assert.equal(it.position.x, P.trees[i].x);
  });
  const rocks = ints.slice(P.trees.length, P.trees.length + P.boulders.length);
  assert.ok(rocks.every((r) => r.type === 'rock' && r.object.userData.variant === 'granite'));
  assert.equal(getColliders().length, P.trees.length + P.boulders.length + P.snowmen.length + P.logs.length * 3 + P.spires.length + P.signs.length + P.posts.length);
  // an instanced tree defaults to "show the instance, hide the proxy"; harvest + shake votes combine with 'none' > 'proxy' > 'static'
  const g = data.harvestables[0], b = g.userData.binding;
  assert.equal(g.visible, false);
  b.set('shake', 'proxy'); assert.equal(b.mode, 'proxy'); assert.equal(g.visible, true);
  b.set('harvest', 'none'); assert.equal(b.mode, 'none'); assert.equal(g.visible, false);
  b.set('shake', 'static'); assert.equal(b.mode, 'none');
  b.set('harvest', 'static'); assert.equal(b.mode, 'static');
  clearInteractables(); clearColliders();
});
