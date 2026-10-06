// Pure rules of bridge building (Step 28b). No three.js / DOM, so Node tests it (test/bridgeLogic.test.js).
// A bridge is paid for with ONE material (BRIDGES[].cost = { item: total }) and built in 4 stages that complete at ceil(total * k / 4)
// given (30 stone -> 8 / 15 / 23 / 30, 20 logs -> 5 / 10 / 15 / 20). Step 48: a cost may list several materials ({ stone: 15, log: 15 }): they are paid in
// that ORDER (a "phase" each), `given` still counts every item together, so the 30 total gives the same 8 / 15 / 23 / 30 stages and the stone phase ends exactly at stage 2.
//
//   STAGES                           4
//   costOf(bridge)                   { item, total } from a BRIDGES entry (item = the FIRST material, total = all of them)
//   costPhases(bridge)               [{ item, count }] in payment order
//   itemAt(bridge, given)            the material wanted next (the last one once everything is paid)
//   phaseLeft(bridge, given)         how many of itemAt(...) the current phase still takes (0 when fully paid)
//   thresholds(total)                [t1, t2, t3, t4]
//   stageOf(given, total)            0..4: how many thresholds `given` has reached
//   stageProgress(given, total)      { stage, built, prev, next, into, span, given, total } for "Stage 2 of 4: 15 / 30" lines (next = the threshold being worked towards, null when built)
//   remaining(given, total)          what is still needed
//   clampGift(n, have, remaining)    the number of items actually taken: floor, never more than the bag holds or the bridge still needs, never < 0
//   validateGift({ feasts, entry, total, have, n, cap })   { ok: true, n } | { ok: false, reason: 'locked' | 'built' | 'bad-request' | 'none' }   (cap = phaseLeft: a gift never spans two materials)
//   applyGift(entry, total, n)       the new { given, stage, built } after n more items
//   freshEntry() / normaliseEntry(raw, total)         state entries (loading a save never trusts the file)
//   hashView(state)                  the JSON the world-sync hash uses: { id: { given, stage, built } }
export const STAGES = 4;
export const GATE_FEASTS = 1;            // the builders only take gifts once the island has had its first feast

export function costPhases(bridge) {
  return Object.entries((bridge && bridge.cost) || {}).map(([item, count]) => ({ item, count: Math.max(0, Math.floor(Number(count)) || 0) })).filter((p) => p.count > 0);
}

export function costOf(bridge) {
  const phases = costPhases(bridge);
  return { item: phases.length ? phases[0].item : null, total: phases.reduce((s, p) => s + p.count, 0) };
}

function phaseAt(bridge, given) {
  const g = Math.max(0, Math.floor(Number(given)) || 0);
  let start = 0;
  const phases = costPhases(bridge);
  for (const p of phases) {
    if (g < start + p.count) return { item: p.item, left: start + p.count - g };
    start += p.count;
  }
  return { item: phases.length ? phases[phases.length - 1].item : null, left: 0 };
}
export const itemAt = (bridge, given) => phaseAt(bridge, given).item;
export const phaseLeft = (bridge, given) => phaseAt(bridge, given).left;

export function thresholds(total) {
  const out = [];
  for (let k = 1; k <= STAGES; k++) out.push(Math.ceil((total * k) / STAGES));
  return out;
}

export function stageOf(given, total) {
  if (!(total > 0)) return 0;
  const g = Math.max(0, Math.floor(Number(given)) || 0);
  let s = 0;
  for (const t of thresholds(total)) if (g >= t) s++;
  return s;
}

export function stageProgress(given, total) {
  const th = thresholds(total);
  const g = Math.min(total, Math.max(0, Math.floor(Number(given)) || 0));
  const stage = stageOf(g, total);
  const built = stage >= STAGES;
  const prev = stage > 0 ? th[stage - 1] : 0;
  const next = built ? null : th[stage];
  return { stage, built, prev, next, into: g - prev, span: built ? 0 : next - prev, given: g, total };
}

export function remaining(given, total) { return Math.max(0, total - Math.max(0, Math.floor(Number(given)) || 0)); }

export function clampGift(n, have, left) {
  const v = Math.min(Math.floor(Number(n)) || 0, Math.floor(Number(have)) || 0, Math.floor(Number(left)) || 0);
  return v > 0 ? v : 0;
}

export function validateGift({ feasts, entry, total, have, n, cap = Infinity }) {
  if (!(Math.floor(Number(feasts)) >= GATE_FEASTS)) return { ok: false, reason: 'locked' };
  if (!entry || !(total > 0)) return { ok: false, reason: 'bad-request' };
  if (!Number.isFinite(Number(n)) || Math.floor(Number(n)) < 1) return { ok: false, reason: 'bad-request' };
  if (entry.built || entry.given >= total) return { ok: false, reason: 'built' };
  const taken = clampGift(n, have, Math.min(remaining(entry.given, total), cap));
  if (taken < 1) return { ok: false, reason: 'none' };
  return { ok: true, n: taken };
}

export function applyGift(entry, total, n) {
  const given = Math.min(total, entry.given + Math.max(0, n));
  const stage = stageOf(given, total);
  return { given, stage, built: !!entry.built || stage >= STAGES };
}

export const freshEntry = () => ({ given: 0, stage: 0, built: false });

/** A saved / received entry made safe: given clamped to 0..total, stage derived, built when saved so or when fully paid. */
export function normaliseEntry(raw, total) {
  if (!raw || typeof raw !== 'object') return freshEntry();
  let given = Math.max(0, Math.min(total, Math.floor(Number(raw.given)) || 0));
  if (raw.built) given = total;
  const stage = stageOf(given, total);
  return { given, stage, built: stage >= STAGES };
}

export function hashView(state) {
  const out = {};
  for (const id of Object.keys(state).sort()) out[id] = { given: state[id].given, stage: state[id].stage, built: !!state[id].built };
  return out;
}
