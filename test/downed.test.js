// Step 55: downed members, revive by hold, self-revive, wipe to the section start and party scaling (pure DungeonRun rules).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DungeonRun, DUNGEON, SECTIONS, ENEMY_KINDS, buildEnemies, partyScale, sectionStart } from '../public/js/game/dungeonLogic.js';
import { COMBAT } from '../public/js/config.js';

const at = (x = 0, z = 0) => ({ x: DUNGEON.x + x, z: DUNGEON.z + z });
const A = 'host:0', B = 's1:1', C = 's2:2';
const C_ = COMBAT.revive;
function setup(keys = [A, B]) { const run = new DungeonRun(); run.start(keys, { section: 2 }); run.enemies = []; return run; }
const enemy = (id, kind, x, z, extra = {}) => ({ id, kind, ...at(x, z), hp: 1000, max: 1000, stun: 0, wind: 0, cooldown: 0, ...extra });
const kill = (run, key, pos) => { run.members[key].invulnerable = 0; return run.damage(key, 999, 'hop', pos); };
const advance = (run, seconds, pos, beat = null, step = 0.05) => {
  for (let t = 0; t < seconds - 1e-9; t += step) { if (beat) beat(); run.update(step, pos); }
};

test('0 HP downs a member instead of resetting the run', () => {
  const run = setup(), pos = { [A]: at(0, 0), [B]: at(8, 0) }, serial = run.serial;
  assert.equal(kill(run, A, pos), false);
  const m = run.members[A];
  assert.equal(m.downed, true); assert.equal(m.hp, 0); assert.equal(m.bloom, 0);
  assert.equal(run.serial, serial); assert.equal(run.members[B].hp, 100);
  assert.deepEqual(run.drainNotes(), [{ type: 'down', key: A }]);
  assert.deepEqual(run.drainNotes(), []);
});

test('a downed member cannot attack, dodge, special, eat or be hurt', () => {
  const run = setup(), pos = { [A]: at(0, 0), [B]: at(8, 0) };
  run.members[A].bloom = 3; run.members[A].hp = 10; kill(run, A, pos); run.members[A].bloom = 3;
  assert.equal(run.attack(A, 'sword', 0, pos), null);
  assert.equal(run.dodge(A, 1, 0, pos), null);
  assert.equal(run.special(A, 'sword', 0, pos), null);
  assert.equal(run.eat(A, { island: 'home', dish: 'x' }, { [A]: at(0, 16) }, () => true), false);
  assert.equal(run.damage(A, 5, 'hop', pos), false); assert.equal(run.members[A].hp, 0);
});

test('guardians ignore a downed member (targeting, melee and projectiles)', () => {
  const run = setup(), pos = { [A]: at(0, 0), [B]: at(-8, 0) };
  kill(run, A, pos);
  run.enemies = [enemy(0, 'sprout', 1.2, 0)];
  advance(run, 3, pos);
  assert.equal(run.members[A].hp, 0); assert.equal(run.enemies[0].wind, 0); assert.notEqual(run.enemies[0].target, A);
  // an enemy that was hunting A and aggro'd still cannot pick the sprout
  run.enemies[0].target = A; run.enemies[0].aggroUntil = run.time + 5; const before = { x: run.enemies[0].x, z: run.enemies[0].z };
  run.update(0.5, pos); assert.deepEqual({ x: run.enemies[0].x, z: run.enemies[0].z }, before);
  // projectiles pass through
  run.enemies = [enemy(0, 'berry', 6, 0, { hp: 38, max: 38 })];
  run.projectiles.push({ id: 99, kind: 'seed', enemy: 0, x: DUNGEON.x + 2, z: DUNGEON.z, vx: -5.5, vz: 0, age: 0, radius: 0, hitKeys: [], damage: 9 });
  advance(run, 1, pos);
  assert.equal(run.members[A].hp, 0); assert.equal(run.members[B].hp, 100);
});

test('holding for the revive time within the radius revives at 40% HP with invulnerability', () => {
  const run = setup(), pos = { [A]: at(0, 0), [B]: at(1, 0) };
  kill(run, A, pos); run.drainNotes();
  const beat = () => run.reviveBeat(B, A, pos);
  advance(run, C_.hold - 0.3, pos, beat);
  assert.equal(run.members[A].downed, true); assert.ok(run.members[A].revive > 1);
  advance(run, 0.5, pos, beat);
  const m = run.members[A];
  assert.equal(m.downed, false); assert.equal(m.hp, Math.round(DUNGEON.hp * C_.hp)); assert.ok(m.invulnerable > run.time);
  assert.deepEqual(run.drainNotes(), [{ type: 'revive', key: A, self: false }]);
  assert.equal(run.damage(A, 20, 'hop', pos), false); assert.equal(m.hp, 40);   // invulnerable
  run.time += C_.inv + 0.1; run.damage(A, 20, 'hop', pos); assert.equal(m.hp, 20);
});

test('out of range, a downed or missing reviver, or a stale heartbeat does nothing', () => {
  const run = setup([A, B, C]), pos = { [A]: at(0, 0), [B]: at(4, 0), [C]: at(1, 0) };
  kill(run, A, pos);
  assert.equal(run.reviveBeat(B, A, pos), false, 'too far');
  assert.equal(run.reviveBeat(A, A, pos), false, 'self');
  kill(run, C, pos); assert.equal(run.reviveBeat(C, A, pos), false, 'downed reviver');
  assert.equal(run.reviveBeat('nobody', A, pos), false);
  pos[B] = at(1, 0); assert.equal(run.reviveBeat(B, A, pos), true);
  advance(run, 1, pos);   // no more heartbeats: expires after 2.5 beats, progress decays instead of finishing
  assert.equal(run.members[A].downed, true); assert.equal(Object.keys(run.members[A].revivers).length, 0); assert.ok(run.members[A].revive < 0.3);
});

test('damage to the reviver interrupts and resets the progress', () => {
  const run = setup(), pos = { [A]: at(0, 0), [B]: at(1, 0) };
  kill(run, A, pos);
  const beat = () => run.reviveBeat(B, A, pos);
  advance(run, 1, pos, beat); assert.ok(run.members[A].revive > 0.8);
  run.members[B].invulnerable = 0; run.damage(B, 9, 'hop', pos);
  assert.equal(run.members[A].revive, 0); assert.equal(Object.keys(run.members[A].revivers).length, 0);
  assert.equal(run.reviveBeat(B, A, pos), false, 'stunned reviver cannot resume at once');
  run.time += 0.5; assert.equal(run.reviveBeat(B, A, pos), true);
});

test('two revivers work together (faster) and one being hurt does not stop the other', () => {
  const run = setup([A, B, C]), pos = { [A]: at(0, 0), [B]: at(1, 0), [C]: at(-1, 0) };
  kill(run, A, pos);
  const beat = () => { run.reviveBeat(B, A, pos); run.reviveBeat(C, A, pos); };
  advance(run, 0.9, pos, beat); assert.ok(run.members[A].revive > 1.2 && run.members[A].downed);
  run.members[B].invulnerable = 0; run.damage(B, 5, 'hop', pos);
  assert.ok(run.members[A].revive > 0, 'another reviver keeps the progress');
  advance(run, 1, pos, beat); assert.equal(run.members[A].downed, false);
});

test('self-revive: only after the delay and only while the area is calm', () => {
  const run = setup(), pos = { [A]: at(0, 0), [B]: at(30, 0) };
  kill(run, A, pos);
  advance(run, C_.selfDelay - 1, pos); assert.equal(run.members[A].downed, true);
  // a living guardian within the calm radius keeps the sprout down...
  run.enemies = [enemy(0, 'turnip', 5, 0, { stun: 99 })];
  advance(run, 3, pos); assert.equal(run.members[A].downed, true);
  // ...and so does one hunting a living member far away
  run.enemies = [enemy(0, 'turnip', 30, 10, { stun: 99, aggroUntil: run.time + 60, target: B })];
  advance(run, 1, pos); assert.equal(run.members[A].downed, true);
  // aggro on a downed member does not count
  run.enemies[0].target = A; advance(run, 0.2, pos);
  assert.equal(run.members[A].downed, false); assert.equal(run.members[A].hp, 40);
  assert.deepEqual(run.drainNotes().filter((n) => n.type === 'revive'), [{ type: 'revive', key: A, self: true }]);
});

test('a solo player who is downed wipes at once back to the section start', () => {
  const run = new DungeonRun(); run.start([A], { section: 2 });
  const pos = { [A]: at(5, -5) }, serial = run.serial, runId = run.run;
  run.enemies[0].hp = 3; run.members[A].bloom = 2; run.projectiles.push({ id: 1, kind: 'seed', enemy: 0, x: 0, z: 0, vx: 0, vz: 0, age: 0, radius: 0, hitKeys: [], damage: 1 });
  assert.equal(kill(run, A, pos), true);
  assert.equal(run.serial, serial + 1); assert.equal(run.run, runId + 1);
  assert.equal(run.members[A].hp, 100); assert.equal(run.members[A].downed, false); assert.equal(run.members[A].bloom, 0);
  assert.equal(run.enemies[0].hp, ENEMY_KINDS[run.enemies[0].kind].hp); assert.equal(run.projectiles.length, 0); assert.equal(run.section, 2);   // (the wipe restarts the CURRENT section)
  assert.equal(run.members[A].invulnerable, run.time + C_.wipeInv);   // a grace while replicas' poses catch up with the teleport
  assert.equal(run.damage(A, 10, 'hop', pos), false); assert.equal(run.members[A].hp, 100);
  assert.deepEqual(run.drainNotes().map((n) => n.type), ['down', 'wipe']);
  assert.deepEqual(sectionStart(0, 1), { x: DUNGEON.x - 2.7 + 1.8, z: DUNGEON.z + 58 }); assert.deepEqual(sectionStart(2, 0), { x: DUNGEON.x - 2.7, z: DUNGEON.z + 6 });
});

test('a party wipes only when everyone is downed; leaving the run while the rest are downed also wipes', () => {
  const run = setup([A, B, C]), pos = { [A]: at(0, 0), [B]: at(5, 0), [C]: at(-5, 0) };
  run.enemies = [enemy(0, 'turnip', -3, -3, { hp: 10, max: 1000 })]; const serial = run.serial;
  kill(run, A, pos); kill(run, B, pos); assert.equal(run.serial, serial); assert.equal(run.members[C].downed, false);
  assert.equal(kill(run, C, pos), true);
  assert.equal(run.serial, serial + 1); assert.equal(run.enemies.length, buildEnemies(SECTIONS[2], 3).length);
  for (const k of [A, B, C]) assert.equal(run.members[k].hp, 100);
  kill(run, A, pos); kill(run, B, pos); assert.equal(run.drop(C), true);   // C leaves: A and B are all that is left, and both are down
  assert.equal(run.serial, serial + 2);
});

test('the run reward flow still works after a wipe (cleared resets, then clears again)', () => {
  const run = new DungeonRun(); run.start([A], { section: 6 }); run.enemies = []; const pos = { [A]: at(0, 0) };
  run.cleared = true; kill(run, A, pos); assert.equal(run.cleared, false);
  run.enemies = [enemy(0, 'sprout', 5, 5, { hp: 0 })];
  assert.equal(run.update(0.1, pos), 'cleared');
});

test('snapshot / load keep the section, downed state and revive progress', () => {
  const run = setup(), pos = { [A]: at(0, 0), [B]: at(1, 0) };
  kill(run, A, pos); run.reviveBeat(B, A, pos); advance(run, 0.5, pos, () => run.reviveBeat(B, A, pos));
  const snap = run.snapshot(), copy = new DungeonRun(); copy.load(snap);
  assert.equal(snap.section, 2); assert.equal(copy.section, 2);
  assert.equal(copy.members[A].downed, true); assert.ok(copy.members[A].revive > 0.4);
  assert.deepEqual(copy.snapshot(), snap);
});

test('party scaling: guardian max HP follows the member count at start', () => {
  assert.deepEqual([1, 2, 3, 4, 7].map(partyScale), [1, 1.6, 2.2, 2.8, 2.8]);
  for (const n of [1, 2, 3, 4]) {
    const run = new DungeonRun(); run.start(['a:0', 'b:1', 'c:2', 'd:3'].slice(0, n));
    for (const e of run.enemies) { assert.equal(e.max, Math.round(ENEMY_KINDS[e.kind].hp * COMBAT.scale.hp[n - 1])); assert.equal(e.hp, e.max); }
  }
});

test('party scaling: join and leave mid-fight keep each guardian\'s fraction of max HP', () => {
  const run = new DungeonRun(); run.start([A], { section: 2 });
  const base = run.enemies.find((e) => e.kind === 'walnut'), H = ENEMY_KINDS.walnut.hp;   // (the halls' mini-boss)
  base.hp = Math.round(base.max / 2); const dead = run.enemies[0]; dead.hp = 0;
  run.join(B);
  assert.equal(base.max, Math.round(H * 1.6)); assert.equal(base.hp, Math.round(H * 1.6 / 2)); assert.equal(dead.hp, 0);
  run.join(C); assert.equal(base.max, Math.round(H * 2.2)); assert.equal(base.hp, Math.round(H * 2.2 / 2));
  run.drop(C); run.drop(B); assert.equal(base.max, H); assert.equal(base.hp, H / 2);
  base.hp = 1; run.join(B); assert.ok(base.hp >= 1, 'never rounds a living guardian to zero');
  assert.equal(run.join(B), false);
});

test('buildEnemies: the extra-per-party-size hook adds copies beside the spawn (default none)', () => {
  assert.equal(buildEnemies(SECTIONS[2], 4).length, SECTIONS[2].enemies.length + 1);   // (the halls: only the walnut has an extra, at four players)
  const section = { enemies: [['berry', 0, 0, [0, 1, 2, 3]], ['sprout', 4, 4]] };
  assert.deepEqual([1, 2, 3, 4].map((n) => buildEnemies(section, n).length), [2, 3, 4, 5]);
  const four = buildEnemies(section, 4); assert.deepEqual(four.map((e) => e.id), [0, 1, 2, 3, 4]);
  assert.equal(four[2].max, Math.round(ENEMY_KINDS.berry.hp * 2.8));
});
