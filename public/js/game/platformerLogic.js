// The platformer core (Step 49): PURE rules for one side-scrolling body on a tile grid. No three.js / DOM, so Node tests it (test/platformer.test.js).
// Players in a storybook page are boxes (0.6 x 1.4 u, feet at the bottom centre) moving on a 1 u tile grid at a fixed 60 Hz; game/pagePlayers.js feeds them the
// players' input and copies the result onto the characters. Coordinates here are TILE coordinates: x to the right, y UP, tile (cx, cy) covers x cx..cx+1, y cy..cy+1.
//
//   Tiles (one char each, see game/pageFormat.js for the page file):
//     '.' empty   '#' solid   '=' one-way plank (land from above, pass from below, down + Jump drops through)   '/' '\' 45-degree slopes (the floor rises / falls to the right)
//     '^' thorns (hurt, pass-through)   'S' spring flower (launches higher; pass-through trigger on the cell's bottom 0.45)
//   createGrid(rows)                 rows = strings TOP row first -> { W, H, at(cx, cy) } (outside the page: solid walls left / right, empty above and below = pits)
//   createBody(x, y)                 { x, y, vx, vy, grounded, face, ev, ... }
//   advance(grid, body, input, dt)   accumulate dt, run fixed steps (capped), input = { move: -1..1, down, jumpPressed, jumpHeld }; body.ev = this call's events:
//                                    jump | land {v} | bonk | bounce | drop | hazard {cx, cy} | fell
//   stepBody(grid, body, input, dt)  exactly one fixed step (what advance loops over)
//   bounce(body, vy)                 launch the body (springs, head bounces later); hurtBody(body, dir) knock-back + stun
//   groundBelow(grid, x, y)          the floor height straight under a point (for blob shadows), or null over a pit
//   LIMITS                           derived from PLATFORMER by simulation: { apex, maxUp, maxGap, reach(dy), springApex, springMaxUp, ... } for the page validator
// Movement rules: acceleration / friction with an analog stick (walk vs run), weaker air control, variable jump height (releasing Jump caps the rise), coyote time,
// jump buffer, terminal fall speed, head bonk, per-axis sweeps in chunks of at most 0.25 tile (no tunnelling), a 0.6 tile step-up so slopes meet flat tops smoothly,
// and slope snapping so walking downhill never bounces.
import { PLATFORMER as P, WALK_THRESHOLD } from '../config.js';

export const SOLID = 35, ONEWAY = 61, SLOPE_R = 47, SLOPE_L = 92, THORN = 94, SPRING = 83, EMPTY = 46;   // char codes of # = / \ ^ S .
const EPS = 1e-4, CHUNK = 0.25, SPRING_H = 0.45;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const approach = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));

export function createGrid(rows) {
  const H = rows.length, W = Math.max(...rows.map((r) => r.length));
  const cells = new Uint8Array(W * H);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) cells[(H - 1 - r) * W + c] = (rows[r][c] || '.').charCodeAt(0);
  return {
    W, H, cells,
    at(cx, cy) {
      if (cx < 0 || cx >= W) return SOLID;
      if (cy < 0 || cy >= H) return EMPTY;
      return cells[cy * W + cx];
    },
  };
}

export function createBody(x = 0, y = 0) {
  return {
    x, y, px: x, py: y, vx: 0, vy: 0, grounded: false, face: 1, jumping: false,
    coyote: 0, buffer: 0, dropT: 0, stun: 0, acc: 0, air: 0, dead: false, ev: [], onWay: false,
  };
}

// ---- floor queries --------------------------------------------------------------------------------------------------------------------------------------
/** The highest floor surface in [yMin, yTop] under a body at x: solids and (unless `ignoreWay`) planks across its width, slopes at its centre. null = none. */
function support(grid, x, yTop, yMin, hw, ignoreWay = false) {
  let best = -Infinity;
  const c0 = Math.floor(x - hw + 1e-6), c1 = Math.floor(x + hw - 1e-6), cc = Math.floor(x);
  for (let cy = Math.floor(yTop + EPS); cy >= Math.floor(yMin - EPS) - 1; cy--) {
    for (let cx = c0; cx <= c1; cx++) {
      const ch = grid.at(cx, cy);
      let top;
      if (ch === SOLID) top = cy + 1;
      else if (ch === ONEWAY && !ignoreWay) top = cy + 1;
      else if (cx === cc && (ch === SLOPE_R || ch === SLOPE_L)) top = cy + (ch === SLOPE_R ? x - cx : 1 - (x - cx));
      else continue;
      if (top <= yTop + EPS && top >= yMin - EPS && top > best) best = top;
    }
  }
  return best === -Infinity ? null : best;
}
export const groundBelow = (grid, x, y, hw = P.half) => support(grid, x, y + 0.5, y - 40, hw);

function standingOnWay(grid, b) {
  const cy = Math.floor(b.y - 0.01), c0 = Math.floor(b.x - P.half + 1e-6), c1 = Math.floor(b.x + P.half - 1e-6);
  let way = false;
  for (let cx = c0; cx <= c1; cx++) {
    const ch = grid.at(cx, cy);
    if (Math.abs(cy + 1 - b.y) > 0.02) continue;
    if (ch === SOLID) return false;
    if (ch === ONEWAY) way = true;
  }
  return way;
}

// ---- one fixed step -------------------------------------------------------------------------------------------------------------------------------------
function resolveX(grid, b, dir) {
  // push out of solid tiles the body now overlaps; while on the floor a low lip (a slope meeting its flat top) is stepped onto instead
  const hw = P.half;
  for (let guard = 0; guard < 4; guard++) {
    let hit = null;
    const r0 = Math.floor(b.y + EPS), r1 = Math.floor(b.y + P.height - EPS);
    const c0 = Math.floor(b.x - hw + 1e-6), c1 = Math.floor(b.x + hw - 1e-6);
    for (let cy = r0; cy <= r1 && !hit; cy++) for (let cx = c0; cx <= c1; cx++) if (grid.at(cx, cy) === SOLID) { hit = { cx, cy }; break; }
    if (!hit) return;
    const lift = hit.cy + 1 - b.y;
    const lipOk = (b.grounded && lift <= P.stepUp) || (!b.grounded && b.vy <= 0 && lift <= 0.3);
    if (lipOk && grid.at(hit.cx, hit.cy + 1) !== SOLID && roomAbove(grid, b, hit.cy + 1)) {
      b.y = hit.cy + 1; if (!b.grounded) { b.grounded = true; b.vy = 0; }
      continue;
    }
    b.x = dir > 0 ? hit.cx - hw : hit.cx + 1 + hw;
    b.vx = 0;
  }
}
function roomAbove(grid, b, feetY) {
  const r0 = Math.floor(feetY + EPS), r1 = Math.floor(feetY + P.height - EPS);
  for (let cy = r0; cy <= r1; cy++) for (let cx = Math.floor(b.x - P.half + 1e-6); cx <= Math.floor(b.x + P.half - 1e-6); cx++) if (grid.at(cx, cy) === SOLID) return false;
  return true;
}

function snapToFloor(grid, b) {
  const S = support(grid, b.x, b.y + P.stepUp, b.y - P.snapDown, P.half, b.dropT > 0);
  if (S === null) { b.grounded = false; return false; }
  b.y = S; return true;
}

function moveX(grid, b, dx) {
  const n = Math.max(1, Math.ceil(Math.abs(dx) / CHUNK));
  for (let i = 0; i < n; i++) {
    b.x += dx / n;
    resolveX(grid, b, dx);
    if (b.grounded) snapToFloor(grid, b);
    else if (b.vy <= 0) {                                    // airborne beside a slope: touch it and stand
      const S = support(grid, b.x, b.y + 0.55, b.y, P.half, b.dropT > 0);
      if (S !== null && S > b.y + 1e-6) { b.y = S; b.grounded = true; b.vy = 0; b.jumping = false; }
    }
  }
}

function moveY(grid, b, dy, ev) {
  const n = Math.max(1, Math.ceil(Math.abs(dy) / CHUNK));
  const hw = P.half;
  for (let i = 0; i < n; i++) {
    const d = dy / n;
    if (d > 0) {                                             // rising: bonk on a solid ceiling
      const ny = b.y + d, top = ny + P.height;
      const row = Math.floor(top);
      let blocked = false;
      for (let cx = Math.floor(b.x - hw + 1e-6); cx <= Math.floor(b.x + hw - 1e-6); cx++) if (grid.at(cx, row) === SOLID && b.y + P.height <= row + EPS) { blocked = true; break; }
      if (blocked) { b.y = row - P.height - 1e-4; if (b.vy > 3) ev.push({ kind: 'bonk' }); b.vy = 0; b.jumping = false; return; }
      b.y = ny;
    } else if (d < 0) {
      const ny = b.y + d;
      const S = support(grid, b.x, b.y + EPS, ny, hw, b.dropT > 0);
      if (S !== null && S >= ny - 1e-9) {
        const impact = -b.vy;
        b.y = S; b.vy = 0; b.grounded = true; b.jumping = false;
        ev.push({ kind: 'land', v: impact });
        return;
      }
      b.y = ny;
    }
  }
}

export function bounce(b, vy) { b.vy = vy; b.grounded = false; b.jumping = false; b.coyote = 0; b.ev.push({ kind: 'bounce', v: vy }); }
export function hurtBody(b, dir) { b.vx = dir * P.knockX; b.vy = P.knockY; b.grounded = false; b.jumping = false; b.stun = P.stun; b.coyote = 0; b.buffer = 0; }

function overlaps(b, x0, y0, x1, y1, shrink = 0) {
  return b.x + P.half - shrink > x0 && b.x - P.half + shrink < x1 && b.y + P.height - shrink > y0 && b.y + shrink < y1;
}

export function stepBody(grid, b, input, dt = P.step) {
  const ev = b.ev;
  const wasGrounded = b.grounded;
  b.px = b.x; b.py = b.y;
  b.stun = Math.max(0, b.stun - dt);
  b.dropT = Math.max(0, b.dropT - dt);
  const live = !b.dead && b.stun <= 0;
  const mx = live ? clamp(input.move || 0, -1, 1) : 0;
  const jumpPressed = live && !!input.jumpPressed, jumpHeld = live && !!input.jumpHeld;
  b.coyote = wasGrounded ? P.coyote : Math.max(0, b.coyote - dt);
  b.buffer = jumpPressed ? P.buffer : Math.max(0, b.buffer - dt);

  // horizontal control (analog: walk below the threshold, blends to a run above it)
  const mag = Math.abs(mx);
  let target = 0;
  if (mag > 0.12) {
    const sp = mag <= WALK_THRESHOLD ? P.walkSpeed * (mag / WALK_THRESHOLD) : P.walkSpeed + (P.runSpeed - P.walkSpeed) * ((mag - WALK_THRESHOLD) / (1 - WALK_THRESHOLD));
    target = Math.sign(mx) * sp; b.face = Math.sign(mx);
  }
  if (b.stun > 0) { /* knocked back: keep the launch speed */ }
  else if (target === 0) b.vx = approach(b.vx, 0, (wasGrounded ? P.friction : P.airFriction) * dt);
  else {
    const turning = Math.sign(target) !== Math.sign(b.vx) && Math.abs(b.vx) > 0.5;
    b.vx = approach(b.vx, target, (wasGrounded ? P.accelGround : P.accelAir) * (turning ? P.turnBoost : 1) * dt);
  }

  // drop through a plank / jump
  if (b.buffer > 0 && wasGrounded && input.down && standingOnWay(grid, b)) {
    b.dropT = P.dropTime; b.grounded = false; b.y -= 0.02; b.vy = -1; b.buffer = 0; b.coyote = 0; ev.push({ kind: 'drop' });
  } else if (b.buffer > 0 && (wasGrounded || b.coyote > 0)) {
    b.vy = P.jumpV; b.grounded = false; b.jumping = true; b.coyote = 0; b.buffer = 0; ev.push({ kind: 'jump' });
  } else if (wasGrounded) b.vy = 0;
  if (!b.grounded) {
    if (b.jumping && b.vy > P.jumpCut && !jumpHeld) b.vy = P.jumpCut;     // released early: cut the rise
    b.vy = Math.max(-P.maxFall, b.vy - P.gravity * dt);
  }

  // move: horizontal first (with slope snapping), then vertical
  moveX(grid, b, b.vx * dt);
  b.x = clamp(b.x, P.half, grid.W - P.half);
  if (!b.grounded) { moveY(grid, b, b.vy * dt, ev); }
  else if (!snapToFloor(grid, b)) b.grounded = false;

  // springs and thorns
  const c0 = Math.floor(b.x - P.half), c1 = Math.floor(b.x + P.half), r0 = Math.floor(b.y - 0.01), r1 = Math.floor(b.y + P.height);
  for (let cy = r0; cy <= r1; cy++) {
    for (let cx = c0; cx <= c1; cx++) {
      const ch = grid.at(cx, cy);
      if (ch === SPRING && b.vy <= 0.1 && overlaps(b, cx + 0.1, cy, cx + 0.9, cy + SPRING_H)) { bounce(b, jumpHeld ? P.springVHeld : P.springV); b.spring = { cx, cy }; }
      else if (ch === THORN && overlaps(b, cx + 0.12, cy, cx + 0.88, cy + 0.55, 0.04)) ev.push({ kind: 'hazard', cx, cy });
    }
  }
  b.air = b.grounded ? 0 : b.vy > 0.5 ? 1 : 2;
  if (b.y < -2.5 && !b.dead) ev.push({ kind: 'fell' });
}

/** Run fixed steps for `dt` seconds (capped). `b.ev` collects every step's events; b.alpha = how far the next step is under way (0..1) for visual interpolation. */
export function advance(grid, b, input, dt) {
  b.ev.length = 0;
  b.acc += Math.min(dt, P.step * P.maxSteps * 2);
  // A press edge lives for ONE frame, but a fast display (120 / 144 Hz) has frames that run no fixed step at all: keep the press until a step uses it.
  if (input.jumpPressed) b.pendJump = true;
  let n = 0;
  while (b.acc >= P.step - 1e-9 && n < P.maxSteps) {
    stepBody(grid, b, b.pendJump ? { ...input, jumpPressed: true } : { ...input, jumpPressed: false });
    b.pendJump = false; b.acc -= P.step; n++;
  }
  if (n >= P.maxSteps) b.acc = 0;
  b.alpha = clamp(b.acc / P.step, 0, 1);
  return n;
}

// ---- derived limits ------------------------------------------------------------------------------------------------------------------------------------
// Measured by simulating the real step on an open grid, so the validator's envelope can never drift from the physics.
function simulateJump({ held = true, launch = null, run = true } = {}) {
  const g = createGrid(['....................', '....................', '....................', '....................', '....................', '....................', '....................', '....................', '....................', '....................', '####################']);
  const b = createBody(5, 1); b.grounded = true; if (run) b.vx = P.runSpeed;       // (a running take-off)
  let apex = 0, t = 0, flatT = null, flatX = null;
  const inp = { move: run ? 1 : 0, jumpHeld: held, jumpPressed: true };
  if (launch) { bounce(b, launch); inp.jumpPressed = false; } else stepBody(g, b, inp);
  const x0 = b.x;
  for (let i = 0; i < 600; i++) {
    stepBody(g, b, { move: run ? 1 : 0, jumpHeld: held, jumpPressed: false });
    t += P.step; apex = Math.max(apex, b.y - 1);
    if (b.grounded) { flatT = t; flatX = b.x - x0; break; }
  }
  return { apex, time: flatT, dist: flatX };
}
function deriveLimits() {
  const full = simulateJump(), tap = simulateJump({ held: false }), spring = simulateJump({ launch: P.springV }), springH = simulateJump({ launch: P.springVHeld });
  // height needed to land on a ledge `dy` tiles above (negative: below) the take-off floor, descending: time until y(t) = dy, times the run speed
  const timeAt = (v, dy) => { const d = v * v - 2 * P.gravity * dy; return d < 0 ? 0 : (v + Math.sqrt(d)) / P.gravity; };
  const margin = 1.0;                                        // tiles of slack the validator keeps (body width, landing a hair early, imperfect timing)
  const reachFor = (v) => (dy) => Math.max(0, Math.floor(P.runSpeed * timeAt(v, Math.min(dy, (v * v) / (2 * P.gravity) - 0.1)) - margin + 1e-9));
  const maxUp = Math.max(1, Math.floor(full.apex - 0.4)), springMaxUp = Math.max(1, Math.floor(spring.apex - 0.4));
  return {
    apex: full.apex, tapApex: tap.apex, springApex: spring.apex, springHeldApex: springH.apex,
    airtime: full.time, flatReach: full.dist, maxUp, springMaxUp, maxGap: reachFor(P.jumpV)(0), springGap: reachFor(P.springV)(0),
    reach: (dy) => (dy > maxUp ? 0 : reachFor(P.jumpV)(dy)),
    springReach: (dy) => (dy > springMaxUp ? 0 : reachFor(P.springV)(dy)),
    maxDrop: 40,
  };
}
export const LIMITS = deriveLimits();

// ---- hearts, thorns, pits (pure per-player life rules; session only, no lives and no game over) ------------------------------------------------
//   createLife() -> { hearts, invuln, state: 'alive' | 'puff', puffT }
//   hurtLife(life)    a thorn: -1 heart with brief invulnerability; the last heart turns the player into a puff. -> 'hurt' | 'puff' | null (ignored)
//   fallLife(life)    a pit: straight to a puff.               tickLife(life, dt) -> 'respawn' when the puff time is over (full hearts, a moment of invulnerability)
//   refillLife(life)  full hearts (every 100 berries)          berryRefill(before, after) -> true when the count crossed a multiple of `per`
export const createLife = () => ({ hearts: P.hearts, invuln: 0, state: 'alive', puffT: 0 });
export function hurtLife(l) {
  if (l.state !== 'alive' || l.invuln > 0) return null;
  l.hearts = Math.max(0, l.hearts - 1);
  if (l.hearts === 0) { l.state = 'puff'; l.puffT = P.puff; return 'puff'; }
  l.invuln = P.invuln; return 'hurt';
}
export function fallLife(l) {
  if (l.state !== 'alive') return null;
  l.hearts = 0; l.state = 'puff'; l.puffT = P.puff; return 'puff';
}
export function tickLife(l, dt) {
  if (l.invuln > 0) l.invuln = Math.max(0, l.invuln - dt);
  if (l.state === 'puff') {
    l.puffT -= dt;
    if (l.puffT <= 0) { l.state = 'alive'; l.hearts = P.hearts; l.invuln = 1.0; l.puffT = 0; return 'respawn'; }
  }
  return null;
}
export function refillLife(l) { if (l.state === 'alive') l.hearts = P.hearts; }
export const berryRefill = (before, after, per = P.berriesPerHeart) => Math.floor(after / per) > Math.floor(before / per);
