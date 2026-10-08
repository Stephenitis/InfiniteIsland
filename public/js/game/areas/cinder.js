// Cinder Tubes as area data (Step 60): Emberleaf's combat area, a set of lava tubes inside the volcano that teaches the WATERING CAN, the EMBER SEED charm and the first REACTIONS between friends
// (water + frost, fire + frost, water + fire). The framework in game/areaLogic.js builds one tile grid from these sections. Everything is local to `origin` (1200, 1800) and on the 2 u tile
// grid (every rect edge is even); the party works NORTH (decreasing z) from the Tube Mouth at z +72 to the Magma Hall at z -134, each section reachable only through the previous one's gate:
//
//   z  +72 .. +54   0  The Tube Mouth     (grounds, safe)   the weapon rack (sword / axe / hammer / WATERING CAN), the charm rack, practice dummies, the homeward portal       objective  train
//       +54 .. +46      a short stair, its gate shut until the party has practised (or 30 s have passed)
//       +46 .. +10   1  The Ember Channel (gauntlet)        four Ember Seed pedestals, lava pools, pepper imps and a lava slug; a wall of BRAMBLES closes the way               objective  burn
//        +10 ..  +6      the brambles (the section's gate): an Ember Seed's burst burns them away
//         +6 .. -46   2  The Terraces      (terraces, h 0 / 2 / 4) three tiers joined by two ramps; a young sapling stands on the middle tier; waves come down the ramps    objective  defend 45 s
//       -44 .. -46      the upper tier's exit (h 4)
//       -46 .. -64      a long ramp down (part of the next section's floor)
//       -64 .. -104  3  The Pepper Grove  (grounds)         three named Pepper Chiefs (fast, shielded, splitting) among pepper plants                                       objective  hunt
//      -106 .. -134  4  The Magma Hall    (arena, r 12)     the Magma Toad, its lava blobs and its magma shell                                                                objective  bosses
//
// The teaching order is Introduce (the channel: charm + burn) -> Practice (the terraces: watering can, rain cloud, defend) -> Test (the grove: hunt, modifiers) -> Remix (the toad: wet + frost cool its
// shell). Spawn tuples are `[kind, x, z, extra?, flags?]` (see dungeonLogic buildEnemies); `extra` = more of the same by party size 1..4; flags `{ boss }` or `{ chief, name }` (hunt targets).
import { mapFloor } from './mapTypes.js';

const R = (x0, z0, x1, z1, extra = {}) => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, ...extra });
const lava = (x, z, r) => ({ shape: 'circle', x, z, r, carve: true, kind: 'lava' });             // a pool of lava: a pit-style wall (the dodge-hop does not cross it); the look is world/lavaDress.js
const rock = (x, z, r) => ({ shape: 'circle', x, z, r, carve: true, kind: 'rock' });             // a basalt pillar
const pepper = (x, z, r) => ({ shape: 'circle', x, z, r, carve: true, kind: 'pepper' });         // a big pepper plant
const shrine = (x, z, r = 3) => ({ x, z, r });

// ---- 0  the Tube Mouth: a wide basalt floor with the weapon rack (world/items.js puts the reserved pickups at `SUPPLY`), the charm rack and practice dummies
export const SUPPLY = {
  x: -7, z: 56.5, dx: 4.5, dz: 2.5, kinds: ['sword', 'axe', 'hammer', 'watering-can'],          // pickup slot s, weapon i: (x + s dx, z + i dz); the watering can is this area's own
  extra: { x: -12, z: 55.6, sx: 0, sz: 1.6 },                                                    // a weapon the Armory learned elsewhere (the slingshot) stands in this column
};
export const RACK = { x: -9, z: 67, dx: 2.2 };
const MOUTH = R(-14, 54, 14, 72), STAIR = R(-4, 46, 4, 54);           // (playtest 0.60.0: moved 8 u south so the channel's first room has room to breathe)
// ---- 1  the channel: two lava-lit rooms joined by a narrow tube, lava pools on the sides; the brambles close the far end (the gate)
export const EMBER_SEED_PEDESTALS = [-1.5, 1.5, -4.5, 4.5].map((x) => ({ x, z: 42.5, charm: 'ember-seed' }));   // one per friend (a run shows the first <party size>, so centre-out)
export const BRAMBLES = R(-4, 6, 4, 10);                                                                      // the bramble wall (the gate; the burn target)
const CHANNEL = [
  ...mapFloor('gauntlet', { x: 0, z: 46, dir: '-z', rooms: [{ len: 22, w: 18 }, { len: 10, w: 12 }], corridor: { len: 4, w: 4 } }),
  lava(-5.5, 28.5, 2), lava(5.5, 28.5, 2), lava(0, 15, 2.2),
];
// ---- 2  the terraces: lower tier (h 0), middle tier (h 2, the sapling), upper tier (h 4), the tiers side by side so the edge between them is a CLIFF; ramp A (east) climbs from the lower to the middle tier,
//         ramp B (west) from the middle to the upper one. A ramp replaces the tier tiles it covers; its sides are cliffs too.
export const SAPLING = { x: 0, z: -20 };
export const TIER_HEIGHTS = [0, 2, 4];
const TERRACES = mapFloor('terraces', {
  tiers: [{ ...R(-14, -6, 14, 6), h: 0 }, { ...R(-14, -26, 14, -6), h: 2 }, { ...R(-14, -44, 14, -26), h: 4 }],
  ramps: [{ ...R(8, -14, 12, -6), dir: '-z', from: 0, to: 2 }, { ...R(-12, -34, -8, -26), dir: '-z', from: 2, to: 4 }],
  obstacles: [{ x: -6, z: 0, r: 1.4, kind: 'rock' }, { x: 5, z: 1, r: 1.4, kind: 'rock' }, { x: -6, z: -22, r: 1.4, kind: 'rock' }, { x: 7, z: -18, r: 1.4, kind: 'rock' }, { x: 9, z: -39, r: 1.6, kind: 'rock' }],
});
export const TERRACE_GATE = R(-4, -46, 4, -44, { h: 4 });
export const DEFEND_WAVES = [
  { at: 3, tuples: [['pepperling', -10, -38], ['pepperling', -6, -38, [0, 1, 1, 2]]] },
  { at: 14, tuples: [['crab', -10, -38], ['slug', -8, -41, [0, 0, 1, 1]]] },
  { at: 26, tuples: [['imp', 12, -38], ['pepperling', -10, -37, [1, 1, 2, 2]], ['crab', -9, -41, [0, 0, 0, 1]]] },
  { at: 36, tuples: [['slug', -10, -38], ['pepperling', -8, -37, [1, 1, 2, 2]]] },
];
// ---- 3  the grove: a long ramp down from the terraces, an entrance room, then open grounds with pepper plants; the corridor at the far end leads to the hall
export const CHIEFS = [
  { kind: 'chief', x: -12, z: -86, mod: 'fast', name: 'Chief Cayenne' },
  { kind: 'chief', x: 12, z: -94, mod: 'shield', name: 'Chief Habanero' },
  { kind: 'chief', x: 0, z: -98, mod: 'split', name: 'Chief Paprika' },
];
const GROVE = [
  R(-4, -64, 4, -46, { ramp: { dir: '-z', from: 4, to: 0 } }),
  R(-6, -72, 6, -64),
  ...mapFloor('grounds', { x: 0, z: -86, r: 17, wobble: 0.08, lobes: 4, seed: 3,
    obstacles: [{ x: -8, z: -78, r: 1.8 }, { x: 8, z: -80, r: 1.8 }, { x: -6, z: -92, r: 1.8 }, { x: 6, z: -90, r: 1.6 }, { x: -13, z: -90, r: 1.6 }, { x: 13, z: -86, r: 1.6 }].map((o) => ({ ...o, kind: 'pepper' })) }),
  R(-2, -104, 2, -96),
];
// ---- 4  the Magma Hall
const ARENA = { shape: 'circle', x: 0, z: -122, r: 12 };
const HALL = [R(-2, -110, 2, -106), ARENA, lava(-8.5, -126, 2), lava(8.5, -126, 2), lava(0, -131, 1.8)];

export const CINDER = {
  id: 'cinder', name: 'Cinder Tubes', island: 'ember', look: 'lava', ground: 'rock',
  origin: { x: 1200, z: 1800, y: 8 },
  exit: { x: -11.5, z: 64 },                  // the homeward portal, in the Tube Mouth
  // The way in from Emberleaf (world/lavaMouth.js): a lava-tube mouth on the volcano's east flank, in a CLEARING of Emberleaf's seeded placement (so nothing there moved; test/cinder.test.js pins
  // the hashes). It opens as soon as the Emberleaf bridge is built (you cannot get there before).
  entrance: { id: 'cinder-mouth', island: 'ember', x: 263, z: 45, opens: 'bridge' },
  rack: RACK, supply: SUPPLY,
  armory: { weapons: ['watering-can'], charms: ['ember-seed'] },      // added to the Armory when its Wild mode is cleared: every area's rack then offers them
  rewards: { crystal: 3, pineapple: 4, obsidian: 2 },
  clearText: 'The Magma Toad cools into a sleepy boulder and the lava tubes hum in peace!',
  trophy: { id: 'magmatoad', name: 'Magma Toad trophy' },      // appears beside the tube mouth on Emberleaf once this area's Wild mode is cleared
  sections: [
    { id: 'mouth', name: 'The Tube Mouth', mapType: 'grounds', dress: 'mouth', floor: [MOUTH, STAIR],
      start: { x: -2.7, z: 70, step: 1.8 }, safe: [MOUTH],
      enemies: [['dummy', 10, 58], ['dummy', 10, 63], ['wavedummy', 11, 68]],
      objective: { type: 'train', label: 'Try every move' }, gate: { shapes: [R(-4, 48, 4, 50)] } },
    { id: 'channel', name: 'The Ember Channel', mapType: 'gauntlet', dress: 'channel', floor: CHANNEL,
      start: { x: -2.7, z: 44.5, step: 1.8 }, safe: [shrine(0, 44.5)],
      pedestals: EMBER_SEED_PEDESTALS,
      enemies: [['imp', -4, 17], ['imp', 5, 16.5, [0, 0, 1, 1]], ['slug', 0, 26, [0, 0, 0, 1]]],
      objective: { type: 'burn', label: 'Burn the brambles with Ember Seed', target: BRAMBLES },
      gate: { look: 'bramble', shapes: [BRAMBLES] } },
    { id: 'terraces', name: 'The Terraces', mapType: 'terraces', dress: 'terraces', floor: TERRACES,
      start: { x: -2.7, z: 3, step: 1.8 }, safe: [shrine(0, 3)],
      enemies: [['imp', 5, -31], ['imp', -2, -30, [0, 0, 1, 1]]],
      objective: { type: 'defend', label: 'Protect the sapling', seconds: 45, sapling: SAPLING, waves: DEFEND_WAVES },
      gate: { shapes: [TERRACE_GATE] } },
    { id: 'grove', name: 'The Pepper Grove', mapType: 'grounds', dress: 'grove', floor: GROVE,
      start: { x: -2.7, z: -68, step: 1.8 }, safe: [shrine(0, -68)],
      enemies: [...CHIEFS.map((c) => [c.kind, c.x, c.z, null, { chief: c.mod, name: c.name }]), ['imp', -4, -80], ['crab', 8, -84], ['slug', -3, -92, [0, 0, 1, 1]]],
      objective: { type: 'hunt', label: 'Find the Pepper Chiefs' }, gate: { shapes: [R(-2, -106, 2, -104)] } },
    { id: 'hall', name: 'The Magma Hall', mapType: 'arena', dress: 'hall', floor: HALL,
      start: { x: -2.7, z: -114, step: 1.8 }, safe: [shrine(0, -114)],
      enemies: [['toad', 0, -125]], phase2: { adds: [['imp', -6, -118, [0, 1, 1, 2]], ['pepperling', 6, -118, [0, 0, 1, 1]]] },
      objective: { type: 'bosses', label: 'Defeat the Magma Toad' }, gate: null },
  ],
};
