// Step 68d hull pieces: every durable nail closes its own board; floated and sealed restore the rig.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hullPieces } from '../public/js/game/boatHullLogic.js';
test('each of eight nails closes exactly its matching hull board and a completed bay hides its ribs', () => {
  for (let mark = 0; mark < 4; mark++) for (let n = 0; n <= 2; n++) {
    const nails = [0, 0, 0, 0]; nails[mark] = n;
    const p = hullPieces({ nails });
    assert.equal(p.boards.filter(Boolean).length, n);
    assert.equal(p.boards[mark * 2], n >= 1);
    assert.equal(p.boards[mark * 2 + 1], n >= 2);
    assert.equal(p.ribs[mark], n < 2);
    assert.equal(p.mast, false);
  }
});
test('sealed whole outrigger stands upright; successful float replaces the stump with mast and sail', () => {
  const s = { nails: [2, 2, 2, 2], seams: [true, false, true], floated: false };
  assert.deepEqual(hullPieces(s).tar, [true, false, true]);
  assert.ok(hullPieces(s).upright);
  assert.deepEqual(hullPieces(s).ribs, [false, false, false, false]);
  assert.equal(hullPieces(s).mast, false);
  s.floated = true; assert.equal(hullPieces(s).mast, false);
  s.seams[1] = true; assert.ok(hullPieces(s).mast);
  s.nails[3] = 1; assert.equal(hullPieces(s).mast, false);
});
test('legacy counts and malformed cosmetic previews are bounded without changing caller state', () => {
  assert.equal(hullPieces().boards.filter(Boolean).length, 0);
  for (let n = 0; n <= 8; n++) assert.equal(hullPieces({ planks: n }).boards.filter(Boolean).length, n);
  const s = { nails: [NaN, -4, 5, 1.9], seams: [true, 1, false] };
  assert.deepEqual(hullPieces(s).boards, [false, false, false, false, true, true, true, false]);
  assert.deepEqual(s.nails, [NaN, -4, 5, 1.9]);
});

test('runtime hull rebuilds only changed progress, animates live nails, and retains the voyage pose over float updates', async () => {
  const THREE = await import('three');
  const { createCove } = await import('../public/js/world/cove.js');
  const state = { unlocked: true, parts: {}, nails: [0,0,0,0], planks: 0, seams: [false,false,false], floated: false, launched: false };
  let listener; const sounds = [];
  const boat = { state, unlocked: true, setGoals(){}, has(){ return false; }, on(fn){ listener = fn; } };
  const cove = createCove({ scene: new THREE.Scene(), players: { list: [] }, boat, hop: { add(){}, remove(){} }, sfx: { play(name){ sounds.push(name); } } });
  cove.update(0.016);
  const initial = cove.hull.geometry;
  cove.update(0.016); assert.equal(cove.hull.geometry, initial);
  state.nails[0] = 1; state.planks = 1; listener({ kind: 'nail', live: true, plank: 0 });
  assert.notEqual(cove.hull.geometry, initial); assert.deepEqual(sounds, ['thud']);
  cove.update(0.1); assert.ok(cove.hull.scale.x > 1);
  listener({ kind: 'set', live: false }); assert.deepEqual(sounds, ['thud']);
  const pose = { x: 100, z: 200, yaw: 1.2, sail: 1 };
  cove.setVoyagePose(pose); cove.update(0.1); cove.setFloatPose(80);
  assert.deepEqual(cove.hull.position.toArray(), [100,-0.5,200]);
  assert.ok(Math.abs(cove.hull.rotation.y - (pose.yaw - cove.layout.wreck.yaw)) < 1e-9);
  const preview = { nails: [2,2,2,2], planks: 8, seams: [true,true,true], floated: true };
  assert.ok(cove.previewHull(preview).mast); assert.equal(state.floated, false);
  const sail = cove.hull.children.find(o => o.material?.vertexColors && o.geometry !== cove.hull.geometry);
  assert.ok(sail.visible); assert.equal(sail.scale.y, 1);
  cove.previewHull(); assert.equal(sail.visible, false);
  cove.setVoyagePose(null);
  Object.assign(state, preview, { launched: true }); listener({ kind: 'set', live: false });
  for (let i = 0; i < 30; i++) cove.update(0.2);
  const dock = cove.layout.frame.to(4.4, -1.8);
  assert.ok(Math.hypot(cove.hull.position.x-dock.x,cove.hull.position.z-dock.z) < 0.02);
  // Hull remains one shadow-casting merged mesh, one outline, and one unshadowed cloth: +1 submission.
  assert.equal(cove.hull.children.length, 2); assert.equal(sail.castShadow, false);
});
