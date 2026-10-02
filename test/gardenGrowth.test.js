// Step 38b: planting, tending, cuttings and the night-growth clock (game/gardenLogic.js), plus the loot / catalog additions and the flowers' tending items.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshState, normaliseState, withPlot, buildSave, readSave,
  plantOptions, checkPlant, doPlant, checkTend, doTend, checkCut, doCut, phasesEntered, reconcilePhase, advancePlot, growPhases, growNights, plantGuidePages, PHASE_ORDER,
} from '../public/js/game/gardenLogic.js';
import { FLOWERS, TEND_ITEMS, TEND_INFO, tendItemOf } from '../public/js/game/flowers.js';
import { getItem } from '../public/js/game/catalog.js';
import { LOOT, rollCount } from '../public/js/world/lootTable.js';

const stocked = (seeds = ['ember-lily', 'moon-orchid']) => ({ ...freshState(), seeds });

test('planting: a found seed can be planted ONCE; the plot must be usable and empty', () => {
  let s = stocked();
  assert.deepEqual(plantOptions(s), [{ flower: 'ember-lily', kind: 'seed', n: 1 }, { flower: 'moon-orchid', kind: 'seed', n: 1 }]);
  assert.equal(checkPlant(s, 11, 'ember-lily', 'seed').ok, true);
  assert.equal(checkPlant(s, 0, 'ember-lily', 'seed').reason, 'locked');
  assert.equal(checkPlant(s, 99, 'ember-lily', 'seed').reason, 'bad-plot');
  assert.equal(checkPlant(s, 11, 'sunbell', 'seed').reason, 'no-seed');
  assert.equal(checkPlant(s, 11, 'nope', 'seed').reason, 'unknown');
  assert.equal(checkPlant(s, 11, 'ember-lily', 'cutting').reason, 'no-cutting');
  s = doPlant(s, 11, 'ember-lily', 'seed');
  assert.deepEqual(s.plots[11], { flower: 'ember-lily', stage: 'seed' });
  assert.deepEqual(s.sown, ['ember-lily']);
  assert.equal(checkPlant(s, 12, 'ember-lily', 'seed').reason, 'no-seed');          // the seed is used up
  assert.equal(checkPlant(s, 11, 'moon-orchid', 'seed').reason, 'occupied');         // a race on one plot: the second request is refused
  assert.deepEqual(plantOptions(s), [{ flower: 'moon-orchid', kind: 'seed', n: 1 }]);
  assert.equal(doPlant(s, 12, 'ember-lily', 'seed'), s);                            // a refused plant changes nothing
});

test('tending: only a planted, untended seed; the item is the flower\'s own; it makes a sprout', () => {
  let s = doPlant(stocked(), 11, 'moon-orchid', 'seed');
  assert.deepEqual(checkTend(s, 11), { ok: true, item: 'taro' });
  assert.equal(checkTend(s, 12).reason, 'not-seed');
  s = doTend(s, 11);
  assert.deepEqual(s.plots[11], { flower: 'moon-orchid', stage: 'sprout' });
  assert.equal(checkTend(s, 11).reason, 'not-seed');
  assert.equal(doTend(s, 11), s);
  assert.equal(checkTend(doPlant(stocked(), 12, 'ember-lily', 'seed'), 12).item, 'ash');
});

test('a seed stays a seed: no phase grows an untended plant, a bloom stays a bloom', () => {
  let s = doPlant(stocked(), 11, 'moon-orchid', 'seed');
  for (let n = 0; n < 3; n++) s = growNights(s, 1).state;
  assert.equal(s.plots[11].stage, 'seed');
  let b = withPlot(freshState(), 11, { flower: 'a', stage: 'bloom' });
  b = growNights(b, 5).state;
  assert.equal(b.plots[11].stage, 'bloom');
});

test('growth: sprout -> bud at the next dusk -> bloom at the next dawn', () => {
  const sprout = withPlot(freshState(), 11, { flower: 'sunbell', stage: 'sprout' });
  assert.deepEqual(PHASE_ORDER, ['dawn', 'day', 'dusk', 'night']);
  let r = growPhases(sprout, 'day', 'dusk');
  assert.equal(r.state.plots[11].stage, 'bud'); assert.deepEqual(r.changed, [11]);
  r = growPhases(r.state, 'dusk', 'night');
  assert.equal(r.state.plots[11].stage, 'bud'); assert.deepEqual(r.changed, []);
  r = growPhases(r.state, 'night', 'dawn');
  assert.equal(r.state.plots[11].stage, 'bloom'); assert.deepEqual(r.changed, [11]);
  assert.equal(growPhases(r.state, 'dawn', 'day').state, r.state);
  // a plot tended at night waits for the NEXT dusk (the dawn in between does nothing to a sprout)
  r = growPhases(sprout, 'night', 'dawn');
  assert.equal(r.state.plots[11].stage, 'sprout');
  r = growPhases(r.state, 'dawn', 'dusk');
  assert.equal(r.state.plots[11].stage, 'bud');
  assert.equal(advancePlot({ flower: 'a', stage: 'bud' }, 'dusk').stage, 'bud');
  assert.equal(advancePlot({ flower: 'a', stage: 'sprout' }, 'dawn').stage, 'sprout');
});

test('growNights: n whole nights; the debug grow', () => {
  const sprout = withPlot(freshState(), 11, { flower: 'sunbell', stage: 'sprout' });
  assert.equal(growNights(sprout, 1).state.plots[11].stage, 'bloom');
  assert.equal(growNights(sprout, 0).state, sprout);
  assert.equal(growNights(sprout, -3).state, sprout);
});

test('the phase counter: only FORWARD boundaries count, so a replay can never double-count or skip a night', () => {
  assert.deepEqual(phasesEntered('day', 'dusk'), ['dusk']);
  assert.deepEqual(phasesEntered('day', 'dawn'), ['dusk', 'night', 'dawn']);
  assert.deepEqual(phasesEntered('night', 'day'), ['dawn', 'day']);
  assert.deepEqual(phasesEntered('dusk', 'dusk'), []);                                // a replayed boundary: ignored
  assert.deepEqual(phasesEntered('dusk', 'bogus'), []);
  assert.deepEqual(phasesEntered(null, 'dusk'), []);
  // a host whose clock (saved every ~5 s) restores one phase BEHIND the garden's saved phase and replays the boundary
  let s = withPlot(freshState(), 11, { flower: 'a', stage: 'sprout' });
  s = growPhases(s, 'day', 'dusk').state;                                            // dusk counted: a bud
  assert.equal(s.plots[11].stage, 'bud');
  const phase = reconcilePhase('dusk', 'day');                                       // reload: clock restored in 'day', garden saved 'dusk'
  assert.equal(phase, 'dusk');
  assert.equal(growPhases(s, phase, 'dusk').state, s);                               // the clock re-enters dusk: nothing
  s = growPhases(s, 'dusk', 'night').state;
  assert.equal(s.plots[11].stage, 'bud');                                            // the night does nothing yet
  s = growPhases(s, 'night', 'dawn').state;
  assert.equal(s.plots[11].stage, 'bloom');                                          // exactly one night
  // the same reload mid-NIGHT: the saved phase is night, the clock replays night, then dawn counts once
  const mid = withPlot(freshState(), 11, { flower: 'a', stage: 'bud' });
  assert.equal(reconcilePhase('night', 'dusk'), 'night');
  assert.equal(growPhases(mid, 'night', 'night').state, mid);
  assert.equal(growPhases(mid, 'night', 'dawn').state.plots[11].stage, 'bloom');
});

test('reconcilePhase: keep the saved phase when the clock is on it or one before it; otherwise adopt the clock (no offline catch-up)', () => {
  assert.equal(reconcilePhase('night', 'night'), 'night');
  assert.equal(reconcilePhase('night', 'dusk'), 'night');
  assert.equal(reconcilePhase('dusk', 'night'), 'night');                            // the clock is AHEAD: nothing is caught up
  assert.equal(reconcilePhase('day', 'night'), 'night');                             // e.g. a ?time=night jump
  assert.equal(reconcilePhase(null, 'dawn'), 'dawn');                                // a fresh / old save
  assert.equal(reconcilePhase('x', 'day'), 'day');
  assert.equal(reconcilePhase('night', null), 'night');
  assert.equal(reconcilePhase(undefined, undefined), 'day');
  const sprout = withPlot(freshState(), 11, { flower: 'a', stage: 'sprout' });
  const adopted = reconcilePhase('day', 'night');
  assert.equal(growPhases(sprout, adopted, 'night').state, sprout);                  // the boundaries between the old phase and the adopted one are NOT counted
});

test('under daylock the clock never changes phase, so nothing is counted', () => {
  const s = withPlot(freshState(), 11, { flower: 'a', stage: 'sprout' });
  assert.equal(growPhases(s, 'day', 'day').state, s);
  assert.deepEqual(growPhases(s, 'day', 'day').changed, []);
});

test('cuttings: one per bloom, kept in stock, planted as a rooted sprout in a second plot; the first plant keeps blooming', () => {
  let s = { ...stocked(['sunbell']), stage: 2 };
  s = doPlant(s, 11, 'sunbell', 'seed');
  assert.equal(checkCut(s, 11).reason, 'not-bloom');
  s = growNights(doTend(s, 11), 1).state;
  assert.equal(s.plots[11].stage, 'bloom');
  assert.equal(checkCut(s, 11).ok, true);
  s = doCut(s, 11);
  assert.deepEqual(s.plots[11], { flower: 'sunbell', stage: 'bloom', cut: true });
  assert.deepEqual(s.cuttings, ['sunbell']);
  assert.equal(checkCut(s, 11).reason, 'cut');                                       // once per bloom
  assert.equal(doCut(s, 11), s);
  assert.deepEqual(plantOptions(s), [{ flower: 'sunbell', kind: 'cutting', n: 1 }]); // the seed is used, the cutting is in stock
  assert.equal(checkPlant(s, 12, 'sunbell', 'seed').reason, 'no-seed');
  assert.equal(checkPlant(s, 12, 'sunbell', 'cutting').ok, true);
  s = doPlant(s, 12, 'sunbell', 'cutting');
  assert.deepEqual(s.plots[12], { flower: 'sunbell', stage: 'sprout' });             // a cutting arrives rooted: no tending item needed
  assert.deepEqual(s.cuttings, []);
  assert.equal(s.plots[11].stage, 'bloom');
  assert.equal(growNights(s, 1).state.plots[12].stage, 'bloom');
  assert.equal(checkPlant(s, 12, 'sunbell', 'cutting').reason, 'occupied');
});

test('save normalisation: the new fields survive, junk does not', () => {
  const n = normaliseState({ stage: 1, plots: { 3: { flower: 'a', stage: 'bloom', cut: 1 }, 4: { flower: 'b', stage: 'sprout', cut: true } }, seeds: ['b', 'a'], sown: ['a', 'a', 7], cuttings: ['z', '', 'a'], phase: 'night' });
  assert.deepEqual(n.plots[3], { flower: 'a', stage: 'bloom', cut: true });
  assert.deepEqual(n.plots[4], { flower: 'b', stage: 'sprout' });                    // `cut` only means something on a bloom
  assert.deepEqual(n.sown, ['a']);
  assert.deepEqual(n.cuttings, ['a', 'z']);
  assert.equal(n.phase, 'night');
  assert.equal(normaliseState({ phase: 'noon' }).phase, null);
  assert.deepEqual(readSave(JSON.parse(JSON.stringify(buildSave(n)))), n);
  assert.equal(normaliseState({ cuttings: Array(50).fill('a') }).cuttings.length, 16);
  assert.deepEqual(readSave({ stage: 0, plots: { 11: { flower: 'sunbell', stage: 'sprout' } }, seeds: ['sunbell'] }).sown, []);   // a 38a save (no sown / cuttings / phase) still loads
});

test("Mossback's planting guidance names what can be planted and what each plant needs next", () => {
  assert.equal(plantGuidePages(freshState()), null);
  let s = doPlant({ ...stocked(['moon-orchid', 'ember-lily']), stage: 1 }, 11, 'moon-orchid', 'seed');
  assert.match(plantGuidePages(s).join(' '), /Ember Lily seeds/);
  assert.match(plantGuidePages(s).join(' '), /Moon Orchid seed needs taro/);
  assert.match(plantGuidePages(s).join(' '), /digging for it with a shovel/);
  s = doTend(s, 11);
  assert.match(plantGuidePages(s).join(' '), /Moon Orchid sprout will close into a bud/);
  s = growPhases(s, 'day', 'dusk').state;
  assert.match(plantGuidePages(s).join(' '), /bud will open at dawn/);
  s = growPhases(s, 'night', 'dawn').state;
  assert.match(plantGuidePages(s).join(' '), /Take a cutting/);
  s = doCut(s, 11);
  assert.match(plantGuidePages(s).join(' '), /cuttings of Moon Orchid/);
  assert.match(plantGuidePages(s).join(' '), /cutting is already taken/);
});

test('the four tending items: every flower needs one, two flowers each, with a hint and a catalog entry', () => {
  assert.deepEqual([...new Set(FLOWERS.map((f) => f.tend))].sort(), [...TEND_ITEMS].sort());
  for (const id of TEND_ITEMS) {
    assert.equal(FLOWERS.filter((f) => f.tend === id).length, 2, id);
    assert.ok(TEND_INFO[id].name && TEND_INFO[id].where, id);
    assert.deepEqual(getItem(id).islands, ['ember'], id);
    assert.ok(getItem(id).icon.includes('<svg') && !/[\u{1F300}-\u{1FAFF}]/u.test(getItem(id).icon), `${id} icon`);
  }
  assert.equal(getItem('spring-water').name, 'Coconut of Spring Water');
  assert.equal(tendItemOf('nope'), null);
});

test('loot: basalt crumbles to 1-2 ash on top of stone + obsidian; felled banana trees leave mulch next to their logs', () => {
  assert.deepEqual(LOOT.basalt.ash, [1, 2]);
  assert.deepEqual(LOOT.basalt.stone, [1, 2]);
  assert.equal(LOOT.basalt.extra.item, 'obsidian');
  assert.deepEqual(LOOT.banana.fell, { item: 'mulch', chance: 1, count: [1, 2] });
  assert.deepEqual(LOOT.banana.logs, [2, 3]);
  const seen = new Set();
  for (let i = 0; i < 100; i++) seen.add(rollCount(LOOT.basalt.ash));
  assert.deepEqual([...seen].sort(), [1, 2]);
});
