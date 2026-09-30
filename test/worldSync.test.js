import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSync, actorKey, stableStringify } from '../public/js/net/worldSync.js';

// In-memory transport between one host and any number of replicas. Messages are queued (JSON round-tripped, like a real
// data channel) and delivered by flush(); `drop` lets a test lose messages.
class Net {
  constructor(host) {
    this.host = host;
    this.queue = [];
    this.replicas = new Map();       // tid -> replica WorldSync
    this.drop = null;                // (toTid, msg) => bool
    this.sent = 0;
    this.nextTid = 1;
    host.attachHost({
      sendTo: (tid, msg) => this._push(tid, msg),
      broadcast: (msg) => { for (const tid of this.replicas.keys()) this._push(tid, msg); },
    });
  }
  _push(tid, msg) {
    this.sent++;
    if (this.drop && this.drop(tid, msg)) return;
    this.queue.push({ tid, msg: JSON.parse(JSON.stringify(msg)) });
  }
  connect(replica, clientId) {
    const tid = this.nextTid++;
    this.replicas.set(tid, replica);
    replica.attachReplica({ send: (m) => { if (!this.replicas.has(tid)) return false; this.queue.push({ from: tid, msg: JSON.parse(JSON.stringify(m)) }); return true; } });
    replica.linkUp();
    this.host.screenConnected(tid, { clientId });
    this.flush();
    return tid;
  }
  disconnect(tid) {
    const r = this.replicas.get(tid);
    this.replicas.delete(tid);
    this.host.screenDisconnected(tid);
    if (r) r.linkDown();
  }
  flush() {
    let guard = 0;
    while (this.queue.length && guard++ < 10000) {
      const q = this.queue.shift();
      if (q.from !== undefined) this.host.screenMessage(q.from, q.msg);
      else this.replicas.get(q.tid)?.receive(q.msg);
    }
  }
}

// A tiny domain: a counter plus an append-only log. `inc` requests are rejected above 5 or when `nope`.
function makeCounter(sync) {
  const state = { n: 0, log: [] };
  sync.register('counter', {
    snapshot: () => ({ n: state.n, log: [...state.log] }),
    applySnapshot: (s) => { state.n = s.n; state.log = [...s.log]; },
    applyEvent: (kind, d) => { if (kind === 'set') { state.n = d.n; state.log.push(d.by); } },
    handleRequest: (kind, d, actor) => {
      if (kind !== 'inc') return { reject: 'unknown' };
      if (d.by > 5) return { reject: 'too-big' };
      state.n += d.by;
      state.log.push(actor ? actorKey(actor) : 'sys');
      sync.emit('counter', 'set', { n: state.n, by: actor ? actorKey(actor) : 'sys' });
      return { result: state.n };
    },
    screenLeft: (id) => { state.log.push('left:' + id); },
  });
  return state;
}

function world(nReplicas = 2) {
  const host = new WorldSync({ role: 'host', graceSeconds: 2 });
  const hostState = makeCounter(host);
  const net = new Net(host);
  const reps = [];
  for (let i = 0; i < nReplicas; i++) {
    const r = new WorldSync({ role: 'replica' });
    const st = makeCounter(r);
    const tid = net.connect(r, 'client' + i);
    reps.push({ sync: r, state: st, tid });
  }
  return { host, hostState, net, reps };
}
const actor = (screen, index = 0) => ({ screen, index, pos: { x: 1, y: 0, z: 2 } });

test('host request path is synchronous and emit is a no-op without replicas', () => {
  const host = new WorldSync({ role: 'host' });
  const st = makeCounter(host);
  let broadcasts = 0;
  host.attachHost({ sendTo() {}, broadcast() { broadcasts++; } });
  const r = host.request('counter', 'inc', { by: 2 }, actor('host'));
  assert.deepEqual(r, { ok: true, result: 2 });     // a plain value, not a Promise
  assert.equal(st.n, 2);
  assert.equal(broadcasts, 0);
  assert.equal(host.seq, 0);
  assert.equal(host.hasReplicas, false);
  assert.deepEqual(host.request('counter', 'inc', { by: 9 }, actor('host')), { ok: false, reason: 'too-big' });
  assert.deepEqual(host.request('nope', 'x'), { ok: false, reason: 'unknown-domain' });
});

test('a joining replica gets a snapshot with its screen id and matches the host', () => {
  const host = new WorldSync({ role: 'host' });
  const hs = makeCounter(host);
  host.request('counter', 'inc', { by: 3 }, actor('host'));       // state that exists BEFORE anybody joins
  const net = new Net(host);
  const r = new WorldSync({ role: 'replica' });
  const rs = makeCounter(r);
  assert.equal(r.status, 'offline');
  net.connect(r, 'abc');
  assert.equal(r.status, 'synced');
  assert.equal(r.screenId, 's1');
  assert.equal(rs.n, 3);
  assert.equal(r.hash(), host.hash());
  assert.equal(hs.n, 3);
  assert.deepEqual(host.connectedScreens, ['s1']);
});

test('events apply in order on every replica; requests from both replicas converge', async () => {
  const w = world(2);
  const [a, b] = w.reps;
  const pa = a.sync.request('counter', 'inc', { by: 1 }, actor(a.sync.screenId));
  const pb = b.sync.request('counter', 'inc', { by: 2 }, actor(b.sync.screenId));
  assert.ok(pa instanceof Promise && pb instanceof Promise);
  const hostR = w.host.request('counter', 'inc', { by: 3 }, actor('host'));
  assert.equal(hostR.ok, true);
  w.net.flush();
  assert.equal((await pa).ok, true);
  assert.equal((await pb).ok, true);
  assert.equal(w.hostState.n, 6);
  assert.equal(a.state.n, 6);
  assert.equal(b.state.n, 6);
  assert.deepEqual(a.state.log, w.hostState.log);
  assert.deepEqual(b.state.log, w.hostState.log);
  assert.equal(a.sync.hash(), w.host.hash());
  assert.equal(b.sync.hash(), w.host.hash());
  assert.equal(a.sync.seq, w.host.seq);
  // the host stamps the requester's real screen id and remembers its last position
  assert.ok(w.host.actors.has('s1:0'));
  assert.ok(w.host.actors.has('s2:0'));
});

test('a rejected request changes nothing and only the requester hears about it', async () => {
  const w = world(2);
  const [a, b] = w.reps;
  const seqBefore = w.host.seq;
  const p = a.sync.request('counter', 'inc', { by: 99 }, actor(a.sync.screenId));
  w.net.flush();
  assert.deepEqual(await p, { ok: false, reason: 'too-big' });
  assert.equal(w.host.seq, seqBefore);
  assert.equal(w.hostState.n, 0);
  assert.equal(b.state.n, 0);
  assert.equal(a.sync.hash(), w.host.hash());
});

test('a spoofed screen id in an actor is overwritten by the host', async () => {
  const w = world(1);
  const [a] = w.reps;
  const p = a.sync.request('counter', 'inc', { by: 1 }, { screen: 'host', index: 0, pos: { x: 0, y: 0, z: 0 } });
  w.net.flush();
  await p;
  assert.deepEqual(w.hostState.log, ['s1:0']);
});

test('a lost event is detected as a gap and healed with a fresh snapshot; stale events are ignored', async () => {
  const w = world(2);
  const [a, b] = w.reps;
  let dropOne = true;
  w.net.drop = (tid, msg) => { if (dropOne && tid === a.tid && msg.type === 'event') { dropOne = false; return true; } return false; };
  w.host.request('counter', 'inc', { by: 1 }, actor('host'));      // lost for replica A
  w.host.request('counter', 'inc', { by: 2 }, actor('host'));      // A sees seq+2 -> gap -> resync
  w.net.flush();
  assert.equal(a.sync.stats.gaps, 1);
  assert.equal(w.host.stats.resyncs, 1);
  assert.equal(a.state.n, 3);
  assert.equal(a.sync.hash(), w.host.hash());
  assert.equal(b.sync.hash(), w.host.hash());
  // an old event arriving late does nothing
  const n = a.state.n;
  a.sync.receive({ type: 'event', seq: 1, domain: 'counter', kind: 'set', data: { n: 100, by: 'x' } });
  assert.equal(a.state.n, n);
  assert.equal(a.sync.stats.stale, 1);
  // and life goes on after the resync
  w.host.request('counter', 'inc', { by: 1 }, actor('host'));
  w.net.flush();
  assert.equal(a.sync.hash(), w.host.hash());
});

test('events that arrive while waiting for a resync snapshot are not applied out of order', () => {
  const w = world(1);
  const [a] = w.reps;
  a.sync.receive({ type: 'event', seq: a.sync.seq + 5, domain: 'counter', kind: 'set', data: { n: 50, by: 'x' } });   // gap
  a.sync.receive({ type: 'event', seq: a.sync.seq + 1, domain: 'counter', kind: 'set', data: { n: 60, by: 'x' } });  // must wait for the snapshot
  assert.equal(a.state.n, 0);
  w.net.flush();                                                   // the resync request is answered
  assert.equal(a.sync.hash(), w.host.hash());
});

test('screen leave: grace period, then screenLeft; a same-client rejoin inside the grace keeps its screen id', () => {
  const w = world(1);
  const [a] = w.reps;
  assert.equal(a.sync.screenId, 's1');
  w.host.request('counter', 'inc', { by: 1 }, actor('s1'));
  w.net.disconnect(a.tid);
  assert.deepEqual(w.host.connectedScreens, []);
  assert.equal(w.host.hasReplicas, false);
  w.host.update(1);
  assert.ok(!w.hostState.log.some((l) => l.startsWith('left:')));
  const r2 = new WorldSync({ role: 'replica' });
  makeCounter(r2);
  w.net.connect(r2, 'client0');                                    // same clientId
  assert.equal(r2.screenId, 's1');
  w.host.update(5);                                                // the old grace timer must be gone
  assert.ok(!w.hostState.log.some((l) => l.startsWith('left:')));
  // a different client leaving for good
  const r3 = new WorldSync({ role: 'replica' });
  makeCounter(r3);
  const tid3 = w.net.connect(r3, 'other');
  assert.equal(r3.screenId, 's2');
  r3.request('counter', 'inc', { by: 1 }, actor('s2'));
  w.net.flush();
  assert.ok(w.host.actors.has('s2:0'));
  w.net.disconnect(tid3);
  w.host.update(1.5);
  assert.ok(!w.hostState.log.includes('left:s2'));
  w.host.update(1);
  assert.ok(w.hostState.log.includes('left:s2'));
  assert.ok(!w.host.actors.has('s2:0'));
});

test('requests made while offline or when the link drops are rejected', async () => {
  const w = world(1);
  const [a] = w.reps;
  const pending = a.sync.request('counter', 'inc', { by: 1 }, actor('s1'));   // not flushed yet
  w.net.disconnect(a.tid);
  assert.deepEqual(await pending, { ok: false, reason: 'offline' });
  assert.deepEqual(await a.sync.request('counter', 'inc', { by: 1 }, actor('s1')), { ok: false, reason: 'offline' });
});

test('stableStringify ignores key order; hash changes with state', () => {
  assert.equal(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }] }), stableStringify({ a: [2, { c: 2, d: 1 }], b: 1 }));
  const host = new WorldSync();
  makeCounter(host);
  const h0 = host.hash();
  host.request('counter', 'inc', { by: 1 }, null);
  assert.notEqual(host.hash(), h0);
});

test('request timeouts count injected WALL-CLOCK time, not simulation dt; a late ack after a timeout is ignored', async () => {
  let t = 0;
  const host = new WorldSync({ role: 'host' });
  const hs = makeCounter(host);
  const net = new Net(host);
  const r = new WorldSync({ role: 'replica', now: () => t, timeoutMs: 8000 });
  const rs = makeCounter(r);
  net.connect(r, 'c');
  net.queue.length = 0;

  // a huge simulation step with no wall-clock time passing never times a request out
  const p1 = r.request('counter', 'inc', { by: 1 }, actor('s1'));
  r.update(600);
  t = 7999; r.update(0.016);
  assert.equal(r._pending.size, 1);
  net.flush();
  assert.deepEqual(await p1, { ok: true, result: 1 });

  // no answer for > 8 s of wall clock: timeout; the host answers late: nothing breaks, nothing is applied twice
  const p2 = r.request('counter', 'inc', { by: 2 }, actor('s1'));
  const heldMsgs = net.queue.splice(0);                      // the request is "stuck on the network"
  t += 8001; r.update(0.016);
  assert.deepEqual(await p2, { ok: false, reason: 'timeout' });
  for (const m of heldMsgs) net.queue.push(m);               // it arrives late: the host applies it once, the ack + event come back
  net.flush();
  assert.equal(hs.n, 3);
  assert.equal(rs.n, 3, 'the event still updated the replica exactly once');
  assert.equal(r._pending.size, 0);
  assert.equal(r.stats.stale, 0);
});
