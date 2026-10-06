// Step 38a: the eight Night-Bloom seed finds: the flower registry, the pure find rules (time of day, tool, distance, once only), the deterministic spot plan (walkable, clear, reachable from the
// bridge landing, existing props reused) and Mossback's seed pages. The garden domain's seed request / event is covered in test/garden.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ISLANDS, SEEDS } from '../public/js/config.js';
import { FLOWERS, FLOWER_IDS, TEND_ITEMS, flowerById } from '../public/js/game/flowers.js';
import { FLOWER_ICONS } from '../public/js/ui/icons.js';
import { SEED_RULES, hourIn, windowWeight, timeOk, checkFind, addSeed, seedCount, seedHint, seedPages, plantPages, WRONG_TIME_HINT, SEED_HINTS } from '../public/js/game/seedLogic.js';
import { normaliseState, readSave, buildSave, freshState } from '../public/js/game/gardenLogic.js';
import { createEmberIsland } from '../public/js/world/islands/ember.js';
import { buildEmberPlacement } from '../public/js/world/islands/emberPlacement.js';
import { planEmberSeeds } from '../public/js/world/islands/emberSeeds.js';
import { planEmberTools } from '../public/js/world/islands/emberGathering.js';
import { landingFor } from '../public/js/world/islands/scatter.js';

const island = ISLANDS.find((i) => i.id === 'ember');
const mod = createEmberIsland(island), placement = buildEmberPlacement(island, mod), plan = planEmberSeeds(island, mod, placement);

test('eight flowers, each with an icon, a rule and a hint; every tending item serves exactly two flowers', () => {
  assert.equal(FLOWERS.length, 8);
  assert.equal(new Set(FLOWER_IDS).size, 8);
  for (const f of FLOWERS) {
    assert.ok(FLOWER_ICONS[f.id].startsWith('<svg'), f.id);
    assert.ok(SEED_RULES[f.id] && SEED_HINTS[f.id], f.id);
    assert.ok(TEND_ITEMS.includes(f.tend), `${f.id} tend ${f.tend}`);
    assert.equal(f.petals.length, 2);
  }
  for (const item of TEND_ITEMS) assert.equal(FLOWERS.filter((f) => f.tend === item).length, 2, item);
  assert.equal(flowerById('moon-orchid').name, 'Moon Orchid');
});

test('hour windows wrap through midnight and fade smoothly around their edges', () => {
  assert.ok(hourIn(23, SEEDS.times.night) && hourIn(2, SEEDS.times.night) && !hourIn(12, SEEDS.times.night) && !hourIn(6, SEEDS.times.night));
  assert.ok(hourIn(15, SEEDS.times.dusk) && hourIn(22.99, SEEDS.times.dusk) && !hourIn(23, SEEDS.times.dusk) && !hourIn(14.99, SEEDS.times.dusk));
  assert.equal(windowWeight(22, SEEDS.times.night), 1);
  assert.equal(windowWeight(12, SEEDS.times.night), 0);
  assert.ok(Math.abs(windowWeight(SEEDS.times.night[0], SEEDS.times.night) - 0.5) < 1e-9, 'half at the edge');
  assert.ok(windowWeight(5.2, SEEDS.times.night) > windowWeight(5.7, SEEDS.times.night));
  assert.ok(windowWeight(19.2, SEEDS.times.night) < windowWeight(19.8, SEEDS.times.night));
});

test('find rules: the time of day gates the night / dusk finds, the shovel gates the digs, the host range gates a remote actor', () => {
  const ok = (a) => checkFind({ found: [], hour: 12, heldKind: null, near: true, ...a });
  assert.deepEqual(ok({ id: 'lagoon-lotus' }), { ok: true });
  assert.deepEqual(ok({ id: 'starfruit-vine', hour: 3 }), { ok: true });
  assert.deepEqual(ok({ id: 'moon-orchid', hour: 12 }), { ok: false, reason: 'wrong-time' });
  assert.deepEqual(ok({ id: 'moon-orchid', hour: 23 }), { ok: true });
  assert.deepEqual(ok({ id: 'glow-hibiscus', hour: 8 }), { ok: false, reason: 'wrong-time' });
  assert.deepEqual(ok({ id: 'glow-hibiscus', hour: 1 }), { ok: true });
  assert.deepEqual(ok({ id: 'firefly-plumeria', hour: 12 }), { ok: false, reason: 'wrong-time' });
  assert.deepEqual(ok({ id: 'firefly-plumeria', hour: 22 }), { ok: true });
  assert.deepEqual(ok({ id: 'firefly-plumeria', hour: 15 }), { ok: true });
  assert.deepEqual(ok({ id: 'firefly-plumeria', hour: 23 }), { ok: false, reason: 'wrong-time' });
  assert.deepEqual(ok({ id: 'firefly-plumeria', hour: 19 }), { ok: true });
  for (const id of ['ember-lily', 'sunbell']) {
    assert.deepEqual(ok({ id }), { ok: false, reason: 'no-tool' });
    assert.deepEqual(ok({ id, heldKind: 'axe' }), { ok: false, reason: 'no-tool' });
    assert.deepEqual(ok({ id, heldKind: 'shovel' }), { ok: true });
    assert.deepEqual(ok({ id, heldKind: 'shovel', near: false }), { ok: false, reason: 'far' });
  }
  assert.deepEqual(ok({ id: 'nope' }), { ok: false, reason: 'unknown' });
  assert.equal(timeOk('steam-fern', 12), true);
});

test('a seed can only be found once, and debug ignores every other rule but that', () => {
  assert.deepEqual(checkFind({ id: 'moon-orchid', found: ['moon-orchid'], hour: 23 }), { ok: false, reason: 'found' });
  assert.deepEqual(checkFind({ id: 'moon-orchid', found: ['moon-orchid'], hour: 23, debug: true }), { ok: false, reason: 'found' });
  assert.deepEqual(checkFind({ id: 'sunbell', found: [], hour: 12, heldKind: null, near: false, debug: true }), { ok: true });
  assert.deepEqual(checkFind({ id: 'nope', debug: true }), { ok: false, reason: 'unknown' });
});

test('addSeed keeps a unique sorted list of real flowers; the garden state normalises and saves it', () => {
  assert.deepEqual(addSeed(['sunbell'], 'ember-lily'), ['ember-lily', 'sunbell']);
  assert.deepEqual(addSeed(['sunbell'], 'sunbell'), ['sunbell']);
  assert.deepEqual(addSeed(['sunbell'], 'bogus'), ['sunbell']);
  assert.equal(seedCount(['sunbell', 'bogus', 'steam-fern']), 2);
  const n = normaliseState({ seeds: ['sunbell', 'steam-fern', 'sunbell', 7, ''] });
  assert.deepEqual(n.seeds, ['steam-fern', 'sunbell']);
  assert.deepEqual(readSave(buildSave({ ...freshState(), seeds: ['moon-orchid'] })).seeds, ['moon-orchid']);
  assert.deepEqual(readSave(undefined).seeds, []);
});

test('Mossback: found seeds are listed, every missing one gets its hint, the night / dusk ones say when', () => {
  const none = seedPages([]).join(' ');
  for (const id of FLOWER_IDS) assert.ok(none.includes(seedHint(id)), id);
  assert.ok(/after dark|moon is up/i.test(SEED_HINTS['moon-orchid']) && /night/i.test(SEED_HINTS['glow-hibiscus']) && /3 PM to 11 PM/i.test(SEED_HINTS['firefly-plumeria']));
  assert.ok(seedPages([]).slice(1).every((page) => page.includes('\n\n') && !page.includes(' ... ')));
  const some = seedPages(['moon-orchid', 'sunbell']);
  assert.match(some[0], /2 of 8/);
  assert.match(some[0], /Moon Orchid and Sunbell/);
  assert.ok(!some.slice(1).join(' ').includes(SEED_HINTS['moon-orchid']), 'found seeds get no hint');
  assert.ok(some.slice(1).join(' ').includes(SEED_HINTS['ember-lily']));
  assert.equal(seedPages(FLOWER_IDS).length, 1);
  assert.match(seedPages(FLOWER_IDS)[0], /all eight/i);
  assert.equal(plantPages([]), null);
  assert.match(plantPages(['moon-orchid']).join(' '), /Moon Orchid/);
  assert.ok(WRONG_TIME_HINT['glow-hibiscus'].includes('night'));
});

// ---- the plan
test('the spot plan is deterministic, complete and in flower order', () => {
  assert.deepEqual(plan.map((s) => s.id), FLOWER_IDS);
  const again = planEmberSeeds(island, createEmberIsland(island), buildEmberPlacement(island, createEmberIsland(island)));
  const strip = (p) => p.map((s) => ({ id: s.id, kind: s.kind, x: s.x, z: s.z, y: s.y }));
  assert.deepEqual(strip(again), strip(plan));
  assert.deepEqual(plan.map((s) => s.kind), plan.map((s) => SEED_RULES[s.id].kind));
});

test('the three prop finds reuse existing placement records (no new props, the placement is untouched)', () => {
  const by = (id) => plan.find((s) => s.id === id);
  assert.equal(by('moon-orchid').ref.layer, 'breadfruit');
  assert.ok(placement.trees.includes(by('moon-orchid').ref));
  assert.equal(by('glow-hibiscus').ref.layer, 'hibiscus');
  assert.ok(by('glow-hibiscus').ref.interactive && placement.flowers.includes(by('glow-hibiscus').ref));
  assert.equal(by('firefly-plumeria').ref.layer, 'plumeria');
  assert.ok(by('firefly-plumeria').ref.interactive && placement.flowers.includes(by('firefly-plumeria').ref));
  assert.equal(placement.trees.length + placement.boulders.length + placement.flowers.length + placement.ferns.length, 120 + 18 + 30 + 110 + 100 - 0, 'placement counts unchanged');
});

test('every spot is walkable, clear of solid props, apart from the others and reachable on foot from the bridge landing', () => {
  const landing = landingFor(island), st = 0.5, key = (i, j) => i * 100003 + j, seen = new Set();
  const q = [[Math.round(landing.x / st), Math.round(landing.z / st)]]; seen.add(key(...q[0]));
  for (let n = 0; n < q.length; n++) {
    const [i, j] = q[n];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj, x = a * st, z = b * st;
      if (Math.abs(x - island.x) > 125 || Math.abs(z - island.z) > 125 || seen.has(key(a, b)) || !mod.walkable(x, z)) continue;
      seen.add(key(a, b)); q.push([a, b]);
    }
  }
  const reach = (x, z, r = 2.6) => { for (let dx = -r; dx <= r; dx += st) for (let dz = -r; dz <= r; dz += st) if (Math.hypot(dx, dz) <= r && seen.has(key(Math.round((x + dx) / st), Math.round((z + dz) / st)))) return true; return false; };
  for (const tool of planEmberTools(island, mod)) {
    assert.ok(reach(tool.x, tool.z), `${tool.kind} reachable from the landing`);
    assert.ok(plan.every((s) => Math.hypot(tool.x - s.x, tool.z - s.z) > 4), `${tool.kind} clear of seed interactions`);
  }
  for (const s of plan) {
    assert.ok(mod.walkable(s.x, s.z) || s.ref, `${s.id} walkable`);
    assert.ok(Math.abs(s.y - mod.height(s.x, s.z)) < 1e-9);
    assert.ok(reach(s.x, s.z), `${s.id} reachable from the landing`);
    if (!s.ref) assert.ok(placement.solids.every((o) => Math.hypot(o.x - s.x, o.z - s.z) > o.r + 0.8), `${s.id} clear of solids`);
    for (const o of plan) if (o !== s) assert.ok(Math.hypot(o.x - s.x, o.z - s.z) > 5, `${s.id} / ${o.id} apart`);
  }
  const by = (id) => plan.find((s) => s.id === id);
  assert.equal(mod.groundType(by('sunbell').x, by('sunbell').z), 'blacksand');
  assert.equal(by('starfruit-vine').x, mod.falls.data.ledgeSpot.x);
  const lotus = by('lagoon-lotus'), lagoon = { x: island.x - 45, z: island.z + 52 };
  assert.ok(Math.hypot(lotus.x - lagoon.x, lotus.z - lagoon.z) < 14 && Math.hypot(lotus.x - lagoon.x, lotus.z - lagoon.z) > 7, 'lotus at the lagoon edge');
  const spring = { x: island.x + 58, z: island.z - 52 };
  assert.ok(Math.hypot(by('steam-fern').x - spring.x, by('steam-fern').z - spring.z) < 7, 'steam fern at the spring');
  const vol = { x: island.x + 15, z: island.z - 5 };
  assert.ok(Math.hypot(by('ember-lily').x - vol.x, by('ember-lily').z - vol.z) < 16, 'ember lily by the crater');
});
