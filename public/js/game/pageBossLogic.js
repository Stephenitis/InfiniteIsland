// The Volcano Spirit (Step 53a): the boss of the Emberleaf Canopy chapter. PURE and HOST-DECIDED like the rest of the page world (game/pageWorldLogic.js calls this module; Node-tested in test/jungle.test.js).
// A grumpy lava blob sits on a stone ring in a one-screen arena and goes round a cozy cycle:
//
//   sleep   dormant (harmless) until somebody comes within PAGE_BOSS.wake tiles
//   idle    glowering, a short warning                                         (hot: touching it hurts)
//   lob     coughs up a volley of lava GLOBS, one every `lobGap` s: each aims at where a player stood and shows a growing shadow on the ground for `flight` s before it lands (splash radius `splash`)
//   sink    sinks into the lava and its crust cools                              (not hot any more)
//   cooled  the crust is grey and low for `cooled` s: THROW a coconut at it or STOMP its crust (one hit each); it cannot hurt anybody
//   hurt    a hit: it flashes for `hurt` s, then rises again
//   rise    heats up again (hot) -> idle ...                                     three hits = dead: the page's goal bookmark appears
//
// Scaling is gentle and never harder for a solo player: a volley is `globsBase` globs + `perHit` for every hit already taken, +1 per extra player in the page (at most `globsMax`), and the idle
// warning is `idleParty` s shorter per extra player (at least `idleMin`). Every decision is a REC (the same code applies it on every screen); screens only advance the animation clocks.
//
//   newBoss(spec) -> boss { x, y, hp, max, st, t, left, k, volley, seed, globs: [{ id, x0, y0, tx, ty, age, dur }], nextGlob }
//   stepBoss(w, dt, actors, recs)        HOST: one step -> recs  { t: 'boss', st, hp?, n?, how? } | { t: 'globs', list } | { t: 'globland', id, x, y }
//   applyBossRec(w, r)                   every screen
//   bossRect(boss) -> [x0, y0, x1, y1]   the body's box now (hot: tall; sinking / cooled: a low crust)       bossHot(boss) / bossCooled(boss) / bossDead(boss)
//   stompBoss(boss, actor) / coconutHitsBoss(boss, o)      the host's hit checks -> recs or null
//   tickBossClocks(w, dt)                REPLICAS (and the host): globs age, the state clock runs
import { PAGE_BOSS as B } from '../config.js';
import { support } from './platformerLogic.js';

const r2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function newBoss(spec, page = null) {
  return { x: spec.x, y: spec.y, arena0: spec.arena0, arena1: (page ? page.W : spec.arena0 + 30) - 2, hp: B.hp, max: B.hp, st: 'sleep', t: 0, left: 0, k: 0, volley: 0, seed: ((spec.seed | 0) || 7919) >>> 0, globs: [], nextGlob: 0, party: 1 };
}
const rnd = (b) => { b.seed = (Math.imul(b.seed, 1664525) + 1013904223) >>> 0; return b.seed / 4294967296; };

export const bossHot = (b) => !!b && (b.st === 'idle' || b.st === 'lob' || b.st === 'rise' || b.st === 'sink');
export const bossCooled = (b) => !!b && b.st === 'cooled';
export const bossDead = (b) => !!b && b.st === 'dead';
/** The body's box: tall and hot, a low grey crust while sinking / cooled, nothing when dead. */
export function bossRect(b) {
  const hw = B.w / 2;
  const h = b.st === 'cooled' || b.st === 'hurt' ? B.hCool : b.st === 'sink' ? B.hHot - (B.hHot - B.hCool) * clamp(b.t / B.sink, 0, 1) : b.st === 'dead' ? 0 : b.st === 'sleep' ? B.hCool + 0.4 : B.hHot;
  return [b.x - hw, b.y, b.x + hw, b.y + h];
}
/** The idle warning for a party of `n`. */
export const idleTime = (n) => Math.max(B.idleMin, B.idle - B.idleParty * (n - 1));
/** How many globs a volley has: base + one per hit taken (the boss gets angrier) + one per extra player, never more than globsMax. */
export const volleySize = (b, party) => Math.min(B.globsMax, B.globsBase + (b.max - b.hp) * B.perHit + Math.max(0, party - 1));

/** HOST: step the boss and its globs. actors = [{ key, x, y }] (tile coordinates of every player in the page). */
export function stepBoss(w, dt, actors, recs) {
  const b = w.boss;
  if (!b || b.st === 'dead') return;
  b.t += dt;
  for (const g of b.globs) g.age += dt;
  for (const g of b.globs.slice()) if (g.age >= g.dur) { recs.push({ t: 'globland', id: g.id, x: g.tx, y: g.ty }); b.globs.splice(b.globs.indexOf(g), 1); }
  const party = Math.max(1, actors.length);
  b.party = party;
  const go = (st, extra = {}) => { recs.push({ t: 'boss', st, ...extra }); b.st = st; b.t = 0; };      // (applied here too: the host's own rec is applied again by decide(); the apply is idempotent)
  switch (b.st) {
    case 'sleep':
      if (actors.some((a) => Math.abs(a.x - b.x) <= B.wake && a.y <= b.y + 8)) go('idle', { hp: b.hp });
      break;
    case 'idle':
      if (b.t >= idleTime(party)) go('lob', { n: volleySize(b, party) });                // (the rec's apply sets left / k and counts the volley: the same on every screen)
      break;
    case 'lob': {
      const due = b.k * B.lobGap;
      if (b.k < b.left && b.t >= due) {
        const list = [], aim = actors.length ? actors[b.k % actors.length] : { x: b.x - 6, y: b.y };
        const off = (b.k % 3 - 1) * B.spread + (rnd(b) - 0.5) * 0.8;
        const tx = r2(clamp(aim.x + off, b.arena0 + 1.5, b.arena1 - 0.5)), gy = support(w.grid, tx, w.page.H + 2, -1, 0.1);
        list.push({ id: b.nextGlob++, x0: r2(b.x), y0: r2(b.y + B.mouth), tx, ty: r2(gy === null ? b.y : gy), dur: B.flight });
        recs.push({ t: 'globs', list });
        b.k++;
        for (const g of list) b.globs.push({ ...g, age: 0 });          // (the rec re-applies it: applyBossRec skips ids it already has)
      }
      if (b.k >= b.left && b.t >= (b.left - 1) * B.lobGap + 0.5) go('sink');
      break;
    }
    case 'sink': if (b.t >= B.sink) go('cooled'); break;
    case 'cooled': if (b.t >= B.cooled) go('rise'); break;
    case 'hurt': if (b.t >= B.hurt) go('rise'); break;
    case 'rise': if (b.t >= B.rise) go('idle'); break;
    default: break;
  }
}

/** Every screen: apply a decided rec. Idempotent for the host (which stepped its own state before the rec came back round). */
export function applyBossRec(w, r) {
  const b = w.boss;
  if (!b) return;
  if (r.t === 'boss') {
    b.st = r.st; b.t = 0;
    if (Number.isFinite(r.hp)) b.hp = r.hp;
    if (r.st === 'lob' && Number.isFinite(r.n)) { b.left = r.n; b.k = 0; b.volley++; }
    if (r.st === 'idle' && r.how !== 'wake') b.left = 0;
    if (r.st === 'dead') { b.globs = []; b.hp = 0; }
  } else if (r.t === 'globs') {
    for (const g of r.list) if (!b.globs.some((x) => x.id === g.id)) { b.globs.push({ ...g, age: 0 }); b.nextGlob = Math.max(b.nextGlob, g.id + 1); }
  } else if (r.t === 'globland') {
    const i = b.globs.findIndex((g) => g.id === r.id);
    if (i >= 0) b.globs.splice(i, 1);
  }
}

/** A stomp on the cooled crust: the actor is above it and close. -> recs or null. */
export function stompBoss(b, a, slack = 0) {
  if (!b || b.st !== 'cooled') return null;
  const [x0, , x1, y1] = bossRect(b);
  if (a.x < x0 - 1.2 - slack || a.x > x1 + 1.2 + slack || a.y < y1 - 1.4 - slack || a.y > y1 + 3.2 + slack) return null;
  return hitRecs(b, 'stomp');
}
/** A thrown coconut (object o, in the air and fast) against the body: cooled = a hit, hot = it bounces off. -> 'hit' | 'bounce' | null */
export function coconutHitsBoss(b, o) {
  if (!b || b.st === 'dead' || b.st === 'sleep' || b.st === 'hurt') return null;
  const [x0, y0, x1, y1] = bossRect(b), r = B.coconutR;
  if (!(o.x + r > x0 && o.x - r < x1 && o.y + r > y0 && o.y - r < y1)) return null;
  return b.st === 'cooled' ? 'hit' : 'bounce';
}
export function hitRecs(b, how) {
  const hp = b.hp - 1;
  return hp <= 0 ? [{ t: 'boss', st: 'dead', hp: 0, how }, { t: 'bonus', n: 8, x: r2(b.x), y: r2(b.y + 2.4) }] : [{ t: 'boss', st: 'hurt', hp, how }];
}

/** Advance the animation clocks on a screen that does not decide (the state clock and the globs' flight). */
export function tickBossClocks(w, dt) {
  const b = w.boss;
  if (!b) return;
  b.t += dt;
  for (const g of b.globs) g.age = Math.min(g.dur + 0.5, g.age + dt);
}

export const bossSnapshot = (b) => (b ? { st: b.st, hp: b.hp, t: r2(b.t), left: b.left, k: b.k, volley: b.volley, seed: b.seed, nextGlob: b.nextGlob, globs: b.globs.map((g) => ({ id: g.id, x0: g.x0, y0: g.y0, tx: g.tx, ty: g.ty, dur: g.dur, age: r2(g.age) })) } : null);
export function bossLoad(b, s) {
  if (!b || !s) return;
  Object.assign(b, { st: s.st, hp: s.hp | 0, t: Number(s.t) || 0, left: s.left | 0, k: s.k | 0, volley: s.volley | 0, seed: (s.seed >>> 0) || b.seed, nextGlob: s.nextGlob | 0, globs: (s.globs || []).map((g) => ({ ...g })) });
}
export const bossHash = (b) => (b ? { st: b.st, hp: b.hp, volley: b.volley, globs: b.globs.map((g) => g.id) } : null);
