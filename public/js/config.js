// Central palette + tunables. Everything is exported so other modules never hardcode magic numbers.

// Game version, shown on the title card. The client can't read package.json (only public/ is deployed), so this is
// the source of truth: bump it together with "version" in package.json. Minor = last completed PLAN.md step.
export const VERSION = '0.30.0';

// Emberleaf counts / clearances and inexpensive procedural effects (Step 30).
export const EMBER_PROPS = { trees: 120, bamboo: 18, boulders: 30, ferns: 110, flowers: 100, landingClear: 14, laneHalf: 3.4 };
export const EMBER_FX = { smokeCount: 64, smokeRise: 56, smokeLife: 28, smokeDrift: 32, steamCount: 18, steamRise: 4, steamLife: 7, sparkleInterval: 0.8 };

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
export const SEA_FLOOR = -3;             // open-sea terrain height (far from every island)

// ---- Archipelago (Step 27a): three islands in ONE world coordinate space. `radius` is the coast radius before the beach
// drops into the sea. Home is unchanged (mesh +-75). Every other island gets a square terrain mesh of half-extent
// radius + ISLAND_MESH_MARGIN centred on (x, z); the meshes must never overlap (sea-floor z-fighting), so centres are
// placed with the squares just touching: frost's south edge is z = -75 (home's north mesh edge) and ember's west edge is x = 75.
// Each big island grows a headland (a "spit") towards home so a bridge only has to cross ~26 u of open sea (see islands/*.js).
export const ISLAND_MESH_MARGIN = 12;
export const ISLANDS = [
  { id: 'home', name: 'Infinite Island', x: 0, z: 0, radius: ISLAND_RADIUS, biome: 'meadow', seed: WORLD_SEED },
  { id: 'frost', name: 'Frostpine Isle', x: 0, z: -197, radius: 110, biome: 'alpine', seed: 2101 },     // north (-Z)
  { id: 'ember', name: 'Emberleaf Isle', x: 197, z: 47, radius: 110, biome: 'volcanic', seed: 3307 },   // east (+X)
];
// Bridges: a -> b is the deck centre line, a on the `from` island's beach, b on the `to` island's beach (both beach tier, walkable).
// The deck only exists while the bridge is open (terrain.setBridgeOpen); `surface` is its ground type; `cost` is what the builder NPC wants.
export const BRIDGES = [
  { id: 'frost', from: 'home', to: 'frost', ax: 9.5, az: -50.5, bx: 9.5, bz: -82.5, width: 3, npc: 'cobble', cost: { stone: 30 }, surface: 'stone' },
  { id: 'ember', from: 'home', to: 'ember', ax: 51.5, az: 0, bx: 82.5, bz: 0, width: 3, npc: 'bramble', cost: { log: 20 }, surface: 'wood' },
];

// ---- Campfire (Step 14): stone firepit + log benches on the flat meadow east of the spawn (visible from the first frame, clear of the sign).
// `clear` = radius around it kept free of props / herbs / dig spots / tool pickups (the benches sit at ~2.6u).
export const CAMPFIRE = { x: 7, z: 9.5, clear: 4.5 };
// Hat rack (Step 32a): appears after the first feast beside the welcome sign; world x/z stay reserved even while it is hidden.
export const HAT_RACK = { x: -0.6, z: 9.8, radius: 0.65 };
export const SIGNPOST = { x: -4.2, z: 6.8 };
export const ITEM_PICKUP_LOCK = 0.6;
export const DROP_HOLD = 2;
export const ROCK_STONE = { ordinaryTwoChance: 0.75, hammerMin: 2, hammerMax: 3 };
// Bridge builders (Step 28a): the NPCs that arrive after the first feast. Each stands at the HOME end of its bridge (BRIDGES[].npc), at
// lx metres to the side of the deck centre line (negative = the camera side) and lz along the bridge direction (negative = inland, away from the
// gap), clear of the 3 u deck and the stub posts. yaw = idle facing (0 = towards the default camera, +Z), scale = model size. `near` = turn to players within this (u).
export const NPCS = {
  cobble:  { name: 'Cobble',  species: 'mole',   bridge: 'frost', lx: -4.3, lz: -1.6, yaw: 0.25,  radius: 0.75, scale: 1.3, arriveDelay: 0 },
  bramble: { name: 'Bramble', species: 'beaver', bridge: 'ember', lx: -4.3, lz: -1.6, yaw: -0.25, radius: 0.75, scale: 1.3, arriveDelay: 0.45 },
};
export const NPC_NEAR = 6;
export const BUILDER_ORDER = ['cobble', 'bramble'];
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

// ---- Region visibility (Step 27b). The view centre is where the camera looks at the ground. An island is drawn in full detail while
// its coastline (distance to the view centre minus its radius) is within `enter` u, and keeps it until it is `exit` u away (hysteresis, so
// walking along the boundary never flickers). The island the view is on is always full; every other island shows its cheap far version.
export const REGION_VIEW = { enter: 60, exit: 72, switchMargin: 6 };
export const FAR_TERRAIN_SEGMENTS = 64;   // far version of an island's terrain: ONE mesh, this many cells per side (~3.8 u on a big island)
export const PROP_CHUNK_SIZE = 40;        // big islands: prop layers are split into chunks this wide (u) so frustum culling can skip them
