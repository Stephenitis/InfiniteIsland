// The combat areas' sync domain (Wildroot Hollow today) and local combat input.
// Step 56: the domain runs whichever AREA is active (game/areaLogic.js; `state.areaId`, `.mode`, `.from`, `.section`, the section's objective `state.obj`):
//   * ways in: the ritual portal (stone code 1-1-1-3, then a menu of EVERY area in the registry with a Cleared mark from the combat save) and the Rootgate on the home
//     island (world/rootgate.js, after the first feast); both end in the whole-party confirm and the host request `enter {area, mode, from}`. `from` is stored in
//     the run: leaving through the homeward portal brings the party back to where they came in (the stones' circle or the gate). Every area has its own homeward
//     portal at `area.exit`.
//   * objectives: the host ticks `state.obj` (game/objectives.js); Interact beside an unlit brazier is the request `light {index}`; the chip + edge arrows are
//     ui/objectiveChip.js; a completed objective opens the gate (visuals: world/objectiveVisuals.js) and moves on ('section'), the last one clears the area:
//     the party reward, and `combat.markCleared(area, mode)` (game/combatSave.js, the saved `combat` domain) records it and grows the Armory.
// Wildroot Hollow's sync domain and local combat input. Step 54 added the combat core on top of the old tap attack:
//   Jump = dodge-hop (request `dodge`, the screen moves its own body at once, the host owns cooldown / i-frames / perfect dodges),
//   Interact tap = attack on PRESS (so combos stay instant), Interact held after the swing = charge, release past the weapon's charge time
//   = `attack {charged}`, Cancel = weapon special (`special {big}`; Cancel held 0.4 s with 3 Bloom pips = the big one), soft auto-aim on all of them.
// Step 55: a member at 0 HP is a downed sprout (rules in dungeonLogic.js). Every screen derives the look from the SYNCED member state by key
//   (`m.downed`, `m.revive`), no new pose field: `player.downed` is set on local players AND remote avatars each frame (the Player squashes itself
//   low and ignores input), plus one scene-level sprout (3 meshes, shared geometry) and a revive ring (a faint full ring + a progress arc from a
//   small cached set of geometries) per downed key. Holding Interact within COMBAT.revive.radius of a downed friend sends the `revive`
//   heartbeat every COMBAT.revive.beat s (and suppresses the tap attack / charge: reviving takes priority); the host owns progress.
//   A one-time "hold Interact" hint toast appears per downing; the HP pill of a downed member shows the sprout icon and the revive progress.
import * as THREE from 'three';
import { DungeonRun, DUNGEON, WEAPONS } from './dungeonLogic.js';
import { AREAS, areaSectionStart, ritualMenuRows } from './areaLogic.js';
import { createObjectiveChip } from '../ui/objectiveChip.js';
import { autoAim, bloomPips } from './combatLogic.js';
import { PLAYER_HITSTUN, COMBAT } from '../config.js';
import { RITUAL } from '../world/islands/ritual.js';
import { getHeight } from '../world/terrain.js';
import { addInteractable } from '../world/interactables.js';
import { createDungeonVisuals, makePortal, dungeonLabel } from '../world/dungeonVisuals.js';
import { RECIPES } from './catalog.js';
import { toonMat } from '../render/toon.js';
import { actorKey } from '../net/worldSync.js';

export function createDungeon({ scene, ritual, players, avatars, table, items, inventory, sync, hud, hudRoot, dialog, camera, particles, sfx, cinematic, rootgate = null, combat = null, viewCamera = null }) {
  const state = new DungeonRun(), visuals = createDungeonVisuals(scene, { particles, sfx });
  const entry = { x: RITUAL.circle.x, y: getHeight(RITUAL.circle.x, RITUAL.circle.z), z: RITUAL.circle.z };
  const entrance = makePortal(scene, entry), chip = viewCamera ? createObjectiveChip(hudRoot, { camera: viewCamera }) : null;
  // every area has its own homeward portal (static positions: interactables are spatially hashed)
  const exits = {};
  for (const area of Object.values(AREAS)) {
    const at = { x: area.origin.x + area.exit.x, y: area.origin.y, z: area.origin.z + area.exit.z };
    exits[area.id] = { at, portal: makePortal(scene, at) };
  }
  const exitOf = () => exits[state.areaId] || exits.wildroot;
  /** Where a party stands after leaving a run: beside the stones' portal, or in front of the Rootgate. */
  function returnSpot(from, index) {
    if (from === 'rootgate' && rootgate) {
      const f = rootgate.front, lat = (index - 1.5) * 1.3;
      return { x: f.x + Math.cos(rootgate.yaw) * lat, z: f.z - Math.sin(rootgate.yaw) * lat };
    }
    return { x: entry.x - 2.7 + index * 1.8, z: entry.z + 1.8 };
  }
  let broadcastT = 0, supplyCount = 0;
  let openBook = () => {};
  const localSeen = new Map(), hurtSeen = new Map();
  let hurtSerial = -1;
  const chargeState = new Map(), dodgeReady = new Map(), glows = new Map(), seenPerfect = new Set(), notReadyAt = new Map();   // per local Player (glows: member key)
  let localTime = 0;
  const sprouts = new Map(), wasDowned = new Map(), hinted = new Set(), reviveBeatT = new Map(), downedFlag = new Set();   // by member key (reviveBeatT: by local Player)
  let downSerial = -1;
  const sproutGeo = { stem: new THREE.CylinderGeometry(0.035, 0.06, 0.42, 6).translate(0, 0.21, 0), leaf: new THREE.SphereGeometry(0.17, 8, 6).scale(1, 0.32, 0.6) };
  const baseRingGeo = new THREE.RingGeometry(0.95, 1.1, 32).rotateX(-Math.PI / 2), arcGeos = new Map();
  const arcGeo = (n) => { let g = arcGeos.get(n); if (!g) arcGeos.set(n, g = new THREE.RingGeometry(0.95, 1.1, 32, 1, Math.PI / 2, -Math.PI * 2 * n / 24).rotateX(-Math.PI / 2)); return g; };
  const arcMat = new THREE.MeshBasicMaterial({ color: '#8dff8a', transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });
  const baseRingMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  const nameOf = (key) => `P${Number(key.slice(key.lastIndexOf(':') + 1)) + 1}`;
  const glowGeo = new THREE.RingGeometry(0.75, 0.95, 28).rotateX(-Math.PI / 2);
  const glowMat = new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  const actorPlayer = (a) => a.screen === sync.screenId ? players.get(a.index) : avatars.list.find((p) => p.index === a.index && p.screen === a.screen);
  const keyPlayer = (key) => { const split = key.lastIndexOf(':'); return actorPlayer({ screen: key.slice(0, split), index: Number(key.slice(split + 1)) }); };
  const keys = () => table.slots.flatMap((s, i) => s ? [`${s.screen}:${i}`] : []);
  function positions() {
    const out = {};
    for (const [key, a] of sync.actors) {
      const slot = table.get(a.index);
      if (slot && slot.screen === a.screen && !slot.away) out[key] = a.pos;
    }
    for (const p of players.list) if (!p.away) out[actorKey(sync.actorFor(p))] = p.position;
    return out;
  }
  function teleportLocals() {
    let moved = false;
    for (const p of players.list) {
      const key = actorKey(sync.actorFor(p));
      if (!state.members[key]) continue;
      if (localSeen.get(p) === state.serial) continue;
      localSeen.set(p, state.serial);
      dialog.close(); p._swingT = -1; p.setPose(null);
      const at = state.active ? areaSectionStart(state.area, state.section, p.index) : returnSpot(state.from, p.index);
      p.teleport(at.x, at.z); particles.burst('sparkle', p.position, { count: 16, radius: 0.8 }); moved = true;
    }
    if (moved) { players._updateFocus(); camera.snap(); }
  }
  function changed(message = '') {
    teleportLocals(); sync.emit('dungeon', 'state', { state: state.snapshot(), message });
    if (message) hud.toast(message, { icon: 'sparkle', duration: 3200 });
  }
  function apply(s, message = '') {
    state.load(s); teleportLocals();
    if (message) hud.toast(message, { icon: 'sparkle', duration: 3200 });
  }
  function animateHits() {
    if (hurtSerial !== state.serial || !state.active) {
      hurtSerial = state.serial; hurtSeen.clear();
      for (const p of [...players.list, ...avatars.list]) p.clearHurt?.();
    }
    if (!state.active) return;
    for (const [key, m] of Object.entries(state.members)) {
      if (!m.hurt || hurtSeen.get(key) === m.hurt.id) continue;
      const elapsed = Math.max(0, state.time - m.hurt.at);
      hurtSeen.set(key, m.hurt.id); if (elapsed >= PLAYER_HITSTUN) continue;
      const split = key.lastIndexOf(':'), screen = key.slice(0, split), slot = Number(key.slice(split + 1));
      const p = screen === sync.screenId ? players.get(slot) : avatars.list.find((p) => p.index === slot && p.screen === screen);
      if (p) p.hurt?.({ x: m.hurt.x, z: m.hurt.z }, PLAYER_HITSTUN - elapsed);
      else hurtSeen.delete(key); // wait until a new remote avatar exists
    }
  }
  function animateAttack(d) {
    const p = actorPlayer(d.actor), w = WEAPONS[d.kind], style = d.charged ? w.charged : w;
    if (p && d.actor.screen === sync.screenId) items.swing(p, { combat: d });
    else if (p) p.swing(style.duration, style.keys);
  }
  function animateSpecial(d) {
    const p = actorPlayer(d.actor), s = WEAPONS[d.kind].special;
    if (!p) return;
    if (d.actor.screen !== sync.screenId) { p.swing(s.duration, s.keys); return; }
    items.swing(p, { combat: { kind: d.kind, special: true, combo: 0 } });
    if (d.kind === 'sword' && d.dist > 0) p.dash(Math.sin(d.facing), Math.cos(d.facing), d.dist, d.time);   // (remote avatars are moved by their pose packets)
  }
  function animateDodge(d) {
    const p = actorPlayer(d.actor);
    if (p && d.actor.screen !== sync.screenId) p.dodge(d.dx, d.dz, { motion: false });    // our own player already hopped when Jump was pressed
  }
  // Step 54: a pulsing ring under a player whose Bloom meter is full, and the local "perfect dodge" toast
  function bloomEffects(t) {
    const full = new Set();
    if (state.active) for (const [key, m] of Object.entries(state.members)) if ((m.bloom || 0) >= COMBAT.bloom.max - 1e-6) full.add(key);
    for (const key of full) {
      const p = keyPlayer(key); if (!p) continue;
      let ring = glows.get(key); if (!ring) { ring = new THREE.Mesh(glowGeo, glowMat); ring.name = 'bloom-glow'; scene.add(ring); glows.set(key, ring); }
      ring.position.set(p.position.x, p.position.y + 0.06, p.position.z); ring.scale.setScalar(1 + Math.sin(t * 8) * 0.12);
    }
    for (const [key, ring] of glows) if (!full.has(key)) { scene.remove(ring); glows.delete(key); }
    glowMat.opacity = 0.6 + Math.sin(t * 8) * 0.2;
    for (const fx of state.active ? state.effects : []) {
      if (fx.type !== 'perfect' || seenPerfect.has(fx.id)) continue;
      seenPerfect.add(fx.id);
      if (players.list.includes(keyPlayer(fx.key || ''))) hud.toast('Perfect dodge!', { icon: 'sparkle', minor: true, duration: 900 });
    }
    if (seenPerfect.size > 64) seenPerfect.clear();
  }
  /** The nearest downed friend within reach of this local player (a member key), or null. */
  function reviveTarget(p) {
    const me = actorKey(sync.actorFor(p)); let best = null, bestD = COMBAT.revive.radius;
    for (const [key, m] of Object.entries(state.members)) {
      if (key === me || !m.downed) continue;
      const q = keyPlayer(key); if (!q) continue;
      const d = Math.hypot(q.position.x - p.position.x, q.position.z - p.position.z);
      if (d <= bestD) { best = key; bestD = d; }
    }
    return best;
  }
  // Step 55: the wilted look on every screen, derived from the synced members: the Player flag, a sprout and the revive ring per downed key
  function downedEffects(t) {
    const now = new Set();
    if (state.active) for (const [key, m] of Object.entries(state.members)) if (m.downed) now.add(key);
    if (downSerial !== state.serial) { downSerial = state.serial; wasDowned.clear(); hinted.clear(); }
    for (const key of now) {
      const p = keyPlayer(key), m = state.members[key]; if (!p) continue;
      p.downed = true; downedFlag.add(key);
      let v = sprouts.get(key);
      if (!v) {
        const group = new THREE.Group(), mat = toonMat('#6fcf62'), stem = new THREE.Mesh(sproutGeo.stem, mat), l1 = new THREE.Mesh(sproutGeo.leaf, mat), l2 = new THREE.Mesh(sproutGeo.leaf, mat);
        l1.position.set(0.15, 0.4, 0); l1.rotation.z = 0.5; l2.position.set(-0.15, 0.34, 0); l2.rotation.z = -0.5;
        group.add(stem, l1, l2); group.name = 'sprout';
        const base = new THREE.Mesh(baseRingGeo, baseRingMat), arc = new THREE.Mesh(arcGeo(1), arcMat); base.name = 'revive-ring'; arc.name = 'revive-arc'; base.renderOrder = 4; arc.renderOrder = 5;
        scene.add(group, base, arc); sprouts.set(key, v = { group, base, arc, n: -1 });
      }
      const frac = Math.min(1, (m.revive || 0) / COMBAT.revive.hold), n = Math.round(frac * 24);
      if (n !== v.n) { v.n = n; v.arc.visible = n > 0; if (n > 0) v.arc.geometry = arcGeo(n); }
      const pulse = 1 + Math.sin(t * 5) * 0.06 + frac * 0.1;
      v.group.position.set(p.position.x, p.position.y + 0.12, p.position.z); v.group.rotation.z = Math.sin(t * 2.2) * 0.12; v.group.scale.setScalar(1 + frac * 0.5);
      for (const r of [v.base, v.arc]) { r.position.set(p.position.x, p.position.y + 0.07, p.position.z); r.scale.setScalar(pulse); }
      v.base.material.opacity = 0.35 + 0.15 * Math.sin(t * 5);
      // the hint (once per downing): a living local player standing near a sprout learns what to do
      const mark = `${key}@${m.downAt}`;
      if (!hinted.has(mark) && players.list.some((q) => q !== p && state.members[actorKey(sync.actorFor(q))] && !state.members[actorKey(sync.actorFor(q))].downed
        && Math.hypot(q.position.x - p.position.x, q.position.z - p.position.z) < COMBAT.revive.radius + 2)) {
        hinted.add(mark); hud.toast(`Hold Interact next to ${nameOf(key)} to help them up!`, { icon: 'sprout', duration: 2600 });
      }
    }
    for (const key of [...downedFlag]) if (!now.has(key)) {
      downedFlag.delete(key); const p = keyPlayer(key); if (p) p.downed = false;
      if (state.active && wasDowned.get(key) && p) { particles.burst('sparkle', p.position, { count: 18, radius: 1, color: '#9dff8a' }); sfx.play('chime', { pitch: 1.2, vol: 0.5 }); }
    }
    for (const [key, v] of sprouts) if (!now.has(key) || !keyPlayer(key)) { scene.remove(v.group, v.base, v.arc); sprouts.delete(key); }
    wasDowned.clear(); for (const key of now) wasDowned.set(key, true);
  }
  // Soft auto-aim: face the nearest guardian near the facing direction (the facing is what gets sent to the host)
  function aim(p, reach) {
    const f = autoAim(p.position, p.facing, state.enemies, reach, { sight: (a, b) => state.g.sight(a, b) });
    if (f !== p.facing) { p.facing = f; p._faceTo = null; }
    return f;
  }
  function request(kind, data, p) {
    if (!p) return;
    return Promise.resolve(sync.request('dungeon', kind, data, sync.actorFor(p))).then((r) => {
      if (!r.ok && !['attack', 'special', 'dodge', 'revive', 'light'].includes(kind)) hud.toast(kind === 'eat' ? 'Rest away from enemies before eating. Bring cooked dishes from the islands!' : 'The portal is unavailable right now.', { icon: 'sparkle' });
      return r.ok;
    });
  }
  sync.register('dungeon', {
    snapshot: () => state.snapshot(),
    hashView: () => ({ progress: state.progress, open: state.open, active: state.active, serial: state.serial, run: state.run, cleared: state.cleared, section: state.section, area: state.areaId, mode: state.mode, from: state.from,
      obj: state.obj && { n: state.obj.n, total: state.obj.total, complete: state.obj.complete, pieces: (state.obj.pieces || []).map((q) => [q.holder, q.delivered]), braziers: (state.obj.braziers || []).map((b) => [b.lit, b.done]) },
      hp: Object.fromEntries(Object.entries(state.members).map(([key, m]) => [key, m.hp])), downed: Object.fromEntries(Object.entries(state.members).map(([key, m]) => [key, !!m.downed])), bloom: Object.fromEntries(Object.entries(state.members).map(([key, m]) => [key, m.bloom || 0])), enemies: state.enemies.map((e) => [e.id, e.hp]), projectiles: state.projectiles.map((a) => [a.id, a.kind, a.hitKeys]), pprojectiles: (state.pprojectiles || []).map((b) => [b.id, b.phase]) }),
    applySnapshot: (s) => apply(s),
    applyEvent(kind, d) { if (kind === 'state') apply(d.state, d.message); else if (d.run !== state.run) return; else if (kind === 'attack') animateAttack(d); else if (kind === 'special') animateSpecial(d); else if (kind === 'dodge') animateDodge(d); },
    handleRequest(kind, d, actor, screen) {
      if (!actor || table.get(actor.index)?.screen !== screen || table.get(actor.index)?.away || cinematic.busy) return { reject: 'busy' };
      const key = actorKey(actor), pos = positions(); pos[key] = actor.pos;
      if (kind === 'enter') {
        // { area, mode, from }: Wild mode only for now (Thorny joins in Step 62); the ritual needs its open portal, the Rootgate its open arch
        const area = AREAS[d.area ?? 'wildroot'], from = d.from === 'rootgate' ? 'rootgate' : 'ritual';
        if (!area || state.active || (d.mode ?? 'wild') !== 'wild') return { reject: 'locked' };
        if (from === 'ritual' ? !state.open || Math.hypot(actor.pos.x - entry.x, actor.pos.z - entry.z) > 4
          : !rootgate?.isOpen() || area.entrance?.id !== 'rootgate' || Math.hypot(actor.pos.x - rootgate.position.x, actor.pos.z - rootgate.position.z) > 6) return { reject: 'locked' };
        state.start(keys(), { area: area.id, mode: 'wild', from }); supplyCount = keys().length; items.dungeonSupply(supplyCount, true); changed(); return true;
      }
      if (!state.active || !state.members[key] || !state.g.inArea(actor.pos.x, actor.pos.z)) return { reject: 'outside' };
      if (kind === 'leave') {
        const at = exitOf().at;
        if (Math.hypot(actor.pos.x - at.x, actor.pos.z - at.z) > 4) return { reject: 'far' };
        state.leave(); items.dungeonSupply(0); changed('Back in the sunshine.'); return true;
      }
      if (kind === 'light') {
        const index = Number(d.index), b = state.obj?.braziers?.[index];
        if (!b || Math.hypot(actor.pos.x - b.x, actor.pos.z - b.z) > COMBAT.objective.light + 1.2) return { reject: 'far' };
        if (!state.light(key, index, pos)) return { reject: 'cannot-light' };
        changed(); return true;
      }
      if (kind === 'attack') {
        const held = items.heldByKey(key);
        if (!held || actor.screen === sync.screenId && held.state !== 'held') return { reject: 'tool-not-ready' };
        // A charged attack must have been held for (nearly) the weapon's charge time; the hold is the screen's own clock, so this only
        // stops a stray request, while cooldown / stun / tool are judged on the host's clock inside state.attack().
        const charged = !!d.charged;
        if (charged && !(d.held >= WEAPONS[held.kind].charged.charge - 0.15)) return { reject: 'not-charged' };
        const style = state.attack(key, held.kind, d.facing, pos, charged);
        if (!style) return { reject: 'cooldown-or-tool' };
        const event = { ...style, actor: { screen: actor.screen, index: actor.index }, run: state.run };
        animateAttack(event); sync.emit('dungeon', 'attack', event); return true;
      }
      if (kind === 'special') {
        const held = items.heldByKey(key);
        if (!held || actor.screen === sync.screenId && held.state !== 'held') return { reject: 'tool-not-ready' };
        const result = state.special(key, held.kind, d.facing, pos, !!d.big);
        if (!result) return { reject: 'not-ready' };
        const event = { ...result, actor: { screen: actor.screen, index: actor.index }, run: state.run };
        animateSpecial(event); sync.emit('dungeon', 'special', event); return true;
      }
      if (kind === 'dodge') {
        const result = state.dodge(key, Number(d.dx) || 0, Number(d.dz) || 0, pos);
        if (!result) return { reject: 'cooldown' };
        const event = { ...result, actor: { screen: actor.screen, index: actor.index }, run: state.run };
        animateDodge(event); sync.emit('dungeon', 'dodge', event); return true;
      }
      if (kind === 'revive') return state.reviveBeat(key, String(d.target), pos) ? true : { reject: 'cannot-revive' };
      if (kind === 'eat') {
        const recipe = RECIPES.find((r) => r.id === d.recipe);
        if (!state.eat(key, recipe, pos, (id) => inventory.remove(id, 1))) return { reject: 'cannot-eat' };
        changed(); return true;
      }
      return { reject: 'unknown' };
    },
  });
  ritual.stones.forEach((stone, i) => {
    const label = dungeonLabel(`${i + 1}`, 0.65); label.position.y = RITUAL.stones[i].height + 0.45; stone.add(label);
    stone.userData.interactable.prompt = `Strike stone ${i + 1}`;
    stone.userData.onStrike = () => {
      if (!sync.isHost || state.active) return;
      state.strike(i + 1);
      changed(state.open ? 'The stones sing! The ritual portal has opened.' : '');
      if (state.open) { particles.burst('sparkle', entry, { count: 24, radius: 2 }); sfx.play('chime'); }
    };
  });
  /** The whole-party confirmation for one area, entered `from` the ritual or the Rootgate. `back` (the ritual's menu) is where Cancel / "Not yet" return to. */
  function confirmEnter(p, area, from, back = null) {
    const choices = [
      { label: 'Enter with the whole party', onSelect: () => { dialog.close(); request('enter', { area: area.id, mode: 'wild', from }, p); } },
      { label: back ? 'Back' : 'Stay here', onSelect: () => (back ? back() : dialog.close()) },
    ], text = from === 'rootgate' ? `Enter ${area.name} through the Rootgate with the whole party?` : `Enter ${area.name} with the whole party?`;
    if (dialog.isOpen && back) dialog.showChoices(choices, { text, onCancel: back });
    else dialog.open({ owner: p, name: area.name, text, choices, onCancel: () => dialog.close() });
  }
  /** The ritual portal's menu: every area in the registry (locked islands' too), each with its island and a Cleared mark from the saved combat progress. */
  function ritualMenu(p) {
    const rows = ritualMenuRows(combat?.state.cleared || {}), list = () => [
      ...rows.map((r) => ({ label: r.name, detail: `${r.islandName}${r.cleared ? ' - Cleared' : ''}`, onSelect: () => confirmEnter(p, AREAS[r.id], 'ritual', openMenu) })),
      { label: 'Stay here', onSelect: () => dialog.close() },
    ];
    const openMenu = () => { if (dialog.isOpen) dialog.showChoices(list(), { text: 'Where should the whole party go?', onCancel: () => dialog.close() }); else dialog.open({ owner: p, name: 'Ritual portal', text: 'Where should the whole party go?', choices: list(), onCancel: () => dialog.close() }); };
    openMenu();
  }
  addInteractable({ type: 'dungeonportal', object: entrance.root, position: entrance.root.position, radius: 0.8, prompt: 'Enter together', onInteract: (_it, p) => {
    if (!state.open || state.active || dialog.isOpen) return;
    ritualMenu(p);
  } });
  rootgate?.setEnterHandler((p) => {
    if (state.active || dialog.isOpen) return;
    const area = Object.values(AREAS).find((a) => a.entrance?.id === 'rootgate');
    if (area) confirmEnter(p, area, 'rootgate');
  });
  for (const [areaId, { portal }] of Object.entries(exits)) {
    const it = addInteractable({ type: 'dungeonexit', object: portal.root, position: portal.root.position, radius: 0.8, prompt: 'Return together', onInteract: (_it, p) => {
      if (!state.active || state.areaId !== areaId || dialog.isOpen) return;
      dialog.open({ owner: p, name: 'Homeward portal', text: state.from === 'rootgate' ? 'Return the entire party to the Rootgate? Leaving ends this run.' : 'Return the entire party to the standing stones? Leaving ends this run.', choices: [
        { label: 'Take everyone home', onSelect: () => { dialog.close(); request('leave', {}, p); } },
        { label: 'Keep exploring', onSelect: () => dialog.close() },
      ], onCancel: () => dialog.close() });
    } });
    it.areaId = areaId;
  }
  // the lanterns of every `light` section (static world positions; only the current section's unlit ones can be targeted: allowsTarget)
  for (const area of Object.values(AREAS)) for (const section of area.sections) {
    if (section.objective.type !== 'light') continue;
    section.objective.braziers.forEach((b, index) => {
      const it = addInteractable({ type: 'brazier', object: null, position: new THREE.Vector3(area.origin.x + b.x, area.origin.y, area.origin.z + b.z), radius: 0.8, prompt: 'Light the lantern',
        onInteract: (_it, p) => { request('light', { index }, p); } });
      Object.assign(it, { areaId: area.id, sectionIndex: section.index, index });
    });
  }
  return {
    state,
    // Local save restoration starts a fresh run; enemies and HP are session-only.
    restore(opts = {}) {
      if (!sync.isHost) return false;
      if (!state.active) {
        state.start(keys(), { area: AREAS[opts.area] ? opts.area : 'wildroot', mode: 'wild', from: opts.from === 'rootgate' ? 'rootgate' : 'ritual' }); supplyCount = keys().length;
        items.dungeonSupply(supplyCount, true);
        changed();
      } else teleportLocals();
      return true;
    },
    setBookOpener(fn) { openBook = fn; },
    provisions(p) { openBook(p); },
    member(p) { return state.members[actorKey(sync.actorFor(p))]; },
    /** Is this local player a downed sprout right now? */
    downed(p) { return state.active && !!state.members[actorKey(sync.actorFor(p))]?.downed; },
    inCombat(p) { return state.inCombat(actorKey(sync.actorFor(p)), positions()); },
    eat(recipe, p) { return request('eat', { recipe }, p); },
    allowsTarget(it) {
      if (it.type === 'dungeonportal') return state.open && !state.active;
      if (it.type === 'rootgate') return !state.active;
      if (it.type === 'dungeonexit') return state.active && state.areaId === it.areaId;
      if (it.type === 'brazier') { const b = state.obj?.braziers?.[it.index]; return state.active && state.areaId === it.areaId && state.section === it.sectionIndex && !!b && !b.lit; }
      return true;
    },
    /** What a reload should remember about the run a player is in (game/playerMemory.js): the area and where they came in from. */
    memory: () => ({ area: state.areaId, from: state.from }),
    contains: (p) => state.active && state.g.inArea(p.position.x, p.position.z),
    /** Tap attack, or (charged) the charged attack after `heldFor` s of holding. Soft auto-aim turns the player toward a near guardian first. */
    attack(p, charged = false, heldFor = 0) {
      if (this.downed(p)) return;
      const held = items.heldBy(p), w = WEAPONS[held?.kind];
      if (!w) { hud.toast('Choose a sword, axe, or hammer in the entrance courtyard.', { icon: 'sparkle' }); return; }
      if (held.state !== 'held' || p.swinging) return;
      request('attack', { facing: aim(p, charged ? w.charged.range : w.range), charged, held: heldFor }, p);
    },
    special(p, big = false) {
      const held = items.heldBy(p), w = WEAPONS[held?.kind], s = w?.special;
      if (this.downed(p) || !s || held.state !== 'held' || p.swinging || p.hurting) return;
      const reach = held.kind === 'sword' ? (big ? s.bigDash : s.dash) : held.kind === 'axe' ? s.range : (big ? s.bigRadius : s.radius);
      request('special', { facing: aim(p, reach), big }, p);
    },
    /** Jump: the dodge-hop. The local body moves at once; `move` is the stick (no stick = hop in place). */
    dodge(p, move) {
      if (!state.active || this.downed(p) || p.hurting || p.frozen || localTime < (dodgeReady.get(p) || 0)) return;
      dodgeReady.set(p, localTime + COMBAT.dodge.air + COMBAT.dodge.cooldown);
      const dx = move?.x || 0, dz = move?.z || 0;
      p.dodge(dx, dz); sfx.play('whoosh', { pitch: 1.3, vol: 0.4 });
      request('dodge', { dx, dz }, p);
    },
    /** Per player and frame while inside a run (main.js): Jump / Interact / Cancel. `tapOk` is false when Interact was already used to pick something up. */
    drive(p, a, dt, tapOk = true) {
      let st = chargeState.get(p); if (!st) chargeState.set(p, st = { armed: false, hold: 0, spec: 0, specArmed: false, bigFired: false });
      const held = items.heldBy(p), w = WEAPONS[held?.kind], ready = !!w && held.state === 'held';
      if (this.downed(p)) { st.armed = false; st.hold = 0; st.specArmed = false; reviveBeatT.delete(p); return; }   // a sprout can only wait (or be revived)
      if (a.jumpPressed) this.dodge(p, a.move);
      // Step 55: Interact held beside a downed friend = revive (takes priority over the tap attack / charge); the host judges the hold.
      const target = reviveTarget(p), reviving = !!target && a.interactHeld && !p.hurting;
      if (reviving) {
        st.armed = false; st.hold = 0;
        const left = (reviveBeatT.get(p) ?? 0) - dt;
        if (left <= 0) { reviveBeatT.set(p, COMBAT.revive.beat); request('revive', { target, held: true }, p); } else reviveBeatT.set(p, left);
      } else reviveBeatT.delete(p);
      // Interact: the tap attack fires on PRESS (combos stay instant); the charge only starts counting once that swing has recovered and Interact is still down.
      if (a.interactPressed && tapOk && !reviving) { this.attack(p); st.armed = ready; st.hold = 0; }
      if (!a.interactHeld) {
        if (st.armed && ready && st.hold >= w.charged.charge) this.attack(p, true, st.hold);
        st.armed = false; st.hold = 0;
      } else if (st.armed && !reviving) { if (p.hurting || !ready) st.hold = 0; else if (!p.swinging) st.hold += dt; }
      // Cancel: a special spends 1 pip; with all 3 the press waits for the 0.4 s hold (big) and a quick release is the small one.
      if (a.cancelPressed) {
        const pips = bloomPips(this.member(p));
        if (!ready || pips < 1) {
          if (localTime - (notReadyAt.get(p) || -9) > 1.2) { notReadyAt.set(p, localTime); sfx.play('bip', { pitch: 0.6, vol: 0.5 }); p.squash(-0.1); if (ready) hud.toast('Land hits and dodge to fill your Bloom meter!', { icon: 'sparkle', minor: true, duration: 1400 }); }
        } else if (pips >= COMBAT.bloom.max) { st.specArmed = true; st.spec = 0; st.bigFired = false; }
        else this.special(p, false);
      }
      if (st.specArmed) {
        if (a.cancelHeld) { st.spec += dt; if (!st.bigFired && st.spec >= COMBAT.bloom.bigHold) { st.bigFired = true; this.special(p, true); } }
        else { if (!st.bigFired) this.special(p, false); st.specArmed = false; st.spec = 0; }
      }
    },
    /** What the charge ring shows for this player: { frac 0..1, ready } or null. */
    chargeView(p) {
      const st = chargeState.get(p), w = WEAPONS[items.heldBy(p)?.kind];
      if (!st || !w) return null;
      if (st.armed && st.hold > 0.1) return { frac: Math.min(1, st.hold / w.charged.charge), ready: st.hold >= w.charged.charge };
      if (st.specArmed && !st.bigFired && st.spec > 0.08) return { frac: Math.min(1, st.spec / COMBAT.bloom.bigHold), ready: false };
      return null;
    },
    update(dt, t) {
      localTime += dt;
      if (sync.isHost && state.active) {
        const activeKeys = keys(); let rosterChanged = false;
        // (join / drop rescale the guardians' HP to the new party size, keeping each one's fraction)
        for (const key of activeKeys) if (!state.members[key]) { state.join(key); rosterChanged = true; }
        for (const key of Object.keys(state.members)) if (!activeKeys.includes(key)) { state.drop(key); rosterChanged = true; }
        if (rosterChanged) { if (activeKeys.length > supplyCount) { supplyCount = activeKeys.length; items.dungeonSupply(supplyCount); } }
        teleportLocals();
        const result = state.update(dt, positions());
        const notes = state.drainNotes(), say = [];
        for (const n of notes) {
          if (n.type === 'wipe') say.push('Everyone wilted! Back to the bailey. Your bag and tools are safe.');
          else if (n.type === 'down' && !notes.some((o) => o.type === 'wipe')) say.push(`${nameOf(n.key)} wilted! Hold Interact beside them to help.`);
          else if (n.type === 'revive') say.push(n.self ? `${nameOf(n.key)} sprouted back up!` : `${nameOf(n.key)} bloomed back!`);
          else if (n.type === 'section') { say.push(`The way opens! Next: ${state.area.sections[n.section]?.name || 'onward'}.`); sfx.play('chime', { pitch: 1.1 }); }
        }
        if (result === 'cleared') {
          const area = state.area, reward = Object.entries(area.rewards || {});
          for (const [item, n] of reward) inventory.add(item, n);
          combat?.markCleared(area.id, state.mode);
          say.push(`${area.clearText || `${area.name} is cleared!`} Party reward: ${reward.map(([item, n]) => `${n} ${item === 'crystal' ? 'crystals' : item === 'herb' ? 'herbs' : item}`).join(' + ')}.`); sfx.play('chime');
        }
        if (say.length || rosterChanged) changed(say.join(' '));
        broadcastT += dt;
        if (broadcastT >= 0.15) { broadcastT = 0; changed(); }
      }
      teleportLocals(); animateHits(); entrance.root.visible = state.open && !state.active;
      for (const [areaId, x] of Object.entries(exits)) { x.portal.root.visible = state.active && state.areaId === areaId; if (x.portal.root.visible) x.portal.update(t); }
      entrance.update(t); visuals.update(state, t, positions(), dt);
      bloomEffects(t); downedEffects(t);
      const inside = players.list.some((p) => state.g.inArea(p.position.x, p.position.z)) && state.active;
      hudRoot.classList.toggle('dungeon-active', inside);
      chip?.update(state, { inside });
      hud.setHealth?.(state.active ? table.slots.flatMap((slot, index) => {
        const member = slot && state.members[`${slot.screen}:${index}`];
        return member ? [{ index, hp: member.hp, max: DUNGEON.hp, bloom: member.bloom || 0, downed: !!member.downed, revive: Math.min(1, (member.revive || 0) / COMBAT.revive.hold) }] : [];
      }) : []);
    },
    summary: () => state.snapshot(),
  };
}
