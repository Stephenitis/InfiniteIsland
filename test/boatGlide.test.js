// Step 68b sail physics and pose contract: real hop bodies, held/released Jump,
// landing cancellation, lava masking, and the slippery landing validator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HOP_COURSE as H } from '../public/js/config.js';
import { stepHop, surfaceAt, gapAt, validateCourse } from '../public/js/game/hopLogic.js';
import { encodePose, decodePose } from '../public/js/net/poseBuffer.js';
const ground = { height: () => 0 };
const c = { id: 'glide', zone: { x: 0, z: 0, r: 20 }, gapY: -1, pads: [], links: [] };

test('sail caps held descent, release resumes gravity, landing ends the glide', () => {
  const body = { x: 0, z: 0, y: 20, vy: 0, grounded: false, glide: true };
  for (let i = 0; i < 120; i++) {
    stepHop(body, { glide: true }, c, i / 60, 1 / 60, ground);
    assert.ok(body.vy >= -H.glideFallSpeed);
  }
  const y = body.y;
  stepHop(body, { glide: false }, c, 2, 1 / 60, ground);
  assert.ok(body.vy < -H.glideFallSpeed && body.y < y);
  for (let i = 0; i < 600 && !body.grounded; i++) stepHop(body, { glide: true }, c, 3 + i / 60, 1 / 60, ground);
  assert.equal(body.y, 0); assert.equal(body.glide, false); assert.ok(body.grounded);
});

test('glide is a per-player capability; ordinary falls retain gravity and rising hops retain their apex', () => {
  const a = { x: 0, z: 0, y: 20, vy: 0, grounded: false }, b = { ...a, glide: true };
  for (let i = 0; i < 30; i++) { stepHop(a, { glide: true }, c, i / 60, 1 / 60, ground); stepHop(b, { glide: true }, c, i / 60, 1 / 60, ground); }
  assert.ok(a.vy < b.vy && a.y < b.y);
  const up = { x: 0, z: 0, y: 0, vy: 0, grounded: true, glide: true };
  stepHop(up, { jump: true, glide: true }, c, 0, 1 / 60, ground);
  assert.equal(up.vy, H.hopSpeed - H.gravity / 60);
});

test('sail canopy flag travels with existing real y, without increasing the pose packet', () => {
  const p = { index: 0, position: { x: 2, y: 12, z: 3 }, velocity: { x: 0, z: 0 }, character: { hat: null }, _gliding: true };
  const packet = encodePose(p), pose = decodePose(packet);
  assert.equal(packet.length, 16); assert.equal(pose.y, 12); assert.ok(pose.flags & 128);
  p._gliding = false; assert.equal(decodePose(encodePose(p)).flags & 128, 0);
});

test('local lava hazard masks ground only inside the basin, while rocks remain real surfaces', () => {
  const lava = { ...c, hazard: { x: 0, z: 0, r: 4 }, pads: [{ id: 'rock', x: 0, z: 0, r: 1, top: 1 }] };
  assert.ok(gapAt(lava, 2, 0, ground)); assert.equal(gapAt(lava, 5, 0, ground), false);
  assert.equal(surfaceAt(lava, 2, 0, 0, 2, ground).y, -Infinity);
  assert.equal(surfaceAt(lava, 0, 0, 0, 2, ground).pad, 'rock');
});

test('wet validator includes braking on release and rejects a slippery overshoot', () => {
  const pads = [{ id: 'a', x: 0, z: 0, r: 1.2, top: 1 }, { id: 'b', kind: 'wet', x: 4.5, z: 0, r: 0.9, top: 1 }];
  const wet = { ...c, gapY: 0.1, pads, links: [{ a: 'a', b: 'b' }], start: 'a', goal: 'b' };
  assert.equal(validateCourse(wet, ground).ok, false);
});
