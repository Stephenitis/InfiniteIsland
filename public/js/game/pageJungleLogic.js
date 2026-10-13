// Emberleaf Canopy's RULES (Step 53a): PURE (no three.js / DOM), Node-tested in test/jungle.test.js. Vine swings, coconut cannons, the canoe river and rising lava. The body physics stay in
// game/platformerLogic.js (inputs `ballistic` and `canoe`); the runtime is game/pagePlayers.js; the page format and validator (game/pageFormat.js) use the sampling helpers here. Everything is a
// deterministic function of the PAGE CLOCK (the host's run clock, game/pageMotion.js) and the run state (run.canoe, run.lava), so every screen and the validator agree. Coordinates are TILE
// coordinates (x right, y up) like the rest of the page code. Page data (all optional):
//
//   vines:   [{ x, y, len }]                         a rope hanging from (x, y) down `len` tiles
//   cannons: [{ x, y, a0, a1?, period?, phase?, mode: 'fixed' | 'spin' | 'auto', delay?, speed? }]     (x, y) = the barrel's middle; angles in DEGREES (0 = right, 90 = up); a spin cannon turns from a0 to a1 and back on the page clock
//   canoes:  [{ x0, x1, y, logs: [x, ...], branches: [x, ...] }]     a river from x0 to x1 (water below y, a pit); the canoe's deck is at y; logs float in the river, boughs hang over it
//   lava:    { x0, x1, from, to?, top }                a shaft [x0, x1] where lava rises (from the moment campfire `from` is lit; `to` = the last campfire of the climb; `top` = how high it may get)
//
//   VINES        vineGrab(v, body)                      the rope length a body's hand would grab at, or null                swingStart(v, i, body) -> sw { i, len, th, w }
//                swingStep(sw, move, dt)                one step (pendulum + the stick's pump)                              swingBody(v, sw) -> { x, y, vx, vy }   the body's feet and velocity
//                swingRelease(v, sw) -> { x, y, vx, vy }   what Jump lets go with                                          swingBlocked(grid, v, sw)  the body would be inside a wall
//                vineOutcomes(page, i) -> { lands: [{ cx, cy }], links: [{ type, i }], paths: [[x, y]...], pits }   every release of a swing bot, simulated with the real step (cached per page)
//   CANNONS      cannonAngle(c, t) / cannonShot(c, t) / cannonAutoAt(c) / cannonLoads(c, body)       cannonOutcomes(page, i) -> { lands, links, paths, pits }   shots at every aim the barrel passes
//   CANOE        canoeCenter(c, run, clock, i) / canoeDocked / canoeHeads(page, run, clock) / canoeHazard(c, body) / canoeReset(...) the host's put-back rule        simulateCanoe(page, canoe) -> { ok, reason, steps }
//   LAVA         lavaLevel(lv, state, clock) / lavaStart(lv, fire, clock) / lavaTouches(lv, body, y) / lavaClimb(page, graph...)       checks that a calm climb outpaces it
import { PAGE_JUNGLE as J, PLATFORMER as P } from '../config.js';
import { SOLID, createBody, stepBody } from './platformerLogic.js';
import { wave, ridePlatforms } from './pageMotion.js';

const DEG = Math.PI / 180, clamp = (v, a, b) => Math.min(b, Math.max(a, v)), r2 = (v) => Math.round(v * 100) / 100;

// ---- vines ---------------------------------------------------------------------------------------------------------------------------------------------------
/** The rope length a body would grab at (hand within `grab` of the rope, between `minLen` and the rope's end), or null. The body must be airborne (checked by the caller). */
export function vineGrab(v, b) {
  const V = J.vine, hx = b.x, hy = b.y + V.hand, len = v.y - hy;
  if (Math.abs(hx - v.x) > V.grab || len < V.minLen - 0.05 || len > v.len + 0.25) return null;
  return clamp(len, V.minLen, v.len);
}
/** A swing begun by a body (position and velocity kept: the tangential part of its speed becomes the swing). */
export function swingStart(v, i, b) {
  const len = vineGrab(v, b) ?? clamp(v.y - (b.y + J.vine.hand), J.vine.minLen, v.len);
  const th = Math.asin(clamp((b.x - v.x) / len, -0.9, 0.9));
  const w = clamp(((b.vx || 0) * Math.cos(th) + (b.vy || 0) * Math.sin(th)) / len, -4.5, 4.5);
  return { i, len, th, w, t: 0 };
}
/** One fixed step of the pendulum; `move` (-1..1) is the stick: pushing along the swing's motion builds it up, pushing against it brakes a little. */
export function swingStep(sw, move, dt) {
  const V = J.vine, h = dt / V.sub;
  for (let k = 0; k < V.sub; k++) {
    const dir = Math.abs(sw.w) > 0.12 ? Math.sign(sw.w) : Math.sign(move || 0);
    const push = (V.pump / sw.len) * (move || 0) * ((move || 0) * dir >= 0 ? 1 : 0.35);
    sw.w += (-(V.gravity / sw.len) * Math.sin(sw.th) + push - V.damp * sw.w) * h;
    sw.th += sw.w * h;
    if (Math.abs(sw.th) > V.maxAng) { sw.th = Math.sign(sw.th) * V.maxAng; if (sw.w * sw.th > 0) sw.w = 0; }
  }
  sw.t += dt;
}
/** The body of a swinger: feet (x, y) and velocity. */
export function swingBody(v, sw) {
  const s = Math.sin(sw.th), c = Math.cos(sw.th);
  return { x: v.x + sw.len * s, y: v.y - sw.len * c - J.vine.hand, vx: sw.len * sw.w * c, vy: sw.len * sw.w * s };
}
export function swingRelease(v, sw) {
  const b = swingBody(v, sw), V = J.vine;
  return { x: b.x, y: b.y, vx: b.vx * V.boost, vy: b.vy * V.boost + V.up };
}
/** Is the swinger's body box inside a wall? (the runtime lets go there) */
export function swingBlocked(grid, v, sw) {
  const b = swingBody(v, sw);
  for (let cy = Math.floor(b.y + 0.05); cy <= Math.floor(b.y + P.height - 0.05); cy++) for (let cx = Math.floor(b.x - P.half + 0.02); cx <= Math.floor(b.x + P.half - 0.02); cx++) if (grid.at(cx, cy) === SOLID) return true;
  return false;
}
/** The rope the others see (for the visuals): the hand's point for a swing state. */
export const swingHand = (v, sw) => ({ x: v.x + sw.len * Math.sin(sw.th), y: v.y - sw.len * Math.cos(sw.th) });

// ---- shared flight sampling (vine releases and cannon shots, with the real step) --------------------------------------------------------------------------------
/**
 * Fly a body from feet (x, y) with velocity (vx, vy) under the REAL physics until it lands, falls into a pit, enters another cannon / vine (a link) or runs out of time.
 * opts: { ballistic, steer (move toward travel), cannons, vines, skip: { type, i } }. -> { kind: 'land' | 'pit' | 'cannon' | 'vine' | 'time', cx, cy, i, path, hurt }
 */
export function flight(grid, x, y, vx, vy, opts = {}) {
  const b = createBody(x, y); b.vx = vx; b.vy = vy; b.grounded = false;
  const path = [[r2(x), r2(y + 0.7)]], cannons = opts.cannons || [], vines = opts.vines || [], skip = opts.skip || {};
  let hurt = false;
  for (let f = 0; f < 420; f++) {
    stepBody(grid, b, { move: opts.steer ? Math.sign(opts.steer === true ? b.vx : opts.steer) * 0.8 : 0, ballistic: !!opts.ballistic });
    if (f % 4 === 0) path.push([r2(b.x), r2(b.y + 0.7)]);
    for (const e of b.ev) if (e.kind === 'hazard') hurt = true;
    b.ev.length = 0;
    if (f > 6) {
      for (let k = 0; k < cannons.length; k++) if (!(skip.type === 'cannon' && skip.i === k) && Math.hypot(cannons[k].x - b.x, cannons[k].y - (b.y + 0.7)) <= J.cannon.r * 0.8) return { kind: 'cannon', i: k, path, hurt };
      for (let k = 0; k < vines.length; k++) if (!(skip.type === 'vine' && skip.i === k) && vineGrab(vines[k], b) !== null && b.vy < 3) return { kind: 'vine', i: k, path, hurt };
    }
    if (b.grounded && f > 2) return { kind: 'land', cx: Math.floor(b.x), cy: Math.floor(b.y + 0.01), x: b.x, path, hurt };
    if (b.y < -2.5) return { kind: 'pit', path, hurt };
  }
  return { kind: 'time', path, hurt };
}
function collect(outs) {
  const lands = new Map(), links = new Map(), paths = [];
  let pits = 0;
  for (const o of outs) {
    if (o.kind === 'land') lands.set(`${o.cx},${o.cy}`, { cx: o.cx, cy: o.cy });
    else if (o.kind === 'cannon' || o.kind === 'vine') links.set(`${o.kind}${o.i}`, { type: o.kind, i: o.i });
    else if (o.kind === 'pit') pits++;
    paths.push(o.path);
  }
  return { lands: [...lands.values()], links: [...links.values()], paths, pits };
}
const _cache = new WeakMap();
const cached = (page, key, make) => { let m = _cache.get(page); if (!m) { m = new Map(); _cache.set(page, m); } if (!m.has(key)) m.set(key, make()); return m.get(key); };

/** Every place a swing bot's Jump could let go of vine `i`: the swing is started from rest at the rope's end and at 70 % of it, pumped in either direction, released every 0.15 s; each release is flown with the real step. */
export function vineOutcomes(page, i) {
  return cached(page, `vine${i}`, () => {
    const v = page.vines[i], grid = page.grid, outs = [], opts = { cannons: page.cannons || [], vines: page.vines || [], skip: { type: 'vine', i } };
    for (const lenK of [1, 0.7]) for (const dir of [1, -1]) {
      const len = Math.max(J.vine.minLen, v.len * lenK), sw = { i, len, th: dir * 0.12, w: dir * 0.5, t: 0 }, pts = [];
      outs.push({ kind: 'swing', path: pts });
      for (let f = 0; f < 60 * 7; f++) {
        swingStep(sw, swingBotMove(sw, dir), P.step);
        if (f % 6 === 0) { const sb = swingBody(v, sw); pts.push([r2(sb.x), r2(sb.y + 0.7)]); }
        if (swingBlocked(grid, v, sw)) { if (f > 20) { const r = swingRelease(v, sw); outs.push(flight(grid, r.x, r.y, r.vx, r.vy, { ...opts, steer: true })); } break; }
        if (f % 9 === 0 && f > 20) {
          const r = swingRelease(v, sw);
          if (!pointInSolid(grid, r.x, r.y)) for (const steer of [false, true]) outs.push(flight(grid, r.x, r.y, r.vx, r.vy, { ...opts, steer }));
        }
      }
    }
    return collect(outs);
  });
}
/** The swing bot: push along the swing's motion (or toward `dir` while it hangs still). */
export const swingBotMove = (sw, dir = 1) => (Math.abs(sw.w) > 0.05 ? Math.sign(sw.w) : dir);
const pointInSolid = (grid, x, y) => { for (let cy = Math.floor(y + 0.05); cy <= Math.floor(y + P.height - 0.05); cy++) for (let cx = Math.floor(x - P.half + 0.02); cx <= Math.floor(x + P.half - 0.02); cx++) if (grid.at(cx, cy) === SOLID) return true; return false; };

// ---- cannons -------------------------------------------------------------------------------------------------------------------------------------------------
/** The barrel's angle (radians) at page-clock time t. */
export function cannonAngle(c, t) {
  if (c.mode === 'spin') return (c.a0 + (c.a1 - c.a0) * wave(t, c.period || 3.6, c.phase || 0)) * DEG;
  return c.a0 * DEG;
}
/** A shot at page-clock time t: the feet (the body's middle is the barrel's middle) and the velocity. */
export function cannonShot(c, t) {
  const a = cannonAngle(c, t), sp = c.speed || J.cannon.speed;
  return { x: c.x, y: c.y - 0.7, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, angle: a };
}
export const cannonAutoAt = (c) => (c.mode === 'auto' ? c.delay || J.cannon.auto : null);
/** Is a body's middle inside the cannon's mouth? */
export const cannonLoads = (c, b) => Math.hypot(c.x - b.x, c.y - (b.y + 0.7)) <= J.cannon.r;
/** Every aim a cannon passes (a spin cannon: 13 samples across its sweep) flown with the real step, ballistic. */
export function cannonOutcomes(page, i) {
  return cached(page, `cannon${i}`, () => {
    const c = page.cannons[i], outs = [], opts = { ballistic: true, cannons: page.cannons, vines: page.vines || [], skip: { type: 'cannon', i } };
    const angles = c.mode === 'spin' ? Array.from({ length: 13 }, (_, k) => c.a0 + (c.a1 - c.a0) * (k / 12)) : [c.a0];
    for (const a of angles) {
      const sp = c.speed || J.cannon.speed;
      outs.push(flight(page.grid, c.x, c.y - 0.7, Math.cos(a * DEG) * sp, Math.sin(a * DEG) * sp, opts));
    }
    return collect(outs);
  });
}

// ---- the canoe -----------------------------------------------------------------------------------------------------------------------------------------------
/** The canoe's centre x. run.canoe = { i, t0 } once it left the west bank (the host sets it when somebody boards); until then (or after a reset) it is parked at the west bank. */
export function canoeCenter(c, run, clock, i = 0) {
  const half = J.canoe.half, a = c.x0 + half, z = c.x1 - half;
  const st = run && run.canoe;
  if (!st || st.i !== i || !Number.isFinite(st.t0)) return a;
  return clamp(a + J.canoe.speed * (clock - st.t0), a, z);
}
export const canoeDocked = (c, run, clock, i = 0) => canoeCenter(c, run, clock, i) >= c.x1 - J.canoe.half - 1e-6 && !!(run && run.canoe && run.canoe.i === i);
export const canoeStarted = (run, i = 0) => !!(run && run.canoe && run.canoe.i === i && Number.isFinite(run.canoe.t0));
/** The canoes as riding surfaces (game/platformerLogic.js headStep via pageMotion ridePlatforms): { id, x, top, half, solid: true, canoe: i }. */
export function canoeHeads(page, run, clock) {
  return (page.canoes || []).map((c, i) => ({ id: `canoe${i}`, x: canoeCenter(c, run, clock, i), top: c.y, half: J.canoe.half, solid: true, canoe: i }));
}
const rectsOverlap = (b, h, x0, y0, x1, y1) => b.x + P.half - 0.05 > x0 && b.x - P.half + 0.05 < x1 && b.y + h > y0 && b.y < y1;
/** A floating log or a low bough against a rider's body: 'log' | 'branch' | null (the client decides the hurt). A ducked body is `duckH` tall. */
export function canoeHazard(c, b) {
  if (b.x < c.x0 - 1 || b.x > c.x1 + 1) return null;
  const h = b.duck ? J.canoe.duckH : P.height;
  for (const x of c.logs || []) if (rectsOverlap(b, h, x - J.canoe.logW / 2, c.y - 0.2, x + J.canoe.logW / 2, c.y + J.canoe.logH)) return 'log';
  for (const x of c.branches || []) if (rectsOverlap(b, h, x - J.canoe.branchW / 2, c.y + J.canoe.branchLow, x + J.canoe.branchW / 2, c.y + J.canoe.branchHigh)) return 'branch';
  return null;
}
/** The host's put-back rule: a canoe that left and has not docked goes back to the west bank when nobody is near it for `resetS` s. `players` = [{ x }] (tile x of every living player). -> the new idle time, or -1 = reset now */
export function canoeIdle(c, run, clock, i, players, idle, dt) {
  if (!canoeStarted(run, i) || canoeDocked(c, run, clock, i)) return 0;
  const cx = canoeCenter(c, run, clock, i);
  const near = players.some((p) => p.x >= cx - J.canoe.nearX && p.x <= c.x1 + 0.5);
  const next = near ? 0 : idle + dt;
  return next >= J.canoe.resetS ? -1 : next;
}
/** A rider who hops off the deck keeps the canoe's speed (the same frame of reference as the logs): the body is carried sideways at the canoe's speed while it is in the air over a moving canoe. -> vx (0 when none) */
export function canoeWind(page, run, clock, b) {
  for (let i = 0; i < (page.canoes || []).length; i++) {
    const c = page.canoes[i];
    if (!canoeStarted(run, i) || canoeDocked(c, run, clock, i)) continue;
    if (Math.abs(b.x - canoeCenter(c, run, clock, i)) <= J.canoe.half + 2.4 && b.y >= c.y - 0.4 && b.y <= c.y + 7) return J.canoe.speed;
  }
  return 0;
}
/** Is a body standing on / near the canoe so a boarding request is fair? */
export const canoeBoardable = (c, run, clock, i, b) => !canoeStarted(run, i) && Math.abs(b.x - canoeCenter(c, run, clock, i)) <= J.canoe.half + 0.5 && b.y >= c.y - 0.3 && b.y <= c.y + 2.5;

/**
 * A bot rides the canoe from the west bank with the REAL physics: it walks onto the canoe, then jumps floating logs and ducks boughs on a safe schedule (like a calm player) and steps off onto the east bank.
 * -> { ok, reason?, steps, hits }. The validator and test/jungle.test.js use it; a river it cannot finish is a broken page.
 */
export function simulateCanoe(page, c, i = 0, trace = null) {
  const grid = page.grid, run = { canoe: { i, t0: 0 } }, heads = [];
  const startX = c.x0 - 1.2, b = createBody(startX, c.y); b.grounded = true;
  const st = { on: null, rideLast: null };
  let clock = 0, hits = 0, jumpAt = -9;
  const docked = () => canoeDocked(c, run, clock, i);
  for (let f = 0; f < 60 * 140; f++) {
    clock = f * P.step;
    const ctr = canoeCenter(c, f ? run : { canoe: { i, t0: 1e9 } }, clock, i);
    heads.length = 0; heads.push({ id: 'canoe', x: ctr, top: c.y, half: J.canoe.half, solid: true });
    // the bot: walk onto the canoe's middle, then stay put (a rider is carried along); jump when a log is 0.7..1.4 tiles ahead, duck while a bough is within 1.4 tiles
    let move = 0, jump = false, down = false;
    const onCanoe = st.on === 'canoe';
    if (!onCanoe && !docked()) move = ctr - b.x > 0.3 ? 1 : ctr - b.x < -0.3 ? -1 : 0;
    else if (onCanoe) { move = clamp((ctr - b.x) * 2, -0.5, 0.5); }
    if (onCanoe && b.grounded) {
      for (const x of c.logs || []) { const d = x - b.x; if (d > 0.7 && d < 1.4 && clock - jumpAt > 0.5) { jump = true; jumpAt = clock; } }
      for (const x of c.branches || []) { const d = x - b.x; if (d > -1.1 && d < 1.7) down = true; }
    }
    if (docked() && onCanoe) move = 1;
    const pre = { y: b.y, vy: b.vy };
    const wv = !st.on && !b.grounded && !docked() && Math.abs(b.x - ctr) <= J.canoe.half + 2.4 && b.y >= c.y - 0.4 ? J.canoe.speed : 0;
    stepBody(grid, b, { move, down, jumpPressed: jump, jumpHeld: jump || !b.grounded, canoe: true, wind: wv ? { vx: wv, lift: 0 } : null });
    const hz = b.ev.find((e) => e.kind === 'hazard'); b.ev.length = 0;
    ridePlatforms(grid, b, pre, heads, st, {});
    if (trace) trace(f, b, st, ctr, jump);
    if (hz) return { ok: false, reason: 'thorns in the river', steps: f, hits };
    if (canoeHazard(c, b)) { hits++; return { ok: false, reason: `a ${canoeHazard(c, b)} hits the bot at ${r2(b.x)}`, steps: f, hits }; }
    if (b.y < c.y - 1.2 && b.x > c.x0 - 0.5 && b.x < c.x1) return { ok: false, reason: `the bot fell into the river at ${r2(b.x)}`, steps: f, hits };
    if (b.x >= c.x1 + 0.6 && b.grounded && Math.abs(b.y - c.y) < 0.6) return { ok: true, steps: f, hits };
  }
  return { ok: false, reason: 'the canoe never reached the east bank', steps: 60 * 140, hits };
}

// ---- rising lava ---------------------------------------------------------------------------------------------------------------------------------------------
/** run.lava = { t0, base } (page-clock start and the level it started at) or null (not started). -> the lava's top y at clock t, or null. */
export function lavaLevel(lv, state, clock) {
  if (!lv || !state || !Number.isFinite(state.t0) || !Number.isFinite(state.base)) return null;
  return Math.min(lv.top, state.base + J.lava.rate * Math.max(0, clock - state.t0));
}
/** The lava started (or reset) under campfire `fire` ({ y }) at clock t: `gap` tiles below it. */
export const lavaStart = (lv, fire, clock) => ({ t0: r2(clock), base: r2(fire.y - J.lava.gap) });
/** Does a campfire's lighting (or a player sent back to it) start / reset the lava? */
export const lavaFires = (lv, idx) => !!lv && idx >= lv.from && (lv.to === undefined || idx <= lv.to);
/** A body in the shaft below the lava's surface (the feet a little under it). */
export const lavaTouches = (lv, b, y) => y !== null && b.x >= lv.x0 && b.x <= lv.x1 && b.y + J.lava.margin < y;
export const lavaNorm = (raw) => (raw && Number.isFinite(Number(raw.t0)) && Number.isFinite(Number(raw.base)) ? { t0: r2(Number(raw.t0)), base: r2(Number(raw.base)) } : null);

/**
 * A calm climb outpaces the lava: for each climb segment (campfire k -> k + 1, k from lv.from) the fastest route over the validator's graph costs `time`; a climber at `slack` x that pace (half speed) must
 * stay at least 1 tile above the lava all the way, starting from lava = fire.y - gap at the lighting. -> { ok, reason?, worst }
 */
export function lavaClimb(page, graph, fwd) {
  const lv = page.lava;
  if (!lv) return { ok: true, worst: Infinity };
  let worst = Infinity;
  const fires = page.campfires;
  for (let k = lv.from; k < (lv.to ?? fires.length - 1) && k + 1 < fires.length; k++) {
    const a = graph.id(Math.floor(fires[k].x), Math.floor(fires[k].y)), z = graph.id(Math.floor(fires[k + 1].x), Math.floor(fires[k + 1].y));
    if (a === undefined || z === undefined) return { ok: false, reason: `campfire ${k} or ${k + 1} is not on standable ground`, worst };
    const dist = new Float64Array(graph.cells.length).fill(Infinity), prev = new Int32Array(graph.cells.length).fill(-1), open = [a];
    dist[a] = 0;
    while (open.length) {
      let bi = 0; for (let q = 1; q < open.length; q++) if (dist[open[q]] < dist[open[bi]]) bi = q;
      const u = open.splice(bi, 1)[0];
      for (const v of graph.adj[u]) {
        const A = graph.cells[u], B = graph.cells[v], dx = Math.abs(A.cx - B.cx), dy = B.cy - A.cy;
        const walk = dx === 1 && Math.abs(dy) <= 1 && !A.pseudo && !B.pseudo;
        const cost = walk ? 0.14 : 0.45 + 0.1 * dx + 0.18 * Math.max(0, dy) + 0.05 * Math.max(0, -dy);
        if (dist[u] + cost < dist[v]) { dist[v] = dist[u] + cost; prev[v] = u; open.push(v); }
      }
    }
    if (!isFinite(dist[z])) return { ok: false, reason: `the climb from campfire ${k} to ${k + 1} is not reachable`, worst };
    let n = z; const route = [];
    while (n >= 0) { route.push(n); n = prev[n]; }
    route.reverse();
    const t0 = fires[k].y - J.lava.gap;
    for (const ni of route) {
      const t = dist[ni] / J.lava.slack, c = graph.cells[ni], lava = t0 + J.lava.rate * t;
      worst = Math.min(worst, c.cy - lava);
      if (c.cy - lava < 1) return { ok: false, reason: `a calm climber (half speed) is caught by the lava at ${c.cx},${c.cy} on the way from campfire ${k} to ${k + 1} (${r2(c.cy - lava)} tiles above it)`, worst };
    }
  }
  return { ok: true, worst };
}
