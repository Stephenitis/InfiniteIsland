// Pinecone Huddle (Step 80b, party game 5; "Rock Harden" lives only in the plan): each player sits on a stump in a snowy pine grove, Myodette calling it calmly. Pinecones and snow clumps drop from the pines at
// random times, one stream per player (a shadow grows on the snow and a whistle sounds `warn` seconds before each lands). HOLD a button to curl into a pinecone shell: a shell that is closed when the drop lands
// blocks it; a drop that lands on an open player dazes them (covered in snow) = OUT. The shell meter drains while the shell is closed and NEVER refills, so curl late and let go early. Survivors at 60 s win,
// ranked by shell left (the most shell left is first). PURE rules, deterministic from the host's seed and clock (Node-tested in test/partyHuddle.test.js); the look is world/party/huddle.js.
//
// FAIR: every player gets the same number of drops, and the SAME multiset of gaps between them (scaled to add up to `span`), in an order shuffled per player, plus a start jitter. So the streams are different
// but equally hard; `buildDrops(seed, slots)` is the schedule. A hit is judged `lag` seconds after the landing from the shell's INTERVALS (a stamped press may arrive a little late): the shell protects from
// `close` s after it began to close until it opens, or the meter runs dry.
// Game module contract: see vineskipLogic.js. recs: { k: 'curl', slot, on, at, why? } | { k: 'safe', slot, d } | { k: 'out', slot, d, t } | { k: 'end', t, why }.  The press is a HOLD: request { on: true | false, t }.
import { PARTY } from '../../config.js';
import { mulberry32 } from '../../utils/rng.js';

const H = PARTY.huddle;
export const ID = 'huddle';
export const TIE = 0.05;                                     // two outs this close (s) are one tie
const r2 = (v) => Math.round(v * 100) / 100;

const dropCache = new Map();
/** The drop schedule: { [slot]: [{ i, at, warnAt, kind: 'cone' | 'snow' }] } (the same count and the same gaps for every slot, in a per-slot order). */
export function buildDrops(seed, slots) {
  const key = `${seed >>> 0}|${slots.join(',')}`;
  const hit = dropCache.get(key);
  if (hit) return hit;
  const base = mulberry32((seed >>> 0) ^ 0x6d2b79f5), raw = [];
  for (let j = 0; j < H.drops - 1; j++) raw.push(H.gapMin + base() * (H.gapMax - H.gapMin));
  const sum = raw.reduce((a, b) => a + b, 0), gaps = raw.map((g) => g * H.span / sum);       // (the same story for every player: only its order differs)
  const out = {};
  for (const s of slots) {
    const rng = mulberry32(((seed >>> 0) ^ Math.imul(s + 1, 0x9e3779b1) ^ 0x1f2e3d) >>> 0), order = gaps.slice();
    for (let i = order.length - 1; i > 0; i--) { const k = Math.floor(rng() * (i + 1)); [order[i], order[k]] = [order[k], order[i]]; }
    let at = H.first + rng() * H.jitter;
    const list = [];
    for (let j = 0; j < H.drops; j++) {
      list.push({ i: j, at: r2(at), warnAt: r2(at - H.warn), kind: rng() < 0.5 ? 'cone' : 'snow' });
      if (j < order.length) at += order[j];
    }
    out[s] = list;
  }
  dropCache.set(key, out);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- shell maths
/** Seconds of shell left at time t. */
export function leftOf(sh, t) {
  const used = sh.on ? sh.used + Math.max(0, Math.min(t, sh.cap) - sh.at) : sh.used;
  return Math.max(0, r2(H.meter - used));
}
/** Is the shell closed (protecting) at time t? Judged from the intervals, so a late-arriving release still counts. A press protects at once (`close` 0) and even a quick tap holds for `parry` s, like a parry. */
export function closedAt(sh, t) {
  return sh.ints.some(([s, e]) => t >= s + H.close && t < Math.max(e === null ? sh.cap : e, s + H.parry));
}

// ---------------------------------------------------------------------------------------------------------------- the game
export function init(seed, roster) {
  const slots = roster.map((p) => p.slot), alive = {}, sh = {}, next = {}, safe = {};
  for (const s of slots) { alive[s] = true; sh[s] = { used: 0, on: false, at: 0, cap: 0, ints: [] }; next[s] = 0; safe[s] = 0; }
  return { seed: seed >>> 0, slots, alive, outAt: {}, sh, next, safe, done: false, endAt: null };
}

const aliveSlots = (g) => g.slots.filter((s) => g.alive[s]);

export function step(g, ctx, dt, t) {
  if (g.done) return [];
  const recs = [], drops = buildDrops(g.seed, g.slots), lag = ctx.lag ?? H.lag;
  let dead = 0, settled = true;
  for (const s of aliveSlots(g)) {
    const sh = g.sh[s], list = drops[s], d = list[g.next[s]];
    if (sh.on && t >= sh.cap) recs.push({ k: 'curl', slot: s, on: false, at: r2(sh.cap), why: 'spent' });
    if (d && t > d.at + lag) {                                                   // (one drop per player per step: the gaps are far longer than a step, so a rec is never emitted twice)
      if (closedAt(sh, d.at)) recs.push({ k: 'safe', slot: s, d: d.i });
      else { recs.push({ k: 'out', slot: s, d: d.i, t: d.at }); dead++; continue; }
    }
    if (!(g.next[s] + (recs.some((r) => r.k === 'safe' && r.slot === s) ? 1 : 0) >= H.drops)) settled = false;
  }
  const left = aliveSlots(g).length - dead, lastAt = Math.max(...g.slots.map((s) => drops[s][H.drops - 1].at));
  if (g.slots.length > 1 ? left <= 1 : left === 0) { if (dead) recs.push({ k: 'end', t: r2(t), why: 'last' }); }
  else if (settled && t >= lastAt + lag + 1) recs.push({ k: 'end', t: r2(t), why: 'done' });
  if (!recs.some((r) => r.k === 'end') && t >= H.cap) recs.push({ k: 'end', t: r2(t), why: 'cap' });
  return recs;
}

export function request(g, slot, req, ctx) {
  if (g.done) return { ignore: true };
  const sh = g.sh[slot];
  if (!sh) return { reject: 'not-playing' };
  if (!g.alive[slot]) return { reject: 'out' };
  const on = !!(req && req.on);
  if (on === sh.on) return { ignore: true };
  const slack = ctx.slack ?? PARTY.slack, want = Number.isFinite(req && req.t) ? req.t : ctx.t;
  let tt = Math.min(ctx.t, Math.max(ctx.t - slack, want));
  const lastEnd = sh.ints.length ? sh.ints[sh.ints.length - 1][1] : null;
  if (on) {
    if (lastEnd !== null) tt = Math.max(tt, lastEnd);
    if (leftOf(sh, tt) <= 0) return { ignore: true };                           // the meter is spent: nothing to curl with
  } else tt = Math.max(tt, sh.at);                                              // (a release stamped before the curl began is the same instant)
  return { rec: { k: 'curl', slot, on, at: r2(tt) } };
}

function closeShell(sh, at) {
  if (!sh.on) return;
  const e = Math.min(at, sh.cap);
  sh.on = false; sh.used = r2(Math.min(H.meter, sh.used + Math.max(H.parry, e - sh.at)));      // (a tap costs a whole parry: tapping is never free)
  sh.ints[sh.ints.length - 1][1] = r2(Math.max(e, sh.ints[sh.ints.length - 1][0]));
}

export function apply(g, rec) {
  if (!rec) return g;
  if (rec.k === 'curl') {
    const sh = g.sh[rec.slot];
    if (!sh || !g.alive[rec.slot]) return g;
    if (rec.on && !sh.on) { sh.on = true; sh.at = rec.at; sh.cap = r2(rec.at + (H.meter - sh.used)); sh.ints.push([rec.at, null]); }
    else if (!rec.on) closeShell(sh, rec.at);
  } else if (rec.k === 'safe') { g.next[rec.slot] = Math.max(g.next[rec.slot], rec.d + 1); g.safe[rec.slot] = (g.safe[rec.slot] || 0) + 1; }
  else if (rec.k === 'out') {
    if (g.alive[rec.slot]) { g.alive[rec.slot] = false; g.outAt[rec.slot] = rec.t; g.next[rec.slot] = Math.max(g.next[rec.slot], rec.d + 1); closeShell(g.sh[rec.slot], rec.t); }
  } else if (rec.k === 'end') { g.done = true; g.endAt = rec.t; }
  return g;
}

/** Ranks: survivors first, the most shell left first (within `tie` s is a tie); then the dazed ones, the later hit first (a tie within TIE s). */
export function placing(g) {
  const end = g.endAt ?? H.cap;
  const rows = g.slots.map((slot) => ({ slot, out: !g.alive[slot], key: g.alive[slot] ? leftOf(g.sh[slot], end) : g.outAt[slot] }));
  rows.sort((a, b) => (a.out !== b.out ? (a.out ? 1 : -1) : b.key - a.key || a.slot - b.slot));
  let place = 1, anchor = null;
  return rows.map((r, i) => {
    const tol = r.out ? TIE : H.tie;
    if (i > 0 && !(rows[i - 1].out === r.out && Math.abs(r.key - anchor) <= tol)) { place = i + 1; anchor = r.key; }
    if (i === 0) anchor = r.key;
    return { slot: r.slot, place, score: r.key, out: r.out };
  });
}

export function view(g, t = 0) {
  const drops = buildDrops(g.seed, g.slots), seats = {};
  for (const s of g.slots) {
    const sh = g.sh[s];
    seats[s] = { alive: g.alive[s], on: sh.on, at: sh.at, closed: sh.on && t >= sh.at + H.close && t < sh.cap, left: leftOf(sh, t), safe: g.safe[s] || 0 };
  }
  return { t, seed: g.seed, slots: g.slots, alive: g.alive, outAt: g.outAt, drops, next: g.next, seats, sh: g.sh, done: g.done, meter: H.meter };
}

/** What a bot does: it sees its own shadow at `warnAt`, reacts after skill.react (+ noise), curls `lead` s before the landing (never before it reacted) and lets go `after` s after (easy bots waste meter holding on), sometimes forgets. */
export function bot(v, me, skill, rng) {
  const mem = me.mem, out = { x: 0, y: 0, hold: null };
  if (!v.alive[me.slot]) return out;
  const d = (v.drops[me.slot] || []).find((x) => v.t <= x.at + 1.0);
  if (!d) return out;
  const key = `${v.seed}:${d.i}`;
  if (mem.hd !== key) {
    const gauss = (rng() + rng() + rng() - 1.5) * 1.15, sk = skill.shell || { lead: 0.4, after: 0.3 };
    mem.hd = key;
    mem.curlAt = Math.max(d.warnAt + skill.react * (0.85 + rng() * 0.3), d.at - sk.lead + gauss * skill.noise);
    mem.relAt = d.at + sk.after * (0.6 + rng() * 0.8);
    mem.forget = rng() < skill.miss * H.botMiss;
  }
  if (!mem.forget && v.t >= mem.curlAt && v.t <= mem.relAt) out.hold = { interact: 0.08 };
  return out;
}

/** Debug: everybody but `slot` is dazed at once. */
export function debugWin(g, slot, t) { return g.slots.filter((s) => s !== slot && g.alive[s]).map((s) => ({ k: 'out', slot: s, d: g.next[s], t: r2(t) })); }

export const GAME = {
  id: ID, name: 'Pinecone Huddle', host: 'Myodette', stage: 'huddle', track: 'huddle', players: [1, 4], kind: 'elim', duration: H.cap + H.tail,
  howto: { pitch: 'Pinecones are falling, dear friends. Hold the button to curl into your shell when the whistle sounds, and let go once it is safe. Your shell only lasts so long.', buttons: ['interact'], verbs: { interact: 'Hold to curl' } },
  press: ['interact', 'jump', 'cancel'], hold: true,                             // any button holds the shell shut: nobody is ever on the wrong one
  init, step, request, apply, view, placing, bot, debugWin, tail: H.tail, lag: H.lag,
};
