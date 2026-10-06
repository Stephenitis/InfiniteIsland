// Keyboard input source. Implements the shared source contract: poll() -> { x, y, interact, cancel, jump }.
//   x: right-positive, y: up/forward-positive (screen-up), both in [-1, 1] (diagonals normalised).
//   Move: WASD + arrow keys. Interact: E / Enter. Jump: Space (Step 47). Cancel: Q / Escape / Backspace.
// Uses KeyboardEvent.code so bindings are layout independent (WASD stays put on AZERTY etc.).

const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const UP = ['KeyW', 'ArrowUp'];
const DOWN = ['KeyS', 'ArrowDown'];
const INTERACT = ['KeyE', 'Enter', 'NumpadEnter'];
const JUMP = ['Space'];
const CANCEL = ['KeyQ', 'Escape', 'Backspace'];

// Keys whose default browser behaviour (page scroll, history back, button activation...) we swallow.
const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace']);

const anyDown = (keys, list) => {
  for (let i = 0; i < list.length; i++) if (keys.has(list[i])) return true;
  return false;
};

export class KeyboardSource {
  /** @param {Window|HTMLElement} [target=window] element that receives the key events */
  constructor(target = window) {
    this.name = 'keyboard';
    this.analog = false;          // digital source: the manager skips the radial deadzone
    this.keys = new Set();
    this._target = target;
    // A key tapped and released between two polls would otherwise be missed; the latch keeps a fresh
    // interact / cancel press alive for exactly one poll so the press is handled on the frame it happens.
    this._latchInteract = false;
    this._latchCancel = false;
    this._latchJump = false;

    this._onKeyDown = (e) => {
      if (this._ignore(e)) return;
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) {
        if (INTERACT.includes(e.code)) this._latchInteract = true;
        else if (CANCEL.includes(e.code)) this._latchCancel = true;
        else if (JUMP.includes(e.code)) this._latchJump = true;
      }
      this.keys.add(e.code);
    };
    this._onKeyUp = (e) => {
      // Always release, even when modifiers/typing focus changed in between.
      this.keys.delete(e.code);
    };
    this._clear = () => this.keys.clear();
    this._onVisibility = () => { if (document.hidden) this._clear(); };

    target.addEventListener('keydown', this._onKeyDown);
    target.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._clear);
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  _ignore(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return true;       // leave browser shortcuts alone
    const t = e.target;
    const tag = t && t.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable);
  }

  /** Programmatic key control (debug / tests). */
  press(code) { this.keys.add(code); }
  release(code) { this.keys.delete(code); }
  releaseAll() { this.keys.clear(); }

  poll() {
    const k = this.keys;
    let x = (anyDown(k, RIGHT) ? 1 : 0) - (anyDown(k, LEFT) ? 1 : 0);
    let y = (anyDown(k, UP) ? 1 : 0) - (anyDown(k, DOWN) ? 1 : 0);
    if (x !== 0 && y !== 0) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }   // normalise diagonals
    const out = {
      x, y,
      interact: this._latchInteract || anyDown(k, INTERACT),
      cancel: this._latchCancel || anyDown(k, CANCEL),
      jump: this._latchJump || anyDown(k, JUMP),
      interactTap: this._latchInteract,      // forces a press edge even if the previous poll was also "down"
      cancelTap: this._latchCancel,
      jumpTap: this._latchJump,
    };
    this._latchInteract = this._latchCancel = this._latchJump = false;
    return out;
  }

  dispose() {
    this._target.removeEventListener('keydown', this._onKeyDown);
    this._target.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._clear);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.keys.clear();
  }
}
