// "Meadow Pages * - Hidden Orchard" (Step 52a): the chapter's SECRET page, a short, berry-rich bonus orchard with no letters. It opens in the Meadow chapter menu once a secret exit has been found
// (Kite Hill's hidden bookmark). PURE DATA (game/pageFormat.js); `bonus: true` = no letters or pressed flowers are asked of it.
export const HIDDEN_ORCHARD_ROWS = [
    '............................................................................................................................', // 13
    '............................................................................................................................', // 12
    '............................................................................................................................', // 11
    '........................................................ooooooooooo.........................................................', // 10
    '..............................oooooo......................ooooooo...................ooooo...................................', // 9
    '..............................======......................ooooooo..................ooooooo...............oooooo.............', // 8
    '.......................oooooo.........ooo.................=======.................ooooooooo..............======.............', // 7
    '.......................======................oooo.................................................oooooo....................', // 6
    '................oooooo...............o...o..o....o.............................../#########\\......======....................', // 5
    '.....oooooooo...======..............o.....oo......o.................ooooooooo.../###########\\....................ooooooo....', // 4
    '.....oooooooo....oooo...oooo................oooooo..................ooooooooo../#############\\...ooooooooooooooo.ooooooo....', // 3
    '...P..........C.............................^^^^^^..C..S..........S.........../###############\\.C.......................G...', // 2
    '############################################################################################################################', // 1
    '############################################################################################################################', // 0
];

export const HIDDEN_ORCHARD = {
  id: 'hidden-orchard',
  name: 'Hidden Orchard',
  title: 'Meadow Pages ★',
  blurb: 'A secret little orchard, heavy with berries. Take your time and fill your pockets.',
  banner: 'Hidden Orchard',
  sticker: 'orchard',
  bonus: true,
  floorRows: 2,
  exitOffset: 7,
  rows: HIDDEN_ORCHARD_ROWS,
  decor: [
    { kind: 'sign', x: 8, text: 'You found the secret page! Berries everywhere' },
    { kind: 'tree', x: 13, s: 1.3, shake: true },
    { kind: 'tree', x: 38, s: 1.4 },
    { kind: 'bush', x: 41 },
    { kind: 'sign', x: 53, text: 'Springs reach the tall berry tree' },
    { kind: 'tree', x: 72, s: 1.5, shake: true },
    { kind: 'bush', x: 76 },
    { kind: 'flower', x: 94 },
    { kind: 'tree', x: 112, s: 1.3 },
    { kind: 'flower', x: 118 },
  ],
  mid: { auto: true, seed: 5511 },
  back: { auto: true, seed: 5512 },
};
