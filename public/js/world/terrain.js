// Terrain API for the whole archipelago (Step 27a). One continuous world coordinate space holds every island; this module
// is the dispatcher that the rest of the game imports (players, props, items, water ...) and keeps the original API:
//   getHeight / getSlope / getGroundType / isWalkable / inlandDistance / streamDistance + the home layout constants.
//
//   * Home (islands/home.js) is the original island, byte-for-byte the same height field. It is tested first (cheap circle test)
//     so the hot path stays one compare + the original function.
//   * Frostpine / Emberleaf (islands/frost.js, ember.js) own a square terrain mesh each; a point inside a square is answered
//     by that island. Everything else is open sea (SEA_FLOOR). The squares never overlap (see config.js ISLANDS).
//   * Bridges (config BRIDGES) add a walkable deck strip between two landings while open (setBridgeOpen). getTerrainHeight
//     is the terrain only (what the meshes and the water height texture are baked from); getHeight adds the deck.
//   * regionOf(x, z) -> 'home' | 'frost' | 'ember' | 'sea'.
// The meshes (buildTerrain, buildIslandTerrain) live in terrainMesh.js and are re-exported here.
import { SEA_FLOOR, ISLANDS, BRIDGES, WATER_LEVEL, DEEP_WATER_BLOCK } from '../config.js';
import * as home from './islands/home.js';
import { ritualInland } from './islands/ritual.js';
import { bigAt, getIslandModule } from './islands/registry.js';

export { getIslandModule };

export {
  ISLAND_RADIUS, SPAWN, POND, PLATEAU, RAMP_ANGLES, POND_BOTTOM, MAX_WALK_SLOPE,
  STREAM_PATH, STREAM_HALF_WIDTH, streamDistance,
} from './islands/home.js';
export { buildTerrain, buildIslandTerrain, buildFarTerrain } from './terrainMesh.js';

const MAX_WALK_SLOPE = home.MAX_WALK_SLOPE;
const HOME_R2 = 80 * 80;          // includes the southwest ritual annex's shore

// ---------------------------------------------------------------------------------------------
// Island dispatch (the island modules themselves are created once in islands/registry.js)
// ---------------------------------------------------------------------------------------------
/** Terrain only (never the bridge deck): what the meshes and the water height texture use. */
export function getTerrainHeight(x, z) {
  if (x * x + z * z <= HOME_R2) return home.getHeight(x, z);
  const b = bigAt(x, z);
  return b ? b.mod.height(x, z) : SEA_FLOOR;
}

// ---------------------------------------------------------------------------------------------
// Bridges: a deck strip along a -> b, only while open. The deck is a gentle arch between the two landing heights.
// ---------------------------------------------------------------------------------------------
const DECK_RISE = 1.25;                                   // how far the middle of the deck arches above the straight line

const BRIDGE_STATE = BRIDGES.map((b) => {
  const dx = b.bx - b.ax, dz = b.bz - b.az, L = Math.hypot(dx, dz);
  return {
    ...b, dx, dz, L, open: false,
    ha: b.deckY ?? getTerrainHeight(b.ax, b.az),
    hb: b.deckY ?? getTerrainHeight(b.bx, b.bz),
  };
});
let openBridges = [];

export function setBridgeOpen(id, open) {
  const b = BRIDGE_STATE.find((e) => e.id === id);
  if (!b) return false;
  b.open = !!open;
  openBridges = BRIDGE_STATE.filter((e) => e.open);
  return true;
}
export function isBridgeOpen(id) {
  const b = BRIDGE_STATE.find((e) => e.id === id);
  return !!(b && b.open);
}

/** Deck height of a bridge at parameter s (0 at landing a .. 1 at landing b). */
export function deckHeightAt(b, s) {
  return b.ha + (b.hb - b.ha) * s + DECK_RISE * Math.sin(Math.PI * s);
}

/** The open bridge whose deck strip covers (x, z), or null. Returns { bridge, h } (deck height). */
function deckAt(x, z) {
  for (let i = 0; i < openBridges.length; i++) {
    const b = openBridges[i];
    const px = x - b.ax, pz = z - b.az;
    const s = (px * b.dx + pz * b.dz) / (b.L * b.L);
    if (s < 0 || s > 1) continue;
    const lat = Math.abs(px * b.dz - pz * b.dx) / b.L;
    if (lat > b.width / 2) continue;
    return { bridge: b, h: deckHeightAt(b, s) };
  }
  return null;
}

/** Bridge geometry for Step 28's mesh: { id, from, to, ax, az, bx, bz, width, ha, hb, rise, surface } (live object, do not mutate). */
export function getBridge(id) {
  const b = BRIDGE_STATE.find((e) => e.id === id);
  return b ? { id: b.id, from: b.from, to: b.to, ax: b.ax, az: b.az, bx: b.bx, bz: b.bz, width: b.width, ha: b.ha, hb: b.hb, rise: DECK_RISE, surface: b.surface } : null;
}

// ---------------------------------------------------------------------------------------------
// Public height API
// ---------------------------------------------------------------------------------------------
/** Pure, deterministic terrain height; on an OPEN bridge deck the max of terrain and deck. Sea floor is about -3. */
export function getHeight(x, z) {
  const th = getTerrainHeight(x, z);
  if (openBridges.length) {
    const d = deckAt(x, z);
    if (d && d.h > th) return d.h;
  }
  return th;
}

/** Steepness (rise over run) via central differences. */
export function getSlope(x, z, e = 0.5) {
  const gx = (getHeight(x + e, z) - getHeight(x - e, z)) / (2 * e);
  const gz = (getHeight(x, z + e) - getHeight(x, z - e)) / (2 * e);
  return Math.hypot(gx, gz);
}

/** Distance inland from the coastline of the island the point belongs to (home semantics everywhere else): positive on land. */
export function inlandDistance(x, z) {
  if (x * x + z * z > HOME_R2) {
    const b = bigAt(x, z);
    if (b) return b.mod.inland(x, z);
  }
  return Math.max(home.inlandDistance(x, z), ritualInland(x, z));
}

/**
 * 'sand' | 'grass' | 'dirt' | 'water' | 'wetsand' (home) plus 'snow' | 'rock' | 'ice' (frost), 'blacksand' | 'lava' | 'hotspring'
 * (ember) and 'wood' | 'stone' on an open bridge deck. Consumers should treat unknown strings as ordinary dry ground.
 */
export function getGroundType(x, z) {
  if (openBridges.length) {
    const d = deckAt(x, z);
    if (d && d.h >= getTerrainHeight(x, z)) return d.bridge.surface ?? 'wood';
  }
  if (x * x + z * z <= HOME_R2) return home.getGroundType(x, z);
  const b = bigAt(x, z);
  return b ? b.mod.groundType(x, z) : 'water';
}

/** Walkable = not deep water, not a cliff face, not lava; an open bridge deck always is. */
export function isWalkable(x, z) {
  if (openBridges.length) {
    const d = deckAt(x, z);
    if (d && d.h >= getTerrainHeight(x, z)) return true;
  }
  if (x * x + z * z <= HOME_R2) {
    if (home.getHeight(x, z) < WATER_LEVEL - DEEP_WATER_BLOCK) return false;
    return home.getSlope(x, z, 0.4) < MAX_WALK_SLOPE;      // terrain-only slope: a deck edge never makes the beach "cliff" 
  }
  const b = bigAt(x, z);
  if (!b) return false;
  return b.mod.walkable(x, z);
}

// ---------------------------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------------------------
const REGION_MARGIN = -6;      // inlandDistance above this (shore slope included) counts as part of the island

/** Which island's shore region a point is in: 'home' | 'frost' | 'ember' | 'sea' (open water, including the gap a bridge crosses). */
export function regionOf(x, z) {
  if (x * x + z * z <= HOME_R2) return Math.max(home.inlandDistance(x, z), ritualInland(x, z)) > REGION_MARGIN ? 'home' : 'sea';
  const b = bigAt(x, z);
  return b && b.mod.inland(x, z) > REGION_MARGIN ? b.island.id : 'sea';
}

/** The ISLANDS entry for a point's region, or null at sea. */
export function islandAt(x, z) {
  const id = regionOf(x, z);
  return id === 'sea' ? null : ISLANDS.find((i) => i.id === id);
}

/** Island-specific masks for painting (frost: snow / ice, ember: lava / black sand ...); used by terrainMesh.js. */
export function getIslandPaintInfo(id, x, z, h) {
  const m = getIslandModule(id);
  return m ? m.paintInfo(x, z, h) : null;
}
