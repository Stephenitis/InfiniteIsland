// "Emberleaf Canopy 4 - Volcano Spirit" (Step 53a): the BOSS page. PURE DATA. A short run (a vine over a pit, letters F E; a fixed cannon, letter A; the stairs down, letter S) ends in a one-screen arena: a stone
// ring with the Volcano Spirit on it (game/pageBossLogic.js). It lobs lava globs (each shows a growing shadow where it will land: step or hop out of it), sinks into the lava and COOLS: while it is grey and low, throw a
// coconut at it (Cancel picks up and throws; the piles fill up again) or stomp its crust. Three hits and it is gone; its bookmark (the goal) appears. A hit costs a heart, a puffed player comes back at the campfire right
// before the arena. Letter T sits on a plank in the arena. Nothing needs a friend: a lone player wins with patience (the spirit gets angrier a little with every hit, and a bigger party gets a few more globs).
export const VOLCANO_SPIRIT_ROWS = [
    '........................................................................................................................................................', // 17
    '........................................................................................................................................................', // 16
    '........................................................................................................................................................', // 15
    '........................................................................................................................................................', // 14
    '........................................................................................................................................................', // 13
    '........................................................................................................................................................', // 12
    '........................................................................................................................................................', // 11
    '...............................o...................................o.o..................................................................................', // 10
    '...............................o.........o.......................o.....o....a...........................................................................', // 9
    '................................o......oo..........e....................oooooooooooooo..................................................................', // 8
    '..........................oooooooooooooo..oooooooooooooooooo...o........................ooooooo..........................................t..............', // 7
    '................................................................................p.b..............s......................................====............', // 6
    '..............f.....ooo.......................C.........p..............################.........====.....oooooooooooooo............ooo......ooooooooooo.', // 5
    '....ooooo....====.........#######........####################..........####################.............................................................', // 4
    '.......................##########........####################..........########################.....m..C........m...m....#########....m....m...p...G....', // 3
    '...P.....C.......n..#############........####################..........#################################################################################', // 2
    '#################################........####################..........#################################################################################', // 1
    '#################################........####################..........#################################################################################', // 0
];

export const VOLCANO_SPIRIT = {
  rows: VOLCANO_SPIRIT_ROWS,
  id: 'volcano-spirit',
  name: 'Volcano Spirit',
  title: 'Emberleaf Canopy 4',
  blurb: 'A grumpy lava blob blocks the way. Dodge its globs, wait for it to cool, then throw coconuts or stomp its crust.',
  banner: 'Volcano Spirit',
  sticker: 'volcano',
  floorRows: 2,
  exitOffset: 7,
  theme: 'jungle',
  vines: [{ x: 36.5, y: 15, len: 7 }],
  cannons: [{ x: 63.5, y: 7.7, mode: 'fixed', a0: 50 }],
  boss: { x: 125, y: 4, arena0: 108, ring: [121, 129] },
  decor: [
    { kind: 'palm', x: 2, s: 1.4 },
    { kind: 'palm', x: 12, s: 1.25 },
    { kind: 'palm', x: 18, s: 1 },
    { kind: 'fern', x: 25 },
    { kind: 'fern', x: 32 },
    { kind: 'palm', x: 50, s: 1.21 },
    { kind: 'fern', x: 60 },
    { kind: 'fern', x: 73 },
    { kind: 'fern', x: 81 },
    { kind: 'fern', x: 87 },
    { kind: 'banana', x: 94, s: 0.92 },
    { kind: 'sign', x: 98, text: 'Coconuts: Cancel picks one up and throws it' },
    { kind: 'banana', x: 102, s: 1.07 },
    { kind: 'sign', x: 105, text: 'The spirit sleeps... until you come close' },
    { kind: 'fern', x: 109 },
    { kind: 'palm', x: 115, s: 1.13 },
    { kind: 'fern', x: 124 },
    { kind: 'banana', x: 133, s: 1 },
    { kind: 'banana', x: 141, s: 1.15 },
  ],
  mid: { auto: true, seed: 7731 },
  back: { auto: true, seed: 7732 },
};
