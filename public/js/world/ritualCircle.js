import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RITUAL } from './islands/ritual.js';
import { getHeight } from './terrain.js';
import { toonMat, addOutline } from '../render/toon.js';
import { addCollider } from './colliders.js';
import { addInteractable } from './interactables.js';
import { G, part, combine, VERTEX_TOON } from '../render/geo.js';

/** Permanent ritual site; standing stones are distinct from destructible harvest rocks. */
export function createRitualCircle(parent) {
  const root = new THREE.Group();
  root.name = 'ritual-circle';
  parent.add(root);
  const runeMat = toonMat('#a5efd7', { emissive: '#59bdac', emissiveIntensity: 0.55 });
  const parts = [];
  const c = RITUAL.circle;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI * 2 / 24;
    const x = c.x + Math.cos(a) * c.radius, z = c.z + Math.sin(a) * c.radius;
    const y = getHeight(x, z);
    parts.push(part(G.sphereLo, i % 3 ? '#a6a5bb' : '#939ca4', {
      p: [x, y + 0.09, z], s: [0.47, 0.17, 0.41], r: [0, a, 0],
    }));
    if (i % 3 === 0) parts.push(part(G.sphereLo, '#668e63', {
      p: [x + 0.08, y + 0.23, z], s: [0.3, 0.035, 0.22],
    }));
  }
  // Deliberate edge clusters preserve the ritual clearing and access to every standing stone.
  const clusters = [
    [-54.7, 44.5], [-53.9, 47.8], [-50.4, 49], [-46, 49.3],
    [-41.9, 46.7], [-42.2, 42.6], [-46.6, 36.8], [-51.7, 37.4],
  ];
  const glow = [];
  for (const [i, [x, z]] of clusters.entries()) {
    const y = getHeight(x, z);
    // Half-buried broken stones and moss suggest the remnants of a much older site.
    parts.push(part(G.ico1, '#879099', { p: [x, y + 0.22, z], s: [0.55, 0.43, 0.42], r: [0.15, i, 0.2] }));
    parts.push(part(G.sphereLo, '#628963', { p: [x - 0.12, y + 0.53, z], s: [0.42, 0.07, 0.3] }));
    const fx = x + 0.7 * Math.cos(i), fz = z + 0.7 * Math.sin(i), fy = getHeight(fx, fz);
    for (let leaf = 0; leaf < 7; leaf++) {
      const a = leaf * Math.PI * 2 / 7;
      parts.push(part(G.sphereLo, leaf % 2 ? '#619e74' : '#387d66', {
        p: [fx + Math.cos(a) * 0.25, fy + 0.3, fz + Math.sin(a) * 0.25],
        s: [0.13, 0.49 + (leaf % 3) * 0.07, 0.045], r: [Math.sin(a) * 0.65, a, -Math.cos(a) * 0.65],
      }));
    }
    for (let m = 0; m < 3; m++) {
      const mx = x + 0.5 + m * 0.22, mz = z + 0.6 - m * 0.13, my = getHeight(mx, mz);
      const h = 0.16 + (m % 2) * 0.12;
      parts.push(part(G.cyl6, '#d2d9c5', { p: [mx, my + h / 2, mz], s: [0.045, h, 0.045] }));
      glow.push(part(G.sphereLo, m % 2 ? '#b2a7ed' : '#8edcc7', { p: [mx, my + h, mz], s: [0.17, 0.08, 0.17] }));
    }
  }
  const ring = new THREE.Mesh(combine(parts), VERTEX_TOON);
  ring.receiveShadow = true;
  root.add(ring);
  const fungi = new THREE.Mesh(combine(glow), toonMat('#ffffff', {
    vertexColors: true, emissive: '#73baa8', emissiveIntensity: 0.32,
  }));
  root.add(fungi);
  const glintGeo = new THREE.BufferGeometry();
  glintGeo.setAttribute('position', new THREE.Float32BufferAttribute(clusters.flatMap(([x, z], i) =>
    [x + 0.6, getHeight(x, z) + 0.8 + (i % 3) * 0.2, z + 0.5]), 3));
  const glints = new THREE.Points(glintGeo, new THREE.PointsMaterial({
    color: '#c2ffe5', size: 0.1, transparent: true, opacity: 0.5, depthWrite: false,
  }));
  root.add(glints);
  const stones = RITUAL.stones.map((at, i) => {
    const g = new THREE.Group();
    g.name = `ritual-stone-${i + 1}`;
    g.position.set(at.x, getHeight(at.x, at.z), at.z);
    // Geometry extends up from a ground-level pivot, so a hit rocks it on its base.
    const geo = new THREE.CylinderGeometry(0.52, 0.72, at.height, 5, 1);
    geo.scale(at.width, 1, 0.82 * at.width);
    geo.rotateY(0.2 + i * 0.7);
    geo.translate(0, at.height / 2, 0);
    const stoneGeo = combine([
      part(geo, '#a6a5bb'),
      part(G.sphereLo, '#638970', { p: [0.17, 0.13, 0.35], s: [0.44, 0.16, 0.2] }),
      part(G.sphereLo, '#71977a', { p: [-0.16, at.height - 0.025, 0], s: [0.36, 0.035, 0.27] }),
    ]);
    geo.dispose();
    const mesh = new THREE.Mesh(stoneGeo, VERTEX_TOON);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    addOutline(mesh, 0.045);
    // Faint worn markings are decorative until the future puzzles exist.
    const markings = [];
    const stroke = new THREE.BoxGeometry(0.035, 0.27, 0.025);
    for (let n = 0; n < 3; n++) {
      const mark = stroke.clone();
      mark.rotateZ(n === 0 ? 0 : n === 1 ? 0.65 : -0.65);
      mark.translate(n === 0 ? 0 : n === 1 ? -0.09 : 0.09, 1.1 + (n ? 0.12 : 0), 0.53 * at.width);
      markings.push(mark);
    }
    stroke.dispose();
    const rune = new THREE.Mesh(mergeGeometries(markings), runeMat);
    markings.forEach((p) => p.dispose());
    mesh.add(rune);
    g.add(mesh);
    root.add(g);
    addCollider({ x: at.x, z: at.z, r: 0.72 * at.width, owner: g });
    g.userData.interactable = addInteractable({
      type: 'ritualstone', object: g, position: g.position, radius: 0.72 * at.width, prompt: 'Strike',
    });
    return g;
  });
  return { root, stones, update(t, nightness = 0) {
    glints.material.opacity = (0.25 + nightness * 0.4) * (0.75 + 0.25 * Math.sin(t * 1.4));
    runeMat.emissiveIntensity = 0.25 + nightness * 0.55;
    fungi.material.emissiveIntensity = 0.15 + nightness * 0.65;
  } };
}
