// Mossback the tortoise, Emberleaf's old gardener (PLAN Step 37b): a chunky, kind, non-humanoid NPC built with the character baker (player/character.js) like Cobble and Bramble.
//
//   const m = createMossbackModel()
//   m.root        Group: origin at the feet, faces +Z (yaw 0), about 1.35 u tall with the flower and about 1.5 u long
//   m.rig         squash / bob pivot at the feet (breathing)
//   m.headGroup   head pivot at the neck (turns, nods, droops asleep)
//   m.armR        the front leg that holds the watering can (shoulder pivot; the leg + can hang along -Y; rotation.x swings it forward, rotation.z out)
//   m.setBlink(closed 0..1)   squashes the eye vertices in the shader (shared with every character); 1 = shut
//   m.drawCalls   main-pass meshes + shadow-pass meshes (budget 8: this one is 5)
//   m.dispose()
//
// Draw-call budget: three merged, vertex-coloured meshes with the outline hull baked in, ONE toon material that also marks the stencil buffer like every character (so the occluded-player
// silhouette never paints over him): the body (mossy domed shell with moss tufts and a little flower on top, a cream underside, three stubby legs, a tail), the head (face, blush, smile, a straw
// sun hat with a red band) and the watering-can leg (a leg, a blue tin can with a spout and rose, a handle). Body + head cast shadows, the small leg does not: 3 + 2 = 5 draw calls.
import * as THREE from 'three';
import { Baker, castMesh, makeToon, xf } from '../player/character.js';
import { sphere, sphereLo, cyl, capsule, surf, at, eyes } from './models.js';

const SHELL = '#8a6c43', SHELL_DARK = '#6e5434', MOSS = ['#6fa84c', '#82bb58', '#5c9440', '#93c764'], SKIN = '#a8bd6e', SKIN_DARK = '#8fa75a', CREAM = '#ecdcab';
const STRAW = '#ecc968', STRAW_DARK = '#cba54e', BAND = '#d9654a', TIN = '#79b3d6', TIN_DARK = '#5a93b8';

function buildBody() {
  const b = new Baker();
  b.add(sphere(), xf([0, 0.2, -0.02], [0, 0, 0], [0.62, 0.11, 0.7]), { color: CREAM, outline: 0.028 });                  // the pale underside rim
  b.add(sphere(), xf([0, 0.49, -0.04], [0, 0, 0], [0.6, 0.42, 0.68]), { color: SHELL, outline: 0.034 });                   // the dome
  for (let i = 0; i < 6; i++) {                                                                                            // old plate ridges
    const a = i * Math.PI / 3 + 0.3;
    b.add(sphereLo(), xf([Math.cos(a) * 0.46, 0.5, -0.04 + Math.sin(a) * 0.52], [0, -a, 0.5], [0.2, 0.06, 0.12]), { color: SHELL_DARK });
  }
  b.add(sphere(), xf([0, 0.78, -0.06], [0, 0, 0], [0.43, 0.2, 0.48]), { color: MOSS[0], outline: 0.026 });                // the moss blanket on top
  const tufts = [[0.3, 0.74, 0.18, 0.2], [-0.32, 0.72, 0.1, 0.19], [0.1, 0.84, -0.3, 0.18], [-0.2, 0.8, -0.28, 0.17], [0.38, 0.6, -0.22, 0.17], [-0.42, 0.58, -0.18, 0.16],
    [0.05, 0.86, 0.12, 0.15], [0.46, 0.5, 0.1, 0.13], [-0.1, 0.62, -0.55, 0.15], [0.25, 0.58, -0.5, 0.14]];
  tufts.forEach(([x, y, z, s], i) => b.add(sphere(), xf([x, y, z], [0, i, 0], [s, s * 0.78, s]), { color: MOSS[(i + 1) % 4], outline: 0.02 }));
  // a little flower growing on the moss
  b.add(cyl(6), xf([0.1, 0.97, 0.0], [0, 0, -0.1], [0.018, 0.2, 0.018]), { color: '#4f9a42' });
  for (let k = 0; k < 5; k++) {
    const a = k * Math.PI * 2 / 5;
    b.add(sphereLo(), xf([0.12 + Math.cos(a) * 0.07, 1.09, Math.sin(a) * 0.07], [Math.sin(a) * 0.6, -a, -Math.cos(a) * 0.6], [0.075, 0.03, 0.045]), { color: k % 2 ? '#ff7fa8' : '#ff99b8', outline: 0.008 });
  }
  b.add(sphereLo(), xf([0.12, 1.1, 0], [0, 0, 0], [0.04, 0.035, 0.04]), { color: '#ffd23c' });
  // neck, tail and three stubby legs (the right front leg is the watering-can arm)
  b.add(sphere(), xf([0, 0.36, 0.52], [0.25, 0, 0], [0.19, 0.2, 0.26]), { color: SKIN, outline: 0.026 });
  b.add(sphere(), xf([0, 0.2, -0.7], [0, 0, 0], [0.09, 0.07, 0.15]), { color: SKIN_DARK, outline: 0.02 });
  for (const [x, z] of [[0.42, 0.34], [0.38, -0.4], [-0.38, -0.4]]) {
    b.add(capsule(0.1, 0.05), xf([x, 0.2, z]), { color: SKIN, outline: 0.026 });
    b.add(sphere(), xf([x * 1.06, 0.06, z + 0.05], [0, 0, 0], [0.14, 0.07, 0.17]), { color: SKIN_DARK, outline: 0.024 });
  }
  return b;
}

function buildHead() {
  const h = new Baker();
  const A = 0.31, B = 0.27, C = 0.33;
  h.add(sphere(), xf([0, 0, 0], [0, 0, 0], [A, B, C]), { color: SKIN, outline: 0.032 });
  h.add(sphere(), xf([0, -0.1, 0.27], [0.2, 0, 0], [0.18, 0.12, 0.14]), { color: SKIN_DARK, outline: 0.022 });             // the soft beak
  for (const s of [-1, 1]) {
    h.add(sphereLo(), xf([0.035 * s, -0.04, 0.42], [0, 0, 0], [0.018, 0.022, 0.012]), { color: '#3a3328', flat: 1 });      // nostrils
    h.add(sphere(), at(surf(A, B, C, 0.2 * s, -0.08, 0.004), [0, 0, 0], [0, 0, 0], [0.06, 0.04, 0.01]), { color: '#e58f86', flat: 1 });   // blush
  }
  eyes(h, A, B, C, 0.135, 0.07, 0.95);
  h.add(new THREE.TorusGeometry(0.07, 0.012, 5, 12, Math.PI), at(surf(A, B, C, 0, -0.13, 0.004), [0, 0, 0], [0, 0, Math.PI]), { color: '#3a3328', flat: 1 });   // a calm smile
  for (const s of [-1, 1]) h.add(cyl(6), xf([0.16 * s, 0.1, 0.3], [0.5, 0, 0.5 * s], [0.012, 0.09, 0.012]), { color: '#cfd8ad' });   // two pale whisker-wrinkles over the eyes
  // the straw sun hat: wide brim tipped a little back, a round crown, a red band
  const hy = 0.17;
  h.add(cyl(20), xf([0, hy, 0.02], [-0.1, 0, 0], [0.5, 0.032, 0.5]), { color: STRAW, outline: 0.022 });
  h.add(new THREE.TorusGeometry(0.5, 0.014, 5, 24), xf([0, hy + 0.012, 0.02], [Math.PI / 2 - 0.1, 0, 0]), { color: STRAW_DARK });
  h.add(new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), xf([0, hy + 0.015, 0], [-0.1, 0, 0], [0.27, 0.22, 0.27]), { color: STRAW, outline: 0.026, inner: true });
  h.add(cyl(18), xf([0, hy + 0.06, 0], [-0.1, 0, 0], [0.28, 0.05, 0.28]), { color: BAND, outline: 0.012 });
  h.add(sphereLo(), xf([0.17, hy + 0.1, 0.17], [0, 0, 0], [0.05, 0.05, 0.03]), { color: '#ffd23c' });                       // a tucked-in daisy
  return h;
}

function buildCanArm() {
  const a = new Baker();
  a.add(capsule(0.1, 0.1), xf([0, -0.1, 0]), { color: SKIN, outline: 0.026 });                                              // the leg
  a.add(sphere(), xf([0, -0.27, 0.03], [0, 0, 0], [0.13, 0.1, 0.14]), { color: SKIN_DARK, outline: 0.024 });                // the foot / hand
  // the watering can, held out in front
  a.add(cyl(14), xf([0, -0.25, 0.3], [0, 0, 0], [0.15, 0.22, 0.15]), { color: TIN, outline: 0.02 });
  a.add(cyl(14), xf([0, -0.14, 0.3], [0, 0, 0], [0.16, 0.025, 0.16]), { color: TIN_DARK });                                 // the rim
  a.add(cyl(14), xf([0, -0.36, 0.3], [0, 0, 0], [0.155, 0.025, 0.155]), { color: TIN_DARK });
  a.add(new THREE.TorusGeometry(0.1, 0.018, 6, 14, Math.PI), xf([0, -0.14, 0.3], [0, 0, -Math.PI / 2]), { color: TIN_DARK, outline: 0.01 });   // handle over the top
  a.add(cyl(8), xf([0, -0.2, 0.5], [Math.PI / 2 - 0.55, 0, 0], [0.028, 0.34, 0.028]), { color: TIN, outline: 0.014 });         // the spout, rising forward
  a.add(new THREE.ConeGeometry(1, 1, 10), xf([0, -0.09, 0.64], [Math.PI / 2 - 0.55, 0, 0], [0.065, 0.08, 0.065]), { color: TIN_DARK, outline: 0.012 });   // the rose
  return a;
}

export function createMossbackModel() {
  const blink = { value: 1 };
  const mat = makeToon(blink, 'mossback-toon');
  const baked = [];
  const bake = (b) => { const e = b.build(); baked.push(e); return e; };

  const root = new THREE.Group();
  root.name = 'npc-tortoise';
  const rig = new THREE.Group();
  rig.name = 'rig';
  root.add(rig);
  const meshes = [];
  const add = (parent, entry, name, cast) => {
    const m = castMesh(entry.geo, mat, cast);
    m.name = name;
    parent.add(m);
    meshes.push(m);
    return m;
  };
  add(rig, bake(buildBody()), 'mossback-body', true);

  const headGroup = new THREE.Group();
  headGroup.name = 'headGroup';
  headGroup.position.set(0, 0.44, 0.62);
  rig.add(headGroup);
  add(headGroup, bake(buildHead()), 'mossback-head', true);

  const armR = new THREE.Group();
  armR.name = 'armR';
  armR.position.set(-0.4, 0.36, 0.34);
  armR.userData.restZ = 0.12;
  armR.rotation.z = 0.12;
  rig.add(armR);
  add(armR, bake(buildCanArm()), 'mossback-can', false);

  let drawCalls = 0;
  for (const m of meshes) drawCalls += m.castShadow ? 2 : 1;

  return {
    root, rig, headGroup, armR, species: 'tortoise',
    height: 1.35,
    drawCalls,
    setBlink(closed) { blink.value = 1 - 0.88 * closed; },
    dispose() { for (const e of baked) e.geo.dispose(); mat.dispose(); },
  };
}
