// Creates the height module of every non-home island once (shared by terrain.js and the mesh builder, so noise tables exist once).
// Each module: { id, height(x,z), groundType(x,z), walkable(x,z), inland(x,z), paintInfo(x,z,h) } over WORLD coordinates.
import { ISLANDS } from '../../config.js';
import { meshExtent } from './extent.js';
import { createDuskIsland } from './duskcrown.js';
import { createFrostIsland } from './frost.js';
import { createEmberIsland } from './ember.js';
import { createStoryIsland } from './story.js';

const FACTORIES = { alpine: createFrostIsland, volcanic: createEmberIsland, storybook: createStoryIsland, fungal: createDuskIsland };

/** Islands other than home, each with its mesh rectangle's half sizes (Step 69a: `halfX` / `halfZ`; a classic island is the old square, radius + margin each way) and height module. */
export const BIG = ISLANDS.filter((i) => i.id !== 'home').map((island) => ({
  island,
  ...meshExtent(island),
  mod: FACTORIES[island.biome](island),
}));

/** The per-island height module (null for home / unknown). */
export function getIslandModule(id) {
  const b = BIG.find((e) => e.island.id === id);
  return b ? b.mod : null;
}

/** The big island whose mesh rectangle contains (x, z), or null. The rectangles never overlap. */
export function bigAt(x, z) {
  for (let i = 0; i < BIG.length; i++) {
    const b = BIG[i];
    if (Math.abs(x - b.island.x) <= b.halfX && Math.abs(z - b.island.z) <= b.halfZ) return b;
  }
  return null;
}
