// Timber Trim (Step 80a, party game 2): four lanes side by side; Bramble sends a log (pine, birch, palm, breadfruit) sliding down out of a chute in each lane, and a berry-red line (with a matching stripe on each log) marks the cut. Press Interact once to
// chop as the log passes your axe; the closer to the ring, the more "beaver bites". Seven logs each, later ones faster and some wobble, each with its stripe at a different place (1/4 .. 3/4 along); EVERY lane gets the same log sequence (one seed), so it is fair. The highest total wins.
// PURE rules, deterministic from the host's seed and clock (Node-tested in test/partyTimber.test.js); the look is world/party/timber.js.
//
// A log's position along its lane is u(tau) = tau + wob * sin(2 pi k tau) / (2 pi k), tau = (t - start) / dur in 0..1 (a monotone wobble: it speeds up and slows down on its way); it passes the ring at the time `pass`
// where u = MARK_FRAC (bisection). The host judges a chop from the PRESSER's stamp (clamped into the host's recent past with `slack`), against the window [pass - win, pass + win] of the log that is on its way.
// Game module contract: see vineskipLogic.js. recs: { k: 'cut', slot, i, d (signed ms), pts } | { k: 'whiff', slot, i } | { k: 'end', t }
import { PARTY } from '../../config.js';
import { mulberry32 } from '../../utils/rng.js';

const T = PARTY.timber;
export const ID = 'timber';
export const K_WOBBLE = 2;                                    // wobble cycles per log
const r2 = (v) => Math.round(v * 100) / 100;

const u = (tau, wob) => tau + wob * Math.sin(2 * Math.PI * K_WOBBLE * tau) / (2 * Math.PI * K_WOBBLE);
/** Position (0..1 along the lane) of a log at time t. */
/** How far down the lane (0..1) a log's MIDDLE is when it sits on the cut line: derived from the stage numbers, so the score always matches the line the players see. */
export const MARK_FRAC = (T.markZ - T.chuteZ) / (T.endZ - T.chuteZ);
/** Where a log's stripe sits relative to its middle, along the lane (u; + = towards the front end, which leads down the lane). */
export const stripeOffset = (stripe) => (0.5 - stripe) * T.logLen;
/** How far down the lane (0..1) a log's middle is when its STRIPE is on the cut line. */
export const markFracOf = (stripe) => (T.markZ - stripeOffset(stripe) - T.chuteZ) / (T.endZ - T.chuteZ);
export function logFrac(log, t) { return u(Math.min(1, Math.max(0, (t - log.start) / log.dur)), log.wob); }
/** tau at which u(tau) = m (u is monotone for wob < 1). */
function solve(m, wob) {
  let a = 0, b = 1;
  for (let i = 0; i < 40; i++) { const mid = (a + b) / 2; if (u(mid, wob) < m) a = mid; else b = mid; }
  return (a + b) / 2;
}

const logCache = new Map();
/** The log sequence of a game (the same for every lane): [{ i, kind, start, dur, wob, stripe, pass }]. `stripe` = where its red stripe sits (fraction from the front end): the five STRIPES shuffled, then random ones (never the same twice in a row). */
export function buildLogs(seed) {
  const key = seed >>> 0;
  const hit = logCache.get(key);
  if (hit) return hit;
  const rng = mulberry32(key ^ 0x7131b3);
  const logs = [];
  let start = T.first, prev = -1;
  const order = T.stripes.slice();
  for (let i = order.length - 1; i > 0; i--) { const k = Math.floor(rng() * (i + 1)); [order[i], order[k]] = [order[k], order[i]]; }
  while (order.length < T.logs) { let s = T.stripes[Math.floor(rng() * T.stripes.length)]; if (s === order[order.length - 1]) s = T.stripes[(T.stripes.indexOf(s) + 2) % T.stripes.length]; order.push(s); }
  for (let i = 0; i < T.logs; i++) {
    let k = Math.floor(rng() * T.kinds.length);
    if (k === prev) k = (k + 1 + Math.floor(rng() * (T.kinds.length - 1))) % T.kinds.length;
    prev = k;
    const dur = T.durs[Math.min(i, T.durs.length - 1)], wob = T.wobbles[Math.min(i, T.wobbles.length - 1)] * (0.85 + rng() * 0.3);
    const stripe = Math.round(order[i] * 1000) / 1000, pass = start + dur * solve(markFracOf(stripe), wob);
    logs.push({ i, kind: T.kinds[k], start: r2(start), dur, wob: Math.round(wob * 1000) / 1000, stripe, pass: r2(pass) });
    start += dur + T.gap;
  }
  logCache.set(key, logs);
  return logs;
}

/** Points for a chop `d` seconds off the ring: 100 within `perfect`, then a smooth fall to 0 at `win`. */
export function pointsFor(d) {
  const a = Math.abs(d);
  if (a <= T.perfect) return 100;
  if (a >= T.win) return 0;
  const k = 1 - (a - T.perfect) / (T.win - T.perfect);
  return Math.max(1, Math.round(100 * Math.pow(k, 1.35)) - 1);
}
export const bitesFor = (pts) => (pts >= 100 ? 5 : Math.min(4, Math.ceil(pts / 22)));   // 0..5 beaver bites (5 = dead on)

// ---------------------------------------------------------------------------------------------------------------- the game
export function init(seed, roster) {
  const slots = roster.map((p) => p.slot), cuts = {};
  for (const s of slots) cuts[s] = [];
  return { seed: seed >>> 0, slots, cuts, done: false, endAt: null };
}

const settled = (g, slot, i) => g.cuts[slot].some((c) => c.i === i);
export const totalOf = (g, slot) => g.cuts[slot].reduce((n, c) => n + c.pts, 0);

export function step(g, ctx, dt, t) {
  if (g.done) return [];
  const recs = [], logs = buildLogs(g.seed), grace = (ctx.lag ?? T.lag);
  for (const s of g.slots) for (const L of logs) {
    if (t > L.pass + T.win + grace && !settled(g, s, L.i)) recs.push({ k: 'whiff', slot: s, i: L.i });
  }
  const last = logs[logs.length - 1];
  const allSettled = g.slots.every((s) => logs.every((L) => settled(g, s, L.i) || recs.some((r) => r.slot === s && r.i === L.i)));
  if (allSettled && t >= last.pass + 0.4) recs.push({ k: 'end', t: r2(t), why: 'done' });
  else if (t >= T.cap) recs.push({ k: 'end', t: r2(t), why: 'cap' });
  return recs;
}

export function request(g, slot, req, ctx) {
  if (g.done) return { ignore: true };
  if (!g.cuts[slot]) return { reject: 'not-playing' };
  const slack = ctx.slack ?? PARTY.slack, want = Number.isFinite(req && req.t) ? req.t : ctx.t;
  const tt = r2(Math.min(ctx.t, Math.max(ctx.t - slack, want)));
  const log = buildLogs(g.seed).find((L) => tt >= L.pass - T.win && tt <= L.pass + T.win);
  if (!log || settled(g, slot, log.i)) return { ignore: true };                  // between logs, or this one is already cut: the axe whistles through the air
  const d = tt - log.pass;
  return { rec: { k: 'cut', slot, i: log.i, d: Math.round(d * 1000), pts: pointsFor(d) } };
}

export function apply(g, rec) {
  if (!rec) return g;
  if (rec.k === 'cut') { if (g.cuts[rec.slot] && !settled(g, rec.slot, rec.i)) g.cuts[rec.slot].push({ i: rec.i, pts: rec.pts, d: rec.d }); }
  else if (rec.k === 'whiff') { if (g.cuts[rec.slot] && !settled(g, rec.slot, rec.i)) g.cuts[rec.slot].push({ i: rec.i, pts: 0, d: null }); }
  else if (rec.k === 'end') { g.done = true; g.endAt = rec.t; }
  return g;
}

export function placing(g) {
  const rows = g.slots.map((slot) => ({ slot, pts: totalOf(g, slot) }));
  rows.sort((a, b) => b.pts - a.pts || a.slot - b.slot);
  let place = 1;
  return rows.map((r, i) => { if (i > 0 && r.pts !== rows[i - 1].pts) place = i + 1; return { slot: r.slot, place, score: r.pts, out: false }; });
}

export function view(g, t = 0) {
  return { t, logs: buildLogs(g.seed), cuts: g.cuts, slots: g.slots, done: g.done, totals: Object.fromEntries(g.slots.map((s) => [s, totalOf(g, s)])) };
}

/** A bot presses at the ring's ETA plus noise (it watches the log slide: it knows when it will pass, not before it has entered). me = { slot, mem }; returns { x, y, interact }. */
export function bot(v, me, skill, rng) {
  const mem = me.mem, out = { x: 0, y: 0, interact: false }, t = v.t;
  const mine = v.cuts[me.slot] || [];
  const L = v.logs.find((l) => !mine.some((c) => c.i === l.i) && t < l.pass + T.win);
  if (!L || t < L.start) return out;
  if (mem.log !== L.i) {
    const gauss = (rng() + rng() + rng() - 1.5) * 1.15;
    mem.log = L.i; mem.done = false;
    mem.plan = L.pass + Math.max(-T.win * 0.9, Math.min(T.win * 0.9, gauss * skill.noise));
    mem.miss = rng() < skill.miss;
    mem.react = L.start + skill.react * 0.5;
  }
  if (!mem.done && !mem.miss && t >= Math.max(mem.plan, mem.react)) { mem.done = true; out.interact = true; }
  return out;
}

/** Debug: `slot` cuts every log dead on, everybody else misses them all. */
export function debugWin(g, slot) {
  const recs = [];
  for (const L of buildLogs(g.seed)) for (const s of g.slots) {
    if (g.cuts[s].some((c) => c.i === L.i)) continue;
    recs.push(s === slot ? { k: 'cut', slot: s, i: L.i, d: 0, pts: 100 } : { k: 'whiff', slot: s, i: L.i });
  }
  return recs;
}

export const GAME = {
  id: ID, name: 'Timber Trim', host: 'Bramble', stage: 'timber', track: 'timber', players: [1, 4], kind: 'lanes', duration: T.first + T.durs.reduce((a, b) => a + b, 0) + T.gap * (T.logs - 1) + 2,
  howto: { pitch: "Chop when the red stripe on the log reaches the red line! Closer cuts earn more beaver bites.", buttons: ['interact'], verbs: { interact: 'Chop!' } },
  press: ['interact'],
  init, step, request, apply, view, placing, bot, debugWin, tail: T.tail, lag: T.lag,
};
