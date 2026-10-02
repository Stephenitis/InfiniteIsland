// Pure rules of the Frostpine camp jobs (PLAN Step 35a): no three.js / DOM, so Node tests it (test/campJobs.test.js).
//
// The camp's comfort runs 0..CAMP_MAX_COMFORT. Each job (config CAMP_JOBS, a fixed order) takes a bundle of materials and raises the comfort by one when the last one is
// delivered; then the next job starts. State: { comfort, job, given: { itemId: n } } where `job` is the index of the job being worked on (= comfort, until every job is
// done: then job === jobs.length) and `given` is what the current job has received so far (partial gifts are kept).
//
//   freshState()                          { comfort: 0, job: 0, given: {} }
//   currentJob(state, jobs?)              the job being worked on, or null when the camp is finished
//   needed(state, itemId, jobs?)          how many more of that item the current job still takes (0 when it does not want it / no job)
//   remainingNeeds(state, jobs?)          [{ item, need, given, left }] for the current job, in the job's order
//   progress(state, jobs?)                { done, comfort, max, job, total, given } (total / given summed over the job's materials; done = the camp is finished)
//   validateGive({ critters, state, item, n, have, jobs? })   { ok: true, n } | { ok: false, reason }   reasons: bad-request | locked (no critter lives at the camp yet) |
//                                         done (every job finished) | not-needed (the job does not want it / already has all of it) | none (the bag holds none)
//                                         n is clamped: floored, never more than the bag holds or the job still needs
//   applyGive(state, item, n, jobs?)      { state, completed, comfort } -> a NEW state; `completed` is true when this gift finished the job (the state has already moved on:
//                                         comfort + 1, the next job, empty `given`)
//   normaliseState(raw, jobs?)            a saved / received state made safe: comfort clamped 0..max, job forced consistent with it, unknown or surplus gifts dropped
//   readSave(raw, jobs?) / buildSave(state)   the `camp` key of the shared Frostpine save file (game/frostSave.js)
//   hashView(state)                       the sorted state, for sync.hash()
import { CAMP_JOBS } from '../config.js';

export const SAVE_KEY = 'camp';

export const freshState = () => ({ comfort: 0, job: 0, given: {} });
export const currentJob = (state, jobs = CAMP_JOBS) => (state && jobs[state.job]) || null;

const whole = (v) => Math.max(0, Math.floor(Number(v)) || 0);

export function needed(state, itemId, jobs = CAMP_JOBS) {
  const j = currentJob(state, jobs);
  if (!j || !Object.prototype.hasOwnProperty.call(j.needs, itemId)) return 0;
  return Math.max(0, j.needs[itemId] - whole(state.given[itemId]));
}

export function remainingNeeds(state, jobs = CAMP_JOBS) {
  const j = currentJob(state, jobs);
  if (!j) return [];
  return Object.entries(j.needs).map(([item, need]) => {
    const given = Math.min(need, whole(state.given[item]));
    return { item, need, given, left: need - given };
  });
}

export function progress(state, jobs = CAMP_JOBS) {
  const rows = remainingNeeds(state, jobs);
  return {
    done: !currentJob(state, jobs), comfort: state.comfort, max: jobs.length, job: state.job,
    total: rows.reduce((a, r) => a + r.need, 0), given: rows.reduce((a, r) => a + r.given, 0),
  };
}

export function validateGive({ critters, state, item, n, have, jobs = CAMP_JOBS }) {
  if (typeof item !== 'string' || !state) return { ok: false, reason: 'bad-request' };
  const want = Number(n);
  if (!Number.isFinite(want) || want < 1) return { ok: false, reason: 'bad-request' };
  if (!(whole(critters) >= 1)) return { ok: false, reason: 'locked' };
  if (!currentJob(state, jobs)) return { ok: false, reason: 'done' };
  const left = needed(state, item, jobs);
  if (left < 1) return { ok: false, reason: 'not-needed' };
  const bag = whole(have);
  if (bag < 1) return { ok: false, reason: 'none' };
  return { ok: true, n: Math.min(Math.floor(want), left, bag) };
}

export function applyGive(state, item, n, jobs = CAMP_JOBS) {
  const j = currentJob(state, jobs);
  const add = Math.min(whole(n), needed(state, item, jobs));
  if (!j || add < 1) return { state: { comfort: state.comfort, job: state.job, given: { ...state.given } }, completed: false, comfort: state.comfort };
  const given = { ...state.given, [item]: whole(state.given[item]) + add };
  if (Object.entries(j.needs).every(([id, need]) => whole(given[id]) >= need)) {
    const comfort = Math.min(jobs.length, state.comfort + 1);
    return { state: { comfort, job: comfort, given: {} }, completed: true, comfort };
  }
  return { state: { comfort: state.comfort, job: state.job, given }, completed: false, comfort: state.comfort };
}

export function normaliseState(raw, jobs = CAMP_JOBS) {
  if (!raw || typeof raw !== 'object') return freshState();
  let comfort = Math.min(jobs.length, whole(raw.comfort));
  const out = { comfort, job: comfort, given: {} };      // `job` always follows `comfort`: a hand-edited or half-written save cannot skip a job
  const j = currentJob(out, jobs);
  if (j && raw.given && typeof raw.given === 'object') {
    for (const [id, need] of Object.entries(j.needs)) {
      const g = Math.min(need, whole(raw.given[id]));
      if (g > 0) out.given[id] = g;
    }
    if (Object.entries(j.needs).every(([id, need]) => (out.given[id] || 0) >= need)) {   // (a finished job never sits half-closed)
      comfort = Math.min(jobs.length, comfort + 1);
      return { comfort, job: comfort, given: {} };
    }
  }
  return out;
}

export const readSave = (raw, jobs = CAMP_JOBS) => normaliseState(raw && raw[SAVE_KEY], jobs);
export function buildSave(state) {
  const given = {};
  for (const id of Object.keys(state.given).sort()) if (state.given[id] > 0) given[id] = state.given[id];
  return { comfort: state.comfort, job: state.job, given };
}

export const hashView = (state) => buildSave(state);
