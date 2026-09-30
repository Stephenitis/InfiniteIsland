// Ambient life: butterflies fluttering around flower patches, blossom petals drifting off cherry trees and
// occasional twinkling glints on the sea near the shore. All three are a single draw call each (or two), driven
// by one update(); spawn positions favour whatever is near the player so the effects are actually seen.
//
//   const amb = createAmbient({ scene, props, getHeight });
//   amb.update(dt, t, player.position, camera, drawingBufferHeight)
import * as THREE from 'three';
import { WATER_LEVEL, PALETTE } from '../config.js';
import { SPAWN } from '../world/terrain.js';

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);

// =============================================================================================
// Butterflies
// =============================================================================================
const BUTTERFLY_COLORS = ['#ffb3d1', '#ffe27a', '#b8a4ff', '#8fe8ff', '#ffb98a', '#c7f0a0', '#ff9fb8', '#fff0f6'];

function wingGeometry() {
  // One wing in the XY plane (x = outwards, y = towards the head), rounded upper lobe + smaller lower lobe.
  const s = new THREE.Shape();
  s.moveTo(0, 0.02);
  s.bezierCurveTo(0.08, 0.4, 0.52, 0.62, 0.66, 0.3);
  s.bezierCurveTo(0.72, 0.1, 0.5, 0.0, 0.32, -0.05);
  s.bezierCurveTo(0.52, -0.16, 0.46, -0.52, 0.22, -0.44);
  s.bezierCurveTo(0.08, -0.38, 0.02, -0.18, 0, -0.04);
  const g = new THREE.ShapeGeometry(s, 6);
  g.rotateX(-Math.PI / 2);          // lie flat: head points to -Z, up is +Y
  return g;
}

class Butterflies {
  constructor(scene, centers, getHeight) {
    this.getHeight = getHeight;
    const n = centers.length;
    this.n = n;
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide });
    this.wings = new THREE.InstancedMesh(wingGeometry(), mat, n * 2);
    this.wings.name = 'butterfly-wings';
    this.wings.frustumCulled = false;
    this.wings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const bodyGeo = new THREE.CapsuleGeometry(0.055, 0.3, 2, 6);
    bodyGeo.rotateX(Math.PI / 2);
    this.bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshBasicMaterial({ color: PALETTE.outline }), n);
    this.bodies.name = 'butterfly-bodies';
    this.bodies.frustumCulled = false;
    this.bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const col = new THREE.Color();
    this.state = centers.map((c, i) => {
      col.set(BUTTERFLY_COLORS[i % BUTTERFLY_COLORS.length]);
      this.wings.setColorAt(i * 2, col);
      this.wings.setColorAt(i * 2 + 1, col);
      const partner = centers[(i * 3 + 1) % n];
      return {
        a: c, b: partner,                                   // wander between two flower patches
        mix: rnd(0, TAU), mixSpeed: rnd(0.03, 0.06),
        rx: rnd(1.8, 3.2), rz: rnd(1.6, 3.0),
        wx: rnd(0.55, 0.95), wz: rnd(0.5, 0.9), px: rnd(0, TAU), pz: rnd(0, TAU),
        hover: rnd(0.55, 0.9), hoverPh: rnd(0, TAU), flap: rnd(0, TAU), flapF: rnd(8, 11),
        size: rnd(0.95, 1.25),
        x: c.x, y: 1.5, z: c.z, yaw: rnd(0, TAU),
      };
    });
    this.wings.instanceColor.needsUpdate = true;
    scene.add(this.wings, this.bodies);
    this._m = new THREE.Matrix4();
    this._base = new THREE.Matrix4();
    this._rz = new THREE.Matrix4();
    this._sc = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._one = new THREE.Vector3(1, 1, 1);
    this._yAxis = new THREE.Vector3(0, 1, 0);
  }

  update(dt, t) {
    const m = this._m, base = this._base;
    for (let i = 0; i < this.n; i++) {
      const s = this.state[i];
      const k = 0.5 + 0.5 * Math.sin(s.mix + t * s.mixSpeed * TAU);
      const cx = s.a.x + (s.b.x - s.a.x) * k * 0.6, cz = s.a.z + (s.b.z - s.a.z) * k * 0.6;
      const tx = cx + s.rx * Math.sin(t * s.wx + s.px) + 0.35 * s.rx * Math.sin(t * s.wx * 2.7 + s.pz);
      const tz = cz + s.rz * Math.sin(t * s.wz + s.pz) + 0.35 * s.rz * Math.sin(t * s.wz * 2.3 + s.px);
      const dx = tx - s.x, dz = tz - s.z;
      s.x = tx; s.z = tz;
      // heading follows the motion (smoothed)
      if (dt > 0 && dx * dx + dz * dz > 1e-8) {
        const want = Math.atan2(-dx, -dz);
        let d = want - s.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        s.yaw += d * Math.min(1, dt * 7);
      }
      s.flap += dt * TAU * (s.flapF + 3 * Math.sin(t * 0.7 + s.px));
      const ground = Math.max(this.getHeight(s.x, s.z), 0.3);
      const y = ground + 0.6 + s.hover * 0.4 * (1 + Math.sin(t * s.hover + s.hoverPh)) + 0.07 * Math.sin(s.flap * 0.5);
      s.y = y;
      // body
      this._q.setFromAxisAngle(this._yAxis, s.yaw);
      this._p.set(s.x, y, s.z);
      base.compose(this._p, this._q, this._one);
      m.copy(base).multiply(this._sc.makeScale(s.size, s.size, s.size));
      this.bodies.setMatrixAt(i, m);
      // wings: hinge on the body axis, flapping +-theta about local Z
      const theta = -0.2 + 1.15 * (0.5 + 0.5 * Math.sin(s.flap));
      for (let w = 0; w < 2; w++) {
        const sgn = w === 0 ? 1 : -1;
        this._rz.makeRotationZ(sgn * theta);
        m.copy(base).multiply(this._rz).multiply(this._sc.makeScale(sgn * s.size, s.size, s.size));
        this.wings.setMatrixAt(i * 2 + w, m);
      }
    }
    this.wings.instanceMatrix.needsUpdate = true;
    this.bodies.instanceMatrix.needsUpdate = true;
  }
}

// =============================================================================================
// Blossom petals drifting from cherry trees
// =============================================================================================
const PETAL_PINKS = ['#ffb3d1', '#ff8fbe', '#ffd6e7', '#fff0f6'];

function petalGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(0.42, -0.35, 0.5, 0.25, 0, 0.5);
  s.bezierCurveTo(-0.5, 0.25, -0.42, -0.35, 0, -0.5);
  return new THREE.ShapeGeometry(s, 4);
}

class Petals {
  constructor(scene, trees, count, getHeight) {
    this.trees = trees;
    this.n = count;
    this.getHeight = getHeight;
    this.mesh = new THREE.InstancedMesh(petalGeometry(), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }), count);
    this.mesh.name = 'drifting-petals';
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const col = new THREE.Color();
    this.p = [];
    for (let i = 0; i < count; i++) {
      col.set(PETAL_PINKS[i % PETAL_PINKS.length]);
      this.mesh.setColorAt(i, col);
      this.p.push({ x: 0, y: -50, z: 0, vy: 0, rx: 0, ry: 0, rz: 0, sx: 0, sy: 0, sz: 0, ph: 0, size: 0, age: 0, life: 0, ground: 0, rest: 0 });
    }
    this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);
    this._d = new THREE.Object3D();
    this._init = false;
  }

  _spawn(p, playerPos, initial) {
    // prefer trees near the player so the petals are in view; fall back to any cherry tree
    let tree = null;
    if (this.trees.length) {
      for (let tries = 0; tries < 8 && !tree; tries++) {
        const c = this.trees[(Math.random() * this.trees.length) | 0];
        if (!playerPos || Math.hypot(c.position.x - playerPos.x, c.position.z - playerPos.z) < 34) tree = c;
      }
      if (!tree) tree = this.trees[(Math.random() * this.trees.length) | 0];
    }
    if (!tree) { p.y = -50; return; }
    const s = tree.scale.x;
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 2.1 * s;
    p.x = tree.position.x + Math.cos(a) * r;
    p.z = tree.position.z + Math.sin(a) * r;
    p.ground = this.getHeight(p.x, p.z);
    const top = tree.position.y + 3.4 * s, low = tree.position.y + 2.2 * s;
    p.y = initial ? p.ground + 0.1 + Math.random() * (top - p.ground) : rnd(low, top);
    p.vy = rnd(0.35, 0.75);
    p.rx = rnd(0, TAU); p.ry = rnd(0, TAU); p.rz = rnd(0, TAU);
    p.sx = rnd(-2.5, 2.5); p.sy = rnd(-2, 2); p.sz = rnd(-2.5, 2.5);
    p.ph = rnd(0, TAU);
    p.size = rnd(0.18, 0.28);
    p.age = 0;
    p.rest = 0;
  }

  update(dt, t, playerPos) {
    if (!this._init) { for (const p of this.p) this._spawn(p, playerPos, true); this._init = true; }
    const d = this._d;
    for (let i = 0; i < this.n; i++) {
      const p = this.p[i];
      if (p.rest > 0) {
        p.rest -= dt;
        if (p.rest <= 0) this._spawn(p, playerPos, false);
      } else {
        p.age += dt;
        // gentle wind drift + flutter, slow fall
        p.x += (0.55 + 0.45 * Math.sin(t * 0.7 + p.ph) + 0.25 * Math.sin(t * 2.3 + p.ph * 2)) * dt;
        p.z += (0.18 + 0.4 * Math.cos(t * 0.9 + p.ph * 1.3)) * dt;
        p.y -= p.vy * dt * (0.75 + 0.25 * Math.sin(t * 3 + p.ph));
        p.rx += p.sx * dt; p.ry += p.sy * dt; p.rz += p.sz * dt;
        if (p.y <= p.ground + 0.04) { p.y = p.ground + 0.04; p.rest = 0.9; p.rx = -Math.PI / 2 + Math.sin(p.ph) * 0.3; p.rz = 0; }
      }
      const fade = p.rest > 0 ? Math.max(0, p.rest / 0.9) : Math.min(1, p.age / 0.4);
      const sc = p.size * fade;
      d.position.set(p.x, p.y, p.z);
      d.rotation.set(p.rx, p.ry, p.rz);
      d.scale.set(sc, sc, sc);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// =============================================================================================
// Ocean glints: 4-point star sprites that twinkle near the shore
// =============================================================================================
const GLINT_VERT = /* glsl */`
attribute vec2 aParams;   // x = size (world), y = alpha
uniform float uScale;
varying float vAlpha;
void main() {
  vAlpha = aParams.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aParams.x * uScale / max(0.1, -mv.z);
}
`;
const GLINT_FRAG = /* glsl */`
varying float vAlpha;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = pow(abs(p.x), 0.5) + pow(abs(p.y), 0.5);
  float a = (1.0 - smoothstep(0.8, 1.0, d)) * vAlpha;
  if (a < 0.02) discard;
  vec3 col = mix(vec3(1.0, 1.0, 0.92), vec3(0.75, 0.95, 1.0), smoothstep(0.0, 0.9, d));
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`;

class Glints {
  constructor(scene, count, getHeight) {
    this.n = count;
    // candidate water spots near shores / the pond: shallow-ish water
    this.spots = [];
    for (let i = 0; i < 6000 && this.spots.length < 700; i++) {
      const x = rnd(-72, 72), z = rnd(-72, 72);
      const h = getHeight(x, z);
      if (h < -0.04 && h > -2.6) this.spots.push(x, z);
    }
    this.geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aPar = new THREE.BufferAttribute(new Float32Array(count * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.aPos);
    this.geo.setAttribute('aParams', this.aPar);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: GLINT_VERT, fragmentShader: GLINT_FRAG,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    this.points.name = 'ocean-glints';
    scene.add(this.points);
    this.s = [];
    for (let i = 0; i < count; i++) this.s.push({ age: 0, life: 1, delay: rnd(0, 2.5), size: 0.4 });
  }

  _place(i, playerPos) {
    const sp = this.spots;
    if (!sp.length) return false;
    let x = 0, z = 0;
    for (let tries = 0; tries < 30; tries++) {
      const k = ((Math.random() * (sp.length / 2)) | 0) * 2;
      x = sp[k]; z = sp[k + 1];
      if (!playerPos || (Math.abs(x - playerPos.x) < 22 && z - playerPos.z > -12 && z - playerPos.z < 16)) break;   // roughly what the fixed camera sees
    }
    this.aPos.setXYZ(i, x + rnd(-1, 1), WATER_LEVEL + 0.1, z + rnd(-1, 1));
    return true;
  }

  update(dt, playerPos, camera, viewportHeightPx) {
    if (camera && viewportHeightPx) {
      this.mat.uniforms.uScale.value = viewportHeightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    }
    for (let i = 0; i < this.n; i++) {
      const s = this.s[i];
      if (s.delay > 0) {
        s.delay -= dt;
        this.aPar.setXY(i, 0, 0);
        if (s.delay <= 0) {
          if (this._place(i, playerPos)) { s.age = 0; s.life = rnd(0.7, 1.3); s.size = rnd(0.4, 0.72); }
          else s.delay = 5;
        }
        continue;
      }
      s.age += dt;
      const u = s.age / s.life;
      if (u >= 1) { s.delay = rnd(0.4, 3.0); this.aPar.setXY(i, 0, 0); continue; }
      const tw = Math.sin(u * Math.PI);
      this.aPar.setXY(i, s.size * (0.4 + 0.6 * tw), 0.85 * tw * tw);
    }
    this.aPos.needsUpdate = true;
    this.aPar.needsUpdate = true;
  }
}

// =============================================================================================
export function createAmbient({ scene, props, getHeight, butterflies = 8, petals = 64, glints = 42 }) {
  // Flower patch centres -> butterfly homes: the nearest patches to the spawn first (so you meet them right away),
  // then patches further out, all at least ~7u apart.
  const flowers = (props.handles.flowers && props.handles.flowers.list) || [];
  const byDist = flowers.slice().sort((a, b) => Math.hypot(a.x - SPAWN.x, a.z - SPAWN.z) - Math.hypot(b.x - SPAWN.x, b.z - SPAWN.z));
  const homes = [];
  const far = (f) => homes.every((h) => Math.hypot(h.x - f.x, h.z - f.z) > 7);
  for (const f of byDist) { if (homes.length >= Math.ceil(butterflies * 0.5)) break; if (far(f)) homes.push({ x: f.x, z: f.z }); }
  const rest = flowers.filter((f) => far(f)).sort(() => Math.random() - 0.5);
  for (const f of rest) { if (homes.length >= butterflies) break; if (far(f)) homes.push({ x: f.x, z: f.z }); }
  for (let i = 0; homes.length < Math.min(butterflies, 6) && flowers.length; i++) {     // tiny worlds: reuse spots
    const f = flowers[i % flowers.length];
    homes.push({ x: f.x, z: f.z });
  }
  // two butterflies share the patch nearest the spawn
  if (homes.length && homes.length < butterflies) homes.push({ x: homes[0].x + 1.2, z: homes[0].z - 1.0 });

  const bf = new Butterflies(scene, homes, getHeight);
  const cherries = props.handles.trees.filter((g) => g.userData.cherry);
  const pt = new Petals(scene, cherries, cherries.length ? petals : 1, getHeight);
  const gl = new Glints(scene, glints, getHeight);

  return {
    butterflies: bf, petals: pt, glints: gl,
    update(dt, t, playerPos, camera, viewportHeightPx) {
      bf.update(dt, t);
      pt.update(dt, t, playerPos);
      gl.update(dt, playerPos, camera, viewportHeightPx);
    },
  };
}
