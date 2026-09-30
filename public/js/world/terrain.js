// Island terrain: a pure, deterministic height function + a vertex-colored toon mesh built from it.
//
// Layout (world units, island centred on the origin, +Z is "south"/towards the default camera):
//   * beach ring   (height ~0.3)  – sand, dips into the sea
//   * meadow       (height ~1.5)  – grass
//   * plateau      (height ~3.5)  – north-west, steep dirt cliffs with two explicit walkable ramps
//   * pond         – basin carved below WATER_LEVEL so the single ocean plane fills it
//   * stream       – shallow channel from the plateau foot down to the pond (has its own ribbon mesh, see water.js)
import * as THREE from 'three';
import { createNoise2D, fbm } from '../utils/noise.js';
import {
  PALETTE, WATER_LEVEL, ISLAND_RADIUS, WORLD_SIZE, TERRAIN_SEGMENTS, WORLD_SEED,
  HEIGHT_BEACH, HEIGHT_MEADOW, HEIGHT_PLATEAU, DEEP_WATER_BLOCK,
} from '../config.js';
import { getGradientMap } from '../render/toon.js';

export { ISLAND_RADIUS };

// ---------------------------------------------------------------------------------------------
// Layout constants (exported so props / water / player code can reason about the same features)
// ---------------------------------------------------------------------------------------------
export const SPAWN = { x: 2, z: 12 };
export const POND = { x: 20, z: 8, rx: 4.8, rz: 4.0 };          // approximate water outline
export const PLATEAU = { x: -10, z: -24, radius: 15 };
export const RAMP_ANGLES = [1.45, Math.PI];                     // where the plateau ramps leave the plateau (radians, atan2(dz,dx))
export const POND_BOTTOM = -0.8;
export const MAX_WALK_SLOPE = 0.8;                               // gradient (rise/run) above which ground is "cliff"

const STREAM_HALF_WIDTH = 1.3;
const STREAM_DEPTH = 0.5;

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

const nA = createNoise2D(WORLD_SEED);
const nB = createNoise2D(WORLD_SEED + 7);

// ---------------------------------------------------------------------------------------------
// Stream path (Catmull-Rom through control points, sampled ~1u apart)
// ---------------------------------------------------------------------------------------------
const STREAM_CONTROL = [
  [0.4, -12.2], [3.0, -8.0], [5.0, -4.0], [5.5, 0.5], [9.0, 4.0], [13.0, 6.0], [17.5, 7.6],
];

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function buildStreamPath() {
  const c = STREAM_CONTROL;
  const pts = [];
  for (let i = 0; i < c.length - 1; i++) {
    const p0 = c[Math.max(0, i - 1)], p1 = c[i], p2 = c[i + 1], p3 = c[Math.min(c.length - 1, i + 2)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.round(len));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      pts.push({ x: catmull(p0[0], p1[0], p2[0], p3[0], t), z: catmull(p0[1], p1[1], p2[1], p3[1], t) });
    }
  }
  const last = c[c.length - 1];
  pts.push({ x: last[0], z: last[1] });
  return pts;
}

/** Dense polyline (~1u spacing) running from the plateau foot down to the pond. */
export const STREAM_PATH = buildStreamPath();
export { STREAM_HALF_WIDTH };

const STREAM_BOUNDS = (() => {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of STREAM_PATH) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const m = 4;
  return { minX: minX - m, maxX: maxX + m, minZ: minZ - m, maxZ: maxZ + m };
})();

/** Distance from (x,z) to the stream centre line (Infinity when far away). */
export function streamDistance(x, z) {
  const b = STREAM_BOUNDS;
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return Infinity;
  let best = Infinity;
  for (let i = 0; i < STREAM_PATH.length - 1; i++) {
    const a = STREAM_PATH[i], c = STREAM_PATH[i + 1];
    const abx = c.x - a.x, abz = c.z - a.z;
    const t = clamp01(((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz));
    const dx = x - (a.x + abx * t), dz = z - (a.z + abz * t);
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// ---------------------------------------------------------------------------------------------
// Height field
// ---------------------------------------------------------------------------------------------
/** Distance "inland" from the (irregular) coastline: positive on land, negative at sea. */
export function inlandDistance(x, z) {
  const r = Math.hypot(x, z);
  const a = Math.atan2(z, x);
  const ca = Math.cos(a), sa = Math.sin(a);
  const R = ISLAND_RADIUS - 2
    + 4.0 * nA(ca * 1.2 + 3, sa * 1.2 + 3)
    + 1.8 * nA(ca * 2.9 + 11, sa * 2.9 - 5);
  return R - r + 2.0 * nB(x * 0.05, z * 0.05);
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/** How strongly (0..1) the point lies in one of the explicit ramp wedges of the plateau. */
function rampMask(x, z) {
  const a = Math.atan2(z - PLATEAU.z, x - PLATEAU.x);
  let m = 0;
  for (const ra of RAMP_ANGLES) m = Math.max(m, 1 - sstep(0.24, 0.5, angleDiff(a, ra)));
  return m;
}

/** Pure, deterministic terrain height. Sea floor is about -3, beach 0.3, meadow 1.5, plateau 3.5. */
export function getHeight(x, z) {
  const t = inlandDistance(x, z);

  // Beach shelf that dips into the sea, then the soft ramp up to the meadow.
  let h = -3 + (HEIGHT_BEACH + 3) * sstep(-6, 4.5, t);
  h += (HEIGHT_MEADOW - HEIGHT_BEACH) * sstep(9, 13.5, t);

  // Plateau: cliff edge is narrow, but inside the ramp wedges the transition is stretched out (walkable).
  const dxp = x - PLATEAU.x, dzp = z - PLATEAU.z;
  const pf = PLATEAU.radius - Math.hypot(dxp, dzp) + 2.6 * nB(x * 0.06 + 20, z * 0.06 - 9);
  if (pf > 0) {
    const edgeW = 2.4 + 7.4 * rampMask(x, z);
    h += (HEIGHT_PLATEAU - HEIGHT_MEADOW) * sstep(0, edgeW, pf);
  }

  // Gentle rolling detail on land only
  h += sstep(8, 14, t) * 0.3 * fbm(x * 0.045, z * 0.045, 3, 2, 0.5, nB);

  // Flat spot around the spawn
  const ds = Math.hypot(x - SPAWN.x, z - SPAWN.z);
  if (ds < 10) h = lerp(h, HEIGHT_MEADOW, 1 - sstep(4, 10, ds));

  // Pond basin (dips below WATER_LEVEL so the ocean plane fills it)
  const pd = Math.hypot((x - POND.x) / 1.2, z - POND.z) + 0.5 * nB(x * 0.25 + 5, z * 0.25);
  if (pd < 8.5) h = lerp(h, POND_BOTTOM, 1 - sstep(2.2, 8.4, pd));

  // Stream channel
  const sd = streamDistance(x, z);
  if (sd < 2.7) h -= STREAM_DEPTH * (1 - sstep(0.7, 2.6, sd));

  return h;
}

/** Steepness (rise over run) via central differences. */
export function getSlope(x, z, e = 0.5) {
  const gx = (getHeight(x + e, z) - getHeight(x - e, z)) / (2 * e);
  const gz = (getHeight(x, z + e) - getHeight(x, z - e)) / (2 * e);
  return Math.hypot(gx, gz);
}

/** 'sand' | 'grass' | 'dirt' | 'water' | 'wetsand' */
export function getGroundType(x, z) {
  const h = getHeight(x, z);
  if (h < WATER_LEVEL - 0.03) return 'water';
  if (streamDistance(x, z) < STREAM_HALF_WIDTH * 0.85) return 'water';
  if (h < WATER_LEVEL + 0.2) return 'wetsand';
  if (h > 0.5 && getSlope(x, z) > 0.6) return 'dirt';
  if (inlandDistance(x, z) < 10.5) return 'sand';
  return 'grass';
}

/** Walkable = not deep water and not a cliff face. */
export function isWalkable(x, z) {
  if (getHeight(x, z) < WATER_LEVEL - DEEP_WATER_BLOCK) return false;
  return getSlope(x, z, 0.4) < MAX_WALK_SLOPE;
}

// ---------------------------------------------------------------------------------------------
// Mesh
// ---------------------------------------------------------------------------------------------

function makeTerrainMaterial() {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: getGradientMap() });
  const darkRatio = new THREE.Color(PALETTE.grassDark);
  const light = new THREE.Color(PALETTE.grassLight);
  darkRatio.set(darkRatio.r / light.r, darkRatio.g / light.g, darkRatio.b / light.b);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGrassDark = { value: new THREE.Vector3(darkRatio.r, darkRatio.g, darkRatio.b) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aGrass;
        varying float vGrass;
        varying vec3 vWPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vGrass = aGrass;
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uGrassDark;
        varying float vGrass;
        varying vec3 vWPos;
        float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float tVNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(tHash(i), tHash(i + vec2(1, 0)), f.x), mix(tHash(i + vec2(0, 1)), tHash(i + vec2(1, 1)), f.x), f.y);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 gp = vWPos.xz;
          float n = tVNoise(gp * 0.17) * 0.65 + tVNoise(gp * 0.43 + 7.0) * 0.35;
          float w = fwidth(n) * 1.2 + 0.006;
          float blotch = smoothstep(0.5 - w, 0.5 + w, n);
          vec2 cell = floor(gp / 4.0);
          float checker = mod(cell.x + cell.y, 2.0);
          diffuseColor.rgb *= mix(vec3(1.0), uGrassDark, blotch * vGrass);
          diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(1.0), uGrassDark, 0.3), checker * vGrass);
        }`);
  };
  return mat;
}

export function buildTerrain() {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const count = pos.count;

  const heights = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const h = getHeight(pos.getX(i), pos.getZ(i));
    heights[i] = h;
    pos.setY(i, h);
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;

  const cLight = new THREE.Color(PALETTE.grassLight);
  const cDark = new THREE.Color(PALETTE.grassDark);
  const cPlateau = new THREE.Color('#b4f27a');
  const cSand = new THREE.Color(PALETTE.sand);
  const cSandLight = new THREE.Color('#fff2c4');
  const cWet = new THREE.Color('#f6dca0');
  const cDirt = new THREE.Color(PALETTE.dirt);
  const cDirtDark = new THREE.Color('#c48a52');
  const cSea = new THREE.Color('#5fcfd0');
  const col = new THREE.Color();
  const tmp = new THREE.Color();
  const colors = new Float32Array(count * 3);
  const grass = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = heights[i];
    const t = inlandDistance(x, z);
    const ny = Math.max(0.05, nrm.getY(i));
    const slope = Math.sqrt(1 - ny * ny) / ny;

    // Grass colour = light grass; the two-tone blotch/checker pattern is added per pixel in the shader (grassW).
    col.copy(cLight);
    col.lerp(tmp.copy(cPlateau), sstep(2.3, 3.4, h) * 0.55);
    let grassW = 1;

    // Sand ring
    const sandM = 1 - sstep(10.0, 11.0, t);
    tmp.copy(cSand).lerp(cSandLight, sstep(-0.1, 0.1, nB(x * 0.12 + 50, z * 0.12 - 30)) * 0.7);
    col.lerp(tmp, sandM);
    grassW *= 1 - sandM;

    // Cliff dirt
    const dirtM = sstep(0.38, 0.62, slope) * sstep(0.4, 0.9, h)
      * (1 - sstep(PLATEAU.radius + 4, PLATEAU.radius + 9, Math.hypot(x - PLATEAU.x, z - PLATEAU.z)));
    if (dirtM > 0) {
      tmp.copy(cDirt).lerp(cDirtDark, sstep(-0.2, 0.3, nB(x * 0.5, z * 0.5)));
      col.lerp(tmp, dirtM);
      grassW *= 1 - dirtM;
    }

    // Wet sand at the waterline, tinting to sea floor colour below the water
    const wetM = 1 - sstep(0.03, 0.22, h);
    col.lerp(cWet, wetM);
    const seaM = sstep(-0.1, -2.6, h) * 0.85;
    col.lerp(cSea, seaM);
    grassW *= (1 - wetM) * (1 - seaM);
    grass[i] = grassW;

    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aGrass', new THREE.BufferAttribute(grass, 1));

  // Split into a grid of chunks that share the vertex buffers but each own an index range + tight bounding sphere,
  // so frustum culling (camera AND sun shadow camera) drops the ~80% of the terrain that is off-screen.
  const mat = makeTerrainMaterial();
  const group = new THREE.Group();
  group.name = 'terrain';
  const N = TERRAIN_SEGMENTS;
  const CH = 8;                          // chunks per side
  const per = N / CH;
  const src = geo.index.array;
  const cellsPerRow = N;                 // PlaneGeometry emits 6 indices per quad, row-major
  const box = new THREE.Box3();
  for (let cj = 0; cj < CH; cj++) {
    for (let ci = 0; ci < CH; ci++) {
      const idx = new src.constructor(per * per * 6);
      let o = 0;
      for (let y = 0; y < per; y++) {
        const q0 = (cj * per + y) * cellsPerRow + ci * per;
        idx.set(src.subarray(q0 * 6, (q0 + per) * 6), o);
        o += per * 6;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', geo.attributes.position);
      g.setAttribute('normal', geo.attributes.normal);
      g.setAttribute('uv', geo.attributes.uv);
      g.setAttribute('color', geo.attributes.color);
      g.setAttribute('aGrass', geo.attributes.aGrass);
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      box.makeEmpty();
      const stride = N + 1;
      let minY = Infinity, maxY = -Infinity;
      for (let y = cj * per; y <= (cj + 1) * per; y++) {
        for (let x = ci * per; x <= (ci + 1) * per; x++) {
          const h = heights[y * stride + x];
          if (h < minY) minY = h;
          if (h > maxY) maxY = h;
        }
      }
      const step = WORLD_SIZE / CH;
      const x0 = -WORLD_SIZE / 2 + ci * step, z0 = -WORLD_SIZE / 2 + cj * step;
      box.set(new THREE.Vector3(x0, minY, z0), new THREE.Vector3(x0 + step, maxY, z0 + step));
      g.boundingBox = box.clone();
      g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = 'terrain-chunk';
      mesh.receiveShadow = true;
      mesh.castShadow = true;   // plateau shades the meadow
      group.add(mesh);
    }
  }
  return group;
}
