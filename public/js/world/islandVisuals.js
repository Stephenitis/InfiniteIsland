// Island visuals + the world's visibility manager (Step 27b). Every island is ONE visuals object:
//
//   buildIslandVisuals(island, ctx) -> { id, root, full, far, always, update(t), setFull(bool), dispose(), summary() }
//     root    Group `island-<id>` in the scene
//     full    full detail: terrain chunks (terrainMesh.js) + props (chunked instanced layers on the big islands) + bridge stubs
//     far     the cheap far version: ONE low-res terrain mesh + ONE merged canopy-blob mesh, no shadows (<= 2 draw calls)
//     always  things that stay visible at any distance (the volcano smoke plume: 1 draw call)
//   Exactly one of full / far is visible at a time (setFull); hidden groups use `visible = false`.
//
// Gameplay data is kept apart from visuals (PLAN "Scaling"): buildIslandData(island) runs once per island at load on every screen and
// owns everything with identity (stub colliders, the placeholder tree placements), so disposing and rebuilding an island's visuals can never
// duplicate a collider or move a tree. HOME is wrapped, not restructured: its props (world/props.js) carry colliders and interactables of
// their own, so rebuilding home only rebuilds its terrain + far version; the props group is just re-parented.
//
//   const world = createWorldVisuals({ scene, camera, homeProps })
//   world.update(t)        once per frame (after the camera moved): updates the regions from the view centre + animates the smoke
//   world.regions          region manager (world/regions.js): isFull(id), view, summary()
//   world.rebuild(id)      dispose + rebuild one island's visuals (debug / future streaming); draw calls, colliders, sync hashes stay unchanged
//   world.snap()           re-evaluate regions immediately without hysteresis (teleports, startup)
//   world.visuals[id], world.root, world.summary()
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ISLANDS, BRIDGES, REGION_VIEW } from '../config.js';
import { buildIslandTerrain, buildFarTerrain } from './terrainMesh.js';
import { createRegions } from './regions.js';
import { registerStubColliders, buildStubVisuals } from './bridgeStubs.js';
import { buildTeaserData, buildTeaserVisuals } from './islands/teasers.js';
import { toonMat } from '../render/toon.js';
import { part } from './props.js';

// ---------------------------------------------------------------------------------------------
// Gameplay-side data (once per island, every screen)
// ---------------------------------------------------------------------------------------------
const _data = new Map();
/** Deterministic, cheap per-island data with stable identity; registers the island's colliders. Cached: calling it again changes nothing. */
export function buildIslandData(island) {
  if (_data.has(island.id)) return _data.get(island.id);
  const data = { id: island.id, teasers: island.id === 'home' ? null : buildTeaserData(island) };
  if (island.id === 'home') data.stubColliders = registerStubColliders();   // home-side bridge posts
  _data.set(island.id, data);
  return data;
}

// ---------------------------------------------------------------------------------------------
// Far canopy blobs of the home island (its trees are individual meshes with colliders: only their positions are read)
// ---------------------------------------------------------------------------------------------
function homeFarBlobs(props) {
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const parts = [];
  for (const g of props.handles.trees) {
    const s = g.scale.x;
    parts.push(part(ico, g.userData.cherry ? '#ff9fc6' : '#4cbf68', { p: [g.position.x, g.position.y + 3.1 * s, g.position.z], s: [2.6 * s, 1.8 * s, 2.6 * s] }));
  }
  for (const g of props.handles.palms) {
    const s = g.scale.x;
    parts.push(part(ico, '#3fae55', { p: [g.position.x, g.position.y + 4.6 * s, g.position.z], s: [2.2 * s, 1.0 * s, 2.2 * s] }));
  }
  ico.dispose();
  if (!parts.length) return null;
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  const mesh = new THREE.Mesh(geo, toonMat('#ffffff', { vertexColors: true }));
  mesh.name = 'far-trees-home';
  mesh.castShadow = false; mesh.receiveShadow = false;
  return { mesh, dispose() { geo.dispose(); mesh.removeFromParent(); } };
}

// ---------------------------------------------------------------------------------------------
// One island's visuals
// ---------------------------------------------------------------------------------------------
export function buildIslandVisuals(island, ctx) {
  const data = buildIslandData(island);
  const root = new THREE.Group(); root.name = `island-${island.id}`;
  const full = new THREE.Group(); full.name = `island-${island.id}-full`;
  const far = new THREE.Group(); far.name = `island-${island.id}-far`;
  const always = new THREE.Group(); always.name = `island-${island.id}-always`;
  root.add(full, far, always);
  const disposers = [];

  const terrain = buildIslandTerrain(island);
  full.add(terrain.group); disposers.push(() => terrain.dispose());
  const farTerrain = buildFarTerrain(island);
  far.add(farTerrain.mesh); disposers.push(() => farTerrain.dispose());

  let teaser = null;
  if (island.id === 'home') {
    full.add(ctx.homeProps.group);                         // wrapped as is (never disposed here: its colliders / interactables live on)
    const blobs = homeFarBlobs(ctx.homeProps);
    if (blobs) { far.add(blobs.mesh); disposers.push(() => blobs.dispose()); }
  } else {
    teaser = buildTeaserVisuals(island, data.teasers);
    full.add(teaser.group); far.add(teaser.far); always.add(teaser.always);
    disposers.push(() => teaser.dispose());
  }
  for (const b of BRIDGES) {                               // broken bridge stubs at every landing on this island (until Step 28)
    for (const end of ['a', 'b']) {
      if ((end === 'a' ? b.from : b.to) !== island.id) continue;
      const stub = buildStubVisuals(b, end);
      full.add(stub.group); disposers.push(() => stub.dispose());
    }
  }

  return {
    id: island.id, root, full, far, always, data,
    update(t) { teaser?.update(t); },
    setFull(on) { full.visible = on; far.visible = !on; },
    dispose() {
      for (const d of disposers) d();
      root.removeFromParent();
    },
    summary() { return { teaser: teaser ? teaser.summary() : null }; },
  };
}

// ---------------------------------------------------------------------------------------------
// The world: all islands + the region manager
// ---------------------------------------------------------------------------------------------
export function createWorldVisuals({ scene, camera, homeProps }) {
  for (const island of ISLANDS) buildIslandData(island);   // gameplay data first, for every island, on every screen
  const root = new THREE.Group(); root.name = 'world';
  scene.add(root);
  const visuals = {};
  const islandOf = (id) => ISLANDS.find((i) => i.id === id);
  const ctx = { homeProps };
  for (const island of ISLANDS) {
    visuals[island.id] = buildIslandVisuals(island, ctx);
    root.add(visuals[island.id].root);
  }
  const regions = createRegions({
    islands: ISLANDS, ...REGION_VIEW,
    onMode: (id, full) => visuals[id]?.setFull(full),
  });

  // The view centre: where the camera's forward ray meets the ground plane (works for the follow camera, the feast camera and the debug camera).
  const _dir = new THREE.Vector3();
  const centre = { x: 0, z: 0 };
  function viewCentre() {
    camera.getWorldDirection(_dir);
    const p = camera.position;
    if (_dir.y < -0.05) {
      const k = Math.min(p.y / -_dir.y, 260);
      centre.x = p.x + _dir.x * k; centre.z = p.z + _dir.z * k;
    } else { centre.x = p.x; centre.z = p.z; }
    return centre;
  }

  function snap() { const c = viewCentre(); regions.update(c.x, c.z, true); }
  function update(t) {
    const c = viewCentre();
    regions.update(c.x, c.z);
    for (const id in visuals) visuals[id].update(t);
  }
  function rebuild(id) {
    const island = islandOf(id);
    if (!island || !visuals[id]) return false;
    visuals[id].dispose();
    visuals[id] = buildIslandVisuals(island, ctx);
    root.add(visuals[id].root);
    visuals[id].setFull(regions.isFull(id));
    return true;
  }
  snap();
  return {
    root, visuals, regions, update, snap, rebuild,
    viewCentre: () => ({ ...viewCentre() }),
    summary() {
      const s = { regions: regions.summary(), islands: {} };
      for (const id in visuals) s.islands[id] = { full: visuals[id].full.visible, ...visuals[id].summary() };
      return s;
    },
  };
}
