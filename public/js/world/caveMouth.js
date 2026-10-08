// The cave mouth (Step 59): the ice-cave entrance to Glimmerfrost Caves on the west bank of Frostpine's frozen lake. Like the Rootgate it is the island-side door of a combat area (the ritual
// portal is the other way in); unlike the Rootgate it needs no feast: you can only reach Frostpine once the Frostpine bridge is built, so it is simply open.
//
//   const mouth = createCaveMouth({ scene, sync, particles, sfx, combat });
//   mouth.update(dt, t)                       // once per tick (the pop-in of the trophy, the mist in the opening, the crystals' pulse)
//   mouth.id / mouth.label / mouth.position / mouth.front / mouth.yaw / mouth.isOpen()
//   mouth.setEnterHandler((player) => ...)    game/dungeon.js: the "Enter together" confirmation
//   mouth.trophy                              the Snow Golem trophy beside the mouth: it appears once the saved combat progress says Glimmerfrost's Wild mode is cleared (a plinth with a
//                                             little snow golem in an ice crown; pops in with sparkles when the clear happens live, otherwise simply there)
//   mouth.summary()
//
// The mound is ONE merged mesh + outline hull (rock lumps with snow caps, an arch of ice blocks round the dark opening, hanging icicles); the glowing crystals are one unlit mesh and the
// mist in the opening one translucent disc: 4 draw calls (+ the trophy's 2 once cleared). A few colliders keep players out of the rock and the opening.
import * as THREE from 'three';
import { getHeight } from './terrain.js';
import { addCollider } from './colliders.js';
import { addInteractable } from './interactables.js';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../render/geo.js';
import { CAVE_MOUTH } from './islands/caveMouth.js';
import { GLIMMERFROST } from '../game/areas/glimmerfrost.js';

const hash = (a, b = 0) => { const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return n - Math.floor(n); };
const box = new THREE.BoxGeometry(1, 1, 1);
const rock = ['#7d8cab', '#6c7b9e', '#8997b4', '#76859f'], ice = ['#d4eaf8', '#c6e2f4', '#dcf0fb', '#bcdcf0'], glow = ['#7ff0ff', '#b7a2ff', '#ffc8f0', '#9bffd6'];

/** The mound: rock lumps with snow on top, an ice-block arch round the opening, hanging icicles, a patch of ice in front (local space: +z is the front). */
function buildMoundGeometry() {
  const parts = [];
  for (const [i, [x, y, z, sx, sy, sz]] of [[0, 1.1, -1.5, 3.5, 2.5, 2.4], [-3.0, 0.8, -0.7, 1.8, 1.4, 1.7], [3.0, 0.8, -0.7, 1.8, 1.4, 1.7], [-1.7, 1.9, -2.2, 1.9, 1.7, 1.6], [1.7, 1.9, -2.2, 1.9, 1.7, 1.6], [0, 2.1, -2.9, 2.5, 2.2, 1.7]].entries()) {
    parts.push(part(G.ico1, rock[i % 4], { p: [x, y, z], s: [sx, sy, sz], r: [0.1 * i, hash(i, 3) * 6, 0.08] }));
    parts.push(part(G.sphereLo, '#f4f9ff', { p: [x, y + sy * 0.78, z], s: [sx * 0.72, sy * 0.28, sz * 0.7] }));
  }
  for (const side of [-1, 1]) {                                          // the arch: two pillars and a ring of ice blocks
    for (let row = 0; row < 3; row++) parts.push(part(box, ice[(row + (side > 0 ? 1 : 0)) % 4], { p: [side * 1.5, 0.3 + row * 0.62, 0.9], s: [0.7, 0.6, 0.8], r: [0, (hash(row, side) - 0.5) * 0.2, 0] }));
  }
  for (let n = 0; n <= 8; n++) {
    const a = -Math.PI / 2 + n * Math.PI / 8, x = Math.sin(a) * 1.5, y = 1.95 + Math.cos(a) * 1.35, key = n === 4;
    parts.push(part(box, key ? '#eaf6ff' : ice[n % 4], { p: [x, y, 0.9], s: [key ? 0.78 : 0.64, key ? 0.7 : 0.55, 0.85], r: [0, 0, -a * 0.8] }));
  }
  for (const [x, len] of [[-1.1, 0.7], [-0.55, 1.0], [0, 0.8], [0.5, 1.1], [1.05, 0.65]]) parts.push(part(G.cone6, '#e1f2ff', { p: [x, 2.55 - len / 2 + 0.1, 1.1], s: [0.1, len, 0.1], r: [Math.PI, 0, 0] }));      // icicles
  parts.push(part(G.sphere, '#1c1535', { p: [0, 1.15, 0.7], s: [1.28, 1.5, 0.5] }));                                                                                                         // the dark opening
  parts.push(part(G.cyl8, '#dcf0fb', { p: [0, 0.02, 2.2], s: [2.6, 0.05, 2.1] }));                                                                                                          // a patch of ice in front
  for (let n = 0; n < 6; n++) parts.push(part(G.sphereLo, '#ffffff', { p: [-2.6 + n * 1.05 + (hash(n) - 0.5) * 0.5, 0.06, 2.2 + hash(n, 4) * 1.5], s: [0.5, 0.1, 0.4], r: [0, n, 0] }));        // snow drifts
  return combine(parts);
}
function buildCrystalGeometry() {
  const parts = [];
  for (const [i, [x, z, k]] of [[-2.6, 1.0, 1.3], [2.7, 0.8, 1.1], [-3.3, -0.4, 0.8], [3.5, -0.2, 0.9], [-1.9, 2.6, 0.6], [2.2, 2.8, 0.7]].entries()) {
    parts.push(part(G.cone6, glow[i % 4], { p: [x, 0.7 * k, z], s: [0.2 * k, 1.5 * k, 0.2 * k], r: [0.06, i, 0.1 * (i % 2 ? 1 : -1)] }));
    parts.push(part(G.cone6, glow[(i + 1) % 4], { p: [x + 0.3 * k, 0.4 * k, z + 0.1], s: [0.13 * k, 0.8 * k, 0.13 * k], r: [0.3, i, -0.4] }));
  }
  return combine(parts);
}
/** The Snow Golem trophy: a plinth, a tiny snow golem with an ice crown and a plaque (local space, +z is the front). */
function buildTrophyGeometry() {
  const parts = [];
  parts.push(part(box, '#a6adbc', { p: [0, 0.2, 0], s: [1.15, 0.4, 1.0] }));
  parts.push(part(box, '#c7d6e6', { p: [0, 0.46, 0], s: [0.92, 0.14, 0.8] }));
  parts.push(part(box, '#9ec9ea', { p: [0, 0.22, 0.51], s: [0.62, 0.22, 0.04] }));
  parts.push(part(G.sphere, '#f4f9ff', { p: [0, 0.82, 0], s: [0.42, 0.36, 0.4] }));
  parts.push(part(G.sphere, '#ffffff', { p: [0, 1.25, 0], s: [0.3, 0.27, 0.28] }));
  for (const side of [-1, 1]) {
    parts.push(part(G.sphereLo, '#2b2340', { p: [side * 0.1, 1.31, 0.24], s: [0.045, 0.06, 0.03] }));
    parts.push(part(G.cyl6, '#7a5538', { p: [side * 0.55, 0.95, 0], s: [0.035, 0.6, 0.035], r: [0, 0, -side * 0.9] }));
  }
  parts.push(part(G.cone6, '#f5ab68', { p: [0, 1.24, 0.34], s: [0.05, 0.26, 0.05], r: [Math.PI / 2, 0, 0] }));
  parts.push(part(G.cyl8, '#e2705e', { p: [0, 1.04, 0], s: [0.34, 0.07, 0.32] }));
  for (let n = 0; n < 5; n++) { const a = (n - 2) * 0.5; parts.push(part(G.cone6, n % 2 ? '#cfeeff' : '#9bd4f5', { p: [Math.sin(a) * 0.2, 1.62 - Math.abs(n - 2) * 0.03, Math.cos(a) * 0.03], s: [0.05, 0.22, 0.05] })); }
  const geo = combine(parts); geo.scale(1.3, 1.3, 1.3); return geo;
}

export function createCaveMouth({ scene, sync, particles, sfx = null, combat = null }) {
  const { x, z, yaw } = CAVE_MOUTH, ground = getHeight(x, z), id = CAVE_MOUTH.id;
  const group = new THREE.Group(); group.name = 'glimmerfrost-mouth'; group.position.set(x, ground, z); group.rotation.y = yaw; scene.add(group);
  const moundGeo = buildMoundGeometry(), mound = new THREE.Mesh(moundGeo, VERTEX_TOON);
  mound.name = 'cave-mouth-mound'; mound.castShadow = true; mound.receiveShadow = true; mound.add(makeOutline(moundGeo, 0.05)); group.add(mound);
  const crystals = new THREE.Mesh(buildCrystalGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true })); crystals.name = 'cave-mouth-crystals'; group.add(crystals);
  const mist = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), new THREE.MeshBasicMaterial({ color: '#bff3ff', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
  mist.name = 'cave-mouth-mist'; mist.position.set(0, 1.15, 0.99); mist.scale.set(1, 1.3, 1); group.add(mist);

  // ---- the Snow Golem trophy (hidden until the clear is saved)
  const trophyDef = GLIMMERFROST.trophy, trophyGeo = buildTrophyGeometry(), trophy = new THREE.Mesh(trophyGeo, VERTEX_TOON);
  trophy.name = 'cave-mouth-trophy'; trophy.castShadow = true; trophy.receiveShadow = true; trophy.add(makeOutline(trophyGeo, 0.04)); trophy.visible = false;
  { const lat = 5.0, fwd = 2.0, wx = x + Math.cos(yaw) * lat + Math.sin(yaw) * fwd, wz = z - Math.sin(yaw) * lat + Math.cos(yaw) * fwd; trophy.position.set(lat, getHeight(wx, wz) - ground, fwd); trophy.rotation.y = -0.2; group.add(trophy); trophy.userData.world = { x: wx, z: wz }; }
  let trophyShown = false, trophyPop = -1, trophyCollider = null;
  function refreshTrophy(live) {
    const on = !!trophyDef && !!combat?.cleared('glimmerfrost');
    if (on === trophyShown) return;
    trophyShown = on; trophy.visible = on;
    if (on && !trophyCollider) trophyCollider = addCollider({ ...trophy.userData.world, r: 0.7, owner: group });
    if (on && live) { trophyPop = 0; trophy.scale.setScalar(0.01); particles?.burst('sparkle', { x: trophy.userData.world.x, y: ground + 1.6, z: trophy.userData.world.z }, { count: 16, radius: 1.1, height: 0.9, color: '#cfeeff' }); sfx?.play('chime', { pitch: 1.2 }); }
    else trophy.scale.setScalar(1);
  }
  combat?.on('change', () => refreshTrophy(true));
  sync.on('snapshot', () => refreshTrophy(false));
  refreshTrophy(false);

  // ---- colliders: the rock lumps, the arch pillars and the opening itself (players stop at the doorway)
  const side = (lat, fwd = 0) => ({ x: x + Math.cos(yaw) * lat + Math.sin(yaw) * fwd, z: z - Math.sin(yaw) * lat + Math.cos(yaw) * fwd });
  for (const [lat, fwd, r] of [[-2.9, -0.7, 1.5], [2.9, -0.7, 1.5], [0, -2.0, 2.3], [-1.5, 0.9, 0.55], [1.5, 0.9, 0.55], [0, 0.2, 1.1]]) addCollider({ ...side(lat, fwd), r, owner: group });
  let enterHandler = () => {};
  const doorway = side(0, 1.7);
  addInteractable({ type: 'cavemouth', object: group, position: new THREE.Vector3(doorway.x, ground, doorway.z), radius: 1.5, prompt: 'Enter together',
    onInteract: (_it, p) => enterHandler(p) });

  let time = 0;
  return {
    id, label: 'the cave mouth', group, position: new THREE.Vector3(x, ground, z), front: { ...CAVE_MOUTH.front }, yaw,
    get open() { return true; },
    get trophy() { return { shown: trophyShown, mesh: trophy }; },
    isOpen: () => true,
    setEnterHandler(fn) { enterHandler = fn; },
    update(dt, t) {
      time += dt;
      mist.material.opacity = 0.42 + Math.sin(t * 1.9) * 0.1; mist.scale.set(1 + Math.sin(t * 1.3) * 0.03, 1.3, 1);
      if (trophyPop >= 0) { trophyPop += dt; const u = Math.min(1, trophyPop / 0.7); trophy.scale.setScalar(Math.max(0.01, u < 0.7 ? 1.18 * (u / 0.7) : 1.18 - 0.18 * ((u - 0.7) / 0.3))); if (u >= 1) { trophyPop = -1; trophy.scale.setScalar(1); } }
    },
    summary: () => ({ open: true, x, z, yaw, ground, trophy: trophyShown }),
  };
}
