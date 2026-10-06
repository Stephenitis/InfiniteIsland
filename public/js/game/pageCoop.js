// Friends in a storybook page (Step 51), the RUNTIME half: the host-decided pops of dandelion puffs, friend lifts and tosses, and what every screen does when one happens. The rules are PURE
// (game/pageCoopLogic.js, Node-tested); the bodies live in game/pagePlayers.js; game/storybook.js owns the `storybook` sync domain and routes these kinds here.
//
//   const coop = createPageCoop({ sync, players, avatars, getPage, getPagePlayers, keyOf, playerOfKey, inBook, particles, sfx, hud })
//   coop.handles(kind) / coop.handleRequest(kind, data, actor)   HOST: pop { target, by } | lift { target } | toss { mode, face } | wriggle {}  (keys are "screen:index") -> true | { reject }
//   coop.applyEvent(kind, data)    every screen: 'pop' { target, by, x, y } (tile coordinates of the friend: the puffed player reappears there), 'lift' { by, target },
//                                  'toss' { by, target, x, y, vx, vy, mode, lock, wriggle } (the carried player's OWN screen gives its body the launch)
//   coop.lifts                     { carrierKey: carriedKey } (host-owned, part of the storybook snapshot and hash)       coop.carrierOf(key) / coop.posOf(key) { x, y } tile
//   coop.update(dt)                host: a carrier or carried player that vanished / puffed puts the other down safely      coop.pin()   after the avatars moved: carried avatars ride the carrier's head
//   coop.reset() / snapshot() / loadSnapshot(s) / hashView() / summary()
// A puff is per player on its own screen (shown to others by the pose flag); popping is a request through the host so both screens agree, and the host never pops the same puff twice within a second.
import { worldToPage, pageToWorld, PAGE } from './storybookLogic.js';
import { actorKey } from '../net/worldSync.js';
import { PAGE_MP as MP } from '../config.js';
import { validatePop, validateLift, validateToss, tossLaunch, wriggleLaunch, carriedBy, liftsView } from './pageCoopLogic.js';
import * as THREE from 'three';

const KINDS = new Set(['pop', 'lift', 'toss', 'wriggle']);
const refOf = (key) => { const i = key.lastIndexOf(':'); return { screen: key.slice(0, i), index: Number(key.slice(i + 1)) }; };

export function createPageCoop({ sync, players, avatars, getPage, getPagePlayers, keyOf, playerOfKey, inBook, particles, sfx, hud }) {
  let lifts = {};
  const recentPops = new Map();                                  // target key -> performance.now() of the last pop (host: no double pops)
  const bad = new Map();                                         // host: lift key -> since when one of the pair is missing / a puff
  const _v = new THREE.Vector3();

  /** What the host knows about one player of the page (tile coordinates): { key, x, y (feet; a puff's y is its centre minus 0.7), puff, grounded, face, p } or null. */
  function info(key, override = null) {
    const p = playerOfKey(key), page = getPage(), pp = getPagePlayers();
    if (!p || !page || !pp) return null;
    let r;
    if (players.list.includes(p)) {
      const st = pp.stateOf(p); if (!st) return null;
      const puff = st.life.state === 'puff';
      r = { key, x: puff ? st.puffP.x : st.body.x, y: puff ? st.puffP.y - 0.7 : st.body.y, puff, grounded: st.body.grounded, face: st.body.face || 1, p };
    } else {
      if (!inBook(p) || p.away || (p.position.x === 0 && p.position.y === 0)) return null;
      const t = worldToPage(page, p.position.x, p.position.y), puff = !!p._puff;
      r = { key, x: t.tx, y: puff ? t.ty - 0.7 : t.ty, puff, grounded: !p._air, face: p.facing >= 0 ? 1 : -1, p };
    }
    if (override) { r.x = override.tx; r.y = r.puff ? override.ty - 0.7 : override.ty; }
    return r;
  }
  const tileOf = (actor) => worldToPage(getPage(), actor.pos.x, actor.pos.y);

  // ---- presentation / local effects (every screen) ------------------------------------------------------------------------------------------------------------
  const wpos = (x, y) => { const w = pageToWorld(getPage(), x, y); return _v.set(w.x, w.y, PAGE.z).clone(); };
  const label = (key) => `P${refOf(key).index + 1}`;
  function applyPop(d) {
    const page = getPage(); if (!page || !d || !d.target || !d.by) return;
    const tk = `${d.target.screen}:${d.target.index}`, bk = `${d.by.screen}:${d.by.index}`;
    const at = wpos(d.x, d.y + 0.9);
    particles.burst('sparkle', at, { count: 14, radius: 0.9 }); particles.burst('puff', at, { count: 4, radius: 0.5 });
    sfx.play('pop', { pitch: 1.5 }); sfx.play('chime', { vol: 0.4 });
    const p = playerOfKey(tk), pp = getPagePlayers();
    if (p && pp && players.list.includes(p)) pp.revive(p, d.x, d.y);
    hud.toast(`${label(bk)} popped ${label(tk)}'s puff!`, { icon: 'sparkle', duration: 2200 });
  }
  function applyLift(d) {
    if (!d || !d.by || !d.target) return;
    lifts[d.by] = d.target;
    sfx.play('bip', { pitch: 1.3, vol: 0.6 });
    for (const k of [d.by, d.target]) { const p = playerOfKey(k); if (p && p.squash) p.squash(k === d.by ? -0.18 : 0.15); }
  }
  function applyToss(d) {
    if (!d || !d.by || !d.target) return;
    delete lifts[d.by];
    const pp = getPagePlayers(), carried = playerOfKey(d.target), carrier = playerOfKey(d.by);
    if (carried && pp && players.list.includes(carried)) pp.tossBody(carried, { x: d.x, y: d.y, vx: d.vx, vy: d.vy, lock: d.mode === 'down' || d.wriggle ? (d.wriggle ? 0.25 : 0.12) : MP.tossLock });
    if (carrier && carrier.swing && !d.wriggle && d.mode !== 'down') carrier.swing(0.3);
    const at = wpos(d.x, d.y + 0.7);
    if (d.mode !== 'down' || d.wriggle) { sfx.play('toss'); particles.burst('puff', at, { count: 4, radius: 0.4 }); }
  }

  // ---- the host decides ---------------------------------------------------------------------------------------------------------------------------------------
  function emit(kind, data) {
    if (kind === 'pop') { recentPops.set(`${data.target.screen}:${data.target.index}`, performance.now()); applyPop(data); }
    else if (kind === 'lift') applyLift(data);
    else applyToss(data);
    sync.emit('storybook', kind, data);
  }
  function handleRequest(kind, d, actor) {
    if (!actor || !actor.pos || !getPage()) return { reject: 'bad-request' };
    d = d || {};
    const ak = actorKey(actor), at = tileOf(actor);
    if (kind === 'pop') {
      if (typeof d.target !== 'string' || typeof d.by !== 'string') return { reject: 'bad-request' };
      const t = info(d.target, ak === d.target ? at : null), f = info(d.by, ak === d.by ? at : null);
      if (!t || !f) return { reject: 'gone' };
      const last = recentPops.get(t.key);
      if (last !== undefined && performance.now() - last < 1000) return { reject: 'gone' };
      const v = validatePop({ target: t, by: f, actor: ak });
      if (!v.ok) return { reject: v.reason };
      emit('pop', { target: refOf(t.key), by: refOf(f.key), x: +f.x.toFixed(2), y: +f.y.toFixed(2) });
      return true;
    }
    if (kind === 'lift') {
      if (typeof d.target !== 'string') return { reject: 'bad-request' };
      const a = info(ak, at), t = info(d.target);
      if (!a || !t) return { reject: 'gone' };
      const v = validateLift({ actor: a, target: t, lifts });
      if (!v.ok) return { reject: v.reason };
      emit('lift', { by: a.key, target: t.key });
      return true;
    }
    if (kind === 'toss') {
      const a = info(ak, at);
      if (!a) return { reject: 'gone' };
      const v = validateToss({ actor: a, lifts, mode: d.mode });
      if (!v.ok) return { reject: v.reason };
      const L = tossLaunch(d.face, d.mode, a);
      emit('toss', { by: a.key, target: v.target, x: +L.x.toFixed(2), y: +L.y.toFixed(2), vx: L.vx, vy: L.vy, mode: d.mode });
      return true;
    }
    if (kind === 'wriggle') {
      const by = carriedBy(lifts, ak);
      if (!by) return { reject: 'nothing-held' };
      const c = info(by);
      if (!c) return { reject: 'gone' };
      const L = wriggleLaunch(c, c.face);
      emit('toss', { by, target: ak, x: +L.x.toFixed(2), y: +L.y.toFixed(2), vx: L.vx, vy: L.vy, mode: 'fwd', wriggle: true });
      return true;
    }
    return { reject: 'unknown' };
  }

  function update(dt) {
    if (!sync.isHost) return;
    const now = performance.now();
    for (const [by, target] of Object.entries(lifts)) {
      const a = info(by), t = info(target);
      if (a && t && !a.puff && !t.puff) { bad.delete(by); continue; }
      const since = bad.get(by) ?? (bad.set(by, now), now);
      if (now - since < (a && t ? 0 : 600)) continue;                         // (a puff drops at once; a player who just vanished gets a moment to come back)
      bad.delete(by);
      const at = a || t;
      emit('toss', { by, target, x: +at.x.toFixed(2), y: +at.y.toFixed(2), vx: 0, vy: 0, mode: 'down' });
    }
  }
  /** After the avatars moved (every screen): a carried REMOTE player rides the carrier's head exactly, whatever the pose lag. */
  function pin() {
    for (const [by, target] of Object.entries(lifts)) {
      const c = playerOfKey(by), t = playerOfKey(target);
      if (!c || !t || players.list.includes(t) || !c.root.visible) continue;
      t.position.set(c.position.x, c.position.y + MP.liftH, c.position.z);
    }
  }

  return {
    handles: (k) => KINDS.has(k), handleRequest,
    applyEvent(kind, d) { if (kind === 'pop') applyPop(d); else if (kind === 'lift') applyLift(d); else if (kind === 'toss') applyToss(d); },
    get lifts() { return lifts; },
    carrierOf: (key) => carriedBy(lifts, key),
    posOf: (key) => { const i = info(key); return i ? { x: i.x, y: i.y, face: i.face } : null; },
    update, pin,
    reset() { lifts = {}; recentPops.clear(); bad.clear(); },
    snapshot: () => ({ lifts: { ...lifts } }),
    loadSnapshot(s) { lifts = s && s.lifts && typeof s.lifts === 'object' ? { ...s.lifts } : {}; },
    hashView: () => liftsView(lifts),
    summary: () => ({ lifts: { ...lifts } }),
  };
}
