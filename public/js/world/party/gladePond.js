// A shallow, grounded side pond. Cut its convex outer bank out of the meadow mesh,
// then fill that opening with a coloured bowl. Water sits between the bowl and turf.
import * as THREE from 'three';

export const GLADE_POND = Object.freeze({ x: -15, z: -14.5, rx: 2.6, rz: 3.1, waterY: -0.045, waterR: 0.63, segments: 64 });
export const pondRadius = (x, z) => Math.hypot((x - GLADE_POND.x) / GLADE_POND.rx, (z - GLADE_POND.z) / GLADE_POND.rz);
export function pondOutline() {
  const p = GLADE_POND;
  return Array.from({ length: p.segments }, (_, i) => {
    const a = i / p.segments * Math.PI * 2;
    return { x: p.x + Math.cos(a) * p.rx, z: p.z + Math.sin(a) * p.rz };
  });
}

/** Convex polygon subtraction, preserving the interpolated position/normal/UV/colour.
 * Most terrain triangles are far away and copied unchanged. Consumes the input geometry. */
export function cutPond(g) {
  const p = GLADE_POND, outline = pondOutline(), names = Object.keys(g.attributes);
  const sizes = names.map(n => g.attributes[n].itemSize), offsets = [];
  let stride = 0; for (const size of sizes) { offsets.push(stride); stride += size; }
  const pi = offsets[names.indexOf('position')], output = names.map(() => []);
  const vertex = i => names.flatMap(n => {
    const a = g.attributes[n]; return Array.from({ length: a.itemSize }, (_, k) => a.array[i * a.itemSize + k]);
  });
  function emit(poly) {
    for (let i = 1; i < poly.length - 1; i++) for (const v of [poly[0], poly[i], poly[i + 1]])
      sizes.forEach((size, j) => { for (let k = 0; k < size; k++) output[j].push(v[offsets[j] + k]); });
  }
  function split(poly, a, b) {
    const inside = [], outside = [];
    const d = v => (b.x - a.x) * (v[pi + 2] - a.z) - (b.z - a.z) * (v[pi] - a.x);
    for (let i = 0; i < poly.length; i++) {
      const u = poly[i], v = poly[(i + 1) % poly.length], du = d(u), dv = d(v);
      (du >= 0 ? inside : outside).push(u);
      if ((du >= 0) !== (dv >= 0)) {
        const t = du / (du - dv), at = u.map((x, k) => x + (v[k] - x) * t);
        inside.push(at); outside.push(at);
      }
    }
    return { inside, outside };
  }
  const n = g.index ? g.index.count : g.attributes.position.count;
  for (let i = 0; i < n; i += 3) {
    let poly = [0, 1, 2].map(k => vertex(g.index ? g.index.getX(i + k) : i + k));
    if (poly.every(v => v[pi] < p.x - p.rx) || poly.every(v => v[pi] > p.x + p.rx) ||
        poly.every(v => v[pi + 2] < p.z - p.rz) || poly.every(v => v[pi + 2] > p.z + p.rz)) { emit(poly); continue; }
    for (let j = 0; j < outline.length && poly.length >= 3; j++) {
      const { inside, outside } = split(poly, outline[j], outline[(j + 1) % outline.length]);
      if (outside.length >= 3) emit(outside);
      poly = inside;
    }
  }
  const cut = new THREE.BufferGeometry();
  names.forEach((name, j) => cut.setAttribute(name, new THREE.Float32BufferAttribute(output[j], sizes[j])));
  g.dispose(); return cut;
}

/** Outer edge matches the hole exactly; sandy shoulders slope into a muddy basin. */
export function pondBank() {
  const p = GLADE_POND, pos = [], col = [], uv = [], index = [], rings = 12;
  const grass = new THREE.Color('#8fe36b'), sand = new THREE.Color('#b6aa7b'), mud = new THREE.Color('#776e50');
  for (let r = 0; r <= rings; r++) for (let i = 0; i < p.segments; i++) {
    const f = r / rings, a = i / p.segments * Math.PI * 2, x = p.x + Math.cos(a) * p.rx * f, z = p.z + Math.sin(a) * p.rz * f;
    const y = f < p.waterR ? -0.22 + (0.22 + p.waterY) * Math.pow(f / p.waterR, 2) : p.waterY * (1 - THREE.MathUtils.smoothstep(f, p.waterR, 1));
    pos.push(x, y, z); uv.push(i / p.segments, f);
    const c = mud.clone().lerp(sand, THREE.MathUtils.smoothstep(f, 0.55, 0.82)).lerp(grass, THREE.MathUtils.smoothstep(f, 0.82, 1));
    c.multiplyScalar(0.98 + Math.sin(x * 0.8) * Math.cos(z * 0.67) * 0.025); col.push(c.r, c.g, c.b);
    if (r) { const k = r * p.segments + i, l = r * p.segments + (i + 1) % p.segments; index.push(k - p.segments, l, k, k - p.segments, l - p.segments, l); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index); g.computeVertexNormals();
  const flat = g.toNonIndexed(); g.dispose(); return flat;
}
