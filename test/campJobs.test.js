// Step 35a: the camp jobs' pure rules (game/campJobs.js), the new log items / loot, and the fuel order (game/fireLogic.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMP_JOBS, CAMP_MAX_COMFORT } from '../public/js/config.js';
import {
  freshState, currentJob, needed, remainingNeeds, progress, validateGive, applyGive, normaliseState, readSave, buildSave, hashView,
} from '../public/js/game/campJobs.js';
import { FUEL_LOGS, fuelLogCount, pickFuelLog } from '../public/js/game/fireLogic.js';
import { getItem } from '../public/js/game/catalog.js';
import { LOOT, lootFor, rollCount } from '../public/js/world/lootTable.js';

const give = (s, item, n) => applyGive(s, item, n).state;
const finish = (s) => { for (const [item, n] of Object.entries(currentJob(s).needs)) s = give(s, item, n); return s; };

test('three jobs in a fixed order with the specified materials', () => {
  assert.equal(CAMP_JOBS.length, 3);
  assert.equal(CAMP_MAX_COMFORT, 3);
  assert.deepEqual(CAMP_JOBS.map((j) => j.id), ['windbreak', 'dens', 'shelter']);
  assert.deepEqual(CAMP_JOBS[0].needs, { 'pine-log': 10, stone: 8, 'birch-log': 4 });
  assert.deepEqual(CAMP_JOBS[1].needs, { 'birch-log': 8, pinecone: 12, lingonberry: 6, crystal: 3 });
  assert.deepEqual(CAMP_JOBS[2].needs, { 'pine-log': 16, stone: 10, 'snow-truffle': 6, crystal: 4 });
  for (const j of CAMP_JOBS) for (const id of Object.keys(j.needs)) assert.ok(getItem(id), `${id} is a catalog item`);
});

test('a fresh state starts job 0; gifts are gated on a critter living at the camp', () => {
  const s = freshState();
  assert.deepEqual(s, { comfort: 0, job: 0, given: {} });
  assert.equal(currentJob(s).id, 'windbreak');
  const base = { state: s, item: 'pine-log', n: 5, have: 9 };
  assert.equal(validateGive({ ...base, critters: 0 }).reason, 'locked');
  assert.deepEqual(validateGive({ ...base, critters: 1 }), { ok: true, n: 5 });
});

test('requests are clamped to what the bag holds and what the job still needs; bad input is refused', () => {
  const s = give(freshState(), 'stone', 6);
  assert.equal(needed(s, 'stone'), 2);
  assert.equal(validateGive({ critters: 2, state: s, item: 'stone', n: 5, have: 99 }).n, 2);        // the job only wants 2 more
  assert.equal(validateGive({ critters: 2, state: s, item: 'pine-log', n: 8, have: 3 }).n, 3);      // the bag only has 3
  assert.equal(validateGive({ critters: 2, state: s, item: 'pine-log', n: 2.9, have: 9 }).n, 2);    // floored
  assert.equal(validateGive({ critters: 2, state: s, item: 'pine-log', n: 4, have: 0 }).reason, 'none');
  assert.equal(validateGive({ critters: 2, state: s, item: 'crystal', n: 1, have: 9 }).reason, 'not-needed');
  assert.equal(validateGive({ critters: 2, state: give(s, 'stone', 2), item: 'stone', n: 1, have: 9 }).reason, 'not-needed');   // already has all the stone
  for (const n of [0, -2, NaN, 'x', undefined]) assert.equal(validateGive({ critters: 2, state: s, item: 'pine-log', n, have: 9 }).reason, 'bad-request');
  assert.equal(validateGive({ critters: 2, state: s, item: 7, n: 1, have: 9 }).reason, 'bad-request');
});

test('two racing gifts can never overspend: the second one is clamped / refused on the updated state', () => {
  let s = freshState();
  let bag = 12;                                         // 12 pine logs in the bag, the job needs 10
  const a = validateGive({ critters: 1, state: s, item: 'pine-log', n: 8, have: bag }); bag -= a.n; s = give(s, 'pine-log', a.n);
  const b = validateGive({ critters: 1, state: s, item: 'pine-log', n: 8, have: bag }); bag -= b.n; s = give(s, 'pine-log', b.n);
  assert.equal(a.n, 8); assert.equal(b.n, 2);
  assert.equal(bag, 2); assert.equal(s.given['pine-log'], 10);
  assert.equal(validateGive({ critters: 1, state: s, item: 'pine-log', n: 1, have: bag }).reason, 'not-needed');
});

test('partial gifts are kept; the last material completes the job: comfort + 1, the next job starts', () => {
  let s = freshState();
  let r = applyGive(s, 'pine-log', 10);
  assert.equal(r.completed, false);
  r = applyGive(r.state, 'stone', 8);
  assert.equal(r.completed, false);
  assert.deepEqual(progress(r.state), { done: false, comfort: 0, max: 3, job: 0, total: 22, given: 18 });
  r = applyGive(r.state, 'birch-log', 4);
  assert.equal(r.completed, true);
  assert.equal(r.comfort, 1);
  assert.deepEqual(r.state, { comfort: 1, job: 1, given: {} });
  assert.equal(currentJob(r.state).id, 'dens');
  assert.equal(needed(r.state, 'pine-log'), 0);          // job 2 does not take pine logs
  assert.equal(needed(r.state, 'birch-log'), 8);
});

test('the three jobs run in order, then the camp is finished', () => {
  let s = freshState();
  for (let i = 1; i <= 3; i++) { s = finish(s); assert.equal(s.comfort, i); assert.equal(s.job, i); }
  assert.equal(currentJob(s), null);
  assert.deepEqual(remainingNeeds(s), []);
  assert.equal(progress(s).done, true);
  assert.equal(validateGive({ critters: 8, state: s, item: 'stone', n: 1, have: 9 }).reason, 'done');
  assert.equal(applyGive(s, 'stone', 3).state.comfort, 3);                    // never above the max
});

test('applyGive never mutates its input and ignores surplus', () => {
  const s = freshState();
  const r = applyGive(s, 'pine-log', 99);
  assert.deepEqual(s, { comfort: 0, job: 0, given: {} });
  assert.equal(r.state.given['pine-log'], 10);
  assert.equal(applyGive(s, 'crystal', 5).state.given.crystal, undefined);
});

test('normaliseState: comfort clamped 0..3, job follows comfort, unknown / surplus gifts dropped', () => {
  assert.deepEqual(normaliseState(null), freshState());
  assert.deepEqual(normaliseState('junk'), freshState());
  assert.equal(normaliseState({ comfort: 99 }).comfort, 3);
  assert.equal(normaliseState({ comfort: -4 }).comfort, 0);
  assert.equal(normaliseState({ comfort: 1.9 }).comfort, 1);
  assert.equal(normaliseState({ comfort: 'x' }).comfort, 0);
  assert.equal(normaliseState({ comfort: 1, job: 0 }).job, 1);                 // a job that disagrees with the comfort is corrected
  assert.equal(normaliseState({ comfort: 0, job: 2 }).job, 0);
  const n = normaliseState({ comfort: 0, job: 0, given: { 'pine-log': 4, stone: 99, mint: 3, 'birch-log': -2, crystal: 2 } });
  assert.deepEqual(n.given, { 'pine-log': 4, stone: 8 });                    // mint / crystal are not job 1 materials; stone clamped to the need; negatives dropped
  assert.deepEqual(normaliseState({ comfort: 3, given: { stone: 5 } }), { comfort: 3, job: 3, given: {} });   // nothing to give after the last job
});

test('a half-closed job in a save (every material delivered, comfort not raised) completes on load', () => {
  const n = normaliseState({ comfort: 0, given: { 'pine-log': 10, stone: 8, 'birch-log': 4 } });
  assert.deepEqual(n, { comfort: 1, job: 1, given: {} });
});

test('save round trip: the `camp` key of the shared Frostpine file, other keys untouched', () => {
  const s = give(give(freshState(), 'stone', 3), 'pine-log', 2);
  const saved = buildSave(s);
  assert.deepEqual(saved, { comfort: 0, job: 0, given: { 'pine-log': 2, stone: 3 } });
  const file = { v: 1, critters: { a: { at: 'camp' } }, camp: saved, tails: [1] };
  assert.deepEqual(readSave(file), s);
  assert.deepEqual(readSave({ v: 1 }), freshState());
  assert.deepEqual(readSave(null), freshState());
  assert.deepEqual(hashView(s), saved);
  assert.equal(JSON.stringify(hashView(give(freshState(), 'stone', 1))), JSON.stringify(hashView(give(freshState(), 'stone', 1))));   // stable key order -> equal hashes
});

test('pine-log and birch-log are Frostpine catalog items', () => {
  for (const id of ['pine-log', 'birch-log']) {
    const d = getItem(id);
    assert.ok(d, id);
    assert.deepEqual(d.islands, ['frost']);
    assert.equal(d.kind, 'ingredient');
    assert.ok(d.icon.includes('<svg'));
  }
  assert.notEqual(getItem('pine-log').icon, getItem('log').icon);
  assert.notEqual(getItem('birch-log').icon, getItem('pine-log').icon);
  assert.deepEqual(getItem('log').islands, ['home', 'frost', 'ember']);
});

test('regional trees drop their own building logs; counts unchanged', () => {
  for (const v of ['spruce', 'pine', 'sapling']) assert.equal(lootFor(v).log, 'pine-log', v);
  assert.equal(lootFor('birch').log, 'birch-log');
  for (const v of ['banana', 'coconut', 'jungle', 'bamboo']) assert.equal(lootFor(v).log, 'log', v);
  assert.equal(lootFor('breadfruit').log, 'breadfruit-log');
  assert.deepEqual(LOOT.spruce.logs, [2, 3]);
  assert.deepEqual(LOOT.pine.logs, [2, 3]);
  assert.deepEqual(LOOT.birch.logs, [2, 2]);
  assert.deepEqual(LOOT.sapling.logs, [1, 1]);
  assert.equal(rollCount(LOOT.birch.logs, () => 0.99), 2);
});

test('fuel: plain log first, then pine, then birch; the count is every fuel log', () => {
  assert.deepEqual(FUEL_LOGS, ['log', 'pine-log', 'birch-log', 'breadfruit-log']);
  assert.equal(pickFuelLog((id) => id === 'breadfruit-log' ? 2 : 0), 'breadfruit-log');
  const bag = (o) => (id) => o[id] || 0;
  assert.equal(pickFuelLog(bag({})), null);
  assert.equal(pickFuelLog(bag({ 'birch-log': 2, 'pine-log': 1 })), 'pine-log');
  assert.equal(pickFuelLog(bag({ 'birch-log': 2, 'pine-log': 1, log: 4 })), 'log');
  assert.equal(pickFuelLog(bag({ 'birch-log': 2 })), 'birch-log');
  assert.equal(fuelLogCount(bag({ log: 1, 'pine-log': 2, 'birch-log': 3, stone: 9 })), 6);
  assert.equal(fuelLogCount(bag({})), 0);
});
