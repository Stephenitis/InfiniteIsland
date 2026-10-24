import test from 'node:test';
import assert from 'node:assert/strict';
import { selectTests } from '../scripts/test-batches.mjs';
test('every test belongs to exactly one batch, with no missing files', () => {
  const { groups, files } = selectTests();
  assert.equal(Object.values(groups).flatMap(g => g.files).length, files.length);
  assert.ok(files.includes('test/testBatches.test.js'));
});
test('selected batches combine without duplicates and unknown names fail', () => {
  const { files, groups } = selectTests(['editor','camera','editor']);
  assert.equal(files.length, groups.editor.files.length + groups.camera.files.length);
  assert.ok(!files.includes('test/partyBonk.test.js'));
  assert.throws(() => selectTests(['edtor']), /Unknown batch/);
  assert.deepEqual(selectTests(['all']).files, selectTests().files);
});
