// Chibi villager built from primitives. Convention: model faces +Z (yaw 0), feet at y = 0, ~1.65u tall
// including the leaf sprout. The character's left arm/leg is on +X.
//
// Hierarchy (all pivots are where the joint would be so procedural animation just rotates them):
//   root
//    |- blob            soft blob shadow (kept on the ground; the player tilts/scales it)
//    '- rig             squash/stretch + lean pivot, origin at the feet
//        |- torso       bobbing group -> body, armL, armR, headGroup
//        |    '- headGroup -> head, hat(+sprout), eyes(eyeL,eyeR), blush, mouth
//        '- legL, legR  hip pivots (with shoes)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMat, addOutline } from '../render/toon.js';

const SKIN = '#ffd9b8';
const SHIRT_DEFAULT = '#ff7c6b';   // coral (P1)
const PANTS_DEFAULT = '#3f9fbf';   // teal-blue
const SHOE = '#7a4b3a';
const HAT_DEFAULT = '#ffd85e';     // butter yellow beanie
const CUFF_DEFAULT = '#ffb347';
const LEAF = '#7be05e';
const BLUSH = '#ff8fb3';
const EYE = '#241a33';

const HEAD_R = 0.44;
const HEAD_SCALE = new THREE.Vector3(1.05, 0.94, 1.0);
const HEAD_Y = 1.0;

function makeBlobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(30,20,50,0.55)');
  grad.addColorStop(0.55, 'rgba(30,20,50,0.38)');
  grad.addColorStop(1, 'rgba(30,20,50,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function mesh(geo, color, { outline = 0, cast = true } = {}) {
  const m = new THREE.Mesh(geo, toonMat(color));
  m.castShadow = cast;
  if (outline) addOutline(m, outline);
  return m;
}

/** Point on the head ellipsoid at (x, y) in head-local space (z chosen to sit on the surface) plus its normal. */
function headSurface(x, y, lift = 0) {
  const a = HEAD_R * HEAD_SCALE.x, b = HEAD_R * HEAD_SCALE.y, c = HEAD_R * HEAD_SCALE.z;
  const t = 1 - (x / a) ** 2 - (y / b) ** 2;
  const z = c * Math.sqrt(Math.max(t, 0.0001));
  const n = new THREE.Vector3(x / (a * a), y / (b * b), z / (c * c)).normalize();
  const p = new THREE.Vector3(x, y, z).addScaledVector(n, lift);
  return { p, n };
}

function placeOnHead(obj, x, y, lift = 0) {
  const { p, n } = headSurface(x, y, lift);
  obj.position.copy(p);
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  return obj;
}

/** @param {{hat?:string, cuff?:string, shirt?:string, pants?:string}} [colors] colour scheme (defaults = the original P1 look) */
export function createCharacter(colors = {}) {
  const SHIRT = colors.shirt || SHIRT_DEFAULT, PANTS = colors.pants || PANTS_DEFAULT;
  const HAT = colors.hat || HAT_DEFAULT, CUFF = colors.cuff || CUFF_DEFAULT;
  const root = new THREE.Group();
  root.name = 'player';
  const rig = new THREE.Group();
  rig.name = 'rig';
  root.add(rig);

  // ---- Blob shadow
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: makeBlobTexture(), transparent: true, depthWrite: false, fog: true,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    })
  );
  blob.name = 'blob-shadow';
  blob.position.y = 0.05;
  blob.renderOrder = 2;
  root.add(blob);

  const torso = new THREE.Group();
  torso.name = 'torso';
  rig.add(torso);

  // ---- Body (rounded shirt blob)
  const body = mesh(new THREE.SphereGeometry(0.3, 24, 16), SHIRT, { outline: 0.03 });
  body.name = 'body';
  body.scale.set(1.0, 0.95, 0.9);
  body.position.y = 0.55;
  torso.add(body);

  // ---- Arms (pivot at the shoulder; arm hangs along -Y)
  const makeArm = (side) => {
    const g = new THREE.Group();
    g.name = side > 0 ? 'armL' : 'armR';
    g.position.set(0.32 * side, 0.7, 0);
    const sleeve = mesh(new THREE.CapsuleGeometry(0.09, 0.1, 6, 12), SHIRT, { outline: 0.028 });
    sleeve.position.y = -0.1;
    g.add(sleeve);
    const hand = mesh(new THREE.SphereGeometry(0.085, 14, 10), SKIN, { outline: 0.028, cast: false });
    hand.position.y = -0.24;
    g.add(hand);
    // Grip point for held items (Step 9): sits in the hand, arm-local axes (item +Y = along the item)
    const socket = new THREE.Object3D();
    socket.name = 'handSocket';
    socket.position.set(0, -0.25, 0.02);
    g.add(socket);
    g.userData.handSocket = socket;
    g.rotation.z = 0.22 * side;
    g.userData.restZ = g.rotation.z;
    torso.add(g);
    return g;
  };
  const armL = makeArm(1);
  const armR = makeArm(-1);

  // ---- Legs (pivot at the hip, outside the torso group so hip stays planted while the body bobs)
  const makeLeg = (side) => {
    const g = new THREE.Group();
    g.name = side > 0 ? 'legL' : 'legR';
    g.position.set(0.14 * side, 0.36, 0);
    const leg = mesh(new THREE.CapsuleGeometry(0.09, 0.1, 6, 12), PANTS, { outline: 0.028 });
    leg.position.y = -0.14;
    g.add(leg);
    const shoe = mesh(new THREE.SphereGeometry(1, 16, 12), SHOE, { outline: 0.028, cast: false });
    shoe.scale.set(0.115, 0.08, 0.16);
    shoe.position.set(0, -0.285, 0.045);
    g.add(shoe);
    rig.add(g);
    return g;
  };
  const legL = makeLeg(1);
  const legR = makeLeg(-1);

  // ---- Head
  const headGroup = new THREE.Group();
  headGroup.name = 'headGroup';
  headGroup.position.y = HEAD_Y;
  torso.add(headGroup);

  const head = mesh(new THREE.SphereGeometry(HEAD_R, 32, 24), SKIN, { outline: 0.035 });
  head.name = 'head';
  head.scale.copy(HEAD_SCALE);
  headGroup.add(head);

  // Ears (tiny nubs)
  for (const s of [-1, 1]) {
    const ear = mesh(new THREE.SphereGeometry(0.07, 12, 10), SKIN, { cast: false });   // tiny: no outline / shadow
    ear.position.set(0.46 * s, -0.03, -0.02);
    ear.scale.set(0.6, 1, 0.8);
    headGroup.add(ear);
  }

  // Face: flat-ish features hugging the head surface
  const faceMat = {
    eye: new THREE.MeshBasicMaterial({ vertexColors: true }),
    blush: new THREE.MeshBasicMaterial({ color: BLUSH, transparent: true, opacity: 0.85, depthWrite: false }),
    mouth: new THREE.MeshBasicMaterial({ color: '#8a3d4a' }),
  };

  // One merged, vertex-coloured eye (dark ball + two white highlights) shared by both eyes.
  const eyeGeo = (() => {
    const bake = (geo, [sx, sy, sz], [px, py, pz], color) => {
      const g = geo.clone();
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)));
      const c = new THREE.Color(color);
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      return g;
    };
    const parts = [
      bake(new THREE.SphereGeometry(1, 16, 12), [0.068, 0.095, 0.03], [0, 0, 0], EYE),
      bake(new THREE.SphereGeometry(1, 10, 8), [0.024, 0.024, 0.012], [0.02, 0.036, 0.024], '#ffffff'),
      bake(new THREE.SphereGeometry(1, 8, 6), [0.012, 0.012, 0.008], [-0.02, -0.032, 0.025], '#ffffff'),
    ];
    const merged = mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());
    return merged;
  })();

  const eyes = new THREE.Group();
  eyes.name = 'eyes';
  headGroup.add(eyes);
  const makeEye = (side) => {
    const g = new THREE.Group();
    g.name = side > 0 ? 'eyeL' : 'eyeR';
    g.add(new THREE.Mesh(eyeGeo, faceMat.eye));
    placeOnHead(g, 0.155 * side, -0.02, -0.005);
    eyes.add(g);
    return g;
  };
  const eyeL = makeEye(1);
  const eyeR = makeEye(-1);
  // Blink pivots the eye group around its own centre; keep base scale for the animator.
  eyeL.userData.baseScale = eyeL.scale.clone();
  eyeR.userData.baseScale = eyeR.scale.clone();

  const blush = new THREE.Group();
  blush.name = 'blush';
  headGroup.add(blush);
  for (const side of [-1, 1]) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), faceMat.blush);
    disc.scale.set(1.25, 0.8, 1);
    placeOnHead(disc, 0.27 * side, -0.115, 0.004);
    blush.add(disc);
  }

  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.011, 6, 14, Math.PI), faceMat.mouth);
  mouth.name = 'mouth';
  mouth.rotation.z = Math.PI;            // arc opens upward -> smile
  {
    const holder = new THREE.Group();
    holder.name = 'mouthHolder';
    placeOnHead(holder, 0, -0.105, 0.004);
    holder.add(mouth);
    headGroup.add(holder);
  }

  // ---- Hat: beanie cap tilted back, with a leaf sprout
  const hat = new THREE.Group();
  hat.name = 'hat';
  hat.rotation.x = -0.28;
  headGroup.add(hat);
  const cap = mesh(new THREE.SphereGeometry(HEAD_R * 1.07, 32, 16, 0, Math.PI * 2, 0, 1.2), HAT, { outline: 0.03 });
  cap.name = 'cap';
  cap.scale.copy(HEAD_SCALE);
  cap.material = toonMat(HAT, { side: THREE.DoubleSide });
  hat.add(cap);
  // Cuff around the rim of the beanie
  const rimR = Math.sin(1.2) * HEAD_R * 1.07;
  const cuff = mesh(new THREE.TorusGeometry(rimR, 0.04, 8, 32), CUFF, { outline: 0.022, cast: false });
  cuff.name = 'cuff';
  cuff.rotation.x = Math.PI / 2;
  cuff.position.y = Math.cos(1.2) * HEAD_R * 1.07 * HEAD_SCALE.y;
  cuff.scale.set(HEAD_SCALE.x, HEAD_SCALE.z, 1);
  hat.add(cuff);

  // Sprout: stem + two leaves, swaying group rooted at the crown
  const sprout = new THREE.Group();
  sprout.name = 'sprout';
  sprout.position.y = HEAD_R * 1.07 * HEAD_SCALE.y - 0.01;
  hat.add(sprout);
  const stem = mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.18, 8), '#4fbf4a', { cast: false });
  stem.position.y = 0.08;
  sprout.add(stem);
  for (const side of [-1, 1]) {
    const leaf = mesh(new THREE.SphereGeometry(1, 12, 8), LEAF, { cast: false });
    leaf.scale.set(0.15, 0.03, 0.08);
    leaf.position.set(0.12 * side, 0.19, 0);
    leaf.rotation.z = 0.45 * side;
    sprout.add(leaf);
  }

  return {
    root,
    height: 1.65,
    parts: { rig, torso, body, head, headGroup, armL, armR, legL, legR, eyes, eyeL, eyeR, blush, mouth, hat, sprout, blob, handSocket: armR.userData.handSocket },
  };
}
