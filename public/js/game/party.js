// Party Games (Step 80a): the screen-side runtime. A short-minigame party for up to 4 players (people on this screen, on other screens, and BOTS) in the Party Glade: a themed pocket far west of every island. An adult starts
// it (`__game.party.open()` or the URL `?party`) and the kids play game after game without help. The rules are PURE modules (game/party/*.js: flowLogic.js, the games' own logic, partyDomain.js = the host-authoritative
// session-only `party` sync domain); this file moves people in and out behind a curtain, runs the stage cameras, the HUD, the bots, the Game Board and presents the games' records.
//
//   const party = createParty({ scene, camera, followCam, players, avatars, table, sync, hud, hudRoot, dialog, particles, sfx, music, items, world, water, busy })
//   party.preInput(dt)           once per tick BEFORE players.pollInput: the host's bots think and press (their BotSources)
//   party.update(dt, t)          once per tick after players.update: the domain's clock (host), the curtain, entering / leaving, the phases' presentation, the HUD
//   party.drive(p, actions, dt)  per player of the party each tick (main.js): the game's press (a hop / a chop), the Ready hold, the kiosk exit
//   party.updateCamera(dt)       replaces followCam.update while party.pageMode (a fixed stage camera per place)         party.light(sky, renderer)   the party's own light after the clock
//   party.afterItems()           hides the held tools (they are tucked away for the party and come back)                  party.allowsTarget(it)   only the Game Board is a target here
//   party.active                 the shared flag (a party is running somewhere: other systems stay out)                  party.pageMode   THIS screen currently shows the Glade        party.contains(p)
//   (Step 80b) Marlo Says and Pinecone Huddle add two input styles here: marloInput (Cancel / B = red, Interact / A = green; the stick only walks) and holdInput (the shell is a HOLD: act({ on }) at the start / end).
//   party.open(opts) / close() / toggle(id, on) / enabled() / games() / bots(n | 'fill', difficulty) / play(id) / next() / skip() / summary()   (also __game.party)
//
// What a party does to the rest of the game: the whole roster is moved to the Glade behind a confetti curtain (each screen moves ITS players and remembers where they stood); the islands and the sea are hidden;
// the follow camera, the tether, regroup, travel, the Bag, the quest tracker and every world interaction are off; held tools are tucked away; leaving (party.close(), or the kiosk exit: hold Cancel + Interact on
// the keyboard for 3 s) puts everybody back where they stood. Nothing is saved (only the Game Board's choices: `infiniteIsland.party`) and no island's placement or hash is touched.
//
// Own-body games (Vine Skip, Timber Trim): each screen moves its own players; the game's press is a host REQUEST stamped with the presser's game-clock estimate and re-judged with PARTY.slack
// (game/party/partyDomain.js). The host steps the rules and emits records; every screen applies them and presents them (world/party/<id>.js).
import * as THREE from 'three';
import { PARTY, PLAYER_COLORS } from '../config.js';
import { mulberry32 } from '../utils/rng.js';
import { addInteractable } from '../world/interactables.js';
import { addCollider } from '../world/colliders.js';
import { createPartyCurtain } from '../ui/partyCurtain.js';
import { createPartyUi } from '../ui/partyUi.js';
import { ICONS } from '../ui/icons.js';
import { createPartyDomain } from './party/partyDomain.js';
import { GAMES, getGame } from './party/registry.js';
import { botsWanted, countdownLabel, parseBots } from './party/flowLogic.js';
import { BOTS, botOrder, botByName, hostFor, cheerers } from './party/botRoster.js';
import { inParty, stageCentre, stageSpawns, spectatorSpot, lobbySpot } from './party/partyArea.js';
import { createGlade, CAMERAS, LOOKS } from '../world/party/glade.js';
import { setHopSpeed } from '../player/player.js';
import { createVineSkipWorld } from '../world/party/vineskip.js';
import { createTimberWorld } from '../world/party/timber.js';
import { createMarloSaysWorld, flagGeo } from '../world/party/marlosays.js';
import { createHuddleWorld } from '../world/party/huddle.js';
import { flagFromInput } from './party/marlosaysLogic.js';
import { floatLabels } from '../world/party/kit.js';
import { buildItemModel } from '../items/models.js';
import { VERTEX_TOON } from '../render/geo.js';

const PREF_KEY = 'infiniteIsland.party';
const O = PARTY.origin;
const STAGE_FACTORIES = { vineskip: createVineSkipWorld, timber: createTimberWorld, marlosays: createMarloSaysWorld, huddle: createHuddleWorld };
const _v = new THREE.Vector3();
const AMBIENT_LAYERS = ['butterfly-wings', 'butterfly-bodies', 'drifting-petals', 'ocean-glints'];

export function createParty({ scene, camera, followCam, players, avatars, table, sync, hud, hudRoot, dialog, particles, sfx, music, items, world, water, outfits = {}, busy = () => null, params = new URLSearchParams() }) {
  const ui = createPartyUi(hudRoot);
  const curtain = createPartyCurtain(hudRoot, { sfx });
  const labels = floatLabels(hudRoot);
  let glade = null;
  const stages = {};                                        // game id -> its world module (built on first use)
  const getGlade = () => (glade ||= createGlade({ scene }));
  const getStage = (id) => (stages[id] ||= STAGE_FACTORIES[id] ? STAGE_FACTORIES[id]({ scene, sfx, particles, labels }) : null);

  // ---- preferences (the Game Board's choices; per host screen; ?newgame does not clear them, like the comfort settings)
  const prefs = {
    read() { try { return localStorage.getItem(PREF_KEY); } catch (_) { return null; } },
    write(obj) { try { localStorage.setItem(PREF_KEY, JSON.stringify(obj)); } catch (_) { /* storage unavailable */ } },
  };

  // ---- where a slot's player stands (the host judges contact with it)
  function posOf(slot) {
    const p = players.get(slot);
    if (p) return p.position;
    const e = table.get(slot);
    const a = e && sync.actors && sync.actors.get(`${e.screen}:${slot}`);
    if (a && a.pos) return a.pos;
    const av = avatars.get(slot);
    return av ? av.position : null;
  }

  const domain = createPartyDomain({ sync, table, prefs, rng: Math.random, positionOf: posOf, busy, now: () => sync.hostNow() });
  const state = () => domain.state;

  // ---- screen state
  let partyMode = false;                                    // this screen shows the Glade (the islands and the sea are hidden)
  let place = 'lobby';                                      // 'lobby' | a game id: where this screen's camera / players are now
  let pt = 0;                                               // the party's own clock (s), counts while a party is open
  let phaseLocalT = 0;                                      // seconds since this screen saw the current phase begin
  let lastLabel = '', appliedKey = '', roulettePos = -1;
  const memory = new Map();                                 // Player -> { x, z }: where it stood before the party
  const tucked = new Map();                                 // Player -> its held item record (hidden meanwhile)
  const axes = new Map();                                   // Player -> its cosmetic party axe (Timber Trim)
  const flags = new Map();                                  // Player -> { red, green, until }: the cosmetic signal flag a press raises (Marlo Says)
  const inputMem = new Map();                               // Player -> the stick's last side (Marlo Says) ; holdMem: Player -> the shell hold (Pinecone Huddle)
  const holdMem = new Map();
  const timers = [];
  const readyHold = new Map(), readyRings = new Map();
  const botMind = new Map();                                // slot -> { mem, rng }
  let botTimer = 0, yieldUntil = -1, exitHold = 0, resultsHopT = 0, lastTempo = 1;
  const focus = new THREE.Vector3();

  const later = (secs, fn) => timers.push({ at: pt + secs, fn });
  const localPlayers = () => players.list.filter((p) => !p.away && !p.leaving);
  const inPocket = (p) => inParty(p.position.x, p.position.z);
  const rosterIndex = (slot) => state().roster.findIndex((r) => r.slot === slot);
  const colorOf = (slot) => { const r = state().roster.find((x) => x.slot === slot); return r && r.bot ? (botByName(r.name)?.colors.ui || '#fff') : (PLAYER_COLORS[slot] ? PLAYER_COLORS[slot].ui : '#fff'); };
  const nameOf = (slot) => { const r = state().roster.find((x) => x.slot === slot); return r ? r.name : `P${slot + 1}`; };

  // ---- the lobby's fixtures: the Game Board (an interactable), colliders, registered ONCE (they live in the pocket, nothing else is ever near them)
  const boardPos = new THREE.Vector3(O.x + PARTY.lobby.board.x, O.y + 1.2, O.z + PARTY.lobby.board.z + 0.4);
  addCollider({ x: O.x + PARTY.lobby.board.x - 1.5, z: O.z + PARTY.lobby.board.z, r: 0.35, owner: 'party' });
  addCollider({ x: O.x + PARTY.lobby.board.x + 1.5, z: O.z + PARTY.lobby.board.z, r: 0.35, owner: 'party' });
  for (const dx of [-2, 0, 2]) addCollider({ x: O.x + PARTY.lobby.podium.x + dx, z: O.z + PARTY.lobby.podium.z, r: 1.0, owner: 'party' });
  for (const dx of [-3.4, 0, 3.4]) addCollider({ x: O.x + PARTY.lobby.stage.x + dx, z: O.z + PARTY.lobby.stage.z + 0.4, r: 0.7, owner: 'party' });
  const vc = stageCentre('vineskip');
  addCollider({ x: vc.x, z: vc.z, r: PARTY.vineskip.rMin - 0.4, owner: 'party' });
  addInteractable({ type: 'partyboard', object: null, position: boardPos, radius: 1.9, prompt: 'Game Board', onInteract: (_it, p) => openBoard(p) });
  // the dress-up corner: each stand cycles the player through what the island has unlocked (the same hat rack / tail stump / garland stand rules, saving and pose ids)
  const DRESS = {
    hats: { prompt: 'Try a hat', icon: 'hat', locked: 'Hats come from campfire feasts!', count: (s) => s.unlocked, r: 0.45 },
    tails: { prompt: 'Try a tail', icon: 'fox', locked: 'Tails come from the Frostpine critter camp!', count: (s) => s.unlocked.length, r: 0.85 },
    garlands: { prompt: 'Try a garland', icon: 'sprout', locked: 'Garlands come from the Emberleaf garden!', count: (s) => s.unlocked.length, r: 0.6 },
  };
  const dressNote = new Map();                                // `${kind}:${slot}` -> time of the last "locked" toast (so mashing does not stack them)
  function dressUp(kind, p) {
    const sys = outfits[kind], D = DRESS[kind];
    if (!sys || !p) return;
    if (!(D.count(sys) > 0)) {
      const key = `${kind}:${p.index}`;
      if (pt - (dressNote.get(key) ?? -10) > 2.5) { dressNote.set(key, pt); hud.toast(D.locked, { icon: D.icon, duration: 2400 }); sfx.play('bip'); }
      return;
    }
    sys.cycle(p);
  }
  for (const kind of Object.keys(DRESS)) {
    const at = PARTY.lobby.dress[kind];
    addCollider({ x: O.x + at.x, z: O.z + at.z, r: DRESS[kind].r, owner: 'party' });
    addInteractable({ type: 'partydress', kind, object: null, position: new THREE.Vector3(O.x + at.x, O.y + 1.2, O.z + at.z), radius: 1.3, prompt: DRESS[kind].prompt, onInteract: (_it, p) => dressUp(kind, p) });
  }

  // ================================================================== moving people
  function poof(p) { particles.burst('puff', { x: p.position.x, y: p.position.y + 0.5, z: p.position.z }, { count: 8, radius: 0.5, height: 0.3 }); }
  function moveTo(p, spot, fx = true) {
    if (!spot) return;
    if (fx) poof(p);
    p.teleport(spot.x, spot.z);
    p.facing = spot.face || 0; p.root.rotation.y = p.facing; p._faceTo = null;
    p.velocity.x = p.velocity.z = 0;
    if (fx) particles.burst('sparkle', { x: p.position.x, y: p.position.y + 0.6, z: p.position.z }, { count: 8, radius: 0.5, color: p.colors.ui });
  }
  function spotFor(p, where) {
    const roster = state().roster, idx = roster.findIndex((r) => r.slot === p.index);
    if (where === 'lobby') return lobbySpot(idx >= 0 ? idx : p.index);
    if (idx >= 0) return stageSpawns(where, Math.max(1, roster.length))[idx] || spectatorSpot(where, idx);
    return spectatorSpot(where, p.index);
  }
  function movePlayers(where, fx = true) {
    place = where;
    for (const p of localPlayers()) moveTo(p, spotFor(p, where), fx);
    players._updateFocus();
    followCam.snap();
  }
  const placeFor = (s) => (['howto', 'countdown', 'play', 'results'].includes(s.phase) && s.game ? s.game : 'lobby');

  function tuck(on) {
    if (on) { for (const p of localPlayers()) { const rec = items.heldBy(p); if (rec) tucked.set(p, rec); } avatars.hideHeld = true; }
    else { for (const [p, rec] of tucked) { if (rec.pivot) rec.pivot.visible = true; p.holding = !!items.heldBy(p); } tucked.clear(); avatars.hideHeld = false; }
  }
  function afterItems() {
    if (!partyMode) return;
    for (const [p, rec] of tucked) { if (items.heldBy(p) === rec && rec.pivot) rec.pivot.visible = false; else tucked.delete(p); p.holding = false; }
  }

  function setMode(on) {
    partyMode = on;
    if (!on) setHopSpeed(null);                             // (Vine Skip's tall hop never leaks onto the islands)
    world.root.visible = !on;                               // the islands, their props and the far versions
    water.group.visible = !on;                              // and the sea
    for (const name of AMBIENT_LAYERS) { const o = scene.getObjectByName(name); if (o) o.visible = !on; }     // (the island's butterflies, petals and sea glints: draw calls the Glade does not need)
    hudRoot.classList.toggle('party-active', on);
    ui.setActive(on);
    if (on) { getGlade().setVisible(true); followCam.regionBlend = 0; }
    else {
      glade?.setVisible(false);
      for (const id in stages) stages[id]?.setVisible(false);
      for (const p of [...axes.keys()]) dropAxe(p);
      for (const p of [...flags.keys()]) dropFlags(p);
      for (const p of [...localPlayers(), ...avatars.list]) p.downed = false;
      music.party?.(null);
      labels.clear();
      followCam.resize(window.innerWidth, window.innerHeight);
    }
    followCam.snap();
  }

  function reconcile() {
    if (curtain.running) return;
    const want = state().active;
    const wrong = localPlayers().some((p) => inPocket(p) !== want);
    if (!wrong && partyMode === want) return;
    curtain.start(() => transition(), () => reconcile());
  }
  function transition() {
    const want = state().active, s = state();
    if (want) {
      dialog.close();
      for (const p of localPlayers()) if (!inPocket(p) && !p.bot) memory.set(p, { x: p.position.x, z: p.position.z });
      if (!partyMode) { tuck(true); setMode(true); }
      for (const p of localPlayers()) {
        if (!inPocket(p)) { p.setPose?.(null); p._swingT = -1; poof(p); }
      }
      appliedKey = '';
      applyPhase(s, true);
      appliedKey = phaseKey(s);
    } else {
      for (const p of localPlayers()) {
        if (!inPocket(p)) continue;
        const m = memory.get(p) || memory.get(players.p1) || { x: 0, z: 14 };
        poof(p);
        p.teleport(m.x, m.z);
        particles.burst('sparkle', { x: p.position.x, y: p.position.y + 0.6, z: p.position.z }, { count: 8, radius: 0.5, color: p.colors.ui });
        dropAxe(p);
      }
      memory.clear();
      tuck(false);
      setMode(false);
    }
    players._updateFocus();
    followCam.snap();
    followCam.update(0, players.focus);
    world.snap?.();
  }

  // ================================================================== phases
  const phaseKey = (s) => `${s.serial}|${s.phase}|${s.game}|${s.round}`;
  /** A new phase (or game): show the right stage, move this screen's players there, start the phase's sounds and cards. */
  function applyPhase(s, entering = false) {
    phaseLocalT = 0;
    const where = placeFor(s);
    setHopSpeed(s.game === 'vineskip' && s.phase !== 'lobby' && s.phase !== 'pick' ? PARTY.vineskip.hopSpeed : null);      // every screen: its own players AND the avatars jump the same height
    const g = s.game ? getGame(s.game) : null;
    for (const id in stages) stages[id]?.setVisible(id === where);
    if (where !== 'lobby') getStage(where)?.setVisible(true);
    if (where !== place || entering || s.phase === 'lobby') movePlayers(where, !entering);
    if (s.phase !== 'play' && s.phase !== 'results') { for (const p of [...localPlayers(), ...avatars.list]) if (p.downed) p.downed = false; }      // (Pinecone Huddle's dazed players get up)
    holdMem.clear(); inputMem.clear();
    if (s.phase === 'lobby') {
      getGlade().setCheerers(cheerers(s.round));
      getGlade().cheer(true);
      ui.hideCard(); ui.hideBanner(); lastLabel = '';
      for (const id in stages) stages[id]?.clearPractice?.();
      for (const p of [...axes.keys()]) dropAxe(p);
      for (const p of [...flags.keys()]) dropFlags(p);
      music.party?.(null);
    } else if (s.phase === 'pick') {
      ui.hideBanner();
      sfx.play('pop', { pitch: 1.3 });
    } else if (s.phase === 'howto') {
      sfx.play('pop', { pitch: 1.1 });
      if (g && s.game === 'timber') for (const p of localPlayers()) giveAxe(p);
    } else if (s.phase === 'countdown') {
      ui.hideCard(); lastLabel = '';
      getStage(s.game)?.clearPractice?.();
    } else if (s.phase === 'play') {
      lastLabel = ''; lastTempo = 1;
      ui.banner('Go!', { ms: 900, tone: 'go' });
      sfx.play('go');
      music.party?.(s.game);
    } else if (s.phase === 'results') {
      music.party?.(null);
      ui.banner('Finish!', { ms: 1500, tone: 'fin' });
      sfx.play('whistle');
      resultsHopT = 0;
      later(1.1, () => { if (state().phase === 'results') { sfx.play(state().results?.partyOver ? 'trophy' : 'fanfare'); if (state().results?.winners.length) sfx.play('roundWon', { vol: 0.8 }); celebrate(); } });
    }
  }

  function celebrate() {
    const s = state(), c = s.game && s.game !== 'lobby' ? stageCentre(s.game) : stageCentre('lobby');
    particles.burst('confetti', { x: c.x, y: O.y + 4.5, z: c.z }, { count: 60, radius: 4.5, height: 1 });
    particles.burst('confetti', { x: c.x - 4, y: O.y + 3.5, z: c.z + 2 }, { count: 30, radius: 2.5 });
    particles.burst('confetti', { x: c.x + 4, y: O.y + 3.5, z: c.z + 2 }, { count: 30, radius: 2.5 });
    getGlade().cheer(true);
  }

  domain.on((kind, d) => { if (kind === 'rec') onRec(d.r); });          // (phases are applied by update(): it polls the shared state, so a late joiner and a reconnect land in the right place too)

  // ---- presentation of the games' records
  function onRec(rec) {
    const s = state(), id = s.game;
    if (!partyMode || !id || !s.g) return;
    const g = getGame(id), v = g.view(s.g, domain.gameTime()), st = getStage(id);
    st?.onRec?.(rec, v);
    if (id === 'vineskip' && rec.k === 'out') tumble(rec.slot);
    else if (id === 'marlosays' && rec.k === 'out') splashDown(rec.slot);
    else if (id === 'huddle' && rec.k === 'out') daze(rec.slot);
  }
  function tumble(slot) {
    const p = players.get(slot) || avatars.get(slot);
    if (!p) return;
    const at = { x: p.position.x, y: p.position.y + 0.9, z: p.position.z };
    sfx.play('boing'); later(0.25, () => sfx.play('splash', { vol: 0.8 }));
    particles.burst('puff', { x: at.x, y: p.position.y + 0.3, z: at.z }, { count: 10, radius: 0.7, color: '#ffb066' });
    labels.label('Oops!', at, '#ffd0d0');
    if (players.get(slot)) {                                // this screen's own player (a person or a bot on the host): over the edge into the warm moat, then up on the rim to cheer
      p.hurt?.({ x: 0, z: 1 }, 0.5);
      later(0.6, () => {
        if (state().phase !== 'play' && state().phase !== 'results') return;
        const rs = spectatorSpot('vineskip', slot);                      // (one rim spot per seat, so two screens never pick the same one)
        particles.burst('puff', { x: p.position.x, y: p.position.y + 0.3, z: p.position.z }, { count: 8, radius: 0.8, color: '#ffb066' });
        p.teleport(rs.x, rs.z); p.facing = rs.face; p.root.rotation.y = rs.face;
        sfx.play('splash', { vol: 0.6 });
        particles.burst('puff', { x: p.position.x, y: p.position.y + 0.3, z: p.position.z }, { count: 8, radius: 0.8, color: '#ffb066' });
      });
    }
  }

  // Marlo Says: a splashed player drops into the tide pool, then climbs out onto the beach to cheer (the owning screen moves its own body)
  function splashDown(slot) {
    const p = players.get(slot) || avatars.get(slot);
    if (!p) return;
    p.hurt?.({ x: 0, z: -1 }, 0.5);
    if (players.get(slot)) {
      later(0.7, () => {
        if (state().phase !== 'play' && state().phase !== 'results') return;
        const rs = spectatorSpot('marlosays', slot);
        particles.burst('puff', { x: p.position.x, y: p.position.y + 0.3, z: p.position.z }, { count: 8, radius: 0.8, color: '#bfe6ff' });
        p.teleport(rs.x, rs.z); p.facing = rs.face; p.root.rotation.y = rs.face;
        sfx.play('splash', { vol: 0.5 });
      });
    }
  }
  // Pinecone Huddle: a hit while open: dazed and flat on the stump under a heap of snow (the stage draws the heap) until the next phase
  function daze(slot) {
    const p = players.get(slot) || avatars.get(slot);
    if (!p) return;
    p.hurt?.({ x: 0, z: 1 }, 0.4);
    p.downed = true;
  }

  // ---- the signal flag a Marlo Says press raises in the right hand (red or green), cosmetic and per screen
  function waveFlag(p, flag) {
    if (!p.parts.handSocket) return;
    let f = flags.get(p);
    if (!f) {
      f = { until: 0 };
      for (const color of ['red', 'green']) {
        const m = new THREE.Mesh(flagGeo(color), VERTEX_TOON);
        m.castShadow = false; m.visible = false; m.scale.setScalar(1.0); m.position.set(0, -0.05, 0); m.rotation.x = Math.PI;       // (the pole points up out of the fist)
        p.parts.handSocket.add(m);
        f[color] = m;
      }
      flags.set(p, f);
    }
    f.red.visible = flag === 'red'; f.green.visible = flag === 'green';
    f.until = pt + 0.7;
    p.swing();
  }
  function dropFlags(p) {
    const f = flags.get(p);
    if (!f) return;
    for (const c of ['red', 'green']) { f[c].removeFromParent(); f[c].geometry.dispose(); }
    flags.delete(p);
  }

  // ---- a cosmetic axe in every hand for Timber Trim (the held tool is tucked away for the party)
  function giveAxe(p) {
    if (axes.has(p) || !p.parts.handSocket) return;
    const m = buildItemModel('axe'), pivot = new THREE.Group();
    pivot.add(m);
    pivot.rotation.set(0.35, 0, 0.25);
    m.traverse((o) => { if (o.isMesh) o.castShadow = false; });     // (draw-call budget: the axe casts no shadow)
    p.parts.handSocket.add(pivot);
    axes.set(p, pivot);
  }
  function dropAxe(p) {
    const pivot = axes.get(p);
    if (!pivot) return;
    pivot.removeFromParent();
    axes.delete(p);
  }

  // ================================================================== bots (host)
  function takenNames() { return table.snapshot().filter((e) => e && e.bot).map((e) => e.name); }
  function syncBots(dt) {
    if (!sync.isHost || !partyMode || curtain.running) return;
    const s = state();
    if (s.phase !== 'lobby' && s.phase !== 'pick') return;
    botTimer -= dt;
    if (botTimer > 0) return;
    const humans = table.snapshot().filter((e) => e && !e.bot).length;
    const have = players.bots.filter((p) => !p.leaving);
    let want = botsWanted(humans, s.bots);
    if (pt < yieldUntil && humans + have.length >= 4) want = Math.max(0, want - 1);          // a human is waiting for a seat: a bot gives its up
    if (have.length < want && table.count < 4) {
      const b = botOrder(takenNames())[0];
      const p = players.spawnBot({ name: b.name, colors: { ...b.colors, name: b.name }, ears: b.ears });
      if (p) { p.partyBot = b; moveTo(p, lobbySpot(table.count), false); botMind.set(p.index, { mem: { wander: null, wanderAt: 0, readyAt: -1 }, rng: mulberry32(0x5bd1e995 ^ (p.index * 7919) ^ (pt * 1000 | 0)) }); }
      botTimer = 0.4;
    } else if (have.length > want) {
      const p = have.sort((a, b) => b.index - a.index)[0];
      players.removeBot(p); botMind.delete(p.index);
      botTimer = 0.3;
    } else botTimer = 0.5;
  }
  function removeAllBots() { for (const p of players.bots) { players.removeBot(p); } botMind.clear(); }

  function preInput(dt) {
    if (!sync.isHost || !players.bots.length) return;
    const s = state(), skill = PARTY.bots[s.difficulty] || PARTY.bots.normal;
    for (const p of players.bots) {
      const src = p.botSource;
      if (!src) continue;
      src.tick(dt);
      const mind = botMind.get(p.index) || botMind.set(p.index, { mem: { wander: null, wanderAt: 0, readyAt: -1 }, rng: mulberry32(0x9e3779b9 ^ (p.index * 104729)) }).get(p.index);
      const intent = { x: 0, y: 0 };
      if (!partyMode || curtain.running) { src.intend(intent); continue; }
      if (s.phase === 'play' && s.g && !s.g.done) {
        const g = getGame(s.game), v = g.view(s.g, domain.gameTime());
        Object.assign(intent, g.bot(v, { slot: p.index, x: p.position.x, z: p.position.z, mem: mind.mem }, skill, mind.rng));
        if (intent.hold) for (const b of Object.keys(intent.hold)) src.hold(b, intent.hold[b]);          // (a bot that holds a button, like the shell in Pinecone Huddle)
      } else if (s.phase === 'howto') {
        if (mind.mem.readyAt < 0) mind.mem.readyAt = phaseLocalT + skill.ready[0] + mind.rng() * (skill.ready[1] - skill.ready[0]);
        if (phaseLocalT >= mind.mem.readyAt && !mind.mem.readied) { mind.mem.readied = true; src.hold('interact', 0.7); }
      } else if (s.phase === 'lobby' || s.phase === 'results') {
        mind.mem.readyAt = -1; mind.mem.readied = false;
        if (s.phase === 'lobby') wander(p, mind, intent, skill);
      } else { mind.mem.readyAt = -1; mind.mem.readied = false; }
      src.intend(intent);
    }
  }
  function wander(p, mind, intent, skill) {
    const m = mind.mem;
    if (!m.wander || pt >= m.wanderAt || Math.hypot(m.wander.x - p.position.x, m.wander.z - p.position.z) < 0.5) {
      if (mind.rng() < 0.55) m.wander = { x: O.x + (mind.rng() - 0.5) * 16, z: O.z + 1 + mind.rng() * 8 }; else m.wander = null;
      m.wanderAt = pt + 1.5 + mind.rng() * 3.5;
    }
    if (m.wander) {
      const dx = m.wander.x - p.position.x, dz = m.wander.z - p.position.z, d = Math.hypot(dx, dz) || 1;
      if (d > 0.6) { intent.x = (dx / d) * 0.6 * skill.walk; intent.y = -(dz / d) * 0.6 * skill.walk; }
    }
  }

  // ================================================================== input
  const isDown = (a, b) => (b === 'jump' ? a.jumpPressed : b === 'interact' ? a.interactPressed : b === 'cancel' ? a.cancelPressed : false);
  function pressedGameButton(a, g) { return g.press.some((b) => isDown(a, b)); }

  function drive(p, a, dt) {
    if (!partyMode || p.away || p.frozen || curtain.running) return;
    const s = state();
    const g = s.game ? getGame(s.game) : null;
    if (s.phase === 'lobby' || s.phase === 'pick') {
      if (a.jumpPressed) { if (p.hop()) sfx.play('bip', { pitch: 1.4, vol: 0.4 }); }
      return;
    }
    if (!g) return;
    const out = s.g && s.g.alive && s.g.alive[p.index] === false;
    if (s.phase === 'howto') {
      if (g.id === 'marlosays') marloInput(p, a, s, true);
      else if (g.hold) holdInput(p, a, s, true);
      else if (pressedGameButton(a, g)) practiceAction(p, g, s);
      // Ready: hold Interact
      const ri = rosterIndex(p.index);
      if (ri >= 0 && !s.roster[ri].bot) {
        const r = s.roster[ri], held = (readyHold.get(p) || 0) + (a.interactHeld ? dt : -dt * 3);
        readyHold.set(p, Math.max(0, Math.min(PARTY.flow.readyHold + 0.1, held)));
        if (!r.ready && held >= PARTY.flow.readyHold) { sfx.play('chime', { pitch: 1.3 }); domain.setReady(sync.actorFor(p), true); }
      }
      return;
    }
    if (s.phase === 'countdown') return;
    if (s.phase === 'play') {
      if (out || !s.g || s.g.done) { holdMem.delete(p); return; }
      if (g.id === 'marlosays') marloInput(p, a, s, false);
      else if (g.hold) holdInput(p, a, s, false);
      else if (pressedGameButton(a, g)) gameAction(p, g, s);
      return;
    }
    if (s.phase === 'results') { if (a.jumpPressed || a.interactPressed) p.hop(); }
  }
  // Marlo Says: Cancel (B) = red, Interact (A) = green; the stick only walks (a post is a walkable disc in the water, so wandering kids stay dry)
  function marloInput(p, a, s, practice) {
    if (rosterIndex(p.index) < 0) return;
    const flag = flagFromInput(a);
    if (!flag) return;
    waveFlag(p, flag);
    if (practice) {
      const st = stages.marlosays;
      if (st) st.practicePress(Math.max(0, rosterIndex(p.index)), flag, p); else sfx.play('bip', { vol: 0.3 });
    } else {
      sfx.play('whoosh', { vol: 0.2, pitch: flag === 'red' ? 0.9 : 1.2 });
      domain.act(sync.actorFor(p), domain.gameTime(), { flag });
    }
  }
  // Pinecone Huddle: hold any button to stay curled; the start and the end of a hold are the requests (the practice shell is local)
  function holdInput(p, a, s, practice) {
    const held = !!(a.interactHeld || a.jumpHeld || a.cancelHeld), was = holdMem.get(p) || false;
    if (held === was) return;
    holdMem.set(p, held);
    if (practice) { const st = stages.huddle; if (st) st.setPracticeHold(Math.max(0, rosterIndex(p.index)), held); return; }
    domain.act(sync.actorFor(p), domain.gameTime(), { on: held });
  }
  function practiceAction(p, g, s) {
    if (g.id === 'vineskip') { p.hop(); }
    else if (g.id === 'timber') {
      p.swing();
      const st = stages.timber, lane = Math.max(0, rosterIndex(p.index));
      const r = st && st.practicePress(lane, p);
      if (!r) sfx.play('whoosh', { vol: 0.3 });
    }
  }
  function gameAction(p, g, s) {
    if (g.id === 'vineskip') p.hop(); else if (g.id === 'timber') { p.swing(); sfx.play('whoosh', { vol: 0.25 }); }
    domain.act(sync.actorFor(p), domain.gameTime());
  }

  function updateExit(dt) {
    let holding = false;
    if (sync.isHost) for (const p of localPlayers()) if (p.actions.cancelHeld && p.actions.interactHeld && p.device === 'local') holding = true;
    exitHold = holding ? exitHold + dt : Math.max(0, exitHold - dt * 2);
    ui.exit(exitHold > 0.25 ? exitHold / PARTY.kiosk.exitHold : null);
    if (exitHold >= PARTY.kiosk.exitHold) { exitHold = 0; ui.exit(null); close(); }
  }

  // ================================================================== the Game Board
  const MODE_NAME = { random: 'Random', party: 'Party', pick: 'Pick' };
  function openBoard(p) {
    if (!partyMode || state().phase !== 'lobby' || dialog.isOpen) return;
    const refresh = (r) => Promise.resolve(r).then((x) => { dialog.refresh?.(); return x; });
    const denied = (r) => { if (r && r.ok === false && r.reason === 'host-only') hud.toast('The host screen changes the Game Board.', { icon: 'sparkle', duration: 2200 }); else if (r && r.ok === false && r.reason === 'last') hud.toast('At least one game stays on!', { icon: 'sparkle', duration: 2200 }); };
    const gameMenu = (g) => ({
      text: `${g.name}  (${hostFor(g.id).name})`,
      choices: () => {
        const on = state().enabled.includes(g.id);
        return [
          { label: on ? 'Switch off' : 'Switch on', detail: on ? 'On' : 'Off', icon: ICONS['party-' + g.id], onSelect: () => refresh(domain.toggle(g.id, !on)).then(denied) },
          { label: state().next === g.id ? 'Play this one next (set)' : 'Play this one next', disabled: !on, icon: ICONS.star, onSelect: () => refresh(domain.playNext(g.id)).then(denied) },
          { label: 'Back', onSelect: () => dialog.showChoices(main.choices, { text: main.text, onCancel: () => dialog.close() }) },
        ];
      },
    });
    const cycle = (list, cur) => list[(list.indexOf(cur) + 1) % list.length];
    const main = {
      text: 'Game Board: pick the party games.',
      choices: () => [
        ...GAMES.map((g) => ({ label: g.name, detail: `${state().enabled.includes(g.id) ? 'On' : 'Off'}${state().next === g.id ? ' - next' : ''}`, icon: ICONS['party-' + g.id], onSelect: () => dialog.showChoices(gameMenu(g).choices, { text: gameMenu(g).text, onCancel: () => dialog.showChoices(main.choices, { text: main.text, onCancel: () => dialog.close() }) }) })),
        { label: 'Mode', detail: MODE_NAME[state().mode], onSelect: () => refresh(domain.setMode({ mode: cycle(PARTY.modes, state().mode) })).then(denied) },
        { label: 'Bots', detail: state().bots === 'fill' ? 'Fill seats' : String(state().bots), icon: ICONS.bot, onSelect: () => refresh(domain.setMode({ bots: cycle(['fill', 0, 1, 2, 3], state().bots) })).then(denied) },
        { label: 'Bot skill', detail: state().difficulty, onSelect: () => refresh(domain.setMode({ difficulty: cycle(PARTY.difficulties, state().difficulty) })).then(denied) },
        { label: 'Close', onSelect: () => dialog.close() },
      ],
    };
    dialog.open({ owner: p, name: 'Game Board', text: main.text, choices: main.choices, menuId: 'party-board', onCancel: () => dialog.close() });
  }

  // ================================================================== camera + light
  function camCfg() {
    if (place === 'lobby') return CAMERAS.lobby;
    return (getStage(place) || {}).cam || CAMERAS.lobby;
  }
  function updateCamera(dt) {
    const c = camCfg();
    followCam.offset.set(c.offset.x, c.offset.y, c.offset.z);
    focus.set(c.focus.x, c.focus.y - 0.9, c.focus.z);
    const aspect = camera.aspect > 0 ? camera.aspect : 16 / 9;
    camera.aspect = aspect;
    const z = Math.max(0.8, followCam.zoomForExtent(c.extent.w, c.extent.d, 0.4, false));
    followCam.update(dt, focus, z);
  }
  const LOOK_CACHE = {};
  function light(sky, renderer) {
    if (!partyMode) return false;
    const name = place === 'lobby' ? 'day' : ((getStage(place) || {}).look || 'day');
    const L = LOOKS[name];
    const c = LOOK_CACHE[name] ||= { bg: new THREE.Color(L.bg), top: new THREE.Color(L.top), horizon: new THREE.Color(L.horizon), sun: new THREE.Color(L.sun), sky: new THREE.Color(L.sky), ground: new THREE.Color(L.ground) };
    scene.background?.copy?.(c.bg); scene.fog?.color.copy(c.bg);
    const u = sky.dome.material.uniforms;
    u.uTop.value.copy(c.top); u.uHorizon.value.copy(c.horizon); u.uSunVisible.value = 0; u.uMoonVisible.value = 0;
    sky.stars.material.uniforms.uNight.value = L.stars;
    sky.sun.color.copy(c.sun); sky.sun.intensity = L.sunIntensity;
    sky.sun.position.copy(sky.sun.target.position).addScaledVector(_v.set(...L.sunDir).normalize(), Math.hypot(...L.sunDir));
    sky.hemi.color.copy(c.sky); sky.hemi.groundColor.copy(c.ground); sky.hemi.intensity = L.hemiIntensity;
    renderer.toneMappingExposure = L.exposure;
    return true;
  }

  // ================================================================== per frame
  function boardRows() {
    const s = state(), g = s.game ? getGame(s.game) : null, v = g && s.g ? g.view(s.g, Math.max(0, domain.gameTime())) : null, st = g ? stages[s.game] : null;
    return s.roster.map((r) => {
      const live = v && st && (s.phase === 'play' || s.phase === 'results') ? st.scoreText(v, r.slot) : { text: '', out: false };
      return { slot: r.slot, name: r.name, bot: r.bot, color: colorOf(r.slot), stars: s.stars[r.slot] || 0, line: live.text, out: live.out, ready: s.phase === 'howto' && (r.ready) };
    });
  }

  function update(dt, t) {
    pt += dt;
    domain.update(dt);
    curtain.update(dt);
    for (let i = timers.length - 1; i >= 0; i--) if (pt >= timers[i].at) { const f = timers[i].fn; timers.splice(i, 1); try { f(); } catch (e) { console.error(e); } }
    const s = state();
    reconcile();
    if (!s.active && !partyMode && sync.isHost && players.bots.length && !curtain.running) removeAllBots();
    if (!partyMode || curtain.running) return;
    const key = phaseKey(s);
    if (key !== appliedKey) { appliedKey = key; applyPhase(s); }
    phaseLocalT += dt;
    const gt = domain.gameTime(), g = s.game ? getGame(s.game) : null, st = s.game ? stages[s.game] : null;
    glade?.update(dt, pt);
    if (st && st.root.visible) {
      const mode = s.phase === 'howto' ? 'practice' : s.phase === 'play' || s.phase === 'results' ? 'play' : 'wait';
      const v = mode === 'play' && g && s.g ? g.view(s.g, Math.max(0, gt)) : null;
      st.update(dt, { mode, v, t: Math.max(0, gt) });
      if (s.phase === 'play' && s.game === 'vineskip' && v) { const k = 1 + 0.045 * v.level; if (k !== lastTempo) { lastTempo = k; music.setTempo?.(k); } }
      else if (s.phase === 'play' && s.game === 'marlosays' && v) { const k = v.tempo; if (k !== lastTempo) { lastTempo = k; music.setTempo?.(k); } }      // (the shanty follows the beats: faster as the flags get shorter)
    }
    for (const [p, f] of flags) if (pt >= f.until && (f.red.visible || f.green.visible)) f.red.visible = f.green.visible = false;
    labels.update(dt, camera);
    ui.setBoard(boardRows());
    // --- the HUD of each phase
    if (s.phase === 'lobby') {
      const wait = s.round === 0 && !s.results ? PARTY.flow.lobbyFirst : PARTY.flow.lobby, total = s.mode === 'pick' && !s.next ? PARTY.flow.pickWait : wait;
      const left = Math.max(0, Math.ceil(total - (sync.isHost ? s.t : phaseLocalT)));
      ui.pill(s.mode === 'pick' && !s.next ? `Pick a game at the Game Board! (${left})` : `Next game in ${left}   ·   ${s.mode === 'party' ? `Round ${Math.min(s.round + 1, s.rounds)} of ${s.rounds}` : MODE_NAME[s.mode]}`);
    } else ui.pill(null);
    if (s.phase === 'pick') {
      const ids = s.enabled, n = ids.length, target = Math.max(0, ids.indexOf(s.game));
      const u = Math.min(1, phaseLocalT / PARTY.flow.roulette), pos = (1 - Math.pow(1 - u, 3)) * (n * 3 + target);
      if (Math.floor(pos) !== roulettePos) { roulettePos = Math.floor(pos); if (u < 1) sfx.play('tick', { pitch: 0.9 + u * 0.6 }); }
      ui.roulette({ ids, names: ids.map((id) => getGame(id).name), pos });
    } else roulettePos = -1;
    if (s.phase === 'howto' && g) {
      const kinds = [...new Set(localPlayers().filter((p) => !p.bot).map((p) => (p.deviceKind === 'phone' ? 'phone' : p.deviceKind === 'gamepad' ? 'gamepad' : 'keyboard')))];
      const devs = (kinds.length ? kinds : ['keyboard']).map((kind) => ({ kind, buttons: g.howto.buttons.map((btn) => ({ btn, verb: g.howto.verbs ? g.howto.verbs[btn] || '' : '' })) }));
      ui.howto({
        id: g.id, name: g.name, host: g.host, line: hostFor(g.id).lines.welcome || '', pitch: g.howto.pitch, devices: devs, left: PARTY.flow.howtoMax - phaseLocalT,
        rows: s.roster.map((r) => ({ name: r.name, color: colorOf(r.slot), ready: r.ready, bot: r.bot })),
      });
    }
    if (s.phase === 'countdown') {
      const label = countdownLabel(Math.max(0, gt + PARTY.flow.countdown));
      if (label !== lastLabel) { lastLabel = label; ui.banner(label, { ms: 900 }); sfx.play('count', { pitch: label === '1' ? 1.25 : 1 }); }
    }
    if (s.phase === 'play') ui.hideCard();
    if (s.phase === 'results' && s.results && phaseLocalT > 1.4) {
      const R = s.results, g2 = getGame(R.game);
      ui.results({
        id: R.game, name: g2 ? g2.name : '', partyOver: R.partyOver, round: R.round,
        ranks: R.ranks.map((r) => ({ name: nameOf(r.slot), bot: !!s.roster.find((x) => x.slot === r.slot && x.bot), color: colorOf(r.slot), place: r.place, score: resultScore(R.game, r), stars: s.stars[r.slot] || 0, winner: r.place === 1 })),
      });
      resultsHopT += dt;
      if (resultsHopT > 0.9) {
        resultsHopT = 0;
        for (const p of localPlayers()) { const rk = R.ranks.find((r) => r.slot === p.index); if (rk && rk.place === 1) { p.hop(); particles.burst('sparkle', { x: p.position.x, y: p.position.y + 1.6, z: p.position.z }, { count: 5, radius: 0.5, color: '#ffe27a' }); } }
      }
    }
    updateReadyRings();
    updateExit(dt);
    syncBots(dt);
  }
  function resultScore(id, r) {
    if (id === 'vineskip') return r.out ? `${Number(r.score).toFixed(1)}s` : 'Last one up!';
    if (id === 'marlosays') return r.out ? `Splash at flag ${Number(r.score) + 1}` : 'Dry to the end!';
    if (id === 'huddle') return r.out ? 'Dazed' : `${Number(r.score).toFixed(1)}s of shell`;
    return `${r.score} pts`;
  }

  function updateReadyRings() {
    const show = state().phase === 'howto' && partyMode;
    for (const p of players.list) {
      let ring = readyRings.get(p);
      if (!ring) { ring = document.createElement('div'); ring.className = 'drop-hold-ring'; ring.hidden = true; hudRoot.appendChild(ring); readyRings.set(p, ring); }
      const h = readyHold.get(p) || 0, r = state().roster.find((x) => x.slot === p.index);
      ring.hidden = !(show && h > 0.05 && !(r && r.ready));
      if (!ring.hidden) {
        _v.set(p.position.x, p.position.y + 2.15, p.position.z).project(camera);
        ring.style.left = `${(_v.x * 0.5 + 0.5) * window.innerWidth}px`;
        ring.style.top = `${(-_v.y * 0.5 + 0.5) * window.innerHeight}px`;
        ring.style.background = `conic-gradient(${p.colors.ui} ${Math.min(360, h / PARTY.flow.readyHold * 360)}deg, #ffffff99 0)`;
      }
    }
    for (const [p, ring] of readyRings) if (!players.list.includes(p)) { ring.remove(); readyRings.delete(p); readyHold.delete(p); }
  }

  players.on('leave', (p) => { memory.delete(p); tucked.delete(p); dropAxe(p); dropFlags(p); readyHold.delete(p); holdMem.delete(p); inputMem.delete(p); });
  players.on('join', (p) => {
    if (partyMode && state().active && !p.bot) {                // a person who joins mid-party: with the others in the Glade
      const m = players.p1 && memory.get(players.p1);
      if (m) memory.set(p, { ...m });
      const rec = items.heldBy(p); if (rec) tucked.set(p, rec);
    }
  });
  players.onFull = () => { if (state().active) yieldUntil = pt + 15; };

  // ================================================================== API
  function optsFromParams(q) {
    const o = {};
    if (q.get('mode')) o.mode = q.get('mode');
    if (q.get('games')) o.games = q.get('games').split(',').map((x) => x.trim()).filter(Boolean);
    if (q.get('rounds')) o.rounds = Number(q.get('rounds'));
    if (q.has('bots')) o.bots = parseBots(q.get('bots'));
    if (q.get('difficulty')) o.difficulty = q.get('difficulty');
    return o;
  }
  const api = {
    domain, ui, curtain, labels, optsFromParams,
    get active() { return state().active; },
    get pageMode() { return partyMode; },
    get place() { return place; },
    contains: (p) => partyMode && inPocket(p),
    allowsTarget: (it) => (it.type === 'partyboard' || it.type === 'partydress' ? partyMode && state().phase === 'lobby' && !curtain.running : !partyMode),
    preInput, update, drive, updateCamera, light, afterItems,
    open: (opts) => domain.open(opts),
    close,
    toggle: (id, on) => domain.toggle(id, on),
    enabled: () => domain.enabled(),
    games: () => domain.games(),
    bots: (n = 'fill', difficulty) => domain.setMode({ bots: parseBots(n), ...(difficulty ? { difficulty } : {}) }),
    play: (id) => { const open = state().active ? true : domain.open({}); return Promise.resolve(open).then(() => domain.debug.play(id)); },
    skip: () => domain.skip(),
    next: () => { let r = null; for (let i = 0; i < 6 && state().phase !== 'pick'; i++) r = domain.skip(); return r; },
    get state() { return state(); },
    debug: {
      win: (slot = 0) => domain.debug.win(slot), end: () => domain.debug.end(), seed: (n) => domain.debug.seed(n),
      glade: () => getGlade(), stage: (id) => getStage(id), timers, memory, tucked, botMind, camera: camCfg,
    },
    summary() {
      return { ...domain.summary(), partyMode, place, curtain: curtain.summary(), ui: ui.summary(), bots: players.bots.map((p) => ({ slot: p.index, name: p.colors.name, x: +p.position.x.toFixed(1), z: +p.position.z.toFixed(1) })), glade: glade ? glade.summary() : null, stages: Object.fromEntries(Object.entries(stages).map(([k, v]) => [k, v.summary()])), tucked: tucked.size, music: music.partyTrack ?? null };
    },
  };
  function close() { return domain.close(); }
  return api;
}
