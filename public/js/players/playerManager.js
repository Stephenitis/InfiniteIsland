// PlayerManager: up to 4 couch co-op players sharing one screen (Step 11). Every DEVICE drives its own player.
//
// Devices
//   'local'            keyboard + host touch controls (one device). Always drives P1; it is what "solo" means.
//   'pad:<index>'      each gamepad (by its Gamepad API index)
//   'phone:<key>'      each phone controller, by its persistent clientId (a reload / reconnect gets its old player back)
//   'debug:<name>'     fake devices for tests (spawnDebugPlayer / fake)
// Every device has its own InputManager (deadzone + press-edge detection are reused, not re-implemented) so each device
// yields the usual actions object: { move:{x,z}, interactPressed, cancelPressed, interactHeld, cancelHeld, activeSource }.
//
// Claiming
//   - The first device to give real input (move / interact / cancel) claims P1 (`p1Owner`). Solo play works with any device.
//   - Every later non-local device that gives input gets the lowest free slot P2..P4 (spawn poof + "P2 joined!" toast);
//     with all 4 slots taken a throttled "Island is full (4 players)" toast shows instead.
//   - `local` always ALSO drives P1 when it is not the claimer (its actions are merged with the owner's).
// Leaving
//   - A gamepad / phone that disconnects keeps its player for DISCONNECT_GRACE_S seconds (it can come back), then the
//     player poofs away (the 'leave' event / `onDespawn` hook fires first; main.js uses 'leave' to drop the held item on the spot).
//   - P1 never despawns; when its owning device stays gone for the grace period P1 reverts to `local` and can be claimed again.
//
// Per frame (main.js): players.pollInput(dt) -> [game logic reading players.p1.actions] -> players.update(dt) ->
// followCam.update(dt, players.focus, players.cameraZoom(followCam)) -> players.updateFx(dt, camera).
//
// API for the game logic (main.js loops over players.list; items / harvest / interactions are per player):
//   players.list                 active Player objects (P1 first);  players.players[i] is the slot array (null = empty)
//   players.p1                   the always-present first Player
//   player.actions               that player's actions object this frame (same shape as InputManager.update())
//   player.index / player.colors / player.device (device id) / player.deviceKind ('keyboard'|'gamepad'|'phone') / player.away
//   players.on('join'|'leave'|'change', fn)  and the `onDespawn(player)` constructor option
//   players.frozenAll = true     freeze everybody (pair panel)
import * as THREE from 'three';
import { InputManager } from '../input/inputManager.js';
import {
  MAX_PLAYERS, PLAYER_COLORS, DISCONNECT_GRACE_S, TETHER_DISTANCE, PLAYER_PUSH_RADIUS,
} from '../config.js';
import { Player } from '../player/player.js';
import { getHeight, isWalkable } from '../world/terrain.js';
import { overlapsAny } from '../world/colliders.js';
import { PlayerVisuals } from './playerVisuals.js';

const TAU = Math.PI * 2;
const PUSH_RATE = 14;             // how fast overlapping players push apart (1/s)
const FULL_TOAST_GAP = 3;         // s between "island is full" toasts
const TETHER_TOAST_GAP = 3.5;
const RESEND_ASSIGN_S = 4;        // phones get their assignment again now and then (a missed message heals itself)
const SPAWN_POP = 0.35;           // s
const LEAVE_POP = 0.2;

const easeOutBack = (t) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** A source whose state is set by hand (debug / tests). */
class FakeSource {
  constructor(name) { this.name = name; this.analog = true; this.s = { x: 0, y: 0, interact: false, cancel: false }; this._tapI = false; this._tapC = false; }
  set(st) {
    if (st.interact && !this.s.interact) this._tapI = true;
    if (st.cancel && !this.s.cancel) this._tapC = true;
    this.s = { x: st.x || 0, y: st.y || 0, interact: !!st.interact, cancel: !!st.cancel };
  }
  poll() {
    const o = { ...this.s, interactTap: this._tapI, cancelTap: this._tapC };
    this._tapI = this._tapC = false;
    return o;
  }
}

function newActions() {
  return {
    move: { x: 0, z: 0 },
    interactPressed: false, cancelPressed: false,
    interactHeld: false, cancelHeld: false,
    held: { interact: false, cancel: false },
    activeSource: 'keyboard',
  };
}

const moveMag = (a) => Math.hypot(a.move.x, a.move.z);
const hasInput = (a) => moveMag(a) > 0.001 || a.interactPressed || a.cancelPressed || a.interactHeld || a.cancelHeld;

/** out = merge of a (and optionally b): biggest stick wins, buttons OR-ed. `lastActive` keeps the glyph stable when idle. */
function mergeInto(out, a, b) {
  let best = a, bestM = moveMag(a);
  if (b) { const m = moveMag(b); if (m > bestM) { best = b; bestM = m; } }
  out.move.x = bestM > 0 ? best.move.x : 0;
  out.move.z = bestM > 0 ? best.move.z : 0;
  out.interactPressed = a.interactPressed || (!!b && b.interactPressed);
  out.cancelPressed = a.cancelPressed || (!!b && b.cancelPressed);
  out.interactHeld = a.interactHeld || (!!b && b.interactHeld);
  out.cancelHeld = a.cancelHeld || (!!b && b.cancelHeld);
  out.held.interact = out.interactHeld;
  out.held.cancel = out.cancelHeld;
  if (bestM > 0) out.activeSource = best.activeSource;
  else if (hasInput(a)) out.activeSource = a.activeSource;
  else if (b && hasInput(b)) out.activeSource = b.activeSource;
  else if (!b) out.activeSource = a.activeSource;
}

function zeroActions(out) {
  out.move.x = out.move.z = 0;
  out.interactPressed = out.cancelPressed = out.interactHeld = out.cancelHeld = false;
  out.held.interact = out.held.cancel = false;
}

export class PlayerManager {
  /**
   * @param {object} o
   * @param {THREE.Scene} o.scene
   * @param {InputManager} o.local     the keyboard (+ host touch) InputManager = the 'local' device
   * @param {GamepadSource} [o.gamepads]
   * @param {RemoteSource} [o.remote]
   * @param {object} o.hud             createHud() result (toast, setRoster)
   * @param {HTMLElement} o.hudRoot
   * @param {Particles} o.particles
   * @param {Sfx} [o.sfx]
   * @param {'keyboard'|'phone'} [o.localKind]   icon for the local device (phone when the host page has touch controls)
   * @param {(player) => void} [o.onDespawn]     called before a player poofs away (main.js prefers players.on('leave'))
   */
  constructor({ scene, local, gamepads = null, remote = null, hud, hudRoot, particles, sfx = null, localKind = 'keyboard', onDespawn = null }) {
    this.scene = scene;
    this.hud = hud;
    this.particles = particles;
    this.sfx = sfx;
    this.gamepads = gamepads;
    this.remote = remote;
    this.onDespawn = onDespawn;
    this.localKind = localKind;
    this.frozenAll = false;
    this.activity = false;            // any device gave real input this frame
    this.gamepadPressed = false;      // a gamepad button went down this frame (audio unlock)
    this.focus = new THREE.Vector3(); // centroid of the active players (camera target)
    this.extent = { x: 0, z: 0 };     // 2 x max distance of a player from the centroid along each axis
    this._handlers = {};
    this._time = 0;
    this._lastFullToast = -99;
    this._lastTetherToast = -99;
    this._tetherHit = false;
    this._rosterSig = '';
    this._dirty = true;
    this._fakeN = 0;

    this.visuals = new PlayerVisuals(hudRoot);
    this.devices = new Map();
    this.p1Owner = null;              // device id that claimed P1 (null = nobody yet / reverted to local)

    this._guard = (p, x, z) => this._tetherOk(p, x, z);

    // slot array; P1 always exists (it is what the rest of the game is wired to)
    this.players = new Array(MAX_PLAYERS).fill(null);
    const p1 = this._createPlayer(0, undefined, undefined);
    this.players[0] = p1;

    const localDev = this._makeDevice('local', 'local', local);
    localDev.playerIndex = 0;
    p1.device = 'local';
    p1.deviceKind = localKind === 'phone' ? 'phone' : 'keyboard';
    this.local = localDev;
    this._updateFocus();
  }

  // ------------------------------------------------------------------ accessors
  get p1() { return this.players[0]; }
  /** Active (non-despawning) players, P1 first. */
  get list() { return this.players.filter((p) => p && !p.leaving); }
  get count() { return this.list.length; }
  get multi() { return this.count > 1; }
  get(i) { return this.players[i] || null; }

  on(type, fn) { (this._handlers[type] ||= []).push(fn); return this; }
  _emit(type, ...args) {
    for (const fn of this._handlers[type] || []) { try { fn(...args); } catch (e) { console.error(`PlayerManager handler (${type}):`, e); } }
  }
  _touch() { this._dirty = true; }

  // ------------------------------------------------------------------ devices
  _makeDevice(id, kind, input, extra = {}) {
    const d = { id, kind, input, connected: true, playerIndex: -1, awayT: 0, announce: false, act: null, ...extra };
    this.devices.set(id, d);
    this._touch();
    return d;
  }

  /** True if a "<label> connected" toast went out in the last 3 s (adapter ports can appear over several frames). */
  _recentAnnounce(label) {
    const now = performance.now();
    this._announceAt = this._announceAt || new Map();
    const last = this._announceAt.get(label) || -Infinity;
    if (now - last < 3000) return true;
    this._announceAt.set(label, now);
    return false;
  }

  _padDevice(index) {
    const id = `pad:${index}`;
    let d = this.devices.get(id);
    if (d) return d;
    const im = new InputManager({ activeSource: 'gamepad' });
    im.addSource('gamepad', this.gamepads.view(index));
    d = this._makeDevice(id, 'gamepad', im, { padIndex: index, announce: true });
    return d;
  }

  _phoneDevice(key) {
    const id = `phone:${key}`;
    let d = this.devices.get(id);
    if (d) return d;
    const im = new InputManager({ activeSource: 'remote' });
    im.addSource('remote', this.remote.view(key));
    d = this._makeDevice(id, 'phone', im, { key });
    return d;
  }

  /** Create a fake device (tests). `kind` picks the icon ('gamepad' | 'phone' | 'keyboard'). */
  fakeDevice(id, kind = 'gamepad') {
    const key = id.startsWith('debug:') ? id : `debug:${id}`;
    let d = this.devices.get(key);
    if (d) return d;
    const src = new FakeSource(kind === 'phone' ? 'remote' : kind);
    const im = new InputManager({ activeSource: src.name });
    im.addSource(src.name, src);
    d = this._makeDevice(key, kind, im, { fake: src });
    return d;
  }

  _deviceKindOf(id) {
    const d = this.devices.get(id);
    if (!d) return 'gamepad';
    return d.kind === 'local' ? (this.localKind === 'phone' ? 'phone' : 'keyboard') : d.kind;
  }

  _markAway(d) {
    if (!d.connected) return;
    d.connected = false;
    d.awayT = 0;
    if (d.playerIndex >= 0) {
      const p = this.players[d.playerIndex];
      if (p) {
        if (d.playerIndex > 0) { p.away = true; this.visuals.setAway(p, true); }   // P1 stays drivable from the keyboard
        this.hud.toast(`${p.colors.name}'s ${d.kind === 'phone' ? 'phone' : 'controller'} disconnected`, { icon: d.kind === 'phone' ? 'phone' : 'gamepad' });
      }
    }
    this._touch();
  }

  _markBack(d) {
    if (d.connected) return;
    d.connected = true;
    d.awayT = 0;
    if (d.playerIndex >= 0) {
      const p = this.players[d.playerIndex];
      if (p) {
        p.away = false;
        this.visuals.setAway(p, false);
        this.visuals.showTags(2.5);
        this.hud.toast(`${p.colors.name} is back!`, { icon: 'sparkle' });
        this._assign(d, true);
      }
    }
    this._touch();
  }

  _dropDevice(d) {
    this.devices.delete(d.id);
    if (this.p1Owner === d.id) this.p1Owner = null;
    this._touch();
  }

  /** Sync the device list with the gamepad / phone hubs. */
  _syncDevices() {
    if (this.gamepads) {
      this.gamepads.sync();
      for (const [index] of this.gamepads.pads) {
        const d = this._padDevice(index);
        if (!d.connected) this._markBack(d);
      }
      for (const d of [...this.devices.values()]) {
        if (d.kind === 'gamepad' && !d.fake && !this.gamepads.pads.has(d.padIndex)) this._markAway(d);
      }
    }
    if (this.remote) {
      for (const [key, c] of this.remote.clients) {
        const id = `phone:${key}`;
        const d = this.devices.get(id) || this._phoneDevice(key);
        if (!d.connected) this._markBack(d);
        else if (d.fresh !== c.id) { d.fresh = c.id; if (d.playerIndex >= 0) this._assign(d, true); }   // reconnected on a new link connection
      }
      for (const d of [...this.devices.values()]) {
        if (d.kind === 'phone' && !d.fake && !this.remote.clients.has(d.key)) this._markAway(d);
      }
    }
  }

  // ------------------------------------------------------------------ per-frame input
  /** Poll every device, apply the claim / leave rules and fill `player.actions`. Call before the game logic reads actions. */
  pollInput(dt) {
    this._time += dt;
    this.activity = false;
    this.gamepadPressed = false;
    this._syncDevices();

    // poll each device once (each has its own edge detector)
    for (const d of this.devices.values()) {
      d.act = d.connected ? d.input.update() : null;
    }

    // claims
    const localAct = this.local.act;
    if (hasInput(localAct)) {
      this.activity = true;
      if (this.p1Owner === null) { this.p1Owner = 'local'; this._touch(); }
    }
    for (const d of this.devices.values()) {
      if (d.id === 'local' || !d.connected || !d.act) continue;
      if (!hasInput(d.act)) continue;
      this.activity = true;
      if (d.kind === 'gamepad' && (d.act.interactPressed || d.act.cancelPressed)) this.gamepadPressed = true;
      if (d.playerIndex >= 0) continue;
      this._claim(d);
    }

    // connect hint for pads that appeared without claiming (browsers expose a pad on its first button press).
    // One toast per kind of pad: multi-port adapters (GameCube) show up as several pads at once, even empty ports.
    const announced = new Set();
    for (const d of this.devices.values()) {
      if (!d.announce) continue;
      d.announce = false;
      if (d.playerIndex < 0 && d.connected) {
        const pad = d.padIndex != null ? this.gamepads.pads.get(d.padIndex) : null;
        const label = (pad && pad.profile && pad.profile.label) || 'Controller';
        if (announced.has(label) || this._recentAnnounce(label)) continue;
        announced.add(label);
        this.hud.toast(`${label} connected - press A to join`, { icon: 'gamepad' });
      }
    }

    // route actions to players
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const p = this.players[i];
      if (!p) continue;
      const out = p.actions;
      let owner = null;
      for (const d of this.devices.values()) if (d.playerIndex === i && d.id !== 'local') { owner = d; break; }
      const ownerAct = owner && owner.connected && owner.act ? owner.act : null;
      if (i === 0) {
        if (ownerAct) mergeInto(out, ownerAct, localAct);
        else mergeInto(out, localAct, null);
      } else if (ownerAct) {
        mergeInto(out, ownerAct, null);
      } else {
        zeroActions(out);
      }
      if (p.leaving) zeroActions(out);
    }

    // grace timers
    for (const d of [...this.devices.values()]) {
      if (d.connected) continue;
      if (d.playerIndex < 0) { this._dropDevice(d); continue; }
      d.awayT += dt;
      if (d.awayT >= DISCONNECT_GRACE_S) this._expire(d);
    }

    // periodically re-send assignments to phones (idempotent on the controller)
    for (const d of this.devices.values()) {
      if (d.kind !== 'phone' || d.playerIndex < 0 || !d.connected || d.fake) continue;
      d.resend = (d.resend || 0) + dt;
      if (d.resend >= RESEND_ASSIGN_S) this._assign(d, false);
    }
    this._refreshRoster();
  }

  _claim(d) {
    if (this.p1Owner === null) {
      // first device to give input claims P1
      this.p1Owner = d.id;
      this._bind(d, 0);
      return;
    }
    for (let i = 1; i < MAX_PLAYERS; i++) {
      if (!this.players[i]) { this._spawn(i, d); return; }
    }
    if (this._time - this._lastFullToast > FULL_TOAST_GAP) {
      this._lastFullToast = this._time;
      this.hud.toast(`Island is full (${MAX_PLAYERS} players)`, { icon: 'sparkle' });
    }
  }

  _bind(d, index) {
    d.playerIndex = index;
    const p = this.players[index];
    if (p) {
      p.device = d.id;
      p.deviceKind = this._deviceKindOf(d.id);
      p.away = false;
      p.actions.activeSource = d.input.state.activeSource;
      this.visuals.setAway(p, false);
    }
    this._assign(d, true);
    this._touch();
  }

  /** The device stayed away for the whole grace period. */
  _expire(d) {
    const i = d.playerIndex;
    const p = this.players[i];
    if (i === 0) {
      // P1 never despawns: it reverts to local and becomes claimable again
      d.playerIndex = -1;
      if (p) { p.device = 'local'; p.deviceKind = this._deviceKindOf('local'); p.away = false; this.visuals.setAway(p, false); }
      this._dropDevice(d);
      this.hud.toast(`P1 is back on ${this.localKind === 'phone' ? 'touch' : 'the keyboard'}`, { icon: this.localKind === 'phone' ? 'phone' : 'keyboard' });
    } else if (p) {
      this._despawn(p);
      this._dropDevice(d);
    } else {
      this._dropDevice(d);
    }
  }

  // ------------------------------------------------------------------ spawn / despawn
  _createPlayer(index, x, z) {
    const colors = PLAYER_COLORS[index];
    const p = new Player(this.scene, { x, z, colors, index });
    p.actions = newActions();
    p.device = null;
    p.deviceKind = 'keyboard';
    p.away = false;
    p.leaving = 0;               // >0 while poofing away (seconds elapsed)
    p.spawnT = -1;               // >=0 while popping in
    p.moveGuard = this._guard;
    this.visuals.attach(p);
    return p;
  }

  /** A walkable, collider-free spot near P1 for a newcomer. */
  _findSpawn(slot) {
    const a0 = this.p1.position;
    const base = [0, 0, Math.PI, Math.PI / 2][slot] || 0;
    const others = this.list;
    for (const r of [1.7, 2.3, 3.1, 4.2, 5.6]) {
      for (let k = 0; k < 12; k++) {
        const ang = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (TAU / 12) * (k === 0 ? 0 : 1);
        const x = a0.x + Math.cos(ang) * r, z = a0.z + Math.sin(ang) * r;
        if (!isWalkable(x, z) || getHeight(x, z) < 0.15 || overlapsAny(x, z, 0.6)) continue;
        let clear = true;
        for (const q of others) if (Math.hypot(q.position.x - x, q.position.z - z) < 1.1) { clear = false; break; }
        if (clear) return { x, z };
      }
    }
    return { x: a0.x, z: a0.z };
  }

  _poof(pos, colors) {
    const at = { x: pos.x, y: pos.y + 0.5, z: pos.z };
    this.particles.burst('puff', at, { count: 12, radius: 0.55, height: 0.35, size: 1.5, speed: 1.3 });
    this.particles.burst('sparkle', at, { count: 9, radius: 0.5, height: 0.4, color: colors.ui, speed: 1.2 });
    this.particles.burst('sparkle', at, { count: 4, radius: 0.4, height: 0.4, color: '#ffffff', speed: 0.9 });
  }

  _spawn(slot, device) {
    const { x, z } = this._findSpawn(slot);
    const p = this._createPlayer(slot, x, z);
    this.players[slot] = p;
    p.root.scale.setScalar(0.01);
    p.spawnT = 0;
    p.facing = 0;
    this._poof(p.position, p.colors);
    if (this.sfx) this.sfx.play('pop', { pitch: 1.15 });
    if (device) this._bind(device, slot);
    this.visuals.showTags(3);
    this.hud.toast(`${p.colors.name} joined!`, { icon: 'sparkle' });
    this._emit('join', p);
    this._touch();
    return p;
  }

  _despawn(p) {
    if (!p || p.index === 0 || p.leaving) return;
    if (this.onDespawn) { try { this.onDespawn(p); } catch (e) { console.error(e); } }   // (also emitted as 'leave' just below)
    this._emit('leave', p);
    p.leaving = 0.0001;
    p.frozen = true;
    this._poof(p.position, p.colors);
    if (this.sfx) this.sfx.play('bip', { pitch: 1.2 });
    this.hud.toast(`${p.colors.name} left`, { icon: 'sparkle' });
    this._touch();
  }

  _finishDespawn(p) {
    this.visuals.detach(p);
    p.dispose();
    if (this.players[p.index] === p) this.players[p.index] = null;
    this._touch();
  }

  // ------------------------------------------------------------------ tether + push
  _tetherOk(p, x, z) {
    for (const q of this.players) {
      if (!q || q === p || q.leaving || q.away) continue;
      const nd = Math.hypot(x - q.position.x, z - q.position.z);
      if (nd <= TETHER_DISTANCE) continue;
      const cur = Math.hypot(p.position.x - q.position.x, p.position.z - q.position.z);
      if (nd > cur) { this._tetherHit = true; return false; }
    }
    return true;
  }

  _separate(dt) {
    const act = this.list;
    if (act.length < 2) return;
    const k = Math.min(1, PUSH_RATE * dt) * 0.5;
    for (let i = 0; i < act.length; i++) {
      for (let j = i + 1; j < act.length; j++) {
        const a = act[i], b = act[j];
        let dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
        let d = Math.hypot(dx, dz);
        if (d >= PLAYER_PUSH_RADIUS) continue;
        if (d < 1e-4) { const ang = (a.index * 2.1 + b.index * 0.7) % TAU; dx = Math.cos(ang); dz = Math.sin(ang); d = 1; }
        const nx = dx / d, nz = dz / d;
        const push = (PLAYER_PUSH_RADIUS - Math.min(d, PLAYER_PUSH_RADIUS)) * k;
        a.nudge(-nx * push, -nz * push);
        b.nudge(nx * push, nz * push);
      }
    }
  }

  // ------------------------------------------------------------------ per-frame update
  /** Advance every player (movement, tether, soft push, spawn / despawn pops). */
  update(dt) {
    this._tetherHit = false;
    const frozen = this.frozenAll;
    for (const p of this.players) {
      if (!p) continue;
      p.paused = frozen;
      p.update(dt, p.actions);
      if (p.spawnT >= 0) {
        p.spawnT += dt;
        const u = clamp01(p.spawnT / SPAWN_POP);
        p.root.scale.setScalar(Math.max(0.01, easeOutBack(u)));
        if (u >= 1) { p.spawnT = -1; p.root.scale.setScalar(1); }
      }
      if (p.leaving > 0) {
        p.leaving += dt;
        const u = clamp01(p.leaving / LEAVE_POP);
        p.root.scale.setScalar(Math.max(0.01, 1 - u * u));
        if (u >= 1) this._finishDespawn(p);
      }
    }
    this._separate(dt);
    if (this._tetherHit && this._time - this._lastTetherToast > TETHER_TOAST_GAP) {
      this._lastTetherToast = this._time;
      this.hud.toast('Stay closer together!', { icon: 'sparkle', duration: 1800 });
    }
    this._updateFocus();
  }

  _updateFocus() {
    const act = this.list;
    let sx = 0, sy = 0, sz = 0;
    for (const p of act) { sx += p.position.x; sy += p.position.y; sz += p.position.z; }
    const n = act.length || 1;
    const cx = sx / n, cz = sz / n;
    this.focus.set(cx, sy / n, cz);
    let ex = 0, ez = 0;
    for (const p of act) { ex = Math.max(ex, Math.abs(p.position.x - cx)); ez = Math.max(ez, Math.abs(p.position.z - cz)); }
    this.extent.x = ex * 2;
    this.extent.z = ez * 2;
  }

  /** Zoom target for the FollowCamera (1 when solo). */
  cameraZoom(followCam) {
    if (this.count < 2) return 1;
    return followCam.zoomForExtent(this.extent.x, this.extent.z);
  }

  /** Rings + name tags (after the camera moved). */
  updateFx(dt, camera) {
    this.visuals.update(dt, camera, { multi: this.count > 1 });
  }

  // ------------------------------------------------------------------ phones
  _assign(d, fresh) {
    if (d.kind !== 'phone' || d.fake || !this.remote || d.playerIndex < 0) return;
    d.resend = 0;
    const c = PLAYER_COLORS[d.playerIndex];
    this.remote.sendTo(d.key, { type: 'assign', player: d.playerIndex + 1, color: c.ui, hat: c.hat, shirt: c.shirt, fresh: !!fresh });
  }

  /** Phones for the pair panel: [{ key, label: 'P2' | null, color }]. */
  phones() {
    const out = [];
    for (const d of this.devices.values()) {
      if (d.kind !== 'phone') continue;
      const c = d.playerIndex >= 0 ? PLAYER_COLORS[d.playerIndex] : null;
      out.push({ key: d.key, label: c ? c.name : null, color: c ? c.ui : null, away: !d.connected });
    }
    return out;
  }

  // ------------------------------------------------------------------ roster
  _refreshRoster() {
    if (!this._dirty) return;          // every roster-relevant change goes through _touch()
    const slots = [];
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const p = this.players[i];
      const c = PLAYER_COLORS[i];
      if (!p || p.leaving) { slots.push({ state: 'empty', label: c.name, color: c.ui, icons: [] }); continue; }
      const icons = [];
      if (i === 0) {
        icons.push(this.localKind === 'phone' ? 'phone' : 'keyboard');
        const ownerId = this.p1Owner && this.p1Owner !== 'local' ? this.p1Owner : null;
        if (ownerId) icons.push(this._deviceKindOf(ownerId));
      } else {
        icons.push(p.deviceKind);
      }
      slots.push({ state: p.away ? 'away' : 'active', label: c.name, color: c.ui, icons: [...new Set(icons)] });
    }
    const sig = JSON.stringify(slots);
    this._dirty = false;
    if (sig === this._rosterSig) { this._emit('change'); return; }
    this._rosterSig = sig;
    this.hud.setRoster(slots);
    this._emit('change');
  }

  // ------------------------------------------------------------------ debug / tests
  /**
   * Spawn a player driven by a fake device (no hardware needed). Returns the Player. Drive it with `fake(id, {x, y, interact, cancel})`.
   * @param {string} [id]     device name (default debug-N)
   * @param {'gamepad'|'phone'} [kind]
   */
  spawnDebugPlayer(id = `dbg${++this._fakeN}`, kind = 'gamepad') {
    const d = this.fakeDevice(id, kind);
    if (d.playerIndex >= 0) return this.players[d.playerIndex];
    if (this.p1Owner === null) this.p1Owner = 'local';      // debug devices always join as a NEW player (P2+)
    this._claim(d);
    return d.playerIndex >= 0 ? this.players[d.playerIndex] : null;
  }

  /** Set the state of a fake device: fake('dbg1', { x: 1, y: 0, interact: false }). Creates and claims it on first use. */
  fake(id, state = {}, kind = 'gamepad') {
    const d = this.fakeDevice(id, kind);
    d.fake.set(state);
    return d;
  }

  /** Disconnect a fake device (starts the grace period, like unplugging a pad). */
  unplug(id) { const d = this.devices.get(id.startsWith('debug:') ? id : `debug:${id}`); if (d) { d.fake.set({}); d.connected = true; this._markAway(d); } }
  /** Re-connect a fake device that was unplugged within the grace period. */
  replug(id) { const d = this.devices.get(id.startsWith('debug:') ? id : `debug:${id}`); if (d) this._markBack(d); }

  /** Compact summary of the players and devices. */
  summary() {
    return {
      p1Owner: this.p1Owner,
      players: this.players.map((p) => p && {
        name: p.colors.name, x: +p.position.x.toFixed(2), z: +p.position.z.toFixed(2), device: p.device, kind: p.deviceKind,
        away: p.away, leaving: p.leaving > 0, hat: p.colors.hat,
      }),
      devices: [...this.devices.values()].map((d) => ({ id: d.id, kind: d.kind, connected: d.connected, player: d.playerIndex, awayT: +d.awayT.toFixed(1) })),
      zoom: null,
    };
  }
}
