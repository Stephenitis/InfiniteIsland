// Pure boat repair rules (68c). All times are shared host seconds; no scene, storage or network imports.
// beatAt/judgeBeat/streakHit/validateStreak: grid and four distinct consecutive hits, with position evidence.
// repairReady/validateRepair: activity gates; leakSchedule/bilgeAt/floatResult: seeded, frame-independent float.
// tarHeat: remaining heat; repairSave/normaliseRepair: durable progress separate from session pots and tests.
import { HOP_COURSE, BOAT_REPAIR as R } from '../config.js';
const B = HOP_COURSE.beat;
export const repairReady = s => s.unlocked && Object.values(s.parts).every(v => v === true);
export const patched = s => s.planks === 8 && s.seams.every(Boolean);
export const beatAt = t => Math.round(t / B.period);
export const judgeBeat = t => Number.isFinite(t) && Math.abs(t - beatAt(t) * B.period) <= B.window + 1e-6;
export const nearRepair = (pos, at, range = R.reach) => !!pos && !!at && [pos.x, pos.y, pos.z].every(Number.isFinite)
  && Math.hypot(pos.x - at.x, pos.z - at.z) <= range && Math.abs(pos.y - (at.top ?? at.y ?? 0.3)) <= 0.8;
export const atNailMark = (pos, mark) => nearRepair(pos, mark) && Math.abs(pos.y - mark.top) <= B.standing;
export function streakHit(previous, t, pos, mark) {
  if (!judgeBeat(t) || !atNailMark(pos, mark)) return [];
  const hits = previous || [];
  if (hits.length && beatAt(t) === beatAt(hits.at(-1).t)) return hits;
  const next = hits.length && beatAt(t) !== beatAt(hits.at(-1).t) + 1 ? [] : hits;
  return [...next, { t, pos: { x: pos.x, y: pos.y, z: pos.z } }].slice(-B.hits);
}
export function validateStreak(hits, now, mark, lastBeat = -Infinity) {
  return Array.isArray(hits) && hits.length === B.hits && hits.every((h, i) => h && judgeBeat(h.t)
    && atNailMark(h.pos, mark) && beatAt(h.t) > lastBeat && (!i || beatAt(h.t) === beatAt(hits[i - 1].t) + 1))
    && now - hits.at(-1).t >= -B.window && now - hits.at(-1).t <= B.evidenceAge;
}
export const tarHeat = (pot, now) => pot && Number.isFinite(pot.at) && now - pot.at < R.tar.coolS - 1e-6 ? Math.max(0, Math.min(1, 1 - (now - pot.at) / R.tar.coolS)) : 0;
export function validateRepair(s, kind, d = {}, { pos, layout, now, key, lastBeat = -Infinity } = {}) {
  if (!s.unlocked) return 'locked';
  if (!repairReady(s)) return 'wrong-order';
  if (kind === 'repair') return s.repair ? 'already-started' : nearRepair(pos, layout.marlo, 3) ? null : 'far';
  if (!s.repair) return 'wrong-order';
  if (kind === 'nail') {
    if (!Number.isInteger(d.plank) || d.plank < 0 || d.plank > 3) return 'bad-request';
    if (s.nails[d.plank] >= 2) return 'nailed';
    if (!atNailMark(pos, layout.marks[d.plank])) return 'far';
    return validateStreak(d.hits, now, layout.marks[d.plank], lastBeat) ? null : 'not-on-beat';
  }
  if (kind === 'tar') return s.seams.every(Boolean) ? 'sealed' : nearRepair(pos, layout.seep) ? null : 'far';
  if (kind === 'seal') {
    if (!Number.isInteger(d.seam) || d.seam < 0 || d.seam > 2) return 'bad-request';
    if (s.seams[d.seam]) return 'sealed';
    if (!nearRepair(pos, layout.seams[d.seam])) return 'far';
    return tarHeat(s.tar[key], now) > 0 ? null : 'cooled';
  }
  if (kind === 'float') {
    if (!patched(s)) return 'wrong-order';
    if (s.floated) return 'floated';
    if (s.float?.running) return 'running';
    return nearRepair(pos, layout.board, 3) || nearRepair(pos, layout.deck, R.leakReach) ? null : 'far';
  }
  if (kind === 'plug') {
    if (!s.float?.running || now >= s.float.t0 + R.float.duration) return 'not-running';
    const leak = s.float.leaks.find(l => l.id === d.leak);
    if (!leak || now < s.float.t0 + leak.at) return 'bad-request';
    if (leak.pluggedAt !== null) return 'plugged';
    return nearRepair(pos, layout.spots[leak.spot], R.leakReach) ? null : 'far';
  }
  return 'unknown-kind';
}
export function leakSchedule(seed, party = 1) {
  let v = seed >>> 0;
  const random = () => { v = (Math.imul(v, 1664525) + 1013904223) >>> 0; return v / 4294967296; };
  const n = R.float.partyScale[Math.max(0, Math.min(3, Math.floor(party) - 1))];
  return Array.from({ length: n }, (_, id) => ({ id, at: R.float.first + id * (R.float.last - R.float.first) / (n - 1),
    spot: Math.floor(random() * 6), pluggedAt: null }));
}
// Integrate every leak over its exact open interval, so long frames cannot skip an overflow.
export function bilgeAt(f, now) {
  if (!f) return 0;
  const end = Math.min(now, f.t0 + R.float.duration);
  return f.leaks.reduce((sum, l) => sum + Math.max(0, Math.min(end, l.pluggedAt ?? end) - (f.t0 + l.at)) * R.float.rise, 0);
}
export function floatResult(f, now) {
  if (!f?.running) return null;
  if (bilgeAt(f, now) >= R.float.line) return false;
  return now >= f.t0 + R.float.duration ? true : null;
}
export function normaliseRepair(s, raw) {
  s.repair = repairReady(s) && raw?.repair === true;
  const counts = Array.isArray(raw?.nails) ? raw.nails : Array.from({length: 4}, (_, i) => Math.min(2, Math.max(0, s.planks - i * 2)));
  s.nails = counts.slice(0, 4).map(v => Number.isFinite(v) ? Math.min(2, Math.max(0, Math.floor(v))) : 0);
  while (s.nails.length < 4) s.nails.push(0);
  if (!s.unlocked) s.nails.fill(0);
  s.planks = s.nails.reduce((a, b) => a + b, 0);
  s.tar = {};
  if (s.repair && raw?.tar && typeof raw.tar === 'object') for (const [key, p] of Object.entries(raw.tar))
    if (/^[^:]+:\d+$/.test(key) && Number.isFinite(p?.at) && p.at >= 0) s.tar[key] = { at: p.at };
  s.floated = s.floated && s.repair && patched(s);
  if (s.float && Number.isInteger(s.float.seed)) {
    if (!s.repair || !patched(s)) s.float = null;
    else {
      const f = s.float, incoming = f.leaks;
      f.leaks = leakSchedule(f.seed, f.party).map(leak => {
        const at = incoming.find(l => l.id === leak.id)?.pluggedAt;
        if (Number.isFinite(at) && at >= f.t0 + leak.at && at <= f.t0 + R.float.duration) leak.pluggedAt = at;
        return leak;
      });
    }
  }
  return s;
}
export function repairSave(s) {
  const v = JSON.parse(JSON.stringify(s));
  delete v.tar;
  v.float = null; // a reload restarts a test; only the successful float is durable
  return v;
}
