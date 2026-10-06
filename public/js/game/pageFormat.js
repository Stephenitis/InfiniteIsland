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
import { createGrid, cloneGrid, setTile, LIMITS, SOLID, ONEWAY, SLOPE_R, SLOPE_L, THORN, SPRING, EMPTY, GATE_CHARS } from './platformerLogic.js';
import { GATE_TOOL, hitRect, openCells, treeFill } from './pageWorldLogic.js';
import { tossReach } from './pageCoopLogic.js';

export { LETTERS, pageToWorld, worldToPage };
const MARKER_LETTER = { f: 'F', e: 'E', a: 'A', s: 'S', t: 'T' };
const TILE_CHARS = '.#=/\\^S' + GATE_CHARS;
const STAND_TOOL = { 1: 'axe', 2: 'hammer', 3: 'shovel', 4: 'sword' };
const ENEMY_MARK = { n: 'acorn', b: 'beetle', u: 'bush' };
const OBJECT_MARK = { r: 'stone', m: 'fruit', l: 'log' };
export { GATE_TOOL };

export function parsePage(raw) {
  const rows = raw.rows;
  const H = rows.length, W = rows[0] ? rows[0].length : 0;
  const page = { ...raw, W, H, length: W, floorRows: raw.floorRows ?? 2, errors: [] };
  page.berries = []; page.letters = []; page.campfires = []; page.start = null; page.goal = null;
  page.flowers = []; page.stands = []; page.trees = []; page.digs = []; page.enemies = []; page.objects = []; page.gates = [];
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
      else if (ch === 'Q') page.digs.push({ x: c + 0.5, y: cy });
      else if (ch in ENEMY_MARK) page.enemies.push({ kind: ENEMY_MARK[ch], x: c + 0.5, y: cy });
      else if (ch in OBJECT_MARK) page.objects.push({ kind: OBJECT_MARK[ch], x: c + 0.5, y: cy });
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
  page.shakeTrees = (raw.decor || []).filter((d) => d.kind === 'tree' && d.shake).map((d, i) => ({ i, x: d.x, s: d.s || 1 }));
  for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) { const k = page.grid.kind(cx, cy); if (k !== '.' && k !== 'L' && k !== 'K') page.gates.push({ kind: k, cx, cy }); }
  page.letters.sort((a, b) => a.x - b.x);
  found.sort((a, b) => a.x - b.x);
  page.campfires = found.map((f, index) => ({ ...f, index }));
  page.spawnX = page.start ? page.start.x - W / 2 : -W / 2 + 2;
  page.exitX = page.spawnX + (raw.exitOffset ?? 7);
  if (!page.banner) page.banner = page.name;
  if (raw.mid && raw.mid.auto) page.mid = autoMid(W, raw.mid.seed);
  if (raw.back && raw.back.auto) page.back = autoBack(W, raw.back.seed);
  return page;
}

// the paper cut-out layers a page asks for with mid/back { auto: true, seed } (x relative to the page centre, like the Step 48 lists)
const MID_COLORS = ['#58c96b', '#ff9fc6', '#74d983', '#4fbf8a', '#ffd85e', '#8fe36b'];
function autoMid(W, seed = 1) {
  const rng = mulberry32(seed), out = [];
  for (let x = -W / 2 - 8; x < W / 2 + 12; x += 4.5 + rng() * 4) {
    const r = rng(), s = 0.9 + rng() * 0.6, color = MID_COLORS[Math.floor(rng() * MID_COLORS.length)];
    out.push(r < 0.15 ? { kind: 'hill', x, z: -12 - rng() * 2, s: 1 + rng() * 0.7, color: '#7fdc78' }
      : r < 0.75 ? { kind: 'tree', x, z: -7.5 - rng() * 3, s, color } : { kind: 'bush', x, z: -7 - rng() * 1.5, s: 0.9 + rng() * 0.4, color: '#74d983' });
  }
  return out;
}
function autoBack(W, seed = 1) {
  const rng = mulberry32(seed), hills = [], clouds = [];
  const cols = ['#9ad8a8', '#86c8b8', '#a6e0b0'];
  for (let x = -W / 2 - 20; x < W / 2 + 30; x += 24 + rng() * 10) hills.push({ x, z: -34 - rng() * 12, w: 26 + rng() * 14, h: 11 + rng() * 8, color: cols[Math.floor(rng() * 3)] });
  hills.push({ x: 0, z: -58, w: W + 80, h: 26, color: '#b7e6dc' });
  for (let x = -W / 2 - 20; x < W / 2 + 30; x += 20 + rng() * 14) clouds.push({ x, y: 14 + rng() * 8, z: -28 - rng() * 12, s: 1 + rng() * 0.8 });
  return { hills, clouds };
}

/** The standable cells of a page and the moves between them (walk / jump / fall): { cells, adj, id, stand }. */
export function buildGraph(page) {
  const g = page.grid, at = (cx, cy) => g.at(cx, cy);
  const stand = (cx, cy) => {
    if (cx < 0 || cx >= g.W || cy < 0 || cy >= g.H) return false;
    const ch = at(cx, cy);
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
    const up = spring ? LIMITS.springMaxUp : LIMITS.maxUp, reachOf = spring ? LIMITS.springReach : LIMITS.twirlReach;      // (a jump may end in a twirl glide: Cancel in the air)
    for (let dx = -14; dx <= 14; dx++) {
      const bx = A.cx + dx;
      if (bx < 0 || bx >= g.W) continue;
      for (const bi of byCol[bx]) {
        const B = cells[bi], dy = B.cy - A.cy;
        if (bi === ai || dy > up || dy < -LIMITS.maxDrop) continue;
        if (Math.abs(dx) > Math.min(14, reachOf(dy))) continue;
        const x0 = Math.min(A.cx, bx), x1 = Math.max(A.cx, bx);
        let ok = true;
        const top = Math.max(A.cy, B.cy);
        if (dy >= 0) {
          for (let cx = x0; cx <= x1 && ok; cx++) for (let cy = top; cy <= top + 2; cy++) if (blockedAt(cx, cy)) { ok = false; break; }
        } else {
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
const GATE_NAME = { B: 'stone block', X: 'cracked floor', W: 'bramble wall', D: 'soft soil', H: 'hanging crate', R: 'geode', T: 'tree', Q: 'dig spot' };
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
 * -> { grid (every openable gate opened), tools: Set, opened: [{ kind, cx, cy, tool }], unopened: [gate] }
 */
export function solveGates(page) {
  const grid = cloneGrid(page.grid), tools = new Set(), opened = [];
  const gates = page.gates.map((g) => ({ ...g, tool: GATE_TOOL[g.kind], done: false, type: 'tile' }));
  for (const t of page.trees) gates.push({ kind: 'T', cx: Math.floor(t.x), cy: Math.floor(t.y), tool: 'axe', done: false, type: 'tree', tree: t });
  for (const d of page.digs) gates.push({ kind: 'Q', cx: Math.floor(d.x), cy: Math.floor(d.y), tool: 'shovel', done: false, type: 'dig', dig: d });
  const startC = page.start ? { cx: Math.floor(page.start.x), cy: Math.floor(page.start.y) } : null;
  for (let guard = 0; guard < 120 && startC; guard++) {
    const graph = buildGraph({ grid });
    const startI = graph.id(startC.cx, startC.cy);
    if (startI === undefined) break;
    const seen = bfsFrom(graph, startI), reach = graph.cells.filter((_, i) => seen[i]);
    for (const s of page.stands) { const i = graph.id(Math.floor(s.x), Math.floor(s.y)); if (i !== undefined && seen[i]) tools.add(s.tool); }
    let changed = false;
    for (const g of gates) {
      if (g.done || !tools.has(g.tool)) continue;
      let ok = false, dir = 1;
      if (g.kind === 'X') {                                                   // a ground pound from the air over the cell
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
  return { grid, tools, opened, unopened };
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
  if (have !== [...LETTERS].sort().join('')) errors.push(`letters must be exactly F E A S T once each (found ${page.letters.map((l) => l.ch).join('') || 'none'})`);
  if (!page.campfires.length) errors.push('no campfire');
  if (page.flowers.length !== 0 && page.flowers.length !== 3) errors.push(`a page has no pressed flowers or exactly 3 (found ${page.flowers.length})`);
  if (errors.length) return { ok: false, errors, stats: {} };

  // 1. the page as written: things stand on ground
  const g0 = page.grid, graph0 = buildGraph(page), stand0 = graph0.stand;
  for (const [what, list] of [['tool stand', page.stands], ['tree', page.trees], ['dig spot', page.digs], ['enemy', page.enemies], ['stone / fruit / log', page.objects]]) {
    for (const e of list) if (!stand0(Math.floor(e.x), Math.floor(e.y))) errors.push(`${what} at ${Math.floor(e.x)},${Math.floor(e.y)} is not on standable ground`);
  }
  // 2. the tool gates solved: the grid with every gate a party could open, opened
  const solved = solveGates(page), g = solved.grid, at = (cx, cy) => g.at(cx, cy);
  for (const u of solved.unopened) {
    errors.push(`the ${GATE_NAME[u.kind]} at ${u.cx},${u.cy} can never be opened: ${u.haveTool ? `it cannot be reached with the ${u.tool}` : `no ${u.tool} stand is reachable before it`}`);
  }
  const fp = { ...page, grid: g };
  const graph = buildGraph(fp), { stand } = graph;
  for (const [what, list] of [['berry', page.berries], ['letter', page.letters], ['pressed flower', page.flowers]]) {
    for (const e of list) if (page.grid.at(Math.floor(e.x), Math.floor(e.y)) === SOLID) errors.push(`${what} inside solid ground at ${e.x},${e.y}`);
  }
  for (let cy = 0; cy < g.H; cy++) for (let cx = 0; cx < g.W; cx++) if (at(cx, cy) === SPRING && !stand(cx, cy)) errors.push(`spring at ${cx},${cy} has no ground under it`);
  const feet = (e) => ({ cx: Math.floor(e.x), cy: Math.floor(e.y) });
  const startC = feet(page.start), goalC = feet(page.goal);
  for (const [what, c] of [['start', startC], ['goal', goalC], ...page.campfires.map((f, i) => [`campfire ${i}`, feet(f)])]) {
    if (!graph0.stand(c.cx, c.cy)) errors.push(`${what} at ${c.cx},${c.cy} is not on standable ground`);
  }
  if (errors.length) return { ok: false, errors, stats: {} };

  const { cells, adj, id } = graph;
  const startI = id(startC.cx, startC.cy), goalI = id(goalC.cx, goalC.cy);
  const fwd = bfsFrom(graph, startI);
  if (!fwd[goalI]) errors.push(`the goal at ${goalC.cx},${goalC.cy} cannot be reached from the start`);
  // letters / berries / flowers: touched from a reached standable cell (a body is about 1 tile wide and 1.4 tall; the target counts as a 'landing' one tile lower)
  const touchable = (e, label, strict) => {
    const lx = Math.floor(e.x), ly = Math.floor(e.y);
    for (let i = 0; i < cells.length; i++) {
      if (!fwd[i]) continue;
      const c = cells[i], dy = ly - 1 - c.cy, dx = Math.abs(lx - c.cx);
      const spring = at(c.cx, c.cy) === SPRING;
      const up = spring ? LIMITS.springMaxUp : LIMITS.maxUp, reach = (spring ? LIMITS.springReach : LIMITS.reach)(Math.max(0, Math.min(dy, up)));
      if (dy <= up && dx <= Math.max(1, reach + 1)) return true;
    }
    if (strict) errors.push(`${label} at ${lx},${ly} cannot be reached from the start`);
    return false;
  };
  for (const l of page.letters) touchable(l, `letter ${l.ch}`, true);
  for (const f of page.flowers) {
    if (f.buried !== null && solved.unopened.some((u) => u.kind === 'Q' && u.cx === Math.floor(page.digs[f.buried].x) && u.cy === Math.floor(page.digs[f.buried].y))) { errors.push(`pressed flower ${f.id} is buried in a dig spot that can never be dug`); continue; }
    touchable(f, `pressed flower ${f.id}`, true);
  }
  let berriesOut = 0;
  for (const b of page.berries) {
    if (b.toss) {                                                         // a toss berry: optional, so it need NOT be walkable; it must be on a ledge a toss from a reachable cell can reach
      const lx = Math.floor(b.x), ly = Math.floor(b.y);
      if (!stand(lx, ly)) errors.push(`toss berry at ${lx},${ly} does not sit on a ledge`);
      else if (!cells.some((c, i) => fwd[i] && ly - c.cy >= 1 && Math.abs(lx - c.cx) <= tossReach(ly - c.cy))) errors.push(`toss berry at ${lx},${ly} is out of reach of every friend toss`);
      continue;
    }
    if (!touchable(b, 'berry', false)) berriesOut++;
  }
  if (berriesOut) errors.push(`${berriesOut} berries cannot be reached`);
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
  const toStart = rev(startI), toGoal = rev(goalI);
  let stuck = 0, firstStuck = null;
  for (let i = 0; i < cells.length; i++) if (fwd[i] && !toStart[i] && !toGoal[i]) { stuck++; firstStuck = firstStuck || cells[i]; }
  if (stuck) errors.push(`${stuck} reachable cells are a dead end, e.g. ${firstStuck.cx},${firstStuck.cy}`);
  let reached = 0; for (const v of fwd) reached += v;
  return {
    ok: errors.length === 0, errors,
    stats: { cells: cells.length, reached, berries: page.berries.length, letters: page.letters.length, flowers: page.flowers.length, campfires: page.campfires.length, gates: page.gates.length + page.trees.length + page.digs.length, opened: solved.opened.length, tools: [...solved.tools].sort() },
  };
}
