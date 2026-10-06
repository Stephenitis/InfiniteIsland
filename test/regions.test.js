// Step 27b: region manager hysteresis (pure logic) + the prop chunk grouping + bridge stub placement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegions } from '../public/js/world/regions.js';
import { groupIntoChunks } from '../public/js/world/propChunks.js';
import { stubFrame, stubToWorld, STUB_POST_X } from '../public/js/world/bridgeStubs.js';
import { ISLANDS, BRIDGES, REGION_VIEW } from '../public/js/config.js';

function make() {
  const events = [];
  const regions = createRegions({ islands: ISLANDS, ...REGION_VIEW, onMode: (id, full) => events.push([id, full]) });
  return { regions, events };
}

test('forced update: home view -> home full, far islands far; frost landing -> home + frost full', () => {
  const { regions } = make();
  regions.update(0, 0, true);
  assert.deepEqual(regions.summary(), { view: 'home', full: ['home'], far: ['frost', 'ember', 'story'] });
  regions.update(9.5, -88, true);
  assert.equal(regions.view, 'frost');
  assert.deepEqual(regions.summary().full, ['home', 'frost']);
  regions.update(0, -225, true);
  assert.deepEqual(regions.summary(), { view: 'frost', full: ['frost'], far: ['home', 'ember', 'story'] });
});

test('hysteresis: jittering across the enter / exit boundary never flickers', () => {
  const { regions, events } = make();
  regions.update(0, 0, true);
  // frost coast gap = |z + 197| - 110; enter at gap 60 -> z = -27, exit at gap 72 -> z = -15
  regions.update(0, -30, false);
  assert.ok(regions.isFull('frost'));
  const n = events.length;
  for (let i = 0; i < 100; i++) regions.update(0, -30 + (i % 2) * 8, false);   // wobbles between z = -30 and -22 (gap 57..65): inside the band
  assert.equal(events.length, n, 'no transitions while inside the hysteresis band');
  regions.update(0, -10, false);
  assert.ok(!regions.isFull('frost'));
});

test('open sea between islands: the view island stays full and only hands over with a margin', () => {
  const { regions } = make();
  regions.update(100, -100, true);
  assert.equal(regions.summary().full.length >= 1, true);
  const v = regions.view;
  for (let i = 0; i < 50; i++) regions.update(100 + (i % 2) * 0.5, -100, false);
  assert.equal(regions.view, v);
});

test('groupIntoChunks buckets by origin-aligned 40 u cells', () => {
  const items = [{ x: 1, z: 1 }, { x: 39, z: 39 }, { x: 41, z: 1 }, { x: -1, z: 5 }];
  const g = groupIntoChunks(items, { x: 0, z: 0 }, 40);
  assert.equal(g.size, 3);
  assert.equal(g.get('0,0').length, 2);
  assert.equal(g.get('1,0').length, 1);
  assert.equal(g.get('-1,0').length, 1);
});

test('bridge stubs: posts stand outside the 3 u deck, on both landings', () => {
  for (const b of BRIDGES) {
    for (const end of ['a', 'b']) {
      const f = stubFrame(b, end);
      const l = stubToWorld(f, -STUB_POST_X, 0.5), r = stubToWorld(f, STUB_POST_X, 0.5);
      // lateral distance of a post from the deck centre line
      const dx = b.bx - b.ax, dz = b.bz - b.az, L = Math.hypot(dx, dz);
      for (const p of [l, r]) {
        const lat = Math.abs((p.x - b.ax) * dz - (p.z - b.az) * dx) / L;
        assert.ok(lat >= b.width / 2 + 0.6, `${b.id}/${end} post lateral ${lat}`);
      }
      assert.ok(Math.hypot(l.x - r.x, l.z - r.z) > 4);
    }
  }
});
