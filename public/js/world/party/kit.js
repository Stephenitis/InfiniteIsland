// Stage-building kit for the Party Glade (Step 80a): tiny helpers so the lobby and every game stage are a handful of merged, vertex-coloured, outlined meshes (render/geo.js) with no new shader program.
//
//   solid(parts, { outline, cast, receive })      parts = [part(...)] -> a Mesh on VERTEX_TOON (+ an inverted-hull outline child)
//   glow(parts)                                   an UNLIT vertex-coloured mesh (glowing vines, petals, ring paint): MeshBasicMaterial
//   disc(r, color, p, h)  ring(r0, r1, color, p, h)  flat discs / rings as parts (a cylinder `h` tall whose TOP is at p[1])
//   box(w, h, d, color, p, r)  post(r, h, color, p)  ball(r, color, p, s)  cone(r, h, color, p, r)   common primitives as parts
//   bunting(from, to, sag, n, colors)             a string of pennants as parts (the lobby's decoration)
//   floatLabels(hudRoot)                          a pool of DOM labels that rise from a world point ("Bramble's Bite!", "+1 star")
import * as THREE from 'three';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../../render/geo.js';

const CYL = new THREE.CylinderGeometry(1, 1, 1, 40, 1);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const RING_CACHE = new Map();

export const disc = (r, color, p = [0, 0, 0], h = 0.2) => part(CYL, color, { p: [p[0], p[1] - h / 2, p[2]], s: [r, h, r] });
export function ring(r0, r1, color, p = [0, 0, 0], h = 0.2) {
  const key = `${r0}|${r1}`;
  let g = RING_CACHE.get(key);
  if (!g) {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, r1, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, r0, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 40 });
    g.rotateX(-Math.PI / 2);                                // extrude along +y; the shape lies in xz
    RING_CACHE.set(key, g);
  }
  return part(g, color, { p: [p[0], p[1] - h, p[2]], s: [1, h, 1] });
}
export const box = (w, h, d, color, p = [0, 0, 0], r = [0, 0, 0]) => part(BOX, color, { p: [p[0], p[1] + h / 2, p[2]], r, s: [w, h, d] });
export const post = (r, h, color, p = [0, 0, 0]) => part(G.cyl8, color, { p: [p[0], p[1] + h / 2, p[2]], s: [r, h, r] });
export const ball = (r, color, p = [0, 0, 0], s = [1, 1, 1]) => part(G.sphere, color, { p, s: [r * s[0], r * s[1], r * s[2]] });
export const cone = (r, h, color, p = [0, 0, 0], rot = [0, 0, 0]) => part(G.cone6, color, { p: [p[0], p[1] + h / 2, p[2]], r: rot, s: [r, h, r] });

/** One merged mesh from parts (the parts are consumed). */
export function solid(parts, { outline = 0.04, cast = true, receive = true } = {}) {
  const geo = combine(parts);
  const mesh = new THREE.Mesh(geo, VERTEX_TOON);
  mesh.castShadow = cast; mesh.receiveShadow = receive;
  if (outline > 0) mesh.add(makeOutline(geo, outline));
  return mesh;
}

const _glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
export function glow(parts, { transparent = false, opacity = 1, additive = false } = {}) {
  const geo = combine(parts);
  const mat = transparent || additive ? new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }) : _glowMat;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false; mesh.receiveShadow = false;
  return mesh;
}

const TRI = new THREE.ConeGeometry(1, 1, 3);
/** A sagging string from a to b ([x, y, z]) with n pennants hanging from it (parts: a thin string of balls + triangles). */
export function bunting(a, b, sag, n, colors) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, x = a[0] + (b[0] - a[0]) * u, z = a[2] + (b[2] - a[2]) * u;
    const y = a[1] + (b[1] - a[1]) * u - Math.sin(u * Math.PI) * sag;
    parts.push(part(TRI, colors[i % colors.length], { p: [x, y - 0.32, z], r: [0, 0, Math.PI], s: [0.3, 0.64, 0.05] }));
  }
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps, x = a[0] + (b[0] - a[0]) * u, z = a[2] + (b[2] - a[2]) * u, y = a[1] + (b[1] - a[1]) * u - Math.sin(u * Math.PI) * sag;
    parts.push(part(G.sphereLo, '#6b4a5e', { p: [x, y, z], s: [0.05, 0.05, 0.05] }));
  }
  return parts;
}

/** A pool of DOM labels that rise from a world point and fade: label(text, {x, y, z}, color). update(dt, camera) each frame. */
export function floatLabels(root, { pool = 10, life = 1.4 } = {}) {
  const els = [];
  for (let i = 0; i < pool; i++) {
    const el = document.createElement('div');
    el.className = 'party-float';
    el.hidden = true;
    root.appendChild(el);
    els.push({ el, age: 99, at: new THREE.Vector3() });
  }
  const v = new THREE.Vector3();
  return {
    label(text, at, color = '#fff') {
      const s = els.find((e) => e.age >= life) || els.reduce((a, b) => (a.age > b.age ? a : b));
      s.age = 0; s.at.set(at.x, at.y, at.z);
      s.el.textContent = text; s.el.style.color = color; s.el.hidden = false;
    },
    update(dt, camera) {
      const w = window.innerWidth, h = window.innerHeight;
      for (const s of els) {
        if (s.age >= life) { if (!s.el.hidden) s.el.hidden = true; continue; }
        s.age += dt;
        v.copy(s.at); v.y += s.age * 0.9; v.project(camera);
        if (v.z > 1) { s.el.hidden = true; continue; }
        s.el.style.transform = `translate3d(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px, 0) translate(-50%, -50%)`;
        s.el.style.opacity = String(Math.max(0, Math.min(1, (life - s.age) / 0.35)));
      }
    },
    clear() { for (const s of els) { s.age = 99; s.el.hidden = true; } },
  };
}
