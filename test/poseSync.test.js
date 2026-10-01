import test from 'node:test';
import assert from 'node:assert/strict';
import { PoseBuffer, decodePose } from '../public/js/net/poseBuffer.js';
import { WorldSync } from '../public/js/net/worldSync.js';
import { SlotTable } from '../public/js/players/slotTable.js';
import { createPlayersDomain } from '../public/js/net/playersDomain.js';

const wire = (slot, x, z = 0, vx = 0, facing = 0) => [slot, x * 100, z * 100, 150, facing * 1000, vx * 10, 0, vx ? 1 : 0, -1, 0];

test('pose buffer interpolates, bounds extrapolation and snaps after teleport', () => {
  const b = new PoseBuffer(100);
  b.push(wire(1, 0, 0, 4), 1000);
  b.push(wire(1, 1, 0, 4), 1100);
  assert.equal(b.sample(1150).x, 0.5);
  assert.ok(b.sample(2000).x <= 1.33); // only 80 ms of extrapolation
  b.push(wire(1, 30), 2100);
  assert.equal(b.samples.length, 1);
  assert.equal(b.sample(2200).x, 30);
  assert.equal(decodePose(['bad']), null);
});

test('pose buffer rejects reordered packets and accepts wrapped sequence numbers', () => {
  const b = new PoseBuffer();
  assert.equal(b.push([...wire(1, 1), 65535], 1000), true);
  assert.equal(b.push([...wire(1, 0), 65534], 1010), false);
  assert.equal(b.push([...wire(1, 2), 0], 1020), true);
  assert.equal(b.samples.at(-1).p.x, 2);
});

test('host relays only a screen-owned pose; late join sees it without changing world seq', () => {
  let clock = 10000;
  const host = new WorldSync({ role: 'host', wallNow: () => clock });
  const table = new SlotTable(4);
  createPlayersDomain({ sync: host, table });
  table.claim('host', 'p1'); table.claim('s1', 'local');
  const sent = [];
  host.attachHost({ sendTo: (_id, msg) => sent.push(msg), broadcast: (msg) => sent.push(msg) });
  host.screenConnected('transport1', { clientId: 'first' });
  const bad = wire(0, 20), good = wire(1, 7);
  host.screenMessage('transport1', { type: 'poses', p: [bad, good] });
  assert.deepEqual(host._poses.get(1), good);
  assert.equal(host._poses.has(0), false);
  assert.equal(host.actors.get('s1:1')?.pos.x, 7);
  assert.equal(host.seq, 0);
  const snapshot = sent.find((m) => m.type === 'snapshot');
  assert.equal(snapshot.hostTime, 10000);
  host.screenConnected('transport2', { clientId: 'second' });
  assert.deepEqual(sent.filter((m) => m.type === 'snapshot').at(-1).poses, [good]);
  host.setHostAway(true);
  assert.equal(sent.at(-1).type, 'host-away');
  assert.equal(sent.at(-1).away, true);
});

test('clock ping estimates the host offset and ignores a stalled round trip', () => {
  let hostTime = 10000, replicaTime = 10020;
  const host = new WorldSync({ role: 'host', wallNow: () => hostTime });
  const replica = new WorldSync({ role: 'replica', wallNow: () => replicaTime });
  const toHost = [], toReplica = [];
  host.attachHost({ sendTo: (_id, m) => toReplica.push(m), broadcast: (m) => toReplica.push(m) });
  replica.attachReplica({ send: (m) => { toHost.push(m); return true; } });
  replica.linkUp(); host.screenConnected('t1', { clientId: 'c1' });
  replica.receive(toReplica.shift());
  assert.equal(replica.clockOffset, -20);
  replica.update(0);
  host.screenMessage('t1', toHost.shift());
  replica.receive(toReplica.shift());
  assert.equal(replica.clockOffset, -20);
  assert.equal(replica.hostNow(), hostTime);
  replica.update(0);
  hostTime += 1000; replicaTime += 1000;
  host.screenMessage('t1', { type: 'clock-ping', id: 9, sent: replicaTime - 1000 });
  replica.receive(toReplica.shift());
  assert.equal(replica.clockOffset, -20); // >500 ms RTT is discarded
});
