// Cached party-only foreground silhouettes. Broad clumps rather than sphere-heavy
// specks: all pieces join the existing foliage / still batches, with no shadows.
import * as THREE from 'three';
import { part, combine } from '../../render/geo.js';
import { lowDecorAsset } from './decorLow.js';

const cache = new Map(), blob = new THREE.IcosahedronGeometry(1, 0);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 7);
const cube = new THREE.BoxGeometry(1, 1, 1);
const round = new THREE.IcosahedronGeometry(1, 1);
const leaflet = new THREE.BufferGeometry();
leaflet.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, -1], 3));
leaflet.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0.5, 0.5, 1, 1, 0.5, 0.5, 0], 2));
leaflet.setIndex([0, 1, 2, 0, 2, 3, 2, 1, 0, 3, 2, 0]);
const flatLeaflet = leaflet.toNonIndexed(); leaflet.copy(flatLeaflet); flatLeaflet.dispose(); leaflet.computeVertexNormals();
export const DRESSING_KINDS = new Set(['grassClump', 'flowerClump', 'fernClump', 'fronds', 'pineBranch',
  'rock', 'snowRock', 'snowBush', 'snowPine', 'jungleGrove', 'log', 'stump', 'driftwood', 'shellClump', 'starfish', 'mushroomClump', 'tracks', 'sled', 'icePatch']);
export const STILL_DRESSING = new Set(['rock', 'snowRock', 'log', 'stump', 'driftwood', 'shellClump', 'starfish', 'tracks', 'sled', 'icePatch']);
for (const kind of ['mossLog', 'stumpGroup', 'woodpile', 'beachRocks', 'coastShells', 'starfishGroup', 'cosySnowRock', 'frozenPond', 'lilyPads']) { DRESSING_KINDS.add(kind); STILL_DRESSING.add(kind); }
DRESSING_KINDS.add('farMushroom'); // Step 82c: a ~100-triangle marsh silhouette for the far tree line (it sways like foliage)
for (const kind of ['meadowGrass', 'meadowFlowers', 'softFern', 'meadowBush', 'beachGrass', 'cosySnowBush', 'cosyPine']) DRESSING_KINDS.add(kind);
export function dressingAsset(kind) {
  if (!DRESSING_KINDS.has(kind)) return null;
  if (cache.has(kind)) return cache.get(kind);
  const p = [], add = (g, color, position, scale, rotation) => p.push(part(g, color, { p: position, s: scale, r: rotation }));
  if (['meadowGrass', 'meadowFlowers', 'softFern', 'meadowBush', 'beachGrass', 'cosyPine'].includes(kind)) {
    const base = { meadowGrass: 'grassClump', meadowFlowers: 'flowerClump', softFern: 'fernClump', meadowBush: 'bush', beachGrass: 'grassClump', cosyPine: 'snowPine' }[kind];
    const g = (base === 'bush' ? lowDecorAsset(base) : dressingAsset(base)).clone(), c = g.attributes.color, soft = new THREE.Color(kind === 'beachGrass' ? '#adb99b' : kind === 'cosyPine' ? '#ecf2f4' : '#abbc9d');
    for (let i = 0; i < c.count; i++) { const col = new THREE.Color(c.getX(i), c.getY(i), c.getZ(i)).lerp(soft, kind === 'cosyPine' ? 0.18 : 0.34); c.setXYZ(i, col.r, col.g, col.b); }
    p.push(g);
  } else if (kind === 'mossLog') {
    // Crooked, half buried, grey-green wood with moss and ferns: unlike the scored logs.
    add(cylinder, '#67765c', [0, 0.035, 0], [0.26, 3.8, 0.28], [0, 0.15, Math.PI / 2]);
    add(round, '#788667', [-0.3, 0.17, 0.04], [1.4, 0.16, 0.3]);
    p.push(dressingAsset('softFern').clone().scale(0.5, 0.7, 0.5).translate(-0.8, 0.12, 0.1));
  } else if (kind === 'stumpGroup') {
    for (const [x, z, r, h] of [[-0.55, 0, 0.42, 0.3], [0.45, 0.1, 0.35, 0.4], [0, -0.6, 0.3, 0.24]]) {
      add(cylinder, '#889272', [x, h / 2, z], [r, h, r]); add(cylinder, '#b9bb92', [x, h, z], [r * 0.87, 0.015, r * 0.87]);
    }
  } else if (kind === 'woodpile') {
    for (let row = 0; row < 3; row++) for (let i = 0; i < 3 - row; i++) {
      const x = (i - (2 - row) / 2) * 0.42, y = 0.21 + row * 0.37;
      add(cylinder, '#899078', [x, y, 0], [0.22, 1.8, 0.22], [Math.PI / 2, 0, 0]);
      add(cylinder, '#c0bd97', [x, y, 0.91], [0.19, 0.015, 0.19], [Math.PI / 2, 0, 0]);
    }
  } else if (kind === 'beachRocks' || kind === 'cosySnowRock' || kind === 'cosySnowBush') {
    const snow = kind !== 'beachRocks', bush = kind === 'cosySnowBush';
    for (const [x, z, r] of [[-0.6, 0, 0.7], [0.55, 0.25, 0.55], [0.1, -0.5, 0.38]]) {
      add(round, bush ? '#a2b5a8' : snow ? '#acbcc5' : '#b4b1a0', [x, r * 0.45, z], [r, r * 0.8, r * 0.85]);
      if (snow) add(round, '#f5f8fc', [x, r * 0.85, z], [r * 1.02, r * 0.48, r * 0.92]);
    }
    if (!snow) p.push(dressingAsset('beachGrass').clone().scale(0.5, 0.7, 0.5).translate(0.2, 0, 0.3));
  } else if (kind === 'coastShells') {
    p.push(dressingAsset('shellClump').clone());
    p.push(dressingAsset('starfish').clone().scale(0.75, 1, 0.75).translate(1.1, 0, 0.35));
  } else if (kind === 'starfishGroup') {
    for (let i = 0; i < 3; i++) p.push(dressingAsset('starfish').clone().scale(0.7, 1, 0.7).rotateY(i * 0.7).translate((i - 1) * 0.7, 0, Math.sin(i * 3) * 0.4));
  } else if (kind === 'frozenPond') {
    const ice = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
    add(ice, '#b5dce6', [0, 0.027, 0], [3, 1, 1.9]); ice.dispose();
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; add(round, '#f2f7fc', [Math.cos(a) * 3, 0.035, Math.sin(a) * 1.9], [0.48, 0.09, 0.3]); }
    for (let i = 0; i < 3; i++) add(cube, '#e4f2f7', [(i - 1) * 0.8, 0.045, 0], [0.014, 0.005, 0.75], [0, i * 0.7, 0]);
  } else if (kind === 'jungleGrove') {
    // The hanging liana ends meet these palms' crowns; no floating loose ropes.
    p.push(lowDecorAsset('coconut').clone().translate(-1.3, 0, -0.3), lowDecorAsset('banana').clone().translate(1.3, 0, 0.3));
    const curve = new THREE.CatmullRomCurve3([[-1.3, 4.25, -0.3], [-0.7, 3.15, -0.1], [0, 2.8, 0], [0.7, 3.15, 0.1], [1.3, 4.25, 0.3]].map(p => new THREE.Vector3(...p)));
    const vine = new THREE.TubeGeometry(curve, 12, 0.045, 3); add(vine, '#578d64'); vine.dispose();
    for (let i = 1; i < 9; i++) { const at = curve.getPoint(i / 10); add(leaflet, '#6aa16e', [at.x, at.y, at.z], [0.17, 1, 0.1], [0, i, 0.4]); }
  } else if (kind === 'snowPine') {
    p.push(lowDecorAsset('pine').clone());
    const cone = new THREE.ConeGeometry(1, 1, 6);
    for (const [y, h, r] of [[2.65, 1.3, 1.4], [3.7, 1, 1.1], [4.7, 0.85, 0.75]]) add(cone, '#dce8ef', [0, y, 0], [r, h, r]);
    cone.dispose();
  } else if (kind === 'grassClump' || kind === 'flowerClump') {
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, r = 0.25 + i % 3 * 0.27;
      p.push(lowDecorAsset(kind === 'grassClump' ? 'grass' : ['flowerPink', 'flowerWhite', 'flowerYellow'][i % 3]).clone()
        .scale(1.15, kind === 'grassClump' ? 0.65 : 0.85, 1.15).rotateY(a).translate(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
  } else if (kind === 'fernClump' || kind === 'fronds' || kind === 'pineBranch') {
    // Flattened tapered leaflets form an unmistakable fern / palm fan silhouette.
    const pine = kind === 'pineBranch', big = kind === 'fronds';
    for (let i = 0; i < (big ? 7 : 9); i++) {
      const a = i * 2.4, length = big ? 2.2 : 1.15;
      for (let j = 1; j <= 5; j++) {
        const t = j / 5, x = Math.cos(a) * length * t, z = Math.sin(a) * length * t;
        add(leaflet, pine ? '#46856f' : i % 2 ? '#4f9f69' : '#6abc77', [x, Math.sin(t * Math.PI) * (big ? 1 : 0.6), z], [length * 0.19 * (1 - t * 0.6), 1, 0.09 + (1 - t) * 0.15], [0, -a, 0]);
        if (pine && j % 2) add(blob, '#e4edf2', [x, Math.sin(t * Math.PI) * 0.6 + 0.05, z], [0.2, 0.045, 0.12]);
      }
    }
  } else if (kind === 'rock' || kind === 'snowRock' || kind === 'snowBush') {
    const bush = kind === 'snowBush';
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.6, z = Math.sin(i * 4) * 0.3, r = i === 1 ? 0.9 : 0.6;
      add(blob, bush ? '#71958b' : '#819394', [x, r * 0.4, z], [r, r * 0.55, r * 0.7]);
      if (kind !== 'rock') add(blob, '#dce8ef', [x, r * 0.72, z], [r * 0.95, r * 0.22, r * 0.7]);
    }
  } else if (kind === 'log' || kind === 'driftwood') {
    add(cylinder, kind === 'log' ? '#8d6847' : '#a99b80', [0, 0.24, 0], [0.28, 3.3, 0.28], [0, 0, Math.PI / 2]);
    for (const side of [-1, 1]) add(cylinder, '#d1bc91', [side * 1.66, 0.24, 0], [0.24, 0.02, 0.24], [0, 0, Math.PI / 2]);
    add(cylinder, '#958365', [-0.55, 0.33, 0.15], [0.1, 1.1, 0.1], [0.7, 0, 0.9]);
  } else if (kind === 'stump') {
    add(cylinder, '#936b47', [0, 0.2, 0], [0.6, 0.4, 0.55]);
    add(cylinder, '#cdb58c', [0, 0.41, 0], [0.54, 0.02, 0.5]);
    add(cylinder, '#aa8c65', [0, 0.425, 0], [0.27, 0.012, 0.25]);
  } else if (kind === 'shellClump') {
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4, r = 0.25 + i % 3 * 0.27;
      add(blob, i % 2 ? '#dfb9a7' : '#eee0c6', [Math.cos(a) * r, 0.1, Math.sin(a) * r], [0.23, 0.12, 0.3], [0, a, 0]);
    }
  } else if (kind === 'starfish') {
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 0.4; add(blob, '#ce9d81', [Math.cos(a) * 0.24, 0.04, Math.sin(a) * 0.24], [0.32, 0.045, 0.1], [0, -a, 0]);
    }
  } else if (kind === 'mushroomClump') {
    for (let i = 0; i < 4; i++) {
      const x = Math.cos(i * 2.4) * 0.55, z = Math.sin(i * 2.4) * 0.55;
      add(cylinder, '#c3cbb0', [x, 0.13, z], [0.055, 0.26, 0.055]);
      add(blob, i % 2 ? '#adc5a5' : '#b6a8d4', [x, 0.29, z], [0.24, 0.11, 0.24]);
    }
  } else if (kind === 'tracks') {
    for (let i = 0; i < 12; i++) add(blob, '#aebfce', [(i % 2 ? 0.16 : -0.16) + Math.sin(i * 0.3) * 0.4, 0.008, (i - 6) * 0.28], [0.12, 0.01, 0.18]);
  } else if (kind === 'sled') {
    for (const x of [-0.55, 0.55]) add(cube, '#8a897e', [x, 0.1, 0], [0.08, 0.12, 2.2]);
    for (let i = 0; i < 5; i++) add(cube, i % 2 ? '#ad8866' : '#b89878', [0, 0.32, (i - 2) * 0.32], [1.3, 0.12, 0.25]);
  } else if (kind === 'lilyPads') {
    // Flat green pads lying ON the water (the caller sets y just above the surface), one pink bloom.
    [[0, 0, 0.46, '#4f9d63'], [0.78, 0.42, 0.34, '#63b46f'], [-0.62, 0.55, 0.38, '#468f5c'], [0.15, -0.8, 0.3, '#5aa96a'], [-0.85, -0.45, 0.26, '#63b46f']]
      .forEach(([x, z, r, c], i) => add(cylinder, c, [x, 0.012, z], [r, 0.014, r * 0.92], [0, i, 0]));
    add(blob, '#f6a5c8', [0.05, 0.07, 0.04], [0.1, 0.07, 0.1]); add(blob, '#ffe27a', [0.05, 0.1, 0.04], [0.04, 0.03, 0.04]); add(blob, '#f6a5c8', [0.8, 0.06, 0.42], [0.08, 0.05, 0.08]);
  } else if (kind === 'farMushroom') {
    add(cylinder, '#c7c2e6', [0, 0.65, 0], [0.3, 1.3, 0.3]);
    add(round, '#5b60b2', [0, 1.45, 0], [1.25, 0.7, 1.25]); add(round, '#7f78c8', [0, 1.28, 0], [1.2, 0.3, 1.2]);
    add(blob, '#e8a47a', [0.55, 1.62, 0.3], [0.2, 0.08, 0.2]); add(blob, '#e8a47a', [-0.4, 1.7, -0.3], [0.16, 0.07, 0.16]);
  } else if (kind === 'icePatch') {
    add(blob, '#89a6b8', [0, 0.02, 0], [2.2, 0.018, 1.2]);
    for (let i = 0; i < 5; i++) add(cube, '#c7dce5', [(i - 2) * 0.48, 0.043, 0], [0.018, 0.008, 0.8], [0, i * 0.8, 0]);
  }
  const g = combine(p), pos = g.attributes.position;
  let footprint = 0; for (let i = 0; i < pos.count; i++) footprint = Math.max(footprint, Math.hypot(pos.getX(i), pos.getZ(i)));
  g.userData.footprint = footprint;
  cache.set(kind, g); return g;
}
