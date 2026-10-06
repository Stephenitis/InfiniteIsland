// Bridge building (PLAN Step 28b): players give the builders their materials; the bridges to Frostpine (Cobble, stone) and Emberleaf (Bramble, logs)
// grow in 4 stages and the last one opens the deck. This file is the host-authoritative `bridges` world-sync domain + the giving menus + the visuals
// glue (world/bridgeMesh.js) + the build moments. Pure rules (stages, clamping, the gate) live in game/bridgeLogic.js (Node-tested).
//
//   const bridges = createBridges({ scene, players, quests, inventory, sync, npcs, dialog, hud, particles, sfx, floatLabel, debugOpen })
//   bridges.update(dt, nightness)            once per tick: build moments, pop-ins, lantern glow
//   bridges.state / bridges.entry(id)        { id: { given, stage, built } }
//   bridges.mesh(id)                         the BridgeMesh (world/bridgeMesh.js)
//   bridges.give(player, id, n)              what the menu does: a request; host -> { ok, result } now, replica -> Promise of it
//   bridges.setOpeningHandler(fn)            28c HOOK (the bridge-opening cutscene): fn(ctx) runs on EVERY screen when the final gift lands; return true to take over.
//                                              ctx = { id, bridge (BRIDGES entry), island (ISLANDS entry), mesh (BridgeMesh), npc, from (stage before), finish(opts) }
//                                              A handler that took over must call ctx.finish() when its scene ends (or is skipped): that opens the deck
//                                              (terrain.setBridgeOpen), shows every segment, and plays the confetti + jingle + toast. finish({ silent: true })
//                                              only opens (no fanfare). While the scene runs, `built` is already saved and the deck is NOT walkable yet.
//                                              Without a handler the final quarter plays its normal build moment and finish() follows by itself.
//   bridges.hold(id, seconds)                the builder of bridge id hammers for that long (game/bridgeScene.js taps the last piece with it)
//   bridges.on('opened', fn(id))             fires after finish() on every screen
//   bridges.debug.{ summary, give(id, n), build(id), reset(id) }
//
// Domain 'bridges'. State { [id]: { given, stage, built } } (stage derived from given, built when the last stage completed).
//   Request give {id, n}   (any screen): the HOST checks the gate (quests.feasts >= 1), the bag (shared inventory) and that the bridge is not built, clamps n to
//                          what the bridge still needs and the bag holds, removes the items, updates `given` / `stage` and emits event `gave`
//                          { id, n, given, stage, built, from (stage before), actor } -> result { n, given, stage, built }. The host serialises requests, so two
//                          screens racing can never overspend. Rejects: locked | built | none | far | bad-request.
//   Event gave             every screen (host included, through the same applyGave): floating "-5 Stone", the NPC works, and when the stage went up the build
//                          moment plays (stubs vanish, segments pop in). A replica waits for the event: no optimistic visuals.
//   Event set              debug: replace one entry silently (build / reset).
//   Snapshot = the state; hashView = the state. Saved by the HOST under 'infinite-island.bridges.v1' as { v: 1, bridges: { id: { given, built } } }
//   (?newgame wipes it; replicas never save: game/save.js). A load / late join shows built bridges open with no fanfare and partial ones at their stage.
//   ?bridges=open (debug) only changes what THIS page shows (finished bridges, open decks); the state and the save are untouched.
import { BRIDGES, ISLANDS, NPCS } from '../config.js';
import { NEW_GAME, loadSave, writeSave, clearSave } from '../game/save.js';
import { getItem, itemName } from '../game/catalog.js';
import { STAGES, costOf, itemAt, phaseLeft, stageProgress, remaining, validateGift, applyGift, freshEntry, normaliseEntry, hashView } from '../game/bridgeLogic.js';
import { setBridgeOpen, isBridgeOpen, isWalkable } from './terrain.js';
import { setStubsGone } from './bridgeStubs.js';
import { addCollider, removeCollider } from './colliders.js';
import { createBridgeMesh, SEGMENTS } from './bridgeMesh.js';
import { BRIDGE_SVG, SPARKLE_SVG, BACK_SVG } from '../ui/icons.js';

export const STORAGE_KEY = 'infinite-island.bridges.v1';
const PER_STAGE = SEGMENTS / STAGES;
const REMOTE_RANGE = 12;               // the host accepts a REMOTE gift from this far from the NPC (talk range + latency slack)
const STAGGER = 0.17;                  // s between the segments of a build moment
const HAMMER_TIME = 1.5;               // s the NPC hammers per stage

// What the builders say (in character; the pitch / tips are in world/npcs.js)
const SCRIPT = {
  cobble: {
    givePrompt: (have, left) => `Stones, stones! I still need ${left}. You have ${have}. Every chunk helps!`,
    nudge: 'Not a single pebble in your bag, friend! Smash a rock with a hammer and it crumbles into lovely stone. Then come back!',
    thanks: (n, given, total) => `${n === 1 ? 'A fine stone' : `${n} fine stones`}! That makes ${given} of ${total}.`,
    stage: ['A quarter done! The foundations are set!', 'Halfway there! Look at that arch go!', 'Three quarters! Almost across!', 'Done! Every last stone in place!'],
    progress: (p) => p.built ? 'It is finished! Not a stone out of place.' : `Stage ${p.stage + 1} of ${STAGES}: ${p.given} / ${p.total} stones so far. Just ${p.next - p.given} more for the next stretch!`,
    builtText: 'The bridge to Frostpine Isle is open! Go on, take a look!',
    thanksBuilt: ['Chisel and chip, it turned out grand, even if I say so myself. Thank YOU!'],
    tip: ['Frostpine Isle is chilly: pine woods, then snow and peaks. Watch your step on the ice!', 'Rocks up there are plentiful, so bring a hammer if you need more stone. And pinecones, lingonberries, mint, chanterelles, truffles and crystals are all waiting to be found!'],
    work: 'crack',
  },
  bramble: {
    givePrompt: (have, left) => `Logs, logs, logs! I still need ${left}, and you have ${have}. Chip chip!`,
    nudge: 'No logs on you! Chop a tree with an axe and the logs pop right out. Then come back and I will get building!',
    thanks: (n, given, total) => `${n === 1 ? 'A lovely log' : `${n} lovely logs`}! That makes ${given} of ${total}.`,
    stage: ['A quarter done! Planks are going down!', 'Halfway! Hear those ropes creak!', 'Three quarters! Hold on to your hats!', 'All done! Not a plank out of place!'],
    progress: (p) => p.built ? 'All done! Sturdy as a dam.' : `Stage ${p.stage + 1} of ${STAGES}: ${p.given} / ${p.total} logs so far. ${p.next - p.given} more and the next stretch is mine!`,
    builtText: 'The bridge to Emberleaf Isle is open! Mind the tiki guards, they are friendly!',
    thanksBuilt: ['Gnaw and hammer, a beaut! Thank YOU, friend!'],
    tip: ['Emberleaf Isle is hot and steamy: jungle, a volcano, hot springs. Keep away from the lava!', 'Shake palms for bananas and coconuts, and breadfruit trees for fruit. Chop bamboo, pick pineapples, and dig for taro. Basalt can hide obsidian!'],
    work: 'chop',
  },
  // Quill (Step 48): two materials in order, stone then logs (game/bridgeLogic.js phases), so the prompt / nudge / thanks lines know which one is wanted.
  quill: {
    givePrompt: (have, left, item) => (item === 'stone'
      ? `Stones first, please! They make the footings. I still need ${left}, and you have ${have}. Every one is a full stop in my plan!`
      : `Now the logs for the planks! I still need ${left}, and you have ${have}. Chapter two is nearly written!`),
    nudge: (item) => (item === 'stone'
      ? 'Not a single stone in your bag! Smash a rock with a hammer and it crumbles into lovely stone. I shall wait right here with my book.'
      : 'No logs on you! Chop a tree with an axe and the logs pop right out. Then come back and we will lay the planks!'),
    thanks: (n, given, total, item) => `${n === 1 ? `A fine ${itemName(item, 1).toLowerCase()}` : `${n} fine ${itemName(item, n).toLowerCase()}`}! That makes ${given} of ${total}.`,
    stage: ['Chapter one: the footings are set!', 'Chapter two: the arch is up! Now I need logs for the planks.', 'Chapter three: the deck is going down!', 'The end... no, the BEGINNING! Every plank in place!'],
    progress: (p) => p.built ? 'It is finished! A page-turner of a bridge.' : `Stage ${p.stage + 1} of ${STAGES}: ${p.given} / ${p.total} so far (stone first, then logs). Just ${p.next - p.given} more for the next stretch!`,
    builtText: 'The bridge to Storybook Cay is open! Find me by the great book and I will tell you all about it.',
    thanksBuilt: ['A bridge, start to finish. If I were writing it down, I would call it a happy ending.'],
    tip: ['Storybook Cay is a soft little meadow with a washed-up pop-up storybook the size of a house. Follow the ribbons to the book stand!', 'Stepping into a page takes the whole party in together. Every page is a tiny world of its own.'],
    work: 'pat',
  },
};

const REASON = {
  locked: 'The builders only start once the island has had its first feast!',
  built: 'The bridge is finished already! Nothing more to give.',
  far: 'Come a little closer, friend!',
};

export function createBridges({ scene, players, quests, inventory, sync, npcs, dialog, hud, particles, sfx = null, floatLabel = null, debugOpen = false }) {
  const snd = (name, opts) => { if (sfx) sfx.play(name, opts); };
  const info = new Map();
  for (const b of BRIDGES) {
    const c = costOf(b);
    info.set(b.id, { id: b.id, bridge: b, ...c, island: ISLANDS.find((i) => i.id === b.to), npcId: b.npc, script: SCRIPT[b.npc] });
  }
  const ids = [...info.keys()];
  const state = {};
  for (const id of ids) state[id] = freshEntry();
  const meshes = {};
  const openers = new Set();                // bridges whose opening scene is running (built, but the deck is not open yet)
  const handlers = { opened: new Set() };
  let openingHandler = null;
  let clock = 0;
  const timers = [];                        // { id, at, fn }
  const workUntil = new Map();              // npc id -> clock time
  const workOn = new Map();
  const colliders = new Map();              // bridge id -> [collider] (construction blocks the segments that stand on land)

  // ---------------------------------------------------------------- persistence (host only: game/save.js switches saving off on a replica)
  function save() {
    const bridges = {};
    for (const id of ids) bridges[id] = { given: state[id].given, built: state[id].built };
    writeSave(STORAGE_KEY, { v: 1, bridges });
  }
  if (NEW_GAME) clearSave(STORAGE_KEY);
  else {
    const d = loadSave(STORAGE_KEY);
    if (d && d.bridges && typeof d.bridges === 'object') for (const id of ids) state[id] = normaliseEntry(d.bridges[id], info.get(id).total);
  }

  // ---------------------------------------------------------------- meshes
  for (const id of ids) {
    meshes[id] = createBridgeMesh(id);
    scene.add(meshes[id].group);
  }
  const npcOf = (id) => npcs.get(info.get(id).npcId);
  const toastOpened = (id) => hud.toast(`The bridge to ${info.get(id).island.name} is open!`, { icon: 'bridge', duration: 4200 });
  const later = (id, seconds, fn) => timers.push({ id, at: clock + seconds, fn });
  const cancelTimers = (id) => { for (let i = timers.length - 1; i >= 0; i--) if (timers[i].id === id) timers.splice(i, 1); };
  const hold = (npcId, seconds) => workUntil.set(npcId, Math.max(workUntil.get(npcId) || 0, clock + seconds));

  /** Circle colliders on the revealed segments that stand on land (the deck is not walkable until it opens, so only the beach end matters). */
  function refreshColliders(id) {
    for (const c of colliders.get(id) || []) removeCollider(c);
    const out = [];
    const m = meshes[id];
    if (!isBridgeOpen(id) && !debugOpen) {
      for (let i = 0; i < m.shown; i++) {
        for (const lat of [-0.9, 0, 0.9]) {
          const p = m.segmentPoint(i, 'mid', lat);
          if (isWalkable(p.x, p.z)) out.push(addCollider({ x: p.x, z: p.z, r: 0.75, owner: `bridge-${id}` }));
        }
      }
    }
    colliders.set(id, out);
  }

  /** Make the world show an entry with no animation or fanfare (load, late join, debug). */
  function showSilently(id) {
    const e = state[id], m = meshes[id];
    cancelTimers(id);
    openers.delete(id);
    const stage = debugOpen ? STAGES : e.stage;
    m.revealSegments(stage * PER_STAGE);
    setStubsGone(id, stage >= 1);
    setBridgeOpen(id, e.built || debugOpen);
    refreshColliders(id);
    const npc = npcOf(id);
    if (npc && npc.working && !workUntil.get(info.get(id).npcId)) npc.work(false);
  }
  for (const id of ids) showSilently(id);

  // ---------------------------------------------------------------- opening (the final stage)
  function finish(id, { silent = false } = {}) {
    const m = meshes[id];
    if (!openers.has(id) && isBridgeOpen(id)) return;
    openers.delete(id);
    m.revealSegments(SEGMENTS);
    setStubsGone(id, true);
    setBridgeOpen(id, true);
    refreshColliders(id);
    if (!silent) {
      const a = m.endPoint('a'), b = m.endPoint('b');
      for (const p of [a, b]) particles.burst('confetti', { x: p.x, y: p.y + 1.6, z: p.z }, { count: 26, radius: 1.2, height: 0.6 });
      particles.burst('sparkle', { x: a.x, y: a.y + 1.2, z: a.z }, { count: 10, radius: 1.0, height: 0.6 });
      snd('jingle');
      toastOpened(id);
      const npc = npcOf(id);
      if (npc) npc.cheer();
    }
    for (const fn of [...handlers.opened]) { try { fn(id); } catch (e) { console.error(e); } }
  }

  /** One quarter (or more, after a big gift) of the deck builds itself: the NPC hammers, a poof, segments pop in one by one with rising thunks. */
  function buildMoment(id, to, done) {
    const m = meshes[id], inf = info.get(id), npc = npcOf(id);
    const first = m.revealed;
    const target = to * PER_STAGE;
    if (target <= first) { if (done) done(); return; }
    hold(inf.npcId, HAMMER_TIME + 0.4);
    later(id, 0.45, () => {
      const p = m.segmentPoint(first, 'start');
      particles.burst('puff', { x: p.x, y: p.y, z: p.z }, { count: 10, radius: 1.2, ring: true, height: 0.3, speed: 1.2 });
      snd('equip', { pitch: 0.8, vol: 0.6 });
      m.revealSegments(target, {
        animate: true, stagger: STAGGER,
        onSegment: (i, k, total) => {
          const q = m.segmentPoint(i);
          snd('thud', { pitch: 0.8 + 0.5 * (total > 1 ? k / (total - 1) : 1), vol: 0.8 });
          particles.burst('puff', { x: q.x, y: q.y, z: q.z }, { count: 4, radius: 1.1, height: 0.2, speed: 0.8 });
          if (i === first) setStubsGone(id, true);
        },
        onDone: () => { refreshColliders(id); if (done) done(); },
      });
    });
    setStubsGone(id, true);
  }

  function stageUp(id, d) {
    const inf = info.get(id), npc = npcOf(id), m = meshes[id];
    const line = (st) => { const n = npcOf(id); if (n && n.shown) n.say(inf.script.stage[Math.min(STAGES, st) - 1]); };
    if (d.built) {
      // 28c hook: the opening scene may take over the final quarter. Quarters before it appear at once.
      if (d.from < STAGES - 1) m.revealSegments((STAGES - 1) * PER_STAGE);
      setStubsGone(id, true);
      openers.add(id);
      let handled = false;
      if (openingHandler) {
        try { handled = !!openingHandler({ id, bridge: inf.bridge, island: inf.island, mesh: m, npc, from: d.from, finish: (o) => finish(id, o) }); }
        catch (e) { console.error(e); handled = false; }
      }
      if (!handled) buildMoment(id, STAGES, () => { finish(id); line(STAGES); });
      return;
    }
    buildMoment(id, d.stage, () => line(d.stage));
  }

  // ---------------------------------------------------------------- a gift (host decides, every screen shows)
  const localPlayerOf = (actor) => (actor && actor.screen === sync.screenId && players.get ? players.get(actor.index) : null);

  function applyGave(d) {
    const inf = info.get(d.id);
    if (!inf) return;
    state[d.id] = normaliseEntry({ given: d.given, built: d.built }, inf.total);
    save();
    const npc = npcOf(d.id);
    const by = localPlayerOf(d.actor);
    if (npc && npc.shown) {
      hold(inf.npcId, 0.9);
      if (floatLabel && d.n > 0) {
        const wanted = d.item || inf.item;
        const def = getItem(wanted);
        floatLabel(`-${d.n} ${itemName(wanted, d.n)}`, { x: npc.position.x, y: npc.position.y + 2.3, z: npc.position.z }, by, def ? def.icon : '');
      }
      particles.burst('sparkle', { x: npc.position.x, y: npc.position.y + 1.2, z: npc.position.z }, { count: 5, radius: 0.5, height: 0.4 });
    }
    snd('equip', { pitch: 1.0 + 0.04 * Math.min(5, d.n), vol: 0.7 });
    if (d.stage > d.from) stageUp(d.id, d);
    if (dialog.isOpen && dialog.menuId === `npc-${inf.npcId}`) dialog.refresh();
  }

  function handleGive(d, actor, debug = false) {
    const inf = info.get(d && d.id);
    if (!inf || !actor && !debug) return { reject: 'bad-request' };
    const entry = state[inf.id];
    if (!debug && actor.screen !== 'host') {
      const npc = npcOf(inf.id);
      if (npc && Math.hypot(actor.pos.x - npc.position.x, actor.pos.z - npc.position.z) > REMOTE_RANGE) return { reject: 'far' };
    }
    const item = itemAt(inf.bridge, entry.given);                  // (Step 48: the material of the current phase; a one-material bridge is always its only item)
    const v = validateGift({ feasts: debug ? 99 : quests.feasts, entry, total: inf.total, have: debug ? 999 : inventory.count(item), n: d.n, cap: phaseLeft(inf.bridge, entry.given) });
    if (!v.ok) return { reject: v.reason };
    if (!debug && !inventory.remove(item, v.n)) return { reject: 'none' };
    const next = applyGift(entry, inf.total, v.n);
    const data = { id: inf.id, n: v.n, item, given: next.given, stage: next.stage, built: next.built, from: entry.stage, actor: actor ? { screen: actor.screen, index: actor.index } : null };
    applyGave(data);                                   // (saves)
    sync.emit('bridges', 'gave', data);
    return { result: { n: v.n, item, given: next.given, stage: next.stage, built: next.built, from: entry.stage } };
  }

  function handleSet(d) {
    const inf = info.get(d && d.id);
    if (!inf) return { reject: 'bad-request' };
    state[inf.id] = normaliseEntry(d.entry, inf.total);
    save();
    showSilently(inf.id);
    sync.emit('bridges', 'set', { id: inf.id, entry: { ...state[inf.id] } });
    return true;
  }

  sync.register('bridges', {
    snapshot: () => JSON.parse(JSON.stringify(state)),
    hashView: () => hashView(state),
    applySnapshot(s) {
      for (const id of ids) {
        const next = normaliseEntry(s && s[id], info.get(id).total);
        const cur = state[id];
        if (next.given === cur.given && next.built === cur.built) continue;
        state[id] = next;
        showSilently(id);
      }
    },
    applyEvent(kind, d) {
      if (kind === 'gave') applyGave(d);
      else if (kind === 'set') { const inf = info.get(d.id); if (inf) { state[inf.id] = normaliseEntry(d.entry, inf.total); showSilently(inf.id); } }
    },
    handleRequest(kind, d, actor) {
      if (kind === 'give') return handleGive(d, actor);
      if (kind === 'debugGive') return handleGive(d, actor, true);
      if (kind === 'debugSet') return handleSet(d);
      return { reject: 'unknown-kind' };
    },
  });

  /** Ask the host to take n items for bridge `id` (host: the answer now, replica: a Promise of it). */
  function give(player, id, n) {
    return sync.request('bridges', 'give', { id, n }, player ? sync.actorFor(player) : null);
  }

  // ---------------------------------------------------------------- the giving menu (rows added to the NPC's talk menu)
  function install(id) {
    const inf = info.get(id), S = inf.script;
    const npc = () => npcOf(id);
    const name = NPCS[inf.npcId].name;
    const itemNow = () => itemAt(inf.bridge, state[id].given);
    const have = () => inventory.count(itemNow());
    const left = () => phaseLeft(inf.bridge, state[id].given);
    const nudge = () => (typeof S.nudge === 'function' ? S.nudge(itemNow()) : S.nudge);
    const back = (p) => () => npc().showMenu(p, 0);
    const pages = (p, list, after) => dialog.showPages(list, { name, onFinish: after || back(p) });

    function giveMenu(p) {
      const m = Math.min(have(), left());
      if (m < 1) { pages(p, [nudge()]); return; }
      const rows = () => {
        const mm = Math.min(have(), left());
        const list = [];
        const icon = getItem(itemNow()).icon;
        if (mm >= 1) list.push({ label: 'Give 1', icon, onSelect: () => doGive(p, 1) });
        if (mm > 5) list.push({ label: 'Give 5', icon, onSelect: () => doGive(p, 5) });
        if (mm > 1) list.push({ label: `Give all (${mm})`, icon, onSelect: () => doGive(p, mm) });
        list.push({ label: 'Back', icon: BACK_SVG, onSelect: back(p) });
        return list;
      };
      dialog.showChoices(rows, { text: S.givePrompt(have(), left(), itemNow()), name, onCancel: back(p) });
    }

    function afterGift(p, r) {
      if (!dialog.isOpen || dialog.owner !== p) return;
      if (!r.ok) {
        const text = r.reason === 'none' ? nudge() : REASON[r.reason] || 'Hmm, I did not quite catch that. Could you try again?';
        pages(p, [text], r.reason === 'none' || r.reason === 'built' || r.reason === 'locked' ? back(p) : () => giveMenu(p));
        return;
      }
      const res = r.result || {};
      const advanced = res.stage > res.from;
      const line = S.thanks(res.n, res.given, inf.total, res.item);
      pages(p, [line], advanced || res.built ? () => dialog.close() : (left() > 0 && have() > 0 ? () => giveMenu(p) : back(p)));
    }
    function doGive(p, n) {
      const r = give(p, id, n);
      if (sync.isHost) afterGift(p, r);
      else {
        pages(p, ['Let me see...'], back(p));
        r.then((res) => afterGift(p, res));
      }
    }

    npcs.setMenuProvider(inf.npcId, (p) => {
      const e = state[id];
      const rows = [];
      if (e.built) {
        rows.skipNeed = true;
        rows.text = S.builtText;
        rows.push({ label: 'It looks wonderful!', icon: SPARKLE_SVG, onSelect: () => pages(p, S.thanksBuilt) });
        rows.push({ label: `Tell me about ${inf.island.name}`, icon: BRIDGE_SVG, onSelect: () => pages(p, S.tip) });
        return rows;
      }
      const def = getItem(itemNow());
      rows.push({ label: `Give ${itemName(itemNow(), 2)}`, icon: def.icon, detail: `you have ${have()}`, onSelect: () => giveMenu(p) });
      const pr = stageProgress(e.given, inf.total);
      rows.push({ label: "How's the bridge going?", icon: BRIDGE_SVG, detail: `${pr.given} / ${pr.total}`, onSelect: () => pages(p, [S.progress(pr)]) });
      return rows;
    });
  }
  for (const id of ids) install(id);

  // ---------------------------------------------------------------- frame update
  function update(dt, nightness = 0) {
    clock += dt;
    const due = timers.filter((t) => clock >= t.at).sort((x, y) => x.at - y.at);   // in the order they were set
    for (const t of due) { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); try { t.fn(); } catch (e) { console.error(e); } }
    for (const id of ids) {
      const npcId = info.get(id).npcId, npc = npcs.get(npcId);
      const on = clock < (workUntil.get(npcId) || 0);
      if (npc && npc.shown && on !== !!workOn.get(npcId)) { npc.work(on, { sound: true }); workOn.set(npcId, on); }
      meshes[id].update(dt, nightness);
    }
  }

  // ---------------------------------------------------------------- debug (not part of the game)
  const reqDebug = (kind, d) => {
    const r = sync.request('bridges', kind, d, sync.isHost ? { screen: 'host', index: 0, pos: { x: 0, y: 0, z: 0 } } : null);
    return r;
  };
  const debug = {
    summary: () => summary(),
    /** Add n from nothing (bypasses the gate and the bag, but takes the normal host path: events, stage moments). */
    give: (id, n = 1) => reqDebug('debugGive', { id, n }),
    /** Complete a bridge silently and at once (open deck, no fanfare). */
    build: (id) => reqDebug('debugSet', { id, entry: { given: info.get(id).total, built: true } }),
    /** Back to nothing (the deck closes, the stubs return). */
    reset: (id) => reqDebug('debugSet', { id, entry: { given: 0, built: false } }),
  };

  function summary() {
    const out = {};
    for (const id of ids) {
      const m = meshes[id];
      out[id] = { ...state[id], total: info.get(id).total, item: info.get(id).item, open: isBridgeOpen(id), opening: openers.has(id), shown: m.shown, animating: m.busy, colliders: (colliders.get(id) || []).length, mesh: m.summary() };
    }
    return out;
  }

  return {
    update, give, debug, summary,
    state, entry: (id) => ({ ...state[id] }),
    mesh: (id) => meshes[id],
    meshes,
    info: (id) => info.get(id),
    /** The NPC of bridge `id` hammers for `seconds` more (the opening cutscene's tap). */
    hold: (id, seconds) => hold(info.get(id).npcId, seconds),
    setOpeningHandler(fn) { openingHandler = typeof fn === 'function' ? fn : null; },
    on(type, fn) { (handlers[type] ||= new Set()).add(fn); return () => handlers[type].delete(fn); },
    get opening() { return [...openers]; },
  };
}
