// What happens when you press Interact on something: tree / palm shake (+ leaves, petals, fruit), flower boing,
// rock clink, bush rustle, signpost dialog (the hat rack, world/hatRack.js, installs its own onInteract) (the campfire menu installs its own onInteract: world/campfire.js). Also the Cancel emote (hop + puff) and a tiny
// time-driven animation runner, so everything advances with `update(dt)` (deterministic under __game.step).
//
//   const fx = createInteractions({ scene, players, hud, dialog, particles, sfx, pickups, sync });   // installs item.onInteract for all interactables
//       (pickups: the fruit a shaken tree / palm drops becomes a walk-over pickup; berries / herbs / mushrooms / dig spots live in gathering.js)
//   fx.interact(item, by)  // by = the Player who pressed Interact: cooldown + turn that player + run item.onInteract(item, by); true if it fired
//   fx.cancel(by)          // that player's hop emote (+ puff); returns true if the hop started
// Cooldowns: per target (a tree that was just shaken ignores everybody for a moment) and per player (the global one).
//   fx.update(dt)
//
// World sync (Step 22b, domain 'interactions'; ids = the interactable id, identical on every screen because props are built identically).
//   Tree / palm shake is AUTHORITATIVE because of the fruit: the pressing screen sends request shake {id}; the HOST validates (target standing,
//     a remote actor within reach, a per-target cooldown), rolls the fruit chance (+ the landing spot, in pickups.spawnTo: the host's own
//     randomness) and broadcasts the event shake {id, wx, wz} (wx, wz = unit direction from the shaking actor to the tree: which way the canopy
//     sways). Every screen then plays the same sway + leaves; only the host spawns the fruit (pickups 'spawn' events). A replica does not animate
//     optimistically: the event comes back within a few tens of ms.
//   Flower boing / rock clink / bush rustle are purely cosmetic: the pressing screen plays them at once and tells the host (request fx
//     {id, wx, wz}); the host plays them itself if it was another screen and re-broadcasts event fx {id, wx, wz, actor} so every OTHER screen
//     plays them too (the "clink!" toast stays on the pressing screen). No state, no snapshot.
import * as THREE from 'three';
import { getHeight, isWalkable } from './terrain.js';
import { getInteractables } from './interactables.js';

const TAU = Math.PI * 2;
const ITEM_COOLDOWN = 0.45;      // s, per object (spamming is fine, it just doesn't restart mid-wobble)
const GLOBAL_COOLDOWN = 0.12;    // s, between any two interactions
const FRUIT_CHANCE = 0.5;       // chance that one shake drops a fruit

const rnd = (a, b) => a + Math.random() * (b - a);
/** Damped sinusoid: starts at 0, swings, dies out. */
const wave = (t, freq, decay) => Math.exp(-decay * t) * Math.sin(TAU * freq * t);

const SIGN_PAGES = [
  'Welcome to Infinite Island! Take your time, wander around and poke at everything.',
  'Move with WASD or the arrow keys. Press E (or Space) to interact, and Q to hop!',
  'Got a gamepad? Plug it in: stick to move, A to interact, B to hop.',
  'Psst! I spotted some tools lying around the island: an axe, a sword, a hammer... and even glowing lightsabers! Pick one up, then press E with nothing nearby to swing it.',
  'Want to play on your phone? Use Connect a phone in the top-right options (or press P) to connect it as a controller.',
  'Gathering time! Logs from felled trees, apples, peaches and coconuts from shaken ones, berries from bushes, herbs and mushrooms to pick, and potatoes to dig up with the shovel. Walk over things to collect them: everything goes into one shared bag (bottom-left).',
  'Psst! A campfire waits just east of here (to the right): feed it logs to light it, cook tasty dishes, and ask it for a quest: gather a feast, bring it back and we all celebrate together!',
  'Every feast we finish earns a brand new hat, up to ten! They hang on a hat rack at the back of the campfire circle. Walk up and press E to try the next one on.',
  'Rocks are good for more than looking at! Break one with a hammer (or an axe) and it drops stone. After your first feast, two builders turn up at the old bridges, and they love building materials: stone for the mole, logs for the beaver.',
  'Look north and east, past the water: there are two big islands out there! The old bridges washed out in a storm long ago... only broken posts and a snapped rope are left. Maybe somebody will come along who can fix them.',
  'Friends can join! Press any button on a gamepad or connect a phone with the phone button. Up to 4 islanders can explore together, so stay close! M mutes the sounds. Have fun!',
];

const SHAKE_RANGE = 2.2 + 2.5;    // the host accepts a REMOTE shake from this far from the trunk's surface (prompt range + latency slack)

export function createInteractions({ scene, players, hud, dialog, particles, sfx = null, pickups = null, sync }) {
  const snd = (name, opts) => { if (sfx) sfx.play(name, opts); };
  let time = 0;
  const lastAny = new Map();    // Player -> time of its last interaction (the global cooldown is per player)
  const anims = new Map();      // key -> { t, dur, tick(t), end() }
  const timers = [];            // { at, fn }

  // ------------------------------------------------------------------ helpers
  function animate(key, dur, tick, end) {
    const old = anims.get(key);
    if (old) old.end();
    anims.set(key, { t: 0, dur, tick, end });
  }
  const later = (delay, fn) => timers.push({ at: time + delay, fn });

  const r3 = (v) => Math.round(v * 1000) / 1000;
  /** Unit direction (world XZ) from `pos` ({x, z}) to `obj`, also expressed in the local frame of `obj` (which only has yaw). */
  function pushDirFrom(obj, pos) {
    let dx = obj.position.x - pos.x, dz = obj.position.z - pos.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    return pushDirOf(obj, dx, dz);
  }
  function pushDirOf(obj, dx, dz) {
    const c = Math.cos(obj.rotation.y), s = Math.sin(obj.rotation.y);
    return { lx: dx * c - dz * s, lz: dx * s + dz * c, wx: dx, wz: dz };
  }
  const localPlayerOf = (actor) => (actor && actor.screen === sync.screenId ? players.get(actor.index) : null);

  // ------------------------------------------------------------------ fruit
  // Shaking a tree / palm sometimes drops a fruit: a walk-over pickup (world/pickups.js), which flies to whoever walks up to it.
  /** A landing spot a little way from the trunk, preferring the side of the actor who shook it (`pos`), on walkable ground. */
  function fruitLanding(from, pos) {
    const toPlayer = Math.atan2(pos.z - from.z, pos.x - from.x);
    for (let i = 0; i < 10; i++) {
      const a = toPlayer + rnd(-1.3, 1.3);
      const d = rnd(1.3, 2.4);
      const x = from.x + Math.cos(a) * d, z = from.z + Math.sin(a) * d;
      if (isWalkable(x, z) && getHeight(x, z) > 0.2) return { x, z };
    }
    return { x: from.x, z: from.z };
  }

  // ------------------------------------------------------------------ per-type effects
  /** onInteract of a tree / palm: ask the authority (host: decided right here; replica: the `shake` event plays it). */
  function shakeTree(item, by) {
    sync.request('interactions', 'shake', { id: item.id }, sync.actorFor(by || players.p1));
  }

  /** HOST: validate a shake, roll the fruit, play it here and broadcast it. */
  function handleShake(d, actor) {
    const item = byId.get(d.id);
    if (!item || (item.type !== 'tree' && item.type !== 'palm') || !getInteractables().includes(item)) return { reject: 'gone' };
    if (!actor) return { reject: 'bad-request' };
    if (actor.screen !== 'host') {                                   // (host players passed interact()'s cooldowns and the interactable range already)
      if (Math.hypot(actor.pos.x - item.position.x, actor.pos.z - item.position.z) - item.radius > SHAKE_RANGE) return { reject: 'far' };
      if (item._cooldownUntil && time < item._cooldownUntil) return { reject: 'cooldown' };
      item._cooldownUntil = time + ITEM_COOLDOWN;
    }
    const { wx, wz } = pushDirFrom(item.object, actor.pos);
    const fruit = Math.random() < FRUIT_CHANCE ? { a: rnd(0, TAU), pos: { x: actor.pos.x, z: actor.pos.z } } : null;
    playShake(item, wx, wz, fruit);
    sync.emit('interactions', 'shake', { id: item.id, wx: r3(wx), wz: r3(wz) });
    return true;
  }

  /** Every screen (host included): the canopy sways away from (wx, wz) and leaves fall. `fruit` (host only) = the rolled fruit drop. */
  function playShake(item, wx, wz, fruit = null) {
    const g = item.object;
    const mesh = g.userData.canopy;
    const palm = item.type === 'palm';
    snd('leaves');
    const { lx, lz } = pushDirOf(g, wx, wz);
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

    if (fruit && pickups && sync.isHost) {
      const kind = palm ? 'coconut' : (cherry ? 'peach' : 'apple');
      const from = { x: crown.x + Math.cos(fruit.a) * radius * 0.5, y: crown.y - 0.2, z: crown.z + Math.sin(fruit.a) * radius * 0.5 };
      later(0.15, () => pickups.spawnTo(kind, from, fruitLanding(from, fruit.pos)));
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

  function clinkRock(item, wx, wz, mine) {
    const g = item.object;
    const mesh = g.children[0];
    const { lx, lz } = pushDirOf(g, wx, wz);
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
    if (mine) hud.toast('clink!', { icon: 'sparkle' });
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
  }

  function readSign(item, by) {
    const g = item.object;
    animate(item.id, 0.6,
      (t) => { g.rotation.z = 0.05 * wave(t, 5, 5); },
      () => { g.rotation.z = 0; });
    snd('pop', { pitch: 0.85 });
    const owner = by || players.p1;
    dialog.open({
      name: 'Signpost', pages: SIGN_PAGES, owner,                     // only that player is frozen and drives the dialog
      tag: players.multi ? owner.colors.name : '', color: owner.colors.ui,
    });
  }

  // ------------------------------------------------------------------ cosmetic effects shared with the other screens
  const byId = new Map();                                              // interactable id -> interactable (props: identical on every screen)
  for (const it of getInteractables()) byId.set(it.id, it);
  const fxPlayers = {                                                   // (item, wx, wz, mine)
    flower: (item) => boingFlower(item),
    rock: clinkRock,
    bush: (item) => rustleBush(item),
  };
  /** The pressing screen plays a cosmetic effect at once, then tells the host so the other screens can play it too. */
  function cosmetic(item, by) {
    const p = by || players.p1;
    const at = item.object || { position: item.position, rotation: { y: 0 } };   // (flowers have no object)
    const { wx, wz } = pushDirFrom(at, p.position);
    fxPlayers[item.type](item, wx, wz, true);
    if (!sync.isHost || sync.hasReplicas) sync.request('interactions', 'fx', { id: item.id, wx: r3(wx), wz: r3(wz) }, sync.actorFor(p));
  }

  const handlers = { tree: shakeTree, palm: shakeTree, flower: cosmetic, rock: cosmetic, bush: cosmetic, sign: readSign };
  for (const it of getInteractables()) {
    const h = handlers[it.type];
    if (h) it.onInteract = (item, by) => h(item, by);
  }

  sync.register('interactions', {
    applyEvent(kind, d) {
      if (kind === 'shake') {
        const item = byId.get(d.id);
        if (item && getInteractables().includes(item)) playShake(item, d.wx, d.wz);
      } else if (kind === 'fx') {
        const item = byId.get(d.id);
        if (item && fxPlayers[item.type] && !localPlayerOf(d.actor)) fxPlayers[item.type](item, d.wx, d.wz, false);
      }
    },
    handleRequest(kind, d, actor) {
      if (kind === 'shake') return handleShake(d, actor);
      if (kind === 'fx') {
        const item = byId.get(d.id);
        if (!item || !fxPlayers[item.type] || !actor) return { reject: 'bad-request' };
        const who = { screen: actor.screen, index: actor.index };
        if (!localPlayerOf(who)) fxPlayers[item.type](item, Number(d.wx) || 0, Number(d.wz) || 0, false);   // another screen pressed it: play it here too
        sync.emit('interactions', 'fx', { id: item.id, wx: d.wx, wz: d.wz, actor: who });
        return true;
      }
      return { reject: 'unknown-kind' };
    },
  });

  // ------------------------------------------------------------------ public API
  return {
    /** Cancel a running shake / clink animation of an interactable (harvest.js takes over the object). */
    stopAnim(item) {
      const a = item && anims.get(item.id);
      if (a) { a.end(); anims.delete(item.id); }
    },

    /** Player `by` triggers an interactable (respects cooldowns). Returns true if it fired. */
    interact(item, by = players.p1) {
      if (!item || !item.onInteract || !by) return false;
      if ((item.type === 'sign' || item.type === 'campfire' || item.type === 'npc') && dialog.isOpen) return false;   // one dialog at a time: the sign / campfire menu is busy
      if (time - (lastAny.get(by) ?? -10) < GLOBAL_COOLDOWN) return false;
      if (item._cooldownUntil && time < item._cooldownUntil) return false;
      lastAny.set(by, time);
      item._cooldownUntil = item.type === 'hatrack' ? 0 : time + (item.type === 'sign' ? 0.25 : ITEM_COOLDOWN);   // the rack keeps its own per-player cooldown (two players may try hats together)
      by.faceToward(item.position.x, item.position.z);
      item.onInteract(item, by);
      return true;
    },

    /** Cancel with nothing open: that player does a little hop emote with a puff at its feet. */
    cancel(player = players.p1) {
      if (!player) return false;
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
    },
  };
}
