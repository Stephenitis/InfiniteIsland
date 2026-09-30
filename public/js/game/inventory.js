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
//
// World sync (Step 22): `inv.attachSync(sync)` registers the bag as the 'inventory' domain (net/worldSync.js).
//   HOST: every mutation works exactly as above and additionally emits {kind:'set', data:{id, count}} to the replicas (a no-op without any).
//   REPLICA: the bag is a mirror. add / remove / removeAll send a request to the host instead of mutating, and return an OPTIMISTIC
//   answer computed from the mirror (add -> count + n, remove / removeAll -> whether it is there); the real change arrives as a 'set'
//   event and fires 'change' (HUD chips, quest tracker) like any other change. So systems that call inventory.* keep working
//   unchanged on a replica; they just must not rely on the bag having changed synchronously. Requests: add {id,n}, remove {id,n}, removeAll {needs}.
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
    this._sync = null;
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

  get _isReplica() { return !!this._sync && this._sync.isReplica; }

  add(id, n = 1) {
    n = Math.floor(n);
    if (!getItem(id) || !(n > 0)) return 0;
    if (this._isReplica) { this._sync.request('inventory', 'add', { id, n }); return Math.min(MAX_STACK, this.count(id) + n); }
    return this._add(id, n);
  }

  remove(id, n = 1) {
    n = Math.floor(n);
    if (!(n > 0) || !this.has(id, n)) return false;
    if (this._isReplica) { this._sync.request('inventory', 'remove', { id, n }); return true; }
    return this._remove(id, n);
  }

  removeAll(need) {
    if (!this.hasAll(need)) return false;
    if (this._isReplica) { this._sync.request('inventory', 'removeAll', { needs: { ...need } }); return true; }
    for (const [id, n] of Object.entries(need)) this._remove(id, n);
    return true;
  }

  // the real mutations (host / single screen)
  _add(id, n) {
    const before = this.count(id);
    const after = Math.min(MAX_STACK, before + n);
    if (after === before) return after;
    this._counts.set(id, after);
    this._save();
    this._emit(id, after - before);
    this._sync?.emit('inventory', 'set', { id, count: after });
    return after;
  }

  _remove(id, n) {
    const after = this.count(id) - n;
    if (after > 0) this._counts.set(id, after); else this._counts.delete(id);
    this._save();
    this._emit(id, -n);
    this._sync?.emit('inventory', 'set', { id, count: Math.max(0, after) });
    return true;
  }

  /** Replica: make the mirror say `count` (fires 'change' with the difference, never saves). */
  _mirror(id, count) {
    const before = this.count(id);
    count = Math.max(0, Math.min(MAX_STACK, Math.floor(count) || 0));
    if (!getItem(id) || count === before) return;
    if (count > 0) this._counts.set(id, count); else this._counts.delete(id);
    this._emit(id, count - before);
  }

  /** Register as the 'inventory' world-sync domain (see the header). */
  attachSync(sync) {
    this._sync = sync;
    const items = () => { const o = {}; for (const [id, n] of this._counts) if (n > 0) o[id] = n; return o; };
    sync.register('inventory', {
      snapshot: () => ({ items: items() }),
      applySnapshot: (s) => {
        const want = (s && s.items) || {};
        for (const id of [...this._counts.keys()]) if (!(id in want)) this._mirror(id, 0);
        for (const [id, n] of Object.entries(want)) this._mirror(id, n);
      },
      applyEvent: (kind, d) => { if (kind === 'set') this._mirror(d.id, d.count); },
      handleRequest: (kind, d) => {
        if (kind === 'add') {
          const n = Math.floor(Number(d.n));
          if (!getItem(d.id) || !(n > 0) || n > MAX_STACK) return { reject: 'bad-request' };
          this._add(d.id, n);
          return true;
        }
        if (kind === 'remove') {
          const n = Math.floor(Number(d.n));
          if (!getItem(d.id) || !(n > 0) || !this.has(d.id, n)) return { reject: 'not-enough' };
          return this._remove(d.id, n);
        }
        if (kind === 'removeAll') {
          const needs = d.needs && typeof d.needs === 'object' ? d.needs : null;
          if (!needs || !Object.entries(needs).every(([id, n]) => getItem(id) && Math.floor(n) > 0)) return { reject: 'bad-request' };
          if (!this.hasAll(needs)) return { reject: 'not-enough' };
          for (const [id, n] of Object.entries(needs)) this._remove(id, Math.floor(n));
          return true;
        }
        return { reject: 'unknown-kind' };
      },
    });
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
    if (this._isReplica) return;                 // debug helper: only the host resets the shared bag
    const ids = [...this._counts.keys()];
    this._counts.clear();
    this._save();
    for (const id of ids) { this._emit(id, 0); this._sync?.emit('inventory', 'set', { id, count: 0 }); }
  }
}
