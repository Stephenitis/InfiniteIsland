// Emberleaf Canopy (Step 53a): vine swings, coconut cannons, the canoe river, rising lava, the Volcano Spirit, the chapter and its pages. Pure rules only (no three.js / DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrid, createBody, stepBody, LIMITS } from '../public/js/game/platformerLogic.js';
import { PAGE_JUNGLE as J, PAGE_BOSS as BC, PLATFORMER as P, CHAPTER_REWARDS } from '../public/js/config.js';
import { parsePage, validatePage } from '../public/js/game/pageFormat.js';
import { getPage, PAGES } from '../public/js/game/pages/index.js';
import {
  vineGrab, swingStart, swingStep, swingBody, swingRelease, swingBlocked, swingBotMove, vineOutcomes, flight, cannonAngle, cannonShot, cannonAutoAt, cannonLoads, cannonOutcomes,
  canoeCenter, canoeDocked, canoeStarted, canoeHeads, canoeHazard, canoeWind, canoeIdle, canoeBoardable, simulateCanoe, lavaLevel, lavaStart, lavaFires, lavaTouches, lavaNorm, lavaClimb,
} from '../public/js/game/pageJungleLogic.js';
import { newBoss, stepBoss, applyBossRec, bossRect, bossHot, bossCooled, bossDead, stompBoss, coconutHitsBoss, volleySize, idleTime, bossSnapshot, bossLoad, bossHash, tickBossClocks } from '../public/js/game/pageBossLogic.js';
import { createWorld, request, applyRecs, stepWorld, snapshot, loadSnapshot, hashView, extrapolate } from '../public/js/game/pageWorldLogic.js';
import { CHAPTERS, chapterEntries, chapterBadge, rewardDue, popupsOf, stickerSets, pageOpen, secretUnlocked } from '../public/js/game/chapters.js';
import {
  normaliseProgress, mergeClear, LETTERS, freshRun, normaliseRun, runView, applyCollect, validateCollect, validateCanoe, validateLava, freshState, applyEnter, pageToWorld, PAGE, progressView,
} from '../public/js/game/storybookLogic.js';
import { packPageBits, unpackPageBits } from '../public/js/game/pageCoopLogic.js';
import { getTrack, trackInfo, REGION_TRACKS, TRACK_TITLES } from '../public/js/audio/music.js';
import { getItem, itemName } from '../public/js/game/catalog.js';

const open = (n = 30, floor = 2) => { const rows = Array.from({ length: n }, () => '.'.repeat(80)); for (let i = 0; i < floor; i++) rows.push('#'.repeat(80)); return createGrid(rows); };
const climb = () => getPage('canopy-climb'), river = () => getPage('river-run'), lavaPage = () => getPage('lava-rise'), bossPage = () => getPage('volcano-spirit'), spring = () => getPage('hot-spring');
const copy = (page, edit) => { const rows = page.rows.map((r) => r.split('')); edit(rows); return parsePage({ ...page, rows: rows.map((r) => r.join('')) }); };

// ---- vines ----------------------------------------------------------------------------------------------------------------------------------------
test('a vine is grabbed by a hand on the rope and keeps the momentum of the jump', () => {
  const v = { x: 20.5, y: 15, len: 7 };
  const ok = { x: 20.3, y: 15 - 5 - J.vine.hand, vx: 6, vy: 2 };                       // the hand 5 tiles down the rope, a little left of it
  assert.ok(Math.abs(vineGrab(v, ok) - 5) < 1e-9, 'grabs at the length of the hand');
  assert.equal(vineGrab(v, { ...ok, x: 21.3 }), null, 'a hand a whole tile off the rope misses');
  assert.equal(vineGrab(v, { ...ok, y: 15 - 0.9 - J.vine.hand }), null, 'above minLen: too close to the bough');
  assert.equal(vineGrab(v, { ...ok, y: 15 - 9 - J.vine.hand }), null, 'below the rope\'s end');
  const sw = swingStart(v, 0, ok), b = swingBody(v, sw);
  assert.ok(Math.abs(b.x - ok.x) < 0.02 && Math.abs(b.y - ok.y) < 0.02, 'the body stays where it grabbed');
  assert.ok(sw.w > 0, 'a body moving right swings right');
  assert.ok(Math.hypot(b.vx, b.vy) <= Math.hypot(ok.vx, ok.vy) + 1e-9 && Math.hypot(b.vx, b.vy) > 4, 'the tangential part of the speed survives');
});

test('the pendulum is deterministic, the stick pumps it up to a cap, and it never runs away', () => {
  const v = { x: 20.5, y: 15, len: 7 };
  const run = (move, secs = 8) => { const sw = { i: 0, len: 7, th: 0.1, w: 0.4, t: 0 }; let max = 0, top = 0; for (let i = 0; i < 60 * secs; i++) { swingStep(sw, typeof move === 'function' ? move(sw) : move, P.step); max = Math.max(max, Math.abs(sw.th)); top = Math.max(top, Math.hypot(swingBody(v, sw).vx, swingBody(v, sw).vy)); } return { sw, max, top }; };
  const a = run((sw) => swingBotMove(sw)), b = run((sw) => swingBotMove(sw));
  assert.deepEqual(a.sw, b.sw, 'the same inputs give the same swing');
  const idle = run(0);
  assert.ok(idle.sw.th !== 0 && Math.abs(idle.sw.w) < 0.4, 'left alone the swing dies down slowly');
  assert.ok(a.max > 0.8 * J.vine.maxAng && a.max <= J.vine.maxAng + 1e-9, `a pumping bot reaches the cap (${a.max.toFixed(2)})`);
  assert.ok(a.top < 16, `the swing never gets crazy fast (${a.top.toFixed(1)} u/s)`);
  const held = run(1);                                                           // holding one direction forever cannot pin the rope up at its cap
  assert.ok(held.max < J.vine.maxAng, 'a constant push only leans the swing');
});

test('Jump lets go with the swing\'s speed: a release arc lands where the pendulum is pointing, and walls end a swing', () => {
  const v = { x: 20.5, y: 15, len: 7 }, g = open(), sw = { i: 0, len: 7, th: 0.1, w: 0.4, t: 0 };
  for (let i = 0; i < 150; i++) swingStep(sw, swingBotMove(sw), P.step);
  const r = swingRelease(v, sw), b = swingBody(v, sw);
  assert.ok(Math.abs(r.vx - b.vx * J.vine.boost) < 1e-9 && Math.abs(r.vy - (b.vy * J.vine.boost + J.vine.up)) < 1e-9, 'the release velocity is the swing\'s plus a little hop');
  const out = flight(g, r.x, r.y, r.vx, r.vy, { steer: true });
  assert.equal(out.kind, 'land');
  assert.ok(Math.sign(out.x - v.x) === Math.sign(r.vx) || Math.abs(r.vx) < 1, 'it flies the way it was swinging');
  const wall = createGrid(['....#....', '....#....', '....#....', '....#....', '....#....', '....#....', '....#....', '....#....', '....#....', '.........', '#########']);
  assert.equal(swingBlocked(wall, { x: 2.5, y: 12, len: 6 }, { i: 0, len: 6, th: 0, w: 0, t: 0 }), false, 'hanging beside the wall is fine');
  assert.equal(swingBlocked(wall, { x: 4.5, y: 12, len: 6 }, { i: 0, len: 6, th: 0, w: 0, t: 0 }), true, 'a body inside the wall is blocked');
});

test('a vine page is a launch node for the validator: the release arcs a bot can make land on the far ledge, and the page needs them', () => {
  const p = climb(), o = vineOutcomes(p, 0);
  assert.ok(o.lands.some((l) => l.cx >= 42 && l.cx <= 46 && l.cy === 5), 'a release lands on the landing ledge');
  assert.ok(o.lands.some((l) => l.cx <= 34), 'and some come back to the take-off ledge: a swing is never a one-way trap');
  assert.ok(o.paths.length > 5 && o.pits >= 0);
  const broken = copy(p, (rows) => { for (let y = 0; y < rows.length; y++) for (let x = 42; x <= 48; x++) if (y >= rows.length - 5 && rows[y][x] === '#') rows[y][x] = '.'; });   // the landing ledge's first columns are gone: the vine cannot reach the rest
  const v = validatePage(broken);
  assert.ok(!v.ok && v.errors.some((e) => /cannot be reached/.test(e)), v.errors.join('; '));
});

// ---- cannons ---------------------------------------------------------------------------------------------------------------------------------------
test('cannons: fixed / auto barrels stand still, a spin barrel sweeps its arc on the page clock, a shot leaves along the barrel at the cannon speed', () => {
  const fixed = { x: 10.5, y: 7.7, mode: 'fixed', a0: 55 }, auto = { ...fixed, mode: 'auto', delay: 1.1 }, spin = { ...fixed, mode: 'spin', a0: 40, a1: 70, period: 4 };
  for (const t of [0, 1.3, 77]) assert.ok(Math.abs(cannonAngle(fixed, t) - (55 * Math.PI) / 180) < 1e-12);
  assert.ok(Math.abs(cannonAngle(spin, 0) - (40 * Math.PI) / 180) < 1e-9, 'a spin cannon starts at a0');
  assert.ok(Math.abs(cannonAngle(spin, 2) - (70 * Math.PI) / 180) < 1e-9, 'half a period later it is at a1');
  assert.ok(Math.abs(cannonAngle(spin, 4) - cannonAngle(spin, 0)) < 1e-9, 'and it repeats every period');
  const sh = cannonShot(fixed, 0);
  assert.ok(Math.abs(Math.hypot(sh.vx, sh.vy) - J.cannon.speed) < 1e-9 && sh.vx > 0 && sh.vy > 0);
  assert.ok(Math.abs(sh.y + 0.7 - fixed.y) < 1e-12 && sh.x === fixed.x, 'the body\'s middle is the barrel\'s middle');
  assert.equal(cannonAutoAt(fixed), null); assert.equal(cannonAutoAt(auto), 1.1); assert.equal(cannonAutoAt({ ...auto, delay: undefined }), J.cannon.auto);
  assert.ok(cannonLoads(fixed, { x: 10.5, y: 7.0 }) && cannonLoads(fixed, { x: 11.2, y: 7.0 }) && !cannonLoads(fixed, { x: 12.0, y: 7.0 }));
});

test('a shot is ballistic: it keeps its horizontal speed in the air (no air friction, no steering) and lands where the validator says', () => {
  const g = open(), c = { x: 10.5, y: 7.7, mode: 'fixed', a0: 50 }, sh = cannonShot(c, 0);
  const fly = (ballistic) => { const b = createBody(sh.x, sh.y); b.vx = sh.vx; b.vy = sh.vy; b.grounded = false; let n = 0; while (!b.grounded && n++ < 300) stepBody(g, b, { move: 0, ballistic }); return b; };
  const a = fly(true), b = fly(false);
  assert.ok(a.x - sh.x > b.x - sh.x + 3, `ballistic ${(a.x - sh.x).toFixed(1)} vs braked ${(b.x - sh.x).toFixed(1)}`);
  const o = flight(g, sh.x, sh.y, sh.vx, sh.vy, { ballistic: true });
  assert.equal(o.kind, 'land'); assert.ok(Math.abs(o.x - a.x) < 1e-9, 'flight() is the same physics');
  const again = flight(g, sh.x, sh.y, sh.vx, sh.vy, { ballistic: true });
  assert.deepEqual(o.path, again.path, 'deterministic');
});

test('every aim a spinning cannon passes lands on safe ground, a chain links through the next cannon\'s mouth, and a mistimed shot is only ever a puff', () => {
  const p = climb(), spin = cannonOutcomes(p, 1);
  assert.equal(spin.pits, 0, 'no aim of the spinning cannon drops into the pit');
  assert.ok(spin.lands.length >= 4 && spin.lands.every((l) => l.cy === 6 && l.cx >= 94 && l.cx <= 112), `lands on the far ledge: ${spin.lands.map((l) => l.cx).join(' ')}`);
  const hs = spring(), chain = cannonOutcomes(hs, 0);
  assert.ok(chain.links.some((l) => l.type === 'cannon' && l.i === 1), 'the first cannon\'s arc flies through the second one');
  assert.ok(cannonOutcomes(hs, 1).lands.length >= 1);
  // a broken page: the cannon shoots into a pit, so everything behind it is out of reach and the validator says what it cannot reach
  const bad = copy(p, (rows) => { for (let y = 0; y < rows.length; y++) for (let x = 71; x <= 86; x++) if (y >= rows.length - 6 && rows[y][x] === '#') rows[y][x] = '.'; });
  const v = validatePage(bad);
  assert.ok(!v.ok && v.errors.some((e) => /cannot be reached/.test(e)), v.errors.join('; '));
});

// ---- the canoe -------------------------------------------------------------------------------------------------------------------------------------
test('the canoe waits at the west bank, drifts at its speed once started, docks at the east bank and never runs on the clock alone', () => {
  const c = river().canoes[0], half = J.canoe.half, start = c.x0 + half, end = c.x1 - half;
  assert.equal(canoeCenter(c, null, 99, 0), start, 'parked until somebody boards');
  assert.equal(canoeCenter(c, { canoe: null }, 99, 0), start);
  const run = { canoe: { i: 0, t0: 10 } };
  assert.equal(canoeCenter(c, run, 10, 0), start); assert.ok(Math.abs(canoeCenter(c, run, 20, 0) - (start + 10 * J.canoe.speed)) < 1e-9);
  assert.equal(canoeCenter(c, run, 1e6, 0), end); assert.ok(canoeDocked(c, run, 1e6, 0) && !canoeDocked(c, run, 12, 0) && !canoeDocked(c, null, 1e6, 0));
  assert.equal(canoeCenter(c, { canoe: { i: 1, t0: 0 } }, 50, 0), start, 'another river\'s trip does not move this one');
  const heads = canoeHeads(river(), run, 20);
  assert.equal(heads.length, 1); assert.deepEqual([heads[0].id, heads[0].top, heads[0].half, heads[0].solid], ['canoe0', c.y, half, true]);
  assert.ok(canoeStarted(run, 0) && !canoeStarted(null, 0) && !canoeStarted(run, 1));
  assert.ok(J.canoe.speed <= 3.4, 'a calm ride');
});

test('logs and boughs hurt a rider who does not jump or duck, and riders keep the canoe\'s speed in the air', () => {
  const c = { x0: 56, x1: 116, y: 3, logs: [70], branches: [90] };
  const body = (x, y, duck = false) => ({ x, y, duck });
  assert.equal(canoeHazard(c, body(70, 3)), 'log'); assert.equal(canoeHazard(c, body(70, 3.7)), null, 'a jump clears the log');
  assert.equal(canoeHazard(c, body(68.5, 3)), null, 'a metre away is fine');
  assert.equal(canoeHazard(c, body(90, 3)), 'branch'); assert.equal(canoeHazard(c, body(90, 3, true)), null, 'ducking passes under the bough');
  assert.equal(canoeHazard(c, body(120, 3)), null, 'nothing over the bank');
  const run = { canoe: { i: 0, t0: 0 } }, pg = { canoes: [c] };
  assert.equal(canoeWind(pg, run, 5, { x: 56 + J.canoe.half + 15 * 1 + 0, y: 4 }), J.canoe.speed === 0 ? 0 : canoeWind(pg, run, 5, { x: 56 + J.canoe.half + 15, y: 4 }));
  const ctr = canoeCenter(c, run, 5, 0);
  assert.equal(canoeWind(pg, run, 5, { x: ctr, y: 4 }), J.canoe.speed, 'a body hopping over the deck is carried along');
  assert.equal(canoeWind(pg, run, 5, { x: ctr + 12, y: 4 }), 0, 'but not one far away'); assert.equal(canoeWind(pg, null, 5, { x: ctr, y: 4 }), 0, 'nor while the canoe is parked');
  assert.ok(canoeBoardable(c, null, 0, 0, { x: 57.7, y: 3 }) && !canoeBoardable(c, run, 0, 0, { x: 57.7, y: 3 }) && !canoeBoardable(c, null, 0, 0, { x: 70, y: 3 }));
});

test('the host puts a canoe back when nobody is near it, never one that docked or was never started', () => {
  const c = { x0: 56, x1: 116, y: 3 }, run = { canoe: { i: 0, t0: 0 } };
  let idle = 0, out = 0;
  for (let t = 0; t < 12 && out >= 0; t += 0.5) { out = canoeIdle(c, run, 5, 0, [{ x: 40 }], idle, 0.5); if (out >= 0) idle = out; }
  assert.equal(out, -1, 'a river with nobody near it resets');
  assert.equal(canoeIdle(c, run, 5, 0, [{ x: canoeCenter(c, run, 5, 0) + 1 }], 4.5, 0.5), 0, 'a rider keeps it going and clears the timer');
  assert.equal(canoeIdle(c, run, 1e6, 0, [], 99, 0.5), 0, 'docked: never put back'); assert.equal(canoeIdle(c, null, 5, 0, [], 99, 0.5), 0);
});

test('a bot rides the River Run canoe with the real physics (jumping logs, ducking boughs); a river nobody can finish fails clearly', () => {
  const p = river(), r = simulateCanoe(p, p.canoes[0], 0);
  assert.equal(r.ok, true, r.reason); assert.ok(r.steps > 60 * 10 && r.steps < 60 * 40, `${r.steps} steps`);
  const crowded = { ...p, canoes: [{ ...p.canoes[0], logs: [65, 65.8, 66.6, 67.4, 89, 106] }] };
  const bad = simulateCanoe(crowded, crowded.canoes[0], 0);
  assert.equal(bad.ok, false); assert.match(bad.reason, /log|bough|fell/);
  const v = validatePage(copy(p, () => {}) && { ...p, canoes: [{ ...p.canoes[0], logs: [65, 68, 89], branches: [] }] });
  assert.ok(!v.ok && v.errors.some((e) => /less than 7 tiles apart/.test(e)), v.errors.join('; '));
  const letter = copy(p, (rows) => { rows[rows.length - 1 - 8][80] = 'f'; rows[rows.length - 1 - 6][13] = '.'; });
  assert.ok(validatePage(letter).errors.some((e) => /sits over the river|letters must be exactly/.test(e)), 'a letter over the river is refused');
});

// ---- rising lava ------------------------------------------------------------------------------------------------------------------------------------
test('lava starts under a campfire, rises at its rate, is capped, starts over under the next fire and only burns inside its shaft', () => {
  const p = lavaPage(), lv = p.lava, fire = p.campfires[lv.from];
  assert.equal(lavaLevel(lv, null, 50), null, 'not started: nothing');
  const st = lavaStart(lv, fire, 10);
  assert.equal(st.base, fire.y - J.lava.gap); assert.equal(st.t0, 10);
  assert.equal(lavaLevel(lv, st, 10), st.base); assert.ok(Math.abs(lavaLevel(lv, st, 30) - (st.base + 20 * J.lava.rate)) < 1e-9);
  assert.equal(lavaLevel(lv, st, 1e6), lv.top, 'capped at the top of the page');
  assert.ok(lavaFires(lv, lv.from) && lavaFires(lv, lv.to) && !lavaFires(lv, lv.from - 1) && !lavaFires(lv, lv.to + 1));
  assert.ok(lavaTouches(lv, { x: lv.x0 + 3, y: 5 }, 6) && !lavaTouches(lv, { x: lv.x0 + 3, y: 6.5 }, 6) && !lavaTouches(lv, { x: lv.x0 - 3, y: 1 }, 6) && !lavaTouches(lv, { x: lv.x1 + 3, y: 1 }, 6) && !lavaTouches(lv, { x: lv.x0 + 3, y: 1 }, null));
  assert.equal(lavaNorm({ t0: 'x', base: 1 }), null); assert.deepEqual(lavaNorm({ t0: 1.234, base: -5 }), { t0: 1.23, base: -5 });
  assert.ok(J.lava.rate <= 0.6 && J.lava.gap >= 6, 'generous: a slow rise with a long head start');
});

test('a calm half-speed climb stays above the lava on Lava Rise, and the validator refuses a page whose lava is too fast', () => {
  const p = lavaPage(), v = validatePage(p);
  assert.ok(v.ok, v.errors.join('; '));
  const save = J.lava.rate;
  try { J.lava.rate = 2.4; const bad = validatePage(lavaPage()); assert.ok(!bad.ok && bad.errors.some((e) => /caught by the lava/.test(e)), bad.errors.join('; ')); } finally { J.lava.rate = save; }
  assert.ok(validatePage(lavaPage()).ok, 'back to normal');
  assert.deepEqual(lavaClimb({ lava: null }, null, null), { ok: true, worst: Infinity }, 'no lava, nothing to check');
});

// ---- the Volcano Spirit ----------------------------------------------------------------------------------------------------------------------------
const bossWorld = () => createWorld(bossPage());
const tickBoss = (w, secs, actors, hit = null) => {
  const recs = [], log = [];
  for (let i = 0; i < Math.round(secs * 60); i++) { const r = stepWorld(w, 1 / 60, actors, {}); if (r.length) { applyRecs(w, r); recs.push(...r); } if (hit) hit(w, recs); }
  return { recs, log };
};
test('the Volcano Spirit sleeps until somebody comes near, then goes idle -> lob -> sink -> cooled -> rise, in a calm rhythm', () => {
  const w = bossWorld(), b = w.boss;
  assert.equal(b.st, 'sleep'); assert.equal(b.hp, BC.hp);
  tickBoss(w, 5, [{ key: 'a', x: b.x - BC.wake - 3, y: 4 }]); assert.equal(b.st, 'sleep', 'far away: it sleeps');
  const seen = [], recs = tickBoss(w, 30, [{ key: 'a', x: b.x - 12, y: 4 }]).recs;
  for (const r of recs) if (r.t === 'boss' && seen[seen.length - 1] !== r.st) seen.push(r.st);
  assert.deepEqual(seen.slice(0, 6), ['idle', 'lob', 'sink', 'cooled', 'rise', 'idle']);
  const cooled = recs.findIndex((r) => r.t === 'boss' && r.st === 'cooled');
  assert.ok(cooled > 0);
  assert.ok(BC.cooled >= 8 && BC.flight >= 1.5, 'a long cooled window and a long warning');
});

test('lava globs aim near the players, show for the whole flight, land on the ground under them and splash', () => {
  const w = bossWorld(), b = w.boss, actors = [{ key: 'a', x: b.x - 11, y: 3 }];
  const { recs } = tickBoss(w, 9, actors);
  const spawn = recs.filter((r) => r.t === 'globs'), land = recs.filter((r) => r.t === 'globland');
  assert.ok(spawn.length >= 2 && land.length >= 2, 'a volley of globs, each landing');
  const g0 = spawn[0].list[0];
  assert.ok(Math.abs(g0.tx - actors[0].x) <= BC.spread + 0.6, 'aimed at the player (with a spread)');
  assert.ok(g0.tx >= b.arena0 + 1.5 && g0.tx <= b.arena1, 'inside the arena');
  assert.equal(g0.dur, BC.flight); assert.ok(Math.abs(g0.ty - 3) < 1e-6, 'its shadow sits on the arena floor');
  const l0 = land.find((r) => r.id === g0.id);
  assert.ok(Math.abs(l0.x - g0.tx) < 1e-9 && Math.abs(l0.y - g0.ty) < 1e-9);
  assert.equal(w.boss.globs.filter((g) => g.age >= g.dur).length, 0, 'a landed glob is gone');
});

test('three hits win: a stomp on the cooled crust or a thrown coconut; a hot body bounces coconuts and cannot be stomped; solo wins with patience', () => {
  const w = bossWorld(), b = w.boss, me = { key: 'a', x: b.x - 3.5, y: b.y + 2.0 };
  assert.deepEqual(request(w, 'bosshit', { mode: 'stomp' }, me), { ok: false, reason: 'gone' }, 'asleep: nothing to stomp');
  assert.equal(coconutHitsBoss(b, { x: b.x, y: b.y + 0.5 }), null, 'a sleeping spirit ignores coconuts');
  tickBoss(w, 1.5, [{ key: 'a', x: b.x - 12, y: 3 }]);
  assert.ok(bossHot(b) && !bossCooled(b));
  assert.equal(coconutHitsBoss(b, { x: b.x, y: b.y + 1 }), 'bounce'); assert.equal(request(w, 'bosshit', { mode: 'stomp' }, me).ok, false);
  let hits = 0, t = 0;
  while (!bossDead(b) && t < 150) {                                              // the scripted solo player: wait for the crust to cool, then land a hit; a coconut flies in for the second
    tickBoss(w, 0.25, [{ key: 'a', x: b.x - 12, y: 3 }]); t += 0.25;
    if (bossCooled(b) && b.t > 1) {
      if (hits === 1) { const o = { id: 900 + hits, kind: 'fruit', x: b.x - 2.2, y: b.y + 1, vx: 14, vy: 3, st: 'air', home: { x: 0, y: 0 } }; applyRecs(w, [{ t: 'spawn', objects: [o] }]); let hit = false; for (let k = 0; k < 40 && !hit; k++) { const r = stepWorld(w, 1 / 60, [], {}); applyRecs(w, r); hit = r.some((q) => q.t === 'boss' && q.st === 'hurt'); } assert.ok(hit, 'the coconut hit'); hits++; }
      else { const res = request(w, 'bosshit', { mode: 'stomp' }, me); assert.ok(res.ok, JSON.stringify(res)); applyRecs(w, res.recs); hits++; }
      assert.equal(b.hp, Math.max(0, BC.hp - hits));
    }
  }
  assert.ok(bossDead(b) && hits === BC.hp, `won in ${t.toFixed(0)} s with ${hits} hits`);
  assert.ok(w.bonus >= 8, 'a reward of berries'); assert.deepEqual(b.globs, []);
  assert.equal(stompBoss(b, me), null, 'nothing left to stomp');
});

test('a bigger party gets a few more globs and a shorter warning, a hurt spirit gets angrier, and a solo player is never worse off', () => {
  const b = newBoss({ x: 125, y: 4, arena0: 108 });
  for (let n = 1; n <= 4; n++) { assert.ok(volleySize(b, 1) <= volleySize(b, n)); assert.ok(idleTime(1) >= idleTime(n)); assert.ok(volleySize(b, n) <= BC.globsMax && idleTime(n) >= BC.idleMin); }
  assert.ok(volleySize(b, 4) > volleySize(b, 1) && idleTime(4) < idleTime(1));
  assert.equal(volleySize(b, 1), BC.globsBase, 'solo: the gentle opening volley');
  b.hp = 1; assert.ok(volleySize(b, 1) > BC.globsBase, 'a wounded spirit throws one more');
  assert.ok(volleySize(b, 1) <= BC.globsMax);
});

test('the spirit is part of the synced page world: a replica applying the same recs, and a late joiner, end up equal', () => {
  const host = bossWorld(), rep = bossWorld(), actors = [{ key: 'a', x: 113, y: 3 }];
  for (let i = 0; i < 60 * 14; i++) { const r = stepWorld(host, 1 / 60, actors, {}); if (r.length) { applyRecs(host, r); applyRecs(rep, r); } extrapolate(rep, 1 / 60); }
  assert.deepEqual(hashView(rep).boss, hashView(host).boss, 'a replica that heard every rec agrees');
  const late = bossWorld(); loadSnapshot(late, JSON.parse(JSON.stringify(snapshot(host))));
  assert.deepEqual(hashView(late).boss, hashView(host).boss); assert.equal(late.boss.nextGlob, host.boss.nextGlob);
  assert.deepEqual(bossSnapshot(late.boss), bossSnapshot(host.boss));
  const clone = newBoss({ x: 125, y: 4, arena0: 108 }); bossLoad(clone, bossSnapshot(host.boss)); assert.deepEqual(bossHash(clone), bossHash(host.boss));
  assert.equal(bossHash(null), null);
});

test('the boss page\'s bookmark waits for the spirit; a coconut that is used comes back to its pile', () => {
  const p = bossPage(), at = pageToWorld(p, p.goal.x, p.goal.y), actor = { pos: { x: at.x, y: at.y, z: PAGE.z } }, state = applyEnter(freshState(), p.id);
  assert.equal(validateCollect({ state, run: freshRun(), page: p, kind: 'goal', id: 0, actor, bossDown: false }).reason, 'locked');
  assert.equal(validateCollect({ state, run: freshRun(), page: p, kind: 'goal', id: 0, actor, bossDown: true }).ok, true);
  const oh = getPage('orchard-hop');
  assert.equal(validateCollect({ state: applyEnter(freshState(), oh.id), run: freshRun(), page: oh, kind: 'goal', id: 0, actor: { pos: pageToWorld(oh, oh.goal.x, oh.goal.y) }, bossDown: false }).ok, true, 'other pages never wait for a boss');
  const w = bossWorld(), piles = w.objects.filter((o) => o.kind === 'fruit' && o.x > p.boss.arena0);
  assert.ok(piles.length >= 2);
  applyRecs(w, [{ t: 'ostate', id: piles[0].id, st: 'gone' }]);
  let respawned = false;
  for (let i = 0; i < 60 * 4 && !respawned; i++) { const r = stepWorld(w, 1 / 60, [{ key: 'a', x: 100, y: 3 }], {}); if (r.length) applyRecs(w, r); respawned = w.objects.some((o) => o.kind === 'fruit' && o.st !== 'gone' && o.id > piles[piles.length - 1].id); }
  assert.ok(respawned, 'a fresh coconut at its pile after about 3 s');
});

test('the boss page validates and a broken one is refused (no coconuts, or no campfire before the arena)', () => {
  assert.ok(validatePage(bossPage()).ok);
  const noPiles = copy(bossPage(), (rows) => { for (const r of rows) for (let x = 0; x < r.length; x++) if (r[x] === 'm' && x > 108) r[x] = '.'; });
  assert.ok(validatePage(noPiles).errors.some((e) => /coconut piles/.test(e)));
  const far = copy(bossPage(), (rows) => { for (const r of rows) for (let x = 100; x < 108; x++) if (r[x] === 'C') r[x] = '.'; });
  assert.ok(validatePage(far).errors.some((e) => /campfire within 30 tiles/.test(e)));
});

// ---- run state, host rules, saves ---------------------------------------------------------------------------------------------------------------------
test('run.canoe / run.lava only exist once started, survive the wire and leave every older page\'s run exactly as it was', () => {
  const rp = river(), lp = lavaPage(), plain = getPage('orchard-hop');
  assert.deepEqual(Object.keys(freshRun()).sort(), ['berries', 'bloom', 'cleared', 'fires', 'flowers', 'letters', 'secret']);
  assert.deepEqual(Object.keys(runView(normaliseRun(freshRun(), plain))).sort(), ['berries', 'bloom', 'cleared', 'fires', 'flowers', 'letters', 'secret']);
  const r1 = normaliseRun({ ...freshRun(), canoe: { i: 0, t0: 12.345 } }, rp), r2 = normaliseRun({ ...freshRun(), canoe: { i: 5, t0: 1 } }, rp), r3 = normaliseRun({ ...freshRun(), canoe: { i: 0, t0: 1 }, lava: { t0: 1, base: -5 } }, plain);
  assert.deepEqual(r1.canoe, { i: 0, t0: 12.35 }); assert.equal(r2.canoe, undefined, 'a canoe the page does not have'); assert.equal(r3.canoe, undefined); assert.equal(r3.lava, undefined);
  const lr = normaliseRun({ ...freshRun(), lava: { t0: 2, base: -5 } }, lp);
  assert.deepEqual(runView(JSON.parse(JSON.stringify(runView(lr)))), runView(lr));
  const taken = applyCollect(lr, lp, 'fire', 1).run; assert.deepEqual(taken.lava, { t0: 2, base: -5 }, 'collecting keeps the lava');
});

test('boarding and lava resets are host-validated', () => {
  const rp = river(), c = rp.canoes[0], state = applyEnter(freshState(), rp.id), at = (x, y) => { const w = pageToWorld(rp, x, y); return { pos: { x: w.x, y: w.y, z: PAGE.z } }; };
  assert.equal(validateCanoe({ state: freshState(), run: freshRun(), page: rp, i: 0, actor: at(57, 3), clock: 0 }).reason, 'closed');
  assert.equal(validateCanoe({ state, run: freshRun(), page: rp, i: 3, actor: at(57, 3), clock: 0 }).reason, 'bad-request');
  assert.equal(validateCanoe({ state, run: freshRun(), page: rp, i: 0, actor: at(40, 3), clock: 0 }).reason, 'far');
  assert.deepEqual(validateCanoe({ state, run: freshRun(), page: rp, i: 0, actor: at(c.x0 + 1.7, 3), clock: 0 }), { ok: true, i: 0 });
  assert.equal(validateCanoe({ state, run: { ...freshRun(), canoe: { i: 0, t0: 1 } }, page: rp, i: 0, actor: at(60, 3), clock: 5 }).reason, 'active', 'only a parked canoe can be boarded');
  const lp = lavaPage(), ls = applyEnter(freshState(), lp.id), run = { ...freshRun(), fires: [0, 1] }, actor = { pos: { x: 0, y: 0, z: 0 } };
  assert.equal(validateLava({ state: ls, run, page: lp, fire: 1, actor, clock: 20 }).ok, true);
  assert.equal(validateLava({ state: ls, run, page: lp, fire: 2, actor, clock: 20 }).reason, 'bad-request', 'an unlit fire cannot reset anything');
  assert.equal(validateLava({ state: ls, run, page: lp, fire: 0, actor, clock: 20 }).reason, 'bad-request', 'a fire outside the climb either');
  assert.equal(validateLava({ state: ls, run: { ...run, lava: { t0: 19.9, base: -5 } }, page: lp, fire: 1, actor, clock: 20 }).reason, 'taken', 'a reset that just happened is not repeated');
  assert.equal(validateLava({ state: ls, run, page: getPage('orchard-hop'), fire: 1, actor, clock: 20 }).ok, false);
});

// ---- the chapter, the pages, the reward -------------------------------------------------------------------------------------------------------------
test('the Emberleaf chapter: page 1 open, the rest in order, a secret exit opens the bonus page, the reward comes once with a paper volcano', () => {
  const ch = CHAPTERS.find((c) => c.id === 'emberleaf');
  assert.deepEqual(ch.pages, ['canopy-climb', 'river-run', 'lava-rise', 'volcano-spirit']); assert.equal(ch.secret, 'hot-spring');
  for (const id of [...ch.pages, ch.secret]) assert.ok(PAGES.has(id), id);
  let progress = normaliseProgress(null, PAGES);
  assert.deepEqual(chapterEntries(progress, ch).map((e) => e.open), [true, false, false, false, false]);
  const clear = (pr, id, letters = LETTERS, secret = false) => mergeClear(pr, getPage(id), { berries: [], letters: [...letters], fires: [0], flowers: [], cleared: true, secret, bloom: null });
  progress = clear(progress, 'canopy-climb'); assert.equal(pageOpen(progress, 'river-run'), true); assert.equal(pageOpen(progress, 'lava-rise'), false); assert.equal(pageOpen(progress, 'hot-spring'), false);
  progress = clear(progress, 'canopy-climb', LETTERS, true); assert.ok(secretUnlocked(progress, ch)); assert.equal(pageOpen(progress, 'hot-spring'), true, 'the secret exit opens the bonus page');
  progress = clear(progress, 'river-run'); progress = clear(progress, 'lava-rise'); progress = clear(progress, 'volcano-spirit', LETTERS.slice(0, 4));
  assert.equal(chapterBadge(progress, ch), false); assert.equal(rewardDue(progress, ch), false);
  progress = clear(progress, 'volcano-spirit');
  assert.equal(chapterBadge(progress, ch), true); assert.equal(rewardDue(progress, ch), true);
  progress = { ...progress, rewards: { ...progress.rewards, emberleaf: true } };
  assert.equal(rewardDue(progress, ch), false, 'the reward is given once'); assert.equal(popupsOf(progress).volcano, true); assert.equal(popupsOf(progress).snowglobe, false);
  const back = normaliseProgress(JSON.parse(JSON.stringify(progress)), PAGES); assert.equal(rewardDue(back, ch), false); assert.equal(popupsOf(back).volcano, true);
  assert.equal(JSON.stringify(progressView(back)), JSON.stringify(progressView(progress)));
  assert.deepEqual(normaliseProgress({ v: 1, pages: { 'orchard-hop': { cleared: true, letters: ['F'] } } }, PAGES).pages['canopy-climb'], undefined, 'an old save has no Emberleaf entries and loads');
  const items = CHAPTER_REWARDS.emberleaf;
  assert.ok(Object.keys(items).every((id) => getItem(id)), 'a bundle of catalog items'); assert.ok(Object.values(items).reduce((a, b) => a + b, 0) <= 12, 'a capped bundle'); assert.ok(itemName('banana', 4));
  const sets = stickerSets(progress, PAGES), es = sets.find((s) => s.chapter === 'emberleaf');
  assert.equal(es.badge, true); assert.equal(es.cards.length, 5); assert.equal(es.lettersTotal, 20); assert.ok(es.cards.every((c) => c.icon));
  assert.ok(es.cards.find((c) => c.id === 'hot-spring').bonus);
});

test('every Emberleaf page is a finished page: F-E-A-S-T once each, flowers, campfires, honest sizes, and the new things validate alone', () => {
  for (const id of ['canopy-climb', 'river-run', 'lava-rise', 'volcano-spirit', 'hot-spring']) {
    const p = getPage(id), v = validatePage(p);
    assert.deepEqual(v.errors, [], id); assert.equal(p.theme, 'jungle'); assert.ok(p.sticker);
    assert.deepEqual(p.letters.map((l) => l.ch).sort(), p.bonus ? [] : [...LETTERS].sort());
    assert.ok(p.campfires.length >= 3, `${id}: campfires`); assert.ok(p.flowers.length === 3 || (p.bonus && p.flowers.length === 0));
  }
  const c = climb(); assert.equal(c.vines.length, 2); assert.equal(c.cannons.length, 3); assert.ok(c.secret);
  assert.deepEqual(c.cannons.map((x) => x.mode), ['fixed', 'spin', 'auto']);
  assert.equal(river().canoes.length, 1); assert.ok(lavaPage().lava && lavaPage().cannons.length === 1); assert.ok(bossPage().boss && !bossPage().secret);
  assert.ok(bossPage().objects.filter((o) => o.kind === 'fruit').length >= 4, 'coconut piles');
  const rv = river(); for (const l of rv.letters) assert.ok(l.x < rv.canoes[0].x0 || l.x > rv.canoes[0].x1, 'letters never depend on the canoe');
  assert.ok(simulateCanoe(rv, rv.canoes[0]).ok);
});

test('pose bits: vine and cannon round-trip, and older packets decode as off', () => {
  const u = unpackPageBits(packPageBits({ vine: true, twirl: true })), c = unpackPageBits(packPageBits({ cannon: true, duck: true }));
  assert.deepEqual([u.vine, u.cannon, u.twirl], [true, false, true]); assert.deepEqual([c.vine, c.cannon, c.duck], [false, true, true]);
  assert.deepEqual(unpackPageBits(packPageBits({ sled: true })).vine, false);
  for (const bits of [packPageBits({ vine: true }), packPageBits({ cannon: true, puff: 'pit' })]) assert.equal(packPageBits(unpackPageBits(bits)), bits);
});

test('Paper Jungle is a complete log-drum and marimba arrangement on its own page playlist', () => {
  const t = getTrack(14);
  assert.equal(t.def.title, 'Paper Jungle'); assert.equal(trackInfo()[14].bars, 32); assert.ok(trackInfo()[14].seconds > 65 && trackInfo()[14].seconds < 90);
  assert.deepEqual(REGION_TRACKS['page-ember'], [14]); assert.deepEqual(REGION_TRACKS.page, [12]); assert.deepEqual(REGION_TRACKS['page-frost'], [13]); assert.equal(new Set(TRACK_TITLES).size, TRACK_TITLES.length);
  for (const k of ['pad', 'bass', 'marimba', 'logdrum', 'kick', 'shaker', 'click', 'lead']) assert.ok(t.events.some((e) => e.k === k), `${k} plays`);
  for (const e of t.events) { assert.ok(e.s >= 0 && e.s < t.steps && e.d > 0 && Number.isFinite(e.v) && e.v > 0 && e.v <= 0.4); assert.ok((Array.isArray(e.m) ? e.m : [e.m]).every(Number.isFinite)); }
  const tune = (tr) => JSON.stringify(tr.events.filter((e) => e.k === 'marimba' && e.v > 0.2).map((e) => [e.s, e.m]));
  assert.notEqual(tune(t), tune(getTrack(12)), 'its own tune'); assert.notEqual(tune(t), tune(getTrack(13)));
  assert.ok(t.events.filter((e) => e.k === 'logdrum').length >= 120, 'the log drums keep rolling');
});

test('the jungle tunables stay calm (a gentle chapter)', () => {
  assert.ok(J.canoe.speed <= 3.4 && J.canoe.logH < 0.6 && J.canoe.duckH < J.canoe.branchLow);
  assert.ok(J.vine.maxAng <= 1.0 && J.vine.pump > 0 && J.cannon.speed < 26);
  assert.ok(BC.hp === 3 && BC.flight >= 1.5 && BC.cooled >= 8 && BC.globsBase <= 2);
  assert.ok(LIMITS.maxUp >= 3, 'the physics the pages were built for');
});

// ---- a physical bot against the lava --------------------------------------------------------------------------------------------------------------
// The validator's climb check is an estimate over its graph; this one PLAYS the climb: it follows the graph's route between two campfires with the real physics (a scanned launch point for every jump, the real
// flight through a cannon), at HALF speed (every move is followed by as much waiting again), and the lava, started 8 tiles under the first fire, must stay under its feet the whole way.
test('a bot that plays the climb with the real physics at half speed stays above the rising lava between every pair of campfires', async () => {
  const { buildGraph, solveGates } = await import('../public/js/game/pageFormat.js');
  const p = lavaPage(), grid = solveGates(p).grid, G = buildGraph({ ...p, origin: p, grid }), lv = p.lava;
  const timeOf = (A, B) => {                                                  // physical time (s) of one graph edge, or null
    if (A.pseudo || B.pseudo) return null;
    const dir = Math.sign(B.cx - A.cx) || 1;
    if (Math.abs(B.cx - A.cx) === 1 && B.cy - A.cy <= 0 && B.cy - A.cy >= -1) return 0.14;
    for (const tw of [false, true]) for (const runUp of [0, 3]) for (let t = -2.0; t <= 1.6; t += 0.2) for (const hold of [99, 14]) {
      const b = createBody(A.cx + 0.5 - dir * runUp, A.cy);
      if (runUp && !(grid.at(Math.floor(b.x), A.cy - 1) === 35 || grid.at(Math.floor(b.x), A.cy - 1) === 61)) continue;
      b.grounded = true; for (let i = 0; i < 3; i++) stepBody(grid, b, {});
      if (!b.grounded || Math.abs(b.y - A.cy) > 0.05) continue;
      let jumped = false, held = 0;
      for (let f = 0; f < 200; f++) {
        const trig = A.cx + 0.5 + dir * t, press = !jumped && (dir > 0 ? b.x >= trig : b.x <= trig);
        if (press) jumped = true;
        const hold1 = jumped && held < hold; if (jumped) held++;
        const steer = jumped && b.vy < 2 ? Math.max(-1, Math.min(1, (B.cx + 0.5 - b.x) * 0.9)) : dir;
        stepBody(grid, b, { move: B.cx === A.cx && !jumped ? 0 : (jumped ? steer : dir), jumpPressed: press, jumpHeld: hold1, twirlPressed: tw && jumped && b.vy < 0 });
        if (jumped && b.grounded && f > 5) { if (Math.floor(b.x) === B.cx && Math.abs(b.y - B.cy) < 0.05) return (f + runUp * 8) / 60 + 0.3; break; }
        if (b.y < -3) break;
      }
    }
    return null;
  };
  let checked = 0;
  for (let k = lv.from; k < lv.to; k++) {
    const a = G.id(Math.floor(p.campfires[k].x), Math.floor(p.campfires[k].y)), z = G.id(Math.floor(p.campfires[k + 1].x), Math.floor(p.campfires[k + 1].y));
    const prev = new Map([[a, -1]]), q = [a];
    for (let h = 0; h < q.length; h++) for (const n of G.adj[q[h]]) if (!prev.has(n)) { prev.set(n, q[h]); q.push(n); }
    assert.ok(prev.has(z), `a route from campfire ${k} to ${k + 1}`);
    const route = []; for (let n = z; n !== -1; n = prev.get(n)) route.push(n); route.reverse();
    let t = 0;
    for (let i = 1; i < route.length; i++) {
      const A = G.cells[route[i - 1]], B = G.cells[route[i]];
      let dt = timeOf(A, B);
      if (dt === null) { if (B.pseudo) { dt = 1.2; } else if (A.pseudo) { const out = cannonOutcomes(p, A.i), f = out.paths[0].length * 4 / 60; dt = f + J.cannon.auto; } else assert.fail(`the bot could not make ${A.cx},${A.cy} -> ${B.cx},${B.cy}`); }
      t += dt * 2;                                                             // half speed
      const lava = (p.campfires[k].y - J.lava.gap) + J.lava.rate * t;
      assert.ok(B.cy - lava >= 0.5, `campfire ${k} -> ${k + 1}: at ${B.cx},${B.cy} after ${t.toFixed(1)} s the lava is at ${lava.toFixed(1)}`);
      checked++;
    }
  }
  assert.ok(checked >= 8, `${checked} moves played`);
});
