// Simulation-time clock and reusable lighting sample. No wall-clock catch-up while away.
// set(hour) wraps to 0..24; update(dt) crosses phase boundaries at their configured rates.
// Look colours are linear RGB; all interpolation targets/vectors are allocated once.
//
// World sync (Step 22b, domain 'daynight'; `clock.attachSync(sync)`). The HOST's clock is the authority: it emits event time {hour, locked, speed} every
// ~5 s of simulation time while it runs and on every phase change / set(). A REPLICA keeps running its own clock between updates (smooth sky) and
// EASES toward the host's hour (~1.2 s time constant, never jumping); when it is more than 0.25 h off (joining, a set(), a long pause) it snaps. The
// host's `locked` / speed are adopted, so the `?time` and `?daylock` URL flags of a replica are ignored (main.js builds its clock without them):
// the host's flags rule. Replicas never save the time (saving is off there). set(hour) on a replica is a debug request to the host.
// Step 25 turns the easing into a proper clock-offset estimate. hashView = {locked, speed} (the hour itself differs by the latency).
import * as THREE from 'three';
import { DAY_PHASES, PALETTE } from '../config.js';
import { NEW_GAME, loadSave, writeSave, clearSave } from '../game/save.js';

export const TIME_KEY = 'infinite-island.time.v1';
const wrap = (h) => ((h % 24) + 24) % 24;
const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const COLOR_KEYS = ['top', 'horizon', 'fog', 'hemiSky', 'hemiGround', 'light', 'shallow', 'deep', 'foam', 'cloud', 'emissive'];
const NUMBER_KEYS = ['hemiIntensity', 'lightIntensity', 'exposure', 'stars', 'warmth'];
const NOON = {
  top: PALETTE.skyTop, horizon: PALETTE.skyHorizon, fog: PALETTE.skyHorizon,
  hemiSky: '#d6efff', hemiGround: '#bff0a0', hemiIntensity: 0.9,
  light: '#fff1d6', lightIntensity: 2.7, exposure: 1,
  shallow: '#ffffff', deep: '#ffffff', foam: '#ffffff',
  cloud: '#ffffff', emissive: '#ffd6ea', stars: 0, warmth: 0,
};
const NIGHT = {
  top: '#151e4d', horizon: '#416d86', fog: '#416d86',
  hemiSky: '#adbdeb', hemiGround: '#8fa8b3', hemiIntensity: 0.85,     // bright enough that the toon ramp stays readable
  light: '#a8bfff', lightIntensity: 1.05, exposure: 1.0,
  shallow: '#698fba', deep: '#536d9f', foam: '#8da4c6',
  cloud: '#8196bd', emissive: '#344264', stars: 1, warmth: 0,
};
// Noon is exactly the pre-cycle palette, light intensities, cloud material and exposure.
export const DAY_KEYFRAMES = [
  { hour: 0, ...NIGHT },
  { hour: 5, ...NIGHT, top: '#343362', horizon: '#ad809e', fog: '#ad809e', stars: 0.65 },
  { hour: 6, ...NOON, top: '#9e91cb', horizon: '#ffd1b5', fog: '#ffd1b5', hemiSky: '#ded0ee', hemiGround: '#b0b8a0', light: '#ffbc85', lightIntensity: 1.5, cloud: '#ffcedb', emissive: '#d790ae', warmth: 1, stars: 0.1 },
  { hour: 7.5, ...NOON, top: '#92ceff', horizon: '#ffe4df', lightIntensity: 2.5 },
  { hour: 12, ...NOON },
  { hour: 16.5, ...NOON, top: '#8cbae9', horizon: '#ffe0b1', fog: '#ffe0b1', light: '#ffd4a0', lightIntensity: 2.4, cloud: '#ffe3c9', warmth: 0.35 },
  { hour: 18.5, ...NOON, top: '#765991', horizon: '#ffa077', fog: '#ffa077', hemiSky: '#d7acd5', hemiGround: '#ab9a9a', hemiIntensity: 0.75, light: '#ffa065', lightIntensity: 1.3, shallow: '#dbaed2', deep: '#b58fc4', foam: '#ffd8be', cloud: '#ffb39c', emissive: '#aa648a', warmth: 1, stars: 0.1 },
  { hour: 19.5, ...NIGHT, top: '#423a71', horizon: '#ac759f', fog: '#ac759f', lightIntensity: 0, cloud: '#b08bb6', stars: 0.5, warmth: 0.35 },
  { hour: 21, ...NIGHT },
].map((frame) => {
  for (const key of COLOR_KEYS) frame[key] = new THREE.Color(frame[key]);
  return frame;
});

function phaseAt(hour) {
  for (let i = 0; i < DAY_PHASES.length; i++) {
    const p = DAY_PHASES[i];
    if (p.start < p.end ? hour >= p.start && hour < p.end : hour >= p.start || hour < p.end) return i;
  }
  return 0;
}

export class DayNight {
  constructor({ params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search), persist = true } = {}) {
    this.persist = persist;
    this.speed = 1;
    this.locked = params.has('daylock');
    this._listeners = new Set();
    this._saveTime = 0;
    this._sync = null;
    this._syncTime = 0;
    this._ease = 0;                 // replica: hours still to add to the local clock to meet the host's
    if (persist && NEW_GAME) clearSave(TIME_KEY);
    const saved = persist && !NEW_GAME ? loadSave(TIME_KEY) : null;
    let hour = saved?.v === 1 && Number.isFinite(saved.hour) && saved.hour >= 0 && saved.hour < 24 ? saved.hour : 8;
    const flag = params.get('time');
    if (flag !== null && flag.trim() !== '') {
      const aliases = { dawn: 6, noon: 12, dusk: 18.5, night: 0 };
      const value = aliases[flag] ?? Number(flag);
      if (Number.isFinite(value)) hour = wrap(value);
    }
    this.hour = hour;
    this.phase = DAY_PHASES[phaseAt(hour)].name;
    this.look = {};
    for (const key of COLOR_KEYS) this.look[key] = new THREE.Color();
    this.sunDirection = new THREE.Vector3();
    this.moonDirection = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this._sample();
    this._save();
    if (persist && typeof window !== 'undefined') {
      this._onHide = () => this._save();
      this._onVisibility = () => { if (document.hidden) this._save(); };
      window.addEventListener('pagehide', this._onHide);
      document.addEventListener('visibilitychange', this._onVisibility);
    }
  }

  on(type, fn) {
    if (type !== 'phase') return () => {};
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _phase() {
    const phase = DAY_PHASES[phaseAt(this.hour)].name;
    if (phase === this.phase) return;
    this.phase = phase;
    for (const fn of this._listeners) fn(phase);
    this._emitTime();
  }

  set(hour) {
    if (!Number.isFinite(hour)) return;
    if (this._sync && this._sync.isReplica) { this._sync.request('daynight', 'set', { hour }); return; }   // debug: the host owns the clock
    this.hour = wrap(hour);
    this._sample();
    this._phase();
    this._save();
    this._emitTime();
  }

  // ---- world sync
  _timeState() { return { hour: Math.round(this.hour * 10000) / 10000, locked: this.locked, speed: this.speed }; }
  /** HOST: tell the replicas the hour (no-op without any). */
  _emitTime() {
    if (!this._sync || !this._sync.isHost) return;
    this._syncTime = 0;
    this._sync.emit('daynight', 'time', this._timeState());
  }

  /** REPLICA: adopt the host's clock state: snap when far off (or `snap`), else ease toward it. */
  _applyHost(d, snap) {
    if (!d || !Number.isFinite(d.hour)) return;
    this.locked = !!d.locked;
    if (Number.isFinite(d.speed) && d.speed > 0) this.speed = d.speed;
    let diff = wrap(d.hour) - this.hour;
    if (diff > 12) diff -= 24; else if (diff < -12) diff += 24;
    if (snap || Math.abs(diff) > 0.25) {
      this.hour = wrap(d.hour);
      this._ease = 0;
      this._sample();
      this._phase();
    } else {
      this._ease = diff;
    }
  }

  /** Register as the 'daynight' world-sync domain (see the header). */
  attachSync(sync) {
    this._sync = sync;
    sync.register('daynight', {
      snapshot: () => this._timeState(),
      hashView: () => ({ locked: this.locked, speed: this.speed }),
      applySnapshot: (st) => this._applyHost(st, true),
      applyEvent: (kind, st) => { if (kind === 'time') this._applyHost(st, false); },
      handleRequest: (kind, d) => {
        if (kind === 'set' && Number.isFinite(d.hour)) { this.set(d.hour); return true; }
        return { reject: 'unknown-kind' };
      },
    });
  }

  update(dt) {
    if (this._ease && Number.isFinite(dt) && dt > 0) {       // replica: glide toward the host's hour
      const step = Math.abs(this._ease) < 1e-4 ? this._ease : this._ease * (1 - Math.exp(-dt / 1.2));
      this.hour = wrap(this.hour + step);
      this._ease -= step;
      if (Math.abs(this._ease) < 1e-4) this._ease = 0;
      this._sample();
      this._phase();
    }
    if (this.locked || !Number.isFinite(dt) || dt <= 0 || !Number.isFinite(this.speed) || this.speed <= 0) return;
    let remaining = dt * this.speed;
    if (!Number.isFinite(remaining)) return;
    // Consume each phase separately: even a large deterministic step uses the right speed at dawn/midnight.
    while (remaining > 0) {
      const p = DAY_PHASES[phaseAt(this.hour)];
      const hours = wrap(p.end - p.start);
      const rate = hours / p.seconds;
      const until = wrap(p.end - this.hour) / rate;
      if (remaining + 1e-9 >= until) {
        this.hour = p.end;
        remaining = Math.max(0, remaining - until);
        this._sample();
        this._phase();
      } else {
        this.hour = wrap(this.hour + remaining * rate);
        remaining = 0;
      }
    }
    this._sample();
    this._saveTime += dt;
    if (this._saveTime >= 5) { this._saveTime = 0; this._save(); }
    if (this._sync) { this._syncTime += dt; if (this._syncTime >= 5) this._emitTime(); }     // host: periodic hour broadcast
  }

  _sample() {
    const h = this.hour;
    let i = DAY_KEYFRAMES.length - 1;
    while (i > 0 && DAY_KEYFRAMES[i].hour > h) i--;
    const a = DAY_KEYFRAMES[i], b = DAY_KEYFRAMES[(i + 1) % DAY_KEYFRAMES.length];
    const t = smooth((h - a.hour) / ((b.hour || 24) - a.hour));
    for (const key of COLOR_KEYS) this.look[key].copy(a[key]).lerp(b[key], t);
    for (const key of NUMBER_KEYS) this.look[key] = a[key] + (b[key] - a[key]) * t;
    this.daylight = h < 5 || h >= 20 ? 0 : h < 7 ? smooth((h - 5) / 2) : h < 18 ? 1 : 1 - smooth((h - 18) / 2);
    this.nightness = 1 - this.daylight;
    // An inclined arc passes through the original (48,70,34) noon direction exactly.
    const sunAngle = h >= 5.5 && h <= 12 ? (h - 5.5) / 6.5 * Math.PI / 2
      : h > 12 && h <= 19.5 ? Math.PI / 2 + (h - 12) / 7.5 * Math.PI / 2
      : Math.PI + wrap(h - 19.5) / 10 * Math.PI;
    const moonAngle = wrap(h - 19.5) / 10 * Math.PI;
    this.sunDirection.set(Math.cos(sunAngle) + 48 / 70 * Math.sin(sunAngle), Math.sin(sunAngle), 34 / 70 * Math.sin(sunAngle)).normalize();
    this.moonDirection.set(-Math.cos(moonAngle), Math.sin(moonAngle), 0.45 * Math.sin(moonAngle)).normalize();
    this.isMoon = h < 5.5 || h >= 19.5;
    this.direction.copy(this.isMoon ? this.moonDirection : this.sunDirection);
    // Fade the single shadow light to zero at BOTH hand-offs, before changing its direction.
    const crossing = Math.min(Math.abs(h - 5.5), Math.abs(h - 19.5));
    this.lightIntensity = this.look.lightIntensity * smooth(crossing / 0.5);
  }

  _save() { if (this.persist) writeSave(TIME_KEY, { v: 1, hour: this.hour }); }
  summary() { return { hour: this.hour, phase: this.phase, daylight: this.daylight, nightness: this.nightness, speed: this.speed, locked: this.locked, light: this.isMoon ? 'moon' : 'sun', intensity: this.lightIntensity }; }
  dispose() {
    this._save();
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this._onHide);
      document.removeEventListener('visibilitychange', this._onVisibility);
    }
    this._listeners.clear();
  }
}
