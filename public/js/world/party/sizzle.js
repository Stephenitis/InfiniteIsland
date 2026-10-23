// Sizzle Seed's stage (Step 80c): the home campfire clearing at dusk-gold: a stone-ringed fire in a dirt clearing, four log benches (obstacles; their colliders are registered by game/party.js from
// partyArea.sizzleObstacles()), cheering spots at the back, pines round the edge, and Dub Nyangee on a stump, gentle and calm, "lighting the fuse". The sizzling Ember Seed is drawn OVER THE HOLDER'S HEAD (wherever
// that player is on this screen: a local body or a remote avatar): there is no seed position of its own, so what you see is exactly who the host says holds it. It glows hotter and sparkles faster with its AGE
// (the same `heat` the rules publish; nothing here knows the pop time). A popped player gets a little soot cloud over their head for the rest of the game. Built once (lazily), hidden outside the game; ONE Group.
//
//   const w = createSizzleWorld({ scene, sfx, particles, labels })
//   w.setVisible(on)         w.update(dt, { mode: 'practice' | 'wait' | 'play', v, t, who })    v = sizzleLogic.view(g, t) in play; who(slot) -> the Player (or avatar) of that slot, or null
//   w.onRec(rec, v)          presentation of a record: the hand-over, a pass (a poof, a "Pass!" word), the pop (soot, confetti, a boom)
//   w.scoreText(v, slot) -> { text, out }      w.seedAnchor(v, who) -> { x, y, z } | null (where the seed is drawn: the holder's head)      w.heatNow()      w.cam      w.look ('warm')      w.clearPractice()
// Draw calls: base 1 (+outline), flames 1, seed 1 + halo 1, up to 4 soot clouds, Dub ~12; about 22.
import * as THREE from 'three';
import { stageLivingLifecycle, hostIdle } from './livingStage.js';
import { PARTY, TDOONGZ } from '../../config.js';
import { stageCentre } from '../../game/party/partyArea.js';
import { createTdoongModel } from '../../npc/tdoongz.js';
import { part, G, combine } from '../../render/geo.js';
import { solid, glow, disc, ring, box, ball, cone } from './kit.js';

const S = PARTY.sizzle, O = PARTY.origin;
const centre = stageCentre('sizzle');
export const CAM = { focus: { x: centre.x, y: O.y + 0.6, z: centre.z + 0.8 }, offset: { x: 0, y: 16.5, z: 14.5 }, extent: { w: 23, d: 24 } };
const DUB = { x: 0, z: -11.2 };
export const SEED_LIFT = 2.45;                                   // the seed floats this far over the holder's feet (just over a head)
const lerpC = (a, b, u) => a.clone().lerp(b, u);

export function createSizzleWorld({ scene, sfx, particles, labels }) {
  const root = new THREE.Group();
  root.name = 'party-sizzle';
  root.position.set(centre.x, O.y, centre.z);
  root.visible = false;
  scene.add(root);
  const geos = [], mats = [];
  const living = stageLivingLifecycle({ root, id: 'sizzle', cam: CAM });
  let disposed = false;

  // ---- the clearing: the dirt ring, the fire pit stones, the benches, the cheering spots (the meadow, trees and flowers round it are the living pass, livingStage.js)
  const base = [disc(S.arenaR, '#d3b07a', [0, 0.05, 0], 0.2), ring(S.arenaR - 0.5, S.arenaR, '#bd9660', [0, 0.07, 0], 0.08), disc(S.fireR + 0.5, '#6e5a48', [0, 0.1, 0], 0.2)];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; base.push(ball(0.34, i % 2 ? '#9a9aa8' : '#7e7e8e', [Math.cos(a) * (S.fireR + 0.05), 0.3, Math.sin(a) * (S.fireR + 0.05)], [1, 0.8, 1])); }
  base.push(box(1.7, 0.22, 0.26, '#8a5a3c', [0, 0.12, 0], [0, 0.6, 0]), box(1.7, 0.22, 0.26, '#7a4c30', [0, 0.14, 0], [0, -0.6, 0]));       // the logs in the fire
  for (const deg of S.benches.angles) {                                      // log benches: a long seat on two stubby legs, tangent to the ring
    const a = deg * Math.PI / 180, cx = Math.cos(a) * S.benches.r, cz = Math.sin(a) * S.benches.r, rot = -a + Math.PI / 2;
    base.push(box(S.benches.half * 2, 0.34, 0.55, '#b57a4e', [cx, 0.34, cz], [0, rot, 0]), box(S.benches.half * 2 + 0.06, 0.1, 0.5, '#d9a06a', [cx, 0.68, cz], [0, rot, 0]));
    for (const k of [-1, 1]) base.push(box(0.4, 0.4, 0.5, '#8a5a3c', [cx + Math.cos(rot) * k * (S.benches.half - 0.45), 0, cz - Math.sin(rot) * k * (S.benches.half - 0.45)], [0, rot, 0]));
  }
  [-4.5, -1.5, 1.5, 4.5].forEach((x) => base.push(disc(1.4, '#c8935a', [x, 0.1, S.spectatorZ], 0.2)));
  base.push(disc(1.5, '#a77a4e', [DUB.x, 0.5, DUB.z], 0.5), disc(1.25, '#e0b27a', [DUB.x, 0.52, DUB.z], 0.05), ring(0.4, 0.55, '#a9733f', [DUB.x, 0.55, DUB.z], 0.04));     // Dub's stump
  base.push(box(2.0, 0.6, 1.2, '#d86a4a', [-9.6, 0, -6.2], [0, 0.4, 0]), cone(1.5, 1.6, '#e8a05a', [-9.6, 0.6, -6.2]));                                      // Dub's picnic basket and a little tent at the back left
  const baseMesh = solid(base, { outline: 0.035 });
  baseMesh.name = 'sizzle-base';
  root.add(baseMesh); geos.push(baseMesh.geometry);
  for (const child of baseMesh.children) if (child.geometry) geos.push(child.geometry);

  // ---- the fire: three layered flames, animated by scale
  const flameParts = [];
  for (const [r, h, c, ox] of [[0.62, 1.7, '#ff8a2a', 0], [0.46, 1.3, '#ffc43a', 0.18], [0.3, 0.9, '#fff0a0', -0.1]]) flameParts.push(part(G.cone6, c, { p: [ox, 0.2 + h / 2, 0], s: [r, h, r] }));
  const flames = glow(flameParts);
  flames.name = 'sizzle-flames';
  root.add(flames); geos.push(flames.geometry);

  // ---- Dub Nyangee on the stump: calm, watching the seed
  const dub = createTdoongModel('dubnyangee');
  dub.root.scale.setScalar(TDOONGZ.dubnyangee.scale);
  dub.root.position.set(DUB.x, 1.0, DUB.z);
  root.add(dub.root);

  // ---- the Ember Seed (one glowing ovoid with a stem + a soft halo) and the soot clouds
  const seedGeo = combine([part(G.sphere, '#ffffff', { p: [0, 0, 0], s: [0.3, 0.4, 0.3] }), part(G.cyl6, '#ffffff', { p: [0.04, 0.46, 0], r: [0, 0, -0.35], s: [0.05, 0.2, 0.05] })]);
  const seedMat = new THREE.MeshBasicMaterial({ color: '#ff9a3c' });
  const seed = new THREE.Mesh(seedGeo, seedMat);
  seed.castShadow = false; seed.visible = false;
  const haloMat = new THREE.MeshBasicMaterial({ color: '#ff7a2a', transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending });
  const halo = new THREE.Mesh(G.sphere, haloMat);
  halo.castShadow = false; halo.visible = false; halo.renderOrder = 3;
  const sootGeo = combine([part(G.sphere, '#3a3440', { p: [0, 0, 0], s: [0.42, 0.28, 0.34] }), part(G.sphere, '#4a4452', { p: [0.34, 0.1, 0.05], s: [0.28, 0.22, 0.26] }), part(G.sphere, '#2e2a36', { p: [-0.3, 0.06, -0.04], s: [0.26, 0.2, 0.24] })]);
  const sootMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const soots = Array.from({ length: 4 }, () => { const m = new THREE.Mesh(sootGeo, sootMat); m.castShadow = false; m.visible = false; return m; });
  root.add(seed, halo, ...soots);
  geos.push(seedGeo, sootGeo); mats.push(seedMat, haloMat, sootMat);

  const COOL = new THREE.Color('#ffb04a'), HOT = new THREE.Color('#ff2a1a');
  const _p = new THREE.Vector3(), tmp = new THREE.Color();
  let t0 = 0, sparkleAcc = 0, heat = 0, lastMode = '';
  const worldToRoot = (p) => _p.set(p.x - centre.x, p.y - O.y, p.z - centre.z);

  /** Where the seed is drawn: over the holder's head (null when nobody holds it, or that player is not on this screen). */
  function seedAnchor(v, who) {
    if (!v || v.holder === null || !who) return null;
    const p = who(v.holder);
    return p ? { x: p.position.x, y: p.position.y + SEED_LIFT, z: p.position.z } : null;
  }

  function update(dt, { mode = 'wait', v = null, t = 0, who = null, lanePlayers = [] } = {}) {
    if (!root.visible) return;
    t0 += dt; living.update(dt, t0, lanePlayers);
    // Dub watches whoever holds the seed (cosmetic: the head only), and gives a little start when it changes hands or pops.
    hostIdle(dub, t0, mode === 'play' && v ? { totals: v.holder === null || v.holder === undefined ? {} : { [v.holder]: 10 + v.holder }, alive: v.alive, done: v.done } : null, lanePlayers);
    if (mode !== lastMode) { lastMode = mode; if (mode !== 'play') for (const s of soots) s.visible = false; }
    const f = 1 + Math.sin(t0 * 14) * 0.08;
    flames.scale.set(f, 1 + Math.sin(t0 * 9) * 0.12 + Math.sin(t0 * 23) * 0.05, f);
    flames.rotation.y = t0 * 0.8;
    // Dub: a slow breath and a gentle wave of the paws; happier when the seed is out
    dub.rig.position.y = Math.sin(t0 * 1.2) * 0.03;
    dub.torso.rotation.z = Math.sin(t0 * 0.9) * 0.04;
    dub.armR.rotation.x = -0.5 + Math.sin(t0 * 1.6) * 0.15;
    dub.headGroup.rotation.x *= Math.max(0, 1 - dt * 6);
    dub.setExpression?.(mode === 'play' ? 'happy' : 'normal');
    // the seed
    let anchor = null, h = 0;
    if (mode === 'play' && v) {
      h = v.heat;
      anchor = seedAnchor(v, who);
      if (!anchor && v.holder === null && !v.done) { const w = { x: centre.x + DUB.x + 0.7, y: O.y + 2.6, z: centre.z + DUB.z + 0.5 }; anchor = w; }       // between pops: back in Dub's paws
    } else if (mode === 'practice') {
      h = 0.5 + 0.5 * Math.sin(t0 * 0.7);
      anchor = { x: centre.x + DUB.x + 0.7, y: O.y + 2.6, z: centre.z + DUB.z + 0.5 };
    }
    heat = h;
    seed.visible = halo.visible = !!anchor;
    if (anchor) {
      worldToRoot(anchor);
      const bob = Math.sin(t0 * (4 + h * 14)) * (0.04 + 0.05 * h), k = 0.8 + 0.5 * h + Math.sin(t0 * (6 + 18 * h)) * 0.06 * (0.3 + h);
      seed.position.set(_p.x, _p.y + bob, _p.z); seed.scale.setScalar(k); seed.rotation.z = Math.sin(t0 * 5) * 0.2;
      halo.position.copy(seed.position); halo.scale.setScalar(0.55 + 0.7 * h + Math.sin(t0 * (8 + 20 * h)) * 0.06);
      haloMat.opacity = 0.12 + 0.4 * h;
      seedMat.color.copy(lerpC(COOL, HOT, h));
      sparkleAcc += dt * (2 + 16 * h * h);                               // the fuse sparkle: faster as the seed ages (the age, not the real timer)
      while (sparkleAcc >= 1) {
        sparkleAcc -= 1;
        particles?.burst('sparkle', { x: anchor.x + 0.1, y: anchor.y + 0.5 * k, z: anchor.z }, { count: 1, radius: 0.18, height: 0.25, color: tmp.setRGB(1, 0.8 - 0.4 * h, 0.3).getStyle() });
      }
    }
    // soot clouds over the popped
    soots.forEach((m, i) => {
      const slot = mode === 'play' && v ? v.popped[i] : undefined, p = slot !== undefined && who ? who(slot) : null;
      m.visible = !!p;
      if (p) { worldToRoot({ x: p.position.x, y: p.position.y + 2.15 + Math.sin(t0 * 2 + i) * 0.06, z: p.position.z }); m.position.copy(_p); m.rotation.y = t0 * 0.7 + i; }
    });
  }

  return {
    root, update, cam: CAM, look: 'warm', seedAnchor,
    get living() { return living.current; },
    setVisible(on) {
      living.setVisible(on);
      root.visible = !!on;
      if (!on) { labels?.clear?.(); lastMode = ''; seed.visible = halo.visible = false; for (const s of soots) s.visible = false; sparkleAcc = 0; }
    },
    heatNow: () => heat,
    onRec(rec, v, who) {
      if (!root.visible) return;
      if (rec.k === 'give') {
        sfx?.play('seedpass', { pitch: 1.2, vol: 0.6 });
        const p = who && who(rec.slot);
        if (p) labels?.label('Hot seed!', { x: p.position.x, y: p.position.y + 3.0, z: p.position.z }, '#ffd27a');
        dub.headGroup.rotation.x = 0.3;
      } else if (rec.k === 'pass') {
        const to = who && who(rec.to), from = who && who(rec.from);
        sfx?.play('seedpass', { pitch: 0.9 + Math.random() * 0.2 });
        if (to) {
          particles?.burst('puff', { x: to.position.x, y: to.position.y + 1.0, z: to.position.z }, { count: 8, radius: 0.5, height: 0.4, size: 0.9, color: '#ffd9a0' });
          labels?.label('Hot!', { x: to.position.x, y: to.position.y + 3.0, z: to.position.z }, '#ffb066');
        }
        if (from) labels?.label('Phew!', { x: from.position.x, y: from.position.y + 2.6, z: from.position.z }, '#baffc8');
      } else if (rec.k === 'pop') {
        const p = who && who(rec.slot);
        const at = p ? { x: p.position.x, y: p.position.y + 1.8, z: p.position.z } : { x: centre.x, y: O.y + 2, z: centre.z };
        sfx?.play('seedpop');
        particles?.burst('confetti', at, { count: 46, radius: 1.8, height: 1.4 });
        particles?.burst('puff', at, { count: 16, radius: 0.9, height: 0.8, size: 1.5, color: '#3a3440' });
        labels?.label('POP! Sooty!', { x: at.x, y: at.y + 1.0, z: at.z }, '#ffe27a');
        dub.headGroup.rotation.x = 0.25;
      }
    },
    scoreText(v, slot) {
      if (!v) return { text: '', out: false };
      if (!v.alive[slot]) return { text: 'SOOTY', out: true };
      return { text: v.holder === slot ? 'SEED!' : 'Safe', out: false };
    },
    clearPractice() { for (const s of soots) s.visible = false; },
    summary() { let calls = 0; root.traverse((o) => { if (o.isMesh && o.visible) calls++; }); return { visible: root.visible, meshes: calls }; },
    dispose() { if (disposed) return; disposed = true; living.dispose(); for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); dub.dispose?.(); scene.remove(root); },
  };
}
