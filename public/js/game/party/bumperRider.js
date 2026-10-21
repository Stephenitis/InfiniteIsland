// Puffball rider presentation (Step 80d): applyBumperRider(player, gameState, slot) AFTER the normal Player animator and authoritative foot placement.
// Uses the existing character rig and walk-cycle proportions. Facing, signed stride and collision lean are host state, so local and remote riders share the same treadmill / backpedal pose.
// No Player physics or animation clocks are changed; the ordinary animator resumes naturally when the party stops calling this helper.
import { PARTY } from '../../config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Readable presentation numbers; exported for signed-gait / facing tests without constructing a renderer. */
export function riderPose(g, slot) {
  const b = g.balls[slot]; if (!b) return null;
  const speed = Math.hypot(b.vx, b.vz), forward = Math.sin(b.facing), frontZ = Math.cos(b.facing), out = !g.alive[slot];
  const signedSpeed = b.vx * forward + b.vz * frontZ, side = b.bumpX * frontZ - b.bumpZ * forward, front = b.bumpX * forward + b.bumpZ * frontZ;
  return { facing: b.facing, phase: b.gait, swing: out ? 0 : clamp(speed / 4.5, 0, 1), signedSpeed,
    lean: out ? 0 : clamp(signedSpeed / PARTY.bumpers.maxSpeed * 0.18 + front, -0.45, 0.45), bank: out ? 0 : -side, out };
}

export function applyBumperRider(player, g, slot) {
  const pose = riderPose(g, slot); if (!pose || !player) return;
  player.facing = pose.facing; player.root.rotation.y = pose.facing;
  const p = player.parts; if (!p) return pose;
  const s = Math.sin(pose.phase), sw = pose.swing;
  p.legL.rotation.x = s * 0.95 * sw; p.legR.rotation.x = -s * 0.95 * sw;
  p.armL.rotation.x = -s * 0.85 * sw; p.armR.rotation.x = s * 0.85 * sw;
  p.armL.rotation.z = (p.armL.userData.restZ || 0) + 0.25 * sw;
  p.armR.rotation.z = (p.armR.userData.restZ || 0) - 0.25 * sw;
  p.torso.position.y = Math.abs(s) * 0.09 * sw;
  p.torso.rotation.z = Math.cos(pose.phase) * 0.06 * sw; p.torso.rotation.y = 0;
  p.headGroup.rotation.z = -Math.cos(pose.phase) * 0.05 * sw;
  p.rig.rotation.x = pose.lean; p.rig.rotation.z = pose.bank;
  // The synced ballPose already includes the little hop: a stale local hop must not lift a rider off its puffball twice.
  p.rig.position.set(0, 0, 0);
  return pose;
}
