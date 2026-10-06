// The placeholder page (Step 48): "Test Meadow", a flat strip of grass with paper trees and hills. PURE DATA: world/pageVisuals.js turns it into layered
// cardboard cut-outs and game/storybook.js into a mode. Step 49 replaces the simple left / right walking with real platformer physics and adds tiles + entities
// to this format (a page file stays "data in, nothing else"). Coordinates: x is along the strip relative to the pocket centre (PAGE.x), z is the DEPTH layer
// relative to the walking lane (negative = further back, away from the camera), heights are above the lane's floor.
//
//   length    the walkable strip's length (u); the lane reaches length / 2 either side of the centre
//   spawnX    where the party appears (the strip's left end)          exitX   the back-cover ribbon (the strip's right end)
//   banner    the title painted on a paper banner behind the start
//   mid       cut-out trees / hills one layer behind the lane (z -7 .. -14): { kind: 'tree' | 'hill' | 'bush', x, z, s, color? }
//   back      big painted hills + paper clouds far behind (z -32 .. -60)
export const TEST_MEADOW = {
  id: 'test-meadow',
  name: 'Test Meadow',
  blurb: 'A flat strip of grass, a few paper trees and nowhere to be. The page is still blank.',
  length: 60,
  spawnX: -24,
  exitX: 26,
  banner: 'Test Meadow',
  mid: [
    { kind: 'hill', x: -26, z: -12, s: 1.2, color: '#7fdc78' }, { kind: 'tree', x: -21, z: -8, s: 1.0, color: '#58c96b' },
    { kind: 'tree', x: -15, z: -10, s: 1.3, color: '#ff9fc6' }, { kind: 'bush', x: -11, z: -7, s: 1.0, color: '#74d983' },
    { kind: 'hill', x: -5, z: -13, s: 1.5, color: '#8fe36b' }, { kind: 'tree', x: -2, z: -8, s: 0.9, color: '#4fbf8a' },
    { kind: 'tree', x: 4, z: -9, s: 1.2, color: '#58c96b' }, { kind: 'bush', x: 8, z: -7, s: 1.1, color: '#ffb3d1' },
    { kind: 'hill', x: 14, z: -12, s: 1.3, color: '#7fdc78' }, { kind: 'tree', x: 11, z: -10, s: 1.4, color: '#ffd85e' },
    { kind: 'tree', x: 19, z: -8, s: 1.0, color: '#ff9fc6' }, { kind: 'bush', x: 23, z: -7, s: 0.9, color: '#74d983' },
    { kind: 'tree', x: 28, z: -10, s: 1.2, color: '#58c96b' }, { kind: 'hill', x: 32, z: -13, s: 1.2, color: '#8fe36b' },
  ],
  back: {
    hills: [
      { x: -34, z: -36, w: 26, h: 12, color: '#9ad8a8' }, { x: -12, z: -42, w: 34, h: 16, color: '#86c8b8' }, { x: 14, z: -38, w: 30, h: 13, color: '#a6e0b0' },
      { x: 38, z: -44, w: 34, h: 17, color: '#86c8b8' }, { x: 0, z: -54, w: 60, h: 24, color: '#b7e6dc' },
    ],
    clouds: [
      { x: -30, y: 15, z: -28, s: 1.3 }, { x: -8, y: 19, z: -34, s: 1.7 }, { x: 16, y: 14, z: -30, s: 1.2 }, { x: 36, y: 18, z: -36, s: 1.5 }, { x: -48, y: 20, z: -40, s: 1.1 },
    ],
  },
};
