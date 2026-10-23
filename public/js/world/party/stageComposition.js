// Calm foreground compositions for the yard, cove and snowy clearing. A handful
// of larger plant groups frame open ground; scarce wood / rocks have fixed homes.
// Vine's accepted composition deliberately continues to use its original builder.
import * as THREE from 'three';
import { dressingAsset } from './stageDressing.js';
import { distanceToShape } from './scatter.js';
import { mulberry32 } from '../../utils/rng.js';

export function composeStage({ id, cameras, origin, keepOut }) {
  const rng = mulberry32({ timber: 8292, marlosays: 8293, huddle: 8294 }[id]), out = [], groups = [];
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -origin.y);
  function put(kind, x, z, scale = 1, yaw = 0, extra = {}) {
    const footprint = kind === 'patch' ? scale : Math.max(0.65, dressingAsset(kind).userData.footprint + 0.05) * scale;
    if (keepOut.some(s => distanceToShape(s, x, z) < footprint)) return;
    out.push({ id: 95000 + out.length, kind, x, z, scale, yaw, lowCover: true, zone: 'front', layer: 'foreground', ...extra });
  }
  // Camera bands locate groups, not individual pieces. Dedupe the two wide views;
  // portrait sees deeper foreground groups as well, with clear gaps between them.
  for (const camera of cameras) for (const [nx, ny, role] of [[-0.8, 0, 'side'], [0.8, 0, 'side'], [-0.73, -0.75, 'front'], [0.73, -0.75, 'front'], [0, -0.93, 'front']]) {
    ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const p = ray.ray.intersectPlane(plane, new THREE.Vector3())?.sub(origin); if (!p) continue;
    if (groups.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 5)) continue;
    groups.push({ x: p.x, z: p.z, role });
  }
  groups.forEach((g, group) => {
    const scale = 1.35 + rng() * 0.35;
    for (const [i, dx, dz] of [[0, -1.4, 0.1], [1, 1.2, 0.5], [2, 0, -1.35]]) {
      let kind;
      if (id === 'timber') kind = ['meadowGrass', 'softFern', group % 3 ? 'meadowGrass' : 'meadowFlowers'][i];
      else if (id === 'marlosays') kind = g.role === 'side' ? ['beachGrass', 'coastShells', 'beachGrass'][i] : ['coastShells', 'starfishGroup', 'coastShells'][i];
      else kind = Math.abs(g.x) < 5 && g.z < 15 ? 'meadowGrass' : i === 2 && Math.abs(g.x) > 9 ? 'cosyPine' : 'cosySnowBush';
      put(kind, g.x + dx, g.z + dz, id === 'huddle' && kind === 'meadowGrass' ? 0.8 : kind === 'cosyPine' ? g.role === 'side' ? 1.2 : 0.62 : scale, rng() * 0.5 - 0.25,
        { cluster: group, lowCover: !['cosyPine', 'cosySnowBush'].includes(kind), zone: g.role === 'side' ? 'sides' : 'front', ...(id === 'huddle' && kind === 'meadowGrass' ? { tint: '#d0dfe0' } : {}) });
    }
  });
  // One cohesive framing silhouette at each corner, rather than four overlapping
  // rocks per corner. They still pass the depth-aware gameplay admission test.
  for (const camera of cameras) for (const side of [-1, 1]) {
    ray.setFromCamera(new THREE.Vector2(side * 1.04, -0.8), camera);
    const p = ray.ray.intersectPlane(plane, new THREE.Vector3())?.sub(origin);
    if (p) put(id === 'huddle' ? 'cosyPine' : id === 'timber' ? 'softFern' : 'fronds', p.x, p.z, id === 'huddle' ? 0.9 : 2, side * 0.25,
      { lowCover: false, zone: 'frame', ...(id === 'marlosays' ? { softColor: '#b7c5a4' } : {}) });
  }
  if (id === 'timber') {
    put('meadowGrass', -16, 1.8, 1.8, 0.1); put('softFern', -17.3, 2.3, 1.5, -0.2);
    put('meadowBush', -18, -2, 1.05, 0, { lowCover: false }); put('meadowBush', 17, 6.5, 1.1, 0.2, { lowCover: false });
    put('mossLog', -15, 14.5, 1, 0.15, { lowCover: false }); put('mossLog', 14, 17, 0.9, -0.2, { lowCover: false });
    put('stumpGroup', -15, 6.5, 1.15, 0.1); put('stumpGroup', 15, 8, 1.05, -0.15);
    put('woodpile', -15.5, -8, 1.1, 0.05, { lowCover: false });
  } else if (id === 'marlosays') {
    put('beachGrass', 16.5, 2, 1.6, 0.1);
    for (const [x, z] of [[-16, 6], [16, 9], [-16, 17]]) put('beachRocks', x, z, 1.15, 0.15, { lowCover: false });
    put('driftwood', -13.5, 16, 0.95, 0.15); put('driftwood', 15.5, 2, 0.8, 0.1);
    for (const x of [-12.5, 13]) put('patch', x, 14, 2.5, 0, { color: '#ead5ac', edge: '#f3dca4', zone: 'wet-sand' });
  } else {
    for (const [x, z] of [[-16, 5], [16, 16]]) put('cosySnowRock', x, z, 1.2, 0.1, { lowCover: false });
    put('frozenPond', -14, 12, 1.05, 0.15);
    put('tracks', -8, 18, 1.15, 0.25); put('tracks', 7, 22, 1.1, -0.2);
  }
  return out;
}
