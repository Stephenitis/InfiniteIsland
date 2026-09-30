// Ocean + pond + stream water.
//
// The ocean is a single big plane at WATER_LEVEL. Its shader looks up a baked height texture of the terrain
// (see bakeHeightTexture) to get the water depth under every pixel: depth drives the shallow->deep colour bands,
// transparency near the shore and the animated toon foam lines. Because the pond basin is carved below
// WATER_LEVEL it is filled by the very same plane (and gets its own foam rim for free).
// The stream sits above sea level on the meadow, so it gets its own flowing ribbon mesh (buildStream).
import * as THREE from 'three';
import { PALETTE, WATER_LEVEL, WORLD_SIZE } from '../config.js';
import { getHeight, STREAM_PATH, STREAM_HALF_WIDTH } from './terrain.js';

const HEIGHT_TEX_SIZE = 384;
const OCEAN_HALF_EXTENT = 500;   // 1000u plane; fully fogged to the horizon colour well before the edge
const INNER_SIZE = 240;          // finely tessellated central plane (waves); outer plane is flat

/** Bake terrain height over the terrain footprint into a half-float texture (linear filtered). */
function bakeHeightTexture() {
  const n = HEIGHT_TEX_SIZE;
  const half = WORLD_SIZE / 2;
  const data = new Uint16Array(n * n);
  for (let j = 0; j < n; j++) {
    const z = -half + ((j + 0.5) / n) * WORLD_SIZE;
    for (let i = 0; i < n; i++) {
      const x = -half + ((i + 0.5) / n) * WORLD_SIZE;
      data[j * n + i] = THREE.DataUtils.toHalfFloat(getHeight(x, z));
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const OCEAN_VERT = /* glsl */`
  #include <common>
  #include <fog_pars_vertex>
  uniform float uTime;
  uniform float uWaveAmp;
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float fade = 1.0 - smoothstep(80.0, 105.0, length(wp.xz));
    float w = sin(wp.x * 0.30 + uTime * 0.8)
            + sin(wp.z * 0.26 - uTime * 0.6)
            + sin((wp.x + wp.z) * 0.17 + uTime * 0.5);
    wp.y += uWaveAmp * w * fade;
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const OCEAN_FRAG = /* glsl */`
  #include <common>
  #include <fog_pars_fragment>
  uniform sampler2D uHeight;
  uniform float uHalfExtent;
  uniform float uLevel;
  uniform float uTime;
  uniform float uCut;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uFoam;
  uniform vec3 uShallowTint;
  uniform vec3 uDeepTint;
  uniform vec3 uFoamTint;
  uniform float uNight;
  varying vec3 vWorld;

  void main() {
    // The outer plane leaves a hole where the (waved) inner plane draws, to avoid double blending.
    if (uCut > 0.0 && abs(vWorld.x) < uCut && abs(vWorld.z) < uCut) discard;

    vec2 uv = (vWorld.xz + uHalfExtent) / (2.0 * uHalfExtent);
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    float terrainH = mix(-3.5, texture2D(uHeight, clamp(uv, 0.0, 1.0)).r, inside);
    float depth = uLevel - terrainH;
    if (depth < -0.06) discard;

    // Wobbly depth so the foam line wiggles along the shore
    float wob = 0.07 * sin(vWorld.x * 0.9 + uTime * 1.1) * sin(vWorld.z * 0.8 - uTime * 0.9)
              + 0.04 * sin((vWorld.x - vWorld.z) * 1.7 + uTime * 1.6);
    float d = depth + wob;

    // Banded (toon) shallow -> deep colour
    float deepT = smoothstep(0.0, 3.0, depth);
    deepT = floor(deepT * 5.0 + 0.5) / 5.0;
    vec3 col = mix(uShallow * uShallowTint, uDeep * uDeepTint, deepT);

    // Soft lighter wave streaks on open water
    float streak = sin(vWorld.x * 0.55 + vWorld.z * 0.35 + uTime * 0.7 + 2.5 * sin(vWorld.z * 0.21 + uTime * 0.35));
    col += 0.03 * (1.0 - uNight * 0.65) * step(0.94, streak) * deepT;

    // Foam: thickness/travel are specified in world units and converted to depth units with the local
    // shore gradient, so lines look equally wide on gentle beaches and steep pond banks.
    float epsW = 0.8;
    float du = epsW / (2.0 * uHalfExtent);
    float hx = texture2D(uHeight, clamp(uv + vec2(du, 0.0), 0.0, 1.0)).r
             - texture2D(uHeight, clamp(uv - vec2(du, 0.0), 0.0, 1.0)).r;
    float hz = texture2D(uHeight, clamp(uv + vec2(0.0, du), 0.0, 1.0)).r
             - texture2D(uHeight, clamp(uv - vec2(0.0, du), 0.0, 1.0)).r;
    float g = clamp(length(vec2(hx, hz)) / (2.0 * epsW), 0.06, 0.7) * inside + (1.0 - inside) * 0.2;
    float rim = 1.0 - step(0.34 * g, d);
    float p1 = g * (1.4 + 1.1 * sin(uTime * 1.15));
    float p2 = g * (3.6 + 1.3 * sin(uTime * 1.15 - 1.7));
    float line1 = 1.0 - step(0.2 * g, abs(d - p1));
    float line2 = 1.0 - step(0.14 * g, abs(d - p2));
    float foam = max(rim, max(line1, line2 * 0.85));
    col = mix(col, uFoam * uFoamTint, foam);

    float alpha = mix(0.5, 0.97, smoothstep(0.0, 1.5, depth));
    alpha = max(alpha, foam);

    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    // Extra horizon haze: linear fog alone leaves a hard blue band at grazing view angles.
    float haze = pow(smoothstep(100.0, 330.0, length(vWorld - cameraPosition)), 0.6);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, haze);
    #include <fog_fragment>
  }
`;

const STREAM_VERT = /* glsl */`
  #include <common>
  #include <fog_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const STREAM_FRAG = /* glsl */`
  #include <common>
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uFoam;
  uniform vec3 uShallowTint;
  uniform vec3 uDeepTint;
  uniform vec3 uFoamTint;
  uniform float uNight;
  varying vec2 vUv;
  void main() {
    float e = abs(vUv.x - 0.5) * 2.0;             // 0 centre .. 1 bank
    vec3 col = mix(uShallow * uShallowTint, uDeep * uDeepTint, 0.25 * (1.0 - e) + 0.05);
    float flow = sin(vUv.y * 1.6 - uTime * 2.6 + sin(vUv.x * 6.2832 + vUv.y * 0.7) * 1.3);
    col = mix(col, uFoam * uFoamTint, 0.55 * (1.0 - uNight * 0.15) * step(0.82, flow) * (1.0 - e * 0.5));
    col = mix(col, uFoam * uFoamTint, step(0.82, e));          // foamy banks
    gl_FragColor = vec4(col, 0.94);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function buildStream(uniformsShared) {
  const positions = [];
  const uvs = [];
  const indices = [];
  let dist = 0;
  let prev = null;
  let count = 0;
  for (let i = 0; i < STREAM_PATH.length; i++) {
    const p = STREAM_PATH[i];
    const h = getHeight(p.x, p.z);
    if (i > 8 && h < WATER_LEVEL - 0.12) break;    // flows into the pond
    const a = STREAM_PATH[Math.max(0, i - 1)], b = STREAM_PATH[Math.min(STREAM_PATH.length - 1, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    const nx = -tz, nz = tx;
    if (prev) dist += Math.hypot(p.x - prev.x, p.z - prev.z);
    prev = p;
    const y = Math.max(h + 0.2, WATER_LEVEL + 0.03);
    const hw = STREAM_HALF_WIDTH * 1.12 * (0.35 + 0.65 * Math.min(1, i / 4));   // tapers into a little spring
    positions.push(p.x + nx * hw, y, p.z + nz * hw, p.x - nx * hw, y, p.z - nz * hw);
    uvs.push(0, dist, 1, dist);
    if (count > 0) {
      const k = count * 2;
      indices.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
    count++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: uniformsShared.uTime,
      uShallow: { value: new THREE.Color('#7feaf2') },
      uDeep: { value: new THREE.Color(PALETTE.waterDeep) },
      uFoam: uniformsShared.uFoam,
    }]),
    vertexShader: STREAM_VERT,
    fragmentShader: STREAM_FRAG,
    transparent: true,
    side: THREE.DoubleSide,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  // merge() clones uniform objects; re-link the shared ones so a single update drives everything.
  mat.uniforms.uTime = uniformsShared.uTime;
  mat.uniforms.uFoam = uniformsShared.uFoam;
  mat.uniforms.uShallowTint = uniformsShared.uShallowTint;
  mat.uniforms.uDeepTint = uniformsShared.uDeepTint;
  mat.uniforms.uFoamTint = uniformsShared.uFoamTint;
  mat.uniforms.uNight = uniformsShared.uNight;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'stream';
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Creates the ocean (+pond, which is just a carved part of the terrain) and the stream ribbon.
 * Returns { group, update(t) } where t is elapsed seconds.
 */
export function createWater() {
  const group = new THREE.Group();
  group.name = 'water';

  const heightTex = bakeHeightTexture();
  const shared = {
    uTime: { value: 0 },
    uFoam: { value: new THREE.Color('#ffffff') },
    uShallowTint: { value: new THREE.Color('#ffffff') },
    uDeepTint: { value: new THREE.Color('#ffffff') },
    uFoamTint: { value: new THREE.Color('#ffffff') },
    uNight: { value: 0 },
  };

  function makeOceanMaterial(cut, waveAmp) {
    const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uHeight: { value: heightTex },
      uHalfExtent: { value: WORLD_SIZE / 2 },
      uLevel: { value: WATER_LEVEL },
      uCut: { value: cut },
      uWaveAmp: { value: waveAmp },
      uShallow: { value: new THREE.Color(PALETTE.waterShallow) },
      uDeep: { value: new THREE.Color(PALETTE.waterDeep) },
    }]);
    u.uTime = shared.uTime;
    u.uFoam = shared.uFoam;
    u.uShallowTint = shared.uShallowTint;
    u.uDeepTint = shared.uDeepTint;
    u.uFoamTint = shared.uFoamTint;
    u.uNight = shared.uNight;
    return new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: OCEAN_VERT,
      fragmentShader: OCEAN_FRAG,
      transparent: true,
      fog: true,
    });
  }

  // Inner: detailed plane with gentle vertex waves. Outer: huge flat plane out to the horizon.
  const innerGeo = new THREE.PlaneGeometry(INNER_SIZE, INNER_SIZE, 120, 120);   // 2u cells: waves are >20u long, foam is per-pixel
  innerGeo.rotateX(-Math.PI / 2);
  const inner = new THREE.Mesh(innerGeo, makeOceanMaterial(0, 0.05));
  inner.position.y = WATER_LEVEL;
  inner.name = 'ocean-inner';
  inner.renderOrder = 1;
  inner.frustumCulled = false;
  group.add(inner);

  const outerGeo = new THREE.PlaneGeometry(OCEAN_HALF_EXTENT * 2, OCEAN_HALF_EXTENT * 2, 1, 1);
  outerGeo.rotateX(-Math.PI / 2);
  const outer = new THREE.Mesh(outerGeo, makeOceanMaterial(INNER_SIZE / 2 - 1, 0));
  outer.position.y = WATER_LEVEL - 0.02;
  outer.name = 'ocean-outer';
  outer.frustumCulled = false;
  group.add(outer);

  const stream = buildStream(shared);
  stream.renderOrder = 2;
  group.add(stream);

  return {
    group,
    heightTexture: heightTex,
    setTimeOfDay(clock) {
      shared.uShallowTint.value.copy(clock.look.shallow);
      shared.uDeepTint.value.copy(clock.look.deep);
      shared.uFoamTint.value.copy(clock.look.foam);
      shared.uNight.value = clock.nightness;
    },
    update(t) {
      shared.uTime.value = t;
    },
  };
}
