// Pure seeded blue-noise placement. Shapes use local x/z coordinates: circle {x,z,r},
// rect {x0,x1,z0,z1}, polygon {points:[{x,z}]}, sector {x,z,r0,r1,start,end} (radians).
// distanceToShape is signed (negative inside). Footprints and clearance apply to every keep-out.
import { mulberry32 } from '../../utils/rng.js';

const TAU = Math.PI * 2;
const mod = a => (a % TAU + TAU) % TAU;
function segment(x, z, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
}
export function distanceToShape(s, x, z) {
  if (s.type === 'circle') return Math.hypot(x - s.x, z - s.z) - s.r;
  if (s.type === 'rect') {
    const dx = Math.abs(x - (s.x0 + s.x1) / 2) - (s.x1 - s.x0) / 2;
    const dz = Math.abs(z - (s.z0 + s.z1) / 2) - (s.z1 - s.z0) / 2;
    return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
  }
  if (s.type === 'sector') {
    const dx = x - s.x, dz = z - s.z, r = Math.hypot(dx, dz), a = mod(Math.atan2(dz, dx) - s.start);
    const span = s.end - s.start >= TAU ? TAU : mod(s.end - s.start);
    if (span === TAU) return Math.max((s.r0 || 0) - r, r - s.r1);
    const edge = angle => segment(x, z,
      { x: s.x + Math.cos(angle) * (s.r0 || 0), z: s.z + Math.sin(angle) * (s.r0 || 0) },
      { x: s.x + Math.cos(angle) * s.r1, z: s.z + Math.sin(angle) * s.r1 });
    if (a > span) return Math.min(edge(s.start), edge(s.end));
    return Math.max((s.r0 || 0) - r, r - s.r1, -Math.min(edge(s.start), edge(s.end)));
  }
  if (s.type !== 'polygon' || s.points.length < 3) throw new Error('Invalid scatter shape');
  let inside = false, d = Infinity;
  const p = s.points;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
    d = Math.min(d, segment(x, z, a, b));
  }
  return inside ? -d : d;
}
export const insideShape = (s, x, z, margin = 0) => distanceToShape(s, x, z) <= -margin;
function bounds(s) {
  if (s.type === 'rect') return s;
  if (s.type === 'polygon') return { x0: Math.min(...s.points.map(p => p.x)), x1: Math.max(...s.points.map(p => p.x)), z0: Math.min(...s.points.map(p => p.z)), z1: Math.max(...s.points.map(p => p.z)) };
  const r = s.r1 ?? s.r;
  return { x0: s.x - r, x1: s.x + r, z0: s.z - r, z1: s.z + r };
}

/** Parents have 1..4 smaller companions. Rejection sampling + a spatial hash enforces
 * blue-noise spacing. density(distance, point) is a probability, distance = nearest play shape.
 * layer(distance, point) can override the default foreground/mid/back depth bands. */
export function scatter({ seed = 82, shape, keepOut = [], count = 40, minDistance = 1,
  radius = 0, clearance = 0, cluster = true, clusterRadius = 3, size = [0.7, 1.3],
  playArea = keepOut, density = () => 1, layer = (d, p) => p.z > 6 ? 'foreground' : p.z < -24 ? 'back' : 'mid',
  accept = () => true, attempts = count * 200 } = {}) {
  if (!(minDistance > 0) || !shape) throw new Error('Scatter needs a shape and positive spacing');
  const rng = mulberry32(seed), b = bounds(shape), out = [], cells = new Map();
  const cell = (x, z) => `${Math.floor(x / minDistance)},${Math.floor(z / minDistance)}`;
  let parent = null, left = 0;
  for (let n = 0; n < attempts && out.length < count; n++) {
    const child = cluster && parent && left > 0;
    const a = rng() * TAU, r = minDistance + rng() * clusterRadius;
    const x = child ? parent.x + Math.cos(a) * r : b.x0 + rng() * (b.x1 - b.x0);
    const z = child ? parent.z + Math.sin(a) * r : b.z0 + rng() * (b.z1 - b.z0);
    if (child) left--;
    const parentSize = size[0] + rng() * (size[1] - size[0]);
    const scale = child ? parent.scale * (0.5 + rng() * 0.25) : parentSize;
    const footprint = radius * scale;
    if (!insideShape(shape, x, z, footprint) || keepOut.some(s => distanceToShape(s, x, z) < footprint + clearance)) continue;
    const distance = playArea.length ? Math.max(0, Math.min(...playArea.map(s => distanceToShape(s, x, z)))) : Math.max(b.x1 - b.x0, b.z1 - b.z0);
    const p = { x, z, scale, yaw: rng() * TAU, lean: (rng() - 0.5) * 0.08, parent: child ? parent.id : null, distance };
    p.layer = layer(distance, p);
    if (rng() >= density(distance, p) || !accept(p)) continue;
    let crowded = false;
    const cx = Math.floor(x / minDistance), cz = Math.floor(z / minDistance);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
      for (const q of cells.get(`${cx + i},${cz + j}`) || []) if (Math.hypot(x - q.x, z - q.z) < minDistance) crowded = true;
    if (crowded) continue;
    p.id = out.length; out.push(p);
    const k = cell(x, z); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(p);
    if (!child) { parent = p; left = 1 + Math.floor(rng() * 4); }
  }
  return out;
}
