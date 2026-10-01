// Hat rack (PLAN Step 26b): a wooden hat stand at the edge of the campfire plaza that appears after the first feast, shows the unlocked feast hats
// (player/hats.js) on its pegs and lets any player try them on. Also owns the "what does each local player wear" bookkeeping + its saving.
//
//   const rack = createHatRack({ scene, players, quests, sync, particles, sfx, hud, floatLabel });
//   rack.update(dt)                // once per tick (pop animations)
//   rack.cycle(player)             // the rack's action: the next unlocked hat (beanie -> hats -> beanie), with hop + poof + sfx + name label
//   rack.wear(player, i, fx)       // put on hat i (-1 = default beanie); fx false = silent (restoring a saved choice); the choice is saved
//   rack.preview(n | null)         // debug: pretend n hats are unlocked (not saved, never touches quests.feasts); null = back to the real count
//   rack.unlocked                  // current number of unlocked hats (preview or min(10, quests.feasts))
//   rack.summary()                 // debug snapshot
//
// Unlocks come from the synced feast count (quests.feasts), so there is no world-sync domain: every screen derives the same rack from its own
// quests mirror. Before the first feast the rack does NOT exist (no mesh, collider or interactable). When the count reaches 1 it pops in with a
// squash-and-stretch + poof + jingle (live), or simply appears (page load / late join). A replica waits for the host's snapshot before deciding.
// Unlocked hats sit on the 10 pegs as small merged copies: ONE hat mesh, rebuilt only when the count changes (the newest hat pops onto its peg
// on its own for ~0.6 s with sparkles, then joins the merge). Whole rack: 3 draw calls (post + outline + shadow) + 2 (hats + shadow) = 5.
//
// Wearing is per player and per screen (never assumes P1); player.hatIndex / player.wearHat(i) hold the model, the pose packets carry the id to
// the other screens (net/avatars.js). Choices are saved per screen under localStorage 'infiniteIsland.hats' = { slotIndex: hatIndex } (hosts and
// replicas alike; a cosmetic preference, not game state) and re-applied when a player (re)joins. A saved hat beyond the unlocked count falls back
// to the beanie, and the stale entry is forgotten once the real count is known (e.g. after ?newgame).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HAT_RACK } from '../config.js';
import { getHeight, SPAWN } from './terrain.js';
import { addCollider, removeCollider } from './colliders.js';
import { addInteractable, removeInteractable } from './interactables.js';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../render/geo.js';
import { castMesh, hatMaterial } from '../player/character.js';
import { HATS } from '../player/hats.js';
import { HAT_SVG } from '../ui/icons.js';
import { MAX_HATS, unlockedCount, nextHat, clampHat, parseHatPrefs } from '../game/hatLogic.js';

export const STORAGE_KEY = 'infiniteIsland.hats';
const TAU = Math.PI * 2;
const RACK_SCALE = 1.25;                // the whole stand is a bit bigger than its modelling units (reads better from the camera)
const HAT_SCALE = 0.5;                  // displayed hats are small copies of the real models
const DISPLAY_SCHEME = { hat: '#ffc93c', cuff: '#ff8a5c', shirt: '#ff7a6b', pants: '#6d79d6' };
const POP_TIME = 0.9;                   // s, the rack's squash-and-stretch
const PEG_POP_DELAY = 0.7;              // s after the rack itself popped in
const PEG_POP_TIME = 0.55;
const TRY_COOLDOWN = 0.35;              // s, per player
const FRONT = Math.PI / 2;              // angle (x = cos, z = sin) that points at the default camera (+Z)
const PEGS = [                          // [angle from the camera side (deg), tier]: the first hats take the front pegs
  [0, 0], [36, 1], [-36, 1], [72, 0], [-72, 0], [108, 1], [-108, 1], [144, 0], [-144, 0], [180, 1],
];
const TIER_Y = [1.05, 1.62];
const PEG_TIP_R = 0.7;
const PEG_RISE = 0.2;

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Where hat k hangs, in rack-local coordinates (the hat origin = just above the peg tip) + its outward yaw. */
function pegSpot(k) {
  const [deg, tier] = PEGS[k];
  const a = FRONT + THREE.MathUtils.degToRad(deg);
  const y = TIER_Y[tier];
  return { a, tipX: Math.cos(a) * PEG_TIP_R, tipY: y + PEG_RISE, tipZ: Math.sin(a) * PEG_TIP_R, yaw: Math.PI / 2 - a };
}

function loadPrefs() {
  try { return parseHatPrefs(localStorage.getItem(STORAGE_KEY)); } catch { return {}; }
}
function savePrefs(prefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* private mode / storage off: the choice just is not remembered */ }
}

// ---------------------------------------------------------------------------------------------
// Rack model: post + base + 10 pegs + carved sign in ONE merged vertex-coloured mesh (+ smoothed outline)
// ---------------------------------------------------------------------------------------------
const _up = new THREE.Vector3(0, 1, 0);
function between(geo, color, a, b, r) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(_up, d.clone().normalize());
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return part(geo, color, { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], r: [e.x, e.y, e.z], s: [r, len, r] });
}

function buildRackGeometry() {
  const wood = '#b97d48', woodDark = '#8a5a34', woodLight = '#d49a5e', cream = '#f2cf96';
  const parts = [];
  // base: a chunky round foot + three stone-ish wedges
  parts.push(part(G.cyl8, woodDark, { p: [0, -0.04, 0], s: [0.55, 0.44, 0.55] }));       // sunk into the slope
  parts.push(part(G.cyl8, wood, { p: [0, 0.2, 0], s: [0.3, 0.14, 0.3] }));
  // post + a round knob on top
  parts.push(part(G.cyl8, wood, { p: [0, 1.15, 0], s: [0.11, 2.0, 0.11] }));
  parts.push(part(G.sphere, woodLight, { p: [0, 2.2, 0], s: [0.17, 0.15, 0.17] }));
  // pegs (tier 0 / 1): a slim branch rising outward with a round tip, plus a collar on the post
  for (let k = 0; k < PEGS.length; k++) {
    const s = pegSpot(k);
    const y0 = TIER_Y[PEGS[k][1]];
    const c = Math.cos(s.a), n = Math.sin(s.a);
    parts.push(between(G.cyl6, woodLight, [c * 0.07, y0, n * 0.07], [s.tipX, s.tipY, s.tipZ], 0.05));
    parts.push(part(G.sphereLo, cream, { p: [s.tipX, s.tipY + 0.01, s.tipZ], s: [0.075, 0.075, 0.075] }));
  }
  // carved sign on the front of the post: a round plaque with a little hat on it
  const sz = 0.15;
  parts.push(part(G.cyl8, cream, { p: [0, 0.62, sz], r: [Math.PI / 2, 0, 0], s: [0.27, 0.06, 0.22] }));
  parts.push(part(G.sphere, '#ffc93c', { p: [0, 0.66, sz + 0.05], s: [0.1, 0.09, 0.03] }));
  parts.push(part(G.cyl8, '#ff8a5c', { p: [0, 0.575, sz + 0.05], r: [Math.PI / 2, 0, 0], s: [0.15, 0.025, 0.045] }));
  return combine(parts);
}

// ---------------------------------------------------------------------------------------------
export function createHatRack({ scene, players, quests, sync, particles, sfx = null, hud = null, floatLabel = null }) {
  const snd = (name, opts) => { if (sfx) sfx.play(name, opts); };
  const rx = HAT_RACK.x, rz = HAT_RACK.z;
  const ground = getHeight(rx, rz);
  const facing = Math.atan2(SPAWN.x - rx, SPAWN.z - rz);          // face the spawn and default camera

  let preview = null;                     // debug override of the unlocked count
  let built = false;                      // the rack exists (mesh + collider + interactable)
  let group = null, rackMesh = null, hatsMesh = null, collider = null, interactable = null;
  let hatsShown = 0;                      // hats currently merged into hatsMesh
  let target = 0;                         // hats that should be on the rack (including one that is still popping)
  let popT = -1;                          // rack pop-in clock (s), -1 = not popping
  let peg = null;                         // { i, group, t } the newest hat popping onto its peg (t < 0: waiting)
  let initialised = false;
  let time = 0;
  const lastTry = new WeakMap();          // Player -> time of its last try-on
  const restored = new WeakSet();         // Players whose saved hat was applied already
  let prevUnlocked = 0;

  const prefs = loadPrefs();
  let lastFeasts = quests.feasts;
  let toastToken = 0;

  const known = () => preview !== null || !sync.isReplica || sync.status === 'synced';   // a replica's feast count is only real after the host's snapshot
  const unlocked = () => (preview !== null ? preview : unlockedCount(quests.feasts));
  const order = () => quests.hatOrder;
  const hatName = (i) => (i >= 0 && HATS[i] ? HATS[i].name : 'Beanie');

  // ---- displayed hats: small merged copies on the pegs
  function hatGeometries(i, out) {
    const spot = pegSpot(i);
    const model = HATS[order()[i]].build(DISPLAY_SCHEME);
    const holder = new THREE.Group();
    holder.position.set(spot.tipX, spot.tipY + 0.1, spot.tipZ);
    holder.rotation.y = spot.yaw;
    holder.scale.setScalar(HAT_SCALE);
    holder.add(model);
    holder.updateMatrixWorld(true);
    model.traverse((m) => { if (m.isMesh) out.push(m.geometry.clone().applyMatrix4(m.matrixWorld)); });
    model.userData.dispose();
  }

  function rebuildHats(count) {
    if (hatsMesh) { hatsMesh.removeFromParent(); hatsMesh.geometry.dispose(); hatsMesh = null; }
    hatsShown = count;
    if (count <= 0) return;
    const geos = [];
    for (let i = 0; i < count; i++) hatGeometries(i, geos);
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) { console.warn('[hatRack] hat geometries could not be merged'); return; }
    hatsMesh = castMesh(merged, hatMaterial());
    hatsMesh.name = 'hatrack-hats';
    hatsMesh.receiveShadow = true;
    group.add(hatsMesh);
  }

  function startPegPop(i, delay) {
    const model = HATS[order()[i]].build(DISPLAY_SCHEME);
    const spot = pegSpot(i);
    const holder = new THREE.Group();
    holder.name = 'hatrack-pop';
    holder.position.set(spot.tipX, spot.tipY + 0.1, spot.tipZ);
    holder.rotation.y = spot.yaw;
    holder.scale.setScalar(0.001);
    holder.visible = false;
    holder.add(model);
    group.add(holder);
    peg = { i, group: holder, model, t: -delay, spot, sparked: false };
  }

  function endPegPop() {
    if (!peg) return;
    peg.group.removeFromParent();
    peg.model.userData.dispose();
    peg = null;
  }

  const cosF = Math.cos(facing), sinF = Math.sin(facing);
  /** Rack-local point -> world (the rack is only scaled and yawed). */
  const worldOf = (lx, ly, lz) => ({
    x: rx + (lx * cosF + lz * sinF) * RACK_SCALE, y: ground + ly * RACK_SCALE, z: rz + (-lx * sinF + lz * cosF) * RACK_SCALE,
  });

  // ---- show / hide the rack itself
  function show(live) {
    if (!built) {
      group = new THREE.Group();
      group.name = 'hatrack';
      group.position.set(rx, ground, rz);
      group.rotation.y = facing;
      group.scale.setScalar(RACK_SCALE);
      const geo = buildRackGeometry();
      rackMesh = new THREE.Mesh(geo, VERTEX_TOON);
      rackMesh.name = 'hatrack-stand';
      rackMesh.castShadow = true;
      rackMesh.receiveShadow = true;
      rackMesh.add(makeOutline(geo, 0.045));
      group.add(rackMesh);
      scene.add(group);
      built = true;
    }
    group.visible = true;
    if (!collider) collider = addCollider({ x: rx, z: rz, r: HAT_RACK.radius, owner: group });
    if (!interactable) {
      interactable = addInteractable({
        type: 'hatrack', object: null, position: new THREE.Vector3(rx, ground, rz), radius: HAT_RACK.radius, prompt: 'Try on a hat',
        onInteract: (item, by) => cycle(by || players.p1),
      });
    }
    if (live) {
      popT = 0;
      group.scale.set(1.4 * RACK_SCALE, 0.001, 1.4 * RACK_SCALE);
      snd('cooked', { pitch: 1.1 });
      const c = worldOf(0, 0.2, 0);
      particles.burst('puff', c, { count: 14, radius: 0.9, ring: true, height: 0.2, speed: 1.2 });
      particles.burst('sparkle', worldOf(0, 1.2, 0), { count: 10, radius: 0.8, height: 0.8 });
    } else {
      popT = -1;
      group.scale.setScalar(RACK_SCALE);
    }
  }

  function hide() {
    if (!built || !group.visible) return;
    endPegPop();
    group.visible = false;
    popT = -1;
    if (collider) { removeCollider(collider); collider = null; }
    if (interactable) { removeInteractable(interactable); interactable = null; }
    if (hatsMesh) { hatsMesh.removeFromParent(); hatsMesh.geometry.dispose(); hatsMesh = null; }
    hatsShown = 0;
    target = 0;
  }

  /** Make the rack match the unlocked count. `live` = a change that happens in front of the player (pop / sparkles); false on load. */
  function refresh(live) {
    if (!known()) return;
    const count = unlocked();
    if (count < 1) { hide(); initialised = true; return; }
    const wasVisible = built && group.visible;
    if (!wasVisible) show(live && initialised);
    const popIn = !wasVisible && live && initialised;
    if (count === target && wasVisible) { initialised = true; return; }
    const increased = count > target;
    target = count;
    endPegPop();
    if (increased && live && initialised) {
      rebuildHats(count - 1);                                   // the newest hat pops onto its peg on its own
      startPegPop(count - 1, popIn ? PEG_POP_DELAY : 0);
    } else {
      rebuildHats(count);
    }
    initialised = true;
  }

  // ---- wearing
  /** Restore each player's saved hat once (silently), forget saved hats beyond the real unlock count, and take hats off that are no longer unlocked. */
  function applyPrefs() {
    if (!known()) return;
    const u = unlocked();
    if (preview === null) {                                      // forget saved hats beyond the real unlock count (?newgame)
      let dirty = false;
      for (const k of Object.keys(prefs)) if (clampHat(prefs[k], u, order()) < 0) { delete prefs[k]; dirty = true; }
      if (dirty) savePrefs(prefs);
    }
    for (const p of players.list) {
      if (!restored.has(p)) {
        restored.add(p);
        const want = clampHat(prefs[String(p.index)], u, order());
        if (p.hatIndex !== want) p.wearHat(want);
      } else if (u < prevUnlocked && clampHat(p.hatIndex, u, order()) < 0) p.wearHat(-1);
    }
    prevUnlocked = u;
  }

  function wear(p, i, fx = true) {
    const idx = clampHat(i, MAX_HATS);                            // (the rack's own range check is the unlocked count in cycle())
    p.wearHat(idx);
    if (preview === null) {
      if (idx >= 0) prefs[String(p.index)] = idx; else delete prefs[String(p.index)];
      savePrefs(prefs);
    }
    if (!fx) return;
    p.hop();
    const head = { x: p.position.x, y: p.position.y + 1.55, z: p.position.z };
    particles.burst('puff', head, { count: 7, radius: 0.4, height: 0.15 });
    particles.burst('sparkle', head, { count: 5, radius: 0.5, height: 0.3 });
    snd('equip', { pitch: idx >= 0 ? 1.0 + idx * 0.03 : 0.85 });
    if (floatLabel) floatLabel(hatName(idx), { x: p.position.x, y: p.position.y + 2.3, z: p.position.z }, p, HAT_SVG);
  }

  function cycle(p) {
    if (!p) return false;
    if (time - (lastTry.get(p) ?? -10) < TRY_COOLDOWN) return false;
    lastTry.set(p, time);
    wear(p, nextHat(p.hatIndex, unlocked(), order()), true);
    return true;
  }

  // ---- reward toast (every screen reacts to the synced feast count)
  quests.on('change', () => {
    const feasts = quests.feasts;
    const before = lastFeasts;
    lastFeasts = feasts;
    refresh(true);
    applyPrefs();
    if (preview === null && feasts === before + 1 && feasts >= 1 && feasts <= MAX_HATS && hud) {
      // a replica's first snapshot also lands here (0 -> N): the sync 'snapshot' event fires right after and cancels it
      const token = ++toastToken;
      queueMicrotask(() => {
        if (token !== toastToken) return;
        hud.toast(`New hat on the rack: ${HATS[order()[feasts - 1]].name}!`, { icon: 'hat', duration: 3600 });
      });
    }
  });
  sync.on('snapshot', () => { toastToken++; lastFeasts = quests.feasts; refresh(false); applyPrefs(); });
  players.on('join', () => applyPrefs());

  // ---- per frame
  function update(dt) {
    time += dt;
    if (popT >= 0 && group) {
      popT += dt;
      const t = popT;
      if (t >= POP_TIME) { popT = -1; group.scale.setScalar(RACK_SCALE); }
      else {
        const ky = 1 - Math.exp(-5 * t) * Math.cos(16 * t);       // 0 -> overshoot -> 1
        const kxz = 1 + 0.4 * (1 - ky) * Math.exp(-3 * t);
        group.scale.set(kxz * RACK_SCALE, Math.max(0.001, ky) * RACK_SCALE, kxz * RACK_SCALE);
      }
    }
    if (peg) {
      peg.t += dt;
      if (peg.t >= 0) {
        peg.group.visible = true;
        if (!peg.sparked) {
          peg.sparked = true;
          snd('equip', { pitch: 1.25, vol: 0.8 });
          const s = peg.spot;
          particles.burst('sparkle', worldOf(s.tipX, s.tipY + 0.3, s.tipZ), { count: 8, radius: 0.35, height: 0.3 });
        }
        const u = clamp01(peg.t / PEG_POP_TIME);
        const k = u >= 1 ? 1 : 1 - Math.exp(-6 * u) * Math.cos(15 * u);
        peg.group.scale.set(HAT_SCALE * (1 + 0.35 * (1 - k)), HAT_SCALE * Math.max(0.001, k), HAT_SCALE * (1 + 0.35 * (1 - k)));
        if (u >= 1) {
          peg.group.scale.setScalar(HAT_SCALE);
          const n = target;
          endPegPop();
          rebuildHats(n);
        }
      }
    }
  }

  // the first evaluation: a host knows its feast count right away; a replica waits for the snapshot (known())
  refresh(false);
  applyPrefs();

  return {
    update,
    cycle,
    wear,
    get unlocked() { return unlocked(); },
    get built() { return built && group.visible; },
    get group() { return group; },
    position: new THREE.Vector3(rx, ground, rz),
    preview(n) {
      preview = n === null || n === undefined ? null : unlockedCount(n);
      refresh(true);
      applyPrefs();
      return unlocked();
    },
    summary() {
      let calls = 0, shadows = 0;
      if (group && group.visible) group.traverse((o) => { if (o.isMesh && o.visible) { calls++; if (o.castShadow) shadows++; } });
      const worn = {};
      for (const p of players.list) worn[p.index] = p.hatIndex;
      return {
        shown: built && group.visible, unlocked: unlocked(), feasts: quests.feasts, preview, target, hatsShown, popping: popT >= 0, pegPop: peg ? peg.i : -1,
        position: { x: rx, y: ground, z: rz }, collider: !!collider, interactable: !!interactable, drawCalls: calls + shadows,
        hats: order().slice(0, hatsShown).map((i) => HATS[i].name), worn, saved: { ...prefs },
      };
    },
  };
}
