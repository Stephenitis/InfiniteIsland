// Feast-Go-Round's inner-floor bamboo counter (Step 80d). createFeastroundWorld({scene,sfx}) follows the party stage API.
// Cached, merged, outlined 3D meals are INSTANCED by recipe on VERTEX_TOON, including carried plates. No textures or new lights.
// dishPose is both the drawn instance centre and the host's grab target. dishInstance(id) exposes the actual batch/matrix for tests.
import * as THREE from 'three';
import { PARTY, TDOONGZ } from '../../config.js';
import { stageCentre } from '../../game/party/partyArea.js';
import { init, view, dishPose, seatAngle, localActor, request, apply } from '../../game/party/feastroundLogic.js';
import { RECIPES } from '../../game/catalog.js';
import { VERTEX_TOON } from '../../render/geo.js';
import { dishGeometry } from './feastDishModels.js';
import { createTdoongModel } from '../../npc/tdoongz.js';
import { solid, glow, disc, ring, box, ball, post } from './kit.js';

const F = PARTY.feastround, O = PARTY.origin, c = stageCentre('feastround');
export const CAM = { focus: { x: c.x, y: O.y + 0.8, z: c.z - 0.6 }, offset: { x: 0, y: 19, z: 17 }, extent: { w: 20, d: 23 } };
export function createFeastroundWorld({ scene, sfx }) {
  const root = new THREE.Group(); root.name = 'party-feastround'; root.position.set(c.x, O.y, c.z); root.visible = false; scene.add(root);
  const base = [disc(24, '#acd470'), disc(5.05, '#e0c78a', [0, 0.02, 0]),
    ring(5.1, 6.5, '#75c8c1', [0, 0.65, 0]), ring(4.98, 5.2, '#d0b664', [0, 0.8, 0]), ring(6.4, 6.65, '#c9ba68', [0, 0.8, 0]),
    disc(2.5, '#7fdcd0', [10, 0.2, -2]), ring(2.5, 2.85, '#b4aaa0', [10, 0.4, -2])];
  // Low bamboo perch marks sit inside the counter; they never obstruct the shared walking floor.
  for (let k = 0; k < 4; k++) {
    const a = seatAngle(k); base.push(disc(0.55, '#cba66a', [Math.cos(a) * F.spawnR, 0.025, Math.sin(a) * F.spawnR], 0.02));
  }
  for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; base.push(ball(0.45, '#abae91', [10 + Math.cos(a) * 2.6, 0.25, -2 + Math.sin(a) * 2.6], [1.3, 0.7, 1])); }
  for (let k = 0; k < 11; k++) for (let j = 0; j < 3; j++) {
    const x = -10 + k * 2; base.push(post(0.16, 1.8, '#75a443', [x, -0.1 + j * 1.8, -10.5]), ball(0.45, '#4da75c', [x + 0.4, 3 + j * 0.5, -10.5], [1.7, 0.15, 0.6]));
  }
  root.add(solid(base, { outline: 0.03 }));
  const arrows = glow([box(1.4, 0.04, 0.12, '#fff3b8', [0, 0.87, 6]), box(0.55, 0.04, 0.12, '#fff3b8', [0.6, 0.87, 5.85], [0, -0.6, 0]), box(0.55, 0.04, 0.12, '#fff3b8', [0.6, 0.87, 6.15], [0, 0.6, 0])]); root.add(arrows);
  const host = createTdoongModel('sonchaetty'); host.root.scale.setScalar(TDOONGZ.sonchaetty.scale); host.root.position.set(0, 0, -8.6); root.add(host.root);
  const batches = new Map(), instances = new Map(), dummy = new THREE.Object3D();
  function batch(dish, gold = false) {
    const key = gold ? 'golden-lantern-supper' : dish;
    if (!batches.has(key)) {
      const mesh = new THREE.InstancedMesh(dishGeometry(dish, gold), VERTEX_TOON, 12);
      mesh.name = 'feast-meals-' + key; mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(mesh); batches.set(key, mesh);
    }
    return batches.get(key);
  }
  for (const recipe of RECIPES) batch(recipe.dish);
  batch('chilli'); batch('lantern-supper', true);
  let practice, practiceT;
  const reset = () => { practice = init(80, [0, 1, 2, 3].map(slot => ({ slot }))); practiceT = 0; }; reset();
  function update(dt, { mode, v, t, who = () => null }) {
    if (!v) { practiceT += dt; if (practiceT >= F.duration) reset(); v = view(practice, practiceT); }
    for (const mesh of batches.values()) { mesh.count = 0; mesh.visible = false; }
    instances.clear();
    function meal(dish, key, x, y, z, gold = false, scale = 1, yaw = 0) {
      const mesh = batch(dish, gold), index = mesh.count++;
      dummy.position.set(x, y, z); dummy.rotation.set(0, yaw, 0); dummy.scale.setScalar(scale); dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix); mesh.visible = true; instances.set(key, { mesh, index });
    }
    for (const d of v.dishes) {
      const p = dishPose(d, v.t); if (p.visible && !v.taken[d.id]) meal(d.dish, d.id, p.x, p.y, p.z, d.kind === 'gold', 1, p.angle);
    }
    v.slots.forEach((slot, i) => {
      const held = v.plates[slot]; if (!held) return;
      const player = who(slot), a = seatAngle(i), actor = localActor(player?.position, player?.facing ?? player?.root?.rotation.y) || { x: Math.cos(a) * F.spawnR, z: Math.sin(a) * F.spawnR, face: Math.atan2(Math.cos(a), Math.sin(a)) };
      meal(held.dish, 'held:' + slot, actor.x + Math.sin(actor.face) * 0.65, 1.05, actor.z + Math.cos(actor.face) * 0.65, held.value === 10, 0.7, actor.face);
    });
    for (const mesh of batches.values()) if (mesh.visible) mesh.instanceMatrix.needsUpdate = true;
    arrows.rotation.y = v.direction === -1 ? Math.PI : 0;
    host.root.rotation.y = Math.sin((t || practiceT) * 0.7) * 0.08;
    host.armR.rotation.x = -0.5 + Math.sin((t || practiceT) * Math.PI / F.gap) * 0.15;
  }
  return {
    root, cam: CAM, look: 'warm', update, clearPractice: reset, setVisible(on) { root.visible = on; },
    practicePress(slot, player) {
      const out = request(practice, slot, { t: practiceT, face: player.facing }, { t: practiceT, slack: 0, pos: () => player.position });
      if (out.rec) apply(practice, out.rec); sfx?.play(out.rec?.k === 'grab' ? 'plategrab' : 'chew', { vol: 0.4 });
    },
    onRec(r, v) { sfx?.play(r.k === 'grab' ? (v.hotUntil[r.slot] > r.t ? 'pepper' : 'plategrab') : r.k === 'chew' ? 'chew' : 'bip', { vol: 0.35 }); },
    scoreText(v, slot) { return { text: `${v.scores[slot] || 0} pts` + (v.t < (v.hotUntil[slot] || 0) ? ' - Hot!' : v.plates[slot] ? ` - ${v.plates[slot].left} chews` : ''), out: false }; },
    dishInstance: id => instances.get(id), batches,
    summary() { return { visible: root.visible, kinds: [...batches.values()].filter(m => m.visible).length }; },
    dispose() {
      const cached = new Set([...batches.values()].map(m => m.geometry)), geos = new Set();
      root.traverse(o => { if (o.geometry && !cached.has(o.geometry)) geos.add(o.geometry); });
      for (const g of geos) g.dispose(); root.removeFromParent();
    },
  };
}
