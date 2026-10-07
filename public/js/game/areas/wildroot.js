// Wildroot Hollow as area data (Step 56): the castle maze of Steps 41-42 expressed through the framework in game/areaLogic.js. Step 57 reworks it into five
// sections; today it is ONE section (the safe bailey is its start) whose objective is "defeat every guardian". Coordinates are local to `origin`.
export const ROOMS = [
  { name: 'Safe bailey', x: 0, z: 16, w: 24, d: 16 },
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
  { name: 'Throne passage', x: 12, z: -34, w: 16, d: 4 },
  { name: 'Overgrown throne', x: 0, z: -34, w: 16, d: 16 },
];
export const SPAWNS = [['sprout', -3, 0], ['berry', -20, -2], ['carrot', -20, -7], ['turnip', 20, -14],
  ['berry', 36, -12], ['sprout', -34, -20], ['carrot', -5, -33], ['turnip', 5, -33], ['pumpkin', 0, -38]];
export const WILDROOT = {
  id: 'wildroot', name: 'Wildroot Hollow', island: 'home',
  origin: { x: 1200, z: 1000, y: 8 },
  safeZ: 8,                                   // local z at / beyond which the bailey is safe (guardians never enter, nothing hurts)
  exit: { x: 0, z: 21 },                      // the homeward portal, in the bailey
  // The way in from the island (the Rootgate, world/rootgate.js): `island` = where, x / z world, `opens` = the condition the gate waits for.
  entrance: { id: 'rootgate', island: 'home', x: 27, z: -23, opens: 'feast' },
  armory: { weapons: ['sword', 'axe', 'hammer'], charms: [] },   // added to the Armory when its Wild mode is cleared
  rewards: { crystal: 3, herb: 5 },            // the party's reward for every clear (the shared bag)
  clearText: 'The ruins are peaceful!',
  dress: 'castle',                            // which landmark set world/castleRuins.js builds
  sections: [{
    id: 'hollow', name: 'Wildroot Hollow', mapType: 'maze', floor: ROOMS,
    start: { x: -2.7, z: 10, step: 1.8 }, enemies: SPAWNS,
    objective: { type: 'clear', label: 'Defeat the guardians' }, gate: null,
  }],
};
