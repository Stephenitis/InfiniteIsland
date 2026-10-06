// Reusable touch widget: floating joystick (left) + big A / smaller B buttons + a Jump button (right, below-right of A).
// Used by the phone controller page and by touchSource on touch devices (styles: /css/touch.css).
//
//   const tc = new TouchControls(containerEl, { onChange: (state, why) => {...} });
//   tc.state            // { x, y, interact, cancel, jump }  x right+, y UP+ in [-1, 1] (unit-disc clamped)
//   tc.takeTaps()       // { interactTap, cancelTap, jumpTap } true if the button went down since the last call (then cleared)
//   tc.reset()          // release everything (blur / hidden tab)
//   tc.destroy()
// `why` is 'stick' | 'interact' | 'cancel' | 'jump' | 'reset' so callers can send button changes immediately.

const PAW = `<svg viewBox="0 0 32 32" aria-hidden="true"><g fill="#2b2340">
  <ellipse cx="16" cy="21" rx="7.5" ry="6"/><ellipse cx="6.5" cy="14" rx="3" ry="3.8"/><ellipse cx="12.5" cy="8.5" rx="3" ry="3.8"/>
  <ellipse cx="19.5" cy="8.5" rx="3" ry="3.8"/><ellipse cx="25.5" cy="14" rx="3" ry="3.8"/></g></svg>`;
// Jump: a spring-up arrow.
const JUMP = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 6 L16 22 M8.5 13.5 L16 6 L23.5 13.5" stroke="#2b2340" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M9 27 H23" stroke="#2b2340" stroke-width="4" stroke-linecap="round"/></svg>`;
const CROSS = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 8 L24 24 M24 8 L8 24" stroke="#2b2340" stroke-width="5.5" stroke-linecap="round" fill="none"/></svg>`;

export class TouchControls {
  constructor(container, { onChange = null, radius = 60 } = {}) {
    this.container = container;
    this.onChange = onChange;
    this.radius = radius;
    this.state = { x: 0, y: 0, interact: false, cancel: false, jump: false };
    this._tapI = false;
    this._tapC = false;
    this._tapJ = false;
    this._stickId = null;
    this._btnIds = { interact: null, cancel: null, jump: null };
    this._origin = { x: 0, y: 0 };           // joystick base centre, root-relative px

    const root = this.root = document.createElement('div');
    root.className = 'tc';
    root.style.setProperty('--tc-r', radius + 'px');
    root.innerHTML = `
      <div class="tc-zone"></div>
      <div class="tc-stick idle hint"><div class="tc-knob"></div></div>
      <div class="tc-buttons">
        <button type="button" class="tc-btn tc-b" data-btn="cancel" aria-label="Cancel">${CROSS}<span class="tc-label">Cancel</span></button>
        <button type="button" class="tc-btn tc-a" data-btn="interact" aria-label="Interact">${PAW}<span class="tc-glyph">A</span><span class="tc-label">Interact</span></button>
        <button type="button" class="tc-btn tc-j" data-btn="jump" aria-label="Jump">${JUMP}<span class="tc-label">Jump</span></button>
      </div>`;
    container.appendChild(root);
    this.zone = root.querySelector('.tc-zone');
    this.stick = root.querySelector('.tc-stick');
    this.knob = root.querySelector('.tc-knob');
    this.btns = {
      interact: root.querySelector('[data-btn="interact"]'),
      cancel: root.querySelector('[data-btn="cancel"]'),
      jump: root.querySelector('[data-btn="jump"]'),
    };

    this._bind();
    this._placeIdle();
    this._onResize = () => { if (this._stickId === null) this._placeIdle(); };
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    this._onHidden = () => { if (document.hidden) this.reset(); };
    document.addEventListener('visibilitychange', this._onHidden);
    this._reset = () => this.reset();
    window.addEventListener('blur', this._reset);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---- public
  takeTaps() {
    const t = { interactTap: this._tapI, cancelTap: this._tapC, jumpTap: this._tapJ };
    this._tapI = this._tapC = this._tapJ = false;
    return t;
  }

  reset() {
    this._releaseStick(true);
    this._tapI = this._tapC = this._tapJ = false;
    for (const k of ['interact', 'cancel', 'jump']) {
      if (this.state[k]) { this._btnIds[k] = null; this.btns[k].classList.remove('down'); this.state[k] = false; }
    }
    this._emit('reset');
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    window.removeEventListener('blur', this._reset);
    document.removeEventListener('visibilitychange', this._onHidden);
    this.root.remove();
  }

  // ---- internals
  _emit(why) { if (this.onChange) this.onChange(this.state, why); }

  _rect() { return this.root.getBoundingClientRect(); }

  _placeIdle() {
    const r = this._rect();
    const R = this.radius;
    const x = Math.max(R + 24, Math.min(r.width * 0.5 - R - 10, r.width * 0.2));
    const y = Math.max(R + 24, r.height - R - 46);
    this._setBase(x, y);
    this.stick.classList.add('idle', 'hint');
    this.stick.classList.remove('active');
    this.knob.style.transform = '';
  }

  _setBase(x, y) {
    this._origin.x = x; this._origin.y = y;
    this.stick.style.left = x + 'px';
    this.stick.style.top = y + 'px';
  }

  _bind() {
    const zone = this.zone;
    zone.addEventListener('pointerdown', (e) => {
      if (this._stickId !== null) return;
      e.preventDefault();
      this._stickId = e.pointerId;
      try { zone.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      const r = this._rect();
      const R = this.radius + 12;
      const px = Math.max(R, Math.min(r.width - R, e.clientX - r.left));
      const py = Math.max(R, Math.min(r.height - R, e.clientY - r.top));
      this.stick.classList.remove('idle', 'hint');
      this.stick.classList.add('active');
      this._setBase(px, py);
      this._moveStick(e);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._stickId) return;
      e.preventDefault();
      this._moveStick(e);
    });
    const end = (e) => {
      if (e.pointerId !== this._stickId) return;
      this._releaseStick(false);
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);

    for (const k of ['interact', 'cancel', 'jump']) {
      const b = this.btns[k];
      b.addEventListener('pointerdown', (e) => {
        if (this._btnIds[k] !== null) return;
        e.preventDefault();
        this._btnIds[k] = e.pointerId;
        try { b.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        b.classList.add('down');
        this.state[k] = true;
        if (k === 'interact') this._tapI = true; else if (k === 'cancel') this._tapC = true; else this._tapJ = true;
        try { navigator.vibrate?.(10); } catch (_) { /* ignore */ }
        this._emit(k);
      });
      const up = (e) => {
        if (e.pointerId !== this._btnIds[k]) return;
        this._btnIds[k] = null;
        b.classList.remove('down');
        this.state[k] = false;
        this._emit(k);
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  _moveStick(e) {
    const r = this._rect();
    let dx = e.clientX - r.left - this._origin.x;
    let dy = e.clientY - r.top - this._origin.y;
    const R = this.radius;
    const m = Math.hypot(dx, dy);
    if (m > R) { dx *= R / m; dy *= R / m; }
    this.knob.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
    this.state.x = +(dx / R).toFixed(3);
    this.state.y = +(-dy / R).toFixed(3) || 0;     // screen-down is negative; `|| 0` avoids -0
    this._emit('stick');
  }

  _releaseStick(silent) {
    if (this._stickId === null) return;
    const id = this._stickId;
    this._stickId = null;
    try { this.zone.releasePointerCapture(id); } catch (_) { /* ignore */ }
    this.state.x = 0;
    this.state.y = 0;
    this._placeIdle();
    if (!silent) this._emit('stick');
  }
}
