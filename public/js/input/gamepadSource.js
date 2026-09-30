// Gamepad input source (standard mapping). Implements the shared source contract: poll() -> { x, y, interact, cancel }.
//   Move: left stick (axes 0/1, y inverted so up is +y) or the D-pad (buttons 12-15; wins over the stick when pressed).
//   Interact: A / Cross (button 0).  Cancel: B / Circle (button 1).
// The first connected pad is used. `analog = true` so the manager applies its radial deadzone to the stick.
//
//   const pad = new GamepadSource();
//   pad.on('connect', (info) => ...);   // info = { id, index }
//   pad.on('disconnect', (info) => ...);
//   pad.connected                       // boolean
//
// Degrades gracefully (never connected, no errors) when the Gamepad API is missing.

const BTN_A = 0, BTN_B = 1, DPAD_UP = 12, DPAD_DOWN = 13, DPAD_LEFT = 14, DPAD_RIGHT = 15;

const isDown = (b) => !!b && (typeof b === 'object' ? (b.pressed || b.value > 0.5) : b > 0.5);

export class GamepadSource {
  constructor(target = window) {
    this.name = 'gamepad';
    this.analog = true;
    this.supported = typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function';
    this.connected = false;
    this.id = '';
    this.index = -1;
    this._target = target;
    this._handlers = { connect: [], disconnect: [] };
    this._out = { x: 0, y: 0, interact: false, cancel: false };

    this._onConnect = () => this._refresh();
    this._onDisconnect = () => this._refresh();
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

  /** First connected pad in the current snapshot (or null). Some browsers return a live list, some a snapshot. */
  _getPad() {
    if (!this.supported) return null;
    let pads = null;
    try { pads = navigator.getGamepads(); } catch (e) { return null; }
    if (!pads) return null;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (p && p.connected !== false) return p;
    }
    return null;
  }

  /** Detect connect / disconnect transitions (from events or from polling, whichever notices first). */
  _refresh() {
    const pad = this._getPad();
    if (pad && !this.connected) {
      this.connected = true;
      this.id = pad.id || '';
      this.index = pad.index;
      this._emit('connect', { id: this.id, index: this.index });
    } else if (!pad && this.connected) {
      const info = { id: this.id, index: this.index };
      this.connected = false;
      this.id = '';
      this.index = -1;
      this._emit('disconnect', info);
    }
    return pad;
  }

  poll() {
    const out = this._out;
    out.x = 0; out.y = 0; out.interact = false; out.cancel = false;
    if (!this.supported) return out;
    const pad = this._refresh();
    if (!pad) return out;

    const b = pad.buttons || [];
    const dx = (isDown(b[DPAD_RIGHT]) ? 1 : 0) - (isDown(b[DPAD_LEFT]) ? 1 : 0);
    const dy = (isDown(b[DPAD_UP]) ? 1 : 0) - (isDown(b[DPAD_DOWN]) ? 1 : 0);
    if (dx !== 0 || dy !== 0) {
      out.x = dx; out.y = dy;          // manager clamps the diagonal to length 1
    } else {
      const a = pad.axes || [];
      out.x = a[0] || 0;
      out.y = -(a[1] || 0);            // stick up is negative on the raw axis
    }
    out.interact = isDown(b[BTN_A]);
    out.cancel = isDown(b[BTN_B]);
    return out;
  }

  dispose() {
    if (this.supported) {
      this._target.removeEventListener('gamepadconnected', this._onConnect);
      this._target.removeEventListener('gamepaddisconnected', this._onDisconnect);
    }
  }
}
