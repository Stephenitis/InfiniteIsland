// Skipper Marlo's boat: the pure rules of the `boat` sync domain (PLAN Step 68; world/boat.js owns the domain, the save and the visuals). Node-tested in test/boat.test.js.
//
// State (host-authoritative, saved as the `boat` key of infinite-island.emberleaf.v1; designed so 68b-d fill fields in without a migration):
//   { unlocked, parts: { planks, sail, rudder, compass }, planks: 0..8 (nailed), seams: [bool x3] (tar-sealed), float: null | { running, t0, leaks: [...], bilge }, floated, sights: [bool x3], launched }
// 68c adds repair (Marlo agreed), nails [0..2 x4] and session-only tar {actorKey:{at}}. Pure repair rules live in boatRepairLogic.js.
//
//   freshBoat() / normaliseBoat(raw)     a state / a sanitised copy of anything (old or hostile saves)
//   boatHashView(state)                  what the sync hash covers: the state without `float.bilge` (timing noise)
//   unlockedFromGarlands(list)           the old-save migration: a save with ANY unlocked garland (emberleaf.v1.garlands) has feasted at Emberleaf, so the quest is unlocked
//   unlockOnFeast(state, { n, free, last }) -> { changed }   the feast reveal: host only, idempotent per feast number, never for free (debug) feasts; mutates `state`
//   validateTake(state, { part, dist, range, debug }) -> { ok } | { ok: false, reason }   reasons: bad-request | locked | unavailable (no course for that part yet) | taken | far
//   applyTake(state, part)               marks the part fetched (true when it changed)
//   PARTS, COURSE_OF                     the part names; the course whose goal holds each part ('planks' -> 'tide-pools'; 68b adds sail / rudder / compass)
import { normaliseRepair } from './boatRepairLogic.js';

export const PARTS = ['planks', 'sail', 'rudder', 'compass'];
export const COURSE_OF = { planks: 'tide-pools', sail: 'boat-sail', rudder: 'boat-rudder', compass: 'boat-compass' };
export const PLANK_TOTAL = 8, SEAM_COUNT = 3, SIGHT_COUNT = 3;

const bools = (a, n) => Array.from({ length: n }, (_, i) => Array.isArray(a) && a[i] === true);
const num = (v, lo, hi, d = 0) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

export function freshBoat() {
  return { repair: false, nails: [0, 0, 0, 0], tar: {}, unlocked: false, parts: { planks: false, sail: false, rudder: false, compass: false }, planks: 0, seams: bools(null, SEAM_COUNT), float: null, floated: false, sights: bools(null, SIGHT_COUNT), launched: false };
}

export function normaliseBoat(raw) {
  const s = freshBoat();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return s;
  s.unlocked = raw.unlocked === true;
  if (raw.parts && typeof raw.parts === 'object') for (const p of PARTS) s.parts[p] = raw.parts[p] === true;
  s.planks = Math.floor(num(raw.planks, 0, PLANK_TOTAL, 0));
  s.seams = bools(raw.seams, SEAM_COUNT);
  const f = raw.float;
  if (f && typeof f === 'object') s.float = { ...(Number.isInteger(f.seed) ? { seed: f.seed, party: Math.max(1, Math.min(4, Math.floor(f.party) || 1)) } : {}), running: f.running === true, t0: num(f.t0, 0, 1e15, 0), leaks: Array.isArray(f.leaks) ? f.leaks.filter((l) => l && typeof l === 'object').slice(0, 64).map((l) => ({ ...l })) : [], bilge: num(f.bilge, 0, 1, 0) };
  s.floated = raw.floated === true;
  s.sights = bools(raw.sights, SIGHT_COUNT);
  s.launched = raw.launched === true;
  // nothing later in the quest can be done before the earlier parts: a hand-edited save cannot launch an unbuilt boat
  if (!s.unlocked) { s.parts = freshBoat().parts; s.planks = 0; s.seams = bools(null, SEAM_COUNT); s.float = null; s.floated = false; s.sights = bools(null, SIGHT_COUNT); s.launched = false; }
  normaliseRepair(s, raw);
  s.launched = s.launched && s.floated && s.sights.every(Boolean);
  return s;
}

export function boatHashView(s) {
  const v = JSON.parse(JSON.stringify(s));
  if (v.float) delete v.float.bilge;
  return v;
}

export const unlockedFromGarlands = (list) => Array.isArray(list) && list.length > 0;

export function unlockOnFeast(state, { n, free = false, last = 0 } = {}) {
  if (free || !Number.isInteger(n) || n <= last || state.unlocked) return { changed: false };
  state.unlocked = true;
  return { changed: true };
}

// Same feet/goal gate for prompts and authority; remote poses tolerate 0.15 u of quantisation/latency.
export function atBoatGoal(pos, goal, slack = 0) {
  return !!pos && !!goal && Number.isFinite(pos.y) && Number.isFinite(goal.top)
    && Math.hypot(pos.x - goal.x, pos.z - goal.z) <= 2.2 + slack
    && pos.y >= goal.top - 0.08 - slack && pos.y <= goal.top + 0.6 + slack;
}

export function validateTake(state, { part, dist = null, range = Infinity, debug = false } = {}) {
  if (typeof part !== 'string' || !PARTS.includes(part)) return { ok: false, reason: 'bad-request' };
  if (!state.unlocked) return { ok: false, reason: 'locked' };
  if (!debug && !COURSE_OF[part]) return { ok: false, reason: 'unavailable' };
  if (state.parts[part]) return { ok: false, reason: 'taken' };
  if (dist !== null && dist > range) return { ok: false, reason: 'far' };
  return { ok: true };
}

export function applyTake(state, part) {
  if (!PARTS.includes(part) || state.parts[part]) return false;
  state.parts[part] = true;
  return true;
}
