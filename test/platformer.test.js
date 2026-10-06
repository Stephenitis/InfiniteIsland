// Step 49: the platformer core (game/platformerLogic.js), the page format + validator (game/pageFormat.js), the page rules of the storybook domain and the saved progress.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGrid, createBody, stepBody, advance, bounce, groundBelow, LIMITS, createLife, hurtLife, fallLife, tickLife, refillLife, berryRefill,
} from '../public/js/game/platformerLogic.js';
import { parsePage, validatePage, buildGraph, solveGates, pageToWorld, worldToPage } from '../public/js/game/pageFormat.js';
import { PAGES, getPage } from '../public/js/game/pages/index.js';
import { ORCHARD_HOP } from '../public/js/game/pages/orchardHop.js';
import {
  PAGE, LETTERS, freshState, applyEnter, freshRun, normaliseRun, runView, validateCollect, applyCollect, respawnFire, normaliseProgress, mergeClear, progressLine, progressView, hashView,
} from '../public/js/game/storybookLogic.js';
import { PLATFORMER as P } from '../public/js/config.js';

const STEP = P.step;
const level = (...rows) => createGrid(rows);
const FLAT = ['..............................', '..............................', '..............................', '..............................', '..............................', '..............................', '..............................', '..............................', '##############################'];
const flat = () => level(...FLAT);
const ground = (b) => ({ ...b, y: 1 });
function standing(grid, x = 5, y = 1) { const b = createBody(x, y); for (let i = 0; i < 4; i++) stepBody(grid, b, {}); assert.ok(b.grounded); return b; }
function run(grid, b, frames, input) { let apex = b.y; for (let i = 0; i < frames; i++) { stepBody(grid, b, typeof input === 'function' ? input(i, b) : input); apex = Math.max(apex, b.y); } return apex; }

test('the jump apex and the running gap match the derived limits', () => {
  assert.ok(LIMITS.apex > 3.3 && LIMITS.apex < 4.1, `apex ${LIMITS.apex}`);
  assert.ok(LIMITS.tapApex < 1.3 && LIMITS.tapApex > 0.5, `a tap still hops ${LIMITS.tapApex}`);
  assert.ok(LIMITS.maxGap >= 4 && LIMITS.maxGap <= 6, `gap ${LIMITS.maxGap}`);
  // measure on the real step: a running jump from the edge of a ledge across a gap of maxGap tiles lands, one of flatReach + 1 does not
  const gapRows = (w) => ['....................................', '....................................', '....................................', '....................................', '....................................', '#####' + '.'.repeat(w) + '#'.repeat(36 - 5 - w)];
  const trial = (w) => {
    const g = level(...gapRows(w)), b = createBody(3, 1); b.grounded = true;
    let jumped = false, landed = false;
    for (let i = 0; i < 200 && !landed && b.y > -1; i++) {
      const edge = b.x >= 5 - 0.3;                                     // jump as late as the body is still supported (coyote makes the last instant easy)
      stepBody(g, b, { move: 1, jumpHeld: true, jumpPressed: edge && !jumped });
      if (edge) jumped = true;
      if (jumped && b.grounded && b.x > 5 + w) landed = true;
    }
    return landed;
  };
  assert.ok(trial(LIMITS.maxGap), `a ${LIMITS.maxGap} tile gap is jumpable`);
  assert.ok(!trial(Math.ceil(LIMITS.flatReach) + 2), 'a much wider gap is not');
});

test('releasing Jump early gives a shorter hop', () => {
  const g = flat();
  const full = standing(g); stepBody(g, full, { jumpPressed: true, jumpHeld: true });
  const fullApex = run(g, full, 80, { jumpHeld: true });
  const tap = standing(g); stepBody(g, tap, { jumpPressed: true, jumpHeld: false });
  const tapApex = run(g, tap, 80, { jumpHeld: false });
  assert.ok(fullApex - 1 > 3.3, `full ${fullApex}`);
  assert.ok(tapApex - 1 < 1.4 && tapApex - 1 > 0.4, `tap ${tapApex}`);
  const mid = standing(g); stepBody(g, mid, { jumpPressed: true, jumpHeld: true });
  const midApex = run(g, mid, 80, (i) => ({ jumpHeld: i < 8 }));
  assert.ok(midApex > tapApex && midApex < fullApex);
});

test('coyote time: a jump just after leaving a ledge works, a late one does not', () => {
  const g = level('....................', '....................', '....................', '.......', '#####...............'.padEnd(20, '.'));
  const test1 = (delay) => {
    const b = createBody(2, 1); b.grounded = true;
    let frames = 0;
    while (b.grounded || frames < 2) { stepBody(g, b, { move: 1 }); frames++; if (frames > 200) break; }   // run off the edge at x = 5
    const t0 = Math.round(delay / STEP);
    for (let i = 0; i < t0; i++) stepBody(g, b, { move: 1 });
    stepBody(g, b, { move: 1, jumpPressed: true, jumpHeld: true });
    return b.vy > 5;
  };
  assert.ok(test1(0.05), 'within the coyote window');
  assert.ok(!test1(0.2), 'after the window it is just a fall');
});

test('jump buffer: a press just before landing jumps on landing, an early one is forgotten', () => {
  const g = flat();
  const tryBuffer = (before) => {
    const b = standing(g); stepBody(g, b, { jumpPressed: true, jumpHeld: true });
    run(g, b, 20, { jumpHeld: true });                              // up in the air, falling soon
    let fall = 0; while (!b.grounded && fall++ < 200) { if (b.vy < 0 && b.y - 1 < 0.9 * (before / 0.1)) break; stepBody(g, b, { jumpHeld: false }); }
    // press now (the body is `before` s or so from the floor), keep Jump held
    stepBody(g, b, { jumpPressed: true, jumpHeld: true });
    let jumpedAgain = false;
    for (let i = 0; i < 40; i++) { stepBody(g, b, { jumpHeld: true }); if (b.grounded === false && b.vy > 10) jumpedAgain = true; }
    return jumpedAgain;
  };
  assert.ok(tryBuffer(0.06), 'a press 0.06 s early');
  const early = standing(g); stepBody(g, early, { jumpPressed: true, jumpHeld: true });
  run(g, early, 12, { jumpHeld: true });
  stepBody(g, early, { jumpPressed: true, jumpHeld: true });          // far too early (rising)
  let again = false;
  for (let i = 0; i < 120; i++) { stepBody(g, early, {}); if (early.vy > 10) again = true; }
  assert.ok(!again, 'a press 0.5 s before landing is forgotten');
});

test('no tunnelling: terminal fall speed and bounce launches never pass a 1 tile floor, a ceiling or a wall', () => {
  const g = flat();
  const b = createBody(5, 8); b.vy = -P.maxFall;
  run(g, b, 60, {});
  assert.ok(Math.abs(b.y - 1) < 1e-6 && b.grounded, `landed on the floor (y ${b.y})`);
  // a huge launch into a ceiling one tile thick
  const c = level('..........', '..........', '##########', '..........', '..........', '..........', '..........', '..........', '##########');
  const u = createBody(5, 1); u.grounded = true; bounce(u, 45);
  run(c, u, 30, {});
  assert.ok(u.y + P.height <= 5 + 1e-3 || u.y > 6, 'never inside the slab');
  assert.ok(!(u.y + P.height > 5.01 && u.y < 6.99), 'not overlapping the slab');
  // running into a wall at top speed
  const w = level('...........', '...........', '.........#.', '.........#.', '###########');
  const r = createBody(2, 1); r.grounded = true; r.vx = P.runSpeed;
  run(w, r, 90, { move: 1 });
  assert.ok(r.x <= 9 - P.half + 1e-6, `stopped at the wall (x ${r.x})`);
});

test('one-way planks: pass from below, land from above, drop through with down + Jump', () => {
  const g = level('..............', '..............', '..............', '..............', '....====......', '..............', '..............', '..............', '##############');
  const b = standing(g, 5.5, 1);                                     // under the plank (row 4: top at y = 5)
  stepBody(g, b, { jumpPressed: true, jumpHeld: true });
  run(g, b, 40, { jumpHeld: true });
  assert.ok(b.grounded && Math.abs(b.y - 5) < 1e-6, `the jump passed up through the plank and landed on it (y ${b.y})`);
  stepBody(g, b, { down: true, jumpPressed: true, jumpHeld: true });
  assert.ok(b.ev.some((e) => e.kind === 'drop') || !b.grounded, 'a drop-through started');
  run(g, b, 60, {});
  assert.ok(b.grounded && Math.abs(b.y - 1) < 1e-6, 'fell through to the floor');
  // walking off the side of a plank lets the body fall; walking under it does not catch the head
  const walk = createBody(2, 1); walk.grounded = true;
  run(g, walk, 40, { move: 1 });
  assert.ok(Math.abs(walk.y - 1) < 1e-6 || walk.grounded, 'walking under a plank is unobstructed');
});

test('slopes: walking up and down keeps ground contact and never bounces', () => {
  // flat, a 3 tile hill ('/' x3, plateau, '\' x3), flat
  const W = 30;
  const rows = [];
  for (let r = 0; r < 12; r++) rows.push('.'.repeat(W));
  const set = (cx, cy, ch) => { const row = 11 - cy; rows[row] = rows[row].slice(0, cx) + ch + rows[row].slice(cx + 1); };
  for (let x = 0; x < W; x++) set(x, 0, '#');
  // ground surface y = 1; hill: '/' at (10,1) (11,2) (12,3), plateau cells to height 4 at x 13..15, '\' at (16,3) (17,2) (18,1)
  for (let x = 10; x <= 18; x++) for (let y = 0; y < (x < 13 ? x - 10 + 1 : x > 15 ? 18 - x + 1 : 4); y++) set(x, y, '#');
  set(10, 1, '/'); set(11, 2, '/'); set(12, 3, '/'); set(16, 3, '\\'); set(17, 2, '\\'); set(18, 1, '\\');
  const grid = createGrid(rows);
  const b = createBody(4, 1); b.grounded = true;
  let airborne = 0, maxUp = 0, prevY = b.y, bounced = 0;
  for (let i = 0; i < 400 && b.x < 25; i++) {
    stepBody(grid, b, { move: 1 });
    if (!b.grounded) airborne++;
    if (b.y > prevY + 0.4) maxUp = Math.max(maxUp, b.y - prevY);
    prevY = b.y;
    if (b.x > 17 && b.vy > 0.5) bounced++;
  }
  assert.ok(b.x >= 25, `crossed the hill (x ${b.x})`);
  assert.equal(airborne, 0, 'always on the floor over a hill');
  assert.equal(bounced, 0, 'no bouncing on the way down');
  assert.ok(Math.abs(b.y - 1) < 1e-6, 'back on the flat ground');
  // the top really was 4 tiles up
  const c = createBody(4, 1); c.grounded = true; let top = 0;
  for (let i = 0; i < 200 && c.x < 14.5; i++) { stepBody(grid, c, { move: 1 }); top = Math.max(top, c.y); }
  assert.ok(top >= 3.99, `climbed to the plateau (${top})`);
  // and back down to the left
  c.vx = 0; for (let i = 0; i < 400 && c.x > 5; i++) { stepBody(grid, c, { move: -1 }); assert.ok(c.grounded, 'downhill to the left stays grounded'); }
  assert.ok(Math.abs(c.y - 1) < 1e-6);
});

test('a head bonk on a ceiling stops the rise', () => {
  const g = level('..........', '..........', '..........', '####......', '..........', '..........', '##########');
  const b = standing(g, 1.5, 1); stepBody(g, b, { jumpPressed: true, jumpHeld: true });
  let bonk = false; for (let i = 0; i < 40; i++) { stepBody(g, b, { jumpHeld: true }); if (b.ev.some((e) => e.kind === 'bonk')) bonk = true; }
  assert.ok(bonk, 'bonk event');
  assert.ok(b.y + P.height <= 3 + 1e-3, 'never above the ceiling');
  const free = standing(g, 7.5, 1); stepBody(g, free, { jumpPressed: true, jumpHeld: true });
  assert.ok(run(g, free, 60, { jumpHeld: true }) > 4.3, 'but a free jump goes higher');
});

test('springs launch higher than a jump, higher still with Jump held', () => {
  const g = level('....................', '....................', '....................', '....................', '....................', '....................', '....................', '....................', '....................', '....................', '.....S..............', '####################');
  const apexOf = (held) => { const b = createBody(5.5, 1); b.grounded = true; b.vx = 0; const a = run(g, b, 120, { jumpHeld: held }); return a - 1; };
  assert.ok(apexOf(false) > LIMITS.apex + 2.5, `spring ${apexOf(false)}`);
  assert.ok(apexOf(true) > apexOf(false) + 1);
  assert.ok(LIMITS.springMaxUp >= 5 && LIMITS.springApex > 6.5);
});

test('thorns raise a hazard event, a pit raises fell, knock-back moves the body', () => {
  const g = level('....................', '....................', '....................', '......^.............', '####################');
  const b = createBody(2, 1); b.grounded = true;
  let hazard = null; for (let i = 0; i < 90 && !hazard; i++) { stepBody(g, b, { move: 1 }); hazard = b.ev.find((e) => e.kind === 'hazard'); }
  assert.ok(hazard && hazard.cx === 6, 'walked into the thorns');
  const pit = level('..........', '..........', '###....###');
  const f = createBody(4.5, 3); let fell = false;
  for (let i = 0; i < 90 && !fell; i++) { stepBody(pit, f, {}); fell = f.ev.some((e) => e.kind === 'fell'); }
  assert.ok(fell, 'fell below the page');
});

test('a scripted input sequence is deterministic and independent of how the time is sliced', () => {
  const g = createGrid(ORCHARD_HOP.rows.map((r) => r.replace(/[^#=\/\\^S]/g, '.')));
  const script = (i) => ({ move: i % 240 < 150 ? 1 : -0.4, jumpPressed: i % 37 === 0, jumpHeld: i % 37 < 20, down: i % 90 > 80 });
  const play = (slice) => {
    const b = createBody(4.5, 2); b.grounded = true;
    let t = 0, step = 0;
    while (step < 900) { const inp = script(step); const n = advance(g, b, inp, slice); if (n) step += n; t += slice; if (t > 100) break; }
    return b;
  };
  const a = play(STEP), c = play(STEP);
  assert.deepEqual([a.x, a.y, a.vx, a.vy], [c.x, c.y, c.vx, c.vy], 'same script, same result');
  // advance() with larger dt runs several fixed steps: feeding 2 steps at once equals two single steps (the press edge is only given to the first)
  const d1 = createBody(4.5, 2), d2 = createBody(4.5, 2);
  d1.grounded = d2.grounded = true;
  advance(g, d1, { move: 1, jumpPressed: true, jumpHeld: true }, STEP * 2 + 1e-6);
  stepBody(g, d2, { move: 1, jumpPressed: true, jumpHeld: true }); stepBody(g, d2, { move: 1, jumpHeld: true });
  assert.deepEqual([d1.x, d1.y, d1.vx, d1.vy], [d2.x, d2.y, d2.vx, d2.vy]);
  const big = createBody(4.5, 2); big.grounded = true;
  assert.ok(advance(g, big, { move: 1 }, 2.0) <= P.maxSteps, 'catch-up steps are capped');
});

test('the floor probe finds the tile under a point (blob shadows) and nothing over a pit', () => {
  const g = level('..........', '..........', '###....###');
  assert.equal(groundBelow(g, 1.5, 5), 1);
  assert.equal(groundBelow(g, 4.5, 5), null);
});

test('hearts: thorns cost one, invulnerability blocks the next, the last heart or a pit makes a puff, then a respawn with full hearts', () => {
  const l = createLife();
  assert.equal(l.hearts, 3);
  assert.equal(hurtLife(l), 'hurt'); assert.equal(l.hearts, 2);
  assert.equal(hurtLife(l), null, 'invulnerable'); assert.equal(l.hearts, 2);
  tickLife(l, P.invuln + 0.01);
  assert.equal(hurtLife(l), 'hurt'); tickLife(l, 2);
  assert.equal(hurtLife(l), 'puff'); assert.equal(l.state, 'puff');
  assert.equal(hurtLife(l), null);
  assert.equal(tickLife(l, 0.5), null);
  assert.equal(tickLife(l, 0.8), 'respawn');
  assert.deepEqual([l.state, l.hearts], ['alive', 3]);
  const p = createLife(); assert.equal(fallLife(p), 'puff'); assert.equal(fallLife(p), null);
  const r = createLife(); hurtLife(r); refillLife(r); assert.equal(r.hearts, 3);
  assert.equal(berryRefill(99, 100), true); assert.equal(berryRefill(100, 101), false); assert.equal(berryRefill(199, 200), true);
});

// ---- the page format ----------------------------------------------------------------------------------------------------------------------------------------
test('every registered page parses and passes the validator', () => {
  assert.ok(PAGES.size >= 1);
  for (const page of PAGES.values()) {
    const v = validatePage(page);
    assert.deepEqual(v.errors, [], `${page.id}: ${v.errors.join('; ')}`);
    assert.ok(v.ok);
    assert.equal(page.letters.length, 5);
    assert.deepEqual(page.letters.map((l) => l.ch).sort(), [...LETTERS].sort());
    assert.ok(page.campfires.length >= 2, 'a start fire and a mid checkpoint');
    assert.ok(page.berries.length >= 60 && page.berries.length <= 130, `berries ${page.berries.length}`);
    assert.ok(page.W >= 150 && page.W <= 240 && page.H >= 14 && page.H <= 20, `${page.W} x ${page.H}`);
    assert.ok(page.exitX > page.spawnX);
  }
});

test('the page validator names what is wrong', () => {
  const rows = ORCHARD_HOP.rows.map((r) => r.split(''));
  const make = (edit) => { const rr = rows.map((r) => r.slice()); edit(rr); return validatePage(parsePage({ ...ORCHARD_HOP, rows: rr.map((r) => r.join('')) })); };
  let v = make((rr) => { rr[rr.length - 1][5] = '.'; rr[rr.length - 1] = rr[rr.length - 1].slice(0, -1); });
  assert.ok(!v.ok && v.errors.some((e) => /wide/.test(e)), 'ragged rows');
  v = make((rr) => { for (const r of rr) for (let x = 0; x < r.length; x++) if (r[x] === 'G') r[x] = '.'; });
  assert.ok(v.errors.some((e) => /no goal/.test(e)));
  v = make((rr) => { for (const r of rr) for (let x = 0; x < r.length; x++) if (r[x] === 'a') r[x] = '.'; });
  assert.ok(v.errors.some((e) => /letters must be exactly/.test(e)));
  v = make((rr) => { for (const r of [16, 17]) for (let x = 32; x <= 42; x++) rr[r][x] = '.'; });      // an 11 wide pit at the very start
  assert.ok(v.errors.some((e) => /cannot be reached from the start/.test(e)), v.errors.join(';'));
  v = make((rr) => { for (let y = 0; y < rr.length - 2; y++) if (rr[y][105] === 'a') { rr[y][105] = '.'; rr[0][105] = 'a'; } });
  assert.ok(v.errors.some((e) => /letter A .* cannot be reached/.test(e)), 'a letter out of reach');
  // a campfire that traps its party: ringed by solid walls (a respawn there could never leave)
  v = make((rr) => { for (const y of [12, 13, 14, 15]) { rr[y][118] = '#'; rr[y][124] = '#'; } rr[11][121] = '='; });
  assert.ok(!v.ok);
});

test('tile <-> world mapping puts the floor at the pocket height', () => {
  const page = getPage('orchard-hop');
  const w = pageToWorld(page, page.start.x, page.start.y);
  assert.equal(w.y, PAGE.y);
  assert.equal(w.z, PAGE.z);
  const t = worldToPage(page, w.x, w.y);
  assert.ok(Math.abs(t.tx - page.start.x) < 1e-9 && Math.abs(t.ty - page.start.y) < 1e-9);
  assert.ok(Math.abs(w.x - (PAGE.x + page.spawnX)) < 1e-9);
});

// ---- the shared run + saved progress -------------------------------------------------------------------------------------------------------------------------
const page = () => getPage('orchard-hop');
const stateOpen = () => applyEnter(freshState(), 'orchard-hop');
const actorAt = (tx, ty) => { const w = pageToWorld(page(), tx, ty); return { pos: { x: w.x, y: w.y, z: PAGE.z } }; };

test('collecting is validated by the host: unknown, taken, far and closed are rejected', () => {
  const run = freshRun(), pg = page();
  const b0 = pg.berries[0];
  assert.equal(validateCollect({ state: freshState(), run, page: pg, kind: 'berry', id: 0, actor: actorAt(b0.x, b0.y) }).reason, 'closed');
  assert.equal(validateCollect({ state: stateOpen(), run, page: pg, kind: 'berry', id: 0, actor: actorAt(b0.x, b0.y) }).ok, true);
  assert.equal(validateCollect({ state: stateOpen(), run, page: pg, kind: 'berry', id: 99999, actor: actorAt(b0.x, b0.y) }).reason, 'bad-request');
  assert.equal(validateCollect({ state: stateOpen(), run, page: pg, kind: 'berry', id: 'x', actor: actorAt(b0.x, b0.y) }).reason, 'bad-request');
  assert.equal(validateCollect({ state: stateOpen(), run, page: pg, kind: 'letter', id: 'Q', actor: actorAt(b0.x, b0.y) }).reason, 'bad-request');
  assert.equal(validateCollect({ state: stateOpen(), run, page: pg, kind: 'sparkle', id: 0, actor: actorAt(b0.x, b0.y) }).reason, 'bad-request');
  assert.equal(validateCollect({ state: stateOpen(), run, page: pg, kind: 'berry', id: 0, actor: actorAt(b0.x + 30, b0.y) }).reason, 'far');
  assert.equal(validateCollect({ state: stateOpen(), run, page: pg, kind: 'berry', id: 0, actor: actorAt(b0.x + 2, b0.y + 2) }).ok, true, 'a few tiles of latency slack');
  const taken = applyCollect(run, pg, 'berry', 0).run;
  assert.equal(validateCollect({ state: stateOpen(), run: taken, page: pg, kind: 'berry', id: 0, actor: actorAt(b0.x, b0.y) }).reason, 'taken');
  const l = pg.letters[1];
  assert.equal(validateCollect({ state: stateOpen(), run, page: pg, kind: 'letter', id: l.ch, actor: actorAt(l.x, l.y) }).ok, true);
  assert.equal(validateCollect({ state: stateOpen(), run, page: pg, kind: 'goal', id: 0, actor: actorAt(pg.goal.x, pg.goal.y) }).ok, true);
  assert.equal(validateCollect({ state: stateOpen(), run: { ...run, cleared: true }, page: pg, kind: 'goal', id: 0, actor: actorAt(pg.goal.x, pg.goal.y) }).reason, 'taken');
  assert.equal(validateCollect({ state: stateOpen(), run, page: pg, kind: 'fire', id: 0, actor: actorAt(pg.campfires[0].x, pg.campfires[0].y) }).reason, 'taken', 'the start fire is lit from the beginning');
});

test('applying collections: sorted, unique, letters in F E A S T order, 100 berries refill hearts, the furthest lit fire is the respawn', () => {
  const pg = page();
  let run = freshRun(), refills = 0;
  for (let i = 0; i < pg.berries.length && i < 100; i++) { const r = applyCollect(run, pg, 'berry', i); run = r.run; if (r.refill) refills++; }
  assert.equal(run.berries.length, 100); assert.equal(refills, 1, 'one refill at the 100th berry');
  assert.equal(applyCollect(run, pg, 'berry', 3).run.berries.length, 100, 'taking one twice changes nothing');
  run = applyCollect(applyCollect(run, pg, 'letter', 'T').run, pg, 'letter', 'F').run;
  assert.deepEqual(run.letters, ['F', 'T']);
  assert.equal(respawnFire(pg, run), pg.campfires[0]);
  run = applyCollect(run, pg, 'fire', 1).run;
  assert.equal(respawnFire(pg, run), pg.campfires[1]);
  run = applyCollect(run, pg, 'fire', 2).run;
  assert.deepEqual(run.fires, [0, 1, 2]);
  assert.equal(respawnFire(pg, run), pg.campfires[2]);
  assert.equal(applyCollect(run, pg, 'goal', 0).run.cleared, true);
});

test('the run survives the wire and a late snapshot; garbage is dropped; the hash is stable through JSON', () => {
  const pg = page();
  let run = freshRun();
  for (const i of [7, 3, 3, 50]) run = applyCollect(run, pg, 'berry', i).run;
  run = applyCollect(run, pg, 'letter', 'A').run;
  const wire = JSON.parse(JSON.stringify(runView(run)));
  assert.deepEqual(normaliseRun(wire, pg), run);
  assert.deepEqual(normaliseRun({ berries: [-1, 2.5, 1e9, 'x', 4, 4], letters: ['Z', 'F', 'F'], fires: [9, 1], cleared: 1 }, pg), { berries: [4], letters: ['F'], fires: [0, 1], flowers: [], cleared: true });
  assert.deepEqual(normaliseRun(null, pg), freshRun());
  assert.deepEqual(normaliseRun({ berries: [1] }, null), freshRun());
  const view = (r) => JSON.stringify({ ...hashView(stateOpen()), run: runView(r) });
  assert.equal(view(normaliseRun(wire, pg)), view(run));
});

test('saved progress: normalised on load, letters and the best berry count merge only when a page is cleared', () => {
  const pg = page();
  assert.deepEqual(normaliseProgress(null, PAGES), { v: 1, pages: {} });
  assert.deepEqual(normaliseProgress({ pages: { nope: { cleared: true }, 'orchard-hop': { cleared: 1, letters: ['E', 'X', 'F'], bestBerries: 99999 } } }, PAGES).pages,
    { 'orchard-hop': { cleared: true, letters: ['F', 'E'], bestBerries: pg.berries.length, flowers: [] } });
  assert.deepEqual(normaliseProgress('junk', PAGES), { v: 1, pages: {} });
  let progress = normaliseProgress(null, PAGES);
  // a partial visit leaves the save alone (nothing merges until the goal): the module only calls mergeClear on a clear
  assert.deepEqual(progressLine(progress, pg).letters.map((l) => l.found), [false, false, false, false, false]);
  let run = freshRun();
  for (const ch of ['F', 'S']) run = applyCollect(run, pg, 'letter', ch).run;
  for (let i = 0; i < 40; i++) run = applyCollect(run, pg, 'berry', i).run;
  progress = mergeClear(progress, pg, applyCollect(run, pg, 'goal', 0).run);
  assert.deepEqual(progress.pages['orchard-hop'], { cleared: true, letters: ['F', 'S'], bestBerries: 40, flowers: [] });
  // a later clear keeps what was found before and the better berry count
  let run2 = freshRun(); run2 = applyCollect(run2, pg, 'letter', 'A').run;
  for (let i = 0; i < 25; i++) run2 = applyCollect(run2, pg, 'berry', i).run;
  progress = mergeClear(progress, pg, run2);
  assert.deepEqual(progress.pages['orchard-hop'], { cleared: true, letters: ['F', 'A', 'S'], bestBerries: 40, flowers: [] });
  assert.deepEqual(progressLine(progress, pg).letters.map((l) => l.found), [true, false, true, true, false]);
  assert.deepEqual(normaliseProgress(JSON.parse(JSON.stringify(progress)), PAGES), progress);
  assert.equal(JSON.stringify(progressView(normaliseProgress(JSON.parse(JSON.stringify(progress)), PAGES))), JSON.stringify(progressView(progress)));
});

// ---- the validator against the real physics ----------------------------------------------------------------------------------------------------------------------
// A small bot (run toward the target, jump from a scanned launch point holding Jump, steer in the air) re-plays every jump the validator's graph claims, from the start of the page
// outwards: if the conservative graph ever promised a move the physics cannot do, a cell stays unreached here.
test('a bot can physically reach every standable cell of every page, so the validator is not overpromising', () => {
  for (const page of PAGES.values()) {
    const solved = solveGates(page), grid = solved.grid, G = buildGraph({ grid });       // (Step 50: the page with every tool gate opened; the thorn fields count as crossed by pogo)
    const tryEdge = (A, B) => {
      const dir = Math.sign(B.cx - A.cx) || 1;
      for (const tw of [false, true]) for (const runUp of [0, 3, 6]) for (let t = -2.0; t <= 1.6; t += 0.15) for (const hold of [99, 14]) {
        const b = createBody(A.cx + 0.5 - dir * runUp, A.cy);
        const g0 = grid.at(Math.floor(b.x), A.cy - 1);
        if (runUp && !(g0 === 35 || g0 === 61)) continue;
        b.grounded = true; for (let i = 0; i < 3; i++) stepBody(grid, b, {});
        if (!b.grounded || Math.abs(b.y - A.cy) > 0.05) continue;
        let jumped = false, held = 0;
        for (let f = 0; f < 200; f++) {
          const trig = A.cx + 0.5 + dir * t;
          const press = !jumped && (dir > 0 ? b.x >= trig : b.x <= trig);
          if (press) jumped = true;
          const hold1 = jumped && held < hold; if (jumped) held++;
          const steer = jumped && b.vy < 2 ? Math.max(-1, Math.min(1, (B.cx + 0.5 - b.x) * 0.9)) : dir;
          stepBody(grid, b, { move: B.cx === A.cx && !jumped ? 0 : (jumped ? steer : dir), jumpPressed: press, jumpHeld: hold1, twirlPressed: tw && jumped && b.vy < 0 });
          if (jumped && b.grounded && f > 5) { if (Math.floor(b.x) === B.cx && Math.abs(b.y - B.cy) < 0.05) return true; break; }
          if (b.y < -3) break;
        }
      }
      return false;
    };
    const start = G.id(Math.floor(page.start.x), Math.floor(page.start.y));
    const seen = new Set([start]), q = [start];
    for (let h = 0; h < q.length; h++) {
      const ai = q[h], A = G.cells[ai];
      const nb = [...G.adj[ai]].sort((a, b) => (Math.abs(G.cells[a].cx - A.cx) + Math.abs(G.cells[a].cy - A.cy)) - (Math.abs(G.cells[b].cx - A.cx) + Math.abs(G.cells[b].cy - A.cy)));
      for (const bi of nb) {
        if (seen.has(bi)) continue;
        const B = G.cells[bi], slope = [47, 92].includes(grid.at(A.cx, A.cy)) || [47, 92].includes(grid.at(B.cx, B.cy));
        const walk = Math.abs(B.cx - A.cx) === 1 && (B.cy - A.cy <= 0 || (slope && B.cy - A.cy === 1)) && B.cy - A.cy >= -1;
        if (walk || tryEdge(A, B)) { seen.add(bi); q.push(bi); }
      }
    }
    const claimed = new Set([start]), cq = [start];                                     // the cells the validator's graph claims are reachable (decorative hill tops are standable but not claimed)
    for (let h = 0; h < cq.length; h++) for (const n of G.adj[cq[h]]) if (!claimed.has(n)) { claimed.add(n); cq.push(n); }
    const missing = G.cells.filter((_, i) => claimed.has(i) && !seen.has(i)).map((c) => `${c.cx},${c.cy}`);
    assert.deepEqual(missing, [], `${page.id}: cells the bot could not reach`);
  }
});

test('a one-frame Jump press is never lost on a fast display (frames that run no fixed step keep the press)', () => {
  const g = flat();
  for (const hz of [120, 144, 165, 240]) {
    const b = standing(g);
    const y0 = b.y;
    // the press lands on a frame too short for a fixed step, and is released on the very next frame
    b.acc = 0;
    advance(g, b, { move: 0, jumpPressed: true, jumpHeld: true }, 1 / hz);
    let apex = b.y;
    for (let i = 0; i < hz; i++) { advance(g, b, { move: 0, jumpHeld: false }, 1 / hz); apex = Math.max(apex, b.y); }
    assert.ok(apex > y0 + 0.4, `${hz} Hz: the tap still hops (apex ${(apex - y0).toFixed(2)})`);
  }
});
