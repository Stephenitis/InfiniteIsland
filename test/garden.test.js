// Step 37b: the garden's pure rules (game/gardenLogic.js): plot numbering, which plots are usable per stage, normalising and the save form.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EMBER_GARDEN, ISLANDS } from '../public/js/config.js';
import {
  PLOTS, PLOT_COUNT, STAGES, plotOpenStage, isUsable, usableList, usableCount, freshState, normalisePlot, normaliseState, withPlot, plotPrompt, buildSave, readSave, hashView,
} from '../public/js/game/gardenLogic.js';
import { gardenReserved } from '../public/js/world/islands/emberGarden.js';
import { getIslandModule } from '../public/js/world/islands/registry.js';

test('16 plots over three tiers, numbered top row first', () => {
  assert.equal(PLOT_COUNT, 16);
  assert.deepEqual(PLOTS.map((p) => p.tier), [...Array(6).fill('top'), ...Array(4).fill('middle'), ...Array(6).fill('bottom')]);
  assert.deepEqual(PLOTS.map((p) => p.i), [...Array(16).keys()]);
  assert.deepEqual(STAGES, ['empty', 'seed', 'sprout', 'bud', 'bloom']);
});

test('the reserved spots match the plot numbering (emberGarden.js)', () => {
  const island = ISLANDS.find((i) => i.id === 'ember');
  const res = gardenReserved(island, getIslandModule('ember'));
  assert.equal(res.plots.length, PLOT_COUNT);
  res.plots.forEach((p, i) => { assert.equal(p.i, i); assert.equal(p.tier, PLOTS[i].tier); assert.equal(p.usable, PLOTS[i].open); });
});

test('4 plots are usable at stage 0, 8 at stage 1 and all 16 from stage 2', () => {
  assert.equal(usableCount(0), 4);
  assert.deepEqual(usableList(0), [11, 12, 13, 14]);
  assert.equal(usableCount(1), 8);
  assert.deepEqual(usableList(1), [6, 7, 8, 9, 11, 12, 13, 14]);
  assert.equal(usableCount(2), 16);
  assert.equal(usableCount(3), 16);
  assert.equal(usableCount(99), 16);                      // clamped
  assert.equal(usableCount(-4), 4);
  assert.equal(plotOpenStage(0), 2);
  assert.equal(plotOpenStage(7), 1);
  assert.equal(plotOpenStage(12), 0);
  assert.equal(plotOpenStage(15), 2);
  assert.equal(plotOpenStage(16), Infinity);
  assert.ok(!isUsable(0, 3) && isUsable(0, 11));
  assert.deepEqual(EMBER_GARDEN.tiers.map((t) => t.open.length), [0, 0, 4]);
});

test('a fresh state is stage 0, 16 empty plots, no seeds', () => {
  const s = freshState();
  assert.equal(s.stage, 0);
  assert.equal(s.plots.length, 16);
  assert.ok(s.plots.every((p) => p.stage === 'empty' && p.flower === null));
  assert.deepEqual(s.seeds, []);
});

test('normalising repairs anything malformed', () => {
  assert.deepEqual(normaliseState(null), freshState());
  assert.deepEqual(normaliseState('x'), freshState());
  assert.deepEqual(normalisePlot({ flower: 'ember-lily', stage: 'bloom' }), { flower: 'ember-lily', stage: 'bloom' });
  assert.deepEqual(normalisePlot({ flower: null, stage: 'bloom' }), { flower: null, stage: 'empty' });   // a growing plot needs a flower
  assert.deepEqual(normalisePlot({ flower: 'x', stage: 'wilted' }), { flower: null, stage: 'empty' });
  assert.deepEqual(normalisePlot({ flower: 'x'.repeat(80), stage: 'bud' }), { flower: null, stage: 'empty' });
  const s = normaliseState({ stage: 9, plots: { 2: { flower: 'a', stage: 'sprout' }, 40: { flower: 'b', stage: 'bud' } }, seeds: ['b', 'a', 'a', 3, ''] });
  assert.equal(s.stage, 3);
  assert.deepEqual(s.plots[2], { flower: 'a', stage: 'sprout' });
  assert.equal(s.plots.length, 16);
  assert.deepEqual(s.seeds, ['a', 'b']);
  assert.equal(normaliseState({ stage: -2 }).stage, 0);
});

test('withPlot is pure and ignores bad indexes', () => {
  const s = freshState();
  const t = withPlot(s, 11, { flower: 'moon-orchid', stage: 'bud' });
  assert.equal(s.plots[11].stage, 'empty');
  assert.deepEqual(t.plots[11], { flower: 'moon-orchid', stage: 'bud' });
  assert.equal(withPlot(s, 16, { flower: 'a', stage: 'bud' }), s);
  assert.equal(withPlot(s, 1.5, { flower: 'a', stage: 'bud' }), s);
  assert.deepEqual(withPlot(t, 11, { stage: 'empty' }).plots[11], { flower: null, stage: 'empty' });
});

test('prompts: Plant on a usable empty plot, Tend a planted seed, Take cutting on a fresh bloom, Look at the rest', () => {
  let s = freshState();
  assert.equal(plotPrompt(s, 11), 'Plant');
  assert.equal(plotPrompt(s, 0), 'Look');
  s = withPlot(s, 11, { flower: 'a', stage: 'seed' });
  assert.equal(plotPrompt(s, 11), 'Tend');
  s = withPlot(s, 11, { flower: 'a', stage: 'sprout' });
  assert.equal(plotPrompt(s, 11), 'Look');
  s = withPlot(s, 11, { flower: 'a', stage: 'bud' });
  assert.equal(plotPrompt(s, 11), 'Look');
  assert.equal(plotPrompt({ ...s, stage: 1 }, 7), 'Plant');
  s = withPlot(s, 11, { flower: 'a', stage: 'bloom' });
  assert.equal(plotPrompt(s, 11), 'Take cutting');
  s = withPlot(s, 11, { flower: 'a', stage: 'bloom', cut: true });
  assert.equal(plotPrompt(s, 11), 'Look');
  assert.equal(plotPrompt({ ...s, stage: 2 }, 0), 'Plant');
});

test('the save form round-trips and only lists planted plots', () => {
  let s = freshState();
  s = withPlot(s, 3, { flower: 'sunbell', stage: 'bloom' });
  s = { ...s, stage: 2, seeds: ['sunbell', 'ember-lily'] };
  const save = buildSave(s);
  assert.deepEqual(Object.keys(save.plots), ['3']);
  assert.deepEqual(readSave(JSON.parse(JSON.stringify(save))), { ...s, seeds: ['ember-lily', 'sunbell'] });
  assert.deepEqual(hashView(freshState()), { stage: 0, plots: {}, seeds: [], sown: [], cuttings: [] });
  assert.ok(!('phase' in hashView({ ...s, phase: 'night' })), 'the host-private growth counter is not part of the sync hash');
  assert.deepEqual(readSave(undefined), freshState());
});
