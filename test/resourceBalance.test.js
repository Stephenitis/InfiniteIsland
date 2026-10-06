import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { bonusLogs, rareChance, ISLAND_SWINGS, toolReachBonus } from '../public/js/items/tools.js';
import { LOOT, DIG, rollRockRare, rollDig } from '../public/js/world/lootTable.js';
import { shakeResources, packTree, unpackTree } from '../public/js/game/treeResources.js';
import { createInteractions } from '../public/js/world/interactions.js';
import { addInteractable, clearInteractables } from '../public/js/world/interactables.js';
import { createSeedFx } from '../public/js/world/seedFx.js';
import { registerEmberGameplay } from '../public/js/world/islands/emberWorld.js';
import { ISLANDS } from '../public/js/config.js';
import { createHarvest } from '../public/js/world/harvest.js';
import { clearColliders } from '../public/js/world/colliders.js';

test('rock rare bonuses stack with obsidian base rates without multiplying quantities or dig bonuses', () => {
  assert.equal(LOOT.basalt.extra.chance, 0.16);
  assert.equal(DIG.ember.rare.chance, 0.2);
  assert.equal(rollRockRare(LOOT.basalt.extra, 'hammer', () => 0.319), 1);
  assert.equal(rollRockRare(LOOT.basalt.extra, 'hammer', () => 0.32), 0);
  for (const kind of ['axe', 'sword', 'lightsaber']) {
    assert.equal(rollRockRare(LOOT.basalt.extra, kind, () => 0.159), 1);
    assert.equal(rollRockRare(LOOT.basalt.extra, kind, () => 0.16), 0);
  }
  assert.equal(rollRockRare(LOOT.granite.extra, 'hammer', () => 0.139), 1);
  assert.equal(rollRockRare(LOOT.granite.extra, 'hammer', () => 0.14), 0);
  assert.equal(rareChance(0.06, 'hammer'), 0.12);
  assert.equal(rareChance(0.8, 'hammer'), 1);
  assert.deepEqual(rollDig(DIG.ember, () => 0.199), [{ item: 'obsidian', n: 1 }]);
  assert.equal(rollDig(DIG.ember, () => 0.2)[0].item, 'taro');
});

test('axe increases logs by 50% on average with fair fractional rounding; sword trades yield for speed and reach', () => {
  assert.equal(bonusLogs(0, 'axe'), 0);
  assert.equal(bonusLogs(2, 'axe'), 3);
  assert.equal(bonusLogs(3, 'axe', () => 0.49), 5);
  assert.equal(bonusLogs(3, 'axe', () => 0.5), 4);
  for (const kind of ['sword', 'hammer', 'lightsaber']) assert.equal(bonusLogs(3, kind), 3);
  assert.ok(ISLAND_SWINGS.sword.duration * 4 < ISLAND_SWINGS.axe.duration * 3);
  assert.ok(3.75 / (ISLAND_SWINGS.axe.duration * 3) > 2.5 / (ISLAND_SWINGS.sword.duration * 4), 'axe gathers logs faster overall');
  assert.equal(toolReachBonus('sword'), 0.4);
  assert.equal(toolReachBonus('axe'), 0);
});

test('three successful shakes reduce chance by 33% of base each time; failure never consumes a drop or restarts recovery', () => {
  let r = shakeResources(undefined, 0, 0.5, () => 0.499);
  assert.equal(r.fruit, true); assert.equal(r.state.readyAt, 30);
  const failure = shakeResources(r.state, 5, 0.5, () => 0.336);
  assert.equal(failure.fruit, false); assert.equal(failure.state.drops, 1); assert.equal(failure.state.readyAt, 30);
  r = shakeResources(failure.state, 10, 0.5, () => 0.334);
  assert.equal(r.fruit, true); assert.equal(r.state.readyAt, 40);
  assert.equal(shakeResources(r.state, 11, 0.5, () => 0.171).fruit, false);
  r = shakeResources(r.state, 20, 0.5, () => 0.169);
  assert.equal(r.fruit, true); assert.equal(r.state.drops, 3); assert.equal(r.state.readyAt, 50);
  r = shakeResources(r.state, 49.99, 0.5, () => 0);
  assert.equal(r.fruit, false); assert.equal(r.state.readyAt, 50);
  r = shakeResources(r.state, 50, 0.5, () => 0.499);
  assert.equal(r.fruit, true); assert.equal(r.state.drops, 1); assert.equal(r.state.readyAt, 80);
  const snapshot = packTree(r.state, 52);
  assert.equal(unpackTree(snapshot, 200).readyAt, 228, 'late join uses remaining game time');
  assert.equal(shakeResources(undefined, 0, 0, () => 0).fruit, false, 'non-resource trees stay empty');
});

test('recovery resets partial depletion and Journal rolls have an independent timer', () => {
  const first = shakeResources(undefined, 0, 0.6, () => 0);
  assert.equal(first.journal, true);
  assert.equal(shakeResources(first.state, 1, 0.6, () => 0.403).fruit, false);
  assert.equal(shakeResources(first.state, 1, 0.6, () => 0.401).fruit, true);
  const second = shakeResources(first.state, 29, 0.6, () => 0);
  assert.equal(second.journal, false);
  const next = shakeResources(second.state, 30, 0.6, () => 0.205);
  assert.equal(next.fruit, false); assert.equal(next.journal, true);
  assert.equal(next.state.readyAt, 59);
  const recovered = shakeResources(next.state, 59, 0.6, () => 0.599);
  assert.equal(recovered.fruit, true); assert.equal(recovered.state.drops, 1);
});

function fixtureInteractions(isHost, tree) {
  const domains = {}, events = [], spawned = [], journal = [];
  const actor = { screen: 'host', index: 0, pos: { x: tree.position.x, z: tree.position.z + 1 } };
  const player = { index: 0, position: actor.pos, faceToward() {} };
  const sync = { isHost, screenId: isHost ? 'host' : 'replica', register: (name, d) => domains[name] = d,
    emit: (domain, kind, data) => events.push({ kind, data }), actorFor: () => actor };
  sync.request = (domain, kind, data, who) => domains[domain].handleRequest(kind, data, who);
  const fx = createInteractions({ scene: new THREE.Scene(), players: { p1: player, get: () => player },
    dialog: {}, hud: { toast() {} }, particles: { burst() {} }, pickups: { spawnTo: (...args) => spawned.push(args) },
    sync, collectFind: (...args) => journal.push(args) });
  return { fx, domains, events, spawned, journal, player, actor };
}

test('real shake handler shares depletion between players, independent trees, snapshots and cosmetic shaking', () => {
  clearInteractables();
  const make = (x) => {
    const object = new THREE.Group(); object.position.set(x, 1, 0);
    object.userData.canopy = new THREE.Group(); object.add(object.userData.canopy);
    return addInteractable({ type: 'tree', position: object.position, radius: 0.5, object });
  };
  const a = make(0), b = make(10), replica = fixtureInteractions(false, a), host = fixtureInteractions(true, a);
  const original = Math.random; Math.random = () => 0;
  try {
    for (let i = 0; i < 4; i++) {
      assert.equal(host.fx.interact(a, host.player), true);
      const e = host.events.at(-1); replica.domains.interactions.applyEvent(e.kind, e.data);
      host.fx.update(1); replica.fx.update(1);
      if (i === 1) host.player.index = 1; // another player does not replenish a tree
    }
    assert.equal(host.spawned.length, 3);
    assert.equal(host.journal.length, 1);
    assert.deepEqual(host.domains.interactions.hashView(), replica.domains.interactions.hashView());
    host.domains.interactions.handleRequest('shake', { id: b.id }, { ...host.actor, pos: { x: 10, z: 1 } });
    host.fx.update(1);
    assert.equal(host.spawned.length, 4, 'different tree has its own supply');
    replica.fx.update(100);
    replica.domains.interactions.applySnapshot(host.domains.interactions.snapshot());
    assert.deepEqual(host.domains.interactions.hashView(), replica.domains.interactions.hashView());
    assert.equal(replica.domains.interactions.snapshot().trees[0].recovery, host.domains.interactions.snapshot().trees[0].recovery);
    host.fx.update(27);
    host.fx.interact(a, host.player); host.fx.update(1);
    assert.equal(host.spawned.length, 5, 'recovered tree can drop fruit again');
  } finally { Math.random = original; clearInteractables(); }
});

test('final-hit tool determines real tree log yield and rock rare yield', () => {
  clearInteractables(); clearColliders();
  const domains = {}, drops = [], finds = [], noop = () => {};
  let kind = 'sword';
  const make = (type, variant, x) => {
    const g = new THREE.Group(); g.position.set(x, 1, 0); g.add(new THREE.Group()); g.userData.variant = variant;
    g.userData.interactable = addInteractable({ type, position: g.position, radius: 0.6, object: g });
    return g;
  };
  const tree = make('tree', 'breadfruit', 0), rock = make('rock', 'basalt', 10);
  const sync = { isHost: true, screenId: 'host', register: (k, d) => domains[k] = d, emit: noop, remoteActorNear: () => false };
  const harvest = createHarvest({ scene: new THREE.Scene(), players: { list: [], get: () => null },
    items: { heldByKey: () => ({ kind }) }, sync, particles: { burst: noop }, hud: { toast: noop },
    interactions: { stopAnim: noop }, props: { handles: { trees: [tree], palms: [], rocks: [rock] }, setWobble: noop },
    pickups: { spawn: (item) => drops.push(item) }, collectFind: (...args) => finds.push(args) });
  const hit = (g) => domains.harvest.handleRequest('hit', { id: g.userData.interactable.id }, { screen: 'host', index: 0, pos: { x: g.position.x, z: 1 } });
  const original = Math.random; Math.random = () => 0.2;
  try {
    hit(tree); hit(tree); kind = 'axe'; hit(tree);
    for (let i = 0; i < 100; i++) harvest.update(0.02);
    assert.equal(drops.filter((d) => d === 'breadfruit-log').length, 3);
    kind = 'sword'; hit(rock); kind = 'hammer'; hit(rock);
    assert.equal(drops.filter((d) => d === 'obsidian').length, 1, '0.2 roll succeeds only with hammer bonus');
    assert.equal(finds.at(-1)[3], 'hammer');
  } finally { Math.random = original; clearInteractables(); clearColliders(); }
});

test('seed effects enlarge glints, cluster 27 daytime fireflies, add soft night halos and hide found cues', () => {
  const data = registerEmberGameplay(ISLANDS.find((i) => i.id === 'ember'));
  const clock = { hour: 16 }, scene = new THREE.Scene();
  const fx = createSeedFx({ scene, clock, spots: data.seedPlan });
  const camera = new THREE.PerspectiveCamera(45); camera.position.set(200, 30, 80);
  for (let i = 0; i < 100; i++) fx.update(i / 60, camera, 768);
  const cues = fx.summary().cues;
  assert.equal(cues.filter((c) => c.type === 'flies').length, 27);
  assert.ok(cues.filter((c) => c.type === 'flies').every((c) => c.alpha > 0.99));
  assert.equal(cues.filter((c) => c.id === 'moon-orchid').length, 2);
  assert.equal(cues.filter((c) => c.id === 'glow-hibiscus').length, 2);
  for (const hour of [14.99, 23]) {
    clock.hour = hour;
    for (let i = 0; i < 100; i++) fx.update(i / 60, camera, 768);
    assert.ok(fx.summary().cues.filter((c) => c.type === 'flies').every((c) => c.alpha < 0.01), `fireflies off outside window at ${hour}`);
  }
  clock.hour = 16;
  for (let i = 0; i < 100; i++) fx.update(i / 60, camera, 768);
  const params = fx.points.geometry.getAttribute('aParams');
  cues.forEach((c, i) => { if (c.type === 'glint') assert.ok(params.getX(i) > 2); });
  clock.hour = 0;
  for (let i = 0; i < 100; i++) fx.update(i / 60, camera, 768);
  assert.ok(fx.summary().cues.filter((c) => c.type === 'flies').every((c) => c.alpha < 0.01));
  assert.ok(fx.summary().cues.filter((c) => c.type === 'glow').every((c) => c.alpha > 0.99));
  fx.setFound(['moon-orchid', 'firefly-plumeria']); fx.update(2, camera, 768);
  assert.ok(fx.summary().cues.filter((c) => ['moon-orchid', 'firefly-plumeria'].includes(c.id)).every((c) => c.alpha === 0));
  data.visuals?.dispose?.();
});
