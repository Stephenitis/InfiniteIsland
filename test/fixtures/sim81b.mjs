// Step 81b: whole-game simulations of Tilty Tiles and Bonk Burrows on the real rules (bodies are simple kinematic circles: the stick's speed blend, the frame's inside / the meadow with its molehills as the ground), used by
// test/partyTilty.test.js and test/partyBonk.test.js for bot win rates; run `node test/fixtures/sim81b.mjs` to print them.
import { PARTY, PLAYER_SPEED, PLAYER_WALK_SPEED, WALK_THRESHOLD } from '../../public/js/config.js';
import { mulberry32 } from '../../public/js/utils/rng.js';
import * as BO from '../../public/js/game/party/bonkLogic.js';
import * as TY from '../../public/js/game/party/tiltyLogic.js';
import { stageSpawns, stageCentre, bonkObstacles } from '../../public/js/game/party/partyArea.js';

export const KID = { react: 0.45, noise: 0.12, miss: 0.06, walk: 1, reel: 6 };
export const speedOf = (mag) => (mag <= WALK_THRESHOLD ? PLAYER_WALK_SPEED * (mag / WALK_THRESHOLD) : PLAYER_WALK_SPEED + (PLAYER_SPEED - PLAYER_WALK_SPEED) * ((mag - WALK_THRESHOLD) / (1 - WALK_THRESHOLD)));
export function move(b, stick, dt, clamp) {
  const mag = Math.min(1, Math.hypot(stick.x, stick.y));
  if (mag > 0.001) { const sp = speedOf(mag); b.x += (stick.x / mag) * sp * dt; b.z += (-stick.y / mag) * sp * dt; }
  if (clamp) clamp(b);
}

export function playTilty(seed, skills, rngSeed = 1, { trace = null } = {}) {
  const n = skills.length, T = PARTY.tilty, roster = skills.map((_, i) => ({ slot: i, bot: true, name: 'b' + i }));
  const g = TY.init(seed, roster), rng = mulberry32(rngSeed), mems = skills.map(() => ({}));
  const bodies = stageSpawns('tilty', n).map((s) => ({ x: s.x, z: s.z }));
  const walk = (b, i) => { const f = TY.frameCentre(i); b.x = Math.max(f.x - (T.hx - T.rim - T.walkPad), Math.min(f.x + (T.hx - T.rim - T.walkPad), b.x)); b.z = Math.max(f.z - (T.hz - T.rim - T.walkPad), Math.min(f.z + (T.hz - T.rim - T.walkPad), b.z)); };
  const dt = 1 / 60; let t = 0;
  for (let k = 0; k < 40 * 60 && !g.done; k++) {
    t += dt;
    const v = TY.view(g, t);
    skills.forEach((sk, slot) => { const it = TY.bot(v, { slot, x: bodies[slot].x, z: bodies[slot].z, mem: mems[slot] }, sk, rng); move(bodies[slot], it, dt, (b) => walk(b, slot)); });
    for (const r of TY.step(g, { t, pos: (s) => bodies[s], slack: PARTY.slack, lag: 0 }, dt, t)) { TY.apply(g, r); if (trace) trace.push(r); }
  }
  return { g, t, placing: TY.placing(g), bodies };
}

export function playBonk(seed, skills, rngSeed = 1, { trace = null } = {}) {
  const n = skills.length, Bc = PARTY.bonk, roster = skills.map((_, i) => ({ slot: i, bot: true, name: 'b' + i }));
  const g = BO.init(seed, roster), rng = mulberry32(rngSeed), mems = skills.map(() => ({}));
  const c = stageCentre('bonk'), hills = bonkObstacles();
  const bodies = stageSpawns('bonk', n).map((s) => ({ x: s.x, z: s.z }));
  const fix = (b) => {
    for (const h of hills) { const dx = b.x - c.x - h.x, dz = b.z - c.z - h.z, d = Math.hypot(dx, dz), min = h.r + 0.45; if (d < min) { b.x = c.x + h.x + (dx / d) * min; b.z = c.z + h.z + (dz / d) * min; } }
    const dx = b.x - c.x, dz = b.z - c.z, d = Math.hypot(dx, dz); if (d > Bc.meadowR - 0.3) { b.x = c.x + dx / d * (Bc.meadowR - 0.3); b.z = c.z + dz / d * (Bc.meadowR - 0.3); }
  };
  const dt = 1 / 60; let t = 0;
  for (let k = 0; k < 70 * 60 && !g.done; k++) {
    t += dt;
    const v = BO.view(g, t), recs = [];
    skills.forEach((sk, slot) => {
      if (!g.alive[slot]) return;
      const it = BO.bot(v, { slot, x: bodies[slot].x, z: bodies[slot].z, mem: mems[slot] }, sk, rng);
      move(bodies[slot], it, dt, fix);
      if (it.jump) { const out = BO.request(g, slot, { t }, { t, slack: PARTY.slack, lag: Bc.lag }); if (out.rec) { BO.apply(g, out.rec); recs.push(out.rec); } }
    });
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (!g.alive[i] || !g.alive[j]) continue;
      const dx = bodies[j].x - bodies[i].x, dz = bodies[j].z - bodies[i].z, d = Math.hypot(dx, dz);
      if (d < 0.9 && d > 0.0001) { const p = (0.9 - d) / 2; bodies[i].x -= (dx / d) * p; bodies[i].z -= (dz / d) * p; bodies[j].x += (dx / d) * p; bodies[j].z += (dz / d) * p; fix(bodies[i]); fix(bodies[j]); }
    }
    for (const r of BO.step(g, { t, pos: (s) => bodies[s], slack: PARTY.slack, lag: Bc.lag }, dt, t)) { BO.apply(g, r); recs.push(r); }
    if (trace) trace.push(...recs);
  }
  return { g, t, placing: BO.placing(g), bodies };
}

export const rate = (play, mine, others, n = 200) => {
  let win = 0;
  for (let i = 0; i < n; i++) {
    const slot = i % (others.length + 1), skills = others.slice();                  // the kid takes every seat in turn (seat bias must not matter)
    skills.splice(slot, 0, mine);
    const p = play(1000 + i * 7919, skills, i + 1).placing;
    if (p.find((x) => x.slot === slot).place === 1) win++;
  }
  return win / n;
};

if (process.argv[1] && process.argv[1].endsWith('sim81b.mjs')) {
  const B = PARTY.bots;
  const which = process.argv[2] || 'tilty';
  const plays = { tilty: playTilty, bonk: playBonk };
  if (plays[which]) {
    const play = plays[which], out = {};
    for (const d of PARTY.difficulties) out[d] = rate(play, KID, [B[d], B[d], B[d]], 120);
    let len = 0, tiles = {}; for (const d of PARTY.difficulties) { let s = 0; for (let i = 0; i < 20; i++) { const r = play(77 + i, [B[d], B[d], B[d], B[d]], i + 1); s += r.g.boards ? r.g.boards.reduce((a, b) => a + b.n, 0) / 4 : Object.keys(r.g.outAt).length; len += r.t; } tiles[d] = (s / 20).toFixed(1); }
    console.log(which, out, 'avg tiles', tiles, 'avg length', (len / 60).toFixed(1));
  }
}
