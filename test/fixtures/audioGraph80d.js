// Audio graph stub reused for Step 80d: records every oscillator lifetime and automation value. No waveform rendering.
import assert from 'node:assert/strict';
export class GraphContext {
  constructor(ch, n, sr) { this.sampleRate = sr; this.destination = {}; this.length = n; this.channels = ch; this.oscillators = []; this.automation = []; this.compressors = []; GraphContext.last = this; }
  param() {
    const log = this.automation;
    return { value: 0, setValueAtTime(v, t) { log.push([v, t]); }, linearRampToValueAtTime(v, t) { log.push([v, t]); }, exponentialRampToValueAtTime(v, t) { assert.ok(v > 0); log.push([v, t]); } };
  }
  node() { return { outputs: [], connect(n) { this.outputs.push(n); return n; }, disconnect() {} }; }
  createGain() { return { ...this.node(), gain: this.param() }; }
  createBiquadFilter() { return { ...this.node(), frequency: this.param(), Q: this.param() }; }
  createOscillator() {
    const os = { ...this.node(), frequency: this.param(), detune: this.param(), start(t) { this.startT = t; }, stop(t) { this.stopT = t; } };
    this.oscillators.push(os); return os;
  }
  createBufferSource() { return { ...this.node(), start() {}, stop() {} }; }
  createConvolver() { return this.node(); }
  createDynamicsCompressor() { const node = { ...this.node(), ...Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map((k) => [k, this.param()])) }; this.compressors.push(node); return node; }
  createBuffer(ch, n, sr) { const data = Array.from({ length: ch }, () => new Float32Array(n)); return { numberOfChannels: ch, sampleRate: sr, getChannelData(i) { return data[i]; } }; }
  async suspend() {}
  resume() {}
  async startRendering() { await Promise.resolve(); return this.createBuffer(this.channels, this.length, this.sampleRate); }
}

