// Interactable registry. Step 3 only registers them; Step 5 fills in `onInteract` and the HUD prompt.
//
// Interactable shape:
//   { id, type: 'tree'|'palm'|'rock'|'bush'|'flower'|'sign',
//     object,        // Object3D to animate (null for flowers)
//     instance,      // flowers only: { mesh, index, position: Vector3, scale, rotY } (an InstancedMesh slot)
//     position,      // THREE.Vector3 (world) - reach is measured from here
//     radius,        // footprint radius; distance to the player is measured to the prop's surface
//     prompt,        // 'Shake' | 'Inspect' | 'Read' | 'Smell' | 'Rustle'
//     onInteract }   // null now; Step 5 sets (interactable, playerCtx) => void

const _items = [];
let _nextId = 1;

export function addInteractable({ type, object = null, instance = null, position, radius = 0.8, prompt = 'Interact', onInteract = null }) {
  const item = { id: _nextId++, type, object, instance, position, radius, prompt, onInteract };
  _items.push(item);
  return item;
}

export function getInteractables() {
  return _items;
}

export function clearInteractables() {
  _items.length = 0;
}

/**
 * Nearest interactable to `pos` ({x,z}, y ignored) within `maxDist` of its surface
 * (centre distance minus its radius, floored at 0). Returns the interactable or null;
 * the measured distance is left on `item.lastDistance` for convenience.
 */
export function findNearest(pos, maxDist = 2.2) {
  let best = null;
  let bestD = maxDist;
  for (let i = 0; i < _items.length; i++) {
    const it = _items[i];
    const dx = pos.x - it.position.x, dz = pos.z - it.position.z;
    const d = Math.max(0, Math.sqrt(dx * dx + dz * dz) - it.radius);
    if (d <= bestD) { bestD = d; best = it; }
  }
  if (best) best.lastDistance = bestD;
  return best;
}
