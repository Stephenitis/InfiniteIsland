// Step 52a: chapters (page gating, the secret page, the badge and the one-time reward), the Journal's sticker data, the Cay's pop-up spots and the page track.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAPTERS, chapterById, chapterOf, chapterEntries, pageOpen, secretUnlocked, chapterBadge, rewardDue, popupsOf, stickers,
} from '../public/js/game/chapters.js';
import { PAGES, getPage } from '../public/js/game/pages/index.js';
import { normaliseProgress, mergeClear, freshRun, applyCollect, LETTERS, progressView, STORAGE_KEY } from '../public/js/game/storybookLogic.js';
import { Music, getTrack, trackInfo, REGION_TRACKS } from '../public/js/audio/music.js';
import { buildStoryLayout } from '../public/js/world/islands/storyLayout.js';
import { getIslandModule } from '../public/js/world/islands/registry.js';
import { isWalkable } from '../public/js/world/terrain.js';
import { ISLANDS, STORY, CHAPTER_REWARD } from '../public/js/config.js';
import { getItem } from '../public/js/game/catalog.js';

const meadow = chapterById('meadow');
const clear = (progress, id, { letters = [], secret = false } = {}) => {
  const page = getPage(id);
  let run = freshRun();
  for (const c of letters) run = applyCollect(run, page, 'letter', c).run;
  run = applyCollect(run, page, secret ? 'secret' : 'goal', 0).run;
  return mergeClear(progress, page, run);
};

test('a chapter lists its pages in order: page 1 is open, page N opens once page N-1 is cleared, cleared pages replay', () => {
  assert.deepEqual(meadow.pages, ['orchard-hop', 'woodcutters-way', 'kite-hill', 'tidepool-run']);
  for (const id of [...meadow.pages, meadow.secret]) assert.ok(PAGES.has(id), id);
  let progress = normaliseProgress(null, PAGES);
  const open = () => chapterEntries(progress, meadow).filter((e) => e.open).map((e) => e.id);
  assert.deepEqual(open(), ['orchard-hop']);
  assert.ok(!pageOpen(progress, 'woodcutters-way') && !pageOpen(progress, 'tidepool-run') && !pageOpen(progress, 'hidden-orchard'));
  progress = clear(progress, 'orchard-hop');
  assert.deepEqual(open(), ['orchard-hop', 'woodcutters-way']);
  assert.ok(chapterEntries(progress, meadow).find((e) => e.id === 'orchard-hop').cleared, 'a cleared page replays');
  progress = clear(progress, 'woodcutters-way'); progress = clear(progress, 'kite-hill');
  assert.deepEqual(open(), meadow.pages.slice(0, 4));
  assert.ok(pageOpen(progress, 'tidepool-run') && !pageOpen(progress, 'hidden-orchard'));
  assert.equal(pageOpen(progress, 'not-a-chapter-page'), true, 'a page outside every chapter (a debug page) is never gated');
  assert.equal(chapterOf('kite-hill').id, 'meadow'); assert.equal(chapterOf('hidden-orchard').id, 'meadow'); assert.equal(chapterOf('nope'), null);
  // the chapter's gating comes from the saved progress alone, so it survives the wire and a reload
  const back = normaliseProgress(JSON.parse(JSON.stringify(progress)), PAGES);
  assert.deepEqual(chapterEntries(back, meadow), chapterEntries(progress, meadow));
  // the second chapter is reserved: no pages yet, never gating anything
  assert.deepEqual(chapterById('frostpine').pages, ['snowy-steps', 'sled-run', 'aurora-night']); assert.ok(!chapterById('frostpine').soon);
});

test('a secret exit clears its page, unlocks the secret page entry and the Cay\'s windmill; nothing else does', () => {
  let progress = normaliseProgress(null, PAGES);
  assert.ok(!secretUnlocked(progress, meadow)); assert.deepEqual(popupsOf(progress), { windmill: false, sunflower: false, snowglobe: false });
  progress = clear(progress, 'orchard-hop'); progress = clear(progress, 'woodcutters-way');
  assert.ok(!secretUnlocked(progress, meadow), 'ordinary clears do not');
  progress = clear(progress, 'kite-hill', { secret: true });
  assert.equal(progress.pages['kite-hill'].cleared, true); assert.equal(progress.pages['kite-hill'].secret, true);
  assert.ok(secretUnlocked(progress, meadow) && pageOpen(progress, 'hidden-orchard'));
  assert.equal(popupsOf(progress).windmill, true); assert.equal(popupsOf(progress).sunflower, false);
  // the secret page itself never gates and holds no letters
  assert.equal(getPage('hidden-orchard').letters.length, 0);
});

test('the chapter badge needs every letter of the four Meadow pages; its reward is due once and stays given', () => {
  let progress = normaliseProgress(null, PAGES);
  for (const id of meadow.pages) { assert.ok(!chapterBadge(progress, meadow)); progress = clear(progress, id, { letters: id === 'tidepool-run' ? LETTERS.slice(0, 4) : LETTERS }); }
  assert.ok(!chapterBadge(progress, meadow) && !rewardDue(progress, meadow), 'one letter short');
  progress = clear(progress, 'tidepool-run', { letters: ['T'] });
  assert.ok(chapterBadge(progress, meadow) && rewardDue(progress, meadow));
  // the host marks it given before handing anything out: idempotent forever, saved
  progress = { ...progress, rewards: { ...progress.rewards, meadow: true } };
  assert.ok(!rewardDue(progress, meadow)); assert.ok(chapterBadge(progress, meadow));
  assert.equal(popupsOf(progress).sunflower, true);
  progress = clear(progress, 'orchard-hop', { letters: LETTERS });
  assert.ok(!rewardDue(progress, meadow), 'clearing again never re-awards');
  const wire = normaliseProgress(JSON.parse(JSON.stringify(progress)), PAGES);
  assert.deepEqual(wire.rewards, { meadow: true }); assert.ok(!rewardDue(wire, meadow));
  assert.equal(JSON.stringify(progressView(wire)), JSON.stringify(progressView(progress)));
  assert.deepEqual(normaliseProgress({ rewards: { meadow: 'yes', 'Bad Key': true, frostpine: true } }, PAGES).rewards, { frostpine: true }, 'only real flags survive');
  // the bundle: a handful of food items already in the catalog, capped
  const items = Object.entries(CHAPTER_REWARD.items);
  assert.ok(items.length >= 1 && items.reduce((a, [, n]) => a + n, 0) <= 12);
  for (const [id] of items) assert.ok(getItem(id), `${id} is a catalog item`);
  assert.ok(STORAGE_KEY.endsWith('storybook.v1'));
});

test('sticker data: a card per page, blank until a page is touched, five letter slots, flowers, the secret mark and the badge', () => {
  let progress = normaliseProgress(null, PAGES);
  let d = stickers(progress, PAGES);
  assert.deepEqual(d.cards.map((c) => c.id), [...meadow.pages, 'hidden-orchard']);
  assert.ok(d.cards.every((c) => c.letters.length === 5 && c.letters.every((l) => !l.found) && !c.cleared));
  assert.equal(d.cards.find((c) => c.id === 'hidden-orchard').locked, true);
  assert.equal(d.cards.find((c) => c.id === 'kite-hill').flowers.length, 3); assert.equal(d.cards.find((c) => c.id === 'orchard-hop').flowers.length, 0);
  assert.ok(d.cards.find((c) => c.id === 'kite-hill').hasSecret && !d.cards.find((c) => c.id === 'tidepool-run').hasSecret);
  assert.ok(!d.badge && d.lettersFound === 0 && d.lettersTotal === 20);
  for (const c of d.cards) assert.ok(typeof c.icon === 'string' && c.icon);
  progress = clear(progress, 'orchard-hop', { letters: ['F', 'S'] }); progress = clear(progress, 'kite-hill', { letters: ['E'], secret: true });
  d = stickers(progress, PAGES);
  const hop = d.cards.find((c) => c.id === 'orchard-hop');
  assert.deepEqual(hop.letters.map((l) => l.found), [true, false, false, true, false]); assert.ok(hop.cleared);
  const kite = d.cards.find((c) => c.id === 'kite-hill');
  assert.ok(kite.secret && kite.cleared); assert.equal(d.cards.find((c) => c.id === 'hidden-orchard').locked, false);
  assert.equal(d.lettersFound, 3);
});

test('the Cay\'s two pop-ups stand on clear, walkable grass of their own', () => {
  const island = ISLANDS.find((i) => i.id === 'story'), layout = buildStoryLayout(island, getIslandModule('story'));
  for (const [name, o] of Object.entries(STORY.popups)) {
    const x = island.x + o.x, z = island.z + o.z;
    assert.ok(isWalkable(x, z), `${name} stands on land`);
    for (const c of layout.colliders) assert.ok(Math.hypot(c.x - x, c.z - z) > c.r + 1.6, `${name} clear of a ${c.kind} collider`);
    for (const s of layout.stands) assert.ok(Math.hypot(s.x - x, s.z - z) > 3.5, `${name} clear of a stand`);
    assert.ok(Math.hypot(layout.quill.x - x, layout.quill.z - z) > 3.5);
    assert.ok(Math.hypot(layout.landing.x - x, layout.landing.z - z) > 6);
  }
  assert.ok(Math.hypot(STORY.popups.windmill.x - STORY.popups.sunflower.x, STORY.popups.windmill.z - STORY.popups.sunflower.z) > 8);
});

test('Paper Meadow is a complete SNES-flavoured arrangement on the page playlist, isolated from the island and the dungeon', () => {
  const track = getTrack(12);
  assert.equal(track.def.title, 'Paper Meadow'); assert.equal(track.def.bpm, 118); assert.equal(trackInfo()[12].bars, 32); assert.ok(trackInfo()[12].seconds > 60 && trackInfo()[12].seconds < 80);
  assert.deepEqual(REGION_TRACKS.page, [12]); assert.ok(!REGION_TRACKS.home.includes(12) && !REGION_TRACKS.dungeon.includes(12));
  for (const k of ['pad', 'bass', 'marimba', 'lead', 'bell', 'kick', 'shaker', 'click', 'logdrum']) assert.ok(track.events.some((e) => e.k === k), `${k} plays`);
  assert.ok(track.events.some((e) => e.k === 'lead' && e.o.style === 'whistle'));
  for (const e of track.events) { assert.ok(e.s >= 0 && e.s < track.steps && e.d > 0 && Number.isFinite(e.v) && e.v <= 0.4); assert.ok((Array.isArray(e.m) ? e.m : [e.m]).every(Number.isFinite)); }
  assert.notDeepEqual(track.events, getTrack(11).events);
  const prior = globalThis.document; globalThis.document = { addEventListener() {} };
  try {
    const m = new Music({ onChange() {} }); let area = 'home'; m.region = () => area;
    m.setClock({ phase: 'day', nightness: 0, on() {} });
    area = 'page'; assert.equal(m._chooseNext(-1), 12); assert.equal(m._chooseNext(12), 12, 'the page tune loops');
    area = 'home'; assert.notEqual(m._chooseNext(12), 12, 'back on the island the normal rotation returns');
  } finally { globalThis.document = prior; }
});
