// Gathering (PLAN Step 13, multi-island since 29b): everything on the islands that gives ingredients without being chopped or broken.
//
//   berries     berry bushes (props.js builds 7 with a separate 'berries' mesh): rustling one drops 2-3 berry PICKUPS, its berries are hidden
//               (empty, but it still rustles) for ~45 s, then pop back. Frostpine's lingonberry bushes work the same: 3-4 lingonberry pickups.
//   herbs       ~12 instanced leafy plants ('herb' interactables, prompt "Pick"): +1 Herb straight into the bag, regrows after ~60 s. Frostpine: mountain mint.
//   mushrooms   the mushroom clusters ('mushroom', "Pick"): +1-2 Mushroom straight into the bag, regrow after ~60 s. Frostpine: chanterelles.
//   dig spots   ~6 cracked-soil mounds ('digspot'). With the Shovel the prompt is "Dig" (items/tools.js -> 'dig'): the player plays the plunge
//               animation, dirt flies, 1-2 potato PICKUPS pop out, the spot becomes a hole decal that fades over ~3 s, and a new spot appears at
//               another valid place ~40 s later. Without a shovel: "Dig spot" and a "You need a shovel to dig!" toast.
//               Frostpine's 9 spots (snowfield + meadow; white mounds / holes on snow) give 1-2 snow truffles, or rarely (10 %) a crystal instead.
//
//   const gathering = createGathering({ scene, players, props, frost, items, particles, hud, sfx, pickups, inventory, floatText, camera: followCam, sync });
//   gathering.dig(item, player)   // main.js: the player pressed Interact on a digspot while holding the shovel (starts the plunge; the dig
//                                 // itself lands at the impact frame). false if ignored (already swinging / spot busy)
//   gathering.release(player)     // a player left: forget its pending dig
//   gathering.update(dt)          // once per tick, AFTER items.update / players.update
//   gathering.states / gathering.regrowNow() / gathering.digSpots   // debug
// Herbs / mushrooms go straight into the shared bag (inventory.add on the authority) and show the floating "+1 Herb" text (floatText(id, n, pos, player))
// on the screen of whoever picked them. Regrow timers run on the simulation clock (update(dt)), so __game.step fast-forwards them.
//
// Multi-island (29b): HOME's plants come from props.handles (its own meshes); FROSTPINE's come from `frost.gather` (world/islands/frostGathering.js: a pure,
// seeded plan of bushes / herbs / mushrooms / dig spots, built at load on every screen) and are drawn as chunked instanced layers by frostVisuals.js. This
// module only needs, per plant, "show / hide / scale it": b.setBerries(on, k), r.set(k) (k = 0 hidden .. 1 full; growing back animates through k).
// Frost layers can be rebuilt at any time (`__game.world.rebuild('frost')`): a frostRuntime hook re-hides whatever is picked right now.
// ID SCHEME: the lists below are index based. Home's items come first (7 bushes, 12 herbs, N mushroom clusters, dig spots sid 1..6), then Frostpine's
// in plan order (bushes 7.., herbs 12.., mushrooms N.., dig spots sid 7..15); every screen builds them in the same order, so the ids never collide.
//
// World sync (Step 22b, domain 'gathering'; see net/worldSync.js). AUTHORITY (host): every state + timer below. Ids: berry bush / herb / mushroom =
// its index in the (deterministic) lists; dig spot = `sid`, a counter (the initial ones are 1..15 on every screen, later ones get the next number).
//   requests (from any screen, with its actor: the host range-checks a remote actor and checks the tool):
//     rustle {i}          berry bush i gives its berries (rejected 'empty' while it is bare)
//     pick {k, i}         k = 'herb' | 'mushroom'; the host adds the item(s) to the bag (mushrooms: 1-2, rolled by the host)
//     dig {sid}           the shovel holder's dig landed on spot sid; the host rolls the finds (lootTable.js DIG: potatoes at home, truffles / a crystal on
//                         Frostpine), spawns them as pickups ('spawn' events) and removes the spot
//   events (applied by every screen, the host included; all randomness is decided by the host):
//     berries {i}         the bush is bare: berries hide at the impact frame, petals fly (the berry PICKUPS come from pickups 'spawn' events)
//     picked {k, i, n, actor}   hidden + regrow timer; the screen of `actor` also squashes + shows "+n"
//     dug {sid, actor}    the mound is gone, a hole decal fades, soil flies
//     spotAdd {sid, x, z, rot}  a new dig spot pops up (~40 s after one was dug, on the same island, at a host-chosen place away from every player)
//     grow {k, i}         berries / herb / mushroom grow back (k = 'berry' | 'herb' | 'mushroom'): the host's regrow timers fire these
//   snapshot {bushes:[{full, in}], herbs:[{hidden, in}], mushrooms:[...], spots:[{sid,x,z}]} (in = seconds until regrowth); a joining screen
//   shows the same bare bushes / missing herbs / spots instantly. hashView = the same without the timers.
//   Dig-spot reservation (state 'digging') is local: it only stops this screen's second player from starting a dig on the same spot; the host
//   lets the first valid dig request win whatever the local reservations say.
import * as THREE from 'three';
import { WORLD_SEED } from '../config.js';
import { mulberry32 } from '../utils/rng.js';
import { INTERACT_RADIUS } from '../config.js';
import { SPAWN, getHeight } from './terrain.js';
import { actionForKind } from '../items/tools.js';
import { actorKey } from '../net/worldSync.js';
import { addInteractable, removeInteractable, restoreInteractable, getInteractables } from './interactables.js';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../render/geo.js';
import { digLoot, rollDig, rollCount } from './lootTable.js';
import { frostRuntime } from './islands/frostWorld.js';
import { bigAt } from './islands/registry.js';
import { FROST_AREAS } from './islands/frostPlacement.js';

const TAU = Math.PI * 2;
const BERRY_REGROW = 45;       // s
const HERB_REGROW = 60;
const MUSHROOM_REGROW = 60;
const DIG_SPOTS = 6;           // home's initial dig spots (Frostpine's come from its plan)
const DIG_RESPAWN = 40;
const DIG_IMPACT = 0.58;       // shovel swing progress at which the blade hits the soil
const HOLE_HOLD = 0.6;         // s the hole stays fully dark before it fades
const HOLE_FADE = 3;           // s
const POP_TIME = 0.5;
const REMOTE_REACH = INTERACT_RADIUS + 2.5;   // the host accepts a REMOTE actor's gather / dig from this far from the target's surface (latency slack)
const BERRY_DROPS = { home: { item: 'berry', n: [2, 3] }, frost: { item: 'lingonberry', n: [3, 4] } };   // what a rustled bush drops (pickups)
const FROST_DIG_AREA = (mod, x, z, h) => FROST_AREAS.snowfield(mod, x, z, h) || FROST_AREAS.meadow(mod, x, z, h);   // where a dug Frostpine spot may re-appear

const rnd = (a, b) => a + Math.random() * (b - a);
const easeOutBack = (u) => { const c = 1.9, v = u - 1; return 1 + (c + 1) * v * v * v + c * v * v; };

/** Which island a world point belongs to ('home' unless it is inside a big island's mesh square) and whether the ground there is snow. */
function groundAt(x, z) {
  const big = bigAt(x, z);
  return big ? { isl: big.island.id, snow: big.mod.groundType(x, z) === 'snow' } : { isl: 'home', snow: false };
}

/** Cracked-soil mound: a low dirt dome with a few dark cracks radiating from the top and a couple of pebbles. `snow` = a frosty white dome (on snow ground). */
function buildMound(snow = false) {
  const c = snow
    ? { a: '#cfdcf0', b: '#eaf1fb', p1: '#b9b4cc', p2: '#d3cfe6', crack: '#7f93b8' }
    : { a: '#8a5a3a', b: '#a8743f', p1: '#b9b4cc', p2: '#d3cfe6', crack: '#4a2d1a' };
  const parts = [
    part(G.ico2, c.a, { p: [0, 0.02, 0], s: [0.66, 0.27, 0.62] }),
    part(G.ico2, c.b, { p: [-0.04, 0.06, 0.02], s: [0.5, 0.25, 0.47] }),
    part(G.ico1, c.p1, { p: [0.36, 0.05, 0.3], s: [0.1, 0.07, 0.09] }),
    part(G.ico1, c.p2, { p: [-0.42, 0.04, -0.2], s: [0.07, 0.05, 0.07] }),
  ];
  for (let i = 0; i < 5; i++) {                              // cracks: thin dark slivers lying on the dome
    const a = (i / 5) * TAU + 0.3;
    const rr = 0.2 + (i % 2) * 0.06;
    const y = 0.06 + 0.26 * Math.sqrt(Math.max(0, 1 - (rr / 0.52) ** 2));
    parts.push(part(G.sphereLo, c.crack, { p: [Math.cos(a) * rr, y, Math.sin(a) * rr], r: [0, -a, 0.35], s: [0.15, 0.022, 0.03] }));
  }
  return combine(parts);
}

export function createGathering({ scene, players, props, frost = null, items, particles, hud, sfx = null, pickups, inventory, floatText = null, camera = null, sync }) {
  const snd = (name, opts) => { if (sfx) sfx.play(name, opts); };
  let time = 0;
  const timers = [];                                          // { at, fn }
  const later = (delay, fn) => timers.push({ at: time + delay, fn });
  const nearPlayer = (x, z, d) => players.list.some((p) => Math.hypot(p.position.x - x, p.position.z - z) < d);   // (visual gates: this screen's players)
  const nearAnyone = (x, z, d) => nearPlayer(x, z, d) || sync.remoteActorNear(x, z, d);                         // (host decisions: every screen's actors)
  const r2 = (v) => Math.round(v * 100) / 100;
  /** The local player (this screen) an actor stands for, or null (another screen's player). */
  const localPlayerOf = (actor) => (actor && actor.screen === sync.screenId ? players.get(actor.index) : null);
  /** HOST: a REMOTE actor must be within reach of (x, z, radius); host players are already in range through the interactable. */
  const inReach = (actor, x, z, radius) => actor.screen === 'host' || Math.hypot(actor.pos.x - x, actor.pos.z - z) - radius <= REMOTE_REACH;
  const who = (actor) => ({ screen: actor.screen, index: actor.index });
  const pickPlayer = localPlayerOf;
  const gather = frost ? frost.gather : null;                 // Frostpine's plan (null in tests without the island)

  const root = new THREE.Group();
  root.name = 'gathering';
  scene.add(root);

  // =========================================================================================== berries
  // bush record: { i, isl, x, y (ground), topY (where petals / berries come from), item, full, regrowAt, popT, setBerries(on, k) }
  const bushes = [];
  for (const g of props.handles.bushes) {
    const mesh = g.userData.berries;
    const item = g.userData.interactable;
    if (!mesh || !item) continue;
    const b = {
      i: bushes.length, isl: 'home', x: g.position.x, y: g.position.y, z: g.position.z, topY: g.position.y + 1.0 * g.scale.y, color: '#ff4d6d', sparkle: '#ff9fb0',
      item, full: true, regrowAt: 0, popT: -1,
      setBerries(on, k = 1) { mesh.visible = on; if (on) mesh.scale.setScalar(k); },
    };
    const base = item.onInteract;                              // interactions.js: the rustle animation + leaves
    item.onInteract = (it, by) => { if (base) base(it, by); rustleRequest(b, by); };
    bushes.push(b);
  }
  if (gather) gather.bushes.forEach((n, j) => {
    const berryItem = gather.berries[j];
    const b = {
      i: bushes.length, isl: 'frost', x: n.x, y: n.y, z: n.z, topY: n.y + 0.95 * n.s, color: '#e0243f', sparkle: '#ff9fb0',
      item: null, full: true, regrowAt: 0, popT: -1,
      setBerries(on, k = 1) { frostRuntime.setInstance('lingonBerries', berryItem, on, Math.max(0.001, k)); },
    };
    b.item = addInteractable({
      type: 'bush', object: null, position: new THREE.Vector3(n.x, n.y, n.z), radius: 0.75 * n.s, prompt: 'Rustle',
      onInteract: (it, by) => { frostRustle(b); rustleRequest(b, by); },       // (no mesh to wobble: leaves + a rustle, here only; the others see the berries go)
    });
    bushes.push(b);
  });

  /** Frostpine bushes have no animatable mesh: a little leaf puff and the rustle sound on the pressing screen. */
  function frostRustle(b) {
    snd('rustle');
    particles.burst('leaf', { x: b.x, y: b.y + 0.7, z: b.z }, { count: 6, radius: 0.7, speed: 0.8, ring: true, height: 0.3, color: '#3f9150' });
  }

  /** A player rustled bush `b` (the animation already played): ask the authority for the berries. An empty bush just rustles. */
  function rustleRequest(b, by) {
    if (!b.full || !by) return;
    sync.request('gathering', 'rustle', { i: b.i }, sync.actorFor(by));
  }

  /** HOST: validate a rustle. */
  function handleRustle(d, actor) {
    const b = bushes[d.i];
    if (!b || !actor) return { reject: 'bad-request' };
    if (!b.full) return { reject: 'empty' };
    if (!inReach(actor, b.x, b.z, b.item.radius)) return { reject: 'far' };
    b.regrowAt = time + BERRY_REGROW;
    applyBerries(b);
    sync.emit('gathering', 'berries', { i: b.i });
    return true;
  }

  /** Every screen (host included): bush `b` gives its berries (they hide at the impact frame); only the host spawns the berry pickups. */
  function applyBerries(b) {
    if (!b.full) return;
    b.full = false;
    const top = { x: b.x, y: b.topY, z: b.z };
    later(0.14, () => {
      b.setBerries(false);
      particles.burst('petal', top, { count: 5, radius: 0.5, color: b.color, speed: 0.8, size: 0.7 });
      if (!sync.isHost) return;                                // loot is rolled + spawned by the host
      const drop = BERRY_DROPS[b.isl] || BERRY_DROPS.home;
      const n = b.isl === 'home' ? 2 + (Math.random() < 0.5 ? 1 : 0) : rollCount(drop.n);
      for (let i = 0; i < n; i++) pickups.spawn(drop.item, { x: top.x + rnd(-0.25, 0.25), y: top.y, z: top.z + rnd(-0.25, 0.25) });
    });
  }

  function growBerries(b) {
    b.full = true;
    b.popT = 0;
    b.setBerries(true, 0.01);
    if (nearPlayer(b.x, b.z, 18)) {
      particles.burst('sparkle', { x: b.x, y: b.topY + 0.1, z: b.z }, { count: 4, radius: 0.6, color: b.sparkle });
      snd('pop', { pitch: 1.5, vol: 0.45 });
    }
  }

  // =========================================================================================== herbs
  // herb / mushroom record: { i, isl, itemId (what goes in the bag), x, y, z, state, regrowAt, t, item, set(k) }   k: 0 = hidden .. 1 = grown
  const herbData = props.handles.herbs;
  const herbs = [];
  const dummy = new THREE.Object3D();
  function setHomeHerb(h, k) {
    dummy.position.set(h.x, h.y, h.z);
    dummy.rotation.set(0, h.rot, 0);
    dummy.scale.setScalar(Math.max(0.0001, h.s * k));
    dummy.updateMatrix();
    herbData.mesh.setMatrixAt(h.index, dummy.matrix);
    herbData.mesh.instanceMatrix.needsUpdate = true;
  }
  if (herbData) {
    for (const h of herbData.list) {
      const r = { i: herbs.length, isl: 'home', itemId: 'herb', x: h.x, y: h.y, z: h.z, state: 'ready', regrowAt: 0, t: 0, item: null, set: (k) => setHomeHerb(h, k) };
      r.item = addInteractable({
        type: 'herb', object: null, position: new THREE.Vector3(h.x, h.y, h.z), radius: 0.35, prompt: 'Pick',
        onInteract: (it, by) => pickRequest('herb', r, by),
      });
      herbs.push(r);
    }
  }
  if (gather) for (const n of gather.herbs) {
    const r = { i: herbs.length, isl: 'frost', itemId: 'mint', x: n.x, y: n.y, z: n.z, state: 'ready', regrowAt: 0, t: 0, item: null, set: (k) => frostRuntime.setInstance('mint', n, k > 0, Math.max(0.001, k)) };
    r.item = addInteractable({
      type: 'herb', object: null, position: new THREE.Vector3(n.x, n.y, n.z), radius: 0.4, prompt: 'Pick',
      onInteract: (it, by) => pickRequest('herb', r, by),
    });
    herbs.push(r);
  }

  /** Interact on a herb / mushroom: ask the authority (host: decided right here; replica: the `picked` event does the rest). */
  function pickRequest(k, r, by) {
    if (r.state !== 'ready' || !by) return;
    sync.request('gathering', 'pick', { k, i: r.i }, sync.actorFor(by));
  }

  /** HOST: validate a pick, put the item(s) in the bag, then play + broadcast it. */
  function handlePick(d, actor) {
    const list = d.k === 'herb' ? herbs : d.k === 'mushroom' ? mushrooms : null;
    const r = list && list[d.i];
    if (!r || !actor) return { reject: 'bad-request' };
    if (r.state !== 'ready') return { reject: 'gone' };
    const pos = r.item.position;
    if (!inReach(actor, pos.x, pos.z, r.item.radius)) return { reject: 'far' };
    const n = d.k === 'herb' ? 1 : 1 + (Math.random() < 0.5 ? 1 : 0);
    r.regrowAt = time + (d.k === 'herb' ? HERB_REGROW : MUSHROOM_REGROW);
    inventory.add(r.itemId, n);
    const data = { k: d.k, i: r.i, n, actor: who(actor) };
    applyPicked(data);
    sync.emit('gathering', 'picked', data);
    return true;
  }

  /** Every screen (host included): herb / mushroom `i` was picked by `actor`. */
  function applyPicked(d) {
    const by = pickPlayer(d.actor);
    if (d.k === 'herb') {
      const r = herbs[d.i];
      if (!r || r.state === 'hidden') return;
      r.state = 'hidden';
      r.set(0);
      removeInteractable(r.item);
      const { x, y, z } = r;
      particles.burst('leaf', { x, y: y + 0.3, z }, { count: 8, radius: 0.25, speed: 0.9, height: 0.2, ...(r.isl === 'frost' ? { color: '#5ff2b8' } : {}) });
      snd('rustle', { vol: 0.6 });
      if (by) by.squash(-0.14);
      if (by && floatText) floatText(r.itemId, d.n, { x, y: y + 0.8, z }, by);
    } else {
      const r = mushrooms[d.i];
      if (!r || r.state === 'hidden') return;
      r.state = 'hidden';
      r.set(0);
      removeInteractable(r.item);
      const pm = r.item.position;
      particles.burst('puff', { x: pm.x, y: pm.y + 0.3, z: pm.z }, { count: 4, radius: 0.3, color: '#fff4dc' });
      particles.burst('sparkle', { x: pm.x, y: pm.y + 0.4, z: pm.z }, { count: 3, radius: 0.3, color: r.isl === 'frost' ? '#ffd98a' : '#ffb3c0' });
      snd('pop', { pitch: 0.9 });
      if (by) by.squash(-0.14);
      if (by && floatText) floatText(r.itemId, d.n, { x: pm.x, y: pm.y + 0.8, z: pm.z }, by);
    }
  }

  // =========================================================================================== mushrooms
  const mushrooms = [];
  for (const mesh of props.handles.mushrooms) {
    const r = {
      i: mushrooms.length, isl: 'home', itemId: 'mushroom', x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, state: 'ready', regrowAt: 0, t: 0, item: null,
      set(k) { mesh.visible = k > 0; if (k > 0) mesh.scale.setScalar(k); },
    };
    r.item = addInteractable({
      type: 'mushroom', object: mesh, position: mesh.position.clone(), radius: 0.55, prompt: 'Pick',
      onInteract: (it, by) => pickRequest('mushroom', r, by),
    });
    mesh.userData.interactable = r.item;
    mushrooms.push(r);
  }
  if (gather) for (const n of gather.mushrooms) {
    const r = { i: mushrooms.length, isl: 'frost', itemId: 'chanterelle', x: n.x, y: n.y, z: n.z, state: 'ready', regrowAt: 0, t: 0, item: null, set: (k) => frostRuntime.setInstance('chanterelle', n, k > 0, Math.max(0.001, k)) };
    r.item = addInteractable({
      type: 'mushroom', object: null, position: new THREE.Vector3(n.x, n.y, n.z), radius: 0.5, prompt: 'Pick',
      onInteract: (it, by) => pickRequest('mushroom', r, by),
    });
    mushrooms.push(r);
  }

  // =========================================================================================== dig spots
  const moundGeos = {};                                       // 'dirt' | 'snow' -> { geo, outline }
  const moundOf = (snow) => {
    const k = snow ? 'snow' : 'dirt';
    if (!moundGeos[k]) { const geo = buildMound(snow); moundGeos[k] = { geo, outline: makeOutline(geo, 0.03).geometry }; }
    return moundGeos[k];
  };
  const spotPool = { dirt: [], snow: [] };
  const spots = [];                                           // live spots: { sid, x, y, z, isl, snow, g, item, state, sparkleAt, popT }
  const respawns = [];                                        // dug spots waiting for a new place: { at, isl }
  const holeDisc = new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2);
  const holes = [];                                           // fading hole decals: { g, hole, rim, age, busy }
  const pending = new Map();                                  // Player -> { player, spot, t }
  let nextSid = 0;                                            // dig-spot ids: a counter (the host hands out the new ones, events carry them)

  function takeMound(snow) {
    let g = spotPool[snow ? 'snow' : 'dirt'].pop();
    if (!g) {
      const m = moundOf(snow);
      g = new THREE.Group();
      g.name = 'dig-spot';
      const mesh = new THREE.Mesh(m.geo, VERTEX_TOON);
      mesh.castShadow = false; mesh.receiveShadow = true;
      mesh.add(makeOutline(m.geo, 0.03, m.outline));
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

  function locationOk(x, z, minFromPlayers, isl) {
    if (isl === 'home') {
      if (!props.spotOk(x, z, 0.7)) return false;
      for (const t of props.handles.trees) if (Math.hypot(t.position.x - x, t.position.z - z) < 4.6) return false;   // not hidden behind a canopy
    }
    for (const it of getInteractables()) {                     // keep the prompt unambiguous: nothing else within reach
      if (Math.hypot(it.position.x - x, it.position.z - z) - it.radius < 1.8) return false;
    }
    for (const s of spots) if (Math.hypot(s.x - x, s.z - z) < 9) return false;
    for (const hd of pending.values()) if (Math.hypot(hd.spot.x - x, hd.spot.z - z) < 9) return false;
    if (minFromPlayers > 0 && nearAnyone(x, z, minFromPlayers)) return false;
    return true;
  }

  function findLocation(rng, nearSpawn, minFromPlayers, isl = 'home') {
    if (isl === 'frost') {                                      // Frostpine: valid ground from its placement (avoids the landing, lanes, lake, trees, boulders ...)
      if (!frost) return null;
      const cands = frost.sampleSpots({ area: FROST_DIG_AREA, count: 16, seed: Math.floor(rng() * 1e6), r: 0.8, minDist: 3 });
      for (const c of cands) if (locationOk(c.x, c.z, minFromPlayers, 'frost')) return { x: c.x, z: c.z };
      return null;
    }
    for (let i = 0; i < 600; i++) {
      let x, z;
      if (nearSpawn) { const a = rng() * TAU, d = 8 + rng() * 11; x = SPAWN.x + Math.cos(a) * d; z = SPAWN.z + Math.sin(a) * d; }
      else { const a = rng() * TAU, d = Math.sqrt(rng()) * 50; x = Math.cos(a) * d; z = Math.sin(a) * d; }
      if (locationOk(x, z, minFromPlayers, 'home')) return { x, z };
    }
    return null;
  }

  function addSpot(x, z, animate, sid = ++nextSid, rot = Math.random() * TAU) {
    nextSid = Math.max(nextSid, sid);
    const { isl, snow } = groundAt(x, z);
    const g = takeMound(snow);
    const y = getHeight(x, z);
    g.position.set(x, y, z);
    g.rotation.y = rot;
    const s = {
      sid, x, y, z, isl, snow, g, state: 'ready', sparkleAt: time + rnd(0.5, 2), popT: animate ? 0 : -1, item: null,
    };
    g.scale.setScalar(animate ? 0.01 : 1);
    s.item = addInteractable({
      type: 'digspot', object: g, position: new THREE.Vector3(x, y, z), radius: 0.55, prompt: 'Dig spot',
      onInteract: () => hud.toast('You need a shovel to dig!', { icon: 'sparkle' }),
    });
    g.userData.interactable = s.item;
    spots.push(s);
    if (animate && nearPlayer(x, z, 20)) {
      particles.burst('puff', { x, y: y + 0.2, z }, { count: 5, radius: 0.4, color: snow ? '#f4f8ff' : '#d9b48a' });
      particles.burst('sparkle', { x, y: y + 0.4, z }, { count: 3, radius: 0.4 });
    }
    return s;
  }

  const spotOfItem = (item) => spots.find((s) => s.item === item) || null;
  const spotBySid = (sid) => spots.find((s) => s.sid === sid) || null;

  /** HOST: a new spot at a valid place away from every player; everybody is told. Returns the spot or null (nowhere valid right now). */
  function hostAddSpot(x, z) {
    const s = addSpot(x, z, true);
    sync.emit('gathering', 'spotAdd', { sid: s.sid, x: r2(x), z: r2(z), rot: r2(s.g.rotation.y) });
    return s;
  }

  /** Replica (snapshot): remove a spot without the dug animation. */
  function dropSpot(s) {
    removeInteractable(s.item);
    s.g.visible = false;
    spotPool[s.snow ? 'snow' : 'dirt'].push(s.g);
    const i = spots.indexOf(s);
    if (i >= 0) spots.splice(i, 1);
    for (const [pl, pd] of pending) if (pd.spot === s) pending.delete(pl);
    s.state = 'dug';
  }

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

  /** The shovel reached the soil (swing impact): ask the authority. Host: decided right here; replica: the `dug` event plays it. */
  function applyDig(pd) {
    pending.delete(pd.player);
    const s = pd.spot;
    if (s.state !== 'digging') return;                          // dug by somebody else meanwhile
    const r = sync.request('gathering', 'dig', { sid: s.sid }, sync.actorFor(pd.player));
    const release = (ok) => { if (!ok && s.state === 'digging') s.state = 'ready'; };   // refused: the spot is diggable again
    if (sync.isHost) release(r.ok);
    else r.then((res) => release(res.ok));
  }

  /** HOST: validate a dig (the actor holds a shovel, a remote actor is in reach, the spot is still there), then play + broadcast it. */
  function handleDig(d, actor) {
    const s = spotBySid(d.sid);
    if (!s || !actor) return { reject: 'gone' };
    const held = items.heldByKey(actorKey(actor));
    if (actionForKind(held && held.kind, s.item) !== 'dig') return { reject: 'no-tool' };
    if (!inReach(actor, s.x, s.z, s.item.radius)) return { reject: 'far' };
    const finds = rollDig(digLoot(s.isl));                       // the finds: rolled by the host (potatoes at home; truffles / a rare crystal on Frostpine)
    respawns.push({ at: time + DIG_RESPAWN, isl: s.isl });       // a new spot is due later (host timer), on the same island
    const data = { sid: s.sid, actor: who(actor) };
    applyDug(s, data.actor, finds);
    sync.emit('gathering', 'dug', data);
    return true;
  }

  /** Every screen (host included): spot `s` was dug up. `finds` (host only) = [{ item, n }] pickups that pop out. */
  function applyDug(s, actor, finds = []) {
    if (s.state === 'dug') return;
    const { x, y, z } = s;
    // the mound is gone: a hole decal fades
    s.state = 'dug';
    removeInteractable(s.item);
    s.g.visible = false;
    spotPool[s.snow ? 'snow' : 'dirt'].push(s.g);
    spots.splice(spots.indexOf(s), 1);
    for (const [pl, pd] of pending) if (pd.spot === s) pending.delete(pl);
    const h = takeHole();
    h.g.position.set(x, y, z);
    h.g.rotation.y = Math.random() * TAU;
    h.rimMat.color.set(s.snow ? '#dbe6f7' : '#8a5a3a'); h.holeMat.color.set(s.snow ? '#6f86a8' : '#3b2413');   // (snow-coloured on snow ground)
    h.rimMat.opacity = 0.75; h.holeMat.opacity = 0.95;

    particles.burst('dirt', { x, y: y + 0.3, z }, { count: 16, radius: 0.3, speed: 1.15, ...(s.snow ? { color: '#eaf1fb' } : {}) });
    particles.burst('puff', { x, y: y + 0.25, z }, { count: 4, radius: 0.45, color: s.snow ? '#f4f8ff' : '#d9b48a', size: 1.2 });
    snd('dig');
    if (camera && localPlayerOf(actor)) camera.shake(0.06, 0.18);
    let k = 0;
    for (const f of finds) for (let i = 0; i < f.n; i++, k++) later(0.06 + k * 0.1, () => pickups.spawn(f.item, { x, y: y + 0.3, z }, { speed: 1.1 }));
  }

  function updateDig(dt) {
    for (const pd of [...pending.values()]) {
      pd.t += dt;
      const pl = pd.player;
      if (pl.leaving || players.get(pl.index) !== pl) { if (pd.spot.state === 'digging') pd.spot.state = 'ready'; pending.delete(pl); continue; }
      if (!pl.swinging || pl.swingProgress >= DIG_IMPACT || pd.t > 1.6) applyDig(pd);
    }
    if (sync.isHost) for (let i = respawns.length - 1; i >= 0; i--) {   // dig-spot respawn timers: host only (replicas get a 'spotAdd' event)
      if (time < respawns[i].at) continue;
      const loc = findLocation(Math.random, false, 6, respawns[i].isl);
      if (loc) { respawns.splice(i, 1); hostAddSpot(loc.x, loc.z); }
      else respawns[i].at = time + 4;                           // nowhere valid right now: try again shortly
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

  // initial spots (deterministic): two near the spawn so they are easy to find, the rest spread over the island; then Frostpine's from its plan
  {
    const rng = mulberry32(WORLD_SEED + 131);
    for (let i = 0; i < DIG_SPOTS; i++) {
      const loc = findLocation(rng, i < 2, 0);
      if (loc) addSpot(loc.x, loc.z, false);
    }
    if (gather) for (const d of gather.digs) addSpot(d.x, d.z, false, undefined, d.rot);
  }

  function growHerb(r) {
    if (r.state !== 'hidden') return;
    r.state = 'growing'; r.t = 0;
    if (nearPlayer(r.x, r.z, 18)) { particles.burst('sparkle', { x: r.x, y: r.y + 0.4, z: r.z }, { count: 3, radius: 0.3, color: '#b8ffca' }); snd('pop', { pitch: 1.6, vol: 0.4 }); }
  }
  function growMushroom(r) {
    if (r.state !== 'hidden') return;
    r.state = 'growing'; r.t = 0;
    r.set(0.01);
    if (nearPlayer(r.x, r.z, 18)) { particles.burst('sparkle', { x: r.x, y: r.y + 0.4, z: r.z }, { count: 3, radius: 0.3, color: r.isl === 'frost' ? '#ffd98a' : '#ffb3c0' }); snd('pop', { pitch: 1.6, vol: 0.4 }); }
  }

  // Frostpine's visuals can be rebuilt (world.rebuild('frost')): the fresh layers show everything, so hide what is picked right now again
  function reapplyFrost() {
    for (const b of bushes) if (b.isl === 'frost' && !b.full) b.setBerries(false);
    for (const r of herbs) if (r.isl === 'frost' && r.state === 'hidden') r.set(0);
    for (const r of mushrooms) if (r.isl === 'frost' && r.state === 'hidden') r.set(0);
  }
  if (gather) frostRuntime.hooks.push(reapplyFrost);

  // =========================================================================================== world sync domain
  const left = (at) => +Math.max(0, at - time).toFixed(1);
  sync.register('gathering', {
    snapshot: () => ({
      bushes: bushes.map((b) => ({ full: b.full, in: b.full ? null : left(b.regrowAt) })),
      herbs: herbs.map((r) => ({ hidden: r.state === 'hidden', in: r.state === 'hidden' ? left(r.regrowAt) : null })),
      mushrooms: mushrooms.map((r) => ({ hidden: r.state === 'hidden', in: r.state === 'hidden' ? left(r.regrowAt) : null })),
      spots: spots.map((s) => ({ sid: s.sid, x: r2(s.x), z: r2(s.z) })),
    }),
    hashView: () => ({
      bushes: bushes.map((b) => b.full),
      herbs: herbs.map((r) => r.state === 'hidden'),
      mushrooms: mushrooms.map((r) => r.state === 'hidden'),
      spots: spots.map((s) => [s.sid, r2(s.x), r2(s.z)]).sort((a, b) => a[0] - b[0]),
    }),
    applySnapshot(snap) {
      const sn = snap || {};
      (sn.bushes || []).forEach((e, i) => {
        const b = bushes[i];
        if (!b) return;
        if (e.full && !b.full) { b.full = true; b.popT = -1; b.setBerries(true, 1); }
        else if (!e.full && b.full) { b.full = false; b.setBerries(false); }
      });
      (sn.herbs || []).forEach((e, i) => {
        const r = herbs[i];
        if (!r) return;
        if (e.hidden && r.state !== 'hidden') { r.state = 'hidden'; r.set(0); removeInteractable(r.item); }
        else if (!e.hidden && r.state === 'hidden') { r.state = 'ready'; r.set(1); restoreInteractable(r.item); }
      });
      (sn.mushrooms || []).forEach((e, i) => {
        const r = mushrooms[i];
        if (!r) return;
        if (e.hidden && r.state !== 'hidden') { r.state = 'hidden'; r.set(0); removeInteractable(r.item); }
        else if (!e.hidden && r.state === 'hidden') { r.state = 'ready'; r.set(1); restoreInteractable(r.item); }
      });
      const want = new Map((sn.spots || []).map((e) => [e.sid, e]));
      for (const s of [...spots]) {                                   // spots that are gone (or somewhere else) on the host
        const e = want.get(s.sid);
        if (!e || Math.hypot(e.x - s.x, e.z - s.z) > 0.05) dropSpot(s);
      }
      for (const e of want.values()) if (!spotBySid(e.sid)) addSpot(e.x, e.z, false, e.sid);
    },
    applyEvent(kind, d) {
      if (kind === 'berries') { const b = bushes[d.i]; if (b) applyBerries(b); }
      else if (kind === 'picked') applyPicked(d);
      else if (kind === 'dug') { const sp = spotBySid(d.sid); if (sp) applyDug(sp, d.actor); }
      else if (kind === 'spotAdd') { if (!spotBySid(d.sid)) addSpot(d.x, d.z, true, d.sid, d.rot); }
      else if (kind === 'grow') {
        if (d.k === 'berry') { const b = bushes[d.i]; if (b && !b.full) growBerries(b); }
        else if (d.k === 'herb') { const r = herbs[d.i]; if (r) growHerb(r); }
        else if (d.k === 'mushroom') { const r = mushrooms[d.i]; if (r) growMushroom(r); }
      }
    },
    handleRequest(kind, d, actor) {
      if (kind === 'rustle') return handleRustle(d, actor);
      if (kind === 'pick') return handlePick(d, actor);
      if (kind === 'dig') return handleDig(d, actor);
      if (kind === 'regrowNow') { regrowAll(); return true; }
      return { reject: 'unknown-kind' };
    },
  });

  /** Host: every waiting regrow / respawn fires on the next update. */
  function regrowAll() {
    for (const b of bushes) if (!b.full) b.regrowAt = time;
    for (const r of herbs) if (r.state === 'hidden') r.regrowAt = time;
    for (const r of mushrooms) if (r.state === 'hidden') r.regrowAt = time;
    for (const q of respawns) q.at = time;
  }

  // =========================================================================================== update
  function update(dt) {
    dt = Math.min(dt, 0.1);
    time += dt;
    for (let i = timers.length - 1; i >= 0; i--) {
      if (time >= timers[i].at) { const fn = timers[i].fn; timers.splice(i, 1); fn(); }
    }
    for (const b of bushes) {
      if (sync.isHost && !b.full && time >= b.regrowAt) { sync.emit('gathering', 'grow', { k: 'berry', i: b.i }); growBerries(b); }
      if (b.popT >= 0) {
        b.popT += dt;
        const u = Math.min(1, b.popT / POP_TIME);
        b.setBerries(true, Math.max(0.01, easeOutBack(u)));
        if (u >= 1) { b.popT = -1; b.setBerries(true, 1); }
      }
    }
    for (const r of herbs) {
      if (sync.isHost && r.state === 'hidden' && time >= r.regrowAt) { sync.emit('gathering', 'grow', { k: 'herb', i: r.i }); growHerb(r); }
      if (r.state === 'growing') {
        r.t += dt;
        const u = Math.min(1, r.t / POP_TIME);
        r.set(Math.max(0.01, easeOutBack(u)));
        if (u >= 1) { r.state = 'ready'; r.set(1); restoreInteractable(r.item); }
      }
    }
    for (const r of mushrooms) {
      if (sync.isHost && r.state === 'hidden' && time >= r.regrowAt) { sync.emit('gathering', 'grow', { k: 'mushroom', i: r.i }); growMushroom(r); }
      if (r.state === 'growing') {
        r.t += dt;
        const u = Math.min(1, r.t / POP_TIME);
        r.set(Math.max(0.01, easeOutBack(u)));
        if (u >= 1) { r.state = 'ready'; r.set(1); restoreInteractable(r.item); }
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
    /** Debug: put a dig spot at (x, z) right now (no validity check; the host announces it to the replicas). */
    addSpot(x, z) { return sync.isReplica ? null : hostAddSpot(x, z); },
    /** Debug: what is waiting to regrow. */
    get states() {
      return {
        berryBushes: bushes.map((b) => ({ isl: b.isl, x: +b.x.toFixed(1), z: +b.z.toFixed(1), full: b.full, regrowIn: b.full ? null : +Math.max(0, b.regrowAt - time).toFixed(1) })),
        herbs: herbs.map((r) => ({ isl: r.isl, state: r.state, regrowIn: r.state === 'hidden' ? +Math.max(0, r.regrowAt - time).toFixed(1) : null })),
        mushrooms: mushrooms.map((r) => ({ isl: r.isl, state: r.state, regrowIn: r.state === 'hidden' ? +Math.max(0, r.regrowAt - time).toFixed(1) : null })),
        digSpots: spots.map((s) => ({ sid: s.sid, isl: s.isl, x: +s.x.toFixed(1), z: +s.z.toFixed(1), state: s.state })),
        nextDigSpotIn: respawns.length ? +Math.max(0, Math.min(...respawns.map((q) => q.at)) - time).toFixed(1) : null,
      };
    },
    /** Debug: make every waiting regrow / respawn fire on the next update. */
    regrowNow() {
      if (sync.isReplica) { sync.request('gathering', 'regrowNow', {}); return; }
      regrowAll();
    },
    /** Debug: the bush / herb / mushroom records (frost ones have isl 'frost'; item = the interactable) and the plan's ids. */
    get plants() { return { bushes, herbs, mushrooms }; },
    constants: { BERRY_REGROW, HERB_REGROW, MUSHROOM_REGROW, DIG_RESPAWN, DIG_SPOTS },
  };
}
