// The Emberleaf garden's VISUALS that are not the hearth itself (PLAN Step 37a): the two signposts, the trail's bamboo torch posts and the bare site's dressing (cracked riser
// stones, weeds, a broken bamboo trellis). Built by emberVisuals.js (buildEmberVisuals) from the gameplay data of emberWorld.js and freely disposed / rebuilt
// (`__game.world.rebuild('ember')`); nothing with identity lives here (the signposts' interactables / colliders and the posts' / trellis colliders are registered once by emberWorld.js).
// The hearth, its basalt ring and the four seats are world/campfire.js (config FIRES 'ember'); the dark terrace soil and the trail are painted into the terrain colours
// (terrainMesh.js emberPainter, with emberGarden.js and world/paths.js), so the far island shows them without any of this.
//
//   const v = buildGardenVisuals(island, data) -> { group, update(t), dispose(), summary() }
//     signposts  the Group of every sign (data.signs) gets a wooden post + board(s) + a canvas-texture face (text, a flower / terrace icon and an arrow drawn on a canvas)
//     torches    bamboo torch posts along the trail: ONE merged vertex-coloured mesh (+ outline) and ONE Points glow (additive, no lights); the glow follows
//                frostCampVisuals' trailUniforms.uNight (fx/atmosphere.js feeds the day clock's nightness there), switched off (not drawn) by day
///     site       ONE merged mesh (+ outline): the stone edging, weeds and the trellis; no shadows/n//     plots      (Step 37b / 38b) the 16 garden plots: emberPlotVisuals.js (chunked instanced layers, per-flower blooms with a night glow, driven by the garden state through gardenView)
import * as THREE from 'three';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../../render/geo.js';
import { signModel, glowTexture, trailUniforms } from './frostCampVisuals.js';
import { buildPlotVisuals, gardenView } from './emberPlotVisuals.js';
import { buildGardenStages } from './emberGardenStageVisuals.js';
import { getIslandModule } from './registry.js';

// ---------------------------------------------------------------------------------------------
// Signposts (home's welcome sign, restyled for the garden: warm board, flower / terrace icons)
// ---------------------------------------------------------------------------------------------
function petalPath(cx, cy, r, n, pr) {                       // an SVG path of n round petals round (cx, cy)
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    d += `M${(x - pr).toFixed(2)} ${y.toFixed(2)}a${pr} ${pr} 0 1 0 ${2 * pr} 0a${pr} ${pr} 0 1 0 ${-2 * pr} 0z`;
  }
  return d;
}
const FLOWER_PATHS = [
  ['M12 14.2V22', null, '#2b2340', 1.8],
  ['M12 18.4c-3.4-.4-4.6-2.2-4.8-4 2.6-.2 4.2.8 4.8 4z', '#58c96b', '#2b2340', 1.1],
  [petalPath(12, 8, 4.1, 5, 3.1), '#ff8fb8', '#2b2340', 1.3],
  ['M12 5.4a2.6 2.6 0 1 0 .001 0z', '#ffd54a', '#2b2340', 1.1],
];
const TERRACE_PATHS = [
  ['M2.2 21.4h19.6v-4.4h-6.6v-4.4H8.8V8.2H2.2z', '#6b5560', '#2b2340', 2],
  ['M2.2 8.2h6.6M8.8 12.6h6.4M15.2 17h6.6', null, '#9a8290', 1.2],
  ['M5.6 8.2V5.6', null, '#2b2340', 1.5],
  [petalPath(5.6, 3.4, 1.7, 5, 1.2), '#ff8fb8', '#2b2340', 0.9],
];
const ANCHOR_PATHS = [
  ['M12 4.2v15.6', null, '#2b2340', 2.4],
  ['M4.6 13.2c.6 4.2 3.4 6.8 7.4 6.8s6.8-2.6 7.4-6.8', null, '#2b2340', 2.4],
  ['M8.2 7.6h7.6', null, '#2b2340', 2.2],
  ['M12 2.6a2 2 0 1 0 .001 0z', '#ffd54a', '#2b2340', 1.6],
];
function drawIcon(g, x, y, size, paths) {
  g.save();
  g.translate(x, y); g.scale(size / 24, size / 24);
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (const [d, fill, stroke, lw] of paths) {
    const p = new Path2D(d);
    if (fill) { g.fillStyle = fill; g.fill(p); }
    g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(p);
  }
  g.restore();
}
function drawArrowLeft(g, cx, cy) {
  g.save();
  g.translate(cx, cy); g.rotate(-Math.PI / 2);
  g.beginPath();
  g.moveTo(0, -46); g.lineTo(34, -6); g.lineTo(14, -6); g.lineTo(14, 42); g.lineTo(-14, 42); g.lineTo(-14, -6); g.lineTo(-34, -6); g.closePath();
  g.fillStyle = '#e0643c'; g.fill();
  g.lineWidth = 7; g.lineJoin = 'round'; g.strokeStyle = '#2b2340'; g.stroke();
  g.restore();
}

const _tex = {};
function signTexture(kind) {
  if (_tex[kind]) return _tex[kind];
  if (typeof document === 'undefined') return null;               // (Node tests build visuals without a DOM: a blank face)
  const c = document.createElement('canvas');
  c.width = 512; c.height = 176;
  const g = c.getContext('2d');
  g.textBaseline = 'middle';
  g.fillStyle = '#6b4226';
  g.textAlign = 'left';
  if (kind === 'garden-up') {                     // a flower + "Garden" (the board's own tip points up the trail)
    g.font = '800 98px "Baloo 2", "Fredoka", "Trebuchet MS", system-ui, sans-serif';
    drawIcon(g, 14, 22, 132, FLOWER_PATHS);
    g.fillText('Garden', 158, 94);
  } else if (kind === 'garden-here') {            // the terraces + "Garden"
    g.font = '800 98px "Baloo 2", "Fredoka", "Trebuchet MS", system-ui, sans-serif';
    drawIcon(g, 14, 22, 132, TERRACE_PATHS);
    g.fillText('Garden', 158, 94);
  } else if (kind === 'cove') {                   // an anchor + "Cove"
    g.font = '800 98px "Baloo 2", "Fredoka", "Trebuchet MS", system-ui, sans-serif';
    drawIcon(g, 14, 22, 132, ANCHOR_PATHS);
    g.fillText('Cove', 168, 94);
  } else {                                        // 'bridge-back': an arrow back + "Bridge"
    g.font = '800 96px "Baloo 2", "Fredoka", "Trebuchet MS", system-ui, sans-serif';
    drawArrowLeft(g, 70, 90);
    g.fillText('Bridge', 128, 94);
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
  const double = g.userData.kind === 'garden-here';
  const m = signModel(double);
  const mesh = new THREE.Mesh(m.geo, VERTEX_TOON);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.add(makeOutline(m.geo, 0.045, m.outlineGeo));
  const made = [mesh], mats = [];
  if (!_faceGeo) { _faceGeo = new THREE.PlaneGeometry(1.6, 0.55); _face2Geo = new THREE.PlaneGeometry(1.05, 0.36); }
  const mat = faceMat(g.userData.kind);
  mats.push(mat);
  const face = new THREE.Mesh(_faceGeo, mat);
  face.position.set(0.02, 1.5, 0.245);
  made.push(face);
  if (double) {
    const mat2 = faceMat('bridge-back');
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
// Bamboo torch posts + glow
// ---------------------------------------------------------------------------------------------
function buildTorches(posts) {
  if (!posts.length) return null;
  const parts = [], glowAt = [];
  for (const m of posts) {
    const gy = m.y;
    const lean = [Math.sin(m.s * 1.7) * 0.05, 0, Math.cos(m.s * 2.3) * 0.05];
    parts.push(part(G.cyl6, '#d2b25e', { p: [m.x, gy + 0.9, m.z], r: lean, s: [0.075, 1.8, 0.075] }));            // the bamboo pole
    for (const h of [0.45, 1.0, 1.5]) parts.push(part(G.cyl6, '#9c7c3a', { p: [m.x, gy + h, m.z], r: lean, s: [0.095, 0.05, 0.095] }));   // nodes
    parts.push(part(G.cyl6, '#7a5a2c', { p: [m.x, gy + 1.82, m.z], s: [0.17, 0.2, 0.17] }));                         // the open bamboo cup
    parts.push(part(G.cyl6, '#2b2028', { p: [m.x, gy + 1.93, m.z], s: [0.135, 0.03, 0.135] }));                      // its dark mouth
    parts.push(part(G.ico1, '#ff9a3c', { p: [m.x, gy + 1.98, m.z], s: [0.1, 0.075, 0.1] }));                         // the glowing coals
    parts.push(part(G.cone6, '#ffd070', { p: [m.x, gy + 2.1, m.z], s: [0.07, 0.17, 0.07] }));                        // a little flame
    glowAt.push([m.x, gy + 2.0, m.z]);
  }
  const geo = combine(parts);
  const mesh = new THREE.Mesh(geo, VERTEX_TOON);
  mesh.name = 'torch-posts';
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.add(makeOutline(geo, 0.03));
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(glowAt.flat(), 3));
  const mat = new THREE.PointsMaterial({
    // depthTest off, like the Frostpine lanterns: a point sprite is depth-tested at its CENTRE, which sits inside the flame
    map: glowTexture(), size: 2.9, sizeAttenuation: true, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false,
  });
  const glow = new THREE.Points(pg, mat);
  glow.name = 'torch-glow';
  glow.frustumCulled = false;
  glow.renderOrder = 3;
  glow.visible = false;
  return { mesh, geo, glow, pg, mat, count: posts.length };
}

// ---------------------------------------------------------------------------------------------
// The bare site: cracked riser stones, weeds, the broken trellis
// ---------------------------------------------------------------------------------------------
const STONE_COLS = ['#7b7284', '#6c6376', '#85808f'];
function buildSite(garden) {
  const parts = [];
  for (const s of garden.stones) {
    const col = STONE_COLS[s.shade];
    parts.push(part(G.ico1, col, { p: [s.x, s.y + s.hgt * 0.55, s.z], r: [0, s.rot, s.tilt], s: [s.len * 0.5, s.hgt * 0.7, s.wid * 0.5] }));
    if (s.len < 0.62) parts.push(part(G.ico1, STONE_COLS[(s.shade + 1) % 3], { p: [s.x + Math.cos(s.rot) * (s.len * 0.5 + 0.2), s.y + s.hgt * 0.3, s.z - Math.sin(s.rot) * (s.len * 0.5 + 0.2)], r: [0, s.rot + 0.5, -s.tilt], s: [s.len * 0.25, s.hgt * 0.5, s.wid * 0.4] }));   // the other half of a cracked stone
  }
  const WEED = ['#6c8a3a', '#7b9a45', '#5a7a32'];
  garden.weeds.forEach((w, i) => {
    for (let k = 0; k < 3; k++) {
      const a = w.rot + k * 2.1;
      parts.push(part(G.cone6, WEED[(i + k) % 3], { p: [w.x + Math.cos(a) * 0.07 * w.s, w.y + 0.17 * w.s, w.z + Math.sin(a) * 0.07 * w.s], r: [Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45], s: [0.045 * w.s, 0.36 * w.s, 0.045 * w.s] }));
    }
    parts.push(part(G.ico1, '#c9a35a', { p: [w.x, w.y + 0.36 * w.s, w.z], s: [0.04 * w.s, 0.04 * w.s, 0.04 * w.s] }));   // a dry seed head
  });
  const t = garden.trellis;
  const tx = -Math.sin(t.a), tz = Math.cos(t.a), yaw = Math.atan2(-tz, tx);
  const H = [1.95, 1.7, 0.85, 1.85, 1.15];                     // pole heights (one snapped off, one short)
  t.poleList.forEach((q, i) => {
    const h = H[i % H.length], lean = (i - 2) * 0.05;
    parts.push(part(G.cyl6, '#c9a85a', { p: [q.x + tx * lean * h * 0.5, q.y + h / 2, q.z + tz * lean * h * 0.5], r: [-tz * lean, 0, -tx * lean], s: [0.06, h, 0.06] }));
    parts.push(part(G.cyl6, '#8f7230', { p: [q.x, q.y + 0.4, q.z], s: [0.08, 0.05, 0.08] }));
    if (h < 1) parts.push(part(G.cyl6, '#b5944a', { p: [q.x + 0.26, q.y + 0.1, q.z + 0.06], r: [0, 0, 1.4], s: [0.05, 0.5, 0.05] }));                  // the broken-off top, lying beside it
  });
  const a = t.poleList[0], b = t.poleList[t.poleList.length - 1];
  const bar = (y, from, to, col) => {                         // a crossbar along the tangent between two fractions of the pole row (some missing)
    const x0 = a.x + (b.x - a.x) * from, z0 = a.z + (b.z - a.z) * from, x1 = a.x + (b.x - a.x) * to, z1 = a.z + (b.z - a.z) * to;
    parts.push(part(G.cyl6, col, { p: [(x0 + x1) / 2, a.y + y, (z0 + z1) / 2], r: [0, yaw, Math.PI / 2], s: [0.04, Math.hypot(x1 - x0, z1 - z0), 0.04] }));
  };
  bar(1.5, 0, 0.5, '#d2b25e');                           // (only the left half of the upper bar survived)
  bar(0.9, 0.25, 1.0, '#b5944a');
  const geo = combine(parts);
  const mesh = new THREE.Mesh(geo, VERTEX_TOON);
  mesh.name = 'garden-site';
  mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.add(makeOutline(geo, 0.03));
  return { mesh, geo, count: garden.stones.length };
}

// ---------------------------------------------------------------------------------------------
export function buildGardenVisuals(island, data) {   // (island: kept for symmetry with buildCampVisuals)
  const group = new THREE.Group(); group.name = 'ember-garden';
  const dressed = data.signs.map((g) => ({ g, ...dressSign(g) }));
  for (const g of data.signs) group.add(g);                     // (the Groups belong to the gameplay data; this visuals build only parents them)
  const torches = buildTorches(data.placement.posts);
  if (torches) group.add(torches.mesh, torches.glow);
  const site = buildSite(data.placement.garden);
  group.add(site.mesh);
  const stages = buildGardenStages(island, getIslandModule('ember')); group.add(stages.group);
  const plots = buildPlotVisuals(data.placement.garden.plots);        // Step 37b: the 16 plots (emberPlotVisuals.js); brought up to date from the garden state at once
  if (plots) { group.add(plots.group); gardenView.attach(plots); }
  return {
    group,
    update() {
      if (plots) plots.update();                          // Step 38b: the blooms open a little by day and fully at night
      if (!torches) return;
      const k = Math.min(1, Math.max(0, (trailUniforms.uNight.value - 0.08) * 1.25));
      torches.mat.opacity = 0.95 * k;
      torches.glow.visible = k > 0.01;
    },
    dispose() {
      for (const d of dressed) { for (const o of d.made) d.g.remove(o); for (const m of d.mats) m.dispose(); d.g.removeFromParent(); }
      if (torches) { torches.mesh.removeFromParent(); torches.glow.removeFromParent(); torches.geo.dispose(); torches.pg.dispose(); torches.mat.dispose(); }
      site.mesh.removeFromParent(); site.geo.dispose();
      if (plots) { gardenView.detach(plots); plots.dispose(); }
      stages.dispose();
      group.removeFromParent();
    },
    summary() { return { signs: dressed.length, torches: torches ? torches.count : 0, glowVisible: torches ? torches.glow.visible : false, stones: site.count, weeds: data.placement.garden.weeds.length, plots: plots ? plots.summary() : null, stages: stages.summary() }; },
  };
}
