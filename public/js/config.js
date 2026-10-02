// Central palette + tunables. Everything is exported so other modules never hardcode magic numbers.

// Game version, shown on the title card. The client can't read package.json (only public/ is deployed), so this is
// the source of truth: bump it together with "version" in package.json. Minor = last completed PLAN.md step.
export const VERSION = '0.38.2';

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

// ---- The Frostpine camp (Step 33b). Island-local coordinates (x east, z south, origin = the island centre) of the camp fire on the foothill meadow between the
// bridge landing (9.5, +114.5) and the plateau's south ramp foot (0, -7). `clear` = radius kept free of every prop, gathering spot and tool pickup (placement reads
// it); `flat` = the terrain is levelled to the fire's height inside `flat.r` and blends back to the natural ground by `flat.fade`; `paint` = the trampled-snow
// clearing painted into the terrain colours (solid inside `full`, gone by `fade`). `stumps` = the four tree-stump seats (angles in radians, x = cos, z = sin).
// Reserved for later steps (offsets from the fire, `r` = footprint; NOTHING is built there yet, they only keep the clearing from being reshuffled):
//   dens (Step 34: the eight critter dens, a north arc behind the fire), build (Step 35: windbreak / woodpile / trough / lantern posts / grove shelter),
//   tailStump (Step 36: the carved hollow log with the tails).
const _den = (i) => { const a = 1.5 * Math.PI + (i - 3.5) * 0.3; return { dx: +(Math.cos(a) * 8.8).toFixed(2), dz: +(Math.sin(a) * 8.8).toFixed(2), r: 0.9 }; };
export const FROST_CAMP = {
  x: -5, z: 28, clear: 14,
  flat: { r: 7, fade: 15 },
  paint: { full: 8.5, fade: 13.5 },
  stumps: { ring: 2.5, angles: [0.62, 2.19, 3.76, 5.33] },
  dens: Array.from({ length: 8 }, (_, i) => _den(i)),
  build: {
    windbreak: { dx: 0, dz: -5.2, r: 2.2 }, woodpile: { dx: -6.4, dz: 2.2, r: 1.1 }, trough: { dx: 6.0, dz: -0.8, r: 1.0 },
    lanterns: [{ dx: -9.2, dz: -7.0, r: 0.4 }, { dx: 9.2, dz: -7.0, r: 0.4 }, { dx: -7.0, dz: 6.2, r: 0.4 }, { dx: 10.4, dz: 7.6, r: 0.4 }],
    shelter: { dx: 9.4, dz: 3.0, r: 3.0 },
  },
  tailStump: { dx: -8.6, dz: 3.2, r: 0.9 },
};

// ---- The Frostpine critters (Step 34a): eight hungry animals in the wild, two of each species. `food` = the catalog item each species wants (both of a species want the same);
// `spots` = where each wanders (island-local anchor; islands/critterPlan.js snaps it to the nearest valid ground, so the numbers only need to be roughly right), `near` = how
// the spot is chosen ('tree' = beside a tree). `den` = the order of the camp's eight reserved den spots (FROST_CAMP.dens) the species take, two each, next to each other.
// hint = a player this close (u) makes the critter hop and think of its food (re-arms once everybody is `hintReset` away); wander = the idle roam radius round the spawn.
const _spot = (id, species, x, z, zone, near = null) => ({ id, species, x, z, zone, near });
export const CRITTERS = {
  species: ['fox', 'squirrel', 'rabbit', 'grouse'],
  food: { fox: 'snow-truffle', squirrel: 'pinecone', rabbit: 'mint', grouse: 'lingonberry' },
  spots: [
    _spot('critter-fox-0', 'fox', -48, -4, 'west forest edge'),
    _spot('critter-fox-1', 'fox', 54, 52, 'frozen lake shore'),
    _spot('critter-squirrel-0', 'squirrel', 64, -22, 'east pines', 'tree'),
    _spot('critter-squirrel-1', 'squirrel', 22, -30, 'plateau, east side', 'tree'),
    _spot('critter-rabbit-0', 'rabbit', -62, 58, 'far south-west meadow'),
    _spot('critter-rabbit-1', 'rabbit', -22, -38, 'plateau, west side'),
    _spot('critter-grouse-0', 'grouse', 6, -70, 'below the peaks'),
    _spot('critter-grouse-1', 'grouse', -45, -80, 'far northern meadow'),
  ],
  hint: 5, hintReset: 8, hintCooldown: 10, hintTime: 2.6, wander: 2, wanderMax: 6,
  radius: { fox: 0.5, squirrel: 0.4, rabbit: 0.4, grouse: 0.4 },         // collider circle (u)
  scale: { fox: 1.15, squirrel: 1.2, rabbit: 1.25, grouse: 1.25 },        // model scale: a little bigger than drawn so they read at gameplay zoom (fox ~1.15 u, rabbit ~1.25 u with ears)
};

// ---- The Frostpine camp jobs (Step 35a): the Frostpine Fire Spirit's short quest line, done in this order, one at a time. Each job takes the materials in `needs`
// ({ catalogItemId: amount }, delivered from the shared bag at the camp fire's "Camp jobs" row) and raises the camp's comfort by one when the last one arrives (35b builds
// the structures). `blurb` = the spirit's one-line description of the job. Needs at least one critter living at the camp (CRITTERS) before anything is accepted.
export const CAMP_JOBS = [
  { id: 'windbreak', name: 'Windbreak & log benches', blurb: 'A curved log wall to stop the wind, and proper benches to sit on instead of cold stumps!', needs: { 'pine-log': 10, stone: 8, 'birch-log': 4 } },
  { id: 'dens', name: 'Cozy dens & lantern posts', blurb: 'Soft beds of pine boughs for every critter, and crystal lanterns to light the way home.', needs: { 'birch-log': 8, pinecone: 12, lingonberry: 6, crystal: 3 } },
  { id: 'shelter', name: 'The grove shelter', blurb: 'A big wooden roof over the camp, with truffles for the feast pot and more lights. A proper grove!', needs: { 'pine-log': 16, stone: 10, 'snow-truffle': 6, crystal: 4 } },
];
export const CAMP_MAX_COMFORT = CAMP_JOBS.length;

// ---- The Emberleaf terrace garden (Step 37a). Island-local coordinates (x east, z south). The terraces are rings round the volcano (EMBER_FEATURES.volcano), so the
// garden is described in POLAR terms about it: `a` = angle from the volcano (atan2(dz, dx); PI/2 = due south, the default camera side; a larger angle swings west),
// `d` = distance from the volcano centre. Three tiers (flat tops, measured on Step 30's terrain at a = PI/2): top d ~ 40.5 (h 7.2), middle d ~ 48.3 (h 5.2),
// bottom d ~ 54.8 (h 3.3), each separated by a gentle 3-4 u riser. The terraces are NOT flattened; only a small pad under the hearth is levelled (`flat`).
//   x, z      the garden hearth (FIRES 'ember') on the middle tier         clear   radius kept free of tool pickups / items round it (nearAnyFire)
//   flat      the hearth pad: levelled to the hearth height inside flat.r, blending back to the natural ground by flat.fade
//   zone      the wedge kept free of every prop, gathering spot and tool pickup (|angle - zone.a| < zone.half, d0 < d < d1)
//   paint     the dark volcanic soil painted into the terrain colours (the same wedge, solid inside, soft noisy edge by `fade`; radial d0..d1)
//   tiers     the plot rows (Step 37b, reserved only): nominal d of the tier's flat, the angle offsets of its plots from the hearth line (positive = west); the
//             pure module world/islands/emberGarden.js snaps each plot to the flattest ground within +-snap u of d. `open` = usable at stage 0 (4 of the 16).
//   mossback  where Mossback the tortoise stands (Step 37a, later), garland = the garland stand (Step 40), stages = the three build-stage spots (Step 39):
//             `tier` + angle offset `da` + `r` (footprint). Nothing is built at any of these yet.
export const EMBER_GARDEN = {
  x: 15, z: 43.3, clear: 10,
  flat: { r: 3.4, fade: 8.5 },
  zone: { a: Math.PI / 2, half: 0.36, d0: 36, d1: 61 },
  paint: { half: 0.335, edge: 0.05, d0: 38.4, d1: 57.8 },
  tiers: [
    { id: 'top', d: 41.4, snap: 1.0, plots: [-0.25, -0.15, -0.05, 0.05, 0.15, 0.25], open: [] },
    { id: 'middle', d: 48.3, snap: 1.2, plots: [-0.31, -0.2, 0.2, 0.31], open: [] },
    { id: 'bottom', d: 56.0, snap: 2.6, plots: [-0.31, -0.225, -0.135, 0.135, 0.225, 0.31], open: [-0.225, -0.135, 0.135, 0.225] },   // (the middle of the bottom tier is the ramp the trail arrives on: no plots)
  ],
  mossback: { tier: 'middle', da: 0.13, r: 1.3 },
  garland: { tier: 'middle', da: -0.13, r: 1.2 },
  stages: [
    { tier: 'bottom', da: 0, r: 1.6 },         // stage 1: a gate / arch where the trail arrives on the bottom tier's ramp
    { tier: 'top', da: 0.32, r: 1.6 },          // stage 2: the irrigation channel's inlet, nearest the waterfall
    { tier: 'top', da: -0.32, r: 1.6 },         // stage 3: the glow-lantern arbour at the top tier's east end
  ],
};

// ---- The garden's plots and Mossback the tortoise (Step 37b). The 16 plots sit at the EMBER_GARDEN.tiers spots (game/gardenLogic.js numbers them: top row 0-5, middle 6-9, bottom 10-15).
// `plotOpenStage` = the garden stage at which a tier's plots open (the bottom tier's `open` plots are usable from the start: stage 0 = 4 plots, stage 1 = 8, stage 2 = all 16; Step 39).
// `plotStages` = what a plot shows (Step 38b): empty soil, a planted seed (untended), a sprout (tended), a bud (after the next dusk), a bloom (at the dawn after the night).
// `reach` = how far (u, from the plot's surface) the HOST accepts a remote plant / tend / cutting request; `springReach` the same for "Fill a coconut" at the hot spring (from its rim).
// `bloomOpenDay` = how far a bloom has opened by day (1 = fully open, which it is at night); `maxCuttings` caps the cuttings in stock (one per bloom, so 16 is more than enough).
export const GARDEN = {
  plotOpenStage: { top: 2, middle: 1, bottom: 2 },
  plotStages: ['empty', 'seed', 'sprout', 'bud', 'bloom'],
  maxStage: 3,
  plotRadius: 0.75,
  reach: 3.6,
  springReach: 4.6,
  bloomOpenDay: 0.86,
  maxCuttings: 16,
};
// Mossback (world/mossback.js, npc/mossback.js): `wakeR` = a player this close (u) wakes him from his doze; `nearR` = he turns slowly towards the nearest player within this; `radius` = collider.
export const MOSSBACK = { name: 'Mossback', radius: 0.8, scale: 1.5, wakeR: 5.5, nearR: 6.5, yaw: 0.25, talkRadius: 1.0 };

// ---- The eight Night-Bloom seeds (Step 38a; world/seeds.js, game/seedLogic.js, world/islands/emberSeeds.js). `times` = the hour windows (0..24, wrapping) in which the night / dusk finds work AND their cues show
// (the dusk window is wider than the 45 s dusk phase so it can be caught). `reach` = how far (u, to the target's surface) the host accepts a REMOTE actor's find. `digImpact` = the shovel swing progress at
// which the blade hits the soil. `fade` = hours over which a cue fades in / out at a window edge. `anchors` = island-local design points the deterministic plan snaps to: the lagoon shore angle, the black-sand
// beach, the hot spring's rim angle, how far the ash spot sits in from the ramp's end. Under ?daylock the clock never moves, so a night / dusk find is only possible if the locked hour is inside its window
// (?time=night&daylock); the debug hook __game.garden.findSeed(id) ignores the rules.
export const SEEDS = {
  times: { night: [19.5, 5.5], dusk: [17.5, 20.5] },
  reach: 4.7,
  digImpact: 0.58,
  fade: 0.5,
  anchors: { lotusAngle: 1.9, beach: { x: -100, z: 40 }, springAngle: 3.3, ashLift: 2.5 },
};

// ---- The reserved waterfall (Step 37c, NOT built yet). Kept out of every prop / gathering spot / tool placement NOW so Emberleaf's seeded placement is only reshuffled once.
// `angle` = the fall line's angle from the volcano centre; `from` / `to` = distance along it (the main fall at ~36-40 u, the terrace cascades out to ~60 u); `half` = the corridor's
// half width. `pool` = the plunge pool (island-local centre, `r` = the exclusion radius: pool, its shore and the ledge approach). `stream` = the island-local polyline from
// the cascade foot to the lagoon's east shore, `streamHalf` its half width. The garden trail (PATHS 'ember-garden') CROSSES the stream once: a shallow, walkable ford (37c keeps it).
export const EMBER_WATERFALL = {
  angle: 2.1, from: 32, to: 61, half: 4.6,
  pool: { x: -5.5, z: 30, r: 8 },
  stream: [[-15.3, 46.8], [-22, 48.7], [-30, 50.4], [-36.5, 51.6]], streamHalf: 3.6,
  // Step 37c, the BUILT design (islands/emberFalls.js). Coordinates are in the fall frame: `s` = distance from the volcano centre along the fall line (angle above), `u` = sideways
  // (positive = west / north-west), `y` = a world height. The water drops from the spring (s 33) down a short channel over a rock lip (`slab`) into the plunge pool, whose
  // spill runs down the three terraces (`cascade`) and across the jungle floor (`stream`, island-local points above) to the lagoon.
  falls: {
    spring: { s: 33.2, r: 1.9, y: 10.46, depth: 0.32 },                    // the source pool on the cone, fed from a crack in the rock
    channel: { s0: 34.6, s1: 36.6, hw: 0.8, depth: 0.28 },                  // spring -> lip (the water surface eases down to slab.y)
    slab: { s0: 36.3, s1: 39.2, y: 10.0, hw: 2.0 },                         // the rock lip the water slides over (visual only), the sheet leaves its front edge
    sheet: { hw: 1.5, drop: 3.2, run: 1.5 },                               // the falling curtain (half width, vertical drop to the pool, outward run)
    pool: { s: 41.6, r: 3.4, y: 6.8, depth: 0.8, rim: 0.28, outlet: 1.1 },  // plunge pool: surface y, basin depth, shore rim above the water, outlet notch half width
    ledge: { y: 7.78, s0: 38.7, s1: 40.0, uEnd: -1.9, uBank: 5.6 },        // the shelf behind the falling water: east end (dead end, Step 38a's seed), west end joins the pool's bank
    cascade: { s0: 45.2, s1: 60, hw: 0.9, depth: 0.32 },                    // the shallow channel down the terraces
    stream: { hw: 1.25, depth: 0.4, ford: 2.2 },                            // the jungle-floor stream to the lagoon; `ford` = half length of the extra-shallow crossing
  },
};

// ---- Trails (Step 33b, world/paths.js): a path is a loosely meandering, painted-in walking trail. `points` = island-local control points (a Catmull-Rom curve
// goes through them), `width` = painted width (u; soft edges, full colour inside ~1/3 of it), `wobble` = seeded sideways drift (u) on top of the curve, `seed`
// = its random seed, `surface` = 'snow' | 'dirt' (the painted colours), `marker` = a wooden post with a lantern every `every` u of the trail, `side` u beside it
// (alternating sides, glowing at night). Nothing else is placed on a path (props, gathering spots and tools keep `width / 2 + clearance` away) and it is
// walkability-tested. Step 37a added Emberleaf's garden trail as the second entry.
export const PATHS = [
  {
    id: 'frost-camp', island: 'frost', name: 'Camp trail',
    points: [[9.5, 111], [7, 98], [16, 84], [6, 70], [-2, 60], [8, 49], [-1.8, 34.6]],
    width: 3.0, wobble: 1.1, seed: 7301, surface: 'snow', marker: { every: 15, side: 2.3 },
  },
  // Emberleaf's garden trail (Step 37a): from the bridge landing's spit across the western jungle, round the north of the lagoon, over the future stream's ford and up to the
  // garden's bottom tier. Packed earth with black-sand flecks ('earth'), bamboo torch posts instead of lanterns (the same `marker` mechanism).
  {
    id: 'ember-garden', island: 'ember', name: 'Garden trail',
    points: [[-110, -46], [-94, -44.5], [-81, -35], [-71, -21], [-63, -4], [-58, 14], [-48, 28], [-36, 38], [-27, 46], [-20, 57], [-6, 61], [8, 61], [14, 58.5]],
    width: 3.0, wobble: 1.0, seed: 7303, surface: 'earth', marker: { every: 13, side: 2.2 },
  },
];
export const PATH_CLEARANCE = 1.4;       // u beyond the painted half width that props / gathering spots / tools keep from a path (solid props add their own radius and the lane half width)

// ---- Campfires (Step 14: stone firepit + log benches on the flat meadow east of the spawn, visible from the first frame, clear of the sign).
// Every campfire in the world (Step 33a): home's and (Step 33b) Frostpine's camp fire and (Step 37a) Emberleaf's garden hearth: add an entry here and
// world/campfire.js builds an instance for it (campfires.get(id)). `island` = the island whose recipes it cooks (and whose Cook menu it shows);
// `x`/`z` = world position; `bench` = the log benches round the fire (angles in radians, x = cos, z = sin); `feast` = the feast scene's framing
// at THIS fire (camera distance / pitch / orbit, ground half-width that must fit, an optional bench order that replaces the camera-facing order);
// `light` = the shared fire light's numbers when this fire is the one it sits on (see createCampfires). Home's values are the Step 14 / 15 originals.
const FROST_ISLAND = ISLANDS.find((i) => i.id === 'frost');
const EMBER_ISLAND = ISLANDS.find((i) => i.id === 'ember');
export const FIRES = [
  {
    id: 'home', name: 'Campfire', label: 'campfire', island: 'home', x: 7, z: 9.5, clear: 4.5,
    bench: { ring: 2.6, len: 1.7, angles: [0.62, 2.19, 3.76, 5.33] },
    feast: { camDist: 9.4, camPitch: 0.5, orbit: 25 * Math.PI / 180, halfWidth: 3.7, seatOrder: null },
    light: { height: 1.1, base: 1.6, perLevel: 2.2, dist0: 7, distPerLevel: 2.6 },
  },
  // Frostpine's camp fire (Step 33b): the heart of the camp (FROST_CAMP, above): four tree-stump seats (bench.style 'stump': one seat per stump, `len` unused),
  // snow-dusted stones, its own fuel / save / sync domain ('campfire:frost'), and ONLY Frostpine's recipes. `spirit` = who speaks in its menu; `camp` = it has the
  // intro page + "Camp jobs" row (game/campCamp.js). The feast camera is a little flatter than home's so the plateau shows behind the camp.
  {
    id: 'frost', name: 'Frostpine camp', label: 'camp fire', island: 'frost', spirit: 'Frostpine Fire Spirit', camp: true, snowy: true,
    x: FROST_ISLAND.x + FROST_CAMP.x, z: FROST_ISLAND.z + FROST_CAMP.z, clear: FROST_CAMP.clear,
    bench: { ring: FROST_CAMP.stumps.ring, len: 0, angles: FROST_CAMP.stumps.angles, style: 'stump', logLen: 1.7 },
    feast: { camDist: 9.8, camPitch: 0.44, orbit: 25 * Math.PI / 180, halfWidth: 3.9, seatOrder: null },
    light: { height: 1.1, base: 1.6, perLevel: 2.2, dist0: 7, distPerLevel: 2.6 },
  },
  // Emberleaf's garden hearth (Step 37a): on the garden's middle terrace (EMBER_GARDEN, above), a ring of dark basalt stones with four flat basalt seats (bench.style
  // 'basalt'), levelled pad, its own fuel / save / sync domain ('campfire:ember') and ONLY Emberleaf's recipes. `intro` = the first-open pages (game/campMenu.js); `jobs: false` = no
  // "Camp jobs" row (the garden's story and jobs come with Mossback, Steps 37b-39). The explicit seat order puts the two far (north, volcano-side) seats first, so seated
  // players face the camera with the volcano glowing behind them.
  {
    id: 'ember', name: 'Garden hearth', label: 'garden hearth', island: 'ember', spirit: 'Hearth Spirit', camp: true, jobs: false, stones: 'basalt',
    intro: [
      'Mmm... a warm soul at last! I am the old hearth of these terraces. Feel how the stones still hold the heat?',
      'Look around you: three terraces of dark soil, cracked old stones and a broken trellis. It looks as if somebody once kept a garden here.',
      'Keep my fire fed and cook something with island flavour. I\'ll be right here, glowing.',
    ],
    x: EMBER_ISLAND.x + EMBER_GARDEN.x, z: EMBER_ISLAND.z + EMBER_GARDEN.z, clear: EMBER_GARDEN.clear,
    bench: { ring: 2.5, len: 0, angles: [0.62, 2.19, 3.76, 5.33], style: 'basalt' },
    feast: { camDist: 9.6, camPitch: 0.4, orbit: 25 * Math.PI / 180, halfWidth: 3.9, seatOrder: [2, 3, 1, 0] },
    light: { height: 1.1, base: 1.6, perLevel: 2.2, dist0: 7, distPerLevel: 2.6 },
  },
];
// `clear` = radius around a fire kept free of props / herbs / dig spots / tool pickups (the benches sit at ~2.6u).
export const CAMPFIRE = FIRES[0];          // the home fire (kept for the code that only ever meant "the" campfire)
// Islands that have a campfire, DERIVED from FIRES. Each fire cooks only its own island's recipes (catalog RECIPES[].island), so a dish is only makeable
// while its island has a fire, and feast quests needing an unmakeable dish stay out of the quest pool.
export const CAMPFIRE_ISLANDS = [...new Set(FIRES.map((f) => f.island))];
/** Is (x, z) inside any fire's keep-clear zone (+ `pad`, e.g. half a prop's radius)? Props, herbs, dig spots and tool pickups use it. */
export const nearAnyFire = (x, z, pad = 0) => FIRES.some((f) => Math.hypot(x - f.x, z - f.z) < f.clear + pad);
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
