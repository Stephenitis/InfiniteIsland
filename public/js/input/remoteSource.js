// Input source fed by phone controllers over the RemoteLink. Merges all connected controllers:
// the largest stick wins, buttons are OR-ed. A stick older than STALE_MS is zeroed (lost connection = no runaway).
// Button down-edges are latched (interactTap / cancelTap) so a tap that comes and goes between two frames still counts.
const STALE_MS = 500;
const BUTTON_STALE_MS = 1500;   // controllers heartbeat every 100ms while anything is held

export class RemoteSource {
  constructor(link) {
    this.name = 'remote';
    this.analog = true;
    this.link = link;
    this.pads = new Map();          // id -> { x, y, interact, cancel, t }
    this._tapI = false;
    this._tapC = false;

    link.on('input', (m) => {
      const p = this.pads.get(m.id) || { x: 0, y: 0, interact: false, cancel: false, t: 0 };
      if (m.interact && !p.interact) this._tapI = true;
      if (m.cancel && !p.cancel) this._tapC = true;
      p.x = Number(m.x) || 0;
      p.y = Number(m.y) || 0;
      p.interact = !!m.interact;
      p.cancel = !!m.cancel;
      p.t = performance.now();
      this.pads.set(m.id, p);
    });
    link.on('controller-connected', (id) => {
      this.pads.set(id, { x: 0, y: 0, interact: false, cancel: false, t: performance.now() });
    });
    link.on('controller-disconnected', (id) => this.pads.delete(id));
  }

  get count() { return this.pads.size; }

  poll() {
    const now = performance.now();
    let bx = 0, by = 0, bm = 0, interact = false, cancel = false;
    for (const p of this.pads.values()) {
      const fresh = now - p.t <= STALE_MS;
      if (fresh) {
        const m = Math.hypot(p.x, p.y);
        if (m > bm) { bm = m; bx = p.x; by = p.y; }
      }
      // held buttons stay down until released, but a controller that went silent (>1.5s) can't leave one stuck
      if (now - p.t <= BUTTON_STALE_MS) {
        if (p.interact) interact = true;
        if (p.cancel) cancel = true;
      }
    }
    const out = { x: bx, y: by, interact: interact || this._tapI, cancel: cancel || this._tapC,
      interactTap: this._tapI, cancelTap: this._tapC };
    this._tapI = this._tapC = false;
    return out;
  }
}
