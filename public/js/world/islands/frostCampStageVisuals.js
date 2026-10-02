// The Frostpine camp's three build stages, VISUALS (PLAN Step 35b). Layout = islands/frostCampStages.js (pure, tested); the controller that registers colliders, plays the
// effects and listens to the camp's comfort is world/campStages.js; this builds and animates the merged meshes. Built by frostCampVisuals.js (buildCampVisuals) as part of
// Frostpine's visuals, so `world.rebuild('frost')` rebuilds it at the current comfort (no colliders / interactables live here).
//
//   const s = buildCampStages(island, mod, { night: () => 0..1 }) -> { group, setComfort(n, { live }), update(dt), dispose(), summary() }
//   campStageRuntime      the controller <-> visuals hand-over (singleton, survives rebuilds): { comfort, fx, benches, stages }
//     .comfort            the comfort level to show right after a (re)build
//     .fx                 { land(pivot, k, total, kind), done(stage) } the thunk + dust, the critters' cheer (campStages.js)
//     .benches            { preview() -> per-seat geometries (world space), begin() (swap to logs, hidden), end() (show them), snap(on) (logs / stumps at once) }: stage 1's benches pop in with the other pieces
//     .stages             the CURRENT stages object (null while no Frostpine visuals are built)
//   setComfort(n, { live }): live && n === shown + 1 plays the build moment (pieces drop in one after another with squash and stretch, like the bridge segments); anything else
//   just shows stages 1..n (and hides the rest) at once. Returns true when it animates.
//
// Draw calls: ONE merged solid + ONE outline hull per stage (<= 6), the crystal glows are ONE Points (additive, no lights, faded in by the day clock's nightness);
// a stage that animates also has a temporary mesh + hull per piece until it settles. Each stage is a merged geometry of its pieces (the same geometry the pop-in uses).
//   stage 1: curved windbreak (3 rows of logs + 2 end posts) on the north side, 4 log benches (replace the stumps), woodpile
//   stage 2: 8 straw-and-pine-bough dens (one per den spot, shown even before its critter moves in), 4 lantern posts with crystal lanterns, a feeding trough, 2 strings of bunting
//   stage 3: the A-frame grove shelter (frame, roof with snow, 4 crystal lanterns), 4 edelweiss flower boxes, 8 young pines
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../../render/geo.js';
import { createPopper } from '../popIn.js';
import { campStageLayout, SHELTER, POST_H } from './frostCampStages.js';

export const campStageRuntime = { comfort: 0, fx: null, benches: null, stages: null };

const BOX = new THREE.BoxGeometry(1, 1, 1);
const OCT = new THREE.OctahedronGeometry(1, 0);
const FACET_CONE = (() => { const g = new THREE.ConeGeometry(1, 1, 7, 1).toNonIndexed(); g.computeVertexNormals(); return g; })();
const FLAG = (() => {
  const sh = new THREE.Shape(); sh.moveTo(-0.15, 0); sh.lineTo(0.15, 0); sh.lineTo(0, -0.36); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false }); g.translate(0, 0, -0.015); return g;
})();
const _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _d = new THREE.Vector3();
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const SNOW = '#f6f9ff';
const BARK = ['#a8703f', '#b97d48', '#9b6a40'];
const FLAG_COLORS = ['#ff7a5c', '#ffd54a', '#5cc8ff', '#7be06b', '#ff9fb0', '#b48cff'];
const CRYSTAL = '#8fe4ff';
const GLOW_TINT = new THREE.Color('#9fe6ff');

/** A cylinder / cone (unit height along +Y) laid from point a to point b with radius `rad`. */
function between(geo, color, a, b, rad) {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _d.length() || 1e-4;
  _q.setFromUnitVectors(_up, _d.normalize());
  _e.setFromQuaternion(_q, 'XYZ');
  return part(geo, color, { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], r: [_e.x, _e.y, _e.z], s: [rad, len, rad] });
}
/** Local (lx, lz) of a piece at {x, z, yaw} -> world [x, z] (rotation about Y by yaw: local +Z points (sin yaw, cos yaw), local +X (cos yaw, -sin yaw)). */
const loc = (o, lx, lz) => [o.x + lx * Math.cos(o.yaw) + lz * Math.sin(o.yaw), o.z - lx * Math.sin(o.yaw) + lz * Math.cos(o.yaw)];
const box = (color, p, s, r = [0, 0, 0]) => part(BOX, color, { p, s, r });

let _glowTex = null;
function crystalGlow() {
  if (_glowTex || typeof document === 'undefined') return _glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.28, 'rgba(255,255,255,0.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(c); _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}

/** A crystal lantern: open frame so the crystal shows. Hung with its centre at (x, y, z); returns the glow point. */
function lantern(P, x, y, z) {
  P.push(part(G.cone6, '#5b3a2a', { p: [x, y + 0.3, z], s: [0.24, 0.15, 0.24] }));
  P.push(part(G.cyl6, '#4a3226', { p: [x, y - 0.22, z], s: [0.21, 0.05, 0.21] }));
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.push(part(G.cyl6, '#6a4a38', { p: [x + dx * 0.13, y + 0.03, z + dz * 0.13], s: [0.022, 0.5, 0.022] }));
  P.push(part(OCT, CRYSTAL, { p: [x, y, z], s: [0.14, 0.24, 0.14] }));
  P.push(part(OCT, '#e8fbff', { p: [x, y, z], s: [0.07, 0.14, 0.07] }));
  P.push(part(G.ico1, '#4a3226', { p: [x, y + 0.36, z], s: [0.04, 0.04, 0.04] }));
  return [x, y + 0.03, z + 0.24];
}

// ------------------------------------------------------------------------------------------------ stage 1
function stage1Pieces(L, H) {
  const out = [];
  const wb = L.stage1.windbreak;
  const cols = [[], [], []];
  wb.logs.forEach((l, i) => {
    const gy = H(l.x, l.z), y = gy + 0.26 + l.row * 0.44;
    const dx = Math.cos(l.yaw) * l.len / 2, dz = -Math.sin(l.yaw) * l.len / 2;
    const a = [l.x - dx, y, l.z - dz], b = [l.x + dx, y, l.z + dz];
    const P = cols[l.col];
    P.push(between(G.cyl8, BARK[(i + l.row) % 3], a, b, 0.26));
    P.push(between(G.cyl8, '#8a5a34', [a[0], y + 0.11, a[2]], [b[0], y + 0.11, b[2]], 0.15));
    const ux = dx / (l.len / 2), uz = dz / (l.len / 2);
    for (const [e, sg] of [[a, -1], [b, 1]]) P.push(between(G.cyl8, '#f2cf96', [e[0] - ux * sg * 0.01, y, e[2] - uz * sg * 0.01], [e[0] + ux * sg * 0.02, y, e[2] + uz * sg * 0.02], 0.25));
    if (l.row === 2) P.push(part(G.ico1, SNOW, { p: [l.x, y + 0.24, l.z], r: [0, l.yaw, 0], s: [l.len * 0.42, 0.09, 0.2] }));
  });
  for (const p of wb.posts) {
    const gy = H(p.x, p.z);
    cols[p.col].push(part(G.cyl8, '#8a5a34', { p: [p.x, gy + p.h / 2, p.z], s: [0.17, p.h, 0.17] }));
    cols[p.col].push(part(G.cone6, '#6b4429', { p: [p.x, gy + p.h + 0.08, p.z], s: [0.22, 0.2, 0.22] }));
    cols[p.col].push(part(G.ico1, SNOW, { p: [p.x, gy + p.h + 0.17, p.z], s: [0.14, 0.07, 0.14] }));
    cols[p.col].push(part(G.cyl6, '#e0c48f', { p: [p.x, gy + 0.9, p.z], s: [0.2, 0.05, 0.2] }));             // a rope lashing round the post
  }
  for (const P of cols) out.push({ key: 'windbreak', geo: combine(P), kind: 'wood' });

  const w = L.stage1.woodpile, P = [], gy = H(w.x, w.z);
  const rows = [[3, 0.15], [2, 0.15 + 0.29], [1, 0.15 + 0.58]];
  rows.forEach(([n, y], ri) => {
    for (let k = 0; k < n; k++) {
      const lz = (k - (n - 1) / 2) * 0.34, a = loc(w, -0.65, lz), b = loc(w, 0.65, lz);
      P.push(between(G.cyl8, BARK[(ri + k) % 3], [a[0], gy + y, a[1]], [b[0], gy + y, b[1]], 0.16));
      const ux = (b[0] - a[0]) / 1.3, uz = (b[1] - a[1]) / 1.3;
      for (const [e, sg] of [[a, -1], [b, 1]]) P.push(between(G.cyl8, '#f2cf96', [e[0] - ux * sg * 0.01, gy + y, e[1] - uz * sg * 0.01], [e[0] + ux * sg * 0.02, gy + y, e[1] + uz * sg * 0.02], 0.155));
    }
  });
  P.push(part(G.ico1, SNOW, { p: [w.x, gy + 0.15 + 0.58 + 0.13, w.z], r: [0, w.yaw, 0], s: [0.55, 0.07, 0.14] }));
  const s1 = loc(w, 0.2, 0.85);
  P.push(between(G.cyl8, '#b97d48', [s1[0] - 0.3, gy + 0.1, s1[1]], [s1[0] + 0.3, gy + 0.1, s1[1] + 0.1], 0.1));
  out.push({ key: 'woodpile', geo: combine(P), kind: 'wood' });

  return out;
}

// ------------------------------------------------------------------------------------------------ stage 2
function denPiece(d, i, H) {
  const P = [], gy = H(d.x, d.z);
  const o = { x: d.x, z: d.z, yaw: d.yaw };
  P.push(part(G.ico1, '#e2bd58', { p: [d.x, gy + 0.07, d.z], r: [0, d.yaw, 0], s: [0.76, 0.12, 0.72] }));
  const c = loc(o, 0, 0.06);
  P.push(part(G.ico1, '#f0d27a', { p: [c[0], gy + 0.13, c[1]], r: [0, d.yaw, 0], s: [0.5, 0.08, 0.46] }));
  for (let k = 0; k < 8; k++) {                                 // loose stalks of straw round the rim
    const a = k * 0.82 + i, r = 0.66 + 0.06 * Math.sin(k * 2.3);
    const x = d.x + Math.cos(a) * r, z = d.z + Math.sin(a) * r, tx = -Math.sin(a) * 0.2, tz = Math.cos(a) * 0.2;
    P.push(between(G.cyl6, k % 2 ? '#f4dc86' : '#d9ac4a', [x - tx, gy + 0.08, z - tz], [x + tx, gy + 0.14, z + tz], 0.02));
  }
  const greens = ['#2f7a52', '#3a8d5e', '#2b7e60', '#46a06c'];
  for (let k = 0; k < 5; k++) {                                 // pine boughs leaning over the back (away from the fire)
    const ang = -0.95 + k * 0.475, r0 = 0.62 + 0.05 * (k % 2);
    const b0 = loc(o, Math.sin(ang) * r0, -Math.cos(ang) * r0), b1 = loc(o, Math.sin(ang) * 0.2, -Math.cos(ang) * 0.2);
    P.push(between(FACET_CONE, greens[(k + i) % 4], [b0[0], gy + 0.02, b0[1]], [b1[0], gy + 0.7 + 0.1 * (k % 2), b1[1]], 0.27));
  }
  const sn = loc(o, 0, -0.34);
  P.push(part(G.ico1, SNOW, { p: [sn[0], gy + 0.8, sn[1]], r: [0, d.yaw, 0], s: [0.32, 0.07, 0.24] }));       // a dusting of snow on the boughs
  const pc = loc(o, 0.45, 0.42);
  P.push(part(G.ico1, '#7a5236', { p: [pc[0], gy + 0.1, pc[1]], r: [0.4, d.yaw, 0.3], s: [0.07, 0.1, 0.07] }));
  return { key: 'den', geo: combine(P), kind: 'den' };
}

function postPiece(p, H) {
  const P = [], gy = H(p.x, p.z), dx = Math.sin(p.yaw), dz = Math.cos(p.yaw);
  P.push(part(G.cyl6, '#8a5a34', { p: [p.x, gy + p.h / 2, p.z], s: [0.09, p.h, 0.09] }));
  P.push(part(G.ico1, '#b9b4cc', { p: [p.x, gy + 0.1, p.z], s: [0.22, 0.14, 0.22] }));
  P.push(part(G.ico1, '#6b4429', { p: [p.x, gy + p.h + 0.02, p.z], s: [0.14, 0.11, 0.14] }));
  const ax = p.x + dx * 0.46, az = p.z + dz * 0.46;
  P.push(between(G.cyl6, '#7a4f30', [p.x, gy + 2.42, p.z], [ax, gy + 2.42, az], 0.03));
  P.push(between(G.cyl6, '#2b2340', [ax, gy + 2.4, az], [ax, gy + 2.24, az], 0.011));
  const glow = lantern(P, ax, gy + 2.0, az);
  return { key: 'post', geo: combine(P), kind: 'post', glow };
}

function troughPiece(t, H) {
  const P = [], gy = H(t.x, t.z);
  const o = { x: t.x, z: t.z, yaw: t.yaw };
  const at = (lx, lz) => loc(o, lx, lz);
  for (const [lx, lz] of [[-0.62, -0.2], [0.62, -0.2], [-0.62, 0.2], [0.62, 0.2]]) { const q = at(lx, lz); P.push(part(G.cyl6, '#7a4f30', { p: [q[0], gy + 0.17, q[1]], s: [0.06, 0.34, 0.06] })); }
  P.push(box('#9a6a44', [t.x, gy + 0.36, t.z], [1.55, 0.08, 0.62], [0, t.yaw, 0]));
  for (const sz of [-0.3, 0.3]) { const q = at(0, sz); P.push(box('#b57a4e', [q[0], gy + 0.5, q[1]], [1.6, 0.24, 0.07], [0, t.yaw, 0])); }
  for (const sx of [-0.78, 0.78]) { const q = at(sx, 0); P.push(box('#a8703f', [q[0], gy + 0.5, q[1]], [0.07, 0.24, 0.66], [0, t.yaw, 0])); }
  P.push(part(G.ico1, '#e8c860', { p: [t.x, gy + 0.5, t.z], r: [0, t.yaw, 0], s: [0.7, 0.13, 0.23] }));
  const bs = [[-0.4, 0.05], [-0.1, -0.08], [0.2, 0.08], [0.45, -0.02]];
  bs.forEach(([lx, lz], k) => { const q = at(lx, lz); P.push(part(G.sphereLo, k % 2 ? '#d1384d' : '#e0526a', { p: [q[0], gy + 0.62, q[1]], s: [0.07, 0.07, 0.07] })); });
  const pc = at(-0.15, 0.12); P.push(part(G.ico1, '#7a5236', { p: [pc[0], gy + 0.62, pc[1]], r: [0.4, 0.5, 0.2], s: [0.09, 0.12, 0.09] }));
  const m = at(0.62, 0.1); P.push(part(G.ico1, '#4aa86a', { p: [m[0], gy + 0.6, m[1]], s: [0.12, 0.05, 0.1] }));
  return { key: 'trough', geo: combine(P), kind: 'trough' };
}

function buntingPiece(a, b, H, seed) {
  const ya = H(a.x, a.z) + 2.5, yb = H(b.x, b.z) + 2.5;
  const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), yaw = -Math.atan2(dz, dx);
  const sag = Math.min(0.9, 0.05 * L + 0.2);
  const at = (t) => [a.x + dx * t, ya + (yb - ya) * t - sag * 4 * t * (1 - t), a.z + dz * t];
  const P = [];
  const N = Math.max(6, Math.round(L / 1.2));
  for (let i = 0; i < N; i++) P.push(between(G.cyl6, '#e0c48f', at(i / N), at((i + 1) / N), 0.022));
  const F = Math.max(4, Math.floor(L / 0.9));
  for (let i = 0; i < F; i++) {
    const t = (i + 0.5) / F, p = at(t);
    P.push(part(FLAG, FLAG_COLORS[(i + seed) % FLAG_COLORS.length], { p: [p[0], p[1] - 0.02, p[2]], r: [0, yaw, 0] }));
  }
  return { key: 'bunting', geo: combine(P), kind: 'bunting' };
}

function stage2Pieces(L, H) {
  const out = [];
  L.stage2.dens.forEach((d, i) => out.push(denPiece(d, i, H)));
  for (const p of L.stage2.posts) out.push(postPiece(p, H));
  out.push(troughPiece(L.stage2.trough, H));
  L.stage2.bunting.forEach((b, i) => out.push(buntingPiece(L.stage2.posts[b.a], L.stage2.posts[b.b], H, i * 2)));
  return out;
}

// ------------------------------------------------------------------------------------------------ stage 3
function shelterFrame(s, H) {
  const P = [], gy = H(s.x, s.z), { hw, hl, ridge, postH } = s;
  for (const p of s.posts) {
    const g0 = H(p.x, p.z);
    P.push(part(G.cyl8, '#8a5a34', { p: [p.x, g0 + postH / 2, p.z], s: [0.13, postH, 0.13] }));
    P.push(part(G.ico1, '#b9b4cc', { p: [p.x, g0 + 0.12, p.z], s: [0.3, 0.17, 0.3] }));
    P.push(part(G.cyl6, '#e0c48f', { p: [p.x, g0 + 0.95, p.z], s: [0.17, 0.05, 0.17] }));
  }
  for (const sz of [-hl, hl]) P.push(box('#7a4f30', [s.x, gy + postH - 0.1, s.z + sz], [2 * hw + 0.3, 0.16, 0.2]));
  for (const sx of [-hw, hw]) P.push(box('#7a4f30', [s.x + sx, gy + postH - 0.1, s.z], [0.2, 0.16, 2 * hl + 0.2]));
  P.push(between(G.cyl8, '#6b4429', [s.x, gy + ridge - 0.12, s.z - hl - 0.4], [s.x, gy + ridge - 0.12, s.z + hl + 0.4], 0.1));
  for (const sz of [-hl, hl]) P.push(box('#7a4f30', [s.x, gy + postH + 0.62, s.z + sz], [0.14, 1.2, 0.14]));       // king posts up to the ridge
  const tri = new THREE.Shape(); tri.moveTo(-hw, 0); tri.lineTo(hw, 0); tri.lineTo(0, ridge - postH - 0.12); tri.closePath();
  const gab = new THREE.ExtrudeGeometry(tri, { depth: 0.1, bevelEnabled: false }); gab.translate(0, 0, -0.05);
  P.push(part(gab, '#c98a54', { p: [s.x, gy + postH - 0.04, s.z - hl] }));
  gab.dispose();
  for (const bx of [-0.9, -0.3, 0.3, 0.9]) P.push(box('#a8703f', [s.x + bx, gy + postH + 0.3 - Math.abs(bx) * 0.3, s.z - hl + 0.07], [0.07, 0.62 - Math.abs(bx) * 0.5, 0.05]));
  for (const bx of [-hw + 0.25, hw - 0.25]) P.push(box('#a8703f', [s.x + bx, gy + 0.9, s.z - hl + 0.02], [0.07, 1.7, 0.05]));
  P.push(box('#b57a4e', [s.x, gy + 0.2, s.z - hl + 0.04], [2 * hw - 0.2, 0.3, 0.08]));                              // a low back rail
  return { key: 'shelter-frame', geo: combine(P), kind: 'shelter' };
}

function shelterRoof(s, H) {
  const P = [], gy = H(s.x, s.z), { hl, ridge, eave } = s;
  const run = 2.0, slope = Math.hypot(run, ridge - eave), ang = Math.atan2(ridge - eave, run), N = 6, len = 2 * hl + 0.8;
  for (const sg of [-1, 1]) {
    for (let k = 0; k < N; k++) {
      const t = (k + 0.5) / N, x = sg * run * t, y = gy + ridge - (ridge - eave) * t - 0.07;
      const snowy = k < 2;
      P.push(box(snowy ? (k ? '#e6eef9' : SNOW) : (k % 2 ? '#8a5a34' : '#9a6a44'), [s.x + x, y + (snowy ? 0.05 : 0), s.z], [slope / N * 1.04, snowy ? 0.2 : 0.14, len], [0, 0, -sg * ang]));
    }
    P.push(box('#6b4429', [s.x + sg * (run + 0.02), gy + eave - 0.03, s.z], [0.12, 0.14, len + 0.04], [0, 0, -sg * ang]));      // the eave board
  }
  P.push(between(G.cyl8, '#6b4429', [s.x, gy + ridge + 0.04, s.z - len / 2 - 0.05], [s.x, gy + ridge + 0.04, s.z + len / 2 + 0.05], 0.12));
  for (const sz of [-1, 1]) P.push(part(G.ico1, SNOW, { p: [s.x, gy + ridge + 0.14, s.z + sz * (len / 2 - 0.5)], s: [0.45, 0.1, 0.55] }));
  return { key: 'shelter-roof', geo: combine(P), kind: 'shelter' };
}

function shelterLanterns(s, H) {
  const P = [], glows = [], gy = H(s.x, s.z);
  s.lanterns.forEach((l, i) => {
    const top = i < 2 ? gy + s.ridge - 0.14 : gy + s.postH - 0.1;
    const y = gy + l.y;
    P.push(between(G.cyl6, '#2b2340', [l.x, top, l.z], [l.x, y + 0.34, l.z], 0.012));
    if (i >= 2) P.push(between(G.cyl6, '#7a4f30', [l.x, top, l.z - 0.2], [l.x, top, l.z], 0.03));
    glows.push(lantern(P, l.x, y, l.z));
  });
  return { key: 'shelter-lanterns', geo: combine(P), kind: 'shelter', glows };
}

function boxPiece(b, H) {
  const P = [], gy = H(b.x, b.z), o = { x: b.x, z: b.z, yaw: b.yaw };
  P.push(box('#a8703f', [b.x, gy + 0.16, b.z], [0.34, 0.3, 1.1], [0, b.yaw - Math.PI / 2, 0]));
  P.push(box('#8a5a34', [b.x, gy + 0.3, b.z], [0.4, 0.05, 1.18], [0, b.yaw - Math.PI / 2, 0]));
  P.push(box('#4b3a32', [b.x, gy + 0.31, b.z], [0.3, 0.04, 1.0], [0, b.yaw - Math.PI / 2, 0]));
  P.push(box('#7a4f30', [loc(o, 0, 0.55)[0], gy + 0.09, loc(o, 0, 0.55)[1]], [0.4, 0.14, 0.08], [0, b.yaw - Math.PI / 2, 0]));
  for (let k = 0; k < 4; k++) {                                   // edelweiss: a woolly white star on a short green stem (chunky: the outline hull eats anything thinner)
    const lx = (k - 1.5) * 0.25, lz = (k % 2 ? 0.05 : -0.05);
    const q = loc({ x: b.x, z: b.z, yaw: b.yaw - Math.PI / 2 }, lz, lx);
    const h = 0.3 + 0.08 * (k % 3);
    P.push(part(G.cyl6, '#4aa86a', { p: [q[0], gy + 0.33 + h / 2, q[1]], s: [0.024, h, 0.024] }));
    P.push(part(OCT, '#6cc283', { p: [q[0] + 0.07, gy + 0.36 + h * 0.35, q[1]], r: [0, 0.6 + k, 0.5], s: [0.1, 0.025, 0.04] }));
    for (let p = 0; p < 6; p++) {
      const a = p * Math.PI / 3 + k, px = q[0] + Math.cos(a) * 0.085, pz = q[1] + Math.sin(a) * 0.085;
      P.push(part(OCT, '#ffffff', { p: [px, gy + 0.33 + h, pz], r: [0, -a, 0], s: [0.1, 0.035, 0.05] }));
    }
    P.push(part(G.sphereLo, '#f2c94c', { p: [q[0], gy + 0.35 + h, q[1]], s: [0.055, 0.045, 0.055] }));
  }
  return { key: 'flowerbox', geo: combine(P), kind: 'box' };
}

function pinePiece(p, H) {
  const P = [], gy = H(p.x, p.z), s = p.s;
  const tiers = [{ y: 0.75, h: 0.95, r: 0.8, c: '#3b8a46' }, { y: 1.3, h: 0.9, r: 0.62, c: '#459a52' }, { y: 1.8, h: 0.85, r: 0.43, c: '#53ad60' }];
  P.push(part(G.cyl6, '#8a5a3a', { p: [p.x, gy + 0.3 * s, p.z], s: [0.1 * s, 0.6 * s, 0.1 * s] }));
  tiers.forEach((t, i) => {
    P.push(part(FACET_CONE, t.c, { p: [p.x, gy + t.y * s, p.z], r: [0, p.yaw + i, 0], s: [t.r * s, t.h * s, t.r * s] }));
    P.push(part(FACET_CONE, SNOW, { p: [p.x, gy + (t.y + t.h * 0.17) * s, p.z], r: [0, p.yaw + i, 0], s: [t.r * 0.76 * s, t.h * 0.6 * s, t.r * 0.76 * s] }));
  });
  P.push(part(G.ico1, '#66c070', { p: [p.x, gy + 2.3 * s, p.z], s: [0.11 * s, 0.13 * s, 0.11 * s] }));
  return { key: 'pine', geo: combine(P), kind: 'pine' };
}

function stage3Pieces(L, H) {
  const s = L.stage3.shelter;
  return [shelterFrame(s, H), shelterRoof(s, H), shelterLanterns(s, H), ...L.stage3.boxes.map((b) => boxPiece(b, H)), ...L.stage3.pines.map((p) => pinePiece(p, H))];
}

// ------------------------------------------------------------------------------------------------ the built stages
export function buildCampStages(island, mod, { night = () => 0 } = {}) {
  const L = campStageLayout(island);
  const H = (x, z) => mod.height(x, z);
  const group = new THREE.Group(); group.name = 'frost-camp-stages';
  const popper = createPopper({ parent: group });
  const rt = campStageRuntime;
  const cache = {};                                              // stage -> { pieces, mesh }
  let shown = 0, animating = 0, disposed = false;

  // crystal glows: ONE Points with a slot per lantern (4 posts of stage 2, 4 shelter lanterns of stage 3); the slot colour is its level (additive: black = off)
  const glowAt = [];
  const lampStage = [];
  const lamp = [];                                               // eased level 0..1 per slot
  const lampOn = [];                                             // 0 / 1 target
  let glow = null, glowGeo = null, glowMat = null, glowCol = null;
  const addLamp = (pos, stage) => { glowAt.push(pos); lampStage.push(stage); lamp.push(0); lampOn.push(0); return glowAt.length - 1; };

  function pieces(n) {
    if (cache[n]) return cache[n].pieces;
    let list;
    if (n === 1) list = stage1Pieces(L, H);
    else if (n === 2) list = stage2Pieces(L, H);
    else list = stage3Pieces(L, H);
    for (const p of list) {
      p.lamps = [];
      if (p.glow) p.lamps.push(addLamp(p.glow, n));
      if (p.glows) for (const g of p.glows) p.lamps.push(addLamp(g, n));
    }
    cache[n] = { pieces: list, mesh: null };
    if (glowAt.length && !glow) buildGlow();
    else if (glow) rebuildGlow();
    return list;
  }
  function buildGlow() {
    glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(glowAt.flat(), 3));
    glowCol = new THREE.Float32BufferAttribute(new Float32Array(glowAt.length * 3), 3);
    glowGeo.setAttribute('color', glowCol);
    glowMat = new THREE.PointsMaterial({ map: crystalGlow(), size: 3.0, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, fog: false });
    glow = new THREE.Points(glowGeo, glowMat);
    glow.name = 'camp-crystal-glow'; glow.frustumCulled = false; glow.renderOrder = 3; glow.visible = false;
    group.add(glow);
  }
  function rebuildGlow() {                                       // (stage 3's lanterns arrive after stage 2's glow exists: new Points geometry, same material)
    glowGeo.dispose();
    glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(glowAt.flat(), 3));
    glowCol = new THREE.Float32BufferAttribute(new Float32Array(glowAt.length * 3), 3);
    glowGeo.setAttribute('color', glowCol);
    glow.geometry = glowGeo;
  }

  function stageMesh(n) {
    pieces(n);
    const c = cache[n];
    if (c.mesh) return c.mesh;
    const merged = mergeGeometries(c.pieces.map((p) => p.geo.clone()), false);
    const mesh = new THREE.Mesh(merged, VERTEX_TOON);
    mesh.name = `camp-stage-${n}`; mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.add(makeOutline(merged, 0.042));
    mesh.visible = false;
    group.add(mesh);
    c.mesh = mesh;
    return mesh;
  }

  function setLamps(upTo) { for (let i = 0; i < lampOn.length; i++) lampOn[i] = lampStage[i] <= upTo ? 1 : 0; }
  function showMeshes(n) { for (const k of [1, 2, 3]) { if (k <= n) stageMesh(k).visible = true; else if (cache[k] && cache[k].mesh) cache[k].mesh.visible = false; } }

  function immediate(n) {
    popper.clear();
    animating = 0;
    showMeshes(n);
    shown = n;
    setLamps(n);
    for (let i = 0; i < lamp.length; i++) if (!lampOn[i]) lamp[i] = 0; else lamp[i] = 1;
  }

  function animate(n) {
    animating = n;
    const extra = n === 1 && rt.benches ? rt.benches.preview().map((geo) => ({ kind: 'bench', geo, lamps: [], temp: true })) : [];   // (the benches are the fire's own mesh: they only pop in here)
    const list = [...pieces(n), ...extra];
    const mesh = stageMesh(n);
    mesh.visible = false;
    const base = 0.9, gap = n === 1 ? 0.32 : 0.24;
    let landed = 0, benchBegun = false;
    list.forEach((p, i) => {
      const bench = p.kind === 'bench';
      popper.add(p.geo, {
        delay: base + i * gap, drop: p.kind === 'pine' ? 1.0 : p.kind === 'bunting' ? 0.8 : bench ? 0.9 : 1.5, outline: 0.042,
        onStart: bench ? () => { if (!benchBegun) { benchBegun = true; if (rt.benches) rt.benches.begin(); } } : null,
        onLand: (pv) => {
          landed++;
          for (const li of p.lamps) lampOn[li] = 1;
          if (rt.fx) rt.fx.land(pv, landed - 1, list.length, p.kind);
        },
      });
    });
    for (const p of extra) p.geo.dispose();                       // (the popper keeps its own copies)
    popper.whenIdle(() => {
      if (disposed || animating !== n) return;
      mesh.visible = true;
      animating = 0; shown = n;
      if (n === 1 && rt.benches) rt.benches.end();
      if (rt.fx) rt.fx.done(n);
    });
  }

  function setComfort(n, { live = false } = {}) {
    n = clamp(Math.floor(Number(n)) || 0, 0, 3);
    if (live && n === shown + 1 && !animating && n >= 1) {
      for (const k of [1, 2, 3]) if (k <= shown) stageMesh(k).visible = true;
      for (let i = 0; i < lampOn.length; i++) lampOn[i] = lampStage[i] <= shown ? 1 : 0;
      animate(n);
      return true;
    }
    immediate(n);
    if (rt.benches) rt.benches.snap(n >= 1);                       // (a build moment cut short by a rebuild / another change must not leave the stumps behind)
    return false;
  }

  function update(dt) {
    if (disposed) return;
    popper.update(dt);
    if (!glow) return;
    const nk = clamp((night() - 0.08) * 1.25, 0, 1);
    let any = false;
    for (let i = 0; i < lamp.length; i++) {
      lamp[i] += (lampOn[i] - lamp[i]) * (1 - Math.exp(-3 * dt));
      const v = lamp[i] * nk * 0.95;
      if (v > 0.01) any = true;
      glowCol.setXYZ(i, GLOW_TINT.r * v, GLOW_TINT.g * v, GLOW_TINT.b * v);
    }
    glowCol.needsUpdate = true;
    glow.visible = any;
  }

  const api = {
    group, L, setComfort, update,
    get shown() { return shown; },
    get animating() { return animating; },
    get busy() { return popper.busy; },
    dispose() {
      disposed = true;
      const was = animating;
      popper.clear();
      if (was === 1 && rt.benches) rt.benches.end();
      for (const k of [1, 2, 3]) {
        const c = cache[k];
        if (!c) continue;
        if (c.mesh) { c.mesh.removeFromParent(); c.mesh.geometry.dispose(); c.mesh.traverse((o) => { if (o.isMesh && o !== c.mesh) o.geometry.dispose(); }); }
        for (const p of c.pieces) p.geo.dispose();
      }
      if (glow) { glow.removeFromParent(); glowGeo.dispose(); glowMat.dispose(); }
      group.removeFromParent();
      if (rt.stages === api) rt.stages = null;
    },
    summary() {
      let calls = 0;
      group.traverse((o) => { if (o.isMesh && o.visible) { let v = true; for (let p = o.parent; p; p = p.parent) if (!p.visible) { v = false; break; } if (v) calls += 1; } if (o.isPoints && o.visible) calls += 1; });
      return { shown, animating, pieces: popper.count, meshes: [1, 2, 3].map((k) => !!(cache[k] && cache[k].mesh && cache[k].mesh.visible)), lamps: lamp.map((v) => +v.toFixed(2)), glowVisible: !!(glow && glow.visible), drawCalls: calls, postH: POST_H, shelter: SHELTER.ridge };
    },
  };
  rt.stages = api;
  return api;
}
