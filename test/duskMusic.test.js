// Glowcap Marsh 69e: byte-pinned legacy events, original modal arrangements, local region and fade scheduling.
// Real offline level checks need Web Audio; use __game.music.renderTrack(i, s) in a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Music, getTrack, trackInfo, TRACK_TITLES, REGION_TRACKS, renderTrack } from '../public/js/audio/music.js';
import { ISLANDS, BRIDGES } from '../public/js/config.js';
import { createIslandTracker } from '../public/js/ui/inventoryTracking.js';
import { regionOf, inlandDistance } from '../public/js/world/terrain.js';
import { getIslandModule } from '../public/js/world/islands/registry.js';

test('all fifteen pre-69 music event lists remain byte-identical', () => {
  const hashes = JSON.parse(readFileSync(new URL('./fixtures/pre69Music.json', import.meta.url)));
  for (let i = 0; i < 15; i++) assert.equal(createHash('sha256').update(JSON.stringify(getTrack(i).events)).digest('hex'), hashes[i], TRACK_TITLES[i]);
});

test('marsh playlists have three distinct complete deterministic modal arrangements and no drum kit', () => {
  assert.deepEqual(REGION_TRACKS.duskcrown, [15, 16, 17]);
  assert.deepEqual(TRACK_TITLES.slice(15), ['Glowcap Lullaby', 'Spores in the Hush', 'Under the Crown']);
  assert.equal(TRACK_TITLES.length, 18);
  for (const i of REGION_TRACKS.duskcrown) {
    const tr = getTrack(i), rebuilt = tr.def.build();
    assert.deepEqual(tr.events, rebuilt.events); assert.equal(tr.steps, rebuilt.steps);
    assert.ok(trackInfo()[i].seconds > 95);
    let previous = -1;
    for (const e of tr.events) {
      assert.ok(e.s >= previous && e.s < tr.steps); previous = e.s;
      assert.ok(e.d > 0 && Number.isFinite(e.d)); assert.ok(e.v > 0 && e.v <= 1);
      for (const n of Array.isArray(e.m) ? e.m : [e.m]) assert.ok(Number.isFinite(n));
      assert.ok(!['kick', 'shaker', 'logdrum', 'snare'].includes(e.k));
    }
  }
  const lullaby = getTrack(15), hush = getTrack(16), crown = getTrack(17);
  assert.equal(lullaby.def.bpm, 66); assert.equal(hush.def.bpm, 58); assert.equal(crown.def.bpm, 72);
  assert.equal(hush.def.meter, '6/8'); assert.equal(hush.def.stepsPerBar, 12);
  assert.ok(lullaby.events.some((e) => e.k === 'bell' && e.m === 80)); // raised fourth in D Lydian
  assert.ok(hush.events.some((e) => e.k === 'theremin' && e.o.from !== e.m));
  assert.ok(hush.events.some((e) => e.k === 'plip')); assert.ok(hush.events.some((e) => e.k === 'click'));
  assert.ok(crown.events.filter((e) => e.k === 'glasspad').every((e) => e.o.reverse));
  const final = crown.events.filter((e) => e.k === 'glasspad' && e.s >= 28 * 16);
  assert.ok(final.length > 0); assert.ok(final.every((e) => e.m.includes(56) && !e.m.includes(55)));
});

test('this screen island tracker identifies Duskcrown at the landing and returns to home', () => {
  const tracker = createIslandTracker({ islands: ISLANDS, bridges: BRIDGES, regionAt: regionOf, inlandAt: inlandDistance });
  const p = { position: { x: 0, z: 0 } }; tracker.update([p]); assert.equal(tracker.islandOf(p), 'home');
  p.position = getIslandModule('duskcrown').spots().duskLanding; tracker.update([p]);
  assert.equal(tracker.islandOf(p), 'duskcrown');
  p.position = { x: 0, z: 0 }; tracker.update([p]); assert.equal(tracker.islandOf(p), 'home');
});

test('marsh entry/exit immediately retires over ~3 seconds, handles muted/unbooted changes and normal islands wait', () => {
  const prior = globalThis.document; globalThis.document = { addEventListener() {} };
  try {
    const m = new Music({ onChange() {} }); let region = 'home'; m.region = () => region;
    m.updateRegion(); region = 'duskcrown'; m.updateRegion(); assert.equal(m._nextIdx, 15);
    m._booted = true; m.ctx = { currentTime: 10 }; const fades = []; m._retire = (tc) => fades.push(tc);
    region = 'home'; m.updateRegion(); assert.equal(m._gapUntil, 13); assert.equal(m._nextIdx, 0);
    assert.equal(m.updateRegion(), false);
    m._enabled = false; region = 'duskcrown'; m.updateRegion(); assert.equal(m._gapUntil, 13);
    assert.equal(m._chooseNext(15), 16); assert.equal(m._chooseNext(16), 17); assert.equal(m._chooseNext(17), 15);
    region = 'ember'; m.updateRegion(); assert.equal(m._nextIdx, 5); assert.deepEqual(fades, [0.75, 0.75, 0.75]);
    m._state = 'playing'; const seq = m._seq = {}; region = 'frost'; m.updateRegion();
    assert.equal(m._seq, seq); assert.equal(m._state, 'playing'); assert.equal(m._nextIdx, 4); assert.equal(fades.length, 3);
    region = 'dungeon'; m.updateRegion(); assert.equal(fades[3], 0.65); assert.equal(m._gapUntil, 10.5);
  } finally { globalThis.document = prior; }
});

// This mock checks complete scheduler/voice graphs and oscillator cleanup; it deliberately DOES NOT measure audio levels.
class GraphContext {
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

test('every marsh event schedules through real voice functions with finite automation and stopped oscillators', async () => {
  const prior = globalThis.window; globalThis.window = { OfflineAudioContext: GraphContext };
  try {
    for (const i of REGION_TRACKS.duskcrown) {
      const result = await renderTrack(i, null, { sampleRate: 8000 }), ctx = GraphContext.last;
      assert.equal(result.notes, getTrack(i).events.length);
      const output=ctx.compressors[0].outputs[0], level=getTrack(i).def.level;
      if(level===1)assert.equal(output,ctx.destination);
      else {assert.equal(output.gain.value,level);assert.equal(output.outputs[0],ctx.destination);}
      assert.ok(ctx.oscillators.length > result.notes);
      for (const os of ctx.oscillators) assert.ok(Number.isFinite(os.startT) && os.stopT > os.startT);
      for (const [v, t] of ctx.automation) assert.ok(Number.isFinite(v) && Number.isFinite(t) && t >= 0);
    }
  } finally { globalThis.window = prior; }
});

test('only tracks 16/17 attenuate after compression to the measured quiet ambience range', () => {
  for(let i=0;i<16;i++)assert.equal(getTrack(i).def.level ?? 1,1);
  for(const [i,rms,peak,level] of [[16,0.2503,0.895,0.60],[17,0.2253,0.802,0.66]]) {
    assert.equal(getTrack(i).def.level,level);
    assert.ok(rms*level>=0.13 && rms*level<=0.16);assert.ok(peak*level<0.8);
  }
});
