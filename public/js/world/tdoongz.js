// The Tdoongz at the home camp (PLAN Step 64): nine plush animal friends, recurring NPCs of the world's story. Step 64a lands the shared runtime and the first friend, Im Nabong the bunny
// (model npc/tdoongz.js, pure rules game/tdoongzLogic.js, data `TDOONGZ` in config.js); Steps 64b-e add Yu Bbui Bbui (puppy), Mokuring (bear), Shyam Shyam (hamster) and Park Zyoni (unicorn, a quadruped), which have NO dialog yet
// (`talk: false`). 64f-64i each add a model builder, a `TDOONGZ` entry and (when they talk) a `SCRIPT[id]` here, plus their `IDLES[id]` list and flourish poses.
//
//   const tdoongz = createTdoongz({ scene, players, avatars, world, dialog, particles, sfx, floatLabel })     once at load on every screen, AFTER the campfires / props / hat rack / Rootgate exist
//                                                                                                            (their colliders shape the wander plan)
//   tdoongz.update(dt, nightness)      once per tick: walking, pausing, idle flourishes, facing, blinking, night sleepiness (animation is skipped while home is not drawn in full detail)
//   tdoongz.list / tdoongz.get(id)     the friends: { id, cfg, name, position (Vector3: its feet, the SAME object as the interactable's position), state, node, graph, group, model, collider, interactable (null when talk: false), hold }
//   tdoongz.talk(id, player)           open the talk menu (what the interactable does; false for a friend without dialog)
//   tdoongz.play(id, kind)             debug: run an idle flourish now (any key of FLOURISH: 'pat' | 'peek' | 'earflop' | 'twirl' | 'show' | 'wave' | 'wag' | 'sniff' | 'shake' | 'scratch' | 'sit' | 'surprise' | 'look'
//                                      | 'flutter' | 'wiggle' | 'nibble' | 'swish' | 'toss' | 'stomp' | 'pirouette' | 'plie' | 'bow' | 'fluff' | 'rest')
//   tdoongz.lineup(anchor, {spacing, behind})   debug: stand every friend in a row `behind` u (default 2.4) behind `anchor` ({x, z}, e.g. P1; a wide friend such as Park Zyoni gets more room), facing the camera (yaw 0 = +Z = toward the follow camera), and HOLD them
//                                      still (no wandering, greeting or flourishes; blinking / breathing continue; `play` still works) for visual inspection
//   tdoongz.release()                  resume wandering (each friend snaps back to its nearest graph node)
//   tdoongz.summary()                  debug snapshot (per friend: gait, state, x / z, node, visible, drawCalls, collider, interactable, talk, hold, graph size)
//
// Each friend: a collider that moves with it (colliders.js moveCollider, re-filed once it has moved 0.04 u) and, when it talks, an always-scanned interactable (type 'tdoong', in interactables.js
// DYNAMIC_TYPES, prompt "Talk", a plain interact even with a tool in hand: items/tools.js has no verb for it) whose `position` IS the live Vector3. A friend with `talk: false` has the collider only (players
// bump into it) and never shows a prompt; it still stops and turns to face a nearby player and sometimes waves. The wander graph (planWander) is a seeded ring of clear spots round the HOME fire (config FIRES
// 'home': outside its bench ring, clear of every collider and of non-walkable ground, links = clear straight segments). All graphs are planned before any friend's collider exists, and a later friend keeps its
// nodes `NODE_APART` u from the nodes of the friends planned before it.
//
// Gaits (config `gait`, the GAITS table): 'hop' (Im Nabong: a bouncy hop arc + squash + leg / arm swing, ears lag and bounce on damped springs, the pouch jiggles), 'trot' (Yu Bbui Bbui: light quick bouncy steps
// with alternating legs and flapping ears, the tail wags), 'walk' (Mokuring: a slow plush waddle, the body sways side to side), 'scurry' (Shyam Shyam: tiny very quick steps, the wings flutter), 'quad' (Park Zyoni: a trot with diagonal pairs, armL + legR / armR + legL, the front legs being the model's arms; a little body bob, head nod, tail sway), 'glide' (Myodette, Step 64f: small graceful steps at ~0.85 u/s, a smooth sway + twist of the body, flippers held out; her 'wave' is a bow; idles pirouette / plie / bow / fluff / rest).
// Park Zyoni's SIT pose (model `m.sit`, blended by `f.sit` over ~0.5 s): the torso pitches up about the rump (position = pivot - R * pivot), the rig sinks by `sit.drop`, the hind legs fold forward on the ground
// (soles facing front, splayed), the front legs stay vertical and stretch, the head counter-rotates upright and the tail counter-rotates too. Her idles: sit (~60 %), swish, toss, stomp (dust puffs). A phase `f.hop`
// counts the gait's cycles; the legs / arms / bob / roll are functions of it scaled by `f.moving` (0..1), so a stop fades out instead of freezing.
//
// State machine: `walk` (towards the next node of the graph) -> `pause` on arrival (2-6 s, a random idle flourish from IDLES[id]) -> `walk`. A local player or remote avatar within `nearR` makes the friend stop
// for a moment (`greet`, turns to face them, sometimes waves; then a cool-down); somebody standing on the way ahead makes it `wait` (and after a while turn back). OTHER FRIENDS count as blockers too (FRIEND_R,
// a bigger radius than a player's), and when a friend picks its next node it avoids neighbours that another friend stands near or is walking to (TARGET_APART); the two give up after different random times, so a
// head-on pair never deadlocks. While Im Nabong's dialog is open she stops and faces the speaker. At night (clock nightness > 0.55) friends are sleepy: slower, longer pauses, heavy lids, now and then a yawn.
// The model group is a scene-level group shown only while `world.regions.isFull('home')`.
//
// Talk menu (Im Nabong; a dialog choice menu owned by the interacting player, `menuId` 'npc-tdoong-<id>'): the first time on a screen the intro pages play (per-screen memory in localStorage
// `infiniteIsland.tdoongIntro.<id>`, cleared by ?newgame, like Mossback), then the rows "What's in your pouch?" (she shows it: a little hop, the item pops up), "Who are you?", "The campfire" and "Bye".
//
// Nothing here is synced, saved or hashed: wandering is a per-screen cosmetic like the critters' roaming, so every hash stays equal. Step 65 moves positions to the host before any story beat depends on
// where a friend stands.
import * as THREE from 'three';
import { FIRES, TDOONGZ, HAT_RACK } from '../config.js';
import { getHeight, isWalkable } from './terrain.js';
import { addCollider, moveCollider, overlapsAny } from './colliders.js';
import { addInteractable } from './interactables.js';
import { createTdoongModel, TDOONG_BUILDERS } from '../npc/tdoongz.js';
import { pickFaceTarget, turnToward } from '../game/npcLogic.js';
import { planWander, pickNext, pathBlocked, segmentClear } from '../game/tdoongzLogic.js';
import { NEW_GAME } from '../game/save.js';
import { mulberry32 } from '../utils/rng.js';
import { SPARKLE_SVG, HEART_SVG, FLAME_SVG, LEAVE_SVG } from '../ui/icons.js';
import { SCRIPT } from '../game/tdoongzScript.js';

const introKey = (id) => `infiniteIsland.tdoongIntro.${id}`;
const readIntro = (id) => { try { return localStorage.getItem(introKey(id)) === '1'; } catch { return false; } };
const writeIntro = (id) => { try { localStorage.setItem(introKey(id), '1'); } catch { /* private window: the intro just plays again next load */ } };

const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const NIGHT_SLEEPY = 0.55;
const HOP_TIME = 0.42;                 // seconds per hop of the 'hop' gait
const BLOCK_R = 0.95;                  // a player this close to the way ahead blocks it
const FRIEND_R = 1.3;                  // another friend this close to the way ahead blocks it (two colliders are 1.12 u apart when they touch)
const LOOK_AHEAD = 1.6;                // u of the path judged for a blocker
const NODE_APART = 1.8;                // a friend's planned nodes stay this far from the nodes of the friends planned before it
const WANDER_NODES = 14, WANDER_LINK = 8;   // nodes tried per friend / longest link (10 / 7 left only 3-5 connected nodes round the cramped fire once friends keep apart)
const TARGET_APART = 2.0;              // a friend does not pick a next node this close to another friend (or to where another friend is heading)
// Flourish durations (s). The poses are in updateFriend (search for `kind ===`).
const FLOURISH = {
  pat: 2.4, peek: 2.6, earflop: 1.3, twirl: 1.6, show: 2.2, wave: 1.8,                // Im Nabong (wave: everybody, it is the greeting)
  wag: 2.2, sniff: 2.6, shake: 1.1, scratch: 2.0,                                   // Yu Bbui Bbui
  sit: 5.0, surprise: 1.6, look: 2.6,                                                // Mokuring
  flutter: 2.4, wiggle: 1.8, nibble: 2.4,                                           // Shyam Shyam
  swish: 2.0, toss: 1.6, stomp: 1.5,                                                // Park Zyoni (and 'sit', above: she sits most of the time)
  pirouette: 2.8, plie: 3.2, bow: 2.2, fluff: 1.4, rest: 4.0,                       // Myodette (her 'wave' is a bow)
};
const IDLE_PICKS = ['pat', 'pat', 'peek', 'peek', 'earflop', 'twirl', null];     // weights of the random idle flourish (null = just stand and look about)
const IDLES = {
  imnabong: IDLE_PICKS,
  yubbuibbui: ['wag', 'wag', 'sniff', 'sniff', 'shake', 'scratch', null],
  mokuring: ['look', 'look', 'surprise', 'sit', 'sit', null],
  shyamshyam: ['flutter', 'flutter', 'wiggle', 'nibble', 'nibble', null],
  parkzyoni: ['sit', 'sit', 'sit', 'sit', 'sit', 'sit', 'swish', 'toss', 'stomp', null],      // ~60 % sit
  myodette: ['pirouette', 'plie', 'bow', 'fluff', 'rest', 'rest', null],
};
// Walk cycles: `period` = s per cycle (a cycle = two steps; for 'hop' one hop), `bob` = body rise per step (u), `swing` = leg swing (rad), `arm` = arm swing (rad), `lean` = forward lean (rad), `roll` = side sway of the
// body (rad), `flare` = ear flap while walking. 'hop' has its own code path (arc + squash).
const GAITS = {
  hop: { period: HOP_TIME },
  trot: { period: 0.34, bob: 0.055, swing: 0.75, arm: 0.5, lean: 0.07, roll: 0, flare: 0.35 },
  walk: { period: 1.0, bob: 0.02, swing: 0.45, arm: 0.3, lean: 0.03, roll: 0.1, flare: 0.1 },
  scurry: { period: 0.26, bob: 0.03, swing: 0.8, arm: 0.04, lean: 0.05, roll: 0.03, flare: 0.1 },
  glide: { period: 0.85, bob: 0.012, swing: 0.28, arm: 0.04, lean: 0, roll: 0.07, flare: 0 },    // Myodette: small graceful steps, a smooth side-to-side sway (the puff swishes behind it), flippers held out
  quad: { period: 0.5, bob: 0.025, swing: 0.55, arm: 0.55, lean: 0, roll: 0.03, flare: 0 },       // Park Zyoni: a trot, diagonal pairs (armL + legR, armR + legL), the head nods, the tail sways
};

const smooth = (u) => u * u * (3 - 2 * u);
const env = (u, edge = 0.2) => smooth(Math.max(0, Math.min(1, Math.min(u / edge, (1 - u) / edge))));    // 0 -> 1 -> 0 over u in 0..1

export { SCRIPT };                                  // (the lines live in game/tdoongzScript.js: pure data, Node-checked)
const ROW_ICONS = { sparkle: SPARKLE_SVG, heart: HEART_SVG, flame: FLAME_SVG };

export function createTdoongz({ scene, players, avatars = null, world, dialog, particles = null, sfx = null, floatLabel = null }) {
  const snd = (name, opts) => { if (sfx) sfx.play(name, opts); };
  let time = 0;
  const candidates = [];
  const byId = new Map();
  const list = [];
  const taken = [];                    // the planned nodes of the friends made so far (a later friend keeps its own nodes NODE_APART u away from them)

  // Plans the friend's graph and its state; the collider / interactable come later (attach), so no friend's collider can shape another's plan.
  function makeFriend(id, cfg, index) {
    const fire = FIRES.find((f) => f.id === cfg.home.fire) || FIRES[0];
    const baseClear = (x, z) => isWalkable(x, z) && Math.hypot(x - fire.x, z - fire.z) >= fire.clear && !overlapsAny(x, z, cfg.radius + 0.4)
      && Math.hypot(x - HAT_RACK.x, z - HAT_RACK.z) >= HAT_RACK.radius + cfg.radius + 0.6;   // the hat rack's collider only appears after the first feast: keep its spot clear from the start
    const nodeClear = (x, z) => baseClear(x, z) && taken.every((q) => Math.hypot(q.x - x, q.z - z) >= NODE_APART);
    const graph = planWander(fire, { rMin: cfg.home.rMin, rMax: cfg.home.rMax, count: WANDER_NODES, linkMax: WANDER_LINK, minGap: 2.4, seed: cfg.seed }, nodeClear, (a, b) => segmentClear(a, b, baseClear));
    for (const n of graph.nodes) taken.push(n);
    const rng = mulberry32(cfg.seed + 17);
    const start = graph.nodes.length ? Math.floor(rng() * graph.nodes.length) : -1;
    const sp = start >= 0 ? graph.nodes[start] : { x: fire.x + cfg.home.rMin + 1, z: fire.z };
    const f = {
      id, cfg, name: cfg.name, index, graph, rng, menuId: `npc-tdoong-${id}`,
      position: new THREE.Vector3(sp.x, getHeight(sp.x, sp.z), sp.z),
      node: start, from: start, target: -1, recent: start >= 0 ? [start] : [],
      state: 'pause', t: 1 + rng() * 2, fl: null, flKind: null, hold: false, giveUp: 2.6,
      group: null, model: null, collider: null, interactable: null,
      heard: !NEW_GAME && readIntro(id),
    };
    if (NEW_GAME) { try { localStorage.removeItem(introKey(id)); } catch { /* ignore */ } }
    // animation state
    Object.assign(f, {
      primed: false, lean: 0, stretch: 0, yaw: rng() * Math.PI * 2, hop: 0, hopV: 0, lastY: 0, vy: 0, moving: 0, twirlYaw: 0, rise: 0, blockT: 0, greetCool: 4, wave: 0,
      blinkT: 2 + rng() * 2, blinkPhase: -1, sleepy: 0, yawnT: 8 + rng() * 6, yawn: -1, exprNow: 'normal',
      ears: [{ x: 0, vx: 0, z: 0, vz: 0 }, { x: 0, vx: 0, z: 0, vz: 0 }], pj: 0, pjv: 0, pouchUp: 0,
      head: { x: 0, y: 0, z: 0 }, armR: { x: 0, z: 0 }, armL: { x: 0, z: 0 }, clock: rng() * 6, regT: 0,
      sit: 0, wagA: 0.25, tailT: rng() * 6, flapA: 0.12, wingT: rng() * 6, legs: { l: 0, r: 0 },
    });
    return f;
  }
  function attach(f) {
    const cfg = f.cfg;
    f.collider = addCollider({ x: f.position.x, z: f.position.z, r: cfg.radius, owner: f });
    if (cfg.talk === false) return;                // no dialog / interactions yet: a collider only (players bump into the friend), no prompt
    f.interactable = addInteractable({
      type: 'tdoong', object: null, position: f.position, radius: cfg.talkRadius, prompt: 'Talk', onInteract: (item, by) => talk(f, by || players.p1),
    });
    f.interactable.promptY = 1.75 * cfg.scale;
  }

  function ensureModel(f) {
    if (f.model) return;
    f.model = createTdoongModel(f.id);
    f.model.setPouch(f.cfg.pouch || null);
    f.group = new THREE.Group();
    f.group.name = `tdoong-${f.id}`;
    f.group.position.copy(f.position);
    f.group.rotation.y = f.yaw;
    f.model.root.scale.setScalar(f.cfg.scale);
    f.group.add(f.model.root);
    scene.add(f.group);
  }
  const say = (f, text, up = 1.9) => { if (floatLabel) floatLabel(text, { x: f.position.x, y: f.position.y + up * f.cfg.scale, z: f.position.z }, null, null); };

  // ------------------------------------------------------------------ talking
  const back = (f, p, index) => () => menu(f, p, index);
  function mainChoices(f, p) {
    const S = SCRIPT[f.id];
    const pages = (lines, index, extra) => (c, d) => { if (extra) extra(); dialog.showPages(lines, { name: f.name, onFinish: back(f, p, index) }); };
    return [
      ...S.rows.map((r, i) => ({ label: r.label, icon: ROW_ICONS[r.icon] || SPARKLE_SVG, onSelect: pages(r.pages, i, r.play ? () => play(f, r.play) : null) })),
      { label: 'Bye', icon: LEAVE_SVG, onSelect: () => { dialog.close(); say(f, S.bye); play(f, 'wave'); } },
    ];
  }
  function menu(f, p, index = 0) {
    dialog.showChoices(() => mainChoices(f, p), { text: SCRIPT[f.id].greet, index, onCancel: null, name: f.name });
  }
  function talk(f, p) {
    if (typeof f === 'string') f = byId.get(f);
    if (!f || !p || dialog.isOpen || f.cfg.talk === false || !SCRIPT[f.id]) return false;
    snd('pop', { pitch: 1.35, vol: 0.6 });
    dialog.open({
      name: f.name, owner: p, tag: players.multi ? p.colors.name : '', color: p.colors.ui, menuId: f.menuId,
      choices: () => mainChoices(f, p), text: SCRIPT[f.id].greet,
    });
    if (!f.heard) {
      f.heard = true; writeIntro(f.id);
      dialog.showPages(SCRIPT[f.id].intro, { name: f.name, onFinish: () => menu(f, p, 0) });
    }
    return true;
  }

  // ------------------------------------------------------------------ flourishes
  function play(f, kind) {
    if (typeof f === 'string') f = byId.get(f);
    if (!f || !FLOURISH[kind]) return false;
    if (kind === 'wave' && f.cfg.gait === 'glide') kind = 'bow';              // Myodette never waves: she turns calmly and curtsies
    if (kind === 'wave' && f.cfg.gait === 'quad') kind = 'toss';              // a quadruped has no arm to wave: she tosses her head instead
    f.fl = { kind, t: 0, dur: FLOURISH[kind], fx: false };
    f.flKind = kind;
    if (kind === 'earflop') { f.ears[0].vz += 7; f.ears[1].vz -= 7; f.ears[0].vx += 4; f.ears[1].vx += 3; }
    if (kind === 'pirouette') snd('pop', { pitch: 1.5, vol: 0.25 });
    if (kind === 'twirl') { sparkle(f, 0.15, 5); snd('pop', { pitch: 1.6, vol: 0.4 }); }
    if (kind === 'flutter') { sparkle(f, 0.5, 4); snd('pop', { pitch: 1.8, vol: 0.3 }); }
    if (kind === 'surprise') snd('pop', { pitch: 1.2, vol: 0.4 });
    return true;
  }
  function sparkle(f, up, count) {
    if (particles) particles.burst('sparkle', { x: f.position.x, y: f.position.y + up, z: f.position.z }, { count, radius: 0.45, height: 0.35 });
  }

  // ------------------------------------------------------------------ movement
  function nearest(f) {
    candidates.length = 0;
    for (const p of players.list) if (!p.away) candidates.push(p.position);
    if (avatars) for (const a of avatars.list) if (a.root.visible) candidates.push(a.position);
    return pickFaceTarget(f.position, candidates, f.cfg.nearR);
  }
  const nightMul = (f, a, b) => a + (b - a) * f.sleepy;     // a awake .. b fully sleepy

  function startWalk(f) {
    if (f.node < 0) { f.t = 3; return; }
    // neighbours that another friend stands near, or is walking to, are avoided when there is any other choice (pickNext falls back to them otherwise)
    const avoid = f.recent.slice();
    for (const o of list) {
      if (o === f) continue;
      const near = [o.position];
      if (o.state === 'walk' && o.target >= 0 && o.graph.nodes[o.target]) near.push(o.graph.nodes[o.target]);
      for (const j of f.graph.adj[f.node] || []) {
        const n = f.graph.nodes[j];
        if (near.some((q) => Math.hypot(q.x - n.x, q.z - n.z) < TARGET_APART)) avoid.push(j);
      }
    }
    const next = pickNext(f.graph, f.node, f.rng, avoid);
    if (next < 0) { f.t = 3; return; }
    f.from = f.node; f.target = next;
    f.recent.push(next);
    if (f.recent.length > 3) f.recent.shift();
    f.state = 'walk';
  }
  function startPause(f) {
    f.state = 'pause';
    f.t = (2 + f.rng() * 4) * nightMul(f, 1, 1.7);
    f.moving = 0;
    const picks = IDLES[f.id] || [null];
    const pick = picks[Math.floor(f.rng() * picks.length)];
    if (pick) play(f, pick);
  }

  const _holdGoal = { x: 0, z: 0 };
  function updateFriend(f, dt, nightness) {
    const full = !world || !world.regions || world.regions.isFull('home');
    if (!full) { if (f.group) f.group.visible = false; return; }
    ensureModel(f);
    f.group.visible = true;
    const mod = f.model, cfg = f.cfg, gait = GAITS[cfg.gait] ? cfg.gait : 'hop';
    const G = GAITS[gait] || GAITS.hop;
    f.clock += dt;
    const s = f.clock;
    const near = f.hold ? null : nearest(f);
    const talking = cfg.talk !== false && dialog.isOpen && dialog.menuId === f.menuId && dialog.owner;
    const speaker = talking ? dialog.owner.position : null;
    f.sleepy = damp(f.sleepy, nightness > NIGHT_SLEEPY && !talking ? 1 : 0, 1.4, dt);
    f.greetCool = Math.max(0, f.greetCool - dt);

    // ---- state machine
    let faceGoal = null, faceRate = 3.5;
    let walking = false;
    if (talking && f.state !== 'pause') { f.state = 'pause'; f.t = 0.5; f.moving = 0; }
    if (f.hold) {                                       // lineup: stand still and face the camera (+Z)
      f.state = 'pause'; f.t = 3;
      _holdGoal.x = f.position.x; _holdGoal.z = f.position.z + 10;
      faceGoal = _holdGoal; faceRate = 6;
    } else switch (f.state) {
      case 'pause':
        if (talking) { f.t = Math.max(f.t, 0.5); faceGoal = speaker; faceRate = 4; }
        else if (near) faceGoal = near;
        if (!f.fl) f.t -= dt;
        if (f.t <= 0 && !f.fl && !talking) startWalk(f);
        break;
      case 'greet':
        faceGoal = near || null; faceRate = 5;
        f.t -= dt;
        if (f.t <= 0) startWalk(f);
        break;
      case 'wait': {
        const tp = f.graph.nodes[f.target];
        if (blockedAhead(f, tp)) {
          f.blockT += dt;
          faceGoal = pickFaceTarget(f.position, candidatesList(), 3);
          if (f.blockT > f.giveUp) { [f.from, f.target] = [f.target, f.from]; f.blockT = 0; f.state = 'walk'; }   // give up and go back the way it came
        } else { f.blockT = 0; f.state = 'walk'; }
        break;
      }
      case 'walk': {
        const tp = f.graph.nodes[f.target];
        const dx = tp.x - f.position.x, dz = tp.z - f.position.z, d = Math.hypot(dx, dz);
        if (f.fl) { f.fl = null; f.flKind = null; }                               // a flourish never runs while walking
        if (d < 0.12) { f.node = f.target; f.position.x = tp.x; f.position.z = tp.z; startPause(f); break; }
        if (near && f.greetCool <= 0) {                                           // somebody close: stop, turn, maybe wave
          f.state = 'greet'; f.t = 1.4 + f.rng() * 1.6; f.greetCool = 12; f.moving = 0;
          if (f.rng() < 0.6) play(f, 'wave');
          break;
        }
        if (blockedAhead(f, tp)) { f.state = 'wait'; f.blockT = 0; f.giveUp = 2 + f.rng() * 1.8; f.moving = 0; break; }
        walking = true;
        faceGoal = tp; faceRate = 6;
        const sp = cfg.speed * nightMul(f, 1, 0.6);
        f.hopV = 1 / (G.period * nightMul(f, 1, 1.25));
        f.hop += dt * f.hopV;
        let step;
        if (gait === 'hop') step = Math.min(d, sp * (0.25 + 1.1 * Math.max(0, Math.sin(Math.PI * (f.hop % 1)))) * dt);
        else step = Math.min(d, sp * dt);
        f.position.x += dx / d * step; f.position.z += dz / d * step;
        f.moving = damp(f.moving, 1, 10, dt);
        break;
      }
    }
    if (!walking) f.moving = damp(f.moving, 0, 8, dt);
    f.position.y = getHeight(f.position.x, f.position.z);
    f.regT += dt;
    if (f.collider && Math.hypot(f.collider.x - f.position.x, f.collider.z - f.position.z) > 0.04) moveCollider(f.collider, f.position.x, f.position.z);

    // facing
    if (faceGoal) f.yaw = turnToward(f.yaw, Math.atan2(faceGoal.x - f.position.x, faceGoal.z - f.position.z), dt, faceRate);

    // ---- flourish clock
    const fl = f.fl;
    let u = 0;
    if (fl) { fl.t += dt; u = Math.min(1, fl.t / fl.dur); if (fl.t >= fl.dur) { if (fl.kind === 'twirl') sparkle(f, 0.1, 6); else if (fl.kind === 'pirouette') sparkle(f, 0.1, 3); f.fl = null; f.flKind = null; } }
    const kind = f.fl ? f.fl.kind : null;

    // ---- pose targets
    const restZ = 0.22;                                                        // Im Nabong's arm rest (her flourishes are written against it)
    const rx0 = mod.armL.userData.restX, rzL = mod.armL.userData.restZ, rzR = mod.armR.userData.restZ;
    // the hop always finishes its arc: stopping mid-air would pop her to the ground
    let h = 0, sw = 0;
    if (gait === 'hop') {
      const frac = f.hop % 1;
      if (!walking && frac > 0.001) { const old = Math.floor(f.hop); f.hop += dt * (f.hopV || 2.4); if (Math.floor(f.hop) > old) f.hop = old + 1; }
      h = walking || f.hop % 1 > 0.001 ? Math.sin(Math.PI * (f.hop % 1)) : 0;
    } else {
      const ph = f.hop * Math.PI * 2;
      sw = Math.sin(ph) * f.moving;                                            // the signed step phase, faded by how much it is moving
      h = Math.abs(Math.sin(ph)) * f.moving;                                   // one bounce per step
    }
    let headX = 0.02 * Math.sin(s * 1.3), headY = 0, headZ = 0.03 * Math.sin(s * 0.9);
    let armRx = rx0, armLx = rx0, armRz = rzR, armLz = rzL;                    // armR is on -X: Im Nabong's outward swing is a NEGATIVE rotation.z
    let rise = 0, twirl = 0, pouchUp = 0, hopBounce = 0, earFlare = 0, earSwing = 0, rollZ = 0, swayY = 0, sitK = 0, kickR = null, lean = 0;
    let wagT = 0.25, flapT = 0.12, squat = 0;
    let legLx = 0, legRx = 0;
    if (gait === 'hop') {
      if (walking) {
        armLx = armRx = 0.32 * h - 0.05;
        headX += 0.05 * h;
        lean = 0.08 * h;
      }
      legLx = legRx = walking ? 0.5 * h - 0.15 : 0;                            // legs: tucked back through the hop, together
    } else {
      armLx = rx0 - G.arm * sw; armRx = rx0 + G.arm * sw;
      legLx = G.swing * sw; legRx = -G.swing * sw;
      lean = G.lean * f.moving;
      rollZ = G.roll * sw;
      headZ -= 0.5 * rollZ;
      headX += 0.04 * h;
      earFlare = G.flare * f.moving * h;
      if (walking) { wagT = 0.6; flapT = gait === 'scurry' ? 0.8 : 0.15; }
      if (gait === 'glide') {                                                  // a dancer's walk: flippers held out and rocking gently, the body swaying and twisting a beat behind the step
        const ph2 = f.hop * Math.PI * 2;
        armLz = rzL + 0.1 * Math.sin(ph2 + 1.2) * f.moving; armRz = rzR - 0.1 * Math.sin(ph2 + 1.2) * f.moving;
        armLx = armRx = rx0;
        swayY = 0.1 * Math.cos(ph2 - 0.6) * f.moving;
      }
    }
    if (!walking && f.sleepy > 0.2) headX += f.sleepy * (0.08 + 0.12 * Math.max(0, Math.sin(s * 0.7)) ** 3);   // a drowsy nod
    if (f.state === 'greet' || f.state === 'wait') headZ += 0.1 * Math.sin(s * 3);
    if (f.sleepy > 0.5) { wagT = 0.08; flapT = 0.05; }
    let want = 'normal';
    if (kind === 'pat') {
      armRx = -0.85 - 0.12 * Math.sin(f.fl.t * 16) * env(u, 0.25);
      armRz = -restZ + (0.55 + restZ) * env(u, 0.2);                          // the paw comes across to the pouch
      headX += 0.1 * env(u); headZ += 0.07 * Math.sin(f.fl.t * 3) * env(u);
      want = 'happy';
    } else if (kind === 'peek') {
      headX += 0.5 * env(u, 0.22);
      pouchUp = 0.075 * env((u - 0.15) / 0.7, 0.3);
    } else if (kind === 'earflop') {
      headY += 0.22 * Math.sin(f.fl.t * 18) * (1 - u);
      want = 'happy';
    } else if (kind === 'twirl') {
      const k = smooth(u);
      rise = 0.28 * Math.sin(Math.PI * u);
      twirl = Math.PI * 2 * k;
      armLz = restZ + 0.9 * Math.sin(Math.PI * u); armRz = -restZ - 0.9 * Math.sin(Math.PI * u);
      earFlare = 0.5 * Math.sin(Math.PI * u);
      want = 'happy';
    } else if (kind === 'show') {
      hopBounce = 0.1 * Math.abs(Math.sin(Math.PI * Math.min(1, u * 2.2)));
      pouchUp = 0.09 * env((u - 0.1) / 0.8, 0.25);
      headX += 0.35 * env(u, 0.2);
      armRx = -0.85; armRz = -restZ + (0.5 + restZ) * env(u, 0.2);
      want = 'happy';
    } else if (kind === 'wave') {
      armRx = -0.15; armRz = -2.0 + 0.3 * Math.sin(f.fl.t * 12);               // the right arm up and waving
      headZ += 0.12 * Math.sin(f.fl.t * 5);
      want = 'happy';
    } else if (kind === 'wag') {                                                // Yu Bbui Bbui: a happy tail wag, head cocked
      wagT = 1.6 * env(u, 0.12);
      headZ += 0.14 * Math.sin(f.fl.t * 2.2) * env(u);
      earFlare = 0.15 * env(u);
      want = 'happy';
    } else if (kind === 'sniff') {                                              // nose to the ground, a little twitch
      headX += 0.6 * env(u, 0.2);
      headY += 0.05 * Math.sin(f.fl.t * 22) * env(u, 0.2);
      lean = 0.1 * env(u, 0.2);
      armLx = armRx = rx0 - 0.2 * env(u, 0.2);
      wagT = 0.5;
    } else if (kind === 'shake') {                                              // a quick head shake, ears flapping
      headY += 0.6 * Math.sin(f.fl.t * 30) * (1 - u);
      earSwing = 0.9 * Math.sin(f.fl.t * 30 + 0.8) * (1 - u);
      rollZ = 0.03 * Math.sin(f.fl.t * 30) * (1 - u);
    } else if (kind === 'scratch') {                                            // a hind leg scratches behind the ear
      const e = env(u, 0.15);
      kickR = -0.85 + 0.3 * Math.sin(f.fl.t * 24);
      lean = -0.08 * e;
      headZ += 0.22 * e; headY -= 0.1 * e;
      rollZ = 0.05 * e;
      earSwing = 0.25 * Math.sin(f.fl.t * 24) * e;
      want = 'happy';
    } else if (kind === 'sit') {                                                // Mokuring / Park Zyoni sit down, look about, stand up
      sitK = env(u, 0.14);
      if (mod.sit) headZ += 0.1 * Math.sin(f.fl.t * 1.4) * sitK;
      headY += 0.3 * Math.sin(f.fl.t * 0.9) * sitK;
      headX -= 0.06 * sitK;
    } else if (kind === 'surprise') {                                           // head tilted back, arms out, a little start
      const e = env(u, 0.15);
      headX -= 0.4 * e;
      armLx = armRx = rx0 - 0.25 * e; armLz = rzL + 0.75 * e; armRz = rzR - 0.75 * e;
      rise = 0.07 * Math.sin(Math.PI * Math.min(1, u * 3));
      earFlare = 0.3 * e;
    } else if (kind === 'look') {                                               // a slow look left and right
      headY += 0.8 * Math.sin(u * Math.PI * 2) * env(u, 0.1);
      headZ += 0.08 * Math.sin(u * Math.PI * 2) * env(u, 0.1);
    } else if (kind === 'flutter') {                                            // Shyam Shyam: the wings whirr and she rises a little
      flapT = 1.0;
      rise = 0.2 * Math.sin(Math.PI * u);
      headZ += 0.08 * Math.sin(f.fl.t * 3);
      want = 'happy';
    } else if (kind === 'wiggle') {                                             // a happy wiggle
      const e = env(u, 0.15);
      rollZ = 0.14 * Math.sin(f.fl.t * 13) * e;
      swayY = 0.1 * Math.sin(f.fl.t * 13 + 1) * e;
      headZ -= 0.5 * rollZ;
      earSwing = 0.5 * Math.sin(f.fl.t * 13 + 2) * e;
      flapT = 0.6;
      want = 'happy';
    } else if (kind === 'swish') {                                              // Park Zyoni: the tail swishes
      wagT = 1.5 * env(u, 0.12);
      headZ += 0.08 * Math.sin(f.fl.t * 2.5) * env(u);
    } else if (kind === 'toss') {                                               // a head toss: the mane shakes
      headX += 0.3 * Math.sin(f.fl.t * 9) * (1 - u);
      headZ += 0.2 * Math.sin(f.fl.t * 9 + 1) * (1 - u);
      wagT = 0.6;
    } else if (kind === 'stomp') {                                              // one front hoof paws the ground twice, with a little dust
      const lift = Math.sin(Math.PI * Math.min(1, ((f.fl.t / 0.62) % 1) / 0.8)) * env(u, 0.1);
      armRx = rx0 - 0.9 * lift;
      headX += 0.1 * lift;
      const hits = Math.floor(f.fl.t / 0.62 + 0.2);
      if (hits > (f.fl.fx || 0)) {
        f.fl.fx = hits;
        if (particles) particles.burst('puff', { x: f.position.x + Math.sin(f.yaw) * 0.6 * cfg.scale - Math.cos(f.yaw) * 0.18 * cfg.scale, y: f.position.y + 0.08, z: f.position.z + Math.cos(f.yaw) * 0.6 * cfg.scale + Math.sin(f.yaw) * 0.18 * cfg.scale }, { count: 3, radius: 0.1, height: 0.04, color: '#d8c9a4', size: 0.7 });
      }
    } else if (kind === 'pirouette') {                                          // Myodette: up on her toes, one slow spin with the flippers out, then settle with a few sparkles
      const e = env(u, 0.14);
      rise = 0.055 * e;
      twirl = Math.PI * 2 * smooth(Math.max(0, Math.min(1, (u - 0.1) / 0.8)));
      armLz = rzL + 0.55 * e; armRz = rzR - 0.55 * e;
      headX -= 0.05 * e;
    } else if (kind === 'plie') {                                               // a slow ballet bend, twice: sinks down and rises with the flippers raised in an arc
      const e = env(u, 0.18);
      squat = 0.1 * Math.sin(u * Math.PI * 2) ** 2 * e;
      const arc = 0.5 - 0.5 * Math.cos(u * Math.PI * 4);
      armLz = rzL + 1.4 * e * (0.35 + 0.65 * arc); armRz = rzR - 1.4 * e * (0.35 + 0.65 * arc);
      headZ += 0.07 * Math.sin(u * Math.PI * 2) * e;
    } else if (kind === 'bow') {                                                // a small graceful curtsy
      const e = env(u, 0.3);
      lean = 0.2 * e; headX += 0.4 * e; squat = 0.04 * e;
      armLz = rzL + 0.4 * e; armRz = rzR - 0.4 * e;
    } else if (kind === 'fluff') {                                              // a soft shake of the fur puff
      const e = 1 - u;
      rollZ = 0.06 * Math.sin(f.fl.t * 26) * e; swayY = 0.09 * Math.sin(f.fl.t * 26 + 1) * e;
      squat = 0.02 * Math.sin(f.fl.t * 26) ** 2 * e;
      headZ -= 0.4 * rollZ;
    } else if (kind === 'rest') {                                               // stands quietly, eyes half-closed, content
      const e = env(u, 0.2);
      headX += 0.05 * e; squat = 0.012 * e;
      armLz = rzL - 0.15 * e; armRz = rzR + 0.15 * e;
      want = 'sleepy';
    } else if (kind === 'nibble') {                                             // the paws come up to her mouth, nibble nibble
      const e = env(u, 0.2);
      const wob = 0.12 * Math.sin(f.fl.t * 20) * e;
      armLx = rx0 + (-2.3 - rx0) * e + wob; armRx = rx0 + (-2.3 - rx0) * e - wob;
      headX += 0.2 * e + 0.03 * Math.sin(f.fl.t * 20) * e;
    }
    // yawn at night (only when idle)
    if (f.sleepy > 0.5 && f.state === 'pause' && !f.fl && !talking) {
      f.yawnT -= dt;
      if (f.yawnT <= 0 && f.yawn < 0) { f.yawn = 0; f.yawnT = 10 + f.rng() * 8; }
    }
    if (f.yawn >= 0) {
      f.yawn += dt;
      const yu = f.yawn / 1.8;
      if (yu >= 1) f.yawn = -1; else { headX -= 0.38 * env(yu, 0.3); want = 'sleepy'; f.stretch = 0.05 * env(yu, 0.3); }
    }
    if (f.yawn < 0) f.stretch = 0;
    if (want === 'normal' && f.sleepy > 0.5 && !walking) want = 'sleepy';
    if (want !== f.exprNow) { f.exprNow = want; mod.setExpression(want); }
    f.lean = lean;

    // ---- blink
    f.blinkT -= dt;
    if (f.blinkPhase < 0 && f.blinkT <= 0) f.blinkPhase = 0;
    let closed = 0;
    if (f.blinkPhase >= 0) {
      f.blinkPhase += dt;
      const k = f.blinkPhase / 0.18;
      closed = k >= 1 ? 0 : Math.sin(k * Math.PI);
      if (k >= 1) { f.blinkPhase = -1; f.blinkT = 2.4 + (((s * 5.7) % 1) + 1) % 1 * 3.5; }
    }
    mod.setBlink(closed);

    // ---- apply: rig (hop arc, squash, breathing, rise, sitting), yaw, head, limbs, ears, tail, wings, pouch
    f.sit = damp(f.sit, sitK, 6, dt);
    const br = Math.sin(s * (1.7 + 0.3 * (1 - f.sleepy)));
    const hopping = gait === 'hop' && (h > 0 || walking);
    const sy = (hopping ? 0.94 + 0.12 * h : 1) + 0.012 * br + (f.stretch || 0) - squat, sxz = 1 / Math.sqrt(Math.max(0.5, sy));
    const ry = (gait === 'hop' ? 0.15 * h : (G.bob || 0) * h) + hopBounce + rise;
    f.vy = (ry - f.lastY) / Math.max(dt, 1e-4);
    f.lastY = ry;
    const q = mod.sit;                                                         // the quadruped's sit pose (null for the others)
    mod.rig.position.y = ry - (q ? q.drop : 0.13) * f.sit;
    if (q) mod.rig.position.z = q.shift * f.sit;
    mod.rig.scale.set(sxz, sy, sxz);
    mod.rig.rotation.set(0, swayY, rollZ);
    mod.root.rotation.y = twirl;
    f.group.position.copy(f.position);
    f.group.rotation.y = f.yaw;
    if (q) {                                                                   // pitch the whole body up about the rump pivot P: position = P - R * P
      const th = f.lean - q.pitch * f.sit, c = Math.cos(th), sn = Math.sin(th), [py, pz] = q.pivot;
      mod.torso.rotation.x = th;
      mod.torso.position.set(0, py - (py * c - pz * sn), pz - (py * sn + pz * c));
    } else mod.torso.rotation.x = f.lean - 0.06 * f.sit;
    f.head.x = damp(f.head.x, headX, 9, dt); f.head.y = damp(f.head.y, headY, 12, dt); f.head.z = damp(f.head.z, headZ, 9, dt);
    mod.headGroup.rotation.set(f.head.x + (q ? q.pitch * q.headComp * f.sit : 0), f.head.y, f.head.z);
    if (!f.primed) { f.primed = true; f.armR.x = armRx; f.armR.z = armRz; f.armL.x = armLx; f.armL.z = armLz; }   // first frame: no blend from nothing
    const swinging = gait !== 'hop' && walking;
    const ar = swinging ? 22 : kind === 'wave' || kind === 'twirl' ? 14 : 10;
    const sitArm = q ? 0 : f.sit;                                              // sitting: the arms rest a little forward
    f.armR.x = damp(f.armR.x, armRx - 0.3 * sitArm, ar, dt); f.armR.z = damp(f.armR.z, armRz, ar, dt);
    f.armL.x = damp(f.armL.x, armLx - 0.3 * sitArm, ar, dt); f.armL.z = damp(f.armL.z, armLz, ar, dt);
    mod.armR.rotation.set(f.armR.x, 0, f.armR.z);
    mod.armL.rotation.set(f.armL.x, 0, f.armL.z);
    if (q) {                                                                   // front legs stay vertical against the pitched torso (a touch forward) and stretch to reach the ground
      const cx = (q.pitch - 0.1) * f.sit, st = 1 + q.stretch * f.sit;
      mod.armR.rotation.x += cx; mod.armL.rotation.x += cx;
      mod.armR.scale.y = mod.armL.scale.y = st;
    }
    // legs: tucked back through the hop, or alternating swings; sitting stretches both out in front and splays them a little
    const lr = gait === 'hop' ? 18 : 45;
    const sitLeg = q ? -Math.PI / 2 + q.pitch : -1.45;                           // quadruped: horizontal forward once the torso pitch is added
    const lL = legLx + (sitLeg - legLx) * f.sit, lR = (kickR !== null ? kickR : legRx) + (sitLeg - (kickR !== null ? kickR : legRx)) * f.sit;
    mod.legL.rotation.x = damp(mod.legL.rotation.x, lL, lr, dt);
    mod.legR.rotation.x = damp(mod.legR.rotation.x, lR, lr, dt);
    const splay = q ? q.splay : 0.18;
    mod.legL.rotation.z = mod.legL.userData.restZ + splay * f.sit;
    mod.legR.rotation.z = mod.legR.userData.restZ - splay * f.sit;
    if (q) mod.legL.position.y = mod.legR.position.y = mod.legL.userData.restPosY - q.hindLower * f.sit;
    // ears: damped springs (angle about X = lag back / forward, about Z = flop outward), driven by the vertical speed, the forward motion and the flourishes
    const gain = mod.earGain;
    for (let i = 0; i < mod.ears.length; i++) {
      const e = f.ears[i], ear = mod.ears[i], side = i === 0 ? 1 : -1;
      const tx = (0.14 * f.moving - 0.045 * Math.max(-4, Math.min(4, f.vy)) + 0.08 * f.sleepy) * gain;
      const tz = (side * ((gait === 'hop' ? 0.06 * h : 0) + earFlare) + earSwing) * gain;
      const kx = 80 + i * 8, cx = 8;
      e.vx += (kx * (tx - e.x) - cx * e.vx) * dt; e.x += e.vx * dt;
      e.vz += (kx * (tz - e.z) - cx * e.vz) * dt; e.z += e.vz * dt;
      ear.rotation.set(e.x, ear.userData.restY, ear.userData.restZ + e.z);
    }
    // tail (Yu Bbui Bbui has a wagging tail mesh; the others' tail pivot is empty, so this is harmless)
    f.wagA = damp(f.wagA, wagT, 10, dt);
    f.tailT += dt * (9 + 12 * Math.min(1.6, f.wagA));
    mod.tail.rotation.y = 0.7 * Math.min(1.6, f.wagA) * Math.sin(f.tailT);
    if (q) mod.tail.rotation.x = 0.8 * q.pitch * f.sit;                         // the tail keeps out behind her when the torso pitches
    // wings (Shyam Shyam): a gentle idle flap, fast while scurrying, whirring in the flourish; each wing swings about its own pivot
    if (mod.wings.length) {
      f.flapA = damp(f.flapA, flapT, 10, dt);
      f.wingT += dt * (4 + 26 * f.flapA);
      const fw = Math.sin(f.wingT);
      for (let i = 0; i < mod.wings.length; i++) {
        const w = mod.wings[i], side = i === 0 ? 1 : -1;
        w.rotation.set(0, w.userData.restY + side * 0.5 * f.flapA * fw, w.userData.restZ + side * 0.22 * f.flapA * Math.sin(f.wingT + 0.6));
      }
    }
    // pouch: squash and jiggle on a spring, plus the item popping up
    f.pjv += (90 * (-0.5 * Math.max(-4, Math.min(4, f.vy)) * 0.1 - f.pj) - 9 * f.pjv) * dt; f.pj += f.pjv * dt;
    if (mod.pouch) {
      mod.pouch.scale.set(1 + 0.5 * f.pj, 1 - f.pj, 1 + 0.5 * f.pj);
      mod.pouch.rotation.z = 0.02 * Math.sin(s * 1.7) + 0.4 * f.pj * (walking ? Math.sin(f.hop * Math.PI * 2) : 0);
    }
    f.pouchUp = damp(f.pouchUp, pouchUp, 12, dt);
    if (mod.pouchItem) mod.pouchItem.position.y = f.pouchUp;
  }

  // players + avatars as {x, z} points (reused array: no per-frame allocation after the first)
  const _blockers = [];
  function candidatesList() {
    _blockers.length = 0;
    for (const p of players.list) if (!p.away) _blockers.push(p.position);
    if (avatars) for (const a of avatars.list) if (a.root.visible) _blockers.push(a.position);
    return _blockers;
  }
  const _others = [];
  function friendPoints(f) {
    _others.length = 0;
    for (const o of list) if (o !== f) _others.push(o.position);
    return _others;
  }
  // the short stretch of the way ahead that is judged for a blocker (a far node is not "blocked" by somebody six metres off the line's end)
  const _ahead = { x: 0, z: 0 };
  function aheadPoint(f, tp) {
    const dx = tp.x - f.position.x, dz = tp.z - f.position.z, d = Math.hypot(dx, dz) || 1;
    const k = Math.min(1, LOOK_AHEAD / d);
    _ahead.x = f.position.x + dx * k; _ahead.z = f.position.z + dz * k;
    return _ahead;
  }
  // somebody (a player, a remote avatar or ANOTHER FRIEND) on the way ahead?
  function blockedAhead(f, tp) {
    const ahead = aheadPoint(f, tp);
    return pathBlocked(f.position, ahead, candidatesList(), BLOCK_R) || pathBlocked(f.position, ahead, friendPoints(f), FRIEND_R);
  }

  // ------------------------------------------------------------------ build the friends
  Object.entries(TDOONGZ).forEach(([id, cfg], i) => {
    if (!TDOONG_BUILDERS.includes(id)) return;     // (a config entry without a model yet: skipped)
    if (cfg.talk !== false && !SCRIPT[id]) return; // (a talking friend without lines: skipped)
    const f = makeFriend(id, cfg, i);
    byId.set(id, f);
    list.push(f);
  });
  for (const f of list) attach(f);

  function update(dt, nightness = 0) {
    time += dt;
    for (const f of list) updateFriend(f, dt, nightness);
  }

  // ------------------------------------------------------------------ debug: a lineup for visual inspection
  function lineup(anchor, { spacing = 1.7, behind = 2.4 } = {}) {
    const xs = [0];                                    // x offsets: a wide / long friend (collider radius > 0.6) gets more room on both sides
    for (let i = 1; i < list.length; i++) { const rr = list[i - 1].cfg.radius + list[i].cfg.radius; xs.push(xs[i - 1] + Math.max(spacing, rr > 1.2 ? rr + 0.95 : 0)); }
    const mid = xs[xs.length - 1] / 2;
    list.forEach((f, i) => {
      const x = anchor.x + xs[i] - mid, z = anchor.z - behind;
      f.hold = true;
      f.position.set(x, getHeight(x, z), z);
      f.state = 'pause'; f.t = 3; f.fl = null; f.flKind = null; f.moving = 0; f.hop = 0; f.blockT = 0; f.yaw = 0;
      if (f.collider) moveCollider(f.collider, x, z);
    });
    return list.map((f) => f.id);
  }
  function release() {
    for (const f of list) {
      if (!f.hold) continue;
      f.hold = false;
      let best = -1, bd = Infinity;
      f.graph.nodes.forEach((n, i) => { const d = Math.hypot(n.x - f.position.x, n.z - f.position.z); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) { const n = f.graph.nodes[best]; f.position.set(n.x, getHeight(n.x, n.z), n.z); f.node = best; f.from = best; f.target = -1; f.recent = [best]; }
      f.state = 'pause'; f.t = 1 + f.rng() * 2;
    }
    return true;
  }

  return {
    list, update, talk, play, lineup, release,
    get: (id) => byId.get(id) || null,
    summary() {
      return list.map((f) => {
        let calls = 0;
        if (f.group && f.group.visible) f.group.traverse((o) => { if (o.isMesh && o.visible) calls += o.castShadow ? 2 : 1; });
        return {
          id: f.id, gait: f.cfg.gait, state: f.state, flourish: f.flKind, x: +f.position.x.toFixed(2), y: +f.position.y.toFixed(2), z: +f.position.z.toFixed(2), yaw: +f.yaw.toFixed(2),
          node: f.node, target: f.target, nodes: f.graph.nodes.length, links: f.graph.links.length, visible: !!(f.group && f.group.visible),
          drawCalls: calls, collider: !!f.collider, interactable: !!f.interactable, talk: f.cfg.talk !== false, hold: f.hold, introSeen: f.heard, sleepy: +f.sleepy.toFixed(2), pouch: f.model ? f.model.pouchItemId : f.cfg.pouch || null,
        };
      });
    },
  };
}
