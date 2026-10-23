// Driftwood Cast (Step 81a, party game 10; "Cast Aways" lives only in the plan): four berths on a sunset jetty over the Emberleaf lagoon, one water lane in front of each. The SAME stream of floating finds passes every
// lane in the same order and at the same time (fair, like Egg Scramble): driftwood 1 point, glimmerfin 2, message bottle 3, lanternkoi 5, a rare golden shell 10 and an old boot 0 ("Blah!"). An aim marker sweeps in and out
// across your lane on its own. THE LINE GOES OUT BY ITSELF (playtest 2026-10-21) and rests in the water, but THE STRIKE IS YOURS (playtest 2026-10-22): press Interact (the ONLY button) as the glowing ring passes a find; the hook lands in the ring
// where it was at the press and the nearest find within `hookR` is hooked (a hooked find never escapes); then mash Interact to reel it in (heavier finds need more presses). A strike that hooks nothing splashes, the line comes back after `waitMiss` s
// and you may strike again; NOTHING is ever hooked without a press. Most points after `cap` seconds wins.
// PURE rules, deterministic from the host's seed and clock (Node-tested in test/partyCast.test.js); the look is world/party/cast.js.
//
// WHAT YOU SEE IS WHAT IS JUDGED: the marker is drawn at `markerDepth(t)` on the lane's centre line; the hook flies there and lands `flight` s after the press at the marker's depth AT THE PRESS; a find is drawn at
// `itemPose(item, t)` (x across the lane, depth from the jetty edge) and the host takes the nearest available find within `hookR` of the hook at the landing moment, comparing exactly those two drawn positions.
//
// Game module contract: see vineskipLogic.js. recs (a 'cast' rec is a STRIKE: it comes from a press, judged in request(); step() only emits catch / end): { k: 'cast', slot, n, t, land, d, hit (item index | -1) } | { k: 'reel', slot, n, c, t } | { k: 'catch', slot, n, i, t, pts } | { k: 'end', t, why }.
// State: st[slot] = { n (casts so far), mode: 'idle' | 'reel' | 'wait', readyAt, land, d (the marker depth the last hook landed at), item, need, count, last: 'miss' | 'catch' }, res[slot][i] = 'h' (hooked) | 'd' (landed), score[slot], got[slot] (finds landed), boots[slot].
import { PARTY } from '../../config.js';
import { mulberry32 } from '../../utils/rng.js';

const C = PARTY.cast;
export const ID = 'cast';
const r2 = (v) => Math.round(v * 100) / 100;
const lerp = (a, b, u) => a + (b - a) * u;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const KINDS = ['driftwood', 'glimmerfin', 'bottle', 'lanternkoi', 'shell', 'boot'];
export const NAMES = { driftwood: 'Driftwood', glimmerfin: 'Glimmerfin', bottle: 'Message bottle', lanternkoi: 'Lanternkoi', shell: 'Golden shell', boot: 'Old boot' };
export const ptsOf = (kind) => C.pts[kind];
export const needOf = (kind) => C.need[kind];
export const laneOf = (g, slot) => g.slots.indexOf(slot);
const L = C.laneHalf + 0.2;                                    // finds enter / leave the lane this far from its centre line (a little past the water lane's edge)

/** Which way a find's nose points in its own model (local x): the fish are built head at -x, everything else points to +x. */
export const FORWARD = { driftwood: 1, glimmerfin: -1, bottle: 1, lanternkoi: -1, shell: 1, boot: 1 };
/** The yaw (about y) that turns a find's nose to its direction of travel along the lane (vx > 0 = to the right). */
export const yawFor = (kind, vx) => (FORWARD[kind] * Math.sign(vx || 1) > 0 ? 0 : Math.PI);
/** The find's velocity along the lane (u/s, + = right). */
export const velocityOf = (it) => it.dir * it.v;

// ---------------------------------------------------------------------------------------------------------------- the water
const MID = (C.depthMin + C.depthMax) / 2, AMP = (C.depthMax - C.depthMin) / 2;
/** The aim marker's distance from the jetty edge at time t (the same for every lane): a slow sweep out and in. */
export const markerDepth = (t) => MID - AMP * Math.cos((2 * Math.PI * t) / C.period);

const itemCache = new Map();
/** The stream of finds: [{ i, kind, t0 (enters the lane), dir (1 = drifts left to right, -1 = right to left), v (u/s), row (0..3), ph }]. The same for every lane. */
export function buildItems(seed) {
  const key = seed >>> 0, hit = itemCache.get(key);
  if (hit) return hit;
  const rng = mulberry32(key ^ 0x1d2c7f);
  const n = C.items, kinds = new Array(n).fill(null);
  // the rare ones: a golden shell in the middle third and another in the last third; then the boots (never in the first three, never two in a row); the rest shuffled
  const free = (i) => i >= 0 && i < n && kinds[i] === null;
  const putAt = (kind, lo, hi, ok = () => true) => { for (let tries = 0; tries < 200; tries++) { const i = lo + Math.floor(rng() * (hi - lo)); if (free(i) && ok(i)) { kinds[i] = kind; return; } } };
  putAt('shell', Math.floor(n * 0.33), Math.floor(n * 0.6)); putAt('shell', Math.floor(n * 0.66), n - 1);
  for (let b = 0; b < C.counts.boot; b++) putAt('boot', 3, n, (i) => kinds[i - 1] !== 'boot' && kinds[i + 1] !== 'boot');
  const rest = [];
  for (const k of KINDS) if (k !== 'shell' && k !== 'boot') for (let c = 0; c < C.counts[k]; c++) rest.push(k);
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  for (let i = 0; i < n; i++) if (kinds[i] === null) kinds[i] = rest.pop() || 'driftwood';
  const out = [];
  let t = C.first, prevRow = -1;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    if (i) t += lerp(C.gap[0], C.gap[1], u) * (0.88 + rng() * 0.24);
    let row = Math.floor(rng() * C.rows.length); if (row === prevRow) row = (row + 1 + Math.floor(rng() * (C.rows.length - 1))) % C.rows.length;
    prevRow = row;
    out.push({ i, kind: kinds[i], t0: r2(t), dir: rng() < 0.5 ? 1 : -1, v: r2(lerp(C.speed[0], C.speed[1], rng())), row, ph: r2(rng() * 6.28) });
  }
  itemCache.set(key, out);
  return out;
}
/** When a find leaves the lane. */
export const exitTime = (it) => it.t0 + (2 * L) / it.v;
/** Where a find floats at time t, in its lane: { on, x (u from the lane centre, +x = right), d (distance from the jetty edge) }. */
export function itemPose(it, t) {
  const u = t - it.t0, on = u >= 0 && t <= exitTime(it);
  return { on, x: it.dir * (-L + it.v * u), d: C.rows[it.row] + 0.22 * Math.sin(t * 1.7 + it.ph) };
}
/** Judge a strike pressed at time tt (the hook lands `flight` s later at the marker's depth at tt): { hit (index | -1), d, land }. `taken` = the finds already hooked or landed in this lane. */
export function judgeCast(items, taken, tt) {
  const land = r2(tt + C.flight), d = markerDepth(tt);
  let hit = -1, best = C.hookR;
  for (const it of items) {
    if (it.t0 > land) break;
    if (taken[it.i] !== undefined) continue;
    const p = itemPose(it, land);
    if (!p.on) continue;
    const dist = Math.hypot(p.x, p.d - d);
    if (dist <= best) { best = dist; hit = it.i; }
  }
  return { hit, d: r2(d), land };
}

// ---------------------------------------------------------------------------------------------------------------- the game
export function init(seed, roster) {
  const slots = roster.map((p) => p.slot).slice(0, C.lanes.length), st = {}, res = {}, score = {}, got = {}, boots = {};
  for (const s of slots) { st[s] = { n: 0, mode: 'idle', readyAt: C.firstCast, land: 0, d: 0, item: -1, need: 0, count: 0, last: '' };
  res[s] = {}; score[s] = 0; got[s] = 0; boots[s] = 0; }
  return { seed: seed >>> 0, slots, st, res, score, got, boots, done: false, endAt: null };
}

export function step(g, ctx, dt, t) {
  if (g.done) return [];
  const recs = [];
  for (const s of g.slots) {
    const st = g.st[s];
    if (st.mode === 'reel' && st.count >= st.need) {                              // the last press has been applied: the find comes aboard
      const it = buildItems(g.seed)[st.item];
      recs.push({ k: 'catch', slot: s, n: st.n, i: st.item, t: r2(t), pts: ptsOf(it.kind) });
    }
  }
  if (t >= C.cap) recs.push({ k: 'end', t: r2(t), why: 'cap' });
  return recs;
}

export function request(g, slot, req, ctx) {                  // a press: a STRIKE while the line rests and is ready, a reel pull once something is hooked
  if (g.done) return { ignore: true };
  const st = g.st[slot];
  if (!st) return { reject: 'not-playing' };
  const slack = ctx.slack ?? PARTY.slack, want = req && Number.isFinite(req.t) ? req.t : ctx.t;
  const tt = r2(Math.min(ctx.t, Math.max(ctx.t - slack, want)));                 // the presser's stamp, clamped into the host's recent past
  if (st.mode === 'reel') {
    if (tt < st.land || st.count >= st.need) return { ignore: true };              // (the hook has not landed yet / the find is already coming aboard)
    return { rec: { k: 'reel', slot, n: st.n, c: st.count + 1, t: tt } };
  }
  if (tt < st.readyAt || tt >= C.cap - C.flight) return { ignore: true };         // (the line is still coming back / out / too late for a hook to land)
  const j = judgeCast(buildItems(g.seed), g.res[slot], tt);
  return { rec: { k: 'cast', slot, n: st.n + 1, t: tt, land: j.land, d: j.d, hit: j.hit } };
}

export function apply(g, rec) {
  if (!rec) return g;
  const st = rec.slot !== undefined ? g.st[rec.slot] : null;
  if (rec.k === 'cast' && st) {
    st.n = rec.n; st.land = rec.land; st.d = rec.d; st.item = rec.hit; st.count = 0;
    if (rec.hit >= 0) { const it = buildItems(g.seed)[rec.hit]; st.mode = 'reel'; st.need = needOf(it.kind); g.res[rec.slot][rec.hit] = 'h'; }
    else { st.mode = 'wait'; st.need = 0; st.last = 'miss'; st.readyAt = r2(rec.land + C.waitMiss); }
  } else if (rec.k === 'reel' && st) {
    if (st.mode === 'reel' && rec.n === st.n) st.count = Math.max(st.count, rec.c);
  } else if (rec.k === 'catch' && st) {
    if (st.mode === 'reel' && rec.n === st.n) {
      const it = buildItems(g.seed)[rec.i];
      g.res[rec.slot][rec.i] = 'd'; g.score[rec.slot] += rec.pts; g.got[rec.slot]++; if (it.kind === 'boot') g.boots[rec.slot]++;
      st.mode = 'wait'; st.last = 'catch'; st.readyAt = r2(rec.t + C.waitCatch); st.item = -1; st.count = 0; st.need = 0;
    }
  } else if (rec.k === 'zap') { if (g.score[rec.slot] !== undefined) g.score[rec.slot] = rec.up ? g.score[rec.slot] + rec.up : 0; }      // (debug only)
  else if (rec.k === 'end') { g.done = true; g.endAt = rec.t; }
  return g;
}

/** Ranks by points; equal scores share a place. */
export function placing(g) {
  const rows = g.slots.map((slot) => ({ slot, score: g.score[slot] }));
  rows.sort((a, b) => b.score - a.score || a.slot - b.slot);
  let place = 1;
  return rows.map((r, i) => { if (i > 0 && r.score !== rows[i - 1].score) place = i + 1; return { slot: r.slot, place, score: r.score, out: false }; });
}

export function view(g, t = 0) {
  return { t, seed: g.seed, slots: g.slots, items: buildItems(g.seed), st: g.st, res: g.res, score: g.score, got: g.got, boots: g.boots, done: g.done, cap: C.cap, left: Math.max(0, C.cap - t) };
}

// ---------------------------------------------------------------------------------------------------------------- the bots
/** A bot times its strike, then mashes. While the line rests it looks ahead (up to `LOOK` s) for the moment the ring crosses a find worth hooking (boots only when fooled, `skill.fool`), presses then with a timing error of +-`skill.noise` s;
 *  once something is hooked and landed it presses Interact at skill.reel presses per second (a little irregular). Returns { x, y, interact }. */
const LOOK = 2.4;
export function bot(v, me, skill, rng) {
  const out = { x: 0, y: 0 }, m = me.mem, st = v.st[me.slot];
  if (!st || v.done) return out;
  const t = v.t;
  if (st.mode === 'reel') {
    if (t < st.land) return out;
    if (m.reelN !== st.n) { m.reelN = st.n; m.nextPress = t + 0.1 + skill.react * 0.3 * rng(); }
    if (t >= m.nextPress) { out.interact = true; m.nextPress = t + (1 / (skill.reel || 4)) * (0.75 + 0.5 * rng()); }
    return out;
  }
  if (t < st.readyAt || t >= C.cap - C.flight) return out;
  if (m.planN !== st.n) { m.planN = st.n; m.plan = null; m.look = Math.max(st.readyAt, t) + 0.05 + skill.react * rng(); m.fooled = {}; }
  if (!m.plan && t >= m.look) {
    const res = v.res[me.slot] || {};
    let best = null;
    for (let p = Math.max(t, st.readyAt); p < t + LOOK; p += 0.04) {
      const j = judgeCast(v.items, res, p);
      if (j.hit < 0) continue;
      const it = v.items[j.hit], pose = itemPose(it, j.land), dist = Math.hypot(pose.x, pose.d - j.d);
      if (dist > 0.5 * C.hookR) continue;
      if (it.kind === 'boot') { if (m.fooled[j.hit] === undefined) m.fooled[j.hit] = rng() < (skill.fool ?? 0.2); if (!m.fooled[j.hit]) continue; }
      if (!best || ptsOf(it.kind) > best.pts) best = { at: p, pts: ptsOf(it.kind) };
      if (best.pts >= 3 && p - best.at > 0.3) break;
    }
    if (best) m.plan = { at: best.at + (rng() * 2 - 1) * skill.noise * C.botNoise };
    else m.look = t + 0.5;                                                          // nothing worth it soon: look again in a moment
  }
  if (m.plan && t >= m.plan.at) { out.interact = true; m.plan = null; m.look = t + 0.3; m.planN = st.n; }
  return out;
}

/** Debug: every other lane's points vanish so this slot is ahead. */
export function debugWin(g, slot, t) { return [...g.slots.filter((s) => s !== slot).map((s) => ({ k: 'zap', slot: s, t: r2(t) })), { k: 'zap', slot, up: 1, t: r2(t) }]; }

export const GAME = {
  id: ID, name: 'Driftwood Cast', host: 'Yu Bbui Bbui', stage: 'cast', track: 'cast', players: [1, 4], kind: 'lanes', duration: C.cap, tail: C.tail,
  howto: { pitch: 'Your line is out. Press A as the glowing ring passes a find to hook it, then mash A to reel it in! Heavy finds take more presses. Most treasure wins.', buttons: ['interact'], verbs: { interact: 'Press to hook, mash to reel in' } },
  press: ['interact'],
  init, step, request, apply, view, placing, bot, debugWin, lag: 0.3,
};
