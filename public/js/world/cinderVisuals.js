// Cinder Tubes' moving parts (Step 60), all derived from the synced run state so every screen shows the same thing (late joiners included):
//   * burning PATCHES   ONE instanced layer of glowing discs + ONE of flames (cap COMBAT.patch.cap): an Ember Seed's fire, the lava slug's trail, the Magma Toad's blobs
//   * RAIN CLOUDS       the watering can's special: a puffy cloud with a ground ring and falling drops (ONE instanced layer shared by all clouds)
//   * pending BURSTS    the toad's lava blobs: a pulsing landing circle and a glowing ball dropping from above
//   * the SAPLING       the defended sapling (`state.obj.sapling`): droops and goes grey as its HP runs out, a green ring while it is healthy
//   * LOBS              an Ember Seed in flight (from the `charm` event): a glowing seed along a parabola to the target point
//   * status overlays   `attachStatus(group, def)` / `updateStatus(...)`: a wet blue shell, flames on a burning guardian, stars over a blinded one, a thicker ice shell for "frozen solid"
//   * effects           `effect(fx, ...)`: reactions (douse / steam / frozen solid / cool), Ember Seed bursts, lava blobs landing, rain healing, the sapling being hurt, brambles burning, a guardian falling
//                       off a ledge, a chief splitting, the toad's tongue.
// Everything is merged / instanced or a handful of meshes; no lights.
import * as THREE from 'three';
import { COMBAT, REACTIONS, CHARM } from '../config.js';
import { toonMat } from '../render/toon.js';

const hash = (a, b = 0) => { const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return n - Math.floor(n); };

export function createCinderVisuals(scene, { particles, sfx } = {}) {
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
  const P = COMBAT.patch.cap;
  // ---- burning patches
  const discGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), flameGeo = new THREE.ConeGeometry(0.28, 0.9, 6).translate(0, 0.45, 0);
  const discs = new THREE.InstancedMesh(discGeo, new THREE.MeshBasicMaterial({ color: '#ff5a1f', transparent: true, opacity: 0.55, depthWrite: false }), P);
  const flames = new THREE.InstancedMesh(flameGeo, new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9 }), P * 3);
  for (const m of [discs, flames]) { m.frustumCulled = false; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.visible = false; scene.add(m); }
  discs.name = 'burning-patches'; flames.name = 'burning-flames'; discs.renderOrder = 2;
  // ---- rain clouds
  const dropGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.32, 4), drops = new THREE.InstancedMesh(dropGeo, new THREE.MeshBasicMaterial({ color: '#8fd0ff', transparent: true, opacity: 0.85 }), 60);
  drops.frustumCulled = false; drops.count = 0; drops.name = 'rain-drops'; drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(drops);
  const cloudMat = toonMat('#f4f9ff'), cloudDark = toonMat('#cfdcf0'), ringGeo = new THREE.RingGeometry(0.92, 1, 40).rotateX(-Math.PI / 2), ringMat = new THREE.MeshBasicMaterial({ color: '#8fd0ff', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const clouds = new Map();                                        // cloud id -> { group, ring }
  const puff = new THREE.SphereGeometry(1, 10, 8);
  function makeCloud() {
    const group = new THREE.Group(); group.name = 'rain-cloud';
    for (const [x, y, z, r, mat] of [[0, 0, 0, 0.8, cloudMat], [0.7, -0.08, 0.1, 0.6, cloudMat], [-0.7, -0.1, -0.05, 0.62, cloudMat], [0.1, 0.25, -0.1, 0.55, cloudMat], [0.1, -0.25, 0.1, 0.7, cloudDark]]) {
      const m = new THREE.Mesh(puff, mat); m.position.set(x, y, z); m.scale.set(r, r * 0.7, r); group.add(m);
    }
    const ring = new THREE.Mesh(ringGeo, ringMat); ring.name = 'rain-ring'; ring.renderOrder = 2; scene.add(group, ring);
    return { group, ring };
  }
  // ---- pending bursts (the toad's lava blobs)
  const blobGeo = new THREE.SphereGeometry(0.45, 12, 9), blobMat = new THREE.MeshBasicMaterial({ color: '#ff8a3d' }), blobRingGeo = new THREE.RingGeometry(0.8, 1, 40).rotateX(-Math.PI / 2);
  const blobDiscGeo = new THREE.CircleGeometry(0.8, 32).rotateX(-Math.PI / 2);
  const blobs = new Map();                                         // burst id -> { group }
  // ---- the sapling
  const sapling = new THREE.Group(); sapling.name = 'defend-sapling'; sapling.visible = false; scene.add(sapling);
  const leafMat = toonMat('#6fcf62'), trunkMat = toonMat('#8a5a36'), stoneMat = toonMat('#8f8a9c');
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.3, 7).translate(0, 0.65, 0), trunkMat), crowns = [];
  sapling.add(trunk);
  for (const [x, y, z, r] of [[0, 1.55, 0, 0.62], [0.38, 1.2, 0.1, 0.42], [-0.38, 1.25, -0.05, 0.44], [0.05, 1.9, 0.05, 0.4]]) { const c = new THREE.Mesh(puff, leafMat); c.position.set(x, y, z); c.scale.set(r, r * 0.85, r); sapling.add(c); crowns.push(c); }
  const ringStones = new THREE.Group(); for (let n = 0; n < 9; n++) { const a = n * Math.PI * 2 / 9, s = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.34), stoneMat); s.position.set(Math.cos(a) * 1.15, 0.13, Math.sin(a) * 1.15); s.rotation.y = -a; ringStones.add(s); }
  sapling.add(ringStones);
  const saplingRing = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.6, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#9dff8a', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })); saplingRing.position.y = 0.06; sapling.add(saplingRing);
  const wiltLeaf = new THREE.Color('#9a9a7a'), freshLeaf = new THREE.Color('#6fcf62');
  // ---- Ember Seed lobs
  const lobs = [], lobGeo = new THREE.SphereGeometry(0.2, 10, 8), lobMat = new THREE.MeshBasicMaterial({ color: '#ff8a3d' });
  // ---- status overlays (per guardian)
  const wetMat = new THREE.MeshBasicMaterial({ color: '#6cc4ff', transparent: true, opacity: 0.3, depthWrite: false }), solidMat = new THREE.MeshBasicMaterial({ color: '#d6f1ff', transparent: true, opacity: 0.72, depthWrite: false });
  const fireMat = new THREE.MeshBasicMaterial({ color: '#ff8a3d', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }), starMat = new THREE.MeshBasicMaterial({ color: '#ffe27a' });
  const shellGeo = new THREE.IcosahedronGeometry(1, 1), starGeo = new THREE.OctahedronGeometry(0.12), fireGeo = new THREE.ConeGeometry(0.34, 0.95, 6).translate(0, 0.45, 0);

  const grid = (state) => state.g;
  return {
    /** Add the status overlays to a guardian model; returns the handles `updateStatus` drives. */
    attachStatus(group, def) {
      const big = def.boss ? 1.3 : def.mini ? 1.1 : 0.9, y = def.boss ? 1.1 : 0.85;
      const wet = new THREE.Mesh(shellGeo, wetMat); wet.name = 'wet-shell'; wet.visible = false; wet.position.y = y; wet.scale.set(big * 0.92, big * 0.95, big * 0.92);
      const fire = new THREE.Mesh(fireGeo, fireMat); fire.name = 'burning-flame'; fire.visible = false; fire.position.y = y + big * 0.55; fire.scale.setScalar(big * 1.1);
      const stars = new THREE.Group(); stars.name = 'blind-stars'; stars.visible = false; stars.position.y = y + big * 1.2;
      for (let n = 0; n < 3; n++) { const st = new THREE.Mesh(starGeo, starMat); st.userData.a = n * Math.PI * 2 / 3; stars.add(st); }
      group.add(wet, fire, stars);
      return { wet, fire, stars, big, y };
    },
    /** Per frame: show / hide the overlays of guardian `e` and animate them. `ice` = the existing frozen shell of dungeonVisuals. */
    updateStatus(v, e, state, t, frozen, ice) {
      const on = v.group.visible, now = state.time, wet = on && (e.wet || 0) > now && !frozen, burning = on && (e.burning || 0) > now, blind = on && (e.blind || 0) > now;
      const o = v.status; if (!o) return;
      o.wet.visible = wet; if (wet) o.wet.scale.set(o.big * (0.92 + Math.sin(t * 5 + e.id) * 0.02), o.big * 0.95, o.big * 0.92);
      o.fire.visible = burning; if (burning) { o.fire.scale.set(o.big * (1 + Math.sin(t * 17 + e.id) * 0.12), o.big * (1.1 + Math.sin(t * 13 + e.id) * 0.18), o.big); o.fire.rotation.y = t * 3; }
      o.stars.visible = blind; if (blind) { o.stars.children.forEach((st) => { const a = st.userData.a + t * 5; st.position.set(Math.cos(a) * 0.55, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.55); st.rotation.y = t * 4; }); }
      if (ice) { ice.material = e.solid ? solidMat : ice.userData.baseMat; }
    },
    /** A charm was cast: the Ember Seed flies from the caster to the target point. Returns true when it handled the charm. */
    charm(d, Y, info) {
      if (d.charm !== 'ember-seed') return false;
      const mesh = new THREE.Mesh(lobGeo, lobMat); mesh.name = 'ember-seed-lob'; mesh.position.set(d.x, Y + 1.2, d.z); scene.add(mesh);
      lobs.push({ mesh, t: 0, dur: d.flight || CHARM.emberSeed.flight, from: { x: d.x, z: d.z, y: Y + 1.2 }, to: { x: d.tx, z: d.tz, y: Y + 0.3 } });
      particles?.burst('sparkle', { x: d.x, y: Y + 1.1, z: d.z }, { count: 10, radius: 0.5, color: info?.color || '#ff8a3d' }); sfx?.play('whoosh', { pitch: 0.9, vol: 0.5 });
      return true;
    },
    /** Effects the host queued; `hAt(x, z)` = the floor height above the area origin there. Returns true when handled here. */
    effect(fx, Y, hAt = () => 0) {
      const at = (dy = 0.9) => ({ x: fx.x, y: Y + hAt(fx.x, fx.z) + dy, z: fx.z });
      switch (fx.kind) {
        case 'react': {
          if (fx.type === 'douse') { particles?.burst('puff', at(0.9), { count: 8, radius: 0.7, color: '#d9dde8' }); particles?.burst('sparkle', at(1.2), { count: 8, radius: 0.7, color: '#8fd0ff' }); sfx?.play('rustle', { pitch: 0.8, vol: 0.6 }); }
          else if (fx.type === 'frozen-solid') { particles?.burst('sparkle', at(0.9), { count: 20, radius: 1.2, height: 0.9, color: '#d6f1ff' }); sfx?.play('chime', { pitch: 2.1, vol: 0.55 }); }
          else if (fx.type === 'steam') sfx?.play('whoosh', { pitch: 0.5, vol: 0.8 });
          else if (fx.type === 'cool') { particles?.burst('puff', at(1.2), { count: 12, radius: 1.4, color: '#c9c4d6', ring: true }); particles?.burst('sparkle', at(1.4), { count: 14, radius: 1.2, color: '#8fd0ff' }); sfx?.play('chime', { pitch: 0.7, vol: 0.7 }); }
          return true;
        }
        case 'steam': {
          particles?.burst('puff', at(0.7), { count: 22, radius: REACTIONS.steamRadius, height: 1.2, color: '#f4f9ff', ring: true }); particles?.burst('puff', at(1.3), { count: 12, radius: 1.2, height: 1.4, color: '#ffffff' });
          sfx?.play('whoosh', { pitch: 0.45, vol: 0.9 }); sfx?.play('pop', { pitch: 0.7, vol: 0.5 }); return true;
        }
        case 'douse': particles?.burst('puff', at(0.4), { count: 7, radius: 0.8, color: '#d9dde8' }); sfx?.play('rustle', { pitch: 0.7, vol: 0.5 }); return true;
        case 'ember': {
          particles?.burst('sparkle', at(0.5), { count: 24, radius: CHARM.emberSeed.radius * 1.3, height: 0.9, color: '#ffb347' }); particles?.burst('puff', at(0.4), { count: 8, radius: 1.2, color: '#7a5a50', ring: true });
          sfx?.play('thud', { pitch: 0.8, vol: 0.7 }); sfx?.play('whoosh', { pitch: 0.7, vol: 0.5 }); return true;
        }
        case 'blob': particles?.burst('sparkle', at(0.4), { count: 18, radius: 1.5, height: 0.8, color: '#ff8a3d' }); particles?.burst('puff', at(0.3), { count: 6, radius: 1.2, color: '#5a3a30', ring: true }); sfx?.play('thud', { pitch: 0.6, vol: 0.7 }); return true;
        case 'rain': particles?.burst('sparkle', at(1.4), { count: 7, radius: 0.5, height: 0.9, color: '#8fd0ff' }); if (fx.type === 'heal') sfx?.play('chime', { pitch: 1.7, vol: 0.18 }); return true;
        case 'sapling': if (fx.type === 'hurt') { particles?.burst('leaf', at(1.2), { count: 5, radius: 0.7, color: '#8a9a6a' }); sfx?.play('bip', { pitch: 0.5, vol: 0.5 }); } else { particles?.burst('sparkle', at(0.3), { count: 14, radius: 2.2, color: '#ffb347', ring: true }); sfx?.play('whoosh', { pitch: 0.6, vol: 0.5 }); } return true;
        case 'brambles': {
          const burn = at(0.9); for (let n = 0; n < 5; n++) particles?.burst('sparkle', { x: burn.x + (n - 2) * 1.5, y: burn.y, z: burn.z }, { count: 8, radius: 0.9, height: 1.1, color: n % 2 ? '#ffb347' : '#ff6a2a' });
          particles?.burst('puff', burn, { count: 14, radius: 3, height: 1.2, color: '#5a4a44' }); sfx?.play('whoosh', { pitch: 0.55, vol: 0.9 }); sfx?.play('chime', { pitch: 0.9, vol: 0.45 }); return true;
        }
        case 'fall': particles?.burst('puff', at(0.2), { count: 10, radius: 1.1, color: '#9a8a80' }); sfx?.play('thud', { pitch: 0.55, vol: 0.8 }); return true;
        case 'chief': particles?.burst('puff', at(0.8), { count: 12, radius: 1.2, color: '#ef6a3a' }); particles?.burst('sparkle', at(1.1), { count: 12, radius: 1.1, color: '#ffd45e' }); sfx?.play('pop', { pitch: 1.1, vol: 0.7 }); return true;
        case 'toad': if (fx.type === 'heat') { particles?.burst('sparkle', at(1.3), { count: 12, radius: 1.3, color: '#ff8a3d' }); sfx?.play('whoosh', { pitch: 0.5, vol: 0.5 }); } return true;
        case 'spit': particles?.burst('puff', at(1.2), { count: 5, radius: 0.5, color: '#ff8a3d' }); sfx?.play('pop', { pitch: 0.6, vol: 0.6 }); return true;
        case 'lash': return false;                                       // (the streak is drawn by dungeonVisuals, which owns the impact meshes)
        default: return false;
      }
    },
    update(state, t, dt, Y, positions = {}) {
      const active = !!state.active, g = active ? grid(state) : null, hAt = (x, z) => (g ? g.heightAt(x, z) : 0);
      // patches
      const patches = active ? state.patches || [] : [];
      discs.count = Math.min(P, patches.length); flames.count = Math.min(P * 3, patches.length * 3); discs.visible = flames.visible = patches.length > 0;
      patches.slice(0, P).forEach((q, i) => {
        const life = Math.max(0, Math.min(1, (q.until - state.time) / 1.2)), r = q.r * (0.85 + Math.sin(t * 6 + i) * 0.04), y = Y + hAt(q.x, q.z);
        _p.set(q.x, y + 0.07, q.z); _q.identity(); _s.set(r, 1, r); discs.setMatrixAt(i, _m.compose(_p, _q, _s));
        for (let k = 0; k < 3; k++) {
          const a = k * 2.1 + q.id, d = q.r * 0.45, f = (0.7 + 0.35 * Math.sin(t * 11 + k * 2 + i)) * life * (q.r > 1 ? 1 : 0.7);
          _p.set(q.x + Math.cos(a) * d, y + 0.05, q.z + Math.sin(a) * d); _q.setFromEuler(_e.set(0, a, 0)); _s.set(f, f, f); flames.setMatrixAt(i * 3 + k, _m.compose(_p, _q, _s));
        }
      });
      discs.instanceMatrix.needsUpdate = true; flames.instanceMatrix.needsUpdate = true;
      // clouds + drops
      const live = new Set(); let nd = 0;
      for (const c of active ? state.clouds || [] : []) {
        live.add(c.id); let v = clouds.get(c.id); if (!v) clouds.set(c.id, v = makeCloud());
        const y = Y + hAt(c.x, c.z), fade = Math.min(1, (c.until - state.time) / 0.8, (state.time - (c.born ?? -9)) / 0.4 + 0.05);
        v.group.position.set(c.x, y + 2.9 + Math.sin(t * 1.6 + c.id) * 0.08, c.z); v.group.scale.setScalar(Math.max(0.01, c.r / 2.6 * Math.min(1, fade)));
        v.ring.position.set(c.x, y + 0.08, c.z); v.ring.scale.setScalar(c.r); v.ring.material.opacity = 0.55 * Math.min(1, fade);
        for (let k = 0; k < 9 && nd < 60; k++, nd++) {
          const a = hash(c.id, k) * Math.PI * 2, d = Math.sqrt(hash(k, c.id)) * c.r * 0.9, u = (t * 1.6 + hash(k, 3)) % 1;
          _p.set(c.x + Math.cos(a) * d, y + 2.8 - u * 2.7, c.z + Math.sin(a) * d); _q.identity(); _s.set(1, 1, 1); drops.setMatrixAt(nd, _m.compose(_p, _q, _s));
        }
      }
      for (const [id, v] of clouds) if (!live.has(id)) { scene.remove(v.group, v.ring); clouds.delete(id); }
      drops.count = nd; drops.visible = nd > 0; drops.instanceMatrix.needsUpdate = true;
      // pending bursts: the toad's blobs (a landing circle that fills in, a ball dropping onto it)
      const liveB = new Set();
      for (const b of active ? state.bursts || [] : []) {
        if (b.kind !== 'blob') continue; liveB.add(b.id);
        let v = blobs.get(b.id);
        if (!v) {
          const group = new THREE.Group(), ring = new THREE.Mesh(blobRingGeo, new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })), disc = new THREE.Mesh(blobDiscGeo, new THREE.MeshBasicMaterial({ color: '#d8392b', transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })), ball = new THREE.Mesh(blobGeo, blobMat);
          ring.renderOrder = 3; disc.renderOrder = 2; group.add(ring, disc, ball); scene.add(group); blobs.set(b.id, v = { group, ring, disc, ball, t0: state.time });
        }
        const total = Math.max(0.2, b.at - v.t0), k = Math.max(0, Math.min(1, 1 - (b.at - state.time) / total));
        v.group.position.set(b.x, Y + hAt(b.x, b.z) + 0.08, b.z); v.ring.scale.setScalar(b.radius * (0.6 + 0.4 * k)); v.disc.scale.setScalar(b.radius * (0.3 + 0.7 * k)); v.ring.visible = Math.sin(t * (10 + k * 14)) > -0.55;
        const fx = b.fx ?? b.x, fz = b.fz ?? b.z; v.ball.position.set((fx - b.x) * (1 - k), 0.4 + Math.sin(k * Math.PI) * 3, (fz - b.z) * (1 - k));       // (an arc from the toad to the circle)
      }
      for (const [id, v] of blobs) if (!liveB.has(id)) { scene.remove(v.group); v.ring.material.dispose(); v.disc.material.dispose(); blobs.delete(id); }
      // the sapling
      const sap = active && state.obj?.type === 'defend' ? state.obj.sapling : null;
      sapling.visible = !!sap;
      if (sap) {
        const f = Math.max(0, Math.min(1, sap.hp / sap.max)), y = Y + hAt(sap.x, sap.z);
        sapling.position.set(sap.x, y, sap.z); sapling.rotation.z = (1 - f) * 0.35 * Math.sin(t * 1.3) * 0.2 + (1 - f) * 0.15; sapling.scale.setScalar(0.75 + 0.25 * f);
        leafMat.color.copy(wiltLeaf).lerp(freshLeaf, f); saplingRing.material.opacity = 0.2 + 0.4 * f * (state.obj.started ? 1 : 0.6 + Math.sin(t * 3) * 0.4); saplingRing.material.color.set(f > 0.35 ? '#9dff8a' : '#ff8a6a');
        crowns.forEach((c, i) => { c.position.y = [1.55, 1.2, 1.25, 1.9][i] - (1 - f) * 0.35; });
      }
      // seeds in flight
      for (let i = lobs.length - 1; i >= 0; i--) {
        const l = lobs[i]; l.t += dt; const u = Math.min(1, l.t / l.dur);
        l.mesh.position.set(l.from.x + (l.to.x - l.from.x) * u, l.from.y + (l.to.y - l.from.y) * u + Math.sin(u * Math.PI) * 1.6, l.from.z + (l.to.z - l.from.z) * u);
        l.mesh.scale.setScalar(1 + Math.sin(t * 30) * 0.12);
        if (u >= 1) { scene.remove(l.mesh); lobs.splice(i, 1); }
      }
      if (!active && lobs.length) { for (const l of lobs) scene.remove(l.mesh); lobs.length = 0; }
    },
  };
}
