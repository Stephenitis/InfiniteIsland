import { DungeonRun, DUNGEON, inDungeon, WEAPONS, foodHealing } from './dungeonLogic.js';
import { RITUAL } from '../world/islands/ritual.js';
import { getHeight } from '../world/terrain.js';
import { addInteractable } from '../world/interactables.js';
import { createDungeonVisuals, makePortal, dungeonLabel } from '../world/dungeonVisuals.js';
import { RECIPES, getItem } from './catalog.js';
import { actorKey } from '../net/worldSync.js';

export function createDungeon({ scene, ritual, players, avatars, table, items, inventory, sync, hud, hudRoot, dialog, camera, particles, sfx, cinematic }) {
  const state = new DungeonRun(), visuals = createDungeonVisuals(scene, { particles, sfx });
  const entry = { x: RITUAL.circle.x, y: getHeight(RITUAL.circle.x, RITUAL.circle.z), z: RITUAL.circle.z };
  const exit = { x: DUNGEON.x, y: DUNGEON.y, z: DUNGEON.z + 21 };
  const entrance = makePortal(scene, entry, 'Wildroot portal'), homeward = makePortal(scene, exit, 'Return together');
  const health = document.createElement('div'); health.className = 'dungeon-status'; health.hidden = true; health.setAttribute('aria-live', 'polite'); hudRoot.appendChild(health);
  const foodButton = document.createElement('button'); foodButton.className = 'dungeon-provisions'; foodButton.hidden = true; foodButton.textContent = 'Provisions'; hudRoot.appendChild(foodButton);
  foodButton.onclick = () => provisions(players.list[0]);
  let broadcastT = 0, statusText = '', provisionT = 0;
  const localSeen = new Map();
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
    const before = state.serial; state.load(s); teleportLocals();
    if (before !== state.serial && dialog.menuId === 'dungeon-food') dialog.close();
    if (message) hud.toast(message, { icon: 'sparkle', duration: 3200 });
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
      hp: Object.fromEntries(Object.entries(state.members).map(([key, m]) => [key, m.hp])), enemies: state.enemies.map((e) => [e.id, e.hp]) }),
    applySnapshot: (s) => apply(s),
    applyEvent(kind, d) { if (kind === 'state') apply(d.state, d.message); else if (kind === 'attack' && d.run === state.run) animateAttack(d); },
    handleRequest(kind, d, actor, screen) {
      if (!actor || table.get(actor.index)?.screen !== screen || table.get(actor.index)?.away || cinematic.busy) return { reject: 'busy' };
      const key = actorKey(actor), pos = positions(); pos[key] = actor.pos;
      if (kind === 'enter') {
        if (!state.open || state.active || Math.hypot(actor.pos.x - entry.x, actor.pos.z - entry.z) > 4) return { reject: 'locked' };
        state.start(keys()); changed('Wildroot Hollow · Stay together! Any fallen friend resets the run.'); return true;
      }
      if (!state.active || !state.members[key] || !inDungeon(actor.pos.x, actor.pos.z)) return { reject: 'outside' };
      if (kind === 'leave') {
        if (Math.hypot(actor.pos.x - exit.x, actor.pos.z - exit.z) > 4) return { reject: 'far' };
        state.leave(); changed('Back in the sunshine. Strike 1 · 1 · 1 · 3 to visit again.'); return true;
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
      changed(state.open ? 'The stones sing! A portal to Wildroot Hollow has opened.' : `Stone ${i + 1} · ${state.progress}/4 echoes`);
      if (state.open) { particles.burst('sparkle', entry, { count: 24, radius: 2 }); sfx.play('chime'); }
    };
  });
  addInteractable({ type: 'dungeonportal', object: entrance.root, position: entrance.root.position, radius: 0.8, prompt: 'Enter together', onInteract: (_it, p) => {
    if (!state.open || state.active || dialog.isOpen) return;
    dialog.open({ owner: p, name: 'Wildroot Hollow', text: 'Everyone travels together. 100 HP each; any fall resets the dungeon. Sword: 3-hit combo. Axe: wide cleave. Hammer: heavy stun. Q / B: eat cooked food outside combat.', choices: [
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
  function provisions(p) {
    if (!p || !state.active || !inDungeon(p.position.x, p.position.z) || dialog.isOpen || cinematic.busy) return;
    const key = actorKey(sync.actorFor(p));
    if (state.inCombat(key, positions())) { hud.toast('Retreat from the guardians before eating.', { icon: 'sparkle' }); return; }
    dialog.open({ owner: p, menuId: 'dungeon-food', name: 'Trail provisions', text: () => state.inCombat(key, positions()) ? 'Enemies nearby! Retreat to the safe glade before eating.' : 'Cooked dishes restore HP: home 25 · Frostpine 45 · Emberleaf 65.', choices: () => [
      ...RECIPES.map((r) => ({ label: `Eat ${getItem(r.dish).name}`, icon: getItem(r.dish).icon, detail: `+${foodHealing(r)} HP · ${inventory.count(r.dish)} in shared bag`, disabled: !inventory.has(r.dish) || state.members[key]?.hp >= DUNGEON.hp || state.inCombat(key, positions()), onSelect: () => { request('eat', { recipe: r.id }, p); dialog.close(); } })),
      { label: 'Back', onSelect: () => dialog.close() },
    ], onCancel: () => dialog.close() });
  }
  return {
    state, provisions,
    allowsTarget(it) { return it.type !== 'dungeonportal' || state.open && !state.active; },
    contains: (p) => state.active && inDungeon(p.position.x, p.position.z),
    attack(p) {
      const held = items.heldBy(p);
      if (!WEAPONS[held?.kind]) { hud.toast('Choose a sword, axe, or hammer in the safe glade.', { icon: 'sparkle' }); return; }
      if (held.state !== 'held') return;
      if (!p.swinging) request('attack', { facing: p.facing }, p);
    },
    update(dt, t) {
      if (sync.isHost && state.active) {
        const activeKeys = keys(); let rosterChanged = false;
        for (const key of activeKeys) if (!state.members[key]) { state.members[key] = state.newMember(); rosterChanged = true; }
        for (const key of Object.keys(state.members)) if (!activeKeys.includes(key)) { delete state.members[key]; rosterChanged = true; }
        if (rosterChanged) changed();
        teleportLocals();
        const result = state.update(dt, positions());
        if (result === 'cleared') {
          inventory.add('crystal', 3); inventory.add('herb', 5);
          changed('The ruins are peaceful! Party reward: 3 crystals + 5 herbs.'); sfx.play('chime');
        } else if (result === 'reset') changed('A friend ran out of HP. Fresh start! Your bag and tools are safe.');
        broadcastT += dt;
        if (broadcastT >= 0.15) { broadcastT = 0; changed(); }
      }
      teleportLocals(); entrance.root.visible = state.open && !state.active; homeward.root.visible = state.active;
      entrance.update(t); homeward.update(t); visuals.update(state, t, positions(), dt);
      const inside = players.list.some((p) => inDungeon(p.position.x, p.position.z)) && state.active;
      health.hidden = !inside; foodButton.hidden = !inside;
      hudRoot.classList.toggle('dungeon-active', inside);
      const rows = players.list.filter((p) => state.members[actorKey(sync.actorFor(p))]).map((p) => {
        const key = actorKey(sync.actorFor(p)), m = state.members[key];
        return `${p.colors.name}: ${m.hp}/${DUNGEON.hp} HP${state.inCombat(key, positions()) ? ' · Combat' : ' · Resting'}`;
      });
      const next = `Wildroot Hollow · ${state.cleared ? 'Ruins cleared!' : `${state.enemies.filter((e) => e.hp > 0).length} guardians left`}\n${rows.join('\n')}\nE / A: attack · Q / B: food · Move out of golden attack rings`;
      if (next !== statusText) { health.textContent = next; statusText = next; }
      provisionT += dt;
      if (dialog.menuId === 'dungeon-food' && provisionT > 0.25) { provisionT = 0; dialog.refresh(); }
    },
    summary: () => state.snapshot(),
  };
}
