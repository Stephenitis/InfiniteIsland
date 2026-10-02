// The tail stump and the tail unlocks (PLAN Step 36b): a carved hollow stump at the Frostpine camp that shows the unlocked tails (player/tails.js) peeking out of it and lets
// any player try them on. Also owns the unlock rule's host side, the `tails` sync domain, the saving, the banner / toast reveal and the "what does each local player wear" bookkeeping.
//
//   const tails = createTailStump({ scene, players, critters, camp, sync, world, particles, sfx, hud, floatLabel })     once at load, on every screen (after createCritters / createFrostCamp)
//   tails.update(dt)                    once per tick (pop-in animation, shown only while Frostpine is drawn)
//   tails.onFeastEnd({ n, fireId })     HOST (the feast scene calls it once per feast; a no-op on a replica or when the feast was not held at the Frostpine camp fire): evaluate the unlock
//                                       rule NOW (critters living at the camp per species + camp comfort), unlock every qualifying tail not unlocked yet, save and emit ONE event
//   tails.bannerNode(n)                 the feast banner's tail line for feast number n: an (initially empty / hidden) DOM node every screen fills when the unlock event of that feast arrives
//   tails.cycle(player)                 the stump's action: the next unlocked tail (none -> tails -> none) with hop + poof + sfx + name label
//   tails.wear(player, i, fx)           put on tail i (-1 = none); fx false = silent (restoring a saved choice); the choice is saved per screen
//   tails.unlocked                      sorted TAILS indices unlocked so far (a copy)
//   tails.evaluate()                    { counts, comfort, qualifying, fresh } what the rule gives right now (pure read; nothing is unlocked)
//   tails.summary()                     debug snapshot;  tails.debug.{ unlock(list), unlockAll(), reset() }
//
// Domain 'tails' (host-authoritative). State = the sorted list of unlocked TAILS indices, saved by the host as the `tails` key of 'infinite-island.frostpine.v1' (game/frostSave.js, shared with
// the critters and the camp, whose keys it never drops). ?newgame wipes it; replicas never save. The unlock rule is the pure game/tailLogic.js, evaluated at the END of a feast held at the
// Frostpine camp fire (the scene calls onFeastEnd at the banner moment, ~2 s before the camera lets go, so the banner can show the result; a skipped feast evaluates when it is skipped):
//   Event unlock {n, tails: [new indices], unlocked: [all]}   once per feast that brought something, to every screen (host included): applies the list, then the reveal on EVERY screen: a toast
//                       (one tail: "New tail: Fox Tail!", several: "4 new tails!"), the banner line (+ a row of icons popping in ~0.25 s apart) and the stump (pops in with the first tail,
//                       otherwise sparkles). A replica waits for the event: no optimistic visuals. Evaluation is idempotent per feast number and the set only grows, so two feasts that end close
//                       together can never duplicate or lose a tail.
//   Event set {unlocked}   debug: replace the list silently.     Snapshot = the list (a late joiner / reload shows the stump and tails at once, no fanfare).     hashView = the list.
//
// The stump itself does NOT exist before the first tail unlocks (no mesh, collider or interactable); then it pops in (squash and stretch + poof + jingle live, simply there on load / late join).
// The unlocked tails sit in it as small merged copies: ONE mesh with no shadow, rebuilt only when the unlocked set changes. Whole stump: 3 draw calls (trunk + outline + shadow) + 1 (tails) = 4.
// It only draws while Frostpine is in full detail (world.regions), like the critters.
//
// Wearing is per player and per screen (never assumes P1); player.tailIndex / player.wearTail(i) hold the model, the pose packets carry the id to the other screens (net/avatars.js).
// Choices are saved per screen under localStorage 'infiniteIsland.tails' = { slotIndex: tailIndex } (hosts and replicas alike; a cosmetic preference, not game state) and re-applied when a
// player (re)joins. A saved tail that is not unlocked falls back to none, and the stale entry is forgotten once the real list is known (e.g. after ?newgame).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ISLANDS } from '../config.js';
import { getHeight } from './terrain.js';
import { addCollider, removeCollider } from './colliders.js';
import { addInteractable, removeInteractable } from './interactables.js';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../render/geo.js';
import { castMesh, hatMaterial } from '../player/character.js';
import { TAILS } from '../player/tails.js';
import { campReserved, campCentre } from './islands/frostCamp.js';
import { frostSave } from '../game/frostSave.js';
import { TAIL_ICONS } from '../ui/icons.js';
import {
  TAIL_COUNT, speciesCounts, qualifyingTails, newUnlocks, mergeUnlocked, normaliseUnlocked, clampTail, nextTail, parseTailPrefs,
} from '../game/tailLogic.js';

export const STORAGE_KEY = 'infiniteIsland.tails';
const FIRE_ID = 'frost';
const SAVE_KEY = 'tails';
const POP_TIME = 0.9;                   // s, the stump's squash-and-stretch
const TRY_COOLDOWN = 0.35;              // s, per player
const SHOW_SCALE = 0.62;                // displayed tails are smaller copies of the worn models
const RING_R = 0.24;                    // where the tails come out of the hollow
const HOLLOW_Y = 0.74;
const FRONT = Math.PI / 2;              // angle (x = cos, z = sin) that points at the default camera (+Z)
const ANGLES = [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180];   // ring slots, front first
// Where each tail sits in the ring: the four level 1 tails take the four front slots, then the level 2 ones, then the rainbow ones (slot = (i % 3) * 4 + floor(i / 3)).
const slotOf = (i) => (i % 3) * 4 + Math.floor(i / 3);

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const tailName = (i) => (i >= 0 && TAILS[i] ? TAILS[i].name : 'No tail');

function loadPrefs() {
  try { return parseTailPrefs(localStorage.getItem(STORAGE_KEY)); } catch { return {}; }
}
function savePrefs(prefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* private mode / storage off: the choice just is not remembered */ }
}

// ---- the stump: an upright hollow trunk with a dark inside, a few roots and a little carved plaque; ONE merged vertex-coloured mesh (+ smoothed outline)
function buildStumpGeometry() {
  const bark = '#9a6a3f', barkDark = '#6f4a2c', barkLight = '#bd8a55', ring = '#d9a96a', inside = '#3a2a3d', cream = '#f2cf96';
  const parts = [];
  parts.push(part(G.cyl8, barkDark, { p: [0, 0.18, 0], s: [0.8, 0.46, 0.8] }));                       // the flared foot
  parts.push(part(G.cyl8, bark, { p: [0, 0.5, 0], s: [0.64, 0.95, 0.64] }));                          // the trunk
  for (let k = 0; k < 5; k++) {                                                                      // roots
    const a = k * 1.26 + 0.3;
    parts.push(part(G.sphere, barkDark, { p: [Math.cos(a) * 0.74, 0.1, Math.sin(a) * 0.74], r: [0, -a, 0], s: [0.3, 0.12, 0.13] }));
  }
  parts.push(part(G.cyl8, barkLight, { p: [0, 0.97, 0], s: [0.7, 0.1, 0.7] }));                       // the rim (a bit wider)
  parts.push(part(G.cyl8, ring, { p: [0, 1.02, 0], s: [0.58, 0.04, 0.58] }));
  parts.push(part(G.cyl8, inside, { p: [0, 1.045, 0], s: [0.47, 0.03, 0.47] }));                      // the dark hollow
  // carved plaque on the front with a little swoosh of tail
  parts.push(part(G.cyl8, cream, { p: [0, 0.55, 0.63], r: [Math.PI / 2, 0, 0], s: [0.24, 0.05, 0.2] }));
  parts.push(part(G.sphere, '#f27d2a', { p: [0, 0.58, 0.67], s: [0.09, 0.07, 0.03] }));
  parts.push(part(G.sphere, '#fff6ea', { p: [0.06, 0.64, 0.665], s: [0.045, 0.035, 0.025] }));
  return combine(parts);
}

// ---------------------------------------------------------------------------------------------
export function createTailStump({ scene, players, critters, camp, sync, world = null, particles, sfx = null, hud = null, floatLabel = null }) {
  const snd = (name, opts) => { if (sfx) sfx.play(name, opts); };
  const island = ISLANDS.find((i) => i.id === 'frost');
  const spot = campReserved(island).tailStump;
  const ground = getHeight(spot.x, spot.z);

  let unlocked = sync.isReplica ? [] : normaliseUnlocked(frostSave.read()[SAVE_KEY]);
  let knownList = !sync.isReplica;               // a replica's list is only real after the host's snapshot
  let built = false, group = null, trunk = null, tailsMesh = null, collider = null, interactable = null;
  let tailsShown = null;                         // the key of the set merged into tailsMesh
  let popT = -1;
  let time = 0;
  let evaluatedFeast = 0;                        // the last feast number the host evaluated (idempotence)
  const lastTry = new WeakMap();
  const restored = new WeakSet();
  const prefs = loadPrefs();
  let reveal = null;                             // { n, tails } the latest unlock event (a banner built after it still fills)
  const bannerNodes = new Map();                 // feast n -> [DOM nodes waiting for the result]
  let initialised = false;
  let prevCount = 0;
  const known = () => knownList;

  // turn the stump half way from the default camera (+Z) toward the plaza fire: it reads from both
  const fire = campCentre(island);
  const yaw = Math.atan2(fire.x - spot.x, fire.z - spot.z) * 0.5;       // half way between the camera (+Z) and the fire: reads from both

  const save = () => frostSave.set(SAVE_KEY, [...unlocked]);

  // ---- the displayed tails: small merged copies in the hollow
  function tailGeometries(i, out) {
    const model = TAILS[i].build();
    const k = slotOf(i);
    const a = FRONT + THREE.MathUtils.degToRad(ANGLES[k]);
    const holder = new THREE.Group();
    holder.rotation.order = 'YXZ';
    holder.position.set(Math.cos(a) * RING_R, HOLLOW_Y, Math.sin(a) * RING_R);
    holder.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));          // the tail extends toward -Z: turn that outward
    holder.rotation.x = -0.1 + (k % 2) * 0.22;                          // lean out, alternating a little so neighbours do not overlap
    holder.scale.setScalar(SHOW_SCALE);
    holder.add(model);
    holder.updateMatrixWorld(true);
    model.traverse((m) => { if (m.isMesh) out.push(m.geometry.clone().applyMatrix4(m.matrixWorld)); });
    model.userData.dispose();
  }

  function rebuildTails() {
    const key = unlocked.join(',');
    if (key === tailsShown) return;
    tailsShown = key;
    if (tailsMesh) { tailsMesh.removeFromParent(); tailsMesh.geometry.dispose(); tailsMesh = null; }
    if (!unlocked.length || !group) return;
    const geos = [];
    for (const i of unlocked) tailGeometries(i, geos);
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) { console.warn('[tailStump] tail geometries could not be merged'); return; }
    tailsMesh = castMesh(merged, hatMaterial(), false);
    tailsMesh.name = 'tailstump-tails';
    tailsMesh.frustumCulled = true;
    group.add(tailsMesh);
  }

  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  const worldOf = (lx, ly, lz) => ({ x: spot.x + lx * cosY + lz * sinY, y: ground + ly, z: spot.z - lx * sinY + lz * cosY });

  function show(live) {
    if (!built) {
      group = new THREE.Group();
      group.name = 'tailstump';
      group.position.set(spot.x, ground, spot.z);
      group.rotation.y = yaw;
      const geo = buildStumpGeometry();
      trunk = new THREE.Mesh(geo, VERTEX_TOON);
      trunk.name = 'tailstump-trunk';
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      trunk.add(makeOutline(geo, 0.04));
      group.add(trunk);
      scene.add(group);
      built = true;
    }
    group.visible = true;
    if (!collider) collider = addCollider({ x: spot.x, z: spot.z, r: 0.78, owner: group });
    if (!interactable) {
      interactable = addInteractable({
        type: 'tailstump', object: null, position: new THREE.Vector3(spot.x, ground, spot.z), radius: 0.85, prompt: 'Try on a tail',
        onInteract: (item, by) => cycle(by || players.p1),
      });
    }
    if (live) {
      popT = 0;
      group.scale.set(1.4, 0.001, 1.4);
      snd('cooked', { pitch: 1.2 });
      particles.burst('puff', worldOf(0, 0.2, 0), { count: 12, radius: 0.9, ring: true, height: 0.2, speed: 1.2 });
      particles.burst('sparkle', worldOf(0, 1.1, 0), { count: 10, radius: 0.8, height: 0.8 });
    } else { popT = -1; group.scale.setScalar(1); }
  }

  function hide() {
    if (!built || !group.visible) return;
    group.visible = false;
    popT = -1;
    if (collider) { removeCollider(collider); collider = null; }
    if (interactable) { removeInteractable(interactable); interactable = null; }
    if (tailsMesh) { tailsMesh.removeFromParent(); tailsMesh.geometry.dispose(); tailsMesh = null; }
    tailsShown = null;
  }

  /** Make the stump match the unlocked list. `live` = a change that happens in front of the player (pop / sparkles); false on load. */
  function refresh(live) {
    if (!known()) return;
    if (!unlocked.length) { hide(); initialised = true; return; }
    const wasVisible = built && group.visible;
    const grew = unlocked.length > prevCount;
    if (!wasVisible) show(live && initialised);
    else if (live && initialised && grew) {
      particles.burst('sparkle', worldOf(0, 1.3, 0), { count: 12, radius: 0.7, height: 0.8 });
      snd('equip', { pitch: 1.25, vol: 0.8 });
    }
    rebuildTails();
    prevCount = unlocked.length;
    initialised = true;
  }

  // ---- wearing
  function applyPrefs() {
    if (!known()) return;
    for (const k of Object.keys(prefs)) {
      if (clampTail(prefs[k], unlocked) < 0) { delete prefs[k]; savePrefs(prefs); }     // forget stale choices (?newgame)
    }
    for (const p of players.list) {
      if (!restored.has(p)) {
        restored.add(p);
        const want = clampTail(prefs[String(p.index)], unlocked);
        if (p.tailIndex !== want) p.wearTail(want);
      } else if (clampTail(p.tailIndex, unlocked) < 0 && p.tailIndex >= 0) p.wearTail(-1);
    }
  }

  function wear(p, i, fx = true) {
    const idx = Number.isInteger(i) && i >= 0 && i < TAIL_COUNT ? i : -1;
    p.wearTail(idx);
    if (idx >= 0) prefs[String(p.index)] = idx; else delete prefs[String(p.index)];
    savePrefs(prefs);
    if (!fx) return;
    p.hop();
    const back = { x: p.position.x, y: p.position.y + 0.9, z: p.position.z };
    particles.burst('puff', back, { count: 7, radius: 0.45, height: 0.15 });
    particles.burst('sparkle', back, { count: 5, radius: 0.5, height: 0.3 });
    snd('equip', { pitch: idx >= 0 ? 0.95 + (idx % 6) * 0.05 : 0.85 });
    if (floatLabel) floatLabel(tailName(idx), { x: p.position.x, y: p.position.y + 2.3, z: p.position.z }, p, idx >= 0 ? TAIL_ICONS[TAILS[idx].id] : undefined);
  }

  function cycle(p) {
    if (!p) return false;
    if (time - (lastTry.get(p) ?? -10) < TRY_COOLDOWN) return false;
    lastTry.set(p, time);
    wear(p, nextTail(p.tailIndex, unlocked), true);
    return true;
  }

  // ---- unlocks
  function evaluate() {
    const counts = speciesCounts(critters.list.map((c) => ({ species: c.species, at: critters.state[c.id]?.at })));
    const qualifying = qualifyingTails({ counts, comfort: camp.comfort });
    return { counts, comfort: camp.comfort, qualifying, fresh: newUnlocks(unlocked, qualifying) };
  }

  /** Every screen: the reveal of one feast's unlocks (toast + banner line), after the list changed. */
  function showReveal(n, list) {
    reveal = { n, tails: list };
    for (const node of bannerNodes.get(n) || []) fillNode(node, list);
    if (!list.length || !hud) return;
    if (list.length === 1) hud.toast(`New tail: ${TAILS[list[0]].name}!`, { icon: TAIL_ICONS[TAILS[list[0]].id], duration: 4200 });
    else hud.toast(`${list.length} new tails!`, { icon: TAIL_ICONS[TAILS[list[0]].id], duration: 4200 });
    snd('jingle', { pitch: 1.15, vol: 0.6 });
  }

  function applyUnlock(d) {
    const list = normaliseUnlocked(d && d.tails);
    unlocked = mergeUnlocked(unlocked, d && d.unlocked ? d.unlocked : list);
    unlocked = mergeUnlocked(unlocked, list);
    save();
    refresh(true);
    applyPrefs();
    showReveal(d && Number.isInteger(d.n) ? d.n : 0, list);
  }

  function onFeastEnd({ n, fireId } = {}) {
    if (!sync.isHost || fireId !== FIRE_ID || !Number.isInteger(n) || n <= evaluatedFeast) return [];
    evaluatedFeast = n;
    const fresh = evaluate().fresh;
    if (!fresh.length) return [];
    const data = { n, tails: fresh, unlocked: mergeUnlocked(unlocked, fresh) };
    applyUnlock(data);
    sync.emit('tails', 'unlock', data);
    return fresh;
  }

  function showSilently(list) {
    unlocked = normaliseUnlocked(list);
    knownList = true;
    refresh(false);
    applyPrefs();
  }

  sync.register('tails', {
    snapshot: () => [...unlocked],
    hashView: () => [...unlocked],
    applySnapshot(s) { showSilently(s); },
    applyEvent(kind, d) {
      if (kind === 'unlock') applyUnlock(d);
      else if (kind === 'set') showSilently(d && d.unlocked);
    },
    handleRequest(kind, d, actor) {
      if (kind === 'debugSet' && !actor?.screen) return { reject: 'bad-request' };
      if (kind === 'debugSet') {
        showSilently(d && d.unlocked);
        save();
        sync.emit('tails', 'set', { unlocked: [...unlocked] });
        return true;
      }
      return { reject: 'unknown-kind' };
    },
  });
  players.on('join', () => applyPrefs());

  // ---- the banner's tail line (feast scene): hidden until this feast's result is known
  function fillNode(node, list) {
    node.innerHTML = '';
    if (!list.length) { node.style.display = 'none'; return; }
    const chip = document.createElement('div');
    chip.className = 'fb-hat fb-tail-line';
    if (list.length === 1) chip.innerHTML = `<span class="fb-hat-ic">${TAIL_ICONS[TAILS[list[0]].id]}</span><span>New tail: ${TAILS[list[0]].name}!</span>`;
    else chip.innerHTML = `<span>${list.length} new tails!</span>`;
    node.appendChild(chip);
    if (list.length > 1) {
      const row = document.createElement('div');
      row.className = 'fb-tail-row';
      const step = Math.min(0.25, 1.5 / list.length);
      list.slice(0, TAIL_COUNT).forEach((i, k) => {
        const ic = document.createElement('span');
        ic.className = 'fb-tail-ic';
        ic.style.animationDelay = `${(2.2 + k * step).toFixed(2)}s`;
        ic.innerHTML = TAIL_ICONS[TAILS[i].id];
        row.appendChild(ic);
      });
      node.appendChild(row);
    }
    node.style.display = '';
  }

  /** Seconds the feast scene stays on after its normal end so the banner can show feast n's tail reveal (0 when nothing unlocked / not known yet). */
  function bannerHold(n) {
    if (!reveal || reveal.n !== n || !reveal.tails.length) return 0;
    const k = Math.min(TAIL_COUNT, reveal.tails.length);
    return k === 1 ? 1.0 : 1.5 + Math.min(0.25, 1.5 / k) * k;
  }

  function bannerNode(n) {
    const node = document.createElement('div');
    node.className = 'fb-tails';
    node.style.display = 'none';
    if (reveal && reveal.n === n) fillNode(node, reveal.tails);
    else { const l = bannerNodes.get(n) || []; l.push(node); bannerNodes.set(n, l); if (bannerNodes.size > 4) bannerNodes.delete(bannerNodes.keys().next().value); }
    return node;
  }

  // ---- per frame
  function update(dt) {
    time += dt;
    if (built && group.visible && world) group.visible = world.regions.isFull('frost') && unlocked.length > 0;
    else if (built && !group.visible && world && unlocked.length && world.regions.isFull('frost')) group.visible = true;
    if (popT >= 0 && group) {
      popT += dt;
      if (popT >= POP_TIME) { popT = -1; group.scale.setScalar(1); }
      else {
        const ky = 1 - Math.exp(-5 * popT) * Math.cos(16 * popT);
        const kxz = 1 + 0.4 * (1 - ky) * Math.exp(-3 * popT);
        group.scale.set(kxz, Math.max(0.001, ky), kxz);
      }
    }
  }

  sync.on('snapshot', () => { knownList = true; reveal = null; refresh(false); applyPrefs(); });
  refresh(false);
  applyPrefs();

  const hostActor = () => (sync.isHost ? { screen: 'host', index: 0, pos: { x: 0, y: 0, z: 0 } } : null);
  const debugSet = (list) => sync.request('tails', 'debugSet', { unlocked: list }, hostActor());

  return {
    update,
    cycle,
    wear,
    onFeastEnd,
    bannerNode,
    bannerHold,
    evaluate,
    get unlocked() { return [...unlocked]; },
    get built() { return built && group.visible; },
    get group() { return group; },
    position: new THREE.Vector3(spot.x, ground, spot.z),
    summary() {
      let calls = 0;
      if (group && group.visible) group.traverse((o) => { if (o.isMesh && o.visible) calls += o.castShadow ? 2 : 1; });
      const worn = {};
      for (const p of players.list) worn[p.index] = p.tailIndex;
      return {
        shown: built && group.visible, unlocked: [...unlocked], names: unlocked.map(tailName), tailsShown, popping: popT >= 0, position: { x: +spot.x.toFixed(2), y: +ground.toFixed(2), z: +spot.z.toFixed(2) },
        collider: !!collider, interactable: !!interactable, drawCalls: group && group.visible ? calls : 0, worn, saved: { ...prefs }, evaluatedFeast,
      };
    },
    debug: {
      unlock: (list) => debugSet(mergeUnlocked(unlocked, Array.isArray(list) ? list : [list])),
      unlockAll: () => debugSet(Array.from({ length: TAIL_COUNT }, (_, i) => i)),
      reset: () => debugSet([]),
    },
  };
}
