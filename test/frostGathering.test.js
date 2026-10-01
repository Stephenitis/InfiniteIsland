// Step 29b: Frostpine's gathering plan (placement rules, stable ids), the loot rolls (shake / boulder / dig), the multi-island gathering ids,
// the new catalog items (islands tags, recipes) and the Cook menu's data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ISLANDS } from '../public/js/config.js';
import { getIslandModule } from '../public/js/world/islands/registry.js';
import { buildFrostPlacement, FROST_AREAS, LANDING_CLEAR, LAKE_CLEAR, frostLanes } from '../public/js/world/islands/frostPlacement.js';
import { planFrostGathering, FROST_GATHER, SPACING } from '../public/js/world/islands/frostGathering.js';
import { polyDist, landingFor } from '../public/js/world/islands/scatter.js';
import { LOOT, DIG, digLoot, lootFor, rollDrop, rollDig } from '../public/js/world/lootTable.js';
import { mulberry32 } from '../public/js/utils/rng.js';
import { listItems, getItem, listRecipes, RECIPES } from '../public/js/game/catalog.js';
import { getInteractables, clearInteractables } from '../public/js/world/interactables.js';
import { clearColliders } from '../public/js/world/colliders.js';

const island = ISLANDS.find((i) => i.id === 'frost');
const mod = getIslandModule('frost');
const P = buildFrostPlacement(island, mod);
const plan = planFrostGathering(island, mod);
const landing = landingFor(island);
const lanes = frostLanes(island);
const everyone = () => [...plan.bushes, ...plan.herbs, ...plan.mushrooms, ...plan.digs];

test('gathering plan: deterministic and counts match the spec (10-14 bushes, 14-18 mint, 14-18 chanterelles, 8-10 dig spots)', async () => {
  const fresh = await import('../public/js/world/islands/frostGathering.js?fresh');
  const again = fresh.planFrostGathering(island, mod);
  assert.notEqual(again, plan);
  assert.equal(JSON.stringify(again), JSON.stringify(plan));
  assert.ok(plan.bushes.length >= 10 && plan.bushes.length <= 14, `bushes ${plan.bushes.length}`);
  assert.ok(plan.herbs.length >= 14 && plan.herbs.length <= 18, `herbs ${plan.herbs.length}`);
  assert.ok(plan.mushrooms.length >= 14 && plan.mushrooms.length <= 18, `mushrooms ${plan.mushrooms.length}`);
  assert.ok(plan.digs.length >= 8 && plan.digs.length <= 10, `digs ${plan.digs.length}`);
  assert.equal(plan.bushes.length, FROST_GATHER.bushes);
});

test('gathering plan: ids are unique, stable and prefixed (never collide with home); spots keep their spacing', () => {
  const ids = everyone().map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => /^frost-(bush|herb|mush|dig)-\d+$/.test(id)));
  plan.bushes.forEach((o, i) => assert.equal(o.id, `frost-bush-${i}`));
  plan.herbs.forEach((o, i) => assert.equal(o.id, `frost-herb-${i}`));
  plan.mushrooms.forEach((o, i) => assert.equal(o.id, `frost-mush-${i}`));
  plan.digs.forEach((o, i) => assert.equal(o.id, `frost-dig-${i}`));
  const all = everyone();
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    assert.ok(Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) >= SPACING - 1e-9, `${all[i].id} / ${all[j].id} too close`);
  }
});

test('gathering plan: on valid ground, clear of landing, lake, lanes and every solid; the right area per kind', () => {
  for (const o of everyone()) {
    assert.ok(Number.isFinite(o.y) && Math.abs(o.y - mod.height(o.x, o.z)) < 1e-9);
    assert.ok(Math.hypot(o.x - landing.x, o.z - landing.z) >= LANDING_CLEAR - 4, `${o.id} at the landing`);
    assert.ok(mod.lakeDist(o.x, o.z) >= LAKE_CLEAR - 1, `${o.id} on the lake`);
    assert.ok(Math.min(...lanes.map((l) => polyDist(l, o.x, o.z))) >= 1.8, `${o.id} on a lane`);
    for (const s of P.solids) assert.ok(Math.hypot(s.x - o.x, s.z - o.z) >= s.r + 0.5, `${o.id} inside a solid`);
    assert.ok(['grass', 'snow'].includes(mod.groundType(o.x, o.z)));
  }
  for (const o of plan.mushrooms) assert.ok(FROST_AREAS.forest(mod, o.x, o.z, mod.height(o.x, o.z)), `${o.id} not in the forest`);
  for (const o of plan.herbs) assert.ok(FROST_AREAS[o.area](mod, o.x, o.z, mod.height(o.x, o.z)), `${o.id} not in ${o.area}`);
  for (const o of plan.bushes) assert.ok(FROST_AREAS[o.area](mod, o.x, o.z, mod.height(o.x, o.z)));
  for (const d of plan.digs) assert.equal(d.snow, mod.groundType(d.x, d.z) === 'snow');
  assert.ok(plan.digs.some((d) => d.snow) && plan.digs.some((d) => !d.snow), 'dig spots on both snow and meadow');
  // chanterelles sit among the trees: most have a trunk within a few units
  const nearTree = plan.mushrooms.filter((m) => P.trees.some((t) => Math.hypot(t.x - m.x, t.z - m.z) < 5));
  assert.ok(nearTree.length >= plan.mushrooms.length * 0.75, `only ${nearTree.length} chanterelles near trees`);
});

test('loot: pines / spruces drop pinecones when shaken (~50 %), saplings / birches do not, granite hides a rare crystal (~7 %)', () => {
  for (const v of ['pine', 'spruce']) assert.deepEqual(lootFor(v).shake, { item: 'pinecone', chance: 0.5 });
  assert.equal(lootFor('sapling').shake, null);
  assert.equal(lootFor('birch').shake, null);
  assert.equal(lootFor('granite').extra.item, 'crystal');
  const rnd = mulberry32(42);
  let cones = 0, gems = 0;
  for (let i = 0; i < 4000; i++) { cones += rollDrop(LOOT.pine.shake, rnd); gems += rollDrop(LOOT.granite.extra, rnd); }
  assert.ok(cones > 1900 && cones < 2100, `pinecones ${cones} / 4000`);
  assert.ok(gems > 200 && gems < 360, `crystals ${gems} / 4000`);
  // the same seed rolls the same sequence
  const a = mulberry32(7), b = mulberry32(7);
  for (let i = 0; i < 50; i++) assert.equal(rollDrop(LOOT.spruce.shake, a), rollDrop(LOOT.spruce.shake, b));
});

test('loot: a Frostpine dig gives 1-2 snow truffles or (10 %) one crystal, home keeps its 1-2 potatoes', () => {
  assert.equal(digLoot('home'), DIG.home);
  assert.equal(digLoot('unknown'), DIG.home);
  assert.equal(digLoot('frost').item, 'snow-truffle');
  const rnd = mulberry32(99);
  const seen = { 'snow-truffle': 0, crystal: 0 };
  for (let i = 0; i < 4000; i++) {
    const finds = rollDig(digLoot('frost'), rnd);
    assert.equal(finds.length, 1);
    const f = finds[0];
    assert.ok(f.item === 'snow-truffle' ? f.n >= 1 && f.n <= 2 : f.item === 'crystal' && f.n === 1);
    seen[f.item]++;
  }
  assert.ok(seen.crystal > 330 && seen.crystal < 470, `crystals ${seen.crystal} / 4000`);
  assert.ok(seen['snow-truffle'] > 3500);
  for (let i = 0; i < 200; i++) { const f = rollDig(digLoot('home'), rnd); assert.ok(f.length === 1 && f[0].item === 'potato' && f[0].n >= 1 && f[0].n <= 2); }
});

test('catalog: every item has an islands tag, the Frostpine items and dishes are tagged as designed', () => {
  const known = new Set(ISLANDS.map((i) => i.id));
  for (const d of listItems()) {
    assert.ok(Array.isArray(d.islands) && d.islands.length > 0, `${d.id} has no islands`);
    assert.ok(d.islands.every((i) => known.has(i)), `${d.id}: unknown island in ${d.islands}`);
  }
  assert.deepEqual(getItem('log').islands, ['home', 'frost', 'ember']);
  assert.deepEqual(getItem('stone').islands, ['home', 'frost', 'ember']);
  assert.deepEqual(getItem('coconut').islands, ['home', 'ember']);
  for (const id of ['pinecone', 'lingonberry', 'mint', 'chanterelle', 'crystal', 'snow-truffle']) {
    assert.deepEqual(getItem(id).islands, ['frost'], id);
    assert.ok(getItem(id).icon.includes('<svg') && !/[\u{1F300}-\u{1FAFF}]/u.test(getItem(id).icon), `${id} icon`);
  }
  for (const d of listItems('dish')) assert.deepEqual(d.islands, ['home'], d.id);
  for (const id of ['apple', 'berry', 'herb', 'potato', 'mushroom']) assert.deepEqual(getItem(id).islands, ['home'], id);
});

test('recipes: every recipe makes an existing dish from existing ingredients; the three Frostpine dishes are in', () => {
  assert.equal(listRecipes().length, 12);
  const ids = new Set();
  for (const r of RECIPES) {
    assert.ok(!ids.has(r.id), 'duplicate recipe id'); ids.add(r.id);
    assert.equal(getItem(r.dish)?.kind, 'dish', `${r.id}: dish ${r.dish}`);
    for (const [item, n] of Object.entries(r.needs)) {
      assert.equal(getItem(item)?.kind, 'ingredient', `${r.id}: needs ${item}`);
      assert.ok(Number.isInteger(n) && n > 0);
    }
  }
  const by = (id) => RECIPES.find((r) => r.id === id);
  assert.deepEqual(by('forest-stew').needs, { chanterelle: 2, mint: 1, potato: 1 });
  assert.deepEqual(by('lingonberry-tart').needs, { lingonberry: 3, apple: 1 });
  assert.deepEqual(by('toasted-pine-nuts').needs, { pinecone: 2 });
});

test('multi-island gathering: frost plants append after home, ids are sequential and never collide; dig spot sids continue the counter', async () => {
  clearInteractables(); clearColliders();
  const { registerFrostGameplay } = await import('../public/js/world/islands/frostWorld.js?gather');
  const frost = registerFrostGameplay(island);
  const { createGathering } = await import('../public/js/world/gathering.js');
  const noop = () => {};
  const sync = { isHost: true, isReplica: false, hasReplicas: false, screenId: 'host', register: noop, request: () => ({ ok: true }), emit: noop, actorFor: () => null, remoteActorNear: () => false };
  const players = { list: [], get: () => null };
  const props = { handles: { bushes: [], trees: [], herbs: null, mushrooms: [] }, spotOk: () => false };   // an island without any home plants / spots
  const before = getInteractables().length;
  const gat = createGathering({ scene: { add: noop }, players, props, frost, items: {}, particles: { burst: noop }, hud: { toast: noop }, pickups: {}, inventory: {}, sync });
  const added = getInteractables().slice(before);
  assert.equal(added.length, plan.bushes.length + plan.herbs.length + plan.mushrooms.length + plan.digs.length);
  const st = gat.states;
  assert.equal(st.berryBushes.length, plan.bushes.length);
  assert.equal(st.herbs.length, plan.herbs.length);
  assert.equal(st.mushrooms.length, plan.mushrooms.length);
  assert.deepEqual(st.digSpots.map((s) => s.sid), plan.digs.map((_, i) => i + 1), 'sids 1..n in plan order (home had none in this stub)');
  assert.ok(st.berryBushes.every((b) => b.isl === 'frost') && st.digSpots.every((s) => s.isl === 'frost'));
  assert.deepEqual(st.digSpots.map((s) => [s.x, s.z]), plan.digs.map((d) => [+d.x.toFixed(1), +d.z.toFixed(1)]));
  const types = (t) => added.filter((i) => i.type === t).length;
  assert.equal(types('bush'), plan.bushes.length);
  assert.equal(types('herb'), plan.herbs.length);
  assert.equal(types('mushroom'), plan.mushrooms.length);
  assert.equal(types('digspot'), plan.digs.length);
  assert.equal(new Set(added.map((i) => i.id)).size, added.length, 'interactable ids are unique');
  clearInteractables(); clearColliders();
});
