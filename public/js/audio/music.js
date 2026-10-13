// Background music: synthesized home, regional and ritual-area tracks. No audio files.
//
//   const music = new Music(sfx);       // uses sfx.ctx / sfx.master once the first gesture has unlocked them
//   music.start();                      // lazy: polls until the AudioContext runs, then plays track 1 (Morning Breeze)
//   music.enabled / setEnabled(b) / toggle()     // persisted in localStorage ('infiniteIsland.music'), default on
//   music.duck(0.4, 0.6) / music.unduck(1.5)     // feast scene: lower the music while it plays
//   music.current (title) / currentIndex / music.next() / music.on('track' | 'enabled', fn)
//   music.stats  { notes: [n per track], total, resyncs }   // scheduler counters (debug)
//   music.renderTrack(i, seconds)       // debug: render a track offline -> { peak, rms, ... } (levels before the bus)
//
// Layout:  instruments (voice functions) -> per-instrument bus (+ reverb send) -> Engine.fade -> soft compressor -> music bus (0.3) -> sfx.master
// so the global M mute silences the music too. One Engine per track (a clean cut between tracks / after a pause). A look-ahead scheduler
// (25 ms timer, 0.15 s ahead) walks the track's pre-generated event list; the music pauses while the tab is hidden, the sound is muted or the
// music is off, and resumes from the start of the bar it stopped in.
import { mulberry32 } from '../utils/rng.js';

const STORE_KEY = 'infiniteIsland.music';
const MUSIC_VOL = 0.3;          // the music bus (under the sfx, which go straight to the master)
const LOOKAHEAD = 0.15;         // seconds scheduled ahead
const TICK_MS = 25;
const FADE_IN = 2.5;            // seconds
const FADE_OUT = 3.0;           // seconds before a track's end
const GAP = 3.0;                // quiet seconds between tracks
const STEPS_PER_BAR = 16;       // 16th-note grid, 4/4

// ------------------------------------------------------------------------------------------------ theory helpers
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUAL = {
  maj: [0, 4, 7], min: [0, 3, 7], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10],
  sus2: [0, 2, 7], sus4: [0, 5, 7], add9: [0, 4, 7, 14], min9: [0, 3, 7, 10, 14],
};
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
/** chord('Bb', 'maj7') -> { pc, iv, pcs } (root as a pitch class, intervals, pitch classes). */
function chord(name, q = 'maj') {
  let pc = PC[name[0]];
  if (name[1] === 'b') pc -= 1; else if (name[1] === '#') pc += 1;
  pc = (pc + 12) % 12;
  const iv = QUAL[q];
  return { pc, iv, pcs: iv.map((i) => (pc + i) % 12) };
}
/** All midi notes in [lo, hi] that are chord tones. */
function ladder(ch, lo, hi) { const out = []; for (let m = lo; m <= hi; m++) if (ch.pcs.includes(m % 12)) out.push(m); return out; }
function scaleLadder(keyPc, scale, lo, hi) {
  const pcs = scale.map((i) => (keyPc + i) % 12), out = [];
  for (let m = lo; m <= hi; m++) if (pcs.includes(m % 12)) out.push(m);
  return out;
}
/** n ascending chord tones starting at the first chord tone >= lo. */
function voiceUp(ch, lo, n) { const out = []; for (let m = lo; out.length < n; m++) if (ch.pcs.includes(m % 12)) out.push(m); return out; }
const pcAt = (pc, lo) => { let m = lo; while (m % 12 !== pc) m++; return m; };
function nearestIdx(arr, target) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < arr.length; i++) { const d = Math.abs(arr[i] - target); if (d < bd) { bd = d; best = i; } }
  return best;
}

// ------------------------------------------------------------------------------------------------ melody generator
// A theme is a couple of one-bar motifs (rhythm + contour). Every 4-bar phrase plays motif 1, motif 2, motif 1 (higher) and a cadence, so the
// tune is recognisable and identical on every play (seeded). Strong beats land on chord tones; in-between notes step along the scale.
function makeMotif(rng, rhythm) {
  let dir = rng() < 0.5 ? 1 : -1;
  return rhythm.map(([at, len], i) => {
    const strong = i === 0 || (at % 4 === 0 && len >= 2) || len >= 4;
    if (strong) return { at, len, c: true, v: i === 0 ? 0 : [0, 0, 1, -1, 1, 2][Math.floor(rng() * 6)] };
    if (rng() < 0.3) dir = -dir;
    return { at, len, c: false, v: dir * (rng() < 0.25 ? 2 : 1) };
  });
}

class Melody {
  constructor(seed, key, cfg) {
    this.rng = mulberry32(seed);
    this.key = key; this.cfg = cfg;
    this.S = scaleLadder(key.pc, key.scale, cfg.lo - 4, cfg.hi + 4);
    this.themes = {};
    for (const name of ['A', 'B']) {
      const rng = this.rng, list = cfg.rhythms[name].slice();
      for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
      const pick = (a) => a[Math.floor(rng() * a.length)];
      this.themes[name] = {
        m1: makeMotif(rng, list[0]),
        m2: makeMotif(rng, list[1]),
        cad: makeMotif(rng, pick(cfg.cadences)),
        contour: [[0, pick([2, 3, -2]), pick([4, 5, 3]), 0], [0, pick([3, -3, 2]), pick([5, 4, 2]), -2]],
        cadOff: [2, -1],
      };
    }
  }

  /** Notes [{at, len, midi}] of bar `b` (0-based) of a `nbars` section of theme `name` over chord `ch`. */
  bar(ch, name, b, nbars, { lift = 0, final = false } = {}) {
    const th = this.themes[name], { lo, hi, center } = this.cfg;
    const k = b % 4, ph = Math.floor(b / 4);
    const L = ladder(ch, lo, hi), S = this.S;
    const endBar = final && b === nbars - 1;
    let motif, tgt;
    if (endBar) { motif = [{ at: 0, len: 14, c: true, v: 0 }]; tgt = center; }
    else if (k === 3) { motif = th.cad; tgt = center + th.cadOff[ph % 2]; }
    else { motif = k === 1 ? th.m2 : th.m1; tgt = center + th.contour[ph % 2][k]; }
    tgt += lift;
    let ai;
    if (endBar) { const roots = L.filter((m) => m % 12 === ch.pc); ai = L.indexOf(roots[nearestIdx(roots, tgt)]); }
    else ai = nearestIdx(L, tgt);
    const out = [];
    let prev = L[ai];
    for (const n of motif) {
      let midi;
      if (n.c) {
        midi = L[clamp(ai + n.v, 0, L.length - 1)];
        if (out.length && Math.abs(midi - prev) > 7) midi = L[nearestIdx(L, prev + Math.sign(midi - prev) * 5)];     // no big leaps: pull to a nearer chord tone
      }
      else midi = S[clamp(nearestIdx(S, prev) + n.v, 0, S.length - 1)];
      prev = midi;
      out.push({ at: n.at, len: n.len, midi });
    }
    return out;
  }
}

// ------------------------------------------------------------------------------------------------ voices
// Every voice: (engine, t, midi, durSeconds, velocity, outputNode, opts). Short-lived oscillators only; all stopped explicitly.
function env(g, t, peak, atk, ring, mid = 0.25) {          // plucky two-stage decay
  g.setValueAtTime(0.0001, t);
  g.linearRampToValueAtTime(peak, t + atk);
  g.exponentialRampToValueAtTime(Math.max(0.0002, peak * mid), t + ring * 0.3);
  g.exponentialRampToValueAtTime(0.0001, t + ring);
}

const VOICES = {
  // ukulele / nylon-guitar-ish pluck: triangle + a little saw through a low-pass that closes quickly
  pluck(e, t, m, dur, vel, out, o) {
    const c = e.ctx, f = mtof(m), ring = o.ring || 0.9;
    const lp = c.createBiquadFilter(), g = c.createGain(), gs = c.createGain();
    lp.type = 'lowpass'; lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(Math.min(f * (o.bright || 6), 4200), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(f * 1.5, 350), t + ring * 0.35);
    const a = c.createOscillator(), b = c.createOscillator();
    a.type = 'triangle'; b.type = 'sawtooth';
    a.frequency.value = f; b.frequency.value = f * 1.004;
    gs.gain.value = 0.26;
    a.connect(lp); b.connect(gs); gs.connect(lp); lp.connect(g); g.connect(out);
    env(g.gain, t, vel, 0.004, ring);
    a.start(t); b.start(t); a.stop(t + ring + 0.05); b.stop(t + ring + 0.05);
  },
  // marimba / mallet: sine + a fast-decaying overtone
  marimba(e, t, m, dur, vel, out, o) {
    const c = e.ctx, f = mtof(m), ring = clamp(1.1 * Math.pow(262 / f, 0.35), 0.35, 1.3) * (o.ring || 1);
    const a = c.createOscillator(), b = c.createOscillator(), ga = c.createGain(), gb = c.createGain();
    a.type = 'sine'; b.type = 'sine'; a.frequency.value = f; b.frequency.value = f * 3.93;
    env(ga.gain, t, vel, 0.003, ring, 0.2);
    gb.gain.setValueAtTime(0.0001, t); gb.gain.linearRampToValueAtTime(vel * 0.32, t + 0.002); gb.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    a.connect(ga).connect(out); b.connect(gb).connect(out);
    a.start(t); b.start(t); a.stop(t + ring + 0.05); b.stop(t + 0.12);
  },
  // electric piano: FM pair, the modulation index dies away fast (tine) while the body rings
  ep(e, t, m, dur, vel, out, o) {
    const c = e.ctx, f = mtof(m), ring = o.ring || 2.2, idx = o.index || 1.5;
    const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain(), lp = c.createBiquadFilter();
    car.type = 'sine'; mod.type = 'sine'; car.frequency.value = f; mod.frequency.value = f * (o.ratio || 1);
    mg.gain.setValueAtTime(f * idx, t); mg.gain.exponentialRampToValueAtTime(f * idx * 0.04, t + 0.45);
    lp.type = 'lowpass'; lp.frequency.value = 3400; lp.Q.value = 0.3;
    mod.connect(mg).connect(car.frequency);
    car.connect(g); g.connect(lp).connect(out);
    env(g.gain, t, vel, 0.006, ring, 0.3);
    car.start(t); mod.start(t); car.stop(t + ring + 0.05); mod.stop(t + ring + 0.05);
  },
  // music box / glass bell: inharmonic FM, bright but short
  bell(e, t, m, dur, vel, out, o) {
    const c = e.ctx, f = mtof(m), ring = o.ring || 1.5;
    const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain(), lp = c.createBiquadFilter();
    car.type = 'sine'; mod.type = 'sine'; car.frequency.value = f; mod.frequency.value = f * 3.5;
    mg.gain.setValueAtTime(f * 1.1, t); mg.gain.exponentialRampToValueAtTime(f * 0.03, t + 0.3);
    lp.type = 'lowpass'; lp.frequency.value = 5200;
    mod.connect(mg).connect(car.frequency);
    car.connect(g); g.connect(lp).connect(out);
    env(g.gain, t, vel, 0.002, ring, 0.22);
    car.start(t); mod.start(t); car.stop(t + ring + 0.05); mod.stop(t + ring + 0.05);
  },
  // soft pad: a chord of detuned triangles through a low-pass, slow attack and release
  pad(e, t, notes, dur, vel, out, o) {
    const c = e.ctx, atk = o.atk || 0.9, rel = o.rel || 1.2, n = notes.length;
    const lp = c.createBiquadFilter(), g = c.createGain();
    lp.type = 'lowpass'; lp.Q.value = 0.4;
    lp.frequency.setValueAtTime(o.cut0 || 450, t); lp.frequency.linearRampToValueAtTime(o.cut1 || 1000, t + atk * 1.5);
    lp.connect(g); g.connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + atk);
    g.gain.setValueAtTime(vel, t + Math.max(atk, dur));
    g.gain.linearRampToValueAtTime(0.0001, t + Math.max(atk, dur) + rel);
    const end = t + Math.max(atk, dur) + rel + 0.05;
    for (const m of notes) {
      const f = mtof(m);
      for (const det of [-7, 7]) {
        const os = c.createOscillator(), og = c.createGain();
        os.type = 'triangle'; os.frequency.value = f; os.detune.value = det;
        og.gain.value = 0.5 / n;
        os.connect(og).connect(lp);
        os.start(t); os.stop(end);
      }
    }
  },
  // warm bass: sine + a little triangle, short envelope
  bass(e, t, m, dur, vel, out, o) {
    const c = e.ctx, f = mtof(m), ring = Math.max(0.12, (o.short ? dur * 0.9 : dur) + 0.05);
    const a = c.createOscillator(), b = c.createOscillator(), gb = c.createGain(), lp = c.createBiquadFilter(), g = c.createGain();
    a.type = 'sine'; b.type = 'triangle'; a.frequency.value = f; b.frequency.value = f;
    gb.gain.value = 0.35; lp.type = 'lowpass'; lp.frequency.value = 650; lp.Q.value = 0.4;
    a.connect(lp); b.connect(gb).connect(lp); lp.connect(g); g.connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.012);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vel * 0.5), t + ring * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ring);
    a.start(t); b.start(t); a.stop(t + ring + 0.05); b.stop(t + ring + 0.05);
  },
  // whistle / flute lead: sine (+ soft harmonics), delayed gentle vibrato, a scoop into the pitch and a puff of breath noise
  lead(e, t, m, dur, vel, out, o) {
    const c = e.ctx, f = mtof(m), fl = o.style === 'flute';
    const d = Math.max(0.14, dur), atk = fl ? 0.07 : 0.035, rel = fl ? 0.18 : 0.1;
    const car = c.createOscillator(), h2 = c.createOscillator(), h2g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
    car.type = 'sine'; h2.type = 'sine';
    car.frequency.setValueAtTime(f * 0.985, t); car.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    h2.frequency.value = f * 2; h2g.gain.value = fl ? 0.2 : 0.05;
    lfo.type = 'sine'; lfo.frequency.value = fl ? 4.8 : 5.8;
    lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * (fl ? 0.007 : 0.006), t + 0.3);
    lfo.connect(lg); lg.connect(car.frequency);
    car.connect(g); h2.connect(h2g).connect(g); g.connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + atk);
    g.gain.setValueAtTime(vel, t + Math.max(atk, d));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(atk, d) + rel);
    const end = t + Math.max(atk, d) + rel + 0.05;
    car.start(t); h2.start(t); lfo.start(t); car.stop(end); h2.stop(end); lfo.stop(end);
    // breath
    const ns = c.createBufferSource(), bp = c.createBiquadFilter(), bg = c.createGain();
    ns.buffer = e.noise; bp.type = 'bandpass'; bp.frequency.value = clamp(f * 2.5, 1200, 4500); bp.Q.value = 0.9;
    bg.gain.setValueAtTime(0.0001, t); bg.gain.linearRampToValueAtTime(vel * (fl ? 0.2 : 0.07), t + 0.03); bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    ns.connect(bp).connect(bg).connect(out);
    ns.start(t, (t * 0.37) % 0.9); ns.stop(t + 0.32);
  },
  // shaker: a tick of band-passed noise
  shaker(e, t, m, dur, vel, out, o) {
    const c = e.ctx, len = o.len || 0.07;
    const ns = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    ns.buffer = e.noise; bp.type = 'bandpass'; bp.frequency.value = 5600; bp.Q.value = 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    ns.connect(bp).connect(g).connect(out);
    ns.start(t, (t * 1.93) % 1.0); ns.stop(t + len + 0.03);
  },
  // soft kick: a sine that drops in pitch
  kick(e, t, m, dur, vel, out) {
    const c = e.ctx, os = c.createOscillator(), g = c.createGain();
    os.type = 'sine'; os.frequency.setValueAtTime(130, t); os.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    os.connect(g).connect(out); os.start(t); os.stop(t + 0.34);
  },
  // tiny wood-block click
  logdrum(e, t, m, dur, vel, out) {
    const c = e.ctx, a = c.createOscillator(), b = c.createOscillator(), bg = c.createGain(), g = c.createGain();
    const f = mtof(m); a.type = 'sine'; b.type = 'triangle';
    a.frequency.setValueAtTime(f * 1.8, t); a.frequency.exponentialRampToValueAtTime(f, t + 0.035);
    b.frequency.value = f * 2.72; bg.gain.value = 0.18;
    a.connect(g); b.connect(bg).connect(g); g.connect(out);
    env(g.gain, t, vel, 0.003, 0.28, 0.1); a.start(t); b.start(t); a.stop(t + 0.4); b.stop(t + 0.4);
  },
  click(e, t, m, dur, vel, out) {
    const c = e.ctx, a = c.createOscillator(), b = c.createOscillator(), g = c.createGain(), gb = c.createGain();
    a.type = 'triangle'; a.frequency.value = 960; b.type = 'sine'; b.frequency.value = 1450; gb.gain.value = 0.4;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    a.connect(g); b.connect(gb).connect(g); g.connect(out);
    a.start(t); b.start(t); a.stop(t + 0.08); b.stop(t + 0.08);
  },
};
// reverb send per instrument (shared convolver)
const WET = { pluck: 0.26, marimba: 0.3, ep: 0.42, bell: 0.55, pad: 0.5, bass: 0.04, lead: 0.4, shaker: 0.1, kick: 0.02, click: 0.14 };

// ------------------------------------------------------------------------------------------------ audio assets + engine
/** Shared per-context assets: a procedurally generated stereo reverb impulse (~2 s decaying noise) and a noise buffer. */
function makeAssets(ctx) {
  const sr = ctx.sampleRate, secs = 2.1, n = Math.floor(sr * secs);
  const impulse = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = impulse.getChannelData(ch), r = mulberry32(777 + ch * 131);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      lp += ((r() * 2 - 1) - lp) * (0.6 - 0.45 * (i / n));          // darker and darker as it decays
      d[i] = lp * Math.exp(-t * 3.4) * Math.min(1, t / 0.012);
    }
  }
  const nn = Math.floor(sr * 1.2), noise = ctx.createBuffer(1, nn, sr), nd = noise.getChannelData(0), r2 = mulberry32(4242);
  for (let i = 0; i < nn; i++) nd[i] = r2() * 2 - 1;
  return { impulse, noise };
}

class Engine {
  constructor(ctx, dest, assets, fade = 0) {
    this.ctx = ctx; this.noise = assets.noise;
    this.fade = ctx.createGain(); this.fade.gain.value = fade;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16; this.comp.knee.value = 14; this.comp.ratio.value = 3; this.comp.attack.value = 0.012; this.comp.release.value = 0.3;
    this.conv = ctx.createConvolver(); this.conv.buffer = assets.impulse;
    this.rev = ctx.createGain(); this.rev.gain.value = 0.9;
    this.conv.connect(this.rev); this.rev.connect(this.fade);
    this.fade.connect(this.comp); this.comp.connect(dest);
    this.buses = {};
  }
  bus(kind) {
    let b = this.buses[kind];
    if (!b) {
      const c = this.ctx, g = c.createGain(), send = c.createGain();
      send.gain.value = WET[kind] || 0.2;
      g.connect(this.fade); g.connect(send); send.connect(this.conv);
      b = this.buses[kind] = g;
    }
    return b;
  }
  dispose() { try { this.fade.disconnect(); this.comp.disconnect(); this.conv.disconnect(); this.rev.disconnect(); } catch (_) { /* already gone */ } }
}

// ------------------------------------------------------------------------------------------------ tracks
/** Builds a track definition's event list: [{ s: step, k: kind, m: midi | [midi], d: steps, v: velocity, o: opts }] sorted by step. */
function buildTrack(def) {
  if (def.build) return def.build();
  const events = [];
  const rng = mulberry32(def.seed);
  const mel = new Melody(def.seed ^ 0x5bd1, def.key, def.melody);
  let barAbs = 0;
  for (const sec of def.form) {
    for (let b = 0; b < sec.bars; b++, barAbs++) {
      const chords = def.prog[sec.name], ch = chords[b % chords.length], nx = chords[(b + 1) % chords.length];
      const s0 = barAbs * STEPS_PER_BAR;
      const c = {
        sec: sec.name, v: sec.v || 0, b, nbars: sec.bars, ch, nx, rng, barAbs,
        last: b === sec.bars - 1, final: sec.name === 'O',
        add: (st, k, m, d, vel, o = {}) => events.push({ s: s0 + st, k, m, d, v: vel, o }),
        melody: (lift = 0) => mel.bar(ch, sec.name, b, sec.bars, { lift, final: sec.name === 'O' }),
      };
      c.strum = (st, chd, dir, vel, o = {}) => {
        const notes = voiceUp(chd, o.lo || 60, o.n || 4), nn = notes.length;
        for (let i = 0; i < nn; i++) c.add(st + (dir === 'D' ? i : nn - 1 - i) * 0.17, 'pluck', notes[i], 2, vel * (1 - 0.05 * i), o);
      };
      def.bar(c);
    }
  }
  events.sort((a, b) => a.s - b.s);
  return { events, steps: barAbs * STEPS_PER_BAR };
}

// ---- 1. Morning Breeze: C major, 96 BPM, straight and bouncy. Ukulele strums, marimba tune, soft bass.
const C_ = chord('C'), G_ = chord('G'), Am_ = chord('A', 'min'), F_ = chord('F'), Em_ = chord('E', 'min'), Dm_ = chord('D', 'min');
const MORNING = {
  title: 'Morning Breeze', bpm: 96, swing: 0.5, seed: 1101, trim: 0.31,
  key: { pc: 0, scale: MAJOR },
  prog: { I: [C_, G_, Am_, G_], A: [C_, G_, Am_, F_], B: [F_, G_, Em_, Am_, Dm_, G_, C_, G_], O: [F_, C_] },
  form: [{ name: 'I', bars: 4 }, { name: 'A', bars: 8 }, { name: 'A', bars: 8, v: 1 }, { name: 'B', bars: 8 }, { name: 'A', bars: 8, v: 2 }, { name: 'O', bars: 2 }],
  melody: {
    lo: 67, hi: 88, center: 76,
    rhythms: {
      A: [[[0, 3], [3, 3], [6, 2], [8, 4], [12, 2], [14, 2]], [[0, 2], [2, 2], [4, 4], [8, 3], [11, 1], [12, 4]], [[0, 4], [4, 2], [6, 2], [8, 2], [10, 2], [12, 4]], [[2, 2], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]]],
      B: [[[0, 2], [2, 2], [4, 2], [6, 2], [8, 4], [12, 4]], [[0, 6], [6, 2], [8, 2], [10, 2], [12, 4]], [[0, 4], [4, 4], [8, 2], [10, 2], [12, 2], [14, 2]], [[0, 3], [3, 3], [6, 3], [9, 3], [12, 4]]],
    },
    cadences: [[[0, 6], [6, 2], [8, 8]], [[0, 4], [4, 2], [6, 2], [8, 8]]],
  },
  bar(c) {
    const { sec, v, b, ch, add } = c;
    if (sec === 'I') {
      const st = b < 2 ? [0, 4, 8, 12] : [0, 4, 6, 10, 12, 14];
      st.forEach((s, i) => c.strum(s, ch, (i % 2 && b >= 2) ? 'U' : 'D', b < 2 ? 0.3 : 0.4));
      if (b >= 1) add(0, 'bass', pcAt(ch.pc, 40), 5, 0.55);
      if (b >= 2) { const n = voiceUp(ch, 72, 4); [0, 1, 2, 3, 2, 1, 2, 3].forEach((i, j) => add(j * 2, 'marimba', n[i], 2, 0.3)); }
      return;
    }
    if (sec === 'O') {
      if (b === 0) { c.strum(0, ch, 'D', 0.36); c.strum(8, ch, 'D', 0.28); add(0, 'bass', pcAt(ch.pc, 40), 6, 0.5); return; }
      c.strum(0, ch, 'D', 0.5, { ring: 2.6 });
      add(0, 'bass', pcAt(ch.pc, 40), 12, 0.55);
      add(0, 'marimba', 76, 4, 0.42); add(4, 'marimba', 79, 4, 0.4); add(8, 'marimba', 84, 6, 0.42, { ring: 1.8 });
      return;
    }
    const isB = sec === 'B';
    const pat = isB ? [[0, 'D', 1], [2, 'U', 0.55], [4, 'D', 0.9], [6, 'U', 0.6], [8, 'D', 0.95], [10, 'U', 0.6], [12, 'D', 0.9], [14, 'U', 0.55]]
      : v ? [[0, 'D', 1], [4, 'D', 0.85], [6, 'U', 0.6], [8, 'D', 0.6], [10, 'U', 0.6], [12, 'D', 0.9], [14, 'U', 0.56]]
        : [[0, 'D', 1], [4, 'D', 0.85], [6, 'U', 0.6], [10, 'U', 0.6], [12, 'D', 0.88], [14, 'U', 0.56]];
    for (const [s, dir, vv] of pat) c.strum(s, ch, dir, 0.5 * vv);
    add(0, 'bass', pcAt(ch.pc, 40), 5, 0.6);
    add(8, 'bass', pcAt((ch.pc + 7) % 12, 40), 3, 0.45);
    if (isB) add(6, 'bass', pcAt(ch.pc, 52), 2, 0.3);
    const lift = v === 2 ? 3 : 0;
    for (const n of c.melody(lift)) {
      add(n.at, 'marimba', n.midi, n.len, 0.5);
      if (v === 2 && n.midi + 12 <= 91) add(n.at, 'marimba', n.midi + 12, n.len, 0.17);
    }
    if (v >= 1 || isB) for (let s = 2; s < 16; s += 4) { add(s, 'shaker', 0, 1, 0.2); add(s - 2, 'shaker', 0, 1, 0.1); }
    if (isB || v === 2) { add(4, 'click', 0, 1, 0.16); add(12, 'click', 0, 1, 0.16); }
  },
};

// ---- 2. Tide Pools: F major, 76 BPM, dreamy. Electric-piano tune and music-box sparkles over a warm pad; maj7 / sus chords.
const Fmaj7 = chord('F', 'maj7'), Am7 = chord('A', 'min7'), Bbmaj7 = chord('Bb', 'maj7'), Csus4 = chord('C', 'sus4'), C7 = chord('C', 'dom7');
const Dm7 = chord('D', 'min7'), Gm7 = chord('G', 'min7'), Gm9 = chord('G', 'min9');
const TIDE = {
  title: 'Tide Pools', bpm: 76, swing: 0.5, seed: 2207, trim: 0.31,
  key: { pc: 5, scale: MAJOR },
  prog: {
    I: [Fmaj7, Bbmaj7], A: [Fmaj7, Am7, Bbmaj7, Csus4, Fmaj7, Dm7, Bbmaj7, C7],
    B: [Dm7, Gm7, Bbmaj7, Am7, Dm7, Gm9, Csus4, C7], O: [Bbmaj7, Fmaj7],
  },
  form: [{ name: 'I', bars: 2 }, { name: 'A', bars: 8 }, { name: 'A', bars: 8, v: 1 }, { name: 'B', bars: 8 }, { name: 'A', bars: 8, v: 2 }, { name: 'O', bars: 2 }],
  melody: {
    lo: 65, hi: 89, center: 77,
    rhythms: {
      A: [[[0, 6], [6, 2], [8, 4], [12, 4]], [[0, 4], [4, 4], [8, 6], [14, 2]], [[2, 6], [8, 2], [10, 2], [12, 4]], [[0, 8], [8, 4], [12, 2], [14, 2]]],
      B: [[[0, 4], [4, 2], [6, 2], [8, 8]], [[0, 2], [2, 2], [4, 4], [8, 8]], [[0, 6], [6, 2], [8, 6], [14, 2]], [[0, 3], [3, 3], [6, 2], [8, 8]]],
    },
    cadences: [[[0, 8], [8, 4], [12, 4]], [[0, 6], [6, 2], [8, 8]]],
  },
  bar(c) {
    const { sec, v, b, ch, add, rng } = c;
    const twinkle = (chance, echo) => {
      for (let s = 0; s < 16; s += 2) {
        if (rng() < chance) {
          const L = ladder(ch, 77, 96), m = L[Math.floor(rng() * L.length)];
          add(s, 'bell', m, 2, 0.16);
          if (echo) add(s + 3, 'bell', m, 2, 0.07);
        }
      }
    };
    if (sec === 'I') {
      add(0, 'pad', voiceUp(ch, 53, 4), 16.6, 0.3 + 0.1 * b, { atk: 1.6 });
      if (b === 1) add(0, 'bass', pcAt(ch.pc, 40), 12, 0.5);
      twinkle(0.3, false);
      return;
    }
    if (sec === 'O') {
      add(0, 'pad', voiceUp(ch, 53, 4), b ? 12 : 16.6, 0.4, { atk: 1.2, rel: 2.0 });
      add(0, 'bass', pcAt(ch.pc, 40), b ? 12 : 14, 0.5);
      if (b === 0) { add(0, 'ep', 77, 6, 0.4); add(8, 'ep', 72, 6, 0.36); }
      else { add(0, 'ep', 69, 8, 0.4, { ring: 3 }); add(2, 'bell', 93, 2, 0.14); add(6, 'bell', 88, 2, 0.12); add(10, 'bell', 84, 2, 0.1); }
      return;
    }
    add(0, 'pad', voiceUp(ch, 53, 4), 16.6, 0.36 + (v === 2 ? 0.06 : 0), { atk: 1.0 });
    if (sec === 'B') add(0, 'pad', voiceUp(ch, 65, 3), 16.6, 0.12, { atk: 1.4, cut1: 1400 });
    add(0, 'bass', pcAt(ch.pc, 40), 14, 0.5);
    if (v >= 1 || sec === 'B') add(8, 'bass', pcAt((ch.pc + 7) % 12, 40), 6, 0.3);
    for (const n of c.melody(v === 2 ? 2 : 0)) add(n.at, 'ep', n.midi, n.len, 0.46, { index: v === 2 ? 1.8 : 1.5 });
    twinkle(v >= 1 || sec === 'B' ? 0.45 : 0.25, v >= 1 || sec === 'B');
    if (sec === 'B') for (let s = 0; s < 16; s += 4) add(s, 'shaker', 0, 1, 0.07, { len: 0.12 });
  },
};

// ---- 3. Island Stroll: G major, 108 BPM, swung shuffle. Bouncy bass, whistle lead, shaker, little off-beat stabs.
const G2 = chord('G'), Em2 = chord('E', 'min'), C2 = chord('C'), D2 = chord('D'), Bm2 = chord('B', 'min');
const STROLL = {
  title: 'Island Stroll', bpm: 108, swing: 0.64, seed: 3309, trim: 0.27,
  key: { pc: 7, scale: MAJOR },
  prog: { I: [G2, D2], A: [G2, Em2, C2, D2], B: [C2, D2, Bm2, Em2, C2, D2, G2, D2], O: [C2, G2] },
  form: [{ name: 'I', bars: 2 }, { name: 'A', bars: 8 }, { name: 'A', bars: 8, v: 1 }, { name: 'B', bars: 8 }, { name: 'B', bars: 8, v: 1 }, { name: 'A', bars: 8, v: 2 }, { name: 'O', bars: 2 }],
  melody: {
    lo: 69, hi: 91, center: 79,
    rhythms: {
      A: [[[0, 4], [4, 2], [6, 2], [8, 4], [12, 4]], [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]], [[2, 2], [4, 2], [6, 4], [10, 2], [12, 2], [14, 2]], [[0, 6], [6, 2], [8, 2], [10, 6]]],
      B: [[[0, 2], [2, 2], [4, 2], [6, 2], [8, 4], [12, 4]], [[0, 4], [4, 4], [8, 2], [10, 2], [12, 4]], [[0, 2], [2, 4], [6, 2], [8, 2], [10, 2], [12, 4]], [[2, 2], [4, 4], [8, 4], [12, 2], [14, 2]]],
    },
    cadences: [[[0, 4], [4, 2], [6, 2], [8, 8]], [[0, 6], [6, 2], [8, 8]]],
  },
  bar(c) {
    const { sec, v, b, ch, nx, add } = c;
    const root = pcAt(ch.pc, 38), fifth = pcAt((ch.pc + 7) % 12, 38);
    const stab = (s, vel) => { const n = voiceUp(ch, 62, 3); n.forEach((m, i) => add(s + i * 0.12, 'pluck', m, 1, vel * (1 - 0.06 * i), { ring: 0.32, bright: 4 })); };
    const shake = (vel) => { for (let s = 0; s < 16; s += 2) add(s, 'shaker', 0, 1, s % 4 === 0 ? vel : vel * 0.5, { len: 0.06 }); };
    if (sec === 'I') {
      add(0, 'bass', root, 3, 0.55, { short: true }); add(4, 'bass', fifth, 3, 0.45, { short: true }); add(8, 'bass', root, 3, 0.55, { short: true }); add(12, 'bass', fifth, 3, 0.45, { short: true });
      shake(b ? 0.22 : 0.14);
      if (b === 1) { stab(2, 0.26); stab(10, 0.26); add(0, 'lead', 79, 6, 0.3, { style: 'whistle' }); add(8, 'lead', 83, 6, 0.3, { style: 'whistle' }); }
      return;
    }
    if (sec === 'O') {
      if (b === 0) { add(0, 'bass', root, 3, 0.55, { short: true }); add(4, 'bass', fifth, 3, 0.45, { short: true }); add(8, 'bass', root, 3, 0.55, { short: true }); stab(2, 0.26); stab(10, 0.26); shake(0.16); add(0, 'lead', 76, 6, 0.36, { style: 'whistle' }); add(8, 'lead', 79, 6, 0.36, { style: 'whistle' }); }
      else { add(0, 'bass', root, 6, 0.55); stab(0, 0.3); add(0, 'lead', 79, 14, 0.36, { style: 'whistle' }); add(0, 'kick', 0, 1, 0.3); }
      return;
    }
    // bouncy bass
    const nextRoot = pcAt(nx.pc, 38);
    add(0, 'bass', root, 3, 0.6, { short: true });
    add(4, 'bass', fifth, 3, 0.48, { short: true });
    add(8, 'bass', root, 3, 0.58, { short: true });
    add(10, 'bass', root + 12, 1.5, 0.3, { short: true });
    add(12, 'bass', fifth, 3, 0.48, { short: true });
    add(14, 'bass', nextRoot - 2, 1.5, 0.3, { short: true });
    // whistle tune
    const lift = v === 2 ? 3 : 0;
    for (const n of c.melody(lift)) add(n.at, 'lead', n.midi, n.len * 0.9, 0.44, { style: 'whistle' });
    shake(v >= 1 || sec === 'B' ? 0.24 : 0.17);
    if (sec === 'B') for (let s = 1; s < 16; s += 4) add(s, 'shaker', 0, 1, 0.07, { len: 0.04 });
    add(0, 'kick', 0, 1, 0.34); add(8, 'kick', 0, 1, 0.3);
    if (v >= 1 || sec === 'B') { stab(2, 0.24); stab(10, 0.24); }
    if (v === 2) { add(4, 'click', 0, 1, 0.15); add(12, 'click', 0, 1, 0.15); }
  },
};

// ---- 4. Campfire Evening: D major / B minor, 70 BPM. Fingerpicked acoustic guitar, flute tune, low pad.
const Bm_ = chord('B', 'min'), G4 = chord('G'), D4 = chord('D'), A4 = chord('A'), Em4 = chord('E', 'min'), D4add9 = chord('D', 'add9'), Em7 = chord('E', 'min7');
const CAMPFIRE = {
  title: 'Campfire Evening', bpm: 70, swing: 0.5, seed: 4413, trim: 0.30,
  key: { pc: 2, scale: MAJOR },
  prog: { I: [Bm_, G4], A: [Bm_, G4, D4, A4, Bm_, G4, D4add9, A4], B: [G4, D4, Em4, Bm_, G4, D4, Em7, A4], O: [G4, D4] },
  form: [{ name: 'I', bars: 2 }, { name: 'A', bars: 8 }, { name: 'A', bars: 8, v: 1 }, { name: 'B', bars: 8 }, { name: 'A', bars: 8, v: 2 }, { name: 'O', bars: 2 }],
  melody: {
    lo: 66, hi: 88, center: 74,
    rhythms: {
      A: [[[0, 3], [3, 3], [6, 2], [8, 4], [12, 4]], [[0, 4], [4, 3], [7, 3], [10, 6]], [[0, 6], [6, 2], [8, 3], [11, 5]], [[0, 3], [3, 3], [6, 4], [10, 2], [12, 4]]],
      B: [[[0, 2], [2, 2], [4, 4], [8, 8]], [[0, 4], [4, 4], [8, 4], [12, 2], [14, 2]], [[2, 4], [6, 2], [8, 4], [12, 4]], [[0, 8], [8, 3], [11, 3], [14, 2]]],
    },
    cadences: [[[0, 6], [6, 2], [8, 8]], [[0, 8], [8, 4], [12, 4]]],
  },
  bar(c) {
    const { sec, v, b, ch, add } = c;
    const low = pcAt(ch.pc, 45), up = voiceUp(ch, 62, 3);
    const strings = [low, up[0], up[1], up[2]];
    const patterns = [[0, 1, 2, 3, 2, 1, 2, 1], [0, 2, 1, 3, 1, 2, 3, 2]];
    const pick = (pat, vel) => pat.forEach((si, i) => add(i * 2, 'pluck', strings[si], 2, vel * (i === 0 ? 1.15 : i % 2 ? 0.7 : 0.88), { ring: 1.8, bright: 4 }));
    if (sec === 'I') {
      pick(patterns[0], b ? 0.36 : 0.28);
      add(0, 'pad', voiceUp(ch, 45, 3), 16.6, 0.22 + 0.06 * b, { atk: 1.6, cut1: 650 });
      return;
    }
    if (sec === 'O') {
      if (b === 0) { pick(patterns[0], 0.34); add(0, 'pad', voiceUp(ch, 45, 3), 16.6, 0.26, { atk: 1.2, cut1: 650 }); add(0, 'lead', 74, 10, 0.3, { style: 'flute' }); return; }
      const n = [low, up[0], up[1], up[2]]; n.forEach((m, i) => add(i * 0.6, 'pluck', m, 2, 0.4, { ring: 3.4, bright: 4 }));
      add(0, 'pad', voiceUp(ch, 45, 3), 12, 0.26, { atk: 1.0, rel: 2.4, cut1: 650 });
      add(0, 'lead', 78, 12, 0.3, { style: 'flute' });
      return;
    }
    pick(patterns[(v === 1 || sec === 'B') && b % 2 ? 1 : 0], v === 2 ? 0.44 : 0.4);
    add(0, 'pad', voiceUp(ch, 45, 3), 16.6, 0.25 + (v === 2 ? 0.06 : 0), { atk: 1.2, cut1: 650 });
    const lift = v === 2 ? 2 : 0;
    for (const n of c.melody(lift)) add(n.at, 'lead', n.midi, n.len * 0.95, 0.42, { style: 'flute' });
    if (sec === 'B' && b % 2 === 0) add(0, 'kick', 0, 1, 0.16);
  },
};

// Island themes use their own meter / motifs instead of forcing the home 4/4 generator onto a waltz.
function islandTheme(island) {
  const frost = island === 'frost', stepsPerBar = frost ? 12 : 16;
  return {
    title: frost ? 'Snowbell Waltz' : 'Emberleaf Grove', bpm: frost ? 84 : 92, swing: frost ? 0.5 : 0.54,
    stepsPerBar, meter: frost ? '3/4' : '4/4', trim: frost ? 0.51 : 0.60, compressorAttack: 0.003,
    build() {
      const events = [], harmony = frost ? [C_, Am_, F_, G_] : [F_, C_, Am_, G_];
      const melody = frost ? [76,79,81,79,76,74,72,74] : [69,72,74,72,69,67,64,67];
      for (let bar = 0; bar < 48; bar++) {
        const ch = harmony[Math.floor(bar / 2) % harmony.length], base = bar * stepsPerBar;
        const add = (s, k, m, d, v, o = {}) => events.push({ s: base + s, k, m, d, v, o });
        const fade = bar < 2 || bar >= 46 ? 0.65 : 1;
        add(0, 'bass', pcAt(ch.pc, 43), 3, 0.35 * fade, { short: true });
        add(0, 'pad', voiceUp(ch, 55, 3), stepsPerBar, 0.2 * fade, { atk: 0.8, rel: 0.8, cut1: 700 });
        for (let beat = 0; beat < stepsPerBar / 4; beat++) {
          if (frost) add(beat * 4, 'bell', voiceUp(ch, 72, 3)[beat % 3], 3, 0.32 * fade, { ring: 1.3 });
          else { add(beat * 4, 'logdrum', beat % 2 ? 57 : 50, 1, 0.5 * fade); add(beat * 4 + 2, 'shaker', 0, 1, 0.08 * fade); }
        }
        for (let n = 0; n < 3; n++) add(n * (frost ? 4 : 5), frost ? 'bell' : 'pluck', melody[(bar * 2 + n) % melody.length] + (bar >= 24 && bar < 40 ? 12 : 0), 3, 0.5 * fade, frost ? { ring: 1.7 } : { ring: 1.4, bright: 5 });
      }
      events.sort((a, b) => a.s - b.s); return { events, steps: 48 * stepsPerBar };
    },
  };
}
// Original regional compositions: distinct harmony, melodies, meters and arrangements.
function landscapeTheme({ title, bpm, seed, harmony, motif, meter = 16, style }) {
  return {
    title, bpm, seed, swing: style === 'grove' ? 0.56 : 0.5,
    stepsPerBar: meter, meter: meter === 12 ? '3/4' : '4/4', trim: 0.43,
    build() {
      const rng = mulberry32(seed), events = [];
      for (let bar = 0; bar < 40; bar++) {
        const ch = harmony[Math.floor(bar / 2) % harmony.length], base = bar * meter;
        const add = (s, k, m, d, v, o = {}) => events.push({ s: base + s, k, m, d, v, o });
        const fade = bar < 2 || bar >= 38 ? 0.6 : 1;
        const bridge = bar >= 16 && bar < 24, reprise = bar >= 24 && bar < 38;
        add(0, 'pad', voiceUp(ch, style === 'ancient' ? 45 : 53, 3), meter, 0.23 * fade,
          { atk: 1.4, rel: 1.8, cut0: 350, cut1: style === 'ancient' ? 650 : 850 });
        add(0, 'bass', pcAt(ch.pc, 38), meter - 1, 0.28 * fade);
        if (style === 'ancient') {
          // Open, modal flute phrases, sparse harp-like plucks and distant wooden pulses.
          const n = voiceUp(ch, 57, 4);
          [0, 6, 10].forEach((s, j) => add(s, 'pluck', n[(j + bar) % 4], 4, 0.22 * fade, { ring: 2.7, bright: 2.5 }));
          if (bar % 2 === 0) add(0, 'logdrum', 38, 2, 0.14 * fade);
          if (bar >= 2 && bar % 4 !== 3) {
            [0, 6].forEach((s, j) => add(s + 2, 'lead', motif[(bar * 2 + j) % motif.length], 5, 0.3 * fade, { style: 'flute' }));
          }
          if (bar % 4 === 3) add(8, 'bell', voiceUp(ch, 77, 3)[1], 4, 0.10 * fade, { ring: 2.8 });
        } else if (style === 'snow' || style === 'aurora') {
          const notes = voiceUp(ch, style === 'snow' ? 65 : 60, 4);
          for (let s = 0; s < meter; s += style === 'snow' ? 3 : 4) {
            add(s, style === 'snow' ? 'pluck' : 'ep', notes[(s / (style === 'snow' ? 3 : 4) + bar) % 4], 3,
              0.21 * fade, style === 'snow' ? { ring: 2.1, bright: 3 } : { ring: 3, index: 0.6 });
          }
          if (bar >= 2) for (let j = 0; j < (bridge ? 2 : 3); j++) {
            const s = j * (meter === 12 ? 4 : 5);
            add(s, style === 'snow' ? 'lead' : 'bell', motif[(bar * 3 + j) % motif.length] + (reprise ? 12 : 0),
              style === 'snow' ? 3.5 : 4, 0.3 * fade, style === 'snow' ? { style: 'flute' } : { ring: 2.4 });
          }
          if (rng() > 0.5) add(meter - 2, 'bell', notes[2] + 12, 2, 0.10 * fade, { ring: 2.2 });
        } else {
          const notes = voiceUp(ch, 60, 4);
          for (let beat = 0; beat < 4; beat++) {
            add(beat * 4, 'logdrum', beat % 2 ? 55 : 48, 1, (style === 'grove' ? 0.32 : 0.18) * fade);
            add(beat * 4 + 2, 'shaker', 0, 1, 0.07 * fade, { len: 0.08 });
            add(beat * 4 + 1, 'pluck', notes[(beat + bar) % 4], 2, 0.2 * fade, { ring: 1.3, bright: 4 });
          }
          if (bar >= 2) for (let j = 0; j < (bridge ? 2 : 4); j++) {
            add(j * 4, style === 'grove' ? 'marimba' : 'lead', motif[(bar * 2 + j) % motif.length] + (reprise && style === 'grove' ? 12 : 0),
              3.3, 0.35 * fade, style === 'grove' ? { ring: 1.4 } : { style: 'flute' });
          }
        }
      }
      events.sort((a, b) => a.s - b.s);
      return { events, steps: 40 * meter };
    },
  };
}
const ANCIENT_FOREST = landscapeTheme({
  title: 'Ancient Forest', bpm: 62, seed: 6103, style: 'ancient',
  harmony: [chord('D', 'sus2'), chord('C', 'add9'), chord('G', 'sus2'), chord('D', 'min7')],
  motif: [74, 77, 79, 81, 79, 77, 74, 72, 69, 72, 74, 79],
});
const PINE_WHISPERS = landscapeTheme({
  title: 'Pine Whispers', bpm: 78, seed: 7109, style: 'snow', meter: 12,
  harmony: [chord('G', 'maj7'), chord('E', 'min7'), chord('C', 'add9'), chord('D', 'sus4')],
  motif: [74, 79, 81, 83, 81, 79, 76, 74, 72, 76, 79, 78],
});
const AURORA = landscapeTheme({
  title: 'Aurora over Frostpine', bpm: 66, seed: 8101, style: 'aurora',
  harmony: [chord('E', 'min9'), chord('C', 'maj7'), chord('G', 'add9'), chord('B', 'min7')],
  motif: [76, 79, 83, 86, 83, 81, 79, 78, 76, 74, 71, 74],
});
const BAMBOO = landscapeTheme({
  title: 'Bamboo Lanterns', bpm: 100, seed: 9103, style: 'grove',
  harmony: [chord('F', 'add9'), chord('D', 'min7'), chord('Bb', 'maj7'), chord('C', 'sus2')],
  motif: [69, 72, 77, 79, 77, 74, 72, 69, 65, 69, 72, 74],
});
const MOON_ORCHID = landscapeTheme({
  title: 'Moon Orchid Serenade', bpm: 74, seed: 10111, style: 'orchid',
  harmony: [chord('A', 'min9'), chord('F', 'maj7'), chord('C', 'add9'), chord('G', 'sus4')],
  motif: [76, 81, 79, 76, 74, 72, 69, 72, 76, 79, 81, 83],
});
// Dungeon composition: a quiet minor/modal question answered by distant glass bells.
const MOSSBOUND_ECHOES = {
  title: 'Mossbound Echoes', bpm: 68, swing: 0.5, stepsPerBar: 16, meter: '4/4', trim: 0.55,
  build() {
    const events = [], harmony = [chord('D', 'min9'), chord('Bb', 'maj7'), chord('G', 'min9'), chord('A', 'sus4')];
    const question = [74,77,76,69,74,72,69,65], answer = [77,79,81,82,79,76,74,72];
    for (let bar = 0; bar < 32; bar++) {
      const ch = bar >= 30 ? harmony[0] : harmony[Math.floor(bar / 2) % 4], base = bar * 16;
      const fade = bar < 2 || bar >= 30 ? 0.6 : 1, middle = bar >= 12 && bar < 20;
      const add = (s, k, m, d, v, o = {}) => events.push({ s: base + s, k, m, d, v: v * fade, o });
      add(0, 'pad', voiceUp(ch, 48, 4), 15, 0.16, { atk: 1.3, rel: 2, cut0: 300, cut1: 650 });
      add(0, 'bass', pcAt(ch.pc, 36), 12, 0.18);
      const arp = voiceUp(ch, 60, 4);
      [0, 6, 12].forEach((s, n) => add(s, 'pluck', arp[(n + bar % 2) % 4], 3, 0.16, { ring: 2.8, bright: 2.4 }));
      if (bar % 2 === 0 && bar < 30) add(0, 'logdrum', 38, 1, 0.075);
      if (bar >= 2 && bar % 4 !== 3 && bar < 30) {
        const motif = middle ? answer : question;
        add(2, 'lead', motif[bar % 8], 5.5, 0.22, { style: 'flute' });
        add(10, 'bell', motif[(bar + 3) % 8] + 12, 3, 0.12, { ring: 3.2 });
        if (middle) add(8, 'marimba', arp[(bar + 1) % 4], 3, 0.12, { ring: 1.3 });
      } else if (bar % 4 === 3) add(8, 'bell', bar >= 30 ? 74 : arp[2] + 12, 4, 0.10, { ring: 3.5 });
    }
    events.sort((a, b) => a.s - b.s); return { events, steps: 32 * 16 };
  },
};
// Storybook page composition (Step 52a): a cheerful, bouncy, SNES-flavoured tune for the paper pages: an oom-pah bass, a woodblock backbeat and shaker, a marimba bounce and a whistle lead over C - Am - F - G, an
// arpeggiated bridge and a bigger last verse. 32 bars of 16 steps at 118 bpm (about 65 s), a gentle swing; it loops while a page is open and fades in / out like the dungeon's.
const PAPER_MEADOW = {
  title: 'Paper Meadow', bpm: 118, swing: 0.56, stepsPerBar: 16, meter: '4/4', trim: 0.4,
  build() {
    const events = [];
    const prog = [chord('C'), chord('A', 'min'), chord('F'), chord('G')];
    const bridge = [chord('F'), chord('G'), chord('E', 'min'), chord('A', 'min'), chord('F'), chord('G'), chord('C'), chord('G', 'dom7')];
    // the lead, bar by bar [step, midi, steps]
    const A1 = [
      [[0, 76, 3], [3, 79, 1], [4, 81, 2], [6, 79, 2], [8, 76, 3], [11, 72, 1], [12, 74, 4]],
      [[0, 76, 3], [3, 72, 1], [4, 76, 2], [6, 81, 2], [8, 79, 4], [12, 76, 4]],
      [[0, 77, 3], [3, 81, 1], [4, 84, 2], [6, 81, 2], [8, 77, 3], [11, 74, 1], [12, 72, 4]],
      [[0, 74, 2], [2, 79, 2], [4, 83, 3], [7, 79, 1], [8, 74, 8]],
    ];
    const A2 = [
      [[0, 79, 3], [3, 84, 1], [4, 83, 2], [6, 81, 2], [8, 79, 3], [11, 76, 1], [12, 79, 4]],
      [[0, 81, 3], [3, 79, 1], [4, 76, 2], [6, 72, 2], [8, 76, 4], [12, 81, 4]],
      [[0, 77, 2], [2, 81, 2], [4, 84, 4], [8, 81, 2], [10, 77, 2], [12, 72, 4]],
      [[0, 74, 2], [2, 76, 2], [4, 79, 2], [6, 83, 2], [8, 84, 8]],
    ];
    for (let bar = 0; bar < 32; bar++) {
      const sec = bar < 8 ? 'A' : bar < 16 ? 'A2' : bar < 24 ? 'B' : 'A3';
      const ch = sec === 'B' ? bridge[bar - 16] : prog[bar % 4], base = bar * 16;
      const fade = bar < 1 ? 0.7 : bar >= 31 ? 0.8 : 1, big = sec === 'A3' || sec === 'B';
      const add = (s, k, m, d, v, o = {}) => events.push({ s: base + s, k, m, d, v: v * fade, o });
      const root = pcAt(ch.pc, 36), oct = root + 12, fifth = root + 7;
      // bass: oom-pah
      add(0, 'bass', root, 3, 0.34, { short: true }); add(3, 'bass', oct, 1.5, 0.22, { short: true }); add(6, 'bass', fifth, 2, 0.26, { short: true });
      add(8, 'bass', root, 3, 0.34, { short: true }); add(11, 'bass', oct, 1.5, 0.22, { short: true }); add(14, 'bass', bar % 4 === 3 ? fifth + 2 : fifth, 2, 0.26, { short: true });
      // pad under everything
      add(0, 'pad', voiceUp(ch, 55, 4), 15, big ? 0.15 : 0.11, { atk: 0.5, rel: 1.2, cut0: 600, cut1: 1500 });
      // drums: soft kick, woodblock backbeat, shaker 8ths, a little fill at phrase ends
      add(0, 'kick', 0, 1, 0.32); add(8, 'kick', 0, 1, 0.27); if (big) add(10, 'kick', 0, 1, 0.2);
      add(4, 'click', 0, 1, 0.14); add(12, 'click', 0, 1, 0.14);
      for (let s = 0; s < 16; s += 2) add(s, 'shaker', 0, 1, s % 4 === 0 ? 0.1 : 0.07, { len: 0.05 });
      if (bar % 4 === 3) { add(14, 'logdrum', 50, 1, 0.12); add(15, 'logdrum', 55, 1, 0.1); }
      // marimba bounce: chord tones on the off-beats
      const arp = voiceUp(ch, 60, 4);
      for (let k = 0; k < 8; k++) if (sec !== 'B' || k % 2 === 0) add(k * 2, 'marimba', arp[(k + (bar % 2)) % 4] + (k % 4 === 3 ? 12 : 0), 1.5, sec === 'A' && bar < 4 ? 0.09 : 0.13, { ring: 1.1 });
      // the lead
      if (sec === 'A' || sec === 'A2' || sec === 'A3') {
        const src = (sec === 'A' ? A1 : A2)[bar % 4], up = sec === 'A3' && bar % 2 === 1 ? 12 : 0;
        for (const [s, m, d] of src) add(s, 'lead', m + up, d - 0.3, 0.3, { style: 'whistle' });
        if (sec !== 'A') for (const [s, m] of src) if (s % 8 === 0 || s === 4) add(s, 'bell', m + 12, 3, 0.1, { ring: 2.4 });
      } else {
        // bridge: a climbing arpeggio, then a held note
        const lad = voiceUp(ch, 67, 5);
        [0, 2, 4, 6, 8].forEach((s, n) => add(s, 'lead', lad[n], 1.7, 0.27, { style: 'whistle' }));
        add(10, 'lead', lad[4], 5.5, 0.3, { style: 'whistle' });
        add(0, 'bell', lad[2] + 12, 4, 0.1, { ring: 3 }); add(8, 'bell', lad[3] + 12, 4, 0.1, { ring: 3 });
      }
    }
    events.sort((a, b) => a.s - b.s);
    return { events, steps: 32 * 16 };
  },
};
// Frostpine page composition (Step 52b, "Paper Snow"): a sleigh-ride tune for the snowy pages: a glockenspiel melody over warm electric-piano chords in F major (F - Dm - Bb - C, a bridge through Gm - C - Am - Dm), SLEIGH BELLS
// (the shaker voice on every 8th, with a bright accent), a soft kick and a woodblock backbeat, a flute answering in the second verse. 32 bars of 16 steps at 96 bpm (about 80 s), loops while a Frostpine page is open.
const PAPER_SNOW = {
  title: 'Paper Snow', bpm: 96, swing: 0.54, stepsPerBar: 16, meter: '4/4', trim: 0.44,
  build() {
    const events = [];
    const prog = [chord('F'), chord('D', 'min'), chord('Bb'), chord('C')];
    const bridge = [chord('G', 'min'), chord('C'), chord('A', 'min'), chord('D', 'min'), chord('Bb'), chord('C'), chord('F'), chord('C', 'dom7')];
    const A1 = [
      [[0, 81, 3], [3, 84, 1], [4, 86, 2], [6, 84, 2], [8, 81, 4], [12, 77, 4]],
      [[0, 81, 3], [3, 77, 1], [4, 81, 2], [6, 84, 2], [8, 82, 4], [12, 81, 4]],
      [[0, 82, 3], [3, 86, 1], [4, 89, 2], [6, 86, 2], [8, 82, 3], [11, 79, 1], [12, 77, 4]],
      [[0, 79, 2], [2, 84, 2], [4, 88, 3], [7, 84, 1], [8, 79, 8]],
    ];
    const A2 = [
      [[0, 84, 3], [3, 89, 1], [4, 88, 2], [6, 86, 2], [8, 84, 3], [11, 81, 1], [12, 84, 4]],
      [[0, 86, 3], [3, 84, 1], [4, 81, 2], [6, 77, 2], [8, 81, 4], [12, 86, 4]],
      [[0, 82, 2], [2, 86, 2], [4, 89, 4], [8, 86, 2], [10, 82, 2], [12, 77, 4]],
      [[0, 79, 2], [2, 81, 2], [4, 84, 2], [6, 88, 2], [8, 91, 8]],
    ];
    for (let bar = 0; bar < 32; bar++) {
      const sec = bar < 8 ? 'A' : bar < 16 ? 'A2' : bar < 24 ? 'B' : 'A3';
      const ch = sec === 'B' ? bridge[bar - 16] : prog[bar % 4], base = bar * 16;
      const fade = bar < 1 ? 0.7 : bar >= 31 ? 0.8 : 1, big = sec === 'A3' || sec === 'B';
      const add = (s, k, m, d, v, o = {}) => events.push({ s: base + s, k, m, d, v: v * fade, o });
      const root = pcAt(ch.pc, 36), fifth = root + 7;
      add(0, 'bass', root, 4, 0.3, { short: true }); add(8, 'bass', root + 12, 3, 0.22, { short: true }); add(12, 'bass', bar % 4 === 3 ? fifth + 2 : fifth, 3, 0.2, { short: true });
      add(0, 'pad', voiceUp(ch, 53, 4), 15, big ? 0.14 : 0.1, { atk: 0.7, rel: 1.4, cut0: 500, cut1: 1300 });
      add(0, 'kick', 0, 1, 0.26); add(8, 'kick', 0, 1, 0.22);
      add(4, 'click', 0, 1, 0.11); add(12, 'click', 0, 1, 0.11);
      for (let s = 0; s < 16; s += 2) add(s, 'shaker', 0, 1, s % 4 === 0 ? 0.1 : 0.07, { len: 0.09 });                         // sleigh bells
      add(0, 'bell', voiceUp(ch, 90, 2)[0], 2, 0.07, { ring: 1.4 }); add(8, 'bell', voiceUp(ch, 90, 2)[1], 2, 0.07, { ring: 1.4 });
      const arp = voiceUp(ch, 60, 4);
      for (let k = 0; k < 8; k++) if (sec !== 'B' || k % 2 === 0) add(k * 2 + 1 > 15 ? 14 : k * 2, 'ep', arp[(k + bar % 2) % 4] + (k % 4 === 3 ? 12 : 0), 2, sec === 'A' && bar < 4 ? 0.07 : 0.1, { ring: 1.6, index: 0.5 });
      if (sec === 'A' || sec === 'A2' || sec === 'A3') {
        const src = (sec === 'A' ? A1 : A2)[bar % 4];
        for (const [s, m, d] of src) add(s, 'bell', m + (sec === 'A3' && bar % 2 ? 12 : 0), d, 0.22, { ring: 2.4 });
        if (sec !== 'A') for (const [s, m, d] of src) if (s % 8 === 0) add(s, 'lead', m - 12, d + 1, 0.2, { style: 'flute' });
      } else {
        const lad = voiceUp(ch, 69, 5);
        [0, 2, 4, 6, 8].forEach((s, n) => add(s, 'bell', lad[n], 2, 0.2, { ring: 2.2 }));
        add(10, 'lead', lad[4], 5, 0.22, { style: 'flute' });
      }
    }
    events.sort((a, b) => a.s - b.s);
    return { events, steps: 32 * 16 };
  },
};
// Emberleaf page composition (Step 53a, "Paper Jungle"): a warm jungle groove for the Emberleaf Canopy pages: LOG DRUMS and a rolling marimba over a D minor / B flat / F / C turnaround, a woodblock backbeat and shaker, a
// round bass, a breathy flute answering in the second verse and a bridge that climbs through G minor and A7. 32 bars of 16 steps at 104 bpm (about 74 s), loops while an Emberleaf page is open.
const PAPER_JUNGLE = {
  title: 'Paper Jungle', bpm: 104, swing: 0.58, stepsPerBar: 16, meter: '4/4', trim: 0.42,
  build() {
    const events = [];
    const prog = [chord('D', 'min'), chord('Bb'), chord('F'), chord('C')];
    const bridge = [chord('G', 'min'), chord('D', 'min'), chord('Bb'), chord('A', 'dom7'), chord('G', 'min'), chord('C'), chord('F'), chord('A', 'dom7')];
    const A1 = [
      [[0, 74, 3], [3, 77, 1], [4, 81, 2], [6, 77, 2], [8, 74, 3], [11, 72, 1], [12, 74, 4]],
      [[0, 70, 3], [3, 74, 1], [4, 77, 2], [6, 74, 2], [8, 70, 4], [12, 72, 4]],
      [[0, 72, 3], [3, 76, 1], [4, 79, 2], [6, 77, 2], [8, 72, 3], [11, 69, 1], [12, 72, 4]],
      [[0, 72, 2], [2, 76, 2], [4, 79, 3], [7, 76, 1], [8, 72, 8]],
    ];
    const A2 = [
      [[0, 77, 3], [3, 81, 1], [4, 84, 2], [6, 81, 2], [8, 77, 3], [11, 74, 1], [12, 77, 4]],
      [[0, 74, 3], [3, 70, 1], [4, 74, 2], [6, 77, 2], [8, 82, 4], [12, 79, 4]],
      [[0, 77, 2], [2, 81, 2], [4, 84, 3], [7, 81, 1], [8, 77, 3], [11, 72, 1], [12, 72, 4]],
      [[0, 79, 2], [2, 76, 2], [4, 72, 2], [6, 76, 2], [8, 79, 8]],
    ];
    for (let bar = 0; bar < 32; bar++) {
      const sec = bar < 8 ? 'A' : bar < 16 ? 'A2' : bar < 24 ? 'B' : 'A3';
      const ch = sec === 'B' ? bridge[bar - 16] : prog[bar % 4], base = bar * 16;
      const fade = bar < 1 ? 0.7 : bar >= 31 ? 0.8 : 1, big = sec === 'A3' || sec === 'B';
      const add = (s, k, m, d, v, o = {}) => events.push({ s: base + s, k, m, d, v: v * fade, o });
      const root = pcAt(ch.pc, 36), fifth = root + 7;
      // bass: a round, walking two-feel
      add(0, 'bass', root, 3, 0.32, { short: true }); add(6, 'bass', fifth, 2, 0.24, { short: true }); add(8, 'bass', root + 12, 2, 0.24, { short: true }); add(12, 'bass', bar % 4 === 3 ? fifth + 2 : fifth, 3, 0.22, { short: true });
      add(0, 'pad', voiceUp(ch, 53, 4), 15, big ? 0.13 : 0.1, { atk: 0.6, rel: 1.3, cut0: 520, cut1: 1300 });
      // log drums: a rolling jungle pattern that thickens in the big verses
      add(0, 'kick', 0, 1, 0.3); add(10, 'kick', 0, 1, 0.22); if (big) add(6, 'kick', 0, 1, 0.16);
      for (const s of [0, 3, 6, 10, 12]) add(s, 'logdrum', s % 6 === 0 ? 38 : 45, 1, s === 0 ? 0.11 : 0.08);
      if (bar % 4 === 3) { add(13, 'logdrum', 50, 1, 0.1); add(14, 'logdrum', 53, 1, 0.1); add(15, 'logdrum', 57, 1, 0.09); }
      add(4, 'click', 0, 1, 0.12); add(12, 'click', 0, 1, 0.12);
      for (let s = 0; s < 16; s += 2) add(s, 'shaker', 0, 1, s % 4 === 0 ? 0.1 : 0.07, { len: 0.06 });
      // the marimba roll: chord tones on every 16th pair, softer under the lead
      const arp = voiceUp(ch, 62, 4);
      for (let k = 0; k < 8; k++) if (sec !== 'B' || k % 2 === 0) add(k * 2 + (k % 2 ? 1 : 0), 'marimba', arp[(k + (bar % 2)) % 4] + (k % 4 === 3 ? 12 : 0), 1.5, sec === 'A' && bar < 4 ? 0.08 : 0.11, { ring: 1.2 });
      // the tune: marimba lead, a flute answers in the second verse and the last one
      if (sec === 'A' || sec === 'A2' || sec === 'A3') {
        const src = (sec === 'A' ? A1 : A2)[bar % 4], up = sec === 'A3' && bar % 2 === 1 ? 12 : 0;
        for (const [s, m, d] of src) add(s, 'marimba', m + up, Math.max(1.2, d - 0.3), 0.26, { ring: 1.6 });
        if (sec !== 'A') for (const [s, m, d] of src) if (s % 8 === 0) add(s, 'lead', m - 12, d + 1, 0.19, { style: 'flute' });
      } else {
        const lad = voiceUp(ch, 69, 5);
        [0, 2, 4, 6, 8].forEach((s, n) => add(s, 'marimba', lad[n], 2, 0.22, { ring: 1.8 }));
        add(10, 'lead', lad[4], 5, 0.22, { style: 'flute' });
        add(0, 'bell', lad[2] + 12, 4, 0.08, { ring: 3 });
      }
    }
    events.sort((a, b) => a.s - b.s);
    return { events, steps: 32 * 16 };
  },
};
const TRACKS = [MORNING, TIDE, STROLL, CAMPFIRE, islandTheme('frost'), islandTheme('ember'),
  ANCIENT_FOREST, PINE_WHISPERS, AURORA, BAMBOO, MOON_ORCHID, MOSSBOUND_ECHOES, PAPER_MEADOW, PAPER_SNOW, PAPER_JUNGLE];
export const REGION_TRACKS = { home: [0, 2, 1, 3], frost: [4, 7, 8], ember: [5, 9, 10], ritual: [6], dungeon: [11], page: [12], 'page-frost': [13], 'page-ember': [14] };
export const TRACK_TITLES = TRACKS.map((t) => t.title);
const built = [];
export function getTrack(i) {
  if (!built[i]) {
    const def = TRACKS[i], b = buildTrack(def);
    const stepSec = 60 / def.bpm / 4;
    built[i] = { def, events: b.events, steps: b.steps, stepSec, beatSec: stepSec * 4 };
  }
  return built[i];
}
/** Seconds from the track start for a (fractional) step, with the swing shuffle applied to the 8ths / 16ths inside each beat. */
function stepTime(tr, step) {
  const beat = Math.floor(step / 4), p = step / 4 - beat, m = tr.def.swing;
  const sp = p < 0.5 ? p * 2 * m : m + (p - 0.5) * 2 * (1 - m);
  return (beat + sp) * tr.beatSec;
}
export function trackInfo() {
  return TRACKS.map((_, i) => { const tr = getTrack(i); return { title: tr.def.title, bpm: tr.def.bpm, meter: tr.def.meter || '4/4', bars: tr.steps / (tr.def.stepsPerBar || STEPS_PER_BAR), seconds: +stepTime(tr, tr.steps).toFixed(1), events: tr.events.length }; });
}

// ------------------------------------------------------------------------------------------------ sequencer
class Sequencer {
  constructor(eng, tr, base) {
    this.eng = eng; this.tr = tr; this.base = base; this.i = 0; this.count = 0; this.resyncs = 0;
    if (tr.def.compressorAttack) eng.comp.attack.value = tr.def.compressorAttack;
    this.fading = false; this.fadingOut = false;
  }
  timeOf(step) { return stepTime(this.tr, step); }
  get endT() { return this.base + stepTime(this.tr, this.tr.steps); }
  /** Schedule every event whose time is before `until` (audio-clock seconds). `now` (live only) resyncs the clock if the timer stalled. */
  schedule(now, until) {
    const ev = this.tr.events, e = this.eng, trim = this.tr.def.trim, ss = this.tr.stepSec;
    while (this.i < ev.length) {
      const x = ev[this.i], t = this.base + this.timeOf(x.s);
      if (t > until) break;
      if (now !== null) {
        const lag = now - t;
        if (lag > 0.25) { this.base += lag + 0.05; this.resyncs++; continue; }     // the timer stalled: shift the clock, never bunch notes up
      }
      VOICES[x.k](e, t, x.m, x.d * ss, x.v * trim, e.bus(x.k), x.o);
      this.i++; this.count++;
    }
  }
  /** Position the clock so that track-time `pos` (seconds) is at audio time `at`. */
  seek(pos, at) {
    this.base = at - pos;
    const ev = this.tr.events;
    let i = 0;
    while (i < ev.length && this.timeOf(ev[i].s) < pos - 1e-6) i++;
    this.i = i;
  }
}

// ------------------------------------------------------------------------------------------------ offline render (debug / level check)
/** Renders track `index` (the first `seconds`, default the whole track) into an OfflineAudioContext; levels are before the music bus (x0.3) and the master. */
export async function renderTrack(index, seconds = null, { sampleRate = 32000 } = {}) {
  const tr = getTrack(index), total = stepTime(tr, tr.steps);
  const secs = Math.min(seconds || total, total) + 2;          // + tail
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OAC(2, Math.ceil(secs * sampleRate), sampleRate);
  const eng = new Engine(ctx, ctx.destination, makeAssets(ctx), 1);
  const seq = new Sequencer(eng, tr, 0);
  const limit = seconds || total;
  // schedule in 4 s chunks (suspend / resume) so only the notes of the next few seconds exist in the graph, like the live look-ahead
  const CH = 4;
  seq.schedule(null, Math.min(limit, CH + 1));
  for (let t = CH; t < limit; t += CH) {
    ctx.suspend(t).then(() => { seq.schedule(null, Math.min(limit, t + CH + 1)); ctx.resume(); });
  }
  const buf = await ctx.startRendering();
  let peak = 0, sum = 0, n = 0, win = 0, winMax = 0, wn = 0;
  const W = Math.floor(sampleRate);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    win = 0; wn = 0;
    for (let i = 0; i < d.length; i++) {
      const a = d[i];
      if (a > peak) peak = a; else if (-a > peak) peak = -a;
      sum += a * a; n++;
      win += a * a; wn++;
      if (wn === W) { winMax = Math.max(winMax, Math.sqrt(win / wn)); win = 0; wn = 0; }
    }
  }
  const rms = Math.sqrt(sum / n);
  return {
    index, title: tr.def.title, seconds: +(seconds || total).toFixed(1), notes: seq.count,
    peak: +peak.toFixed(3), rms: +rms.toFixed(4), rmsDb: +(20 * Math.log10(rms)).toFixed(1), loudestSecondRms: +winMax.toFixed(4),
    atBus: { peak: +(peak * MUSIC_VOL).toFixed(3), rms: +(rms * MUSIC_VOL).toFixed(4) },
  };
}

// ------------------------------------------------------------------------------------------------ Music
export class Music {
  constructor(sfx) {
    this.sfx = sfx;
    this.ctx = null; this.bus = null; this.assets = null;
    this._enabled = true;
    try { this._enabled = localStorage.getItem(STORE_KEY) !== '0'; } catch (_) { /* storage unavailable */ }
    this._listeners = { track: new Set(), enabled: new Set() };
    this._wanted = false; this._booted = false; this._running = false;
    this._poll = 0; this._timer = 0;
    this._duck = 1;
    this._eng = null; this._seq = null;
    this._idx = -1;              // index of the track that is playing / paused / just played
    this._nextIdx = 0;
    this.clock = null;
    this.region = () => 'home';
    this._lastRegion = null;
    this._dawnPending = false;
    this._state = 'idle';        // idle | playing | gap
    this._gapUntil = 0; this._gapLeft = GAP; this._pos = 0;
    this.stats = { notes: TRACKS.map(() => 0), total: 0, resyncs: 0, ticks: 0 };
    document.addEventListener('visibilitychange', () => this._sync());
    sfx.onChange(() => this._sync());
  }

  // ---------------------------------------------------------------- public API
  get enabled() { return this._enabled; }
  get current() { return this._idx >= 0 ? TRACKS[this._idx].title : null; }
  get currentIndex() { return this._idx; }
  get state() { return this._state; }
  get running() { return this._running; }
  get titles() { return TRACK_TITLES; }
  get duckLevel() { return this._duck; }

  setClock(clock) {
    this.clock = clock;
    this._dawnPending = clock.phase === 'dawn';
    clock.on('phase', (phase) => { if (phase === 'dawn') this._dawnPending = true; });
    this._nextIdx = this._chooseNext(-1);
  }

  _chooseNext(after) {
    const region = this.region();
    const regional = REGION_TRACKS[region];
    if (region !== 'home' && regional) return regional[(Math.max(-1, regional.indexOf(after)) + 1) % regional.length];
    if (!this.clock) return (after + 1) % 4;
    if (this._dawnPending && this.clock.nightness < 0.7) { this._dawnPending = false; return 0; }
    const pool = this.clock.nightness > 0.55 ? [3, 1] : [0, 2, 1];
    return pool[(Math.max(-1, pool.indexOf(after)) + 1) % pool.length];
  }

  /** Called as players move, even while muted. Change area with a soft fade instead of waiting for track end. */
  updateRegion() {
    const region = this.region();
    if (region === this._lastRegion) return false;
    this._lastRegion = region;
    this._nextIdx = this._chooseNext(-1);
    if (!this._booted) return true;
    this._retire(0.65);
    this._seq = null;
    this._pos = 0;
    this._state = 'gap';
    this._gapLeft = 0.5;
    this._gapUntil = this.ctx.currentTime + this._gapLeft;
    return true;
  }

  on(evt, fn) { const s = this._listeners[evt]; if (!s) return () => {}; s.add(fn); return () => s.delete(fn); }
  _emit(evt, arg) { for (const fn of this._listeners[evt]) { try { fn(arg); } catch (e) { console.error(e); } } }

  /** Begin (lazily: waits for the AudioContext, which needs a user gesture). Safe to call more than once. */
  start() {
    this._wanted = true;
    if (this._booted) { this._sync(); return; }
    if (this._poll) return;
    const check = () => {
      if (this.sfx.ctx && this.sfx.master && this.sfx.ctx.state === 'running') { clearInterval(this._poll); this._poll = 0; this._boot(); }
    };
    this._poll = setInterval(check, 250);
    check();
  }

  setEnabled(on) {
    on = !!on;
    if (on === this._enabled) return on;
    this._enabled = on;
    try { localStorage.setItem(STORE_KEY, on ? '1' : '0'); } catch (_) { /* ignore */ }
    this._sync();
    this._emit('enabled', on);
    return on;
  }
  toggle() { return this.setEnabled(!this._enabled); }

  /** Lower the music to `amount` (0..1 of normal) over `seconds` (the feast scene). */
  duck(amount = 0.4, seconds = 0.6) { this._duck = clamp(amount, 0, 1); this._applyBus(Math.max(0.02, seconds / 3)); }
  unduck(seconds = 1.5) { this._duck = 1; this._applyBus(Math.max(0.02, seconds / 3)); }
  /** Brief local impact duck; a scene/music change cancels its scheduled restore. */
  impact(amount = 0.707, duration = 0.25) {
    if (!this._booted) return;
    const now = this.ctx.currentTime, target = this._active() ? MUSIC_VOL * this._duck : 0;
    this.bus.gain.cancelScheduledValues(now); this.bus.gain.setTargetAtTime(target * amount, now, 0.012); this.bus.gain.setTargetAtTime(target, now + duration, 0.05);
  }

  /** Skip to the next track (quick fade, then the next one starts). */
  next() {
    if (!this._booted) { this._nextIdx = this._chooseNext(this._nextIdx); return; }
    const now = this.ctx.currentTime;
    if (this._state === 'gap') { this._gapUntil = now; this._gapLeft = 0; return; }     // already between tracks: start the next right away
    this._retire(0.25);
    this._seq = null;
    this._state = 'gap';
    this._nextIdx = this._chooseNext(this._idx);
    this._gapUntil = now + 1.0; this._gapLeft = 1.0;
  }

  renderTrack(index, seconds) { return renderTrack(index, seconds); }
  trackInfo() { return trackInfo(); }

  // ---------------------------------------------------------------- internals
  _boot() {
    const ctx = this.sfx.ctx;
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(this.sfx.master);
    this.assets = makeAssets(ctx);
    ctx.addEventListener('statechange', () => this._sync());
    this._booted = true;
    this._sync();
  }

  _active() {
    return this._booted && this._wanted && this._enabled && !document.hidden && !this.sfx.muted && this.ctx.state === 'running';
  }

  _sync() {
    if (!this._booted) return;
    const act = this._active();
    if (act && !this._running) this._resume();
    else if (!act && this._running) this._pause();
    this._applyBus(act ? 0.15 : 0.06);
  }

  _applyBus(tc = 0.12) {
    if (!this._booted) return;
    const target = this._active() ? MUSIC_VOL * this._duck : 0;
    this.bus.gain.cancelScheduledValues?.(this.ctx.currentTime);
    this.bus.gain.setTargetAtTime(target, this.ctx.currentTime, tc);
  }

  /** Fade an engine out and throw it away a little later. */
  _retire(tc = 0.2) {
    const e = this._eng;
    this._eng = null;
    if (!e) return;
    e.fade.gain.cancelScheduledValues(this.ctx.currentTime);
    e.fade.gain.setTargetAtTime(0, this.ctx.currentTime, tc);
    setTimeout(() => e.dispose(), 4000 * Math.max(0.25, tc) + 500);
  }

  _resume() {
    this.updateRegion();
    this._running = true;
    const now = this.ctx.currentTime;
    if (this._state === 'playing' && this._seq) {
      // continue from the start of the bar we stopped in, on a fresh engine (no stale voices, nothing bunched up)
      const eng = new Engine(this.ctx, this.bus, this.assets, 1);
      if (this._seq.tr.def.compressorAttack) eng.comp.attack.value = this._seq.tr.def.compressorAttack;
      this._eng = eng;
      this._seq.eng = eng;
      this._seq.fading = false; this._seq.fadingOut = false;
      this._seq.seek(this._pos, now + 0.15);
    } else if (this._state === 'gap') {
      this._gapUntil = now + this._gapLeft;
    } else {
      this._beginTrack(this.clock ? this._chooseNext(-1) : this._nextIdx);
    }
    this._timer = setInterval(() => this._tick(), TICK_MS);
    this._tick();
  }

  _pause() {
    this._running = false;
    clearInterval(this._timer); this._timer = 0;
    const now = this.ctx.currentTime;
    if (this._state === 'playing' && this._seq) {
      const barSec = stepTime(this._seq.tr, this._seq.tr.def.stepsPerBar || STEPS_PER_BAR);
      this._pos = Math.max(0, Math.floor(Math.max(0, now - this._seq.base) / barSec) * barSec);
      this._retire(0.05);
    } else if (this._state === 'gap') {
      this._gapLeft = Math.max(0, this._gapUntil - now);
    }
  }

  _beginTrack(idx) {
    this._lastRegion = this.region();
    const now = this.ctx.currentTime;
    this._retire(0.1);
    const tr = getTrack(idx);
    const eng = new Engine(this.ctx, this.bus, this.assets, 0);
    eng.fade.gain.setValueAtTime(0, now);
    eng.fade.gain.linearRampToValueAtTime(1, now + 0.15 + FADE_IN);
    this._eng = eng;
    this._seq = new Sequencer(eng, tr, now + 0.15);
    this._idx = idx;
    this._nextIdx = this._chooseNext(idx);
    this._state = 'playing';
    this._emit('track', { index: idx, title: tr.def.title });
  }

  _tick() {
    if (!this._running) return;
    this.updateRegion();
    const now = this.ctx.currentTime;
    this.stats.ticks++;
    if (this._state === 'playing' && this._seq) {
      const seq = this._seq, before = seq.count, rs = seq.resyncs;
      seq.schedule(now, now + LOOKAHEAD);
      this.stats.notes[this._idx] += seq.count - before;
      this.stats.total += seq.count - before;
      this.stats.resyncs += seq.resyncs - rs;
      if (!seq.fadingOut && now >= seq.endT - FADE_OUT) {
        seq.fadingOut = true;
        this._eng.fade.gain.cancelScheduledValues(now);
        this._eng.fade.gain.setValueAtTime(this._eng.fade.gain.value, now);
        this._eng.fade.gain.setTargetAtTime(0, now, FADE_OUT / 4);
      }
      if (now >= seq.endT) {
        this._retire(0.2);
        this._seq = null;
        this._state = 'gap';
        this._gapUntil = now + GAP; this._gapLeft = GAP;
      }
    } else if (this._state === 'gap') {
      if (now >= this._gapUntil) this._beginTrack(this.clock ? this._chooseNext(this._idx) : this._nextIdx);
    }
  }
}
