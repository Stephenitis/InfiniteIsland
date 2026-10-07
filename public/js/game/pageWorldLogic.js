// The storybook page WORLD rules (Step 50): PURE, host-decided, Node-tested (test/pageWorld.test.js). No three.js / DOM.
// A page run has a working copy of the page's tiles plus everything the party can change: tool gates (stone blocks, cracked floors, bramble walls, soft soil, hanging crates, geodes,
// trees that fall into bridges, dig spots), the three enemies, and the throwable objects (stones, fruit, logs, enemy seeds). game/storybook.js owns the sync domain; this module is
// the rules it runs. Coordinates are TILE coordinates (x right, y up, feet-based boxes) like game/platformerLogic.js.
//
//   createWorld(page)                      -> the run's world: { grid (working copy), cells {"cx,cy": ch}, hits {key: n}, felled {tree: dir}, shaken [i], dug [i], bonus, tools {actorKey: tool}, enemies, objects, nextObj }
//   request(world, kind, data, actor)      HOST: validate one request and DECIDE it -> { ok: true, recs: [rec] } | { ok: false, reason }; the host applies the recs to its own world with
//                                          applyRecs and emits them; a replica only ever applies them. actor = { key, x, y, tool } (tile coordinates; tool = the tool kind the actor holds or null).
//                                          kinds: take { stand } | untool {} | hit { face } | pound {} | stomp { id, mode } | soil { cx, cy } | grab { type: 'o' | 'e', id } | throw { mode, face } | drop {} | seedhit { id }
//   applyRecs(world, recs)                 the one place world state changes (the same code on every screen); recs: hit tile felled shake dig spawn spawnE defeat estate ostate bat hold throw tool bonus fire
//   stepWorld(world, dt, actors, ctx)      HOST: one fixed step of the enemies and the objects (patrol, shells, seeds, flying stones ...) -> recs; ctx = { fires: [{ idx, x, y, lit }] }
//   motion(world) / applyMotion(world, m)  the compact 10 Hz broadcast of moving things (positions rounded to 1/100 tile)
//   snapshot(world) / loadSnapshot(world, s) / hashView(world)      late joiners; the hash covers tiles, hits, dead enemies, objects' held / at-rest state, tools (not exact moving positions)
//   Step 51: the host remembers each enemy's last PAGE_MP.stompHistory seconds of positions (`world.hist`, never synced or hashed): a stomp is accepted when the enemy was in reach at ANY of them (stompInReach);
//   extrapolate(world, dt) (replicas) keeps walking enemies moving between the 10 Hz motion packets so contact looks and feels fair
//   hitRect(tool, x, y, face)  the swing's box;  gateAt / openCells / treeFill / crateLanding: how gates change the grid (shared with the page validator, game/pageFormat.js)
//   contactKind(enemy, body, mode) 'stomp' | 'hurt' | null: a player's body against an enemy;   contextAction(world, actor) the prompt a player should see
// Step 52b (Frostpine Slopes, rules in game/pageSnowLogic.js): `snowball` enemies roll (stomp one and it becomes a small snowball: grab and throw it), `snow` throwables (a pile that refills 3 s after one is used), slush cells that a
// thrown snowball freezes to ice for PAGE_SNOW.freezeS (recs freeze / thaw, `w.frozen`), icicles (`w.icicles`, recs ice), snow walls ('J': a fox dash breaks them, request dash) and BUDDIES (`w.crates`: what each crate holds,
// `w.buddies` { actorKey: { species, ability, crate } }; requests ride { crate } | buddyEnd { why } | dash { cx, cy }; rec buddy).
// Tool verbs: axe chops trees (3 hits: falls sideways into a bridge) and cuts a hanging crate's vine; hammer smashes stone blocks and geodes (2 hits) and, as a ground pound, cracked floors;
// shovel digs soft soil and dig spots (1 hit); sword cuts bramble walls (2 hits), defeats enemies and bats seeds back; empty hands shake fruit trees (once per tree per run).
import { PAGE_TOOLS as T, PAGE_THROW as TH, PAGE_ENEMY as EN, PLATFORMER as P, PAGE_MP as MP, PAGE_SNOW as SN } from '../config.js';
import { SOLID, ONEWAY, cloneGrid, setTile, support } from './platformerLogic.js';
import { freezeCells, tickFrozen, newIcicle, stepIcicles, extrapolateIcicles, newCrates, ICE_CODE } from './pageSnowLogic.js';
import { pushHistory, stompInReach } from './pageCoopLogic.js';

export const GATE_TOOL = { B: 'hammer', X: 'hammer', W: 'sword', D: 'shovel', H: 'axe', R: 'hammer', T: 'axe', Q: 'shovel', J: 'dash' };      // (J: Step 52b, a snow wall: the fox buddy's dash is its "tool")
export const GATE_HITS = { B: T.hits.block, R: T.hits.geode, W: T.hits.bramble, D: T.hits.soil, H: T.hits.crate, X: 1, J: 1 };
const TOOL_VERB = { axe: 'Chop', hammer: 'Smash', shovel: 'Dig', sword: 'Cut' };
export const BOX = { acorn: [EN.acorn.w, EN.acorn.h], beetle: [EN.beetle.w, EN.beetle.h], shell: [0.8, 0.5], bush: [EN.bush.w, EN.bush.h], snowball: [EN.snowball.w, EN.snowball.h] };
export const OBJ_BOX = { stone: [0.5, 0.5], fruit: [0.6, 0.6], log: [1.1, 0.45], seed: [0.34, 0.34], snow: [0.5, 0.5] };
const r2 = (v) => Math.round(v * 100) / 100;
const key = (cx, cy) => `${cx},${cy}`;

// ---- the world --------------------------------------------------------------------------------------------------------------------------------------------
const newEnemy = (e) => ({ id: e.id, kind: e.kind, x: e.x, y: e.y, hx: e.x, vx: 0, vy: 0, dir: -1, st: e.kind === 'bush' ? 'idle' : 'walk', t: 0, bounces: 0, holder: null, shot: 0, ground: false, wasNear: false, roll: 0 });
const newObject = (o, id) => ({ id, kind: o.kind, x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0, st: o.st || 'rest', holder: null, hostile: !!o.hostile, friendly: false, life: 0, bounces: 0, by: null, ground: false, home: o.home || { x: o.x, y: o.y }, queued: false });

export function createWorld(page, opts = {}) {
  return {
    page, grid: cloneGrid(page.grid), cells: {}, hits: {}, felled: {}, shaken: [], dug: [], bonus: 0, tools: {},
    enemies: page.enemies.map(newEnemy), objects: page.objects.map((o, i) => newObject(o, i)), nextObj: page.objects.length, time: 0, cool: {}, hist: {},
    icicles: (page.icicles || []).map((ic, i) => newIcicle(ic, i)), frozen: {}, crates: newCrates(page, opts.camp || null), buddies: {}, queue: [],       // (Step 52b)
  };
}
export const holdOf = (w, k) => w.enemies.find((e) => e.holder === k) || w.objects.find((o) => o.holder === k) || null;
export const enemyById = (w, id) => w.enemies.find((e) => e.id === id) || null;
export const objectById = (w, id) => w.objects.find((o) => o.id === id) || null;
export const alive = (e) => e.st !== 'dead';
export const icicleById = (w, id) => w.icicles.find((i) => i.id === id) || null;

// ---- swings and gates ---------------------------------------------------------------------------------------------------------------------------------------
/** The box a swing covers in front of a body standing at (x, y): { x0, x1, y0, y1 }. `extra` widens it (the host's latency slack). */
export function hitRect(tool, x, y, face, extra = 0) {
  const t = T[tool] || T.hand, reach = t.reach + extra, s = face >= 0 ? 1 : -1;
  return { x0: s > 0 ? x - 0.1 : x - P.half - reach, x1: s > 0 ? x + P.half + reach : x + 0.1, y0: y - t.below - extra * 0.5, y1: y + t.above + extra * 0.5 };
}
const overlap = (r, x0, y0, x1, y1) => r.x1 > x0 && r.x0 < x1 && r.y1 > y0 && r.y0 < y1;
export const gateKind = (grid, cx, cy) => grid.kind(cx, cy);

/** The cells a tree of the page turns into when it falls toward `dir`: the trunk lies in the row under the tree's feet, over every empty cell. */
export function treeFill(grid, tree, dir, len = T.trunk) {
  const out = [], cx = Math.floor(tree.x), row = Math.floor(tree.y) - 1;
  for (let k = 1; k <= len; k++) {
    const x = cx + dir * k;
    if (x < 0 || x >= grid.W) break;
    if (grid.at(x, row) === 46) out.push([x, row, 'L']);
  }
  return out;
}
/** Where a crate hanging at (cx, cy) comes to rest when its vine is cut: its cell becomes empty and the first empty cell above solid ground becomes a crate block ('K') (null = it falls out of the page). */
export function crateLanding(grid, cx, cy) {
  let ly = cy - 1;
  while (ly >= 0 && grid.at(cx, ly) !== SOLID && grid.at(cx, ly) !== ONEWAY) ly--;
  return ly < 0 ? null : ly + 1;
}
/** What opening the gate of `kind` at (cx, cy) changes: a list of [cx, cy, ch]. */
export function openCells(grid, kind, cx, cy) {
  if (kind === 'J') {                                                     // a snow wall breaks whole (every connected snow wall cell, at most 16)
    const cells = [], seen = new Set([key(cx, cy)]), q = [[cx, cy]];
    for (let h = 0; h < q.length && cells.length < 16; h++) {
      const [x, y] = q[h]; cells.push([x, y, '.']);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = key(nx, ny); if (!seen.has(k) && grid.kind(nx, ny) === 'J') { seen.add(k); q.push([nx, ny]); } }
    }
    return cells;
  }
  if (kind === 'H') {
    const land = crateLanding(grid, cx, cy);
    return land === null ? [[cx, cy, '.']] : land === cy ? [[cx, cy, 'K']] : [[cx, cy, '.'], [cx, land, 'K']];
  }
  return [[cx, cy, '.']];
}

function bonusPos(x, y) { return { x: r2(x), y: r2(y) }; }

// ---- requests -----------------------------------------------------------------------------------------------------------------------------------------------
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const near = (a, x, y, rx, ry) => Math.abs(a.x - x) <= rx && Math.abs(a.y - y) <= ry;

function enemyRect(e) { const [w, h] = BOX[e.st === 'shell' ? 'shell' : e.kind]; return [e.x - w / 2, e.y, e.x + w / 2, e.y + h]; }

function defeatRec(e, how = 'hit') { return { t: 'defeat', id: e.id, how, x: r2(e.x), y: r2(e.y), bonus: T.defeatBerries }; }

/** A tool's effect on one enemy: a list of recs ([] = nothing happens). */
function toolVsEnemy(tool, e) {
  if (!alive(e) || e.holder) return [];
  if (e.kind === 'bush') return tool === 'hammer' ? [defeatRec(e, tool)] : [];
  if (tool === 'sword' || tool === 'hammer') return [defeatRec(e, tool)];
  // axe / shovel: a bonk. The acorn is stunned (grabbable), the beetle is knocked into its shell
  if (e.kind === 'acorn' && e.st === 'walk') return [{ t: 'estate', id: e.id, st: 'stun', x: r2(e.x), y: r2(e.y) }];
  if ((e.kind === 'beetle' || e.kind === 'snowball') && (e.st === 'walk' || e.st === 'slide')) return [{ t: 'estate', id: e.id, st: 'shell', x: r2(e.x), y: r2(e.y) }];
  return [];
}

function gateHitRecs(w, kind, cx, cy, tool, extra = {}) {
  const k = key(cx, cy), need = GATE_HITS[kind], n = (w.hits[k] || 0) + 1;
  if (n < need) return [{ t: 'hit', k, n, kind, cx, cy, tool }];
  const rec = { t: 'tile', cells: openCells(w.grid, kind, cx, cy), kind, tool, cx, cy, ...extra };
  const out = [rec];
  if (kind === 'R') {                                                     // a geode spills stones and berries
    const objects = [];
    for (let i = 0; i < T.geodeStones; i++) objects.push({ id: w.nextObj + i, kind: 'stone', x: r2(cx + 0.5 + (i - 0.5) * 0.7), y: r2(cy + 0.4), vx: r2((i - 0.5) * 3), vy: 5.5, st: 'air' });
    out.push({ t: 'spawn', objects }, { t: 'bonus', n: T.geodeBerries, ...bonusPos(cx + 0.5, cy + 0.6) });
  }
  return out;
}

/** The tile / tree / dig spot gate a swing of `tool` in `rect` would work on (nearest to the actor), or null. */
export function findGate(w, tool, rect, ax) {
  let best = null, bd = Infinity;
  const consider = (g, x) => { const d = Math.abs(x - ax); if (d < bd) { bd = d; best = g; } };
  const grid = w.grid;
  for (let cx = Math.floor(rect.x0); cx <= Math.floor(rect.x1 - 1e-6); cx++) for (let cy = Math.floor(rect.y0); cy <= Math.floor(rect.y1 - 1e-6); cy++) {
    const kd = grid.kind(cx, cy);
    if (kd === '.' || kd === 'L' || kd === 'X' || GATE_TOOL[kd] !== tool) continue;
    consider({ type: 'tile', kind: kd, cx, cy }, cx + 0.5);
  }
  if (tool === 'axe') for (const t of w.page.trees) if (!(t.i in w.felled) && overlap(rect, t.x - 0.5, t.y, t.x + 0.5, t.y + 3)) consider({ type: 'tree', tree: t }, t.x);
  if (tool === 'shovel') for (const d of w.page.digs) if (!w.dug.includes(d.i) && overlap(rect, d.x - 0.5, d.y - 0.2, d.x + 0.5, d.y + 0.9)) consider({ type: 'dig', dig: d }, d.x);
  return best;
}

export function shakeTarget(w, a, extra = 0) {
  let best = null, bd = Infinity;
  for (const t of w.page.shakeTrees) {
    if (w.shaken.includes(t.i)) continue;
    const d = Math.abs(t.x - a.x);
    if (d <= T.hand.reach + 0.4 + extra && d < bd) { bd = d; best = t; }
  }
  return best;
}

function treeRecs(w, tree, face, tool) {
  const k = `t${tree.i}`, n = (w.hits[k] || 0) + 1;
  if (n < T.hits.tree) return [{ t: 'hit', k, n, kind: 'T', cx: Math.floor(tree.x), cy: Math.floor(tree.y), tool }];
  const dir = face >= 0 ? 1 : -1;
  return [{ t: 'felled', i: tree.i, dir, cells: treeFill(w.grid, tree, dir), x: r2(tree.x), y: r2(tree.y) }];
}
function digRecs(w, d) {
  const out = [{ t: 'dig', i: d.i, reward: d.reward, flower: d.flower, x: r2(d.x), y: r2(d.y), bonus: d.reward === 'berries' ? 4 : 0 }];
  return out;
}

export function request(w, kind, d, a) {
  d = d || {};
  if (!a || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return { ok: false, reason: 'bad-request' };
  const slack = T.hostSlack;
  if (kind === 'take') {
    const s = w.page.stands[d.stand | 0];
    if (!s || !Number.isInteger(d.stand)) return { ok: false, reason: 'bad-request' };
    if (!near(a, s.x, s.y, T.standReach + slack, 3.2)) return { ok: false, reason: 'far' };
    if (w.tools[a.key] === s.tool) return { ok: false, reason: 'same' };
    return { ok: true, recs: [{ t: 'tool', key: a.key, tool: s.tool }] };
  }
  if (kind === 'hit') {
    const face = d.face >= 0 ? 1 : -1, tool = a.tool;
    if (holdOf(w, a.key)) return { ok: false, reason: 'busy' };
    if (!tool) {
      const t = shakeTarget(w, a, slack);
      if (!t) return { ok: true, recs: [] };
      return { ok: true, recs: [{ t: 'shake', i: t.i, bonus: T.shakeBerries, x: r2(t.x), y: r2(a.y + 2.5) }] };
    }
    if (!T[tool] || !T[tool].dur) return { ok: false, reason: 'bad-request' };
    const rect = hitRect(tool, a.x, a.y, face, slack), recs = [];
    for (const e of w.enemies) if (alive(e) && overlap(rect, ...enemyRect(e))) recs.push(...toolVsEnemy(tool, e));
    if (tool === 'sword') for (const o of w.objects) {
      if (o.kind === 'seed' && o.hostile && o.st === 'air' && overlap(rect, o.x - 0.5, o.y - 0.5, o.x + 0.5, o.y + 0.5)) {
        let vy = 1.5;                                                       // a bat is aimed at the nearest enemy ahead (the seed's own light gravity is allowed for)
        let best = null;
        for (const e of w.enemies) if (alive(e) && !e.holder && (e.x - o.x) * face > 0.5 && Math.abs(e.x - o.x) < 16 && (!best || Math.abs(e.x - o.x) < Math.abs(best.x - o.x))) best = e;
        if (best) { const t = Math.abs(best.x - o.x) / 10; vy = (best.y + 0.55 - o.y) / t + 0.5 * EN.bush.seedG * 0.15 * t; }
        recs.push({ t: 'bat', id: o.id, vx: face * 10, vy: r2(Math.max(-12, Math.min(12, vy))) });
      }
    }
    const g = findGate(w, tool, rect, a.x);
    if (g) {
      if (g.type === 'tile') recs.push(...gateHitRecs(w, g.kind, g.cx, g.cy, tool));
      else if (g.type === 'tree') recs.push(...treeRecs(w, g.tree, face, tool));
      else recs.push(...digRecs(w, g.dig));
    }
    return { ok: true, recs };
  }
  if (kind === 'soil') {                                                  // a shovel pogo landing on soft soil digs it
    if (a.tool !== 'shovel' || !Number.isInteger(d.cx) || !Number.isInteger(d.cy)) return { ok: false, reason: 'bad-request' };
    if (w.grid.kind(d.cx, d.cy) !== 'D') return { ok: false, reason: 'gone' };
    if (!near(a, d.cx + 0.5, d.cy + 0.5, 1.6 + slack, 2.6)) return { ok: false, reason: 'far' };
    return { ok: true, recs: gateHitRecs(w, 'D', d.cx, d.cy, 'shovel') };
  }
  if (kind === 'pound') {
    if (a.tool !== 'hammer') return { ok: false, reason: 'tool' };
    const row = Math.floor(a.y + 0.05) - 1, recs = [];
    const cells = [];
    for (let cx = Math.floor(a.x - P.half + 0.02); cx <= Math.floor(a.x + P.half - 0.02); cx++) if (w.grid.kind(cx, row) === 'X') cells.push([cx, row, '.']);
    if (cells.length) recs.push({ t: 'tile', cells, kind: 'X', tool: 'hammer', cx: cells[0][0], cy: row });
    return { ok: true, recs };
  }
  if (kind === 'stomp') {
    const e = enemyById(w, d.id), mode = d.mode;
    if (!e || !alive(e) || e.holder) return { ok: false, reason: 'gone' };
    if (!['stomp', 'pogo', 'pound'].includes(mode)) return { ok: false, reason: 'bad-request' };
    if (!stompInReach(w.hist && w.hist[e.id], e, a, { rx: 1.6 + slack, ry: 2.4 + slack })) return { ok: false, reason: 'far' };       // (a rejected stomp never punishes anybody: the enemy simply stays)
    if (mode === 'pogo' && a.tool !== 'shovel') return { ok: false, reason: 'tool' };
    if (mode === 'pound' && a.tool !== 'hammer') return { ok: false, reason: 'tool' };
    if (e.kind === 'bush') return mode === 'pound' ? { ok: true, recs: [defeatRec(e, 'pound')] } : { ok: true, recs: [] };   // spiky: a stomp or a pogo only bounces
    if (e.kind === 'beetle' || e.kind === 'snowball') {                     // (a stomped snowball shrinks to a small snowball you can grab and throw)
      if (e.st === 'walk' || e.st === 'slide') return { ok: true, recs: [{ t: 'estate', id: e.id, st: 'shell', x: r2(e.x), y: r2(e.y) }] };
      return { ok: true, recs: mode === 'pound' ? [defeatRec(e, 'pound')] : [] };
    }
    return { ok: true, recs: [defeatRec(e, mode)] };                       // acorn (walking or stunned)
  }
  if (kind === 'grab') {
    if (holdOf(w, a.key)) return { ok: false, reason: 'busy' };
    const type = d.type === 'e' ? 'e' : 'o', thing = type === 'e' ? enemyById(w, d.id) : objectById(w, d.id);
    if (!thing || thing.holder) return { ok: false, reason: 'gone' };
    if (type === 'e' ? !(thing.st === 'stun' || thing.st === 'shell') : !(thing.st === 'rest' && !thing.hostile)) return { ok: false, reason: 'busy' };
    if (!near(a, thing.x, thing.y + 0.4, T.grabReach + slack, 2 + slack)) return { ok: false, reason: 'far' };
    return { ok: true, recs: [{ t: 'hold', type, id: thing.id, by: a.key }] };
  }
  if (kind === 'throw' || kind === 'drop') {
    const h = holdOf(w, a.key);
    if (!h) return { ok: false, reason: 'nothing-held' };
    const type = w.enemies.includes(h) ? 'e' : 'o', face = d.face >= 0 ? 1 : -1;
    const mode = kind === 'drop' ? 'down' : (['fwd', 'up', 'down'].includes(d.mode) ? d.mode : 'fwd');
    let x = a.x + face * (mode === 'down' ? 0.8 : 0.45), y = a.y + (mode === 'down' ? 0.05 : 1.1), vx = 0, vy = 0;
    if (mode === 'fwd') { vx = face * TH.fwdV; vy = TH.fwdUp; } else if (mode === 'up') { vx = face * 1.2; vy = TH.upV; } else { vx = face * 0.4; vy = -TH.downV; }
    if (w.grid.at(Math.floor(x), Math.floor(y + 0.3)) === SOLID) { x = a.x; y = a.y + (mode === 'down' ? 0.05 : 1.1); }     // never start inside a wall
    const rec = { t: 'throw', type, id: h.id, x: r2(x), y: r2(y), vx: r2(vx), vy: r2(vy), mode, by: a.key, dir: face };
    if (type === 'e' && h.kind === 'beetle' && mode === 'fwd') { rec.slide = true; rec.vy = 0; rec.y = r2(a.y + 0.05); }
    return { ok: true, recs: [rec] };
  }
  if (kind === 'untool') {                                                // Cancel held for 2 s: put the page tool back
    if (!w.tools[a.key]) return { ok: false, reason: 'nothing-held' };
    return { ok: true, recs: [{ t: 'tool', key: a.key, tool: null }] };
  }
  if (kind === 'ride') {                                                  // Step 52b: touch a buddy crate: the critter (or the snow hare) follows you
    const c = w.crates[d.crate | 0], spec = c && w.page.crates[d.crate | 0];
    if (!c || !Number.isInteger(d.crate)) return { ok: false, reason: 'bad-request' };
    if (w.buddies[a.key]) return { ok: false, reason: 'same' };
    if (!near(a, spec.x, spec.y, SN.buddyReach + 0.6 + slack, 2.6)) return { ok: false, reason: 'far' };
    return { ok: true, recs: [{ t: 'buddy', key: a.key, species: c.species, ability: c.ability, crate: c.id }] };
  }
  if (kind === 'buddyEnd') {                                              // a buddy gate / a hit / leaving: the buddy hops away
    if (!w.buddies[a.key]) return { ok: false, reason: 'nothing-held' };
    return { ok: true, recs: [{ t: 'buddy', key: a.key, end: true, why: ['gate', 'hit', 'leave', 'lost'].includes(d.why) ? d.why : 'gate' }] };
  }
  if (kind === 'dash') {                                                  // the fox's dash meets a snow wall: the whole wall breaks
    const bd = w.buddies[a.key];
    if (!bd || bd.ability !== 'dash') return { ok: false, reason: 'tool' };
    if (!Number.isInteger(d.cx) || !Number.isInteger(d.cy) || w.grid.kind(d.cx, d.cy) !== 'J') return { ok: false, reason: 'gone' };
    if (!near(a, d.cx + 0.5, d.cy + 0.5, 5 + slack, 3)) return { ok: false, reason: 'far' };
    return { ok: true, recs: [{ t: 'tile', cells: openCells(w.grid, 'J', d.cx, d.cy), kind: 'J', tool: 'dash', cx: d.cx, cy: d.cy }] };
  }
  if (kind === 'seedhit') {
    const o = objectById(w, d.id);
    if (!o || o.kind !== 'seed' || o.st === 'gone') return { ok: false, reason: 'gone' };
    return { ok: true, recs: [{ t: 'ostate', id: o.id, st: 'gone' }] };
  }
  return { ok: false, reason: 'unknown' };
}

// ---- applying decisions (identical on every screen) -----------------------------------------------------------------------------------------------------
function applyCells(w, cells) {
  for (const [cx, cy, ch] of cells) {
    if (!setTile(w.grid, cx, cy, ch)) continue;
    const k = key(cx, cy);
    if (w.page.grid.at(cx, cy) === w.grid.at(cx, cy) && w.page.grid.kind(cx, cy) === w.grid.kind(cx, cy)) delete w.cells[k]; else w.cells[k] = ch;
    delete w.hits[k];
  }
}
export function applyRecs(w, recs) {
  for (const r of recs) {
    switch (r.t) {
      case 'hit': w.hits[r.k] = r.n; break;
      case 'tile': applyCells(w, r.cells); break;
      case 'felled': w.felled[r.i] = r.dir; applyCells(w, r.cells); delete w.hits[`t${r.i}`]; break;
      case 'shake': if (!w.shaken.includes(r.i)) { w.shaken.push(r.i); w.shaken.sort((a, b) => a - b); } w.bonus += r.bonus | 0; break;
      case 'dig': if (!w.dug.includes(r.i)) { w.dug.push(r.i); w.dug.sort((a, b) => a - b); } w.bonus += r.bonus | 0; delete w.hits[`d${r.i}`]; break;
      case 'spawn':
        for (const o of r.objects) { if (!objectById(w, o.id)) w.objects.push(newObject(o, o.id)); w.nextObj = Math.max(w.nextObj, o.id + 1); }
        break;
      case 'defeat': { const e = enemyById(w, r.id); if (e) { e.st = 'dead'; e.holder = null; e.x = r.x; e.y = r.y; e.vx = e.vy = 0; } w.bonus += r.bonus | 0; break; }
      case 'estate': { const e = enemyById(w, r.id); if (e) { e.st = r.st; e.t = 0; e.vx = 0; if (Number.isFinite(r.x)) { e.x = r.x; e.y = r.y; } } break; }
      case 'ostate': { const o = objectById(w, r.id); if (o) { o.st = r.st; if (r.st === 'gone') o.holder = null; } break; }
      case 'bat': { const o = objectById(w, r.id); if (o) { o.hostile = false; o.friendly = true; o.vx = r.vx; o.vy = r.vy; o.life = 0; } break; }
      case 'hold': { const th = r.type === 'e' ? enemyById(w, r.id) : objectById(w, r.id); if (th) { th.holder = r.by; th.vx = th.vy = 0; if (r.type === 'o') th.st = 'held'; } break; }
      case 'throw': {
        const th = r.type === 'e' ? enemyById(w, r.id) : objectById(w, r.id);
        if (!th) break;
        th.holder = null; th.x = r.x; th.y = r.y; th.vx = r.vx; th.vy = r.vy; th.by = r.by; th.bounces = 0; th.ground = false; th.t = 0;
        if (r.type === 'o') th.st = r.mode === 'down' && !r.vy ? 'rest' : 'air';
        else if (r.slide) { th.st = 'slide'; th.dir = r.dir; }
        else if (r.mode === 'down') { th.st = th.kind === 'beetle' ? 'shell' : 'stun'; th.vx = 0; }
        else th.st = 'thrown';
        break;
      }
      case 'tool': if (r.tool) w.tools[r.key] = r.tool; else delete w.tools[r.key]; break;
      case 'spawnE': if (!enemyById(w, r.e.id)) w.enemies.push(newEnemy(r.e)); break;
      case 'bonus': w.bonus += r.n | 0; break;
      case 'fire': break;                                                  // (the run's campfires: game/storybook.js)
      case 'freeze': applyCells(w, r.cells); for (const c of r.cells) w.frozen[key(c[0], c[1])] = r.dur; break;                // Step 52b: slush -> ice for r.dur seconds
      case 'thaw': for (const c of r.cells) delete w.frozen[key(c[0], c[1])]; applyCells(w, r.cells); break;
      case 'ice': {
        const ic = icicleById(w, r.id); if (!ic) break;
        ic.st = r.st; if (Number.isFinite(r.y)) ic.y = r.y;
        if (r.st === 'wobble') ic.t = 0; else if (r.st === 'fall') ic.vy = 0; else if (r.st === 'stuck') ic.left = SN.icicle.stuckS;
        if (r.cells) applyCells(w, r.cells);
        break;
      }
      case 'buddy': if (r.end) delete w.buddies[r.key]; else w.buddies[r.key] = { species: r.species, ability: r.ability, crate: r.crate }; break;
      default: break;
    }
  }
}

// ---- dynamic bodies (enemies and objects) -------------------------------------------------------------------------------------------------------------
/** Gravity, a swept move, walls, floors (slopes and planks included) and ceilings for one box (w x h, feet at b.x, b.y). -> { landed (impact speed) | 0, wall: {cx, cy}|null, ceil, floor } */
function dyn(grid, b, w, h, dt, grav) {
  const hw = w / 2, out = { landed: 0, wall: null, ceil: null, floor: null };
  b.vy = Math.max(-24, b.vy - grav * dt);
  const dx = b.vx * dt, n = Math.max(1, Math.ceil(Math.abs(dx) / 0.2)), s = Math.sign(dx);
  for (let i = 0; i < n && dx !== 0; i++) {
    const nx = b.x + dx / n, c = Math.floor(nx + s * hw);
    let hit = null;
    for (let cy = Math.floor(b.y + 0.18); cy <= Math.floor(b.y + h - 0.05); cy++) if (grid.at(c, cy) === SOLID) { hit = { cx: c, cy }; break; }
    if (hit) { b.x = s > 0 ? c - hw - 1e-3 : c + 1 + hw + 1e-3; out.wall = hit; break; }
    b.x = nx;
  }
  if (b.ground && b.vy <= 0) {                                             // stay glued to the floor (slopes, small lips)
    const S = support(grid, b.x, b.y + P.stepUp, b.y - P.snapDown, hw);
    if (S !== null) { b.y = S; b.vy = 0; return out; }
    b.ground = false;
  }
  const ny = b.y + b.vy * dt;
  if (b.vy <= 0) {
    const S = support(grid, b.x, b.y + 0.02, ny, hw);
    if (S !== null && S >= ny - 1e-9) { out.landed = Math.max(0.01, -b.vy); out.floor = { cx: Math.floor(b.x), cy: Math.round(S) - 1 }; b.y = S; b.vy = 0; b.ground = true; return out; }
    b.y = ny; b.ground = false;
  } else {
    const row = Math.floor(ny + h);
    let hit = null;
    for (let cx = Math.floor(b.x - hw + 1e-3); cx <= Math.floor(b.x + hw - 1e-3); cx++) if (grid.at(cx, row) === SOLID) { hit = { cx, cy: row }; break; }
    if (hit) { b.y = row - h - 1e-3; b.vy = 0; out.ceil = hit; } else { b.y = ny; b.ground = false; }
  }
  return out;
}
const ledgeAhead = (grid, e, hw) => support(grid, e.x + e.dir * (hw + 0.12), e.y + 0.5, e.y - 1.15, 0.05) === null;

function holderPos(actors, k) { for (const a of actors) if (a.key === k) return a; return null; }

/** Does the moving thing at (x, y) with radius r overlap enemy `e`? */
function touches(e, x, y, r) { const [x0, y0, x1, y1] = enemyRect(e); return x + r > x0 && x - r < x1 && y + r > y0 - 0.1 && y - r < y1; }

function stepEnemy(w, e, dt, actors, recs) {
  if (!alive(e)) return;
  const grid = w.grid, cfg = EN[e.kind];
  if (e.holder) { const a = holderPos(actors, e.holder); if (a) { e.x = a.x; e.y = a.y + 1.5; } e.vx = e.vy = 0; return; }
  if (e.kind === 'bush') {
    let target = null, bd = Infinity;
    for (const a of actors) { const dx = a.x - e.x, dy = a.y - e.y; if (Math.abs(dx) <= cfg.near && dy > -6 && dy < 7 && Math.abs(dx) < bd) { bd = Math.abs(dx); target = a; } }
    if (!target) { e.wasNear = false; e.shot = 0; return; }
    if (!e.wasNear) { e.wasNear = true; e.shot = cfg.every - 1.3; }
    e.shot += dt;
    if (e.shot >= cfg.every && w.objects.filter((o) => o.kind === 'seed' && o.st === 'air').length < 10) {
      e.shot = 0;
      const t = Math.min(1.5, Math.max(0.7, Math.abs(target.x - e.x) / cfg.seedV)), sx = e.x, sy = e.y + 0.9;
      const vx = (target.x - sx) / t, vy = (target.y + 0.7 - sy + 0.5 * cfg.seedG * t * t) / t;
      recs.push({ t: 'spawn', objects: [{ id: w.nextObj, kind: 'seed', x: r2(sx), y: r2(sy), vx: r2(vx), vy: r2(vy), st: 'air', hostile: true }] });
      w.nextObj++;                                                          // (the rec's own apply raises it too; stepping twice within a tick never reuses an id)
      e.puff = 1;
    }
    return;
  }
  e.t += dt;
  const [bw, bh] = BOX[e.st === 'shell' || e.st === 'slide' ? 'shell' : e.kind];
  if (e.st === 'walk') {
    if (e.kind === 'snowball') e.roll = (e.roll || 0) + dt;                    // (Step 52b: a rolling snowball speeds up the longer it rolls, and starts over after a turn)
    e.vx = e.dir * (e.kind === 'snowball' ? Math.min(cfg.maxSpeed, cfg.speed + cfg.ramp * e.roll) : cfg.speed);
    const o = dyn(grid, e, bw, bh, dt, EN.gravity);
    const before = e.dir;
    if (o.wall) e.dir = -e.dir;
    else if (e.ground && ledgeAhead(grid, e, bw / 2)) { e.dir = -e.dir; e.x += e.dir * 0.05; }
    else if (Math.abs(e.x - e.hx) > (e.kind === 'snowball' ? EN.patrol + 4 : EN.patrol) && Math.sign(e.x - e.hx) === e.dir) e.dir = -e.dir;          // (a patrol stays near where it lives)
    if (e.dir !== before) e.roll = 0;
  } else if (e.st === 'stun' || e.st === 'shell') {
    e.vx *= Math.max(0, 1 - 8 * dt);
    dyn(grid, e, bw, bh, dt, EN.gravity);
    if (e.kind === 'acorn' && e.st === 'stun' && e.t >= cfg.stun) { e.st = 'walk'; e.t = 0; }
    if ((e.kind === 'beetle' || e.kind === 'snowball') && e.st === 'shell' && e.t >= TH.shellWake) { e.st = 'walk'; e.t = 0; e.roll = 0; }
  } else if (e.st === 'slide') {
    e.vx = e.dir * TH.shellV;
    const o = dyn(grid, e, bw, bh, dt, EN.gravity);
    if (o.wall) { e.dir = -e.dir; e.bounces++; if (e.bounces >= EN.shellBounces) { e.st = 'shell'; e.t = 0; e.vx = 0; } }
    if (e.t >= TH.slideLife) { e.st = 'shell'; e.t = 0; e.vx = 0; }
    for (const o2 of w.enemies) if (o2 !== e && alive(o2) && !o2.holder && o2.st !== 'shell' && touches(o2, e.x, e.y + 0.25, 0.4)) recs.push(defeatRec(o2, 'shell'));
  } else if (e.st === 'thrown') {
    const o = dyn(grid, e, bw, bh, dt, TH.gravity);
    let hit = false;
    for (const o2 of w.enemies) if (o2 !== e && alive(o2) && !o2.holder && touches(o2, e.x, e.y + 0.3, 0.35)) { recs.push(defeatRec(o2, 'thrown')); hit = true; }
    const fz = e.kind === 'snowball' ? freezeCells(grid, e.x, e.y) : [];       // (Step 52b: a thrown snowball splats: slush it lands in or next to turns to ice, the snowball itself melts away)
    if (fz.length) recs.push({ t: 'freeze', cells: fz, dur: SN.freezeS, x: r2(e.x), y: r2(e.y) });
    if (o.landed || o.wall || hit || fz.length) {
      if (e.kind === 'beetle' && !hit) { e.st = 'shell'; e.t = 0; e.vx = 0; }
      else if (e.kind === 'snowball') recs.push({ t: 'defeat', id: e.id, how: 'melt', x: r2(e.x), y: r2(e.y), bonus: 0 });
      else recs.push(defeatRec(e, 'thrown'));
    }
  }
  if (e.y < -4) recs.push(defeatRec(e, 'fell'));
}

function stepObject(w, o, dt, actors, ctx, recs) {
  if (o.st === 'gone') return;
  if (o.holder) { const a = holderPos(actors, o.holder); if (a) { o.x = a.x; o.y = a.y + 1.5; } o.vx = o.vy = 0; return; }
  const [bw, bh] = OBJ_BOX[o.kind], grid = w.grid;
  if (o.kind === 'seed') {
    o.life += dt;
    const g = o.friendly ? EN.bush.seedG * 0.15 : EN.bush.seedG;
    const out = dyn(grid, o, bw, bh, dt, g);
    if (out.landed || out.wall || out.ceil || o.life > EN.bush.seedLife || o.y < -3) { recs.push({ t: 'ostate', id: o.id, st: 'gone' }); o.st = 'gone'; return; }
    if (o.friendly) for (const e of w.enemies) if (alive(e) && !e.holder && touches(e, o.x, o.y, 0.2)) { recs.push(defeatRec(e, 'seed'), { t: 'ostate', id: o.id, st: 'gone' }); o.st = 'gone'; return; }
    return;
  }
  if (o.st === 'rest') o.vx *= Math.max(0, 1 - TH.friction * dt);
  const speed = Math.hypot(o.vx, o.vy);
  const out = dyn(grid, o, bw, bh, dt, TH.gravity);
  if (o.kind === 'snow' && o.st === 'air') {                              // Step 52b: a snowball splats on its first landing / wall / slush: slush nearby freezes
    const fz = freezeCells(grid, o.x, o.y + bh / 2);
    if (fz.length) recs.push({ t: 'freeze', cells: fz, dur: SN.freezeS, x: r2(o.x), y: r2(o.y) });
    if (fz.length || out.landed || out.wall) { recs.push({ t: 'splat', x: r2(o.x), y: r2(o.y) }, { t: 'ostate', id: o.id, st: 'gone' }); o.st = 'gone'; return; }
  }
  if (o.st === 'air') {
    // flying things knock into enemies, light campfires and chip stone blocks
    if (speed > 3) for (const e of w.enemies) {
      if (!alive(e) || e.holder || !touches(e, o.x, o.y + bh / 2, bw / 2)) continue;
      if (o.kind === 'stone') { recs.push(defeatRec(e, 'stone'), { t: 'ostate', id: o.id, st: 'gone' }); o.st = 'gone'; return; }
      if (e.kind === 'acorn' && e.st === 'walk') recs.push({ t: 'estate', id: e.id, st: 'stun', x: r2(e.x), y: r2(e.y) });
      else if (e.kind === 'beetle' && (e.st === 'walk' || e.st === 'slide')) recs.push({ t: 'estate', id: e.id, st: 'shell', x: r2(e.x), y: r2(e.y) });
      o.vx = -o.vx * 0.4; o.vy = Math.max(o.vy, 3);
    }
    if (o.kind === 'log') for (const f of ctx.fires || []) {
      if (!f.lit && Math.abs(o.x - f.x) < 1.2 && o.y > f.y - 0.6 && o.y < f.y + 1.8) { recs.push({ t: 'fire', idx: f.idx, by: o.by }, { t: 'ostate', id: o.id, st: 'gone' }); o.st = 'gone'; return; }
    }
    const c = out.wall || out.ceil || out.floor;
    if (o.kind === 'stone' && c && speed > 5 && w.grid.kind(c.cx, c.cy) === 'B') {
      recs.push(...gateHitRecs(w, 'B', c.cx, c.cy, 'stone'), { t: 'ostate', id: o.id, st: 'gone' });
      o.st = 'gone'; return;
    }
    if (out.wall) { o.vx = -o.vx * TH.restitution; o.bounces++; }
    if (out.landed) {
      const rest = o.kind === 'fruit' ? TH.fruitBounce : o.kind === 'log' ? 0.15 : TH.restitution;
      if (out.landed > 4) { o.vy = out.landed * rest; o.vx *= 0.8; o.bounces++; o.ground = false; }
      else { o.st = 'rest'; o.vy = 0; }
    }
    if (out.landed && o.st === 'air' && Math.abs(o.vx) < 0.4 && o.vy < 1) o.st = 'rest';
  } else if (o.st === 'rest' && !o.ground) o.st = 'air';
  if (o.y < -4) { recs.push({ t: 'ostate', id: o.id, st: 'gone' }); o.st = 'gone'; }
}

export function stepWorld(w, dt, actors = [], ctx = {}) {
  w.time += dt;
  const recs = [];
  for (const e of w.enemies) {
    stepEnemy(w, e, dt, actors, recs);
    if (alive(e)) pushHistory(w.hist[e.id] || (w.hist[e.id] = []), w.time, e.x, e.y);
  }
  for (const o of w.objects) stepObject(w, o, dt, actors, ctx, recs);
  if (w.icicles.length) stepIcicles(w, dt, actors, recs);
  if (Object.keys(w.frozen).length) { const th = tickFrozen(w, dt, true); if (th) recs.push(th); }
  for (const o of w.objects) if (o.kind === 'snow' && o.st === 'gone' && !o.queued) { o.queued = true; w.queue.push({ at: w.time + 3, home: o.home }); }     // (a used snowball comes back to its pile)
  for (let i = w.queue.length - 1; i >= 0; i--) if (w.time >= w.queue[i].at) {
    const q = w.queue.splice(i, 1)[0], id = w.nextObj++;
    recs.push({ t: 'spawn', objects: [{ id, kind: 'snow', x: q.home.x, y: q.home.y, st: 'rest', home: q.home }] });
  }
  if (w.objects.length > 40) w.objects = w.objects.filter((o) => o.st !== 'gone' || o.id >= w.nextObj - 24);
  return recs;
}

/** Everything one actor holds is put down where its holder stood (a screen that left / the page closing). */
export function releaseRecs(w, k, at) {
  const h = holdOf(w, k);
  if (!h) return [];
  const type = w.enemies.includes(h) ? 'e' : 'o';
  return [{ t: 'throw', type, id: h.id, x: r2(at ? at.x : h.x), y: r2(at ? at.y + 0.05 : h.y), vx: 0, vy: 0, mode: 'down', by: k, dir: 1 }];
}

// ---- the broadcast ----------------------------------------------------------------------------------------------------------------------------------------
const ECODE = { walk: 'w', stun: 's', shell: 'h', slide: 'd', thrown: 't', idle: 'i', dead: 'x' }, EDECODE = Object.fromEntries(Object.entries(ECODE).map(([k, v]) => [v, k]));
const OCODE = { rest: 'r', air: 'a', held: 'h', gone: 'g' }, ODECODE = Object.fromEntries(Object.entries(OCODE).map(([k, v]) => [v, k]));
/** Compact state of everything that can move: enemies [id, x, y, dir, st, holder], objects [id, x, y, st, holder, friendly]. */
export function motion(w) {
  return {
    e: w.enemies.filter(alive).map((e) => { const p = e.puff ? 1 : 0; e.puff = 0; return [e.id, r2(e.x), r2(e.y), e.dir, ECODE[e.st] || 'w', e.holder, p]; }),
    o: w.objects.filter((o) => o.st !== 'gone').map((o) => [o.id, r2(o.x), r2(o.y), OCODE[o.st] || 'r', o.holder, o.friendly ? 1 : 0, r2(o.vx), r2(o.vy)]),
    ic: w.icicles.filter((ic) => ic.st === 'fall').map((ic) => [ic.id, r2(ic.y), r2(ic.vy)]),          // (Step 52b: the falling icicles)
  };
}
export function moving(w) { return w.icicles.some((ic) => ic.st === 'fall') || w.enemies.some((e) => alive(e) && (e.kind === 'bush' || e.st === 'walk' || e.st === 'slide' || e.st === 'thrown' || e.holder || !e.ground)) || w.objects.some((o) => o.st === 'air' || o.holder); }
export function applyMotion(w, m) {
  for (const r of (m && m.e) || []) { const e = enemyById(w, r[0]); if (e && alive(e)) { e.age = 0; e.x = r[1]; e.y = r[2]; e.dir = r[3]; e.st = EDECODE[r[4]] || e.st; e.holder = r[5] || null; if (r[6]) e.puff = 1; } }
  for (const r of (m && m.o) || []) {
    const o = objectById(w, r[0]);
    if (!o) continue;                                                    // (a thing born before this screen's spawn event arrives: the event is ordered and comes first)
    o.x = r[1]; o.y = r[2]; o.st = ODECODE[r[3]] || o.st; o.holder = r[4] || null; o.friendly = !!r[5]; o.vx = r[6] || 0; o.vy = r[7] || 0;
  }
  if (m && m.o) for (const o of w.objects) if (o.st !== 'gone' && !m.o.some((r) => r[0] === o.id)) o.st = 'gone';
  for (const r of (m && m.ic) || []) { const ic = icicleById(w, r[0]); if (ic && ic.st === 'fall') { ic.y = r[1]; ic.vy = r[2]; } }
}

/** REPLICA: between two motion packets (10 Hz) walking enemies keep walking at their known speed, so a stomp or a side contact is judged against where the enemy really is about now. */
export function extrapolate(w, dt) {
  if (w.icicles.length) extrapolateIcicles(w, dt);
  if (Object.keys(w.frozen).length) tickFrozen(w, dt, false);                // (the thaw warning counts down on every screen; the host's thaw rec ends it)
  for (const e of w.enemies) {
    if (!alive(e) || e.holder || e.age === undefined) continue;
    e.age += dt;
    if (e.age > MP.extrapolate) continue;
    if (e.st === 'walk') e.x += e.dir * EN[e.kind].speed * dt;
    else if (e.st === 'slide') e.x += e.dir * TH.shellV * dt;
  }
}

// ---- late join and hashing ----------------------------------------------------------------------------------------------------------------------------------
export function snapshot(w) {
  return {
    cells: Object.entries(w.cells).map(([k, ch]) => [...k.split(',').map(Number), ch]), hits: { ...w.hits }, felled: { ...w.felled }, shaken: w.shaken.slice(), dug: w.dug.slice(), bonus: w.bonus, tools: { ...w.tools },
    enemies: w.enemies.map((e) => ({ id: e.id, kind: e.kind, x: r2(e.x), y: r2(e.y), dir: e.dir, st: e.st, holder: e.holder })),
    objects: w.objects.filter((o) => o.st !== 'gone').map((o) => ({ id: o.id, kind: o.kind, x: r2(o.x), y: r2(o.y), vx: r2(o.vx), vy: r2(o.vy), st: o.st, holder: o.holder, hostile: o.hostile, friendly: o.friendly })),
    nextObj: w.nextObj,
    icicles: w.icicles.map((ic) => ({ id: ic.id, st: ic.st, y: r2(ic.y), vy: r2(ic.vy), left: r2(ic.left || 0) })), frozen: Object.fromEntries(Object.entries(w.frozen).map(([k, v]) => [k, r2(v)])),
    crates: w.crates.map((c) => c.species), buddies: Object.fromEntries(Object.entries(w.buddies).map(([k, b]) => [k, { ...b }])),
  };
}
export function loadSnapshot(w, s) {
  const fresh = createWorld(w.page);
  w.grid.cells.set(w.page.grid.cells); w.grid.kinds.set(w.page.grid.kinds);                // (the same grid object: the page's drawing holds it)
  Object.assign(w, { cells: {}, hits: {}, felled: {}, shaken: [], dug: [], bonus: 0, tools: {}, enemies: fresh.enemies, objects: [], nextObj: w.page.objects.length, icicles: fresh.icicles, frozen: {}, buddies: {}, queue: [] });
  if (!s || typeof s !== 'object') { w.objects = fresh.objects; return w; }
  applyCells(w, (Array.isArray(s.cells) ? s.cells : []).filter((c) => Array.isArray(c) && c.length === 3));
  w.hits = { ...(s.hits || {}) }; w.felled = { ...(s.felled || {}) };
  w.shaken = Array.isArray(s.shaken) ? s.shaken.slice() : []; w.dug = Array.isArray(s.dug) ? s.dug.slice() : [];
  w.bonus = s.bonus | 0; w.tools = { ...(s.tools || {}) };
  w.frozen = { ...(s.frozen || {}) }; w.buddies = { ...(s.buddies || {}) };
  if (Array.isArray(s.crates)) s.crates.forEach((sp, i) => { if (w.crates[i] && typeof sp === 'string') w.crates[i].species = sp; });
  for (const r of s.icicles || []) { const ic = icicleById(w, r.id); if (ic) Object.assign(ic, { st: r.st, y: r.y, vy: r.vy, left: r.left }); }
  for (const e of s.enemies || []) {
    let t = enemyById(w, e.id);
    if (!t && e.kind) { t = newEnemy({ id: e.id, kind: e.kind, x: e.x, y: e.y }); w.enemies.push(t); }
    if (t) Object.assign(t, { x: e.x, y: e.y, dir: e.dir, st: e.st, holder: e.holder || null });
  }
  w.objects = (s.objects || []).map((o) => Object.assign(newObject(o, o.id), { holder: o.holder || null, friendly: !!o.friendly, hostile: !!o.hostile }));
  w.nextObj = Math.max(s.nextObj | 0, ...w.objects.map((o) => o.id + 1), w.page.objects.length);
  return w;
}
export function hashView(w) {
  return {
    cells: Object.keys(w.cells).sort().map((k) => `${k}${w.cells[k]}`), hits: Object.fromEntries(Object.keys(w.hits).sort().map((k) => [k, w.hits[k]])),
    felled: Object.fromEntries(Object.keys(w.felled).sort().map((k) => [k, w.felled[k]])), shaken: w.shaken.slice(), dug: w.dug.slice(), bonus: w.bonus,
    tools: Object.fromEntries(Object.keys(w.tools).sort().map((k) => [k, w.tools[k]])),
    dead: w.enemies.filter((e) => !alive(e)).map((e) => e.id), held: w.enemies.filter((e) => e.holder).map((e) => `e${e.id}:${e.holder}`).concat(w.objects.filter((o) => o.holder && o.kind !== 'seed').map((o) => `o${o.id}:${o.holder}`)).sort(),
    objects: w.objects.filter((o) => o.kind !== 'seed' && o.st !== 'gone').map((o) => `${o.id}${o.kind[0]}${o.holder ? 'h' : 'r'}`),
    icicles: w.icicles.map((ic) => `${ic.id}${ICE_CODE[ic.st] || '?'}`), frozen: Object.keys(w.frozen).sort(), crates: w.crates.map((c) => c.species),
    buddies: Object.keys(w.buddies).sort().map((k) => `${k}:${w.buddies[k].species}`),
  };
}

// ---- the player's body against an enemy (decided on the player's own screen) ------------------------------------------------------------------------------------
/** 'stomp' (the body lands on it from above), 'hurt' (it touches the body from the side) or null. mode: 'normal' | 'pogo' | 'pound'. */
export function contactKind(e, b, mode = 'normal') {
  if (!alive(e) || e.holder) return null;
  const [x0, y0, x1, y1] = enemyRect(e), hw = P.half - 0.04;
  if (!(b.x + hw > x0 && b.x - hw < x1 && b.y + P.height > y0 && b.y < y1)) return null;
  const harmless = e.st === 'stun' || e.st === 'shell' || e.st === 'thrown';
  const above = b.vy < 1 && b.y >= e.y + (y1 - y0) * 0.45;
  if (mode !== 'normal' && above) return 'stomp';
  if (e.kind === 'bush') return 'hurt';
  if (above) return e.st === 'shell' ? null : 'stomp';
  return harmless ? null : 'hurt';
}
/** A hostile seed (or a slid shell) touching the body. */
export function seedTouches(o, b) {
  return o.kind === 'seed' && o.hostile && o.st === 'air' && Math.abs(o.x - b.x) < P.half + 0.18 && o.y > b.y - 0.15 && o.y < b.y + P.height + 0.1;
}

// ---- what a player can do right now (prompts and the client's own decisions) -------------------------------------------------------------------------------------
/** The nearest throwable (a resting stone / fruit / log, a stunned acorn, a shell) within `reach` of an actor: { type, id, thing } or null. */
export function grabCandidate(w, a, reach = T.grabReach) {
  let best = null, bd = Infinity;
  const test = (type, thing) => { const d = Math.abs(thing.x - a.x) + Math.abs(thing.y + 0.3 - (a.y + 0.7)) * 0.6; if (Math.abs(thing.x - a.x) <= reach && Math.abs(thing.y + 0.3 - (a.y + 0.7)) <= 1.4 && d < bd) { bd = d; best = { type, id: thing.id, thing }; } };
  for (const o of w.objects) if (o.st === 'rest' && !o.holder && !o.hostile && o.kind !== 'seed') test('o', o);
  for (const e of w.enemies) if (alive(e) && !e.holder && (e.st === 'stun' || e.st === 'shell')) test('e', e);
  return best;
}
/** { text, x, y } for the prompt bubble of an actor (x, y: where it points, tile coordinates), or null. Interact's verb wins; otherwise a Cancel hint. */
export function contextAction(w, a, face) {
  const held = holdOf(w, a.key);
  if (held) return { text: 'Throw', x: a.x, y: a.y + 2.7, button: 'cancel' };
  const tool = a.tool;
  if (tool) {
    const rect = hitRect(tool, a.x, a.y, face);
    const g = findGate(w, tool, rect, a.x);
    if (g) {
      const text = g.type === 'tree' ? 'Chop' : g.type === 'dig' ? 'Dig' : g.kind === 'H' ? 'Cut' : TOOL_VERB[tool];
      const x = g.type === 'tile' ? g.cx + 0.5 : g.type === 'tree' ? g.tree.x : g.dig.x;
      const y = g.type === 'tile' ? g.cy + 1 : g.type === 'tree' ? g.tree.y + 2.2 : g.dig.y + 0.8;
      return { text, x, y, button: 'interact' };
    }
  } else {
    const t = shakeTarget(w, a);
    if (t) return { text: 'Shake', x: t.x, y: a.y + 2.2, button: 'interact' };
  }
  const gc = grabCandidate(w, a);
  if (gc) return { text: 'Grab', x: gc.thing.x, y: gc.thing.y + 0.9, button: 'cancel' };
  return null;
}
