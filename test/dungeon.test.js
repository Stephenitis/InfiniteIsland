import test from 'node:test';
import assert from 'node:assert/strict';
import { DungeonRun, DUNGEON, inDungeon, stoneProgress, WEAPONS, foodHealing, ROOMS, DUNGEON_TILES, DUNGEON_WALLS, dungeonSight, dungeonDistanceField, dungeonWaypoint } from '../public/js/game/dungeonLogic.js';
import * as THREE from 'three';
import { buildCastleRuins } from '../public/js/world/castleRuins.js';
import { getHeight, isWalkable, regionOf } from '../public/js/world/terrain.js';
import { RECIPES } from '../public/js/game/catalog.js';

const at = (x = 0, z = 0) => ({ x: DUNGEON.x + x, z: DUNGEON.z + z });
function setup() { const run = new DungeonRun(); run.start(['host:0', 's1:1']); return run; }
function duel(kind = 'berry') {
  const run = setup(); run.enemies = [{ id: 0, kind, ...at(0, 1.5), hp: 1000, stun: 0, wind: 0, cooldown: 0 }]; return run;
}
test('only the complete 1-1-1-3 code opens the portal; wrong hits retain valid overlap', () => {
  const r = new DungeonRun();
  for (const n of [1, 1, 2, 1, 1, 1, 1]) { r.strike(n); assert.equal(r.open, false); }
  r.strike(3); assert.equal(r.open, true);
  r.strike(2); assert.equal(r.open, true); // Once opened it stays available until entry.
  assert.equal(stoneProgress(2, 4), 0);
  r.start(['host:0']); r.strike(1); assert.equal(r.open, false); assert.equal(r.progress, 0);
  r.leave(); assert.equal(r.open, false);
});
test('pocket terrain supports rooms and corridor, with unreachable sea between dimensions', () => {
  for (const p of [at(0, 16), at(0, 6), at(0, -16), at(0, -30)]) {
    assert.equal(inDungeon(p.x, p.z), true); assert.equal(isWalkable(p.x, p.z), true); assert.equal(getHeight(p.x, p.z), DUNGEON.y);
  }
  assert.equal(inDungeon(...[DUNGEON.x + 20, DUNGEON.z]), false);
  assert.equal(isWalkable(DUNGEON.x + 20, DUNGEON.z), false);
  assert.equal(regionOf(1000, 1000), 'sea');
});
test('sword damage resolves at impact with a 3-hit combo and resets after a pause', () => {
  const r = duel(), positions = { 'host:0': at() }, e = r.enemies[0];
  for (const [combo, damage] of [[0, 14], [1, 17], [2, 25], [0, 14]]) {
    e.x = DUNGEON.x; e.z = DUNGEON.z + 1.5; e.stun = 10;
    const hp = e.hp;
    assert.equal(r.attack('host:0', 'sword', 0, positions).combo, combo);
    r.update(0.1, positions); assert.equal(e.hp, hp);
    r.update(0.1, positions); assert.equal(e.hp, hp - damage);
    r.update(0.19, positions);
  }
  r.update(1.2, {}); assert.equal(r.attack('host:0', 'sword', 0, positions).combo, 0);
});
test('cooldown, unsupported tools, invalid facing, missing membership and outside attacks are rejected', () => {
  const r = setup(), p = { 'host:0': at() };
  assert.equal(r.attack('host:0', 'shovel', 0, p), null);
  assert.equal(r.attack('host:0', 'sword', NaN, p), null);
  assert.equal(r.attack('fake', 'sword', 0, p), null);
  assert.equal(r.attack('host:0', 'sword', 0, { 'host:0': { x: 0, z: 0 } }), null);
  assert.ok(r.attack('host:0', 'hammer', 0, p)); assert.equal(r.attack('host:0', 'hammer', 0, p), null);
});
test('sword misses behind, axe cleaves side targets and hammer stuns at its heavy impact', () => {
  for (const [kind, facing, expected] of [['sword', Math.PI, 0], ['axe', Math.PI / 2, 29], ['hammer', 0, 44]]) {
    const r = duel(), e = r.enemies[0], pos = { 'host:0': at() }; e.stun = 10;
    r.attack('host:0', kind, facing, pos); r.update(WEAPONS[kind].impact + 0.01, pos);
    assert.equal(e.hp, 1000 - expected);
    if (kind === 'hammer') assert.ok(e.stun > 0.7);
  }
});
test('moving away before impact or leaving a run cancels pending damage', () => {
  const r = duel(), e = r.enemies[0]; r.attack('host:0', 'hammer', 0, { 'host:0': at() });
  r.update(0.6, { 'host:0': at(6) }); assert.equal(e.hp, 1000);
  r.attack('host:0', 'sword', 0, { 'host:0': at() }); r.leave(); r.update(1, { 'host:0': at() }); assert.equal(e.hp, 1000);
});
test('enemy attacks warn before impact and can be evaded by leaving the marked spot', () => {
  const r = duel(), pos = { 'host:0': at() };
  r.update(0.01, pos); assert.ok(r.enemies[0].wind > 0); assert.equal(r.members['host:0'].hp, 100);
  r.update(0.8, { 'host:0': at(4) }); assert.equal(r.members['host:0'].hp, 100);
});
test('damage grants invulnerability; any member reaching zero resets the entire party', () => {
  const r = duel(), pos = { 'host:0': at() };
  r.update(0.01, pos); r.update(0.8, pos); assert.equal(r.members['host:0'].hp, 91);
  const e = r.enemies[0]; e.wind = 0.01; e.target = 'host:0'; e.aim = at();
  r.update(0.1, pos); assert.equal(r.members['host:0'].hp, 91);
  r.members['host:0'].hp = 1; r.members['s1:1'].hp = 15; r.members['host:0'].invulnerable = 0;
  e.wind = 0.01; e.target = 'host:0'; e.aim = at(); const serial = r.serial;
  assert.equal(r.update(0.1, pos), 'reset'); assert.equal(r.serial, serial + 1);
  assert.equal(r.members['host:0'].hp, 100); assert.equal(r.members['s1:1'].hp, 100); assert.equal(r.enemies.length, 9);
});
test('the entrance is safe even if enemies or attack markers reach it', () => {
  const r = duel(), e = r.enemies[0], pos = { 'host:0': at(0, 16) };
  e.x = pos['host:0'].x; e.z = pos['host:0'].z; e.wind = 0.1; e.aim = pos['host:0']; e.target = 'host:0';
  r.update(1, pos); assert.equal(r.members['host:0'].hp, 100); assert.equal(r.inCombat('host:0', pos), false);
  const spawn = { 'host:0': at(-2.7, 10) }; // The actual party arrival also lies inside the safe bailey.
  Object.assign(e, spawn['host:0']); assert.equal(r.inCombat('host:0', spawn), false);
});
test('only cooked recipes heal, later islands heal more, and shared dishes are consumed once', () => {
  const r = setup(), pos = { 'host:0': at(0, 16) }; let food = 1;
  r.members['host:0'].hp = 20;
  assert.deepEqual(['home', 'frost', 'ember'].map((island) => foodHealing({ island })), [25, 45, 65]);
  const eat = () => r.eat('host:0', RECIPES[0], pos, () => food-- > 0);
  assert.equal(eat(), true); assert.equal(r.members['host:0'].hp, 45); assert.equal(eat(), false); assert.equal(r.members['host:0'].hp, 45);
  assert.equal(foodHealing({ island: 'sea' }), 0);
});
test('healing rejects nearby enemies, combat cooldown, full HP, outside players and unknown recipes without consumption', () => {
  const r = duel(); let consumed = 0; const consume = () => { consumed++; return true; };
  r.members['host:0'].hp = 50;
  assert.equal(r.eat('host:0', RECIPES[0], { 'host:0': at() }, consume), false);
  r.members['host:0'].combatUntil = 4;
  assert.equal(r.eat('host:0', RECIPES[0], { 'host:0': at(0, 16) }, consume), false);
  r.update(5, {}); r.members['host:0'].hp = 100;
  assert.equal(r.eat('host:0', RECIPES[0], { 'host:0': at(0, 16) }, consume), false);
  r.members['host:0'].hp = 90;
  assert.equal(r.eat('host:0', RECIPES[0], { 'host:0': { x: 0, z: 0 } }, consume), false);
  assert.equal(r.eat('host:0', null, { 'host:0': at(0, 16) }, consume), false); assert.equal(consumed, 0);
  assert.equal(r.eat('host:0', RECIPES[0], { 'host:0': at(0, 16) }, consume), true); assert.equal(r.members['host:0'].hp, 100);
});
test('clear reward signal fires once per run; snapshots retain party HP and a pending attack', () => {
  const r = setup(); r.enemies.forEach((e) => { e.hp = 0; });
  assert.equal(r.update(0.1, {}), 'cleared'); assert.equal(r.update(0.1, {}), null);
  r.attack('host:0', 'sword', 0, { 'host:0': at() }); r.members['s1:1'].hp = 42;
  const replica = new DungeonRun(); replica.load(r.snapshot()); assert.deepEqual(replica.snapshot(), r.snapshot());
  r.members['s1:1'].hp = 100; assert.equal(replica.members['s1:1'].hp, 42);
});

test('every room, enemy and paving tile is reachable from the entrance; the maze has loops and three dead ends', () => {
  const field = dungeonDistanceField(at(0, 16));
  assert.equal(field.size, DUNGEON_TILES.length);
  assert.equal(ROOMS.filter((r) => r.deadEnd).length, 3);
  const cellKeys = new Set(DUNGEON_TILES.map((t) => `${t.tx},${t.tz}`));
  for (const r of ROOMS.filter((room) => room.deadEnd)) {
    const exits = new Set(), inside = (x, z) => Math.abs(x - r.x) < r.w / 2 && Math.abs(z - r.z) < r.d / 2;
    for (const t of DUNGEON_TILES.filter((t) => inside(t.x, t.z))) {
      for (const [dx, dz, side] of [[1, 0, 'east'], [-1, 0, 'west'], [0, 1, 'south'], [0, -1, 'north']]) {
        if (!inside(t.x + dx * 2, t.z + dz * 2) && cellKeys.has(`${t.tx + dx},${t.tz + dz}`)) exits.add(side);
      }
    }
    assert.equal(exits.size, 1, `${r.name} has just one entrance`);
  }
  for (const r of ROOMS) assert.equal(inDungeon(DUNGEON.x + r.x, DUNGEON.z + r.z, 0.5), true, r.name);
  for (const e of setup().enemies) assert.equal(inDungeon(e.x, e.z, 0.8), true, e.kind);
  for (const t of DUNGEON_TILES) assert.equal(isWalkable(DUNGEON.x + t.x, DUNGEON.z + t.z), true);
  for (const w of DUNGEON_WALLS) assert.equal(inDungeon(DUNGEON.x + w.x + w.dx * 0.2, DUNGEON.z + w.z + w.dz * 0.2), false);
  // Both cloisters rejoin the central route instead of ending at the side rooms.
  assert.ok(dungeonSight(at(-20, -20), at(0, -20)));
  assert.ok(dungeonSight(at(20, -34), at(0, -34)));
});
test('clearance spans room/hallway joins without invisible seams and blocks side walls', () => {
  for (let z = 17; z > -40; z -= 0.25) assert.equal(inDungeon(DUNGEON.x, DUNGEON.z + z, 0.8), true, `central path ${z}`);
  assert.equal(inDungeon(DUNGEON.x + 2.1, DUNGEON.z - 12, 0.5), false);
});
test('navigation steers around a hallway corner without crossing walls or oscillating', () => {
  const from = at(-20, -8), goal = at(0, 0), field = dungeonDistanceField(goal);
  assert.equal(dungeonSight(from, goal, 0.8), false);
  for (let i = 0; i < 1200 && Math.hypot(from.x - goal.x, from.z - goal.z) > 0.3; i++) {
    const next = dungeonWaypoint(from, goal, field); assert.ok(next);
    const distance = Math.hypot(next.x - from.x, next.z - from.z), step = Math.min(0.08, distance);
    const target = { x: from.x + (next.x - from.x) / (distance || 1) * step, z: from.z + (next.z - from.z) / (distance || 1) * step };
    assert.ok(dungeonSight(from, target, 0.8)); Object.assign(from, target);
  }
  assert.ok(Math.hypot(from.x - goal.x, from.z - goal.z) < 0.3);
});
test('stone corners block strikes and enemy awareness, permitting rest behind a wall', () => {
  const r = duel(), p = at(-3, -5), e = r.enemies[0]; Object.assign(e, at(-1, -7));
  assert.equal(dungeonSight(p, e), false);
  assert.equal(r.inCombat('host:0', { 'host:0': p }), false);
  r.attack('host:0', 'axe', Math.PI / 4, { 'host:0': p }); r.update(0.35, { 'host:0': p });
  assert.equal(e.hp, 1000); assert.equal(e.wind, 0);
});
test('an alerted enemy follows the maze around a bend and reaches striking distance', () => {
  const r = duel(), e = r.enemies[0], p = at(0, 0); Object.assign(e, at(-20, -8), { target: 'host:0', aggroUntil: 100 });
  for (let i = 0; i < 1000 && Math.hypot(e.x - p.x, e.z - p.z) > 1.8; i++) {
    r.update(1 / 60, { 'host:0': p }); assert.ok(inDungeon(e.x, e.z, 0.8));
  }
  assert.ok(Math.hypot(e.x - p.x, e.z - p.z) <= 1.8);
});
test('castle shell uses merged paving, masonry, relics and overgrowth with finite geometry', () => {
  const root = new THREE.Group(); buildCastleRuins(root);
  assert.equal(root.children.length, 4);
  assert.deepEqual(root.children.map((c) => c.name), ['castle-paving', 'ruined-masonry', 'castle-relics', 'castle-overgrowth']);
  for (const mesh of root.children) {
    assert.ok(mesh.geometry.attributes.position.count > 100);
    assert.ok(mesh.geometry.attributes.position.array.every(Number.isFinite));
    mesh.geometry.dispose();
  }
});
