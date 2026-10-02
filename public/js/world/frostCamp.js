// The Frostpine camp's comfort and jobs (PLAN Step 35a): the Frostpine Fire Spirit's short quest line. Players bring building materials (Frostpine's pine / birch logs, stone, pinecones,
// lingonberries, crystals, snow truffles) from the shared bag; each finished job raises the camp's comfort by one (0..3). 35b draws the structures; this file is the rules, the
// sync, the save and a clean hook for it. The menu is game/campMenu.js; the pure rules are game/campJobs.js (Node-tested).
//
//   const camp = createFrostCamp({ players, critters, inventory, sync, campfires, dialog, hud, particles, sfx, floatLabel })     once at load, on every screen
//   camp.update(dt)                       once per tick (delayed spirit lines)
//   camp.state / camp.comfort             { comfort, job, given } and just the comfort level 0..3
//   camp.job                              the job being worked on (config CAMP_JOBS entry) or null when the camp is finished
//   camp.needs() / camp.progress()        [{ item, need, given, left }] of the current job / { done, comfort, max, job, total, given }
//   camp.open                             at least one critter lives at the camp (the gate for gifts; the menu reads it too)
//   camp.give(player, item, n)            what the menu does: a request; host -> { ok, result } now, replica -> Promise of it
//   camp.onStage(fn, { replay = true })   35b HOOK. fn(comfort, { live }) runs on EVERY screen (a) when a job completes: live = true (play the build moment for that comfort level:
//                                         comfort - 1 -> comfort), and (b) whenever the comfort changes silently (late join snapshot, debug set / reset): live = false (just SHOW the
//                                         structures of that level). With `replay` the handler is also called ONCE right away with the current comfort and live = false, so a module that
//                                         registers at load shows the right camp on load. Returns an unsubscribe function.
//   camp.on('change', fn)                 any change of the state (a gift, a stage, a snapshot)
//   camp.summary()                        debug snapshot;  camp.debug.{ give(item, n), setComfort(n), reset() }
//
// Domain 'frostCamp' (host-authoritative; separate from the 'critters' domain, but saved in the same file: `camp` key of 'infinite-island.frostpine.v1', game/frostSave.js, so the
// critters' key is never clobbered). State { comfort, job, given: { itemId: n } }. ?newgame wipes it; replicas never save.
//   Request give {item, n}   (any screen): the HOST checks the gate (>= 1 critter lives at the camp), that the current job still wants the item, clamps n to what is still needed and
//                            what the shared bag holds, removes it (inventory.remove), updates the state, saves and emits `gave`. The host serialises requests, so two screens racing
//                            can never overspend or drive the bag negative. Rejects: locked | done | not-needed | none | far | bad-request.
//   Event gave {item, n, state, completed, comfort, actor}   every screen (host included): floating "-5 Pine Logs", a sparkle at the fire, and on completion the stage (toast, flare,
//                            the spirit's line, onStage handlers with live = true). A replica waits for the event: no optimistic visuals.
//   Event set {state}        debug: replace the state silently.
//   Snapshot = the state; hashView = the state.
import { CAMP_JOBS } from '../config.js';
import { getItem, itemName } from '../game/catalog.js';
import { frostSave } from '../game/frostSave.js';
import { freshState, currentJob, remainingNeeds, progress, validateGive, applyGive, normaliseState, readSave, buildSave, hashView } from '../game/campJobs.js';

const FIRE_ID = 'frost';
const REMOTE_RANGE = 12;               // the host accepts a REMOTE gift from this far from the fire (they talk from the menu range; latency slack)
const LINE_DELAY = 2.6;                // s between the "cozier" toast and the spirit's line

// What the Frostpine Fire Spirit says when a job is done (index = the new comfort - 1)
export const STAGE_LINES = [
  'Ooh, a windbreak and proper benches! My flames hardly flicker now. Thank you, little campers!',
  'Cozy dens and shiny lanterns! Look how snug everyone looks. You are wonderful!',
  'A whole grove shelter! This is the cosiest camp in all of Frostpine. I could glow forever!',
];

export function createFrostCamp({ players, critters, inventory, sync, campfires, dialog = null, hud, particles, sfx = null, floatLabel = null, jobs = CAMP_JOBS }) {
  const snd = (name, opts) => { if (sfx) sfx.play(name, opts); };
  const fire = () => (campfires && campfires.get ? campfires.get(FIRE_ID) : null);
  const handlers = { stage: new Set(), change: new Set() };
  let state = readSave(frostSave.read(), jobs);
  let clock = 0;
  const timers = [];
  const later = (seconds, fn) => timers.push({ at: clock + seconds, fn });
  const save = () => frostSave.set('camp', buildSave(state));
  const emitChange = () => { for (const fn of [...handlers.change]) { try { fn(state); } catch (e) { console.error(e); } } };
  const fireStage = (live) => { for (const fn of [...handlers.stage]) { try { fn(state.comfort, { live }); } catch (e) { console.error(e); } } };
  const localPlayerOf = (actor) => (actor && actor.screen === sync.screenId && players.get ? players.get(actor.index) : null);
  const firePoint = (up = 1.2) => { const f = fire(); return f ? { x: f.position.x, y: f.topY + up, z: f.position.z } : null; };
  const open = () => critters.count >= 1;
  const refreshMenu = () => { const f = fire(); if (dialog && f && dialog.isOpen && dialog.menuId === f.menuId) dialog.refresh(); };   // (the camp fire's menu shows progress)

  // ---------------------------------------------------------------- a gift (host decides, every screen shows)
  function stageUp(d) {
    const c = d.comfort;
    if (hud) hud.toast(`The camp is cozier! (Comfort ${c} / ${jobs.length})`, { icon: 'camp', duration: 4200 });
    const f = fire(), p = firePoint(0.6);
    if (f) f.flare();
    if (p && particles) {
      particles.burst('sparkle', { x: p.x, y: p.y + 0.8, z: p.z }, { count: 14, radius: 1.8, height: 0.9 });
      particles.burst('puff', { x: p.x, y: p.y - 0.4, z: p.z }, { count: 12, radius: 2.4, ring: true, height: 0.3, speed: 1.2 });
    }
    snd('jingle', { pitch: 1.1, vol: 0.6 });
    const line = STAGE_LINES[Math.min(STAGE_LINES.length, c) - 1];
    if (line && hud) later(LINE_DELAY, () => hud.toast(`Fire Spirit: "${line}"`, { icon: 'flame', duration: 5200 }));
    fireStage(true);
  }

  function applyGave(d) {
    state = normaliseState(d.state, jobs);
    save();
    const by = localPlayerOf(d.actor), p = firePoint(1.6), def = getItem(d.item);
    if (floatLabel && p && d.n > 0 && def) floatLabel(`-${d.n} ${itemName(d.item, d.n)}`, p, by, def.icon);
    if (particles && p && !d.completed) particles.burst('sparkle', { x: p.x, y: p.y - 0.4, z: p.z }, { count: 5, radius: 0.6, height: 0.5 });
    snd('equip', { pitch: 1.0 + 0.04 * Math.min(5, d.n), vol: 0.7 });
    if (d.completed) stageUp(d);
    emitChange();
    refreshMenu();
  }

  function handleGive(d, actor, debug = false) {
    if (!d || (!actor && !debug)) return { reject: 'bad-request' };
    if (!debug && actor.screen !== 'host') {
      const f = fire();
      if (f && actor.pos && Math.hypot(actor.pos.x - f.position.x, actor.pos.z - f.position.z) > REMOTE_RANGE) return { reject: 'far' };
    }
    const item = d.item;
    const v = validateGive({ critters: debug ? 99 : critters.count, state, item, n: d.n, have: debug ? 999 : inventory.count(item), jobs });
    if (!v.ok) return { reject: v.reason };
    if (!debug && !inventory.remove(item, v.n)) return { reject: 'none' };
    const r = applyGive(state, item, v.n, jobs);
    const data = { item, n: v.n, state: r.state, completed: r.completed, comfort: r.comfort, actor: actor ? { screen: actor.screen, index: actor.index } : null };
    applyGave(data);                                   // (saves)
    sync.emit('frostCamp', 'gave', data);
    return { result: { item, n: v.n, completed: r.completed, comfort: r.comfort, state: r.state } };
  }

  /** Replace the state with no fanfare (debug, snapshot). Handlers hear it as live = false when the comfort changed. */
  function showSilently(next) {
    const was = state.comfort;
    state = normaliseState(next, jobs);
    if (state.comfort !== was) fireStage(false);
    emitChange();
    refreshMenu();
  }

  function handleSet(d) {
    showSilently(d && d.state);                        // (assigns the state and tells the stage handlers, live = false)
    save();
    sync.emit('frostCamp', 'set', { state });
    return true;
  }

  sync.register('frostCamp', {
    snapshot: () => JSON.parse(JSON.stringify(state)),
    hashView: () => hashView(state),
    applySnapshot(s) { showSilently(s); },
    applyEvent(kind, d) {
      if (kind === 'gave') applyGave(d);
      else if (kind === 'set') showSilently(d && d.state);
    },
    handleRequest(kind, d, actor) {
      if (kind === 'give') return handleGive(d, actor);
      if (kind === 'debugGive') return handleGive(d, actor, true);
      if (kind === 'debugSet') return handleSet(d);
      return { reject: 'unknown-kind' };
    },
  });

  const hostActor = () => (sync.isHost ? { screen: 'host', index: 0, pos: { x: 0, y: 0, z: 0 } } : null);

  function summary() {
    return { ...JSON.parse(JSON.stringify(state)), jobId: (currentJob(state, jobs) || {}).id || null, open: open(), critters: critters.count, needs: remainingNeeds(state, jobs), progress: progress(state, jobs) };
  }

  return {
    update(dt) {
      clock += dt;
      const due = timers.filter((t) => clock >= t.at).sort((a, b) => a.at - b.at);
      for (const t of due) { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); try { t.fn(); } catch (e) { console.error(e); } }
    },
    get state() { return state; },
    get comfort() { return state.comfort; },
    get job() { return currentJob(state, jobs); },
    get open() { return open(); },
    jobs,
    needs: () => remainingNeeds(state, jobs),
    progress: () => progress(state, jobs),
    give(player, item, n) { return sync.request('frostCamp', 'give', { item, n }, player ? sync.actorFor(player) : null); },
    onStage(fn, { replay = true } = {}) {
      handlers.stage.add(fn);
      if (replay) { try { fn(state.comfort, { live: false }); } catch (e) { console.error(e); } }
      return () => handlers.stage.delete(fn);
    },
    on(type, fn) { (handlers[type] ||= new Set()).add(fn); return () => handlers[type].delete(fn); },
    summary,
    debug: {
      /** Add n of an item from nothing (skips the gate and the bag, but takes the normal host path: clamping, events, stages). */
      give: (item, n = 1) => sync.request('frostCamp', 'debugGive', { item, n }, hostActor()),
      /** Jump to a comfort level silently (empty job progress), on every screen, saved. */
      setComfort: (n = 0) => sync.request('frostCamp', 'debugSet', { state: { comfort: Math.max(0, Math.min(jobs.length, Math.floor(Number(n)) || 0)), given: {} } }, hostActor()),
      reset: () => sync.request('frostCamp', 'debugSet', { state: freshState() }, hostActor()),
    },
  };
}
