// The angler's side of fishing (PLAN Step 72a): casting with the Glowline Rod, waiting for nibbles and the bite, the press, and the cosmetic bobber + line that every screen draws for every
// angler. Rules are game/fishingLogic.js, the authority is the `fishing` domain (game/fishing.js); this module only drives the local players and the visuals.
//
//   const play = createFishingPlay({ scene, fishing, players, avatars, items, sync, hud, sfx, particles?, floatText?, world?, showcase? })
//   play.cast(player, pond)      Interact on a pond with a rod: the cast swing, the bobber flies out, the host claims a spot and returns the bite schedule. Returns true if a cast started.
//   play.press(player)           Interact while a line is out: THE press (a nibble scares the fish, the bite window hooks it). Returns true if the line was out.
//   play.cancel(player)          Cancel / walking away: reel in.            play.isFishing(player) -> bool             play.update(dt, t)   once per tick, after players / avatars / items.update
//   play.angler(player)          debug view of the state                       play.skipToBite(player)   debug: jump the angler's clock to just before the next bite window
// The angler's screen JUDGES its own presses against its own simulation clock (no network lag inside a 0.4-0.6 s window, like the boat repair's beats): `t` only advances in update(dt), so a stepped
// test run and a real frame loop agree. It sends `reel {cast, presses}` once the outcome is final (caught, fled, or a window ran out) and the host re-checks it with FISHING.slack. Everything
// the other players see (the ripple, the pose, the bobber) is cosmetic: pose flag 256 (`player._lineOut`) puts a bobber where the avatar's facing points (fishingLogic.bobberFor).
// THE CATCH MOMENT (Step 72b), on every screen from the host's `catch` event: the fish (player/journalModels.js, one draw call) arcs out of the water into the angler's raised hand (a local player or a remote
// avatar, found from the actor key) over FLIGHT s, then `showcase.show(fish, actor)` takes over (the showoff pose, the fish floating over the hand, halo, sparkles). Only the angler's own screen gets the
// "Caught a Glimmerfin!" toast, the jingle and the floating +1. Purely cosmetic; the bag and the Journal entry are the host's.
import * as THREE from 'three';
import { FISHING } from '../config.js';
import { actorKey } from '../net/worldSync.js';
import { G, VERTEX_TOON, part, combine } from '../render/geo.js';
import { aimCast, anglerStatus, bobberFor, nearestSpot, pondS } from '../game/fishingLogic.js';
import { itemName } from '../game/catalog.js';
import { parseActorKey } from '../game/fishing.js';
import { createJournalModel } from '../player/journalModels.js';

const WATER_Y = 0.07;
const ROD_POSE = [-1.15, 0, 0, 0.05];          // arm pitch, sway, body twist, lean: the rod held out over the water
const MAX_LINES = 8;
const FLIGHT = 0.75, ARC = 1.6, FLY_SIZE = 1.5;     // the caught fish: seconds in the air, arc height above the straight line, and its size (the fixed camera is far away)
const BOX = new THREE.BoxGeometry(1, 1, 1);
const _o = new THREE.Object3D();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1);

export function createFishingPlay({ scene, fishing, players, avatars = null, items, sync, hud, sfx = null, particles = null, floatText = null, world = null, showcase = null }) {
  const snd = (name, opts) => { if (sfx) sfx.play(name, opts); };
  const anglers = new Map();                    // local Player -> state
  const keyOf = (p) => actorKey(sync.actorFor(p));
  const localByKey = (key) => players.list.find((p) => keyOf(p) === key) || null;
  /** The Player an actor key stands for on THIS screen: a local player, or the remote avatar of that slot. */
  const playerOfKey = (key) => {
    const local = localByKey(key), who = parseActorKey(key);
    if (local || !who) return local;
    return who.screen === sync.screenId ? null : avatars?.get(who.index) || null;
  };
  const flights = [];                           // { p, who, fish, model, from: Vector3, t, mine }

  // ---- the shared bobber + line layer: two InstancedMeshes on the existing vertex-colour toon material (no new lights, no new materials)
  const bobberGeo = combine([
    part(G.cyl6, '#f4f1ff', { p: [0, 0.07, 0], s: [0.035, 0.16, 0.035] }),
    part(G.sphere, '#ff8a3c', { p: [0, 0.17, 0], s: [0.15, 0.1, 0.15] }),
    part(G.sphere, '#ffe08a', { p: [0, 0.215, 0], s: [0.06, 0.04, 0.06] }),
  ]);
  const lineGeo = combine([part(BOX, '#7ff5ff', { p: [0, 0, 0], s: [1, 1, 1] })]);
  const bobbers = new THREE.InstancedMesh(bobberGeo, VERTEX_TOON, MAX_LINES);
  const lines = new THREE.InstancedMesh(lineGeo, VERTEX_TOON, MAX_LINES);
  for (const m of [bobbers, lines]) { m.frustumCulled = false; m.count = 0; m.castShadow = false; m.visible = false; scene.add(m); }
  bobbers.name = 'fishing-bobbers'; lines.name = 'fishing-lines';

  // ------------------------------------------------------------------------------------------------ casting
  function fail(p, text) { hud.toast(text, { icon: 'sparkle', duration: 1800, minor: true }); end(p); }
  function end(p) {
    const a = anglers.get(p);
    if (a) anglers.delete(p);
    p._lineOut = false;
    if (p._pose === ROD_POSE) p.setPose(null);
  }

  function aimAt(p, pond) {
    // a free spot of this pond roughly in front of the angler (within the cast range) is the target; otherwise the middle of the cast range along the facing
    const sx = Math.sin(p.facing), sz = Math.cos(p.facing);
    const free = fishing.spots.filter((s) => s.pond === pond.id && !s.by).filter((s) => {
      const dx = s.x - p.position.x, dz = s.z - p.position.z, d = Math.hypot(dx, dz);
      return d >= FISHING.castMin - 1 && d <= FISHING.castMax + 1.5 && (dx * sx + dz * sz) / (d || 1) > 0.82;
    });
    const spot = nearestSpot(free, p.position.x + sx * 4, p.position.z + sz * 4, 99);
    if (spot) return { x: spot.x, z: spot.z };
    return aimCast(pond, p.position, p.facing, (FISHING.castMin + FISHING.castMax) / 2);
  }

  function cast(p, pond) {
    const held = items.heldBy(p);
    if (!pond || !held || held.kind !== 'rod' || held.state !== 'held' || anglers.has(p) || p.frozen) return false;
    const at = aimAt(p, pond);
    p.faceToward(at.x, at.z);
    items.swing(p);
    p.setPose(ROD_POSE);
    p._lineOut = true;
    const a = { player: p, pond: pond.id, from: { x: p.position.x, z: p.position.z }, x: at.x, z: at.z, phase: 'asking', castId: null, view: null, t: 0, presses: [], nibCue: 0, biteCue: -1, twitch: 0, plunge: 0, sent: false, empty: false, seed: Math.random() * 6.28 };
    anglers.set(p, a);
    snd('whoosh', { pitch: 1.2, vol: 0.4 });
    const r = fishing.cast(p, pond.id, at);
    const done = (res) => {
      if (anglers.get(p) !== a) return;                             // reeled in / left meanwhile
      if (!res || !res.ok) { fail(p, res?.reason === 'far' ? 'Too far from the water!' : 'The line snagged...'); return; }
      const d = res.result;
      a.x = d.x; a.z = d.z; a.castId = d.cast; a.empty = !!d.empty; a.view = { nibbles: d.nibbles, bites: d.bites }; a.phase = 'line'; a.t = 0;
      if (d.spot) particles?.burst('sparkle', { x: d.x, y: WATER_Y + 0.1, z: d.z }, { count: 5, radius: 0.35, color: '#7ff5ff' });
      snd('pop', { pitch: 0.7, vol: 0.5 });
    };
    if (r && typeof r.then === 'function') r.then(done); else done(r);
    return true;
  }

  function reelIn(p, a, cancel = false) {
    if (a.sent) return;
    a.sent = true;
    if (a.castId) {
      const r = cancel ? fishing.cancel(p, a.castId) : fishing.reel(p, a.castId, a.presses);
      if (r && typeof r.then === 'function') r.then(() => { if (anglers.get(p) === a) end(p); }); else end(p);
    } else end(p);
  }

  function press(p) {
    const a = anglers.get(p);
    if (!a) return false;
    if (a.phase !== 'line' || a.sent) return true;                  // still asking the host / already reeling: the press is eaten
    if (a.empty) { hud.toast('Reeled in. Aim at a glowing ring!', { icon: 'sparkle', duration: 1600, minor: true }); reelIn(p, a, true); return true; }
    a.presses.push(+a.t.toFixed(3));
    evaluate(p, a);
    return true;
  }
  function cancel(p) {
    const a = anglers.get(p);
    if (!a) return false;
    if (a.phase === 'line') reelIn(p, a, true); else end(p);
    return true;
  }

  // ------------------------------------------------------------------------------------------------ the wait
  function evaluate(p, a) {
    const st = anglerStatus(a.view, a.presses, a.t);
    if (st.nibbleIdx > a.nibCue) { a.nibCue = st.nibbleIdx; a.twitch = 0.35; snd('blip', { pitch: 1.5 + a.nibCue * 0.1, vol: 0.45 }); }
    if (st.status === 'bite' && st.stage > a.biteCue) {
      a.biteCue = st.stage; a.plunge = 1;
      hud.toast(st.stage === 0 ? 'Oh! A bite!' : 'It\'s still fighting!', { icon: 'sparkle', duration: 700 });
      snd('chime', { pitch: 1.9, vol: 0.55 });
      snd('splash', { pitch: 1.4, vol: 0.4 });
      particles?.burst('sparkle', { x: a.x, y: WATER_Y + 0.2, z: a.z }, { count: 6, radius: 0.3, color: '#ffe08a' });
    }
    if (st.status === 'hooked' && a.lastStatus !== 'hooked') { snd('pop', { pitch: 1.1, vol: 0.5 }); a.twitch = 0.3; }
    a.lastStatus = st.status;
    if (st.status === 'caught' || st.status === 'fled' || st.status === 'missed') reelIn(p, a);
    return st;
  }

  function update(dt, t) {
    for (const [p, a] of [...anglers]) {
      if (p.leaving || !players.list.includes(p)) { anglers.delete(p); p._lineOut = false; continue; }
      const held = items.heldBy(p);
      if (!held || held.kind !== 'rod' || held.state !== 'held') { cancel(p); continue; }             // dropped / swapped the rod
      if (a.phase !== 'line') continue;
      a.t += dt;
      a.twitch = Math.max(0, a.twitch - dt); a.plunge = Math.max(0, a.plunge - dt * 2.2);
      if (!a.sent && Math.hypot(p.position.x - a.from.x, p.position.z - a.from.z) > 2.6) { hud.toast('Reeled in.', { icon: 'sparkle', duration: 1200, minor: true }); reelIn(p, a, true); continue; }   // walking away reels in
      if (a.empty) { if (a.t >= FISHING.emptyWait && !a.sent) { hud.toast('Not even a nibble...', { icon: 'sparkle', duration: 1800, minor: true }); reelIn(p, a, true); } continue; }
      if (!a.sent) evaluate(p, a);
    }
    stepFlights(dt);
    drawLines(t);
  }

  // ------------------------------------------------------------------------------------------------ the cosmetic line
  function tipOf(p, out) {
    const s = p.parts?.handSocket;
    if (s) { s.updateWorldMatrix(true, false); s.getWorldPosition(out); } else out.set(p.position.x, p.position.y + 1.1, p.position.z);
    return out.add(_b.set(Math.sin(p.facing) * 0.75, 0.8, Math.cos(p.facing) * 0.75));
  }
  function drawLines(t) {
    let n = 0;
    const put = (p, bx, bz, a) => {
      if (n >= MAX_LINES || !p.root?.visible) return;
      const bob = Math.sin(t * 2.2 + (a?.seed || bx)) * 0.025 - (a ? a.plunge * 0.16 : 0) + (a && a.twitch > 0 ? Math.sin(a.twitch * 40) * 0.04 : 0);
      const by = WATER_Y + 0.02 + bob;
      _o.position.set(bx, by, bz); _o.rotation.set(0, 0, 0); _o.scale.setScalar(1); _o.updateMatrix();
      bobbers.setMatrixAt(n, _o.matrix);
      tipOf(p, _a); _b.set(bx, by + 0.18, bz);
      const len = _a.distanceTo(_b);
      _o.position.copy(_a).add(_b).multiplyScalar(0.5);
      _q.setFromUnitVectors(_z, _b.clone().sub(_a).normalize());
      _o.quaternion.copy(_q); _o.scale.set(0.022, 0.022, len); _o.updateMatrix();
      lines.setMatrixAt(n, _o.matrix);
      n++;
    };
    for (const [p, a] of anglers) if (a.phase === 'line') put(p, a.x, a.z, a);
    if (avatars) for (const p of avatars.list) {
      if (!p._lineOut) continue;
      const b = bobberFor(fishing.ponds, p.position, p.facing);
      if (b) put(p, b.x, b.z, null);
    }
    bobbers.count = lines.count = n;
    bobbers.instanceMatrix.needsUpdate = lines.instanceMatrix.needsUpdate = true;
    bobbers.visible = lines.visible = n > 0;
  }

  // ------------------------------------------------------------------------------------------------ the catch flight
  function startFlight(p, key, fish, at, mine) {
    const model = createJournalModel(fish);
    const who = parseActorKey(key);
    if (!model || !who) return false;
    const old = flights.findIndex((f) => f.p === p);
    if (old >= 0) finishFlight(flights[old], false);
    model.scale.setScalar(0.001);
    scene.add(model);
    p.showoff = true;                                          // the raised hand the fish flies to
    if (p.parts?.handSocket) p.parts.handSocket.visible = false;
    flights.push({ p, who, fish, model, from: new THREE.Vector3(at.x, WATER_Y + 0.05, at.z), t: 0, mine });
    return true;
  }
  function finishFlight(f, show = true) {
    flights.splice(flights.indexOf(f), 1);
    scene.remove(f.model);
    f.model.userData.dispose();
    f.p.showoff = false;
    if (f.p.parts?.handSocket) f.p.parts.handSocket.visible = true;
    if (show && showcase) showcase.show(f.fish, f.who);
    if (show) particles?.burst('sparkle', f.model.position, { count: 8, radius: 0.4, speed: 1.2, color: '#7ff5ff' });
  }
  function stepFlights(dt) {
    for (const f of [...flights]) {
      f.t += dt;
      if (!f.p.root?.parent || f.t >= FLIGHT) { finishFlight(f, !!f.p.root?.parent); continue; }
      f.p.parts.handSocket.getWorldPosition(_a);
      const u = f.t / FLIGHT, e = u * u * (3 - 2 * u);
      f.model.position.lerpVectors(f.from, _a, e);
      f.model.position.y += Math.sin(u * Math.PI) * ARC;
      f.model.scale.setScalar(Math.max(0.001, FLY_SIZE * Math.min(1, u * 5) * (f.model.userData.fit || 1)));
      f.model.rotation.set(0, f.p.facing + Math.PI / 2, Math.sin(u * 14) * 0.35);          // flapping on the way up
    }
  }

  // ------------------------------------------------------------------------------------------------ the host's verdicts (every screen)
  fishing.on((kind, d) => {
    if (kind !== 'catch' && kind !== 'miss') return;
    const mine = localByKey(d.actor);
    const pond = fishing.pond(d.pond), spot = fishing.spots.find((s) => s.id === d.spot);
    const a = mine && anglers.get(mine);
    const catcher = mine || playerOfKey(d.actor);
    const bob = !a && catcher && catcher._lineOut ? bobberFor(fishing.ponds, catcher.position, catcher.facing) : null;      // (a remote angler's bobber is derived from the facing)
    const at = a ? { x: a.x, z: a.z } : bob ? { x: bob.x, z: bob.z } : pond ? { x: pond.x, z: pond.z } : null;
    if (kind === 'catch') {
      if (at) { particles?.burst('puff', { x: at.x, y: WATER_Y + 0.1, z: at.z }, { count: 8, radius: 0.5 }); particles?.burst('sparkle', { x: at.x, y: WATER_Y + 0.6, z: at.z }, { count: 8, radius: 0.5, color: '#7ff5ff' }); }
      snd('splash', { pitch: 1.1, vol: 0.5 });
      if (catcher) {
        const from = at || { x: catcher.position.x + Math.sin(catcher.facing) * 2.5, z: catcher.position.z + Math.cos(catcher.facing) * 2.5 };
        if (!catcher.downed && !catcher.pageDrive) startFlight(catcher, d.actor, d.fish, from, !!mine);
      }
      if (mine) {
        snd('collect'); snd('jingle', { vol: 0.6 });
        hud.toast(`Caught a ${itemName(d.fish)}!`, { icon: d.fish, duration: 2600 });
        floatText?.(d.fish, 1, { x: mine.position.x, y: mine.position.y + 1.6, z: mine.position.z }, mine);
      }
    } else if (mine) {
      const text = d.reason === 'fled' ? 'The fish fled...' : d.reason === 'late' ? 'It got away...' : d.reason === 'timeout' ? 'The line went slack.' : null;
      if (text) { hud.toast(text, { icon: 'sparkle', duration: 1800, minor: true }); snd('bip', { pitch: 0.8 }); }
    }
    if (mine) end(mine);
    void spot;
  });

  return {
    cast, press, cancel, update,
    isFishing: (p) => anglers.has(p),
    angler: (p) => { const a = anglers.get(p); return a ? { phase: a.phase, castId: a.castId, empty: a.empty, t: +a.t.toFixed(3), presses: a.presses.slice(), view: a.view, x: a.x, z: a.z, sent: a.sent, pond: a.pond } : null; },
    /** debug: jump the angler's clock to `lead` s before the next unhit bite (so the very next press is inside the window); returns how many seconds it jumped (the HOST's clock has to follow: fishing.advance) */
    skipToBite(p, lead = 0.05) {
      const a = anglers.get(p);
      if (!a || !a.view || !a.view.bites.length) return 0;
      const stage = anglerStatus(a.view, a.presses, a.t).stage;
      const b = a.view.bites[Math.min(stage, a.view.bites.length - 1)], to = Math.max(a.t, b.at - lead), d = to - a.t;
      a.t = to;
      return d;
    },
    summary() { return { flights: flights.map((f) => ({ fish: f.fish, t: +f.t.toFixed(2), mine: f.mine })), anglers: [...anglers.values()].map((a) => ({ pond: a.pond, phase: a.phase, t: +a.t.toFixed(2), presses: a.presses.length })), drawCalls: bobbers.visible ? 2 : 0, pondS: (id, x, z) => { const q = fishing.pond(id); return q ? pondS(q, x, z) : null; } }; },
    layer: { bobbers, lines },
    dispose() { for (const f of [...flights]) finishFlight(f, false); scene.remove(bobbers, lines); bobberGeo.dispose(); lineGeo.dispose(); },
  };
}
