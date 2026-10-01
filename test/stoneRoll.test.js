import test from 'node:test';
import assert from 'node:assert/strict';
import { rollStone } from '../public/js/world/lootTable.js';

test('rock stone rewards depend on the tool used for the final hit', () => {
  for (const kind of ['axe', 'sword', 'lightsaber']) {
    assert.equal(rollStone(kind, () => 0), 2);
    assert.equal(rollStone(kind, () => 0.749), 2);
    assert.equal(rollStone(kind, () => 0.75), 1);
  }
  assert.equal(rollStone('hammer', () => 0), 2);
  assert.equal(rollStone('hammer', () => 0.999), 3);
});
