// Keyboard input source. Implements the shared source contract: poll() -> { x, y, interact, cancel, jump }.
//   x: right-positive, y: up/forward-positive (screen-up), both in [-1, 1] (diagonals normalised).
//   Move: WASD + arrow keys. Interact: E / Enter. Jump: Space (Step 47). Charm: R (Step 58). Cancel: Q / Escape / Backspace.
// attachMouse(canvas) / setSteer(fn) add held-left-mouse direction; mouse(x, y, held) is the debug hook.
// Uses KeyboardEvent.code so bindings are layout independent (WASD stays put on AZERTY etc.).

const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const UP = ['KeyW', 'ArrowUp'];
const DOWN = ['KeyS', 'ArrowDown'];
const INTERACT = ['KeyE', 'Enter', 'NumpadEnter'];
const JUMP = ['Space'];
const CHARM = ['KeyR'];
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
    this.mouseHeld = false;
    this.mouseX = this.mouseY = 0;
    this._mouseId = null;
    this._canvas = null;
    this._steer = null;
    // A key tapped and released between two polls would otherwise be missed; the latch keeps a fresh
    // interact / cancel press alive for exactly one poll so the press is handled on the frame it happens.
    this._latchInteract = false;
    this._latchCancel = false;
    this._latchJump = false;
    this._latchCharm = false;

    this._onKeyDown = (e) => {
      if (this._ignore(e)) return;
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) {
        if (INTERACT.includes(e.code)) this._latchInteract = true;
        else if (CANCEL.includes(e.code)) this._latchCancel = true;
        else if (JUMP.includes(e.code)) this._latchJump = true;
        else if (CHARM.includes(e.code)) this._latchCharm = true;
      }
      this.keys.add(e.code);
    };
    this._onKeyUp = (e) => {
      // Always release, even when modifiers/typing focus changed in between.
      this.keys.delete(e.code);
    };
    this._clear = () => this.releaseAll();
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
  releaseAll() { this.keys.clear(); this.releaseMouse(); }

  setSteer(fn) { this._steer = fn; }

  /** Canvas-relative CSS pixels, also used by synthetic input. No movement tap latch. */
  mouse(x, y, held) {
    this.mouseX = x; this.mouseY = y; this.mouseHeld = !!held;
    if (!held) this.releaseMouse();
  }

  releaseMouse() {
    const id = this._mouseId;
    this._mouseId = null;
    this.mouseHeld = false;
    this._canvas?.classList.remove('mouse-steering');
    if (id !== null) { try { this._canvas.releasePointerCapture(id); } catch (_) { /* capture already ended */ } }
  }

  attachMouse(canvas) {
    this._detachMouse();
    this._canvas = canvas;
    const position = (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left; this.mouseY = e.clientY - r.top;
    };
    this._mouseDown = (e) => {
      if (e.target !== canvas || e.pointerType !== 'mouse' || e.button !== 0 || this._mouseId !== null) return;
      position(e); this.mouseHeld = true; this._mouseId = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events may lack an active pointer */ }
    };
    this._mouseMove = (e) => {
      if (e.pointerType !== 'mouse' || e.pointerId !== this._mouseId) return;
      if (!(e.buttons & 1)) { this.releaseMouse(); return; }
      position(e);
    };
    this._mouseEnd = (e) => {
      if (e.pointerType === 'mouse' && e.pointerId === this._mouseId && (e.type !== 'pointerup' || e.button === 0)) this.releaseMouse();
    };
    canvas.addEventListener('pointerdown', this._mouseDown);
    canvas.addEventListener('pointermove', this._mouseMove);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, this._mouseEnd);
    // Fallback when capture is unavailable (including synthetic browser tests).
    window.addEventListener('pointerup', this._mouseEnd);
  }

  _detachMouse() {
    this.releaseMouse();
    const c = this._canvas;
    if (!c) return;
    c.removeEventListener('pointerdown', this._mouseDown);
    c.removeEventListener('pointermove', this._mouseMove);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) c.removeEventListener(type, this._mouseEnd);
    window.removeEventListener('pointerup', this._mouseEnd);
    this._canvas = null;
  }

  poll() {
    const k = this.keys;
    let x = (anyDown(k, RIGHT) ? 1 : 0) - (anyDown(k, LEFT) ? 1 : 0);
    let y = (anyDown(k, UP) ? 1 : 0) - (anyDown(k, DOWN) ? 1 : 0);
    if (x !== 0 && y !== 0) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }   // normalise diagonals
    // Opposing movement keys still win, even when their axes cancel to zero.
    if (this.mouseHeld && this._steer && !anyDown(k, LEFT) && !anyDown(k, RIGHT) && !anyDown(k, UP) && !anyDown(k, DOWN)) {
      const steer = this._steer(this.mouseX, this.mouseY);
      x = steer.x; y = steer.y;
    }
    const out = {
      x, y,
      interact: this._latchInteract || anyDown(k, INTERACT),
      cancel: this._latchCancel || anyDown(k, CANCEL),
      jump: this._latchJump || anyDown(k, JUMP),
      interactTap: this._latchInteract,      // forces a press edge even if the previous poll was also "down"
      cancelTap: this._latchCancel,
      jumpTap: this._latchJump,
      charm: this._latchCharm || anyDown(k, CHARM),
      charmTap: this._latchCharm,
    };
    if (this.mouseHeld) out.activity = true;   // a press at the dead radius can still rejoin / wake the title
    this._latchInteract = this._latchCancel = this._latchJump = this._latchCharm = false;
    return out;
  }

  dispose() {
    this._target.removeEventListener('keydown', this._onKeyDown);
    this._target.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._clear);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.releaseAll();
    this._detachMouse();
  }
}
