import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDungeon } from '../public/js/game/dungeon.js';
import { RITUAL } from '../public/js/world/islands/ritual.js';
import { getHeight } from '../public/js/world/terrain.js';
import { createItems } from '../public/js/world/items.js';
import { createGuardianModel } from '../public/js/world/dungeonVisuals.js';
import { ENEMY_KINDS } from '../public/js/game/dungeonLogic.js';
import { RECIPES } from '../public/js/game/catalog.js';
import { ownedMeals, GUARDIAN_GUIDE, createDungeonBook } from '../public/js/ui/dungeonBook.js';

const canvas = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) });
function supplyHarness(host) {
  const domains = {}, events = [];
  const sync = { screenId: host ? 'host' : 'remote', isHost: host, isReplica: !host,
    on() {}, register(k, d) { domains[k] = d; }, emit(k, type, data) { events.push({ k, type, data }); } };
  const items = createItems({ scene: new THREE.Scene(), players: { list: [], players: [], get() {} }, particles: {}, hud: {}, sync });
  return { items, domain: domains.items, events };
}
test('weapon supplies scale from zero to one/four entrants and synchronize snapshots and live events', () => {
  globalThis.document = { createElement: canvas };
  const h = supplyHarness(true), r = supplyHarness(false);
  const active = (x) => x.items.list.filter((i) => i.dungeonSlot !== undefined && i.enabled);
  assert.equal(active(h).length, 0);
  h.items.dungeonSupply(1, true); assert.equal(active(h).length, 3);
  assert.deepEqual(active(h).map((i) => i.kind), ['sword', 'axe', 'hammer']);
  r.domain.applySnapshot(h.domain.snapshot()); assert.equal(active(r).length, 3);
  h.items.dungeonSupply(4); const event = h.events.at(-1); r.domain.applyEvent(event.type, event.data);
  assert.equal(active(r).length, 12); assert.deepEqual(r.domain.snapshot(), h.domain.snapshot());
  h.items.dungeonSupply(4); assert.equal(active(h).length, 12);
  h.items.dungeonSupply(0); assert.equal(active(h).length, 0);
  assert.ok(h.items.list.filter((i) => i.dungeonSlot !== undefined).every((i) => !i.interactable && !i.ground.visible));
  r.domain.applySnapshot(h.domain.snapshot()); assert.equal(active(r).length, 0);
  h.items.dungeonSupply(2, true); assert.equal(active(h).length, 6);
  h.items.update(0.1, 1); // disabled records never animate or regain interactables
  assert.equal(active(h).length, 6);
  delete globalThis.document;
});
test('provisions filter to owned cooked dishes; the guide covers every actual guardian model', () => {
  const counts = new Map([[RECIPES[0].dish, 2], ['apple', 5]]);
  assert.deepEqual(ownedMeals({ count: (id) => counts.get(id) || 0 }), [RECIPES[0]]);
  counts.delete(RECIPES[0].dish); assert.deepEqual(ownedMeals({ count: (id) => counts.get(id) || 0 }), []);
  assert.deepEqual(Object.keys(GUARDIAN_GUIDE), Object.keys(ENEMY_KINDS));
  for (const kind of Object.keys(ENEMY_KINDS)) {
    const model = createGuardianModel(kind); assert.ok(model.children.length > 0);
    assert.ok(model.children.every((o) => !o.isSprite));
    model.traverse((o) => { if (o.geometry) { assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite)); o.geometry.dispose(); } });
  }
});
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.disabled = false; }
  setAttribute() {}
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  querySelector() { return null; }
}
test('provisions expose quantities, clamp to the menu owner, disable combat/full HP and remove consumed meals', async () => {
  globalThis.document = { createElement: (tag) => new Element(tag), activeElement: null };
  const p1 = { index: 0, colors: { name: 'P1' } }, p2 = { index: 1, colors: { name: 'P2' } };
  const players = { list: [p1, p2], get: (i) => players.list.find((p) => p.index === i) };
  const hp = [100, 50], counts = new Map([[RECIPES[0].dish, 1]]), eats = []; let combat = false;
  const dungeon = { member: (p) => ({ hp: hp[p.index] }), inCombat: () => combat,
    async eat(recipe, p) { eats.push([recipe, p.index]); counts.delete(RECIPES[0].dish); hp[p.index] += 25; } };
  const provisions = new Element('div');
  const book = createDungeonBook({ provisions, guide: new Element('div'), dungeon, players, inventory: { count: (id) => counts.get(id) || 0 } });
  const meals = () => provisions.children.filter((c) => c.tag === 'button');
  book.setOwner(p2); book.refresh(); assert.equal(meals().length, 1); assert.equal(meals()[0].disabled, false);
  combat = true; book.refresh(); assert.equal(meals()[0].disabled, true);
  combat = false; book.setOwner(p1); book.refresh(); assert.equal(meals()[0].disabled, true);
  book.setOwner(p2); book.refresh(); await meals()[0].onclick();
  assert.deepEqual(eats, [[RECIPES[0].id, 1]]); assert.equal(meals().length, 0);
  delete globalThis.document;
});

test('stone progress is silent; entry and late arrivals size supplies without duplication on HP reset', () => {
  globalThis.document = { createElement: () => ({ getContext: () => ({ beginPath() {}, roundRect() {}, fill() {}, stroke() {}, fillText() {} }) }) };
  const domains = {}, toasts = [], supply = [], stones = Array.from({ length: 4 }, () => { const stone = new THREE.Group(); stone.userData.interactable = {}; return stone; });
  const p = { index: 0, position: new THREE.Vector3(RITUAL.circle.x, getHeight(RITUAL.circle.x, RITUAL.circle.z), RITUAL.circle.z), setPose() {}, teleport(x,z) { this.position.set(x,8,z); } };
  const table = { slots: [{ screen: 'host' }], get(i) { return this.slots[i]; } };
  const sync = { isHost: true, screenId: 'host', actors: new Map(), actorFor: (pl) => ({ screen: 'host', index: pl.index, pos: pl.position }), register(k,d) { domains[k] = d; }, emit() {} };
  const dungeon = createDungeon({ scene: new THREE.Scene(), ritual: { stones }, players: { list: [p], _updateFocus() {} }, avatars: { list: [] }, table,
    items: { dungeonSupply(...args) { supply.push(args); } }, inventory: {}, sync, hud: { toast(t) { toasts.push(t); } }, hudRoot: { classList: { toggle() {} } }, dialog: { close() {} }, camera: { snap() {} }, particles: { burst() {} }, sfx: { play() {} }, cinematic: { busy: false } });
  stones[0].userData.onStrike(); stones[0].userData.onStrike(); stones[0].userData.onStrike(); assert.deepEqual(toasts, []);
  stones[2].userData.onStrike(); assert.equal(toasts.length, 1);
  assert.equal(domains.dungeon.handleRequest('enter', {}, sync.actorFor(p), 'host'), true); assert.deepEqual(supply, [[1, true]]);
  table.slots.push({ screen: 'friend' }); dungeon.update(0.1, 1); assert.deepEqual(supply.at(-1), [2]);
  p.position.set(1200, 8, 1000); dungeon.state.members['host:0'].hp = 1;
  const enemy = dungeon.state.enemies[0]; enemy.x = 1200; enemy.z = 1001; enemy.wind = 0.05; enemy.target = 'host:0'; enemy.aim = { x: 1200, z: 1000 };
  dungeon.update(0.1, 2); assert.equal(supply.length, 2); assert.equal(dungeon.member(p).hp, 100);
  delete globalThis.document;
});
