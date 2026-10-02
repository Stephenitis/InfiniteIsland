// Tail unlock rules (Step 36b): the rule table, several tails at once, independent levels, no duplicates, pose id, saved-choice fallback.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  speciesCounts, qualifyingTails, newUnlocks, mergeUnlocked, normaliseUnlocked, clampTail, nextTail, encodeTailId, decodeTailId, parseTailPrefs,
  tailIndexOf, TAIL_COUNT,
} from '../public/js/game/tailLogic.js';

const counts = (fox = 0, squirrel = 0, rabbit = 0, grouse = 0) => ({ fox, squirrel, rabbit, grouse });

test('rule table per species: c and comfort k', () => {
  const T = (c, k) => qualifyingTails({ counts: counts(c), comfort: k });
  for (let k = 0; k <= 3; k++) assert.deepEqual(T(0, k), [], `no fox at k=${k}`);
  for (let k = 0; k <= 3; k++) assert.deepEqual(T(1, k), [0], `one fox at k=${k}: level 1 only`);
  assert.deepEqual(T(2, 0), [0]);
  assert.deepEqual(T(2, 1), [0, 1]);
  assert.deepEqual(T(2, 2), [0, 1]);
  assert.deepEqual(T(2, 3), [0, 1, 2]);
});

test('examples from the plan', () => {
  assert.deepEqual(qualifyingTails({ counts: counts(1, 1, 1, 1), comfort: 1 }), [0, 3, 6, 9]);
  assert.equal(qualifyingTails({ counts: counts(2, 2, 2, 2), comfort: 1 }).length, 8);
  assert.deepEqual(qualifyingTails({ counts: counts(2, 2, 2, 2), comfort: 3 }), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

test('levels are independent: a level 3 qualifier also brings the locked lower levels (jump)', () => {
  const q = qualifyingTails({ counts: counts(2), comfort: 3 });
  assert.deepEqual(newUnlocks([], q), [0, 1, 2]);
  assert.deepEqual(newUnlocks([1], q), [0, 2]);             // level 2 was already unlocked
});

test('already-unlocked tails are skipped and nothing duplicates', () => {
  const q = qualifyingTails({ counts: counts(2, 1), comfort: 1 });
  const first = newUnlocks([], q);
  let have = mergeUnlocked([], first);
  assert.deepEqual(newUnlocks(have, q), []);                // a second feast right after: nothing new
  have = mergeUnlocked(have, first);                        // applying the same event twice
  assert.deepEqual(have, [0, 1, 3]);
  assert.deepEqual(mergeUnlocked(have, [1, 0, 5, 5]), [0, 1, 3, 5]);
});

test('garbage inputs are tolerated', () => {
  assert.deepEqual(qualifyingTails({ counts: counts(9), comfort: 9 }), [0, 1, 2]);       // clamped to 2 critters / comfort 3
  assert.deepEqual(qualifyingTails({ counts: counts(-1), comfort: -4 }), []);
  assert.deepEqual(qualifyingTails(), []);
  assert.deepEqual(normaliseUnlocked([3, 3, -1, 12, 'a', 1.5, 0]), [0, 3]);
  assert.deepEqual(normaliseUnlocked(null), []);
});

test('speciesCounts reads only critters living at the camp', () => {
  const list = [{ species: 'fox', at: 'camp' }, { species: 'fox', at: 'wild' }, { species: 'grouse', at: 'camp' }, { species: 'grouse', at: 'camp' }, { species: 'dragon', at: 'camp' }];
  assert.deepEqual(speciesCounts(list), counts(1, 0, 0, 2));
});

test('cycle: none -> unlocked in order -> none; a worn tail that is not unlocked restarts at the first', () => {
  assert.equal(nextTail(-1, []), -1);
  assert.equal(nextTail(-1, [4, 0, 7]), 0);
  assert.equal(nextTail(0, [4, 0, 7]), 4);
  assert.equal(nextTail(4, [4, 0, 7]), 7);
  assert.equal(nextTail(7, [4, 0, 7]), -1);
  assert.equal(nextTail(9, [4, 0, 7]), 0);
});

test('saved choice falls back to none when it is not unlocked', () => {
  assert.equal(clampTail(4, [0, 4]), 4);
  assert.equal(clampTail(5, [0, 4]), -1);
  assert.equal(clampTail(-1, [0, 4]), -1);
  assert.equal(clampTail('4', [0, 4]), -1);
  assert.equal(clampTail(4, []), -1);
});

test('pose tailId: 0 none, 1 + i', () => {
  assert.equal(encodeTailId(-1), 0);
  assert.equal(encodeTailId(0), 1);
  assert.equal(encodeTailId(TAIL_COUNT - 1), TAIL_COUNT);
  assert.equal(encodeTailId(TAIL_COUNT), 0);
  assert.equal(encodeTailId(undefined), 0);
  for (let i = 0; i < TAIL_COUNT; i++) assert.equal(decodeTailId(encodeTailId(i)), i);
  assert.equal(decodeTailId(0), -1);
  assert.equal(decodeTailId(13), -1);
  assert.equal(decodeTailId(undefined), -1);
});

test('prefs parsing and index helper', () => {
  assert.deepEqual(parseTailPrefs('{"0":3,"1":11,"2":12,"9":1,"3":"x"}'), { 0: 3, 1: 11 });
  assert.deepEqual(parseTailPrefs('nope'), {});
  assert.deepEqual(parseTailPrefs(null), {});
  assert.equal(tailIndexOf('rabbit', 2), 7);
  assert.equal(tailIndexOf('rabbit', 4), -1);
  assert.equal(tailIndexOf('cat', 1), -1);
});

test('pose packets: the tail id is the last field and older packets decode as no tail', async () => {
  const { decodePose } = await import('../public/js/net/poseBuffer.js');
  assert.equal(decodePose([1, 0, 0, 0, 0, 0, 0, 0, -1, 7, 3, 5]).tail, 5);
  assert.equal(decodePose([1, 0, 0, 0, 0, 0, 0, 0, -1, 7, 3]).tail, 0);
  assert.equal(decodePose([1, 0, 0, 0, 0, 0, 0, 0, -1, 7, 3, 12]).tail, 12);
});
