// Marlo Says' stage (Step 80b): Skipper's Cove in the sunshine. Four stepping posts in a tide pool, Skipper Marlo on his rock in front of the wreck holding a RED flag in his left paw and a GREEN flag in his right, two
// tall signal masts (red on the left, green on the right: the same sides as the stick) whose cloths slide up when Marlo calls, a time bar that shrinks under the posts, Biscuit the gull who squawks (and, late in the game,
// fibs), a beach row for the players who got splashed. Built once (lazily), hidden outside the game; ONE Group at the stage centre.
//
//   const w = createMarloSaysWorld({ scene, sfx, particles, labels })
//   w.setVisible(on)         w.update(dt, { mode: 'practice' | 'wait' | 'play', v, t })    v = marlosaysLogic.view(g, t) in play; 'practice' runs a slow demo of calls that nothing scores; 'wait' (the countdown) lowers everything
//   w.onRec(rec, v)          presentation of a record: ok (a sparkle on the post), out (a splash, a ripple, a word)
//   w.practicePress(laneIdx, flag, p) -> { ok } | null     judging a practice press against the demo flag (nothing scores; the same colours as the real game)
//   w.scoreText(v, slot) -> { text, out }      w.postSpot(i) -> world { x, y, z } of post i      w.cam      w.look ('day')      w.clearPractice()
// Draw calls: base 1 (+outline), pool 1, masts + cloths 2, beat bar 1, Marlo 7 + two flags, Biscuit 1, ripples <= 4 while they play; about 17.
import * as THREE from 'three';
import { stageLivingLifecycle, hostIdle, marloPoolBank } from './livingStage.js';
import { PARTY } from '../../config.js';
import { stageCentre } from '../../game/party/partyArea.js';
import { createMarloModel } from '../../npc/marlo.js';
import { gullGeometry } from '../cove.js';
import { part, G, VERTEX_TOON, combine } from '../../render/geo.js';
import { solid, glow, disc, ring, box, post, ball } from './kit.js';

const M = PARTY.marlosays, O = PARTY.origin;
const centre = stageCentre('marlosays');
export const CAM = { focus: { x: centre.x, y: O.y + 0.6, z: centre.z + 1.6 }, offset: { x: 0, y: 15, z: 14 }, extent: { w: 27, d: 25 } };
const ROCK_Y = 0.9, MAST_X = 9.6, MAST_Z = -4.6, MAST_H = 8.2, CLOTH_LO = 1.9, CLOTH_HI = 6.3;
const FLAG = { red: '#ff3b4e', green: '#2fcf5a' };                                 // the GameCube pad's colours: red B on the left, green A on the right
const POST_RINGS = ['#ff9a9a', '#9ac4ff', '#ffe27a', '#8fe8b8'];
const CYL = new THREE.CylinderGeometry(1, 1, 1, 40, 1);
const ell = (rx, rz, color, y, h, x = 0, z = 0) => part(CYL, color, { p: [x, y - h / 2, z], s: [rx, h, rz] });
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const wp = (x, y, z) => ({ x: centre.x + x, y: O.y + y, z: centre.z + z });

function palm(parts, x, z, h, lean) {
  parts.push(part(G.cyl8, '#a9814f', { p: [x + lean * 0.5, h / 2, z], r: [0, 0, -lean * 0.25], s: [0.3, h, 0.3] }));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    parts.push(part(G.sphere, k % 2 ? '#4fb865' : '#5bcc72', { p: [x + lean + Math.cos(a) * 1.3, h + 0.1 - (k % 2) * 0.2, z + Math.sin(a) * 1.3], s: [1.3, 0.16, 0.45], r: [0, -a, k % 2 ? 0.3 : 0.1] }));
  }
  parts.push(ball(0.34, '#7a5a3c', [x + lean, h - 0.1, z]));
}

/** A hand-held signal flag: a short pole and a cloth, in the paw's space (the arm hangs along -Y). */
export function flagGeo(color) {
  return combine([
    part(G.cyl6, '#e8d8b8', { p: [0, -0.62, 0.06], s: [0.04, 0.62, 0.04] }),
    part(new THREE.BoxGeometry(1, 1, 1), color, { p: [0.4, -0.88, 0.06], s: [0.8, 0.56, 0.03] }),
    part(new THREE.BoxGeometry(1, 1, 1), '#ffffff', { p: [0.4, -0.88, 0.085], s: [0.22, 0.2, 0.012] }),
  ]);
}
/** A big mast cloth (one box and a white anchor mark), hinged at the pole (x = 0). */
function clothGeo(color) {
  const B = new THREE.BoxGeometry(1, 1, 1);
  return combine([
    part(B, color, { p: [2.5, 0, 0], s: [5.0, 3.0, 0.12] }),
    part(B, '#ffffff', { p: [2.5, 0, 0.08], s: [1.1, 1.1, 0.04], r: [0, 0, Math.PI / 4] }),
  ]);
}

export function createMarloSaysWorld({ scene, sfx, particles, labels }) {
  const root = new THREE.Group();
  root.name = 'party-marlosays';
  root.position.set(centre.x, O.y, centre.z);
  root.visible = false;
  scene.add(root);
  const geos = [], mats = [];
  const living = stageLivingLifecycle({ root, id: 'marlosays', cam: CAM });

  // ---- the cove: sand, the tide pool with its rock rim, the posts, the beach seats, Marlo's rock, the wreck, the masts, palms
  const base = [
    marloPoolBank(), ell(11.5, 5.1, '#e8d4a7', 0.06, 0.03, 0, M.postZ - 0.2),     // open sandy shoulder and shallow sandy pool floor
  ];
  M.posts.forEach((x, i) => base.push(disc(1.5, '#d8c8a8', [x, 0.14, M.postZ], 0.3), ring(0.95, 1.4, POST_RINGS[i % 4], [x, 0.15, M.postZ], 0.04), ball(0.34, '#cdbb98', [x + 0.9, 0.12, M.postZ - 1.1], [1, 0.5, 1])));
  M.posts.forEach((x, k) => base.push(disc(1.5, '#ffe0b0', [x, 0.05, M.beachZ], 0.1), ring(0.9, 1.35, POST_RINGS[k % 4], [x, 0.06, M.beachZ], 0.04)));
  base.push(ell(3.4, 2.4, '#9a8a74', ROCK_Y, ROCK_Y, 0, M.marloZ), ell(2.2, 1.4, '#a99a84', 0.45, 0.45, 2.2, M.marloZ + 2.1), ell(1.5, 1.0, '#a99a84', 0.28, 0.28, -2.6, M.marloZ + 2.3));      // Marlo's rock and two steps
  base.push(ell(0.9, 0.6, '#d9ccb0', 1.2, 0.3, -2.6, M.marloZ + 0.2), post(0.12, 0.5, '#6b4a2c', [-2.6, ROCK_Y, M.marloZ + 0.2]));                          // Biscuit's perch (a driftwood post)
  // the wreck on the right: a tilted hull, a broken mast and a torn sail
  base.push(box(6.0, 1.7, 2.8, '#8a5a3c', [11.5, 0.2, -8.6], [0, 0.45, -0.18]), box(5.2, 0.28, 2.4, '#a9733f', [11.4, 1.7, -8.6], [0, 0.45, -0.18]), post(0.18, 4.0, '#6b4a2c', [10.4, 1.4, -8.2]),
    box(0.1, 1.9, 1.4, '#f4ecd8', [10.5, 2.4, -7.6], [0, 0.2, 0.1]), box(1.2, 0.5, 0.2, '#e8453c', [13.1, 1.9, -7.2], [0, 0.45, 0]));
  base.push(post(0.14, MAST_H, '#e8d8b8', [-MAST_X, 0, MAST_Z]), post(0.14, MAST_H, '#e8d8b8', [MAST_X, 0, MAST_Z]), ball(0.3, '#ffd85e', [-MAST_X, MAST_H + 0.3, MAST_Z]), ball(0.3, '#ffd85e', [MAST_X, MAST_H + 0.3, MAST_Z]),
    disc(0.9, '#9a8a74', [-MAST_X, 0.3, MAST_Z], 0.3), disc(0.9, '#9a8a74', [MAST_X, 0.3, MAST_Z], 0.3));
  const baseMesh = solid(base, { outline: 0.04 });
  baseMesh.name = 'marlosays-base';
  root.add(baseMesh); geos.push(baseMesh.geometry);
  for (const child of baseMesh.children) if (child.geometry) geos.push(child.geometry);


  // ---- the masts' cloths (they slide up the pole) and the time bar
  const cloths = {};
  for (const [color, sx] of [['red', -1], ['green', 1]]) {
    const geo = clothGeo(FLAG[color]);
    const m = new THREE.Mesh(geo, VERTEX_TOON);
    m.castShadow = false; m.receiveShadow = false;
    m.position.set(sx * MAST_X + (sx < 0 ? 0.14 : -0.14), CLOTH_LO, MAST_Z);
    if (sx > 0) m.rotation.y = Math.PI;                                             // (the green cloth streams towards the middle too)
    root.add(m); geos.push(geo);
    cloths[color] = { m, level: 0, wave: sx * 0.7 };
  }
  const barMat = new THREE.MeshBasicMaterial({ color: FLAG.red });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.22, 0.5), barMat);
  bar.position.set(0, 0.16, M.postZ + 3.6);
  bar.visible = false;
  root.add(bar); geos.push(bar.geometry); mats.push(barMat);

  // ---- Marlo, holding a flag in each paw (red on the screen's left)
  const marlo = createMarloModel();
  marlo.root.scale.setScalar(1.45);
  marlo.root.position.set(0, ROCK_Y, M.marloZ);
  root.add(marlo.root);
  const held = {};
  for (const [color, arm] of [['red', marlo.armL], ['green', marlo.armR]]) {
    const geo = flagGeo(FLAG[color]), m = new THREE.Mesh(geo, VERTEX_TOON);
    m.castShadow = false; m.position.set(0, 0, 0);
    arm.add(m); geos.push(geo);
    held[color] = { arm, m, up: 0 };
  }

  // ---- Biscuit on his perch
  const gullG = gullGeometry();
  const gull = new THREE.Mesh(gullG, VERTEX_TOON);
  gull.castShadow = false; gull.scale.setScalar(1.9);
  gull.position.set(-2.6, 1.45, M.marloZ + 0.2);
  root.add(gull); geos.push(gullG);

  // ---- splash ripples (a ring that grows and fades on a post)
  const ripGeo = new THREE.RingGeometry(0.55, 0.75, 32);
  ripGeo.rotateX(-Math.PI / 2);
  const ripples = [0, 1, 2, 3].map(() => {
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
    const m = new THREE.Mesh(ripGeo, mat);
    m.visible = false; m.renderOrder = 3;
    root.add(m); mats.push(mat);
    return { m, mat, age: 9 };
  });
  geos.push(ripGeo);

  // ---- state
  let disposed = false;
  let t0 = 0, callKey = '', gullHop = 0, nod = 0, practiceLane = new Map(), liedBanner = false;
  const demoCalls = ['red', 'green', 'green', 'red', 'green', 'red', 'red', 'green'];
  const demoAt = (t) => {                                                       // practice: a flag every 2.8 s, up for 2.0 s (the opening window of the real game)
    const k = Math.floor((t - 0.5) / 2.8), at = 0.5 + k * 2.8;
    return k >= 0 && t >= at && t <= at + 2.0 ? { i: k, at, dur: 2.0, color: demoCalls[((k % 8) + 8) % 8], who: 'marlo', says: demoCalls[((k % 8) + 8) % 8], lie: false } : null;
  };
  let flagWanted = null;

  function openCall(c, practice) {
    flagWanted = c.color;
    sfx?.play('flag', { pitch: c.color === 'red' ? 0.9 : 1.15, vol: 0.8 });
    nod = 1;
    const head = wp(0, ROCK_Y + 2.9, M.marloZ);
    if (c.who === 'biscuit') {
      gullHop = 1;
      sfx?.play('squawk', { pitch: c.lie ? 0.88 : 1, vol: 0.9 });
      labels?.label(`Squawk! ${c.says.toUpperCase()}!`, wp(-2.6, 3.4, M.marloZ + 0.2), c.says === 'red' ? '#ffb0b8' : '#b8d4ff');
    } else {
      labels?.label(`${c.color.toUpperCase()}!`, head, c.color === 'red' ? '#ff8f9b' : '#8fb8ff');
    }
    if (!practice && c.lie && !liedBanner) { liedBanner = true; labels?.label('Biscuit fibs now! Trust the FLAG!', wp(0, 3.8, 3.0), '#ffe27a'); }
  }

  function update(dt, { mode = 'wait', v = null, t = 0, lanePlayers = [] } = {}) {
    if (!root.visible) return;
    t0 += dt; living.update(dt, t0, lanePlayers);
    let c = null, left = 0;
    if (mode === 'play' && v) { c = v.current; left = c ? v.left : 0; }
    else if (mode === 'practice') { const d = demoAt(t0); c = d; left = d ? d.at + d.dur - t0 : 0; }
    const key = c ? `${mode}:${c.i}` : '';
    if (key !== callKey) {
      callKey = key;
      if (c) openCall(c, mode === 'practice'); else flagWanted = null;
    }
    if (mode === 'wait') { flagWanted = null; liedBanner = false; }
    for (const color of ['red', 'green']) {
      const on = flagWanted === color && !!c;
      const cl = cloths[color], h = held[color];
      cl.level = damp(cl.level, on ? 1 : 0, on ? 16 : 9, dt);
      cl.m.position.y = CLOTH_LO + (CLOTH_HI - CLOTH_LO) * cl.level;
      cl.m.rotation.z = Math.sin(t0 * 7 + cl.wave) * 0.05 * (0.4 + cl.level);
      h.up = damp(h.up, on ? 1 : 0, on ? 18 : 9, dt);
      h.arm.rotation.x = -0.18 - 2.75 * h.up;
      h.arm.rotation.z = (h.arm.userData.restZ ?? 0) * (1 - h.up * 0.4);
      h.m.rotation.z = Math.sin(t0 * 9 + cl.wave) * 0.08 * h.up;
    }
    hostIdle(marlo, t0, v, lanePlayers);
    nod = damp(nod, 0, 6, dt);
    marlo.headGroup.rotation.x = nod * 0.32 + Math.sin(t0 * 1.4) * 0.03;
    marlo.rig.position.y = Math.abs(Math.sin(t0 * 2.2)) * 0.03 + nod * 0.05;
    marlo.tail.rotation.y = Math.sin(t0 * 1.6) * 0.25;
    gullHop = damp(gullHop, 0, 5, dt);
    const preen = !c ? Math.max(0, Math.sin(t0 * 0.55) - 0.8) * 3 : 0;
    gull.rotation.z = preen * Math.sin(t0 * 5) * 0.22;
    gull.position.y = 1.45 + preen * 0.2 + gullHop * 0.28 + Math.sin(t0 * 3) * 0.01;
    gull.scale.set(1.9 * (1 + gullHop * 0.25 * Math.sin(t0 * 40)), 1.9, 1.9);
    gull.rotation.y = Math.sin(t0 * 0.9) * 0.4 + 0.2;
    bar.visible = !!c;
    if (c) {
      const f = Math.max(0.001, Math.min(1, left / c.dur));
      bar.scale.set(12 * f, 1, 1);
      barMat.color.set(FLAG[c.color]);
    }
    for (const r of ripples) {
      if (r.age >= 0.9) { r.m.visible = false; continue; }
      r.age += dt;
      const k = Math.min(1, r.age / 0.9);
      r.m.scale.setScalar(1 + k * 2.1); r.mat.opacity = (1 - k) * 0.85;
    }
  }

  function ripple(i) {
    const r = ripples.find((x) => x.age >= 0.9) || ripples[0];
    r.age = 0; r.m.visible = true;
    r.m.position.set(M.posts[i], 0.14, M.postZ);
  }

  /** A practice press of lane i against the demo flag: nothing scores. */
  function practicePress(i, flag, p) {
    const d = demoAt(t0);
    if (!d) return null;
    const k = `${i}:${d.i}`;
    if (practiceLane.get(k)) return null;
    const at = wp(M.posts[i], 2.4, M.postZ);
    if (flag === d.color) {
      practiceLane.set(k, true);
      particles?.burst('sparkle', at, { count: 8, radius: 0.5, color: '#ffe27a' });
      sfx?.play('chime', { pitch: flag === 'red' ? 1.2 : 1.45, vol: 0.6 });
      labels?.label('Nice!', at, '#baffc8');
      return { ok: true };
    }
    labels?.label('Other flag!', at, '#ffd0d0');
    sfx?.play('bip', { pitch: 0.8, vol: 0.5 });
    return { ok: false };
  }

  return {
    root, update, practicePress, cam: CAM, look: 'day',
    get living() { return living.current; },
    setVisible(on) { root.visible = !!on; living.setVisible(on); if (!on) { labels?.clear?.(); practiceLane.clear(); callKey = ''; flagWanted = null; liedBanner = false; for (const r of ripples) { r.m.visible = false; r.age = 9; } bar.visible = false; } },
    postSpot: (i) => wp(M.posts[i], 0, M.postZ),
    onRec(rec, v) {
      if (!root.visible || !v) return;
      const i = v.slots.indexOf(rec.slot);
      if (i < 0) return;
      if (rec.k === 'ok') {
        particles?.burst('sparkle', wp(M.posts[i], 2.0, M.postZ), { count: 5, radius: 0.45, color: POST_RINGS[i % 4] });
        sfx?.play('pop', { pitch: 1.3 + (i % 4) * 0.06, vol: 0.35 });
      } else if (rec.k === 'out') {
        ripple(i);
        particles?.burst('puff', wp(M.posts[i], 0.3, M.postZ), { count: 12, radius: 0.8, height: 0.6, size: 1.2, speed: 1.5, color: '#bfe6ff' });
        particles?.burst('sparkle', wp(M.posts[i], 0.6, M.postZ), { count: 8, radius: 0.7, height: 0.8, color: '#9fd8ff', speed: 1.3 });
        sfx?.play('splash', { vol: 0.85 });
        labels?.label(rec.why === 'slow' ? 'Too slow!' : 'Splash!', wp(M.posts[i], 2.4, M.postZ), '#ffd0d0');
      }
    },
    scoreText(v, slot) {
      if (!v) return { text: '', out: false };
      return v.alive[slot] === false ? { text: 'SPLASH', out: true } : { text: 'DRY', out: false };
    },
    clearPractice() { practiceLane.clear(); },
    summary() { let calls = 0; root.traverse((o) => { if (o.isMesh && o.visible) calls++; }); return { visible: root.visible, meshes: calls, flag: flagWanted }; },
    dispose() { if (disposed) return; disposed = true; living.dispose(); for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); marlo.dispose?.(); scene.remove(root); },
  };
}
