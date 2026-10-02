// Pure rules for the tail unlocks (Step 36b). No three.js import, so Node can test them (test/tailLogic.test.js).
//
//   TAIL_SPECIES / TAIL_COUNT       ['fox','squirrel','rabbit','grouse'] and 12; tail index = species * 3 + (level - 1) (the order of player/tails.js TAILS)
//   tailIndexOf(species, level)     the TAILS index, or -1
//   speciesCounts(list)             { fox: n, ... } of the critters whose `at` is 'camp'; list = [{ species, at }]
//   qualifyingTails({ counts, comfort })   sorted TAILS indices whose conditions hold NOW: level 1 if c >= 1, level 2 if c == 2 and comfort >= 1,
//                                   level 3 if c == 2 and comfort == 3 (levels are independent: a level 3 qualifies even if level 2 never did)
//   newUnlocks(unlocked, qualifying)       the qualifying tails that are not unlocked yet (sorted)
//   mergeUnlocked(unlocked, add)    a NEW sorted list without duplicates (the unlocked set only ever grows)
//   normaliseUnlocked(raw)          a saved / received list made safe: integers 0..11 only, sorted, unique
//   clampTail(i, unlocked)          a saved / received tail index made valid: it must be unlocked, otherwise -1 (no tail)
//   nextTail(current, unlocked)     the stump's cycle: none (-1) -> the first unlocked -> ... -> the last -> none; with nothing unlocked it stays -1
//   encodeTailId(i) / decodeTailId(id)   the pose packet's tailId: 0 = none, 1 + i = TAILS[i] (decode gives -1 for none / unknown)
//   parseTailPrefs(json)            the saved {slotIndex: tailIndex} object (localStorage 'infiniteIsland.tails'), sanitised
export const TAIL_SPECIES = ['fox', 'squirrel', 'rabbit', 'grouse'];
export const TAIL_COUNT = 12;
export const NO_TAIL = -1;

export const tailIndexOf = (species, level) => {
  const s = TAIL_SPECIES.indexOf(species);
  return s < 0 || !Number.isInteger(level) || level < 1 || level > 3 ? -1 : s * 3 + (level - 1);
};

export function speciesCounts(list) {
  const out = {};
  for (const s of TAIL_SPECIES) out[s] = 0;
  for (const c of list || []) if (c && c.at === 'camp' && c.species in out) out[c.species]++;
  return out;
}

export function qualifyingTails({ counts = {}, comfort = 0 } = {}) {
  const k = Math.max(0, Math.min(3, Math.floor(Number(comfort)) || 0));
  const out = [];
  for (const species of TAIL_SPECIES) {
    const c = Math.max(0, Math.min(2, Math.floor(Number(counts[species])) || 0));
    if (c >= 1) out.push(tailIndexOf(species, 1));
    if (c === 2 && k >= 1) out.push(tailIndexOf(species, 2));
    if (c === 2 && k === 3) out.push(tailIndexOf(species, 3));
  }
  return out.sort((a, b) => a - b);
}

export const normaliseUnlocked = (raw) => (Array.isArray(raw)
  ? [...new Set(raw.filter((i) => Number.isInteger(i) && i >= 0 && i < TAIL_COUNT))].sort((a, b) => a - b) : []);

export const newUnlocks = (unlocked, qualifying) => {
  const have = new Set(unlocked);
  return normaliseUnlocked(qualifying).filter((i) => !have.has(i));
};

export const mergeUnlocked = (unlocked, add) => normaliseUnlocked([...(unlocked || []), ...(add || [])]);

export const clampTail = (i, unlocked) => (Number.isInteger(i) && (unlocked || []).includes(i) ? i : NO_TAIL);

export function nextTail(current, unlocked) {
  const list = normaliseUnlocked(unlocked);
  if (!list.length) return NO_TAIL;
  const at = list.indexOf(current);
  if (at < 0) return list[0];                      // none (or a tail that is no longer unlocked) -> the first
  return at + 1 >= list.length ? NO_TAIL : list[at + 1];
}

export const encodeTailId = (i) => (Number.isInteger(i) && i >= 0 && i < TAIL_COUNT ? 1 + i : 0);
export function decodeTailId(id) {
  const n = Number(id) | 0;
  return n >= 1 && n <= TAIL_COUNT ? n - 1 : NO_TAIL;
}

export function parseTailPrefs(text) {
  let d = null;
  try { d = typeof text === 'string' ? JSON.parse(text) : text; } catch { d = null; }
  const out = {};
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    for (const [k, v] of Object.entries(d)) if (/^[0-3]$/.test(k) && Number.isInteger(v) && v >= 0 && v < TAIL_COUNT) out[k] = v;
  }
  return out;
}
