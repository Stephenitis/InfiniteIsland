// Frostpine Isle prop geometry (Step 29a): merged vertex-coloured shapes with smoothed outline hulls, built once and cached for the whole
// session (a visuals rebuild only recreates the chunk layers; harvest proxies and snowmen keep pointing at these same geometries).
//
//   getAsset(layer)            -> { geo, outlineGeo, thickness }   layers: spruce, spruceSnow, pine, pineSnow, birch, boulder, boulderSnow,
//                                                                   spire, log, reed, edelweiss, gentian, tuft  (+ snowman0..2)
//                                                                   29b gathering plants: lingonBush, lingonBerries, mint, chanterelle
//   makeProxyMesh(layer, tint) -> Mesh (+ outline child)           the animatable stand-in of one instanced tree / boulder (see frostWorld.js)
//   FAR_BLOB[layer]            -> { make, color, y, sx, sy }       one cheap blob per tree for the far version
//   TREE_INFO[layer]           -> { crownY, crownR, promptY }      where leaves / snow come out of when shaken, and where the prompt bubble sits
// All shapes are chunky and toon-friendly: stacked cones for the conifers, jittered facets for granite, small blobs for flowers.
import * as THREE from 'three';
import { toonMat, addOutline } from '../../render/toon.js';
import { part, combine, smoothOutlineGeo } from '../props.js';
import { mulberry32, range } from '../../utils/rng.js';

const TAU = Math.PI * 2;
const SNOW = '#f4f8ff', SNOW_SHADE = '#dbe6f7';

const cone = (r, h, sides = 7) => new THREE.ConeGeometry(r, h, sides, 1);
const cyl = (r0, r1, h, sides = 6) => new THREE.CylinderGeometry(r0, r1, h, sides, 1);
const ico1 = new THREE.IcosahedronGeometry(1, 1);
const sphereLo = new THREE.SphereGeometry(1, 7, 5);
const sphereXs = new THREE.SphereGeometry(1, 6, 4);
const sphere = new THREE.SphereGeometry(1, 12, 9);

/** A tier of needles: a cone, plus (when snowy) a smaller white cone sharing its apex. */
function tier(parts, t, snowy) {
  parts.push(part(cone(t.r, t.h, t.sides ?? 7), t.c, { p: [0, t.y, 0] }));
  if (snowy || t.cap) {
    const ch = t.h * (snowy ? 0.6 : 0.5);
    parts.push(part(cone(t.r * (snowy ? 0.8 : 0.6), ch, t.sides ?? 7), SNOW, { p: [0, t.y + t.h / 2 - ch / 2 + 0.05, 0] }));
  }
}

function spruceGeo(snowy) {
  const parts = [part(cyl(0.2, 0.34, 1.3), '#7a5236', { p: [0, 0.55, 0] })];
  const tiers = [
    { y: 1.75, h: 1.9, r: 1.5, c: '#25725a' }, { y: 2.9, h: 1.8, r: 1.22, c: '#2b7e60' }, { y: 4.0, h: 1.65, r: 0.98, c: '#329067' },
    { y: 5.05, h: 1.5, r: 0.74, c: '#3da072' }, { y: 5.95, h: 1.3, r: 0.5, c: '#4ab27c', cap: true },
  ];
  for (const t of tiers) tier(parts, t, snowy);
  const geo = combine(parts);
  return { geo, outlineGeo: smoothOutlineGeo(geo), thickness: 0.06 };
}

function pineGeo(snowy) {
  const parts = [part(cyl(0.26, 0.42, 2.0, 7), '#8a5a3a', { p: [0, 0.85, 0] })];
  const tiers = [
    { y: 2.35, h: 1.7, r: 2.0, c: '#3b8a46', sides: 8 }, { y: 3.45, h: 1.5, r: 1.6, c: '#459a52', sides: 8 },
    { y: 4.45, h: 1.35, r: 1.15, c: '#53ad60', sides: 8, cap: true },
  ];
  for (const t of tiers) tier(parts, t, snowy);
  parts.push(part(ico1, snowy ? SNOW : '#66c070', { p: [0, 5.15, 0], s: [0.62, 0.7, 0.62] }));
  const geo = combine(parts);
  return { geo, outlineGeo: smoothOutlineGeo(geo), thickness: 0.06 };
}

function birchGeo() {
  const parts = [part(cyl(0.17, 0.27, 3.4, 7), '#f1ece0', { p: [0, 1.6, 0] }), part(cyl(0.27, 0.36, 0.3, 7), '#e4dccb', { p: [0, 0.1, 0] })];
  const rng = mulberry32(77);
  for (let i = 0; i < 7; i++) {                                    // dark bark marks: little bands stuck to the trunk
    const a = rng() * TAU, y = 0.5 + i * 0.42 + rng() * 0.15;
    parts.push(part(sphereXs, '#2e2a33', { p: [Math.cos(a) * 0.2, y, Math.sin(a) * 0.2], r: [0, -a, 0], s: [0.05, 0.05 + rng() * 0.05, 0.13 + rng() * 0.07] }));
  }
  parts.push(part(cyl(0.05, 0.08, 1.1), '#e8e1d2', { p: [0.35, 3.0, 0.1], r: [0, 0, -0.9] }));
  const blobs = [
    [0, 4.15, 0, 1.6, 1.25, '#b6d457'], [1.05, 3.7, 0.4, 1.05, 0.9, '#a3c64a'], [-1.0, 3.65, -0.5, 1.15, 0.95, '#c4de62'],
    [0.2, 5.0, -0.2, 1.0, 0.85, '#d6e978'], [-0.4, 3.55, 0.9, 0.9, 0.75, '#9ec045'],
  ];
  for (const [x, y, z, r, sy, c] of blobs) parts.push(part(ico1, c, { p: [x, y, z], s: [r, sy, r] }));
  const geo = combine(parts);
  return { geo, outlineGeo: smoothOutlineGeo(geo), thickness: 0.06 };
}

/** Granite: a jittered dodecahedron (fixed seed), blue-grey, lighter on top; the snowy one wears a white cap on every upward-facing facet. */
function boulderGeo(snowy) {
  const g = new THREE.DodecahedronGeometry(1, 0);
  const rng = mulberry32(snowy ? 311 : 311);                       // same shape with and without snow, so a swap never changes the silhouette
  const jitter = new Map();
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = pos.getX(i).toFixed(3) + ',' + pos.getY(i).toFixed(3) + ',' + pos.getZ(i).toFixed(3);
    let j = jitter.get(k);
    if (!j) { j = [range(rng, -1, 1), range(rng, -1, 1), range(rng, -1, 1), range(rng, 0.9, 1.12)]; jitter.set(k, j); }
    pos.setXYZ(i, (pos.getX(i) * j[3] + j[0] * 0.2) * 1.05, (pos.getY(i) * j[3] + j[1] * 0.2) * 0.78, (pos.getZ(i) * j[3] + j[2] * 0.2));
  }
  g.computeVertexNormals();
  const nrm = g.attributes.normal, n = pos.count;
  const arr = new Float32Array(n * 3);
  const base = new THREE.Color('#9aa7c4'), light = new THREE.Color('#c8d3ea'), dark = new THREE.Color('#68749a'), snow = new THREE.Color(SNOW), tmp = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const ny = nrm.getY(i);
    tmp.copy(base).lerp(ny > 0 ? light : dark, Math.min(1, Math.abs(ny) * 0.9));
    if (snowy) tmp.lerp(snow, Math.min(1, Math.max(0, (ny - 0.3) / 0.25)));
    arr[i * 3] = tmp.r; arr[i * 3 + 1] = tmp.g; arr[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return { geo: g, outlineGeo: smoothOutlineGeo(g), thickness: 0.05 };
}

/** Icicle rock: a lump of grey stone with a cluster of pale-blue crystal spikes. */
function spireGeo() {
  const parts = [part(ico1, '#8f9bb8', { p: [0, 0.12, 0], s: [0.75, 0.38, 0.7] })];
  const spikes = [[0, 0, 0, 0.4, 2.3, 0, 0, '#cdeefb'], [0.5, 0, 0.1, 0.28, 1.5, 0.3, -0.35, '#e6f8ff'], [-0.42, 0, -0.2, 0.3, 1.7, -0.25, 0.3, '#a9dcf0'],
    [0.05, 0, -0.5, 0.22, 1.1, 0.5, 0.1, '#d6f2fc'], [-0.15, 0, 0.5, 0.2, 0.9, -0.4, -0.5, '#e6f8ff']];
  for (const [x, , z, r, h, rx, rz, c] of spikes) parts.push(part(cone(r, h, 5), c, { p: [x, 0.1 + h * 0.5, z], r: [rx, 0, rz] }));
  const geo = combine(parts);
  return { geo, outlineGeo: smoothOutlineGeo(geo), thickness: 0.05 };
}

/** Fallen log lying along local +X, snow on top. */
function logGeo() {
  const L = 2.7, R = 0.36;
  const parts = [];
  const body = cyl(R, R, L, 9); body.rotateZ(Math.PI / 2);
  parts.push(part(body, '#7b5436', { p: [0, R, 0] }));
  for (const sgn of [-1, 1]) {
    const disc = new THREE.CircleGeometry(R * 0.94, 10); disc.rotateY(sgn * Math.PI / 2);
    parts.push(part(disc, '#e8c690', { p: [sgn * (L / 2 + 0.01), R, 0] }));
    const ring = new THREE.RingGeometry(R * 0.35, R * 0.46, 10); ring.rotateY(sgn * Math.PI / 2);
    parts.push(part(ring, '#c98d5a', { p: [sgn * (L / 2 + 0.02), R, 0] }));
  }
  parts.push(part(cyl(0.07, 0.1, 0.7, 5), '#6a4529', { p: [0.5, R + 0.4, 0.1], r: [0.6, 0, 0.3] }));
  parts.push(part(sphereLo, SNOW, { p: [0, R * 1.78, 0], s: [L * 0.42, 0.12, 0.2] }));
  const geo = combine(parts);
  return { geo, outlineGeo: smoothOutlineGeo(geo), thickness: 0.05 };
}

/** Frozen cattail cluster: pale blades and a few frosted brown heads (no outline: thin shapes). */
function reedGeo() {
  const parts = [];
  const blade = new THREE.ConeGeometry(0.06, 1, 4, 1, true);
  const rng = mulberry32(55);
  for (let i = 0; i < 8; i++) {
    const a = rng() * TAU, d = rng() * 0.3, h = range(rng, 1.1, 1.9), lx = range(rng, -0.16, 0.16), lz = range(rng, -0.16, 0.16);
    parts.push(part(blade, i % 2 ? '#c9d9b4' : '#b5cc9f', { p: [Math.cos(a) * d, h * 0.5, Math.sin(a) * d], r: [lz, 0, -lx], s: [1, h, 1] }));
    if (i % 3 === 0) {
      parts.push(part(sphereLo, '#7a4f33', { p: [Math.cos(a) * d - lx * h * 0.42, h * 0.84, Math.sin(a) * d + lz * h * 0.42], s: [0.07, 0.24, 0.07] }));
      parts.push(part(sphereXs, SNOW, { p: [Math.cos(a) * d - lx * h * 0.45, h * 0.99, Math.sin(a) * d + lz * h * 0.45], s: [0.08, 0.06, 0.08] }));
    }
  }
  return { geo: combine(parts), outlineGeo: null, thickness: 0 };
}

function edelweissGeo() {
  const parts = [part(cyl(0.02, 0.028, 0.4, 5), '#6f9f72', { p: [0, 0.2, 0] })];
  parts.push(part(sphereXs, '#8fb59a', { p: [0.09, 0.14, 0], r: [0, 0, 0.5], s: [0.12, 0.035, 0.06] }));
  parts.push(part(sphereXs, '#8fb59a', { p: [-0.09, 0.2, 0.02], r: [0, 0, -0.5], s: [0.1, 0.03, 0.055] }));
  const y = 0.44;
  for (let k = 0; k < 8; k++) {                                    // woolly star: eight flattened white petals round a yellow heart
    const a = (k / 8) * TAU;
    parts.push(part(sphereXs, k % 2 ? '#ffffff' : '#eef2f5', { p: [Math.cos(a) * 0.15, y, -Math.sin(a) * 0.15], r: [0, a, 0], s: [0.17, 0.05, 0.075] }));
  }
  parts.push(part(sphereXs, '#f6d85a', { p: [0, y + 0.035, 0], s: [0.1, 0.075, 0.1] }));
  const geo = combine(parts);
  return { geo, outlineGeo: null, thickness: 0 };
}

function gentianGeo() {
  const parts = [part(cyl(0.02, 0.028, 0.36, 5), '#4f9a6a', { p: [0, 0.18, 0] })];
  parts.push(part(sphereXs, '#5fb07a', { p: [0.08, 0.12, 0], r: [0, 0, 0.5], s: [0.11, 0.035, 0.06] }));
  parts.push(part(sphereXs, '#5fb07a', { p: [-0.08, 0.2, 0.02], r: [0, 0, -0.5], s: [0.1, 0.03, 0.055] }));
  const y = 0.42;
  for (let k = 0; k < 5; k++) {                                    // an upright bell opening into five blue points
    const a = (k / 5) * TAU;
    parts.push(part(sphereXs, k % 2 ? '#5a74ff' : '#4863f0', { p: [Math.cos(a) * 0.1, y + 0.03, -Math.sin(a) * 0.1], r: [0, a, -0.55], s: [0.17, 0.05, 0.09] }));
  }
  parts.push(part(sphereXs, '#9db0ff', { p: [0, y + 0.0, 0], s: [0.09, 0.14, 0.09] }));
  parts.push(part(sphereXs, '#ffffff', { p: [0, y + 0.09, 0], s: [0.04, 0.04, 0.04] }));
  const geo = combine(parts);
  return { geo, outlineGeo: null, thickness: 0 };
}

/** Snowy grass / heather tuft: blades with white tips, two tiny lilac buds. */
function tuftGeo() {
  const parts = [];
  const bladeCone = new THREE.ConeGeometry(0.12, 1, 5, 1, true);
  const blades = [{ a: 0.0, lean: 0.3, h: 0.7 }, { a: 2.1, lean: 0.34, h: 0.55 }, { a: 4.2, lean: 0.28, h: 0.8 }, { a: 1.0, lean: 0.05, h: 0.5 }, { a: 5.3, lean: 0.4, h: 0.45 }];
  const cBase = new THREE.Color('#4a9a5c'), cTip = new THREE.Color('#cfe9f0'), c = new THREE.Color();
  for (const b of blades) {
    const g = part(bladeCone, '#ffffff', { p: [Math.cos(b.a) * 0.06, b.h * 0.5 - 0.02, Math.sin(b.a) * 0.06], r: [Math.sin(b.a) * b.lean, 0, -Math.cos(b.a) * b.lean], s: [1, b.h, 1] });
    const p = g.attributes.position, col = g.attributes.color;
    for (let i = 0; i < p.count; i++) { c.copy(cBase).lerp(cTip, Math.min(1, Math.max(0, (p.getY(i) - 0.15) / (b.h * 0.9)))); col.setXYZ(i, c.r, c.g, c.b); }
    parts.push(g);
  }
  parts.push(part(sphereXs, '#d99ad8', { p: [0.16, 0.5, 0.05], s: [0.07, 0.09, 0.07] }), part(sphereXs, '#c783d6', { p: [-0.1, 0.42, -0.12], s: [0.06, 0.08, 0.06] }));
  const geo = combine(parts);
  return { geo, outlineGeo: null, thickness: 0 };
}

const SCARVES = ['#e8505b', '#4f8cff', '#3fb36a'];
/** A chubby snowman facing local +Z; `look` picks the scarf colour and the hat (top hat / beanie / bare with twig hair). */
function snowmanGeo(look) {
  const scarf = SCARVES[look % 3];
  const parts = [
    part(sphere, '#eef5fd', { p: [0, 0.62, 0], s: [0.74, 0.68, 0.74] }),
    part(sphere, SNOW, { p: [0, 1.5, 0], s: [0.54, 0.52, 0.54] }),
    part(sphere, '#ffffff', { p: [0, 2.15, 0], s: [0.4, 0.38, 0.4] }),
  ];
  const coal = '#2b2340';
  parts.push(part(sphereXs, coal, { p: [0.14, 2.24, 0.34], s: [0.05, 0.05, 0.05] }), part(sphereXs, coal, { p: [-0.14, 2.24, 0.34], s: [0.05, 0.05, 0.05] }));
  for (let i = 0; i < 5; i++) {
    const a = -0.5 + i * 0.25;
    parts.push(part(sphereXs, coal, { p: [Math.sin(a) * 0.2, 2.02 + 0.06 * Math.cos(a * 2.4), 0.36 - 0.02 * Math.abs(a)], s: [0.028, 0.028, 0.028] }));
  }
  for (let i = 0; i < 3; i++) parts.push(part(sphereXs, coal, { p: [0, 1.62 - i * 0.22, 0.5 - i * 0.015], s: [0.06, 0.06, 0.06] }));
  parts.push(part(cone(0.07, 0.38, 6), '#ff8a3d', { p: [0, 2.15, 0.52], r: [Math.PI / 2, 0, 0] }));
  const ring = new THREE.TorusGeometry(0.36, 0.09, 6, 14); ring.rotateX(Math.PI / 2);
  parts.push(part(ring, scarf, { p: [0, 1.86, 0.0] }));
  parts.push(part(new THREE.BoxGeometry(0.16, 0.5, 0.07), scarf, { p: [0.2, 1.62, 0.34], r: [0, 0, 0.12] }));
  parts.push(part(cyl(0.035, 0.035, 0.85, 4), '#6b4a2e', { p: [0.7, 1.55, 0], r: [0, 0, -1.0] }), part(cyl(0.035, 0.035, 0.85, 4), '#6b4a2e', { p: [-0.7, 1.55, 0], r: [0, 0, 1.0] }));
  if (look === 0) {                                                // top hat
    parts.push(part(cyl(0.46, 0.46, 0.05, 10), coal, { p: [0, 2.48, 0] }), part(cyl(0.27, 0.27, 0.4, 10), coal, { p: [0, 2.7, 0] }), part(cyl(0.285, 0.285, 0.08, 10), scarf, { p: [0, 2.56, 0] }));
  } else if (look === 1) {                                         // beanie with a pompom
    parts.push(part(sphere, scarf, { p: [0, 2.35, 0], s: [0.42, 0.3, 0.42] }), part(sphereLo, '#ffffff', { p: [0, 2.68, 0], s: [0.1, 0.1, 0.1] }));
  } else {                                                         // twig hair
    for (let i = -1; i <= 1; i++) parts.push(part(cyl(0.02, 0.02, 0.35, 4), '#6b4a2e', { p: [i * 0.1, 2.58, 0], r: [0, 0, -i * 0.45] }));
  }
  const geo = combine(parts);
  return { geo, outlineGeo: smoothOutlineGeo(geo), thickness: 0.05 };
}


// ---- Gathering plants (Step 29b)
const LINGON_BLOBS = [[0, 0.42, 0, 0.62, '#2f7a4a'], [0.5, 0.32, 0.18, 0.46, '#3f9150'], [-0.5, 0.3, -0.1, 0.48, '#27663f'], [0.1, 0.3, -0.5, 0.44, '#357f4a'], [-0.14, 0.3, 0.5, 0.42, '#3f9150']];

/** Lingonberry bush: a low, dark-green shrub with a pinch of snow on top. The berries are a separate layer (lingonBerries) so picking can hide them. */
function lingonBushGeo() {
  const parts = LINGON_BLOBS.map(([x, y, z, r, c]) => part(ico1, c, { p: [x, y, z], s: [r, r * 0.78, r] }));
  parts.push(part(sphereLo, SNOW, { p: [0.04, 0.88, 0.02], s: [0.3, 0.09, 0.26] }), part(sphereLo, SNOW, { p: [0.55, 0.64, 0.2], s: [0.17, 0.06, 0.15] }));
  const geo = combine(parts);
  return { geo, outlineGeo: smoothOutlineGeo(geo), thickness: 0.05 };
}

/** Its berries: 13 glossy red beads (low-poly, a pale glint each) stuck to the upper surface of the blobs, same origin / scale as the bush. */
function lingonBerriesGeo() {
  const rng = mulberry32(2929);
  const parts = [];
  const cols = ['#d81e3c', '#ee3b52', '#d81e3c', '#c4162f'];
  for (let i = 0; i < 13; i++) {
    const [bx, by, bz, br] = LINGON_BLOBS[i % LINGON_BLOBS.length];
    const th = range(rng, 0.2, 1.15), ph = rng() * TAU;
    const dx = Math.sin(th) * Math.cos(ph), dy = Math.cos(th), dz = Math.sin(th) * Math.sin(ph);
    const p = [bx + dx * br * 1.0, by + dy * br * 0.78, bz + dz * br * 1.0];
    parts.push(part(sphereLo, cols[i % cols.length], { p, s: [0.125, 0.125, 0.125] }));
    parts.push(part(sphereXs, '#ffb3bd', { p: [p[0] - 0.04, p[1] + 0.065, p[2] + 0.06], s: [0.03, 0.03, 0.02] }));   // a glint
  }
  return { geo: combine(parts), outlineGeo: null, thickness: 0 };
}

/** Mountain mint: a clump of two upright stems with opposite pairs of pointed bright leaves, a pale-mint bud on top. */
function mintGeo() {
  const parts = [];
  const stems = [[0, 0, 0.62, 0], [0.13, 0.05, 0.46, 0.5]];
  stems.forEach(([x, z, h, tw], si) => {
    parts.push(part(cyl(0.02, 0.03, h, 5), '#25b58a', { p: [x, h / 2, z] }));
    for (let t = 0; t < 4; t++) {
      const y = h * (0.28 + t * 0.2), len = (0.17 - t * 0.025) * (si ? 0.85 : 1);
      for (const sg of [0, 1]) {
        const a = tw + t * 0.9 + sg * Math.PI;
        parts.push(part(sphereXs, ['#4fe8b4', '#5ff2b8', '#7bf7cc', '#7bf7cc'][t], { p: [x + Math.cos(a) * len * 0.75, y, z + Math.sin(a) * len * 0.75], r: [0, -a, 0.5], s: [len * 1.1, 0.03, len * 0.6] }));
      }
    }
    parts.push(part(cone(0.045, 0.14, 5), '#a4ffe0', { p: [x, h + 0.05, z] }));
  });
  return { geo: combine(parts), outlineGeo: null, thickness: 0 };
}

/** Chanterelle trio: golden funnels on pale stalks (cone flared upward, a dimple and glint on top). */
function chanterelleGeo() {
  const parts = [];
  [[0, 0, 1], [0.24, 0.1, 0.66], [-0.2, -0.14, 0.52]].forEach(([x, z, k]) => {
    parts.push(part(cyl(0.05 * k, 0.07 * k, 0.2 * k, 6), '#ffd98a', { p: [x, 0.1 * k, z] }));
    parts.push(part(cone(0.2 * k, 0.17 * k, 8), '#f2a228', { p: [x, 0.27 * k, z], r: [Math.PI, 0, 0] }));
    parts.push(part(sphereLo, '#c97a14', { p: [x, 0.355 * k, z], s: [0.09 * k, 0.03 * k, 0.09 * k] }));
    parts.push(part(sphereXs, '#ffd98a', { p: [x - 0.08 * k, 0.34 * k, z + 0.07 * k], s: [0.05 * k, 0.02 * k, 0.04 * k] }));
  });
  return { geo: combine(parts), outlineGeo: null, thickness: 0 };
}

const BUILDERS = {
  spruce: () => spruceGeo(false), spruceSnow: () => spruceGeo(true), pine: () => pineGeo(false), pineSnow: () => pineGeo(true), birch: birchGeo,
  boulder: () => boulderGeo(false), boulderSnow: () => boulderGeo(true), spire: spireGeo, log: logGeo, reed: reedGeo,
  edelweiss: edelweissGeo, gentian: gentianGeo, tuft: tuftGeo,
  lingonBush: lingonBushGeo, lingonBerries: lingonBerriesGeo, mint: mintGeo, chanterelle: chanterelleGeo,
  snowman0: () => snowmanGeo(0), snowman1: () => snowmanGeo(1), snowman2: () => snowmanGeo(2),
};
const _assets = new Map();
/** Cached asset of a layer (built on first use, never disposed: shared by every visuals rebuild and every proxy). */
export function getAsset(layer) {
  let a = _assets.get(layer);
  if (!a) {
    if (!BUILDERS[layer]) throw new Error(`unknown frost asset: ${layer}`);
    a = BUILDERS[layer]();
    _assets.set(layer, a);
  }
  return a;
}

/** Where leaves / snow come out of a shaken tree (local space, before scale) and the height of its prompt bubble. */
export const TREE_INFO = {
  spruce: { crownY: 3.2, crownR: 1.3, promptY: 5.4 }, spruceSnow: { crownY: 3.2, crownR: 1.3, promptY: 5.4 },
  pine: { crownY: 3.4, crownR: 1.7, promptY: 4.8 }, pineSnow: { crownY: 3.4, crownR: 1.7, promptY: 4.8 },
  birch: { crownY: 4.0, crownR: 1.5, promptY: 5.0 },
};

// Far blobs: one cheap shape per tree, merged into a single mesh. y = centre height, sx / sy = size (scaled by the tree).
export const FAR_BLOB = {
  spruce: { make: () => new THREE.ConeGeometry(1, 1, 5, 1), color: '#2b7f62', y: 3.2, sx: 1.55, sy: 6.2 },
  spruceSnow: { make: () => new THREE.ConeGeometry(1, 1, 5, 1), color: '#dfe9f7', y: 3.2, sx: 1.55, sy: 6.2 },
  pine: { make: () => new THREE.ConeGeometry(1, 1, 6, 1), color: '#3f9150', y: 3.2, sx: 2.0, sy: 5.4 },
  pineSnow: { make: () => new THREE.ConeGeometry(1, 1, 6, 1), color: '#e6eefa', y: 3.2, sx: 2.0, sy: 5.4 },
  birch: { make: () => new THREE.IcosahedronGeometry(1, 0), color: '#b4d255', y: 4.2, sx: 1.7, sy: 1.4 },
};

const outlineOn = (mesh, outlineGeo, thickness) => {
  const tmp = new THREE.Mesh(outlineGeo);
  const o = addOutline(tmp, thickness);
  tmp.remove(o);
  mesh.add(o);
  return o;
};
/** A real Mesh of a layer's shape (vertex colours x `tint`) with its outline child: what an instanced tree / boulder turns into while it animates. */
export function makeProxyMesh(layer, tint = '#ffffff') {
  const a = getAsset(layer);
  const mesh = new THREE.Mesh(a.geo, toonMat(tint, { vertexColors: true }));
  mesh.name = `${layer}-proxy`;
  mesh.castShadow = true; mesh.receiveShadow = true;
  if (a.outlineGeo) outlineOn(mesh, a.outlineGeo, a.thickness);
  return mesh;
}
