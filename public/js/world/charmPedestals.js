// Charm pedestals (Step 58): a stone plinth with the charm's gem floating and spinning over it, for the pedestals in the run state (the Armory rack in the first safe
// start, plus each section's own). Pure presentation: `update(state, t)` mirrors `state.pedestals` on every screen.
//
//   const pedestals = createCharmPedestals(scene);  pedestals.update(runState, t);  pedestals.summary()
//
// Per pedestal: plinth (merged-free, 1 draw call + its outline), the gem (1) and a faint additive glow ring on the plinth top (1) = 4 draw calls, only while shown.
import * as THREE from 'three';
import { toonMat, addOutline } from '../render/toon.js';
import { createCharmTrinket, charmColor } from '../player/charmModels.js';

export function createCharmPedestals(scene) {
  const live = new Map();       // pedestal id -> { group, gem, charm, ring }
  const plinthGeo = new THREE.CylinderGeometry(0.42, 0.55, 0.62, 10).translate(0, 0.31, 0);
  const capGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.09, 10).translate(0, 0.665, 0);
  const ringGeo = new THREE.RingGeometry(0.28, 0.48, 24).rotateX(-Math.PI / 2);
  const stone = toonMat('#aab0bf');
  function build(ped) {
    const group = new THREE.Group(); group.name = 'charm-pedestal';
    const plinth = new THREE.Mesh(plinthGeo, stone), cap = new THREE.Mesh(capGeo, stone);
    plinth.castShadow = true; group.add(plinth, cap);
    try { addOutline(plinth); } catch (_) { /* outline is cosmetic */ }
    const ringMat = new THREE.MeshBasicMaterial({ color: '#c9a6ff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat); ring.position.y = 0.72; group.add(ring);
    scene.add(group);
    return { group, gem: null, charm: undefined, ring, ringMat };
  }
  return {
    update(state, t) {
      const wanted = state.active ? (state.pedestals || []).filter((p) => p.section <= state.section) : [];
      const ids = new Set(wanted.map((p) => p.id));
      for (const [id, v] of live) if (!ids.has(id)) { scene.remove(v.group); v.ringMat.dispose(); live.delete(id); }
      for (const ped of wanted) {
        let v = live.get(ped.id);
        if (!v) live.set(ped.id, v = build(ped));
        const y = state.area.origin.y;
        v.group.position.set(ped.x, y, ped.z);
        if (v.charm !== (ped.charm || null)) {
          if (v.gem) v.group.remove(v.gem);
          v.gem = ped.charm ? createCharmTrinket(ped.charm) : null;
          if (v.gem) v.group.add(v.gem);
          v.charm = ped.charm || null;
          v.ringMat.color.set(ped.charm ? charmColor(ped.charm) : '#8a8fa0');
        }
        v.ring.visible = !!v.gem;
        if (v.gem) { v.gem.position.set(0, 1.12 + Math.sin(t * 2.2 + ped.x) * 0.07, 0); v.gem.rotation.y = t * 1.6; v.gem.scale.setScalar(1.7); }
        v.ringMat.opacity = 0.4 + 0.2 * Math.sin(t * 3);
      }
    },
    summary: () => [...live].map(([id, v]) => ({ id, charm: v.charm })),
  };
}
