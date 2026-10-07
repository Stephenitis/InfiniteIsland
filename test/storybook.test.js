// Step 48: Storybook Cay, Quill, the story bridge's two-material cost and the host-owned page rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGE, STAND_REACH, setPageHalfLength, inPage, inPageArea, pageSpawn, pageExit, standFront, freshState, normaliseState, hashView,
  validateEnter, validateExit, applyEnter, applyExit, exitOffered,
} from '../public/js/game/storybookLogic.js';
import { PAGES, getPage } from '../public/js/game/pages/index.js';
import { chapterOf as chapterOfPage, pageOpen } from '../public/js/game/chapters.js';
import { quillPresent, quillMode, npcsPresent } from '../public/js/game/npcLogic.js';
import { costOf, costPhases, itemAt, phaseLeft, validateGift, normaliseEntry, stageOf } from '../public/js/game/bridgeLogic.js';
import { travelAllowed } from '../public/js/game/travelLogic.js';
import { getToolAction } from '../public/js/items/tools.js';
import { getHeight, isWalkable, regionOf } from '../public/js/world/terrain.js';
import { BRIDGES, ISLANDS, NPCS, STORY } from '../public/js/config.js';

const CAY = ISLANDS.find((i) => i.id === 'story');
const STORY_BRIDGE = BRIDGES.find((b) => b.id === 'story');
const STANDS = STORY.stands.map((s) => ({ ...s, x: CAY.x + s.x, z: CAY.z + s.z }));
const chapterOf = (id) => chapterOfPage(id);
const at = (x, z) => ({ pos: { x, z } });

test('Storybook Cay sits west of home, clear of the other islands and the pocket spaces', () => {
  assert.ok(CAY.x < -100, 'west of home');
  for (const o of ISLANDS.filter((i) => i.id !== 'story')) assert.ok(Math.hypot(o.x - CAY.x, o.z - CAY.z) > o.radius + CAY.radius + 20, `clear of ${o.id}`);
  assert.ok(Math.abs(PAGE.x - CAY.x) > 500, 'the page pocket is far from the Cay');
});

test('the reading nook is flat and walkable; the stand, Quill and the landing are on the Cay', () => {
  const h0 = getHeight(CAY.x + STORY.pad.x, CAY.z + STORY.pad.z);
  for (const [dx, dz] of [[0, 0], [4, 3], [-5, 2], [3, -4]]) {
    const h = getHeight(CAY.x + STORY.pad.x + dx, CAY.z + STORY.pad.z + dz);
    assert.ok(Math.abs(h - h0) < 0.05, `pad level at (${dx}, ${dz})`);
  }
  for (const s of STANDS) { assert.ok(isWalkable(s.x, s.z + 2)); assert.equal(regionOf(s.x, s.z), 'story'); }
  const q = NPCS.quill.nook;
  assert.ok(isWalkable(q.x + 1.5, q.z));
  assert.equal(regionOf(STORY_BRIDGE.bx, STORY_BRIDGE.bz), 'story');
  assert.ok(!isWalkable(CAY.x - CAY.radius - 25, CAY.z), 'open sea beyond the coast');
});

test('the page pocket is one flat lane belonging to the Cay', () => {
  assert.ok(inPage(PAGE.x, PAGE.z));
  assert.ok(!inPage(PAGE.x, PAGE.z + PAGE.laneHalf + 0.5), 'the lane is narrow');
  assert.ok(isWalkable(PAGE.x + 10, PAGE.z));
  assert.ok(!isWalkable(PAGE.x, PAGE.z + 5));
  assert.equal(getHeight(PAGE.x - 12, PAGE.z), PAGE.y);
  assert.equal(regionOf(PAGE.x, PAGE.z), 'story');
  assert.ok(inPageArea(PAGE.x + 20, PAGE.z + 3) && !inPageArea(CAY.x, CAY.z));
});

test('every page spawns and exits on its own lane', () => {
  assert.ok(PAGES.size >= 1);
  for (const page of PAGES.values()) {
    setPageHalfLength(page.length / 2);
    assert.equal(getPage(page.id), page);
    for (let slot = 0; slot < 4; slot++) { const s = pageSpawn(page, slot); assert.ok(inPage(s.x, s.z), `${page.id} spawn ${slot}`); }
    const e = pageExit(page); assert.ok(inPage(e.x, e.z), `${page.id} exit`);
    assert.ok(page.exitX > page.spawnX);
  }
  assert.equal(getPage('nope'), null);
});

test('leaving a page puts every slot back on walkable ground by its stand', () => {
  for (const s of STANDS) for (let slot = 0; slot < 4; slot++) {
    const p = standFront(s, slot);
    assert.ok(isWalkable(p.x, p.z), `slot ${slot}`);
    assert.ok(Math.hypot(p.x - s.x, p.z - s.z) < STAND_REACH);
  }
});

test('opening a page: one at a time, a known page, only from its stand', () => {
  const page = 'orchard-hop', s = STANDS[0];                      // (Step 52a: a stand opens a CHAPTER: the Meadow stand opens the Meadow pages, the Frostpine lectern none yet)
  let state = freshState();
  const base = { state, pages: PAGES, stands: STANDS, chapterOf, isOpen: (id) => pageOpen({ pages: {} }, id) };
  assert.deepEqual(validateEnter({ ...base, pageId: page, actor: at(s.x, s.z + 2) }), { ok: true, stand: s });
  assert.equal(validateEnter({ ...base, pageId: page, actor: at(s.x + 20, s.z) }).reason, 'far');
  assert.equal(validateEnter({ ...base, pageId: page, actor: at(STANDS[1].x - 3, STANDS[1].z) }).reason, 'far', 'the Frostpine lectern opens no Meadow page');
  assert.equal(validateEnter({ ...base, pageId: 'woodcutters-way', actor: at(s.x, s.z + 2) }).reason, 'locked', 'page 2 waits for page 1');
  assert.equal(validateEnter({ ...base, isOpen: (id) => pageOpen({ pages: { 'orchard-hop': { cleared: true } } }, id), pageId: 'woodcutters-way', actor: at(s.x, s.z + 2) }).ok, true);
  assert.equal(validateEnter({ ...base, pageId: 'nope', actor: at(s.x, s.z) }).reason, 'bad-request');
  assert.equal(validateEnter({ ...base, pageId: page, actor: null }).reason, 'bad-request');
  assert.deepEqual(validateEnter({ state, pageId: page, pages: PAGES, actor: at(s.x, s.z + 2), stands: [{ page, x: s.x, z: s.z }] }).ok, true, 'a stand that names one page still works');
  state = applyEnter(state, page);
  assert.deepEqual(state, { active: true, page, serial: 1 });
  assert.equal(validateEnter({ ...base, state, pageId: page, actor: at(s.x, s.z) }).reason, 'busy');
});

test('closing the book: only from inside, near the back-cover ribbon', () => {
  const page = getPage('orchard-hop'), e = pageExit(page);
  assert.equal(validateExit({ state: freshState(), actor: at(e.x, e.z), pages: PAGES }).reason, 'idle');
  const state = applyEnter(freshState(), page.id);
  assert.deepEqual(validateExit({ state, actor: at(e.x, e.z), pages: PAGES }), { ok: true });
  assert.equal(validateExit({ state, actor: at(pageSpawn(page).x, PAGE.z), pages: PAGES }).reason, 'far');
  assert.equal(validateExit({ state, actor: at(CAY.x, CAY.z), pages: PAGES }).reason, 'outside');
  assert.deepEqual(applyExit(state), { active: false, page: null, serial: 2 });
});

test('page state from the wire / a late snapshot is normalised', () => {
  assert.deepEqual(normaliseState(null, PAGES), { active: false, page: null, serial: 0 });
  assert.deepEqual(normaliseState({ active: true, page: 'nope', serial: 4 }, PAGES), { active: false, page: null, serial: 4 });
  assert.deepEqual(normaliseState({ active: true, page: 'orchard-hop', serial: '3' }, PAGES), { active: true, page: 'orchard-hop', serial: 3 });
  assert.deepEqual(normaliseState({ active: false, page: 'orchard-hop', serial: -2 }, PAGES), { active: false, page: null, serial: 0 });
  const s = applyEnter(freshState(), 'orchard-hop');
  assert.deepEqual(hashView(normaliseState(JSON.parse(JSON.stringify(s)), PAGES)), hashView(s));
});

test('Quill arrives once both other bridges are built, and moves to the book once his own is open', () => {
  assert.equal(quillPresent({}), false);
  assert.equal(quillPresent({ frostBuilt: true }), false);
  assert.equal(quillPresent({ emberBuilt: true }), false);
  assert.equal(quillPresent({ frostBuilt: true, emberBuilt: true }), true);
  assert.equal(quillPresent({ storyBuilt: true }), true);
  assert.equal(quillPresent({ forced: true }), true);
  assert.equal(npcsPresent(9, { id: 'quill', bridges: { frostBuilt: true } }), false, 'not on the feast count');
  assert.equal(npcsPresent(0, { id: 'quill', bridges: { frostBuilt: true, emberBuilt: true } }), true);
  assert.equal(quillMode({}), 'bridge');
  assert.equal(quillMode({ storyOpen: true }), 'nook');
  assert.equal(NPCS.quill.bridge, 'story');
});

test('the story bridge takes 15 stone, then 15 logs, in the usual four stages', () => {
  assert.deepEqual(costPhases(STORY_BRIDGE), [{ item: 'stone', count: 15 }, { item: 'log', count: 15 }]);
  assert.deepEqual(costOf(STORY_BRIDGE), { item: 'stone', total: 30 });
  assert.equal(itemAt(STORY_BRIDGE, 0), 'stone');
  assert.equal(itemAt(STORY_BRIDGE, 14), 'stone');
  assert.equal(itemAt(STORY_BRIDGE, 15), 'log');
  assert.equal(phaseLeft(STORY_BRIDGE, 10), 5);
  assert.equal(phaseLeft(STORY_BRIDGE, 30), 0);
  assert.equal(stageOf(15, 30), 2, 'the stone phase ends exactly at stage 2');
  const entry = { given: 10, stage: 1, built: false };
  assert.deepEqual(validateGift({ feasts: 2, entry, total: 30, have: 99, n: 99, cap: phaseLeft(STORY_BRIDGE, 10) }), { ok: true, n: 5 }, 'a gift never spans two materials');
  // single-material bridges are unchanged
  const frost = BRIDGES.find((b) => b.id === 'frost');
  assert.deepEqual(costPhases(frost), [{ item: 'stone', count: 30 }]);
  assert.equal(itemAt(frost, 29), 'stone');
});

test('old bridge saves without the story bridge load as a fresh entry', () => {
  assert.deepEqual(normaliseEntry(undefined, 30), { given: 0, stage: 0, built: false });
  assert.deepEqual(normaliseEntry({ given: 99, built: true }, 30), { given: 30, stage: 4, built: true });
});

test('travel to the Cay needs its bridge; the book stand is a plain Read even with a tool', () => {
  assert.equal(travelAllowed('story', () => false), false);
  assert.equal(travelAllowed('story', (id) => id === 'story'), true);
  for (const tool of ['axe', 'hammer', 'shovel', 'sword']) { assert.equal(getToolAction({ state: 'held', kind: tool }, { type: 'bookstand' }), null); }
  assert.equal(getToolAction({ state: 'held', kind: 'axe' }, { type: 'tree' }), 'chop', 'the probe really checks the tool table');
});

test('only the open page ribbon is offered (Step 52c)', () => {
  const open = { active: true, page: 'a' };
  const exits = new Map([['a', { id: 'ea' }], ['b', { id: 'eb' }]]);
  const offered = (state, it) => exitOffered(state, exits.get(state.page) === it);
  assert.equal(offered(open, exits.get('a')), true);
  assert.equal(offered(open, exits.get('b')), false, 'another ribbon is never offered');
  assert.equal(offered({ active: false, page: null }, exits.get('a')), false, 'none on the Cay');
});
