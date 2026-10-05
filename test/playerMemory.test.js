import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPlayerMemory, PLAYER_MEMORY_KEY, rememberedTool } from '../public/js/game/playerMemory.js';
import { setSaveEnabled } from '../public/js/game/save.js';
import { createItems } from '../public/js/world/items.js';
import { getToolAction } from '../public/js/items/tools.js';
import { clearInteractables, getInteractables } from '../public/js/world/interactables.js';
import { clearColliders } from '../public/js/world/colliders.js';

test('return memory survives reload, tracks empty hands and validates saved data', () => {
  const store = new Map(); let writes = 0;
  globalThis.localStorage = { getItem: (k) => store.get(k), setItem(k, v) { writes++; store.set(k, v); } };
  try {
    const memory = createPlayerMemory();
    memory.remember(0, 'frost', { kind: 'lightsaber', color: '#ff00aa', roll: Math.PI });
    memory.remember(0, 'frost', { kind: 'lightsaber', color: '#ff00aa', roll: Math.PI });
    assert.equal(writes, 1, 'unchanged state does not write every frame');
    assert.deepEqual(createPlayerMemory().get(0), { zone: 'frost', tool: { kind: 'lightsaber', color: '#ff00aa', roll: Math.PI } });
    memory.remember(0, 'ritual', null);
    assert.deepEqual(createPlayerMemory().get(0), { zone: 'ritual', tool: null });
    memory.remember(0, 'dungeon', { kind: 'sword' });
    assert.deepEqual(createPlayerMemory().get(0), { zone: 'dungeon', tool: { kind: 'sword', color: null, roll: 0 } });
    store.set(PLAYER_MEMORY_KEY, JSON.stringify({ v: 1, players: {
      0: { zone: 'unknown', tool: { kind: 'axe' } },
      1: { zone: 'ember', tool: { kind: 'toString' } },
      2: { zone: 'home', tool: { kind: 'axe', color: 'invalid', roll: 'bad' } },
    } }));
    const loaded = createPlayerMemory();
    assert.equal(loaded.get(0), null);
    assert.equal(loaded.get(1).tool, null);
    assert.deepEqual(loaded.get(2).tool, { kind: 'axe', color: null, roll: 0 });
    setSaveEnabled(false);
    assert.equal(createPlayerMemory().get(2), null);
    const before = writes;
    memory.remember(0, 'home', { kind: 'axe' });
    assert.equal(writes, before, 'replicas never write host saves');
  } finally { setSaveEnabled(true); delete globalThis.localStorage; }
  assert.equal(rememberedTool({ kind: '__proto__' }), null);
});

function setup() {
  clearInteractables(); clearColliders();
  globalThis.document = { createElement: () => ({ getContext: () => ({
    createRadialGradient: () => ({ addColorStop() {} }), fillRect() {},
  }) }) };
  const scene = new THREE.Scene(), root = new THREE.Group(), handSocket = new THREE.Group();
  root.add(handSocket); scene.add(root);
  const player = { index: 0, root, position: new THREE.Vector3(0, 1, 12), facing: 0,
    parts: { handSocket, armR: { userData: { restZ: 0 } } },
    swing() { this.swinging = true; this.swingProgress = 0; return true; },
  };
  const players = { p1: player, list: [player], players: [player], get: () => player, labelOf: () => 'P1' };
  const domains = {}, events = [], bursts = [];
  const sync = { isHost: true, screenId: 'host', on() {}, register(name, d) { domains[name] = d; },
    actorFor: () => ({ screen: 'host', index: 0, pos: player.position }),
    emit(name, kind, data) { events.push({ kind, data }); },
    request(name, kind, data, actor) { const result = domains[name].handleRequest(kind, data, actor); return { ok: !result?.reject }; },
  };
  const items = createItems({ scene, players, particles: { burst(kind) { bursts.push(kind); } }, hud: { toast() {} }, sync });
  return { items, player, sync, domain: domains.items, events, bursts };
}

test('every ethereal tool is held, translucent and retains normal actions; dropping removes it', () => {
  try {
    for (const kind of ['axe', 'sword', 'hammer', 'shovel', 'lightsaber']) {
      const { items, player, bursts, domain } = setup();
      const mapCount = getInteractables().length;
      const rec = items.restoreEthereal({ kind, color: '#ff00aa' }, player);
      assert.equal(items.heldBy(player), rec);
      assert.equal(rec.pivot.parent, player.parts.handSocket);
      assert.equal(getToolAction(rec, { type: 'ritualstone' }), 'strike');
      assert.equal(getToolAction(rec, { type: kind === 'shovel' ? 'digspot' : 'rock' }), kind === 'shovel' ? 'dig' : 'break');
      assert.ok(items.swing(player));
      rec.model.traverse((m) => { if (m.isMesh) { assert.ok(m.material.transparent); assert.ok(m.material.opacity <= 0.72); } });
      assert.equal(getInteractables().length, mapCount);
      items.dropHeld(player);
      items.update(1, 1);
      assert.equal(items.heldBy(player), null);
      assert.equal(rec.state, 'gone');
      assert.equal(rec.pivot.parent, null);
      assert.equal(rec.ground.parent, null);
      assert.equal(rec.interactable, null);
      assert.ok(bursts.includes('puff'));
      assert.ok(domain.snapshot().items[rec.id].gone);
    }
  } finally { delete globalThis.document; clearInteractables(); clearColliders(); }
});

test('map-tool swap poofs the copy and leaves the map tool held', () => {
  try {
    const { items, player } = setup();
    const copy = items.restoreEthereal({ kind: 'shovel' }, player);
    const real = items.equip('axe', player);
    assert.ok(real && !real.ethereal);
    assert.equal(copy.state, 'gone');
    assert.equal(items.heldBy(player), real);
    assert.equal(player.holding, true);
    items.update(0.3, 0.3);
    assert.equal(real.state, 'held');
    assert.equal(copy.interactable, null);
  } finally { delete globalThis.document; clearInteractables(); clearColliders(); }
});

test('late-join snapshots and drop events preserve ethereal lifecycle', () => {
  try {
    const host = setup();
    const copy = host.items.restoreEthereal({ kind: 'lightsaber', color: '#ff00aa' }, host.player);
    const snapshot = host.domain.snapshot();
    const replica = setup(); replica.sync.isHost = false; replica.sync.screenId = 'guest';
    replica.domain.applySnapshot(snapshot);
    const mirror = replica.items.list[copy.id];
    assert.equal(mirror.state, 'remote');
    assert.equal(mirror.ethereal, true);
    assert.equal(mirror.color, '#ff00aa');
    host.items.dropHeld(host.player);
    const event = host.events.at(-1);
    replica.domain.applyEvent(event.kind, event.data);
    assert.equal(mirror.state, 'gone');
    const late = setup(); late.sync.screenId = 'late';
    late.domain.applySnapshot(host.domain.snapshot());
    assert.equal(late.items.list[copy.id].state, 'gone');
    assert.equal(late.items.list[copy.id].interactable, null);
  } finally { delete globalThis.document; clearInteractables(); clearColliders(); }
});
