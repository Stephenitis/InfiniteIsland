// Storybook pages with friends (Step 51): the PURE rules, Node-tested (test/pageCoop.test.js). No three.js / DOM. game/pageCoop.js is the runtime that applies them, game/pagePlayers.js and
// game/storybook.js call them each frame. Coordinates are WORLD x / y unless a function says "tile"; friends are plain { key, x, y, ... } records so a local body and a remote avatar look the same.
//
//   The shared camera window (one window for every screen):
//   pageWindow(points, opts)         { cx, cy, hw, vx, over, n }: the window that frames every living player ({x, y, vx}); hw = half width in world units at the safe 16:9 shape;
//                                    when the players are further apart than the cap the window centres on their MEAN so the stragglers fall outside it
//   clampWindowX(cx, hw, reach)      keep the window inside the page (the page's two edges are never shown beyond)
//   fitZoom(hw, { halfV1, aspect })  the zoom a screen needs to show AT LEAST the window: portrait phones zoom out (never a cropped playfield), wide screens just show more
//   holdX(body, prevX, win, soft)    the soft wall: a body cannot move outward past the window edge (inward is always free)
//   mostOutside(points, win)         index of the one point farthest outside the window (or -1): only that player is ever "left behind";  lostTick(t, outside, dt) -> the new timer
//   Puffs:
//   driftStep(puff, target, dt)      a puff floats toward a friend's head ({x, y, vx, vy} is changed);   puffTarget(puff, friends) the nearest living friend;   popCandidate(puff, friends)
//   validatePop({ target, by, actor }) host rule: the puffed player really is a puff, the friend lives and is free, one of the two sent it, and they are close
//   Friend toss:
//   validateLift({ actor, target, lifts }) / validateToss({ actor, lifts, mode, face }) / tossLaunch(face, mode, from) / wriggleHop();  lifts = { carrierKey: carriedKey }
//   Latency tolerance for enemy contact:
//   pushHistory(hist, t, x, y) / stompInReach(hist, cur, actor, reach) (host), replicaHurts(steps, sinceStomp) (replica)
//   The pose bits (net/poseBuffer.js field 13): PB flags and codePageTool / pageToolOfCode.
import { PAGE_MP as MP, PLATFORMER as P } from '../config.js';
import { createGrid, createBody, stepBody } from './platformerLogic.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---- the shared camera window -------------------------------------------------------------------------------------------------------------------------
/** points: [{ x, y, vx }] (world). opts: { maxHalf (world half width at the widest zoom for the 16:9 shape), minHalf, margin, vMargin, ratio }. null when nobody is there. */
export function pageWindow(points, opts = {}) {
  if (!points.length) return null;
  const { minHalf = MP.minHalf, maxHalf = 37, margin = MP.margin, vMargin = MP.vMargin, ratio = MP.ratio } = opts;
  let lo = Infinity, hi = -Infinity, loY = Infinity, hiY = -Infinity, sx = 0, sy = 0, sv = 0;
  for (const p of points) {
    lo = Math.min(lo, p.x); hi = Math.max(hi, p.x); loY = Math.min(loY, p.y); hiY = Math.max(hiY, p.y);
    sx += p.x; sy += p.y; sv += p.vx || 0;
  }
  const n = points.length;
  const needH = (hi - lo) / 2 + margin, needV = ((hiY - loY) / 2 + vMargin) * ratio;
  const need = Math.max(needH, needV);
  return {
    cx: needH > maxHalf ? sx / n : (lo + hi) / 2,
    cy: needV > maxHalf ? sy / n : (loY + hiY) / 2,
    hw: Math.min(maxHalf, Math.max(minHalf, need)), vx: sv / n, over: need > maxHalf, n,
  };
}
/** The window never shows beyond the page's two edges (`reach` = half the page length + a margin, world units from the page centre; cx is relative to the page centre). */
export function clampWindowX(cx, hw, reach) {
  if (hw >= reach) return 0;
  return clamp(cx, -reach + hw, reach - hw);
}
/** The camera zoom (1 = the island-sized view at the host's aspect) that shows at least the window: width AND the 16:9 height must fit. halfV1 = half the visible height at zoom 1 on the lane. */
export function fitZoom(hw, { halfV1, aspect, ratio = MP.ratio, minZoom = 1, maxZoom = 12 }) {
  const a = aspect > 0 ? aspect : ratio;
  return clamp(Math.max(hw / (halfV1 * a), hw / ratio / halfV1), minZoom, maxZoom);
}
/** win = { x, y, hw } (world). The visible half height of the safe window is hw / ratio. */
export const windowBox = (win, soft = 0, ratio = MP.ratio) => ({ left: win.x - win.hw + soft, right: win.x + win.hw - soft, bottom: win.y - win.hw / ratio, top: win.y + win.hw / ratio });
/** The soft wall (tile or world coordinates, whatever `left` / `right` use): moving further out than the edge is refused, being out already only lets you come back in. */
export function holdX(b, prevX, left, right) {
  if (b.x > right && b.x > prevX) { b.x = Math.max(prevX, right); if (b.vx > 0) b.vx = 0; return 1; }
  if (b.x < left && b.x < prevX) { b.x = Math.min(prevX, left); if (b.vx < 0) b.vx = 0; return -1; }
  return 0;
}
const outsideBy = (p, win, ratio = MP.ratio) => Math.max(Math.abs(p.x - win.x) - win.hw, Math.abs(p.y - win.y) - win.hw / ratio - (MP.lostVertical - MP.lostOutside));
/** The ONE point farthest outside the window (more than `lostOutside`), or -1. Only that player can be left behind, so two far-apart friends never both turn into puffs. */
export function mostOutside(points, win) {
  let best = -1, bd = MP.lostOutside;
  points.forEach((p, i) => { const d = outsideBy(p, win); if (d > bd) { bd = d; best = i; } });
  return best;
}
/** The "left behind" timer: grows while outside, drains twice as fast inside. -> the new value (>= PAGE_MP.lostDelay means: lost). */
export const lostTick = (t, outside, dt) => (outside ? t + dt : Math.max(0, t - dt * 2));

// ---- dandelion puffs ----------------------------------------------------------------------------------------------------------------------------------
/** friends: [{ key, x, y }] living friends. The nearest to the puff (x, y), or null. */
export function puffTarget(puff, friends) {
  let best = null, bd = Infinity;
  for (const f of friends) { const d = Math.hypot(f.x - puff.x, (f.y + 0.9 - puff.y) * 1.3); if (d < bd) { bd = d; best = f; } }
  return best;
}
/** One frame of drifting: a gentle chase (eased speed, passes through walls). puff = { x, y, vx, vy } is changed in place. */
export function driftStep(puff, target, dt) {
  if (!target) { puff.vx *= Math.max(0, 1 - 4 * dt); puff.vy *= Math.max(0, 1 - 4 * dt); }
  else {
    const dx = target.x - puff.x, dy = target.y + 0.9 - puff.y, d = Math.hypot(dx, dy) || 1;
    const sp = Math.min(MP.puffSpeed, 1.5 + d * 2.2);
    const k = 1 - Math.exp(-5 * dt);
    puff.vx += (dx / d * sp - puff.vx) * k; puff.vy += (dy / d * sp - puff.vy) * k;
  }
  puff.x += puff.vx * dt; puff.y += puff.vy * dt;
  return puff;
}
/** The friend touching the puff (a box round the friend's body), nearest first, or null. */
export function popCandidate(puff, friends) {
  let best = null, bd = Infinity;
  for (const f of friends) {
    const dx = Math.abs(f.x - puff.x), dy = Math.abs(f.y + 0.7 - puff.y);
    if (dx <= MP.popRadius && dy <= MP.popRadiusY && dx + dy < bd) { bd = dx + dy; best = f; }
  }
  return best;
}
/**
 * HOST: may this pop happen? target / by = { key, x, y, puff, carried? } (what the host knows of both players), actor = the requester's key (the puffed player's screen or the friend's).
 * -> { ok: true } | { ok: false, reason }
 */
export function validatePop({ target, by, actor }) {
  if (!target || !by || target.key === by.key) return { ok: false, reason: 'bad-request' };
  if (actor !== target.key && actor !== by.key) return { ok: false, reason: 'bad-request' };
  if (!target.puff) return { ok: false, reason: 'gone' };
  if (by.puff || by.carried) return { ok: false, reason: 'busy' };
  if (Math.abs(target.x - by.x) > MP.popReach + MP.popSlack || Math.abs(target.y - (by.y + 0.7)) > MP.popReach + MP.popSlack) return { ok: false, reason: 'far' };
  return { ok: true };
}
/** Who may respawn at the campfire instead of waiting for a friend: nobody else alive in the page, or the puff has waited long enough. */
export const puffHolds = (livingFriends, age) => livingFriends > 0 && age < MP.puffMaxS;

// ---- friend toss ---------------------------------------------------------------------------------------------------------------------------------------
export const carriedBy = (lifts, key) => { for (const k of Object.keys(lifts)) if (lifts[k] === key) return k; return null; };
const free = (lifts, key) => !(key in lifts) && carriedBy(lifts, key) === null;
/** actor / target = { key, x, y, puff }. The host's rule for picking a friend up: both alive and not already carrying / carried, close enough. */
export function validateLift({ actor, target, lifts }) {
  if (!actor || !target || actor.key === target.key) return { ok: false, reason: 'bad-request' };
  if (actor.puff || target.puff) return { ok: false, reason: 'busy' };
  if (!free(lifts, actor.key) || !free(lifts, target.key)) return { ok: false, reason: 'busy' };
  if (Math.abs(actor.x - target.x) > MP.liftReach + MP.liftSlack || Math.abs(actor.y - target.y) > 1.8 + MP.liftSlack * 0.5) return { ok: false, reason: 'far' };
  return { ok: true };
}
/** A throw / set-down: the actor must be carrying somebody. -> { ok, target } */
export function validateToss({ actor, lifts, mode }) {
  if (!actor) return { ok: false, reason: 'bad-request' };
  const target = lifts[actor.key];
  if (!target) return { ok: false, reason: 'nothing-held' };
  if (!['fwd', 'up', 'down'].includes(mode)) return { ok: false, reason: 'bad-request' };
  return { ok: true, target };
}
/** Launch of a thrown friend: from the carrier's head. x / y tile or world (same as `from`), velocity in tiles / s. */
export function tossLaunch(face, mode, from) {
  const f = face >= 0 ? 1 : -1;
  if (mode === 'up') return { x: from.x + f * 0.1, y: from.y + MP.liftH, vx: f * MP.tossUpVx, vy: MP.tossUpV };
  if (mode === 'down') return { x: from.x + f * 0.9, y: from.y + 0.05, vx: 0, vy: 0 };
  return { x: from.x + f * 0.35, y: from.y + MP.liftH, vx: f * MP.tossVx, vy: MP.tossV };
}
/** A carried player wriggles free (Jump): a small hop off the carrier's head. */
export const wriggleLaunch = (from, face = 1) => ({ x: from.x, y: from.y + MP.liftH, vx: face * 1.2, vy: MP.wriggleHop });
/** Apply a lift record to the host's `lifts` map: { t: 'lift', by, target } / { t: 'drop', by } */
export function applyLiftRec(lifts, rec) {
  if (rec.t === 'lift') { lifts[rec.by] = rec.target; } else if (rec.t === 'drop') delete lifts[rec.by];
  return lifts;
}
/** Stable view for the sync hash. */
export const liftsView = (lifts) => Object.keys(lifts).sort().map((k) => `${k}>${lifts[k]}`);

// ---- latency-tolerant enemy contact ----------------------------------------------------------------------------------------------------------------------
/** HOST: remember where an enemy was for the last `stompHistory` seconds. hist = [{ t, x, y }] (mutated). */
export function pushHistory(hist, t, x, y, keep = MP.stompHistory) {
  const last = hist[hist.length - 1];
  if (!last || t - last.t >= 1 / 30) hist.push({ t, x, y });
  while (hist.length > 1 && t - hist[0].t > keep) hist.shift();
  return hist;
}
/** HOST: was the enemy within reach of the stomping actor NOW or at any remembered moment? cur = { x, y } now, reach = { rx, ry } (already with the usual slack). */
export function stompInReach(hist, cur, actor, reach) {
  const near = (e) => Math.abs(actor.x - e.x) <= reach.rx && Math.abs(actor.y - (e.y + 0.4)) <= reach.ry;
  if (near(cur)) return true;
  for (const h of hist || []) if (near(h)) return true;
  return false;
}
/** REPLICA: a side contact hurts only when it lasted `hurtSteps` fixed steps AND no stomp bounce of our own happened within `hurtGrace` seconds. */
export const replicaHurts = (steps, sinceStomp) => steps >= MP.hurtSteps && sinceStomp >= MP.hurtGrace;

// ---- pose bits (net/poseBuffer.js field 13) -------------------------------------------------------------------------------------------------------------
export const PB = { carryObj: 1, carryFriend: 2, carried: 4, twirl: 8, puffShift: 4, sled: 64, duck: 128 };      // bits 4-5: the puff kind (0 none, 1 pit, 2 hearts, 3 lost); Step 52b: bit 6 = riding a sled, bit 7 = ducking on it
export const PUFF_KINDS = ['none', 'pit', 'hearts', 'lost'];
const TOOL_CODES = ['axe', 'hammer', 'shovel', 'sword'];
export const codePageTool = (kind) => { const i = TOOL_CODES.indexOf(kind); return i < 0 ? 0 : i + 1; };
export const pageToolOfCode = (code) => TOOL_CODES[(code | 0) - 1] || null;
export const packPageBits = ({ carryObj = false, carryFriend = false, carried = false, twirl = false, puff = 'none', sled = false, duck = false } = {}) =>
  (carryObj ? PB.carryObj : 0) | (carryFriend ? PB.carryFriend : 0) | (carried ? PB.carried : 0) | (twirl ? PB.twirl : 0) | (Math.max(0, PUFF_KINDS.indexOf(puff)) << PB.puffShift) | (sled ? PB.sled : 0) | (duck ? PB.duck : 0);
export const unpackPageBits = (bits) => ({
  carryObj: !!(bits & PB.carryObj), carryFriend: !!(bits & PB.carryFriend), carried: !!(bits & PB.carried), twirl: !!(bits & PB.twirl), puff: PUFF_KINDS[(bits >> PB.puffShift) & 3] || 'none', sled: !!(bits & PB.sled), duck: !!(bits & PB.duck),
});

/** How far (tiles) a thrown friend gets: simulated on an open flat grid by the caller; this is the closed form of the apex (no drag): vy^2 / (2 g). */
export const tossApex = (mode = 'fwd') => { const v = mode === 'up' ? MP.tossUpV : MP.tossV; return MP.liftH + (v * v) / (2 * P.gravity); };

/**
 * How far sideways (tiles, whole) a friend thrown from a carrier standing `dy` tiles BELOW a ledge lands on it, falling onto it from the arc's descent, measured by SIMULATING the real body step with no
 * steering after the throw (the better of a forward and an upward throw, a tile of margin for the body's width and a late landing); -1 when the ledge is out of any toss's reach. The page validator
 * uses it for toss berries (game/pageFormat.js).
 */
const _tossMemo = new Map();
function simToss(mode, dy) {
  const rows = Array.from({ length: 30 }, () => '.'.repeat(40)); rows.push('#'.repeat(40));
  const grid = createGrid(rows), y0 = 12, x0 = 5, L = tossLaunch(1, mode, { x: x0, y: y0 });
  const b = createBody(L.x, L.y); b.vx = L.vx; b.vy = L.vy; b.stun = MP.tossLock;
  let apex = b.y;
  for (let i = 0; i < 600; i++) {
    stepBody(grid, b, {});
    apex = Math.max(apex, b.y);
    if (apex >= y0 + dy + 0.1 && b.vy < 0 && b.y <= y0 + dy) return b.x - x0;       // (the arc went above the ledge and is coming down through its height)
    if (b.grounded) break;
  }
  return null;
}
export function tossReach(dy) {
  const key = Math.round(dy);
  if (!_tossMemo.has(key)) {
    let best = -1;
    for (const mode of ['fwd', 'up']) { const dx = simToss(mode, key); if (dx !== null) best = Math.max(best, Math.floor(dx - 0.8)); }
    _tossMemo.set(key, best);
  }
  return _tossMemo.get(key);
}
