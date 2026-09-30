// Bootstrap: renderer, scene, loop. Wires world, input, player and the fixed-angle follow camera together.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MAX_PIXEL_RATIO, CAMERA_FOV, CAMERA_NEAR, CAMERA_FAR, INTERACT_RADIUS } from './config.js';
import { buildTerrain, getHeight } from './world/terrain.js';
import { createWater } from './world/water.js';
import { createSky } from './world/sky.js';
import { createProps } from './world/props.js';
import { getColliders, resolveCircle } from './world/colliders.js';
import { getInteractables, findNearest } from './world/interactables.js';
import { InputManager } from './input/inputManager.js';
import { KeyboardSource } from './input/keyboardSource.js';
import { GamepadSource } from './input/gamepadSource.js';
import { RemoteLink } from './net/remoteLink.js';
import { PeerLink } from './net/peerLink.js';
import { getTransport } from './net/transport.js';
import { RemoteSource } from './input/remoteSource.js';
import { TouchSource, wantsTouch } from './input/touchSource.js';
import { PairPanel } from './ui/pairPanel.js';
import { createHud } from './ui/hud.js';
import { Dialog } from './ui/dialog.js';
import { Particles } from './fx/particles.js';
import { createInteractions } from './world/interactions.js';
import { Player } from './player/player.js';
import { FollowCamera } from './camera/followCamera.js';
import { Sfx } from './audio/sfx.js';
import { createMuteButton } from './ui/muteButton.js';
import { TitleCard } from './ui/titleCard.js';
import { createAmbient } from './fx/ambient.js';

const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

// ---- Renderer
let pixelCap = MAX_PIXEL_RATIO;          // lowered to 1 by the automatic quality fallback
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelCap));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Neutral keeps the pastel palette true to its hex values (ACES would darken and desaturate it).
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
// PCFSoftShadowMap was removed in recent three.js; PCFShadowMap is the soft-filtered one now.
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);

// ---- Scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, CAMERA_NEAR, CAMERA_FAR);

// ---- World
const sky = createSky(scene);
const terrain = buildTerrain();
scene.add(terrain);
const water = createWater();
scene.add(water.group);
const props = createProps(scene);
scene.add(props.group);
const ambient = createAmbient({ scene, props, getHeight });   // butterflies, drifting petals, ocean glints
const sfx = new Sfx();                                        // WebAudio blips; wakes up on the first user gesture

// ---- Input, player, camera
const input = new InputManager();
const keyboard = input.addSource('keyboard', new KeyboardSource());
const player = new Player(scene);
const followCam = new FollowCamera(camera, { sun: sky.sun });
followCam.update(0, player.position);     // snap to the player before the first frame

// ---- HUD, dialog, particles, interactions
const hud = createHud(document.getElementById('hud'));
const gamepad = input.addSource('gamepad', new GamepadSource());
gamepad.on('connect', () => { hud.setInputConnected('gamepad', true); hud.toast('Controller connected!', { icon: 'gamepad' }); });
gamepad.on('disconnect', () => { hud.setInputConnected('gamepad', false); hud.toast('Controller disconnected', { icon: 'gamepad' }); });
if (gamepad.connected) hud.setInputConnected('gamepad', true);
const particles = new Particles(scene, { pool: 200, ground: getHeight });
const dialog = new Dialog(document.getElementById('hud'), {
  onOpen: () => { player.frozen = true; },
  onClose: () => { player.frozen = false; },
  onChar: () => sfx.play('blip'),
});
const interactions = createInteractions({ scene, player, hud, dialog, particles, sfx });

// ---- Phone controllers (PeerJS by default, or the local WebSocket relay with ?transport=ws) + pairing panel + on-screen touch controls
const hudRoot = document.getElementById('hud');
const link = getTransport() === 'ws' ? new RemoteLink() : new PeerLink();
const remote = input.addSource('remote', new RemoteSource(link));
let touch = null;
if (wantsTouch()) {
  touch = input.addSource('touch', new TouchSource(hudRoot));
}
const refreshPhoneIcon = () => hud.setInputConnected('phone', remote.count > 0 || !!touch);   // phone + touch share the phone slot
refreshPhoneIcon();
const pairPanel = new PairPanel(hudRoot, {
  canOpen: () => !dialog.isOpen,
  onOpen: () => { player.frozen = true; },
  onClose: () => { player.frozen = dialog.isOpen; },
});
link.on('room', (code) => pairPanel.setRoom(code));
link.on('controller-connected', (id) => {
  pairPanel.setControllers(link.controllers);
  refreshPhoneIcon();
  hud.toast('Phone controller connected!', { icon: 'phone' });
  sfx.play('chime');
});
link.on('controller-disconnected', (id) => {
  pairPanel.setControllers(link.controllers);
  refreshPhoneIcon();
  if (link.connected) hud.toast('Phone controller disconnected', { icon: 'phone' });
});
let target = null;                       // nearest interactable (drives the prompt bubble)

// ---- Sound: mute button + M key (persisted by Sfx), title card
createMuteButton(hudRoot, sfx);
sfx.onChange((muted) => {
  hud.toast(muted ? 'Sound off' : 'Sound on', { icon: muted ? 'muted' : 'speaker', duration: 1500 });
  if (!muted) sfx.play('pop');
});
window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyM' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target && e.target.tagName;
  if (t === 'INPUT' || t === 'TEXTAREA') return;
  sfx.unlock();
  sfx.toggleMute();
});
const title = new TitleCard(hudRoot, { duration: 2.6 });
window.addEventListener('pointerdown', () => title.dismiss(), { passive: true });

let controls = null;
if (DEBUG) {
  // ?debug: free OrbitControls camera (the player can still be moved with the keyboard).
  followCam.enabled = false;
  camera.position.set(0, 58, 92);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.5, -2);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.maxDistance = 220;
  controls.update();
}

// ---- Resize
let lastW = 0, lastH = 0, lastDpr = 0;
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (!w || !h) return;                 // hidden / minimised: keep the previous size until we get a real one
  lastW = w; lastH = h; lastDpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelCap));   // re-read DPR: it changes when the window moves between monitors
  renderer.setSize(w, h);
  followCam.resize(w, h);
}
window.addEventListener('resize', onResize);
onResize();

// ---- Automatic quality fallback: if the average frame time stays above 25 ms for 3 s, drop to pixelRatio 1 and a
// 1024 shadow map (once). Disabled with ?hq. Samples are skipped while the tab is hidden or right after load (shader compiles).
const quality = { level: 'high', avgMs: 0, lowered: false };
let qWarm = 2.5, qAcc = 0, qFrames = 0;
function lowerQuality() {
  quality.lowered = true;
  quality.level = 'low';
  pixelCap = 1;
  renderer.setPixelRatio(1);
  const shadow = sky.sun.shadow;
  shadow.mapSize.set(1024, 1024);
  if (shadow.map) { shadow.map.dispose(); shadow.map = null; }
  followCam.setShadowMapSize(1024);
  console.info(`[quality] avg frame ${quality.avgMs.toFixed(1)} ms > 25 ms: lowered to pixelRatio 1 + 1024 shadow map`);
}
function monitorPerf(rawDt) {
  if (quality.lowered || params.has('hq') || document.hidden) return;
  if (qWarm > 0) { qWarm -= Math.min(rawDt, 0.25); return; }
  if (rawDt > 0.5) return;                       // a pause (hidden tab, breakpoint), not a slow frame
  qAcc += rawDt; qFrames++;
  if (qAcc >= 3) {
    quality.avgMs = (qAcc / qFrames) * 1000;
    if (quality.avgMs > 25) lowerQuality(); else { qAcc = 0; qFrames = 0; }
  }
}

// ---- Simulation tick: input -> world actions -> player/camera -> fx -> HUD. Shared by the rAF loop and __game.step.
let simTime = 0;
function tick(dt) {
  simTime += dt;
  const actions = input.update();
  // Gamepad buttons are user activations too: let them wake the audio context.
  if (actions.activeSource === 'gamepad' && (actions.interactPressed || actions.cancelPressed)) sfx.unlock();
  if (!title.done && (Math.abs(actions.move.x) > 0.05 || Math.abs(actions.move.z) > 0.05 || actions.interactPressed || actions.cancelPressed)) title.dismiss();
  target = dialog.isOpen ? null : findNearest(player.position, INTERACT_RADIUS);
  if (pairPanel.isOpen) {
    if (actions.cancelPressed) sfx.play('bip');
    pairPanel.handleInput(actions.interactPressed, actions.cancelPressed);   // panel swallows the presses
  } else if (dialog.isOpen) {
    if (actions.cancelPressed) sfx.play('bip');
    else if (actions.interactPressed) sfx.play('pop', { pitch: 0.8, vol: 0.6 });
    dialog.handleInput(actions.interactPressed, actions.cancelPressed);   // dialog swallows the presses
  } else if (actions.interactPressed && target) {
    if (interactions.interact(target)) hud.suppressPrompt(0.7);
  } else if (actions.cancelPressed) {
    interactions.cancel();
  }
  player.update(dt, actions);
  followCam.update(dt, player.position);
  interactions.update(dt);
  dialog.update(dt);
  particles.update(dt, camera, renderer.domElement.height);
  hud.update(dt, { camera, target, activeSource: actions.activeSource, dialogOpen: dialog.isOpen });
  // ambient visuals (advance with the tick so __game.step drives them too)
  title.update(dt);
  water.update(simTime);
  props.update(simTime);
  sky.update(dt, camera);
  ambient.update(dt, simTime, player.position, camera, renderer.domElement.height);
}

// ---- Loop
// THREE.Clock is deprecated in recent three.js; THREE.Timer is its replacement (same getDelta/getElapsed idea).
const clock = new THREE.Timer();
function frame() {
  clock.update();
  const rawDt = clock.getDelta();
  monitorPerf(rawDt);
  // Cheap safety net besides the resize event (mobile URL bars, DPR changes, panes that were hidden at load).
  if (window.innerWidth !== lastW || window.innerHeight !== lastH || (window.devicePixelRatio || 1) !== lastDpr) onResize();
  tick(Math.min(rawDt, 0.1));
  if (controls) controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Expose for debugging. `step` advances player + camera deterministically (handy when rAF is throttled).
window.__game = {
  renderer, scene, camera, controls, terrain, water, sky, props, ambient, sfx, title, quality, lowerQuality,
  player, input, keyboard, gamepad, link, remote, touch, pairPanel, followCam, hud, dialog, particles, interactions,
  getColliders, resolveCircle, getInteractables, findNearest,
  get target() { return target; },
  step: (dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) tick(dt); },
};
