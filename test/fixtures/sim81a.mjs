// Step 81a: whole-game simulations of Glowcap Shuffle and Driftwood Cast on the real rules (bodies are simple kinematic circles: the stick's speed blend, the caps as the walkable ground, the berth pads), used by
// test/partyGlowcap.test.js and test/partyCast.test.js for bot win rates; run `node test/fixtures/sim81a.mjs` to print them.
import { PARTY, PLAYER_SPEED, PLAYER_WALK_SPEED, WALK_THRESHOLD } from '../../public/js/config.js';
import { mulberry32 } from '../../public/js/utils/rng.js';
import * as GL from '../../public/js/game/party/glowcapLogic.js';
import * as CA from '../../public/js/game/party/castLogic.js';
import { stageSpawns, stageCentre, glowcapLayout } from '../../public/js/game/party/partyArea.js';

export const KID = { react: 0.45, noise: 0.12, miss: 0.06, walk: 1, reel: 6 };
const speedOf = (mag) => (mag <= WALK_THRESHOLD ? PLAYER_WALK_SPEED * (mag / WALK_THRESHOLD) : PLAYER_WALK_SPEED + (PLAYER_SPEED - PLAYER_WALK_SPEED) * ((mag - WALK_THRESHOLD) / (1 - WALK_THRESHOLD)));
function move(b, stick, dt, clamp) {
  const mag = Math.min(1, Math.hypot(stick.x, stick.y));
  if (mag > 0.001) { const sp = speedOf(mag); b.x += (stick.x / mag) * sp * dt; b.z += (-stick.y / mag) * sp * dt; }
  if (clamp) clamp(b);
}

export function playGlowcap(seed, skills, rngSeed = 1, { trace = null } = {}) {
  const n = skills.length, roster = skills.map((_, i) => ({ slot: i, bot: true, name: 'b' + i }));
  const g = GL.init(seed, roster), rng = mulberry32(rngSeed), mems = skills.map(() => ({}));
  const c = stageCentre('glowcap'), caps = glowcapLayout();
  const bodies = stageSpawns('glowcap', n).map((s) => ({ x: s.x, z: s.z }));
  const walk = (b) => {                                                           // stay on the caps (the nearest cap's disc)
    let best = null, bd = Infinity;
    for (const cap of caps) { const d = Math.hypot(b.x - c.x - cap.x, b.z - c.z - cap.z); if (d <= cap.r) return; if (d - cap.r < bd) { bd = d - cap.r; best = cap; } }
    const dx = b.x - c.x - best.x, dz = b.z - c.z - best.z, d = Math.hypot(dx, dz); b.x = c.x + best.x + dx / d * best.r * 0.999; b.z = c.z + best.z + dz / d * best.r * 0.999;
  };
  const dt = 1 / 60; let t = 0;
  for (let k = 0; k < 80 * 60 && !g.done; k++) {
    t += dt;
    const v = GL.view(g, t);
    skills.forEach((sk, slot) => {
      if (!g.alive[slot]) return;
      const it = GL.bot(v, { slot, x: bodies[slot].x, z: bodies[slot].z, mem: mems[slot] }, sk, rng);
      move(bodies[slot], it, dt, walk);
    });
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {                  // players push apart softly
      if (!g.alive[i] || !g.alive[j]) continue;
      const dx = bodies[j].x - bodies[i].x, dz = bodies[j].z - bodies[i].z, d = Math.hypot(dx, dz);
      if (d < 0.9 && d > 0.0001) { const p = (0.9 - d) / 2; bodies[i].x -= (dx / d) * p; bodies[i].z -= (dz / d) * p; bodies[j].x += (dx / d) * p; bodies[j].z += (dz / d) * p; walk(bodies[i]); walk(bodies[j]); }
    }
    for (const r of GL.step(g, { t, pos: (s) => bodies[s], slack: PARTY.slack, lag: 0 }, dt, t)) { GL.apply(g, r); if (trace) trace.push(r); }
  }
  return { g, t, placing: GL.placing(g), bodies };
}

export function playCast(seed, skills, rngSeed = 1, { trace = null } = {}) {
  const n = skills.length, roster = skills.map((_, i) => ({ slot: i, bot: true, name: 'b' + i }));
  const g = CA.init(seed, roster), rng = mulberry32(rngSeed), mems = skills.map(() => ({}));
  const dt = 1 / 60; let t = 0;
  for (let k = 0; k < 70 * 60 && !g.done; k++) {
    t += dt;
    const v = CA.view(g, t);
    const presses = [];
    skills.forEach((sk, slot) => { const it = CA.bot(v, { slot, x: 0, z: 0, mem: mems[slot] }, sk, rng); if (it.interact) presses.push(slot); });
    const recs = [];
    for (const slot of presses) { const out = CA.request(g, slot, { t }, { t, slack: PARTY.slack, lag: 0.3 }); if (out.rec) { CA.apply(g, out.rec); recs.push(out.rec); } }      // (a press is only a reel pull: casting is automatic, from step())
    for (const r of CA.step(g, { t }, dt, t)) { CA.apply(g, r); recs.push(r); }
    if (trace) trace.push(...recs);
  }
  return { g, t, placing: CA.placing(g) };
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

if (process.argv[1] && process.argv[1].endsWith('sim81a.mjs')) {
  const B = PARTY.bots;
  for (const [name, play] of [['glowcap', playGlowcap], ['cast', playCast]]) {
    const out = {};
    for (const d of PARTY.difficulties) out[d] = rate(play, KID, [B[d], B[d], B[d]], 160);
    let len = 0; for (let i = 0; i < 30; i++) len += play(77 + i, [B.easy, B.easy, B.easy, B.easy], i + 1).t;
    console.log(name, out, 'avg length', (len / 30).toFixed(1));
  }
}
