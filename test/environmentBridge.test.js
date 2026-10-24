import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createEnvironmentBridge } from '../public/js/settings/environmentBridge.js';
import { DEFAULT_WORLD_SETTINGS as defaults } from '../public/js/settings/worldSettings.js';
import { FollowCamera } from '../public/js/camera/followCamera.js';
import { DayNight } from '../public/js/world/dayNight.js';
import { windStrength, setWindStrength, wobbleGroup, applySway } from '../public/js/world/wind.js';
import { Music } from '../public/js/audio/music.js';
import { AmbienceAudio } from '../public/js/audio/ambience.js';
import { GraphContext } from './fixtures/audioGraph80d.js';

const settings = (patch = {}) => ({ ...defaults, ...patch });

test('admin previews never save, broadcast, or set the authoritative clock; publishing time is host-only and deduplicated', () => {
  const clock = new DayNight({ persist: false });
  let set = 0, emits = 0;
  const original = clock.set.bind(clock);
  clock.set = (hour) => { set++; original(hour); };
  clock._sync = { isHost: true, emit() { emits++; } };
  const bridge = createEnvironmentBridge({ dayNight: clock, sync: { isHost: true } });
  const originalHour = clock.hour;
  bridge.apply(settings({ hour: 19, dayCycle: false }), { preview: true });
  for (let i = 0; i < 60; i++) bridge.beforeFrame(1 / 60);
  assert.equal(bridge.clock.hour, 19);
  assert.equal(clock.hour, originalHour); assert.equal(set, 0); assert.equal(emits, 0);
  assert.equal(bridge.clock.persist, false); assert.equal(bridge.clock._sync, null);
  bridge.apply(settings(), { preview: false }); assert.equal(bridge.clock, clock);
  bridge.applyPublishedTime(settings({ hour: 12 }));
  assert.equal(set, 1); assert.equal(clock.hour, 12);
  bridge.applyPublishedTime(settings({ hour: 12, brightness: 1.5 })); assert.equal(set, 1);
  const replica = createEnvironmentBridge({ dayNight: clock, sync: { isHost: false, isReplica: true } });
  assert.equal(replica.applyPublishedTime(settings({ hour: 23 })), false); assert.equal(set, 1);
});

test('environment controls call cosmetic adapters and lighting multipliers do not accumulate', () => {
  const calls = {};
  const renderer = { toneMappingExposure: 1 }, scene = { fog: { near: 140, far: 330 } };
  const bridge = createEnvironmentBridge({ renderer, scene,
    water: { setMotion: (x) => calls.water = x }, ambient: { setButterflyMotion: (x) => calls.butterflies = x },
    music: { setBaseTempo: (x) => calls.tempo = x, setVolume: (x) => calls.music = x },
    ambienceAudio: { setVolume: (x) => calls.nature = x }, followCam: { setSettings: (x) => calls.camera = x },
  });
  bridge.apply(settings({ brightness: 1.5, haze: 0.8, water: 0.2, musicVolume: 0, natureVolume: 0 }));
  assert.equal(calls.water, 0.2); assert.equal(calls.music, 0); assert.equal(calls.nature, 0);
  assert.equal(calls.camera.mode, 'original');
  bridge.beforeFrame(); bridge.afterLighting(); assert.equal(renderer.toneMappingExposure, 1.5);
  const fogNear = scene.fog.near;
  bridge.beforeFrame(); bridge.afterLighting(); assert.equal(renderer.toneMappingExposure, 1.5); assert.equal(scene.fog.near, fogNear);
  bridge.beforeFrame(); renderer.toneMappingExposure = 0.5; bridge.afterLighting();
  assert.equal(renderer.toneMappingExposure, 0.75, 'special-area exposure is respected');
  bridge.apply(settings()); bridge.beforeFrame(); bridge.afterLighting(); assert.equal(renderer.toneMappingExposure, 0.5);
});

test('wind changes shader and prop sway amplitude without moving the prop base', () => {
  const g = new THREE.Group(); g.position.set(4, 3, 2);
  const mat = new THREE.MeshBasicMaterial(); applySway(mat);
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <project_vertex>' };
  mat.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uWindStrength, windStrength);
  setWindStrength(0); wobbleGroup(g, 3, 0.2, 0);
  assert.equal(g.rotation.x, 0); assert.equal(g.rotation.z, 0);
  setWindStrength(1); wobbleGroup(g, 3, 0.2, 0); assert.notEqual(g.rotation.x, 0);
  assert.deepEqual(g.position.toArray(), [4, 3, 2]);
  setWindStrength(0.5); mat.dispose();
});

test('music volume composes with scene duck, impact duck, and mute without altering the master', () => {
  const prior = globalThis.document; globalThis.document = { addEventListener() {}, hidden: false };
  try {
    const events = [], music = new Music({ onChange() {}, muted: false });
    music._booted = music._wanted = music._running = true;
    music.ctx = { currentTime: 10, state: 'running' };
    music.bus = { gain: { cancelScheduledValues() {}, setTargetAtTime(...args) { events.push(args); } } };
    music.duck(0.5); music.impact(0.5, 1); music.setVolume(0.4);
    assert.equal(events.at(-2)[0], 0.1); assert.equal(events.at(-1)[0], 0.2);
    assert.equal(events.at(-1)[1], 11);
    music.sfx.muted = true; music.setVolume(0.8); assert.equal(events.at(-2)[0], 0); assert.equal(events.at(-1)[0], 0);
  } finally { globalThis.document = prior; }
});

test('nature volume routes all bird, cricket, regional and waterfall voices through one live bus', () => {
  const prior = globalThis.document; globalThis.document = { hidden: false };
  try {
    const ctx = new GraphContext(2, 1, 8000); ctx.currentTime = 0; ctx.state = 'running';
    const oldParam = ctx.param.bind(ctx);
    ctx.param = () => ({ ...oldParam(), setTargetAtTime(v, t) { this.value = v; ctx.automation.push([v, t]); } });
    const master = ctx.createGain(); master.gain.value = 0.9;
    const ambience = new AmbienceAudio({ ctx, master, muted: false }, { nightness: 0 });
    ambience.chirp('bird', 1); ambience.chirp('cricket', 1);
    for (const kind of ['wind', 'owl', 'frog', 'tropical']) ambience.regionalSound(kind);
    ambience.waterfall = () => 1; ambience.updateWaterfall(1);
    const bus = ambience._bus;
    for (const oscillator of ctx.oscillators) assert.equal(oscillator.outputs[0].outputs[0], bus);
    assert.equal(ambience.fall.gain.outputs[0], bus); assert.equal(bus.outputs[0], master);
    ambience.setVolume(0); assert.equal(bus.gain.value, 0); assert.equal(master.gain.value, 0.9);
    ambience.setVolume(0.7); assert.equal(bus.gain.value, 0.7);
  } finally { globalThis.document = prior; }
});


test('environment preview does not reactivate a follow camera blocked by shared-screen or special-scene context', () => {
  const followCam = new FollowCamera(new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 1000));
  const player = { facing: 0 };
  const bridge = createEnvironmentBridge({ followCam, players: { list: [player] } });
  bridge.apply(settings({ cameraMode: 'follow' }));
  for (const context of [{ count: 2 }, { allowed: false }]) {
    followCam.setSubject(player, context);
    assert.equal(followCam.followActive, false);
    for (let frame = 0; frame < 3; frame++) {
      bridge.beforeFrame(1 / 60);
      assert.equal(followCam.followActive, false, 'main retains sole ownership; no transient activation or yaw reset');
      assert.deepEqual(followCam.transformMovement({ x: 0, z: -1 }), { x: 0, z: -1 });
    }
  }
});


test('initial cloud revision zero preserves the saved host clock; later time edits apply normally', () => {
  const clock = new DayNight({ persist: false });
  clock.set(13.25); clock.locked = true;
  let sets = 0;
  const set = clock.set.bind(clock); clock.set = hour => { sets++; set(hour); };
  const bridge = createEnvironmentBridge({ dayNight: clock, sync: { isHost: true } });
  assert.equal(bridge.applyPublishedTime(settings(), { revision: 0 }), false);
  assert.equal(clock.hour, 13.25); assert.equal(clock.locked, true); assert.equal(sets, 0);
  assert.equal(bridge.applyPublishedTime(settings({ brightness: 1.4 }), { revision: 1 }), false);
  assert.equal(clock.hour, 13.25); assert.equal(sets, 0, 'a cosmetic publication does not reset saved time');
  assert.equal(bridge.applyPublishedTime(settings({ hour: 17 }), { revision: 2 }), true);
  assert.equal(clock.hour, 17); assert.equal(clock.locked, false); assert.equal(sets, 1);
  assert.equal(bridge.applyPublishedTime(settings({ hour: 17, dayCycle: false }), { revision: 3 }), true);
  assert.equal(clock.locked, true); assert.equal(sets, 2);
});
