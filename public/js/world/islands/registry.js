// Creates the height module of every non-home island once (shared by terrain.js and the mesh builder, so noise tables exist once).
// Each module: { id, height(x,z), groundType(x,z), walkable(x,z), inland(x,z), paintInfo(x,z,h) } over WORLD coordinates.
import { ISLANDS, ISLAND_MESH_MARGIN } from '../../config.js';
import { createFrostIsland } from './frost.js';
import { createEmberIsland } from './ember.js';
import { createStoryIsland } from './story.js';

const FACTORIES = { alpine: createFrostIsland, volcanic: createEmberIsland, storybook: createStoryIsland };

/** Islands other than home, each with its mesh square half-extent and height module. */
export const BIG = ISLANDS.filter((i) => i.id !== 'home').map((island) => ({
  island,
  half: island.radius + ISLAND_MESH_MARGIN,
  mod: FACTORIES[island.biome](island),
}));

/** The per-island height module (null for home / unknown). */
export function getIslandModule(id) {
  const b = BIG.find((e) => e.island.id === id);
  return b ? b.mod : null;
}

/** The big island whose mesh square contains (x, z), or null. The squares never overlap. */
export function bigAt(x, z) {
  for (let i = 0; i < BIG.length; i++) {
    const b = BIG[i];
    if (Math.abs(x - b.island.x) <= b.half && Math.abs(z - b.island.z) <= b.half) return b;
  }
  return null;
}
