// Frostpine atmosphere (Step 29a): everything that changes with WHERE the view is, not with the time of day. One region weight `w` (0 = elsewhere,
// 1 = well inside Frostpine) is eased over about a second from the island gap of the view centre, so crossing the bridge fades things in / out
// instead of popping:
//   * snowfall: ONE Points draw call, 800 flakes wrapped inside a box round the view centre, positions computed in the vertex shader (no CPU per
//     frame work, no particle pool). Light on the beach tier, heavier on the foothills and heaviest on the alpine plateau (by ground height).
//   * a slightly cooler look: the day clock's sky / fog / hemisphere / sun colours are multiplied towards blue by `w` AFTER sky.setTimeOfDay each
//     tick (the clock's `look` is never touched), so dawn / dusk / night keep their own palettes and only gain a cool cast.
//   * the frozen-lake sheet's night dimming + sun direction (islands/frostVisuals.js iceUniforms), and a `calm` flag the ambient fireflies obey.
//
//   const atmosphere = createAtmosphere({ scene, camera, sky, clock, getHeight, view: () => ({ x, z }) });
//   atmosphere.update(dt, simTime, viewportHeightPx)   // once per tick, right after sky.setTimeOfDay
//   atmosphere.snap()                                  // teleports: jump the weight to its target at once
//   atmosphere.weight / atmosphere.summary()           // debug
import * as THREE from 'three';
import { ISLANDS } from '../config.js';
import { iceUniforms } from '../world/islands/frostVisuals.js';

const N_FLAKES = 800;
const BOX = { x: 46, y: 22, z: 38 };
const EASE = 0.8;                       // s: time constant of the region weight
const FADE_IN = -6, FADE_OUT = 44;      // island gap (u, negative = inside the coast) over which the weight goes 1 -> 0
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const VERT = /* glsl */`
attribute vec4 aSeed;
uniform float uTime;
uniform float uScale;
uniform float uIntensity;
uniform vec3 uCenter;
uniform vec3 uBox;
varying float vA;
void main() {
  vec3 s = aSeed.xyz;
  float k = aSeed.w;
  vec3 hb = uBox * 0.5;
  vec3 o = uCenter - hb;
  float x = s.x * uBox.x + uTime * 0.55 + sin(uTime * 0.7 + s.z * 30.0) * 0.9;
  float z = s.z * uBox.z + sin(uTime * 0.5 + s.x * 20.0) * 0.6;
  float y = s.y * uBox.y - uTime * (1.2 + 1.1 * k);
  vec3 p = vec3(o.x + mod(x - o.x, uBox.x), o.y + mod(y - o.y, uBox.y), o.z + mod(z - o.z, uBox.z));
  vec3 q = abs((p - uCenter) / hb);
  float edge = 1.0 - smoothstep(0.72, 1.0, max(max(q.x, q.y), q.z));
  float vis = step(fract(k * 13.7 + s.x * 5.1), uIntensity);
  vA = vis * edge;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = 0.13 + 0.17 * fract(k * 7.3);
  gl_PointSize = clamp(size * uScale / max(0.1, -mv.z), 2.2, 24.0);
}`;
const FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uOpacity;
varying float vA;
void main() {
  float d = length(gl_PointCoord * 2.0 - 1.0);
  float a = (1.0 - smoothstep(0.35, 1.0, d)) * vA * uOpacity;
  if (a < 0.02) discard;
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createAtmosphere({ scene, camera, sky, clock, getHeight, view }) {
  const frost = ISLANDS.find((i) => i.biome === 'alpine');
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_FLAKES * 3), 3));   // (unused: the shader places every flake)
  const seed = new Float32Array(N_FLAKES * 4);
  let a = 12345;                                                       // tiny LCG: the same flakes every run
  const r = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
  for (let i = 0; i < N_FLAKES * 4; i++) seed[i] = r();
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uScale: { value: 600 }, uIntensity: { value: 0 }, uCenter: { value: new THREE.Vector3() },
      uBox: { value: new THREE.Vector3(BOX.x, BOX.y, BOX.z) }, uColor: { value: new THREE.Color('#ffffff') }, uOpacity: { value: 0.92 },
    },
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'snowfall';
  points.frustumCulled = false;
  points.renderOrder = 6;
  points.visible = false;
  scene.add(points);

  let w = 0, groundY = 0, started = false, groundInit = false;
  const day = new THREE.Color('#ffffff'), night = new THREE.Color('#c5d4ff');

  function targetWeight(v) {
    if (!frost) return 0;
    const gap = Math.hypot(v.x - frost.x, v.z - frost.z) - frost.radius;
    return 1 - sstep(FADE_IN, FADE_OUT, gap);
  }

  /** Multiply a colour a little towards blue: less red, a hair less green, a touch more blue (never above 1 unless it already was). */
  function cool(c, k) {
    if (!c) return;
    c.r *= 1 - 0.075 * k;
    c.g *= 1 - 0.012 * k;
    c.b = Math.max(c.b, Math.min(1, c.b * (1 + 0.055 * k)));
  }

  function update(dt, t, viewportHeightPx) {
    const v = view();
    const target = targetWeight(v);
    if (!started) { w = target; started = true; }
    else w += (target - w) * (1 - Math.exp(-dt / EASE));
    if (Math.abs(target - w) < 0.002) w = target;

    // frozen lake sheet follows the clock even while nobody is on Frostpine (cheap: two uniforms)
    iceUniforms.uNight.value = clock.nightness;
    iceUniforms.uSunDir.value.copy(clock.direction);

    // cooler look, on top of what sky.setTimeOfDay just wrote
    if (w > 0.002) {
      const u = sky.dome.material.uniforms;
      cool(u.uTop.value, w); cool(u.uHorizon.value, w);
      cool(scene.background, w); cool(scene.fog && scene.fog.color, w);
      cool(sky.hemi.color, w); cool(sky.hemi.groundColor, w);
      sky.sun.color.r *= 1 - 0.05 * w; sky.sun.color.b = Math.max(sky.sun.color.b, Math.min(1, sky.sun.color.b * (1 + 0.04 * w)));
    }

    // snowfall
    const gy = Math.max(getHeight(v.x, v.z), 0);
    groundY += (gy - groundY) * (1 - Math.exp(-dt / 0.6));
    if (!groundInit || dt === 0) { groundY = gy; groundInit = true; }
    const intensity = w * (0.5 + 0.5 * sstep(0.4, 7.8, groundY));      // beach -> meadow -> plateau
    points.visible = intensity > 0.01;
    if (points.visible) {
      const u = mat.uniforms;
      u.uTime.value = t;
      u.uIntensity.value = intensity;
      u.uCenter.value.set(v.x, groundY + 9, v.z);
      if (camera && viewportHeightPx) u.uScale.value = viewportHeightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      u.uColor.value.copy(day).lerp(night, clock.nightness);
      u.uOpacity.value = 0.92 - 0.12 * clock.nightness;
    }
  }

  return {
    update,
    snap() { const v = view(); w = targetWeight(v); started = true; groundY = Math.max(getHeight(v.x, v.z), 0); groundInit = true; },
    get weight() { return w; },
    /** True while the view is well inside Frostpine (ambient fireflies stay out). */
    get calm() { return w > 0.5; },
    points,
    summary: () => ({ weight: +w.toFixed(3), flakes: Math.round(N_FLAKES * Math.min(1, w * (0.5 + 0.5 * sstep(0.4, 7.8, groundY)))), groundY: +groundY.toFixed(2), visible: points.visible }),
    dispose() { points.removeFromParent(); geo.dispose(); mat.dispose(); },
  };
}
