// Glimmerfrost Caves as area data (Step 59): Frostpine's combat area, a glittering ice cave that teaches the SLINGSHOT and the first real charm, FROST NOVA. The framework in
// game/areaLogic.js builds one tile grid from these sections. Everything is local to `origin` (1200, 1400) and on the 2 u tile grid (every rect edge is even); the party works
// NORTH (decreasing z) from the Ice Mouth at z +64 to the Glacier Hall at z -118, each section reachable only through the previous one's gate:
//
//   z  +64 .. +46   0  The Ice Mouth        (grounds, safe)    the weapon rack (sword / axe / hammer / slingshot), the charm rack, practice dummies, the homeward portal      objective  train
//       +46 .. +38      a short ice stair, its gate shut until the party has practised (or 30 s have passed)
//       +40 .. +14   1  The Frozen Ford     (cavern)           four Frost Nova pedestals, two slow snow puffs, a channel of dark water across the way               objective  freeze
//       +14 ..  +8      the ford itself (the section's gate = the ICE BRIDGE: water while shut, ice once a Frost Nova froze it, then it stays)
//        +8 .. -30   2  The Snowfield       (grounds)          four little friends frozen in ice blocks, guarded by snow puffs and icicle bats                       objective  rescue
//       -30 .. -92   3  The Icicle Gauntlet (gauntlet)         three rooms where icicles fall (a dodge-hop does not clear them), the Frostcap mushroom in the last        objective  clear
//       -94 .. -118  4  The Glacier Hall    (arena, r 12)      the Snow Golem and its second phase                                                                  objective  bosses
//
// The teaching order is Introduce (the ford: charm + freeze) -> Practice (the snowfield: flyers, rescue, shatter) -> Test (the gauntlet) -> Remix (the golem). Spawn tuples are
// `[kind, x, z, extra?, flags?]` (see dungeonLogic buildEnemies); `extra` = more of the same by party size 1..4.
import { mapFloor } from './mapTypes.js';

const R = (x0, z0, x1, z1, extra = {}) => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, ...extra });
const carve = (x, z, r, kind = 'boulder') => ({ shape: 'circle', x, z, r, carve: true, kind });          // kind: 'boulder' (an ice boulder; the look, world/caveDress.js)
const shrine = (x, z, r = 3) => ({ x, z, r });

// ---- 0  the Ice Mouth: a wide cave floor with the weapon rack (world/items.js puts the reserved pickups at `SUPPLY`), the charm rack and practice dummies
export const SUPPLY = { x: -7, z: 48.5, dx: 4.5, dz: 2.5, kinds: ['sword', 'axe', 'hammer', 'slingshot'],       // pickup slot s, weapon i: (x + s dx, z + i dz)
  extraAt: { 'watering-can': { x: -12.2, z: 47.6, sx: 0, sz: 1.6 } } };                                          // (Step 60: the watering can, learned in Cinder Tubes, stands in a column of its own)
export const RACK = { x: -9, z: 58.5, dx: 2.2 };
const MOUTH = R(-14, 46, 14, 64), STAIR = R(-4, 38, 4, 46);
// ---- 1  the ford: two joined cave rooms, then the channel (the gate of this section)
export const FROST_NOVA_PEDESTALS = [-1.5, 1.5, -4.5, 4.5].map((x) => ({ x, z: 31.5, charm: 'frost-nova' }));     // one per friend (a run shows the first <party size>, so centre-out)
export const FORD = R(-4, 8, 4, 14);                                                                              // the water strip (the ice bridge once frozen)
const FORD_CAVE = mapFloor('cavern', { circles: [{ x: 0, z: 30, r: 10 }, { x: 0, z: 20, r: 6 }], link: 6 });
// ---- 2  the snowfield: a broad snowy cave with ice boulders for cover; the friends wait in their blocks
const FIELD = mapFloor('grounds', { x: 0, z: -12, r: 20, wobble: 0.08, lobes: 4, seed: 2,
  obstacles: [{ x: -9, z: -2, r: 2.2 }, { x: 8, z: -14, r: 2.6 }, { x: -6, z: -22, r: 2 }, { x: 12, z: -3, r: 2 }] });
export const RESCUE_EXIT = { x: 0, z: -30 };
// ---- 3  the gauntlet: three rooms joined by short corridors; icicles fall in the zones
const GAUNTLET = mapFloor('gauntlet', { x: 0, z: -36, dir: '-z', rooms: [{ len: 14, w: 16 }, { len: 14, w: 16 }, { len: 16, w: 16 }], corridor: { len: 6, w: 4 } });
export const ICICLE_ZONES = [R(-8, -50, 8, -36), R(-8, -70, 8, -56), R(-8, -92, 8, -76)];
// ---- 4  the glacier hall
const ARENA = { shape: 'circle', x: 0, z: -106, r: 12 };

export const GLIMMERFROST = {
  id: 'glimmerfrost', name: 'Glimmerfrost Caves', island: 'frost', look: 'cave', ground: 'snow',
  origin: { x: 1200, z: 1400, y: 8 },
  exit: { x: -11.5, z: 56 },                  // the homeward portal, in the Ice Mouth
  // The way in from Frostpine (world/caveMouth.js): the ice cave on the west bank of the frozen lake. It opens as soon as the Frostpine bridge is built (you cannot get there before).
  entrance: { id: 'glimmerfrost-mouth', island: 'frost', x: 22, z: -154, opens: 'bridge' },
  rack: RACK, supply: SUPPLY,
  armory: { weapons: ['slingshot'], charms: ['frost-nova'] },     // added to the Armory when its Wild mode is cleared: every area's rack then offers them
  rewards: { crystal: 3, 'snow-truffle': 2, lingonberry: 4 },
  clearText: 'The Snow Golem crumbles into a friendly snowdrift and the caves glitter in peace!',
  trophy: { id: 'snowgolem', name: 'Snow Golem trophy' },      // appears beside the cave mouth on Frostpine once this area's Wild mode is cleared
  sections: [
    { id: 'mouth', name: 'The Ice Mouth', mapType: 'grounds', dress: 'mouth', floor: [MOUTH, STAIR],
      start: { x: -2.7, z: 62, step: 1.8 }, safe: [MOUTH],
      enemies: [['dummy', 10, 50], ['dummy', 10, 55], ['wavedummy', 11, 60]],
      objective: { type: 'train', label: 'Try every move' }, gate: { shapes: [R(-4, 40, 4, 42)] } },
    { id: 'ford', name: 'The Frozen Ford', mapType: 'cavern', dress: 'ford', floor: FORD_CAVE,
      start: { x: -2.7, z: 36.5, step: 1.8 }, safe: [shrine(0, 36.5)],
      pedestals: FROST_NOVA_PEDESTALS,
      enemies: [['puff', -3, 24], ['puff', 4, 20, [0, 0, 1, 1]]],
      objective: { type: 'freeze', label: 'Freeze the water with Frost Nova', target: FORD },
      gate: { look: 'water', shapes: [FORD] } },
    { id: 'snowfield', name: 'The Snowfield', mapType: 'grounds', dress: 'snowfield', floor: [...FIELD, R(-4, -36, 4, -28)],
      start: { x: -2.7, z: 3, step: 1.8 }, safe: [shrine(0, 3)],
      enemies: [['hareblock', -10, -8], ['chickblock', 10, -10], ['hareblock', -2, -19], ['chickblock', 5, -24],
        ['puff', -1, -8], ['puff', 3, -16, [0, 0, 1, 1]], ['bat', -8, -14], ['bat', 9, -20, [0, 0, 0, 1]]],
      objective: { type: 'rescue', label: 'Free the frozen friends', exit: RESCUE_EXIT }, gate: { shapes: [R(-4, -36, 4, -34)] } },
    { id: 'gauntlet', name: 'The Icicle Gauntlet', mapType: 'gauntlet', dress: 'gauntlet', floor: [...GAUNTLET, R(-2, -94, 2, -92)],
      start: { x: -2.7, z: -39, step: 1.8 }, safe: [shrine(0, -39)],
      enemies: [['puff', -4, -47], ['puff', 4, -47], ['bat', 0, -47.6],
        ['bat', -4, -62], ['bat', 4, -64, [0, 0, 1, 1]], ['puff', 0, -66],
        ['frostcap', 0, -86], ['puff', -5, -82], ['puff', 5, -82, [0, 0, 1, 1]]],
      icicles: { zones: ICICLE_ZONES, every: 2.6, max: 3 },
      objective: { type: 'clear', label: 'Defeat the guardians' }, gate: { shapes: [R(-2, -94, 2, -92)] } },
    { id: 'glacier', name: 'The Glacier Hall', mapType: 'arena', dress: 'glacier', floor: [ARENA],
      start: { x: -2.7, z: -98, step: 1.8 }, safe: [shrine(0, -98)],
      enemies: [['golem', 0, -111]], phase2: { adds: [['puff', -6, -106, [0, 1, 1, 2]], ['puff', 6, -106, [0, 0, 1, 1]]] },
      objective: { type: 'bosses', label: 'Defeat the Snow Golem' }, gate: null },
  ],
};
