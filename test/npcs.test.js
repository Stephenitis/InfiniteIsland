import test from 'node:test';
import assert from 'node:assert/strict';
import { npcsPresent, pickFaceTarget, wrapAngle, turnToward, npcCostLine } from '../public/js/game/npcLogic.js';
import { getToolAction } from '../public/js/items/tools.js';
import { getItem } from '../public/js/game/catalog.js';
import { BRIDGES, NPCS } from '../public/js/config.js';

test('some builder is present after the first feast', () => {
  assert.equal(npcsPresent(0), false);
  assert.equal(npcsPresent(1), true);
  assert.equal(npcsPresent(7), true);
  assert.equal(npcsPresent(undefined), false);
  assert.equal(npcsPresent('x'), false);
  assert.equal(npcsPresent(0, { forced: true }), true);
});

test('Cobble arrives after one feast, Bramble after two, old Bramble progress survives', () => {
  assert.equal(npcsPresent(0, { id: 'cobble' }), false);
  assert.equal(npcsPresent(1, { id: 'cobble' }), true);
  assert.equal(npcsPresent(1, { id: 'bramble' }), false);
  assert.equal(npcsPresent(2, { id: 'bramble' }), true);
  assert.equal(npcsPresent(1, { id: 'bramble', legacyBramble: true }), true);
});

test('pickFaceTarget picks the nearest player inside the radius', () => {
  const npc = { x: 0, z: 0 };
  assert.equal(pickFaceTarget(npc, [], 6), null);
  assert.equal(pickFaceTarget(npc, [{ x: 7, z: 0 }], 6), null);
  const a = { x: 5, z: 0 }, b = { x: 0, z: -2 }, c = { x: 3, z: 3 };
  assert.equal(pickFaceTarget(npc, [a, b, c], 6), b);
  assert.equal(pickFaceTarget(npc, [{ x: 6, z: 0 }], 6).x, 6);      // exactly on the edge counts
});

test('turning takes the short way round and converges', () => {
  assert.ok(Math.abs(wrapAngle(Math.PI * 3) - Math.PI) < 1e-9);
  assert.ok(Math.abs(wrapAngle(-Math.PI * 0.5) + Math.PI * 0.5) < 1e-9);
  let yaw = 3.0;                                    // target -3.0 is 0.28 rad away through +-PI, not 6 rad
  const next = turnToward(yaw, -3.0, 1 / 60, 7);
  assert.ok(next > yaw, 'turns upward through PI');
  for (let i = 0; i < 300; i++) yaw = turnToward(yaw, -3.0, 1 / 60, 7);
  assert.ok(Math.abs(wrapAngle(yaw + 3.0)) < 1e-3);
});

test('npc cost lines and the npc interactable never get a tool action', () => {
  assert.equal(npcCostLine({ stone: 30 }), '30 stones');
  assert.equal(npcCostLine({ log: 20 }), '20 logs');
  assert.equal(npcCostLine({ log: 1 }), '1 log');
  for (const kind of ['axe', 'hammer', 'shovel', 'sword', 'lightsaber']) {
    assert.equal(getToolAction({ state: 'held', kind }, { type: 'npc' }), null);
  }
});

test('stone is a catalog item and every NPC maps to a bridge', () => {
  assert.equal(getItem('stone').name, 'Stone');
  for (const [id, n] of Object.entries(NPCS)) assert.equal(BRIDGES.find((b) => b.id === n.bridge).npc, id);
});
