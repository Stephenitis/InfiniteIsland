// Duskcrown's gameplay data (Step 69c), registered ONCE per island at load on every screen (islandVisuals.js buildIslandData): the stem colliders of the giant and titan mushrooms.
// Visuals (duskVisuals.js) may be rebuilt as often as they like; nothing here is ever registered twice. Players walk round the stems; caps are never obstacles.
//
//   const d = registerDuskGameplay(island) -> { placement, colliders, summary() }     (cached; calling it again returns the same object)
import { addCollider } from '../colliders.js';
import { getIslandModule } from './registry.js';
import { buildDuskPlacement } from './duskPlacement.js';

const COLLIDER_FIT = 0.92;                 // collider radius = the stem's flared base x this (the player hugs the stem without catching on the flare)
const _data = new Map();

export function registerDuskGameplay(island) {
  if (_data.has(island.id)) return _data.get(island.id);
  const placement = buildDuskPlacement(island, getIslandModule(island.id));
  const colliders = placement.items.map((it) => addCollider({ x: it.x, z: it.z, r: +(it.baseR * COLLIDER_FIT).toFixed(2), owner: it.id }));
  const data = { placement, colliders, summary: () => ({ colliders: colliders.length, ...placement.summary() }) };
  _data.set(island.id, data);
  return data;
}
