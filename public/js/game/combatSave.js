// The combat areas' host save (Step 56): `infinite-island.combat.v1` = `{ v: 1, cleared: { areaId: { wild, thorny } }, armory: { weapons, charms }, reactions: [], trophies: [] }`.
//
//   normaliseCombat(raw)                      -> a clean state (bad / old data -> defaults; unknown ids are dropped; the Armory always has the sword / axe / hammer)
//   markCleared(state, area, mode)            -> a NEW state with that area's mode cleared and the area's Armory items merged in (`area.armory`)
//   mergeArmory(armory, add)                  -> union of weapons / charms, stable order
//   createCombatProgress({ sync, persist })   -> the host-owned `combat` sync domain (like the Journal's `collection`): { state, cleared(areaId), markCleared(areaId, mode), on('change') }
//                                                the host loads / saves it, replicas only mirror it (snapshot + event); `?newgame` wipes it (game/save.js, replicas never write)
//
// Why a small domain of its own and not part of `dungeon`: the `dungeon` domain is the SESSION-only run (it restarts on reload); this is the saved progress, which the ritual
// portal's menu, the entrances' trophies and (later) Thorny / Deep Roots read on every screen.
import { NEW_GAME, loadSave, writeSave, clearSave } from './save.js';
import { AREAS } from './areaLogic.js';

export const COMBAT_KEY = 'infinite-island.combat.v1';
export const DEFAULT_WEAPONS = ['sword', 'axe', 'hammer'];
const WEAPON_IDS = ['sword', 'axe', 'hammer', 'slingshot', 'watering-can', 'shovel', 'frying-pan', 'lantern', 'rake'];   // ids later steps add; unknown ones are dropped
const idList = (v, allowed = null) => [...new Set((Array.isArray(v) ? v : []).filter((x) => typeof x === 'string' && x.length <= 40 && (!allowed || allowed.includes(x))))];

export function mergeArmory(armory = {}, add = {}) {
  const weapons = [...new Set([...DEFAULT_WEAPONS, ...idList(armory.weapons, WEAPON_IDS), ...idList(add.weapons, WEAPON_IDS)])];
  const charms = [...new Set([...idList(armory.charms), ...idList(add.charms)])];
  return { weapons, charms };
}
export function normaliseCombat(raw) {
  const cleared = {};
  if (raw && typeof raw === 'object' && raw.cleared && typeof raw.cleared === 'object') {
    for (const id of Object.keys(raw.cleared)) {
      const c = raw.cleared[id];
      if (!AREAS[id] || !c || typeof c !== 'object') continue;        // a retired / unknown area is forgotten
      cleared[id] = { wild: c.wild === true, thorny: c.thorny === true };
    }
  }
  return { v: 1, cleared, armory: mergeArmory(raw?.armory), reactions: idList(raw?.reactions), trophies: idList(raw?.trophies) };
}
export function markCleared(state, area, mode = 'wild') {
  const id = typeof area === 'string' ? area : area?.id, def = AREAS[id];
  if (!def || (mode !== 'wild' && mode !== 'thorny')) return state;
  const next = normaliseCombat(state);
  next.cleared[id] = { wild: next.cleared[id]?.wild === true, thorny: next.cleared[id]?.thorny === true, [mode]: true };
  if (mode === 'wild') next.armory = mergeArmory(next.armory, def.armory);
  return next;
}

export function createCombatProgress({ sync = null, persist = true } = {}) {
  if (persist && NEW_GAME) clearSave(COMBAT_KEY);
  let state = normaliseCombat(persist && !NEW_GAME ? loadSave(COMBAT_KEY) : null);
  const listeners = new Set();
  const changed = () => { for (const fn of listeners) fn(state); };
  const api = {
    get state() { return state; },
    cleared: (areaId, mode = 'wild') => !!state.cleared[areaId]?.[mode],
    on(event, fn) { if (event === 'change') listeners.add(fn); return () => listeners.delete(fn); },
    /** HOST only (a replica waits for the event): record a clear, merge the Armory, save, tell the screens. Returns true when something new was recorded. */
    markCleared(areaId, mode = 'wild', actor = null) {
      if (sync?.isReplica) return false;
      const next = markCleared(state, areaId, mode);
      if (JSON.stringify(next) === JSON.stringify(state)) return false;
      state = next; if (persist) writeSave(COMBAT_KEY, state);
      sync?.emit('combat', 'state', { state, areaId, mode, actor }); changed(); return true;
    },
    reset() { state = normaliseCombat(null); if (persist) writeSave(COMBAT_KEY, state); sync?.emit('combat', 'state', { state }); changed(); },
    summary: () => JSON.parse(JSON.stringify(state)),
  };
  sync?.register('combat', {
    snapshot: () => state, hashView: () => state,
    applySnapshot: (s) => { state = normaliseCombat(s); changed(); },
    applyEvent: (kind, d) => { if (kind === 'state') { state = normaliseCombat(d.state); changed(); } },
    handleRequest: () => ({ reject: 'unknown' }),
  });
  return api;
}
