// Step 52a: things that move on a page (leaf / log platforms, gusts, the tide) and the Bloom Moment's clock: deterministic motion, riding on the real physics, a rider bot over every platform chain of
// the new pages, the validator's solo model (no co-op, no toss, no bloom tiles for what a clear needs) and the secret exit / bloom rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wave, tideLevel, moverPos, moverHeads, gustAt, windAt, wadeAt, inWater, moverCells, bloomState, bloomCanStart, bloomStart, bloomLook, swingK, ridePlatforms,
} from '../public/js/game/pageMotion.js';
import { createBody, stepBody, groundBelow, createGrid } from '../public/js/game/platformerLogic.js';
import { parsePage, validatePage } from '../public/js/game/pageFormat.js';
import { PAGES, getPage } from '../public/js/game/pages/index.js';
import { PAGE_MOTION as M, PAGE_BLOOM as B, PLATFORMER as P } from '../public/js/config.js';
import {
  freshState, applyEnter, freshRun, normaliseRun, runView, validateCollect, validateBloom, applyCollect, mergeClear, normaliseProgress, progressView, progressLine, PAGE, pageToWorld,
} from '../public/js/game/storybookLogic.js';

const kite = () => getPage('kite-hill'), tidepool = () => getPage('tidepool-run');

test('motion is a pure function of the page clock: same time, same place; ping-pong and tide stay inside their bounds', () => {
  const pg = tidepool();
  for (const t of [0, 1.7, 8, 123.4]) { assert.deepEqual(moverPos(pg.movers[0], t, pg.tide), moverPos(pg.movers[0], t, pg.tide)); }
  assert.equal(wave(0, 8), 0); assert.ok(Math.abs(wave(4, 8) - 1) < 1e-9); assert.ok(Math.abs(wave(8, 8)) < 1e-9);
  for (let t = 0; t < 60; t += 0.37) {
    const lvl = tideLevel(pg.tide, t); assert.ok(lvl >= pg.tide.low - 1e-9 && lvl <= pg.tide.high + 1e-9);
    for (const m of pg.movers) { const p = moverPos(m, t, pg.tide); assert.ok(p.x >= Math.min(m.x0, m.x1) - 1e-9 && p.x <= Math.max(m.x0, m.x1) + 1e-9); assert.ok(Math.abs(p.y - (lvl + m.dy)) < 1e-9, 'a log rides the tide'); }
  }
  const lk = kite();
  const p0 = moverPos(lk.movers[1], 0), p5 = moverPos(lk.movers[1], 5);
  assert.equal(p0.y, 2); assert.ok(Math.abs(p5.y - 9) < 1e-9, 'the elevator reaches its top');
  assert.deepEqual(moverHeads(lk, 3.3).map((h) => h.id).slice(0, 2), ['m0', 'm1']);
});

test('a gust blows for its share of every period, fades in and out, and only inside its zone; wading is the tide only', () => {
  const g = { x0: 10, x1: 20, y0: 2, y1: 8, dir: 1, period: 10, on: 0.5, phase: 0 };
  assert.equal(gustAt(g, 0), 0); assert.ok(gustAt(g, 2.5) === 1); assert.equal(gustAt(g, 7), 0); assert.equal(gustAt(g, 12.5), 1, 'it repeats');
  assert.ok(gustAt(g, 0.3) > 0 && gustAt(g, 0.3) < 1, 'fading in');
  const page = { gusts: [g, { ...g, dir: -1, x0: 15 }] };
  assert.deepEqual(windAt(page, 12, 4, 2.5), { vx: M.gust.speed, lift: M.gust.lift });
  assert.equal(windAt(page, 17, 4, 2.5).vx, 0, 'two opposite gusts cancel');
  assert.deepEqual(windAt(page, 30, 4, 2.5), { vx: 0, lift: 0 }); assert.equal(windAt(page, 12, 4, 7).vx, 0);
  const pg = tidepool();
  assert.ok(wadeAt(pg, 10, 3, 12) && !wadeAt(pg, 10, 3, 0), 'high tide covers the beach, low tide does not');
  assert.ok(!wadeAt(pg, 120, 3, 12), 'no tide beyond the beach');
  assert.ok(inWater(pg, 70, 1.0) && !inWater(pg, 70, 3) && !inWater(pg, 10, 0));
});

test('a gust carries a body sideways without touching its own speed; a twirl inside one is lifted', () => {
  const flat = createGrid([...Array(10).fill('.'.repeat(40)), '#'.repeat(40)]);
  const still = createBody(5, 1), blown = createBody(5, 1);
  for (let i = 0; i < 4; i++) { stepBody(flat, still, {}); stepBody(flat, blown, {}); }
  for (let i = 0; i < 60; i++) { stepBody(flat, still, {}); stepBody(flat, blown, { wind: { vx: M.gust.speed, lift: 0 } }); }
  assert.ok(Math.abs(still.x - 5) < 1e-6 && Math.abs(blown.x - (5 + M.gust.speed)) < 0.05, `drift ${blown.x - 5}`);
  const glide = (wind) => { const b = createBody(5, 1); b.grounded = true; stepBody(flat, b, { jumpPressed: true, jumpHeld: true }); let low = 99, i = 0; for (; i < 40 && !(b.vy < 0); i++) stepBody(flat, b, { jumpHeld: true }); stepBody(flat, b, { twirlPressed: true, wind }); for (let k = 0; k < 20; k++) stepBody(flat, b, { wind }); return b.y; };
  assert.ok(glide({ vx: 0, lift: M.gust.lift }) > glide(null) + 0.3, 'the twirl floats further in a gust');
  const walk = (wade) => { const b = createBody(5, 1); b.grounded = true; for (let i = 0; i < 90; i++) stepBody(flat, b, { move: 1, wade }); return b.x - 5; };
  assert.ok(walk(true) < walk(false) * (M.wadeMove + 0.12) && walk(true) > 0, 'wading is slower, never stuck');
});

test('riding: a body lands on a platform, is carried by it and can jump off; platforms never bounce a landing', () => {
  const grid = createGrid([...Array(12).fill('.'.repeat(40)), '#'.repeat(5) + '.'.repeat(30) + '#'.repeat(5)]);
  const mover = { kind: 'leaf', x0: 15, x1: 25, y0: 3, y1: 3, w: 4, period: 20 };
  const page = { movers: [mover] };
  const b = createBody(15, 9), st = { on: null, rideLast: null };
  b.vy = -22;                                                  // a hard landing (a friend's head would bounce it)
  let t = 0, landed = false;
  for (let i = 0; i < 90; i++) {
    t += P.step;
    const pre = { y: b.y, vy: b.vy };
    stepBody(grid, b, {});
    const res = ridePlatforms(grid, b, pre, moverHeads(page, t), st, {});
    if (res.kind === 'land') landed = true;
    assert.notEqual(res.kind, 'bounce');
  }
  assert.ok(landed && st.on === 'm0' && b.grounded, 'standing on the leaf');
  const x1 = b.x; for (let i = 0; i < 180; i++) { t += P.step; const pre = { y: b.y, vy: b.vy }; stepBody(grid, b, {}); ridePlatforms(grid, b, pre, moverHeads(page, t), st, {}); }
  const p = moverPos(mover, t); assert.ok(Math.abs(b.x - p.x) < 0.9 && b.x > x1 + 0.5, `carried along (${x1.toFixed(2)} -> ${b.x.toFixed(2)}, leaf ${p.x.toFixed(2)})`);
  const pre = { y: b.y, vy: b.vy }; stepBody(grid, b, { jumpPressed: true, jumpHeld: true }); ridePlatforms(grid, b, pre, moverHeads(page, t + P.step), st, {});
  assert.ok(b.vy > 5 && !b.grounded, 'a jump leaves the leaf');
});

// ---- a rider bot over every platform chain ------------------------------------------------------------------------------------------------------------------------
// Always walk right; at an edge wait for a platform (or the far bank) within a jump and hop; on a platform hop when the next thing is close. If the validator's union model over-promised, the bot
// would never cross (or would fall in).
function crossChain(page, x0, x1, t0, maxT = 140) {
  const grid = page.grid;
  const b = createBody(x0, 0), st = { on: null, rideLast: null };
  const gy = groundBelow(grid, x0, 40); b.y = gy; b.grounded = true;
  let t = t0, jumpHeld = 0, tgt = null;
  for (let f = 0; f < maxT * 60; f++) {
    t += P.step;
    const heads = moverHeads(page, t);
    const wind = windAt(page, b.x, b.y + 0.7, t);
    const ahead = (dx) => groundBelow(grid, b.x + dx, b.y + 3.0);
    const g1 = ahead(0.9), farGround = ahead(3.6);
    const cand = heads.find((h) => !(st.on === h.id) && h.x - h.half <= b.x + 3.4 && h.x + h.half >= b.x + 0.4 && h.top - b.y <= 3.0 && b.y - h.top <= 4.5 && Math.abs(h.x - b.x) > 0.8);
    let move = 0, jump = false;
    if (b.grounded) {
      if (!st.on) {
        const edge = g1 === null || g1 < b.y - 1.2;
        if (!edge) move = 1;
        else if (cand || (farGround !== null && farGround <= b.y + 3 && farGround >= b.y - 4)) { move = 1; jump = true; }
        else move = 0;
      } else {
        const gap = cand ? (cand.x - cand.half) - (b.x + 0.3) : 99;
        let edge = 99;                                         // distance to the first solid ground ahead at a height one can hop to
        for (let d = 0.5; d <= 7.5; d += 0.25) { const g = ahead(d); if (g !== null && g <= b.y + 1.2 && g >= b.y - 3) { edge = d - 0.3; break; } }
        if ((cand && gap < 1.2) || edge < 1.6) { move = 1; jump = true; }
        else if ((cand && gap < 3.4) || (!cand && edge < 7)) { const cur = heads.find((x) => x.id === st.on); move = cur && b.x < cur.x + cur.half - 0.5 ? 1 : 0; }                  // walk to the end of the platform while the next one drifts closer
      }
    } else {                                                   // in the air: steer onto the platform it hopped for (or on toward the far bank)
      const h = tgt && heads.find((x) => x.id === tgt);
      move = h ? Math.max(-1, Math.min(1, (h.x - b.x) * 0.9)) : 1;
    }
    if (jump) { jumpHeld = 26; tgt = cand ? cand.id : null; }
    const pre = { y: b.y, vy: b.vy };
    stepBody(grid, b, { move, jumpPressed: jump, jumpHeld: jumpHeld-- > 0, twirlPressed: !b.grounded && b.vy < -3, wind: wind.vx || wind.lift ? wind : undefined });
    ridePlatforms(grid, b, pre, heads, st, { jumpHeld: jumpHeld > 0 });
    if (b.y < -2.5) return { ok: false, why: `fell at x ${b.x.toFixed(1)} t ${t.toFixed(1)}`, t };
    if (b.x >= x1 && b.grounded && !st.on) return { ok: true, t: t - t0 };
  }
  return { ok: false, why: `stuck at x ${b.x.toFixed(1)}`, t };
}
test('a rider bot crosses every moving-platform chain of the new pages from any starting clock', () => {
  const chains = [
    [kite(), 18, 34], [kite(), 52, 62], [kite(), 77.8, 122], [tidepool(), 56, 97], [tidepool(), 136, 168],
  ];
  for (const [page, a, z] of chains) {
    for (const t0 of [0, 2.9, 5.3, 11.1]) {
      const r = crossChain(page, a, z, t0);
      assert.ok(r.ok, `${page.id} ${a}->${z} from clock ${t0}: ${r.why}`);
    }
  }
});

// ---- the validator: solo only ------------------------------------------------------------------------------------------------------------------------------------
const edit = (raw, fn) => { const rows = raw.rows.map((r) => r.split('')); fn(rows); return parsePage({ ...raw, rows: rows.map((r) => r.join('')) }); };
const find = (raw, ch) => { const out = []; raw.rows.forEach((r, ri) => { for (let x = 0; x < r.length; x++) if (r[x] === ch) out.push([x, ri]); }); return out; };
test('every Meadow page passes the solo validator, including the moving platforms and the bloom route', () => {
  for (const id of ['kite-hill', 'tidepool-run', 'hidden-orchard', 'orchard-hop', 'woodcutters-way']) {
    const v = validatePage(getPage(id));
    assert.deepEqual(v.errors, [], id); assert.ok(v.stats.solo);
  }
  assert.ok(validatePage(kite()).stats.movers >= 6 && validatePage(kite()).stats.secret);
  const tp = validatePage(tidepool()).stats; assert.ok(tp.bloom && tp.pads >= 6 && tp.movers >= 6);
  assert.equal(kite().flowers.length, 3); assert.equal(tidepool().flowers.length, 3);
});

const mini = (rows, extra = {}) => parsePage({ id: 'mini', name: 'mini', floorRows: 2, flowersOk: true, ...extra, rows: rows.map((r) => r.padEnd(34, '.')) });
test('a letter only a toss, a bloom pad or a co-op door could reach fails with a clear reason; the same page with a real route passes', () => {
  // (1) F E A S on easy ground, T on a high ledge only a friend toss reaches
  const high = (ledge) => mini([
    '..................................', '..................................', '.....................' + (ledge ? 't' : '.') + '.......',
    '...................======.........', '..................................', '..................................', '..................................',
    'P.C..f.e...a.s.......o.......G....', '##################################', '##################################',
  ]);
  const v1 = validatePage(high(true));
  assert.ok(v1.errors.some((e) => /letter T at .+ cannot be reached from the start .only a friend toss/.test(e)), v1.errors.join(' | '));
  // (2) the same letter over bloom pads: the message names them, and it can never be the only way
  const pads = mini([
    '..................................', '..................................', '..................................',
    '..................................', '....................t.............', '..................................', '..................................',
    '....................~~~~~.........', '..................................',
    'P.C..f.e...a.s.N......o.......G...', '##################################', '##################################',
  ]);
  const v2 = validatePage(pads);
  assert.ok(v2.errors.some((e) => /letter T.*only reachable over bloom pads/.test(e)), v2.errors.join(' | '));
  // (3) a co-op door (sealed for a lone player) in the only way on: the page fails; without the seal it passes
  const hill = '.........#####....................';
  const door = (coop) => mini([
    hill, hill, hill, hill, '.........BBBBB....................', 'P.C..f.e2BBBBB.a.s.t.........G....', '##################################', '##################################',
  ], coop ? { coopDoors: [9, 10, 11, 12, 13].flatMap((x) => [[x, 2], [x, 3]]) } : {});
  assert.ok(validatePage(door(false)).ok, validatePage(door(false)).errors.join(' | '));
  const v3 = validatePage(door(true));
  assert.ok(!v3.ok && v3.errors.some((e) => /cannot be reached/.test(e)), v3.errors.join(' | '));
});

test('bloom pads count only for optional rewards: a flower on them is fine, a pad route that is too long is not', () => {
  const tp = getPage('tidepool-run');
  assert.deepEqual(validatePage(tp).errors, []);
  // move the Night-Bloom to the far end of the page: the pad flower is then outside the bloom's time budget
  const far = edit({ rows: tp.rows }, (rows) => { const [x, y] = find({ rows: tp.rows }, 'N')[0]; rows[y][x] = '.'; rows[tp.H - 1 - 3][8] = 'N'; });
  const v = validatePage({ ...far, ...Object.fromEntries(['movers', 'tide', 'waters'].map((k) => [k, tp[k]])), digs: [] });
  assert.ok(v.errors.some((e) => /pressed flower/.test(e)) || v.errors.some((e) => /berries cannot/.test(e)), v.errors.join(' | '));
  // a bloom pad over a pit would drop the player into it
  const bad = edit({ rows: tp.rows }, (rows) => { rows[tp.H - 1 - 5][70] = '~'; });
  const vb = validatePage({ ...bad, movers: tp.movers, tide: tp.tide, waters: tp.waters, digs: [] });
  assert.ok(vb.errors.some((e) => /pad at 70,5 would drop/.test(e)), vb.errors.join(' | '));
});

// ---- Bloom Moments -------------------------------------------------------------------------------------------------------------------------------------------------
test('a Bloom Moment starts at a clock time, lasts PAGE_BLOOM.dur, can be restarted after the cooldown, and a late joiner derives it from the snapshot', () => {
  let bloom = null;
  assert.equal(bloomState(bloom, 5).active, false); assert.ok(bloomCanStart(bloom, 0));
  bloom = bloomStart(bloom, 20.123);
  assert.deepEqual(bloom, { t0: 20.12, n: 1 });
  assert.ok(bloomState(bloom, 20.12).active && bloomState(bloom, 20 + B.dur - 0.1).active && !bloomState(bloom, 20.12 + B.dur).active);
  assert.ok(Math.abs(bloomState(bloom, 26.12).left - (B.dur - 6)) < 1e-9);
  assert.ok(!bloomCanStart(bloom, 25) && !bloomCanStart(bloom, 20.12 + B.dur + B.cooldown - 0.01) && bloomCanStart(bloom, 20.12 + B.dur + B.cooldown));
  bloom = bloomStart(bloom, 40); assert.equal(bloom.n, 2);
  assert.equal(bloomLook(null, 5), 0); assert.ok(bloomLook(bloom, 40.1) < 0.2 && bloomLook(bloom, 46) === 1 && bloomLook(bloom, 40 + B.dur - 0.1) < 0.2 && bloomLook(bloom, 60) === 0, 'eased in and out');
  assert.equal(swingK(-1), 0); assert.equal(swingK(B.swing + 0.1), 0); assert.ok(swingK(B.swing / 2) > 0.99, 'the camera swing peaks halfway');
  const wire = JSON.parse(JSON.stringify(runView({ ...freshRun(), bloom })));
  const pg = tidepool();
  assert.deepEqual(normaliseRun(wire, pg).bloom, bloom, 'the run keeps the bloom through the wire / snapshot');
  assert.equal(normaliseRun(wire, getPage('orchard-hop')).bloom, null, 'a page without a Night-Bloom keeps none');
  assert.equal(normaliseRun({ bloom: { t0: 'x' } }, pg).bloom, null);
});

test('the host validates a bloom: it needs a Night-Bloom, someone near it and no Bloom Moment running', () => {
  const pg = tidepool(), state = applyEnter(freshState(), pg.id), w = pageToWorld(pg, pg.bloom.x, pg.bloom.y);
  const near = { pos: { x: w.x, y: w.y, z: PAGE.z } }, far = { pos: { x: w.x + 30, y: w.y, z: PAGE.z } };
  const base = { state, run: freshRun(), page: pg, actor: near, clock: 50, canStart: bloomCanStart };
  assert.equal(validateBloom(base).ok, true);
  assert.equal(validateBloom({ ...base, actor: far }).reason, 'far');
  assert.equal(validateBloom({ ...base, run: { ...freshRun(), bloom: { t0: 45, n: 1 } } }).reason, 'active');
  assert.equal(validateBloom({ ...base, run: { ...freshRun(), bloom: { t0: 30, n: 1 } } }).ok, true, 're-triggerable once it ended');
  assert.equal(validateBloom({ ...base, page: getPage('orchard-hop'), state: applyEnter(freshState(), 'orchard-hop') }).reason, 'bad-request');
  assert.equal(validateBloom({ ...base, state: freshState() }).reason, 'closed');
});

// ---- the secret exit ---------------------------------------------------------------------------------------------------------------------------------------------
test('the secret exit clears the page, is validated like the goal and is saved; old saves load without it', () => {
  const pg = kite(), state = applyEnter(freshState(), pg.id), w = pageToWorld(pg, pg.secret.x, pg.secret.y);
  const base = { state, run: freshRun(), page: pg, kind: 'secret', id: 0, actor: { pos: { x: w.x, y: w.y, z: PAGE.z } } };
  assert.equal(validateCollect(base).ok, true);
  assert.equal(validateCollect({ ...base, actor: { pos: { x: 0, y: 0, z: 0 } } }).reason, 'far');
  assert.equal(validateCollect({ ...base, page: getPage('orchard-hop'), state: applyEnter(freshState(), 'orchard-hop') }).reason, 'bad-request');
  const r = applyCollect(freshRun(), pg, 'secret', 0).run;
  assert.ok(r.secret && r.cleared);
  assert.equal(validateCollect({ ...base, run: r }).reason, 'taken');
  const prog = mergeClear(normaliseProgress(null, PAGES), pg, r);
  assert.equal(prog.pages['kite-hill'].secret, true); assert.equal(progressLine(prog, pg).secret, true);
  assert.deepEqual(normaliseProgress(JSON.parse(JSON.stringify(prog)), PAGES), prog);
  assert.equal(JSON.stringify(progressView(normaliseProgress(JSON.parse(JSON.stringify(prog)), PAGES))), JSON.stringify(progressView(prog)));
  // an old save (no secret, no rewards) loads; a secret flag on a page without one is dropped
  const old = normaliseProgress({ v: 1, pages: { 'kite-hill': { cleared: true, letters: ['F'], bestBerries: 3 }, 'orchard-hop': { cleared: true, secret: true } } }, PAGES);
  assert.equal(old.pages['kite-hill'].secret, false); assert.equal(old.pages['orchard-hop'].secret, false); assert.deepEqual(old.rewards, {});
  assert.equal(old.pages['kite-hill'].flowers.length, 0);
  assert.equal(moverCells(getPage('orchard-hop')).size, 0);
  assert.ok(moverCells(kite()).size > 20);
  assert.ok(PAGES.get('hidden-orchard').bonus && PAGES.get('hidden-orchard').letters.length === 0);
});
