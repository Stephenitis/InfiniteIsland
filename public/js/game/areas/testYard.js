// A synthetic four-section combat area for tests and the browser (Step 56): `?testarea` registers it (main.js), so the framework's gates, objectives and the ritual
// menu's "later areas appear by themselves" can be seen without a real second area. Yard (clear) -> Hall (collect two shards) -> Lanterns (light two braziers, each
// with a wave) -> Arena (bosses). It lives far from everything else (origin 3000, 3000). Never part of the shipped registry unless that flag is set.
import { mapFloor } from '../areaLogic.js';

export const TEST_ORIGIN = { x: 3000, z: 3000, y: 8 };
export const TEST_AREA = {
  id: 'test-yard', name: 'Test Yard', island: 'frost', origin: TEST_ORIGIN, exit: { x: -4, z: 0 }, entrance: { id: 'none', island: 'frost', x: 0, z: 0 },
  armory: { weapons: ['sword'], charms: ['frost-nova'] }, rewards: { crystal: 1 },
  sections: [
    { id: 'yard', name: 'Yard', mapType: 'grounds', floor: mapFloor('grounds', { x: 0, z: 0, w: 16, d: 12 }), start: { x: -4, z: 0, step: 1.8 },
      enemies: [['berry', -3, 0], ['sprout', 3, 0]], objective: { type: 'clear', label: 'Defeat the guardians' }, gate: { shapes: [{ x: 10, z: 0, w: 4, d: 4 }] } },
    { id: 'hall', name: 'Hall', mapType: 'maze', floor: mapFloor('maze', { rects: [{ x: 20, z: 0, w: 16, d: 12 }] }), start: { x: 14, z: 0, step: 1.8 },
      enemies: [['carrot', 24, 4]], objective: { type: 'collect', label: 'Seal shards', pieces: [{ x: 16, z: 3 }, { x: 24, z: -3 }], altar: { x: 20, z: 0 } }, gate: { shapes: [{ x: 30, z: 0, w: 4, d: 4 }] } },
    { id: 'lanterns', name: 'Lanterns', mapType: 'cavern', floor: mapFloor('cavern', { circles: [{ x: 40, z: 0, r: 8 }], link: 0 }), start: { x: 34, z: 0, step: 1.8 },
      enemies: [['sprout', 44, 0]], gate: { shapes: [{ x: 50, z: 0, w: 4, d: 4 }] },
      objective: { type: 'light', label: 'Lanterns', braziers: [{ x: 38, z: -4, wave: [['berry', 38, -6], ['berry', 40, -6]] }, { x: 42, z: 4, wave: [['turnip', 42, 6]] }] } },
    { id: 'arena', name: 'Arena', mapType: 'arena', floor: mapFloor('arena', { x: 62, z: 0, r: 10 }), start: { x: 54, z: 0, step: 1.8 },
      enemies: [['pumpkin', 62, 0], ['berry', 60, 4], ['dummy', 58, -4], ['dummy', 62, -4], ['dummy', 66, -4]], objective: { type: 'bosses', label: 'Defeat the boss' }, gate: null },
  ],
};
