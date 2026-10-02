// Sync stress harness (PLAN Step 22b; DEBUG ONLY, loaded on demand by `__game.sync.stress(opts)`, nothing in the game imports it).
//
// Run it in the HOST tab and in one or more REPLICA tabs (`?join=CODE`) at the same time; each tab drives ITS OWN local player (P1) with a seeded
// random script of everything the shared world offers, with random simulation step sizes, then reports the world hashes:
//
//   // tab A (host, http://localhost:3000/?daylock&time=noon)        // tab B (replica, ?join=CODE&daylock&time=noon)
//   window.__r = null; __game.sync.stress({ steps: 3000, seed: 1 }).then((r) => (window.__r = r));   // same in B with seed: 2
//   ... later, in BOTH tabs, once both finished:  await __game.sync.stress({ steps: 0, settle: 8 })   // quiesce + report
//   // then compare  r.hash  /  r.hashes  of the two tabs: they must be equal; r.problems must be [] in both.
//
// Actions (random, each teleports the player next to its target first): shake a tree / palm, chop (tree / palm / rock with whatever tool is held),
// dig a spot (shovel), pick a herb / mushroom, rustle a berry bush, poke a flower / rock (cosmetic), grab a tool (item swaps), drop logs into the fire,
// cook a random recipe (ingredients added to the shared bag first), walk over ground pickups, start / give up the shared quest, complete a
// quest + start the feast, regrowNow, set the fire fuel, set the time of day, empty (most of) the shared bag. Step sizes vary (1/60 .. 0.25 s, 1 - 12 steps at a time) and the
// loop yields to the network every few actions so events arrive interleaved with the requests of the other tab.
//
// The report's `problems` lists: exceptions / console errors, lost or duplicated ordinary tools, an item held twice, duplicate pickup ids, a negative bag count,
// a failed request that threw. `sync.hash()` / `.hashes()` must match across tabs (the clock hour is compared separately: `clock.hour`).
import { listRecipes } from '../game/catalog.js';
import { CAMPFIRE } from '../config.js';
import { FLOWER_IDS, tendItemOf } from '../game/flowers.js';

const TAU = Math.PI * 2;
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// yield to the event loop without being throttled by a hidden tab: a MessageChannel ping-pong until `ms` of real time passed
const mc = new MessageChannel();
const tickYield = () => new Promise((res) => { mc.port1.onmessage = () => res(); mc.port2.postMessage(0); });
async function wait(ms) {
  const end = performance.now() + ms;
  do { await tickYield(); } while (performance.now() < end);
}

export async function runStress({ steps = 2000, seed = 1, wait: waitMs = 6, settle = 6, actions = null } = {}) {
  const g = window.__game;
  if (!g || !g.sync) throw new Error('__game not ready');
  const rng = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const p = g.players.p1;
  // Ordinary tools are seeded at startup; special lightsabers may be added during play.
  const ordinaryIds = g.items.list.filter((i) => !i.special).map((i) => i.id).sort((a, b) => a - b);
  const problems = [];
  const counts = {};
  const problem = (msg) => { if (problems.length < 40) problems.push(msg); };

  // errors: console.error + uncaught ones while the stress runs
  const origError = console.error;
  console.error = (...a) => { problem('console.error: ' + a.map((x) => (x && x.message) || String(x)).join(' ').slice(0, 200)); origError.apply(console, a); };
  const onErr = (e) => problem('uncaught: ' + (e.message || e.reason || e));
  window.addEventListener('error', onErr);
  window.addEventListener('unhandledrejection', onErr);

  const live = (...types) => g.getInteractables().filter((i) => types.includes(i.type));
  const goNear = (it) => {
    const a = rng() * TAU, d = (it.radius || 0.5) + 0.7;
    p.teleport(it.position.x + Math.cos(a) * d, it.position.z + Math.sin(a) * d);
  };
  const fire = g.campfire.position;
  const goFire = () => { const a = rng() * TAU; p.teleport(fire.x + Math.cos(a) * 3.2, fire.z + Math.sin(a) * 3.2); };
  const recipes = listRecipes(CAMPFIRE.island);   // only what this fire cooks (other islands' recipes are rejected by design)
  const give = (needs, times = 1) => { for (const [id, n] of Object.entries(needs)) g.inventory.add(id, n * times); };

  const ACTIONS = actions || {
    shake() { const t = pick(live('tree', 'palm')); if (!t) return; goNear(t); g.interactions.interact(t, p); },
    chop() { const t = pick(live('tree', 'palm', 'rock')); if (!t) return; goNear(t); g.harvest.hit(t, p); },
    chopTree() { const t = pick(live('tree', 'palm')); if (!t) return; goNear(t); g.harvest.hit(t, p); },
    dig() { const s = pick(g.gathering.digSpots.filter((x) => x.state === 'ready')); if (!s) return; goNear(s.item); g.gathering.dig(s.item, p); },
    pick() { const t = pick(live('herb', 'mushroom')); if (!t) return; goNear(t); g.interactions.interact(t, p); },
    rustle() { const t = pick(live('bush')); if (!t) return; goNear(t); g.interactions.interact(t, p); },
    poke() { const t = pick(live('flower', 'rock')); if (!t) return; goNear(t); g.interactions.interact(t, p); },
    equip() { g.items.equip(pick(['axe', 'sword', 'hammer', 'shovel', 'lightsaber']), p); },
    equipTool() { g.items.equip(pick(['axe', 'shovel', 'lightsaber']), p); },
    swing() { g.items.swing(p); },
    log() { g.inventory.add('log', 1); goFire(); g.campfire.addLog(p); },
    cook() { const r = pick(recipes); give(r.needs); goFire(); g.campfire.cook(r.id, p); },
    collect() { const l = g.pickups.list; if (!l.length) return; const q = pick(l); p.teleport(q.x + 0.3, q.z + 0.3); },   // the natural walk-over magnet does the rest
    quest() { if (g.quests.active) { if (rng() < 0.5) g.quests.giveUp(); } else g.quests.start(); },
    feast() {
      if (!g.quests.active) { g.quests.start(); return; }
      give(g.quests.active.needs);
      if (!g.campfire.lit) { g.inventory.add('log', 1); goFire(); g.campfire.addLog(p); return; }
      goFire();
      g.feast.start(p);
    },
    regrow() { g.harvest.regrowNow(); g.gathering.regrowNow(); },
    fuel() { g.campfire.setFuel(pick([0, 100, 179, 181, 400, 540])); },
    time() { g.dayNight.set(rng() * 24); },
    critter() { if (rng() < 0.12) g.critters.reset(); else g.critters.feed(pick(g.critters.list).id); },   // Step 34b: the host path (force: skips the gate + bag), a replica asks the host
    camp() {                                                                                                        // Step 35a: a gift to the camp job (the host path; skips the gate + bag), now and then a jump / reset
      const r = rng();
      if (r < 0.06) g.camp.reset(); else if (r < 0.1) g.camp.setComfort(Math.floor(rng() * 4));
      else { const j = g.camp.summary().needs; if (j.length) g.camp.give(pick(j).item, 1 + Math.floor(rng() * 5)); }
    },
    garden() {                                                                                                      // Step 38b: plant / tend / take a cutting (the real requests, with debug-filled seeds and bag), now and then a night or a reset
      const gd = g.garden, api = gd.api, r = rng(), i = Math.floor(rng() * 16), flower = pick(FLOWER_IDS), plot = api.state.plots[i];
      const near = () => { const it = api.items[i]; if (it) goNear(it); };
      if (r < 0.02) { gd.grow(1); return; }
      if (r < 0.03) { api.debug.reset(); return; }
      if (r < 0.4) { if (!api.seeds.includes(flower)) gd.findSeed(flower); near(); api.request('plant', { plot: i, flower, kind: rng() < 0.3 ? 'cutting' : 'seed' }, p); }
      else if (r < 0.7) { if (plot && plot.flower) g.inventory.add(tendItemOf(plot.flower), 1); near(); api.request('tend', { plot: i }, p); }
      else if (r < 0.9) { near(); api.request('cutting', { plot: i }, p); }
      else { g.inventory.add('coconut', 1); const sp = api.spring; p.teleport(sp.x, sp.z); api.request('fill', {}, p); }
    },
    drain() { for (const e of g.inventory.all()) g.inventory.remove(e.id, Math.max(1, Math.floor(e.count * (0.5 + rng() * 0.5)))); },   // keep the bag from saturating at 99
  };
  const weights = {
    shake: 8, chop: 4, chopTree: 6, dig: 6, pick: 6, rustle: 5, poke: 2, equip: 4, equipTool: 6, swing: 1, log: 5, cook: 4, collect: 8,
    quest: 3, feast: 2, regrow: 1, fuel: 0.6, time: 0.4, drain: 1.2, critter: 0.8, camp: 1.2, garden: 2,
  };
  const table = [];
  for (const k of Object.keys(ACTIONS)) for (let i = 0; i < Math.round((weights[k] ?? 1) * 10); i++) table.push(k);
  const dts = [1 / 60, 1 / 60, 1 / 30, 0.05, 0.1, 0.16, 0.25];

  const check = () => {
    const items = g.items.list;
    const ids = items.filter((i) => !i.special).map((i) => i.id).sort((a, b) => a - b);
    if (JSON.stringify(ids) !== JSON.stringify(ordinaryIds)) problem('ordinary tool ids changed');
    if (new Set(items.map((i) => i.id)).size !== items.length) problem('duplicate tool ids');
    const holders = items.map((i) => i.holderKey).filter(Boolean);
    if (new Set(holders).size !== holders.length) problem('an actor holds two items: ' + holders.join(','));
    const pids = g.pickups.list.map((q) => q.pid);
    if (new Set(pids).size !== pids.length) problem('duplicate pickup ids: ' + pids.join(','));
    for (const e of g.inventory.all()) if (!(e.count >= 0)) problem(`negative bag count ${e.id}=${e.count}`);
    if (g.inventory.total < 0) problem('negative bag total');
  };

  try {
    for (let i = 0; i < steps; i++) {
      const name = pick(table);
      counts[name] = (counts[name] || 0) + 1;
      if (!g.feast.busy || name === 'quest') {
        try { ACTIONS[name](); } catch (err) { problem(`action ${name} threw: ${(err && err.stack) || err}`); }
      }
      const dt = pick(dts), n = 1 + Math.floor(rng() * 12);
      try { g.step(dt, n); } catch (err) { problem(`step threw: ${(err && err.stack) || err}`); }
      if (i % 5 === 0) await wait(waitMs);
      if (i % 50 === 0) check();
    }
    // settle: no more actions; let in-flight things land, events arrive and the feast (if any) end. Small steps with real-time waits.
    const settleSteps = Math.ceil((settle * 1000) / 50);
    for (let i = 0; i < settleSteps; i++) {
      g.step(0.05, 1);
      if (i % 4 === 0) await wait(Math.max(waitMs, 20));
    }
    await wait(300);
    check();
  } finally {
    console.error = origError;
    window.removeEventListener('error', onErr);
    window.removeEventListener('unhandledrejection', onErr);
  }

  return report(g, problems, counts);
}

/** Snapshot of everything that must match across tabs (and the local invariants). */
export function report(g = window.__game, problems = [], counts = {}) {
  const s = g.sync;
  return {
    role: s.role, screenId: s.screenId, status: s.status, seq: s.seq,
    hash: s.hash(), hashes: s.hashes(),
    clock: { hour: +g.dayNight.hour.toFixed(3), locked: g.dayNight.locked },
    items: g.items.list.map((i) => `${i.name}:${i.holderKey || 'ground'}`),
    pickups: g.pickups.list.length,
    bag: Object.fromEntries(g.inventory.all().map((e) => [e.id, e.count])),
    fire: { level: g.campfire.level, fuel: +g.campfire.fuel.toFixed(1) },
    quest: g.quests.summary(),
    harvestDown: g.harvest.states.filter((t) => t.state !== 'idle' && t.state !== 'growing' && t.state !== 'emerging').length,
    stats: { ...s.stats },
    actions: counts,
    problems,
  };
}
