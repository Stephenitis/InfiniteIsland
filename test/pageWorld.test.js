// Step 50: tools, grab & throw, enemies and the page world (game/pageWorldLogic.js), the page validator's tool gates (game/pageFormat.js) and the flowers of the saved progress.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorld, request, applyRecs, stepWorld, motion, applyMotion, snapshot, loadSnapshot, hashView, hitRect, treeFill, crateLanding, contactKind, grabCandidate, contextAction, holdOf, releaseRecs, enemyById, objectById,
} from '../public/js/game/pageWorldLogic.js';
import { createBody, stepBody, advance, createGrid, LIMITS, createLife, hurtLife } from '../public/js/game/platformerLogic.js';
import { parsePage, validatePage, solveGates } from '../public/js/game/pageFormat.js';
import { PAGES, getPage } from '../public/js/game/pages/index.js';
import { WOODCUTTERS_WAY, WOODCUTTERS_COOP } from '../public/js/game/pages/woodcuttersWay.js';
import {
  freshRun, normaliseRun, runView, validateCollect, applyCollect, normaliseProgress, mergeClear, progressLine, progressView, freshState, applyEnter,
} from '../public/js/game/storybookLogic.js';
import { PLATFORMER as P, PAGE_TOOLS as T, PAGE_ENEMY as EN } from '../public/js/config.js';

const page = () => getPage('woodcutters-way');
const make = () => createWorld(page());
const me = (x, y, tool = null, key = 'host:0') => ({ key, x, y, tool });
const hit = (w, a, face = 1) => { const r = request(w, 'hit', { face }, a); assert.ok(r.ok, r.reason); applyRecs(w, r.recs); return r.recs; };
const run = (w, seconds, actors = [], ctx = {}) => { const all = []; for (let i = 0; i < seconds * 60; i++) { const r = stepWorld(w, 1 / 60, actors, ctx); applyRecs(w, r); all.push(...r); } return all; };

// ---- tool verbs on the grid --------------------------------------------------------------------------------------------------------------------------------------
test('axe: a tree takes 3 hits, falls the way the chopper faces and its trunk becomes a walkable bridge over the pit', () => {
  const w = make(), tree = page().trees[0];
  const a = me(tree.x - 1, tree.y, 'axe');
  assert.deepEqual(hit(w, a).map((r) => r.t), ['hit']); assert.equal(w.hits.t0, 1);
  hit(w, a);
  const last = hit(w, a);
  assert.equal(last[0].t, 'felled'); assert.equal(last[0].dir, 1);
  assert.deepEqual(w.felled, { 0: 1 });
  const logs = Object.entries(w.cells).filter(([, ch]) => ch === 'L').map(([k]) => k);
  assert.equal(logs.length, T.trunk, 'one log tile per trunk length over the empty pit');
  assert.equal(treeFill(createGrid(['....', '####']), { x: 0.5, y: 1 }, 1).length, 0, 'over solid ground the trunk adds nothing');
  // the pit was a death trap; now a running body crosses it without falling
  const b = createBody(tree.x - 1, tree.y); for (let i = 0; i < 5; i++) stepBody(w.grid, b, {});
  for (let i = 0; i < 400 && b.x < tree.x + 12; i++) stepBody(w.grid, b, { move: 1 });
  assert.ok(b.x > tree.x + 11 && b.y > tree.y - 0.1, 'crossed the log bridge');
  const bare = createBody(tree.x - 1, tree.y); for (let i = 0; i < 5; i++) stepBody(page().grid, bare, {});
  for (let i = 0; i < 400 && bare.y > -3; i++) stepBody(page().grid, bare, { move: 1 });
  assert.ok(bare.y < -2.4, 'without the tree the same walk falls into the pit');
  // facing the other way fells it the other way (a log laid to the left)
  const w2 = make(); const a2 = me(tree.x + 1, tree.y, 'axe');
  hit(w2, a2, -1); hit(w2, a2, -1); const l2 = hit(w2, a2, -1);
  assert.equal(l2[0].dir, -1);
});

test('axe: cutting the vine drops a hanging crate onto the ground, where it becomes a step; the page is never changed', () => {
  const w = make(), g = page().gates.find((x) => x.kind === 'H');
  const a = me(g.cx - 1.4, 8.7, 'axe');                               // a jump swing: the crate hangs above a standing swing's reach
  assert.equal(request(w, 'hit', { face: 1 }, me(g.cx - 1.4, 6, 'axe')).recs.length, 0, 'standing on the floor the swing falls short');
  const recs = hit(w, a);
  assert.equal(recs[0].t, 'tile');
  assert.equal(w.grid.kind(g.cx, g.cy), '.'); assert.equal(w.grid.kind(g.cx, crateLanding(page().grid, g.cx, g.cy)), 'K');
  assert.equal(page().grid.kind(g.cx, g.cy), 'H', 'the page itself keeps its crate: a page entered again starts pristine');
  assert.equal(createWorld(page()).grid.kind(g.cx, g.cy), 'H');
});

test('hammer: stone blocks take 2 hits each, a geode spills stones and berries, and wrong tools only clink', () => {
  const w = make(), blk = page().gates.filter((x) => x.kind === 'B' && x.cx < 100);       // (the hammer plug in the first hill; two more B tiles are half of the co-op door)
  assert.equal(blk.length, 2);
  const a = me(blk[0].cx - 1.7, 6, 'hammer');
  assert.equal(hit(w, a)[0].t, 'hit');
  const second = hit(w, a); assert.equal(second[0].t, 'tile'); assert.equal(w.grid.kind(blk[0].cx, blk[0].cy), '.');
  assert.deepEqual(request(w, 'hit', { face: 1 }, me(blk[0].cx - 1.7, 6, 'axe')).recs.filter((r) => r.t === 'hit' || r.t === 'tile'), [], 'an axe does nothing to a stone block');
  const geode = page().gates.find((x) => x.kind === 'R'), b = me(geode.cx - 1.4, 6, 'hammer');
  hit(w, b); const rs = hit(w, b);
  assert.deepEqual(rs.map((r) => r.t), ['tile', 'spawn', 'bonus']);
  assert.equal(rs[1].objects.length, T.geodeStones); assert.equal(w.bonus, T.geodeBerries);
  assert.equal(w.objects.filter((o) => o.kind === 'stone').length, 2 + T.geodeStones, 'the two stones of the page plus what the geode spilled');
});

test('hammer ground pound: breaks the cracked floor under the feet (and nothing else), and the body falls into the secret room', () => {
  const w = make(), xs = page().gates.filter((g) => g.kind === 'X');
  assert.equal(xs.length, 3);
  assert.equal(request(w, 'pound', {}, me(xs[0].cx + 0.5, xs[0].cy + 1, 'axe')).reason, 'tool');
  const r = request(w, 'pound', {}, me(xs[0].cx + 0.5, xs[0].cy + 1, 'hammer'));
  assert.ok(r.ok); applyRecs(w, r.recs);
  assert.equal(r.recs[0].cells.length, 1, 'a body 0.6 wide in the middle of a tile breaks that tile only');
  assert.equal(w.grid.kind(xs[0].cx, xs[0].cy), '.');
  assert.equal(w.grid.kind(xs[1].cx, xs[1].cy), 'X');
  const none = request(w, 'pound', {}, me(5.5, 6, 'hammer')); assert.ok(none.ok); assert.deepEqual(none.recs, []);
  const b = createBody(xs[0].cx + 0.5, xs[0].cy + 1); b.grounded = false;
  for (let i = 0; i < 90; i++) stepBody(w.grid, b, { pound: true });
  assert.ok(b.y < xs[0].cy - 1.5 && b.grounded, 'fell through the hole into the room');
  // under the next cracked cell the room has a plank: a pound there lands on it (the way back up)
  applyRecs(w, request(w, 'pound', {}, me(xs[1].cx + 0.5, xs[1].cy + 1, 'hammer')).recs);
  const c = createBody(xs[1].cx + 0.5, xs[1].cy + 1); c.grounded = false;
  for (let i = 0; i < 90; i++) stepBody(w.grid, c, { pound: true });
  assert.ok(Math.abs(c.y - 8) < 0.01 && c.grounded, 'lands on the plank inside the room');
});

test('shovel: soil takes one hit per cell, a dig spot gives berries or reveals its pressed flower, and a pogo landing digs soil', () => {
  const w = make(), soil = page().gates.filter((g) => g.kind === 'D');
  assert.equal(soil.length, 4);
  const a = me(soil[0].cx + 0.5, soil[0].cy + 1, 'shovel');
  const r = hit(w, a); assert.equal(r[0].t, 'tile'); assert.equal(w.grid.kind(soil[0].cx, soil[0].cy) === '.' || w.grid.kind(soil[1].cx, soil[1].cy) === '.', true);
  const pg = request(w, 'soil', { cx: soil[3].cx, cy: soil[3].cy }, me(soil[3].cx + 0.5, soil[3].cy + 1.1, 'shovel'));
  assert.ok(pg.ok); applyRecs(w, pg.recs); assert.equal(w.grid.kind(soil[3].cx, soil[3].cy), '.');
  assert.equal(request(w, 'soil', { cx: soil[3].cx, cy: soil[3].cy }, me(soil[3].cx + 0.5, soil[3].cy + 1.1, 'shovel')).reason, 'gone', 'already dug');
  const [d0, d1] = page().digs;
  const x0 = hit(w, me(d0.x - 1, d0.y, 'shovel')); assert.equal(x0[0].t, 'dig'); assert.equal(w.bonus, 4); assert.deepEqual(w.dug, [0]);
  assert.equal(page().flowers.filter((f) => f.buried === d1.i).length, 1);
  const x1 = hit(w, me(d1.x - 1, d1.y, 'shovel')); assert.equal(x1[0].flower, d1.flower); assert.deepEqual(w.dug, [0, 1]);
  assert.equal(request(w, 'hit', { face: 1 }, me(d1.x - 1, d1.y, 'shovel')).recs.length, 0, 'a dug spot is empty');
});

test('shovel pogo: thorns bounce the body instead of hurting it (and hurt a normal jump)', () => {
  const g = createGrid(['..............', '..............', '..............', '..............', '..............', '..............', '..............', '.....^^^^^^^..', '##############']);
  const walk = (pogo) => { const b = createBody(1, 1); for (let i = 0; i < 4; i++) stepBody(g, b, {}); b.vy = 6; b.grounded = false; const evs = []; for (let i = 0; i < 160; i++) { stepBody(g, b, { move: 1, pogo }); evs.push(...b.ev.map((e) => e.kind)); b.ev.length = 0; } return { b, evs }; };
  const hurt = walk(false), safe = walk(true);
  assert.ok(hurt.evs.includes('hazard') && !hurt.evs.includes('pogo'));
  assert.ok(safe.evs.includes('pogo') && !safe.evs.includes('hazard'), 'a pogo never raises the hazard');
  assert.ok(safe.evs.filter((e) => e === 'pogo').length >= 1 && safe.b.x > 11, 'bounces on and crosses the whole field');
});

test('sword: defeats enemies, cuts bramble walls and bats a hostile seed back at the nearest enemy', () => {
  const w = make();
  const acorn = w.enemies.find((e) => e.kind === 'acorn' && e.x > 150);
  const a = me(acorn.x - 1.5, acorn.y, 'sword');
  const rs = hit(w, a); assert.ok(rs.some((r) => r.t === 'defeat' && r.id === acorn.id)); assert.equal(acorn.st, 'dead'); assert.equal(w.bonus, T.defeatBerries);
  const bramble = page().gates.find((g) => g.kind === 'W'), c = me(bramble.cx - 1.8, 6, 'sword');
  assert.equal(hit(w, c)[0].t, 'hit'); assert.equal(hit(w, c)[0].t, 'tile'); assert.equal(w.grid.kind(bramble.cx, bramble.cy), '.');
  // a seed spat at the player is batted: friendly, flying away
  const bush = w.enemies.find((e) => e.kind === 'bush');
  const seeds = []; applyRecs(w, [{ t: 'spawn', objects: [{ id: w.nextObj, kind: 'seed', x: bush.x - 2, y: 7.2, vx: -4, vy: 0, st: 'air', hostile: true }] }]);
  const seed = w.objects.find((o) => o.kind === 'seed'); seeds.push(seed);
  const bat = request(w, 'hit', { face: -1 }, me(seed.x + 1.2, 6, 'sword'));
  assert.equal(bat.recs.find((r) => r.t === 'bat').id, seed.id);
  const bw = request(w, 'hit', { face: 1 }, me(seed.x - 1.2, 6, 'axe')); assert.equal(bw.recs.filter((r) => r.t === 'bat').length, 0, 'only a sword bats');
  applyRecs(w, bat.recs); assert.ok(seed.friendly && !seed.hostile);
});

test('empty hands shake a fruit tree once per tree per run; the berries count as bonus', () => {
  const w = make(), tree = page().shakeTrees[0];
  const r = request(w, 'hit', { face: 1 }, me(tree.x, 6, null)); assert.equal(r.recs[0].t, 'shake'); applyRecs(w, r.recs);
  assert.deepEqual(w.shaken, [tree.i]); assert.equal(w.bonus, T.shakeBerries);
  assert.deepEqual(request(w, 'hit', { face: 1 }, me(tree.x, 6, null)).recs, [], 'once per tree per run');
  assert.deepEqual(request(w, 'hit', { face: 1 }, me(tree.x + 30, 6, null)).recs, [], 'out of reach');
});

// ---- grab, throw and twirl -------------------------------------------------------------------------------------------------------------------------------------------
test('twirl: Cancel in the air glides for about 0.35 s, once per airtime, and gains the distance the validator was derived from', () => {
  const g = createGrid(Array.from({ length: 12 }, () => '..............................').concat(['##############################']));
  const jump = (twirl, double = false) => {
    const b = createBody(3, 1); for (let i = 0; i < 3; i++) stepBody(g, b, {});
    stepBody(g, b, { move: 1, jumpPressed: true, jumpHeld: true }); const x0 = b.x; let twirls = 0, t = 0;
    for (let i = 0; i < 400; i++) { stepBody(g, b, { move: 1, jumpHeld: true, twirlPressed: (twirl && b.vy < 0 && (double || twirls === 0)) || (b.vy < 0 && twirls > 0 && double && i % 5 === 0) }); twirls += b.ev.filter((e) => e.kind === 'twirl').length; b.ev.length = 0; t += P.step; if (b.grounded) break; }
    return { dx: b.x - x0, twirls, t };
  };
  const plain = jump(false), tw = jump(true), twice = jump(true, true);
  assert.equal(tw.twirls, 1); assert.equal(twice.twirls, 1, 'one twirl per airtime');
  assert.ok(tw.dx - plain.dx >= LIMITS.twirlBonus, `the twirl gains ${(tw.dx - plain.dx).toFixed(2)} tiles, the validator counts on ${LIMITS.twirlBonus}`);
  assert.ok(tw.t - plain.t > 0.25 && tw.t - plain.t < 0.8, `extra airtime ${(tw.t - plain.t).toFixed(2)} s`);
  // landing gives the next airtime its twirl back; a twirl while carrying is not allowed (the page tools never ask for one)
  const b = createBody(3, 1); for (let i = 0; i < 3; i++) stepBody(g, b, {});
  b.grounded = false; b.vy = -1; stepBody(g, b, { twirlPressed: true }); assert.ok(b.twirled);
  for (let i = 0; i < 200 && !b.grounded; i++) stepBody(g, b, {});
  stepBody(g, b, {}); assert.equal(b.twirled, false);
});

test('carrying slows the run and the jump; a pound falls straight and fast', () => {
  const g = createGrid(Array.from({ length: 12 }, () => '..............................').concat(['##############################']));
  const speed = (carry) => { const b = createBody(3, 1); for (let i = 0; i < 3; i++) stepBody(g, b, {}); for (let i = 0; i < 90; i++) stepBody(g, b, { move: 1, carry }); return b.vx; };
  assert.ok(Math.abs(speed(true) / speed(false) - P.carryMove) < 0.02);
  const apex = (carry) => { const b = createBody(3, 1); for (let i = 0; i < 3; i++) stepBody(g, b, {}); stepBody(g, b, { jumpPressed: true, jumpHeld: true, carry }); let m = 0; for (let i = 0; i < 120; i++) { stepBody(g, b, { jumpHeld: true, carry }); m = Math.max(m, b.y - 1); } return m; };
  assert.ok(apex(true) < apex(false) * 0.85 && apex(true) > apex(false) * 0.6);
  const b = createBody(3, 8); b.vx = 5; b.grounded = false; stepBody(g, b, { pound: true, move: 1 }); assert.equal(b.vx, 0); assert.equal(b.vy, -P.poundV); assert.ok(b.pounding);
});

test('grab and throw: one thing at a time, thrown forward / straight up / set down; stones break blocks and defeat enemies; fruit only knocks over', () => {
  const w = make();
  const stone = w.objects.find((o) => o.kind === 'stone' && o.x > 150);                    // (an open stretch with a long run ahead)
  const a = me(stone.x - 0.5, stone.y);
  assert.equal(request(w, 'grab', { type: 'o', id: stone.id }, me(stone.x + 20, stone.y)).reason, 'far');
  const g1 = request(w, 'grab', { type: 'o', id: stone.id }, a); assert.ok(g1.ok); applyRecs(w, g1.recs);
  assert.equal(holdOf(w, a.key), stone); assert.equal(stone.st, 'held');
  assert.equal(request(w, 'grab', { type: 'o', id: stone.id }, me(stone.x, stone.y, null, 'host:1')).reason, 'gone', 'already taken');
  const fruit = w.objects.find((o) => o.kind === 'fruit'); assert.equal(request(w, 'grab', { type: 'o', id: fruit.id }, me(fruit.x, fruit.y)).reason, 'busy', 'arms are full');
  const up = request(w, 'throw', { mode: 'up', face: 1 }, a); applyRecs(w, up.recs);
  assert.ok(stone.vy > 12 && Math.abs(stone.vx) < 2 && stone.st === 'air');
  run(w, 4, [a]); assert.equal(stone.st, 'rest', 'comes back down and rests');
  assert.ok(Math.abs(stone.x - a.x) < 3, 'a throw straight up comes back down near the thrower');
  applyRecs(w, request(w, 'grab', { type: 'o', id: stone.id }, a).recs);
  const fwd = request(w, 'throw', { mode: 'fwd', face: 1 }, a); applyRecs(w, fwd.recs);
  assert.ok(stone.vx > 10 && stone.vy > 4);
  run(w, 3, [a]); assert.ok(stone.x - a.x > 3.5 && stone.x - a.x < 10, `a forward throw lands ${(stone.x - a.x).toFixed(1)} tiles away`);
  a.x = stone.x - 0.5; applyRecs(w, request(w, 'grab', { type: 'o', id: stone.id }, a).recs);
  const down = request(w, 'throw', { mode: 'down', face: -1 }, a); applyRecs(w, down.recs); run(w, 1, [a]);
  assert.ok(stone.st === 'rest' && Math.abs(stone.x - a.x) < 1.2, 'set down gently');
  // thrown at a walking acorn: the stone defeats it and is used up
  const w2 = make(), acorn = w2.enemies.find((e) => e.kind === 'acorn'); acorn.vx = 0;
  const t = { id: w2.nextObj, kind: 'stone', x: acorn.x - 3, y: acorn.y + 0.7, vx: 11, vy: 0, st: 'air' }; applyRecs(w2, [{ t: 'spawn', objects: [t] }]);
  const recs = run(w2, 1); assert.ok(recs.some((r) => r.t === 'defeat' && r.id === acorn.id), 'defeated'); assert.equal(objectById(w2, t.id).st, 'gone');
  // fruit only knocks the acorn over (a stun you can grab)
  const w3 = make(), ac3 = w3.enemies.find((e) => e.kind === 'acorn');
  applyRecs(w3, [{ t: 'spawn', objects: [{ id: w3.nextObj, kind: 'fruit', x: ac3.x - 3, y: ac3.y + 0.7, vx: 11, vy: 0, st: 'air' }] }]);
  run(w3, 0.8); assert.ok(ac3.st === 'stun' || ac3.st === 'walk') ; assert.notEqual(ac3.st, 'dead');
});

test('a thrown stone chips a stone block; a thrown log lights an unlit campfire', () => {
  const w = make(), blk = page().gates.find((g) => g.kind === 'B');
  applyRecs(w, [{ t: 'spawn', objects: [{ id: w.nextObj, kind: 'stone', x: blk.cx - 3, y: blk.cy + 0.6, vx: 12, vy: 0, st: 'air' }] }]);
  run(w, 1); assert.equal(w.hits[`${blk.cx},${blk.cy}`], 1, 'one hit on the block');
  const fire = page().campfires[3];
  applyRecs(w, [{ t: 'spawn', objects: [{ id: w.nextObj, kind: 'log', x: fire.x - 3, y: fire.y + 1, vx: 8, vy: 0, st: 'air' }] }]);
  const recs = run(w, 1.5, [], { fires: page().campfires.map((f, idx) => ({ idx, x: f.x, y: f.y, lit: false })) });
  assert.ok(recs.some((r) => r.t === 'fire' && r.idx === 3), 'the log lit campfire 3');
  const lit = make(); applyRecs(lit, [{ t: 'spawn', objects: [{ id: lit.nextObj, kind: 'log', x: fire.x - 3, y: fire.y + 1, vx: 8, vy: 0, st: 'air' }] }]);
  assert.ok(!run(lit, 1.5, [], { fires: page().campfires.map((f, idx) => ({ idx, x: f.x, y: f.y, lit: true })) }).some((r) => r.t === 'fire'), 'a lit fire is not lit twice');
});

// ---- enemies ----------------------------------------------------------------------------------------------------------------------------------------------------------------
test('enemies: walkers turn at walls and ledges and stay near home', () => {
  const grid = createGrid(['.........#..........', '.........#..........', '#####..#############']);       // a pit at x 5-6, a wall at x 9: ground between them is x 7-8
  const tiny = { grid, enemies: [{ id: 0, kind: 'acorn', x: 7.5, y: 2 }, { id: 1, kind: 'beetle', x: 13.5, y: 2 }], objects: [], trees: [], digs: [], gates: [], stands: [], shakeTrees: [], flowers: [], campfires: [] };
  const w = createWorld(tiny);
  const xs = []; for (let i = 0; i < 60 * 12; i++) { stepWorld(w, 1 / 60, [], {}); xs.push(w.enemies[0].x); }
  assert.ok(Math.min(...xs) > 6.8 && Math.max(...xs) < 8.9, `the acorn stays on its plank of ground, turning at the ledge and at the wall (${Math.min(...xs).toFixed(2)}..${Math.max(...xs).toFixed(2)})`);
  assert.ok(new Set(xs.map((x, i) => (i && xs[i] > xs[i - 1] ? 1 : 0))).size === 2, 'it turned both ways');
  const wb = createWorld({ ...tiny, enemies: [{ id: 0, kind: 'beetle', x: 12.5, y: 2 }] }); const bx = [];
  for (let i = 0; i < 60 * 12; i++) { stepWorld(wb, 1 / 60, [], {}); bx.push(wb.enemies[0].x); }
  assert.ok(Math.min(...bx) > 9.9, 'the beetle turns at the wall too');
  const lone = createWorld(page()), a = lone.enemies[0]; const start = a.x;
  for (let i = 0; i < 60 * 40; i++) stepWorld(lone, 1 / 60, [], {});
  assert.ok(Math.abs(a.x - start) <= EN.patrol + 1.5, 'a patrol never strays far from where it lives');
});

test('stomping: from above defeats an acorn, turns a beetle into a shell, bounces off a bush; from the side it hurts; a pound or a pogo works on the bush differently', () => {
  const w = make();
  const acorn = w.enemies.find((e) => e.kind === 'acorn'), beetle = w.enemies.find((e) => e.kind === 'beetle'), bush = w.enemies.find((e) => e.kind === 'bush');
  const body = (e, dy, vy) => ({ x: e.x, y: e.y + dy, vy });
  assert.equal(contactKind(acorn, body(acorn, 0.7, -8)), 'stomp');
  assert.equal(contactKind(acorn, body(acorn, 0, 0)), 'hurt');
  assert.equal(contactKind(acorn, { x: acorn.x, y: acorn.y + 3, vy: -3 }), null, 'no overlap, no contact');
  assert.equal(contactKind(bush, body(bush, 1.0, -8)), 'hurt', 'a bush is spiky: a plain stomp hurts');
  assert.equal(contactKind(bush, body(bush, 1.0, -8), 'pogo'), 'stomp');
  assert.equal(contactKind(bush, body(bush, 1.0, -8), 'pound'), 'stomp');
  const a = me(acorn.x, acorn.y + 0.8);
  const s1 = request(w, 'stomp', { id: acorn.id, mode: 'stomp' }, a); assert.equal(s1.recs[0].t, 'defeat');
  const s2 = request(w, 'stomp', { id: beetle.id, mode: 'stomp' }, me(beetle.x, beetle.y + 0.8)); assert.equal(s2.recs[0].st, 'shell'); applyRecs(w, s2.recs);
  assert.equal(request(w, 'stomp', { id: bush.id, mode: 'stomp' }, me(bush.x, bush.y + 1)).recs.length, 0, 'a stomp does not hurt a bush');
  assert.equal(request(w, 'stomp', { id: bush.id, mode: 'pound' }, me(bush.x, bush.y + 1, 'hammer')).recs[0].t, 'defeat');
  assert.equal(request(w, 'stomp', { id: bush.id, mode: 'pound' }, me(bush.x, bush.y + 1, 'sword')).reason, 'tool');
  assert.equal(request(w, 'stomp', { id: acorn.id, mode: 'stomp' }, me(acorn.x + 30, acorn.y)).reason, 'far');
  applyRecs(w, s1.recs);
  assert.equal(request(w, 'stomp', { id: acorn.id, mode: 'stomp' }, a).reason, 'gone', 'already gone');
  assert.equal(w.bonus, T.defeatBerries);
  // hammer: the bush falls to a swing too; sword and axe do not
  const w2 = make(), b2 = w2.enemies.find((e) => e.kind === 'bush');
  assert.equal(request(w2, 'hit', { face: 1 }, me(b2.x - 1.5, b2.y, 'sword')).recs.filter((r) => r.t === 'defeat').length, 0);
  assert.equal(request(w2, 'hit', { face: 1 }, me(b2.x - 1.5, b2.y, 'hammer')).recs.filter((r) => r.t === 'defeat').length, 1);
});

test('the rolling beetle: a shell you can grab and throw; a thrown shell slides, bounces off walls and defeats what it touches', () => {
  const w = make(), beetle = w.enemies.find((e) => e.kind === 'beetle');
  applyRecs(w, request(w, 'stomp', { id: beetle.id, mode: 'stomp' }, me(beetle.x, beetle.y + 0.8)).recs);
  assert.equal(beetle.st, 'shell');
  const a = me(beetle.x - 0.5, beetle.y);
  assert.equal(request(w, 'grab', { type: 'e', id: beetle.id }, a).ok, true); applyRecs(w, request(w, 'grab', { type: 'e', id: beetle.id }, a).recs);
  assert.equal(holdOf(w, a.key), beetle);
  const th = request(w, 'throw', { mode: 'fwd', face: 1 }, a); applyRecs(w, th.recs);
  assert.equal(beetle.st, 'slide'); assert.equal(beetle.dir, 1);
  // an acorn in the way is defeated by the slide
  const acorn = { t: 'spawnE', e: { id: 90, kind: 'acorn', x: beetle.x + 4, y: beetle.y } }; applyRecs(w, [acorn]);
  const victim = enemyById(w, 90); victim.dir = 1;
  const recs = run(w, 2, [a]); assert.ok(recs.some((r) => r.t === 'defeat' && r.id === 90), 'the shell defeated the acorn');
  run(w, 8, [a]); assert.equal(beetle.st, 'shell', 'the slide ends as a resting shell');
  // a shell left alone wakes up and walks again
  run(w, 9); assert.equal(beetle.st, 'walk');
  // a stunned acorn (axe / shovel bonk) can be grabbed too; thrown, it defeats the acorn it hits and pops itself
  const w2 = make(), ac = w2.enemies.find((e) => e.kind === 'acorn');
  applyRecs(w2, request(w2, 'hit', { face: 1 }, me(ac.x - 1.2, ac.y, 'axe')).recs); assert.equal(ac.st, 'stun');
  assert.ok(request(w2, 'grab', { type: 'e', id: ac.id }, me(ac.x - 0.5, ac.y)).ok);
});

test('the berry bush spits slow seeds at players who come near, never from far away', () => {
  const w = make(), bush = w.enemies.find((e) => e.kind === 'bush');
  assert.equal(run(w, 6, [{ key: 'host:0', x: bush.x - 30, y: bush.y }]).filter((r) => r.t === 'spawn').length, 0, 'out of range: quiet');
  const near = run(w, 8, [{ key: 'host:0', x: bush.x - 8, y: bush.y }]).filter((r) => r.t === 'spawn' && r.objects[0].kind === 'seed');
  assert.ok(near.length >= 2, `${near.length} seeds in 8 s`);
  const seed = near[0].objects[0]; assert.ok(seed.hostile && seed.vx < 0);
});

// ---- requests, sync and snapshots -----------------------------------------------------------------------------------------------------------------------------
test('requests are validated: tools, reach, stands, unknown kinds, garbage', () => {
  const w = make(), s = page().stands[0];
  assert.equal(request(w, 'take', { stand: 0 }, me(s.x + 30, s.y)).reason, 'far');
  const ok = request(w, 'take', { stand: 0 }, me(s.x + 1, s.y)); assert.deepEqual(ok.recs, [{ t: 'tool', key: 'host:0', tool: 'axe' }]);
  applyRecs(w, ok.recs); assert.equal(request(w, 'take', { stand: 0 }, me(s.x, s.y)).reason, 'same');
  assert.equal(request(w, 'take', { stand: 9 }, me(s.x, s.y)).reason, 'bad-request');
  assert.equal(request(w, 'nope', {}, me(s.x, s.y)).reason, 'unknown');
  assert.equal(request(w, 'hit', {}, null).reason, 'bad-request');
  assert.equal(request(w, 'hit', {}, { key: 'x', x: NaN, y: 1 }).reason, 'bad-request');
  assert.equal(request(w, 'throw', { mode: 'fwd' }, me(5, 6)).reason, 'nothing-held');
  assert.equal(request(w, 'hit', { face: 1 }, me(5, 6, 'lightsaber')).reason, 'bad-request');
  assert.equal(request(w, 'untool', {}, me(5, 6, null, 'host:3')).reason, 'nothing-held');
  applyRecs(w, request(w, 'untool', {}, me(s.x, s.y, 'axe')).recs); assert.deepEqual(w.tools, {});
  assert.equal(request(w, 'seedhit', { id: 999 }, me(5, 6)).reason, 'gone');
});

test('the world survives the wire: a late joiner\'s snapshot equals the host, hashes ignore exact positions, motion is compact', () => {
  const host = make(), a = me(25, 6, 'axe');
  const s = page().stands[3]; applyRecs(host, request(host, 'take', { stand: 3 }, me(s.x, s.y)).recs);
  const tree = page().trees[0]; for (let i = 0; i < 3; i++) hit(host, me(tree.x - 1, tree.y, 'axe'));
  const blk = page().gates.find((g) => g.kind === 'B'); for (let i = 0; i < 2; i++) hit(host, me(blk.cx - 1.7, 6, 'hammer'));
  hit(host, me(page().shakeTrees[0].x, 6, null));
  const acorn = host.enemies[0]; applyRecs(host, request(host, 'stomp', { id: acorn.id, mode: 'stomp' }, me(acorn.x, acorn.y + 0.8)).recs);
  const stone = host.objects[0]; applyRecs(host, request(host, 'grab', { type: 'o', id: stone.id }, me(stone.x, stone.y)).recs);
  run(host, 2);
  const late = createWorld(page());
  loadSnapshot(late, JSON.parse(JSON.stringify(snapshot(host))));
  assert.equal(JSON.stringify(hashView(late)), JSON.stringify(hashView(host)));
  assert.deepEqual(late.cells, host.cells); assert.equal(late.grid.kind(tree.x | 0, tree.y - 1 | 0) === host.grid.kind(tree.x | 0, tree.y - 1 | 0), true);
  assert.equal(late.enemies[0].st, 'dead'); assert.equal(late.objects.find((o) => o.id === stone.id).holder, 'host:0');
  assert.equal(late.bonus, host.bonus); assert.deepEqual(late.tools, host.tools);
  // positions are not part of the hash
  host.enemies[1].x += 0.3; stone.x += 1; assert.equal(JSON.stringify(hashView(late)), JSON.stringify(hashView(host)));
  // the same rec stream applied from scratch gives the same world (what a replica does with events)
  const replica = createWorld(page()); const hostLog = [];
  const w3 = make(); for (const r of [{ t: 'tool', key: 'host:1', tool: 'shovel' }, { t: 'bonus', n: 3, x: 1, y: 1 }]) { applyRecs(w3, [r]); hostLog.push(r); }
  applyRecs(replica, hostLog); assert.equal(JSON.stringify(hashView(replica)), JSON.stringify(hashView(w3)));
  // motion packets move things on a replica
  const m = JSON.parse(JSON.stringify(motion(host))); applyMotion(late, m);
  assert.ok(Math.abs(late.enemies[1].x - host.enemies[1].x) < 0.01);
  assert.ok(m.e.every((e) => e.length === 7) && m.o.every((o) => o.length === 8));
});

test('a screen that leaves puts down what its actors carried; a page tool comes and goes through recs', () => {
  const w = make(), stone = w.objects.find((o) => o.kind === 'stone');
  applyRecs(w, request(w, 'grab', { type: 'o', id: stone.id }, me(stone.x, stone.y)).recs);
  const rel = releaseRecs(w, 'host:0', { x: stone.x + 2, y: 6 }); applyRecs(w, rel);
  assert.equal(holdOf(w, 'host:0'), null); run(w, 2);
  assert.equal(stone.st, 'rest'); assert.ok(stone.y < 6.1, 'put down on the floor where the holder stood');
  assert.deepEqual(releaseRecs(w, 'host:0', null), []);
});

test('the prompt a player should see: the verb for the gate in front, Shake, Grab, Throw', () => {
  const w = make(), tree = page().trees[0];
  assert.equal(contextAction(w, me(tree.x - 1, tree.y, 'axe'), 1).text, 'Chop');
  assert.equal(contextAction(w, me(tree.x - 1, tree.y, 'hammer'), 1), null, 'the wrong tool shows nothing');
  const blk = page().gates.find((g) => g.kind === 'B'); assert.equal(contextAction(w, me(blk.cx - 1.5, 6, 'hammer'), 1).text, 'Smash');
  const d = page().digs[0]; assert.equal(contextAction(w, me(d.x - 1, d.y, 'shovel'), 1).text, 'Dig');
  assert.equal(contextAction(w, me(page().shakeTrees[0].x, 6, null), 1).text, 'Shake');
  const stone = w.objects.find((o) => o.kind === 'stone'); const g = contextAction(w, me(stone.x, stone.y, null), 1); assert.equal(g.text, 'Grab'); assert.equal(g.button, 'cancel');
  applyRecs(w, request(w, 'grab', { type: 'o', id: stone.id }, me(stone.x, stone.y)).recs);
  assert.equal(contextAction(w, me(stone.x, stone.y, null), 1).text, 'Throw');
});

// ---- the validator and the pages -----------------------------------------------------------------------------------------------------------------------------
const edit = (raw, fn) => { const rows = raw.rows.map((r) => r.split('')); fn(rows); return parsePage({ ...raw, rows: rows.map((r) => r.join('')) }); };
const find = (raw, ch) => { const out = []; raw.rows.forEach((r, ri) => { for (let x = 0; x < r.length; x++) if (r[x] === ch) out.push([x, ri]); }); return out; };

test('both pages pass the validator with their tool gates modelled; Woodcutter\'s Way has stands, gates, 3 flowers and a co-op door', () => {
  for (const pg of PAGES.values()) { const v = validatePage(pg); assert.deepEqual(v.errors, [], pg.id); }
  const v = validatePage(page());
  assert.deepEqual(v.stats.tools, ['axe', 'hammer', 'shovel', 'sword']); assert.equal(v.stats.flowers, 3);
  assert.equal(page().stands.length, 4); assert.equal(page().flowers.length, 3);
  const s = solveGates(page()); assert.deepEqual(s.unopened, []); assert.ok(s.opened.length >= 18);
  assert.ok(page().enemies.some((e) => e.kind === 'acorn') && page().enemies.some((e) => e.kind === 'beetle') && page().enemies.some((e) => e.kind === 'bush'));
});

test('a gate with no stand for its tool in front of it fails with a clear reason', () => {
  const raw = WOODCUTTERS_WAY, axe = find(raw, '1')[0];
  const noAxe = edit(raw, (rows) => { rows[axe[1]][axe[0]] = '.'; });
  const v = validatePage(noAxe);
  assert.ok(!v.ok);
  assert.ok(v.errors.some((e) => /tree at \d+,\d+ can never be opened: no axe stand is reachable before it/.test(e)), v.errors.join(' | '));
  // the stand exists but only AFTER the gate (behind it): the same message
  const hammer = find(raw, '2')[0], blk = find(raw, 'B')[0];
  const late = edit(raw, (rows) => { rows[hammer[1]][hammer[0]] = '.'; rows[hammer[1]][blk[0] + 4] = '2'; });
  const v2 = validatePage(late);
  assert.ok(v2.errors.some((e) => /stone block at \d+,\d+ can never be opened: no hammer stand is reachable before it/.test(e)), v2.errors.join(' | '));
  // a lone block wall with no stand anywhere in a tiny page
  const tiny = parsePage({ id: 't', name: 't', floorRows: 2, rows: ['..............', '..............', 'P..B.........G', '##############', '##############'].map((r) => r.padEnd(14, '.')) });
  assert.ok(validatePage(tiny).errors.some((e) => /can never be opened/.test(e)) || validatePage(tiny).errors.length > 0);
});

test('the co-op door is optional: with its stone and bramble doors sealed for good the page can still be finished', () => {
  const sealed = edit(WOODCUTTERS_WAY, (rows) => {
    for (const [x, y] of [...WOODCUTTERS_COOP.blocks, ...WOODCUTTERS_COOP.brambles]) rows[rows.length - 1 - y][x] = '#';
  });
  const v = validatePage(sealed);
  assert.ok(v.ok, v.errors.join(' | '));
  const marked = validatePage(page()); assert.ok(marked.ok && marked.stats.opened === v.stats.opened, 'the validator itself keeps the page\'s coopDoors sealed (Step 52a): it models a lone player');
  assert.equal(page().coopDoors.length, 4);
  for (const [x, y] of [...WOODCUTTERS_COOP.blocks]) assert.equal(page().grid.kind(x, y), 'B');
  for (const [x, y] of [...WOODCUTTERS_COOP.brambles]) assert.equal(page().grid.kind(x, y), 'W');
});

test('the thorn field needs the shovel (pogo): without a shovel stand the page cannot be finished', () => {
  const shovel = find(WOODCUTTERS_WAY, '3')[0];
  const v = validatePage(edit(WOODCUTTERS_WAY, (rows) => { rows[shovel[1]][shovel[0]] = '.'; }));
  assert.ok(!v.ok);
});

test('flowers: collecting needs the dig spot dug first; the run and the saved progress keep them (old saves load without)', () => {
  const pg = page(), state = applyEnter(freshState(), pg.id);
  const buried = pg.flowers.find((f) => f.buried !== null), open = pg.flowers.find((f) => f.buried === null);
  const at = (f) => ({ pos: { x: -1200 + f.x - pg.W / 2, y: 6 - pg.floorRows + f.y, z: 1000 } });
  const base = { state, run: freshRun(), page: pg, kind: 'flower', actor: at(open) };
  assert.equal(validateCollect({ ...base, id: open.id }).ok, true);
  assert.equal(validateCollect({ ...base, id: buried.id, actor: at(buried) }).reason, 'buried');
  assert.equal(validateCollect({ ...base, id: buried.id, actor: at(buried), dug: [buried.buried] }).ok, true);
  assert.equal(validateCollect({ ...base, id: 99 }).reason, 'bad-request');
  assert.equal(validateCollect({ ...base, id: open.id, run: { ...freshRun(), flowers: [open.id] } }).reason, 'taken');
  assert.equal(validateCollect({ ...base, id: open.id, actor: { pos: { x: 0, y: 0, z: 0 } } }).reason, 'far');
  let run = applyCollect(freshRun(), pg, 'flower', open.id).run; run = applyCollect(run, pg, 'flower', buried.id).run;
  assert.deepEqual(run.flowers, [0, 1, 2].filter((i) => i === open.id || i === buried.id));
  assert.deepEqual(normaliseRun(JSON.parse(JSON.stringify(runView(run))), pg), run);
  assert.deepEqual(normaliseRun({ flowers: [7, -1, 1, 1, 'x'] }, pg).flowers, [1]);
  assert.deepEqual(normaliseRun({ flowers: [0] }, getPage('orchard-hop')).flowers, [], 'a page without flowers keeps none');
  // 100 berries count bonus berries too
  assert.equal(applyCollect({ ...freshRun(), berries: Array.from({ length: 94 }, (_, i) => i) }, pg, 'berry', 95, 5).refill, true);
  assert.equal(applyCollect({ ...freshRun(), berries: Array.from({ length: 94 }, (_, i) => i) }, pg, 'berry', 95, 0).refill, false);
  // saved progress: flowers merge only on a clear, old saves without them load fine
  let prog = normaliseProgress({ pages: { 'woodcutters-way': { cleared: true, letters: ['F'], bestBerries: 5, flowers: [2, 2, 9, 0] }, 'orchard-hop': { cleared: true, letters: ['A'], bestBerries: 3 } } }, PAGES);
  assert.deepEqual(prog.pages['woodcutters-way'].flowers, [0, 2]); assert.deepEqual(prog.pages['orchard-hop'].flowers, []);
  prog = mergeClear(prog, pg, { ...freshRun(), flowers: [1], letters: ['E'] });
  assert.deepEqual(prog.pages['woodcutters-way'].flowers, [0, 1, 2]); assert.deepEqual(prog.pages['woodcutters-way'].letters, ['F', 'E']);
  assert.deepEqual(progressLine(prog, pg).flowers.map((f) => f.found), [true, true, true]);
  assert.deepEqual(progressLine(prog, getPage('orchard-hop')).flowers, []);
  assert.deepEqual(normaliseProgress(JSON.parse(JSON.stringify(prog)), PAGES), prog);
  assert.equal(JSON.stringify(progressView(normaliseProgress(JSON.parse(JSON.stringify(prog)), PAGES))), JSON.stringify(progressView(prog)));
  assert.equal(normaliseProgress({ pages: { 'woodcutters-way': { cleared: true } } }, PAGES).pages['woodcutters-way'].flowers.length, 0);
});

test('hitboxes are boxes in front of the body, in config, and a page tool can only be used on a page the world knows', () => {
  for (const tool of ['axe', 'hammer', 'shovel', 'sword']) {
    const r = hitRect(tool, 10, 6, 1), l = hitRect(tool, 10, 6, -1);
    assert.ok(r.x1 - 10 > T[tool].reach && r.x0 < 10 && l.x0 < 10 - T[tool].reach && l.x1 > 10, tool);
    assert.ok(r.y1 - r.y0 >= T[tool].above, tool);
  }
  assert.ok(T.sword.reach > T.axe.reach - 0.1);
  assert.equal(createLife().hearts, 3); assert.ok(hurtLife(createLife()));
  assert.ok(advance && grabCandidate);
});
