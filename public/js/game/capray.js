// Step 73b: the host-authoritative `capray` sync domain: Capray's quest line "The Little Lantern" (sighting, three Glimmerfin offerings, the shade moss + spore showers on three titans, the Lanternkoi,
// the befriend scene). Independent of rendering and of the world (Node pair tests); the screens' side is world/caprayWorld.js, the pure rules are game/caprayLogic.js, the places world/islands/duskCapray.js.
//
//   const capray = createCapray({ sync, plan, inventory?, fishing?, pets?, cinematic?, heldKind?, positions?, params? })
//     plan = duskCaprayPlan()             pets = the `pets` unlock domain (game/petsDomain.js): the host unlocks 'capray' when the befriend scene ends / is skipped
//     heldKind(actorKey) -> 'axe' | ...   the kind the actor holds (items.heldByKey): moss is cleared by an axe, sword or lightsaber
//     positions() -> [{ key, x, z }]      where every player is (local + remote), to find the LEADER (the player the ray follows): a shake is accepted while the leader is near the titan
//   capray.state                          { stage, fed, moss, spores, hits, leader, scene } (see caprayLogic.js)      capray.stage
//   capray.sight(p) / feed(p, fish) / hit(p, i) / shake(p, i)   ask the host (host: the answer now, replica: a Promise): { ok } | { reject }
//   capray.skip()                         any screen: end the befriend scene everywhere
//   capray.update()                       once per tick (host only): starts the queued scene behind every cinematic, finishes it at start + CAPRAY.scene.end
//   capray.on(fn)                         fn(kind, detail) on EVERY screen (host too): 'sight' | 'feed' {fish} | 'hit' {i, final} | 'shake' {i} | 'leader' | 'start' | 'finish' | 'skip' | 'set' | 'reset' | 'snapshot'
//   capray.rareBoost                      the extra Lanternkoi chance (stage 4 pity) the fishing roll adds (host)       capray.leaderPos() -> {x, z} | null
//   capray.debug.{ stage(n), feed(), clear(i), shake(i), befriend(), reset() }   host debug requests
//
// Requests: sight {} | feed {fish} | hit {i} | shake {i} | skip {} | host-only debug {op, ...}. Every event carries the whole new state, so a replica can never drift. Snapshot = the state;
// hashView = state incl. hits / leader / scene. Saved by the host as the `capray` key of 'infinite-island.duskcrown.v1' ({ stage, fed, moss, spores, leader }; hits and the scene are session-only);
// ?testcapray starts at no progress and never writes. A feed removes ONE fish from the shared bag (inventory.remove) BEFORE the event. Rejections: bad-request | seen | unseen | gone | full | wrong-fish |
// none | far | locked | cleared | no-tool | smothered | done | leader-far | busy | idle | not-host. A shake rejected as 'leader-far' by a player who IS at the titan makes that player the leader
// (the ray follows who last engaged it), so a second player can never be stuck behind the first.
import { CAPRAY, FISHING } from '../config.js';
import { actorKey } from '../net/worldSync.js';
import { duskSave } from './duskSave.js';
import { edgeDistance } from './fishingLogic.js';
import {
  freshState, normaliseState, savedView, hashView, debugState, validateSight, validateFeed, validateHit, validateShake,
  applySight, applyFeed, applyHit, applyShake, withLeader, rareBoost as boostOf, needOf,
} from './caprayLogic.js';

export const SAVE_KEY = 'capray';
const wire = (s) => ({ stage: s.stage, fed: s.fed, moss: [...s.moss], spores: [...s.spores], hits: [...s.hits], leader: s.leader, scene: { ...s.scene } });
const HOST_ACTOR = { screen: 'host', index: 0, pos: { x: 0, y: 0, z: 0 } };

export function createCapray({ sync, plan, inventory = null, fishing = null, pets = null, cinematic = null, heldKind = () => null, positions = () => [], params = new URLSearchParams() }) {
  const testcapray = params.has('testcapray');
  const saveOn = !testcapray && sync.isHost;
  let state = freshState();
  if (sync.isHost && !testcapray) state = normaliseState(duskSave.read()[SAVE_KEY]);
  let pity = 0;                                                         // host only, session-only: Glimmerfin caught during stage 4
  const listeners = [];
  const fire = (kind, detail) => listeners.forEach((fn) => { try { fn(kind, detail || {}, state); } catch (e) { console.error(e); } });
  const save = () => { if (saveOn) duskSave.set(SAVE_KEY, savedView(state)); };
  const keyOf = (actor) => (actor ? actorKey(actor) : null);
  const titan = (i) => plan.titans[i];
  const pondEdge = (pos) => edgeDistance(plan.pond, pos.x, pos.z);
  const surface = (pos, t) => Math.hypot(pos.x - t.x, pos.z - t.z) - t.collR;
  const remote = (actor) => !!actor && actor.screen !== 'host' && !!actor.pos;
  const posOfKey = (key) => positions().find((p) => p.key === key) || null;

  function commit(next, kind, detail) {
    const was = state.stage;
    state = normaliseState(next);
    if (was === 4 && state.stage !== 4) pity = 0;
    save();
    sync.emit('capray', kind, { ...detail, state: wire(state) });
    fire(kind, detail);
  }

  function handleRequest(kind, d, actor) {
    if (!sync.isHost) return { reject: 'not-host' };
    const key = keyOf(actor);
    if (kind === 'sight') {
      const bad = validateSight({ state, dist: remote(actor) ? pondEdge(actor.pos) : null, range: CAPRAY.sight + CAPRAY.remoteSlack + 1.5 });
      if (bad) return { reject: bad };
      commit(applySight(state), 'sight', { actor: key });
      return true;
    }
    if (kind === 'feed') {
      const fish = d?.fish;
      const bad = validateFeed({ state, fish, have: inventory ? inventory.count(fish) : 0, dist: remote(actor) ? pondEdge(actor.pos) : null });
      if (bad) return { reject: bad };
      if (inventory) inventory.remove(fish, 1);
      commit(applyFeed(state, fish, key), 'feed', { fish, actor: key });
      return true;
    }
    if (kind === 'hit') {
      const i = Number(d?.i), t = titan(i);
      const bad = validateHit({ state, i, tool: heldKind(key), dist: remote(actor) && t ? surface(actor.pos, t) : null });
      if (bad) return { reject: bad };
      const r = applyHit(state, i, key);
      commit(r.state, 'hit', { i, final: r.final, actor: key });
      return true;
    }
    if (kind === 'shake') {
      const i = Number(d?.i), t = titan(i);
      const lead = state.leader ? posOfKey(state.leader) : null;
      const actorDist = remote(actor) && t ? surface(actor.pos, t) : null;
      const bad = validateShake({ state, i, actorDist, leaderDist: t && lead ? surface(lead, t) : null });
      if (bad === 'leader-far' && t && key && state.leader !== key) {
        const here = actor?.pos && surface(actor.pos, t) <= CAPRAY.shakeActorReach + CAPRAY.hitSlack;
        if (here || !remote(actor)) commit(withLeader(state, key), 'leader', { actor: key });
      }
      if (bad) return { reject: bad };
      commit(applyShake(state, i, key), 'shake', { i, actor: key });
      return true;
    }
    if (kind === 'skip') return finish('skip') || { reject: 'idle' };
    if (kind === 'debug') return debug(d || {}, actor);
    return { reject: 'unknown-kind' };
  }

  function debug(d, actor) {
    if (!actor || actor.screen !== 'host') return { reject: 'bad-request' };
    const op = d.op, i = Number(d.i);
    if (op === 'stage') { commit(debugState(d.n), 'set', {}); return true; }
    if (op === 'reset') { commit(freshState(), 'reset', {}); return true; }
    if (op === 'feed') {
      const fish = needOf(state);
      if (!fish) return { reject: 'full' };
      commit(applyFeed(state, fish, HOST_KEY), 'feed', { fish, actor: HOST_KEY });
      return true;
    }
    if (op === 'clear') {
      if (state.stage !== 3 || !(i >= 0 && i < 3)) return { reject: 'locked' };
      if (state.moss[i]) return { reject: 'cleared' };
      let s = state, final = false;
      while (!final) { const r = applyHit(s, i, HOST_KEY); s = r.state; final = r.final; }
      commit(s, 'hit', { i, final: true, actor: HOST_KEY });
      return true;
    }
    if (op === 'shake') {
      if (state.stage !== 3 || !(i >= 0 && i < 3)) return { reject: 'locked' };
      let s = state;
      if (!s.moss[i]) { let final = false; while (!final) { const r = applyHit(s, i, HOST_KEY); s = r.state; final = r.final; } }
      if (s.spores[i]) return { reject: 'done' };
      commit(applyShake(s, i, HOST_KEY), 'shake', { i, actor: HOST_KEY });
      return true;
    }
    if (op === 'befriend') {
      if (state.stage < 4) commit(debugState(4), 'set', {});
      if (state.stage === 4) commit(applyFeed(state, 'lanternkoi', HOST_KEY), 'feed', { fish: 'lanternkoi', actor: HOST_KEY });
      return true;
    }
    return { reject: 'unknown-kind' };
  }
  const HOST_KEY = 'host:0';

  function finish(kind = 'finish') {
    if (state.scene.startAt === null && !state.scene.queued) return false;
    commit({ ...state, scene: { queued: false, startAt: null } }, kind, {});
    if (pets) pets.unlock('capray');                              // (after our own event: the screens' "Bring Capray along?" waits for the scene to end anyway)
    return true;
  }

  sync.register('capray', {
    snapshot: () => wire(state),
    hashView: () => hashView(state),
    applySnapshot(s) { state = normaliseState(s); fire('snapshot'); },
    applyEvent(kind, d) { if (d && d.state) { state = normaliseState(d.state); fire(kind, d); } },
    handleRequest,
    screenLeft(screenId) {                                         // a screen stayed away: the ray stops following its player
      if (state.leader && state.leader.startsWith(`${screenId}:`)) commit(withLeader(state, null), 'leader', {});
    },
  });

  if (fishing) fishing.on((kind, d) => { if (sync.isHost && kind === 'catch' && state.stage === 4 && d?.fish === 'glimmerfin') pity++; });

  const ask = (kind, data, p) => sync.request('capray', kind, data, p ? sync.actorFor(p) : null);
  const hostReq = (kind, data) => sync.request('capray', kind, data, sync.isHost ? { ...HOST_ACTOR } : null);

  return {
    get state() { return state; },
    get stage() { return state.stage; },
    get pity() { return pity; },
    get testcapray() { return testcapray; },
    get rareBoost() { return sync.isHost ? boostOf(state.stage, pity, FISHING.rareChance) : 0; },
    on(fn) { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); },
    now: () => sync.hostNow(),
    sight: (p) => ask('sight', {}, p),
    feed: (p, fish) => ask('feed', { fish }, p),
    hit: (p, i) => ask('hit', { i }, p),
    shake: (p, i) => ask('shake', { i }, p),
    skip: () => sync.request('capray', 'skip', {}),
    leaderPos() { const p = state.leader ? posOfKey(state.leader) : null; return p ? { x: p.x, z: p.z } : null; },
    update() {
      if (!sync.isHost) return;
      const sc = state.scene;
      if (state.stage === 5 && sc.queued && sc.startAt === null && !(cinematic && cinematic.busy)) {
        commit({ ...state, scene: { queued: false, startAt: sync.hostNow() + CAPRAY.scene.preStart } }, 'start', {});
      } else if (sc.startAt !== null && sync.hostNow() >= sc.startAt + CAPRAY.scene.end * 1000) finish('finish');
      else if (state.stage === 5 && !sc.queued && sc.startAt === null && pets && !pets.has('capray') && !testcapray) pets.unlock('capray');   // recovery: the host reloaded mid-scene
    },
    debug: {
      stage: (n) => hostReq('debug', { op: 'stage', n }),
      feed: () => hostReq('debug', { op: 'feed' }),
      clear: (i) => hostReq('debug', { op: 'clear', i }),
      shake: (i) => hostReq('debug', { op: 'shake', i }),
      befriend: () => hostReq('debug', { op: 'befriend' }),
      reset: () => hostReq('debug', { op: 'reset' }),
    },
    summary: () => ({ ...wire(state), pity, saved: saveOn, testcapray, pond: plan.pond.id, titans: plan.titans.map((t) => t.id), rareBoost: sync.isHost ? boostOf(state.stage, pity, FISHING.rareChance) : null }),
  };
}
