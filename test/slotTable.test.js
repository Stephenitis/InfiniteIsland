import test from 'node:test';
import assert from 'node:assert/strict';
import { SlotTable } from '../public/js/players/slotTable.js';
import { createPlayersDomain } from '../public/js/net/playersDomain.js';
import { WorldSync } from '../public/js/net/worldSync.js';

test('SlotTable: claims take the lowest free slot and are idempotent per (screen, dev)', () => {
  const t = new SlotTable(4);
  assert.deepEqual(t.claim('host', 'p1', { kind: 'keyboard' }), { ok: true, slot: 0, existing: false });
  assert.deepEqual(t.claim('s1', 'local'), { ok: true, slot: 1, existing: false });
  assert.deepEqual(t.claim('s1', 'local'), { ok: true, slot: 1, existing: true });      // same device again: same slot
  assert.equal(t.claim('host', 'local').slot, 2);                                        // same dev name on ANOTHER screen is another claimant
  assert.equal(t.get(1).name, 'P2');
  assert.equal(t.count, 3);
});

test('SlotTable: full island rejects, release frees the lowest slot for the next claim', () => {
  const t = new SlotTable(4);
  for (let i = 0; i < 4; i++) assert.ok(t.claim('s' + (i % 2), 'd' + i).ok);
  assert.equal(t.isFull, true);
  assert.deepEqual(t.claim('s9', 'late'), { ok: false, reason: 'full' });
  assert.equal(t.claim('s0', 'd0').existing, true);                                      // holders are never locked out by a full table
  assert.equal(t.release('s1', 'd1'), true);
  assert.equal(t.release('s1', 'd1'), false);                                            // double release is harmless
  assert.deepEqual(t.claim('s9', 'late'), { ok: true, slot: 1, existing: false });
});

test('SlotTable: a screen that drops keeps its slots (away) and gets them back; releaseScreen frees them all', () => {
  const t = new SlotTable(4);
  t.claim('host', 'p1'); t.claim('s1', 'local'); t.claim('s1', 'pad:0');
  assert.equal(t.setAway('s1', true), true);
  assert.equal(t.setAway('s1', true), false);                                            // no change
  assert.equal(t.get(1).away, true);
  assert.equal(t.claim('s2', 'x').slot, 3);                                              // the away slots stay reserved
  assert.equal(t.claim('s1', 'local').slot, 1);                                          // reconnect: same slot, away cleared
  assert.equal(t.get(1).away, false);
  assert.deepEqual(t.releaseScreen('s1'), [1, 2]);
  assert.deepEqual(t.ownedBy('s1'), []);
  assert.equal(t.count, 2);
});

test('SlotTable: snapshot / load round-trip (JSON safe) and tolerate garbage', () => {
  const t = new SlotTable(4);
  t.claim('host', 'p1', { kind: 'phone' }); t.claim('s1', 'pad:2', { kind: 'gamepad' }); t.setAway('s1', true);
  const u = new SlotTable(4);
  u.load(JSON.parse(JSON.stringify(t.snapshot())));
  assert.deepEqual(u.snapshot(), t.snapshot());
  u.load(null);
  assert.equal(u.count, 0);
  u.load([{ screen: 's1', dev: 'a' }, 7, null]);
  assert.equal(u.count, 1);
  assert.equal(u.get(0).name, 'P1');
});

// ---- the 'players' domain over an in-memory host <-> replica link (see worldSync.test.js for the same pattern)
function world(nReplicas = 2) {
  const host = new WorldSync({ role: 'host', graceSeconds: 2 });
  const hostTable = new SlotTable(4);
  const changes = { host: 0 };
  createPlayersDomain({ sync: host, table: hostTable, onChange: () => changes.host++, spawnHint: () => ({ x: 1, z: 2 }) });
  hostTable.claim('host', 'p1');                                                         // (PlayerManager does this for the host's P1)
  const q = [];
  const replicas = new Map();
  host.attachHost({
    sendTo: (tid, msg) => q.push({ tid, msg: JSON.parse(JSON.stringify(msg)) }),
    broadcast: (msg) => { for (const tid of replicas.keys()) q.push({ tid, msg: JSON.parse(JSON.stringify(msg)) }); },
  });
  const flush = () => {
    let g = 0;
    while (q.length && g++ < 1000) {
      const x = q.shift();
      if (x.from !== undefined) host.screenMessage(x.from, x.msg); else replicas.get(x.tid)?.sync.receive(x.msg);
    }
  };
  const add = (clientId, tid) => {
    const sync = new WorldSync({ role: 'replica' });
    const table = createPlayersDomain({ sync, table: new SlotTable(4) });
    replicas.set(tid, { sync, table });
    sync.attachReplica({ send: (m) => { q.push({ from: tid, msg: JSON.parse(JSON.stringify(m)) }); return true; } });
    sync.linkUp();
    host.screenConnected(tid, { clientId });
    flush();
    return { sync, table, tid };
  };
  const reps = [];
  for (let i = 0; i < nReplicas; i++) reps.push(add('c' + i, i + 1));
  return { host, hostTable, reps, flush, add, changes, drop(tid) { replicas.delete(tid); host.screenDisconnected(tid); } };
}
const claim = async (w, rep, dev, kind = 'gamepad') => {
  const p = rep.sync.request('players', 'claim', { dev, kind }, null);
  w.flush();
  return p;
};

test('players domain: replica claims go through the host, every screen sees the same table, P-numbers are global', async () => {
  const w = world(2);
  const [a, b] = w.reps;
  const r1 = await claim(w, a, 'local', 'keyboard');
  assert.deepEqual(r1, { ok: true, result: { slot: 1, spawn: { x: 1, z: 2 } } });        // host P1 holds slot 0
  assert.equal(w.host.request('players', 'claim', { dev: 'pad:0', kind: 'gamepad' }, null).result.slot, 2);   // host-local claim is synchronous
  const r3 = await claim(w, b, 'local');
  assert.equal(r3.result.slot, 3);
  w.flush();
  assert.deepEqual(a.table.snapshot(), w.hostTable.snapshot());
  assert.deepEqual(b.table.snapshot(), w.hostTable.snapshot());
  assert.equal(a.table.get(3).screen, 's2');
  assert.equal(w.host.hash(), a.sync.hash());
});

test('players domain: a 5th device anywhere gets "full"; a release makes room; hashes stay equal', async () => {
  const w = world(2);
  const [a, b] = w.reps;
  await claim(w, a, 'local'); await claim(w, a, 'pad:1'); await claim(w, b, 'local');
  assert.equal(w.hostTable.isFull, true);
  assert.deepEqual(await claim(w, b, 'pad:0'), { ok: false, reason: 'full' });
  assert.deepEqual(w.host.request('players', 'claim', { dev: 'pad:3' }, null), { ok: false, reason: 'full' });
  const rel = a.sync.request('players', 'release', { dev: 'pad:1' }, null); w.flush(); assert.equal((await rel).ok, true);
  assert.equal((await claim(w, b, 'pad:0')).result.slot, 2);
  assert.equal(w.host.hash(), b.sync.hash());
});

test('players domain: a screen that drops keeps its slots through the grace period and gets them back; otherwise they are freed', async () => {
  const w = world(2);
  const [a, b] = w.reps;
  await claim(w, a, 'local'); await claim(w, a, 'pad:0'); await claim(w, b, 'local');
  w.drop(a.tid); w.flush();
  assert.equal(w.hostTable.get(1).away, true);
  assert.equal(b.table.get(1).away, true);                                               // the other screen sees it as away too
  w.host.update(1);
  assert.equal(w.hostTable.ownedBy('s1').length, 2);                                     // still inside the 2 s grace of this test
  const a2 = w.add('c0', 9);                                                             // same clientId reconnects: same screen id, slots back
  assert.equal(w.hostTable.get(1).away, false);
  assert.equal((await claim(w, { sync: a2.sync }, 'local')).result.slot, 1);
  assert.equal((await claim(w, { sync: a2.sync }, 'pad:0')).result.slot, 2);
  // now it really leaves
  w.drop(9); w.flush();
  w.host.update(1); assert.equal(w.hostTable.ownedBy('s1').length, 2);
  w.host.update(1.5); w.flush();
  assert.equal(w.hostTable.ownedBy('s1').length, 0);                                     // grace over: freed
  assert.equal(b.table.count, 2);                                                        // host P1 + b's own
  assert.equal(w.hostTable.ownedBy('s2').length, 1);
});
