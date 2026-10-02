// One host-owned quest slot per regional campfire (Step 38c).
// The bag, completed-feast count and hat order remain shared. Legacy active / last / satisfied
// accessors and omitted fire ids mean home; gameplay menus and feasts always supply their fire id.
// v1 saves migrate each template to its region; v2 saves retain all slots and one running feast.
import { getItem, dishMakeable } from './catalog.js';
import { CAMPFIRE_ISLANDS } from '../config.js';
import { NEW_GAME, loadSave, writeSave, clearSave } from './save.js';
import { makeHatOrder, normaliseHatOrder } from './hatLogic.js';

export const LEGACY_STORAGE_KEY = 'infinite-island.quests.v1';
export const STORAGE_KEY = 'infinite-island.quests.v2';
export const questRegion = (q) => q.island || 'home';

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

QUESTS.push(
  { id: 'frostpine-supper', name: 'Frostpine Supper', blurb: 'a warm woodland stew under snowy stars', island: 'frost', needs: { 'forest-stew': 1, 'snow-truffle': 2, pinecone: 2 }, food: { kind: 'bowl', colors: ['#e9d6b9', '#ba7849', '#73bfa2', '#fff4df'] } },
  { id: 'snowberry-tea', name: 'Snowberry Tea Party', blurb: 'sweet berries and mint from the north', island: 'frost', needs: { 'lingonberry-tart': 1, 'toasted-pine-nuts': 1, mint: 2 }, food: { kind: 'pile', colors: ['#ee5772', '#edb978', '#65c6a6', '#fff4df'] } },
  { id: 'emberleaf-luau', name: 'Emberleaf Luau', blurb: 'a sunny feast of taro and tropical fruit', island: 'ember', needs: { 'taro-coconut-bake': 1, 'grilled-banana': 1, pineapple: 2 }, food: { kind: 'pile', colors: ['#b689af', '#ffd75c', '#f1ac41', '#fff0d2'] } },
  { id: 'jungle-skewers', name: 'Jungle Skewer Picnic', blurb: 'fresh skewers beside a cosy volcano', island: 'ember', needs: { 'pineapple-skewer': 2, 'breadfruit-roast': 1, coconut: 2 }, food: { kind: 'skewers', colors: ['#efb743', '#a6cf61', '#ffda57', '#fff2cd'] } },
);

export class QuestLog {
  constructor({ inventory, storageKey = STORAGE_KEY, persist = true, fireIslands = CAMPFIRE_ISLANDS } = {}) {
    this.inventory = inventory; this.fireIslands = fireIslands; this.storageKey = storageKey; this.persist = persist;
    this.slots = Object.fromEntries(['home', 'frost', 'ember'].map((id) => [id, { active: null, last: null }]));
    this.feasts = 0; this.hatOrder = makeHatOrder(); this.feastingFire = null;
    this._handlers = { change: new Set() }; this._sync = null; this._bridgeBuilt = () => false;
    if (persist) {
      if (NEW_GAME) { clearSave(storageKey); clearSave(LEGACY_STORAGE_KEY); }
      else this._load();
    }
  }
  activeFor(fireId) { return this.slots[fireId]?.active || null; }
  get active() { return this.activeFor('home'); }
  get last() { return this.slots.home.last; }
  get feasting() { return !!this.feastingFire; }
  get satisfied() { return this.satisfiedAt('home'); }
  get doneCount() { return this.progress().filter((r) => r.done).length; }
  satisfiedAt(fireId) { const q = this.activeFor(fireId); return !!q && this.inventory.hasAll(q.needs); }
  _load() {
    const d = loadSave(this.storageKey) || (this.storageKey === STORAGE_KEY ? loadSave(LEGACY_STORAGE_KEY) : null);
    if (!d || typeof d !== 'object') return;
    this._mirror(d);
    if (this.feastingFire) { // Requirements were already consumed: recover only that feast, exactly once.
      this.slots[this.feastingFire].active = null; this.feastingFire = null; this.feasts++;
    }
    this._save();
    if (this.storageKey === STORAGE_KEY) clearSave(LEGACY_STORAGE_KEY);
  }
  _save() { if (this.persist) writeSave(this.storageKey, this._state()); }
  get _isReplica() { return !!this._sync?.isReplica; }
  _state() {
    return { v: 2, slots: Object.fromEntries(Object.entries(this.slots).map(([id, s]) => [id, { active: s.active?.id || null, last: s.last }])),
      feasts: this.feasts, feastingFire: this.feastingFire, hatOrder: this.hatOrder };
  }
  _mirror(s) {
    if (!s || typeof s !== 'object') return;
    const before = JSON.stringify(this._state());
    for (const id of Object.keys(this.slots)) {
      const saved = s.slots?.[id];
      const q = getQuest(saved?.active), last = getQuest(saved?.last);
      this.slots[id] = { active: q && questRegion(q) === id ? q : null, last: last && questRegion(last) === id ? last.id : null };
    }
    if (!s.slots) { // Legacy singleton: template identity, rather than the former turn-in location, owns the quest.
      const q = getQuest(s.active), last = getQuest(s.last);
      if (q) this.slots[questRegion(q)].active = q;
      if (last) this.slots[questRegion(last)].last = last.id;
    }
    this.feasts = Math.max(0, Math.floor(Number(s.feasts)) || 0);
    this.hatOrder = normaliseHatOrder(s.hatOrder, this.feasts);
    const running = s.slots ? s.feastingFire : s.feasting && getQuest(s.active) ? questRegion(getQuest(s.active)) : null;
    this.feastingFire = this.activeFor(running) ? running : null;
    if (JSON.stringify(this._state()) !== before) this._emit('change');
  }
  _emitState() { this._sync?.emit('quests', 'state', this._state()); }
  attachSync(sync) {
    this._sync = sync;
    sync.register('quests', {
      snapshot: () => this._state(), hashView: () => this._state(), applySnapshot: (s) => this._mirror(s),
      applyEvent: (kind, d) => { if (kind === 'state') this._mirror(d); },
      handleRequest: (kind, d) => {
        const fireId = d?.fireId;
        if (!this.slots[fireId] || !this.fireIslands.includes(fireId)) return { reject: 'bad-fire' };
        if (kind === 'start') { const q = this._start(typeof d.id === 'string' ? d.id : null, fireId); return q ? { result: q.id } : { reject: 'unavailable' }; }
        if (kind === 'giveUp') return this._giveUp(fireId, d?.questId) ? true : { reject: 'no-quest' };
        return { reject: 'unknown-kind' };
      },
    });
  }
  on(type, fn) { this._handlers[type].add(fn); return () => this._handlers[type].delete(fn); }
  _emit(type) { for (const fn of [...this._handlers[type]]) { try { fn(this); } catch (e) { console.error(e); } } }
  start(id = null, fireId = 'home') {
    if (this.activeFor(fireId) || this.feasting) return this._isReplica ? Promise.resolve(null) : null;
    if (this._isReplica) return this._sync.request('quests', 'start', { fireId, ...(id ? { id } : {}) }).then((r) => r.ok ? getQuest(r.result) : null);
    return this._start(id, fireId);
  }
  _start(id, fireId) {
    const slot = this.slots[fireId];
    if (!slot || slot.active || this.feasting) return null;
    const available = this.available(fireId);
    let q = id ? available.find((t) => t.id === id) : null;
    if (id && !q) return null;
    if (!q) { const pool = available.filter((t) => t.id !== slot.last); q = pool[Math.floor(Math.random() * pool.length)]; }
    if (!q) return null;
    slot.active = q; slot.last = q.id; this._changed(); return q;
  }
  setBridgeProvider(fn) { this._bridgeBuilt = fn; }
  makeable(q) { return Object.keys(q.needs).every((id) => dishMakeable(id, this.fireIslands)); }
  available(fireId = null) {
    return QUESTS.filter((q) => (!fireId || questRegion(q) === fireId) && this.fireIslands.includes(questRegion(q)) &&
      (!q.island || this._bridgeBuilt(q.island)) && this.makeable(q));
  }
  giveUp(fireId = 'home', questId = this.activeFor(fireId)?.id) {
    if (!this.activeFor(fireId) || this.feastingFire === fireId) return false;
    if (this._isReplica) { this._sync.request('quests', 'giveUp', { fireId, questId }); return true; }
    return this._giveUp(fireId, questId);
  }
  _giveUp(fireId, questId = this.activeFor(fireId)?.id) {
    const q = this.activeFor(fireId);
    if (!q || q.id !== questId || this.feastingFire === fireId) return false;
    this.slots[fireId].active = null; this._changed(); return true;
  }
  progress(fireId = 'home') {
    const q = this.activeFor(fireId);
    return q ? Object.entries(q.needs).map(([id, need]) => { const have = this.inventory.count(id); return { id, have, need, done: have >= need, def: getItem(id) }; }) : [];
  }
  beginFeast(fireId = 'home') {
    const q = this.activeFor(fireId);
    if (this._isReplica || !q || !this.slots[fireId] || !this.fireIslands.includes(fireId) || questRegion(q) !== fireId || this.feasting) return false;
    this.feastingFire = fireId;
    if (!this.inventory.removeAll(q.needs)) { this.feastingFire = null; return false; }
    this._changed(); return true;
  }
  finishFeast(fireId = 'home') {
    if (this._isReplica || this.feastingFire !== fireId) return false;
    this.slots[fireId].active = null; this.feastingFire = null; this.feasts++; this._changed(); return true;
  }
  _changed() { this._save(); this._emit('change'); this._emitState(); }
  summary(fireId = 'home') {
    const q = this.activeFor(fireId);
    return { fireId, active: q?.id || null, name: q?.name || null, last: this.slots[fireId]?.last || null, feasts: this.feasts,
      feasting: this.feasting, feastingFire: this.feastingFire, slots: this._state().slots, satisfied: this.satisfiedAt(fireId), progress: this.progress(fireId).map((r) => `${r.id} ${r.have}/${r.need}`) };
  }
}
