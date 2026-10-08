// Chibi villager built from primitives. Convention: model faces +Z (yaw 0), feet at y = 0, ~1.65u tall
// including the leaf sprout. The character's left arm/leg is on +X.
//
// Hierarchy (all pivots are where the joint would be so procedural animation just rotates them):
//   root
//    |- blob            soft blob shadow (kept on the ground; the player tilts/scales it)
//    '- rig             squash/stretch + lean pivot, origin at the feet
//        |- torso       bobbing group -> body mesh, armL, armR, headGroup
//        |    '- headGroup -> head mesh (head + ears + face), headSocket -> hat
//        '- legL, legR  hip pivots (leg + shoe mesh)
//
// Draw-call budget (Step 21): every rigid group is ONE merged, vertex-coloured mesh that shares one toon material per
// character: head (+face), torso, armL, armR, legL, legR = 6 meshes. The inverted-hull outline of each part is baked into the
// SAME geometry (extruded along the primitive's own normals, triangle winding reversed so the normal front-face culling
// only shows the far side of the hull), so outline + body is a single draw call. Hull/face vertices carry a per-vertex
// "mark" attribute (see MARK below) that the shader uses to draw them unlit. Only the six body meshes and the hat cast
// shadows; their custom depth material (CHAR_DEPTH) throws the hull triangles away so the shadow is the plain body.
// Result: main pass = 6 body + hat + sprout + blob = 9 draws, shadow pass = 7, total 16 per character (was 44).
//
// Blinking: the eye vertices are flagged in the head geometry and squashed around the eye centre by the `uBlink` uniform
// of the character's material (character.setBlink(closed 0..1)), so there is no extra mesh and no CPU vertex work.
//
// Hats are attachments: `parts.headSocket` (an Object3D on the head group, origin = head centre) holds the current hat.
// The default beanie + leaf sprout is built by createBeanieHat() and mounted on it. `setHat(model | null)` swaps it (returns
// the previous hat, null = bare head). NOTE: there is no hair yet, so a bare head is fine, but small hats (or none) will
// expose the top of the head: a future hair mesh / flattened "hat hair" variant belongs in the head geometry.
// A hat model is any Object3D; if it has `userData.setColors(scheme)` it is re-tinted with the character's colours.
//
// Tails (Step 36a) are attachments too: `parts.backSocket` (an Object3D on the torso group at the lower back, so a tail follows the body's
// bob, lean, twist and squash) holds the current back model (a tail from player/tails.js). `setBack(model | null)` swaps it (returns the
// previous one). Back models are drawn with the shared hatMaterial() (one extra draw call, no shadow).
//
// Colours: setColors({hat, cuff, shirt, pants}) rewrites the colour attribute of the merged meshes in place (no rebuild).
import * as THREE from 'three';
import { getGradientMap } from '../render/toon.js';
import { PALETTE } from '../config.js';
import { flashValues, patchFlash } from '../render/combatFlash.js';

const SKIN = '#ffd9b8';
const SHIRT_DEFAULT = '#ff7c6b';   // coral (P1)
const PANTS_DEFAULT = '#3f9fbf';   // teal-blue
const SHOE = '#7a4b3a';
const HAT_DEFAULT = '#ffd85e';     // butter yellow beanie
const CUFF_DEFAULT = '#ffb347';
const STEM = '#4fbf4a';
const LEAF = '#7be05e';
const BLUSH = '#ff8fb3';
// the old blush was an 0.85-alpha disc blended over the skin after tone mapping: a 10% skin mix in linear space matches it
const BLUSH_MIX = new THREE.Color(BLUSH).lerp(new THREE.Color(SKIN), 0.1);
const MOUTH = '#8a3d4a';
const EYE = '#241a33';

export const HEAD_R = 0.44;
export const HEAD_SCALE = new THREE.Vector3(1.05, 0.94, 1.0);
const HEAD_Y = 1.0;
const BLINK_DEPTH = 0.88;          // how far the eye squashes at the closed point of a blink

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

/** Point on the head ellipsoid at (x, y) in head-local space (z chosen to sit on the surface) plus its normal. */
function headSurface(x, y, lift = 0) {
  const a = HEAD_R * HEAD_SCALE.x, b = HEAD_R * HEAD_SCALE.y, c = HEAD_R * HEAD_SCALE.z;
  const t = 1 - (x / a) ** 2 - (y / b) ** 2;
  const z = c * Math.sqrt(Math.max(t, 0.0001));
  const n = new THREE.Vector3(x / (a * a), y / (b * b), z / (c * c)).normalize();
  const p = new THREE.Vector3(x, y, z).addScaledVector(n, lift);
  return { p, n };
}

/** Matrix that places something on the head surface (position on the ellipsoid, +Z along the surface normal). */
function onHead(x, y, lift = 0) {
  const { p, n } = headSurface(x, y, lift);
  return new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n), new THREE.Vector3(1, 1, 1));
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
/** compose(position, euler rotation, scale) -> Matrix4, all optional. */
export function xf(p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  _q.setFromEuler(_e.set(r[0], r[1], r[2]));
  return new THREE.Matrix4().compose(new THREE.Vector3(p[0], p[1], p[2]), _q, new THREE.Vector3(s[0], s[1], s[2]));
}

// ---- Shading: one toon material per character (+ one shared by every hat), with a per-vertex "mark" attribute
//   aMark = (flat, blink, eyeCentreY, hull)
//     flat  0 = normal toon shading, 1 = unlit flat colour (outline hull, eyes, blush, mouth); values in between mix the two
//     blink 1 = squash this vertex toward eyeCentreY by uBlink (the eyes)
//     hull  1 = outline hull triangle (drawn, but skipped by the shadow depth material)
const OUTLINE = new THREE.Color(PALETTE.outline);
const NO_BLINK = { value: 1 };

function patchShader(shader, blink) {
  shader.uniforms.uBlink = blink;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 aMark;\nuniform float uBlink;\nvarying float vFlat;')
    .replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvFlat = aMark.x;\n' +
      'transformed.y = mix(transformed.y, aMark.z + (transformed.y - aMark.z) * uBlink, aMark.y);');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vFlat;')
    .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, diffuseColor.rgb, vFlat);\n#include <opaque_fragment>');
}

/** The shared character toon material (vertex colours, aMark shader patch, stencil mark). Also used by the NPC animals (npc/models.js). */
export function makeToon(blink, name) {
  const m = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: getGradientMap(), vertexColors: true });
  m.name = name;
  const juiceFlash = flashValues(); m.userData.juiceFlash = juiceFlash;
  m.onBeforeCompile = (shader) => { patchShader(shader, blink); patchFlash(shader, juiceFlash); };
  m.customProgramCacheKey = () => 'character-toon';        // one program for every character and hat
  // Mark every visible character/hat pixel in the stencil buffer; the occluded-player silhouette (player.js) only
  // draws where this mark is missing, i.e. on body parts genuinely hidden behind scenery.
  m.stencilWrite = true;
  m.stencilRef = 1;
  m.stencilFunc = THREE.AlwaysStencilFunc;
  m.stencilZPass = THREE.ReplaceStencilOp;
  return m;
}

let _hatMat = null, _charDepth = null;
/** Shared by every hat model. The beanie shell is open, so its shadow is drawn from both sides. */
export function hatMaterial() {
  if (!_hatMat) { _hatMat = makeToon(NO_BLINK, 'hat-toon'); _hatMat.shadowSide = THREE.DoubleSide; }
  return _hatMat;
}
/** Shadow-pass material for the merged meshes: identical to the default depth material but drops the outline hull. */
function charDepth() {
  if (!_charDepth) {
    _charDepth = new THREE.MeshDepthMaterial();
    _charDepth.name = 'character-depth';
    _charDepth.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aMark;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nif (aMark.w > 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);');
    };
    _charDepth.customProgramCacheKey = () => 'character-depth';
  }
  return _charDepth;
}

// ---- Baking: primitives (+ their outline hull) -> one merged geometry
export class Baker {
  constructor() {
    this.pos = []; this.nor = []; this.col = []; this.mark = []; this.idx = [];
    this.n = 0;
    this.roles = {};                 // role name -> [[firstVertex, count], ...] of the body vertices painted with that role's colour
  }

  /**
   * @param geo     an indexed three primitive
   * @param m       Matrix4 placing it in the merged mesh's local space
   * @param o       color; role (recolour group); outline (hull thickness along the primitive's own normals, 0 = none);
   *                flat (0..1, see aMark); eye (centre y, squashed by the blink); inner (also add a reversed, inward-lit copy: open shells)
   */
  add(geo, m, { color, role = null, outline = 0, flat = 0, eye = null, inner = false }) {
    const pa = geo.attributes.position, na = geo.attributes.normal, ia = geo.index.array;
    const c = new THREE.Color(color);
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const v = new THREE.Vector3(), nv = new THREE.Vector3(), w = new THREE.Vector3();
    const count = pa.count;
    const pushVerts = (sign, hull) => {
      const base = this.n;
      for (let i = 0; i < count; i++) {
        v.fromBufferAttribute(pa, i);
        nv.fromBufferAttribute(na, i);
        if (hull) w.copy(v).addScaledVector(nv, outline).applyMatrix4(m); else w.copy(v).applyMatrix4(m);
        this.pos.push(w.x, w.y, w.z);
        nv.applyMatrix3(nm).normalize().multiplyScalar(sign);
        this.nor.push(nv.x, nv.y, nv.z);
        const k = hull ? OUTLINE : c;
        this.col.push(k.r, k.g, k.b);
        if (hull) this.mark.push(1, 0, 0, 1); else this.mark.push(flat, eye === null ? 0 : 1, eye === null ? 0 : eye, 0);
      }
      this.n += count;
      return base;
    };
    const pushTris = (base, reversed) => {
      for (let i = 0; i < ia.length; i += 3) {
        if (reversed) this.idx.push(base + ia[i], base + ia[i + 2], base + ia[i + 1]);
        else this.idx.push(base + ia[i], base + ia[i + 1], base + ia[i + 2]);
      }
    };
    const addRole = (base) => { if (role) (this.roles[role] ||= []).push([base, count]); };

    const body = pushVerts(1, false);
    pushTris(body, false);
    addRole(body);
    if (inner) {
      const b2 = pushVerts(-1, false);
      pushTris(b2, true);
      addRole(b2);
    }
    if (outline > 0) {
      const hull = pushVerts(1, true);
      pushTris(hull, true);           // reversed winding: front-face culling then shows the hull's far side (= an inverted hull)
    }
    geo.dispose();
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aMark', new THREE.Float32BufferAttribute(this.mark, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return { geo: g, roles: this.roles };
  }
}

/** Write `hex` into the colour attribute for every vertex range of `role`. */
const _c = new THREE.Color();
export function paintRole(entry, role, hex) {
  const ranges = entry.roles[role];
  if (!ranges || !hex) return;
  _c.set(hex);
  const attr = entry.geo.attributes.color, arr = attr.array;
  for (const [s, n] of ranges) {
    for (let i = s; i < s + n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  }
  attr.needsUpdate = true;
}

export function castMesh(geo, mat, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  if (cast) m.customDepthMaterial = charDepth();
  return m;
}

/**
 * The default hat: butter-yellow beanie (tilted back, with a cuff) and a swaying leaf sprout. One merged mesh (+ baked outline)
 * for the cap and cuff, one tiny mesh for the sprout, which stays its own child group so it can wiggle.
 * Returns a Group (origin = head centre, to be mounted on parts.headSocket) with
 *   userData.sprout        the swaying sprout group (player.js animates it)
 *   userData.setColors(s)  recolour hat / cuff in place
 *   userData.dispose()     free the geometries
 * @param {{hat?:string, cuff?:string}} [colors]
 */
export function createBeanieHat(colors = {}) {
  const hat = new THREE.Group();
  hat.name = 'hat';
  hat.rotation.x = -0.28;

  const b = new Baker();
  const rimR = Math.sin(1.2) * HEAD_R * 1.07;
  b.add(new THREE.SphereGeometry(HEAD_R * 1.07, 32, 16, 0, Math.PI * 2, 0, 1.2), xf([0, 0, 0], [0, 0, 0], HEAD_SCALE.toArray()),
    { color: colors.hat || HAT_DEFAULT, role: 'hat', outline: 0.03, inner: true });
  b.add(new THREE.TorusGeometry(rimR, 0.04, 8, 32), xf([0, Math.cos(1.2) * HEAD_R * 1.07 * HEAD_SCALE.y, 0], [Math.PI / 2, 0, 0], [HEAD_SCALE.x, HEAD_SCALE.z, 1]),
    { color: colors.cuff || CUFF_DEFAULT, role: 'cuff', outline: 0.022 });
  const cap = b.build();
  const capMesh = castMesh(cap.geo, hatMaterial());
  capMesh.name = 'hat-cap';
  hat.add(capMesh);

  // Sprout: stem + two leaves, swaying group rooted at the crown
  const sprout = new THREE.Group();
  sprout.name = 'sprout';
  sprout.position.y = HEAD_R * 1.07 * HEAD_SCALE.y - 0.01;
  hat.add(sprout);
  const s = new Baker();
  s.add(new THREE.CylinderGeometry(0.018, 0.024, 0.18, 8), xf([0, 0.08, 0]), { color: STEM });
  for (const side of [-1, 1]) {
    s.add(new THREE.SphereGeometry(1, 12, 8), xf([0.12 * side, 0.19, 0], [0, 0, 0.45 * side], [0.15, 0.03, 0.08]), { color: LEAF });
  }
  const sp = s.build();
  const sproutMesh = castMesh(sp.geo, hatMaterial(), false);
  sproutMesh.name = 'sprout-mesh';
  sprout.add(sproutMesh);

  hat.userData.sprout = sprout;
  hat.userData.setColors = (scheme) => {
    paintRole(cap, 'hat', scheme.hat);
    paintRole(cap, 'cuff', scheme.cuff);
  };
  hat.userData.dispose = () => { cap.geo.dispose(); sp.geo.dispose(); };
  return hat;
}

/** @param {{hat?:string, cuff?:string, shirt?:string, pants?:string}} [colors] colour scheme (defaults = the original P1 look) */
export function createCharacter(colors = {}) {
  const scheme = {
    shirt: colors.shirt || SHIRT_DEFAULT, pants: colors.pants || PANTS_DEFAULT,
    hat: colors.hat || HAT_DEFAULT, cuff: colors.cuff || CUFF_DEFAULT,
  };
  const blink = { value: 1 };
  const mat = makeToon(blink, 'character-toon');
  const bodies = [];                 // { geo, roles } of every merged body mesh (for setColors / dispose)
  const bake = (b) => { const e = b.build(); bodies.push(e); return e; };

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
  const bodyB = new Baker();
  bodyB.add(new THREE.SphereGeometry(0.3, 24, 16), xf([0, 0.55, 0], [0, 0, 0], [1.0, 0.95, 0.9]),
    { color: scheme.shirt, role: 'shirt', outline: 0.03 });
  const body = castMesh(bake(bodyB).geo, mat);
  body.name = 'body';
  torso.add(body);

  // ---- Arms (pivot at the shoulder; arm hangs along -Y): sleeve + hand in one mesh
  const makeArm = (side) => {
    const g = new THREE.Group();
    g.name = side > 0 ? 'armL' : 'armR';
    g.position.set(0.32 * side, 0.7, 0);
    const b = new Baker();
    b.add(new THREE.CapsuleGeometry(0.09, 0.1, 6, 12), xf([0, -0.1, 0]), { color: scheme.shirt, role: 'shirt', outline: 0.028 });
    b.add(new THREE.SphereGeometry(0.085, 14, 10), xf([0, -0.24, 0]), { color: SKIN, outline: 0.028 });
    const m = castMesh(bake(b).geo, mat);
    m.name = g.name + '-mesh';
    g.add(m);
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

  // ---- Legs (pivot at the hip, outside the torso group so hip stays planted while the body bobs): leg + shoe in one mesh
  const makeLeg = (side) => {
    const g = new THREE.Group();
    g.name = side > 0 ? 'legL' : 'legR';
    g.position.set(0.14 * side, 0.36, 0);
    const b = new Baker();
    b.add(new THREE.CapsuleGeometry(0.09, 0.1, 6, 12), xf([0, -0.14, 0]), { color: scheme.pants, role: 'pants', outline: 0.028 });
    b.add(new THREE.SphereGeometry(1, 16, 12), xf([0, -0.285, 0.045], [0, 0, 0], [0.115, 0.08, 0.16]), { color: SHOE, outline: 0.028 });
    const m = castMesh(bake(b).geo, mat);
    m.name = g.name + '-mesh';
    g.add(m);
    rig.add(g);
    return g;
  };
  const legL = makeLeg(1);
  const legR = makeLeg(-1);

  // ---- Head group: head + ears + face (eyes, blush, mouth) in one mesh; the hat is an attachment on headSocket
  const headGroup = new THREE.Group();
  headGroup.name = 'headGroup';
  headGroup.position.y = HEAD_Y;
  torso.add(headGroup);

  const hb = new Baker();
  hb.add(new THREE.SphereGeometry(HEAD_R, 32, 24), xf([0, 0, 0], [0, 0, 0], HEAD_SCALE.toArray()), { color: SKIN, outline: 0.035 });
  for (const s of [-1, 1]) {            // ears (tiny nubs: no outline)
    hb.add(new THREE.SphereGeometry(0.07, 12, 10), xf([0.46 * s, -0.03, -0.02], [0, 0, 0], [0.6, 1, 0.8]), { color: SKIN });
  }
  // Face: flat-ish unlit features hugging the head surface. Eyes = dark ball + two white highlights (flagged for the blink).
  for (const side of [-1, 1]) {
    const place = onHead(0.155 * side, -0.02, -0.005);
    const cy = new THREE.Vector3().setFromMatrixPosition(place).y;
    const part = (geo, p, s, color) => hb.add(geo, place.clone().multiply(xf(p, [0, 0, 0], s)), { color, flat: 1, eye: cy });
    part(new THREE.SphereGeometry(1, 16, 12), [0, 0, 0], [0.068, 0.095, 0.03], EYE);
    part(new THREE.SphereGeometry(1, 10, 8), [0.02, 0.036, 0.024], [0.024, 0.024, 0.012], '#ffffff');
    part(new THREE.SphereGeometry(1, 8, 6), [-0.02, -0.032, 0.025], [0.012, 0.012, 0.008], '#ffffff');
  }
  for (const side of [-1, 1]) {         // blush (was an alpha-blended disc: now 85% flat colour + 15% lit skin, same look, opaque)
    hb.add(new THREE.CircleGeometry(0.07, 20), onHead(0.27 * side, -0.115, 0.004).multiply(xf([0, 0, 0], [0, 0, 0], [1.25, 0.8, 1])), { color: BLUSH_MIX, flat: 1 });
  }
  // mouth: arc opens upward -> smile
  hb.add(new THREE.TorusGeometry(0.045, 0.011, 6, 14, Math.PI), onHead(0, -0.105, 0.004).multiply(xf([0, 0, 0], [0, 0, Math.PI])), { color: MOUTH, flat: 1 });
  const headMesh = castMesh(bake(hb).geo, mat);
  headMesh.name = 'head';
  headGroup.add(headMesh);

  // ---- Hat socket + default hat
  const headSocket = new THREE.Object3D();
  headSocket.name = 'headSocket';
  headGroup.add(headSocket);
  const defaultHat = createBeanieHat(scheme);
  headSocket.add(defaultHat);
  let currentHat = defaultHat;

  // ---- Back socket (Step 36a): lower back, torso-local; the body ellipsoid's rear surface is at z = -0.27
  const backSocket = new THREE.Object3D();
  backSocket.name = 'backSocket';
  backSocket.position.set(0, 0.42, -0.24);
  torso.add(backSocket);
  let currentBack = null;

  // Torso-local neck attachment, below the head and outside the shoulders.
  const neckSocket = new THREE.Object3D();
  neckSocket.name = 'neckSocket';
  neckSocket.position.set(0, 0.63, 0);
  torso.add(neckSocket);
  let currentNeck = null;
  function setNeck(model) {
    const prev = currentNeck;
    if (prev === (model || null)) return prev;
    prev?.removeFromParent();
    currentNeck = model || null;
    if (currentNeck) neckSocket.add(currentNeck);
    return prev;
  }

  // ---- Public API
  /** Swap the back model (a tail; any Object3D whose origin is the attachment point) or null for none. Returns the previous model (still valid). */
  function setBack(model) {
    const prev = currentBack;
    if (prev === (model || null)) return prev;
    if (prev) backSocket.remove(prev);
    currentBack = model || null;
    if (currentBack) {
      if (currentBack.parent) currentBack.parent.remove(currentBack);
      backSocket.add(currentBack);
    }
    return prev;
  }

  /** Swap the hat. `model` = any Object3D (origin = head centre) or null for a bare head. Returns the previous hat (still valid: pass it back to restore it). */
  function setHat(model) {
    const prev = currentHat;
    if (prev === (model || null)) return prev;
    if (prev) headSocket.remove(prev);
    currentHat = model || null;
    if (currentHat) {
      if (currentHat.parent) currentHat.parent.remove(currentHat);
      headSocket.add(currentHat);
      if (currentHat.userData.setColors) currentHat.userData.setColors(scheme);
    }
    return prev;
  }

  /** Recolour in place: any of {hat, cuff, shirt, pants} (hex strings). Rewrites vertex colours, nothing is rebuilt. */
  function setColors(next = {}) {
    for (const k of ['hat', 'cuff', 'shirt', 'pants']) if (next[k]) scheme[k] = next[k];
    for (const e of bodies) { paintRole(e, 'shirt', scheme.shirt); paintRole(e, 'pants', scheme.pants); }
    if (currentHat && currentHat.userData.setColors) currentHat.userData.setColors(scheme);
    else defaultHat.userData.setColors(scheme);     // keep a detached default hat in sync too
    return { ...scheme };
  }

  /** Eyelid closure 0 (open) .. 1 (closed): squashes the eye vertices in the shader. */
  function setBlink(closed) { blink.value = 1 - BLINK_DEPTH * closed; }

  /** Free everything unique to this character. The hat currently mounted is freed only if it is the default beanie; custom hats belong to their creator. */
  function dispose() {
    for (const e of bodies) e.geo.dispose();
    defaultHat.userData.dispose();
    mat.dispose();
    blob.geometry.dispose();
    if (blob.material.map) blob.material.map.dispose();
    blob.material.dispose();
  }

  return {
    root,
    height: 1.65,
    setHat,
    setBack,
    setNeck,
    get neck() { return currentNeck; },
    setColors,
    setBlink,
    dispose,
    get hat() { return currentHat; },
    get back() { return currentBack; },
    get defaultHat() { return defaultHat; },
    get colors() { return { ...scheme }; },
    parts: {
      rig, torso, body, head: headMesh, headGroup, headSocket, backSocket, neckSocket, armL, armR, legL, legR, blob,
      handSocket: armR.userData.handSocket,
      offhandSocket: armL.userData.handSocket,      // Step 58: the left hand holds the equipped charm's trinket (player.setOffhandCharm)
      get hat() { return currentHat; },
      get sprout() { return currentHat ? currentHat.userData.sprout || null : null; },
    },
  };
}
