// Player: movement physics, terrain following, blocking, collisions and procedural animation.
//
//   const player = new Player(scene);
//   player.update(dt, inputState)     // inputState from InputManager.update()
//   player.position                   // THREE.Vector3 (feet, world) - same object as player.root.position
//   player.facing                     // yaw in radians (0 = facing +Z)
//   player.velocity                   // { x, z }
//   player.frozen = true              // ignore input (dialogs)
//   player.hop()                      // little emote jump (returns false if already mid-hop)
//   player.faceToward(x, z)           // smoothly turn to look at a world point (cancelled by movement input)
//   player.holding = true             // holding an item: right arm rests in a raised pose (less walk swing)
//   player.swing(dur)                 // item swing animation (wind-up + slash + recover); false if already swinging
//   player.paused = true              // like frozen, but owned by the PlayerManager (pair panel freezes everybody)
//   player.moveGuard = (p, x, z) => bool   // optional: veto a per-axis move to (x, z) (the multiplayer tether)
//   player.nudge(dx, dz)              // small collision-aware displacement (soft push between players)
//   player.dispose()                  // remove from the scene and free per-player GPU resources
import * as THREE from 'three';
import {
  PLAYER_SPEED, PLAYER_WALK_SPEED, PLAYER_ACCEL, PLAYER_DAMPING, PLAYER_RADIUS,
  TURN_SPEED, WALK_THRESHOLD,
} from '../config.js';
import { getHeight, isWalkable, SPAWN } from '../world/terrain.js';
import { resolveCircle } from '../world/colliders.js';
import { createCharacter } from './character.js';

const MAX_DT = 0.05;
const TWO_PI = Math.PI * 2;
const MAX_STEP = 0.25;              // max distance moved per collision sub-step (keeps walkability checks honest)
const GRAVITY = 24;
const HOP_SPEED = 5.6;
const DUST_POOL = 18;
export const HOLD_ARM_X = -1.15;    // right-arm pitch while holding an item (negative = raised forward)
export const HOLD_ARM_Z = -0.32;    // extra outward tilt on top of the rest pose
const SWING_DUR = 0.36;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (k, dt) => 1 - Math.exp(-k * dt);
function shortestAngle(from, to) {
  let d = (to - from) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  else if (d < -Math.PI) d += TWO_PI;
  return d;
}

function makePuffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 1, 16, 16, 15);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath(); g.arc(16, 16, 15, 0, TWO_PI); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Player {
  constructor(scene, { x = SPAWN.x, z = SPAWN.z, colors = null, index = 0 } = {}) {
    this.scene = scene;
    this.index = index;                 // 0-based slot (P1 = 0)
    this.colors = colors;
    const ch = createCharacter(colors || {});
    this.character = ch;
    this.root = ch.root;
    this.parts = ch.parts;
    this.height = ch.height;
    this.radius = PLAYER_RADIUS;

    this.position = this.root.position;
    this.position.set(x, getHeight(x, z), z);
    this.velocity = { x: 0, z: 0 };
    this.facing = 0;                    // face the camera at spawn
    this.root.rotation.y = this.facing;
    this.frozen = false;
    this.paused = false;                // PlayerManager-owned freeze (pair panel), independent of dialog's `frozen`
    this.moveGuard = null;
    this._noGuard = false;
    this._faceTo = null;                // yaw to smoothly turn toward (faceToward), or null
    this.speed = 0;                     // current horizontal speed (u/s)
    this.moving = false;
    this.grounded = true;

    // animation state
    this._t = 0;
    this._phase = 0;
    this._swing = 0;                    // 0..1 walk-cycle amplitude
    this._lean = 0;
    this.holding = false;               // an item is in the right hand (set by world/items.js)
    this._hold = 0;                     // smoothed 0..1 blend of the "holding" arm pose
    this._swingT = -1;                  // <0 idle, else seconds into the swing
    this._swingDur = SWING_DUR;
    // swing keyframes [arm pitch, arm sway, body twist, body lean]: wind-up (K1) and end of the slash (K2)
    this.swingKeys = [[-0.4, -2.4, -0.55, -0.05], [-1.0, 0.9, 0.65, 0.12]];
    this._sq = 0;                       // squash(-)/stretch(+) spring value
    this._sqVel = 0;
    this._hopY = 0;
    this._hopVel = 0;
    this._wasInput = false;
    this._prevSpeed = 0;
    this._blinkTimer = 2 + Math.random() * 2;
    this._blink = -1;                   // <0 idle, else 0..1 progress
    this._turnRate = 0;
    this._sproutLag = { x: 0, z: 0 };
    this._dust = [];
    this._dustTimer = 0;
    this._dustSide = 1;
    this._tmpN = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._qTmp = new THREE.Quaternion();

    this._buildDust();
    scene.add(this.root);
  }

  // ---------------------------------------------------------------------------------------------
  // Public helpers
  // ---------------------------------------------------------------------------------------------

  /** Little jump emote with a squash on take-off and landing. */
  hop() {
    if (this._hopY > 0.02 || this._hopVel > 0) return false;
    this._hopVel = HOP_SPEED;
    this._sq = -0.16;
    this._sqVel = 0;
    return true;
  }

  /** Item swing: arm winds up, slashes across the body, recovers (~0.36s). Returns false if a swing is in progress. */
  swing(dur = SWING_DUR) {
    if (this._swingT >= 0) return false;
    this._swingT = 0;
    this._swingDur = dur;
    return true;
  }

  get swinging() { return this._swingT >= 0; }
  /** 0..1 progress of the current swing (0 when idle). */
  get swingProgress() { return this._swingT < 0 ? 0 : this._swingT / this._swingDur; }

  /** Smoothly turn to face a world point (used when interacting). Movement input cancels it. */
  faceToward(x, z) {
    const dx = x - this.position.x, dz = z - this.position.z;
    if (dx * dx + dz * dz < 1e-6) return;
    this._faceTo = Math.atan2(dx, dz);
  }

  /** Small collision-aware displacement that ignores the tether guard (used for the soft push between players). */
  nudge(dx, dz) {
    this._noGuard = true;
    this._step(dx, dz);
    this._noGuard = false;
  }

  /** Remove from the scene and free the resources that are not shared (blob texture, dust sprites, geometry). */
  dispose() {
    this.scene.remove(this.root);
    this.scene.remove(this._dustGroup);
    for (const sp of this._dust) sp.material.dispose();
    if (this._dust[0] && this._dust[0].material.map) this._dust[0].material.map.dispose();
    const blob = this.parts.blob;
    if (blob.material.map) blob.material.map.dispose();
    blob.material.dispose();
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }

  teleport(x, z) {
    this.position.set(x, getHeight(x, z), z);
    this.velocity.x = this.velocity.z = 0;
  }

  // ---------------------------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------------------------

  update(dt, input) {
    dt = clamp(dt, 0, MAX_DT);
    if (dt === 0) return;
    this._t += dt;

    const mv = (!this.frozen && !this.paused && input && input.move) ? input.move : null;
    let mx = mv ? mv.x : 0, mz = mv ? mv.z : 0;
    let mag = Math.hypot(mx, mz);
    if (mag > 1) { mx /= mag; mz /= mag; mag = 1; }
    const hasInput = mag > 0.001;

    // --- target velocity (analog magnitude: walk below WALK_THRESHOLD, run above)
    let targetSpeed = 0;
    if (hasInput) {
      targetSpeed = mag <= WALK_THRESHOLD
        ? PLAYER_WALK_SPEED * (mag / WALK_THRESHOLD)
        : lerp(PLAYER_WALK_SPEED, PLAYER_SPEED, (mag - WALK_THRESHOLD) / (1 - WALK_THRESHOLD));
    }
    const v = this.velocity;
    if (hasInput) {
      const tx = (mx / mag) * targetSpeed, tz = (mz / mag) * targetSpeed;
      const dx = tx - v.x, dz = tz - v.z;
      const len = Math.hypot(dx, dz);
      const step = PLAYER_ACCEL * dt;
      if (len <= step) { v.x = tx; v.z = tz; }
      else { v.x += (dx / len) * step; v.z += (dz / len) * step; }
    } else {
      const f = Math.exp(-PLAYER_DAMPING * dt);
      v.x *= f; v.z *= f;
      if (Math.hypot(v.x, v.z) < 0.05) { v.x = 0; v.z = 0; }
    }

    // --- integrate in sub-steps with per-axis sliding, walkability and collider push-out
    const moveX = v.x * dt, moveZ = v.z * dt;
    const dist = Math.hypot(moveX, moveZ);
    if (dist > 1e-6) {
      const steps = Math.max(1, Math.ceil(dist / MAX_STEP));
      const sx = moveX / steps, sz = moveZ / steps;
      for (let i = 0; i < steps; i++) this._step(sx, sz);
    }
    this.speed = Math.hypot(v.x, v.z);
    this.moving = this.speed > 0.3;

    // --- facing: smooth turn toward the direction of travel (input direction while accelerating)
    if (hasInput && this.speed > 0.2) {
      const target = Math.atan2(mx, mz);
      const d = shortestAngle(this.facing, target);
      const turn = d * damp(TURN_SPEED, dt);
      this.facing += turn;
      this._turnRate = turn / dt;
      this._faceTo = null;
    } else if (this._faceTo !== null && !hasInput) {
      const d = shortestAngle(this.facing, this._faceTo);
      const turn = d * damp(16, dt);
      this.facing += turn;
      this._turnRate = turn / dt;
      if (Math.abs(d) < 0.03) this._faceTo = null;
    } else {
      this._turnRate *= Math.exp(-10 * dt);
    }
    this.facing = ((this.facing + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
    this.root.rotation.y = this.facing;

    // --- terrain following (smoothed)
    const gy = getHeight(this.position.x, this.position.z);
    this.position.y = Math.abs(gy - this.position.y) > 2 ? gy : lerp(this.position.y, gy, damp(28, dt));

    this._animate(dt, hasInput);
    this._updateDust(dt);
    this._prevSpeed = this.speed;
    this._wasInput = hasInput;
  }

  _guardOk(x, z) { return this._noGuard || !this.moveGuard || this.moveGuard(this, x, z); }

  /** One collision sub-step: slide per axis, then resolve against prop colliders. */
  _step(dx, dz) {
    const p = this.position, v = this.velocity;
    const canStand = isWalkable(p.x, p.z);
    let nx = p.x, nz = p.z;

    // X axis then Z axis, each independently, so the player slides along coast/cliff edges.
    if (dx !== 0) {
      if ((!canStand || isWalkable(p.x + dx, p.z)) && this._guardOk(p.x + dx, p.z)) nx = p.x + dx; else v.x *= 0.2;
    }
    if (dz !== 0) {
      if ((!canStand || isWalkable(nx, p.z + dz)) && this._guardOk(nx, p.z + dz)) nz = p.z + dz; else v.z *= 0.2;
    }

    // Colliders: push out, but never push the player into unwalkable ground.
    const c = { x: nx, z: nz };
    resolveCircle(c, this.radius);
    if (isWalkable(c.x, c.z) || !isWalkable(nx, nz)) { nx = c.x; nz = c.z; }
    else {
      // Try a pure-axis version of the push before giving up.
      if (isWalkable(c.x, nz)) nx = c.x;
      else if (isWalkable(nx, c.z)) nz = c.z;
    }
    p.x = nx; p.z = nz;
  }

  // ---------------------------------------------------------------------------------------------
  // Procedural animation
  // ---------------------------------------------------------------------------------------------

  _animate(dt, hasInput) {
    const P = this.parts;
    const t = this._t;
    const speed = this.speed;
    const norm = clamp(speed / PLAYER_SPEED, 0, 1.2);

    // Squash & stretch events
    if (hasInput && !this._wasInput && this._prevSpeed < 1) this._sqVel += 3.2;                   // start: quick stretch
    if (!hasInput && this._wasInput && this._prevSpeed > 3.5) this._sqVel -= 3.2 * norm + 1.0;    // stop: squash

    // Hop physics
    if (this._hopY > 0 || this._hopVel > 0) {
      this._hopVel -= GRAVITY * dt;
      this._hopY += this._hopVel * dt;
      if (this._hopY <= 0) {
        this._hopY = 0;
        if (this._hopVel < -2) { this._sq = -0.2; this._sqVel = 0; }   // landing squash
        this._hopVel = 0;
      }
    }
    this.grounded = this._hopY <= 0.001;

    // Spring for squash/stretch
    const k = 260, c = 16;
    this._sqVel += (-k * this._sq - c * this._sqVel) * dt;
    this._sq += this._sqVel * dt;
    const sq = clamp(this._sq, -0.3, 0.3);

    // Walk cycle
    const swingTarget = this.grounded ? clamp(speed / 4.5, 0, 1) : 0;
    this._swing = lerp(this._swing, swingTarget, damp(14, dt));
    this._phase += dt * speed * 2.05;
    if (this._swing < 0.02 && speed < 0.2) this._phase = lerp(this._phase, Math.round(this._phase / Math.PI) * Math.PI, damp(8, dt));
    const s = Math.sin(this._phase);
    const sw = this._swing;

    P.legL.rotation.x = s * 0.95 * sw;
    P.legR.rotation.x = -s * 0.95 * sw;
    const armAmp = 0.85 * sw;
    P.armL.rotation.x = -s * armAmp;
    // Right arm: holding an item blends toward a raised pose with a much smaller walk swing
    this._hold = lerp(this._hold, this.holding ? 1 : 0, damp(10, dt));
    const hold = this._hold;
    let armRx = s * armAmp * (1 - 0.78 * hold) + HOLD_ARM_X * hold;
    // Arms swing slightly outward when running, and fling up on a hop
    const hopUp = clamp(this._hopY * 3.2, 0, 2.2) * (this._hopVel !== 0 || this._hopY > 0 ? 1 : 0);
    P.armL.rotation.z = P.armL.userData.restZ + 0.25 * sw + hopUp * 0.8;
    let armRz = P.armR.userData.restZ - 0.25 * sw * (1 - 0.6 * hold) - hopUp * 0.8 * (1 - 0.7 * hold) + HOLD_ARM_Z * hold;
    let twist = 0, slashLean = 0;
    if (this._swingT >= 0) {
      this._swingT += dt;
      const u = this._swingT / this._swingDur;
      if (u >= 1) { this._swingT = -1; }
      else {
        // keyframes: [arm pitch, arm sway, body twist, lean]; wind-up back over the shoulder, fast slash across, recover
        const K1 = this.swingKeys[0], K2 = this.swingKeys[1];
        const B = [armRx, armRz, 0, 0];
        let a, b, e;
        if (u < 0.28) { a = B; b = K1; e = 1 - Math.pow(1 - u / 0.28, 2); }
        else if (u < 0.6) { a = K1; b = K2; const k = (u - 0.28) / 0.32; e = k * k * (3 - 2 * k); e = Math.pow(e, 0.8); }
        else { a = K2; b = B; const k = (u - 0.6) / 0.4; e = k * k * (3 - 2 * k); }
        armRx = lerp(a[0], b[0], e); armRz = lerp(a[1], b[1], e);
        twist = lerp(a[2], b[2], e); slashLean = lerp(a[3], b[3], e);
      }
    }
    P.armR.rotation.x = armRx;
    P.armR.rotation.z = armRz;

    // Body bob (two bounces per cycle) + sway
    const bob = Math.abs(s) * 0.09 * sw;
    const breathe = Math.sin(t * 2.4) * 0.012 * (1 - sw);
    P.torso.position.y = bob + breathe * 0.5;
    P.torso.rotation.z = Math.cos(this._phase) * 0.06 * sw;
    P.torso.rotation.y = twist;
    P.headGroup.rotation.z = -Math.cos(this._phase) * 0.05 * sw + clamp(-this._turnRate * 0.012, -0.2, 0.2);
    P.headGroup.rotation.x = Math.sin(t * 1.3) * 0.015 * (1 - sw);

    // Forward lean (about the feet)
    this._lean = lerp(this._lean, norm * 0.24, damp(9, dt));
    P.rig.rotation.x = this._lean + slashLean;

    // Squash & stretch about the feet (volume preserving-ish), plus breathing scale
    const sy = 1 + sq + breathe;
    const sxz = 1 - sq * 0.55 - breathe * 0.4;
    P.rig.scale.set(sxz, sy, sxz);
    P.rig.position.y = this._hopY;

    // Sprout sway: drag opposite to motion + idle wobble
    const lag = this._sproutLag;
    const vx = this.velocity.x, vz = this.velocity.z;
    // Velocity in the character's local frame (z forward, x left)
    const cy = Math.cos(this.facing), sy2 = Math.sin(this.facing);
    const lz = vx * sy2 + vz * cy;
    const lx = vx * cy - vz * sy2;
    lag.x = lerp(lag.x, -lz * 0.05, damp(8, dt));
    lag.z = lerp(lag.z, lx * 0.05, damp(8, dt));
    P.sprout.rotation.x = lag.x + Math.sin(t * 2.6) * 0.06;
    P.sprout.rotation.z = lag.z + Math.sin(t * 2.1 + 1.0) * 0.09;

    // Blinking
    this._blinkTimer -= dt;
    if (this._blink < 0 && this._blinkTimer <= 0) { this._blink = 0; }
    if (this._blink >= 0) {
      this._blink += dt / 0.16;
      if (this._blink >= 1) {
        this._blink = -1;
        this._blinkTimer = 2 + Math.random() * 3.5;
        if (Math.random() < 0.2) this._blinkTimer = 0.25;   // occasional double blink
      }
    }
    const closed = this._blink < 0 ? 0 : Math.sin(this._blink * Math.PI);
    for (const e of [P.eyeL, P.eyeR]) e.scale.y = e.userData.baseScale.y * (1 - 0.88 * closed);

    // Blob shadow: stays on the ground, tilts to the terrain, shrinks while airborne
    const blob = P.blob;
    const h = this._hopY;
    const sc = clamp(1 - h * 0.35, 0.5, 1) * 1.0;
    blob.scale.set(sc, 1, sc);
    blob.material.opacity = clamp(1 - h * 0.5, 0.4, 1);
    const eps = 0.4;
    const px = this.position.x, pz = this.position.z;
    const nx = getHeight(px - eps, pz) - getHeight(px + eps, pz);
    const nz = getHeight(px, pz - eps) - getHeight(px, pz + eps);
    const n = this._tmpN.set(nx, 2 * eps, nz).normalize();
    // world normal -> root-local (root only has yaw)
    const cosY = Math.cos(this.facing), sinY = Math.sin(this.facing);
    n.set(n.x * cosY - n.z * sinY, n.y, n.x * sinY + n.z * cosY);
    blob.quaternion.setFromUnitVectors(this._up, n);
    // Sit on the smoothed root position but follow the raw ground height
    blob.position.y = 0.06 + (getHeight(px, pz) - this.position.y);
  }

  // ---------------------------------------------------------------------------------------------
  // Dust puffs
  // ---------------------------------------------------------------------------------------------

  _buildDust() {
    const tex = makePuffTexture();
    this._dustGroup = new THREE.Group();
    this._dustGroup.name = 'dust';
    for (let i = 0; i < DUST_POOL; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, color: '#fff4dc', transparent: true, depthWrite: false, opacity: 0 });
      const sp = new THREE.Sprite(mat);
      sp.visible = false;
      sp.renderOrder = 3;
      sp.userData = { life: 0, max: 0.5, vx: 0, vy: 0, vz: 0, size: 0.3 };
      this._dustGroup.add(sp);
      this._dust.push(sp);
    }
    this.scene.add(this._dustGroup);
  }

  _spawnDust(x, y, z, vx, vz) {
    for (const sp of this._dust) {
      if (sp.visible) continue;
      const d = sp.userData;
      d.life = 0;
      d.max = 0.4 + Math.random() * 0.2;
      d.vx = vx + (Math.random() - 0.5) * 0.6;
      d.vz = vz + (Math.random() - 0.5) * 0.6;
      d.vy = 0.5 + Math.random() * 0.4;
      d.size = 0.22 + Math.random() * 0.14;
      sp.position.set(x, y + 0.12, z);
      sp.visible = true;
      return;
    }
  }

  _updateDust(dt) {
    // Emit while running (alternating feet), just behind the player
    if (this.speed > 4.2 && this.grounded) {
      this._dustTimer -= dt;
      if (this._dustTimer <= 0) {
        this._dustTimer = 0.11;
        this._dustSide = -this._dustSide;
        const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
        const rx = fz, rz = -fx;                       // character's right
        const off = 0.14 * this._dustSide;
        const bx = this.position.x - fx * 0.28 + rx * off;
        const bz = this.position.z - fz * 0.28 + rz * off;
        this._spawnDust(bx, getHeight(bx, bz), bz, -this.velocity.x * 0.08, -this.velocity.z * 0.08);
      }
    } else {
      this._dustTimer = 0;
    }
    for (const sp of this._dust) {
      if (!sp.visible) continue;
      const d = sp.userData;
      d.life += dt;
      const u = d.life / d.max;
      if (u >= 1) { sp.visible = false; sp.material.opacity = 0; continue; }
      sp.position.x += d.vx * dt;
      sp.position.z += d.vz * dt;
      sp.position.y += d.vy * dt;
      d.vy *= Math.exp(-2 * dt);
      const sz = d.size * (0.6 + u * 1.5);
      sp.scale.set(sz, sz, 1);
      sp.material.opacity = 0.75 * (1 - u) * (1 - u * 0.3);
    }
  }
}
