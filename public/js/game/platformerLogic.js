// The platformer core (Step 49): PURE rules for one side-scrolling body on a tile grid. No three.js / DOM, so Node tests it (test/platformer.test.js).
// Players in a storybook page are boxes (0.6 x 1.4 u, feet at the bottom centre) moving on a 1 u tile grid at a fixed 60 Hz; game/pagePlayers.js feeds them the
// players' input and copies the result onto the characters. Coordinates here are TILE coordinates: x to the right, y UP, tile (cx, cy) covers x cx..cx+1, y cy..cy+1.
//
//   Tiles (one char each, see game/pageFormat.js for the page file):
//     '.' empty   '#' solid   '=' one-way plank (land from above, pass from below, down + Jump drops through)   '/' '\' 45-degree slopes (the floor rises / falls to the right)
//     '^' thorns (hurt, pass-through)   'S' spring flower (launches higher; pass-through trigger on the cell's bottom 0.45)
//     Step 50 tool gates are SOLID to the physics and remembered by KIND: 'B' stone block, 'X' cracked floor, 'W' bramble wall, 'D' soft soil, 'H' hanging crate, 'R' geode, 'L' log (a felled tree), 'K' crate (a dropped one)
//     (grid.kind(cx, cy) = that character or '.'; setTile(grid, cx, cy, ch) changes a cell - the host opens gates, game/pageWorldLogic.js; cloneGrid(grid) = a run's working copy)
//   createGrid(rows)                 rows = strings TOP row first -> { W, H, at(cx, cy) } (outside the page: solid walls left / right, empty above and below = pits)
//   createBody(x, y)                 { x, y, vx, vy, grounded, face, ev, ... }
//   advance(grid, body, input, dt)   accumulate dt, run fixed steps (capped), input = { move: -1..1, down, jumpPressed, jumpHeld }; body.ev = this call's events:
//                                    jump | land {v} | bonk | bounce | drop | hazard {cx, cy} | fell
//   stepBody(grid, body, input, dt)  exactly one fixed step (what advance loops over)
//   bounce(body, vy)                 launch the body (springs, stomps, pogo); hurtBody(body, dir) knock-back + stun
//   Step 50 inputs: { carry } slows the run and the jump (holding something), { twirlPressed } Cancel in the air with empty arms = a short glide (b.twirlT, once per airtime, ev 'twirl'),
//                   { pound } (hammer ground pound: falls fast and straight; the 'land' event carries pound: true), { pogo } (shovel: thorns bounce the body instead of hurting it; ev 'pogo')
//   Step 52a inputs: { wind: { vx, lift } } a gust: the body is carried vx (u/s) sideways without changing its own speed, and a twirl glide is lifted (u/s^2); { wade } walking through tide water (slower run)
//   Step 52b inputs: SNOW. Tile kinds 'I' (ice: solid, slippery: long slides, slow turnaround, a slightly higher run speed) and 'M' (snow drift: solid, the run is slower, a landing is cushioned: ev land.soft) and 'y' (slush: EMPTY,
//                   frozen to 'I' for a few seconds by a snowball: game/pageSnowLogic.js); { sled: { speed } } the body is on a SLED: it runs at that speed by itself, Jump hops (sled jump), Down ducks (b.duck);
//                   { buddy: 'dash' | 'glide' | 'super' | 'flutter' } a critter buddy's ability: super = a higher jump, glide = hold Jump in the air to fall slowly (ev glide), flutter = extra mid-air hops (ev flutter),
//                   dash = { dashPressed } a short flat burst forward (ev dash; breaks snow walls, game/pagePlayers.js). Body fields: hops, dashT, dashCool, gliding, duck.
//   headStep(b, pre, heads, on, o)   Step 51: friends' heads as moving one-way platforms (land / bounce / stand / ride along), see below; Step 52a: also leaf / log platforms ({ half, solid })
//   groundBelow(grid, x, y)          the floor height straight under a point (for blob shadows), or null over a pit
//   LIMITS                           derived from PLATFORMER by simulation: { apex, maxUp, maxGap, reach(dy), springApex, springMaxUp, ... } for the page validator
// Movement rules: acceleration / friction with an analog stick (walk vs run), weaker air control, variable jump height (releasing Jump caps the rise), coyote time,
// jump buffer, terminal fall speed, head bonk, per-axis sweeps in chunks of at most 0.25 tile (no tunnelling), a 0.6 tile step-up so slopes meet flat tops smoothly,
// and slope snapping so walking downhill never bounces.
import { PLATFORMER as P, PAGE_MP as MP, PAGE_MOTION as M, PAGE_SNOW as SN, WALK_THRESHOLD } from '../config.js';

export const SOLID = 35, ONEWAY = 61, SLOPE_R = 47, SLOPE_L = 92, THORN = 94, SPRING = 83, EMPTY = 46;   // char codes of # = / \ ^ S .
export const GATE_CHARS = 'BXWDHRLKJ';                 // tool gates (J: a snow wall a fox dash breaks): solid to the physics, told apart by `grid.kind` (see the header)
export const SURFACE_CHARS = 'IM';                      // Step 52b: ice and snow drift tiles: solid to the physics, told apart by `grid.kind`
export const SLUSH = 'y';                               // Step 52b: a slush cell: empty to the physics (a pit below it), `grid.kind` remembers it so a snowball can freeze it
const KIND_CHARS = GATE_CHARS + SURFACE_CHARS + SLUSH;
export const physOf = (ch) => (GATE_CHARS.includes(ch) || SURFACE_CHARS.includes(ch) ? '#' : ch === SLUSH ? '.' : ch);
const EPS = 1e-4, CHUNK = 0.25, SPRING_H = 0.45;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const approach = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));

export function createGrid(rows) {
  const H = rows.length, W = Math.max(...rows.map((r) => r.length));
  const cells = new Uint8Array(W * H), kinds = new Uint8Array(W * H).fill(EMPTY);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const ch = rows[r][c] || '.', i = (H - 1 - r) * W + c;
    cells[i] = physOf(ch).charCodeAt(0);
    if (KIND_CHARS.includes(ch)) kinds[i] = ch.charCodeAt(0);
  }
  return { W, H, cells, kinds, at(cx, cy) { return gridAt(this, cx, cy); }, kind(cx, cy) { return kindAt(this, cx, cy); } };
}
function gridAt(g, cx, cy) {
  if (cx < 0 || cx >= g.W) return SOLID;
  if (cy < 0 || cy >= g.H) return EMPTY;
  return g.cells[cy * g.W + cx];
}
function kindAt(g, cx, cy) {
  if (cx < 0 || cx >= g.W || cy < 0 || cy >= g.H) return '.';
  return String.fromCharCode(g.kinds[cy * g.W + cx]);
}
/** Change one cell (any tile character, gates included); false when outside the grid. */
export function setTile(g, cx, cy, ch) {
  if (cx < 0 || cx >= g.W || cy < 0 || cy >= g.H) return false;
  const i = cy * g.W + cx;
  g.cells[i] = physOf(ch).charCodeAt(0);
  g.kinds[i] = KIND_CHARS.includes(ch) ? ch.charCodeAt(0) : EMPTY;
  return true;
}
/** A run's working copy of a page grid (the page itself is never changed: a page re-entered starts pristine). */
export function cloneGrid(g) {
  return { W: g.W, H: g.H, cells: g.cells.slice(), kinds: g.kinds.slice(), at(cx, cy) { return gridAt(this, cx, cy); }, kind(cx, cy) { return kindAt(this, cx, cy); } };
}

export function createBody(x = 0, y = 0) {
  return {
    x, y, px: x, py: y, vx: 0, vy: 0, grounded: false, face: 1, jumping: false,
    coyote: 0, buffer: 0, dropT: 0, stun: 0, acc: 0, air: 0, dead: false, ev: [], onWay: false,
    twirlT: 0, twirled: false, pounding: false, pendTwirl: false,
    hops: 0, dashT: 0, dashCool: 0, gliding: false, duck: false, pendDash: false,        // (Step 52b: buddy abilities and the sled duck)
  };
}

// ---- floor queries --------------------------------------------------------------------------------------------------------------------------------------
/** The highest floor surface in [yMin, yTop] under a body at x: solids and (unless `ignoreWay`) planks across its width, slopes at its centre. null = none. */
export function support(grid, x, yTop, yMin, hw, ignoreWay = false) {
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
        let impact = -b.vy;
        b.y = S; b.vy = 0; b.grounded = true; b.jumping = false;
        const soft = grid.kind(Math.floor(b.x), Math.round(S) - 1) === 'M';                 // a snow drift cushions the landing
        if (soft) impact *= SN.drift.cushion;
        ev.push({ kind: 'land', v: impact, pound: !!b.pounding, soft });
        b.pounding = false;
        return;
      }
      b.y = ny;
    }
  }
}

export function bounce(b, vy) { b.vy = vy; b.grounded = false; b.jumping = false; b.coyote = 0; b.twirled = false; b.twirlT = 0; b.pounding = false; b.ev.push({ kind: 'bounce', v: vy }); }
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
  b.dashT = Math.max(0, b.dashT - dt); b.dashCool = Math.max(0, b.dashCool - dt);
  const live = !b.dead && b.stun <= 0;
  const mx = live && !(!b.grounded && input.pound) ? clamp(input.move || 0, -1, 1) : 0;
  const jumpPressed = live && !!input.jumpPressed, jumpHeld = live && !!input.jumpHeld;
  b.coyote = wasGrounded ? P.coyote : Math.max(0, b.coyote - dt);
  b.buffer = jumpPressed ? P.buffer : Math.max(0, b.buffer - dt);
  if (wasGrounded) { b.twirled = false; b.twirlT = 0; b.hops = SN.flutter.hops; b.gliding = false; }
  const buddy = live ? input.buddy || null : null, sled = live && input.sled ? input.sled : null;
  const floorKind = wasGrounded ? grid.kind(Math.floor(b.x), Math.floor(b.y - 0.05)) : '.';
  const onIce = floorKind === 'I', onDrift = floorKind === 'M';
  b.duck = !!sled && wasGrounded && !!input.down;
  if (live && buddy === 'dash' && input.dashPressed && b.dashCool <= 0) { b.dashT = SN.dash.time; b.dashCool = SN.dash.cool; ev.push({ kind: 'dash' }); }
  const pound = live && !!input.pound && !wasGrounded, carryK = (input.carry ? P.carryMove : 1) * (input.wade ? M.wadeMove : 1);
  if (!pound) b.pounding = false;
  if (live && input.twirlPressed && !wasGrounded && !b.twirled && !pound && b.vy < 1.5) {       // Cancel in the air with empty arms: a short glide, once per airtime
    b.twirled = true; b.twirlT = P.twirlTime; b.vy = Math.max(b.vy, -P.twirlGlide); ev.push({ kind: 'twirl' });
  }

  // horizontal control (analog: walk below the threshold, blends to a run above it)
  const mag = Math.abs(mx);
  let target = 0;
  if (mag > 0.12) {
    const sp = mag <= WALK_THRESHOLD ? P.walkSpeed * (mag / WALK_THRESHOLD) : P.walkSpeed + (P.runSpeed - P.walkSpeed) * ((mag - WALK_THRESHOLD) / (1 - WALK_THRESHOLD));
    target = Math.sign(mx) * sp * carryK * (onIce ? SN.ice.speedK : 1) * (onDrift ? SN.drift.moveK : 1) * (buddy === 'glide' ? SN.glide.boost : 1); b.face = Math.sign(mx);
  }
  if (b.stun > 0) { /* knocked back: keep the launch speed */ }
  else if (target === 0) b.vx = approach(b.vx, 0, (wasGrounded ? P.friction * (onIce ? SN.ice.friction : 1) : P.airFriction) * dt);
  else {
    const turning = Math.sign(target) !== Math.sign(b.vx) && Math.abs(b.vx) > 0.5;
    b.vx = approach(b.vx, target, (wasGrounded ? P.accelGround * (onIce ? SN.ice.accel : 1) : P.accelAir) * (turning ? (onIce ? SN.ice.turn : P.turnBoost) : 1) * dt);
  }
  if (sled && b.stun <= 0) { b.vx = sled.speed; b.face = 1; }                     // a sled runs by itself
  if (b.dashT > 0 && b.stun <= 0) { b.vx = (b.face || 1) * SN.dash.speed; if (b.vy < 0) b.vy = 0; }       // a fox dash: flat and fast

  // drop through a plank / jump
  if (b.buffer > 0 && wasGrounded && input.down && !sled && standingOnWay(grid, b)) {
    b.dropT = P.dropTime; b.grounded = false; b.y -= 0.02; b.vy = -1; b.buffer = 0; b.coyote = 0; ev.push({ kind: 'drop' });
  } else if (b.buffer > 0 && (wasGrounded || b.coyote > 0)) {
    b.vy = P.jumpV * (input.carry ? P.carryJump : 1) * (buddy === 'super' ? SN.superJump.k : 1) * (sled ? SN.sled.jumpK : 1); b.grounded = false; b.jumping = true; b.coyote = 0; b.buffer = 0; ev.push({ kind: 'jump', sled: !!sled });
  } else if (buddy === 'flutter' && jumpPressed && !wasGrounded && b.coyote <= 0 && b.hops > 0) {         // a grouse flutter: another hop in mid-air
    b.hops--; b.vy = SN.flutter.v; b.jumping = true; b.buffer = 0; b.twirlT = 0; ev.push({ kind: 'flutter', left: b.hops });
  } else if (wasGrounded) b.vy = 0;
  if (!b.grounded) {
    if (b.jumping && b.vy > P.jumpCut && !jumpHeld) b.vy = P.jumpCut;     // released early: cut the rise
    const glide = b.twirlT > 0 && b.vy <= 0;
    if (b.twirlT > 0) b.twirlT = Math.max(0, b.twirlT - dt);
    b.vy = Math.max(-P.maxFall, b.vy - P.gravity * (glide ? P.twirlGravityK : 1) * dt);
    if (glide) b.vy = Math.max(b.vy, -P.twirlGlide);
    if (buddy === 'glide' && jumpHeld && b.vy < 0 && !b.pounding) {                                // a squirrel glide: hold Jump in the air
      if (!b.gliding) { b.gliding = true; ev.push({ kind: 'glide' }); }
      b.vy = Math.max(b.vy, -SN.glide.fall);
    } else if (b.gliding && (!jumpHeld || b.vy >= 0)) b.gliding = false;
    if (b.dashT > 0) b.vy = Math.max(b.vy, 0);
    if (pound) { b.pounding = true; b.vy = -P.poundV; b.vx = 0; }
    else if (input.wind && input.wind.lift > 0 && b.twirlT > 0) b.vy = Math.min(b.vy + input.wind.lift * dt, 4.5);      // a gust lifts a twirl
  }

  // move: horizontal first (with slope snapping), then vertical
  moveX(grid, b, (b.vx + (input.wind ? input.wind.vx : 0)) * dt);
  b.x = clamp(b.x, P.half, grid.W - P.half);
  if (!b.grounded) { moveY(grid, b, b.vy * dt, ev); }
  else if (!snapToFloor(grid, b)) b.grounded = false;

  // springs and thorns
  const c0 = Math.floor(b.x - P.half), c1 = Math.floor(b.x + P.half), r0 = Math.floor(b.y - 0.01), r1 = Math.floor(b.y + P.height);
  for (let cy = r0; cy <= r1; cy++) {
    for (let cx = c0; cx <= c1; cx++) {
      const ch = grid.at(cx, cy);
      if (ch === SPRING && b.vy <= 0.1 && overlaps(b, cx + 0.1, cy, cx + 0.9, cy + SPRING_H)) { bounce(b, jumpHeld ? P.springVHeld : P.springV); b.spring = { cx, cy }; }
      else if (ch === THORN && overlaps(b, cx + 0.12, cy, cx + 0.88, cy + 0.55, 0.04)) {
        if (input.pogo) { if (b.vy <= 0.5) { bounce(b, P.pogoV); ev.push({ kind: 'pogo', cx, cy }); } }       // (a pogo is never hurt by thorns, also while it is still rising out of them)
        else ev.push({ kind: 'hazard', cx, cy });
      }
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
  if (input.twirlPressed) b.pendTwirl = true;                // (the same for Cancel's twirl)
  if (input.dashPressed) b.pendDash = true;                  // (and for a buddy's dash)
  let n = 0;
  while (b.acc >= P.step - 1e-9 && n < P.maxSteps) {
    stepBody(grid, b, { ...input, jumpPressed: !!b.pendJump, twirlPressed: !!b.pendTwirl, dashPressed: !!b.pendDash });
    b.pendJump = false; b.pendTwirl = false; b.pendDash = false; b.acc -= P.step; n++;
  }
  if (n >= P.maxSteps) b.acc = 0;
  b.alpha = clamp(b.acc / P.step, 0, 1);
  return n;
}

// ---- derived limits ------------------------------------------------------------------------------------------------------------------------------------
// Measured by simulating the real step on an open grid, so the validator's envelope can never drift from the physics.
function simulateJump({ held = true, launch = null, run = true, twirl = false } = {}) {
  const g = createGrid(['....................', '....................', '....................', '....................', '....................', '....................', '....................', '....................', '....................', '....................', '####################']);
  const b = createBody(5, 1); b.grounded = true; if (run) b.vx = P.runSpeed;       // (a running take-off)
  let apex = 0, t = 0, flatT = null, flatX = null;
  const inp = { move: run ? 1 : 0, jumpHeld: held, jumpPressed: true };
  if (launch) { bounce(b, launch); inp.jumpPressed = false; } else stepBody(g, b, inp);
  const x0 = b.x;
  for (let i = 0; i < 600; i++) {
    stepBody(g, b, { move: run ? 1 : 0, jumpHeld: held, jumpPressed: false, twirlPressed: twirl && b.vy < 0 });
    t += P.step; apex = Math.max(apex, b.y - 1);
    if (b.grounded) { flatT = t; flatX = b.x - x0; break; }
  }
  return { apex, time: flatT, dist: flatX };
}
// Step 52b: one running jump with a buddy's ability (or on a sled), sampled along its path: -> [{ x, y }] from the take-off (x0 = 0, y0 = 0), ending when the body lands on the flat floor or after 6 s.
function simPath({ buddy = null, sled = false } = {}) {
  const rows = Array.from({ length: 24 }, () => '.'.repeat(120)); rows.push('#'.repeat(120));
  const g = createGrid(rows), b = createBody(5, 1); b.grounded = true; b.vx = sled ? SN.sled.speed : P.runSpeed;
  const inp = (extra) => ({ move: 1, jumpHeld: true, jumpPressed: false, buddy, sled: sled ? { speed: SN.sled.speed } : null, ...extra });
  stepBody(g, b, inp({ jumpPressed: true }));
  const path = [{ x: 0, y: 0 }], x0 = b.x, y0 = 1;
  for (let i = 0; i < 360; i++) {
    stepBody(g, b, inp({ jumpPressed: buddy === 'flutter' && b.vy < -1 && b.hops > 0 && b.buffer <= 0 }));
    path.push({ x: b.x - x0, y: b.y - y0, vy: b.vy });
    if (b.grounded) break;
  }
  return path;
}
/** The reach table of a measured path: { apex, maxUp, reach(dy) } (how many whole tiles sideways a landing dy tiles above / below the take-off is, a tile of margin kept). */
function pathLimits(path) {
  const apex = Math.max(...path.map((p) => p.y)), maxUp = Math.max(1, Math.floor(apex - 0.4)), memo = new Map();
  const crossing = (dy) => { let seenUp = false; for (let i = 1; i < path.length; i++) { if (path[i].y >= dy) seenUp = true; if (seenUp && path[i].y <= dy && path[i - 1].y > dy) { const k = (path[i - 1].y - dy) / (path[i - 1].y - path[i].y || 1); return path[i - 1].x + (path[i].x - path[i - 1].x) * k; } } return null; };
  const reach = (dy) => { if (dy > maxUp) return 0; if (dy < 0) return reach(0); const k = Math.round(dy); if (!memo.has(k)) { const x = crossing(Math.min(k, apex - 0.1)); memo.set(k, x === null ? 0 : Math.max(0, Math.floor(x - 1.0 + 1e-9))); } return memo.get(k); };
  return { apex, maxUp, reach };
}
function deriveLimits() {
  const full = simulateJump(), twirled = simulateJump({ twirl: true }), tap = simulateJump({ held: false }), spring = simulateJump({ launch: P.springV }), springH = simulateJump({ launch: P.springVHeld });
  // height needed to land on a ledge `dy` tiles above (negative: below) the take-off floor, descending: time until y(t) = dy, times the run speed
  const timeAt = (v, dy) => { const d = v * v - 2 * P.gravity * dy; return d < 0 ? 0 : (v + Math.sqrt(d)) / P.gravity; };
  const margin = 1.0;                                        // tiles of slack the validator keeps (body width, landing a hair early, imperfect timing)
  const reachFor = (v) => (dy) => Math.max(0, Math.floor(P.runSpeed * timeAt(v, Math.min(dy, (v * v) / (2 * P.gravity) - 0.1)) - margin + 1e-9));
  const maxUp = Math.max(1, Math.floor(full.apex - 0.4)), springMaxUp = Math.max(1, Math.floor(spring.apex - 0.4));
  const twirlBonus = Math.max(0, Math.floor(twirled.dist - full.dist));       // tiles of extra gap a twirl at the top of the jump buys (a measured gain, (reach() already keeps a tile of margin))
  return {
    twirlBonus, twirlGain: twirled.dist - full.dist, twirlAirtime: twirled.time,
    twirlReach: (dy) => (dy > maxUp ? 0 : reachFor(P.jumpV)(dy) + twirlBonus),
    apex: full.apex, tapApex: tap.apex, springApex: spring.apex, springHeldApex: springH.apex,
    airtime: full.time, flatReach: full.dist, maxUp, springMaxUp, maxGap: reachFor(P.jumpV)(0), springGap: reachFor(P.springV)(0),
    reach: (dy) => (dy > maxUp ? 0 : reachFor(P.jumpV)(dy)),
    springReach: (dy) => (dy > springMaxUp ? 0 : reachFor(P.springV)(dy)),
    maxDrop: 40,
    buddy: { super: pathLimits(simPath({ buddy: 'super' })), glide: pathLimits(simPath({ buddy: 'glide' })), flutter: pathLimits(simPath({ buddy: 'flutter' })) },
    sled: pathLimits(simPath({ sled: true })),
  };
}
export const LIMITS = deriveLimits();

// ---- hearts, thorns, pits (pure per-player life rules; session only, no lives and no game over) ------------------------------------------------
//   createLife() -> { hearts, invuln, state: 'alive' | 'puff', puffT, kind: 'none' | 'hearts' | 'pit' | 'lost', puffAge }
//   hurtLife(life)    a thorn: -1 heart with brief invulnerability; the last heart turns the player into a puff. -> 'hurt' | 'puff' | null (ignored)
//   fallLife(life)    a pit: straight to a puff.               tickLife(life, dt) -> 'respawn' when the puff time is over (full hearts, a moment of invulnerability)
//   loseLife(life) (Step 51: a lost puff, no heart lost)     reviveLife(life) a friend popped the puff     tickLife(life, dt, hold): hold = a living friend can still pop it (the puff waits)
//   refillLife(life)  full hearts (every 100 berries)          berryRefill(before, after) -> true when the count crossed a multiple of `per`
export const createLife = () => ({ hearts: P.hearts, invuln: 0, state: 'alive', puffT: 0, kind: 'none', puffAge: 0 });
export function hurtLife(l) {
  if (l.state !== 'alive' || l.invuln > 0) return null;
  l.hearts = Math.max(0, l.hearts - 1);
  if (l.hearts === 0) { l.state = 'puff'; l.puffT = P.puff; l.kind = 'hearts'; l.puffAge = 0; return 'puff'; }
  l.invuln = P.invuln; return 'hurt';
}
export function fallLife(l) {
  if (l.state !== 'alive') return null;
  l.hearts = 0; l.state = 'puff'; l.puffT = P.puff; l.kind = 'pit'; l.puffAge = 0; return 'puff';
}
/** Step 51: left behind (outside the shared camera window too long): a puff that costs no heart. */
export function loseLife(l) {
  if (l.state !== 'alive') return null;
  l.state = 'puff'; l.puffT = P.puff; l.kind = 'lost'; l.puffAge = 0; return 'puff';
}
/** A friend popped the puff: pit / zero-heart puffs come back with full hearts, a lost puff with the hearts it had; a short invulnerability blink. */
export function reviveLife(l) {
  if (l.state !== 'puff') return false;
  l.state = 'alive'; if (l.kind !== 'lost' || l.hearts < 1) l.hearts = P.hearts;
  l.invuln = MP.popBlink; l.puffT = 0; l.puffAge = 0; l.kind = 'none';
  return true;
}
export function tickLife(l, dt, hold = false) {
  if (l.invuln > 0) l.invuln = Math.max(0, l.invuln - dt);
  if (l.state === 'puff') {
    l.puffAge = (l.puffAge || 0) + dt;
    if (!(hold && l.puffAge < MP.puffMaxS)) l.puffT -= dt;       // (Step 51: while a living friend can pop the puff it waits, up to puffMaxS; alone it respawns after the puff time)
    if (l.puffT <= 0) { l.state = 'alive'; l.hearts = l.kind === 'lost' && l.hearts > 0 ? l.hearts : P.hearts; l.invuln = 1.0; l.puffT = 0; l.kind = 'none'; return 'respawn'; }
  }
  return null;
}
export function refillLife(l) { if (l.state === 'alive') l.hearts = P.hearts; }
export const berryRefill = (before, after, per = P.berriesPerHeart) => Math.floor(after / per) > Math.floor(before / per);

// ---- friends' heads (Step 51) ---------------------------------------------------------------------------------------------------------------------------
// No player-player collision from the side (Wonder rule), but a friend's head is a moving ONE-WAY platform: land on it from above and you bounce (fast landings: a small hop, or a big boost with
// Jump held) or, landing gently, STAND on it and ride along (several players stack). All in tile coordinates, after the body's own step.
//   heads = [{ id, x, top }]   the friends' head surfaces (their feet y + PAGE_MP.headH);   pre = { y, vy } the body BEFORE this frame's advance;   on = the head id stood on last frame (or null)
//   -> { on, kind: 'ride' | 'land' | 'bounce' | null, head, impact }   the body is already corrected (y, vy, grounded)
export function headStep(b, pre, heads, on, o = {}) {
  if (b.dead || !heads.length) return { on: null, kind: null };
  const reachOf = (h) => P.half + (h.half ?? MP.headHalf);
  if (on !== null && on !== undefined) {
    const h = heads.find((x) => x.id === on);
    if (h && b.vy <= 0.5 && Math.abs(b.x - h.x) <= reachOf(h) + MP.rideSlack && b.y - h.top <= MP.rideDrop && h.top - b.y <= MP.rideLift) {
      b.y = h.top; b.vy = 0; b.grounded = true; b.jumping = false; b.air = 0; b.coyote = P.coyote;
      return { on, kind: 'ride', head: h };
    }
  }
  if (b.grounded && !(on !== null && on !== undefined)) {                                       // standing on real ground: nothing to land on ... except a platform rising through the feet (Step 52a: a leaf lift picks you up)
    const up = heads.find((h) => h.solid && Math.abs(b.x - h.x) <= reachOf(h) && h.top >= b.y - 0.01 && h.top - b.y <= 0.3);
    if (!up) return { on: null, kind: null };
    b.y = up.top; b.vy = 0; b.grounded = true; b.jumping = false; b.air = 0; b.coyote = P.coyote;
    return { on: up.id, kind: 'ride', head: up };
  }
  if (b.vy > 0.5) return { on: null, kind: null };
  let best = null;
  for (const h of heads) {
    if (Math.abs(b.x - h.x) > reachOf(h)) continue;
    if (!(pre.y >= h.top - 0.3 && b.y <= h.top + 0.02 && b.y >= h.top - 0.95)) continue;
    if (!best || h.top > best.top) best = h;
  }
  if (!best) return { on: null, kind: null };
  const impact = Math.max(0, -Math.min(b.vy, pre.vy));
  b.y = best.top; b.twirled = false; b.twirlT = 0; b.pounding = false;
  if (impact > MP.headBounceMin && !best.solid) {
    b.vy = o.jumpHeld ? MP.headBoost : MP.headBounce; b.grounded = false; b.jumping = !!o.jumpHeld; b.coyote = 0; b.air = 1;
    return { on: null, kind: 'bounce', head: best, impact };
  }
  b.vy = 0; b.grounded = true; b.jumping = false; b.air = 0; b.coyote = P.coyote;
  return { on: best.id, kind: 'land', head: best, impact };
}
