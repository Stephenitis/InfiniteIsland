// Central palette + tunables. Everything is exported so other modules never hardcode magic numbers.

export const PALETTE = {
  grassLight: '#8fe36b',
  grassDark: '#5fc25a',
  sand: '#ffe6a3',
  cliff: '#d9a066',
  dirt: '#d9a066',
  waterShallow: '#6fe3ef',
  waterDeep: '#2f9bdc',
  rock: '#b9b4cc',
  canopy: '#58c96b',
  blossom: '#ffb3d1',
  trunk: '#9a6a44',
  outline: '#2b2340',
  skyTop: '#7cc8ff',
  skyHorizon: '#ffe9f5',
};

// ---- World
export const WATER_LEVEL = 0;
export const ISLAND_RADIUS = 55;       // island radius before the beach drops into the sea
export const WORLD_SIZE = 150;         // terrain mesh extent (units)
export const TERRAIN_SEGMENTS = 240;      // 0.625u per cell so the stream channel and cliffs read clearly
export const WORLD_SEED = 1337;

// Terrace heights (tiers)
export const HEIGHT_BEACH = 0.3;
export const HEIGHT_MEADOW = 1.5;
export const HEIGHT_PLATEAU = 3.5;

// ---- Player
export const PLAYER_SPEED = 7;          // run speed (u/s)
export const PLAYER_WALK_SPEED = 3.5;   // walk speed for gentle analog input
export const PLAYER_ACCEL = 40;
export const PLAYER_DAMPING = 12;
export const PLAYER_RADIUS = 0.45;
export const PLAYER_HEIGHT = 1.6;
export const TURN_SPEED = 12;
export const DEEP_WATER_BLOCK = 0.35;   // cannot walk below WATER_LEVEL - this

// ---- Camera (fixed-angle follow)
export const CAMERA_OFFSET = { x: 0, y: 8.5, z: 13.5 };
export const CAMERA_FOLLOW_LERP = 5;
export const CAMERA_FOV = 40;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 600;

// ---- Input
export const DEADZONE = 0.15;
export const WALK_THRESHOLD = 0.5;
export const INTERACT_RADIUS = 2.2;
export const REMOTE_STALE_MS = 500;

// ---- Rendering
export const MAX_PIXEL_RATIO = 2;
export const SHADOW_MAP_SIZE = 2048;
export const OUTLINE_THICKNESS = 0.05;

// ---- Networking
export const DEFAULT_PORT = 3000;
