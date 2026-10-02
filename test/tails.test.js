import test from 'node:test';
import assert from 'node:assert/strict';
import { TAILS, TAIL_SPECIES, tailIndex, tailById } from '../public/js/player/tails.js';
import { TAIL_ICONS } from '../public/js/ui/icons.js';

test('TAILS: 12 entries, species-major, levels 1-3, unique ids', () => {
  assert.equal(TAILS.length, 12);
  assert.deepEqual(TAIL_SPECIES, ['fox', 'squirrel', 'rabbit', 'grouse']);
  TAILS.forEach((t, i) => {
    assert.equal(t.species, TAIL_SPECIES[Math.floor(i / 3)]);
    assert.equal(t.level, (i % 3) + 1);
    assert.equal(t.id, `${t.species}-${t.level}`);
    assert.ok(t.name && typeof t.name === 'string');
    assert.equal(tailIndex(t.species, t.level), i);
    assert.equal(tailById(t.id), i);
    assert.ok(TAIL_ICONS[t.id].startsWith('<svg'));
  });
  assert.equal(new Set(TAILS.map((t) => t.id)).size, 12);
  assert.equal(new Set(TAILS.map((t) => t.name)).size, 12);
  assert.equal(tailIndex('fox', 4), -1);
  assert.equal(tailIndex('cat', 1), -1);
  assert.equal(tailById('nope'), -1);
});

test('every tail builds one merged mesh with dispose/update, sharing one material and casting no shadow', () => {
  const mats = new Set();
  for (const t of TAILS) {
    const g = t.build();
    const meshes = [];
    g.traverse((o) => { if (o.isMesh) meshes.push(o); });
    assert.equal(meshes.length, 1, t.id);
    assert.equal(meshes[0].castShadow, false);
    assert.ok(meshes[0].geometry.attributes.aMark && meshes[0].geometry.attributes.color);
    mats.add(meshes[0].material);
    assert.equal(typeof g.userData.dispose, 'function');
    g.userData.update(0.016, 1.5, 0.5);
    assert.ok(Number.isFinite(g.rotation.y));
    g.userData.dispose();
  }
  assert.equal(mats.size, 1);
});
