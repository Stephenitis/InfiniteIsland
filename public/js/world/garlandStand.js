// Garden-hearth garland rewards, bamboo stand and per-screen worn preferences. Shared unlocks are host-authoritative.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ISLANDS } from '../config.js';
import { getHeight } from './terrain.js';
import { addCollider, removeCollider } from './colliders.js';
import { addInteractable, removeInteractable } from './interactables.js';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../render/geo.js';
import { castMesh } from '../player/character.js';
import { GARLANDS } from '../player/garlands.js';
import { gardenReserved, gardenCentre } from './islands/emberGarden.js';
import { getIslandModule } from './islands/registry.js';
import { garlandMaterial } from '../player/garlands.js';
import { emberSave } from '../game/emberSave.js';
import { GARLAND_ICONS } from '../ui/icons.js';
import {
  GARLAND_COUNT, bloomCounts, qualifyingGarlands, newUnlocks, mergeUnlocked, normaliseUnlocked, clampGarland, nextGarland, parseGarlandPrefs,
} from '../game/garlandLogic.js';

export const STORAGE_KEY = 'infiniteIsland.garlands';
const FIRE_ID = 'ember';
const SAVE_KEY = 'garlands';
const POP_TIME = 0.9;                   // s, the stand's squash-and-stretch
const TRY_COOLDOWN = 0.35;              // s, per player
const garlandName = (i) => (i >= 0 && GARLANDS[i] ? GARLANDS[i].name : 'No garland');

function loadPrefs() {
  try { return parseGarlandPrefs(localStorage.getItem(STORAGE_KEY)); } catch { return {}; }
}
function savePrefs(prefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* private mode / storage off: the choice just is not remembered */ }
}

// Bamboo display frame: one mesh and its outline.
function buildStandGeometry() {
  const parts = [];
  for (const x of [-0.72, 0.72]) {
    parts.push(part(G.cyl8, '#cdb461', {p:[x,1.05,0],s:[0.09,2.1,0.09]}));
    parts.push(part(G.cyl8, '#8eab54', {p:[x,0.15,0],s:[0.13,0.3,0.13]}));
  }
  for (const y of [0.7,1.25,1.85]) parts.push(part(G.cyl8,'#e2cc7e',{p:[0,y,0],r:[0,0,Math.PI/2],s:[0.075,1.65,0.075]}));
  return combine(parts);
}

// ---------------------------------------------------------------------------------------------
export function createGarlandStand({ scene, players, garden, sync, world = null, particles, sfx = null, hud = null, floatLabel = null }) {
  const snd = (name, opts) => { if (sfx) sfx.play(name, opts); };
  const island = ISLANDS.find((i) => i.id === 'ember');
  const spot = gardenReserved(island, getIslandModule('ember')).garland;
  const ground = getHeight(spot.x, spot.z);

  let unlocked = sync.isReplica ? [] : normaliseUnlocked(emberSave.read()[SAVE_KEY]);
  let knownList = !sync.isReplica;               // a replica's list is only real after the host's snapshot
  let built = false, group = null, frame = null, garlandsMesh = null, collider = null, interactable = null;
  let garlandsShown = null;                         // the key of the set merged into garlandsMesh
  let popT = -1;
  let time = 0;
  let evaluatedFeast = 0;                        // the last feast number the host evaluated (idempotence)
  const lastTry = new WeakMap();
  const restored = new WeakSet();
  const prefs = loadPrefs();
  let reveal = null;                             // { n, garlands } the latest unlock event (a banner built after it still fills)
  const bannerNodes = new Map();                 // feast n -> [DOM nodes waiting for the result]
  let initialised = false;
  let prevCount = 0;
  const known = () => knownList;

  // turn the stand half way from the default camera (+Z) toward the plaza fire: it reads from both
  const fire = gardenCentre(island);
  const yaw = Math.atan2(fire.x - spot.x, fire.z - spot.z) * 0.5;       // half way between the camera (+Z) and the fire: reads from both

  const save = () => emberSave.set(SAVE_KEY, [...unlocked]);

  // Display all unlocked garlands on three rails.
  function garlandGeometries(i, out) {
    const model = GARLANDS[i].build();
    const holder = new THREE.Group();
    const col = Math.floor(i / 3), row = i % 3;
    holder.position.set((col - 3.5) * 0.19, 0.7 + row * 0.55, 0.13);
    holder.rotation.x = Math.PI / 2;
    holder.scale.setScalar(0.27);
    holder.add(model);
    holder.updateMatrixWorld(true);
    model.traverse((m) => { if (m.isMesh) out.push(m.geometry.clone().applyMatrix4(m.matrixWorld)); });
    model.userData.dispose();
  }

  function rebuildGarlands() {
    const key = unlocked.join(',');
    if (key === garlandsShown) return;
    garlandsShown = key;
    if (garlandsMesh) { garlandsMesh.removeFromParent(); garlandsMesh.geometry.dispose(); garlandsMesh = null; }
    if (!unlocked.length || !group) return;
    const geos = [];
    for (const i of unlocked) garlandGeometries(i, geos);
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) { console.warn('[garlandStand] garland geometries could not be merged'); return; }
    garlandsMesh = castMesh(merged, garlandMaterial(), false);
    garlandsMesh.name = 'garlandstand-garlands';
    garlandsMesh.frustumCulled = true;
    group.add(garlandsMesh);
  }

  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  const worldOf = (lx, ly, lz) => ({ x: spot.x + lx * cosY + lz * sinY, y: ground + ly, z: spot.z - lx * sinY + lz * cosY });

  function show(live) {
    if (!built) {
      group = new THREE.Group();
      group.name = 'garlandstand';
      group.position.set(spot.x, ground, spot.z);
      group.rotation.y = yaw;
      const geo = buildStandGeometry();
      frame = new THREE.Mesh(geo, VERTEX_TOON);
      frame.name = 'garlandstand-frame';
      frame.castShadow = false;
      frame.receiveShadow = true;
      frame.add(makeOutline(geo, 0.04));
      group.add(frame);
      scene.add(group);
      built = true;
    }
    group.visible = true;
    if (!collider) collider = addCollider({ x: spot.x, z: spot.z, r: 0.8, owner: group });
    if (!interactable) {
      interactable = addInteractable({
        type: 'garlandstand', object: null, position: new THREE.Vector3(spot.x, ground, spot.z), radius: 0.85, prompt: 'Try on a garland',
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
    if (garlandsMesh) { garlandsMesh.removeFromParent(); garlandsMesh.geometry.dispose(); garlandsMesh = null; }
    garlandsShown = null;
  }

  /** Make the stand match the unlocked list. `live` = a change that happens in front of the player (pop / sparkles); false on load. */
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
    rebuildGarlands();
    prevCount = unlocked.length;
    initialised = true;
  }

  // ---- wearing
  function applyPrefs() {
    if (!known()) return;
    for (const k of Object.keys(prefs)) {
      if (clampGarland(prefs[k], unlocked) < 0) { delete prefs[k]; savePrefs(prefs); }     // forget stale choices (?newgame)
    }
    for (const p of players.list) {
      if (p.bot) continue;                                    // (a party bot wears its own ears and brings no pet: Step 80a)
      if (!restored.has(p)) {
        restored.add(p);
        const want = clampGarland(prefs[String(p.index)], unlocked);
        if (p.garlandIndex !== want) p.wearGarland(want);
      } else if (clampGarland(p.garlandIndex, unlocked) < 0 && p.garlandIndex >= 0) p.wearGarland(-1);
    }
  }

  function wear(p, i, fx = true) {
    const idx = Number.isInteger(i) && i >= 0 && i < GARLAND_COUNT ? i : -1;
    if (!p) return;
    p.wearGarland(idx);
    if (idx >= 0) prefs[String(p.index)] = idx; else delete prefs[String(p.index)];
    savePrefs(prefs);
    if (!fx) return;
    p.hop();
    const back = { x: p.position.x, y: p.position.y + 0.9, z: p.position.z };
    particles.burst('puff', back, { count: 7, radius: 0.45, height: 0.15 });
    particles.burst('sparkle', back, { count: 5, radius: 0.5, height: 0.3 });
    snd('equip', { pitch: idx >= 0 ? 0.95 + (idx % 6) * 0.05 : 0.85 });
    if (floatLabel) floatLabel(garlandName(idx), { x: p.position.x, y: p.position.y + 2.3, z: p.position.z }, p, idx >= 0 ? GARLAND_ICONS[GARLANDS[idx].id] : undefined);
  }

  function cycle(p) {
    if (!p) return false;
    if (time - (lastTry.get(p) ?? -10) < TRY_COOLDOWN) return false;
    lastTry.set(p, time);
    wear(p, nextGarland(p.garlandIndex, unlocked), true);
    return true;
  }

  // ---- unlocks
  function evaluate() {
    const counts = bloomCounts(garden.state.plots);
    const stage = garden.state.stage;
    const qualifying = qualifyingGarlands({ counts, stage });
    return { counts, stage, qualifying, fresh: newUnlocks(unlocked, qualifying) };
  }

  /** Every screen: the reveal of one feast's unlocks (toast + banner line), after the list changed. */
  function showReveal(n, list) {
    reveal = { n, garlands: list };
    for (const node of bannerNodes.get(n) || []) fillNode(node, list);
    if (!list.length || !hud) return;
    if (list.length === 1) hud.toast(`New garland: ${GARLANDS[list[0]].name}!`, { icon: GARLAND_ICONS[GARLANDS[list[0]].id], duration: 4200 });
    else hud.toast(`${list.length} new garlands!`, { icon: GARLAND_ICONS[GARLANDS[list[0]].id], duration: 4200 });
    snd('jingle', { pitch: 1.15, vol: 0.6 });
  }

  function applyUnlock(d) {
    const list = normaliseUnlocked(d && d.garlands);
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
    const data = { n, garlands: fresh, unlocked: mergeUnlocked(unlocked, fresh) };
    applyUnlock(data);
    sync.emit('garlands', 'unlock', data);
    return fresh;
  }

  function showSilently(list) {
    unlocked = normaliseUnlocked(list);
    knownList = true;
    popT = -1;
    group?.scale.setScalar(1);
    refresh(false);
    applyPrefs();
  }

  sync.register('garlands', {
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
        sync.emit('garlands', 'set', { unlocked: [...unlocked] });
        return true;
      }
      return { reject: 'unknown-kind' };
    },
  });
  players.on('join', () => applyPrefs());

  // ---- the banner's garland line (feast scene): hidden until this feast's result is known
  function fillNode(node, list) {
    node.innerHTML = '';
    if (!list.length) { node.style.display = 'none'; return; }
    const chip = document.createElement('div');
    chip.className = 'fb-hat fb-garland-line';
    if (list.length === 1) chip.innerHTML = `<span class="fb-hat-ic">${GARLAND_ICONS[GARLANDS[list[0]].id]}</span><span>New garland: ${GARLANDS[list[0]].name}!</span>`;
    else chip.innerHTML = `<span>${list.length} new garlands!</span>`;
    node.appendChild(chip);
    if (list.length > 1) {
      const row = document.createElement('div');
      row.className = 'fb-tail-row';
      const step = Math.min(0.25, 1.5 / list.length);
      list.slice(0, GARLAND_COUNT).forEach((i, k) => {
        const ic = document.createElement('span');
        ic.className = 'fb-tail-ic';
        ic.style.animationDelay = `${(2.2 + k * step).toFixed(2)}s`;
        ic.innerHTML = GARLAND_ICONS[GARLANDS[i].id];
        row.appendChild(ic);
      });
      node.appendChild(row);
    }
    node.style.display = '';
  }

  /** Seconds the feast scene stays on after its normal end so the banner can show feast n's garland reveal (0 when nothing unlocked / not known yet). */
  function bannerHold(n) {
    if (!reveal || reveal.n !== n || !reveal.garlands.length) return 0;
    const k = Math.min(GARLAND_COUNT, reveal.garlands.length);
    return k === 1 ? 1.0 : 1.5 + Math.min(0.25, 1.5 / k) * k;
  }

  function bannerNode(n) {
    const node = document.createElement('div');
    node.className = 'fb-garlands';
    node.style.display = 'none';
    if (reveal && reveal.n === n) fillNode(node, reveal.garlands);
    else { const l = bannerNodes.get(n) || []; l.push(node); bannerNodes.set(n, l); if (bannerNodes.size > 4) bannerNodes.delete(bannerNodes.keys().next().value); }
    return node;
  }

  // ---- per frame
  function update(dt) {
    time += dt;
    if (built && group.visible && world) group.visible = world.regions.isFull('ember') && unlocked.length > 0;
    else if (built && !group.visible && world && unlocked.length && world.regions.isFull('ember')) group.visible = true;
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
  const debugSet = (list) => sync.request('garlands', 'debugSet', { unlocked: list }, hostActor());

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
      for (const p of players.list) worn[p.index] = p.garlandIndex;
      return {
        shown: built && group.visible, unlocked: [...unlocked], names: unlocked.map(garlandName), garlandsShown, popping: popT >= 0, position: { x: +spot.x.toFixed(2), y: +ground.toFixed(2), z: +spot.z.toFixed(2) },
        collider: !!collider, interactable: !!interactable, drawCalls: group && group.visible ? calls : 0, worn, saved: { ...prefs }, evaluatedFeast,
      };
    },
    debug: {
      unlock: (list) => debugSet(mergeUnlocked(unlocked, Array.isArray(list) ? list : [list])),
      unlockAll: () => debugSet(Array.from({ length: GARLAND_COUNT }, (_, i) => i)),
      reset: () => debugSet([]),
    },
  };
}
