// Step 71: the host-authoritative, session-only `boatSail` sync domain: the crossing between the Emberleaf dock and the Duskcrown dock. Independent of rendering (Node pair tests);
// the camera, crew and hull live in boatSailScene.js. Where the boat IS and whether Duskcrown was reached are the `boat` domain's (world/boat.js: `at`, `discovered`, saved).
//
//   const sail = createBoatSail({ sync, boat, cinematic, busy, docks })
//   sail.request(to, player)     'ember' | 'duskcrown': ask the host to sail the WHOLE roster there (host: the answer now, replica: a Promise): { ok } | { reject: reason }
//   sail.skip()                  any screen: end the crossing everywhere (the boat arrives at once)
//   sail.update()                once per tick (host only): finishes the crossing at start + SAIL.end
//   sail.state                   { startAt, to, from, first }  startAt = host milliseconds, null while idle      sail.now() = host milliseconds
//   sail.on(fn)                  fn(kind, state, detail) with kind 'start' | 'finish' | 'skip' | 'cancel' | 'snapshot'; detail = { to, first } of the crossing (also on finish / skip, when state is already idle)
//   sail.debug(to)               host only: start a crossing now, ignoring distance and the dock side (still not while another cinematic runs)
// The host gate (sailRule): launched boat, the OTHER dock, nobody on a cinematic / feast / combat run / storybook page (`busy()`), and the asker within SAIL.dock u of the dock the boat is at
// (remote poses included). A start carries host milliseconds + SAIL.preStart; every screen starts its own scene from that clock. The finish moves the boat (boat.completeSail: saved, event
// 'sailed') BEFORE the domain event, so every screen's `boat.state.at` is already the destination when its crew steps ashore.
import { SAIL } from '../config.js';
import { sailRule, otherIsland } from './boatSailLogic.js';

export function createBoatSail({ sync, boat, cinematic, busy = () => false, docks }) {
  let state = { startAt: null, to: null, from: null, first: false };
  const listeners = [];
  const fire = (kind, detail) => listeners.forEach((fn) => { try { fn(kind, state, detail); } catch (e) { console.error(e); } });
  function apply(kind, d) {
    const detail = { to: d?.to === 'ember' || d?.to === 'duskcrown' ? d.to : null, first: d?.first === true };
    if (kind === 'start' || kind === 'snapshot') state = Number.isFinite(d?.startAt) && detail.to ? { startAt: d.startAt, to: detail.to, from: otherIsland(detail.to), first: detail.first } : { startAt: null, to: null, from: null, first: false };
    else state = { startAt: null, to: null, from: null, first: false };
    fire(kind, detail);
  }
  const publish = (kind, d) => { apply(kind, d); sync.emit('boatSail', kind, d); };
  function finish(kind = 'finish') {
    if (state.startAt === null) return false;
    const to = state.to, first = state.first;
    boat.completeSail(to);
    publish(kind, { to, first });
    return true;
  }
  function begin(to, actor, debug) {
    const reason = sailRule(boat.state, { to, pos: actor?.pos, dock: docks[boat.state.at], busy: state.startAt !== null || cinematic.busy || (!debug && busy()), debug });
    if (reason) return { reject: reason };
    publish('start', { startAt: sync.hostNow() + SAIL.preStart, to, first: to === 'duskcrown' && !boat.state.discovered });
    return true;
  }
  sync.register('boatSail', {
    snapshot: () => ({ ...state }),
    hashView: () => ({ ...state }),
    applySnapshot: (d) => apply('snapshot', d || {}),
    applyEvent: (kind, d) => apply(kind, d),
    handleRequest(kind, d, actor) {
      if (kind === 'skip') return finish('skip') || { reject: 'idle' };
      if (kind === 'sail') return begin(d?.to, actor, false);
      if (kind === 'debugSail') return actor?.screen === 'host' ? begin(d?.to, actor, true) : { reject: 'bad-request' };
      return { reject: 'unknown-kind' };
    },
  });
  // a debug reset of the boat (or a hand-edited state) while a crossing is running: drop it
  boat.on((info) => { if (info.kind === 'set' && sync.isHost && state.startAt !== null && !boat.state.launched) publish('cancel', {}); });
  return {
    get state() { return state; },
    now: () => sync.hostNow(),
    on(fn) { listeners.push(fn); },
    request: (to, p) => sync.request('boatSail', 'sail', { to }, p ? sync.actorFor(p) : null),
    skip: () => sync.request('boatSail', 'skip'),
    debug: (to) => sync.request('boatSail', 'debugSail', { to }, sync.isHost ? { screen: 'host', index: 0, pos: { x: 0, y: 0, z: 0 } } : null),
    update() { if (sync.isHost && state.startAt !== null && sync.hostNow() >= state.startAt + SAIL.end * 1000) finish('finish'); },
  };
}
