// Party-only small-prop / distant-tree LODs. Preserve the island palettes and broad
// silhouettes without copying hundreds of hidden sphere faces into merged scenery.
// Cached geometry is borrowed, just like the island asset caches; never dispose it.
import * as THREE from 'three';
import { part, combine } from '../../render/geo.js';

const cache = new Map();
const CONE = new THREE.ConeGeometry(1, 1, 6);
const TRUNK = new THREE.CylinderGeometry(0.8, 1, 1, 5);
const BLOB = new THREE.IcosahedronGeometry(1, 0);
const STONE = new THREE.OctahedronGeometry(1, 0);
const PALETTE = { flowerPink: '#ff8fbe', flowerWhite: '#fff6ee', flowerYellow: '#ffda57', flowerPurple: '#b59bff' };

function planes(kind) {
  const pos = [], col = [];
  function face(a, b, c, color, both = false) {
    const tint = new THREE.Color(color);
    for (const tri of both ? [[a, b, c], [c, b, a]] : [[a, b, c]]) for (const p of tri) { pos.push(...p); col.push(tint.r, tint.g, tint.b); }
  }
  if (kind === 'grass') {
    for (let i = 0; i < 4; i++) {
      const a = i * 2.1, h = [0.75, 0.6, 0.85, 0.5][i], dx = Math.cos(a), dz = Math.sin(a);
      face([-dz * 0.08, 0, dx * 0.08], [dz * 0.08, 0, -dx * 0.08], [dx * 0.23, h, dz * 0.23], i % 2 ? '#7ad86c' : '#4fb85a', true);
    }
  } else if (kind === 'leaf') {
    face([-1, 0, 0], [0, 0, 1], [1, 0, 0], '#b8b66e');
    face([-1, 0, 0], [1, 0, 0], [0, 0, -1], '#a2a460');
  } else {
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
      const root = [dx * 0.04, 0.44, dz * 0.04], tip = [dx * 0.3, 0.43, dz * 0.3];
      face(root, tip, [dx * 0.2 + dz * 0.1, 0.45, dz * 0.2 - dx * 0.1], PALETTE[kind]);
      face(root, [dx * 0.2 - dz * 0.1, 0.45, dz * 0.2 + dx * 0.1], tip, PALETTE[kind]);
      const b = (i + 1) / 5 * Math.PI * 2;
      face([0, 0.47, 0], [Math.cos(b) * 0.09, 0.46, Math.sin(b) * 0.09], [dx * 0.09, 0.46, dz * 0.09], '#ffd93b');
    }
    face([-0.02, 0, 0], [0.02, 0, 0], [0, 0.44, 0], '#4fb85a', true);
    face([0, 0, -0.02], [0, 0, 0.02], [0, 0.44, 0], '#4fb85a', true);
    face([0, 0.15, 0], [0.14, 0.23, 0.05], [0.05, 0.2, -0.04], '#63cf6a', true);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.computeVertexNormals(); return g;
}

function tree(kind) {
  const parts = [];
  const blob = (x, y, z, rx, ry, color) => parts.push(part(BLOB, color, { p: [x, y, z], s: [rx, ry, rx] }));
  const trunk = (h, r, color) => parts.push(part(TRUNK, color, { p: [0, h / 2, 0], s: [r, h, r] }));
  if (kind === 'bush') {
    blob(0, 0.6, 0, 0.95, 0.78, '#4fbf5f'); blob(-0.6, 0.4, 0.25, 0.72, 0.57, '#73d564'); blob(0.65, 0.4, -0.2, 0.68, 0.56, '#389c58');
  } else if (['coconut', 'banana', 'jungle', 'breadfruit'].includes(kind)) {
    const palm = kind === 'coconut' || kind === 'banana';
    trunk(palm ? 4.2 : 3, 0.28, '#a9814f');
    if (palm) for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2;
      parts.push(part(BLOB, i % 2 ? '#4aab63' : '#69c96b', { p: [Math.cos(a) * 1.35, 4.25, Math.sin(a) * 1.35], r: [0, -a, 0.15], s: [1.85, 0.2, 0.48] }));
    } else { blob(0, 3.7, 0, 2, 1.6, '#348c59'); blob(-1, 4.6, 0.4, 1.4, 1.3, '#52b96a'); }
  } else if (kind === 'oak' || kind === 'birch') {
    const birch = kind === 'birch'; trunk(birch ? 3.4 : 2.5, birch ? 0.27 : 0.4, birch ? '#f1ece0' : '#8a5a3a');
    const y = birch ? 4.1 : 3.15;
    blob(0, y, 0, birch ? 1.6 : 1.75, birch ? 1.25 : 1.47, birch ? '#b6d457' : '#58ba62');
    blob(1.05, y - 0.45, 0.4, 1.15, 0.95, birch ? '#a3c64a' : '#3d9f57');
    blob(-1.1, y - 0.4, -0.5, 1.2, 1, birch ? '#c4de62' : '#6dcb75');
    blob(0.2, birch ? 5 : 4.5, -0.2, 1, 0.85, birch ? '#d6e978' : '#8cdb8e');
  } else {
    trunk(kind === 'pine' ? 2 : 1.3, 0.34, '#8a5a3a');
    const tiers = kind === 'pine'
      ? [[2.35, 1.7, 2, '#3b8a46'], [3.45, 1.5, 1.6, '#459a52'], [4.45, 1.35, 1.15, '#53ad60']]
      : [[1.75, 1.9, 1.5, '#25725a'], [3.15, 2.1, 1.15, '#2b7e60'], [4.55, 2, 0.82, '#329067'], [5.9, 1.4, 0.5, '#4ab27c']];
    for (const [y, h, r, color] of tiers) parts.push(part(CONE, color, { p: [0, y, 0], s: [r, h, r] }));
    if (kind === 'pine') {
      blob(0, 5.15, 0, 0.62, 0.7, '#66c070');
      parts.push(part(CONE, '#f4f8ff', { p: [0, 4.84, 0], s: [0.575, 0.675, 0.575] }));
    }
    else parts.push(part(CONE, '#f4f8ff', { p: [0, 6.15, 0], s: [0.35, 0.9, 0.35] }));
  }
  return combine(parts);
}

export function lowDecorAsset(kind) {
  if (!cache.has(kind)) cache.set(kind, kind === 'pebble' ? STONE
    : kind === 'grass' || kind === 'leaf' || kind in PALETTE ? planes(kind) : tree(kind));
  return cache.get(kind);
}
