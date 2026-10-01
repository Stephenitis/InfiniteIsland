// Ocean + pond + stream water, for the whole archipelago (Step 27a).
//
// The ocean is one big sea at WATER_LEVEL. Its shader looks up a baked height texture of the terrain (see bakeHeightTexture) to
// get the water depth under every pixel: depth drives the shallow->deep colour bands, transparency near the shore and the animated
// toon foam lines. Because the pond / lagoon basins are carved below WATER_LEVEL they are filled by the very same plane (and get
// their own foam rim for free). The stream sits above sea level on the meadow, so it gets its own flowing ribbon mesh (buildStream).
//
// Several islands: every island in config ISLANDS gets ITS OWN baked patch (a texture over its terrain mesh square; home's is the
// same 150 u / 384 px bake as before). The ocean fragment shader picks the patch whose square contains the pixel (outside every
// square = deep water). The gently waving, finely tessellated "inner" plane is one rectangle per island (they tile without
// overlapping, so alpha never double-blends; home's is the original 240 u square) and the wave amplitude fades out with the
// distance to the nearest island centre. One huge flat outer plane, re-centred on the archipelago, reaches the horizon and leaves a
// hole where the inner rectangles draw.
import * as THREE from 'three';
import { PALETTE, WATER_LEVEL, WORLD_SIZE, ISLANDS, ISLAND_MESH_MARGIN } from '../config.js';
import { getHeight, getTerrainHeight, STREAM_PATH, STREAM_HALF_WIDTH } from './terrain.js';

const HEIGHT_TEX_SIZE = 384;      // home's patch: 150 u -> 0.39 u per texel (unchanged)
const ISLAND_TEX_SIZE = 320;      // big islands: 244 u -> 0.76 u per texel
const OCEAN_PAD = 450;           // outer plane reaches this far past the outermost island square (fog hides the edge by 330 u)
const INNER_SIZE = 240;          // home's finely tessellated plane (waves); every other island gets a rectangle like it

/** Terrain square covered by an island's height patch: home is the original 150 u square, the others radius + mesh margin. */
function patchOf(island) {
  const half = island.id === 'home' ? WORLD_SIZE / 2 : island.radius + ISLAND_MESH_MARGIN;
  return { cx: island.x, cz: island.z, half, id: island.id };
}

/** Bake terrain height over an island's square into a half-float texture (linear filtered). */
function bakeHeightTexture({ cx, cz, half, id }) {
  const n = id === 'home' ? HEIGHT_TEX_SIZE : ISLAND_TEX_SIZE;
  const data = new Uint16Array(n * n);
  const size = half * 2;
  for (let j = 0; j < n; j++) {
    const z = cz - half + ((j + 0.5) / n) * size;
    for (let i = 0; i < n; i++) {
      const x = cx - half + ((i + 0.5) / n) * size;
      data[j * n + i] = THREE.DataUtils.toHalfFloat(getTerrainHeight(x, z));
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

/**
 * Inner (waved) plane rectangles {x0, x1, z0, z1}, one per island, tiling without overlap. Home is the original +-120 square;
 * the others start as radius + 40 squares and are trimmed on the side facing an earlier rectangle.
 */
function computeInnerRects() {
  const rects = [];
  for (const island of ISLANDS) {
    const h = island.id === 'home' ? INNER_SIZE / 2 : island.radius + 40;
    const r = { x0: island.x - h, x1: island.x + h, z0: island.z - h, z1: island.z + h, cx: island.x, cz: island.z };
    for (const o of rects) {
      if (Math.min(r.x1, o.x1) <= Math.max(r.x0, o.x0) || Math.min(r.z1, o.z1) <= Math.max(r.z0, o.z0)) continue;   // no overlap
      if (Math.abs(r.cx - o.cx) > Math.abs(r.cz - o.cz)) { if (r.cx > o.cx) r.x0 = o.x1; else r.x1 = o.x0; }
      else if (r.cz > o.cz) r.z0 = o.z1; else r.z1 = o.z0;
    }
    rects.push(r);
  }
  return rects;
}

/** Ocean vertex shader for `n` islands: waves fade with the distance to the nearest island (uFade[i] = cx, cz, start, end). */
function oceanVert(n) {
  return /* glsl */`
  #include <common>
  #include <fog_pars_vertex>
  #define N_ISLANDS ${n}
  uniform float uTime;
  uniform float uWaveAmp;
  uniform vec4 uFade[N_ISLANDS];
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float fade = 0.0;
    for (int k = 0; k < N_ISLANDS; k++) {
      fade = max(fade, 1.0 - smoothstep(uFade[k].z, uFade[k].w, length(wp.xz - uFade[k].xy)));
    }
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
}

/**
 * Ocean fragment shader for `n` islands. Island i has a height patch (uHeight<i>) over the square uRect<i> = (cx, cz, half, -);
 * the pixel's depth comes from the patch that contains it, else it is open deep water. The outer plane discards where one of its
 * uHole rectangles (minX, minZ, maxX, maxZ) lies, because an inner plane draws there.
 */
function oceanFrag(n) {
  let decl = '';
  let pick = '';
  for (let i = 0; i < n; i++) {
    decl += `
  uniform sampler2D uHeight${i};
  uniform vec4 uRect${i};
  float tap${i}(vec2 p) { return texture2D(uHeight${i}, clamp((p - uRect${i}.xy) / (2.0 * uRect${i}.z) + 0.5, 0.0, 1.0)).r; }
  bool in${i}(vec2 p) { vec2 q = (p - uRect${i}.xy) / (2.0 * uRect${i}.z) + 0.5; return q.x >= 0.0 && q.x <= 1.0 && q.y >= 0.0 && q.y <= 1.0; }`;
    pick += `${i ? ' else ' : ''}if (in${i}(p)) {
      inside = 1.0;
      terrainH = tap${i}(p);
      hx = tap${i}(p + vec2(epsW, 0.0)) - tap${i}(p - vec2(epsW, 0.0));
      hz = tap${i}(p + vec2(0.0, epsW)) - tap${i}(p - vec2(0.0, epsW));
    }`;
  }
  return /* glsl */`
  #include <common>
  #include <fog_pars_fragment>
  #define N_ISLANDS ${n}
  uniform float uLevel;
  uniform float uTime;
  uniform vec4 uHole[N_ISLANDS];
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uFoam;
  uniform vec3 uShallowTint;
  uniform vec3 uDeepTint;
  uniform vec3 uFoamTint;
  uniform float uNight;
  varying vec3 vWorld;
  ${decl}

  void main() {
    // The outer plane leaves holes where the (waved) inner planes draw, to avoid double blending.
    for (int k = 0; k < N_ISLANDS; k++) {
      if (vWorld.x > uHole[k].x && vWorld.x < uHole[k].z && vWorld.z > uHole[k].y && vWorld.z < uHole[k].w) discard;
    }

    vec2 p = vWorld.xz;
    float epsW = 0.8;
    float inside = 0.0;
    float terrainH = -3.5;
    float hx = 0.0;
    float hz = 0.0;
    ${pick}
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
    // shore gradient (hx, hz above), so lines look equally wide on gentle beaches and steep pond banks.
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
}

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
 * Creates the ocean (+pond / lagoon, which are just carved parts of the terrain) and the stream ribbon.
 * Returns { group, heightTexture (home's patch), heightTextures: {islandId: texture}, setTimeOfDay(clock), update(t) } where t is elapsed seconds.
 */
export function createWater() {
  const group = new THREE.Group();
  group.name = 'water';

  const n = ISLANDS.length;
  const patches = ISLANDS.map(patchOf);
  const heightTexs = patches.map(bakeHeightTexture);
  const rects = computeInnerRects();
  const shared = {
    uTime: { value: 0 },
    uFoam: { value: new THREE.Color('#ffffff') },
    uShallowTint: { value: new THREE.Color('#ffffff') },
    uDeepTint: { value: new THREE.Color('#ffffff') },
    uFoamTint: { value: new THREE.Color('#ffffff') },
    uNight: { value: 0 },
  };
  // Wave fade per island: home keeps its original 80..105 u falloff (radius + 25 .. radius + 50), the big islands radius + 10 .. + 35
  // so the waves are gone before the edge of their inner rectangle.
  const fade = ISLANDS.map((i) => (i.id === 'home'
    ? new THREE.Vector4(i.x, i.z, i.radius + 25, i.radius + 50)
    : new THREE.Vector4(i.x, i.z, i.radius + 10, i.radius + 35)));
  const rectUniforms = patches.map((pt) => new THREE.Vector4(pt.cx, pt.cz, pt.half, 0));
  const NO_HOLE = () => ISLANDS.map(() => new THREE.Vector4(1, 1, -1, -1));
  const vert = oceanVert(n), frag = oceanFrag(n);

  function makeOceanMaterial(holes, waveAmp) {
    const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uLevel: { value: WATER_LEVEL },
      uWaveAmp: { value: waveAmp },
      uShallow: { value: new THREE.Color(PALETTE.waterShallow) },
      uDeep: { value: new THREE.Color(PALETTE.waterDeep) },
    }]);
    for (let i = 0; i < n; i++) {
      u[`uHeight${i}`] = { value: heightTexs[i] };
      u[`uRect${i}`] = { value: rectUniforms[i] };
    }
    u.uHole = { value: holes };
    u.uFade = { value: fade };
    u.uTime = shared.uTime;
    u.uFoam = shared.uFoam;
    u.uShallowTint = shared.uShallowTint;
    u.uDeepTint = shared.uDeepTint;
    u.uFoamTint = shared.uFoamTint;
    u.uNight = shared.uNight;
    return new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      fog: true,
    });
  }

  // Inner: detailed planes (one rectangle per island, 2u cells: waves are >20u long, foam is per-pixel) with gentle vertex waves.
  ISLANDS.forEach((island, i) => {
    const r = rects[i];
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    const geo = new THREE.PlaneGeometry(w, d, Math.round(w / 2), Math.round(d / 2));
    geo.rotateX(-Math.PI / 2);
    const inner = new THREE.Mesh(geo, makeOceanMaterial(NO_HOLE(), 0.05));
    inner.position.set((r.x0 + r.x1) / 2, WATER_LEVEL, (r.z0 + r.z1) / 2);
    inner.name = i === 0 ? 'ocean-inner' : `ocean-inner-${island.id}`;
    inner.renderOrder = 1;
    inner.frustumCulled = true;      // Step 27b: an inner plane off screen is skipped (its waves are far smaller than its bounds)
    group.add(inner);
  });

  // Outer: huge flat plane out to the horizon, centred on the archipelago, with a hole (1 u smaller all round) for every inner rectangle.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const pt of patches) {
    minX = Math.min(minX, pt.cx - pt.half); maxX = Math.max(maxX, pt.cx + pt.half);
    minZ = Math.min(minZ, pt.cz - pt.half); maxZ = Math.max(maxZ, pt.cz + pt.half);
  }
  const ox = (minX + maxX) / 2, oz = (minZ + maxZ) / 2;
  const oHalf = Math.max(maxX - minX, maxZ - minZ) / 2 + OCEAN_PAD;
  const outerGeo = new THREE.PlaneGeometry(oHalf * 2, oHalf * 2, 1, 1);
  outerGeo.rotateX(-Math.PI / 2);
  const holes = rects.map((r) => new THREE.Vector4(r.x0 + 1, r.z0 + 1, r.x1 - 1, r.z1 - 1));
  const outer = new THREE.Mesh(outerGeo, makeOceanMaterial(holes, 0));
  outer.position.set(ox, WATER_LEVEL - 0.02, oz);
  outer.name = 'ocean-outer';
  outer.frustumCulled = false;
  group.add(outer);

  const stream = buildStream(shared);
  stream.renderOrder = 2;
  group.add(stream);

  const heightTextures = {};
  ISLANDS.forEach((island, i) => { heightTextures[island.id] = heightTexs[i]; });
  return {
    group,
    heightTexture: heightTexs[0],
    heightTextures,
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
