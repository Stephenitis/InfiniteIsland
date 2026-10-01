// Deterministic glinting beach finds. They are Journal entries, never bag ingredients. Registry identities survive island visual rebuilds.
import * as THREE from 'three';
import { ISLANDS, BRIDGES } from '../config.js';
import { mulberry32 } from '../utils/rng.js';
import { getHeight, inlandDistance, isWalkable, regionOf } from './terrain.js';
import { getColliders } from './colliders.js';
import { addInteractable, removeInteractable, restoreInteractable } from './interactables.js';
import { COLLECTIBLES } from '../game/collection.js';

export function beachPlan({ islands = ISLANDS, colliders = getColliders(), walkable = isWalkable, inland = inlandDistance, regionAt = regionOf } = {}) {
  const result = [];
  for (const island of islands) {
    const random = mulberry32(island.seed ^ 0x31beac);
    for (const def of COLLECTIBLES.filter((d) => d.island === island.id && d.source === 'beach')) {
      for (let i = 0; i < 6000; i++) {
        const a = random() * Math.PI * 2, r = island.radius * (0.72 + random() * 0.3), x = island.x + Math.cos(a) * r, z = island.z + Math.sin(a) * r;
        const d = inland(x, z);
        if (d < 0.8 || d > 5 || !walkable(x, z) || regionAt(x, z) !== island.id) continue;
        if (colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 1.2) || result.some((p) => Math.hypot(x - p.x, z - p.z) < 5)) continue;
        if (BRIDGES.some((b) => Math.min(Math.hypot(x - b.ax, z - b.az), Math.hypot(x - b.bx, z - b.bz)) < 14)) continue;
        result.push({ id: def.id, island: island.id, x, z }); break;
      }
    }
  }
  return result;
}
export function createBeachFinds({ scene, collection, sync, world }) {
  const geometry = new THREE.OctahedronGeometry(0.22, 0), material = new THREE.MeshBasicMaterial({ color: '#fff2a1' });
  const finds = beachPlan().map((p) => {
    const g = new THREE.Mesh(geometry, material); g.position.set(p.x, getHeight(p.x, p.z) + 0.35, p.z); scene.add(g);
    const item = addInteractable({ type: 'beachfind', position: g.position.clone(), object: g, radius: 0.3, prompt: 'Discover', onInteract: (_item, by) => sync.request('collection', 'beach', { id: p.id }, sync.actorFor(by)) });
    return { ...p, g, item, hidden: false };
  });
  collection.validateBeach = (id, actor) => {
    const p = finds.find((p) => p.id === id);
    return !!p && Math.hypot(actor.pos.x - p.x, actor.pos.z - p.z) <= 4;
  };
  function refresh() {
    for (const p of finds) {
      const hidden = collection.has(p.id);
      if (hidden !== p.hidden) { if (hidden) removeInteractable(p.item); else restoreInteractable(p.item); p.hidden = hidden; }
    }
  }
  collection.onChange(refresh); refresh();
  return { finds, update(time) { for (const p of finds) { p.g.visible = !p.hidden && world.regions.isFull(p.island); p.g.rotation.y = time; p.g.scale.setScalar(0.85 + 0.25 * Math.sin(time * 3 + p.x)); } } };
}
