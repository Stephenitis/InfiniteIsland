// What happens when you press Interact on something: tree / palm shake (+ leaves, petals, fruit), flower boing,
// rock clink, bush rustle, signpost dialog. Also the Cancel emote (hop + puff), fruit physics and a tiny
// time-driven animation runner, so everything advances with `update(dt)` (deterministic under __game.step).
//
//   const fx = createInteractions({ scene, player, hud, dialog, particles, sfx });   // installs item.onInteract for all interactables
//   fx.interact(item)      // cooldown + turn the player + run item.onInteract; returns true if it fired
//   fx.cancel()            // hop emote (+ puff); returns true if the hop started
//   fx.update(dt)
import * as THREE from 'three';
import { getHeight, isWalkable } from './terrain.js';
import { getInteractables } from './interactables.js';
import { toonMat, addOutline } from '../render/toon.js';

const TAU = Math.PI * 2;
const ITEM_COOLDOWN = 0.45;      // s, per object (spamming is fine, it just doesn't restart mid-wobble)
const GLOBAL_COOLDOWN = 0.12;    // s, between any two interactions
const MAX_FRUITS = 20;
const FRUIT_CHANCE = 0.35;
const FRUIT_GRAVITY = 22;

const rnd = (a, b) => a + Math.random() * (b - a);
/** Damped sinusoid: starts at 0, swings, dies out. */
const wave = (t, freq, decay) => Math.exp(-decay * t) * Math.sin(TAU * freq * t);

const SIGN_PAGES = [
  'Welcome to Infinite Island! Take your time, wander around and poke at everything.',
  'Move with WASD or the arrow keys. Press E (or Space) to interact, and Q to hop!',
  'Got a gamepad? Plug it in: stick to move, A to interact, B to hop.',
  'Psst! I spotted some tools lying around the island: an axe, a sword, a hammer... and even glowing lightsabers! Pick one up, then press E with nothing nearby to swing it.',
  'Want to play on your phone? Press the yellow phone button (top right) or P to connect it as a controller. M mutes the sounds. Have fun!',
];

const FRUITS = {
  apple: { color: '#ff4d5e', r: 0.21, cap: '#4fbf5f' },
  peach: { color: '#ffb08a', r: 0.22, cap: '#5fc25a' },
  coconut: { color: '#7a4a2a', r: 0.26, cap: null },
};

export function createInteractions({ scene, player, hud, dialog, particles, sfx = null }) {
  const snd = (name, opts) => { if (sfx) sfx.play(name, opts); };
  let time = 0;
  let lastAny = -10;
  const anims = new Map();      // key -> { t, dur, tick(t), end() }
  const timers = [];            // { at, fn }
  const fruits = [];
  const fruitGroup = new THREE.Group();
  fruitGroup.name = 'fruits';
  scene.add(fruitGroup);

  // ------------------------------------------------------------------ helpers
  function animate(key, dur, tick, end) {
    const old = anims.get(key);
    if (old) old.end();
    anims.set(key, { t: 0, dur, tick, end });
  }
  const later = (delay, fn) => timers.push({ at: time + delay, fn });

  /** Direction from the player to `p`, expressed in the local frame of `obj` (which only has yaw). */
  function pushDirLocal(obj) {
    let dx = obj.position.x - player.position.x, dz = obj.position.z - player.position.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const c = Math.cos(obj.rotation.y), s = Math.sin(obj.rotation.y);
    return { lx: dx * c - dz * s, lz: dx * s + dz * c, wx: dx, wz: dz };
  }

  // ------------------------------------------------------------------ fruit
  const fruitGeos = {};
  function fruitGeo(kind) {
    return (fruitGeos[kind] ||= new THREE.SphereGeometry(FRUITS[kind].r, 14, 10));
  }
  const stemGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.09, 5);
  const capGeo = new THREE.SphereGeometry(0.07, 6, 4);
  capGeo.scale(1.3, 0.5, 0.9);

  function makeFruit(kind) {
    const def = FRUITS[kind];
    const root = new THREE.Group();
    const body = new THREE.Mesh(fruitGeo(kind), toonMat(def.color));
    body.castShadow = false;   // tiny: skip the shadow-pass draw call
    addOutline(body, 0.035);
    root.add(body);
    if (def.cap) {
      const stem = new THREE.Mesh(stemGeo, toonMat('#7a4a2a'));
      stem.position.y = def.r * 0.98;
      const leaf = new THREE.Mesh(capGeo, toonMat(def.cap));
      leaf.position.set(0.07, def.r * 1.0, 0);
      leaf.rotation.z = -0.4;
      root.add(stem, leaf);
    } else {
      // coconut: three little dark "eyes"
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + 0.5;
        const eye = new THREE.Mesh(capGeo, toonMat('#3d2413'));
        eye.scale.setScalar(0.55);
        eye.position.set(Math.cos(a) * 0.08, def.r * 0.93, Math.sin(a) * 0.08);
        root.add(eye);
      }
    }
    return { root, body, kind, r: def.r };
  }

  function spawnFruit(kind, from, avoidAngleToPlayer = true) {
    const f = makeFruit(kind);
    // pick a landing spot near the trunk, preferring the player's side, on walkable ground
    const toPlayer = Math.atan2(player.position.z - from.z, player.position.x - from.x);
    let tx = from.x, tz = from.z;
    for (let i = 0; i < 10; i++) {
      const a = (avoidAngleToPlayer ? toPlayer + rnd(-1.3, 1.3) : rnd(0, TAU));
      const d = rnd(1.3, 2.4);
      const x = from.x + Math.cos(a) * d, z = from.z + Math.sin(a) * d;
      if (isWalkable(x, z) && getHeight(x, z) > 0.2) { tx = x; tz = z; break; }
    }
    const y1 = getHeight(tx, tz) + f.r;
    const vy = 6.5;
    const t = (vy + Math.sqrt(vy * vy + 2 * FRUIT_GRAVITY * Math.max(0, from.y - y1))) / FRUIT_GRAVITY;
    Object.assign(f, {
      x: from.x, y: from.y, z: from.z,
      vx: (tx - from.x) / t, vy, vz: (tz - from.z) / t,
      state: 'fly', bounces: 0, age: 0, sq: 0, sqv: 0, spin: rnd(-6, 6), scale: 0.4, restT: 0,
    });
    f.root.position.set(f.x, f.y, f.z);
    f.root.scale.setScalar(f.scale);
    fruitGroup.add(f.root);
    fruits.push(f);
    // cap the number of lying-around fruits: the oldest ones pop away
    let alive = fruits.filter((q) => q.state !== 'dying').length;
    for (let i = 0; i < fruits.length && alive > MAX_FRUITS; i++) {
      if (fruits[i].state !== 'dying') { fruits[i].state = 'dying'; fruits[i].dieT = 0; alive--; }
    }
    return f;
  }

  function updateFruits(dt) {
    for (let i = fruits.length - 1; i >= 0; i--) {
      const f = fruits[i];
      f.age += dt;
      if (f.scale < 1) f.scale = Math.min(1, f.scale + dt * 6);
      if (f.state === 'fly') {
        f.vy -= FRUIT_GRAVITY * dt;
        f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
        f.root.rotation.y += f.spin * dt;
        const gy = getHeight(f.x, f.z) + f.r;
        if (f.y <= gy && f.vy < 0) {
          f.y = gy;
          f.bounces++;
          const impact = -f.vy;
          f.sq = Math.min(0.4, impact * 0.05); f.sqv = 0;
          if (impact < 2.2 || f.bounces >= 3) { f.state = 'rest'; f.vy = f.vx = f.vz = 0; }
          else { f.vy = impact * 0.5; f.vx *= 0.55; f.vz *= 0.55; f.spin *= 0.5; }
        }
      } else if (f.state === 'rest') {
        f.y = getHeight(f.x, f.z) + f.r;
      } else if (f.state === 'dying') {
        f.dieT += dt;
        f.scale = Math.max(0, 1 - f.dieT / 0.3);
        if (f.dieT >= 0.3) {
          fruitGroup.remove(f.root);
          fruits.splice(i, 1);
          continue;
        }
      }
      // squash spring
      f.sqv += (-220 * f.sq - 13 * f.sqv) * dt;
      f.sq += f.sqv * dt;
      f.body.scale.set(1 + f.sq * 0.5, 1 - f.sq, 1 + f.sq * 0.5);
      f.body.position.y = -f.sq * f.r * 0.6;
      f.root.position.set(f.x, f.y, f.z);
      f.root.scale.setScalar(f.scale);
    }
  }

  // ------------------------------------------------------------------ per-type effects
  function shakeTree(item) {
    const g = item.object;
    const mesh = g.userData.canopy;
    const palm = item.type === 'palm';
    snd('leaves');
    const { lx, lz } = pushDirLocal(g);
    const amp = palm ? 0.085 : 0.05;
    const freq = palm ? 4.2 : 6.5;
    const decay = palm ? 2.4 : 3.6;
    const dur = palm ? 1.3 : 0.9;
    animate(item.id, dur,
      (t) => {
        const w = wave(t, freq, decay);
        const w2 = wave(t + 0.06, freq * 1.03, decay);
        mesh.rotation.z = -amp * w * lx + amp * 0.35 * w2 * lz;
        mesh.rotation.x = amp * w * lz + amp * 0.35 * w2 * lx;
        mesh.scale.y = 1 + (palm ? 0.012 : 0.03) * wave(t, freq * 2, decay);
        if (palm) mesh.rotation.y = 0.07 * wave(t, freq * 0.8, decay * 0.8);   // fronds twist
      },
      () => { mesh.rotation.set(0, 0, 0); mesh.scale.set(1, 1, 1); });

    // where leaves / fruit come from
    g.updateMatrixWorld(true);
    const s = g.scale.x;
    const crown = palm
      ? g.localToWorld(g.userData.topLocal.clone())
      : new THREE.Vector3(g.position.x, g.position.y + 3.1 * g.scale.y, g.position.z);
    const cherry = !!g.userData.cherry;
    const type = cherry ? 'petal' : 'leaf';
    const radius = palm ? 1.3 : 1.6 * s;
    particles.burst(palm ? 'leaf' : type, crown, { count: palm ? 8 : 12, radius, height: 0.5, ring: true });
    later(0.18, () => particles.burst(palm ? 'leaf' : type, crown, { count: palm ? 4 : 7, radius, height: 0.6, ring: true }));

    if (Math.random() < FRUIT_CHANCE) {
      const kind = palm ? 'coconut' : (cherry ? 'peach' : 'apple');
      const a = rnd(0, TAU);
      const from = { x: crown.x + Math.cos(a) * radius * 0.5, y: crown.y - 0.2, z: crown.z + Math.sin(a) * radius * 0.5 };
      later(0.15, () => spawnFruit(kind, from));
    }
  }

  function boingFlower(item) {
    const inst = item.instance;
    snd('pop', { pitch: 1.1 + Math.random() * 0.4 });
    const dummy = boingFlower.dummy || (boingFlower.dummy = new THREE.Object3D());
    const set = (sy, sxz, tx, tz) => {
      dummy.position.copy(inst.position);
      dummy.rotation.set(inst.tiltX + tx, inst.rotY, inst.tiltZ + tz);
      dummy.scale.set(inst.scale * sxz, inst.scale * sy, inst.scale * sxz);
      dummy.updateMatrix();
      inst.mesh.setMatrixAt(inst.index, dummy.matrix);
      inst.mesh.instanceMatrix.needsUpdate = true;
    };
    animate(item.id, 1.0,
      (t) => {
        const w = wave(t, 3.2, 3.4);
        const sy = 1 + 0.7 * w;                  // stretch up first, then springs (squash/stretch)
        set(sy, 1 - 0.45 * (sy - 1), 0.25 * wave(t, 2.4, 3), 0.25 * wave(t + 0.1, 2.2, 3));
      },
      () => set(1, 1, 0, 0));
    particles.burst('sparkle', { x: inst.position.x, y: inst.position.y + 0.5 * inst.scale, z: inst.position.z }, { count: 5, radius: 0.15, speed: 0.7 });
  }

  function clinkRock(item) {
    const g = item.object;
    const mesh = g.children[0];
    const { lx, lz } = pushDirLocal(g);
    animate(item.id, 0.55,
      (t) => {
        const w = wave(t, 8, 7);
        mesh.rotation.z = -0.07 * w * lx;
        mesh.rotation.x = 0.07 * w * lz;
        mesh.position.y = 0.05 * Math.abs(wave(t, 5, 6));
      },
      () => { mesh.rotation.set(0, 0, 0); mesh.position.y = 0; });
    const top = { x: g.position.x, y: g.position.y + 0.9 * g.scale.y, z: g.position.z };
    particles.burst('sparkle', top, { count: 8, radius: 0.5 * g.scale.x });
    snd('clink');
    hud.toast('clink!', { icon: 'sparkle' });
  }

  function rustleBush(item) {
    const g = item.object;
    const mesh = g.children[0];
    snd('rustle');
    animate(item.id, 0.8,
      (t) => {
        const w = wave(t, 9, 4.5);
        mesh.scale.set(1 + 0.09 * w, 1 - 0.07 * w, 1 - 0.09 * w);
        mesh.rotation.z = 0.05 * wave(t + 0.05, 8, 4.5);
        mesh.rotation.x = 0.05 * wave(t, 7, 4.5);
      },
      () => { mesh.scale.set(1, 1, 1); mesh.rotation.set(0, 0, 0); });
    const c = { x: g.position.x, y: g.position.y + 0.9 * g.scale.y, z: g.position.z };
    particles.burst('leaf', c, { count: 9, radius: 0.9 * g.scale.x, speed: 0.9, ring: true, height: 0.3 });
    if (Math.random() < 0.22) {
      particles.burst('petal', c, { count: 4, radius: 0.5, color: '#ff4d6d', speed: 0.8, size: 0.7 });
      hud.toast('Found a berry!', { icon: 'berry' });
    }
  }

  function readSign(item) {
    const g = item.object;
    animate(item.id, 0.6,
      (t) => { g.rotation.z = 0.05 * wave(t, 5, 5); },
      () => { g.rotation.z = 0; });
    snd('pop', { pitch: 0.85 });
    dialog.open({ name: 'Signpost', pages: SIGN_PAGES });
  }

  const handlers = { tree: shakeTree, palm: shakeTree, flower: boingFlower, rock: clinkRock, bush: rustleBush, sign: readSign };
  for (const it of getInteractables()) {
    const h = handlers[it.type];
    if (h) it.onInteract = (item) => h(item);
  }

  // ------------------------------------------------------------------ public API
  return {
    fruits,

    /** Trigger an interactable (respects cooldowns). Returns true if it fired. */
    interact(item) {
      if (!item || !item.onInteract) return false;
      if (time - lastAny < GLOBAL_COOLDOWN) return false;
      if (item._cooldownUntil && time < item._cooldownUntil) return false;
      lastAny = time;
      item._cooldownUntil = time + (item.type === 'sign' ? 0.25 : ITEM_COOLDOWN);
      player.faceToward(item.position.x, item.position.z);
      item.onInteract(item);
      return true;
    },

    /** Cancel with nothing open: little hop emote with a puff at the feet. */
    cancel() {
      const started = player.hop();
      if (started) {
        snd('bip');
        particles.burst('puff', { x: player.position.x, y: player.position.y + 0.1, z: player.position.z }, { count: 4, radius: 0.35 });
      }
      return started;
    },

    update(dt) {
      time += dt;
      for (const [key, a] of anims) {
        a.t += dt;
        if (a.t >= a.dur) { a.end(); anims.delete(key); }
        else a.tick(a.t);
      }
      for (let i = timers.length - 1; i >= 0; i--) {
        if (time >= timers[i].at) { const fn = timers[i].fn; timers.splice(i, 1); fn(); }
      }
      updateFruits(dt);
    },
  };
}
