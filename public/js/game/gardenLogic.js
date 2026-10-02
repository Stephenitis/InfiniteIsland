// The Emberleaf terrace garden's pure rules (PLAN Step 37b + 38b; Step 39 builds on them): plot numbering, which plots are usable at which garden stage, the state shape, its
// normalising (saves, snapshots, debug input), planting / tending / cuttings, the growth clock (counted in day / night PHASES) and the save format. No three.js, no DOM: Node-tested (test/garden.test.js).
//
//   PLOTS                         [{ i, tier, da, open }] in index order: the top row 0-5, the middle row 6-9, the bottom row 10-15 (config EMBER_GARDEN.tiers, west-most first)
//   PLOT_COUNT                    16
//   plotOpenStage(i)              the garden stage that opens plot i (0 for the four bottom-row plots usable from the start, 1 for the middle row, 2 for the rest)
//   usableList(stage) / isUsable(stage, i) / usableCount(stage)     which plots can be planted at a garden stage (4 at stage 0, 8 at 1, 16 at 2+)
//   freshState()                  { stage: 0, plots: [{ flower: null, stage: 'empty' } x 16], seeds: [], sown: [], cuttings: [], phase: null }
//   normalisePlot(p) / normaliseState(s)    tolerant: anything malformed becomes an empty plot / a fresh field; a growing plot with no flower becomes empty; seeds / sown are unique + sorted
//   withPlot(state, i, plot)      a NEW state with plot i replaced (normalised); an out-of-range index returns the state unchanged
//   plotPrompt(state, i)          the prompt of the plot's interactable: 'Plant' (usable + empty), 'Tend' (a planted, untended seed), 'Take cutting' (a bloom with no cutting taken yet), else 'Look'
//   buildSave(state) / readSave(part)   the `garden` key of the Emberleaf save file (game/emberSave.js): { stage, plots: { "i": { flower, stage, cut? } } (only planted ones), seeds, sown, cuttings, phase }
//   plantGuidePages(state)        Mossback's "Plant a seed" pages: what can be planted now + what each planted flower needs next (null: nothing found / planted)
//   hashView(state)               the save form WITHOUT `phase` (the host's private growth counter: replicas never count), for sync.hash()
//
// PLANTING (Step 38b). A plot holds { flower, stage, cut? }. Stages: 'empty' -> 'seed' (planted, untended; a seed stays a seed until tended) -> 'sprout' (tended with the flower's item, flowers.js
// `tend`) -> 'bud' (at the next DUSK) -> 'bloom' (at the next DAWN, i.e. after the night). A bloom stays in bloom; a bloom can give ONE cutting (`cut` = taken).
//   `seeds`     the seeds FOUND (key items; 38a).   `sown`  the flowers whose found seed has been planted (a found seed can be planted once).   `cuttings`  the cuttings in stock (one entry per cutting)
//   A cutting (taken from a bloom) plants a second plant of the same flower, already rooted: it starts as a SPROUT (no tending item needed).
//   plantOptions(state)                 [{ flower, kind: 'seed' | 'cutting', n }] what can be planted now (seeds first, in flower order)
//   checkPlant(state, i, flower, kind) / doPlant(...)   { ok } | { ok: false, reason } and the new state ('bad-plot' | 'locked' | 'occupied' | 'unknown' | 'no-seed' | 'no-cutting')
//   checkTend(state, i) / doTend(state, i)               'bad-plot' | 'not-seed'; the caller takes the tending item from the bag first (tendItemOf)
//   checkCut(state, i) / doCut(state, i)                 'bad-plot' | 'not-bloom' | 'cut' | 'full'
//
// GROWTH CLOCK. The host counts the PHASE BOUNDARIES of the shared day clock (world/dayNight.js: dawn -> day -> dusk -> night -> dawn): entering dusk grows every sprout into a bud, entering dawn grows every
// bud into a bloom. `state.phase` is the last phase the host COUNTED (saved on every boundary). A boundary is counted only when it is a FORWARD step from that phase, so replays never count twice:
//   phasesEntered(from, to)             the boundaries crossed going forward from `from` to `to` ([] when equal), e.g. ('day', 'dawn') -> ['dusk', 'night', 'dawn']
//   reconcilePhase(saved, clockPhase)   at load: keep the saved phase when the clock (which is saved only every ~5 s) is the same phase or the one before it (it replays that boundary: ignored); otherwise
//                                       adopt the clock's phase (no offline catch-up: ?time jumps and a fresh save count nothing)
//   growPhases(state, from, to)         { state, changed: [i...] }  apply every boundary entered going from `from` to `to`
//   growNights(state, n)                { state, changed }  n whole nights (dusk, night, dawn) at once: the debug `__game.garden.grow(n)`
// Nothing grows while the clock is stopped (?daylock) or the host's tab is hidden (its tick freezes); replicas never count, they only mirror the host's plot events / snapshots.
import { EMBER_GARDEN, GARDEN, DAY_PHASES } from '../config.js';
import { FLOWER_IDS, isFlower, tendItemOf, flowerById, TEND_INFO } from './flowers.js';
import { normaliseJobs } from './gardenJobs.js';

export const STAGES = GARDEN.plotStages;                       // ['empty', 'seed', 'sprout', 'bud', 'bloom']
export const PLOTS = [];
for (const t of EMBER_GARDEN.tiers) for (const da of t.plots) PLOTS.push({ i: PLOTS.length, tier: t.id, da, open: t.open.some((o) => Math.abs(o - da) < 1e-9) });
export const PLOT_COUNT = PLOTS.length;
export const PHASE_ORDER = DAY_PHASES.map((p) => p.name);       // ['dawn', 'day', 'dusk', 'night']

export const plotOpenStage = (i) => {
  const p = PLOTS[i];
  if (!p) return Infinity;
  return p.open ? 0 : (GARDEN.plotOpenStage[p.tier] ?? 2);
};
export const clampStage = (s) => Math.max(0, Math.min(GARDEN.maxStage, Math.floor(Number(s)) || 0));
export const isUsable = (stage, i) => plotOpenStage(i) <= clampStage(stage);
export const usableList = (stage) => PLOTS.filter((p) => isUsable(stage, p.i)).map((p) => p.i);
export const usableCount = (stage) => usableList(stage).length;

const emptyPlot = () => ({ flower: null, stage: 'empty' });
export const freshState = () => ({ stage: 0, given: {}, plots: PLOTS.map(emptyPlot), seeds: [], sown: [], cuttings: [], phase: null });

const idOk = (x) => typeof x === 'string' && x.length > 0 && x.length <= 40;
const uniqSorted = (a) => (Array.isArray(a) ? [...new Set(a.filter(idOk))].sort() : []);

export function normalisePlot(p) {
  if (!p || typeof p !== 'object') return emptyPlot();
  const stage = STAGES.includes(p.stage) ? p.stage : 'empty';
  const flower = idOk(p.flower) ? p.flower : null;
  if (stage === 'empty' || !flower) return emptyPlot();
  return stage === 'bloom' && p.cut ? { flower, stage, cut: true } : { flower, stage };
}

export function normaliseState(s) {
  const out = freshState();
  if (!s || typeof s !== 'object') return out;
  out.stage = clampStage(s.stage);
  const jobs = normaliseJobs({ stage: out.stage, given: s.given });
  out.stage = jobs.comfort; out.given = jobs.given;
  const src = s.plots;
  for (let i = 0; i < PLOT_COUNT; i++) {
    const v = Array.isArray(src) ? src[i] : src && typeof src === 'object' ? src[i] : null;
    out.plots[i] = normalisePlot(v);
  }
  out.seeds = uniqSorted(s.seeds);
  out.sown = uniqSorted(s.sown);
  if (Array.isArray(s.cuttings)) out.cuttings = s.cuttings.filter(idOk).slice(0, GARDEN.maxCuttings).sort();
  out.phase = PHASE_ORDER.includes(s.phase) ? s.phase : null;
  return out;
}

export function withPlot(state, i, plot) {
  if (!Number.isInteger(i) || i < 0 || i >= PLOT_COUNT) return state;
  const plots = state.plots.slice();
  plots[i] = normalisePlot(plot);
  return { ...state, plots };
}

export function plotPrompt(state, i) {
  if (!isUsable(state.stage, i)) return 'Look';
  const p = state.plots[i] || emptyPlot();
  if (p.stage === 'empty') return 'Plant';
  if (p.stage === 'seed') return 'Tend';
  return p.stage === 'bloom' && !p.cut ? 'Take cutting' : 'Look';
}

// ------------------------------------------------------------------ planting / tending / cuttings
const seedsLeft = (state) => FLOWER_IDS.filter((id) => state.seeds.includes(id) && !state.sown.includes(id));
const cuttingCount = (state, id) => state.cuttings.filter((c) => c === id).length;

export function plantOptions(state) {
  const out = seedsLeft(state).map((flower) => ({ flower, kind: 'seed', n: 1 }));
  for (const flower of FLOWER_IDS) { const n = cuttingCount(state, flower); if (n) out.push({ flower, kind: 'cutting', n }); }
  return out;
}

export function checkPlant(state, i, flower, kind) {
  if (!Number.isInteger(i) || i < 0 || i >= PLOT_COUNT) return { ok: false, reason: 'bad-plot' };
  if (!isUsable(state.stage, i)) return { ok: false, reason: 'locked' };
  if ((state.plots[i] || emptyPlot()).stage !== 'empty') return { ok: false, reason: 'occupied' };
  if (!isFlower(flower)) return { ok: false, reason: 'unknown' };
  if (kind === 'seed') return seedsLeft(state).includes(flower) ? { ok: true } : { ok: false, reason: 'no-seed' };
  if (kind === 'cutting') return cuttingCount(state, flower) > 0 ? { ok: true } : { ok: false, reason: 'no-cutting' };
  return { ok: false, reason: 'unknown' };
}

export function doPlant(state, i, flower, kind) {
  if (!checkPlant(state, i, flower, kind).ok) return state;
  let next = withPlot(state, i, { flower, stage: kind === 'seed' ? 'seed' : state.stage >= 2 ? 'bud' : 'sprout' });
  if (kind === 'seed') next = { ...next, sown: uniqSorted([...next.sown, flower]) };
  else { const at = next.cuttings.indexOf(flower); next = { ...next, cuttings: next.cuttings.filter((_, k) => k !== at) }; }
  return next;
}

export function checkTend(state, i) {
  if (!Number.isInteger(i) || i < 0 || i >= PLOT_COUNT) return { ok: false, reason: 'bad-plot' };
  const p = state.plots[i] || emptyPlot();
  if (p.stage !== 'seed') return { ok: false, reason: 'not-seed' };
  return { ok: true, item: tendItemOf(p.flower) };
}
export function doTend(state, i) {
  return checkTend(state, i).ok ? withPlot(state, i, { flower: state.plots[i].flower, stage: state.stage >= 2 ? 'bud' : 'sprout' }) : state;
}

export function checkCut(state, i) {
  if (!Number.isInteger(i) || i < 0 || i >= PLOT_COUNT) return { ok: false, reason: 'bad-plot' };
  const p = state.plots[i] || emptyPlot();
  if (p.stage !== 'bloom') return { ok: false, reason: 'not-bloom' };
  if (p.cut) return { ok: false, reason: 'cut' };
  if (state.cuttings.length >= GARDEN.maxCuttings) return { ok: false, reason: 'full' };
  return { ok: true };
}
export function doCut(state, i) {
  if (!checkCut(state, i).ok) return state;
  const p = state.plots[i];
  return { ...withPlot(state, i, { ...p, cut: true }), cuttings: [...state.cuttings, p.flower].sort() };
}

// ------------------------------------------------------------------ the growth clock
export const nextPhase = (p) => PHASE_ORDER[(PHASE_ORDER.indexOf(p) + 1) % PHASE_ORDER.length];

/** The phase boundaries crossed going FORWARD from `from` to `to` (each phase entered, `to` last); [] when they are equal or either is unknown. */
export function phasesEntered(from, to) {
  if (!PHASE_ORDER.includes(from) || !PHASE_ORDER.includes(to) || from === to) return [];
  const out = [];
  let p = from;
  for (let k = 0; k < PHASE_ORDER.length; k++) { p = nextPhase(p); out.push(p); if (p === to) break; }
  return out;
}

export function reconcilePhase(saved, clockPhase) {
  if (!PHASE_ORDER.includes(clockPhase)) return PHASE_ORDER.includes(saved) ? saved : 'day';
  if (!PHASE_ORDER.includes(saved)) return clockPhase;
  return saved === clockPhase || nextPhase(clockPhase) === saved ? saved : clockPhase;
}

/** What entering `phase` does to one plot. */
export function advancePlot(plot, phase) {
  if (phase === 'dusk' && plot.stage === 'sprout') return { ...plot, stage: 'bud' };
  if (phase === 'dawn' && plot.stage === 'bud') return { ...plot, stage: 'bloom' };
  return plot;
}

function applyPhases(state, entered) {
  let plots = state.plots;
  const changed = new Set();
  for (const phase of entered) {
    plots = plots.map((p, i) => { const q = advancePlot(p, phase); if (q !== p) changed.add(i); return q; });
  }
  return { state: changed.size ? { ...state, plots } : state, changed: [...changed].sort((a, b) => a - b) };
}
export const growPhases = (state, from, to) => applyPhases(state, phasesEntered(from, to));
export function growNights(state, n = 1) {
  const entered = [];
  for (let k = 0; k < Math.max(0, Math.min(8, Math.floor(Number(n)) || 0)); k++) entered.push('dusk', 'night', 'dawn');
  return applyPhases(state, entered);
}

// ------------------------------------------------------------------ Mossback's planting guidance (the "Plant a seed" row)
const nameOf = (id) => (flowerById(id) || { name: id }).name;
const joinList = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
/** What Mossback says: what can be planted now, then what each planted flower needs next (two lines per page). null = nothing found, nothing planted (his default line). */
export function plantGuidePages(state) {
  const options = plantOptions(state);
  const planted = state.plots.map((p, i) => ({ ...p, i })).filter((p) => p.stage !== 'empty');
  if (!options.length && !planted.length) return null;
  const pages = [];
  const seedNames = options.filter((o) => o.kind === 'seed').map((o) => nameOf(o.flower));
  const cutNames = options.filter((o) => o.kind === 'cutting').map((o) => `${nameOf(o.flower)}${o.n > 1 ? ` (x${o.n})` : ''}`);
  const beds = usableCount(state.stage), free = PLOTS.filter((p) => isUsable(state.stage, p.i) && state.plots[p.i].stage === 'empty').length;
  if (options.length) {
    const have = [seedNames.length ? `${joinList(seedNames)} seeds` : '', cutNames.length ? `cuttings of ${joinList(cutNames)}` : ''].filter(Boolean).join(' and ');
    pages.push(`You can plant ${have} now. Walk up to a bare bed that is open to us and choose what should grow there. Right now ${beds} beds are open, and ${free} of them are free.`);
  } else pages.push('Every seed you have found is in the soil already. Lovely. Now let us look after them.');
  const lines = [];
  for (const id of FLOWER_IDS) {
    const mine = planted.filter((p) => p.flower === id);
    if (!mine.length) continue;
    const name = nameOf(id), info = TEND_INFO[tendItemOf(id)];
    const seeds = mine.filter((p) => p.stage === 'seed').length, sprouts = mine.filter((p) => p.stage === 'sprout').length, buds = mine.filter((p) => p.stage === 'bud').length;
    const blooms = mine.filter((p) => p.stage === 'bloom'), uncut = blooms.filter((p) => !p.cut).length;
    if (seeds) lines.push(`The ${name} seed needs ${info.name}, just once, to wake up. You can get it ${info.where}.`);
    if (sprouts) lines.push(`The ${name} sprout will close into a bud when the evening comes.`);
    if (buds) lines.push(`The ${name} bud will open at dawn, after the night.`);
    if (uncut) lines.push(`Your ${name} is in bloom! Take a cutting from it and plant that in another bed, and you will have two.`);
    else if (blooms.length) lines.push(`Your ${name} is in bloom, and its cutting is already taken. Beautiful.`);
  }
  for (let k = 0; k < lines.length; k += 2) pages.push(lines.slice(k, k + 2).join(' '));
  return pages;
}

// ------------------------------------------------------------------ save / hash
export function buildSave(state) {
  const plots = {};
  state.plots.forEach((p, i) => { if (p.stage !== 'empty') plots[i] = p.cut ? { flower: p.flower, stage: p.stage, cut: true } : { flower: p.flower, stage: p.stage }; });
  return { stage: state.stage, given: { ...state.given }, plots, seeds: [...state.seeds], sown: [...state.sown], cuttings: [...state.cuttings], phase: state.phase };
}
export const readSave = (part) => normaliseState(part);
export const hashView = (state) => { const { phase, ...rest } = buildSave(state); return rest; };
