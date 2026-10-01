// PLACEHOLDER biomes for the two big islands (Step 27b), so their silhouettes read from home and the first visit is not an empty plain:
//   Frostpine: ~230 chunky pine trees (stacked cones, snow-capped on the high ground)      Emberleaf: ~170 palms + broad-leaf jungle trees,
//   plus a smoke plume drifting up from the volcano crater (one draw call, visible from the far version too).
// Steps 29 (Frostpine) and 30 (Emberleaf) REPLACE all of this with the real biome content (colliders, interactables, harvest ...); these
// trees are decorative only: no colliders, no interactables, never saved or synced.
//
// Same split as the rest of the world (PLAN "Scaling"):
//   buildTeaserData(island)              -> { layers: { kind: [item] }, smoke? }   GAMEPLAY-side data: deterministic from island.seed, cheap,
//                                           computed once per island (cached); the placements live here so a visuals rebuild cannot move a tree.
//   buildTeaserVisuals(island, data)     -> { group, far, always, update(t), dispose(), summary() }
//                                           group = chunked instanced layers (full detail), far = ONE merged blob mesh (far version),
//                                           always = the smoke plume (drawn in both modes).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BRIDGES, ISLAND_MESH_MARGIN } from '../../config.js';
import { mulberry32, range } from '../../utils/rng.js';
import { createNoise2D } from '../../utils/noise.js';
import { toonMat } from '../../render/toon.js';
import { part, combine, smoothOutlineGeo } from '../props.js';
import { buildChunkedLayer } from '../propChunks.js';
import { getIslandModule } from './registry.js';
import { FROST_FEATURES } from './frost.js';
import { EMBER_FEATURES } from './ember.js';
import { sstep, angleDiff } from './util.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------
// Placement (gameplay-side data)
// ---------------------------------------------------------------------------------------------
const RING = [0, 1, 2, 3, 4, 5].map((i) => [Math.cos((i / 6) * TAU) * 2.0, Math.sin((i / 6) * TAU) * 2.0]);

/**
 * Rejection-sample up to `target` spots on the island: `accept(x, z)` returns a kind string or null. Spots keep `minDist` apart (hash grid).
 * Pure + seeded, so every screen gets the same trees.
 */
function scatter(island, { seed, target, minDist, tries, accept }) {
  const rng = mulberry32(seed);
  const half = island.radius + ISLAND_MESH_MARGIN - 6;
  const cell = minDist;
  const grid = new Map();
  const out = [];
  for (let t = 0; t < tries && out.length < target; t++) {
    const x = island.x + (rng() * 2 - 1) * half, z = island.z + (rng() * 2 - 1) * half;
    const kind = accept(x, z, rng);
    if (!kind) continue;
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    let clear = true;
    for (let i = cx - 1; i <= cx + 1 && clear; i++) {
      for (let j = cz - 1; j <= cz + 1 && clear; j++) {
        const l = grid.get(i * 73856093 ^ j * 19349663);
        if (l) for (const o of l) if ((o.x - x) ** 2 + (o.z - z) ** 2 < minDist * minDist) { clear = false; break; }
      }
    }
    if (!clear) continue;
    const key = cx * 73856093 ^ cz * 19349663;
    const item = { x, z, kind };
    (grid.get(key) || grid.set(key, []).get(key)).push(item);
    out.push(item);
  }
  return out;
}

/** True if the point is flat enough and every ring point around it is allowed ground at about the same height (keeps trees off shores, ramps, ice, lava). */
function safeSpot(mod, x, z, h, types, maxSlope) {
  const e = 0.8;
  if (Math.hypot((mod.height(x + e, z) - h) / e, (mod.height(x, z + e) - h) / e) > maxSlope) return false;
  for (const [ox, oz] of RING) {
    const px = x + ox, pz = z + oz, ph = mod.height(px, pz);
    if (Math.abs(ph - h) > 0.5 || !types.includes(mod.groundType(px, pz))) return false;
    if (Math.hypot((mod.height(px + e, pz) - ph) / e, (mod.height(px, pz + e) - ph) / e) > maxSlope + 0.1) return false;
  }
  return true;
}

/** Distance from (x, z) to the far landing of the bridge that ends on this island (placeholders keep 11 u clear of it). */
function landingFor(island) {
  const b = BRIDGES.find((e) => e.to === island.id);
  return b ? { x: b.bx, z: b.bz } : null;
}

function frostData(island, mod) {
  const F = FROST_FEATURES, cx = island.x, cz = island.z;
  const landing = landingFor(island);
  const cluster = createNoise2D(island.seed + 500);
  const nearRamp = (x, z) => {                              // keep the three plateau ramps (and the cliff foot in front of them) clear
    const dx = x - cx - F.plateau.x, dz = z - cz - F.plateau.z, d = Math.hypot(dx, dz);
    if (d < F.plateau.r - 24 || d > F.plateau.r + 18) return false;
    const a = Math.atan2(dz, dx);
    return F.rampAngles.some((ra) => angleDiff(a, ra) < 0.5);
  };
  const items = scatter(island, {
    seed: island.seed + 777, target: 230, minDist: 4.4, tries: 26000,
    accept(x, z, rng) {
      if (landing && Math.hypot(x - landing.x, z - landing.z) < 11) return null;
      if (cluster(x * 0.045, z * 0.045) * 0.5 + 0.5 < 0.28 + 0.3 * rng()) return null;     // forest clumps with clearings between
      if (mod.inland(x, z) < 13) return null;                                                // not on the beach tier
      const h = mod.height(x, z);
      if (h < 1.0 || h > 9.0 || nearRamp(x, z)) return null;
      if (!safeSpot(mod, x, z, h, ['grass', 'snow'], 0.3)) return null;
      return mod.groundType(x, z) === 'snow' || h > 6.2 ? 'pineSnow' : 'pine';
    },
  });
  return items;
}

function emberData(island, mod) {
  const F = EMBER_FEATURES, cx = island.x, cz = island.z;
  const landing = landingFor(island);
  const cluster = createNoise2D(island.seed + 500);
  const vx = cx + F.volcano.x, vz = cz + F.volcano.z;
  const items = scatter(island, {
    seed: island.seed + 777, target: 170, minDist: 3.8, tries: 26000,
    accept(x, z, rng) {
      if (landing && Math.hypot(x - landing.x, z - landing.z) < 11) return null;
      if (cluster(x * 0.05, z * 0.05) * 0.5 + 0.5 < 0.22 + 0.3 * rng()) return null;
      if (mod.inland(x, z) < 13) return null;                                                // gold / black sand stays free
      const d = Math.hypot(x - vx, z - vz);
      if (d < 31) return null;                                                               // the volcano apron and cone stay bare
      const h = mod.height(x, z);
      if (h < 0.8 || h > 6.5) return null;
      const a = Math.atan2(z - vz, x - vx);
      if (d < F.cliffR + 14 && F.rampAngles.some((ra) => angleDiff(a, ra) < 0.5)) return null;   // volcano ramps
      if (!safeSpot(mod, x, z, h, ['grass'], 0.28)) return null;
      return mod.inland(x, z) < 34 ? 'palm' : 'jungle';
    },
  });
  return items;
}

const _cache = new Map();
/** Placeholder tree placements (+ the smoke anchor) for an island; {} for home. Cached: computed once per island. */
export function buildTeaserData(island) {
  if (_cache.has(island.id)) return _cache.get(island.id);
  let data = { layers: {} };
  const mod = getIslandModule(island.id);
  if (island.biome === 'alpine') data = { layers: groupKinds(frostData(island, mod)) };
  else if (island.biome === 'volcanic') {
    data = {
      layers: groupKinds(emberData(island, mod)),
      smoke: { x: island.x + EMBER_FEATURES.volcano.x, z: island.z + EMBER_FEATURES.volcano.z, y: 8.5 },
    };
  }
  const rng = mulberry32(island.seed + 888);
  for (const list of Object.values(data.layers)) {
    for (const it of list) {                                // size / yaw / tint: decided here so the look is part of the data, not of a rebuild
      const h = mod.height(it.x, it.z);
      it.y = h - 0.05;
      it.rot = rng() * TAU;
      it.s = range(rng, 0.85, 1.35);
      it.sy = it.s * range(rng, 0.95, 1.15);
      it.color = new THREE.Color().setHSL(0.33 + range(rng, -0.03, 0.03), 0.1, range(rng, 0.9, 1.0)).getHex();   // near-white: a gentle brightness wobble
    }
  }
  _cache.set(island.id, data);
  return data;
}

function groupKinds(items) {
  const layers = {};
  for (const it of items) (layers[it.kind] || (layers[it.kind] = [])).push(it);
  return layers;
}

// ---------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0), _one = new THREE.Vector3(1, 1, 1);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
/** Tapered cylinder from a to b (palm trunk segment). */
function seg(a, b, r0, r1, color, sides = 6) {
  _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]); _d.subVectors(_b, _a);
  const g = new THREE.CylinderGeometry(r1, r0, _d.length(), sides);
  _q.setFromUnitVectors(_up, _d.normalize());
  g.applyMatrix4(_m.compose(_a.add(_b).multiplyScalar(0.5), _q, _one));
  return part(g, color);
}

function pineGeo(snowy) {
  const parts = [part(new THREE.CylinderGeometry(0.26, 0.38, 1.5, 6), '#7a5236', { p: [0, 0.7, 0] })];
  const tiers = [{ y: 2.15, h: 2.5, r: 1.75, c: '#2c7f55' }, { y: 3.5, h: 2.15, r: 1.38, c: '#36915f' }, { y: 4.7, h: 1.9, r: 0.98, c: '#43a46b' }];
  tiers.forEach((t, i) => {
    parts.push(part(new THREE.ConeGeometry(t.r, t.h, 7, 1), t.c, { p: [0, t.y, 0] }));
    if (snowy || i === 2) {                                   // snow cap: a smaller white cone sharing the tier's apex
      const ch = t.h * (snowy ? 0.58 : 0.5);
      parts.push(part(new THREE.ConeGeometry(t.r * (snowy ? 0.78 : 0.62), ch, 7, 1), '#f4f8ff', { p: [0, t.y + t.h / 2 - ch / 2 + 0.05, 0] }));
    }
  });
  const geo = combine(parts);
  return { geo, outlineGeo: smoothOutlineGeo(geo) };
}

function palmGeo() {
  const parts = [];
  const pts = [[0, -0.2, 0], [0.25, 1.5, 0.05], [0.65, 3.2, 0.2], [1.0, 4.9, 0.3]];
  for (let i = 0; i < pts.length - 1; i++) parts.push(seg(pts[i], pts[i + 1], 0.36 - i * 0.07, 0.3 - i * 0.07, i % 2 ? '#a87650' : '#946540', 6));
  const top = pts[pts.length - 1];
  const N = 7;
  for (let i = 0; i < N; i++) {                               // drooping fronds: flattened ellipsoids fanned round the crown
    const a = (i / N) * TAU;
    parts.push(part(new THREE.SphereGeometry(1, 6, 4), i % 2 ? '#3fb55a' : '#2f9e4a', {
      p: [top[0] + Math.cos(a) * 1.15, top[1] - 0.12, top[2] + Math.sin(a) * 1.15], r: [0, -a, -0.32], s: [1.55, 0.13, 0.5],
    }));
  }
  parts.push(part(new THREE.IcosahedronGeometry(0.34, 0), '#7a4f2d', { p: [top[0] + 0.2, top[1] - 0.35, top[2] + 0.15] }));
  parts.push(part(new THREE.IcosahedronGeometry(0.3, 0), '#8a5a35', { p: [top[0] - 0.22, top[1] - 0.4, top[2] - 0.1] }));
  const geo = combine(parts);
  return { geo, outlineGeo: smoothOutlineGeo(geo) };
}

function jungleGeo() {
  const ico = new THREE.IcosahedronGeometry(1, 1);
  const parts = [seg([0, -0.2, 0], [0.1, 3.2, 0], 0.5, 0.36, '#8a5a3c', 7)];
  parts.push(part(ico, '#2f9e4a', { p: [0, 4.0, 0], s: [2.5, 1.7, 2.5] }));
  parts.push(part(ico, '#3fb85a', { p: [1.5, 3.6, 0.5], s: [1.6, 1.15, 1.6] }));
  parts.push(part(ico, '#2a8c45', { p: [-1.3, 3.5, -0.7], s: [1.7, 1.2, 1.7] }));
  parts.push(part(ico, '#53cb6a', { p: [0.1, 5.0, -0.2], s: [1.5, 1.0, 1.5] }));
  const geo = combine(parts);
  return { geo, outlineGeo: smoothOutlineGeo(geo) };
}

const KINDS = {
  pine: () => pineGeo(false),
  pineSnow: () => pineGeo(true),
  palm: palmGeo,
  jungle: jungleGeo,
};
// Far blobs: one cheap shape per tree, merged into a single mesh. [geometry factory, colour, offset-y, size]
const FAR_BLOB = {
  pine: { make: () => new THREE.ConeGeometry(1, 1, 5, 1), color: '#2f8a5a', y: 3.0, sx: 1.9, sy: 5.4 },
  pineSnow: { make: () => new THREE.ConeGeometry(1, 1, 5, 1), color: '#e6eefa', y: 3.0, sx: 1.9, sy: 5.4 },
  palm: { make: () => new THREE.IcosahedronGeometry(1, 0), color: '#37a64f', y: 4.4, sx: 2.3, sy: 1.0 },
  jungle: { make: () => new THREE.IcosahedronGeometry(1, 0), color: '#2f9e4a', y: 4.2, sx: 2.7, sy: 1.9 },
};

// ---------------------------------------------------------------------------------------------
// Visuals
// ---------------------------------------------------------------------------------------------
const SMOKE_PUFFS = 22, SMOKE_LIFE = 26, SMOKE_RISE = 64;

function buildSmoke(anchor) {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const mat = toonMat('#ffffff');
  const mesh = new THREE.InstancedMesh(geo, mat, SMOKE_PUFFS);
  mesh.name = 'volcano-smoke';
  mesh.frustumCulled = false;                // the plume is tall and drifts: one draw call is cheaper than bounds upkeep
  mesh.castShadow = false; mesh.receiveShadow = false;
  const lo = new THREE.Color('#8b8196'), hi = new THREE.Color('#ebe7f3'), c = new THREE.Color();
  const pos = new THREE.Vector3(), scl = new THREE.Vector3(), mtx = new THREE.Matrix4(), q = new THREE.Quaternion();
  const update = (t) => {
    for (let i = 0; i < SMOKE_PUFFS; i++) {
      const j = Math.sin(i * 12.9898) * 43758.5453, r1 = j - Math.floor(j);          // per-puff jitter (stable)
      const u = (t / SMOKE_LIFE + (i + (r1 - 0.5) * 0.7) / SMOKE_PUFFS + 1) % 1;
      const fade = 1 - sstep(0.78, 1.0, u);
      const s = (2.0 + 6.5 * Math.pow(u, 0.6) + r1 * 1.4) * fade + 0.001;
      pos.set(
        anchor.x + u * u * 42 + Math.sin(u * 5 + i * 1.7) * (1 + 6 * u),
        anchor.y + u * SMOKE_RISE,
        anchor.z + u * 6 + Math.cos(u * 4.3 + i * 2.3) * (1 + 5 * u),
      );
      mesh.setMatrixAt(i, mtx.compose(pos, q, scl.set(s, s * 0.86, s)));
      mesh.setColorAt(i, c.copy(lo).lerp(hi, Math.min(1, u * 1.4)));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  };
  update(0);
  return { mesh, geo, update };
}

export function buildTeaserVisuals(island, data) {
  const group = new THREE.Group(); group.name = `teaser-${island.id}`;
  const far = new THREE.Group(); far.name = `teaser-far-${island.id}`;
  const always = new THREE.Group(); always.name = `teaser-always-${island.id}`;
  const mat = toonMat('#ffffff', { vertexColors: true });
  const origin = { x: island.x - island.radius - ISLAND_MESH_MARGIN, z: island.z - island.radius - ISLAND_MESH_MARGIN };
  const geos = [], layers = [];
  for (const [kind, items] of Object.entries(data.layers)) {
    const { geo, outlineGeo } = KINDS[kind]();
    geos.push(geo, outlineGeo);
    const layer = buildChunkedLayer({
      name: kind, geometry: geo, outlineGeometry: outlineGeo, outlineThickness: 0.06, material: mat, items, origin,
    });
    layers.push(layer);
    group.add(layer.group);
  }
  // far version: one merged blob mesh for every tree (no outline, no shadows)
  let farMesh = null;
  const blobParts = [];
  for (const [kind, items] of Object.entries(data.layers)) {
    const b = FAR_BLOB[kind];
    const src = b.make();
    for (const it of items) blobParts.push(part(src, b.color, { p: [it.x, it.y + b.y * it.s, it.z], s: [b.sx * it.s, b.sy * it.sy, b.sx * it.s] }));
    src.dispose();
  }
  if (blobParts.length) {
    const g = mergeGeometries(blobParts, false);
    for (const p of blobParts) p.dispose();
    geos.push(g);
    farMesh = new THREE.Mesh(g, mat);
    farMesh.name = `far-trees-${island.id}`;
    farMesh.castShadow = false; farMesh.receiveShadow = false;
    far.add(farMesh);
  }
  let smoke = null;
  if (data.smoke) { smoke = buildSmoke(data.smoke); always.add(smoke.mesh); geos.push(smoke.geo); }
  return {
    group, far, always,
    update(t) { smoke?.update(t); },
    dispose() {
      for (const l of layers) l.dispose();
      smoke?.mesh.dispose();
      farMesh?.removeFromParent();
      for (const g of geos) g.dispose();
      group.removeFromParent(); far.removeFromParent(); always.removeFromParent();
    },
    summary() { return { layers: layers.map((l) => l.summary()), smoke: !!smoke, farBlobs: blobParts.length }; },
  };
}
