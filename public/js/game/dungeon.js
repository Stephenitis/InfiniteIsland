import { DungeonRun, DUNGEON, inDungeon, WEAPONS } from './dungeonLogic.js';
import { PLAYER_HITSTUN } from '../config.js';
import { RITUAL } from '../world/islands/ritual.js';
import { getHeight } from '../world/terrain.js';
import { addInteractable } from '../world/interactables.js';
import { createDungeonVisuals, makePortal, dungeonLabel } from '../world/dungeonVisuals.js';
import { RECIPES } from './catalog.js';
import { actorKey } from '../net/worldSync.js';

export function createDungeon({ scene, ritual, players, avatars, table, items, inventory, sync, hud, hudRoot, dialog, camera, particles, sfx, cinematic }) {
  const state = new DungeonRun(), visuals = createDungeonVisuals(scene, { particles, sfx });
  const entry = { x: RITUAL.circle.x, y: getHeight(RITUAL.circle.x, RITUAL.circle.z), z: RITUAL.circle.z };
  const exit = { x: DUNGEON.x, y: DUNGEON.y, z: DUNGEON.z + 21 };
  const entrance = makePortal(scene, entry), homeward = makePortal(scene, exit);
  let broadcastT = 0, supplyCount = 0;
  let openBook = () => {};
  const localSeen = new Map(), hurtSeen = new Map();
  let hurtSerial = -1;
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
      const at = state.active ? { x: DUNGEON.x - 2.7 + p.index * 1.8, z: DUNGEON.z + 10 } : { x: entry.x - 2.7 + p.index * 1.8, z: entry.z + 1.8 };
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
    const p = d.actor.screen === sync.screenId ? players.get(d.actor.index) : avatars.list.find((p) => p.index === d.actor.index);
    if (p && d.actor.screen === sync.screenId) items.swing(p, { combat: d });
    else if (p) p.swing(WEAPONS[d.kind].duration, WEAPONS[d.kind].keys);
  }
  function request(kind, data, p) {
    if (!p) return;
    return Promise.resolve(sync.request('dungeon', kind, data, sync.actorFor(p))).then((r) => {
      if (!r.ok && kind !== 'attack') hud.toast(kind === 'eat' ? 'Rest away from enemies before eating. Bring cooked dishes from the islands!' : 'The portal is unavailable right now.', { icon: 'sparkle' });
      return r.ok;
    });
  }
  sync.register('dungeon', {
    snapshot: () => state.snapshot(),
    hashView: () => ({ progress: state.progress, open: state.open, active: state.active, serial: state.serial, run: state.run, cleared: state.cleared,
      hp: Object.fromEntries(Object.entries(state.members).map(([key, m]) => [key, m.hp])), enemies: state.enemies.map((e) => [e.id, e.hp]), projectiles: state.projectiles.map((a) => [a.id, a.kind, a.hitKeys]) }),
    applySnapshot: (s) => apply(s),
    applyEvent(kind, d) { if (kind === 'state') apply(d.state, d.message); else if (kind === 'attack' && d.run === state.run) animateAttack(d); },
    handleRequest(kind, d, actor, screen) {
      if (!actor || table.get(actor.index)?.screen !== screen || table.get(actor.index)?.away || cinematic.busy) return { reject: 'busy' };
      const key = actorKey(actor), pos = positions(); pos[key] = actor.pos;
      if (kind === 'enter') {
        if (!state.open || state.active || Math.hypot(actor.pos.x - entry.x, actor.pos.z - entry.z) > 4) return { reject: 'locked' };
        state.start(keys()); supplyCount = keys().length; items.dungeonSupply(supplyCount, true); changed(); return true;
      }
      if (!state.active || !state.members[key] || !inDungeon(actor.pos.x, actor.pos.z)) return { reject: 'outside' };
      if (kind === 'leave') {
        if (Math.hypot(actor.pos.x - exit.x, actor.pos.z - exit.z) > 4) return { reject: 'far' };
        state.leave(); items.dungeonSupply(0); changed('Back in the sunshine.'); return true;
      }
      if (kind === 'attack') {
        const held = items.heldByKey(key);
        if (!held || actor.screen === sync.screenId && held.state !== 'held') return { reject: 'tool-not-ready' };
        const style = state.attack(key, held.kind, d.facing, pos);
        if (!style) return { reject: 'cooldown-or-tool' };
        const event = { ...style, actor: { screen: actor.screen, index: actor.index }, run: state.run };
        animateAttack(event); sync.emit('dungeon', 'attack', event); return true;
      }
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
      changed(state.open ? 'The stones sing! A portal to Wildroot Hollow has opened.' : '');
      if (state.open) { particles.burst('sparkle', entry, { count: 24, radius: 2 }); sfx.play('chime'); }
    };
  });
  addInteractable({ type: 'dungeonportal', object: entrance.root, position: entrance.root.position, radius: 0.8, prompt: 'Enter together', onInteract: (_it, p) => {
    if (!state.open || state.active || dialog.isOpen) return;
    dialog.open({ owner: p, name: 'Wildroot Hollow', text: 'Enter the portal with the whole party?', choices: [
      { label: 'Enter with the whole party', onSelect: () => { dialog.close(); request('enter', {}, p); } },
      { label: 'Stay here', onSelect: () => dialog.close() },
    ], onCancel: () => dialog.close() });
  } });
  addInteractable({ type: 'dungeonexit', object: homeward.root, position: homeward.root.position, radius: 0.8, prompt: 'Return together', onInteract: (_it, p) => {
    if (!state.active || dialog.isOpen) return;
    dialog.open({ owner: p, name: 'Homeward portal', text: 'Return the entire party to the standing stones? Leaving ends this run.', choices: [
      { label: 'Take everyone home', onSelect: () => { dialog.close(); request('leave', {}, p); } },
      { label: 'Keep exploring', onSelect: () => dialog.close() },
    ], onCancel: () => dialog.close() });
  } });
  return {
    state,
    // Local save restoration starts a fresh run; enemies and HP are session-only.
    restore() {
      if (!sync.isHost) return false;
      if (!state.active) {
        state.start(keys()); supplyCount = keys().length;
        items.dungeonSupply(supplyCount, true);
        changed();
      } else teleportLocals();
      return true;
    },
    setBookOpener(fn) { openBook = fn; },
    provisions(p) { openBook(p); },
    member(p) { return state.members[actorKey(sync.actorFor(p))]; },
    inCombat(p) { return state.inCombat(actorKey(sync.actorFor(p)), positions()); },
    eat(recipe, p) { return request('eat', { recipe }, p); },
    allowsTarget(it) { return it.type !== 'dungeonportal' || state.open && !state.active; },
    contains: (p) => state.active && inDungeon(p.position.x, p.position.z),
    attack(p) {
      const held = items.heldBy(p);
      if (!WEAPONS[held?.kind]) { hud.toast('Choose a sword, axe, or hammer in the entrance courtyard.', { icon: 'sparkle' }); return; }
      if (held.state !== 'held') return;
      if (!p.swinging) request('attack', { facing: p.facing }, p);
    },
    update(dt, t) {
      if (sync.isHost && state.active) {
        const activeKeys = keys(); let rosterChanged = false;
        for (const key of activeKeys) if (!state.members[key]) { state.members[key] = state.newMember(); rosterChanged = true; }
        for (const key of Object.keys(state.members)) if (!activeKeys.includes(key)) { delete state.members[key]; rosterChanged = true; }
        if (rosterChanged) { if (activeKeys.length > supplyCount) { supplyCount = activeKeys.length; items.dungeonSupply(supplyCount); } changed(); }
        teleportLocals();
        const result = state.update(dt, positions());
        if (result === 'cleared') {
          inventory.add('crystal', 3); inventory.add('herb', 5);
          changed('The ruins are peaceful! Party reward: 3 crystals + 5 herbs.'); sfx.play('chime');
        } else if (result === 'reset') changed('A friend ran out of HP. Fresh start! Your bag and tools are safe.');
        broadcastT += dt;
        if (broadcastT >= 0.15) { broadcastT = 0; changed(); }
      }
      teleportLocals(); animateHits(); entrance.root.visible = state.open && !state.active; homeward.root.visible = state.active;
      entrance.update(t); homeward.update(t); visuals.update(state, t, positions(), dt);
      const inside = players.list.some((p) => inDungeon(p.position.x, p.position.z)) && state.active;
      hudRoot.classList.toggle('dungeon-active', inside);
      hud.setHealth?.(state.active ? table.slots.flatMap((slot, index) => {
        const member = slot && state.members[`${slot.screen}:${index}`];
        return member ? [{ index, hp: member.hp, max: DUNGEON.hp }] : [];
      }) : []);
    },
    summary: () => state.snapshot(),
  };
}
