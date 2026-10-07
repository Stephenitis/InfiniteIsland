// Step 54, the combat core: dodge-hop, perfect dodges, charged attacks, the Bloom meter, Cancel specials and soft auto-aim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DungeonRun, DUNGEON, WEAPONS } from '../public/js/game/dungeonLogic.js';
import { autoAim, avoidance, dodgeState, gainBloom, bloomPips, GROUND_ATTACKS } from '../public/js/game/combatLogic.js';
import { COMBAT } from '../public/js/config.js';

const at = (x = 0, z = 0) => ({ x: DUNGEON.x + x, z: DUNGEON.z + z });
const A = 'host:0', B = 's1:1';
function setup() { const run = new DungeonRun(); run.start([A, B], { section: 2 }); run.enemies = []; return run; }
const enemy = (id, kind, x, z, extra = {}) => ({ id, kind, ...at(x, z), hp: 1000, stun: 0, wind: 0, cooldown: 0, ...extra });
const hp = (run, key) => run.members[key].hp;
const advance = (run, seconds, positions, step = 0.05) => { for (let t = 0; t < seconds - 1e-9; t += step) run.update(step, positions); };

test('dodge: cooldown counts from landing, stun blocks it, and it cancels a pending attack', () => {
  const run = setup(), pos = { [A]: at(0, 0), [B]: at(2, 0) };
  const e = run.dodge(A, 1, 0, pos); assert.deepEqual(e, { dx: 1, dz: 0 });
  assert.equal(run.dodge(A, 1, 0, pos), null);
  run.time += COMBAT.dodge.air + COMBAT.dodge.cooldown - 0.01; assert.equal(run.dodge(A, 1, 0, pos), null);
  run.time += 0.02; assert.ok(run.dodge(A, 0, 0, pos));                       // no stick: hop in place
  assert.deepEqual([run.members[A].dodge.dx, run.members[A].dodge.dz], [0, 0]);
  run.members[B].stunUntil = run.time + 1; assert.equal(run.dodge(B, 1, 0, pos), null);
  run.members[B].stunUntil = 0; run.attack(B, 'sword', 0, pos); assert.ok(run.members[B].attack);
  run.dodge(B, 0, 1, pos); assert.equal(run.members[B].attack, null);
  assert.equal(run.dodge('nobody', 1, 0, pos), null);
});

test('dodge i-frames ignore any hit; a hop only clears ground attacks, seeds and charges still land once the i-frames end', () => {
  const run = setup(), pos = { [A]: at(0, 0), [B]: at(2, 0) };
  run.dodge(A, 1, 0, pos);
  run.time += 0.1; assert.equal(run.damage(A, 10, 'seed', pos), false); assert.equal(hp(run, A), 100); assert.equal(run.avoided, 'dodge');
  run.time += 0.1;                                                              // 0.2 s: past the 0.18 s i-frames, still airborne (COMBAT.dodge.air)
  run.damage(A, 10, 'stomp', pos); assert.equal(hp(run, A), 100); assert.equal(run.avoided, 'air');
  run.damage(A, 10, 'seed', pos); assert.equal(hp(run, A), 90);
  run.time += 1; run.members[A].invulnerable = 0;
  run.damage(A, 10, 'stomp', pos); assert.equal(hp(run, A), 80);                // landed: ground attacks hit again
  for (const k of ['hop', 'stomp', 'sweep', 'wave']) assert.ok(GROUND_ATTACKS.has(k));
  for (const k of ['seed', 'charge']) assert.ok(!GROUND_ATTACKS.has(k));
  const m = run.members[B]; m.dodge = { at: 5, air: 0.42, inv: 0.18, perfect: false };
  assert.equal(avoidance(m, 'charge', 5.3), null);
  assert.equal(avoidance(m, 'charge', 5.1).why, 'dodge');
  assert.equal(dodgeState(m, 5.3).airborne, true); assert.equal(dodgeState(m, 5.5).airborne, false); assert.equal(dodgeState(null, 1).airborne, false);
});

test('hop, stomp and sweep attacks miss an airborne member and hit a grounded one', () => {
  for (const [kind, attackKind] of [['berry', 'hop'], ['turnip', 'stomp'], ['sprout', 'sweep']]) {
    const run = setup(), pos = { [A]: at(0.6, 0), [B]: at(0.6, 0.2) }, e = enemy(0, kind, 0, 0, { attackKind, aim: at(0.6, 0.1) });
    run.enemies = [e]; run.members[A].invulnerable = run.members[B].invulnerable = 0;
    run.dodge(A, 0, 0, pos); run.time += 0.2;                                    // airborne, past the i-frames
    run.release(e, pos);
    assert.equal(hp(run, A), 100, `${attackKind} should pass under the jumper`);
    assert.ok(hp(run, B) < 100, `${attackKind} should hit the grounded friend`);
  }
});

test('the pumpkin wave passes under a jumper at the moment the ring crosses and hits a grounded member', () => {
  const run = setup(), pos = { [A]: at(0.6, 0), [B]: at(0.6, 0.1) }, e = enemy(0, 'pumpkin', 0, 0, { attackKind: 'wave', cooldown: 99 });
  run.enemies = [e]; run.dodge(A, 0, 0, pos); run.time += 0.2;
  run.release(e, pos); advance(run, 1.2, pos);
  assert.equal(hp(run, A), 100); assert.ok(hp(run, B) < 100);
});

test('seeds still hit an airborne member outside the i-frames, and pass through a dodging one', () => {
  const run = setup(), pos = { [A]: at(0, 0), [B]: at(2, 0) };
  run.projectiles = [{ id: 1, kind: 'seed', enemy: 0, x: DUNGEON.x - 3, z: DUNGEON.z, vx: 5.5, vz: 0, age: 0, radius: 0, hitKeys: [], damage: 9 }];
  run.dodge(A, 0, 0, pos); run.time += 0.25;                                    // airborne but vulnerable to a seed
  advance(run, 1, pos); assert.equal(hp(run, A), 91);
  const run2 = setup();
  run2.projectiles = [{ id: 1, kind: 'seed', enemy: 0, x: DUNGEON.x - 0.5, z: DUNGEON.z, vx: 5.5, vz: 0, age: 0, radius: 0, hitKeys: [], damage: 9 }];
  run2.dodge(A, 0, 0, pos); run2.update(0.05, pos);                             // inside the i-frames
  assert.equal(hp(run2, A), 100); assert.ok(run2.projectiles.length === 1, 'the seed flies on');
});

test('a perfect dodge (hop within 0.15 s of the hit) grants Bloom and an effect, once per hop', () => {
  const run = setup(), pos = { [A]: at(0, 0), [B]: at(2, 0) };
  run.dodge(A, 1, 0, pos); run.time += 0.1;
  run.damage(A, 10, 'seed', pos);
  assert.equal(run.members[A].bloom, COMBAT.bloom.perfect);
  const fx = run.effects.find((f) => f.type === 'perfect'); assert.ok(fx); assert.equal(fx.key, A);
  run.damage(A, 10, 'charge', pos); assert.equal(run.members[A].bloom, COMBAT.bloom.perfect);   // same hop: no double reward
  const run2 = setup(); run2.dodge(A, 1, 0, pos); run2.time += 0.17;                                // inside the i-frames but not perfect
  run2.damage(A, 10, 'seed', pos); assert.equal(run2.members[A].bloom, 0); assert.equal(hp(run2, A), 100);
});

test('the Bloom meter clamps, grows on hits, is NOT drained by damage (playtest) and resets on start', () => {
  const run = setup(), m = run.members[A];
  assert.equal(m.bloom, 0); gainBloom(m, -1); assert.equal(m.bloom, 0);
  gainBloom(m, 10); assert.equal(m.bloom, COMBAT.bloom.max); assert.equal(bloomPips(m), 3);
  m.bloom = 0; for (let i = 0; i < 25; i++) gainBloom(m, COMBAT.bloom.perHit); assert.equal(m.bloom, 3); assert.equal(bloomPips(m), 3);
  const pos = { [A]: at(0, 0), [B]: at(2, 0) };
  m.bloom = 0.1; run.damage(A, 5, 'seed', pos); assert.equal(m.bloom, 0.1);
  m.bloom = 2; m.invulnerable = 0; run.damage(A, 5, 'seed', pos); assert.equal(COMBAT.bloom.onHurt, 0); assert.equal(m.bloom, 2, 'getting hit keeps the meter');
  run.enemies = [enemy(0, 'turnip', 0, 1.5, { stun: 5 })];
  const before = run.members[B].bloom; run.attack(B, 'sword', 0, { [A]: at(5, 5), [B]: at(0, 0) }); run.update(0.2, { [A]: at(5, 5), [B]: at(0, 0) });
  assert.equal(run.members[B].bloom, before + COMBAT.bloom.perHit);
  run.start([A, B], { section: 2 }); assert.equal(run.members[A].bloom, 0); assert.equal(run.members[B].bloom, 0);
  assert.equal(bloomPips({ bloom: 2.99 }), 2); assert.equal(bloomPips(null), 0);
});

test('charged sword spin hits every direction within its range and stuns', () => {
  const run = setup(), pos = { [A]: at(0, 0), [B]: at(5, 5) };
  const s = WEAPONS.sword.charged;
  run.enemies = [enemy(0, 'turnip', 0, 2.4), enemy(1, 'turnip', 0, -2.4), enemy(2, 'turnip', 2.4, 0), enemy(3, 'turnip', -2.4, 0), enemy(4, 'turnip', 0, 3.2)];
  assert.deepEqual(run.attack(A, 'sword', 0, pos, true), { kind: 'sword', combo: 0, charged: true });
  assert.equal(run.attack(A, 'sword', 0, pos, true), null, 'cooldown');
  run.update(s.impact - 0.05, pos); assert.equal(run.enemies[0].hp, 1000);
  run.update(0.1, pos);
  for (const e of run.enemies.slice(0, 4)) { assert.equal(e.hp, 1000 - s.damage); assert.ok(e.stun > s.stun - 0.15 && e.stun <= s.stun); }
  assert.equal(run.enemies[4].hp, 1000);
  assert.equal(run.members[A].bloom, +(4 * COMBAT.bloom.perHit).toFixed(4));
  assert.ok(run.effects.some((f) => f.kind === 'spin' && f.type === 'player'));
});

test('charged axe chop is narrow and long; charged hammer pound is a ring', () => {
  const run = setup(), pos = { [A]: at(0, 0), [B]: at(5, 5) }, c = WEAPONS.axe.charged;
  assert.equal(c.armorBreak, true); assert.ok(c.range > WEAPONS.axe.range && c.damage > WEAPONS.axe.damage[0] && c.stun > WEAPONS.axe.stun);
  run.enemies = [enemy(0, 'turnip', 0, 4.4), enemy(1, 'turnip', 2, 3), enemy(2, 'turnip', 0, 5.2), enemy(3, 'turnip', 0, -2)];
  run.attack(A, 'axe', 0, pos, true); run.update(c.impact + 0.01, pos);
  assert.equal(run.enemies[0].hp, 1000 - c.damage); assert.equal(run.enemies[1].hp, 1000); assert.equal(run.enemies[2].hp, 1000); assert.equal(run.enemies[3].hp, 1000);
  const run2 = setup(), p = WEAPONS.hammer.charged;
  run2.enemies = [enemy(0, 'turnip', 0, 2.9), enemy(1, 'turnip', -2.9, 0), enemy(2, 'turnip', 0, -3.5), enemy(3, 'turnip', 2, 2)];
  run2.attack(A, 'hammer', 0, pos, true); run2.update(p.impact + 0.01, pos);
  assert.deepEqual(run2.enemies.map((e) => e.hp), [1000 - p.damage, 1000 - p.damage, 1000, 1000 - p.damage]);
  assert.ok(run2.enemies[0].stun > p.stun - 0.7 && run2.enemies[0].stun <= p.stun); assert.ok(p.stun > WEAPONS.hammer.stun);
  assert.ok(run2.effects.some((f) => f.kind === 'pound'));
});

test('tap attacks keep their old numbers and are not affected by charged data', () => {
  assert.deepEqual(WEAPONS.sword.damage, [14, 17, 25]); assert.deepEqual(WEAPONS.axe.damage, [29]); assert.deepEqual(WEAPONS.hammer.damage, [44]);
  for (const w of Object.values(WEAPONS)) { assert.ok(w.charged.charge > 0 && w.special.duration > 0); assert.equal(w.charged.keys.length, 2); assert.equal(w.special.keys.length, 2); }
});

test('specials need Bloom pips: 1 for the small one, all 3 for the big one', () => {
  const run = setup(), pos = { [A]: at(0, 0), [B]: at(5, 5) };
  assert.equal(run.special(A, 'sword', 0, pos), null);
  run.members[A].bloom = 1.5; assert.equal(run.special(A, 'sword', 0, pos, true), null, 'big needs 3');
  assert.ok(run.special(A, 'sword', 0, pos)); assert.ok(Math.abs(run.members[A].bloom - 0.5) < 1e-9);
  run.time += 5; run.members[A].bloom = 3; assert.ok(run.special(A, 'hammer', 0, pos, true)); assert.equal(run.members[A].bloom, 0);
  assert.equal(run.special(B, 'club', 0, pos), null);
});

test('sword dash-stab: damages everything along the line, is wall-safe and gives brief i-frames', () => {
  const run = setup(), pos = { [A]: at(-3, 0), [B]: at(5, 5) }, s = WEAPONS.sword.special;
  run.members[A].bloom = 1;
  run.enemies = [enemy(0, 'turnip', 0, 0), enemy(1, 'turnip', 2.5, 0), enemy(2, 'turnip', 0, 2), enemy(3, 'turnip', 5, 0)];
  const event = run.special(A, 'sword', Math.PI / 2, pos);                      // facing +x
  assert.equal(event.special, true); assert.ok(Math.abs(event.dist - s.dash) < 1e-6);
  assert.deepEqual(run.enemies.map((e) => e.hp), [1000 - s.damage, 1000 - s.damage, 1000, 1000]);   // the third is off the line, the fourth is out of reach
  assert.ok(run.members[A].specialInv > run.time);
  assert.equal(run.damage(A, 10, 'seed', pos), false); assert.equal(run.avoided, 'special');
  run.time += s.time + 0.01; run.members[A].invulnerable = 0; run.damage(A, 10, 'seed', pos); assert.equal(hp(run, A), 90);
  // against the root hall's east wall (x = 6 for z = 0) the dash stops short
  const run2 = setup(); run2.members[A].bloom = 3;
  const p2 = { [A]: at(4, 0), [B]: at(5, 5) };
  const wall = run2.special(A, 'sword', Math.PI / 2, p2, true);
  assert.ok(wall.dist < 2 && wall.dist >= 0, `dashed ${wall.dist}`);
  const open = setup(); open.members[A].bloom = 3;
  const big = open.special(A, 'sword', Math.PI / 2, { [A]: at(-4, 0), [B]: at(5, 5) }, true);
  assert.ok(Math.abs(big.dist - s.bigDash) < 1e-6 && big.dist > s.dash);
});

test('axe boomerang flies out, comes back, hits each enemy once per direction and stops at walls', () => {
  const run = setup(), pos = { [A]: at(-4, 0), [B]: at(5, 5) }, s = WEAPONS.axe.special;
  run.members[A].bloom = 1; run.enemies = [enemy(0, 'turnip', 0, 0, { stun: 99 }), enemy(1, 'turnip', 0, 3, { stun: 99 })];
  run.special(A, 'axe', Math.PI / 2, pos); assert.equal(run.pprojectiles.length, 1);
  let phases = new Set();
  for (let i = 0; i < 120 && run.pprojectiles.length; i++) { run.updatePlayerProjectiles(0.05, pos); phases.add(run.pprojectiles[0]?.phase); }
  assert.ok(phases.has('out') && phases.has('back')); assert.equal(run.pprojectiles.length, 0, 'it is caught');
  assert.equal(run.enemies[0].hp, 1000 - 2 * s.damage, 'out and back');
  assert.equal(run.enemies[1].hp, 1000, 'off the path');
  // a wall at the end turns it around
  const run2 = setup(), p2 = { [A]: at(3, 0), [B]: at(5, 5) }; run2.members[A].bloom = 1; run2.special(A, 'axe', Math.PI / 2, p2);
  let blocked = false;
  for (let i = 0; i < 40 && run2.pprojectiles.length; i++) { run2.updatePlayerProjectiles(0.05, p2); if (run2.pprojectiles[0]?.phase === 'back') blocked = true; }
  assert.ok(blocked, 'turned back at the wall (x = 6)');
  // the big one throws two in a V
  const run3 = setup(); run3.members[A].bloom = 3; run3.special(A, 'axe', 0, { [A]: at(0, -2), [B]: at(5, 5) }, true);
  assert.equal(run3.pprojectiles.length, 2); assert.ok(run3.pprojectiles[0].dx * run3.pprojectiles[1].dx < 0);
});

test('hammer shockwave launches enemies; launched enemies cannot act and take 50 percent more', () => {
  const run = setup(), pos = { [A]: at(0, 0), [B]: at(5, 5) }, s = WEAPONS.hammer.special;
  run.members[A].bloom = 2;
  run.enemies = [enemy(0, 'turnip', 2, 0, { wind: 0.5 }), enemy(1, 'berry', 0, 3), enemy(2, 'sprout', 5, 0)];
  run.special(A, 'hammer', 0, pos);
  const [near, mid, far] = run.enemies;
  assert.equal(near.hp, 1000 - s.damage); assert.equal(mid.hp, 1000 - s.damage); assert.equal(far.hp, 1000);
  assert.ok(near.airborne > run.time && mid.airborne > run.time && !far.airborne); assert.equal(near.wind, 0);
  const x0 = near.x, z0 = near.z, hp0 = near.hp;
  advance(run, 0.5, pos); assert.equal(near.x, x0); assert.equal(near.z, z0); assert.equal(near.wind, 0, 'no attack while airborne');
  run.members[A].ready = 0;                                                      // a tap on the airborne enemy: +50 %
  near.x = DUNGEON.x; near.z = DUNGEON.z + 1.5; near.stun = 5;
  run.attack(A, 'sword', 0, pos); run.update(0.2, pos);
  assert.equal(near.hp, hp0 - Math.round(14 * (1 + COMBAT.airborneBonus)));
  advance(run, 1, pos); assert.ok(near.airborne <= run.time);                    // landed
  // the big one is wider and launches longer
  const big = setup(); big.members[A].bloom = 3; big.enemies = [enemy(0, 'turnip', 5, 0)];
  big.special(A, 'hammer', 0, { [A]: at(0, 0), [B]: at(5, 5) }, true);
  assert.ok(big.enemies[0].airborne - big.time > s.launch);
  assert.equal(big.enemies[0].hp, 1000 - s.bigDamage);
});

test('auto-aim snaps to the nearest living visible enemy inside the cone and reach', () => {
  const from = { x: 0, z: 0 }, enemies = [
    { x: 0, z: 3, hp: 10 },                    // straight ahead
    { x: 2, z: 2.2, hp: 10 },                  // about 42 degrees off: outside the 35 degree cone
    { x: 0.6, z: 1.8, hp: 10 },                // about 18 degrees off, nearer: wins
    { x: 0, z: 1, hp: 0 },                     // dead
  ];
  assert.ok(Math.abs(autoAim(from, 0, enemies, 3) - Math.atan2(0.6, 1.8)) < 1e-9);
  assert.equal(autoAim(from, 0, [enemies[1]], 3), 0, 'outside the cone');
  assert.equal(autoAim(from, 0, [{ x: 0, z: 5, hp: 10 }], 3), 0, 'out of reach + 1');
  assert.ok(autoAim(from, 0, [{ x: 0, z: 3.9, hp: 10 }], 3) === 0);              // (straight ahead: unchanged yaw)
  assert.ok(autoAim(from, 0, [{ x: 0.5, z: 3.9, hp: 10 }], 3) > 0, 'in reach (3 + 1 u)');
  assert.equal(autoAim(from, 0, [enemies[2]], 3, { sight: () => false }), 0, 'blocked by a wall');
  assert.equal(autoAim(from, 0, [], 3), 0);
  assert.ok(Math.abs(autoAim(from, Math.PI - 0.1, [{ x: 0.2, z: -2, hp: 5 }], 3) - Math.atan2(0.2, -2)) < 1e-9, 'wraps around +-pi');
});

test('snapshot and load keep the new combat fields', () => {
  const run = setup(), pos = { [A]: at(-3, 0), [B]: at(5, 5) };
  run.members[A].bloom = 3; run.enemies = [enemy(0, 'turnip', 0, 2)]; run.special(A, 'axe', 0, pos); run.time += 5;
  run.members[A].bloom = 3; run.special(A, 'hammer', 0, { [A]: at(0, 0), [B]: at(5, 5) });
  run.dodge(B, 1, 0, pos);
  const snap = JSON.parse(JSON.stringify(run.snapshot())), copy = new DungeonRun(); copy.load(snap);
  assert.deepEqual(copy.members, run.members); assert.deepEqual(copy.pprojectiles, run.pprojectiles);
  assert.equal(copy.enemies[0].airborne, run.enemies[0].airborne); assert.ok(copy.members[B].dodge.at > 0);
  assert.ok(Object.hasOwn(snap, 'pprojectiles'));
  run.leave(); assert.deepEqual(run.pprojectiles, []);
});
