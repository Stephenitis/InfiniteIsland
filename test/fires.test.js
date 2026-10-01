// Step 33a: the campfire became instances (config FIRES). The pure parts: the fire list, derived islands, names / keys, the old save, the feast's fireId.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIRES, CAMPFIRE, CAMPFIRE_ISLANDS, FUEL_PER_LOG, FIRE_MAX_LEVEL, nearAnyFire } from '../public/js/config.js';
import { domainOf, menuIdOf, saveKeyOf, levelOf, fuelFromSave, fireIslands, feastFireId, nearestFire, HOME_FIRE } from '../public/js/game/fireLogic.js';

const MAX = FUEL_PER_LOG * FIRE_MAX_LEVEL;

test('FIRES: home exists, CAMPFIRE is its alias, CAMPFIRE_ISLANDS is derived from the list', () => {
  assert.equal(FIRES[0].id, HOME_FIRE);
  assert.equal(CAMPFIRE, FIRES[0]);
  assert.deepEqual(CAMPFIRE_ISLANDS, fireIslands(FIRES));
  assert.deepEqual(fireIslands([{ island: 'home' }, { island: 'frost' }, { island: 'home' }]), ['home', 'frost']);
  assert.deepEqual([CAMPFIRE.x, CAMPFIRE.z, CAMPFIRE.clear, CAMPFIRE.island], [7, 9.5, 4.5, 'home']);
  assert.equal(new Set(FIRES.map((f) => f.id)).size, FIRES.length);
  for (const f of FIRES) { assert.ok(f.bench.angles.length >= 1); assert.ok(f.feast.camDist > 0); assert.ok(f.light.base > 0); }
});

test('home keeps its old domain, menu id and save key; other fires get their own', () => {
  assert.equal(domainOf('home'), 'campfire');
  assert.equal(menuIdOf('home'), 'campfire');
  assert.equal(saveKeyOf('home'), 'infinite-island.campfire.v1');
  assert.equal(domainOf('frost'), 'campfire:frost');
  assert.equal(menuIdOf('frost'), 'campfire:frost');
  assert.equal(saveKeyOf('frost'), 'infinite-island.campfire.frost.v1');
});

test('an old stored home save loads unchanged: the fuel burns down by the real time since it was written', () => {
  const now = 1_700_000_000_000;
  assert.equal(fuelFromSave({ v: 1, fuel: 300, at: now - 100_000 }, now, MAX), 200);   // 100 s passed
  assert.equal(fuelFromSave({ v: 1, fuel: 300, at: now }, now, MAX), 300);
  assert.equal(fuelFromSave({ v: 1, fuel: 50, at: now - 3_600_000 }, now, MAX), 0);    // burnt out while away
  assert.equal(fuelFromSave({ v: 1, fuel: 9999, at: now }, now, MAX), MAX);            // clamped
  assert.equal(fuelFromSave({ fuel: 100, at: now + 5000 }, now, MAX), 100);            // a clock set back never adds fuel
  assert.equal(fuelFromSave(null, now, MAX), 0);
  assert.equal(fuelFromSave({ fuel: 'x', at: now }, now, MAX), 0);
});

test('fire level: min(3, ceil(fuel / 180)), 0 when out', () => {
  assert.equal(levelOf(0, FUEL_PER_LOG, FIRE_MAX_LEVEL), 0);
  assert.equal(levelOf(0.5, FUEL_PER_LOG, FIRE_MAX_LEVEL), 1);
  assert.equal(levelOf(180, FUEL_PER_LOG, FIRE_MAX_LEVEL), 1);
  assert.equal(levelOf(181, FUEL_PER_LOG, FIRE_MAX_LEVEL), 2);
  assert.equal(levelOf(MAX, FUEL_PER_LOG, FIRE_MAX_LEVEL), 3);
});

test('a feast event / snapshot / request without a fireId means home', () => {
  assert.equal(feastFireId(undefined), 'home');
  assert.equal(feastFireId(null), 'home');
  assert.equal(feastFireId({ template: 'cookout', n: 1, startAt: 5 }), 'home');
  assert.equal(feastFireId({ fireId: 'frost' }), 'frost');
  assert.equal(feastFireId({ fireId: 3 }), 'home');
});

test('keep-clear zones come from every fire; nearest fire', () => {
  assert.equal(nearAnyFire(7, 9.5), true);
  assert.equal(nearAnyFire(7 + 4.4, 9.5), true);
  assert.equal(nearAnyFire(7 + 4.6, 9.5), false);
  assert.equal(nearAnyFire(7 + 4.6, 9.5, 0.5), true);     // props pad it by half their radius
  assert.equal(nearestFire(FIRES, 0, 0).id, 'home');
  assert.equal(nearestFire([{ id: 'a', x: 0, z: 0 }, { id: 'b', x: 10, z: 0 }], 8, 0).id, 'b');
  assert.equal(nearestFire([], 0, 0), null);
});
