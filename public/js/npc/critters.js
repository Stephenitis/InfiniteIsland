// Frostpine's critter models (PLAN Step 34a): four chunky, NON-humanoid animals in the character style (merged vertex-coloured meshes with the outline hull baked in, the shared
// character toon material with the stencil write, so the occluded-player silhouette never paints over a critter).
//
//   const m = createCritterModel('fox' | 'squirrel' | 'rabbit' | 'grouse')
//   m.root        Group: origin at the feet, faces +Z (yaw 0). Intended size: rabbit / squirrel / grouse knee-to-hip high, the fox a bit bigger
//   m.rig         squash / bob pivot at the feet (breathing, hops, the eat nibble)
//   m.headGroup   head pivot (look around, nod, twitch = the "ear flick"); the ears are part of the head mesh
//   m.tail        tail pivot (wag, flick, fan); m.tail.userData.rest = { x, y, z } its resting rotation
//   m.setBlink(closed 0..1)   squashes the eye vertices in the shader (as the characters and the builders do)
//   m.height      top of the model (u), for bubbles and prompt anchors
//   m.drawCalls   main-pass meshes + shadow-pass meshes (budget 4): body (casts: 2) + head + tail (neither casts: the body's shadow is enough) = 4
//   m.dispose()
//
// Fox: orange, white chest and cheeks, dark stockings, big dark-tipped ears, a bushy white-tipped tail. Squirrel: red-brown, cream belly and cheeks, tufted ears, a big
// curled tail and an acorn held in its paws. Rabbit: snowy white, long ears with grey tips and pink insides, a puffball tail. Grouse: a round mottled brown bird with a red eyebrow
// comb, a yellow beak, yellow legs and a fan tail. The animation lives in world/critters.js; this module only builds and owns the geometry.
import * as THREE from 'three';
import { Baker, castMesh, makeToon, xf } from '../player/character.js';
import { sphereLo, cyl, capsule, surf, at, yOf } from './models.js';

const cone = (n = 8) => new THREE.ConeGeometry(1, 1, n);

/** Shorthand: an ellipsoid at `p` with semi-axes `s`, rotated `r`. */
// (12 x 8 segments: critters are small on screen, and the hull doubles every triangle, so the budget is triangles as much as draw calls)
const ell = (b, p, s, color, o = {}) => b.add(new THREE.SphereGeometry(1, Math.max(...s) > 0.13 ? 12 : 8, Math.max(...s) > 0.13 ? 8 : 6), xf(p, o.r || [0, 0, 0], s), { color, outline: o.outline ?? 0.018, flat: o.flat || 0 });
const ellLo = (b, p, s, color, o = {}) => b.add(new THREE.SphereGeometry(1, 8, 6), xf(p, o.r || [0, 0, 0], s), { color, outline: o.outline ?? 0.014, flat: o.flat || 0 });
/** A pair of eyes on an ellipsoid head (semi-axes a, b, c) at (x, y): a dark bead and a white highlight, flagged for the shader blink. Low-poly (the models' own `eyes` is for big heads). */
const eyes = (hb, a, b, c, x, y, size = 1) => {
  for (const side of [-1, 1]) {
    const place = surf(a, b, c, x * side, y, -0.005), cy = yOf(place);
    hb.add(new THREE.SphereGeometry(1, 10, 8), at(place, [0, 0, 0], [0, 0, 0], [0.062 * size, 0.088 * size, 0.03]), { color: '#241a33', flat: 1, eye: cy });
    hb.add(new THREE.SphereGeometry(1, 6, 4), at(place, [0.02 * size, 0.034 * size, 0.024], [0, 0, 0], [0.022 * size, 0.022 * size, 0.012]), { color: '#ffffff', flat: 1, eye: cy });
  }
};
const blush = (hb, A, B, C, x, y, w = 0.06) => {
  for (const s of [-1, 1]) hb.add(sphereLo(), at(surf(A, B, C, x * s, y, 0.004), [0, 0, 0], [0, 0, 0], [w, w * 0.65, 0.01]), { color: '#ff93b4', flat: 1 });
};

// ---------------------------------------------------------------------------------------------
function buildFox() {
  const OR = '#f27d2a', OR_D = '#d9631a', WHITE = '#fff6ea', DARK = '#3a2b30', NOSE = '#241a2a';
  const body = new Baker();
  ell(body, [0, 0.44, 0.02], [0.25, 0.24, 0.42], OR, { outline: 0.024 });
  for (const s of [-1, 1]) ell(body, [0.16 * s, 0.4, -0.22], [0.14, 0.17, 0.17], OR_D, { outline: 0.02 });             // haunches
  ell(body, [0, 0.38, 0.3], [0.17, 0.19, 0.17], WHITE, { outline: 0.02 });                                           // chest
  ell(body, [0, 0.3, 0.06], [0.16, 0.08, 0.3], WHITE, { outline: 0.0 });                                             // belly
  for (const s of [-1, 1]) for (const z of [0.3, -0.24]) {
    body.add(capsule(0.065, 0.1), xf([0.12 * s, 0.2, z]), { color: DARK, outline: 0.02 });                           // stocking legs
    ell(body, [0.12 * s, 0.045, z + 0.04], [0.075, 0.05, 0.1], DARK, { outline: 0.02 });                              // paws
  }

  const hb = new Baker();
  const A = 0.26, B = 0.23, C = 0.24;
  ell(hb, [0, 0, 0], [A, B, C], OR, { outline: 0.026 });
  for (const s of [-1, 1]) {
    ell(hb, [0.15 * s, -0.09, 0.1], [0.12, 0.1, 0.12], WHITE, { outline: 0.016 });                                    // cheek ruffs
    const ear = xf([0.15 * s, 0.31, -0.03], [0, 0, -0.22 * s]);                                                         // (one frame for the whole ear: the tip stays on it)
    hb.add(cone(8), at(ear, [0, 0, 0], [0, 0, 0], [0.1, 0.34, 0.06]), { color: OR, outline: 0.022 });                  // big ears
    hb.add(cone(8), at(ear, [0, -0.03, 0.03], [0, 0, 0], [0.058, 0.22, 0.03]), { color: '#fff0e2' });                   // inner ear
    hb.add(cone(8), at(ear, [0, 0.105, 0], [0, 0, 0], [0.062, 0.13, 0.066]), { color: DARK, outline: 0.014 });         // dark ear tip (apex on the ear's apex)
  }
  ell(hb, [0, -0.07, 0.24], [0.1, 0.085, 0.15], OR, { r: [0.1, 0, 0], outline: 0.02 });                              // snout
  ell(hb, [0, -0.125, 0.25], [0.075, 0.04, 0.12], WHITE, { outline: 0.0 });                                          // lower jaw
  ell(hb, [0, -0.035, 0.385], [0.05, 0.04, 0.04], NOSE, { outline: 0.012 });
  ellLo(hb, [-0.015, -0.02, 0.415], [0.014, 0.01, 0.008], '#ffffff', { outline: 0, flat: 0.6 });
  eyes(hb, A, B, C, 0.125, 0.07, 0.6);
  blush(hb, A, B, C, 0.19, -0.07, 0.05);

  const tail = new Baker();
  ell(tail, [0, 0, -0.26], [0.15, 0.15, 0.34], OR, { outline: 0.024 });
  ell(tail, [0, 0, -0.55], [0.13, 0.13, 0.15], WHITE, { outline: 0.022 });
  return { body, head: hb, tail, headPivot: [0, 0.62, 0.42], tailPivot: [0, 0.46, -0.34], tailRest: [0.5, 0, 0], height: 1.0 };
}

// ---------------------------------------------------------------------------------------------
function buildSquirrel() {
  const RED = '#b9582c', RED_D = '#9a4522', CREAM = '#f6dcb4', NOSE = '#6b3a3a', NUT = '#c98d52', CAP = '#6e4727';
  const body = new Baker();
  ell(body, [0, 0.34, 0], [0.2, 0.27, 0.19], RED, { outline: 0.022 });
  ell(body, [0, 0.3, 0.1], [0.13, 0.2, 0.09], CREAM, { outline: 0.0 });                                              // belly
  for (const s of [-1, 1]) {
    ell(body, [0.15 * s, 0.17, -0.03], [0.11, 0.13, 0.14], RED_D, { outline: 0.018 });                                // haunches
    ell(body, [0.12 * s, 0.05, 0.1], [0.09, 0.055, 0.17], RED_D, { outline: 0.018 });                                 // big hind feet
    ell(body, [0.115 * s, 0.34, 0.11], [0.05, 0.05, 0.12], RED, { r: [0.2, 0.3 * s, 0], outline: 0.016 });            // arms
    ell(body, [0.075 * s, 0.31, 0.2], [0.05, 0.045, 0.05], CREAM, { outline: 0.014 });                                // paws
  }
  ell(body, [0, 0.305, 0.235], [0.075, 0.085, 0.075], NUT, { outline: 0.016 });                                       // the acorn held in its paws
  ell(body, [0, 0.36, 0.235], [0.085, 0.045, 0.085], CAP, { outline: 0.014 });
  body.add(cyl(6), xf([0, 0.405, 0.235], [0, 0, 0], [0.012, 0.03, 0.012]), { color: CAP, outline: 0.008 });

  const hb = new Baker();
  const A = 0.22, B = 0.19, C = 0.2;
  ell(hb, [0, 0, 0], [A, B, C], RED, { outline: 0.024 });
  for (const s of [-1, 1]) {
    ell(hb, [0.12 * s, -0.07, 0.1], [0.1, 0.085, 0.09], CREAM, { outline: 0.014 });                                   // cheeks
    hb.add(cone(8), xf([0.13 * s, 0.22, -0.02], [0, 0, -0.18 * s], [0.07, 0.15, 0.045]), { color: RED, outline: 0.018 });   // ears
    hb.add(cone(6), at(xf([0.13 * s, 0.22, -0.02], [0, 0, -0.18 * s]), [0, 0.13, 0], [0, 0, 0], [0.045, 0.1, 0.035]), { color: '#4a2a1c', outline: 0.01 });   // ear tufts
  }
  ell(hb, [0, -0.05, 0.17], [0.07, 0.06, 0.07], CREAM, { outline: 0.014 });                                          // muzzle
  ell(hb, [0, -0.025, 0.232], [0.036, 0.028, 0.025], NOSE, { outline: 0.01 });
  ell(hb, [0, -0.115, 0.2], [0.03, 0.04, 0.015], '#ffffff', { outline: 0.008 });                                     // buck tooth
  eyes(hb, A, B, C, 0.1, 0.06, 0.52);
  blush(hb, A, B, C, 0.16, -0.05, 0.045);

  const tail = new Baker();                                                                                           // a big S-curl that ends over its back
  const curl = [[0.1, -0.02, -0.07, 0.09], [0.3, -0.03, -0.17, 0.12], [0.52, -0.03, -0.2, 0.15], [0.72, -0.03, -0.13, 0.16], [0.86, -0.03, 0.0, 0.14]];
  curl.forEach(([y, x, z, r], i) => ell(tail, [x, y, z], [r * 0.85, r * 1.05, r], i === curl.length - 1 ? '#e4a070' : i % 2 ? '#a24a25' : RED, { outline: 0.02 }));
  return { body, head: hb, tail, headPivot: [0, 0.63, 0.05], tailPivot: [0, 0.14, -0.17], tailRest: [0.0, 0, 0], height: 0.88 };
}

// ---------------------------------------------------------------------------------------------
function buildRabbit() {
  const WHITE = '#f6f8fc', SHADE = '#e3e8f2', GREY = '#9aa1b8', PINK = '#f7b9c8', NOSE = '#f29bb4';
  const body = new Baker();
  ell(body, [0, 0.3, 0], [0.26, 0.27, 0.3], WHITE, { outline: 0.022 });
  ell(body, [0, 0.27, 0.16], [0.17, 0.17, 0.12], SHADE, { outline: 0.0 });                                           // belly shade
  for (const s of [-1, 1]) {
    ell(body, [0.2 * s, 0.19, -0.06], [0.1, 0.14, 0.16], WHITE, { outline: 0.018 });                                  // thighs
    ell(body, [0.15 * s, 0.05, 0.1], [0.09, 0.055, 0.2], SHADE, { outline: 0.018 });                                  // big hind feet
    ell(body, [0.09 * s, 0.07, 0.27], [0.06, 0.06, 0.09], WHITE, { outline: 0.016 });                                 // front paws
  }

  const hb = new Baker();
  const A = 0.23, B = 0.2, C = 0.21;
  ell(hb, [0, 0, 0], [A, B, C], WHITE, { outline: 0.024 });
  for (const s of [-1, 1]) {
    ell(hb, [0.1 * s, -0.08, 0.13], [0.1, 0.09, 0.09], WHITE, { outline: 0.014 });                                    // cheeks
    hb.add(new THREE.SphereGeometry(1, 12, 8), xf([0.1 * s, 0.34, -0.03], [0, 0, -0.14 * s], [0.065, 0.25, 0.042]), { color: WHITE, outline: 0.02 });   // long ears
    hb.add(new THREE.SphereGeometry(1, 8, 6), xf([0.1 * s, 0.33, 0.003], [0, 0, -0.14 * s], [0.034, 0.18, 0.02]), { color: PINK });                  // inner ear
    hb.add(new THREE.SphereGeometry(1, 12, 8), xf([0.138 * s, 0.545, -0.03], [0, 0, -0.14 * s], [0.062, 0.085, 0.04]), { color: GREY, outline: 0.016 });   // grey ear tips
  }
  ell(hb, [0, -0.03, 0.2], [0.04, 0.03, 0.025], NOSE, { outline: 0.01 });
  eyes(hb, A, B, C, 0.11, 0.05, 0.58);
  blush(hb, A, B, C, 0.17, -0.06, 0.05);

  const tail = new Baker();
  ell(tail, [0, 0, -0.03], [0.11, 0.11, 0.11], WHITE, { outline: 0.02 });
  return { body, head: hb, tail, headPivot: [0, 0.6, 0.14], tailPivot: [0, 0.3, -0.3], tailRest: [0, 0, 0], height: 1.0 };
}

// ---------------------------------------------------------------------------------------------
function buildGrouse() {
  const BROWN = '#8b5a38', BROWN_D = '#6f4429', LIGHT = '#d9bd92', MOT_D = '#4f3120', MOT_L = '#c99a63', YEL = '#e6a53a', RED = '#e2342f';
  const body = new Baker();
  const BA = 0.27, BB = 0.26, BC = 0.32, BY = 0.34;
  ell(body, [0, BY, 0], [BA, BB, BC], BROWN, { outline: 0.024 });
  ell(body, [0, 0.3, 0.14], [0.2, 0.2, 0.18], LIGHT, { outline: 0.0 });                                              // pale breast
  for (let i = 0; i < 16; i++) {                                                                                      // mottling: flat dark / light flecks scattered over back and sides
    const th = 0.35 + (i * 0.37) % 1.9, ph = (i * 2.399) % (Math.PI * 2);
    const x = BA * Math.sin(th) * Math.cos(ph), y = BY + BB * Math.cos(th) * 0.9, z = BC * Math.sin(th) * Math.sin(ph) * 0.9 - 0.04;
    if (z > 0.1 && y < BY + 0.02) continue;
    ell(body, [x * 0.98, y, z], [0.055, 0.035, 0.05], i % 2 ? MOT_D : MOT_L, { r: [th * 0.5, ph, 0], outline: 0.0 });
  }
  for (const s of [-1, 1]) {
    ell(body, [0.245 * s, 0.37, -0.04], [0.07, 0.14, 0.2], BROWN_D, { r: [0.15, 0, 0.1 * s], outline: 0.02 });         // folded wings
    body.add(cyl(6), xf([0.09 * s, 0.1, 0.04], [0, 0, 0], [0.024, 0.2, 0.024]), { color: YEL, outline: 0.012 });      // legs
    ell(body, [0.09 * s, 0.03, 0.1], [0.06, 0.028, 0.1], YEL, { outline: 0.014 });                                    // feet
  }

  const hb = new Baker();
  const A = 0.17, B = 0.17, C = 0.17;
  ell(hb, [0, 0, 0], [A, B, C], BROWN, { outline: 0.022 });
  ell(hb, [0, -0.1, 0.07], [0.11, 0.08, 0.1], LIGHT, { outline: 0.0 });                                              // throat
  hb.add(cone(8), xf([0, -0.02, 0.2], [Math.PI / 2, 0, 0], [0.055, 0.13, 0.04]), { color: '#f0c040', outline: 0.014 });    // beak
  for (const s of [-1, 1]) ell(hb, [0.075 * s, 0.115, 0.1], [0.07, 0.035, 0.06], RED, { r: [0, 0, 0.35 * s], outline: 0.014 });   // red eyebrow combs
  ell(hb, [0, 0.14, 0.04], [0.035, 0.06, 0.06], RED, { outline: 0.012 });                                            // comb crest
  eyes(hb, A, B, C, 0.095, 0.03, 0.5);

  const tail = new Baker();                                                                                           // a fan of seven feathers in the XY plane (the pivot leans it back)
  for (let i = 0; i < 7; i++) {
    const a = (i - 3) * 0.26;
    ell(tail, [Math.sin(a) * 0.19, Math.cos(a) * 0.19, 0], [0.065, 0.21, 0.024], i % 2 ? BROWN_D : BROWN, { r: [0, 0, -a], outline: 0.014 });
    ell(tail, [Math.sin(a) * 0.37, Math.cos(a) * 0.37, 0], [0.06, 0.05, 0.026], '#eadfc8', { r: [0, 0, -a], outline: 0.012 });
  }
  return { body, head: hb, tail, headPivot: [0, 0.6, 0.2], tailPivot: [0, 0.4, -0.27], tailRest: [-0.95, 0, 0], height: 0.82 };
}

const BUILDERS = { fox: buildFox, squirrel: buildSquirrel, rabbit: buildRabbit, grouse: buildGrouse };

// ---------------------------------------------------------------------------------------------
export function createCritterModel(species) {
  const build = BUILDERS[species];
  if (!build) throw new Error(`unknown critter species: ${species}`);
  const blink = { value: 1 };
  const mat = makeToon(blink, 'critter-toon');
  const spec = build();
  const baked = [];
  const bake = (b) => { const e = b.build(); baked.push(e); return e; };

  const root = new THREE.Group();
  root.name = `critter-${species}`;
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
  add(rig, bake(spec.body), `${species}-body`, true);
  const headGroup = new THREE.Group();
  headGroup.name = 'headGroup';
  headGroup.position.set(...spec.headPivot);
  rig.add(headGroup);
  add(headGroup, bake(spec.head), `${species}-head`, false);
  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.set(...spec.tailPivot);
  tail.rotation.set(...spec.tailRest);
  tail.userData.rest = { x: spec.tailRest[0], y: spec.tailRest[1], z: spec.tailRest[2] };
  rig.add(tail);
  add(tail, bake(spec.tail), `${species}-tail`, false);

  let drawCalls = 0;
  for (const m of meshes) drawCalls += m.castShadow ? 2 : 1;
  return {
    root, rig, headGroup, tail, species, height: spec.height, drawCalls,
    setBlink(closed) { blink.value = 1 - 0.88 * closed; },
    dispose() { for (const e of baked) e.geo.dispose(); mat.dispose(); },
  };
}
