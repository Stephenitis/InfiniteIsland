import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ISLANDS, BRIDGES } from '../public/js/config.js';
import { regionOf, inlandDistance, isWalkable } from '../public/js/world/terrain.js';
import { createIslandTracker, trackedItem, bagGroups } from '../public/js/ui/inventoryTracking.js';
import { listItems, getItem, listRecipes, dishMakeable } from '../public/js/game/catalog.js';
import { QuestLog, QUESTS } from '../public/js/game/quests.js';
import { Inventory } from '../public/js/game/inventory.js';
import { CollectionLog, COLLECTIBLES } from '../public/js/game/collection.js';
import { WorldSync } from '../public/js/net/worldSync.js';
import { clearTravelSpots, travelAllowed } from '../public/js/game/travelLogic.js';
import { createTravel } from '../public/js/game/travel.js';
import { SlotTable } from '../public/js/players/slotTable.js';
import { beachPlan } from '../public/js/world/beachFinds.js';
import { Music, getTrack, trackInfo } from '../public/js/audio/music.js';
import { AmbienceAudio } from '../public/js/audio/ambience.js';

test('screen tracking preserves bridge departure in both directions, rejects shore jitter and forgets leavers', () => {
  const tracker = createIslandTracker({ islands: ISLANDS, bridges: BRIDGES, regionAt: regionOf, inlandAt: inlandDistance });
  const p = { position: { x: 40, z: 0 } }, q = { position: { x: 0, z: -197 } };
  assert.deepEqual([...tracker.update([p]).islands], ['home']);
  for (let x = 51.5; x <= 82.5; x += 1) { p.position.x = x; assert.equal(tracker.update([p]).islands.has('home'), true); }
  p.position = { x: 110, z: 0 }; assert.deepEqual(tracker.update([p]).arrivals, ['ember']);
  for (let x = 82.5; x >= 51.5; x -= 1) { p.position.x = x; tracker.update([p]); assert.equal(tracker.islandOf(p), 'ember'); }
  p.position.x = 40; tracker.update([p]); assert.equal(tracker.islandOf(p), 'home');
  assert.deepEqual([...tracker.update([p, q]).islands], ['home', 'frost']);
  tracker.update([p]); assert.equal(tracker.islandOf(q), null);
  const jitter = createIslandTracker({ islands: ISLANDS, bridges: [], regionAt: (x) => x > 0 ? 'ember' : 'sea', inlandAt: (x) => x - 6 });
  p.position.x = -1; jitter.update([p]);
  for (const x of [1, 2, 1, 0.5]) { p.position.x = x; jitter.update([p]); assert.equal(jitter.islandOf(p), 'home'); }
  p.position.x = 4; assert.deepEqual(jitter.update([p]).arrivals, ['ember']);
});
test('bag filters by local island union and quest needs at zero; every entry occurs once in grouped full bag', () => {
  assert.equal(trackedItem(getItem('banana'), 3, new Set(['home'])), false);
  assert.equal(trackedItem(getItem('banana'), 0, new Set(['home']), { banana: 2 }), true);
  assert.equal(trackedItem(getItem('mint'), 1, new Set(['home', 'frost'])), true);
  assert.equal(trackedItem(getItem('log'), 1, new Set(['ember'])), true);
  assert.equal(trackedItem(getItem('grilled-banana'), 1, new Set(['home'])), false);   // a dish belongs to the island whose fire cooks it
  assert.equal(trackedItem(getItem('grilled-banana'), 1, new Set(['ember'])), true);
  const all = bagGroups(listItems(), ISLANDS).flatMap((g) => g.items.map((d) => d.id));
  assert.equal(new Set(all).size, listItems().length); assert.equal(all.length, listItems().length);
});
test('island quests cannot be requested or randomly selected before their bridge; pools never repeat', () => {
  const log = new QuestLog({ inventory: new Inventory({ persist: false }), persist: false, fireIslands: ['home', 'frost', 'ember'] }), built = new Set();
  log.setBridgeProvider((id) => built.has(id));
  assert.equal(log.available().length, 8); assert.equal(log.start('emberleaf-luau'), null);
  built.add('frost'); assert.equal(log.available().length, 10);
  assert.equal(log.start('frostpine-supper').id, 'frostpine-supper'); log.giveUp();
  for (let i = 0; i < 100; i++) { const before = log.last, q = log.start(); assert.notEqual(q.id, before); assert.notEqual(q.island, 'ember'); log.giveUp(); }
  built.add('ember'); assert.equal(log.available().length, 12);
  for (const q of QUESTS) { assert.ok(['bowl', 'pile', 'skewers'].includes(q.food.kind)); for (const id of Object.keys(q.needs)) assert.ok(getItem(id)); }
});
test('collection rolls never add duplicates, keep six entries per island and sanitize old saves', () => {
  const log = new CollectionLog({ persist: false });
  for (const i of ISLANDS) {
    assert.equal(COLLECTIBLES.filter((d) => d.island === i.id).length, 6);
    for (const source of ['shake', 'break', 'dig']) {
      assert.equal(log.roll(i.id, source, null, 0.06, () => 0.9), false);
      assert.equal(log.roll(i.id, source, null, 0.06, () => 0), true);
      assert.equal(log.roll(i.id, source, null, 0.06, () => 0), false);
    }
  }
  log.load({ found: ['bad', 'fan-shell', 'fan-shell'] }); assert.deepEqual(log.snapshot().found, ['fan-shell']);
  const copy = new CollectionLog({ persist: false }); copy.load(log.snapshot()); assert.deepEqual(copy.snapshot(), log.snapshot());
});
test('Journal authority rejects arbitrary replica awards and out-of-range beach discoveries; snapshots converge', async () => {
  const host = new WorldSync({ role: 'host' }), replica = new WorldSync({ role: 'replica' });
  const a = new CollectionLog({ persist: false, validateBeach: (id, actor) => id === 'fan-shell' && actor.pos.x < 4 });
  const b = new CollectionLog({ persist: false }); a.attachSync(host); b.attachSync(replica);
  const queue = []; host.attachHost({ sendTo: (_tid, msg) => queue.push(msg), broadcast: (msg) => queue.push(msg) });
  replica.attachReplica({ send: (msg) => { host.screenMessage('r', msg); return true; } }); replica.linkUp(); host.screenConnected('r', { clientId: 'replica' });
  const flush = () => { while (queue.length) replica.receive(queue.shift()); }; flush();
  assert.equal(b.award('fan-shell'), false);
  const far = replica.request('collection', 'beach', { id: 'fan-shell' }, { screen: 'spoof', index: 1, pos: { x: 20, y: 0, z: 0 } }); flush(); assert.equal((await far).ok, false);
  const near = replica.request('collection', 'beach', { id: 'fan-shell' }, { screen: replica.screenId, index: 1, pos: { x: 0, y: 0, z: 0 } }); flush(); assert.equal((await near).ok, true);
  assert.deepEqual(a.snapshot(), b.snapshot()); assert.equal(host.hash(), replica.hash());
});
test('beach plans are seeded, spaced, walkable and clear of bridge landings', () => {
  const plan = beachPlan({ colliders: [] }); assert.deepEqual(plan, beachPlan({ colliders: [] })); assert.equal(plan.length, 9);
  for (const p of plan) {
    assert.ok(isWalkable(p.x, p.z)); assert.equal(regionOf(p.x, p.z), p.island);
    assert.ok(inlandDistance(p.x, p.z) >= 0.8 && inlandDistance(p.x, p.z) <= 5);
    assert.ok(BRIDGES.every((b) => Math.min(Math.hypot(p.x-b.ax,p.z-b.az), Math.hypot(p.x-b.bx,p.z-b.bz)) >= 14));
  }
});
test('travel destinations avoid all colliders, water, lava, other players and each other; insufficient room fails', () => {
  const opts = { walkable: (x, z) => x >= 0 && z >= 0, regionAt: () => 'home', island: 'home', colliders: [{ x: 0, z: 0, r: 3 }], occupied: [{ x: 4, z: 0 }] };
  const spots = clearTravelSpots({ x: 0, z: 0 }, 4, opts); assert.equal(spots.length, 4);
  for (const p of spots) { assert.ok(Math.hypot(p.x,p.z) >= 3.65); assert.ok(Math.hypot(p.x-4,p.z) >= 1.4); }
  assert.equal(clearTravelSpots({ x: 0,z: 0 }, 1, { ...opts, walkable: () => false }), null);
  assert.equal(travelAllowed('sea', () => true), false); assert.equal(travelAllowed('ember', () => false), false);
});
test('travel host validates unlocked remote targets and far-end proximity; only the requesting screen moves', () => {
  const sync = new WorldSync({ role: 'host' }), table = new SlotTable(), unlocked = new Set();
  table.claim('host','local'); table.claim('s1','local');
  const p = { index: 0, position: { x: 0,y: 0,z: 12 }, teleport(x,z) { this.position = { x,y: 0,z }; } };
  const remote = { index: 1, position: { x: 197, z: 47 }, colors: { name: 'P2' }, away: false, root: { visible: false } };
  let menu;
  const travel = createTravel({ scene: new THREE.Scene(), sync, players: { list: [p], p1: p }, avatars: { list: [remote], remote: new Map([[1, { buffer: { samples: [{}] } }]]) }, table, bridges: { entry: (id) => ({ built: unlocked.has(id) }) }, dialog: { close() {}, open(opts) { menu = opts.choices; } }, hud: { toast() {} }, particles: { burst() {} }, camera: { snap() {} }, cinematic: { busy: false } });
  travel.showFriends(); assert.equal(menu()[0].label, 'Join P2'); assert.equal(menu()[0].disabled, true);
  sync.actors.set('s1:1', { pos: { x: 197,y: 0,z: 47 } });
  const actor = () => sync.actorFor(p);
  assert.equal(sync.request('travel','friend',{slot: 1},actor()).ok, false);
  unlocked.add('ember'); assert.equal(menu()[0].disabled, false); assert.equal(sync.request('travel','friend',{slot: 1},actor()).ok, true);
  assert.equal(regionOf(p.position.x,p.position.z), 'ember');
  assert.equal(sync.request('travel','home',{island: 'ember'},actor()).ok, false);
  const sign = travel.signs.find((s) => s.id === 'ember'); p.teleport(sign.x,sign.z);
  assert.equal(sync.request('travel','home',{island: 'ember'},actor()).ok, true); assert.equal(regionOf(p.position.x,p.position.z),'home');
});

test('regional ambience selects frost wind / owl and ember birds / frogs, respects mute and releases voice nodes', () => {
  const prior = globalThis.document; globalThis.document = { hidden: false };
  try {
    const nodes = [], param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
    const node = () => { const n = { frequency: param(), gain: param(), connect(other) { return other; }, start() {}, stop() {}, disconnect() { this.released = true; } }; nodes.push(n); return n; };
    const ctx = { state: 'running', currentTime: 0, sampleRate: 100, createGain: node, createOscillator: node, createBiquadFilter: node, createBufferSource: node, createBuffer: (_channels, length) => ({ getChannelData: () => new Float32Array(length) }) };
    const sfx = { ctx, master: node(), muted: false }, clock = { nightness: 0 }, ambience = new AmbienceAudio(sfx, clock);
    for (const type of ['wind','owl','tropical','frog']) ambience.regionalSound(type);
    assert.deepEqual(ambience.regional, { wind: 1, owl: 1, tropical: 1, frog: 1 });
    for (const n of nodes) n.onended?.(); assert.ok(nodes.filter((n) => n.onended).every((n) => n.released));
    const before = nodes.length; sfx.muted = true; ambience.regionalSound('wind'); assert.equal(nodes.length,before);
    sfx.muted = false; ambience.region = () => 'ember'; clock.nightness = 1; ambience.update(20); assert.equal(ambience.regional.frog,2);
    clock.nightness = 0; ambience.update(20); assert.equal(ambience.regional.tropical,2);
  } finally { globalThis.document = prior; }
});
test('island music has real 3/4 and 4/4 bars, valid event durations, and switches only when choosing the next track', () => {
  const prior = globalThis.document; globalThis.document = { addEventListener() {} };
  try {
    const m = new Music({ onChange() {} }); m.setClock({ phase: 'day', nightness: 0, on() {} });
    m.region = () => 'frost'; assert.equal(m._chooseNext(0), 4); assert.equal(m.currentIndex, -1);
    m.region = () => 'ember'; assert.equal(m._chooseNext(4), 5);
    const info = trackInfo(); assert.equal(info[4].meter,'3/4'); assert.equal(info[4].bars,48);
    for (const i of [4,5]) { const tr = getTrack(i); for (const e of tr.events) { assert.ok(e.s >= 0 && e.s < tr.steps); assert.ok(e.d > 0 && Number.isFinite(e.v)); } }
  } finally { globalThis.document = prior; }
});
test('each campfire cooks only its own island recipes; quests needing an uncookable dish stay out of the pool', () => {
  for (const r of listRecipes()) assert.ok(['home', 'frost', 'ember'].includes(r.island), r.id);
  assert.deepEqual(listRecipes('home').map((r) => r.island), Array(listRecipes('home').length).fill('home'));
  assert.equal(dishMakeable('baked-potato', ['home']), true);
  assert.equal(dishMakeable('forest-stew', ['home']), false);
  assert.equal(dishMakeable('forest-stew', ['home', 'frost']), true);
  assert.equal(dishMakeable('banana', ['home']), true);   // ingredients are never blocked
  for (const r of listRecipes()) assert.deepEqual(getItem(r.dish).islands, [r.island], r.id);
  const log = new QuestLog({ inventory: new Inventory({ persist: false }), persist: false, fireIslands: ['home'] });
  log.setBridgeProvider(() => true);
  assert.equal(log.available().length, 8);
  assert.ok(log.available().every((q) => !q.island));
  assert.equal(log.start('frostpine-supper'), null);
});
