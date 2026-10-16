// Egg Scramble's stage (Step 80c): the Frostpine critter camp in the snow. Four straw lanes side by side (a player runs left and right in theirs), a nest basket in front of each (the henhouse: a full stack flies in and
// is banked), a long perch branch above them with a grouse over every lane, pines behind, and Shyam Shyam on a stump at the left lobbing prank pinecones. The eggs / golden eggs / pinecones are THREE
// instanced meshes (every lane's falling items and every head stack), a fourth instanced mesh draws the ground shadows (a shadow grows under every falling item: that is where it will land). Built once (lazily),
// hidden outside the game; ONE Group at the stage centre.
//
// WHAT YOU SEE IS WHAT IS JUDGED: every falling item is drawn at `itemPose()` of game/party/eggsLogic.js (the same numbers the host judges with), and a head stack is drawn from the player's feet y + `headTop` + n eggs
// (`stackTop(n)`), at the player's own x, so an egg lands on the stack exactly when the host says it did.
//
//   const w = createEggsWorld({ scene, sfx, particles, labels })
//   w.setVisible(on)         w.update(dt, { mode: 'practice' | 'wait' | 'play', v, t, lanePlayers })    v = eggsLogic.view(g, t) in play; lanePlayers[i] = the Player (or avatar) in lane i or null
//   w.onRec(rec, v, who)     presentation of a record: a catch (a pop of the stack, a word, a golden chime), a bonk (the stack's top half flies off), the henhouse
//   w.scoreText(v, slot) -> { text, out }      w.stackWobble(k, n, t) -> x offset of the k-th egg      w.cam      w.look ('snow')      w.clearPractice()      w.counts() -> what is drawn now
// Draw calls: base 1 (+outline), 3 item meshes + shadows 1, four grouse 16, Shyam ~12; about 34.
import * as THREE from 'three';
import { PARTY, TDOONGZ } from '../../config.js';
import { stageCentre } from '../../game/party/partyArea.js';
import { buildItems, itemPose, stackTop, valueOf, groundTime, itemX, knockOff } from '../../game/party/eggsLogic.js';
import { createTdoongModel } from '../../npc/tdoongz.js';
import { createCritterModel } from '../../npc/critters.js';
import { part, G, VERTEX_TOON, combine } from '../../render/geo.js';
import { solid, disc, ring, box, ball } from './kit.js';

const E = PARTY.eggs, O = PARTY.origin;
const centre = stageCentre('eggs');
export const CAM = { focus: { x: centre.x, y: O.y + 2.4, z: centre.z + 1.0 }, offset: { x: 0, y: 12.5, z: 15.5 }, extent: { w: 33, d: 15 } };
const SHYAM = { x: -14.4, z: E.laneZ };
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const wp = (x, y, z) => ({ x: centre.x + x, y: O.y + y, z: centre.z + z });
const CAP = { egg: 96, gold: 48, cone: 32, shadow: 48 };
const PRACTICE_N = 12;

function pine(parts, x, z, h) {
  parts.push(part(G.cyl8, '#7a5236', { p: [x, h * 0.18, z], s: [0.22 * h / 4, h * 0.36, 0.22 * h / 4] }));
  for (const [y, hh, r, c] of [[0.32, 0.5, 1.5, '#25725a'], [0.58, 0.4, 1.15, '#2b7e60'], [0.8, 0.32, 0.8, '#329067']]) {
    parts.push(part(G.cone6, c, { p: [x, h * y, z], s: [r * h / 4, hh * h, r * h / 4] }));
    parts.push(part(G.cone6, '#f4f9ff', { p: [x, h * (y + 0.05), z], s: [r * 0.78 * h / 4, hh * h * 0.62, r * 0.78 * h / 4] }));
  }
}
const eggGeo = (color) => combine([part(G.sphere, color, { p: [0, 0, 0], s: [0.2, 0.26, 0.2] }), part(G.sphereLo, color === '#fff6e4' ? '#e8d6b4' : '#e6a91f', { p: [0.1, 0.05, 0.14], s: [0.05, 0.04, 0.03] })]);
const coneGeo = () => {
  const parts = [part(G.sphere, '#7a5230', { p: [0, 0, 0], s: [0.2, 0.3, 0.2] })];
  for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + r * 0.5; parts.push(part(G.sphereLo, (k + r) % 2 ? '#b8844c' : '#9a6a3e', { p: [Math.cos(a) * 0.16, -0.17 + r * 0.17, Math.sin(a) * 0.16], r: [0, -a, 0.5], s: [0.09, 0.07, 0.05] })); }
  return combine(parts);
};

export function createEggsWorld({ scene, sfx, particles, labels }) {
  const root = new THREE.Group();
  root.name = 'party-eggs';
  root.position.set(centre.x, O.y, centre.z);
  root.visible = false;
  scene.add(root);
  const geos = [], mats = [];

  // ---- the camp: snow, the lanes (straw mats between little posts), the nest baskets, the perch branch and its two pines, the cheering stumps, pines behind
  const base = [disc(46, '#eef5fc', [0, 0, 0], 0.5), disc(20, '#ffffff', [0, 0.02, 0], 0.2)];
  E.lanes.forEach((lx, i) => {
    base.push(box(E.laneHalf * 2 + 0.2, 0.12, E.laneDepth + 0.4, i % 2 ? '#e0c878' : '#e8d28a', [lx, 0.02, E.laneZ]));                        // the straw mat you run on
    for (const s of [-1, 1]) base.push(box(0.14, 0.6, 0.14, '#7a5236', [lx + s * (E.laneHalf + 0.22), 0, E.laneZ - 0.9]), box(0.14, 0.6, 0.14, '#7a5236', [lx + s * (E.laneHalf + 0.22), 0, E.laneZ + 0.9]));
    base.push(disc(1.25, '#c8935a', [lx, 0.2, E.laneZ + 3.2], 0.2), ring(0.85, 1.25, '#a9733f', [lx, 0.42, E.laneZ + 3.2], 0.22), disc(0.9, '#e8d28a', [lx, 0.3, E.laneZ + 3.2], 0.06));      // the henhouse nest
    base.push(disc(1.5, '#e3eefa', [lx, 0.05, E.spectatorZ], 0.1));                                                                                // where the others cheer from
  });
  base.push(box(E.lanes[3] * 2 + 7.6, 0.45, 0.5, '#7a5236', [0, E.perchY - 0.45, E.laneZ - 0.1]), box(E.lanes[3] * 2 + 7.8, 0.12, 0.62, '#f4f9ff', [0, E.perchY - 0.02, E.laneZ - 0.1]));   // the perch branch (snow on top)
  for (const s of [-1, 1]) base.push(box(0.5, E.perchY - 0.4, 0.5, '#6e4a2a', [s * (E.lanes[3] + 4.2), 0, E.laneZ - 0.1]));
  base.push(disc(1.1, '#a77a4e', [SHYAM.x, 0.55, SHYAM.z], 0.55), disc(0.9, '#e0b27a', [SHYAM.x, 0.57, SHYAM.z], 0.04));                           // Shyam's stump
  for (let i = 0; i < 24; i++) { const a = Math.PI * 1.02 + (i / 23) * Math.PI * 0.96, r = 19 + hash(i) * 5, x = Math.cos(a) * r * 1.1, z = Math.sin(a) * r * 0.55 - 5; pine(base, x, z, 4.8 + hash(i + 40) * 2.6); }
  for (let i = 0; i < 10; i++) base.push(ball(0.5 + hash(i + 5) * 0.5, '#f4f9ff', [-17 + hash(i + 20) * 34, 0.1, 6.5 + hash(i + 33) * 6], [1.3, 0.45, 1]));
  const baseMesh = solid(base, { outline: 0.035 });
  baseMesh.name = 'eggs-base';
  root.add(baseMesh); geos.push(baseMesh.geometry);

  // ---- the grouse (one over every lane, hopping along the branch to where the next egg drops) and Shyam Shyam
  const grouse = E.lanes.map((lx) => { const m = createCritterModel('grouse'); m.root.scale.setScalar(1.25); m.root.position.set(lx, E.perchY, E.laneZ - 0.1); root.add(m.root); return m; });
  const shyam = createTdoongModel('shyamshyam');
  shyam.root.scale.setScalar(TDOONGZ.shyamshyam.scale);
  shyam.root.position.set(SHYAM.x, 1.1, SHYAM.z);
  shyam.root.rotation.y = Math.PI / 2;
  root.add(shyam.root);

  // ---- the instanced items
  const eggG = eggGeo('#fff6e4'), goldG = eggGeo('#ffd23a'), cG = coneGeo();
  const shadowG = new THREE.CircleGeometry(1, 20); shadowG.rotateX(-Math.PI / 2);
  const shadowM = new THREE.MeshBasicMaterial({ color: '#2b2340', transparent: true, opacity: 0.32, depthWrite: false });
  const mkInst = (geo, cap, mat = VERTEX_TOON) => { const m = new THREE.InstancedMesh(geo, mat, cap); m.count = 0; m.castShadow = false; m.frustumCulled = false; root.add(m); return m; };
  const eggs = mkInst(eggG, CAP.egg), golds = mkInst(goldG, CAP.gold), cones = mkInst(cG, CAP.cone), shadows = mkInst(shadowG, CAP.shadow, shadowM);
  shadows.renderOrder = 1;
  geos.push(eggG, goldG, cG, shadowG); mats.push(shadowM);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _pos = new THREE.Vector3();
  const n = { egg: 0, gold: 0, cone: 0, shadow: 0 };
  const put = (mesh, kind, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
    if (n[kind] >= CAP[kind]) return;
    _q.setFromEuler(_e.set(rx, ry, rz)); _pos.set(x, y, z); _s.set(sx, sy, sz);
    mesh.setMatrixAt(n[kind]++, _m.compose(_pos, _q, _s));
  };

  let t0 = 0, lastMode = '';
  const lay = E.lanes.map(() => ({ last: -1, squash: 0 }));
  const bounce = E.lanes.map(() => 0);                                         // a stack's little hop when an egg lands
  const flying = [];                                                           // eggs knocked off a stack / banked: { x, y, z, vx, vy, vz, gold, life }
  const settled = new Set();                                                   // `${lane}:${key}` of items whose splat already played
  let throwT = 0, lobbed = new Set(), practiceState = null;

  /** The wobble of the k-th egg in a stack of n at time t (x offset, u). Small on purpose: the egg you aim at never moves more than this from the head (the catch radius is far bigger). */
  const stackWobble = (k, count, t) => Math.sin(t * 3 + k * 0.7) * 0.015 * k * (1 + 0.05 * count);

  /** Draw one lane: its head stack and its falling items. `st` = { stack: [values], res, rt } for it, `p` = the Player in the lane (or null). */
  function drawLane(i, items, tm, st, p) {
    const lx = E.lanes[i];
    const stack = st.stack, top = stackTop(stack.length);
    if (p) {
      const px = p.position.x - centre.x, pz = p.position.z - centre.z, py = p.position.y - O.y;
      stack.forEach((val, k) => {
        const hop = k === stack.length - 1 ? bounce[i] * 0.12 : 0;
        put(val > 1 ? golds : eggs, val > 1 ? 'gold' : 'egg', px + stackWobble(k, stack.length, t0), py + E.headTop + k * E.eggH + 0.26 + hop, pz, 1, 1 - bounce[i] * 0.1 * (k === stack.length - 1 ? 1 : 0), 1, Math.sin(t0 * 2 + k) * 0.06, 0, Math.sin(t0 * 2.6 + k * 1.3) * 0.08);
      });
    }
    for (const it of items) {
      if (tm < it.t0 - E.lobLead - 0.05) break;
      const code = st.res[it.i];
      if (tm > groundTime(it) + 0.7) continue;
      const aligned = !!(p && Math.abs(p.position.x - (centre.x + itemX(it, i))) <= E.catchR);
      const pose = itemPose(it, i, tm, top, code, st.rt[it.i], aligned);      // (stage-local y, feet at 0: the same numbers the host judges with)
      if (pose.state === 'gone' || pose.state === 'caught') continue;
      const mesh = it.kind === 'cone' ? cones : it.kind === 'gold' ? golds : eggs, kind = it.kind === 'cone' ? 'cone' : it.kind === 'gold' ? 'gold' : 'egg';
      if (pose.state === 'lob') {                                              // Shyam's throw: an arc from his paw to the drop point
        const u = (tm - (it.t0 - E.lobLead)) / E.lobLead, ex = pose.x, sx = SHYAM.x + 0.6;
        put(mesh, kind, sx + (ex - sx) * u, 1.9 + (E.perchY - 1.9) * u + Math.sin(u * Math.PI) * 2.2, E.laneZ, 1.25, 1.25, 1.25, tm * 9, 0, tm * 7);
        continue;
      }
      if (pose.state === 'splat') {
        const k = `${i}:${it.i}`;
        if (!settled.has(k)) { settled.add(k); splat(i, it, pose.x); }
        const u = Math.min(1, (tm - groundTime(it)) / 0.35);
        if (it.kind !== 'cone') put(eggs, 'egg', pose.x, 0.14, E.laneZ, 1.4 + u * 0.5, 0.18, 1.4 + u * 0.5);
        else put(cones, 'cone', pose.x, 0.2, E.laneZ, 1.25, 1.25, 1.25, 0, 0, 1.2);
        continue;
      }
      const spin = it.kind === 'cone' ? tm * 7 : 0;
      put(mesh, kind, pose.x, pose.y + (it.kind === 'cone' ? 0.3 : 0.26), E.laneZ, it.kind === 'cone' ? 1.25 : 1, it.kind === 'cone' ? 1.25 : 1, it.kind === 'cone' ? 1.25 : 1, spin * 0.6, 0, spin);
      if (pose.state === 'fall' || pose.state === 'resting') {                 // the shadow: small and faint high up, big and dark near the head
        const dy = Math.max(0, pose.y - top), k2 = 1 - Math.min(1, dy / (E.perchY - top));
        put(shadows, 'shadow', pose.x, 0.16, E.laneZ, 0.18 + 0.42 * k2 * k2, 1, 0.12 + 0.28 * k2 * k2);
      }
    }
  }

  function splat(i, it, x) {
    particles?.burst('puff', wp(x, 0.3, E.laneZ), { count: it.kind === 'cone' ? 3 : 5, radius: 0.3, height: 0.2, size: 0.7, color: it.kind === 'cone' ? '#b8844c' : it.kind === 'gold' ? '#ffd23a' : '#fff0c8' });
    if (i === 0 || Math.random() < 0.4) sfx?.play('eggsplat', { pitch: 0.9 + i * 0.07, vol: 0.18 });
  }

  function animateCast(tm, items) {
    // each grouse hops along the branch to where its next egg drops, then squats to lay it
    E.lanes.forEach((lx, i) => {
      const g = grouse[i], eggItems = items.filter((x) => x.kind !== 'cone');
      let cur = null, prev = null;
      for (const it of eggItems) { if (it.t0 - 0.45 <= tm) { prev = cur; cur = it; } else break; }
      let gx = lx;
      if (cur) { const from = prev ? prev.x : 0, u = Math.min(1, Math.max(0, (tm - (cur.t0 - 0.45)) / 0.4)); gx = lx + from + (cur.x - from) * (u * u * (3 - 2 * u)); }
      g.root.position.x = gx;
      g.rig.position.y = Math.abs(Math.sin(tm * 3 + i)) * 0.03;
      const L = lay[i];
      if (cur && cur.i !== L.last && tm >= cur.t0) { L.last = cur.i; L.squash = 1; sfx?.play('pop', { pitch: 1.5 + (i % 2) * 0.15, vol: 0.12 }); }
      L.squash = Math.max(0, L.squash - 0.06);
      g.rig.scale.set(1 + L.squash * 0.1, 1 - L.squash * 0.18, 1 + L.squash * 0.1);
    });
    // Shyam winds up for every pinecone
    for (const it of items) if (it.kind === 'cone' && tm >= it.t0 - E.lobLead - 0.2 && !lobbed.has(it.i)) { lobbed.add(it.i); throwT = 0.5; sfx?.play('bip', { pitch: 1.7, vol: 0.2 }); labels?.label('Hee hee!', wp(SHYAM.x, 3.4, SHYAM.z), '#ffe0f0'); }
  }

  function localLane(i, key, items, tm, p, store) {                               // practice: the same maths on a local stack
    const st = store[i] || (store[i] = { stack: [], res: {}, rt: {}, banked: 0 });
    const top = stackTop(st.stack.length);
    for (const it of items) {
      if (it.t0 > tm) break;
      if (st.res[it.i] !== undefined) continue;
      if (E.perchY - it.v * (tm - it.t0) > top) continue;
      const hit = p && Math.abs(p.position.x - (centre.x + itemX(it, i))) <= E.catchR;
      st.rt[it.i] = tm;
      if (!hit) st.res[it.i] = 'm';
      else if (it.kind === 'cone') { st.res[it.i] = 'k'; st.stack = st.stack.slice(0, st.stack.length - knockOff(st.stack.length)); catchFx(i, 'bonk', 0, p); }
      else { st.res[it.i] = 'c'; st.stack = st.stack.concat(valueOf(it.kind)); catchFx(i, 'catch', valueOf(it.kind), p, st.stack.length); if (st.stack.length >= E.bankAt) { bankFx(i, p, st.stack.reduce((a, b) => a + b, 0)); st.stack = []; } }
    }
    return st;
  }

  function catchFx(i, kind, val, p, count = 0) {
    const at = p ? { x: p.position.x, y: p.position.y + E.headTop + (count + 1) * E.eggH, z: p.position.z } : wp(E.lanes[i], 3, E.laneZ);
    if (kind === 'catch') {
      bounce[i] = 1;
      particles?.burst('sparkle', at, { count: val > 1 ? 10 : 3, radius: 0.3, height: 0.2, color: val > 1 ? '#ffe27a' : '#ffffff' });
      sfx?.play(val > 1 ? 'golden' : 'eggcatch', { pitch: 0.85 + Math.min(count, 8) * 0.07, vol: val > 1 ? 0.7 : 0.55 });
      labels?.label(val > 1 ? '+3 Golden!' : '+1', { x: at.x, y: at.y + 0.9, z: at.z }, val > 1 ? '#ffe27a' : '#ffffff');
    } else {
      particles?.burst('chip', at, { count: 8, radius: 0.4, height: 0.4, color: '#fff6e4' });
      sfx?.play('bonk', { vol: 0.8 });
      labels?.label('Bonk!', { x: at.x, y: at.y + 0.9, z: at.z }, '#ffc0c0');
    }
  }
  function bankFx(i, p, sum) {
    const at = p ? { x: p.position.x, y: p.position.y + E.headTop + 1.2, z: p.position.z } : wp(E.lanes[i], 3, E.laneZ);
    particles?.burst('confetti', at, { count: 18, radius: 0.9, height: 0.8 });
    sfx?.play('chime', { pitch: 1.4, vol: 0.6 });
    labels?.label(sum ? `Henhouse! +${sum}` : 'Henhouse!', { x: at.x, y: at.y + 0.9, z: at.z }, '#baffc8');
    for (let k = 0; k < 6; k++) flying.push({ x: at.x - centre.x, y: at.y - O.y - 1, z: at.z - centre.z, vx: (E.lanes[i] - (at.x - centre.x)) * 1.2 + (hash(k) - 0.5) * 0.8, vy: 3 + hash(k + 9) * 1.5, vz: 2.5 + hash(k + 3), gold: false, life: 0.9 });
  }

  function update(dt, { mode = 'wait', v = null, t = 0, lanePlayers = [] } = {}) {
    if (!root.visible) return;
    t0 += dt;
    if (mode !== lastMode) { lastMode = mode; lobbed = new Set(); settled.clear(); practiceState = null; for (const L of lay) L.last = -1; flying.length = 0; }
    for (let b = 0; b < bounce.length; b++) bounce[b] = Math.max(0, bounce[b] - dt * 5);
    throwT = Math.max(0, throwT - dt);
    shyam.rig.position.y = Math.sin(t0 * 2.2) * 0.04 + (throwT > 0 ? 0.08 : 0);
    shyam.armR.rotation.x = throwT > 0 ? -2.4 + (0.5 - throwT) * 3 : -0.2 + Math.sin(t0 * 3) * 0.15;
    shyam.armL.rotation.x = Math.sin(t0 * 2.4) * 0.2;
    shyam.setExpression?.('happy');
    n.egg = n.gold = n.cone = n.shadow = 0;
    if (mode === 'play' && v) {
      animateCast(t, v.items);
      v.slots.forEach((slot, i) => drawLane(i, v.items, t, { stack: v.stack[slot] || [], res: v.res[slot] || {}, rt: v.rt[slot] || {} }, lanePlayers[i] || null));
    } else if (mode === 'practice') {
      const items = (practiceState ||= { items: buildItems(777).slice(0, PRACTICE_N), lanes: {} }).items;
      const loopLen = items[items.length - 1].t0 + 3.2, tm = (t0 % loopLen);
      if (tm < dt * 1.5) { practiceState.lanes = {}; settled.clear(); lobbed = new Set(); }
      animateCast(tm, items);
      lanePlayers.forEach((p, i) => { if (p && i < E.lanes.length) drawLane(i, items, tm, localLane(i, 'p', items, tm, p, practiceState.lanes), p); });
    } else { grouse.forEach((g, i) => { g.root.position.x = E.lanes[i]; }); }
    // eggs flying into the henhouse
    for (let k = flying.length - 1; k >= 0; k--) {
      const f = flying[k]; f.life -= dt; f.vy -= 14 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
      if (f.life <= 0) { flying.splice(k, 1); continue; }
      put(eggs, 'egg', f.x, Math.max(0.2, f.y), f.z, 1, 1, 1, f.life * 8, 0, f.life * 6);
    }
    for (const [m, k] of [[eggs, 'egg'], [golds, 'gold'], [cones, 'cone'], [shadows, 'shadow']]) { m.count = n[k]; m.instanceMatrix.needsUpdate = true; }
  }

  return {
    root, update, cam: CAM, look: 'snow', stackWobble,
    setVisible(on) {
      root.visible = !!on;
      if (!on) { labels?.clear?.(); lastMode = ''; n.egg = n.gold = n.cone = n.shadow = 0; for (const m of [eggs, golds, cones, shadows]) m.count = 0; flying.length = 0; practiceState = null; settled.clear(); lobbed = new Set(); for (const L of lay) L.last = -1; }
    },
    onRec(rec, v, who) {
      if (!root.visible || !v || rec.slot === undefined) return;
      const i = v.slots.indexOf(rec.slot), p = who ? who(rec.slot) : null;
      if (i < 0) return;
      if (rec.k === 'catch') { catchFx(i, 'catch', rec.gold ? E.goldValue : 1, p, (v.stack[rec.slot] || []).length); if (rec.bank) bankFx(i, p, null); }
      else if (rec.k === 'bonk') {
        catchFx(i, 'bonk', 0, p);
        const at = p ? { x: p.position.x - centre.x, y: p.position.y - O.y + E.headTop + 0.6, z: p.position.z - centre.z } : { x: E.lanes[i], y: 2.5, z: E.laneZ };
        for (let k = 0; k < Math.min(6, rec.lost); k++) flying.push({ ...{ x: at.x, y: at.y, z: at.z }, vx: (hash(k + i) - 0.5) * 5, vy: 3 + hash(k + 5) * 2.5, vz: 1 + hash(k + 11) * 2.5, gold: false, life: 0.9 });
      }
    },
    scoreText(v, slot) { return v ? { text: `${v.totals[slot] ?? 0}`, out: false } : { text: '', out: false }; },
    clearPractice() { practiceState = null; },
    counts: () => ({ ...n }),
    summary() { let calls = 0; root.traverse((o) => { if (o.isMesh && o.visible) calls++; }); return { visible: root.visible, meshes: calls, ...n }; },
    dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); shyam.dispose?.(); grouse.forEach((g) => g.dispose?.()); scene.remove(root); },
  };
}
