// Tilt boards and rolling balls (Step 81b): PURE rules, independent of the party and of three.js. Tilty Tiles is the first user; a later overworld step can put tilting platforms in the islands (balance a log
// bridge, roll a boulder onto a switch) by reusing this and adding a terrain hook for moving surfaces (a player's y = planeHeight at its feet).
//
// A BOARD is a flat rectangle on a centre pivot that tips towards where the weight stands:
//   board = createBoard({ cx, cz, hx, hz, rim, maxTilt, turnRate, reach, ease })     (world x/z, half extents OUTSIDE the rim; the playable inside is hx - rim by hz - rim)
//   board.tilt = { x, z }     tip angles (rad): x > 0 means the +x side is DOWN (the board tips towards +x); same for z
//   tiltTarget(board, loads)  loads = [{ x, z, w = 1 }] (bodies standing on it, with weights) -> { x, z }: proportional to the weighted offset from the centre (as a fraction of `reach` x the inner half
//                             extent, per axis), the vector capped at maxTilt. Standing in the middle levels the board; two equal riders on opposite sides cancel.
//   stepTilt(board, target, dt)   eases board.tilt towards the target with a limited turn rate (rad/s): speed = min(turnRate, distance * ease). Mutates and returns board.tilt.
//   planeHeight(board, x, z)  height of the surface above the pivot at a world point (0 at the centre; the low side is where the board tips towards)
//   planeNormal(board)        the unit normal [x, y, z] of the surface
//   inside(board, x, z, pad)  the point lies on the playable inside (inner rect shrunk by pad)
// A ROLLER is a ball on the board:
//   roller = { x, z, vx, vz, r, q? }       q (optional) = rolling quaternion [x, y, z, w], integrated from the travel / r
//   stepRoller(roller, board, obstacles, dt, opts)   slope gravity (g * rollK * s / (1 + |s|^2) along the downhill direction, s = (tan tilt)), rolling damping + a little constant friction, bounces off the rim
//                             (restitution) and off circle obstacles { x, z, r, vx, vz } (x, z = position at the START of dt, moving with vx, vz: a player's feet; the ball bounces off the RELATIVE velocity, so a
//                             running player kicks it). Deterministic fixed sub-steps (<= 1/240 s and <= r/2 of travel each): no tunnelling through the rim or an obstacle. Mutates and returns the roller.
//   opts = { gravity, rollK, damp, friction, rimE, obstacleE, maxSpeed }  (defaults in ROLL)
export const ROLL = { gravity: 9.8, rollK: 5 / 7, damp: 0.25, friction: 0.05, rimE: 0.55, obstacleE: 0.6, maxSpeed: 12 };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createBoard({ cx = 0, cz = 0, hx = 5, hz = 4, rim = 0.4, maxTilt = 0.21, turnRate = 0.3, reach = 0.85, ease = 3 } = {}) {
  return { centre: { x: cx, z: cz }, half: { x: hx, z: hz }, rim, maxTilt, turnRate, reach, ease, tilt: { x: 0, z: 0 } };
}
export const innerHalf = (b) => ({ x: b.half.x - b.rim, z: b.half.z - b.rim });
export function inside(b, x, z, pad = 0) {
  const h = innerHalf(b);
  return Math.abs(x - b.centre.x) <= h.x - pad + 1e-9 && Math.abs(z - b.centre.z) <= h.z - pad + 1e-9;
}

export function tiltTarget(b, loads) {
  const h = innerHalf(b);
  let sx = 0, sz = 0;
  for (const l of loads || []) {
    if (!l || !Number.isFinite(l.x) || !Number.isFinite(l.z)) continue;
    const w = l.w === undefined ? 1 : l.w;
    sx += w * (l.x - b.centre.x) / (h.x * b.reach); sz += w * (l.z - b.centre.z) / (h.z * b.reach);
  }
  let tx = clamp(sx, -1, 1) * b.maxTilt, tz = clamp(sz, -1, 1) * b.maxTilt;
  const m = Math.hypot(tx, tz);
  if (m > b.maxTilt) { tx *= b.maxTilt / m; tz *= b.maxTilt / m; }
  return { x: tx, z: tz };
}

export function stepTilt(b, target, dt) {
  const dx = target.x - b.tilt.x, dz = target.z - b.tilt.z, d = Math.hypot(dx, dz);
  if (d < 1e-9) return b.tilt;
  const step = Math.min(d, Math.min(b.turnRate, d * b.ease) * dt);
  b.tilt.x += dx / d * step; b.tilt.z += dz / d * step;
  return b.tilt;
}

export function planeHeight(b, x, z) { return -(Math.tan(b.tilt.x) * (x - b.centre.x) + Math.tan(b.tilt.z) * (z - b.centre.z)); }
export function planeNormal(b) {
  const sx = Math.tan(b.tilt.x), sz = Math.tan(b.tilt.z), n = Math.hypot(sx, 1, sz);
  return [sx / n, 1 / n, sz / n];
}

/** Rotate the quaternion q by rolling a ball of radius r over the ground displacement (dx, dz): the axis is perpendicular to the travel (left-multiplied, so direction changes keep the earlier spin). */
export function rollQuaternion(q, dx, dz, r) {
  const d = Math.hypot(dx, dz);
  if (d < 1e-12) return q.slice();
  const half = d / r / 2, sn = Math.sin(half), ax = dz / d * sn, az = -dx / d * sn, aw = Math.cos(half);
  const [x, y, z, w] = q, nx = aw * x - az * y + ax * w, ny = aw * y + az * x - ax * z, nz = aw * z + ax * y + az * w, nw = aw * w - ax * x - az * z;
  const n = Math.hypot(nx, ny, nz, nw);
  return [nx / n, ny / n, nz / n, nw / n];
}

export function stepRoller(ro, b, obstacles, dt, opts = {}) {
  const o = { ...ROLL, ...opts }, h0 = innerHalf(b);
  const minX = b.centre.x - h0.x + ro.r, maxX = b.centre.x + h0.x - ro.r, minZ = b.centre.z - h0.z + ro.r, maxZ = b.centre.z + h0.z - ro.r;
  const sx = Math.tan(b.tilt.x), sz = Math.tan(b.tilt.z), k = o.gravity * o.rollK / (1 + sx * sx + sz * sz), ax = k * sx, az = k * sz;
  const speed0 = Math.hypot(ro.vx, ro.vz) + Math.hypot(ax, az) * dt;
  const n = clamp(Math.max(Math.ceil(dt * 240), Math.ceil((speed0 + 14) * dt / (ro.r * 0.5))), 1, 96), h = dt / n;   // (+14: a running player can kick it)
  const obs = (obstacles || []).filter(Boolean);
  for (let i = 0; i < n; i++) {
    ro.vx += ax * h; ro.vz += az * h;
    const dmp = Math.exp(-o.damp * h); ro.vx *= dmp; ro.vz *= dmp;
    const sp = Math.hypot(ro.vx, ro.vz);
    if (sp > 0) { const ns = Math.max(0, sp - o.friction * h * 9.8); ro.vx *= ns / sp; ro.vz *= ns / sp; }
    const lim = Math.hypot(ro.vx, ro.vz);
    if (lim > o.maxSpeed) { ro.vx *= o.maxSpeed / lim; ro.vz *= o.maxSpeed / lim; }
    const px = ro.x, pz = ro.z;
    ro.x += ro.vx * h; ro.z += ro.vz * h;
    for (const ob of obs) {                                                              // the feet (moving over the step)
      const ox = ob.x + (ob.vx || 0) * h * (i + 1), oz = ob.z + (ob.vz || 0) * h * (i + 1), dx = ro.x - ox, dz = ro.z - oz, d = Math.hypot(dx, dz), min = ro.r + ob.r;
      if (d >= min) continue;
      const nx = d > 1e-9 ? dx / d : 1, nz = d > 1e-9 ? dz / d : 0;
      ro.x = ox + nx * min; ro.z = oz + nz * min;
      const vn = (ro.vx - (ob.vx || 0)) * nx + (ro.vz - (ob.vz || 0)) * nz;
      if (vn < 0) { ro.vx -= (1 + o.obstacleE) * vn * nx; ro.vz -= (1 + o.obstacleE) * vn * nz; }
    }
    if (ro.x < minX) { ro.x = minX; if (ro.vx < 0) ro.vx = -ro.vx * o.rimE; } else if (ro.x > maxX) { ro.x = maxX; if (ro.vx > 0) ro.vx = -ro.vx * o.rimE; }
    if (ro.z < minZ) { ro.z = minZ; if (ro.vz < 0) ro.vz = -ro.vz * o.rimE; } else if (ro.z > maxZ) { ro.z = maxZ; if (ro.vz > 0) ro.vz = -ro.vz * o.rimE; }
    if (ro.q) ro.q = rollQuaternion(ro.q, ro.x - px, ro.z - pz, ro.r);
  }
  return ro;
}
