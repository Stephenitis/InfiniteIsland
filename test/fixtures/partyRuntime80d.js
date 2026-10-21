// Real PlayerManager + party runtime harness for Step 80d integration checks; no renderer or browser required.
import * as THREE from 'three';
import { installDom, el } from './domStub.js';
import { MAX_PLAYERS } from '../../public/js/config.js';
import { SlotTable } from '../../public/js/players/slotTable.js';
import { PlayerManager } from '../../public/js/players/playerManager.js';
import { InputManager } from '../../public/js/input/inputManager.js';
import { createPlayersDomain } from '../../public/js/net/playersDomain.js';
import { WorldSync } from '../../public/js/net/worldSync.js';
import { FollowCamera } from '../../public/js/camera/followCamera.js';
import { createParty } from '../../public/js/game/party.js';
installDom();
document.createElementNS = () => el();
function makeHostPlayers() {
  const scene = new THREE.Scene(), sync = new WorldSync({ role: 'host' }), table = new SlotTable(MAX_PLAYERS);
  const toasts = [], bursts = [], particles = { burst: (...a) => bursts.push(a) };
  const hud = { toast: (t) => toasts.push(t), setRoster() {} };
  let pm = null;
  createPlayersDomain({ sync, table, onChange: () => pm && pm.slotsChanged(), hooks: { onFull: () => pm.onFull?.() } });
  pm = new PlayerManager({ scene, local: new InputManager(), hud, hudRoot: el(), particles, sync, table });
  return { scene, sync, table, pm, hud, toasts, particles, bursts };
}
export function makeRuntime() {
  const w = makeHostPlayers();
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 600), followCam = new FollowCamera(camera, {});
  const world = { root: { visible: true }, snap() {} }, water = { group: { visible: true } };
  const calls = { music: [], sfx: [], tempo: [] };
  const music = { party: (id) => calls.music.push(id), setTempo: (k) => calls.tempo.push(k) }, sfx = { play: (n) => calls.sfx.push(n) };
  const dialog = { isOpen: false, close() {}, open() {}, refresh() {} };
  const items = { heldBy: () => null }, avatars = { get: () => null, list: [], hideHeld: false };
  const party = createParty({ scene: w.scene, camera, followCam, players: w.pm, avatars, table: w.table, sync: w.sync, hud: w.hud, hudRoot: el(), dialog, particles: w.particles, sfx, music, items, world, water });
  const frame = (dt = 1 / 30) => { party.preInput(dt); w.pm.pollInput(dt); for (const p of w.pm.list) if (party.contains(p) && !p.away && !p.frozen) party.drive(p, p.actions, dt); w.pm.update(dt); party.update(dt, 0); party.afterItems(); party.afterAvatars(); };
  const run = (secs, until = null, dt = 1 / 30) => { for (let t = 0; t < secs - 1e-9; t += dt) { frame(dt); if (until && until()) return true; } return !until; };
  return { ...w, party, camera, followCam, calls, avatars, frame, run };
}

