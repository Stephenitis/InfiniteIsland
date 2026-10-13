// The boat quest's host-authoritative `boat` sync domain (PLAN Step 68a; rules in game/boatLogic.js). Skipper Marlo's wrecked outrigger at Emberleaf's cove: this module owns the state, the save, the
// unlock on the first Emberleaf feast and the requests; world/cove.js (the dressing), world/marlo.js (the otter) and world/hopCourses.js (the courses) read it.
//
//   const boat = createBoat({ sync, hud, sfx, params })
//   boat.state                       the live state (see boatLogic.js); never mutate it from outside
//   boat.unlocked / boat.has(part)   shortcuts
//   boat.setGoals({ planks: {x, z, top} })  host checks every taker at goal top and within 2.2 u (remote pose slack 0.15 u)
//   boat.take(player, part)          ask the host to take a part (host: the answer now, replica: a Promise of it): { ok, reason? }
//   boat.on(fn)                      fn({ kind: 'unlock' | 'take' | 'set', live, part?, actor? }) on every screen after the state changed; live = a real event (not a load / snapshot / debug set)
//   boat.onFeastEnd({ n, fireId }) / boat.bannerNode(n) / boat.bannerHold(n)    the feast scene's reveal api: feast.addReveal('ember', boat). Host only, idempotent per feast number, never for free feasts
//   boat.debug                       { summary(), unlock(), take(part), reset() }  (main.js adds goto())
//
// Unlock: the FIRST feast held at the Emberleaf garden hearth sets `unlocked` (banner line "A foghorn echoes from the far shore..."). Old saves that already feasted there cannot be told apart exactly, so a save
// with ANY unlocked garland (emberleaf.v1.garlands) counts as unlocked. `?testboat` = unlocked without saving; `?bridges=open` does NOT unlock it.
// Save: the `boat` key of infinite-island.emberleaf.v1 (game/emberSave.js), host only; a replica starts fresh and waits for the snapshot.
import { BOAT } from '../config.js';
import { emberSave } from '../game/emberSave.js';
import { freshBoat, normaliseBoat, boatHashView, unlockedFromGarlands, unlockOnFeast, validateTake, applyTake, PARTS, atBoatGoal } from '../game/boatLogic.js';

export function createBoat({ sync, hud = null, sfx = null, params = new URLSearchParams() }) {
  const testboat = params.has('testboat');
  const saveOn = !testboat && sync.isHost;
  let state = freshBoat();
  if (sync.isHost) {
    const file = emberSave.read();
    state = file.boat !== undefined ? normaliseBoat(file.boat) : freshBoat();
    if (file.boat === undefined && unlockedFromGarlands(file.garlands)) state.unlocked = true;      // the old-save migration (see the header)
    if (testboat) state.unlocked = true;
  }
  const listeners = [];
  const goals = {};
  let evaluatedFeast = 0;
  let reveal = null;                                // { n } the latest unlock (a banner built after it still fills)
  const bannerNodes = new Map();                    // feast n -> [DOM nodes waiting for the result]
  const save = () => { if (saveOn) emberSave.set('boat', JSON.parse(JSON.stringify(state))); };
  const fire = (info) => { for (const fn of listeners) { try { fn(info); } catch (e) { console.error(e); } } };
  const actorInfo = (a) => (a ? { screen: a.screen, index: a.index } : null);

  // ---- applying (every screen)
  function applyUnlock(n, live) {
    const changed = !state.unlocked;
    state.unlocked = true;
    if (live) {
      reveal = { n };
      for (const node of bannerNodes.get(n) || []) fillNode(node);
      if (sfx) sfx.play('foghorn', { vol: 0.8 });
      if (hud && changed) hud.toast(BOAT.unlockText, { icon: 'sparkle', duration: 4200 });
    }
    if (changed) fire({ kind: 'unlock', live });
  }
  function applyTaken(part, actor, live) {
    if (!applyTake(state, part)) return;
    fire({ kind: 'take', part, actor, live });
  }
  function replace(next, live = false) {
    state = normaliseBoat(next);
    fire({ kind: 'set', live });
  }

  // ---- requests (host)
  function handleTake(d, actor, debug = false) {
    const part = d && d.part;
    if (!actor && !debug) return { reject: 'bad-request' };
    const goal = goals[part];
    const remote = !!actor && actor.screen !== 'host';
    const dist = !debug && actor?.pos && goal ? Math.hypot(actor.pos.x - goal.x, actor.pos.z - goal.z) : null;
    const v = validateTake(state, { part, dist, range: BOAT.reach, debug });
    if (!v.ok) return { reject: v.reason };
    if (!debug && !atBoatGoal(actor?.pos, goal, remote ? 0.15 : 0)) return { reject: 'far' };
    applyTaken(part, actorInfo(actor), true);
    save();
    sync.emit('boat', 'take', { part, actor: actorInfo(actor) });
    return { result: { part } };
  }
  function handleUnlock() {
    if (state.unlocked) return true;
    applyUnlock(0, true);
    save();
    sync.emit('boat', 'unlock', { n: 0 });
    return true;
  }
  function handleReset() {
    replace(freshBoat());
    save();
    sync.emit('boat', 'set', { state: JSON.parse(JSON.stringify(state)) });
    return true;
  }

  sync.register('boat', {
    snapshot: () => JSON.parse(JSON.stringify(state)),
    hashView: () => boatHashView(state),
    applySnapshot(snap) { replace(snap, false); },
    applyEvent(kind, d) {
      if (kind === 'unlock') applyUnlock(d && Number.isInteger(d.n) ? d.n : 0, true);
      else if (kind === 'take' && d) applyTaken(d.part, d.actor || null, true);
      else if (kind === 'set') replace(d && d.state, false);
    },
    handleRequest(kind, d, actor) {
      if (kind === 'take') return handleTake(d, actor);
      if (!actor || actor.screen !== 'host') return { reject: 'bad-request' };      // the debug requests are host only
      if (kind === 'debugTake') return handleTake(d, actor, true);
      if (kind === 'debugUnlock') return handleUnlock();
      if (kind === 'debugReset') return handleReset();
      return { reject: 'unknown-kind' };
    },
  });

  // ---- the feast reveal (feast.addReveal('ember', boat))
  function onFeastEnd({ n, fireId } = {}) {
    if (!sync.isHost || fireId !== 'ember' || !Number.isInteger(n) || n <= evaluatedFeast) return false;
    const r = unlockOnFeast(state, { n, free: false, last: evaluatedFeast });
    evaluatedFeast = n;
    if (!r.changed) return false;
    state.unlocked = false;                          // (applyUnlock flips it and fires, so the listeners see a change)
    applyUnlock(n, true);
    save();
    sync.emit('boat', 'unlock', { n });
    return true;
  }
  function fillNode(node) {
    node.innerHTML = '';
    const chip = document.createElement('div');
    chip.className = 'fb-hat fb-boat-line';
    chip.innerHTML = `<span>${BOAT.unlockText}</span>`;
    node.appendChild(chip);
    node.style.display = '';
  }
  const bannerHold = (n) => (reveal && reveal.n === n ? 1.0 : 0);
  function bannerNode(n) {
    const node = document.createElement('div');
    node.className = 'fb-boat';
    node.style.display = 'none';
    if (reveal && reveal.n === n) fillNode(node);
    else { const l = bannerNodes.get(n) || []; l.push(node); bannerNodes.set(n, l); if (bannerNodes.size > 4) bannerNodes.delete(bannerNodes.keys().next().value); }
    return node;
  }

  const hostActor = () => (sync.isHost ? { screen: 'host', index: 0, pos: { x: 0, y: 0, z: 0 } } : null);
  const summary = () => ({ unlocked: state.unlocked, parts: { ...state.parts }, planks: state.planks, seams: [...state.seams], sights: [...state.sights], floated: state.floated, launched: state.launched, testboat, evaluatedFeast });

  return {
    get state() { return state; },
    get unlocked() { return state.unlocked; },
    has: (part) => !!state.parts[part],
    setGoals(g) { Object.assign(goals, g); },
    take(player, part) {
      const r = sync.request('boat', 'take', { part }, player ? sync.actorFor(player) : null);
      const arm = (res) => { if (res?.ok && part === 'sail' && player) {
        player._sailGlideArmed = true;
        if (player._cb) player._cb.glide = true;
      } return res; };
      return r?.then ? r.then(arm) : arm(r);
    },
    on(fn) { listeners.push(fn); },
    onFeastEnd, bannerNode, bannerHold,
    summary,
    debug: {
      summary,
      unlock: () => sync.request('boat', 'debugUnlock', {}, hostActor()),
      take: (part) => sync.request('boat', 'debugTake', { part }, hostActor()),
      reset: () => sync.request('boat', 'debugReset', {}, hostActor()),
      parts: PARTS,
    },
  };
}
