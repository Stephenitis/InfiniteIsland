// The Frostpine camp's VISUALS that are not the fire itself (PLAN Step 33b): the two signposts and the trail's lantern posts. Built by frostVisuals.js
// (buildFrostVisuals) from the gameplay data of frostWorld.js and freely disposed / rebuilt (`__game.world.rebuild('frost')`); nothing with identity lives here
// (the signposts' interactables / colliders and the posts' colliders are registered once by frostWorld.js; this only dresses them).
// The fire, its stone ring and the four stump seats are world/campfire.js (config FIRES 'frost'); the trampled-snow clearing and the trail are painted into
// the terrain colours (terrainMesh.js frostPainter, with world/paths.js).
//
//   const v = buildCampVisuals(island, data) -> { group, update(t), dispose(), summary() }
//     signposts  the Group of every sign (data.signs) gets a wooden post + board(s) + a canvas-texture face (text and an arrow / tent drawn on a canvas)
//     markers    wooden lantern posts along the trail: ONE merged vertex-coloured mesh (+ outline) and ONE Points glow (additive, no lights)
//   trailUniforms.uNight  fx/atmosphere.js feeds the day clock's nightness here: the lantern glow fades in at dusk and is switched off (not drawn) by day
import * as THREE from 'three';
import { G, VERTEX_TOON, part, combine, makeOutline, smoothOutlineGeo } from '../../render/geo.js';
import { pathsOf, pathMarkers } from '../paths.js';
import { getIslandModule } from './registry.js';

export const trailUniforms = { uNight: { value: 0 } };

// ---------------------------------------------------------------------------------------------
// Signposts (home's welcome sign, restyled: a pale-blue board)
// ---------------------------------------------------------------------------------------------
const _sign = {};
export function signModel(double) {
  const k = double ? 'double' : 'single';
  if (_sign[k]) return _sign[k];
  const wood = '#b57a4e', board = '#f2d8a8', dark = '#7c4f30';
  const parts = [];
  parts.push(part(G.cyl8, wood, { p: [0, 0.9, 0], s: [0.15, 1.9, 0.15] }));
  parts.push(part(G.ico1, dark, { p: [0, 1.93, 0], s: [0.2, 0.16, 0.2] }));
  const shape = new THREE.Shape();
  shape.moveTo(-0.95, -0.34); shape.lineTo(0.72, -0.34); shape.lineTo(1.12, 0); shape.lineTo(0.72, 0.34); shape.lineTo(-0.95, 0.34); shape.closePath();
  const bg = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.05, bevelSegments: 2, curveSegments: 4 });
  bg.translate(0, 0, -0.05);
  parts.push(part(bg, board, { p: [0.12, 1.5, 0.13] }));
  for (const [x, y] of [[-0.75, 1.68], [-0.75, 1.32], [0.72, 1.5]]) parts.push(part(G.sphereLo, dark, { p: [x, y, 0.24], s: [0.05, 0.05, 0.05] }));
  let bg2 = null;
  if (double) {
    const s2 = new THREE.Shape();
    s2.moveTo(0.6, -0.2); s2.lineTo(-0.35, -0.2); s2.lineTo(-0.7, 0); s2.lineTo(-0.35, 0.2); s2.lineTo(0.6, 0.2); s2.closePath();
    bg2 = new THREE.ExtrudeGeometry(s2, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.04, bevelSegments: 2, curveSegments: 4 });
    bg2.translate(0, 0, -0.04);
    parts.push(part(bg2, '#e3a86a', { p: [-0.15, 0.95, 0.13], r: [0, 0, -0.06] }));
  }
  const geo = combine(parts);
  bg.dispose(); if (bg2) bg2.dispose();
  _sign[k] = { geo, outlineGeo: smoothOutlineGeo(geo) };           // cached for the session, never disposed
  return _sign[k];
}

const TENT_PATHS = [
  ['M12 6.4V2.4', null, '#2b2340', 1.8],
  ['M12 2.6l4 1.4-4 1.4z', '#ffd54a', '#2b2340', 1.3],
  ['M2.2 20.4 12 6l9.8 14.4z', '#ff7a5c', '#2b2340', 2],
  ['M12 20.4H8.6L12 11.2l3.4 9.2z', '#3a2f55', '#2b2340', 1.2],
  ['M12 20.4c-1.7 0-2.5-1.1-2.5-2.1 0-1.3 1.2-1.8 1.5-3.2.9.6 1 1.3 1 1.8.4-.3.6-.7.6-1.2.9.8 1.9 1.5 1.9 2.6 0 1.1-.9 2.1-2.5 2.1z', '#ffb23c', '#2b2340', 1],
];

function drawArrow(g, cx, cy, down) {
  g.save();
  g.translate(cx, cy);
  if (down) g.rotate(Math.PI);
  g.beginPath();
  g.moveTo(0, -62); g.lineTo(46, -8); g.lineTo(19, -8); g.lineTo(19, 58); g.lineTo(-19, 58); g.lineTo(-19, -8); g.lineTo(-46, -8); g.closePath();
  g.fillStyle = '#e0643c'; g.fill();
  g.lineWidth = 8; g.lineJoin = 'round'; g.strokeStyle = '#2b2340'; g.stroke();
  g.restore();
}

function drawTent(g, x, y, size) {
  g.save();
  g.translate(x, y); g.scale(size / 24, size / 24);
  g.lineJoin = 'round';
  for (const [d, fill, stroke, lw] of TENT_PATHS) {
    const p = new Path2D(d);
    if (fill) { g.fillStyle = fill; g.fill(p); }
    g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(p);
  }
  g.restore();
}

const _tex = {};
function signTexture(kind) {
  if (_tex[kind]) return _tex[kind];
  const c = document.createElement('canvas');
  c.width = 512; c.height = 176;
  const g = c.getContext('2d');
  g.textBaseline = 'middle';
  g.font = '800 104px "Baloo 2", "Fredoka", "Trebuchet MS", system-ui, sans-serif';
  g.fillStyle = '#6b4226';
  if (kind === 'camp-up') {                       // "Camp" + an arrow up the trail
    g.textAlign = 'left'; g.fillText('Camp', 30, 94);
    drawArrow(g, 426, 88, false);
  } else if (kind === 'camp-here') {               // a tent with a flame + "Camp"
    drawTent(g, 22, 22, 132);
    g.textAlign = 'left'; g.fillText('Camp', 172, 94);
  } else {                                         // 'bridge-down'
    g.font = '800 96px "Baloo 2", "Fredoka", "Trebuchet MS", system-ui, sans-serif';
    g.textAlign = 'left'; g.fillText('Bridge', 22, 94);
    drawArrow(g, 442, 88, true);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  _tex[kind] = tex;
  return tex;
}
let _faceGeo = null, _face2Geo = null;
const faceMat = (kind) => new THREE.MeshToonMaterial({ map: signTexture(kind), transparent: true, gradientMap: VERTEX_TOON.gradientMap });

/** Dress one sign Group (data.signs[i]): returns the per-build objects to throw away later. */
function dressSign(g) {
  const kind = g.userData.kind;
  const double = kind === 'camp-here';
  const m = signModel(double);
  const mesh = new THREE.Mesh(m.geo, VERTEX_TOON);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.add(makeOutline(m.geo, 0.045, m.outlineGeo));
  const made = [mesh];
  const mats = [];
  if (!_faceGeo) { _faceGeo = new THREE.PlaneGeometry(1.6, 0.55); _face2Geo = new THREE.PlaneGeometry(1.05, 0.36); }
  const mat = faceMat(kind === 'camp-up' ? 'camp-up' : 'camp-here');
  mats.push(mat);
  const face = new THREE.Mesh(_faceGeo, mat);
  face.position.set(0.02, 1.5, 0.245);
  made.push(face);
  if (double) {
    const mat2 = faceMat('bridge-down');
    mats.push(mat2);
    const face2 = new THREE.Mesh(_face2Geo, mat2);
    face2.position.set(-0.15, 0.95, 0.215);
    face2.rotation.z = -0.06;
    made.push(face2);
  }
  for (const o of made) g.add(o);
  return { made, mats };
}

// ---------------------------------------------------------------------------------------------
// Lantern posts + glow
// ---------------------------------------------------------------------------------------------
let _glowTex = null;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  if (typeof document === 'undefined') return null;               // (Node tests build visuals without a DOM)
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,236,170,1)');
  grad.addColorStop(0.3, 'rgba(255,190,90,0.6)');
  grad.addColorStop(1, 'rgba(255,150,50,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}

function buildMarkers(island, mod) {
  const posts = [];
  for (const p of pathsOf(island.id)) posts.push(...pathMarkers(island, p));
  if (!posts.length) return null;
  const parts = [], glowAt = [];
  for (const m of posts) {
    const gy = mod.height(m.x, m.z);
    const yaw = -Math.atan2(m.tz, m.tx);
    parts.push(part(G.cyl6, '#8a5a34', { p: [m.x, gy + 0.62, m.z], s: [0.085, 1.3, 0.085] }));
    parts.push(part(G.ico1, '#6b4429', { p: [m.x, gy + 1.3, m.z], s: [0.13, 0.1, 0.13] }));
    const lx = m.x + m.tx * 0.36, lz = m.z + m.tz * 0.36;
    parts.push(part(G.cyl6, '#7a4f30', { p: [m.x + m.tx * 0.18, gy + 1.2, m.z + m.tz * 0.18], r: [0, yaw, Math.PI / 2], s: [0.03, 0.4, 0.03] }));     // arm over the trail
    parts.push(part(G.cyl6, '#2b2340', { p: [lx, gy + 1.1, lz], s: [0.012, 0.16, 0.012] }));                                                            // chain
    parts.push(part(G.cyl6, '#4a3226', { p: [lx, gy + 0.9, lz], s: [0.16, 0.04, 0.16] }));                                                              // base
    parts.push(part(G.cyl6, '#ffd27a', { p: [lx, gy + 1.0, lz], s: [0.13, 0.2, 0.13] }));                                                               // the lit glass
    parts.push(part(G.cone6, '#5b3a2a', { p: [lx, gy + 1.17, lz], s: [0.19, 0.12, 0.19] }));                                                            // cap
    glowAt.push([lx, gy + 1.0, lz]);
  }
  const geo = combine(parts);
  const mesh = new THREE.Mesh(geo, VERTEX_TOON);
  mesh.name = 'trail-posts';
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.add(makeOutline(geo, 0.03));
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(glowAt.flat(), 3));
  const mat = new THREE.PointsMaterial({
    // depthTest off: a point sprite is depth-tested at its CENTRE, which sits inside the lantern glass, so the halo would never show otherwise
    map: glowTexture(), size: 2.4, sizeAttenuation: true, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false,
  });
  const glow = new THREE.Points(pg, mat);
  glow.name = 'trail-glow';
  glow.frustumCulled = false;
  glow.renderOrder = 3;
  glow.visible = false;
  return { mesh, geo, glow, pg, mat, count: posts.length };
}

// ---------------------------------------------------------------------------------------------
export function buildCampVisuals(island, data) {
  const mod = getIslandModule(island.id);
  const group = new THREE.Group(); group.name = 'frost-camp';
  const dressed = data.signs.map((g) => ({ g, ...dressSign(g) }));
  for (const g of data.signs) group.add(g);                    // (the Groups belong to the gameplay data; this visuals build only parents them)
  const markers = buildMarkers(island, mod);
  if (markers) { group.add(markers.mesh, markers.glow); }
  return {
    group,
    update() {
      if (!markers) return;
      const k = Math.min(1, Math.max(0, (trailUniforms.uNight.value - 0.08) * 1.25));
      markers.mat.opacity = 0.95 * k;
      markers.glow.visible = k > 0.01;
    },
    dispose() {
      for (const d of dressed) { for (const o of d.made) d.g.remove(o); for (const m of d.mats) m.dispose(); d.g.removeFromParent(); }
      if (markers) { markers.mesh.removeFromParent(); markers.glow.removeFromParent(); markers.geo.dispose(); markers.pg.dispose(); markers.mat.dispose(); }
      group.removeFromParent();
    },
    summary() { return { signs: dressed.length, lanterns: markers ? markers.count : 0, glowVisible: markers ? markers.glow.visible : false }; },
  };
}
