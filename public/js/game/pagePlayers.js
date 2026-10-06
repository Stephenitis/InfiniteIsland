// Players inside a storybook page (Step 49): every LOCAL player gets a platformer body (game/platformerLogic.js) while a page is open. This module feeds the bodies the
// players' input, copies the result onto the characters (position, turn, jump / fall poses, squash, dust), plays the physics events (jump, landing, thorns, springs, pits),
// runs the hearts / dandelion-puff / campfire respawn rules and notices the berries, letters, campfires and goal a body touches (the host decides: see game/storybook.js).
// The 3D island walking is bypassed through `player.pageDrive` (player/player.js); outside a page nothing here runs.
//
//   const pp = createPagePlayers({ players, avatars, visuals, particles, sfx, hud, getPage, getRun, onClaim(kind, id, player), inBook(player) })
//   pp.update(dt, simTime)       once per tick BEFORE players.update, only while a page is open and this screen shows it
//   pp.afterAvatars()            once per tick after avatars.update: remote players in the page get their floor probe and hide while they are a puff
//   pp.spawn(p)                  put a player on the party's respawn campfire with a fresh body and full hearts       pp.release(p)  back to island walking
//   pp.teleport(p, tx, ty)       (debug) move a body to tile coordinates          pp.bodyOf(p) / pp.lifeOf(p)    pp.refillAll() every player's hearts back to full
//   pp.summary()                 per local player: tile position, velocity, grounded, hearts, state
// Rules: players never collide with each other (Wonder rule). Thorns: -1 heart, a short knock-back and about 1.2 s of blinking invulnerability. The last heart, or a pit,
// turns the player into a dandelion puff for ~1.2 s; then they reappear at the furthest lit campfire with full hearts. No lives, no game over.
import * as THREE from 'three';
import { PAGE, worldToPage, pageToWorld, respawnFire } from './storybookLogic.js';
import { createBody, advance, hurtBody, groundBelow, createLife, hurtLife, fallLife, tickLife, refillLife } from './platformerLogic.js';
import { PLATFORMER as P } from '../config.js';

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

export function createPagePlayers({ players, avatars, visuals, particles, sfx, hud, getPage, getRun, onClaim, inBook, scene }) {
  const states = new Map();                                    // Player -> { body, life, drive, pending: Map, visY, puff: Sprite, blinkT }
  let simT = 0;

  function makePuff(p) {
    const mat = new THREE.SpriteMaterial({ map: puffTexture(), color: p.colors.ui || '#ffffff', transparent: true, depthWrite: false, opacity: 0.95 });
    const sp = new THREE.Sprite(mat);
    sp.visible = false; sp.renderOrder = 6; sp.scale.set(0.9, 0.9, 1);
    scene.add(sp);
    return sp;
  }
  const floorProbe = (page, p) => (x) => {
    const t = worldToPage(page, x, p.position.y);
    const gy = groundBelow(page.grid, t.tx, t.ty + 0.3);
    return gy === null ? null : pageToWorld(page, 0, gy).y;
  };

  function ensure(p) {
    let st = states.get(p);
    if (st) return st;
    st = { body: createBody(0, 0), life: createLife(), drive: { vx: 0, face: 1, grounded: true }, pending: new Map(), visY: 0, puff: null, blinkT: 0, puffPos: new THREE.Vector3() };
    states.set(p, st);
    return st;
  }

  function place(p, st, tx, ty) {
    const w = pageToWorld(getPage(), tx, ty);
    Object.assign(st.body, { x: tx, y: ty, px: tx, py: ty, vx: 0, vy: 0, grounded: false, dead: false, stun: 0, coyote: 0, buffer: 0, acc: 0, air: 0, dropT: 0, jumping: false, pendJump: false });
    p.position.set(w.x, w.y, PAGE.z);
    st.visY = w.y;
  }

  function spawn(p) {
    const page = getPage(); if (!page) return;
    const st = ensure(p), fire = respawnFire(page, getRun());
    st.life = createLife();
    place(p, st, fire.x + ((p.index % 4) - 1.5) * 0.45, fire.y + 0.05);
    p.pageDrive = st.drive; p.groundProbe = floorProbe(page, p);
    p.root.visible = true; p._air = 0;
    if (st.puff) st.puff.visible = false;
  }
  function release(p) {
    const st = states.get(p);
    if (st && st.puff) { st.puff.removeFromParent(); st.puff.material.dispose(); }
    states.delete(p);
    p.pageDrive = null; p.groundProbe = null; p._air = 0; p.root.visible = true; p._puff = false;
  }

  function startPuff(p, st) {
    st.body.dead = true; st.body.vx = 0; st.body.vy = 0; st.drive.vx = 0;
    st.puffPos.set(p.position.x, Math.max(p.position.y, getPage() ? pageToWorld(getPage(), 0, 1.5).y : p.position.y), PAGE.z + 0.2);
    if (!st.puff) st.puff = makePuff(p);
    st.puff.visible = true; st.puff.position.copy(st.puffPos);
    p.root.visible = false; p._air = 0; p._puff = true;
    particles.burst('puff', st.puffPos, { count: 8, radius: 0.6 });
    sfx.play('bip', { pitch: 0.7 });
  }
  function respawn(p, st) {
    const page = getPage(), fire = respawnFire(page, getRun());
    place(p, st, fire.x + ((p.index % 4) - 1.5) * 0.45, fire.y + 0.05);
    p.root.visible = true; p._puff = false; p.root.scale.setScalar(0.01); p.spawnT = 0;
    if (st.puff) st.puff.visible = false;
    particles.burst('sparkle', p.position, { count: 10, radius: 0.7 });
    sfx.play('pop', { pitch: 1.4 });
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
    page.campfires.forEach((f, i) => { if (!run.fires.includes(i) && Math.abs(f.x - b.x) < 1.6 && b.y > f.y - 1.2 && b.y < f.y + 2.5) claim(p, st, 'fire', i); });
    if (!run.cleared && page.goal && Math.abs(page.goal.x - b.x) < 1.4 && b.y > page.goal.y - 1 && b.y < page.goal.y + 6) claim(p, st, 'goal', 0);
  }

  function handleEvents(p, st) {
    const b = st.body;
    for (const e of b.ev) {
      if (e.kind === 'jump') { p.squash(0.2); p.dustBurst(2, 0.6); sfx.play('pop', { pitch: 1.35, vol: 0.5 }); }
      else if (e.kind === 'land') {
        if (e.v > 6) { p.squash(-Math.min(0.28, 0.12 + (e.v - 6) * 0.012)); p.dustBurst(e.v > 11 ? 5 : 3, 1.2); }
        if (e.v > 9) sfx.play('thud', { vol: Math.min(0.5, 0.2 + (e.v - 9) * 0.02) });
      } else if (e.kind === 'bounce') {
        p.squash(0.28); sfx.play('pop', { pitch: 1.9, vol: 0.7 }); sfx.play('chime', { vol: 0.25 });
        if (b.spring) visuals.boing(b.spring.cx, b.spring.cy);
        particles.burst('sparkle', p.position, { count: 6, radius: 0.5 });
      } else if (e.kind === 'drop') sfx.play('bip', { pitch: 1.2, vol: 0.6 });
      else if (e.kind === 'bonk') { sfx.play('thud', { vol: 0.35 }); p.squash(-0.1); }
      else if (e.kind === 'hazard') {
        const r = hurtLife(st.life);
        if (r) {
          const dir = Math.sign(b.x - (e.cx + 0.5)) || -b.face;
          hurtBody(b, dir); p.hurt({ x: dir, z: 0 });
          sfx.play('thud', { vol: 0.7, pitch: 1.5 });
          particles.burst('leaf', p.position, { count: 5, radius: 0.5, color: '#3f7a4a' });
          if (r === 'puff') startPuff(p, st);
        }
      } else if (e.kind === 'fell') {
        if (fallLife(st.life)) startPuff(p, st);
      }
    }
  }

  function update(dt, t) {
    simT = t;
    const page = getPage();
    if (!page) return;
    for (const p of players.list) {
      if (p.away || p.leaving) continue;
      if (!inBook(p)) { if (states.has(p)) release(p); continue; }
      let st = states.get(p);
      if (!st) { spawn(p); st = states.get(p); if (!st) continue; }
      const b = st.body, a = p.actions;
      const idle = p.frozen || p.paused || !a;
      const input = idle ? { move: 0, down: false, jumpPressed: false, jumpHeld: false }
        : { move: a.move.x, down: a.move.z > 0.55, jumpPressed: !!a.jumpPressed, jumpHeld: !!a.jumpHeld };
      const lr = tickLife(st.life, dt);
      if (lr === 'respawn') respawn(p, st);
      if (st.life.state === 'puff') {                          // a dandelion puff drifts up and sways for a moment
        const u = 1 - st.life.puffT / P.puff;
        st.puff.position.set(st.puffPos.x + Math.sin(u * 7) * 0.25, st.puffPos.y + 0.5 + u * 1.6, st.puffPos.z);
        const s = 0.9 + Math.sin(u * 9) * 0.06; st.puff.scale.set(s, s, 1);
        st.puff.material.opacity = 0.95 * Math.min(1, (1 - u) * 4);
        continue;
      }
      const turnFrom = Math.sign(b.vx);
      advance(page.grid, b, input, dt);
      if (turnFrom && Math.sign(b.vx) && Math.sign(b.vx) !== turnFrom && p.speed > 5) p.dustBurst(2, 0.8);
      handleEvents(p, st);
      // copy onto the character (interpolated between the fixed steps; y is eased a little on the floor so slope joins never pop)
      const ix = b.px + (b.x - b.px) * b.alpha, iy = b.py + (b.y - b.py) * b.alpha;
      const w = pageToWorld(page, ix, iy);
      p.position.x = w.x; p.position.z = PAGE.z;
      st.visY = b.grounded && Math.abs(w.y - st.visY) < 0.7 ? st.visY + (w.y - st.visY) * (1 - Math.exp(-40 * dt)) : w.y;
      p.position.y = st.visY;
      st.drive.vx = b.vx; st.drive.face = b.face || 1; st.drive.grounded = b.grounded;
      p._air = b.air;
      if (st.life.invuln > 0) { st.blinkT += dt; p.root.visible = Math.floor(st.blinkT * 14) % 2 === 0; } else if (!p.root.visible && !p._puff) p.root.visible = true;
      scan(p, st);
      for (const [k, at] of st.pending) if (simT - at > PENDING_S * 2) st.pending.delete(k);
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
  }

  return {
    update, afterAvatars, spawn, release,
    teleport(p, tx, ty) { const st = states.get(p) || (spawn(p), states.get(p)); if (st) place(p, st, tx, ty); },
    bodyOf: (p) => (states.get(p) || {}).body || null,
    lifeOf: (p) => (states.get(p) || {}).life || null,
    refillAll() { for (const st of states.values()) refillLife(st.life); },
    get states() { return states; },
    summary() {
      const out = [];
      for (const [p, st] of states) out.push({ slot: p.index, tx: +st.body.x.toFixed(2), ty: +st.body.y.toFixed(2), vx: +st.body.vx.toFixed(2), vy: +st.body.vy.toFixed(2), grounded: st.body.grounded, hearts: st.life.hearts, state: st.life.state, invuln: +st.life.invuln.toFixed(2) });
      return out;
    },
  };
}
