// The storybook page FORMAT (Step 49): turns a page file's ASCII tile rows into a grid + entity lists, and validates that a page can actually be finished.
// PURE (no three.js / DOM; Node-tested in test/platformer.test.js on every registered page). A page file (game/pages/*.js) is data only:
//
//   { id, name, blurb, banner, floorRows, rows: [ ...strings, TOP row first, all the same width ], decor: [...], mid: [...], back: {...} }
//
// Row legend (one character per 1 u tile; everything not a tile is an entity marker and counts as an empty tile):
//   .  empty      #  solid ground (grass-capped where open above)      =  one-way plank / branch shelf (land from above, pass from below, down + Jump drops through)
//   /  \  45 degree slopes (the floor rises / falls to the right)      ^  thorns (hurt, pass-through)      S  spring flower (launches higher)
//   markers:  P start (where the party appears)   G goal bookmark (the page's end)   C campfire checkpoint   o berry   f e a s t  the letters F E A S T
//   `floorRows` (default 2): how many tile rows lie below the lane's floor height PAGE.y, so the strip's floor sits where Step 48's lane was.
//   `decor` (not collidable, drawn at the lane's depth): { kind: 'tree', x, s? } ({ x } = tile column of the trunk, base on the ground below it), { kind: 'bush' | 'flower' | 'sign', x, text? }
//   `mid` / `back`: the cut-out layers of Step 48 (see world/pageVisuals.js), in TILE columns relative to the page's centre.
//
//   parsePage(raw)            -> the page with: W, H, length (= W), tileRows, grid, start {x, y}, goal {x, y}, berries [{x, y}], letters [{ch, x, y}],
//                                campfires [{x, y, index}] (sorted left to right; index 0 is the first = the start fire), spawnX / exitX (world offsets from the page centre)
//                                positions are TILE coordinates: x to the right, y up from the page's bottom row; berries / letters at tile centres, the rest at their feet cell centres
//   pageToWorld(page, tx, ty) -> { x, y, z } in the pocket        worldToPage(page, x, y) -> { tx, ty }
//   validatePage(page)        -> { ok, errors: [string], stats: { cells, reached, ... } }
//   Reachability is a conservative BFS over "standable cells" using LIMITS (game/platformerLogic.js): walking (flat / slopes), jumps (up to maxUp, across reach(dy)), falls,
//   springs (their own reach). It proves the goal, every letter and every campfire reachable from the start, the start reachable from every campfire, and
//   that no reachable cell is a soft-lock (every one can get back to the start or on to the goal).
import { LETTERS, pageToWorld, worldToPage } from './storybookLogic.js';
import { mulberry32 } from '../utils/rng.js';
import { createGrid, LIMITS, SOLID, ONEWAY, SLOPE_R, SLOPE_L, THORN, SPRING, EMPTY } from './platformerLogic.js';

export { LETTERS, pageToWorld, worldToPage };
const MARKER_LETTER = { f: 'F', e: 'E', a: 'A', s: 'S', t: 'T' };
const TILE_CHARS = '.#=/\\^S';

export function parsePage(raw) {
  const rows = raw.rows;
  const H = rows.length, W = rows[0] ? rows[0].length : 0;
  const page = { ...raw, W, H, length: W, floorRows: raw.floorRows ?? 2, errors: [] };
  page.berries = []; page.letters = []; page.campfires = []; page.start = null; page.goal = null;
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
      else if (ch in MARKER_LETTER) page.letters.push({ ch: MARKER_LETTER[ch], x: c + 0.5, y: cy + 0.5 });
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
    const up = spring ? LIMITS.springMaxUp : LIMITS.maxUp, reachOf = spring ? LIMITS.springReach : LIMITS.reach;
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
  if (errors.length) return { ok: false, errors, stats: {} };

  const g = page.grid, at = (cx, cy) => g.at(cx, cy);
  const graph = buildGraph(page), { stand } = graph;
  for (const [what, list] of [['berry', page.berries], ['letter', page.letters]]) {
    for (const e of list) if (at(Math.floor(e.x), Math.floor(e.y)) === SOLID) errors.push(`${what} inside solid ground at ${e.x},${e.y}`);
  }
  for (let cy = 0; cy < g.H; cy++) for (let cx = 0; cx < g.W; cx++) if (at(cx, cy) === SPRING && !stand(cx, cy)) errors.push(`spring at ${cx},${cy} has no ground under it`);
  const feet = (e) => ({ cx: Math.floor(e.x), cy: Math.floor(e.y) });
  const startC = feet(page.start), goalC = feet(page.goal);
  for (const [what, c] of [['start', startC], ['goal', goalC], ...page.campfires.map((f, i) => [`campfire ${i}`, feet(f)])]) {
    if (!stand(c.cx, c.cy)) errors.push(`${what} at ${c.cx},${c.cy} is not on standable ground`);
  }
  if (errors.length) return { ok: false, errors, stats: {} };

  const { cells, adj, id } = graph;
  const bfs = (from) => {
    const seen = new Uint8Array(cells.length), q = [from];
    seen[from] = 1;
    for (let h = 0; h < q.length; h++) for (const n of adj[q[h]]) if (!seen[n]) { seen[n] = 1; q.push(n); }
    return seen;
  };
  const startI = id(startC.cx, startC.cy), goalI = id(goalC.cx, goalC.cy);
  const fwd = bfs(startI);
  if (!fwd[goalI]) errors.push(`the goal at ${goalC.cx},${goalC.cy} cannot be reached from the start`);
  // letters / berries: touched from a reached standable cell (a body is about 1 tile wide and 1.4 tall; the target counts as a 'landing' one tile lower)
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
  let berriesOut = 0;
  for (const b of page.berries) if (!touchable(b, 'berry', false)) berriesOut++;
  if (berriesOut) errors.push(`${berriesOut} berries cannot be reached`);
  for (const f of page.campfires) {
    const c = feet(f), fi = id(c.cx, c.cy);
    if (!fwd[fi]) { errors.push(`campfire ${f.index} cannot be reached from the start`); continue; }
    if (!bfs(fi)[startI]) errors.push(`the start cannot be reached from campfire ${f.index} (a respawn there would be a soft-lock)`);
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
  return { ok: errors.length === 0, errors, stats: { cells: cells.length, reached, berries: page.berries.length, letters: page.letters.length, campfires: page.campfires.length } };
}
