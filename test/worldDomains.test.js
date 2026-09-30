import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSync } from '../public/js/net/worldSync.js';
import { HitTracker, RegrowSchedule } from '../public/js/world/harvestLogic.js';
import { DayNight } from '../public/js/world/dayNight.js';
import { QuestLog, QUESTS } from '../public/js/game/quests.js';
import { Inventory } from '../public/js/game/inventory.js';

// ---- a host + replica pair wired by an in-memory transport (JSON round-tripped, delivered by flush())
function pair() {
  const host = new WorldSync({ role: 'host' });
  const replica = new WorldSync({ role: 'replica' });
  const q = [];
  host.attachHost({
    sendTo: (tid, msg) => q.push({ to: 'r', msg: JSON.parse(JSON.stringify(msg)) }),
    broadcast: (msg) => q.push({ to: 'r', msg: JSON.parse(JSON.stringify(msg)) }),
  });
  replica.attachReplica({ send: (m) => { q.push({ to: 'h', msg: JSON.parse(JSON.stringify(m)) }); return true; } });
  const flush = () => { let g = 0; while (q.length && g++ < 1000) { const x = q.shift(); if (x.to === 'r') replica.receive(x.msg); else host.screenMessage(1, x.msg); } };
  return { host, replica, flush, connect() { replica.linkUp(); host.screenConnected(1, { clientId: 'c1' }); flush(); } };
}

test('HitTracker: hits of every actor add up, the memory resets a neglected target, the final hit uses the hitter\'s need', () => {
  const h = new HitTracker(8);
  assert.deepEqual(h.hit('t', 3, 0), { hits: 1, final: false });
  assert.deepEqual(h.hit('t', 3, 2), { hits: 2, final: false });     // (another actor: same counter)
  assert.deepEqual(h.hit('t', 1, 3), { hits: 3, final: true });      // a lightsaber (need 1) finishes it
  h.reset('t');
  h.hit('t', 3, 10); assert.equal(h.count('t', 12), 1);
  assert.equal(h.count('t', 19), 0);                                 // > 8 s since the last hit
  assert.deepEqual(h.hit('t', 3, 30), { hits: 1, final: false });    // restarted
  assert.equal(h.hit('other', 3, 30).hits, 1);                       // per target
});

test('RegrowSchedule: due only when the time came and nothing blocks; force ignores blocking; dueAll fast-forwards', () => {
  const r = new RegrowSchedule();
  r.set('a', 60); r.set('b', 45);
  assert.deepEqual(r.due(44), []);
  assert.deepEqual(r.due(50), ['b']);
  assert.deepEqual(r.due(50, (id) => id === 'b'), []);               // somebody stands on it: deferred
  assert.deepEqual(r.due(61, (id) => id === 'b'), ['a']);
  assert.deepEqual(r.due(10, null, true).sort(), ['a', 'b']);        // regrowNow
  assert.equal(r.remaining('a', 50), 10);
  r.cancel('b'); assert.equal(r.has('b'), false);
  r.dueAll(3); assert.deepEqual(r.due(3), ['a']);
});

test('WorldSync.remoteActorNear: near remote actors count, stale ones do not', () => {
  const { host, connect } = pair();
  connect();
  host.screenMessage(1, { type: 'request', id: 1, domain: 'nope', kind: 'x', data: {}, actor: { index: 0, pos: { x: 10, y: 0, z: 10 } } });
  assert.equal(host.remoteActorNear(10.5, 10, 1), true);
  assert.equal(host.remoteActorNear(20, 20, 1), false);
  host.actors.get('s1:0').ts -= 60000;                                // reported a minute ago
  assert.equal(host.remoteActorNear(10.5, 10, 1), false);
});

test('DayNight sync: replica snaps when far, eases when close, adopts the host lock; the host emits every ~5 s and on phase changes', () => {
  const { host, replica, flush, connect } = pair();
  const hostClock = new DayNight({ persist: false, params: new URLSearchParams('time=noon&daylock') });
  hostClock.attachSync(host);
  const repClock = new DayNight({ persist: false, params: new URLSearchParams() });
  repClock.attachSync(replica);
  connect();
  assert.ok(Math.abs(repClock.hour - 12) < 1e-6, 'snapshot snaps the replica to the host hour');
  assert.equal(repClock.locked, true, 'the replica adopts the host lock');
  assert.deepEqual(host.hashes().daynight, replica.hashes().daynight);

  // unlock the host, run it: the replica (running its own clock) stays close and converges through events
  hostClock.locked = false;
  hostClock._emitTime(); flush();
  assert.equal(repClock.locked, false);
  let events = 0;
  const off = host.emit.bind(host);
  host.emit = (...a) => { events++; return off(...a); };
  for (let i = 0; i < 60 * 30; i++) { hostClock.update(1 / 60); repClock.update(1 / 60); if (i % 60 === 0) flush(); }
  flush();
  assert.ok(events >= 5 && events <= 8, `host broadcast ~every 5 s (got ${events} in 30 s)`);
  assert.ok(Math.abs(repClock.hour - hostClock.hour) < 0.05, `replica follows (${repClock.hour} vs ${hostClock.hour})`);

  // a small offset is eased (never a jump), a big one snaps
  const before = repClock.hour;
  repClock._applyHost({ hour: before + 0.2, locked: false, speed: 1 }, false);
  assert.ok(Math.abs(repClock.hour - before) < 1e-9, 'no jump');
  repClock.update(0.5); assert.ok(repClock.hour > before && repClock.hour < before + 0.2);
  for (let i = 0; i < 600; i++) repClock.update(0.05);
  assert.ok(repClock.hour > before + 0.19, 'eased all the way');
  repClock._applyHost({ hour: 3, locked: true, speed: 1 }, false);
  assert.ok(Math.abs(repClock.hour - 3) < 1e-9, 'snaps when more than 0.25 h off');
  // wrap-around: 23.9 -> 0.1 is a 0.2 h step, not a 23.8 h one
  repClock._applyHost({ hour: 23.9, locked: true, speed: 1 }, true);
  repClock._applyHost({ hour: 0.1, locked: true, speed: 1 }, false);
  assert.ok(Math.abs(repClock.hour - 23.9) < 1e-9);
  for (let i = 0; i < 600; i++) repClock.update(0.05);
  assert.ok(Math.abs(((repClock.hour - 0.1 + 12) % 24 + 24) % 24 - 12) < 0.01);
  off && (host.emit = off);
});

test('QuestLog sync: the host picks (never repeating), a replica start() is a promise, give up + feast state mirror both ways', async () => {
  const { host, replica, flush, connect } = pair();
  const hostInv = new Inventory({ persist: false }); hostInv.attachSync(host);
  const repInv = new Inventory({ persist: false }); repInv.attachSync(replica);
  const hq = new QuestLog({ inventory: hostInv, persist: false }); hq.attachSync(host);
  const rq = new QuestLog({ inventory: repInv, persist: false }); rq.attachSync(replica);
  connect();
  assert.equal(rq.active, null);

  // replica asks: the host decides
  const p = rq.start();
  assert.ok(typeof p.then === 'function');
  flush();
  const t = await p;
  assert.ok(t && QUESTS.includes(t));
  assert.equal(hq.active.id, t.id);
  assert.equal(rq.active.id, t.id);
  assert.deepEqual(host.hashes().quests, replica.hashes().quests);
  assert.equal(await rq.start(), null, 'one shared quest: a second start does nothing');

  // give up from the replica, then the host picks again: never the same template twice in a row
  assert.equal(rq.giveUp(), true); flush();
  assert.equal(hq.active, null); assert.equal(rq.active, null);
  for (let i = 0; i < 30; i++) {
    const before = hq.last;
    const q = hq.start(); flush();
    assert.notEqual(q.id, before);
    assert.equal(rq.active.id, q.id);
    hq.giveUp(); flush();
  }

  // the feast: host consumes the needs atomically and the quest is cleared when the scene ends
  const q = hq.start(); flush();
  for (const [id, n] of Object.entries(q.needs)) hostInv.add(id, n);
  flush();
  assert.equal(rq.satisfied, true, 'progress is derived from the synced bag');
  assert.equal(hq.beginFeast(), true); flush();
  assert.equal(rq.feasting, true);
  assert.equal(rq.satisfied, false, 'ingredients are gone on both screens');
  assert.equal(rq.giveUp(), false, 'cannot give up mid-feast');
  hq.finishFeast(); flush();
  assert.equal(rq.active, null); assert.equal(rq.feasts, 1); assert.equal(hq.feasts, 1);
  assert.equal(rq.beginFeast(), false, 'a replica never consumes anything itself');
  assert.equal(host.hash(), replica.hash());
});
