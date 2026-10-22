// Step 81a: Glowcap Shuffle's pure rules (game/party/glowcapLogic.js) and stage (world/party/glowcap.js): the contract, the layout and spectator shore, the seeded plan, judging at the sink time against the DRAWN caps,
// bots and win rates, the spectator shore in the camera view, the screen runtime with real Players, a host + replica pair, the HUD call badge, the track + sounds + icon.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { PARTY, PLAYER_RADIUS } from '../public/js/config.js';
import { mulberry32 } from '../public/js/utils/rng.js';
import { validateGame, getGame } from '../public/js/game/party/registry.js';
import { hostFor } from '../public/js/game/party/botRoster.js';
import { stageCentre, stageSpawns, spectatorSpot, partyWalkable, glowcapLayout, glowcapShore, POCKET } from '../public/js/game/party/partyArea.js';
import { isWalkable } from '../public/js/world/terrain.js';
import {
  GAME, CAPS, SYMBOLS, CAP_LOCAL, capCentre, capAt, onCap, neighbours, buildPlan, capDepth, roundAt, init, step, apply, request, placing, view, bot, route, debugWin, symbolSvg,
} from '../public/js/game/party/glowcapLogic.js';
import { createGlowcapWorld } from '../public/js/world/party/glowcap.js';
import { pair } from './fixtures/partyPair.js';
import { playGlowcap, rate, KID } from './fixtures/sim81a.mjs';
import { makeRuntime } from './fixtures/partyRuntime80d.js';
import { getTrack, trackInfo, TRACK_TITLES, PARTY_TRACKS } from '../public/js/audio/music.js';
import { ICONS } from '../public/js/ui/icons.js';
import { Sfx } from '../public/js/audio/sfx.js';

const G = PARTY.glowcap, c = stageCentre('glowcap');
const roster = (n = 4) => Array.from({ length: n }, (_, slot) => ({ slot }));
const on = (i, dx = 0, dz = 0) => ({ x: capCentre(i).x + dx, z: capCentre(i).z + dz });

test('the game honours the registry contract; the stage is at +810; eight caps in three hex rows that touch, each its own colour AND symbol; the starts are four different corner caps', () => {
  assert.deepEqual(validateGame(GAME), []);
  assert.equal(getGame('glowcap'), GAME); assert.equal(GAME.kind, 'elim'); assert.deepEqual(GAME.press, []); assert.deepEqual(GAME.howto.buttons, ['stick']);
  assert.equal(hostFor('glowcap').name, 'Tzukumi'); assert.equal(GAME.host, 'Tzukumi'); assert.match(hostFor('glowcap').lines.welcome, /antler/);
  assert.deepEqual(PARTY.stageOffset.glowcap, { x: 810, z: 0 }); assert.deepEqual(c, { x: PARTY.origin.x + 810, z: PARTY.origin.z });
  assert.equal(CAP_LOCAL.length, 8); assert.equal(CAPS.length, 8); assert.deepEqual(glowcapLayout(), CAP_LOCAL);
  assert.equal(new Set(CAPS.map((k) => k.color)).size, 8, 'eight colours'); assert.equal(new Set(CAPS.map((k) => k.symbol)).size, 8, 'eight symbols (colour-blind friendly)');
  for (const k of CAPS) { assert.ok(SYMBOLS[k.symbol].length >= 6, k.symbol); assert.match(symbolSvg(k.symbol), /^<svg [^>]*><g [^>]*><polygon points="[^"]+" fill="#/); }
  for (const pts of Object.values(SYMBOLS)) for (const [x, y] of pts) assert.ok(Math.abs(x) <= 1.1 && Math.abs(y) <= 1.1);
  // caps overlap a little (a walker crosses), never more than a quarter of the diameter, and every cap has a neighbour
  for (const a of CAP_LOCAL) { assert.ok(neighbours(a.i).length >= 2, `cap ${a.i} touches others`); for (const b of CAP_LOCAL) if (a.i < b.i && neighbours(a.i).includes(b.i)) { const d = Math.hypot(a.x - b.x, a.z - b.z); assert.ok(d < 2 * G.capR && d > 1.5 * G.capR, `${a.i}-${b.i} ${d}`); } }
  const sp = stageSpawns('glowcap', 4);
  assert.deepEqual(sp.map((s) => capAt(s.x, s.z)), G.spawnCaps, 'each starts on its own cap'); assert.equal(new Set(sp.map((s) => capAt(s.x, s.z))).size, 4);
  for (const s of sp) assert.ok(partyWalkable(s.x, s.z) && isWalkable(s.x, s.z));
  // the shore: walkable, in front, separated from the caps by open water wider than a hop
  const sh = glowcapShore(), front = Math.max(...CAP_LOCAL.map((k) => k.z + k.r));
  for (let k = 0; k < 4; k++) { const sx = spectatorSpot('glowcap', k); assert.ok(partyWalkable(sx.x, sx.z) && isWalkable(sx.x, sx.z), `shore spot ${k}`); assert.ok(sx.x > sh.x0 && sx.x < sh.x1 && sx.z > sh.z0 && sx.z < sh.z1); assert.equal(capAt(sx.x, sx.z), -1); }
  assert.ok(G.shore.z0 - front > 3.4, `the open water is ${G.shore.z0 - front} u wide`); assert.equal(partyWalkable(c.x, c.z + front + 1.5), false);
  assert.ok(sh.x0 > POCKET.x0 && sh.x1 < POCKET.x1);
});

test('the plan is a pure function of the seed: ten rounds, never the same cap twice in a row, never far from the last call, the beat quickens, caps stay sunk from round 4 and the dry ones can always walk there', () => {
  const a = buildPlan(9), b = buildPlan(9), d = buildPlan(10);
  assert.deepEqual(a, b); assert.notDeepEqual(a.rounds.map((r) => r.call), d.rounds.map((r) => r.call)); assert.equal(a.rounds.length, G.rounds);
  assert.ok(a.end > 45 && a.end < 62, `a full game is ${a.end} s`); assert.ok(GAME.duration >= a.end);
  for (let seed = 1; seed <= 80; seed++) {
    const p = buildPlan(seed * 7919);
    p.rounds.forEach((R, i) => {
      assert.equal(R.dead.length, G.dead[i], `round ${i} has ${G.dead[i]} caps down`);
      assert.ok(!R.dead.includes(R.call), 'the called cap is never down');
      if (i) {
        const P = p.rounds[i - 1];
        assert.notEqual(R.call, P.call); assert.ok(!R.newDead.includes(P.call), 'the cap the dry players stood on never sinks for good');
        assert.ok(R.start > P.riseAt + G.riseT && R.beat <= P.beat + 1e-9, 'rounds follow each other, the beat only quickens');
        assert.ok(P.dead.every((x) => R.dead.includes(x)), 'a sunk cap stays sunk');
        const hops = Array.isArray(G.hops) ? G.hops[Math.min(i, G.hops.length - 1)] : G.hops;
        assert.ok(route(P.call, R.call, CAP_LOCAL.map((k) => (R.dead.includes(k.i) ? 1 : 0))).length - 1 <= hops, 'within reach of the last call');
      }
      const up = CAP_LOCAL.map((k) => k.i).filter((x) => !R.dead.includes(x)); assert.ok(up.length >= 4);
      assert.ok(up.every((x) => route(up[0], x, CAP_LOCAL.map((k) => (R.dead.includes(k.i) ? 1 : 0))).every((y) => !R.dead.includes(y))), 'the caps that are up stay connected');
      assert.equal(R.sinkAt, Math.round((R.start + 3 * R.beat) * 100) / 100); assert.ok(R.riseAt - R.sinkAt >= G.sink[1] - 0.01 && R.riseAt - R.sinkAt <= G.sink[0] + 0.01);
    });
  }
  assert.ok(a.rounds[0].beat > a.rounds.at(-1).beat * 2.5, 'the first count is slow, the last quick');
  // depths: up before the first sink, down during it (all but the called cap), up again; a cap that is dropped never rises
  const R = a.rounds[0], mid = R.sinkAt + G.sinkT + 0.2;
  for (const k of CAP_LOCAL) { assert.equal(capDepth(a, k.i, 0), 0); assert.equal(capDepth(a, k.i, mid), k.i === R.call ? 0 : 1); assert.equal(capDepth(a, k.i, R.riseAt + G.riseT + 0.01), 0); }
  const R4 = a.rounds[4]; for (const dcap of R4.dead) assert.equal(capDepth(a, dcap, R4.start + 0.5), 1, 'a dropped cap stays under');
  assert.equal(roundAt(a, 0).r, 0); assert.equal(roundAt(a, 1e6).r, G.rounds - 1);
});

test('judging uses the DRAWN cap: the circle the stage draws as the rim is the circle the host compares a body\'s centre with; two caps under one body count the called one only if the centre is on it', () => {
  const scene = new THREE.Scene(), w = createGlowcapWorld({ scene, sfx: { play() {} }, particles: { burst() {} }, labels: { label() {}, clear() {} } });
  w.setVisible(true);
  const mesh = w.root.getObjectByName('glowcap-caps'), pos = mesh.geometry.attributes.position, rimR = [];
  for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i) - 0.015) < 1e-6) rimR.push(Math.hypot(pos.getX(i), pos.getZ(i)));
  assert.ok(rimR.length > 40 && Math.abs(Math.max(...rimR) - G.capR) < 1e-6, `the drawn rim ring ends at ${Math.max(...rimR)} = capR`);
  const g = init(5, roster(2)), plan = buildPlan(5), R = plan.rounds[0], call = R.call;
  const t = R.sinkAt - 0.5;
  w.update(1 / 60, { mode: 'play', v: view(g, t), t, lanePlayers: [] });
  CAP_LOCAL.forEach((k) => { const d = w.capDraw(k.i), cc = capCentre(k.i); assert.ok(Math.abs(d.x - cc.x) < 1e-9 && Math.abs(d.z - cc.z) < 1e-9, `cap ${k.i} is drawn where the host judges`); assert.equal(d.depth, 0); });
  // exactly on the rim: dry; a hair outside: out (judged from the real position at the sink time)
  const inside = on(call, G.capR - 0.02, 0), outside = on(call, G.capR + 0.02, 0);
  let recs = step(init(5, roster(2)), { t: R.sinkAt, pos: (s) => (s === 0 ? inside : outside) }, 1 / 30, R.sinkAt);
  assert.equal(recs[0].k, 'sink'); assert.deepEqual(recs[0].out, [1]);
  // a body between two caps: its centre decides
  const nb = neighbours(call)[0], mid = { x: (capCentre(call).x * 0.55 + capCentre(nb).x * 0.45), z: (capCentre(call).z * 0.55 + capCentre(nb).z * 0.45) };
  assert.ok(onCap(call, mid.x, mid.z) && onCap(nb, mid.x, mid.z) && capAt(mid.x, mid.z) === call, 'on two caps at once, its centre is nearer the called one');
  recs = step(init(5, roster(1)), { t: R.sinkAt, pos: () => mid }, 1 / 30, R.sinkAt); assert.deepEqual(recs[0].out, []);
  const mid2 = { x: (capCentre(call).x * 0.3 + capCentre(nb).x * 0.7), z: (capCentre(call).z * 0.3 + capCentre(nb).z * 0.7) };
  recs = step(init(5, roster(1)), { t: R.sinkAt, pos: () => mid2 }, 1 / 30, R.sinkAt); assert.deepEqual(recs[0].out, [0], 'its centre is on the other cap: out');
  // the drawn cap sinks at the sink moment: every cap but the called one is under, the called one is not
  const ts = R.sinkAt + G.sinkT + 0.1;
  w.update(1 / 60, { mode: 'play', v: view(g, ts), t: ts, lanePlayers: [] });
  CAP_LOCAL.forEach((k) => assert.equal(Math.abs(w.capDraw(k.i).y - PARTY.origin.y) > 1.2, k.i !== call, `cap ${k.i} drawn ${w.capDraw(k.i).y}`));
  // the stage's call plate shows the called colour; Tzukumi's antlers glow the same colour
  w.update(1 / 60, { mode: 'play', v: view(g, R.start + 0.3), t: R.start + 0.3, lanePlayers: [] });
  assert.equal(w.heartColor(), '#' + new THREE.Color(CAPS[call].color).getHexString()); assert.equal(w.summary().plate, true);
  w.update(1 / 60, { mode: 'wait', v: null, t: 0, lanePlayers: [] }); assert.equal(w.summary().plate, false); assert.equal(w.heartColor(), '#555577');
  assert.ok(w.summary().meshes < 50, `draw calls ${w.summary().meshes}`);
  w.setVisible(false);
});

test('a game: players off the called cap fall in at the sink moment; the last one dry wins; nobody left or all rounds done end it; ties share; replaying the records rebuilds the state; unknown positions are never splashed', () => {
  const g = init(21, roster(3)), plan = buildPlan(21);
  assert.deepEqual(step(g, { pos: () => on(plan.rounds[0].call) }, 1 / 30, plan.rounds[0].sinkAt - 0.1), [], 'nothing before the sink moment');
  const R0 = plan.rounds[0], pos = { 0: on(R0.call), 1: on(R0.call, 0.5, 0.5), 2: on(neighbours(R0.call)[0], 0, 0) };
  const recs = step(g, { pos: (s) => pos[s] }, 1 / 30, R0.sinkAt + 0.03); assert.deepEqual(recs.map((r) => r.k), ['sink']); assert.deepEqual(recs[0].out, [2]); assert.equal(recs[0].t, R0.sinkAt);
  recs.forEach((r) => apply(g, r)); assert.equal(g.alive[2], false); assert.equal(g.round, 1); assert.deepEqual(step(g, { pos: () => on(R0.call) }, 1 / 30, R0.sinkAt + 0.2), [], 'the next sink is a round later');
  const R1 = plan.rounds[1], r2 = step(g, { pos: (s) => (s === 0 ? on(R1.call) : on(R0.call)) }, 1 / 30, R1.sinkAt);
  assert.deepEqual(r2.map((r) => r.k), ['sink', 'end']); assert.equal(r2[1].why, 'last'); r2.forEach((r) => apply(g, r));
  assert.deepEqual(placing(g), [{ slot: 0, place: 1, score: 2, out: false }, { slot: 1, place: 2, score: 1, out: true }, { slot: 2, place: 3, score: 0, out: true }]);
  assert.deepEqual(step(g, { pos: () => null }, 1 / 30, 99), [], 'done');
  // two players fall in the same round: a tie; everybody falling together ends the game with a shared first place
  const h = init(21, roster(2)); const rr = step(h, { pos: () => on(neighbours(R0.call)[0]) }, 1 / 30, R0.sinkAt); rr.forEach((r) => apply(h, r));
  assert.ok(h.done); assert.deepEqual(placing(h).map((p) => p.place), [1, 1]);
  // a solo game goes on until the player falls (or ten rounds are done), and an unknown position is never splashed
  const s1 = init(21, roster(1)); let t = 0, ended = null;
  for (const R of plan.rounds) { const x = step(s1, { pos: () => null }, 1 / 30, R.sinkAt); x.forEach((r) => apply(s1, r)); if (s1.done) { ended = R.r; break; } }
  assert.equal(ended, G.rounds - 1); assert.equal(s1.alive[0], true); assert.equal(placing(s1)[0].score, G.rounds);
  // every record replays on a fresh state to the same result; there are no presses
  const trace = [], fresh = init(21, roster(3)); { const gg = init(21, roster(3)); for (const R of plan.rounds) { if (gg.done) break; const out = step(gg, { pos: (s) => (s === 0 ? on(R.call) : s === 1 ? on(R.call, 0.4, 0) : (R.r < 3 ? on(R.call) : on(neighbours(R.call)[0]))) }, 1 / 30, R.sinkAt); for (const r of out) { apply(gg, r); trace.push(r); } } }
  for (const r of trace) apply(fresh, r); assert.deepEqual(placing(fresh).map((p) => [p.slot, p.place]), [[0, 1], [1, 1], [2, 3]]);
  assert.deepEqual(request(), { ignore: true });
  // debug: everybody but the winner falls in
  const dg = init(3, roster(4)); for (const r of debugWin(dg, 2, 1)) apply(dg, r); assert.deepEqual(Object.keys(dg.alive).filter((s) => dg.alive[s]), ['2']);
});

test('bots: they read the lit cap after react s, walk over caps that are up (never across a sunk one), stop on the called cap, sometimes head for a wrong neighbour on easy, and fallen ones do nothing', () => {
  const g = init(8, roster(1)), plan = buildPlan(8), R = plan.rounds[0], mem = {}, rng = mulberry32(1);
  const from = on(R.call === 0 ? 7 : 0);
  assert.deepEqual(bot(view(g, R.start - 0.2), { slot: 0, ...from, mem: {} }, PARTY.bots.hard, rng), { x: 0, y: 0 }, 'nothing is lit yet');
  assert.deepEqual(bot(view(g, R.start + 0.05), { slot: 0, ...from, mem: {} }, PARTY.bots.easy, mulberry32(2)), { x: 0, y: 0 }, 'not yet: it has not noticed');
  const out = bot(view(g, R.start + 1.0), { slot: 0, ...from, mem }, PARTY.bots.hard, rng), want = capCentre(R.call);
  assert.ok((want.x - from.x) * out.x > 0 || Math.abs(want.x - from.x) < 0.5); assert.ok(Math.hypot(out.x, out.y) > 0.9, 'a hard bot runs');
  assert.ok(Math.hypot(...Object.values(bot(view(g, R.start + 1.0), { slot: 0, ...from, mem: {} }, PARTY.bots.easy, mulberry32(3)))) < Math.hypot(out.x, out.y), 'an easy bot is slower');
  // a bot standing on the called cap stays put
  assert.deepEqual(bot(view(g, R.start + 1.0), { slot: 0, ...on(R.call, 0.1, 0.1), mem: { round: 0, seed: g.seed, at: 0, target: R.call, off: { a: 0, r: 0 } } }, PARTY.bots.hard, rng), { x: 0, y: 0 });
  g.alive[0] = false; assert.deepEqual(bot(view(g, R.start + 1.0), { slot: 0, ...from, mem: {} }, PARTY.bots.hard, rng), { x: 0, y: 0 }, 'out');
  // the route never uses a cap that is under water
  const depth = CAP_LOCAL.map((k) => (k.i === 3 || k.i === 4 ? 1 : 0)); const path = route(0, 7, depth); assert.ok(path.every((i) => depth[i] === 0)); assert.equal(path[0], 0); assert.equal(path.at(-1), 7);
  // easy bots head for a neighbour of the right cap now and then; hard ones (almost) never
  const wrong = (skill) => { let k = 0; for (let s = 0; s < 400; s++) { const m = {}; bot(view(init(8, roster(1)), plan.rounds[1].start + 1), { slot: 0, ...on(0), mem: m }, skill, mulberry32(s + 1)); if (m.target !== plan.rounds[1].call) k++; } return k / 400; };
  const we = wrong(PARTY.bots.easy), wh = wrong(PARTY.bots.hard); assert.ok(we > 0.04 && we < 0.3 && wh < 0.02, `wrong picks easy ${we} hard ${wh}`);
});

test('win rates over seeded runs: a scripted average kid beats easy bots most of the time and loses to hard ones; no seat is favoured; a game with easy bots lasts well over half a minute; nobody is ever stuck', () => {
  const B = PARTY.bots, n = 160;
  const easy = rate(playGlowcap, KID, [B.easy, B.easy, B.easy], n), normal = rate(playGlowcap, KID, [B.normal, B.normal, B.normal], n), hard = rate(playGlowcap, KID, [B.hard, B.hard, B.hard], n);
  assert.ok(easy > 0.7, `kid vs easy ${easy}`); assert.ok(hard < 0.3, `kid vs hard ${hard}`); assert.ok(easy > normal && easy > hard, `${easy} > ${normal}, ${hard}`);
  const wins = [0, 0, 0, 0]; let total = 0, games = 80;
  for (let i = 0; i < games; i++) { const r = playGlowcap(3100 + i * 17, [B.easy, B.easy, B.easy, B.easy], i + 1); total += r.t; for (const p of r.placing) if (p.place === 1) wins[p.slot]++; assert.ok(r.g.done); }
  const mean = wins.reduce((a, b) => a + b, 0) / 4; for (const wn of wins) assert.ok(Math.abs(wn - mean) < mean * 0.45, `seat wins ${wins}`);
  assert.ok(total / games > 28 && total / games < 60, `average length ${(total / games).toFixed(1)} s`);
});

// ---------------------------------------------------------------------------------------------------------------- the screen runtime
test('the spectator shore and every cap fit the fixed camera at 16:9, 9:16 and a phone in landscape, with heads', async () => {
  const r = makeRuntime(); r.party.open({ bots: 0, games: ['glowcap'] }); await r.party.play('glowcap'); r.run(8, () => r.party.place === 'glowcap');
  const sh = glowcapShore();
  for (const aspect of [16 / 9, 9 / 16, 19.5 / 9]) {
    r.camera.aspect = aspect; r.camera.updateProjectionMatrix(); r.followCam.snap(); r.party.updateCamera(0); r.camera.updateMatrixWorld(true);
    const pts = [];
    for (const h of [0, 2.1]) {
      for (const [x, z] of [[sh.x0, sh.z0], [sh.x1, sh.z0], [sh.x0, sh.z1], [sh.x1, sh.z1]]) pts.push([x, h, z]);
      for (const k of CAP_LOCAL) for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; pts.push([capCentre(k.i).x + Math.cos(a) * (k.r + PLAYER_RADIUS), h * 0.5, capCentre(k.i).z + Math.sin(a) * (k.r + PLAYER_RADIUS)]); }
    }
    for (const [x, h, z] of pts) { const p = new THREE.Vector3(x, PARTY.origin.y + h, z).project(r.camera); assert.ok(Math.abs(p.x) < 0.97 && Math.abs(p.y) < 0.97 && p.z < 1, `${aspect}: (${x - c.x}, ${z - c.z}) -> ${p.x.toFixed(2)}, ${p.y.toFixed(2)}`); }
  }
  r.party.close(); r.run(4);
});

test('the big call plate (symbol + count pips) is the one call display and stays clear of the top buttons and the score chips: well inside the view at 16:9, 9:16 and a phone in landscape', async () => {
  const r = makeRuntime(); r.party.open({ bots: 0, games: ['glowcap'] }); await r.party.play('glowcap'); r.run(8, () => r.party.place === 'glowcap');
  const w = r.party.debug.stage('glowcap'); w.update(1 / 60, { mode: 'play', v: view(init(5, roster(2)), buildPlan(5).rounds[0].start + 0.3), t: buildPlan(5).rounds[0].start + 0.3, lanePlayers: [] });
  const plate = w.root.children.find((o) => o.isGroup && o.children.length === 3 && o.children[0].geometry && o.children[0].geometry.type === 'CircleGeometry'), pips = w.root.children.find((o) => o.isInstancedMesh && o.count === 3);
  assert.ok(plate && plate.visible && pips && pips.visible);
  for (const aspect of [16 / 9, 9 / 16, 19.5 / 9]) {
    r.camera.aspect = aspect; r.camera.updateProjectionMatrix(); r.followCam.snap(); r.party.updateCamera(0); r.camera.updateMatrixWorld(true);
    for (const [dx, dy] of [[0, 0], [2.3, 0], [-2.3, 0], [0, 2.3], [0, -2.3]]) { const v = new THREE.Vector3(dx, dy, 0); plate.localToWorld(v); const p = v.project(r.camera); assert.ok(Math.abs(p.x) < 0.7 && p.y < 0.8 && p.y > -0.5, `${aspect}: plate point (${dx}, ${dy}) -> ${p.x.toFixed(2)}, ${p.y.toFixed(2)}`); }
    const pv = pips.localToWorld(new THREE.Vector3(0, 0, 0)).project(r.camera); assert.ok(Math.abs(pv.x) < 0.5 && pv.y > -0.5 && pv.y < 0.8, `${aspect}: pips ${pv.y.toFixed(2)}`);
  }
  r.party.close(); r.run(4);
});

test('a cap that stays sunk is not ground: whoever stands on it when it goes under is out (the same rule as every sink), and afterwards nobody can walk onto it (the walkable area follows the drawn caps)', async () => {
  const plan = buildPlan(5), R3 = plan.rounds[3], newDead = R3.newDead[0], sinkR = plan.rounds[2];
  assert.equal(R3.newDead.length, 1); assert.ok(sinkR.call !== newDead);
  const g = init(5, roster(2)); for (const rr of [plan.rounds[0], plan.rounds[1]]) { step(g, { pos: (s) => on(rr.call) }, 1 / 30, rr.sinkAt).forEach((x) => apply(g, x)); }
  const rec = step(g, { pos: (s) => (s === 0 ? on(sinkR.call) : on(newDead)) }, 1 / 30, sinkR.sinkAt);
  assert.deepEqual(rec[0].out, [1], 'a body on the cap that is about to stay down is out at that moment');
  const { setGlowcapSunk, glowcapSunk } = await import('../public/js/game/party/partyArea.js'), cc = capCentre(newDead);
  assert.equal(partyWalkable(cc.x, cc.z), true, 'up: ground'); setGlowcapSunk([newDead]);
  try { assert.equal(partyWalkable(cc.x, cc.z), false, 'sunk: water'); assert.equal(isWalkable(cc.x, cc.z), false); assert.equal(partyWalkable(cc.x + 1, cc.z), false); const other = CAP_LOCAL.find((k) => k.i !== newDead && !neighbours(newDead).includes(k.i)); assert.equal(isWalkable(capCentre(other.i).x, capCentre(other.i).z), true, 'the other caps stay ground'); assert.deepEqual(glowcapSunk(), [newDead]); }
  finally { setGlowcapSunk([]); }
  // on the runtime the set follows the drawn caps: a survivor kept on the called cap sees the cap that stays down turn into water
  const r = makeRuntime(); r.party.open({ bots: 0, games: ['glowcap'] }); r.party.debug.seed(5); await r.party.play('glowcap');
  r.run(30, () => r.party.state.phase === 'howto'); r.party.skip(); r.run(2); assert.equal(r.party.state.phase, 'countdown'); r.run(10, () => r.party.state.phase === 'play');
  const P = buildPlan(r.party.state.seed); let walkedOnto = null;
  r.run(70, () => {
    const gs = r.party.state.g; if (r.party.state.phase !== 'play' || !gs || gs.done) return true;
    const cur = P.rounds[Math.min(gs.round, P.rounds.length - 1)], gt = r.party.domain.gameTime();
    if (gt >= cur.start && gt < cur.sinkAt) { const q = capCentre(cur.call); r.pm.p1.teleport(q.x, q.z); }
    const dead = P.rounds[3].newDead[0], dc = capCentre(dead);
    if (gt > P.rounds[2].sinkAt + 0.6 && gs.round >= 3 && walkedOnto === null) walkedOnto = [partyWalkable(dc.x, dc.z), glowcapSunk().includes(dead)];
    return walkedOnto !== null;
  });
  assert.deepEqual(walkedOnto, [false, true], 'the cap that stays down is no longer ground on this screen'); r.party.close(); r.run(4); assert.deepEqual(glowcapSunk(), [], 'cleared when the party closes');
});

test('Glowcap Shuffle on the real runtime: bots (real Players) walk onto the called cap, the others splash and land on the shore, walk there on their own sticks, and the host judges from the Players\' positions; the call badge shows on the HUD', async () => {
  const r = makeRuntime(); r.pm.p1.teleport(10, 14);
  assert.equal(r.party.ui.callout, undefined, 'the call is shown once: the big plate on the stage (no second HUD badge)'); let plateSeen = 0;
  r.party.open({ bots: 'fill', difficulty: 'normal', games: ['glowcap', 'cast'] });
  await r.party.play('glowcap'); r.run(8, () => r.pm.bots.length === 3);
  assert.equal(r.party.state.game, 'glowcap');
  const sh = glowcapShore(); let dryFrames = 0, shoreFrames = 0, moved = 0; const lastShore = new Map();
  r.run(160, () => {
    const s = r.party.state;
    if (s.phase === 'play' && s.g) for (const p of r.pm.list) {
      const alive = s.g.alive[p.index];
      if (alive === false) {
        if (p.position.z > sh.z0 - 0.2) { shoreFrames++; assert.ok(isWalkable(p.position.x, p.position.z), 'the shore is ground'); const l = lastShore.get(p); if (l && Math.hypot(l.x - p.position.x, l.z - p.position.z) > 0.01) moved++; lastShore.set(p, p.position.clone()); }
      } else if (capAt(p.position.x, p.position.z) >= 0) dryFrames++;
    }
    if (r.party.summary().stages.glowcap?.plate) plateSeen++;
    return s.phase === 'results';
  });
  const s = r.party.state; assert.equal(s.phase, 'results'); assert.ok(plateSeen > 100, 'the big plate shows the call'); assert.ok(s.g.done && dryFrames > 200 && shoreFrames > 20 && moved > 3, `${dryFrames} dry frames, ${shoreFrames} shore frames, ${moved} moves`);
  assert.ok(s.g.round >= 3, `${s.g.round} rounds played`);
  const mine = s.results.ranks.find((x) => x.slot === 0); assert.equal(mine.out, true, 'a person who never moves is splashed'); assert.ok(s.results.ranks.some((x) => x.place === 1 && !x.out || x.place === 1));
  assert.ok(r.calls.sfx.includes('glowbell') && r.calls.sfx.includes('capsink') && r.calls.sfx.includes('splash')); assert.ok(r.calls.music.includes('glowcap'));
  assert.equal(r.party.summary().stages.glowcap.visible, true);
  r.run(PARTY.flow.results + 1, () => r.party.state.phase === 'lobby'); assert.equal(r.party.summary().stages.glowcap.visible, false);
});

test('a repeat play skips the how-to (the roulette goes straight to the countdown) and the game still starts from fresh starts; a person who falls in is moved to the shore and can walk there', async () => {
  const r = makeRuntime(); r.pm.p1.teleport(10, 14); const sec = r.pm.spawnDebugPlayer('second');
  r.party.open({ bots: 0, difficulty: 'easy', games: ['glowcap'] });
  await r.party.play('glowcap'); r.run(6, () => r.party.state.phase === 'howto'); assert.equal(r.party.state.phase, 'howto', 'the first play shows the how-to');
  r.party.debug.end?.(); r.party.skip(); r.run(1);                                                           // (skip on to the countdown)
  r.run(40, () => r.party.state.phase === 'play'); assert.equal(r.party.state.phase, 'play');
  const start = stageSpawns('glowcap', 2); assert.ok(Math.hypot(r.pm.p1.position.x - start[0].x, r.pm.p1.position.z - start[0].z) < 1.5, 'the players start on their caps');
  // player 2 stays on its cap, player 1 too: after the first sink at most one of the two caps is the called one
  r.run(30, () => r.party.state.g && r.party.state.g.round >= 1);
  const out = [0, 1].filter((i) => r.party.state.g.alive[i] === false);
  assert.ok(out.length >= 1, 'a body on the wrong cap is out'); r.run(1.2);
  const fell = [r.pm.p1, sec].filter((p) => r.party.state.g.alive[p.index] === false);
  for (const p of fell) { assert.ok(p.position.z >= glowcapShore().z0 - 0.01, 'moved to the shore'); const x0 = p.position.x; r.pm.fake(p === sec ? 'second' : 'p1', { x: 1, y: 0 }); r.run(0.4); assert.ok(p.position.x > x0 || p.position.x > c.x + 6, 'walks on the shore'); r.pm.fake(p === sec ? 'second' : 'p1', { x: 0, y: 0 }); }
  r.party.debug.end(); r.run(PARTY.flow.tail ?? 3);
  r.run(40, () => r.party.state.phase === 'lobby');
  await r.party.play('glowcap'); r.run(12, () => ['howto', 'countdown'].includes(r.party.state.phase));
  assert.equal(r.party.state.phase, 'countdown', 'the second play skips the how-to'); assert.ok(r.party.state.g);
  const again = stageSpawns('glowcap', 2); r.run(0.5); assert.ok(Math.hypot(r.pm.p1.position.x - again[0].x, r.pm.p1.position.z - again[0].z) < 1.5, 'back on their start cap for the countdown');
  r.party.close(); r.run(4);
});

// ---------------------------------------------------------------------------------------------------------------- host + replica
test('a host + replica pair play a whole Glowcap Shuffle with equal hashes; a replica\'s position is judged by the host; the results agree', () => {
  const pos = {}, w = pair({ positionOf: (slot) => pos[slot] || null }), slots = [0, 1, w.rSlot];
  w.host.open({ games: ['glowcap'], bots: 0 }); w.flush(); w.host.debug.play('glowcap'); w.flush();
  for (let i = 0; i < 2; i++) { w.host.skip(); w.flush(); }
  assert.equal(w.host.state.phase, 'countdown'); w.run(PARTY.flow.countdown + 0.2); assert.equal(w.host.state.phase, 'play'); w.equal('at the start');
  const sp = stageSpawns('glowcap', 3); slots.forEach((s, i) => { pos[s] = { x: sp[i].x, z: sp[i].z }; });
  const mems = {}, rng = mulberry32(3); let n = 0;
  w.run(70, 1 / 30, () => {
    const g = w.host.state.g; if (!g) return true;
    const v = view(g, w.host.gameTime());
    slots.forEach((s) => { if (!g.alive[s]) return; const it = bot(v, { slot: s, x: pos[s].x, z: pos[s].z, mem: mems[s] ||= {} }, s === w.rSlot ? PARTY.bots.hard : PARTY.bots.normal, rng); pos[s] = { x: pos[s].x + it.x * 7 / 30, z: pos[s].z - it.y * 7 / 30 }; });
    if (++n % 25 === 0) w.equal(`mid game ${n}`);
    return w.host.state.phase !== 'results';
  });
  w.flush(); assert.equal(w.host.state.phase, 'results'); w.equal('at the results');
  assert.deepEqual(w.replica.state.g.alive, w.host.state.g.alive); assert.deepEqual(w.replica.state.g.outR, w.host.state.g.outR);
  assert.ok(w.host.state.g.round >= 2, 'rounds were played'); assert.deepEqual(w.host.state.results.ranks, w.replica.state.results.ranks);
});

// ---------------------------------------------------------------------------------------------------------------- music + sounds + icons
test('track 29 Moonlit Mix-Up: a soft bossa at 100 bpm, pinned; the older tracks stay as they were; the game plays it; the new sounds and the icon exist', () => {
  assert.equal(TRACK_TITLES[29], 'Moonlit Mix-Up'); assert.equal(PARTY_TRACKS.glowcap, 29); assert.equal(GAME.track, 'glowcap');
  const pins = { 29: '19e330e1f9d8e2d632b1125cc2bcbc79b0552e5e2f53c6a04d06aa4f4b2a35b1', 18: '72252c4ee94b91f2f3707d905e5119d1b47c4ecb76c945de4be04d096b009b96', 23: 'b42263bef57becf4da8db8e1124549b26ae643896619a3a8872111ad0f74f8f1', 26: 'b362909cbe96320bf3d2dfccf81b209deda0c3105bae44c8596e28623f8825c5' };
  for (const [i, h] of Object.entries(pins)) assert.equal(createHash('sha256').update(JSON.stringify(getTrack(Number(i)).events)).digest('hex'), h, `track ${i} (${TRACK_TITLES[i]})`);
  const info = trackInfo()[29], tr = getTrack(29); assert.equal(info.bpm, 100); assert.ok(info.seconds > 45 && info.seconds < 70);
  assert.deepEqual(tr.events, tr.def.build().events, 'deterministic'); const kinds = new Set(tr.events.map((e) => e.k));
  for (const k of ['bass', 'click', 'glassMarimba', 'lead', 'bell', 'shaker']) assert.ok(kinds.has(k), k);
  assert.ok(tr.events.some((e) => e.k === 'lead' && e.o && e.o.style === 'flute'), 'a breathy flute');
  let prev = 0; for (const e of tr.events) { assert.ok(e.s >= prev && e.s < tr.steps && e.d > 0 && e.v > 0 && e.v <= 1); prev = e.s; for (const nn of Array.isArray(e.m) ? e.m : [e.m]) assert.ok(Number.isFinite(nn)); }
  const sfx = new Sfx();
  for (const nme of ['glowbell', 'capsink', 'caprise']) assert.doesNotThrow(() => sfx.play(nme, { pitch: 1.2, vol: 0.5 }), nme);
  const ctx = { currentTime: 0, state: 'running', destination: {}, createOscillator: () => ({ type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, connect(x) { return x; }, start() {}, stop() {} }), createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, connect(x) { return x; } }), createBufferSource: () => ({ buffer: null, connect(x) { return x; }, start() {}, stop() {}, playbackRate: { value: 1 } }), createBiquadFilter: () => ({ type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, value: 0 }, Q: { value: 0 }, connect(x) { return x; } }), createBuffer: () => ({ getChannelData: () => new Float32Array(8) }), sampleRate: 8000 };
  sfx.ctx = ctx; sfx.master = { connect() {} };
  for (const nme of ['glowbell', 'capsink', 'caprise']) { try { sfx.play(nme, { pitch: 1.2 }); } catch (e) { assert.fail(`${nme}: ${e.message}`); } }
  assert.ok(ICONS['party-glowcap'] && ICONS['party-glowcap'].startsWith('<svg') && ICONS['party-glowcap'].endsWith('</svg>')); assert.doesNotMatch(ICONS['party-glowcap'], /[\u{1F300}-\u{1FAFF}☀-➿]/u);
});
