// Pure helpers for the feast hats (Step 26b). No three.js import, so Node can test them (test/hats.test.js).
//
//   MAX_HATS                     10 designs (player/hats.js, in unlock order: feast 1 unlocks HATS[0])
//   unlockedCount(feasts)        min(10, max(0, floor(feasts)))
//   nextHat(current, unlocked)   the rack cycle: -1 (default beanie) -> 0 -> 1 -> ... -> unlocked-1 -> -1; with nothing unlocked it stays -1
//   clampHat(i, unlocked)        a saved / received hat index made valid: an integer in 0..unlocked-1, otherwise -1 (the beanie)
//   encodeHatId(i) / decodeHatId(id)   the pose packet's hatId (net/poseBuffer.js): 0 = default beanie, 1 = bare head (kept for
//                                      compatibility), 2 + i = HATS[i]. decodeHatId returns null for a bare head, -1 for the beanie, else i.
//   parseHatPrefs(json)          the saved {slotIndex: hatIndex} object (localStorage 'infiniteIsland.hats'), sanitised
export const MAX_HATS = 10;
export const HAT_BEANIE = -1;
export const HAT_BARE_ID = 1;

export function unlockedCount(feasts) {
  const n = Math.floor(Number(feasts));
  return Number.isFinite(n) ? Math.min(MAX_HATS, Math.max(0, n)) : 0;
}

export function clampHat(i, unlocked) {
  return Number.isInteger(i) && i >= 0 && i < Math.min(MAX_HATS, unlocked) ? i : HAT_BEANIE;
}

export function nextHat(current, unlocked) {
  const u = Math.min(MAX_HATS, Math.max(0, Math.floor(Number(unlocked)) || 0));
  if (u <= 0) return HAT_BEANIE;
  const c = Number.isInteger(current) && current >= 0 ? current : HAT_BEANIE;
  const n = c + 1;
  return n >= u ? HAT_BEANIE : n;
}

export function encodeHatId(i) {
  return Number.isInteger(i) && i >= 0 && i < MAX_HATS ? 2 + i : 0;
}

export function decodeHatId(id) {
  const n = Number(id) | 0;
  if (n === HAT_BARE_ID) return null;
  if (n >= 2 && n - 2 < MAX_HATS) return n - 2;
  return HAT_BEANIE;
}

export function parseHatPrefs(text) {
  let d = null;
  try { d = typeof text === 'string' ? JSON.parse(text) : text; } catch { d = null; }
  const out = {};
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    for (const [k, v] of Object.entries(d)) if (/^[0-3]$/.test(k) && Number.isInteger(v) && v >= 0 && v < MAX_HATS) out[k] = v;
  }
  return out;
}
