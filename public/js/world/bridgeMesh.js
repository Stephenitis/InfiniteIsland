// Bridge meshes (Step 28b): the visible bridges that Cobble (stone arch bridge to Frostpine) and Bramble (rope-and-plank bridge with tiki posts to
// Emberleaf) build. One mesh per BRIDGES entry, laid along getBridge(id) (a -> b) at the deck height players walk on (terrain.deckHeightAt).
//
//   const mesh = createBridgeMesh('frost' | 'ember')      -> { id, group (add to the scene), N, ... }
//   mesh.revealSegments(n, { animate, stagger, onSegment(i, k, total), onDone })
//         show segments 0..n-1 (built from the HOME end outward; a stage reveals a quarter = N / 4 of them). animate = each NEW segment drops in with
//         squash-and-stretch (stagger s apart); onSegment fires as each lands (the thunk + dust), onDone when the last one has settled.
//         Without animate they appear at once (load / late join); asking for fewer than shown hides the rest at once (debug reset).
//   mesh.revealed / mesh.busy / mesh.complete          segments asked for so far / still animating / all N shown and settled
//   mesh.segmentPoint(i, kind?, lat?)                  world point { x, y, z } at the deck centre of segment i (kind 'start' | 'end' for its ends; lat = sideways offset)
//   mesh.endPoint('a' | 'b')                           world point at a landing (deck height)
//   mesh.setLanternWave(t | null)                      lantern wave for the opening cutscene (28c): t runs 0..1.2 along the bridge from the home end; null = off
//   mesh.update(dt, nightness)                         once per frame: drives the pop-ins and the lantern glow (lanterns glow at night once complete)
//   mesh.summary() / mesh.dispose()
//
// Draw calls when fully built: 3 (the merged bridge, its outline hull, the lantern glows (hidden by day)). While segments animate each adds 2 (mesh + hull)
// until it settles. The solid is ONE non-indexed geometry ordered by segment, so "reveal n" is just a draw range: nothing is re-merged per stage.
// Frame: local +Z runs from landing a to landing b, local X is across the deck, local Y is the world height (geometry stores absolute heights).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getBridge, deckHeightAt } from './terrain.js';
import { part, combine, smoothOutlineGeo } from './props.js';
import { toonMat } from '../render/toon.js';
import { PALETTE, CAMERA_FOV } from '../config.js';

export const SEGMENTS = 16;             // 4 per stage
const HULL = 0.045;                      // outline thickness
const POP_TIME = 0.6;                    // s per segment pop-in
const LAND_AT = 0.45;                    // fraction of the pop at which it lands (thunk + dust)
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 8, 1);
const CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6, 1);
const ICO = new THREE.IcosahedronGeometry(1, 1);
const CONE = new THREE.ConeGeometry(1, 1, 4, 1);
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0), _one = new THREE.Vector3(1, 1, 1);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// Palettes (match the stubs / props: lavender stone, warm wood)
const STONE = { base: '#a7a2c0', rail: '#b9b4cc', cap: '#d3cfe3', paverA: '#cbc6df', paverB: '#d9d5ea', pillar: '#c4bfd8', pier: '#9d98b8', roof: '#8a86a8', snow: '#f4f8ff' };
const WOOD = { plankA: '#c98a54', plankB: '#b87a46', plankC: '#d49a62', back: '#6e4a30', beam: '#8a5a3a', post: '#9a6a44', postDark: '#7a4b2a', rope: '#e0c48f', ropeDark: '#c8aa72', eye: '#fff6df', pupil: '#2b2340', mouth: '#3a2418', cheek: '#ff9fb0', crown: '#e8714a', leaf: '#3fae55' };
const GLOW_SIZE = 3.6;                   // world size (u) of a lantern's soft glow sprite
let _glowTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(0.6, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}
const LANTERN = { glass: '#ffe19a', frame: '#6a4a38' };

/** A thin cylinder from a to b (rope). */
function ropeGeo(a, b, r) {
  _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]); _d.subVectors(_b, _a);
  const len = _d.length();
  const g = new THREE.CylinderGeometry(r, r, len, 5);
  _q.setFromUnitVectors(_up, _d.normalize());
  _m.compose(_a.add(_b).multiplyScalar(0.5), _q, _one);
  g.applyMatrix4(_m);
  return g;
}

export function createBridgeMesh(id) {
  const br = getBridge(id);
  if (!br) throw new Error(`createBridgeMesh: unknown bridge ${id}`);
  const stone = br.surface === 'stone';
  const dx = br.bx - br.ax, dz = br.bz - br.az, L = Math.hypot(dx, dz);
  const N = SEGMENTS, SL = L / N;
  const H = (z) => deckHeightAt(br, clamp(z / L, 0, 1));          // deck height at local z
  const W = br.width;
  const EDGE = W / 2 + 0.12;                                        // parapet / post line, just outside the walkable strip

  // ---------------------------------------------------------------------------- geometry, per segment
  const segP = Array.from({ length: N }, () => ({ solid: [], hull: [] }));
  const lanterns = [];                                              // { seg, x, y, z, f }
  const add = (seg, geo, color, t, hull = true) => { const g = part(geo, color, t); segP[seg].solid.push(g); if (hull) segP[seg].hull.push(part(geo, color, t)); };
  const addRaw = (seg, g, color, hull = false) => {                 // a ready geometry (rope): colour it
    const p = part(g, color); g.dispose(); segP[seg].solid.push(p); if (hull) segP[seg].hull.push(part(p, null));
  };
  /** A box slab following the arch from z0 to z1: top at deck + top, `t` thick, centred at x, `w` wide. */
  const slab = (seg, z0, z1, x, w, top, t, color, hull = true, over = 1.04) => {
    const zm = (z0 + z1) / 2, h0 = H(z0), h1 = H(z1);
    const len = Math.hypot(z1 - z0, h1 - h0) * over, ang = Math.atan2(h1 - h0, z1 - z0);
    add(seg, BOX, color, { p: [x, H(zm) + top - t / 2, zm], r: [-ang, 0, 0], s: [w, t, len] }, hull);
  };
  /** A vertical box / cylinder standing at (x, z) from y0 (offset from the deck) up h. */
  const upright = (seg, geo, x, z, y0, h, sx, sz, color, hull = true, rot = 0) => add(seg, geo, color, { p: [x, H(z) + y0 + h / 2, z], r: [0, rot, 0], s: [sx, h, sz] }, hull);
  const lantern = (seg, x, y, z) => {
    const hull = false;
    add(seg, BOX, LANTERN.frame, { p: [x, y - 0.17, z], s: [0.3, 0.1, 0.3] }, hull);
    add(seg, BOX, LANTERN.glass, { p: [x, y, z], s: [0.24, 0.26, 0.24] }, hull);
    add(seg, CONE, LANTERN.frame, { p: [x, y + 0.26, z], r: [0, Math.PI / 4, 0], s: [0.26, 0.22, 0.26] }, hull);
    lanterns.push({ seg, x, y, z, f: z / L });
  };
  const pier = (seg, x, z, r, color) => {
    const top = H(z) - 0.5, bottom = -2.8;
    add(seg, CYL, color, { p: [x, (top + bottom) / 2, z], s: [r, top - bottom, r] });
  };

  for (let i = 0; i < N; i++) {
    const z0 = i * SL, z1 = (i + 1) * SL, zm = (z0 + z1) / 2;
    const farHalf = zm / L > 0.5;
    if (stone) {
      // deck: a chunky base slab and lighter pavers (2 x 2 per segment, brick-bonded)
      slab(i, z0, z1, 0, W + 0.3, -0.1, 0.62, STONE.base);
      for (let r = 0; r < 2; r++) {
        const za = z0 + (r * SL) / 2, zb = z0 + ((r + 1) * SL) / 2;
        for (let c = 0; c < 2; c++) {
          const x = -W / 4 + c * (W / 2) + (r ? 0.22 : -0.22) * 0;
          slab(i, za + 0.02, zb - 0.02, x, W / 2 - 0.1, 0, 0.1, (i + r + c) % 2 ? STONE.paverA : STONE.paverB, false, 1);
        }
      }
      for (const sx of [-1, 1]) {
        const x = sx * EDGE;
        slab(i, z0, z1, x, 0.34, 0.5, 0.62, STONE.rail);                     // parapet wall
        slab(i, z0, z1, x, 0.46, 0.62, 0.12, STONE.cap);                     // rounded-ish cap
      }
      // pillars on the parapet at every other boundary (a pillar belongs to the segment it ends; the first one to segment 0)
      const jEnd = i + 1;
      const pillarAt = (j) => {
        const z = j * SL;
        for (const sx of [-1, 1]) {
          upright(i, BOX, sx * EDGE, z, -0.1, 1.0, 0.56, 0.56, STONE.pillar);
          if ([2, 6, 10, 14].includes(j)) lantern(i, sx * EDGE, H(z) + 1.12, z);
          else {
            add(i, ICO, farHalf ? STONE.snow : STONE.cap, { p: [sx * EDGE, H(z) + 0.98, z], s: [0.38, 0.22, 0.38] });
          }
        }
      };
      if (i === 0) pillarAt(0);
      if (jEnd % 2 === 0) pillarAt(jEnd);
      if (farHalf) for (const sx of [-1, 1]) add(i, ICO, STONE.snow, { p: [sx * EDGE, H(zm) + 0.7, zm], s: [0.3, 0.07, Math.max(0.3, SL * 0.45)] }, false);   // snow dusting on the far half
    } else {
      // planks: 7 across the segment, over a dark backing slab and two beams
      slab(i, z0, z1, 0, W + 0.1, -0.1, 0.16, WOOD.back);
      for (const sx of [-1, 1]) slab(i, z0, z1, sx * (W / 2 - 0.35), 0.24, -0.1, 0.3, WOOD.beam);
      const P = 7, pl = SL / P;
      for (let p = 0; p < P; p++) {
        const za = z0 + p * pl + 0.015, zb = z0 + (p + 1) * pl - 0.015;
        const k = hash(i * 7 + p);
        slab(i, za, zb, (k - 0.5) * 0.06, W, 0, 0.12, k < 0.34 ? WOOD.plankA : k < 0.7 ? WOOD.plankB : WOOD.plankC, false, 1);
      }
      for (const sx of [-1, 1]) {
        if (i === 0) tiki(i, sx, 0, false);
        if ((i + 1) % 2 === 0) tiki(i, sx, (i + 1) * SL, [2, 6, 10, 14].includes(i + 1));
        // rope handrails between the posts of this span (belongs to the later segment of the span)
        if (i % 2 === 1) ropes(i, sx, (i - 1) * SL, (i + 1) * SL);
      }
    }
  }

  /** A tiki post at (sx * EDGE, z): chunky carved pole, round-eyed smiling face looking inward, a leafy crown (or a lantern). */
  function tiki(seg, sx, z, withLantern) {
    const x = sx * EDGE, y = H(z), inward = -sx, hPost = 1.5;
    add(seg, CYL6, WOOD.post, { p: [x, y - 0.4 + (hPost + 0.4) / 2, z], s: [0.27, hPost + 0.4, 0.27] });
    add(seg, CYL6, WOOD.rope, { p: [x, y + 0.45, z], s: [0.3, 0.12, 0.3] }, false);                     // rope band
    add(seg, BOX, WOOD.postDark, { p: [x, y + hPost + 0.07, z], s: [0.58, 0.14, 0.58] });                 // wide cap
    const fy = y + 1.0, fx = x + inward * 0.25;
    add(seg, BOX, WOOD.postDark, { p: [x + inward * 0.2, fy + 0.2, z], s: [0.1, 0.07, 0.42] }, false);    // brow ridge
    for (const e of [-1, 1]) {
      add(seg, ICO, WOOD.eye, { p: [fx, fy + 0.06, z + e * 0.1], s: [0.06, 0.1, 0.1] }, false);
      add(seg, ICO, WOOD.pupil, { p: [fx + inward * 0.04, fy + 0.05, z + e * 0.1], s: [0.04, 0.05, 0.05] }, false);
      add(seg, ICO, WOOD.cheek, { p: [fx, fy - 0.12, z + e * 0.17], s: [0.04, 0.045, 0.06] }, false);
    }
    add(seg, ICO, WOOD.postDark, { p: [fx + inward * 0.03, fy - 0.04, z], s: [0.06, 0.06, 0.05] }, false);   // nose
    add(seg, BOX, WOOD.mouth, { p: [fx - inward * 0.0, fy - 0.2, z], s: [0.05, 0.05, 0.18] }, false);       // smile
    add(seg, BOX, WOOD.mouth, { p: [fx, fy - 0.17, z - 0.11], s: [0.05, 0.05, 0.05] }, false);
    add(seg, BOX, WOOD.mouth, { p: [fx, fy - 0.17, z + 0.11], s: [0.05, 0.05, 0.05] }, false);
    if (withLantern) lantern(seg, x, y + hPost + 0.4, z);
    else {
      add(seg, CONE, WOOD.leaf, { p: [x, y + hPost + 0.38, z], r: [0, Math.PI / 4, 0], s: [0.3, 0.46, 0.3] }, false);   // leafy tuft
      add(seg, ICO, WOOD.crown, { p: [x, y + hPost + 0.2, z], s: [0.14, 0.1, 0.14] }, false);
    }
  }

  /** Two sagging ropes (hand rope + lower rope) from post to post. */
  function ropes(seg, sx, za, zb) {
    const x = sx * (EDGE - 0.04);
    for (const [yo, sag, r] of [[1.12, 0.3, 0.06], [0.5, 0.18, 0.05]]) {
      const K = 7;
      let prev = null;
      for (let k = 0; k <= K; k++) {
        const u = k / K, z = za + (zb - za) * u;
        const p = [x, H(z) + yo - sag * 4 * u * (1 - u), z];
        if (prev) addRaw(seg, ropeGeo(prev, p, r), yo > 1 ? WOOD.rope : WOOD.ropeDark, false);
        prev = p;
      }
    }
  }

  // piers: stone = two chunky columns; wood = two log piles. Their segments: 2 (stage 1), 7 (stage 2), 12 (stage 4).
  for (const i of [2, 7, 12]) {
    const zm = (i + 0.5) * SL;
    for (const sx of [-1, 1]) {
      if (stone) pier(i, sx * 0.85, zm, 0.62, STONE.pier);
      else pier(i, sx * 1.05, zm, 0.3, WOOD.beam);
    }
    if (stone) add(i, BOX, STONE.pier, { p: [0, H(zm) - 0.78, zm], s: [W + 0.5, 0.36, 1.5] });      // capital block under the deck
    else add(i, BOX, WOOD.beam, { p: [0, H(zm) - 0.5, zm], s: [W - 0.2, 0.2, 0.34] }, true);          // cross beam
  }

  // ---------------------------------------------------------------------------- combine
  const solids = [], hulls = [], solidEnd = [0], hullEnd = [0];
  for (let i = 0; i < N; i++) {
    const sg = combine(segP[i].solid);
    const hg = smoothOutlineGeo(combine(segP[i].hull));
    solids.push(sg); hulls.push(hg);
    solidEnd.push(solidEnd[i] + sg.attributes.position.count);
    hullEnd.push(hullEnd[i] + hg.index.count);
  }
  const fullSolid = mergeGeometries(solids, false);
  const fullHull = mergeGeometries(hulls, false);
  const solidMat = toonMat('#ffffff', { vertexColors: true });
  const hullMat = new THREE.MeshBasicMaterial({ color: PALETTE.outline, side: THREE.BackSide });
  hullMat.onBeforeCompile = (shader) => {                            // the same inverted-hull extrusion as render/toon.js (own material: draw range / uniform)
    shader.uniforms.outlineThickness = { value: HULL };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float outlineThickness;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * outlineThickness;');
  };
  hullMat.customProgramCacheKey = () => 'outline';

  const group = new THREE.Group();
  group.name = `bridge-${id}`;
  group.position.set(br.ax, 0, br.az);
  group.rotation.y = Math.atan2(dx / L, dz / L);
  const solidMesh = new THREE.Mesh(fullSolid, solidMat);
  solidMesh.name = `bridge-${id}-deck`;
  solidMesh.castShadow = false; solidMesh.receiveShadow = true;
  const hullMesh = new THREE.Mesh(fullHull, hullMat);
  hullMesh.name = `bridge-${id}-hull`;
  hullMesh.castShadow = false; hullMesh.receiveShadow = false; hullMesh.renderOrder = -1;
  group.add(solidMesh, hullMesh);
  solidMesh.visible = hullMesh.visible = false;

  // ---------------------------------------------------------------------------- lantern glows (one instanced mesh)
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lanterns.flatMap((l) => [l.x, l.y, l.z])), 3));
  glowGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(lanterns.length * 3), 3));
  const glowMat = new THREE.PointsMaterial({
    map: glowTexture(), size: GLOW_SIZE / Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)), sizeAttenuation: true, vertexColors: true,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
  });
  const glow = new THREE.Points(glowGeo, glowMat);
  glow.name = `bridge-${id}-glow`;
  glow.frustumCulled = false;
  glow.visible = false;
  group.add(glow);
  const WARM = new THREE.Color('#ffb84a');
  const _c = new THREE.Color();
  const glowCol = glowGeo.attributes.color;
  const lit = new Float32Array(lanterns.length);
  let wave = null, glowT = 0;

  // ---------------------------------------------------------------------------- reveal state
  let shown = 0;                 // segments settled into the static mesh (a prefix)
  let asked = 0;                 // segments asked for (shown + animating)
  const anim = [];               // { i, t (negative = waiting), mesh, hull, landed, k, total, onSegment, group }
  const settled = new Set();
  const pendingDone = [];        // { remaining (count), fn }
  let lastNight = 0;

  const segMid = (i) => (i + 0.5) * SL;
  function applyDrawRange() {
    solidMesh.visible = hullMesh.visible = shown > 0;
    fullSolid.setDrawRange(0, solidEnd[shown]);
    fullHull.setDrawRange(0, hullEnd[shown]);
  }
  const worldPoint = (z, x = 0) => {
    const yaw = group.rotation.y;
    return { x: br.ax + x * Math.cos(yaw) + z * Math.sin(yaw), y: H(z), z: br.az - x * Math.sin(yaw) + z * Math.cos(yaw) };
  };

  function segMeshes(i) {
    // centred copies so a segment can squash and stretch around its own deck centre
    const zm = segMid(i), ym = H(zm);
    const sg = solids[i].clone().translate(0, -ym, -zm);
    const hg = hulls[i].clone().translate(0, -ym, -zm);
    const g = new THREE.Group();
    g.position.set(0, ym, zm);
    const m = new THREE.Mesh(sg, solidMat); m.receiveShadow = true; m.castShadow = false; m.frustumCulled = false;
    const h = new THREE.Mesh(hg, hullMat); h.renderOrder = -1; h.frustumCulled = false;
    g.add(m, h);
    return { g, sg, hg };
  }

  function settle(a) {
    const ai = anim.indexOf(a);
    if (ai < 0) return;                                 // (dropped meanwhile)
    anim.splice(ai, 1);
    a.g.removeFromParent(); a.sg.dispose(); a.hg.dispose();
    settled.add(a.i);
    while (settled.has(shown)) { settled.delete(shown); shown++; }
    applyDrawRange();
    const due = pendingDone.filter((d) => shown >= d.upTo);       // (callbacks may reveal / hide again: take them out first)
    for (const d of due) pendingDone.splice(pendingDone.indexOf(d), 1);
    for (const d of due) { try { d.fn && d.fn(); } catch (e) { console.error(e); } }
  }

  function dropAnim() {
    for (const a of [...anim]) { a.g.removeFromParent(); a.sg.dispose(); a.hg.dispose(); }
    anim.length = 0; settled.clear();
  }

  function revealSegments(n, { animate = false, stagger = 0.16, onSegment = null, onDone = null } = {}) {
    n = clamp(Math.floor(n) || 0, 0, N);
    if (!animate) {                                  // at once (also hides segments when asked for fewer)
      dropAnim();
      pendingDone.length = 0;
      shown = n; asked = n;
      applyDrawRange();
      if (onDone) onDone();
      return;
    }
    if (n <= asked) {                                // already on its way / shown: nothing new to animate
      if (onDone) { if (shown >= n) onDone(); else pendingDone.push({ upTo: n, fn: onDone }); }
      return;
    }
    const from = asked;
    const total = n - from;
    for (let i = from; i < n; i++) {
      const s = segMeshes(i);
      s.g.visible = false;
      group.add(s.g);
      anim.push({ i, t: -(i - from) * stagger, g: s.g, sg: s.sg, hg: s.hg, landed: false, k: i - from, total, onSegment });
    }
    asked = n;
    if (onDone) pendingDone.push({ upTo: n, fn: onDone });
  }

  function updateGlow(dt, night) {
    glowT += dt;
    const complete = shown >= N;
    let any = false;
    for (let k = 0; k < lanterns.length; k++) {
      const L2 = lanterns[k];
      const visible = L2.seg < shown;
      let v = 0;
      if (visible) {
        if (complete) v = night * 0.9;
        if (wave !== null) v = Math.max(v, smooth(0, 0.08, wave - L2.f));
      }
      lit[k] = v;
      if (v > 0.01) any = true;
      const pulse = 1 + 0.08 * Math.sin(glowT * 3 + k * 1.7);
      _c.copy(WARM).multiplyScalar(1.6 * v * pulse);
      glowCol.setXYZ(k, _c.r, _c.g, _c.b);
    }
    glowCol.needsUpdate = true;
    glow.visible = any;
  }

  function update(dt, nightness = 0) {
    lastNight = nightness;
    for (const a of [...anim]) {
      if (!anim.includes(a)) continue;                 // dropped by a callback of an earlier segment
      a.t += dt;
      if (a.t < 0) continue;
      if (!a.g.visible) a.g.visible = true;
      const u = clamp(a.t / POP_TIME, 0, 1);
      let y, sy, sxz;
      if (u < LAND_AT) { const p = u / LAND_AT; y = 1.7 * (1 - p * p); sy = 1 + 0.25 * p; sxz = 1 - 0.1 * p; }
      else {
        if (!a.landed) { a.landed = true; if (a.onSegment) { try { a.onSegment(a.i, a.k, a.total); } catch (e) { console.error(e); } } }
        const q = (u - LAND_AT) / (1 - LAND_AT);
        const e = Math.exp(-5 * q) * Math.cos(12 * q);
        y = 0; sy = 1 - 0.3 * e; sxz = 1 + 0.12 * e;
      }
      const grow = 0.55 + 0.45 * Math.min(1, u / 0.2);
      a.g.position.y = H(segMid(a.i)) + y;
      a.g.scale.set(sxz * grow, sy, sxz * grow);
      if (u >= 1) { a.g.position.y = H(segMid(a.i)); settle(a); }
    }
    if (shown > 0 || lanterns.length) updateGlow(dt, nightness);
  }

  return {
    id, group, N, segmentLength: SL, length: L, lanterns: lanterns.length, surface: br.surface,
    revealSegments, update,
    get revealed() { return asked; },
    get shown() { return shown; },
    get busy() { return anim.length > 0; },
    get complete() { return shown >= N && !anim.length; },
    segmentPoint(i, kind = 'mid', lat = 0) {
      const z = kind === 'start' ? i * SL : kind === 'end' ? (i + 1) * SL : segMid(i);
      return worldPoint(z, lat);
    },
    endPoint(end) { return worldPoint(end === 'a' ? 0 : L); },
    pointAt(s) { return worldPoint(clamp(s, 0, 1) * L); },
    setLanternWave(t) { wave = t === null || t === undefined ? null : Number(t); },
    get lanternWave() { return wave; },
    lanternLevels: () => Array.from(lit),
    summary() {
      let calls = 0;
      group.traverse((o) => { if (o.isMesh && o.visible) calls += 1; });
      return { id, segments: N, shown, asked, animating: anim.length, complete: shown >= N && !anim.length, lanterns: lanterns.length, lit: Array.from(lit).filter((v) => v > 0.01).length, drawCalls: calls, night: +lastNight.toFixed(2), tris: Math.round((solidEnd[shown]) / 3 + hullEnd[shown] / 3) };
    },
    dispose() {
      dropAnim();
      for (const g of solids) g.dispose();
      for (const g of hulls) g.dispose();
      fullSolid.dispose(); fullHull.dispose(); hullMat.dispose(); glowGeo.dispose(); glowMat.dispose();
      group.removeFromParent();
    },
  };
}
