// Pure flower-major cosmetic rules. Cut blooms still count; seeds and buds do not.
import { FLOWER_IDS } from './flowers.js';
export const GARLAND_COUNT = FLOWER_IDS.length * 3;
export const garlandIndexOf = (flower, level) => FLOWER_IDS.includes(flower) && Number.isInteger(level) && level >= 1 && level <= 3 ? FLOWER_IDS.indexOf(flower) * 3 + level - 1 : -1;
export function bloomCounts(plots = []) {
  const counts = Object.fromEntries(FLOWER_IDS.map((id) => [id, 0]));
  for (const p of plots) if (p?.stage === 'bloom' && FLOWER_IDS.includes(p.flower)) counts[p.flower] = Math.min(2, counts[p.flower] + 1);
  return counts;
}
export function qualifyingGarlands({ counts = {}, stage = 0 } = {}) {
  const k = Math.max(0, Math.min(3, Math.floor(Number(stage)) || 0));
  return FLOWER_IDS.flatMap((id) => {
    const b = Math.max(0, Math.min(2, Math.floor(Number(counts[id])) || 0));
    return [b >= 1, b === 2 && k >= 1, b === 2 && k === 3].flatMap((yes, i) => yes ? [garlandIndexOf(id, i + 1)] : []);
  });
}
export const normaliseUnlocked = (raw) => Array.isArray(raw) ? [...new Set(raw.filter((i) => Number.isInteger(i) && i >= 0 && i < GARLAND_COUNT))].sort((a, b) => a - b) : [];
export const newUnlocks = (unlocked, qualifying) => {
  const have = new Set(normaliseUnlocked(unlocked));
  return normaliseUnlocked(qualifying).filter((i) => !have.has(i));
};
export const mergeUnlocked = (a, b) => normaliseUnlocked([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]);
export const clampGarland = (i, unlocked) => normaliseUnlocked(unlocked).includes(i) ? i : -1;
export function nextGarland(current, unlocked) {
  const list = normaliseUnlocked(unlocked), at = list.indexOf(current);
  return list[at + 1] ?? -1;
}
export const encodeGarlandId = (i) => Number.isInteger(i) && i >= 0 && i < GARLAND_COUNT ? i + 1 : 0;
export const decodeGarlandId = (id) => Number.isInteger(id) && id >= 1 && id <= GARLAND_COUNT ? id - 1 : -1;
export function parseGarlandPrefs(text) {
  let d; try { d = typeof text === 'string' ? JSON.parse(text) : text; } catch { return {}; }
  return Object.fromEntries(Object.entries(d && typeof d === 'object' && !Array.isArray(d) ? d : {}).filter(([k, v]) => /^[0-3]$/.test(k) && encodeGarlandId(v)));
}
