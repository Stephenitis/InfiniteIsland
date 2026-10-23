// Step 82a: pure organic placement contracts, independent of the renderer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scatter, distanceToShape, insideShape } from '../public/js/world/party/scatter.js';

const rect = { type: 'rect', x0: -30, x1: 30, z0: -30, z1: 30 };
const disc = { type: 'circle', x: 0, z: 0, r: 8 };
const polygon = { type: 'polygon', points: [{ x: -20, z: -20 }, { x: 22, z: -20 }, { x: 15, z: 23 }, { x: -18, z: 15 }] };
const sector = { type: 'sector', x: 0, z: 0, r0: 10, r1: 25, start: -2.8, end: 0.7 };

test('scatter is seed deterministic and never uses Math.random', () => {
  const options = { seed: 42, shape: rect, keepOut: [disc], count: 100 };
  const old = Math.random; Math.random = () => { throw new Error('unseeded'); };
  try { assert.deepEqual(scatter(options), scatter(options)); } finally { Math.random = old; }
  assert.notDeepEqual(scatter(options), scatter({ ...options, seed: 43 }));
});

test('rectangles, concave polygons and wrapping annulus sectors honour footprints and every keep-out', () => {
  const notch = { type: 'polygon', points: [{ x: -4, z: -4 }, { x: 4, z: -4 }, { x: 4, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 4 }, { x: -4, z: 4 }] };
  const excluded = [disc, { type: 'rect', x0: 10, x1: 14, z0: -30, z1: 10 }, notch];
  for (const shape of [rect, polygon, sector, { ...sector, start: 2.7, end: 4.2 }]) {
    const ps = scatter({ seed: 8, shape, keepOut: excluded, radius: 0.4, clearance: 0.8, count: 70, minDistance: 1.2 });
    assert.ok(ps.length >= 40);
    for (const p of ps) {
      assert.ok(insideShape(shape, p.x, p.z, p.scale * 0.4));
      for (const s of excluded) assert.ok(distanceToShape(s, p.x, p.z) >= p.scale * 0.4 + 0.8);
      for (const q of ps) if (p !== q) assert.ok(Math.hypot(p.x - q.x, p.z - q.z) >= 1.2);
    }
  }
  assert.ok(insideShape(notch, -2, 2)); assert.ok(!insideShape(notch, 2, 2));
  assert.ok(insideShape({ ...sector, start: 0, end: Math.PI * 2 }, 15, 0));
});

test('clusters have parent IDs, 1..4 smaller companions, random yaw and lean, and bounded spread', () => {
  const ps = scatter({ seed: 22, shape: rect, count: 160, minDistance: 0.6, clusterRadius: 2, size: [0.7, 1.5] });
  const children = ps.filter(p => p.parent !== null);
  assert.ok(children.length > ps.length * 0.45);
  const groups = new Map();
  for (const p of children) {
    const parent = ps[p.parent]; assert.equal(parent.parent, null); assert.ok(p.scale < parent.scale);
    assert.ok(Math.hypot(p.x - parent.x, p.z - parent.z) <= 2.6 + 1e-9);
    groups.set(parent.id, (groups.get(parent.id) || 0) + 1);
  }
  assert.ok([...groups.values()].every(n => n <= 4));
  assert.ok(new Set(ps.map(p => p.yaw)).size > 150); assert.ok(ps.some(p => p.lean < 0) && ps.some(p => p.lean > 0));
});

test('distance density thins near play areas and layer tags cover foreground, mid and back', () => {
  const opts = { seed: 16, shape: rect, keepOut: [disc], minDistance: 0.7, count: 10000, attempts: 15000, cluster: false };
  const flat = scatter(opts), thin = scatter({ ...opts, density: d => d < 5 ? 0.05 : 1 });
  const near = ps => ps.filter(p => p.distance < 5).length;
  assert.ok(near(thin) < near(flat) * 0.25);
  assert.deepEqual(new Set(thin.map(p => p.layer)), new Set(['foreground', 'mid', 'back']));
  for (const p of thin) assert.ok(Math.abs(p.distance - (Math.hypot(p.x, p.z) - 8)) < 1e-8);
});

test('finite attempt budget handles impossible layouts; custom safety and layer callbacks are honoured', () => {
  assert.deepEqual(scatter({ shape: rect, keepOut: [rect], count: 50 }), []);
  const ps = scatter({ shape: rect, count: 30, accept: p => p.x < -10, layer: () => 'back' });
  assert.ok(ps.length === 30 && ps.every(p => p.x < -10 && p.layer === 'back'));
  assert.throws(() => scatter({ shape: rect, minDistance: 0 }));
});
