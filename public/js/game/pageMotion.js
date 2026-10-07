// Things that MOVE on a storybook page (Step 52a): leaf and log platforms, wind gusts, the tide, and the Bloom Moment's clock. PURE (no three.js / DOM; Node-tested in
// test/pageMotion.test.js). Everything is a deterministic function of the page clock `t` (seconds since the page opened, the HOST's run clock: game/storybook.js keeps every screen
// on it), so all screens and the validator agree on where a platform is, whether a gust blows and how high the tide stands. Page files declare them as data (game/pageFormat.js):
//
//   movers: [{ kind: 'leaf', x0, y0, x1, y1, w?, period, phase? }]   a one-way platform (centre x, TOP y, w tiles wide) that glides between two points and back (smooth ping-pong)
//           [{ kind: 'log', x0, x1, dy?, w?, period, phase? }]       a floating log: drifts between x0 and x1 and bobs with the tide (top y = tide level + dy; needs page.tide)
//   gusts:  [{ x0, x1, y0, y1, dir: 1 | -1, period, on, phase? }]    a wind zone: it blows for the fraction `on` of every `period` seconds (fading in / out) toward `dir`
//   tide:   { x0, x1, low, high, period, phase? }                    water that rises and falls over [x0, x1]: its surface y is between low and high; wading is slower, never harmful
//   waters: [{ x0, x1, top }]                                        deep channels (no floor): falling below `top` is a pit with a splash
//
//   tideLevel(tide, t)                    the water surface y            moverPos(m, t, tide) -> { x, y }   a mover's centre x and top y
//   moverHeads(page, t) -> [{ id, x, top, half, solid: true, mover }]   the platforms as headStep() surfaces (game/platformerLogic.js)
//   gustAt(g, t) -> k 0..1                how hard the gust blows now      windAt(page, x, y, t) -> { vx, lift }   the wind on a body at tile (x, y)
//   wadeAt(page, x, y, t)                 true when a body at (x, y) stands in tide water
//   moverCells(page) -> Set("cx,cy")      every cell a body can ever stand on a platform at (the validator's union model: injected as VIRTUAL standable cells, see game/pageFormat.js)
//   Bloom Moments (a Night-Bloom flower the party touches turns the page into a glowing night for PAGE_BLOOM.dur seconds):
//   bloomState(bloom, t) -> { active, age, left }     bloomCanStart(bloom, t)      bloomStart(bloom, t) -> { t0, n }      bloomLook(bloom, t) -> 0..1 (the night look, eased)
//   swingK(age)                           0..1..0 bump of the camera swing into 3D during the first PAGE_BLOOM.swing seconds
import { PAGE_MOTION as M, PAGE_BLOOM as B, PLATFORMER as P } from '../config.js';
import { SOLID, headStep } from './platformerLogic.js';

const TAU = Math.PI * 2;
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (k) => k * k * (3 - 2 * k);
/** A smooth ping-pong: 0 at t = 0, 1 half a period later. */
export const wave = (t, period, phase = 0) => 0.5 - 0.5 * Math.cos(TAU * (t / period + phase));

export const tideLevel = (tide, t) => (tide ? lerp(tide.low, tide.high, wave(t, tide.period, tide.phase || 0)) : 0);

export function moverPos(m, t, tide = null) {
  const k = wave(t, m.period, m.phase || 0);
  if (m.kind === 'log') return { x: lerp(m.x0, m.x1, k), y: (tide ? tideLevel(tide, t) : (m.y0 ?? 0)) + (m.dy || 0) };
  return { x: lerp(m.x0, m.x1, k), y: lerp(m.y0, m.y1, k) };
}
export const moverHalf = (m) => (m.w || M.leafW) / 2;

export function moverHeads(page, t) {
  const out = [];
  (page.movers || []).forEach((m, i) => { const p = moverPos(m, t, page.tide); out.push({ id: `m${i}`, x: p.x, top: p.y, half: moverHalf(m), solid: true, mover: i }); });
  return out;
}

export function gustAt(g, t) {
  const u = (((t / g.period + (g.phase || 0)) % 1) + 1) % 1;
  if (u >= g.on) return 0;
  const ramp = Math.min(g.on / 2, M.gust.ramp / g.period);
  return clamp01(Math.min(u / ramp, (g.on - u) / ramp));
}
export function windAt(page, x, y, t) {
  let vx = 0, lift = 0;
  for (const g of page.gusts || []) {
    if (x < g.x0 || x > g.x1 || y < g.y0 || y > g.y1) continue;
    const k = gustAt(g, t);
    if (k > 0) { vx += g.dir * M.gust.speed * k; lift += M.gust.lift * k; }
  }
  return { vx, lift };
}
export function wadeAt(page, x, y, t) {
  const td = page.tide;
  return !!td && x >= td.x0 && x <= td.x1 && y < tideLevel(td, t) - 0.15;
}
export const inWater = (page, x, y) => (page.waters || []).some((w) => x >= w.x0 && x <= w.x1 && y < w.top - M.waterSplash);

/** The validator's union model: every cell a platform can ever be stood on at (a standing cell's centre within the platform, a little inside its ends). -> Set of "cx,cy" (the body's feet cell). */
export function moverCells(page) {
  const out = new Set(), movers = page.movers || [];
  if (!movers.length) return out;
  const periods = movers.map((m) => Math.round(m.period)).concat(page.tide ? [Math.round(page.tide.period)] : []);
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  let T = periods.reduce((a, b) => (a * b) / gcd(a, b), 1);
  T = Math.min(T, 600);
  for (const m of movers) {
    const half = moverHalf(m) - 0.3;
    for (let t = 0; t <= T + 1e-6; t += M.logSamples) {
      const p = moverPos(m, t, page.tide), top = Math.floor(p.y + 1e-6);
      for (let cx = Math.ceil(p.x - half - 0.5); cx + 0.5 <= p.x + half + 1e-9; cx++) out.add(`${cx},${top}`);
    }
  }
  return out;
}
/** The extreme positions of a platform (for the visuals' culling and the tests): { x0, x1, y0, y1 } of its centre / top. */
export function moverBounds(m, tide = null) {
  if (m.kind === 'log') { const lo = (tide ? tide.low : (m.y0 ?? 0)) + (m.dy || 0), hi = (tide ? tide.high : (m.y0 ?? 0)) + (m.dy || 0); return { x0: Math.min(m.x0, m.x1), x1: Math.max(m.x0, m.x1), y0: lo, y1: hi }; }
  return { x0: Math.min(m.x0, m.x1), x1: Math.max(m.x0, m.x1), y0: Math.min(m.y0, m.y1), y1: Math.max(m.y0, m.y1) };
}

// ---- Bloom Moments ---------------------------------------------------------------------------------------------------------------------------------------
/** bloom = { t0, n } (page-clock seconds of the start, how many times it was started) or null. */
export function bloomState(bloom, t) {
  if (!bloom || !Number.isFinite(bloom.t0)) return { active: false, age: 0, left: 0 };
  const age = t - bloom.t0;
  return { active: age >= 0 && age < B.dur, age, left: Math.max(0, B.dur - age) };
}
export const bloomCanStart = (bloom, t) => !bloom || !Number.isFinite(bloom.t0) || t >= bloom.t0 + B.dur + B.cooldown;
export const bloomStart = (bloom, t) => ({ t0: Math.round(t * 100) / 100, n: ((bloom && bloom.n) | 0) + 1 });
/** How "night" the page looks: eased in over PAGE_BLOOM.fade after the start, eased out over the same time before the end. */
export function bloomLook(bloom, t) {
  const s = bloomState(bloom, t);
  if (!s.active) return 0;
  return smooth(clamp01(Math.min(s.age / B.fade, s.left / B.fade)));
}
export const swingK = (age) => (age < 0 || age > B.swing ? 0 : Math.pow(Math.sin(Math.PI * (age / B.swing)), 2));

// ---- riding ------------------------------------------------------------------------------------------------------------------------------------------------
// A body rides a platform exactly like a friend's head (game/platformerLogic.js headStep: land / stand / ride), and is carried along by the platform's own motion since last frame.
// st = { on, rideLast } is the caller's per-body memory (game/pagePlayers.js keeps it on its state record).
const solidAtXY = (grid, x, y) => grid.at(Math.floor(x), Math.floor(y)) === SOLID;
/** Move the body with the head / platform it stood on (the platform's x since last frame), never into a wall. */
export function carryRider(grid, b, heads, st) {
  if (!st.on || !st.rideLast || st.rideLast.id !== st.on) return;
  const h = heads.find((x) => x.id === st.on);
  if (!h) return;
  const dx = h.x - st.rideLast.x;
  if (Math.abs(dx) < 1.5 && !solidAtXY(grid, b.x + dx + Math.sign(dx) * P.half, b.y + 0.3) && !solidAtXY(grid, b.x + dx + Math.sign(dx) * P.half, b.y + P.height - 0.2)) b.x += dx;
}
/** carry + headStep + bookkeeping, after the body's own step. -> headStep's { on, kind, head, impact }. */
export function ridePlatforms(grid, b, pre, heads, st, o = {}) {
  carryRider(grid, b, heads, st);
  const res = headStep(b, pre, heads, st.on, o);
  st.on = res.on;
  if (res.kind === 'ride' || res.kind === 'land') { st.rideLast = { id: res.on, x: res.head.x, y: res.head.top }; b.px = b.x; b.py = b.y; }
  else st.rideLast = null;
  return res;
}
