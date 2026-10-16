// Egg Scramble (Step 80c, party game 8; "Egg Emergency" lives only in the plan): four lanes at the Frostpine critter camp. The grouse in the pines lay eggs that tumble down; each player runs left and right in their own
// lane (the stick is the only control) and the eggs land on their head and STACK there. A golden egg is worth 3. Shyam Shyam giggles and lobs prank pinecones: one on your head knocks the top half of your stack off.
// When the stack reaches `bankAt` eggs it flies into the henhouse beside the lane (banked, safe). Most eggs at the end wins. PURE rules, deterministic from the host's seed and clock, Node-tested in
// test/partyEggs.test.js; the look is world/party/eggs.js.
//
// FAIR: `buildItems(seed)` is ONE sequence (when, which kind, where in the lane, how fast it falls) and EVERY lane gets exactly that sequence, at the same time.
// WHAT YOU SEE IS WHAT IS JUDGED: an item falls in a straight line, so its drawn position is `itemPose(item, lane, t)` (x = the lane's centre + item.x, y falling from the perch at the item's speed). The host resolves an
// item for a player at the moment that drawn y reaches the top of THAT player's drawn stack (`stackTop(n)` = head top + n eggs), by comparing that drawn x with where the player stands: within `catchR` it lands (the drawn
// egg meets the drawn head stack), otherwise it keeps falling and splats. A catch / bonk / miss record carries the moment, so a screen can check the drawn egg against the drawn stack (the world module clamps an egg
// that has reached a head to the stack top until the host's record arrives).
//
// Game module contract: see vineskipLogic.js. recs: { k: 'catch', slot, i, t, gold, bank? } | { k: 'miss', slot, i, t } | { k: 'bonk', slot, i, t, lost } | { k: 'end', t, why }.  There are no presses.
// State: rt[slot][i] = the moment of that record. stack[slot] = the values (1 or goldValue) of the eggs on the head, bottom first; banked[slot]; res[slot][i] = 'c' | 'm' | 'k' once item i is settled for that lane.
import { PARTY } from '../../config.js';
import { mulberry32 } from '../../utils/rng.js';
import { stageCentre } from './partyArea.js';

const E = PARTY.eggs;
export const ID = 'eggs';
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const lerp = (a, b, u) => a + (b - a) * u;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const XMAX = E.laneHalf - 0.45;                                // items fall where a player can stand (a little inside the lane's ends)

const itemCache = new Map();
/** The drop sequence: [{ i, kind: 'egg' | 'gold' | 'cone', t0 (s the fall starts), x (u from the lane centre), v (fall speed, u/s) }]. The same for every lane. */
export function buildItems(seed) {
  const key = seed >>> 0;
  const hit = itemCache.get(key);
  if (hit) return hit;
  const rng = mulberry32(key ^ 0x3c6ef372), out = [];
  let t = E.first, x = (rng() * 2 - 1) * XMAX;
  const n = E.items;
  // the kinds: a fixed share of cones and golds, shuffled, never two cones in a row, never a cone first or last (a fair opening and no cheap ending)
  const kinds = [];
  const cones = Math.round(n * E.coneShare), golds = Math.round(n * E.goldShare);
  for (let i = 0; i < n; i++) kinds.push('egg');
  const place = (kind, count, ok) => { let c = 0, tries = 0; while (c < count && tries++ < 500) { const i = 2 + Math.floor(rng() * (n - 3)); if (kinds[i] === 'egg' && ok(i)) { kinds[i] = kind; c++; } } };
  place('cone', cones, (i) => kinds[i - 1] !== 'cone' && kinds[i + 1] !== 'cone');
  place('gold', golds, () => true);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    if (i) {
      let dx = lerp(E.step[0], E.step[1], rng()) * (rng() < 0.5 ? -1 : 1);
      if (Math.abs(x + dx) > XMAX) dx = -dx;
      x = clamp(x + dx, -XMAX, XMAX);
      t += lerp(E.gap[0], E.gap[1], u) * (0.85 + rng() * 0.3);
    }
    out.push({ i, kind: kinds[i], t0: r2(t), x: r2(x), v: r2(lerp(E.speed[0], E.speed[1], u)) });
  }
  itemCache.set(key, out);
  return out;
}

export const valueOf = (kind) => (kind === 'gold' ? E.goldValue : 1);
/** The drawn top of a stack of n eggs (y, feet at 0): where a falling item meets it. */
export const stackTop = (n) => E.headTop + n * E.eggH;
/** Where an item is at time t (drawn y: the perch at t0, falling at v), and when it is at a given y. */
export const yAt = (item, t) => E.perchY - item.v * (t - item.t0);
export const timeAtY = (item, y) => item.t0 + (E.perchY - y) / item.v;
/** The drawn x of an item in a lane, relative to the stage centre. */
export const itemX = (item, lane) => E.lanes[lane] + item.x;
/** When an item reaches the ground (it splats there if no head caught it). */
export const groundTime = (item) => timeAtY(item, 0.12);
export const lastResolve = (items) => Math.max(...items.map(groundTime));

export function stackSum(stack) { let s = 0; for (const v of stack) s += v; return s; }
export const totalOf = (g, slot) => (g.banked[slot] || 0) + stackSum(g.stack[slot] || []);

/** The new stack after one record (pure; the step uses it on a scratch copy so two items in one frame see each other). */
export function stackAfter(stack, banked, rec) {
  let s = stack, b = banked;
  if (rec.k === 'catch') {
    s = stack.concat(rec.gold ? E.goldValue : 1);
    if (s.length >= E.bankAt) { b = banked + stackSum(s); s = []; }
  } else if (rec.k === 'bonk') s = stack.slice(0, Math.max(0, stack.length - rec.lost));
  return { stack: s, banked: b };
}
/** How many eggs a pinecone knocks off a stack of n: the top half, rounded up (a lone egg goes too). */
export const knockOff = (n) => Math.ceil(n / 2);

export const laneOf = (g, slot) => g.slots.indexOf(slot);

// ---------------------------------------------------------------------------------------------------------------- the game
export function init(seed, roster) {
  const slots = roster.map((p) => p.slot).slice(0, E.lanes.length), stack = {}, banked = {}, res = {}, rt = {}, hits = {}, caught = {};
  for (const s of slots) { stack[s] = []; banked[s] = 0; res[s] = {}; rt[s] = {}; hits[s] = 0; caught[s] = 0; }
  return { seed: seed >>> 0, slots, stack, banked, res, rt, hits, caught, done: false, endAt: null };
}

export function step(g, ctx, dt, t) {
  if (g.done) return [];
  const recs = [], items = buildItems(g.seed), c = stageCentre(ID);
  const tmp = {};
  for (const s of g.slots) tmp[s] = { stack: g.stack[s], banked: g.banked[s] };
  for (const it of items) {
    if (it.t0 > t) break;
    const y = yAt(it, t);
    for (const s of g.slots) {
      if (g.res[s][it.i] !== undefined || recs.some((r) => r.slot === s && r.i === it.i)) continue;
      const top = stackTop(tmp[s].stack.length);
      if (y > top) continue;                                                        // still above the stack
      const p = ctx.pos ? ctx.pos(s) : null, lane = laneOf(g, s);
      const hit = p && Math.abs(p.x - (c.x + itemX(it, lane))) <= E.catchR;
      const at = r2(Math.max(it.t0, Math.min(t, timeAtY(it, top))));
      let rec;
      if (!hit) rec = { k: 'miss', slot: s, i: it.i, t: at };
      else if (it.kind === 'cone') rec = { k: 'bonk', slot: s, i: it.i, t: at, lost: knockOff(tmp[s].stack.length) };
      else rec = { k: 'catch', slot: s, i: it.i, t: at, gold: it.kind === 'gold' ? 1 : 0 };
      if (rec.k === 'catch' && tmp[s].stack.length + 1 >= E.bankAt) rec.bank = 1;
      recs.push(rec);
      tmp[s] = stackAfter(tmp[s].stack, tmp[s].banked, rec);
    }
  }
  const settled = items.every((it) => it.t0 <= t && g.slots.every((s) => g.res[s][it.i] !== undefined || recs.some((r) => r.slot === s && r.i === it.i)));
  if (settled && t >= lastResolve(items) + 0.2) recs.push({ k: 'end', t: r2(t), why: 'done' });
  else if (t >= E.cap) recs.push({ k: 'end', t: r2(t), why: 'cap' });
  return recs;
}

export function request() { return { ignore: true }; }      // (no presses: the stick runs, the eggs come to you)

export function apply(g, rec) {
  if (!rec) return g;
  if (rec.k === 'catch' || rec.k === 'miss' || rec.k === 'bonk') {
    if (!g.res[rec.slot] || g.res[rec.slot][rec.i] !== undefined) return g;
    g.res[rec.slot][rec.i] = rec.k === 'catch' ? 'c' : rec.k === 'miss' ? 'm' : 'k'; g.rt[rec.slot][rec.i] = rec.t;
    if (rec.k === 'catch') g.caught[rec.slot]++;
    if (rec.k === 'bonk') g.hits[rec.slot]++;
    const n = stackAfter(g.stack[rec.slot], g.banked[rec.slot], rec);
    g.stack[rec.slot] = n.stack; g.banked[rec.slot] = n.banked;
  } else if (rec.k === 'zap') { if (g.stack[rec.slot]) { g.stack[rec.slot] = []; g.banked[rec.slot] = 0; } }       // (debug only: this lane's eggs vanish)
  else if (rec.k === 'end') { g.done = true; g.endAt = rec.t; }
  return g;
}

/** Ranks by eggs (golden = 3, banked + on the head); equal scores share a place. */
export function placing(g) {
  const rows = g.slots.map((slot) => ({ slot, score: totalOf(g, slot) }));
  rows.sort((a, b) => b.score - a.score || a.slot - b.slot);
  let place = 1;
  return rows.map((r, i) => { if (i > 0 && r.score !== rows[i - 1].score) place = i + 1; return { slot: r.slot, place, score: r.score, out: false }; });
}

export function view(g, t = 0) {
  const items = buildItems(g.seed), totals = {};
  for (const s of g.slots) totals[s] = totalOf(g, s);
  return { t, seed: g.seed, slots: g.slots, items, stack: g.stack, banked: g.banked, res: g.res, rt: g.rt, totals, hits: g.hits, caught: g.caught, done: g.done, lanes: g.slots.length };
}

/**
 * Where item `it` is drawn in lane `lane` at time t, and what it is doing: { x (stage-local), y, state: 'lob' | 'fall' | 'caught' | 'resting' | 'splat' | 'gone' }. `top` = the drawn stack top of that lane
 * (stackTop(stack length)); `res` = the host's settled record for it ('c' | 'm' | 'k' | undefined); `resT` = the moment on that record. An unsettled item that has reached `top` over a head (`aligned`) rests on the
 * stack until the record arrives, so a screen never shows an egg through a head.
 */
export function itemPose(it, lane, t, top, res, resT, aligned) {
  const x = itemX(it, lane);
  if (t < it.t0) return { x, y: E.perchY, state: t >= it.t0 - E.lobLead && it.kind === 'cone' ? 'lob' : 'gone' };
  const y = yAt(it, t);
  if (res === 'c' || res === 'k') return { x, y: Math.max(top, y), state: t >= resT ? 'caught' : 'fall' };
  if (res === 'm') return y <= 0.12 ? { x, y: 0.12, state: t > groundTime(it) + 0.5 ? 'gone' : 'splat' } : { x, y, state: 'fall' };
  if (y <= top && aligned) return { x, y: top, state: 'resting' };
  return { x, y: Math.max(0.12, y), state: y <= 0.12 ? 'splat' : 'fall' };
}

// ---------------------------------------------------------------------------------------------------------------- the bots
/**
 * A bot looks at the lane exactly as a player does: where the next eggs will land (the shadow on the ground), and runs under them. It starts moving toward an item only `react` s after it appeared, aims with
 * noise (the shadow under a wobble), skips an item now and then, prefers golden ones and dodges pinecones. Returns { x, y } (the stick: x right).
 */
export function bot(v, me, skill, rng) {
  const m = me.mem, out = { x: 0, y: 0 };
  const lane = v.slots.indexOf(me.slot);
  if (lane < 0 || v.done) return out;
  const c = stageCentre(ID), t = v.t, top = stackTop((v.stack[me.slot] || []).length), laneX = c.x + E.lanes[lane];
  const cand = [];
  for (const it of v.items) {
    if (it.t0 > t + 0.2) break;
    if (v.res[me.slot][it.i] !== undefined) continue;
    const arrive = timeAtY(it, top);
    if (arrive < t - 0.05) continue;
    if (m.seen === undefined) m.seen = {};
    if (m.seen[it.i] === undefined) m.seen[it.i] = { at: t + skill.react * (0.85 + rng() * 0.3), skip: rng() < skill.miss * PARTY.eggs.botMiss * (it.kind === 'cone' ? 2 : 1), off: (rng() + rng() + rng() - 1.5) * 1.15 * skill.noise * 4 };
    const sn = m.seen[it.i];
    if (t < sn.at) continue;
    cand.push({ it, arrive, sn });
  }
  cand.sort((a, b) => a.arrive - b.arrive);
  // the next egg worth running to (a golden one is worth a detour); a cone that lands where we would stand is stepped around
  const mag = E.pace + (1 - E.pace) * skill.walk, spd = mag <= 0.5 ? 7 * mag : 3.5 + 3.5 * (mag - 0.5) / 0.5;               // how fast this stick magnitude runs (the player's walk / run blend)
  let aim = null;
  for (const k of cand) {                                                        // the first egg it can still reach in time (else the nearest, to keep moving)
    if (k.it.kind === 'cone' || k.sn.skip) continue;
    const ax = laneX + k.it.x + k.sn.off, reachable = Math.abs(ax - me.x) / spd <= k.arrive - t + 0.2;
    if (reachable) { aim = { x: ax, arrive: k.arrive, kind: k.it.kind }; break; }
    if (!aim || Math.abs(ax - me.x) < Math.abs(aim.x - me.x)) aim = { x: ax, arrive: k.arrive, kind: k.it.kind };
  }
  let want = aim ? aim.x : me.x;
  for (const k of cand) {
    if (k.it.kind !== 'cone' || k.sn.skip) continue;
    const cx = laneX + k.it.x;
    if (Math.abs(cx - want) < E.catchR + 0.55 && k.arrive - t < 1.6) { want = cx + (me.x >= cx ? 1 : -1) * (E.catchR + 0.8); }
  }
  want = clamp(want, laneX - E.laneHalf + 0.3, laneX + E.laneHalf - 0.3);
  const dx = want - me.x;
  if (Math.abs(dx) < 0.12) return out;
  out.x = clamp(dx * 2.2, -1, 1) * (E.pace + (1 - E.pace) * skill.walk);
  return out;
}

/** Debug: every other lane's eggs vanish (stack and bank to zero) so this slot is ahead. */
export function debugWin(g, slot, t) { return g.slots.filter((s) => s !== slot).map((s) => ({ k: 'zap', slot: s, t: r2(t) })); }

export const GAME = {
  id: ID, name: 'Egg Scramble', host: 'Shyam Shyam', stage: 'eggs', track: 'eggs', players: [1, 4], kind: 'lanes', duration: E.cap, tail: E.tail,
  howto: { pitch: 'Run left and right in your lane and let the eggs land on your head! Golden eggs count three. Watch out for my pinecones. Hee hee!', buttons: ['stick'], verbs: { stick: 'Run left and right' } },
  press: [],
  init, step, request, apply, view, placing, bot, debugWin, lag: 0,
};
