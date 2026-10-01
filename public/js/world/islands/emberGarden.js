// The Emberleaf terrace garden, pure data (PLAN Step 37a): where it is, how it is painted, the reserved spots for later steps, the decor of the bare site, the signposts and the
// torch posts, plus the RESERVED waterfall corridor (Step 37c) that placement keeps clear. No three.js, so the terrain painter, the prop placement and the Node tests share it.
// Numbers live in config.js (EMBER_GARDEN, EMBER_WATERFALL, PATHS 'ember-garden'); the hearth itself is config FIRES 'ember'.
//
//   polar(island, x, z) -> { d, a }              distance / angle of a WORLD point from the volcano centre (a = atan2(dz, dx); PI/2 = south)
//   fromPolar(island, a, d) -> { x, z }          the inverse (world)
//   gardenCentre(island) -> { x, z }             the hearth (world)
//   gardenDist(island, x, z)                     distance from a WORLD point to the hearth
//   gardenZone(island, x, z, pad)                inside the keep-clear wedge round the terraces (+ pad u)?
//   gardenPaint(island, x, z) -> { w, ring }     dark-soil weight 0..1 (the painter adds its own edge noise) and 0..1 "close to the hearth" (ash)
//   gardenReserved(island, mod) -> { plots[16], mossback, garland, stages[3], tiers }   spots reserved for Steps 37b-40 (world coordinates; plots snapped to the flattest ground)
//   gardenDecor(island, mod) -> { stones, weeds, trellis }   the bare site's dressing (cracked riser stones, weeds, a broken bamboo trellis), seeded
//   gardenSigns(island) -> [{ id, kind, x, z, yaw, pages }]  the two signposts (the landing one points up the trail, the garden one welcomes and points back to the bridge)
//   gardenPosts(island, mod) -> [{ x, z, y, tx, tz, s }]     the torch posts along the trail (path markers, minus any in the reserved stream / pool corridor or on a sign)
//   waterfall(island) -> { fall: [[x, z], [x, z]], pool, stream: [[x, z], ...] }   the reserved waterfall in world coordinates
//   waterfallForbidden(island, x, z, pad)        inside the reserved fall line / plunge pool / stream corridor (+ pad)?
//   waterfallFord(island) -> { x, z, s }         where the trail crosses the reserved stream (a shallow walkable ford in 37c)
import { EMBER_GARDEN as G, EMBER_WATERFALL as W } from '../../config.js';
import { EMBER_FEATURES as F } from './ember.js';
import { sstep, angleDiff } from './util.js';
import { mulberry32 } from '../../utils/rng.js';
import { getPath, pointAt, pathMarkers } from '../paths.js';
import { polyDist } from './scatter.js';

export function polar(island, x, z) {
  const dx = x - island.x - F.volcano.x, dz = z - island.z - F.volcano.z;
  return { d: Math.hypot(dx, dz), a: Math.atan2(dz, dx) };
}
export const fromPolar = (island, a, d) => ({ x: island.x + F.volcano.x + Math.cos(a) * d, z: island.z + F.volcano.z + Math.sin(a) * d });

export const gardenCentre = (island) => ({ x: island.x + G.x, z: island.z + G.z });
export const gardenDist = (island, x, z) => Math.hypot(x - island.x - G.x, z - island.z - G.z);

export function gardenZone(island, x, z, pad = 0) {
  const { d, a } = polar(island, x, z);
  return d > G.zone.d0 - pad && d < G.zone.d1 + pad && angleDiff(a, G.zone.a) < G.zone.half + pad / Math.max(d, 1);
}

export function gardenPaint(island, x, z) {
  const { d, a } = polar(island, x, z), P = G.paint;
  const wa = 1 - sstep(P.half - P.edge, P.half, angleDiff(a, G.zone.a));
  const wr = sstep(P.d0 - 1.2, P.d0 + 1.2, d) * (1 - sstep(P.d1 - 1.8, P.d1 + 0.4, d));
  return { w: wa * wr, ring: 1 - sstep(2.2, 5.2, gardenDist(island, x, z)) };
}

// ---------------------------------------------------------------------------------------------
// Reserved spots
// ---------------------------------------------------------------------------------------------
const tierOf = (id) => G.tiers.find((t) => t.id === id);
const grad = (mod, x, z) => Math.hypot(mod.height(x + 0.5, z) - mod.height(x - 0.5, z), mod.height(x, z + 0.5) - mod.height(x, z - 0.5));

/** The spot at angle offset `da` (positive = west) from the hearth line on a tier: the flattest ground within +-tier.snap u of the tier's nominal distance. */
function snapTier(island, mod, tier, da) {
  const a = G.zone.a + da;
  let best = null;
  for (let k = -tier.snap; k <= tier.snap + 1e-9; k += 0.2) {
    const p = fromPolar(island, a, tier.d + k);
    const sc = grad(mod, p.x, p.z) + 0.02 * Math.abs(k);
    if (!best || sc < best.sc) best = { ...p, sc };
  }
  return { x: best.x, z: best.z, y: mod.height(best.x, best.z) };
}

export function gardenReserved(island, mod) {
  const plots = [];
  for (const tier of G.tiers) {
    for (const da of tier.plots) {
      plots.push({ i: plots.length, tier: tier.id, da, ...snapTier(island, mod, tier, da), r: 0.75, usable: tier.open.some((o) => Math.abs(o - da) < 1e-9) });
    }
  }
  const spot = (o) => ({ ...snapTier(island, mod, tierOf(o.tier), o.da), r: o.r, tier: o.tier, da: o.da });
  return { plots, mossback: spot(G.mossback), garland: spot(G.garland), stages: G.stages.map(spot) };
}

// ---------------------------------------------------------------------------------------------
// Decor of the bare site (stage 0)
// ---------------------------------------------------------------------------------------------
const hash = (island) => island.seed * 7 + 4217;
export function gardenDecor(island, mod) {
  const rng = mulberry32(hash(island));
  const res = gardenReserved(island, mod);
  const hearth = gardenCentre(island);
  const keep = [...res.plots, res.mossback, res.garland, ...res.stages];
  const stones = [], weeds = [];
  // cracked old stone edging: along each riser, where the ground falls away fastest, with gaps ("broken") and a few knocked-over pieces
  for (const dn of [44.9, 51.7, 58.0]) {
    for (let da = -0.325; da <= 0.3251; da += 0.036) {
      if (rng() < 0.24) continue;                                      // a gap in the edging
      const a = G.zone.a + da + (rng() - 0.5) * 0.012;
      let bestD = dn, bestDrop = -1;
      for (let d = dn - 2.2; d <= dn + 2.2; d += 0.4) {
        const p0 = fromPolar(island, a, d - 0.6), p1 = fromPolar(island, a, d + 0.6);
        const drop = mod.height(p0.x, p0.z) - mod.height(p1.x, p1.z);
        if (drop > bestDrop) { bestDrop = drop; bestD = d; }
      }
      const p = fromPolar(island, a, bestD);
      if (Math.hypot(p.x - hearth.x, p.z - hearth.z) < 5) continue;
      const broken = rng() < 0.3;
      stones.push({
        x: p.x, z: p.z, y: mod.height(p.x, p.z), rot: a + Math.PI / 2 + (rng() - 0.5) * 0.25,
        len: (broken ? 0.4 : 0.7) + rng() * 0.3, hgt: 0.13 + rng() * 0.09, wid: 0.3 + rng() * 0.12, tilt: broken ? (rng() - 0.5) * 0.7 : (rng() - 0.5) * 0.14, shade: Math.floor(rng() * 3),
      });
    }
  }
  // weeds: a few tough tufts on the tiers, clear of the reserved spots and the hearth
  for (let t = 0; t < 400 && weeds.length < 34; t++) {
    const a = G.zone.a + (rng() * 2 - 1) * 0.31, d = 39.5 + rng() * 17.5;
    const p = fromPolar(island, a, d);
    if (Math.hypot(p.x - hearth.x, p.z - hearth.z) < 4.6) continue;
    if (keep.some((k) => Math.hypot(k.x - p.x, k.z - p.z) < (k.r || 0.75) + 0.5)) continue;
    if (grad(mod, p.x, p.z) > 0.5) continue;                           // not on a riser
    weeds.push({ x: p.x, z: p.z, y: mod.height(p.x, p.z), rot: rng() * 6.283, s: 0.7 + rng() * 0.7 });
  }
  // the broken bamboo trellis, leaning against the foot of the cone behind the top row (along the tier, so it reads from the south)
  const tp = fromPolar(island, G.zone.a + 0.1, 39.1);
  const trellis = { x: tp.x, z: tp.z, y: mod.height(tp.x, tp.z), a: G.zone.a + 0.1, poles: 5, spacing: 0.95, r: 0.32 };
  return { stones, weeds, trellis };
}

/** World positions of the trellis poles (so the world registers colliders and the visuals draw them at the same spots). */
export function trellisPoles(island, mod, t) {
  const tx = -Math.sin(t.a), tz = Math.cos(t.a);                       // tangent of the ring at angle a (+ = towards increasing angle)
  const out = [];
  for (let i = 0; i < t.poles; i++) {
    const o = (i - (t.poles - 1) / 2) * t.spacing;
    const x = t.x + tx * o, z = t.z + tz * o;
    out.push({ x, z, y: mod.height(x, z), o });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Waterfall (reserved)
// ---------------------------------------------------------------------------------------------
export function waterfall(island) {
  const a = F.volcano;
  return {
    fall: [fromPolar(island, W.angle, W.from), fromPolar(island, W.angle, W.to)].map((p) => [p.x, p.z]),
    pool: { x: island.x + W.pool.x, z: island.z + W.pool.z, r: W.pool.r },
    stream: W.stream.map(([x, z]) => [island.x + x, island.z + z]),
    volcano: { x: island.x + a.x, z: island.z + a.z },
  };
}
const _wf = new WeakMap();
export function waterfallForbidden(island, x, z, pad = 0) {
  let w = _wf.get(island);
  if (!w) { w = waterfall(island); _wf.set(island, w); }
  return polyDist(w.fall, x, z) < W.half + pad
    || Math.hypot(x - w.pool.x, z - w.pool.z) < w.pool.r + pad
    || polyDist(w.stream, x, z) < W.streamHalf + pad;
}

/** The trail's closest approach to the reserved stream line (its ford). */
export function waterfallFord(island) {
  const p = getPath('ember-garden'), w = waterfall(island);
  let best = null;
  for (let i = 0; i < p.samples.length; i++) {
    const x = island.x + p.samples[i][0], z = island.z + p.samples[i][1], d = polyDist(w.stream, x, z);
    if (!best || d < best.d) best = { d, x, z, s: p.cum[i] };
  }
  return { x: best.x, z: best.z, s: best.s, gap: best.d };
}

// ---------------------------------------------------------------------------------------------
// Signposts + torch posts
// ---------------------------------------------------------------------------------------------
export function gardenSigns(island) {
  const p = getPath('ember-garden');
  if (!p || island.id !== 'ember') return [];
  const a = pointAt(island, p, 6.5, 3.4);
  const b = pointAt(island, p, p.length - 4.5, -3.6);                 // (the garden-side, north of the trail's end: nothing tall stands between it and the camera)
  return [
    {
      id: 'ember-sign-landing', kind: 'garden-up', x: a.x, z: a.z, yaw: -0.14,
      pages: ['The Terrace Garden: follow the trail east and then south, past the torches! An old hearth is waiting on the terraces below the fire mountain.'],
    },
    {
      id: 'ember-sign-garden', kind: 'garden-here', x: b.x, z: b.z, yaw: 0.16,
      pages: [
        'The Terrace Garden. Three terraces of warm dark soil, an old hearth and, once, a great many flowers. Take a seat by the fire and cook something tasty.',
        'The bridge back to the home island is far along the trail, to the west.',
      ],
    },
  ];
}

export function gardenPosts(island, mod) {
  const p = getPath('ember-garden');
  if (!p) return [];
  const signs = gardenSigns(island);
  return pathMarkers(island, p)
    .filter((m) => !waterfallForbidden(island, m.x, m.z, 0.4) && signs.every((s) => Math.hypot(s.x - m.x, s.z - m.z) > 2.2))
    .map((m) => ({ x: m.x, z: m.z, y: mod.height(m.x, m.z), tx: m.tx, tz: m.tz, s: m.s }));
}
