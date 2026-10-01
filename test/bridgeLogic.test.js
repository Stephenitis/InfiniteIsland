import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGES, costOf, thresholds, stageOf, stageProgress, remaining, clampGift, validateGift, applyGift, freshEntry, normaliseEntry, hashView,
} from '../public/js/game/bridgeLogic.js';
import { BRIDGES } from '../public/js/config.js';

test('stage thresholds are ceil(cost * k / 4)', () => {
  assert.deepEqual(thresholds(30), [8, 15, 23, 30]);
  assert.deepEqual(thresholds(20), [5, 10, 15, 20]);
  assert.deepEqual(thresholds(1), [1, 1, 1, 1]);
  assert.equal(STAGES, 4);
});

test('costOf reads the single material of a BRIDGES entry', () => {
  const frost = BRIDGES.find((b) => b.id === 'frost'), ember = BRIDGES.find((b) => b.id === 'ember');
  assert.deepEqual(costOf(frost), { item: 'stone', total: 30 });
  assert.deepEqual(costOf(ember), { item: 'log', total: 20 });
  assert.deepEqual(costOf({}), { item: null, total: 0 });
});

test('stageOf counts the thresholds reached', () => {
  const at = (g) => stageOf(g, 30);
  assert.deepEqual([0, 7, 8, 14, 15, 22, 23, 29, 30, 99].map(at), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  assert.equal(stageOf(-3, 30), 0);
  assert.equal(stageOf(5, 0), 0);
});

test('stageProgress describes the stage being worked on', () => {
  assert.deepEqual(stageProgress(0, 30), { stage: 0, built: false, prev: 0, next: 8, into: 0, span: 8, given: 0, total: 30 });
  const p = stageProgress(17, 30);
  assert.equal(p.stage, 2); assert.equal(p.next, 23); assert.equal(p.into, 2); assert.equal(p.span, 8);
  const done = stageProgress(30, 30);
  assert.equal(done.built, true); assert.equal(done.next, null);
});

test('gifts are clamped to the bag and to what is still needed', () => {
  assert.equal(remaining(25, 30), 5);
  assert.equal(clampGift(10, 50, 5), 5);
  assert.equal(clampGift(10, 3, 30), 3);
  assert.equal(clampGift(4, 50, 30), 4);
  assert.equal(clampGift(0, 50, 30), 0);
  assert.equal(clampGift(-2, 50, 30), 0);
  assert.equal(clampGift(2.9, 50, 30), 2);
  assert.equal(clampGift('x', 50, 30), 0);
});

test('validateGift: the feast gate, the bag, a finished bridge', () => {
  const e = { given: 10, stage: 1, built: false };
  assert.deepEqual(validateGift({ feasts: 0, entry: e, total: 30, have: 9, n: 5 }), { ok: false, reason: 'locked' });
  assert.deepEqual(validateGift({ feasts: 1, entry: e, total: 30, have: 9, n: 5 }), { ok: true, n: 5 });
  assert.deepEqual(validateGift({ feasts: 2, entry: e, total: 30, have: 3, n: 5 }), { ok: true, n: 3 });
  assert.deepEqual(validateGift({ feasts: 1, entry: e, total: 30, have: 99, n: 99 }), { ok: true, n: 20 });
  assert.deepEqual(validateGift({ feasts: 1, entry: e, total: 30, have: 0, n: 5 }), { ok: false, reason: 'none' });
  assert.deepEqual(validateGift({ feasts: 1, entry: e, total: 30, have: 5, n: 0 }), { ok: false, reason: 'bad-request' });
  assert.deepEqual(validateGift({ feasts: 1, entry: e, total: 30, have: 5, n: NaN }), { ok: false, reason: 'bad-request' });
  assert.deepEqual(validateGift({ feasts: 1, entry: null, total: 30, have: 5, n: 1 }), { ok: false, reason: 'bad-request' });
  assert.deepEqual(validateGift({ feasts: 1, entry: { given: 30, stage: 4, built: true }, total: 30, have: 5, n: 1 }), { ok: false, reason: 'built' });
});

test('two racing gifts never overspend (the host serialises them)', () => {
  let entry = { given: 25, stage: 3, built: false }, bag = 8;
  for (const want of [4, 4]) {          // two screens each give 4 of the 5 still needed
    const v = validateGift({ feasts: 1, entry, total: 30, have: bag, n: want });
    if (!v.ok) continue;
    bag -= v.n;
    entry = applyGift(entry, 30, v.n);
  }
  assert.equal(entry.given, 30); assert.equal(entry.built, true); assert.equal(entry.stage, 4);
  assert.equal(bag, 3);                 // 4 + 1 taken
});

test('applyGift advances the stage and finishes at the full cost', () => {
  let e = freshEntry();
  e = applyGift(e, 20, 5); assert.deepEqual(e, { given: 5, stage: 1, built: false });
  e = applyGift(e, 20, 4); assert.deepEqual(e, { given: 9, stage: 1, built: false });
  e = applyGift(e, 20, 6); assert.deepEqual(e, { given: 15, stage: 3, built: false });
  e = applyGift(e, 20, 99); assert.deepEqual(e, { given: 20, stage: 4, built: true });
});

test('normaliseEntry never trusts a save', () => {
  assert.deepEqual(normaliseEntry(null, 30), freshEntry());
  assert.deepEqual(normaliseEntry({ given: 'x' }, 30), freshEntry());
  assert.deepEqual(normaliseEntry({ given: 999 }, 30), { given: 30, stage: 4, built: true });
  assert.deepEqual(normaliseEntry({ given: 16, stage: 4 }, 30), { given: 16, stage: 2, built: false });
  assert.deepEqual(normaliseEntry({ given: 0, built: true }, 20), { given: 20, stage: 4, built: true });
  assert.deepEqual(normaliseEntry({ given: -5 }, 30), freshEntry());
});

test('hashView is stable and key-order independent', () => {
  const a = hashView({ ember: { given: 5, stage: 1, built: false }, frost: { given: 0, stage: 0, built: false } });
  const b = hashView({ frost: { given: 0, stage: 0, built: false, junk: 1 }, ember: { given: 5, stage: 1, built: false } });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});
