// Bootstrap: renderer, scene, loop. Wires world, input, player and the fixed-angle follow camera together.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VERSION, EMBER_FX, MAX_PIXEL_RATIO, CAMERA_FOV, CAMERA_NEAR, CAMERA_FAR, INTERACT_RADIUS, CAMPFIRE, MAX_PLAYERS, ISLANDS, BRIDGES, DROP_HOLD } from './config.js';
import { getHeight, getGroundType, isWalkable, regionOf, inlandDistance, setBridgeOpen, isBridgeOpen, SPAWN } from './world/terrain.js';
import { createWater } from './world/water.js';
import { createSky } from './world/sky.js';
import { DayNight } from './world/dayNight.js';
import { createTimeDial } from './ui/timeDial.js';
import { createProps } from './world/props.js';
import { createWorldVisuals } from './world/islandVisuals.js';
import { getColliders, resolveCircle } from './world/colliders.js';
import { getInteractables, findNearest } from './world/interactables.js';
import { InputManager } from './input/inputManager.js';
import { KeyboardSource } from './input/keyboardSource.js';
import { GamepadSource } from './input/gamepadSource.js';
import { PlayerManager } from './players/playerManager.js';
import { SlotTable } from './players/slotTable.js';
import { createPlayersDomain } from './net/playersDomain.js';
import { Avatars } from './net/avatars.js';
import { RemoteLink } from './net/remoteLink.js';
import { PeerLink } from './net/peerLink.js';
import { getTransport, getJoinCode } from './net/transport.js';
import { WorldSync } from './net/worldSync.js';
import { createScreenLink } from './net/screenLink.js';
import { bindHostLink, bindReplicaLink } from './net/syncLinks.js';
import { setSaveEnabled } from './game/save.js';
import { createSyncStatus } from './ui/syncStatus.js';
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
import { createCampfires } from './world/campfire.js';
import { createCampMenu } from './game/campMenu.js';
import { PATHS } from './config.js';
import { getPath, pathSummary, pathMarkers, pathPolylines } from './world/paths.js';
import { Inventory } from './game/inventory.js';
import { QuestLog } from './game/quests.js';
import { createQuestMenu } from './game/questMenu.js';
import { createCinematic } from './game/cinematic.js';
import { createFeastScene } from './game/feastScene.js';
import { createBridgeScene } from './game/bridgeScene.js';
import { createInventoryBar } from './ui/inventoryBar.js';
import { createBagPanel } from './ui/bagPanel.js';
import { createIslandTracker } from './ui/inventoryTracking.js';
import { CollectionLog } from './game/collection.js';
import { COLLECT_LOOT } from './world/lootTable.js';
import { createBeachFinds } from './world/beachFinds.js';
import { createTravel } from './game/travel.js';
import { createQuestTracker } from './ui/questTracker.js';
import { getToolAction } from './items/tools.js';
import { FollowCamera } from './camera/followCamera.js';
import { Sfx } from './audio/sfx.js';
import { Music } from './audio/music.js';
import { AmbienceAudio } from './audio/ambience.js';
import { createMuteButton } from './ui/muteButton.js';
import { createMusicButton } from './ui/musicButton.js';
import { createOptionsMenu } from './ui/optionsMenu.js';
import { createFullscreenPrompt } from './ui/fullscreenPrompt.js';
import { TitleCard } from './ui/titleCard.js';
import { createAmbient } from './fx/ambient.js';
import { createAtmosphere } from './fx/atmosphere.js';
import { HATS } from './player/hats.js';
import { TAILS } from './player/tails.js';
import { createHatRack } from './world/hatRack.js';
import { createTailStump } from './world/tailStump.js';
import { createNpcs } from './world/npcs.js';
import { createCritters } from './world/critters.js';
import { createFrostCamp } from './world/frostCamp.js';
import { createCampStages } from './world/campStages.js';
import { createThoughtBubbles } from './ui/thoughtBubble.js';
import { createBridges } from './world/bridges.js';

const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

// ---- World sync (Step 22) + screens (Step 23). Every page is the world HOST by default; `?join=CODE` makes it a REPLICA ("screen") of room CODE:
// it renders the shared world and has its own local players and camera, but sends requests to the host and mirrors its events / snapshot
// instead of owning shared state, and it never saves (game/save.js switch). The phone join choice (controller.html) sends people here.
// The host also owns the 4 global player slots (players/slotTable.js, domain 'players'). See net/worldSync.js and PLAN.md "22a design notes".
const joinCode = getJoinCode();
const sync = new WorldSync({ role: joinCode ? 'replica' : 'host' });
if (joinCode) setSaveEnabled(false);
else document.addEventListener('visibilitychange', () => sync.setHostAway(document.hidden));

// ---- Renderer
const coarse = wantsTouch();
let pixelCap = coarse ? Math.min(1.5, MAX_PIXEL_RATIO) : MAX_PIXEL_RATIO;
const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });   // stencil: characters mark their visible pixels (occluded-player silhouette)
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
if (coarse) sky.sun.shadow.mapSize.set(1024, 1024);
// The host's clock rules (PLAN Step 22b): a replica ignores ?time / ?daylock (and has no saved time), adopts the host's hour / lock / speed and eases toward it.
const dayNight = new DayNight({ params: joinCode ? new URLSearchParams() : params });
dayNight.attachSync(sync);
sky.setTimeOfDay(dayNight);
renderer.toneMappingExposure = dayNight.look.exposure;
const water = createWater();
scene.add(water.group);
water.setTimeOfDay(dayNight);
const props = createProps(scene);
// Terrain + props + far versions + bridge stubs of every island, and the region manager that picks full / far per island (Step 27b)
const worldVis = createWorldVisuals({ scene, camera, homeProps: props });
const terrain = worldVis.root;
const ambient = createAmbient({ scene, props, getHeight, clock: dayNight, campfire: CAMPFIRE });   // butterflies (day), fireflies (night), drifting petals, ocean glints
// Region atmosphere (Step 29a): snowfall + a cooler look while the view is on Frostpine, eased in / out across the bridge
const atmosphere = createAtmosphere({ scene, camera, sky, clock: dayNight, getHeight, view: () => worldVis.viewCentre() });
const sfx = new Sfx();                                        // WebAudio blips; wakes up on the first user gesture
const music = new Music(sfx);                                 // cycling procedural background tracks (starts after the first gesture)
music.setClock(dayNight);
const ambienceAudio = new AmbienceAudio(sfx, dayNight);

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
let screenLink = null;
if (joinCode) { screenLink = createScreenLink(joinCode); bindReplicaLink(sync, screenLink); }   // replica: the host of room CODE
else bindHostLink(sync, link);                                                                   // host: other pages that join this room become replicas

// ---- Players + camera. Every player (up to 4) has its own target / prompt, held item, swing and hits; P1 always exists.
const slotTable = new SlotTable(MAX_PLAYERS);          // the island's global player slots (host = authority, replica = the host's copy)
const players = new PlayerManager({
  scene, local: input, gamepads: gamepad, remote, hud, hudRoot, particles, sfx,
  localKind: touch ? 'phone' : 'keyboard', sync, table: slotTable,
});
let avatars = null;
createPlayersDomain({
  sync, table: slotTable,
  onChange: () => { players.slotsChanged(); avatars?.reconcile(); },
  spawnHint: () => {                        // where a player joining from another screen appears: near this (host) screen's group
    const l = players.list;
    if (!l.length) return null;
    return { x: l.reduce((s, p) => s + p.position.x, 0) / l.length, z: l.reduce((s, p) => s + p.position.z, 0) / l.length };
  },
});
players.on('join', () => { if (players.count === 1) followCam.snap(); });   // a joined screen's first player: the camera jumps to it
const player = players.p1;                // (debug handle only: the game logic below loops over players.list)
const followCam = new FollowCamera(camera, { sun: sky.sun });
followCam.touch = coarse;
followCam.update(0, players.focus);       // snap to the players before the first frame
worldVis.snap();                          // regions from that first view: no far / full pop-in on the first frame

// ---- Shared inventory (one bag for every player, saved in localStorage; ?newgame resets) + its HUD bar (bottom-left; top-left under touch controls).
// floatText() shows the floating "+1 Apple" text at a world point, tinted with the collecting player's colour when several are playing; the systems
// that hand items out (pickups, gathering, campfire cooking) change the bag on the AUTHORITY (inventory.add) and call floatText on the screen of whoever
// got them. collect() (both in one) stays as a debug helper. On a replica inventory.add / remove are requests to the host (the bag mirrors the
// host's); see game/inventory.js.
const inventory = new Inventory();
inventory.attachSync(sync);
const invBar = createInventoryBar(hudRoot, inventory, { top: !!touch, onOpen: () => bagPanel.open() });
const islandTracker = createIslandTracker({ islands: ISLANDS, bridges: BRIDGES, regionAt: regionOf, inlandAt: inlandDistance });
let trackingKey = '';
music.region = () => islandTracker.islandOf(players.list[0]) || 'home';
ambienceAudio.region = music.region;
const tetherHints = new WeakMap();
players.on('tether', (p, other) => {
  const nearBridge = BRIDGES.some((b) => {
    const dx = b.bx - b.ax, dz = b.bz - b.az, l2 = dx * dx + dz * dz;
    const t = ((p.position.x - b.ax) * dx + (p.position.z - b.az) * dz) / l2;
    return t > -0.25 && t < 1.25 && Math.abs((p.position.x - b.ax) * dz - (p.position.z - b.az) * dx) / Math.sqrt(l2) < 4;
  });
  if (!nearBridge || simTime - (tetherHints.get(p) ?? -10) < 2.5) return;
  tetherHints.set(p, simTime); invBar.label(`Wait for ${other.colors.name}!`, { x: p.position.x, y: p.position.y + 2, z: p.position.z }, p.colors.ui);
});
const collection = new CollectionLog({ onFound: (def, actor) => {
  hud.toast(`Journal: ${def.name}`, { icon: def.icon, duration: 3200 });
  const progress = collection.progress(def.island);
  if (progress.have === progress.total) hud.toast(`${ISLANDS.find((i) => i.id === def.island).name} album complete!`, { icon: 'sparkle', duration: 4000 });
  if (actor?.screen === sync.screenId) sfx.play('chime');
} });
collection.attachSync(sync);
const collectFind = (source, at, actor) => {
  const island = regionOf(at.x, at.z);
  collection.roll(island, source, actor && { screen: actor.screen, index: actor.index }, COLLECT_LOOT[island]?.[source] || 0);
};
const floatText = (id, n, at, by = null) => invBar.float(id, n, at, by && players.multi ? by.colors.ui : null);
const collect = (id, n = 1, at = null, by = null) => {
  inventory.add(id, n);
  if (at) floatText(id, n, at, by);
};
// ground items that fly to whoever walks up to them; the authority path adds them to the bag (host), so only the floating text is injected
const pickups = createPickups({ scene, players, particles, sfx, sync, floatText });

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
const interactions = createInteractions({ scene, players, hud, dialog, particles, sfx, pickups, sync, collectFind });
const items = createItems({ scene, players, particles, hud, sfx, sync, frost: worldVis.frost, ember: worldVis.ember });
avatars = new Avatars({ scene, hudRoot, players, table: slotTable, sync, items, sfx });
avatars.reconcile();
let hitStopT = 0;                                                     // real seconds of hit-stop left (the sim runs at ~8% speed meanwhile)
const harvest = createHarvest({                                       // chopping trees / breaking rocks (needs items for the swing)
  scene, players, items, particles, hud, sfx, interactions, props, pickups, camera: followCam, sync, extraTargets: worldVis.harvestables,
  collectFind,
  hitStop: (s) => { hitStopT = Math.max(hitStopT, s); },
});
// berries, herbs, mushrooms, dig spots (must come after createInteractions: it wraps the bushes' rustle handler)
const gathering = createGathering({ scene, players, props, frost: worldVis.frost, ember: worldVis.ember, items, particles, hud, sfx, pickups, inventory, floatText, camera: followCam, sync, collectFind });
// the campfire: firepit + benches east of the spawn, fuel / fire levels, the choice menu (dialog) and cooking (needs the dialog + inventory)
const campfires = createCampfires({ scene, players, particles, hud, sfx, inventory, dialog, floatText, camera: followCam, sync });   // one per config FIRES entry (home + the Frostpine camp + the Emberleaf garden hearth)
const campfire = campfires.home;            // the home fire (debug / old code: __game.campfire)
// ---- Shared campfire quest (Step 15): one active quest for everybody, its HUD tracker (top-right), then the feast scene (created below, after the pair panel)
const quests = new QuestLog({ inventory });
quests.attachSync(sync);                     // one shared quest, owned by the host (game/quests.js)
const questTracker = createQuestTracker(hudRoot, { quests, inventory, hud, sfx, readyText: () => campfires.returnText() });
// A player leaving (its device stayed away for the grace period): its item drops where it stands and becomes a ground pickup,
// its pending chop is forgotten and, if it owns the dialog, the dialog closes. (Fires before the poof.)
players.on('leave', (p) => {
  items.dropFor(p);
  harvest.release(p);
  gathering.release(p);
  campfires.release(p);                      // cancels its toss / cooking (nothing is consumed); the dialog closing below unfreezes it
  if (dialog.isOpen && dialog.owner === p) dialog.close();
});

// ---- Pairing panel (freezes everybody while open) + link events
const pairPanel = new PairPanel(hudRoot, {
  controllerOnly: !!joinCode,                // a joined screen's phones can only be controllers of THIS screen
  canOpen: () => !dialog.isOpen && !cinematic.busy && !bagPanel.isOpen,
  onOpen: () => { players.frozenAll = true; touch?.widget.reset(); },
  onClose: () => { players.frozenAll = false; },
});
// Shared cutscene stage (Step 28c): letterbox, HUD fade, camera override + ease-back, banner, music duck, held-Cancel skip. One cinematic runs at a time.
const cinematic = createCinematic({ camera, followCam, players, avatars, hud, hudRoot, music, dialog, pairPanel });
// The feast scene (cutscene) + the campfire menu rows that start a quest / the feast. It owns the camera and every player while it runs.
const feast = createFeastScene({
  scene, camera, followCam, players, avatars, slots: slotTable, hud, cinematic, campfires, particles, sfx, items, harvest, gathering, dialog, quests, tracker: questTracker, sync,
});
createQuestMenu({ quests, dialog, hud, sfx, campfires, feast });
// ---- Feast hats (Step 26): the hat rack beside the campfire appears after the first feast; touching it cycles the player's hat (world/hatRack.js)
const hatRack = createHatRack({
  scene, players, quests, sync, particles, sfx, hud,
  floatLabel: (text, at, by, icon) => invBar.label(text, at, by && players.multi ? by.colors.ui : null, icon),
});
// ---- Bridge builders (Step 28a): Cobble the mole and Bramble the beaver arrive at the old bridges after the first feast (world/npcs.js)
const npcs = createNpcs({
  scene, players, avatars, quests, sync, dialog, particles, sfx, hud,
  floatLabel: (text, at, by, icon) => invBar.label(text, at, by && players.multi ? by.colors.ui : null, icon),
});
feast.setNpcs(npcs);
npcs.introScene = (id) => feast.replayArrival(id);
// ---- Bridge building (Step 28b): giving materials to the builders, the staged bridge meshes, the 'bridges' sync domain (world/bridges.js).
// ?bridges=open (debug, never saved) makes THIS page show both bridges finished and walkable without touching the shared state.
const bridges = createBridges({
  scene, players, quests, inventory, sync, npcs, dialog, hud, particles, sfx,
  floatLabel: (text, at, by, icon) => invBar.label(text, at, by && players.multi ? by.colors.ui : null, icon),
  debugOpen: params.get('bridges') === 'open',
});
// ---- Frostpine's hungry critters (Steps 34a / 34b): eight wild animals with a hint bubble; feed one (a request to the host: `critters` sync domain) and it moves into the camp
// (world/critters.js). The quest line opens once the Frostpine bridge is built (?bridges=open counts, like the deck).
const thoughts = createThoughtBubbles(hudRoot);
const critters = createCritters({
  scene, players, world: worldVis, thoughts, particles, sfx, sync, inventory, hud,
  floatLabel: (text, at, by, icon) => invBar.label(text, at, by && players.multi ? by.colors.ui : null, icon),
  isOpen: () => params.get('bridges') === 'open' || !!bridges.entry('frost')?.built,
});
// ---- Frostpine's camp jobs (Step 35a): the fire spirit's building quest line, its 'frostCamp' sync domain and the fire menu's "Camp jobs" rows (world/frostCamp.js, game/campMenu.js)
const frostCamp = createFrostCamp({
  players, critters, inventory, sync, campfires, dialog, hud, particles, sfx,
  floatLabel: (text, at, by, icon) => invBar.label(text, at, by && players.multi ? by.colors.ui : null, icon),
});
// ---- Tails (Step 36b): feasts held at the Frostpine camp unlock tails (critters living there + comfort); the carved stump shows them and lets a player try them on (world/tailStump.js)
const tailStump = createTailStump({
  scene, players, critters, camp: frostCamp, sync, world: worldVis, particles, sfx, hud,
  floatLabel: (text, at, by, icon) => invBar.label(text, at, by && players.multi ? by.colors.ui : null, icon),
});
feast.setTails(tailStump);
const campStages = createCampStages({ camp: frostCamp, campfires, critters, players, particles, sfx });     // Step 35b: the three build stages (windbreak + log benches, dens + crystal lanterns, grove shelter)
const campMenu = createCampMenu({ campfires, dialog, camp: frostCamp, inventory });     // Step 33b: the Frostpine fire spirit's intro; 35a: the real "Camp jobs" rows
npcs.setBridgeProvider((id) => bridges.entry(id));
quests.setBridgeProvider((id) => !!bridges.entry(id)?.built);
const travel = createTravel({ scene, sync, players, avatars, table: slotTable, bridges, dialog, hud, particles, camera: followCam, cinematic, world: worldVis });
const beachFinds = createBeachFinds({ scene, collection, sync, world: worldVis });
// The bridge-opening cutscene (Step 28c): takes over the final stage of a bridge (hook of world/bridges.js) on every screen
const bridgeScene = createBridgeScene({ scene, camera, followCam, players, avatars, hud, cinematic, bridges, npcs, particles, sfx, sync, worldVis, dialog });
pairPanel.setControllers(players.phones());
players.on('change', () => pairPanel.setControllers(players.phones()));   // roster / phone -> player changes
link.on('room', (code) => pairPanel.setRoom(code));
if (joinCode) createSyncStatus(hudRoot, { sync, code: joinCode, hud });
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
const dropHolds = new Map();
const dropRings = new Map();
const dropPoint = new THREE.Vector3();
function updateDropRings(dt) {
  for (const p of players.list) {
    let ring = dropRings.get(p);
    if (!ring) {
      ring = document.createElement('div');
      ring.className = 'drop-hold-ring';
      hudRoot.appendChild(ring);
      dropRings.set(p, ring);
    }
    const blocked = cinematic.active || pairPanel.isOpen || optionsMenu.isOpen || bagPanel.isOpen || dialog.isOpen || p.away || p.frozen;
    if (blocked || !items.heldBy(p) || !p.actions.cancelHeld) {
      dropHolds.delete(p);
      ring.hidden = true;
      continue;
    }
    const hold = dropHolds.get(p) || { t: 0, fired: false };
    hold.t += dt;
    if (hold.t >= DROP_HOLD && !hold.fired) { hold.fired = true; items.dropHeld(p); }
    dropHolds.set(p, hold);
    ring.hidden = hold.t < 0.3 || hold.fired;
    if (!ring.hidden) {
      dropPoint.set(p.position.x, p.position.y + 2.15, p.position.z).project(camera);
      ring.style.left = `${(dropPoint.x * 0.5 + 0.5) * window.innerWidth}px`;
      ring.style.top = `${(-dropPoint.y * 0.5 + 0.5) * window.innerHeight}px`;
      ring.style.background = `conic-gradient(${p.colors.ui} ${Math.min(360, hold.t / DROP_HOLD * 360)}deg, #ffffff99 0)`;
    }
  }
  for (const [p, ring] of dropRings) if (!players.list.includes(p)) { ring.remove(); dropRings.delete(p); dropHolds.delete(p); }
}
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
const optionsMenu = createOptionsMenu(hudRoot, { musicButton, muteButton, pairPanel, hud, touch, onFriends: () => travel.showFriends(), onJournal: () => bagPanel.journal() });
const bagPanel = createBagPanel(hudRoot, {
  inventory, islands: ISLANDS, collection,
  canOpen: () => !dialog.isOpen && !pairPanel.isOpen && !cinematic.busy,
  onOpen: () => { optionsMenu.close(); players.frozenAll = true; keyboard.releaseAll(); touch?.widget.reset(); },
  onClose: () => { players.frozenAll = false; keyboard.releaseAll(); touch?.widget.reset(); },
});
window.addEventListener('keydown', (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || !['Tab', 'KeyB'].includes(e.code)) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) || e.target?.isContentEditable) return;
  e.preventDefault(); bagPanel.toggle();
});
const timeDial = createTimeDial(hudRoot, { clock: dayNight, hud });
hud.joinButton.addEventListener('click', () => { pairPanel.open(); hud.joinButton.blur(); });
// The keyboard player's roster chip has a leave button in local multiplayer (any key rejoins; see PlayerManager.leaveLocal)
hud.onLeave = () => { if (!cinematic.busy && !pairPanel.isOpen) players.leaveLocal(); };
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
const quality = { level: coarse ? 'medium' : 'high', avgMs: 0, lowered: false };
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
  // Small ground details do not need a shadow receive pass on struggling devices.
  for (const name of ['mushrooms', 'herbs', 'flowers-', 'grass-tufts', 'lily-pads', 'reeds']) {
    props.group.traverse((m) => { if (m.isMesh && m.name.startsWith(name)) m.receiveShadow = false; });
  }
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
  sync.update(dt);                            // world sync timers: grace period of a screen that left (host), request timeouts (replica)
  if ((joinCode && (sync.status !== 'synced' || sync.hostAway)) || (!joinCode && sync.hostAway)) return; // keep rendering the last good frame while the host is unavailable
  dayNight.update(dt);
  sky.setTimeOfDay(dayNight);
  atmosphere.update(dt, simTime, renderer.domElement.height);   // Frostpine: cooler look on top of the clock's colours + snowfall (needs the view of the LAST frame: fine)
  water.setTimeOfDay(dayNight);
  renderer.toneMappingExposure = dayNight.look.exposure;
  campfires.setNightness(dayNight.nightness);
  timeDial.update();
  players.pollInput(dt);                      // every device -> claims / leaves -> per-player actions
  // Gamepad buttons are user activations too: let them wake the audio context.
  if (players.gamepadPressed) sfx.unlock();
  if (!title.done && players.activity) title.dismiss();
  // every active, free player finds its own nearest interactable (all before anybody acts, so two players can want the same one)
  targets.clear();
  const scripted = cinematic.active;          // a cutscene (feast, bridge opening) owns everybody: no targets, prompts or interactions meanwhile
  if (scripted) bagPanel.close();
  for (const p of players.list) {
    if (scripted || p.away || p.frozen || players.frozenAll) continue;               // away / dialog owner / pair panel: no target, no prompt
    let t = findNearest(p.position, INTERACT_RADIUS);
    if (t && (t.type === 'sign' || t.type === 'campfire' || t.type === 'npc') && dialog.isOpen) t = null;   // the sign / campfire / NPC menu is busy: show nothing for the others
    if (t && t.type === 'campfire' && campfires.busy(p)) t = null;
    if (t) targets.set(p, t);
  }
  if (bagPanel.isOpen) {
    if (players.list.some((p) => p.actions.cancelPressed)) bagPanel.close();
  } else if (pairPanel.isOpen) {
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
  avatars.update(dt, camera);
  avatars.separateLocal(dt);
  players._updateFocus();
  harvest.update(dt);
  gathering.update(dt);
  campfires.update(dt, camera, renderer.domElement.height);  // every fire: fuel, flames / embers, toss + cooking tasks, floating status; then the shared light + crackle
  hatRack.update(dt);                         // pop-in / pop-onto-peg animations
  tailStump.update(dt);                       // the tail stump's pop-in (only drawn while Frostpine is)
  npcs.update(dt);                            // builders: arrival pop, facing, idle / work / cheer
  frostCamp.update(dt);                       // the camp jobs' delayed spirit line
  campStages.update(dt);                      // the camp's build moments (pieces dropping in)
  critters.update(dt, dayNight.nightness);    // Frostpine's critters: roaming, hint hop + thought bubble, animations, sleeping at night (only while Frostpine is drawn)
  bridges.update(dt, dayNight.nightness);     // bridge build moments, segment pop-ins, lantern glow
  pickups.update(dt);                         // after the players moved: walk-over magnets
  followCam.update(dt, players.focus, players.cameraZoom(followCam));   // centroid of the players, zooms out with their spread
  updateDropRings(dt);
  cinematic.update(dt);                       // eases the camera back to the follow view after a cutscene
  feast.update(dt);                           // the feast scene (cutscene): overrides the player poses + camera while it runs
  bridgeScene.update(dt);                     // the bridge-opening scene (Step 28c), same contract
  questTracker.update(dt);
  travel.update(); beachFinds.update(simTime);
  const tracked = islandTracker.update(players.list);
  const nextTrackingKey = [...tracked.islands].sort().join(',') + ':' + (quests.active?.id || '');
  if (trackingKey !== nextTrackingKey) {
    trackingKey = nextTrackingKey;
    invBar.setTracking(tracked.islands, quests.active?.needs || {});
  }
  if (!cinematic.busy) for (const id of tracked.arrivals) hud.toast(ISLANDS.find((i) => i.id === id).name, { icon: 'sparkle', duration: 2800 });
  players.updateFx(dt, camera);               // rings + name tags (after the camera moved)
  interactions.update(dt);
  invBar.update(dt, camera);                  // floating "+1 Apple" texts follow the camera
  thoughts.update(dt, camera);                // the critters' thought bubbles
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
  for (const m of props.handles.mushrooms) m.material.emissiveIntensity = dayNight.nightness * (0.33 + 0.07 * Math.sin(simTime * 2 + m.position.x));
  sky.update(dt, camera);
  worldVis.update(simTime);                   // region visibility from the view centre (after every camera move above) + the volcano smoke
  for (const p of players.list) {
    if (getGroundType(p.position.x, p.position.z) !== 'hotspring') { p.userDataSpringAt = 0; continue; }
    if (simTime >= (p.userDataSpringAt || 0)) {
      p.userDataSpringAt = simTime + EMBER_FX.sparkleInterval;
      particles.burst('sparkle', { x: p.position.x, y: p.position.y + 0.7, z: p.position.z }, { count: 3, radius: 0.5, speed: 0.35, color: '#c7fff1' });
    }
  }
  ambient.calm = atmosphere.calm;
  ambient.update(dt, simTime, players.focus, camera, renderer.domElement.height);
  ambienceAudio.update(dt);
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

// Debug: scripted random action storm for two-tab sync checks, see net/syncStress.js. (Loaded on demand; nothing runs otherwise.)
sync.stress = (opts) => import('./net/syncStress.js').then((m) => m.runStress(opts));

// Debug (Step 26): __game.hats.list = hat names; set(player, i) puts on hat i silently (-1 = default beanie, 0..9 = HATS[i]; saved like a rack choice);
// cycle(player) = what the rack does; preview(n) pretends n hats are unlocked (null = real count; never saved, never touches quests.feasts);
// unlocked = the current count; rack.summary() = state of the rack + who wears what.
const hats = {
  list: HATS.map((h) => h.name),
  set(p, i) { hatRack.wear(p, i, false); return p.character.hat; },
  cycle: (p) => hatRack.cycle(p),
  preview: (n) => hatRack.preview(n),
  get unlocked() { return hatRack.unlocked; },
  rack: hatRack,
};

// Debug (Steps 36a / 36b): __game.tails.list = tail names (species-major: fox, squirrel, rabbit, grouse x levels 1-3); set(player, i) puts tail i on a player (-1 = none; saved per
// screen like the stump does, silently); preview(i) puts it on P1 without saving or syncing. unlocked = the unlocked indices, evaluate() = what the unlock rule would give right now
// (nothing is unlocked), unlock(i | [i]) / unlockAll() / reset() = host-path debug unlocks (saved + synced, no fanfare), cycle(player) = the stump's action, stump = the stump (summary()).
const tails = {
  list: TAILS.map((t) => t.name),
  set(p, i) { tailStump.wear(p, i, false); return p.character.back; },
  preview(i) { return players.p1.wearTail(i); },
  get unlocked() { return tailStump.unlocked; },
  evaluate: () => tailStump.evaluate(),
  unlock: (i) => tailStump.debug.unlock(i),
  unlockAll: () => tailStump.debug.unlockAll(),
  reset: () => tailStump.debug.reset(),
  cycle: (p = players.p1) => tailStump.cycle(p),
  stump: tailStump,
};

// Archipelago debug hooks (Step 27a; Step 27b extends this). goto(id) teleports this screen's players to a walkable spot on that island
// (home: the spawn; the others: a few units inland of the bridge landing) and snaps the follow camera.
function islandSpot(id) {
  if (id === 'home') return { x: SPAWN.x, z: SPAWN.z };
  if (id === 'emberGarden') {                              // Step 37a: a few units south of the garden hearth, on the bottom tier's side (the camera side)
    const f = campfires.get('ember');
    return f ? { x: f.position.x + 0.4, z: f.position.z + 5.4 } : null;
  }
  if (id === 'frostCamp') {                                // Step 33b: a few units south of the Frostpine camp fire (the camera side)
    const f = campfires.get('frost');
    return f ? { x: f.position.x + 0.4, z: f.position.z + 5.2 } : null;
  }
  const br = BRIDGES.find((b) => b.to === id);
  if (!br) return null;
  const dx = br.bx - br.ax, dz = br.bz - br.az, L = Math.hypot(dx, dz);
  for (let d = 8; d >= 0; d -= 2) {                       // inland of the landing, falling back to the landing itself
    const x = br.bx + (dx / L) * d, z = br.bz + (dz / L) * d;
    if (isWalkable(x, z)) return { x, z };
  }
  return { x: br.bx, z: br.bz };
}
const world = {
  islands: ISLANDS, regionOf, setBridgeOpen, isBridgeOpen,
  regions: worldVis.regions, visuals: worldVis.visuals, summary: () => worldVis.summary(),
  ember: worldVis.ember,
  frost: worldVis.frost,                               // Frostpine gameplay data: placement, sampleSpots({ area, count, seed }) (29b hook), summary()
  rebuild: (id) => worldVis.rebuild(id),               // dispose + rebuild one island's visuals (draw calls / colliders / hashes must not change)
  goto(id) {
    const spot = islandSpot(id);
    if (!spot) return false;
    players.list.forEach((p, i) => p.teleport(spot.x + (i % 2) * 1.6, spot.z + Math.floor(i / 2) * 1.6));
    followCam.snap();
    followCam.update(0, players.focus);
    worldVis.snap();                                        // far / full right now, so the first frame on the new island has no pop-in
    atmosphere.snap();
    return true;
  },
};

// ?bridges=open (debug only, never saved) is handled by createBridges (debugOpen): finished bridges, open decks, shared state untouched.

// Debug (Step 33b): __game.paths.summary() = every trail (length, samples), get(id) = the built path (island-local samples), markers(id) = its lantern posts
// (world x / z), lanes(islandId) = the thin polylines props keep clear of, list = config PATHS; __game.campMenu = the fire spirit's intro memory (seen / reset).
const paths = {
  list: PATHS, summary: pathSummary, get: getPath,
  markers: (id) => { const p = getPath(id); const isl = ISLANDS.find((i) => i.id === p.island); return pathMarkers(isl, p).map((m) => ({ x: +m.x.toFixed(2), z: +m.z.toFixed(2) })); },
  lanes: (islandId) => pathPolylines(ISLANDS.find((i) => i.id === islandId)),
};

// Debug (Steps 34a / 34b): __game.critters.{list, summary(), get(id), goto(id) = teleport P1 beside it (2 u east: south of it the player would hide it from the camera),
// play(id, anim), feed(id, {force = true}) = feed through the host path (force skips the gate + bag, `{force:false}` is the real rule), reset() = everybody back to the wild,
// state, api}.
const critterDebug = {
  list: critters.list, summary: () => critters.summary(), get: (id) => critters.get(id), api: critters, thoughts,
  feed: (id, opts) => critters.debug.feed(id, opts), reset: () => critters.debug.reset(),
  get state() { return critters.state; },
  play: (id, anim) => { const c = critters.get(id); return c ? c.play(anim) : false; },
  goto(id) {
    const c = critters.get(id);
    if (!c) return false;
    player.teleport(c.position.x + 2.0, c.position.z + 0.3);
    followCam.snap();
    followCam.update(0, players.focus);
    worldVis.snap();
    atmosphere.snap();
    return true;
  },
};

// Debug (Step 35a): __game.camp.{summary(), give(item, n) = add n of an item to the current camp job through the host path (skips the gate and the bag), setComfort(n) = jump silently,
// reset(), onStage(fn) = the 35b hook (fn(comfort, {live})), state, comfort, api}.
const campDebug = {
  summary: () => frostCamp.summary(), give: (item, n) => frostCamp.debug.give(item, n), setComfort: (n) => frostCamp.debug.setComfort(n), reset: () => frostCamp.debug.reset(),
  onStage: (fn, opts) => frostCamp.onStage(fn, opts), api: frostCamp, stages: campStages,
  get state() { return frostCamp.state; }, get comfort() { return frostCamp.comfort; },
};

window.__game = {
  version: VERSION, hats, tails, world, npcs, critters: critterDebug, camp: campDebug, paths, campMenu, bridges: { ...bridges.debug, api: bridges, cutscene: (id) => bridgeScene.replay(id), scene: bridgeScene },
  renderer, scene, camera, controls, terrain, water, sky, dayNight, timeDial, props, ambient, atmosphere, ambienceAudio, sfx, music, title, quality, lowerQuality,
  player, players, avatars, input, keyboard, gamepad, link, remote, touch, pairPanel, optionsMenu, followCam, hud, dialog, particles, interactions,
  getColliders, resolveCircle, getInteractables, findNearest, items, harvest,
  inventory, invBar, bagPanel, islandTracker, collection, beachFinds, travel, pickups, gathering, collect, campfire, campfires, quests, questTracker, feast, cinematic, sync, screenLink, slotTable,
  targets,
  get target() { return targets.get(player) || null; },     // P1's target
  step: (dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) tick(dt); },
};
window.__game.loadMs = Math.round(performance.now());   // ms from navigation start until the whole bootstrap finished (startup-time probe)
