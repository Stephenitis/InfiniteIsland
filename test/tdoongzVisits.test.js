import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TdoongVisits, RESIDENTS, VISIT_ISLANDS, GIFTS, inView, validView } from '../public/js/game/tdoongzVisits.js';
import { planIslandWander, wanderRoute, packWanderGraph, unpackWanderGraph, segmentClear } from '../public/js/game/tdoongzLogic.js';
import { createTdoongz } from '../public/js/world/tdoongz.js';
import { WorldSync } from '../public/js/net/worldSync.js';
import { Inventory, MAX_STACK } from '../public/js/game/inventory.js';
import { clearColliders } from '../public/js/world/colliders.js';
import { clearInteractables } from '../public/js/world/interactables.js';

test('island grid routes cover every quadrant and wind around a wall without cutting through it', () => {
  const clear = (x, z) => !(Math.abs(x) < 1 && z < 12);
  const graph = planIslandWander({ x: 0, z: 0, radius: 25 }, clear);
  assert.ok(graph.nodes.length > 100);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) assert.ok(graph.nodes.some(p => p.x * sx > 12 && p.z * sz > 12));
  const from = graph.nodes.findIndex(p => p.x === -12 && p.z === 0), to = graph.nodes.findIndex(p => p.x === 12 && p.z === 0);
  const route = wanderRoute(graph, from, to);
  assert.ok(route.some(i => graph.nodes[i].z >= 12));
  let prev = from;
  for (const i of route) { assert.ok(graph.adj[prev].includes(i)); assert.ok(segmentClear(graph.nodes[prev], graph.nodes[i], clear)); prev = i; }
  assert.equal(prev, to);
});

test('compact route snapshots preserve node indices and all clear edges within the relay budget', () => {
  const graph = planIslandWander({ x:197,z:47,radius:110 }, (x,z) => !(x>210&&x<230&&z<65));
  const packed = packWanderGraph(graph), restored = unpackWanderGraph(JSON.parse(JSON.stringify(packed)));
  assert.deepEqual(restored.nodes,graph.nodes);
  for (let i=0;i<graph.nodes.length;i++) assert.deepEqual(restored.adj[i].sort((a,b)=>a-b),graph.adj[i].sort((a,b)=>a-b));
  assert.ok(JSON.stringify(packed).length < 10000);
  assert.deepEqual(unpackWanderGraph(packWanderGraph({nodes:[],adj:[],links:[]})),{nodes:[],adj:[],links:[]});
});

test('visitors are rare, unique, capped at one per island and offer only the two rare gifts', () => {
  const s = new TdoongVisits(), arrived = [], left = [];
  const hooks = { spawnPoint: () => ({}), canLeave: () => false, arrive: v => arrived.push(v), leave: v => left.push(v) };
  s.advance(11.9, hooks); assert.equal(s.visits.length, 0);
  s.advance(12.1, hooks);
  assert.equal(s.visits.length, 3);
  assert.equal(new Set(s.visits.map(v => v.id)).size, 3);
  assert.deepEqual(s.visits.map(v => v.island), VISIT_ISLANDS);
  for (const v of s.visits) { assert.ok(GIFTS.includes(v.gift)); assert.ok(v.until - s.hours >= 3 && v.until - s.hours <= 5); assert.ok(!RESIDENTS[v.id]); }
  s.advance(10, hooks); assert.equal(s.visits.length, 3, 'expiry waits while visible');
  hooks.canLeave = () => true;
  s.advance(0, hooks); assert.equal(s.visits.length, 0); assert.equal(left.length, 3);
  for (const h of Object.values(s.next)) assert.ok(h - s.hours >= 24 && h - s.hours <= 48);
  s.advance(23.9, hooks); assert.equal(s.visits.length, 0);
});

test('blocked arrivals stay pending, and a saved consumed gift never returns on reload', () => {
  const s = new TdoongVisits();
  const hooks = { spawnPoint: () => null, canLeave: () => false, arrive() {}, leave() {} };
  s.advance(30, hooks); assert.equal(s.visits.length, 0);
  hooks.spawnPoint = () => ({});
  s.advance(0, hooks);
  const v = s.visits[0], gift = s.take(v.id, v.visit);
  assert.ok(GIFTS.includes(gift)); assert.equal(s.take(v.id, v.visit), null);
  const restored = new TdoongVisits(JSON.parse(JSON.stringify(s.snapshot())));
  assert.deepEqual(restored.snapshot(), s.snapshot());
  assert.equal(restored.take(v.id, v.visit), null);
  assert.equal(restored.take(v.id, v.visit + 1), null);
  assert.equal(restored.random(), s.random(), 'saved random sequence resumes');
});

test('malformed visitor saves are ignored and stale route indices are repaired on host reload', () => {
  assert.equal(new TdoongVisits({ visits: {} }).visits.length,0);
  assert.equal(new TdoongVisits({ visits: [null,{id:'imnabong',island:'home',visit:1,gift:'crystal',until:4}] }).visits.length,0);
  clearColliders(); clearInteractables();
  const oldStorage=globalThis.localStorage;
  const graph=planIslandWander({x:0,z:0,radius:30},()=>true,{spacing:6});
  globalThis.localStorage={getItem:key=>key==='infinite-island.tdoongz.v1'?JSON.stringify({friends:[{id:'imnabong',active:true,island:'home',x:12,y:1,z:6,yaw:0,node:999999,target:999999,state:'walk'}]}):null,setItem(){}};
  let friends;
  try {
    friends=createTdoongz({scene:new THREE.Scene(),players:{list:[]},dialog:{isOpen:false},world:{regions:{isFull:()=>false}},graphs:{home:graph,frost:graph,ember:graph}});
    const f=friends.get('imnabong');
    assert.ok(f.node>=0&&f.node<graph.nodes.length);
    assert.equal(f.target,-1);
    assert.equal(f.position.x,graph.nodes[f.node].x);
    assert.equal(f.position.z,graph.nodes[f.node].z);
    assert.doesNotThrow(()=>friends.update(1/60));
  } finally { for(const f of friends?.list||[])f.model?.dispose();globalThis.localStorage=oldStorage;clearColliders();clearInteractables(); }
});

const planes = [[1,0,0,10000],[-1,0,0,10000],[0,1,0,10000],[0,-1,0,10000],[0,0,1,10000],[0,0,-1,10000]];
test('camera reports require valid frustum planes, with a margin around the entire character', () => {
  assert.equal(validView(planes), true);
  assert.equal(validView([[NaN]]), false);
  assert.equal(validView(planes.map(p => p.map(v => v * 2))), false);
  assert.equal(inView(planes, { x: 10001, y: 0, z: 0 }, 2), true);
  assert.equal(inView(planes, { x: 10003, y: 0, z: 0 }, 2), false);
});

test('host and replica share roaming and visits; remote cameras, gift races, stale claims and full bags are honored', async () => {
  clearColliders(); clearInteractables();
  const h = new WorldSync(), r = new WorldSync({ role: 'replica' });
  const queue = [], copy = m => JSON.parse(JSON.stringify(m));
  h.attachHost({ sendTo: (_, m) => queue.push(['replica', copy(m)]), broadcast: m => queue.push(['replica', copy(m)]) });
  r.attachReplica({ send: m => { queue.push(['host', copy(m)]); return true; } });
  const flush = () => { while (queue.length) { const [to, m] = queue.shift(); if (to === 'host') h.screenMessage('test', m); else r.receive(m); } };
  const inventory = new Inventory({ persist: false }); inventory.attachSync(h);
  const remoteBag = new Inventory({ persist: false }); remoteBag.attachSync(r);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(1000, 20, 1000); camera.lookAt(1100, 20, 1100);
  const player = { index: 0, position: new THREE.Vector3(), colors: {} };
  const common = { camera, world: { regions: { isFull: () => false, summary: () => ({ full: [] }) } }, dialog: { isOpen: false }, persist: false };
  const home = planIslandWander({ x: 0, z: 0, radius: 30 }, () => true, { spacing: 6 });
  const graphAt = (x,z) => ({ ...home, nodes: home.nodes.map(p => ({ x: p.x + x, z: p.z + z })) });
  const delayedAvatar = {position:new THREE.Vector3(5000,0,0),root:{visible:true}};
  const hostFriends = createTdoongz({ ...common, scene: new THREE.Scene(), players: { list: [], p1: player }, avatars:{list:[delayedAvatar]}, sync: h, inventory, graphs: { home, frost: graphAt(0,-197), ember: graphAt(197,47) } });
  const remoteFriends = createTdoongz({ ...common, scene: new THREE.Scene(), players: { list: [], p1: player }, sync: r, inventory: remoteBag });
  // The two isolated screens share registries only in this Node fixture.
  clearColliders(); clearInteractables();
  try {
    r.linkUp(); h.screenConnected('test', { clientId: 'test' }); flush();
    assert.equal(r.status, 'synced');
    hostFriends.update(1/60);
    hostFriends.advanceHours(30);
    assert.equal(hostFriends.schedule().visits.length, 0, 'missing camera fails closed');
    let req = r.request('tdoongz', 'view', { planes, full: VISIT_ISLANDS }); flush(); assert.equal((await req).ok, true);
    hostFriends.advanceHours(0); assert.equal(hostFriends.schedule().visits.length, 0, 'remote camera sees all candidates');
    req = r.request('tdoongz', 'view', { planes, full: [] }); flush(); await req;
    hostFriends.advanceHours(0); flush();
    assert.equal(hostFriends.schedule().visits.length, 3);
    assert.deepEqual(remoteFriends.schedule().visits, hostFriends.schedule().visits);
    const v = hostFriends.schedule().visits[0], f = hostFriends.get(v.id);
    player.position.copy(f.position);
    const wrongOwner = { ...r.actorFor(player), index: 9 };
    req = r.request('tdoongz', 'gift', { id: v.id, visit: v.visit }, wrongOwner); flush(); assert.equal((await req).reason, 'invalid-actor');
    const far = { ...r.actorFor(player), pos: { x: 5000, y: 0, z: 0 } };
    req = r.request('tdoongz', 'gift', { id: v.id, visit: v.visit }, far); flush(); assert.equal((await req).reason, 'far');
    inventory.add(v.gift, MAX_STACK); flush();
    req = remoteFriends.claimGift(v.id, v.visit, player); flush(); assert.equal((await req).reason, 'bag-full');
    assert.equal(f.gift, v.gift);
    inventory.remove(v.gift, MAX_STACK); flush();
    const a = remoteFriends.claimGift(v.id, v.visit, player), b = remoteFriends.claimGift(v.id, v.visit, player); flush();
    assert.equal((await a).ok, true); assert.equal((await b).ok, false);
    assert.equal(inventory.count(v.gift), 1); assert.equal(remoteBag.count(v.gift), 1);
    assert.equal(remoteFriends.get(v.id).gift, null);
    const snapshot = h.domains.get('tdoongz').snapshot();
    r.domains.get('tdoongz').applySnapshot(copy(snapshot));
    assert.equal(remoteFriends.get(v.id).gift, null, 'late snapshot keeps consumed gift');
    for (let i=0;i<120;i++) {
      hostFriends.update(1/60); remoteFriends.update(1/60); flush();
    }
    for (const f of hostFriends.list.filter(f => f.active)) assert.ok(f.position.distanceTo(remoteFriends.get(f.id).position) < 0.5);
    assert.equal(h.hashes().tdoongz, r.hashes().tdoongz);
    req = r.request('tdoongz', 'view', { planes, full: VISIT_ISLANDS }); flush(); await req;
    hostFriends.advanceHours(10); assert.equal(hostFriends.get(v.id).active, true, 'expiry remains visible');
    req = r.request('tdoongz', 'talk', {id:v.id,visit:v.visit},r.actorFor(player));flush();await req;
    delayedAvatar.position.copy(f.position);
    player.position.set(5000, 0, 0);
    req = r.request('tdoongz', 'talk-end', {id:v.id,visit:v.visit},r.actorFor(player));flush();assert.equal((await req).ok,true);
    assert.equal(hostFriends.diagnostics().conversations.length,0);
    req = r.request('tdoongz', 'view', { planes, full: [] }, r.actorFor(player)); flush(); await req;
    hostFriends.advanceHours(0); flush();
    assert.equal(hostFriends.get(v.id).active, false);
    req = remoteFriends.claimGift(v.id, v.visit, player); flush(); assert.equal((await req).reason, 'visit-ended');
  } finally { for (const f of [...hostFriends.list,...remoteFriends.list]) f.model?.dispose(); clearColliders(); clearInteractables(); }
});
