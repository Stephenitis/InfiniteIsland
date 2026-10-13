// The storybook page WORLD at runtime (Step 50): the host-authoritative state of everything the party can change on an open page (the tool gates, trees, dig spots, enemies, throwables,
// the page tools players hold) plus its presentation on every screen. The rules are PURE (game/pageWorldLogic.js, Node-tested); the drawing is world/pageActors.js + world/pageVisuals.js;
// game/storybook.js owns the `storybook` sync domain and routes the world's part of it here. Session-only: a page opened again starts pristine.
//
//   const pw = createPageWorld({ sync, players, avatars, items, particles, sfx, hud, visuals, actors, getPage, getRun, bodyOf(player), lightFire(idx, actor), refillAll() })
//   pw.reset(page) / pw.clear()          a page opened (a fresh world) / closed (nothing: and every page tool is taken back)        pw.world   the world (null outside a page)
//   pw.handleRequest(kind, data, actor)  HOST: take | hit | soil | pound | stomp | grab | throw | drop | seedhit -> true | { reject }  (game/pageWorldLogic.js `request` decides, this applies + emits)
//   pw.applyEvent(kind, data)            every screen: 'w' = decided recs (applied with applyRecs, then presented), 'm' = the 10 Hz motion broadcast
//   pw.update(dt, t)                     once per frame: the host steps the enemies / objects (fixed 1/60 s) and broadcasts; every screen then draws them (actors.update)
//   pw.snapshot() / pw.loadSnapshot(s) / pw.hashView()      late joiners and the sync hash                    pw.bonus  the berries from shaken trees, geodes and defeated enemies
// Step 53a: request bosshit { mode: 'stomp' } and the recs boss / globs / globland / clink are presented here (the Volcano Spirit's roar, its globs' shadows land, the hits); `onGlobLand(x, y)` lets the screen hurt its own players the splash reaches.
//   pw.toolOf(key) / pw.keyOf(player) / pw.playerOfKey(key) / pw.holderPos(key)    who holds which page tool, actor keys <-> players, where an actor's head is
// Step 52b: requests ride | buddyEnd | dash (buddy crates and the fox's dash), recs freeze / thaw / ice / splat / buddy are presented here (sparkles, ice cracks, the buddy's hello); reset(page, { camp }) decides what each crate holds.
// Requests are lenient (the client's reach plus latency slack, game/pageWorldLogic.js) and every decision is an array of recs applied by the SAME function on the host and the replicas;
// a replica never changes the world by itself (it may play its own swing and sound at once). The host uses the actor's world position from the request (poses carry y).
import * as THREE from 'three';
import { PAGE, worldToPage, pageToWorld } from './storybookLogic.js';
import { actorKey } from '../net/worldSync.js';
import { berryRefill } from './platformerLogic.js';
import { PLATFORMER as P } from '../config.js';
import { ABILITY_NAME, ABILITY_HINT } from './pageSnowLogic.js';
import {
  createWorld, request, applyRecs, stepWorld, motion, applyMotion, extrapolate, moving, snapshot, loadSnapshot, hashView, releaseRecs, holdOf, enemyById, objectById,
} from './pageWorldLogic.js';

const WORLD_KINDS = new Set(['take', 'untool', 'hit', 'soil', 'pound', 'stomp', 'grab', 'throw', 'drop', 'seedhit', 'ride', 'buddyEnd', 'dash', 'bosshit']);
const STEP = 1 / 60, MOTION_EVERY = 0.1;
const TOOL_NAME = { axe: 'Axe', hammer: 'Hammer', shovel: 'Shovel', sword: 'Sword' };
const SPECIES_NAME = { fox: 'Fox', squirrel: 'Squirrel', rabbit: 'Rabbit', grouse: 'Grouse', hare: 'Snow hare' };

export function createPageWorld({ sync, players, avatars, items, particles, sfx, hud, visuals, actors, getPage, getRun, bodyOf, lightFire, refillAll, onGlobLand = null }) {
  let world = null;
  let acc = 0, bc = 0, dirty = false, motionPending = false, bossToasted = false;
  const _v = new THREE.Vector3();

  const keyOf = (p) => actorKey(sync.actorFor(p));
  function playerOfKey(key) {
    const i = key.lastIndexOf(':'), screen = key.slice(0, i), index = Number(key.slice(i + 1));
    if (screen === sync.screenId) return players.get(index) || null;
    return avatars.list.find((a) => a.index === index && a.screen === screen) || null;
  }
  const refOf = (key) => { const i = key.lastIndexOf(':'); return { screen: key.slice(0, i), index: Number(key.slice(i + 1)) }; };
  const wp = (x, y) => { const page = getPage(); const w = pageToWorld(page, x, y); return _v.set(w.x, w.y, PAGE.z).clone(); };
  const toolOf = (key) => (world && world.tools[key]) || (items.heldByKey ? (items.heldByKey(key) || {}).kind : null) || null;
  const total = () => getRun().berries.length + (world ? world.bonus : 0);
  function holderPos(key) {
    const p = playerOfKey(key);
    if (!p || !p.root.visible) return null;
    return p.position;
  }

  // ---- presentation (every screen): what a decided rec looks and sounds like
  const TOOL_SFX = { axe: 'chop', sword: 'chop', hammer: 'crack', shovel: 'dig', stone: 'crack' };
  function present(recs, byKey, silent = false) {
    const page = getPage(); if (!page || silent) return;
    for (const r of recs) {
      switch (r.t) {
        case 'hit': {
          const pos = wp(r.cx + 0.5, r.cy + 0.5);
          if (r.kind === 'T') { actors.treeHit(Number(r.k.slice(1))); particles.burst('chip', wp(r.cx + 0.5, r.cy + 1.6), { count: 5, radius: 0.4 }); sfx.play('chop'); }
          else if (r.kind === 'D') { particles.burst('dirt', pos, { count: 6, radius: 0.4 }); sfx.play('dig'); }
          else if (r.kind === 'W') { particles.burst('leaf', pos, { count: 5, radius: 0.4, color: '#3f7a4a' }); sfx.play('chop', { pitch: 1.3 }); }
          else if (r.kind === 'H') { particles.burst('leaf', pos, { count: 4, radius: 0.3 }); sfx.play('chop'); }
          else { particles.burst('shard', pos, { count: 4, radius: 0.4 }); sfx.play(TOOL_SFX[r.tool] || 'crack'); }
          visuals.refresh([[r.cx, r.cy]], world.hits);
          break;
        }
        case 'tile': {
          const first = r.cells[0], pos = wp(first[0] + 0.5, first[1] + 0.5);
          if (r.kind === 'H') {                                                                  // the vine is cut: the crate drops and settles as a block
            const land = r.cells.find((c) => c[2] === 'K');
            sfx.play('chop'); particles.burst('leaf', pos, { count: 6, radius: 0.4 });
            const lk = land ? `${land[0]},${land[1]}` : null;
            if (lk) visuals.hidden.add(lk);
            visuals.refresh(r.cells, world.hits);
            if (land) actors.crateDrop(first[0], first[1], land[1], () => { visuals.hidden.delete(lk); visuals.refresh(r.cells, world.hits); sfx.play('thud'); particles.burst('puff', wp(land[0] + 0.5, land[1] + 0.2), { count: 5, radius: 0.5 }); });
          } else {
            visuals.refresh(r.cells, world.hits);
            for (const [cx, cy] of r.cells) {
              const at = wp(cx + 0.5, cy + 0.5);
              if (r.kind === 'J') particles.burst('puff', at, { count: 7, radius: 0.6, color: '#f4f8ff' });
              else if (r.kind === 'W') particles.burst('leaf', at, { count: 8, radius: 0.5, color: '#3f7a4a' });
              else if (r.kind === 'D') particles.burst('dirt', at, { count: 8, radius: 0.5 });
              else particles.burst('shard', at, { count: 8, radius: 0.5 });
            }
            sfx.play(r.kind === 'D' ? 'dig' : r.kind === 'W' ? 'chop' : 'crack', { pitch: r.kind === 'J' ? 1.1 : 0.85 });
            if (r.kind === 'R') { particles.burst('sparkle', pos, { count: 10, radius: 0.7, color: '#c79bff' }); sfx.play('chime', { vol: 0.5 }); }
          }
          break;
        }
        case 'felled': {
          const keys = r.cells.map((c) => `${c[0]},${c[1]}`);
          for (const k of keys) visuals.hidden.add(k);
          visuals.refresh(r.cells, world.hits);
          sfx.play('chop');
          actors.treeFall(r.i, r.dir, () => {
            for (const k of keys) visuals.hidden.delete(k);
            visuals.refresh(r.cells, world.hits);
            sfx.play('timber');
            for (const c of r.cells.filter((_, i) => i % 3 === 0)) { const at = wp(c[0] + 0.5, c[1] + 0.8); particles.burst('puff', at, { count: 3, radius: 0.5 }); particles.burst('leaf', at, { count: 3, radius: 0.6 }); }
          });
          break;
        }
        case 'shake': {
          const at = wp(r.x, r.y);
          particles.burst('leaf', at, { count: 12, radius: 1.4 }); particles.burst('sparkle', at, { count: 8, radius: 1.2, color: '#ff4f6d' });
          sfx.play('leaves'); sfx.play('collect', { pitch: 1.2, vol: 0.5 });
          break;
        }
        case 'dig': {
          const at = wp(r.x, r.y);
          particles.burst('dirt', at, { count: 10, radius: 0.6 });
          sfx.play('dig');
          if (r.reward === 'flower') { particles.burst('sparkle', wp(r.x, r.y + 0.8), { count: 14, radius: 0.8 }); sfx.play('chime', { vol: 0.6 }); }
          else particles.burst('sparkle', wp(r.x, r.y + 0.6), { count: 8, radius: 0.7, color: '#ff4f6d' });
          break;
        }
        case 'defeat': {
          const at = wp(r.x, r.y + 0.4);
          particles.burst('puff', at, { count: 8, radius: 0.5 }); particles.burst('sparkle', at, { count: 6, radius: 0.6, color: '#ff4f6d' });
          sfx.play('pop', { pitch: 0.8 }); sfx.play('thud', { vol: 0.4 });
          break;
        }
        case 'estate': {
          const at = wp(r.x, r.y + 0.6);
          particles.burst('sparkle', at, { count: 5, radius: 0.4 }); sfx.play('thud', { vol: 0.5, pitch: 1.2 });
          break;
        }
        case 'bat': { const o = objectById(world, r.id); if (o) { particles.burst('sparkle', wp(o.x, o.y), { count: 5, radius: 0.3 }); sfx.play('clink'); } break; }
        case 'ostate': { if (r.st === 'gone') { const o = objectById(world, r.id); if (o && o.kind === 'seed') particles.burst('puff', wp(o.x, o.y), { count: 2, radius: 0.2 }); } break; }
        case 'hold': sfx.play('bip', { pitch: 1.3 }); break;
        case 'throw': sfx.play('toss'); break;
        case 'spawn': { if (r.objects.length && r.objects[0].kind === 'stone') particles.burst('shard', wp(r.objects[0].x, r.objects[0].y), { count: 5, radius: 0.5 }); break; }
        case 'bonus': { particles.burst('sparkle', wp(r.x, r.y), { count: 6, radius: 0.6, color: '#ff4f6d' }); sfx.play('collect', { pitch: 1.1, vol: 0.5 }); break; }
        case 'freeze': {                                                                         // Step 52b: a snowball splats on slush: it turns to ice
          visuals.refresh(r.cells.map((c) => [c[0], c[1]]), world.hits);
          const at = wp(r.x, r.y);
          particles.burst('sparkle', at, { count: 12, radius: 1.2, color: '#bfeaff' }); particles.burst('puff', at, { count: 5, radius: 0.8, color: '#f4f8ff' });
          sfx.play('crack', { vol: 0.5, pitch: 1.8 }); sfx.play('chime', { vol: 0.5, pitch: 1.3 });
          break;
        }
        case 'thaw': {
          visuals.refresh(r.cells.map((c) => [c[0], c[1]]), world.hits);
          const c0 = r.cells[0]; if (c0) { particles.burst('puff', wp(c0[0] + 0.5, c0[1] + 0.8), { count: 4, radius: 0.8, color: '#dfeeff' }); sfx.play('bip', { pitch: 0.7, vol: 0.5 }); }
          break;
        }
        case 'splat': { const at = wp(r.x, r.y + 0.2); particles.burst('puff', at, { count: 6, radius: 0.5, color: '#ffffff' }); sfx.play('pop', { pitch: 0.7, vol: 0.5 }); break; }
        case 'ice': {                                                                            // icicles: wobble, drop, stick as a plank in a drift or shatter
          const at = wp(r.x, r.y + 0.4);
          if (r.cells) visuals.refresh(r.cells.map((c) => [c[0], c[1]]), world.hits);
          if (r.st === 'wobble') sfx.play('bip', { pitch: 2.4, vol: 0.4 });
          else if (r.st === 'fall') sfx.play('whoosh', { pitch: 1.9, vol: 0.4 });
          else if (r.st === 'stuck') { sfx.play('thud', { vol: 0.5 }); particles.burst('puff', at, { count: 5, radius: 0.5, color: '#f4f8ff' }); }
          else if (r.st === 'gone') { particles.burst('shard', at, { count: r.shatter === false ? 0 : 9, radius: 0.7, color: '#bfeaff' }); if (r.shatter !== false) { sfx.play('crack', { vol: 0.5, pitch: 1.7 }); sfx.play('chime', { vol: 0.3, pitch: 1.9 }); } }
          break;
        }
        case 'buddy': {
          const p = playerOfKey(r.key), pos = p ? p.position : null;
          if (r.end) {
            if (pos) particles.burst('puff', pos, { count: 6, radius: 0.7, color: '#ffffff' });
            sfx.play('bip', { pitch: 0.9, vol: 0.5 });
            if (p && players.list.includes(p)) hud.toast(r.why === 'gate' ? 'Your buddy hops off. Thanks, friend!' : r.why === 'hit' ? 'Your buddy took the hit and hopped away!' : 'Your buddy hopped away.', { icon: 'sparkle', duration: 2200, minor: true });
          } else if (p) {
            particles.burst('sparkle', pos, { count: 10, radius: 0.8, color: '#fff2b0' }); sfx.play('equip'); sfx.play('chime', { vol: 0.4 });
            if (players.list.includes(p)) hud.toast(`${SPECIES_NAME[r.species] || 'A buddy'} joins you! ${ABILITY_NAME[r.ability]}: ${ABILITY_HINT[r.ability]}.`, { icon: 'sparkle', duration: 3200, minor: true });
          }
          break;
        }
        case 'boss': {                                                                            // Step 53a: the Volcano Spirit changes mood
          const bs = world.boss; if (!bs) break;
          const at = wp(bs.x, bs.y + 1.4);
          if (r.st === 'idle') { sfx.play('flare', { pitch: 0.6, vol: 0.6 }); particles.burst('smoke', at, { count: 4, radius: 0.9 }); }
          else if (r.st === 'lob') { sfx.play('flare', { pitch: 0.8, vol: 0.5 }); }
          else if (r.st === 'sink') { sfx.play('sizzle', { vol: 0.6 }); particles.burst('smoke', at, { count: 6, radius: 1.2 }); }
          else if (r.st === 'cooled') {
            sfx.play('chime', { vol: 0.5, pitch: 0.6 }); particles.burst('puff', at, { count: 8, radius: 1.3, color: '#cfd3d9' });
            if (!bossToasted) { bossToasted = true; hud.toast('The Volcano Spirit has cooled! Throw a coconut at it, or stomp its crust!', { icon: 'sparkle', duration: 4200, minor: true }); }
          } else if (r.st === 'hurt') {
            sfx.play('crack', { vol: 0.9 }); sfx.play('pop', { pitch: 0.6, vol: 0.8 }); particles.burst('sparkle', at, { count: 16, radius: 1.4, color: '#ffb066' }); particles.burst('shard', at, { count: 8, radius: 1.0, color: '#8d8a96' });
            hud.toast(r.hp > 1 ? `Hit! ${r.hp} more to go.` : 'Hit! One more!', { icon: 'sparkle', duration: 2600, minor: true });
          } else if (r.st === 'dead') {
            for (let k = 0; k < 3; k++) particles.burst('confetti', wp(bs.x + (k - 1) * 1.8, bs.y + 3), { count: 36, radius: 1.4 });
            particles.burst('sparkle', at, { count: 24, radius: 2, color: '#ffd37a' }); sfx.play('jingle'); sfx.play('chime', { vol: 0.6 });
            hud.toast('The Volcano Spirit settles down, all sleepy. Its bookmark appears!', { icon: 'sparkle', duration: 5200 });
          }
          break;
        }
        case 'globs': for (const g of r.list) { const at = wp(g.x0, g.y0); particles.burst('sparkle', at, { count: 4, radius: 0.5, color: '#ff9a3a' }); sfx.play('whoosh', { pitch: 0.7, vol: 0.4 }); } break;
        case 'globland': {
          const at = wp(r.x, r.y + 0.3);
          particles.burst('sparkle', at, { count: 10, radius: 1.1, color: '#ff8a3a' }); particles.burst('smoke', at, { count: 3, radius: 0.8 }); particles.burst('shard', at, { count: 4, radius: 0.8, color: '#5a3a2e' });
          sfx.play('thud', { vol: 0.7, pitch: 0.8 }); sfx.play('sizzle', { vol: 0.3 });
          if (onGlobLand) onGlobLand(r.x, r.y);
          break;
        }
        case 'clink': { sfx.play('clink', { vol: 0.8 }); particles.burst('sparkle', wp(r.x, r.y), { count: 4, radius: 0.4 }); break; }
        case 'tool': {
          const p = playerOfKey(r.key);
          if (p) {
            items.setPageTool(p, r.tool);
            if (r.tool) {
              sfx.play('equip');
              if (players.list.includes(p)) hud.toast(`${TOOL_NAME[r.tool]}! Use it with Interact.`, { icon: 'sparkle', duration: 2200, minor: true });
            } else sfx.play('bip', { pitch: 0.8 });
          }
          break;
        }
        default: break;
      }
    }
  }

  function applyLocal(recs, byKey, silent = false) {
    if (!world) return;
    applyRecs(world, recs);
    // a page tool follows the recs even when silent (a replica joining late gets them from the snapshot instead)
    present(recs, byKey, silent);
    dirty = true;
  }

  // ---- the host decides
  function decide(recs, actorRef) {
    const before = total();
    applyLocal(recs, actorRef ? actorKey(actorRef) : null);
    const refill = berryRefill(before, total());
    sync.emit('storybook', 'w', { recs, actor: actorRef ? { screen: actorRef.screen, index: actorRef.index } : null, refill });
    if (refill) refillAll(true);
    for (const r of recs) if (r.t === 'fire') lightFire(r.idx, r.by ? refOf(r.by) : null);
  }
  function actorCtx(actor) {
    const page = getPage(), t = worldToPage(page, actor.pos.x, actor.pos.y), key = actorKey(actor);
    return { key, x: t.tx, y: t.ty, tool: toolOf(key) };
  }
  function handleRequest(kind, d, actor) {
    if (!WORLD_KINDS.has(kind)) return { reject: 'unknown' };
    if (!world || !getPage()) return { reject: 'closed' };
    if (!actor || !actor.pos) return { reject: 'bad-request' };
    const res = request(world, kind, d, actorCtx(actor));
    if (!res.ok) return { reject: res.reason };
    if (res.recs.length) decide(res.recs, actor);
    return true;
  }
  /** HOST: a screen of the party left or a page is closing: what its actors carry is put down where they stood. */
  function release(key) {
    if (!world) return;
    const a = actorsForSim().find((e) => e.key === key);
    const recs = releaseRecs(world, key, a);
    if (recs.length) decide(recs, refOf(key));
  }

  // ---- everyone: the page tools, the world state, the broadcast
  function actorsForSim() {
    const page = getPage(), out = [];
    if (!page) return out;
    for (const p of players.list) {
      if (p.away || p.leaving) continue;
      const b = bodyOf(p);
      if (b) out.push({ key: keyOf(p), x: b.x, y: b.y });
    }
    for (const a of sync.actors.values()) {
      const t = worldToPage(page, a.pos.x, a.pos.y);
      if (Math.abs(a.pos.x - PAGE.x) < 140) out.push({ key: actorKey(a), x: t.tx, y: t.ty });
    }
    return out;
  }

  /** HOST: every actor of a screen that stayed away past the grace period puts down what it carried and gives its page tool back. */
  function releaseScreen(screenId) {
    if (!world) return;
    const keys = new Set([...Object.keys(world.tools), ...world.enemies.map((e) => e.holder), ...world.objects.map((o) => o.holder)].filter((k) => k && k.startsWith(`${screenId}:`)));
    for (const k of keys) { release(k); if (world.tools[k]) decide([{ t: 'tool', key: k, tool: null }], refOf(k)); }
    for (const k of Object.keys(world.buddies)) if (k.startsWith(`${screenId}:`)) decide([{ t: 'buddy', key: k, end: true, why: 'leave' }], refOf(k));
  }

  function reset(page, opts = {}) {
    world = page ? createWorld(page, opts) : null;
    acc = 0; bc = 0; dirty = false; bossToasted = false;
  }
  function clearTools() {
    for (const p of players.list) items.setPageTool(p, null);
    for (const a of avatars.list) items.setPageTool(a, null);
  }
  function clear() { clearTools(); world = null; }
  /** (re)apply the page tools of the world to this screen's players and the avatars (a late join, a resync) */
  function syncTools() {
    if (!world) return;
    for (const p of players.list) items.setPageTool(p, world.tools[keyOf(p)] || null);
    for (const a of avatars.list) items.setPageTool(a, world.tools[`${a.screen}:${a.index}`] || null);
  }

  function update(dt, t) {
    if (!world) return;
    if (sync.isHost) {
      acc += Math.min(dt, 0.1);
      let n = 0;
      const sim = actorsForSim(), page = getPage(), run = getRun();
      const ctx = { fires: page.campfires.map((f, idx) => ({ idx, x: f.x, y: f.y, lit: run.fires.includes(idx) })) };
      while (acc >= STEP && n < 6) {
        acc -= STEP; n++;
        const recs = stepWorld(world, STEP, sim, ctx);
        if (recs.length) decide(recs, null);
      }
      if (n >= 6) acc = 0;
      bc += dt;
      if (bc >= MOTION_EVERY) {
        bc = 0;
        const mv = moving(world);
        if (mv || dirty || motionPending) { sync.emit('storybook', 'm', motion(world)); motionPending = mv; dirty = false; }
      }
    }
    else extrapolate(world, dt);                                              // (a replica dead-reckons the walkers between the 10 Hz packets)
    actors.update(t, dt, world, { run: getRun(), holderPos });
  }

  function applyEvent(kind, d) {
    if (!world) return;
    if (kind === 'w') {
      applyLocal(d.recs, d.actor ? actorKey(d.actor) : null);
      if (d.refill) refillAll(true);
    } else if (kind === 'm') applyMotion(world, d);
  }

  return {
    get world() { return world; },
    get bonus() { return world ? world.bonus : 0; },
    get bossDown() { return !!(world && world.boss && world.boss.st === 'dead'); },
    reset, clear, clearTools, syncTools, update, handleRequest, applyEvent, release, releaseScreen,
    snapshot: () => (world ? snapshot(world) : null),
    loadSnapshot(s) { if (world) { loadSnapshot(world, s); syncTools(); } },
    hashView: () => (world ? hashView(world) : null),
    handles: (k) => WORLD_KINDS.has(k),
    debugRecs: (recs) => { if (world) decide(recs, null); },
    toolOf, keyOf, playerOfKey, holderPos, present,
    actorsForSim,
    holdOf: (key) => (world ? holdOf(world, key) : null),
    debugPresent: (recs) => present(recs, null),
  };
}
