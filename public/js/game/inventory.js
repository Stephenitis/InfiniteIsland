// Shared inventory: one bag for every player (couch co-op), persisted in localStorage.
//
//   const inv = new Inventory();                 // loads the saved bag ('?newgame' in the URL wipes it)
//   inv.add('apple', 2)      -> new count        (unknown ids are ignored: returns 0)
//   inv.remove('log', 3)     -> true if it had enough (nothing is removed otherwise)
//   inv.has('herb', 2)       -> count >= 2       (n defaults to 1)
//   inv.count('berry')       -> number
//   inv.hasAll({ mushroom: 2, herb: 1 })         -> bool (for recipes / quests)
//   inv.removeAll({ mushroom: 2, herb: 1 })      -> bool (atomic: all or nothing)
//   inv.all()                -> [{ id, count, def }] non-zero entries in catalogue order
//   inv.total                -> number of items carried
//   const off = inv.on('change', (e) => ...)     // e = { id, delta, count, inventory }; returns an unsubscribe function
//   inv.reset()              // empty the bag (fires 'change' per item)
//
// Saved as { v: 1, items: { id: count } } under STORAGE_KEY after every change (try/catch: private windows etc. just skip saving).
import { getItem, listItems } from './catalog.js';
import { NEW_GAME, loadSave, writeSave, clearSave } from './save.js';

export const STORAGE_KEY = 'infinite-island.inventory.v1';
export const MAX_STACK = 99;

export class Inventory {
  constructor({ storageKey = STORAGE_KEY, persist = true } = {}) {
    this.storageKey = storageKey;
    this.persist = persist;
    this._counts = new Map();
    this._handlers = { change: new Set() };
    if (persist) {
      if (NEW_GAME) clearSave(storageKey);
      else this._load();
    }
  }

  _load() {
    const data = loadSave(this.storageKey);
    const items = data && data.items;
    if (!items || typeof items !== 'object') return;
    for (const [id, n] of Object.entries(items)) {
      const c = Math.floor(Number(n));
      if (getItem(id) && c > 0) this._counts.set(id, Math.min(MAX_STACK, c));
    }
  }

  _save() {
    if (!this.persist) return;
    const items = {};
    for (const [id, n] of this._counts) if (n > 0) items[id] = n;
    writeSave(this.storageKey, { v: 1, items });
  }

  _emit(id, delta) {
    for (const fn of [...this._handlers.change]) {
      try { fn({ id, delta, count: this.count(id), inventory: this }); } catch (e) { console.error(e); }
    }
  }

  on(type, fn) {
    (this._handlers[type] ||= new Set()).add(fn);
    return () => this._handlers[type].delete(fn);
  }

  count(id) { return this._counts.get(id) || 0; }
  has(id, n = 1) { return this.count(id) >= n; }
  hasAll(need) { return Object.entries(need).every(([id, n]) => this.has(id, n)); }
  get total() { let t = 0; for (const n of this._counts.values()) t += n; return t; }

  add(id, n = 1) {
    n = Math.floor(n);
    if (!getItem(id) || !(n > 0)) return 0;
    const before = this.count(id);
    const after = Math.min(MAX_STACK, before + n);
    if (after === before) return after;
    this._counts.set(id, after);
    this._save();
    this._emit(id, after - before);
    return after;
  }

  remove(id, n = 1) {
    n = Math.floor(n);
    if (!(n > 0) || !this.has(id, n)) return false;
    const after = this.count(id) - n;
    if (after > 0) this._counts.set(id, after); else this._counts.delete(id);
    this._save();
    this._emit(id, -n);
    return true;
  }

  removeAll(need) {
    if (!this.hasAll(need)) return false;
    for (const [id, n] of Object.entries(need)) this.remove(id, n);
    return true;
  }

  /** Non-zero entries in catalogue order. */
  all() {
    const out = [];
    for (const def of listItems()) {
      const count = this.count(def.id);
      if (count > 0) out.push({ id: def.id, count, def });
    }
    return out;
  }

  reset() {
    const ids = [...this._counts.keys()];
    this._counts.clear();
    this._save();
    for (const id of ids) this._emit(id, 0);
  }
}
