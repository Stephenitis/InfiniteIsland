import test from 'node:test';
import assert from 'node:assert/strict';
import { QuestLog } from '../public/js/game/quests.js';

test('old feast saves retain already unlocked hats and persist the remaining shuffled order', () => {
  const entries = new Map();
  const oldStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => entries.get(k) ?? null,
    setItem: (k, v) => entries.set(k, v),
    removeItem: (k) => entries.delete(k),
  };
  try {
    const key = 'test.hats.migration';
    entries.set(key, JSON.stringify({ v: 1, active: null, last: null, feasts: 3, feasting: false }));
    const first = new QuestLog({ storageKey: key });
    assert.deepEqual(first.hatOrder.slice(0, 3), [0, 1, 2]);
    assert.equal(new Set(first.hatOrder).size, 10);
    assert.deepEqual(JSON.parse(entries.get(key)).hatOrder, first.hatOrder);
    const reloaded = new QuestLog({ storageKey: key });
    assert.deepEqual(reloaded.hatOrder, first.hatOrder);
  } finally {
    globalThis.localStorage = oldStorage;
  }
});
