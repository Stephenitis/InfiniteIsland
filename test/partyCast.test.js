// Step 81a: Driftwood Cast's pure rules (game/party/castLogic.js) and stage (world/party/cast.js): the contract and berths, the one fair stream of finds, casting / reeling / waiting, the drawn hook + marker + finds against
// what the host judges, bots and win rates, the screen runtime with real Players (the rod in hand, real Interact presses, a repeat play without the how-to), a host + replica pair, the track + sounds + icon.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { PARTY } from '../public/js/config.js';
import { mulberry32 } from '../public/js/utils/rng.js';
import { validateGame, getGame } from '../public/js/game/party/registry.js';
import { hostFor } from '../public/js/game/party/botRoster.js';
import { stageCentre, stageSpawns, spectatorSpot, partyWalkable, castPads, POCKET } from '../public/js/game/party/partyArea.js';
import { isWalkable } from '../public/js/world/terrain.js';
import {
  GAME, KINDS, buildItems, itemPose, markerDepth, judgeCast, exitTime, ptsOf, needOf, yawFor, velocityOf, init, step, apply, request, placing, view, bot, debugWin,
} from '../public/js/game/party/castLogic.js';
import { createCastWorld } from '../public/js/world/party/cast.js';
import { pair } from './fixtures/partyPair.js';
import { playCast, rate, KID } from './fixtures/sim81a.mjs';
import { makeRuntime } from './fixtures/partyRuntime80d.js';
import { getTrack, trackInfo, TRACK_TITLES, PARTY_TRACKS } from '../public/js/audio/music.js';
import { ICONS } from '../public/js/ui/icons.js';
import { Sfx } from '../public/js/audio/sfx.js';

const C = PARTY.cast, c = stageCentre('cast');
const roster = (n = 4) => Array.from({ length: n }, (_, slot) => ({ slot }));
const send = (g, slot, t, extra = {}) => { const out = request(g, slot, { t, ...extra }, { t, slack: PARTY.slack, lag: 0.3 }); if (out.rec) apply(g, out.rec); return out; };
const run = (g, t0, t1, dt = 1 / 30) => { const all = []; for (let t = t0; t < t1; t += dt) for (const r of step(g, { t }, dt, t)) { apply(g, r); all.push(r); } return all; };
/** A press time at which the marker is over find `it` while it is near the lane's middle (a certain hook). */
function aimTime(it, from) {
  for (let t = Math.max(from, it.t0 + 0.2); t < exitTime(it); t += 0.01) { const p = itemPose(it, t + C.flight); if (Math.abs(p.x) < 0.8 && Math.abs(p.d - markerDepth(t)) < 0.8) return Math.round(t * 100) / 100; }
  return null;
}
/** The first find of a kind (index >= 2) the marker can be lined up with, and when to press: { it, t }. */
function aimed(items, kind, skip = 0) { let k = 0; for (const it of items) { if (it.kind !== kind || it.i < 2) continue; const t = aimTime(it, it.t0); if (t !== null && k++ >= skip) return { it, t }; } return null; }

test('the game honours the registry contract; the stage is at +900; four berth pads on the jetty (one per lane, the stick only walks you on it) face the water, four bench spots behind; Bbui hosts', () => {
  assert.deepEqual(validateGame(GAME), []);
  assert.equal(getGame('cast'), GAME); assert.equal(GAME.kind, 'lanes'); assert.deepEqual(GAME.press, ['interact']); assert.deepEqual(GAME.howto.buttons, ['interact']); assert.equal(GAME.duration, C.cap);
  assert.equal(hostFor('cast').name, 'Yu Bbui Bbui'); assert.equal(GAME.host, 'Yu Bbui Bbui'); assert.deepEqual(PARTY.stageOffset.cast, { x: 900, z: 0 }); assert.deepEqual(c, { x: PARTY.origin.x + 900, z: PARTY.origin.z });
  const pads = castPads(), berths = pads.filter((p) => p.berth !== undefined), sp = stageSpawns('cast', 4);
  assert.equal(berths.length, 4); assert.equal(pads.filter((p) => p.bench !== undefined).length, 4);
  berths.forEach((b, i) => { assert.ok(partyWalkable(b.x, b.z) && isWalkable(b.x, b.z)); assert.deepEqual([sp[i].x, sp[i].z], [b.x, b.z]); assert.equal(sp[i].face, Math.PI, 'looking out over the water'); assert.ok(b.x - c.x === C.lanes[i]); if (i) assert.ok(b.x - berths[i - 1].x - 2 * b.r > 1.5, 'berths are apart'); });
  for (let k = 0; k < 4; k++) { const s = spectatorSpot('cast', k); assert.ok(partyWalkable(s.x, s.z) && isWalkable(s.x, s.z)); }
  assert.equal(partyWalkable(c.x + C.lanes[0], c.z + C.edgeZ - 1), false, 'no walking on the water');
  assert.equal(new Set(TRACK_TITLES).has('Sunset Jetty'), true);
  assert.ok(C.berthZ - C.berthR > C.edgeZ - 0.5 && C.benchZ - 1.4 > C.berthZ + C.berthR + 0.5);
});

test('the stream of finds: deterministic from the seed, the same for every lane, 24 finds with fixed shares, two rare shells (middle and last third), never a boot early or two in a row, drifting across the lane at a gentle pace', () => {
  const a = buildItems(9), b = buildItems(9), d = buildItems(10);
  assert.deepEqual(a, b); assert.notDeepEqual(a, d); assert.equal(a.length, C.items);
  for (let s = 1; s <= 80; s++) {
    const it = buildItems(s * 977), kinds = it.map((x) => x.kind);
    for (const k of KINDS) assert.equal(kinds.filter((x) => x === k).length, C.counts[k], `${k} count`);
    const shells = kinds.map((k, i) => (k === 'shell' ? i : -1)).filter((i) => i >= 0); assert.equal(shells.length, 2); assert.ok(shells[0] >= Math.floor(C.items * 0.33) && shells[0] < Math.floor(C.items * 0.6) && shells[1] >= Math.floor(C.items * 0.66));
    kinds.forEach((k, i) => { if (k === 'boot') { assert.ok(i >= 3); assert.notEqual(kinds[i - 1], 'boot'); assert.notEqual(kinds[i + 1], 'boot'); } });
    it.forEach((x, i) => { assert.ok(x.v >= C.speed[0] - 0.01 && x.v <= C.speed[1] + 0.01 && x.row >= 0 && x.row < C.rows.length && (x.dir === 1 || x.dir === -1)); if (i) { assert.ok(x.t0 > it[i - 1].t0 + 1.4 && x.t0 < it[i - 1].t0 + 2.4); assert.notEqual(x.row, it[i - 1].row); } });
    assert.ok(it.at(-1).t0 < C.cap - 4, 'the last find still has time to be caught');
  }
  // a find crosses the lane from one side to the other and is on the water only while inside it
  const x = a[3], p0 = itemPose(x, x.t0 - 0.1), p1 = itemPose(x, x.t0 + 0.01), p2 = itemPose(x, exitTime(x) - 0.01), p3 = itemPose(x, exitTime(x) + 0.5);
  assert.equal(p0.on, false); assert.equal(p1.on, true); assert.equal(p2.on, true); assert.equal(p3.on, false); assert.ok(Math.sign(p1.x) === -x.dir && Math.sign(p2.x) === x.dir);
  assert.ok(Math.abs(itemPose(x, x.t0 + 2 * (C.laneHalf + 0.2) / x.v / 2).x) < 0.01, 'its middle is the lane\'s middle');
  // the points and the presses: heavier = more presses, the rare shell is worth ten, a boot nothing
  assert.deepEqual(KINDS.map(ptsOf), [1, 2, 3, 5, 10, 0]); assert.ok(needOf('driftwood') < needOf('glimmerfin') && needOf('glimmerfin') < needOf('bottle') && needOf('bottle') < needOf('lanternkoi') && needOf('lanternkoi') <= needOf('shell')); assert.ok(needOf('boot') > 0);
  assert.ok(markerDepth(0) >= C.depthMin - 1e-9 && markerDepth(C.period / 2) <= C.depthMax + 1e-9); for (let t = 0; t < 12; t += 0.05) assert.ok(markerDepth(t) >= C.depthMin - 1e-9 && markerDepth(t) <= C.depthMax + 1e-9);
});

/** Make slot's line ready at time t and let the host cast it (casting is automatic): the cast record of that slot. */
const auto = (g, slot, t) => send(g, slot, t).rec;                       // a strike pressed at t (the 'cast' record the host would make)

test('the line is out by itself but THE STRIKE IS A PRESS: nothing is ever hooked without one; a press judged at the marker\'s depth then hooks the nearest find in reach, a miss splashes and resets so you can strike again, mashing reels, boots score nothing', () => {
  const g = init(41, roster(2)), items = buildItems(41), { it, t } = aimed(items, 'driftwood');
  // no press, no hook: a whole game of nobody pressing makes no cast, no catch, only the end
  const quiet = init(41, roster(2)), qr = run(quiet, 0, C.cap + 0.1); assert.deepEqual(qr.map((r) => r.k), ['end'], 'nothing happens by itself'); assert.deepEqual(quiet.score, { 0: 0, 1: 0 }); assert.equal(quiet.st[0].n, 0); assert.equal(quiet.st[0].mode, 'idle');
  assert.deepEqual(step(g, { t: C.firstCast }, 1 / 30, C.firstCast), [], 'step() never casts');
  assert.equal(send(g, 0, C.firstCast - 0.1).ignore, true, 'the line is not out before firstCast');
  assert.equal(send(g, 0, C.cap - 0.1).ignore, true, 'no strike in the last instant (the hook could not land)');
  // a miss: strike where nothing is within reach, the hook still lands at the marker's depth at the press
  let tm = null; for (let x = 1.0; x < 20; x += 0.01) if (judgeCast(items, {}, x).hit < 0) { tm = Math.round(x * 100) / 100; break; } assert.ok(tm !== null, 'a moment with nothing in reach exists');
  const m = send(g, 0, tm).rec; assert.equal(m.k, 'cast'); assert.equal(m.hit, -1); assert.equal(m.t, tm); assert.equal(m.d, Math.round(markerDepth(tm) * 100) / 100); assert.equal(m.land, Math.round((tm + C.flight) * 100) / 100);
  const sl = g.st[0]; assert.equal(sl.mode, 'wait'); assert.equal(sl.last, 'miss'); assert.equal(sl.n, 1); assert.equal(sl.readyAt, Math.round((m.land + C.waitMiss) * 100) / 100); assert.equal(g.st[1].n, 0, 'the other lane is untouched');
  assert.equal(send(g, 0, sl.readyAt - 0.05).ignore, true, 'a press while the splashed line comes back is lost'); assert.equal(sl.n, 1);
  assert.deepEqual(run(g, tm, sl.readyAt + 1).filter((r) => r.k === 'cast'), [], 'and the line never strikes by itself');
  const again = send(g, 0, sl.readyAt + 0.2); assert.equal(again.rec.k, 'cast', 'the miss reset: the line can strike again'); assert.equal(again.rec.n, 2);
  // a certain hook
  const h = init(41, roster(2)), cr = auto(h, 0, t); assert.equal(cr.hit, it.i); assert.equal(h.st[0].mode, 'reel'); assert.equal(h.st[0].need, needOf('driftwood')); assert.equal(h.res[0][it.i], 'h');
  assert.equal(cr.d, Math.round(markerDepth(t) * 100) / 100, 'judged at the drawn marker');
  const p = itemPose(it, cr.land); assert.ok(Math.hypot(p.x, p.d - cr.d) <= C.hookR, 'the find is inside the hook\'s reach at the landing');
  assert.equal(send(h, 0, t + 0.01).ignore, true, 'the hook has not landed: a press is lost'); assert.equal(h.st[0].count, 0);
  let tt = cr.land + 0.05;
  for (let k = 1; k <= needOf('driftwood'); k++) { const r = send(h, 0, tt); assert.equal(r.rec.k, 'reel'); assert.equal(h.st[0].count, k); tt += 0.12; }
  assert.equal(send(h, 0, tt).ignore, true, 'the find is already coming aboard'); assert.equal(h.score[0], 0);
  const done = run(h, tt, tt + 0.2).filter((r) => r.slot === 0 || r.k === 'catch'); assert.equal(done.filter((r) => r.k === 'catch').length, 1); assert.equal(h.score[0], 1); assert.equal(h.got[0], 1); assert.equal(h.res[0][it.i], 'd'); assert.equal(h.st[0].mode, 'wait');
  const ra = Math.round((done.find((r) => r.k === 'catch').t + C.waitCatch) * 100) / 100; assert.equal(h.st[0].readyAt, ra); assert.equal(send(h, 0, ra - 0.05).ignore, true); assert.equal(send(h, 0, ra).rec.k, 'cast', 'the next strike is a press once the line is back');
  // a caught find is gone for this lane, but the other lane still has it
  assert.equal(judgeCast(items, h.res[0], t).hit === it.i, false); assert.equal(judgeCast(items, h.res[1] || {}, t).hit, it.i, 'the same find is still there for the other lane');
  // a hooked find never escapes: it stays hooked however long the reeling takes, and a press never strikes again meanwhile
  const e = init(41, roster(1)), ec = auto(e, 0, t); run(e, t, t + 20); assert.equal(e.st[0].mode, 'reel'); assert.equal(e.st[0].item, ec.hit); assert.equal(send(e, 0, t + 5).rec.k, 'reel', 'a press while hooked is only ever a reel pull');
  // heavier finds need more presses; a boot scores nothing
  for (const kind of ['glimmerfin', 'lanternkoi', 'shell', 'boot']) {
    const gg = init(41, roster(1)), am = aimed(items, kind); assert.ok(am, `a ${kind} can be lined up`); const f = am.it;
    const c2 = auto(gg, 0, am.t); assert.equal(c2.hit, f.i, kind); assert.equal(gg.st[0].need, needOf(kind)); let t2 = c2.land + 0.05; for (let k = 0; k < needOf(kind); k++) { send(gg, 0, t2); t2 += 0.1; }
    run(gg, t2, t2 + 0.3); assert.equal(gg.score[0], ptsOf(kind)); assert.equal(gg.boots[0], kind === 'boot' ? 1 : 0);
  }
  // the game ends at the cap and ranks by points (ties share); debug win puts one slot ahead
  assert.ok(step(init(41, roster(2)), { t: C.cap }, 1 / 30, C.cap).some((r) => r.k === 'end'));
  const hh = init(41, roster(3)); hh.score = { 0: 4, 1: 9, 2: 4 }; assert.deepEqual(placing(hh).map((r) => [r.slot, r.place]), [[1, 1], [0, 2], [2, 2]]);
  for (const r of debugWin(hh, 2, 1)) apply(hh, r); assert.deepEqual(placing(hh).map((r) => [r.slot, r.place]), [[2, 1], [0, 2], [1, 2]]);
  assert.deepEqual(request(init(1, roster(1)), 9, {}, { t: 1 }), { reject: 'not-playing' });
});

test('a press is judged at the presser\'s own stamp, clamped into the host\'s recent past: one stamped before the hook landed is lost, one from the future is clamped to now', () => {
  const g = init(41, roster(1)), items = buildItems(41), { it, t } = aimed(items, 'glimmerfin');
  const stampedEarly = request(init(41, roster(1)), 0, { t: t - 5 }, { t: t + 0.1, slack: PARTY.slack }); assert.equal(stampedEarly.rec.t, Math.round((t + 0.1 - PARTY.slack) * 100) / 100, 'a strike stamped too far back is clamped into the slack window');
  const cr = auto(g, 0, t);
  assert.equal(cr.hit, it.i);
  assert.equal(request(g, 0, { t: cr.land - 1 }, { t: cr.land + 0.1, slack: PARTY.slack }).ignore, true, 'stamped before the landing (clamped into the slack window, still before it)');
  const ok = request(g, 0, { t: cr.land + 0.05 }, { t: cr.land + 0.2, slack: PARTY.slack }); assert.equal(ok.rec.k, 'reel'); assert.equal(ok.rec.t, Math.round((cr.land + 0.05) * 100) / 100);
  const fut = request(g, 0, { t: cr.land + 9 }, { t: cr.land + 0.2, slack: PARTY.slack }); assert.equal(fut.rec.t, Math.round((cr.land + 0.2) * 100) / 100);
});

test('every find that moves faces its direction of travel (the fish\'s nose is at -x in its model): the drawn forward axis matches the velocity along the lane, for every kind, and a turn is eased', () => {
  assert.equal(yawFor('glimmerfin', 1), Math.PI); assert.equal(yawFor('glimmerfin', -1), 0); assert.equal(yawFor('lanternkoi', 1), Math.PI); assert.equal(yawFor('driftwood', 1), 0); assert.equal(yawFor('boot', -1), Math.PI);
  const w = createCastWorld({ scene: new THREE.Scene(), sfx: { play() {} }, particles: { burst() {} }, labels: { label() {}, clear() {} } });
  w.setVisible(true);
  const items = buildItems(41), g = init(41, roster(4)); let checked = 0; const kinds = new Set();
  for (let t = 3; t < 44; t += 1.1) {
    w.update(1 / 30, { mode: 'play', v: view(g, t), t, lanePlayers: [] });
    for (const it of items) {
      const pose = itemPose(it, t); if (!pose.on) continue;
      for (const lane of [0, 3]) {
        const h = w.findHeadings(it.kind).find((q) => Math.abs(q.x - (c.x + C.lanes[lane] + pose.x)) < 0.02 && Math.abs(q.z - (c.z + C.edgeZ - pose.d)) < 0.05); if (!h) continue;
        assert.equal(Math.sign(h.fx), Math.sign(velocityOf(it)), `${it.kind} #${it.i} swims ${velocityOf(it) > 0 ? 'right' : 'left'}: forward axis ${h.fx.toFixed(2)}`); assert.ok(Math.abs(h.fz) < 0.2, 'and along the lane'); checked++; kinds.add(it.kind);
      }
    }
  }
  assert.ok(checked > 30 && kinds.has('glimmerfin') && kinds.has('lanternkoi'), `${checked} headings checked (${[...kinds]})`);
  // easing: a find whose direction flips turns smoothly (several frames), it never jumps
  const mk = createCastWorld({ scene: new THREE.Scene(), sfx: { play() {} }, particles: { burst() {} }, labels: { label() {}, clear() {} } }); mk.setVisible(true);
  const it = items.find((x) => x.kind === 'glimmerfin'), tm = it.t0 + 1.5; mk.update(1 / 60, { mode: 'play', v: view(g, tm), t: tm, lanePlayers: [] });
  const first = mk.findHeadings('glimmerfin').find((q) => Math.abs(q.x - (c.x + C.lanes[0] + itemPose(it, tm).x)) < 0.02);
  assert.ok(first && Math.sign(first.fx) === Math.sign(velocityOf(it)));
});

test('the finds are big enough to read from the stage camera (every kind about as big as the hook\'s reach) and the reach is what the host judges; the water is alive: glints drift, droplets fly where a hook lands and where a find is pulled out, a swimming fish leaves bubbles; the words sit above the berth', () => {
  const labelLog = [], scene = new THREE.Scene(), w = createCastWorld({ scene, sfx: { play() {} }, particles: { burst() {} }, labels: { label: (t, at) => labelLog.push([t, at]), clear() {} } });
  w.setVisible(true);
  const items = buildItems(41), g = init(41, roster(2)), floor = PARTY.origin.y;
  const players = [0, 1].map((i) => ({ position: new THREE.Vector3(c.x + C.lanes[i], floor, c.z + C.berthZ), parts: {} }));
  // sizes: the instance scale of each kind, and their real footprint, against the hook's reach
  const t = 12; w.update(1 / 60, { mode: 'play', v: view(g, t), t, lanePlayers: players });
  const root = w.root, bigs = {};
  for (const kind of KINDS) { const mesh = root.children.find((o) => o.isInstancedMesh && o.name === '' && o.geometry && o.count > 0 && false); void mesh; }
  const inst = root.children.filter((o) => o.isInstancedMesh && o.geometry.attributes.color).slice(0, 6);          // (the six find meshes come first)
  assert.equal(inst.length, 6);
  const byKind = {}; KINDS.forEach((k, i) => { byKind[k] = inst[i]; });
  for (const kind of KINDS) { const m = byKind[kind]; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox, len = (b.max.x - b.min.x), hgt = (b.max.z - b.min.z); const sc = { driftwood: 2.1, glimmerfin: 2.2, bottle: 2.1, lanternkoi: 1.75, shell: 2.2, boot: 2.1 }[kind]; assert.ok(Math.max(len, hgt) * sc >= 1.3, `${kind} is ${(Math.max(len, hgt) * sc).toFixed(2)} u long`); assert.ok(Math.max(len, hgt) * sc <= C.hookR * 2.4, `${kind} is not bigger than the reach`); }
  assert.ok(C.hookR >= 1.4, 'the reach grew with the finds');
  // glints and bubbles
  assert.equal(w.glintCount(), 44); const m0 = root.children.find((o) => o.isInstancedMesh && o.count === 44 && !o.geometry.attributes.color); const x0 = new THREE.Matrix4(); m0.getMatrixAt(5, x0); const p0 = new THREE.Vector3().setFromMatrixPosition(x0);
  w.update(1, { mode: 'play', v: view(g, t + 1), t: t + 1, lanePlayers: players }); m0.getMatrixAt(5, x0); assert.ok(new THREE.Vector3().setFromMatrixPosition(x0).distanceTo(p0) > 0.1, 'the glints move');
  const fish = items.find((x) => x.kind === 'glimmerfin' && x.i > 3); let seenDrops = 0; for (let k = 0; k < 60; k++) { const tk = fish.t0 + 1 + k / 30; w.update(1 / 30, { mode: 'play', v: view(g, tk), t: tk, lanePlayers: players }); seenDrops = Math.max(seenDrops, w.dropCount()); }
  assert.ok(seenDrops >= 1, 'a swimming fish leaves bubbles'); assert.ok(w.dropCount() <= 140);
  // a cast that hooks: droplets burst where the hook lands, and the label is over the berth
  const am = aimed(items, 'driftwood'), g2 = init(41, roster(2)), cr = auto(g2, 0, am.t);
  w.update(1 / 60, { mode: 'play', v: view(g2, am.t + 0.1), t: am.t + 0.1, lanePlayers: players }); const before = w.dropCount();
  let peak = before; for (let k = 0; k < 20; k++) { const tk = cr.land + k / 60; w.update(1 / 60, { mode: 'play', v: view(g2, tk), t: tk, lanePlayers: players }); peak = Math.max(peak, w.dropCount()); }
  assert.ok(peak >= before + 6, `droplets fly when the hook lands (${before} -> ${peak})`);
  const hooked = labelLog.find((l) => l[0] === 'Hooked!'); assert.ok(hooked, 'the hook-up is announced');
  assert.ok(Math.abs(hooked[1].x - (c.x + C.lanes[0])) < 1e-6 && Math.abs(hooked[1].z - (c.z + C.berthZ)) < 1e-6 && hooked[1].y >= floor + 2.4, 'above the berth, not over the hook');
  // the catch: a splash where the find leaves the water and a label above the berth
  for (let k = 1; k <= needOf('driftwood'); k++) { send(g2, 0, cr.land + 0.05 + k * 0.1); }
  const tc = cr.land + 0.05 + 0.1 * needOf('driftwood') + 0.1; w.update(1 / 60, { mode: 'play', v: view(g2, tc), t: tc, lanePlayers: players }); const b2 = w.dropCount();
  const catchRec = { k: 'catch', slot: 0, n: 1, i: am.it.i, t: tc, pts: 1 }; labelLog.length = 0; w.onRec(catchRec, view(g2, tc), (s) => players[s]); w.update(1 / 60, { mode: 'play', v: view(g2, tc + 0.02), t: tc + 0.02, lanePlayers: players });
  assert.ok(w.dropCount() > b2, 'a splash when a find is pulled out'); const lab = labelLog.find((l) => /^\+/.test(l[0])); assert.ok(lab && Math.abs(lab[1].z - (c.z + C.berthZ)) < 1e-6 && lab[1].y >= floor + 2.4, 'the score label is above the berth');
  assert.ok(w.summary().meshes < 50, `draw calls ${w.summary().meshes}`);
});

test('the stage draws what the host judges: the marker at markerDepth() on the lane\'s middle (its ring is the hook\'s reach), every find at itemPose(), the hook where it landed, a hooked find riding the line; marker and hook are hidden while reeling', () => {
  const scene = new THREE.Scene(), w = createCastWorld({ scene, sfx: { play() {} }, particles: { burst() {} }, labels: { label() {}, clear() {} } });
  w.setVisible(true);
  const items = buildItems(41), g = init(41, roster(2)), floor = PARTY.origin.y;
  const players = [0, 1].map((i) => ({ position: new THREE.Vector3(c.x + C.lanes[i], floor, c.z + C.berthZ), parts: {} }));
  const ring = w.root.children.find((o) => o.isInstancedMesh && o.geometry.type === 'RingGeometry' && o.geometry.parameters.outerRadius === C.hookR); assert.ok(ring, 'the marker ring has the hook\'s radius');
  const { it, t } = aimed(items, 'glimmerfin');
  w.update(1 / 60, { mode: 'play', v: view(g, t), t, lanePlayers: players });
  const rest0 = w.hookDraw(0); assert.ok(rest0 && Math.abs(rest0.z - (c.z + C.edgeZ - 1.1)) < 1e-6, 'before the strike the bobber rests near the jetty while the ring sweeps');
  for (let i = 0; i < 2; i++) { const m = w.markerDraw(i); assert.ok(Math.abs(m.x - (c.x + C.lanes[i])) < 1e-9 && Math.abs(m.z - (c.z + C.edgeZ - markerDepth(t))) < 1e-9 && m.ready, `lane ${i}'s marker`); }
  const draws = w.findDraws(it.kind), pose = itemPose(it, t);
  for (let i = 0; i < 2; i++) assert.ok(draws.some((d) => Math.abs(d.x - (c.x + C.lanes[i] + pose.x)) < 0.01 && Math.abs(d.z - (c.z + C.edgeZ - pose.d)) < 0.01), `the find is drawn at itemPose() in lane ${i}`);
  const out = auto(g, 0, t), land = out.land, tl = land + 0.05;
  w.update(1 / 60, { mode: 'play', v: view(g, tl), t: tl, lanePlayers: players });
  const hk = w.hookDraw(0), hx = c.x + C.lanes[0], hz = c.z + C.edgeZ - out.d; assert.equal(out.hit, it.i);
  assert.ok(hk && Math.abs(hk.x - hx) < 1e-6 && Math.abs(hk.z - hz) < 1e-6, 'the drawn hook is at the judged landing point (count 0: not pulled yet)');
  const f = itemPose(it, land); assert.ok(Math.hypot(f.x, f.d - out.d) <= C.hookR, 'and the find it hooked is inside the ring');
  assert.equal(w.markerDraw(0).ready, false, 'no marker while reeling'); assert.equal(w.markerDraw(1).ready, true, 'the other lane keeps its marker'); const rest = w.hookDraw(1); assert.ok(rest && Math.abs(rest.x - (c.x + C.lanes[1])) < 1e-6 && Math.abs(rest.z - (c.z + C.edgeZ - 1.1)) < 1e-6, 'the other lane line rests in the water near the jetty (not at the marker)');
  const shown = w.findDraws(it.kind).filter((d) => Math.abs(d.x - hx) < 1.5 && Math.abs(d.z - hz) < 0.6); assert.ok(shown.length >= 1, 'the hooked find rides the line next to the hook');
  assert.ok(w.counts().marker === 1 && w.summary().meshes < 50, `draw calls ${w.summary().meshes}`);
  send(g, 0, tl); send(g, 0, tl + 0.1); w.update(1 / 60, { mode: 'play', v: view(g, tl + 0.15), t: tl + 0.15, lanePlayers: players });
  const hk2 = w.hookDraw(0); assert.ok(Math.hypot(hk2.x - hk.x, hk2.z - hk.z) > 0.05, 'the hook moves toward the angler as the reel count rises');
  w.update(1 / 60, { mode: 'wait', v: null, t: 0, lanePlayers: [] }); assert.equal(w.counts().marker, 0); w.setVisible(false);
});

test('practice on the stage uses the same rules: the scratch line rests by itself and nothing hooks without a press; a press strikes, then reel presses count (nothing scores)', () => {
  const w = createCastWorld({ scene: new THREE.Scene(), sfx: { play() {} }, particles: { burst() {} }, labels: { label() {}, clear() {} } });
  w.setVisible(true); const p = { position: new THREE.Vector3(c.x + C.lanes[0], PARTY.origin.y, c.z + C.berthZ), parts: {} };
  assert.equal(w.practicePress(0, p), null, 'before the practice has run');
  // no presses: the bobber only rests, it never travels out to the water or reels
  let moved = false; for (let k = 0; k < 30 * 10; k++) { w.update(1 / 30, { mode: 'practice', v: null, t: 0, lanePlayers: [p, null, null, null] }); const h = w.hookDraw(0); if (h && Math.abs(h.z - (c.z + C.edgeZ - 1.1)) > 0.05) moved = true; }
  assert.equal(moved, false, 'with nobody pressing the line just rests'); assert.equal(w.counts().bob >= 1, true);
  let presses = 0, travelled = false;
  for (let k = 0; k < 30 * 22; k++) { w.update(1 / 30, { mode: 'practice', v: null, t: 0, lanePlayers: [p, null, null, null] }); const h = w.hookDraw(0); if (h && Math.abs(h.z - (c.z + C.edgeZ - 1.1)) > 0.5) travelled = true; if (k % 4 === 0 && w.practicePress(0, p)) presses++; }
  assert.ok(travelled, 'a press sends the hook out to the water'); assert.ok(presses >= 3, `${presses} presses counted (strikes and reel pulls)`); assert.equal(w.scoreText(null, 0).text, '');
});

test('bots time their strike, then mash: nothing before the line is ready, a press when the ring crosses a find (error about skill.noise), none while hooked before the hook lands, then reel presses at about skill.reel per second; boots are skipped unless fooled', () => {
  const rng = mulberry32(1), items = buildItems(41);
  const solo = (skl, seed, secs = 50) => {                                      // one bot alone in a game, its presses go through request() like the runtime's
    const g = init(seed, roster(1)), mem = {}, r = mulberry32(seed); let strikes = 0, hits = 0, early = 0, pulls = 0;
    for (let t = 0; t < secs; t += 1 / 60) {
      const o = bot(view(g, t), { slot: 0, mem }, skl, r), before = g.st[0].mode;
      if (o.interact) { if (before !== 'reel' && t < g.st[0].readyAt) early++; const out = request(g, 0, { t }, { t, slack: PARTY.slack, lag: 0.3 }); if (out.rec) { apply(g, out.rec); if (out.rec.k === 'cast') { strikes++; if (out.rec.hit >= 0) hits++; } else pulls++; } }
      for (const rc of step(g, { t }, 1 / 60, t)) apply(g, rc);
    }
    return { g, strikes, hits, early, pulls };
  };
  const g0 = init(8, roster(1)); assert.deepEqual(bot(view(g0, 0.2), { slot: 0, mem: {} }, PARTY.bots.hard, rng), { x: 0, y: 0 }, 'the line is not out yet: nothing');
  for (const d of ['easy', 'normal', 'hard']) {
    const r = solo(PARTY.bots[d], 41); assert.equal(r.early, 0, `${d}: never presses while the line is coming back`); assert.ok(r.strikes >= 3 && r.hits >= 2 && r.pulls >= 10, `${d}: ${r.strikes} strikes, ${r.hits} hooks, ${r.pulls} reel pulls`); assert.ok(r.g.score[0] > 0, `${d} scores`);
  }
  const aim = (skl) => { let hit = 0, n = 0; for (let seed = 1; seed <= 12; seed++) { const r = solo(skl, seed, 30); hit += r.hits; n += r.strikes; } return hit / n; };
  const sharp = aim({ ...PARTY.bots.hard, fool: 0 }), sloppy = aim({ ...PARTY.bots.easy, fool: 0 }); assert.ok(sharp > 0.85 && sharp > sloppy, `hard strikes land ${sharp.toFixed(2)} vs easy ${sloppy.toFixed(2)}`);
  let boots = 0; for (let seed = 1; seed <= 12; seed++) boots += solo({ ...PARTY.bots.hard, fool: 0 }, seed, 50).g.boots[0]; assert.equal(boots, 0, 'a bot that cannot be fooled never hooks a boot');
  let fooled = 0; for (let seed = 1; seed <= 12; seed++) fooled += solo({ ...PARTY.bots.hard, fool: 1 }, seed, 50).g.boots[0]; assert.ok(fooled >= 2, `a fooled bot hooks boots (${fooled})`);
  // reel speed: hard mashes much faster than easy once something is hooked
  const { it, t } = aimed(items, 'bottle');
  const count = (skl) => { const gg = init(41, roster(1)), c3 = auto(gg, 0, t), mm = {}; assert.equal(c3.hit, it.i); let k = 0; for (let tt = c3.land; tt < c3.land + 3; tt += 1 / 60) if (bot(view(gg, tt), { slot: 0, mem: mm }, skl, mulberry32(5)).interact) k++; return k; };
  const fast = count(PARTY.bots.hard), slow = count(PARTY.bots.easy); assert.ok(fast > slow * 2.2 && fast >= 18, `hard mashes ${fast} vs easy ${slow} presses in 3 s`);
  const g2 = init(41, roster(1)), cr = auto(g2, 0, t), m2 = {}; let early = 0; for (let tt = t; tt < cr.land; tt += 1 / 60) if (bot(view(g2, tt), { slot: 0, mem: m2 }, PARTY.bots.easy, rng).interact) early++; assert.equal(early, 0, 'no pull before the hook lands');
  // nobody pressing, nobody hooked: a whole game of idle seats catches nothing
  const idle = init(77, roster(4)); run(idle, 0, C.cap + 0.1); assert.deepEqual(idle.score, { 0: 0, 1: 0, 2: 0, 3: 0 }); assert.equal(idle.got[0] + idle.got[1], 0);
});

test('win rates over seeded runs: timing and mash speed are the skill: a scripted average kid (strike noise 0.12 s, 6 presses a second) beats easy bots about 70% of the time and loses to hard ones; no lane is favoured; a game lasts the full 50 s', () => {
  const B = PARTY.bots, n = 160;
  const easy = rate(playCast, KID, [B.easy, B.easy, B.easy], n), normal = rate(playCast, KID, [B.normal, B.normal, B.normal], n), hard = rate(playCast, KID, [B.hard, B.hard, B.hard], n);
  assert.ok(easy > 0.6 && easy < 0.85, `kid vs easy ${easy}`); assert.ok(hard < 0.3, `kid vs hard ${hard}`); assert.ok(easy > normal && normal > hard - 0.02, `${easy} > ${normal} > ${hard}`);
  const wins = [0, 0, 0, 0]; let total = 0, games = 60, points = 0;
  for (let i = 0; i < games; i++) { const r = playCast(2100 + i * 17, [B.normal, B.normal, B.normal, B.normal], i + 1); total += r.t; for (const p of r.placing) { points += p.score; if (p.place === 1) wins[p.slot]++; } }
  const mean = wins.reduce((a, b) => a + b, 0) / 4; for (const wn of wins) assert.ok(Math.abs(wn - mean) < mean * 0.6, `lane wins ${wins}`);
  assert.ok(total / games > 49.5 && total / games < 52, `average length ${(total / games).toFixed(1)} s`); assert.ok(points / games / 4 > 8 && points / games / 4 < 60, `average score ${(points / games / 4).toFixed(1)}`);
});

test('Driftwood Cast on the real runtime: every player holds the Glowline Rod from the how-to, bots strike and reel with their own presses, nothing is hooked by itself, a real Interact press (the keyboard Q + E exit aside) is a request judged by the host, the rod is put away afterwards', async () => {
  const r = makeRuntime(); r.pm.p1.teleport(10, 14);
  r.party.open({ bots: 'fill', difficulty: 'normal', games: ['cast', 'glowcap'] });
  await r.party.play('cast'); r.run(8, () => r.pm.bots.length === 3);
  const rod = (p) => p.parts.handSocket.getObjectByName('party-rod');
  r.run(6, () => r.party.state.phase === 'howto'); assert.equal(r.party.state.phase, 'howto'); for (const p of r.pm.list) assert.ok(rod(p), 'a rod in hand during the how-to');
  r.run(40, () => r.party.state.phase === 'play'); assert.equal(r.party.state.phase, 'play'); for (const p of r.pm.list) assert.ok(rod(p), 'and in the game');
  // a real Interact press from the person at slot 0: a strike request (the host judges it at the marker); before it nothing was hooked for them
  const acts = [], act = r.party.domain.act; r.party.domain.act = (...a) => { acts.push(a); return act(...a); };
  r.run(1.2); assert.equal(r.party.state.g.st[0].n, 0, 'nothing is cast or hooked for a person who has not pressed');
  r.pm.fake('p1', { x: 0, y: 0, interact: true }); r.run(0.1); r.pm.fake('p1', { x: 0, y: 0, interact: false }); r.run(0.2);
  assert.ok(acts.length >= 1, 'the press became a request'); assert.ok(r.party.state.g.st[0].n >= 1, 'and the host judged it as a strike');
  r.run(160, () => r.party.state.phase === 'results');
  const s = r.party.state; assert.equal(s.phase, 'results'); assert.ok(s.g.done);
  const mine = s.results.ranks.find((x) => x.slot === 0), bots = s.results.ranks.filter((x) => x.slot !== 0);
  assert.ok(bots.reduce((a, b) => a + b.score, 0) >= 6 && bots.filter((b) => b.score > 0).length >= 2, `the bots reeled in treasure: ${bots.map((b) => b.score)}`); assert.ok(mine.score <= Math.min(...bots.map((b) => b.score)), 'a person who never reels scores nothing'); assert.ok(s.g.got[1] + s.g.got[2] + s.g.got[3] >= 4);
  for (const slot of [1, 2, 3]) assert.ok(s.g.st[slot].n >= 3, 'the bots strike again and again');
  assert.ok(r.calls.sfx.includes('hooked') && r.calls.sfx.includes('reelclick') && r.calls.sfx.includes('castline') && r.calls.sfx.includes('chime')); assert.ok(r.calls.music.includes('cast'));
  r.run(PARTY.flow.results + 1, () => r.party.state.phase === 'lobby'); for (const p of r.pm.list) assert.equal(rod(p), undefined, 'the rod is put away in the lobby'); assert.equal(r.party.summary().stages.cast.visible, false);
  // the second play skips the how-to, and the rods are in hand for the countdown all the same
  await r.party.play('cast'); r.run(12, () => ['howto', 'countdown'].includes(r.party.state.phase));
  assert.equal(r.party.state.phase, 'countdown', 'a repeat play skips the how-to'); r.run(0.3);
  for (const p of r.pm.list) assert.ok(rod(p), 'the rod is in hand on a repeat play');
  const sp = stageSpawns('cast', 4); r.run(0.5); assert.ok(Math.hypot(r.pm.p1.position.x - sp[0].x, r.pm.p1.position.z - sp[0].z) < 1.5, 'everybody is on their berth');
  r.party.close(); r.run(4); for (const p of r.pm.list) assert.equal(rod(p), undefined);
});

test('the berth keeps a walking person on the jetty pad (the stick only walks) and the camera frames every lane, the jetty and the bench at 16:9, 9:16 and a landscape phone', async () => {
  const r = makeRuntime(); r.party.open({ bots: 0, games: ['cast'] }); await r.party.play('cast'); r.run(8, () => r.party.place === 'cast');
  for (const aspect of [16 / 9, 9 / 16, 19.5 / 9]) {
    r.camera.aspect = aspect; r.camera.updateProjectionMatrix(); r.followCam.snap(); r.party.updateCamera(0); r.camera.updateMatrixWorld(true);
    const pts = [];
    for (const lx of C.lanes) { for (const d of [0, C.depthMax + 0.5]) for (const sx of [-C.laneHalf, C.laneHalf]) pts.push([c.x + lx + sx, 0, c.z + C.edgeZ - d]); pts.push([c.x + lx, 2.2, c.z + C.berthZ], [c.x + lx, 0, c.z + C.benchZ + 1.4]); }
    for (const [x, y, z] of pts) { const p = new THREE.Vector3(x, PARTY.origin.y + y, z).project(r.camera); assert.ok(Math.abs(p.x) < 0.98 && Math.abs(p.y) < 0.98 && p.z < 1, `${aspect}: ${(x - c.x).toFixed(1)}, ${(z - c.z).toFixed(1)} -> ${p.x.toFixed(2)}, ${p.y.toFixed(2)}`); }
  }
  const p1 = r.pm.p1; r.pm.fake('p1', { x: 1, y: 0 }); r.run(3); assert.ok(isWalkable(p1.position.x, p1.position.z) && p1.position.x - c.x < C.lanes[0] + C.berthR + 0.1, 'it stopped at the pad\'s edge'); r.pm.fake('p1', { x: 0, y: 0 });
  r.party.close(); r.run(4);
});

// ---------------------------------------------------------------------------------------------------------------- host + replica
test('a host + replica pair play a whole Driftwood Cast with equal hashes; a replica\'s stamped presses (cast and reel) are judged by the host; the results agree', () => {
  const w = pair(), slots = [0, 1, w.rSlot];
  w.host.open({ games: ['cast'], bots: 0 }); w.flush(); w.host.debug.play('cast'); w.flush();
  for (let i = 0; i < 2; i++) { w.host.skip(); w.flush(); }
  assert.equal(w.host.state.phase, 'countdown'); w.run(PARTY.flow.countdown + 0.2); assert.equal(w.host.state.phase, 'play'); w.equal('at the start');
  const mems = {}, rng = mulberry32(3); let n = 0;
  w.run(70, 1 / 30, () => {
    const g = w.host.state.g; if (!g) return true;
    const v = view(g, w.host.gameTime());
    for (const s of slots) { const o = bot(v, { slot: s, x: 0, z: 0, mem: mems[s] ||= {} }, s === w.rSlot ? PARTY.bots.hard : PARTY.bots.normal, rng); if (o.interact) { if (s === w.rSlot) w.replica.act(w.rActor(), w.replica.gameTime()); else w.host.act(w.host.hostActor(s), w.host.gameTime()); } }
    if (++n % 25 === 0) { w.flush(); w.equal(`mid game ${n}`); }
    return w.host.state.phase !== 'results';
  });
  w.flush(); assert.equal(w.host.state.phase, 'results'); w.equal('at the results');
  assert.deepEqual(w.replica.state.g.score, w.host.state.g.score); assert.ok(w.host.state.g.score[w.rSlot] > 8, 'the replica\'s presses were judged: it hooked and reeled finds');
  assert.deepEqual(w.host.state.results.ranks, w.replica.state.results.ranks);
});

// ---------------------------------------------------------------------------------------------------------------- music + sounds + icons
test('track 30 Sunset Jetty: a laid-back steel-pan calypso at 104 bpm, pinned; the game plays it; the new sounds and the icon exist', () => {
  assert.equal(TRACK_TITLES[30], 'Sunset Jetty'); assert.equal(PARTY_TRACKS.cast, 30); assert.equal(GAME.track, 'cast');
  assert.equal(createHash('sha256').update(JSON.stringify(getTrack(30).events)).digest('hex'), '7964f0f602945537848aec5ed5b42b3bc60ed386e1acfa19e0a5ab9bc4478218');
  assert.equal(createHash('sha256').update(JSON.stringify(getTrack(28).events)).digest('hex') === createHash('sha256').update(JSON.stringify(getTrack(28).def.build().events)).digest('hex'), true);
  const info = trackInfo()[30], tr = getTrack(30); assert.equal(info.bpm, 104); assert.ok(info.seconds > 45 && info.seconds < 70); assert.ok(tr.def.swing > 0.55, 'swung');
  const kinds = new Set(tr.events.map((e) => e.k)); for (const k of ['bass', 'pluck', 'shaker', 'marimba', 'bell', 'lead']) assert.ok(kinds.has(k), k);
  assert.ok(tr.events.some((e) => e.k === 'lead' && e.o && e.o.style === 'whistle'), 'a whistle lead');
  let prev = 0; for (const e of tr.events) { assert.ok(e.s >= prev && e.s < tr.steps && e.d > 0 && e.v > 0 && e.v <= 1); prev = e.s; for (const nn of Array.isArray(e.m) ? e.m : [e.m]) assert.ok(Number.isFinite(nn)); }
  const sfx = new Sfx(), names = ['castline', 'reelclick', 'hooked', 'blah'];
  for (const nme of names) assert.doesNotThrow(() => sfx.play(nme, { pitch: 1.2, vol: 0.5 }), nme);
  const ctx = { currentTime: 0, state: 'running', destination: {}, createOscillator: () => ({ type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, connect(x) { return x; }, start() {}, stop() {} }), createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, connect(x) { return x; } }), createBufferSource: () => ({ buffer: null, connect(x) { return x; }, start() {}, stop() {}, playbackRate: { value: 1 } }), createBiquadFilter: () => ({ type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, value: 0 }, Q: { value: 0 }, connect(x) { return x; } }), createBuffer: () => ({ getChannelData: () => new Float32Array(8) }), sampleRate: 8000 };
  sfx.ctx = ctx; sfx.master = { connect() {} };
  for (const nme of names) { try { sfx.play(nme, { pitch: 1.2 }); } catch (e) { assert.fail(`${nme}: ${e.message}`); } }
  assert.ok(ICONS['party-cast'] && ICONS['party-cast'].startsWith('<svg') && ICONS['party-cast'].endsWith('</svg>')); assert.doesNotMatch(ICONS['party-cast'], /[\u{1F300}-\u{1FAFF}☀-➿]/u);
});
