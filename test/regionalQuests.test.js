import test from 'node:test';
import assert from 'node:assert/strict';
import { QuestLog, STORAGE_KEY, LEGACY_STORAGE_KEY } from '../public/js/game/quests.js';
import { Inventory } from '../public/js/game/inventory.js';
import { WorldSync } from '../public/js/net/worldSync.js';
import { createQuestMenu } from '../public/js/game/questMenu.js';

const ids = { home: 'island-buffet', frost: 'frostpine-supper', ember: 'emberleaf-luau' };
function log() {
  const inventory = new Inventory({ persist: false });
  const quests = new QuestLog({ inventory, persist: false }); quests.setBridgeProvider(() => true);
  return { inventory, quests };
}
function startAll(q) { for (const [fire, id] of Object.entries(ids)) assert.equal(q.start(id, fire)?.id, id); }

test('three shared quest slots have disjoint pools, reject wrong-fire templates and preserve per-fire no-repeat', () => {
  const { quests: q } = log();
  assert.deepEqual(['home', 'frost', 'ember'].map((id) => q.available(id).length), [8, 2, 2]);
  assert.equal(q.start(ids.frost, 'home'), null); startAll(q);
  assert.equal(q.start(null, 'frost'), null);
  assert.equal(q.giveUp('frost', 'stale-id'), false);
  assert.equal(q.giveUp('frost'), true);
  assert.equal(q.active.id, ids.home); assert.equal(q.activeFor('ember').id, ids.ember);
  for (let i = 0; i < 20; i++) { const before = q.slots.frost.last; assert.notEqual(q.start(null, 'frost').id, before); q.giveUp('frost'); }
  q.setBridgeProvider(() => false); assert.equal(q.available('frost').length, 0); assert.equal(q.start(null, 'frost'), null);
});

test('regional feast consumes only its own requirements, blocks concurrent feasts, and counts completion once', () => {
  const { quests: q, inventory: inv } = log(); startAll(q);
  for (const fire of Object.keys(ids)) for (const [id, n] of Object.entries(q.activeFor(fire).needs)) inv.add(id, n);
  assert.equal(q.beginFeast('frost'), true);
  assert.equal(inv.count('forest-stew'), 0); assert.equal(inv.count('taro-coconut-bake'), 1);
  assert.equal(q.beginFeast('ember'), false); assert.equal(q.giveUp('frost'), false);
  assert.equal(q.finishFeast('home'), false); assert.equal(q.finishFeast('frost'), true); assert.equal(q.finishFeast('frost'), false);
  assert.equal(q.feasts, 1); assert.equal(q.activeFor('frost'), null);
  assert.equal(q.active.id, ids.home); assert.equal(q.activeFor('ember').id, ids.ember);
});

test('v1 migration assigns northern quest to Frostpine and keeps reward history; v2 reload recovers only the interrupted feast', () => {
  const store = new Map(), previous = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  try {
    store.set(LEGACY_STORAGE_KEY, JSON.stringify({ v: 1, active: ids.frost, last: ids.frost, feasts: 4, hatOrder: [0,1,2,3,4,5,6,7,8,9] }));
    const inv = new Inventory({ persist: false });
    const q = new QuestLog({ inventory: inv }); q.setBridgeProvider(() => true);
    assert.equal(q.active, null); assert.equal(q.activeFor('frost').id, ids.frost); assert.equal(q.feasts, 4);
    assert.equal(store.has(LEGACY_STORAGE_KEY), false); assert.equal(JSON.parse(store.get(STORAGE_KEY)).v, 2);
    q.start(ids.home, 'home'); q.start(ids.ember, 'ember');
    for (const [id, n] of Object.entries(q.activeFor('frost').needs)) inv.add(id, n);
    q.beginFeast('frost');
    const reloaded = new QuestLog({ inventory: inv });
    assert.equal(reloaded.feasts, 5); assert.equal(reloaded.activeFor('frost'), null);
    assert.equal(reloaded.active.id, ids.home); assert.equal(reloaded.activeFor('ember').id, ids.ember);
    assert.equal(new QuestLog({ inventory: inv }).feasts, 5);
    assert.deepEqual(reloaded.hatOrder, q.hatOrder);
  } finally { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; }
});

test('host and replica preserve all regional slots through requests, scoped cancellation, feast completion and a late snapshot', async () => {
  const host = new WorldSync({ role: 'host' }), replica = new WorldSync({ role: 'replica' }), queue = [];
  const send = (to, msg) => queue.push({ to, msg: JSON.parse(JSON.stringify(msg)) });
  host.attachHost({ sendTo: (_, msg) => send(replica, msg), broadcast: (msg) => send(replica, msg) });
  replica.attachReplica({ send: (msg) => { send(host, msg); return true; } });
  const flush = () => { while (queue.length) { const { to, msg } = queue.shift(); if (to === host) host.screenMessage(1, msg); else to.receive(msg); } };
  const h = log(), r = log(); h.inventory.attachSync(host); r.inventory.attachSync(replica); h.quests.attachSync(host); r.quests.attachSync(replica);
  replica.linkUp(); host.screenConnected(1, { clientId: 'regional' }); flush();
  for (const [fire, id] of Object.entries(ids)) { const request = r.quests.start(id, fire); flush(); assert.equal((await request).id, id); }
  assert.equal(host.hash(), replica.hash());
  r.quests.giveUp('ember'); flush(); assert.equal(h.quests.activeFor('ember'), null); assert.equal(r.quests.activeFor('frost').id, ids.frost);
  for (const [id, n] of Object.entries(h.quests.activeFor('frost').needs)) h.inventory.add(id, n);
  h.quests.beginFeast('frost'); flush(); assert.equal(r.quests.feastingFire, 'frost');
  assert.equal(r.quests.beginFeast('home'), false); h.quests.finishFeast('frost'); flush();
  assert.equal(host.hash(), replica.hash()); assert.equal(r.quests.active.id, ids.home);
  const late = log(); late.quests._mirror(h.quests._state()); assert.deepEqual(late.quests._state(), h.quests._state());
});

test('each campfire menu hides the redundant quest row and cancels only the quest named in its confirmation', () => {
  const { quests: q, inventory: inv } = log(); startAll(q);
  let confirm, prepared;
  const dialog = { isOpen: false, showChoices(rows) { confirm = rows; } };
  const fires = Object.keys(ids).map((id) => ({ id, name: id, lit: true, showMain() {}, setQuestProvider() {} }));
  const menu = createQuestMenu({ quests: q, dialog, inventory: inv, hud: { toast() {} }, campfires: { list: fires }, feast: { start(_, options) { prepared = options.fire.id; } } });
  for (const fire of fires) assert.deepEqual(menu.choices({}, fire).map((r) => r.label), ['Give up quest']);
  const frost = fires[1]; for (const [id, n] of Object.entries(q.activeFor('frost').needs)) inv.add(id, n);
  dialog.close = () => {};
  menu.choices({}, frost)[0].onSelect(); assert.equal(prepared, 'frost');
  menu.confirmGiveUp({}, frost); confirm.find((r) => r.label === 'Yes, give up').onSelect();
  assert.equal(q.activeFor('frost'), null); assert.ok(q.activeFor('home')); assert.ok(q.activeFor('ember'));
});
