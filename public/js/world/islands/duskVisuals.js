// Rebuildable visuals of Duskcrown's giant and titan mushrooms (Step 69c). Gameplay identity (stem colliders) lives in duskWorld.js and is registered once; this file only draws.
//
//   const v = buildDuskVisuals(island, data)   -> { group (full detail), far (one blob mesh), caps, summary(), dispose() }
//   duskFlora.update(dt, camera.position, points)   once per frame from main.js (points = the local players' chest points { x, y, z }): eases the canopy fade of every cap that covers a
//                                                    player or sits between the camera and one (rules: duskFade.js), writes it into the per-instance `iInst.x`
//   duskFlora.enabled = false  (__game.dusk.fade(false)) turns the fade off for comparison; duskFlora.settle(cam, points) jumps to the final fade at once (tests / screenshots)
//
// Cost: chunks of DUSK_FLORA.chunk (80 u) x kinds. Per chunk and kind: 1 InstancedMesh + 1 outline InstancedMesh (the hull dithers out with the cap). Plus ONE conforming light-pool mesh (additive).
// No shadow casting, no lights. TWO new shader programs: the glow / fade toon material (the pool shares its program: same code, same defines) and the dithering outline.
//
// The toon material (a patched MeshToonMaterial) reads the vertex role `aRole` (see duskAssets.js) and the per-instance `iInst` = (fade 0..1, tint 0..1):
//   * fade   -> screen-door discard for roles 1-4 (cap skin / dark gills, rim + pores, underside bulbs) with interleaved gradient noise from gl_FragCoord (no blending, no sorting); the stem (role 0) never fades;
//   * glow   -> emissive = vertex colour x per-role strength x duskUniforms.uGlow (the island's breathing 0.92 .. 1), so caps read from above even in the dim blue light;
//   * pool   -> role 6 ground discs: a warm radial falloff, additive, depth-tested, not fogged towards the fog colour (it fades out instead).
import * as THREE from 'three';
import { DUSK_FLORA, PALETTE } from '../../config.js';
import { G, part, combine, VERTEX_TOON } from '../../render/geo.js';
import { duskUniforms } from './duskAtmosphere.js';
import { getMushroom, buildPoolGeometry } from './duskAssets.js';
import { fadeRecord } from './duskPlacement.js';
import { fadeTargets, stepFade } from './duskFade.js';
import { getIslandModule } from './registry.js';
import { groupIntoChunks } from '../propChunks.js';

const GLSL_DITHER = (v) => `if (${v} > 0.001) { float dn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); if (dn < ${v} * ${DUSK_FLORA.fadeMax.toFixed(3)}) discard; }`;

export function patchToon(shader) {
  const g = DUSK_FLORA.glow;
  shader.uniforms.uGlow = duskUniforms.uGlow;
  shader.uniforms.uPool = { value: DUSK_FLORA.poolOpacity };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aRole;\nattribute vec2 iInst;\nvarying float vRole;\nvarying float vFade;\nvarying vec2 vPoolUv;')
    .replace('#include <color_vertex>', `#include <color_vertex>
  vRole = aRole;
  vFade = (aRole > 0.5 && aRole < 4.5) ? iInst.x : 0.0;
  vPoolUv = uv;
  if (aRole > 0.5 && aRole < 1.5) { vColor.r *= 0.9 + 0.2 * iInst.y; vColor.b *= 1.1 - 0.2 * iInst.y; }`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uGlow;\nuniform float uPool;\nvarying float vRole;\nvarying float vFade;\nvarying vec2 vPoolUv;')
    .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n  ${GLSL_DITHER('vFade')}`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float glowK = 0.0;
  if (vRole < 0.5) glowK = ${g.stem.toFixed(3)};
  else if (vRole > 1.5 && vRole < 2.5) glowK = ${g.spot.toFixed(3)};
  else if (vRole > 3.5 && vRole < 4.5) glowK = ${g.bulb.toFixed(3)};
  else if (vRole > 4.5 && vRole < 5.5) glowK = ${g.mini.toFixed(3)};
  totalEmissiveRadiance += vColor.rgb * glowK * uGlow;`)
    .replace('#include <opaque_fragment>', `#include <opaque_fragment>
  if (vRole > 5.5) {
    float pd = clamp(1.0 - length(vPoolUv), 0.0, 1.0);
    float pa = pd * pd;
    gl_FragColor = vec4(vColor.rgb * uPool * uGlow * 1.6 * (1.0 + 0.9 * pd * pd), pa);   // a slightly hotter core
  }`)
    .replace('#include <fog_fragment>', `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogK = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
    float fogK = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  if (vRole > 5.5) gl_FragColor.rgb *= 1.0 - fogK; else gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogK);
#endif`);
}
const toonKey = () => 'duskMush';

let solidMat = null, poolMat = null, outlineMat = null;
export function materials() {
  if (!solidMat) {
    // blending is CustomBlending (One, Zero) = an opaque replace: it only exists so three computes the same program parameters (no OPAQUE define) as the additive pool and the two share ONE program
    solidMat = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: VERTEX_TOON.gradientMap, vertexColors: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.ZeroFactor, blendEquation: THREE.AddEquation });
    solidMat.onBeforeCompile = patchToon; solidMat.customProgramCacheKey = toonKey;
    poolMat = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: VERTEX_TOON.gradientMap, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    poolMat.onBeforeCompile = patchToon; poolMat.customProgramCacheKey = toonKey;
    outlineMat = new THREE.MeshBasicMaterial({ color: PALETTE.outline, side: THREE.BackSide });
    outlineMat.onBeforeCompile = (shader) => {
      shader.uniforms.uThick = { value: DUSK_FLORA.outline };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uThick;\nattribute float aRole;\nattribute vec2 iInst;\nvarying float vFade;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normalize(normal) * uThick;\n  vFade = aRole > 0.5 ? iInst.x : 0.0;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFade;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n  ${GLSL_DITHER('vFade')}`);
    };
    outlineMat.customProgramCacheKey = () => 'duskOutlineFade';
  }
  return { solidMat, poolMat, outlineMat };
}

/** The shared canopy-fade controller: the CURRENT visuals register their cap records here (rebuild-safe: dispose() clears it). */
export const duskFlora = {
  current: null, enabled: true,
  update(dt, cam, points) { return this.current ? this.current.fadeStep(dt, cam, points, this.enabled) : 0; },
  settle(cam, points) { return this.current ? this.current.fadeStep(1e3, cam, points, this.enabled) : 0; },
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

/** A geometry sharing every attribute of `base` plus its own per-instance `iInst` (fade, tint). */
function chunkGeometry(base, inst) {
  const g = new THREE.BufferGeometry();
  for (const k in base.attributes) g.setAttribute(k, base.attributes[k]);
  if (base.index) g.setIndex(base.index);
  g.setAttribute('iInst', inst);
  g.boundingBox = base.boundingBox; g.boundingSphere = base.boundingSphere;
  return g;
}

export function buildDuskVisuals(island, data) {
  const group = new THREE.Group(), far = new THREE.Group();
  group.name = 'dusk-mushrooms'; far.name = 'dusk-far';
  const { solidMat: sm, poolMat: pm, outlineMat: om } = materials();
  const mod = getIslandModule(island.id), p = data.placement;
  const origin = { x: island.x - 200, z: island.z - 140 };
  const caps = [], meshes = [], geos = [];
  for (const kind of ['giant-a', 'giant-b', 'titan']) {
    const a = getMushroom(kind), list = p.items.filter((i) => i.kind === kind);
    for (const [key, items] of groupIntoChunks(list, origin, DUSK_FLORA.chunk)) {
      const inst = new THREE.InstancedBufferAttribute(new Float32Array(items.length * 2), 2);
      const gm = chunkGeometry(a.geo, inst), go = chunkGeometry(a.outlineGeo, inst);
      const mesh = new THREE.InstancedMesh(gm, sm, items.length), hull = new THREE.InstancedMesh(go, om, items.length);
      items.forEach((it, i) => {
        _q.setFromAxisAngle(_up, it.rot); _p.set(it.x, it.y, it.z); _s.set(it.s, it.sy, it.s);   // upright, yawed, scaled (tall giants stretch in y)
        mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
        inst.setXY(i, 0, it.tint);
        caps.push({ rec: fadeRecord(it), inst, i, cur: 0 });
      });
      mesh.instanceMatrix.needsUpdate = true;
      hull.instanceMatrix = mesh.instanceMatrix; hull.renderOrder = -1;
      for (const o of [mesh, hull]) { o.castShadow = false; o.receiveShadow = o === mesh; o.computeBoundingSphere(); o.computeBoundingBox(); }
      mesh.name = `dusk-${kind}-${key}`; hull.name = `dusk-${kind}-outline-${key}`;
      group.add(mesh, hull); meshes.push(mesh, hull); geos.push(gm, go);
    }
  }
  // ---- light pools: one conforming additive mesh (an InstancedMesh of one identity instance, so it shares the mushrooms' program)
  const poolGeo = buildPoolGeometry(p.items, (x, z) => mod.height(x, z));
  const pool = new THREE.InstancedMesh(poolGeo, pm, 1);
  pool.setMatrixAt(0, _m.identity()); pool.name = 'dusk-light-pools'; pool.castShadow = false; pool.receiveShadow = false; pool.renderOrder = 2;
  group.add(pool); geos.push(poolGeo);

  // ---- far: ONE merged blob mesh (a flat indigo cap on a pale stub) in the shared vertex toon material
  const blobs = p.items.map((it) => {
    const m = it.kind === 'titan' ? 1 : 0.8;
    return [part(G.cyl6, '#d6cff0', { p: [it.x, it.y + it.capUnder / 2 - it.y / 2, it.z], s: [it.stemR * 0.9 * m, (it.capUnder - it.y), it.stemR * 0.9 * m] }),
      part(G.ico1, '#6a6fd6', { p: [it.x, it.capUnder + (it.capTop - it.capUnder) * 0.3, it.z], s: [it.capR, (it.capTop - it.capUnder) * 0.7, it.capR] })];
  }).flat();
  const farGeo = combine(blobs);
  const farMesh = new THREE.Mesh(farGeo, VERTEX_TOON); farMesh.name = 'far-mushrooms-dusk'; farMesh.castShadow = false; farMesh.receiveShadow = false;
  far.add(farMesh);

  const targets = new Float32Array(caps.length), recs = caps.map((c) => c.rec);
  const api = {
    group, far, caps,
    /** Ease every cap's fade towards its target; returns how many caps are (partly) faded. */
    fadeStep(dt, cam, points, enabled) {
      if (!group.parent || !group.parent.visible) return 0;
      if (enabled && points.length) fadeTargets(recs, cam, points, undefined, targets); else targets.fill(0);
      let faded = 0;
      const dirty = new Set();
      for (let k = 0; k < caps.length; k++) {
        const c = caps[k], next = stepFade(c.cur, targets[k], dt);
        if (next !== c.cur) { c.cur = next; c.inst.setX(c.i, next); dirty.add(c.inst); }
        if (c.cur > 0.001) faded++;
      }
      for (const a of dirty) a.needsUpdate = true;
      return faded;
    },
    summary() {
      const per = {};
      for (const m of meshes) if (!m.name.includes('outline')) per[m.name] = m.count;
      return { items: p.items.length, caps: caps.length, faded: caps.filter((c) => c.cur > 0.001).length, meshes: meshes.length, drawCalls: meshes.length + 1, chunks: per };
    },
    dispose() {
      if (duskFlora.current === api) duskFlora.current = null;
      for (const m of meshes) m.dispose();
      pool.dispose(); for (const g of geos) g.dispose(); farGeo.dispose();
      group.removeFromParent(); far.removeFromParent();
    },
  };
  duskFlora.current = api;
  return api;
}
