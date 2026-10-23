// Vine Skip's stage (Step 80a): a round terrace at night with a glowing Night-Bloom planter in the middle, a warm moat, a rim to cheer from, and the vine rig: a long glowing vine with Im Nabong and Mokuring on two basalt
// posts at its ends, the whole rig turning with game/party/vineskipLogic.js ropeAngle(). Built once (lazily), hidden outside the game; ONE Group at the stage centre (the rig is a child that turns).
//
//   const w = createVineSkipWorld({ scene, sfx })
//   w.setVisible(on)
//   w.update(dt, { mode: 'practice' | 'wait' | 'play', v, t })    v = vineskipLogic.view(g, t) in play; mode 'practice' spins the vine slowly (it touches nobody); 'wait' (the countdown) holds it still, a little lit
//   w.scoreText(v, slot) -> { text, out }                          the scoreboard chip's live line        w.cam (CAMERAS entry)        w.look ('dusk')
//   w.tumbleSpot(k)                                                 the rim spot a player who is out cheers from        w.summary()
// Draw calls: ground+terrace+planter+lamps 1 (+outline), the glowing bits 2, the vine + halo 2, two hosts ~11 each; about 25 for the stage itself.
import * as THREE from 'three';
import { stageLivingLifecycle, hostIdle } from './livingStage.js';
import { PARTY, TDOONGZ } from '../../config.js';
import { stageCentre, spectatorSpot } from '../../game/party/partyArea.js';
import { createTdoongModel } from '../../npc/tdoongz.js';
import { part, G } from '../../render/geo.js';
import { solid, glow, disc, ring, post, ball } from './kit.js';

const V = PARTY.vineskip, O = PARTY.origin;
const centre = stageCentre('vineskip');
export const CAM = { focus: { x: centre.x, y: O.y + 0.6, z: centre.z + 0.9 }, offset: { x: 0, y: 15.5, z: 13.2 }, extent: { w: 23.5, d: 23 } };

function ropeParts() {
  const pts = [];
  const N = 44;
  for (let i = 0; i <= N; i++) {
    const x = -V.hostPost + (2 * V.hostPost * i) / N, ax = Math.abs(x);
    const hump = 1.05 * Math.exp(-Math.pow(x / 2.1, 2));                       // the vine arches over the planter
    const lift = 1.25 * Math.max(0, Math.min(1, (ax - 5.2) / (V.hostPost - 5.2)));   // and climbs to the hosts' paws
    pts.push(new THREE.Vector3(x, 0.34 + hump + lift, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.TubeGeometry(curve, 60, 0.1, 6, false);
  const parts = [part(tube, '#ff8fd0')]; tube.dispose();
  for (let i = 1; i < 14; i++) {                                              // little golden buds along the vine
    const p = curve.getPoint(i / 14);
    parts.push(part(G.sphereLo, i % 2 ? '#ffe27a' : '#fff4c4', { p: [p.x, p.y + 0.02, p.z], s: [0.16, 0.16, 0.16] }));
  }
  return { parts, curve };
}

export function createVineSkipWorld({ scene, sfx }) {
  const root = new THREE.Group();
  root.name = 'party-vineskip';
  root.position.set(centre.x, O.y, centre.z);
  root.visible = false;
  scene.add(root);
  const geos = [];
  const living = stageLivingLifecycle({ root, id: 'vineskip', cam: CAM });

  // ---- the terrace, moat, rim, planter, lamps
  const base = solid([
    ring(V.rimMin, 11.6, '#7fcf86', [0, 0.05, 0], 0.12),
    ring(V.rMin - 0.15, V.rMax + 0.2, '#d8cfe8', [0, 0.05, 0], 0.12),
    ring(V.rMin - 0.15, V.rMin + 0.1, '#a99bc8', [0, 0.08, 0], 0.1),
    disc(V.rMin - 0.2, '#8a7bb5', [0, 0.3, 0], 0.4), disc(V.rMin - 0.5, '#5a3f4a', [0, 0.42, 0], 0.3),         // the planter: a stone drum with dark soil
  ], { outline: 0.04 });
  base.name = 'vineskip-base';
  root.add(base); geos.push(base.geometry);
  for (const child of base.children) if (child.geometry) geos.push(child.geometry);
  // ---- the turning rig: the vine, its halo, two basalt posts and the hosts
  const rig = new THREE.Group();
  root.add(rig);
  const { parts: rp } = ropeParts();
  const vine = glow(rp);
  vine.name = 'vineskip-vine';
  rig.add(vine); geos.push(vine.geometry);
  const haloGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 30 }, (_, i) => {
    const x = -V.hostPost + (2 * V.hostPost * i) / 29, ax = Math.abs(x);
    return new THREE.Vector3(x, 0.34 + 1.05 * Math.exp(-Math.pow(x / 2.1, 2)) + 1.25 * Math.max(0, Math.min(1, (ax - 5.2) / (V.hostPost - 5.2))), 0);
  })), 40, 0.26, 6, false);
  const haloMat = new THREE.MeshBasicMaterial({ color: '#ff8fd0', transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending });
  const halo = new THREE.Mesh(haloGeo, haloMat);
  halo.renderOrder = 4;
  rig.add(halo); geos.push(haloGeo);
  const posts = solid([post(0.55, 1.45, '#4a4058', [-V.hostPost, 0, 0]), post(0.55, 1.45, '#4a4058', [V.hostPost, 0, 0]), ball(0.62, '#6a5f7a', [-V.hostPost, 1.45, 0], [1, 0.35, 1]), ball(0.62, '#6a5f7a', [V.hostPost, 1.45, 0], [1, 0.35, 1])], { outline: 0.04 });
  rig.add(posts); geos.push(posts.geometry); for (const child of posts.children) if (child.geometry) geos.push(child.geometry);
  const hosts = [['imnabong', V.hostPost, -Math.PI / 2], ['mokuring', -V.hostPost, Math.PI / 2]].map(([id, x, yaw]) => {
    const m = createTdoongModel(id);
    m.root.scale.setScalar(TDOONGZ[id].scale);
    m.root.position.set(x, 1.55, 0);
    m.root.rotation.y = yaw;
    rig.add(m.root);
    return { id, m, x };
  });

  let disposed = false;
  let t0 = 0, warnWas = false, angle = 0;
  function update(dt, { mode = 'wait', v = null, t = 0, lanePlayers = [] } = {}) {
    if (!root.visible) return;
    t0 += dt; living.update(dt, t0, lanePlayers);
    if (mode === 'play' && v) angle = v.angle;
    else if (mode === 'practice') angle += dt * 0.9;
    rig.rotation.y = -angle;
    const speed = mode === 'play' && v ? v.speed : mode === 'practice' ? 0.9 : 0;
    const warn = mode === 'play' && v && v.warn, surprise = mode === 'play' && v && v.surprise;
    if (warn && !warnWas) sfx?.play('chime', { pitch: warn.kind === 'pause' ? 0.8 : 1.4, vol: 0.9 });
    warnWas = !!warn;
    haloMat.color.set(surprise === 'pause' ? '#7cd8ff' : surprise === 'reverse' ? '#ffe27a' : warn ? '#ffe27a' : '#ff8fd0');
    haloMat.opacity = 0.26 + (warn ? 0.22 * (0.5 + 0.5 * Math.sin(t0 * 18)) : 0) + (mode === 'wait' ? -0.08 : 0);
    for (const h of hosts) {
      hostIdle(h.m, t0, v, lanePlayers);
      const m = h.m, s = t0 * 3 + (h.x > 0 ? 0 : 1.5), sw = Math.min(1, Math.abs(speed) / 3);
      m.rig.position.y = Math.abs(Math.sin(s * 1.2)) * 0.12 * (0.4 + sw);
      for (const arm of [m.armL, m.armR]) {
        if (!arm) continue;
        arm.rotation.x = -1.35 + Math.sin(s * (1.5 + Math.abs(speed))) * 0.28 * (0.3 + sw);
        arm.rotation.z = (arm.userData.restZ ?? 0) * 0.5;
      }
      if (h.id === 'mokuring') m.setExpression?.(warn || surprise ? 'happy' : 'normal');
      else m.setExpression?.(mode === 'play' ? 'happy' : 'normal');
    }
  }

  return {
    root, update, cam: CAM, look: 'dusk',
    get living() { return living.current; },
    setVisible(on) { root.visible = !!on; living.setVisible(on); },
    tumbleSpot: (k) => spectatorSpot('vineskip', k),
    scoreText(v, slot) {
      if (!v) return { text: '', out: false };
      return v.alive[slot] === false ? { text: 'OUT', out: true } : { text: 'IN', out: false };
    },
    summary() { let calls = 0; root.traverse((o) => { if (o.isMesh) calls++; }); return { visible: root.visible, meshes: calls, angle: +angle.toFixed(2) }; },
    dispose() { if (disposed) return; disposed = true; living.dispose(); for (const g of geos) g.dispose(); for (const h of hosts) h.m.dispose?.(); haloMat.dispose(); scene.remove(root); },
  };
}
