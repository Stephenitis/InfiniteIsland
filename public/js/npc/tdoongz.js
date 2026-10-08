// The Tdoongz (PLAN Steps 64-66): nine plush-like animal friends, one character per substep, built with the character baker (player/character.js) like Mossback and the bridge builders.
// This file is the shared MODEL KIT: `createTdoongModel(id)` assembles any friend from a table of builders (BUILDERS), so 64b-64i each add one builder function and nothing else.
// Step 64a: 'imnabong' (Im Nabong, the periwinkle bunny). Step 64b-d: 'yubbuibbui' (the navy puppy), 'mokuring' (the pink bear), 'shyamshyam' (the peach hamster). Step 64f: 'myodette' (the penguin; flippers = arms, feet = legs).
//
//   const m = createTdoongModel('imnabong')
//   m.root          Group: origin at the feet, faces +Z (yaw 0), about 1.3 u tall (the head is about half of it)
//   m.rig           squash / bob / hop pivot at the feet
//   m.torso         group holding the body, arms, head and pouch (lean)
//   m.headGroup     head pivot at the neck (turns, nods, tilts)
//   m.armL / armR   shoulder pivots (arm hangs along -Y; rotation.x < 0 raises it forward, rotation.z swings it out); armL is on +X (the character's left when it faces +Z)
//   m.handL / handR sockets at the hands (a weapon in handR, a charm in handL, like the player; Step 66)
//   m.legL / legR   hip pivots (rotation.x swings the leg for a walk cycle)
//   m.ears          [earL, earR] pivots at the ear roots (rotation.x lags / bounces, rotation.z flops outward); userData.restZ / restY = the resting angles
//   m.tail          a pivot at the tail (rotation.y wags it): Im Nabong's pompom is baked into the body mesh (nothing to wag); Yu Bbui Bbui's tail is its own small mesh child of it
//   m.wings         [wingL, wingR] pivots (Shyam Shyam only; [] otherwise): rotation.y = side * (0.35 + flap), rotation.z = side * 0.1; userData.restY / restZ = the rest angles
//   m.earGain       how strongly the runtime's ear springs drive this friend's ears (1 = the bunny; round ears use less)
//   arms rest at armL / armR.userData.restX / restZ (Shyam Shyam holds her paws together at her chest); legs at userData.restZ
//   m.pouch         group at the tummy cloud pouch (jiggles); m.pouchSocket the opening; m.pouchItem the group of the item inside (or null); m.setPouch(itemId | null)
//   m.setBlink(closed 0..1)        squashes the eye vertices in the shader (shared with every character); 1 = shut
//   m.setExpression('normal' | 'happy' | 'sleepy')   happy = eyes squint into ^^ , sleepy = heavy lids; combined with the blink by max()
//   m.drawCalls     main-pass meshes + shadow-pass meshes currently shown (budget 12 per character; Im Nabong is 11, 12 with a pouch item)
//   m.height, m.dispose()
//
// Step 64e: 'parkzyoni' (Park Zyoni, the butter-yellow unicorn): a QUADRUPED (layout.quad). armL / armR are the FRONT legs, legL / legR the HIND legs (all four, and the tail, live in the torso), handR is at the
// front-right hoof, `m.hornSocket` (null otherwise) sits at the golden horn's tip, `m.sit` = { pitch, pivot [y, z], drop, stretch, splay, headComp, hindLower, shift } describes her sitting pose (null otherwise): the runtime
// pitches the torso up about the rump, folds the hind legs forward with the hoof soles facing front, keeps the front legs vertical (scale.y 1 + stretch) and the head upright.
//
// Draw-call budget: merged, vertex-coloured meshes with the outline hull baked in and ONE toon material that also marks the stencil buffer like every character (so the occluded-player
// silhouette never paints over a friend; it is the shared 'character-toon' program, so no new shader program). Body and head cast shadows, the small pieces do not.
//
// Im Nabong: body (tummy, rump, the round pompom tail) 2, head (face, cloud fringe, blush, nose, "w" mouth, glossy eyes + lashes) 2, two ears 2, two arms 2, two legs 2, the cloud pouch 1
// = 11, plus 1 for an item in the pouch (a carrot: orange cone + green leaves).
// Yu Bbui Bbui: body (tummy + the tartan pocket with its stripes and two buttons) 2, head (cream muzzle mask, white-rimmed eyes, nose, tongue smile, whisker dots) 2, two long floppy ears 2, arms 2, legs 2,
// the tail 1 = 11.
// Mokuring: body (tummy + the white badge with the green dino) 2, head (cream muzzle, "o" mouth, glossy eyes + lashes, the lavender heart patch with its butterfly) 2, two round ears with braided rims 2,
// arms 2, legs with the striped warmers 2 = 10.
// Shyam Shyam: body (tummy + the frilly bloomers with bow and hearts) 2, head (cheek puffs, nose, smile, whiskers, forehead heart curl) 2, two round ears 2, arms 2, legs 2, two wings 2 = 12.
// Park Zyoni: body (barrel, neck, mane crest) 2, head (blaze, muzzle, heart eyes, ears, cloud mane, horn) 2, four legs with the polka-dot soles 4, the striped tail with its pompom 1 = 9.
// Myodette: body (the fluffy puff of 32 lumps + white dots) 2, head (white mask, glossy eyes, mint beak, feather tuft) 2, two flippers 2, two webbed feet 2 = 8 (no ears, no tail: `ears` is [])
import * as THREE from 'three';
import { Baker, castMesh, makeToon, xf } from '../player/character.js';
import { sphere, sphereLo, cyl, capsule, surf, at, eyes, yOf } from './models.js';

// ---- Im Nabong's colours (toon-friendly values picked from the reference sheets)
const FUR = '#a9c2fb', FUR_LIGHT = '#c6d7fd', FUR_DARK = '#8fadf2', FUR_FEET = '#98b4f5';
const FRINGE = '#b8cdfd', PINK = '#f7a3c6', WHITE = '#ffffff', CLOUD = '#fbfdff', TAIL_WHITE = '#eef3fe';
const BLUSH = '#f7a8bf', NOSE = '#f08aa8', MOUTH = '#4a3040', LASH = '#3b2620';
const CARROT = '#ff8f2e', CARROT_DARK = '#e8741a', LEAF = '#5fbf4a', LEAF_DARK = '#46a23a';

// ---- shared little helpers for the later friends
/** Placement on a BODY ellipsoid (semi-axes a, b, c) centred at height cy: like surf(), (x, y) relative to its centre. */
const bodyAt = (cy, a, b, c, x, y, lift = 0) => new THREE.Matrix4().makeTranslation(0, cy, 0).multiply(surf(a, b, c, x, y, lift));
/** Height (z) of an ellipsoid with semi-axes rx, ry, rz at the offset (x, y) from its centre. */
const ez = (rx, ry, rz, x, y) => rz * Math.sqrt(Math.max(0.0001, 1 - (x / rx) ** 2 - (y / ry) ** 2));
const box = () => new THREE.BoxGeometry(1, 1, 1);
/** A flat heart in the XY plane of matrix m: width 2 s, height about 1.7 s; two lobes + a diamond, thickness t (flat-shaded decal colour). */
function flatHeart(b, m, s, color, t = 0.012) {
  for (const sx of [-1, 1]) b.add(sphereLo(), at(m, [0.5 * s * sx, 0.3 * s, 0], [0, 0, 0], [0.5 * s, 0.5 * s, t]), { color, flat: 1 });
  b.add(box(), at(m, [0, -0.05 * s, 0], [0, 0, Math.PI / 4], [1.12 * s, 1.12 * s, t * 1.6]), { color, flat: 1 });
}
/** Big round eyes on an ellipsoid head: an optional white rim, the iris / pupil, two highlights; every part carries the blink flag. */
function roundEyes(head, A, B, C, x, y, { w = 0.075, h = 0.09, iris, rim = null, lashes = null } = {}) {
  for (const side of [-1, 1]) {
    const place = surf(A, B, C, x * side, y, -0.005);
    const cy = yOf(place);
    const part = (geo, p, sc, color) => head.add(geo, at(place, p, [0, 0, 0], sc), { color, flat: 1, eye: cy });
    if (rim) part(sphere(), [0, 0, 0], [w * 1.2, h * 1.12, 0.026], rim);
    part(sphere(), [0, rim ? -0.004 : 0, rim ? 0.004 : 0], [rim ? w * 0.84 : w, rim ? h * 0.86 : h, 0.032], iris);
    part(sphereLo(), [0.3 * w, 0.32 * h, 0.03], [0.3 * w, 0.3 * w, 0.012], '#ffffff');
    part(sphereLo(), [-0.3 * w, -0.34 * h, 0.03], [0.14 * w, 0.14 * w, 0.012], '#ffffff');
    if (lashes) {
      for (const [dy, rz] of [[0.045, 0.75], [0.0, 0.2]]) {
        head.add(sphereLo(), at(surf(A, B, C, (x + w * 1.05) * side, y + dy, 0.006), [0, 0, 0], [0, 0, -rz * side], [0.026, 0.008, 0.006]), { color: lashes, flat: 1 });
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Im Nabong the bunny
// ---------------------------------------------------------------------------------------------
function buildImnabong() {
  // body: a round tummy, a fuller rump and the pompom tail (all one mesh)
  const body = new Baker();
  body.add(sphere(), xf([0, 0.4, 0], [0, 0, 0], [0.27, 0.25, 0.23]), { color: FUR, outline: 0.03 });
  body.add(sphere(), xf([0, 0.3, -0.04], [0, 0, 0], [0.25, 0.2, 0.24]), { color: FUR, outline: 0.028 });
  body.add(sphere(), xf([0, 0.3, -0.27], [0, 0, 0], [0.1, 0.1, 0.1]), { color: TAIL_WHITE, outline: 0.022 });            // the round pompom tail
  for (const s of [-1, 1]) body.add(sphereLo(), xf([0.17 * s, 0.56, 0.0], [0, 0, 0.3 * s], [0.1, 0.07, 0.1]), { color: FUR });   // soft shoulders

  // head: wide plush ellipsoid; every face feature sits on its surface through surf()
  const head = new Baker();
  const A = 0.42, B = 0.34, C = 0.37;
  head.add(sphere(), xf([0, 0, 0], [0, 0, 0], [A, B, C]), { color: FUR, outline: 0.034 });
  eyes(head, A, B, C, 0.175, -0.025, 1.35);                                                                              // big glossy eyes with a white highlight
  for (const s of [-1, 1]) {
    head.add(sphere(), at(surf(A, B, C, 0.27 * s, -0.115, 0.004), [0, 0, 0], [0, 0, 0], [0.075, 0.045, 0.01]), { color: BLUSH, flat: 1 });   // blush ovals
    // two little lashes at the outer corner of each eye
    for (const [dy, rz] of [[0.045, 0.75], [0.0, 0.2]]) {
      head.add(sphereLo(), at(surf(A, B, C, 0.275 * s, -0.025 + dy, 0.006), [0, 0, 0], [0, 0, -rz * s], [0.026, 0.008, 0.006]), { color: LASH, flat: 1 });
    }
  }
  head.add(sphereLo(), at(surf(A, B, C, 0, -0.085, 0.004), [0, 0, 0], [0, 0, 0], [0.03, 0.021, 0.014]), { color: NOSE, flat: 1 });   // tiny pink nose
  for (const s of [-1, 1]) {                                                                                             // the small "w" mouth: two little smiles side by side
    head.add(new THREE.TorusGeometry(0.024, 0.0065, 4, 9, Math.PI), at(surf(A, B, C, 0.026 * s, -0.125, 0.004), [0, 0, 0], [0, 0, Math.PI]), { color: MOUTH, flat: 1 });
  }
  // the curly cloud fringe: three big puffs on the forehead, a touch lighter than the fur
  const lumps = [[-0.115, 0.235, 0.11], [0, 0.255, 0.12], [0.115, 0.235, 0.11]];
  for (const [x, y, r] of lumps) head.add(sphere(), at(surf(A, B, C, x, y, 0.02), [0, 0, 0], [0, 0, 0], [r, r * 0.82, r * 0.7]), { color: FRINGE, outline: 0.016 });

  // ears: long flat capsules hanging from the root (the pivot is the origin of the geometry, so it can flop); the inner face carries pink / white vertical stripes
  const makeEar = (side) => {
    const e = new Baker();
    e.add(capsule(0.14, 0.45), xf([0, -0.34, 0], [0, 0, 0], [0.3, 1, 1]), { color: FUR, outline: 0.026 });
    const stripes = [-0.088, -0.044, 0, 0.044, 0.088];
    stripes.forEach((z, i) => e.add(sphereLo(), xf([-0.047 * side, -0.4, z], [0, 0, 0], [0.016, 0.32, 0.024]), { color: i % 2 === 0 ? PINK : WHITE }));
    return e;
  };

  // arms: a stubby capsule and a round paw
  const makeArm = () => {
    const a = new Baker();
    a.add(capsule(0.07, 0.07), xf([0, -0.09, 0]), { color: FUR, outline: 0.026 });
    a.add(sphere(), xf([0, -0.22, 0.02], [0, 0, 0], [0.085, 0.08, 0.085]), { color: FUR_LIGHT, outline: 0.024 });
    return a;
  };
  // legs: short stumps and chunky round feet
  const makeLeg = () => {
    const l = new Baker();
    l.add(capsule(0.075, 0.03), xf([0, -0.07, 0]), { color: FUR, outline: 0.026 });
    l.add(sphere(), xf([0, -0.135, 0.045], [0, 0, 0], [0.1, 0.055, 0.14]), { color: FUR_FEET, outline: 0.026 });
    return l;
  };

  // the white cloud pouch: overlapping puffs, each with its own thin outline so the scallops read like the line art
  const pouch = new Baker();
  const puff = (x, y, z, sx, sy, sz) => pouch.add(sphere(), xf([x, y, z], [0, 0, 0], [sx, sy, sz]), { color: CLOUD, outline: 0.011 });
  puff(0, 0, 0.02, 0.17, 0.11, 0.07);
  puff(-0.12, -0.005, 0, 0.085, 0.075, 0.055);
  puff(0.12, -0.005, 0, 0.085, 0.075, 0.055);
  puff(-0.075, 0.075, 0, 0.07, 0.055, 0.05);
  puff(0.075, 0.075, 0, 0.07, 0.055, 0.05);
  puff(-0.07, -0.07, 0, 0.07, 0.05, 0.05);
  puff(0.07, -0.07, 0, 0.07, 0.05, 0.05);

  return {
    body, head, pouch, earL: makeEar(1), earR: makeEar(-1), armL: makeArm(), armR: makeArm(), legL: makeLeg(), legR: makeLeg(),
    layout: {
      headY: 0.92, shoulder: [0.25, 0.55, 0.02], hip: [0.12, 0.19, 0], tailPivot: [0, 0.3, -0.27], pouchPos: [0, 0.35, 0.21], pouchSocket: [0, 0.075, 0.045],
      earPivot: [0.3, 0.2, -0.06], earTilt: 0.35, earYaw: 1.0, handDrop: -0.22, height: 1.3,
    },
    defaultPouch: 'carrot',
  };
}

// ---------------------------------------------------------------------------------------------
// Yu Bbui Bbui the puppy (Step 64b). Tunables: PUP_* colours, the ear capsule (0.13 x 0.36), the muzzle mask scale [0.27, 0.17, 0.14], the pocket scale [0.145, 0.1, 0.022], eye rim size (w 0.08, h 0.095)
// ---------------------------------------------------------------------------------------------
function buildYubbuibbui() {
  const FURN = '#4a4e72', FURN_DARK = '#3c3f60', CREAM = '#fff0cf', RED = '#c9232f', GREEN = '#1f7a3f', YELLOW = '#f0c23c', GOLD = '#e0a24a';
  const body = new Baker();
  body.add(sphere(), xf([0, 0.4, 0], [0, 0, 0], [0.3, 0.26, 0.25]), { color: FURN, outline: 0.03 });
  body.add(sphere(), xf([0, 0.3, -0.04], [0, 0, 0], [0.27, 0.2, 0.25]), { color: FURN, outline: 0.028 });
  for (const s of [-1, 1]) body.add(sphereLo(), xf([0.19 * s, 0.56, 0.0], [0, 0, 0.3 * s], [0.1, 0.07, 0.1]), { color: FURN });
  // the tartan pocket: a flat red ellipse with thin dark-green and yellow stripes crossing on it, and two buttons
  const PM = bodyAt(0.4, 0.3, 0.26, 0.25, 0, -0.1, 0.01);
  const PX = 0.145, PY = 0.1, PZ = 0.022;
  body.add(sphere(), at(PM, [0, 0, 0], [0, 0, 0], [PX, PY, PZ]), { color: RED, outline: 0.012 });
  const stripe = (x, y, w, h, color) => {                   // a thin box lying on the pocket, clipped to its ellipse
    const cw = Math.min(w, 2 * PX * Math.sqrt(Math.max(0.01, 1 - (y / PY) ** 2)) * 0.82), ch = Math.min(h, 2 * PY * Math.sqrt(Math.max(0.01, 1 - (x / PX) ** 2)) * 0.82);
    body.add(box(), at(PM, [x, y, Math.max(0.006, ez(PX, PY, PZ, x, y)) - 0.001], [0, 0, 0], [cw, ch, 0.006]), { color, flat: 0.6 });
  };
  for (const x of [-0.08, 0, 0.08]) stripe(x, 0, 0.022, 0.3, GREEN);
  for (const y of [-0.04, 0.04]) stripe(0, y, 0.4, 0.02, GREEN);
  for (const x of [-0.12, -0.04, 0.04, 0.12]) stripe(x, 0, 0.008, 0.3, YELLOW);
  for (const y of [-0.075, 0, 0.075]) stripe(0, y, 0.4, 0.008, YELLOW);
  for (const s of [-1, 1]) body.add(sphereLo(), at(PM, [0.07 * s, 0.07, ez(PX, PY, PZ, 0.07 * s, 0.07) + 0.004], [0, 0, 0], [0.022, 0.022, 0.012]), { color: GOLD, outline: 0.006 });

  // head: wide, with the cream muzzle MASK on the lower face (rounded, reaching up to just under the eyes)
  const head = new Baker();
  const A = 0.46, B = 0.36, C = 0.4;
  head.add(sphere(), xf([0, 0, 0], [0, 0, 0], [A, B, C]), { color: FURN, outline: 0.034 });
  const MR = [0.27, 0.17, 0.1];                              // (z kept shallow: a flat mask, not a snout)
  const MM = surf(A, B, C, 0, -0.135, -0.03);
  head.add(sphere(), at(MM, [0, 0, 0], [0, 0, 0], MR), { color: CREAM, outline: 0.022 });
  roundEyes(head, A, B, C, 0.2, 0.06, { w: 0.08, h: 0.095, iris: '#1d1a2a', rim: '#ffffff' });
  head.add(sphere(), at(MM, [0, 0.062, ez(...MR, 0, 0.062) - 0.004], [0, 0, 0], [0.05, 0.036, 0.035]), { color: '#1e1a26', outline: 0.01 });          // the black nose
  head.add(sphereLo(), at(MM, [-0.015, 0.072, ez(...MR, 0, 0.062) + 0.026], [0, 0, 0], [0.013, 0.008, 0.008]), { color: '#ffffff', flat: 0.6 });       // nose shine
  head.add(sphere(), at(MM, [0, -0.045, ez(...MR, 0, -0.045) - 0.002], [0, 0, 0], [0.058, 0.036, 0.014]), { color: '#6b2a36', flat: 1 });            // the open smile
  head.add(sphere(), at(MM, [0, -0.062, ez(...MR, 0, -0.062) + 0.002], [0, 0, 0], [0.036, 0.022, 0.014]), { color: '#e8404f', flat: 1 });            // the red tongue

  const makeEar = () => {                                    // long, wide, flat: hangs well below the chin
    const e = new Baker();
    e.add(capsule(0.13, 0.36), xf([0, -0.34, 0], [0, 0, 0], [1, 1, 0.34]), { color: FURN_DARK, outline: 0.026 });
    return e;
  };
  const makeArm = () => {
    const a = new Baker();
    a.add(capsule(0.07, 0.07), xf([0, -0.09, 0]), { color: FURN, outline: 0.026 });
    a.add(sphere(), xf([0, -0.22, 0.02], [0, 0, 0], [0.085, 0.08, 0.085]), { color: FURN_DARK, outline: 0.024 });
    return a;
  };
  const makeLeg = () => {
    const l = new Baker();
    l.add(capsule(0.075, 0.03), xf([0, -0.07, 0]), { color: FURN, outline: 0.026 });
    l.add(sphere(), xf([0, -0.135, 0.045], [0, 0, 0], [0.1, 0.055, 0.14]), { color: FURN_DARK, outline: 0.026 });
    return l;
  };
  const tailB = new Baker();                                 // a short stubby tail, pointing up and back from its pivot (it wags about Y)
  tailB.add(capsule(0.045, 0.08), xf([0, 0.075, -0.06], [-0.75, 0, 0]), { color: FURN, outline: 0.024 });
  return {
    body, head, earL: makeEar(), earR: makeEar(), armL: makeArm(), armR: makeArm(), legL: makeLeg(), legR: makeLeg(), tailB,
    layout: {
      headY: 0.92, shoulder: [0.27, 0.53, 0.03], hip: [0.12, 0.19, 0], tailPivot: [0, 0.3, -0.25], earPivot: [0.38, 0.22, -0.02], earTilt: 0.18, earYaw: 0, handDrop: -0.22, height: 1.3, earGain: 1.2,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Mokuring the bear (Step 64c). Tunables: ear radius 0.17 + the braid ring (11 lumps, arc -20..200 deg), the heart patch size (0.1 per half) and side (x -0.2: the viewer's left = her right eye, as in the
// reference), the badge radius 0.14 and the dino scale `ds`, the warmer rings
// ---------------------------------------------------------------------------------------------
function buildMokuring() {
  const PINKF = '#f7a9d0', PINK_LIGHT = '#fbc9e2', PINK_FEET = '#f39cc6', CREAMM = '#fff0e0', LAV = '#c4a3f0', LAV2 = '#b08ae6', LAV_PATCH = '#b897f7', PURPLE = '#7b3fd1', WHITE2 = '#fdfbff', DINO = '#5fbf4a', DINO_DARK = '#2f8f4f';
  const body = new Baker();
  body.add(sphere(), xf([0, 0.4, 0], [0, 0, 0], [0.3, 0.27, 0.26]), { color: PINKF, outline: 0.03 });
  body.add(sphere(), xf([0, 0.3, -0.04], [0, 0, 0], [0.27, 0.2, 0.25]), { color: PINKF, outline: 0.028 });
  for (const s of [-1, 1]) body.add(sphereLo(), xf([0.19 * s, 0.56, 0.0], [0, 0, 0.3 * s], [0.1, 0.07, 0.1]), { color: PINKF });
  // the white round badge with a little green dinosaur (oversized flat pieces: body, head, tail, legs, three spikes)
  const BM = bodyAt(0.4, 0.3, 0.27, 0.26, 0, -0.02, 0.008);
  body.add(sphere(), at(BM, [0, 0, 0], [0, 0, 0], [0.14, 0.14, 0.03]), { color: WHITE2, outline: 0.012 });
  const ds = 1.3, dz = 0.026;
  const dp = (x, y, sx, sy, color, rz = 0) => body.add(sphereLo(), at(BM, [x * ds, y * ds, dz], [0, 0, rz], [sx * ds, sy * ds, 0.012]), { color, flat: 1 });
  dp(0, 0, 0.045, 0.03, DINO);                               // body
  dp(0.05, 0.028, 0.026, 0.022, DINO);                       // head
  dp(-0.045, -0.005, 0.03, 0.015, DINO, -0.25);              // tail, then a thinner tip
  dp(-0.075, -0.022, 0.022, 0.01, DINO, -0.5);
  dp(-0.012, -0.033, 0.012, 0.017, DINO); dp(0.022, -0.033, 0.012, 0.017, DINO);   // legs
  for (const [x, y] of [[-0.022, 0.03], [0.003, 0.036], [0.027, 0.034]]) dp(x, y, 0.009, 0.014, DINO_DARK);   // spikes
  dp(0.058, 0.032, 0.006, 0.006, '#26402a');                 // eye

  const head = new Baker();
  const A = 0.45, B = 0.36, C = 0.4;
  head.add(sphere(), xf([0, 0, 0], [0, 0, 0], [A, B, C]), { color: PINKF, outline: 0.034 });
  const MR = [0.17, 0.125, 0.12];
  const MM = surf(A, B, C, 0, -0.125, -0.02);
  head.add(sphere(), at(MM, [0, 0, 0], [0, 0, 0], MR), { color: CREAMM, outline: 0.022 });
  head.add(sphere(), at(MM, [0, 0.05, ez(...MR, 0, 0.05) - 0.004], [0, 0, 0], [0.042, 0.032, 0.03]), { color: '#e8647e', outline: 0.01 });            // pink-red nose
  head.add(sphereLo(), at(MM, [-0.012, 0.058, ez(...MR, 0, 0.05) + 0.024], [0, 0, 0], [0.011, 0.007, 0.007]), { color: '#ffffff', flat: 0.6 });
  head.add(sphere(), at(MM, [0, -0.04, ez(...MR, 0, -0.04) - 0.002], [0, 0, 0], [0.022, 0.03, 0.012]), { color: '#7a3045', flat: 1 });             // the small surprised "o"
  head.add(sphereLo(), at(MM, [0, -0.046, ez(...MR, 0, -0.04) + 0.006], [0, 0, 0], [0.011, 0.015, 0.008]), { color: '#e8788f', flat: 1 });
  // the lavender heart patch round her (viewer's-left) eye, with the butterfly on it
  // (each piece sits on the head surface at its own spot, so the patch hugs the curve instead of burying its edges, and stays UNDER the eye)
  const patch = (dx, dy, geo, rot, sc) => head.add(geo, at(surf(A, B, C, -0.2 + dx, 0.03 + dy, 0.003), [0, 0, 0], rot, sc), { color: LAV_PATCH, flat: 1 });
  for (const s of [-1, 1]) patch(0.072 * s, 0.05, sphereLo(), [0, 0, 0], [0.08, 0.078, 0.012]);
  patch(0, -0.02, box(), [0, 0, Math.PI / 4], [0.16, 0.16, 0.014]);
  patch(0, -0.1, sphereLo(), [0, 0, 0], [0.04, 0.04, 0.012]);
  roundEyes(head, A, B, C, 0.2, 0.035, { w: 0.082, h: 0.1, iris: '#5a2f2c', lashes: '#3b2620' });
  const BF = surf(A, B, C, -0.245, 0.105, 0.016);
  for (const s of [-1, 1]) {
    head.add(sphereLo(), at(BF, [0.026 * s, 0.016, 0], [0, 0, -0.5 * s], [0.03, 0.02, 0.008]), { color: PURPLE, flat: 1 });
    head.add(sphereLo(), at(BF, [0.02 * s, -0.016, 0], [0, 0, 0.5 * s], [0.02, 0.014, 0.008]), { color: '#9b6bdf', flat: 1 });
  }
  head.add(sphereLo(), at(BF, [0, 0, 0.003], [0, 0, 0], [0.006, 0.026, 0.008]), { color: '#3b2a52', flat: 1 });

  // ears: a round pink disc with a paler inner and a ring of alternating lavender lumps round its rim (the braided twist)
  const makeEar = (side) => {
    const e = new Baker();
    e.add(sphere(), xf([0, 0, 0], [0, 0, 0], [0.17, 0.17, 0.075]), { color: PINKF, outline: 0.026 });
    e.add(sphere(), xf([0, -0.01, 0.055], [0, 0, 0], [0.1, 0.1, 0.02]), { color: PINK_LIGHT, flat: 0.5 });
    const N = 11;
    for (let k = 0; k < N; k++) {
      const th = (-20 + (220 * k) / (N - 1)) * Math.PI / 180;
      const phi = th + Math.PI / 2 + (k % 2 ? 0.55 : -0.55);
      e.add(sphere(), xf([side * 0.168 * Math.cos(th), 0.168 * Math.sin(th), 0.012], [0, 0, side > 0 ? phi : Math.PI - phi], [0.05, 0.028, 0.034]), { color: k % 2 ? LAV : LAV2, outline: 0.012 });
    }
    return e;
  };
  const makeArm = () => {
    const a = new Baker();
    a.add(capsule(0.07, 0.07), xf([0, -0.09, 0]), { color: PINKF, outline: 0.026 });
    a.add(sphere(), xf([0, -0.22, 0.02], [0, 0, 0], [0.085, 0.08, 0.085]), { color: PINK_LIGHT, outline: 0.024 });
    return a;
  };
  const makeLeg = () => {                                    // a stump in lavender / white striped leg warmers (rings), ending in a lavender foot
    const l = new Baker();
    l.add(capsule(0.075, 0.03), xf([0, -0.07, 0]), { color: PINK_FEET, outline: 0.026 });
    [-0.034, -0.062, -0.09, -0.118].forEach((y, i) => l.add(cyl(14), xf([0, y, 0], [0, 0, 0], [0.09, 0.028, 0.09]), { color: i % 2 ? WHITE2 : LAV }));
    l.add(sphere(), xf([0, -0.135, 0.045], [0, 0, 0], [0.1, 0.055, 0.14]), { color: LAV, outline: 0.026 });
    l.add(sphere(), xf([0, -0.152, 0.07], [0, 0, 0], [0.07, 0.016, 0.1]), { color: WHITE2 });
    return l;
  };
  return {
    body, head, earL: makeEar(1), earR: makeEar(-1), armL: makeArm(), armR: makeArm(), legL: makeLeg(), legR: makeLeg(),
    layout: {
      headY: 0.9, shoulder: [0.26, 0.55, 0.02], hip: [0.12, 0.19, 0], tailPivot: [0, 0.3, -0.26], earPivot: [0.32, 0.23, -0.03], earTilt: -0.3, earYaw: 0, handDrop: -0.22, height: 1.38, earGain: 0.4,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Shyam Shyam the hamster (Step 64d). Tunables: cheek puffs [0.16, 0.12, 0.11], the curl heart size `HS`, wing feather list in makeWing, bloomers ellipsoid [0.29, 0.13, 0.26], arm rest (layout
// armRestX / armRestZ: paws together), wing rest (wingYaw / wingTilt)
// ---------------------------------------------------------------------------------------------
function buildShyamshyam() {
  const PEACH = '#ffe2c2', PEACH_LIGHT = '#fff0de', PEACH_DARK = '#f9cfa3', WHITE3 = '#ffffff', PINK_IN = '#f7a9ab', CURL = '#d58a5a', PURP = '#b190ea', PURP_DARK = '#9a72dc', FEATHER = '#f1ecff';
  const body = new Baker();
  body.add(sphere(), xf([0, 0.4, 0], [0, 0, 0], [0.27, 0.25, 0.24]), { color: PEACH, outline: 0.03 });
  body.add(sphere(), xf([0, 0.3, -0.04], [0, 0, 0], [0.25, 0.2, 0.24]), { color: PEACH, outline: 0.028 });
  for (const s of [-1, 1]) body.add(sphereLo(), xf([0.17 * s, 0.56, 0.0], [0, 0, 0.3 * s], [0.1, 0.07, 0.1]), { color: PEACH });
  // the frilly white bloomers: a puffy band round the hips with a ring of ruffle puffs along the hem, a purple bow and three little purple hearts at the front
  body.add(sphere(), xf([0, 0.24, 0], [0, 0, 0], [0.31, 0.19, 0.28]), { color: WHITE3, outline: 0.026 });
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    body.add(sphere(), xf([0.29 * Math.sin(a), 0.1, 0.265 * Math.cos(a)], [0, 0, 0], [0.07, 0.055, 0.07]), { color: WHITE3, outline: 0.012 });
  }
  const BW = bodyAt(0.24, 0.31, 0.19, 0.28, 0, 0.065, 0.012);
  for (const s of [-1, 1]) body.add(sphere(), at(BW, [0.05 * s, 0, 0.004], [0, 0, 0.35 * s], [0.055, 0.032, 0.026]), { color: PURP, outline: 0.01 });
  body.add(sphere(), at(BW, [0, 0, 0.012], [0, 0, 0], [0.03, 0.03, 0.026]), { color: PURP_DARK, outline: 0.01 });
  for (const [x, y] of [[-0.13, -0.025], [0.13, -0.025], [0, -0.085]]) flatHeart(body, bodyAt(0.24, 0.31, 0.19, 0.28, x, y, 0.004), 0.042, PURP, 0.012);

  const head = new Baker();
  const A = 0.46, B = 0.37, C = 0.4;
  head.add(sphere(), xf([0, 0, 0], [0, 0, 0], [A, B, C]), { color: PEACH, outline: 0.034 });
  for (const s of [-1, 1]) head.add(sphere(), at(surf(A, B, C, 0.2 * s, -0.115, -0.02), [0, 0, 0], [0, 0, 0], [0.16, 0.12, 0.11]), { color: WHITE3, outline: 0.02 });   // the big round cheek puffs
  const MZ = [0.12, 0.085, 0.1];
  const MM = surf(A, B, C, 0, -0.105, -0.02);
  head.add(sphere(), at(MM, [0, 0, 0], [0, 0, 0], MZ), { color: WHITE3, outline: 0.016 });
  roundEyes(head, A, B, C, 0.18, 0.04, { w: 0.078, h: 0.095, iris: '#3a2424', lashes: '#3b2620' });
  head.add(sphereLo(), at(MM, [0, 0.03, ez(...MZ, 0, 0.03) - 0.002], [0, 0, 0], [0.03, 0.022, 0.02]), { color: '#f08aa8', flat: 1 });                 // tiny pink nose
  head.add(new THREE.TorusGeometry(0.026, 0.0075, 4, 9, Math.PI), at(MM, [0, -0.012, ez(...MZ, 0, -0.03) + 0.004], [0, 0, Math.PI]), { color: '#4a3040', flat: 1 });   // small closed smile
  for (const s of [-1, 1]) {
    for (const [dy, rz] of [[0.04, 0.3], [0, 0], [-0.04, -0.3]]) {                                                                                       // whiskers: thin lines fanning outward
      head.add(sphereLo(), at(surf(A, B, C, 0.4 * s, -0.1 + dy, 0.045), [0.05 * s, 0, 0], [0, 0, rz * s], [0.075, 0.006, 0.006]), { color: '#a77f6b', flat: 1 });
    }
  }
  // the heart curl doodle on the forehead (a raised thin loop in darker peach) + two short swooshes
  const CM = surf(A, B, C, 0, 0.215, 0.006);
  const HS = 0.042;
  const pts = [];
  for (let k = 0; k < 28; k++) {
    const t = (k / 28) * Math.PI * 2;
    pts.push(new THREE.Vector3(HS * Math.pow(Math.sin(t), 3), HS * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16, 0));
  }
  head.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 28, 0.0075, 5, true), at(CM, [-0.01, 0, 0]), { color: CURL, flat: 1 });
  for (const [x, y, dx, dy] of [[0.06, -0.01, 0.05, 0.035], [0.07, -0.035, 0.05, 0.02]]) {
    head.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(x, y, 0), new THREE.Vector3(x + dx * 0.5, y + dy * 0.3 + 0.01, 0), new THREE.Vector3(x + dx, y + dy, 0)]), 8, 0.0065, 5, false), at(CM, [0, 0, 0]), { color: CURL, flat: 1 });
  }

  const makeEar = () => {
    const e = new Baker();
    e.add(sphere(), xf([0, 0, 0], [0, 0, 0], [0.15, 0.15, 0.07]), { color: PEACH, outline: 0.026 });
    e.add(sphere(), xf([0, -0.005, 0.05], [0, 0, 0], [0.09, 0.09, 0.02]), { color: PINK_IN, flat: 0.5 });
    return e;
  };
  const makeArm = () => {                                    // a stubby arm and a round paw (held together at the chest by default, see layout.armRest*)
    const a = new Baker();
    a.add(capsule(0.07, 0.07), xf([0, -0.09, 0]), { color: PEACH, outline: 0.026 });
    a.add(sphere(), xf([0, -0.22, 0.02], [0, 0, 0], [0.09, 0.085, 0.09]), { color: PEACH_LIGHT, outline: 0.024 });
    return a;
  };
  const makeLeg = () => {
    const l = new Baker();
    l.add(capsule(0.075, 0.03), xf([0, -0.07, 0]), { color: PEACH, outline: 0.026 });
    l.add(sphere(), xf([0, -0.135, 0.045], [0, 0, 0], [0.1, 0.055, 0.14]), { color: PEACH_DARK, outline: 0.026 });
    return l;
  };
  const makeWing = (side) => {                               // small white angel wing: four overlapping flat feathers fanning out and down, built for `side`
    const w = new Baker();
    const f = (x, y, sx, sy, rz, c) => w.add(sphere(), xf([x * side, y, 0], [0, 0, rz * side], [sx, sy, 0.016]), { color: c, outline: 0.012 });
    f(0.03, 0.02, 0.05, 0.05, 0, WHITE3);
    f(0.09, 0.115, 0.1, 0.055, 0.7, FEATHER);
    f(0.145, 0.05, 0.11, 0.055, 0.35, WHITE3);
    f(0.165, -0.015, 0.11, 0.053, 0.0, FEATHER);
    f(0.145, -0.075, 0.095, 0.046, -0.4, WHITE3);
    return w;
  };
  return {
    body, head, earL: makeEar(), earR: makeEar(), armL: makeArm(), armR: makeArm(), legL: makeLeg(), legR: makeLeg(), wingL: makeWing(1), wingR: makeWing(-1),
    layout: {
      headY: 0.92, shoulder: [0.2, 0.55, 0.05], hip: [0.12, 0.19, 0], tailPivot: [0, 0.3, -0.25], earPivot: [0.33, 0.25, -0.02], earTilt: -0.3, earYaw: 0, handDrop: -0.22, height: 1.36, earGain: 0.4,
      armRestX: -1.15, armRestZ: -0.62, wingPivot: [0.12, 0.56, -0.19], wingYaw: 0.35, wingTilt: 0.1,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Park Zyoni the unicorn (Step 64e), a QUADRUPED. Rig mapping: armL / armR = the FRONT legs, legL / legR = the HIND legs, all four (and the tail) in the torso so the sit pitch carries them.
// Tunables: yellow coat ZY, the horn (cone 0.065 x 0.22 at HORN_BASE, tilt HORN_TILT, 3 rings), the cloud mane puff lists (top / fringe / neck crest), heart eye size `HE`, the muzzle ellipsoid MR,
// the blaze pieces, ear cones, hooves (leg length 0.3, hoof [0.088, 0.05, 0.095], sole dots) and the tail (9 stripes + pompom). Sit: layout.sit = { pitch, pivot [y, z], stretch, splay, headComp }.
// ---------------------------------------------------------------------------------------------
const HORN_BASE = [0, 0.38, 0.06], HORN_TILT = 0.25, HORN_LEN = 0.22, HORN_R = 0.065;
function buildParkzyoni() {
  const ZY = '#ffee8c', ZY_DARK = '#f6dd6a', LAVM = '#bda9f4', LAVM2 = '#ad98ee', MUZ = '#c4a6f4', MUZ_DARK = '#7a56b8', HOOF = '#c6a8f0', SOLE = '#d9c4fa', PINKZ = '#f8a6cc';
  const BLUE = '#4aa3f0', BLUE_RIM = '#2b6fc4', GOLD = '#f7c93c', GOLD_DARK = '#d99a10', WHITE4 = '#ffffff';

  // body: a short barrel (chest + rump), a neck rising to the head, the cloud mane crest down the back of the neck
  const body = new Baker();
  body.add(sphere(), xf([0, 0.43, 0.12], [0, 0, 0], [0.25, 0.25, 0.26]), { color: ZY, outline: 0.03 });
  body.add(sphere(), xf([0, 0.38, -0.12], [0, 0, 0], [0.26, 0.24, 0.27]), { color: ZY, outline: 0.028 });
  body.add(sphere(), xf([0, 0.57, 0.2], [0.3, 0, 0], [0.17, 0.22, 0.17]), { color: ZY, outline: 0.026 });
  for (const [y, z, r] of [[0.74, 0.1, 0.095], [0.67, 0.05, 0.085], [0.6, -0.02, 0.078], [0.54, -0.1, 0.07]]) {
    body.add(sphere(), xf([0, y, z], [0, 0, 0], [r * 0.85, r, r]), { color: LAVM, outline: 0.014 });
  }

  // legs: yellow stump + lavender hoof; the SOLE (a pale disc with white polka dots) is the bottom face, so it faces the viewer when a hind leg lies forward
  const makeLeg = (side) => {
    const l = new Baker();
    l.add(capsule(0.092, 0.1), xf([0, -0.09, 0]), { color: ZY, outline: 0.026 });                                       // chunky leg...
    l.add(sphere(), xf([0, -0.19, 0.005], [0, 0, 0], [0.118, 0.085, 0.118]), { color: ZY, outline: 0.026 });            // ...flaring out towards the hoof (like the sheet)
    l.add(sphere(), xf([0, -0.255, 0.005], [0, 0, 0], [0.128, 0.058, 0.132]), { color: HOOF, outline: 0.024 });
    l.add(cyl(16), xf([0, -0.302, 0.005], [0, 0, 0], [0.12, 0.01, 0.124]), { color: SOLE, flat: 0.5 });
    for (const [x, z, r] of [[0, 0, 0.026], [0.06, 0.054, 0.02], [-0.06, 0.054, 0.02], [0.056, -0.06, 0.019], [-0.056, -0.06, 0.019]]) {
      l.add(sphereLo(), xf([x, -0.304, z + 0.005], [0, 0, 0], [r, 0.007, r]), { color: WHITE4, flat: 1 });
    }
    l.add(sphereLo(), xf([0.118 * side, -0.255, 0.035], [0, 0, 0], [0.008, 0.018, 0.018]), { color: WHITE4, flat: 1 });   // polka dots on the outer side of the hoof
    l.add(sphereLo(), xf([0.1 * side, -0.24, -0.06], [0, 0, 0], [0.008, 0.014, 0.014]), { color: WHITE4, flat: 1 });
    return l;
  };

  // tail: a thin curling tail of alternating lavender / yellow stripes ending in a fluffy pink pompom (pivot at the rump; it swishes about Y)
  const tailB = new Baker();
  const tp = [[0, 0.0, -0.03], [0, 0.0, -0.1], [0, 0.03, -0.165], [0, 0.085, -0.215], [0, 0.155, -0.24], [0, 0.23, -0.235], [0, 0.295, -0.21]];
  const seg = [];
  for (let k = 0; k < tp.length - 1; k++) for (const t of [0, 0.5]) seg.push(tp[k].map((v, i) => v + (tp[k + 1][i] - v) * t));
  seg.forEach((p, i) => tailB.add(sphere(), xf(p, [0, 0, 0], [0.036, 0.036, 0.036]), { color: i % 2 ? ZY : LAVM, outline: 0.014 }));
  const pe = [0, 0.345, -0.18];
  tailB.add(sphere(), xf(pe, [0, 0, 0], [0.07, 0.07, 0.07]), { color: PINKZ, outline: 0.016 });
  for (const [dx, dy, dz] of [[0.06, 0.02, 0], [-0.06, 0.02, 0], [0, 0.07, 0], [0, -0.04, -0.05], [0, 0.02, 0.06], [0, 0.03, -0.06]]) {
    tailB.add(sphereLo(), xf([pe[0] + dx, pe[1] + dy, pe[2] + dz], [0, 0, 0], [0.04, 0.04, 0.04]), { color: PINKZ, outline: 0.01 });
  }

  // head: wide ellipsoid; the white blaze, big lavender muzzle, heart eyes, pointed ears, the cloud mane + the golden horn all merge into this one mesh
  const head = new Baker();
  const A = 0.4, B = 0.34, C = 0.36;
  head.add(sphere(), xf([0, 0, 0], [0, 0, 0], [A, B, C]), { color: ZY, outline: 0.034 });
  // the blaze: overlapping white ovals from the forehead down to the muzzle, each hugging the head surface at its own spot
  for (const [y, hw] of [[0.2, 0.085], [0.14, 0.085], [0.08, 0.08], [0.02, 0.075], [-0.04, 0.072], [-0.1, 0.075]]) {
    head.add(sphere(), at(surf(A, B, C, 0, y, 0.003), [0, 0, 0], [0, 0, 0], [hw, 0.05, 0.012]), { color: WHITE4, flat: 1 });
  }
  // the big muzzle
  const MR = [0.17, 0.125, 0.13];
  const MM = surf(A, B, C, 0, -0.15, -0.065);
  head.add(sphere(), at(MM, [0, 0, 0], [0, 0, 0], MR), { color: MUZ, outline: 0.022 });
  head.add(new THREE.TorusGeometry(0.03, 0.007, 4, 9, Math.PI), at(MM, [0, -0.035, ez(...MR, 0, -0.065) + 0.003], [0, 0, Math.PI]), { color: MUZ_DARK, flat: 1 });
  // heart-shaped blue eyes (a darker rim heart, the main heart, two white highlights); every piece carries the blink flag
  const HE = 0.075;
  for (const side of [-1, 1]) {
    const place = surf(A, B, C, 0.185 * side, 0.03, -0.005);
    const cy = yOf(place);
    const heart = (s, color, t, lift, dy = 0) => {
      const m = at(place, [0, dy, lift]);
      for (const sx of [-1, 1]) head.add(sphereLo(), at(m, [0.5 * s * sx, 0.3 * s, 0], [0, 0, 0], [0.5 * s, 0.5 * s, t]), { color, flat: 1, eye: cy });
      head.add(box(), at(m, [0, -0.05 * s, 0], [0, 0, Math.PI / 4], [1.12 * s, 1.12 * s, t * 1.6]), { color, flat: 1, eye: cy });
    };
    heart(HE * 1.16, BLUE_RIM, 0.024, 0, -0.004);
    heart(HE, BLUE, 0.032, 0.004);
    head.add(sphereLo(), at(place, [-0.3 * HE, 0.42 * HE, 0.034], [0, 0, 0], [0.2 * HE, 0.22 * HE, 0.012]), { color: WHITE4, flat: 1, eye: cy });
    head.add(sphereLo(), at(place, [0.34 * HE, -0.3 * HE, 0.034], [0, 0, 0], [0.09 * HE, 0.09 * HE, 0.012]), { color: WHITE4, flat: 1, eye: cy });
  }
  // ears: pointed cones leaning outward from the head's top corners, pink inside
  for (const s of [-1, 1]) {
    const dir = [Math.sin(0.9) * s, Math.cos(0.9)];
    const b0 = [0.28 * s, 0.22, -0.03];
    head.add(new THREE.ConeGeometry(1, 1, 10), xf([b0[0] + dir[0] * 0.1, b0[1] + dir[1] * 0.1, b0[2]], [0, 0, -0.9 * s], [0.1, 0.2, 0.045]), { color: ZY, outline: 0.02 });
    head.add(new THREE.ConeGeometry(1, 1, 10), xf([b0[0] + dir[0] * 0.095, b0[1] + dir[1] * 0.095, b0[2] + 0.03], [0, 0, -0.9 * s], [0.062, 0.15, 0.02]), { color: PINKZ, flat: 0.6 });
  }
  // the cloud mane: a cluster on top round the horn's base, a scalloped fringe over the forehead
  for (const [x, y, z, r] of [[0, 0.31, -0.02, 0.14], [0.14, 0.29, -0.03, 0.12], [-0.14, 0.29, -0.03, 0.12], [0.25, 0.2, -0.03, 0.1], [-0.25, 0.2, -0.03, 0.1],
    [0, 0.27, -0.15, 0.13], [0.13, 0.25, -0.14, 0.11], [-0.13, 0.25, -0.14, 0.11]]) {
    head.add(sphere(), xf([x, y, z], [0, 0, 0], [r, r * 0.8, r * 0.85]), { color: (x + y) > 0.4 ? LAVM : LAVM2, outline: 0.014 });
  }
  for (const [x, y, r] of [[-0.22, 0.17, 0.085], [-0.11, 0.22, 0.09], [0, 0.25, 0.095], [0.11, 0.22, 0.09], [0.22, 0.17, 0.085], [-0.08, 0.3, 0.08], [0.08, 0.3, 0.08]]) {
    head.add(sphere(), at(surf(A, B, C, x, y, 0.02), [0, 0, 0], [0, 0, 0], [r, r * 0.82, r * 0.7]), { color: LAVM, outline: 0.014 });
  }
  // the golden horn: a cone pointing up and a little forward, three ring bumps spiralling up it
  const hd = [0, Math.cos(HORN_TILT), Math.sin(HORN_TILT)];
  const along = (t) => HORN_BASE.map((v, i) => v + hd[i] * HORN_LEN * t);
  head.add(new THREE.ConeGeometry(1, 1, 12), xf(along(0.5), [HORN_TILT, 0, 0], [HORN_R, HORN_LEN, HORN_R]), { color: GOLD, outline: 0.014 });
  [0.34, 0.54, 0.74].forEach((t, i) => {
    const r = HORN_R * (1 - t) * 1.2 + 0.006;
    head.add(cyl(12), xf(along(t), [HORN_TILT, i * 0.5, 0], [r, 0.014, r]), { color: i % 2 ? GOLD : GOLD_DARK, flat: 0.5 });
  });

  return {
    body, head, tailB, armL: makeLeg(1), armR: makeLeg(-1), legL: makeLeg(1), legR: makeLeg(-1),
    layout: {
      quad: true, headY: 0.72, headZ: 0.24, shoulder: [0.14, 0.3, 0.22], hip: [0.17, 0.3, -0.2], tailPivot: [0, 0.42, -0.34], handDrop: -0.28, height: 1.32,
      armRestX: 0, armRestZ: 0.02, legRestZ: 0.02, hornTip: along(1),
      sit: { pitch: 0.62, pivot: [0.2, -0.22], stretch: 0.27, splay: 0.5, headComp: 1.0, hindLower: 0.07, shift: 0.2 },
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Myodette the penguin (Step 64f). Tunables: lavender LAVP (head, flippers), the fur puff (core ellipsoid [0.36, 0.27, 0.33] + rings of lumps: mid y 0.32 x12 r 0.15, upper y 0.53 x9 r 0.13, lower y 0.19 x10 r 0.1, cap),
// the dots (6 on the front lumps, r 0.024), the face mask (two round patches of small discs, centres x +-0.115, radius about 0.12, bridged in the middle), eyes (w 0.066, h 0.082, x 0.115), the beak (ellipsoid
// [0.082, 0.042, 0.065] + mouth line), the head tuft (3 strokes, top-right), flippers (ellipsoid [0.05, 0.13, 0.085], layout armRestZ 0.95), feet (flat ellipsoid + 3 toes, hip pivot straight above the foot at z 0.3)
// ---------------------------------------------------------------------------------------------
function buildMyodette() {
  const LAVP = '#aeaaf0', LAVP_DARK = '#9b97e6', MARK = '#6a64c8', FLUFF = '#cdeefe', FLUFF2 = '#bce4fb', FLUFF3 = '#dcf4ff', MINT = '#8fdcbb', MINT_DARK = '#7ad0ac', MINT_LINE = '#3d6d5e', WHITEP = '#ffffff';
  const body = new Baker();
  body.add(sphere(), xf([0, 0.33, 0], [0, 0, 0], [0.36, 0.22, 0.33]), { color: FLUFF, outline: 0.03 });
  const lumps = [];                                            // the scalloped rim: overlapping fur lumps, each with its own thin outline (like Im Nabong's cloud, but bigger)
  const ring = (y, rx, rz, n, r, off, ry = 0.76, outline = 0) => {     // (only the widest ring gets a thin outline, for the silhouette: per-lump hulls draw dark seams where lumps overlap)
    for (let k = 0; k < n; k++) {
      const a = off + (k / n) * Math.PI * 2;
      const c = [rx * Math.sin(a), y, rz * Math.cos(a)];
      lumps.push({ c, a, r, ry });
      body.add(sphereLo(), xf(c, [0, 0, 0], [r, r * ry, r]), { color: k % 3 === 0 ? FLUFF3 : k % 3 === 1 ? FLUFF : FLUFF2, outline });
    }
  };
  ring(0.28, 0.36, 0.33, 12, 0.15, 0, 0.76, 0.006);
  ring(0.45, 0.27, 0.25, 9, 0.13, 0.3);
  ring(0.16, 0.3, 0.24, 10, 0.1, 0.15);
  body.add(sphereLo(), xf([0, 0.53, 0], [0, 0, 0], [0.17, 0.1, 0.16]), { color: FLUFF3 });
  for (const i of [0, 1, 11, 2, 12, 21]) {                    // little white dots on the front lumps (sheet: small circles on the puff)
    const L = lumps[i], d = new THREE.Vector3(Math.sin(L.a), 0.3, Math.cos(L.a)).normalize();
    body.add(sphereLo(), xf([L.c[0] + d.x * L.r * 0.97, L.c[1] + d.y * L.r * L.ry * 0.97, L.c[2] + d.z * L.r * 0.97], [0, 0, 0], [0.024, 0.024, 0.012]), { color: WHITEP, flat: 1 });
  }

  const head = new Baker();
  const A = 0.4, B = 0.37, C = 0.37;
  head.add(sphere(), xf([0, 0, 0], [0, 0, 0], [A, B, C]), { color: LAVP, outline: 0.034 });
  // the white face mask: two round patches round the eyes that join in the middle; every disc sits on the head at its own spot (the eyes sit OVER them)
  // (one smooth, fairly deep ellipsoid per patch, sunk into the head so its rim meets the surface cleanly and its centre stays under the eye)
  const disc = (x, y, r, ry = 1, lift = -0.022, d = 0.042) => head.add(sphere(), at(surf(A, B, C, x, y, lift), [0, 0, 0], [0, 0, 0], [r, r * ry, d]), { color: WHITEP, flat: 1 });
  for (const s of [-1, 1]) disc(0.165 * s, -0.012, 0.125, 1.02);
  disc(0, -0.085, 0.07, 0.8);
  roundEyes(head, A, B, C, 0.165, 0.025, { w: 0.074, h: 0.092, iris: '#43261f' });
  // the mint beak: small, wide and flat, with a thin darker mouth line
  const BK = surf(A, B, C, 0, -0.125, 0);
  head.add(sphere(), at(BK, [0, 0, 0.025], [0.15, 0, 0], [0.104, 0.052, 0.08]), { color: MINT, outline: 0.014 });
  head.add(sphereLo(), at(BK, [0, -0.008, 0.099], [0.15, 0, 0], [0.084, 0.006, 0.014]), { color: MINT_LINE, flat: 1 });
  head.add(sphereLo(), at(BK, [0, 0.02, 0.094], [0.15, 0, 0], [0.05, 0.01, 0.014]), { color: '#b6ecd2', flat: 1 });     // a pale ridge on the top of the beak
  // the little feather tuft on the top right of the head (three short strokes)
  for (const [x, y, rz] of [[0.13, 0.3, -0.4], [0.17, 0.282, -0.6], [0.21, 0.255, -0.85]]) {
    head.add(sphereLo(), at(surf(A, B, C, x, y, 0.003), [0, 0, 0], [0, 0, rz], [0.007, 0.04, 0.01]), { color: MARK, flat: 1 });
  }

  const makeArm = () => {                                      // a small lavender flipper, a flat paddle sticking out from just above the puff
    const a = new Baker();
    a.add(sphere(), xf([0, -0.012, 0], [0, 0, 0], [0.06, 0.06, 0.07]), { color: LAVP, outline: 0.024 });
    a.add(sphere(), xf([0, -0.105, 0.005], [0, 0, 0], [0.05, 0.13, 0.085]), { color: LAVP_DARK, outline: 0.024 });
    return a;
  };
  const makeLeg = () => {                                      // a mint webbed foot: a flat pad and three rounded toes (the hip pivot is straight above the foot, so the swing barely scrapes the ground)
    const l = new Baker();
    l.add(capsule(0.04, 0.03), xf([0, -0.07, 0]), { color: MINT_DARK, outline: 0.02 });
    l.add(sphere(), xf([0, -0.125, 0.06], [0, 0, 0], [0.095, 0.026, 0.13]), { color: MINT, outline: 0.02 });
    for (const [dx, ry] of [[-0.062, 0.45], [0, 0], [0.062, -0.45]]) l.add(sphere(), xf([dx, -0.125, 0.17], [0, ry, 0], [0.044, 0.025, 0.058]), { color: MINT, outline: 0.016 });
    return l;
  };
  return {
    body, head, armL: makeArm(), armR: makeArm(), legL: makeLeg(), legR: makeLeg(),
    layout: {
      headY: 0.93, shoulder: [0.31, 0.57, 0.02], hip: [0.13, 0.15, 0.04], tailPivot: [0, 0.25, -0.36], handDrop: -0.22, height: 1.3, armRestZ: 0.95, armRestX: -0.05, legRestZ: 0,
    },
  };
}

/** One table, one builder per friend: 64b-64i add their entry here. */
const BUILDERS = { imnabong: buildImnabong, yubbuibbui: buildYubbuibbui, mokuring: buildMokuring, shyamshyam: buildShyamshyam, parkzyoni: buildParkzyoni, myodette: buildMyodette };

// ---------------------------------------------------------------------------------------------
// Pouch items: tiny models (own mesh, no shadow). 'carrot' = an orange cone pointing down into the pouch with green leaves; anything else is a little round bundle.
// ---------------------------------------------------------------------------------------------
function buildPouchItem(id) {
  const b = new Baker();
  if (id === 'carrot') {
    b.add(new THREE.ConeGeometry(1, 1, 10), xf([0, 0.05, 0], [Math.PI, 0, 0], [0.05, 0.17, 0.05]), { color: CARROT, outline: 0.012 });     // tip down
    b.add(cyl(10), xf([0, 0.1, 0], [0, 0, 0], [0.052, 0.012, 0.052]), { color: CARROT_DARK });                                           // a ring line near the top
    for (const [x, z, rz, rx, c] of [[0, 0.0, 0, 0, LEAF], [-0.02, 0, 0.5, 0, LEAF_DARK], [0.02, 0, -0.5, 0, LEAF_DARK], [0, 0.015, 0, -0.45, LEAF]]) {
      b.add(sphereLo(), xf([x, 0.17, z], [rx, 0, rz], [0.014, 0.07, 0.011]), { color: c, outline: 0.006 });                                // the leaf blades
    }
  } else {
    b.add(sphere(), xf([0, 0.05, 0], [0, 0, 0], [0.075, 0.075, 0.075]), { color: '#ffd9a0', outline: 0.012 });                           // a generic little bundle
    b.add(sphereLo(), xf([0, 0.12, 0], [0, 0, 0], [0.025, 0.03, 0.025]), { color: '#e9a25f' });
  }
  return b;
}

// ---------------------------------------------------------------------------------------------
export const TDOONG_BUILDERS = Object.keys(BUILDERS);

export function createTdoongModel(id) {
  const build = BUILDERS[id];
  if (!build) throw new Error(`createTdoongModel: no model for "${id}" yet`);
  const spec = build();
  const L = spec.layout;
  const blink = { value: 1 };
  const mat = makeToon(blink, `tdoong-${id}-toon`);
  const baked = [];
  const bake = (b) => { const e = b.build(); baked.push(e); return e; };
  const meshes = [];
  const add = (parent, baker, name, cast) => {
    const m = castMesh(bake(baker).geo, mat, cast);
    m.name = name;
    parent.add(m);
    meshes.push(m);
    return m;
  };

  const root = new THREE.Group();
  root.name = `tdoong-${id}`;
  const rig = new THREE.Group();
  rig.name = 'rig';
  root.add(rig);
  const torso = new THREE.Group();
  torso.name = 'torso';
  rig.add(torso);
  add(torso, spec.body, `${id}-body`, true);

  const headGroup = new THREE.Group();
  headGroup.name = 'headGroup';
  headGroup.position.set(0, L.headY, L.headZ ?? 0);
  torso.add(headGroup);
  add(headGroup, spec.head, `${id}-head`, true);

  const ears = [];
  if (spec.earL) {
    for (const [side, baker, name] of [[1, spec.earL, 'earL'], [-1, spec.earR, 'earR']]) {
      const g = new THREE.Group();
      g.name = name;
      g.position.set(L.earPivot[0] * side, L.earPivot[1], L.earPivot[2]);
      g.userData.restZ = side * L.earTilt;
      g.userData.restY = side * L.earYaw;
      g.rotation.set(0, g.userData.restY, g.userData.restZ);
      headGroup.add(g);
      add(g, baker, `${id}-${name}`, false);
      ears.push(g);
    }
  }

  const makeLimb = (side, baker, name, pos, restZ) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(pos[0] * side, pos[1], pos[2]);
    g.userData.restZ = restZ * side;
    g.userData.restPosY = pos[1];
    g.rotation.z = g.userData.restZ;
    (name.startsWith('leg') && !L.quad ? rig : torso).add(g);
    add(g, baker, `${id}-${name}`, false);
    return g;
  };
  const armRestZ = L.armRestZ ?? 0.22, armRestX = L.armRestX ?? -0.05;
  const armL = makeLimb(1, spec.armL, 'armL', L.shoulder, armRestZ);
  const armR = makeLimb(-1, spec.armR, 'armR', L.shoulder, armRestZ);
  for (const a of [armL, armR]) { a.userData.restX = armRestX; a.rotation.x = armRestX; }
  const legL = makeLimb(1, spec.legL, 'legL', L.hip, L.legRestZ ?? 0.04);
  const legR = makeLimb(-1, spec.legR, 'legR', L.hip, L.legRestZ ?? 0.04);
  const handL = new THREE.Group(), handR = new THREE.Group();
  handL.name = 'handL'; handR.name = 'handR';
  handL.position.set(0, L.handDrop, 0.02); handR.position.set(0, L.handDrop, 0.02);
  armL.add(handL); armR.add(handR);

  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.set(...L.tailPivot);
  (L.quad ? torso : rig).add(tail);
  if (spec.tailB) add(tail, spec.tailB, `${id}-tail`, false);

  let hornSocket = null;                                     // a socket at the horn's tip (Park Zyoni; a future companion attack)
  if (L.hornTip) {
    hornSocket = new THREE.Group();
    hornSocket.name = 'hornSocket';
    hornSocket.position.set(...L.hornTip);
    headGroup.add(hornSocket);
  }
  // Quadruped sit pose (layout.sit): the torso pitches up about `pivot` ([y, z], the rump) and the rig sinks by `drop` so the lowest point of the body ends on the ground; the runtime blends
  // it with a factor (torso.position = pivot - R * pivot). `drop` is measured from the baked body vertices at the full pitch.
  let sit = null;
  if (L.sit) {
    sit = { ...L.sit, drop: 0 };
    const c = Math.cos(-sit.pitch), sn = Math.sin(-sit.pitch), [py, pz] = sit.pivot, pa = meshes[0].geometry.attributes.position;
    let lo = Infinity;
    for (let i = 0; i < pa.count; i++) { const dy = pa.getY(i) - py, dz = pa.getZ(i) - pz; lo = Math.min(lo, py + dy * c - dz * sn); }
    sit.drop = lo;
  }

  const wings = [];
  if (spec.wingL) {
    for (const [side, baker, name] of [[1, spec.wingL, 'wingL'], [-1, spec.wingR, 'wingR']]) {
      const g = new THREE.Group();
      g.name = name;
      g.position.set(L.wingPivot[0] * side, L.wingPivot[1], L.wingPivot[2]);
      g.userData.restY = side * L.wingYaw;
      g.userData.restZ = side * L.wingTilt;
      g.rotation.set(0, g.userData.restY, g.userData.restZ);
      torso.add(g);
      add(g, baker, `${id}-${name}`, false);
      wings.push(g);
    }
  }

  let pouch = null, pouchSocket = null, pouchMesh = null;
  if (spec.pouch) {
    pouch = new THREE.Group();
    pouch.name = 'pouch';
    pouch.position.set(...L.pouchPos);
    torso.add(pouch);
    add(pouch, spec.pouch, `${id}-pouch`, false);
    pouchSocket = new THREE.Group();
    pouchSocket.name = 'pouchSocket';
    pouchSocket.position.set(...L.pouchSocket);
    pouch.add(pouchSocket);
  }

  const model = {
    id, root, rig, torso, headGroup, armL, armR, legL, legR, handL, handR, ears, tail, wings, hornSocket, sit, earGain: L.earGain ?? 1, pouch, pouchSocket, pouchItem: null, pouchItemId: null,
    height: L.height,
    get drawCalls() { let n = 0; for (const m of meshes) n += m.castShadow ? 2 : 1; return n; },
    setPouch(itemId) {
      if (!pouchSocket) return;
      if (model.pouchItem) {
        const old = model.pouchItem;
        pouchSocket.remove(old);
        const i = meshes.indexOf(pouchMesh);
        if (i >= 0) meshes.splice(i, 1);
        pouchMesh.geometry.dispose();
        const bi = baked.findIndex((e) => e.geo === pouchMesh.geometry);
        if (bi >= 0) baked.splice(bi, 1);
        pouchMesh = null; model.pouchItem = null; model.pouchItemId = null;
      }
      if (!itemId) return;
      const g = new THREE.Group();
      g.name = 'pouchItem';
      g.userData.restY = 0;
      g.rotation.z = -0.18;
      pouchSocket.add(g);
      pouchMesh = add(g, buildPouchItem(itemId), `${id}-pouch-${itemId}`, false);
      model.pouchItem = g;
      model.pouchItemId = itemId;
    },
    setBlink(closed) { blinkAmt = closed; applyEyes(); },
    setExpression(name) { expr = name; applyEyes(); },
    get expression() { return expr; },
    dispose() { for (const e of baked) e.geo.dispose(); mat.dispose(); },
  };
  // The lids are the max of the blink and the expression's floor (happy squints into ^^, sleepy droops)
  let blinkAmt = 0, expr = 'normal';
  const FLOOR = { normal: 0, happy: 0.8, sleepy: 0.5 };
  function applyEyes() {
    const closed = Math.max(blinkAmt, FLOOR[expr] ?? 0);
    blink.value = 1 - 0.88 * Math.min(1, closed);
  }
  model.setPouch(spec.defaultPouch || null);
  return model;
}
