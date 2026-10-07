// The LOOK of a storybook page's moving things (Step 52a), built live from a page's data (game/pages/*.js) and animated from the PAGE CLOCK (game/pageMotion.js), so every screen draws
// the same leaf in the same place. Everything is the game's own chunky toon style and a handful of draw calls:
//
//   leaves + logs     two InstancedMeshes (+ their outline hulls): leaf platforms (a green ellipse with a vein) and floating logs (bark, cut ends), placed from moverPos(page clock)
//   gust streaks      ONE InstancedMesh of drifting leaf / streak bits per page (all gust zones): they fade in and out with the gust (gustAt) and stream toward its direction
//   water             one translucent plane + foam strip per water zone (the tide's wading flats, the deep channels): its top follows the tide level (tideLevel)
//   Night-Bloom       the big glowing flower (stem + head that opens during a Bloom Moment) + an additive halo; BLOOM PADS: glowing flower-pad tiles that only exist while a Bloom Moment runs
//                     (ghost sparkles mark their places the rest of the time), a swarm of drifting sparkles over the page during the bloom
//   secret exit       the hidden second goal: a small gold bookmark with a star and a pulsing halo
//
//   const mv = createPageMotionVisuals(scene)     built once (empty); open(page) builds, close() frees every geometry / material / texture
//   mv.update(t, { clock, bloom, focusX })        once per frame: t = simulation seconds (cosmetic wobble), clock = the page clock, bloom = run.bloom, focusX = the camera's world x
//   mv.group / mv.isOpen / mv.summary()           mv.padCells(page) none; the pads' physics live in the working grid (game/storybook.js)
import * as THREE from 'three';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../render/geo.js';
import { PAGE, pageToWorld } from '../game/storybookLogic.js';
import { moverPos, moverHalf, tideLevel, gustAt, bloomLook } from '../game/pageMotion.js';
import { PAGE_MOTION as M } from '../config.js';

const frac = (v) => v - Math.floor(v);
const hash = (i, k) => frac(Math.sin(i * 127.1 + k * 311.7) * 43758.5453);

function glowTex() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.35, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- geometries ---------------------------------------------------------------------------------------------------------------------------------------------
const leafGeo = () => combine([
  part(G.sphere, '#58c96b', { p: [0, 0, 0], s: [1, 0.12, 0.62] }),
  part(G.sphere, '#7fe38a', { p: [0, 0.06, 0.04], s: [0.86, 0.06, 0.4] }),
  part(G.cyl6, '#2f8f4e', { p: [0, 0.1, 0], r: [0, 0, Math.PI / 2], s: [0.04, 1.9, 0.04] }),                 // the vein
  part(G.cone6, '#3f9a5a', { p: [1.05, 0, 0], r: [0, 0, -Math.PI / 2], s: [0.1, 0.22, 0.1] }),              // the tip
  part(G.cyl6, '#8a5a34', { p: [-1.05, -0.02, 0], r: [0, 0, Math.PI / 2], s: [0.06, 0.28, 0.06] }),         // the stem stub
]);
// Step 52b: on a snow page the drifting platforms are LANTERN PLATES: a pale ice-blue plate with a snow cap and a little lamp post at one end (warm, bright colours: they pop on the night pages)
const lanternPlateGeo = () => combine([
  part(G.sphere, '#a9d8f5', { p: [0, 0, 0], s: [1, 0.12, 0.62] }),
  part(G.sphere, '#f4fbff', { p: [0, 0.07, 0.03], s: [0.9, 0.06, 0.42] }),
  part(G.cyl6, '#5a4a6a', { p: [-0.78, 0.55, 0], s: [0.035, 1.0, 0.035] }),
  part(G.sphere, '#ffe08a', { p: [-0.78, 1.1, 0], s: [0.17, 0.2, 0.17] }),
  part(G.sphereLo, '#fff7c8', { p: [-0.78, 1.12, 0.05], s: [0.1, 0.12, 0.1] }),
  part(G.cone6, '#5a4a6a', { p: [-0.78, 1.32, 0], s: [0.2, 0.14, 0.2] }),
]);
const logGeo = () => combine([
  part(G.cyl8, '#a8723f', { p: [0, 0, 0], r: [0, 0, Math.PI / 2], s: [0.34, 2, 0.34] }),
  part(G.cyl8, '#d8a96a', { p: [1.0, 0, 0], r: [0, 0, Math.PI / 2], s: [0.28, 0.05, 0.28] }),
  part(G.cyl8, '#d8a96a', { p: [-1.0, 0, 0], r: [0, 0, Math.PI / 2], s: [0.28, 0.05, 0.28] }),
  part(G.cyl8, '#8a5a30', { p: [-0.3, 0.3, 0.05], r: [0, 0, Math.PI / 2], s: [0.07, 0.5, 0.07] }),
  part(G.cyl8, '#8a5a30', { p: [0.45, 0.31, -0.04], r: [0, 0, Math.PI / 2], s: [0.06, 0.4, 0.06] }),
  part(G.cyl6, '#7a4c28', { p: [0.1, 0.02, 0.33], r: [0, 0, Math.PI / 2], s: [0.025, 1.7, 0.025] }),         // a bark line
]);
const gustGeo = () => combine([part(G.sphereLo, '#ffffff', { s: [0.34, 0.06, 0.12] })]);
const padGeo = () => {
  const P = [part(G.cyl8, '#ff9ee0', { p: [0, -0.03, 0], s: [0.5, 0.07, 0.34] })];
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; P.push(part(G.sphere, k % 2 ? '#ffd0f4' : '#ffb0ea', { p: [Math.cos(a) * 0.38, 0.0, Math.sin(a) * 0.24], s: [0.2, 0.06, 0.15] })); }
  P.push(part(G.sphere, '#fff2a0', { p: [0, 0.03, 0], s: [0.16, 0.08, 0.14] }));
  return combine(P);
};
const bloomStemParts = () => {
  const P = [part(G.cyl6, '#3f9a5a', { p: [0, 1.2, 0], s: [0.13, 2.4, 0.13] })];
  P.push(part(G.sphere, '#58c96b', { p: [-0.5, 0.8, 0], r: [0, 0, 0.5], s: [0.55, 0.12, 0.2] }));
  P.push(part(G.sphere, '#58c96b', { p: [0.5, 1.3, 0], r: [0, 0, -0.5], s: [0.55, 0.12, 0.2] }));
  return P;
};
const bloomHeadParts = () => {
  const P = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    P.push(part(G.sphere, k % 2 ? '#d49bff' : '#ff9ee0', { p: [Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0], r: [0, 0, a - Math.PI / 2], s: [0.26, 0.5, 0.1] }));
  }
  P.push(part(G.sphere, '#fff2a0', { p: [0, 0, 0.06], s: [0.34, 0.34, 0.18] }));
  return P;
};
const secretParts = () => combine([
  part(G.cyl6, '#ffd85e', { p: [0, 0.5, 0], s: [0.03, 1.0, 0.03] }),
  part(G.sphere, '#ffd85e', { p: [0, 1.1, 0], s: [0.17, 0.17, 0.05] }),
  part(G.cone6, '#ffd85e', { p: [0, 0.45, 0], s: [0.28, 0.9, 0.05] }),
  part(G.ico1, '#fff2a0', { p: [0, 1.3, 0], s: [0.24, 0.24, 0.08] }),
]);

export function createPageMotionVisuals(scene) {
  const group = new THREE.Group();
  group.name = 'storybook-page-motion';
  group.visible = false;
  scene.add(group);
  let built = null;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();

  function instanced(geo, material, count, name, hull) {
    const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, count));
    mesh.name = name; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.count = Math.max(1, count);
    group.add(mesh);
    const owned = [mesh], disposables = [geo];
    let hullMesh = null;
    if (hull) {
      const o = makeOutline(geo, hull);
      hullMesh = new THREE.InstancedMesh(o.geometry, o.material, Math.max(1, count));
      hullMesh.name = `${name}-outline`; hullMesh.instanceMatrix = mesh.instanceMatrix; hullMesh.renderOrder = -1; hullMesh.frustumCulled = false;
      group.add(hullMesh); owned.push(hullMesh); disposables.push(o.geometry);
    }
    return { mesh, owned, disposables };
  }

  function close() {
    if (!built) return;
    for (const o of built.owned) { o.removeFromParent(); }
    for (const d of built.disposables) d.dispose();
    built = null;
    group.visible = false;
  }

  function open(page) {
    if (built && built.page === page) { group.visible = true; return; }
    close();
    const owned = [], disposables = [];
    const own = (x) => { owned.push(...x.owned); disposables.push(...x.disposables); return x; };
    const b = built = { page, owned, disposables, leaves: null, logs: null, gust: null, waters: [], bloom: null, pads: null, hint: null, sparks: null, secret: null, calls: 0 };
    const tex = glowTex();
    if (tex) disposables.push(tex);
    const movers = page.movers || [];

    // ---- platforms
    const leafIdx = [], logIdx = [];
    movers.forEach((m, i) => (m.kind === 'log' ? logIdx : leafIdx).push(i));
    if (leafIdx.length) { b.leaves = own(instanced(page.theme === 'snow' ? lanternPlateGeo() : leafGeo(), VERTEX_TOON, leafIdx.length, 'page-leaves', 0.05)); b.leafIdx = leafIdx; }
    if (logIdx.length) { b.logs = own(instanced(logGeo(), VERTEX_TOON, logIdx.length, 'page-logs', 0.05)); b.logIdx = logIdx; }

    // ---- gust streaks: a pool per zone
    const gusts = page.gusts || [];
    if (gusts.length) {
      b.gustPool = gusts.map((g) => ({ g, n: Math.max(8, Math.min(34, Math.round(((g.x1 - g.x0) * (g.y1 - g.y0)) / 8))) }));
      const total = b.gustPool.reduce((a, z) => a + z.n, 0);
      const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false });
      b.gust = own(instanced(gustGeo(), mat, total, 'page-gusts', 0));
      disposables.push(mat);
      b.gust.mesh.renderOrder = 4;
      let k = 0;
      const cols = ['#d8f5c8', '#ffffff', '#ffe9a8', '#bff0ff'];
      for (const z of b.gustPool) for (let i = 0; i < z.n; i++, k++) b.gust.mesh.setColorAt(k, _c.set(cols[(i + k) % cols.length]));
      b.gust.mesh.instanceColor.needsUpdate = true;
    }

    // ---- water: the tide's wading flats and the deep channels (one plane + a foam strip each, their tops follow the tide)
    const zones = [];
    if (page.tide) zones.push({ x0: page.tide.x0, x1: page.tide.x1, tide: true });
    for (const w of page.waters || []) zones.push({ x0: w.x0, x1: w.x1 + 1, top: w.top, tide: !!page.tide });
    for (const z of zones) {
      const w = z.x1 - z.x0, cx = pageToWorld(page, (z.x0 + z.x1) / 2, 0).x;
      const geo = new THREE.PlaneGeometry(w, 9, 1, 1), foamGeo = new THREE.PlaneGeometry(w, 0.22, 1, 1);
      const mat = new THREE.MeshBasicMaterial({ color: '#3fa9e0', transparent: true, opacity: 0.5, depthWrite: false });
      const foamMat = new THREE.MeshBasicMaterial({ color: '#e6faff', transparent: true, opacity: 0.8, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat), foam = new THREE.Mesh(foamGeo, foamMat);
      mesh.renderOrder = 3; foam.renderOrder = 3; mesh.name = 'page-water'; foam.name = 'page-foam';
      group.add(mesh, foam); owned.push(mesh, foam); disposables.push(geo, foamGeo, mat, foamMat);
      b.waters.push({ z, mesh, foam, cx });
    }

    // ---- Night-Bloom + pads
    if (page.bloom) {
      const stem = combine(bloomStemParts()), headG = combine(bloomHeadParts());
      const stemMesh = new THREE.Mesh(stem, VERTEX_TOON), headMesh = new THREE.Mesh(headG, new THREE.MeshBasicMaterial({ vertexColors: true }));
      const so = makeOutline(stem, 0.05); stemMesh.add(so);
      const ho = makeOutline(headG, 0.05); headMesh.add(ho);
      const w = pageToWorld(page, page.bloom.x, page.bloom.y);
      stemMesh.position.set(w.x, w.y, PAGE.z - 0.2); headMesh.position.set(w.x, w.y + 2.5, PAGE.z - 0.1);
      group.add(stemMesh, headMesh); owned.push(stemMesh, headMesh); disposables.push(stem, headG, so.geometry, ho.geometry, headMesh.material);
      const glowGeo = new THREE.BufferGeometry();
      glowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([w.x, w.y + 2.5, PAGE.z - 0.5]), 3));
      const glowMat = new THREE.PointsMaterial({ map: tex, color: '#d98cff', size: 5, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const glow = new THREE.Points(glowGeo, glowMat); glow.frustumCulled = false; glow.renderOrder = 5; glow.name = 'page-nightbloom-glow';
      group.add(glow); owned.push(glow); disposables.push(glowGeo, glowMat);
      b.bloom = { stemMesh, headMesh, glow, glowMat, w };
      // pads
      b.padW = page.pads.map((pd) => pageToWorld(page, pd.cx + 0.5, pd.cy + 1));     // (the plank's top: the pad is the platform surface of the cell above... the pad cell IS the plank, top = cy + 1)
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
      b.pads = own(instanced(padGeo(), mat, page.pads.length, 'page-pads', 0.03));
      disposables.push(mat);
      const hp = new Float32Array(Math.max(1, page.pads.length) * 3);
      page.pads.forEach((pd, i) => { hp.set([b.padW[i].x, b.padW[i].y + 0.2, PAGE.z + 0.2], i * 3); });
      const hintGeo = new THREE.BufferGeometry(); hintGeo.setAttribute('position', new THREE.BufferAttribute(hp, 3));
      const hintMat = new THREE.PointsMaterial({ map: tex, color: '#ffb8f0', size: 1.0, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.4 });
      const hint = new THREE.Points(hintGeo, hintMat); hint.frustumCulled = false; hint.renderOrder = 5; hint.name = 'page-pad-hints';
      group.add(hint); owned.push(hint); disposables.push(hintGeo, hintMat);
      b.hint = { hint, hintMat };
      // sparkles drifting over the page during the bloom
      const N = 90, sp = new Float32Array(N * 3), sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      const sm = new THREE.PointsMaterial({ map: tex, color: '#fff2b0', size: 0.55, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
      const sparks = new THREE.Points(sg, sm); sparks.frustumCulled = false; sparks.renderOrder = 5; sparks.name = 'page-bloom-sparks';
      group.add(sparks); owned.push(sparks); disposables.push(sg, sm);
      b.sparks = { sparks, sm, N };
    }

    // ---- the secret exit
    if (page.secret) {
      const g = secretParts(), mesh = new THREE.Mesh(g, VERTEX_TOON), o = makeOutline(g, 0.04); mesh.add(o);
      const w = pageToWorld(page, page.secret.x, page.secret.y);
      mesh.position.set(w.x, w.y, PAGE.z - 0.3);
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([w.x, w.y + 1.0, PAGE.z - 0.1]), 3));
      const gm = new THREE.PointsMaterial({ map: tex, color: '#ffe27a', size: 2.6, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const glow = new THREE.Points(gg, gm); glow.frustumCulled = false; glow.renderOrder = 5; glow.name = 'page-secret-glow';
      group.add(mesh, glow); owned.push(mesh, glow); disposables.push(g, o.geometry, gg, gm);
      b.secret = { mesh, glowMat: gm, w };
    }
    group.visible = true;
  }

  const IDENT = new THREE.Matrix4().makeScale(0, 0, 0);
  function update(t, { clock = 0, bloom = null, focusX = 0 } = {}) {
    const b = built; if (!b) return;
    const page = b.page;
    // platforms
    const place = (inst, idxs, depth, tilt) => {
      idxs.forEach((mi, k) => {
        const m = page.movers[mi], p = moverPos(m, clock, page.tide), half = moverHalf(m), w = pageToWorld(page, p.x, p.y);
        _q.setFromEuler(_e.set(0, 0, Math.sin(t * 1.3 + mi * 1.9) * tilt));
        _m.compose(_p.set(w.x, w.y - depth, PAGE.z), _q, _s.set(half * (m.kind === 'log' ? 1 : 1.12), 1, 1));
        inst.mesh.setMatrixAt(k, _m);
      });
      inst.mesh.instanceMatrix.needsUpdate = true;
    };
    if (b.leaves) place(b.leaves, b.leafIdx, 0.1, 0.04);
    if (b.logs) place(b.logs, b.logIdx, 0.32, 0.03);
    // gust streaks
    if (b.gust) {
      let k = 0;
      for (const z of b.gustPool) {
        const g = z.g, str = gustAt(g, clock), L = g.x1 - g.x0, Hh = g.y1 - g.y0;
        for (let i = 0; i < z.n; i++, k++) {
          if (str < 0.02) { b.gust.mesh.setMatrixAt(k, IDENT); continue; }
          const s = frac(hash(k, 1) + clock * 0.17 * g.dir), x = g.x0 + (g.dir > 0 ? s : 1 - s) * L;
          const y = g.y0 + hash(k, 2) * Hh + Math.sin(clock * 2.1 + hash(k, 3) * 6.3) * 0.45;
          const w = pageToWorld(page, x, y), sc = str * (0.7 + hash(k, 4) * 0.8);
          _q.setFromEuler(_e.set(0, 0, Math.sin(clock * 3 + k) * 0.5 - g.dir * 0.12));
          _m.compose(_p.set(w.x, w.y, PAGE.z + 0.5), _q, _s.set(sc * (g.dir > 0 ? 1 : -1), sc, sc));
          b.gust.mesh.setMatrixAt(k, _m);
        }
      }
      b.gust.mesh.instanceMatrix.needsUpdate = true;
    }
    // water
    for (const w of b.waters) {
      const lvl = w.z.tide ? tideLevel(page.tide, clock) : w.z.top;
      const wy = pageToWorld(page, 0, lvl).y;
      w.mesh.position.set(w.cx, wy - 4.5, PAGE.z + 0.55); w.foam.position.set(w.cx, wy - 0.05 + Math.sin(t * 2) * 0.03, PAGE.z + 0.56);
    }
    // Night-Bloom + pads
    if (b.bloom) {
      const k = bloomLook(bloom, clock), open = 0.55 + 0.75 * k;
      b.bloom.headMesh.scale.setScalar(open); b.bloom.headMesh.rotation.z = t * 0.25 * (0.3 + k);
      b.bloom.stemMesh.rotation.z = Math.sin(t * 0.9) * 0.025;
      b.bloom.glowMat.size = 4.2 + 3.2 * k + Math.sin(t * 2.3) * 0.5; b.bloom.glowMat.opacity = 0.55 + 0.4 * k;
      b.pads.mesh.visible = k > 0.001;
      for (let i = 0; i < page.pads.length; i++) {
        const w = b.padW[i], pk = k < 0.001 ? 0 : Math.min(1, k * 1.4 + (hash(i, 9) - 0.5) * 0.2);
        _q.setFromEuler(_e.set(0, 0, Math.sin(t * 2 + i) * 0.04));
        _m.compose(_p.set(w.x, w.y - 0.07, PAGE.z), _q, _s.set(pk, pk, pk));
        b.pads.mesh.setMatrixAt(i, _m);
      }
      b.pads.mesh.instanceMatrix.needsUpdate = true;
      b.hint.hintMat.opacity = (1 - k) * (0.25 + 0.2 * Math.sin(t * 2.4));
      const sm = b.sparks.sm, pos = b.sparks.sparks.geometry.attributes.position;
      sm.opacity = k * 0.9;
      if (k > 0.001) {
        for (let i = 0; i < b.sparks.N; i++) {
          const x = focusX + (frac(hash(i, 1) + t * 0.01 * (1 + hash(i, 5))) - 0.5) * 56, y = PAGE.y - page.floorRows + 1.5 + hash(i, 2) * 17 + Math.sin(t * (0.8 + hash(i, 6)) + i) * 0.6;
          pos.setXYZ(i, x, y, PAGE.z + 1.5 - hash(i, 3) * 6);
        }
        pos.needsUpdate = true;
      }
    }
    if (b.secret) { b.secret.mesh.rotation.y = Math.sin(t * 1.1) * 0.5; b.secret.mesh.position.y = b.secret.w.y + Math.sin(t * 1.7) * 0.1; b.secret.glowMat.size = 2.4 + Math.sin(t * 2.6) * 0.5; }
  }

  return {
    group, open, close, update,
    get isOpen() { return !!built && group.visible; },
    summary() {
      if (!built) return { open: false };
      let calls = 0;
      group.traverse((o) => { if ((o.isMesh || o.isPoints) && o.visible) calls++; });
      return { open: true, drawCalls: calls, leaves: (built.leafIdx || []).length, logs: (built.logIdx || []).length, gusts: built.gustPool ? built.gustPool.length : 0, waters: built.waters.length, pads: built.pads ? built.page.pads.length : 0, secret: !!built.secret };
    },
  };
}
