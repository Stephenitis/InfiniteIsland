import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegroupState, updateRegroup, isOffscreen } from '../public/js/players/regroupLogic.js';

const E = (key, x, off, more = {}) => ({ key, x, z: 0, off, eligible: true, anchor: true, widen: 0, ...more });
const run = (st, entries, seconds, step = 0.1) => {
  let last = null;
  for (let t = 0; t < seconds - 1e-9; t += step) { last = updateRegroup(st, entries, step, { delay: 5, dropAfter: 0.5 }); if (last.pops.length) return last; }
  return last;
};

test('solo or everybody on screen: nothing happens', () => {
  const st = createRegroupState();
  assert.equal(run(st, [E(0, 0, true)], 10).pops.length, 0);
  const r = run(st, [E(0, 0, false), E(1, 5, false), E(2, 9, false)], 10);
  assert.equal(r.pops.length, 0); assert.equal(r.lost.size, 0); assert.equal(r.warn.size, 0);
});

test('an off-screen player is dropped from framing after 0.5 s, warned, and pops next to the NEAREST on-screen teammate after 5 s', () => {
  const st = createRegroupState();
  const es = [E(0, 0, false), E(1, 10, false), E(2, 40, true), E(3, 2, false)];
  let r = run(st, es, 0.3);
  assert.equal(r.lost.size, 0); assert.ok(r.warn.has(2));
  r = run(st, es, 1);
  assert.deepEqual([...r.lost], [2]); assert.equal(r.warn.get(2).anchor, 1);
  assert.ok(Math.abs(r.warn.get(2).left - 3.7) < 0.05);
  r = run(st, es, 10);
  assert.deepEqual(r.pops, [{ key: 2, anchor: 1 }]);
  assert.equal(st.timers.has(2), false);
});

test('coming back on screen resets the timer', () => {
  const st = createRegroupState();
  run(st, [E(0, 0, false), E(1, 30, true)], 4);
  run(st, [E(0, 0, false), E(1, 20, false)], 0.1);
  const r = run(st, [E(0, 0, false), E(1, 30, true)], 4.5);
  assert.equal(r.pops.length, 0);
});

test('ineligible players (frozen, away, cutscene) never pop and their timer resets; frozen players still anchor', () => {
  const st = createRegroupState();
  assert.equal(run(st, [E(0, 0, false), E(1, 30, true, { eligible: false })], 10).pops.length, 0);
  const r = run(st, [E(0, 0, false, { eligible: false }), E(1, 30, true)], 10);
  assert.deepEqual(r.pops, [{ key: 1, anchor: 0 }]);
  assert.equal(run(createRegroupState(), [E(0, 0, false, { anchor: false }), E(1, 30, true)], 10).pops.length, 0);   // (away teammates are no target)
});

test('nobody on screen (two players walked apart): the one who walked away is the one who pops', () => {
  const st = createRegroupState();
  let r = run(st, [E(0, 0, true, { widen: 0.2 }), E(1, 40, true, { widen: 3 })], 10);
  assert.deepEqual(r.pops, [{ key: 1, anchor: 0 }]);
  r = run(createRegroupState(), [E(0, 0, true, { widen: 5 }), E(1, 40, true, { widen: 1 })], 10);
  assert.deepEqual(r.pops, [{ key: 0, anchor: 1 }]);
  r = run(createRegroupState(), [E(0, 0, true), E(1, 40, true), E(2, 41, true)], 10);       // (ties: the lowest slot stays)
  assert.deepEqual(r.pops.map((p) => p.key).sort(), [1, 2]);
  assert.ok(r.pops.every((p) => p.anchor === 0));
});

test('players that left are forgotten', () => {
  const st = createRegroupState();
  run(st, [E(0, 0, false), E(1, 30, true)], 2);
  updateRegroup(st, [E(0, 0, false)], 0.1);
  assert.equal(st.timers.size, 0);
});

test('isOffscreen: NDC with a small slack', () => {
  assert.equal(isOffscreen({ x: 0.5, y: -0.9, z: 0.5 }), false);
  assert.equal(isOffscreen({ x: 1.02, y: 0, z: 0.5 }), false);
  assert.equal(isOffscreen({ x: 1.1, y: 0, z: 0.5 }), true);
  assert.equal(isOffscreen({ x: 0, y: -1.2, z: 0.5 }), true);
  assert.equal(isOffscreen({ x: 0, y: 0, z: 1.2 }), true);
});
