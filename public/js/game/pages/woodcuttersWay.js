// "Meadow Pages 2 - Woodcutter's Way" (Step 50): the page that teaches the four tools. PURE DATA (game/pageFormat.js parses it; the legend is in its header).
// The floor is row 6 (six rows of earth lie under the lane: room for secret rooms). Four bookmark stands, each right before its lesson, hand out a translucent page tool:
//   1 axe (x 16): chop a tree into a bridge over an 8 wide pit (x 27-34), jump + swing at the crate's vine (x 48) so it drops as a step up to the plateau (letter F), chop the plateau's tree
//     into a log bridge to the mesa (pressed flower 1)
//   2 hammer (x 76): a hill tunnel plugged with stone blocks (x 85), a geode (x 92) that spills stones to throw, a hill whose cracked floor (x 104-106) drops you into a secret room (planks inside lead back up)
//     (letter E, pressed flower 2): ground pound = Down + Interact in the air
//   3 shovel (x 126): two dig spots (berries, pressed flower 3), an 8 wide thorn field you POGO over (Down + Interact in the air, bouncing on the thorns), then a 2 wide soil shaft (x 150-151) under a tall wall
//     into a corridor (letter A)
//   4 sword (x 169): a hill tunnel plugged with brambles (x 177), an acorn, a berry bush (bat its seeds back) with letter S above it, a beetle (stomp it, grab the shell, throw it),
//     the co-op hill (x 207-217): its tunnel has a stone-block door AND a bramble door (two players with a hammer and a sword open it together; alone, walk back for the other tool, or
//     take the plank stairs over the hill), a 6 wide pit for the twirl (Cancel in the air with empty arms; letter T), the goal
// Step 51: a berry ledge (x 118-123, 5 tiles up: a floating plank) that only a FRIEND TOSS reaches (an optional reward, never required; the validator proves a toss lands on it): lift a friend with Cancel, Cancel again to throw.
// Throwables lie about: stones (x 98, 194), fruit (x 111), a log (x 114) to toss into the campfire at x 118. Three fruit trees rain berries when shaken with empty hands.
export const WOODCUTTERS_WAY_ROWS = [
    '................................................................................................................................................................................................................................................', // 18
    '........................................................................................................................................................##......................................................................................', // 17
    '........................................................................................................................................................##......................................................................................', // 16
    '........................................................................................................................................................##......................................................................................', // 15
    '........................................................................................................................................................##......................................................................................', // 14
    '........................................................................................................................................................##.....................................................o.o.o.o.o.o......................', // 13
    '............................................................oooo........................................................................................##......................................................................................', // 12
    '..................................................ooofoo...o....o.opo.................................................vvvvvv............................##...................................................==###########......................', // 11
    '........................................................T.........................#######.............................======................oooo........##....................#######.........s................###########.........t............', // 10
    '.............................oooo...............H.########.......####.............#######.............o.o.o.o..............................o....o.......##....................#######..........................###########......................', // 9
    '...........................oo....oo....o.o.o......########........................#######............###XXX###..o..o..o..o..o.............o......o......##....................#######.......======........==...###########......................', // 8
    '........oooooo....................................########....................oooo...B...............#.o.==o.#..........................................##.........oooo..........W....oo..........ooo..........BWo.o.o.o...ooo..................', // 7
    '...P..C.........1..oooooo.T.........ooC...........########............o.C.o.2........Boo....R.ooo.r..#oe...po#.m..l...C..n....3.ooQ.ooQ...^^^^^^^^..C...##............C..4.......Woo....n......u..r..b..C......BWoooooooo...............oooo.G..', // 6
    '###########################........###################################################################################################################DD#######.../#############################################################......##########', // 5
    '###########################........###################################################################################################################DD#######../##############################################################......##########', // 4
    '###########################........###################################################################################################################.ooooaooo./###############################################################......##########', // 3
    '###########################........###################################################################################################################........./################################################################......##########', // 2
    '###########################........#############################################################################################################################################################################################......##########', // 1
    '###########################........#############################################################################################################################################################################################......##########', // 0
];

// the optional shortcut (a tunnel with a stone-block door and a bramble door); closed for good, the plank stairs over the hill still lead on (test/pageWorld.test.js proves it)
export const WOODCUTTERS_COOP = { blocks: [[207, 6], [207, 7]], brambles: [[208, 6], [208, 7]] };

export const WOODCUTTERS_WAY = {
  id: 'woodcutters-way',
  name: "Woodcutter's Way",
  title: 'Meadow Pages 2',
  blurb: 'Take the axe, hammer, shovel and sword from the bookmarks, chop, smash and dig your way through, and find the three pressed flowers.',
  banner: "Woodcutter's Way",
  sticker: 'axe',
  coopDoors: [...WOODCUTTERS_COOP.blocks, ...WOODCUTTERS_COOP.brambles],            // (Step 52a: the validator keeps these shut: the page must be finishable without the two-player shortcut)
  floorRows: 6,
  exitOffset: 7,
  rows: WOODCUTTERS_WAY_ROWS,
  digs: [{ reward: 'berries' }, { reward: 'flower' }],
  decor: [
    { kind: 'sign', x: 9, text: 'Step up to a bookmark to take its tool' },
    { kind: 'sign', x: 19, text: 'Axe: face a tree and chop. It falls the way you face!' },
    { kind: 'tree', x: 40, s: 1.2, shake: true }, { kind: 'bush', x: 44 },
    { kind: 'sign', x: 46, text: 'Jump and swing at the vine!' },
    { kind: 'flower', x: 72 }, { kind: 'sign', x: 79, text: 'Hammer: smash stones. In the air, Down + Interact pounds!' },
    { kind: 'sign', x: 96, text: 'Cancel grabs things. Cancel again throws!' },
    { kind: 'tree', x: 112, s: 1.3, shake: true }, { kind: 'bush', x: 116 }, { kind: 'sign', x: 114, text: 'With a friend: Cancel picks them up, Cancel again tosses them to the berry ledge!' },
    { kind: 'sign', x: 128, text: 'Shovel: dig soil and sparkly spots' }, { kind: 'bush', x: 136 },
    { kind: 'sign', x: 146, text: 'Thorns! Shovel in the air: Down + Interact pogos' },
    { kind: 'flower', x: 164 }, { kind: 'sign', x: 171, text: 'Sword: cut brambles, bat seeds back' },
    { kind: 'tree', x: 186, s: 1.3, shake: true }, { kind: 'bush', x: 198 },
    { kind: 'sign', x: 222, text: 'Empty arms in the air: Cancel twirls!' }, { kind: 'flower', x: 234 },
  ],
  mid: { auto: true, seed: 5021 },
  back: { auto: true, seed: 5022 },
};
