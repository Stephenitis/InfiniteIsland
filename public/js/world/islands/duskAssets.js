// Cached merged geometry for Duskcrown's giant and titan mushrooms (Step 69c). Built once per session (never disposed, like emberAssets.js); the shapes come from MUSH in duskPlacement.js.
//
//   getMushroom(kind) -> { geo, outlineGeo, info }     kind = 'giant-a' | 'giant-b' | 'titan'
//     geo          ONE non-indexed geometry: position, normal, uv, color and `aRole` (the role of each vertex, read by the glow / fade shader in duskVisuals.js):
//                    0 stem (never fades, no glow)   1 cap skin (fades)   2 warm glow: the rim and the pores / spots on top (fades, emissive)
//                    3 (unused)   4 underside bulbs: flat glowing patches in the gill dome (fades, emissive, no outline hull)   5 the little violet mushrooms round the base (no fade, violet emissive)   6 ground light pool (duskVisuals.js)
//     outlineGeo   the welded, smooth-normal inverted-hull geometry with `aRole` = 1 for hull vertices that belong to the fading cap (the hull dithers out with it), else 0
//   buildPoolGeometry(items, heightAt) -> one merged geometry of conforming disc fans (role 6, uv = the unit-disc coordinate) for every item { x, z, capR, kind }
//
// Style: chunky, indigo / periwinkle caps with glowing orange-red rims, pores and gills, pale lavender fibrous stems that flare at the base, tiered side caps, a few glowing violet minis.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, part } from '../../render/geo.js';
import { DUSK_FLORA } from '../../config.js';
import { mulberry32 } from '../../utils/rng.js';
import { MUSH, RIM_LIFT } from './duskPlacement.js';

const C = Object.fromEntries(Object.entries(DUSK_FLORA.colors).map(([k, v]) => [k, new THREE.Color(v)]));
const _c = new THREE.Color();
const withRole = (g, role) => { g.setAttribute('aRole', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(role), 1)); return g; };

/** A lathe about Y through `profile` [[r, y], ...] (bottom to top = outward normals). colorAt(j, i) / roleAt(j) give each profile point's colour / role (i = the angular column). */
function lathe(profile, segs, colorAt, roleAt) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  const P = profile.length, n = g.attributes.position.count;
  const col = new Float32Array(n * 3), role = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const i = Math.floor(k / P), j = k % P;
    colorAt(j, i, _c);
    col[k * 3] = _c.r; col[k * 3 + 1] = _c.g; col[k * 3 + 2] = _c.b;
    role[k] = roleAt(j);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aRole', new THREE.BufferAttribute(role, 1));
  return g.toNonIndexed();
}

/** Stem radius at height y (flared foot easing into the shaft, a gentle taper). */
const stemRadius = (m, y) => (m.stemR * (0.94 + 0.06 * Math.min(1, Math.max(0, y) / m.stemH)) + (m.baseR - m.stemR) * Math.exp(-Math.max(0, y) / (0.14 * m.stemH + 0.3))) * (y < 0 ? 1.08 : 1);

function stemGeo(m) {
  const H = m.stemH, ys = [-0.45, 0, 0.3, 0.75, 1.4, 0.3 * H, 0.55 * H, 0.8 * H, H, H + 0.3].filter((y, i, a) => y < H + 0.3 || i === a.length - 1).sort((a, b) => a - b);
  const prof = ys.map((y) => [y > H ? stemRadius(m, H) * 0.8 : stemRadius(m, y), y]);
  ys.push(H + 0.32); prof.push([0, H + 0.32]);                                // closed top: a fully faded cap shows a solid stem end, not a hollow tube
  return lathe(prof, 10, (j, i, c) => {
    const y = ys[j], t = Math.min(1, Math.max(0, y / 2.2));
    c.copy(C.stemDark).lerp(C.stem, t * t * (3 - 2 * t));
    if (y > H - 0.8) c.lerp(C.under, 0.1);                                   // a warm blush under the cap
    if (i % 3 === 0 && y > 0.4) c.lerp(C.stemLight, 0.7);                     // lighter fibrous vertical streaks
    return c;
  }, () => 0);
}

/** The underside's sag below the rim plane as a fraction of the bulge depth, by u = radius / R (0 at the stem, 1 at the rim): a convex, rounded gill dome that hangs below the cap. */
const SAG = [[0, 1], [0.3, 0.93], [0.58, 0.72], [0.8, 0.46], [0.92, 0.22], [0.985, 0.03]];
const sagAt = (u) => { for (let i = 1; i < SAG.length; i++) if (u <= SAG[i][0]) { const [u0, v0] = SAG[i - 1], [u1, v1] = SAG[i]; return v0 + (v1 - v0) * (u - u0) / (u1 - u0); } return 0; };

/** A cap: a deep convex DARK gill dome bulging below the rim (depth D), a glowing rim, then the domed indigo skin. yU = the rim-plane height under the stem; R the radius; H the rise of the dome. */
function capGeo(R, H, yU, segs, tint = 0, D = 0.5) {
  const prof = SAG.map(([u, v]) => [u * R, yU - D * v]);
  prof.push([R, yU + RIM_LIFT]);
  const thetas = [8, 28, 48, 66, 80, 90];     // the first row hugs the rim: the warm edge band is thin
  const base = yU + RIM_LIFT;
  for (const th of thetas) { const a = th * Math.PI / 180; prof.push([Math.max(0, R * Math.cos(a)), base + H * Math.sin(a)]); }
  const nU = SAG.length, roles = prof.map((_, j) => (j === nU ? 2 : 1));
  return lathe(prof, segs, (j, i, c) => {
    if (j < nU) { c.copy(C.gill).lerp(C.gillLight, (i % 2 ? 0.55 : 0.1) * (0.4 + j / nU)); }       // dark blue-violet gills with subtle streaks, no glow
    else if (j === nU) c.copy(C.rim);          // a dim, darker orange-red edge: the bulbs are the main warm accent
    else { const t = (thetas[j - nU - 1] - 8) / 82; c.copy(C.capLight).lerp(C.capDeep, Math.pow(t, 0.8)); if (tint > 0.5) c.lerp(C.violet, 0.12); if (i % 3 === 0) c.multiplyScalar(0.96); }
    return c;
  }, (j) => roles[j]);
}

/** Flat, smooth, glowing oval patches set INTO the gill dome (flush, barely raised, following its curvature), wider than tall, two rings round the stem, a seeded colour per bulb
 *  between a yellower orange and a darker orange, bright core fading to the dome at the edge. Role 4 (own glow strength, fades with the cap, NOT in the outline hull). */
function bulbs(R, yU, D, count, rng, big = 1) {
  const out = [], rings = 4, segs = 16, edge = new THREE.Color();
  const wide = count > 8 ? 0.15 : 0.2;
  for (let k = 0; k < count; k++) {
    const ring = k % 3 ? 1 : 0, u0 = ring ? 0.87 : 0.6, phi = (k / count) * Math.PI * 2 + rng() * 0.35;
    const a = R * wide * (0.9 + 0.25 * rng()) * big, b = a * (ring ? 0.8 : 0.75);     // half width (along the rim) / half length (radial: the outer ring sits on the steep flank the camera sees)
    const hue = Math.pow(rng(), 0.8), base = new THREE.Color().copy(C.bulbDark).lerp(C.bulbLight, hue), core = new THREE.Color().copy(base).lerp(C.bulbCore, 0.6);
    edge.copy(base).lerp(C.gill, 0.8);
    const cp = Math.cos(phi), sp = -Math.sin(phi);                                   // outward (radial) direction in x / z, tangent = (-sp, cp)
    const P = (rho, th) => {                                                         // a point of the patch: rho 0..1, th angle
      const t = Math.cos(th) * a * rho, n = Math.sin(th) * b * rho;
      const rr = Math.min(0.975 * R, u0 * R + n);
      const x = cp * rr - sp * t, z = sp * rr + cp * t;
      const rad = Math.hypot(x, z) / R;
      return [x, yU - D * sagAt(Math.min(0.98, rad)) - 0.05 - 0.07 * (1 - rho * rho), z];            // just below the surface (outward = down), a lens-shaped swell
    };
    const pts = [], cols = [], idx = [];
    const push = (p, rho) => { pts.push(p); const c = rho < 0.6 ? new THREE.Color().copy(core).lerp(base, rho / 0.6) : new THREE.Color().copy(base).lerp(edge, (rho - 0.6) / 0.4); cols.push(c); };
    push(P(0, 0), 0);
    for (let r = 1; r <= rings; r++) for (let s = 0; s < segs; s++) push(P(r / rings, (s / segs) * Math.PI * 2), r / rings);
    for (let s = 0; s < segs; s++) idx.push(0, 1 + s, 1 + ((s + 1) % segs));
    for (let r = 1; r < rings; r++) for (let s = 0; s < segs; s++) {
      const A = 1 + (r - 1) * segs + s, B = 1 + (r - 1) * segs + ((s + 1) % segs), Cc = 1 + r * segs + s, Dd = 1 + r * segs + ((s + 1) % segs);
      idx.push(A, Cc, B, B, Cc, Dd);
    }
    // the dome faces down: wind the triangles so the face normals point down
    const nrm = new THREE.Vector3().subVectors(new THREE.Vector3(...pts[idx[1]]), new THREE.Vector3(...pts[idx[0]])).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...pts[idx[2]]), new THREE.Vector3(...pts[idx[0]])));
    if (nrm.y > 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    const pos = new Float32Array(idx.length * 3), col = new Float32Array(idx.length * 3);
    idx.forEach((v, i) => { pos.set(pts[v], i * 3); col.set([cols[v].r, cols[v].g, cols[v].b], i * 3); });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(idx.length * 2), 2));
    g.computeVertexNormals();                                                   // non-indexed: flat per triangle; the lens is smooth enough at this density
    out.push(withRole(g, 4));
  }
  return out;
}

/** Glowing pores / spots on the dome, tilted to the surface: p = [x, y, z] on a dome of radius R and rise H (centred over x = z = 0, rim at height `base`). */
function pores(R, H, base, count, rng, sizeScale) {
  const out = [];
  for (let k = 0; k < count; k++) {
    const th = (58 + 30 * rng()) * Math.PI / 180, phi = rng() * Math.PI * 2;
    const rr = R * Math.cos(th), y = base + H * Math.sin(th);
    const nr = Math.cos(th) / R, ny = Math.sin(th) / H, tilt = Math.atan2(nr, ny);       // the ellipse normal: how far the disc leans outward
    const size = (0.045 + 0.045 * rng()) * R * sizeScale;
    out.push(part(G.cyl6, k % 3 === 2 ? C.warmHot : C.warm, { p: [rr * Math.cos(phi), y + 0.03, -rr * Math.sin(phi)], r: [0, phi, -tilt], s: [size, 0.1, size] }));
  }
  return out.map((g) => withRole(g, 2));
}

function minis(m, count, rng, k) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2, d = m.baseR * (1.15 + 0.9 * rng()), h = (0.3 + 0.3 * rng()) * k, r = (0.07 + 0.05 * rng()) * k;
    const x = Math.cos(a) * d, z = -Math.sin(a) * d;
    out.push(withRole(part(G.cyl6, C.stem, { p: [x, h / 2 - 0.05, z], s: [r, h, r] }), 0));
    out.push(withRole(part(G.sphereLo, C.violet, { p: [x, h, z], s: [r * 3.2, r * 1.8, r * 3.2] }), 5));
  }
  return out;
}

function build(kind) {
  const m = MUSH[kind], rng = mulberry32(kind === 'titan' ? 9001 : kind === 'giant-b' ? 9002 : 9003), parts = [];
  const big = kind === 'titan';
  parts.push(stemGeo(m));
  parts.push(capGeo(m.capR, m.capH, m.stemH, big ? 16 : 10, kind === 'giant-b' ? 1 : 0, m.bulge));
  parts.push(...bulbs(m.capR, m.stemH, m.bulge, m.bulbs, rng, big ? 1.1 : 1));
  parts.push(...pores(m.capR, m.capH, m.stemH + RIM_LIFT, big ? 12 : kind === 'giant-b' ? 5 : 4, rng, 1));
  for (const t of m.tiers) {                                               // side caps (shelf fungi) on the stem
    const sr = stemRadius(m, t.y), off = sr + t.r * 0.42, ox = Math.cos(t.a) * off, oz = -Math.sin(t.a) * off;
    const g = capGeo(t.r, t.r * 0.55, 0, 8, 0, 0.03);          // side caps: a flat dark underside (no dome, no bulbs)
    g.translate(ox, t.y, oz);
    parts.push(g);
    parts.push(...pores(t.r, t.r * 0.55, RIM_LIFT, 1, rng, 0.7).map((p) => { p.translate(ox, t.y, oz); return p; }));
  }
  parts.push(...minis(m, big ? 9 : 5, rng, big ? 1.8 : 1));
  for (const p of parts) if (!p.attributes.aRole) throw new Error('mushroom part without role');
  for (const p of parts) { if (p.index) throw new Error('indexed part'); }
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  return { geo, outlineGeo: outlineOf(geo), info: { kind, ...m, top: m.stemH + RIM_LIFT + m.capH } };
}

const q = (x, y, z) => `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
function outlineOf(geo) {
  const pos = geo.attributes.position, role = geo.attributes.aRole, fade = new Set();
  for (let i = 0; i < pos.count; i++) { const r = role.getX(i); if (r > 0.5 && r < 4.5) fade.add(q(pos.getX(i), pos.getY(i), pos.getZ(i))); }
  const keep = [];
  for (let i = 0; i < pos.count; i++) if (role.getX(i) !== 4) keep.push(pos.getX(i), pos.getY(i), pos.getZ(i));   // the flush bulbs get no outline hull
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  const m = mergeVertices(g, 1e-3);
  m.computeVertexNormals();
  const out = new Float32Array(m.attributes.position.count), mp = m.attributes.position;
  for (let i = 0; i < out.length; i++) out[i] = fade.has(q(mp.getX(i), mp.getY(i), mp.getZ(i))) ? 1 : 0;
  m.setAttribute('aRole', new THREE.BufferAttribute(out, 1));
  return m;
}

const cache = new Map();
export function getMushroom(kind) {
  if (!cache.has(kind)) cache.set(kind, build(kind));
  return cache.get(kind);
}

/** One merged mesh of conforming light pools: a fan of rings per item, vertices lifted DUSK_FLORA.poolLift above the terrain, role 6, uv = the unit-disc position (the shader fades it). */
export function buildPoolGeometry(items, heightAt) {
  const R = DUSK_FLORA.poolRings, S = DUSK_FLORA.poolSegs, per = 1 + R * S;
  const pos = new Float32Array(items.length * per * 3), uv = new Float32Array(items.length * per * 2), col = new Float32Array(items.length * per * 3);
  const idx = [];
  items.forEach((it, n) => {
    const rad = it.capR * (it.kind === 'titan' ? 1.05 : 1.15), o = n * per;
    const set = (v, x, z, u, w) => {
      const k = o + v; pos[k * 3] = x; pos[k * 3 + 1] = heightAt(x, z) + DUSK_FLORA.poolLift; pos[k * 3 + 2] = z;
      uv[k * 2] = u; uv[k * 2 + 1] = w; col[k * 3] = C.pool.r; col[k * 3 + 1] = C.pool.g; col[k * 3 + 2] = C.pool.b;
    };
    set(0, it.x, it.z, 0, 0);
    for (let r = 1; r <= R; r++) for (let s = 0; s < S; s++) {
      const a = (s / S) * Math.PI * 2, d = r / R;
      set(1 + (r - 1) * S + s, it.x + Math.cos(a) * rad * d, it.z + Math.sin(a) * rad * d, Math.cos(a) * d, Math.sin(a) * d);
    }
    for (let s = 0; s < S; s++) idx.push(o, o + 1 + ((s + 1) % S), o + 1 + s);        // the centre fan (counter-clockwise seen from above)
    for (let r = 1; r < R; r++) for (let s = 0; s < S; s++) {
      const a = o + 1 + (r - 1) * S + s, b = o + 1 + (r - 1) * S + ((s + 1) % S), c = o + 1 + r * S + s, d = o + 1 + r * S + ((s + 1) % S);
      idx.push(a, b, c, b, d, c);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const nrm = new Float32Array(pos.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('aRole', new THREE.BufferAttribute(new Float32Array(items.length * per).fill(6), 1));
  g.setAttribute('iInst', new THREE.BufferAttribute(new Float32Array(items.length * per * 2), 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
