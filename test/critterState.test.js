// Step 34b: the pure rules of where Frostpine's critters live: feed validation, no double feed, the shared save file (unknown ids, bad values, keys of later steps), the hash.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CRITTERS } from '../public/js/config.js';
import { freshState, validateFeed, applyFed, campCount, normaliseState, readSave, buildSave, hashView, STORAGE_KEY, SAVE_VERSION } from '../public/js/game/critterState.js';

const ids = CRITTERS.spots.map((s) => s.id);
const ok = { gateOpen: true, entry: { at: 'wild' }, have: 1 };

test('a fresh state has all eight critters in the wild', () => {
  const s = freshState(ids);
  assert.equal(Object.keys(s).length, 8);
  assert.ok(Object.values(s).every((e) => e.at === 'wild'));
  assert.equal(campCount(s), 0);
  assert.equal(STORAGE_KEY, 'infinite-island.frostpine.v1');
});

test('feeding is allowed only through the gate, for a wild critter, with the food in the bag', () => {
  assert.deepEqual(validateFeed(ok), { ok: true });
  assert.equal(validateFeed({ ...ok, entry: undefined }).reason, 'bad-request');
  assert.equal(validateFeed({ ...ok, gateOpen: false }).reason, 'locked');
  assert.equal(validateFeed({ ...ok, entry: { at: 'camp' } }).reason, 'gone');
  assert.equal(validateFeed({ ...ok, have: 0 }).reason, 'none');
  assert.equal(validateFeed({ ...ok, have: -3 }).reason, 'none');
  assert.equal(validateFeed({ ...ok, have: NaN }).reason, 'none');
  assert.equal(validateFeed({ ...ok, have: undefined }).reason, 'none');
});

test('a remote actor must be in range; the host (no distance) is not range checked', () => {
  assert.equal(validateFeed({ ...ok, dist: 5, range: 18 }).ok, true);
  assert.equal(validateFeed({ ...ok, dist: 40, range: 18 }).reason, 'far');
  assert.equal(validateFeed({ ...ok, dist: NaN, range: 18 }).reason, 'far');
  assert.equal(validateFeed({ ...ok, dist: null, range: 18 }).ok, true);
});

test('the gate is checked before anything else about the critter', () => {
  assert.equal(validateFeed({ gateOpen: false, entry: { at: 'camp' }, have: 0 }).reason, 'locked');
});

test('applyFed moves exactly one critter to the camp and never mutates the input', () => {
  const s = freshState(ids);
  const n = applyFed(s, ids[3]);
  assert.equal(s[ids[3]].at, 'wild');
  assert.equal(n[ids[3]].at, 'camp');
  assert.equal(campCount(n), 1);
  assert.equal(applyFed(n, 'nobody')[ids[3]].at, 'camp');
  assert.equal(Object.keys(applyFed(n, 'nobody')).length, 8);
});

test('no double feed: a second attempt on the same critter is rejected, so one food feeds one critter', () => {
  let state = freshState(ids), bag = 1;
  const attempt = (id) => {
    const v = validateFeed({ gateOpen: true, entry: state[id], have: bag });
    if (!v.ok) return v.reason;
    bag -= 1; state = applyFed(state, id);
    return 'fed';
  };
  assert.equal(attempt(ids[0]), 'fed');
  assert.equal(attempt(ids[0]), 'gone');             // the loser of a race on the same critter
  assert.equal(attempt(ids[1]), 'none');             // the bag is empty: another critter cannot be fed with a food that is gone
  assert.equal(bag, 0);
  assert.equal(campCount(state), 1);
});

test('normaliseState drops unknown ids and ignores bad values', () => {
  const n = normaliseState({ [ids[0]]: { at: 'camp' }, [ids[1]]: { at: 'moon' }, [ids[2]]: 'camp', [ids[3]]: null, ghost: { at: 'camp' } }, ids);
  assert.equal(n[ids[0]].at, 'camp');
  for (const id of ids.slice(1)) assert.equal(n[id].at, 'wild', id);
  assert.equal(n.ghost, undefined);
  assert.equal(Object.keys(n).length, 8);
  for (const bad of [null, undefined, 7, 'x', []]) assert.equal(campCount(normaliseState(bad, ids)), 0);
});

test('the save round-trips and keeps the keys later steps own', () => {
  const state = applyFed(applyFed(freshState(ids), ids[2]), ids[5]);
  const written = buildSave(state, { comfort: 2, tails: ['fox-1'] });
  assert.equal(written.v, SAVE_VERSION);
  assert.equal(written.comfort, 2);
  const back = readSave(JSON.parse(JSON.stringify(written)), ids);
  assert.deepEqual(back.state, state);
  assert.deepEqual(back.rest, { comfort: 2, tails: ['fox-1'] });
  assert.deepEqual(buildSave(back.state, back.rest), written);
});

test('readSave copes with a missing or broken file', () => {
  for (const raw of [null, undefined, 'junk', 4]) {
    const r = readSave(raw, ids);
    assert.equal(campCount(r.state), 0);
    assert.deepEqual(r.rest, {});
  }
  assert.equal(readSave({ v: 1 }, ids).state[ids[0]].at, 'wild');
});

test('buildSave only ever writes wild / camp', () => {
  const w = buildSave({ a: { at: 'camp' }, b: { at: 'weird' }, c: {} });
  assert.deepEqual(w.critters, { a: { at: 'camp' }, b: { at: 'wild' }, c: { at: 'wild' } });
});

test('hashView is the sorted state, equal for equal states', () => {
  const a = applyFed(freshState(ids), ids[4]);
  const b = applyFed(freshState([...ids].reverse()), ids[4]);
  assert.equal(JSON.stringify(hashView(a)), JSON.stringify(hashView(b)));
  assert.notEqual(JSON.stringify(hashView(a)), JSON.stringify(hashView(freshState(ids))));
});
