// Step 80c: whole-game simulations of Sizzle Seed and Egg Scramble on the real rules (bodies are simple kinematic circles: the stick's speed blend, the holder's boost, the clearing's wall, the benches and fire as obstacles,
// the lane strips). Used by test/partySizzle.test.js and test/partyEggs.test.js for bot win rates; run `node test/fixtures/sim80c.mjs` to print them.
import { PARTY, PLAYER_SPEED, PLAYER_WALK_SPEED, WALK_THRESHOLD } from '../../public/js/config.js';
import { mulberry32 } from '../../public/js/utils/rng.js';
import * as SZ from '../../public/js/game/party/sizzleLogic.js';
import * as EG from '../../public/js/game/party/eggsLogic.js';
import { stageSpawns, stageCentre, sizzleObstacles } from '../../public/js/game/party/partyArea.js';

export const KID = { react: 0.55, noise: 0.12, miss: 0.06, walk: 1 };
const speedOf = (mag) => (mag <= WALK_THRESHOLD ? PLAYER_WALK_SPEED * (mag / WALK_THRESHOLD) : PLAYER_WALK_SPEED + (PLAYER_SPEED - PLAYER_WALK_SPEED) * ((mag - WALK_THRESHOLD) / (1 - WALK_THRESHOLD)));
const R = 0.45;

/** Move a body by a stick (x right, y up = world -z) for dt, with the clearing / lane rules. */
function move(b, stick, dt, boost, world) {
  const mag = Math.min(1, Math.hypot(stick.x, stick.y));
  if (mag > 0.001) {
    const sp = speedOf(mag) * boost;
    b.x += (stick.x / mag) * sp * dt; b.z += (-stick.y / mag) * sp * dt;
  }
  world(b);
}

export function playSizzle(seed, skills, rngSeed = 1, { maxT = 90, trace = null } = {}) {
  const n = skills.length, roster = skills.map((_, i) => ({ slot: i, bot: true, name: 'b' + i }));
  SZ.setSecretRng(mulberry32(seed ^ 0xabc123));
  const g = SZ.init(seed, roster), rng = mulberry32(rngSeed), mems = skills.map(() => ({}));
  const sp = stageSpawns('sizzle', n), c = stageCentre('sizzle'), obs = SZ.worldObstacles();
  const bodies = sp.map((s) => ({ x: s.x, z: s.z }));
  const dt = 1 / 60;
  const world = (b) => {
    const dx = b.x - c.x, dz = b.z - c.z, d = Math.hypot(dx, dz), lim = PARTY.sizzle.arenaR - R;
    if (d > lim) { b.x = c.x + (dx / d) * lim; b.z = c.z + (dz / d) * lim; }
    for (const o of obs) { const ox = b.x - o.x, oz = b.z - o.z, od = Math.hypot(ox, oz), min = o.r + R; if (od < min && od > 0.0001) { b.x = o.x + (ox / od) * min; b.z = o.z + (oz / od) * min; } }
  };
  let t = 0;
  for (let k = 0; k < maxT * 60 && !g.done; k++) {
    t += dt;
    const v = SZ.view(g, t);
    skills.forEach((sk, slot) => {
      const others = bodies.map((b, s) => ({ slot: s, x: b.x, z: b.z })).filter((o) => o.slot !== slot);
      const it = SZ.bot(v, { slot, x: bodies[slot].x, z: bodies[slot].z, mem: mems[slot], others }, sk, rng);
      move(bodies[slot], it, dt, SZ.holderSpeed(g, slot), world);
    });
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {         // players push apart softly
      const dx = bodies[j].x - bodies[i].x, dz = bodies[j].z - bodies[i].z, d = Math.hypot(dx, dz);
      if (d < 0.9 && d > 0.0001) { const p = (0.9 - d) / 2; bodies[i].x -= (dx / d) * p; bodies[i].z -= (dz / d) * p; bodies[j].x += (dx / d) * p; bodies[j].z += (dz / d) * p; }
    }
    const recs = SZ.step(g, { t, pos: (s) => bodies[s], slack: PARTY.slack, lag: 0 }, dt, t);
    for (const r of recs) { SZ.apply(g, r); if (trace) trace.push(r); }
  }
  return { g, t, placing: SZ.placing(g), bodies };
}

export function playEggs(seed, skills, rngSeed = 1, { trace = null } = {}) {
  const n = skills.length, roster = skills.map((_, i) => ({ slot: i, bot: true, name: 'b' + i }));
  const g = EG.init(seed, roster), rng = mulberry32(rngSeed), mems = skills.map(() => ({}));
  const sp = stageSpawns('eggs', n), c = stageCentre('eggs');
  const bodies = sp.map((s) => ({ x: s.x, z: s.z }));
  const dt = 1 / 60;
  const world = (b, lane) => { const lo = c.x + PARTY.eggs.lanes[lane] - PARTY.eggs.laneHalf + R, hi = c.x + PARTY.eggs.lanes[lane] + PARTY.eggs.laneHalf - R; b.x = Math.max(lo, Math.min(hi, b.x)); b.z = sp[lane].z; };
  let t = 0;
  for (let k = 0; k < 70 * 60 && !g.done; k++) {
    t += dt;
    const v = EG.view(g, t);
    skills.forEach((sk, slot) => {
      const it = EG.bot(v, { slot, x: bodies[slot].x, z: bodies[slot].z, mem: mems[slot] }, sk, rng);
      move(bodies[slot], it, dt, 1, (b) => world(b, slot));
    });
    const recs = EG.step(g, { t, pos: (s) => bodies[s], slack: PARTY.slack, lag: 0 }, dt, t);
    for (const r of recs) { EG.apply(g, r); if (trace) trace.push(r); }
  }
  return { g, t, placing: EG.placing(g), bodies };
}

export const rate = (play, mine, others, n = 200) => {
  let win = 0;
  for (let i = 0; i < n; i++) {
    const slot = i % (others.length + 1), skills = others.slice();       // the kid takes every seat in turn (seat bias must not matter)
    skills.splice(slot, 0, mine);
    const p = play(1000 + i * 7919, skills, i + 1).placing;
    if (p.find((r) => r.slot === slot).place === 1) win++;
  }
  return win / n;
};

if (process.argv[1] && process.argv[1].endsWith('sim80c.mjs')) {
  const B = PARTY.bots;
  for (const [name, play] of [['sizzle', playSizzle], ['eggs', playEggs]]) {
    console.log(name, 'kid vs easy', rate(play, KID, [B.easy, B.easy, B.easy]), 'vs normal', rate(play, KID, [B.normal, B.normal, B.normal]), 'vs hard', rate(play, KID, [B.hard, B.hard, B.hard]));
  }
}
