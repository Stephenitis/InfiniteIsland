// The Rootgate (Step 56): the root-wrapped stone archway in home's eastern woods that is Wildroot Hollow's entrance from the island (the ritual portal is the other way in).
//
//   const gate = createRootgate({ scene, quests, sync, particles, sfx, hud });
//   gate.update(dt, t)                // once per tick (pop animation, glow)
//   gate.open / gate.position / gate.front / gate.yaw
//   gate.setEnterHandler((player) => ...)   game/dungeon.js: the "Enter together" confirmation (the gate itself only knows when it is open)
//   gate.preview(true | false | null) // debug: force open / closed (null = the real rule); nothing saved
//   gate.trophy                       // Step 57: the Patchkeeper trophy beside the arch: it appears once the saved combat progress (`combat`) says Wildroot's Wild mode is cleared
//                                     // (a small stone plinth with a crowned pumpkin; ONE merged mesh + hull, pops in with sparkles when the clear happens live, otherwise simply there)
//   gate.summary()
//
// Closed by brambles until the first feast (`quests.feasts >= 1`, like Cobble's arrival and the hat rack): a new party learns the cosy loop first. Everything derives from the
// synced feast count, so there is no domain: on load / late join the gate just shows its state (a replica waits for the host snapshot); when the count reaches 1 live the
// brambles puff, shrink away with an overshoot and the archway lights up, with a toast. The brambles hold a collider across the way (removed when open) and the interactable
// is always there ("Overgrown brambles" / "Enter together"). Draw calls: arch 2 (solid + outline hull) + brambles 2 or glow 1 = at most 4 (+1 shadow caster).
import * as THREE from 'three';
import { getHeight } from './terrain.js';
import { addCollider, removeCollider } from './colliders.js';
import { addInteractable } from './interactables.js';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../render/geo.js';
import { ROOTGATE } from './islands/rootgate.js';
import { AREAS } from '../game/areaLogic.js';

const stone = ['#b2b6c4', '#c7c6ce', '#a6adbc', '#bcb8c5', '#c9c6bb'];
const hash = (a, b = 0) => { const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return n - Math.floor(n); };
const box = new THREE.BoxGeometry(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);
/** A slim cylinder from a to b (the same trick the hat rack's pegs use). */
function tube(a, b, r, color, geo = G.cyl6) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length() || 1e-3;
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, d.clone().normalize()), 'XYZ');
  return part(geo, color, { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], r: [e.x, e.y, e.z], s: [r, len, r] });
}

/** The arch: two courses-of-stone pillars, a ring of arch stones, root vines wrapped round both and a few hanging ones (local space: +z is the front). */
function buildArchGeometry() {
  const parts = [], R = 2.15, rows = 6, top = rows * 0.62;
  for (const side of [-1, 1]) {
    parts.push(part(box, '#999eac', { p: [side * R, 0.17, 0], s: [1.55, 0.34, 1.35] }));
    for (let row = 0; row < rows; row++) {
      const h = hash(row + 3, side), skip = row === rows - 1 && h > 0.7;
      if (!skip) parts.push(part(box, stone[(row + (side > 0 ? 2 : 0)) % stone.length], { p: [side * R + (h - 0.5) * 0.08, 0.34 + 0.31 + row * 0.62, 0], s: [1.12, 0.58, 1.0], r: [0, (h - 0.5) * 0.12, 0] }));
    }
    // roots spiralling up the pillar
    const turns = 2.4, steps = 14;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps, ph = side > 0 ? 0.6 : 2.4;
      const at = (t) => [side * R + Math.cos(t * turns * Math.PI * 2 + ph) * 0.66, 0.2 + t * (top + 0.3), Math.sin(t * turns * Math.PI * 2 + ph) * 0.62];
      parts.push(tube(at(t0), at(t1), 0.1 - t0 * 0.03, i % 3 === 2 ? '#8c6a48' : '#7a5538'));
    }
    for (let i = 0; i < 4; i++) parts.push(part(G.sphereLo, i % 2 ? '#6aa462' : '#8cc476', { p: [side * (R + 0.55) + hash(i, side) * 0.2, 0.8 + i * 0.95, 0.5 + hash(i + 5, side) * 0.2], s: [0.3, 0.12, 0.2], r: [0, i, side * 0.5] }));
  }
  for (let n = 0; n <= 10; n++) {
    const a = -Math.PI / 2 + n * Math.PI / 10, x = Math.sin(a) * R, y = top + 0.15 + Math.cos(a) * R * 0.62, key = n === 5;
    parts.push(part(box, key ? '#c9c6bb' : stone[n % stone.length], { p: [x, y, 0], s: [key ? 0.78 : 0.64, key ? 0.62 : 0.52, 1.0], r: [0, 0, -a * 0.78] }));
  }
  // roots draped over the lintel, with vines hanging into the opening
  for (let n = 0; n < 10; n++) {
    const a0 = -Math.PI / 2 + n * Math.PI / 10, a1 = a0 + Math.PI / 10, r = R + 0.42, f = (a) => [Math.sin(a) * r, top + 0.15 + Math.cos(a) * R * 0.62 + 0.2, 0.5];
    parts.push(tube(f(a0), f(a1), 0.085, n % 2 ? '#7a5538' : '#8c6a48'));
  }
  for (const x of [-1.5, -0.7, 0.2, 1.1, 1.6]) {
    const len = 0.6 + hash(x * 7) * 0.8, y0 = top + 0.15 + Math.cos(Math.asin(x / R)) * R * 0.62 - 0.1;
    parts.push(tube([x, y0, 0.45], [x + 0.05, y0 - len, 0.45], 0.035, '#5fa66b'));
    parts.push(part(G.sphereLo, '#8cc476', { p: [x + 0.05, y0 - len, 0.45], s: [0.12, 0.2, 0.08] }));
  }
  // moss and roots at the feet
  for (let n = 0; n < 8; n++) {
    const side = n % 2 ? 1 : -1, a = n * 0.9;
    parts.push(part(G.sphereLo, n % 3 ? '#7a9e68' : '#5e8a5c', { p: [side * (R + 0.9 + hash(n) * 0.5), 0.05, hash(n + 9) * 1.2 - 0.3], s: [0.55, 0.12, 0.4], r: [0, a, 0] }));
  }
  return combine(parts);
}
/** The bramble mass that fills the opening (pivot at the ground, centre of the way). */
function buildBrambleGeometry() {
  const parts = [];
  const rnd = (i, k) => hash(i * 3.1 + k * 17.7);
  for (let i = 0; i < 16; i++) {
    const a = [-1.55, 0.15 + rnd(i, 1) * 3.0, rnd(i, 2) * 0.5 - 0.1], b = [1.55, 0.15 + rnd(i, 3) * 3.0, rnd(i, 4) * 0.5 - 0.1];
    if (i % 2) { a[0] = -1.55 + rnd(i, 5) * 3.1; b[0] = a[0] + (rnd(i, 6) - 0.5) * 1.4; a[1] = 0.1; b[1] = 2.6 + rnd(i, 7) * 0.8; }
    parts.push(tube(a, b, 0.07 + rnd(i, 8) * 0.04, i % 3 ? '#4c3b2e' : '#5d4d3a'));
    for (let k = 1; k <= 3; k++) {
      const t = k / 4, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      parts.push(part(G.cone6, '#8b7a64', { p: [p[0], p[1] + 0.08, p[2] + 0.1], s: [0.035, 0.18, 0.035], r: [Math.PI / 2 + k * 0.4, k, 0] }));
      parts.push(part(G.sphereLo, k % 2 ? '#6aa462' : '#4f8f5d', { p: [p[0] + 0.1, p[1], p[2] + 0.14], s: [0.2, 0.08, 0.14], r: [0, k + i, 0.5] }));
    }
  }
  for (let i = 0; i < 7; i++) parts.push(part(G.sphereLo, '#d3517f', { p: [-1.3 + rnd(i, 9) * 2.6, 0.3 + rnd(i, 10) * 2.6, 0.2], s: [0.09, 0.09, 0.09] }));
  for (let i = 0; i < 5; i++) parts.push(part(G.sphere, i % 2 ? '#5d8a58' : '#4c7a4e', { p: [-1.2 + i * 0.6, 0.35, 0.05], s: [0.55, 0.42, 0.4] }));
  return combine(parts);
}

/** The Patchkeeper trophy: a plinth, a crowned pumpkin with a tiny scowl and a little plaque (local space, +z is the front). */
function buildTrophyGeometry() {
  const parts = [];
  parts.push(part(box, '#a6adbc', { p: [0, 0.2, 0], s: [1.15, 0.4, 1.0] }));
  parts.push(part(box, '#c7c6ce', { p: [0, 0.46, 0], s: [0.92, 0.14, 0.8] }));
  parts.push(part(box, '#d8c9a0', { p: [0, 0.22, 0.51], s: [0.62, 0.22, 0.04] }));                              // the plaque
  parts.push(part(G.sphere, '#efbc7e', { p: [0, 0.95, 0], s: [0.46, 0.4, 0.42] }));
  for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; parts.push(part(G.sphereLo, i % 2 ? '#e5a766' : '#efbc7e', { p: [Math.sin(a) * 0.3, 0.95, Math.cos(a) * 0.27], s: [0.2, 0.38, 0.16] })); }
  parts.push(part(G.cyl6, '#619b73', { p: [0, 1.4, 0], s: [0.06, 0.2, 0.06] }));
  for (const side of [-1, 1]) {
    parts.push(part(G.sphereLo, '#514458', { p: [side * 0.15, 1.02, 0.38], s: [0.06, 0.09, 0.04] }));
    parts.push(part(G.cyl6, '#514458', { p: [side * 0.15, 1.15, 0.37], s: [0.025, 0.17, 0.025], r: [0, 0, side * -0.95] }));
    parts.push(part(G.sphereLo, '#a6cf7b', { p: [side * 0.22, 1.42, 0], s: [0.16, 0.05, 0.1], r: [0, 0, side * 0.6] }));
  }
  for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.5; parts.push(part(G.cone6, '#ffd24d', { p: [Math.sin(a) * 0.3, 1.5 - Math.abs(i - 2) * 0.04, Math.cos(a) * 0.04 - 0.02], s: [0.07, 0.2, 0.07] })); }
  parts.push(part(G.sphereLo, '#ffe27a', { p: [0, 1.6, 0], s: [0.07, 0.07, 0.07] }));
  const geo = combine(parts); geo.scale(1.3, 1.3, 1.3); return geo;                                                    // (a little bigger than life so it reads from the walk-up point)
}

export function createRootgate({ scene, quests, sync, particles, sfx = null, hud = null, combat = null }) {
  const { x, z, yaw } = ROOTGATE, ground = getHeight(x, z);
  const group = new THREE.Group(); group.name = 'rootgate'; group.position.set(x, ground, z); group.rotation.y = yaw; scene.add(group);
  const archGeo = buildArchGeometry(), arch = new THREE.Mesh(archGeo, VERTEX_TOON);
  arch.name = 'rootgate-arch'; arch.castShadow = true; arch.receiveShadow = true; arch.add(makeOutline(archGeo, 0.045)); group.add(arch);
  const brambleGeo = buildBrambleGeometry(), brambles = new THREE.Mesh(brambleGeo, VERTEX_TOON);
  brambles.name = 'rootgate-brambles'; brambles.receiveShadow = true; brambles.add(makeOutline(brambleGeo, 0.035)); group.add(brambles);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 28), new THREE.MeshBasicMaterial({ color: '#d4ffe2', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
  glow.name = 'rootgate-glow'; glow.position.set(0, 2.05, 0); glow.scale.set(0.96, 1.18, 1); glow.visible = false; group.add(glow);

  // ---- the Patchkeeper trophy (Step 57): beside the arch, hidden until Wildroot's Wild mode is cleared in the saved combat progress
  const trophyDef = AREAS.wildroot.trophy, trophyGeo = buildTrophyGeometry(), trophy = new THREE.Mesh(trophyGeo, VERTEX_TOON);
  trophy.name = 'rootgate-trophy'; trophy.scale.setScalar(1); trophy.castShadow = true; trophy.receiveShadow = true; trophy.add(makeOutline(trophyGeo, 0.04)); trophy.visible = false;
  { const lat = 4.3, fwd = 1.2, wx = x + Math.cos(yaw) * lat + Math.sin(yaw) * fwd, wz = z - Math.sin(yaw) * lat + Math.cos(yaw) * fwd; trophy.position.set(lat, getHeight(wx, wz) - ground, fwd); trophy.rotation.y = -0.18; group.add(trophy); trophy.userData.world = { x: wx, z: wz }; }
  let trophyShown = false, trophyPop = -1, trophyCollider = null;
  function refreshTrophy(live) {
    const on = !!trophyDef && !!combat?.cleared('wildroot');
    if (on === trophyShown) return;
    trophyShown = on; trophy.visible = on;
    if (on && !trophyCollider) trophyCollider = addCollider({ ...trophy.userData.world, r: 0.7, owner: group });
    if (!on && trophyCollider) { removeCollider(trophyCollider); trophyCollider = null; }
    if (on && live) { trophyPop = 0; trophy.scale.setScalar(0.01); particles?.burst('sparkle', { x: trophy.userData.world.x, y: ground + 1.6, z: trophy.userData.world.z }, { count: 16, radius: 1.1, height: 0.9, color: '#ffe27a' }); sfx?.play('chime', { pitch: 1.2 }); }
    else trophy.scale.setScalar(1);
  }
  combat?.on('change', () => refreshTrophy(true));
  sync.on('snapshot', () => refreshTrophy(false));
  refreshTrophy(false);

  // two pillar colliders (+ one across the way while the brambles are there); lateral = along the arch's width
  const side = (lat, fwd = 0) => ({ x: x + Math.cos(yaw) * lat + Math.sin(yaw) * fwd, z: z - Math.sin(yaw) * lat + Math.cos(yaw) * fwd });
  for (const lat of [-2.3, 2.3]) addCollider({ ...side(lat), r: 0.72, owner: group });
  let blocker = null;
  let enterHandler = () => {};
  const item = addInteractable({ type: 'rootgate', object: group, position: new THREE.Vector3(x, ground, z), radius: 1.2, prompt: 'Overgrown brambles',
    onInteract: (_it, p) => {
      if (isOpen()) enterHandler(p);
      else hud?.toast('Thick brambles block the way. Maybe after your first feast...', { icon: 'sparkle', duration: 3200 });
    } });

  let forced = null, popT = -1, shown = null, time = 0;
  const known = () => forced !== null || !sync.isReplica || sync.status === 'synced';   // a replica's feast count is only real after the host's snapshot
  const isOpen = () => (forced !== null ? forced : quests.feasts >= 1);
  function apply(open, live) {
    if (shown === open) return;
    const was = shown; shown = open;
    item.prompt = open ? 'Enter together' : 'Overgrown brambles';
    glow.visible = open;
    if (!open && !blocker) blocker = addCollider({ ...side(0), r: 1.9, owner: group });
    if (open && blocker) { removeCollider(blocker); blocker = null; }
    if (open && live && was === false) {
      popT = 0; brambles.visible = true; brambles.scale.setScalar(1);
      const at = new THREE.Vector3(x, ground + 1.4, z);
      particles?.burst('leaf', at, { count: 14, radius: 1.4, height: 0.6, color: '#6aa462' });
      particles?.burst('sparkle', { x, y: ground + 2.2, z }, { count: 12, radius: 1.2, height: 0.8 });
      sfx?.play('chime', { pitch: 1.1 });
      hud?.toast('The Rootgate has opened! A way into Wildroot Hollow.', { icon: 'sparkle', duration: 4200 });
    } else { popT = -1; brambles.visible = !open; brambles.scale.setScalar(1); }
  }
  function refresh(live) { if (known()) apply(isOpen(), live); }
  quests.on('change', () => refresh(true));
  sync.on('snapshot', () => refresh(false));
  refresh(false);

  return {
    group, position: new THREE.Vector3(x, ground, z), front: { ...ROOTGATE.front }, yaw,
    get open() { return !!shown; },
    get trophy() { return { shown: trophyShown, mesh: trophy }; },
    isOpen: () => !!shown,
    setEnterHandler(fn) { enterHandler = fn; },
    preview(value) { forced = value === null ? null : !!value; refresh(false); },
    update(dt, t) {
      time += dt;
      if (!known()) return;
      if (popT >= 0) {                                    // squash-and-vanish: swell a little, then shrink to nothing while turning
        popT += dt; const u = Math.min(1, popT / 0.9), s = u < 0.25 ? 1 + 0.25 * (u / 0.25) : 1.25 * (1 - (u - 0.25) / 0.75);
        brambles.scale.setScalar(Math.max(0.001, s)); brambles.rotation.y = u * 0.8;
        if (u >= 1) { popT = -1; brambles.visible = false; brambles.rotation.y = 0; }
      }
      if (trophyPop >= 0) { trophyPop += dt; const u = Math.min(1, trophyPop / 0.7); trophy.scale.setScalar(Math.max(0.01, u < 0.7 ? 1.18 * (u / 0.7) : 1.18 - 0.18 * ((u - 0.7) / 0.3))); if (u >= 1) { trophyPop = -1; trophy.scale.setScalar(1); } }
      if (shown) { glow.material.opacity = 0.62 + Math.sin(t * 2.2) * 0.1; glow.scale.set(0.96 + Math.sin(t * 1.7) * 0.02, 1.18, 1); }
    },
    summary: () => ({ open: !!shown, forced, x, z, yaw, ground, blocker: !!blocker, prompt: item.prompt, trophy: trophyShown }),
  };
}
