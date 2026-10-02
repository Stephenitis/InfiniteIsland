// The seed finds' visual cues (PLAN Step 38a): ONE Points layer (1 draw call) with every glint and glow, plus one InstancedMesh (1 draw call) for the soil mounds of the two dig spots.
//
//   const fx = createSeedFx({ scene, world, clock, spots })   spots = world/seeds.js's runtime spots ({ id, kind, x, y, z, ref? })
//   fx.setFound(ids)      the seeds found so far: their cues stop and the dig mounds become flat holes
//   fx.update(t, camera, viewportHeightPx)   once per frame (after the camera moved): twinkles, the night glows (Moon Orchid's crown, the Glow Hibiscus's bud: only inside the night window), the dusk
//                         fireflies over the Firefly Plumeria (only inside the dusk window). Everything is hidden while Emberleaf is not drawn in full detail (world.regions).
//   fx.summary()          debug: { drawCalls, cues: [{ id, type, alpha }], found }
// The windows are config SEEDS.times (game/seedLogic.js windowWeight): the cue fades in and out around the edge where the find itself starts / stops working.
import * as THREE from 'three';
import { SEEDS } from '../config.js';
import { windowWeight } from '../game/seedLogic.js';
import { TREE_INFO } from './islands/emberAssets.js';
import { toonMat } from '../render/toon.js';

const TAU = Math.PI * 2;
const VERT = /* glsl */`
attribute vec3 aParams;    // x = size (world), y = glow 0..1, z = shape (0 star glint, 1 soft glow)
attribute vec3 aColor;
uniform float uScale;
varying float vGlow;
varying float vShape;
varying vec3 vColor;
void main() {
  vGlow = aParams.y; vShape = aParams.z; vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aParams.x * uScale / max(0.1, -mv.z);
}
`;
const FRAG = /* glsl */`
varying float vGlow;
varying float vShape;
varying vec3 vColor;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = length(p);
  float a;
  if (vShape < 0.5) {                                        // a four-point twinkle star with a bright core
    float r1 = max(0.0, 1.0 - abs(p.x) * 7.0) * max(0.0, 1.0 - abs(p.y) * 1.1);
    float r2 = max(0.0, 1.0 - abs(p.y) * 7.0) * max(0.0, 1.0 - abs(p.x) * 1.1);
    a = max(r1, r2) + (1.0 - smoothstep(0.0, 0.3, d)) * 0.9;
  } else {                                                   // a soft round glow
    a = pow(max(0.0, 1.0 - d), 1.1) * 0.8 + (1.0 - smoothstep(0.05, 0.25, d)) * 0.3;
  }
  a *= vGlow;
  if (a < 0.01) discard;
  gl_FragColor = vec4(mix(vColor, vec3(1.0), clamp(a - 0.6, 0.0, 1.0) * 0.6) * a, a);
  #include <colorspace_fragment>
}
`;

export function createSeedFx({ scene, world, clock, spots }) {
  const cues = [];                                           // { id, type: 'glint' | 'glow' | 'flies', pos, size, colour, win, phase, ... }
  const cue = (c) => { cues.push({ phase: Math.random() * TAU, alpha: 0, ...c }); };
  for (const s of spots) {
    if (s.kind === 'dig' || s.kind === 'pick' || s.kind === 'steam') cue({ id: s.id, type: 'glint', x: s.x, y: s.y + 0.55, z: s.z, size: 1.3, colour: new THREE.Color('#ffe9a0') });
    else if (s.id === 'moon-orchid') {
      const t = s.ref, info = TREE_INFO[t.layer];
      cue({ id: s.id, type: 'glow', x: s.x, y: t.y + info.crownY * t.sy + 0.4, z: s.z, size: 6.5, colour: new THREE.Color('#b79bff'), win: 'night', toward: 2.4 });
    } else if (s.id === 'glow-hibiscus') cue({ id: s.id, type: 'glow', x: s.x, y: s.y + 0.55 * s.ref.s, z: s.z, size: 1.9, colour: new THREE.Color('#ff7ab8'), win: 'night', toward: 0.35 });
    else if (s.id === 'firefly-plumeria') {
      for (let i = 0; i < 9; i++) cue({ id: s.id, type: 'flies', x: s.x, y: s.y, z: s.z, size: 0.7 + Math.random() * 0.3, colour: new THREE.Color('#e4ff7a'), win: 'dusk', r: 0.5 + Math.random() * 0.9, w: 0.45 + Math.random() * 0.4, hy: 0.5 + Math.random() * 1.1, period: 2 + Math.random() * 2.4 });
    }
  }
  const n = cues.length;
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const aPar = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
  geo.setAttribute('position', aPos); geo.setAttribute('aParams', aPar); geo.setAttribute('aColor', aCol);
  cues.forEach((c, i) => aCol.setXYZ(i, c.colour.r, c.colour.g, c.colour.b));
  const mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 600 } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geo, mat);
  points.name = 'seed-cues'; points.frustumCulled = false; points.renderOrder = 5; points.visible = false;
  scene.add(points);

  // ---- the soil mounds of the dig spots (a low dome; once dug it is a flat dark patch)
  const digs = spots.filter((s) => s.kind === 'dig');
  const dome = new THREE.SphereGeometry(0.62, 12, 6, 0, TAU, 0, Math.PI / 2);
  const mounds = new THREE.InstancedMesh(dome, toonMat('#ffffff'), Math.max(1, digs.length));
  mounds.name = 'seed-mounds'; mounds.frustumCulled = false; mounds.receiveShadow = true; mounds.visible = false;
  mounds.count = digs.length;
  scene.add(mounds);
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const mound = (s, i, found) => {
    dummy.position.set(s.x, s.y - (found ? 0.02 : 0.05), s.z);
    dummy.rotation.set(0, i * 1.7, 0);
    dummy.scale.set(found ? 1.15 : 0.95, found ? 0.12 : 0.5, found ? 1.15 : 0.95);
    dummy.updateMatrix();
    mounds.setMatrixAt(i, dummy.matrix);
    mounds.setColorAt(i, col.set(found ? '#3b2a24' : s.id === 'ember-lily' ? '#a39488' : '#6a5560'));
  };
  let found = [];
  const paintMounds = () => { digs.forEach((s, i) => mound(s, i, found.includes(s.id))); mounds.instanceMatrix.needsUpdate = true; if (mounds.instanceColor) mounds.instanceColor.needsUpdate = true; };
  paintMounds();

  const weight = (win, hour) => (win ? windowWeight(hour, SEEDS.times[win]) : 1);
  function update(t, camera, viewportHeightPx) {
    const full = !world || !world.regions || world.regions.isFull('ember');
    points.visible = mounds.visible = full;
    if (!full) return;
    if (camera && viewportHeightPx) mat.uniforms.uScale.value = viewportHeightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const hour = clock.hour;
    for (let i = 0; i < n; i++) {
      const c = cues[i], gone = found.includes(c.id);
      const w = gone ? 0 : weight(c.win, hour);
      c.alpha += (w - c.alpha) * 0.12;                      // (a soft ease: a cue does not pop on a clock jump)
      if (c.type === 'glint') {
        const tw = 0.5 + 0.5 * Math.sin(t * 3.1 + c.phase), tw2 = Math.sin(t * 7.3 + c.phase * 2);
        aPos.setXYZ(i, c.x, c.y + 0.06 * Math.sin(t * 1.7 + c.phase), c.z);
        aPar.setXYZ(i, c.size * (0.8 + 0.35 * tw), c.alpha * (0.45 + 0.55 * tw) * (0.85 + 0.15 * tw2), 0);
      } else if (c.type === 'glow') {
        let gx = c.x, gy = c.y, gz = c.z;                  // (nudged towards the camera, so a crown's glow shows in FRONT of the leaves instead of inside them)
        if (camera && c.toward) { const dx = camera.position.x - gx, dy = camera.position.y - gy, dz = camera.position.z - gz, l = Math.hypot(dx, dy, dz) || 1; gx += dx / l * c.toward; gy += dy / l * c.toward; gz += dz / l * c.toward; }
        aPos.setXYZ(i, gx, gy, gz);
        aPar.setXYZ(i, c.size * (0.95 + 0.06 * Math.sin(t * 1.3 + c.phase)), c.alpha * (0.78 + 0.18 * Math.sin(t * 1.9 + c.phase)), 1);
      } else {                                              // dusk fireflies: drift in a loose orbit over the flower, blinking
        const u = ((t / c.period + c.phase) % 1 + 1) % 1, blink = u < 0.6 ? Math.sin((u / 0.6) * Math.PI) : 0;
        aPos.setXYZ(i, c.x + c.r * Math.sin(t * c.w + c.phase) , c.y + 0.5 + c.hy * (0.55 + 0.45 * Math.sin(t * 0.8 + c.phase * 3)), c.z + c.r * Math.cos(t * c.w * 0.8 + c.phase * 2));
        aPar.setXYZ(i, c.size * (0.6 + 0.4 * blink), c.alpha * (0.15 + 0.85 * blink), 1);
      }
    }
    aPos.needsUpdate = true; aPar.needsUpdate = true;
  }

  return {
    points, mounds,
    setFound(ids) { found = [...ids]; paintMounds(); },
    update,
    summary: () => ({ drawCalls: (points.visible ? 1 : 0) + (mounds.visible ? 1 : 0), cues: cues.map((c) => ({ id: c.id, type: c.type, alpha: +c.alpha.toFixed(2) })), found: [...found] }),
  };
}
