// Step 80a: Timber Trim's pure rules (game/party/timberLogic.js): the log sequence (the same for every lane), the berry-ring judging from the presser's stamp, the points, ties, deterministic replays,
// the bot's accuracy per difficulty and win rates against a scripted "average kid".
import test from 'node:test';
import assert from 'node:assert/strict';
import { PARTY } from '../public/js/config.js';
import { mulberry32 } from '../public/js/utils/rng.js';
import { validateGame } from '../public/js/game/party/registry.js';
import {
  GAME, buildLogs, logFrac, pointsFor, bitesFor, init, step, request, apply, placing, view, bot, totalOf, K_WOBBLE,
  MARK_FRAC, markFracOf, stripeOffset,
} from '../public/js/game/party/timberLogic.js';

const T = PARTY.timber;
const roster = (n = 4) => Array.from({ length: n }, (_, slot) => ({ slot }));

/** Play a whole game: `pressAt(g, slot, t, logs)` returns the stamp to press with (or null). */
function play(seed, n, pressAt, dt = 1 / 60) {
  const g = init(seed, roster(n)), logs = buildLogs(seed), recs = [];
  let t = 0;
  while (!g.done && t < 60) {
    t += dt;
    const ctx = { t, slack: PARTY.slack, lag: GAME.lag };
    for (const s of g.slots) {
      const stamp = pressAt(g, s, t, logs);
      if (stamp === null || stamp === undefined) continue;
      const r = request(g, s, { t: stamp }, ctx);
      if (r.rec) { apply(g, r.rec); recs.push(r.rec); }
    }
    for (const rec of step(g, ctx, dt, t)) { apply(g, rec); recs.push(rec); }
  }
  return { g, t, recs, logs };
}

test('the game honours the registry contract', () => {
  assert.deepEqual(validateGame(GAME), []);
  assert.equal(GAME.id, 'timber'); assert.equal(GAME.kind, 'lanes'); assert.deepEqual(GAME.press, ['interact']);
  assert.ok(GAME.duration > 15 && GAME.duration < T.cap);
});

test('the log sequence is deterministic per seed, the same for every lane, seven logs, later ones faster, no log of the same kind twice in a row, every stripe place used', () => {
  const a = buildLogs(5), b = buildLogs(5), c = buildLogs(6);
  assert.deepEqual(a, b); assert.notDeepEqual(a, c);
  assert.equal(a.length, T.logs);
  for (let i = 0; i < a.length; i++) {
    const L = a[i];
    assert.equal(L.i, i); assert.ok(T.kinds.includes(L.kind));
    assert.ok(L.pass > L.start && L.pass < L.start + L.dur, 'it passes the ring on its way');
    if (i) { assert.ok(L.dur < a[i - 1].dur, 'later logs are faster'); assert.ok(L.start >= a[i - 1].start + a[i - 1].dur, 'logs never overlap'); assert.notEqual(L.kind, a[i - 1].kind); }
    assert.ok(Math.abs(logFrac(L, L.pass) - markFracOf(L.stripe)) < 0.002, 'the pass time is when the stripe is at the line');
    const mid = T.chuteZ + (T.endZ - T.chuteZ) * logFrac(L, L.pass), stripeZ = mid + stripeOffset(L.stripe);
    assert.ok(Math.abs(stripeZ - T.markZ) < 0.04, `the log's stripe is on the cut line at the pass time (${stripeZ})`);
    if (i) assert.notEqual(L.stripe, a[i - 1].stripe, 'the stripe moves every wave');
  }
  assert.ok(a.some((L) => L.wob > 0) && a[0].wob === 0, 'some logs wobble, the first does not');
  assert.deepEqual([...new Set(a.slice(0, 5).map((L) => L.stripe))].sort(), T.stripes.map((s) => Math.round(s * 1000) / 1000).sort(), 'the first five waves use each stripe place once');
  assert.equal(MARK_FRAC, markFracOf(0.5), 'a middle stripe is judged with the middle on the line');
  // the wobble is monotone: a log never slides backwards
  for (const L of a) { let prev = -1; for (let t = L.start; t <= L.start + L.dur; t += 0.01) { const f = logFrac(L, t); assert.ok(f >= prev - 1e-9); prev = f; } assert.ok(K_WOBBLE >= 1); }
  // every lane gets the same logs: the view lists one sequence, whichever slot reads it
  const g = init(5, roster(4)), v = view(g, 3);
  assert.deepEqual(v.logs, a);
});

test('points: dead on is 100 ("Bramble\'s Bite!"), they fall smoothly to 0 at the window\'s edge, early and late are the same', () => {
  assert.equal(pointsFor(0), 100); assert.equal(pointsFor(T.perfect), 100); assert.equal(pointsFor(-T.perfect), 100);
  assert.ok(pointsFor(T.perfect + 0.001) < 100 && pointsFor(T.perfect + 0.001) > 90);
  assert.equal(pointsFor(T.win), 0); assert.equal(pointsFor(T.win + 1), 0);
  let prev = 101;
  for (let d = 0; d <= T.win; d += 0.01) { const p = pointsFor(d); assert.ok(p <= prev); prev = p; assert.equal(pointsFor(-d), p); }
  assert.equal(bitesFor(100), 5); assert.equal(bitesFor(0), 0); assert.ok(bitesFor(99) <= 4 && bitesFor(50) >= 2);
  assert.ok(T.perfect < 0.06 && T.win > 0.3, 'a real window, a tight bullseye');
});

test('requests: a chop is judged from the PRESSER\'s stamp against the log on its way; between logs, repeats and unknown slots do nothing useful', () => {
  const g = init(8, roster(2)), L = buildLogs(8), ctx = (t) => ({ t, slack: PARTY.slack });
  const L0 = L[0];
  const r = request(g, 0, { t: L0.pass }, ctx(L0.pass));
  assert.deepEqual(r.rec, { k: 'cut', slot: 0, i: 0, d: 0, pts: 100 });
  apply(g, r.rec);
  assert.deepEqual(request(g, 0, { t: L0.pass + 0.01 }, ctx(L0.pass + 0.01)), { ignore: true }, 'one chop per log');
  const early = request(g, 1, { t: L0.pass - 0.3 }, ctx(L0.pass - 0.3)).rec;
  assert.equal(early.i, 0); assert.equal(early.d, -300); assert.equal(early.pts, pointsFor(-0.3));
  assert.deepEqual(request(g, 1, { t: 0.2 }, ctx(0.2)), { ignore: true }, 'before any log is near');
  assert.deepEqual(request(g, 1, { t: L0.pass + T.win + 0.1 }, ctx(L0.pass + T.win + 0.1)), { ignore: true }, 'between logs');
  assert.equal(request(g, 3, { t: L0.pass }, ctx(L0.pass)).reject, 'not-playing');
  // latency: a stamp older than the slack is clamped to now - slack, one from the future to now
  const now = L0.pass + 0.4;
  assert.equal(request(init(8, roster(2)), 0, { t: now - 2 }, ctx(now)).rec.d, Math.round((now - PARTY.slack - L0.pass) * 1000), 'a stale stamp is clamped');
  assert.equal(request(init(8, roster(2)), 0, { t: now + 5 }, ctx(now)).rec.d, Math.round((now - L0.pass) * 1000), 'a future stamp is the host\'s now');
  assert.equal(request(init(8, roster(2)), 0, { t: L0.pass - 0.1 }, ctx(L0.pass + 0.05)).rec.d, -100, 'a stamp inside the slack is trusted');
});

test('a log that was never chopped is a whiff for that lane only, after its window and the lag; the game ends when every lane settled every log', () => {
  const g = init(9, roster(2)), L = buildLogs(9);
  apply(g, { k: 'cut', slot: 0, i: 0, d: 20, pts: 90 });
  assert.deepEqual(step(g, { t: L[0].pass + T.win + 0.1, lag: GAME.lag }, 0.1, L[0].pass + T.win + 0.1), [], 'still inside the lag');
  const recs = step(g, { t: L[0].pass + T.win + GAME.lag + 0.05, lag: GAME.lag }, 0.1, L[0].pass + T.win + GAME.lag + 0.05);
  assert.deepEqual(recs, [{ k: 'whiff', slot: 1, i: 0 }]);
  const none = play(10, 3, () => null);
  assert.ok(none.g.done); for (const s of none.g.slots) { assert.equal(none.g.cuts[s].length, T.logs); assert.equal(totalOf(none.g, s), 0); }
  assert.ok(none.t < GAME.duration + 1, 'a game with nobody pressing still ends by itself');
  assert.deepEqual(placing(none.g).map((r) => r.place), [1, 1, 1], 'everybody missed everything: a three-way tie');
});

test('totals decide: highest wins, equal totals share a place; perfect play scores 500', () => {
  const g = init(3, roster(3));
  for (const [slot, pts] of [[0, [100, 100, 100, 100, 100]], [1, [100, 90, 80, 70, 60]], [2, [100, 100, 100, 100, 100]]]) pts.forEach((p, i) => apply(g, { k: 'cut', slot, i, d: 0, pts: p }));
  assert.deepEqual(Object.fromEntries(placing(g).map((r) => [r.slot, r.place])), { 0: 1, 2: 1, 1: 3 });
  assert.equal(totalOf(g, 0), 500); assert.equal(view(g, 1).totals[1], 400);
});

/** a bot (or the scripted kid) pressing from the public view; returns the stamp to press with */
const KID = { react: 0.4, noise: 0.14, miss: 0.1 };
function playBots(seed, diff, kidSlot = -1, n = 4) {
  const skills = Array.from({ length: n }, (_, s) => (s === kidSlot ? KID : PARTY.bots[diff]));
  const mem = skills.map(() => ({})), rngs = skills.map((_, s) => mulberry32((seed * 7919 + s * 101) >>> 0));
  return play(seed, n, (g, s, t) => (bot(view(g, t), { slot: s, mem: mem[s] }, skills[s], rngs[s]).interact ? t : null));
}

test('deterministic replays and replica replay from the records only; JSON round trip', () => {
  const a = playBots(41, 'normal'), b = playBots(41, 'normal');
  assert.deepEqual(a.g, b.g); assert.deepEqual(a.recs, b.recs);
  const replica = init(41, roster(4));
  for (const r of a.recs) apply(replica, r);
  assert.deepEqual(replica, a.g);
  assert.deepEqual(JSON.parse(JSON.stringify(a.g)), a.g);
  assert.notDeepEqual(playBots(42, 'normal').recs, a.recs);
});

test('bots: harder bots chop closer to the ring (mean total and mean distance); a bot never presses before its log has come out of the chute', () => {
  const stats = (diff) => { let pts = 0, abs = 0, n = 0; for (let s = 1; s <= 30; s++) { const { g } = playBots(s, diff); for (const slot of g.slots) for (const c of g.cuts[slot]) { pts += c.pts; if (c.d !== null) { abs += Math.abs(c.d); n++; } } } return { pts: pts / (30 * 4 * T.logs), abs: abs / Math.max(1, n) }; };
  const e = stats('easy'), nn = stats('normal'), h = stats('hard');
  assert.ok(e.pts < nn.pts && nn.pts < h.pts, `mean points ${e.pts.toFixed(1)} < ${nn.pts.toFixed(1)} < ${h.pts.toFixed(1)}`);
  assert.ok(e.abs > nn.abs && nn.abs > h.abs, 'and mean distance to the ring shrinks');
  assert.ok(h.pts > 85 && e.pts < 70);
  const g = init(5, roster(1)), mem = {}, L = buildLogs(5);
  assert.equal(bot(view(g, L[0].start - 0.5), { slot: 0, mem }, PARTY.bots.hard, mulberry32(1)).interact, false);
});

test('win rates over seeded runs: the scripted average kid beats easy bots most of the time and loses to hard ones', () => {
  const rate = (diff) => { let wins = 0; const N = 60; for (let s = 1; s <= N; s++) { const { g } = playBots(s, diff, 0, 4); if (placing(g).find((r) => r.slot === 0).place === 1) wins++; } return wins / N; };
  const easy = rate('easy'), normal = rate('normal'), hard = rate('hard');
  assert.ok(easy > 0.5, `the kid wins ${Math.round(easy * 100)}% against easy bots`);
  assert.ok(hard < 0.25, `the kid wins ${Math.round(hard * 100)}% against hard bots`);
  assert.ok(easy > normal && normal >= hard, `kid win rates ${easy} > ${normal} >= ${hard}`);
});

test('fairness: with the same presses in every lane every lane scores the same (the log sequence does not favour a seat)', () => {
  const same = play(77, 4, (g, s, t, logs) => { const L = logs.find((l) => Math.abs(t - (l.pass + 0.07)) < 1 / 120 + 1e-9); return L ? t : null; });
  const totals = same.g.slots.map((s) => totalOf(same.g, s));
  assert.ok(totals.every((x) => x === totals[0]) && totals[0] > 300, `identical presses score identically: ${totals}`);
});
