// Duskcrown gameplay data (69c/d), registered ONCE per island at load on every screen: mushroom stems and ambient stump / log / rock colliders.
// Visuals (duskVisuals.js) may be rebuilt as often as they like; nothing here is ever registered twice. Players walk round the stems; caps are never obstacles.
//
//   const d = registerDuskGameplay(island) -> { placement, colliders (stems), flora, floraColliders, summary() }     (cached; calling it again returns the same object)
import { addCollider } from '../colliders.js';
import { getIslandModule } from './registry.js';
import { buildDuskPlacement } from './duskPlacement.js';
import { buildDuskFlora } from './duskFlora.js';

const COLLIDER_FIT = 0.92;                 // collider radius = the stem's flared base x this (the player hugs the stem without catching on the flare)
const _data = new Map();

export function registerDuskGameplay(island) {
  if (_data.has(island.id)) return _data.get(island.id);
  const placement = buildDuskPlacement(island, getIslandModule(island.id));
  const colliders = placement.items.map((it) => addCollider({ x: it.x, z: it.z, r: +(it.baseR * COLLIDER_FIT).toFixed(2), owner: it.id }));
  const flora = buildDuskFlora(island, getIslandModule(island.id));
  // Logs use three circles along their axis, matching home's fallen log. Small plants never block players.
  const floraColliders = flora.solids.flatMap((it) => {
    if (it.kind !== 'log') return [addCollider({ x: it.x, z: it.z, r: (it.kind === 'stump' ? 0.62 : 0.92) * it.s, owner: it.id })];
    return [-1, 0, 1].map((d) => addCollider({ x: it.x + Math.cos(it.rot) * d * it.s, z: it.z - Math.sin(it.rot) * d * it.s, r: 0.43 * it.s, owner: it.id }));
  });
  const data = { placement, colliders, flora, floraColliders, summary: () => ({ colliders: colliders.length, floraColliders: floraColliders.length, totalColliders: colliders.length + floraColliders.length, ...placement.summary() }) };
  _data.set(island.id, data);
  return data;
}
