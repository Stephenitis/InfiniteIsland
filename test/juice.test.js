// Step 67: feedback tiers, same-frame freeze admission, bounded pools and unchanged authoritative state/ids.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { impactTier } from '../public/js/game/combatLogic.js';
import { DungeonRun, DUNGEON } from '../public/js/game/dungeonLogic.js';
import { freezeWindow, warningGroup, warningProgress, cleanJuiceSettings, admitVoice, distanceGain } from '../public/js/game/juiceLogic.js';
import { createShockwave } from '../public/js/world/shockwave.js';
import { Player } from '../public/js/player/player.js';
import { JUICE } from '../public/js/config.js';
import { createCombatFeel } from '../public/js/world/combatFeel.js';
import { createGuardianModel } from '../public/js/world/dungeonVisuals.js';
import { makeCombatWarning, updateCombatWarning, removeCombatWarning } from '../public/js/world/combatWarnings.js';
const A = 'host:0', at = (x = 0, z = 0) => ({ x: DUNGEON.x + x, z: DUNGEON.z + z });
function run() { const r = new DungeonRun(); r.start([A], { section: 2 }); return r; }

test('impact tiers distinguish taps, finishers, small specials, boomerangs, cracks, launches and finishes', () => {
  assert.equal(impactTier('tap'), 1); assert.equal(impactTier('special', [], 'boomerang'), 1);
  for (const [move, flags] of [['charged', []], ['tap', ['finisher']], ['tap', ['air']], ['special', []]]) assert.equal(impactTier(move, flags), 2);
  for (const flag of ['big', 'shatter', 'crack', 'launch', 'plunge']) assert.equal(impactTier('tap', [flag]), 3);
  assert.equal(impactTier('tap', ['shatter', 'finish']), 4);
});
test('freeze admission keeps the longest same-frame hit and throttles a pebble barrage without extending the lock', () => {
  const first = freezeWindow(1, undefined, 0, 0.035); assert.equal(first.until, 1.035);
  const heavy = freezeWindow(1, first.at, first.until, 0.1); assert.equal(heavy.until, 1.1);
  assert.deepEqual(freezeWindow(1.05, heavy.at, heavy.until, 0.1), heavy);
  assert.equal(freezeWindow(1.13, heavy.at, heavy.until, 0.07).until, 1.2);
});
test('warnings retain the correct response groups and countdown bounds', () => {
  for (const k of ['stomp', 'ring', 'roll', 'quake', 'dummywave']) assert.equal(warningGroup(k), 'hop');
  for (const k of ['charge', 'seed', 'dive', 'lash']) assert.equal(warningGroup(k), 'dodge');
  for (const k of ['icicle', 'blob', 'burn', 'frostcone']) assert.equal(warningGroup(k), 'out');
  assert.equal(warningProgress(1, 1), 0); assert.equal(warningProgress(0.5, 1), 0.5); assert.equal(warningProgress(-1, 1), 1);
});
test('comfort settings recover corrupt saves, keep default numbers on and bound distance volume', () => {
  assert.deepEqual(cleanJuiceSettings(null), cleanJuiceSettings()); assert.equal(cleanJuiceSettings().numbers, true);
  assert.equal(cleanJuiceSettings({ shake: 'bad', flashes: 'bad' }).shake, 'full');
  assert.equal(cleanJuiceSettings({ shake: 'off', numbers: false }).numbers, false);
  assert.equal(distanceGain(0), 1); assert.equal(distanceGain(30), 0); assert.equal(distanceGain(40), 0);
});
test('voice admission throttles repeats, replaces the oldest voice and discards expired voices', () => {
  let voices = [];
  for (let i = 0; i < 4; i++) { const a = admitVoice(voices, 'hit-sword', i * 0.03, 1); assert.equal(a.accepted, true); voices = [...a.live, a.voice]; }
  assert.equal(admitVoice(voices, 'hit-sword', 0.095, 1).accepted, false);
  const fifth = admitVoice(voices, 'hit-sword', 0.13, 1); assert.equal(fifth.cut, voices[0]); assert.equal(fifth.live.length, 3);
  assert.equal(admitVoice(voices, 'hit-sword', 2, 1).live.length, 0);
});
test('every host hit emits one directional strike; dummy hits and blocked hits also have feedback', () => {
  const r = run(), e = r.enemies.find((q) => q.kind === 'berry') || r.enemies[0]; const from = at();
  r.hitEnemy(A, e, 12, 0.2, from, 0, { weapon: 'axe', move: 'charged' });
  const fx = r.effects.filter((q) => q.kind === 'strike'); assert.equal(fx.length, 1); assert.equal(fx[0].weapon, 'axe'); assert.equal(fx[0].by, A); assert.deepEqual(fx[0].fx, from); assert.equal(fx[0].target, e.id);
  const dummy = { id: 901, kind: 'dummy', ...at(1, 0), hp: 1, max: 1 }; r.enemies.push(dummy); r.hitEnemy(A, dummy, 20, 0, from, 0, { move: 'tap' });
  assert.equal(r.effects.filter((q) => q.kind === 'strike').length, 2); assert.equal(dummy.hp, 1);
});
test('effects preserve nextFX, projectile ids, combat timers, damage and objectives over a seeded combat script', () => {
  const a = run(), b = run(); b.recordStrike = () => {};
  const pos = { [A]: at(0, 1) };
  for (let i = 0; i < 80; i++) {
    for (const r of [a, b]) {
      const e = r.enemies.find((q) => q.hp > 0);
      if (e && i % 7 === 0) r.hitEnemy(A, e, 6, 0.1, pos[A], 0.2, { weapon: 'hammer', move: 'charged' });
      if (i % 9 === 0) r.firePebble(A, pos[A], 0, { range: 7, damage: 5, stun: 0.1, move: 'tap' });
      r.update(0.05, pos);
    }
    const strip = (r) => { const s = r.snapshot(); s.effects = s.effects.filter((q) => q.kind !== 'strike'); return s; };
    assert.deepEqual(strip(a), strip(b));
  }
});
test('pose freeze preserves rendered parts while movement and swing/hurt clocks advance', () => {
  const p = Object.create(Player.prototype); p.parts = { rig: new THREE.Group() }; p._swingT = 0; p._hurtT = 0;
  p._animate = (dt) => { p._swingT += dt; p._hurtT += dt; p.parts.rig.rotation.x += dt; };
  p.freezePose(0.07); p._animatePose(0.04, false); assert.ok(Math.abs(p.parts.rig.rotation.x) < 1e-9); assert.equal(p._swingT, 0.04); assert.equal(p._hurtT, 0.04);
  p._animatePose(0.04, false); p._animatePose(0.04, false); assert.equal(p.parts.rig.rotation.x, 0.04); assert.equal(p._swingT, 0.12);
});
test('shockwave layers remain bounded at three draws with shared programs/geometries after 200 impacts', () => {
  const scene = new THREE.Scene(), kit = createShockwave(scene); const geometries = scene.children.map((m) => m.geometry), materials = scene.children.map((m) => m.material);
  for (let i = 0; i < 200; i++) { kit.emit('pound', { x: i % 3, y: 8, z: 0 }, 3, 'lava'); kit.update(0.001); }
  assert.equal(scene.children.length, 3); assert.deepEqual(scene.children.map((m) => m.geometry), geometries); assert.deepEqual(scene.children.map((m) => m.material), materials);
  assert.deepEqual(kit.summary(), [JUICE.shockPool, JUICE.shockPool, JUICE.marks]); kit.clear(); assert.ok(scene.children.every((m) => !m.visible));
});
test('a lane stops following facing in the last quarter second and returns to its pool', () => {
  const spec = { wind: 1, range: 7, radius: 1 }, mesh = makeCombatWarning('charge', spec), settings = { flashes: 'reduced' };
  assert.equal(updateCombatWarning(mesh, { wind: 0.6, facing: 0.5 }, spec, 1, settings), 0.5);
  assert.equal(updateCombatWarning(mesh, { wind: 0.3, facing: 1 }, spec, 1, settings), 1);
  assert.equal(updateCombatWarning(mesh, { wind: 0.2, facing: 2 }, spec, 1, settings), 1);
  assert.equal(mesh.userData.juice.reduced, true); removeCombatWarning(mesh);
  assert.equal(makeCombatWarning('charge', spec), mesh); removeCombatWarning(mesh);
});
test('guardian flashes are isolated; an idle shield stays still and a blocked hit swings only its leaf', () => {
  const scene = new THREE.Scene(), feel = createCombatFeel(scene), r = run();
  const e = { id: 902, kind: 'cabbage', x: 1, z: 0, hp: 20, max: 20, stun: 0 }, v = { group: createGuardianModel('cabbage'), hp: 20, max: 20, s: 1.1, context: `${r.areaId}/${r.section}/902/cabbage` };
  const other = { group: createGuardianModel('cabbage'), hp: 20 }; feel.attach(v); feel.attach(other); feel.begin(r, 0.2, 0, () => 0, 'castle');
  const base = () => ({ x: 1, y: 1, tilt: 0, twist: 0, lift: 0, roll: 0 });
  feel.pose(e, v, base(), 0.01); assert.ok(Math.abs(v.group.userData.shield.rotation.x) < 1e-9);
  feel.strike({ id: 'test', type: 1, target: e.id, targetKind: e.kind, x: e.x, z: e.z, fx: { x: 0, z: 0 }, dmg: 1, flags: ['blocked'], kill: false });
  feel.begin(r, 0.09, 0, () => 0, 'castle'); feel.pose(e, v, base(), 0.01);
  assert.ok(v.group.userData.shield.rotation.x < -0.4); assert.equal(other.flash.amount, 0); assert.ok(v.flash.amount > 0);
  const body = v.group.children.find(m => m.material?.userData.guardianFlash), otherBody = other.group.children.find(m => m.material?.userData.guardianFlash);
  assert.notEqual(body.material, otherBody.material); assert.equal(body.material.customProgramCacheKey(), otherBody.material.customProgramCacheKey());
});
