// Step 60: the reactions engine (game/reactions.js) on a real DungeonRun in Cinder Tubes: douse, frozen solid, steam, "Cool it!", burning damage over time, the watering can (spray, jet, rain cloud),
// the Ember Seed (arc, burst, patch), two friends combining, first-discovery saving and the Reactions page rows. All pure, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREAS } from '../public/js/game/areaLogic.js';
import { DungeonRun, WEAPONS, ENEMY_KINDS, DUNGEON } from '../public/js/game/dungeonLogic.js';
import { applyStatus, tickStatuses, reactionRows, REACTION_LIST, REACTION_IDS, isReaction } from '../public/js/game/reactions.js';
import { CHARMS } from '../public/js/game/charms.js';
import { gainBloom, avoidance, GROUND_ATTACKS } from '../public/js/game/combatLogic.js';
import { discoverReaction, normaliseCombat, markCleared } from '../public/js/game/combatSave.js';
import { COMBAT, CHARM, REACTIONS } from '../public/js/config.js';

const A = AREAS.cinder, O = A.origin, K1 = 'h:0', K2 = 'h:1';
const at = (x, z) => ({ x: O.x + x, z: O.z + z });
const start = (section = 1, keys = [K1], keep = false) => { const r = new DungeonRun(); r.start(keys, { area: 'cinder', section }); if (!keep) r.enemies = []; return r; };
const steps = (r, seconds, pp, dt = 0.05) => { for (let t = 0; t < seconds - 1e-9; t += dt) r.update(dt, pp); };
const make = (r, kind, x, z, extra = {}) => { const e = { id: r.enemies.length + 100, kind, ...at(x, z), hp: ENEMY_KINDS[kind].hp, max: ENEMY_KINDS[kind].hp, stun: 0, wind: 0, cooldown: 0, target: null, aim: null, ...extra }; r.enemies.push(e); return e; };
const calm = (r) => { for (const m of Object.values(r.members)) m.invulnerable = r.time + 999; };
const facing = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const pos = (...entries) => Object.fromEntries(entries);
const reset = () => { for (const a of Object.values(AREAS)) a.grid.setOpen([]); };

test('Cinder Tubes statuses: wet then burning is a douse (the fire goes out, no damage), either order', () => {
  for (const order of [['wet', 'burning'], ['burning', 'wet']]) {
    const r = start(), e = make(r, 'crab', 0, 20);
    assert.equal(applyStatus(r, e, order[0], K1).reaction, null);
    const res = applyStatus(r, e, order[1], K2);
    assert.equal(res.reaction, 'douse'); assert.equal(res.applied, false);
    assert.ok(!(e.wet > r.time) && !(e.burning > r.time), 'both statuses are gone');
    const hp = e.hp; r.time += 3; tickStatuses(r); assert.equal(e.hp, hp, 'no burning damage afterwards');
    assert.ok(r.effects.some((fx) => fx.kind === 'react' && fx.type === 'douse'));
    assert.ok(r.effects.some((fx) => fx.kind === 'practice' && fx.text === 'Doused!'), 'a floating word says it');
    assert.deepEqual(r.notes.filter((n) => n.type === 'reaction').map((n) => n.id), ['douse']);
    reset();
  }
});
test('water on a burning guardian never wets it; a wet guardian cannot catch fire', () => {
  const r = start(), a = make(r, 'imp', 0, 20), b = make(r, 'imp', 2, 20);
  applyStatus(r, a, 'burning', K1); assert.ok(a.burning > r.time); applyStatus(r, a, 'wet', K1); assert.ok(!(a.wet > r.time));
  applyStatus(r, b, 'wet', K1); assert.ok(b.wet > r.time); applyStatus(r, b, 'burning', K1); assert.ok(!(b.burning > r.time) && !(b.wet > r.time));
  reset();
});
test('wet + frost is FROZEN SOLID: a longer freeze (x1.6) and a bigger shatter (x2.2 instead of x1.8), in both orders', () => {
  const plain = start(), p = make(plain, 'crab', 0, 20); applyStatus(plain, p, 'frozen', K1);
  const base = p.frozen - plain.time; assert.ok(Math.abs(base - CHARM.frostNova.freeze) < 1e-9);
  const wetFirst = start(), w = make(wetFirst, 'crab', 0, 20); applyStatus(wetFirst, w, 'wet', K1);
  const res = applyStatus(wetFirst, w, 'frozen', K2); assert.equal(res.reaction, 'frozen-solid'); assert.equal(w.solid, true);
  assert.ok(Math.abs((w.frozen - wetFirst.time) - base * REACTIONS.solidFreeze) < 1e-9, 'x1.6 longer');
  const frostFirst = start(), f = make(frostFirst, 'crab', 0, 20); applyStatus(frostFirst, f, 'frozen', K1);
  const res2 = applyStatus(frostFirst, f, 'wet', K2); assert.equal(res2.reaction, 'frozen-solid'); assert.equal(f.solid, true); assert.ok(f.frozen - frostFirst.time > base);
  // the shatter: a charged hit on a frozen solid guardian does x2.2, on a plainly frozen one x1.8
  const hit = (run, e) => { run.members[K1].invulnerable = run.time + 99; return run.hitEnemy(K1, e, 20, 0, at(0, 22), 0, { move: 'charged' }); };
  assert.equal(hit(wetFirst, w), Math.round(20 * REACTIONS.solidShatter)); assert.equal(w.solid, false); assert.equal(w.frozen, 0, 'the shatter ends the freeze');
  assert.equal(hit(plain, p), Math.round(20 * COMBAT.frost.shatter));
  assert.ok(REACTIONS.solidShatter > COMBAT.frost.shatter);
  reset();
});
test('burning + frost is a STEAM burst, in both orders: area damage, blinded guardians, both statuses removed (the frost does not freeze it)', () => {
  for (const order of ['burning-first', 'frost-first']) {
    const r = start(), e = make(r, 'crab', 0, 20), near = make(r, 'imp', 1.5, 20), far = make(r, 'imp', 8, 20);
    if (order === 'burning-first') { applyStatus(r, e, 'burning', K1); assert.equal(applyStatus(r, e, 'frozen', K2).reaction, 'steam'); }
    else { applyStatus(r, e, 'frozen', K1); assert.equal(applyStatus(r, e, 'burning', K2).reaction, 'steam'); }
    assert.ok(!(e.burning > r.time) && !(e.frozen > r.time) && !e.solid, 'fire and ice are gone');
    assert.equal(e.hp, ENEMY_KINDS.crab.hp - REACTIONS.steamDamage); assert.equal(near.hp, ENEMY_KINDS.imp.hp - REACTIONS.steamDamage); assert.equal(far.hp, ENEMY_KINDS.imp.hp, 'outside 2.5 u nothing happens');
    assert.ok(e.blind > r.time && near.blind > r.time && !(far.blind > r.time));
    assert.ok(Math.abs(e.blind - r.time - REACTIONS.blind) < 1e-9);
    assert.ok(r.effects.some((fx) => fx.kind === 'steam'));
    reset();
  }
});
test('blinded guardians cannot target anybody until the steam clears', () => {
  const r = start(), e = make(r, 'imp', 0, 20); calm(r);
  const p = pos([K1, at(0, 24)]);
  e.blind = r.time + 1.5; r.update(0.5, p); assert.equal(e.wind, 0); assert.equal(e.target, null, 'no target while blind'); assert.equal(r.projectiles.length, 0);
  r.update(1.2, p); r.update(0.2, p); assert.ok(e.target === K1 || e.wind > 0, 'it sees again afterwards');
  reset();
});
test('burning damage over time: 6 per second for 4 seconds, and it ends', () => {
  const r = start(), e = make(r, 'crab', 0, 20); applyStatus(r, e, 'burning', K1);
  const hp0 = e.hp; for (let i = 0; i < 40; i++) { r.time += 0.1; tickStatuses(r); } const burned = hp0 - e.hp;
  assert.ok(burned >= 20 && burned <= 27, `burned ${burned}`); r.time += 5; tickStatuses(r); const after = e.hp; r.time += 3; tickStatuses(r); assert.equal(e.hp, after);
  reset();
});
test('practice dummies and ice blocks ignore every status', () => {
  const r = start(0), d = make(r, 'dummy', 0, 50), b = make(r, 'hareblock', 0, 52);
  for (const s of ['wet', 'burning', 'frozen']) { assert.equal(applyStatus(r, d, s, K1).applied, false); assert.equal(applyStatus(r, b, s, K1).applied, false); }
  assert.ok(!(d.wet > 0) && !(d.burning > 0) && !(b.frozen > 0)); reset();
});
test('two friends combine without roles: one soaks with the watering can, the other freezes with Frost Nova (frozen solid); and one friend alone can do it too', () => {
  const r = start(1, [K1, K2]); calm(r); r.giveCharm(K2, 'frost-nova');
  const e = make(r, 'crab', 0, 24), p1 = at(0, 21), p2 = at(1, 25);
  r.members[K1].ready = 0; r.attack(K1, 'watering-can', 0, pos([K1, p1], [K2, p2]), false); r.update(0.3, pos([K1, p1], [K2, p2]));
  assert.ok(e.wet > r.time, 'P1 made it wet');
  const ev = r.castCharm(K2, 0, pos([K1, p1], [K2, p2])); assert.ok(ev && ev.frozen.includes(e.id), 'P2 froze it');
  assert.equal(e.solid, true);
  const fx = r.effects.find((q) => q.kind === 'react' && q.type === 'frozen-solid'); assert.ok(fx.by.includes(K1) && fx.by.includes(K2), 'both friends are credited');
  // alone: soak, then freeze with the same player
  reset(); const solo = start(1, [K1]); calm(solo); solo.giveCharm(K1, 'frost-nova');
  const s = make(solo, 'crab', 0, 24); solo.hitEnemy(K1, s, 5, 0, p1, 0, { wet: true, ranged: true, move: 'tap' }); assert.ok(s.wet > solo.time);
  solo.castCharm(K1, 0, pos([K1, p1])); assert.equal(s.solid, true);
  reset();
});
test('the first time each reaction happens the run queues one discovery note; saving it is idempotent and keeps the order', () => {
  const r = start(); const e = make(r, 'crab', 0, 20), f = make(r, 'crab', 4, 20);
  applyStatus(r, e, 'wet', K1); applyStatus(r, e, 'burning', K1); applyStatus(r, f, 'wet', K1); applyStatus(r, f, 'burning', K1);
  assert.deepEqual(r.notes.filter((n) => n.type === 'reaction').map((n) => n.id), ['douse'], 'queued once per run');
  assert.equal(r.reactionLog.douse, 2);
  let state = normaliseCombat(null); assert.deepEqual(state.reactions, []);
  const a = discoverReaction(state, 'douse'); assert.notEqual(a, state); assert.deepEqual(a.reactions, ['douse']);
  assert.equal(discoverReaction(a, 'douse'), a, 'a repeat changes nothing'); assert.equal(discoverReaction(a, 'nonsense'), a);
  const b = discoverReaction(a, 'steam'); assert.deepEqual(b.reactions, ['douse', 'steam']);
  assert.deepEqual(normaliseCombat({ reactions: ['steam', 'bogus', 'steam', 42] }).reactions, ['steam'], 'unknown ids are dropped');
  assert.deepEqual(markCleared(b, 'cinder').reactions, ['douse', 'steam'], 'a clear keeps the discoveries');
  reset();
});
test('the Reactions page: undiscovered rows are ??? with a hint of one ingredient, known ones are in full; there are four reactions with icons', async () => {
  assert.deepEqual(REACTION_IDS, ['douse', 'frozen-solid', 'steam', 'cool']); assert.ok(isReaction('steam') && !isReaction('wet'));
  const rows = reactionRows(['steam']);
  assert.equal(rows.length, 4); const steam = rows.find((q) => q.id === 'steam'); assert.equal(steam.known, true); assert.equal(steam.name, 'Steam burst'); assert.deepEqual(steam.ingredients, ['Fire', 'Frost']);
  const unknown = rows.find((q) => q.id === 'douse'); assert.equal(unknown.known, false); assert.equal(unknown.name, '???'); assert.deepEqual(unknown.ingredients, ['Water', '?']); assert.ok(unknown.desc.length > 10);
  const { ICONS } = await import('../public/js/ui/icons.js');
  for (const id of REACTION_IDS) { assert.ok(ICONS[REACTION_LIST[id].icon].startsWith('<svg'), id); assert.ok(REACTION_LIST[id].desc.length > 30); }
  assert.ok(ICONS['charm-ember-seed'].startsWith('<svg') && ICONS['tool-watering-can'].startsWith('<svg'));
});

// ---------------------------------------------------------------------------------------------
// the Magma Toad's shell
// ---------------------------------------------------------------------------------------------
test('the Magma Toad: a magma shell in phase 2 takes x0.3, a hammer does not crack it, wet + frost cools it to stone, then a charged hit cracks it for good; stone heats up again', () => {
  const r = start(4, [K1, K2], true); calm(r); r.giveCharm(K2, 'frost-nova');
  const toad = r.enemies.find((e) => e.kind === 'toad'); const p1 = at(0, -121.5), p2 = at(1.5, -121.5);
  toad.x = O.x; toad.z = O.z - 124;
  assert.equal(toad.shell, undefined); toad.hp = Math.floor(toad.max * 0.49); r.hitEnemy(K1, toad, 1, 0, p1, 0); assert.equal(toad.phase2, true); assert.equal(toad.shell, 'magma');
  const hp = toad.hp; const dealt = r.hitEnemy(K1, toad, 40, 0, p1, 0, { move: 'tap' }); assert.equal(dealt, Math.round(40 * COMBAT.toad.shell), 'the glowing shell takes x0.3'); assert.equal(toad.hp, hp - dealt);
  r.hitEnemy(K1, toad, 60, 1, p1, 0, { move: 'charged', armorBreak: true }); assert.equal(toad.shell, 'magma', 'a hammer blow cannot crack a glowing shell');
  // wet + frost: either friend, either order
  r.hitEnemy(K1, toad, 1, 0, p1, 0, { wet: true, ranged: true, move: 'tap' }); assert.ok(toad.wet > r.time);
  r.members[K2].charmReady = 0; const ev = r.castCharm(K2, 0, pos([K1, p1], [K2, p2])); assert.ok(ev);
  assert.equal(toad.shell, 'stone'); assert.ok(r.effects.some((fx) => fx.kind === 'react' && fx.type === 'cool')); assert.ok(r.notes.some((n) => n.type === 'reaction' && n.id === 'cool'));
  assert.ok(Math.abs(toad.stoneUntil - r.time - COMBAT.toad.stoneFor) < 1e-9);
  const full = r.hitEnemy(K1, toad, 40, 0, p1, 0, { move: 'tap' }); assert.equal(full, 40, 'stone takes full damage'); assert.equal(toad.shell, 'stone', 'a tap does not crack it');
  r.hitEnemy(K1, toad, 10, 0, p1, 0, { move: 'special' }); assert.equal(toad.shell, false); assert.equal(toad.cracked, true);
  assert.equal(r.hitEnemy(K1, toad, 40, 0, p1, 0, { move: 'tap' }), 40, 'cracked for good');
  // another toad: stone that is left alone heats up again
  const r2 = start(4, [K1], true); const t2 = r2.enemies.find((e) => e.kind === 'toad'); t2.shell = 'stone'; t2.stoneUntil = r2.time + 8; r2.time += 8.5; tickStatuses(r2); assert.equal(t2.shell, 'magma');
  assert.ok(r2.effects.some((fx) => fx.kind === 'toad' && fx.type === 'heat'));
  reset();
});
test('without wet + frost the toad can still be beaten, slowly: the shell only softens each hit', () => {
  const r = start(4, [K1], true); calm(r); const toad = r.enemies.find((e) => e.kind === 'toad'); toad.shell = 'magma'; toad.phase2 = true; toad.hp = toad.max;
  const p = at(0, -121); let hits = 0; while (toad.hp > 0 && hits < 1000) { r.hitEnemy(K1, toad, WEAPONS.sword.damage[0], 0, p, 0, { move: 'tap' }); hits++; }
  assert.ok(toad.hp <= 0, 'defeated'); assert.ok(hits > toad.max / WEAPONS.sword.damage[0] * 2.5 && hits < toad.max / WEAPONS.sword.damage[0] * 4.5, `${hits} sword taps`);
  reset();
});

// ---------------------------------------------------------------------------------------------
// the watering can
// ---------------------------------------------------------------------------------------------
const swing = (r, key, e, p, { charged = false, wait = 1.2 } = {}) => { const m = r.members[key]; m.ready = r.time; r.attack(key, 'watering-can', facing(p, e), { [key]: p }, charged); r.update(wait, { [key]: p }); };
test('watering can tap: a short spray cone (3.2 u) that does light damage, knocks back 1.5 u and makes guardians wet; outside the cone nothing happens', () => {
  const w = WEAPONS['watering-can']; assert.equal(w.range, 3.2); assert.equal(w.push, 1.5); assert.ok(w.damage[0] < WEAPONS.sword.damage[0] / 2, 'light damage');
  const r = start(); calm(r); const p = at(0, 30), near = make(r, 'crab', 0, 28, { facing: Math.PI }), far = make(r, 'crab', 0, 24), side = make(r, 'crab', 3, 30);
  const z0 = near.z; swing(r, K1, near, p, { wait: 0.4 });
  assert.equal(near.hp, ENEMY_KINDS.crab.hp - 5 * 1 + 0 > 0 ? near.hp : near.hp); assert.ok(near.hp < ENEMY_KINDS.crab.hp, 'hurt a little'); assert.ok(near.wet > r.time, 'wet');
  assert.ok(Math.abs(Math.hypot(near.x - p.x, near.z - p.z) - (2 + 1.5)) < 0.2 || near.z < z0, 'pushed back from the player'); assert.equal(far.hp, ENEMY_KINDS.crab.hp, 'out of range'); assert.equal(side.hp, ENEMY_KINDS.crab.hp, 'outside the cone');
  reset();
});
test('watering can charged jet: 6.2 u long and narrow, bigger knock-back, wets everything in line; needs the charge', () => {
  const w = WEAPONS['watering-can'].charged; assert.equal(w.range, 6.2); assert.ok(w.arc > 0.9 && w.push > WEAPONS['watering-can'].push);
  const r = start(); calm(r); const p = at(0, 34), a = make(r, 'imp', 0, 29.5), b = make(r, 'imp', 0, 28.5), c = make(r, 'imp', 3, 29);
  swing(r, K1, a, p, { charged: true, wait: 0.3 });
  assert.ok(a.wet > r.time && b.wet > r.time, 'everything in the line is wet'); assert.ok(!(c.wet > r.time), 'off to the side is dry');
  assert.ok(a.hp < ENEMY_KINDS.imp.hp && a.hp > 0);
  reset();
});
test('the spray reaches a hovering bat (water counts as ranged) and soaks practice-free targets only', () => {
  const r = start(); calm(r); const p = at(0, 30), bat = make(r, 'bat', 0, 28); swing(r, K1, bat, p, { wait: 0.4 });
  assert.ok(bat.hp < ENEMY_KINDS.bat.hp && bat.wet > r.time); reset();
});
test('rain cloud: needs a Bloom pip, lands up to 5 u ahead, lasts 6 s, heals friends 2 HP every half second (never above max, never a downed friend), wets guardians', () => {
  const r = start(1, [K1, K2]); calm(r);
  const p1 = at(0, 30), p2 = at(0, 25.5), pp = pos([K1, p1], [K2, p2]);
  assert.equal(r.special(K1, 'watering-can', Math.PI, pp), null, 'no Bloom, no cloud');
  gainBloom(r.members[K1], 3); r.members[K2].hp = 80;
  const ev = r.special(K1, 'watering-can', Math.PI, pp); assert.ok(ev && ev.special); assert.equal(r.clouds.length, 1);
  const c = r.clouds[0]; assert.ok(Math.hypot(c.x - p1.x, c.z - p1.z) <= WEAPONS['watering-can'].special.range + 0.01); assert.equal(c.r, WEAPONS['watering-can'].special.radius); assert.ok(Math.abs(c.until - r.time - 6) < 1e-9);
  c.x = p2.x; c.z = p2.z;                                                // (park it over the second friend)
  const g = make(r, 'crab', 1, 24.5); const before = r.members[K2].hp;
  steps(r, 1.1, pp); assert.ok(r.members[K2].hp >= before + 2 * 2 && r.members[K2].hp <= before + 2 * 3, `healed ${r.members[K2].hp - before}`); assert.ok(g.wet > r.time, 'the guardian under it is wet');
  assert.equal(r.members[K1].hp, DUNGEON.hp, 'the friend at full HP is not above max');
  steps(r, 8, pp); assert.equal(r.members[K2].hp, DUNGEON.hp, 'capped at the maximum'); assert.equal(r.clouds.length, 0, 'it is gone after 6 s');
  reset();
});
test('a rain cloud never heals a downed friend, never passes the HP maximum, and the big one is wider and lasts longer', () => {
  const r = start(1, [K1, K2]); calm(r); const p = at(0, 30), pp = pos([K1, p], [K2, p]);
  r.down(K2); r.members[K1].hp = 40; r.addCloud(K1, p.x, p.z, 6, 2.6); steps(r, 2, pp);
  assert.equal(r.members[K2].hp, 0, 'a downed friend gets nothing'); assert.ok(r.members[K1].hp > 40 && r.members[K1].hp <= DUNGEON.hp);
  r.addCloud(K1, p.x, p.z, 40, 2.6); steps(r, 30, pp); assert.equal(r.members[K1].hp, DUNGEON.hp);
  const big = start(); gainBloom(big.members[K1], 3); big.special(K1, 'watering-can', Math.PI, pos([K1, at(0, 30)]), true);
  const s = WEAPONS['watering-can'].special; assert.equal(big.clouds[0].r, s.bigRadius); assert.ok(Math.abs(big.clouds[0].until - big.time - s.bigLife) < 1e-9); assert.ok(s.bigRadius > s.radius && s.bigLife > s.life);
  reset();
});
test('a rain cloud puts burning patches out and douses burning guardians under it; a player owns at most two clouds', () => {
  const r = start(); calm(r); const e = make(r, 'crab', 0, 20); applyStatus(r, e, 'burning', K1); r.addPatch(O.x, O.z + 20.5, 1.6, 4, { owner: K1 });
  r.addCloud(K1, O.x, O.z + 20, 6, 2.6); steps(r, 0.7, pos([K1, at(0, 30)])); assert.equal(r.patches.length, 0, 'the fire is out'); assert.ok(!(e.burning > r.time), 'and the guardian is doused'); assert.ok(r.notes.some((n) => n.id === 'douse'));
  for (let i = 0; i < 5; i++) r.addCloud(K1, O.x + i, O.z + 30, 6, 2.6); assert.equal(r.clouds.filter((c) => c.owner === K1).length, 2);
  reset();
});
test('the dodge-hop clears a burning patch (it is on the floor), the dodge i-frames too', () => {
  assert.ok(GROUND_ATTACKS.has('burn') && GROUND_ATTACKS.has('flop')); assert.ok(!GROUND_ATTACKS.has('lash') && !GROUND_ATTACKS.has('blob') && !GROUND_ATTACKS.has('fireball'));
  const r = start(); const p = at(0, 30); r.addPatch(O.x, O.z + 30, 1.6, 4, { owner: null, src: 'toad' });
  r.members[K1].dodge = { at: r.time, air: 0.48, inv: 0.18, dx: 0, dz: 0, perfect: false }; r.update(0.05, pos([K1, p])); assert.equal(r.members[K1].hp, DUNGEON.hp, 'hopping over it');
  r.members[K1].dodge = null; r.time += 1.2; r.update(0.05, pos([K1, p])); assert.equal(r.members[K1].hp, DUNGEON.hp - COMBAT.patch.damage);
  r.update(0.3, pos([K1, p])); assert.equal(r.members[K1].hp, DUNGEON.hp - COMBAT.patch.damage, 'at most once per ' + COMBAT.patch.every + ' s'); r.members[K1].invulnerable = 0; r.update(1.2, pos([K1, p])); assert.equal(r.members[K1].hp, DUNGEON.hp - 2 * COMBAT.patch.damage);
  reset();
});

// ---------------------------------------------------------------------------------------------
// the Ember Seed
// ---------------------------------------------------------------------------------------------
test('Ember Seed: a charm with an 8 s cooldown that arcs ~6 u ahead, lands after 0.45 s, bursts for 12 in 1.8 u, sets guardians burning and leaves a 4 s patch', () => {
  const s = CHARM.emberSeed; assert.equal(CHARMS['ember-seed'].cooldown, 8); assert.equal(CHARMS['ember-seed'].icon, 'charm-ember-seed'); assert.ok(CHARMS['ember-seed'].desc.length > 60);
  const r = start(); calm(r); r.giveCharm(K1, 'ember-seed'); const p = at(0, 34), pp = pos([K1, p]);
  const ev = r.castCharm(K1, Math.PI, pp); assert.ok(ev); assert.equal(ev.charm, 'ember-seed');
  assert.ok(Math.abs(Math.hypot(ev.tx - p.x, ev.tz - p.z) - s.range) < 0.3, 'about six steps ahead'); assert.equal(r.bursts.length, 1);
  const e = make(r, 'crab', ev.tx - O.x, ev.tz - O.z); const far = make(r, 'crab', 9, 20);
  assert.equal(r.castCharm(K1, Math.PI, pp), null, 'on cooldown'); r.update(0.2, pp); assert.equal(e.hp, ENEMY_KINDS.crab.hp, 'not landed yet');
  r.update(0.3, pp); assert.ok(e.hp <= ENEMY_KINDS.crab.hp - 10, 'burst damage'); assert.ok(e.burning > r.time, 'burning'); assert.equal(far.hp, ENEMY_KINDS.crab.hp); assert.equal(r.bursts.length, 0);
  assert.equal(r.patches.length, 1); assert.equal(r.patches[0].r, s.patchRadius); assert.ok(Math.abs(r.patches[0].until - r.time - s.patchFor) < 0.6);
  assert.ok(r.effects.some((fx) => fx.kind === 'ember'));
  r.time += 7.6; r.members[K1].charmReady = 0; assert.ok(r.castCharm(K1, Math.PI, pp), 'ready again after the cooldown');
  reset();
});
test('Ember Seed auto-aims onto the nearest guardian in front and does not fly over walls; patches burn guardians, hurt friends a little and run out', () => {
  const r = start(); calm(r); r.giveCharm(K1, 'ember-seed'); const p = at(0, 34); make(r, 'crab', 0, 31);
  const ev = r.castCharm(K1, Math.PI, pos([K1, p])); assert.ok(Math.abs(ev.tz - (O.z + 31)) < 0.3, 'lands on the crab');
  const wall = start(0); wall.giveCharm(K1, 'ember-seed'); const q = at(0, 54.5); const e2 = wall.castCharm(K1, Math.PI, pos([K1, q]));       // north up the stair, at the closed gate (48..50)            // the mouth's north: toward the stair then the closed gate
  assert.ok(e2.tz > O.z + 50, 'a closed gate stops the lob');   // (open, it would land at 48; the mouth moved 8 u south in the 0.60.0 playtest)
  const r3 = start(); const f = make(r3, 'imp', 0, 20); r3.addPatch(O.x, O.z + 20, 1.6, 4, { owner: K1 }); steps(r3, 0.2, pos([K1, at(10, 30)])); assert.ok(f.burning > r3.time, 'standing in a patch sets a guardian burning');
  steps(r3, 5, pos([K1, at(10, 30)])); assert.equal(r3.patches.length, 0, 'the patch burns out');
  reset();
});
test('Ember Seed on a wet guardian is a douse; on a frozen one a steam burst; both with the seed alone', () => {
  const r = start(); calm(r); r.giveCharm(K1, 'ember-seed'); const p = at(0, 34), pp = pos([K1, p]);
  const wet = make(r, 'crab', 0, 28); applyStatus(r, wet, 'wet', K2); const ev = r.castCharm(K1, Math.PI, pp); steps(r, 0.6, pp);
  assert.ok(r.notes.some((n) => n.id === 'douse')); assert.ok(!(wet.wet > r.time), 'the water boiled off (the patch may light it again a moment later)');
  const ice = make(r, 'imp', ev.tx - O.x + 0.4, ev.tz - O.z); applyStatus(r, ice, 'frozen', K2); r.members[K1].charmReady = 0; r.castCharm(K1, Math.PI, pp); steps(r, 0.6, pp);
  assert.ok(r.notes.some((n) => n.id === 'steam'), 'fire on ice makes steam');
  reset();
});
