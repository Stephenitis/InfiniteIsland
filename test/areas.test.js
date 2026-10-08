// Step 56: the combat area framework: floor shapes / map types on the shared tile grid, Wildroot as data (identical to the old ROOMS grid), gates, the objectives
// engine through DungeonRun (clear / collect / light / bosses, section advance, wipes), snapshots, the combat save and the ritual menu rows. All pure, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, registerArea, createGrid, shapeTiles, floorTiles, mapFloor, blobRadius, areaAt, inAnyArea, areaInland, areaSectionStart, ritualMenuRows, TILE_SIZE } from '../public/js/game/areaLogic.js';
import { DungeonRun, DUNGEON, ROOMS, DUNGEON_TILES, DUNGEON_WALLS, inDungeon, SECTIONS, buildEnemies, ENEMY_KINDS, dungeonSight, dungeonDistanceField } from '../public/js/game/dungeonLogic.js';
import { initObjective, tickObjective, lightBrazier, objectiveTargets, objectiveText, STUBS, IMPLEMENTED } from '../public/js/game/objectives.js';
import { normaliseCombat, markCleared, mergeArmory, createCombatProgress, DEFAULT_WEAPONS } from '../public/js/game/combatSave.js';
import { COMBAT } from '../public/js/config.js';
import { isWalkable, getHeight, getGroundType, regionOf } from '../public/js/world/terrain.js';
import { ROOTGATE, rootgateReserved } from '../public/js/world/islands/rootgate.js';
import { runMeta } from '../public/js/game/playerMemory.js';
import { TEST_AREA, TEST_ORIGIN } from '../public/js/game/areas/testYard.js';

const key = (tx, tz) => `${tx},${tz}`;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** The tiles reachable from `start` over 4-neighbours (a Set of keys). */
function flood(tiles, start) {
  const set = new Set(tiles.map((t) => key(t.tx, t.tz))), seen = new Set([key(start.tx, start.tz)]), queue = [start];
  for (let i = 0; i < queue.length; i++) for (const [dx, dz] of DIRS) {
    const k = key(queue[i].tx + dx, queue[i].tz + dz);
    if (set.has(k) && !seen.has(k)) { seen.add(k); queue.push({ tx: queue[i].tx + dx, tz: queue[i].tz + dz }); }
  }
  return seen;
}
const connected = (grid) => flood(grid.allTiles, grid.allTiles[0]).size === grid.allTiles.length;
const originOf = { x: 5000, z: 5000, y: 8 };

// ---------------------------------------------------------------------------------------------
// floor shapes and map types
// ---------------------------------------------------------------------------------------------
test('shapes: a rect keeps the old room rule, circles and blobs cover tile centres, carve removes', () => {
  assert.equal(shapeTiles({ x: 0, z: 0, w: 8, d: 4 }).length, 8);
  const circle = shapeTiles({ shape: 'circle', x: 0, z: 0, r: 6 });
  assert.ok(circle.every(([tx, tz]) => Math.hypot(tx * 2 + 1, tz * 2 + 1) <= 6 + 1e-9));
  assert.ok(circle.length > 20 && circle.length < 40, `${circle.length} tiles for r = 6`);
  const blob = { shape: 'blob', x: 0, z: 0, r: 10, wobble: 0.2, lobes: 3, seed: 2 };
  assert.deepEqual(shapeTiles(blob), shapeTiles(blob), 'deterministic');
  assert.ok(shapeTiles(blob).every(([tx, tz]) => Math.hypot(tx * 2 + 1, tz * 2 + 1) <= blobRadius(blob, Math.atan2(tz * 2 + 1, tx * 2 + 1)) + 1e-9));
  assert.notDeepEqual(shapeTiles(blob).length, shapeTiles({ ...blob, wobble: 0 }).length, 'the wobble changes the outline');
  const full = floorTiles([{ x: 0, z: 0, w: 12, d: 12 }]).size, holed = floorTiles([{ x: 0, z: 0, w: 12, d: 12 }, { shape: 'circle', x: 0, z: 0, r: 2, carve: true }]).size;
  assert.ok(holed < full, 'a carved pillar removes tiles');
  assert.equal(floorTiles([{ shape: 'circle', x: 0, z: 0, r: 2, carve: true }, { x: 0, z: 0, w: 4, d: 4 }]).size, 4, 'order matters: carve only removes what is already there');
});

const MAPS = {
  maze: { rects: [{ x: 0, z: 0, w: 12, d: 12 }, { x: 10, z: 0, w: 16, d: 4 }, { x: 20, z: 0, w: 12, d: 12 }] },
  grounds: { x: 0, z: 0, r: 22, wobble: 0.12, lobes: 4, seed: 3, obstacles: [{ x: -8, z: 4, r: 3 }, { x: 9, z: -6, r: 3.5 }, { x: 0, z: 12, r: 2.5 }] },
  groundsRect: null,
  cavern: { circles: [{ x: 0, z: 0, r: 8 }, { x: 14, z: -10, r: 6 }, { x: 4, z: -24, r: 9 }, { x: -12, z: -18, r: 5 }], link: 4 },
  gauntlet: { x: 0, z: 0, dir: '-z', rooms: [{ len: 10, w: 14 }, { len: 12, w: 10 }, { len: 8, w: 16 }], corridor: { len: 6, w: 4 } },
  arena: { x: 0, z: 0, r: 14 },
};
test('map types: every floor is one connected piece with clearance at the tile centres', () => {
  for (const [type, spec] of Object.entries(MAPS)) {
    if (!spec) continue;
    const grid = createGrid(originOf, mapFloor(type, spec));
    assert.ok(grid.allTiles.length > 10, type);
    assert.ok(connected(grid), `${type} is connected`);
    // a body of radius 0.9 fits at every tile centre of a 2-wide path (clearance), and every tile centre is floor
    for (const t of grid.allTiles) {
      const x = originOf.x + t.x, z = originOf.z + t.z;
      assert.equal(grid.inArea(x, z), true, `${type} tile ${t.tx},${t.tz}`);
      assert.equal(grid.inArea(x, z, 0.9), true, `${type} clearance at ${t.tx},${t.tz}`);
    }
    // outside the floor there is none
    assert.equal(grid.inArea(originOf.x + 500, originOf.z), false);
  }
  const grounds = createGrid(originOf, mapFloor('grounds', MAPS.grounds));
  assert.equal(grounds.inArea(originOf.x - 8, originOf.z + 4), false, 'an obstacle is not floor');
  assert.equal(grounds.sight({ x: originOf.x - 14, z: originOf.z + 4 }, { x: originOf.x - 2, z: originOf.z + 4 }), false, 'and it blocks sight');
  assert.equal(createGrid(originOf, mapFloor('grounds', { x: 0, z: 0, w: 20, d: 16 })).allTiles.length, 80);
  assert.throws(() => mapFloor('nope', {}), /Unknown map type/);
  const gauntlet = mapFloor('gauntlet', MAPS.gauntlet);
  assert.equal(gauntlet.length, 5, 'three rooms joined by two corridors');
  assert.ok(gauntlet[4].z < gauntlet[0].z, 'it heads north (-z)');
});
test('the blob stays one piece for many seeds and wobbles', () => {
  for (let seed = 0; seed < 12; seed++) for (const wobble of [0.1, 0.2, 0.3]) {
    const grid = createGrid(originOf, [{ shape: 'blob', x: 0, z: 0, r: 16, wobble, lobes: 2 + seed % 4, seed }]);
    assert.ok(connected(grid), `seed ${seed} wobble ${wobble}`);
  }
});

// ---------------------------------------------------------------------------------------------
// Wildroot is today's grid
// ---------------------------------------------------------------------------------------------
test('Wildroot as data: the halls are the old castle rooms, the area is one connected place once every gate is open, and the queries agree', () => {
  const old = new Map();
  for (const r of ROOMS) for (let x = r.x - r.w / 2; x < r.x + r.w / 2; x += 2) for (let z = r.z - r.d / 2; z < r.z + r.d / 2; z += 2) {
    const tx = Math.floor(x / 2), tz = Math.floor(z / 2); old.set(key(tx, tz), { tx, tz, x: tx * 2 + 1, z: tz * 2 + 1 });
  }
  assert.equal(ROOMS.length, 17); assert.equal(ROOMS.filter((r) => r.deadEnd).length, 3);
  const A = AREAS.wildroot, hallsOnly = floorTiles(A.sections[2].floor);
  assert.deepEqual(new Set(hallsOnly.keys()), new Set(old.keys()), 'section 2 = the 17 rooms of Steps 41-42');
  A.grid.setOpen(A.grid.gates);
  assert.ok(connected(A.grid)); assert.equal(A.grid.tiles.length, DUNGEON_TILES.length);
  const walls = DUNGEON_TILES.flatMap((t) => DIRS.flatMap(([dx, dz]) => A.grid.tileAt(DUNGEON.x + t.x + dx * 2, DUNGEON.z + t.z + dz * 2) ? [] : [{ x: t.x + dx, z: t.z + dz, dx, dz }]));
  assert.deepEqual(DUNGEON_WALLS, walls);
  assert.equal(A.origin.x, DUNGEON.x); assert.equal(A.origin.y, 8);
  assert.equal(A.sections.length, 7); assert.equal(A.gates.length, 6); assert.equal(A.sections.at(-1).gate, null);
  assert.equal(SECTIONS[0].enemies.length, 3); assert.equal(SECTIONS[2].enemies.length, 8);
  assert.equal(inDungeon(DUNGEON.x, DUNGEON.z + 16), true); assert.equal(inDungeon(DUNGEON.x + 100, DUNGEON.z), false);
  assert.equal(areaAt(DUNGEON.x, DUNGEON.z + 16)?.id, 'wildroot'); assert.equal(inAnyArea(0, 0), false);
  assert.equal(dungeonDistanceField({ x: DUNGEON.x, z: DUNGEON.z + 56 }).size, DUNGEON_TILES.length);
  // the inland formula (terrain.js) = the best shape margin
  const hall = ROOMS.find((r) => r.name === 'Root hall');
  assert.equal(areaInland(A, DUNGEON.x + hall.x, DUNGEON.z + hall.z), Math.max(...ROOMS.map((r) => Math.min(r.w / 2 - Math.abs(0 - r.x), r.d / 2 - Math.abs(0 - r.z)))));
  assert.deepEqual(areaSectionStart(A, 0, 1), { x: DUNGEON.x - 2.7 + 1.8, z: DUNGEON.z + 58 });
  assert.equal(ENEMY_KINDS.pumpkin.boss, true);
  assert.deepEqual(buildEnemies(SECTIONS[6], 1, A.origin).filter((e) => e.boss).map((e) => e.kind), ['pumpkin']);
  A.grid.setOpen([]);
});
test('the Rootgate spot is walkable home grass, off every other feature', () => {
  for (const at of [ROOTGATE, ROOTGATE.front]) {
    assert.equal(isWalkable(at.x, at.z), true); assert.equal(getGroundType(at.x, at.z), 'grass'); assert.ok(getHeight(at.x, at.z) > 1); assert.equal(regionOf(at.x, at.z), 'home');
  }
  assert.equal(rootgateReserved(ROOTGATE.x, ROOTGATE.z, 0.5), true); assert.equal(rootgateReserved(ROOTGATE.x + 12, ROOTGATE.z, 0.5), false);
  assert.ok(Math.hypot(ROOTGATE.x - 7, ROOTGATE.z - 9.5) > 20, 'far from the campfire');
  assert.ok(Math.hypot(ROOTGATE.x + 48, ROOTGATE.z - 45) > 40, 'far from the ritual circle');
  assert.equal(AREAS.wildroot.entrance.id, 'rootgate');
});

// ---------------------------------------------------------------------------------------------
// a synthetic four-section area: clear -> collect -> light -> bosses, with gates between (never shipped in the registry)
// ---------------------------------------------------------------------------------------------
const O = TEST_ORIGIN;
const A = registerArea(TEST_AREA);
test.after(() => { delete AREAS['test-yard']; });
const KEYS = ['h:0', 'h:1'];
const at = (x, z) => ({ x: O.x + x, z: O.z + z });
const start = (keys = KEYS) => { const r = new DungeonRun(); r.start(keys, { area: 'test-yard' }); return r; };
const away = () => ({ 'h:0': at(-6, 0), 'h:1': at(-6, 2) });         // nowhere near anything
const kill = (r) => { for (const e of r.enemies) e.hp = 0; };

test('gated area: tiles of closed gates are walls, the whole is connected when open', () => {
  assert.equal(A.gated, true); assert.deepEqual(A.grid.gates, ['yard-gate', 'hall-gate', 'lanterns-gate']);
  assert.ok(connected(A.grid), 'every tile is reachable once every gate is open');
  const g = A.grid; g.setOpen([]);
  const gate = at(10, 0), inHall = at(20, 0), inYard = at(0, 0);
  assert.equal(g.inArea(gate.x, gate.z), false, 'a closed gate is no floor');
  assert.equal(g.inArea(inHall.x, inHall.z), true, 'the hall beyond is floor, just unreachable');
  assert.equal(g.sight(inYard, inHall), false, 'no sight through a closed gate');
  assert.equal(g.waypoint(inYard, inHall), null, 'no route through a closed gate');
  assert.equal(g.field(inHall).has(key(Math.floor((inYard.x - O.x) / 2), Math.floor((inYard.z - O.z) / 2))), false, 'the distance field does not cross it');
  assert.equal(g.inArea(at(7.5, 0).x, at(7.5, 0).z, 0.5), true); assert.equal(g.inArea(at(8.5, 0).x, at(8.5, 0).z, 0.5), false, 'a body keeps clear of the closed gate (a wall)');
  g.setOpen(['yard-gate']);
  assert.equal(g.inArea(gate.x, gate.z), true); assert.equal(g.sight(inYard, inHall), true); assert.ok(g.waypoint(inYard, inHall));
  assert.equal(g.inArea(at(8.5, 0).x, at(8.5, 0).z, 0.5), true);
  assert.equal(g.sight(inYard, at(40, 0)), false, 'the next gate is still shut'); assert.deepEqual(g.open, ['yard-gate']);
  g.setOpen([]); assert.equal(g.inArea(gate.x, gate.z), false);
});
test('the whole-area grid keeps the walls of the all-open shape for the visuals', () => {
  A.grid.setOpen([]);
  assert.ok(A.grid.allTiles.length > A.grid.tiles.length); assert.notDeepEqual(A.grid.allWalls, A.grid.walls);
  A.grid.setOpen(A.gates.map((x) => x.id)); assert.equal(A.grid.tiles.length, A.grid.allTiles.length);
  A.grid.setOpen([]);
});

test('a closed gate holds the guardians back too (no route, no step through)', () => {
  const r = start(); const e = r.enemies[1]; e.x = O.x + 6; e.z = O.z; e.target = 'h:0'; e.aggroUntil = 99;
  const pos = { 'h:0': at(18, 0), 'h:1': at(-6, 0) };       // a friend stands in the hall behind the shut gate
  for (let i = 0; i < 300; i++) { r.update(1 / 30, pos); e.cooldown = 99; }
  assert.ok(e.x < O.x + 8, `the guardian stayed in the yard (x ${e.x - O.x})`);
  r.g.setOpen(['yard-gate']);
  assert.ok(r.g.waypoint(e, pos['h:0']), 'with the gate open there is a way');
  r.g.setOpen([]);
});
test('clear: every guardian down opens the gate, moves on and the next section starts fresh', () => {
  const r = start();
  assert.equal(r.areaId, 'test-yard'); assert.equal(r.section, 0); assert.equal(r.obj.type, 'clear'); assert.equal(r.obj.total, 2);
  const pos = away();
  assert.equal(r.update(0.1, pos), null); assert.equal(r.obj.n, 0);
  r.enemies[0].hp = 0; r.update(0.1, pos); assert.equal(r.obj.n, 1); assert.equal(r.obj.complete, false);
  r.enemies[1].hp = 0;
  assert.equal(r.update(0.1, pos), 'section');
  assert.equal(r.section, 1); assert.equal(r.cleared, false); assert.deepEqual(r.g.open, ['yard-gate']);
  assert.equal(r.g.inArea(at(10, 0).x, at(10, 0).z), true, 'the gate is floor now');
  assert.deepEqual(r.enemies.map((e) => e.kind), ['carrot']); assert.equal(r.obj.type, 'collect');
  assert.ok(r.effects.some((fx) => fx.kind === 'gate' && fx.gate === 'yard-gate'));
  assert.ok(r.drainNotes().some((n) => n.type === 'section' && n.section === 1));
});
test('a wipe after the gate returns to the NEW section and keeps the earlier gate open', () => {
  const r = start(); kill(r); r.update(0.1, away());
  assert.equal(r.section, 1);
  r.members['h:0'].hp = 1; r.members['h:1'].hp = 1; r.enemies[0].hp = 5;
  r.down('h:0'); assert.equal(r.checkWipe(), false, 'one friend is still up'); r.down('h:1');
  assert.equal(r.checkWipe(), true); assert.ok(r.drainNotes().some((n) => n.type === 'wipe'));
  assert.equal(r.section, 1); assert.deepEqual(r.g.open, ['yard-gate']);
  assert.equal(r.enemies[0].hp, r.enemies[0].max, 'the section guardians start over');
  assert.deepEqual(areaSectionStart(r.area, r.section, 1), { x: O.x + 14 + 1.8, z: O.z });
  assert.equal(r.obj.n, 0);
  assert.ok(r.members['h:0'].hp > 1 && !r.members['h:0'].downed);
});
test('collect: pick up by walking over, carry, a downed carrier drops it where they fell, deliver to the altar', () => {
  const r = start(); kill(r); r.update(0.1, away());
  kill(r);                                                      // the section's carrot
  const [p0, p1] = r.obj.pieces, altar = r.obj.altar;
  assert.equal(r.obj.total, 2); assert.equal(p0.holder, null);
  const pos = { 'h:0': { x: p0.x, z: p0.z }, 'h:1': at(14, 4) };
  r.update(0.1, pos); assert.equal(p0.holder, 'h:0'); assert.equal(p1.holder, null);
  // the carrier walks; the piece follows; a second piece is not picked up by the same carrier
  pos['h:0'] = { x: p1.x, z: p1.z }; r.update(0.1, pos);
  assert.equal(p1.holder, null, 'one piece at a time'); assert.deepEqual([p0.x, p0.z], [p1.x, p1.z]);
  // the carrier goes down: the piece drops there and is free again
  const fell = { x: p0.x, z: p0.z };
  r.down('h:0'); r.update(0.1, pos);
  assert.equal(p0.holder, null); assert.deepEqual([p0.x, p0.z], [fell.x, fell.z]);
  // the friend picks it up and delivers
  pos['h:1'] = { x: p0.x, z: p0.z }; r.update(0.1, pos); assert.equal(p0.holder, 'h:1');
  pos['h:1'] = { x: altar.x + 1, z: altar.z }; r.update(0.1, pos);
  assert.equal(p0.delivered, true); assert.equal(r.obj.n, 1); assert.equal(r.obj.complete, false);
  // the downed one gets up, takes the other and delivers: the section is done
  r.getUp('h:0'); pos['h:0'] = { x: p1.x, z: p1.z }; r.update(0.1, pos); assert.equal(p1.holder, 'h:0');
  pos['h:0'] = { x: altar.x, z: altar.z + 1 };
  assert.equal(r.update(0.1, pos), 'section'); assert.equal(r.section, 2); assert.deepEqual(r.g.open, ['yard-gate', 'hall-gate']);
});
test('light: Interact lights a lantern and starts its wave; it counts once the wave is defeated', () => {
  const r = start(); kill(r); r.update(0.1, away()); kill(r);
  for (const p of r.obj.pieces) { p.delivered = true; } r.obj.n = 2; r.update(0.1, away());
  assert.equal(r.section, 2); assert.equal(r.obj.type, 'light'); assert.equal(r.obj.total, 2);
  const b0 = r.obj.braziers[0], b1 = r.obj.braziers[1], pos = { 'h:0': { x: b0.x, z: b0.z + 1 }, 'h:1': { x: b1.x, z: b1.z + 1 } };
  const before = r.enemies.length;
  assert.equal(r.light('h:1', 0, pos), false, 'too far from that lantern');
  assert.equal(r.light('h:0', 0, pos), true); assert.equal(b0.lit, true); assert.equal(r.light('h:0', 0, pos), false, 'only once');
  assert.equal(r.enemies.length, before + 2); assert.deepEqual(r.enemies.filter((e) => e.wave === 0).map((e) => e.kind), ['berry', 'berry']);
  assert.equal(new Set(r.enemies.map((e) => e.id)).size, r.enemies.length, 'wave ids continue, no clashes');
  r.update(0.1, pos); assert.equal(r.obj.n, 0, 'the wave is still alive');
  for (const e of r.enemies.filter((e) => e.wave === 0)) e.hp = 0;
  r.update(0.1, pos); assert.equal(b0.done, true); assert.equal(r.obj.n, 1);
  r.members['h:1'].downed = true; assert.equal(r.light('h:1', 1, pos), false, 'a downed member cannot light');
  r.members['h:1'].downed = false; assert.equal(r.light('h:1', 1, pos), true);
  for (const e of r.enemies.filter((e) => e.wave === 1)) e.hp = 0;
  assert.equal(r.update(0.1, pos), 'section'); assert.equal(r.section, 3);
  // a wipe in the lantern section would have reset the lanterns; here the arena starts fresh
  assert.equal(r.obj.type, 'bosses'); assert.equal(r.obj.total, 1);
});
test('bosses: only the boss has to fall; the last section clears the area (once)', () => {
  const r = start(); r.section = 3; r.g.setOpen(r.openGates()); r.buildSection();
  assert.deepEqual(r.enemies.map((e) => [e.kind, !!e.boss]), [['pumpkin', true], ['berry', false]]);
  const pos = away(); r.update(0.1, pos); assert.equal(r.obj.n, 0);
  r.enemies[1].hp = 0; r.update(0.1, pos); assert.equal(r.obj.n, 0, 'the minion does not count');
  r.enemies[0].hp = 0;
  assert.equal(r.update(0.1, pos), 'cleared'); assert.equal(r.cleared, true); assert.equal(r.section, 3);
  assert.equal(r.update(0.1, pos), null, 'only once');
});
test('Wildroot starts in the bailey with the train objective; its last section clears the area', () => {
  const r = new DungeonRun(); r.start(['h:0']);
  assert.equal(r.areaId, 'wildroot'); assert.equal(r.section, 0); assert.equal(r.obj.type, 'train'); assert.equal(r.obj.total, 4);
  assert.equal(r.from, 'ritual');
  const last = new DungeonRun(); last.start(['h:0'], { section: 6 }); assert.equal(last.obj.type, 'bosses');
  for (const e of last.enemies) e.hp = 0;
  assert.equal(last.update(0.1, { 'h:0': { x: DUNGEON.x, z: DUNGEON.z - 84 } }), 'cleared');
});
test('the ritual stones only reset when the run came from the ritual (the Rootgate leaves them alone)', () => {
  const r = new DungeonRun(); for (const s of [1, 1, 1, 3]) r.strike(s); assert.equal(r.open, true);
  r.start(['h:0'], { area: 'wildroot', from: 'rootgate' }); assert.equal(r.open, true); r.leave(); assert.equal(r.open, true); assert.equal(r.from, 'rootgate');
  r.start(['h:0'], { from: 'ritual' }); assert.equal(r.open, false); r.leave(); assert.equal(r.open, false);
});
test('snapshot / load round-trips the area, section, gates and objective for a late joiner', () => {
  const r = start(); kill(r); r.update(0.1, away());
  const p = r.obj.pieces[0]; p.holder = 'h:0'; p.x += 1; r.obj.since = 3;
  const snap = r.snapshot(), copy = new DungeonRun(); copy.load(JSON.parse(JSON.stringify(snap)));
  assert.equal(copy.areaId, 'test-yard'); assert.equal(copy.section, 1); assert.deepEqual(copy.obj, r.obj); assert.deepEqual(copy.g.open, ['yard-gate']);
  assert.equal(copy.g.inArea(at(10, 0).x, at(10, 0).z), true);
  assert.deepEqual(copy.snapshot(), snap);
  // old snapshots (before Step 56) carry no area: they are Wildroot
  const old = new DungeonRun(); const legacy = { ...new DungeonRun().snapshot() }; delete legacy.areaId; delete legacy.obj; delete legacy.mode; delete legacy.from;
  old.load(legacy); assert.equal(old.areaId, 'wildroot'); assert.equal(old.obj, null);
  // a copy that last showed the gated area snaps back
  copy.load(JSON.parse(JSON.stringify({ ...legacy, active: true }))); assert.equal(copy.areaId, 'wildroot'); assert.equal(copy.g, AREAS.wildroot.grid);
});

// ---------------------------------------------------------------------------------------------
// the objectives engine on its own
// ---------------------------------------------------------------------------------------------
test('stubbed objective types throw a clear not-implemented error; unknown ones too', () => {
  assert.deepEqual(STUBS.sort(), ['escort', 'puzzle', 'survive']); assert.deepEqual(IMPLEMENTED, ['clear', 'collect', 'light', 'bosses', 'train', 'freeze', 'rescue', 'burn', 'defend', 'hunt']);   // (Step 59 implemented freeze and rescue, Step 60 burn, defend and hunt)
  for (const type of STUBS) assert.throws(() => initObjective({ type }, { origin: O, enemies: [] }), /not implemented yet \(Step 61\+\)/);
  assert.throws(() => initObjective({ type: 'dance' }, { origin: O, enemies: [] }), /Unknown objective/);
});
test('hint data: targets per type and the chip text', () => {
  const r = start(); r.update(0.1, away());
  assert.equal(objectiveTargets(r.obj, r.enemies).length, 2);
  assert.equal(objectiveText(r.obj).label, 'Defeat the guardians'); assert.equal(objectiveText(r.obj).count, '0 / 2');
  kill(r); r.update(0.1, away()); kill(r);
  const t = objectiveTargets(r.obj, r.enemies); assert.deepEqual(t.map((x) => x.label), ['Shard', 'Shard']);
  r.obj.pieces[0].holder = 'h:0'; assert.deepEqual(objectiveTargets(r.obj, r.enemies).map((x) => x.label), ['Shard', 'Altar']);
  assert.deepEqual(objectiveTargets({ ...r.obj, complete: true }, r.enemies), []); assert.deepEqual(objectiveTargets(null, []), []);
  assert.ok(COMBAT.objective.hintDelay === 40);
  // progress timestamps (the hint clock)
  const s = initObjective({ type: 'clear' }, { origin: O, time: 7, enemies: [{ hp: 1 }, { hp: 1 }] }); assert.equal(s.since, 7);
  tickObjective(s, { time: 12, enemies: [{ hp: 0 }, { hp: 1 }], members: {}, positions: {} }); assert.equal(s.since, 12);
  tickObjective(s, { time: 30, enemies: [{ hp: 0 }, { hp: 1 }], members: {}, positions: {} }); assert.equal(s.since, 12, 'no progress, the clock keeps its last time');
  assert.equal(lightBrazier(s, {}, 0, 'h:0', { members: {}, positions: {} }), false);
});

// ---------------------------------------------------------------------------------------------
// the combat save and the ritual menu
// ---------------------------------------------------------------------------------------------
test('combat save: bad and old data normalise; a clear merges the area\'s Armory', () => {
  const fresh = normaliseCombat(null);
  assert.deepEqual(fresh, { v: 1, cleared: {}, armory: { weapons: ['sword', 'axe', 'hammer'], charms: [] }, reactions: [], trophies: [] });
  for (const bad of [undefined, 5, 'x', [], { cleared: 3 }, { cleared: { wildroot: 7, nowhere: { wild: true } }, armory: 'no', reactions: 'x' }]) {
    const n = normaliseCombat(bad); assert.equal(n.v, 1); assert.deepEqual(n.cleared, {}); assert.deepEqual(n.armory.weapons, DEFAULT_WEAPONS);
  }
  const n = normaliseCombat({ cleared: { wildroot: { wild: true, thorny: 'yes' } }, armory: { weapons: ['spoon', 'slingshot', 'sword'], charms: ['frost-nova', 5] }, trophies: ['wildroot', 'wildroot'] });
  assert.deepEqual(n.cleared, { wildroot: { wild: true, thorny: false } }); assert.deepEqual(n.armory.weapons, ['sword', 'axe', 'hammer', 'slingshot']); assert.deepEqual(n.armory.charms, ['frost-nova']);
  assert.deepEqual(n.trophies, ['wildroot']);
  const a = markCleared(fresh, 'wildroot', 'wild');
  assert.deepEqual(a.cleared, { wildroot: { wild: true, thorny: false } }); assert.notEqual(a, fresh); assert.deepEqual(fresh.cleared, {});
  const b = markCleared(a, 'test-yard', 'wild');
  assert.deepEqual(b.armory.charms, ['frost-nova']); assert.deepEqual(b.cleared['test-yard'], { wild: true, thorny: false }); assert.equal(b.cleared.wildroot.wild, true);
  const c = markCleared(b, 'wildroot', 'thorny'); assert.deepEqual(c.cleared.wildroot, { wild: true, thorny: true });
  assert.equal(markCleared(a, 'nowhere'), a); assert.equal(markCleared(a, 'wildroot', 'easy'), a);
  assert.deepEqual(mergeArmory({ weapons: ['hammer'] }, { weapons: ['axe', 'slingshot'], charms: ['x'] }), { weapons: ['sword', 'axe', 'hammer', 'slingshot'], charms: ['x'] });
});
test('combat progress: the host records and emits, a replica only mirrors', () => {
  const sent = [], reg = {};
  const host = createCombatProgress({ persist: false, sync: { isReplica: false, register: (k, d) => { reg[k] = d; }, emit: (...a) => sent.push(a) } });
  assert.equal(host.cleared('wildroot'), false); assert.equal(host.markCleared('wildroot', 'wild'), true); assert.equal(host.markCleared('wildroot', 'wild'), false, 'nothing new');
  assert.equal(host.cleared('wildroot'), true); assert.equal(sent.length, 1); assert.equal(sent[0][1], 'state');
  const replicaReg = {}, replica = createCombatProgress({ persist: false, sync: { isReplica: true, register: (k, d) => { replicaReg[k] = d; }, emit() { throw new Error('a replica never emits'); } } });
  assert.equal(replica.markCleared('wildroot', 'wild'), false);
  replicaReg.combat.applySnapshot(reg.combat.snapshot()); assert.equal(replica.cleared('wildroot'), true);
  assert.deepEqual(reg.combat.hashView(), replicaReg.combat.hashView());
  let changes = 0; replica.on('change', () => changes++); replicaReg.combat.applyEvent('state', { state: normaliseCombat(null) }); assert.equal(changes, 1); assert.equal(replica.cleared('wildroot'), false);
});
test('ritual menu rows come from the registry (locked islands included) with a Cleared mark and a Thorny hook', () => {
  const rows = ritualMenuRows({});
  assert.ok(rows.some((r) => r.id === 'wildroot' && r.name === 'Wildroot Hollow' && r.island === 'home' && r.islandName === 'Infinite Island' && !r.cleared));
  assert.ok(rows.some((r) => r.id === 'test-yard' && r.islandName === 'Frostpine Isle'), 'a later area appears automatically, even if its island is still locked');
  const done = ritualMenuRows({ wildroot: { wild: true, thorny: false } }).find((r) => r.id === 'wildroot');
  assert.equal(done.cleared, true); assert.equal(done.thorny, false); assert.match(done.label, /Cleared/);
  assert.deepEqual(ritualMenuRows({}, []).length, 0);
});
test('player memory keeps the area and where it was entered from', () => {
  assert.deepEqual(runMeta('dungeon', { area: 'wildroot', from: 'rootgate' }), { area: 'wildroot', from: 'rootgate' });
  assert.deepEqual(runMeta('dungeon', { area: 'Bad Id!', from: 'elsewhere' }), {}); assert.deepEqual(runMeta('home', { area: 'wildroot' }), {}); assert.deepEqual(runMeta('dungeon', null), {});
});
