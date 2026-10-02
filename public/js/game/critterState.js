// Pure rules for where Frostpine's critters live (PLAN Step 34b). No three.js import, so Node can test them (test/critterState.test.js).
//
//   state shape        { [critterId]: { at: 'wild' | 'camp' } }          (the `critters` sync domain's snapshot and hash)
//   validateFeed(...)  can this feed go ahead? -> { ok: true } | { ok: false, reason }   reasons: bad-request | locked | gone | none | far
//   applyFed(state, id)        a NEW state with that critter at the camp
//   campCount(state)           how many live at the camp
//   normaliseState(raw, ids)   a saved / received map made safe: unknown ids dropped, bad values ignored (-> wild)
//   readSave(raw, ids)         { state, rest } from a parsed save object (`rest` = every other key, kept so Steps 35 / 36 can share the file)
//   buildSave(state, rest)     the object to write: { v: 1, ...rest, critters: { id: { at } } }
//   hashView(state)            the sorted state, for sync.hash()
//
// The save file `infinite-island.frostpine.v1` is shared by Steps 34-36: this step owns `critters`; Step 35 adds camp comfort / jobs and Step 36 tail unlocks as their own
// keys of the same object. `readSave` hands every key it does not own back in `rest`, so writing the file never drops what a later step stored.
export const SAVE_VERSION = 1;
export const STORAGE_KEY = 'infinite-island.frostpine.v1';
export const WHERES = ['wild', 'camp'];

export const freshEntry = () => ({ at: 'wild' });
export const freshState = (ids) => { const s = {}; for (const id of ids) s[id] = freshEntry(); return s; };

/**
 * @param gateOpen   the Frostpine bridge is built
 * @param entry      the critter's state entry (undefined = unknown id)
 * @param have       how many of its food the shared bag holds
 * @param dist       the actor's distance to the critter (omit for the host / debug: no range check)
 * @param range      the furthest a remote actor may be
 */
export function validateFeed({ gateOpen, entry, have, dist = null, range = Infinity }) {
  if (!entry) return { ok: false, reason: 'bad-request' };
  if (!gateOpen) return { ok: false, reason: 'locked' };
  if (entry.at !== 'wild') return { ok: false, reason: 'gone' };
  if (dist !== null && !(dist <= range)) return { ok: false, reason: 'far' };
  if (!(Math.floor(Number(have)) >= 1)) return { ok: false, reason: 'none' };
  return { ok: true };
}

export function applyFed(state, id) {
  const next = {};
  for (const k of Object.keys(state)) next[k] = { at: state[k].at };
  if (next[id]) next[id] = { at: 'camp' };
  return next;
}

export const campCount = (state) => Object.values(state).filter((e) => e && e.at === 'camp').length;

export function normaliseState(raw, ids) {
  const out = freshState(ids);
  if (!raw || typeof raw !== 'object') return out;
  for (const id of ids) {
    const e = raw[id];
    if (e && typeof e === 'object' && e.at === 'camp') out[id] = { at: 'camp' };
  }
  return out;
}

const OWNED = new Set(['v', 'critters']);
export function readSave(raw, ids) {
  if (!raw || typeof raw !== 'object') return { state: freshState(ids), rest: {} };
  const rest = {};
  for (const k of Object.keys(raw)) if (!OWNED.has(k)) rest[k] = raw[k];
  return { state: normaliseState(raw.critters, ids), rest };
}

export function buildSave(state, rest = {}) {
  const critters = {};
  for (const id of Object.keys(state).sort()) critters[id] = { at: state[id].at === 'camp' ? 'camp' : 'wild' };
  return { ...rest, v: SAVE_VERSION, critters };
}

export function hashView(state) {
  const out = {};
  for (const id of Object.keys(state).sort()) out[id] = { at: state[id].at };
  return out;
}
