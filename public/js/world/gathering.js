// Gathering (PLAN Step 13): everything on the island that gives ingredients without being chopped or broken.
//
//   berries     berry bushes (props.js builds 7 with a separate 'berries' mesh): rustling one drops 2-3 berry PICKUPS, its berries are hidden
//               (empty, but it still rustles) for ~45 s, then pop back.
//   herbs       ~12 instanced leafy plants ('herb' interactables, prompt "Pick"): +1 Herb straight into the bag, regrows after ~60 s.
//   mushrooms   the mushroom clusters ('mushroom', "Pick"): +1-2 Mushroom straight into the bag, regrow after ~60 s.
//   dig spots   ~6 cracked-soil mounds ('digspot'). With the Shovel the prompt is "Dig" (items/tools.js -> 'dig'): the player plays the plunge
//               animation, dirt flies, 1-2 potato PICKUPS pop out, the spot becomes a hole decal that fades over ~3 s, and a new spot appears at
//               another valid place ~40 s later. Without a shovel: "Dig spot" and a "You need a shovel to dig!" toast.
//
//   const gathering = createGathering({ scene, players, props, items, particles, hud, sfx, pickups, collect, camera: followCam });
//   gathering.dig(item, player)   // main.js: the player pressed Interact on a digspot while holding the shovel (starts the plunge; the dig
//                                 // itself lands at the impact frame). false if ignored (already swinging / spot busy)
//   gathering.release(player)     // a player left: forget its pending dig
//   gathering.update(dt)          // once per tick, AFTER items.update / players.update
//   gathering.states / gathering.regrowNow() / gathering.digSpots   // debug
// `collect(id, n, worldPos, player)` (main.js) puts things into the shared inventory with the floating "+1 Herb" text.
// Regrow timers run on the simulation clock (update(dt)), so __game.step fast-forwards them.
import * as THREE from 'three';
import { WORLD_SEED } from '../config.js';
import { mulberry32 } from '../utils/rng.js';
import { SPAWN, getHeight } from './terrain.js';
import { addInteractable, removeInteractable, restoreInteractable, getInteractables } from './interactables.js';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../render/geo.js';

const TAU = Math.PI * 2;
const BERRY_REGROW = 45;       // s
const HERB_REGROW = 60;
const MUSHROOM_REGROW = 60;
const DIG_SPOTS = 6;
const DIG_RESPAWN = 40;
const DIG_IMPACT = 0.58;       // shovel swing progress at which the blade hits the soil
const HOLE_HOLD = 0.6;         // s the hole stays fully dark before it fades
const HOLE_FADE = 3;           // s
const POP_TIME = 0.5;

const rnd = (a, b) => a + Math.random() * (b - a);
const easeOutBack = (u) => { const c = 1.9, v = u - 1; return 1 + (c + 1) * v * v * v + c * v * v; };

/** Cracked-soil mound: a low dirt dome with a few dark cracks radiating from the top and a couple of pebbles. */
function buildMound() {
  const parts = [
    part(G.ico2, '#8a5a3a', { p: [0, 0.02, 0], s: [0.66, 0.27, 0.62] }),
    part(G.ico2, '#a8743f', { p: [-0.04, 0.06, 0.02], s: [0.5, 0.25, 0.47] }),
    part(G.ico1, '#b9b4cc', { p: [0.36, 0.05, 0.3], s: [0.1, 0.07, 0.09] }),
    part(G.ico1, '#d3cfe6', { p: [-0.42, 0.04, -0.2], s: [0.07, 0.05, 0.07] }),
  ];
  for (let i = 0; i < 5; i++) {                              // cracks: thin dark slivers lying on the dome
    const a = (i / 5) * TAU + 0.3;
    const rr = 0.2 + (i % 2) * 0.06;
    const y = 0.06 + 0.26 * Math.sqrt(Math.max(0, 1 - (rr / 0.52) ** 2));
    parts.push(part(G.sphereLo, '#4a2d1a', { p: [Math.cos(a) * rr, y, Math.sin(a) * rr], r: [0, -a, 0.35], s: [0.15, 0.022, 0.03] }));
  }
  return combine(parts);
}

export function createGathering({ scene, players, props, items, particles, hud, sfx = null, pickups, collect, camera = null }) {
  const snd = (name, opts) => { if (sfx) sfx.play(name, opts); };
  let time = 0;
  const timers = [];                                          // { at, fn }
  const later = (delay, fn) => timers.push({ at: time + delay, fn });
  const nearPlayer = (x, z, d) => players.list.some((p) => Math.hypot(p.position.x - x, p.position.z - z) < d);

  const root = new THREE.Group();
  root.name = 'gathering';
  scene.add(root);

  // =========================================================================================== berries
  const bushes = [];
  for (const g of props.handles.bushes) {
    const mesh = g.userData.berries;
    const item = g.userData.interactable;
    if (!mesh || !item) continue;
    const b = { g, mesh, item, full: true, regrowAt: 0, popT: -1 };
    const base = item.onInteract;                              // interactions.js: the rustle animation + leaves
    item.onInteract = (it, by) => { if (base) base(it, by); pickBerries(b, by); };
    bushes.push(b);
  }

  function pickBerries(b, by) {
    if (!b.full) return;                                       // an empty bush still rustles (base handler), nothing falls
    b.full = false;
    b.regrowAt = time + BERRY_REGROW;
    const g = b.g;
    const top = { x: g.position.x, y: g.position.y + 1.0 * g.scale.y, z: g.position.z };
    later(0.14, () => {
      b.mesh.visible = false;
      particles.burst('petal', top, { count: 5, radius: 0.5, color: '#ff4d6d', speed: 0.8, size: 0.7 });
      const n = 2 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) pickups.spawn('berry', { x: top.x + rnd(-0.25, 0.25), y: top.y, z: top.z + rnd(-0.25, 0.25) });
    });
  }

  function growBerries(b) {
    b.full = true;
    b.popT = 0;
    b.mesh.visible = true;
    b.mesh.scale.setScalar(0.01);
    const g = b.g;
    if (nearPlayer(g.position.x, g.position.z, 18)) {
      particles.burst('sparkle', { x: g.position.x, y: g.position.y + 1.1 * g.scale.y, z: g.position.z }, { count: 4, radius: 0.6, color: '#ff9fb0' });
      snd('pop', { pitch: 1.5, vol: 0.45 });
    }
  }

  // =========================================================================================== herbs
  const herbData = props.handles.herbs;
  const herbs = [];
  const dummy = new THREE.Object3D();
  function setHerb(r, k) {
    const h = r.h;
    dummy.position.set(h.x, h.y, h.z);
    dummy.rotation.set(0, h.rot, 0);
    dummy.scale.setScalar(Math.max(0.0001, h.s * k));
    dummy.updateMatrix();
    herbData.mesh.setMatrixAt(h.index, dummy.matrix);
    herbData.mesh.instanceMatrix.needsUpdate = true;
  }
  if (herbData) {
    for (const h of herbData.list) {
      const r = { h, state: 'ready', regrowAt: 0, t: 0, item: null };
      r.item = addInteractable({
        type: 'herb', object: null, position: new THREE.Vector3(h.x, h.y, h.z), radius: 0.35, prompt: 'Pick',
        onInteract: (it, by) => pickHerb(r, by),
      });
      herbs.push(r);
    }
  }

  function pickHerb(r, by) {
    if (r.state !== 'ready') return;
    r.state = 'hidden';
    r.regrowAt = time + HERB_REGROW;
    setHerb(r, 0);
    removeInteractable(r.item);
    const { x, y, z } = r.h;
    particles.burst('leaf', { x, y: y + 0.3, z }, { count: 8, radius: 0.25, speed: 0.9, height: 0.2 });
    snd('rustle', { vol: 0.6 });
    if (by) by.squash(-0.14);
    collect('herb', 1, { x, y: y + 0.8, z }, by);
  }

  // =========================================================================================== mushrooms
  const mushrooms = [];
  for (const mesh of props.handles.mushrooms) {
    const r = { mesh, state: 'ready', regrowAt: 0, t: 0, item: null };
    r.item = addInteractable({
      type: 'mushroom', object: mesh, position: mesh.position.clone(), radius: 0.55, prompt: 'Pick',
      onInteract: (it, by) => pickMushroom(r, by),
    });
    mesh.userData.interactable = r.item;
    mushrooms.push(r);
  }

  function pickMushroom(r, by) {
    if (r.state !== 'ready') return;
    r.state = 'hidden';
    r.regrowAt = time + MUSHROOM_REGROW;
    r.mesh.visible = false;
    removeInteractable(r.item);
    const p = r.mesh.position;
    particles.burst('puff', { x: p.x, y: p.y + 0.3, z: p.z }, { count: 4, radius: 0.3, color: '#fff4dc' });
    particles.burst('sparkle', { x: p.x, y: p.y + 0.4, z: p.z }, { count: 3, radius: 0.3, color: '#ffb3c0' });
    snd('pop', { pitch: 0.9 });
    if (by) by.squash(-0.14);
    collect('mushroom', 1 + (Math.random() < 0.5 ? 1 : 0), { x: p.x, y: p.y + 0.8, z: p.z }, by);
  }

  // =========================================================================================== dig spots
  const moundGeo = buildMound();
  const moundOutline = makeOutline(moundGeo, 0.03).geometry;
  const spotPool = [];
  const spots = [];                                           // live spots: { x, y, z, g, item, state, sparkleAt, popT }
  const respawns = [];                                        // times at which a new spot is due
  const holeDisc = new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2);
  const holes = [];                                           // fading hole decals: { g, hole, rim, age, busy }
  const pending = new Map();                                  // Player -> { player, spot, t }

  function takeMound() {
    let g = spotPool.pop();
    if (!g) {
      g = new THREE.Group();
      g.name = 'dig-spot';
      const mesh = new THREE.Mesh(moundGeo, VERTEX_TOON);
      mesh.castShadow = false; mesh.receiveShadow = true;
      mesh.add(makeOutline(moundGeo, 0.03, moundOutline));
      g.add(mesh);
      root.add(g);
    }
    g.visible = true;
    return g;
  }

  function takeHole() {
    let h = holes.find((q) => !q.busy);
    if (!h) {
      const mk = (color) => new THREE.MeshBasicMaterial({
        color, transparent: true, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      });
      const rimMat = mk('#8a5a3a'), holeMat = mk('#3b2413');
      const rim = new THREE.Mesh(holeDisc, rimMat); rim.scale.setScalar(0.8); rim.position.y = 0.05; rim.renderOrder = 2;
      const hole = new THREE.Mesh(holeDisc, holeMat); hole.scale.setScalar(0.5); hole.position.y = 0.07; hole.renderOrder = 3;
      const g = new THREE.Group();
      g.name = 'dig-hole';
      g.add(rim, hole);
      root.add(g);
      h = { g, rim, hole, rimMat, holeMat, age: 0, busy: false };
      holes.push(h);
    }
    h.busy = true; h.age = 0; h.g.visible = true;
    return h;
  }

  function locationOk(x, z, minFromPlayers) {
    if (!props.spotOk(x, z, 0.7)) return false;
    for (const t of props.handles.trees) if (Math.hypot(t.position.x - x, t.position.z - z) < 4.6) return false;   // not hidden behind a canopy
    for (const it of getInteractables()) {                     // keep the prompt unambiguous: nothing else within reach
      if (Math.hypot(it.position.x - x, it.position.z - z) - it.radius < 1.8) return false;
    }
    for (const s of spots) if (Math.hypot(s.x - x, s.z - z) < 9) return false;
    for (const hd of pending.values()) if (Math.hypot(hd.spot.x - x, hd.spot.z - z) < 9) return false;
    if (minFromPlayers > 0 && nearPlayer(x, z, minFromPlayers)) return false;
    return true;
  }

  function findLocation(rng, nearSpawn, minFromPlayers) {
    for (let i = 0; i < 600; i++) {
      let x, z;
      if (nearSpawn) { const a = rng() * TAU, d = 8 + rng() * 11; x = SPAWN.x + Math.cos(a) * d; z = SPAWN.z + Math.sin(a) * d; }
      else { const a = rng() * TAU, d = Math.sqrt(rng()) * 50; x = Math.cos(a) * d; z = Math.sin(a) * d; }
      if (locationOk(x, z, minFromPlayers)) return { x, z };
    }
    return null;
  }

  function addSpot(x, z, animate) {
    const g = takeMound();
    const y = getHeight(x, z);
    g.position.set(x, y, z);
    g.rotation.y = Math.random() * TAU;
    const s = {
      x, y, z, g, state: 'ready', sparkleAt: time + rnd(0.5, 2), popT: animate ? 0 : -1, item: null,
    };
    g.scale.setScalar(animate ? 0.01 : 1);
    s.item = addInteractable({
      type: 'digspot', object: g, position: new THREE.Vector3(x, y, z), radius: 0.55, prompt: 'Dig spot',
      onInteract: () => hud.toast('You need a shovel to dig!', { icon: 'sparkle' }),
    });
    g.userData.interactable = s.item;
    spots.push(s);
    if (animate && nearPlayer(x, z, 20)) {
      particles.burst('puff', { x, y: y + 0.2, z }, { count: 5, radius: 0.4, color: '#d9b48a' });
      particles.burst('sparkle', { x, y: y + 0.4, z }, { count: 3, radius: 0.4 });
    }
    return s;
  }

  const spotOfItem = (item) => spots.find((s) => s.item === item) || null;

  /** The player pressed Interact on a dig spot while holding the shovel: plunge now, the soil flies at the impact frame. */
  function dig(item, player) {
    const s = spotOfItem(item);
    if (!s || s.state !== 'ready' || !player) return false;
    if (pending.has(player) || player.swinging) return false;
    if (!items.swing(player, { dig: true })) return false;
    player.faceToward(s.x, s.z);
    s.state = 'digging';
    pending.set(player, { player, spot: s, t: 0 });
    return true;
  }

  function applyDig(pd) {
    pending.delete(pd.player);
    const s = pd.spot;
    if (s.state !== 'digging') return;
    const { x, y, z } = s;
    // the mound is gone: a hole decal fades, a new spot is due later
    s.state = 'dug';
    removeInteractable(s.item);
    s.g.visible = false;
    spotPool.push(s.g);
    spots.splice(spots.indexOf(s), 1);
    const h = takeHole();
    h.g.position.set(x, y, z);
    h.g.rotation.y = Math.random() * TAU;
    h.rimMat.opacity = 0.75; h.holeMat.opacity = 0.95;
    respawns.push(time + DIG_RESPAWN);

    particles.burst('dirt', { x, y: y + 0.3, z }, { count: 16, radius: 0.3, speed: 1.15 });
    particles.burst('puff', { x, y: y + 0.25, z }, { count: 4, radius: 0.45, color: '#d9b48a', size: 1.2 });
    snd('dig');
    if (camera) camera.shake(0.06, 0.18);
    const n = 1 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) later(0.06 + i * 0.1, () => pickups.spawn('potato', { x, y: y + 0.3, z }, { speed: 1.1 }));
  }

  function updateDig(dt) {
    for (const pd of [...pending.values()]) {
      pd.t += dt;
      const pl = pd.player;
      if (pl.leaving || players.get(pl.index) !== pl) { pd.spot.state = 'ready'; pending.delete(pl); continue; }
      if (!pl.swinging || pl.swingProgress >= DIG_IMPACT || pd.t > 1.6) applyDig(pd);
    }
    for (let i = respawns.length - 1; i >= 0; i--) {
      if (time < respawns[i]) continue;
      const loc = findLocation(Math.random, false, 6);
      if (loc) { respawns.splice(i, 1); addSpot(loc.x, loc.z, true); }
      else respawns[i] = time + 4;                              // nowhere valid right now: try again shortly
    }
    for (const h of holes) {
      if (!h.busy) continue;
      h.age += dt;
      const u = Math.max(0, (h.age - HOLE_HOLD) / HOLE_FADE);
      if (u >= 1) { h.busy = false; h.g.visible = false; continue; }
      const k = 1 - u * u;
      h.rimMat.opacity = 0.75 * k; h.holeMat.opacity = 0.95 * k;
    }
    for (const s of spots) {
      if (s.popT >= 0) {
        s.popT += dt;
        const u = Math.min(1, s.popT / POP_TIME);
        s.g.scale.setScalar(Math.max(0.01, easeOutBack(u)));
        if (u >= 1) s.popT = -1;
      }
      if (s.state === 'ready' && time >= s.sparkleAt) {
        s.sparkleAt = time + 1.4 + Math.random() * 1.2;
        if (nearPlayer(s.x, s.z, 18)) {
          particles.burst('sparkle', { x: s.x + rnd(-0.25, 0.25), y: s.y + 0.45, z: s.z + rnd(-0.25, 0.25) }, { count: 1, radius: 0.1, speed: 0.4, size: 0.8 });
        }
      }
    }
  }

  // initial spots (deterministic): two near the spawn so they are easy to find, the rest spread over the island
  {
    const rng = mulberry32(WORLD_SEED + 131);
    for (let i = 0; i < DIG_SPOTS; i++) {
      const loc = findLocation(rng, i < 2, 0);
      if (loc) addSpot(loc.x, loc.z, false);
    }
  }

  // =========================================================================================== update
  function update(dt) {
    dt = Math.min(dt, 0.1);
    time += dt;
    for (let i = timers.length - 1; i >= 0; i--) {
      if (time >= timers[i].at) { const fn = timers[i].fn; timers.splice(i, 1); fn(); }
    }
    for (const b of bushes) {
      if (!b.full && time >= b.regrowAt) growBerries(b);
      if (b.popT >= 0) {
        b.popT += dt;
        const u = Math.min(1, b.popT / POP_TIME);
        b.mesh.scale.setScalar(Math.max(0.01, easeOutBack(u)));
        if (u >= 1) { b.popT = -1; b.mesh.scale.setScalar(1); }
      }
    }
    for (const r of herbs) {
      if (r.state === 'hidden' && time >= r.regrowAt) {
        r.state = 'growing'; r.t = 0;
        if (nearPlayer(r.h.x, r.h.z, 18)) { particles.burst('sparkle', { x: r.h.x, y: r.h.y + 0.4, z: r.h.z }, { count: 3, radius: 0.3, color: '#b8ffca' }); snd('pop', { pitch: 1.6, vol: 0.4 }); }
      }
      if (r.state === 'growing') {
        r.t += dt;
        const u = Math.min(1, r.t / POP_TIME);
        setHerb(r, Math.max(0.01, easeOutBack(u)));
        if (u >= 1) { r.state = 'ready'; setHerb(r, 1); restoreInteractable(r.item); }
      }
    }
    for (const r of mushrooms) {
      if (r.state === 'hidden' && time >= r.regrowAt) {
        r.state = 'growing'; r.t = 0;
        r.mesh.visible = true;
        r.mesh.scale.setScalar(0.01);
        const p = r.mesh.position;
        if (nearPlayer(p.x, p.z, 18)) { particles.burst('sparkle', { x: p.x, y: p.y + 0.4, z: p.z }, { count: 3, radius: 0.3, color: '#ffb3c0' }); snd('pop', { pitch: 1.6, vol: 0.4 }); }
      }
      if (r.state === 'growing') {
        r.t += dt;
        const u = Math.min(1, r.t / POP_TIME);
        r.mesh.scale.setScalar(Math.max(0.01, easeOutBack(u)));
        if (u >= 1) { r.state = 'ready'; r.mesh.scale.setScalar(1); restoreInteractable(r.item); }
      }
    }
    updateDig(dt);
  }

  return {
    dig,
    update,
    /** A player left: forget its pending dig (the spot becomes diggable again). */
    release(player) {
      const pd = pending.get(player);
      if (pd) { if (pd.spot.state === 'digging') pd.spot.state = 'ready'; pending.delete(player); }
    },
    get digSpots() { return spots; },
    /** Debug: put a dig spot at (x, z) right now (no validity check). */
    addSpot(x, z) { return addSpot(x, z, true); },
    /** Debug: what is waiting to regrow. */
    get states() {
      return {
        berryBushes: bushes.map((b) => ({ x: +b.g.position.x.toFixed(1), z: +b.g.position.z.toFixed(1), full: b.full, regrowIn: b.full ? null : +Math.max(0, b.regrowAt - time).toFixed(1) })),
        herbs: herbs.map((r) => ({ state: r.state, regrowIn: r.state === 'hidden' ? +Math.max(0, r.regrowAt - time).toFixed(1) : null })),
        mushrooms: mushrooms.map((r) => ({ state: r.state, regrowIn: r.state === 'hidden' ? +Math.max(0, r.regrowAt - time).toFixed(1) : null })),
        digSpots: spots.map((s) => ({ x: +s.x.toFixed(1), z: +s.z.toFixed(1), state: s.state })),
        nextDigSpotIn: respawns.length ? +Math.max(0, Math.min(...respawns) - time).toFixed(1) : null,
      };
    },
    /** Debug: make every waiting regrow / respawn fire on the next update. */
    regrowNow() {
      for (const b of bushes) if (!b.full) b.regrowAt = time;
      for (const r of herbs) if (r.state === 'hidden') r.regrowAt = time;
      for (const r of mushrooms) if (r.state === 'hidden') r.regrowAt = time;
      for (let i = 0; i < respawns.length; i++) respawns[i] = time;
    },
    constants: { BERRY_REGROW, HERB_REGROW, MUSHROOM_REGROW, DIG_RESPAWN, DIG_SPOTS },
  };
}
