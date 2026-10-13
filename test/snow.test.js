// Frostpine Slopes (Step 52b): ice / drift physics, slush + snowballs, icicles, the sled, critter buddies and the three pages. Pure rules only (no three.js / DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrid, createBody, stepBody, advance, LIMITS, setTile, cloneGrid } from '../public/js/game/platformerLogic.js';
import { PAGE_SNOW as SN, PLATFORMER as P, CHAPTER_REWARDS, PAGE_ENEMY as EN } from '../public/js/config.js';
import { parsePage, validatePage, solveGates, buildGraph } from '../public/js/game/pageFormat.js';
import { getPage, PAGES } from '../public/js/game/pages/index.js';
import {
  slushRuns, freezeCells, tickFrozen, campSpecies, crateSpecies, newCrates, abilityZones, simulateSled, sledBot, sledAt, branchHit, icicleTouches, SPECIES_OF, ABILITY_OF, HELPER,
} from '../public/js/game/pageSnowLogic.js';
import { createWorld, request, applyRecs, stepWorld, snapshot, loadSnapshot, hashView, motion, applyMotion } from '../public/js/game/pageWorldLogic.js';
import { CHAPTERS, chapterEntries, chapterBadge, rewardDue, popupsOf, stickerSets, pageOpen } from '../public/js/game/chapters.js';
import { normaliseProgress, mergeClear, LETTERS } from '../public/js/game/storybookLogic.js';
import { packPageBits, unpackPageBits } from '../public/js/game/pageCoopLogic.js';
import { moverCells } from '../public/js/game/pageMotion.js';
import { getTrack, trackInfo, REGION_TRACKS, TRACK_TITLES } from '../public/js/audio/music.js';
import { getItem, itemName } from '../public/js/game/catalog.js';

const rowsOf = (floor) => ['....................................', '....................................', '....................................', '....................................', '....................................', '....................................', floor, floor.replace(/./g, '#')];
const flat = (surface = '#') => createGrid(rowsOf(surface.repeat(36)));
const onFloor = (g) => { const b = createBody(5, 2); b.grounded = true; for (let i = 0; i < 3; i++) stepBody(g, b, {}); return b; };
const run = (g, b, n, input = {}) => { for (let i = 0; i < n; i++) stepBody(g, b, { move: 1, ...input }); return b; };

// ---- ice and drifts -------------------------------------------------------------------------------------------------------------------------------
test('ice: slow to start, long slides, slow turnaround and a slightly higher top speed; drifts slow the run and cushion the landing', () => {
  const dist = (surface) => { const g = flat(surface), b = onFloor(g); run(g, b, 60); const top = b.vx, x0 = b.x; for (let i = 0; i < 400 && Math.abs(b.vx) > 0.3; i++) stepBody(g, b, {}); return { top, slide: b.x - x0 }; };
  const ground = dist('#'), ice = dist('I'), drift = dist('M');
  assert.ok(ice.slide > ground.slide * 8, `ice slide ${ice.slide.toFixed(1)} vs ground ${ground.slide.toFixed(2)}`);
  assert.ok(ice.top > ground.top && ice.top < ground.top * 1.12, 'a slightly higher run on ice');
  assert.ok(drift.top < ground.top * 0.85 && drift.top > ground.top * 0.7, 'the drift slows the run a little');
  const start = (surface) => { const g = flat(surface), b = onFloor(g); run(g, b, 8); return { g, b }; };
  const a = start('#'), c = start('I');
  assert.ok(c.b.vx < a.b.vx * 0.55, 'ice accelerates slowly');
  const turn = ({ g, b }) => { run(g, b, 90); let n = 0; while (b.vx > -1 && n < 400) { stepBody(g, b, { move: -1 }); n++; } return n; };
  assert.ok(turn(start('I')) > turn(start('#')) * 3, 'turning round on ice takes long');
  // a landing on a drift is cushioned (ev land.soft, a quarter of the impact), the jump itself is the same height
  const apex = (surface) => { const g = flat(surface), b = onFloor(g); stepBody(g, b, { jumpPressed: true, jumpHeld: true }); let top = 0; const lands = []; for (let i = 0; i < 120; i++) { stepBody(g, b, { jumpHeld: true }); top = Math.max(top, b.y); for (const e of b.ev) if (e.kind === 'land') lands.push(e); b.ev.length = 0; if (b.grounded) break; } return { top, lands }; };
  const ua = apex('#'), ud = apex('M');
  assert.ok(Math.abs(ua.top - ud.top) < 0.02, 'no change to the jump height');
  assert.equal(ua.lands[0].soft, false); assert.equal(ud.lands[0].soft, true);
  assert.ok(ud.lands[0].v < ua.lands[0].v * 0.4, 'a quarter of the impact');
});

// ---- slush, snowballs, frozen water ------------------------------------------------------------------------------------------------------------------
const steps = getPage('snowy-steps');
test('slush runs, what a snowball freezes, and how the frozen cells thaw (host timed, replicas only count)', () => {
  const runs = slushRuns(steps.grid);
  assert.deepEqual(runs, [{ row: 1, x0: 124, x1: 133 }]);
  assert.equal(steps.waters.some((w) => w.slush && w.x0 === 124 && w.x1 === 134), true, 'a slush run is a pit with a splash');
  const cells = freezeCells(steps.grid, 128.5, 2.2);
  assert.equal(cells.length, 10); assert.ok(cells.every(([x, y, ch]) => y === 1 && ch === 'I' && x >= 124 && x <= 133));
  assert.equal(freezeCells(steps.grid, 128.5, 9).length, 0, 'a snowball high above it does nothing');
  assert.equal(freezeCells(steps.grid, 60, 2).length, 0, 'far from any slush');
  assert.equal(freezeCells(steps.grid, 123.4, 2.0).length, 10, 'landing beside the pool freezes it');
  assert.equal(freezeCells(steps.grid, 121.0, 2.0).length, 0, 'but not from 3 tiles away');
  const w = createWorld(steps);
  applyRecs(w, [{ t: 'freeze', cells, dur: SN.freezeS, x: 128, y: 2 }]);
  assert.equal(w.grid.kind(128, 1), 'I'); assert.equal(w.grid.at(128, 1), 35, 'ice is solid'); assert.equal(Object.keys(w.frozen).length, 10); assert.equal(Object.keys(w.cells).length, 10);
  const wr = createWorld(steps); applyRecs(wr, [{ t: 'freeze', cells, dur: SN.freezeS, x: 128, y: 2 }]);
  assert.equal(tickFrozen(wr, SN.freezeS + 1, false), null, 'a replica waits for the host');
  const th = tickFrozen(w, SN.freezeS - 0.1, true); assert.equal(th, null);
  const th2 = tickFrozen(w, 0.2, true); assert.equal(th2.t, 'thaw'); assert.equal(th2.cells.length, 10);
  applyRecs(w, [th2]);
  assert.equal(w.grid.kind(128, 1), 'y'); assert.equal(w.grid.at(128, 1), 46, 'slush again'); assert.equal(Object.keys(w.cells).length, 0); assert.equal(Object.keys(w.frozen).length, 0);
});

const feed = (w, recs) => { applyRecs(w, recs); };
test('a thrown snowball splats on slush and freezes it; used snow piles refill after 3 s; the whole freeze is deterministic', () => {
  const w = createWorld(steps);
  const pile = w.objects.find((o) => o.kind === 'snow');
  assert.ok(pile, 'the page has snow piles');
  // throw it at the pool (an arc in the air)
  applyRecs(w, [{ t: 'throw', type: 'o', id: pile.id, x: 121, y: 3, vx: 9, vy: 4, mode: 'fwd', by: 'host:0', dir: 1 }]);
  let frozen = false, splat = false, tFreeze = 0;
  for (let i = 0; i < 400 && !frozen; i++) { const recs = stepWorld(w, 1 / 60, []); feed(w, recs); if (recs.some((r) => r.t === 'freeze')) { frozen = true; tFreeze = w.time; } if (recs.some((r) => r.t === 'splat')) splat = true; }
  assert.ok(frozen && splat, 'the snowball froze the slush');
  assert.equal(pile.st, 'gone');
  assert.equal(w.grid.kind(126, 1), 'I');
  let respawn = null;
  for (let i = 0; i < 400 && !respawn; i++) { const recs = stepWorld(w, 1 / 60, []); feed(w, recs); respawn = recs.find((r) => r.t === 'spawn' && r.objects[0].kind === 'snow') || null; }
  assert.ok(respawn && respawn.objects[0].x === 90.5, 'the pile comes back to where it was');
  // the ice thaws exactly freezeS after the freeze (host world time)
  let thawed = null, tThaw = 0;
  for (let i = 0; i < 60 * 12 && !thawed; i++) { const recs = stepWorld(w, 1 / 60, []); feed(w, recs); thawed = recs.find((r) => r.t === 'thaw') || null; if (thawed) tThaw = w.time; }
  assert.ok(thawed && w.grid.kind(126, 1) === 'y', 'thawed on the host'); assert.ok(Math.abs(tThaw - tFreeze - SN.freezeS) < 0.05, `the ice lasts exactly ${SN.freezeS} s (${(tThaw - tFreeze).toFixed(2)})`);
  // a replica applying the same recs reaches the same state
  const r = createWorld(steps);
  applyRecs(r, [{ t: 'freeze', cells: freezeCells(steps.grid, 128, 2), dur: SN.freezeS, x: 128, y: 2 }]);
  assert.equal(r.grid.kind(124, 1), 'I'); applyRecs(r, [{ t: 'thaw', cells: freezeCells(steps.grid, 128, 2).map(([x, y]) => [x, y, 'y']) }]); assert.equal(r.grid.kind(124, 1), 'y');
});

test('the rolling snowball speeds up while it rolls and turns at ledges; a stomp shrinks it to a small snowball that melts away (freezing slush) when thrown', () => {
  const w = createWorld(steps);
  const e = w.enemies.find((x) => x.kind === 'snowball');
  assert.ok(e, 'the page has a rolling snowball'); const x0 = e.x;
  const sp = [];
  for (let i = 0; i < 60 * 6; i++) { feed(w, stepWorld(w, 1 / 60, [])); if (i % 60 === 59) sp.push(Math.abs(e.vx)); }
  assert.ok(sp[0] >= EN.snowball.speed - 0.01 && sp[3] > sp[0], `speeds up: ${sp.map((v) => v.toFixed(2)).join(' ')}`);
  assert.ok(sp.every((v) => v <= EN.snowball.maxSpeed + 0.01));
  assert.ok(Math.abs(e.x - x0) < 16, 'it stays on its stretch of ground');
  const res = request(w, 'stomp', { id: e.id, mode: 'stomp' }, { key: 'host:0', x: e.x, y: e.y + 1, tool: null });
  assert.ok(res.ok && res.recs[0].t === 'estate' && res.recs[0].st === 'shell', 'a stomp shrinks it');
  feed(w, res.recs);
  const g = request(w, 'grab', { type: 'e', id: e.id }, { key: 'host:0', x: e.x, y: e.y, tool: null });
  assert.ok(g.ok, 'the small snowball can be grabbed'); feed(w, g.recs);
  // thrown into the slush: it freezes it and melts (no berries for it)
  applyRecs(w, [{ t: 'throw', type: 'e', id: e.id, x: 121, y: 3, vx: 9, vy: 4, mode: 'fwd', by: 'host:0', dir: 1 }]);
  let froze = false, melt = null;
  for (let i = 0; i < 400 && !froze; i++) { const recs = stepWorld(w, 1 / 60, []); feed(w, recs); froze = recs.some((r) => r.t === 'freeze'); melt = recs.find((r) => r.t === 'defeat' && r.how === 'melt') || melt; }
  assert.ok(froze && melt && melt.bonus === 0 && e.st === 'dead');
});

// ---- icicles ------------------------------------------------------------------------------------------------------------------------------------------------
test('an icicle wobbles when somebody passes under it, then drops, hurting only while it falls; over a drift it sticks as a plank for a while, elsewhere it shatters', () => {
  const w = createWorld(steps);
  const ic = w.icicles[0], ic2 = w.icicles[2];                                      // x 89.5 over plain ground, x 99.5 over the drift
  const log = (id) => w.icicles[id].st;
  const sim = (actor, secs, only) => { const states = []; for (let i = 0; i < 60 * secs; i++) { const recs = stepWorld(w, 1 / 60, actor ? [actor] : []); feed(w, recs); const s = log(only); if (states[states.length - 1] !== s) states.push(s); } return states; };
  assert.deepEqual(sim(null, 2, 0), ['hang'], 'nobody there: nothing happens');
  assert.deepEqual(sim({ key: 'a', x: 89.2, y: 2 }, 3, 0), ['wobble', 'fall', 'gone']);
  assert.ok(Math.abs(ic.y - 2) < 0.01 || ic.st === 'gone');
  assert.equal(icicleTouches({ st: 'hang', x: 5, y: 3 }, { x: 5, y: 2 }), false);
  assert.equal(icicleTouches({ st: 'fall', x: 5, y: 3 }, { x: 5, y: 2 }), true);
  assert.equal(icicleTouches({ st: 'fall', x: 8, y: 3 }, { x: 5, y: 2 }), false);
  assert.equal(icicleTouches({ st: 'fall', x: 5, y: 7 }, { x: 5, y: 2 }), false, 'high above the head');
  const states = sim({ key: 'a', x: 99.2, y: 2 }, 3, 2);
  assert.deepEqual(states.slice(0, 3), ['wobble', 'fall', 'stuck']);
  assert.equal(w.grid.at(99, 2), 61, 'a one-way plank over the drift'); assert.equal(ic2.st, 'stuck');
  const later = sim(null, SN.icicle.stuckS + 1, 2);
  assert.equal(ic2.st, 'gone'); assert.equal(w.grid.at(99, 2), 46, 'the plank is gone again');
  // the host's 10 Hz packet carries falling icicles; a replica applies them
  const r = createWorld(steps); applyRecs(r, [{ t: 'ice', id: 1, st: 'fall', x: 94.5, y: 8.1 }]);
  const m = { ic: [[1, 5.5, -9]] }; applyMotion(r, m); assert.equal(r.icicles[1].y, 5.5); assert.equal(motion(r).ic.length, 1);
  assert.ok(later.length >= 0);
});

// ---- the sled ------------------------------------------------------------------------------------------------------------------------------------------
const sled = getPage('sled-run');
test('a sled rides by itself, Jump hops (a lower hop), Down ducks under branches, a branch you did not duck is a crash', () => {
  const g = createGrid(['....................................', '....................................', '....................................', '....................................', '....................................', '....................................', '....................................', '####################################']);
  const b = createBody(3, 1); b.grounded = true; for (let i = 0; i < 3; i++) stepBody(g, b, {});
  for (let i = 0; i < 30; i++) stepBody(g, b, { sled: { speed: SN.sled.speed } });
  assert.ok(Math.abs(b.vx - SN.sled.speed) < 0.01, 'auto-run at the sled speed with no input');
  const apex = (input) => { const bb = createBody(3, 1); bb.grounded = true; stepBody(g, bb, {}); stepBody(g, bb, { ...input, jumpPressed: true, jumpHeld: true }); let top = 0; for (let i = 0; i < 80; i++) { stepBody(g, bb, { ...input, jumpHeld: true }); top = Math.max(top, bb.y); } return top; };
  assert.ok(apex({ sled: { speed: SN.sled.speed } }) < apex({}), 'the sled hop is a little lower than the normal jump');
  // ducking
  const d = createBody(3, 1); d.grounded = true; stepBody(g, d, { sled: { speed: SN.sled.speed }, down: true }); assert.equal(d.duck, true);
  const page = { branches: [{ cx: 10, cy: 2 }] };
  const hit = createBody(10.5, 1); hit.duck = false; assert.ok(branchHit(page, hit), 'standing up it hits the branch');
  hit.duck = true; assert.equal(branchHit(page, hit), null, 'ducked it passes under');
  assert.equal(sledAt(sled, 90).x0, 84); assert.equal(sledAt(sled, 83.9), null); assert.equal(sledAt(sled, 150), null);
});

test('every sled track can be finished from its checkpoint by a bot, with the real physics; broken tracks cannot', () => {
  for (const page of PAGES.values()) if (page.sleds.length) { const r = simulateSled(page); assert.equal(r.ok, true, `${page.id}: ${r.reason}`); }
  const rows = sled.rows.map((r) => r.split(''));
  const edit = (fn) => parsePage({ ...sled, rows: (() => { const rr = rows.map((r) => r.slice()); fn(rr); return rr.map((r) => r.join('')); })() });
  const H = rows.length;
  const wide = edit((r) => { for (let x = 118; x <= 125; x++) { r[H - 1][x] = '.'; r[H - 2][x] = '.'; } });
  assert.equal(simulateSled(wide).ok, false, 'an 8 wide gap is too much for a sled hop');
  assert.ok(validatePage(wide).errors.some((e) => e.startsWith('sled run')), 'the validator reports it');
  const noFire = edit((r) => { for (let y = 0; y < H; y++) for (let x = 60; x < 84; x++) if (r[y][x] === 'C') r[y][x] = '.'; });
  assert.equal(simulateSled(noFire).ok, false, 'a sled run needs a checkpoint before it');
  const tall = edit((r) => { r[H - 1 - 3][126] = 'h'; r[H - 1 - 2][126] = '#'; r[H - 1 - 3][127] = '#'; r[H - 1 - 4][126] = '#'; });
  assert.equal(typeof simulateSled(tall).ok, 'boolean');
  assert.equal(typeof sledBot(sled, sled.grid, createBody(90, 2)).jump, 'boolean');
});

// ---- buddies ---------------------------------------------------------------------------------------------------------------------------------------------
test('buddy abilities: super jump, glide, flutter hops and the fox dash (and none of them without a buddy)', () => {
  const g = createGrid([...Array(18).fill('.'.repeat(60)), '#'.repeat(60)]);
  const jump = (buddy, hold = true, extra = {}) => { const b = createBody(5, 1); b.grounded = true; stepBody(g, b, {}); let top = 0, x1 = 0; stepBody(g, b, { buddy, jumpPressed: true, jumpHeld: true }); for (let i = 0; i < 300; i++) { stepBody(g, b, { buddy, move: 1, jumpHeld: hold, jumpPressed: false, ...(extra.fn ? extra.fn(b, i) : {}) }); top = Math.max(top, b.y - 1); if (b.grounded) { x1 = b.x; break; } } return { top, x1, b }; };
  const base = jump(null), sup = jump('super'), gl = jump('glide'), fl = jump('flutter', true, { fn: (b) => ({ jumpPressed: b.vy < -1 && b.hops > 0 }) });
  assert.ok(sup.top > base.top * 1.6, `super apex ${sup.top.toFixed(2)} vs ${base.top.toFixed(2)}`);
  assert.ok(gl.x1 - 5 > (base.x1 - 5) * 2, 'a glide goes much further');
  assert.ok(fl.top > base.top + 2, 'flutter hops climb higher');
  const noHops = createBody(5, 1); noHops.grounded = true; stepBody(g, noHops, { buddy: 'flutter' });
  let n = 0; stepBody(g, noHops, { buddy: 'flutter', jumpPressed: true, jumpHeld: true });
  for (let i = 0; i < 80; i++) { stepBody(g, noHops, { buddy: 'flutter', jumpPressed: noHops.vy < -1 && noHops.hops > 0, jumpHeld: true }); for (const e of noHops.ev) if (e.kind === 'flutter') n++; noHops.ev.length = 0; }
  assert.equal(n, SN.flutter.hops, 'exactly the extra hops, then no more');
  const noBuddy = jump(null, true, { fn: (b) => ({ jumpPressed: b.vy < -1 }) });
  assert.ok(Math.abs(noBuddy.top - base.top) < 0.3, 'without a buddy a second press does nothing');
  const d = createBody(5, 1); d.grounded = true; stepBody(g, d, {}); const e0 = [];
  stepBody(g, d, { buddy: 'dash', dashPressed: true }); e0.push(...d.ev); for (let i = 0; i < 10; i++) stepBody(g, d, { buddy: 'dash' });
  assert.ok(e0.some((e) => e.kind === 'dash') && d.x > 5 + 1.5, 'a dash bursts forward');
  const none = createBody(5, 1); none.grounded = true; stepBody(g, none, {}); stepBody(g, none, { dashPressed: true }); assert.equal(none.dashT, 0, 'no dash without the fox');
  // the limits the validator uses are measured from the same step
  assert.ok(LIMITS.buddy.super.maxUp > LIMITS.maxUp && LIMITS.buddy.flutter.maxUp > LIMITS.maxUp && LIMITS.buddy.glide.reach(0) > LIMITS.maxGap * 2);
});

test('crates hold the fed species when it lives at the camp, else a snow hare with the same ability; riding is a host request', () => {
  const camp = campSpecies({ 'critter-fox-0': { at: 'camp' }, 'critter-fox-1': { at: 'wild' }, 'critter-grouse-1': { at: 'camp' }, 'critter-bear-0': { at: 'camp' }, junk: null });
  assert.deepEqual([...camp].sort(), ['fox', 'grouse']);
  assert.equal(crateSpecies('dash', camp), 'fox'); assert.equal(crateSpecies('glide', camp), HELPER); assert.equal(crateSpecies('flutter', camp), 'grouse'); assert.equal(crateSpecies('super', null), HELPER);
  for (const [a, sp] of Object.entries(SPECIES_OF)) assert.equal(ABILITY_OF[sp], a);
  const none = newCrates(sled, new Set()), some = newCrates(sled, new Set(['squirrel', 'grouse']));
  assert.deepEqual(none.map((c) => c.species), ['hare', 'hare']); assert.deepEqual(some.map((c) => c.species), ['squirrel', 'grouse']);
  assert.deepEqual(none.map((c) => c.ability), ['glide', 'flutter'], 'the ability never depends on the camp: the page stays finishable alone');
  const w = createWorld(sled, { camp: new Set(['squirrel']) });
  const at = { key: 'host:0', x: 33.5, y: 2, tool: null };
  const far = request(w, 'ride', { crate: 0 }, { ...at, x: 60 }); assert.equal(far.ok, false);
  const r = request(w, 'ride', { crate: 0 }, at); assert.ok(r.ok); applyRecs(w, r.recs);
  assert.deepEqual(w.buddies['host:0'], { species: 'squirrel', ability: 'glide', crate: 0 });
  assert.equal(request(w, 'ride', { crate: 0 }, at).ok, false, 'one buddy at a time');
  assert.equal(request(w, 'ride', { crate: 9 }, at).ok, false);
  // a second player takes one of their own
  const r2 = request(w, 'ride', { crate: 0 }, { key: 'b:0', x: 34, y: 2, tool: null }); assert.ok(r2.ok); applyRecs(w, r2.recs);
  assert.equal(Object.keys(w.buddies).length, 2);
  const end = request(w, 'buddyEnd', { why: 'hit' }, at); assert.ok(end.ok); applyRecs(w, end.recs); assert.equal(w.buddies['host:0'], undefined);
  assert.equal(request(w, 'buddyEnd', { why: 'hit' }, at).ok, false, 'nothing to end');
  // the hash and the snapshot carry what each crate holds and who rides what
  const h = JSON.stringify(hashView(w)); assert.ok(h.includes('squirrel') && h.includes('b:0'));
  const w2 = createWorld(sled, { camp: new Set() }); loadSnapshot(w2, JSON.parse(JSON.stringify(snapshot(w))));
  assert.equal(JSON.stringify(hashView(w2)), h, 'a late joiner sees the same world');
});

test('a fox dash breaks a whole snow wall, only with a dash buddy and near it; a snow wall needs a fox crate (or hare) in the validator', () => {
  const w = createWorld(steps, { camp: new Set(['fox']) });
  const wall = [176, 3], me = { key: 'host:0', x: 178, y: 2, tool: null };
  assert.equal(w.grid.kind(...wall), 'J'); assert.equal(w.grid.at(...wall), 35);
  assert.equal(request(w, 'dash', { cx: 176, cy: 3 }, me).ok, false, 'no buddy, no dash');
  applyRecs(w, [{ t: 'buddy', key: 'host:0', species: 'fox', ability: 'dash', crate: 0 }]);
  assert.equal(request(w, 'dash', { cx: 176, cy: 3 }, { ...me, x: 150 }).ok, false, 'too far');
  assert.equal(request(w, 'dash', { cx: 100, cy: 3 }, me).ok, false, 'not a snow wall');
  const r = request(w, 'dash', { cx: 176, cy: 3 }, me); assert.ok(r.ok);
  applyRecs(w, r.recs);
  for (const y of [2, 3, 4, 5]) assert.equal(w.grid.kind(176, y), y === 5 ? '.' : '.', `snow wall cell ${y} is open`);
  assert.equal(w.grid.at(176, 4), 46);
  // the validator: without the crate the wall can never be broken, with the crate AFTER it neither
  const rows = steps.rows.map((r) => r.split('')), H = rows.length;
  const make = (fn, meta = {}) => { const rr = rows.map((r) => r.slice()); fn(rr); return parsePage({ ...steps, ...meta, rows: rr.map((r) => r.join('')) }); };
  const no = validatePage(make((r) => { for (let y = 0; y < H; y++) for (let x = 0; x < r[0].length; x++) if (r[y][x] === 'Y') r[y][x] = '.'; }, { buddies: [] }));
  assert.equal(no.ok, false); assert.ok(no.errors.some((e) => e.includes('snow wall') && e.includes('crate')), no.errors.slice(0, 2).join(' / '));
  const late = validatePage(make((r) => { r[H - 1 - 2][150] = '.'; r[H - 1 - 2][185] = 'Y'; }));
  assert.equal(late.ok, false, 'a crate after the wall does not help');
  const gated = make((r) => {}, { buddyGates: [160] });
  assert.equal(validatePage(gated).ok, false, 'a buddy gate between the crate and the wall ends the buddy first');
});

// ---- the pages -----------------------------------------------------------------------------------------------------------------------------------------
test('the Frostpine pages are solo-completable: crates are reachable first, slush needs a reachable snowball pile, and the frost bloom only ever opens an optional flower', () => {
  const ids = ['snowy-steps', 'sled-run', 'aurora-night'];
  for (const id of ids) {
    const page = getPage(id), v = validatePage(page);
    assert.equal(v.ok, true, `${id}: ${v.errors.join('; ')}`);
    assert.equal(page.theme, 'snow'); assert.equal(page.letters.length, 5); assert.equal(page.flowers.length, 3);
    assert.ok(page.campfires.length >= 3 && page.berries.length >= 60);
    assert.ok(page.crates.every((c, i) => c.ability === page.buddies[i]));
  }
  assert.ok(validatePage(getPage('snowy-steps')).stats.slush === 1 && getPage('snowy-steps').crates.length === 1);
  assert.equal(getPage('sled-run').sleds.length, 1);
  // slush with no snowball pile is a wall; a pile on the far side of it does not help
  const rows = steps.rows.map((r) => r.split('')), H = rows.length;
  const make = (fn) => { const rr = rows.map((r) => r.slice()); fn(rr); return parsePage({ ...steps, rows: rr.map((r) => r.join('')) }); };
  const noPile = validatePage(make((r) => { for (let y = 0; y < H; y++) for (let x = 0; x < r[0].length; x++) if (r[y][x] === 'z') r[y][x] = '.'; }));
  assert.equal(noPile.ok, false, 'without a snowball the slush pool cannot be crossed');
  const farPile = validatePage(make((r) => { for (let y = 0; y < H; y++) for (let x = 0; x < r[0].length; x++) if (r[y][x] === 'z') r[y][x] = '.'; r[H - 1 - 2][140] = 'z'; }));
  assert.equal(farPile.ok, false, 'a pile past the pool is not reachable before it');
  // Aurora Night: the underpass flower is not reachable on foot; frozen slush (the bloom) opens it within its time budget
  const au = getPage('aurora-night'), solved = solveGates(au);
  assert.equal(solved.slushLeft.length, 1, 'no snowball pile there: only the frost bloom freezes this slush');
  const virtual = moverCells(au), g0 = buildGraph({ ...au, grid: solved.grid, virtual, enabledZones: solved.zones }), startI = g0.id(Math.floor(au.start.x), Math.floor(au.start.y));
  const seen = (G, from) => { const s = new Uint8Array(G.cells.length), q = [from]; s[from] = 1; for (let h = 0; h < q.length; h++) for (const n of G.adj[q[h]]) if (!s[n]) { s[n] = 1; q.push(n); } return s; };
  const flower = au.flowers.find((f) => f.x > 120 && f.x < 126), fi = g0.id(Math.floor(flower.x), Math.floor(flower.y) - 1);
  assert.ok(fi !== undefined, 'the flower stands on a ledge');
  const gFull = cloneGrid(solved.grid); for (const q of solved.slushLeft) for (let x = q.x0; x <= q.x1; x++) setTile(gFull, x, q.row, 'I');
  const g1 = buildGraph({ ...au, grid: gFull, virtual, enabledZones: solved.zones });
  const reachedNo = seen(g0, startI)[fi], reachedIce = seen(g1, g1.id(Math.floor(au.start.x), Math.floor(au.start.y)))[g1.id(Math.floor(flower.x), Math.floor(flower.y) - 1)];
  assert.equal(!!reachedNo, false, 'not reachable without the bloom'); assert.equal(!!reachedIce, true, 'reachable over the ice');
  assert.ok(au.frostBloom && au.bloom && au.nightLook > 0.5 && au.aurora);
});

test('every Frostpine page needs the right buddy: a crate whose ability is wrong for the gap fails the validator', () => {
  const rows = getPage('sled-run').rows.map((r) => r.split('')), H = rows.length;
  const swapped = parsePage({ ...getPage('sled-run'), buddies: ['flutter', 'flutter'], rows: rows.map((r) => r.join('')) });
  const v = validatePage(swapped);
  assert.equal(v.ok, false, 'a flutter cannot cross the 12 wide chasm');
  assert.ok(abilityZones(getPage('sled-run')).length === 2);
  const aur = getPage('aurora-night'); assert.ok(abilityZones(aur)[0].ability === 'super' && abilityZones(aur)[0].x1 === 106);
});

// ---- chapter, reward, saves -------------------------------------------------------------------------------------------------------------------------------
test('the Frostpine chapter gates its pages in order, rewards once and pops up the snow globe; old saves load', () => {
  const ch = CHAPTERS.find((c) => c.id === 'frostpine');
  assert.deepEqual(ch.pages, ['snowy-steps', 'sled-run', 'aurora-night']); assert.equal(ch.soon, undefined);
  let progress = normaliseProgress(null, PAGES);
  assert.deepEqual(chapterEntries(progress, ch).map((e) => e.open), [true, false, false], 'the first page is always open (the Cay needs both bridges)');
  assert.equal(pageOpen(progress, 'sled-run'), false);
  const clear = (p, id, letters = LETTERS) => mergeClear(p, getPage(id), { berries: [], letters: [...letters], fires: [0], flowers: [], cleared: true, secret: false, bloom: null });
  progress = clear(progress, 'snowy-steps'); assert.equal(pageOpen(progress, 'sled-run'), true); assert.equal(pageOpen(progress, 'aurora-night'), false);
  progress = clear(progress, 'sled-run'); progress = clear(progress, 'aurora-night', LETTERS.slice(0, 4));
  assert.equal(chapterBadge(progress, ch), false); assert.equal(rewardDue(progress, ch), false);
  progress = clear(progress, 'aurora-night');
  assert.equal(chapterBadge(progress, ch), true); assert.equal(rewardDue(progress, ch), true);
  progress = { ...progress, rewards: { ...progress.rewards, frostpine: true } };
  assert.equal(rewardDue(progress, ch), false, 'the reward is given once'); assert.equal(popupsOf(progress).snowglobe, true); assert.equal(popupsOf(progress).sunflower, false);
  const back = normaliseProgress(JSON.parse(JSON.stringify(progress)), PAGES); assert.equal(rewardDue(back, ch), false); assert.equal(popupsOf(back).snowglobe, true);
  assert.deepEqual(normaliseProgress({ v: 1, pages: { 'orchard-hop': { cleared: true, letters: ['F'] } } }, PAGES).pages['snowy-steps'], undefined, 'an old save has no Frostpine entries and loads');
  const sets = stickerSets(progress, PAGES);
  assert.deepEqual(sets.map((s) => s.chapter), ['meadow', 'frostpine', 'emberleaf']); const fs = sets[1];
  assert.equal(fs.badge, true); assert.equal(fs.cards.length, 3); assert.equal(fs.lettersTotal, 15); assert.ok(fs.cards.every((c) => c.icon && !c.bonus));
  const items = CHAPTER_REWARDS.frostpine;
  assert.ok(Object.keys(items).every((id) => getItem(id)), 'the reward is made of catalog items'); assert.ok(Object.values(items).reduce((a, b) => a + b, 0) <= 12, 'a capped bundle');
  assert.ok(itemName('lingonberry', 5));
});

test('pose bits: sled and duck round-trip and old packets decode as off', () => {
  const bits = packPageBits({ sled: true, duck: true, twirl: true, puff: 'pit' }), u = unpackPageBits(bits);
  assert.deepEqual([u.sled, u.duck, u.twirl, u.puff], [true, true, true, 'pit']);
  assert.deepEqual(unpackPageBits(0), { carryObj: false, carryFriend: false, carried: false, twirl: false, puff: 'none', sled: false, duck: false, vine: false, cannon: false });
});

test('Paper Snow is a complete sleigh-bell arrangement on its own page playlist', () => {
  const t = getTrack(13);
  assert.equal(t.def.title, 'Paper Snow'); assert.equal(trackInfo()[13].bars, 32); assert.ok(trackInfo()[13].seconds > 70 && trackInfo()[13].seconds < 95);
  assert.deepEqual(REGION_TRACKS['page-frost'], [13]); assert.deepEqual(REGION_TRACKS.page, [12]); assert.equal(new Set(TRACK_TITLES).size, TRACK_TITLES.length);
  for (const k of ['pad', 'bass', 'ep', 'bell', 'kick', 'shaker', 'click', 'lead']) assert.ok(t.events.some((e) => e.k === k), `${k} plays`);
  for (const e of t.events) { assert.ok(e.s >= 0 && e.s < t.steps && e.d > 0 && Number.isFinite(e.v) && e.v > 0 && e.v <= 0.4); assert.ok((Array.isArray(e.m) ? e.m : [e.m]).every(Number.isFinite)); }
  assert.notDeepEqual(t.events, getTrack(12).events);
  const melody = (tr) => JSON.stringify(tr.events.filter((e) => e.k === 'bell').map((e) => [e.s, e.m]));
  assert.notEqual(melody(t), melody(getTrack(12)), 'its own tune');
  assert.ok(t.events.filter((e) => e.k === 'shaker').length >= 200, 'the sleigh bells run every 8th');
});
