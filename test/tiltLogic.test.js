// Step 81b: the reusable tilt module (game/tiltLogic.js) on its own: boards, loads, the eased tilt, the plane, a roller settling downhill, the rim and moving obstacles with no tunnelling, determinism, rolling.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, tiltTarget, stepTilt, planeHeight, planeNormal, stepRoller, rollQuaternion, inside, innerHalf, ROLL } from '../public/js/game/tiltLogic.js';

const near = (a, b, e = 1e-9, m = '') => assert.ok(Math.abs(a - b) < e, `${m} ${a} ~= ${b}`);
const board = (o = {}) => createBoard({ cx: 3, cz: -2, hx: 5, hz: 4, rim: 0.5, maxTilt: 0.2, turnRate: 0.3, ...o });

test('a board is flat at first; standing in the middle levels it; the tilt target is proportional to the weighted offset, per axis, and capped at maxTilt', () => {
  const b = board();
  assert.deepEqual(b.tilt, { x: 0, z: 0 }); assert.deepEqual(innerHalf(b), { x: 4.5, z: 3.5 });
  assert.deepEqual(tiltTarget(b, []), { x: 0, z: 0 }); assert.deepEqual(tiltTarget(b, [{ x: 3, z: -2 }]), { x: 0, z: 0 });
  const half = tiltTarget(b, [{ x: 3 + 4.5 * 0.85 / 2, z: -2 }]); near(half.x, 0.1, 1e-9, 'half way = half the tilt'); near(half.z, 0);
  const a = tiltTarget(b, [{ x: 3 + 1, z: -2 }]), c = tiltTarget(b, [{ x: 3 + 2, z: -2 }]); near(c.x, a.x * 2, 1e-9, 'proportional');
  const both = tiltTarget(b, [{ x: 3 + 100, z: -2 + 100 }]); near(Math.hypot(both.x, both.z), 0.2, 1e-9, 'a vector capped at maxTilt'); near(both.x / both.z, 1, 1e-6);
  const edge = tiltTarget(b, [{ x: 3 + 4.5, z: -2 }]); near(edge.x, 0.2, 1e-9);
  // weights: a heavy rider counts more; two equal riders on opposite sides cancel; a missing / non-finite load is ignored
  const w2 = tiltTarget(b, [{ x: 4, z: -2, w: 2 }]), w1 = tiltTarget(b, [{ x: 4, z: -2 }]); near(w2.x, w1.x * 2);
  const cancel = tiltTarget(b, [{ x: 4, z: -2 }, { x: 2, z: -2 }]); near(cancel.x, 0, 1e-12);
  assert.deepEqual(tiltTarget(b, [{ x: NaN, z: 0 }, null]), { x: 0, z: 0 });
  assert.equal(inside(b, 3, -2), true); assert.equal(inside(b, 3 + 4.5, -2), true); assert.equal(inside(b, 3 + 4.6, -2), false); assert.equal(inside(b, 3 + 4.4, -2, 0.2), false);
});

test('the tilt eases towards its target with a limited turn rate: never faster than turnRate, slower near the target, never overshoots, and holds still at the target', () => {
  const b = board(), target = { x: 0.2, z: 0 };
  let prev = 0, maxStep = 0, last = 0;
  for (let i = 0; i < 600; i++) {
    stepTilt(b, target, 1 / 60);
    const d = b.tilt.x - prev; assert.ok(d >= -1e-12, 'monotone'); maxStep = Math.max(maxStep, d / (1 / 60)); prev = b.tilt.x; last = d;
    assert.ok(b.tilt.x <= target.x + 1e-12, 'no overshoot');
  }
  assert.ok(maxStep <= 0.3 + 1e-9, `fastest ${maxStep} rad/s`); assert.ok(maxStep > 0.29, 'the limit is reached on a big move');
  near(b.tilt.x, 0.2, 1e-3); assert.ok(last < 1e-3, 'it eases in');
  const t0 = b.tilt.x; stepTilt(b, { x: b.tilt.x, z: 0 }, 1); assert.equal(b.tilt.x, t0);
  // reversing is as fast: the whole swing from +0.2 to -0.2 needs more than 0.4 / turnRate seconds
  let secs = 0; while (b.tilt.x > -0.19 && secs < 20) { stepTilt(b, { x: -0.2, z: 0 }, 1 / 60); secs += 1 / 60; } assert.ok(secs > 0.38 / 0.3 && secs < 6, `${secs} s`);
  // a big dt is the same as many small ones in direction and bounded in size
  const c = board(); stepTilt(c, { x: 0.2, z: 0.2 }, 10); assert.ok(Math.hypot(c.tilt.x, c.tilt.z) <= Math.hypot(0.2, 0.2) + 1e-9); near(c.tilt.x, c.tilt.z, 1e-12);
});

test('the plane: height 0 at the centre, the low side is the side the board tips towards, the normal is a unit vector consistent with the height gradient', () => {
  const b = board(); b.tilt.x = 0.2; b.tilt.z = -0.1;
  near(planeHeight(b, 3, -2), 0);
  assert.ok(planeHeight(b, 3 + 2, -2) < 0 && planeHeight(b, 3 - 2, -2) > 0, 'tipping towards +x: the +x side is down');
  assert.ok(planeHeight(b, 3, -2 + 2) > 0 && planeHeight(b, 3, -2 - 2) < 0, 'tilt.z < 0: the -z side is down');
  near(planeHeight(b, 3 + 2, -2), -2 * Math.tan(0.2)); near(planeHeight(b, 3, -2 + 2), 2 * Math.tan(0.1));
  const n = planeNormal(b); near(Math.hypot(...n), 1); assert.ok(n[1] > 0.95);
  // the normal is perpendicular to the plane: a point on the plane minus the centre point has no component along it
  for (const [x, z] of [[1, 1], [-3, 2], [5, -4]]) { const p = [x - 3, planeHeight(b, x, z), z + 2]; near(p[0] * n[0] + p[1] * n[1] + p[2] * n[2], 0, 1e-9); }
  const flat = board(); assert.deepEqual(planeNormal(flat), [0, 1, 0]); near(planeHeight(flat, 100, 100), 0);
});

test('a roller on a tipped board accelerates downhill (the right way, the right strength), is slowed by friction, and settles against the rim on the low side', () => {
  const b = board(); b.tilt.x = 0.2;
  const ro = { x: 3, z: -2, vx: 0, vz: 0, r: 0.5 };
  stepRoller(ro, b, [], 0.5);
  assert.ok(ro.vx > 0 && Math.abs(ro.vz) < 1e-12, 'rolls towards +x only');
  const k = ROLL.gravity * ROLL.rollK * Math.tan(0.2) / (1 + Math.tan(0.2) ** 2); const net = (k - ROLL.friction * 9.8) * 0.5;                                         // (slope acceleration minus the constant rolling friction, over half a second, a little less for the damping)
  assert.ok(ro.vx > net * 0.85 && ro.vx < net * 1.02, `v ${ro.vx} vs ${net}`);
  const lvl = board(); const r2 = { x: 3, z: -2, vx: 0, vz: 0, r: 0.5 }; stepRoller(r2, lvl, [], 2); assert.equal(r2.x, 3); assert.equal(r2.vx, 0); assert.equal(r2.vz, 0);
  const steeper = board(); steeper.tilt.x = 0.4; const r3 = { x: 3, z: -2, vx: 0, vz: 0, r: 0.5 }; stepRoller(r3, steeper, [], 0.5); assert.ok(r3.vx > ro.vx, 'a steeper board rolls faster');
  // a diagonal tilt rolls diagonally, towards the tipped corner
  const d = board(); d.tilt.x = 0.15; d.tilt.z = -0.15; const r4 = { x: 3, z: -2, vx: 0, vz: 0, r: 0.5 }; stepRoller(r4, d, [], 1); assert.ok(r4.vx > 0 && r4.vz < 0); near(r4.vx, -r4.vz, 1e-9);
  // it ends up against the +x rim and stays: the centre is held rim + r inside
  for (let i = 0; i < 600; i++) stepRoller(ro, b, [], 1 / 60);
  near(ro.x, 3 + 4.5 - 0.5, 1e-9, 'resting on the rim'); assert.ok(Math.abs(ro.vx) < 0.05, `speed ${ro.vx}`);
  // friction: a rolling ball on a level board slows down and stops
  const f = { x: 3, z: -2, vx: 5, vz: 0, r: 0.3 }; let x0 = f.x; for (let i = 0; i < 60 * 30; i++) stepRoller(f, lvl, [], 1 / 60); assert.ok(Math.hypot(f.vx, f.vz) < 1e-6, 'stopped'); assert.ok(f.x > x0);
});

test('the rim never lets a roller through, however fast or however long the step; it bounces with the restitution', () => {
  const b = board(), inner = innerHalf(b);
  for (const [vx, vz, dt] of [[12, 0, 1 / 60], [12, 9, 0.5], [-30, 30, 2], [500, -500, 1], [0, 12, 3]]) {
    const ro = { x: 3, z: -2, vx, vz, r: 0.5 };
    for (let i = 0; i < 40; i++) {
      stepRoller(ro, b, [], dt, { maxSpeed: 1000 });
      assert.ok(ro.x >= 3 - inner.x + 0.5 - 1e-9 && ro.x <= 3 + inner.x - 0.5 + 1e-9 && ro.z >= -2 - inner.z + 0.5 - 1e-9 && ro.z <= -2 + inner.z - 0.5 + 1e-9, `inside after step ${i}: ${ro.x}, ${ro.z}`);
    }
  }
  const ro = { x: 3 + 3.9, z: -2, vx: 8, vz: 0, r: 0.5 };
  stepRoller(ro, b, [], 1 / 30, { damp: 0, friction: 0, restitution: 0 });
  near(ro.vx, -8 * ROLL.rimE, 0.15, 'bounced back with the restitution'); assert.ok(ro.x < 3 + 4.0 + 1e-9);
});

test('circle obstacles (a player\'s feet) bounce the roller; a moving obstacle kicks it; a fast one cannot be tunnelled; the roller is pushed out of an overlap', () => {
  const b = board(), still = [{ x: 3 + 1.5, z: -2, r: 0.45 }];
  const ro = { x: 3, z: -2, vx: 4, vz: 0, r: 0.5 };
  for (let i = 0; i < 60; i++) { stepRoller(ro, b, still, 1 / 60); assert.ok(Math.hypot(ro.x - still[0].x, ro.z - still[0].z) >= 0.95 - 1e-9, 'never inside the obstacle'); }
  assert.ok(ro.vx < 0, 'bounced back'); assert.ok(ro.x < 3 + 0.6);
  // a kick: a resting roller and an obstacle moving towards it at 6 u/s: the roller leaves faster than it was nudged
  const kick = { x: 3, z: -2, vx: 0, vz: 0, r: 0.5 }; stepRoller(kick, b, [{ x: 3 - 1.5, z: -2, r: 0.45, vx: 6, vz: 0 }], 0.5);
  assert.ok(kick.vx > 3, `kicked ${kick.vx}`);
  // tunnelling: a fast roller against a thin obstacle at a big step
  for (const dt of [1 / 60, 0.1, 0.4]) {
    const fast = { x: 3 - 3, z: -2, vx: 12, vz: 0, r: 0.3 };
    stepRoller(fast, b, [{ x: 3, z: -2, r: 0.1 }], dt);
    for (let i = 0; i < 20; i++) stepRoller(fast, b, [{ x: 3, z: -2, r: 0.1 }], dt);
    assert.ok(fast.x < 3 + 0.001 || fast.vx > 0, 'it did not pass through the obstacle while it was in front of it');
  }
  const stuck = { x: 3, z: -2, vx: 0, vz: 0, r: 0.5 }; stepRoller(stuck, b, [{ x: 3.1, z: -2, r: 0.5 }], 1 / 60); assert.ok(Math.hypot(stuck.x - 3.1, stuck.z + 2) >= 1 - 1e-9, 'pushed out');
  // the speed limit holds even when kicked hard
  const k2 = { x: 3, z: -2, vx: 0, vz: 0, r: 0.5 }; stepRoller(k2, b, [{ x: 2, z: -2, r: 0.45, vx: 9, vz: 0 }], 0.3); assert.ok(Math.hypot(k2.vx, k2.vz) <= ROLL.maxSpeed + 1e-9);
});

test('determinism: the same boards, rollers and steps always give the same numbers, and one big step equals the sum of its fixed sub-steps in effect', () => {
  const run = () => { const b = board(); const ro = { x: 3, z: -2, vx: 1, vz: -2, r: 0.5, q: [0, 0, 0, 1] }; const feet = [{ x: 4, z: -1, r: 0.45, vx: 1, vz: 0 }];
    for (let i = 0; i < 300; i++) { stepTilt(b, tiltTarget(b, [{ x: 3 + Math.sin(i / 20) * 3, z: -2 + Math.cos(i / 25) * 2 }]), 1 / 60); stepRoller(ro, b, feet, 1 / 60); } return { t: b.tilt, ro }; };
  assert.deepEqual(run(), run());
  const b = board(); b.tilt.x = 0.15; b.tilt.z = 0.05;
  const a1 = { x: 3, z: -2, vx: 0, vz: 0, r: 0.5 }, a2 = { ...a1 }; stepRoller(a1, b, [], 0.5); for (let i = 0; i < 120; i++) stepRoller(a2, b, [], 0.5 / 120);
  assert.ok(Math.hypot(a1.x - a2.x, a1.z - a2.z) < 0.02, `big step ${a1.x},${a1.z} vs ${a2.x},${a2.z}`);
});

test('rolling: the quaternion stays a unit quaternion, rolls about the axis perpendicular to the travel, and one full circumference of travel is one turn', () => {
  let q = [0, 0, 0, 1]; q = rollQuaternion(q, 1, 0, 0.5);
  near(Math.hypot(...q), 1); assert.ok(Math.abs(q[2]) > 0 && Math.abs(q[0]) < 1e-12, 'travel along +x rolls about z'); q = rollQuaternion([0, 0, 0, 1], 0, 1, 0.5); assert.ok(Math.abs(q[0]) > 0 && Math.abs(q[2]) < 1e-12, 'along +z about x');
  let a = [0, 0, 0, 1]; const r = 0.55, circ = 2 * Math.PI * r; for (let i = 0; i < 100; i++) a = rollQuaternion(a, circ / 100, 0, r);
  near(Math.abs(a[3]), 1, 1e-9, 'a full turn is the identity (up to sign)'); assert.deepEqual(rollQuaternion([0, 0, 0, 1], 0, 0, 1), [0, 0, 0, 1]);
  const ro = { x: 3, z: -2, vx: 3, vz: 0, r: 0.55, q: [0, 0, 0, 1] }, lvl = board(); stepRoller(ro, lvl, [], 0.2, { damp: 0, friction: 0 }); near(Math.hypot(...ro.q), 1);
  const moved = ro.x - 3; near(2 * Math.asin(Math.abs(ro.q[2])), moved / 0.55, 1e-6, 'angle = distance / radius');
});
