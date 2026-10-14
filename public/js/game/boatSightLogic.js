// Pure star-chart rules (68d). skyStars reproduces the existing sky RNG consumption exactly.
// constellations selects nearby real stars; alignment checks camera direction and ring roll.
// nightWindow / validateSight share the local prompt and host authority's hour / goal gate.
import { BOAT_SIGHTS as S } from '../config.js';
import { mulberry32 } from '../utils/rng.js';
import { atBoatGoal } from './boatLogic.js';
const TAU = Math.PI * 2;
export function skyStars() {
  const rng = mulberry32(92014);
  return Array.from({ length: 400 }, () => {
    const a = rng() * TAU, y = 0.16 + rng() * 0.83, r = Math.sqrt(1 - y * y);
    const phase = rng() * 6.28, size = rng() < 0.08 ? 3.5 : 1.5 + rng();
    return { x: Math.cos(a) * r, y, z: Math.sin(a) * r, phase, size };
  });
}
const dot = (a, b) => a.x*b.x + a.y*b.y + a.z*b.z;
const unit = p => { const d = Math.hypot(p.x,p.y,p.z); return {x:p.x/d,y:p.y/d,z:p.z/d}; };
export function constellations() {
  const stars = skyStars();
  return S.anchors.map((id, post) => {
    const look = stars[id];
    const ids = stars.map((v,i) => ({i,d:dot(look,v)})).sort((a,b)=>b.d-a.d).slice(0,5).map(v=>v.i);
    return { post, ids, look: unit(ids.reduce((a,i)=>({x:a.x+stars[i].x,y:a.y+stars[i].y,z:a.z+stars[i].z}),{x:0,y:0,z:0})), angle: S.angles[post] };
  });
}
export function nightWindow(hour, window = S.night) {
  if (!Number.isFinite(hour)) return false;
  const h = ((hour % 24) + 24) % 24, [a,b] = window;
  return a < b ? h >= a && h < b : h >= a || h < b;
}
export function aligned(angle, look, constellation) {
  if (!Number.isFinite(angle) || !look || !constellation || ![look.x,look.y,look.z].every(Number.isFinite) || Math.hypot(look.x,look.y,look.z) === 0) return false;
  const delta = Math.atan2(Math.sin(angle-constellation.angle),Math.cos(angle-constellation.angle));
  return Math.abs(delta) <= S.rollTolerance && dot(unit(look),constellation.look) >= Math.cos(S.lookTolerance);
}
export function validateSight(s, {post, hour, pos, posts, slack = 0} = {}) {
  if (!Number.isInteger(post) || post < 0 || post >= 3) return 'bad-request';
  if (!s.unlocked) return 'locked';
  if (s.sights[post]) return 'found';
  if (!nightWindow(hour)) return 'day';
  return atBoatGoal(pos,posts?.[post],slack) ? null : 'far';
}
