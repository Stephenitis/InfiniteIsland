// Step 80d Puffball Bumpers: pure physics, visible / judged boundary, kid balance, seeded start fairness and a real WorldSync pair with delayed replica stick packets.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PARTY } from '../public/js/config.js';
import { mulberry32 } from '../public/js/utils/rng.js';
import { GAME, init, step, request, apply, view, placing, collide, capRadius, offCap, ballPose, bot, debugWin, rollQuaternion, riderFacing } from '../public/js/game/party/bumpersLogic.js';
import { createBumpersWorld } from '../public/js/world/party/bumpers.js';
import { stageCentre, bumpersLanding } from '../public/js/game/party/partyArea.js';
import { validateGame } from '../public/js/game/party/registry.js';
import { pair } from './fixtures/partyPair.js';
import { riderPose, applyBumperRider } from '../public/js/game/party/bumperRider.js';
import { Player } from '../public/js/player/player.js';
import { installDom } from './fixtures/domStub.js';

const S = PARTY.bumpers, roster = (n = 4) => Array.from({ length: n }, (_, slot) => ({ slot }));
const tick = (g, t, dt = 1 / 30) => { const recs = step(g, {}, dt, t); for (const r of recs) apply(g, r); return recs; };
const input = (g, slot, x, z, t, jump = false) => { const a = request(g, slot, { x, z, jump, t }, { t }); if (a.rec) apply(g, a.rec); return a; };
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ~= ${b}`);

// A kid aims for the middle, brakes late and sometimes rolls at a friend; separate code from the game's bots, looking again every .4 s.
function kid(v, slot, mem, rng) {
  if (v.t < (mem.next ?? 0)) return mem.intent;
  mem.next = v.t + 0.4;
  const b = v.balls[slot]; let x = -b.x * 0.6 - b.vx * 0.8, z = -b.z * 0.6 - b.vz * 0.8;
  const target = v.slots.filter((s) => s !== slot && v.alive[s]).map((s) => v.balls[s]).sort((a, c) => Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(c.x - b.x, c.z - b.z))[0];
  if (target && Math.hypot(b.x, b.z) < 4) { const d = Math.hypot(target.x - b.x, target.z - b.z) || 1; x += (target.x - b.x) / d * 4; z += (target.z - b.z) / d * 4; }
  x += (rng() - 0.5) * 0.8; z += (rng() - 0.5) * 0.8;
  const d = Math.max(1, Math.hypot(x, z));
  return mem.intent = { x: x / d * 0.8, y: -z / d * 0.8 };
}
function play(seed, difficulty, kidSlot = null) {
  const g = init(seed, roster()), rng = mulberry32(seed + 2), mem = [{}, {}, {}, {}]; let t = 0;
  while (!g.done && t < 61) {
    t += 1 / 30;
    for (const s of g.slots) {
      const v = view(g, t), i = s === kidSlot ? kid(v, s, mem[s], rng) : bot(v, { slot: s, mem: mem[s] }, PARTY.bots[difficulty], rng);
      input(g, s, i.x, -i.y, t);
    }
    tick(g, t);
  }
  return { g, t, winners: placing(g).filter((p) => p.place === 1).map((p) => p.slot) };
}

test('Bumpers honours the registry; seed rotates equally spaced start spots with identical mass and radius', () => {
  assert.deepEqual(validateGame(GAME), []); assert.equal(GAME.host, 'Capray'); assert.deepEqual(GAME.press, ['jump']);
  for (let seed = 0; seed < 50; seed++) {
    const g = init(seed, roster()); assert.deepEqual(g, init(seed, roster()));
    for (const s of g.slots) { near(Math.hypot(g.balls[s].x, g.balls[s].z), S.spawnR); assert.equal(g.balls[s].mass, S.mass); assert.equal(g.alive[s], true); }
    for (let s = 0; s < 4; s++) near(Math.hypot(g.balls[s].x - g.balls[(s + 1) % 4].x, g.balls[s].z - g.balls[(s + 1) % 4].z), S.spawnR * Math.sqrt(2));
  }
  assert.notDeepEqual(init(1, roster()).balls, init(2, roster()).balls);
});

test('held stick inputs are normalised, every hop reacts at once, invalid / eliminated input is ignored', () => {
  const g = init(1, roster()); input(g, 0, 4, 4, 1, true);
  near(Math.hypot(g.inputs[0].x, g.inputs[0].z), 1); assert.equal(g.balls[0].hopAt, 1);
  assert.ok(ballPose(g, 0, 1.1).y > 2 * S.ballR);
  input(g, 0, 0, 0, 1.12, true); assert.equal(g.balls[0].hopAt, 1.12, 'another press starts a hop now, without a cool-down');
  assert.equal(request(g, 0, { x: NaN, z: 0 }, { t: 2 }).reject, 'input');
  apply(g, { k: 'out', slot: 0, t: 2 }); assert.deepEqual(request(g, 0, { x: 1, z: 0 }, { t: 2 }), { ignore: true });
});

test('elastic circle impulses conserve x / z momentum and kinetic energy, with unequal masses and glancing velocity', () => {
  for (const [ma, mb] of [[1, 1], [1, 3], [4, 0.7]]) {
    const a = { x: -0.9, z: 0, vx: 8, vz: 2, mass: ma }, b = { x: 0.9, z: 0, vx: -4, vz: -3, mass: mb };
    const px = a.vx * ma + b.vx * mb, pz = a.vz * ma + b.vz * mb, energy = ma * (a.vx ** 2 + a.vz ** 2) + mb * (b.vx ** 2 + b.vz ** 2);
    assert.equal(collide(a, b), true); near(a.vx * ma + b.vx * mb, px); near(a.vz * ma + b.vz * mb, pz); near(ma * (a.vx ** 2 + a.vz ** 2) + mb * (b.vx ** 2 + b.vz ** 2), energy);
    near(Math.hypot(b.x - a.x, b.z - a.z), 2 * S.ballR); assert.equal(collide(a, b), false, 'separating circles do not get another impulse');
  }
});

test('fixed small slices prevent maximum-speed tunnelling even in a long host frame; step does not mutate state', () => {
  const g = init(2, roster(2)); Object.assign(g.balls[0], { x: -2, z: 0, vx: S.maxSpeed, vz: 0 }); Object.assign(g.balls[1], { x: 2, z: 0, vx: -S.maxSpeed, vz: 0 });
  const before = JSON.stringify(g), recs = step(g, {}, 0.4, 0.4); assert.equal(JSON.stringify(g), before);
  for (const r of recs) apply(g, r);
  assert.ok(g.balls[0].vx < 0 && g.balls[1].vx > 0); assert.ok(g.balls[0].x < g.balls[1].x); assert.ok(g.bumps >= 1);
  const coincident = { x: 0, z: 0, vx: 0, vz: 0, mass: 1 }, other = { ...coincident }; collide(coincident, other); near(Math.hypot(other.x - coincident.x, other.z - coincident.z), 2 * S.ballR);
});

test('shrink begins at 30 seconds; centre exactly at the drawn rim remains on, just beyond is out and drifts down', () => {
  assert.equal(S.shrinkAt, 30); assert.equal(capRadius(0), S.radius); assert.ok(capRadius(31) < S.radius); assert.equal(capRadius(S.shrinkAt), S.radius); assert.equal(capRadius(S.duration), S.minRadius);
  assert.ok(capRadius(50) < S.radius && capRadius(50) > S.minRadius);
  for (const t of [0, 30, 50, 60]) { assert.equal(offCap({ x: capRadius(t), z: 0 }, t), false); assert.equal(offCap({ x: capRadius(t) + 1e-7, z: 0 }, t), true); }
  const g = init(1, roster(2)); Object.assign(g.balls[0], { x: S.radius + 0.01, z: 0, vx: 1 }); tick(g, 0.01);
  assert.equal(g.alive[0], false); assert.equal(g.done, true); assert.ok(ballPose(g, 0, 3).y < 0); assert.ok(Math.abs(ballPose(g, 0, 4).x - bumpersLanding(0).x) < 1e-8);
  assert.equal(placing(g)[0].slot, 1);
});

test('records replay exactly on a passive replica for a whole seeded game; debugWin eliminates every other rider', () => {
  assert.deepEqual(play(91, 'normal').g, play(91, 'normal').g, 'the seed and identical input policy reproduce the complete host simulation');
  const g = init(41, roster()), replica = init(41, roster()), rng = mulberry32(9), mem = [{}, {}, {}, {}];
  for (let t = 1 / 30; !g.done && t <= 61; t += 1 / 30) {
    for (const s of g.slots) { const i = bot(view(g, t), { slot: s, mem: mem[s] }, PARTY.bots.normal, rng), a = request(g, s, { x: i.x, z: -i.y }, { t }); if (a.rec) { apply(g, a.rec); apply(replica, structuredClone(a.rec)); } }
    for (const r of step(g, {}, 1 / 30, t)) { apply(g, r); apply(replica, structuredClone(r)); }
    assert.deepEqual(replica, g);
  }
  assert.equal(g.done, true); assert.deepEqual(JSON.parse(JSON.stringify(g)), g);
  const d = init(1, roster()); for (const r of debugWin(d, 2, 3)) apply(d, r); tick(d, 3.01); assert.equal(d.done, true); assert.deepEqual(placing(d).filter((p) => p.place === 1).map((p) => p.slot), [2]);
});

test('bot reaction memory resets between games, including a replay with the same seed', () => {
  const g = init(12, roster()), mem = {}, skill = PARTY.bots.hard;
  bot(view(g, 50), { slot: 0, mem }, skill, mulberry32(1));
  const fresh = bot(view(g, 0.1), { slot: 0, mem: {} }, skill, mulberry32(2));
  assert.deepEqual(bot(view(g, 0.1), { slot: 0, mem }, skill, mulberry32(2)), fresh);
  const g2 = init(13, roster());
  assert.deepEqual(bot(view(g2, 0.2), { slot: 0, mem }, skill, mulberry32(3)), bot(view(g2, 0.2), { slot: 0, mem: {} }, skill, mulberry32(3)));
});

test('the actual puffball mesh centre / avatar foot pose and actual cap geometry use the judged numbers, including shrink and the spore fall', () => {
  const sounds = [], scene = new THREE.Scene(), w = createBumpersWorld({ scene, sfx: { play: (s) => sounds.push(s) } }); w.setVisible(true);
  const g = init(4, roster()), cap = w.root.getObjectByName('bumpers-cap'), puff = w.root.getObjectByName('bumpers-ball-0'), pores = w.root.getObjectByName('bumpers-pores');
  cap.geometry.computeBoundingBox(); near(cap.geometry.boundingBox.max.x, 1, 1e-6);
  for (const t of [0, 30, 50, 59]) {
    g.simT = t; g.balls[0].x = capRadius(t); g.balls[0].z = 0;
    w.update(1 / 60, { mode: 'play', v: view(g, t), t });
    const p = ballPose(g, 0, t); near(puff.position.x, p.x); near(puff.position.z, p.z); near(puff.position.y + S.ballR, p.y); near(cap.scale.x, capRadius(t)); near(pores.scale.x, capRadius(t));
    assert.equal(offCap({ x: puff.position.x, z: puff.position.z }, t), false);
  }
  assert.equal(sounds.filter((s) => s === 'capbell').length, 1, 'Capray rings once at Go');
  const c = stageCentre('bumpers'), player = { position: new THREE.Vector3(c.x + 2.4, PARTY.origin.y + 2 * S.ballR, c.z - 1.2) };
  w.update(1 / 60, { mode: 'wait', t: 0, lanePlayers: [player] }); near(puff.position.x, 2.4); near(puff.position.z, -1.2); near(puff.position.y, S.ballR);
  apply(g, { k: 'out', slot: 0, t: 59 }); w.update(1 / 60, { mode: 'play', v: view(g, 61), t: 61 }); assert.ok(puff.position.y < 0); assert.equal(w.root.getObjectByName('bumpers-spores-0').visible, true);
  assert.deepEqual(w.scoreText(view(g, 61), 0), { text: 'Drifting', out: true }); assert.ok(w.summary().meshes < 30); assert.equal(scene.children.filter((o) => o.isLight).length, 0);
  w.setVisible(false); assert.equal(w.root.visible, false); w.dispose();
});

test('scripted average kid beats easy and loses to hard most of the time; games take about 45-60 seconds', () => {
  const rates = {}, lengths = {};
  for (const difficulty of ['easy', 'normal', 'hard']) {
    let wins = 0, time = 0; for (let n = 0; n < 80; n++) { const r = play(233 + n * 71, difficulty, 0); if (r.winners.includes(0)) wins++; time += r.t; }
    rates[difficulty] = wins / 80; lengths[difficulty] = time / 80;
  }
  assert.ok(rates.easy > 0.75, JSON.stringify(rates)); assert.ok(rates.hard < 0.3, JSON.stringify(rates)); assert.ok(rates.easy > rates.normal && rates.normal > rates.hard, JSON.stringify(rates));
  for (const t of Object.values(lengths)) assert.ok(t > 45 && t < 60.1, JSON.stringify(lengths));
});

test('no start spot is favoured: a kid in each of the four slots has comparable success against easy bots', () => {
  const wins = [0, 0, 0, 0];
  for (let slot = 0; slot < 4; slot++) for (let n = 0; n < 60; n++) { const r = play(733 + n * 71, 'easy', slot); if (r.winners.includes(slot)) wins[slot]++; }
  assert.ok(Math.min(...wins) > 45, `${wins}`); assert.ok(Math.max(...wins) - Math.min(...wins) < 12, `${wins}`);
});

test('host + replica WorldSync pair: an entire game with replica inputs delayed 100 ms has equal hashes and results', () => {
  const w = pair(), queue = [], rng = mulberry32(22), mem = {}, slots = [0, 1, w.rSlot];
  w.host.open({ games: ['bumpers'], bots: 0 }); w.flush(); w.host.debug.play('bumpers'); w.flush();
  for (let i = 0; i < 2; i++) { w.host.skip(); w.flush(); }
  w.run(PARTY.flow.countdown + 0.2); assert.equal(w.host.state.phase, 'play'); w.equal('Go');
  let delayed = 0, checked = 0, lastSend = -1;
  w.run(65, 1 / 30, () => {
    const s = w.host.state, t = w.host.gameTime(); if (s.phase === 'results') return false;
    if (s.phase !== 'play') return;
    const v = view(s.g, t);
    if (t - lastSend >= 0.099) {
      lastSend = t;
      for (const slot of slots) {
        const i = bot(v, { slot, mem: mem[slot] ||= {} }, PARTY.bots.normal, rng), req = { x: i.x, z: -i.y, jump: Math.floor(t) % 3 === 0 };
        if (slot === w.rSlot) queue.push({ at: t + 0.1, stamp: t, req }); else w.host.act({ screen: 'host', index: slot }, t, req);
      }
    }
    while (queue.length && queue[0].at <= t + 1e-8) { const q = queue.shift(); w.replica.act(w.rActor(), q.stamp, q.req); delayed++; }
    w.flush(); w.equal(`tick ${checked++}`);
  });
  w.flush(); assert.equal(w.host.state.phase, 'results'); assert.ok(w.host.state.g.done); w.equal('results'); assert.ok(delayed > 100); assert.ok(checked > 1000);
  assert.deepEqual(w.host.state.results.ranks, w.replica.state.results.ranks);
});


test('rider follows synced stick with a smooth turn, then velocity on release; opposing momentum drives a signed backpedal', () => {
  const b = { facing: 0, vx: 0, vz: 4 };
  const f = riderFacing(b, { x: 1, z: 0 }, 1 / 60); assert.ok(f > 0 && f < Math.PI / 2);
  near(riderFacing({ ...b, facing: 0 }, { x: 0, z: 0 }, 0.1), 0);
  assert.ok(riderFacing({ ...b, vx: 4, vz: 0 }, { x: 0, z: 0 }, 0.1) > 0);
  const g = init(4, roster(1)); Object.assign(g.balls[0], { facing: Math.PI, vx: 0, vz: 4 }); input(g, 0, 0, -1, 0); tick(g, 0.03);
  assert.ok(g.balls[0].gait < 0); assert.ok(riderPose(g, 0).signedSpeed < 0); assert.ok(riderPose(g, 0).lean < 0);
  const prior = g.balls[0].gait; input(g, 0, 0, 0, 0.03); tick(g, 0.5); assert.ok(g.balls[0].facing < Math.PI / 2); assert.ok(g.balls[0].gait > prior, 'released stick eventually walks with the drift');
});

test('rolling quaternion uses travelled distance / radius around the perpendicular world axis and composes turns in world space', () => {
  const q = rollQuaternion([0, 0, 0, 1], S.ballR * Math.PI, 0);
  near(q[0], 0); near(q[1], 0); near(q[2], -1); near(q[3], 0);
  const turn = rollQuaternion(q, 0, S.ballR * Math.PI / 2), expected = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2).multiply(new THREE.Quaternion(...q));
  turn.forEach((v, i) => near(v, expected.toArray()[i])); near(Math.hypot(...turn), 1);
  const g = init(1, roster(1)); g.balls[0].vx = 4; tick(g, 0.1);
  const travelled = g.balls[0].x, actual = g.balls[0].roll, wanted = rollQuaternion([0, 0, 0, 1], travelled, 0); actual.forEach((v, i) => near(v, wanted[i]));
});

test('patterned puffballs copy host quaternion exactly on replicas regardless of rendered frame count', () => {
  const g = init(3, roster(1)); input(g, 0, 1, 0.5, 0); tick(g, 0.6);
  const replica = structuredClone(g), a = createBumpersWorld({ scene: new THREE.Scene() }), b = createBumpersWorld({ scene: new THREE.Scene() }); a.setVisible(true); b.setVisible(true);
  a.update(1 / 30, { mode: 'play', v: view(g, 0.6) }); for (let n = 0; n < 100; n++) b.update(1 / 144, { mode: 'play', v: view(replica, 0.6) });
  assert.deepEqual(a.root.getObjectByName('bumpers-ball-0').quaternion.toArray(), b.root.getObjectByName('bumpers-ball-0').quaternion.toArray());
  assert.deepEqual(a.root.getObjectByName('bumpers-ball-0').quaternion.toArray(), g.balls[0].roll);
  const geo = a.root.getObjectByName('bumpers-ball-0').geometry, colors = geo.getAttribute('color'); const distinct = new Set(); for (let i = 0; i < colors.count; i++) distinct.add([colors.getX(i), colors.getY(i), colors.getZ(i)].join(',')); assert.ok(distinct.size >= 3, 'stripe and asymmetric patches are merged into the ball');
  a.dispose(); b.dispose();
});

test('real Player rig gets the same signed gait and bump lean on local and remote riders without moving their feet', () => {
  installDom(); const scene = new THREE.Scene(), local = new Player(scene), remote = new Player(scene);
  const g = init(8, roster(2)); Object.assign(g.balls[0], { x: -2, z: 0, vx: 8, vz: 0, facing: Math.PI / 2 }); Object.assign(g.balls[1], { x: 2, z: 0, vx: -8, vz: 0 }); tick(g, 0.2);
  assert.ok(Math.abs(g.balls[0].bumpX) > 0); const feet = local.position.clone();
  applyBumperRider(local, g, 0); applyBumperRider(remote, structuredClone(g), 0); const pose = riderPose(g, 0);
  near(local.root.rotation.y, g.balls[0].facing); near(local.parts.legL.rotation.x, Math.sin(g.balls[0].gait) * 0.95 * pose.swing); near(local.parts.rig.rotation.z, pose.bank);
  near(local.parts.legL.rotation.x, remote.parts.legL.rotation.x); near(local.parts.rig.rotation.x, remote.parts.rig.rotation.x); assert.deepEqual(local.position, feet);
  assert.equal(local.parts.rig.position.y, 0); local.dispose(); remote.dispose();
});
