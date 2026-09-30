// Pure (no three.js) bookkeeping for the host-authoritative harvest / gathering timers, unit-tested in test/harvestLogic.test.js.
//
//   const hits = new HitTracker(8);
//   hits.hit('tree-7', need, now)  -> { hits, final }   // shared per target: every actor's hits add up; a target left alone for `memory` s starts over
//   hits.count('tree-7', now)      -> current hit count (0 once the memory ran out)
//   hits.reset('tree-7')
//
//   const regrow = new RegrowSchedule();
//   regrow.set('tree-7', at)                        // the target becomes due at simulation time `at`
//   regrow.due(now, (id) => standingThere(id), force)  -> ids that are due now AND not blocked (a player / remote actor stands on the spot);
//                                                          `force` ignores the blocking (debug regrowNow)
//   regrow.remaining('tree-7', now) / regrow.has(id) / regrow.cancel(id) / regrow.all(now) / regrow.ids()
// Only the HOST owns these (PLAN "Timers rule"): replicas never schedule anything, they receive `regrow` events.

export class HitTracker {
  constructor(memory = 8) {
    this.memory = memory;
    this._map = new Map();                     // id -> { hits, last }
  }

  hit(id, need, now) {
    let e = this._map.get(id);
    if (!e) { e = { hits: 0, last: -Infinity }; this._map.set(id, e); }
    if (now - e.last > this.memory) e.hits = 0;
    e.hits++;
    e.last = now;
    return { hits: e.hits, final: e.hits >= need };
  }

  count(id, now) {
    const e = this._map.get(id);
    return e && now - e.last <= this.memory ? e.hits : 0;
  }

  reset(id) { this._map.delete(id); }
}

export class RegrowSchedule {
  constructor() { this._at = new Map(); }

  set(id, at) { this._at.set(id, at); }
  cancel(id) { return this._at.delete(id); }
  has(id) { return this._at.has(id); }
  ids() { return [...this._at.keys()]; }
  get size() { return this._at.size; }
  remaining(id, now) { const a = this._at.get(id); return a === undefined ? null : Math.max(0, a - now); }
  /** Everything waiting: [{ id, in }] in scheduling order. */
  all(now) { return [...this._at].map(([id, at]) => ({ id, in: Math.max(0, at - now) })); }

  /** Ids whose time has come and that nothing blocks (they stay scheduled until the caller cancels them). */
  due(now, blocked = null, force = false) {
    const out = [];
    for (const [id, at] of this._at) {
      if (now < at && !force) continue;
      if (!force && blocked && blocked(id)) continue;
      out.push(id);
    }
    return out;
  }

  /** Debug: everything is due right now. */
  dueAll(now) { for (const id of this._at.keys()) this._at.set(id, now); }
}
