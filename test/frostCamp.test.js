// Step 33b: the Frostpine camp (fire entry, clearing, reserved spots, signs) and the trail (world/paths.js): the camp fire exists and unlocks Frostpine's recipes /
// quests, the clearing and the trail are free of every prop / gathering spot / tool spot, the trail is walkable end to end, about 12-15 s long, deterministic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ISLANDS, FIRES, CAMPFIRE_ISLANDS, FROST_CAMP, PATHS, PATH_CLEARANCE, PLAYER_SPEED, nearAnyFire } from '../public/js/config.js';
import { getIslandModule } from '../public/js/world/islands/registry.js';
import { buildFrostPlacement, sampleFrostSpots, frostLanes, trailGap } from '../public/js/world/islands/frostPlacement.js';
import { planFrostGathering } from '../public/js/world/islands/frostGathering.js';
import { campCentre, campDist, campReserved, campSigns, campPaint } from '../public/js/world/islands/frostCamp.js';
import { getPath, buildPath, pathMarkers, pathPaint, pathDist, pathWorld, pathPolylines, pointAt } from '../public/js/world/paths.js';
import { listRecipes } from '../public/js/game/catalog.js';
import { QuestLog, QUESTS } from '../public/js/game/quests.js';
import { saveKeyOf, domainOf, menuIdOf } from '../public/js/game/fireLogic.js';
import { polyDist } from '../public/js/world/islands/scatter.js';

const island = ISLANDS.find((i) => i.id === 'frost');
const mod = getIslandModule('frost');
const P = buildFrostPlacement(island, mod);
const G = planFrostGathering(island, mod);
const path = getPath('frost-camp');
const camp = campCentre(island);
const fire = FIRES.find((f) => f.id === 'frost');
const at = (i) => [island.x + path.samples[i][0], island.z + path.samples[i][1]];

test('the camp fire is a FIRES entry on Frostpine: its own island, keys, stump seats, derived islands', () => {
  assert.ok(fire);
  assert.equal(fire.island, 'frost');
  assert.deepEqual([fire.x, fire.z], [camp.x, camp.z]);
  assert.equal(fire.clear, FROST_CAMP.clear);
  assert.ok(FROST_CAMP.clear >= 14);
  assert.equal(fire.bench.style, 'stump');
  assert.equal(fire.bench.angles.length, 4);
  assert.deepEqual(CAMPFIRE_ISLANDS, ['home', 'frost', 'ember', 'duskcrown']);   // (Step 37a added the Emberleaf garden hearth, Step 72a the Duskcrown marsh hearth)
  assert.equal(saveKeyOf('frost'), 'infinite-island.campfire.frost.v1');
  assert.equal(domainOf('frost'), 'campfire:frost');
  assert.equal(menuIdOf('frost'), 'campfire:frost');
  assert.equal(FIRES.filter((f) => f.id === 'home').length, 1);
  assert.equal(nearAnyFire(camp.x + 13, camp.z), true);       // props / tools read the camp's clearing too
  assert.equal(nearAnyFire(camp.x + 14.5, camp.z), false);
});

test('the camp sits on flat, walkable ground: levelled pad, no slope trouble', () => {
  for (const r of [0, 3, 6, 9, 12, 14]) {
    for (let a = 0; a < 6.28; a += 0.4) {
      const x = camp.x + Math.cos(a) * r, z = camp.z + Math.sin(a) * r;
      assert.ok(mod.walkable(x, z), `unwalkable at r=${r}`);
      assert.equal(mod.groundType(x, z), 'grass');
      if (r <= FROST_CAMP.flat.r) assert.ok(Math.abs(mod.height(x, z) - mod.campH) < 1e-9, 'the pad is level');
    }
  }
  assert.ok(mod.campH > 1.5 && mod.campH < 4, `camp height ${mod.campH}`);
  assert.ok(mod.lakeDist(camp.x, camp.z) > 20);
});

test('Frostpine recipes: three, and its feast quests open once a fire exists on Frostpine and the bridge is built', () => {
  assert.equal(listRecipes('frost').length, 3);
  const homeOnly = new QuestLog({ persist: false, fireIslands: ['home'] });
  homeOnly.setBridgeProvider(() => true);
  assert.equal(homeOnly.available().filter((t) => t.island === 'frost').length, 0);
  const withCamp = new QuestLog({ persist: false, fireIslands: CAMPFIRE_ISLANDS });
  withCamp.setBridgeProvider((id) => id === 'frost');
  assert.ok(withCamp.available().filter((t) => t.island === 'frost').length >= 2, 'both Frostpine feasts need the camp fire');
  const noBridge = new QuestLog({ persist: false, fireIslands: CAMPFIRE_ISLANDS });
  noBridge.setBridgeProvider(() => false);
  assert.equal(noBridge.available().filter((t) => t.island === 'frost').length, 0, 'not before the bridge');
  assert.ok(QUESTS.some((t) => t.island === 'frost'));
});

test('reserved spots (8 dens, build spots, tail stump) lie inside the clearing, off the fire ring and the stumps, and do not overlap each other', () => {
  const R = campReserved(island);
  assert.equal(R.dens.length, 8);
  const all = [...R.dens.map((o) => ['den', o]), ['tail', R.tailStump]];
  for (const [k, v] of Object.entries(R.build)) for (const o of [].concat(v)) all.push([k, o]);
  for (const [k, o] of all) {
    assert.ok(campDist(island, o.x, o.z) + o.r <= FROST_CAMP.clear, `${k} outside the clearing`);
    assert.ok(mod.walkable(o.x, o.z), `${k} unwalkable`);
    if (k !== 'windbreak') assert.ok(campDist(island, o.x, o.z) - o.r >= 3.3, `${k} too close to the fire / stumps`);
  }
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i][1], b = all[j][1];
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= a.r + b.r, `${all[i][0]} overlaps ${all[j][0]}`);
    }
  }
  for (const [k, o] of all) assert.ok(trailGap(island, o.x, o.z) >= o.r * 0.5 - 0.5 || campDist(island, o.x, o.z) < 6, `${k} on the trail`);
});

test('nothing Frostpine places lies in the camp clearing: trees, boulders, flowers, tufts, logs, spires, snowmen, gathering spots', () => {
  const C = FROST_CAMP.clear;
  const solids = [...P.trees, ...P.boulders, ...P.snowmen, ...P.spires, ...P.logs.flatMap((l) => l.circles.map(([x, z]) => ({ x, z, r: l.r })))];
  for (const o of solids) assert.ok(campDist(island, o.x, o.z) >= C, `solid ${o.layer || o.variant || ''} ${campDist(island, o.x, o.z).toFixed(1)} u from the camp`);
  for (const o of [...P.flowers, ...P.tufts, ...P.reeds]) assert.ok(campDist(island, o.x, o.z) >= C, 'decor in the clearing');
  for (const o of [...G.bushes, ...G.herbs, ...G.mushrooms, ...G.digs]) assert.ok(campDist(island, o.x, o.z) >= C, `gathering spot ${o.id} in the clearing`);
  for (const s of sampleFrostSpots(island, mod, { area: 'meadow', count: 40, seed: 99, r: 1.2, minDist: 3 })) assert.ok(campDist(island, s.x, s.z) >= C);
});

test('nothing sits on the camp trail: props, decor, gathering spots keep clear (lane + painted width + clearance)', () => {
  const half = path.width / 2;
  for (const o of [...P.trees, ...P.boulders, ...P.snowmen, ...P.spires]) assert.ok(trailGap(island, o.x, o.z) + half >= 3.4, `${o.layer || o.variant} ${(trailGap(island, o.x, o.z) + half).toFixed(1)} from the trail centre`);
  for (const l of P.logs) for (const [x, z] of l.circles) assert.ok(trailGap(island, x, z) >= 0.5);
  for (const o of [...P.flowers, ...P.tufts]) assert.ok(trailGap(island, o.x, o.z) >= PATH_CLEARANCE - 0.6 - 1e-9, 'decor on the trail');
  for (const o of [...G.bushes, ...G.herbs, ...G.mushrooms, ...G.digs]) assert.ok(trailGap(island, o.x, o.z) >= PATH_CLEARANCE, `gathering spot ${o.id} on the trail`);
  assert.ok(frostLanes(island).length >= 5, 'the trail is one of the lanes');
});

test('the trail: deterministic, walkable end to end, starts at the landing end and ends in the camp, 12-15 s of running', () => {
  const again = buildPath(PATHS[0]);
  assert.deepEqual(again.samples, path.samples);
  assert.ok(path.length / PLAYER_SPEED >= 12 && path.length / PLAYER_SPEED <= 15, `${(path.length / PLAYER_SPEED).toFixed(1)} s`);
  const first = path.samples[0], last = path.samples[path.samples.length - 1];
  assert.deepEqual(first, PATHS[0].points[0]);
  assert.ok(Math.hypot(first[0] - 9.5, first[1] - 114.5) < 8, 'starts at the bridge landing');
  assert.ok(Math.hypot(last[0] - FROST_CAMP.x, last[1] - FROST_CAMP.z) < FROST_CAMP.paint.full, 'ends inside the camp clearing');
  const w = pathWorld(island, path);
  for (let i = 0; i < w.length; i++) {
    assert.ok(mod.walkable(w[i][0], w[i][1]), `trail sample ${i} not walkable`);
    const a = w[Math.max(0, i - 1)], b = w[Math.min(w.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    for (const k of [-1.5, 1.5]) assert.ok(mod.walkable(w[i][0] - (b[1] - a[1]) / l * k, w[i][1] + (b[0] - a[0]) / l * k), `trail edge ${i} not walkable`);
    if (i) assert.ok(Math.hypot(w[i][0] - w[i - 1][0], w[i][1] - w[i - 1][1]) < 1, 'gap between samples');
    assert.notEqual(mod.groundType(w[i][0], w[i][1]), 'ice');
  }
  let maxSlope = 0;
  for (const [x, z] of w) maxSlope = Math.max(maxSlope, Math.hypot(mod.height(x + 0.5, z) - mod.height(x - 0.5, z), mod.height(x, z + 0.5) - mod.height(x, z - 0.5)));
  assert.ok(maxSlope < 0.5, `slope ${maxSlope}`);
  assert.ok(path.length > 1.12 * Math.hypot(last[0] - first[0], last[1] - first[1]), 'it meanders');
});

test('trail paint: solid on the centre line, a soft edge, none far away; the camp clearing paints round the fire', () => {
  const [x, z] = at(40);
  assert.equal(pathPaint(island, x, z).w, 1);
  assert.equal(pathPaint(island, x, z).surface, 'snow');
  let soft = false;
  for (let d = 0; d <= 3; d += 0.25) { const v = pathPaint(island, x + d, z).w; if (v > 0.05 && v < 0.95) soft = true; }
  assert.ok(soft, 'no soft edge');
  assert.equal(pathPaint(island, island.x - 80, island.z + 50).w, 0);
  assert.equal(campPaint(island, camp.x, camp.z).w, 1);
  assert.equal(campPaint(island, camp.x + FROST_CAMP.paint.fade + 1, camp.z).w, 0);
  assert.ok(pathDist(island, path, ...at(10)) < 1e-6);
});

test('lantern posts: about every 15 u, alternating sides, off the painted trail, none in the camp, fixed positions', () => {
  const m = pathMarkers(island, path);
  assert.ok(m.length >= 4 && m.length <= 7, `${m.length} posts`);
  for (let i = 1; i < m.length; i++) assert.ok(Math.abs(m[i].s - m[i - 1].s - PATHS[0].marker.every) < 1e-6 && m[i].side === -m[i - 1].side);
  for (const p of m) {
    const d = pathDist(island, path, p.x, p.z);
    assert.ok(d > path.width / 2 && d < PATHS[0].marker.side + 0.6, `post ${d.toFixed(2)} u from the centre line`);
    assert.ok(Math.abs(Math.hypot(p.tx, p.tz) - 1) < 0.01);
    assert.ok(campDist(island, p.x, p.z) > 8);
    assert.ok(mod.walkable(p.x, p.z));
  }
  assert.equal(P.posts.length, m.length);
  assert.deepEqual(pathMarkers(island, buildPath(PATHS[0])).map((p) => [p.x, p.z]), m.map((p) => [p.x, p.z]));
});

test('signposts: one by the landing end, one at the camp, claimed as solids, off the trail surface, facing the camera', () => {
  const S = campSigns(island);
  assert.equal(S.length, 2);
  assert.deepEqual(P.signs.map((s) => s.id), S.map((s) => s.id));
  for (const s of S) {
    assert.ok(s.pages.length >= 1 && s.pages.every((t) => typeof t === 'string' && t.length > 10));
    assert.ok(Math.abs(s.yaw) < 0.4, 'a board must face the default camera (+z)');
    assert.ok(trailGap(island, s.x, s.z) >= 0.8, 'sign on the trail');
    assert.ok(mod.walkable(s.x, s.z));
    assert.ok(P.solids.some((o) => Math.hypot(o.x - s.x, o.z - s.z) < 1e-9), 'sign not claimed');
  }
  assert.ok(Math.hypot(S[0].x - (island.x + 9.5), S[0].z - (island.z + 114.5)) < 25, 'the first sign is by the landing');
  assert.ok(campDist(island, S[1].x, S[1].z) < FROST_CAMP.clear);
  assert.equal(pathPolylines(island).length, 1);
  assert.ok(polyDist(pathPolylines(island)[0], ...at(30)) < 1e-6 || polyDist(pathPolylines(island)[0], ...at(30)) < 3);
  assert.ok(Number.isFinite(pointAt(island, path, 5, 0).x));
});
