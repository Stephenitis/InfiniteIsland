// Shared campfire quest (PLAN Step 15): ONE active quest for the whole island, a named feast with 3-5 requirements
// ({ item id: count }, ingredients and/or cooked dishes from catalog.js). Every requirement is obtainable in game.
//
//   QUESTS                      the templates: { id, name, blurb, needs: { id: n }, food: { kind, colors, ... } }  (`food` = the model of the feast dish
//                               shown in the cutscene, see game/feastScene.js)
//   getQuest(id)                template or null
//   const quests = new QuestLog({ inventory })
//   quests.active               the active template or null             quests.feasts     feasts completed so far
//   quests.start()              pick a random template (never the previous one) and make it the active quest; returns it (null if one is active)
//   quests.giveUp()             drop the active quest (the bag is untouched)
//   quests.progress()           [{ id, have, need, done, def }] per requirement (have is NOT capped)
//   quests.satisfied            every requirement is met right now
//   quests.doneCount            how many requirements are met
//   quests.beginFeast()         atomically consumes the requirements from the bag and flags the feast in progress; false if it can't
//   quests.finishFeast()        the feast scene ended: quest cleared, feasts++ (also called by itself on load when a feast was interrupted by a reload)
//   quests.on('change', fn)     fires on start / give up / finish; inventory changes are listened to by the UI itself
//   quests.summary()            debug snapshot
//
// World sync (Step 22b, domain 'quests'; `quests.attachSync(sync)`). ONE shared quest, owned by the host. State = { active, last, feasts, feasting }.
//   HOST: every mutation works as above and emits event state {active, last, feasts, feasting} to the replicas (the template is picked by the host's
//   Math.random, never repeating the previous one). REPLICA: the log is a mirror; start() / giveUp() send requests (start {id?} -> result = the picked
//   template id; giveUp {}), so `quests.start()` returns a PROMISE of the template (or null) there, a template synchronously on the host.
//   beginFeast / finishFeast are host-only (the feast domain in game/feastScene.js validates "Prepare the feast!" and runs them).
//   Progress is derived from the shared inventory (already synced), so no progress events exist. hashView = the state.
//
// Persisted under 'infinite-island.quests.v1' as { v, active, last, feasts, feasting } (?newgame wipes it). `last` remembers the previously
// picked template across completions and give-ups so the next pick can never repeat it.
import { getItem } from './catalog.js';
import { NEW_GAME, loadSave, writeSave, clearSave } from './save.js';

export const STORAGE_KEY = 'infinite-island.quests.v1';

// food.kind: 'bowl' (soup disc + garnish bits), 'pile' (heap of food blobs on a plate) or 'skewers' (sticks with balls on a plate); `colors` paint the blobs
// (the first one is the soup / the biggest blob). Every `needs` id must exist in catalog.js (checked by QuestLog below).
export const QUESTS = [
  {
    id: 'tropical-stew', name: 'Tropical Stew', blurb: 'a creamy, herby coconut stew',
    needs: { coconut: 1, potato: 2, herb: 1 },
    food: { kind: 'bowl', colors: ['#f7e7b4', '#2fc99a', '#d9a86e', '#8a5a3a'] },
  },
  {
    id: 'harvest-picnic', name: 'Harvest Picnic', blurb: 'a big cosy picnic basket',
    needs: { 'baked-potato': 1, 'fruit-skewer': 1, berry: 2 },
    food: { kind: 'pile', colors: ['#e0a052', '#ff7a8a', '#ff4d6d', '#ffb08a', '#ffe27a'] },
  },
  {
    id: 'forest-supper', name: 'Forest Supper', blurb: 'an earthy supper from the woods',
    needs: { 'grilled-mushrooms': 1, herb: 2, mushroom: 2 },
    food: { kind: 'pile', colors: ['#e0683c', '#fff1d6', '#2fc99a', '#a8703f', '#ff5560'] },
  },
  {
    id: 'sweet-treats', name: 'Sweet Treats', blurb: 'a tray of sticky sweet treats',
    needs: { 'berry-jam': 1, apple: 2, peach: 1 },
    food: { kind: 'skewers', colors: ['#ff4d6d', '#ffb08a', '#ff5468', '#e0416a'] },
  },
  {
    id: 'coconut-party', name: 'Coconut Party', blurb: 'a coconutty party bowl',
    needs: { 'coconut-soup': 1, coconut: 1, berry: 2 },
    food: { kind: 'bowl', colors: ['#f8efc9', '#ff4d6d', '#8a5a3a', '#4fdcae'] },
  },
  {
    id: 'cookout', name: 'Campfire Cookout', blurb: 'a smoky campfire cookout',
    needs: { 'baked-potato': 2, 'grilled-mushrooms': 1, log: 2 },
    food: { kind: 'pile', colors: ['#e0a052', '#e0683c', '#d9a86e', '#7a4a2a', '#fff3c4'] },
  },
  {
    id: 'orchard-delight', name: 'Orchard Delight', blurb: 'a juicy fruity orchard plate',
    needs: { apple: 2, peach: 2, berry: 2, herb: 1 },
    food: { kind: 'pile', colors: ['#ff5468', '#ffb08a', '#ff4d6d', '#7be05e', '#ff8a94'] },
  },
  {
    id: 'island-buffet', name: 'Grand Island Buffet', blurb: 'a little bit of everything',
    needs: { 'fruit-skewer': 1, 'coconut-soup': 1, 'berry-jam': 1, mushroom: 1, potato: 1 },
    food: { kind: 'skewers', colors: ['#ff7a8a', '#f5e6b8', '#e0416a', '#ff5560', '#d9a86e'] },
  },
];

export const getQuest = (id) => QUESTS.find((q) => q.id === id) || null;

export class QuestLog {
  constructor({ inventory, storageKey = STORAGE_KEY, persist = true } = {}) {
    this.inventory = inventory;
    this.storageKey = storageKey;
    this.persist = persist;
    this.active = null;
    this.last = null;           // id of the previously picked template (never picked twice in a row)
    this.feasts = 0;
    this.feasting = false;      // a feast scene is running: the ingredients are already gone
    this._handlers = { change: new Set() };
    this._sync = null;
    for (const q of QUESTS) for (const id of Object.keys(q.needs)) if (!getItem(id)) console.warn(`[quests] ${q.id} needs unknown item "${id}"`);
    if (persist) {
      if (NEW_GAME) clearSave(storageKey);
      else this._load();
    }
  }

  _load() {
    const d = loadSave(this.storageKey);
    if (!d || typeof d !== 'object') return;
    this.active = getQuest(d.active);
    this.last = getQuest(d.last) ? d.last : null;
    this.feasts = Math.max(0, Math.floor(Number(d.feasts)) || 0);
    if (d.feasting && this.active) {           // the page was reloaded in the middle of a feast: the ingredients were eaten, so count it
      this.last = this.active.id;
      this.active = null;
      this.feasts++;
      this._save();
    }
  }

  _save() {
    if (!this.persist) return;
    writeSave(this.storageKey, { v: 1, active: this.active ? this.active.id : null, last: this.last, feasts: this.feasts, feasting: this.feasting });
  }

  get _isReplica() { return !!this._sync && this._sync.isReplica; }
  _state() { return { active: this.active ? this.active.id : null, last: this.last, feasts: this.feasts, feasting: this.feasting }; }
  _emitState() { if (this._sync) this._sync.emit('quests', 'state', this._state()); }

  /** Replica: make the mirror say `s` (fires 'change' when something differs, never saves). */
  _mirror(s) {
    if (!s) return;
    const active = getQuest(s.active);
    const next = { active, last: getQuest(s.last) ? s.last : null, feasts: Math.max(0, Math.floor(Number(s.feasts)) || 0), feasting: !!s.feasting };
    const changed = next.active !== this.active || next.last !== this.last || next.feasts !== this.feasts || next.feasting !== this.feasting;
    this.active = next.active; this.last = next.last; this.feasts = next.feasts; this.feasting = next.feasting;
    if (changed) this._emit('change');
  }

  /** Register as the 'quests' world-sync domain (see the header). */
  attachSync(sync) {
    this._sync = sync;
    sync.register('quests', {
      snapshot: () => this._state(),
      hashView: () => this._state(),
      applySnapshot: (s) => this._mirror(s),
      applyEvent: (kind, d) => { if (kind === 'state') this._mirror(d); },
      handleRequest: (kind, d) => {
        if (kind === 'start') { const q = this._start(d && typeof d.id === 'string' ? d.id : null); return q ? { result: q.id } : { reject: 'active' }; }
        if (kind === 'giveUp') return this._giveUp() ? true : { reject: 'no-quest' };
        return { reject: 'unknown-kind' };
      },
    });
  }

  on(type, fn) { this._handlers[type].add(fn); return () => this._handlers[type].delete(fn); }
  _emit(type) { for (const fn of [...this._handlers[type]]) { try { fn(this); } catch (e) { console.error(e); } } }

  /**
   * Pick a random template that is not the previous one. Returns it, or null when a quest is already active.
   * On a replica it asks the host and returns a Promise of the template (or null).
   */
  start(id = null) {
    if (this._isReplica) {
      if (this.active) return Promise.resolve(null);
      return this._sync.request('quests', 'start', id ? { id } : {}).then((r) => (r.ok ? getQuest(r.result) : null));
    }
    return this._start(id);
  }

  _start(id = null) {
    if (this.active) return null;
    let q = id ? getQuest(id) : null;
    if (!q) {
      const pool = QUESTS.filter((t) => t.id !== this.last);
      q = pool[Math.floor(Math.random() * pool.length)];
    }
    this.active = q;
    this.last = q.id;
    this.feasting = false;
    this._save();
    this._emit('change');
    this._emitState();
    return q;
  }

  giveUp() {
    if (!this.active || this.feasting) return false;
    if (this._isReplica) { this._sync.request('quests', 'giveUp', {}); return true; }
    return this._giveUp();
  }

  _giveUp() {
    if (!this.active || this.feasting) return false;
    this.active = null;
    this._save();
    this._emit('change');
    this._emitState();
    return true;
  }

  progress() {
    const q = this.active;
    if (!q) return [];
    return Object.entries(q.needs).map(([id, need]) => {
      const have = this.inventory.count(id);
      return { id, have, need, done: have >= need, def: getItem(id) };
    });
  }

  get satisfied() { return !!this.active && this.inventory.hasAll(this.active.needs); }
  get doneCount() { return this.progress().filter((r) => r.done).length; }

  /** Consume the requirements (all or nothing) and flag the feast as running. (Host / single screen only.) */
  beginFeast() {
    if (this._isReplica || !this.active || this.feasting || !this.inventory.removeAll(this.active.needs)) return false;
    this.feasting = true;
    this._save();
    this._emitState();
    return true;
  }

  /** The feast is over (or skipped): the quest is cleared and the feast counted. */
  finishFeast() {
    if (this._isReplica || !this.feasting) return false;
    this.feasting = false;
    this.active = null;
    this.feasts++;
    this._save();
    this._emit('change');
    this._emitState();
    return true;
  }

  summary() {
    return {
      active: this.active ? this.active.id : null, name: this.active ? this.active.name : null, last: this.last, feasts: this.feasts,
      feasting: this.feasting, satisfied: this.satisfied, progress: this.progress().map((r) => `${r.id} ${r.have}/${r.need}`),
    };
  }
}
