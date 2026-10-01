import test from 'node:test';
import assert from 'node:assert/strict';
import { unlockedCount, nextHat, clampHat, encodeHatId, decodeHatId, parseHatPrefs, makeHatOrder, normaliseHatOrder, MAX_HATS } from '../public/js/game/hatLogic.js';
import { getToolAction } from '../public/js/items/tools.js';
import { decodePose } from '../public/js/net/poseBuffer.js';

test('unlockedCount follows the feast count and caps at 10', () => {
  assert.equal(unlockedCount(0), 0);
  assert.equal(unlockedCount(3), 3);
  assert.equal(unlockedCount(3.9), 3);
  assert.equal(unlockedCount(10), 10);
  assert.equal(unlockedCount(69), 10);
  assert.equal(unlockedCount(-4), 0);
  assert.equal(unlockedCount('x'), 0);
  assert.equal(unlockedCount(undefined), 0);
});

test('nextHat cycles beanie -> hats -> beanie', () => {
  assert.equal(nextHat(-1, 0), -1);                 // nothing unlocked: always the beanie
  assert.equal(nextHat(-1, 1), 0);
  assert.equal(nextHat(0, 1), -1);                  // wraps after the last unlocked hat
  const seen = [];
  let h = -1;
  for (let i = 0; i < 5; i++) { h = nextHat(h, 3); seen.push(h); }
  assert.deepEqual(seen, [0, 1, 2, -1, 0]);
  assert.equal(nextHat(9, 10), -1);
  assert.equal(nextHat(-1, 99), 0);                 // the count is capped at MAX_HATS
  assert.equal(nextHat(7, 3), -1);                  // a stale index beyond the unlocked hats falls back
  assert.equal(nextHat(undefined, 2), 0);
});

test('clampHat keeps only unlocked indices', () => {
  assert.equal(clampHat(2, 3), 2);
  assert.equal(clampHat(3, 3), -1);
  assert.equal(clampHat(0, 0), -1);
  assert.equal(clampHat(-1, 10), -1);
  assert.equal(clampHat('1', 10), -1);
  assert.equal(clampHat(9, 99), 9);
  assert.equal(clampHat(10, 99), -1);
});

test('shuffled hat order is a permutation, and old saves keep already unlocked hats', () => {
  const shuffled = makeHatOrder(0, () => 0);
  assert.equal(new Set(shuffled).size, MAX_HATS);
  assert.notDeepEqual(shuffled, Array.from({ length: MAX_HATS }, (_, i) => i));
  const old = normaliseHatOrder(null, 3, () => 0);
  assert.deepEqual(old.slice(0, 3), [0, 1, 2]);
  assert.deepEqual(normaliseHatOrder(shuffled, 3), shuffled);
  assert.equal(nextHat(-1, 2, shuffled), shuffled[0]);
  assert.equal(nextHat(shuffled[0], 2, shuffled), shuffled[1]);
  assert.equal(nextHat(shuffled[1], 2, shuffled), -1);
  assert.equal(clampHat(shuffled[0], 1, shuffled), shuffled[0]);
  assert.equal(clampHat(shuffled[1], 1, shuffled), -1);
});

test('pose hatId: 0 = beanie, 1 = bare, 2 + i = HATS[i]', () => {
  assert.equal(encodeHatId(-1), 0);
  assert.equal(encodeHatId(0), 2);
  assert.equal(encodeHatId(9), 11);
  assert.equal(encodeHatId(10), 0);
  assert.equal(decodeHatId(0), -1);
  assert.equal(decodeHatId(1), null);               // bare head
  assert.equal(decodeHatId(2), 0);
  assert.equal(decodeHatId(11), 9);
  assert.equal(decodeHatId(12), -1);                // unknown id from a newer client: beanie
  for (let i = -1; i < MAX_HATS; i++) assert.equal(decodeHatId(encodeHatId(i)), i);
  assert.equal(decodePose([1, 0, 0, 0, 0, 0, 0, 0, -1, 7, 3]).hat, 7);
});

test('parseHatPrefs drops garbage', () => {
  assert.deepEqual(parseHatPrefs('{"0":3,"2":9,"7":1,"x":2,"1":12,"3":"a"}'), { 0: 3, 2: 9 });
  assert.deepEqual(parseHatPrefs('nope'), {});
  assert.deepEqual(parseHatPrefs(null), {});
  assert.deepEqual(parseHatPrefs('[1,2]'), {});
});

test('the hat rack is a plain interact even while holding a tool', () => {
  const held = { state: 'held', kind: 'axe' };
  assert.equal(getToolAction(held, { type: 'hatrack' }), null);
  assert.equal(getToolAction(held, { type: 'tree' }), 'chop');
});
