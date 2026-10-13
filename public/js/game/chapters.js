// Storybook CHAPTERS (Step 52a): a book stand on Storybook Cay opens a chapter, an ordered list of pages. PURE (no three.js / DOM), Node-tested in test/chapters.test.js; the saved progress
// (game/storybookLogic.js) is the only state, so every screen derives the same menu from the synced progress.
//
//   CHAPTERS                     [{ id, name, pages: [pageId...], secret: pageId | null, soon?: true }]   (the secret page is a bonus entry: it never gates the next page and has no letters)
//   chapterOf(pageId)            the chapter a page belongs to (secret pages included) or null           chapterById(id)
//   chapterEntries(progress, ch) -> [{ id, secret, open, cleared, reason }]   the menu rows: page N opens once page N-1 is cleared (page 1 always); the secret page once any page's secret exit was found
//   pageOpen(progress, pageId)   can this page be entered from the stand?      secretUnlocked(progress, ch)   any page of the chapter has its secret exit found
//   chapterBadge(progress, ch)   every F-E-A-S-T letter of every main page is found                       rewardDue(progress, ch)   the badge is earned and the one-time reward was not given yet
//   popupsOf(progress)           { windmill, sunflower, snowglobe, volcano } which Cay cut-outs stand (a secret exit found / the Meadow / Frostpine / Emberleaf reward given)
//   stickers(progress, pages, ch) the Journal's data for ONE chapter (ch defaults to Meadow); stickerSets(progress, pages) one per chapter that has pages (Step 52b)
//   stickers(progress, pages)    [{ id, name, icon, cleared, secret, letters: [{ch, found}] x5, flowers: [{found}], bonus }] one per page, plus { badge } for the chapter (the Journal's Storybook tab)
import { LETTERS } from './storybookLogic.js';

export const CHAPTERS = [
  { id: 'meadow', name: 'Meadow Pages', pages: ['orchard-hop', 'woodcutters-way', 'kite-hill', 'tidepool-run'], secret: 'hidden-orchard' },
  { id: 'frostpine', name: 'Frostpine Slopes', pages: ['snowy-steps', 'sled-run', 'aurora-night'], secret: null },
  { id: 'emberleaf', name: 'Emberleaf Canopy', pages: ['canopy-climb', 'river-run', 'lava-rise', 'volcano-spirit'], secret: 'hot-spring' },       // (Step 53a: page 1 is always open, like Frostpine's: the Cay needs both island bridges; the secret exit in Canopy Climb opens the bonus page Hot Spring)       // (Step 52b: the Cay is only reachable once both island bridges are built, so the first page is always open)
];
export const chapterById = (id) => CHAPTERS.find((c) => c.id === id) || null;
export const chapterOf = (pageId) => CHAPTERS.find((c) => c.pages.includes(pageId) || c.secret === pageId) || null;

const entry = (progress, id) => (progress && progress.pages && progress.pages[id]) || null;
export const secretUnlocked = (progress, ch) => !!ch && !!ch.secret && ch.pages.some((id) => !!(entry(progress, id) || {}).secret);

export function chapterEntries(progress, ch) {
  const out = [];
  ch.pages.forEach((id, i) => {
    const prev = i ? entry(progress, ch.pages[i - 1]) : null;
    const open = i === 0 || !!(prev && prev.cleared);
    out.push({ id, secret: false, open, cleared: !!(entry(progress, id) || {}).cleared, reason: open ? null : 'Clear the previous page first' });
  });
  if (ch.secret) {
    const open = secretUnlocked(progress, ch);
    out.push({ id: ch.secret, secret: true, open, cleared: !!(entry(progress, ch.secret) || {}).cleared, reason: open ? null : 'A secret exit hides in this chapter' });
  }
  return out;
}
export function pageOpen(progress, pageId) {
  const ch = chapterOf(pageId);
  if (!ch) return true;                                   // (a page without a chapter, e.g. a debug page, is always open)
  const e = chapterEntries(progress, ch).find((x) => x.id === pageId);
  return !!e && e.open;
}
export const chapterBadge = (progress, ch) => !!ch && ch.pages.length > 0 && ch.pages.every((id) => LETTERS.every((c) => ((entry(progress, id) || {}).letters || []).includes(c)));
export const rewardDue = (progress, ch) => chapterBadge(progress, ch) && !(progress && progress.rewards && progress.rewards[ch.id]);

export function popupsOf(progress) {
  const meadow = chapterById('meadow');
  const rw = (progress && progress.rewards) || {};
  return { windmill: secretUnlocked(progress, meadow), sunflower: !!rw.meadow, snowglobe: !!rw.frostpine, volcano: !!rw.emberleaf };
}

/** The Journal's sticker data: a card per page of the chapter (blank outlines until cleared), the five letters as slots, the flowers, the cleared / secret marks, and the chapter badge. */
export function stickers(progress, pages, ch = CHAPTERS[0]) {
  const cards = [];
  const ids = [...ch.pages, ...(ch.secret ? [ch.secret] : [])];
  for (const id of ids) {
    const page = pages instanceof Map ? pages.get(id) : pages && pages[id];
    if (!page) continue;
    const e = entry(progress, id) || { cleared: false, letters: [], flowers: [], secret: false };
    const bonus = id === ch.secret;
    cards.push({
      id, name: page.name, icon: page.sticker || 'sun', bonus, cleared: !!e.cleared, secret: !!e.secret, locked: bonus && !secretUnlocked(progress, ch),
      letters: LETTERS.map((c) => ({ ch: c, found: (e.letters || []).includes(c) })),
      flowers: (page.flowers || []).map((_, i) => ({ found: (e.flowers || []).includes(i) })),
      hasSecret: !!page.secret,
    });
  }
  const letters = ch.pages.reduce((n, id) => n + (((entry(progress, id) || {}).letters) || []).length, 0);
  return { chapter: ch.id, name: ch.name, cards, badge: chapterBadge(progress, ch), lettersFound: letters, lettersTotal: ch.pages.length * LETTERS.length, rewarded: !!(progress && progress.rewards && progress.rewards[ch.id]) };
}
/** Step 52b: the sticker data of every chapter that has pages (the Journal shows one badge + card grid per chapter). */
export const stickerSets = (progress, pages) => CHAPTERS.filter((ch) => ch.pages.length).map((ch) => stickers(progress, pages, ch));
