// Emberleaf's boat-part courses (Step 68b): pure layouts placed in existing seeded clearings.
// partLayouts(island, terrain) -> {sail,rudder,compass}: course + dressing anchors in WORLD coordinates.
// partCourses(island, terrain) -> [course]; PART_SITES are island-local and never claim placement solids.
// Courses remain registered after collection; visuals and pickups are owned by world/boatParts.js.
// Step 68e: sail / compass are a camera-facing switchback (see switchback()); partLayouts(...)[part].occluders = the trunk / headland cylinders the camera-cover fade uses.
import { ISLANDS, BOAT_COURSES as B } from '../../config.js';
import { getIslandModule } from './registry.js';

export const PART_SITES = {
  sail: { x: 47, z: 88, keepClear: 10 },
  rudder: { x: -39, z: -8, keepClear: 10 },
  compass: { x: 101, z: 17, keepClear: 11 },
};
const TAU = Math.PI * 2;
const ember = () => ISLANDS.find((i) => i.id === 'ember');
const cache = new WeakMap();
function anchor(island, terrain, part) {
  const p = PART_SITES[part], x = island.x + p.x, z = island.z + p.z;
  return { x, z, y: terrain.height(x, z) };
}
function finish(part, a, pads, links, route, extra = {}) {
  const goal = pads.find((p) => p.id === route[route.length - 1]);
  const start = pads.find((p) => p.id === route[0]);
  const dx = start.x - a.x, dz = start.z - a.z, d = Math.hypot(dx, dz);
  const exit = { x: a.x + dx / d * 8.8, z: a.z + dz / d * 8.8 };
  exit.y = getIslandModule('ember').height(exit.x, exit.z);
  return {
    id: `boat-${part}`, part, name: { sail: 'Canopy scaffold', rudder: 'Cooling crusts', compass: 'Spray steps' }[part],
    zone: { x: a.x, z: a.z, r: PART_SITES[part].keepClear }, gapY: -0.05,
    pads, links, route, start: start.id, goal: goal.id,
    backDown: { from: { x: goal.x, z: goal.z, y: goal.top }, to: exit, width: 1.8, label: 'Slide back down' },
    ...extra,
  };
}
// Step 68e: the sail / compass climb is a camera-facing switchback (the follow camera looks toward -Z, so +Z is the visible side): `rows` runs of `per` pads, alternating direction,
// with a broad turn landing at the start of every run after the first. Every route pad keeps z >= anchor.z - 0.5, so the trunk / headland (placed BEHIND the goal) never hides one.
// Tops: start = the ground under it + 0.15 (walk straight on), then +rise per pad; a checkpoint (flag) every 4th pad and on the pad before the goal. The goal is the last pad of the last run.
const SIDES = {
  // optional exit slide (island-local offsets from the anchor) and the occluder (trunk / headland) beside the goal
  sail: { exit: { x: 9.3, z: -1.8 }, trunk: { x: 6.8, z: -3.7, r: 1.4 } },
  compass: { exit: { x: 3.2, z: -8.6 }, trunk: { x: 8.9, z: -0.4, r: 1.9 } },
};
function switchback(part, a) {
  const q = B[part], T = getIslandModule('ember'), per = (q.steps + 1) / q.rows.length, pads = [], links = [], route = [];
  const xs = Array.from({ length: per }, (_, k) => (k - (per - 1) / 2) * q.pitch);
  const spot = (n) => { const r = Math.floor(n / per), k = n % per; return { x: a.x + (r % 2 ? xs[per - 1 - k] : xs[k]), z: a.z + q.rows[r] }; };
  const s0 = spot(0), base = T.height(s0.x, s0.z) + 0.15;
  for (let n = 0; n <= q.steps; n++) {
    const s = spot(n), id = `${part}-${n}`, goal = n === q.steps, turn = n > 0 && n % per === 0, cp = n % 4 === 0 || n === q.steps - 1;
    const p = { id, kind: part === 'compass' ? (n % 3 === 2 && !goal ? 'wet' : 'rock') : n % 3 === 0 ? 'bamboo' : 'stump',
      x: s.x, z: s.z, r: turn || goal ? q.turnR : q.padR, top: base + n * q.rise, cp };
    p.base = p.top - 0.25;           // thin slabs on posts: nothing stacks over a pad, and the supports are dressing
    if (cp) p.flag = true;
    if (part === 'compass' && p.kind === 'rock') p.moss = true;   // the dry steps wear a ring of moss (the wet ones are the slippery blue)
    pads.push(p); route.push(id);
    if (n) links.push({ a: route[n - 1], b: id });
  }
  if (part === 'sail') {
    // Two optional swaying stones north of the last run, bypassing a pad each (the old swaying caps; the required route never uses them).
    for (const [k, i] of [[0, 8], [1, 10]]) {
      const lo = pads[i], hi = pads[i + 1], id = `sail-sway-${k}`;
      pads.push({ id, kind: 'bamboo', x: (lo.x + hi.x) / 2, z: lo.z - 3.5, r: q.padR, top: lo.top + 0.15, base: lo.top - 0.1,
        motion: { kind: 'sway', axis: [0, 1], amp: q.sway, period: q.period, phase: k / 2 } });
      links.push({ a: lo.id, b: id, optional: true }, { a: id, b: hi.id, optional: true });
    }
  }
  const goal = pads[q.steps], side = SIDES[part], exit = { x: a.x + side.exit.x, z: a.z + side.exit.z };
  exit.y = T.height(exit.x, exit.z);
  return finish(part, a, pads, links, route, { backDown: { from: { x: goal.x, z: goal.z, y: goal.top }, to: exit, width: 1.8, label: 'Slide back down' } });
}
function cooling(a) {
  const q = B.rudder, pads = [], links = [], route = [], rows = [];
  // Lift the contained pool above the existing slope; a ramp joins it without carving terrain.
  let high = a.y;
  const terrain = getIslandModule('ember');
  for (let x = -8.2; x <= 8.2; x += 0.4) for (let z = -8.2; z <= 8.2; z += 0.4) {
    if (Math.hypot(x, z) <= 8.2) high = Math.max(high, terrain.height(a.x + x, a.z + z));
  }
  const lavaY = high + 0.2, top = lavaY + 0.45;
  for (let n = 0; n < q.rocks; n++) {
    const angle = Math.PI / 2 + n * TAU / q.rocks;
    const id = `rudder-rock-${n}`;
    pads.push({ id, kind: 'rock', x: a.x + Math.cos(angle) * q.radius, z: a.z + Math.sin(angle) * q.radius, r: 1.25, top,
      cp: n === 0 || n === Math.floor(q.rocks / 2), flag: n === 0 || n === Math.floor(q.rocks / 2) });
    route.push(id);
    if (n === q.rocks - 1) continue;
    const mid = angle + Math.PI / q.rocks, row = [];
    for (let k = 0; k < 2; k++) {
      const crust = `rudder-crust-${n}-${k}`, radius = q.radius + (k ? -0.65 : 0.65);
      pads.push({ id: crust, kind: 'crust', x: a.x + Math.cos(mid) * radius, z: a.z + Math.sin(mid) * radius,
        r: 1.0, top, motion: { kind: 'sink', period: q.period, phase: (n / q.rocks + k * 0.5) % 1, down: q.down, warn: q.warn } });
      links.push({ a: id, b: crust, wait: true, optional: !!k }, { a: crust, b: `rudder-rock-${n + 1}`, wait: true, optional: !!k });
      row.push(crust);
    }
    rows.push(row); route.push(row[0]);
  }
  const last = pads.find((p) => p.id === route[route.length - 1]);
  const dx = last.x - a.x, dz = last.z - a.z;
  pads.push({ id: 'rudder-rest', kind: 'rock', x: a.x + dx * 0.5, z: a.z + dz * 0.5, r: 1.25, top: top + 0.2, cp: true, flag: true },
    { id: 'rudder-goal', kind: 'rock', x: a.x, z: a.z, r: 1.35, top: top + 0.4 });
  links.push({ a: last.id, b: 'rudder-rest' }, { a: 'rudder-rest', b: 'rudder-goal' });
  route.push('rudder-rest', 'rudder-goal');
  const start = pads[0], toe = { x: start.x, z: a.z + 9.7, y: terrain.height(start.x, a.z + 9.7) };
  return finish('rudder', a, pads, links, route, { backDown: { from: { x: a.x, z: a.z, y: top + 0.4 }, to: { x: a.x + 8.8 * Math.cos(Math.PI * 3 / 8), z: a.z + 8.8 * Math.sin(Math.PI * 3 / 8), y: terrain.height(a.x + 8.8 * Math.cos(Math.PI * 3 / 8), a.z + 8.8 * Math.sin(Math.PI * 3 / 8)) }, width: 1.8, label: 'Slide back down' }, approach: { from: toe, to: { x: start.x, z: start.z, y: start.top }, width: 1.8, label: 'Climb' }, hazard: { x: a.x, z: a.z, r: 8.2, y: lavaY, kind: 'lava' }, splashY: lavaY - 0.7, rows });
}
export function partLayouts(island = ember(), terrain = getIslandModule('ember')) {
  if (cache.has(island)) return cache.get(island);
  const sail = anchor(island, terrain, 'sail'), rudder = anchor(island, terrain, 'rudder'), compass = anchor(island, terrain, 'compass');
  const sc = switchback('sail', sail), rc = cooling(rudder), cc = switchback('compass', compass);
  const bell = cc.pads.find((p) => p.id === cc.route[cc.route.length - 2]);
  const T = getIslandModule('ember'), goalTop = (c) => c.pads.find((p) => p.id === c.goal).top;
  // The trunk / headland stands beside the goal (never over a route pad); `occluders` = the vertical cylinders the camera-cover fade tests (world/boatParts.js, islands/duskFade.js).
  const tw = { x: sail.x + SIDES.sail.trunk.x, z: sail.z + SIDES.sail.trunk.z }, ty = T.height(tw.x, tw.z), th = goalTop(sc) - ty + 3.4;
  const hw = { x: compass.x + SIDES.compass.trunk.x, z: compass.z + SIDES.compass.trunk.z }, hy = -1.2, hh = goalTop(cc) + 1.4 - hy;
  const layouts = {
    sail: { anchor: sail, course: sc, tree: { ...tw, y: ty, r: SIDES.sail.trunk.r, height: th },
      occluders: [{ x: tw.x, z: tw.z, r: SIDES.sail.trunk.r, y0: ty, y1: ty + th }, { x: tw.x, z: tw.z, r: 4.2, y0: ty + th - 0.5, y1: ty + th + 2.7 }] },
    rudder: { anchor: rudder, course: rc, lava: { x: rudder.x, z: rudder.z, y: rc.hazard.y, r: rc.hazard.r }, occluders: [] },
    compass: { anchor: compass, course: cc, bell: { x: bell.x, z: bell.z, y: bell.top }, headland: { ...hw, y: hy, r: SIDES.compass.trunk.r, height: hh },
      occluders: [{ x: hw.x, z: hw.z, r: SIDES.compass.trunk.r, y0: hy, y1: hy + hh }] },
  };
  cache.set(island, layouts); return layouts;
}
export function partCourses(island = ember(), terrain = getIslandModule('ember')) {
  return Object.values(partLayouts(island, terrain)).map((p) => p.course);
}
