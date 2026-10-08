// Host-owned, game-hour visitor schedule. Rendering and inventory are injected by
// the runtime; this module stays pure so races, visibility and reloads can be tested.
import { mulberry32 } from '../utils/rng.js';

export const RESIDENTS = { imnabong: 'home', myodette: 'frost', shyamshyam: 'ember' };
export const VISITOR_IDS = ['yubbuibbui', 'mokuring', 'parkzyoni', 'dubnyangee', 'sonchaetty', 'tzukumi'];
export const VISIT_ISLANDS = ['home', 'frost', 'ember'];
export const GIFTS = ['crystal', 'obsidian'];
export const VISIT_TIMING = { first: [12, 24], gap: [24, 48], stay: [3, 5] };

export function inView(planes, p, radius = 2) {
  return planes.every(([a, b, c, d]) => a * p.x + b * p.y + c * p.z + d >= -radius);
}

export function validView(planes) {
  return Array.isArray(planes) && planes.length === 6 && planes.every(p => Array.isArray(p) && p.length === 4
    && p.every(Number.isFinite) && Math.abs(Math.hypot(...p.slice(0, 3)) - 1) < 0.01);
}

export class TdoongVisits {
  constructor(saved = null) {
    this.hours = Number.isFinite(saved?.hours) && saved.hours >= 0 ? saved.hours : 0;
    this.seq = Number.isInteger(saved?.seq) && saved.seq >= 0 ? saved.seq : 0;
    this.next = Object.fromEntries(VISIT_ISLANDS.map(i => [i, Number.isFinite(saved?.next?.[i]) ? saved.next[i] : this.hours + this.roll(VISIT_TIMING.first)]));
    this.visits = [];
    for (const v of Array.isArray(saved?.visits) ? saved.visits : []) {
      if (!v || !VISITOR_IDS.includes(v.id) || !VISIT_ISLANDS.includes(v.island) || !Number.isInteger(v.visit) || v.visit < 1
        || !Number.isFinite(v.until) || (v.gift !== null && !GIFTS.includes(v.gift))
        || this.visits.some(o => o.id === v.id || o.island === v.island)) continue;
      this.visits.push({ ...v });
      this.seq = Math.max(this.seq, v.visit);
    }
  }
  random() { return mulberry32(65000 + this.seq++)(); }
  roll([a, b]) { return a + this.random() * (b - a); }
  snapshot() { return { hours: this.hours, seq: this.seq, next: { ...this.next }, visits: this.visits.map(v => ({ ...v })) }; }
  advance(hours, { spawnPoint, canLeave, arrive, leave }) {
    if (!(hours >= 0 && Number.isFinite(hours))) return;
    this.hours += hours;
    for (const v of [...this.visits]) if (this.hours >= v.until && canLeave(v)) {
      this.visits.splice(this.visits.indexOf(v), 1);
      this.next[v.island] = this.hours + this.roll(VISIT_TIMING.gap);
      leave(v);
    }
    for (const island of VISIT_ISLANDS) {
      if (this.hours < this.next[island] || this.visits.some(v => v.island === island)) continue;
      const pool = VISITOR_IDS.filter(id => !this.visits.some(v => v.id === id));
      const id = pool[Math.floor(this.random() * pool.length)];
      const point = spawnPoint(island, id);
      if (!point) continue; // retry later; an island in view never forces a pop-in
      const v = { id, island, visit: ++this.seq, gift: GIFTS[Math.floor(this.random() * GIFTS.length)], until: this.hours + this.roll(VISIT_TIMING.stay) };
      this.visits.push(v);
      arrive(v, point);
    }
  }
  take(id, visit) {
    const v = this.visits.find(v => v.id === id && v.visit === visit);
    if (!v?.gift) return null;
    const gift = v.gift;
    v.gift = null;
    return gift;
  }
}
