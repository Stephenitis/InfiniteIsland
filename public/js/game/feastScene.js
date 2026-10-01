// Feast scene (PLAN Step 15): the cutscene that plays when the campfire quest is handed in ("Prepare the feast!").
//
//   const feast = createFeastScene({ scene, camera, followCam, players, hud, cinematic, campfire, particles, sfx, items, harvest, gathering,
//                                     dialog, quests, tracker, sync });
//   feast.start(player)        // consume the quest ingredients (atomic) and begin; false if the quest isn't complete / the fire is out / a feast already runs
//                              // (on a replica: sends the request and returns true; the host validates and every screen begins on its event)
//   feast.update(dt)           // once per tick, AFTER followCam.update + cinematic.update (it owns the camera while a feast runs) and before players.updateFx
//   feast.active               // true while the scene itself runs (main.js uses cinematic.active, which covers every cutscene)
//   feast.busy                 // scene or the camera easing back
//   feast.skip()               // what holding Cancel for 1 s does
//   feast.start(player, { free: true })   // debug: run the scene without a quest (nothing is consumed, nothing is counted)
//   feast.summary()            // debug snapshot
//
// Step 28c: the stage (letterbox, HUD fade, camera override + ease-back, banner, bubbles, music duck, held-Cancel skip) lives in game/cinematic.js,
// shared with the bridge-opening scene; this file keeps the feast's own timeline, poses, sync and models.
//
// Timeline (simulation seconds; ~9 s of scene + ~1 s for the camera to ease back):
//   0.0  everybody is frozen, HUD fades out, letterbox bars slide in, the fire flares (visually at least level 2; the real fuel is untouched),
//        the camera leaves the follow view (followCam.enabled = false) and eases into a close framing of the firepit that orbits ~25 deg over the scene
//   0.0-0.85  every player poofs away and pops up on a bench seat (campfire.seats; far benches first so faces are toward the camera), facing the fire, sitting
//   0.95 a plate / bowl of the feast dish appears in each right hand (a model per quest template, held items are hidden meanwhile)
//   1.7+ four staggered bites per player (arm to the mouth, head dip, the food shrinks, a "nom!" bubble, hearts + sparkles, a soft crunch)
//   6.4  everyone hops off the bench to a free standing spot, spins, and cheers (hops, arms up); confetti bursts, a WebAudio jingle,
//        the big bouncy "Quest complete! <name>" banner with "Feasts: N"
//   9.0  outro: banner fades, bars slide out, HUD fades back in, control returns, the quest is cleared and counted, a toast points back to the fire;
//        the camera eases back (~1 s) and followCam is re-enabled exactly where it would be (no snap)
// Holding Cancel (Q / Esc / B / phone B) on ANY device for 1 s skips straight to the outro; a ring fills while it is held. Everything that was changed
// (poses, scale, positions, held-item visibility, freeze flags, fire boost, HUD class, camera) is restored by the same code path either way.
// A player who leaves mid-scene is simply dropped; one who joins waits frozen and joins the cheering when it starts.
//
// World sync (Step 22b, domain 'feast'; needs the 'quests' domain of game/quests.js). "Prepare the feast!" from ANY screen is a request start {}; the
// HOST validates it (quest complete, fire lit, no feast running), removes the ingredients atomically (quests.beginFeast -> inventory events),
// and broadcasts event start {template, n, startAt}: EVERY screen (host included) then plays the scene locally with ITS OWN local players
// (n = the feast count the banner shows; startAt = host wall clock, unused until Step 25 lines the screens up). The host's scene ending
// clears the quest + counts the feast (quests.finishFeast -> 'quests' state event). Holding Cancel skips only the scene of the screen where it
// is held (cross-screen seating, a shared skip and a synchronised start are Step 25). A screen whose scene is still running when the quest
// state changes simply keeps playing; nothing waits for another screen, so nothing can deadlock.
import * as THREE from 'three';
import { PLAYER_RADIUS } from '../config.js';
import { getHeight, isWalkable, getGroundType } from '../world/terrain.js';
import { overlapsAny } from '../world/colliders.js';
import { toonMat, addOutline } from '../render/toon.js';
import { QUESTS } from './quests.js';
import { MAX_HATS } from './hatLogic.js';
import { HAT_SVG } from '../ui/icons.js';

const TAU = Math.PI * 2;

// ---- timeline (s)
const SEAT_AT = 0.4;            // poof out ends, the player is moved to the seat and pops up
const POP_END = 0.85;
const PLATE_AT = 0.95;
const EAT_START = 1.7;
const BITES = 4;
const BITE_GAP = 1.05;
const BITE_STAGGER = 0.28;
const CHEER_START = 6.4;
const STAND_STAGGER = 0.1;
const HOP_TIME = 0.5;           // hop off the bench
const END = 9.0;                // outro begins
const BANNER_AT = CHEER_START + 0.15;

// ---- camera
const ORBIT = 25 * Math.PI / 180;
const CAM_PITCH = 0.5;          // rad above the horizon
const CAM_DIST = 9.4;
const HALF_WIDTH = 3.7;         // ground half-width that must fit (portrait screens pull back)
const CAM_EASE_IN = 1.8;

const SIT_LIFT = 0.31;          // root sits this far below the bench top (hips land on the log)
const PLATE_LOCAL = new THREE.Vector3(0, -0.13, 0);     // plate centre in the hand socket (arm local: -Y runs along the arm)

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
const easeOutBack = (t) => { t = clamp(t); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const shortest = (from, to) => { let d = (to - from) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; };
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------------------------------------
// Feast dish models: a small bowl / plate with food blobs (one prototype per quest template, cloned per player; geometry is shared)
// ---------------------------------------------------------------------------------------------
function blob(r, color, x, y, z, outline = 0.02, sy = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), toonMat(color));
  m.position.set(x, y, z);
  m.scale.y = sy;
  m.castShadow = true;
  addOutline(m, outline);
  return m;
}
function slab(rTop, rBot, h, color, y, outline = 0.022) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 20), toonMat(color));
  m.position.y = y;
  m.castShadow = true;
  if (outline) addOutline(m, outline);
  return m;
}

function buildFeastModel(food) {
  const g = new THREE.Group();
  g.name = 'feast-dish';
  const foodG = new THREE.Group();
  foodG.name = 'feast-food';
  g.add(foodG);
  const C = food.colors;
  if (food.kind === 'bowl') {
    g.add(slab(0.27, 0.15, 0.17, '#b9794a', 0));
    foodG.position.y = 0.085;
    const soup = slab(0.235, 0.235, 0.05, C[0], 0, 0);
    foodG.add(soup);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.4, r = i % 2 ? 0.13 : 0.06 + (i % 3) * 0.02;
      foodG.add(blob(0.05 + 0.012 * (i % 3), C[1 + (i % (C.length - 1))], Math.cos(a) * r, 0.045, Math.sin(a) * r, 0.014));
    }
    foodG.add(blob(0.085, C[2] || C[1], 0.0, 0.07, 0.0, 0.016, 0.85));
  } else {
    g.add(slab(0.32, 0.27, 0.05, '#fff4dc', 0));
    g.add(slab(0.2, 0.2, 0.056, '#ffe3c2', 0.002, 0));
    foodG.position.y = 0.025;
    if (food.kind === 'skewers') {
      for (let i = 0; i < 3; i++) {
        const a = (i - 1) * 0.55;
        const s = new THREE.Group();
        s.rotation.z = 1.05;
        s.rotation.y = a;
        s.position.set(0.0, 0.06, (i - 1) * 0.11);
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.56, 6), toonMat('#d9a066'));
        stick.rotation.z = Math.PI / 2;
        s.add(stick);
        for (let k = 0; k < 3; k++) s.add(blob(0.072, C[(i * 3 + k) % C.length], -0.17 + k * 0.17, 0, 0, 0.016));
        foodG.add(s);
      }
    } else {
      const ring = 5;
      for (let i = 0; i < ring; i++) {
        const a = (i / ring) * TAU + 0.3;
        foodG.add(blob(0.1, C[i % C.length], Math.cos(a) * 0.15, 0.08, Math.sin(a) * 0.15, 0.018, 0.85));
      }
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + 1.1;
        foodG.add(blob(0.09, C[(i + 2) % C.length], Math.cos(a) * 0.065, 0.17, Math.sin(a) * 0.065, 0.018, 0.85));
      }
      foodG.add(blob(0.07, C[C.length - 1], 0, 0.25, 0, 0.016));
    }
  }
  g.userData.food = foodG;
  return g;
}

// ---------------------------------------------------------------------------------------------
// createFeastScene
// ---------------------------------------------------------------------------------------------
export function createFeastScene({
  scene, camera, followCam, players, avatars = null, slots = null, hud, cinematic: cin, campfire, particles, sfx = null, items = null, harvest = null, gathering = null,
  dialog = null, quests, tracker = null, sync,
}) {
  const snd = (name, opts) => { if (sfx) sfx.play(name, opts); };

  // ---- state
  let state = 'idle';              // 'idle' | 'scene' | 'outro'
  let t = 0;
  let free = false;                // debug run: no quest involved
  let feastNo = 0;                 // the feast count the banner shows
  let template = null;
  let recs = [];
  let hiddenItems = [];
  let startAt = 0;
  let sharedEvent = null;
  let skipRequested = false;
  let skipped = false;
  const ev = { confetti: [false, false, false], jingle: false, banner: false };
  const prototypes = new Map();
  const cam = {
    startPos: cin.startPos, startLook: cin.startLook, az0: 0, dist: CAM_DIST,
    look: new THREE.Vector3(), pos: new THREE.Vector3(), curLook: cin.curLook, shift: { x: 0, z: 0 },
  };
  const _v = new THREE.Vector3();
  const fireAt = () => campfire.position;

  const modelFor = (tp) => {
    let m = prototypes.get(tp.id);
    if (!m) { m = buildFeastModel(tp.food); prototypes.set(tp.id, m); }
    const c = m.clone(true);
    c.userData.food = c.getObjectByName('feast-food');
    return c;
  };

  // ---- helpers
  function poof(pos, colors) {
    const at = { x: pos.x, y: pos.y + 0.5, z: pos.z };
    particles.burst('puff', at, { count: 10, radius: 0.5, height: 0.35, size: 1.4, speed: 1.2 });
    particles.burst('sparkle', at, { count: 7, radius: 0.5, height: 0.4, color: colors ? colors.ui : undefined, speed: 1.1 });
  }

  function makeBanner() {
    const extras = [];
    const feasts = document.createElement('div');
    feasts.className = 'fb-feasts';
    feasts.textContent = `Feasts: ${feastNo}`;
    extras.push(feasts);
    if (!free && feastNo >= 1 && feastNo <= MAX_HATS) {          // this feast unlocks a hat (game/hatLogic.js; world/hatRack.js shows the toast)
      const hat = document.createElement('div');
      hat.className = 'fb-hat';
      hat.innerHTML = `<span class="fb-hat-ic">${HAT_SVG}</span><span>New hat unlocked!</span>`;
      extras.push(hat);
    }
    return cin.showBanner([{ text: 'Quest complete!', cls: 'fb-title' }, { text: template ? template.name : 'Feast', cls: 'fb-name' }], extras);
  }

  // ---- seats / standing spots
  function orderedSeats() {
    const f = fireAt();
    const cx = Math.sin(cam.az0), cz = Math.cos(cam.az0);
    return campfire.seats
      .map((s) => ({ s, score: (s.x - f.x) * cx + (s.z - f.z) * cz }))
      .sort((a, b) => a.score - b.score)            // far side (away from the camera) first: those faces are toward the lens
      .map((e) => e.s);
  }

  function pickStand(seat, taken) {
    const f = fireAt();
    const a0 = Math.atan2(seat.z - f.z, seat.x - f.x);
    for (const r of [3.75, 3.35, 4.3, 4.9, 5.6]) {
      for (const da of [0, 0.3, -0.3, 0.6, -0.6, 0.95, -0.95, 1.3, -1.3]) {
        const x = f.x + Math.cos(a0 + da) * r, z = f.z + Math.sin(a0 + da) * r;
        if (!isWalkable(x, z) || getHeight(x, z) < 0.15 || overlapsAny(x, z, PLAYER_RADIUS + 0.12)) continue;
        const gt = getGroundType(x, z);
        if (gt === 'water' || gt === 'wetsand') continue;            // the stream runs close to the fire: stand on dry ground
        if (taken.some((q) => Math.hypot(q.x - x, q.z - z) < 1.25)) continue;
        return { x, z };
      }
    }
    return { x: f.x + Math.cos(a0) * 3.6, z: f.z + Math.sin(a0) * 3.6 };
  }

  // ---- participants
  function makeRec(p, order, seat, standOnly = false) {
    const rec = {
      p, order, seat, standOnly, stand: null, seated: false, puffedOut: false, plate: null, food: null, foodS: 1, bites: 0, nextHop: 0, landed: false, landT: 0,
      seatY: seat ? seat.y - SIT_LIFT : 0, bitesAt: [], cheerSfx: 0,
    };
    if (standOnly) rec.stand = { x: p.position.x, z: p.position.z };
    for (let k = 0; k < BITES; k++) rec.bitesAt.push(EAT_START + k * BITE_GAP + order * BITE_STAGGER);
    return rec;
  }

  function attachPlate(rec) {
    const plate = modelFor(template);
    plate.scale.setScalar(0.01);
    plate.position.copy(PLATE_LOCAL);
    rec.p.parts.handSocket.add(plate);
    rec.plate = plate;
    rec.food = plate.userData.food;
    rec.foodS = 1;
  }

  function dropPlate(rec) {
    if (rec.plate) { rec.plate.removeFromParent(); rec.plate = null; rec.food = null; }
  }

  function restoreRec(rec) {
    const p = rec.p;
    dropPlate(rec);
    if (p.spawnT < 0 && !p.leaving) p.root.scale.setScalar(1);
    p._faceTo = null;
    p.parts.torso.rotation.x = 0;                    // (the player's own animation never resets these two)
    p.parts.legL.rotation.z = 0;
    p.parts.legR.rotation.z = 0;
  }

  function placeStanding(rec) {
    const p = rec.p;
    if (!rec.stand) return;
    p.position.set(rec.stand.x, getHeight(rec.stand.x, rec.stand.z), rec.stand.z);
    p.velocity.x = p.velocity.z = 0;
  }

  const gone = (rec) => rec.p.leaving || (rec.p.screen === 'local' ? players.get(rec.p.index) : avatars?.get(rec.p.index)) !== rec.p;

  // ---- per-player frame
  function updateRec(rec, dt) {
    const p = rec.p, P = p.parts;
    const tStand = rec.standOnly ? 0 : CHEER_START + rec.order * STAND_STAGGER;
    const cheering = rec.standOnly ? t >= CHEER_START : t >= tStand;
    const camFace = Math.atan2(camera.position.x - p.position.x, camera.position.z - p.position.z);

    // --- arrival: poof out, move to the seat, pop in
    if (!rec.standOnly) {
      if (t < SEAT_AT) {
        if (!rec.puffedOut) { rec.puffedOut = true; poof(p.position, p.colors); snd('pop', { pitch: 1.1 }); }
        p.root.scale.setScalar(Math.max(0.01, 1 - smooth(t / SEAT_AT)));
        return;
      }
      if (!rec.seated) {
        rec.seated = true;
        p.position.set(rec.seat.x, rec.seat.y - SIT_LIFT, rec.seat.z);
        p.velocity.x = p.velocity.z = 0;
        p.facing = rec.seat.facing;
        p.root.rotation.y = p.facing;
        poof(rec.seat, p.colors);
        snd('pop', { pitch: 1.3 });
      }
      p.root.scale.setScalar(Math.max(0.01, easeOutBack((t - SEAT_AT) / (POP_END - SEAT_AT))));
    }

    // --- stand-up / landing
    let sit = 0;                     // 0..1 how seated the body is
    let e = 0;                       // 0..1 progress of the hop off the bench
    if (!rec.standOnly) {
      const sitIn = easeOut((t - SEAT_AT) / 0.3);
      e = clamp((t - tStand) / HOP_TIME);
      sit = e > 0 ? sitIn * (1 - smooth(e / 0.5)) : sitIn;
      const gyS = getHeight(rec.seat.x, rec.seat.z);
      if (e <= 0) {
        p.position.set(rec.seat.x, lerp(gyS, rec.seatY, sitIn), rec.seat.z);
        p.facing = rec.seat.facing;
      } else if (e < 1) {
        const k = easeOut(e);
        const gyT = getHeight(rec.stand.x, rec.stand.z);
        p.position.set(lerp(rec.seat.x, rec.stand.x, k), lerp(rec.seatY, gyT, e) + 0.9 * Math.sin(Math.PI * e), lerp(rec.seat.z, rec.stand.z, k));
        p.facing = rec.seat.facing + shortest(rec.seat.facing, camFace) * k;
      } else if (!rec.landed) {
        rec.landed = true;
        rec.landT = t;
        placeStanding(rec);
        particles.burst('puff', { x: p.position.x, y: p.position.y + 0.1, z: p.position.z }, { count: 4, radius: 0.35, size: 0.9 });
        snd('thud', { vol: 0.5, pitch: 1.2 });
      }
      p.velocity.x = p.velocity.z = 0;
    } else if (cheering && !rec.landed) {
      rec.landed = true;
      rec.landT = t;
      rec.nextHop = t + 0.25;
    }

    // --- cheering on the ground: spin to face the camera, hop, arms up
    let ck = 0;
    if (rec.landed) {
      if (rec.nextHop === 0) rec.nextHop = t + 0.22;
      const su = clamp((t - rec.landT) / 0.8);
      p.facing = camFace - TAU * (1 - easeOut(su)) + Math.sin(t * 5 + rec.order) * 0.22 * su;
      ck = smooth((t - rec.landT) / 0.25);
      if (t >= rec.nextHop && p.grounded) {
        p.hop();
        rec.nextHop = t + rnd(0.55, 0.72);
        snd('pop', { pitch: 1.05 + rec.order * 0.12 + rnd(0, 0.1), vol: 0.5 });
        particles.burst('sparkle', { x: p.position.x, y: p.position.y + 1.6, z: p.position.z }, { count: 2, radius: 0.5, speed: 0.8 });
        if (Math.random() < 0.4) particles.burst('heart', { x: p.position.x, y: p.position.y + 2.0, z: p.position.z }, { count: 1, radius: 0.3 });
      }
    }
    p.root.rotation.y = p.facing;

    // --- body poses (blended over what the player's own animation just produced)
    P.legL.rotation.z = 0.06 * sit;
    P.legR.rotation.z = -0.06 * sit;
    P.torso.rotation.x = 0;
    if (sit > 0.001) {
      P.legL.rotation.x = lerp(P.legL.rotation.x, -1.42, sit);
      P.legR.rotation.x = lerp(P.legR.rotation.x, -1.42, sit);
      P.rig.rotation.x = lerp(P.rig.rotation.x, 0.06, sit);
      P.armL.rotation.x = lerp(P.armL.rotation.x, -0.85, sit);
      P.armL.rotation.z = lerp(P.armL.rotation.z, 0.3, sit);
    }

    // --- the plate and the bites
    if (rec.plate) {
      const showing = !rec.standOnly && t >= PLATE_AT && e < 0.12;
      const pu = easeOutBack((t - PLATE_AT) / 0.4);
      rec.plate.visible = showing;
      if (showing) {
        rec.plate.scale.setScalar(Math.max(0.01, pu));
        const foodTarget = 1 - rec.bites / BITES;
        rec.foodS += (foodTarget - rec.foodS) * (1 - Math.exp(-16 * dt));
        rec.food.scale.setScalar(Math.max(0.001, rec.foodS));
        rec.food.visible = rec.foodS > 0.03;
      }
    }
    let bump = 0, dip = 0;
    if (rec.plate && !rec.standOnly && t >= PLATE_AT && e < 0.12) {
      while (rec.bites < BITES && t >= rec.bitesAt[rec.bites] + 0.36) onBite(rec, rec.bites);      // (a long frame can't lose a bite)
      for (let k = 0; k < BITES; k++) {
        const u = (t - rec.bitesAt[k]) / 0.85;
        if (u < 0 || u > 1) continue;
        bump = Math.max(bump, smooth(u / 0.4) * (1 - smooth((u - 0.55) / 0.4)));
        dip = Math.max(dip, Math.sin(Math.PI * clamp((u - 0.18) / 0.5)));
      }
      const chewing = rec.bites > 0 && t < rec.bitesAt[Math.min(BITES - 1, rec.bites - 1)] + 1.15;
      if (chewing) dip += Math.sin(t * 17 + rec.order) * 0.05;
      const armPitch = -1.5 - 0.62 * bump;
      const ek = smooth((t - PLATE_AT) / 0.35) * (1 - smooth((e - 0.0) / 0.12));
      const armRx = lerp(P.armR.rotation.x, armPitch + Math.sin(t * 2.2 + rec.order) * 0.02, ek);
      const armRz = lerp(P.armR.rotation.z, -0.1, ek);
      P.armR.rotation.x = armRx;
      P.armR.rotation.z = armRz;
      P.headGroup.rotation.x += dip * 0.34;
      P.torso.rotation.x = dip * 0.08;
      // keep the plate level whatever the arm does (Euler ZYX = Rz * Rx)
      rec.plate.rotation.set(-armRx, 0, -armRz, 'ZYX');
    }
    if (ck > 0.001) {
      const wave = Math.sin(t * 13 + rec.order * 1.3) * 0.16;
      P.armL.rotation.x = lerp(P.armL.rotation.x, 0, ck);
      P.armR.rotation.x = lerp(P.armR.rotation.x, 0, ck);
      P.armL.rotation.z = lerp(P.armL.rotation.z, 2.65 + wave, ck);
      P.armR.rotation.z = lerp(P.armR.rotation.z, -2.65 - wave, ck);
    }

    // --- blob shadow hugs the ground, not the bench
    const gy = getHeight(p.position.x, p.position.z);
    P.blob.position.y = 0.06 + (gy - p.position.y);
  }

  function onBite(rec, k) {
    const p = rec.p;
    rec.bites = k + 1;
    const words = ['nom!', 'yum!', 'mmm~', 'nom nom!', 'tasty!'];
    cin.showBubble(p, words[(rec.order + k * 2) % words.length]);
    snd('nom', { pitch: 0.92 + rec.order * 0.1 + rnd(0, 0.08) });
    const head = { x: p.position.x, y: p.position.y + 1.25, z: p.position.z };
    particles.burst('heart', { x: head.x, y: head.y + 0.55, z: head.z }, { count: 2, radius: 0.35 });
    particles.burst('sparkle', { x: head.x, y: head.y + 0.25, z: head.z }, { count: 3, radius: 0.45, speed: 0.7 });
  }

  // ---- camera
  function camFrame(az) {
    const f = fireAt();
    const pitch = CAM_PITCH;
    const d = cam.dist;
    cam.pos.set(f.x + Math.sin(az) * Math.cos(pitch) * d, f.y + 0.9 + Math.sin(pitch) * d, f.z + Math.cos(az) * Math.cos(pitch) * d);
    cam.look.set(f.x + cam.shift.x, f.y + 0.95, f.z + cam.shift.z);
  }

  function updateCamera() {
    const az = cam.az0 + ORBIT * clamp(t / END);
    camFrame(az);
    const k = smooth(t / CAM_EASE_IN);
    camera.position.lerpVectors(cam.startPos, cam.pos, k);
    _v.lerpVectors(cam.startLook, cam.look, k);
    cin.look(_v);
  }

  // ---- start / finish
  /** "Prepare the feast!" / debug: see the header. Host: decided right here (true when the scene started); replica: asks the host. */
  function start(player, { free: dbg = false } = {}) {
    if (state !== 'idle' || cin.busy) return false;
    if (dbg) return begin(quests.active || QUESTS[0], { free: true });
    const req = sync.request('feast', 'start', {}, player ? sync.actorFor(player) : null);
    if (sync.isHost) { if (!req.ok) refusal(req.reason); return req.ok; }
    req.then((r) => { if (!r.ok) refusal(r.reason); });          // replica: the `start` event begins the scene
    return true;
  }

  function refusal(reason) {
    if (reason === 'missing') hud.toast('Something is missing from the bag!', { icon: 'quest' });
    else if (reason === 'no-fire') hud.toast('Light the fire first!', { icon: 'flame' });
  }

  /** HOST: validate, consume the quest ingredients (atomic), tell every screen and begin here too. */
  function handleStart(actor) {
    if (state !== 'idle' || cin.busy) return { reject: 'busy' };
    if (actor?.screen !== 'host') {
      const entry = slots?.get(actor?.index);
      if (!entry || entry.screen !== actor?.screen || entry.away) return { reject: 'not-your-player' };
      const f = fireAt(), p = actor.pos;
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z) || Math.hypot(p.x - f.x, p.z - f.z) > 10) return { reject: 'too-far' };
    }
    if (!quests.active || quests.feasting) return { reject: 'no-quest' };
    if (!campfire.lit) return { reject: 'no-fire' };
    const tpl = quests.active;
    if (!quests.beginFeast()) return { reject: 'missing' };
    const f = fireAt();
    cam.az0 = Math.atan2(camera.position.x - f.x, camera.position.z - f.z);
    if (Math.hypot(camera.position.x - f.x, camera.position.z - f.z) > 40) cam.az0 = 0;
    const ordered = orderedSeats();
    const present = (slots?.slots || []).map((s, slot) => s && !s.away ? slot : -1).filter((slot) => slot >= 0);
    const data = {
      template: tpl.id, n: quests.feasts + 1, startAt: sync.hostNow() + 500, az: cam.az0,
      seats: present.map((slot, i) => ({ slot, bench: ordered[i % ordered.length].bench })),
    };
    sync.emit('feast', 'start', data);
    begin(tpl, { n: data.n, event: data });
    return true;
  }

  /** Every screen (host included): the same participant roster, seats and host-clock start. */
  function begin(tpl, { free: dbg = false, n = 0, event = null } = {}) {
    // anything in progress is dropped (nothing is consumed by that)
    avatars?.reconcile();
    if (!cin.begin('feast', { onIdle: () => { state = 'idle'; } })) return false;      // another cutscene runs: this screen skips the feast
    template = tpl || QUESTS[0];
    feastNo = dbg ? quests.feasts : n;
    free = dbg;
    sharedEvent = event;
    startAt = event?.startAt || 0;
    skipRequested = false;
    state = 'scene';
    t = 0; skipped = false;
    ev.confetti = [false, false, false]; ev.jingle = false; ev.banner = false;

    const participants = [...players.list, ...(avatars?.list || [])].filter((p) => !p.away).sort((a, b) => a.index - b.index);
    for (const p of players.list) {
      campfire.release(p);
      if (harvest) harvest.release(p);
      if (gathering) gathering.release(p);
      p.frozen = true;
    }

    // held items are hidden during the scene (restored in finish())
    hiddenItems = [];
    if (items) {
      for (const p of players.list) { const r = items.heldBy(p); if (r && r.pivot.visible) { r.pivot.visible = false; hiddenItems.push(r); } }
      for (const p of avatars?.list || []) {
        const r = items.list.find((it) => it.holderKey === `${p.screen}:${p.index}`);
        if (r?.pivot.visible) { r.pivot.visible = false; hiddenItems.push(r); }
      }
    }

    // (the camera was taken by cin.begin: followCam off, start pose remembered in cam.startPos / startLook)
    const f = fireAt();
    cam.az0 = event?.az ?? Math.atan2(camera.position.x - f.x, camera.position.z - f.z);
    if (!event && Math.hypot(camera.position.x - f.x, camera.position.z - f.z) > 40) cam.az0 = 0;
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    cam.dist = clamp(Math.max(CAM_DIST, HALF_WIDTH / (Math.tan(halfFov) * camera.aspect)), CAM_DIST, 24);

    // players -> seats (far benches first), stand spots reserved up front
    const seats = orderedSeats();
    let sx = 0, sz = 0;
    const assigned = event?.seats?.length ? event.seats.map((r) => campfire.seats.find((s) => s.bench === r.bench)).filter(Boolean) : seats.slice(0, participants.length);
    const count = Math.max(1, assigned.length);
    for (const s of assigned) { sx += s.x - f.x; sz += s.z - f.z; }
    cam.shift.x = (sx / count) * 0.3;                    // look a little toward the seated players (a lone player on the far bench would sit on the edge otherwise)
    cam.shift.z = (sz / count) * 0.3;
    if (count === 1) cam.dist = Math.max(cam.dist - 0.9, 8.4);
    const list = participants;
    const taken = [];
    recs = list.map((p, i) => {
      const bench = event?.seats?.find((r) => r.slot === p.index)?.bench;
      const seat = campfire.seats.find((s) => s.bench === bench) || seats[i % seats.length];
      const rec = makeRec(p, i, seat);
      rec.stand = pickStand(seat, taken);
      taken.push(rec.stand);
      attachPlate(rec);
      return rec;
    });

    // fire (the HUD fade, bars and music duck came with cin.begin)
    campfire.setBoost(2);
    campfire.flare();
    snd('whoosh', { pitch: 0.6, vol: 0.6 });
    return true;
  }

  function finish(wasSkipped) {
    if (state !== 'scene') return;
    skipped = !!wasSkipped;
    // players: standing at their free spots, everything restored
    for (const rec of recs) { placeStanding(rec); restoreRec(rec); }
    recs = [];
    sharedEvent = null;
    startAt = 0;
    for (const r of hiddenItems) r.pivot.visible = true;
    hiddenItems = [];
    cin.releaseAll();
    campfire.setBoost(0);
    cin.end({ unduck: 1.8 });                    // bars out, HUD back, music up, banner out; the camera eases back (cin.update) and onIdle() ends 'outro'
    // the quest is over
    if (!free) quests.finishFeast();
    if (tracker && !free) tracker.flashIdle(14);
    hud.toast('Visit the campfire for a new quest!', { icon: 'quest', duration: 3600 });
    if (skipped) hud.toast(`Quest complete! ${template ? template.name : ''}`, { icon: 'feast', duration: 2600 });
    state = 'outro';
  }

  function skip() {
    if (state !== 'scene') return false;
    if (free || !sharedEvent) { finish(true); return true; }
    if (skipRequested) return true;
    skipRequested = true;
    const r = sync.request('feast', 'skip', {});
    if (r && typeof r.then === 'function') r.then((answer) => { if (!answer.ok) skipRequested = false; });
    else if (!r.ok) skipRequested = false;
    return true;
  }

  function handleSkip() {
    if (state !== 'scene') return { reject: 'idle' };
    sync.emit('feast', 'skip', {});
    finish(true);
    return true;
  }

  function update(dt) {
    if (state === 'idle') return;
    if (state === 'outro') return;                    // cin.update eases the camera back
    if (startAt && sync.hostNow() < startAt) {
      for (const p of players.list) p.frozen = true;
      return;
    }
    t += dt;
    if (startAt) t = Math.max(t, (sync.hostNow() - startAt) / 1000);

    // the scene owns everybody: (re-)freeze all, joiners included
    for (const p of players.list) p.frozen = true;

    // skip: Cancel held on any device for 1 s
    if (cin.pollSkip(dt, t)) { skip(); return; }

    // participants: drop leavers, add joiners once the cheering starts
    recs = recs.filter((rec) => { if (gone(rec)) { dropPlate(rec); return false; } return true; });
    if (t >= CHEER_START) {
      for (const p of players.list) {
        if (p.spawnT >= 0 || recs.some((r) => r.p === p)) continue;
        recs.push(makeRec(p, recs.length, null, true));
      }
    }
    for (const rec of recs) updateRec(rec, dt);

    // one-shot celebration events
    const f = fireAt();
    if (t >= CHEER_START && !ev.jingle) { ev.jingle = true; snd('jingle'); }
    [0.05, 0.85, 1.65].forEach((dtC, i) => {
      if (t < CHEER_START + dtC || ev.confetti[i]) return;
      ev.confetti[i] = true;
      particles.burst('confetti', { x: f.x, y: f.y + 2.4, z: f.z }, { count: 34, radius: 1.3, speed: 1.0, height: 0.5 });
      for (const rec of recs) particles.burst('confetti', { x: rec.p.position.x, y: rec.p.position.y + 2.2, z: rec.p.position.z }, { count: 12, radius: 0.6, speed: 0.75 });
      if (i === 0) campfire.flare();
      snd('pop', { pitch: 1.5 + i * 0.25, vol: 0.5 });
    });
    if (t >= BANNER_AT && !ev.banner) { ev.banner = true; makeBanner(); }
    if (t >= END - 0.35) cin.dismissBanner();

    cin.updateBubbles(dt);
    updateCamera();
    if (t >= END) finish(false);
  }

  // let go of players that leave before the next update runs (their parts are disposed right after the poof)
  players.on('leave', (p) => {
    const i = recs.findIndex((r) => r.p === p);
    if (i >= 0) { dropPlate(recs[i]); recs.splice(i, 1); }
  });

  sync.register('feast', {
    snapshot: () => sharedEvent,
    applySnapshot(d) {
      if (d && state === 'idle') begin(QUESTS.find((q) => q.id === d.template) || QUESTS[0], { n: d.n, event: d });
    },
    applyEvent(kind, d) {
      if (kind === 'skip') { if (state === 'scene') finish(true); return; }
      if (kind === 'start' && state === 'idle') begin(QUESTS.find((q) => q.id === d.template) || QUESTS[0], { n: d.n, event: d });
    },
    handleRequest(kind, _data, actor) {
      if (kind === 'start') return handleStart(actor);
      if (kind === 'skip') return handleSkip();
      return { reject: 'unknown-kind' };
    },
  });

  return {
    start, update, skip,
    get active() { return state === 'scene'; },
    get busy() { return state !== 'idle'; },
    get state() { return state; },
    get t() { return t; },
    get holdT() { return cin.holdT; },
    summary() {
      return {
        state, t: +t.toFixed(2), skipped, free, quest: template ? template.id : null, holdT: +cin.holdT.toFixed(2),
        recs: recs.map((r) => ({ p: r.p.colors.name, seated: r.seated, bites: r.bites, plate: !!r.plate, landed: r.landed })),
        boost: campfire.boost, hudClass: cin.summary().hudClass, followCam: followCam.enabled,
        frozen: players.list.map((p) => p.frozen),
      };
    },
  };
}
