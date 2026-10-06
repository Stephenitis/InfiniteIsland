// Tiny synthesized WebAudio sound blips (no audio files): pop, bip, rustle, clink, chime, dialog text blips and
// item sounds (equip, whoosh, thud, saber-on / saber-off / saber-swing).
//
//   const sfx = new Sfx();            // registers first-gesture listeners; the AudioContext is created on the first key / pointer / touch
//   sfx.unlock();                     // also callable manually (e.g. on a gamepad button press)
//   sfx.play('pop' | 'bip' | 'rustle' | 'leaves' | 'clink' | 'chime' | 'blip' | 'equip' | 'whoosh' | 'thud' | 'saber-on' | 'saber-off' | 'saber-swing' | 'chop' | 'crack' | 'zap' | 'timber' | 'collect' | 'dig' | 'flare' | 'sizzle' | 'toss' | 'cooked' | 'nom' | 'jingle' | 'pat' | 'pageturn')
//   sfx.setFire(0..1)   // looping campfire crackle bed (Step 14), set every frame
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

  /** Filtered noise whose band-pass centre sweeps f0 -> fMid -> f1 with a soft attack / release (whoosh). */
  _sweep(dur, vol, f0, fMid, f1, { q = 1.1, delay = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this._noiseBuffer();
    const filt = c.createBiquadFilter();
    filt.type = 'bandpass';
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(fMid, t + dur * 0.45);
    filt.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.4);
    src.stop(t + dur + 0.05);
  }

  /** Buzzy low "lightsaber" hum: two detuned saws through a low-pass with a wobble, pitch f0 -> f1. */
  _hum(dur, vol, f0, f1, { delay = 0, wobble = 9 } = {}) {
    const c = this.ctx, t = c.currentTime + delay;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.06, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(700, t);
    lp.frequency.linearRampToValueAtTime(1500, t + dur * 0.6);
    lp.Q.value = 2;
    const lfo = c.createOscillator(), lfoG = c.createGain();
    lfo.frequency.value = wobble;
    lfoG.gain.value = f0 * 0.025;
    lfo.connect(lfoG);
    for (const det of [1, 1.012]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0 * det, t);
      o.frequency.exponentialRampToValueAtTime(f1 * det, t + dur);
      lfoG.connect(o.frequency);
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.03);
    }
    lp.connect(g).connect(this.master);
    lfo.start(t);
    lfo.stop(t + dur + 0.03);
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
      case 'equip':    // item picked up: bright rising two-note "got it" sparkle
        this._tone('triangle', 523 * pitch, 523 * pitch, 0.12, 0.14 * v);
        this._tone('triangle', 784 * pitch, 784 * pitch, 0.12, 0.14 * v, 0.07);
        this._tone('sine', 1319 * pitch, 1319 * pitch, 0.24, 0.1 * v, 0.14);
        this._tone('sine', 2637 * pitch, 2600 * pitch, 0.16, 0.035 * v, 0.16);
        break;
      case 'whoosh':   // item swing: airy noise sweeping up then down
        this._sweep(0.3, 0.32 * v, 500 * pitch, 2600 * pitch, 900 * pitch, { q: 1.2 });
        break;
      case 'thud':     // dropped item lands: soft low thump + tiny clack
        this._tone('sine', 170 * pitch, 60 * pitch, 0.16, 0.26 * v);
        this._noise(0.05, 0.1 * v, { type: 'lowpass', f: 900, q: 0.5 });
        break;
      case 'saber-on': // ignite: rising hum + a bright zzzt
        this._hum(0.55, 0.11 * v, 70 * pitch, 130 * pitch, { wobble: 11 });
        this._sweep(0.28, 0.16 * v, 400, 3200, 1800, { q: 2 });
        this._tone('square', 300 * pitch, 900 * pitch, 0.12, 0.03 * v);
        break;
      case 'saber-off': // retract: falling hum
        this._hum(0.4, 0.1 * v, 140 * pitch, 55 * pitch, { wobble: 8 });
        this._sweep(0.22, 0.1 * v, 2200, 600, 300, { q: 2 });
        break;
      case 'saber-swing': // lightsaber swing: hum that doppler-bends + zap
        this._hum(0.42, 0.13 * v, 120 * pitch, 190 * pitch, { wobble: 16 });
        this._sweep(0.32, 0.22 * v, 700, 3000, 700, { q: 1.6 });
        this._tone('sawtooth', 900 * pitch, 180 * pitch, 0.1, 0.04 * v, 0.12);
        break;
      case 'chop':     // axe / sword into wood: dull woody thunk + a short crunchy click
        this._tone('sine', 220 * pitch, 85 * pitch, 0.14, 0.34 * v);
        this._tone('triangle', 400 * pitch, 160 * pitch, 0.07, 0.14 * v);
        this._noise(0.07, 0.2 * v, { type: 'bandpass', f: 1400, q: 0.9, pulses: 2 });
        this._noise(0.03, 0.1 * v, { type: 'highpass', f: 3500, q: 0.5 });
        break;
      case 'crack':    // tool into stone: sharp crack + low thump + bright chink
        this._noise(0.05, 0.3 * v, { type: 'highpass', f: 2500, q: 0.6 });
        this._noise(0.1, 0.18 * v, { type: 'bandpass', f: 900, q: 1.2, pulses: 3 });
        this._tone('sine', 140 * pitch, 55 * pitch, 0.16, 0.3 * v);
        this._tone('triangle', 1500 * pitch, 900 * pitch, 0.09, 0.07 * v, 0.01);
        break;
      case 'zap':      // lightsaber cutting into something: crackly zap
        this._tone('sawtooth', 1100 * pitch, 140 * pitch, 0.16, 0.09 * v);
        this._sweep(0.2, 0.2 * v, 3500, 900, 500, { q: 1.8 });
        this._hum(0.22, 0.1 * v, 110 * pitch, 70 * pitch, { wobble: 24 });
        break;
      case 'collect':  // walk-over pickup reaches the bag: quick bubbly blip (pitch climbs when several arrive in a row)
        this._tone('sine', 620 * pitch, 1240 * pitch, 0.09, 0.2 * v);
        this._tone('triangle', 1240 * pitch, 1860 * pitch, 0.07, 0.06 * v, 0.03);
        break;
      case 'dig':      // shovel into soil: soft low thud + a crunchy scrape
        this._tone('sine', 130 * pitch, 55 * pitch, 0.2, 0.34 * v);
        this._noise(0.16, 0.26 * v, { type: 'bandpass', f: 700, q: 0.7, pulses: 3 });
        this._noise(0.05, 0.12 * v, { type: 'lowpass', f: 1200, q: 0.5, delay: 0.03 });
        break;
      case 'flare':    // a log lands in the fire: soft whump + a burst of crackly noise
        this._tone('sine', 150 * pitch, 55 * pitch, 0.24, 0.3 * v);
        this._sweep(0.4, 0.3 * v, 300, 1600 * pitch, 500, { q: 0.7 });
        this._noise(0.35, 0.22 * v, { type: 'highpass', f: 2500, q: 0.6, pulses: 9 });
        break;
      case 'sizzle':   // frying food / a fire dying: hissy noise with lots of little pops
        this._noise(0.75, 0.2 * v, { type: 'highpass', f: 4200 * pitch, q: 0.5, pulses: 16 });
        this._noise(0.6, 0.1 * v, { type: 'bandpass', f: 2600, q: 0.8, pulses: 7 });
        break;
      case 'toss':     // tossing a log: short low whoosh
        this._sweep(0.22, 0.2 * v, 250, 900 * pitch, 350, { q: 1.0 });
        break;
      case 'cooked':   // a dish is ready: bright little "ta-da" arpeggio
        this._tone('triangle', 659 * pitch, 659 * pitch, 0.12, 0.15 * v);
        this._tone('triangle', 831 * pitch, 831 * pitch, 0.12, 0.15 * v, 0.09);
        this._tone('triangle', 988 * pitch, 988 * pitch, 0.12, 0.15 * v, 0.18);
        this._tone('sine', 1319 * pitch, 1319 * pitch, 0.34, 0.14 * v, 0.27);
        this._tone('sine', 2637 * pitch, 2600 * pitch, 0.2, 0.03 * v, 0.29);
        break;
      case 'nom':      // a bite of feast: soft crunchy chomp + a little bubbly "mm" blip (pitch varies per player)
        this._noise(0.09, 0.22 * v, { type: 'bandpass', f: 1700 * pitch, q: 0.9, pulses: 3 });
        this._tone('sine', 300 * pitch, 520 * pitch, 0.1, 0.16 * v, 0.02);
        this._tone('triangle', 620 * pitch, 880 * pitch, 0.07, 0.06 * v, 0.07);
        break;
      case 'jingle':   // feast celebration: a happy major arpeggio (C E G C E) that ends on a shimmering chord
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
          this._tone('triangle', f * pitch, f * pitch, 0.16, 0.17 * v, i * 0.1);
          this._tone('sine', f * 2 * pitch, f * 2 * pitch, 0.1, 0.035 * v, i * 0.1);
        });
        [523.25, 659.25, 783.99, 1046.5, 1568].forEach((f) => this._tone('sine', f * pitch, f * pitch, 0.75, 0.085 * v, 0.56));
        this._tone('triangle', 261.63 * pitch, 261.63 * pitch, 0.7, 0.12 * v, 0.56);
        this._noise(0.4, 0.07 * v, { type: 'highpass', f: 6000, q: 0.5, pulses: 10, delay: 0.56 });
        break;
      case 'pat':      // a soft slap of a small book (Quill's work tap): dull paper pat
        this._noise(0.06, 0.2 * v, { type: 'bandpass', f: 1100, q: 0.8, pulses: 2 });
        this._tone('sine', 180 * pitch, 90 * pitch, 0.08, 0.16 * v);
        break;
      case 'pageturn': // a big page folding over (Step 48: stepping into / out of a storybook page): a papery whoosh, a flutter, a soft flap
        this._sweep(0.55, 0.3 * v, 700 * pitch, 3200 * pitch, 1200 * pitch, { q: 0.8 });
        this._noise(0.4, 0.14 * v, { type: 'highpass', f: 3800, q: 0.5, pulses: 7, delay: 0.05 });
        this._tone('sine', 190 * pitch, 70 * pitch, 0.16, 0.22 * v, 0.38);
        this._noise(0.06, 0.18 * v, { type: 'bandpass', f: 1800, q: 0.7, delay: 0.38 });
        break;
      case 'timber':   // tree crashes down: deep thud + rustle
        this._tone('sine', 110 * pitch, 40 * pitch, 0.3, 0.4 * v);
        this._noise(0.5, 0.22 * v, { f: 1800, q: 0.6, pulses: 6 });
        break;
      default: break;
    }
  }

  // ---------------------------------------------------------------------------------- campfire crackle bed
  /**
   * Looping fire crackle (campfire). Call every frame with a 0..1 volume (the campfire scales it by fire level and by the distance to the
   * nearest player); 0 (or a muted Sfx) silences it. The graph (a looping buffer of random pops + a soft low roar) is built lazily once
   * the AudioContext runs, and goes through the master gain, so the global mute applies.
   */
  setFire(volume) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (!this._fire) {
      if (volume <= 0.001) return;
      const c = this.ctx, n = Math.floor(c.sampleRate * 3);
      const buf = c.createBuffer(1, n, c.sampleRate);
      const d = buf.getChannelData(0);
      let lp = 0;
      for (let i = 0; i < n; i++) { lp += (Math.random() * 2 - 1 - lp) * 0.06; d[i] = lp * 0.3; }         // the soft "roar" underneath
      // Random crackles: soft, rounded pops rather than hissy ticks. Each is low-passed noise with a short fade-in
      // (no hard click) and a quick decay; only a few are loud.
      for (let k = 0; k < 22; k++) {
        const at = Math.floor(Math.random() * (n - 3000)), len = 300 + Math.random() * 900;
        const amp = (Math.random() < 0.2 ? 0.35 : 0.12) + Math.random() * 0.15, smooth = 0.18 + Math.random() * 0.2;
        let s = 0;
        for (let i = 0; i < len; i++) {
          s += (Math.random() * 2 - 1 - s) * smooth;
          d[at + i] += s * amp * Math.min(1, i / 40) * Math.exp(-i / (len * 0.3));
        }
      }
      const src = c.createBufferSource();
      src.buffer = buf; src.loop = true;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
      const lpf = c.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 2200; lpf.Q.value = 0.5;   // take the sharp top end off
      const g = c.createGain(); g.gain.value = 0;
      src.connect(hp).connect(lpf).connect(g).connect(this.master);
      src.start();
      this._fire = { g };
    }
    this._fire.g.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)) * 0.38, this.ctx.currentTime, 0.12);
  }
}
