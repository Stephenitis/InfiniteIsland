// Players inside a storybook page (Step 49): every LOCAL player gets a platformer body (game/platformerLogic.js) while a page is open. This module feeds the bodies the
// players' input, copies the result onto the characters (position, turn, jump / fall poses, squash, dust), plays the physics events (jump, landing, thorns, springs, pits),
// runs the hearts / dandelion-puff / campfire respawn rules and notices the berries, letters, campfires and goal a body touches (the host decides: see game/storybook.js).
// The 3D island walking is bypassed through `player.pageDrive` (player/player.js); outside a page nothing here runs.
//
//   const pp = createPagePlayers({ players, avatars, visuals, particles, sfx, hud, getPage, getRun, getGrid, getWorld, onClaim(kind, id, player), inBook(player), makeTools(hurtFrom), dropHeld(player),
//                                  keyOf(player), getCoop(), getWindow(), request(kind, data, player) })   (Step 51: the shared camera window, friends' heads, puffs, toss: see below)
//   (Step 50: getGrid = the run's working grid with the tool gates; makeTools builds game/pageTools.js, the buttons' meaning: Interact = tool, Cancel = grab / throw / twirl)
//   pp.update(dt, simTime)       once per tick BEFORE players.update, only while a page is open and this screen shows it
//   pp.afterAvatars()            once per tick after avatars.update: remote players in the page get their floor probe and hide while they are a puff
//   pp.spawn(p)                  put a player on the party's respawn campfire with a fresh body and full hearts       pp.release(p)  back to island walking
//   pp.teleport(p, tx, ty)       (debug) move a body to tile coordinates          pp.bodyOf(p) / pp.lifeOf(p)    pp.refillAll() every player's hearts back to full
//   pp.summary()                 per local player: tile position, velocity, grounded, hearts, state
// Rules: players never collide with each other (Wonder rule). Thorns: -1 heart, a short knock-back and about 1.2 s of blinking invulnerability. The last heart, or a pit,
// turns the player into a dandelion puff for ~1.2 s; then they reappear at the furthest lit campfire with full hearts. No lives, no game over.
// Step 51 (friends): the body cannot run past the shared camera window (a soft wall, outward only) and the farthest straggler outside it for PAGE_MP.lostDelay becomes a LOST puff (no heart
// lost). A puff (pit, no hearts, or lost) drifts toward the nearest living friend on ANY screen and pops when touched (a request through the host, game/pageCoop.js); alone, or with every
// player a puff, the old rule applies (respawn at the furthest lit campfire after the puff time, or a Jump press). Friends' heads are one-way platforms (game/platformerLogic.js headStep):
// landing bounces or stands you on a friend and you ride along (stacks). A carried friend (game/pageCoop.js lifts) is locked to the carrier's head; a thrown one flies with a short control lock.
// Step 52a (moving things): leaf / log platforms are heads that never bounce (game/pageMotion.js ridePlatforms), gusts push a body sideways and lift a twirl, tide water slows the run, a deep channel is a pit with
// a splash, the Night-Bloom flower / the secret exit are claimed like the goal. All of it is a function of the page clock (`getClock()`, the host's run clock) so every screen agrees.
// Step 52b (Frostpine Slopes): ICE and DRIFT tiles act in the body step (game/platformerLogic.js); a body inside a sled run (page.sleds) is ON A SLED (st.sled): it rides by itself (input.sled), Jump hops, Down ducks, a branch
// it did not duck, thorns or a gap crash it (a puff that respawns at the checkpoint with a fresh sled); a BUDDY (the world's `buddies`, game/pageWorld.js) lends its ability (input.buddy), is taken at a crate (request ride),
// hops away at a buddy gate, when its player is hit (no heart is lost) or when it becomes a puff; a fox DASH meeting a snow wall asks the host to break it; a FALLING icicle hurts like a thorn.
//   pp.others(p)                 the other players of the page as plain records { key, x, y (tile), puff, carried, grounded, local | avatar }       pp.revive(p, tx, ty)   a friend popped the puff
//   pp.tossBody(p, { x, y, vx, vy, lock })   the thrown / set-down body (tile coordinates)       pp.liftTarget(p)   the grounded friend a Cancel press would pick up     pp.stateOf(p)
import * as THREE from 'three';
import { PAGE, worldToPage, pageToWorld, respawnFire } from './storybookLogic.js';
import { createBody, advance, hurtBody, groundBelow, createLife, hurtLife, fallLife, loseLife, reviveLife, tickLife, refillLife, headStep } from './platformerLogic.js';
import { pageWindow, windowBox, holdX, mostOutside, lostTick, puffTarget, driftStep, popCandidate, puffHolds, carriedBy, packPageBits } from './pageCoopLogic.js';
import { PLATFORMER as P, PAGE_MP as MP, PAGE_BLOOM as BLOOM, PAGE_SNOW as SN } from '../config.js';
import { sledAt, branchHit, icicleTouches } from './pageSnowLogic.js';
import { moverHeads, ridePlatforms, windAt, wadeAt, inWater } from './pageMotion.js';

const BERRY_R = 0.85, LETTER_R = 1.15, PENDING_S = 1.2;

let _puffTex = null;
function puffTexture() {
  if (_puffTex || typeof document === 'undefined') return _puffTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 3; g.lineCap = 'round';
  for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * 10, Math.sin(a) * 10); g.lineTo(Math.cos(a) * 46, Math.sin(a) * 46); g.stroke(); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(Math.cos(a) * 50, Math.sin(a) * 50, 6, 0, 7); g.fill(); }
  const grad = g.createRadialGradient(0, 0, 2, 0, 0, 22);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0.35)');
  g.fillStyle = grad; g.beginPath(); g.arc(0, 0, 22, 0, 7); g.fill();
  _puffTex = new THREE.CanvasTexture(c);
  _puffTex.colorSpace = THREE.SRGBColorSpace;
  return _puffTex;
}

export function createPagePlayers({ players, avatars, visuals, particles, sfx, hud, getPage, getRun, getGrid, getWorld, onClaim, inBook, scene, makeTools, dropHeld, keyOf, getCoop, getWindow, request, getClock = () => 0, canBloom = () => false }) {
  const states = new Map();                                    // Player -> { body, life, drive, pending: Map, visY, puff: Sprite, puffP: {x, y, vx, vy} (tile), blinkT, tool, on, rideLast, outT, popAt, tossT, popReq: Map }
  const avatarPuffs = new Map();                               // remote Player (avatar) -> the Sprite of its dandelion puff (Step 51: other screens' puffs are seen too)
  let simT = 0;
  let tools = null;
  const coop = () => (getCoop ? getCoop() : null);
  const none = {};
  const liftsNow = () => { const c = coop(); return c ? c.lifts : none; };

  function makePuff(p) {
    const mat = new THREE.SpriteMaterial({ map: puffTexture(), color: p.colors.ui || '#ffffff', transparent: true, depthWrite: false, opacity: 0.95 });
    const sp = new THREE.Sprite(mat);
    sp.visible = false; sp.renderOrder = 6; sp.scale.set(0.9, 0.9, 1);
    scene.add(sp);
    return sp;
  }
  const floorProbe = (page, p) => (x) => {
    const t = worldToPage(page, x, p.position.y);
    const gy = groundBelow(getGrid() || page.grid, t.tx, t.ty + 0.3);
    return gy === null ? null : pageToWorld(page, 0, gy).y;
  };

  function ensure(p) {
    let st = states.get(p);
    if (st) return st;
    st = {
      body: createBody(0, 0), life: createLife(), drive: { vx: 0, face: 1, grounded: true }, pending: new Map(), visY: 0, puff: null, blinkT: 0,
      puffP: { x: 0, y: 0, vx: 0, vy: 0 }, on: null, rideLast: null, outT: 0, popAt: -9, tossT: 0, popReq: new Map(), carriedPose: false, wriggleAt: -9, preY: 0, preVy: 0, prevX: 0,
      sled: false, dashAsk: -9, crateAt: -9, iceHit: new Set(), duckWas: false,
    };
    states.set(p, st);
    return st;
  }

  function place(p, st, tx, ty) {
    const w = pageToWorld(getPage(), tx, ty);
    Object.assign(st.body, { x: tx, y: ty, px: tx, py: ty, vx: 0, vy: 0, grounded: false, dead: false, stun: 0, coyote: 0, buffer: 0, acc: 0, air: 0, dropT: 0, jumping: false, pendJump: false, pendTwirl: false, twirlT: 0, twirled: false, pounding: false, hops: 0, dashT: 0, dashCool: 0, gliding: false, duck: false, pendDash: false });
    p.spinAdd = 0; st.on = null; st.rideLast = null; st.outT = 0; st.tossT = 0; st.sled = false; st.iceHit.clear();
    if (tools && st.tool) tools.reset(st);
    p.position.set(w.x, w.y, PAGE.z);
    st.visY = w.y;
  }

  function spawn(p) {
    const page = getPage(); if (!page) return;
    const st = ensure(p), fire = respawnFire(page, getRun());
    st.life = createLife();
    place(p, st, fire.x + ((p.index % 4) - 1.5) * 0.45, fire.y + 0.05);
    p.pageDrive = st.drive; p.groundProbe = floorProbe(page, p);
    p.root.visible = true; p._air = 0; p._puff = false; p._puffKind = 'none';
    if (st.puff) st.puff.visible = false;
  }
  function release(p) {
    const st = states.get(p);
    p.spinAdd = 0; if (p.setPose && st && ((st.tool && st.tool.carryPose) || st.carriedPose)) p.setPose(null);
    if (st && st.puff) { st.puff.removeFromParent(); st.puff.material.dispose(); }
    states.delete(p);
    p.pageDrive = null; p.groundProbe = null; p._air = 0; p.root.visible = true; p._puff = false; p._puffKind = 'none'; p._pageBits = 0; p._pageToolCode = 0;
  }

  // ---- the other players of the page, local bodies and remote avatars alike (tile coordinates) -------------------------------------------------------------------
  function others(p) {
    const page = getPage(), out = [], lifts = liftsNow();
    if (!page) return out;
    for (const [q, s] of states) {
      if (q === p || q.away || q.leaving) continue;
      const k = keyOf(q), puff = s.life.state === 'puff';
      out.push({ key: k, x: puff ? s.puffP.x : s.body.x, y: puff ? s.puffP.y - 0.7 : s.body.y, puff, carried: carriedBy(lifts, k) !== null, grounded: s.body.grounded, face: s.body.face, local: q, kind: s.life.kind });
    }
    for (const a of avatars.list) {
      if (a === p || a.away || !inBook(a) || (a.position.x === 0 && a.position.y === 0)) continue;
      const t = worldToPage(page, a.position.x, a.position.y), k = `${a.screen}:${a.index}`, puff = !!a._puff;
      out.push({ key: k, x: t.tx, y: puff ? t.ty - 0.7 : t.ty, puff, carried: carriedBy(lifts, k) !== null, grounded: !a._air, face: a.facing >= 0 ? 1 : -1, avatar: a, kind: a._puffKind || 'none' });
    }
    return out;
  }

  /** The buddy of this player (if any) hops away: the host decides (request buddyEnd), every screen reacts to the rec. */
  function endBuddy(p, why) { const w = getWorld(); if (w && w.buddies[keyOf(p)]) request('buddyEnd', { why }, p, true); }

  // ---- puffs ---------------------------------------------------------------------------------------------------------------------------------------------------
  function startPuff(p, st, kind = 'hearts') {
    const b = st.body;
    st.sled = false; endBuddy(p, 'lost');
    b.dead = true; b.vx = 0; b.vy = 0; st.drive.vx = 0; st.on = null; st.rideLast = null;
    if (tools) tools.reset(st);
    p.spinAdd = 0;
    st.puffP.x = b.x; st.puffP.y = Math.max(b.y + 0.7, 1.5); st.puffP.vx = 0; st.puffP.vy = 1.5;
    st.life.kind = kind === 'pit' || kind === 'lost' ? kind : st.life.kind;
    const w = pageToWorld(getPage(), st.puffP.x, st.puffP.y);
    if (!st.puff) st.puff = makePuff(p);
    st.puff.visible = true; st.puff.position.set(w.x, w.y, PAGE.z + 0.2);
    p.root.visible = false; p._air = 0; p._puff = true; p._puffKind = st.life.kind;
    particles.burst('puff', st.puff.position, { count: 8, radius: 0.6 });
    sfx.play('bip', { pitch: kind === 'lost' ? 1.1 : 0.7 });
    if (st.carriedPose) { st.carriedPose = false; p.setPose(null); }
  }
  function respawn(p, st) {
    const page = getPage(), fire = respawnFire(page, getRun());
    place(p, st, fire.x + ((p.index % 4) - 1.5) * 0.45, fire.y + 0.05);
    p.root.visible = true; p._puff = false; p._puffKind = 'none'; p.root.scale.setScalar(0.01); p.spawnT = 0;
    if (st.puff) st.puff.visible = false;
    particles.burst('sparkle', p.position, { count: 10, radius: 0.7 });
    sfx.play('pop', { pitch: 1.4 });
  }
  /** A friend popped this player's puff (the host decided: game/pageCoop.js): back at tile (tx, ty) with full hearts (pit / zero hearts) or the hearts it had (a lost puff), blinking. */
  function revive(p, tx, ty) {
    const st = states.get(p);
    if (!st || st.life.state !== 'puff') return false;
    reviveLife(st.life);
    place(p, st, tx, ty);
    p.root.visible = true; p._puff = false; p._puffKind = 'none'; p.root.scale.setScalar(0.01); p.spawnT = 0;
    if (st.puff) st.puff.visible = false;
    particles.burst('sparkle', p.position, { count: 14, radius: 0.8 });
    sfx.play('pop', { pitch: 1.6 }); sfx.play('chime', { vol: 0.5 });
    return true;
  }
  /** One frame of a local puff: drift toward the nearest living friend, bob, and ask to be popped when one touches it. -> true when it should respawn alone. */
  function puffFrame(p, st, dt, friends) {
    const target = puffTarget(st.puffP, friends);
    driftStep(st.puffP, target, dt);
    const bob = Math.sin(simT * 5 + p.index) * 0.18;
    const w = pageToWorld(getPage(), st.puffP.x, st.puffP.y + bob);
    st.puff.position.set(w.x, w.y, PAGE.z + 0.2);
    const sc = 0.9 + Math.sin(simT * 7 + p.index) * 0.06; st.puff.scale.set(sc, sc, 1);
    st.puff.material.opacity = 0.95;
    p.position.set(w.x, w.y, PAGE.z);                                  // (the pose packets carry the puff's place: friends on other screens pop it from there)
    const hit = popCandidate(st.puffP, friends);
    if (hit && simT - st.popAt > 0.6) { st.popAt = simT; request('pop', { target: keyOf(p), by: hit.key }, p, true); }
  }
  /** Remote puffs: a sprite on every screen, and the living local players touching one ask the host to pop it. */
  function remotePuffs(page) {
    const live = new Set();
    for (const a of avatars.list) {
      if (!a._puff || !inBook(a) || a.away) continue;
      live.add(a);
      let sp = avatarPuffs.get(a);
      if (!sp) { sp = makePuff(a); avatarPuffs.set(a, sp); }
      sp.visible = true;
      sp.position.set(a.position.x, a.position.y + Math.sin(simT * 5 + a.index) * 0.18, PAGE.z + 0.2);
      const sc = 0.9 + Math.sin(simT * 7 + a.index) * 0.06; sp.scale.set(sc, sc, 1);
      const t = worldToPage(page, a.position.x, a.position.y), k = `${a.screen}:${a.index}`;
      for (const [q, st] of states) {
        if (st.life.state !== 'alive' || st.body.dead || carriedBy(liftsNow(), keyOf(q)) !== null) continue;
        const at = st.popReq.get(k);
        if (at !== undefined && simT - at < 0.6) continue;
        if (popCandidate({ x: t.tx, y: t.ty }, [{ key: keyOf(q), x: st.body.x, y: st.body.y }])) { st.popReq.set(k, simT); request('pop', { target: k, by: keyOf(q) }, q, true); }
      }
    }
    for (const [a, sp] of avatarPuffs) if (!live.has(a)) { sp.removeFromParent(); sp.material.dispose(); avatarPuffs.delete(a); }
  }

  function claim(p, st, kind, id) {
    const key = `${kind}:${id}`;
    const at = st.pending.get(key);
    if (at !== undefined && simT - at < PENDING_S) return;
    st.pending.set(key, simT);
    onClaim(kind, id, p);
  }

  function scan(p, st) {
    const page = getPage(), run = getRun(), b = st.body;
    if (!page || b.dead || st.life.state !== 'alive') return;
    const cx = b.x, cy = b.y + 0.7;
    for (let i = 0; i < page.berries.length; i++) {
      if (run.berries.includes(i)) continue;
      const e = page.berries[i];
      if (Math.abs(e.x - cx) < BERRY_R && Math.abs(e.y - cy) < BERRY_R && Math.hypot(e.x - cx, e.y - cy) < BERRY_R) claim(p, st, 'berry', i);
    }
    for (const l of page.letters) if (!run.letters.includes(l.ch) && Math.hypot(l.x - cx, l.y - cy) < LETTER_R) claim(p, st, 'letter', l.ch);
    const world = getWorld();
    for (const f of page.flowers) {
      if ((run.flowers || []).includes(f.id) || (f.buried !== null && !(world && world.dug.includes(f.buried)))) continue;
      if (Math.hypot(f.x - cx, f.y - cy) < LETTER_R) claim(p, st, 'flower', f.id);
    }
    page.campfires.forEach((f, i) => { if (!run.fires.includes(i) && Math.abs(f.x - b.x) < 1.6 && b.y > f.y - 1.2 && b.y < f.y + 2.5) claim(p, st, 'fire', i); });
    if (!run.cleared && page.goal && Math.abs(page.goal.x - b.x) < 1.4 && b.y > page.goal.y - 1 && b.y < page.goal.y + 6) claim(p, st, 'goal', 0);
    if (!run.secret && page.secret && Math.abs(page.secret.x - b.x) < 1.3 && b.y > page.secret.y - 1 && b.y < page.secret.y + 3) claim(p, st, 'secret', 0);
    if (page.bloom && canBloom() && Math.hypot(page.bloom.x - cx, page.bloom.y + 0.8 - cy) < BLOOM.reach) claim(p, st, 'bloom', 0);
    if (world && page.crates.length && !world.buddies[keyOf(p)]) {                                    // Step 52b: touching a buddy crate takes its critter (or the snow hare)
      page.crates.forEach((c, i) => { if (Math.abs(c.x - b.x) < SN.buddyReach && b.y > c.y - 0.6 && b.y < c.y + 2 && simT - st.crateAt > 1.2) { st.crateAt = simT; request('ride', { crate: i }, p, true); } });
    }
    if (world && world.icicles.length) {                                                              // a falling icicle hurts like a thorn (once each)
      for (const ic of world.icicles) {
        if (ic.st !== 'fall') { st.iceHit.delete(ic.id); continue; }
        if (!st.iceHit.has(ic.id) && icicleTouches(ic, b)) { st.iceHit.add(ic.id); hurtFrom(p, st, Math.sign(b.x - ic.x) || -b.face); }
      }
    }
  }

  /** A thorn, an enemy or a seed touches the player: -1 heart, knock-back, the last heart is a puff. Whatever the player carries is put down. -> true when it hurt (not while invulnerable). */
  function hurtFrom(p, st, dir) {
    const bw = getWorld();
    if (bw && bw.buddies[keyOf(p)] && st.life.state === 'alive') {                                  // Step 52b: a buddy takes the hit: it hops away, nobody loses a heart
      if (st.life.invuln > 0) return false;
      hurtBody(st.body, dir); p.hurt({ x: dir, z: 0 }); st.life.invuln = SN.buddyBlink;
      sfx.play('thud', { vol: 0.6, pitch: 1.7 }); particles.burst('sparkle', p.position, { count: 6, radius: 0.6 });
      if (tools) tools.reset(st);
      endBuddy(p, 'hit'); st.on = null;
      return true;
    }
    const r = hurtLife(st.life);
    if (!r) return false;
    const b = st.body;
    hurtBody(b, dir); p.hurt({ x: dir, z: 0 });
    sfx.play('thud', { vol: 0.7, pitch: 1.5 });
    particles.burst('leaf', p.position, { count: 5, radius: 0.5, color: '#3f7a4a' });
    if (tools) tools.reset(st);
    if (dropHeld) dropHeld(p);
    st.on = null;
    if (r === 'puff') startPuff(p, st, 'hearts');
    return true;
  }

  function handleEvents(p, st) {
    const b = st.body;
    for (const e of b.ev) {
      if (tools) tools.onEvent(p, st, e, simT);
      if (e.kind === 'jump') { p.squash(0.2); p.dustBurst(2, 0.6); sfx.play('pop', { pitch: e.sled ? 1.1 : 1.35, vol: 0.5 }); }
      else if (e.kind === 'dash') { p.squash(0.25); p.dustBurst(5, 1.1); sfx.play('whoosh', { pitch: 1.2, vol: 0.7 }); }
      else if (e.kind === 'glide') { sfx.play('whoosh', { pitch: 1.7, vol: 0.4 }); particles.burst('sparkle', p.position, { count: 4, radius: 0.5, color: '#e8f6ff' }); }
      else if (e.kind === 'flutter') { p.squash(0.2); sfx.play('pop', { pitch: 1.8 - e.left * 0.15, vol: 0.5 }); particles.burst('sparkle', p.position, { count: 5, radius: 0.5, color: '#fff2b0' }); }
      else if (e.kind === 'land') {
        if (e.soft) { p.dustBurst(4, 1.0); particles.burst('puff', p.position, { count: 3, radius: 0.5, color: '#f4f8ff' }); }
        else if (e.v > 6) { p.squash(-Math.min(0.28, 0.12 + (e.v - 6) * 0.012)); p.dustBurst(e.v > 11 ? 5 : 3, 1.2); }
        if (e.v > 9) sfx.play('thud', { vol: Math.min(0.5, 0.2 + (e.v - 9) * 0.02) });
      } else if (e.kind === 'bounce') {
        p.squash(0.28); sfx.play('pop', { pitch: 1.9, vol: 0.7 }); sfx.play('chime', { vol: 0.25 });
        if (b.spring) visuals.boing(b.spring.cx, b.spring.cy);
        particles.burst('sparkle', p.position, { count: 6, radius: 0.5 });
      } else if (e.kind === 'drop') sfx.play('bip', { pitch: 1.2, vol: 0.6 });
      else if (e.kind === 'bonk') { sfx.play('thud', { vol: 0.35 }); p.squash(-0.1); }
      else if (e.kind === 'hazard') { if (st.sled) crash(p, st, 'thorns'); else hurtFrom(p, st, Math.sign(b.x - (e.cx + 0.5)) || -b.face); }
      else if (e.kind === 'fell') {
        if (fallLife(st.life)) startPuff(p, st, 'pit');
      }
    }
  }

  /** A sled crash (a branch, thorns): straight to a puff; the sled is gone and the player comes back at the checkpoint with a fresh one. */
  function crash(p, st, what) {
    if (st.life.state !== 'alive') return;
    if (!fallLife(st.life)) return;
    const w2 = pageToWorld(getPage(), st.body.x, st.body.y + 0.6);
    particles.burst('shard', { x: w2.x, y: w2.y, z: PAGE.z + 0.4 }, { count: 9, radius: 0.8, color: '#a8723f' });
    particles.burst('puff', { x: w2.x, y: w2.y, z: PAGE.z + 0.4 }, { count: 6, radius: 0.8, color: '#f4f8ff' });
    sfx.play('crack', { vol: 0.8 });
    startPuff(p, st, 'pit');
  }

  // ---- friends' heads: land / bounce / stand / ride (all local bodies, after every body moved) ---------------------------------------------------------------------
  function ridePass(page, grid, riders) {
    riders.sort((a, b) => a.st.body.y - b.st.body.y);                           // lower bodies first: a stack settles from the bottom up
    const plats = page.movers && page.movers.length ? moverHeads(page, getClock()) : [];     // (Step 52a: leaf / log platforms; they never bounce a landing)
    for (const { p, st } of riders) {
      const b = st.body;
      if (b.dead || st.life.state !== 'alive' || carriedBy(liftsNow(), keyOf(p)) !== null) { st.on = null; st.rideLast = null; continue; }
      const heads = others(p).filter((f) => !f.puff && !f.carried).map((f) => ({ id: f.key, x: f.x, top: f.y + MP.headH, f })).concat(plats);
      const res = ridePlatforms(grid, b, { y: st.preY, vy: st.preVy }, heads, st, { jumpHeld: !!(p.actions && p.actions.jumpHeld) });
      const friend = res.head && res.head.f;
      if (res.kind === 'land') { p.squash(-0.14); if (friend) { sfx.play('pop', { pitch: 0.8, vol: 0.4 }); boing(friend, -0.2); } else sfx.play('pop', { pitch: 0.6, vol: 0.25 }); p.dustBurst(2, 0.5); }
      else if (res.kind === 'bounce') {
        b.px = b.x; b.py = b.y; b.spring = null;
        p.squash(0.26); sfx.play('pop', { pitch: 1.5, vol: 0.7 }); particles.burst('sparkle', p.position, { count: 5, radius: 0.5 });
        boing(friend, -0.3);
      }
    }
  }
  function boing(f, amount) {
    const q = f && (f.local || f.avatar);
    if (q && q.squash) q.squash(amount);
  }

  // ---- left behind: the shared window ----------------------------------------------------------------------------------------------------------------------------
  function windowPoints(skip) {
    const pts = [];
    for (const [q, s] of states) { if (q === skip || s.life.state !== 'alive' || q.away || carriedBy(liftsNow(), keyOf(q)) !== null) continue; pts.push({ key: keyOf(q), x: q.position.x, y: q.position.y, vx: s.body.vx }); }
    for (const a of avatars.list) { if (a.away || !inBook(a) || a._puff || (a.position.x === 0 && a.position.y === 0)) continue; pts.push({ key: `${a.screen}:${a.index}`, x: a.position.x, y: a.position.y, vx: a.velocity.x }); }
    return pts;
  }

  function update(dt, t) {
    simT = t;
    const page = getPage();
    if (!page) return;
    const grid = getGrid() || page.grid, win = getWindow ? getWindow() : null, lifts = liftsNow(), cp = coop();
    const box = win ? windowBox(win, MP.holdInset) : null;
    const wx0 = pageToWorld(page, 0, 0).x;                                      // (the window is in world x; bodies in tile x)
    const moved = [];
    for (const p of players.list) {
      if (p.away || p.leaving) continue;
      if (!inBook(p)) { if (states.has(p)) release(p); continue; }
      let st = states.get(p);
      if (!st) { spawn(p); st = states.get(p); if (!st) continue; }
      const b = st.body, a = p.actions, myKey = keyOf(p);
      const idle = p.frozen || p.paused || !a;
      const carrier = carriedBy(lifts, myKey);
      const input = idle ? { move: 0, down: false, jumpPressed: false, jumpHeld: false }
        : { move: a.move.x, down: a.move.z > 0.55, jumpPressed: !!a.jumpPressed, jumpHeld: !!a.jumpHeld };
      if (!idle && page.gusts && page.gusts.length) { const w = windAt(page, b.x, b.y + 0.7, getClock()); if (w.vx || w.lift) input.wind = w; }
      if (!idle && page.tide && wadeAt(page, b.x, b.y, getClock())) input.wade = true;
      const world = getWorld(), bd = world ? world.buddies[myKey] || null : null;
      if (bd) input.buddy = bd.ability;                                          // Step 52b: a buddy lends its ability
      const seg = page.sleds.length && st.life.state === 'alive' && !carrier ? sledAt(page, b.x) : null;
      if (!!seg !== st.sled) {                                                   // mounted on the sled at the run's start / the sled slides off at its end
        st.sled = !!seg;
        if (seg) { sfx.play('pop', { pitch: 0.9, vol: 0.6 }); particles.burst('puff', p.position, { count: 5, radius: 0.6, color: '#f4f8ff' }); }
        else particles.burst('puff', p.position, { count: 6, radius: 0.7, color: '#f4f8ff' });
      }
      if (st.sled) { input.sled = { speed: SN.sled.speed }; if (b.duck && !st.duckWas) p.squash(-0.22); }
      st.duckWas = b.duck;
      const friends = st.life.state === 'puff' ? others(p).filter((f) => !f.puff && !f.carried) : null;
      if (friends && !puffHolds(friends.length, st.life.puffAge) && !idle && a.jumpPressed && st.life.puffAge >= MP.puffMinJump) st.life.puffT = 0;     // alone / everybody a puff: Jump turns the page early
      if (tools && st.life.state === 'alive' && !carrier) tools.frame(p, st, idle || st.sled ? null : a, dt, t, input);
      const lr = tickLife(st.life, dt, friends ? puffHolds(friends.length, st.life.puffAge) : false);
      if (lr === 'respawn') respawn(p, st);
      if (st.life.state === 'puff') { puffFrame(p, st, dt, friends); continue; }
      if (carrier && cp) {                                                      // carried: glued to the carrier's head, only Jump (wriggle free) is listened to
        const c = cp.posOf(carrier);
        if (c) {
          b.x = c.x; b.y = c.y + MP.liftH; b.px = b.x; b.py = b.y; b.vx = 0; b.vy = 0; b.grounded = true; b.air = 0; b.dead = false; st.on = null; st.rideLast = null; b.acc = 0;
          if (!st.carriedPose) { st.carriedPose = true; p.setPose([-2.4, 0.5, 0, 0]); }
          if (!idle && a.jumpPressed && simT - st.wriggleAt > 0.4) { st.wriggleAt = simT; request('wriggle', {}, p, true); }
          st.preY = b.y; st.preVy = 0;
          moved.push({ p, st, still: true });
          continue;
        }
      } else if (st.carriedPose) { st.carriedPose = false; p.setPose(null); }
      if (st.tossT > 0) { st.tossT -= dt; if (b.grounded && st.tossT < MP.tossLock - MP.tossFree) { b.stun = 0; st.tossT = 0; } }
      st.preY = b.y; st.preVy = b.vy; st.prevX = b.x;
      const turnFrom = Math.sign(b.vx);
      advance(grid, b, input, dt);
      if (turnFrom && Math.sign(b.vx) && Math.sign(b.vx) !== turnFrom && p.speed > 5) p.dustBurst(2, 0.8);
      handleEvents(p, st);
      if (st.life.state === 'alive' && st.sled && branchHit(page, b)) crash(p, st, 'branch');        // (a low branch the rider did not duck)
      if (st.life.state === 'alive' && bd && page.buddyGates.some((g) => st.prevX < g && b.x >= g)) endBuddy(p, 'gate');       // (a buddy gate: the buddy hops away)
      if (st.life.state === 'alive' && b.dashT > 0 && world && simT - st.dashAsk > 0.2) {                // a fox dash against a snow wall: the host breaks the whole wall
        const d = b.face >= 0 ? 1 : -1;
        for (let k = 0; k < 3 && simT - st.dashAsk > 0.2; k++) for (let dy = 0; dy <= 1; dy++) {
          const cx = Math.floor(b.x + d * (0.45 + k * 0.5)), cy = Math.floor(b.y + 0.2 + dy);
          if (world.grid.kind(cx, cy) === 'J') { st.dashAsk = simT; request('dash', { cx, cy }, p, true); break; }
        }
      }
      if (st.life.state === 'alive' && page.waters && page.waters.length && inWater(page, b.x, b.y)) {            // a deep channel: a pit with a splash
        const w2 = pageToWorld(page, b.x, b.y);
        particles.burst('sparkle', { x: w2.x, y: w2.y + 0.5, z: PAGE.z + 0.4 }, { count: 10, radius: 0.7, color: '#9fe3ff' }); sfx.play('thud', { vol: 0.3, pitch: 1.8 });
        if (fallLife(st.life)) startPuff(p, st, 'pit');
      }
      if (tools && st.life.state === 'alive') tools.afterStep(p, st, t);
      if (st.life.state === 'alive' && box) holdX(b, st.prevX, box.left - wx0, box.right - wx0);        // the soft wall at the shared window's edge
      moved.push({ p, st });
    }
    // friends' heads (needs every body moved first)
    ridePass(page, grid, moved.filter((m) => !m.still && m.st.life.state === 'alive'));
    // who is left behind (only the one farthest outside the window; never alone)
    let outKey = null;
    if (win) {
      const pts = windowPoints(null);
      if (pts.length >= 2) { const i = mostOutside(pts, win); if (i >= 0) outKey = pts[i].key; }
    }
    for (const { p, st, still } of moved) {
      const b = st.body, myKey = keyOf(p);
      if (st.life.state === 'alive' && !still) {
        st.outT = lostTick(st.outT, outKey === myKey, dt);
        if (st.outT >= MP.lostDelay) { st.outT = 0; if (loseLife(st.life)) { if (dropHeld) dropHeld(p); startPuff(p, st, 'lost'); continue; } }
      }
      // copy onto the character (interpolated between the fixed steps; y is eased a little on the floor so slope joins never pop)
      const ix = b.px + (b.x - b.px) * b.alpha, iy = b.py + (b.y - b.py) * b.alpha;
      const w = pageToWorld(page, ix, iy);
      p.position.x = w.x; p.position.z = PAGE.z;
      st.visY = b.grounded && !st.on && !still && Math.abs(w.y - st.visY) < 0.7 ? st.visY + (w.y - st.visY) * (1 - Math.exp(-40 * dt)) : w.y;
      p.position.y = st.visY;
      st.drive.vx = b.vx; st.drive.face = b.face || 1; st.drive.grounded = b.grounded;
      p._air = b.air;
      if (st.life.invuln > 0) { st.blinkT += dt; p.root.visible = Math.floor(st.blinkT * 14) % 2 === 0; } else if (!p.root.visible && !p._puff) p.root.visible = true;
      scan(p, st);
      for (const [k, at] of st.pending) if (simT - at > PENDING_S * 2) st.pending.delete(k);
    }
    for (const [p, st] of states) {                                             // (the pose packets carry what the others should show: puff kind, carrying / carried, twirl, the page tool)
      const w = getWorld(), key = keyOf(p);
      p._pageBits = packPageBits({
        carryObj: !!(w && (w.enemies.some((e) => e.holder === key) || w.objects.some((o) => o.holder === key))), carryFriend: key in lifts, carried: carriedBy(lifts, key) !== null,
        twirl: st.body.twirlT > 0, puff: st.life.state === 'puff' ? st.life.kind : 'none', sled: st.sled, duck: !!st.body.duck,
      });
    }
    for (const p of [...states.keys()]) if (!players.list.includes(p)) release(p);
  }

  function afterAvatars() {
    const page = getPage();
    for (const a of avatars.list) {
      if (!page || !inBook(a)) { if (a.groundProbe) { a.groundProbe = null; a._puff = false; } continue; }
      if (!a.groundProbe) a.groundProbe = floorProbe(page, a);
      if (a._puff) a.root.visible = false;
    }
    if (page) remotePuffs(page); else for (const [a, sp] of avatarPuffs) { sp.removeFromParent(); sp.material.dispose(); avatarPuffs.delete(a); }
  }

  /** (page closing) forget the puff sprites of remote players */
  function clearRemote() { for (const [a, sp] of avatarPuffs) { sp.removeFromParent(); sp.material.dispose(); avatarPuffs.delete(a); } }

  /** The grounded friend a Cancel press would pick up: close, alive, free. -> the `others` record or null */
  function liftTarget(p) {
    const st = states.get(p); if (!st || !st.body.grounded || st.life.state !== 'alive') return null;
    let best = null, bd = Infinity;
    for (const f of others(p)) {
      if (f.puff || f.carried || !f.grounded || f.key in liftsNow()) continue;
      const dx = Math.abs(f.x - st.body.x), dy = Math.abs(f.y - st.body.y);
      if (dx <= MP.liftReach && dy <= 1.0 && dx < bd) { bd = dx; best = f; }
    }
    return best;
  }
  /** The thrown / set-down body of a lifted friend (tile coordinates). */
  function tossBody(p, { x, y, vx = 0, vy = 0, lock = MP.tossLock }) {
    const st = states.get(p); if (!st || st.life.state !== 'alive') return;
    place(p, st, x, y);
    const b = st.body;
    b.vx = vx; b.vy = vy; b.grounded = false; b.stun = lock; st.tossT = lock; if (vx) b.face = Math.sign(vx);
    if (st.carriedPose) { st.carriedPose = false; p.setPose(null); }
    p.squash(0.2);
  }

  tools = makeTools ? makeTools(hurtFrom, { liftTarget, others, carryingFriend: (p) => keyOf(p) in liftsNow() }) : null;
  return {
    update, afterAvatars, spawn, release, tools, hurtFrom, others, revive, tossBody, liftTarget, clearRemote,
    stateOf: (p) => states.get(p) || null,
    teleport(p, tx, ty) { const st = states.get(p) || (spawn(p), states.get(p)); if (st) place(p, st, tx, ty); },
    /** (debug / stress) turn a player into a puff of the given kind right now */
    forcePuff(p, kind = 'pit') { const st = states.get(p); if (!st || st.life.state !== 'alive') return false; if (kind === 'lost') loseLife(st.life); else if (kind === 'hearts') { st.life.hearts = 0; st.life.state = 'puff'; st.life.puffT = P.puff; st.life.kind = 'hearts'; st.life.puffAge = 0; } else fallLife(st.life); startPuff(p, st, kind); return true; },
    bodyOf: (p) => (states.get(p) || {}).body || null,
    lifeOf: (p) => (states.get(p) || {}).life || null,
    refillAll() { for (const st of states.values()) refillLife(st.life); },
    get states() { return states; },
    summary() {
      const out = [];
      for (const [p, st] of states) out.push({ slot: p.index, tx: +st.body.x.toFixed(2), ty: +st.body.y.toFixed(2), vx: +st.body.vx.toFixed(2), vy: +st.body.vy.toFixed(2), grounded: st.body.grounded, hearts: st.life.hearts, state: st.life.state, kind: st.life.kind, on: st.on, invuln: +st.life.invuln.toFixed(2), twirl: +st.body.twirlT.toFixed(2), pound: !!(st.tool && st.tool.pound), pogo: !!(st.tool && st.tool.pogo), outT: +st.outT.toFixed(2), sled: st.sled, duck: !!st.body.duck, hops: st.body.hops, dashT: +st.body.dashT.toFixed(2) });
      return out;
    },
  };
}
