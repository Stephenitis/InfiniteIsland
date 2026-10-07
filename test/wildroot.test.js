// Step 57: the Wildroot rework: seven sections (bailey, gardens, halls, three ramparts, throne) through the Step 56 framework, the `train` objective, per-section safe zones,
// the walnut's armor, the cabbage's front shield, the Patchkeeper's second phase and rolling charge, a scripted clear of the whole area and a pacing estimate.
// All pure (DungeonRun + the area data), no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, floorTiles, TILE_SIZE } from '../public/js/game/areaLogic.js';
import { DungeonRun, WEAPONS, ENEMY_KINDS, GUARDIAN_ATTACKS, guardianAttack, buildEnemies, partyScale } from '../public/js/game/dungeonLogic.js';
import { GROUND_ATTACKS, avoidance } from '../public/js/game/combatLogic.js';
import { objectiveText, objectiveTargets, TRAIN_MOVES, trainLeft } from '../public/js/game/objectives.js';
import { COMBAT } from '../public/js/config.js';

const W = AREAS.wildroot, O = W.origin, K1 = 'h:0', K2 = 'h:1', K3 = 'h:2';
const at = (x, z) => ({ x: O.x + x, z: O.z + z });
const tile = (p) => ({ tx: Math.floor((p.x - O.x) / TILE_SIZE), tz: Math.floor((p.z - O.z) / TILE_SIZE) });
const key = (tx, tz) => `${tx},${tz}`;
function flood(grid, from) {
  const live = new Set(grid.tiles.map((t) => key(t.tx, t.tz))), seen = new Set(), queue = [from];
  if (!live.has(key(from.tx, from.tz))) return seen;
  seen.add(key(from.tx, from.tz));
  for (let i = 0; i < queue.length; i++) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const next = { tx: queue[i].tx + dx, tz: queue[i].tz + dz }, k = key(next.tx, next.tz);
    if (live.has(k) && !seen.has(k)) { seen.add(k); queue.push(next); }
  }
  return seen;
}
const start = (section = 0, keys = [K1]) => { const r = new DungeonRun(); r.start(keys, { section }); return r; };
const spot = (section, slot = 0) => at(W.sections[section].start.x + slot * W.sections[section].start.step, W.sections[section].start.z);
const invulnerable = (r) => { for (const m of Object.values(r.members)) m.invulnerable = r.time + 99; };
const lone = (r, e) => { r.enemies = [e]; return e; };
const make = (kind, x, z, extra = {}) => ({ id: 0, kind, x: O.x + x, z: O.z + z, hp: ENEMY_KINDS[kind].hp, max: ENEMY_KINDS[kind].hp, stun: 0, wind: 0, cooldown: 0, target: null, aim: null, ...extra });
/** Swing `weapon` at enemy `e` from `p` (a one-off: wait out the swing, then let the impact land). */
function swing(r, keyId, weapon, e, p, { charged = false, wait = 1.2 } = {}) {
  const pos = { [keyId]: p }; r.members[keyId].ready = 0;
  const hit = r.attack(keyId, weapon, Math.atan2(e.x - p.x, e.z - p.z), pos, charged);
  r.update(wait, pos); return hit;
}

// ---------------------------------------------------------------------------------------------
// layout
// ---------------------------------------------------------------------------------------------
test('seven sections, six gates: every section is reachable only through the previous section\'s gate', () => {
  assert.equal(W.sections.length, 7); assert.deepEqual(W.sections.map((s) => s.id), ['bailey', 'gardens', 'halls', 'rampart-1', 'rampart-2', 'rampart-3', 'throne']);
  assert.deepEqual(W.grid.gates, ['bailey-gate', 'gardens-gate', 'halls-gate', 'rampart-1-gate', 'rampart-2-gate', 'rampart-3-gate']);
  const floors = W.sections.map((s) => new Set(floorTiles(s.floor).keys()));
  for (let k = 0; k < 7; k++) {
    W.grid.setOpen(W.sections.slice(0, k).map((s) => s.gate.id));
    const from = tile(spot(k)), seen = flood(W.grid, from);
    assert.ok(seen.size > 8, `section ${k} start is on floor`);
    for (let j = k + 1; j < 7; j++) for (const t of floors[j]) assert.ok(!seen.has(t), `section ${j} is sealed while gate ${k} is shut (tile ${t})`);
    if (k < 6) { W.grid.setOpen(W.sections.slice(0, k + 1).map((s) => s.gate.id)); assert.ok(flood(W.grid, from).has(key(...Object.values(tile(spot(k + 1))))), `gate ${k} opens the way to section ${k + 1}`); }
  }
  W.grid.setOpen(W.grid.gates);
  assert.equal(flood(W.grid, tile(spot(0))).size, W.grid.allTiles.length, 'every tile is reachable once every gate is open');
  W.grid.setOpen([]);
});
test('gates are tile aligned, the whole area stays in its pocket and the homeward portal is in the bailey', () => {
  for (const s of W.sections) {
    if (s.gate) for (const shape of s.gate.shapes) for (const v of [shape.x - shape.w / 2, shape.z - shape.d / 2, shape.w, shape.d]) assert.equal(Math.abs(v % 2), 0, `${s.id} gate edge ${v}`);
    for (const f of s.floor) if (!f.shape || f.shape === 'rect') for (const v of [f.x - f.w / 2, f.z - f.d / 2, f.w, f.d]) assert.equal(Math.abs(v % 2), 0, `${s.id} floor edge ${v}`);
  }
  const b = W.bounds; assert.ok(b.minX > O.x - 60 && b.maxX < O.x + 60 && b.minZ > O.z - 120 && b.maxZ < O.z + 90, JSON.stringify(b));
  assert.ok(Math.hypot(O.x, O.z) > 1000, 'far from every island');
  assert.ok(W.sections[0].floor.some((f) => Math.abs(W.exit.x - f.x) <= f.w / 2 && Math.abs(W.exit.z - f.z) <= f.d / 2), 'the portal stands in the bailey');
  W.grid.setOpen(W.grid.gates);
  for (const p of [W.exit, ...W.sections.flatMap((s) => s.safe.map((z) => ({ x: z.x, z: z.z })))]) assert.equal(W.grid.inArea(O.x + p.x, O.z + p.z, 0.8), true, JSON.stringify(p));
  for (const s of W.sections) for (const [kind, x, z] of s.enemies) assert.equal(W.grid.inArea(O.x + x, O.z + z, 0.8), true, `${s.id} ${kind} spawns on clear floor`);
  for (const [i, b] of W.sections[1].objective.braziers.entries()) {
    assert.equal(W.grid.inArea(O.x + b.x, O.z + b.z, 0.8), true, `lantern ${i}`);
    for (const [kind, x, z] of b.wave) assert.equal(W.grid.inArea(O.x + x, O.z + z, 0.8), true, `lantern ${i} ${kind}`);
  }
  for (const p of [...W.sections[2].objective.pieces, W.sections[2].objective.altar]) assert.equal(W.grid.inArea(O.x + p.x, O.z + p.z, 0.8), true);
  W.grid.setOpen([]);
});
test('the halls keep the dead ends: three shards, one guarded by the walnut, and a seal altar in the Root hall', () => {
  const halls = W.sections[2], obj = halls.objective;
  assert.equal(obj.type, 'collect'); assert.equal(obj.pieces.length, 3); assert.deepEqual(obj.altar, { x: 0, z: 0 });
  assert.ok(halls.enemies.length >= 8 && halls.enemies.length <= 10, "about 8-10 guardians");
  const walnut = halls.enemies.find(([k]) => k === 'walnut');
  assert.ok(walnut && Math.hypot(walnut[1] - obj.pieces[2].x, walnut[2] - obj.pieces[2].z) < 5, 'the walnut guards the Bloom reliquary shard');
  assert.equal(W.sections[1].objective.type, 'light'); assert.equal(W.sections[1].objective.braziers.length, 3);
  for (const b of W.sections[1].objective.braziers) assert.ok(b.wave.length >= 2 && b.wave.length <= 3);
  assert.equal(W.sections[6].objective.type, 'bosses'); assert.equal(W.sections[6].floor[0].shape, 'circle'); assert.ok(W.sections[6].floor[0].r >= 9 && W.sections[6].floor[0].r <= 10);
  assert.deepEqual([3, 4, 5].map((i) => W.sections[i].objective.type), ['clear', 'clear', 'clear']);
  assert.ok([3, 4, 5].every((i) => W.sections[i].enemies.some(([k]) => k === 'cabbage')), 'a cabbage in every rampart');
});

// ---------------------------------------------------------------------------------------------
// safe zones
// ---------------------------------------------------------------------------------------------
test('every section start is inside its safe zone; the bailey yard is safe throughout and the others are shrines', () => {
  const r = start();
  for (const [i, s] of W.sections.entries()) {
    for (let slot = 0; slot < 4; slot++) { const p = spot(i, slot); assert.equal(r.isSafe(p.x, p.z), true, `${s.id} slot ${slot}`); }
    assert.equal(s.safe.length, 1);
  }
  assert.equal(W.sections[0].safe[0].w, 24); assert.ok(W.sections.slice(1).every((s) => s.safe[0].r >= 3 && s.safe[0].r <= 4));
  assert.equal(r.isSafe(at(0, 20).x, at(0, 20).z), false); assert.equal(r.isSafe(at(0, 54).x, at(0, 54).z), true);
});
test('guardians never enter a shrine, never target someone standing in it and nothing hurts inside', () => {
  const r = start(1, [K1]); const c = at(0, 35.5);
  const e = lone(r, make('berry', 8, 36, { target: K1, aggroUntil: 99 })), pos = { [K1]: at(-6, 33) };
  let closest = Infinity;
  for (let t = 0; t < 12; t += 0.05) { e.cooldown = 99; r.update(0.05, pos); closest = Math.min(closest, Math.hypot(e.x - c.x, e.z - c.z)); }
  assert.ok(closest >= 3.95, `the guardian kept ${closest.toFixed(2)} u from the shrine centre`);
  assert.ok(closest < 8, 'it did chase');
  // someone standing in the shrine is not a target and is not hurt
  const inside = { [K1]: at(0, 35.5) }, f = lone(r, make('berry', 0, 31, { target: K1, aggroUntil: 99 }));
  r.update(0.5, inside); assert.equal(f.wind, 0, 'no wind-up at a player in the shrine');
  r.members[K1].invulnerable = 0; assert.equal(r.damage(K1, 20, 'hop', inside), false); assert.equal(r.members[K1].hp, 100);
  r.members[K1].invulnerable = 0; r.damage(K1, 20, 'hop', { [K1]: at(0, 31) }); assert.equal(r.members[K1].hp, 80, 'one step out of the shrine hurts again');
  // a seed fired at the shrine ends at its edge
  const g = lone(r, make('berry', 0, 29)); g.attackKind = 'seed'; g.aim = at(0, 35.5); r.release(g, {});
  for (let t = 0; t < 2; t += 0.05) r.update(0.05, inside); assert.equal(r.members[K1].hp, 80);
});
test('a wipe returns the party to the CURRENT section\'s start with that section reset (earlier gates stay open)', () => {
  const r = start(3, [K1, K2]); assert.deepEqual(r.g.open.sort(), ['bailey-gate', 'gardens-gate', 'halls-gate']);
  r.enemies[0].hp = 0; const serial = r.serial; r.members[K1].invulnerable = r.members[K2].invulnerable = 0;
  r.down(K1); r.down(K2); assert.equal(r.checkWipe(), true);
  assert.equal(r.section, 3); assert.equal(r.serial, serial + 1); assert.equal(r.enemies[0].hp, r.enemies[0].max); assert.deepEqual(r.g.open.sort(), ['bailey-gate', 'gardens-gate', 'halls-gate']);
  W.grid.setOpen([]);
});

// ---------------------------------------------------------------------------------------------
// the train objective
// ---------------------------------------------------------------------------------------------
test('train: tap, charged, special and a hop each count once, from any member; the chip lists them', () => {
  const r = start(0, [K1, K2]), o = r.obj, dummy = r.enemies.find((e) => e.kind === 'dummy'), wd = r.enemies.find((e) => e.kind === 'wavedummy');
  assert.equal(r.obj.type, 'train'); assert.equal(r.obj.total, 4); assert.deepEqual(r.obj.done, { tap: false, charged: false, special: false, hop: false });
  assert.deepEqual(TRAIN_MOVES, ['tap', 'charged', 'special', 'hop']);
  const stand = { x: dummy.x, z: dummy.z + 1.4 };
  assert.ok(swing(r, K1, 'sword', dummy, stand)); assert.equal(r.obj.done.tap, true); assert.equal(r.obj.n, 1);
  swing(r, K1, 'sword', dummy, stand); assert.equal(r.obj.n, 1, 'a second tap hit counts for nothing more');
  assert.equal(dummy.hp, dummy.max, 'a dummy never loses HP'); assert.ok(r.effects.some((fx) => fx.kind === 'practice' && /^\d+$/.test(fx.text)), 'it shows the hit number');
  swing(r, K2, 'axe', dummy, { x: dummy.x + 1, z: dummy.z + 1.4 }, { charged: true, wait: 1.5 }); assert.equal(r.obj.done.charged, true, 'any member counts');
  assert.ok(Math.abs(r.members[K1].bloom - 2 * COMBAT.bloom.perHit * COMBAT.train.bloomX) < 1e-6, 'dummies feed the Bloom meter fast (x' + COMBAT.train.bloomX + ')');
  r.members[K1].ready = 0; r.members[K1].bloom = 1; r.members[K1].stunUntil = 0;
  assert.ok(r.special(K1, 'sword', Math.atan2(dummy.x - stand.x, dummy.z - stand.z), { [K1]: stand })); assert.equal(r.obj.done.special, true); assert.equal(r.obj.n, 3);
  // the hop: stand in the wave without jumping -> only a hint, no damage, nothing counted
  const near = { x: wd.x, z: wd.z + 3 }, pos = { [K1]: stand, [K2]: near };
  let hinted = false;
  for (let t = 0; t < 5; t += 0.02) { r.update(0.02, pos); hinted ||= r.effects.some((fx) => fx.text === 'Hop!'); }
  assert.equal(r.obj.done.hop, false); assert.equal(r.members[K2].hp, 100); assert.ok(hinted, 'standing in the wave shows the "Hop!" hint');
  assert.equal(r.update(0.02, pos), null);
  // now hop it: the wave dummy fires again; the member dodges as the ring arrives
  let released = -1, result = null;
  for (let t = 0; t < 8 && !result; t += 0.02) {
    const p = r.projectiles.find((a) => a.kind === 'dummywave');
    if (p) { if (released < 0) released = t; if (p.age >= 0.65 && !r.members[K2].dodge) r.dodge(K2, 0, 0, pos); }
    result = r.update(0.02, pos);
  }
  assert.equal(o.done.hop, true, 'a hop over the wave counts'); assert.equal(result, 'section', 'all four done: the gate opens and the party moves on');
  assert.equal(r.section, 1); assert.deepEqual(r.g.open, ['bailey-gate']);
  W.grid.setOpen([]);
});
test('train: after the grace period the gate opens anyway; a wipe starts the timer and the moves over', () => {
  const r = start(0, [K1]); const pos = { [K1]: spot(0) };
  assert.equal(Math.round(trainLeft(r.obj, r.time)), COMBAT.train.seconds); assert.equal(COMBAT.train.seconds, 30);
  assert.equal(r.update(29.5, pos), null); assert.match(objectiveText(r.obj, r.time).label, /^Ready in 1 s/);
  assert.equal(r.update(0.6, pos), 'section'); assert.equal(r.section, 1);
  const q = start(0, [K1]); q.obj.done.tap = true; q.obj.n = 1; q.update(20, pos); q.wipe();
  assert.equal(q.obj.n, 0); assert.equal(q.obj.done.tap, false); assert.equal(q.obj.t0, q.time); assert.equal(q.update(25, pos), null, 'the timer restarted at the wipe');
  assert.equal(q.update(6, pos), 'section');
  const t = objectiveText(start(0).obj, 0); assert.equal(t.items.length, 4); assert.deepEqual(t.items.map((i) => i.done), [false, false, false, false]); assert.equal(t.count, '0 / 4');
  assert.deepEqual(objectiveTargets(start(0).obj, start(0).enemies), []);
  W.grid.setOpen([]);
});
test('the wave dummy sends a harmless slow ring every few seconds, only while someone is near', () => {
  const r = start(0, [K1]), wd = r.enemies.find((e) => e.kind === 'wavedummy'), spec = GUARDIAN_ATTACKS.dummywave;
  r.update(0.1, { [K1]: at(0, 200) }); assert.equal(wd.wind, 0, 'nobody near: no wave');
  const pos = { [K1]: at(wd.x - O.x, wd.z - O.z + 3) }; r.update(0.1, pos); assert.ok(wd.wind > 0);
  assert.equal(avoidance(r.members[K1], 'dummywave', 0), null);
  let waves = 0, seen = new Set();
  for (let t = 0; t < 7; t += 0.02) { r.update(0.02, pos); for (const a of r.projectiles) if (!seen.has(a.id) && a.kind === 'dummywave') { seen.add(a.id); waves++; } }
  assert.ok(waves >= 2 && waves <= 3, `a wave every ~${spec.wind + spec.recovery} s (${waves} in 7 s)`); assert.equal(r.members[K1].hp, 100);
  W.grid.setOpen([]);
});

// ---------------------------------------------------------------------------------------------
// the new guardians
// ---------------------------------------------------------------------------------------------
test('walnut: armor takes x0.35 from plain hits (no stun-lock, the wind-up survives); an axe chop, a hammer pound or the shockwave cracks it and stuns 1.5 s', () => {
  const stand = (w) => ({ x: w.x, z: w.z + 1.5 });
  const fresh = () => { const r = start(2, [K1]); invulnerable(r); const w = lone(r, make('walnut', 0, 0)); return { r, w }; };
  assert.equal(ENEMY_KINDS.walnut.hp, 160); assert.equal(ENEMY_KINDS.walnut.armor, 0.35);
  let { r, w } = fresh(); w.wind = 0.5; w.attackKind = 'tackle';
  swing(r, K1, 'sword', w, stand(w), { wait: 0.19 });
  assert.equal(w.hp, 160 - Math.round(14 * 0.35)); assert.equal(w.cracked, undefined); assert.ok(w.wind > 0 || w.action, 'a plain hit does not interrupt the wind-up'); assert.ok(w.stun <= COMBAT.armor.softStun);
  assert.ok(r.effects.some((fx) => fx.kind === 'armor' && fx.type === 'clink'));
  for (const [weapon, charged, why] of [['axe', false, 'axe tap'], ['hammer', false, 'hammer tap'], ['sword', true, 'sword spin']]) {
    ({ r, w } = fresh()); swing(r, K1, weapon, w, stand(w), { charged, wait: 1.5 }); assert.ok(!w.cracked, `${why} does not crack it`);
  }
  ({ r, w } = fresh()); swing(r, K1, 'axe', w, stand(w), { charged: true, wait: 0.51 });
  assert.equal(w.cracked, true, 'the axe\'s charged chop breaks the shell'); assert.equal(w.hp, 160 - 58, 'the cracking blow does full damage'); assert.ok(w.stun > 0.9 && w.stun <= COMBAT.armor.crackStun);
  assert.ok(r.effects.some((fx) => fx.kind === 'armor' && fx.type === 'crack') && r.effects.some((fx) => fx.text === 'Cracked!'));
  const before = w.hp; w.stun = 0; swing(r, K1, 'sword', w, stand(w), { wait: 0.19 }); assert.equal(w.hp, before - 14, 'once cracked, plain hits do full damage');
  ({ r, w } = fresh()); swing(r, K1, 'hammer', w, stand(w), { charged: true, wait: 1.5 }); assert.equal(w.cracked, true, 'the hammer\'s ground pound');
  ({ r, w } = fresh()); r.members[K1].bloom = 1; r.members[K1].ready = 0; r.special(K1, 'hammer', 0, { [K1]: stand(w) }); assert.equal(w.cracked, true, 'the hammer\'s shockwave'); assert.ok(w.airborne > r.time, 'and it launches');
  ({ r, w } = fresh()); r.members[K1].bloom = 1; r.members[K1].ready = 0; r.special(K1, 'axe', Math.PI, { [K1]: { x: w.x, z: w.z + 4 } });
  for (let t = 0; t < 2; t += 0.02) r.update(0.02, { [K1]: { x: w.x, z: w.z + 4 } });
  assert.ok(!w.cracked && w.hp < 160, 'the boomerang hurts (slowly) but cannot crack it');
  // any weapon still wins, just slowly: a sword alone fells it
  ({ r, w } = fresh()); let swings = 0; while (w.hp > 0 && swings < 120) { swing(r, K1, 'sword', w, stand(w), { wait: 0.45 }); swings++; w.stun = 0; }
  assert.equal(w.hp, 0, 'the sword alone wins'); assert.ok(swings > 20, `slowly (${swings} sword swings)`);
  // the slow roll-tackle is a ground attack: a hop clears it
  assert.ok(GROUND_ATTACKS.has('tackle'));
});
test('cabbage: front hits are blocked (x COMBAT.shield.mult); a flank, a dash-stab, the boomerang\'s return, a launch, a stun or a friend all get through', () => {
  const fresh = (n = 1) => { const r = start(3, [K1, K2, K3].slice(0, n)); invulnerable(r); const c = lone(r, make('cabbage', 0, -38, { facing: 0 })); return { r, c }; };   // faces +z (towards the party)
  const front = (c) => ({ x: c.x, z: c.z + 1.5 }), behind = (c) => ({ x: c.x, z: c.z - 1.5 });
  assert.equal(ENEMY_KINDS.cabbage.hp, 70); assert.equal(COMBAT.shield.arc, 50); assert.equal(COMBAT.shield.mult, 0.25);
  let { r, c } = fresh(); swing(r, K1, 'sword', c, front(c), { wait: 0.19 });
  assert.equal(c.hp, 70 - Math.round(14 * COMBAT.shield.mult)); assert.equal(c.stun, 0, 'a blocked hit does not stun'); assert.ok(r.effects.some((fx) => fx.text === 'Blocked!'));
  assert.equal(r.members[K1].bloom, 0, 'and gives no Bloom');
  ({ r, c } = fresh()); swing(r, K1, 'sword', c, { x: c.x + 1.4, z: c.z + 1.4 * Math.tan(0.8) * 0 + 0.5 }, { wait: 0.19 });   // ~70 degrees off its facing: outside the 50 degree arc
  assert.equal(c.hp, 70 - 14, 'a hit from the side is not blocked');
  ({ r, c } = fresh()); swing(r, K1, 'sword', c, behind(c), { wait: 0.19 }); assert.equal(c.hp, 70 - 14, 'a flank hit does full damage'); assert.ok(c.stun > 0);
  ({ r, c } = fresh()); c.stun = 0.5; swing(r, K1, 'sword', c, front(c), { wait: 0.19 }); assert.equal(c.hp, 70 - 14, 'a stunned guard has dropped its shield');
  ({ r, c } = fresh()); c.airborne = r.time + 1; swing(r, K1, 'sword', c, front(c), { wait: 0.19 }); assert.ok(c.hp < 70 - 14, 'a launched guard neither blocks (and takes the airborne bonus)');
  ({ r, c } = fresh()); r.members[K1].bloom = 1; r.special(K1, 'sword', Math.PI, { [K1]: front(c) }); assert.equal(c.hp, 70 - WEAPONS.sword.special.damage, 'the dash-stab goes through the shield');
  ({ r, c } = fresh()); r.members[K1].bloom = 1; r.special(K1, 'hammer', Math.PI, { [K1]: front(c) }); assert.equal(c.hp, Math.max(0, 70 - WEAPONS.hammer.special.damage), 'the shockwave (a launch) ignores it');
  ({ r, c } = fresh()); r.members[K1].bloom = 1; const p = { x: c.x, z: c.z + 3 };           // the boomerang: blocked on the way out, full damage on the way back
  r.special(K1, 'axe', Math.PI, { [K1]: p }); c.cooldown = 99; let log = [];
  for (let t = 0; t < 2.4; t += 0.02) { const hp = c.hp; r.update(0.02, { [K1]: p }); if (c.hp !== hp) log.push(hp - c.hp); }
  assert.deepEqual(log, [Math.round(WEAPONS.axe.special.damage * COMBAT.shield.mult), WEAPONS.axe.special.damage], `outbound blocked, return trip full (${log})`);
  // a friend draws its attention: it turns to the near one and the far one hits it from behind
  ({ r, c } = fresh(2)); const near = { x: c.x, z: c.z + 2 }, far = { x: c.x, z: c.z - 3 }, pos = { [K1]: near, [K2]: far }; c.facing = Math.PI;       // (it was facing the other way)
  for (let t = 0; t < 3; t += 0.05) { c.cooldown = 99; r.update(0.05, pos); }   // (half a turn at COMBAT.shield.turn)
  assert.ok(Math.abs(Math.atan2(Math.sin(c.facing), Math.cos(c.facing))) < 0.3, 'it faced the near friend');
  pos[K2] = { x: c.x, z: c.z - 2.2 };       // (it walked towards the near friend meanwhile: the far one follows it round)
  r.members[K2].ready = 0; r.attack(K2, 'sword', 0, pos); const hp = c.hp; r.update(0.19, pos); assert.equal(hp - c.hp, 14, 'the friend behind it hits at full damage');
  // it cannot swing its shield round instantly: circling it gets past
  ({ r, c } = fresh()); const turned = [];
  for (let t = 0; t < 0.4; t += 0.05) { c.cooldown = 99; r.update(0.05, { [K1]: behind(c) }); turned.push(c.facing); }
  assert.ok(Math.abs(turned[0]) < COMBAT.shield.turn * 0.06 + 1e-9, 'a limited turn rate');
  assert.ok(GROUND_ATTACKS.has('slap') && GUARDIAN_ATTACKS.slap.arc === 0.5);
  // it never snaps round: a player right behind it is not slapped (it keeps turning), and a slap keeps the facing it had
  ({ r, c } = fresh()); const back = behind(c); r.update(0.05, { [K1]: back });
  assert.equal(c.wind || 0, 0, 'no slap at a player behind it'); assert.ok(Math.abs(c.facing) < 0.1, 'still mid-turn');
  ({ r, c } = fresh()); c.facing = 0.4; r.update(0.05, { [K1]: front(c) });
  assert.ok(c.wind > 0, 'it slaps what is in front'); assert.ok(Math.abs(c.facing - 0.4) < COMBAT.shield.turn * 0.05 + 1e-9, 'without snapping to face it');
});
test('the radish\'s ring is a ground wave a dodge-hop clears; the cabbage\'s slap only reaches its front arc', () => {
  const r = start(1, [K1]); const e = lone(r, make('radish', -2, 26)); e.attackKind = 'ring'; e.aim = at(-2, 29);
  const grounded = { [K1]: at(-2, 29) }; r.release(e, grounded);
  for (let t = 0; t < 1.2; t += 0.02) r.update(0.02, grounded); assert.equal(r.members[K1].hp, 100 - ENEMY_KINDS.radish.damage, 'standing in it hurts');
  const r2 = start(1, [K1]); const e2 = lone(r2, make('radish', -2, 26)); e2.attackKind = 'ring'; e2.aim = at(-2, 29); r2.release(e2, grounded);
  let dodged = false;
  for (let t = 0; t < 1.2; t += 0.02) { const a = r2.projectiles[0]; if (!dodged && a && a.radius > 2.2) { r2.dodge(K1, 0, 0, grounded); dodged = true; } r2.update(0.02, grounded); }
  assert.ok(dodged); assert.equal(r2.members[K1].hp, 100, 'hopping over the ring takes nothing');
  const r3 = start(3, [K1]), c = lone(r3, make('cabbage', 0, -36, { facing: 0 })); c.attackKind = 'slap'; c.aim = at(0, -34); r3.release(c, { [K1]: at(0, -34.5) });
  assert.equal(r3.members[K1].hp, 100 - ENEMY_KINDS.cabbage.damage);
  const r4 = start(3, [K1]), d = lone(r4, make('cabbage', 0, -36, { facing: 0 })); d.attackKind = 'slap'; d.aim = at(0, -34); r4.release(d, { [K1]: at(0, -37.5) });
  assert.equal(r4.members[K1].hp, 100, 'behind it is safe');
  W.grid.setOpen([]);
});
test('Patchkeeper: at half HP it roars once, summons vine adds scaled for the party and starts rolling every other attack', () => {
  const adds = (n) => { const r = start(6, [K1, K2, K3, 'h:3'].slice(0, n)); const boss = r.enemies[0]; boss.hp = Math.floor(boss.max * 0.52); r.hitEnemy(K1, boss, boss.max * 0.05, 0.2, at(0, -90)); return { r, boss }; };
  let { r, boss } = adds(1);
  assert.equal(boss.phase2, true); assert.ok(boss.stun >= COMBAT.phase2.stun - 1e-9); assert.equal(r.enemies.length, 3, 'two sprouts rise'); assert.ok(r.enemies.slice(1).every((e) => e.kind === 'sprout' && e.wave === 'phase2' && !e.boss));
  assert.ok(r.effects.some((fx) => fx.kind === 'phase')); assert.ok(r.drainNotes().some((n) => n.type === 'phase'));
  r.hitEnemy(K1, boss, 5, 0.2, at(0, -90)); assert.equal(r.enemies.length, 3, 'the adds come once');
  assert.deepEqual([1, 2, 3, 4].map((n) => adds(n).r.enemies.length - 1), [2, 3, 4, 5], 'party-scaled adds (the extra hook)');
  assert.deepEqual([1, 2, 3, 4].map((n) => adds(n).r.enemies[1].max), [1, 2, 3, 4].map((n) => Math.round(ENEMY_KINDS.sprout.hp * partyScale(n))));
  // above half it does not
  const calm = start(6, [K1]); const b = calm.enemies[0]; b.hp = Math.floor(b.max * 0.6); calm.hitEnemy(K1, b, 4, 0.2, at(0, -90)); assert.ok(!b.phase2); assert.equal(calm.enemies.length, 1);
  // the attack pattern: wave, then roll, then wave...
  boss.phase2 = true; assert.deepEqual([0, 1, 2, 3].map((n) => { boss.attacks = n; return guardianAttack('pumpkin', 3, boss); }), ['wave', 'roll', 'wave', 'roll']);
  W.grid.setOpen([]);
});
test('the rolling charge is a ground attack across the arena: a hop clears it and it bounces off the wall exactly once', () => {
  assert.ok(GROUND_ATTACKS.has('roll')); assert.ok(GUARDIAN_ATTACKS.roll.speed * GUARDIAN_ATTACKS.roll.life > 20);
  const roll = (hop) => {
    const r = start(6, [K1]); invulnerable(r); r.members[K1].invulnerable = 0;
    const boss = lone(r, make('pumpkin', -5, -92, { phase2: true, attacks: 1 })); boss.attackKind = 'roll'; boss.target = K1; boss.aim = at(5, -92);
    const me = at(3, -92), pos = { [K1]: me }; r.release(boss, pos);
    const xs = []; let bounces = 0, dodged = false;
    for (let t = 0; t < 3; t += 0.02) {
      const a = r.projectiles.find((p) => p.kind === 'roll');
      if (hop && !dodged && a && Math.hypot(a.x - me.x, a.z - me.z) < 2.6) { r.dodge(K1, 0, 0, pos); dodged = true; }
      r.update(0.02, pos); bounces = Math.max(bounces, a?.bounces || 0); xs.push(boss.x - O.x);
      assert.ok(r.g.inArea(boss.x, boss.z, 0.7), `inside the arena at ${t.toFixed(2)}`);
    }
    return { r, boss, xs, bounces, dodged, bounceFx: r.effects.filter((fx) => fx.kind === 'roll' && fx.type === 'bounce').length };
  };
  const hit = roll(false), hopped = roll(true);
  assert.equal(hit.r.members[K1].hp, 100 - ENEMY_KINDS.pumpkin.damage, 'standing in the roll hurts'); assert.equal(hopped.dodged, true); assert.equal(hopped.r.members[K1].hp, 100, 'a dodge-hop over it takes nothing');
  assert.equal(hit.bounces, 1); const peak = Math.max(...hit.xs); assert.ok(peak > 8 && peak < 10.1, `it reached the east wall (x ${peak.toFixed(2)})`);
  assert.ok(hit.xs.at(-1) < peak - 3, 'and came back off it'); assert.equal(hit.boss.attacks, 2);
  // aimed into the shrine at the arena's mouth it simply stops at the edge
  const r = start(6, [K1]); const boss = lone(r, make('pumpkin', 0, -92, { phase2: true, attacks: 1 })); boss.attackKind = 'roll'; boss.aim = at(0, -84); r.release(boss, { [K1]: at(0, -84) });
  for (let t = 0; t < 2; t += 0.02) r.update(0.02, { [K1]: at(0, -84) });
  assert.ok(boss.z - O.z < -86 && r.members[K1].hp === 100);
  W.grid.setOpen([]);
});

// ---------------------------------------------------------------------------------------------
// a scripted run of the whole area, section by section
// ---------------------------------------------------------------------------------------------
/** Defeat `e` with an axe (charged chops: they crack a walnut, and from behind get past a cabbage's shield). */
function defeat(r, keyId, e, log) {
  for (let guard = 0; guard < 600 && e.hp > 0; guard++) {
    const f = Number.isFinite(e.facing) ? e.facing : 0, p = { x: e.x - Math.sin(f) * 1.5, z: e.z - Math.cos(f) * 1.5 };       // (behind it)
    const pos = { ...Object.fromEntries(Object.keys(r.members).map((k) => [k, r.members[k].home || p])), [keyId]: p };
    invulnerable(r); r.members[keyId].ready = Math.min(r.members[keyId].ready, r.time);
    r.attack(keyId, 'axe', Math.atan2(e.x - p.x, e.z - p.z), pos, true); r.update(0.55, pos); r.update(0.55, pos);
    log.swings++;
  }
  assert.ok(e.hp <= 0, `${e.kind} defeated`);
}
function clearArea(keys) {
  const r = start(0, keys), K = keys[0], log = { swings: 0, sections: [] }, rest = Object.fromEntries(keys.map((k, i) => [k, spot(0, i)]));
  const step = (pos, dt = 0.1) => { const out = r.update(dt, pos); if (out) log.sections.push([r.section, out]); return out; };
  const home = () => { for (const k of keys) r.members[k].home = null; };
  home();
  // 0 bailey: the grace period opens it
  step(rest, 30.5); assert.equal(r.section, 1);
  // 1 gardens: light each lantern, defeat its wave
  const lanterns = r.sectionDef.objective.braziers;
  for (const [i, b] of lanterns.entries()) {
    const near = at(b.x, b.z + 1); invulnerable(r);
    assert.equal(r.light(K, i, { [K]: near }), true, `lantern ${i}`);
    if (i < 2) assert.equal(r.light(K, i + 1, { [K]: at(lanterns[i + 1].x, lanterns[i + 1].z + 1) }), false, 'one wave at a time');
    for (const e of r.enemies.filter((e) => e.wave === i)) defeat(r, K, e, log);
    step({ [K]: near }, 0.1);
  }
  assert.equal(r.section, 2, 'the third wave opened the halls');
  // 2 halls: the walnut first (the axe's charged chop cracks it), then carry each shard to the altar
  for (const e of r.enemies.filter((e) => e.kind === 'walnut')) defeat(r, K, e, log);
  for (const p of r.obj.pieces) {
    invulnerable(r); step({ [K]: { x: p.x, z: p.z } }); assert.equal(p.holder, K); step({ [K]: { x: r.obj.altar.x, z: r.obj.altar.z + 1 } });
  }
  assert.equal(r.section, 3, 'three shards open the ramparts');
  for (let rampart = 3; rampart <= 5; rampart++) {
    assert.equal(r.section, rampart);
    for (const e of [...r.enemies]) defeat(r, K, e, log);
    step({ [K]: spot(rampart) }, 0.1);
  }
  assert.equal(r.section, 6);
  const boss = r.enemies.find((e) => e.boss); let phase2 = false, result = null;
  for (let guard = 0; guard < 400 && !result; guard++) {
    const f = Number.isFinite(boss.facing) ? boss.facing : 0, p = { x: boss.x - Math.sin(f) * 2.4, z: boss.z - Math.cos(f) * 2.4 };
    invulnerable(r); r.members[K].ready = r.time; r.attack(K, 'hammer', Math.atan2(boss.x - p.x, boss.z - p.z), { [K]: p }, true);
    result = step({ [K]: p }, 0.7); phase2 ||= !!boss.phase2; log.swings++;
  }
  return { r, log, phase2, result };
}
test('the whole area can be cleared section by section and ends in cleared (1 and 3 players)', () => {
  for (const keys of [[K1], [K1, K2, K3]]) {
    const { r, log, phase2, result } = clearArea(keys);
    assert.equal(result, 'cleared'); assert.equal(r.cleared, true); assert.ok(phase2, 'the boss went through its second phase');
    assert.equal(r.update(0.1, {}), null, 'cleared only once');
    assert.deepEqual(r.g.open.length, 6, 'every gate ended up open');
    W.grid.setOpen([]);
  }
});
test('a snapshot taken mid-run round-trips: section, gates, objective state and the boss phase', () => {
  const r = start(6, [K1, K2]); const boss = r.enemies[0]; boss.hp = Math.floor(boss.max * 0.5); r.hitEnemy(K1, boss, 1, 0.1, at(0, -90)); r.update(0.1, { [K1]: spot(6), [K2]: spot(6, 1) });
  const snap = JSON.parse(JSON.stringify(r.snapshot())), copy = new DungeonRun(); copy.load(snap);
  assert.equal(copy.areaId, 'wildroot'); assert.equal(copy.section, 6); assert.equal(copy.g.open.length, 6); assert.equal(copy.enemies[0].phase2, true); assert.equal(copy.enemies.length, r.enemies.length);
  assert.deepEqual(copy.snapshot(), snap);
  const g = start(0, [K1]); g.obj.done.charged = true; g.obj.n = 1; g.update(7, { [K1]: spot(0) });
  const c2 = new DungeonRun(); c2.load(JSON.parse(JSON.stringify(g.snapshot()))); assert.deepEqual(c2.obj, g.obj); assert.equal(c2.obj.done.charged, true);
  W.grid.setOpen([]);
});

// ---------------------------------------------------------------------------------------------
// pacing: the rough estimate quoted in PLAN.md (first-time party of one or two)
// ---------------------------------------------------------------------------------------------
/**
 * Seconds per section for a first-time party: walking at `RUN` u/s x `eff` (they wander, read, dodge), enemies at `dps` effective damage per second (a new player's misses,
 * dodges and enemy stuns included) with the armor / shield multipliers a sword user suffers unless they find the axe / hammer, plus the objective's own timers.
 */
export function pacing({ run = 7, eff = 0.7, dps = 20, players = 1 } = {}) {
  const walk = (u) => u / (run * eff), scale = partyScale(players), team = 1 + 0.8 * (players - 1);              // (a second player adds ~80 % damage output)
  const hp = (list) => list.reduce((sum, [k]) => sum + (ENEMY_KINDS[k].practice ? 0 : ENEMY_KINDS[k].hp * (k === 'walnut' ? 1 / 0.5 : 1) * (k === 'cabbage' ? 1.35 : 1)), 0) * scale;
  const fight = (list, overhead = 1.5) => hp(list) / (dps * team) * overhead;
  const S = W.sections, lanterns = S[1].objective.braziers;
  const sections = {
    bailey: COMBAT.train.seconds + walk(24),
    gardens: walk(60) + lanterns.reduce((t, b) => t + fight(b.wave) + 5, 0),
    halls: walk(276) / (players > 1 ? 1.6 : 1) + fight(S[2].enemies) + 25,
    ramparts: [3, 4, 5].reduce((t, i) => t + fight(S[i].enemies) + walk(18) + 4, 0),
    throne: walk(14) + (ENEMY_KINDS.pumpkin.hp * scale + 2 * ENEMY_KINDS.sprout.hp * scale) / (dps * team) * 1.8 + 12,
  };
  return { sections, total: Object.values(sections).reduce((a, b) => a + b, 0) };
}
test('pacing estimate: a first-time party of one or two clears Wildroot in roughly five minutes', () => {
  for (const players of [1, 2]) {
    const { sections, total } = pacing({ players });
    assert.ok(total >= 270 && total <= 360, `${players} player(s): ${(total / 60).toFixed(1)} min ${JSON.stringify(Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, Math.round(v)])))}`);
    for (const [name, s] of Object.entries(sections)) assert.ok(s > 20 && s < 140, `${name} ${Math.round(s)} s`);
  }
});
test('at most four guardians are ever awake together in a section\'s opening (Wild mode)', () => {
  for (const [i, s] of W.sections.entries()) if (i > 0 && s.enemies.length) assert.ok(buildEnemies(s, 1, O).filter((e) => !ENEMY_KINDS[e.kind].practice).length <= (i === 2 ? 10 : 4) , s.id);
  for (const b of W.sections[1].objective.braziers) assert.ok(buildEnemies(W.sections[1], 1, O, { spawns: b.wave }).length <= 3);
  const halls = W.sections[2].enemies.map(([, x, z]) => ({ x, z }));            // the halls are spread out: no more than four within a 14 u circle of any guardian
  for (const a of halls) assert.ok(halls.filter((b) => Math.hypot(a.x - b.x, a.z - b.z) < 14).length <= 4);
});
