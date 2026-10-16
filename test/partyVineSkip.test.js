// Step 80a: Vine Skip's pure rules (game/party/vineskipLogic.js): the vine's schedule, contact judged from the jump TIME WINDOW (never from y), ties, the cap, deterministic replays, the bot's win rates per difficulty
// against a scripted "average kid", and the same rules replayed from records only (what a replica does).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PARTY } from '../public/js/config.js';
import { mulberry32 } from '../public/js/utils/rng.js';
import { stageSpawns, stageCentre } from '../public/js/game/party/partyArea.js';
import { validateGame } from '../public/js/game/party/registry.js';
import {
  GAME, buildSchedule, ropeAngle, ropeSpeed, wrapHalf, polar, nextPass, touching, airborne, init, step, request, apply, placing, view, bot, HIT_FROM, TIE,
} from '../public/js/game/party/vineskipLogic.js';

const V = PARTY.vineskip;
const roster = (n = 4) => Array.from({ length: n }, (_, slot) => ({ slot }));
const spawns = stageSpawns('vineskip', 4);
const at = (slot) => ({ x: spawns[slot].x, z: spawns[slot].z });

/** Drive one game to its end. `pressFor(g, slot, t)` decides presses; positions are the stage spawns (nobody walks). Returns { g, t, recs }. */
function play(seed, n, pressFor, dt = 1 / 30, maxT = 80) {
  const g = init(seed, roster(n)), recs = [];
  let t = 0;
  while (!g.done && t < maxT) {
    t += dt;
    const ctx = { t, pos: (s) => at(s), slack: PARTY.slack, lag: GAME.lag };
    for (const s of g.slots) {
      if (!g.alive[s] || !pressFor(g, s, t)) continue;
      const r = request(g, s, { t }, ctx);
      if (r.rec) { apply(g, r.rec); recs.push(r.rec); }
    }
    for (const rec of step(g, ctx, dt, t)) { apply(g, rec); recs.push(rec); }
  }
  return { g, t, recs };
}

test('the game honours the registry contract and the stage geometry matches the config', () => {
  assert.deepEqual(validateGame(GAME), []);
  assert.equal(GAME.id, 'vineskip'); assert.equal(GAME.kind, 'elim'); assert.deepEqual(GAME.press.sort(), ['cancel', 'interact', 'jump']);
  const c = stageCentre('vineskip');
  assert.ok(c.x > PARTY.origin.x && c.z === PARTY.origin.z);
  for (const s of spawns) { const { r } = polar(s.x, s.z); assert.ok(r > V.rMin && r < V.rMax, 'players start on the terrace'); }
});

test('the vine schedule is deterministic per seed: a slow warm-up, faster steps, telegraphed surprises from 30 s, an angle that never jumps', () => {
  const a = buildSchedule(11), b = buildSchedule(11), c = buildSchedule(12);
  assert.deepEqual(a, b); assert.notDeepEqual(a.surprises, c.surprises);
  assert.equal(a.surprises.length, V.surprises.length);
  for (const s of a.surprises) { assert.ok(s.at >= 28 && s.at <= 54); assert.ok(['pause', 'reverse'].includes(s.kind)); assert.ok(Math.abs(s.at - s.warnAt - V.warn) < 0.02, 'the telegraph comes warn seconds ahead'); }
  // speeds: the warm-up, then V.speeds[level] every V.step seconds (before the first surprise)
  assert.equal(ropeSpeed(a, 1), 0.9);
  for (const t of [5, 15, 25]) assert.equal(ropeSpeed(a, t), V.speeds[Math.floor(t / V.step)]);
  assert.ok(Math.abs(wrapHalf(ropeAngle(a, HIT_FROM))) < 0.11, 'contact starts with the vine away from every spawn spot');
  let prev = ropeAngle(a, 0);
  for (let t = 0.02; t < 70; t += 0.02) { const x = ropeAngle(a, t); assert.ok(Math.abs(x - prev) < 0.2, `no jump in the angle at ${t.toFixed(2)}`); prev = x; }
  assert.equal(wrapHalf(Math.PI), 0); assert.ok(Math.abs(wrapHalf(1.6 * Math.PI) - -0.4 * Math.PI) < 1e-9);
  // a pause really stops the vine, a reverse really turns it round
  const seedOf = (kind) => { for (let s = 1; s < 40; s++) { const f = buildSchedule(s).surprises.find((x) => x.kind === kind); if (f) return [s, f]; } return null; };
  const [sp, p1] = seedOf('pause'), [sr, r1] = seedOf('reverse');
  assert.equal(ropeSpeed(buildSchedule(sp), p1.at + 0.3), 0); assert.ok(ropeSpeed(buildSchedule(sp), p1.at + V.pause + 0.2) > 0);
  assert.ok(ropeSpeed(buildSchedule(sr), r1.at - 0.5) > 0 && ropeSpeed(buildSchedule(sr), r1.at + 0.5) < 0);
});

test('airborne comes from the jump TIME WINDOW, not from a height: [at + airFrom, at + airTo]', () => {
  const g = init(5, roster(2));
  assert.equal(airborne(g, 0, 1), false);
  apply(g, { k: 'jump', slot: 0, at: 3 });
  assert.equal(airborne(g, 0, 3 + V.airFrom - 0.001), false); assert.equal(airborne(g, 0, 3 + V.airFrom), true);
  assert.equal(airborne(g, 0, 3 + V.airTo), true); assert.equal(airborne(g, 0, 3 + V.airTo + 0.001), false);
  assert.equal(airborne(g, 1, 3.2), false, 'only the jumper is up');
  assert.ok(V.airTo < V.cool, 'the window ends before a second jump may start');
});

test('the vine touches a grounded player at its pass and never an airborne one; a jump too early or too late is no help', () => {
  const seed = 7, sched = buildSchedule(seed), { r, phi } = polar(at(0).x, at(0).z);
  // standing still: out when the vine reaches the player's feet (a little before its centre line passes)
  const T0 = nextPass(sched, phi, HIT_FROM + 0.05, 8);
  assert.ok(T0 !== null && T0 > HIT_FROM);
  assert.equal(touching(sched, r, phi, T0), true); assert.equal(touching(sched, r, phi, T0 + 0.5), false);
  const none = play(seed, 2, () => false, 1 / 60, T0 + 1.2).g;
  assert.equal(none.alive[0], false, 'standing still is touched');
  assert.ok(none.outAt[0] <= T0 && T0 - none.outAt[0] < 0.15, `out when the vine reaches it (${none.outAt[0]} vs the centre pass ${T0})`);
  // a pass at full running speed: survive exactly when the whole contact interval [T - w, T + w] lies inside the jump window [j + airFrom, j + airTo]
  const T = nextPass(sched, phi, 12, 20), w = V.reach / (Math.abs(ropeSpeed(sched, T)) * r);
  assert.ok(w > 0.03 && w < 0.12);
  const survives = (j) => {
    const g = init(seed, roster(1));                                           // (solo: the game does not end when somebody else falls)
    if (j !== null) apply(g, { k: 'jump', slot: 0, at: j });
    for (let t = T - 0.7; t <= T + 1.1; t += 1 / 60) for (const rec of step(g, { t, pos: () => at(0), lag: GAME.lag }, 1 / 60, t)) apply(g, rec);
    return g.alive[0];
  };
  assert.equal(survives(null), false);
  const lo = T + w - V.airTo, hi = T - w - V.airFrom;                         // the jump times that work: [lo, hi]
  assert.ok(hi > lo + 0.1, 'there is a real window to hit');
  assert.equal(survives((lo + hi) / 2), true, 'a jump centred on the pass clears it');
  assert.equal(survives(lo + 0.02), true); assert.equal(survives(hi - 0.02), true);
  assert.equal(survives(lo - 0.03), false, 'too early: landed while the vine is still on its way');
  assert.equal(survives(hi + 0.03), false, 'too late: still on the ground when the vine arrives');
});

test('nobody is touched during the warm-up or on the rim, and the vine judges players with the host lag', () => {
  const g = init(3, roster(2));
  const rim = { x: stageCentre('vineskip').x + V.rim, z: stageCentre('vineskip').z };
  // a player standing exactly where the vine is at HIT_FROM - 0.3 is safe (warm-up); on the rim nothing ever happens
  const sched = buildSchedule(3);
  const ang = ropeAngle(sched, 0.5), c = stageCentre('vineskip');
  const under = { x: c.x + Math.cos(ang) * 4, z: c.z + Math.sin(ang) * 4 };
  const recs = step(g, { t: 0.7, pos: () => under, lag: 0.2 }, 0.5, 0.7);
  assert.deepEqual(recs.filter((r) => r.k === 'out'), [], 'no contact before HIT_FROM');
  const recs2 = step(g, { t: 20, pos: () => rim, lag: 0.2 }, 20, 20);
  assert.deepEqual(recs2.filter((r) => r.k === 'out'), [], 'the rim is a safe place to cheer from');
  const { recs: all } = play(7, 2, () => false, 1 / 30, 15);
  const outs = all.filter((r) => r.k === 'out');
  assert.ok(outs.length >= 1 && outs[0].t >= HIT_FROM);
});

test('requests: stamps are clamped into the host\'s recent past, a second jump waits for the cool-down, nothing works once out', () => {
  const g = init(4, roster(3)), ctx = { t: 10, slack: PARTY.slack };
  assert.deepEqual(request(g, 0, { t: 10 }, ctx).rec, { k: 'jump', slot: 0, at: 10 });
  assert.equal(request(g, 1, { t: 5 }, ctx).rec.at, 10 - PARTY.slack, 'a stale stamp is clamped to the slack');
  assert.equal(request(g, 2, { t: 99 }, ctx).rec.at, 10, 'a stamp from the future is the host\'s now');
  assert.equal(request(g, 2, {}, ctx).rec.at, 10, 'no stamp at all');
  apply(g, { k: 'jump', slot: 0, at: 10 });
  assert.equal(request(g, 0, { t: 10.3 }, { t: 10.3, slack: PARTY.slack }).reject, 'cool');
  assert.ok(request(g, 0, { t: 10 + V.cool }, { t: 10 + V.cool, slack: PARTY.slack }).rec);
  apply(g, { k: 'out', slot: 1, t: 11 });
  assert.equal(request(g, 1, { t: 11 }, { t: 11 }).reject, 'out');
  apply(g, { k: 'end', t: 12 });
  assert.deepEqual(request(g, 0, { t: 12 }, { t: 12 }), { ignore: true });
});

test('last one standing wins, near-simultaneous outs tie, everybody still up at the cap wins together, a solo game ends when the player falls', () => {
  // the end rule
  let g = init(9, roster(3));
  apply(g, { k: 'out', slot: 0, t: 5 }); apply(g, { k: 'out', slot: 1, t: 8 }); apply(g, { k: 'end', t: 8 });
  assert.deepEqual(placing(g).map((r) => [r.slot, r.place]), [[2, 1], [1, 2], [0, 3]]);
  g = init(9, roster(3));
  apply(g, { k: 'out', slot: 0, t: 8 }); apply(g, { k: 'out', slot: 1, t: 8 + TIE * 0.9 }); apply(g, { k: 'out', slot: 2, t: 8.5 });
  assert.deepEqual(Object.fromEntries(placing(g).map((r) => [r.slot, r.place])), { 0: 2, 1: 2, 2: 1 }, 'two that fell together share second place');
  g = init(9, roster(4));
  apply(g, { k: 'out', slot: 3, t: 20 }); apply(g, { k: 'end', t: V.cap });
  assert.deepEqual(placing(g).map((r) => r.place), [1, 1, 1, 4], 'everybody who lasted wins');
  // and in play: nobody presses -> everybody is out; the last ones (outs together) tie for the win
  const res = play(21, 4, () => false);
  assert.ok(res.g.done); const ranks = placing(res.g); assert.equal(ranks[0].place, 1); assert.ok(ranks.some((r) => r.out));
  // the game ends the moment one is left
  const lone = play(22, 4, (g2, s, t) => s === 2 && g2.jumps[2] === undefined && t > 0.1 || false);
  assert.ok(lone.g.done);
  // solo: ends when the only player is touched
  const solo = play(23, 1, () => false);
  assert.ok(solo.g.done && solo.g.alive[0] === false && solo.t < 20);
  // cap: a solo hard bot survives to the cap and wins
  const cap = playBots(1, 'hard', 0, 3);
  assert.ok(cap.g.done);
});

/** Bots (or a scripted kid: `skills[slot]`) playing a whole game from the public view only. */
function playBots(seed, diff, kidSlot = -1, n = 4, kid = KID) {
  const skills = Array.from({ length: n }, (_, s) => (s === kidSlot ? kid : PARTY.bots[diff]));
  const mem = skills.map(() => ({})), rngs = skills.map((_, s) => mulberry32((seed * 8191 + s * 131) >>> 0));
  return play(seed, n, (g, s, t) => bot(view(g, t), { slot: s, ...at(s), mem: mem[s] }, skills[s], rngs[s]).jump);
}
/** the scripted "average kid": decent timing, sometimes misses a pass, a slowish eye. */
const KID = { react: 0.42, noise: 0.12, miss: 0.1 };

test('records alone rebuild the same state (what a replica applies), and replays are deterministic from the seed', () => {
  const a = playBots(31, 'normal'), b = playBots(31, 'normal');
  assert.deepEqual(a.g, b.g); assert.deepEqual(a.recs, b.recs);
  const replica = init(31, roster(4));
  for (const r of a.recs) apply(replica, r);
  assert.deepEqual(replica, a.g, 'a replica that only applies the host\'s records holds the same state');
  assert.notDeepEqual(playBots(32, 'normal').recs, a.recs);
  // JSON round trip (the snapshot a late joiner gets)
  assert.deepEqual(JSON.parse(JSON.stringify(a.g)), a.g);
  // view is a pure function of the state and the time
  const v1 = view(a.g, 12.3), v2 = view(JSON.parse(JSON.stringify(a.g)), 12.3);
  assert.equal(v1.angle, v2.angle); assert.deepEqual(v1.alive, v2.alive);
});

test('bots: a hard bot lasts far longer than a normal one, and a normal longer than an easy one; none cheat (they only see the vine a short way ahead)', () => {
  const mean = (diff) => { let sum = 0; const N = 40; for (let s = 1; s <= N; s++) { const { g, t } = playBots(s, diff, -1, 4); for (const slot of g.slots) sum += g.alive[slot] ? t : g.outAt[slot]; } return sum / (N * 4); };
  const e = mean('easy'), n = mean('normal'), h = mean('hard');
  assert.ok(e < n && n < h, `survival easy ${e.toFixed(1)} < normal ${n.toFixed(1)} < hard ${h.toFixed(1)}`);
  assert.ok(e < 12 && h > 22);
  // the bot only looks 1.15 s ahead: with a long reaction it jumps late and dies
  const slow = { react: 1.5, noise: 0, miss: 0 };
  let diedSlow = 0;
  for (let s = 1; s <= 10; s++) { const r = playBots(s, 'hard', 0, 2, slow); if (!r.g.alive[0]) diedSlow++; }
  assert.ok(diedSlow >= 9, 'a bot that cannot react in time loses');
});

test('win rates over seeded runs: the scripted average kid beats easy bots most of the time and loses to hard ones', () => {
  const rate = (diff) => { let wins = 0; const N = 80; for (let s = 1; s <= N; s++) { const { g } = playBots(s, diff, 0, 4); if (placing(g).find((r) => r.slot === 0).place === 1) wins++; } return wins / N; };
  const easy = rate('easy'), normal = rate('normal'), hard = rate('hard');
  assert.ok(easy > 0.5, `the kid wins ${Math.round(easy * 100)}% against easy bots`);
  assert.ok(hard < 0.25, `the kid wins ${Math.round(hard * 100)}% against hard bots`);
  assert.ok(easy > normal && normal >= hard, `kid win rates ${easy} > ${normal} >= ${hard}`);
});
