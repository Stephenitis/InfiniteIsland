// The hop-course runtime (PLAN Step 68a): everything around the pure rules in game/hopLogic.js that needs a scene, sounds or a clock. One instance per screen, created once at load in main.js.
//
//   const hop = createHopCourses({ scene, players, particles, sfx, world, sync, hudRoot })
//   hop.add(course, { island: 'ember' })     register a course (the rules registry + its visuals); the pads are drawn only while that island is in full detail
//   hop.remove(course)                       unregister (the pads vanish)
//   hop.update(dt)                           once per tick: moving pads, the next-pad glint, the fade
//   hop.summary()                            { courses, pads, drawCalls, ... } debug
//
// What it does: points game/hopLogic.js at the shared host clock (sync.hostNow() / 1000: every screen sees a moving pad in the same place) and at the terrain; fills the hopEvents hooks that player.js calls
// for LOCAL players (jump / land sounds, the splash burst + the quick fade + the pop back: no damage, no hearts, no lost items); builds each course's pads as ONE merged mesh + outline hull (still pads) and
// a small mesh per moving pad; and draws a dotted glint ring on the next pad of the main route for each local player (HOP_COURSE.assists.glint).
import * as THREE from 'three';
import { HOP_COURSE } from '../config.js';
import { getHeight } from './terrain.js';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../render/geo.js';
import { setHopClock, setHopTerrain, registerCourse, unregisterCourse, hopEvents, padPos, nextOnRoute, hopTime } from '../game/hopLogic.js';

const SIDE = { rock: '#8d8990', stump: '#a97a4c', bamboo: '#d6c06e', crust: '#3c3441', wet: '#6f8497', deck: '#b58a58' };
const TOP = { rock: '#aaa5aa', stump: '#d9b27a', bamboo: '#efdc8c', crust: '#5a4a52', wet: '#9db4c6', deck: '#d2a870' };
const BOX = new THREE.BoxGeometry(1, 1, 1);

/** Geometry of one pad (world position `at`, or the origin for a moving pad): a column from below the water up to the top, a lighter cap, a few pebbles / rings. */
function padParts(pad, at) {
  const kind = pad.kind in SIDE ? pad.kind : 'rock', parts = [], low = -0.9, h = pad.top - low;
  const cx = at.x, cz = at.z;
  if (pad.r !== undefined) {
    const r = pad.r;
    parts.push(part(G.cyl8, SIDE[kind], { p: [cx, low + h / 2, cz], s: [r, h, r], r: [0, pad.top * 5, 0] }));
    parts.push(part(G.cyl8, TOP[kind], { p: [cx, pad.top - 0.03, cz], s: [r * 0.94, 0.07, r * 0.94], r: [0, pad.top * 5, 0] }));
    if (kind === 'stump') parts.push(part(G.cyl8, '#b98a58', { p: [cx, pad.top + 0.005, cz], s: [r * 0.55, 0.05, r * 0.55] }));        // the tree rings
    if (kind === 'crust') parts.push(part(G.cyl8, '#ff8a3d', { p: [cx, pad.top + 0.01, cz], s: [r * 0.5, 0.04, r * 0.5] }));          // the glowing cracks (a lit mesh arrives with Step 68b)
    for (let k = 0; k < 3; k++) {                                                                                                       // pebbles round the foot
      const a = pad.top * 9 + k * 2.1;
      parts.push(part(G.sphereLo, SIDE[kind], { p: [cx + Math.cos(a) * r * 1.02, 0.02, cz + Math.sin(a) * r * 1.02], s: [0.22, 0.14, 0.2], r: [0, a, 0] }));
    }
  } else {
    parts.push(part(BOX, SIDE[kind], { p: [cx, low + h / 2, cz], s: [pad.w, h, pad.d], r: [0, -(pad.rot || 0), 0] }));
    parts.push(part(BOX, TOP[kind], { p: [cx, pad.top - 0.03, cz], s: [pad.w * 0.96, 0.07, pad.d * 0.96], r: [0, -(pad.rot || 0), 0] }));
  }
  return parts;
}

function glintGeometry() {
  const parts = [];
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; parts.push(part(G.sphereLo, '#ffffff', { p: [Math.cos(a), 0, Math.sin(a)], s: [0.09, 0.03, 0.09] })); }
  return combine(parts);
}

export function createHopCourses({ scene, players, particles = null, sfx = null, world = null, sync, hudRoot = null }) {
  setHopClock(() => sync.hostNow() / 1000);
  setHopTerrain({ height: (x, z) => getHeight(x, z) });
  const entries = [];                       // { course, island, group, still, movers: [{pad, mesh}], built }
  const rings = [];                         // one glint ring per local player (pooled)
  let ringGeo = null, ringMat = null;
  const lastPad = new WeakMap();
  let fade = null, fadeT = 0, fadeDir = 0;
  const snd = (n, o) => { if (sfx) sfx.play(n, o); };

  // ---- the quick fade of a splash (one local player alone on the screen only: on a shared screen it would blank everybody's view)
  function ensureFade() {
    if (fade || !hudRoot || typeof document === 'undefined') return fade;
    fade = document.createElement('div');
    fade.className = 'hop-fade';
    fade.style.cssText = 'position:fixed;inset:0;background:#0d3350;opacity:0;pointer-events:none;z-index:40;transition:opacity 0.18s ease-out';
    hudRoot.appendChild(fade);
    return fade;
  }
  const setFade = (v) => { const f = ensureFade(); if (f) f.style.opacity = String(v); };

  hopEvents.onJump = (p) => { snd('bip', { pitch: 1.35, vol: 0.5 }); };
  hopEvents.onLand = (p, impact) => { if (impact > 3) snd('thud', { pitch: 1.6, vol: 0.35 }); };
  hopEvents.onSplash = (p, delay) => {
    const at = { x: p.position.x, y: Math.max(0, p.position.y) + 0.1, z: p.position.z };
    if (particles) {
      particles.burst('puff', at, { count: 9, radius: 0.5, height: 0.5, size: 1.1, speed: 1.4, color: '#bfe6ff' });
      particles.burst('sparkle', at, { count: 8, radius: 0.5, height: 0.7, color: '#9fd8ff', speed: 1.3 });
    }
    snd('splash', { vol: 0.8 });
    if (players.list.length <= 1 && ensureFade()) { fade.style.transitionDuration = `${delay * 0.8}s`; setFade(0.85); }
  };
  hopEvents.onRespawn = (p) => {
    snd('pop', { pitch: 1.3, vol: 0.6 });
    if (particles) particles.burst('sparkle', { x: p.position.x, y: p.position.y + 0.3, z: p.position.z }, { count: 7, radius: 0.5, height: 0.6, speed: 1.0 });
    if (fade) { fade.style.transitionDuration = `${HOP_COURSE.splash.fade}s`; setFade(0); }
  };

  function build(entry) {
    const { course } = entry;
    entry.group = new THREE.Group();
    entry.group.name = `hop-course-${course.id}`;
    const still = [];
    entry.movers = [];
    for (const pad of course.pads) {
      if (pad.motion) {
        const geo = combine(padParts(pad, { x: 0, z: 0 }));
        const mesh = new THREE.Mesh(geo, VERTEX_TOON);
        mesh.receiveShadow = true;
        mesh.add(makeOutline(geo, 0.04));
        entry.group.add(mesh);
        entry.movers.push({ pad, mesh });
      } else still.push(...padParts(pad, pad));
    }
    if (still.length) {
      const geo = combine(still);
      entry.still = new THREE.Mesh(geo, VERTEX_TOON);
      entry.still.receiveShadow = true;
      entry.still.frustumCulled = false;
      entry.still.add(makeOutline(geo, 0.04));
      entry.group.add(entry.still);
    }
    scene.add(entry.group);
    entry.built = true;
  }
  function dispose(entry) {
    if (!entry.group) return;
    entry.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    scene.remove(entry.group);
    entry.group = null; entry.built = false; entry.still = null; entry.movers = [];
  }

  function ringFor(i) {
    if (!ringGeo) { ringGeo = glintGeometry(); ringMat = new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.9, depthWrite: false }); }
    while (rings.length <= i) { const m = new THREE.Mesh(ringGeo, ringMat); m.visible = false; m.renderOrder = 5; m.frustumCulled = false; scene.add(m); rings.push(m); }
    return rings[i];
  }

  function update(dt) {
    const t = hopTime();
    for (const e of entries) {
      const full = !world || !world.regions || world.regions.isFull(e.island);
      if (full && !e.built) build(e);
      else if (!full && e.built) dispose(e);
      if (!e.built) continue;
      for (const m of e.movers) { const p = padPos(m.pad, t); m.mesh.position.set(p.x + (p.tremble ? Math.sin(t * 60) * 0.035 : 0), p.top - m.pad.top, p.z); }
    }
    // the next-pad glint, one ring per local player inside a course
    let used = 0;
    if (HOP_COURSE.assists.glint) {
      for (const p of players.list) {
        const c = p._course, cb = p._cb;
        if (!c || !cb || cb.splash) continue;
        const entry = entries.find((e) => e.course === c);
        if (!entry || !entry.built) continue;
        if (cb.pad) lastPad.set(p, cb.pad);
        const last = lastPad.get(p) || null;
        const nextId = last ? nextOnRoute(c, last) : (c.route ? c.route[0] : null);
        const pad = nextId ? c.pads.find((q) => q.id === nextId) : null;
        if (!pad) continue;
        const pos = padPos(pad, t), ring = ringFor(used++);
        const r = (pad.r !== undefined ? pad.r : Math.min(pad.w, pad.d) / 2) * 0.72, pulse = 1 + 0.06 * Math.sin(t * 4);
        ring.visible = true;
        ring.position.set(pos.x, pos.top + 0.06, pos.z);
        ring.scale.set(r * pulse, 1, r * pulse);
        ring.rotation.y = t * 0.6;
      }
    }
    for (let i = used; i < rings.length; i++) rings[i].visible = false;
  }

  return {
    add(course, { island = 'ember' } = {}) {
      if (entries.some((e) => e.course === course)) return;
      entries.push({ course, island, group: null, still: null, movers: [], built: false });
      registerCourse(course);
    },
    remove(course) {
      const i = entries.findIndex((e) => e.course === course);
      if (i < 0) return;
      dispose(entries[i]);
      entries.splice(i, 1);
      unregisterCourse(course);
    },
    update,
    has: (course) => entries.some((e) => e.course === course),
    summary() {
      let calls = 0;
      for (const e of entries) if (e.group) e.group.traverse((o) => { if (o.isMesh && o.visible) calls += 1; });
      return { courses: entries.map((e) => ({ id: e.course.id, pads: e.course.pads.length, built: e.built })), drawCalls: calls + rings.filter((r) => r.visible).length, rings: rings.filter((r) => r.visible).length };
    },
  };
}
