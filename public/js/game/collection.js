// Shared, host-owned Journal (31d), separate from the ingredient bag. Six finds per island: three beach glints + shake / dig / break.
import { NEW_GAME, loadSave, writeSave, clearSave } from './save.js';
import { svg, OUTLINE } from '../ui/icons.js';

const shapes = {
  shell: `<path d="M3 15C0 3 24 3 21 15l-6 6H9z" fill="currentColor" stroke="${OUTLINE}" stroke-width="2"/><path d="m12 8 0 12M6 10l4 10m8-10-4 10" stroke="${OUTLINE}" stroke-width="1.5"/>`,
  stone: `<path d="m4 18 1-9 7-6 7 4 2 11-8 4z" fill="currentColor" stroke="${OUTLINE}" stroke-width="2"/><path d="m12 3-2 12 11 3m-11-3-6 3" stroke="${OUTLINE}" fill="none"/>`,
  feather: `<path d="M5 20C2 7 13 0 19 4c4 6-3 16-14 16z" fill="currentColor" stroke="${OUTLINE}" stroke-width="2"/><path d="m4 22 12-15m-9 9 5 0m-1-5 0-5" stroke="${OUTLINE}" stroke-width="1.5"/>`,
  fossil: `<circle cx="12" cy="12" r="9" fill="currentColor" stroke="${OUTLINE}" stroke-width="2"/><path d="M17 13c0-8-11-8-11 0 0 6 8 6 8 0 0-3-4-3-4 0" fill="none" stroke="${OUTLINE}" stroke-width="2"/>`,
};
const defs = [
  ['home','fan-shell','Fan Shell','beach','shell','#ff9cae'], ['home','violet-shell','Violet Shell','beach','shell','#b8a4e1'], ['home','pearl-shell','Pearl Shell','beach','shell','#ffeab9'],
  ['home','winged-seed','Winged Seed','shake','feather','#95ca6e'], ['home','spiral-fossil','Spiral Fossil','break','fossil','#dfb47a'], ['home','sand-dollar','Sand Dollar','dig','fossil','#f6e4bc'],
  ['frost','ice-pebble','Ice Pebble','beach','stone','#89d9ee'], ['frost','snow-quartz','Snow Quartz','beach','stone','#d6c8ef'], ['frost','river-jade','River Jade','beach','stone','#8bd7bb'],
  ['frost','jay-feather','Jay Feather','shake','feather','#79b6ed'], ['frost','star-geode','Star Geode','break','stone','#bb90d8'], ['frost','amber-leaf','Amber Leaf','dig','feather','#eeb866'],
  ['ember','cowrie-shell','Cowrie Shell','beach','shell','#ffcf8c'], ['ember','sunset-conch','Sunset Conch','beach','shell','#f79b79'], ['ember','coral-shell','Coral Shell','beach','shell','#f785af'],
  ['ember','carved-seed','Carved Seed','shake','stone','#9bc96c'], ['ember','obsidian-carving','Obsidian Carving','break','stone','#9d83c7'], ['ember','fern-fossil','Fern Fossil','dig','fossil','#cda684'],
];
export const COLLECTIBLES = defs.map(([island, id, name, source, shape, color]) => ({ island, id, name, source, color, icon: svg(`<g style="color:${color}">${shapes[shape]}</g>`) }));
export const collectible = (id) => COLLECTIBLES.find((d) => d.id === id) || null;
export const COLLECTION_KEY = 'infinite-island.collection.v1';

export class CollectionLog {
  get definitions() { return COLLECTIBLES; }
  constructor({ persist = true, onFound = () => {}, validateBeach = () => false } = {}) {
    this.persist = persist; this.found = new Set(); this.listeners = new Set(); this.onFound = onFound; this.validateBeach = validateBeach;
    this.sync = null;
    if (persist) { if (NEW_GAME) clearSave(COLLECTION_KEY); else this.load(loadSave(COLLECTION_KEY)); }
  }
  snapshot() { return { v: 1, found: COLLECTIBLES.filter((d) => this.found.has(d.id)).map((d) => d.id) }; }
  load(s) { this.found = new Set((Array.isArray(s?.found) ? s.found : []).filter((id) => collectible(id))); this.changed(); }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed() { for (const fn of this.listeners) fn(); }
  has(id) { return this.found.has(id); }
  progress(island) { const all = COLLECTIBLES.filter((d) => d.island === island); return { have: all.filter((d) => this.has(d.id)).length, total: all.length }; }
  apply(d) {
    const def = collectible(d.id); if (!def || this.has(d.id)) return false;
    this.found.add(d.id); this.changed(); this.onFound(def, d.actor); return true;
  }
  award(id, actor = null) {
    if (this.sync?.isReplica || !this.apply({ id, actor })) return false;
    if (this.persist) writeSave(COLLECTION_KEY, this.snapshot());
    this.sync?.emit('collection', 'found', { id, actor }); return true;
  }
  roll(island, source, actor, chance, random = Math.random) {
    if (this.sync?.isReplica || random() >= chance) return false;
    const pool = COLLECTIBLES.filter((d) => d.island === island && d.source === source && !this.has(d.id));
    return pool.length ? this.award(pool[Math.floor(random() * pool.length)].id, actor) : false;
  }
  attachSync(sync) {
    this.sync = sync;
    sync.register('collection', {
      snapshot: () => this.snapshot(), hashView: () => this.snapshot(), applySnapshot: (s) => this.load(s),
      applyEvent: (kind, d) => { if (kind === 'found') this.apply(d); },
      handleRequest: (kind, d, actor, screen) => {
        if (kind !== 'beach' || !actor || actor.screen !== screen || !this.validateBeach(d.id, actor)) return { reject: 'far' };
        return this.award(d.id, { screen, index: actor.index }) ? true : { reject: 'found' };
      },
    });
  }
}
