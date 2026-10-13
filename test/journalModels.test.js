import test from 'node:test';
import assert from 'node:assert/strict';
import { createJournalModel, JOURNAL_MODEL_IDS } from '../public/js/player/journalModels.js';
import { COLLECTIBLES } from '../public/js/game/collection.js';

test('journal models: every collectible has one, and only collectibles do', () => {
  assert.deepEqual([...JOURNAL_MODEL_IDS].sort(), COLLECTIBLES.map((d) => d.id).sort());
  assert.equal(createJournalModel('not-a-find'), null);
});

test('journal models: one finite, centred, about 0.6 u mesh each', () => {
  for (const id of JOURNAL_MODEL_IDS) {
    const g = createJournalModel(id);
    assert.equal(g.children.length, 1, id);
    const geo = g.children[0].geometry;
    for (const v of geo.attributes.position.array) assert.ok(Number.isFinite(v), id);
    const { center, radius } = geo.boundingSphere;
    assert.ok(radius > 0.25 && radius < 0.5, `${id} radius ${radius}`);
    assert.ok(center.length() < 0.15, `${id} off-centre ${center.length()}`);
    g.userData.dispose();
  }
});
