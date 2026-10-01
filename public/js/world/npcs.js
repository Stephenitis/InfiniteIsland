// Bridge-builder NPCs (PLAN Step 28a): Cobble the mole (stonemason, frost bridge) and Bramble the beaver (carpenter, ember bridge). They are absent
// until the first feast, then arrive at the HOME end of their bridge, talk to players and (Step 28b) take materials to build the bridges.
//
//   const npcs = createNpcs({ scene, players, avatars, quests, sync, dialog, particles, sfx, hud, floatLabel });
//   npcs.update(dt)                       // once per tick (pop-in, facing, idle / work / cheer animation)
//   npcs.get('cobble' | 'bramble')        // the NPC (or null)         npcs.list = both
//   npcs.setMenuProvider(id, (player, npc) => choices[] | null)   // rows Step 28b adds on top of the talk menu ("Give 1", "What are you building?", ...)
//   npcs.arrive()                         // debug: arrive now with the fanfare, without touching quests.feasts (same as preview(true))
//   npcs.preview(true | false | null)     // debug override of the arrival gate (null = follow the real feast count)
//   npcs.summary()                        // debug snapshot
//
//   npc.id / name / species / position (Vector3, the NPC's feet) / group / model / shown / bridge (BRIDGES entry)
//   npc.work(on, { sound = true })        // tap with the tool (mallet / hammer) until work(false); calls npc.onTap(npc) on each strike. For 28b / 28c
//   npc.cheer()                           // arms up and two happy hops (~1.4 s)
//   npc.say(text)                         // floating speech bubble above the NPC
//   npc.lookAt(x, z, seconds)             // face a world point for a while (overrides the nearest-player rule; for cutscenes)
//   npc.onTap                             // optional callback per tool strike
//   npc.showMenu(player, index)           // show the main menu again (the giving sub-menus use it as their way back)
//   (menu provider rows may carry `.text` (greeting) and `.skipNeed`: world/bridges.js uses them once its bridge is built)
//
// Arrival rule (Step 32d): the synced feast count shows Cobble after feast 1, Bramble after feast 2. A legacy save with Bramble bridge
// progress also shows her. The feast scene calls replayArrival() for the live poof; load and late join show them already standing.
//
// The talk menu is a dialog choice menu owned by the interacting player (per screen, one dialog at a time): [provider rows], "What do you need?",
// "What's over there?", "Bye". Each NPC turns to look at the nearest player (local players and remote avatars) within NPC_NEAR u, or at the player it
// is talking to, otherwise it eases back to its idle facing. NPCs live on the home island: they are scene-level objects (not part of an island's
// region visuals), so the region manager never hides them when the view centre crosses to the bridge gap.
import * as THREE from 'three';
import { BRIDGES, NPCS, NPC_NEAR, BUILDER_ORDER } from '../config.js';
import { getHeight } from './terrain.js';
import { addCollider, removeCollider } from './colliders.js';
import { addInteractable, removeInteractable } from './interactables.js';
import { stubFrame, stubToWorld } from './bridgeStubs.js';
import { createNpcModel } from '../npc/models.js';
import { npcsPresent, pickFaceTarget, turnToward, npcCostLine } from '../game/npcLogic.js';
import { BRIDGE_SVG, LEAVE_SVG, SPARKLE_SVG } from '../ui/icons.js';

const NOPOP = -99;
const POP_TIME = 0.9;                  // s, squash-and-stretch of the arrival
const CHEER_TIME = 1.4;
const WORK_RATE = 2.4;                 // tool strikes per second
const NOD_TIME = 0.5;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

// What they say (28a: the pitch; 28b adds the "Give" rows through setMenuProvider)
const SCRIPT = {
  cobble: {
    greet: 'Howdy! Cobble the mole, stonemason! The storm took the old bridge. Bring me stone and I will build you a new one to Frostpine Isle!',
    need: (cost) => [
      `${cost}, that is all! Smash rocks with a hammer and they crumble into stone.`,
      'Bring it to me and I will start chiseling. A proper stone arch goes up in four big steps!',
    ],
    over: [
      'Frostpine Isle! Pine forests that climb all the way up to snowy peaks. It is twice as wide as this island, you know.',
      'They say the stone up there is the finest anywhere. Chilly, though. Pack a scarf!',
      'Shake the pines for pinecones, and look for lingonberry bushes, mountain mint and golden chanterelles in the woods. Dig the snow with a shovel for truffles!',
      'And if you smash a granite boulder, you might find a sparkly crystal inside. Take it all back to the campfire: forest stew, lingonberry tart, toasted pine nuts... yum!',
    ],
    bye: 'Mind the pebbles!',
  },
  bramble: {
    greet: 'Well hello there! Bramble the beaver, carpenter! The storm chewed up the old bridge. Bring me logs and I will build you a new one to Emberleaf Isle!',
    need: (cost) => [
      `${cost}, and I will have it done in no time! Chop trees with an axe and logs pop right out.`,
      'Mind the campfire though, it loves logs too! I build in four big steps, so even a few help.',
    ],
    over: [
      'Emberleaf Isle! A steamy jungle around a rumbling volcano. It is twice as wide as this island!',
      'Shake banana, coconut and breadfruit trees! Chop bamboo with an axe, pick pineapples and dig for taro with your shovel.',
      'Basalt rocks sometimes hide shiny obsidian. Bring your finds home for grilled bananas, taro and coconut bake, pineapple skewers and roasted breadfruit!',
    ],
    bye: 'Chip chip, see you around!',
  },
};

export function createNpcs({ scene, players, avatars = null, quests, sync, dialog, particles, sfx = null, hud = null, floatLabel = null }) {
  const snd = (name, opts) => { if (sfx) sfx.play(name, opts); };
  let forced = null;                    // debug override of the gate: true / false, null = real feast count
  let initialised = false;
  let time = 0;
  const providers = new Map();
  let bridgeProvider = null;

  const known = () => forced !== null || !sync.isReplica || sync.status === 'synced';   // a replica's feast count is only real after the host's snapshot
  const wanted = (id) => (forced !== null ? forced : npcsPresent(quests.feasts, {
    id, order: BUILDER_ORDER,
    legacyBramble: id === 'bramble' && !!bridgeProvider && (() => { const e = bridgeProvider('ember'); return e && (e.given > 0 || e.built); })(),
  }));

  // ---------------------------------------------------------------- one NPC
  function makeNpc(id, cfg) {
    const bridge = BRIDGES.find((b) => b.id === cfg.bridge);
    const f = stubFrame(bridge, 'a');
    const spot = stubToWorld(f, cfg.lx, cfg.lz);
    const ground = getHeight(spot.x, spot.z);
    const script = SCRIPT[id];
    const phase = (id.length * 1.7) % 6;
    const npc = {
      id, name: cfg.name, species: cfg.species, bridge, cfg, shown: false,
      position: new THREE.Vector3(spot.x, ground, spot.z),
      group: null, model: null, collider: null, interactable: null,
      onTap: null,
    };
    let yaw = cfg.yaw, idleYaw = cfg.yaw;
    let popT = NOPOP;                   // arrival clock (s, negative = still waiting for its turn), NOPOP = not popping
    let blinkT = 2 + (phase % 2), blinkPhase = -1;
    let workOn = false, workSound = true, workPhase = 0, wWork = 0;
    let cheerT = -1, wCheer = 0;
    let nodT = -1;
    let look = null, lookT = 0;         // lookAt override: { x, z }
    let focus = null;                   // what it is looking at now (for summary)
    let wasHit = false;

    const ensureModel = () => {
      if (npc.model) return;
      npc.model = createNpcModel(cfg.species);
      npc.group = new THREE.Group();
      npc.group.name = `npc-${id}`;
      npc.group.position.copy(npc.position);
      npc.group.rotation.y = yaw;
      npc.model.root.scale.setScalar(cfg.scale || 1);   // a touch bigger than a player so the builders read at gameplay zoom
      npc.group.add(npc.model.root);
      scene.add(npc.group);
    };

    function say(text) {
      if (floatLabel) floatLabel(text, { x: npc.position.x, y: npc.position.y + 2.4, z: npc.position.z }, null, null);
    }

    // ---- talking
    const need = () => npcCostLine(bridge.cost);
    // A provider may return rows with two optional properties: `text` (replaces the greeting above the list) and `skipNeed` (drops the "What do you need?" row once the bridge is built).
    function providerRows(p) {
      const prov = providers.get(id);
      if (!prov) return null;
      try { return prov(p, npc) || null; } catch (e) { console.error(e); return null; }
    }
    function mainChoices(p) {
      const list = [];
      const extra = providerRows(p);
      if (extra && extra.length) list.push(...extra);
      if (!(extra && extra.skipNeed)) list.push({
        label: 'What do you need?', icon: BRIDGE_SVG, detail: need(),
        onSelect: () => dialog.showPages(script.need(need()), { name: cfg.name, onFinish: () => menu(p, 0) }),
      });
      list.push({
        label: "What's over there?", icon: SPARKLE_SVG,
        onSelect: () => dialog.showPages(script.over, { name: cfg.name, onFinish: () => menu(p, 0) }),
      });
      list.push({ label: 'Bye', icon: LEAVE_SVG, onSelect: () => { dialog.close(); say(script.bye); } });
      return list;
    }
    const greeting = (p) => { const e = providerRows(p); return (e && e.text) || script.greet; };
    function menu(p, index = 0) {
      dialog.showChoices(() => mainChoices(p), { text: () => greeting(p), index, onCancel: null, name: cfg.name });
    }
    function talk(p) {
      if (!p || dialog.isOpen) return false;
      nodT = 0;
      snd('pop', { pitch: id === 'cobble' ? 0.85 : 1.1, vol: 0.7 });
      dialog.open({
        name: cfg.name, owner: p, tag: players.multi ? p.colors.name : '', color: p.colors.ui, menuId: `npc-${id}`,
        choices: () => mainChoices(p), text: () => greeting(p),
      });
      return true;
    }

    // ---- show / hide (arrival)
    function show(live, delay) {
      ensureModel();
      npc.shown = true;
      npc.group.visible = true;
      if (!npc.collider) npc.collider = addCollider({ x: npc.position.x, z: npc.position.z, r: cfg.radius, owner: npc.group });
      if (!npc.interactable) {
        npc.interactable = addInteractable({
          type: 'npc', object: null, position: npc.position.clone(), radius: 0.8, prompt: 'Talk', onInteract: (item, by) => talk(by || players.p1),
        });
      }
      yaw = idleYaw;
      if (live) {
        popT = -delay;
        npc.group.visible = delay <= 0;
        npc.group.scale.set(1.5, 0.001, 1.5);
      } else {
        popT = NOPOP;
        npc.group.scale.setScalar(1);
      }
    }
    function arriveFx() {
      snd('cooked', { pitch: id === 'cobble' ? 0.95 : 1.19 });
      const c = { x: npc.position.x, y: npc.position.y + 0.2, z: npc.position.z };
      particles.burst('puff', c, { count: 16, radius: 1.0, ring: true, height: 0.2, speed: 1.3 });
      particles.burst('sparkle', { x: c.x, y: c.y + 1.0, z: c.z }, { count: 12, radius: 0.9, height: 0.8 });
    }
    function hide() {
      if (!npc.shown) return;
      npc.shown = false;
      popT = NOPOP;
      workOn = false; cheerT = -1; wWork = 0; wCheer = 0;
      if (npc.group) npc.group.visible = false;
      if (npc.collider) { removeCollider(npc.collider); npc.collider = null; }
      if (npc.interactable) { removeInteractable(npc.interactable); npc.interactable = null; }
      if (dialog.isOpen && dialog.menuId === `npc-${id}`) dialog.close();
    }

    // ---- who does it look at?
    const candidates = [];
    function facingTarget() {
      if (look) return look;
      if (dialog.isOpen && dialog.menuId === `npc-${id}` && dialog.owner) return dialog.owner.position;
      candidates.length = 0;
      for (const p of players.list) if (!p.away) candidates.push(p.position);
      if (avatars) for (const p of avatars.list) if (p.root.visible) candidates.push(p.position);
      return pickFaceTarget(npc.position, candidates, NPC_NEAR);
    }

    // ---- per frame
    function update(dt) {
      if (!npc.shown || !npc.group) return;
      const m = npc.model;
      // arrival pop
      if (popT !== NOPOP) {
        popT += dt;
        if (popT < 0) { npc.group.visible = false; return; }
        if (!npc.group.visible) { npc.group.visible = true; arriveFx(); }
        if (popT >= POP_TIME) { popT = NOPOP; npc.group.scale.setScalar(1); }
        else {
          const t = popT;
          const ky = 1 - Math.exp(-5 * t) * Math.cos(16 * t);
          const kxz = 1 + 0.4 * (1 - ky) * Math.exp(-3 * t);
          npc.group.scale.set(kxz, Math.max(0.001, ky), kxz);
        }
      }
      if (lookT > 0) { lookT -= dt; if (lookT <= 0) look = null; }

      // facing
      const tgt = facingTarget();
      focus = tgt ? { x: tgt.x, z: tgt.z } : null;
      const goal = tgt ? Math.atan2(tgt.x - npc.position.x, tgt.z - npc.position.z) : idleYaw;
      yaw = turnToward(yaw, workOn ? yaw : goal, dt, 7);
      npc.group.rotation.y = yaw;

      // idle: breathing, sway, tail
      const s = time + phase;
      const breathe = Math.sin(s * 2.2);
      m.rig.scale.set(1 - 0.006 * breathe, 1 + 0.014 * breathe, 1 - 0.006 * breathe);
      m.headGroup.rotation.z = 0.045 * Math.sin(s * 0.9);
      m.headGroup.rotation.x = 0.03 * Math.sin(s * 1.3);
      m.torso.rotation.z = 0.02 * Math.sin(s * 1.1);
      const beaver = cfg.species === 'beaver';
      m.tail.rotation.y = (beaver ? 0.22 : 0.4) * Math.sin(s * (beaver ? 1.5 : 2.4));
      m.tail.rotation.x = (beaver ? 0.06 : 0) * Math.sin(s * 3);

      // blink
      blinkT -= dt;
      if (blinkPhase < 0 && blinkT <= 0) { blinkPhase = 0; }
      if (blinkPhase >= 0) {
        blinkPhase += dt;
        const k = blinkPhase / 0.16;
        m.setBlink(k >= 1 ? 0 : Math.sin(k * Math.PI));
        if (k >= 1) { blinkPhase = -1; blinkT = 2.2 + ((s * 7.3) % 1 + 1) % 1 * 3; }
      }

      // nod when talked to
      let nod = 0;
      if (nodT >= 0) { nodT += dt; if (nodT >= NOD_TIME) nodT = -1; else nod = Math.sin((nodT / NOD_TIME) * Math.PI) * 0.22; }
      m.headGroup.rotation.x += nod;

      // arms: idle swing blended with work / cheer
      wWork = damp(wWork, workOn ? 1 : 0, 9, dt);
      let hit = false;
      if (workOn) {
        const prev = workPhase;
        workPhase += dt * WORK_RATE;
        if (Math.floor(workPhase) > Math.floor(prev)) hit = true;
      }
      const f = workPhase - Math.floor(workPhase);
      const swingX = f < 0.62 ? -0.35 - 1.2 * (1 - (1 - f / 0.62) ** 2) : -1.55 + 1.35 * ((f - 0.62) / 0.38) ** 2;   // wind up slowly, strike fast
      if (hit && !wasHit) {
        if (workSound) snd(cfg.species === 'mole' ? 'crack' : 'chop', { pitch: 1.0 + 0.05 * Math.random(), vol: 0.45 });
        particles.burst('chip', { x: npc.position.x + Math.sin(yaw) * 0.8, y: npc.position.y + 0.35, z: npc.position.z + Math.cos(yaw) * 0.8 }, { count: 3, radius: 0.12 });
        if (npc.onTap) npc.onTap(npc);
      }
      wasHit = hit;
      if (cheerT >= 0) { cheerT += dt; if (cheerT >= CHEER_TIME) cheerT = -1; }
      wCheer = damp(wCheer, cheerT >= 0 ? 1 : 0, 14, dt);
      const wave = Math.sin(s * 14) * 0.18;
      const idleSwing = 0.04 * Math.sin(s * 1.7);
      const armR = m.armR, armL = m.armL;
      let rx = idleSwing, lx = -idleSwing, rz = armR.userData.restZ, lz = armL.userData.restZ;
      rx = rx + (swingX - rx) * wWork;                     // tool arm swings
      lx = lx + (-0.35 - lx) * wWork;                      // the other arm braces
      rz = rz + (-0.1 - rz) * wWork;
      lz = lz + (0.3 - lz) * wWork;
      rz = rz + (-2.7 + wave - rz) * wCheer; lz = lz + (2.7 - wave - lz) * wCheer;
      rx *= 1 - wCheer; lx *= 1 - wCheer;
      armR.rotation.set(rx, 0, rz);
      armL.rotation.set(lx, 0, lz);
      m.torso.rotation.x = 0.1 * wWork * (f > 0.62 ? 1 : 0.3);
      // cheer hops
      let hop = 0;
      if (cheerT >= 0) {
        const k = cheerT / CHEER_TIME;
        hop = Math.abs(Math.sin(k * Math.PI * 2)) * 0.34 * (1 - k * 0.3);
        const sq = 1 + 0.09 * Math.cos(k * Math.PI * 4);
        m.rig.scale.y *= sq; m.rig.scale.x *= 1 / Math.sqrt(sq); m.rig.scale.z *= 1 / Math.sqrt(sq);
      }
      m.rig.position.y = hop;
    }

    Object.defineProperties(npc, Object.getOwnPropertyDescriptors({     // (descriptors, so the getters stay live)
      update, show, hide, say, talk, arriveFx,
      work(on = true, { sound = true } = {}) { workOn = !!on; workSound = sound; if (on) workPhase = 0.55; },
      cheer() { cheerT = 0; snd('equip', { pitch: 1.2, vol: 0.7 }); particles.burst('sparkle', { x: npc.position.x, y: npc.position.y + 1.5, z: npc.position.z }, { count: 8, radius: 0.7, height: 0.4 }); },
      lookAt(x, z, seconds = 2) { look = { x, z }; lookT = seconds; },
      get working() { return workOn; },
      get cheering() { return cheerT >= 0; },
      get yaw() { return yaw; },
      get focus() { return focus; },
      get popping() { return popT !== NOPOP; },
      mainChoices,
      showMenu: menu,                   // (player, index) back to this NPC's main menu from a sub-menu / page (Step 28b)
    }));
    return npc;
  }

  const byId = new Map();
  for (const [id, cfg] of Object.entries(NPCS)) byId.set(id, makeNpc(id, cfg));
  const list = [...byId.values()];

  // ---------------------------------------------------------------- the arrival gate
  /** Make the builders match the gate. `live` = the change happens in front of the players (pop + fanfare); false on load. */
  function refresh(live) {
    if (!known()) return false;
    const want = list.some((n) => wanted(n.id));
    const wasShown = list.some((n) => n.shown);
    let arrived = false;
    if (want) {
      for (const n of list) {
        if (!wanted(n.id)) { n.hide(); continue; }
        if (n.shown) continue;
        const fx = live && forced !== null && initialised; // the feast scene owns ordinary arrivals
        n.show(fx, n.cfg.arriveDelay);
        if (fx && n.cfg.arriveDelay <= 0) n.arriveFx();
        arrived = arrived || fx;
      }
    } else for (const n of list) n.hide();
    initialised = true;
    return arrived && !wasShown;
  }

  const announce = () => {
    if (hud) hud.toast('Builders have arrived at the old bridges!', { icon: 'bridge', duration: 4200 });
  };

  quests.on('change', () => {
    refresh(true);
  });
  sync.on('snapshot', () => refresh(false));

  refresh(false);                     // a host knows its feast count right away; a replica waits for the snapshot (known())

  return {
    list,
    get: (id) => byId.get(id) || null,
    update(dt) { time += dt; for (const n of list) n.update(dt); },
    setMenuProvider(id, fn) { if (fn) providers.set(id, fn); else providers.delete(id); },
    setBridgeProvider(fn) { bridgeProvider = fn; refresh(false); },
    replayArrival(id) { const n = byId.get(id); if (!n) return false; if (!n.shown) n.show(false, 0); n.show(true, 0); n.arriveFx(); n.cheer(); return true; },
    arrive() { forced = true; const a = refresh(true); if (a) announce(); return list.map((n) => n.id); },
    preview(v) { forced = v === null || v === undefined ? null : !!v; refresh(true); return list.some((n) => wanted(n.id)); },
    get present() { return list.some((n) => n.shown); },
    summary() {
      return list.map((n) => {
        let calls = 0;
        if (n.shown && n.group) n.group.traverse((o) => { if (o.isMesh && o.visible) calls += o.castShadow ? 2 : 1; });
        return {
          id: n.id, name: n.name, shown: n.shown, x: +n.position.x.toFixed(2), z: +n.position.z.toFixed(2), y: +n.position.y.toFixed(2),
          yaw: +n.yaw.toFixed(2), focus: n.focus, popping: n.popping, working: n.working, cheering: n.cheering,
          collider: !!n.collider, interactable: !!n.interactable, drawCalls: calls, feasts: quests.feasts, forced,
        };
      });
    },
  };
}
