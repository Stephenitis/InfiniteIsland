// "Frostpine Slopes 1 - Snowy Steps" (Step 52b): the first snowy page. PURE DATA (game/pageFormat.js parses it; game/pageSnowLogic.js and game/platformerLogic.js hold the snow rules).
// New here: ICE (the rink, x 28-56: you slide, turn slowly and run a touch faster: look before you stop), SNOW DRIFTS (x 58-82 and the first mound: soft, slower, a cushioned landing), ICICLES (the cave, x 84-116: they wobble
// when you pass under and then drop; one over the drift at x 99 sticks in it and becomes a plank for a while), a SLUSH POOL (x 124-133: a pit of slush that a thrown SNOWBALL freezes into ice for a few seconds: grab one of the piles
// at x 90 / 120 with Cancel, throw it into the slush with Cancel again), a ROLLING SNOWBALL (stomp it: it shrinks to a small snowball you can throw too), and a FOX BUDDY crate (x 150): the fox follows you and Cancel DASHES;
// dash into the snow wall at the foot of the plateau (x 176) to break it and reach the niche with a pressed flower (without a fox in the camp the crate holds a snow hare that dashes the same). Nothing needs a friend.
// Letters: F on the rink's plank, E over the drift stairs, A in the cave, S past the slush pool, T over the plateau. Pressed flowers: the rink shelf, a shelf over the second campfire, the niche. Enemies wear frosty skins: an acorn on the rink (x 38), a beetle at the cave's mouth (x 112), a berry bush (x 181) and the rolling snowball (x 146).
export const SNOWY_STEPS_ROWS = [
    '....................................................................................#################################...........................................................................', // 19
    '....................................................................................#################################...........................................................................', // 18
    '....................................................................................#################################...........................................................................', // 17
    '....................................................................................#################################...........................................................................', // 16
    '....................................................................................#################################...........................................................................', // 15
    '....................................................................................#################################...........................................................................', // 14
    '....................................................................................#################################...........................................................................', // 13
    '....................................................................................#################################...........................................................................', // 12
    '....................................................................................#################################...........................................................................', // 11
    '....................................................................................#################################...........................................................................', // 10
    '....................................................................................#################################......................................................t....................', // 9
    '....................................................................e....................i....i....i....i....i..................................................................................', // 8
    '..................................................................o.o.o.........................................................................................................................', // 7
    '....................................oooo..........f...............=====.........p.........................a................................s........................./IIIIIIIIII#...............', // 6
    '............................................p.....................oooo..................................o.o.o.................o.o.o...........................o...../##.........J...............', // 5
    '................................................======.........ooo....ooo.....====......................=====............................=====...................../###.........J...............', // 4
    '............ooooooo..ooooooo..o.o.o.o.o.o.======......ooooo.......MMMM................ooooooooooo......o.o.o.o.o.o...........oooooooo............................./####.o.o.o.o.J.o.o.o.o.o.....', // 3
    '...P.....C............................n........................MMMMMMMMMM...C.............z.....................b.......z.....................C...O...Y........../#####.opo.o.o.J....u.C....G...', // 2
    '#####################MMMMMMMIIIIIIIIIIIIIIIIIIIIIIIIIIIII#MMMMMMMMMMMMMMMMMMMMMMMMM###############MMMM######################yyyyyyyyyy################IIIIIIIIIII################IIIIIII########', // 1
    '############################################################################################################################..........##########################################################', // 0
];

export const SNOWY_STEPS = {
  id: 'snowy-steps',
  name: 'Snowy Steps',
  title: 'Frostpine Slopes 1',
  blurb: 'Slide across the ice, wade through the drifts, dodge the icicles and freeze the slush with a snowball.',
  banner: 'Snowy Steps',
  sticker: 'flake',
  floorRows: 2,
  exitOffset: 7,
  theme: 'snow',
  rows: SNOWY_STEPS_ROWS,
  buddies: ['dash'],
  buddyGates: [182],
  decor: [
    { kind: 'sign', x: 5, text: 'Ice is slippery. Plan your stops!' },
    { kind: 'pine', x: 14, s: 1.2 },
    { kind: 'snowman', x: 24 },
    { kind: 'sign', x: 20, text: 'Soft drifts slow you down' },
    { kind: 'pine', x: 31, s: 1.3 },
    { kind: 'pine', x: 57, s: 1.1 },
    { kind: 'bush', x: 60 },
    { kind: 'bush', x: 73 },
    { kind: 'pine', x: 80, s: 1.4 },
    { kind: 'sign', x: 83, text: 'Icicles drop when you pass under' },
    { kind: 'sign', x: 118, text: 'Slush! Throw a snowball at it (Cancel)' },
    { kind: 'pine', x: 120, s: 1.2 },
    { kind: 'pine', x: 138, s: 1.4 },
    { kind: 'snowman', x: 148 },
    { kind: 'sign', x: 152, text: 'A fox friend: Cancel to dash' },
    { kind: 'sign', x: 179, text: 'Snow walls hide treats' },
    { kind: 'pine', x: 186, s: 1.2 },
    { kind: 'bush', x: 190 },
  ],
  mid: { auto: true, seed: 5521 },
  back: { auto: true, seed: 5522 },
};
