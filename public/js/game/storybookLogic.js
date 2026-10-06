// Storybook pages: deterministic, host-owned RULES, independent of rendering (Step 48). No three.js / DOM, so Node tests it (test/storybook.test.js).
// The 3D hub (Storybook Cay's giant book + stands) lives in world/islands/story*.js; stepping into a page is a whole-party teleport to a pocket space far
// from every island (like Wildroot Hollow's) where the page is a flat strip: terrain.js asks `inPage` for the walkable lane, the page's look is
// world/pageVisuals.js, and Step 49 swaps the strip's simple walking for real platformer physics (this module's state + validation stay).
//
//   PAGE                             the pocket: { x, z, y, laneHalf } (the lane runs along X at z = PAGE.z, y = PAGE.y; far WEST of everything: x = -1200)
//   setPageHalfLength(h) / pageHalfLength()   how far the walkable lane reaches either side of PAGE.x (the open page's length / 2; the default fits every page)
//   inPage(x, z, pad)                on the walkable lane (pad shrinks it)    inPageArea(x, z)   anywhere near the pocket (a generous box: "this player is in a page")
//   pageSpawn(page, slot)            { x, z } where player `slot` appears when a page opens       pageExit(page)   { x, z } of the page's back-cover ribbon
//   standFront(stand, slot)          { x, z } where player `slot` stands again after leaving a page (south of the book stand)
//   freshState() / normaliseState(raw, pages) / hashView(state)     { active, page, serial } (session-only, never saved)
//   validateEnter({ state, pageId, pages, actor, stands })          { ok: true, stand } | { ok: false, reason: 'busy' | 'bad-request' | 'far' }
//   validateExit({ state, actor, pages })                           { ok: true } | { ok: false, reason: 'idle' | 'outside' | 'far' | 'bad-request' }
//   applyEnter(state, pageId) / applyExit(state)                    the next state (serial + 1)
export const PAGE = { x: -1200, z: 1000, y: 6, laneHalf: 1.25 };
export const STAND_REACH = 5;                    // the host accepts "read the stand" from this far (u) from the lectern: talk range plus latency slack
export const EXIT_REACH = 6;                     // ... and "close the book" from this far from the back-cover ribbon

let _half = 30;
export const setPageHalfLength = (h) => { _half = Math.max(4, Math.min(40, Number(h) || 30)); };
export const pageHalfLength = () => _half;

export function inPage(x, z, pad = 0) {
  return Math.abs(x - PAGE.x) <= _half - pad && Math.abs(z - PAGE.z) <= PAGE.laneHalf - pad;
}
/** A generous box round the pocket: a player here is "inside the book" even if a soft push nudged them to the lane's edge. */
export function inPageArea(x, z) {
  return Math.abs(x - PAGE.x) <= 60 && Math.abs(z - PAGE.z) <= 30;
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
