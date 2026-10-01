import test from 'node:test';
import assert from 'node:assert/strict';
import {
  T, beatAt, lanternWaveAt, startDecision, nearLanding, cameraPose, shotOf, SHOT1, HOME, segmentClearance, pickCandidate, LANTERN_WAVE_MAX,
} from '../public/js/game/bridgeSceneLogic.js';

test('beat table is ordered and about ten seconds', () => {
  const keys = ['SWING', 'BUILD_END', 'REVEAL_END', 'BACK', 'END'];
  for (let i = 1; i < keys.length; i++) assert.ok(T[keys[i]] > T[keys[i - 1]]);
  assert.ok(T.END >= 9.5 && T.END <= 10.5);
  assert.deepEqual([0, 1.4, 1.6, 4.9, 5.1, 7.4, 7.6, 9.9, 10.1].map(beatAt), [1, 1, 2, 2, 3, 3, 4, 4, 5]);
});

test('lantern wave runs from the home end to past the far end', () => {
  assert.equal(lanternWaveAt(0), null);
  assert.equal(lanternWaveAt(T.LANTERN_FROM), 0);
  assert.equal(lanternWaveAt(T.LANTERN_TO + 1), LANTERN_WAVE_MAX);
});

test('start decision: wait for the host start and for a running cinematic, start in sync, drop a late scene', () => {
  assert.equal(startDecision({ busy: false, startAt: null, now: 1000 }).action, 'wait');
  assert.equal(startDecision({ busy: true, startAt: 1000, now: 1100 }).action, 'wait');
  const s = startDecision({ busy: false, startAt: 1000, now: 3500 });
  assert.equal(s.action, 'start'); assert.equal(s.t0, 2.5);
  assert.equal(startDecision({ busy: false, startAt: 1000, now: 500 }).t0, 0);
  assert.equal(startDecision({ busy: false, startAt: 1000, now: 1000 + T.END * 1000 + 1 }).action, 'late');
  assert.equal(startDecision({ busy: true, startAt: 1000, now: 1000 + T.END * 1000 + 1 }).action, 'late');
});

test('players near the home landing cheer', () => {
  assert.ok(nearLanding(10, -45, 9.5, -50.5));
  assert.ok(!nearLanding(40, 0, 9.5, -50.5));
});

test('camera path is continuous across the beats', () => {
  const g = { L: 32, npcU: -1.6, npcV: 4.3, isleU: 150, isleV: 3 };
  const keys = ['pu', 'pv', 'ph', 'lu', 'lv', 'lh'];
  for (const edge of [T.BUILD_START, T.BUILD_END, T.REVEAL_END, T.BACK]) {
    const a = cameraPose(edge - 1e-3, g), b = cameraPose(edge + 1e-3, g);
    for (const k of keys) assert.ok(Math.abs(a[k] - b[k]) < 0.1, `${k} jumps at ${edge}`);
  }
  assert.ok(cameraPose(T.END, g).pu < g.L / 2);               // ends back at the landing
});

test('shot candidates: clearance and picking', () => {
  assert.equal(SHOT1.length, 6); assert.equal(HOME.length, 6);
  const p = shotOf(SHOT1[0], 0, 4);
  assert.equal(p.pv, 4 + SHOT1[0][1]);
  const blocker = [{ x: 0, z: 5, r: 0.5 }];
  assert.ok(segmentClearance(0, 0, 0, 10, blocker) < 0.1);
  assert.ok(segmentClearance(3, 0, 3, 10, blocker) > 2);
  assert.equal(segmentClearance(0, 0, 0, 10, [{ x: 0, z: 10.2, r: 0.5 }]), Infinity);   // the thing being looked at is ignored
  assert.equal(pickCandidate([0.1, 2, 3]), 1);
  assert.equal(pickCandidate([-1, 0.2, 0.4]), 2);
});
