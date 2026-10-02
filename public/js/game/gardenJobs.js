// Garden job progress shares the tested clamping / order rules of the Frostpine camp.
import { GARDEN_JOBS } from '../config.js';
import { normaliseState, currentJob, remainingNeeds, progress, validateGive, applyGive } from './campJobs.js';
const campState = (state) => ({ comfort: state.stage, job: state.stage, given: state.given || {} });
export const normaliseJobs = (state) => normaliseState(campState(state), GARDEN_JOBS);
export const jobsOpen = (state) => state.sown.length > 0 || state.plots.some((p) => p.stage !== 'empty');
export const gardenJob = (state) => currentJob(campState(state), GARDEN_JOBS);
export const gardenNeeds = (state) => remainingNeeds(campState(state), GARDEN_JOBS);
export const gardenProgress = (state) => ({ ...progress(campState(state), GARDEN_JOBS), stage: state.stage });
export const validateGardenGive = (state, item, n, have) => validateGive({ critters: jobsOpen(state) ? 1 : 0, state: campState(state), item, n, have, jobs: GARDEN_JOBS });
export function applyGardenGive(state, item, n) {
  const r = applyGive(campState(state), item, n, GARDEN_JOBS);
  return { state: { ...state, stage: r.comfort, given: r.state.given }, completed: r.completed };
}
