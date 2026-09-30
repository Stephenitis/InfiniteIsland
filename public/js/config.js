// Central palette + tunables. Everything is exported so other modules never hardcode magic numbers.

// Game version, shown on the title card. The client can't read package.json (only public/ is deployed), so this is
// the source of truth: bump it together with "version" in package.json. Minor = last completed PLAN.md step.
export const VERSION = '0.19.1';

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

// ---- Campfire (Step 14): stone firepit + log benches on the flat meadow east of the spawn (visible from the first frame, clear of the sign).
// `clear` = radius around it kept free of props / herbs / dig spots / tool pickups (the benches sit at ~2.6u).
export const CAMPFIRE = { x: 7, z: 9.5, clear: 4.5 };
export const FUEL_PER_LOG = 180;        // s of burn time one log adds
export const FIRE_MAX_LEVEL = 3;        // level = min(3, ceil(fuel / FUEL_PER_LOG)) -> fuel caps at 3 logs = 540 s

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

// ---- Local multiplayer (Step 11)
export const MAX_PLAYERS = 4;
export const DISCONNECT_GRACE_S = 10;    // a gamepad / phone that drops keeps its player for this long before it poofs away
export const TETHER_DISTANCE = 34;       // no two players can be further apart than this (u)
export const PLAYER_PUSH_RADIUS = 0.9;   // centre-to-centre distance below which two players soft-push apart (2 x PLAYER_RADIUS)
// hat / cuff / shirt / pants colour the character; `ui` is the saturated accent used by rings, name tags, roster chips
// and the phone controller. P1 keeps the original butter-yellow beanie + coral shirt.
export const PLAYER_COLORS = [
  { name: 'P1', hat: '#ffd85e', cuff: '#ffb347', shirt: '#ff7c6b', pants: '#3f9fbf', ui: '#ffc93c' },   // yellow / coral
  { name: 'P2', hat: '#6cc8ff', cuff: '#3d9be0', shirt: '#7fe6b8', pants: '#4a5db8', ui: '#5fc4ff' },   // sky blue / mint
  { name: 'P3', hat: '#c9a4ff', cuff: '#9a6be0', shirt: '#ff93c6', pants: '#6b5aa8', ui: '#c39bff' },   // lilac / pink
  { name: 'P4', hat: '#a8ec5c', cuff: '#5fbf3a', shirt: '#ff9d42', pants: '#8a5f3c', ui: '#a3e04a' },   // lime / orange
];

// ---- Camera (fixed-angle follow)
export const CAMERA_OFFSET = { x: 0, y: 8.5, z: 13.5 };
export const CAMERA_FOLLOW_LERP = 5;
export const CAMERA_FOV = 40;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 600;
export const CAMERA_MAX_ZOOM = 2.2;     // multiplier on CAMERA_OFFSET when players are far apart (1 = solo framing)
export const CAMERA_ZOOM_MARGIN = 4.5;  // ground units of breathing room around the outermost players
export const CAMERA_ZOOM_LERP = 2.2;

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

// ---- Day/night: game-hour spans and simulation seconds (one full cycle = 630 s).
export const DAY_PHASES = [
  { name: 'dawn', start: 5, end: 7, seconds: 45 },
  { name: 'day', start: 7, end: 18, seconds: 360 },
  { name: 'dusk', start: 18, end: 20, seconds: 45 },
  { name: 'night', start: 20, end: 5, seconds: 180 },
];
