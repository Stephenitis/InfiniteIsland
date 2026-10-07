// Step 58, the Charm button and the Armory: the input mapping (keyboard R, standard X / RB, GameCube X / R, Y stays Jump), InputManager edges, shared-device merge,
// the phone field, outside-combat routing, the CHARMS registry, host-side cast validation, Spark, pedestals, snapshots and the Armory rack.
import test from 'node:test';
import assert from 'node:assert/strict';
import { InputManager } from '../public/js/input/inputManager.js';
import { KeyboardSource } from '../public/js/input/keyboardSource.js';
import { GamepadSource, PROFILES } from '../public/js/input/gamepadSource.js';
import { RemoteSource } from '../public/js/input/remoteSource.js';
import { DungeonRun, DUNGEON } from '../public/js/game/dungeonLogic.js';
import { CHARMS, charmInfo, charmCooldown, charmButtonShown, actionsWithCharmRouting, rackPedestals, areaPedestals, pedestalSlots, swapAtPedestal, RACK_MAX } from '../public/js/game/charms.js';
import { AREAS, registerArea } from '../public/js/game/areaLogic.js';
import { TEST_AREA } from '../public/js/game/areas/testYard.js';
import { charmRows, NO_CHARMS } from '../public/js/ui/dungeonBook.js';
import { CHARM } from '../public/js/config.js';

const scripted = (...frames) => { let i = 0; return { analog: true, poll: () => frames[Math.min(i++, frames.length - 1)] }; };

// ---- input
test('charm press edge fires once per hold, charmTap latches a sub-frame tap, and a charm press marks its source active', () => {
  const m = new InputManager({ activeSource: 'keyboard' });
  m.addSource('keyboard', scripted({}));
  m.addSource('pad', scripted({ charm: false }, { charm: true }, { charm: true }, { charm: false, charmTap: true }, { charm: true }));
  const seen = [];
  for (let i = 0; i < 5; i++) { const s = m.update(); seen.push([s.charmPressed, s.charmHeld, s.activeSource]); }
  assert.deepEqual(seen.map((s) => s.slice(0, 2)), [[false, false], [true, true], [false, true], [true, false], [true, true]]);
  assert.equal(seen[1][2], 'pad');
});

test('charm is independent of jump / interact / cancel', () => {
  const m = new InputManager();
  m.addSource('s', scripted({ charm: true }, { jump: true }));
  let s = m.update();
  assert.deepEqual([s.charmPressed, s.jumpPressed, s.interactPressed, s.cancelPressed], [true, false, false, false]);
  s = m.update();
  assert.deepEqual([s.charmPressed, s.jumpPressed], [false, true]);
});

test('keyboard: R is Charm (held + tap latch), not Jump / Interact', () => {
  const listeners = [];
  const target = { addEventListener(t, f) { listeners.push([t, f]); }, removeEventListener() {} };
  const prevWindow = globalThis.window, prevDoc = globalThis.document;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.document = { addEventListener() {}, removeEventListener() {}, hidden: false };
  try {
    const k = new KeyboardSource(target);
    const down = listeners.find(([t]) => t === 'keydown')[1], up = listeners.find(([t]) => t === 'keyup')[1];
    down({ code: 'KeyR', preventDefault() {}, target: {} }); up({ code: 'KeyR', target: {} });
    let p = k.poll();
    assert.deepEqual([p.charm, p.charmTap, p.jump, p.interact, p.cancel], [true, true, false, false, false]);
    p = k.poll(); assert.deepEqual([p.charm, p.charmTap], [false, false]);
    k.press('KeyR'); p = k.poll(); assert.equal(p.charm, true);
    k.releaseAll(); k.dispose();
  } finally { globalThis.window = prevWindow; globalThis.document = prevDoc; }
});

const GC_ID = 'GameCube Controller Adapter (Vendor: 0079 Product: 1846)';
const btns = (down = []) => Array.from({ length: 16 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 }));
const read = (pad) => {
  const hub = new GamepadSource({ addEventListener() {}, removeEventListener() {} });
  hub._read = () => [pad];
  const info = console.info; console.info = () => {};
  try { hub.sync(0); } finally { console.info = info; }
  return { ...hub.view(pad.index).poll() };
};
const standard = (down) => ({ index: 0, id: 'Xbox Controller', mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: btns(down) });
const gamecube = (down) => ({ index: 0, id: GC_ID, mapping: '', connected: true, axes: [0.027, -0.01, 0.098, -0.784, -0.733, 0.059, 0, 0, 0, 1.29], buttons: btns(down) });

test('profiles: standard X (2) / RB (5) and GameCube X (0) / R (5) are Charm; Y (3) stays Jump on both', () => {
  assert.deepEqual(PROFILES.standard.charm, [2, 5]); assert.deepEqual(PROFILES.gamecube.charm, [0, 5]);
  assert.deepEqual(PROFILES.standard.jump, [3]); assert.deepEqual(PROFILES.gamecube.jump, [3]);
  for (const make of [standard, gamecube]) {
    const flags = (i) => { const o = read(make([i])); return [o.charm, o.jump, o.interact, o.cancel]; };
    assert.deepEqual(flags(make === standard ? 2 : 0), [true, false, false, false]);
    assert.deepEqual(flags(5), [true, false, false, false]);
    assert.deepEqual(flags(3), [false, true, false, false]);
  }
  assert.deepEqual([read(standard([0])).charm, read(standard([1])).charm, read(gamecube([1])).charm, read(gamecube([2])).charm], [false, false, false, false]);
});

const fakeLink = () => { const h = {}; return { on(t, f) { h[t] = f; }, emit(t, ...a) { h[t](...a); } }; };
test('remote: charm rides the input packet; old packets without it read false; inject takes it too', () => {
  const link = fakeLink(), remote = new RemoteSource(link);
  link.emit('controller-connected', 1, 'abc');
  const v = remote.view('c-abc');
  link.emit('input', { id: 1, clientId: 'abc', x: 0, y: 0, interact: false, cancel: false, jump: false });
  let p = v.poll(); assert.deepEqual([p.charm, p.charmTap], [false, false]);
  link.emit('input', { id: 1, clientId: 'abc', x: 0, y: 0, interact: false, cancel: false, charm: true });
  link.emit('input', { id: 1, clientId: 'abc', x: 0, y: 0, interact: false, cancel: false, charm: false });   // down + up between polls
  p = v.poll(); assert.deepEqual([p.charmTap, p.charm], [true, true]);
  p = v.poll(); assert.deepEqual([p.charmTap, p.charm], [false, false]);
  link.emit('input', { id: 1, clientId: 'abc', x: 0, y: 0, interact: false, cancel: false });                // an old page releases it
  assert.equal(v.poll().charm, false);
  remote.inject('c-fake', { charm: true });
  assert.equal(remote.view('c-fake').poll().charm, true);
  remote.inject('c-fake', {}); assert.equal(remote.view('c-fake').poll().charm, false);
});

test('outside combat Charm is a second Jump; inside it is not', () => {
  const a = () => ({ jumpPressed: false, jumpHeld: false, charmPressed: true, charmHeld: true });
  let x = actionsWithCharmRouting(a(), false); assert.deepEqual([x.jumpPressed, x.jumpHeld], [true, true]);
  x = actionsWithCharmRouting(a(), true); assert.deepEqual([x.jumpPressed, x.jumpHeld], [false, false]);
  x = actionsWithCharmRouting({ jumpPressed: true, jumpHeld: true, charmPressed: false }, false); assert.deepEqual([x.jumpPressed, x.jumpHeld], [true, true]);
});

test('the touch Charm button shows only inside an area with a charm to use', () => {
  assert.equal(charmButtonShown(false, 3, 'spark'), false);
  assert.equal(charmButtonShown(true, 0, null), false, 'a new party sees three buttons');
  assert.equal(charmButtonShown(true, 1, null), true);
  assert.equal(charmButtonShown(true, 0, 'spark'), true);
  assert.equal(charmButtonShown(true, 0, 'not-a-charm'), false);
});

// ---- the registry and casting
test('the CHARMS registry: every entry has what Steps 59-61 rely on', () => {
  assert.ok(CHARMS.spark);
  for (const [id, c] of Object.entries(CHARMS)) {
    assert.equal(c.id, id);
    for (const k of ['name', 'color', 'icon', 'desc']) assert.equal(typeof c[k], 'string', `${id}.${k}`);
    assert.ok(c.cooldown > 0 && c.reach > 0); assert.equal(typeof c.cast, 'function');
  }
  assert.equal(charmInfo('spark'), CHARMS.spark); assert.equal(charmInfo('toString'), null); assert.equal(charmInfo(null), null);
});

const A = 'host:0', B = 's1:1';
const at = (x = 0, z = 0) => ({ x: DUNGEON.x + x, z: DUNGEON.z + z });
function setup(armory = null) { const run = new DungeonRun(); run.start([A, B], { section: 2, armory }); run.enemies = []; return run; }
const enemy = (id, x, z, extra = {}) => ({ id, kind: 'berry', ...at(x, z), hp: 1000, max: 1000, stun: 0, wind: 0, cooldown: 0, ...extra });

test('cast validation: no charm, cooldown, downed, stunned, outside the area, bad facing', () => {
  const run = setup(), pos = { [A]: at(0, 0), [B]: at(2, 0) };
  assert.equal(run.castCharm(A, 0, pos), null, 'no charm held');
  run.giveCharm(A, 'spark');
  assert.ok(run.castCharm(A, 0, pos));
  assert.equal(run.castCharm(A, 0, pos), null, 'cooling down');
  run.time += CHARM.spark.cooldown - 0.01; assert.equal(run.castCharm(A, 0, pos), null);
  run.time += 0.02; assert.ok(run.castCharm(A, 0, pos), 'recharged after the cooldown');
  run.giveCharm(B, 'spark');
  run.members[B].stunUntil = run.time + 1; assert.equal(run.castCharm(B, 0, pos), null, 'stunned');
  run.members[B].stunUntil = 0; run.members[B].downed = true; assert.equal(run.castCharm(B, 0, pos), null, 'downed');
  run.members[B].downed = false; assert.equal(run.castCharm(B, 0, { [B]: { x: 99999, z: 99999 } }), null, 'outside the area');
  assert.equal(run.castCharm(B, NaN, pos), null, 'bad facing');
  assert.equal(run.castCharm('nobody', 0, pos), null);
  const idle = new DungeonRun(); idle.members[A] = idle.newMember(); idle.giveCharm(A, 'spark'); assert.equal(idle.castCharm(A, 0, pos), null, 'no run');
  assert.equal(run.giveCharm(A, 'nonsense'), false);
});

test('Spark: a radius-2.5 burst, 12 damage, 0.4 s stun, 4 s cooldown; the caster gains Bloom', () => {
  const run = setup(), pos = { [A]: at(0, 0), [B]: at(8, 0) };
  run.giveCharm(A, 'spark');
  run.enemies = [enemy(1, 2, 0), enemy(2, 0, 3.5), enemy(3, -2, 0.5)];
  const bloom = run.members[A].bloom;
  const ev = run.castCharm(A, 0, pos);
  assert.equal(ev.charm, 'spark'); assert.equal(ev.radius, 2.5); assert.deepEqual(ev.hits, [1, 3]);
  assert.equal(run.enemies[0].hp, 1000 - 12); assert.equal(run.enemies[2].hp, 1000 - 12); assert.equal(run.enemies[1].hp, 1000, 'out of range');
  assert.ok(run.enemies[0].stun >= 0.4 - 1e-9);
  assert.ok(run.members[A].bloom > bloom);
  assert.equal(run.members[A].charmReady, run.time + 4);
  assert.deepEqual(charmCooldown(run.members[A], run.time), { ready: false, left: 4, frac: 0 });
  assert.equal(charmCooldown(run.members[A], run.time + 2).frac, 0.5);
  assert.equal(charmCooldown(run.members[A], run.time + 4).ready, true);
  assert.equal(charmCooldown(run.members[B], run.time).frac, 1, 'no charm: nothing to recharge');
});

test('a wipe keeps the charm you carry; the snapshot carries charms, cooldowns and pedestals and round-trips', () => {
  const run = setup({ charms: ['spark'] }), pos = { [A]: at(0, 0), [B]: at(2, 0) };
  run.giveCharm(A, 'spark'); run.castCharm(A, 0, pos);
  const snap = run.snapshot();
  assert.equal(snap.members[A].charm, 'spark'); assert.ok(snap.members[A].charmReady > 0); assert.ok(snap.pedestals.length >= 1);
  const copy = new DungeonRun(); copy.load(JSON.parse(JSON.stringify(snap)));
  assert.equal(copy.members[A].charm, 'spark'); assert.deepEqual(copy.pedestals, run.pedestals);
  const old = new DungeonRun(); old.load({ ...JSON.parse(JSON.stringify(snap)), pedestals: undefined }); assert.deepEqual(old.pedestals, [], 'an older snapshot has no pedestals');
  run.wipe(); assert.equal(run.members[A].charm, 'spark'); assert.equal(run.members[B].charm, null);
  assert.equal(run.members[A].hp, DUNGEON.hp);
});

// ---- pedestals and the Armory rack
test('a section pedestal swaps: take its charm, yours stays on it; empty-handed you just take it; an empty pedestal takes yours', () => {
  const m = { charm: null, charmReady: 9 }, ped = { id: 's1-0', charm: 'spark', rack: false };
  assert.deepEqual(swapAtPedestal(m, ped), { took: 'spark', left: null }); assert.deepEqual([m.charm, ped.charm, m.charmReady], ['spark', null, 0]);
  assert.deepEqual(swapAtPedestal(m, ped), { took: null, left: 'spark' }); assert.deepEqual([m.charm, ped.charm], [null, 'spark'], 'put it back');
  const other = { charm: 'later', charmReady: 0 }; ped.charm = 'spark';
  assert.deepEqual(swapAtPedestal(other, ped), { took: 'spark', left: 'later' }); assert.deepEqual([other.charm, ped.charm], ['spark', 'later']);
  assert.equal(swapAtPedestal({ charm: null }, { charm: null, rack: false }), null, 'nothing to exchange');
  assert.equal(swapAtPedestal(null, ped), null);
});

test('rack pedestals are an unlimited supply: taking a charm leaves it there', () => {
  const m = { charm: null }, ped = { id: 'r0', charm: 'spark', rack: true };
  assert.deepEqual(swapAtPedestal(m, ped), { took: 'spark', left: null }); assert.equal(ped.charm, 'spark'); assert.equal(m.charm, 'spark');
  assert.equal(swapAtPedestal(m, ped), null, 'already holding it');
  const holder = { charm: 'other' }; assert.deepEqual(swapAtPedestal(holder, ped), { took: 'spark', left: 'other' }); assert.equal(ped.charm, 'spark');
});

test('swapCharm is host-validated: area, distance, downed, section; Wildroot has no pedestals until a charm is learned', () => {
  const wild = setup(); assert.deepEqual(wild.pedestals, [], 'Wildroot shows no charms yet');
  const run = new DungeonRun(); run.start([A, B], { armory: { charms: ['spark', 'unknown-charm'] } });
  assert.deepEqual(run.pedestals.map((p) => [p.id, p.charm, p.rack]), [['r0', 'spark', true]], 'unknown ids are skipped');
  const ped = run.pedestals[0], near = { x: ped.x + 1, z: ped.z }, pos = { [A]: near, [B]: { x: ped.x + 40, z: ped.z } };
  assert.deepEqual(run.swapCharm(A, 'r0', pos), { took: 'spark', left: null, ped: 'r0' });
  assert.equal(run.members[A].charm, 'spark');
  assert.equal(run.swapCharm(B, 'r0', pos), null, 'too far away');
  assert.equal(run.swapCharm(A, 'nope', pos), null);
  run.members[A].downed = true; assert.equal(run.swapCharm(A, 'r0', pos), null, 'a sprout cannot');
});

test('area pedestals and slots: sections can define their own; every area exposes static slots for the interactables', () => {
  const area = { ...TEST_AREA, origin: { x: 10, z: 20, y: 0 }, sections: [{ ...TEST_AREA.sections[0], start: { x: 0, z: 0, step: 1 }, pedestals: [{ x: 1, z: 2, charm: 'spark' }, { x: 3, z: 4, charm: 'bogus' }] }] };
  assert.deepEqual(areaPedestals(area).map((p) => [p.id, p.x, p.z, p.charm, p.section]), [['s0-0', 11, 22, 'spark', 0], ['s0-1', 13, 24, null, 0]]);
  const slots = pedestalSlots(area);
  assert.equal(slots.length, RACK_MAX + 2); assert.ok(slots.every((s) => Number.isFinite(s.x) && Number.isFinite(s.z)));
  assert.equal(new Set(slots.map((s) => s.id)).size, slots.length);
  const rack = rackPedestals(area, ['spark', 'spark', 'x']); assert.equal(rack.length, 1, 'duplicates and unknown ids drop');
  assert.ok(Math.abs(rackPedestals(area, ['spark'])[0].x - (10 + 3)) < 1e-9, 'default rack: beside the first start');
});

test('the rack stands on floor in the first section of an area: Wildroot own spot and the default beside a start', () => {
  const test_area = registerArea(TEST_AREA);
  for (const area of [AREAS.wildroot, test_area]) {
    const spots = rackPedestals(area, ['spark']);
    assert.equal(spots.length, 1);
    assert.ok(area.grid.inArea(spots[0].x, spots[0].z, 0.3), area.id);
  }
});

test('the Charms tab lists the Armory\'s charms plus the one in hand; empty gets its text', () => {
  assert.deepEqual(charmRows([], null), []); assert.match(NO_CHARMS, /No charms found yet/);
  const rows = charmRows(['spark', 'nonsense'], null); assert.equal(rows.length, 1); assert.equal(rows[0].name, 'Spark'); assert.equal(rows[0].held, false);
  assert.equal(charmRows([], 'spark')[0].held, true);
  assert.equal(charmRows(['spark'], 'spark').length, 1, 'no duplicate for the one in hand');
  for (const r of charmRows(['spark'])) { assert.ok(r.desc.length > 5 && r.cooldown > 0); }
});
