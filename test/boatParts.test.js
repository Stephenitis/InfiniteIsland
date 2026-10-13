// Step 68b presentation smoke tests with real Three geometry and WorldSync, no browser/GPU.
// Counts are conservative scene/frustum mesh submissions, not renderer.info measurements.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WorldSync } from '../public/js/net/worldSync.js';
import { createBoat } from '../public/js/world/boat.js';
import { createHopCourses } from '../public/js/world/hopCourses.js';
import { createCove } from '../public/js/world/cove.js';
import { GamepadSource } from '../public/js/input/gamepadSource.js';
import { InputManager } from '../public/js/input/inputManager.js';
import { createInteractions } from '../public/js/world/interactions.js';
import { findNearest } from '../public/js/world/interactables.js';
import { createBoatParts } from '../public/js/world/boatParts.js';
import { partLayouts } from '../public/js/world/islands/emberParts.js';
import { clearCourses, courses } from '../public/js/game/hopLogic.js';
import { getInteractables, clearInteractables } from '../public/js/world/interactables.js';
import { getColliders, clearColliders } from '../public/js/world/colliders.js';

function fixture() {
  clearCourses(); clearColliders(); clearInteractables();
  const scene = new THREE.Scene(), sync = new WorldSync({ role: 'host' });
  let full = true, cheers = 0;
  const world = { regions: { isFull: () => full } };
  const p = { index: 0, position: new THREE.Vector3(), _cb: { grounded: true }, _gliding: false, root: new THREE.Group() };
  const players = { list: [p], p1: p };
  const boat = createBoat({ sync, params: new URLSearchParams('testboat') });
  const hop = createHopCourses({ scene, players, sync, world });
  const marlo = { shown: true, cheer: () => cheers++ };
  const cove = createCove({ scene, players, boat, hop, world, marlo });
  cove.update(1 / 60); hop.update(1 / 60);
  const baseline = new Set(); scene.traverse((o) => baseline.add(o));
  const avatars = { list: [] };
  const parts = createBoatParts({ scene, players, boat, hop, world, cove, avatars });
  const tick = (dt = 1 / 60) => { parts.update(dt); cove.update(dt); hop.update(dt); scene.updateMatrixWorld(true); };
  return { scene, sync, boat, hop, cove, parts, p, tick, baseline, avatars, get cheers() { return cheers; }, setFull(v) { full = v; } };
}
function active(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }

 test('part runtime registers once, unloads/rebuilds visuals, and resets without duplicate gameplay', () => {
  const f = fixture(); f.tick();
  assert.equal(courses().length, 4);
  assert.equal(getInteractables().filter((i) => i.type === 'boatpart').length, 4);
  const count = getColliders().length;
  f.setFull(false); f.tick(); f.setFull(true); f.tick(); f.tick();
  assert.equal(courses().length, 4); assert.equal(getColliders().length, count);
  assert.equal(getInteractables().filter((i) => i.type === 'boatpart').length, 4);
  f.boat.debug.reset(); f.tick(); f.boat.debug.unlock(); f.tick();
  assert.equal(courses().length, 4); assert.equal(getColliders().length, count);
  assert.equal(getInteractables().filter((i) => i.type === 'boatpart').length, 4);
});

test('every pickup takes once and Biscuit queues all deliveries and cheers', () => {
  const f = fixture(); f.tick();
  for (const part of ['sail', 'rudder', 'compass']) {
    const item = getInteractables().find((i) => i.type === 'boatpart' && i.prompt.toLowerCase().includes(part));
    assert.ok(item, part); f.p.position.copy(item.position);
    f.p._cb = { grounded: true };
    item.onInteract(item, f.p);
    assert.ok(f.boat.has(part));
    assert.equal(f.boat.take(f.p, part).reason, 'taken');
    if (part === 'sail') assert.ok(f.p._cb.glide, 'the local carrier arms the glide');
  }
  assert.equal(getInteractables().filter((i) => i.type === 'boatpart').length, 1);
  for (let i = 0; i < 1100; i++) f.tick();
  assert.equal(f.cove.flight, null); assert.equal(f.cheers, 3);
  assert.equal(courses().length, 4, 'courses stay open after collection');
});

test('part views stay within 25 additional mesh submissions, have no lights, and batch movers by kind', (t) => {
  const f = fixture(); f.tick();
  const instances = [];
  f.scene.traverse((o) => { if (o.isInstancedMesh) instances.push(o); assert.equal(!!o.isLight, false); });
  assert.equal(instances.length, 2, 'one sway bamboo batch and one sinking crust batch');
  for (const [part, layout] of Object.entries(partLayouts())) {
    let worst = 0;
    const course = layout.course, views = [course.pads[0], course.pads.find((p) => p.cp && p.id !== course.start), course.pads.find((p) => p.id === course.goal)];
    for (const p of views) {
      f.p.position.set(p.x, p.top, p.z); f.p._course = course; f.p._cb = { pad: p.id, checkpoint: p.id }; f.tick();
      const camera = new THREE.PerspectiveCamera(55, 4 / 3, 0.1, 180);
      camera.position.set(p.x, p.top + 9, p.z + 14); camera.lookAt(p.x, p.top, p.z); camera.updateMatrixWorld(true);
      const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      let calls = 0;
      f.scene.traverse((o) => {
        if (!f.baseline.has(o) && o.isMesh && active(o) && (!o.frustumCulled || frustum.intersectsObject(o))) calls += o.castShadow ? 2 : 1;
      });
      worst = Math.max(worst, calls);
      assert.ok(calls <= 25, `${part} at ${p.id}: ${calls}`);
    }
    t.diagnostic(`${part}: <=${worst} additional conservative mesh submissions at start / middle / goal`);
  }
});


test('glide canopy follows both local and remote real y and hides on landing', () => {
  const f = fixture(); f.p._gliding = true; f.p.position.set(20, 12, 30); f.tick();
  assert.equal(f.parts.summary().canopies, 1);
  const remote = { position: new THREE.Vector3(22, 10, 32), root: new THREE.Group(), _gliding: true };
  f.avatars.list.push(remote); f.tick(); assert.equal(f.parts.summary().canopies, 2);
  f.p._gliding = false; remote._gliding = false; f.tick(); assert.equal(f.parts.summary().canopies, 0);
  f.avatars.list.length = 0; f.tick();
});

test('main interactions path arms only the sail carrier; goal prompts reject horizontal and vertical shortcuts', () => {
  const f = fixture(), item = f.parts.entries.sail.item;
  f.p.faceToward = () => {};
  const interactions = createInteractions({ scene:f.scene, players:{...{ list:[f.p], p1:f.p }, on(){}}, sync:f.sync });
  f.p.position.copy(item.position); f.p.position.x += 5.8;
  assert.notEqual(findNearest(f.p.position), item);
  assert.equal(interactions.interact(item, f.p), false);
  f.p.position.copy(item.position); f.p.position.y -= 2;
  assert.notEqual(findNearest(f.p.position), item);
  assert.equal(interactions.interact(item, f.p), false);
  f.p.position.copy(item.position);
  assert.equal(findNearest(f.p.position), item);
  const pad = {index:0,id:'Review standard pad',mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
  const gamepad = new GamepadSource({addEventListener(){},removeEventListener(){}});gamepad._read=()=>[pad];
  const input=new InputManager();input.addSource('pad:0',gamepad.view(0));gamepad.sync(0);input.update();
  pad.buttons[0]={pressed:true,value:1};gamepad.sync(1);
  const actions=input.update();assert.ok(actions.interactPressed);
  if(actions.interactPressed)assert.equal(interactions.interact(findNearest(f.p.position),f.p),true);
  assert.ok(f.p._sailGlideArmed && f.p._cb.glide);
});
