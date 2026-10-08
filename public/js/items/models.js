// Equippable item models: axe, sword, hammer, shovel, slingshot and lightsabers. Chunky, cute and deliberately oversized so they
// read clearly at the ~16u gameplay camera distance (each is roughly 0.9 - 1.15u long).
//
// Conventions (shared by every builder, so attaching to the hand is trivial):
//   * the model origin is the GRIP point (where the fingers close around the handle)
//   * the handle / blade points along +Y
//   * a head that sticks out sideways (axe head, shovel scoop face) points along +X, the flat side faces +Z
//   * each model is a Group with (at most) one merged vertex-coloured toon mesh + one inverted-hull outline
//     (so an item is ~2 draw calls), plus for lightsabers the emissive blade meshes.
//
//   const m = buildItemModel('sword');            // or buildAxe() / buildLightsaber('#4db8ff') ...
//   m.userData = {
//     kind, name,
//     center,        // y of the model's visual middle (used to hover the item around its centre when lying on the ground)
//     length,        // approximate overall length
//     trailBase, trailTip,   // local points (Vector3) that a swing trail ribbon should follow
//     accent,        // hex colour for sparkle rings / trails
//     blade?, setBlade?(k), update?(t)     // lightsabers only: k in 0..1 is the blade length, update() flickers the glow
//   }
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toonMat, addOutline } from '../render/toon.js';

export const ITEM_OUTLINE = 0.03;

// ---------------------------------------------------------------------------------------------
// Tiny geometry toolkit (same idea as world/props.js: bake transform + flat vertex colour, merge)
// ---------------------------------------------------------------------------------------------
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

function part(geo, color, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], fn = null } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  _e.set(r[0], r[1], r[2]);
  _q.setFromEuler(_e);
  _m.compose(_v.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
  g.applyMatrix4(_m);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  const pos = g.attributes.position;
  const tmp = new THREE.Color();
  for (let i = 0; i < n; i++) {
    if (fn) { tmp.copy(c); fn(tmp, pos.getX(i), pos.getY(i), pos.getZ(i)); arr[i * 3] = tmp.r; arr[i * 3 + 1] = tmp.g; arr[i * 3 + 2] = tmp.b; }
    else { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Position-only, welded, smooth-normal copy used to extrude an even, closed outline hull. */
function smoothOutlineGeo(geo) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', geo.attributes.position.clone());
  const m = mergeVertices(g, 1e-3);
  m.computeVertexNormals();
  return m;
}

/** Merge parts into one toon mesh (+ outline hull). */
function bakeMesh(parts, thickness = ITEM_OUTLINE) {
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  const mesh = new THREE.Mesh(geo, toonMat('#ffffff', { vertexColors: true }));
  mesh.name = 'item-body';
  mesh.castShadow = true;
  const tmp = new THREE.Mesh(smoothOutlineGeo(geo));
  const o = addOutline(tmp, thickness);
  tmp.remove(o);
  mesh.add(o);
  return mesh;
}

/** Extruded, bevelled 2D shape centred on z = 0 (flat-shaded facets read nicely in toon shading). */
function extrude(shape, depth, bevel = 0.02) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10, steps: 1,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

const G = {
  capsule: (r, len) => new THREE.CapsuleGeometry(r, len, 5, 12),
  cyl: (r0, r1, h, seg = 14) => new THREE.CylinderGeometry(r1, r0, h, seg, 1),
  sphere: new THREE.SphereGeometry(1, 14, 10),
  box: (x, y, z, r = 0.03) => new RoundedBoxGeometry(x, y, z, 3, r),
};

function group(kind, name, extra) {
  const g = new THREE.Group();
  g.name = `item-${kind}`;
  g.userData = { kind, name, ...extra };
  return g;
}

const HANDLE = '#c98a55';
const HANDLE_DARK = '#8f5a37';
const GOLD = '#ffd45e';

// ---------------------------------------------------------------------------------------------
// Axe: wooden handle, steel crescent head
// ---------------------------------------------------------------------------------------------
export function buildAxe() {
  const parts = [];
  parts.push(part(G.capsule(0.05, 0.78), HANDLE, { p: [0, 0.13, 0] }));
  parts.push(part(G.cyl(0.062, 0.062, 0.05), HANDLE_DARK, { p: [0, -0.16, 0] }));      // grip wraps
  parts.push(part(G.cyl(0.062, 0.062, 0.05), HANDLE_DARK, { p: [0, -0.06, 0] }));
  parts.push(part(G.sphere, HANDLE_DARK, { p: [0, -0.32, 0], s: [0.075, 0.075, 0.075] }));    // knob
  // head: crescent silhouette in XY, edge on +X
  const s = new THREE.Shape();
  s.moveTo(0.02, 0.28);
  s.quadraticCurveTo(0.2, 0.3, 0.36, 0.1);
  s.quadraticCurveTo(0.58, 0.4, 0.36, 0.7);
  s.quadraticCurveTo(0.2, 0.5, 0.02, 0.52);
  s.lineTo(0.02, 0.28);
  parts.push(part(extrude(s, 0.07, 0.03), '#b7c3da', {
    fn: (c, x) => { c.lerp(new THREE.Color('#f3f9ff'), THREE.MathUtils.smoothstep(x, 0.2, 0.5)); },
  }));
  parts.push(part(G.box(0.15, 0.26, 0.12, 0.04), '#8f9db8', { p: [-0.045, 0.4, 0] }));      // poll / socket behind the handle
  const g = group('axe', 'Axe', {
    center: 0.28, length: 1.0, accent: '#dfe9ff',
    trailBase: new THREE.Vector3(0.0, 0.2, 0), trailTip: new THREE.Vector3(0.5, 0.4, 0),
  });
  g.add(bakeMesh(parts));
  return g;
}

// ---------------------------------------------------------------------------------------------
// Sword: gold crossguard + pommel, shiny blade with a fuller
// ---------------------------------------------------------------------------------------------
export function buildSword() {
  const parts = [];
  parts.push(part(G.capsule(0.052, 0.2), '#8b5be0', { p: [0, -0.06, 0] }));              // purple grip
  parts.push(part(G.cyl(0.062, 0.062, 0.035), GOLD, { p: [0, -0.1, 0] }));
  parts.push(part(G.cyl(0.062, 0.062, 0.035), GOLD, { p: [0, -0.01, 0] }));
  parts.push(part(G.sphere, GOLD, { p: [0, -0.22, 0], s: [0.085, 0.085, 0.085] }));         // pommel
  parts.push(part(G.box(0.44, 0.085, 0.11, 0.035), GOLD, { p: [0, 0.1, 0] }));              // crossguard
  parts.push(part(G.sphere, '#ff6b8f', { p: [0, 0.1, 0.06], s: [0.035, 0.035, 0.03] }));    // gem
  const s = new THREE.Shape();
  s.moveTo(-0.085, 0.14);
  s.lineTo(0.085, 0.14);
  s.lineTo(0.085, 0.68);
  s.lineTo(0.0, 0.86);
  s.lineTo(-0.085, 0.68);
  s.lineTo(-0.085, 0.14);
  parts.push(part(extrude(s, 0.05, 0.022), '#dff1ff', {
    fn: (c, x) => { c.lerp(new THREE.Color('#ffffff'), THREE.MathUtils.smoothstep(x, 0.0, 0.11) * 0.7); },
  }));
  parts.push(part(G.box(0.045, 0.5, 0.085, 0.02), '#9fd0ff', { p: [0, 0.4, 0] }));       // fuller stripe
  const g = group('sword', 'Sword', {
    center: 0.32, length: 1.1, accent: '#bfe6ff',
    trailBase: new THREE.Vector3(0, 0.16, 0), trailTip: new THREE.Vector3(0, 0.88, 0),
  });
  g.add(bakeMesh(parts));
  return g;
}

// ---------------------------------------------------------------------------------------------
// Hammer: big mallet head with cream faces and a stout handle
// ---------------------------------------------------------------------------------------------
export function buildHammer() {
  const parts = [];
  parts.push(part(G.capsule(0.055, 0.86), HANDLE, { p: [0, 0.14, 0] }));
  parts.push(part(G.cyl(0.066, 0.066, 0.05), HANDLE_DARK, { p: [0, -0.16, 0] }));
  parts.push(part(G.cyl(0.066, 0.066, 0.05), HANDLE_DARK, { p: [0, -0.06, 0] }));
  parts.push(part(G.sphere, HANDLE_DARK, { p: [0, -0.32, 0], s: [0.08, 0.08, 0.08] }));
  parts.push(part(G.box(0.5, 0.34, 0.34, 0.09), '#ff6b7d', { p: [0, 0.56, 0] }));              // mallet head
  for (const side of [-1, 1]) {
    parts.push(part(G.box(0.1, 0.37, 0.37, 0.07), '#ffe3a1', { p: [0.27 * side, 0.56, 0] }));   // end caps
    parts.push(part(G.box(0.05, 0.36, 0.36, 0.03), '#c9d3e6', { p: [0.15 * side, 0.56, 0] }));  // steel bands
  }
  const g = group('hammer', 'Hammer', {
    center: 0.3, length: 1.0, accent: '#ffb3bd',
    trailBase: new THREE.Vector3(0, 0.3, 0), trailTip: new THREE.Vector3(0.36, 0.56, 0),
  });
  g.add(bakeMesh(parts));
  return g;
}

// ---------------------------------------------------------------------------------------------
// Shovel: T-grip, wooden shaft, mint scoop
// ---------------------------------------------------------------------------------------------
export function buildShovel() {
  const parts = [];
  parts.push(part(G.capsule(0.048, 0.62), HANDLE, { p: [0, 0.03, 0] }));
  parts.push(part(G.capsule(0.05, 0.22), HANDLE_DARK, { p: [0, -0.3, 0], r: [0, 0, Math.PI / 2] }));   // T handle
  parts.push(part(G.cyl(0.062, 0.062, 0.1), '#c9d3e6', { p: [0, 0.36, 0] }));                          // ferrule
  const s = new THREE.Shape();
  s.moveTo(-0.07, 0.4);
  s.lineTo(-0.2, 0.55);
  s.quadraticCurveTo(-0.25, 0.86, 0.0, 0.92);
  s.quadraticCurveTo(0.25, 0.86, 0.2, 0.55);
  s.lineTo(0.07, 0.4);
  s.lineTo(-0.07, 0.4);
  parts.push(part(extrude(s, 0.045, 0.03), '#7fe3c4', {
    fn: (c, x, y) => { c.lerp(new THREE.Color('#d6fff2'), THREE.MathUtils.smoothstep(y, 0.6, 0.92) * 0.6); },
  }));
  const g = group('shovel', 'Shovel', {
    center: 0.3, length: 1.2, accent: '#b6ffe6',
    trailBase: new THREE.Vector3(0, 0.3, 0), trailTip: new THREE.Vector3(0, 0.92, 0),
  });
  g.add(bakeMesh(parts));
  return g;
}

// ---------------------------------------------------------------------------------------------
// Slingshot (Step 59): a forked wooden handle with two rubber tips, a pink band and a little pebble in the pouch
// ---------------------------------------------------------------------------------------------
export function buildSlingshot() {
  const parts = [];
  parts.push(part(G.capsule(0.06, 0.5), HANDLE, { p: [0, 0.02, 0] }));
  parts.push(part(G.cyl(0.07, 0.07, 0.05), HANDLE_DARK, { p: [0, -0.1, 0] }));          // grip wraps
  parts.push(part(G.cyl(0.07, 0.07, 0.05), HANDLE_DARK, { p: [0, 0.0, 0] }));
  parts.push(part(G.sphere, HANDLE_DARK, { p: [0, -0.3, 0], s: [0.08, 0.08, 0.08] }));  // knob
  for (const side of [-1, 1]) {
    parts.push(part(G.capsule(0.05, 0.36), HANDLE, { p: [side * 0.13, 0.62, 0], r: [0, 0, -side * 0.42] }));   // the fork's arms
    parts.push(part(G.sphere, '#ff6b8f', { p: [side * 0.24, 0.86, 0], s: [0.065, 0.065, 0.065] }));          // rubber tips
  }
  parts.push(part(G.sphere, HANDLE_DARK, { p: [0, 0.4, 0], s: [0.12, 0.08, 0.09] }));                       // the fork's crotch
  for (const side of [-1, 1]) {                                                                              // the band: tip -> pouch
    const ax = side * 0.24, ay = 0.86, bx = 0, by = 0.7, bz = 0.16, len = Math.hypot(ax - bx, ay - by, bz);
    parts.push(part(G.cyl(0.018, 0.018, len, 6), '#ff6b8f', { p: [(ax + bx) / 2, (ay + by) / 2, bz / 2], r: [Math.atan2(bz, Math.hypot(ax - bx, ay - by)) * 0.9, 0, side * Math.atan2(ax - bx, ay - by) * -1] }));
  }
  parts.push(part(G.box(0.1, 0.07, 0.04, 0.02), '#8f5a37', { p: [0, 0.7, 0.16] }));          // pouch
  parts.push(part(G.sphere, '#cfd6e6', { p: [0, 0.74, 0.17], s: [0.055, 0.055, 0.055] }));   // the pebble
  const g = group('slingshot', 'Slingshot', {
    center: 0.4, length: 1.2, accent: '#ffc9d6',
    trailBase: new THREE.Vector3(0, 0.4, 0), trailTip: new THREE.Vector3(0, 0.86, 0),
  });
  g.add(bakeMesh(parts));
  return g;
}

// ---------------------------------------------------------------------------------------------
// Lightsaber: silver hilt with accent bands, emissive core + additive halo blade (scalable for ignite / retract)
// ---------------------------------------------------------------------------------------------
const BLADE_LEN = 0.84;
const HILT_TOP = 0.23;

export function buildLightsaber(color = '#4db8ff') {
  const accent = new THREE.Color(color);
  const parts = [];
  const SILVER = '#d5dcec', DARK = '#4b4f6a';
  parts.push(part(G.cyl(0.062, 0.062, 0.36), SILVER, { p: [0, 0.03, 0] }));
  parts.push(part(G.cyl(0.07, 0.07, 0.19), DARK, { p: [0, -0.07, 0] }));                       // rubber grip
  for (const y of [-0.15, -0.115, -0.025, 0.01]) parts.push(part(G.cyl(0.075, 0.075, 0.018), accent, { p: [0, y, 0] }));  // accent bands
  parts.push(part(G.sphere, '#8a90ad', { p: [0, -0.23, 0], s: [0.075, 0.07, 0.075] }));        // pommel
  parts.push(part(G.cyl(0.082, 0.07, 0.07), '#f4f7ff', { p: [0, 0.2, 0] }));                   // emitter shroud
  parts.push(part(G.cyl(0.088, 0.088, 0.022), accent, { p: [0, 0.235, 0] }));                  // emitter ring
  parts.push(part(G.sphere, accent, { p: [0.0, 0.08, 0.07], s: [0.026, 0.026, 0.02] }));       // activation button
  const g = group('lightsaber', `${colorName(color)} Lightsaber`, {
    center: 0.02, length: 0.95, accent: color,
    trailBase: new THREE.Vector3(0, HILT_TOP + 0.05, 0), trailTip: new THREE.Vector3(0, HILT_TOP + BLADE_LEN, 0),
    color,
  });
  g.add(bakeMesh(parts, 0.028));

  // ---- blade: group scaled along Y (origin at the emitter)
  const blade = new THREE.Group();
  blade.name = 'blade';
  blade.position.y = HILT_TOP;
  const coreCol = new THREE.Color('#ffffff').lerp(accent, 0.2);
  const rc = 0.034;
  const coreGeo = new THREE.CapsuleGeometry(rc, BLADE_LEN - rc * 2, 4, 12);
  coreGeo.translate(0, BLADE_LEN / 2, 0);
  const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: coreCol, toneMapped: false }));
  core.name = 'blade-core';
  // saturated mid layer (normal blending) keeps the colour readable on bright grass, where pure additive would wash out
  const rm = 0.064;
  const midGeo = new THREE.CapsuleGeometry(rm, BLADE_LEN - rm * 2 + 0.03, 4, 12);
  midGeo.translate(0, BLADE_LEN / 2 + 0.01, 0);
  const mid = new THREE.Mesh(midGeo, new THREE.MeshBasicMaterial({
    color: accent, transparent: true, opacity: 0.92, depthWrite: false, toneMapped: false,
  }));
  mid.name = 'blade-mid';
  mid.renderOrder = 4;
  const rg = 0.115;
  const glowGeo = new THREE.CapsuleGeometry(rg, BLADE_LEN - rg * 2 + 0.08, 4, 12);
  glowGeo.translate(0, BLADE_LEN / 2 + 0.02, 0);
  const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
    color: accent, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  glow.name = 'blade-glow';
  glow.renderOrder = 5;
  blade.add(core, mid, glow);
  g.add(blade);

  // ---- a little emitter glow so a lying, retracted saber still hints at its colour
  const ember = new THREE.Mesh(
    new THREE.SphereGeometry(0.058, 12, 8),
    new THREE.MeshBasicMaterial({ color: accent.clone().lerp(new THREE.Color('#ffffff'), 0.35), toneMapped: false }),
  );
  ember.scale.set(1, 0.45, 1);
  ember.position.y = HILT_TOP + 0.005;
  ember.name = 'ember';
  g.add(ember);

  g.userData.blade = blade;
  g.userData.bladeLength = BLADE_LEN;
  g.userData.bladeK = 1;
  g.userData.setBlade = (k) => {
    k = Math.min(1, Math.max(0, k));
    g.userData.bladeK = k;
    blade.visible = k > 0.004;
    blade.scale.set(1, Math.max(0.001, k), 1);
    // fatten slightly at the start of an ignite so it reads as a burst of light
    const fat = 1 + 0.35 * Math.sin(Math.min(1, k) * Math.PI) * (k < 1 ? 1 : 0);
    core.scale.x = core.scale.z = fat;
    mid.scale.x = mid.scale.z = fat;
    glow.scale.x = glow.scale.z = fat;
  };
  g.userData.update = (t) => {
    // gentle hum flicker on the halo (only while lit)
    if (g.userData.bladeK < 0.99) return;
    glow.material.opacity = 0.4 + 0.07 * Math.sin(t * 23) + 0.04 * Math.sin(t * 37 + 1.3);
  };
  g.userData.setBlade(1);
  return g;
}

function colorName(hex) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl, THREE.SRGBColorSpace);
  const h = hsl.h * 360;
  if (h < 20 || h >= 330) return 'Red';
  if (h < 70) return 'Yellow';
  if (h < 170) return 'Green';
  if (h < 260) return 'Blue';
  if (h < 300) return 'Purple';
  return 'Pink';
}

/** Build a model by kind: 'axe' | 'sword' | 'hammer' | 'shovel' | 'slingshot' | 'lightsaber' (opts.color). */
export function buildItemModel(kind, opts = {}) {
  switch (kind) {
    case 'axe': return buildAxe();
    case 'sword': return buildSword();
    case 'hammer': return buildHammer();
    case 'shovel': return buildShovel();
    case 'slingshot': return buildSlingshot();
    case 'lightsaber': return buildLightsaber(opts.color);
    default: throw new Error(`Unknown item kind: ${kind}`);
  }
}
