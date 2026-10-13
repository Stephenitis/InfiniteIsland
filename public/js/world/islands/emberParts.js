// Emberleaf's boat-part courses (Step 68b): pure layouts placed in existing seeded clearings.
// partLayouts(island, terrain) -> {sail,rudder,compass}: course + dressing anchors in WORLD coordinates.
// partCourses(island, terrain) -> [course]; PART_SITES are island-local and never claim placement solids.
// Courses remain registered after collection; visuals and pickups are owned by world/boatParts.js.
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
    backDown: { from: { x: goal.x, z: goal.z, y: goal.top }, to: exit, width: 1.8, label: 'Back down' },
    ...extra,
  };
}
function spiral(part, a) {
  const q = B[part], pads = [], links = [], route = [];
  // Two turns keep each later tier well above the one below: no hidden side walls at a landing.
  const count = q.steps, increment = TAU / 12;
  const base = a.y + 0.15;
  for (let n = 0; n <= count; n++) {
    const angle = Math.PI + n * increment, id = `${part}-${n}`;
    const p = { id, kind: part === 'compass' ? 'wet' : n % 3 === 0 ? 'bamboo' : 'stump',
      x: a.x + Math.cos(angle) * q.radius, z: a.z + Math.sin(angle) * q.radius,
      r: n === 0 || n === count - 1 ? 1.35 : 1.15, top: base + n * q.rise,
      cp: n === 0 || n === Math.floor(count / 2) || n === count - 1 };
    p.base = p.top - 0.25;  // stacked brackets / wet ledges leave headroom below their next turn
    if (part === 'sail' && n > 0 && n < count - 1 && n % 3 === 0) {
      p.r = 1.5; // Broad caps keep the larger visible sway forgiving.
      p.motion = { kind: 'sway', axis: [-Math.sin(angle), Math.cos(angle)], amp: q.sway, period: q.period, phase: n / 12 };
    }
    pads.push(p); route.push(id);
    if (n) links.push({ a: route[n - 1], b: id });
  }
  return finish(part, a, pads, links, route);
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
      cp: n === 0 || n === Math.floor(q.rocks / 2) });
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
  pads.push({ id: 'rudder-rest', kind: 'rock', x: a.x + dx * 0.5, z: a.z + dz * 0.5, r: 1.25, top: top + 0.2, cp: true },
    { id: 'rudder-goal', kind: 'rock', x: a.x, z: a.z, r: 1.35, top: top + 0.4 });
  links.push({ a: last.id, b: 'rudder-rest' }, { a: 'rudder-rest', b: 'rudder-goal' });
  route.push('rudder-rest', 'rudder-goal');
  const start = pads[0], toe = { x: start.x, z: a.z + 9.7, y: terrain.height(start.x, a.z + 9.7) };
  return finish('rudder', a, pads, links, route, { backDown: { from: { x: a.x, z: a.z, y: top + 0.4 }, to: { x: a.x + 8.8 * Math.cos(Math.PI * 3 / 8), z: a.z + 8.8 * Math.sin(Math.PI * 3 / 8), y: terrain.height(a.x + 8.8 * Math.cos(Math.PI * 3 / 8), a.z + 8.8 * Math.sin(Math.PI * 3 / 8)) }, width: 1.8, label: 'Back down' }, approach: { from: toe, to: { x: start.x, z: start.z, y: start.top }, width: 1.8 }, hazard: { x: a.x, z: a.z, r: 8.2, y: lavaY, kind: 'lava' }, splashY: lavaY - 0.7, rows });
}
export function partLayouts(island = ember(), terrain = getIslandModule('ember')) {
  if (cache.has(island)) return cache.get(island);
  const sail = anchor(island, terrain, 'sail'), rudder = anchor(island, terrain, 'rudder'), compass = anchor(island, terrain, 'compass');
  const sc = spiral('sail', sail), rc = cooling(rudder), cc = spiral('compass', compass);
  const bell = cc.pads.find((p) => p.id === cc.route[cc.route.length - 2]);
  const layouts = {
    sail: { anchor: sail, course: sc, tree: { ...sail, r: 2, height: B.sail.steps * B.sail.rise + 3 } },
    rudder: { anchor: rudder, course: rc, lava: { x: rudder.x, z: rudder.z, y: rc.hazard.y, r: rc.hazard.r } },
    compass: { anchor: compass, course: cc, bell: { x: bell.x, z: bell.z, y: bell.top }, headland: { ...compass, r: 2.0, height: 6 } },
  };
  cache.set(island, layouts); return layouts;
}
export function partCourses(island = ember(), terrain = getIslandModule('ember')) {
  return Object.values(partLayouts(island, terrain)).map((p) => p.course);
}
