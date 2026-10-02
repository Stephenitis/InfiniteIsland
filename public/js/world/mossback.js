// Mossback the tortoise, Emberleaf's old gardener (PLAN Step 37b): a slow, kind NPC at the Emberleaf terrace garden (his spot is reserved in world/islands/emberGarden.js, the model is
// npc/mossback.js, ~5 draw calls). A sibling of the bridge builders (world/npcs.js), not part of them: those hang off the HOME bridge stubs and the feast count, he stands on Emberleaf and
// arrives with its bridge.
//
//   const mossback = createMossback({ scene, players, avatars, world, garden, dialog, particles, sfx, hud, floatLabel, isOpen })     once at load, on every screen (after createGarden)
//   mossback.update(dt, nightness)        once per tick: the gate, waking, facing, idle / sleepy animation
//   mossback.shown / .asleep / .position  state;  mossback.talk(player)  open his menu (what the interactable does);  mossback.group / .model
//   mossback.plotLine(player, i, kind)    his line about plot i (locked / no seed to plant / a seed / sprout / bud / bloom); world/planting.js calls it for 'Look' and a 'Plant' with nothing to plant
//   mossback.setRowProvider(id, fn)       Steps 38 / 39 HOOK: fn(player) -> { pages: [...] } | { onSelect(choice, dialog) } | { label?, detail?, disabled? } | null replaces the placeholder behind
//                                         the menu row 'plant' ("Plant a seed"), 'seeds' ("Where are the seeds?") or 'jobs' ("Garden jobs"); null / no provider keeps the placeholder
//   mossback.introSeen / mossback.resetIntro()      the per-screen "has he introduced himself" memory (localStorage `infiniteIsland.mossbackIntro`, like the camp spirits' intros; ?newgame clears it)
//   mossback.summary()                    debug snapshot
//
// Arrival: he is present once the Emberleaf bridge is built (isOpen(): world/bridges.js `ember.built`, or ?bridges=open), the same gate that lets players reach the island. Nothing to sync: it follows
// the synced bridge state. The first time a screen sees him he is dozing by the empty plots (eyes shut, a floating "z") and wakes when a player (or a remote avatar) comes within `MOSSBACK.wakeR`;
// the doze is a per-screen cosmetic. Awake he turns SLOWLY towards the nearest player within `nearR`, blinks slowly, turns his head now and then, tips his watering can every ~14 s and at night
// grows sleepy (half-closed eyes and a slow nod). He only exists while Emberleaf is in full detail (world.regions).
//
// Talk menu (a dialog choice menu owned by the interacting player, like the other NPCs; `menuId` 'npc-mossback'): the first time on a screen the intro pages play (Emberleaf once glowed at night with rare
// flowers, a storm scattered the seeds, would you find them?), then the rows "Plant a seed" (38b: the real planting guidance via setRowProvider, world/planting.js), "Where are the seeds?" (38a), "Garden jobs"
// (a placeholder until Step 39 hooks in) , "How do they grow?" and "Bye". The tone is calm and warm; it is about nature, gardening and light (no ceremonial / sacred imagery).
import * as THREE from 'three';
import { ISLANDS, MOSSBACK } from '../config.js';
import { getHeight } from './terrain.js';
import { addCollider, removeCollider } from './colliders.js';
import { addInteractable, removeInteractable } from './interactables.js';
import { createMossbackModel } from '../npc/mossback.js';
import { pickFaceTarget, turnToward } from '../game/npcLogic.js';
import { NEW_GAME } from '../game/save.js';
import { SEED_SVG, SPROUT_SVG, QUEST_SVG, SPARKLE_SVG, LEAVE_SVG } from '../ui/icons.js';

const INTRO_KEY = 'infiniteIsland.mossbackIntro';
const readIntro = () => { try { return localStorage.getItem(INTRO_KEY) === '1'; } catch { return false; } };
const writeIntro = () => { try { localStorage.setItem(INTRO_KEY, '1'); } catch { /* private window: the intro just plays again next load */ } };

const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const NOD_TIME = 0.7;
const TIP_EVERY = 14, TIP_TIME = 2.6;
const NIGHT_SLEEPY = 0.55;

export const SCRIPT = {
  intro: [
    'Mm? Oh... hello, little ones. Do not mind me. I am Mossback. I keep this garden. Or I did, a long while ago.',
    'These warm terraces were not always bare. On quiet nights, Emberleaf glowed. Rare flowers bloomed in rows up the mountain, soft as lanterns, and the whole island shimmered.',
    'Then came the great storm, and it scattered every seed across the island. The soil has been waiting for them ever since. I am too slow to go looking...',
    'Could you find them for me? Take your time. Gardens are never in a hurry.',
  ],
  greet: 'Hm? Ah, there you are. What shall we do, little gardener?',
  plant: ['Ah... seeds. You will need to find a seed first, little gardener. Then come back and I will show you where it likes to sleep.'],   // (the placeholder: 38b's real guidance replaces it as soon as there is a seed or a plant: world/planting.js)
  seeds: ['The seeds are scattered all over Emberleaf, hidden where the island keeps its secrets. Some wait by the warm places. Some only appear after dark...', 'I cannot tell you more just yet. Keep your eyes open, and listen to the island.'],
  jobs: ['There is work to be done here, for sure. Old trellises, thirsty soil, no lights...', 'But a garden needs something growing in it before it needs tending. Come back when the first seed is planted.'],
  grow: [
    'Plants are patient. You put a seed in a bed that is open to you, and then you tend it once, with the right care for that flower: ash, spring water, mulch or taro.',
    'A tended seed sprouts. The next time the evening comes, the sprout closes into a bud. And after the whole night, the bud opens at dawn.',
    'The blooms open a little by day and glow in the dark, you will see! And a bloom will give you one cutting, to plant a second one in another bed.',
    'But remember: the garden only grows while the day turns. It never grows while the sun is held still, or while nobody is looking. Slow and steady, little ones.',
  ],
  bye: 'Slow and steady...',
  plotPlant: ['Hm? That bed is ready and waiting. But it needs a seed first, little gardener. Go and find one.'],
  plotNothing: ['That bed is ready and waiting. But every seed you have found is planted already. Find another, or take a cutting from a flower in bloom.'],
  plotSeed: ['A seed, sleeping in the soil. It needs a little care to wake up.'],
  plotLocked: ['Overgrown... this bed is not ready yet. The garden needs some work first. Ask me about it.'],
  plotSprout: ['A tiny sprout! It will close into a bud when the evening comes.'],
  plotBud: ['A closed bud. It will open at dawn, after the night.'],
  plotBloom: ['A flower in bloom. Beautiful.'],
  plotBloomCut: ['A flower in bloom, and its cutting is already taken. Beautiful.'],
};

export function createMossback({ scene, players, avatars = null, world, garden = null, dialog, particles, sfx = null, hud = null, floatLabel = null, isOpen = () => false }) {
  const snd = (name, opts) => { if (sfx) sfx.play(name, opts); };
  const island = ISLANDS.find((i) => i.id === 'ember');
  const spot = (world && world.ember && world.ember.placement.garden.mossback) || { x: island.x + 15, z: island.z + 44 };
  const ground = getHeight(spot.x, spot.z);
  const position = new THREE.Vector3(spot.x, ground, spot.z);
  const providers = new Map();
  let heard = !NEW_GAME && readIntro();
  if (NEW_GAME) { try { localStorage.removeItem(INTRO_KEY); } catch { /* ignore */ } }

  const m = {
    id: 'mossback', name: MOSSBACK.name, species: 'tortoise', position, shown: false, asleep: true,
    group: null, model: null, collider: null, interactable: null,
  };
  let time = 0, yaw = MOSSBACK.yaw, focus = null;
  let blinkT = 3, blinkPhase = -1, sleepZ = 1.2, nodT = -1, tipClock = TIP_EVERY * 0.4, tipLeft = 0, wake = 0, tipFx = 0;
  let sleepy = 0, wCan = 0, headYaw = 0;
  const phase = 1.9;
  const candidates = [];

  function ensureModel() {
    if (m.model) return;
    m.model = createMossbackModel();
    m.group = new THREE.Group();
    m.group.name = 'npc-mossback';
    m.group.position.copy(position);
    m.group.rotation.y = yaw;
    m.model.root.scale.setScalar(MOSSBACK.scale);
    m.group.add(m.model.root);
    scene.add(m.group);
  }
  const say = (text, up = 1.9) => { if (floatLabel) floatLabel(text, { x: position.x, y: position.y + up, z: position.z }, null, null); };

  // ------------------------------------------------------------------ talking
  const rowFor = (id, p, base) => {
    const prov = providers.get(id);
    let r = null;
    if (prov) { try { r = prov(p); } catch (e) { console.error(e); } }
    return { ...base, ...(r || {}) };
  };
  const back = (p, index) => () => menu(p, index);
  function mainChoices(p) {
    const row = (id, label, icon, pages, index) => {
      const r = rowFor(id, p, { label, icon });
      return {
        label: r.label, icon: r.icon, detail: r.detail, disabled: r.disabled,
        onSelect: r.onSelect || ((c, d) => dialog.showPages(r.pages || pages, { name: MOSSBACK.name, onFinish: back(p, index) })),
      };
    };
    return [
      row('plant', 'Plant a seed', SPROUT_SVG, SCRIPT.plant, 0),
      row('seeds', 'Where are the seeds?', SEED_SVG, SCRIPT.seeds, 1),
      row('jobs', 'Garden jobs', QUEST_SVG, SCRIPT.jobs, 2),
      { label: 'How do they grow?', icon: SPARKLE_SVG, onSelect: () => dialog.showPages(garden?.stage >= 2 ? [SCRIPT.grow[0], 'With the irrigation flowing, tending makes a bud straight away. Cuttings start as buds too. They open at the next dawn.', ...SCRIPT.grow.slice(2)] : SCRIPT.grow, { name: MOSSBACK.name, onFinish: back(p, 3) }) },
      { label: 'Bye', icon: LEAVE_SVG, onSelect: () => { dialog.close(); say(SCRIPT.bye); } },
    ];
  }
  function menu(p, index = 0) {
    dialog.showChoices(() => mainChoices(p), { text: SCRIPT.greet, index, onCancel: null, name: MOSSBACK.name });
  }
  function wakeUp(fx = true) {
    if (!m.asleep) return;
    m.asleep = false;
    wake = 0;
    nodT = 0;
    if (fx && m.group && m.group.visible) { say('Mm?'); snd('pop', { pitch: 0.8, vol: 0.5 }); }
  }
  function talk(p) {
    if (!p || dialog.isOpen) return false;
    wakeUp(false);
    nodT = 0;
    snd('pop', { pitch: 0.8, vol: 0.7 });
    dialog.open({
      name: MOSSBACK.name, owner: p, tag: players.multi ? p.colors.name : '', color: p.colors.ui, menuId: 'npc-mossback',
      choices: () => mainChoices(p), text: SCRIPT.greet,
    });
    if (!heard) {
      heard = true; writeIntro();
      dialog.showPages(SCRIPT.intro, { name: MOSSBACK.name, onFinish: () => menu(p, 0) });
    }
    return true;
  }
  function plotLine(p, i, kind) {
    if (!p || dialog.isOpen) return false;
    wakeUp(false);
    nodT = 0;
    const plot = garden ? garden.get(i) : null;
    const st = plot ? plot.stage : 'empty';
    const pages = garden && !garden.usable(i) ? SCRIPT.plotLocked
      : st === 'empty' ? (garden && garden.seeds.length ? SCRIPT.plotNothing : SCRIPT.plotPlant)
      : st === 'seed' ? SCRIPT.plotSeed : st === 'sprout' ? SCRIPT.plotSprout : st === 'bud' ? SCRIPT.plotBud : plot.cut ? SCRIPT.plotBloomCut : SCRIPT.plotBloom;
    dialog.open({ name: MOSSBACK.name, pages, owner: p, tag: players.multi ? p.colors.name : '', color: p.colors.ui });
    return true;
  }

  // ------------------------------------------------------------------ show / hide (arrival)
  function show() {
    ensureModel();
    m.shown = true;
    if (!m.collider) m.collider = addCollider({ x: position.x, z: position.z, r: MOSSBACK.radius, owner: m.group });
    if (!m.interactable) {
      m.interactable = addInteractable({
        type: 'npc', object: null, position: position.clone(), radius: MOSSBACK.talkRadius, prompt: 'Talk', onInteract: (item, by) => talk(by || players.p1),
      });
    }
  }
  function hide() {
    if (!m.shown) return;
    m.shown = false;
    if (m.group) m.group.visible = false;
    if (m.collider) { removeCollider(m.collider); m.collider = null; }
    if (m.interactable) { removeInteractable(m.interactable); m.interactable = null; }
    if (dialog.isOpen && dialog.menuId === 'npc-mossback') dialog.close();
  }

  // ------------------------------------------------------------------ per frame
  function nearest() {
    candidates.length = 0;
    for (const p of players.list) if (!p.away) candidates.push(p.position);
    if (avatars) for (const a of avatars.list) if (a.root.visible) candidates.push(a.position);
    return pickFaceTarget(position, candidates, MOSSBACK.nearR);
  }

  function update(dt, nightness = 0) {
    time += dt;
    const want = !!isOpen();
    if (want && !m.shown) show();
    else if (!want && m.shown) hide();
    if (!m.shown || !m.group) return;
    const full = !world || !world.regions || world.regions.isFull('ember');
    m.group.visible = full;
    if (!full) return;
    const mod = m.model;
    const s = time + phase;
    const near = nearest();
    focus = near ? { x: near.x, z: near.z } : null;
    // waking: somebody walks up while he dozes
    if (m.asleep && near && Math.hypot(near.x - position.x, near.z - position.z) < MOSSBACK.wakeR) wakeUp();
    wake = Math.min(1, wake + dt / 1.2);
    const talking = dialog.isOpen && dialog.menuId === 'npc-mossback' && dialog.owner;
    const tgt = talking ? dialog.owner.position : near;
    const asleepNow = m.asleep;

    // facing: SLOWLY towards the nearest player, otherwise back to his idle facing
    const goal = asleepNow || !tgt ? MOSSBACK.yaw : Math.atan2(tgt.x - position.x, tgt.z - position.z);
    yaw = turnToward(yaw, goal, dt, talking ? 2.2 : 1.1);
    m.group.rotation.y = yaw;

    // breathing (slower when asleep)
    const br = Math.sin(s * (asleepNow ? 1.2 : 1.8));
    mod.rig.scale.set(1 - 0.005 * br, 1 + 0.012 * br, 1 - 0.005 * br);
    mod.rig.position.y = 0;

    // sleepiness: dozing (asleep) or the night
    const sleepyGoal = asleepNow ? 1 : (nightness > NIGHT_SLEEPY && !talking ? 0.6 : 0);
    sleepy = damp(sleepy, sleepyGoal, 1.6, dt);

    // eyes
    let closed = 0;
    if (asleepNow) closed = 1;
    else {
      blinkT -= dt;
      if (blinkPhase < 0 && blinkT <= 0) blinkPhase = 0;
      if (blinkPhase >= 0) {
        blinkPhase += dt;
        const k = blinkPhase / 0.34;                                       // slow blinks
        closed = k >= 1 ? 0 : Math.sin(k * Math.PI);
        if (k >= 1) { blinkPhase = -1; blinkT = 3 + (((s * 5.7) % 1) + 1) % 1 * 4; }
      }
      closed = Math.max(closed, 0.55 * (sleepy > 0.2 ? sleepy * (0.7 + 0.3 * Math.sin(s * 0.9)) : 0));   // drowsy lids at night
    }
    mod.setBlink(closed);

    // head: dozing = chin down with a slow breathing nod; awake = slow looks to the sides, a drowsy nod at night, a nod when talked to
    let hx, hy;
    if (asleepNow) {
      hx = 0.42 + 0.04 * Math.sin(s * 1.2); hy = 0.15 * Math.sin(s * 0.25);
    } else {
      const lookAround = tgt ? 0 : 0.42 * Math.sin(s * 0.31) * Math.sin(s * 0.13 + 1);
      headYaw = damp(headYaw, lookAround, 1.4, dt);
      hy = headYaw;
      const nodSleepy = sleepy * (0.1 + 0.22 * Math.max(0, Math.sin(s * 0.7)) ** 3);              // a slow drooping nod, then it jerks up
      hx = 0.03 * Math.sin(s * 1.1) + nodSleepy + wakeStartle(wake);
    }
    if (nodT >= 0) { nodT += dt; if (nodT >= NOD_TIME) nodT = -1; else hx += Math.sin((nodT / NOD_TIME) * Math.PI) * 0.2; }
    mod.headGroup.rotation.set(hx, hy, 0.03 * Math.sin(s * 0.8));

    // the watering can: tipped every so often (not while asleep, sleepy or talking)
    if (!asleepNow && !talking && sleepy < 0.3) {
      if (tipLeft > 0) tipLeft -= dt;
      else { tipClock += dt; if (tipClock >= TIP_EVERY) { tipClock = 0; tipLeft = TIP_TIME; } }
    } else tipLeft = Math.max(0, tipLeft - dt);
    const tipping = tipLeft > 0 && !asleepNow && !talking;
    wCan = damp(wCan, tipping ? 1 : 0, 3.2, dt);
    mod.armR.rotation.set(-0.15 - 0.75 * wCan, 0, mod.armR.userData.restZ);
    if (tipping) {
      tipFx -= dt;
      if (tipFx <= 0 && wCan > 0.8 && particles) {
        tipFx = 0.16;
        const p = new THREE.Vector3(0, -0.02, 0.72);
        mod.armR.localToWorld(p);
        particles.burst('sparkle', { x: p.x, y: p.y, z: p.z }, { count: 2, radius: 0.06, height: 0.05 });
      }
    }

    // sleeping: a floating z now and then, when somebody is around to see it
    if (asleepNow) {
      sleepZ -= dt;
      if (sleepZ <= 0) { sleepZ = 3.2; say(((time / 3.2) | 0) % 2 ? 'Z' : 'z', 1.7); }
    }
  }
  // a little startle on waking: the head lifts, then settles
  const wakeStartle = (w) => (w < 1 ? -0.18 * Math.sin(w * Math.PI) : 0);

  if (isOpen()) show();               // already open on load: stand there from the first frame

  return Object.defineProperties(m, Object.getOwnPropertyDescriptors({     // (descriptors, so the getters stay live)
    update, talk, plotLine, show, hide, showMain: menu,
    water() { wakeUp(false); tipLeft = TIP_TIME; tipFx = 0; },
    setRowProvider(id, fn) { if (fn) providers.set(id, fn); else providers.delete(id); },
    get introSeen() { return heard; },
    resetIntro() { heard = false; try { localStorage.removeItem(INTRO_KEY); } catch { /* ignore */ } },
    wake: () => wakeUp(),
    sleep() { m.asleep = true; },
    get yaw() { return yaw; },
    get focus() { return focus; },
    get tipping() { return tipLeft > 0; },
    summary() {
      let calls = 0;
      if (m.shown && m.group) m.group.traverse((o) => { if (o.isMesh && o.visible) calls += o.castShadow ? 2 : 1; });
      return {
        shown: m.shown, visible: !!(m.group && m.group.visible), asleep: m.asleep, x: +position.x.toFixed(2), y: +position.y.toFixed(2), z: +position.z.toFixed(2), yaw: +yaw.toFixed(2),
        focus, sleepy: +sleepy.toFixed(2), tipping: tipLeft > 0, collider: !!m.collider, interactable: !!m.interactable, drawCalls: calls, introSeen: heard, gate: !!isOpen(),
      };
    },
  }));
}
