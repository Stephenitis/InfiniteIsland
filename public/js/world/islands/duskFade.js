// The canopy fade of Duskcrown's giant caps (Step 69c): pure rules, no three.js. The gameplay camera looks DOWN at the players from behind; a giant cap between the lens and a player (or
// right over one) would hide them, so that cap dithers out (screen-door discard in its shader, no transparency) and back in. Stems never fade; remote avatars are not considered.
//
//   capCovers(cap, cam, pt, margin)         true when the segment camera -> pt (a point on a local player, y = chest height) crosses the cap volume, or pt stands under the cap.
//                                           cap = { x, z, r, y0, y1 } (a vertical cylinder: the cap's radius, its underside and its top; duskPlacement.fadeRecord)
//   fadeTargets(caps, cam, points, margin, out?) -> out[i] = 1 when cap i must fade, 0 otherwise (a Float32Array / array parallel to `caps`)
//   stepFade(cur, target, dt, rate)         linear slew of the displayed fade value: the full 0 <-> 1 swing takes 1 / rate seconds (DUSK_FLORA.fadeRate = 4 -> 0.25 s)
import { DUSK_FLORA } from '../../config.js';

/** Does the segment a -> b cross the vertical cylinder (centre cx, cz; radius r; y from y0 to y1)? Pure 2D circle clip, then a y-interval test (y is linear along the segment). */
export function segmentHitsCylinder(a, b, cx, cz, r, y0, y1) {
  const dx = b.x - a.x, dz = b.z - a.z, fx = a.x - cx, fz = a.z - cz;
  const A = dx * dx + dz * dz, C = fx * fx + fz * fz - r * r;
  let t0, t1;
  if (A < 1e-9) { if (C > 0) return false; t0 = 0; t1 = 1; }           // straight down / up: inside the circle or not
  else {
    const B = 2 * (fx * dx + fz * dz), disc = B * B - 4 * A * C;
    if (disc < 0) return false;
    const sq = Math.sqrt(disc);
    t0 = (-B - sq) / (2 * A); t1 = (-B + sq) / (2 * A);
    if (t1 < 0 || t0 > 1) return false;
    t0 = Math.max(0, t0); t1 = Math.min(1, t1);
  }
  const ya = a.y + (b.y - a.y) * t0, yb = a.y + (b.y - a.y) * t1;
  return Math.max(ya, yb) >= y0 && Math.min(ya, yb) <= y1;
}

export function capCovers(cap, cam, pt, margin = DUSK_FLORA.fadeMargin) {
  const r = cap.r + margin;
  if (Math.hypot(pt.x - cap.x, pt.z - cap.z) < cap.r * 0.95 && pt.y < cap.y1) return true;   // standing under it
  return segmentHitsCylinder(cam, pt, cap.x, cap.z, r, cap.y0, cap.y1);
}

export function fadeTargets(caps, cam, points, margin = DUSK_FLORA.fadeMargin, out = new Float32Array(caps.length)) {
  for (let i = 0; i < caps.length; i++) {
    const c = caps[i];
    let hit = 0;
    for (let k = 0; k < points.length && !hit; k++) {
      const p = points[k];
      // cheap reject: the segment's bounding circle can't reach the cap
      if (Math.min(p.x, cam.x) - c.r - margin > c.x || Math.max(p.x, cam.x) + c.r + margin < c.x || Math.min(p.z, cam.z) - c.r - margin > c.z || Math.max(p.z, cam.z) + c.r + margin < c.z) continue;
      if (capCovers(c, cam, p, margin)) hit = 1;
    }
    out[i] = hit;
  }
  return out;
}

export function stepFade(cur, target, dt, rate = DUSK_FLORA.fadeRate) {
  const d = target - cur, m = rate * dt;
  return Math.abs(d) <= m ? target : cur + Math.sign(d) * m;
}
