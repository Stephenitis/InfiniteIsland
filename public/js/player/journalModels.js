// Journal find models: one chunky 3D model per Journal collectible (game/collection.js COLLECTIBLES; Step 72b adds the two Duskcrown fish), shown off by the finder
// in the "look what I found!" pose (world/journalShowcase.js). Deliberately oversized: about 0.6 u across, two thirds of a head.
//
//   createJournalModel(id) -> Group | null
//     origin = the model's visual centre, +Y up, the face that reads best looks toward +Z (the showcase turns +Z to the camera).
//     userData.dispose()   frees the geometry (never the shared material)       userData.fit   size multiplier for the showcase (1 for most; the long Lanternkoi 0.72)
//   JOURNAL_MODEL_IDS      the ids that have a model (every collectible)
//
// Same contract as the hats and tails (player/hats.js, player/tails.js): ONE merged vertex-coloured mesh with the outline hull baked
// in (Baker), drawn with the shared hatMaterial() (no new program; it writes the stencil mark), no shadow = ONE draw call per model.
// Primitives are unit-sized and placed by a matrix, so the hull thickness is OUT divided by the primitive's largest scale: the
// silhouette edge of a flattened disc keeps the same world-space outline as everything else.
import * as THREE from 'three';
import { Baker, xf, castMesh, hatMaterial } from './character.js';

const OUT = 0.02;
const _c = new THREE.Color(), _w = new THREE.Color('#ffffff'), _k = new THREE.Color('#2b2340');
const tint = (hex, k) => '#' + _c.set(hex).lerp(k > 0 ? _w : _k, Math.abs(k)).getHexString();   // k > 0 lighter, < 0 darker
const indexed = (g) => { if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]); return g; };

const sph = (w = 14, h = 10) => new THREE.SphereGeometry(1, w, h);
const cyl = (n = 12, open = false) => new THREE.CylinderGeometry(1, 1, 1, n, 1, open);
const cone = (n = 10, open = false) => new THREE.ConeGeometry(1, 1, n, 1, open);
const torus = (tube = 0.3, ts = 20) => new THREE.TorusGeometry(1, tube, 8, ts);
const octa = () => indexed(new THREE.OctahedronGeometry(1, 0));

/** A small kit around one Baker: add(geo, p, r, s, color, { flat, out }) with the outline derived from the scale. */
function kit() {
  const b = new Baker();
  const add = (geo, p, r, s, color, { flat = 0, out = 1 } = {}) => {
    const sc = typeof s === 'number' ? [s, s, s] : s;
    b.add(geo, xf(p, r, sc), { color, flat, outline: out ? OUT * out / Math.max(...sc) : 0 });
  };
  /** A primitive placed along a direction: from `base`, rotated by euler `rot`, centred `t` u along the rotated +Y. */
  const along = (base, rot, t) => new THREE.Vector3(0, t, 0).applyEuler(new THREE.Euler(rot[0], rot[1], rot[2])).add(new THREE.Vector3(...base)).toArray();
  return { b, add, along };
}

// ---- Home ---------------------------------------------------------------------------------------------------------------------
function fanShell(c) {                                   // a scallop: nine ribs fanning from the hinge, a back plate and the two hinge ears
  const { b, add } = kit();
  add(sph(), [0, 0.0, -0.03], [0, 0, 0], [0.3, 0.25, 0.045], tint(c, -0.15));
  for (let i = 0; i < 9; i++) {
    const a = -1.1 + i * 0.275, d = [Math.sin(a), Math.cos(a)];
    add(sph(), [d[0] * 0.21, -0.22 + d[1] * 0.21, i % 2 ? 0.005 : 0.012], [0, 0, -a], [0.068, 0.235, 0.05], i % 2 ? tint(c, 0.3) : c);
  }
  add(sph(), [-0.085, -0.23, 0.01], [0, 0, 0.3], [0.075, 0.05, 0.04], tint(c, -0.1));
  add(sph(), [0.085, -0.23, 0.01], [0, 0, -0.3], [0.075, 0.05, 0.04], tint(c, -0.1));
  return { b, rot: [-0.15, 0, 0.12] };
}
function violetShell(c) {                                // a whelk: big body whorl, three shrinking whorls with dark sutures, a pointed tip, the pale aperture
  const { b, add } = kit();
  const whorls = [[-0.15, 0.2, 0.23], [0.05, 0.15, 0.13], [0.17, 0.105, 0.09], [0.26, 0.07, 0.06]];
  whorls.forEach(([y, r, h], i) => {
    add(sph(), [0, y, 0], [0, 0, 0], [r, h, r], i % 2 ? tint(c, 0.18) : c);
    if (i) add(torus(0.16), [0, y - h * 0.62, 0], [Math.PI / 2, 0, 0], [whorls[i - 1][1] * 0.78, whorls[i - 1][1] * 0.78, whorls[i - 1][1] * 0.78], tint(c, -0.3));
  });
  add(cone(), [0, 0.35, 0], [0, 0, 0], [0.045, 0.1, 0.045], tint(c, -0.2));
  add(sph(), [0.02, -0.19, 0.15], [0, 0, -0.15], [0.105, 0.17, 0.06], '#f6eeff');
  add(sph(), [0.02, -0.19, 0.19], [0, 0, -0.15], [0.045, 0.12, 0.03], tint(c, -0.45), { out: 0 });
  return { b, rot: [0, 0, -0.32] };
}
function pearlShell(c) {                                 // an open clam showing off a big glossy pearl
  const { b, add } = kit();
  const hinge = [0, -0.1, -0.2];
  add(sph(16, 10), [0, -0.12, 0], [0, 0, 0], [0.3, 0.08, 0.24], c);
  add(sph(16, 10), [0, -0.095, 0.01], [0, 0, 0], [0.26, 0.05, 0.2], '#ffe7ee', { out: 0 });
  const tilt = -1.05, top = [0, hinge[1] + 0.21 * Math.sin(-tilt), hinge[2] + 0.21 * Math.cos(tilt)];
  add(sph(16, 10), top, [tilt, 0, 0], [0.3, 0.08, 0.24], tint(c, 0.1));
  const inN = [0, -Math.cos(tilt), -Math.sin(tilt)];
  add(sph(16, 10), [top[0], top[1] + inN[1] * 0.03, top[2] + inN[2] * 0.03], [tilt, 0, 0], [0.26, 0.05, 0.2], '#ffe7ee', { out: 0 });
  for (let i = -2; i <= 2; i++) add(sph(), [i * 0.1, top[1] + 0.055 * Math.sin(-tilt) + 0.02, top[2] - 0.03], [tilt, 0, i * 0.35], [0.02, 0.2, 0.012], tint(c, -0.2), { out: 0 });
  add(sph(), hinge, [0, 0, 0], [0.06, 0.05, 0.05], tint(c, -0.25));
  add(sph(18, 12), [0, -0.02, 0.05], [0, 0, 0], 0.115, '#fffaf2');
  add(sph(), [-0.04, 0.025, 0.14], [0, 0, 0.6], [0.03, 0.018, 0.015], '#ffffff', { flat: 1, out: 0 });
  return { b, rot: [0.15, 0, 0] };
}
function wingedSeed(c) {                                 // a double maple samara: two seed pods joined in a V, each with a veined wing
  const { b, add } = kit();
  for (const side of [-1, 1]) {
    const a = 0.5 * side, pod = [0.06 * side, -0.16, 0];
    add(sph(), pod, [0, 0, -a * 0.6], [0.09, 0.095, 0.075], tint(c, -0.3));
    add(sph(), [pod[0] + Math.sin(a) * 0.2, pod[1] + Math.cos(a) * 0.2, 0], [0, 0, -a], [0.08, 0.22, 0.022], c);
    add(sph(), [pod[0] + Math.sin(a) * 0.19 - side * 0.05, pod[1] + Math.cos(a) * 0.19, 0.016], [0, 0, -a], [0.012, 0.19, 0.01], tint(c, -0.35), { out: 0 });
    add(sph(), [pod[0] + Math.sin(a) * 0.33, pod[1] + Math.cos(a) * 0.33, 0.01], [0, 0, -a], [0.06, 0.07, 0.015], tint(c, 0.25), { out: 0 });
  }
  add(sph(), [0, -0.21, 0], [0, 0, 0], 0.04, '#8a6a3c');
  return { b, rot: [0, 0, 0.18] };
}
function spiralFossil(c) {                               // an ammonite: a log spiral of ribbed segments on a round stone
  const { b, add } = kit();
  add(sph(16, 12), [0, 0, -0.02], [0, 0, 0], [0.32, 0.3, 0.08], '#b4a38f');
  for (let i = 0; i < 30; i++) {
    const t = 13.8 - i * 0.46, r = 0.02 * Math.exp(0.18 * t);
    add(sph(10, 8), [Math.cos(t) * r, Math.sin(t) * r, 0.05], [0, 0, t], [r * 0.4, r * 0.48, Math.max(0.02, r * 0.3)], i % 2 ? tint(c, -0.12) : c);
  }
  add(sph(), [0, 0, 0.06], [0, 0, 0], 0.028, tint(c, -0.3));
  return { b, rot: [0, 0, 0] };
}
function sandDollar(c) {                                 // a flat disc with a raised rim and the five-petal flower
  const { b, add } = kit();
  add(sph(20, 12), [0, 0, 0], [0, 0, 0], [0.3, 0.3, 0.05], c);
  add(torus(0.12, 28), [0, 0, 0], [0, 0, 0], 0.285, tint(c, -0.1));
  for (let k = 0; k < 5; k++) {
    const a = Math.PI / 2 + k * Math.PI * 2 / 5;
    add(sph(), [Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.042], [0, 0, a - Math.PI / 2], [0.036, 0.09, 0.016], tint(c, -0.28), { out: 0 });
    add(sph(), [Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.052], [0, 0, a - Math.PI / 2], [0.012, 0.07, 0.008], tint(c, 0.4), { out: 0 });
  }
  add(sph(), [0, 0, 0.05], [0, 0, 0], [0.024, 0.024, 0.01], tint(c, -0.45), { out: 0 });
  return { b, rot: [-0.2, 0, 0.2] };
}

// ---- Frostpine ----------------------------------------------------------------------------------------------------------------
function icePebble(c) {                                  // a smooth icy pebble with a bright glint, frost specks and three tiny crystals
  const { b, add } = kit();
  add(sph(18, 12), [0, -0.02, 0], [0, 0, 0.2], [0.29, 0.2, 0.19], c);
  add(sph(), [-0.1, 0.08, 0.13], [0, 0, 0.5], [0.08, 0.035, 0.03], '#ffffff', { flat: 1, out: 0 });
  add(sph(), [0.05, 0.0, 0.175], [0, 0, 0.5], [0.025, 0.015, 0.01], '#ffffff', { flat: 1, out: 0 });
  for (const [x, y, z] of [[0.15, -0.06, 0.13], [-0.16, -0.1, 0.11], [0.02, -0.14, 0.15], [0.2, 0.06, 0.06]]) add(sph(8, 6), [x, y, z], [0, 0, 0], 0.018, '#f4fbff', { out: 0 });
  [[0.06, 0.17, 0.02, 0.05, 0.1], [-0.03, 0.18, -0.03, 0.04, -0.3], [0.13, 0.13, 0.0, 0.035, 0.5]].forEach(([x, y, z, s, a]) =>
    add(octa(), [x, y + s, z], [0, a, 0.2], [s * 0.7, s * 1.5, s * 0.7], '#eaf9ff', { out: 0.6 }));
  return { b, rot: [0.2, 0.3, 0] };
}
function snowQuartz(c) {                                 // a quartz cluster: hexagonal prisms with pointed tips on a lump of rock
  const { b, add, along } = kit();
  add(sph(), [0, -0.22, 0], [0, 0, 0], [0.27, 0.12, 0.2], '#958ea9');
  const xs = [[0, 0.44, 0.08, 0, 0], [-0.13, 0.31, 0.06, 0.48, 0.05], [0.14, 0.33, 0.062, -0.42, 0.02], [0.05, 0.22, 0.05, -0.15, 0.5], [-0.06, 0.27, 0.05, 0.2, -0.4]];
  xs.forEach(([x, h, r, tz, tx], i) => {
    const base = [x, -0.24, i === 3 ? 0.08 : i === 4 ? -0.07 : 0.01], rot = [tx, 0, tz], hp = h * 0.74, hc = h * 0.26;
    add(cyl(6, true), along(base, rot, hp / 2), rot, [r, hp, r], i % 2 ? tint(c, 0.25) : c);
    add(cone(6, true), along(base, rot, hp + hc / 2), rot, [r, hc, r], tint(c, 0.55));
  });
  return { b, rot: [0, 0.4, 0] };
}
function riverJade(c) {                                  // a polished river stone, cut and banded like an eye
  const { b, add } = kit();
  add(sph(18, 12), [0, 0, 0], [0, 0, -0.18], [0.3, 0.21, 0.15], tint(c, -0.15));
  add(sph(), [0, 0, 0.115], [0, 0, -0.18], [0.21, 0.14, 0.03], tint(c, 0.35), { out: 0.5 });
  add(sph(), [0, 0, 0.13], [0, 0, -0.18], [0.14, 0.09, 0.025], c, { out: 0 });
  add(sph(), [0, 0, 0.148], [0, 0, -0.18], [0.06, 0.035, 0.015], tint(c, -0.45), { out: 0 });
  add(sph(), [-0.12, 0.1, 0.09], [0, 0, 0.4], [0.05, 0.022, 0.02], '#ffffff', { flat: 1, out: 0 });
  return { b, rot: [0, 0, 0.1] };
}
function jayFeather(c) {                                 // a blue-jay feather: quill, blue vane with black bars and a white tip
  const { b, add } = kit();
  add(sph(16, 12), [0, 0.04, 0], [0, 0, 0], [0.11, 0.3, 0.022], c);
  for (let i = 0; i < 5; i++) {
    const y = -0.16 + i * 0.085, dy = (y - 0.04) / 0.3, w = 0.11 * Math.sqrt(Math.max(0, 1 - dy * dy));
    add(sph(), [0, y, 0.002], [0, 0, 0], [w * 0.99, 0.017, 0.024 * Math.sqrt(Math.max(0.1, 1 - dy * dy))], '#2b3550', { out: 0 });
  }
  add(sph(), [0, 0.31, 0], [0, 0, 0], [0.06, 0.055, 0.022], '#ffffff');
  add(cyl(8), [0, -0.04, 0.024], [0, 0, 0], [0.013, 0.62, 0.013], '#f0eef6');
  add(sph(8, 6), [0, -0.35, 0.02], [0, 0, 0], 0.014, '#d9d4e4', { out: 0 });
  return { b, rot: [0, 0, -0.38] };
}
function starGeode(c) {                                  // half a geode: rough rock shell, white rind, violet crystals and a little star at the heart
  const { b, add } = kit();
  add(sph(16, 12), [0, 0, -0.05], [0, 0, 0], [0.3, 0.27, 0.2], '#8c7f73');
  for (const [x, y, s] of [[0.2, 0.14, 0.07], [-0.22, -0.1, 0.08], [0.1, -0.2, 0.06], [-0.15, 0.17, 0.06]]) add(sph(10, 8), [x, y, -0.06], [0, 0, 0], s, '#7d7166');
  add(sph(16, 10), [0, 0, 0.12], [0, 0, 0], [0.262, 0.232, 0.03], '#f3eefb', { out: 0.5 });
  add(sph(16, 10), [0, 0, 0.14], [0, 0, 0], [0.21, 0.18, 0.03], tint(c, -0.2), { out: 0 });
  const spots = [[0.12, 0.05], [-0.1, 0.09], [0.04, -0.12], [-0.13, -0.05], [0.15, -0.07], [-0.03, 0.13], [0.08, 0.12], [-0.07, -0.13], [0.17, 0.02], [-0.17, 0.03]];
  spots.forEach(([x, y], i) => add(cone(6), [x, y, 0.165], [Math.PI / 2 - 0.15 * x * 6, 0, 0], [0.026, 0.06, 0.026], i % 2 ? c : tint(c, 0.4), { out: 0.5 }));
  for (let k = 0; k < 5; k++) {
    const a = Math.PI / 2 + k * Math.PI * 2 / 5;
    add(sph(), [Math.cos(a) * 0.035, Math.sin(a) * 0.035, 0.175], [0, 0, a - Math.PI / 2], [0.022, 0.05, 0.012], '#fff0a8', { flat: 0.6, out: 0.6 });
  }
  return { b, rot: [-0.1, -0.2, 0] };
}
function amberLeaf(c) {                                  // an amber maple-ish leaf: five lobes with veins and a curly stem
  const { b, add } = kit();
  const base = [0, -0.1, 0];
  [[0, 0.28], [0.72, 0.24], [-0.72, 0.24], [1.45, 0.17], [-1.45, 0.17]].forEach(([a, len], i) => {
    const d = [Math.sin(a), Math.cos(a)];
    add(sph(), [base[0] + d[0] * len * 0.55, base[1] + d[1] * len * 0.55, i * 0.002], [0, 0, -a], [len * 0.36, len * 0.56, 0.022], i % 2 ? tint(c, -0.08) : c);
    add(sph(), [base[0] + d[0] * len * 0.5, base[1] + d[1] * len * 0.5, 0.02], [0, 0, -a], [0.008, len * 0.48, 0.008], tint(c, -0.4), { out: 0 });
  });
  add(cyl(8), [0.02, -0.21, 0], [0, 0, 0.2], [0.015, 0.24, 0.015], '#8a5a2e');
  add(sph(), [-0.07, 0.03, 0.022], [0, 0, 0.5], [0.04, 0.02, 0.01], '#fff4d6', { flat: 1, out: 0 });
  return { b, rot: [0, 0, 0.25] };
}

// ---- Emberleaf ----------------------------------------------------------------------------------------------------------------
function cowrieShell(c) {                                // a glossy spotted cowrie with its toothed slit turned partly toward the viewer
  const { b, add } = kit();
  add(sph(18, 12), [0, 0, 0], [0, 0, 0], [0.19, 0.28, 0.16], c);
  for (let i = 0; i < 12; i++) {
    const th = i * 2.4, ph = 0.35 + (i % 4) * 0.28;
    const n = new THREE.Vector3(Math.cos(th) * Math.sin(ph), Math.cos(ph) * (i % 2 ? 1 : -1) * 0.9, -Math.abs(Math.sin(th) * Math.sin(ph))).normalize();
    add(sph(8, 6), [n.x * 0.18, n.y * 0.26, n.z * 0.15], [0, 0, 0], [0.032, 0.032, 0.02], tint(c, -0.28), { out: 0 });
  }
  add(sph(), [0, 0, 0.145], [0, 0, 0], [0.03, 0.235, 0.03], '#6a3a2a');
  for (let i = -4; i <= 4; i++) for (const s of [-1, 1]) add(sph(6, 4), [s * 0.032, i * 0.05, 0.152], [0, 0, 0], [0.018, 0.012, 0.012], '#fff3e2', { out: 0 });
  add(sph(), [-0.1, 0.12, 0.07], [0, 0, 0.4], [0.04, 0.07, 0.02], '#ffffff', { flat: 1, out: 0 });
  return { b, rot: [0, 0.85, 0.35] };
}
function sunsetConch(c) {                                // a conch: fat body whorl ringed with big spikes, a knobbly spire and a flared pink lip to one side
  const { b, add, along } = kit();
  add(sph(16, 12), [0, -0.04, 0], [0, 0, 0], [0.19, 0.25, 0.19], c);
  add(torus(0.14), [0, -0.14, 0], [Math.PI / 2, 0, 0], 0.16, tint(c, -0.2));
  add(cone(12), [0, 0.27, 0], [0, 0, 0], [0.14, 0.2, 0.14], tint(c, 0.15));
  add(cone(10), [0, 0.42, 0], [0, 0, 0], [0.065, 0.12, 0.065], tint(c, -0.1));
  for (let k = 0; k < 7; k++) {
    const a = k * Math.PI * 2 / 7 + 0.3, rot = [Math.cos(a) * 1.2, 0, -Math.sin(a) * 1.2];
    add(cone(8), along([Math.sin(a) * 0.15, 0.09, Math.cos(a) * 0.15], rot, 0.07), rot, [0.045, 0.15, 0.045], tint(c, 0.35));
    const r2 = [Math.cos(a) * 1.0, 0, -Math.sin(a) * 1.0];
    add(sph(8, 6), along([Math.sin(a) * 0.09, 0.3, Math.cos(a) * 0.09], r2, 0.02), r2, 0.03, tint(c, 0.3));
  }
  add(cone(10), [0, -0.33, 0], [Math.PI, 0, 0], [0.07, 0.14, 0.07], tint(c, -0.1));
  add(sph(16, 10), [0.13, -0.08, 0.1], [0, -0.7, -0.15], [0.16, 0.25, 0.05], '#ffc0ae');
  add(sph(), [0.12, -0.08, 0.14], [0, -0.7, -0.15], [0.055, 0.17, 0.02], '#c4584a', { out: 0 });
  return { b, rot: [0.1, 0.25, -0.3] };
}
function coralShell(c) {                                 // a knobbly turban shell in coral pink with a pearly opening
  const { b, add } = kit();
  add(sph(16, 12), [0, -0.14, 0], [0, 0, 0], [0.24, 0.18, 0.24], c);
  for (let k = 0; k < 9; k++) {
    const a = k * Math.PI * 2 / 9;
    add(sph(8, 6), [Math.sin(a) * 0.215, -0.07, Math.cos(a) * 0.215], [0, 0, 0], 0.045, tint(c, 0.35));
  }
  [[-0.01, 0.17, 0.065], [0.08, 0.125, 0.055], [0.16, 0.085, 0.045]].forEach(([y, r, t], i) =>
    add(torus(t / r), [0, y, 0], [Math.PI / 2, 0, 0], r, i % 2 ? tint(c, 0.3) : c));
  add(sph(), [0, 0.23, 0], [0, 0, 0], 0.055, tint(c, -0.15));
  add(sph(16, 10), [0.02, -0.2, 0.17], [0.3, 0, 0], [0.13, 0.1, 0.045], '#fff1f6');
  add(sph(), [0.02, -0.2, 0.2], [0.3, 0, 0], [0.07, 0.05, 0.02], tint(c, -0.4), { out: 0 });
  return { b, rot: [0.25, 0, 0.2] };
}
function carvedSeed(c) {                                 // a big seed carved with rings and dots, sprouting two little leaves
  const { b, add } = kit();
  add(sph(18, 14), [0, -0.03, 0], [0, 0, 0], [0.2, 0.28, 0.18], c);
  for (const y of [-0.15, -0.03, 0.09]) {
    const k = Math.sqrt(1 - (y / 0.28) ** 2) * 0.99;
    add(torus(0.07, 28), [0, y - 0.03, 0], [Math.PI / 2, 0, 0], [0.2 * k, 0.18 * k, 0.2 * k], tint(c, -0.4), { out: 0 });
  }
  for (const [x, y] of [[-0.08, -0.09], [0, -0.09], [0.08, -0.09], [-0.04, 0.03], [0.04, 0.03]]) {
    const z = 0.18 * Math.sqrt(Math.max(0, 1 - (x / 0.2) ** 2 - ((y + 0.03) / 0.28) ** 2));
    add(sph(8, 6), [x, y - 0.03, z], [0, 0, 0], [0.022, 0.022, 0.012], tint(c, -0.45), { out: 0 });
  }
  add(cyl(6), [0, 0.27, 0], [0, 0, 0], [0.014, 0.08, 0.014], '#5c8a34');
  add(sph(), [-0.055, 0.32, 0], [0, 0, 0.5], [0.07, 0.032, 0.03], '#7cc45a');
  add(sph(), [0.055, 0.33, 0], [0, 0, -0.6], [0.065, 0.03, 0.028], '#8fd36a');
  add(sph(), [-0.08, 0.07, 0.13], [0, 0, 0.4], [0.035, 0.06, 0.02], '#ffffff', { flat: 1, out: 0 });
  return { b, rot: [0, 0, 0.15] };
}
function obsidianCarving(c) {                            // a little glossy-black tiki idol with glowing lavender eyes and a crest
  const { b, add } = kit();
  const dark = '#3b2f4f';
  add(cyl(14), [0, -0.31, 0], [0, 0, 0], [0.15, 0.07, 0.14], tint(dark, -0.2));
  add(sph(16, 12), [0, -0.14, 0], [0, 0, 0], [0.16, 0.19, 0.14], dark);
  add(sph(), [-0.155, -0.12, 0.03], [0, 0, 0.3], [0.04, 0.1, 0.05], tint(dark, 0.08));
  add(sph(), [0.155, -0.12, 0.03], [0, 0, -0.3], [0.04, 0.1, 0.05], tint(dark, 0.08));
  for (const y of [-0.2, -0.12]) add(sph(), [0, y, 0.13], [0, 0, 0], [0.08, 0.012, 0.012], c, { flat: 0.4, out: 0 });
  add(sph(16, 12), [0, 0.11, 0], [0, 0, 0], [0.2, 0.17, 0.16], tint(dark, 0.06));
  add(sph(), [0, 0.2, 0.13], [0, 0, 0], [0.16, 0.026, 0.035], c, { flat: 0.3 });
  for (const s of [-1, 1]) {
    add(sph(), [s * 0.075, 0.13, 0.135], [0, 0, 0], [0.05, 0.04, 0.03], '#241c33', { out: 0 });
    add(sph(), [s * 0.075, 0.13, 0.155], [0, 0, 0], [0.032, 0.026, 0.015], '#e2d4ff', { flat: 0.9, out: 0 });
  }
  add(sph(), [0, 0.05, 0.15], [0, 0, 0], [0.09, 0.028, 0.02], '#241c33', { out: 0 });
  for (const k of [-1, 0, 1]) add(sph(), [k * 0.08, 0.32 - Math.abs(k) * 0.03, 0], [0, 0, -k * 0.5], [0.04, 0.09, 0.03], k ? tint(c, -0.15) : c);
  add(sph(), [-0.11, 0.17, 0.1], [0, 0, 0.6], [0.035, 0.015, 0.01], '#ffffff', { flat: 1, out: 0 });
  return { b, rot: [0, 0.25, 0] };
}
function fernFossil(c) {                                 // a stone slab with a fern frond pressed into it
  const { b, add } = kit();
  const R = [0.3, 0.32, 0.06];
  add(sph(18, 12), [0, 0, 0], [0, 0, 0], R, c);
  const surf = (x, y) => R[2] * Math.sqrt(Math.max(0, 1 - (x / R[0]) ** 2 - (y / R[1]) ** 2)) - 0.004;
  const mark = tint(c, -0.42);
  const pts = Array.from({ length: 9 }, (_, i) => [Math.sin(i / 8 * Math.PI * 0.7) * 0.06 - 0.03, -0.26 + i * 0.0625]);
  for (let i = 0; i < 8; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], mx = (x0 + x1) / 2, my = (y0 + y1) / 2, a = Math.atan2(x1 - x0, y1 - y0);
    add(sph(8, 6), [mx, my, surf(mx, my)], [0, 0, -a], [0.012, 0.036, 0.01], mark, { out: 0 });
    if (i < 1) continue;
    const L = 0.12 * (1 - i / 9) + 0.025;
    for (const s of [-1, 1]) {
      const la = a + s * 1.0, lx = x0 + Math.sin(la) * L * 0.55, ly = y0 + Math.cos(la) * L * 0.55;
      add(sph(8, 6), [lx, ly, surf(lx, ly)], [0, 0, -la], [0.022, L * 0.5, 0.01], mark, { out: 0 });
    }
  }
  add(sph(), [0.17, -0.18, surf(0.17, -0.18)], [0, 0, 0.5], [0.03, 0.02, 0.008], tint(c, -0.2), { out: 0 });
  return { b, rot: [-0.15, 0, -0.12] };
}

// ---- Duskcrown (Step 72b): the two marsh fish. Both lie along X with the head at -X and the flank toward +Z (the showcase turns +Z to the camera); fins are flattened ellipsoids, the glowing parts are `flat` (unlit).
function glimmerfin(c) {                                 // palm-sized and round-bellied: violet, pale belly, cyan spots, stubby fins with glowing tips, a fan tail
  const { b, add } = kit();
  const cy = '#7ff0ff';
  add(sph(16, 12), [0, 0, 0], [0, 0, 0], [0.25, 0.19, 0.16], c);                                        // the body
  add(sph(14, 10), [-0.015, -0.085, 0.035], [0, 0, 0], [0.2, 0.1, 0.12], tint(c, 0.4), { out: 0 });      // the pale belly
  add(sph(), [0.26, 0.0, 0], [0, 0, 0.1], [0.1, 0.1, 0.04], tint(c, -0.1));                              // the tail root
  for (const s of [-1, 1]) add(sph(), [0.37, 0.07 * s, 0], [0, 0, s * 0.5], [0.13, 0.065, 0.02], tint(c, 0.25));   // the two tail lobes
  add(sph(), [0.425, 0.095, 0], [0, 0, 0.5], [0.03, 0.03, 0.025], cy, { flat: 1, out: 0 });
  add(sph(), [0.425, -0.095, 0], [0, 0, -0.5], [0.03, 0.03, 0.025], cy, { flat: 1, out: 0 });
  add(sph(), [0.02, 0.2, 0], [0, 0, 0.1], [0.11, 0.07, 0.02], tint(c, 0.25));                           // the dorsal fin...
  add(sph(), [0.05, 0.255, 0], [0, 0, 0], 0.035, cy, { flat: 1, out: 0 });                              // ...with its glowing tip
  for (const z of [-1, 1]) {                                                                              // stubby pectoral fins with glowing tips
    add(sph(), [-0.04, -0.07, 0.15 * z], [0.5 * z, 0, -0.6], [0.09, 0.045, 0.035], tint(c, 0.25));
    add(sph(), [-0.085, -0.11, 0.19 * z], [0, 0, 0], 0.028, cy, { flat: 1, out: 0 });
  }
  const spot = (x, y, r) => {                                                                             // spots lie on the +Z flank: z from the ellipsoid, a hair proud of it
    const q = 1 - (x / 0.25) ** 2 - (y / 0.19) ** 2;
    if (q > 0.05) add(sph(8, 6), [x, y, 0.16 * Math.sqrt(q) + 0.004], [0, 0, 0], [r, r, r * 0.35], cy, { flat: 1, out: 0 });
  };
  [[-0.04, 0.09, 0.034], [0.05, 0.06, 0.03], [0.12, 0.02, 0.026], [-0.01, 0.0, 0.026], [0.08, -0.035, 0.022], [-0.1, 0.045, 0.024], [0.15, 0.085, 0.02]].forEach(([x, y, r]) => spot(x, y, r));
  add(sph(12, 8), [-0.17, 0.045, 0.1], [0, 0, 0], [0.058, 0.058, 0.04], '#ffffff', { out: 0 });          // the eye
  add(sph(8, 6), [-0.178, 0.045, 0.133], [0, 0, 0], [0.03, 0.03, 0.02], '#2b2340', { out: 0 });
  add(sph(6, 4), [-0.19, 0.056, 0.15], [0, 0, 0], 0.011, '#ffffff', { out: 0 });
  add(sph(8, 6), [-0.235, -0.03, 0.06], [0, 0, 0.1], [0.025, 0.012, 0.03], tint(c, -0.4), { out: 0 });   // the mouth
  return { b, rot: [0.18, 0, 0.06] };
}
function lanternkoi(c) {                                 // a slender koi twice as long: deep indigo, three warm lantern patches, long veil fins and tail, a tiny glowcap crest
  const { b, add } = kit();
  const warm = ['#ffb347', '#ff9a3c', '#ffc861'], veil = tint('#9ba6ff', 0.25), glow = '#ffd98a';
  add(sph(18, 12), [0, 0, 0], [0, 0, 0], [0.4, 0.11, 0.1], c);                                           // the long body
  add(sph(14, 10), [0.12, 0.0, 0], [0, 0, 0], [0.3, 0.09, 0.09], tint(c, -0.1));                         // a deeper back half
  add(sph(14, 10), [-0.02, -0.055, 0.02], [0, 0, 0], [0.32, 0.05, 0.075], tint(c, 0.28), { out: 0 });    // pale belly line
  add(sph(14, 10), [-0.36, 0.0, 0], [0, 0, 0], [0.11, 0.085, 0.085], tint(c, 0.08));                      // the head
  [[-0.2, 0.0, 0.07, 0.045], [0.02, 0.012, 0.075, 0.05], [0.24, 0.0, 0.06, 0.04]].forEach(([x, y, z, r], i) => {   // the three lantern patches on the flank
    add(sph(10, 8), [x, y, z + 0.01], [0, 0, 0], [r * 1.35, r, r * 0.4], warm[i], { flat: 1, out: 0 });
    add(sph(8, 6), [x, y, z + 0.022], [0, 0, 0], [r * 0.7, r * 0.55, r * 0.25], '#fff1c2', { flat: 1, out: 0 });
  });
  // the veil: a long swept dorsal, flowing pectorals and a three-lobed ribbon tail, light and see-through-looking
  add(sph(), [0.02, 0.15, 0], [0, 0, -0.35], [0.24, 0.07, 0.014], veil);
  add(sph(), [-0.17, 0.12, 0], [0, 0, 0.5], [0.1, 0.035, 0.012], veil);
  for (const z of [-1, 1]) add(sph(), [-0.19, -0.06, 0.1 * z], [0.7 * z, 0, 0.9], [0.17, 0.045, 0.014], veil);
  add(sph(), [0.2, -0.1, 0], [0, 0, 0.5], [0.12, 0.035, 0.012], veil);
  for (const [dy, a, len] of [[0.0, 0, 0.3], [0.08, 0.5, 0.26], [-0.08, -0.5, 0.26]]) {
    add(sph(), [0.55 + len * 0.42, dy * 1.3, 0], [0, 0, a], [len, 0.052, 0.012], veil);
    add(sph(), [0.55 + len * 0.9, dy * 1.8, 0], [0, 0, a], 0.022, glow, { flat: 1, out: 0 });
  }
  add(cone(8), [-0.13, 0.115, 0], [0, 0, 0], [0.032, 0.05, 0.032], '#c9b8ff', { out: 0.6 });             // the tiny glowcap crest: a stalk and a violet cap
  add(sph(8, 6), [-0.13, 0.145, 0], [0, 0, 0], [0.05, 0.026, 0.05], '#a64be8');
  add(sph(6, 4), [-0.13, 0.156, 0], [0, 0, 0], 0.014, '#e9c6ff', { flat: 1, out: 0 });
  add(sph(12, 8), [-0.405, 0.025, 0.07], [0, 0, 0], [0.036, 0.036, 0.026], '#ffffff', { out: 0 });       // the eye
  add(sph(8, 6), [-0.41, 0.025, 0.092], [0, 0, 0], [0.02, 0.02, 0.012], '#2b2340', { out: 0 });
  for (const z of [-1, 1]) add(cyl(6), [-0.445, -0.03, 0.03 * z], [0, 0, Math.PI / 2], [0.006, 0.05, 0.006], '#c9b8ff', { out: 0 });   // barbels
  return { b, rot: [0.16, 0, 0.05] };
}

const BUILDERS = {
  'fan-shell': fanShell, 'violet-shell': violetShell, 'pearl-shell': pearlShell, 'winged-seed': wingedSeed, 'spiral-fossil': spiralFossil, 'sand-dollar': sandDollar,
  'ice-pebble': icePebble, 'snow-quartz': snowQuartz, 'river-jade': riverJade, 'jay-feather': jayFeather, 'star-geode': starGeode, 'amber-leaf': amberLeaf,
  'cowrie-shell': cowrieShell, 'sunset-conch': sunsetConch, 'coral-shell': coralShell, 'carved-seed': carvedSeed, 'obsidian-carving': obsidianCarving, 'fern-fossil': fernFossil,
  glimmerfin, lanternkoi,
};
// Colours match the Journal icons (game/collection.js). Kept here rather than imported so this module stays free of the UI / save layer.
const COLORS = {
  'fan-shell': '#ff9cae', 'violet-shell': '#b8a4e1', 'pearl-shell': '#ffeab9', 'winged-seed': '#95ca6e', 'spiral-fossil': '#dfb47a', 'sand-dollar': '#f6e4bc',
  'ice-pebble': '#89d9ee', 'snow-quartz': '#d6c8ef', 'river-jade': '#8bd7bb', 'jay-feather': '#79b6ed', 'star-geode': '#bb90d8', 'amber-leaf': '#eeb866',
  'cowrie-shell': '#ffcf8c', 'sunset-conch': '#f79b79', 'coral-shell': '#f785af', 'carved-seed': '#9bc96c', 'obsidian-carving': '#9d83c7', 'fern-fossil': '#cda684',
  glimmerfin: '#8a67e0', lanternkoi: '#3b3f9c',
};
export const JOURNAL_MODEL_IDS = Object.keys(BUILDERS);
const CENTRED = new Set(['glimmerfin', 'lanternkoi']);
const FIT = { lanternkoi: 0.72 };                        // the long koi is shown a bit smaller than the 0.6 u finds, so it still fits beside the finder's head (userData.fit; the showcase multiplies its size by it)

export function createJournalModel(id) {
  const build = BUILDERS[id];
  if (!build) return null;
  const { b, rot } = build(COLORS[id]);
  const { geo } = b.build();
  if (CENTRED.has(id)) { geo.computeBoundingSphere(); const c = geo.boundingSphere.center; geo.translate(-c.x, -c.y, -c.z); }       // the long fish are not symmetric about their origin: centre them so the showcase floats them over the hand
  const g = new THREE.Group();
  g.name = 'journal-' + id;
  const mesh = castMesh(geo, hatMaterial(), false);
  mesh.name = 'journal-mesh';
  mesh.rotation.set(rot[0], rot[1], rot[2]);            // each find's best three-quarter angle; the Group itself is turned to the camera
  g.add(mesh);
  g.userData.fit = FIT[id] || 1;
  g.userData.dispose = () => geo.dispose();
  return g;
}
