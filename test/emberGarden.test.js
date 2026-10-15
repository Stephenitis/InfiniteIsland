// Step 37a: the Emberleaf terrace garden site (hearth, zone, reserved spots), its trail, signposts, torch posts, the reserved waterfall corridor and the Emberleaf tools.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ISLANDS, FIRES, CAMPFIRE_ISLANDS, EMBER_GARDEN, EMBER_WATERFALL, PATHS, PLAYER_SPEED, nearAnyFire } from '../public/js/config.js';
import { getIslandModule } from '../public/js/world/islands/registry.js';
import { EMBER_FEATURES as F } from '../public/js/world/islands/ember.js';
import { buildEmberPlacement, emberForbidden, sampleEmberSpots } from '../public/js/world/islands/emberPlacement.js';
import { planEmberGathering, planEmberTools, EMBER_TOOL_KINDS } from '../public/js/world/islands/emberGathering.js';
import { gardenCentre, gardenZone, gardenPaint, gardenReserved, gardenDecor, gardenSigns, gardenPosts, waterfallForbidden, waterfallFord, waterfall, polar, fromPolar } from '../public/js/world/islands/emberGarden.js';
import { getPath, pathWorld, pathDist, pathPaint } from '../public/js/world/paths.js';
import { listRecipes } from '../public/js/game/catalog.js';
import { QuestLog, QUESTS } from '../public/js/game/quests.js';
import { saveKeyOf, domainOf, menuIdOf } from '../public/js/game/fireLogic.js';
import { landingFor, polyDist } from '../public/js/world/islands/scatter.js';
import { registerEmberGameplay } from '../public/js/world/islands/emberWorld.js';
import { getInteractables } from '../public/js/world/interactables.js';
import { getColliders } from '../public/js/world/colliders.js';
import { buildEmberVisuals } from '../public/js/world/islands/emberVisuals.js';

const island = ISLANDS.find((i) => i.id === 'ember');
const mod = getIslandModule('ember');
const P = buildEmberPlacement(island, mod);
const G = planEmberGathering(island, mod);
const hearth = gardenCentre(island);
const fire = FIRES.find((f) => f.id === 'ember');
const path = getPath('ember-garden');
const landing = landingFor(island);
const slopeAt = (x, z) => Math.hypot(mod.height(x + 0.5, z) - mod.height(x - 0.5, z), mod.height(x, z + 0.5) - mod.height(x, z - 0.5));
const pad = (o) => o.r || 0;

test('the garden hearth is a FIRES entry on Emberleaf: its own island, keys, basalt seats, derived islands', () => {
  assert.ok(fire);
  assert.equal(fire.island, 'ember');
  assert.deepEqual([fire.x, fire.z], [hearth.x, hearth.z]);
  assert.equal(fire.bench.style, 'basalt');
  assert.equal(fire.bench.angles.length, 4);
  assert.deepEqual(fire.feast.seatOrder.slice().sort(), [0, 1, 2, 3]);
  assert.ok(fire.intro.length >= 2 && fire.intro.every((t) => typeof t === 'string' && t.length > 20));
  assert.equal(fire.jobs, false);
  assert.deepEqual(CAMPFIRE_ISLANDS, ['home', 'frost', 'ember', 'duskcrown']);
  assert.equal(saveKeyOf('ember'), 'infinite-island.campfire.ember.v1');
  assert.equal(domainOf('ember'), 'campfire:ember');
  assert.equal(menuIdOf('ember'), 'campfire:ember');
  assert.equal(nearAnyFire(hearth.x + EMBER_GARDEN.clear - 0.5, hearth.z), true);
  assert.equal(nearAnyFire(hearth.x + EMBER_GARDEN.clear + 0.5, hearth.z), false);
});

test('Emberleaf recipes: four, and its two feast quests open once the ember bridge is built and a fire exists on Emberleaf', () => {
  assert.equal(listRecipes('ember').length, 4);
  const homeFrost = new QuestLog({ persist: false, fireIslands: ['home', 'frost'] });
  homeFrost.setBridgeProvider(() => true);
  assert.equal(homeFrost.available().filter((t) => t.island === 'ember').length, 0, 'no fire on Emberleaf yet');
  const withHearth = new QuestLog({ persist: false, fireIslands: CAMPFIRE_ISLANDS });
  withHearth.setBridgeProvider((id) => id === 'ember');
  assert.ok(withHearth.available().filter((t) => t.island === 'ember').length >= 2);
  const noBridge = new QuestLog({ persist: false, fireIslands: CAMPFIRE_ISLANDS });
  noBridge.setBridgeProvider(() => false);
  assert.equal(noBridge.available().filter((t) => t.island === 'ember').length, 0, 'not before the bridge');
  assert.ok(QUESTS.some((t) => t.island === 'ember'));
});

test('the hearth pad is level and walkable, but the terraces are NOT flattened (three distinct tiers remain)', () => {
  for (const r of [0, 2, 3, 3.4]) {
    for (let a = 0; a < 6.28; a += 0.5) assert.ok(Math.abs(mod.height(hearth.x + Math.cos(a) * r, hearth.z + Math.sin(a) * r) - mod.gardenH) < 1e-9, 'the pad is level');
  }
  for (const r of [0, 4, 7, 10]) for (let a = 0; a < 6.28; a += 0.4) assert.ok(mod.walkable(hearth.x + Math.cos(a) * r, hearth.z + Math.sin(a) * r), `unwalkable ${r} u from the hearth`);
  const hAt = (d) => { const p = fromPolar(island, Math.PI / 2 + 0.25, d); return mod.height(p.x, p.z); };   // (off the hearth axis: the pad blends in within 8.5 u of the hearth)
  assert.ok(hAt(41) - hAt(55) > 3.5, 'the top tier is well above the bottom tier');
  assert.ok(hAt(41) > 6.8 && mod.gardenH > 4.8 && mod.gardenH < 5.7, `tier heights ${hAt(41)} / ${mod.gardenH}`);
  let maxSlope = 0;
  for (let a = 0; a < 6.28; a += 0.3) for (let r = 0; r <= 8; r += 1) maxSlope = Math.max(maxSlope, slopeAt(hearth.x + Math.cos(a) * r, hearth.z + Math.sin(a) * r));
  assert.ok(maxSlope < 0.75, `slope near the hearth ${maxSlope}`);
});

test('the garden zone and the reserved waterfall corridor are free of every prop, decor, gathering spot and tool', () => {
  const tools = planEmberTools(island, mod);
  const all = [...P.trees, ...P.boulders, ...P.ferns, ...P.flowers, ...P.decor, ...G.herbs, ...G.digs, ...tools];
  for (const o of all) {
    assert.ok(!gardenZone(island, o.x, o.z, pad(o)), `${o.layer || o.id || o.kind} in the garden zone`);
    assert.ok(!waterfallForbidden(island, o.x, o.z, pad(o)), `${o.layer || o.id || o.kind} in the waterfall corridor`);
  }
  for (const s of sampleEmberSpots(island, mod, { area: 'soil', count: 40, seed: 77, r: 0.8, minDist: 3 })) {
    assert.ok(!gardenZone(island, s.x, s.z) && !waterfallForbidden(island, s.x, s.z));
    assert.ok(!emberForbidden(island, mod, P.lanes, s.x, s.z, 0));
  }
  // the wedge covers the tiers: the hearth, the reserved plots and Mossback's spot are inside it
  assert.ok(gardenZone(island, hearth.x, hearth.z));
  const R = gardenReserved(island, mod);
  for (const o of [...R.plots, R.mossback, R.garland, ...R.stages]) assert.ok(gardenZone(island, o.x, o.z), 'reserved spot outside the zone');
});

test('the waterfall corridor is reserved clear of the garden, both ramp wedges and the hearth; the trail crosses the stream once (a ford)', () => {
  const w = waterfall(island);
  assert.ok(!gardenZone(island, w.pool.x, w.pool.z, 0), 'pool inside the garden zone');
  assert.ok(Math.hypot(w.pool.x - hearth.x, w.pool.z - hearth.z) > 20);
  const pp = polar(island, w.pool.x, w.pool.z);
  assert.ok(pp.d > 38 && pp.d < 44, `pool ${pp.d} u from the volcano: under the cliff band`);
  assert.ok(Math.abs(pp.a - EMBER_WATERFALL.angle) < 0.05, 'the pool is on the fall line');
  for (const ra of F.rampAngles) assert.ok(Math.abs(Math.atan2(Math.sin(EMBER_WATERFALL.angle - ra), Math.cos(EMBER_WATERFALL.angle - ra))) > 0.7, 'the fall line is clear of the ramps');
  const ford = waterfallFord(island);
  assert.ok(ford.gap < 1, `the trail meets the stream line (${ford.gap.toFixed(2)} u)`);
  assert.ok(mod.walkable(ford.x, ford.z));
  // the trail crosses the stream polyline exactly once: the side of the line flips once along the trail
  const sides = pathWorld(island, path).map(([x, z]) => {
    let best = null;
    for (let i = 0; i + 1 < w.stream.length; i++) {
      const [ax, az] = w.stream[i], [bx, bz] = w.stream[i + 1];
      const d = polyDist([[ax, az], [bx, bz]], x, z);
      if (!best || d < best.d) best = { d, side: Math.sign((bx - ax) * (z - az) - (bz - az) * (x - ax)) };
    }
    return best.side;
  });
  let flips = 0;
  for (let i = 1; i < sides.length; i++) if (sides[i] !== sides[i - 1]) flips++;
  assert.equal(flips, 1, 'the trail crosses the stream once');
  assert.ok(ford.s > 100 && ford.s < path.length - 10, 'the ford is mid-trail');
});

test('every Step 30 route plus the two garden routes and the trail are walkable and reach their targets', () => {
  assert.equal(P.lanes.length, 9);
  const ends = [[F.lagoon.x - 15, F.lagoon.z], [F.spring.x, F.spring.z]];
  for (const a of F.rampAngles) for (const d of [43, 14]) ends.push([F.volcano.x + Math.cos(a) * d, F.volcano.z + Math.sin(a) * d]);
  P.lanes.slice(0, 6).forEach((lane, i) => assert.ok(Math.hypot(lane.at(-1)[0] - island.x - ends[i][0], lane.at(-1)[1] - island.z - ends[i][1]) < 2, `route ${i}`));
  F.rampAngles.forEach((a, i) => {
    const lane = P.lanes[6 + i], t = [F.volcano.x + Math.cos(a) * 43, F.volcano.z + Math.sin(a) * 43];
    assert.ok(Math.hypot(lane[0][0] - hearth.x, lane[0][1] - hearth.z) < 8, 'a garden route starts at the hearth');
    assert.ok(Math.hypot(lane.at(-1)[0] - island.x - t[0], lane.at(-1)[1] - island.z - t[1]) < 2, 'and ends at a ramp foot');
  });
  for (const lane of P.lanes) {
    for (let j = 1; j < lane.length; j++) for (let u = 0; u <= 1; u += 0.25) assert.ok(mod.walkable(lane[j - 1][0] + (lane[j][0] - lane[j - 1][0]) * u, lane[j - 1][1] + (lane[j][1] - lane[j - 1][1]) * u));
  }
});

test('the garden trail: deterministic, walkable end to end, from the landing spit to the garden, packed earth', () => {
  const def = PATHS.find((p) => p.id === 'ember-garden');
  assert.equal(def.island, 'ember');
  assert.equal(def.surface, 'earth');
  const first = path.samples[0], last = path.samples.at(-1);
  assert.ok(Math.hypot(first[0] - (landing.x - island.x), first[1] - (landing.z - island.z)) < 8, 'starts at the bridge landing');
  assert.ok(Math.hypot(last[0] - EMBER_GARDEN.x, last[1] - EMBER_GARDEN.z) < 17, 'ends at the garden');
  assert.ok(path.length / PLAYER_SPEED < 30, `${(path.length / PLAYER_SPEED).toFixed(1)} s of running`);
  const w = pathWorld(island, path);
  let maxSlope = 0;
  for (let i = 0; i < w.length; i++) {
    assert.ok(mod.walkable(w[i][0], w[i][1]), `trail sample ${i} not walkable`);
    const a = w[Math.max(0, i - 1)], b = w[Math.min(w.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    for (const k of [-1.5, 1.5]) assert.ok(mod.walkable(w[i][0] - (b[1] - a[1]) / l * k, w[i][1] + (b[0] - a[0]) / l * k), `trail edge ${i}`);
    assert.ok(!['water', 'lava', 'hotspring'].includes(mod.groundType(w[i][0], w[i][1])));
    maxSlope = Math.max(maxSlope, slopeAt(w[i][0], w[i][1]));
    if (i) assert.ok(Math.hypot(w[i][0] - w[i - 1][0], w[i][1] - w[i - 1][1]) < 1);
  }
  assert.ok(maxSlope < 0.5, `slope ${maxSlope}`);
  assert.ok(path.length > 1.1 * Math.hypot(last[0] - first[0], last[1] - first[1]), 'it meanders');
  const mid = path.samples[100];
  assert.equal(pathPaint(island, island.x + mid[0], island.z + mid[1]).w, 1);
  assert.equal(pathPaint(island, island.x + mid[0], island.z + mid[1]).surface, 'earth');
});

test('nothing sits on the garden trail: props, gathering spots and tools keep clear', () => {
  for (const o of [...P.trees, ...P.boulders, ...P.decor]) assert.ok(pathDist(island, path, o.x, o.z) >= 3.4 + o.r - 0.6, `${o.layer} ${pathDist(island, path, o.x, o.z).toFixed(1)} u from the trail`);
  for (const o of [...P.flowers, ...P.ferns, ...G.herbs, ...G.digs, ...planEmberTools(island, mod)]) assert.ok(pathDist(island, path, o.x, o.z) >= path.width / 2 + 1.4 - 1e-9, 'on the trail');
});

test('torch posts: bamboo, every ~13 u, off the painted trail, clear of the stream, claimed as solids; two signposts facing the camera', () => {
  const posts = gardenPosts(island, mod);
  assert.ok(posts.length >= 9 && posts.length <= 16, `${posts.length} posts`);
  for (const p of posts) {
    const d = pathDist(island, path, p.x, p.z);
    assert.ok(d > path.width / 2 && d < PATHS.find((q) => q.id === 'ember-garden').marker.side + 0.6, `post ${d.toFixed(2)} u from the centre line`);
    assert.ok(!waterfallForbidden(island, p.x, p.z, 0));
    assert.ok(mod.walkable(p.x, p.z));
    assert.ok(P.solids.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 1e-9 && o.r === 0.3), 'post not claimed');
  }
  assert.equal(P.posts.length, posts.length);
  const S = gardenSigns(island);
  assert.equal(S.length, 2);
  assert.deepEqual(P.signs.map((s) => s.id), S.map((s) => s.id));
  for (const s of S) {
    assert.ok(s.pages.length >= 1 && s.pages.every((t) => typeof t === 'string' && t.length > 10));
    assert.ok(Math.abs(s.yaw) < 0.4, 'a board must face the default camera (+z)');
    assert.ok(pathDist(island, path, s.x, s.z) >= 1.9, 'sign on the trail surface');
    assert.ok(mod.walkable(s.x, s.z));
    assert.ok(P.solids.some((o) => Math.hypot(o.x - s.x, o.z - s.z) < 1e-9), 'sign not claimed');
  }
  assert.ok(Math.hypot(S[0].x - landing.x, S[0].z - landing.z) < 20, 'the first sign is by the landing');
  assert.ok(Math.hypot(S[1].x - hearth.x, S[1].z - hearth.z) < 25, 'the second is at the garden');
});

test('reserved garden spots: 16 plots (4 usable at stage 0) on flat, walkable ground; Mossback, the garland stand and three stage spots; nothing overlaps', () => {
  const R = gardenReserved(island, mod);
  assert.equal(R.plots.length, 16);
  assert.equal(R.plots.filter((p) => p.usable).length, 4);
  assert.deepEqual(R.plots.reduce((m, p) => ({ ...m, [p.tier]: (m[p.tier] || 0) + 1 }), {}), { top: 6, middle: 4, bottom: 6 });
  assert.equal(R.stages.length, 3);
  const items = [...R.plots.map((o, i) => ['plot' + i, o]), ['mossback', R.mossback], ['garland', R.garland], ...R.stages.map((o, i) => ['stage' + i, o])];
  for (const [k, o] of items) {
    assert.ok(mod.walkable(o.x, o.z), `${k} unwalkable`);
    assert.ok(Math.hypot(o.x - hearth.x, o.z - hearth.z) >= o.r + 3.4, `${k} too close to the hearth pad`);
    if (k.startsWith('plot')) assert.ok(slopeAt(o.x, o.z) < 0.3, `${k} slope`);
  }
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i][1], b = items[j][1];
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= a.r + b.r, `${items[i][0]} overlaps ${items[j][0]}`);
  }
  // each tier's plots share a height band: top > middle > bottom
  const mean = (t) => R.plots.filter((p) => p.tier === t).reduce((s, p) => s + p.y, 0) / R.plots.filter((p) => p.tier === t).length;
  assert.ok(mean('top') - mean('middle') > 1.5 && mean('middle') - mean('bottom') > 1.5);
  assert.deepEqual(gardenReserved(island, mod), R);
});

test('the bare site: seeded stone edging, weeds and a broken trellis, clear of the hearth, plots and trail; trellis poles block movement', () => {
  const D = gardenDecor(island, mod), R = gardenReserved(island, mod);
  assert.deepEqual(gardenDecor(island, mod), D);
  assert.ok(D.stones.length >= 25 && D.stones.length <= 70, `${D.stones.length} stones`);
  assert.ok(D.weeds.length >= 20);
  for (const s of D.stones) assert.ok(Math.hypot(s.x - hearth.x, s.z - hearth.z) >= 5 && gardenZone(island, s.x, s.z, 1));
  for (const w of D.weeds) assert.ok(R.plots.every((p) => Math.hypot(w.x - p.x, w.z - p.z) > p.r) && Math.hypot(w.x - hearth.x, w.z - hearth.z) >= 4.6);
  assert.equal(D.trellis.poles, 5);
  const poles = P.garden.trellis.poleList;
  assert.equal(poles.length, 5);
  for (const q of poles) assert.ok(R.plots.every((p) => Math.hypot(q.x - p.x, q.z - p.z) > p.r + D.trellis.r), 'trellis on a plot');
  assert.deepEqual(P.garden.stones, D.stones);
});

test('garden paint: dark soil over the tiers, none far away, ash round the hearth', () => {
  assert.equal(gardenPaint(island, hearth.x, hearth.z).w, 1);
  assert.equal(gardenPaint(island, hearth.x, hearth.z).ring, 1);
  assert.equal(gardenPaint(island, island.x - 80, island.z + 20).w, 0);
  assert.equal(gardenPaint(island, hearth.x, hearth.z + 30).w, 0);
  let soft = false;
  for (let x = 0; x < 30; x += 0.5) { const v = gardenPaint(island, hearth.x + x, hearth.z).w; if (v > 0.05 && v < 0.95) soft = true; }
  assert.ok(soft, 'no soft edge');
});

test('Emberleaf tools: ten, in a fixed order after Frostpine\'s, a shovel and an axe near the landing, deterministic, on clear walkable ground', () => {
  const t = planEmberTools(island, mod);
  assert.deepEqual(t.map((o) => o.kind), EMBER_TOOL_KINDS);
  assert.deepEqual(t, planEmberTools(island, getIslandModule('ember')));
  assert.equal(t.length, 10);
  for (const [kind, count] of [['axe', 2], ['shovel', 4], ['hammer', 2], ['sword', 2]]) assert.equal(t.filter((o) => o.kind === kind).length, count);
  assert.deepEqual(t.slice(0, 2).map((o) => o.kind).sort(), ['axe', 'shovel']);
  for (const o of t.slice(0, 2)) assert.ok(Math.hypot(o.x - landing.x, o.z - landing.z) < 45, 'near the landing');
  for (const o of t) {
    assert.ok(mod.walkable(o.x, o.z) && slopeAt(o.x, o.z) < 0.4);
    assert.ok(!nearAnyFire(o.x, o.z));
    assert.ok([...G.herbs, ...G.digs].every((q) => Math.hypot(o.x - q.x, o.z - q.z) > 3));
  }
  for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) assert.ok(Math.hypot(t[i].x - t[j].x, t[i].z - t[j].z) >= 7);
});

test('a visuals rebuild keeps the garden\'s gameplay identity (signs, colliders, interactables) and the build is registered once', () => {
  const data = registerEmberGameplay(island), counts = [getInteractables().length, getColliders().length];
  assert.equal(registerEmberGameplay(island), data);
  assert.equal(data.signs.length, 3, "the garden trail two signposts + the Skipper Cove signpost (Step 68a)");
  assert.equal(data.tools.length, 10);
  let v = buildEmberVisuals(island, data);
  const s = v.summary().garden;
  assert.equal(s.signs, 3); assert.equal(s.torches, P.posts.length);
  v.dispose(); v = buildEmberVisuals(island, data);
  assert.deepEqual(v.summary().garden, s);
  assert.deepEqual([getInteractables().length, getColliders().length], counts);
  assert.ok(data.signs.every((g) => g.userData.signPages.length >= 1 && g.userData.interactable));
  v.dispose();
});
