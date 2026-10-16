// SlotTable (PLAN Step 23): the island's global player slots. PURE LOGIC (no three.js / DOM), unit-tested in test/slotTable.test.js.
//
// The HOST owns the table: P1-P4 (slot 0-3) are handed out to "claimants" on any screen. A claimant is (screen, dev): the screen id
// ('host' or a replica's 's1' ...) and a device id that is unique inside that screen ('local', 'pad:0', 'phone:c-xyz', 'debug:dbg1').
// Claims are idempotent: the same (screen, dev) always gets the same slot back, which is what makes a reload / reconnect within the grace
// period restore a screen's players. Replicas hold a read-only copy (`load`) that the host broadcasts on every change.
//
//   const t = new SlotTable(4);
//   t.claim('host', 'p1', { kind: 'keyboard' })   -> { ok:true, slot:0, existing:false } | { ok:false, reason:'full' }     ({ bot: true, name } marks a party bot, Step 80a: a host-screen player driven by code)
//   t.release('s1', 'pad:0')                      -> slot freed (true) or false
//   t.releaseScreen('s1')                         -> frees every slot of that screen (grace period over), returns the freed slots
//   t.setAway('s1', true)                         -> the screen lost its link: its slots stay reserved but show as away
//   t.snapshot() / t.load(snap)                   -> [ null | { screen, dev, kind, name, away } x max ]  (JSON-safe)
//   t.find(screen, dev) / t.get(slot) / t.count / t.isFull / t.ownedBy(screen)

export class SlotTable {
  constructor(max = 4, names = null) {
    this.max = max;
    this.names = names;                          // optional ['P1', ...]; default P<slot+1>
    this.slots = new Array(max).fill(null);
  }

  nameOf(slot) { return (this.names && this.names[slot]) || `P${slot + 1}`; }
  get count() { return this.slots.filter(Boolean).length; }
  get isFull() { return this.count >= this.max; }
  get(slot) { return this.slots[slot] || null; }

  /** Slot held by (screen, dev), or -1. */
  find(screen, dev) { return this.slots.findIndex((s) => s && s.screen === screen && s.dev === dev); }
  ownedBy(screen) { const out = []; this.slots.forEach((s, i) => { if (s && s.screen === screen) out.push(i); }); return out; }

  /** Give (screen, dev) the lowest free slot (or the one it already holds). `info` = { kind?, name? }. */
  claim(screen, dev, info = {}) {
    const have = this.find(screen, dev);
    if (have >= 0) {
      const s = this.slots[have];
      if (info.kind) s.kind = info.kind;
      s.away = false;
      return { ok: true, slot: have, existing: true };
    }
    const slot = this.slots.findIndex((s) => !s);
    if (slot < 0) return { ok: false, reason: 'full' };
    this.slots[slot] = { screen, dev, kind: info.kind || 'gamepad', name: info.name || this.nameOf(slot), away: false, ...(info.bot ? { bot: true } : {}) };
    return { ok: true, slot, existing: false };
  }

  release(screen, dev) {
    const i = this.find(screen, dev);
    if (i < 0) return false;
    this.slots[i] = null;
    return true;
  }

  releaseSlot(slot) { if (!this.slots[slot]) return false; this.slots[slot] = null; return true; }

  releaseScreen(screen) {
    const freed = [];
    this.slots.forEach((s, i) => { if (s && s.screen === screen) { this.slots[i] = null; freed.push(i); } });
    return freed;
  }

  /** Mark every slot of a screen away / back. Returns true when anything changed. */
  setAway(screen, away) {
    let changed = false;
    for (const s of this.slots) if (s && s.screen === screen && s.away !== !!away) { s.away = !!away; changed = true; }
    return changed;
  }

  setKind(screen, dev, kind) {
    const s = this.slots[this.find(screen, dev)];
    if (!s || s.kind === kind) return false;
    s.kind = kind;
    return true;
  }

  snapshot() { return this.slots.map((s) => (s ? { screen: s.screen, dev: s.dev, kind: s.kind, name: s.name, away: !!s.away, ...(s.bot ? { bot: true } : {}) } : null)); }

  load(snap) {
    const list = Array.isArray(snap) ? snap : [];
    this.slots = Array.from({ length: this.max }, (_, i) => {
      const s = list[i];
      return s && typeof s === 'object' ? { screen: String(s.screen), dev: String(s.dev), kind: String(s.kind || 'gamepad'), name: String(s.name || this.nameOf(i)), away: !!s.away, ...(s.bot ? { bot: true } : {}) } : null;
    });
  }
}
