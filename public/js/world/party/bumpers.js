// Puffball Bumpers' Duskcrown titan stage (Step 80d). createBumpersWorld({scene,sfx,particles,labels}) follows the party stage API: setVisible, update, onRec, scoreText, clearPractice, summary, dispose.
// practiceInput(slot, {x,z,jump}) / practiceState() provide a screen-local rehearsal using the same rules and physics as the real game.
// ballPose and capRadius are imported from the rules: puffball centres / rider feet / the drawn outer rim share exactly the judged coordinates. No smoothing can draw a safe-looking rider after it fell.
// All scenery is merged; four puffballs + spores and Capray use no lights, about 22 stage meshes including outlines (roughly 130 with four players and shadows).
import * as THREE from 'three';
import { PARTY } from '../../config.js';
import { stageCentre, bumpersObstacles } from '../../game/party/partyArea.js';
import { init, step, request, apply, ballPose, capRadius } from '../../game/party/bumpersLogic.js';
import { createPetModel } from '../../npc/pets.js';
import { part } from '../../render/geo.js';
import { solid, glow, disc, ring, ball, post } from './kit.js';

const S = PARTY.bumpers, O = PARTY.origin, centre = stageCentre('bumpers');
export const CAM = { focus: { x: centre.x, y: O.y - 3, z: centre.z + 2.5 }, offset: { x: 0, y: 20, z: 17 }, extent: { w: 27, d: 27 } };
const COLORS = ['#94f8df', '#ffadcd', '#b9a5ff', '#ffe49a'];

export function createBumpersWorld({ scene, sfx, particles, labels }) {
  const root = new THREE.Group(); root.name = 'party-bumpers'; root.position.set(centre.x, O.y, centre.z); root.visible = false; scene.add(root);
  const scenery = [disc(36, '#292945', [0, -8.3, 0], 0.8), disc(24, '#3b3859', [0, -8.25, 0], 0.2), post(1.6, 7.5, '#b0a2cc', [0, -8, 0]), disc(S.spectator.r + 0.45, '#56637b', [S.spectator.x, S.spectator.y, S.spectator.z], 0.15)];
  const marsh = [];
  for (let i = 0; i < 28; i++) {
    const a = i * 2.399963, r = 13 + (i % 7) * 2.2, x = Math.cos(a) * r, z = Math.sin(a) * r;
    scenery.push(post(0.22, 1.2 + (i % 3) * 0.4, '#9f8eb9', [x, -8.2, z]), ball(1 + (i % 3) * 0.3, '#6567a5', [x, -6.8, z], [1, 0.4, 1]));
    marsh.push(disc(1.4, i % 2 ? '#b176df' : '#e7a47d', [x, -8.1, z], 0.03), ball(0.14, '#eac096', [x, -6.5, z]));
  }
  const prop = bumpersObstacles()[1];
  scenery.push(post(0.28, 0.8, '#a395bb', [prop.x, S.spectator.y, prop.z]), ball(prop.r, '#888bd0', [prop.x, S.spectator.y + 0.9, prop.z], [1, 0.45, 1]));
  marsh.push(ring(0.95, 1.05, '#dfad8c', [prop.x, S.spectator.y + 0.01, prop.z], 0.02));
  root.add(solid(scenery), glow(marsh));
  // A broad, flat riding surface over a rounded gill dome: the outermost skin and the inner glowing rim both stop at radius 1.
  const cap = solid([ball(1, '#454369', [0, -0.65, 0], [1, 0.9, 1]), disc(1, '#666cad', [0, 0, 0], 0.5)], { outline: 0 }); cap.name = 'bumpers-cap'; root.add(cap);
  const poreParts = [ring(0.975, 1, '#f4a57e', [0, 0.012, 0], 0.04)];
  for (let i = 0; i < 32; i++) { const a = i * Math.PI / 16; poreParts.push(ball(0.025, '#ffd69b', [Math.cos(a) * 0.94, 0.022, Math.sin(a) * 0.94], [1, 0.13, 1])); }
  const pores = glow(poreParts); pores.material = pores.material.clone(); pores.name = 'bumpers-pores'; root.add(pores);
  const puffballs = [], spores = [];
  // Broad cream stripe plus unequal violet patches make axial spin and direction changes readable from the game camera; still ONE merged mesh per ball.
  const stripe = new THREE.SphereGeometry(S.ballR * 1.008, 32, 4, 0, Math.PI * 2, Math.PI * 0.43, Math.PI * 0.14);
  const patch = new THREE.SphereGeometry(S.ballR * 1.012, 10, 8, 0.25, 0.78, 0.38, 0.65);
  const spot = new THREE.SphereGeometry(S.ballR * 1.012, 8, 6, 3.1, 0.5, 1.95, 0.4);
  for (let s = 0; s < 4; s++) {
    const p = glow([ball(S.ballR, COLORS[s]), part(stripe, '#fff4d5'), part(patch, '#6a477f'), part(spot, '#fff4d5')]);
    p.name = `bumpers-ball-${s}`; p.visible = false; root.add(p); puffballs.push(p);
    const parts = [];
    for (let i = 0; i < 12; i++) { const a = i * 2.4; parts.push(ball(0.07 + (i % 3) * 0.025, COLORS[s], [Math.cos(a) * (0.5 + i * 0.06), -i * 0.19, Math.sin(a) * (0.5 + i * 0.06)])); }
    const sp = glow(parts); sp.name = `bumpers-spores-${s}`; sp.visible = false; root.add(sp); spores.push(sp);
  }
  stripe.dispose(); patch.dispose(); spot.dispose();
  const ray = createPetModel('capray'); ray.root.scale.setScalar(2.2); root.add(ray.root);
  const bell = solid([ball(0.22, '#f4bf6b', [0, 0, 0], [1, 1.3, 1]), ring(0.15, 0.27, '#fff0b2', [0, -0.2, 0], 0.08)]); bell.name = 'bumpers-bell'; ray.root.add(bell); bell.position.set(0, -0.2, 0.3);
  let practice = init(80, [0, 1, 2, 3].map((slot) => ({ slot }))), priorBumps = 0, rang = false;

  function update(dt, { mode, v, t = 0, lanePlayers = null } = {}) {
    if (!root.visible) return;
    const live = mode === 'play' && v, rehearsing = mode === 'practice';
    if (rehearsing) {
      if (practice.done) practice = init(80, [0, 1, 2, 3].map((slot) => ({ slot })));
      const next = practice.simT + dt;
      for (const rec of step(practice, {}, dt, next)) apply(practice, rec);
    }
    const active = live || rehearsing, state = live ? v : practice, at = live ? v.t : rehearsing ? practice.simT : Math.max(0, t), radius = capRadius(active ? state.simT : 0);
    cap.scale.set(radius, 1, radius); pores.scale.set(radius, 1, radius);
    // Dimming starts at the same 30 s boundary as shrinking; the bright rim never disguises the smaller cap beneath it.
    const dim = active ? Math.max(0.2, 1 - Math.max(0, state.simT - S.shrinkAt) / (S.duration - S.shrinkAt)) : 1;
    if (pores.material.color) pores.material.color.setScalar(dim);
    for (let s = 0; s < 4; s++) {
      const rider = !active && lanePlayers ? lanePlayers[s] : null;
      const pose = !active && lanePlayers ? (rider ? { x: rider.position.x - centre.x, z: rider.position.z - centre.z, y: rider.position.y - O.y, out: false } : null) : state.balls[s] ? ballPose(state, s, at) : null;
      const p = puffballs[s], sp = spores[s];
      p.visible = !!pose && !pose.landed; sp.visible = !!pose && pose.out && !pose.landed;
      if (!pose) continue;
      p.position.set(pose.x, pose.y - S.ballR, pose.z);
      p.quaternion.fromArray(state.balls[s].roll || [0, 0, 0, 1]);
      sp.position.copy(p.position); sp.rotation.y = at * 0.5;
    }
    const a = at * 0.32 - Math.PI / 2; ray.root.position.set(Math.cos(a) * (radius + 1.6), 1.7 + Math.sin(at * 2) * 0.12, Math.sin(a) * (radius + 1.6)); ray.root.rotation.y = -a;
    ray.update(dt, at); bell.rotation.z = at < 1 ? Math.sin(at * 24) * 0.55 : 0;
    if (live && !rang) { sfx?.play('capbell'); rang = true; }
  }
  return {
    root, cam: CAM, look: 'dusk', update,
    practiceInput(slot, intent) {
      const out = request(practice, slot, { x: intent.x ?? 0, z: intent.z ?? 0, jump: !!intent.jump }, { t: practice.simT });
      if (out.rec) { apply(practice, out.rec); if (out.rec.jump) sfx?.play('puffbump', { pitch: 1.5, vol: 0.3 }); }
    },
    practiceState: () => practice,
    setVisible(on) { root.visible = !!on; if (!on) { rang = false; priorBumps = 0; labels?.clear?.(); } },
    onRec(rec, v) {
      if (!root.visible) return;
      if (rec.k === 'input' && rec.jump) sfx?.play('puffbump', { pitch: 1.5, vol: 0.3 });
      if (rec.k === 'motion') {
        if (rec.bumps > priorBumps) sfx?.play('puffbump', { vol: 0.55 });
        priorBumps = rec.bumps;
      }
      if (rec.k === 'out' || (rec.k === 'motion' && Object.values(rec.outAt).some((at) => at > rec.t - 0.05))) {
        sfx?.play('sporedrift', { vol: 0.55 });
        // Spores are drawn below riders, and no floating text covers the active cap.
        particles?.burst('sparkle', { x: centre.x, y: O.y - 4, z: centre.z }, { count: 8, radius: 3, color: '#d9a9ff' });
      }
    },
    scoreText(v, slot) { return { text: v?.alive[slot] ? 'On the cap' : v && ballPose(v, slot, v.t)?.landed ? 'Cheering' : 'Drifting', out: !!v && !v.alive[slot] }; },
    clearPractice() { practice = init(80, [0, 1, 2, 3].map((slot) => ({ slot }))); },
    summary() { let meshes = 0; root.traverse((o) => { if (o.isMesh && o.visible) meshes++; }); return { visible: root.visible, meshes }; },
    dispose() { const geos = new Set(); root.traverse((o) => { if (o.geometry) geos.add(o.geometry); }); for (const g of geos) g.dispose(); pores.material.dispose(); ray.dispose(); root.removeFromParent(); },
  };
}
