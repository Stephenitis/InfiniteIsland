// Wildroot Hollow as area data (Step 56, reworked into the five-part tutorial area by Step 57): the framework in game/areaLogic.js builds one tile grid from these sections.
// Everything is local to `origin` (1200, 1000) and on the 2 u tile grid (every rect's edges are even numbers; `R(x0, z0, x1, z1)` builds a rect from its edges). The party starts
// in the SOUTH and works north, each section reachable only through the previous one's gate:
//
//   z  +62 .. +46   0  The Rootgate bailey   (grounds, safe)   the weapon rack (north), the practice dummies (south), the portal (west)   objective  train
//       +46 .. +38      a short stair, its gate closed until the party has practised (or 30 s have passed)
//       +38 .. +12   1  The Overgrown Gardens (grounds)         hedges, planters, a fountain, three lanterns that each start a wave   objective  light
//       +12 .. -28   2  The Castle Halls      (maze)            the 17 rooms of Steps 41-42 (the old bailey and throne are gone)      objective  collect (3 seal shards)
//       -28 .. -46   3  Ivy Ramparts 1 / 3    (gauntlet)        a wall walk of three small rooms, each exit closed until it is clear  objective  clear
//       -46 .. -64   4  Ivy Ramparts 2 / 3
//       -64 .. -82   5  Ivy Ramparts 3 / 3
//       -82 .. -102  6  The Overgrown Throne  (arena, r 10)     the Pumpkin Patchkeeper and its second phase                          objective  bosses
//
// `ROOMS` is the castle halls (section 2) only; the other sections' floors are built right here. `SPAWNS` = the halls' guardians (kept for older tests / tools).
// Spawn tuples are `[kind, x, z, extra?, flags?]` (`extra` = more of the same by party size 1..4, see dungeonLogic buildEnemies).
const R = (x0, z0, x1, z1, extra = {}) => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, ...extra });
const carve = (x0, z0, x1, z1, kind = 'hedge') => R(x0, z0, x1, z1, { carve: true, kind });          // kind: 'hedge' | 'planter' (the look, world/castleRuins.js)
// A section's checkpoint shrine: guardians never enter it, nothing hurts inside. (The bailey's safe shape is its whole yard.)
const shrine = (x, z, r = 3) => ({ x, z, r });

export const ROOMS = [
  { name: 'Gate passage', x: 0, z: 7, w: 8, d: 10 },
  { name: 'Root hall', x: 0, z: 0, w: 12, d: 12 },
  { name: 'West passage', x: -10, z: 0, w: 16, d: 4 },
  { name: 'Fern library', x: -20, z: -4, w: 12, d: 12 },
  { name: 'Lost pantry passage', x: -30, z: -4, w: 16, d: 4 },
  { name: 'Lost pantry', x: -36, z: -4, w: 8, d: 8, deadEnd: true },
  { name: 'Cloister passage', x: -20, z: -14, w: 4, d: 16 },
  { name: 'North cloister', x: -10, z: -20, w: 24, d: 4 },
  { name: 'Well passage', x: -28, z: -20, w: 16, d: 4 },
  { name: 'Forgotten well', x: -34, z: -20, w: 8, d: 8, deadEnd: true },
  { name: 'King\'s passage', x: 0, z: -16, w: 4, d: 24 },
  { name: 'East passage', x: 10, z: -4, w: 16, d: 4 },
  { name: 'Bent passage', x: 20, z: -7, w: 4, d: 14 },
  { name: 'Ivy courtyard', x: 20, z: -12, w: 12, d: 12 },
  { name: 'Reliquary passage', x: 30, z: -12, w: 16, d: 4 },
  { name: 'Bloom reliquary', x: 36, z: -12, w: 8, d: 8, deadEnd: true },
  { name: 'East cloister', x: 20, z: -26, w: 4, d: 20 },
];

// ---- 0  the bailey: a yard with the practice dummies and the weapon rack (world/items.js puts the 12 reserved weapon pickups at `SUPPLY`)
export const RACK = { x: -7, z: 55.5, dx: 2.2 };                  // Step 58: the Armory's charm pedestals (none yet: the first charms are hidden in Steps 59-61's areas)
export const SUPPLY = { x: -7, z: 48.5, dx: 4.5, dz: 2.5 };        // pickup slot s, weapon i: (x + s dx, z + i dz)
const BAILEY = R(-12, 46, 12, 62), STAIR = R(-4, 38, 4, 46);
// ---- 1  the gardens: a wide yard with hedge rows and planters carved out (cover and sightlines), a fountain, three lanterns
const GARDEN = { shape: 'rect', ...R(-16, 12, 16, 38) };
const GARDEN_CARVES = [
  carve(-16, 12, -6, 14), carve(6, 12, 16, 14),                      // the north hedges frame the doorway to the halls
  carve(-10, 28, -4, 30), carve(4, 28, 10, 30),                      // the two hedge rows south of the fountain
  carve(-12, 24, -8, 28, 'planter'), carve(8, 24, 12, 28, 'planter'),   // flower planters
  { shape: 'circle', x: 0, z: 21, r: 3, carve: true },               // the fountain
];
export const GARDEN_LANTERNS = [
  { x: -11, z: 19, wave: [['sprout', -13, 16], ['berry', -8, 16, [0, 1, 1, 2]]] },
  { x: 11, z: 19, wave: [['radish', 13, 16], ['berry', 8, 16], ['sprout', 12, 22, [0, 0, 1, 1]]] },
  { x: 0, z: 16, wave: [['radish', -5, 19], ['radish', 5, 19], ['carrot', 0, 26, [0, 0, 1, 1]]] },
];
// ---- 2  the halls' guardians (eight, spread through the maze; the walnut waits in the Bloom reliquary with the third shard)
export const SPAWNS = [
  ['berry', -20, -2], ['carrot', -20, -7], ['sprout', -30, -4], ['carrot', -36, -2],
  ['turnip', -10, -20], ['sprout', -28, -20],
  ['carrot', 20, -9], ['walnut', 35, -12, [0, 0, 0, 1]],
];
export const SEAL_SHARDS = [{ x: -37, z: -4 }, { x: -35, z: -18 }, { x: 37, z: -12 }];     // Lost pantry, Forgotten well, Bloom reliquary
export const SEAL_ALTAR = { x: 0, z: 0 };                                                    // the hall seal, in the Root hall
// ---- 3-5  the ramparts: three small rooms along a wall walk, joined by stairs whose gate stays shut until the room before is clear
const RAMPART = (z0, z1) => R(-8, z0, 8, z1), RSTAIR = (z0, z1) => R(-2, z0, 2, z1);
// ---- 6  the throne: a round arena
const ARENA = { shape: 'circle', x: 0, z: -92, r: 10 };

export const WILDROOT = {
  id: 'wildroot', name: 'Wildroot Hollow', island: 'home',
  origin: { x: 1200, z: 1000, y: 8 },
  exit: { x: -10, z: 56 },                   // the homeward portal, in the bailey
  // The way in from the island (the Rootgate, world/rootgate.js): `island` = where, x / z world, `opens` = the condition the gate waits for.
  entrance: { id: 'rootgate', island: 'home', x: 27, z: -23, opens: 'feast' },
  rack: RACK,
  // Step 59: the weapon pickups of the bailey (world/items.js): the three base kinds on the grid; a kind the Armory learns later (the slingshot) stands in `extra`'s column (slot s at x + s sx, z + s sz)
  supply: { ...SUPPLY, kinds: ['sword', 'axe', 'hammer'], extra: { x: 10, z: 47.6, sx: 0, sz: 1.6 } },
  armory: { weapons: ['sword', 'axe', 'hammer'], charms: [] },   // added to the Armory when its Wild mode is cleared
  rewards: { crystal: 3, herb: 5 },            // the party's reward for every clear (the shared bag)
  clearText: 'The Pumpkin Patchkeeper is tamed and the ruins are peaceful!',
  trophy: { id: 'patchkeeper', name: 'Patchkeeper trophy' },   // appears beside the Rootgate on home once this area's Wild mode is cleared (world/rootgate.js)
  sections: [
    { id: 'bailey', name: 'The Rootgate Bailey', mapType: 'grounds', dress: 'yard', floor: [BAILEY, STAIR],
      start: { x: -2.7, z: 58, step: 1.8 }, safe: [R(-12, 46, 12, 62)],
      enemies: [['dummy', -6, 60], ['dummy', 6, 60], ['wavedummy', 9, 54]],
      objective: { type: 'train', label: 'Try every move' }, gate: { shapes: [R(-4, 40, 4, 42)] } },
    { id: 'gardens', name: 'The Overgrown Gardens', mapType: 'grounds', dress: 'garden', floor: [GARDEN, ...GARDEN_CARVES],
      start: { x: -2.7, z: 35.5, step: 1.8 }, safe: [shrine(0, 35.5)], enemies: [],
      objective: { type: 'light', label: 'Light the lanterns', sequential: true, braziers: GARDEN_LANTERNS }, gate: { shapes: [R(-4, 10, 4, 12)] } },
    { id: 'halls', name: 'The Castle Halls', mapType: 'maze', dress: 'castle', floor: ROOMS,
      start: { x: -2.7, z: 6, step: 1.8 }, safe: [shrine(0, 6)], enemies: SPAWNS,
      objective: { type: 'collect', label: 'Seal shards', pieces: SEAL_SHARDS, altar: SEAL_ALTAR }, gate: { shapes: [R(-2, -28, 2, -26)] } },
    { id: 'rampart-1', name: 'Ivy Ramparts 1 / 3', mapType: 'gauntlet', dress: 'rampart', floor: [RAMPART(-40, -28), RSTAIR(-46, -40)],
      start: { x: -2.7, z: -31, step: 1.8 }, safe: [shrine(0, -31)],
      enemies: [['cabbage', 0, -38], ['berry', -5, -35], ['berry', 5, -35]],
      objective: { type: 'clear', label: 'Defeat the guardians' }, gate: { shapes: [R(-2, -46, 2, -44)] } },
    { id: 'rampart-2', name: 'Ivy Ramparts 2 / 3', mapType: 'gauntlet', dress: 'rampart', floor: [RAMPART(-58, -46), RSTAIR(-64, -58)],
      start: { x: -2.7, z: -49, step: 1.8 }, safe: [shrine(0, -49)],
      enemies: [['cabbage', -4, -55, [0, 0, 1, 1]], ['carrot', 5, -55], ['sprout', 0, -53, [0, 0, 0, 1]]],
      objective: { type: 'clear', label: 'Defeat the guardians' }, gate: { shapes: [R(-2, -64, 2, -62)] } },
    { id: 'rampart-3', name: 'Ivy Ramparts 3 / 3', mapType: 'gauntlet', dress: 'rampart', floor: [RAMPART(-76, -64), RSTAIR(-82, -76)],
      start: { x: -2.7, z: -67, step: 1.8 }, safe: [shrine(0, -67)],
      enemies: [['cabbage', -4, -73], ['cabbage', 4, -73, [0, 0, 0, 1]], ['turnip', 0, -71]],
      objective: { type: 'clear', label: 'Defeat the guardians' }, gate: { shapes: [R(-2, -82, 2, -80)] } },
    { id: 'throne', name: 'The Overgrown Throne', mapType: 'arena', dress: 'throne', floor: [ARENA],
      start: { x: -2.7, z: -84, step: 1.8 }, safe: [shrine(0, -84)],
      enemies: [['pumpkin', 0, -94]], phase2: { adds: [['sprout', -5, -90, [0, 1, 1, 2]], ['sprout', 5, -90, [0, 0, 1, 1]]] },
      objective: { type: 'bosses', label: 'Defeat the Patchkeeper' }, gate: null },
  ],
};
