// Pure home-region annex layout. North is -Z (screen top); puzzle rules are future work.
export const RITUAL = {
  island: { x: -48, z: 43, radius: 9 },
  circle: { x: -48, z: 45, radius: 3.2 },
  path: { ax: -32, az: 28, cx: -33, cz: 39, bx: -44, bz: 43, halfWidth: 1.65 },
  channel: { ax: -50, az: 33, cx: -37, cz: 30, bx: -33, bz: 49 },
  stones: Array.from({ length: 4 }, (_, i) => {
    const a = (-145 + i * 110 / 3) * Math.PI / 180;
    return { x: -48 + Math.cos(a) * 5.8, z: 45 + Math.sin(a) * 5.8,
      height: [2.4, 2.7, 2.55, 2.3][i], width: [1.02, 0.95, 1.06, 0.98][i] };
  }),
};
const smooth = (a, b, v) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function ritualPathPoint(t) {
  const p = RITUAL.path, u = 1 - t;
  return { x: u * u * p.ax + 2 * u * t * p.cx + t * t * p.bx,
    z: u * u * p.az + 2 * u * t * p.cz + t * t * p.bz };
}
const pathSamples = Array.from({ length: 25 }, (_, i) => ritualPathPoint(i / 24));
export function ritualChannelPoint(t) {
  const p = RITUAL.channel, u = 1 - t;
  return { x: u * u * p.ax + 2 * u * t * p.cx + t * t * p.bx,
    z: u * u * p.az + 2 * u * t * p.cz + t * t * p.bz };
}
const channelSamples = Array.from({ length: 25 }, (_, i) => ritualChannelPoint(i / 24));
export function ritualChannelDistance(x, z) {
  let best = Infinity;
  for (let i = 0; i < channelSamples.length - 1; i++) {
    const a = channelSamples[i], b = channelSamples[i + 1], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2);
  }
  return Math.sqrt(best);
}
function pathFrame(x, z) {
  let best = Infinity, along = 0;
  for (let i = 0; i < pathSamples.length - 1; i++) {
    const a = pathSamples[i], b = pathSamples[i + 1], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    const d2 = (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2;
    if (d2 < best) { best = d2; along = (i + t) / 24; }
  }
  return { distance: Math.sqrt(best), along, width: RITUAL.path.halfWidth + 0.25 * Math.sin(along * Math.PI * 3 + 0.3) };
}
export function ritualPathDistance(x, z) { return pathFrame(x, z).distance; }
/** Smooth asymmetry and coastal lobes, with a gently elongated silhouette. */
export function ritualIslandDistance(x, z) {
  const dx = (x - RITUAL.island.x) / 1.06, dz = (z - RITUAL.island.z) / 0.95;
  const a = Math.atan2(dz, dx);
  return Math.hypot(dx, dz) / (1 + 0.09 * Math.sin(3 * a + 0.6) + 0.045 * Math.cos(5 * a - 0.8));
}
/** Hysteresis keeps music from restarting when a player skirts the shoreline. */
export function inRitualArea(x, z, wasInside = false) {
  return ritualIslandDistance(x, z) < (wasInside ? 11 : 9.5);
}
export function ritualInland(x, z) {
  if (x < -63 || x > -25 || z < 21 || z > 57) return -Infinity;
  const p = pathFrame(x, z);
  return Math.max(RITUAL.island.radius - ritualIslandDistance(x, z), p.width - p.distance);
}
export function ritualHeight(x, z) {
  if (x < -63 || x > -25 || z < 21 || z > 57) return -3;
  const d = ritualIslandDistance(x, z), p = pathFrame(x, z);
  const island = -3 + 3.9 * (1 - smooth(6.8, 12, d));
  // A submerged sand shelf keeps the approach wadeable, rather than forming a dry causeway.
  const path = -3 + 2.8 * (1 - smooth(p.width, p.width + 3.5, p.distance));
  return Math.max(island, path);
}
/** Separate the shores with a gently curving, irregular shallow-water channel. */
export function ritualTerrain(x, z, homeHeight) {
  const h = Math.max(homeHeight, ritualHeight(x, z));
  if (x < -55 || x > -28 || z < 27 || z > 54) return h;
  const distance = ritualChannelDistance(x, z);
  const width = 2.25 + 0.3 * Math.sin(x * 0.52 + z * 0.31);
  const weight = 1 - smooth(width, width + 3.4, distance);
  // Only ankle-deep (movement blocks below -0.35), with gentle sand ripples below the ocean.
  const bed = -0.21 + 0.025 * Math.sin(x * 0.8) * Math.cos(z * 0.6);
  const channelHeight = h + (bed - h) * weight;
  const p = pathFrame(x, z);
  // A broad, invisible sandy ramp under the shallows removes the lip at the island's landing.
  const rampWeight = smooth(0.52, 0.62, p.along) * (1 - smooth(p.width + 0.5, p.width + 2, p.distance));
  const ramp = -0.2 + 1.1 * smooth(0.68, 1, p.along);
  return channelHeight + (ramp - channelHeight) * rampWeight;
}
/** Reserve the island and approach so procedural props cannot obstruct the route or circle. */
export function ritualReserved(x, z, padding = 0) {
  if (x < -64 - padding || x > -25 + padding || z < 21 - padding || z > 57 + padding) return false;
  return ritualIslandDistance(x, z) < 12 + padding
    || ritualPathDistance(x, z) < 3 + padding;
}
