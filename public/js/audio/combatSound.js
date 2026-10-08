// Synthesized combat bus, bounded voices and offline level checks. Uses the same engine live and offline.
import { JUICE } from '../config.js';
import { admitVoice } from '../game/juiceLogic.js';

export const COMBAT_SOUNDS = new Set(['hit-sword', 'hit-axe', 'hit-hammer', 'hit-sling', 'hit-can', 'hit-heavy', 'crit', 'boom', 'defeat', 'hurt', 'windup', 'charge', 'charge-full', 'pip', 'perfect', 'whiff', 'block', 'clink-combat', 'heartbeat']);

export class CombatSound {
  constructor(ctx, output, random = Math.random) {
    this.ctx = ctx; this.random = random; this.voices = []; this.peakVoices = 0;
    this.gain = ctx.createGain(); this.gain.gain.value = JUICE.sound.gain;
    this.compressor = ctx.createDynamicsCompressor();
    Object.assign(this.compressor.threshold, { value: -18 }); this.compressor.knee.value = 12;
    this.compressor.ratio.value = 12; this.compressor.attack.value = 0.002; this.compressor.release.value = 0.12;
    // A soft ceiling catches coincident transients beyond the compressor's finite attack time.
    this.ceiling = ctx.createWaveShaper(); const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) curve[i] = 0.88 * Math.tanh((i / (curve.length - 1) * 2 - 1) / 0.88);
    this.ceiling.curve = curve; this.gain.connect(this.compressor).connect(this.ceiling).connect(output);
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = buffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = random() * 2 - 1;
    this.noise = buffer;
  }
  play(name, opts = {}) {
    if (!COMBAT_SOUNDS.has(name)) return false;
    const c = this.ctx, at = opts.at ?? c.currentTime, duration = Math.max(0.12, Math.min(2, opts.duration ?? (name === 'boom' ? 0.45 + (opts.size || 2) * 0.02 : name === 'defeat' ? 0.6 : 0.3)));
    const admission = admitVoice(this.voices, name, at, duration + 0.04, JUICE.sound.limits[name] ?? JUICE.sound.voices);
    this.voices = admission.live; if (!admission.accepted) return false;
    const cut = (v) => { v.gain.gain.cancelScheduledValues(at); v.gain.gain.setValueAtTime(0, at); for (const s of v.sources) { try { s.stop(at + 0.005); } catch (_) { /* ended */ } } };
    if (admission.cut) cut(admission.cut);
    if (this.voices.length >= JUICE.sound.totalVoices) cut(this.voices.shift());
    const voice = admission.voice; voice.sources = []; voice.gain = c.createGain(); voice.gain.gain.value = Math.max(0, Math.min(1, opts.vol ?? 1));
    const pan = c.createStereoPanner(); pan.pan.value = Math.max(-0.6, Math.min(0.6, opts.pan || 0)); voice.gain.connect(pan).connect(this.gain);
    this.voices.push(voice); this.peakVoices = Math.max(this.peakVoices, this.voices.length);
    const pitch = (opts.pitch || 1) * (1 + (this.random() * 2 - 1) * JUICE.sound.pitch);
    const cutoff = 1 + (this.random() * 2 - 1) * JUICE.sound.cutoff;
    const envelope = (node, length, vol, delay = 0) => {
      const g = c.createGain(), t = at + delay; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + length);
      node.connect(g).connect(voice.gain); voice.sources.push(node); node.start(t); node.stop(t + length + 0.02);
      node.onended = () => { node.disconnect(); g.disconnect(); if (voice.sources.every((s) => s === node || s._juiceEnded)) { voice.gain.disconnect(); pan.disconnect(); } node._juiceEnded = true; };
    };
    const tone = (a, b, len, vol = 0.18, delay = 0, type = 'sine') => {
      const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(a * pitch, at + delay); o.frequency.exponentialRampToValueAtTime(b * pitch, at + delay + len); envelope(o, len, vol, delay);
    };
    const noise = (len, vol = 0.14, f = 1600, end = 500) => {
      const src = c.createBufferSource(), filter = c.createBiquadFilter(); src.buffer = this.noise; filter.type = 'lowpass'; filter.frequency.setValueAtTime(f * cutoff, at); filter.frequency.exponentialRampToValueAtTime(end * cutoff, at + len); src.connect(filter);
      const g = c.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vol, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, at + len); filter.connect(g).connect(voice.gain);
      voice.sources.push(src); src.start(at, this.random() * 0.4); src.stop(at + len + 0.02); src.onended = () => { src._juiceEnded = true; src.disconnect(); filter.disconnect(); g.disconnect(); if (voice.sources.every((s) => s._juiceEnded)) { voice.gain.disconnect(); pan.disconnect(); } };
    };
    if (name.startsWith('hit-') && name !== 'hit-heavy') {
      const f = { 'hit-sword': 640, 'hit-axe': 240, 'hit-hammer': 140, 'hit-sling': 430, 'hit-can': 780 }[name];
      tone(f, f * 0.35, 0.12, 0.22, 0, 'triangle'); noise(0.07, 0.14, name === 'hit-can' ? 5200 : 2600);
      tone(f * 2.7, f * 2.5, 0.19, 0.045, 0.015);
    } else if (['hit-heavy', 'boom', 'hurt', 'heartbeat'].includes(name)) {
      const boom = name === 'boom', hurt = name === 'hurt'; tone(boom ? 110 : 90, boom ? 35 : 45, boom ? duration : 0.12, 0.28);
      noise(boom ? duration * 0.65 : 0.07, hurt ? 0.07 : 0.18, hurt ? 500 : 1800, 180);
      tone(hurt ? 220 : 65, hurt ? 100 : 40, 0.18, 0.065, 0.07);
    } else if (name === 'whiff' || name === 'perfect') {
      noise(name === 'perfect' ? 0.22 : 0.12, 0.12, 4800, 1400); if (name === 'perfect') tone(990, 1980, 0.25, 0.12);
    } else if (name === 'windup' || name === 'charge') {
      tone(name === 'charge' ? 180 : 120, name === 'charge' ? 650 : 450, duration, 0.06, 0, 'triangle'); noise(0.1, 0.025, 1000);
    } else if (name === 'block' || name === 'clink-combat') {
      tone(1760, 1650, 0.14, 0.15); tone(2640, 2600, 0.1, 0.04); noise(0.025, 0.08, 6000);
    } else {
      const notes = name === 'defeat' ? [660, 830, 990] : name === 'pip' ? [[523], [659], [784, 1046, 1319]][Math.max(0, Math.min(2, (opts.pip || 1) - 1))] : [990, 1485];
      if (name === 'defeat') tone(220, 550, 0.15, 0.18);
      notes.forEach((f, i) => tone(f, f * 1.01, 0.22, 0.11, i * 0.07)); noise(0.06, 0.025, 6000);
    }
    return true;
  }
  summary() { return { voices: this.voices.filter((v) => v.end > this.ctx.currentTime).length, peakVoices: this.peakVoices }; }
}

export async function renderCombatOffline(name, opts = {}) {
  const AC = globalThis.OfflineAudioContext || globalThis.window?.OfflineAudioContext;
  if (!AC) throw new Error('OfflineAudioContext is unavailable');
  let seed = 1; const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const c = new AC(2, 44100 * 3, 44100), engine = new CombatSound(c, c.destination, random);
  if (name === 'stress') for (let i = 0; i < 12; i++) engine.play(['hit-sword', 'hit-heavy', 'boom'][i % 3], { ...opts, at: 0.05 + i / 60 });
  else engine.play(name, { ...opts, at: 0.05 });
  const buffer = await c.startRendering(); let peak = 0, sum = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) for (const v of buffer.getChannelData(ch)) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
  return { name, peak, rms: Math.sqrt(sum / (buffer.length * buffer.numberOfChannels)), peakVoices: engine.peakVoices };
}
