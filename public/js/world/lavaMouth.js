// The lava-tube mouth (Step 60): the island-side door of Cinder Tubes, on the volcano's east flank of Emberleaf. Like the Glimmerfrost cave mouth it needs no feast: you can only reach Emberleaf
// once its bridge is built, so it is simply open.
//
//   const mouth = createLavaMouth({ scene, sync, particles, sfx, combat });
//   mouth.update(dt, t)                       // once per tick (the glow breathing, embers drifting out, the trophy's pop-in)
//   mouth.id / mouth.label / mouth.position / mouth.front / mouth.yaw / mouth.isOpen()
//   mouth.setEnterHandler((player) => ...)    game/dungeon.js: the "Enter together" confirmation
//   mouth.trophy                              the Magma Toad trophy beside the mouth: it appears once the saved combat progress says Cinder Tubes' Wild mode is cleared (a basalt plinth with a
//                                             sleepy stone toad with a few glowing cracks; pops in with sparkles when the clear happens live, otherwise simply there)
//   mouth.summary()
//
// The mound is ONE merged mesh + outline hull (basalt lumps, an arch of dark blocks round the opening, obsidian spikes); the lava glow (inside the opening and a little pool in front) is one unlit mesh, and
// a few embers rise from it (ONE additive Points): 4 draw calls (+ the trophy's 2 once cleared). A few colliders keep players out of the rock and the opening.
import * as THREE from 'three';
import { getHeight } from './terrain.js';
import { addCollider } from './colliders.js';
import { addInteractable } from './interactables.js';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../render/geo.js';
import { LAVA_MOUTH } from './islands/lavaMouth.js';
import { CINDER } from '../game/areas/cinder.js';

const hash = (a, b = 0) => { const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return n - Math.floor(n); };
const box = new THREE.BoxGeometry(1, 1, 1);
const rock = ['#4a4150', '#3d3546', '#564b5c', '#443a4d'], dark = '#2a2233', obsidian = ['#2b2340', '#3a2f5a', '#241c36'], lavaCols = ['#ff8a3d', '#ffb347', '#ff6a2a', '#ffd45e'];

/** The mound: basalt lumps, a dark block arch round the opening, obsidian spikes and a ring of scorched stones in front (local space: +z is the front). */
function buildMoundGeometry() {
  const parts = [];
  for (const [i, [x, y, z, sx, sy, sz]] of [[0, 1.2, -1.6, 3.6, 2.7, 2.5], [-3.1, 0.85, -0.7, 1.9, 1.5, 1.8], [3.1, 0.85, -0.7, 1.9, 1.5, 1.8], [-1.8, 2.0, -2.3, 2.0, 1.8, 1.7], [1.8, 2.0, -2.3, 2.0, 1.8, 1.7], [0, 2.3, -3.0, 2.6, 2.3, 1.8]].entries()) {
    parts.push(part(G.ico1, rock[i % 4], { p: [x, y, z], s: [sx, sy, sz], r: [0.1 * i, hash(i, 3) * 6, 0.08] }));
    if (i % 2) parts.push(part(G.sphereLo, '#2f2838', { p: [x, y + sy * 0.78, z], s: [sx * 0.7, sy * 0.24, sz * 0.68] }));           // soot on the high ones
  }
  for (const side of [-1, 1]) for (let row = 0; row < 3; row++) parts.push(part(box, dark, { p: [side * 1.5, 0.3 + row * 0.62, 0.9], s: [0.72, 0.6, 0.8], r: [0, (hash(row, side) - 0.5) * 0.2, 0] }));   // the pillars
  for (let n = 0; n <= 8; n++) {                                                                                                         // the arch
    const a = -Math.PI / 2 + n * Math.PI / 8, x = Math.sin(a) * 1.5, y = 1.95 + Math.cos(a) * 1.35, key = n === 4;
    parts.push(part(box, key ? '#6b5a72' : rock[n % 4], { p: [x, y, 0.9], s: [key ? 0.8 : 0.66, key ? 0.72 : 0.56, 0.85], r: [0, 0, -a * 0.8] }));
  }
  for (const [x, z, len, tilt] of [[-2.6, 1.0, 1.7, 0.15], [2.7, 0.8, 1.4, -0.12], [-3.4, -0.4, 1.0, 0.25], [3.5, -0.2, 1.1, -0.2], [-1.9, 2.6, 0.7, 0.1], [2.2, 2.8, 0.8, -0.1]])           // obsidian spikes
    parts.push(part(G.cone6, obsidian[Math.floor(hash(x, z) * 3)], { p: [x, len / 2, z], s: [0.22 * len, len, 0.22 * len], r: [tilt, hash(z, x) * 6, -tilt] }));
  parts.push(part(G.sphere, '#120d1a', { p: [0, 1.15, 0.7], s: [1.28, 1.5, 0.5] }));                                                    // the dark inside of the opening
  parts.push(part(G.cyl8, '#3a3340', { p: [0, 0.02, 2.4], s: [2.7, 0.05, 2.2] }));                                                        // scorched ground in front
  for (let n = 0; n < 6; n++) parts.push(part(G.sphereLo, '#2a2233', { p: [-2.6 + n * 1.05 + (hash(n) - 0.5) * 0.5, 0.08, 2.5 + hash(n, 4) * 1.4], s: [0.5, 0.12, 0.4], r: [0, n, 0] }));   // stones
  return combine(parts);
}
/** The glow: the lava inside the opening, a little pool and a trickle in front (unlit vertex colours, one mesh). */
function buildGlowGeometry() {
  const parts = [];
  parts.push(part(G.sphere, '#ff7a2a', { p: [0, 1.1, 1.3], s: [1.0, 1.3, 0.12] }));
  parts.push(part(G.sphere, '#ffd45e', { p: [0, 0.9, 1.36], s: [0.55, 0.7, 0.1] }));
  parts.push(part(G.cyl8, '#ff6a2a', { p: [0.2, 0.06, 2.5], s: [1.15, 0.06, 0.8], r: [0, 0.3, 0] }));
  parts.push(part(G.cyl8, '#ffb347', { p: [0.2, 0.1, 2.5], s: [0.75, 0.05, 0.5], r: [0, 0.3, 0] }));
  parts.push(part(box, '#ff8a3d', { p: [0.05, 0.06, 1.45], s: [0.34, 0.05, 1.0] }));                                                      // the trickle from the opening to the pool
  for (const [x, z, k] of [[-2.0, 1.7, 0.7], [2.1, 1.5, 0.6], [-0.4, 3.4, 0.5]]) parts.push(part(G.cone6, lavaCols[Math.floor(hash(x, z) * 4)], { p: [x, 0.3 * k, z], s: [0.1 * k, 0.6 * k, 0.1 * k] }));   // glowing cracks
  return combine(parts);
}
/** The Magma Toad trophy: a basalt plinth, a sleepy stone toad with a few glowing cracks and a plaque (local space, +z is the front). */
function buildTrophyGeometry() {
  const parts = [];
  parts.push(part(box, '#4a4150', { p: [0, 0.2, 0], s: [1.15, 0.4, 1.0] }));
  parts.push(part(box, '#6b5a72', { p: [0, 0.46, 0], s: [0.92, 0.14, 0.8] }));
  parts.push(part(box, '#ff8a3d', { p: [0, 0.22, 0.51], s: [0.62, 0.22, 0.04] }));
  parts.push(part(G.sphere, '#7a8b6a', { p: [0, 0.88, 0], s: [0.46, 0.34, 0.4] }));
  parts.push(part(G.sphere, '#8a9b7a', { p: [0, 1.12, 0.18], s: [0.3, 0.22, 0.26] }));
  for (const side of [-1, 1]) {
    parts.push(part(G.sphereLo, '#2b2340', { p: [side * 0.14, 1.28, 0.3], s: [0.06, 0.03, 0.04] }));               // closed eyes
    parts.push(part(G.sphereLo, '#7a8b6a', { p: [side * 0.14, 1.3, 0.2], s: [0.08, 0.08, 0.08] }));
    parts.push(part(G.sphereLo, '#6a7b5a', { p: [side * 0.34, 0.74, 0.22], s: [0.12, 0.2, 0.14], r: [0, 0, side * 0.5] }));
  }
  for (const [x, y, z] of [[-0.15, 1.0, -0.08], [0.18, 0.92, 0.02], [0, 0.78, 0.32]]) parts.push(part(box, '#ff8a3d', { p: [x, y, z], s: [0.1, 0.03, 0.04], r: [0.3, x * 4, 0.2] }));   // glowing cracks
  const geo = combine(parts); geo.scale(1.3, 1.3, 1.3); return geo;
}

export function createLavaMouth({ scene, sync, particles, sfx = null, combat = null }) {
  const { x, z, yaw } = LAVA_MOUTH, ground = getHeight(x, z), id = LAVA_MOUTH.id;
  const group = new THREE.Group(); group.name = 'cinder-mouth'; group.position.set(x, ground, z); group.rotation.y = yaw; scene.add(group);
  const moundGeo = buildMoundGeometry(), mound = new THREE.Mesh(moundGeo, VERTEX_TOON);
  mound.name = 'lava-mouth-mound'; mound.castShadow = true; mound.receiveShadow = true; mound.add(makeOutline(moundGeo, 0.05)); group.add(mound);
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true }), glow = new THREE.Mesh(buildGlowGeometry(), glowMat); glow.name = 'lava-mouth-glow'; group.add(glow);
  // a few embers rising out of the opening (ONE additive Points, animated in update)
  const N = 14, ePos = new Float32Array(N * 3), embers = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(ePos, 3)),
    new THREE.PointsMaterial({ color: '#ffb347', size: 0.22, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  embers.name = 'lava-mouth-embers'; embers.frustumCulled = false; group.add(embers);

  // ---- the Magma Toad trophy (hidden until the clear is saved)
  const trophyDef = CINDER.trophy, trophyGeo = buildTrophyGeometry(), trophy = new THREE.Mesh(trophyGeo, VERTEX_TOON);
  trophy.name = 'lava-mouth-trophy'; trophy.castShadow = true; trophy.receiveShadow = true; trophy.add(makeOutline(trophyGeo, 0.04)); trophy.visible = false;
  { const lat = 5.0, fwd = 2.0, wx = x + Math.cos(yaw) * lat + Math.sin(yaw) * fwd, wz = z - Math.sin(yaw) * lat + Math.cos(yaw) * fwd; trophy.position.set(lat, getHeight(wx, wz) - ground, fwd); trophy.rotation.y = -0.2; group.add(trophy); trophy.userData.world = { x: wx, z: wz }; }
  let trophyShown = false, trophyPop = -1, trophyCollider = null;
  function refreshTrophy(live) {
    const on = !!trophyDef && !!combat?.cleared('cinder');
    if (on === trophyShown) return;
    trophyShown = on; trophy.visible = on;
    if (on && !trophyCollider) trophyCollider = addCollider({ ...trophy.userData.world, r: 0.7, owner: group });
    if (on && live) { trophyPop = 0; trophy.scale.setScalar(0.01); particles?.burst('sparkle', { x: trophy.userData.world.x, y: ground + 1.6, z: trophy.userData.world.z }, { count: 16, radius: 1.1, height: 0.9, color: '#ffb347' }); sfx?.play('chime', { pitch: 1.1 }); }
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
  addInteractable({ type: 'lavamouth', object: group, position: new THREE.Vector3(doorway.x, ground, doorway.z), radius: 1.5, prompt: 'Enter together',
    onInteract: (_it, p) => enterHandler(p) });

  let time = 0;
  return {
    id, label: 'the lava-tube mouth', group, position: new THREE.Vector3(x, ground, z), front: { ...LAVA_MOUTH.front }, yaw,
    get open() { return true; },
    get trophy() { return { shown: trophyShown, mesh: trophy }; },
    isOpen: () => true,
    setEnterHandler(fn) { enterHandler = fn; },
    update(dt, t) {
      time += dt;
      const k = 0.88 + Math.sin(t * 2.3) * 0.08 + Math.sin(t * 5.1) * 0.04;
      glowMat.color.setScalar(k);
      for (let i = 0; i < N; i++) {                                           // each ember rises from the opening, sways and starts over
        const u = (time * 0.35 + i / N) % 1;
        ePos[i * 3] = Math.sin(i * 12.7 + time) * 0.5 * u; ePos[i * 3 + 1] = 1.0 + u * 2.8; ePos[i * 3 + 2] = 1.0 + u * 1.2 + hash(i) * 0.4;
      }
      embers.geometry.attributes.position.needsUpdate = true;
      if (trophyPop >= 0) { trophyPop += dt; const u = Math.min(1, trophyPop / 0.7); trophy.scale.setScalar(Math.max(0.01, u < 0.7 ? 1.18 * (u / 0.7) : 1.18 - 0.18 * ((u - 0.7) / 0.3))); if (u >= 1) { trophyPop = -1; trophy.scale.setScalar(1); } }
    },
    summary: () => ({ open: true, x, z, yaw, ground, trophy: trophyShown }),
  };
}
