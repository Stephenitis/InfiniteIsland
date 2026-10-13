// Skipper's Cove (PLAN Step 68a): the dressing of Emberleaf's south-east bay: the beached outrigger wreck, Marlo's driftwood lean-to, tide-pool rocks, the plank bundle waiting on the reef rock at the end of the
// tide-pool hop course, the pile it joins at the wreck, and Biscuit the gull who carries it. The pure layout is world/islands/emberCove.js; the quest state is world/boat.js; Marlo himself is world/marlo.js;
// the course's pads and rules are world/hopCourses.js + game/hopLogic.js.
//
//   const cove = createCove({ scene, players, world, boat, hop, particles, sfx, hud, floatLabel, marlo })     once at load, on every screen (after createBoat / createHopCourses / createMarlo)
//   cove.registerPart(id, { goal, geometry })  add an external course pickup to Biscuit's queued ferry
//   cove.update(dt)            once per tick
//   cove.layout / cove.course / cove.summary()
//
// Before the unlock the cove is an empty beach: no wreck, no lean-to, no pads, no bundle, no colliders. The unlock (boat.unlocked) registers the colliders, the course and the part's interactable ONCE and
// builds the meshes the first time Emberleaf is in full detail; an unlock that arrives live pops the wreck and the lean-to in (world/popIn.js), a load / late join shows them silently. Everything here is a
// scene-level group (not part of the island's visuals), so `world.rebuild('ember')` can neither duplicate nor lose it. Draw calls at the cove (1 player): wreck 3, lean-to 2, rocks + pools 2, bundle 2,
// Biscuit 1, pads 2 + the glint ring 1 (+ Marlo's 7) = 20.
//
// A fetched part (host request `take {part}`, event on every screen): Biscuit flies from his perch to the part, picks it up and carries it over the cove to the wreck (BOAT.biscuitFlight s), where it joins
// the pile and Marlo cheers. Live deliveries queue on every screen and advance while Emberleaf is in full detail; a saved / snapshot load shows the delivered pile silently.
import { atBoatGoal } from '../game/boatLogic.js';
import * as THREE from 'three';
import { BOAT, ISLANDS } from '../config.js';
import { getHeight } from './terrain.js';
import { addCollider, removeCollider } from './colliders.js';
import { addInteractable, removeInteractable } from './interactables.js';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../render/geo.js';
import { createPopper } from './popIn.js';
import { coveLayout } from './islands/emberCove.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const hash = (a, b = 0) => { const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return n - Math.floor(n); };
const WOOD = ['#a86f43', '#9a6238', '#b57c4c', '#8c5a34'], SAND_STONE = ['#9d9aa0', '#8b8892', '#aaa6ad', '#7f7c86'];

/** The wrecked outrigger: a split hull on the sand, bare ribs, a mast stub, the outrigger float on two struts (world geometry, group at the origin). */
function wreckGeometry(L, groundY) {
  const w = L.wreck, yaw = w.yaw, y0 = groundY;
  const ax = [Math.sin(yaw), Math.cos(yaw)], pp = [Math.cos(yaw), -Math.sin(yaw)];                    // along the hull / across it
  const at = (u, v, y = 0) => [w.x + ax[0] * u + pp[0] * v, y0 + y, w.z + ax[1] * u + pp[1] * v];
  const parts = [];
  parts.push(part(G.sphere, WOOD[0], { p: at(0, 0, 0.5), s: [0.85, 0.58, 3.2], r: [0, yaw, 0.22] }));                 // the hull, rolled onto its side
  parts.push(part(G.sphere, '#4b3220', { p: at(0, 0.06, 0.92), s: [0.62, 0.18, 2.6], r: [0, yaw, 0.22] }));            // the dark open top
  for (let i = -3; i <= 3; i++) {                                                                                      // bare ribs on the broken side
    parts.push(part(BOX, WOOD[1 + (i & 1)], { p: at(i * 0.42, -0.62, 0.95), s: [0.09, 0.62, 0.13], r: [0, yaw, 0.55 + hash(i) * 0.3] }));
  }
  parts.push(part(BOX, WOOD[2], { p: at(-2.9, 0.1, 0.6), s: [0.5, 0.12, 0.2], r: [0.3, yaw, 0.2] }));                  // a loose plank at the bow
  parts.push(part(G.cyl8, '#a37a4b', { p: at(0.5, 0.15, 1.5), s: [0.13, 1.5, 0.13], r: [0.1, yaw, 0.5] }));            // the broken mast stub
  parts.push(part(G.cone6, '#8a6238', { p: at(0.5 + 0.55, 0.33, 2.15), s: [0.13, 0.32, 0.13], r: [0.1, yaw, 0.5 + 3.0] }));
  parts.push(part(G.sphere, '#c9a46a', { p: at(0.2, 2.7, 0.42), s: [0.3, 0.26, 2.3], r: [0, yaw, 0.04] }));            // the outrigger float, out towards the sea
  for (const u of [-1.1, 1.3]) parts.push(part(BOX, '#7a5130', { p: at(u, 1.5, 0.85), s: [2.8, 0.09, 0.1], r: [0, yaw + Math.PI / 2 * 0 , -0.08] }));
  parts.push(part(G.cyl8, '#d8c9a0', { p: at(0.2, 2.7, 0.7), s: [0.05, 0.5, 0.05], r: [0, yaw, 1.4] }));              // a tangle of rope
  return combine(parts);
}

/** Marlo's lean-to: driftwood posts, a patched sailcloth roof, a crate and a barrel, a mat (local frame turned by the shore yaw). */
function leanToGeometry(L, groundY) {
  const t = L.leanTo, yaw = t.yaw, c = Math.cos(yaw), s = Math.sin(yaw);
  const W = (x, z) => [t.x + c * x + s * z, t.z - s * x + c * z];
  const at = (x, y, z) => { const q = W(x, z); return [q[0], groundY + y, q[1]]; };
  const parts = [];
  for (const [x, z, h, lean] of [[-1.3, 1.0, 1.9, 0.05], [1.3, 1.0, 1.85, -0.05], [-1.3, -1.0, 1.35, 0.04], [1.3, -1.0, 1.3, -0.04]]) parts.push(part(G.cyl6, WOOD[(x > 0) + (z > 0) * 2], { p: at(x, h / 2, z), s: [0.1, h, 0.1], r: [0, 0, lean] }));
  parts.push(part(BOX, '#e6dabd', { p: at(0, 1.62, 0), s: [3.1, 0.06, 2.5], r: [-0.2, 0, 0], }));                          // the sailcloth roof, tilted down toward the back
  parts.push(part(BOX, '#c0453d', { p: at(-0.7, 1.665, 0.1), s: [0.8, 0.02, 0.8], r: [-0.2, 0, 0] }));                        // a red patch
  parts.push(part(BOX, '#9bb3c9', { p: at(0.8, 1.66, -0.4), s: [0.7, 0.02, 0.6], r: [-0.2, 0, 0] }));                         // and a blue one
  parts.push(part(BOX, '#8c5a34', { p: at(0, 0.7, -1.18), s: [2.6, 1.3, 0.06] }));                                            // the back wall of driftwood boards
  for (let k = 0; k < 5; k++) parts.push(part(BOX, WOOD[k % 4], { p: at(-1.04 + k * 0.52, 0.7, -1.15), s: [0.5, 1.28, 0.05] }));
  parts.push(part(G.cyl8, '#cdb98e', { p: at(0, 0.03, 0.1), s: [1.1, 0.05, 1.1] }));                                          // a woven mat
  parts.push(part(BOX, '#a77a48', { p: at(1.9, 0.28, 0.6), s: [0.6, 0.55, 0.5], r: [0, 0.3, 0] }));                           // a crate
  parts.push(part(G.cyl8, '#7a5a3a', { p: at(2.0, 0.34, -0.3), s: [0.32, 0.68, 0.32] }));                                     // a barrel
  parts.push(part(G.cyl8, '#4a3a2a', { p: at(2.0, 0.7, -0.3), s: [0.3, 0.04, 0.3] }));
  parts.push(part(G.sphere, '#f2dfbd', { p: at(-1.9, 0.1, 0.8), s: [0.16, 0.08, 0.13], r: [0, 0.6, 0] }));                    // clam shells by the door
  parts.push(part(G.sphere, '#f2dfbd', { p: at(-2.15, 0.08, 0.5), s: [0.13, 0.07, 0.11], r: [0, 1.1, 0] }));
  parts.push(part(G.sphere, '#e5cfa3', { p: at(-1.75, 0.07, 1.15), s: [0.12, 0.06, 0.1], r: [0, 2.2, 0] }));
  return combine(parts);
}

/** Tide-pool rocks along the shore and three little pools of clear water in the sand. */
function dressGeometry(L, groundY) {
  const parts = [];
  L.rocks.forEach((r, i) => {
    const y = Math.max(getHeight(r.x, r.z), 0.05);
    parts.push(part(G.ico1, SAND_STONE[i % 4], { p: [r.x, y + r.r * 0.3, r.z], s: [r.r, r.r * 0.7, r.r * 0.9], r: [0.1 * i, i * 1.3, 0.08] }));
    if (i % 2 === 0) parts.push(part(G.sphereLo, SAND_STONE[(i + 1) % 4], { p: [r.x + r.r * 0.9, y + 0.08, r.z + r.r * 0.3], s: [r.r * 0.45, r.r * 0.3, r.r * 0.4] }));
  });
  for (const [i, r] of L.rocks.slice(0, 3).entries()) {                                  // pools: shallow flat discs of tinted water beside the first three rocks
    const x = r.x + 1.1 * (i - 1), z = r.z - 1.0;
    parts.push(part(G.cyl8, '#6fb8d6', { p: [x, Math.max(getHeight(x, z), 0.05) + 0.015, z], s: [0.7 + 0.15 * i, 0.03, 0.55 + 0.1 * i], r: [0, i, 0] }));
  }
  return combine(parts);
}

/** Six boards tied with rope (origin at the bottom centre). */
function bundleGeometry() {
  const parts = [];
  for (let i = 0; i < 6; i++) parts.push(part(BOX, WOOD[i % 4], { p: [(i % 3 - 1) * 0.2, 0.08 + Math.floor(i / 3) * 0.17, 0], s: [0.17, 0.13, 1.25], r: [0, (hash(i) - 0.5) * 0.12, 0] }));
  for (const z of [-0.35, 0.35]) parts.push(part(G.cyl8, '#d8c9a0', { p: [0, 0.18, z], s: [0.36, 0.2, 0.025], r: [Math.PI / 2, 0, 0] }));
  return combine(parts);
}

/** Biscuit: a small gull (one merged mesh; he flutters by scaling). */
function gullGeometry() {
  const parts = [];
  parts.push(part(G.sphere, '#f6f6f2', { p: [0, 0.16, 0], s: [0.14, 0.12, 0.22] }));
  parts.push(part(G.sphere, '#f6f6f2', { p: [0, 0.3, 0.17], s: [0.095, 0.095, 0.095] }));
  parts.push(part(G.cone6, '#f0a43a', { p: [0, 0.29, 0.31], s: [0.035, 0.1, 0.035], r: [Math.PI / 2, 0, 0] }));
  parts.push(part(G.sphereLo, '#2b2340', { p: [0.06, 0.33, 0.23], s: [0.02, 0.02, 0.02] }));
  parts.push(part(G.sphereLo, '#2b2340', { p: [-0.06, 0.33, 0.23], s: [0.02, 0.02, 0.02] }));
  parts.push(part(G.sphere, '#9aa3b2', { p: [0.15, 0.2, -0.02], s: [0.16, 0.03, 0.2], r: [0, 0.2, -0.25] }));
  parts.push(part(G.sphere, '#9aa3b2', { p: [-0.15, 0.2, -0.02], s: [0.16, 0.03, 0.2], r: [0, -0.2, 0.25] }));
  parts.push(part(G.cone6, '#9aa3b2', { p: [0, 0.17, -0.27], s: [0.07, 0.16, 0.025], r: [-Math.PI / 2, 0, 0] }));
  parts.push(part(G.cyl6, '#f0a43a', { p: [0.04, 0.03, 0.02], s: [0.012, 0.06, 0.012] }));
  parts.push(part(G.cyl6, '#f0a43a', { p: [-0.04, 0.03, 0.02], s: [0.012, 0.06, 0.012] }));
  return combine(parts);
}

const meshOf = (geo, { cast = false, outline = 0.04 } = {}) => {
  const m = new THREE.Mesh(geo, VERTEX_TOON);
  m.castShadow = cast; m.receiveShadow = true; m.frustumCulled = false;
  if (outline) m.add(makeOutline(geo, outline));
  return m;
};

export function createCove({ scene, players, world = null, boat, hop, particles = null, sfx = null, hud = null, floatLabel = null, marlo = null }) {
  const island = ISLANDS.find((i) => i.id === 'ember');
  const L = coveLayout(island), course = L.course;
  const groundY = 0.3;                                               // the cove's sand (the layout was chosen on it)
  const goalPad = course.pads.find((p) => p.id === course.goal);
  const pileY = getHeight(L.bundle.x, L.bundle.z);
  const group = new THREE.Group();
  group.name = 'skippers-cove';
  group.visible = false;
  scene.add(group);
  const popper = createPopper({ parent: group });
  const snd = (name, opts) => { if (sfx) sfx.play(name, opts); };
  const parts = {};                                                  // wreck, leanTo, dress, bundle, gull meshes
  let built = false, gameplay = false, pop = false, partItem = null;
  const pickups = {}; const flightQueue = [];
  const coveColliders = [];
  let flight = null;                                                 // { t, phase } while Biscuit carries a part
  let time = 0, perchT = 0;
  const gull = { pos: new THREE.Vector3(L.perch.x, L.perch.y, L.perch.z), yaw: 0 };

  boat.setGoals({ planks: { x: goalPad.x, z: goalPad.z, top: goalPad.top } });

  // ------------------------------------------------------------------ gameplay (registered once, on the unlock)
  function registerGameplay() {
    if (gameplay) return;
    gameplay = true;
    for (const c of L.wreck.colliders) coveColliders.push(addCollider({ x: c.x, z: c.z, r: c.r, owner: group }));
    coveColliders.push(addCollider({ x: L.leanTo.x, z: L.leanTo.z, r: L.leanTo.r, owner: group }));
    hop.add(course, { island: 'ember' });
    syncPartItem();
  }
  function unregisterGameplay() { for (const c of coveColliders.splice(0)) removeCollider(c); hop.remove(course); if (partItem) { removeInteractable(partItem); partItem = null; } gameplay = false; }
  function syncPartItem() {                                          // "Take the planks" waits on the stern rock until somebody fetches it
    const want = boat.unlocked && !boat.has('planks');
    if (want && !partItem) {
      partItem = addInteractable({
        type: 'boatpart', object: null, position: new THREE.Vector3(goalPad.x, goalPad.top, goalPad.z), radius: 1.1, canInteract: (pos) => atBoatGoal(pos, goalPad), prompt: 'Take the planks',
        onInteract: (item, by) => take(by || players.p1, 'planks'),
      });
    } else if (!want && partItem) { removeInteractable(partItem); partItem = null; }
  }
  function take(player, part) {
    const r = boat.take(player, part);
    const after = (res) => {
      if (res && res.ok) { snd('equip', { vol: 0.6 }); if (floatLabel) floatLabel('Planks!', { x: goalPad.x, y: goalPad.top + 1.4, z: goalPad.z }, null, null); }
      else if (res && res.reason === 'far' && hud) hud.toast('Come a little closer!', { icon: 'sparkle', duration: 1800 });
    };
    if (r && typeof r.then === 'function') r.then(after); else after(r);
    return true;
  }

  // ------------------------------------------------------------------ meshes (built the first time the cove is unlocked AND Emberleaf is drawn in full)
  function build() {
    built = true;
    parts.wreck = meshOf(wreckGeometry(L, groundY), { cast: true });
    parts.leanTo = meshOf(leanToGeometry(L, groundY), { outline: 0.035 });
    parts.dress = meshOf(dressGeometry(L, groundY), { outline: 0.035 });
    const bg = bundleGeometry();
    parts.bundle = meshOf(bg, { outline: 0.03 });
    parts.gull = meshOf(gullGeometry(), { outline: 0 });
    for (const k of ['wreck', 'leanTo', 'dress', 'bundle', 'gull']) group.add(parts[k]);
    placeBundle();
    if (pop) {                                                       // a live unlock: the wreck and the lean-to drop in (the temporary pop meshes hide the real ones until they settle)
      pop = false;
      parts.wreck.visible = parts.leanTo.visible = false;
      const land = (p) => { snd('thud', { pitch: 0.7, vol: 0.7 }); if (particles) particles.burst('puff', { x: p.x, y: p.y + 0.3, z: p.z }, { count: 8, radius: 1.2, height: 0.3, size: 1.5, speed: 1.2 }); };
      popper.add(wreckGeometry(L, groundY), { delay: 0.1, drop: 3.2, outline: 0.04, cast: true, onLand: land });
      popper.add(leanToGeometry(L, groundY), { delay: 0.7, drop: 2.6, outline: 0.035, onLand: land });
      popper.whenIdle(() => { parts.wreck.visible = parts.leanTo.visible = true; });
    }
  }
  function placeBundle() {
    const b = parts.bundle;
    if (!b) return;
    if (flight && flight.part === 'planks' && flight.phase === 0) b.position.set(goalPad.x, goalPad.top, goalPad.z);
    else if (flight && flight.part === 'planks' && flight.phase === 1) b.position.copy(gull.pos).add(new THREE.Vector3(0, -0.5, 0));
    else if (boat.has('planks')) { b.position.set(L.bundle.x, pileY, L.bundle.z); b.rotation.y = L.bundle.yaw; return; }
    else { b.position.set(goalPad.x, goalPad.top, goalPad.z); b.rotation.y = 0.5; return; }
    if (flight && flight.part === 'planks' && flight.phase === 0) b.rotation.y = 0.5;
    else if (flight && flight.part === 'planks' && flight.phase === 1) b.rotation.y = gull.yaw + Math.PI / 2;
  }

  // External course pickups share Biscuit's ferry; their mesh is pooled here so a rebuild cannot duplicate the delivered pile.
  function registerPart(id, { goal, geometry }) {
    pickups[id] = { goal, geometry, mesh: null };
  }
  function placePickups() {
    for (const [id, item] of Object.entries(pickups)) {
      if (!item.mesh && built) { item.mesh = meshOf(item.geometry(), { outline: 0.03 }); item.mesh.frustumCulled = true; group.add(item.mesh); }
      const m = item.mesh; if (!m) continue;
      const held = flight && flight.part === id;
      if (held && flight.phase === 1) { m.position.copy(gull.pos); m.position.y -= 0.5; m.rotation.y = gull.yaw; }
      else if (boat.has(id) && !(held && flight.phase === 0) && !flightQueue.includes(id)) {
        const offset = Object.keys(pickups).indexOf(id) * 0.65;
        m.position.set(L.bundle.x + offset - 0.6, pileY + 0.12, L.bundle.z + 0.7); m.rotation.y = 0.4;
      } else { m.position.set(item.goal.x, item.goal.top, item.goal.z); m.rotation.y = 0.5; }
    }
  }
  boat.on((info) => {
    if (info.kind === 'unlock' || info.kind === 'set') {
      if (boat.unlocked) { if (info.live && info.kind === 'unlock') pop = true; registerGameplay(); } else unregisterGameplay();
      flight = null; flightQueue.length = 0;
      syncPartItem(); placeBundle(); placePickups();
    } else if (info.kind === 'take') {
      syncPartItem();
      if (info.live && boat.unlocked) {
        if (flight) flightQueue.push(info.part); else flight = { t: 0, phase: 0, part: info.part };
      }
      placeBundle(); placePickups();
    }
  });
  if (boat.unlocked) registerGameplay();

  // ------------------------------------------------------------------ Biscuit's flight
  const T0 = 1.0, T2 = 1.0;
  function updateGull(dt) {
    const g = parts.gull;
    if (!g) return;
    const perch = new THREE.Vector3(L.perch.x, L.perch.y, L.perch.z);
    const source = flight && pickups[flight.part] ? pickups[flight.part].goal : goalPad;
    let fly = 0;
    if (flight) {
      flight.t += dt;
      const from = flight.phase === 0 ? perch : flight.phase === 1 ? new THREE.Vector3(source.x, source.top + 0.9, source.z) : new THREE.Vector3(L.bundle.x, pileY + 0.7, L.bundle.z);
      const to = flight.phase === 0 ? new THREE.Vector3(source.x, source.top + 0.9, source.z) : flight.phase === 1 ? new THREE.Vector3(L.bundle.x, pileY + 0.7, L.bundle.z) : perch;
      const dur = flight.phase === 0 ? T0 : flight.phase === 1 ? BOAT.biscuitFlight : T2;
      const u = Math.min(1, flight.t / dur), e = u * u * (3 - 2 * u);
      gull.pos.lerpVectors(from, to, e);
      gull.pos.y += Math.sin(u * Math.PI) * (flight.phase === 1 ? 2.4 : 1.2);
      gull.yaw = Math.atan2(to.x - from.x, to.z - from.z);
      fly = 1;
      if (u >= 1) {
        flight.t = 0; flight.phase += 1;
        if (flight.phase === 1) snd('equip', { pitch: 1.4, vol: 0.4 });
        if (flight.phase === 2) {                                    // landed at the wreck: the part joins the pile, the skipper cheers
          flight.phase = 2; placeBundle();
          snd('thud', { pitch: 1.1, vol: 0.5 });
          if (particles) particles.burst('sparkle', { x: L.bundle.x, y: pileY + 0.5, z: L.bundle.z }, { count: 10, radius: 0.7, height: 0.8, speed: 1.1 });
          if (marlo && marlo.shown) marlo.cheer();
        }
        if (flight.phase > 2) { flight = flightQueue.length ? { t: 0, phase: 0, part: flightQueue.shift() } : null; fly = 0; }
      }
    } else {
      perchT += dt;
      gull.pos.copy(perch);
      gull.pos.y += 0.02 * Math.sin(perchT * 2);
      gull.yaw = Math.sin(perchT * 0.25) * 1.2 + 0.5;
    }
    g.position.copy(gull.pos);
    g.rotation.y = gull.yaw;
    g.scale.set(1, fly ? 1 + 0.12 * Math.sin(time * 30) : 1, 1);       // a flutter
    placeBundle(); placePickups();
  }

  function update(dt) {
    time += dt;
    const full = !world || !world.regions || world.regions.isFull('ember');
    const want = boat.unlocked && full;
    if (want && !built) build();
    group.visible = want && built;
    if (!group.visible) return;
    popper.update(dt);
    updateGull(dt);
  }

  return {
    update, registerPart, layout: L, course, group,
    get built() { return built; },
    get flight() { return flight; },
    summary() {
      let calls = 0;
      if (group.visible) group.traverse((o) => { if (o.isMesh && o.visible) calls += o.castShadow ? 2 : 1; });
      return {
        unlocked: boat.unlocked, built, visible: group.visible, drawCalls: calls, flight: flight ? { phase: flight.phase, t: +flight.t.toFixed(2) } : null, partInteractable: !!partItem,
        bundleAt: parts.bundle ? [+parts.bundle.position.x.toFixed(1), +parts.bundle.position.y.toFixed(2), +parts.bundle.position.z.toFixed(1)] : null,
        goal: { x: +goalPad.x.toFixed(1), z: +goalPad.z.toFixed(1), top: goalPad.top }, start: course.pads[0] ? { x: +course.pads[0].x.toFixed(1), z: +course.pads[0].z.toFixed(1) } : null,
      };
    },
  };
}
