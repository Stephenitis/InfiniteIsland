// Bootstrap: renderer, scene, loop. Wires world, input, player and the fixed-angle follow camera together.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VERSION, MAX_PIXEL_RATIO, CAMERA_FOV, CAMERA_NEAR, CAMERA_FAR, INTERACT_RADIUS, CAMPFIRE } from './config.js';
import { buildTerrain, getHeight } from './world/terrain.js';
import { createWater } from './world/water.js';
import { createSky } from './world/sky.js';
import { DayNight } from './world/dayNight.js';
import { createTimeDial } from './ui/timeDial.js';
import { createProps } from './world/props.js';
import { getColliders, resolveCircle } from './world/colliders.js';
import { getInteractables, findNearest } from './world/interactables.js';
import { InputManager } from './input/inputManager.js';
import { KeyboardSource } from './input/keyboardSource.js';
import { GamepadSource } from './input/gamepadSource.js';
import { PlayerManager } from './players/playerManager.js';
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
import { createItems } from './world/items.js';
import { createHarvest } from './world/harvest.js';
import { createPickups } from './world/pickups.js';
import { createGathering } from './world/gathering.js';
import { createCampfire } from './world/campfire.js';
import { Inventory } from './game/inventory.js';
import { QuestLog } from './game/quests.js';
import { createQuestMenu } from './game/questMenu.js';
import { createFeastScene } from './game/feastScene.js';
import { createInventoryBar } from './ui/inventoryBar.js';
import { createQuestTracker } from './ui/questTracker.js';
import { getToolAction } from './items/tools.js';
import { FollowCamera } from './camera/followCamera.js';
import { Sfx } from './audio/sfx.js';
import { Music } from './audio/music.js';
import { createMuteButton } from './ui/muteButton.js';
import { createMusicButton } from './ui/musicButton.js';
import { createOptionsMenu } from './ui/optionsMenu.js';
import { createFullscreenPrompt } from './ui/fullscreenPrompt.js';
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
const dayNight = new DayNight({ params });
sky.setTimeOfDay(dayNight);
renderer.toneMappingExposure = dayNight.look.exposure;
const terrain = buildTerrain();
scene.add(terrain);
const water = createWater();
scene.add(water.group);
water.setTimeOfDay(dayNight);
const props = createProps(scene);
scene.add(props.group);
const ambient = createAmbient({ scene, props, getHeight, clock: dayNight, campfire: CAMPFIRE });   // butterflies (day), fireflies (night), drifting petals, ocean glints
const sfx = new Sfx();                                        // WebAudio blips; wakes up on the first user gesture
const music = new Music(sfx);                                 // cycling procedural background tracks (starts after the first gesture)

// ---- HUD, particles
const hudRoot = document.getElementById('hud');
hudRoot.classList.toggle('touch-host', wantsTouch());
const hud = createHud(hudRoot);
const particles = new Particles(scene, { pool: 420, ground: getHeight });

// ---- Input devices. Each DEVICE drives its own player (see players/playerManager.js):
//   'local' = keyboard + host touch controls (an InputManager of its own), every gamepad, every phone controller.
// Phone controllers: PeerJS by default, or the local WebSocket relay with ?transport=ws.
const input = new InputManager();
const keyboard = input.addSource('keyboard', new KeyboardSource());
let touch = null;
if (wantsTouch()) touch = input.addSource('touch', new TouchSource(hudRoot));
const gamepad = new GamepadSource();
const link = getTransport() === 'ws' ? new RemoteLink() : new PeerLink();
const remote = new RemoteSource(link);

// ---- Players + camera. Every player (up to 4) has its own target / prompt, held item, swing and hits; P1 always exists.
const players = new PlayerManager({
  scene, local: input, gamepads: gamepad, remote, hud, hudRoot, particles, sfx,
  localKind: touch ? 'phone' : 'keyboard',
});
const player = players.p1;                // (debug handle only: the game logic below loops over players.list)
const followCam = new FollowCamera(camera, { sun: sky.sun });
followCam.update(0, players.focus);       // snap to the players before the first frame

// ---- Shared inventory (one bag for every player, saved in localStorage; ?newgame resets) + its HUD bar (bottom-left; top-left under touch controls).
// collect() is THE way to put something in the bag at a world point (walk-over pickups, picking herbs, later cooking / quests):
// inventory.add + the floating "+1 Apple" text at that point, tinted with the collecting player's colour when several are playing.
const inventory = new Inventory();
const invBar = createInventoryBar(hudRoot, inventory, { top: !!touch });
const collect = (id, n = 1, at = null, by = null) => {
  inventory.add(id, n);
  if (at) invBar.float(id, n, at, by && players.multi ? by.colors.ui : null);
};
const pickups = createPickups({ scene, players, particles, sfx, collect });   // ground items that fly to whoever walks up to them

// ---- Dialog, interactions. The dialog belongs to the player who opened it: only that player is frozen and drives it.
const dialog = new Dialog(document.getElementById('hud'), {
  onOpen: (d) => { if (d.owner) d.owner.frozen = true; touch?.widget.reset(); },
  onClose: (d) => { if (d.owner) d.owner.frozen = false; touch?.widget.reset(); },
  onChar: () => sfx.play('blip'),
  onMenu: (kind) => {                          // choice-menu sounds (campfire): move tick / select pop / back or denied bip
    if (kind === 'move') sfx.play('pop', { pitch: 1.3, vol: 0.5 });
    else if (kind === 'select') sfx.play('pop', { pitch: 0.9, vol: 0.7 });
    else sfx.play('bip', kind === 'denied' ? { pitch: 0.7 } : {});
  },
});
const interactions = createInteractions({ scene, players, hud, dialog, particles, sfx, pickups });
const items = createItems({ scene, players, particles, hud, sfx });   // equippable tools + lightsabers (registers 'item' interactables)
let hitStopT = 0;                                                     // real seconds of hit-stop left (the sim runs at ~8% speed meanwhile)
const harvest = createHarvest({                                       // chopping trees / breaking rocks (needs items for the swing)
  scene, players, items, particles, hud, sfx, interactions, props, pickups, camera: followCam,
  hitStop: (s) => { hitStopT = Math.max(hitStopT, s); },
});
// berries, herbs, mushrooms, dig spots (must come after createInteractions: it wraps the bushes' rustle handler)
const gathering = createGathering({ scene, players, props, items, particles, hud, sfx, pickups, collect, camera: followCam });
// the campfire: firepit + benches east of the spawn, fuel / fire levels, the choice menu (dialog) and cooking (needs the dialog + inventory)
const campfire = createCampfire({ scene, players, particles, hud, sfx, inventory, dialog, collect, camera: followCam });
// ---- Shared campfire quest (Step 15): one active quest for everybody, its HUD tracker (top-right), then the feast scene (created below, after the pair panel)
const quests = new QuestLog({ inventory });
const questTracker = createQuestTracker(hudRoot, { quests, inventory, hud, sfx });
// A player leaving (its device stayed away for the grace period): its item drops where it stands and becomes a ground pickup,
// its pending chop is forgotten and, if it owns the dialog, the dialog closes. (Fires before the poof.)
players.on('leave', (p) => {
  items.dropFor(p);
  harvest.release(p);
  gathering.release(p);
  campfire.release(p);                       // cancels its toss / cooking (nothing is consumed); the dialog closing below unfreezes it
  if (dialog.isOpen && dialog.owner === p) dialog.close();
});

// ---- Pairing panel (freezes everybody while open) + link events
const pairPanel = new PairPanel(hudRoot, {
  canOpen: () => !dialog.isOpen && !feast.busy,
  onOpen: () => { players.frozenAll = true; touch?.widget.reset(); },
  onClose: () => { players.frozenAll = false; },
});
// The feast scene (cutscene) + the campfire menu rows that start a quest / the feast. It owns the camera and every player while it runs.
const feast = createFeastScene({
  scene, camera, followCam, players, hud, hudRoot, campfire, particles, sfx, music, items, harvest, gathering, dialog, pairPanel, quests, tracker: questTracker,
});
createQuestMenu({ quests, dialog, hud, sfx, campfire, feast });
pairPanel.setControllers(players.phones());
players.on('change', () => pairPanel.setControllers(players.phones()));   // roster / phone -> player changes
link.on('room', (code) => pairPanel.setRoom(code));
link.on('controller-connected', () => {
  hud.toast('Phone controller connected!', { icon: 'phone' });
  sfx.play('chime');
});
link.on('controller-disconnected', () => {
  // a phone that was playing gets its own "P2's phone disconnected" toast from the PlayerManager
  if (link.connected && !players.phones().some((p) => p.label)) hud.toast('Phone controller disconnected', { icon: 'phone' });
});
const targets = new Map();              // Player -> its nearest interactable this tick (drives that player's prompt bubble)
const prompts = [];
const isLive = (t) => getInteractables().includes(t);   // false once somebody picked the item up / felled the tree this tick

// ---- Sound: mute button + M key (persisted by Sfx), title card
const muteButton = createMuteButton(hudRoot, sfx);
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
// ---- Music (Step 16): N toggles the music only (M still mutes everything); a music-note button sits next to the speaker; "Now playing" toast per track
const musicButton = createMusicButton(hudRoot, music, sfx);
const optionsMenu = createOptionsMenu(hudRoot, { musicButton, muteButton, pairPanel, hud, touch });
const timeDial = createTimeDial(hudRoot, { clock: dayNight, hud });
hud.joinButton.addEventListener('click', () => { pairPanel.open(); hud.joinButton.blur(); });
music.on('enabled', (on) => {
  hud.toast(on ? 'Music on' : 'Music off', { icon: on ? 'music' : 'musicOff', duration: 1500 });
  if (on) sfx.play('pop', { pitch: 1.2, vol: 0.6 });
});
music.on('track', (t) => {
  if (music.enabled && !sfx.muted) hud.toast(`Now playing: ${t.title}`, { icon: 'music', duration: 2600 });
});
window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyN' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target && e.target.tagName;
  if (t === 'INPUT' || t === 'TEXTAREA') return;
  sfx.unlock();
  music.toggle();
});
music.start();
const title = new TitleCard(hudRoot, { duration: 2.6 });
// Phones / tablets: offer a one-tap fullscreen (or an Add-to-Home-Screen tip on iPhone) once the title card is gone.
if (touch) createFullscreenPrompt(hudRoot, { hud, delay: 3 });
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
function tick(realDt) {
  // hit-stop: a brief near-freeze on tool impacts (real time counts down, the simulation crawls)
  let dt = realDt;
  if (hitStopT > 0) { hitStopT -= realDt; dt = realDt * 0.08; }
  simTime += dt;
  dayNight.update(dt);
  sky.setTimeOfDay(dayNight);
  water.setTimeOfDay(dayNight);
  renderer.toneMappingExposure = dayNight.look.exposure;
  campfire.setNightness(dayNight.nightness);
  timeDial.update();
  players.pollInput(dt);                      // every device -> claims / leaves -> per-player actions
  // Gamepad buttons are user activations too: let them wake the audio context.
  if (players.gamepadPressed) sfx.unlock();
  if (!title.done && players.activity) title.dismiss();
  // every active, free player finds its own nearest interactable (all before anybody acts, so two players can want the same one)
  targets.clear();
  const scripted = feast.active;              // the feast scene owns everybody: no targets, prompts or interactions meanwhile
  for (const p of players.list) {
    if (scripted || p.away || p.frozen || players.frozenAll) continue;               // away / dialog owner / pair panel: no target, no prompt
    let t = findNearest(p.position, INTERACT_RADIUS);
    if (t && (t.type === 'sign' || t.type === 'campfire') && dialog.isOpen) t = null;   // the sign / campfire menu is busy: show nothing for the others
    if (t && t.type === 'campfire' && campfire.busy(p)) t = null;
    if (t) targets.set(p, t);
  }
  if (pairPanel.isOpen) {
    const anyCancel = players.list.some((p) => p.actions.cancelPressed);     // any player's Cancel closes the panel
    if (anyCancel) sfx.play('bip');
    pairPanel.handleInput(false, anyCancel);                                 // panel swallows the presses
  } else if (optionsMenu.isOpen) {
    if (players.list.some((p) => p.actions.cancelPressed)) optionsMenu.close();
  } else if (!scripted) {
    for (const p of players.list) {                                          // P1 first, so it wins a same-frame race
      const a = p.actions;
      if (dialog.isOpen && dialog.owner === p) {                             // only the owner's buttons drive the dialog
        if (!dialog.isMenu) {                                                // (choice menus play their own move / select / back sounds)
          if (a.cancelPressed) sfx.play('bip');
          else if (a.interactPressed) sfx.play('pop', { pitch: 0.8, vol: 0.6 });
        }
        dialog.handleInput(a.interactPressed, a.cancelPressed, a.move.z);   // move.z = the owner's stick / d-pad / WS / arrows (up = negative): menu rows
        continue;
      }
      if (p.away || p.frozen) continue;
      let t = targets.get(p);
      if (t && !isLive(t)) t = null;                                         // somebody else just took it: this press does nothing there
      const held = items.heldBy(p);
      if (a.interactPressed && t) {
        const toolAction = getToolAction(held, t);
        if (toolAction === 'dig') gathering.dig(t, p);                       // shovel on a dig spot: plunge now, the soil flies at the impact frame
        else if (toolAction) harvest.hit(t, p);                              // chop / break: swing now, the hit lands at the impact frame
        else if (interactions.interact(t, p)) hud.suppressPrompt(0.7, p.index);
      } else if (a.interactPressed && held) {
        items.swing(p);                                                      // nothing in range: swing the held item
      } else if (a.cancelPressed) {
        interactions.cancel(p);
      }
    }
  }
  players.update(dt);                         // movement, tether, soft push between players
  items.update(dt, simTime);
  harvest.update(dt);
  gathering.update(dt);
  campfire.update(dt, camera, renderer.domElement.height);   // fuel, flames / light / embers / crackle, toss + cooking tasks, floating status
  pickups.update(dt);                         // after the players moved: walk-over magnets
  followCam.update(dt, players.focus, players.cameraZoom(followCam));   // centroid of the players, zooms out with their spread
  feast.update(dt);                           // the feast scene (cutscene): overrides the player poses + camera while it runs, eases the camera back after
  questTracker.update(dt);
  players.updateFx(dt, camera);               // rings + name tags (after the camera moved)
  interactions.update(dt);
  invBar.update(dt, camera);                  // floating "+1 Apple" texts follow the camera
  dialog.update(dt);
  particles.update(dt, camera, renderer.domElement.height);
  prompts.length = 0;                         // one bubble per player, tinted + glyph per its device when several are playing
  for (const p of players.list) {
    const t = targets.get(p);
    if (!t || !isLive(t)) continue;
    const toolAct = getToolAction(items.heldBy(p), t);
    prompts.push({
      key: p.index, target: t, text: toolAct === 'chop' ? 'Chop' : toolAct === 'break' ? 'Break' : toolAct === 'dig' ? 'Dig' : null,
      source: p.actions.activeSource, color: p.colors.ui, label: p.colors.name,
    });
  }
  hud.update(dt, { camera, multi: players.multi, prompts });
  // ambient visuals (advance with the tick so __game.step drives them too)
  title.update(dt);
  water.update(simTime);
  props.update(simTime);
  sky.update(dt, camera);
  ambient.update(dt, simTime, players.focus, camera, renderer.domElement.height);
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
console.info(`Infinite Island v${VERSION}`);

window.__game = {
  version: VERSION,
  renderer, scene, camera, controls, terrain, water, sky, dayNight, timeDial, props, ambient, sfx, music, title, quality, lowerQuality,
  player, players, input, keyboard, gamepad, link, remote, touch, pairPanel, optionsMenu, followCam, hud, dialog, particles, interactions,
  getColliders, resolveCircle, getInteractables, findNearest, items, harvest,
  inventory, invBar, pickups, gathering, collect, campfire, quests, questTracker, feast,
  targets,
  get target() { return targets.get(player) || null; },     // P1's target
  step: (dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) tick(dt); },
};
