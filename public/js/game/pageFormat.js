// The storybook page FORMAT (Step 49): turns a page file's ASCII tile rows into a grid + entity lists, and validates that a page can actually be finished.
// PURE (no three.js / DOM; Node-tested in test/platformer.test.js on every registered page). A page file (game/pages/*.js) is data only:
//
//   { id, name, blurb, banner, floorRows, rows: [ ...strings, TOP row first, all the same width ], decor: [...], mid: [...], back: {...} }
//
// Row legend (one character per 1 u tile; everything not a tile is an entity marker and counts as an empty tile):
//   .  empty      #  solid ground (grass-capped where open above)      =  one-way plank / branch shelf (land from above, pass from below, down + Jump drops through)
//   /  \  45 degree slopes (the floor rises / falls to the right)      ^  thorns (hurt, pass-through)      S  spring flower (launches higher)
//   markers:  P start (where the party appears)   G goal bookmark (the page's end)   C campfire checkpoint   o berry   f e a s t  the letters F E A S T
//   Step 50 TOOL GATES (solid tiles, opened by a tool; game/pageWorldLogic.js):  B stone block (hammer, 2 hits)   X cracked floor (hammer ground pound)   W bramble wall (sword, 2 hits)
//             D soft soil (shovel, 1 hit)   H hanging crate on a vine (axe cuts the vine: the crate drops and becomes ground)   R geode (hammer, 2 hits: spills stones and berries)
//   Step 50 markers (empty tiles that hold a thing):  1 2 3 4 tool stands (axe, hammer, shovel, sword)   T choppable tree (axe, 3 hits: falls sideways into a bridge)
//             Q dig spot (shovel; what it hides is `digs[n]` for the n-th Q from the left: { reward: 'berries' | 'flower' })   p pressed flower (3 per tool page)
//   Step 51 marker:  v a TOSS berry: a berry on a ledge no jump reaches, an OPTIONAL reward for a friend toss (Cancel lifts a friend, Cancel again throws). It counts like any berry, but the validator
//             does not require it to be walkable: it proves a toss from a reachable cell lands on the ledge (tossReach) and never lets it hold a letter or a pressed flower.
//             n Grumpy Acorn   b Rolling Beetle   u Berry bush   r stone   m fruit   l log (throwables lying on the ground)
//   `decor` trees with `shake: true` rain berries when shaken empty-handed (once per tree per run).
//   Step 52a markers (empty tiles that hold a thing):  N the Night-Bloom flower (touch it: a ~12 s Bloom Moment turns the page into a glowing night)   ~ a BLOOM PAD (empty until a Bloom Moment, then a one-way plank;
//             only ever leads to a pressed flower or a berry bonus: letters, campfires, the goal and the secret exit never depend on one)   Z the SECRET EXIT (a hidden second goal: clears the page too, unlocks the chapter's secret page)
//   Step 52a page data (see game/pageMotion.js):  movers [{ kind: 'leaf' | 'log', ... }]  gusts [...]  tide {...}  waters [...]  coopDoors [[cx, cy], ...] (gate tiles that need two players: the validator keeps them SEALED, so the page must
//             be finishable without them)   bonus: true (a short bonus page without letters)   sticker: 'sun' | ... (the Journal sticker's icon id)
//   Step 52b (Frostpine Slopes) tiles:  I ice (solid, slippery)   M snow drift (solid, slows the run, cushions a landing)   y slush (EMPTY over a pit: a thrown snowball freezes a run of it to ice for a few seconds; falling in = a puff)
//             J snow wall (solid: a FOX buddy's dash breaks it)      markers:  i an icicle hanging under the ceiling cell above it   z a snowball pile (a throwable that refills)   O a rolling snowball (enemy: stomp -> small snowball)
//             Y a BUDDY CRATE (its ability is `buddies[n]` for the n-th Y from the left: 'dash' | 'glide' | 'super' | 'flutter')   h a low branch (only a rider of a SLED has to duck it)
//   Step 52b page data:  theme: 'snow'   sleds [{ x0, x1 }] (the sled runs: a body is mounted on a sled from x0 to x1)   buddyGates [x, ...] (a buddy hops away when its player passes one)   frostBloom: true (the Night-Bloom
//             turns slush to ice for the Moment)   nightLook (0..1: how much of a night the page always looks like)   aurora: true (a painted aurora behind the page)
//   `floorRows` (default 2): how many tile rows lie below the lane's floor height PAGE.y, so the strip's floor sits where Step 48's lane was.
//   `decor` (not collidable, drawn at the lane's depth): { kind: 'tree', x, s? } ({ x } = tile column of the trunk, base on the ground below it), { kind: 'bush' | 'flower' | 'sign', x, text? }
//   `mid` / `back`: the cut-out layers of Step 48 (see world/pageVisuals.js), in TILE columns relative to the page's centre.
//
//   parsePage(raw)            -> the page with: W, H, length (= W), tileRows, grid, start {x, y}, goal {x, y}, berries [{x, y}], letters [{ch, x, y}],
//                                campfires [{x, y, index}] (sorted left to right; index 0 is the first = the start fire), spawnX / exitX (world offsets from the page centre);
//                                Step 50: flowers [{id, x, y, buried}], stands [{tool, x, y}], trees [{i, x, y}], digs [{i, x, y, reward, flower}], enemies [{id, kind, x, y}],
//                                objects [{kind, x, y}], shakeTrees [{i, x, s}], gates [{kind, cx, cy}]
//                                positions are TILE coordinates: x to the right, y up from the page's bottom row; berries / letters at tile centres, the rest at their feet cell centres
//   pageToWorld(page, tx, ty) -> { x, y, z } in the pocket        worldToPage(page, x, y) -> { tx, ty }
//   validatePage(page)        -> { ok, errors: [string], stats: { cells, reached, ... } }
//   solveGates(page)          -> { grid, tools, opened: [gate], unopened: [gate] }   the tool gates modelled (Step 50): a gate opens once a stand for its tool is reachable and the gate can be hit from a reachable cell;
//                                the validator needs the goal, letters, flowers and campfires reachable in the grid with every openable gate opened
//   Reachability is a conservative BFS over "standable cells" using LIMITS (game/platformerLogic.js): walking (flat / slopes), jumps (up to maxUp, across reach(dy)), falls,
//   springs (their own reach). It proves the goal, every letter and every campfire reachable from the start, the start reachable from every campfire, and
//   that no reachable cell is a soft-lock (every one can get back to the start or on to the goal).
import { LETTERS, pageToWorld, worldToPage } from './storybookLogic.js';
import { mulberry32 } from '../utils/rng.js';
import { createGrid, cloneGrid, setTile, LIMITS, SOLID, ONEWAY, SLOPE_R, SLOPE_L, THORN, SPRING, EMPTY, GATE_CHARS, SURFACE_CHARS, SLUSH } from './platformerLogic.js';
import { slushRuns, abilityZones, simulateSled, SPECIES_OF } from './pageSnowLogic.js';
import { GATE_TOOL, hitRect, openCells, treeFill } from './pageWorldLogic.js';
import { tossReach } from './pageCoopLogic.js';
import { moverCells } from './pageMotion.js';
import { PAGE_MOTION as MOTION, PAGE_BLOOM as BLOOM, PAGE_SNOW as SNOW } from '../config.js';

export { LETTERS, pageToWorld, worldToPage };
const MARKER_LETTER = { f: 'F', e: 'E', a: 'A', s: 'S', t: 'T' };
const TILE_CHARS = '.#=/\\^S' + GATE_CHARS + SURFACE_CHARS + SLUSH;
const STAND_TOOL = { 1: 'axe', 2: 'hammer', 3: 'shovel', 4: 'sword' };
const ENEMY_MARK = { n: 'acorn', b: 'beetle', u: 'bush', O: 'snowball' };
const OBJECT_MARK = { r: 'stone', m: 'fruit', l: 'log', z: 'snow' };
export { GATE_TOOL };

export function parsePage(raw) {
  const rows = raw.rows;
  const H = rows.length, W = rows[0] ? rows[0].length : 0;
  const page = { ...raw, W, H, length: W, floorRows: raw.floorRows ?? 2, errors: [] };
  page.berries = []; page.letters = []; page.campfires = []; page.start = null; page.goal = null;
  page.pads = []; page.bloom = null; page.secret = null; page.flowers = []; page.stands = []; page.trees = []; page.digs = []; page.enemies = []; page.objects = []; page.gates = [];
  page.icicles = []; page.crates = []; page.branches = []; page.sleds = (raw.sleds || []).map((q) => ({ x0: q.x0, x1: q.x1 })); page.buddyGates = (raw.buddyGates || []).slice(); page.theme = raw.theme || 'meadow';
  const tileRows = [];
  for (let r = 0; r < H; r++) tileRows.push('');
  const found = [];
  for (let c = 0; c < W; c++) {
    for (let r = H - 1; r >= 0; r--) {                       // bottom to top, so berry order is column by column
      const ch = rows[H - 1 - r][c];
      if (ch === undefined) continue;
      const cy = r;
      if (TILE_CHARS.includes(ch)) continue;
      if (ch === 'o') page.berries.push({ x: c + 0.5, y: cy + 0.5 });
      else if (ch === 'v') page.berries.push({ x: c + 0.5, y: cy + 0.5, toss: true });
      else if (ch in MARKER_LETTER) page.letters.push({ ch: MARKER_LETTER[ch], x: c + 0.5, y: cy + 0.5 });
      else if (ch === 'p') page.flowers.push({ x: c + 0.5, y: cy + 0.5, buried: null });
      else if (ch in STAND_TOOL) page.stands.push({ tool: STAND_TOOL[ch], x: c + 0.5, y: cy });
      else if (ch === 'T') page.trees.push({ x: c + 0.5, y: cy });
      else if (ch === 'i') page.icicles.push({ x: c + 0.5, y: cy });
      else if (ch === 'Y') page.crates.push({ x: c + 0.5, y: cy });
      else if (ch === 'h') page.branches.push({ cx: c, cy });
      else if (ch === 'Q') page.digs.push({ x: c + 0.5, y: cy });
      else if (ch in ENEMY_MARK) page.enemies.push({ kind: ENEMY_MARK[ch], x: c + 0.5, y: cy });
      else if (ch in OBJECT_MARK) page.objects.push({ kind: OBJECT_MARK[ch], x: c + 0.5, y: cy });
      else if (ch === 'N') { if (page.bloom) page.errors.push('more than one Night-Bloom'); page.bloom = { x: c + 0.5, y: cy }; }
      else if (ch === '~') page.pads.push({ cx: c, cy });
      else if (ch === 'Z') { if (page.secret) page.errors.push('more than one secret exit'); page.secret = { x: c + 0.5, y: cy }; }
      else if (ch === 'C') found.push({ x: c + 0.5, y: cy });
      else if (ch === 'P') { if (page.start) page.errors.push('more than one start'); page.start = { x: c + 0.5, y: cy }; }
      else if (ch === 'G') { if (page.goal) page.errors.push('more than one goal'); page.goal = { x: c + 0.5, y: cy }; }
      else if (ch !== ' ') page.errors.push(`unknown character '${ch}' at ${c},${cy}`);
    }
  }
  for (let r = 0; r < H; r++) {
    let s = '';
    for (let c = 0; c < W; c++) { const ch = rows[r][c]; s += ch !== undefined && TILE_CHARS.includes(ch) ? ch : '.'; }
    tileRows[r] = s;
  }
  page.tileRows = tileRows;
  page.grid = createGrid(tileRows);
  page.trees.forEach((t, i) => { t.i = i; });
  page.digs.forEach((d, i) => { d.i = i; const spec = (raw.digs && raw.digs[i]) || {}; d.reward = spec.reward || 'berries'; d.flower = null; });
  for (const d of page.digs) if (d.reward === 'flower') page.flowers.push({ x: d.x, y: d.y + 0.5, buried: d.i });   // (a buried pressed flower: it shows once its spot is dug)
  page.flowers.sort((a, b) => a.x - b.x || a.y - b.y);
  page.flowers.forEach((f, id) => { f.id = id; if (f.buried !== null) page.digs[f.buried].flower = id; });
  page.enemies.sort((a, b) => a.x - b.x);
  page.enemies.forEach((e, i) => { e.id = i; });
  page.crates.forEach((c, i) => { c.ability = (raw.buddies || [])[i] || null; c.species = SPECIES_OF[c.ability] || null; });
  page.shakeTrees = (raw.decor || []).filter((d) => d.kind === 'tree' && d.shake).map((d, i) => ({ i, x: d.x, s: d.s || 1 }));
  for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) { const k = page.grid.kind(cx, cy); if (k !== '.' && k !== 'L' && k !== 'K' && !SURFACE_CHARS.includes(k) && k !== SLUSH) page.gates.push({ kind: k, cx, cy }); }
  page.slush = slushRuns(page.grid);
  page.waters = [...(raw.waters || []), ...page.slush.map((q) => ({ x0: q.x0, x1: q.x1 + 1, top: q.row + 1, slush: true }))];      // (a slush run is a pit with a splash until it is frozen)
  page.zones = abilityZones(page);
  page.letters.sort((a, b) => a.x - b.x);
  found.sort((a, b) => a.x - b.x);
  page.campfires = found.map((f, index) => ({ ...f, index }));
  page.spawnX = page.start ? page.start.x - W / 2 : -W / 2 + 2;
  page.exitX = page.spawnX + (raw.exitOffset ?? 7);
  if (!page.banner) page.banner = page.name;
  if (raw.mid && raw.mid.auto) page.mid = autoMid(W, raw.mid.seed, page.theme);
  if (raw.back && raw.back.auto) page.back = autoBack(W, raw.back.seed, page.theme);
  return page;
}

// the paper cut-out layers a page asks for with mid/back { auto: true, seed } (x relative to the page centre, like the Step 48 lists)
const MID_COLORS = ['#58c96b', '#ff9fc6', '#74d983', '#4fbf8a', '#ffd85e', '#8fe36b'];
function autoMid(W, seed = 1, theme = 'meadow') {
  const rng = mulberry32(seed), out = [];
  if (theme === 'snow') {                                   // Step 52b: snow-capped pines, white hills, drifted bushes
    for (let x = -W / 2 - 8; x < W / 2 + 12; x += 3.6 + rng() * 4.2) {
      const r = rng(), s = 0.9 + rng() * 0.7;
      out.push(r < 0.14 ? { kind: 'hill', x, z: -12 - rng() * 2, s: 1 + rng() * 0.7, color: '#e9f2ff' } : r < 0.8 ? { kind: 'pine', x, z: -7.5 - rng() * 3.5, s, color: rng() < 0.5 ? '#3f8f7a' : '#4aa58a' } : { kind: 'bush', x, z: -7 - rng() * 1.5, s: 0.9 + rng() * 0.4, color: '#e4eefc' });
    }
    return out;
  }
  for (let x = -W / 2 - 8; x < W / 2 + 12; x += 4.5 + rng() * 4) {
    const r = rng(), s = 0.9 + rng() * 0.6, color = MID_COLORS[Math.floor(rng() * MID_COLORS.length)];
    out.push(r < 0.15 ? { kind: 'hill', x, z: -12 - rng() * 2, s: 1 + rng() * 0.7, color: '#7fdc78' }
      : r < 0.75 ? { kind: 'tree', x, z: -7.5 - rng() * 3, s, color } : { kind: 'bush', x, z: -7 - rng() * 1.5, s: 0.9 + rng() * 0.4, color: '#74d983' });
  }
  return out;
}
function autoBack(W, seed = 1, theme = 'meadow') {
  const rng = mulberry32(seed), hills = [], clouds = [];
  const cols = theme === 'snow' ? ['#c4d6f0', '#b3c8ea', '#d0def4'] : ['#9ad8a8', '#86c8b8', '#a6e0b0'];
  for (let x = -W / 2 - 20; x < W / 2 + 30; x += 24 + rng() * 10) hills.push({ x, z: -34 - rng() * 12, w: 26 + rng() * 14, h: 11 + rng() * 8, color: cols[Math.floor(rng() * 3)] });
  hills.push({ x: 0, z: -58, w: W + 80, h: 26, color: theme === 'snow' ? '#d9e6f8' : '#b7e6dc' });
  for (let x = -W / 2 - 20; x < W / 2 + 30; x += 20 + rng() * 14) clouds.push({ x, y: 14 + rng() * 8, z: -28 - rng() * 12, s: 1 + rng() * 0.8 });
  return { hills, clouds };
}

/** The standable cells of a page and the moves between them (walk / jump / fall): { cells, adj, id, stand }. */
export function buildGraph(page) {
  const g = page.grid, at = (cx, cy) => g.at(cx, cy);
  // Step 52a: a jump that starts, ends or crosses a gust zone keeps MOTION.gust.penalty tiles of reach spare (a headwind may push the other way)
  const gusts = page.gusts || [];
  const windPen = (x0, x1, y0, y1) => (gusts.some((q) => q.x0 <= x1 + 1 && q.x1 >= x0 && q.y0 <= y1 + 3 && q.y1 >= y0) ? MOTION.gust.penalty : 0);
  const zones = page.enabledZones || [];
  const virtual = page.virtual || null;                                       // Step 52a: cells a platform passes through (the validator's union model): standable without a tile under them
  const stand = (cx, cy) => {
    if (cx < 0 || cx >= g.W || cy < 0 || cy >= g.H) return false;
    const ch = at(cx, cy);
    if (virtual && virtual.has(`${cx},${cy}`)) return ch !== SOLID && at(cx, cy + 1) !== SOLID;
    if (ch === SOLID || ch === THORN || ch === ONEWAY) return false;
    if (at(cx, cy + 1) === SOLID) return false;
    if (ch === SLOPE_R || ch === SLOPE_L) return true;
    const below = at(cx, cy - 1);
    return below === SOLID || below === ONEWAY;
  };
  const cells = [], idx = new Map(), byCol = Array.from({ length: g.W }, () => []);
  for (let cy = 0; cy < g.H; cy++) for (let cx = 0; cx < g.W; cx++) if (stand(cx, cy)) { idx.set(cx * 1000 + cy, cells.length); byCol[cx].push(cells.length); cells.push({ cx, cy }); }
  const id = (cx, cy) => idx.get(cx * 1000 + cy);
  const edgeR = (ch) => (ch === SLOPE_R ? 1 : 0), edgeL = (ch) => (ch === SLOPE_L ? 1 : 0);
  const blockedAt = (cx, cy) => at(cx, cy) === SOLID;
  const adj = cells.map(() => new Set());
  cells.forEach((A, ai) => {
    const chA = at(A.cx, A.cy);
    // walking
    for (const d of [-1, 1]) {
      for (const dy of [-1, 0, 1]) {
        const bi = id(A.cx + d, A.cy + dy);
        if (bi === undefined) continue;
        const chB = at(A.cx + d, A.cy + dy);
        const exit = A.cy + (d > 0 ? edgeR(chA) : edgeL(chA)), enter = A.cy + dy + (d > 0 ? edgeL(chB) : edgeR(chB));
        if (enter <= exit && exit - enter <= 1) adj[ai].add(bi);
      }
    }
    // jumps and falls
    const spring = chA === SPRING;
    const zone = zones.length && !spring ? zones.find((q) => LIMITS.buddy[q.ability] && A.cx >= q.x0 && A.cx < q.x1) : null;          // (Step 52b: a buddy's ability lends a jump of its own, inside the zone of a crate that was reached first)
    const up = spring ? LIMITS.springMaxUp : zone ? LIMITS.buddy[zone.ability].maxUp : LIMITS.maxUp, reachOf = spring ? LIMITS.springReach : zone ? LIMITS.buddy[zone.ability].reach : LIMITS.twirlReach;      // (a jump may end in a twirl glide: Cancel in the air)
    for (let dx = -14; dx <= 14; dx++) {
      const bx = A.cx + dx;
      if (bx < 0 || bx >= g.W) continue;
      for (const bi of byCol[bx]) {
        const B = cells[bi], dy = B.cy - A.cy;
        if (bi === ai || dy > up || dy < -LIMITS.maxDrop) continue;
        const x0 = Math.min(A.cx, bx), x1 = Math.max(A.cx, bx);
        if (Math.abs(dx) > Math.min(14, reachOf(dy)) - (gusts.length ? windPen(x0, x1, Math.min(A.cy, B.cy), Math.max(A.cy, B.cy)) : 0)) continue;
        let ok = true;
        const top = Math.max(A.cy, B.cy);
        if (dy >= 0) {
          for (let cx = x0; cx <= x1 && ok; cx++) for (let cy = top; cy <= top + 2; cy++) if (blockedAt(cx, cy)) { ok = false; break; }
        } else {
          if (dx === 0) for (let cy = B.cy + 1; cy < A.cy; cy++) if (blockedAt(A.cx, cy)) { ok = false; break; }       // (Step 52b: a straight drop must not go through solid ground, e.g. a stone beam under the standing cell)
          for (let cx = x0; cx <= x1 && ok; cx++) {
            const lo = cx === A.cx ? A.cy : B.cy + 1;
            for (let cy = lo; cy <= A.cy + 2; cy++) if (blockedAt(cx, cy)) { ok = false; break; }
          }
        }
        if (ok) adj[ai].add(bi);
      }
    }
  });

  return { cells, adj, id, stand };
}

// ---- tool gates (Step 50) -----------------------------------------------------------------------------------------------------------------------------
const HANG_LIFT = 2.5;                                                           // how high above the floor a jump lifts the swing (a bit under the jump's apex)
const GATE_NAME = { B: 'stone block', X: 'cracked floor', W: 'bramble wall', D: 'soft soil', H: 'hanging crate', R: 'geode', T: 'tree', Q: 'dig spot', J: 'snow wall', y: 'slush' };
const bfsFrom = (graph, from) => {
  const seen = new Uint8Array(graph.cells.length), q = [from];
  seen[from] = 1;
  for (let h = 0; h < q.length; h++) for (const n of graph.adj[q[h]]) if (!seen[n]) { seen[n] = 1; q.push(n); }
  return seen;
};
/** Could a body standing on cell A (facing either way) hit the box [x0, y0, x1, y1] with `tool`? -> the facing direction that works (1 / -1) or 0. */
function swingFrom(A, tool, x0, y0, x1, y1, lift = 0) {
  for (const s of [1, -1]) {
    const r = hitRect(tool, A.cx + 0.5, A.cy + lift, s);
    if (r.x1 > x0 && r.x0 < x1 && r.y1 > y0 && r.y0 < y1) return s;
  }
  return 0;
}
/**
 * The tool gates of a page, solved the way a party would: a stand's tool is owned once its cell can be reached; a gate opens once its tool is owned and a reachable cell can swing at it
 * (a cracked floor: from a reachable cell in the air above it with a clear column; a tree falls away from the side it is chopped from). Opening is monotone and repeated until nothing changes.
 * Step 52b: a BUDDY crate that can be reached switches its ability ZONE on (from the crate to the next buddy gate: jumps inside it use the buddy's reach); a snow wall (J) breaks when a reachable cell inside a dash zone is
 * within 5 tiles of it; a run of slush turns to ice when a snowball pile is reachable and a reachable cell is within 5 tiles of the run (the snowball is thrown from there).
 * -> { grid (every openable gate opened), tools: Set, opened: [{ kind, cx, cy, tool }], unopened: [gate], zones: [the enabled ability zones] }
 */
export function solveGates(page) {
  const grid = cloneGrid(page.grid), tools = new Set(), opened = [];
  const virtual = moverCells(page), enabled = [], allZones = page.zones || [];
  const sealed = new Set((page.coopDoors || []).map(([x, y]) => `${x},${y}`));                      // Step 52a: gates that need two players stay shut: a lone player must be able to finish without them
  const gates = page.gates.filter((g) => !sealed.has(`${g.cx},${g.cy}`)).map((g) => ({ ...g, tool: GATE_TOOL[g.kind], done: false, type: 'tile' }));
  const slushLeft = slushRuns(grid);
  for (const t of page.trees) gates.push({ kind: 'T', cx: Math.floor(t.x), cy: Math.floor(t.y), tool: 'axe', done: false, type: 'tree', tree: t });
  for (const d of page.digs) gates.push({ kind: 'Q', cx: Math.floor(d.x), cy: Math.floor(d.y), tool: 'shovel', done: false, type: 'dig', dig: d });
  const startC = page.start ? { cx: Math.floor(page.start.x), cy: Math.floor(page.start.y) } : null;
  for (let guard = 0; guard < 120 && startC; guard++) {
    const graph = buildGraph({ grid, virtual, enabledZones: enabled });
    const startI = graph.id(startC.cx, startC.cy);
    if (startI === undefined) break;
    const seen = bfsFrom(graph, startI), reach = graph.cells.filter((_, i) => seen[i]);
    for (const s of page.stands) { const i = graph.id(Math.floor(s.x), Math.floor(s.y)); if (i !== undefined && seen[i]) tools.add(s.tool); }
    let changed = false;
    for (const z of allZones) {
      const c = page.crates[z.crate], i = graph.id(Math.floor(c.x), Math.floor(c.y));
      if (i !== undefined && seen[i] && !enabled.includes(z)) { enabled.push(z); changed = true; if (z.ability === 'dash') tools.add('dash'); }
    }
    for (const g of gates) {
      if (g.done || !tools.has(g.tool)) continue;
      let ok = false, dir = 1;
      if (g.kind === 'J') {                                                    // a snow wall: a dash from a reachable cell next to it, inside a dash zone (the whole wall breaks)
        if (grid.kind(g.cx, g.cy) !== 'J') { g.done = true; continue; }
        for (const z of enabled) if (z.ability === 'dash' && g.cx >= z.x0 && g.cx < z.x1) for (const A of reach) if (A.cx >= z.x0 && A.cx < z.x1 && Math.abs(A.cx - g.cx) <= 5 && Math.abs(A.cy - g.cy) <= 1) { ok = true; break; }
      } else if (g.kind === 'X') {                                                   // a ground pound from the air over the cell
        for (const A of reach) {
          if (A.cx !== g.cx || A.cy <= g.cy) continue;
          let clear = true;
          for (let y = g.cy + 1; y <= A.cy && clear; y++) if (grid.at(g.cx, y) === SOLID) clear = false;
          if (clear) { ok = true; break; }
        }
      } else {
        const box = g.type === 'tree' ? [g.tree.x - 0.5, g.tree.y, g.tree.x + 0.5, g.tree.y + 3] : g.type === 'dig' ? [g.dig.x - 0.5, g.dig.y - 0.2, g.dig.x + 0.5, g.dig.y + 0.9] : [g.cx, g.cy, g.cx + 1, g.cy + 1];
        if (g.type === 'tile' && grid.kind(g.cx, g.cy) !== g.kind) { g.done = true; continue; }
        const lift = g.kind === 'H' ? HANG_LIFT : 0;                             // a hanging crate is cut with a jump swing
        for (const A of reach) { const s = swingFrom(A, g.tool, ...box, lift); if (s) { ok = true; dir = s; break; } }
      }
      if (!ok) continue;
      g.done = true; changed = true; opened.push({ kind: g.kind, cx: g.cx, cy: g.cy, tool: g.tool });
      if (g.type === 'tree') for (const [cx, cy, ch] of treeFill(grid, g.tree, dir)) setTile(grid, cx, cy, ch);
      else if (g.type === 'tile') for (const [cx, cy, ch] of openCells(grid, g.kind, g.cx, g.cy)) setTile(grid, cx, cy, ch);
    }
    // slush: a snowball pile that can be reached, and a reachable cell near the run to throw from, freezes it (for a few seconds; crossing it takes one)
    if (slushLeft.length && page.objects.some((o) => o.kind === 'snow' && (() => { const i = graph.id(Math.floor(o.x), Math.floor(o.y)); return i !== undefined && seen[i]; })())) {
      for (let qi = slushLeft.length - 1; qi >= 0; qi--) {
        const q = slushLeft[qi];
        const near = reach.some((A) => Math.abs(A.cy - (q.row + 1)) <= 2 && ((A.cx < q.x0 && q.x0 - A.cx <= 5) || (A.cx > q.x1 && A.cx - q.x1 <= 5)));
        if (!near) continue;
        for (let x = q.x0; x <= q.x1; x++) setTile(grid, x, q.row, 'I');
        opened.push({ kind: 'y', cx: q.x0, cy: q.row, tool: 'snowball' }); slushLeft.splice(qi, 1); changed = true;
      }
    }
    // thorn fields: with the shovel a party POGOS across (Down + Interact in the air: every thorn bounces); a run of thorns next to a reachable cell becomes safe ground
    if (tools.has('shovel')) {
      for (let cy = 0; cy < grid.H; cy++) for (let cx = 0; cx < grid.W; cx++) {
        if (grid.at(cx, cy) !== THORN || !(cx === 0 || grid.at(cx - 1, cy) !== THORN)) continue;
        let x1 = cx; while (grid.at(x1 + 1, cy) === THORN) x1++;
        if (x1 - cx + 1 > 14) continue;                                          // (a bounce clears about 6 tiles)
        const next = reach.some((A) => A.cy === cy && (A.cx === cx - 1 || A.cx === x1 + 1));
        if (!next) continue;
        for (let x = cx; x <= x1; x++) setTile(grid, x, cy, '.');
        opened.push({ kind: '^', cx, cy, tool: 'shovel' }); changed = true;
      }
    }
    if (!changed) break;
  }
  const unopened = gates.filter((g) => !g.done).map((g) => ({ kind: g.kind, cx: g.cx, cy: g.cy, tool: g.tool, haveTool: tools.has(g.tool) }));
  return { grid, tools, opened, unopened, zones: enabled, slushLeft };
}

// ---- validation ---------------------------------------------------------------------------------------------------------------------------------------
export function validatePage(page) {
  const errors = [...(page.errors || [])];
  const rows = page.rows || [];
  if (!rows.length) errors.push('no rows');
  rows.forEach((r, i) => { if (r.length !== page.W) errors.push(`row ${i} is ${r.length} wide, expected ${page.W}`); });
  if (!page.start) errors.push('no start (P)');
  if (!page.goal) errors.push('no goal (G)');
  const have = page.letters.map((l) => l.ch).sort().join('');
  if (page.bonus ? page.letters.length !== 0 : have !== [...LETTERS].sort().join('')) errors.push(`letters must be exactly F E A S T once each (found ${page.letters.map((l) => l.ch).join('') || 'none'})`);
  if (!page.campfires.length) errors.push('no campfire');
  if (page.pads.length && !page.bloom) errors.push('bloom pads (~) need a Night-Bloom (N) to start the Bloom Moment');
  if (page.bloom && !page.pads.length && !page.frostBloom) errors.push('a Night-Bloom (N) with no bloom pads (~) does nothing');
  for (const m of page.movers || []) {
    if (m.kind === 'log' && !page.tide) errors.push('a floating log needs the page\'s tide');
    if (!(m.period > 1) || (m.kind !== 'log' && m.kind !== 'leaf')) errors.push(`bad moving platform ${JSON.stringify(m)}`);
    if ((m.kind === 'leaf' && Math.min(m.x0, m.x1) < 1) || Math.max(m.x0, m.x1) > page.W - 1) errors.push('a moving platform leaves the page');
  }
  // Step 52b: the snow things must be well formed
  if ((page.buddies || []).length !== page.crates.length) errors.push(`${page.crates.length} buddy crates (Y) need ${page.crates.length} \`buddies\` abilities (found ${(page.buddies || []).length})`);
  for (const c of page.crates) if (!c.ability || !(c.ability === 'dash' || LIMITS.buddy[c.ability])) errors.push(`a buddy crate at ${Math.floor(c.x)},${Math.floor(c.y)} has no valid ability (dash | glide | super | flutter)`);
  for (const q of page.sleds) if (!(q.x1 - q.x0 >= 12) || q.x0 < 2 || q.x1 > page.W - 2) errors.push(`a sled run ${q.x0}..${q.x1} must be at least 12 tiles long and inside the page`);
  for (const q of page.slush) if (q.x1 - q.x0 + 1 > SNOW.freezeMaxRun) errors.push(`a slush run at ${q.x0},${q.row} is ${q.x1 - q.x0 + 1} tiles: one snowball freezes at most ${SNOW.freezeMaxRun}`);
  for (const x of page.buddyGates) if (!Number.isInteger(x) || x < 1 || x > page.W - 1) errors.push(`a buddy gate at ${x} is outside the page`);
  for (const br of page.branches) if (!page.sleds.some((q) => br.cx >= q.x0 && br.cx < q.x1)) errors.push(`a low branch at ${br.cx},${br.cy} is not inside a sled run`);
  for (const ic of page.icicles) { const cx = Math.floor(ic.x), cy = Math.floor(ic.y); if (page.grid.at(cx, cy + 1) !== SOLID || page.grid.at(cx, cy) === SOLID) errors.push(`an icicle at ${cx},${cy} needs a solid ceiling above it and an empty cell`); }
  if (page.flowers.length !== 0 && page.flowers.length !== 3) errors.push(`a page has no pressed flowers or exactly 3 (found ${page.flowers.length})`);
  if (errors.length) return { ok: false, errors, stats: {} };

  // 1. the page as written: things stand on ground
  const g0 = page.grid, graph0 = buildGraph(page), stand0 = graph0.stand;
  for (const [what, list] of [['tool stand', page.stands], ['tree', page.trees], ['dig spot', page.digs], ['enemy', page.enemies], ['stone / fruit / log / snowball', page.objects], ['buddy crate', page.crates]]) {
    for (const e of list) if (!stand0(Math.floor(e.x), Math.floor(e.y))) errors.push(`${what} at ${Math.floor(e.x)},${Math.floor(e.y)} is not on standable ground`);
  }
  // 2. the tool gates solved: the grid with every gate a party could open, opened
  const solved = solveGates(page), g = solved.grid, at = (cx, cy) => g.at(cx, cy);
  for (const u of solved.unopened) {
    errors.push(`the ${GATE_NAME[u.kind]} at ${u.cx},${u.cy} can never be opened: ${u.tool === 'dash' ? (u.haveTool ? 'no cell inside the dash buddy\'s zone is next to it' : 'no fox / dash buddy crate is reachable before it (a buddy-gated route needs a crate first)') : u.haveTool ? `it cannot be reached with the ${u.tool}` : `no ${u.tool} stand is reachable before it`}`);
  }
  // Step 52a: the SOLO model. The required graph has every tool gate opened and every platform that ever passes by (the union of a leaf / log's positions: a lone player waits for it), but NO
  // bloom pads, no toss, no friend heads and the co-op doors sealed: the goal, every letter, flower, campfire and the secret exit must be reachable in it.
  const gReq = cloneGrid(g), virtual = moverCells(page);
  const fp = { ...page, grid: gReq, virtual, enabledZones: solved.zones };
  const graph = buildGraph(fp), { stand } = graph;
  const gFull = cloneGrid(gReq);
  for (const pd of page.pads) setTile(gFull, pd.cx, pd.cy, '=');
  const frostOpens = !!page.frostBloom && solved.slushLeft.length > 0;                    // Step 52b: a frost Bloom Moment turns the slush no snowball reaches into ice
  if (frostOpens) for (const q of solved.slushLeft) for (let x = q.x0; x <= q.x1; x++) setTile(gFull, x, q.row, 'I');
  const bloomOpens = page.pads.length > 0 || frostOpens;
  const graphFull = bloomOpens ? buildGraph({ ...fp, grid: gFull }) : graph;
  const zoneAt = (cx) => solved.zones.find((z) => LIMITS.buddy[z.ability] && cx >= z.x0 && cx < z.x1) || null;
  for (const [what, list] of [['berry', page.berries], ['letter', page.letters], ['pressed flower', page.flowers]]) {
    for (const e of list) if (page.grid.at(Math.floor(e.x), Math.floor(e.y)) === SOLID) errors.push(`${what} inside solid ground at ${e.x},${e.y}`);
  }
  for (let cy = 0; cy < g.H; cy++) for (let cx = 0; cx < g.W; cx++) if (at(cx, cy) === SPRING && !stand(cx, cy)) errors.push(`spring at ${cx},${cy} has no ground under it`);
  const feet = (e) => ({ cx: Math.floor(e.x), cy: Math.floor(e.y) });
  const startC = feet(page.start), goalC = feet(page.goal), secretC = page.secret ? feet(page.secret) : null;
  for (const [what, c] of [['start', startC], ['goal', goalC], ...(secretC ? [['secret exit', secretC]] : []), ...(page.bloom ? [['Night-Bloom', feet(page.bloom)]] : []), ...page.campfires.map((f, i) => [`campfire ${i}`, feet(f)])]) {
    if (!graph0.stand(c.cx, c.cy)) errors.push(`${what} at ${c.cx},${c.cy} is not on standable ground`);
  }
  if (errors.length) return { ok: false, errors, stats: {} };

  const { cells, adj, id } = graph;
  const startI = id(startC.cx, startC.cy), goalI = id(goalC.cx, goalC.cy);
  const fwd = bfsFrom(graph, startI);
  if (!fwd[goalI]) errors.push(`the goal at ${goalC.cx},${goalC.cy} cannot be reached from the start`);
  for (const c of page.crates) { const i = id(Math.floor(c.x), Math.floor(c.y)); if (i === undefined || !fwd[i]) errors.push(`the buddy crate at ${Math.floor(c.x)},${Math.floor(c.y)} cannot be reached from the start`); }
  if (page.sleds.length) { const sim = simulateSled(page, g); if (!sim.ok) errors.push(`sled run: ${sim.reason}`); }
  const secretI = secretC ? id(secretC.cx, secretC.cy) : undefined;
  if (secretC && !fwd[secretI]) errors.push(`the secret exit at ${secretC.cx},${secretC.cy} cannot be reached by one player alone`);
  // Step 52a: the Night-Bloom itself must be touchable, and everything a Bloom Moment opens is judged on the FULL graph (pads as planks) within a time budget of walking
  const startF = graphFull.id(startC.cx, startC.cy);
  const fwdFull = bloomOpens ? bfsFrom(graphFull, startF) : fwd;
  let bloomDist = null;
  if (page.bloom) {
    const bc = feet(page.bloom), bi = id(bc.cx, bc.cy);
    if (bi === undefined || !fwd[bi]) errors.push(`the Night-Bloom at ${bc.cx},${bc.cy} cannot be reached from the start`);
    else {                                                                    // walking-cost Dijkstra from the Night-Bloom over the full graph (pads in): a pad route must fit the Bloom Moment
      const cost = (a, b) => Math.max(1, Math.abs(graphFull.cells[a].cx - graphFull.cells[b].cx)) + Math.abs(graphFull.cells[a].cy - graphFull.cells[b].cy);
      const fi = graphFull.id(bc.cx, bc.cy);
      bloomDist = new Float64Array(graphFull.cells.length).fill(Infinity);
      if (fi !== undefined) {
        bloomDist[fi] = 0; const open = [fi];
        while (open.length) {
          let bestI = 0; for (let k = 1; k < open.length; k++) if (bloomDist[open[k]] < bloomDist[open[bestI]]) bestI = k;
          const a = open.splice(bestI, 1)[0];
          for (const b of graphFull.adj[a]) { const d = bloomDist[a] + cost(a, b); if (d < bloomDist[b]) { bloomDist[b] = d; open.push(b); } }
        }
      }
    }
    // a pad that ends under a body must drop it onto ground a lone player can stand on (never into a pit)
    for (const pd of page.pads) {
      let landY = -1; for (let y = pd.cy - 1; y >= 0; y--) { const ch = g.at(pd.cx, y); if (ch === SOLID || ch === ONEWAY) { landY = y + 1; break; } }
      const li = landY >= 0 ? id(pd.cx, landY) : undefined;
      const lf = landY >= 0 ? graphFull.id(pd.cx, landY) : undefined;
      if (landY < 0 || (li !== undefined && !fwd[li] && !(lf !== undefined && fwdFull[lf]))) errors.push(`the bloom pad at ${pd.cx},${pd.cy} would drop a player into a pit`);
    }
  }
  // letters / berries / flowers: touched from a reached standable cell (a body is about 1 tile wide and 1.4 tall; the target counts as a 'landing' one tile lower)
  const touchIn = (e, G, F, D = null) => {
    const lx = Math.floor(e.x), ly = Math.floor(e.y);
    for (let i = 0; i < G.cells.length; i++) {
      if (!F[i] || (D && D[i] > BLOOM.budgetTiles)) continue;
      const c = G.cells[i], dy = ly - 1 - c.cy, dx = Math.abs(lx - c.cx);
      const spring = at(c.cx, c.cy) === SPRING;
      const z = spring ? null : zoneAt(c.cx);                                // (inside a buddy's zone its ability's jump counts)
      const up = spring ? LIMITS.springMaxUp : z ? LIMITS.buddy[z.ability].maxUp : LIMITS.maxUp, reach = (spring ? LIMITS.springReach : z ? LIMITS.buddy[z.ability].reach : LIMITS.reach)(Math.max(0, Math.min(dy, up)));
      if (dy <= up && dx <= Math.max(1, reach + 1)) return true;
    }
    return false;
  };
  // why a thing cannot be reached by ONE player: say what WOULD reach it (a toss, a bloom pad), because co-op and Bloom Moments are never required
  const whyNot = (e) => {
    const lx = Math.floor(e.x), ly = Math.floor(e.y);
    if (bloomOpens && touchIn(e, graphFull, fwdFull)) return ' (only reachable over bloom pads / frozen slush: letters, flowers needed to clear, campfires, the goal and the secret exit never depend on a Bloom Moment)';
    if (page.crates.length && !solved.zones.length) return ' (a buddy crate would have to be reached first)';
    if (cells.some((c, i) => fwd[i] && ly - c.cy >= 1 && Math.abs(lx - c.cx) <= tossReach(ly - c.cy))) return ' (only a friend toss would reach it: co-op is never required to finish anything)';
    return '';
  };
  const touchable = (e, label, strict, soft = false) => {
    if (touchIn(e, graph, fwd)) return true;
    if (soft && bloomOpens && bloomDist && touchIn(e, graphFull, fwdFull, bloomDist)) return true;       // an optional reward that a Bloom Moment opens, reachable within the bloom's time budget
    if (strict) errors.push(`${label} at ${Math.floor(e.x)},${Math.floor(e.y)} cannot be reached from the start${whyNot(e)}`);
    return false;
  };
  for (const l of page.letters) touchable(l, `letter ${l.ch}`, true);
  for (const f of page.flowers) {
    if (f.buried !== null && solved.unopened.some((u) => u.kind === 'Q' && u.cx === Math.floor(page.digs[f.buried].x) && u.cy === Math.floor(page.digs[f.buried].y))) { errors.push(`pressed flower ${f.id} is buried in a dig spot that can never be dug`); continue; }
    touchable(f, `pressed flower ${f.id}`, true, true);
  }
  let berriesOut = 0; const berryMiss = [];
  for (const b of page.berries) {
    if (b.toss) {                                                         // a toss berry: optional, so it need NOT be walkable; it must be on a ledge a toss from a reachable cell can reach
      const lx = Math.floor(b.x), ly = Math.floor(b.y);
      if (!stand(lx, ly)) errors.push(`toss berry at ${lx},${ly} does not sit on a ledge`);
      else if (!cells.some((c, i) => fwd[i] && ly - c.cy >= 1 && Math.abs(lx - c.cx) <= tossReach(ly - c.cy))) errors.push(`toss berry at ${lx},${ly} is out of reach of every friend toss`);
      continue;
    }
    if (!touchable(b, 'berry', false, true)) { berriesOut++; if (berryMiss.length < 6) berryMiss.push(`${Math.floor(b.x)},${Math.floor(b.y)}`); }
  }
  if (berriesOut) errors.push(`${berriesOut} berries cannot be reached, e.g. ${berryMiss.join(' ')}`);
  for (const f of page.campfires) {
    const c = feet(f), fi = id(c.cx, c.cy);
    if (!fwd[fi]) { errors.push(`campfire ${f.index} cannot be reached from the start`); continue; }
    const back = bfsFrom(graph, fi);
    if (!back[startI] && !back[goalI]) errors.push(`neither the start nor the goal can be reached from campfire ${f.index} (a respawn there would be a soft-lock)`);
  }
  // soft-locks: every cell the party can stand on must lead back to the start (or on to the goal)
  const radj = cells.map(() => []);
  adj.forEach((s, a) => { for (const b of s) radj[b].push(a); });
  const rev = (from) => { const seen = new Uint8Array(cells.length), q = [from]; seen[from] = 1; for (let h = 0; h < q.length; h++) for (const n of radj[q[h]]) if (!seen[n]) { seen[n] = 1; q.push(n); } return seen; };
  const toStart = rev(startI), toGoal = rev(goalI), toSecret = secretC ? rev(secretI) : toGoal;
  let stuck = 0, firstStuck = null;
  for (let i = 0; i < cells.length; i++) if (fwd[i] && !toStart[i] && !toGoal[i] && !toSecret[i]) { stuck++; firstStuck = firstStuck || cells[i]; }
  if (stuck) errors.push(`${stuck} reachable cells are a dead end, e.g. ${firstStuck.cx},${firstStuck.cy}`);
  let reached = 0; for (const v of fwd) reached += v;
  return {
    ok: errors.length === 0, errors,
    stats: { solo: true, slush: page.slush.length, icicles: page.icicles.length, crates: page.crates.length, sleds: page.sleds.length, zones: solved.zones.length, movers: (page.movers || []).length, gusts: (page.gusts || []).length, pads: page.pads.length, secret: !!page.secret, bloom: !!page.bloom, cells: cells.length, reached, berries: page.berries.length, letters: page.letters.length, flowers: page.flowers.length, campfires: page.campfires.length, gates: page.gates.length + page.trees.length + page.digs.length, opened: solved.opened.length, tools: [...solved.tools].sort() },
  };
}
