// Pinecone Huddle's stage (Step 80b): a quiet snowy pine grove, one stump per player in a row, Myodette on a snowy rock calling it calmly. A drop (a pinecone or a snow clump) falls on each stump on that
// player's own schedule: a shadow grows on the snow and a whistle sounds, then it lands. A player who holds the button is closed inside a pinecone SHELL (a mesh that closes over the character); a drop on
// an open player dazes them under a heap of snow. A thin bar in front of each stump shows how much shell is left. Built once (lazily), hidden outside the game; ONE Group at the stage centre.
//
//   const w = createHuddleWorld({ scene, sfx, particles, labels })
//   w.setVisible(on)         w.update(dt, { mode: 'practice' | 'wait' | 'play', v, t })    v = huddleLogic.view(g, t) in play; 'practice' drops a gentle demo cone on every stump that nothing scores; 'wait' shows the grove
//   w.onRec(rec, v)          presentation of a record: the shell clack, the daze (a snow heap, a word)
//   w.setPracticeHold(laneIdx, on)   the local hold in the how-to's practice (the shell closes over that lane)        w.practiceState(laneIdx)
//   w.scoreText(v, slot) -> { text, out }      w.stumpSpot(i)      w.cam      w.look ('snow')      w.clearPractice()
// Draw calls: base 1 (+outline), Myodette ~8, up to 4 shells, 4 drops, 4 shadows, 4 meter bars and 4 snow heaps while they show; about 20 at most.
import * as THREE from 'three';
import { stageLivingLifecycle, hostIdle } from './livingStage.js';
import { PARTY, TDOONGZ } from '../../config.js';
import { stageCentre } from '../../game/party/partyArea.js';
import { closedAt } from '../../game/party/huddleLogic.js';
import { createTdoongModel } from '../../npc/tdoongz.js';
import { part, G, VERTEX_TOON, combine } from '../../render/geo.js';
import { solid, disc, ring, ball } from './kit.js';

const H = PARTY.huddle, O = PARTY.origin;
const centre = stageCentre('huddle');
export const CAM = { focus: { x: centre.x, y: O.y + 0.6, z: centre.z + 1.6 }, offset: { x: 0, y: 15, z: 13.5 }, extent: { w: 27, d: 22 } };
const FALL_FROM = 10.5, HIT_Y = 1.7, STUMP_TOP = 0.16;
const CYL = new THREE.CylinderGeometry(1, 1, 1, 40, 1);
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const wp = (x, y, z) => ({ x: centre.x + x, y: O.y + y, z: centre.z + z });
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const METER_COLOR = ['#7fe3b0', '#ffe27a', '#ff9a7a'];

function pine(parts, x, z, h, snowy) {
  parts.push(part(G.cyl8, '#7a5236', { p: [x, h * 0.18, z], s: [0.22 * h / 4, h * 0.36, 0.22 * h / 4] }));
  const tiers = [[0.32, 0.5, 1.5, '#25725a'], [0.58, 0.4, 1.15, '#2b7e60'], [0.8, 0.32, 0.8, '#329067']];
  for (const [y, hh, r, c] of tiers) {
    parts.push(part(G.cone6, c, { p: [x, h * y, z], s: [r * h / 4, hh * h, r * h / 4] }));
    if (snowy) parts.push(part(G.cone6, '#f4f9ff', { p: [x, h * (y + 0.05), z], s: [r * 0.78 * h / 4, hh * h * 0.62, r * 0.78 * h / 4] }));
  }
}

/** One pinecone drop (unit scale ~0.5 u): an ovoid with rows of overlapping scales. */
function coneGeo() {
  const parts = [part(G.sphere, '#7a5230', { p: [0, 0, 0], s: [0.3, 0.44, 0.3] })];
  for (let r = 0; r < 4; r++) {
    const y = -0.3 + r * 0.2, rad = r === 0 || r === 3 ? 0.17 : 0.27, n = 7 - (r === 3 ? 2 : 0);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r * 0.45;
      parts.push(part(G.sphereLo, (k + r) % 2 ? '#b8844c' : '#9a6a3e', { p: [Math.cos(a) * rad, y, Math.sin(a) * rad], r: [0, -a, 0.5], s: [0.13, 0.1, 0.07] }));
    }
  }
  parts.push(part(G.cyl6, '#5a3c22', { p: [0, 0.46, 0], s: [0.05, 0.14, 0.05] }));
  return combine(parts);
}
/** A snow clump: a cluster of white lumps. */
function clumpGeo() {
  return combine([
    part(G.sphere, '#ffffff', { p: [0, 0, 0], s: [0.4, 0.34, 0.4] }), part(G.sphere, '#e8f1fb', { p: [0.24, -0.1, 0.1], s: [0.24, 0.2, 0.24] }),
    part(G.sphere, '#f4f9ff', { p: [-0.22, 0.12, -0.1], s: [0.22, 0.2, 0.22] }), part(G.sphere, '#dbe8f6', { p: [-0.1, -0.16, 0.2], s: [0.2, 0.16, 0.2] }),
  ]);
}
/** The pinecone shell that closes over a player: a tall ovoid of overlapping scales with a bud on top (about 1 u wide, 1.9 u tall). */
function shellGeo() {
  const parts = [part(G.sphere, '#6e4a2a', { p: [0, 0.92, 0], s: [0.82, 1.0, 0.82] })];
  const rows = [[0.18, 0.86, 9], [0.52, 0.98, 10], [0.9, 1.02, 10], [1.28, 0.9, 9], [1.58, 0.62, 7]];
  rows.forEach(([y, rad, n], r) => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (r % 2) * 0.33;
      parts.push(part(G.sphereLo, (k + r) % 3 === 0 ? '#7a5230' : (k + r) % 2 ? '#b8844c' : '#9a6a3e', { p: [Math.cos(a) * rad * 0.86, y, Math.sin(a) * rad * 0.86], r: [0, -a, 0.55], s: [0.34, 0.2, 0.2] }));
    }
  });
  parts.push(part(G.cone6, '#5a3c22', { p: [0, 1.98, 0], s: [0.18, 0.4, 0.18] }));
  return combine(parts);
}
function heapGeo() {
  return combine([
    part(G.sphere, '#ffffff', { p: [0, 0.3, 0], s: [1.15, 0.7, 1.05] }), part(G.sphere, '#f4f9ff', { p: [0.6, 0.18, 0.3], s: [0.5, 0.36, 0.5] }),
    part(G.sphere, '#e8f1fb', { p: [-0.55, 0.2, -0.2], s: [0.5, 0.34, 0.46] }), part(G.sphere, '#ffffff', { p: [0.1, 0.78, 0.05], s: [0.4, 0.3, 0.4] }),
  ]);
}

export function createHuddleWorld({ scene, sfx, particles, labels }) {
  const root = new THREE.Group();
  root.name = 'party-huddle';
  root.position.set(centre.x, O.y, centre.z);
  root.visible = false;
  scene.add(root);
  const geos = [], mats = [];
  const living = stageLivingLifecycle({ root, id: 'huddle', cam: CAM });

  // ---- the grove: snow, the stumps, the spectator spots, Myodette's rock, the pines
  const base = [];
  H.stumps.forEach((x) => base.push(disc(1.4, '#7a5236', [x, STUMP_TOP, H.stumpZ], 0.34), disc(1.14, '#c8935a', [x, STUMP_TOP + 0.02, H.stumpZ], 0.06), ring(0.35, 0.5, '#a9733f', [x, STUMP_TOP + 0.05, H.stumpZ], 0.04), ring(0.75, 0.9, '#a9733f', [x, STUMP_TOP + 0.05, H.stumpZ], 0.04),
    ring(1.2, 1.46, '#ffffff', [x, STUMP_TOP + 0.01, H.stumpZ], 0.1)));
  H.stumps.forEach((x) => base.push(disc(1.5, '#e3eefa', [x, 0.05, H.spectatorZ], 0.1)));
  base.push(part(CYL, '#dfe9f5', { p: [-11.8, 0.4, -1.6], s: [2.0, 0.8, 1.5] }), ball(1.3, '#ffffff', [-11.8, 0.9, -1.6], [1, 0.45, 0.9]), ball(0.9, '#eef5fc', [-13.4, 0.35, -0.6], [1, 0.5, 1]));
  const baseMesh = solid(base, { outline: 0.035 });
  baseMesh.name = 'huddle-base';
  root.add(baseMesh); geos.push(baseMesh.geometry);
  for (const child of baseMesh.children) if (child.geometry) geos.push(child.geometry);

  // ---- Myodette
  const myo = createTdoongModel('myodette');
  myo.root.scale.setScalar(TDOONGZ.myodette.scale);
  myo.root.position.set(-11.8, 1.15, -1.6);
  myo.root.rotation.y = 0.9;
  root.add(myo.root);

  // ---- per-stump pieces
  const shellG = shellGeo(), coneG = coneGeo(), clumpG = clumpGeo(), heapG = heapGeo();
  geos.push(shellG, coneG, clumpG, heapG);
  const shadowG = new THREE.CircleGeometry(1, 28);
  shadowG.rotateX(-Math.PI / 2);
  const meterG = new THREE.BoxGeometry(1, 0.2, 0.34);
  geos.push(shadowG, meterG);
  const seats = H.stumps.map((x) => {
    const shell = new THREE.Mesh(shellG, VERTEX_TOON);
    shell.castShadow = false; shell.position.set(x, STUMP_TOP, H.stumpZ); shell.visible = false;
    const drop = new THREE.Mesh(coneG, VERTEX_TOON);
    drop.castShadow = false; drop.visible = false; drop.renderOrder = 2;
    const smat = new THREE.MeshBasicMaterial({ color: '#2b2340', transparent: true, opacity: 0.3, depthWrite: false });
    const shadow = new THREE.Mesh(shadowG, smat);
    shadow.position.set(x, 0.2, H.stumpZ); shadow.visible = false; shadow.renderOrder = 1;
    const heap = new THREE.Mesh(heapG, VERTEX_TOON);
    heap.castShadow = false; heap.position.set(x, STUMP_TOP, H.stumpZ); heap.visible = false;
    const mmat = new THREE.MeshBasicMaterial({ color: METER_COLOR[0] });
    const meter = new THREE.Mesh(meterG, mmat);
    meter.position.set(x, 0.18, H.stumpZ + 2.0); meter.visible = false;
    root.add(shell, drop, shadow, heap, meter); mats.push(smat, mmat);
    return { x, shell, drop, shadow, smat, heap, meter, mmat, k: 0, spin: 0, dazed: 0, fired: new Set(), kind: 'cone', practice: { on: false, since: 0 } };
  });

  // ---- Myodette's calm lines (once per game)
  const LINES = [[0.6, 'Breathe in...'], [14, 'Gently now.'], [32, 'Listen for the whistle.'], [48, 'Almost there, friends.']];
  let disposed = false;
  let said = 0, t0 = 0, lastMode = '';

  function sayNext(t) {
    while (said < LINES.length && t >= LINES[said][0]) { labels?.label(LINES[said][1], wp(-11.8, 4.2, -1.6), '#e3d6ff'); said++; }
  }

  const PRACTICE_P = 3.4;
  const practiceDrop = (i) => {                                                 // the demo cone of a stump: warns for H.warn s, lands 2.0 s into every cycle
    const off = i * 0.25, k = Math.floor((t0 - off) / PRACTICE_P), at = off + k * PRACTICE_P + 2.0;
    return { i: k, at, warnAt: at - H.warn, kind: k % 3 === 2 ? 'snow' : 'cone' };
  };

  function impact(i, d, safe, practice, seat) {
    const x = H.stumps[i];
    const at = wp(x, HIT_Y, H.stumpZ);
    if (safe) {
      particles?.burst('chip', at, { count: 5, radius: 0.5, height: 0.2, color: '#b8844c' });
      sfx?.play('shell', { pitch: 0.7 + i * 0.06, vol: 0.7 });
      sfx?.play('thud', { pitch: 1.5, vol: 0.45 });
    } else {
      particles?.burst('puff', at, { count: 10, radius: 0.6, height: 0.5, size: 1.1, color: '#ffffff' });
      sfx?.play('thud', { pitch: 0.8, vol: 0.8 });
      if (practice) { labels?.label('Curl sooner!', wp(x, 2.6, H.stumpZ), '#ffd0d0'); }
    }
    if (practice && safe) labels?.label('Safe!', wp(x, 2.6, H.stumpZ), '#baffc8');
    seat.spin = 1;
  }

  function showDrop(seat, i, d, t, shellClosedAt, practice) {
    const k = (t - d.warnAt) / H.warn;
    if (k < 0 || t > d.at + 0.35) { seat.drop.visible = false; seat.shadow.visible = false; return; }
    if (seat.kind !== d.kind) { seat.kind = d.kind; seat.drop.geometry = d.kind === 'cone' ? coneG : clumpG; }
    const kk = Math.min(1, k);
    const y = HIT_Y + (FALL_FROM - HIT_Y) * (1 - kk * kk);
    seat.drop.visible = t <= d.at + 0.08;
    seat.drop.position.set(seat.x, STUMP_TOP + y, H.stumpZ);
    seat.drop.rotation.set(t * 2.4, t * 1.7, 0);
    seat.drop.scale.setScalar(d.kind === 'cone' ? 2.1 : 2.4);
    seat.shadow.visible = true;
    const sz = 0.35 + 1.0 * kk * kk;
    seat.shadow.scale.set(sz, 1, sz);
    seat.smat.opacity = 0.12 + 0.38 * kk;
    if (k >= 0 && !seat.fired.has(`w${d.i}`)) {                                  // the whistle, once per drop (a pitch per stump so four players hear four)
      seat.fired.add(`w${d.i}`);
      sfx?.play('dropwhistle', { pitch: 0.9 + i * 0.1, vol: 0.55 });
    }
    if (t >= d.at && !seat.fired.has(`h${d.i}`)) { seat.fired.add(`h${d.i}`); impact(i, d, shellClosedAt(d.at), practice, seat); }
  }

  function update(dt, { mode = 'wait', v = null, t = 0, lanePlayers = [] } = {}) {
    if (!root.visible) return;
    t0 += dt; living.update(dt, t0, lanePlayers);
    if (mode !== lastMode) { lastMode = mode; said = 0; if (mode === 'wait') for (const s of seats) { s.fired.clear(); s.dazed = 0; } }
    // Myodette: a calm sway, a slow breath, eyes happy when it goes well
    hostIdle(myo, t0, v, lanePlayers);
    myo.rig.position.y = Math.sin(t0 * 1.1) * 0.03;
    myo.torso.rotation.z = Math.sin(t0 * 0.8) * 0.05;
    for (const arm of [myo.armL, myo.armR]) if (arm) arm.rotation.z = (arm.userData.restZ ?? 0) + Math.sin(t0 * 0.9 + (arm === myo.armL ? 0 : 1.5)) * 0.12;
    myo.setExpression?.(mode === 'play' ? 'happy' : 'normal');
    if (mode === 'play') sayNext(t);
    seats.forEach((s, i) => {
      const slot = v ? v.slots[i] : undefined;
      let want = 0, left = 1, alive = true, dropList = null, closedTest = () => false;
      if (mode === 'play' && v && slot !== undefined) {
        const seat = v.seats[slot];
        alive = seat.alive; left = seat.left / v.meter;
        want = alive && (seat.on || closedAt(v.sh[slot], t)) ? 1 : 0;           // (a tap stays shut for the parry)
        dropList = v.drops[slot];
        closedTest = (at) => alive && v.sh && closedAt(v.sh[slot], at);
      } else if (mode === 'practice') {
        want = s.practice.on ? 1 : 0;
        closedTest = (at) => s.practice.on && at >= s.practice.since + H.close;
        dropList = [practiceDrop(i)];
      }
      s.k = damp(s.k, want, want ? 70 : 12, dt);                                // (snaps shut: the shell works at once)
      s.spin = damp(s.spin, 0, 8, dt);
      s.shell.visible = s.k > 0.03 && alive;
      if (s.shell.visible) {
        const e = Math.min(1, s.k);
        s.shell.scale.set(0.5 + 0.5 * e, 0.05 + 0.95 * e, 0.5 + 0.5 * e);
        s.shell.rotation.y = e * 0.5 + s.spin * Math.sin(t0 * 40) * 0.08;
        s.shell.position.y = STUMP_TOP + s.spin * 0.05;
      }
      s.heap.visible = !alive && mode === 'play';
      s.dazed = alive ? 0 : damp(s.dazed, 1, 6, dt);
      if (s.heap.visible) s.heap.scale.setScalar(0.4 + 0.6 * s.dazed);
      if (dropList) {
        const d = mode === 'play' ? dropList.find((x) => t >= x.warnAt && t <= x.at + 0.35) : dropList[0];
        if (d && alive) showDrop(s, i, d, mode === 'play' ? t : t0, closedTest, mode !== 'play');
        else { s.drop.visible = false; s.shadow.visible = false; }
      } else { s.drop.visible = false; s.shadow.visible = false; }
      const mv = mode === 'play' && alive && slot !== undefined;
      s.meter.visible = mv;
      if (mv) {
        const f = Math.max(0.001, Math.min(1, left));
        s.meter.scale.set(2.4 * f, 1, 1);
        s.meter.position.x = s.x - 1.2 * (1 - f);
        s.mmat.color.set(METER_COLOR[f > 0.5 ? 0 : f > 0.2 ? 1 : 2]);
      }
    });
  }

  return {
    root, update, cam: CAM, look: 'snowGrove',
    get living() { return living.current; },
    setVisible(on) { living.setVisible(on);
      root.visible = !!on;
      if (!on) { labels?.clear?.(); said = 0; lastMode = ''; for (const s of seats) { s.fired.clear(); s.shell.visible = s.drop.visible = s.shadow.visible = s.heap.visible = s.meter.visible = false; s.k = 0; s.dazed = 0; s.practice.on = false; } }
    },
    stumpSpot: (i) => wp(H.stumps[i], 0, H.stumpZ),
    setPracticeHold(i, on) { const s = seats[i]; if (!s) return; if (on && !s.practice.on) { s.practice.since = t0; sfx?.play('shell', { pitch: 0.7 + i * 0.06, vol: 0.4 }); } s.practice.on = !!on; },
    practiceState: (i) => (seats[i] ? seats[i].practice.on : false),
    onRec(rec, v) {
      if (!root.visible || !v) return;
      const i = v.slots.indexOf(rec.slot);
      if (i < 0) return;
      const s = seats[i];
      if (rec.k === 'curl') {
        if (rec.on) sfx?.play('shell', { pitch: 0.7 + i * 0.06, vol: 0.5 });
        else if (rec.why === 'spent') { labels?.label('Shell tired!', wp(H.stumps[i], 2.6, H.stumpZ), '#ffe0b0'); sfx?.play('bip', { pitch: 0.8, vol: 0.5 }); }
      } else if (rec.k === 'out') {
        s.dazed = 0;
        particles?.burst('puff', wp(H.stumps[i], 1.0, H.stumpZ), { count: 14, radius: 0.8, height: 0.7, size: 1.3, speed: 1.2, color: '#ffffff' });
        sfx?.play('boing', { pitch: 0.7, vol: 0.7 });
        labels?.label('Dazed!', wp(H.stumps[i], 2.6, H.stumpZ), '#ffd0d0');
      }
    },
    scoreText(v, slot) {
      if (!v) return { text: '', out: false };
      const seat = v.seats[slot];
      if (!seat || !seat.alive) return { text: 'DAZED', out: true };
      return { text: `${seat.left.toFixed(1)}s`, out: false };
    },
    clearPractice() { for (const s of seats) { s.practice.on = false; s.fired.clear(); } },
    summary() { let calls = 0; root.traverse((o) => { if (o.isMesh && o.visible) calls++; }); return { visible: root.visible, meshes: calls }; },
    dispose() { if (disposed) return; disposed = true; living.dispose(); for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); myo.dispose?.(); scene.remove(root); },
  };
}
