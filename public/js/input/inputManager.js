// Merges any number of input sources into one per-frame action set.
//
// A source is any object with `poll() -> { x, y, interact, cancel }` (x right+, y up/forward+, buttons held).
// Optional `jump` (held, Step 47: Space / X / Y / the touch Jump button) behaves like the others; sources without it report false.
// Optional `charm` (held, Step 58: R / X or RB / the touch Charm button) behaves the same; `charmTap` forces its edge.
// Optional `interactTap` / `cancelTap` / `jumpTap` in the poll result force a press edge (a tap that came and went between polls).
// Optional `menu` / `menuTap`: the menu button (gamepad Start, the phone pad's Bag button) -> `menuPressed` (edge only).
// Optional flag `source.analog = false` marks digital sources (keyboard, D-pad only) that skip the deadzone.
//
//   const input = new InputManager();
//   input.addSource('keyboard', new KeyboardSource());
//   const a = input.update();
//   // a = { move:{x,z}, interactPressed, cancelPressed, jumpPressed, interactHeld, cancelHeld, jumpHeld, menuPressed, activeSource }
//
// Screen-up (y+) becomes world -Z because the follow camera never rotates.
import { DEADZONE } from '../config.js';

export class InputManager {
  constructor({ deadzone = DEADZONE, activeSource = 'keyboard' } = {}) {
    this.deadzone = deadzone;
    this._sources = new Map();          // name -> source
    this._prevInteract = false;
    this._prevCancel = false;
    this._prevJump = false;
    this._prevCharm = false;
    this._prevMenu = false;
    this._lastActive = activeSource;
    // Reused output object (consumers should read it within the frame and not keep it).
    this.state = {
      move: { x: 0, z: 0 },
      interactPressed: false, cancelPressed: false,
      jumpPressed: false, interactHeld: false, cancelHeld: false, jumpHeld: false,
      charmPressed: false, charmHeld: false,
      menuPressed: false,
      activeSource,
    };
  }

  addSource(name, source) {
    this._sources.set(name, source);
    return source;
  }

  removeSource(name) { this._sources.delete(name); }
  getSource(name) { return this._sources.get(name); }
  get sources() { return this._sources; }

  /** Apply the radial deadzone with rescale so output ramps 0..1 smoothly outside it. */
  _deadzone(x, y) {
    const m = Math.hypot(x, y);
    if (m <= this.deadzone) return { x: 0, y: 0, m: 0 };
    const clamped = Math.min(m, 1);
    const scaled = (clamped - this.deadzone) / (1 - this.deadzone);
    const k = scaled / m;
    return { x: x * k, y: y * k, m: scaled };
  }

  update() {
    let bestMag = 0, bestX = 0, bestY = 0, bestName = null;
    let interact = false, cancel = false;
    let interactTap = false, cancelTap = false, jumpTap = false, charmTap = false;
    let jump = false, charm = false;
    let menu = false, menuTap = false;   // sources may flag a press that already ended (tap shorter than a frame)
    let buttonSource = null;

    for (const [name, src] of this._sources) {
      const p = src.poll() || {};
      let x = Number.isFinite(p.x) ? p.x : 0;
      let y = Number.isFinite(p.y) ? p.y : 0;
      let m;
      if (src.analog === false) {
        m = Math.hypot(x, y);
        if (m > 1) { x /= m; y /= m; m = 1; }
      } else {
        ({ x, y, m } = this._deadzone(x, y));
      }
      if (m > bestMag) { bestMag = m; bestX = x; bestY = y; bestName = name; }
      if (p.interactTap) interactTap = true;
      if (p.cancelTap) cancelTap = true;
      if (p.jumpTap) jumpTap = true;
      if (p.jump) jump = true;
      if (p.charmTap) charmTap = true;
      if (p.charm) charm = true;
      if (p.menu) menu = true;
      if (p.menuTap) menuTap = true;
      if (p.interact || p.cancel || p.jump || p.charm) { interact = interact || !!p.interact; cancel = cancel || !!p.cancel; buttonSource = name; }
    }

    if (bestName) this._lastActive = bestName;
    else if (buttonSource) this._lastActive = buttonSource;

    const s = this.state;
    s.move.x = bestX;
    s.move.z = -bestY;
    s.interactPressed = (interact && !this._prevInteract) || interactTap;
    s.cancelPressed = (cancel && !this._prevCancel) || cancelTap;
    s.jumpPressed = (jump && !this._prevJump) || jumpTap;
    s.charmPressed = (charm && !this._prevCharm) || charmTap;
    s.charmHeld = charm;
    s.interactHeld = interact;
    s.cancelHeld = cancel;
    s.jumpHeld = jump;
    s.menuPressed = (menu && !this._prevMenu) || menuTap;
    s.activeSource = this._lastActive;
    this._prevInteract = interact;
    this._prevCancel = cancel;
    this._prevJump = jump;
    this._prevCharm = charm;
    this._prevMenu = menu;
    return s;
  }
}
