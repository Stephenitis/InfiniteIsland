// Pure mouse direction maths; no terrain queries or destination state.
// steerFromHit({px, pz}, {hx, hz}, {dead, side}, out?) -> source axes (x right+, y world -Z).
// rayPlaneHit(origin, dir, y, out?) -> {x, y, z} or null for invalid / parallel / behind rays.
// Optional output objects let the runtime reuse its scratch space every frame.
export function steerFromHit(player, hit, { dead = 0.6, side = false } = {}, out = { x: 0, y: 0 }) {
  out.x = out.y = 0;
  const dx = hit.hx - player.px, dz = hit.hz - player.pz;
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return out;
  const m = side ? Math.abs(dx) : Math.hypot(dx, dz);
  if (m <= dead || m === 0) return out;
  out.x = side ? Math.sign(dx) : dx / m;
  out.y = side ? 0 : -dz / m || 0;
  return out;
}

export function rayPlaneHit(origin, dir, y, out = { x: 0, y: 0, z: 0 }) {
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y) || !Number.isFinite(origin.z) ||
      !Number.isFinite(dir.x) || !Number.isFinite(dir.y) || !Number.isFinite(dir.z) || !Number.isFinite(y) || Math.abs(dir.y) < 1e-8) return null;
  const t = (y - origin.y) / dir.y;
  if (!Number.isFinite(t) || t < 0) return null;
  const x = origin.x + dir.x * t, z = origin.z + dir.z * t;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  out.x = x; out.y = y; out.z = z;
  return out;
}
