// Step 69c follow-up: Duskcrown's gentler camera is a blend on top of FollowCamera; everywhere else the numbers are exactly the old ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FollowCamera } from '../public/js/camera/followCamera.js';
import { CAMERA_OFFSET, DUSK_CAMERA, CAMERA_FOV } from '../public/js/config.js';

const make = () => { const cam = new THREE.PerspectiveCamera(CAMERA_FOV, 16 / 9, 0.1, 1000); return { cam, fc: new FollowCamera(cam) }; };

test('with no region blend the camera sits exactly at the old offset and looks at the feet + 0.9 (every other island, pages, areas)', () => {
  const { cam, fc } = make();
  fc.regionCamera = DUSK_CAMERA;
  fc.update(0, { x: 10, y: 2, z: -5 });
  assert.equal(fc.effectiveOffset(), fc.offset);
  assert.deepEqual([cam.position.x, cam.position.y, cam.position.z].map((v) => +v.toFixed(6)), [10 + CAMERA_OFFSET.x, 2.9 + CAMERA_OFFSET.y, -5 + CAMERA_OFFSET.z].map((v) => +v.toFixed(6)));
  const a = fc.zoomForSpread({ half: 12, near: 6, far: 6 });
  fc.regionBlend = 0;
  assert.equal(fc.zoomForSpread({ half: 12, near: 6, far: 6 }), a);
  // identical to a camera that has no region camera at all
  const o = make(); o.fc.update(0, { x: 10, y: 2, z: -5 });
  assert.deepEqual(cam.position.toArray(), o.cam.position.toArray());
  assert.deepEqual(cam.quaternion.toArray(), o.cam.quaternion.toArray());
});

test('full blend: lower, further back, aimed higher; half blend lies halfway; the zoom-out for several players still scales the blended offset', () => {
  const { cam, fc } = make();
  fc.regionCamera = DUSK_CAMERA; fc.regionBlend = 1;
  fc.update(0, { x: 0, y: 0, z: 0 });
  assert.ok(Math.abs(cam.position.y - (0.9 + DUSK_CAMERA.offset.y)) < 1e-9);
  assert.ok(Math.abs(cam.position.z - DUSK_CAMERA.offset.z) < 1e-9);
  assert.ok(DUSK_CAMERA.offset.y < CAMERA_OFFSET.y && DUSK_CAMERA.offset.z > CAMERA_OFFSET.z);
  const look = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), t = (0.9 + DUSK_CAMERA.aim - cam.position.y) / look.y;
  assert.ok(Math.abs(cam.position.z + look.z * t) < 1e-6, 'aims at the feet + 0.9 + aim');
  fc.regionBlend = 0.5;
  assert.ok(Math.abs(fc.effectiveOffset().y - (CAMERA_OFFSET.y + DUSK_CAMERA.offset.y) / 2) < 1e-9);
  fc.regionBlend = 1;
  fc.update(100, { x: 0, y: 0, z: 0 }, 2);
  assert.ok(Math.abs(cam.position.z - DUSK_CAMERA.offset.z * 2) < 1e-9);
  assert.ok(fc.zoomForSpread({ half: 14, near: 6, far: 6 }) >= 1);
});
