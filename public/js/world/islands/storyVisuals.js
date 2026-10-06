// Storybook Cay's VISUALS (Step 48): the giant open pop-up book under its striped canvas awning, the book stand(s), the pop-up trees, the stacked-book
// shelves, the ribbon trail markers, the quill-feather tufts and the welcome sign. Built from the pure layout (storyLayout.js) + the gameplay data of storyWorld.js
// and freely disposed / rebuilt (`__game.world.rebuild('story')`); nothing with identity lives here (colliders + interactables are registered once by storyWorld.js).
//
//   const v = buildStoryVisuals(island, data) -> { group, far, update(t), dispose(), summary() }
//     solid   ONE merged vertex-coloured mesh + its outline hull (book, awning, lectern, trees, shelves, ribbon posts, the ink pond's quill): 2 draw calls, 4 with the shadow pass
//     tufts   ONE merged mesh of quill-feather grass tufts: no outline, no shadow casting (1 draw call)
//     glow    ONE additive Points sprite layer: the stand's page-edge glow and a few sparkles over the pop-ups (no lights; stronger at night: trailUniforms.uNight)
//     sign    the welcome sign Group(s) of the gameplay data get a wooden post, a board and a canvas face
//     far     a cheap far-away version (one merged blob mesh: awning, book and treetops; no shadows)
import * as THREE from 'three';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../../render/geo.js';
import { glowTexture, trailUniforms } from './frostCampVisuals.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const box = (color, p, s, r = [0, 0, 0]) => part(BOX, color, { p, s, r });
const CREAM = '#fff4dc', CREAM_DARK = '#ecd9ae', COVER = '#c2494f', GOLD = '#ffd85e', WOOD = '#9a6a44';

// ---------------------------------------------------------------------------------------------
// The giant open book + its pop-ups (all in world coordinates; the book faces the default camera, spine along Z)
// ---------------------------------------------------------------------------------------------
function bookParts(book) {
  const P = [];
  const { x, y, z, w, d } = book;
  const half = w / 2;                                                            // each page spread is `half` wide
  P.push(box(COVER, [x, y + 0.22, z], [w + 1.4, 0.44, d + 1.2]));               // the cover underneath
  for (const [dx, dz, sx, sz] of [[0, -1, w + 1.5, 0.22], [0, 1, w + 1.5, 0.22], [-1, 0, 0.22, d + 1.3], [1, 0, 0.22, d + 1.3]]) {
    P.push(box(GOLD, [x + dx * (w + 1.4) / 2, y + 0.46, z + dz * (d + 1.2) / 2], [sx, 0.1, sz]));       // gold trim round the rim
  }
  for (const side of [-1, 1]) {
    const cx = x + side * (half / 2 + 0.15);
    P.push(box(CREAM_DARK, [cx, y + 0.78, z], [half - 0.3, 0.6, d - 0.3], [0, 0, -side * 0.05]));          // the page block (tilts up towards the spine)
    P.push(box(CREAM, [cx, y + 1.12, z], [half - 0.7, 0.14, d - 0.8], [0, 0, -side * 0.05]));              // the top sheet
    for (let k = 0; k < 3; k++) P.push(box('#d9c590', [cx + side * 0.04, y + 0.62 + k * 0.1, z + d / 2 - 0.12], [half - 0.34, 0.025, 0.05], [0, 0, -side * 0.05]));   // page edges along the front
    for (let k = 0; k < 5; k++) {                                                                           // lines of "text" on the front half of the page
      const len = (half - 2.4) * (0.72 + 0.28 * ((k * 5) % 3) / 2);
      P.push(box('#b9a98a', [cx - side * 0.2 - (half - 2.4 - len) / 2 * side, y + 1.2, z + 2.8 + k * 0.78], [len, 0.02, 0.17], [0, 0, -side * 0.05]));
    }
  }
  P.push(part(G.cyl8, '#e3cf9b', { p: [x, y + 0.98, z], r: [Math.PI / 2, 0, 0], s: [0.5, d - 0.2, 0.5] }));   // the spine's gutter
  const py = y + 1.2;                                                                                       // pop-ups stand on the top sheets
  // ---- left page: a rolling hill, three cardboard trees, a rainbow
  P.push(part(G.sphere, '#8fe36b', { p: [x - 5.2, py, z - 2.0], s: [4.2, 2.1, 0.2] }));
  for (const [dx, dz, s, c] of [[-7.2, -3.4, 1.0, '#58c96b'], [-4.6, -4.4, 1.3, '#ff9fc6'], [-2.6, -3.0, 0.85, '#4fbf8a']]) {
    P.push(box(WOOD, [x + dx, py + 0.8 * s, z + dz], [0.34 * s, 1.6 * s, 0.14]));
    P.push(part(G.sphere, c, { p: [x + dx, py + 2.4 * s, z + dz], s: [1.3 * s, 1.5 * s, 0.17] }));
    P.push(box(CREAM_DARK, [x + dx, py + 0.04, z + dz + 0.7], [0.9 * s, 0.03, 1.3]));                        // the folded tab on the page
  }
  ['#ff7c6b', '#ffd85e', '#6cc8ff'].forEach((c, i) => {
    P.push(part(new THREE.TorusGeometry(3.4 - i * 0.52, 0.26, 5, 16, Math.PI), c, { p: [x - 5.8, py + 0.2, z - 5.6], s: [1, 1, 0.2] }));
  });
  // ---- right page: a cardboard castle with two towers, a flag, a door, and a smiling sun
  const cxk = x + 5.2, czk = z - 3.6;
  P.push(box('#d9d4ec', [cxk, py + 1.8, czk], [2.8, 3.6, 0.4]));                                              // keep
  P.push(box('#c4bede', [cxk, py + 0.7, czk + 0.22], [1.0, 1.4, 0.06]));                                      // door
  P.push(part(G.cyl8, '#8a7fb0', { p: [cxk, py + 0.45, czk + 0.26], r: [Math.PI / 2, 0, 0], s: [0.5, 0.06, 0.5] }));
  for (const sx of [-1, 1]) {
    P.push(part(G.cyl8, '#cfc9e6', { p: [cxk + sx * 2.5, py + 2.1, czk], s: [0.75, 4.2, 0.3] }));
    P.push(part(G.cone6, sx < 0 ? '#ff7c6b' : '#6cc8ff', { p: [cxk + sx * 2.5, py + 4.9, czk], s: [1.0, 1.5, 0.3] }));
    P.push(box('#fff6dc', [cxk + sx * 2.5, py + 3.2, czk + 0.3], [0.32, 0.5, 0.05]));                        // a window
  }
  P.push(box('#cfc9e6', [cxk, py + 1.1, czk + 0.1], [4.8, 1.8, 0.28]));                                       // the wall between the towers
  for (let i = -3; i <= 3; i++) P.push(box('#d9d4ec', [cxk + i * 0.78, py + 2.15, czk + 0.1], [0.4, 0.4, 0.28]));   // battlements
  P.push(box(WOOD, [cxk, py + 4.9, czk], [0.08, 2.0, 0.08]));                                                 // flag pole
  P.push(box('#ff93c6', [cxk + 0.46, py + 5.55, czk], [0.8, 0.5, 0.05]));
  P.push(part(G.sphere, GOLD, { p: [x + 2.4, py + 5.2, z - 5.8], s: [1.0, 1.0, 0.1] }));                      // the sun
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    P.push(part(G.cone6, '#ffb347', { p: [x + 2.4 + Math.cos(a) * 1.45, py + 5.2 + Math.sin(a) * 1.45, z - 5.8], r: [0, 0, a - Math.PI / 2], s: [0.22, 0.5, 0.06] }));
  }
  // ---- the ribbon bookmark: lies across the right page's front and hangs out over the edge, with a golden tassel
  P.push(box('#ff5d73', [x + 0.5, py + 0.02, z + 2.6], [0.5, 0.025, 4.6]));
  P.push(box('#ff5d73', [x + 0.5, y + 0.55, z + d / 2 + 0.5], [0.5, 1.0, 0.04], [0.3, 0, 0]));
  P.push(part(G.cone6, GOLD, { p: [x + 0.5, y + 0.1, z + d / 2 + 1.0], r: [Math.PI, 0, 0], s: [0.2, 0.5, 0.2] }));
  return P;
}

// ---------------------------------------------------------------------------------------------
// The canvas awning (striped, sloping towards the camera, with a scalloped valance)
// ---------------------------------------------------------------------------------------------
function awningParts(aw) {
  const P = [];
  for (const p of aw.posts) {
    P.push(part(G.cyl8, '#d8a85c', { p: [p.x, p.h / 2, p.z], s: [0.3, p.h, 0.3] }));
    P.push(part(G.cyl8, '#b9863e', { p: [p.x, 0.12, p.z], s: [0.5, 0.24, 0.5] }));
  }
  const hN = aw.posts[0].h, hS = aw.posts[2].h, y0 = aw.baseY;
  const depth = aw.z1 - aw.z0, slope = Math.atan2(hN - hS, depth), len = depth / Math.cos(slope);
  const n = 8, sw = (aw.x1 - aw.x0) / n, mid = (aw.z0 + aw.z1) / 2;
  for (let i = 0; i < n; i++) {
    const c = i % 2 ? '#ff8b7c' : CREAM;
    P.push(box(c, [aw.x0 + sw * (i + 0.5), y0 + (hN + hS) / 2 + 0.1, mid], [sw - 0.02, 0.16, len], [slope, 0, 0]));
    for (const [zz, hh] of [[aw.z1 + 0.05, hS], [aw.z0 - 0.05, hN]]) {                                    // scallops hang from the south and north edges
      P.push(part(G.sphere, c, { p: [aw.x0 + sw * (i + 0.5), y0 + hh - 0.25, zz], s: [sw * 0.52, 0.62, 0.1] }));
    }
  }
  P.push(box(GOLD, [(aw.x0 + aw.x1) / 2, y0 + hS + 0.25, aw.z1 + 0.12], [aw.x1 - aw.x0 + 0.3, 0.12, 0.12]));
  return P;
}

// ---------------------------------------------------------------------------------------------
// A book stand: a lectern with an open book on it
// ---------------------------------------------------------------------------------------------
function standParts(s) {
  const P = [];
  P.push(part(G.cyl8, WOOD, { p: [s.x, s.y + 0.55, s.z], s: [0.13, 1.1, 0.13] }));
  P.push(part(G.cyl8, '#7a4f2e', { p: [s.x, s.y + 0.08, s.z], s: [0.42, 0.16, 0.42] }));
  P.push(box('#b57a4e', [s.x, s.y + 1.18, s.z], [1.25, 0.1, 0.85], [-0.45, 0, 0]));                        // the slanted desk
  P.push(box('#b57a4e', [s.x, s.y + 1.0, s.z + 0.34], [1.25, 0.12, 0.08], [-0.45, 0, 0]));                 // the lip
  for (const side of [-1, 1]) {
    P.push(box(CREAM, [s.x + side * 0.31, s.y + 1.3, s.z - 0.02], [0.56, 0.05, 0.72], [-0.45, 0, side * 0.12]));
  }
  P.push(box(COVER, [s.x, s.y + 1.25, s.z - 0.03], [1.3, 0.04, 0.8], [-0.45, 0, 0]));
  P.push(box(s.page === 'woodcutters-way' ? '#6fe0a6' : '#ff5d73', [s.x + 0.05, s.y + 1.34, s.z + 0.1], [0.06, 0.02, 0.5], [-0.45, 0, 0]));            // the ribbon marker (a different colour per page)
  return P;
}

// ---------------------------------------------------------------------------------------------
// Trees, shelves, ribbon posts, the ink pond's quill
// ---------------------------------------------------------------------------------------------
function treeParts(t) {
  const P = [], s = t.s;
  P.push(part(G.cyl6, WOOD, { p: [t.x, t.y + 0.7 * s, t.z], s: [0.17 * s, 1.4 * s, 0.17 * s] }));
  if (t.kind === 'cone') {
    P.push(part(G.cone6, '#46b98a', { p: [t.x, t.y + 1.9 * s, t.z], s: [1.1 * s, 1.8 * s, 1.1 * s] }));
    P.push(part(G.cone6, '#3aa37a', { p: [t.x, t.y + 3.0 * s, t.z], s: [0.8 * s, 1.4 * s, 0.8 * s] }));
  } else {
    const [a, b] = t.kind === 'blossom' ? ['#ffb3d1', '#ffc9e0'] : ['#58c96b', '#74d983'];
    P.push(part(G.ico1, a, { p: [t.x, t.y + 2.1 * s, t.z], s: [1.15 * s, 1.0 * s, 1.15 * s] }));
    P.push(part(G.ico1, b, { p: [t.x + Math.cos(t.rot) * 0.55 * s, t.y + 2.65 * s, t.z + Math.sin(t.rot) * 0.55 * s], s: [0.7 * s, 0.6 * s, 0.7 * s] }));
  }
  return P;
}
function shelfParts(sh) {
  const P = [];
  for (const b of sh.books) {
    const rot = sh.rot + b.rot;
    const cx = sh.x + b.dx, cz = sh.z + b.dz;
    P.push(part(BOX, b.color, { p: [cx, sh.y + b.y + b.h / 2, cz], r: [0, rot, 0], s: [b.w, b.h, b.d] }));
    // a slightly longer cream band: the page edges show along the two long sides
    P.push(part(BOX, CREAM, { p: [cx, sh.y + b.y + b.h / 2, cz], r: [0, rot, 0], s: [b.w * 0.97, b.h * 0.62, b.d * 1.04] }));
  }
  return P;
}
function ribbonParts(r) {
  const P = [];
  P.push(part(G.cyl6, WOOD, { p: [r.x, r.y + 0.9, r.z], s: [0.065, 1.8, 0.065] }));
  P.push(part(G.sphere, GOLD, { p: [r.x, r.y + 1.86, r.z], s: [0.1, 0.1, 0.1] }));
  const cx = Math.cos(r.yaw), cz = Math.sin(r.yaw);
  P.push(part(BOX, r.color, { p: [r.x + 0.32 * cx, r.y + 1.62, r.z - 0.32 * cz], r: [0, r.yaw, 0.12], s: [0.7, 0.04, 0.2] }));
  P.push(part(BOX, r.color, { p: [r.x + 0.5 * cx, r.y + 1.46, r.z - 0.5 * cz], r: [0, r.yaw, -0.22], s: [0.55, 0.04, 0.16] }));
  return P;
}
function quillParts(ink) {
  const P = [], x = ink.x + ink.r + 0.2, z = ink.z + 0.8;
  P.push(part(G.cone6, '#f4ecd8', { p: [x, 1.4 + 1.0, z], r: [0.2, 0, -0.35], s: [0.07, 2.2, 0.07] }));
  P.push(part(G.cone6, '#ff93c6', { p: [x - 0.3, 1.4 + 1.9, z - 0.1], r: [0.2, 0, -0.35], s: [0.45, 1.8, 0.1] }));
  return P;
}

const TUFT_TONES = ['#fff4dc', '#ffd1e6', '#c9f0d8', '#e4d4ff'];
function tuftParts(list) {
  const P = [];
  for (const t of list) {
    for (let k = 0; k < 3; k++) {
      const a = t.rot + k * 2.1, lean = 0.18 + 0.1 * k;
      P.push(part(G.cone6, k === 1 ? '#7fd36a' : '#92e07a', { p: [t.x + Math.cos(a) * 0.06 * t.s, t.y + 0.34 * t.s, t.z + Math.sin(a) * 0.06 * t.s], r: [Math.sin(a) * lean, 0, -Math.cos(a) * lean], s: [0.05 * t.s, 0.75 * t.s, 0.03 * t.s] }));
    }
    P.push(part(G.cone6, TUFT_TONES[Math.floor(t.tone * TUFT_TONES.length)], { p: [t.x + Math.cos(t.rot) * 0.12 * t.s, t.y + 0.62 * t.s, t.z + Math.sin(t.rot) * 0.12 * t.s], r: [Math.sin(t.rot) * 0.3, t.rot, -Math.cos(t.rot) * 0.3], s: [0.12 * t.s, 0.52 * t.s, 0.03 * t.s] }));   // the feather vane
  }
  return P;
}

// ---------------------------------------------------------------------------------------------
// The welcome sign (a wooden post with a board; a canvas face)
// ---------------------------------------------------------------------------------------------
let _signGeo = null, _signTex = null;
function signGeo() {
  if (_signGeo) return _signGeo;
  const parts = [
    part(G.cyl8, '#b57a4e', { p: [0, 0.9, 0], s: [0.15, 1.8, 0.15] }),
    part(G.sphere, '#7c4f30', { p: [0, 1.85, 0], s: [0.2, 0.15, 0.2] }),
    box('#7c4f30', [0, 1.55, 0.1], [1.74, 0.82, 0.12]),
    box('#fff0cc', [0, 1.55, 0.17], [1.56, 0.64, 0.05]),
  ];
  _signGeo = combine(parts);                                                   // (cached for the session)
  return _signGeo;
}
function signTexture() {
  if (_signTex) return _signTex;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 208;
  const g = c.getContext('2d');
  g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = '#6b4226';
  g.font = '800 70px "Baloo 2", "Fredoka", "Trebuchet MS", system-ui, sans-serif';
  g.fillText('Storybook', 150, 70);
  g.fillText('Cay', 150, 142);
  g.save(); g.translate(26, 46); g.lineJoin = 'round'; g.lineWidth = 8; g.strokeStyle = '#2b2340';   // a little open book
  const left = new Path2D('M4 20 Q40 4 60 24 L60 108 Q40 88 4 104 Z'), right = new Path2D('M116 20 Q80 4 60 24 L60 108 Q80 88 116 104 Z');
  g.fillStyle = '#fff4dc'; g.fill(left); g.fill(right); g.stroke(left); g.stroke(right);
  g.fillStyle = '#ff7c6b'; g.fillRect(56, 18, 8, 70); g.restore();
  _signTex = new THREE.CanvasTexture(c);
  _signTex.colorSpace = THREE.SRGBColorSpace;
  _signTex.anisotropy = 4;
  return _signTex;
}
function dressSign(g) {
  const mesh = new THREE.Mesh(signGeo(), VERTEX_TOON);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const outline = makeOutline(signGeo(), 0.04);
  mesh.add(outline);
  const mat = new THREE.MeshToonMaterial({ map: signTexture(), transparent: true, gradientMap: VERTEX_TOON.gradientMap });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.56, 0.64), mat);
  face.position.set(0, 1.55, 0.2);
  g.add(mesh, face);
  return { made: [mesh, face], mat, faceGeo: face.geometry, hullGeo: outline.geometry };
}

// ---------------------------------------------------------------------------------------------
export function buildStoryVisuals(island, data) {
  const L = data.layout;
  const group = new THREE.Group(); group.name = 'story-props';

  // ---- the solid mesh (book, awning, stand, trees, shelves, ribbons, the ink quill)
  const awning = { ...L.awning, baseY: L.book.y };
  const parts = [
    ...bookParts(L.book), ...awningParts(awning), ...L.stands.flatMap(standParts), ...L.trees.flatMap(treeParts),
    ...L.shelves.flatMap(shelfParts), ...L.ribbons.flatMap(ribbonParts), ...quillParts(L.ink),
  ];
  const solidGeo = combine(parts);
  const solid = new THREE.Mesh(solidGeo, VERTEX_TOON);
  solid.name = 'story-solid'; solid.castShadow = true; solid.receiveShadow = true;
  const hull = makeOutline(solidGeo, 0.05);
  solid.add(hull);
  group.add(solid);

  // ---- the tufts
  const tuftGeo = combine(tuftParts(L.tufts));
  const tufts = new THREE.Mesh(tuftGeo, VERTEX_TOON);
  tufts.name = 'story-tufts'; tufts.castShadow = false; tufts.receiveShadow = true;
  group.add(tufts);

  // ---- glows (stand page edge + pop-up sparkles)
  const glowAt = [];
  for (const s of L.stands) glowAt.push([s.x, s.y + 1.75, s.z - 0.05]);
  const b = L.book, py = b.y + 1.2;
  glowAt.push([b.x - 5.8, py + 4.6, b.z - 5.0], [b.x + 5.2, py + 6.4, b.z - 3.6], [b.x + 2.4, py + 5.2, b.z - 5.2], [b.x - 7.0, py + 3.6, b.z - 3.2]);
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(glowAt.flat(), 3));
  const glowMat = new THREE.PointsMaterial({
    map: glowTexture(), size: 2.2, sizeAttenuation: true, transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending, opacity: 0.5, fog: false, color: '#fff2c4',
  });
  const glow = new THREE.Points(glowGeo, glowMat);
  glow.name = 'story-glow'; glow.frustumCulled = false; glow.renderOrder = 3;
  group.add(glow);

  // ---- the sign(s): the Groups belong to the gameplay data; this build only parents + dresses them
  const dressed = data.signs.map((g) => ({ g, ...dressSign(g) }));
  for (const g of data.signs) group.add(g);

  // ---- the far version: awning, book and tree-tops as chunky blobs
  const farParts = [
    box(COVER, [b.x, b.y + 0.6, b.z], [b.w + 1.4, 1.2, b.d + 1.2]),
    box('#ff8b7c', [(L.awning.x0 + L.awning.x1) / 2, b.y + 6.8, (L.awning.z0 + L.awning.z1) / 2], [L.awning.x1 - L.awning.x0, 0.5, L.awning.z1 - L.awning.z0]),
    ...L.trees.map((t) => part(G.ico1, t.kind === 'blossom' ? '#ffb3d1' : t.kind === 'cone' ? '#46b98a' : '#58c96b', { p: [t.x, t.y + 2.2 * t.s, t.z], s: [1.2 * t.s, 1.4 * t.s, 1.2 * t.s] })),
  ];
  const farGeo = combine(farParts);
  const far = new THREE.Mesh(farGeo, VERTEX_TOON);
  far.name = 'story-far'; far.castShadow = false; far.receiveShadow = false;

  return {
    group, far,
    update(t) {
      const k = Math.min(1, Math.max(0, (trailUniforms.uNight.value - 0.08) * 1.25));
      glowMat.opacity = (0.42 + 0.5 * k) * (0.82 + 0.18 * Math.sin(t * 2.2));
    },
    dispose() {
      for (const d of dressed) { for (const o of d.made) d.g.remove(o); d.mat.dispose(); d.faceGeo.dispose(); d.hullGeo.dispose(); d.g.removeFromParent(); }
      solid.removeFromParent(); solidGeo.dispose(); hull.geometry.dispose();
      tufts.removeFromParent(); tuftGeo.dispose();
      glow.removeFromParent(); glowGeo.dispose(); glowMat.dispose();
      far.removeFromParent(); farGeo.dispose();
      group.removeFromParent();
    },
    summary() { return { solidTris: Math.round(solidGeo.attributes.position.count / 3), tuftTris: Math.round(tuftGeo.attributes.position.count / 3), signs: dressed.length, glows: glowAt.length }; },
  };
}
