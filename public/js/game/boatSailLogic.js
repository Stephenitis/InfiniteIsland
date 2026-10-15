// Step 71 pure rules for sailing Marlo's boat between the Emberleaf dock and the Duskcrown dock. Runtime: boatSail.js (the sync domain), boatSailScene.js (camera / crew / hull), world/duskDock.js.
//
//   otherIsland(at)                          'ember' <-> 'duskcrown'
//   sailRule(state, { to, pos, dock, range, busy, debug })  -> null | 'bad-request' | 'locked' | 'there' | 'busy' | 'far'    (the host's gate for request `sail {to}`)
//   applyArrival(state, to)                  mutates: at = to, discovered = true; returns { first } (first = Duskcrown had never been reached)
//   sailBerths(coveL, duskL)                 { ember: { x, z, yaw, seaward: {x, z} }, duskcrown: {...} }     where the hull lies at each dock, and which way is open water
//   sailArrivals(coveL, duskL)               { ember: [4 x {x, z, y}], duskcrown: [4 x {x, z, y: null}] }   one place per global player slot, used by every screen (no negotiation)
//   makeRoute(from, to)                      the crossing path (cubic Bezier, resampled by arc length): { length, at(u) -> {x, z, tx, tz}, samples }
//   sailU(t) / sailBeat(t) / sailPose(t, route, from, to)         time -> distance fraction / beat { name, k } / boat { x, z, yaw, sail, u }
//   sailCamera(t, pose) -> { pos: [x, y, z], look: [x, y, z] }    the chase / wide / reveal shots (pure; the scene adds the ease from the follow camera)
//   sailHint(t, route)                       the ground point the region manager treats as the view centre (a little ahead of the boat)
//   sailRegion(t, from, to)                  the music / ambience region during the crossing: null until the open sea beat, then the destination
//   crewSpot(slot) / crewWorld(pose, slot)   where each passenger stands on the deck
import { SAIL } from '../config.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
const lerp = (a, b, k) => a + (b - a) * k;
export const ISLANDS_SAILED = ['ember', 'duskcrown'];

export const otherIsland = (at) => (at === 'duskcrown' ? 'ember' : 'duskcrown');

export function sailRule(state, { to, pos = null, dock = null, range = SAIL.dock, busy = false, debug = false } = {}) {
  if (!ISLANDS_SAILED.includes(to)) return 'bad-request';
  if (!state.unlocked || !state.launched) return 'locked';
  if (state.at === to) return 'there';
  if (busy) return 'busy';
  if (!debug && (!pos || !dock || Math.hypot(pos.x - dock.x, pos.z - dock.z) > range)) return 'far';
  return null;
}

export function applyArrival(state, to) {
  const first = to === 'duskcrown' && !state.discovered;
  state.at = to;
  if (to === 'duskcrown') state.discovered = true;
  return { first };
}

export function sailBerths(cove, dusk) {
  const f = cove.frame, m = f.to(4.4, -1.8);
  return {
    ember: { x: m.x, z: m.z, yaw: cove.wreck.yaw, seaward: { x: f.out[0], z: f.out[1] }, out: SAIL.approach.ember },
    duskcrown: { x: dusk.berth.x, z: dusk.berth.z, yaw: dusk.berth.yaw, seaward: { ...dusk.seaward }, out: SAIL.approach.duskcrown },
  };
}

export function sailArrivals(cove, dusk) {
  const f = cove.frame, top = 0.65;
  const ember = [0, 1, 2, 3].map((i) => { const p = f.to(-2.2 + i * 1.2, -1.8); return { x: p.x, z: p.z, y: top }; });      // along the dock's deck (it spans s -2.8 .. 4.8 at t -1.8)
  const duskcrown = [0, 1, 2, 3].map((i) => { const a = dusk.arrive[i % dusk.arrive.length]; return { x: a.x, z: a.z, y: null }; });
  return { ember, duskcrown };
}

// ---- the path ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function makeRoute(from, to, { lead = from.out ?? 70, tail = to.out ?? 100, n = 240 } = {}) {
  const p0 = [from.x, from.z], p1 = [from.x + from.seaward.x * lead, from.z + from.seaward.z * lead];
  const p2 = [to.x + to.seaward.x * tail, to.z + to.seaward.z * tail], p3 = [to.x, to.z];
  const bez = (t) => {
    const a = (1 - t) ** 3, b = 3 * t * (1 - t) ** 2, c = 3 * t * t * (1 - t), d = t ** 3;
    return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
  };
  const pts = [], acc = [0];
  for (let i = 0; i <= n; i++) { const q = bez(i / n); pts.push(q); if (i) acc.push(acc[i - 1] + Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1])); }
  const length = acc[n];
  function at(u) {
    const s = clamp(u) * length;
    let lo = 0, hi = n;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (acc[mid] <= s) lo = mid; else hi = mid; }
    const seg = acc[hi] - acc[lo] || 1, k = (s - acc[lo]) / seg, a = pts[lo], b = pts[hi];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    return { x: lerp(a[0], b[0], k), z: lerp(a[1], b[1], k), tx: dx / l, tz: dz / l };
  }
  return { length, at, from, to, samples: pts };
}

// ---- time ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Distance fraction at each beat boundary; a monotone Hermite through them keeps the speed continuous and never runs backwards.
const KNOTS = [[0, 0], [2.4, 0], [SAIL.leave, 0.3], [SAIL.sea, 0.56], [SAIL.rise, 0.94], [SAIL.end, 1]];
const SLOPES = (() => {
  const d = KNOTS.slice(1).map((k, i) => (k[1] - KNOTS[i][1]) / (k[0] - KNOTS[i][0]));
  return KNOTS.map((_, i) => (i === 0 || i === KNOTS.length - 1 ? 0 : d[i - 1] === 0 || d[i] === 0 ? 0 : (d[i - 1] + d[i]) / 2));
})();
export function sailU(t) {
  if (t <= 0) return 0;
  if (t >= SAIL.end) return 1;
  let i = 0;
  while (i < KNOTS.length - 2 && t > KNOTS[i + 1][0]) i++;
  const [t0, u0] = KNOTS[i], [t1, u1] = KNOTS[i + 1], h = t1 - t0, s = (t - t0) / h, s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * u0 + (s3 - 2 * s2 + s) * h * SLOPES[i] + (-2 * s3 + 3 * s2) * u1 + (s3 - s2) * h * SLOPES[i + 1];
}
export function sailBeat(t) {
  const names = [['board', 0, SAIL.board], ['leave', SAIL.board, SAIL.leave], ['sea', SAIL.leave, SAIL.sea], ['rise', SAIL.sea, SAIL.rise], ['arrive', SAIL.rise, SAIL.end]];
  for (const [name, a, b] of names) if (t < b) return { name, k: clamp((t - a) / (b - a)) };
  return { name: 'arrive', k: 1 };
}

const angleLerp = (a, b, k) => { let d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * k; };
export function sailPose(t, route) {
  const u = sailU(t), p = route.at(u);
  const heading = Math.atan2(p.tx, p.tz);
  let yaw = angleLerp(route.from.yaw, heading, smooth(u / 0.05));
  yaw = angleLerp(yaw, route.to.yaw, smooth((u - 0.93) / 0.07));
  const sail = smooth((t - 2) / 1.2) * (1 - smooth((t - (SAIL.end - 1.8)) / 1.2));
  return { x: p.x, z: p.z, yaw, sail, u, heading };
}

// ---- camera ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Keys of { back, side, up, ahead, lookUp } in the boat's heading frame: close chase while boarding, a pull-back as the cove drops behind, a high wide shot over open water,
// the reveal looking far ahead as the isle rises, then a low arrival view. Interpolated with smoothstep between keys.
const CAM = [
  [0, { back: 12, side: 10, up: 8, ahead: 0, lookUp: 2 }],
  [SAIL.board, { back: 18, side: 9, up: 8.5, ahead: 2, lookUp: 2 }],
  [SAIL.leave, { back: 34, side: 14, up: 18, ahead: 12, lookUp: 3 }],
  [SAIL.sea, { back: 46, side: 8, up: 26, ahead: 40, lookUp: 6 }],
  [SAIL.rise, { back: 40, side: -6, up: 20, ahead: 48, lookUp: 8 }],
  [SAIL.end - 1, { back: 16, side: -8, up: 9, ahead: 8, lookUp: 2 }],
  [SAIL.end, { back: 13, side: -7, up: 7, ahead: 5, lookUp: 1.5 }],
];
export function camParams(t) {
  if (t <= CAM[0][0]) return { ...CAM[0][1] };
  for (let i = 0; i < CAM.length - 1; i++) {
    const [t0, a] = CAM[i], [t1, b] = CAM[i + 1];
    if (t <= t1) { const k = smooth((t - t0) / (t1 - t0)); const o = {}; for (const key of Object.keys(a)) o[key] = lerp(a[key], b[key], k); return o; }
  }
  return { ...CAM[CAM.length - 1][1] };
}
export function sailCamera(t, pose) {
  const c = camParams(t), hx = Math.sin(pose.heading), hz = Math.cos(pose.heading), sx = Math.cos(pose.heading), sz = -Math.sin(pose.heading);
  return {
    pos: [pose.x - hx * c.back + sx * c.side, c.up, pose.z - hz * c.back + sz * c.side],
    look: [pose.x + hx * c.ahead, c.lookUp, pose.z + hz * c.ahead],
  };
}
export function sailHint(t, route) { const p = route.at(Math.min(1, sailU(t) + SAIL.lead)); return { x: p.x, z: p.z }; }
export function sailRegion(t, from, to) { return t >= SAIL.sea ? to : null; }

// ---- the crew ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const crewSpot = (slot) => ({ along: -1.2 + (Math.max(0, slot) % 4) * 0.8, side: slot % 2 ? 0.2 : -0.2 });
export function crewWorld(pose, slot) {
  const { along, side } = crewSpot(slot), s = Math.sin(pose.yaw), c = Math.cos(pose.yaw);
  return { x: pose.x + s * along + c * side, z: pose.z + c * along - s * side, y: 0.68 };
}
