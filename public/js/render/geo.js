// Small geometry toolkit for building cheap, merged, vertex-coloured toon props (pickups, dig spots, ...).
// Same idea as the private helpers in world/props.js: bake a transform + flat colour into a clone of a primitive, merge them all into
// ONE geometry (one draw call), and build a closed, even inverted-hull outline from a welded + smooth-shaded copy.
//
//   const geo = combine([
//     part(G.sphere, '#ff4d5e', { p: [0, 0.2, 0], s: [0.22, 0.2, 0.22] }),
//     part(G.cyl6,   '#7a4a2a', { p: [0, 0.42, 0], s: [0.02, 0.1, 0.02] }),
//   ]);
//   const mesh = new THREE.Mesh(geo, VERTEX_TOON);      // VERTEX_TOON = toonMat('#fff', { vertexColors: true })
//   mesh.add(makeOutline(geo, 0.03));
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMat, addOutline } from './toon.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Shared unit primitives (scaled by part()). */
export const G = {
  sphere: new THREE.SphereGeometry(1, 10, 8),
  sphereLo: new THREE.SphereGeometry(1, 7, 5),
  ico1: new THREE.IcosahedronGeometry(1, 1),
  ico2: new THREE.IcosahedronGeometry(1, 2),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8, 1),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6, 1),
  cone6: new THREE.ConeGeometry(1, 1, 6, 1),
};

/** The material every merged, vertex-coloured prop shares. */
export const VERTEX_TOON = toonMat('#ffffff', { vertexColors: true });

/** Clone `geo`, bake a transform (p position, r euler rotation, s scale) and a flat vertex colour, make it merge-compatible. */
export function part(geo, color, t = {}) {
  const { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = t;
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  _e.set(r[0], r[1], r[2]);
  _q.setFromEuler(_e);
  _m.compose(_v.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
  g.applyMatrix4(_m);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Merge parts into one geometry (the parts are disposed). */
export function combine(parts) {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

/** Position-only, vertex-welded, smooth-normal copy used to extrude an even outline. */
export function smoothOutlineGeo(geo) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', geo.attributes.position.clone());
  const m = mergeVertices(g, 1e-3);
  m.computeVertexNormals();
  return m;
}

/** Inverted-hull outline mesh for a merged geometry (add it as a child of the mesh that draws `geo`). */
export function makeOutline(geo, thickness = 0.03, outlineGeo = null) {
  const tmp = new THREE.Mesh(outlineGeo || smoothOutlineGeo(geo));
  const o = addOutline(tmp, thickness);
  tmp.remove(o);
  return o;
}

/** Move a geometry so its lowest point sits at y = 0 (props rest on the ground with their origin at their base). */
export function restOnGround(geo) {
  geo.computeBoundingBox();
  geo.translate(0, -geo.boundingBox.min.y, 0);
  return geo;
}
