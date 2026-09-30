// Walk-over ground pickups (PLAN Step 13): small pooled 3D items (log, apple, peach, coconut, berries, herb, potato, mushroom) that pop out
// of trees / bushes / dig spots with a little arc + bounce, then bob and spin on the ground until any player walks within
// MAGNET_RADIUS. They fly to that player over ~0.2 s and go into the shared inventory (pop sound, floating "+1 Apple" text).
//
//   const pickups = createPickups({ scene, players, particles, sfx, collect, max: 40 });
//     collect(id, n, worldPos, player)   // injected by main.js: inventory.add + floating text (the same call cooking / quests can use)
//   pickups.spawn('apple', { x, y, z }, { velocity: { x, y, z } })   // pop out (default: a random little arc); returns the pickup or null
//   pickups.spawnTo('log', from, { x, z })                          // pop out on an arc that lands (about) at the target spot
//   pickups.update(dt)                                              // once per tick AFTER players.update
//   pickups.count / pickups.list / pickups.clear() / pickups.vacuum(player)   // (debug) vacuum = fly everything to that player right now
//   pickups.has(id)                                                 // is there a 3D model for this item id?
//
// Rules: a pickup is not collectable during its first COLLECT_DELAY seconds (the pop-out); at most `max` (~40) lie around at once, and when
// a new one would exceed the cap the OLDEST one is auto-collected into the inventory (nothing is ever lost). Pickups are pooled per item
// type (one merged vertex-coloured mesh + outline each), so a spawn allocates nothing after the first of its kind.
// Adding a new ground item: add a builder to MODELS below (origin at the base, roughly 0.3 - 0.5u across) and a catalog.js entry.
import * as THREE from 'three';
import { getHeight, isWalkable } from './terrain.js';
import { G, VERTEX_TOON, part, combine, makeOutline, restOnGround, smoothOutlineGeo } from '../render/geo.js';

const GRAVITY = 22;
const MAGNET_RADIUS = 1.3;
const MAGNET_TIME = 0.22;
const COLLECT_DELAY = 0.4;
const SPAWN_SCALE_TIME = 0.14;
const SIZE_K = 1.3;             // pickups are drawn a bit bigger than life: the fixed camera is ~15u away
const HOVER = 0.1;              // resting height above the ground (bobs around it)
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------------------------------------
// Models: origin at the base, each ONE merged vertex-coloured geometry (+ smoothed outline hull)
// ---------------------------------------------------------------------------------------------
const HALF_PI = Math.PI / 2;
const MODELS = {
  log() {
    const bark = '#a8703f', bark2 = '#c48a55', ring = '#f2cf96', ring2 = '#c98d5a';
    const L = 0.62, R = 0.16;
    const parts = [
      part(new THREE.CylinderGeometry(R, R * 1.04, L, 10, 1, true), bark, { r: [0, 0, HALF_PI] }),
      part(new THREE.CylinderGeometry(R * 0.7, R * 0.72, L * 0.98, 8, 1, true), bark2, { r: [0, 0, HALF_PI], p: [0, R * 0.42, 0] }),
    ];
    for (const sgn of [-1, 1]) {
      parts.push(part(new THREE.CircleGeometry(R * 0.98, 10), ring, { p: [sgn * (L / 2 + 0.004), 0, 0], r: [0, sgn * HALF_PI, 0] }));
      parts.push(part(new THREE.RingGeometry(R * 0.28, R * 0.5, 10), ring2, { p: [sgn * (L / 2 + 0.012), 0, 0], r: [0, sgn * HALF_PI, 0] }));
    }
    parts.push(part(G.ico1, bark, { p: [-0.12, R * 0.9, 0.05], r: [0.5, 0, 0.3], s: [0.05, 0.09, 0.05] }));   // knot
    return { geo: combine(parts), scale: 1.05 };
  },

  apple() {
    const parts = [
      part(G.sphere, '#ff4d5e', { p: [0, 0.2, 0], s: [0.23, 0.2, 0.23] }),
      part(G.sphereLo, '#ff8a94', { p: [-0.09, 0.27, 0.12], s: [0.05, 0.06, 0.03] }),
      part(G.cyl6, '#7a4a2a', { p: [0, 0.42, 0], s: [0.018, 0.09, 0.018] }),
      part(G.sphereLo, '#4fbf5f', { p: [0.07, 0.43, 0], r: [0, 0, -0.4], s: [0.09, 0.028, 0.055] }),
    ];
    return { geo: combine(parts), scale: 1.15 };
  },

  peach() {
    const parts = [
      part(G.sphere, '#ffb08a', { p: [0, 0.21, 0], s: [0.23, 0.21, 0.23] }),
      part(G.sphere, '#ff8f8f', { p: [0.06, 0.2, 0.06], s: [0.17, 0.17, 0.17] }),
      part(G.sphereLo, '#ffd3b8', { p: [-0.08, 0.29, 0.1], s: [0.05, 0.06, 0.03] }),
      part(G.cyl6, '#7a4a2a', { p: [0, 0.42, 0], s: [0.016, 0.07, 0.016] }),
      part(G.sphereLo, '#5fc25a', { p: [-0.07, 0.42, 0], r: [0, 0, 0.4], s: [0.09, 0.028, 0.055] }),
    ];
    return { geo: combine(parts), scale: 1.15 };
  },

  coconut() {
    const parts = [part(G.sphere, '#7a4a2a', { p: [0, 0.25, 0], s: [0.25, 0.25, 0.25] }),
      part(G.sphereLo, '#a06d44', { p: [-0.09, 0.32, 0.14], s: [0.07, 0.09, 0.04] })];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5;
      parts.push(part(G.sphereLo, '#3d2413', { p: [Math.cos(a) * 0.09, 0.47, Math.sin(a) * 0.09], s: [0.045, 0.03, 0.045] }));
    }
    return { geo: combine(parts), scale: 1.1 };
  },

  berry() {
    const cols = ['#ff4d6d', '#ff4d6d', '#ff7a8f'];
    const parts = [];
    [[0, 0.11, 0.09], [-0.09, 0.11, -0.05], [0.09, 0.11, -0.05], [0, 0.24, 0]].forEach((p, i) => {
      parts.push(part(G.sphere, cols[i % 3], { p, s: [0.105, 0.105, 0.105] }));
      parts.push(part(G.sphereLo, '#ffffff', { p: [p[0] - 0.035, p[1] + 0.045, p[2] + 0.07], s: [0.022, 0.022, 0.014] }));
    });
    parts.push(part(G.sphereLo, '#4fbf5f', { p: [0.03, 0.34, 0], r: [0, 0.6, -0.3], s: [0.1, 0.028, 0.06] }));
    parts.push(part(G.sphereLo, '#4fbf5f', { p: [-0.04, 0.33, 0.03], r: [0, -0.5, 0.35], s: [0.09, 0.026, 0.05] }));
    return { geo: combine(parts), scale: 1.2 };
  },

  herb() {
    const parts = [part(G.cyl6, '#2a9e7a', { p: [0, 0.17, 0], s: [0.028, 0.34, 0.028] })];
    const tiers = [[5, 0.17, 0.1, 0.5, '#2fc99a'], [4, 0.28, 0.07, 0.75, '#4fdcae'], [2, 0.38, 0.03, 1.1, '#79edc4']];
    tiers.forEach(([n, y, rad, tilt, col], ti) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + ti * 0.6;
        parts.push(part(G.sphereLo, col, {
          p: [Math.cos(a) * rad, y, Math.sin(a) * rad], r: [0, -a, tilt], s: [0.11, 0.03, 0.075],
        }));
      }
    });
    return { geo: combine(parts), scale: 1.25 };
  },

  potato() {
    const parts = [
      part(G.sphere, '#d9a86e', { p: [0, 0.19, 0], s: [0.27, 0.19, 0.21] }),
      part(G.sphere, '#d9a86e', { p: [0.13, 0.17, 0.03], s: [0.15, 0.14, 0.15] }),
      part(G.sphereLo, '#f2cf96', { p: [-0.1, 0.29, 0.08], s: [0.07, 0.04, 0.04] }),
    ];
    [[-0.08, 0.3, -0.09], [0.1, 0.27, 0.11], [0.02, 0.15, 0.2], [0.18, 0.2, -0.08]].forEach((p) => {
      parts.push(part(G.sphereLo, '#a8743f', { p, s: [0.035, 0.03, 0.035] }));
    });
    return { geo: combine(parts), scale: 1.15 };
  },

  mushroom() {
    const cap = new THREE.SphereGeometry(1, 12, 8, 0, TAU, 0, HALF_PI);
    const parts = [
      part(G.cyl8, '#fff1d6', { p: [0, 0.09, 0], s: [0.065, 0.18, 0.065] }),
      part(cap, '#ff5560', { p: [0, 0.16, 0], s: [0.22, 0.17, 0.22] }),
      part(G.sphereLo, '#ffffff', { p: [-0.08, 0.28, 0.08], s: [0.04, 0.025, 0.04] }),
      part(G.sphereLo, '#ffffff', { p: [0.1, 0.25, 0.02], s: [0.035, 0.022, 0.035] }),
      part(G.sphereLo, '#ffffff', { p: [0, 0.32, -0.06], s: [0.035, 0.022, 0.035] }),
    ];
    cap.dispose();
    return { geo: combine(parts), scale: 1.4 };
  },
};

export function createPickups({ scene, players, particles = null, sfx = null, collect, max = 40 }) {
  const snd = (name, opts) => { if (sfx) sfx.play(name, opts); };
  const root = new THREE.Group();
  root.name = 'pickups';
  scene.add(root);

  const models = {};                         // id -> { geo, outlineGeo, scale }
  const free = {};                           // id -> pooled (hidden) pickups
  const active = [];                         // spawn order (oldest first)
  let time = 0, seq = 0;
  let combo = 0, comboT = 0;                 // rapid pickups climb in pitch

  function modelFor(id) {
    if (models[id]) return models[id];
    const build = MODELS[id];
    if (!build) return null;
    const m = build();
    restOnGround(m.geo);
    m.outlineGeo = smoothOutlineGeo(m.geo);
    models[id] = m;
    return m;
  }

  function take(id) {
    const m = modelFor(id);
    if (!m) return null;
    const pool = (free[id] ||= []);
    let p = pool.pop();
    if (!p) {
      const rootG = new THREE.Group();                        // position (world)
      const tilt = new THREE.Group();                         // spin about Y, squash
      const mesh = new THREE.Mesh(m.geo, VERTEX_TOON);
      mesh.castShadow = false; mesh.receiveShadow = false;    // tiny: skip the shadow pass
      mesh.add(makeOutline(m.geo, 0.028, m.outlineGeo));
      mesh.scale.setScalar(m.scale * SIZE_K);
      tilt.add(mesh);
      rootG.add(tilt);
      root.add(rootG);
      p = { id, root: rootG, tilt, mesh };
    }
    p.root.visible = true;
    return p;
  }

  function release(p) {
    p.root.visible = false;
    const i = active.indexOf(p);
    if (i >= 0) active.splice(i, 1);
    (free[p.id] ||= []).push(p);
  }

  const nearestPlayer = (x, z) => {
    let best = null, bd = Infinity;
    for (const pl of players.list) {
      const d = Math.hypot(pl.position.x - x, pl.position.z - z);
      if (d < bd) { bd = d; best = pl; }
    }
    return best;
  };

  function finish(p, player) {
    const at = { x: p.x, y: p.y + 0.5, z: p.z };
    release(p);
    if (comboT <= 0) combo = 0;
    comboT = 0.6;
    snd('collect', { pitch: 1 + Math.min(combo, 6) * 0.07 });
    combo++;
    if (particles) particles.burst('sparkle', at, { count: 2, radius: 0.18, speed: 0.5, size: 0.7 });
    collect(p.id, 1, at, player || null);
  }

  // ------------------------------------------------------------------ spawning
  function spawn(id, position, { velocity = null, speed = 1 } = {}) {
    if (!MODELS[id]) return null;
    // over the cap: the oldest resting / flying pickup is auto-collected (never lost)
    while (active.length >= max) {
      const old = active.find((q) => q.state !== 'magnet') || active[0];
      const pl = nearestPlayer(old.x, old.z);
      finish(old, pl);
    }
    const p = take(id);
    if (!p) return null;
    const a = Math.random() * TAU;
    const sp = rnd(1.4, 2.8) * speed;
    Object.assign(p, {
      state: 'fly', age: 0, seq: seq++, bounces: 0, phase: Math.random() * TAU, spin: rnd(-7, 7) * (0.6 + speed * 0.4),
      x: position.x, y: position.y, z: position.z,
      vx: velocity ? velocity.x : Math.cos(a) * sp, vy: velocity ? velocity.y : rnd(5.0, 6.6),
      vz: velocity ? velocity.z : Math.sin(a) * sp,
      home: { x: position.x, z: position.z },
      sq: 0, sqv: 0, scale: 0.3, target: null, mt: 0, sx: 0, sy: 0, sz: 0, restT: 0,
    });
    p.tilt.rotation.set(0, Math.random() * TAU, 0);
    p.root.position.set(p.x, p.y, p.z);
    p.root.scale.setScalar(p.scale);
    active.push(p);
    return p;
  }

  /** Pop `id` out of `from` on a ballistic arc that lands at (about) `to` ({x, z}). */
  function spawnTo(id, from, to, opts = {}) {
    const y1 = getHeight(to.x, to.z) + HOVER;
    const vy = 6.4;
    const t = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * Math.max(0, from.y - y1))) / GRAVITY;
    return spawn(id, from, { ...opts, velocity: { x: (to.x - from.x) / t, y: vy, z: (to.z - from.z) / t } });
  }

  // ------------------------------------------------------------------ per-frame
  function settle(p) {
    // came to rest somewhere nobody can walk (deep water / a cliff face): slide it back toward where it came from
    for (let i = 0; i < 10 && !isWalkable(p.x, p.z); i++) {
      p.x += (p.home.x - p.x) * 0.35;
      p.z += (p.home.z - p.z) * 0.35;
    }
  }

  function update(dt) {
    dt = Math.min(dt, 0.1);
    time += dt;
    if (comboT > 0) comboT -= dt;
    const list = players.list;
    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];
      p.age += dt;
      if (p.scale < 1 && p.state !== 'magnet') p.scale = Math.min(1, p.scale + dt / SPAWN_SCALE_TIME * 0.7);

      if (p.state === 'fly') {
        p.vy -= GRAVITY * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.tilt.rotation.y += p.spin * dt;
        const gy = getHeight(p.x, p.z) + HOVER;
        if (p.y <= gy && p.vy < 0) {
          p.y = gy;
          p.bounces++;
          const impact = -p.vy;
          p.sq = Math.min(0.35, impact * 0.045); p.sqv = 0;
          if (impact < 2.4 || p.bounces >= 3) { p.state = 'rest'; p.vy = p.vx = p.vz = 0; settle(p); p.restT = 0; }
          else { p.vy = impact * 0.45; p.vx *= 0.5; p.vz *= 0.5; p.spin *= 0.6; }
        }
      } else if (p.state === 'rest') {
        p.restT += dt;
        const gy = getHeight(p.x, p.z);
        p.y = gy + HOVER + 0.03 * (1 + Math.sin(time * 2.6 + p.phase));
        p.tilt.rotation.y += (1.2 + p.spin * 0.05) * dt;
      }

      // magnet: any active player close enough (not while it is still popping out)
      if (p.state !== 'magnet' && p.age >= COLLECT_DELAY) {
        for (const pl of list) {
          if (pl.away) continue;
          const dx = pl.position.x - p.x, dz = pl.position.z - p.z;
          if (dx * dx + dz * dz < MAGNET_RADIUS * MAGNET_RADIUS && Math.abs(pl.position.y - p.y) < 2.5) {
            p.state = 'magnet'; p.target = pl; p.mt = 0; p.sx = p.x; p.sy = p.y; p.sz = p.z;
            break;
          }
        }
      }

      if (p.state === 'magnet') {
        p.mt += dt;
        const u = Math.min(1, p.mt / MAGNET_TIME);
        const pl = p.target;
        const alive = pl && players.get(pl.index) === pl && !pl.leaving;
        const tx = alive ? pl.position.x : p.sx, ty = (alive ? pl.position.y : p.sy) + 0.9, tz = alive ? pl.position.z : p.sz;
        const e = u * u * (3 - 2 * u) * 0.6 + u * u * 0.4;           // eases in, snaps home
        p.x = p.sx + (tx - p.sx) * e;
        p.y = p.sy + (ty - p.sy) * e + Math.sin(u * Math.PI) * 0.25;
        p.z = p.sz + (tz - p.sz) * e;
        p.tilt.rotation.y += 12 * dt;
        p.scale = 1 - 0.55 * u;
        if (u >= 1) { finish(p, alive ? pl : null); continue; }
      }

      // squash spring (bounce landing)
      p.sqv += (-240 * p.sq - 14 * p.sqv) * dt;
      p.sq += p.sqv * dt;
      p.tilt.scale.set(1 + p.sq * 0.5, 1 - p.sq, 1 + p.sq * 0.5);
      p.root.position.set(p.x, p.y, p.z);
      p.root.scale.setScalar(p.scale);
    }
  }

  return {
    spawn, spawnTo, update,
    has: (id) => !!MODELS[id],
    get count() { return active.length; },
    get list() { return active; },
    max,
    gravity: GRAVITY,
    /** Debug: remove everything without collecting. */
    clear() { for (const p of [...active]) release(p); },
    /** Debug: every pickup (even mid-pop) flies to `player` now. */
    vacuum(player) {
      for (const p of active) {
        if (p.state === 'magnet') continue;
        p.state = 'magnet'; p.target = player; p.mt = 0; p.sx = p.x; p.sy = p.y; p.sz = p.z; p.age = COLLECT_DELAY;
      }
    },
    constants: { GRAVITY, MAGNET_RADIUS, MAGNET_TIME, COLLECT_DELAY },
  };
}
