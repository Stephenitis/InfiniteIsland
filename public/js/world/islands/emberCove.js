// Skipper's Cove on Emberleaf (PLAN Step 68a): a small sandy cove on the island's south-east shore where Marlo the sea otter's wrecked outrigger lies. Pure data (no three.js): the cove's frame,
// the layout of everything dressing it (wreck, lean-to, Marlo, sign, Biscuit's perch), the tide-pool hop course and the keep-clear test the island's placement reads (like lavaMouth.js).
//
//   COVE                          the island-local anchor (a clearing: no tree, boulder, bamboo, fern, gathering spot, tool, seed, plot or lane within 13 u, found by probing), the seaward angle, keepClear
//   coveFrame(island)             { ax, az (world anchor), out [x, z], tan [x, z], to(s, t) -> {x, z} }   s = u seaward from the anchor (the beach ends at about s 4.2), t = u along the shore (tan = out turned a quarter right)
//   coveLayout(island)            { frame, wreck, leanTo, marlo, sign, perch, bundle (the plank pile beside the hull), course, zoneColliders, rocks }
//   coveReserved(x, z, pad)       props / decor / gathering spots keep this far from the cove (like lavaMouthReserved; the cove claims one solid at the END of the placement, so nothing else moved)
//   coveSigns(island)             the "Skipper's Cove" signpost where the cove spur leaves the garden trail's end
//   TIDE_COURSE                   (inside coveLayout().course) the tutorial course: still stones out to the stern rock, one wide-ish gap with a shortcut stone
import { ISLANDS } from '../../config.js';

/** Island-local anchor of the cove (the sand at the shore), the seaward direction (degrees from +X towards +Z) and the keep-clear radius. */
export const COVE = { x: 89, z: 48, outDeg: 29, keepClear: 11 };

const frames = new WeakMap();
export function coveFrame(island = ISLANDS.find((i) => i.id === 'ember')) {
  let f = frames.get(island);
  if (f) return f;
  const th = (COVE.outDeg * Math.PI) / 180, out = [Math.cos(th), Math.sin(th)], tan = [-out[1], out[0]];
  const ax = island.x + COVE.x, az = island.z + COVE.z;
  f = { ax, az, out, tan, yaw: Math.atan2(out[0], out[1]), to: (s, t) => ({ x: ax + out[0] * s + tan[0] * t, z: az + out[1] * s + tan[1] * t }) };
  frames.set(island, f);
  return f;
}

/** Is (x, z) (radius `pad`) inside the cove's keep-clear disc? */
export function coveReserved(x, z, pad = 0, island = ISLANDS.find((i) => i.id === 'ember')) {
  const f = coveFrame(island);
  return Math.hypot(x - f.ax, z - f.az) < COVE.keepClear + pad;
}

// The tutorial course, in the cove frame (s seaward, t along the shore). Tops are absolute heights (the beach is 0.3, the sea 0): a first still stone on the wet sand, six stones out to the stern rock
// with gaps of 0.9 .. 1.8 u, then the wide-ish 2.2 u jump to the rock itself, which has a shortcut stone beside it that splits that jump in two.
const STONES = [
  { id: 'stone-1', kind: 'rock', s: 3.4, t: -1.0, r: 1.3, top: 0.40, cp: true },
  { id: 'stone-2', kind: 'rock', s: 6.6, t: -1.4, r: 1.0, top: 0.45 },
  { id: 'stone-3', kind: 'stump', s: 9.8, t: -0.7, r: 1.0, top: 0.50 },
  { id: 'stone-4', kind: 'rock', s: 13.2, t: 0.6, r: 0.95, top: 0.45 },
  { id: 'stone-5', kind: 'rock', s: 16.7, t: 1.9, r: 1.3, top: 0.55, cp: true },
  { id: 'stone-6', kind: 'rock', s: 20.6, t: 3.1, r: 1.0, top: 0.50 },
  { id: 'shortcut', kind: 'rock', s: 23.0, t: 1.0, r: 0.9, top: 0.55 },
  { id: 'stern', kind: 'rock', s: 25.0, t: 4.6, r: 1.6, top: 0.65, cp: true },
];
const LINKS = [['stone-1', 'stone-2'], ['stone-2', 'stone-3'], ['stone-3', 'stone-4'], ['stone-4', 'stone-5'], ['stone-5', 'stone-6'], ['stone-6', 'stern'], ['stone-6', 'shortcut', true], ['shortcut', 'stern', true]];

export function coveCourse(island = ISLANDS.find((i) => i.id === 'ember')) {
  const f = coveFrame(island), zone = f.to(13, 1.5);
  return {
    id: 'tide-pools', name: 'Tide-pool stones', zone: { x: zone.x, z: zone.z, r: 17 }, gapY: -0.05,
    pads: STONES.map((p) => { const w = f.to(p.s, p.t); return { id: p.id, kind: p.kind, x: w.x, z: w.z, r: p.r, top: p.top, ...(p.cp ? { cp: true } : {}) }; }),
    links: LINKS.map(([a, b, optional]) => ({ a, b, ...(optional ? { optional: true } : {}) })),
    start: 'stone-1', goal: 'stern', route: ['stone-1', 'stone-2', 'stone-3', 'stone-4', 'stone-5', 'stone-6', 'stern'],
  };
}

export function coveLayout(island = ISLANDS.find((i) => i.id === 'ember')) {
  const f = coveFrame(island), course = coveCourse(island);
  const wreckC = f.to(-0.5, 7.6), leanTo = f.to(-3.2, -6.2), marlo = f.to(0.6, -5.2), sign = f.to(-8.6, 1.6), bundle = f.to(-2.0, 4.0);
  // the shore runs a little out of true (the sand is a low point that reaches out near t 0 and recedes to both sides), so the hull lies along the shore, not along t
  const axis = [f.tan[0] - 0.25 * f.out[0], f.tan[1] - 0.25 * f.out[1]], axisLen = Math.hypot(axis[0], axis[1]);
  axis[0] /= axisLen; axis[1] /= axisLen;
  const stern = course.pads.find((p) => p.id === 'stern');
  return {
    frame: f, course,
    wreck: { x: wreckC.x, z: wreckC.z, yaw: Math.atan2(axis[0], axis[1]), len: 6.4, colliders: [-2.1, 0, 2.1].map((a) => ({ x: wreckC.x + axis[0] * a, z: wreckC.z + axis[1] * a, r: 0.95 })) },
    leanTo: { x: leanTo.x, z: leanTo.z, yaw: f.yaw, r: 1.5 },
    marlo: { x: marlo.x, z: marlo.z, yaw: f.yaw },
    sign: { x: sign.x, z: sign.z, yaw: f.yaw + Math.PI * 0.86 },
    perch: { x: leanTo.x, z: leanTo.z, y: 2.15 },
    bundle: { x: bundle.x, z: bundle.z, yaw: Math.atan2(f.tan[0], f.tan[1]) + 0.2 },
    goal: { x: stern.x, z: stern.z, top: stern.top, part: 'planks' },
    rocks: [[0.8, -8.8, 0.7], [1.8, -7.0, 0.5], [-0.4, 3.8, 0.6], [0.2, 11.2, 0.8], [-0.2, 1.8, 0.45], [1.4, -2.8, 0.5]].map(([s, t, r]) => ({ ...f.to(s, t), r })),
  };
}

/** The "Skipper's Cove" signpost beside the cove spur's last stretch (same shape as gardenSigns entries). */
export function coveSigns(island = ISLANDS.find((i) => i.id === 'ember')) {
  const l = coveLayout(island);
  return [{
    id: 'ember-sign-cove', kind: 'cove', x: l.sign.x, z: l.sign.z, yaw: l.sign.yaw,
    pages: ["Skipper's Cove. A sandy bay on the far shore, with a wrecked boat and a very relaxed sea otter. Follow the trail east and then south-east, along the shore."],
  }];
}
