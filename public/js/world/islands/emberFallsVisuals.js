// Emberleaf's waterfall VISUALS (PLAN Step 37c): the water surfaces, the falling curtain, the rock lip, the mist and a faint rainbow. Pure terrain / data live in emberFalls.js
// (ember.js carves the height field); the terrain painter adds the wet rock. Built by buildEmberVisuals() into Emberleaf's `full` group and freely disposed / rebuilt
// (`__game.world.rebuild('ember')`): nothing with identity lives here.
//
//   const v = buildFallsVisuals(island, mod) -> { group (full detail), far (a cheap white streak, in Emberleaf's far group), update(t), dispose(), summary() }
//
// Draw calls (budget <= 6, no lights): 1 ribbons (the spring pool, the channel, the plunge pool disc, the cascade + stream: ONE merged geometry, water.js' ribbon material in its `falls` variant:
// faster and foamier where the water drops a riser), 1 the falling curtain + the splash foam at its base (a scrolling-streak shader), 2 the rocks (the lip slab, boulders, the spring's crack) with
// their outline hull, 1 the mist (Points), 1 a faint additive rainbow arc (daytime only). The far streak is 1 draw call in the far group (not drawn together with `full`).
// The shared water look (time, foam, day tint) is water.js' `waterUniforms`, driven by createWater().update / setTimeOfDay.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_LEVEL, EMBER_WATERFALL as W } from '../../config.js';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../../render/geo.js';
import { buildRibbonGeometry, makeRibbonMaterial, waterUniforms } from '../water.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A flat disc (a fan) with the ribbon geometry's attributes: uv.x 0.5 at the centre -> 1 at the rim, uv.y = radius (so the ripples travel across it). */
function discGeometry(cx, y, cz, r, segs, uvScale) {
  const pos = [cx, y, cz], uv = [0.5, 0], fall = [0], idx = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pos.push(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r); uv.push(1, uvScale); fall.push(0);
    idx.push(0, 1 + i, 1 + ((i + 1) % segs));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aFall', new THREE.Float32BufferAttribute(fall, 1));
  g.setIndex(idx);
  return g;
}

const SHEET_VERT = /* glsl */`
  #include <common>
  #include <fog_pars_vertex>
  attribute float aKind;
  varying vec2 vUv;
  varying float vKind;
  void main() {
    vUv = uv; vKind = aKind;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const SHEET_FRAG = /* glsl */`
  #include <common>
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform float uNight;
  uniform vec3 uFoam;
  uniform vec3 uFoamTint;
  uniform vec3 uShallowTint;
  varying vec2 vUv;
  varying float vKind;
  void main() {
    vec3 col; float alpha;
    if (vKind < 0.5) {
      // the curtain: vertical streaks that fall faster towards the bottom, bright foamy bands running down it
      float x = vUv.x, t = vUv.y;
      float streak = 0.5 + 0.5 * sin(x * 46.0 + sin(t * 7.0 - uTime * 2.6) * 1.4 + sin(x * 17.0) * 0.8);
      float bands = 0.5 + 0.5 * sin(t * 30.0 - uTime * (8.0 + 6.0 * t) + x * 6.0);
      col = mix(vec3(0.50, 0.92, 0.95) * uShallowTint, uFoam * uFoamTint, 0.28 + 0.5 * streak * bands + 0.25 * t);
      float edge = smoothstep(0.0, 0.1, x) * (1.0 - smoothstep(0.9, 1.0, x));
      alpha = (0.62 + 0.28 * streak) * edge * smoothstep(0.0, 0.04, t);
    } else {
      // the splash where it lands: a soft white churn that breathes
      float r = length(vUv - 0.5) * 2.0;
      float churn = 0.5 + 0.5 * sin(r * 16.0 - uTime * 5.5 + sin(vUv.x * 13.0 + uTime));
      col = uFoam * uFoamTint;
      alpha = (1.0 - smoothstep(0.25, 1.0, r)) * (0.5 + 0.4 * churn);
    }
    col *= mix(1.0, 0.55, uNight);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const MIST_VERT = /* glsl */`
  attribute vec4 aSeed;
  uniform float uTime;
  varying float vAge;
  void main() {
    float age = fract(aSeed.x + uTime / 5.5);
    vAge = age;
    vec3 p = position + vec3((aSeed.y - 0.5) * 3.4 * (0.6 + age), age * 2.6 + aSeed.w * 0.4, (aSeed.z - 0.5) * 2.4 * (0.6 + age));
    p.x += sin(age * 6.0 + aSeed.y * 20.0) * 0.4;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp((1.3 + age * 3.4) * 600.0 / max(1.0, -mv.z), 2.0, 160.0);
  }
`;
const MIST_FRAG = /* glsl */`
  uniform float uNight;
  varying float vAge;
  void main() {
    float d = length(gl_PointCoord * 2.0 - 1.0);
    float a = (1.0 - smoothstep(0.15, 1.0, d)) * smoothstep(0.0, 0.12, vAge) * (1.0 - smoothstep(0.55, 1.0, vAge));
    vec3 c = mix(vec3(0.92, 0.99, 1.0), vec3(0.45, 0.52, 0.72), uNight);
    gl_FragColor = vec4(c, a * mix(0.2, 0.1, uNight));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function buildFallsVisuals(island, mod) {
  const falls = mod.falls, D = falls.data, F = W.falls, group = new THREE.Group(), far = new THREE.Group();
  group.name = 'ember-falls'; far.name = 'ember-falls-far';
  const disposers = [];
  const wp = (s, u, y) => { const p = falls.toWorld(s, u); return [p.x, y, p.z]; };
  const paths = falls.paths();
  const stats = { ribbons: 0, verts: 0 };

  // ---- 1. water surfaces: one merged geometry, one draw call -------------------------------------------------------------------------------------------
  const geos = [];
  const chan = buildRibbonGeometry(paths.channel, F.channel.hw + 0.2, { fall: () => 0 });
  if (chan) geos.push(chan);
  // the cascade + the stream are one flowing path; `fall` marks the steep stretches (risers) so they churn white
  const flow = paths.cascade.slice();
  const nCascade = flow.length;
  for (const p of paths.stream) {
    const h = mod.height(p.x, p.z);
    if (h < WATER_LEVEL - 0.12) break;                       // flows into the lagoon
    flow.push({ x: p.x, z: p.z, y: Math.max(h + 0.2, WATER_LEVEL + 0.03) });
  }
  const slopeOf = (i) => {
    const a = flow[Math.max(0, i - 1)], b = flow[Math.min(flow.length - 1, i + 1)];
    return (a.y - b.y) / Math.max(0.5, Math.hypot(a.x - b.x, a.z - b.z));
  };
  const flowGeo = buildRibbonGeometry(flow, (i) => (i < nCascade ? F.cascade.hw + 0.15 : F.stream.hw * 1.12), { fall: (p, i) => clamp01((slopeOf(i) - 0.16) / 0.3) });
  if (flowGeo) geos.push(flowGeo);
  geos.push(discGeometry(D.pool.x, D.pool.y + 0.03, D.pool.z, D.pool.r + 0.55, 30, 4.0));
  geos.push(discGeometry(D.spring.x, D.spring.y + 0.03, D.spring.z, D.spring.r + 0.5, 20, 2.0));
  const ribbonGeo = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  const ribbonMat = makeRibbonMaterial(waterUniforms, { falls: true });
  const ribbons = new THREE.Mesh(ribbonGeo, ribbonMat);
  ribbons.name = 'ember-falls-water'; ribbons.frustumCulled = false; ribbons.renderOrder = 2;
  group.add(ribbons);
  disposers.push(() => { ribbonGeo.dispose(); ribbonMat.dispose(); });
  stats.ribbons = 1; stats.verts = ribbonGeo.attributes.position.count;

  // ---- 2. the falling curtain + the splash at its base --------------------------------------------------------------------------------------------------
  const sheetPts = [];                                        // [{ s, y, hw }] top -> bottom (also the far panel)
  const ROWS = 14;
  for (let i = 0; i <= ROWS; i++) {
    const t = i / ROWS;
    sheetPts.push({ s: F.slab.s1 + F.sheet.run * t * (2 - t), y: F.slab.y - 0.02 - F.sheet.drop * Math.pow(t, 1.5), hw: F.sheet.hw * (1 + 0.2 * t), t });
  }
  const sp = [], su = [], sk = [], si = [];
  for (const row of sheetPts) {
    for (let c = 0; c <= 4; c++) {
      const x = c / 4;
      sp.push(...wp(row.s, (x - 0.5) * 2 * row.hw, row.y)); su.push(x, row.t); sk.push(0);
    }
  }
  for (let i = 0; i < ROWS; i++) for (let c = 0; c < 4; c++) { const a = i * 5 + c, b = a + 5; si.push(a, b, a + 1, a + 1, b, b + 1); }
  const landS = sheetPts[ROWS].s;
  const foamBase = sp.length / 3;
  for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    sp.push(...wp(landS - 1.1 + fy * 2.4, (fx - 0.5) * 5.2, D.pool.y + 0.07)); su.push(fx, fy); sk.push(1);
  }
  si.push(foamBase, foamBase + 2, foamBase + 1, foamBase + 1, foamBase + 2, foamBase + 3);
  const sheetGeo = new THREE.BufferGeometry();
  sheetGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  sheetGeo.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2));
  sheetGeo.setAttribute('aKind', new THREE.Float32BufferAttribute(sk, 1));
  sheetGeo.setIndex(si);
  const sheetMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: waterUniforms.uTime, uNight: waterUniforms.uNight, uFoam: waterUniforms.uFoam, uFoamTint: waterUniforms.uFoamTint, uShallowTint: waterUniforms.uShallowTint }]),
    vertexShader: SHEET_VERT, fragmentShader: SHEET_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
  });
  Object.assign(sheetMat.uniforms, { uTime: waterUniforms.uTime, uNight: waterUniforms.uNight, uFoam: waterUniforms.uFoam, uFoamTint: waterUniforms.uFoamTint, uShallowTint: waterUniforms.uShallowTint });
  const sheet = new THREE.Mesh(sheetGeo, sheetMat);
  sheet.name = 'ember-falls-sheet'; sheet.frustumCulled = false; sheet.renderOrder = 3;
  group.add(sheet);
  disposers.push(() => { sheetGeo.dispose(); sheetMat.dispose(); });

  // ---- 3. rocks: the lip slab the water slides over, boulders at its sides, the crack the spring comes from (+ the outline hull) ------------------------------
  const rot = [0, -D.angle, 0];                               // local x -> along the fall line (s), local z -> sideways (u)
  const rockParts = [];
  const rock = (geo, color, s, u, y, sx, sy, sz, jitter = 0) => rockParts.push(part(geo, color, { p: wp(s, u, y), r: [jitter * 0.4, -D.angle + jitter, jitter * 0.3], s: [sx, sy, sz] }));
  const box = new THREE.BoxGeometry(1, 1, 1);
  const SL = F.slab, slabLen = SL.s1 - SL.s0 + 0.1, slabMid = (SL.s0 + SL.s1) / 2 + 0.05;
  rockParts.push(part(box, '#6a5d6c', { p: wp(slabMid, 0, SL.y - 0.45), r: rot, s: [slabLen, 0.9, SL.hw * 1.9] }));
  rock(G.ico1, '#7b6b79', SL.s1 - 0.1, SL.hw * 0.95, SL.y - 0.45, 0.75, 0.62, 0.7, 0.4);        // lip boulders at the front corners
  rock(G.ico1, '#5d5266', SL.s1 - 0.1, -SL.hw * 0.95, SL.y - 0.45, 0.7, 0.58, 0.72, 1.1);
  rock(G.ico1, '#574a5a', SL.s0 + 0.9, SL.hw + 0.55, SL.y - 0.7, 1.0, 0.9, 0.95, 0.7);
  rock(G.ico1, '#6e5f6b', SL.s0 + 0.7, -SL.hw - 0.5, SL.y - 0.7, 0.95, 0.85, 0.9, 2.1);
  rock(G.ico1, '#4d4a60', F.pool.s + 1.9, F.pool.r + 0.7, F.pool.y + 0.1, 0.8, 0.55, 0.75, 0.3);   // two mossy boulders on the pool's shore (clear of the ledge)
  rock(G.ico1, '#5d5266', F.pool.s + 3.3, -F.pool.r - 0.2, F.pool.y + 0.25, 0.7, 0.5, 0.7, 1.7);
  rock(G.ico1, '#5d5266', F.spring.s - 1.1, 1.6, F.spring.y + 0.15, 0.55, 0.45, 0.5, 0.9);          // the spring's crack: a dark seam between two slabs
  rock(G.ico1, '#574a5a', F.spring.s - 1.2, -1.5, F.spring.y + 0.15, 0.6, 0.5, 0.55, 2.0);
  rock(G.ico1, '#2b2340', F.spring.s - 1.3, 0, F.spring.y - 0.05, 0.28, 0.08, 1.0, 0.0);
  const rockGeo = combine(rockParts);
  const rocks = new THREE.Mesh(rockGeo, VERTEX_TOON);
  rocks.name = 'ember-falls-rocks'; rocks.castShadow = false; rocks.receiveShadow = true;
  const outline = makeOutline(rockGeo, 0.04);
  outline.name = 'ember-falls-rocks-outline';
  group.add(rocks, outline);
  disposers.push(() => { rockGeo.dispose(); box.dispose(); outline.geometry?.dispose?.(); });

  // ---- 4. mist at the foot of the fall ----------------------------------------------------------------------------------------------------------------------------
  const N = 26, mp = new Float32Array(N * 3), ms = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) for (let j = 0; j < 4; j++) ms[i * 4 + j] = ((i * 37 + j * 13 + 7) % 101) / 101;
  const mistGeo = new THREE.BufferGeometry();
  mistGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  mistGeo.setAttribute('aSeed', new THREE.BufferAttribute(ms, 4));
  const mistMat = new THREE.ShaderMaterial({ uniforms: { uTime: waterUniforms.uTime, uNight: waterUniforms.uNight }, vertexShader: MIST_VERT, fragmentShader: MIST_FRAG, transparent: true, depthWrite: false });
  const mist = new THREE.Points(mistGeo, mistMat);
  mist.position.set(...wp(landS - 0.2, 0, D.pool.y + 0.1)); mist.frustumCulled = false; mist.name = 'ember-falls-mist'; mist.renderOrder = 4;
  group.add(mist);
  disposers.push(() => { mistGeo.dispose(); mistMat.dispose(); });

  // ---- 5. a faint rainbow in the mist, by day only (additive arc, vertex-coloured bands) ------------------------------------------------------------------
  const arc = new THREE.RingGeometry(4.3, 5.2, 40, 6, 0, Math.PI);
  const bands = ['#ff6b6b', '#ffb36b', '#fff08a', '#8ae28f', '#7fd4ff', '#a79bff'], ac = new Float32Array(arc.attributes.position.count * 3), tmpc = new THREE.Color();
  for (let i = 0; i < arc.attributes.position.count; i++) {
    const r = Math.hypot(arc.attributes.position.getX(i), arc.attributes.position.getY(i)), k = clamp01((r - 4.3) / 0.9);
    tmpc.set(bands[Math.min(5, Math.floor(k * 5.999))]); ac[i * 3] = tmpc.r; ac[i * 3 + 1] = tmpc.g; ac[i * 3 + 2] = tmpc.b;
  }
  arc.setAttribute('color', new THREE.BufferAttribute(ac, 3));
  const rainbowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const rainbow = new THREE.Mesh(arc, rainbowMat);
  rainbow.name = 'ember-falls-rainbow'; rainbow.frustumCulled = false; rainbow.renderOrder = 5;
  { const p = wp(landS + 2.6, 0, D.pool.y + 0.4); rainbow.position.set(p[0], p[1], p[2]); rainbow.rotation.y = Math.PI / 2 - D.angle; }
  group.add(rainbow);
  disposers.push(() => { arc.dispose(); rainbowMat.dispose(); });

  // ---- far version: one white streak down the slope + the curtain, so the fall reads from the home island ----------------------------------------------------
  const fp = [], fi = [];
  const streak = [];
  for (let s = F.spring.s; s <= F.cascade.s1 + 1; s += 1.6) {
    const c = falls.toWorld(s, s > falls.sOut ? falls.cascadeCentre(s) : 0), y = Math.max(mod.height(c.x, c.z), s < F.slab.s1 ? F.slab.y : 0) + 0.9;
    streak.push({ x: c.x, y, z: c.z });
  }
  streak.forEach((p, i) => { const u = falls.frame(p.x, p.z).u; const a = falls.toWorld(falls.frame(p.x, p.z).s, u - 0.9), b = falls.toWorld(falls.frame(p.x, p.z).s, u + 0.9); fp.push(a.x, p.y, a.z, b.x, p.y, b.z); if (i) { const k = i * 2; fi.push(k - 2, k - 1, k, k - 1, k + 1, k); } });
  const base = fp.length / 3;
  for (let i = 0; i <= ROWS; i++) {
    const row = sheetPts[i];
    fp.push(...wp(row.s, -1.4, row.y), ...wp(row.s, 1.4, row.y));
    if (i) { const k = base + i * 2; fi.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const farGeo = new THREE.BufferGeometry();
  farGeo.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
  farGeo.setIndex(fi);
  const farMat = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, fog: true });
  const farMesh = new THREE.Mesh(farGeo, farMat);
  farMesh.name = 'ember-falls-streak'; farMesh.frustumCulled = false;
  far.add(farMesh);
  disposers.push(() => { farGeo.dispose(); farMat.dispose(); });

  const dayCol = new THREE.Color('#ffffff'), nightCol = new THREE.Color('#8e9bc4');
  return {
    group, far,
    update() {
      const n = waterUniforms.uNight.value;
      farMat.color.copy(dayCol).lerp(nightCol, n);
      rainbow.visible = n < 0.6;
      rainbowMat.opacity = 0.11 * (1 - n / 0.6);
    },
    summary() { return { drawCalls: 6, ribbonVerts: stats.verts, sheetRows: ROWS, ledgeSpot: D.ledgeSpot, pool: { x: +D.pool.x.toFixed(2), z: +D.pool.z.toFixed(2), y: D.pool.y } }; },
    dispose() {
      for (const d of disposers) d();
      group.removeFromParent(); far.removeFromParent();
    },
  };
}
