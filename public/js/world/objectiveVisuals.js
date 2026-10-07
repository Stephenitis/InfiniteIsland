// The look of a section's objective and gate (Step 56), built from the area registry's DATA so later areas get it for free:
//   * gate      a wall of brambles across the section's gate tiles; it sinks away (and shrinks) when the gate opens (state `section` has moved on)
//   * braziers  (`light`) a stone bowl each (all of a section in ONE merged mesh) + ONE instanced flame layer: a cold ember until lit, orange while its wave
//               lasts, mint once done; the section's group only shows while it is the current section
//   * altar     (`collect`) a stone plinth with socket posts; delivered pieces hang above it
//   * pieces    (`collect`) ONE instanced glowing crystal layer: bobbing where it lies, floating above its carrier's head, ringed round the altar once delivered
// Everything is merged / instanced (a handful of draw calls per section) in the usual outlined toon style, and everything is derived from the synced run state
// (state.obj / state.section / state.cleared), so every screen shows the same thing, late joiners included. `effect(fx)` reacts to the host's effect events.
import * as THREE from 'three';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../render/geo.js';
import { toonMat } from '../render/toon.js';
import { AREAS, TILE_SIZE } from '../game/areaLogic.js';

const hash = (a, b = 0) => { const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return n - Math.floor(n); };
const _up = new THREE.Vector3(0, 1, 0);
function tube(a, b, r, color) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length() || 1e-3;
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, d.clone().normalize()), 'XYZ');
  return part(G.cyl6, color, { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], r: [e.x, e.y, e.z], s: [r, len, r] });
}
const FLAME_GEO = new THREE.ConeGeometry(0.3, 0.85, 7).translate(0, 0.42, 0);
const FLAME_ON = new THREE.Color('#ffb347'), FLAME_DONE = new THREE.Color('#9dffb5'), FLAME_COLD = new THREE.Color('#8a7f93');

function brambleGeometry(tiles) {
  const parts = [];
  for (const [i, [tx, tz]] of tiles.entries()) {
    const cx = tx * TILE_SIZE + 1, cz = tz * TILE_SIZE + 1;
    for (let k = 0; k < 3; k++) {
      const h = hash(i * 7 + k, tx), ox = (hash(i, k + 3) - 0.5) * 1.5, oz = (hash(i + 4, k) - 0.5) * 1.5;
      parts.push(part(G.sphereLo, k % 2 ? '#4f7f4d' : '#5f9360', { p: [cx + ox, 0.7 + h * 0.5, cz + oz], s: [0.8, 0.7 + h * 0.4, 0.8] }));
    }
    for (let k = 0; k < 3; k++) {
      const a = [cx - 0.95, 0.15 + hash(i, k + 9) * 1.8, cz + (hash(i, k + 11) - 0.5) * 1.6], b = [cx + 0.95, 0.3 + hash(i, k + 13) * 2.0, cz + (hash(i, k + 15) - 0.5) * 1.6];
      parts.push(tube(a, b, 0.07, k % 2 ? '#4c3b2e' : '#5d4d3a'));
      parts.push(part(G.cone6, '#8b7a64', { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.1, (a[2] + b[2]) / 2 + 0.12], s: [0.04, 0.2, 0.04], r: [Math.PI / 2 + k, k, 0] }));
    }
    parts.push(part(G.sphereLo, '#d3517f', { p: [cx + (hash(i, 21) - 0.5) * 1.4, 0.9 + hash(i, 22) * 0.9, cz + 0.55], s: [0.1, 0.1, 0.1] }));
  }
  return combine(parts);
}
function brazierGeometry(points) {
  const parts = [];
  for (const [x, z] of points) {
    parts.push(part(G.cyl8, '#999eac', { p: [x, 0.12, z], s: [0.7, 0.24, 0.7] }));
    parts.push(part(G.cyl8, '#b2b6c4', { p: [x, 0.62, z], s: [0.26, 0.8, 0.26] }));
    parts.push(part(G.sphere, '#7d7f94', { p: [x, 1.1, z], s: [0.62, 0.34, 0.62] }));
    parts.push(part(G.cyl8, '#c7c6ce', { p: [x, 1.2, z], s: [0.58, 0.08, 0.58] }));
    for (let k = 0; k < 3; k++) parts.push(part(G.sphereLo, k % 2 ? '#6aa462' : '#8cc476', { p: [x + Math.cos(k * 2.1) * 0.5, 0.2, z + Math.sin(k * 2.1) * 0.5], s: [0.2, 0.08, 0.14], r: [0, k, 0] }));
  }
  return combine(parts);
}
function altarGeometry(at) {
  const parts = [part(G.cyl8, '#999eac', { p: [at.x, 0.2, at.z], s: [1.45, 0.4, 1.45] }), part(G.cyl8, '#b2b6c4', { p: [at.x, 0.62, at.z], s: [0.95, 0.5, 0.95] }),
    part(G.cyl8, '#c9c6bb', { p: [at.x, 0.92, at.z], s: [1.05, 0.12, 1.05] })];
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3 + 0.3;
    parts.push(part(G.cyl6, '#a6adbc', { p: [at.x + Math.cos(a) * 1.15, 0.7, at.z + Math.sin(a) * 1.15], s: [0.13, 1.4, 0.13] }));
    parts.push(part(G.sphereLo, '#8cc476', { p: [at.x + Math.cos(a) * 1.15, 1.45, at.z + Math.sin(a) * 1.15], s: [0.16, 0.1, 0.16] }));
  }
  return combine(parts);
}
const baked = (geo, cast = true) => { const m = new THREE.Mesh(geo, VERTEX_TOON); m.add(makeOutline(geo, 0.04)); m.castShadow = cast; m.receiveShadow = true; return m; };

export function createObjectiveVisuals(scene, { particles, sfx } = {}) {
  const entries = [], _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
  for (const area of Object.values(AREAS)) {
    const o = area.origin;
    for (const section of area.sections) {
      const obj = section.objective, gate = section.gate;
      const entry = { area, section, gate: null, group: null, flames: null, flameScale: [], openT: 0, wasOpen: false };
      if (gate) {
        const tiles = [...area.grid.gateTiles.get(gate.id).values()], mesh = baked(brambleGeometry(tiles), false);
        mesh.name = `gate-${gate.id}`; const holder = new THREE.Group(); holder.position.set(o.x, o.y, o.z); holder.add(mesh); holder.visible = false; scene.add(holder);
        entry.gate = { holder, mesh, id: gate.id };
      }
      if (obj.type === 'light' || obj.type === 'collect') {
        const group = new THREE.Group(); group.position.set(o.x, o.y, o.z); group.visible = false; group.name = `objective-${section.id}`; scene.add(group);
        if (obj.type === 'light') {
          const pts = obj.braziers.map((b) => [b.x, b.z]), bowls = baked(brazierGeometry(pts)); bowls.name = 'braziers'; group.add(bowls);
          const flames = new THREE.InstancedMesh(FLAME_GEO, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.92 }), pts.length);
          flames.name = 'brazier-flames'; flames.frustumCulled = false; flames.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          for (let i = 0; i < pts.length; i++) flames.setColorAt(i, FLAME_COLD);
          group.add(flames); entry.flames = flames; entry.flameScale = pts.map(() => 0.2); entry.flamePts = pts;
        } else { const altar = baked(altarGeometry(obj.altar)); altar.name = 'altar'; group.add(altar); }
        entry.group = group;
      }
      entries.push(entry);
    }
  }
  // the pieces: one pool for every collect objective (a run only ever shows one)
  const CAP = 8, pieces = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.34), toonMat('#8fe6ff'), CAP);
  pieces.name = 'objective-pieces'; pieces.frustumCulled = false; pieces.count = 0; pieces.castShadow = true; pieces.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(pieces);

  return {
    entries, pieces,
    /** The host's effect events for this module: a gate opening, a brazier lighting / finishing, a piece picked up / dropped / delivered. */
    effect(fx, Y = 0) {
      const at = { x: fx.x, y: Y + (fx.kind === 'gate' ? 1.2 : 1.0), z: fx.z };
      if (fx.kind === 'gate') { particles?.burst('leaf', at, { count: 16, radius: 1.6, height: 0.6, color: '#6aa462' }); sfx?.play('chime', { pitch: 0.9, vol: 0.6 }); }
      else if (fx.kind === 'brazier') { particles?.burst('sparkle', at, { count: fx.type === 'lit' ? 10 : 14, radius: 0.8, height: 0.8, color: fx.type === 'lit' ? '#ffb347' : '#9dffb5' }); sfx?.play(fx.type === 'lit' ? 'whoosh' : 'chime', { pitch: fx.type === 'lit' ? 0.9 : 1.3, vol: 0.5 }); }
      else if (fx.kind === 'piece') { particles?.burst('sparkle', at, { count: fx.type === 'deliver' ? 14 : 6, radius: 0.6, height: 0.5, color: '#8fe6ff' }); sfx?.play(fx.type === 'deliver' ? 'chime' : 'pop', { pitch: fx.type === 'drop' ? 0.8 : 1.2, vol: 0.5 }); }
    },
    update(state, t, positions, dt = 1 / 60) {
      const active = !!state.active, Y = (AREAS[state.areaId] || AREAS.wildroot).origin.y;
      for (const e of entries) {
        const here = active && (state.areaId || 'wildroot') === e.area.id, idx = e.section.index;
        if (e.gate) {
          const open = here && (state.section > idx || (state.cleared && state.section === idx));
          e.openT = open ? Math.min(1, e.openT + dt / 1.1) : 0;
          e.gate.holder.visible = here && e.openT < 1; e.gate.holder.position.y = e.area.origin.y - e.openT * 2.8; e.gate.holder.scale.y = 1 - e.openT * 0.5;
          e.wasOpen = open;
        }
        if (e.group) {
          e.group.visible = here && state.section === idx;
          if (e.flames && e.group.visible) {
            const braziers = state.obj?.braziers || [];
            for (let i = 0; i < e.flamePts.length; i++) {
              const b = braziers[i], want = b?.done ? 0.8 : b?.lit ? 1 : 0.2;
              e.flameScale[i] += (want - e.flameScale[i]) * (1 - Math.exp(-6 * dt));
              const flick = 1 + (b?.lit ? Math.sin(t * 11 + i * 2) * 0.1 : 0), s = e.flameScale[i];
              _p.set(e.flamePts[i][0], 1.28, e.flamePts[i][1]); _q.identity(); _s.set(s * flick, s * (flick + 0.1 * Math.sin(t * 7 + i)), s * flick);
              e.flames.setMatrixAt(i, _m.compose(_p, _q, _s)); e.flames.setColorAt(i, b?.done ? FLAME_DONE : b?.lit ? FLAME_ON : FLAME_COLD);
            }
            e.flames.instanceMatrix.needsUpdate = true; if (e.flames.instanceColor) e.flames.instanceColor.needsUpdate = true;
          }
        }
      }
      // pieces (collect): where each lies / is carried / was delivered
      const obj = runActive(state) && state.obj?.type === 'collect' ? state.obj : null, n = obj ? Math.min(CAP, obj.pieces.length) : 0;
      pieces.count = n; pieces.visible = n > 0;
      for (let i = 0; i < n; i++) {
        const p = obj.pieces[i], holder = p.holder && positions[p.holder];
        let x = p.x, y = Y + 0.9 + Math.sin(t * 2.4 + i) * 0.14, z = p.z;
        if (holder) { x = holder.x; z = holder.z; y = Y + 2.55 + Math.sin(t * 3 + i) * 0.08; }
        else if (p.delivered) { const a = i * Math.PI * 2 / Math.max(3, obj.pieces.length) + t * 0.5; x = obj.altar.x + Math.cos(a) * 0.65; z = obj.altar.z + Math.sin(a) * 0.65; y = Y + 1.55 + Math.sin(t * 2 + i) * 0.1; }
        _p.set(x, y, z); _q.setFromEuler(_e.set(0.4, t * 1.6 + i, 0)); _s.setScalar(p.delivered ? 0.85 : 1);
        pieces.setMatrixAt(i, _m.compose(_p, _q, _s));
      }
      pieces.instanceMatrix.needsUpdate = true;
    },
    summary: () => entries.map((e) => ({ area: e.area.id, section: e.section.id, gate: !!e.gate, openT: e.openT, group: !!e.group })),
  };
  function runActive(state) { return !!state.active && !!AREAS[state.areaId || 'wildroot']; }
}
