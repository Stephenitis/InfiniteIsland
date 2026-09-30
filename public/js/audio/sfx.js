// Tiny synthesized WebAudio sound blips (no audio files): pop, bip, rustle, clink, chime and dialog text blips.
//
//   const sfx = new Sfx();            // registers first-gesture listeners; the AudioContext is created on the first key / pointer / touch
//   sfx.unlock();                     // also callable manually (e.g. on a gamepad button press)
//   sfx.play('pop' | 'bip' | 'rustle' | 'leaves' | 'clink' | 'chime' | 'blip')
//   sfx.toggleMute() -> boolean muted;  sfx.muted;  sfx.onChange(fn(muted))
//
// Mute state persists in localStorage (guarded: storage may be unavailable). Nothing plays until the page has had a gesture.
const STORE_KEY = 'infiniteIsland.muted';
const MASTER_VOL = 0.55;

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this._noiseBuf = null;
    this._lastBlip = 0;
    this._listeners = new Set();
    try { this.muted = localStorage.getItem(STORE_KEY) === '1'; } catch (_) { /* storage unavailable */ }

    const gestures = ['keydown', 'pointerdown', 'touchstart', 'mousedown'];
    this._onGesture = () => {
      this.unlock();
      if (this.ctx && this.ctx.state === 'running') {
        for (const g of gestures) window.removeEventListener(g, this._onGesture, true);
      }
    };
    for (const g of gestures) window.addEventListener(g, this._onGesture, { capture: true, passive: true });
  }

  /** Create / resume the AudioContext. Safe to call any number of times. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : MASTER_VOL;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx.state === 'running';
    } catch (_) {
      return false;
    }
  }

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }

  setMuted(m) {
    this.muted = !!m;
    try { localStorage.setItem(STORE_KEY, this.muted ? '1' : '0'); } catch (_) { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : MASTER_VOL, this.ctx.currentTime, 0.02);
    for (const fn of this._listeners) fn(this.muted);
    return this.muted;
  }

  toggleMute() { return this.setMuted(!this.muted); }

  // ---------------------------------------------------------------------------------- building blocks
  _tone(type, f0, f1, dur, vol, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  _noiseBuffer() {
    if (!this._noiseBuf) {
      const c = this.ctx, n = c.sampleRate;
      const buf = c.createBuffer(1, n, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this._noiseBuf = buf;
    }
    return this._noiseBuf;
  }

  /** Filtered noise burst made of `pulses` quick amplitude bumps (rustle / clicks). */
  _noise(dur, vol, { type = 'bandpass', f = 3000, q = 0.8, pulses = 1, delay = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this._noiseBuffer();
    const filt = c.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = f;
    filt.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    const step = dur / pulses;
    for (let i = 0; i < pulses; i++) {
      const a = t + i * step;
      const v = vol * (0.55 + 0.45 * Math.random());
      g.gain.exponentialRampToValueAtTime(v, a + step * 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, a + step * 0.95);
    }
    src.connect(filt).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.4);
    src.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------------------------- public
  play(name, opts = {}) {
    if (this.muted || !this.ctx) return;
    if (this.ctx.state !== 'running') { this.unlock(); if (this.ctx.state !== 'running') return; }
    const pitch = opts.pitch ?? 1;
    const v = opts.vol ?? 1;
    switch (name) {
      case 'pop':      // soft bubbly pop
        this._tone('sine', 420 * pitch, 900 * pitch, 0.11, 0.22 * v);
        this._tone('sine', 840 * pitch, 1500 * pitch, 0.06, 0.05 * v);
        break;
      case 'bip':      // lower, shorter "cancel / hop" bip
        this._tone('triangle', 330 * pitch, 230 * pitch, 0.11, 0.2 * v);
        break;
      case 'rustle':   // bush: bright leafy noise
        this._noise(0.32, 0.22 * v, { f: 3800, q: 0.7, pulses: 4 });
        break;
      case 'leaves':   // tree / palm: softer, lower rustle + a tiny thump
        this._noise(0.4, 0.2 * v, { f: 2200, q: 0.6, pulses: 5 });
        this._tone('sine', 150, 90, 0.12, 0.1 * v);
        break;
      case 'clink':    // rock: two bright partials + a click
        this._tone('sine', 1760, 1740, 0.32, 0.13 * v);
        this._tone('sine', 2640, 2600, 0.22, 0.07 * v);
        this._tone('triangle', 3520, 3480, 0.1, 0.04 * v, 0.02);
        this._noise(0.03, 0.12 * v, { type: 'highpass', f: 5000, q: 0.5 });
        break;
      case 'chime':    // phone connected
        this._tone('sine', 660, 660, 0.18, 0.16 * v);
        this._tone('sine', 990, 990, 0.26, 0.16 * v, 0.1);
        break;
      case 'blip': {   // dialog text blips (throttled, quiet)
        const now = this.ctx.currentTime;
        if (now - this._lastBlip < 0.055) return;
        this._lastBlip = now;
        const f = (330 + Math.random() * 130) * pitch;
        this._tone('square', f, f * 0.97, 0.045, 0.028 * v);
        break;
      }
      default: break;
    }
  }
}
