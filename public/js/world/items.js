// Equippable items: ground pickups (axe, sword, hammer, shovel, three lightsabers), equipping into the player's right
// hand, Animal-Crossing style swapping (the held item is tossed to where the new one lay) and the swing action.
//
//   const items = createItems({ scene, player, particles, hud, sfx });
//   items.update(dt, t)          // once per tick, AFTER player.update (it reads the animated hand transform)
//   items.swing()                // Interact with nothing else in range: swing the held item (returns true if a swing started)
//   items.held                   // record of the held item ({ name, kind, model, state, ... }) or null
//   items.list                   // every item record ({ name, kind, state: 'ground'|'landing'|'toHand'|'held'|'tossing', spot })
//   items.equip('axe')           // debug: pick an item up by (partial, case-insensitive) name as if walking up to it
//
// Item lifecycle (state):  ground -> toHand -> held -> tossing -> landing -> ground ...
//   * only 'ground' items have an interactable (type 'item'), so an item can never be picked up twice or while in flight
//   * pickups are ignored for LOCK seconds after one happens, and a swap always ends with exactly one item in hand
import * as THREE from 'three';
import { buildItemModel } from '../items/models.js';
import { HOLD_ARM_X, HOLD_ARM_Z } from '../player/player.js';
import { getHeight, isWalkable, getGroundType, getSlope, streamDistance } from './terrain.js';
import { overlapsAny } from './colliders.js';
import { addInteractable, removeInteractable, getInteractables } from './interactables.js';

const HOVER = 0.7;             // height of the item's centre above the ground while it floats
const TILT = 0.42;             // lean of a floating item (rad)
const GROUND_SCALE = 1.2;      // floating pickups are drawn a bit bigger than the held item so they catch the eye
const SPIN = 1.15;             // rad/s
const TOSS_TIME = 0.45;
const LAND_TIME = 0.6;
const TO_HAND_TIME = 0.2;
const LOCK = 0.3;              // s during which further pickups are ignored
const TRAIL_LIFE = 0.24;
const TRAIL_MAX = 16;

const TAU = Math.PI * 2;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutQuad = (u) => 1 - (1 - u) * (1 - u);
const easeInOut = (u) => u * u * (3 - 2 * u);
const easeOutBack = (u) => { const c = 1.9; const v = u - 1; return 1 + (c + 1) * v * v * v + c * v * v; };

/** Hand-picked spots (nudged to the nearest valid one at start-up). */
const DEFS = [
  { kind: 'axe',        at: [6, 10.5],      roll: Math.PI },      // ~4u from spawn, visible from the first frame
  { kind: 'sword',      at: [29.1, 39.5] },                       // south-east beach
  { kind: 'hammer',     at: [-7.5, -21.1] },                      // top of the plateau
  { kind: 'lightsaber', at: [15, 14],         color: '#4db8ff' }, // by the pond
  { kind: 'lightsaber', at: [-42.3, 8.4],     color: '#5dff7a' }, // west beach
  { kind: 'lightsaber', at: [-26, -4],        color: '#ff77c8' }, // west meadow
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

export function createItems({ scene, player, particles, hud, sfx = null }) {
  const snd = (name, opts) => { if (sfx) sfx.play(name, opts); };
  let time = 0;
  let lock = 0;
  let held = null;
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
    if (overlapsAny(x, z, 1.0)) return false;
    for (const it of getInteractables()) {           // keep clear of other interactables so the prompt is unambiguous
      if (Math.hypot(it.position.x - x, it.position.z - z) - it.radius < 1.8) return false;
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
    const restZ = player.parts.armR.userData.restZ;
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
      name: ud.name, kind: def.kind, roll: def.roll ?? 0, model, pivot, ground, floatG, blob, ring, disc, ringMat, discMat,
      spot: spot.clone(), state: 'ground', t: 0, t0: 0, ofs: 1, interactable: null,
      bladeK: 0, bladeTarget: 0, appear: 1, sparkleAt: 0,
      p0: new THREE.Vector3(), q0: new THREE.Quaternion(), q1: new THREE.Quaternion(), yaw0: 0, popT: 1,
    };
    model.userData.setBlade?.(0);
    return rec;
  }

  const setOfs = (rec, k) => { rec.ofs = k; rec.model.position.y = -rec.model.userData.center * k; };

  function register(rec) {
    if (rec.interactable) return;
    rec.interactable = addInteractable({
      type: 'item', object: rec.ground, position: rec.spot, radius: 0.55, prompt: `Pick up ${rec.name}`,
      onInteract: () => pickUp(rec),
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
  function readHand() {
    const s = player.parts.handSocket;
    s.updateWorldMatrix(true, false);
    s.getWorldPosition(handPos);
    s.getWorldQuaternion(handQuat);
  }

  // ------------------------------------------------------------------ pickup / swap
  function pickUp(rec) {
    if (lock > 0 || rec.state !== 'ground' || rec === held) return false;
    lock = LOCK;
    const spot = rec.spot.clone();
    unregister(rec);
    const prev = held;
    if (prev && prev.state === 'toHand') finishToHand(prev);   // never leave one mid-flight
    beginToHand(rec);
    held = rec;
    player.holding = true;
    hud.toast(`Got the ${rec.name}!`, { icon: 'sparkle' });
    snd('equip');
    if (prev) beginToss(prev, spot);
    return true;
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
    readHand();
    const e = easeInOut(u);
    rec.pivot.position.lerpVectors(rec.p0, handPos, e);
    rec.pivot.position.y += Math.sin(u * Math.PI) * 0.5;
    qTmp.copy(handQuat).multiply(rec.q1);
    rec.pivot.quaternion.slerpQuaternions(rec.q0, qTmp, e);
    setOfs(rec, 1 - e);
    rec.pivot.scale.setScalar(GROUND_SCALE + (1 - GROUND_SCALE) * e);
  }

  function finishToHand(rec) {
    player.parts.handSocket.add(rec.pivot);
    rec.pivot.position.set(0, 0, 0);
    rec.pivot.quaternion.copy(rec.q1);
    setOfs(rec, 0);
    rec.state = 'held';
    rec.popT = 0;
    rec.pivot.scale.setScalar(1.3);
    rec.bladeTarget = 1;
    if (rec.model.userData.setBlade) snd('saber-on');
    readHand();
    particles.burst('sparkle', handPos, { count: 4, radius: 0.3, color: rec.model.userData.accent });
  }

  function beginToss(rec, spot) {
    rec.pivot.updateWorldMatrix(true, false);
    rec.pivot.getWorldPosition(rec.p0);
    rec.pivot.getWorldQuaternion(rec.q0);
    scene.attach(rec.pivot);
    rec.pivot.scale.setScalar(1);
    rec.spot.copy(spot);
    rec.yaw0 = Math.random() * TAU;
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

    // occasional sparkle above the item (only when it is near the player, so the particle pool is left alone)
    if (time >= rec.sparkleAt) {
      rec.sparkleAt = time + 1.1 + Math.random() * 1.0;
      const dx = player.position.x - rec.spot.x, dz = player.position.z - rec.spot.z;
      if (dx * dx + dz * dz < 18 * 18 && !inLanding) {
        particles.burst('sparkle', { x: rec.spot.x, y: rec.spot.y + HOVER, z: rec.spot.z }, {
          count: 1, radius: 0.6, color: rec.model.userData.accent, speed: 0.5, size: 0.8,
        });
      }
    }
  }

  // ------------------------------------------------------------------ swing + trail
  const trail = (() => {
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
  })();
  const _tb = new THREE.Vector3(), _tt = new THREE.Vector3();

  function trailSample(rec) {
    const ud = rec.model.userData;
    rec.model.updateWorldMatrix(true, false);
    _tb.copy(ud.trailBase).applyMatrix4(rec.model.matrixWorld);
    _tt.copy(ud.trailTip).applyMatrix4(rec.model.matrixWorld);
    trail.samples.push({ b: _tb.clone(), t: _tt.clone(), at: time });
    if (trail.samples.length > TRAIL_MAX) trail.samples.shift();
  }

  function updateTrail() {
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

  function swing() {
    const rec = held;
    if (!rec || rec.state !== 'held') return false;
    if (!player.swing()) return false;
    const ud = rec.model.userData;
    const saber = !!ud.setBlade && rec.bladeK > 0.3;
    trail.samples.length = 0;
    trail.active = true;
    trail.saber = saber;
    trail.color.set(saber ? ud.color : '#ffffff');
    trail.alpha = saber ? 0.85 : 0.55;
    trail.mat.blending = saber ? THREE.AdditiveBlending : THREE.NormalBlending;
    later(0.09, () => snd(saber ? 'saber-swing' : 'whoosh', { pitch: 0.92 + Math.random() * 0.16 }));
    if (saber) later(0.16, () => {
      if (held !== rec) return;
      rec.model.updateWorldMatrix(true, false);
      _tt.copy(ud.trailTip).applyMatrix4(rec.model.matrixWorld);
      particles.burst('sparkle', _tt, { count: 3, radius: 0.15, color: ud.accent, speed: 0.6 });
    });
    return true;
  }

  // During a swing the blade direction is driven directly (in the player's frame) so the slash is a wide arc in the
  // plane the camera sees: blade up-and-out on the wind-up, then across the front of the body and down.
  const D2R = Math.PI / 180;
  const _sd = new THREE.Vector3(), _sq1 = new THREE.Quaternion(), _sq2 = new THREE.Quaternion(), _sq3 = new THREE.Quaternion();
  const smooth01 = (a, b, x) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  function applySwingPose(rec, u) {
    let phi;
    if (u < 0.28) phi = 107 + 25 * easeOutQuad(u / 0.28);
    else if (u < 0.6) phi = 132 - 172 * easeInOut((u - 0.28) / 0.32);
    else phi = -40;
    const w = smooth01(0, 0.14, u) * (1 - smooth01(0.64, 0.96, u));
    const a = phi * D2R;
    _sd.set(Math.cos(a), Math.sin(a), 0.35).normalize();
    _sq1.setFromUnitVectors(Y_AXIS, _sd);                                   // desired blade direction, player frame
    _sq1.premultiply(player.root.quaternion);                                // -> world
    readHand();
    _sq2.copy(handQuat).invert().multiply(_sq1);                             // -> hand-socket local
    rec.pivot.quaternion.slerpQuaternions(rec.q1, _sq2, w);
  }

  // ------------------------------------------------------------------ update
  function update(dt, t) {
    time += dt;
    if (lock > 0) lock -= dt;
    player.root.updateMatrixWorld(true);        // the arm was just animated; world reads below must be current

    for (let i = timers.length - 1; i >= 0; i--) {
      if (time >= timers[i].at) { const fn = timers[i].fn; timers.splice(i, 1); fn(); }
    }

    for (const rec of records) {
      switch (rec.state) {
        case 'ground': case 'landing': updateGround(rec, dt); break;
        case 'toHand': updateToHand(rec, dt); break;
        case 'tossing': updateToss(rec, dt); break;
        case 'held':
          if (rec.popT < 1) {                    // little squash-pop when it lands in the hand
            rec.popT = Math.min(1, rec.popT + dt / 0.22);
            rec.pivot.scale.setScalar(1 + 0.3 * Math.exp(-6 * rec.popT) * Math.cos(rec.popT * 9));
          }
          if (player.swinging) { applySwingPose(rec, player.swingProgress); rec.swingPosed = true; }
          else if (rec.swingPosed) { rec.pivot.quaternion.copy(rec.q1); rec.swingPosed = false; }
          break;
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

    // swing trail: sample while the slash is in motion, then let it fade out
    if (trail.active) {
      const rec = held;
      if (rec && rec.state === 'held' && player.swinging && player.swingProgress > 0.18 && player.swingProgress < 0.85) trailSample(rec);
      if (!player.swinging) trail.active = false;
    }
    updateTrail();

    player.holding = !!held;
  }

  // ------------------------------------------------------------------ setup: create + place
  const placed = [];
  for (const def of DEFS) {
    const spot = findSpot(def.at[0], def.at[1]);
    if (!spot) { console.warn(`[items] no valid spot near (${def.at}) for ${def.kind}; skipped`); continue; }
    const rec = makeRecord(def, spot);
    placeOnGround(rec, Math.random() * TAU, HOVER);
    rec.t0 = time - Math.random() * 3;
    rec.sparkleAt = Math.random() * 1.5;
    register(rec);
    records.push(rec);
    placed.push(spot);
  }

  return {
    update,
    swing,
    get held() { return held; },
    list: records,
    get holdQuat() { return held ? held.pivot.quaternion : null; },
    /** Debug: pick an item up by name as if it had been interacted with (ignores distance, honours the pickup lock). */
    equip(name) {
      const q = String(name).toLowerCase();
      const rec = records.find((r) => r.name.toLowerCase() === q) || records.find((r) => r.name.toLowerCase().includes(q));
      if (!rec) return null;
      return pickUp(rec) ? rec : null;
    },
    /** Debug: current hold rotation of the held item can be re-tuned at runtime. */
    rehold() { if (held && held.state === 'held') held.pivot.quaternion.copy(holdQuat(held)); },
    _trail: trail,
  };
}
