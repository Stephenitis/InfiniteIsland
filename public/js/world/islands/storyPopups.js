// Storybook Cay's POP-UP cut-outs (Step 52a): paper landmarks that spring up on the Cay when the party earns them in the book. Four of them (Step 52b added the snow globe, Step 53a the volcano):
//   windmill    a little paper windmill on its own spot of the trail, popped up by finding any page's SECRET EXIT (game/chapters.js popupsOf(progress).windmill)
//   sunflower   a giant paper sunflower behind the stands, popped up by the MEADOW chapter reward (all letters of the four Meadow pages)
//   volcano     a paper volcano with a glowing crater, smoke puffs and a palm, popped up by the EMBERLEAF chapter reward (all letters of the four Emberleaf Canopy pages)
//   snowglobe   a paper snow globe with a pine, a snowman and drifting flakes, popped up by the FROSTPINE chapter reward (all letters of the three Frostpine pages)
// Both are scene-level objects (like Mossback): they exist once, draw only while the Cay is in full detail and no page is open, and are never rebuilt by `world.rebuild('story')`.
// Gameplay identity: a small collider each, registered ONLY while the cut-out stands. They appear LIVE with a springy pop-in (dust + sparkles + a sound) on the screen of everybody on the
// Cay, and SILENTLY on load / late join (set(flags, { animate: false })).
//
//   const popups = createStoryPopups({ scene, world, visible, particles, sfx })     (visible() = false while a page is open)
//   popups.set({ windmill, sunflower, snowglobe, volcano }, { animate })      show / hide by the saved progress (the first call after a load passes animate: false)
//   popups.update(dt, t)                                   spins the sails, sways the flower, runs the pop-in
//   popups.layout                                          where they stand: { windmill, sunflower, snowglobe, volcano }: each { x, y, z }      popups.summary()
import * as THREE from 'three';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../../render/geo.js';
import { addCollider, removeCollider } from '../colliders.js';
import { getHeight } from '../terrain.js';
import { STORY, ISLANDS } from '../../config.js';

const CAY = ISLANDS.find((i) => i.id === 'story');
const WIND_S = 0.95, SUN_S = 1.1, GLOBE_S = 1.05, VOLC_S = 1.15;                      // (scales of the two cut-outs)
const BOX = new THREE.BoxGeometry(1, 1, 1);
const box = (color, p, s, r = [0, 0, 0]) => part(BOX, color, { p, s, r });
const meshOf = (parts, hull = 0.06) => {
  const geo = combine(parts), mesh = new THREE.Mesh(geo, VERTEX_TOON);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const o = makeOutline(geo, hull); mesh.add(o);
  return { mesh, geo, hullGeo: o.geometry };
};

function windmillBody() {
  const P = [];
  P.push(part(G.cyl8, '#fff0d0', { p: [0, 1.1, 0], s: [1.55, 2.2, 0.5] }));              // flat paper tower: wide, thin, a pop-up card
  P.push(part(G.cyl8, '#ffe2b0', { p: [0, 3.1, 0], s: [1.2, 1.8, 0.45] }));
  P.push(part(G.cone6, '#ff7c6b', { p: [0, 4.75, 0], s: [1.55, 1.5, 0.5] }));
  P.push(box('#9a6a44', [0, 0.55, 0.28], [0.7, 1.1, 0.08]));                              // the door
  P.push(box('#fff6dc', [0, 3.2, 0.26], [0.42, 0.55, 0.06]));                             // a window
  P.push(box('#6cc8ff', [0, 3.2, 0.3], [0.3, 0.42, 0.04]));
  P.push(box('#ecd9ae', [0, 0.04, 0.9], [2.4, 0.06, 1.4]));                               // the folded tab it stands on
  return P;
}
function sailParts() {
  const P = [part(G.sphere, '#9a6a44', { p: [0, 0, 0.1], s: [0.3, 0.3, 0.3] })];
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    P.push(box('#9a6a44', [Math.cos(a) * 1.45, Math.sin(a) * 1.45, 0.05], [Math.abs(Math.cos(a)) > 0.5 ? 2.9 : 0.14, Math.abs(Math.sin(a)) > 0.5 ? 2.9 : 0.14, 0.08]));
    const px = Math.cos(a + 0.55) * 1.7, py = Math.sin(a + 0.55) * 1.7;
    P.push(box(k % 2 ? '#6cc8ff' : '#ffd85e', [px, py, 0.1], [1.0, 0.7, 0.05], [0, 0, a + 0.55 + Math.PI / 2]));
  }
  return P;
}
function sunflowerParts() {
  const P = [];
  P.push(part(G.cyl6, '#3f9a5a', { p: [0, 3.2, 0], s: [0.17, 6.4, 0.17] }));
  P.push(part(G.sphere, '#58c96b', { p: [-0.85, 2.0, 0], r: [0, 0, 0.55], s: [0.9, 0.16, 0.34] }));
  P.push(part(G.sphere, '#58c96b', { p: [0.8, 3.3, 0], r: [0, 0, -0.5], s: [0.8, 0.15, 0.3] }));
  P.push(box('#ecd9ae', [0, 0.04, 0.5], [1.6, 0.06, 1.2]));
  return P;
}
function snowglobeBody() {
  const P = [];
  P.push(part(G.cyl8, '#8a5a34', { p: [0, 0.28, 0], s: [1.5, 0.56, 0.5] }));                      // the wooden base
  P.push(box('#c9996a', [0, 0.56, 0.05], [2.7, 0.14, 0.9]));
  P.push(part(G.sphere, '#eaf7ff', { p: [0, 2.35, 0], s: [1.9, 1.9, 0.34] }));                    // the flat glass disc (paper-thin): a pale blue ring ...
  P.push(part(G.sphere, '#bfe3fb', { p: [0, 2.35, 0.1], s: [1.62, 1.62, 0.3] }));                // ... and the sky inside it
  P.push(part(G.sphere, '#ffffff', { p: [0, 1.0, 0.2], s: [1.5, 0.5, 0.36] }));                 // snow on the ground
  P.push(box('#7a5233', [-0.55, 1.5, 0.3], [0.1, 0.5, 0.06]));                                    // a pine
  for (const [dy, w] of [[1.75, 0.5], [2.1, 0.38], [2.4, 0.26]]) P.push(part(G.cone6, '#3f8f7a', { p: [-0.55, dy, 0.32], s: [w, 0.55, 0.1] }));
  P.push(part(G.sphere, '#ffffff', { p: [0.5, 1.35, 0.32], s: [0.3, 0.28, 0.14] })); P.push(part(G.sphere, '#ffffff', { p: [0.5, 1.75, 0.32], s: [0.22, 0.21, 0.12] }));   // a snowman
  P.push(part(G.cone6, '#ff8a3a', { p: [0.62, 1.74, 0.4], r: [Math.PI / 2, 0, -Math.PI / 2], s: [0.03, 0.14, 0.03] }));
  for (let k = 0; k < 9; k++) P.push(part(G.sphereLo, '#ffffff', { p: [Math.cos(k * 2.3) * 0.95, 2.0 + Math.sin(k * 1.7) * 0.8, 0.45], s: [0.045, 0.045, 0.03] }));
  P.push(box('#ecd9ae', [0, 0.04, 0.95], [2.8, 0.06, 1.5]));
  return P;
}
function volcanoBody() {                                                         // Step 53a: a flat paper volcano: red-brown slopes, a glowing crater, lava dribbles, smoke, a palm
  const P = [];
  P.push(part(G.cone6, '#8d5a44', { p: [0, 1.9, 0], s: [2.5, 3.8, 0.5] }));
  P.push(part(G.cone6, '#a86a4f', { p: [-0.7, 1.2, 0.22], s: [1.3, 2.4, 0.2] }));
  P.push(part(G.sphere, '#ff7a2a', { p: [0, 3.78, 0.05], s: [0.62, 0.22, 0.4] })); P.push(part(G.sphere, '#ffc04a', { p: [0, 3.82, 0.2], s: [0.4, 0.12, 0.22] }));
  P.push(box('#ff7a2a', [-0.28, 3.2, 0.3], [0.16, 0.9, 0.06])); P.push(box('#ff9a3a', [0.3, 3.0, 0.3], [0.14, 0.6, 0.06]));
  P.push(part(G.sphere, '#cfd3d9', { p: [0.15, 4.5, 0], s: [0.5, 0.4, 0.2] })); P.push(part(G.sphere, '#e6e9ee', { p: [0.55, 5.1, 0], s: [0.38, 0.3, 0.16] })); P.push(part(G.sphere, '#f4f5f8', { p: [0.95, 5.6, 0], s: [0.26, 0.2, 0.12] }));
  P.push(box('#9a6a44', [1.9, 0.9, 0.3], [0.2, 1.8, 0.1], [0, 0, 0.12]));
  for (let k = 0; k < 5; k++) { const a = -1.2 + k * 0.6; P.push(part(G.cone6, k % 2 ? '#3fa551' : '#58cf72', { p: [1.95 + Math.sin(a) * 0.5, 1.95 + Math.cos(a) * 0.15, 0.3], r: [0, 0, -a], s: [0.2, 0.95, 0.08] })); }
  P.push(box('#ecd9ae', [0, 0.04, 0.95], [3.4, 0.06, 1.5]));
  return P;
}
function sunflowerHead() {
  const P = [];
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; P.push(part(G.sphere, k % 2 ? '#ffd85e' : '#ffc233', { p: [Math.cos(a) * 1.35, Math.sin(a) * 1.35, 0], r: [0, 0, a - Math.PI / 2], s: [0.42, 0.78, 0.09] })); }
  P.push(part(G.sphere, '#7a4a2a', { p: [0, 0, 0.05], s: [0.95, 0.95, 0.2] }));
  for (let k = 0; k < 9; k++) { const a = k * 2.4, r = 0.18 + (k % 3) * 0.2; P.push(part(G.sphere, '#4a2c18', { p: [Math.cos(a) * r, Math.sin(a) * r, 0.22], s: [0.08, 0.08, 0.05] })); }
  return P;
}

export function createStoryPopups({ scene, world, visible = () => true, particles = null, sfx = null }) {
  const at = (o) => { const x = CAY.x + o.x, z = CAY.z + o.z; return { x, z, y: getHeight(x, z) }; };
  const layout = { windmill: at(STORY.popups.windmill), sunflower: at(STORY.popups.sunflower), snowglobe: at(STORY.popups.snowglobe), volcano: at(STORY.popups.volcano) };
  const root = new THREE.Group();
  root.name = 'story-popups';
  scene.add(root);
  const owned = [];

  const mk = (name, bodyParts, hull) => {
    const body = meshOf(bodyParts, hull), g = new THREE.Group();
    g.name = name; g.add(body.mesh);
    g.position.set(layout[name].x, layout[name].y, layout[name].z);
    g.visible = false;
    root.add(g); owned.push(body.geo, body.hullGeo);
    return { g, name, shown: false, t: 1, collider: null, spin: null };
  };
  const wind = mk('windmill', windmillBody());
  const sails = meshOf(sailParts(), 0.05); sails.mesh.position.set(0, 3.9, 0.52); sails.mesh.scale.setScalar(0.62); wind.g.add(sails.mesh); owned.push(sails.geo, sails.hullGeo);
  wind.g.scale.setScalar(WIND_S);
  const sun = mk('sunflower', sunflowerParts());
  const head = meshOf(sunflowerHead(), 0.06); head.mesh.position.set(0, 6.5, 0.15); head.mesh.rotation.x = -0.18; sun.g.add(head.mesh); owned.push(head.geo, head.hullGeo);
  sun.g.scale.setScalar(SUN_S);
  const globe = mk('snowglobe', snowglobeBody());
  globe.g.scale.setScalar(GLOBE_S);
  const volc = mk('volcano', volcanoBody());
  volc.g.scale.setScalar(VOLC_S);
  const items = { windmill: wind, sunflower: sun, snowglobe: globe, volcano: volc };
  const radius = { windmill: 1.5, sunflower: 0.55, snowglobe: 1.2, volcano: 1.6 };
  let flags = { windmill: false, sunflower: false, snowglobe: false, volcano: false }, firstSet = true;

  function setOne(it, on, animate) {
    if (on === it.shown) return;
    it.shown = on;
    if (on) {
      it.g.visible = true; it.t = animate ? 0 : 1;
      if (!it.collider) it.collider = addCollider({ x: layout[it.name].x, z: layout[it.name].z, r: radius[it.name], owner: it });
      it.burst = animate;                                          // (the pop-in's dust and sound wait until somebody can SEE the Cay again: the party is usually still inside the book)
    } else {
      it.g.visible = false;
      if (it.collider) { removeCollider(it.collider); it.collider = null; }
    }
  }
  const pop = (k) => (k >= 1 ? 1 : 1 - Math.pow(1 - k, 3) * Math.cos(k * 9) * 0.9);        // a springy overshoot

  return {
    layout,
    set(next, { animate = true } = {}) {
      const anim = animate && !firstSet;
      firstSet = false;
      flags = { windmill: !!next.windmill, sunflower: !!next.sunflower, snowglobe: !!next.snowglobe, volcano: !!next.volcano };
      setOne(wind, flags.windmill, anim); setOne(sun, flags.sunflower, anim); setOne(globe, flags.snowglobe, anim); setOne(volc, flags.volcano, anim);
    },
    update(dt, t) {
      root.visible = visible() && (!world || !world.regions || world.regions.isFull('story'));
      if (!root.visible) return;
      for (const it of [wind, sun, globe, volc]) {
        if (!it.shown) continue;
        if (it.burst && particles) {
          it.burst = false;
          const p = new THREE.Vector3(layout[it.name].x, layout[it.name].y + 0.4, layout[it.name].z);
          particles.burst('puff', p, { count: 14, radius: 1.8 }); particles.burst('confetti', p.clone().setY(p.y + 3), { count: 30, radius: 1.6 });
          if (sfx) { sfx.play('pop', { pitch: 0.8 }); sfx.play('jingle', { vol: 0.6 }); }
        }
        if (it.t < 1) it.t = Math.min(1, it.t + dt / 0.9);
        const k = pop(it.t), base = it === wind ? WIND_S : it === sun ? SUN_S : it === volc ? VOLC_S : GLOBE_S;
        it.g.scale.set(base * Math.min(1, 0.35 + k * 0.65), base * Math.max(0.01, k), base * Math.min(1, 0.35 + k * 0.65));
      }
      sails.mesh.rotation.z = -t * 0.9;
      head.mesh.rotation.y = Math.sin(t * 0.7) * 0.3; sun.g.rotation.z = Math.sin(t * 0.9) * 0.015;
    },
    summary() { return { windmill: wind.shown, sunflower: sun.shown, snowglobe: globe.shown, volcano: volc.shown, colliders: [wind.collider, sun.collider, globe.collider, volc.collider].filter(Boolean).length, layout }; },
  };
}
