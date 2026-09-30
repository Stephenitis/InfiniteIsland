// Gamepad input hub. Enumerates EVERY connected pad; each pad is its own device (Step 11).
//   Move: left stick (axes 0/1, y inverted so up is +y) or the D-pad (buttons 12-15, or a hat-switch axis on
//   non-standard pads; wins over the stick when pressed).
//   Buttons depend on the pad's profile (see PROFILES / detectProfile):
//     standard  - Interact: A / Cross (button 0).  Cancel: B / Circle (button 1).
//     gamecube  - Wii U / Mayflash GameCube (and Wii) USB adapters, raw DirectInput order:
//                 Interact: A (button 1).  Cancel: B (button 2).
//   Force a profile with ?pad=gamecube or ?pad=standard.
//
//   const pads = new GamepadSource();
//   pads.on('connect', ({ id, index, profile }) => ...);   pads.on('disconnect', ({ id, index }) => ...);
//   pads.pads            // Map<index, { index, id, mapping, profile, connected }> of currently connected pads
//   pads.sync()          // re-read navigator.getGamepads() and detect connect / disconnect (the PlayerManager calls it once per frame)
//   pads.view(index)     // per-pad source ({ name:'gamepad', analog:true, poll() }) for an InputManager; reads the last sync() snapshot
//
// `poll()` on the hub itself still works like the old single-pad source (first pad). Degrades gracefully (never
// connected, no errors) when the Gamepad API is missing. Connect / disconnect is detected from the gamepadconnected
// events AND by polling navigator.getGamepads(), so pads injected in tests (no events) work too. Buttons are sampled
// once per frame like every polled Gamepad API user (there are no events to latch sub-frame taps from), so the
// `interactTap` / `cancelTap` flags are always false here; edges come from the per-device InputManager.

const DPAD_UP = 12, DPAD_DOWN = 13, DPAD_LEFT = 14, DPAD_RIGHT = 15;

const isDown = (b) => !!b && (typeof b === 'object' ? (b.pressed || b.value > 0.5) : b > 0.5);

// Button layouts. `stickScale` boosts sticks that never reach +-1 (the GameCube octagon gate tops out around 0.75-0.85).
export const PROFILES = {
  standard: { key: 'standard', label: 'Controller',         interact: [0], cancel: [1], stickScale: 1 },
  gamecube: { key: 'gamecube', label: 'GameCube controller', interact: [1], cancel: [2], stickScale: 1.3 },
};

// Known USB adapters (vendor:product, lowercase hex).
const GAMECUBE_IDS = new Set([
  '057e:0337',                              // Nintendo Wii U GameCube adapter (WUP-028)
  '0079:1843', '0079:1844', '0079:1846',    // Mayflash GameCube adapters (PC mode)
]);
const GAMECUBE_NAME = /game ?cube|wii ?u|\bwii\b|wiimote|dolphinbar|mayflash/i;

/** Vendor / product ids from Gamepad.id. Chrome: "... (Vendor: 057e Product: 0337)", Firefox: "57e-337-Name". */
export function parsePadId(id = '') {
  let m = /vendor:\s*([0-9a-f]{1,4}).*?product:\s*([0-9a-f]{1,4})/i.exec(id);
  if (!m) m = /^([0-9a-f]{1,4})-([0-9a-f]{1,4})-/i.exec(id);
  if (!m) return null;
  const pad4 = (h) => h.toLowerCase().padStart(4, '0');
  return { vendor: pad4(m[1]), product: pad4(m[2]) };
}

let forcedProfile = null;
try { forcedProfile = PROFILES[new URLSearchParams(location.search).get('pad')] || null; } catch (_) { /* no location */ }

/**
 * Pick a button layout for a pad. A pad the browser recognises (mapping === 'standard') already has its buttons
 * normalised to the standard layout, so only non-standard pads are matched against the adapter list / name.
 */
export function detectProfile(pad) {
  if (forcedProfile) return forcedProfile;
  if (!pad || pad.mapping === 'standard') return PROFILES.standard;
  const ids = parsePadId(pad.id);
  if (ids && GAMECUBE_IDS.has(`${ids.vendor}:${ids.product}`)) return PROFILES.gamecube;
  if (GAMECUBE_NAME.test(pad.id || '')) return PROFILES.gamecube;
  return PROFILES.standard;
}

// Non-standard pads in Chrome report the D-pad as one hat-switch axis: 8 directions spaced 2/7 apart from -1 (up)
// clockwise to 1 (up-left); anything outside [-1, 1] (about 1.29) means centred.
const HAT_DIRS = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
function readHat(v) {
  if (typeof v !== 'number' || v < -1.05 || v > 1.05) return null;
  const k = (v + 1) / (2 / 7);
  const i = Math.round(k);
  if (Math.abs(k - i) > 0.15 || i < 0 || i > 7) return null;   // not a hat value: an ordinary analog axis
  return HAT_DIRS[i];
}

export class GamepadSource {
  constructor(target = window) {
    this.name = 'gamepad';
    this.analog = true;
    this.supported = typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function';
    this.pads = new Map();               // index -> { index, id, connected: true }
    this._views = new Map();
    this._target = target;
    this._handlers = { connect: [], disconnect: [] };
    this._out = { x: 0, y: 0, interact: false, cancel: false };
    this._snapshot = [];

    this._onConnect = () => this.sync();
    this._onDisconnect = () => this.sync();
    if (this.supported) {
      target.addEventListener('gamepadconnected', this._onConnect);
      target.addEventListener('gamepaddisconnected', this._onDisconnect);
    }
  }

  on(type, fn) {
    if (this._handlers[type]) this._handlers[type].push(fn);
    return this;
  }

  _emit(type, info) {
    for (const fn of this._handlers[type]) { try { fn(info); } catch (e) { console.error(e); } }
  }

  get connected() { return this.pads.size > 0; }
  get count() { return this.pads.size; }
  /** First connected pad's index / id (legacy single-pad accessors). */
  get index() { const f = this.pads.values().next().value; return f ? f.index : -1; }
  get id() { const f = this.pads.values().next().value; return f ? f.id : ''; }

  _read() {
    if (!this.supported) return [];
    let list = null;
    try { list = navigator.getGamepads(); } catch (e) { return []; }
    return list || [];
  }

  /** Re-read the pads and detect connect / disconnect transitions per pad index. */
  sync() {
    const list = this._read();
    const seen = new Set();
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p || p.connected === false) continue;
      seen.add(p.index);
      const cur = this.pads.get(p.index);
      if (!cur) {
        const profile = detectProfile(p);
        const info = { index: p.index, id: p.id || '', mapping: p.mapping || '', profile, connected: true };
        this.pads.set(p.index, info);
        console.info(`[gamepad] #${p.index} "${info.id}" mapping="${info.mapping}" -> ${profile.key}`);
        this._emit('connect', { id: info.id, index: info.index, profile });
      } else {
        cur.id = p.id || cur.id;
      }
    }
    for (const [idx, info] of [...this.pads]) {
      if (seen.has(idx)) continue;
      this.pads.delete(idx);
      this._emit('disconnect', { id: info.id, index: idx });
    }
    this._snapshot = list;
  }

  _pad(index) {
    const list = this._snapshot;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p && p.index === index && p.connected !== false) return p;
    }
    return null;
  }

  _fill(out, pad) {
    out.x = 0; out.y = 0; out.interact = false; out.cancel = false;
    if (!pad) return out;
    const info = this.pads.get(pad.index);
    const prof = (info && info.profile) || PROFILES.standard;
    const b = pad.buttons || [];
    const a = pad.axes || [];
    let dx = (isDown(b[DPAD_RIGHT]) ? 1 : 0) - (isDown(b[DPAD_LEFT]) ? 1 : 0);
    let dy = (isDown(b[DPAD_UP]) ? 1 : 0) - (isDown(b[DPAD_DOWN]) ? 1 : 0);
    if (dx === 0 && dy === 0 && pad.mapping !== 'standard' && a.length > 9) {
      const hat = readHat(a[9]);
      if (hat) { dx = hat[0]; dy = hat[1]; }
    }
    if (dx !== 0 || dy !== 0) {
      out.x = dx; out.y = dy;          // manager clamps the diagonal to length 1
    } else {
      let x = a[0] || 0, y = -(a[1] || 0);   // stick up is negative on the raw axis
      // Empty adapter ports can rest at a hard corner (+-1, +-1); a real stick can't reach one, so ignore it.
      if (prof.key === 'gamecube' && Math.abs(x) > 0.98 && Math.abs(y) > 0.98) x = y = 0;
      out.x = x * prof.stickScale;
      out.y = y * prof.stickScale;
    }
    out.interact = prof.interact.some((i) => isDown(b[i]));
    out.cancel = prof.cancel.some((i) => isDown(b[i]));
    return out;
  }

  /** Per-pad source for an InputManager (one per index). */
  view(index) {
    let v = this._views.get(index);
    if (v) return v;
    const hub = this;
    const out = { x: 0, y: 0, interact: false, cancel: false };
    v = {
      name: 'gamepad',
      analog: true,
      index,
      poll() { return hub._fill(out, hub._pad(index)); },
    };
    this._views.set(index, v);
    return v;
  }

  /** Legacy single-pad poll: the first connected pad. */
  poll() {
    this.sync();
    const first = this.pads.values().next().value;
    return this._fill(this._out, first ? this._pad(first.index) : null);
  }

  dispose() {
    if (this.supported) {
      this._target.removeEventListener('gamepadconnected', this._onConnect);
      this._target.removeEventListener('gamepaddisconnected', this._onDisconnect);
    }
  }
}
