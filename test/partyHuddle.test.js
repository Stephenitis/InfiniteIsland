// Step 80b: Pinecone Huddle. Fair drop schedules, the shell meter and judging rules, ties, bot win rates per difficulty, and a host + replica pair through a whole game.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PARTY } from '../public/js/config.js';
import * as HU from '../public/js/game/party/huddleLogic.js';
import { validateGame } from '../public/js/game/party/registry.js';
import { KID, rate, play } from './fixtures/sim80b.mjs';
import { pair } from './fixtures/partyPair.js';

const H = PARTY.huddle, B = PARTY.bots, GAME = HU.GAME;
const roster = [0, 1, 2, 3].map((s) => ({ slot: s, bot: false, name: 'P' + s }));
const ctx = (t) => ({ t, slack: PARTY.slack, lag: H.lag });
const curl = (g, slot, on, t) => { const o = HU.request(g, slot, { on, t }, ctx(t)); if (o.rec) HU.apply(g, o.rec); return o; };

test('the game honours the contract; drop schedules are deterministic and FAIR across players (same count, same gaps, different order, jittered starts)', () => {
  assert.deepEqual(validateGame(GAME), []); assert.equal(GAME.hold, true);
  const a = HU.buildDrops(5, [0, 1, 2, 3]);
  assert.deepEqual(a, HU.buildDrops(5, [0, 1, 2, 3]));
  assert.notDeepEqual(a[0].map((d) => d.at), HU.buildDrops(6, [0, 1, 2, 3])[0].map((d) => d.at));
  for (let seed = 1; seed <= 25; seed++) {
    const d = HU.buildDrops(seed, [0, 1, 2, 3]), gaps = (s) => d[s].slice(1).map((x, i) => Math.round((x.at - d[s][i].at) * 100) / 100).sort((p, q) => p - q);
    for (const s of [0, 1, 2, 3]) {
      assert.equal(d[s].length, H.drops);
      for (let i = 1; i < d[s].length; i++) assert.ok(d[s][i].at - d[s][i - 1].at > H.warn + 0.5, 'one live drop at a time, with a breather');
      assert.ok(d[s][0].at >= H.first && d[s][0].at <= H.first + H.jitter + 1e-9);
      assert.ok(d[s].at(-1).at < H.cap - 2, 'the last drop lands well before the end');
      assert.ok(Math.abs(d[s].at(-1).at - d[0].at(-1).at) <= H.jitter + 0.02, 'the streams end together (within the jitter)');
      if (s) for (let k = 0; k < gaps(0).length; k++) assert.ok(Math.abs(gaps(s)[k] - gaps(0)[k]) <= 0.02, 'the same multiset of gaps');
    }
    assert.notDeepEqual(d[0].map((x) => x.at - d[0][0].at), d[1].map((x) => x.at - d[1][0].at), 'but not in step');
  }
});

test('shell rules: the shell protects from the press itself (a parry), a quick tap still protects for parry s, the meter drains while closed and never refills, a spent meter opens the shell', () => {
  const g = HU.init(7, roster), D = HU.buildDrops(7, g.slots), d = D[0][0];
  curl(g, 0, true, D[0][0].at - 0.6); curl(g, 1, true, D[1][0].at + 0.04);          // slot 1 presses just after its drop landed
  const t = Math.max(...g.slots.map((s) => D[s][0].at)) + H.lag + 0.02, recs = HU.step(g, ctx(t), 0.016, t);
  assert.deepEqual(recs.filter((r) => r.slot === 0).map((r) => r.k), ['safe']);
  assert.deepEqual(recs.filter((r) => r.slot === 1).map((r) => r.k), ['out'], 'late: the drop landed first');
  assert.deepEqual(recs.filter((r) => r.slot === 2).map((r) => r.k), ['out'], 'never curled');
  recs.forEach((r) => HU.apply(g, r));
  assert.equal(g.alive[1], false); assert.equal(g.sh[1].on, false, 'a dazed player is not curled any more');
  assert.equal(g.done, true, 'everybody else dazed: the last one standing ends it'); g.done = false; g.endAt = null;      // (carry on with the meter checks)
  // drain and no refill
  curl(g, 0, false, d.at + 0.5);
  const used = g.sh[0].used; assert.ok(Math.abs(used - 1.1) < 0.02, `used ${used}`);
  assert.ok(Math.abs(HU.leftOf(g.sh[0], d.at + 9) - (H.meter - used)) < 0.01, 'does not refill while open');
  curl(g, 0, true, d.at + 1); curl(g, 0, false, d.at + 1.4);
  assert.ok(Math.abs(g.sh[0].used - (used + 0.4)) < 0.02);
  // the meter runs dry while held: the step opens the shell exactly there
  curl(g, 0, true, d.at + 2);
  const dry = d.at + 2 + (H.meter - g.sh[0].used), r2 = HU.step(g, ctx(dry + 0.05), 0.016, dry + 0.05).find((r) => r.slot === 0 && r.k === 'curl');
  assert.deepEqual([r2.on, r2.why], [false, 'spent']); HU.apply(g, r2);
  assert.equal(HU.leftOf(g.sh[0], dry + 5), 0); assert.equal(curl(g, 0, true, dry + 1).ignore, true, 'nothing left to curl with');
});

test('parry: a press the instant before a drop blocks it, and so does a quick tap released before it lands; the tap costs a whole parry', () => {
  const g = HU.init(3, roster.slice(0, 2)), D = HU.buildDrops(3, g.slots), d = D[0][0], e = D[1][0];
  curl(g, 0, true, d.at - 0.02);                                                     // a press 20 ms before the hit
  curl(g, 1, true, e.at - 0.2); curl(g, 1, false, e.at - 0.15);                      // a 50 ms tap 0.2 s before the hit
  const t = Math.max(d.at, e.at) + H.lag + 0.02, recs = HU.step(g, ctx(t), 0.016, t);
  assert.equal(recs.find((r) => r.slot === 0).k, 'safe'); assert.equal(recs.find((r) => r.slot === 1).k, 'safe');
  assert.ok(Math.abs(g.sh[1].used - H.parry) < 0.02, 'a tap costs a whole parry');
});

test('judging: a release stamped before the landing opens it; a slack-clamped stale stamp; the hit is judged lag seconds late so a slightly late curl still counts', () => {
  const g = HU.init(8, roster.slice(0, 2)), D = HU.buildDrops(8, g.slots), d = D[0][0], e = D[1][0], first = Math.min(d.at, e.at);
  curl(g, 0, true, d.at - 0.5); curl(g, 0, false, d.at - 0.05);                      // let go just before the hit
  curl(g, 1, true, e.at - 0.5);                                                      // slot 1 holds
  assert.deepEqual(HU.step(g, ctx(first + 0.1), 0.016, first + 0.1), [], 'nothing is judged before the lag has passed');
  const t = Math.max(d.at, e.at) + H.lag + 0.02, recs = HU.step(g, ctx(t), 0.016, t);
  assert.equal(recs.find((r) => r.slot === 0).k, 'out'); assert.equal(recs.find((r) => r.slot === 1).k, 'safe');
  const g2 = HU.init(8, roster), now = 10, o = HU.request(g2, 0, { on: true, t: 1 }, ctx(now));
  assert.equal(o.rec.at, now - PARTY.slack, 'a stale remote stamp is clamped into the host recent past');
  assert.deepEqual(HU.request(g2, 0, { on: false }, ctx(now)), { ignore: true }, 'already open');
  assert.equal(HU.request(g2, 9, { on: true }, ctx(now)).reject, 'not-playing');
});

test('ties and ranks: survivors by shell left (the most first, within the tie window equal), then the dazed by who lasted longer; the last one standing ends the game', () => {
  const g = HU.init(11, roster), D = HU.buildDrops(11, g.slots);
  const t1 = D[2][0].at + H.lag + 0.02;
  curl(g, 0, true, 1); curl(g, 0, false, 1.5); curl(g, 1, true, 1); curl(g, 1, false, 1.6); curl(g, 3, true, 1); curl(g, 3, false, 4);   // meter left: 9.0, 8.9, -, 6.5
  g.endAt = 50; g.done = true;
  HU.apply(g, { k: 'out', slot: 2, d: 0, t: 20 });
  const p = HU.placing(g);
  assert.deepEqual(p.map((r) => [r.slot, r.place]), [[0, 1], [1, 1], [3, 3], [2, 4]], '9.0 and 8.9 tie (within 0.25), 6.5 third, dazed last');
  assert.deepEqual(p.map((r) => r.out), [false, false, false, true]);
  // everyone but one dazed: it ends at once
  const g2 = HU.init(11, roster.slice(0, 2)), d0 = HU.buildDrops(11, [0, 1]);
  curl(g2, 0, true, d0[0][0].at - 0.5);
  const t = Math.max(d0[0][0].at, d0[1][0].at) + H.lag + 0.02, recs = HU.step(g2, ctx(t), 0.016, t);
  assert.ok(recs.some((r) => r.k === 'end' && r.why === 'last')); recs.forEach((r) => HU.apply(g2, r));
  assert.deepEqual(HU.placing(g2).map((r) => [r.slot, r.place]), [[0, 1], [1, 2]]);
  assert.ok(t1 > 0);
});

test('bots: hard bots keep more shell and survive, easy bots waste meter; the average kid beats easy bots most of the time and hard bots beat the kid; deterministic', () => {
  const left = (sk) => { const p = play(HU, 31, [sk, B.hard, B.hard, B.hard]); return p.find((r) => r.slot === 0); };
  const hardP = play(HU, 31, [B.hard, B.hard, B.hard, B.hard]);
  assert.ok(hardP.every((r) => !r.out && r.score > 4), 'hard bots all survive with shell to spare: ' + JSON.stringify(hardP));
  assert.ok(left(B.easy).out || left(B.easy).score < hardP[0].score, 'easy wastes more');
  const easy = rate(HU, KID, [B.easy, B.easy, B.easy], 120), hard = rate(HU, KID, [B.hard, B.hard, B.hard], 120);
  assert.ok(easy > 0.55, `the kid beats easy bots ${easy}`); assert.ok(hard < 0.2, `hard bots beat the kid ${hard}`);
  assert.deepEqual(play(HU, 5, [B.easy, B.normal]), play(HU, 5, [B.easy, B.normal]));
});

test('a host + replica pair keep equal hashes through a whole game (holds sent from the replica are judged on the host)', () => {
  const w = pair();
  w.host.open({ games: ['huddle'], bots: 0 }); w.flush();
  w.host.debug.play('huddle'); w.flush();
  const held = { host: false, rep: false };
  w.run(120, 1 / 60, () => {
    const s = w.host.state;
    if (s.phase === 'play' && s.g && !s.g.done) {
      const gt = w.host.gameTime(), drops = HU.buildDrops(s.g.seed, s.g.slots);
      const want = (slot, early) => drops[slot].some((d) => gt >= d.at - early && gt <= d.at + 0.3);
      const wh = want(0, 0.45), wr = s.g.alive[w.rSlot] ? want(w.rSlot, 0.45) && !(w.rSlot === 2 && gt > 25) : false;
      if (wh !== held.host) { held.host = wh; w.host.act(w.host.hostActor(0), gt, { on: wh }); }
      if (wr !== held.rep) { held.rep = wr; w.replica.act(w.rActor(), w.replica.gameTime(), { on: wr }); }
    }
    return s.phase !== 'results';
  });
  w.flush();
  assert.equal(w.host.state.phase, 'results'); assert.equal(w.replica.state.phase, 'results');
  assert.equal(w.host.state.g.alive[0], true, 'the host player curled in time every time');
  assert.ok(w.host.state.g.sh[0].ints.length >= 3 && w.host.state.g.alive[w.rSlot] === false, 'the bot never curled and the replica stopped: the host player outlasts both');
  assert.equal(w.host.state.results.ranks.length, 3);
  w.equal('after the game');
  assert.deepEqual(w.replica.state.g, w.host.state.g);
});
