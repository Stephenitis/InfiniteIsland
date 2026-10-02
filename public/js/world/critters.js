// Frostpine's hungry critters (PLAN Step 34): eight animals (fox, squirrel, rabbit, grouse; two of each) that wait in the wild for food (34a), get fed, and move into the
// Frostpine camp (34b: the host-authoritative `critters` sync domain, the feeding beat, life at the camp, sleeping by the fire at night).
//
//   const critters = createCritters({ scene, players, world, thoughts, particles, sfx, sync, inventory, hud, floatLabel, isOpen })    once at load, on every screen
//                                         (the plan is pure and seeded: ids and spawn points match everywhere). sync / inventory / hud / floatLabel / isOpen are optional (without
//                                         `sync` the critters stay wild decoration); isOpen() = the Frostpine bridge is built (the quest line's gate)
//   critters.update(dt, nightness)       once per tick (after players.update): animation, roaming, the hint, bubbles' anchors, night sleep
//   critters.list / critters.get(id)     the eight critters
//   critters.summary()                   debug snapshot
//   critters.setInteractHandler(fn)      fn(critter, player) runs instead of the default "thought bubble" when a player interacts; return true when handled (34b installs its own: Feed / Pet)
//   critters.state / critters.count      { id: { at: 'wild' | 'camp' } } and how many live at the camp;  critters.feed(player, id) -> the request (host: result now, replica: Promise)
//   critters.debug.{ feed(id, {force}), reset() }
//
//   critter.id / species / food          'critter-fox-0' ..., 'fox' | 'squirrel' | 'rabbit' | 'grouse', the catalog item it wants (config CRITTERS.food)
//   critter.home                         'wild' | 'camp'   (the VISUAL place; the synced truth is critters.state)
//   critter.spawn / critter.den          { x, z, y } wild spawn point, { x, z, r } its own reserved den spot at the camp
//   critter.position                     Vector3: its feet. The SAME object is the interactable's position, so the prompt follows it
//   critter.setHome('wild' | 'camp', { animate })   move it to its spawn / den (animate = a poof at both ends and a pop-in); the roam centre follows
//   critter.play('hop' | 'look' | 'twitch' | 'happy' | 'eat')   a one-shot animation (happy = spin + two hops, eat = three nibbles)
//   critter.bubble(itemId = its food)    a thought bubble with the item's icon above it (ui/thoughtBubble.js)
//   critter.interactable / critter.collider / critter.group / critter.model (the model is built lazily the first time Frostpine is drawn)
//
// Gameplay data vs visuals: the plan (islands/critterPlan.js), the collider and the interactable (type 'critter', prompt "Hungry...") exist from load, like every other
// Frostpine prop, so nothing is lost or duplicated by `world.rebuild('frost')`. The MODEL is a scene-level group (like the builders) shown only while Frostpine is in full
// detail (the same flag as its `full` group) and not animated while hidden. The model is built on first sight, so startup does not pay for eight critters.
// Wandering is purely cosmetic and local to each screen (never synced): only where each critter lives is shared. A roaming critter keeps a collider circle that moves with
// it (colliders.js moveCollider re-files it in the spatial hash) and is an always-scanned interactable (interactables.js DYNAMIC_TYPES), so the prompt follows it too.
//
// Domain 'critters' (host-authoritative). State { [id]: { at: 'wild' | 'camp' } }, saved by the HOST under 'infinite-island.frostpine.v1' (game/critterState.js; the file is shared
// with Steps 35 / 36, whose keys are carried through untouched). ?newgame wipes it; replicas never save.
//   Request feed {id}   (any screen): the HOST checks the gate (Frostpine bridge built), that the critter is still wild, that the shared bag holds its food and (remote actors) that the
//                       actor is near it, then removes ONE food, moves it to `camp`, saves and emits `fed` { id, food, count, actor }. Rejects: locked | gone | none | far | bad-request.
//                       The host serialises requests, so two screens racing for one critter with one food: exactly one wins, the other gets `gone` / `none`, the bag never goes negative.
//   Event fed           every screen (host included): the beat (eat + nom bubble + hearts -> happy spin -> scamper towards the camp -> poof -> pops up at its den) and a toast; the
//                       feeding player's screen also floats "-1 <food>". A replica waits for the event: no optimistic animation.
//   Event reset         debug: everybody back to the wild, silently.   Snapshot = the state; applySnapshot places critters silently (a late joiner / reload sees residents at the camp, no fanfare).
//   hashView = the state.  Petting a camp critter ("Pet") is cosmetic and local to the screen of whoever does it (hearts + a happy hop); it is not synced.
// At the camp a critter idles at its den, wanders a little inside the clearing (never onto the fire ring, the stump seats or a reserved build spot), turns to nearby players and at
// night (clock nightness, with hysteresis) curls up asleep on a ring close to the fire (lowered, eyes closed, slow breathing, a small "z" bubble).
import * as THREE from 'three';
import { ISLANDS, CRITTERS, FIRES, FROST_CAMP } from '../config.js';
import { getIslandModule } from './islands/registry.js';
import { planCritters } from './islands/critterPlan.js';
import { addCollider, moveCollider } from './colliders.js';
import { addInteractable } from './interactables.js';
import { getHeight, isWalkable } from './terrain.js';
import { createCritterModel } from '../npc/critters.js';
import { getItem, itemName } from '../game/catalog.js';
import { turnToward, pickFaceTarget } from '../game/npcLogic.js';
import { createHint, pickNextStop, hopsFor, arc } from '../game/critterLogic.js';
import { campReserved } from './islands/frostCamp.js';
import { NEW_GAME, loadSave, writeSave, clearSave } from '../game/save.js';
import { STORAGE_KEY, freshState, validateFeed, campCount, normaliseState, readSave, buildSave, hashView } from '../game/critterState.js';
import { ICONS, svg, OUTLINE } from '../ui/icons.js';
import { mulberry32 } from '../utils/rng.js';

const ANIMS = ['hop', 'look', 'twitch', 'happy', 'eat'];
// Per species: hop height, seconds per hop, metres per hop, tail wag speed / sway.
const FEEL = {
  fox: { hop: 0.1, dur: 0.3, step: 0.8, wag: [1.7, 0.18], turn: 8 },
  squirrel: { hop: 0.2, dur: 0.34, step: 0.7, wag: [2.2, 0.1], turn: 9 },
  rabbit: { hop: 0.24, dur: 0.38, step: 0.85, wag: [0, 0], turn: 8 },
  grouse: { hop: 0.12, dur: 0.3, step: 0.5, wag: [1.4, 0.06], turn: 8 },
};
const POP_TIME = 0.7;
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

const ZZZ_SVG = svg(`<path d="M4 5h7l-7 8h7M13 12h5l-5 6h5" fill="none" stroke="${OUTLINE}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`);
const REMOTE_RANGE = 12;                 // the host accepts a REMOTE feed from this far from the critter's spawn (talk range + roam + latency slack) ...
const SLEEP_R = 4.1;                     // ... a camp critter sleeps on this ring round the fire (the stump seats sit at 2.5)
const NIGHT_ON = 0.6, NIGHT_OFF = 0.35;  // clock nightness thresholds (hysteresis): curl up above, wake below
const BEAT = { eat: 0.0, hearts: 0.9, happy: 1.8, scamper: 2.9, scamperDist: 3.6, settle: 0.2 };   // the feeding beat, seconds after the event

export function createCritters({ scene, players, world, thoughts = null, particles = null, sfx = null, sync = null, inventory = null, hud = null, floatLabel = null, isOpen = () => true }) {
  const island = ISLANDS.find((i) => i.id === 'frost');
  const plan = planCritters(island, getIslandModule('frost'));
  const snd = (name, opts) => { if (sfx) sfx.play(name, opts); };
  let time = 0;
  let night = false;                                   // hysteresis'd from the clock's nightness (update)
  const fire = FIRES.find((f) => f.id === 'frost');
  // The camp clearing, for the wander points: an annulus round the fire clear of the stump seats and every reserved build spot (Steps 35 / 36 build there later)
  const campSolids = [
    ...FROST_CAMP.stumps.angles.map((a) => ({ x: fire.x + Math.cos(a) * FROST_CAMP.stumps.ring, z: fire.z + Math.sin(a) * FROST_CAMP.stumps.ring, r: 0.7 })),
    ...Object.values(campReserved(island).build).flat(), campReserved(island).tailStump,
  ];
  const campOk = (x, z) => {
    const d = Math.hypot(x - fire.x, z - fire.z);
    if (d < 4.1 || d > 9.9 || !isWalkable(x, z)) return false;
    return campSolids.every((o) => Math.hypot(x - o.x, z - o.z) >= o.r + 0.9);
  };
  let interactHandler = null;
  const byId = new Map();
  const list = [];
  const poof = (x, y, z) => { if (particles) particles.burst('puff', { x, y: y + 0.2, z }, { count: 8, radius: 0.5, ring: true, height: 0.2, speed: 0.9 }); };

  function makeCritter(p, index) {
    const feel = FEEL[p.species];
    const scale = CRITTERS.scale[p.species] || 1;
    const rng = mulberry32(island.seed + 8800 + index * 31);
    const stopsWild = [p.spawn, ...p.wander];
    const c = {
      id: p.id, species: p.species, food: p.food, home: 'wild', index: p.index, zone: p.zone,
      spawn: { ...p.spawn }, den: { ...p.den }, plan: p,
      position: new THREE.Vector3(p.spawn.x, p.spawn.y, p.spawn.z),
      group: null, model: null, collider: null, interactable: null,
    };
    // camp roam: the den plus a few clear spots round it (one nearer the fire); a camp critter sleeps on the ring SLEEP_R round the fire, on its den's side
    const denA = Math.atan2(p.den.z - fire.z, p.den.x - fire.x);
    const sleepSpot = { x: fire.x + Math.cos(denA) * SLEEP_R, z: fire.z + Math.sin(denA) * SLEEP_R };
    const stopsCamp = [{ x: p.den.x, z: p.den.z }];
    for (let k = 0; k < 6 && stopsCamp.length < 4; k++) {
      const a = k * 1.05 + index, q = { x: p.den.x + Math.cos(a) * 1.5, z: p.den.z + Math.sin(a) * 1.5 };
      if (campOk(q.x, q.z)) stopsCamp.push(q);
    }
    const nearFire = { x: fire.x + Math.cos(denA) * 5.6, z: fire.z + Math.sin(denA) * 5.6 };
    if (campOk(nearFire.x, nearFire.z)) stopsCamp.push(nearFire);
    let stops = stopsWild, stopIdx = 0;
    let yaw = (index * 2.1) % (Math.PI * 2), idleYaw = yaw;
    let mode = 'idle';                                   // 'idle' | 'move' | 'hop' | 'happy' | 'eat' | 'look' | 'twitch'
    let idleT = 1.5 + rng() * 3;
    let move = null;                                     // { from, to, n, i, t }
    let anim = null;                                     // { kind, t, dur, spin }
    let wave = 0, wLook = 0;
    let blinkT = 1.5 + rng() * 2, blinkPhase = -1;
    let popT = -1;
    let sleepAmt = 0, zT = 2.5, petT = -1;
    let busy = false;                                    // the feeding beat is running: no roaming, not interactable
    let pending = 0;                                     // a feed request is on its way (a replica waits for the host)
    let regT = 0;                                        // time since the collider was last re-filed
    const hint = createHint({ near: CRITTERS.hint, reset: CRITTERS.hintReset, cooldown: CRITTERS.hintCooldown });
    const phase = rng() * 6;

    c.collider = addCollider({ x: c.position.x, z: c.position.z, r: p.radius, owner: c });
    c.interactable = addInteractable({
      type: 'critter', object: null, position: c.position, radius: p.radius + 0.35, prompt: 'Hungry...',
      onInteract: (item, by) => interact(by),
    });
    c.interactable.promptY = 1.0 * scale + 0.2;
    const feedable = () => !!inventory && c.home === 'wild' && inventory.count(c.food) >= 1 && isOpen();
    const sleepNow = () => { c.position.x = sleepSpot.x; c.position.z = sleepSpot.z; setGround(); refile(); move = null; anim = null; mode = 'sleep'; idleYaw = yaw = denA + Math.PI / 2; sleepAmt = 1; };

    const ensureModel = () => {
      if (c.model) return;
      c.model = createCritterModel(p.species);
      c.group = new THREE.Group();
      c.group.name = c.id;
      c.group.add(c.model.root);
      c.model.root.scale.setScalar(scale);
      scene.add(c.group);
      c.interactable.promptY = c.model.height * scale + 0.1;
    };

    const nearestLocal = () => {                         // distance + position of the closest local player
      let best = null, bd = Infinity;
      for (const pl of players.list) {
        if (pl.away) continue;
        const d = Math.hypot(pl.position.x - c.position.x, pl.position.z - c.position.z);
        if (d < bd) { bd = d; best = pl.position; }
      }
      return { d: bd, at: best };
    };

    function setGround() { c.position.y = getHeight(c.position.x, c.position.z); }
    function refile() { if (Math.hypot(c.collider.x - c.position.x, c.collider.z - c.position.z) > 0.04) moveCollider(c.collider, c.position.x, c.position.z); }

    function bubble(itemId = c.food) {
      const def = getItem(itemId);
      if (!thoughts || !def) return;
      thoughts.show(c.id, () => ({ x: c.position.x, y: c.position.y + (c.model ? c.model.height * scale : 1), z: c.position.z }), def.icon, { seconds: CRITTERS.hintTime, lift: 0.85 });         // (above the "Hungry..." prompt, which hangs just over the head)
    }
    function play(kind) {
      if (!ANIMS.includes(kind)) return false;
      if (move) { move = null; }
      const dur = { hop: feel.dur + 0.1, look: 2.6, twitch: 0.45, happy: 1.0, eat: 1.7 }[kind];
      anim = { kind, t: 0, dur };
      mode = kind === 'hop' || kind === 'happy' || kind === 'eat' || kind === 'look' || kind === 'twitch' ? kind : 'idle';
      if (kind === 'happy') snd('chime', { pitch: 1.3, vol: 0.5 });
      return true;
    }
    function interact(by) {
      if (busy) return true;
      if (interactHandler && interactHandler(c, by)) return true;
      bubble();
      snd('pop', { pitch: 1.2, vol: 0.6 });
      if (mode === 'idle' || mode === 'move') play('hop');
      return true;
    }

    function setHome(where, { animate = false } = {}) {
      const toCamp = where === 'camp';
      const dest = toCamp ? c.den : c.spawn;
      if (animate) poof(c.position.x, c.position.y, c.position.z);
      c.home = toCamp ? 'camp' : 'wild';
      stops = toCamp ? stopsCamp : stopsWild;
      stopIdx = 0; move = null; anim = null; mode = 'idle'; idleT = 1; sleepAmt = 0;
      c.position.x = dest.x; c.position.z = dest.z;
      setGround();
      refile();
      if (animate) { poof(c.position.x, c.position.y, c.position.z); popT = 0; snd('cooked', { pitch: 1.1, vol: 0.6 }); }
      else if (toCamp && night) sleepNow();                          // a load / late join at night: already curled up
      return c;
    }

    /** The scamper of the feeding beat: a few hops toward the camp (as far as the ground is walkable). Returns how long it takes (s). */
    function scamper(dist = BEAT.scamperDist) {
      const dx = fire.x - c.position.x, dz = fire.z - c.position.z, L = Math.hypot(dx, dz) || 1;
      let to = null;
      for (let d = dist; d >= 1; d -= 0.8) {
        const x = c.position.x + dx / L * d, z = c.position.z + dz / L * d;
        if (isWalkable(x, z)) { to = { x, z }; break; }
      }
      if (!to) return 0;
      const from = { x: c.position.x, z: c.position.z };
      anim = null;
      move = { from, to, n: hopsFor(Math.hypot(to.x - from.x, to.z - from.z), feel.step * 1.5), i: 0, t: -0.05, heading: Math.atan2(to.x - from.x, to.z - from.z) };
      mode = 'move';
      return move.n * feel.dur + 0.4;
    }
    /** Per-screen cosmetic petting: a heart and a happy hop (a sleeper only nuzzles and stays asleep). */
    function pet() {
      const top = c.position.y + (c.model ? c.model.height * scale : 1);
      if (particles) particles.burst('heart', { x: c.position.x, y: top, z: c.position.z }, { count: 3, radius: 0.3, height: 0.35 });
      snd('chime', { pitch: 1.5, vol: 0.5 });
      if (mode === 'sleep') petT = 0; else if (mode === 'idle' || mode === 'move' || mode === 'look' || mode === 'twitch') play('happy');
    }

    // ---------------------------------------------------------------- per frame
    function update(dt, visible) {
      c.interactable.prompt = busy ? 'Nom nom!' : c.home === 'camp' ? 'Pet' : (feedable() ? 'Feed' : 'Hungry...');
      if (!visible) { if (c.group) c.group.visible = false; return; }
      ensureModel();
      c.group.visible = true;
      const m = c.model;

      // hint: a player came close -> hop + a thought bubble with the food
      const near = nearestLocal();
      if (c.home === 'wild' && hint.check(near.d, time) && (mode === 'idle' || mode === 'move')) { bubble(); play('hop'); snd('pop', { pitch: 1.4, vol: 0.4 }); }

      // night at the camp: walk to the sleeping ring and curl up; wake at dawn
      if (c.home === 'camp' && !busy) {
        if (night && mode === 'idle') {
          const to = sleepSpot, from = { x: c.position.x, z: c.position.z }, dd = Math.hypot(to.x - from.x, to.z - from.z);
          if (dd > 0.25) { move = { from, to, n: hopsFor(dd, feel.step), i: 0, t: -0.18, heading: Math.atan2(to.x - from.x, to.z - from.z), sleep: true }; mode = 'move'; }
          else mode = 'sleep';
        } else if (!night && mode === 'sleep') { mode = 'idle'; idleT = 0.6; play('twitch'); }
      }

      // idle behaviours
      if (mode === 'idle' && !busy) {
        idleT -= dt;
        if (idleT <= 0) {
          const r = rng();
          if (r < (c.home === 'wild' ? 0.55 : 0.4) && stops.length > 1) {
            const next = pickNextStop(stops.length, stopIdx, rng), to = stops[next];
            const blocked = players.list.some((pl) => !pl.away && Math.hypot(pl.position.x - to.x, pl.position.z - to.z) < 1.3);
            if (!blocked) {
              const from = { x: c.position.x, z: c.position.z };
              move = { from, to, n: hopsFor(Math.hypot(to.x - from.x, to.z - from.z), feel.step), i: 0, t: -0.18, heading: Math.atan2(to.x - from.x, to.z - from.z) };
              stopIdx = next; mode = 'move';
            } else idleT = 1.2;
          } else if (r < 0.8) play('look');
          else play('twitch');
          if (mode === 'idle') idleT = 2 + rng() * 3.5;
        }
      }

      // movement: little hops along the straight line to the next roam stop
      let hopY = 0, squash = 0;
      let heading = null;
      if (mode === 'move' && move) {
        heading = move.heading;
        if (Math.abs(((heading - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 0.35 && move.t < 0) { move.t += dt; }   // turn on the spot first
        else {
          if (move.t < 0) move.t = 0;
          move.t += dt;
          while (move.t >= feel.dur && move.i < move.n) { move.t -= feel.dur; move.i++; }
          const k = move.i >= move.n ? 1 : (move.i + Math.min(1, move.t / feel.dur)) / move.n;
          c.position.x = move.from.x + (move.to.x - move.from.x) * k;
          c.position.z = move.from.z + (move.to.z - move.from.z) * k;
          if (move.i >= move.n) { const toSleep = move.sleep; move = null; mode = toSleep && night && c.home === 'camp' ? 'sleep' : 'idle'; idleT = 1.5 + rng() * 3; idleYaw = yaw; }
          else { const u = move.t / feel.dur; hopY = arc(Math.min(1, u)) * feel.hop; squash = u > 0.85 ? (u - 0.85) / 0.15 : 0; }
          setGround();
        }
      }

      // one-shot animations
      let spin = 0, nib = 0, lookAmt = 0, twitch = 0;
      if (anim) {
        anim.t += dt;
        const u = Math.min(1, anim.t / anim.dur);
        if (anim.kind === 'hop') hopY = arc(u) * feel.hop * 1.7;
        else if (anim.kind === 'happy') { spin = u * u * (3 - 2 * u) * Math.PI * 2; hopY = Math.abs(Math.sin(u * Math.PI * 2)) * feel.hop * 2.3; }
        else if (anim.kind === 'eat') nib = Math.max(0, Math.sin(u * Math.PI * 6)) * Math.min(1, (1 - u) * 6);
        else if (anim.kind === 'look') lookAmt = Math.sin(u * Math.PI * 3) * Math.sin(u * Math.PI);
        else if (anim.kind === 'twitch') twitch = Math.sin(u * Math.PI * 8) * (1 - u);
        if (anim.t >= anim.dur) { if (anim.kind === 'happy') idleYaw = yaw; anim = null; mode = 'idle'; idleT = 1.5 + rng() * 3.5; }
      }
      refile();

      // facing: the nearest local player when close (and idle), the roam heading while moving, else drift back to the idle yaw
      let goal = idleYaw;
      if (heading !== null) goal = heading;
      else if (near.at && near.d <= (c.home === 'camp' ? 6 : CRITTERS.hint + 1) && mode !== 'move' && mode !== 'sleep') goal = Math.atan2(near.at.x - c.position.x, near.at.z - c.position.z);
      yaw = turnToward(yaw, goal, dt, feel.turn);
      c.group.position.copy(c.position);
      c.group.rotation.y = yaw + spin;

      // pop-in after setHome(animate)
      let pop = 1;
      if (popT >= 0) { popT += dt; if (popT >= POP_TIME) popT = -1; else { const t = popT; const ky = 1 - Math.exp(-5 * t) * Math.cos(16 * t); pop = Math.max(0.001, ky); } }

      // body: breathing, squash, hop; asleep = lowered and wide, slow deep breaths
      sleepAmt = damp(sleepAmt, mode === 'sleep' ? 1 : 0, 3, dt);
      if (sleepAmt < 0.002) sleepAmt = 0;
      const s = time + phase;
      const br = Math.sin(s * (2.4 - 1.5 * sleepAmt)) * (1 + 2.2 * sleepAmt);
      const sq = squash * 0.12 - (hopY > 0 ? 0.05 : 0) - nib * 0.04;
      m.rig.position.y = hopY;
      m.rig.scale.set((1 - 0.008 * br - sq * 0.5 + 0.1 * sleepAmt) * (1 + (1 - pop) * 0.3), (1 + 0.016 * br + sq - 0.24 * sleepAmt) * pop, (1 - 0.008 * br - sq * 0.5 + 0.1 * sleepAmt) * (1 + (1 - pop) * 0.3));
      // head: gentle sway, a look-around sweep, the "ear flick" twitch, nibble nods
      wLook = damp(wLook, lookAmt, 12, dt);
      m.headGroup.rotation.y = 0.8 * wLook + 0.05 * Math.sin(s * 0.7);
      m.headGroup.rotation.z = 0.04 * Math.sin(s * 0.9) + 0.14 * twitch;
      if (petT >= 0) { petT += dt; if (petT > 0.9) petT = -1; }
      const nuzzle = petT >= 0 ? Math.sin(petT * 14) * (1 - petT / 0.9) : 0;               // a pet while asleep: a sleepy head wiggle
      m.headGroup.rotation.z += 0.18 * nuzzle;
      m.headGroup.rotation.x = 0.03 * Math.sin(s * 1.3) + 0.5 * nib - (hopY > 0.02 ? 0.12 : 0) + 0.62 * sleepAmt;
      if (sleepAmt > 0.01) m.headGroup.rotation.y *= 1 - sleepAmt;
      // tail
      wave = (feel.wag[0] ? Math.sin(s * feel.wag[0]) * feel.wag[1] : 0) + (twitch * 0.3);
      const rest = m.tail.userData.rest;
      m.tail.rotation.set(rest.x + (anim && anim.kind === 'happy' ? 0.35 : 0) + (c.species === 'squirrel' ? 0.05 * Math.sin(s * 1.5) : 0) + hopY * 0.8, rest.y + wave, rest.z + (c.species === 'rabbit' ? 0 : wave * 0.4));

      // asleep: a tiny "z" every few seconds while somebody is near enough to see it
      if (mode === 'sleep') {
        zT -= dt;
        if (zT <= 0) { zT = 4.5; if (thoughts && near.d < 14) thoughts.show(c.id + '-z', () => ({ x: c.position.x, y: c.position.y + m.height * scale * 0.55, z: c.position.z }), ZZZ_SVG, { seconds: 2.6, lift: 0.5 }); }
      }

      // blink (eyes shut while asleep)
      if (sleepAmt > 0.5) { m.setBlink(1); return; }
      blinkT -= dt;
      if (blinkPhase < 0 && blinkT <= 0) blinkPhase = 0;
      if (blinkPhase >= 0) {
        blinkPhase += dt;
        const k = blinkPhase / 0.15;
        m.setBlink(k >= 1 ? 0 : Math.sin(k * Math.PI));
        if (k >= 1) { blinkPhase = -1; blinkT = 2 + rng() * 3.5; }
      }
    }

    Object.defineProperties(c, Object.getOwnPropertyDescriptors({
      update, setHome, play, bubble, scamper, pet, settleNight() { if (c.home === 'camp' && night && mode !== 'sleep') sleepNow(); },
      get busy() { return busy; }, set busy(v) { busy = !!v; },
      get pending() { return pending; }, set pending(v) { pending = v; },
      get sleeping() { return mode === 'sleep'; },
      get sleepSpot() { return sleepSpot; }, get campStops() { return stopsCamp; },
      get mode() { return mode; },
      get yaw() { return yaw; },
      get stops() { return stops; },
      get shown() { return !!(c.group && c.group.visible); },
    }));
    return c;
  }

  plan.forEach((p, i) => { const c = makeCritter(p, i); byId.set(c.id, c); list.push(c); });
  const ids = list.map((c) => c.id);

  // ---------------------------------------------------------------- where each lives (host-authoritative; see the header)
  let state = freshState(ids);
  let saveRest = {};                                   // keys of the save file that later steps own (comfort, jobs, tails): written back untouched
  if (NEW_GAME) clearSave(STORAGE_KEY);
  else { const r = readSave(loadSave(STORAGE_KEY), ids); state = r.state; saveRest = r.rest; }
  const save = () => writeSave(STORAGE_KEY, buildSave(state, saveRest));
  for (const c of list) if (state[c.id].at === 'camp') c.setHome('camp', { animate: false });
  let clock = 0;
  let firstUpdate = true;
  const timers = [];                                   // { id, at, fn } the feeding beats
  const later = (id, seconds, fn) => timers.push({ id, at: clock + seconds, fn });
  const cancelTimers = (id) => { for (let i = timers.length - 1; i >= 0; i--) if (timers[i].id === id) timers.splice(i, 1); };
  const localPlayerOf = (actor) => (sync && actor && actor.screen === sync.screenId && players.get ? players.get(actor.index) : null);
  const headOf = (c) => ({ x: c.position.x, y: c.position.y + (c.model ? c.model.height * (CRITTERS.scale[c.species] || 1) : 1), z: c.position.z });

  /** Place one critter where `at` says, with no fanfare (snapshot, reset). */
  function showSilently(c, at) {
    cancelTimers(c.id);
    c.busy = false; c.pending = 0;
    c.setHome(at, { animate: false });
  }

  /** The feeding beat, on every screen: eat -> happy spin -> scamper toward the camp -> poof -> pops up at its den (+ toast). */
  function beat(c, d) {
    const by = localPlayerOf(d.actor);
    cancelTimers(c.id);
    c.busy = true; c.pending = 0;
    c.play('eat');
    c.bubble(d.food);
    snd('pop', { pitch: 1.3, vol: 0.5 });
    const def = getItem(d.food);
    if (floatLabel && by && !d.free && def) floatLabel(`-1 ${itemName(d.food, 1)}`, headOf(c), by, def.icon);
    const hearts = () => { if (particles) particles.burst('heart', headOf(c), { count: 3, radius: 0.35, height: 0.35 }); };
    later(c.id, BEAT.hearts, hearts);
    later(c.id, BEAT.happy, () => { c.play('happy'); hearts(); });
    later(c.id, BEAT.scamper, () => {
      const dur = c.scamper(BEAT.scamperDist);
      later(c.id, dur + BEAT.settle, () => {
        c.busy = false;
        c.setHome('camp', { animate: true });          // poofs where it stands, pops up at its den
        if (hud) hud.toast(`A ${c.species} moved into the Frostpine camp! (${d.count} / ${ids.length})`, { icon: ICONS[c.species] ? c.species : 'camp', duration: 4200 });
        snd('jingle', { pitch: 1.2, vol: 0.4 });
      });
    });
  }

  function applyFed(d) {
    const c = byId.get(d && d.id);
    if (!c || state[c.id].at === 'camp') return;
    state[c.id] = { at: 'camp' };
    beat(c, d);
  }

  function handleFeed(d, actor, debug = false, force = false) {
    const c = byId.get(d && d.id);
    if (!c || (!actor && !debug)) return { reject: 'bad-request' };
    const remote = !!actor && actor.screen !== 'host';
    const dist = remote && actor.pos ? Math.hypot(actor.pos.x - c.spawn.x, actor.pos.z - c.spawn.z) : null;
    const v = validateFeed({ gateOpen: force || isOpen(), entry: state[c.id], have: force ? 1 : (inventory ? inventory.count(c.food) : 0), dist, range: REMOTE_RANGE + CRITTERS.wanderMax });
    if (!v.ok) return { reject: v.reason };
    if (!force && !(inventory && inventory.remove(c.food, 1))) return { reject: 'none' };
    const count = campCount(state) + 1;
    const data = { id: c.id, food: c.food, count, free: force, actor: actor ? { screen: actor.screen, index: actor.index } : null };
    applyFed(data);
    save();
    if (sync) sync.emit('critters', 'fed', data);
    return { result: { id: c.id, count } };
  }

  function handleReset() {
    state = freshState(ids);
    for (const c of list) showSilently(c, 'wild');
    save();
    if (sync) sync.emit('critters', 'reset', {});
    return true;
  }

  if (sync) sync.register('critters', {
    snapshot: () => JSON.parse(JSON.stringify(state)),
    hashView: () => hashView(state),
    applySnapshot(snap) {
      const next = normaliseState(snap, ids);
      for (const c of list) {
        if (next[c.id].at === state[c.id].at) continue;
        state[c.id] = next[c.id];
        showSilently(c, next[c.id].at);
      }
    },
    applyEvent(kind, d) {
      if (kind === 'fed') applyFed(d);
      else if (kind === 'reset') { state = freshState(ids); for (const c of list) showSilently(c, 'wild'); }
    },
    handleRequest(kind, d, actor) {
      if (kind === 'feed') return handleFeed(d, actor);
      if (kind === 'debugFeed') return handleFeed(d, actor, true, !!(d && d.force));
      if (kind === 'debugReset') return handleReset();
      return { reject: 'unknown-kind' };
    },
  });

  /** Ask the host to feed critter `id` as `player` (host: the answer now, replica: a Promise of it). */
  function feed(player, id) { return sync ? sync.request('critters', 'feed', { id }, player ? sync.actorFor(player) : null) : null; }

  // ---------------------------------------------------------------- what a press of Interact does at a critter
  interactHandler = (c, by) => {
    if (c.home === 'camp') { c.pet(); return true; }
    if (!sync || !inventory || !isOpen() || inventory.count(c.food) < 1) return false;     // "Hungry...": the default thought bubble shows what it wants
    if (c.pending > clock) return true;
    const r = feed(by, c.id);
    if (sync.isHost) { if (!r.ok) afterReject(c, r.reason); }
    else {
      c.pending = clock + 2.5;
      r.then((res) => { c.pending = 0; if (!res.ok) afterReject(c, res.reason); });
    }
    return true;
  };
  function afterReject(c, reason) {
    if (reason === 'gone') return;                      // somebody else fed it first: its beat is already playing
    c.bubble();
    snd('pop', { pitch: 1.2, vol: 0.6 });
    if (reason === 'far' && hud) hud.toast('Come a little closer!', { icon: 'sparkle', duration: 1800 });
  }

  const debug = {
    /** Feed through the host path. `force` (default true) skips the gate and the bag; `{ force: false }` is the real thing (needs the food in the bag). */
    feed(id, { force = true } = {}) { return sync ? sync.request('critters', 'debugFeed', { id, force }, sync.isHost ? { screen: 'host', index: 0, pos: { x: 0, y: 0, z: 0 } } : null) : null; },
    /** Everybody back to the wild (silently, on every screen, saved). */
    reset() { return sync ? sync.request('critters', 'debugReset', {}, sync.isHost ? { screen: 'host', index: 0, pos: { x: 0, y: 0, z: 0 } } : null) : null; },
  };

  return {
    list,
    get: (id) => byId.get(id) || null,
    setInteractHandler(fn) { interactHandler = fn; },
    feed, debug,
    get state() { return state; },
    get count() { return campCount(state); },
    get night() { return night; },
    update(dt, nightness = 0) {
      time += dt; clock += dt;
      if (nightness > NIGHT_ON) night = true; else if (nightness < NIGHT_OFF) night = false;
      if (firstUpdate) { firstUpdate = false; for (const c of list) c.settleNight(); }
      const due = timers.filter((t) => clock >= t.at).sort((a, b) => a.at - b.at);
      for (const t of due) { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); try { t.fn(); } catch (e) { console.error(e); } }
      const visible = !world || world.regions.isFull('frost');
      for (const c of list) c.update(dt, visible);
    },
    summary() {
      return list.map((c) => {
        let calls = 0;
        if (c.group && c.group.visible) c.group.traverse((o) => { if (o.isMesh && o.visible) calls += o.castShadow ? 2 : 1; });
        return {
          id: c.id, species: c.species, food: c.food, home: c.home, at: state[c.id].at, sleeping: c.sleeping, busy: c.busy, zone: c.zone, x: +c.position.x.toFixed(2), y: +c.position.y.toFixed(2), z: +c.position.z.toFixed(2),
          spawn: { x: +c.spawn.x.toFixed(2), z: +c.spawn.z.toFixed(2) }, den: { x: +c.den.x.toFixed(2), z: +c.den.z.toFixed(2) }, mode: c.mode, yaw: +c.yaw.toFixed(2),
          shown: c.shown, drawCalls: calls, built: !!c.model, roam: c.stops.length, collider: { x: +c.collider.x.toFixed(2), z: +c.collider.z.toFixed(2), r: c.collider.r },
          prompt: c.interactable.prompt,
        };
      });
    },
  };
}
