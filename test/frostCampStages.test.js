// Step 35b: the Frostpine camp's build stages, pure layout (islands/frostCampStages.js): every piece stands inside the clearing on its reserved spot, clear of the fire, the
// seats, the camp trail, the dens, the critters' sleeping ring and the tail stump, and nothing overlaps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ISLANDS, FIRES, FROST_CAMP, CAMP_MAX_COMFORT } from '../public/js/config.js';
import { getIslandModule } from '../public/js/world/islands/registry.js';
import { campCentre, campReserved, campSigns } from '../public/js/world/islands/frostCamp.js';
import { campStageLayout, WIND_R, SHELTER } from '../public/js/world/islands/frostCampStages.js';
import { getPath, pathDist, pathMarkers } from '../public/js/world/paths.js';

const island = ISLANDS.find((i) => i.id === 'frost');
const mod = getIslandModule('frost');
const c = campCentre(island);
const R = campReserved(island);
const L = campStageLayout(island);
const fire = FIRES.find((f) => f.id === 'frost');
const trail = getPath('frost-camp');
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const all = [1, 2, 3].flatMap((s) => L.footprints[s].map((f) => ({ ...f, stage: s })));

test('three stages, deterministic', () => {
  assert.equal(CAMP_MAX_COMFORT, 3);
  assert.deepEqual(campStageLayout(island), L);
  for (const s of [1, 2, 3]) { assert.ok(L.colliders[s].length > 0); assert.ok(L.footprints[s].length > 0); }
  assert.equal(L.stage1.windbreak.posts.length, 2);
  assert.equal(L.stage1.windbreak.logs.length, 3 + 4 + 3);
  assert.equal(L.stage1.benches.length, 4);
  assert.equal(L.stage2.dens.length, 8);
  assert.equal(L.stage2.posts.length, 4);
  assert.equal(L.stage3.boxes.length, 4);
  assert.equal(L.stage3.pines.length, 8);
  assert.equal(L.stage3.shelter.lanterns.length, 4);
});

test('every footprint is inside the clearing, on walkable ground, clear of the fire', () => {
  for (const f of all) {
    assert.ok(d(f, c) + f.r <= FROST_CAMP.clear + 1e-6, `inside the clearing: ${JSON.stringify(f)}`);
    assert.ok(mod.walkable(f.x, f.z), `walkable: ${JSON.stringify(f)}`);
    if (f.bench) continue;
    assert.ok(d(f, c) - f.r >= 1.9, `clear of the fire ring: ${JSON.stringify(f)}`);
  }
});

test('pieces keep to their reserved spots', () => {
  const inside = (cols, spot, slack = 0) => { for (const k of cols) assert.ok(d(k, spot) + k.r <= spot.r + slack + 1e-6, `${JSON.stringify(k)} within ${JSON.stringify(spot)}`); };
  inside(L.stage1.windbreak.colliders, R.build.windbreak);
  inside(L.stage1.woodpile.colliders, R.build.woodpile);
  inside(L.stage2.trough.colliders, R.build.trough);
  L.stage2.posts.forEach((p, i) => assert.ok(d(p, R.build.lanterns[i]) < 1e-9));
  inside(L.stage3.shelter.colliders, R.build.shelter);
  inside(L.stage3.boxes.map((b) => ({ ...b, r: 0.5 })), R.build.shelter);
  for (const p of L.stage1.windbreak.posts) assert.ok(d(p, R.build.windbreak) <= R.build.windbreak.r);
  for (const g of L.stage3.shelter.lanterns) assert.ok(d(g, R.build.shelter) <= R.build.shelter.r);
  assert.ok(SHELTER.hw < SHELTER.ridge && Math.hypot(SHELTER.hw, SHELTER.hl) + 0.27 <= R.build.shelter.r);
  assert.equal(L.stage1.windbreak.radius, WIND_R);
});

test('nothing overlaps: pieces, seats, dens, the tail stump, the signposts, the trail posts', () => {
  const fixed = [...campSigns(island).filter((s) => d(s, c) < 20).map((s) => ({ x: s.x, z: s.z, r: 0.42 })), ...pathMarkers(island, trail).filter((m) => d(m, c) < 20).map((m) => ({ x: m.x, z: m.z, r: 0.22 }))];
  assert.ok(fixed.length >= 1, 'the camp sign at least');
  for (const f of all.filter((q) => !q.bench)) for (const k of fixed) assert.ok(d(f, k) >= f.r + k.r + 0.3, `${JSON.stringify(f)} too close to a sign / trail post ${JSON.stringify(k)}`);
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    if (a.bench && b.bench) continue;
    // (a stage's own colliders and its decorative footprints may share a spot, e.g. a post and its collider)
    if (a.stage === b.stage && (d(a, b) < 0.25)) continue;
    assert.ok(d(a, b) >= a.r + b.r - 0.3 || (a.stage === b.stage && a.r < 0.3 && b.r < 0.3), `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  }
  for (const f of all.filter((q) => !L.stage2.dens.some((x) => x.x === q.x && x.z === q.z))) {
    for (const den of R.dens) assert.ok(d(f, den) >= f.r + den.r - 0.05, `a piece sits on a den: ${JSON.stringify(f)}`);
    assert.ok(d(f, R.tailStump) >= f.r + R.tailStump.r, `the tail stump spot stays free: ${JSON.stringify(f)}`);
  }
  // the stump / log bench seats stay open: every seat has 0.9 u of room outside the bench footprint (the benches themselves are listed in stage1)
  for (const f of all.filter((q) => !q.bench)) for (const b of L.stage1.benches) assert.ok(d(f, b) >= f.r + 0.45, `room round a bench: ${JSON.stringify(f)}`);
});

test('the camp trail and its entrance stay open', () => {
  for (const f of all.filter((q) => !q.bench)) {
    assert.ok(pathDist(island, trail, f.x, f.z) >= trail.width / 2 + f.r + 0.4, `trail clear: ${JSON.stringify(f)} ${pathDist(island, trail, f.x, f.z).toFixed(2)}`);
  }
  // the last 12 u of trail and the way from its end to the fire: a 1.6 u wide corridor free of every solid
  const end = trail.samples[trail.samples.length - 1];
  const ep = { x: island.x + end[0], z: island.z + end[1] };
  for (let t = 0; t <= 1; t += 0.05) {
    const p = { x: ep.x + (c.x - ep.x) * t, z: ep.z + (c.z - ep.z) * t };
    if (d(p, c) < 2.4) continue;                                  // (the benches ring)
    for (const k of L.colliders[1].concat(L.colliders[2], L.colliders[3])) assert.ok(d(p, k) >= k.r + 0.8, `a walking line from the trail end to the fire is clear at t=${t.toFixed(2)}`);
  }
});

test('the critters keep their sleeping ring and wander room', () => {
  const sleep = (den) => { const a = Math.atan2(den.z - c.z, den.x - c.x); return { x: c.x + Math.cos(a) * 4.1, z: c.z + Math.sin(a) * 4.1 }; };
  for (const den of R.dens) for (const k of [...L.colliders[1], ...L.colliders[2], ...L.colliders[3]]) assert.ok(d(sleep(den), k) >= k.r + 0.35, `a sleeping critter has room: ${JSON.stringify(k)}`);
  for (const den of R.dens) for (const k of [...L.colliders[1], ...L.colliders[2], ...L.colliders[3]]) assert.ok(d(den, k) >= k.r + den.r - 0.05, 'a den is never blocked');
});

test('the windbreak is a curved wall on the north (back) side; the shelter is a clear A-frame', () => {
  for (const l of L.stage1.windbreak.logs) { assert.ok(l.z < c.z - 4.4, 'north of the fire'); assert.ok(Math.abs(d(l, c) - WIND_R) < 0.15, 'on the arc'); assert.ok(l.len > 0.5 && l.len < 1.4); }
  assert.deepEqual([0, 1, 2], [...new Set(L.stage1.windbreak.logs.map((l) => l.col))].sort());
  assert.ok(L.stage3.shelter.ridge > L.stage3.shelter.eave);
  assert.equal(fire.bench.angles.length, L.stage1.benches.length);
});
