// Feast hats (Step 26a): ten cosmetic hat models, in unlock order (feast 1 unlocks HATS[0]).
//
//   HATS = [{ id, name, build(scheme) }, ...]     scheme = {hat, cuff, shirt, pants} (hex strings, optional)
//   build(scheme) -> a fresh Object3D (Group) whose origin is the head centre, ready for player.setHat(model).
//
// Same contract as createBeanieHat() in character.js:
//   * merged, vertex-coloured geometry with the outline hull baked in, drawn with the shared hatMaterial();
//   * one main mesh (the only shadow caster) + at most one small extra part (butterfly wings, kettle steam, apple leaf, palm sprig);
//   * userData.dispose()            frees the geometries (never touches the shared material);
//   * userData.setColors(scheme)    re-tints the accent (band / ribbon / trim / kettle body) with scheme.hat (+ cuff where used),
//                                   so players can still tell each other apart. Called by character.setHat() on mounting;
//   * userData.update(dt, t)        optional idle animation, called by player.js every frame for the mounted hat (local players
//                                   and remote avatars alike);
//   * userData.sprout               optional swaying part that player.js already drives (palm sprig, apple stem and leaf).
// Hats that leave the crown bare (Butterfly, Lily Pad, Feast Crown) bake a chunky dark-brown hair cap into their main mesh.
// Draw calls per hat: 1 main + 1 shadow (+1 for the small animated part) = 2-3, so a character stays at 16 or fewer.
// Geometry notes: avoid BoxGeometry for outlined parts (the hull is extruded along the face normals and would split at the
// edges); spheres, capsules, cylinders, cones and tori all hull cleanly. Head ellipsoid = HEAD_R * HEAD_SCALE (about 0.46 x 0.41 x 0.44);
// the face sits at +Z with the eyes around y = -0.02 (top of the eye ~0.075), so nothing may come lower than ~0.12 in front.
import * as THREE from 'three';
import { Baker, xf, castMesh, hatMaterial, paintRole, HEAD_R, HEAD_SCALE } from './character.js';

const HAIR = '#5a3a2e';
const IRON = '#4a4458', IRON_LIGHT = '#6f6985';
const SILVER = '#d4dae8', SILVER_DARK = '#a3abc4';
const CREAM = '#fff0cf';
const RED = '#e8453c';
const GOLD = '#ffcf3f';
const GREEN = '#4fbf4a', LEAF = '#7be05e';
const BROWN = '#8a5a3c', BROWN_DARK = '#5a3a22', TRUNK = '#9a6a44';

const _up = new THREE.Vector3(0, 1, 0);
const _tq = new THREE.Quaternion();
/** Matrix placing something at p whose +Y axis points along dir, with scale s. */
function along(p, dir, s = [1, 1, 1]) {
  _tq.setFromUnitVectors(_up, new THREE.Vector3(dir[0], dir[1], dir[2]).normalize());
  return new THREE.Matrix4().compose(new THREE.Vector3(p[0], p[1], p[2]), _tq.clone(), new THREE.Vector3(s[0], s[1], s[2]));
}
const sph = (w = 18, h = 12) => new THREE.SphereGeometry(1, w, h);
const cyl = (rt, rb, h, seg = 14, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 5, 10);

/** Point + surface normal direction on an axis-aligned ellipsoid with centre c and radii r, from polar angle th (0 = up) and azimuth ph. */
function onEllipsoid(c, r, th, ph) {
  const n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
  return { p: [c[0] + r[0] * n[0], c[1] + r[1] * n[1], c[2] + r[2] * n[2]], n: [n[0] / r[0], n[1] / r[1], n[2] / r[2]] };
}

/** Group shell: handles bookkeeping of baked entries (dispose, accent re-tint) and the main / extra meshes. */
function shell(name, tilt = -0.1) {
  const g = new THREE.Group();
  g.name = 'hat-' + name;
  g.rotation.x = tilt;
  const entries = [];
  const mount = (entry, meshName, parent = g, cast = true) => {
    entries.push(entry);
    const m = castMesh(entry.geo, hatMaterial(), cast);
    m.name = meshName;
    parent.add(m);
    return m;
  };
  g.userData.dispose = () => entries.forEach((e) => e.geo.dispose());
  g.userData.setColors = (scheme) => {
    for (const e of entries) { paintRole(e, 'hat', scheme.hat); paintRole(e, 'cuff', scheme.cuff); }
  };
  return { g, mount };
}

/** Chunky dark-brown hair cap (tilted back like the beanie so the fringe sits above the eyes) with a few tufts. */
function addHair(b) {
  const tilt = [-0.22, 0, 0];
  const R = HEAD_R * 1.06;
  b.add(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, 1.3),
    xf([0, 0, 0], tilt, [R * HEAD_SCALE.x, R * HEAD_SCALE.y, R * HEAD_SCALE.z]), { color: HAIR, outline: 0.03 });
  const tuft = (x, y, z, rx, rz, h = 0.2, r = 0.075) =>
    b.add(new THREE.ConeGeometry(r, h, 8), xf([x, y, z], [rx, 0, rz]), { color: HAIR, outline: 0.022 });
  tuft(0.04, 0.44, 0.1, 0.5, -0.3);
  tuft(-0.1, 0.43, -0.02, 0.1, 0.55, 0.18);
  tuft(0.13, 0.4, -0.12, -0.5, -0.5, 0.17, 0.065);
}

// ---------------------------------------------------------------------------------------------------------------- 1 Frying Pan
function buildFryingPan() {
  const { g, mount } = shell('frying-pan', -0.12);
  g.rotation.z = 0.3;                                       // jaunty tilt, handle side up
  const b = new Baker();
  // wide, shallow skillet worn flat-side up: low wall, lighter rim ring, darker centre disc, long diagonal handle
  const R = 0.7, y = 0.4;
  b.add(cyl(R, R, 0.15, 36, true), xf([0, y - 0.075, 0]), { color: IRON, outline: 0.03, inner: true });
  b.add(new THREE.CircleGeometry(R, 36), xf([0, y, 0], [-Math.PI / 2, 0, 0]), { color: IRON, outline: 0.03 });
  b.add(new THREE.TorusGeometry(R, 0.05, 8, 36), xf([0, y, 0], [Math.PI / 2, 0, 0]), { color: '#9a94b5', outline: 0.024 });
  b.add(new THREE.CircleGeometry(R * 0.62, 32), xf([0, y + 0.012, 0], [-Math.PI / 2, 0, 0]), { color: '#5d5775', outline: 0 });
  const d = [0.55, 0, -0.83], at = (t) => [d[0] * t, y - 0.02, d[2] * t];
  b.add(cap(0.085, 0.5), along(at(0.97), d), { color: IRON, outline: 0.028 });
  b.add(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 12), along(at(1.17), d), { color: '#ffffff', role: 'hat', outline: 0.024 });
  b.add(new THREE.TorusGeometry(0.075, 0.03, 8, 14), new THREE.Matrix4().multiplyMatrices(along(at(1.5), d), xf([0, 0, 0], [Math.PI / 2, 0, 0])), { color: '#9a94b5', outline: 0.016 });
  mount(b.build(), 'hat-main');
  return g;
}

// ---------------------------------------------------------------------------------------------------------------- 2 Mushroom Cap
function buildMushroomCap() {
  const { g, mount } = shell('mushroom-cap', -0.12);
  const b = new Baker();
  const c = [0, 0.15, 0], r = [0.66, 0.52, 0.66];
  b.add(new THREE.SphereGeometry(1, 36, 16, 0, Math.PI * 2, 0, Math.PI / 2), xf(c, [0, 0, 0], r), { color: RED, outline: 0.03 });
  b.add(new THREE.CircleGeometry(1, 32), xf([0, 0.15, 0], [Math.PI / 2, 0, 0], [0.66, 0.66, 1]), { color: CREAM, outline: 0.03 });
  b.add(new THREE.TorusGeometry(0.64, 0.035, 8, 36), xf([0, 0.17, 0], [Math.PI / 2, 0, 0]), { color: '#ffffff', role: 'hat', outline: 0.02 });
  // white spots, flattened discs lying on the dome
  const spots = [[0.0, 0, 0.2], [0.62, 0.0, 0.13], [0.62, 1.7, 0.11], [0.62, 3.4, 0.14], [0.62, 4.9, 0.1], [1.0, 0.8, 0.12], [1.0, 2.6, 0.1], [1.0, 4.2, 0.12], [1.0, 5.5, 0.1]];
  for (const [th, ph, rad] of spots) {
    const { p, n } = onEllipsoid(c, r, th, ph);
    b.add(sph(14, 8), along(p, n, [rad, 0.045, rad]), { color: '#ffffff', outline: 0 });
  }
  mount(b.build(), 'hat-main');
  return g;
}

// ---------------------------------------------------------------------------------------------------------------- 3 Stock Pot
function buildStockPot() {
  const { g, mount } = shell('stock-pot', -0.1);
  const b = new Baker();
  b.add(cyl(0.5, 0.5, 0.46, 32, true), xf([0, 0.36, 0]), { color: SILVER, outline: 0.03, inner: true });
  b.add(cyl(0.515, 0.515, 0.1, 32, true), xf([0, 0.24, 0]), { color: '#ffffff', role: 'hat', outline: 0.02 });
  b.add(new THREE.TorusGeometry(0.5, 0.04, 8, 32), xf([0, 0.59, 0], [Math.PI / 2, 0, 0]), { color: '#ffffff', outline: 0.022 });
  b.add(new THREE.CircleGeometry(0.48, 28), xf([0, 0.5, 0], [-Math.PI / 2, 0, 0]), { color: '#ffb347', outline: 0 });      // soup surface
  // side handles
  for (const s of [-1, 1]) b.add(cap(0.045, 0.1), xf([0.56 * s, 0.42, 0], [0, 0, Math.PI / 2]), { color: IRON, outline: 0.022 });
  // dent: a darker, flattened bump on the front-right wall
  b.add(sph(14, 10), along([0.28, 0.34, 0.41], [0.55, 0, 0.83], [0.13, 0.1, 0.03]), { color: SILVER_DARK, outline: 0 });
  // ladle poking out of the soup
  b.add(cap(0.026, 0.46), xf([0.18, 0.8, 0.05], [0, 0, -0.4]), { color: TRUNK, outline: 0.018 });
  b.add(new THREE.TorusGeometry(0.045, 0.02, 6, 10), xf([0.3, 1.04, 0.05], [0, 0, 0]), { color: IRON_LIGHT, outline: 0.01 });
  mount(b.build(), 'hat-main');
  return g;
}

// ---------------------------------------------------------------------------------------------------------------- 4 Coconut
function buildCoconut() {
  const { g, mount } = shell('coconut', -0.12);
  const b = new Baker();
  const c = [0, 0.16, 0], r = [0.52, 0.5, 0.5];
  b.add(new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), xf(c, [0, 0, 0], r), { color: BROWN, outline: 0.03, inner: true });
  b.add(new THREE.TorusGeometry(0.515, 0.045, 8, 32), xf([0, 0.17, 0], [Math.PI / 2, 0, 0], [1, 0.98, 1]), { color: '#fff6e0', outline: 0.022 });
  // fibrous tufts around the rim
  const N = 12;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const dir = [Math.cos(a), -0.35, Math.sin(a)];
    b.add(new THREE.ConeGeometry(0.05, 0.17, 6), along([Math.cos(a) * 0.53, 0.13, Math.sin(a) * 0.51], dir), { color: i % 2 ? BROWN_DARK : '#a0703f', outline: 0.016 });
  }
  // the three coconut "eyes"
  for (const [th, ph] of [[0.55, 1.1], [0.62, 1.95], [0.78, 1.5]]) {
    const { p, n } = onEllipsoid(c, r, th, ph);
    b.add(sph(10, 6), along(p, n, [0.045, 0.02, 0.045]), { color: '#2e1d12', outline: 0 });
  }
  mount(b.build(), 'hat-main');
  // palm sprig on the crown (swayed by player.js through userData.sprout)
  const sprig = new THREE.Group();
  sprig.name = 'sprig';
  sprig.position.set(0.05, 0.64, -0.02);
  g.add(sprig);
  const s = new Baker();
  s.add(cyl(0.015, 0.022, 0.12, 6), xf([0, 0.05, 0]), { color: GREEN });
  for (const [rz, ry, len] of [[1.0, 0, 0.26], [-1.0, 0, 0.26], [0.5, 1.5, 0.22], [0.5, -1.5, 0.22]]) {
    const m = new THREE.Matrix4().multiplyMatrices(xf([0, 0.11, 0], [0, ry, 0]), xf([0, 0, 0], [0, 0, rz]));
    s.add(sph(10, 6), m.multiply(xf([0, len * 0.42, 0], [0, 0, 0], [0.04, len * 0.5, 0.012])), { color: LEAF, outline: 0.012 });
  }
  mount(s.build(), 'sprig-mesh', sprig, false);
  g.userData.sprout = sprig;
  return g;
}

// ---------------------------------------------------------------------------------------------------------------- 5 Chef's Toque
function buildToque() {
  const { g, mount } = shell('toque', -0.08);
  const b = new Baker();
  b.add(cyl(0.48, 0.48, 0.28, 28, true), xf([0, 0.26, 0], [0, 0, 0], [1.04, 1, 1]), { color: '#fffaf0', outline: 0.028, inner: true });
  b.add(cyl(0.49, 0.49, 0.1, 28, true), xf([0, 0.17, 0], [0, 0, 0], [1.04, 1, 1]), { color: '#ffffff', role: 'hat', outline: 0.02 });
  const puff = (x, y, z, r, h = 1) => b.add(sph(20, 14), xf([x, y, z], [0, 0, 0], [r, r * h, r]), { color: '#fffaf0', outline: 0.028 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    puff(Math.cos(a) * 0.27, 0.5, Math.sin(a) * 0.27, 0.27);
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.9;
    puff(Math.cos(a) * 0.17, 0.74, Math.sin(a) * 0.17, 0.25);
  }
  puff(0, 0.84, 0, 0.27);
  mount(b.build(), 'hat-main');
  return g;
}

// ---------------------------------------------------------------------------------------------------------------- 6 Apple
function buildApple() {
  const { g, mount } = shell('apple', -0.06);
  const b = new Baker();
  const c = [0, 0.38, 0], r = [0.5, 0.42, 0.5];
  b.add(new THREE.SphereGeometry(1, 30, 20), xf(c, [0, 0, 0], r), { color: RED, outline: 0.03 });
  b.add(sph(14, 8), xf([0, 0.79, 0], [0, 0, 0], [0.17, 0.06, 0.17]), { color: '#a82a33', outline: 0 });       // stem dimple
  b.add(sph(12, 8), along(...(() => { const { p, n } = onEllipsoid(c, r, 0.8, -0.6); return [p.map((v) => v * 0.99), n, [0.08, 0.04, 0.14]]; })()), { color: '#ffffff', outline: 0 });   // shine
  for (const [th, ph, s] of [[1.2, 0.45, 0.13], [1.3, 0.85, 0.11], [1.1, 0.7, 0.09]]) {                                       // bite: cream flesh scallops
    const { p, n } = onEllipsoid(c, r, th, ph);
    b.add(sph(14, 8), along(p, n, [s, 0.04, s]), { color: CREAM, outline: 0.012 });
  }
  mount(b.build(), 'hat-main');
  // stem + leaf: the swaying small part
  const sprout = new THREE.Group();
  sprout.name = 'apple-stem';
  sprout.position.set(0, 0.78, 0);
  g.add(sprout);
  const s = new Baker();
  s.add(cyl(0.02, 0.028, 0.17, 8), xf([0.015, 0.06, 0], [0, 0, -0.15]), { color: TRUNK, outline: 0.014 });
  s.add(sph(12, 8), xf([0.13, 0.12, 0], [0, 0, 0.4], [0.14, 0.035, 0.075]), { color: LEAF, outline: 0.014 });
  mount(s.build(), 'apple-leaf', sprout, false);
  g.userData.sprout = sprout;
  return g;
}

// ---------------------------------------------------------------------------------------------------------------- 7 Butterfly
function buildButterfly() {
  const { g, mount } = shell('butterfly', -0.05);
  const b = new Baker();
  addHair(b);
  // flower clip on the front-left of the hair (accent-coloured petals)
  const fp = [0.3, 0.27, 0.27], fn = [0.6, 0.55, 0.58];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const m = along(fp, fn).multiply(xf([Math.cos(a) * 0.075, 0.015, Math.sin(a) * 0.075], [0, 0, 0], [0.065, 0.03, 0.065]));
    b.add(sph(10, 8), m, { color: '#ffffff', role: 'hat', outline: 0.014 });
  }
  b.add(sph(10, 8), along([fp[0] + fn[0] * 0.03, fp[1] + fn[1] * 0.03, fp[2] + fn[2] * 0.03], fn, [0.045, 0.04, 0.045]), { color: '#ffd85e', outline: 0.012 });
  // butterfly body, perched on top (the wings flap in their own part); long antennae with ball tips
  const bp = [0.04, 0.52, -0.06], DK = '#3a2b4a';
  b.add(cap(0.058, 0.2), xf(bp, [Math.PI / 2, 0, 0.1]), { color: DK, outline: 0.016 });
  b.add(sph(10, 8), xf([bp[0], bp[1] + 0.01, bp[2] + 0.2], [0, 0, 0], [0.075, 0.075, 0.075]), { color: DK, outline: 0.014 });
  for (const s of [-1, 1]) {
    b.add(cyl(0.014, 0.014, 0.24, 5), xf([bp[0] + s * 0.06, bp[1] + 0.13, bp[2] + 0.27], [0.6, 0, s * 0.4]), { color: DK, outline: 0.008 });
    b.add(sph(8, 6), xf([bp[0] + s * 0.11, bp[1] + 0.23, bp[2] + 0.32], [0, 0, 0], [0.04, 0.04, 0.04]), { color: '#ffd85e', outline: 0.01 });
  }
  mount(b.build(), 'hat-main');

  const wings = new THREE.Group();
  wings.name = 'wings';
  wings.position.set(bp[0], bp[1] + 0.04, bp[2]);
  g.add(wings);
  const w = new Baker();
  for (const s of [-1, 1]) {
    w.add(sph(18, 10), xf([0.36 * s, 0.07, 0.14], [0, 0, 0.35 * s], [0.4, 0.035, 0.3]), { color: '#ff9a3c', outline: 0.016 });       // upper wing
    w.add(sph(14, 8), xf([0.6 * s, 0.14, 0.2], [0, 0.3 * s, 0.35 * s], [0.16, 0.036, 0.2]), { color: DK, outline: 0.012 });          // dark tip
    w.add(sph(16, 10), xf([0.24 * s, 0.05, -0.2], [0, 0, 0.3 * s], [0.27, 0.035, 0.2]), { color: '#ffd85e', outline: 0.016 });        // lower wing
    w.add(sph(10, 6), xf([0.34 * s, 0.1, 0.12], [0, 0, 0.35 * s], [0.07, 0.016, 0.06]), { color: '#ffffff', outline: 0 });
    w.add(sph(10, 6), xf([0.26 * s, 0.09, -0.2], [0, 0, 0.3 * s], [0.06, 0.016, 0.05]), { color: '#ff9a3c', outline: 0 });
  }
  mount(w.build(), 'wings-mesh', wings, false);
  g.userData.update = (dt, t) => {
    const f = Math.abs(Math.sin(t * 3.2));
    wings.scale.x = 0.45 + 0.55 * f;
    wings.rotation.y = Math.sin(t * 0.9) * 0.12;
  };
  return g;
}

// ---------------------------------------------------------------------------------------------------------------- 8 Teakettle
function buildTeakettle() {
  const { g, mount } = shell('teakettle', -0.08);
  const b = new Baker();
  b.add(new THREE.SphereGeometry(1, 30, 20), xf([0, 0.39, 0], [0, 0, 0], [0.53, 0.42, 0.53]), { color: '#ffffff', role: 'hat', outline: 0.03 });
  b.add(new THREE.TorusGeometry(0.47, 0.03, 8, 30), xf([0, 0.25, 0], [Math.PI / 2, 0, 0]), { color: '#ffffff', outline: 0.018 });
  b.add(sph(20, 10), xf([0, 0.79, 0], [0, 0, 0], [0.29, 0.1, 0.29]), { color: SILVER, outline: 0.024 });        // lid
  b.add(sph(12, 8), xf([0, 0.9, 0], [0, 0, 0], [0.075, 0.075, 0.075]), { color: IRON, outline: 0.02 });       // knob
  // spout (right), handle loop (left)
  b.add(cyl(0.065, 0.15, 0.46, 12), xf([0.62, 0.54, 0], [0, 0, -1.0]), { color: '#ffffff', role: 'hat', outline: 0.024 });
  b.add(new THREE.TorusGeometry(0.22, 0.056, 8, 18, Math.PI), xf([-0.5, 0.42, 0], [0, 0, Math.PI / 2]), { color: IRON, outline: 0.022 });
  mount(b.build(), 'hat-main');

  const steam = new THREE.Group();
  steam.name = 'steam';
  steam.position.set(0, 1.04, 0);
  g.add(steam);
  const s = new Baker();
  s.add(sph(12, 8), xf([0, 0.0, 0], [0, 0, 0], [0.14, 0.12, 0.14]), { color: '#ffffff', outline: 0.012 });
  s.add(sph(12, 8), xf([0.05, 0.2, 0], [0, 0, 0], [0.11, 0.1, 0.11]), { color: '#f1f6ff', outline: 0.012 });
  s.add(sph(12, 8), xf([-0.03, 0.36, 0], [0, 0, 0], [0.08, 0.075, 0.08]), { color: '#e6efff', outline: 0.01 });
  mount(s.build(), 'steam-mesh', steam, false);
  g.userData.update = (dt, t) => {
    steam.rotation.z = Math.sin(t * 1.7) * 0.28;
    steam.scale.set(1 + Math.sin(t * 2.3) * 0.08, 1 + Math.sin(t * 1.3 + 1) * 0.15, 1);
  };
  return g;
}

// ---------------------------------------------------------------------------------------------------------------- 9 Lily Pad
function buildLilyPad() {
  const { g, mount } = shell('lily-pad', -0.08);
  const b = new Baker();
  addHair(b);
  // the pad: a shallow dish with a wedge notch, floating a little above the hair
  const padGeo = new THREE.SphereGeometry(1, 36, 8, 2.675, Math.PI * 2 - 0.6, 0, 0.8).scale(1, 1, 1);
  b.add(padGeo, xf([0.0, -0.05, 0], [0, 0, 0], [1.0, 0.52, 1.0]), { color: '#58c96b', outline: 0.026, inner: true });
  // pink blossom
  const bp = [0.1, 0.57, 0.12];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const m = new THREE.Matrix4().multiplyMatrices(xf(bp, [0, a, 0]), xf([0, 0.03, 0.14], [0.5, 0, 0], [0.09, 0.045, 0.17]));
    b.add(sph(12, 8), m, { color: '#ffb3d1', outline: 0.016 });
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const m = new THREE.Matrix4().multiplyMatrices(xf(bp, [0, a, 0]), xf([0, 0.1, 0.06], [0.25, 0, 0], [0.07, 0.04, 0.12]));
    b.add(sph(12, 8), m, { color: '#ffd1e3', outline: 0.012 });
  }
  b.add(sph(10, 8), xf([bp[0], bp[1] + 0.08, bp[2]], [0, 0, 0], [0.07, 0.07, 0.07]), { color: '#ffd85e', outline: 0.012 });
  mount(b.build(), 'hat-main');
  return g;
}

// ---------------------------------------------------------------------------------------------------------------- 10 Feast Crown
function buildFeastCrown() {
  const { g, mount } = shell('feast-crown', -0.1);
  const b = new Baker();
  addHair(b);
  b.add(cyl(0.5, 0.5, 0.16, 32, true), xf([0, 0.27, 0], [0, 0, 0], [1.03, 1, 1]), { color: GOLD, outline: 0.028, inner: true });
  b.add(new THREE.TorusGeometry(0.5, 0.035, 8, 32), xf([0, 0.19, 0], [Math.PI / 2, 0, 0], [1.03, 1, 1]), { color: '#ffffff', role: 'hat', outline: 0.02 });
  b.add(new THREE.TorusGeometry(0.5, 0.03, 8, 32), xf([0, 0.35, 0], [Math.PI / 2, 0, 0], [1.03, 1, 1]), { color: '#ffe48a', outline: 0.018 });
  const N = 8;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    // each point is built in a local frame that faces outward (+Z), then splayed a little
    const place = new THREE.Matrix4().multiplyMatrices(xf([Math.sin(a) * 0.5 * 1.03, 0.34, Math.cos(a) * 0.5], [0, a, 0]), xf([0, 0, 0], [0.12, 0, 0]));
    const at = (geo, p, s, o) => b.add(geo, place.clone().multiply(xf(p, [0, 0, 0], s)), o);
    at(cap(0.032, 0.2), [0, 0.14, 0], [1, 1, 1], { color: SILVER, outline: 0.016 });
    if (i % 2 === 0) {                                       // fork: cross-bar + three prongs
      at(sph(12, 8), [0, 0.27, 0], [0.075, 0.032, 0.03], { color: SILVER, outline: 0.014 });
      for (const x of [-0.05, 0, 0.05]) at(cyl(0.016, 0.016, 0.13, 6), [x, 0.35, 0], [1, 1, 1], { color: SILVER, outline: 0.012 });
    } else {                                                 // spoon: oval bowl
      at(sph(14, 10), [0, 0.34, 0], [0.078, 0.098, 0.03], { color: SILVER, outline: 0.016 });
    }
    // berry jewel in the gap before this point
    const ja = a - Math.PI / N;
    const col = ['#e8453c', '#7b5cff', '#ff6fa5'][i % 3];
    b.add(sph(12, 8), xf([Math.sin(ja) * 0.53 * 1.03, 0.27, Math.cos(ja) * 0.53], [0, 0, 0], [0.058, 0.058, 0.058]), { color: col, outline: 0.016 });
  }
  mount(b.build(), 'hat-main');
  return g;
}

export const HATS = [
  { id: 'frying-pan', name: 'Frying Pan', build: buildFryingPan },
  { id: 'mushroom-cap', name: 'Mushroom Cap', build: buildMushroomCap },
  { id: 'stock-pot', name: 'Stock Pot', build: buildStockPot },
  { id: 'coconut', name: 'Coconut', build: buildCoconut },
  { id: 'toque', name: "Chef's Toque", build: buildToque },
  { id: 'apple', name: 'Apple', build: buildApple },
  { id: 'butterfly', name: 'Butterfly', build: buildButterfly },
  { id: 'teakettle', name: 'Teakettle', build: buildTeakettle },
  { id: 'lily-pad', name: 'Lily Pad', build: buildLilyPad },
  { id: 'feast-crown', name: 'Feast Crown', build: buildFeastCrown },
];
