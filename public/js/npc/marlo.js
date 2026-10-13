// Skipper Marlo the sea otter (PLAN Step 68a): the old sailor who washed up in Emberleaf's cove. A chubby chocolate-brown otter with a cream face and muzzle, white whiskers, small round ears, big glossy
// dark eyes, a tiny pink nose and a flat paddle tail; a knitted navy captain's cap with a yellow anchor, a faded red neckerchief and a brass spyglass on a rope belt. Built with the character baker
// (player/character.js) exactly like Mossback: merged vertex-coloured meshes with the outline hull baked in, ONE toon material that also marks the stencil buffer like every character.
//
//   const m = createMarloModel()
//   m.root        Group: origin at the feet, faces +Z (yaw 0), about 1.15 u tall with the cap
//   m.rig         squash / bob / back-float pivot at the feet (rotation.x leans him back; position.y lifts)
//   m.headGroup   head pivot at the neck (turns, nods; the cap goes with it, so "cap over the eyes" is a nod forward)
//   m.armL / m.armR   shoulder pivots, the arm hangs along -Y (rotation.x raises it forward, rotation.z swings it out); armR is the spyglass / waving arm
//   m.tail        tail pivot (rotation.y swishes, rotation.x lifts)
//   m.setBlink(closed 0..1)   squashes the eye vertices in the shader (shared with every character); 1 = shut
//   m.drawCalls   main-pass meshes + shadow-pass meshes (budget 8: this one is 7)
//   m.dispose()
//
// Draw-call budget: body (torso, legs, belly, neckerchief, rope belt, spyglass) 2 with its shadow, head (face, muzzle, whiskers, ears, cap with its anchor) 2 with its shadow, two arms 1 + 1 (no shadow),
// the paddle tail 1 (no shadow): 2 + 2 + 1 + 1 + 1 = 7.
import * as THREE from 'three';
import { Baker, castMesh, makeToon, xf } from '../player/character.js';
import { sphere, sphereLo, cyl, capsule, surf, at, eyes } from './models.js';

const FUR = '#6a4a35', FUR_DARK = '#563a29', CREAM = '#f2dfbd', CREAM_DARK = '#e2c99f', PINK = '#e98a9d', INNER = '#d99a8a';
const CAP = '#2d3f73', CAP_DARK = '#243260', ANCHOR = '#f2c23c', SCARF = '#b5463b', SCARF_DARK = '#9a382f', ROPE = '#cfa86a', BRASS = '#cf9a3c', BRASS_DARK = '#9a6f26', LEATHER = '#5b3b24';

function buildBody() {
  const b = new Baker();
  b.add(sphere(), xf([0, 0.5, 0], [0, 0, 0], [0.43, 0.4, 0.37]), { color: FUR, outline: 0.032 });                             // the round torso
  b.add(sphere(), xf([0, 0.46, 0.17], [0.05, 0, 0], [0.31, 0.3, 0.2]), { color: CREAM, outline: 0.02 });                       // the cream belly
  for (const s of [-1, 1]) {                                                                                                  // short stubby legs and big flat feet
    b.add(capsule(0.1, 0.06), xf([0.19 * s, 0.17, 0.02]), { color: FUR, outline: 0.026 });
    b.add(sphere(), xf([0.2 * s, 0.05, 0.1], [0, 0, 0], [0.15, 0.07, 0.2]), { color: FUR_DARK, outline: 0.024 });
  }
  // the faded red neckerchief: a ring round the neck and a knot-triangle down the front
  b.add(new THREE.TorusGeometry(0.27, 0.07, 8, 16), xf([0, 0.78, 0.02], [Math.PI / 2 - 0.15, 0, 0]), { color: SCARF, outline: 0.016 });
  b.add(new THREE.ConeGeometry(1, 1, 3), xf([0, 0.64, 0.27], [Math.PI + 0.15, 0, 0], [0.17, 0.24, 0.04]), { color: SCARF_DARK, outline: 0.014 });
  // the rope belt with a hanging coil of rope at the hip (the brass spyglass is in his right paw, so the arm can lift it to his eye)
  b.add(new THREE.TorusGeometry(0.4, 0.035, 6, 20), xf([0, 0.4, 0.02], [Math.PI / 2, 0, 0], [1, 0.92, 1]), { color: ROPE, outline: 0.012 });
  b.add(new THREE.TorusGeometry(0.1, 0.03, 6, 12), xf([-0.3, 0.3, 0.24], [0.3, 0.4, 0]), { color: ROPE, outline: 0.012 });
  b.add(new THREE.TorusGeometry(0.075, 0.026, 6, 12), xf([-0.3, 0.3, 0.255], [0.3, 0.4, 0]), { color: ROPE });
  b.add(cyl(6), xf([-0.34, 0.45, 0.2], [0, 0, 0.3], [0.025, 0.1, 0.025]), { color: LEATHER });
  return b;
}

function buildHead() {
  const h = new Baker();
  const A = 0.37, B = 0.31, C = 0.34;
  h.add(sphere(), xf([0, 0, 0], [0, 0, 0], [A, B, C]), { color: FUR, outline: 0.032 });
  h.add(sphere(), xf([0, -0.1, 0.17], [0.15, 0, 0], [0.26, 0.19, 0.2]), { color: CREAM, outline: 0.022 });                      // the cream face and muzzle
  h.add(sphere(), xf([0, -0.03, 0.34], [0, 0, 0], [0.065, 0.045, 0.045]), { color: PINK, flat: 0.3 });                           // the tiny pink nose
  h.add(new THREE.TorusGeometry(0.05, 0.009, 4, 10, Math.PI), at(surf(A, B, C, 0, -0.15, 0.004), [0, 0, 0], [0, 0, Math.PI]), { color: '#4a3326', flat: 1 });   // a calm smile
  eyes(h, A, B, C, 0.135, 0.065, 1.1);
  for (const s of [-1, 1]) {
    h.add(sphere(), at(surf(A, B, C, 0.22 * s, -0.07, 0.004), [0, 0, 0], [0, 0, 0], [0.06, 0.04, 0.01]), { color: '#e58f86', flat: 1 });   // blush
    h.add(sphere(), xf([0.34 * s, 0.24, -0.04], [0, 0, 0], [0.1, 0.1, 0.07]), { color: FUR, outline: 0.022 });                                   // small round ears
    h.add(sphereLo(), xf([0.34 * s, 0.24, 0.0], [0, 0, 0], [0.058, 0.058, 0.02]), { color: INNER });
    for (const k of [-1, 0, 1]) h.add(cyl(5), xf([0.15 * s, -0.1 + k * 0.035, 0.34], [0.1 * k, 0, Math.PI / 2 + s * 0.12 * k + 0.0], [0.006, 0.17, 0.006]), { color: '#ffffff' });   // white whiskers (three a side)
  }
  // the knitted navy captain's cap: a dome, a ribbed cuff and a yellow anchor on the front
  h.add(new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), xf([0, 0.1, -0.01], [-0.12, 0, 0], [0.4, 0.3, 0.38]), { color: CAP, outline: 0.026, inner: true });
  h.add(cyl(20), xf([0, 0.13, 0.0], [-0.12, 0, 0], [0.41, 0.07, 0.4]), { color: CAP_DARK, outline: 0.018 });
  for (let k = 0; k < 9; k++) { const a = -0.9 + k * 0.225; h.add(cyl(5), xf([Math.sin(a) * 0.4, 0.13, Math.cos(a) * 0.39 - 0.0], [-0.12, 0, 0], [0.01, 0.075, 0.01]), { color: '#1d2850' }); }   // rib lines
  h.add(sphere(), xf([0, 0.4, -0.04], [0, 0, 0], [0.07, 0.07, 0.07]), { color: CAP, outline: 0.016 });                          // a little knit bobble
  const ay = 0.24, az = 0.4;
  h.add(new THREE.TorusGeometry(0.03, 0.009, 5, 10), xf([0, ay + 0.065, az], [-0.35, 0, 0]), { color: ANCHOR, flat: 0.4 });       // the anchor: ring, shank, stock, flukes
  h.add(cyl(5), xf([0, ay, az - 0.005], [-0.35, 0, 0], [0.011, 0.12, 0.011]), { color: ANCHOR, flat: 0.4 });
  h.add(cyl(5), xf([0, ay + 0.04, az - 0.004], [-0.35, 0, Math.PI / 2], [0.011, 0.07, 0.011]), { color: ANCHOR, flat: 0.4 });
  h.add(new THREE.TorusGeometry(0.06, 0.01, 5, 10, Math.PI), xf([0, ay - 0.04, az - 0.01], [-0.35, 0, Math.PI]), { color: ANCHOR, flat: 0.4 });
  return h;
}

function buildArm(side) {
  const a = new Baker();
  a.add(capsule(0.085, 0.12), xf([0, -0.15, 0]), { color: FUR, outline: 0.024 });
  a.add(sphere(), xf([0, -0.31, 0.02], [0, 0, 0], [0.1, 0.09, 0.11]), { color: FUR_DARK, outline: 0.022 });                          // the paw
  if (side > 0) {
    a.add(cyl(8), xf([0, -0.1, 0], [0, 0, 0], [0.095, 0.03, 0.095]), { color: SCARF_DARK });                                        // a rolled sleeve cuff on the spyglass arm
    a.add(cyl(10), xf([0, -0.44, 0.03], [0, 0, 0], [0.05, 0.15, 0.05]), { color: BRASS, outline: 0.016 });                          // the brass spyglass, held along the arm
    a.add(cyl(10), xf([0, -0.6, 0.03], [0, 0, 0], [0.068, 0.045, 0.068]), { color: BRASS_DARK, outline: 0.012 });
    a.add(cyl(10), xf([0, -0.34, 0.03], [0, 0, 0], [0.058, 0.03, 0.058]), { color: BRASS_DARK });
  }
  return a;
}

function buildTail() {
  const t = new Baker();
  t.add(sphere(), xf([0, 0, -0.3], [0.1, 0, 0], [0.14, 0.05, 0.34]), { color: FUR_DARK, outline: 0.024 });                          // the flat paddle
  t.add(sphere(), xf([0, 0.005, -0.5], [0.1, 0, 0], [0.09, 0.04, 0.12]), { color: FUR_DARK, outline: 0.02 });
  return t;
}

export function createMarloModel() {
  const blink = { value: 1 };
  const mat = makeToon(blink, 'marlo-toon');
  const baked = [];
  const bake = (b) => { const e = b.build(); baked.push(e); return e; };
  const root = new THREE.Group();
  root.name = 'npc-otter';
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
  add(rig, bake(buildBody()), 'marlo-body', true);
  const headGroup = new THREE.Group();
  headGroup.name = 'headGroup';
  headGroup.position.set(0, 0.86, 0.04);
  rig.add(headGroup);
  add(headGroup, bake(buildHead()), 'marlo-head', true);
  const arms = [];
  for (const side of [-1, 1]) {                                   // armL (-1, viewer's right when he faces the camera) holds nothing; armR (+1) is the spyglass / waving arm
    const g = new THREE.Group();
    g.name = side < 0 ? 'armL' : 'armR';
    g.position.set(0.41 * side, 0.62, 0.04);
    g.userData.restZ = 0.14 * side;
    g.rotation.z = g.userData.restZ;
    rig.add(g);
    add(g, bake(buildArm(side)), side < 0 ? 'marlo-armL' : 'marlo-armR', false);
    arms.push(g);
  }
  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.set(0, 0.26, -0.3);
  rig.add(tail);
  add(tail, bake(buildTail()), 'marlo-tail', false);

  let drawCalls = 0;
  for (const m of meshes) drawCalls += m.castShadow ? 2 : 1;
  return {
    root, rig, headGroup, armL: arms[0], armR: arms[1], tail, species: 'otter',
    height: 1.15,
    drawCalls,
    setBlink(closed) { blink.value = 1 - 0.88 * closed; },
    dispose() { for (const e of baked) e.geo.dispose(); mat.dispose(); },
  };
}
