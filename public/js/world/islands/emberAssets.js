// Cached merged toon geometry for Emberleaf's chunked props and harvest animation proxies.
import * as THREE from 'three';
import { G, part, combine, smoothOutlineGeo, makeOutline, VERTEX_TOON } from '../../render/geo.js';

const leaf = (x, y, z, a, size = 1, color = '#39b864') => part(G.sphereLo, color, { p: [x, y, z], r: [0, -a, -0.25], s: [1.5 * size, 0.12 * size, 0.46 * size] });
export function fruitGeometry(kind) {
  const p = [];
  if (kind === 'banana') {
    for (let i = 0; i < 3; i++) {
      const g = new THREE.TorusGeometry(0.18, 0.055, 5, 9, Math.PI * 0.85);
      p.push(part(g, '#ffda57', { p: [i * 0.085 - 0.08, 0.23, 0], r: [0.3, i * 0.2, 2.9] })); g.dispose();
    }
  } else if (kind === 'bamboo') {
    for (let i = 0; i < 3; i++) {
      p.push(part(G.cyl6, '#85bf4e', { p: [i * 0.11 - 0.11, 0.26, 0], r: [0, 0, 0.2], s: [0.05, 0.5, 0.05] }));
      for (const y of [0.12, 0.28, 0.44]) p.push(part(G.cyl6, '#d8e989', { p: [i * 0.11 - 0.11, y, 0], s: [0.055, 0.025, 0.055] }));
    }
  } else if (kind === 'obsidian') {
    p.push(part(G.ico1, '#34304f', { p: [0, 0.19, 0], s: [0.23, 0.24, 0.17] }));
    p.push(part(G.cone6, '#a995d6', { p: [0.07, 0.35, 0.02], r: [0, 0, -0.2], s: [0.08, 0.16, 0.06] }));
  } else {
    const pineapple = kind === 'pineapple', taro = kind === 'taro';
    p.push(part(G.ico1, pineapple ? '#efb743' : taro ? '#a67da3' : '#97cb58', { p: [0, 0.22, 0], s: [0.22, pineapple ? 0.3 : 0.22, 0.22] }));
    if (pineapple) {
      for (let i = 0; i < 7; i++) p.push(part(G.cone6, '#309d54', { p: [Math.cos(i) * 0.06, 0.59, Math.sin(i) * 0.06], r: [0.25 * Math.sin(i), 0, 0.25 * Math.cos(i)], s: [0.05, 0.28, 0.05] }));
      for (let i = 0; i < 12; i++) p.push(part(G.ico1, '#d58c32', { p: [Math.cos(i * 2.4) * 0.19, 0.08 + (i % 4) * 0.1, Math.sin(i * 2.4) * 0.19], s: [0.045, 0.045, 0.045] }));
    } else p.push(part(G.cyl6, '#825834', { p: [0, 0.47, 0], s: [0.035, 0.13, 0.035] }));
  }
  return combine(p);
}

function tree(kind) {
  const p = [];
  if (kind === 'bamboo') {
    for (let i = 0; i < 5; i++) {
      const x = Math.cos(i * 2.4) * 0.4, z = Math.sin(i * 2.4) * 0.4, h = 3 + i * 0.3;
      p.push(part(G.cyl6, i % 2 ? '#63ad49' : '#85bf4e', { p: [x, h / 2, z], s: [0.13, h, 0.13] }));
      for (let y = 0.45; y < h; y += 0.65) p.push(part(G.cyl6, '#c5dd86', { p: [x, y, z], s: [0.15, 0.065, 0.15] }));
      p.push(leaf(x + 0.3, h - 0.4, z, i, 0.5));
    }
  } else if (kind === 'coconut' || kind === 'banana') {
    const banana = kind === 'banana', top = banana ? 3.3 : 4.9;
    p.push(part(G.cyl8, banana ? '#91ad4f' : '#aa7850', { p: [0, top / 2, 0], r: [0, 0, -0.13], s: [banana ? 0.34 : 0.26, top, banana ? 0.34 : 0.26] }));
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7;
      p.push(leaf(Math.cos(a) * 1.05 + 0.4, top, Math.sin(a) * 1.05, a, banana ? 1.2 : 1));
    }
    if (banana) {
      const g = fruitGeometry('banana'); p.push(part(g, '#ffffff', { p: [0.6, 2.7, 0.3], s: [2, 2, 2] })); g.dispose();
    } else for (let i = 0; i < 3; i++) p.push(part(G.ico1, '#8b5838', { p: [0.2 + i * 0.26, top - 0.35, 0.2], s: [0.28, 0.3, 0.28] }));
  } else {
    p.push(part(G.cyl8, '#926440', { p: [0, 1.6, 0], s: [0.45, 3.4, 0.45] }));
    for (const [x, y, z, s] of [[0, 4.2, 0, 2.2], [1.5, 3.7, 0.6, 1.5], [-1.3, 3.8, -0.7, 1.6]]) p.push(part(G.ico1, kind === 'breadfruit' ? '#66b948' : '#299b53', { p: [x, y, z], s: [s, s * 0.65, s] }));
    if (kind === 'breadfruit') for (let i = 0; i < 5; i++) p.push(part(G.ico1, '#b4d86a', { p: [Math.cos(i) * 1.3, 3.1, Math.sin(i) * 1.3], s: [0.34, 0.4, 0.34] }));
    // Hanging vines are part of the merged tree, so they add no draw calls.
    if (kind === 'jungle') for (let i = 0; i < 3; i++) {
      p.push(part(G.cyl6, '#448d43', { p: [Math.cos(i * 2) * 1.6, 2.8, Math.sin(i * 2) * 1.6], s: [0.04, 2.6, 0.04] }));
      p.push(leaf(Math.cos(i * 2) * 1.6, 1.8, Math.sin(i * 2) * 1.6, i, 0.28));
    }
  }
  return combine(p);
}
function decoration(kind) {
  const p = [];
  if (kind === 'basalt') return combine([part(G.ico1, '#454051', { s: [1, 0.9, 0.95] }), part(G.ico1, '#665c70', { p: [-0.35, 0.45, 0.1], s: [0.55, 0.45, 0.6] })]);
  if (kind === 'pineapple') { const g = fruitGeometry(kind); g.scale(1.6, 1.6, 1.6); return g; }
  if (kind === 'fern') for (let i = 0; i < 9; i++) { const a = i * Math.PI * 2 / 9; p.push(leaf(Math.cos(a) * 0.5, 0.55, Math.sin(a) * 0.5, a, 0.65, i % 2 ? '#45b86b' : '#298e56')); }
  else if (kind === 'hibiscus' || kind === 'plumeria') {
    p.push(part(G.cyl6, '#3ca254', { p: [0, 0.32, 0], s: [0.04, 0.65, 0.04] }));
    for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; p.push(part(G.sphereLo, kind === 'hibiscus' ? '#ff7083' : '#fff0da', { p: [Math.cos(a) * 0.18, 0.65, Math.sin(a) * 0.18], s: [0.19, 0.06, 0.19] })); }
    p.push(part(G.sphereLo, '#ffd35c', { p: [0, 0.72, 0], s: [0.09, 0.07, 0.09] }));
  } else if (kind === 'tiki') {
    p.push(part(G.cyl8, '#b4804f', { p: [0, 1, 0], s: [0.65, 2.1, 0.65] }));
    for (const x of [-0.23, 0.23]) { p.push(part(G.sphereLo, '#ffe7af', { p: [x, 1.35, 0.59], s: [0.16, 0.17, 0.08] })); p.push(part(G.sphereLo, '#2b2340', { p: [x, 1.34, 0.66], s: [0.06, 0.08, 0.03] })); }
    p.push(part(G.sphereLo, '#2b2340', { p: [0, 0.87, 0.59], s: [0.28, 0.13, 0.07] }));
    p.push(part(G.sphereLo, '#fff0da', { p: [0, 0.92, 0.65], s: [0.22, 0.055, 0.03] }));
  } else if (kind === 'canoe') {
    p.push(part(G.sphereLo, '#a46c42', { p: [0, 0.3, 0], s: [2.7, 0.35, 0.65] }));
    p.push(part(G.sphereLo, '#513b39', { p: [0, 0.53, 0], s: [2.25, 0.09, 0.44] }));
    for (const x of [-0.9, 0.9]) p.push(part(G.cyl6, '#d9a367', { p: [x, 0.56, 0], r: [Math.PI / 2, 0, 0], s: [0.1, 1.1, 0.1] }));
    p.push(part(G.cyl6, '#e1bb82', { p: [0, 0.65, 0], r: [0, 0, 1.1], s: [0.07, 3.5, 0.07] }));
    p.push(part(G.sphereLo, '#e1bb82', { p: [1.6, 0.05, 0], r: [0, 0, -0.4], s: [0.55, 0.13, 0.25] }));
  }
  return combine(p);
}
export const TREE_INFO = Object.fromEntries(['banana', 'coconut', 'jungle', 'breadfruit', 'bamboo'].map((k) => [k, { crownY: k === 'banana' ? 3.3 : 4.2, crownR: 1.7, promptY: 5 }]));
const cache = new Map();
export function getAsset(key) {
  if (!cache.has(key)) { const geo = TREE_INFO[key] ? tree(key) : decoration(key); cache.set(key, { geo, outlineGeo: smoothOutlineGeo(geo), thickness: 0.045 }); }
  return cache.get(key);
}
export function makeProxyMesh(key) {
  const a = getAsset(key), mesh = new THREE.Mesh(a.geo, VERTEX_TOON);
  mesh.add(makeOutline(a.geo, a.thickness, a.outlineGeo)); mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
