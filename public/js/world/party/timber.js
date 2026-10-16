// Timber Trim's stage (Step 80a): a sunny log yard with four flume lanes side by side, a chute at the top of each, a berry-paint ring where the axe lands, a stump for each player beside their lane, and Bramble
// the beaver judging from a little lookout. A log is TWO half-meshes per lane (so a chop can split it anywhere): the pair slides down the lane by game/party/timberLogic.js logFrac(); a cut leaves two unequal
// halves that drift apart. Built once (lazily), hidden outside the game; ONE Group at the stage centre.
//
//   const w = createTimberWorld({ scene, sfx, particles, labels })
//   w.setVisible(on)         w.update(dt, { mode: 'practice' | 'wait' | 'play', v, t })    v = timberLogic.view(g, t) in play; 'practice' loops one demo log down every lane; 'wait' shows the chutes
//   w.onRec(rec, v)          presentation of a game record: a cut (chips, a chop sound, a label: "Bramble's Bite!" for a dead-on one) or a whiff
//   w.practicePress(laneIdx, t) -> { pts, d } | null     the judging of a practice chop (nothing scores; the same numbers as the real game)
//   w.laneX(i)               world x of lane i's centre      w.scoreText(v, slot) -> { text, out }      w.cam      w.look ('warm')
// Draw calls: base 1 (+outline), ring paint 1, up to 8 half-logs (no outlines, no shadows), Bramble ~8; about 25.
import * as THREE from 'three';
import { PARTY } from '../../config.js';
import { stageCentre } from '../../game/party/partyArea.js';
import { buildLogs, logFrac, pointsFor, bitesFor } from '../../game/party/timberLogic.js';
import { createNpcModel } from '../../npc/models.js';
import { part, G, VERTEX_TOON, combine } from '../../render/geo.js';
import { solid, glow, disc, ring, box, post, ball } from './kit.js';

const T = PARTY.timber, O = PARTY.origin;
const centre = stageCentre('timber');
export const CAM = { focus: { x: centre.x + 0.8, y: O.y + 0.6, z: centre.z + 1.0 }, offset: { x: 0, y: 16.5, z: 14.5 }, extent: { w: 28, d: 27 } };
const LOG_R = 0.52, LOG_LEN = 2.0, TROUGH_Y = 0.35;

const KIND = {
  pine: { bark: '#a9733f', dark: '#7a4f2a', cap: '#f0c88f' },
  birch: { bark: '#f4f1e8', dark: '#3a3340', cap: '#f6dfae' },
  palm: { bark: '#9a8a64', dark: '#6f6044', cap: '#e8d4a0' },
  breadfruit: { bark: '#7a5a3c', dark: '#4fa84a', cap: '#e8c88a' },
};
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14, 1);
/** A unit-length log (along z) of a kind: bark with dark marks, lighter end caps. Scaled in z per half. */
function logGeo(kind) {
  const k = KIND[kind];
  const parts = [part(CYL, k.bark, { r: [Math.PI / 2, 0, 0], s: [LOG_R, 1, LOG_R] }),
    part(CYL, k.cap, { p: [0, 0, 0.5], r: [Math.PI / 2, 0, 0], s: [LOG_R * 0.9, 0.02, LOG_R * 0.9] }), part(CYL, k.cap, { p: [0, 0, -0.5], r: [Math.PI / 2, 0, 0], s: [LOG_R * 0.9, 0.02, LOG_R * 0.9] })];
  for (let i = 0; i < 5; i++) parts.push(part(G.sphereLo, k.dark, { p: [Math.cos(i * 1.7) * LOG_R * 0.98, Math.sin(i * 1.7) * LOG_R * 0.98, -0.35 + i * 0.17], s: [0.11, 0.07, 0.07] }));
  return parts;
}

export function createTimberWorld({ scene, sfx, particles, labels }) {
  const root = new THREE.Group();
  root.name = 'party-timber';
  root.position.set(centre.x, O.y, centre.z);
  root.visible = false;
  scene.add(root);
  const geos = [];

  // ---- the yard: lanes (troughs), chutes, end bins, stumps for the players, benches, the lookout
  const base = [disc(44, '#79b85a', [0, 0, 0], 0.5), disc(15.5, '#8ccd66', [0, 0.02, 0], 0.2)];
  for (const lx of T.lanes) {
    base.push(box(2.3, 0.3, T.endZ - T.chuteZ + 1.4, '#6b4a30', [lx, 0, (T.endZ + T.chuteZ) / 2]));                          // the flume floor
    base.push(box(0.2, 0.55, T.endZ - T.chuteZ + 1.4, WOOD_D(), [lx - 1.2, 0, (T.endZ + T.chuteZ) / 2]), box(0.2, 0.55, T.endZ - T.chuteZ + 1.4, WOOD_D(), [lx + 1.2, 0, (T.endZ + T.chuteZ) / 2]));
    base.push(box(2.5, 0.9, 1.5, '#b57a4e', [lx, 0, T.chuteZ - 1.1]), box(2.8, 0.25, 1.9, '#e8453c', [lx, 0.95, T.chuteZ - 1.1]));            // the chute hopper with a little roof
    base.push(box(2.6, 0.8, 1.6, '#8a5a3c', [lx, 0, T.endZ + 1.4]));                                                                           // the catch bin
  }
  T.lanes.forEach((lx) => base.push(disc(1.3, '#c8935a', [lx + T.standDX, 0.1, T.markZ], 0.2), disc(1.0, '#e0b27a', [lx + T.standDX, 0.12, T.markZ], 0.05)));    // the players' stumps
  [-6, -2, 2, 6].forEach((x) => base.push(disc(1.35, '#a77a4e', [x, 0.1, T.spectatorZ], 0.2)));
  // Bramble's lookout (east): a little platform with railings and a roof
  base.push(box(3.4, 1.6, 3.4, '#b57a4e', [13.4, 0, -5.4]), box(3.6, 0.22, 3.6, '#8a5a3c', [13.4, 1.6, -5.4]), post(0.12, 2.2, '#8a5a3c', [11.9, 1.6, -3.9]), post(0.12, 2.2, '#8a5a3c', [14.9, 1.6, -3.9]), box(4.0, 0.2, 4.0, '#e8453c', [13.4, 3.8, -5.4]));
  // trees at the back
  for (let i = 0; i < 12; i++) {
    const a = Math.PI + 0.25 + (i / 11) * (Math.PI - 0.5), r = 17.2 + (i % 3) * 1.4, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 2.4 + (i % 3) * 0.5;
    base.push(post(0.36, h, '#9a6a44', [x, 0, z]), ball(1.6, i % 2 ? '#58c96b' : '#4fb865', [x, h + 1, z], [1, 0.9, 1]));
  }
  const baseMesh = solid(base, { outline: 0.04 });
  baseMesh.name = 'timber-base';
  root.add(baseMesh); geos.push(baseMesh.geometry);
  const rings = glow(T.lanes.map((lx) => ring(0.55, 0.95, '#ff5a8c', [lx, TROUGH_Y + 0.31, T.markZ], 0.04)));       // the berry-paint rings
  rings.name = 'timber-rings';
  root.add(rings); geos.push(rings.geometry);

  // ---- the logs: 2 halves per lane
  const kindGeo = {};
  for (const k of Object.keys(KIND)) { const geo = combine(logGeo(k)); kindGeo[k] = { geo }; geos.push(geo); }            // (no outline hulls and no shadows on the logs: the stage is kept under the draw-call budget)
  const lanes = T.lanes.map((lx) => {
    const mk = () => { const m = new THREE.Mesh(kindGeo.pine.geo, VERTEX_TOON); m.castShadow = false; m.visible = false; root.add(m); return m; };
    return { lx, a: mk(), b: mk(), kind: null, cutAge: -1, cutLocal: 0, cutI: -1, whiffI: -1, whiffAge: -1 };
  });
  function setKind(lane, kind) {
    if (lane.kind === kind) return;
    lane.kind = kind;
    for (const m of [lane.a, lane.b]) m.geometry = kindGeo[kind].geo;
  }

  // ---- Bramble
  const bramble = createNpcModel('beaver');
  bramble.root.scale.setScalar(1.35);
  bramble.root.position.set(13.4, 1.82, -5.4);
  bramble.root.rotation.y = -0.5;
  root.add(bramble.root);

  // ---- practice demo logs: one per lane, looping (a gentle log, no wobble)
  const demo = buildLogs(1)[0];
  const DEMO_PERIOD = demo.dur + 1.4;
  const demoAt = (t, lane) => {                                             // the demo log of a lane at time t: shifted so the lanes do not all chop at once
    const k = Math.floor((t - lane * 0.35) / DEMO_PERIOD), start = k * DEMO_PERIOD + lane * 0.35;
    return { ...demo, start: start + 0.2, pass: start + 0.2 + (demo.pass - demo.start), kind: ['pine', 'birch', 'palm', 'breadfruit'][((k % 4) + 4) % 4], k };
  };

  let t0 = 0;
  const logZ = (L, t) => T.chuteZ + (T.endZ - T.chuteZ) * logFrac(L, t);
  function place(lane, L, t, cut, whiff) {
    setKind(lane, L.kind);
    const z = logZ(L, t), age = cut ? Math.max(0, t - cut.at) : 0;
    const tilt = Math.sin((t - L.start) * 3 + lane.lx) * L.wob * 0.5;
    const y = TROUGH_Y + 0.32 + LOG_R * 0.9 + Math.abs(tilt) * 0.2;
    lane.b.visible = !!cut;
    lane.a.visible = true;
    const fall = whiff ? Math.max(0, z - (T.endZ - 0.6)) * 0.7 : 0;
    if (!cut) {
      lane.a.position.set(lane.lx, y - fall, z); lane.a.scale.set(1, 1, LOG_LEN); lane.a.rotation.set(0, tilt * 0.4, 0);
      return;
    }
    const half = LOG_LEN / 2, cl = Math.max(-half * 0.85, Math.min(half * 0.85, cut.local)), gap = Math.min(0.5, age * 1.8);
    const la = cl + half, lb = LOG_LEN - la;                                // lengths before / after the cut (A is the back half: smaller z)
    lane.a.position.set(lane.lx, y - Math.min(0.1, age * 0.3), z - half + la / 2 - gap / 2); lane.a.scale.set(1, 1, Math.max(0.05, la - 0.02)); lane.a.rotation.set(0, 0, 0);
    lane.b.position.set(lane.lx + Math.min(0.9, age * 1.6), y + Math.min(0.2, age * 0.6) - Math.max(0, age - 0.35) * 1.4, z + half - lb / 2 + gap / 2); lane.b.scale.set(1, 1, Math.max(0.05, lb - 0.02)); lane.b.rotation.set(0, age * 1.4, Math.min(1.0, age * 2.0));
  }

  const cuts = new Map();                                                  // `${lane}:${i}` -> { at, local } (the log's cut, from the record)
  function update(dt, { mode = 'wait', v = null, t = 0 } = {}) {
    if (!root.visible) return;
    t0 += dt;
    // Bramble nods / stretches
    bramble.torso.rotation.z = Math.sin(t0 * 1.1) * 0.03;
    bramble.armL.rotation.x = -0.35 + Math.sin(t0 * 1.7) * 0.12; bramble.armR.rotation.x = -0.35 - Math.sin(t0 * 1.7) * 0.12;
    bramble.tail.rotation.y = Math.sin(t0 * 1.5) * 0.25;
    bramble.headGroup.rotation.x += (0 - bramble.headGroup.rotation.x) * Math.min(1, dt * 8);
    if (mode === 'play' && v) {
      lanes.forEach((lane, i) => {
        const slot = v.slots[i];
        const L = slot === undefined ? null : v.logs.find((l) => t >= l.start && t <= l.start + l.dur + 0.45);
        if (!L) { lane.a.visible = lane.b.visible = false; return; }
        const c = (v.cuts[slot] || []).find((x) => x.i === L.i);
        let cut = null;
        if (c && c.d !== null) {
          const k = `${i}:${L.i}`;
          cut = cuts.get(k);
          if (!cut) { cut = { at: L.pass + c.d / 1000, local: T.markZ - logZ(L, L.pass + c.d / 1000) }; cuts.set(k, cut); }
        }
        place(lane, L, Math.min(t, L.start + L.dur + 0.4), cut, !!(c && c.d === null));
      });
    } else if (mode === 'practice') {
      lanes.forEach((lane, i) => {
        const L = demoAt(t0, i);
        const e = t0 - L.start;
        if (e < 0 || e > L.dur + 0.4) { lane.a.visible = lane.b.visible = false; return; }
        const c = cuts.get(`p${i}:${L.k}`);
        place(lane, L, t0, c ? { at: c.at, local: c.local } : null, false);
      });
    } else { for (const lane of lanes) lane.a.visible = lane.b.visible = false; if (mode === 'wait') cuts.clear(); }
  }

  /** A practice chop of lane i at the current practice time: judge it against the demo log, remember the cut, make the sounds. */
  function practicePress(i, p) {
    const L = demoAt(t0, i), d = t0 - L.pass;
    if (Math.abs(d) > T.win) return null;
    const pts = pointsFor(d);
    cuts.set(`p${i}:${L.k}`, { at: t0, local: T.markZ - logZ(L, t0) });
    chopFx(i, pts, p);
    return { pts, d };
  }

  function chopFx(i, pts, p) {
    const lx = T.lanes[i], at = { x: centre.x + lx, y: O.y + TROUGH_Y + 1.1, z: centre.z + T.markZ };
    particles?.burst('chip', at, { count: pts >= 100 ? 14 : 8, radius: 0.35 });
    if (pts >= 100) particles?.burst('sparkle', at, { count: 10, radius: 0.5, color: '#ffe27a' });
    sfx?.play('chop', { pitch: 0.9 + pts / 300 });
    if (pts >= 100) sfx?.play('chime', { pitch: 1.5, vol: 0.7 });
    bramble.headGroup.rotation.x = 0.4;
    const bites = bitesFor(pts);
    labels?.label(pts >= 100 ? "Bramble's Bite!" : pts <= 0 ? 'Miss' : `${bites} bite${bites === 1 ? '' : 's'}`, at, pts >= 100 ? '#ffe27a' : pts <= 0 ? '#ffb0b0' : '#ffffff');
  }

  return {
    root, update, practicePress, cam: CAM, look: 'warm',
    setVisible(on) { root.visible = !!on; if (!on) { cuts.clear(); labels?.clear?.(); for (const l of lanes) l.a.visible = l.b.visible = false; } },
    laneX: (i) => centre.x + T.lanes[i],
    onRec(rec, v) {
      if (!root.visible || !v) return;
      const i = v.slots.indexOf(rec.slot);
      if (i < 0) return;
      if (rec.k === 'cut') chopFx(i, rec.pts);
      else if (rec.k === 'whiff') sfx?.play('whoosh', { vol: 0.35, pitch: 1.1 });
    },
    scoreText(v, slot) { return v ? { text: `${v.totals[slot] ?? 0}`, out: false } : { text: '', out: false }; },
    clearPractice() { cuts.clear(); },
    summary() { let calls = 0; root.traverse((o) => { if (o.isMesh && o.visible) calls++; }); return { visible: root.visible, meshes: calls }; },
    dispose() { for (const g of geos) g.dispose(); bramble.dispose?.(); scene.remove(root); },
  };
}

function WOOD_D() { return '#8a5a3c'; }
