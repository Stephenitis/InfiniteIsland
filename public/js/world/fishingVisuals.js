// The fish spots you can see (PLAN Step 72a): every active spot of the `fishing` domain is a glowing ripple ring on the water (cool cyan for a common spot, warm orange for a 'chance' spot) with a dark
// fish shadow drifting round it in a slow circle. ONE InstancedMesh draws all of them (one draw call, one small shader program): per instance a position and {phase, kind, visibility, appear},
// the ring pulse, the fish's circle and its tail wag all happen in the vertex shader, so there is no per-frame geometry work. Drawn only while Duskcrown is in full detail; a claimed spot (somebody
// is fishing it) dims. No lights, no textures.
//
//   const spotsLayer = createFishingVisuals({ scene, fishing, world? })      once at load, on every screen
//   spotsLayer.update(dt, t)    once per tick (t = simulation seconds)         spotsLayer.summary() -> { visible, count, drawCalls }
import * as THREE from 'three';

const MAX = 16;
const WATER_Y = 0.07;                 // just above the marsh water's slow swell

function buildGeometry() {
  const pos = [], role = [], rad = [], str = [], idx = [];
  const ring = (r0, r1, strength, n = 48) => {
    const b = pos.length / 3;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      pos.push(c * r0, 0, s * r0, c * r1, 0, s * r1);
      role.push(0, 0); rad.push(0, 1); str.push(strength, strength);
    }
    for (let i = 0; i < n; i++) { const k = b + i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  };
  ring(0.78, 1.0, 1.0);
  ring(1.45, 1.6, 0.45);
  const fish = [[0.5, 0], [0.25, 0.17], [-0.05, 0.2], [-0.3, 0.1], [-0.38, 0.04], [-0.62, 0.2], [-0.55, 0], [-0.62, -0.2], [-0.38, -0.04], [-0.3, -0.1], [-0.05, -0.2], [0.25, -0.17]];
  const b = pos.length / 3;
  pos.push(0.05, 0, 0); role.push(1); rad.push(0); str.push(1);
  for (const [x, z] of fish) { pos.push(x, 0, z); role.push(1); rad.push(0); str.push(1); }
  for (let i = 0; i < fish.length; i++) idx.push(b, b + 1 + i, b + 1 + ((i + 1) % fish.length));
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aRole', new THREE.Float32BufferAttribute(role, 1));
  g.setAttribute('aRad', new THREE.Float32BufferAttribute(rad, 1));
  g.setAttribute('aStr', new THREE.Float32BufferAttribute(str, 1));
  g.setIndex(idx);
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('iInfo', new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage));
  g.instanceCount = 0;
  return g;
}

const VERT = /* glsl */`
  attribute vec3 iPos; attribute vec4 iInfo; attribute float aRole; attribute float aRad; attribute float aStr;
  uniform float uTime;
  varying vec4 vCol; varying float vRad; varying float vRole;
  void main() {
    float ph = iInfo.x, kind = iInfo.y, vis = iInfo.z, app = iInfo.w;
    vec3 p = position;
    float pulse = 0.5 + 0.5 * sin(uTime * 1.7 + ph);
    vRole = aRole; vRad = aRad;
    if (aRole < 0.5) {                                     // the ripple ring: breathes and glows
      float s = (1.0 + 0.1 * pulse + (aStr < 0.9 ? 0.18 * (1.0 - pulse) : 0.0)) * app * (kind > 0.5 ? 1.18 : 1.0);
      p.xz *= s;
      vec3 col = mix(vec3(0.42, 0.95, 1.0), vec3(1.0, 0.62, 0.26), kind);
      vCol = vec4(col, (0.3 + 0.42 * pulse) * aStr * vis * app);
    } else {                                               // the fish shadow: a slow circle, tail wagging, bigger for a chance spot
      float dir = mod(floor(ph * 3.0), 2.0) < 1.0 ? 1.0 : -1.0;
      float a = uTime * 0.5 * dir + ph;
      vec2 tang = vec2(-sin(a), cos(a)) * dir;
      float th = atan(-tang.y, tang.x), cy = cos(th), sy = sin(th);
      float k = (kind > 0.5 ? 1.45 : 1.0) * app;
      vec2 q = p.xz * k;
      q.y += sin(uTime * 7.0 - p.x * 7.0 + ph) * 0.07 * (0.5 - p.x) * k;
      p.xz = vec2(q.x * cy + q.y * sy, -q.x * sy + q.y * cy) + vec2(cos(a), sin(a)) * 0.85;
      vCol = vec4(0.05, 0.04, 0.17, 0.5 * vis * app);
    }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(iPos + vec3(p.x, 0.0, p.z), 1.0);
  }`;
const FRAG = /* glsl */`
  varying vec4 vCol; varying float vRad; varying float vRole;
  void main() {
    float edge = vRole < 0.5 ? sin(3.14159 * clamp(vRad, 0.0, 1.0)) : 1.0;     // a soft-edged ring
    gl_FragColor = vec4(vCol.rgb, vCol.a * edge);
  }`;

export function createFishingVisuals({ scene, fishing, world = null }) {
  const geo = buildGeometry();
  const uniforms = { uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'fish-spots';
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.visible = false;
  scene.add(mesh);
  const seen = new Map();                         // spot id -> local seconds at which it first showed (the appear ease)
  let clock = 0, key = '';

  function sync() {
    const spots = fishing.spots.slice(0, MAX), pos = geo.attributes.iPos, info = geo.attributes.iInfo;
    spots.forEach((s, i) => {
      if (!seen.has(s.id)) seen.set(s.id, clock);
      const k = Math.min(1, (clock - seen.get(s.id)) / 1.2), appear = 1 - (1 - k) * (1 - k);
      pos.setXYZ(i, s.x, WATER_Y, s.z);
      info.setXYZW(i, s.ph || 0, s.kind === 'chance' ? 1 : 0, s.by ? 0.35 : 1, appear);
    });
    for (const id of [...seen.keys()]) if (!spots.some((s) => s.id === id)) seen.delete(id);
    geo.instanceCount = spots.length;
    pos.needsUpdate = info.needsUpdate = true;
  }

  return {
    mesh,
    update(dt, t) {
      clock += dt;
      uniforms.uTime.value = t;
      const full = !world?.regions || world.regions.isFull('duskcrown');
      mesh.visible = full && fishing.spots.length > 0;
      if (!mesh.visible) return;
      sync();                                     // (a handful of spots: cheaper than diffing, and it keeps the appear ease running)
    },
    summary() { return { visible: mesh.visible, count: geo.instanceCount, drawCalls: mesh.visible ? 1 : 0 }; },
    dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); },
  };
}
