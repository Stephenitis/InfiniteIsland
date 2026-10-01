// The bridge-opening cutscene (PLAN Step 28c): when the last gift completes a bridge, every screen watches the final quarter of the deck build itself,
// a flyover reveals the new island, the lanterns light up in a wave and the builder cheers. About 10 s; holding Cancel for 1 s skips it everywhere.
//
//   const scene = createBridgeScene({ scene, camera, followCam, players, avatars, hud, cinematic, bridges, npcs, particles, sfx, sync, worldVis, dialog })
//   scene.update(dt)         once per tick, AFTER followCam.update and cinematic.update (it owns the camera while it runs)
//   scene.active / busy      the scene runs (cinematic.js has the same flags for any cutscene)      scene.queued = openings waiting their turn
//   scene.skip()             what holding Cancel for 1 s does                                          scene.replay(id) debug: __game.bridges.cutscene(id)
//   scene.summary()          debug snapshot
//
// Hook: world/bridges.js calls the opening handler on EVERY screen when the final gift lands (`built` is already saved: a reload mid-scene shows the finished,
// open bridge and the scene is never replayed). The handler takes over and the scene calls ctx.finish({ silent: true }) when it ends or is skipped, then shows
// the toast itself. The deck is not walkable until then.
//
// Timeline (game/bridgeSceneLogic.js, seconds from the host-timed start):
//   0-1.5   letterbox in, HUD fades, music ducks; the camera swings to a low three-quarter view of the builder, who nods and taps the last piece
//   1.5-5   the camera runs along the bridge while the final quarter of the deck builds itself, one segment at a time (thunk pitch rises, dust / chips)
//   5-7.5   the camera rises and looks across at the new island's skyline; the lanterns light up in a wave from the home end
//   7.5-10  back at the landing: the builder cheers (arms up + hops), confetti at both ends, the jingle, the banner "The bridge to <island> is open!",
//           players near the landing face the bridge and cheer; then the camera eases back to the follow view (cinematic.js) and the deck opens
//
// World sync (domain 'bridgeScene', the Step 25 machinery of the feast): the 'bridges' domain's `gave` event makes every screen queue the opening. The HOST
// starts it as soon as no other cinematic runs (a running feast makes it wait), emitting event start { id, startAt } (host clock, +500 ms); every screen begins
// with its own players and the host clock (clock offset from the ping/pong), so the screens line up. Skip: any screen sends request skip -> the host emits
// event skip { id } and finishes; every screen finishes (finished bridge, deck open, toast). A screen that never hears the start gives up after
// WAIT_FOR_START_S and opens the deck silently; a screen that is more than a scene late (waited out a feast) does the same. A screen that joins mid-scene
// only gets the 'bridges' snapshot (built -> open): no partial cutscene.
//
// Safety: players are frozen where they stand (nobody is teleported), the dialog / pair panel close, cinematic.active suppresses every target, prompt and
// interaction, the region manager gets a view hint at the bridge middle so both islands are full detail all through the flyover (no pop-in).
// Budget: only the shared particle pool + the mesh's own lantern glow; no new draw calls.
import * as THREE from 'three';
import { SEGMENTS } from '../world/bridgeMesh.js';
import { getColliders } from '../world/colliders.js';
import { T, NEAR_LANDING, WAIT_FOR_START_S, SHOT1, HOME, lanternWaveAt, startDecision, nearLanding, cameraPose, shotOf, segmentClearance, pickCandidate } from './bridgeSceneLogic.js';

const BUILD_STAGGER = 0.82;              // s between the segments of the final quarter (4 segments over the dolly beat)
const PRE_START = 500;                   // ms the host gives every screen to line up
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };

export function createBridgeScene({ camera, followCam, players, avatars = null, hud, cinematic: cin, bridges, npcs, particles, sfx = null, sync, worldVis = null }) {
  const snd = (name, opts) => { if (sfx) sfx.play(name, opts); };
  const queue = [];                      // openings waiting their turn: { ctx, waited, startAt, skipped }
  const startEvents = new Map();         // id -> startAt, when the host's start event arrived before this screen's own `gave`
  const skipEvents = new Set();
  let run = null;                        // the scene that is playing

  const _p = new THREE.Vector3();
  const _l = new THREE.Vector3();

  // ------------------------------------------------------------------------------------------ the frame (u along the bridge, v to the NPC's side)
  function makeFrame(id) {
    const mesh = bridges.mesh(id), inf = bridges.info(id);
    const a = mesh.endPoint('a'), b = mesh.endPoint('b');
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const f = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };
    const npc = npcs.get(inf.npcId);
    let s = { x: -f.z, z: f.x };
    const ref = npc ? { x: npc.position.x - a.x, z: npc.position.z - a.z } : { x: 0, z: 1 };            // the side the NPC stands on (else the default camera side, +Z)
    if (s.x * ref.x + s.z * ref.z < 0 || (npc === null && s.z < 0)) s = { x: -s.x, z: -s.z };
    const isle = inf.island;
    const rel = { x: isle.x - a.x, z: isle.z - a.z };
    return {
      mesh, a, b, L, f, s, npc, island: isle,
      npcU: npc ? (npc.position.x - a.x) * f.x + (npc.position.z - a.z) * f.z : -1.6,
      npcV: npc ? Math.max(2, (npc.position.x - a.x) * s.x + (npc.position.z - a.z) * s.z) : 4.3,
      isleU: rel.x * f.x + rel.z * f.z, isleV: rel.x * s.x + rel.z * s.z,
    };
  }
  const yAt = (fr, u) => fr.mesh.pointAt(clamp(u / fr.L, 0, 1)).y;
  function toWorld(fr, u, v, h, out) {
    return out.set(fr.a.x + fr.f.x * u + fr.s.x * v, yAt(fr, u) + h, fr.a.z + fr.f.z * u + fr.s.z * v);
  }

  /** The landing shots: the first candidate spot (around the NPC) that no tree / rock / sign blocks the view from. */
  function pickShot(fr, list) {
    const circles = getColliders().filter((c) => !(typeof c.owner === 'string' && c.owner.startsWith('bridge-')));
    const poses = list.map((c) => shotOf(c, fr.npcU, fr.npcV));
    const cl = poses.map((q) => {
      toWorld(fr, q.pu, q.pv, q.ph, _p);
      toWorld(fr, q.lu, q.lv, q.lh, _l);
      const atCam = circles.reduce((m, c) => Math.min(m, Math.hypot(c.x - _p.x, c.z - _p.z) - c.r - 0.7), Infinity);       // not inside a trunk either
      return Math.min(atCam, segmentClearance(_p.x, _p.z, _l.x, _l.z, circles));
    });
    return poses[pickCandidate(cl)];
  }

  // ------------------------------------------------------------------------------------------ begin / finish
  function beginRun(item, t0 = 0) {
    const ctx = item.ctx;
    const fr = makeFrame(ctx.id);
    if (!cin.begin('bridge', { avatarsCinematic: false, duck: 0.4, onIdle: () => { if (worldVis) worldVis.setViewHint(null); } })) return false;
    run = { ctx, id: ctx.id, fr, t: t0, startAt: item.startAt || 0, replay: !!item.replay, skipRequested: false, ev: {}, cheerers: [], tapped: false };
    if (run.replay) fr.mesh.revealSegments(SEGMENTS - SEGMENTS / 4);          // hide the last quarter again (debug replay; put back by finishRun)
    if (worldVis) worldVis.setViewHint(fr.mesh.pointAt(0.5));                 // both islands full detail all through the flyover
    avatars?.reconcile();
    fr.shot1 = pickShot(fr, SHOT1);
    fr.home = pickShot(fr, HOME);
    if (fr.npc) { toWorld(fr, fr.shot1.pu, fr.shot1.pv, 0, _p); fr.npc.lookAt(_p.x, _p.z, 2.4); }          // the builder nods to the camera, then taps the last piece
    snd('whoosh', { pitch: 0.6, vol: 0.6 });
    return true;
  }
  const pointXZ = (fr, u) => [fr.a.x + fr.f.x * u, fr.a.z + fr.f.z * u];

  function toast(id) {
    hud.toast(`The bridge to ${bridges.info(id).island.name} is open!`, { icon: 'bridge', duration: 4200 });
  }

  /** The scene ends (played out or skipped): the deck opens, the toast shows, the camera eases back. */
  function finishRun(skipped) {
    if (!run) return;
    const r = run;
    run = null;
    const m = r.fr.mesh;
    m.setLanternWave(null);
    cin.releaseAll();
    cin.end({ unduck: 1.8 });
    if (r.replay) m.revealSegments(SEGMENTS);                        // debug replay: leave the bridge exactly as it was
    else r.ctx.finish({ silent: true });                             // opens the deck (the scene already did the fanfare)
    if (skipped && r.fr.npc && r.fr.npc.shown) r.fr.npc.cheer();
    toast(r.id);
  }

  /** An opening this screen can no longer play (late, host never answered, skipped before it began): open the deck, show the toast. */
  function openSilently(item) {
    item.ctx.finish({ silent: true });
    toast(item.ctx.id);
  }

  // ------------------------------------------------------------------------------------------ the opening hook (every screen)
  function onOpening(ctx) {
    queue.push({ ctx, waited: 0, startAt: null, skipped: skipEvents.delete(ctx.id) });
    return true;
  }

  /** Queue handling: the host decides the start, replicas wait for it (or for the running cinematic to end). */
  function pump(dt) {
    const item = queue[0];
    if (!item) return;
    item.waited += dt;
    if (item.skipped) { queue.shift(); openSilently(item); return; }
    if (item.startAt === null) {
      if (sync.isHost) {
        if (cin.busy || run) return;                                   // a feast runs: wait for it
        item.startAt = sync.hostNow() + PRE_START;
        sync.emit('bridgeScene', 'start', { id: item.ctx.id, startAt: item.startAt });
      } else if (startEvents.has(item.ctx.id)) {
        item.startAt = startEvents.get(item.ctx.id);
        startEvents.delete(item.ctx.id);
      } else if (item.waited > WAIT_FOR_START_S) { queue.shift(); openSilently(item); return; }
      else return;
    }
    const d = startDecision({ busy: cin.busy || !!run, startAt: item.startAt, now: sync.hostNow() });
    if (d.action === 'wait') return;
    queue.shift();
    if (d.action === 'late' || !beginRun(item, d.t0)) openSilently(item);
  }

  // ------------------------------------------------------------------------------------------ the scene
  function segmentFx(r, i, k, total) {
    const q = r.fr.mesh.segmentPoint(i);
    const stone = r.fr.mesh.surface === 'stone';
    snd('thud', { pitch: 0.8 + 0.7 * (total > 1 ? k / (total - 1) : 1), vol: 0.9 });
    particles.burst('puff', { x: q.x, y: q.y, z: q.z }, { count: stone ? 8 : 5, radius: 1.3, ring: true, height: 0.25, speed: 1.0 });
    if (!stone) particles.burst('chip', { x: q.x, y: q.y + 0.2, z: q.z }, { count: 6, radius: 0.9, height: 0.5 });
    if (k === total - 1) { particles.burst('sparkle', { x: q.x, y: q.y + 1.0, z: q.z }, { count: 10, radius: 1.2, height: 0.6 }); snd('pop', { pitch: 1.5, vol: 0.6 }); }
  }

  function poseCamera(r) {
    const fr = r.fr, t = r.t;
    const g = cameraPose(t, fr);
    toWorld(fr, g.pu, g.pv, g.ph, _p);
    toWorld(fr, g.lu, g.lv, g.lh, _l);
    if (t < T.SWING) {                                                // swing in from wherever the follow camera was
      const k = smooth(t / T.SWING);
      _p.lerpVectors(cin.startPos, _p, k);
      _l.lerpVectors(cin.startLook, _l, k);
    }
    camera.position.copy(_p);
    cin.look(_l);
  }

  function updateCheerers(r, dt) {
    const wave = Math.sin(r.t * 13) * 0.16;
    for (const c of r.cheerers) {
      const p = c.p;
      if (p.leaving || p.away || !players.list.includes(p)) continue;
      const ck = smooth((r.t - c.t0) / 0.25);
      if (r.t >= c.nextHop && p.grounded) {
        p.hop();
        c.nextHop = r.t + 0.55 + Math.random() * 0.17;
        particles.burst('sparkle', { x: p.position.x, y: p.position.y + 1.6, z: p.position.z }, { count: 2, radius: 0.5, speed: 0.8 });
      }
      const P = p.parts;
      P.armL.rotation.x = lerp(P.armL.rotation.x, 0, ck);
      P.armR.rotation.x = lerp(P.armR.rotation.x, 0, ck);
      P.armL.rotation.z = lerp(P.armL.rotation.z, 2.65 + wave, ck);
      P.armR.rotation.z = lerp(P.armR.rotation.z, -2.65 - wave, ck);
    }
  }

  function update(dt) {
    pump(dt);
    if (!run) return;
    const r = run, ev = r.ev, fr = r.fr;
    cin.freezeAll();                                                  // the scene owns everybody (joiners included); nobody is moved
    if (r.startAt && sync.hostNow() < r.startAt) return;              // lining up with the other screens
    r.t += dt;
    if (r.startAt) r.t = Math.max(r.t, (sync.hostNow() - r.startAt) / 1000);
    const t = r.t;

    if (cin.pollSkip(dt, t)) { skip(); return; }

    // beat 1: the nod and the tap
    if (!ev.tap && t >= T.NPC_TAP_AT) { ev.tap = true; bridges.hold(r.id, T.NPC_TAP_END - T.NPC_TAP_AT); }
    // beat 2: the final quarter builds itself
    if (!ev.build && t >= T.BUILD_START) {
      ev.build = true;
      fr.mesh.revealSegments(SEGMENTS, { animate: true, stagger: BUILD_STAGGER, onSegment: (i, k, total) => segmentFx(r, i, k, total) });
    }
    // beat 3: the lantern wave (also keeps going while the camera leaves the island)
    fr.mesh.setLanternWave(lanternWaveAt(t));
    if (!ev.far && t >= T.FAR_CONFETTI) {
      ev.far = true;
      particles.burst('confetti', { x: fr.b.x, y: fr.b.y + 1.8, z: fr.b.z }, { count: 28, radius: 1.3, height: 0.6, speed: 1.0 });
      particles.burst('sparkle', { x: fr.b.x, y: fr.b.y + 1.2, z: fr.b.z }, { count: 10, radius: 1.0, height: 0.6 });
      snd('pop', { pitch: 1.4, vol: 0.5 });
    }
    // beat 4: the cheer
    if (!ev.cheer && t >= T.CHEER) {
      ev.cheer = true;
      if (fr.npc && fr.npc.shown) fr.npc.cheer();
      for (const [dx, dz] of [[0, 0], [0.8, -0.8], [-0.8, 0.8]]) {
        particles.burst('confetti', { x: fr.a.x + dx, y: fr.a.y + 2.4, z: fr.a.z + dz }, { count: 26, radius: 1.3, height: 0.6, speed: 1.0 });
      }
      snd('jingle');
      const [fx, fz] = pointXZ(fr, 6);
      for (const p of players.list) {
        if (p.away || p.spawnT >= 0 || !nearLanding(p.position.x, p.position.z, fr.a.x, fr.a.z, NEAR_LANDING)) continue;
        p.faceToward(fx, fz);
        r.cheerers.push({ p, t0: t, nextHop: t + 0.1 + r.cheerers.length * 0.12 });
      }
    }
    if (!ev.banner && t >= T.BANNER) {
      ev.banner = true;
      const pill = document.createElement('div');
      pill.className = 'fb-feasts';
      pill.textContent = 'Go on, take a look!';
      cin.showBanner([{ text: `The bridge to ${fr.island.name} is open!`, cls: 'fb-name' }], [pill]);
    }
    if (t >= T.END - 0.35) cin.dismissBanner();
    updateCheerers(r, dt);

    poseCamera(r);
    if (t >= T.END) finishRun(false);
  }

  // ------------------------------------------------------------------------------------------ skip (any screen, everywhere)
  function skip() {
    if (!run) return false;
    if (run.replay || !run.startAt) { finishRun(true); return true; }
    if (run.skipRequested) return true;
    run.skipRequested = true;
    const r = sync.request('bridgeScene', 'skip', { id: run.id });
    if (r && typeof r.then === 'function') r.then((answer) => { if (run && !answer.ok) run.skipRequested = false; });
    else if (!r.ok && run) run.skipRequested = false;
    return true;
  }

  sync.register('bridgeScene', {
    snapshot: () => null,                                             // a late joiner only sees the finished bridge (the 'bridges' snapshot)
    applySnapshot() {},
    applyEvent(kind, d) {
      if (!d) return;
      if (kind === 'start') { startEvents.set(d.id, d.startAt); return; }
      if (kind === 'skip') {
        if (run && run.id === d.id) finishRun(true);
        else if (queue.some((q) => q.ctx.id === d.id)) queue.find((q) => q.ctx.id === d.id).skipped = true;
        else skipEvents.add(d.id);                                    // the skip beat this screen's own `gave` (rare): remembered for onOpening
      }
    },
    handleRequest(kind, d) {
      if (kind !== 'skip') return { reject: 'unknown-kind' };
      if (!run || (d && d.id && run.id !== d.id)) return { reject: 'idle' };
      sync.emit('bridgeScene', 'skip', { id: run.id });
      finishRun(true);
      return true;
    },
  });
  bridges.setOpeningHandler(onOpening);

  // ------------------------------------------------------------------------------------------ debug
  /** __game.bridges.cutscene(id): replay the scene on THIS screen for a finished bridge; changes no state (the bridge is left exactly as it was). */
  function replay(id) {
    const e = bridges.entry(id);
    if (!e || !e.built || cin.busy || run) return false;
    return beginRun({ ctx: { id, finish() {} }, startAt: 0, replay: true }, 0);
  }

  return {
    update, skip, replay,
    get active() { return !!run && cin.active; },
    get busy() { return !!run; },
    get queued() { return queue.length; },
    get t() { return run ? +run.t.toFixed(2) : 0; },
    summary() {
      return {
        running: !!run, id: run ? run.id : null, t: run ? +run.t.toFixed(2) : 0, replay: run ? run.replay : false, queued: queue.map((q) => ({ id: q.ctx.id, startAt: q.startAt, skipped: q.skipped })),
        cheerers: run ? run.cheerers.length : 0, cinematic: cin.summary(),
      };
    },
  };
}
