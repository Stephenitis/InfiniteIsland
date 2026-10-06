// Storybook pages: deterministic, host-owned RULES, independent of rendering (Step 48). No three.js / DOM, so Node tests it (test/storybook.test.js).
// The 3D hub (Storybook Cay's giant book + stands) lives in world/islands/story*.js; stepping into a page is a whole-party teleport to a pocket space far
// from every island (like Wildroot Hollow's) where the page is a flat strip: terrain.js asks `inPage` for the walkable lane, the page's look is
// world/pageVisuals.js, and Step 49 swaps the strip's simple walking for real platformer physics (this module's state + validation stay).
//
//   PAGE                             the pocket: { x, z, y, laneHalf } (the lane runs along X at z = PAGE.z, y = PAGE.y; far WEST of everything: x = -1200)
//   setPageHalfLength(h) / pageHalfLength()   how far the walkable lane reaches either side of PAGE.x (the open page's length / 2; the default fits every page)
//   inPage(x, z, pad)                on the walkable lane (pad shrinks it)    inPageArea(x, z)   anywhere near the pocket (a generous box, wide enough for the longest page: "this player is in a page")
//   pageSpawn(page, slot)            { x, z } where player `slot` appears when a page opens       pageExit(page)   { x, z } of the page's back-cover ribbon
//   standFront(stand, slot)          { x, z } where player `slot` stands again after leaving a page (south of the book stand)
//   freshState() / normaliseState(raw, pages) / hashView(state)     { active, page, serial } (session-only, never saved)
//   validateEnter({ state, pageId, pages, actor, stands })          { ok: true, stand } | { ok: false, reason: 'busy' | 'bad-request' | 'far' }
//   validateExit({ state, actor, pages })                           { ok: true } | { ok: false, reason: 'idle' | 'outside' | 'far' | 'bad-request' }
//   applyEnter(state, pageId) / applyExit(state)                    the next state (serial + 1)
import { PLATFORMER } from '../config.js';
import { berryRefill } from './platformerLogic.js';

export const PAGE = { x: -1200, z: 1000, y: 6, laneHalf: 1.25 };
export const STAND_REACH = 5;                    // the host accepts "read the stand" from this far (u) from the lectern: talk range plus latency slack
export const EXIT_REACH = 6;                     // ... and "close the book" from this far from the back-cover ribbon

let _half = 30;
export const setPageHalfLength = (h) => { _half = Math.max(4, Math.min(120, Number(h) || 30)); };
export const pageHalfLength = () => _half;

export function inPage(x, z, pad = 0) {
  return Math.abs(x - PAGE.x) <= _half - pad && Math.abs(z - PAGE.z) <= PAGE.laneHalf - pad;
}
/** A generous box round the pocket: a player here is "inside the book" even if a soft push nudged them to the lane's edge. */
export function inPageArea(x, z) {
  return Math.abs(x - PAGE.x) <= 130 && Math.abs(z - PAGE.z) <= 30;
}

export const pageSpawn = (page, slot = 0) => ({ x: PAGE.x + (page ? page.spawnX : 0) + (slot % 4) * 1.3, z: PAGE.z });
export const pageExit = (page) => ({ x: PAGE.x + (page ? page.exitX : 0), z: PAGE.z });
export const standFront = (stand, slot = 0) => ({ x: stand.x - 1.9 + (slot % 4) * 1.25, z: stand.z + 2.3 });

export const freshState = () => ({ active: false, page: null, serial: 0 });

/** A received / restored state made safe: an unknown page id means "no page"; the serial is a non-negative integer. */
export function normaliseState(raw, pages) {
  const serial = Math.max(0, Math.floor(Number(raw && raw.serial)) || 0);
  const known = raw && typeof raw.page === 'string' && (pages instanceof Map ? pages.has(raw.page) : !!(pages && pages[raw.page]));
  if (!raw || !raw.active || !known) return { active: false, page: null, serial };
  return { active: true, page: raw.page, serial };
}

export const hashView = (state) => ({ active: !!state.active, page: state.page || null, serial: state.serial | 0 });

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const pageOf = (pages, id) => (pages instanceof Map ? pages.get(id) : pages && pages[id]);

/** Opening a page: nothing may be open already, the page must exist and the actor must stand at a book stand that opens it. `actor` = { pos: {x, z} }. */
export function validateEnter({ state, pageId, pages, actor, stands }) {
  if (!actor || !actor.pos || typeof pageId !== 'string' || !pageOf(pages, pageId)) return { ok: false, reason: 'bad-request' };
  if (state.active) return { ok: false, reason: 'busy' };
  const near = (stands || []).filter((s) => s.page === pageId).map((s) => ({ s, d: dist(actor.pos, s) })).sort((a, b) => a.d - b.d)[0];
  if (!near || near.d > STAND_REACH) return { ok: false, reason: 'far' };
  return { ok: true, stand: near.s };
}

/** Closing the book: a page must be open, the actor must be inside it and near the back-cover ribbon. */
export function validateExit({ state, actor, pages }) {
  if (!actor || !actor.pos) return { ok: false, reason: 'bad-request' };
  if (!state.active) return { ok: false, reason: 'idle' };
  if (!inPageArea(actor.pos.x, actor.pos.z)) return { ok: false, reason: 'outside' };
  const page = pageOf(pages, state.page);
  if (!page || dist(actor.pos, pageExit(page)) > EXIT_REACH) return { ok: false, reason: 'far' };
  return { ok: true };
}

export const applyEnter = (state, pageId) => ({ active: true, page: pageId, serial: state.serial + 1 });
export const applyExit = (state) => ({ active: false, page: null, serial: state.serial + 1 });

// ---- page coordinates (Step 49): a page's tiles are x to the right, y up from its bottom row; the pocket centres the page on PAGE.x and puts the floor (row `floorRows`) at PAGE.y
export const pageToWorld = (page, tx, ty) => ({ x: PAGE.x + tx - page.W / 2, y: PAGE.y - page.floorRows + ty, z: PAGE.z });
export const worldToPage = (page, x, y) => ({ tx: x - PAGE.x + page.W / 2, ty: y - PAGE.y + page.floorRows });

// ---- the run: what the party has collected on the open page (session-only, shared through the host, reset whenever a page opens or closes)
//   freshRun()                      { berries: [], letters: [], fires: [0], cleared: false }  (fire 0 = the start campfire, lit from the beginning)
//   normaliseRun(raw, page)         a received / restored run made safe (ids in range, unique, sorted; letters in F E A S T order)
//   runView(run)                    the hashed form (stable through a JSON round trip)
//   validateCollect({ state, run, page, kind, id, actor })   kind 'berry' (id = index) | 'letter' (id = 'F'..) | 'fire' (id = index) | 'goal' ->
//                                   { ok: true, pos } | { ok: false, reason: 'closed' | 'bad-request' | 'taken' | 'far' }; the actor must be within PLATFORMER.collectReach of the thing
//   applyCollect(run, page, kind, id) -> { run, refill }   the next run; refill = this berry crossed a multiple of PLATFORMER.berriesPerHeart
//   respawnFire(page, run)          the campfire a fallen player reappears at: the furthest lit one
export const LETTERS = ['F', 'E', 'A', 'S', 'T'];
export const freshRun = () => ({ berries: [], letters: [], fires: [0], cleared: false });
const uniqSorted = (list, max) => [...new Set((Array.isArray(list) ? list : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < max))].sort((a, b) => a - b);
export function normaliseRun(raw, page) {
  if (!page) return freshRun();
  const r = raw && typeof raw === 'object' ? raw : {};
  const letters = LETTERS.filter((c) => Array.isArray(r.letters) && r.letters.includes(c) && page.letters.some((l) => l.ch === c));
  const fires = uniqSorted([0, ...(Array.isArray(r.fires) ? r.fires : [])], page.campfires.length);
  return { berries: uniqSorted(r.berries, page.berries.length), letters, fires, cleared: !!r.cleared };
}
export const runView = (run) => ({ berries: run.berries.slice(), letters: run.letters.slice(), fires: run.fires.slice(), cleared: !!run.cleared });
export const respawnFire = (page, run) => page.campfires[Math.max(0, ...run.fires)] || page.campfires[0];

export function validateCollect({ state, run, page, kind, id, actor }) {
  if (!state.active || !page || state.page !== page.id) return { ok: false, reason: 'closed' };
  if (!actor || !actor.pos) return { ok: false, reason: 'bad-request' };
  let at = null;
  if (kind === 'berry') {
    if (!Number.isInteger(id) || id < 0 || id >= page.berries.length) return { ok: false, reason: 'bad-request' };
    if (run.berries.includes(id)) return { ok: false, reason: 'taken' };
    at = page.berries[id];
  } else if (kind === 'letter') {
    const l = page.letters.find((e) => e.ch === id);
    if (!l) return { ok: false, reason: 'bad-request' };
    if (run.letters.includes(id)) return { ok: false, reason: 'taken' };
    at = l;
  } else if (kind === 'fire') {
    if (!Number.isInteger(id) || id < 0 || id >= page.campfires.length) return { ok: false, reason: 'bad-request' };
    if (run.fires.includes(id)) return { ok: false, reason: 'taken' };
    at = page.campfires[id];
  } else if (kind === 'goal') {
    if (!page.goal) return { ok: false, reason: 'bad-request' };
    if (run.cleared) return { ok: false, reason: 'taken' };
    at = page.goal;
  } else return { ok: false, reason: 'bad-request' };
  const pos = pageToWorld(page, at.x, at.y);
  if (Math.hypot(actor.pos.x - pos.x, actor.pos.y - pos.y) > PLATFORMER.collectReach + (kind === 'goal' ? 1.5 : 0)) return { ok: false, reason: 'far' };
  return { ok: true, pos };
}
export function applyCollect(run, page, kind, id) {
  const next = runView(run);
  let refill = false;
  if (kind === 'berry') { next.berries = uniqSorted([...next.berries, id], page.berries.length); refill = berryRefill(run.berries.length, next.berries.length); }
  else if (kind === 'letter') next.letters = LETTERS.filter((c) => next.letters.includes(c) || c === id);
  else if (kind === 'fire') next.fires = uniqSorted([...next.fires, id], page.campfires.length);
  else if (kind === 'goal') next.cleared = true;
  return { run: next, refill };
}

// ---- saved progress (host only): infinite-island.storybook.v1 = { v: 1, pages: { [id]: { cleared, letters: ['F', ...], bestBerries } } }
//   Classic rule: a page's letters (and its best berry count) count toward the save only when the page is CLEARED (the goal touched); leaving early keeps nothing.
//   normaliseProgress(raw, pages) a loaded / received save made safe        mergeClear(progress, page, run)  the progress after clearing the page with this run
//   progressLine(progress, page)  { cleared, bestBerries, letters: [{ ch, found }] x 5 } for the stand menu        progressView(progress)  hashed form
export const STORAGE_KEY = 'infinite-island.storybook.v1';
export const freshProgress = () => ({ v: 1, pages: {} });
export function normaliseProgress(raw, pages) {
  const out = freshProgress();
  const src = raw && typeof raw === 'object' && raw.pages && typeof raw.pages === 'object' ? raw.pages : {};
  for (const id of Object.keys(src)) {
    const page = pages instanceof Map ? pages.get(id) : pages && pages[id];
    if (!page) continue;
    const e = src[id] || {};
    out.pages[id] = {
      cleared: !!e.cleared,
      letters: LETTERS.filter((c) => Array.isArray(e.letters) && e.letters.includes(c)),
      bestBerries: Math.max(0, Math.min(page.berries.length, Math.floor(Number(e.bestBerries)) || 0)),
    };
  }
  return out;
}
export function mergeClear(progress, page, run) {
  const prev = (progress.pages && progress.pages[page.id]) || { cleared: false, letters: [], bestBerries: 0 };
  const next = { v: 1, pages: { ...progress.pages } };
  next.pages[page.id] = {
    cleared: true,
    letters: LETTERS.filter((c) => prev.letters.includes(c) || run.letters.includes(c)),
    bestBerries: Math.max(prev.bestBerries, run.berries.length),
  };
  return next;
}
export const progressLine = (progress, page) => {
  const e = (progress.pages && progress.pages[page.id]) || { cleared: false, letters: [], bestBerries: 0 };
  return { cleared: e.cleared, bestBerries: e.bestBerries, letters: LETTERS.map((ch) => ({ ch, found: e.letters.includes(ch) })) };
};
export const progressView = (progress) => {
  const out = {};
  for (const id of Object.keys(progress.pages || {}).sort()) { const e = progress.pages[id]; out[id] = { cleared: !!e.cleared, letters: e.letters.join(''), best: e.bestBerries | 0 }; }
  return out;
};
