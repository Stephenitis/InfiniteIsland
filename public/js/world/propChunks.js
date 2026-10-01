// Chunked instanced prop layers for the big islands (Step 27b). An island 240 u wide is far larger than one camera view, so a prop type
// is NOT one mesh: its instances are grouped into square chunks (PROP_CHUNK_SIZE = 40 u) and each chunk becomes ONE InstancedMesh with
// tight bounds, so frustum culling (camera and sun-shadow camera) skips every chunk that is off screen. Steps 29-30 build the real
// biome content through this helper.
//
//   const layer = buildChunkedLayer({
//     name: 'pine',                    // meshes are named `${name}-${cx},${cz}` (cx / cz = chunk indices from `origin`)
//     geometry, material,              // shared by every chunk (the layer does NOT dispose them: its owner does)
//     outlineGeometry?, outlineThickness?,   // optional inverted-hull outline: a second InstancedMesh per chunk sharing the matrices
//     items: [{ x, y, z, rot?, s? | sx, sy, sz?, color? }],   // world position, yaw, scale (uniform or per axis), per-instance tint
//     origin: { x, z },                // chunk grid origin (the island's south-west corner keeps chunk edges on whole units)
//     chunkSize?, castShadow?, receiveShadow?,
//   });                                // -> { group, chunks: [{ key, mesh, outline, count }], count, dispose(), summary() }
//   groupIntoChunks(items, origin, size) is the pure grouping step (Node-tested).
//
// Cost per chunk: 1 draw call (+1 for the outline, +1 in the shadow pass when it casts). Instances never move: the outline shares the
// chunk's instance matrix buffer, and rebuilding a layer from the same items gives identical draw calls.
import * as THREE from 'three';
import { PROP_CHUNK_SIZE } from '../config.js';
import { addOutline } from '../render/toon.js';

/** Group `items` ({x, z, ...}) by chunk: Map "cx,cz" -> items. */
export function groupIntoChunks(items, origin, size = PROP_CHUNK_SIZE) {
  const groups = new Map();
  for (const it of items) {
    const key = `${Math.floor((it.x - origin.x) / size)},${Math.floor((it.z - origin.z) / size)}`;
    let list = groups.get(key);
    if (!list) { list = []; groups.set(key, list); }
    list.push(it);
  }
  return groups;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();

export function buildChunkedLayer({
  name, geometry, material, outlineGeometry = null, outlineThickness = 0.06, items, origin,
  chunkSize = PROP_CHUNK_SIZE, castShadow = true, receiveShadow = true,
}) {
  const group = new THREE.Group();
  group.name = `${name}-layer`;
  const chunks = [];
  let outlineMat = null;
  if (outlineGeometry) {                       // borrow the cached outline material from toon.js through a throw-away mesh
    const tmp = new THREE.Mesh(outlineGeometry);
    outlineMat = addOutline(tmp, outlineThickness).material;
  }
  for (const [key, list] of groupIntoChunks(items, origin, chunkSize)) {
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    mesh.name = `${name}-${key}`;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      _q.setFromAxisAngle(_up, it.rot || 0);
      _p.set(it.x, it.y, it.z);
      const sc = it.s ?? 1;
      _s.set(it.sx ?? sc, it.sy ?? sc, it.sz ?? sc);
      mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      if (it.color !== undefined) mesh.setColorAt(i, _c.set(it.color));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();               // tight per-chunk bounds: this is what frustum culling tests
    mesh.computeBoundingBox();
    group.add(mesh);
    let outline = null;
    if (outlineMat) {
      outline = new THREE.InstancedMesh(outlineGeometry, outlineMat, list.length);
      outline.name = `${name}-outline-${key}`;
      outline.instanceMatrix = mesh.instanceMatrix;     // same buffer: the hull always follows its tree
      outline.renderOrder = -1;
      outline.castShadow = false; outline.receiveShadow = false;
      outline.computeBoundingSphere();
      group.add(outline);
    }
    chunks.push({ key, mesh, outline, count: list.length });
  }
  return {
    group,
    chunks,
    count: items.length,
    dispose() {
      for (const c of chunks) { c.mesh.dispose(); c.outline?.dispose(); }
      group.removeFromParent();
    },
    summary() { return { name, instances: items.length, chunks: chunks.length, drawCalls: chunks.length * (outlineMat ? 2 : 1) }; },
  };
}
