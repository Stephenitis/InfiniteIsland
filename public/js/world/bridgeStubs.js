// Broken bridge stubs (Step 27b): the wreck of the old bridges at all four landings (config BRIDGES a / b ends), shown until Step 28 builds
// them. Frost = stone pillar stumps, Ember = leaning wooden posts; both with a snapped rope end dangling towards the water and a few broken
// planks / stones. Two halves, kept apart on purpose (PLAN "Scaling"):
//   registerStubColliders()        GAMEPLAY: a circle collider per home-side post; runs once at load on every screen, never repeated.
//   buildStubVisuals(bridge, end)  VISUALS: one merged mesh + outline hull (2 draw calls, no shadow casting) -> { group, dispose() };
//                                  safe to call again after an island's visuals are rebuilt.
// Step 28b: once construction starts the stubs go away (the new deck would clip the old posts):
//   setStubsGone(bridgeId, gone)   hides / shows every live stub mesh of that bridge (also applied to meshes built later, e.g. after an island rebuild)
//                                  and removes / restores the home-side post colliders (the deck must not be blocked by them)
// Local frame of a stub: x = lateral, z = towards the gap (the open sea the deck will cross). The posts stand at x = +-STUB_POST_X, i.e. just
// OUTSIDE the 3 u wide deck (edges at +-1.5), so a built deck's centre line stays clear (the stubs get hidden / replaced in Step 28 anyway).
import * as THREE from 'three';
import { BRIDGES } from '../config.js';
import { part, combine, smoothOutlineGeo } from './props.js';
import { getTerrainHeight } from './terrain.js';
import { addCollider, removeCollider } from './colliders.js';
import { toonMat, addOutline } from '../render/toon.js';

export const STUB_POST_X = 2.2;      // lateral offset of the posts (deck edge 1.5 + post radius + a little air)
const STUB_POST_Z = 0.5;             // how far past the landing point towards the gap the posts stand

/** Landing frame of one end of a bridge: position, unit vector towards the gap (u), yaw for a mesh whose local +Z points at the gap. */
export function stubFrame(bridge, end) {
  const dx = bridge.bx - bridge.ax, dz = bridge.bz - bridge.az, L = Math.hypot(dx, dz);
  const sgn = end === 'a' ? 1 : -1;               // end a: the gap lies along +dir; end b: back along -dir
  const ux = (dx / L) * sgn, uz = (dz / L) * sgn;
  return { x: end === 'a' ? bridge.ax : bridge.bx, z: end === 'a' ? bridge.az : bridge.bz, ux, uz, yaw: Math.atan2(ux, uz) };
}

/** World position of a point (lx, lz) in a stub's local frame. */
export function stubToWorld(f, lx, lz) {
  return { x: f.x + lx * f.uz + lz * f.ux, z: f.z - lx * f.ux + lz * f.uz };
}

let _collidersDone = false;
const _stubDefs = new Map();       // bridge id -> [{ x, z, r }] (so the colliders can come back)
const _stubLive = new Map();       // bridge id -> [collider] currently registered
const _gone = new Set();           // bridge ids whose stubs are gone
const _meshes = new Map();         // bridge id -> Set of live stub groups
/** Home-side stubs: one circle collider per post. Returns the colliders (only the first call creates them). */
export function registerStubColliders() {
  if (_collidersDone) return [];
  _collidersDone = true;
  const out = [];
  for (const b of BRIDGES) {
    if (b.from !== 'home') continue;
    const f = stubFrame(b, 'a');
    const defs = [];
    for (const sx of [-1, 1]) {
      const p = stubToWorld(f, sx * STUB_POST_X, STUB_POST_Z);
      defs.push({ x: p.x, z: p.z, r: b.surface === 'stone' ? 0.55 : 0.42 });
    }
    _stubDefs.set(b.id, defs);
    const live = defs.map((d) => addCollider({ ...d, owner: `stub-${b.id}` }));
    _stubLive.set(b.id, live);
    out.push(...live);
  }
  return out;
}

/** Hide / show the stubs of one bridge (meshes + home-side colliders). Idempotent. */
export function setStubsGone(bridgeId, gone) {
  gone = !!gone;
  if (gone) _gone.add(bridgeId); else _gone.delete(bridgeId);
  for (const g of _meshes.get(bridgeId) || []) g.visible = !gone;
  const defs = _stubDefs.get(bridgeId);
  if (!defs) return;
  const live = _stubLive.get(bridgeId) || [];
  if (gone) { for (const c of live) removeCollider(c); _stubLive.set(bridgeId, []); }
  else if (!live.length) _stubLive.set(bridgeId, defs.map((d) => addCollider({ ...d, owner: `stub-${bridgeId}` })));
}
export const stubsGone = (bridgeId) => _gone.has(bridgeId);

// ---------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------
const BOX = new THREE.BoxGeometry(1, 1, 1);
const ICO = new THREE.IcosahedronGeometry(1, 0);
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);
const _one = new THREE.Vector3(1, 1, 1);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();

/** A thin cylinder from point a to point b (rope segment). */
function rope(a, b, r, color) {
  _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]); _d.subVectors(_b, _a);
  const len = _d.length();
  const g = new THREE.CylinderGeometry(r, r, len, 5);
  _q.setFromUnitVectors(_up, _d.normalize());
  _m.compose(_a.add(_b).multiplyScalar(0.5), _q, _one);
  g.applyMatrix4(_m);
  return part(g, color);
}

function buildParts(surface) {
  const stone = surface === 'stone';
  const parts = [];
  const POST = stone ? '#b9b4cc' : '#9a6a44';
  const POST_TOP = stone ? '#d3cfe3' : '#b98a5e';
  const ROPE = '#d8b98a';
  const SNOW = '#f4f8ff';

  // The two posts (the right one is shorter and more broken)
  [-1, 1].forEach((sx, i) => {
    const h = i === 0 ? 2.15 : 1.45;
    const x = sx * STUB_POST_X, z = STUB_POST_Z;
    if (stone) {
      parts.push(part(new THREE.CylinderGeometry(0.4, 0.52, h + 0.4, 7), POST, { p: [x, (h - 0.4) / 2, z], r: [0, 0.3 * sx, 0] }));
      parts.push(part(new THREE.CylinderGeometry(0.43, 0.43, 0.14, 7), POST_TOP, { p: [x, h * 0.55, z], r: [0, 0.3 * sx, 0] }));   // a lighter course
      parts.push(part(BOX, POST_TOP, { p: [x + 0.06 * sx, h + 0.02, z], r: [0.25, 0.5, 0.18 * sx], s: [0.5, 0.32, 0.46] }));        // broken top
      parts.push(part(ICO, SNOW, { p: [x, h + 0.12, z], s: [0.36, 0.14, 0.36] }));                                                   // snow cap
    } else {
      parts.push(part(new THREE.CylinderGeometry(0.27, 0.34, h + 0.4, 7), POST, { p: [x, (h - 0.4) / 2, z], r: [0.07, 0, -0.1 * sx] }));
      parts.push(part(new THREE.CylinderGeometry(0.31, 0.31, 0.16, 7), ROPE, { p: [x - 0.04 * sx, h * 0.72, z], r: [0.07, 0, -0.1 * sx] }));   // rope wrap
      parts.push(part(BOX, POST_TOP, { p: [x - 0.1 * sx, h + 0.05, z], r: [0.5, 0.3, 0.7 * sx], s: [0.2, 0.42, 0.2] }));                      // jagged break
    }
  });

  // Snapped rope: a long end hanging from the left post towards the water, a short stub on the right one
  const lx = -STUB_POST_X, rx = STUB_POST_X;
  const pts = [[lx, 1.9, 0.5], [lx + 0.55, 1.78, 0.95], [lx + 0.95, 1.4, 1.35], [lx + 1.05, 0.9, 1.6], [lx + 1.1, 0.45, 1.75]];
  for (let i = 0; i < pts.length - 1; i++) parts.push(rope(pts[i], pts[i + 1], 0.06, ROPE));
  parts.push(part(ICO, '#b79a6a', { p: pts[pts.length - 1], s: [0.1, 0.1, 0.1] }));                       // frayed end
  parts.push(rope([rx, 1.35, 0.5], [rx - 0.35, 1.2, 0.75], 0.06, ROPE));
  parts.push(part(ICO, '#b79a6a', { p: [rx - 0.38, 1.18, 0.77], s: [0.09, 0.09, 0.09] }));

  // Broken planks / stones lying around the gap side
  const slab = stone ? '#a3a8b8' : '#a87648';
  const slabDark = stone ? '#858ba0' : '#8a5e38';
  const w = stone ? 0.8 : 1.5, d = stone ? 0.8 : 0.42;
  parts.push(part(BOX, slab, { p: [-0.3, 0.1, 1.5], r: [0.04, 0.35, 0.1], s: [w, 0.14, d] }));
  parts.push(part(BOX, slabDark, { p: [0.9, 0.06, 2.4], r: [0, -0.6, 0.18], s: [w * 0.8, 0.12, d] }));
  parts.push(part(BOX, slab, { p: [-1.1, 0.07, 2.9], r: [0.1, 0.9, -0.12], s: [w * 0.7, 0.12, d * 0.9] }));
  if (stone) {                                                                                                // rubble at the pillar feet
    parts.push(part(ICO, slabDark, { p: [lx + 0.7, 0.15, 0.8], s: [0.3, 0.22, 0.28] }));
    parts.push(part(ICO, slab, { p: [rx - 0.6, 0.12, 1.0], s: [0.25, 0.18, 0.25] }));
    parts.push(part(ICO, slab, { p: [rx + 0.5, 0.1, 0.3], s: [0.22, 0.16, 0.2] }));
  } else {
    parts.push(part(BOX, slabDark, { p: [rx - 0.5, 0.35, 0.95], r: [0.2, 0.2, 0.9], s: [1.1, 0.12, 0.38] }));  // a plank leaning on the post
  }
  return parts;
}

/** The merged stub mesh for one end of a bridge ('a' = `from` side, 'b' = `to` side) -> { group, dispose() }. */
export function buildStubVisuals(bridge, end) {
  const geo = combine(buildParts(bridge.surface));
  const outlineGeo = smoothOutlineGeo(geo);
  const mesh = new THREE.Mesh(geo, toonMat('#ffffff', { vertexColors: true }));
  mesh.name = `stub-${bridge.id}-${end}`;
  mesh.castShadow = false; mesh.receiveShadow = true;
  const tmp = new THREE.Mesh(outlineGeo);
  const o = addOutline(tmp, 0.04);
  tmp.remove(o);
  mesh.add(o);                                    // 2 draw calls per landing: the mesh and its hull
  const f = stubFrame(bridge, end);
  const group = new THREE.Group();
  group.name = `stub-${bridge.id}-${end}-root`;
  group.add(mesh);
  group.position.set(f.x, getTerrainHeight(f.x, f.z), f.z);
  group.rotation.y = f.yaw;
  group.visible = !_gone.has(bridge.id);
  let set = _meshes.get(bridge.id);
  if (!set) _meshes.set(bridge.id, set = new Set());
  set.add(group);
  return {
    group,
    dispose() { set.delete(group); geo.dispose(); outlineGeo.dispose(); group.removeFromParent(); },
  };
}
