// Presentation-only combat helpers. No clock, combat state, or simulation writes.
import { JUICE } from '../config.js';

export function freezeWindow(now, previous = -Infinity, until = 0, seconds = 0) {
  if (now === previous) return { at: previous, until: Math.max(until, now + seconds) };
  if (now - previous < JUICE.freezeCooldown) return { at: previous, until };
  return { at: now, until: Math.max(until, now + seconds) };
}

export function warningGroup(kind) {
  if (['icicle', 'frostcone', 'spit', 'blob', 'burn'].includes(kind)) return 'out';
  if (['seed', 'charge', 'dive', 'snowball', 'fireball', 'lash'].includes(kind)) return 'dodge';
  return 'hop';
}

export const warningProgress = (wind, duration) => Math.max(0, Math.min(1, 1 - wind / Math.max(0.001, duration)));
export const distanceGain = (distance) => Math.max(0, 1 - distance / JUICE.sound.range);
export const shakeScale = (settings) => settings.shake === 'off' ? 0 : settings.shake === 'reduced' ? 0.5 : 1;
export function cleanJuiceSettings(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  return { shake: ['full', 'reduced', 'off'].includes(value.shake) ? value.shake : 'full', flashes: value.flashes === 'reduced' ? 'reduced' : 'full', numbers: typeof value.numbers === 'boolean' ? value.numbers : JUICE.numbers.default, nearbyNumbers: value.nearbyNumbers !== false };
}

// Admission includes scheduled start times, so offline stress renders obey the live voice rules.
export function admitVoice(voices, name, at, duration, limit = JUICE.sound.voices) {
  const live = voices.filter((v) => v.end > at);
  const same = live.filter((v) => v.name === name);
  if (same.some((v) => at >= v.at && at - v.at < JUICE.sound.throttle)) return { live, accepted: false, cut: null };
  const cut = same.length >= limit ? same[0] : null;
  return { live: cut ? live.filter((v) => v !== cut) : live, accepted: true, cut, voice: { name, at, end: at + duration } };
}
