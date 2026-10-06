// Equippable items: ordinary ground pickups on home and Frostpine, plus host-spawned special lightsabers; equipping into a player's right
// hand, Animal-Crossing style swapping (the held item is tossed to where the new one lay) and the swing action.
// Every player holds at most one item and each item is held by at most one player (`rec.holder`).
//
//   const items = createItems({ scene, players, particles, hud, sfx, sync });   // players: the PlayerManager (list / p1 / multi); sync: net/worldSync.js
//   items.update(dt, t)          // once per tick, AFTER players.update (it reads the animated hand transforms)
//   items.swing(player, { dig })  // Interact with nothing else in range: swing that player's item (returns true if a swing started);
//                                // { dig: true } = the shovel plunge (arm raised overhead, blade driven down into the ground in front, no trail)
//   items.heldBy(player)         // record of the item that player holds ({ name, kind, model, state, holder, ... }) or null
//   items.held                   // shorthand for items.heldBy(P1) (debug)
//   items.dropFor(player)        // toss that player's item onto a walkable spot at its feet (a player leaving); frees its swing trail
//   items.list                   // every item record ({ name, kind, state: 'ground'|'landing'|'toHand'|'held'|'tossing', spot, holder })
//   items.equip('axe', player)   // debug: pick an item up by (partial, case-insensitive) name as if walking up to it (default P1)
//
//   items.heldByKey(actorKey)    // host: the item any screen's actor holds (harvest / gathering validate a remote actor's tool with it)
//
// World sync (Step 22, domain 'items'). The host owns WHO HOLDS WHAT and WHERE the rest lie; every item has a stable id (its index in DEFS).
//   Authoritative per item: `holderKey` (actor key "screen:index" or null) and, while on the ground, `spot`. `snapshot()` = [{id, holder, spot}].
//   Requests (host validates: item on the ground, actor not locked, remote actors within range): pickup {id} | drop {} (the actor's item falls
//   where it stands: a player leaving). Events (applied by the host itself and by every replica): pickup {id, actor, from, toss:{id,spot,yaw}|null}
//   (a swap: the item in hand is tossed to the spot where the new one lay) and drop {id, spot, yaw, from}. All randomness (toss yaw) is decided by the host.
//   Holders: an item held by one of THIS screen's players flies into that player's hand as before; an item held by a player of ANOTHER screen is
//   hidden here (state 'remote'; its avatar / hand is Step 24). A toss from a remote holder starts at the actor position `from`.
//   A screen that stays away past the grace period: the host drops what its actors hold (domain hook screenLeft).
// Item lifecycle (state):  ground -> toHand -> held -> tossing -> landing -> ground ...   (+ 'remote' = held by another screen's player, hidden)
//   * only 'ground' items have an interactable (type 'item'), so an item can never be picked up twice or while in flight;
//     when two players press Interact on the same pickup in the same frame the first one wins and the other press does nothing
//   * a player's pickups are ignored for LOCK seconds after one happens, and a swap always ends with exactly one item in hand
import * as THREE from 'three';
import { buildItemModel } from '../items/models.js';
import { HOLD_ARM_X, HOLD_ARM_Z } from '../player/player.js';
import { getHeight, isWalkable, getGroundType, getSlope, streamDistance } from './terrain.js';
import { overlapsAny } from './colliders.js';
import { addInteractable, removeInteractable, getInteractables } from './interactables.js';
import { nearAnyFire, INTERACT_RADIUS, ITEM_PICKUP_LOCK } from '../config.js';
import { actorKey } from '../net/worldSync.js';
import { rememberedTool } from '../game/playerMemory.js';
import { DUNGEON, WEAPONS } from '../game/dungeonLogic.js';
import { ISLAND_SWINGS, TOOL_HINTS } from '../items/tools.js';

const HOVER = 0.7;             // height of the item's centre above the ground while it floats
const TILT = 0.42;             // lean of a floating item (rad)
const GROUND_SCALE = 1.2;      // floating pickups are drawn a bit bigger than the held item so they catch the eye
const SPIN = 1.15;             // rad/s
const TOSS_TIME = 0.45;
const LAND_TIME = 0.6;
const TO_HAND_TIME = 0.2;
const LOCK = ITEM_PICKUP_LOCK;
const PICK_RANGE = INTERACT_RADIUS + 2.5;   // the host accepts a REMOTE pickup from this far (the prompt range + latency slack; positions are trusted)
const TRAIL_LIFE = 0.24;
const TRAIL_MAX = 16;
const DIG_DUR = 0.8;           // s, shovel plunge (impact = swing progress ~0.58)
const DIG_KEYS = [[-2.5, -0.35, 0, -0.1], [-1.05, -0.3, 0, 0.34]];   // arm keyframes: raised overhead -> forward, body leaning into it

const TAU = Math.PI * 2;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutQuad = (u) => 1 - (1 - u) * (1 - u);
const easeInOut = (u) => u * u * (3 - 2 * u);
const easeOutBack = (u) => { const c = 1.9; const v = u - 1; return 1 + (c + 1) * v * v * v + c * v * v; };

/** Hand-picked spots (nudged to the nearest valid one at start-up). */
const DEFS = [
  { kind: 'axe',        at: [4.5, 16.5],    roll: Math.PI },      // ~5u from spawn, visible from the first frame (the campfire plaza is east of the spawn)
  { kind: 'sword',      at: [29.1, 39.5] },                       // south-east beach
  { kind: 'hammer',     at: [-7.5, -21.1] },                      // top of the plateau
  { kind: 'axe',        at: [15, 14] },                        // by the pond
  { kind: 'hammer',     at: [-42.3, 8.4] },                    // west beach
  { kind: 'shovel',     at: [-26, -4] },                       // west meadow
  { kind: 'shovel',     at: [1.7, -3.3] },                       // by the stream
];

function makeBlobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(30,20,50,0.5)');
  grad.addColorStop(0.6, 'rgba(30,20,50,0.3)');
  grad.addColorStop(1, 'rgba(30,20,50,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const r3 = (v) => Math.round(v * 1000) / 1000;
const vec = (v) => ({ x: r3(v.x), y: r3(v.y), z: r3(v.z) });

export function createItems({ scene, players, particles, hud, sfx = null, sync, frost = null, ember = null }) {
  const snd = (name, opts) => { if (sfx) sfx.play(name, opts); };
  let time = 0;
  const heldMap = new Map();                  // LOCAL Player -> record it holds (state 'toHand' or 'held'); items held by other screens' players are state 'remote'
  const locks = new Map();                    // actor key -> seconds during which that player's further pickups are ignored
  const trails = new Map();                   // Player -> swing trail
  const records = [];
  const timers = [];                          // { at, fn } (swing sounds / sparkles), advanced with `time`
  const later = (delay, fn) => timers.push({ at: time + delay, fn });

  const root = new THREE.Group();
  root.name = 'items';
  scene.add(root);

  // shared ground-presentation resources
  const blobMat = new THREE.MeshBasicMaterial({
    map: makeBlobTexture(), transparent: true, depthWrite: false, fog: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const blobGeo = new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2);
  const ringGeo = new THREE.RingGeometry(0.5, 0.64, 36).rotateX(-Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(0.5, 28).rotateX(-Math.PI / 2);

  // ------------------------------------------------------------------ placement
  const spotOk = (x, z) => {
    if (!isWalkable(x, z)) return false;
    if (getHeight(x, z) < 0.3 || getSlope(x, z) > 0.3) return false;
    const gt = getGroundType(x, z);
    if (gt === 'water' || gt === 'wetsand') return false;
    if (streamDistance(x, z) < 3) return false;
    if (nearAnyFire(x, z)) return false;   // keep the campfire plazas free
    if (overlapsAny(x, z, 1.0)) return false;
    for (const it of getInteractables()) {           // keep clear of other interactables so the prompt is unambiguous
      if (Math.hypot(it.position.x - x, it.position.z - z) - it.radius < 1.8) return false;
    }
    for (const r of records) {                       // ...and of items that are still tossed / landing (not registered yet)
      if ((r.state === 'tossing' || r.state === 'landing') && Math.hypot(r.spot.x - x, r.spot.z - z) < 1.8) return false;
    }
    return true;
  };
  function findSpot(x, z) {
    for (let r = 0; r <= 9; r += 0.5) {
      const n = r === 0 ? 1 : 12;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const xx = x + Math.cos(a) * r, zz = z + Math.sin(a) * r;
        if (spotOk(xx, zz)) return new THREE.Vector3(xx, getHeight(xx, zz), zz);
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ record construction
  const qTmp = new THREE.Quaternion();
  const eTmp = new THREE.Euler();

  /** Rotation of an item's pivot inside the hand socket: item +Y points up and a little forward, whatever the arm pose. */
  function holdQuat(rec) {
    const restZ = rec.holder.parts.armR.userData.restZ;
    const qArm = new THREE.Quaternion().setFromEuler(new THREE.Euler(HOLD_ARM_X, 0, restZ + HOLD_ARM_Z));
    const local = new THREE.Vector3(-0.3, 0.95, 0.1).normalize().applyQuaternion(qArm.invert());
    const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, local);
    return q.multiply(new THREE.Quaternion().setFromAxisAngle(Y_AXIS, rec.roll));
  }

  function makeRecord(def, spot) {
    const model = buildItemModel(def.kind, def);
    const ud = model.userData;
    const pivot = new THREE.Group();
    pivot.name = `pivot-${ud.name}`;
    pivot.add(model);

    const ground = new THREE.Group();          // sits on the terrain at the spot: blob shadow, sparkle ring, floating group
    ground.name = `pickup-${ud.name}`;
    const blob = new THREE.Mesh(blobGeo, blobMat);
    blob.position.y = 0.06;
    blob.renderOrder = 2;
    const ringMat = new THREE.MeshBasicMaterial({
      color: ud.accent, transparent: true, opacity: 0.55, depthWrite: false, fog: true, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.09;
    ring.renderOrder = 3;
    const discMat = new THREE.MeshBasicMaterial({
      color: ud.accent, transparent: true, opacity: 0.16, depthWrite: false, fog: true, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -2.5, polygonOffsetUnits: -2.5,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.y = 0.075;
    disc.renderOrder = 2;
    const floatG = new THREE.Group();
    ground.add(blob, disc, ring, floatG);
    root.add(ground);

    const rec = {
      name: ud.name, kind: def.kind, special: !!def.special, color: def.color || null, roll: def.roll ?? 0, model, pivot, ground, floatG, blob, ring, disc, ringMat, discMat,
      id: records.length, spot: spot.clone(), home: spot.clone(), holder: null, holderKey: null, swingPosed: false,
      state: 'ground', t: 0, t0: 0, ofs: 1, interactable: null,
      bladeK: 0, bladeTarget: 0, appear: 1, sparkleAt: 0,
      p0: new THREE.Vector3(), q0: new THREE.Quaternion(), q1: new THREE.Quaternion(), yaw0: 0, popT: 1,
    };
    model.userData.setBlade?.(0);
    return rec;
  }

  const setOfs = (rec, k) => { rec.ofs = k; rec.model.position.y = -rec.model.userData.center * k; };

  function register(rec) {
    if (rec.interactable || rec.enabled === false) return;
    rec.interactable = addInteractable({
      type: 'item', object: rec.ground, position: rec.spot, radius: 0.55, prompt: `Pick up ${rec.name}`,
      onInteract: (item, by) => pickUp(rec, by || players.p1),
    });
  }
  function unregister(rec) {
    if (!rec.interactable) return;
    removeInteractable(rec.interactable);
    rec.interactable = null;
  }

  /** Put the item's pivot into its floating group on the ground spot, centred and tilted. */
  function placeOnGround(rec, yaw, startY) {
    rec.ground.position.copy(rec.spot);
    rec.ground.visible = true;
    rec.floatG.rotation.set(0, yaw, 0);
    rec.floatG.position.y = startY;
    rec.floatG.add(rec.pivot);
    rec.pivot.position.set(0, 0, 0);
    rec.pivot.quaternion.setFromEuler(eTmp.set(0, 0, TILT));
    rec.pivot.scale.setScalar(GROUND_SCALE);
    setOfs(rec, 1);
  }

  const handPos = new THREE.Vector3();
  const handQuat = new THREE.Quaternion();
  function readHand(player) {
    const s = player.parts.handSocket;
    s.updateWorldMatrix(true, false);
    s.getWorldPosition(handPos);
    s.getWorldQuaternion(handQuat);
  }

  // ------------------------------------------------------------------ pickup / swap
  const keyOf = (player) => `${sync.screenId}:${player.index}`;
  /** The player of THIS screen an actor key stands for, or null (another screen's player, or one that is not here). */
  function localPlayerOfKey(key) {
    const i = key.lastIndexOf(':');
    if (key.slice(0, i) !== sync.screenId) return null;
    const p = players.get(Number(key.slice(i + 1)));
    return p && !p.leaving ? p : null;
  }
  const heldByKey = (key) => records.find((r) => r.holderKey === key) || null;

  /** Interact on a ground item (or items.equip): ask the authority. Host: decided right here; replica: the host's `pickup` event does the rest. */
  function pickUp(rec, player) {
    if (!player || player.leaving || (locks.get(keyOf(player)) || 0) > 0) return false;
    if (rec.state !== 'ground' || rec.holder || rec.holderKey) return false;    // first press wins: a taken item is no longer 'ground'
    locks.set(keyOf(player), LOCK);
    const r = sync.request('items', 'pickup', { id: rec.id }, sync.actorFor(player));
    return sync.isHost ? r.ok : true;
  }

  /** HOST: validate a pickup request. */
  function handlePickup(d, actor) {
    const rec = records[d.id];
    if (!rec || !actor) return { reject: 'bad-request' };
    if (rec.state !== 'ground' || rec.holderKey) return { reject: 'taken' };
    const key = actorKey(actor);
    if (actor.screen === 'host') {
      const pl = players.get(actor.index);
      if (!pl || pl.leaving) return { reject: 'gone' };
    } else {
      if ((locks.get(key) || 0) > 0) return { reject: 'locked' };               // (host players were checked in pickUp)
      if (Math.hypot(actor.pos.x - rec.spot.x, actor.pos.z - rec.spot.z) > PICK_RANGE) return { reject: 'far' };
    }
    locks.set(key, LOCK);
    const prev = heldByKey(key);
    const data = {
      id: rec.id, actor: { screen: actor.screen, index: actor.index }, from: vec(actor.pos),
      toss: prev ? { id: prev.id, spot: vec(rec.spot), yaw: r3(Math.random() * TAU) } : null,
    };
    applyPickup(data);
    sync.emit('items', 'pickup', data);
    return true;
  }

  /** Every screen (host included): `data.actor` took item `data.id`; a swap tosses the item that actor held to the spot where the new one lay. */
  function applyPickup(data) {
    const rec = records[data.id];
    if (!rec) return;
    const key = actorKey(data.actor);
    const player = localPlayerOfKey(key);
    locks.set(key, LOCK);
    unregister(rec);
    const prev = data.toss ? records[data.toss.id] : null;
    if (prev && prev.state === 'toHand') finishToHand(prev);   // never leave one mid-flight
    rec.holderKey = key;
    if (player) {
      rec.holder = player;
      beginToHand(rec);
      heldMap.set(player, rec);
      player.holding = true;
      const message = players.multi ? `${player.colors.name} got the ${rec.name}!` : `Got the ${rec.name}!`;
      hud.toast(`${message}${TOOL_HINTS[rec.kind] ? ` ${TOOL_HINTS[rec.kind]}` : ''}`, { icon: 'sparkle', duration: 4200 });
      snd('equip');
    } else {
      goRemote(rec);
      hud.toast(`${players.labelOf(data.actor)} got the ${rec.name}!`, { icon: 'sparkle' });   // a player of another screen ("P3", the global slot)
    }
    if (prev) beginToss(prev, new THREE.Vector3(data.toss.spot.x, data.toss.spot.y, data.toss.spot.z), data.toss.yaw, data.from);
  }

  /** The item is now held by a player of another screen; Avatars attaches its pivot when the next pose arrives. */
  function goRemote(rec) {
    rec.holder = null;
    rec.ground.visible = false;
    rec.pivot.removeFromParent();
    rec.pivot.visible = false;
    rec.state = 'remote';
    rec.bladeK = rec.bladeTarget = 0;
    rec.model.userData.setBlade?.(0);
  }

  function beginToHand(rec) {
    rec.pivot.updateWorldMatrix(true, false);
    rec.pivot.getWorldPosition(rec.p0);
    rec.pivot.getWorldQuaternion(rec.q0);
    scene.attach(rec.pivot);
    rec.ground.visible = false;
    rec.state = 'toHand';
    rec.t = 0;
    rec.bladeTarget = 0;
    rec.q1.copy(holdQuat(rec));
    particles.burst('sparkle', { x: rec.p0.x, y: rec.p0.y, z: rec.p0.z }, { count: 5, radius: 0.4, color: rec.model.userData.accent });
  }

  function updateToHand(rec, dt) {
    rec.t += dt;
    const u = clamp01(rec.t / TO_HAND_TIME);
    if (u >= 1) { finishToHand(rec); return; }
    readHand(rec.holder);
    const e = easeInOut(u);
    rec.pivot.position.lerpVectors(rec.p0, handPos, e);
    rec.pivot.position.y += Math.sin(u * Math.PI) * 0.5;
    qTmp.copy(handQuat).multiply(rec.q1);
    rec.pivot.quaternion.slerpQuaternions(rec.q0, qTmp, e);
    setOfs(rec, 1 - e);
    rec.pivot.scale.setScalar(GROUND_SCALE + (1 - GROUND_SCALE) * e);
  }

  function finishToHand(rec) {
    const player = rec.holder;
    player.parts.handSocket.add(rec.pivot);
    rec.pivot.position.set(0, 0, 0);
    rec.pivot.quaternion.copy(rec.q1);
    setOfs(rec, 0);
    rec.state = 'held';
    rec.popT = 0;
    rec.pivot.scale.setScalar(1.3);
    rec.bladeTarget = 1;
    if (rec.model.userData.setBlade) snd('saber-on');
    readHand(player);
    particles.burst('sparkle', handPos, { count: 4, radius: 0.3, color: rec.model.userData.accent });
  }

  /** Toss `rec` (held in a local hand, or hidden 'remote' and starting at `from`) onto `spot`, landing with orientation yaw (chosen by the host). */
  function beginToss(rec, spot, yaw, from = null) {
    if (rec.ethereal) { poof(rec, from); return; }
    if (rec.holder && heldMap.get(rec.holder) === rec) {
      heldMap.delete(rec.holder);
      rec.holder.holding = false;
    }
    rec.holder = null;
    rec.holderKey = null;
    rec.swingPosed = false;
    if (rec.state === 'remote') {                       // nobody to read a hand from: start at the actor's position
      rec.pivot.visible = true;
      scene.add(rec.pivot);
      const f = from || spot;
      rec.pivot.position.set(f.x, (f.y || 0) + 1.1, f.z);
      rec.pivot.quaternion.identity();
      rec.pivot.scale.setScalar(1);
      rec.p0.copy(rec.pivot.position);
      rec.q0.identity();
    } else {
      rec.pivot.updateWorldMatrix(true, false);
      rec.pivot.getWorldPosition(rec.p0);
      rec.pivot.getWorldQuaternion(rec.q0);
      scene.attach(rec.pivot);
      rec.pivot.scale.setScalar(1);
    }
    rec.spot.copy(spot);
    rec.yaw0 = yaw;
    rec.q1.setFromEuler(eTmp.set(0, rec.yaw0, 0));
    rec.q1.multiply(qTmp.setFromEuler(new THREE.Euler(0, 0, TILT)));      // final orientation: Ry(yaw) * Rz(tilt)
    rec.state = 'tossing';
    rec.t = 0;
    rec.bladeTarget = 0;
    if (rec.model.userData.setBlade && rec.bladeK > 0.05) snd('saber-off');
    snd('pop', { pitch: 0.7, vol: 0.7 });
  }

  const _dir = new THREE.Vector3();
  const _axis = new THREE.Vector3();
  const _end = new THREE.Vector3();
  const _qs = new THREE.Quaternion();
  function updateToss(rec, dt) {
    rec.t += dt;
    const u = clamp01(rec.t / TOSS_TIME);
    _end.set(rec.spot.x, rec.spot.y + 0.3, rec.spot.z);
    rec.pivot.position.lerpVectors(rec.p0, _end, u);
    rec.pivot.position.y += Math.sin(u * Math.PI) * 1.05;
    _dir.subVectors(_end, rec.p0).setY(0);
    if (_dir.lengthSq() < 1e-4) _axis.set(1, 0, 0); else _axis.set(_dir.z, 0, -_dir.x).normalize();
    _qs.setFromAxisAngle(_axis, TAU * easeOutQuad(u));
    rec.pivot.quaternion.slerpQuaternions(rec.q0, rec.q1, easeOutQuad(u)).premultiply(_qs);
    setOfs(rec, easeOutQuad(u));
    rec.pivot.scale.setScalar(1 + (GROUND_SCALE - 1) * easeOutQuad(u));
    if (u >= 1) {
      placeOnGround(rec, rec.yaw0, 0.3);
      rec.state = 'landing';
      rec.t = 0;
      rec.appear = 0;
      snd('thud');
      particles.burst('puff', { x: rec.spot.x, y: rec.spot.y + 0.15, z: rec.spot.z }, { count: 5, radius: 0.4 });
      particles.burst('sparkle', { x: rec.spot.x, y: rec.spot.y + 0.4, z: rec.spot.z }, { count: 4, radius: 0.5, color: rec.model.userData.accent });
    }
  }

  /**
   * A player is leaving: toss its item onto a walkable spot at the player's feet (it becomes a ground pickup after landing)
   * and free the player's swing trail. Falls back to the item's home spot if nothing valid is close by.
   * (The spot is chosen by the host: on a replica this is a `drop` request and the toss plays when the host's event arrives.)
   */
  function dropFor(player) {
    const rec = heldMap.get(player);
    const trail = trails.get(player);
    if (trail) { disposeTrail(trail); trails.delete(player); }
    if (!rec) return null;
    sync.request('items', 'drop', {}, sync.actorFor(player));
    return rec;
  }

  function dropHeld(player) {
    const rec = heldMap.get(player);
    if (!rec) return false;
    const trail = trails.get(player);
    if (trail) { disposeTrail(trail); trails.delete(player); }
    sync.request('items', 'drop', { facing: player.facing || 0 }, sync.actorFor(player));
    return true;
  }

  /** HOST: the item `actor` holds falls where the actor stands (leaving / screen gone). */
  function handleDrop(d, actor) {
    const rec = actor && heldByKey(actorKey(actor));
    if (!rec) return { reject: 'nothing-held' };
    return dropItem(rec, actor.pos, d && d.facing);
  }

  function dropItem(rec, pos, facing = null) {
    const ahead = Number.isFinite(facing)
      ? findSpot(pos.x + Math.sin(facing) * 1.5, pos.z + Math.cos(facing) * 1.5) : null;
    const spot = ahead || findSpot(pos.x, pos.z) || rec.home.clone();
    const data = { id: rec.id, spot: vec(spot), yaw: r3(Math.random() * TAU), from: vec(pos) };
    applyDrop(data);
    sync.emit('items', 'drop', data);
    return true;
  }

  function applyDrop(data) {
    const rec = records[data.id];
    if (!rec) return;
    if (rec.holderKey) locks.set(rec.holderKey, LOCK);
    if (rec.state === 'toHand') finishToHand(rec);
    const spot = new THREE.Vector3(data.spot.x, data.spot.y, data.spot.z);
    beginToss(rec, spot, data.yaw, data.from);
  }

  // ------------------------------------------------------------------ per-frame ground presentation
  function updateGround(rec, dt) {
    const inLanding = rec.state === 'landing';
    if (inLanding) {
      rec.t += dt;
      const tt = rec.t;
      let y;
      if (tt < 0.16) { const u = tt / 0.16; y = 0.3 + 0.26 * 4 * u * (1 - u); }              // small bounce on the ground
      else y = 0.3 + (HOVER - 0.3) * easeOutBack(clamp01((tt - 0.16) / (LAND_TIME - 0.16)));   // then float up
      rec.floatG.position.y = y;
      if (tt >= LAND_TIME) { rec.state = 'ground'; rec.t0 = time; register(rec); }
    } else {
      const tt = time - rec.t0;
      rec.floatG.position.y = HOVER + Math.sin(tt * 2.2) * 0.09;
    }
    rec.floatG.rotation.y += dt * SPIN;
    rec.appear = Math.min(1, rec.appear + dt * 3.5);
    const lift = rec.floatG.position.y - HOVER;
    const pulse = 1 + 0.07 * Math.sin(time * 3 + rec.spot.x);
    rec.ring.scale.setScalar(pulse * (0.4 + 0.6 * rec.appear));
    rec.ringMat.opacity = 0.5 * rec.appear + 0.12 * Math.sin(time * 3 + rec.spot.x);
    rec.discMat.opacity = 0.16 * rec.appear;
    rec.disc.scale.setScalar(pulse * 1.2 * rec.appear);
    const bs = clamp01(1 - lift * 0.9) * (0.75 + 0.25 * rec.appear);
    rec.blob.scale.set(bs, 1, bs);

    // occasional sparkle above the item (only when it is near a player, so the particle pool is left alone)
    if (time >= rec.sparkleAt) {
      rec.sparkleAt = time + 1.1 + Math.random() * 1.0;
      let near = false;
      for (const pl of players.list) {
        const dx = pl.position.x - rec.spot.x, dz = pl.position.z - rec.spot.z;
        if (dx * dx + dz * dz < 18 * 18) { near = true; break; }
      }
      if (near && !inLanding) {
        particles.burst('sparkle', { x: rec.spot.x, y: rec.spot.y + HOVER, z: rec.spot.z }, {
          count: 1, radius: 0.6, color: rec.model.userData.accent, speed: 0.5, size: 0.8,
        });
      }
    }
  }

  // ------------------------------------------------------------------ swing + trail (one trail mesh per player, made on first use)
  function makeTrail() {
    const N = TRAIL_MAX;
    const geo = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const col = new THREE.BufferAttribute(new Float32Array(N * 2 * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const idx = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setAttribute('position', pos);
    geo.setAttribute('color', col);
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.renderOrder = 6;
    mesh.name = 'swing-trail';
    scene.add(mesh);
    return { mesh, geo, pos, col, mat, samples: [], active: false, color: new THREE.Color('#ffffff'), alpha: 0.7, saber: false };
  }
  function getTrail(player) {
    let t = trails.get(player);
    if (!t) { t = makeTrail(); trails.set(player, t); }
    return t;
  }
  function disposeTrail(t) {
    scene.remove(t.mesh);
    t.geo.dispose();
    t.mat.dispose();
  }
  const _tb = new THREE.Vector3(), _tt = new THREE.Vector3();

  function trailSample(trail, rec) {
    const ud = rec.model.userData;
    rec.model.updateWorldMatrix(true, false);
    _tb.copy(ud.trailBase).applyMatrix4(rec.model.matrixWorld);
    _tt.copy(ud.trailTip).applyMatrix4(rec.model.matrixWorld);
    trail.samples.push({ b: _tb.clone(), t: _tt.clone(), at: time });
    if (trail.samples.length > TRAIL_MAX) trail.samples.shift();
  }

  function updateTrail(trail) {
    const S = trail.samples;
    while (S.length && time - S[0].at > TRAIL_LIFE) S.shift();
    if (S.length < 2) { trail.mesh.visible = false; trail.geo.setDrawRange(0, 0); return; }
    const p = trail.pos.array, c = trail.col.array;
    const { r, g, b } = trail.color;
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      const age = clamp01((time - s.at) / TRAIL_LIFE);
      const a = Math.pow(1 - age, 1.3) * trail.alpha;
      p.set([s.b.x, s.b.y, s.b.z, s.t.x, s.t.y, s.t.z], i * 6);
      c.set([r, g, b, a * 0.25, r, g, b, a], i * 8);
    }
    trail.pos.needsUpdate = true;
    trail.col.needsUpdate = true;
    trail.geo.setDrawRange(0, (S.length - 1) * 6);
    trail.mesh.visible = true;
  }

  function swing(player, { dig = false, combat = null } = {}) {
    const rec = heldMap.get(player);
    if (!rec || rec.state !== 'held') return false;
    const style = combat && WEAPONS[combat.kind];
    const keys = style ? style.keys.map((k) => k.map((v, i) => combat.combo === 1 && i < 3 ? -v : v)) : null;
    if (!player.swing(style?.duration ?? (dig ? DIG_DUR : ISLAND_SWINGS[rec.kind]?.duration), keys || (dig ? DIG_KEYS : null))) return false;
    rec.swingMode = style ? combat.kind : dig ? 'dig' : 'slash';
    rec.combo = combat?.combo || 0;
    if (dig) {
      const t = trails.get(player);
      if (t) t.active = false;
      later(0.05, () => snd('whoosh', { pitch: 0.7, vol: 0.5 }));
      return true;
    }
    const ud = rec.model.userData;
    const saber = !!ud.setBlade && rec.bladeK > 0.3;
    const trail = getTrail(player);
    trail.samples.length = 0;
    trail.active = true;
    trail.saber = saber;
    trail.color.set(saber ? ud.color : '#ffffff');
    trail.alpha = saber ? 0.85 : 0.55;
    trail.mat.blending = saber ? THREE.AdditiveBlending : THREE.NormalBlending;
    trail.mat.needsUpdate = true;
    later(0.09, () => snd(saber ? 'saber-swing' : 'whoosh', { pitch: 0.92 + Math.random() * 0.16 }));
    if (saber) later(0.16, () => {
      if (rec.holder !== player) return;
      rec.model.updateWorldMatrix(true, false);
      _tt.copy(ud.trailTip).applyMatrix4(rec.model.matrixWorld);
      particles.burst('sparkle', _tt, { count: 3, radius: 0.15, color: ud.accent, speed: 0.6 });
    });
    return true;
  }

  // During a swing the blade direction is driven directly (in the player's frame) so the slash is a wide arc in the
  // plane the camera sees: blade up-and-out on the wind-up, then across the front of the body and down.
  const D2R = Math.PI / 180;
  const _sd = new THREE.Vector3(), _sq1 = new THREE.Quaternion(), _sq2 = new THREE.Quaternion();
  const smooth01 = (a, b, x) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  function applySwingPose(rec, player, u) {
    if (rec.swingMode === 'dig') { applyDigPose(rec, player, u); return; }
    let phi;
    if (u < 0.28) phi = 107 + 25 * easeOutQuad(u / 0.28);
    else if (u < 0.6) phi = 132 - 172 * easeInOut((u - 0.28) / 0.32);
    else phi = -40;
    const w = smooth01(0, 0.14, u) * (1 - smooth01(0.64, 0.96, u));
    const a = phi * D2R;
    _sd.set(Math.cos(a), Math.sin(a), 0.35).normalize();
    if (rec.swingMode === 'sword' && rec.combo === 1) _sd.x *= -1;
    if (rec.swingMode === 'sword' && rec.combo === 2) _sd.set(0.12, Math.cos(a), Math.sin(a)).normalize();
    if (rec.swingMode === 'axe') _sd.set(Math.cos(a), Math.sin(a) * 0.6, 0.8).normalize();
    if (rec.swingMode === 'hammer') _sd.set(0.08, Math.sin(a), Math.cos(a)).normalize();
    _sq1.setFromUnitVectors(Y_AXIS, _sd);                                   // desired blade direction, player frame
    _sq1.premultiply(player.root.quaternion);                                // -> world
    readHand(player);
    _sq2.copy(handQuat).invert().multiply(_sq1);                             // -> hand-socket local
    rec.pivot.quaternion.slerpQuaternions(rec.q1, _sq2, w);
  }

  // Shovel dig: the blade goes up and slightly back, then plunges forward-down into the ground in front of the player.
  function applyDigPose(rec, player, u) {
    let th;                                                  // degrees from straight up toward the player's front
    if (u < 0.28) th = 35 - 50 * easeOutQuad(u / 0.28);
    else if (u < 0.6) { const k = (u - 0.28) / 0.32; th = -15 + 165 * k * k; }
    else th = 150 + 6 * Math.sin((u - 0.6) * 30) * (1 - smooth01(0.6, 0.85, u));   // a little wiggle in the soil
    const w = smooth01(0, 0.14, u) * (1 - smooth01(0.66, 0.96, u));
    const a = th * D2R;
    _sd.set(0.1, Math.cos(a), Math.sin(a)).normalize();
    _sq1.setFromUnitVectors(Y_AXIS, _sd);
    _sq1.premultiply(player.root.quaternion);
    readHand(player);
    _sq2.copy(handQuat).invert().multiply(_sq1);
    rec.pivot.quaternion.slerpQuaternions(rec.q1, _sq2, w);
  }

  // ------------------------------------------------------------------ update
  function update(dt, t) {
    time += dt;
    for (const [pl, v] of locks) { if (v > 0) locks.set(pl, v - dt); else locks.delete(pl); }
    for (const pl of heldMap.keys()) pl.root.updateMatrixWorld(true);   // the arms were just animated; world reads below must be current

    for (let i = timers.length - 1; i >= 0; i--) {
      if (time >= timers[i].at) { const fn = timers[i].fn; timers.splice(i, 1); fn(); }
    }

    for (const rec of records) {
      if (rec.enabled === false) continue;
      switch (rec.state) {
        case 'ground': case 'landing': updateGround(rec, dt); break;
        case 'remote': break;                                   // held by another screen's player: hidden
        case 'toHand': updateToHand(rec, dt); break;
        case 'tossing': updateToss(rec, dt); break;
        case 'held': {
          const pl = rec.holder;
          if (rec.popT < 1) {                    // little squash-pop when it lands in the hand
            rec.popT = Math.min(1, rec.popT + dt / 0.22);
            rec.pivot.scale.setScalar(1 + 0.3 * Math.exp(-6 * rec.popT) * Math.cos(rec.popT * 9));
          }
          if (pl.swinging) { applySwingPose(rec, pl, pl.swingProgress); rec.swingPosed = true; }
          else if (rec.swingPosed) { rec.pivot.quaternion.copy(rec.q1); rec.swingPosed = false; }
          break;
        }
        default: break;
      }
      // lightsaber ignite / retract
      const ud = rec.model.userData;
      if (ud.setBlade) {
        if (rec.bladeK !== rec.bladeTarget) {
          const rate = rec.bladeTarget > rec.bladeK ? 1 / 0.26 : 1 / 0.18;
          rec.bladeK = rec.bladeTarget > rec.bladeK ? Math.min(rec.bladeTarget, rec.bladeK + dt * rate) : Math.max(rec.bladeTarget, rec.bladeK - dt * rate);
          ud.setBlade(easeOutQuad(rec.bladeK));
        }
        if (rec.state === 'held' && rec.bladeK >= 1) ud.update(t ?? time);
      }
    }

    // swing trails: sample while the slash is in motion, then let them fade out
    for (const [pl, trail] of trails) {
      if (trail.active) {
        const rec = heldMap.get(pl);
        if (rec && rec.state === 'held' && pl.swinging && pl.swingProgress > 0.18 && pl.swingProgress < 0.85) trailSample(trail, rec);
        if (!pl.swinging) trail.active = false;
      }
      updateTrail(trail);
    }

    for (const p of players.players) if (p) p.holding = heldMap.has(p);
  }

  // ------------------------------------------------------------------ setup: create + place
  for (const def of DEFS) {
    const spot = findSpot(def.at[0], def.at[1]);
    if (!spot) { console.warn(`[items] no valid spot near (${def.at}) for ${def.kind}; skipped`); continue; }
    const rec = makeRecord(def, spot);
    placeOnGround(rec, Math.random() * TAU, HOVER);
    rec.t0 = time - Math.random() * 3;
    rec.sparkleAt = Math.random() * 1.5;
    register(rec);
    records.push(rec);
  }
  if (frost) {
    const plants = [...frost.gather.bushes, ...frost.gather.herbs, ...frost.gather.mushrooms, ...frost.gather.digs];
    const near = frost.sampleSpots({ area: 'meadow', count: 36, seed: 3202, r: 1.2, minDist: 8 })
      .filter((p) => plants.every((q) => Math.hypot(p.x - q.x, p.z - q.z) > 3))
      .sort((a, b) => Math.hypot(a.x - 9.5, a.z + 82.5) - Math.hypot(b.x - 9.5, b.z + 82.5));
    const kinds = ['axe', 'hammer', 'sword', 'shovel', 'axe', 'hammer', 'sword', 'shovel', 'axe', 'hammer', 'sword', 'shovel', 'axe', 'hammer'];
    if (near.length < kinds.length) throw new Error('Frostpine has too few clear tool spots');
    const used = new Set();
    const choose = (index) => {
      while (used.has(index)) index = (index + 1) % near.length;
      used.add(index);
      return near[index];
    };
    // Keep the original five IDs and spots; spread the nine additions through the rest of the meadow.
    const chosen = [0, 1, Math.max(2, Math.floor(near.length * 0.4)), Math.max(3, Math.floor(near.length * 0.7)), near.length - 1,
      ...[0.1, 0.2, 0.3, 0.5, 0.6, 0.8, 0.9, 0.15, 0.85].map((fraction) => Math.floor(near.length * fraction))].map(choose);
    for (const [i, kind] of kinds.entries()) {
      const p = chosen[i];
      if (!p) throw new Error('Frostpine tool placement failed');
      const spot = findSpot(p.x, p.z);
      if (!spot) throw new Error(`Frostpine tool ${kind} has no clear ground`);
      const rec = makeRecord({ kind }, spot);
      placeOnGround(rec, 0, HOVER);
      register(rec);
      records.push(rec);
    }
  }

  if (ember) {                                  // Step 37a: Emberleaf's five tools, appended after Frostpine's (ids continue the list; spots from islands/emberGathering.js planEmberTools)
    for (const t of ember.tools) {
      const spot = findSpot(t.x, t.z);
      if (!spot) throw new Error(`Emberleaf tool ${t.kind} has no clear ground`);
      const rec = makeRecord({ kind: t.kind }, spot);
      placeOnGround(rec, 0, HOVER);
      register(rec);
      records.push(rec);
    }
  }

  // Stable reserved IDs; only one set per entrant becomes available.
  for (let slot = 0; slot < 4; slot++) for (const [i, kind] of ['sword', 'axe', 'hammer'].entries()) {
    const spot = new THREE.Vector3(DUNGEON.x - 7 + slot * 4.5, DUNGEON.y, DUNGEON.z + 13 + i * 2.5);
    const rec = makeRecord({ kind }, spot);
    rec.dungeonSlot = slot; rec.enabled = false; rec.state = 'disabled'; rec.ground.visible = false; records.push(rec);
  }

  function applySpecial(d) {
    if (records[d.id] || d.id !== records.length || d.kind !== 'lightsaber') return false;
    const spot = new THREE.Vector3(d.spot.x, d.spot.y, d.spot.z);
    const rec = makeRecord({ kind: d.kind, color: d.color, special: true }, spot);
    records.push(rec);
    placeOnGround(rec, 0, HOVER);
    register(rec);
    return true;
  }

  function poof(rec, from = null) {
    if (rec.state === 'gone') return;
    rec.pivot.updateWorldMatrix(true, false);
    const at = rec.pivot.getWorldPosition(new THREE.Vector3());
    if (rec.state === 'remote' && from) at.set(from.x, from.y + 1.1, from.z);
    particles.burst('puff', at, { count: 10, radius: 0.45 });
    particles.burst('sparkle', at, { count: 5, radius: 0.4, color: rec.model.userData.accent });
    if (rec.holder && heldMap.get(rec.holder) === rec) {
      heldMap.delete(rec.holder);
      rec.holder.holding = false;
    }
    const trail = trails.get(rec.holder);
    if (trail) { disposeTrail(trail); trails.delete(rec.holder); }
    unregister(rec);
    rec.pivot.removeFromParent();
    rec.ground.removeFromParent();
    rec.pivot.visible = rec.ground.visible = false;
    rec.holder = rec.holderKey = null;
    rec.state = 'gone'; // Keep the stable network id as a tombstone; never a ground pickup.
  }

  function applyEthereal(d) {
    const def = rememberedTool(d);
    if (!def || d.id !== records.length || !d.home) return false;
    const rec = makeRecord(def, new THREE.Vector3(d.home.x, d.home.y, d.home.z));
    rec.ethereal = true;
    rec.model.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      const fade = (mat) => {
        const copy = mat.clone();
        copy.transparent = true;
        copy.opacity *= 0.72;
        copy.depthWrite = false;
        return copy;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(fade) : fade(mesh.material);
    });
    const animate = rec.model.userData.update;
    const glow = rec.model.getObjectByName('blade-glow');
    if (animate && glow) rec.model.userData.update = (t) => {
      animate(t);
      if (rec.model.userData.bladeK >= 0.99) glow.material.opacity *= 0.72;
    };
    records.push(rec);
    if (d.holder) setHeld(rec, d.holder);
    else { rec.ground.visible = false; rec.pivot.visible = false; rec.state = 'remote'; }
    return true;
  }

  function restoreEthereal(tool, player) {
    const def = rememberedTool(tool);
    if (!sync.isHost || !def || !player || heldMap.has(player)) return null;
    const data = { ...def, id: records.length, home: vec(player.position), holder: keyOf(player) };
    if (!applyEthereal(data)) return null;
    sync.emit('items', 'ethereal', data);
    return records[data.id];
  }

  function spawnSpecial(kind, at, opts = {}) {
    if (!sync.isHost || kind !== 'lightsaber' || !at) return null;
    const spot = findSpot(Number(at.x), Number(at.z));
    if (!spot) return null;
    const d = { id: records.length, kind, color: opts.color || '#4db8ff', spot: vec(spot) };
    if (!applySpecial(d)) return null;
    sync.emit('items', 'spawnSpecial', d);
    return records[d.id];
  }

  function applyDungeonSupply({ count, restock = false }) {
    for (const rec of records) if (rec.dungeonSlot !== undefined && !rec.holderKey) {
      const enabled = rec.dungeonSlot < count;
      if (!enabled) { unregister(rec); rec.enabled = false; rec.state = 'disabled'; rec.ground.visible = false; }
      else if (rec.enabled === false || restock) { rec.enabled = true; setGround(rec, rec.home); }
    }
  }
  function dungeonSupply(count, restock = false) {
    if (!sync.isHost) return;
    const data = { count: Math.max(0, Math.min(4, count)), restock };
    applyDungeonSupply(data); sync.emit('items', 'dungeonSupply', data);
  }

  // ------------------------------------------------------------------ world sync domain
  /** Replica: put `rec` on the ground at `spot` right now (no toss animation). */
  function setGround(rec, spot) {
    if (rec.ethereal) { poof(rec); return; }
    unregister(rec);
    if (rec.holder && heldMap.get(rec.holder) === rec) { heldMap.delete(rec.holder); rec.holder.holding = false; }
    rec.holder = null;
    rec.holderKey = null;
    rec.swingPosed = false;
    rec.spot.set(spot.x, spot.y, spot.z);
    rec.pivot.visible = true;
    rec.bladeK = rec.bladeTarget = 0;
    rec.model.userData.setBlade?.(0);
    placeOnGround(rec, rec.floatG.rotation.y, HOVER);
    rec.state = 'ground';
    rec.appear = 1;
    rec.t0 = time;
    register(rec);
  }

  /** Replica: make `key` hold `rec` right now (in its hand when it is one of this screen's players, else hidden). */
  function setHeld(rec, key) {
    unregister(rec);
    if (rec.holder && heldMap.get(rec.holder) === rec) { heldMap.delete(rec.holder); rec.holder.holding = false; }
    rec.holderKey = key;
    rec.swingPosed = false;
    rec.pivot.visible = true;
    const player = localPlayerOfKey(key);
    if (!player) { goRemote(rec); return; }
    const prev = heldMap.get(player);
    if (prev && prev !== rec) setGround(prev, prev.spot);
    rec.holder = player;
    rec.ground.visible = false;
    rec.q1.copy(holdQuat(rec));
    heldMap.set(player, rec);
    player.holding = true;
    finishToHand(rec);
  }

  // (requests only work once the replica is 'synced', which is just after the snapshot is applied)
  const staleKeys = [];
  sync.on('snapshot', () => {
    for (const key of staleKeys.splice(0)) {
      const p = players.p1.position;
      sync.request('items', 'drop', {}, { screen: sync.screenId, index: Number(key.slice(key.lastIndexOf(':') + 1)), pos: { x: r3(p.x), y: r3(p.y), z: r3(p.z) } });
    }
  });

  sync.register('items', {
    snapshot: () => ({ items: records.map((r) => ({ id: r.id, enabled: r.enabled !== false, holder: r.holderKey, spot: r.holderKey ? null : vec(r.spot), gone: r.state === 'gone', ethereal: r.ethereal ? { kind: r.kind, color: r.color, roll: r.roll, home: vec(r.home) } : null, special: r.special ? { kind: r.kind, color: r.color, home: vec(r.home) } : null })) }),
    applySnapshot(snap) {
      for (const e of (snap && snap.items) || []) {
        if (!records[e.id] && e.ethereal) applyEthereal({ id: e.id, ...e.ethereal, holder: null });
        if (!records[e.id] && e.special) applySpecial({ id: e.id, ...e.special, spot: e.special.home });
        const rec = records[e.id];
        if (!rec) continue;
        if (e.gone) { poof(rec); continue; }
        if (rec.dungeonSlot !== undefined) {
          rec.enabled = e.enabled !== false;
          if (!rec.enabled && !e.holder) { unregister(rec); rec.state = 'disabled'; rec.ground.visible = false; continue; }
        }
        if (e.holder) {
          if (rec.holderKey === e.holder && (rec.state === 'held' || rec.state === 'toHand' || rec.state === 'remote')) continue;
          setHeld(rec, e.holder);
          if (sync.isReplica && !rec.holder && e.holder.startsWith(sync.screenId + ':')) {   // held by a player of THIS screen that no longer exists (the page was reloaded): let it fall
            staleKeys.push(e.holder);
          }
        } else {
          const same = !rec.holderKey && (rec.state === 'ground' || rec.state === 'landing' || rec.state === 'tossing')
            && Math.hypot(rec.spot.x - e.spot.x, rec.spot.z - e.spot.z) < 0.05;
          if (!same) setGround(rec, e.spot);
        }
      }
    },
    applyEvent(kind, d) {
      if (kind === 'pickup') applyPickup(d);
      else if (kind === 'drop') applyDrop(d);
      else if (kind === 'spawnSpecial') applySpecial(d);
      else if (kind === 'ethereal') applyEthereal(d);
      else if (kind === 'dungeonSupply') applyDungeonSupply(d);
    },
    handleRequest(kind, d, actor) {
      if (kind === 'pickup') return handlePickup(d, actor);
      if (kind === 'drop') return handleDrop(d, actor);
      return { reject: 'unknown-kind' };
    },
    /** Host: a screen stayed away for the whole grace period: what its actors hold falls where they last stood. */
    screenLeft(screenId) {
      for (const rec of records) {
        if (!rec.holderKey || !rec.holderKey.startsWith(screenId + ':')) continue;
        const a = sync.actors.get(rec.holderKey);
        dropItem(rec, a ? a.pos : { x: rec.home.x, y: rec.home.y, z: rec.home.z });
      }
    },
  });

  return {
    update,
    swing,
    dropFor,
    dropHeld,
    spawnSpecial,
    restoreEthereal,
    dungeonSupply,
    heldBy(player) { return heldMap.get(player) || null; },
    /** Host: the item an actor key ("screen:index", any screen) holds, whatever its local state ('remote' for another screen's players). */
    heldByKey(key) { return heldByKey(key); },
    /** Debug: [{ id, name, state, holder (actor key or null), spot }] */
    summary() { return records.map((r) => ({ id: r.id, name: r.name, state: r.state, holder: r.holderKey, spot: r.holderKey ? null : vec(r.spot) })); },
    get held() { return heldMap.get(players.p1) || null; },
    list: records,
    get holdQuat() { const h = heldMap.get(players.p1); return h ? h.pivot.quaternion : null; },
    /** Debug: pick an item up by name as if it had been interacted with (ignores distance, honours the pickup lock and first-come rule). */
    equip(name, player = players.p1) {
      const q = String(name).toLowerCase();
      const rec = records.find((r) => r.name.toLowerCase() === q) || records.find((r) => r.name.toLowerCase().includes(q));
      if (!rec) return null;
      return pickUp(rec, player) ? rec : null;
    },
    /** Debug: current hold rotation of the held items can be re-tuned at runtime. */
    rehold() { for (const rec of heldMap.values()) if (rec.state === 'held') rec.pivot.quaternion.copy(holdQuat(rec)); },
    _trails: trails,
  };
}
