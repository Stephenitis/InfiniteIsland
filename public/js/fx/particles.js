// Tiny pooled particle system: ONE THREE.Points draw call, camera-facing sprites drawn procedurally in the
// fragment shader (leaf / petal / sparkle star / puff), per-particle colour, spin, gravity, flutter and fade.
//
//   const fx = new Particles(scene, { pool: 200, ground: (x, z) => height });
//   fx.burst('leaf', position, { count: 12, radius: 1.5, color: '#58c96b' })
//   fx.update(dt, camera, drawingBufferHeight)     // once per frame (also sets the point-size scale)
//
// Types: 'leaf' (green), 'petal' (pink, slow flutter), 'sparkle' (yellow/white star, rises + fades), 'puff' (soft white).
// opts: count, radius (spawn spread around `position`), ring (spawn on the rim of radius, moving outward), height (+-y jitter), speed (multiplier), color (hex, overrides palette), size (multiplier), life (multiplier).
import * as THREE from 'three';
import { PALETTE } from '../config.js';

const T_LEAF = 0, T_PETAL = 1, T_SPARKLE = 2, T_PUFF = 3;

const VERT = /* glsl */`
attribute vec4 aColor;
attribute vec3 aParams;   // x = world size, y = spin angle, z = shape type
uniform float uScale;     // pixels per world unit at distance 1
varying vec4 vColor;
varying float vAngle;
varying float vType;
void main() {
  vColor = aColor;
  vAngle = aParams.y;
  vType = aParams.z;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aParams.x * uScale / max(0.1, -mv.z);
}
`;

const FRAG = /* glsl */`
uniform vec3 uOutline;
varying vec4 vColor;
varying float vAngle;
varying float vType;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float c = cos(vAngle), s = sin(vAngle);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  vec3 col = vColor.rgb;
  float a = 0.0;

  if (vType < 0.5) {                       // leaf: pointy ellipse + midrib + comic outline
    float d = length(p / vec2(0.95, 0.5));
    a = 1.0 - smoothstep(0.94, 1.0, d);
    col = mix(col, uOutline, smoothstep(0.66, 0.74, d));
    col = mix(col, col * 1.25, (1.0 - smoothstep(0.0, 0.05, abs(p.y))) * (1.0 - smoothstep(0.7, 0.9, abs(p.x))) * 0.6);
  } else if (vType < 1.5) {                // petal: rounded teardrop
    vec2 q = p;
    q.x += 0.12;
    float w = 0.62 * (1.0 - 0.5 * smoothstep(-0.2, 0.9, q.x));
    float d = length(vec2(q.x / 0.85, q.y / max(0.05, w)));
    a = 1.0 - smoothstep(0.94, 1.0, d);
    col = mix(col, uOutline, smoothstep(0.68, 0.76, d));
  } else if (vType < 2.5) {                // sparkle: 4-point star with a white core
    float d = pow(abs(p.x), 0.55) + pow(abs(p.y), 0.55);
    a = 1.0 - smoothstep(0.86, 1.0, d);
    col = mix(vec3(1.0, 1.0, 0.95), col, smoothstep(0.0, 0.7, d));
  } else {                                 // puff: soft-edged cloud dot
    float d = length(p);
    a = 1.0 - smoothstep(0.55, 1.0, d);
  }
  a *= vColor.a;
  if (a < 0.02) discard;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const rnd = (a, b) => a + Math.random() * (b - a);
const pickOf = (arr) => arr[(Math.random() * arr.length) | 0];
const TAU = Math.PI * 2;
const SIZE_K = 2.0;        // the fixed camera is ~15u away: world-space sizes below are tuned for close-ups, this scales them for it

const PALETTES = {
  leaf: ['#58c96b', '#7ddf7a', '#3fb45a', '#9be27a'],
  petal: ['#ffb3d1', '#ff8fbe', '#ffd6e7', '#fff0f6'],
  sparkle: ['#ffe066', '#fff6b0', '#ffffff', '#ffd23b'],
  puff: ['#ffffff', '#fff4dc'],
};

export class Particles {
  constructor(scene, { pool = 200, ground = null } = {}) {
    this.N = pool;
    this.ground = ground;
    const N = pool;

    // simulation state (structure of arrays)
    this.pos = new Float32Array(N * 3);
    this.vel = new Float32Array(N * 3);
    this.life = new Float32Array(N);       // age (s); a particle is dead when life >= max
    this.max = new Float32Array(N).fill(0);
    this.size0 = new Float32Array(N);
    this.angle = new Float32Array(N);
    this.spin = new Float32Array(N);
    this.grav = new Float32Array(N);
    this.drag = new Float32Array(N);
    this.flutter = new Float32Array(N);    // sideways drift strength
    this.phase = new Float32Array(N);
    this.type = new Float32Array(N);
    this.rgb = new Float32Array(N * 3);
    this.grow = new Float32Array(N);       // size growth over life (puff) / shrink (<0)
    this._next = 0;
    this._time = 0;

    // render buffers
    this.geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.BufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aParams = new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.aPos);
    this.geo.setAttribute('aColor', this.aColor);
    this.geo.setAttribute('aParams', this.aParams);

    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 }, uOutline: { value: new THREE.Color(PALETTE.outline) } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    this.points.name = 'particles';
    scene.add(this.points);

    this._c = new THREE.Color();
  }

  /** Number of live particles (debug / tests). */
  get alive() {
    let n = 0;
    for (let i = 0; i < this.N; i++) if (this.life[i] < this.max[i]) n++;
    return n;
  }

  _alloc() {
    const i = this._next;
    this._next = (this._next + 1) % this.N;      // ring buffer: overwrites the oldest when full
    return i;
  }

  /** Spawn a burst of `type` particles around `position` (anything with x, y, z). */
  burst(type, position, opts = {}) {
    const defaults = { leaf: 10, petal: 12, sparkle: 7, puff: 4 };
    const count = opts.count ?? defaults[type] ?? 6;
    const radius = opts.radius ?? 0.2;
    const speed = opts.speed ?? 1;
    const sizeK = opts.size ?? 1;
    const lifeK = opts.life ?? 1;
    const palette = PALETTES[type] || PALETTES.puff;
    for (let n = 0; n < count; n++) {
      const i = this._alloc();
      const a = Math.random() * TAU;
      // ring: spawn around the rim of `radius` (canopy edge) and fling outward, so nothing starts hidden inside a mesh
      const rr = opts.ring ? radius * rnd(0.85, 1.08) : Math.sqrt(Math.random()) * radius;
      const px = position.x + Math.cos(a) * rr;
      const pz = position.z + Math.sin(a) * rr;
      let py = position.y + (opts.height ? rnd(-opts.height, opts.height) : 0);
      const dirA = opts.ring ? a + rnd(-0.5, 0.5) : Math.random() * TAU;
      const col = opts.color ? this._c.set(opts.color) : this._c.set(pickOf(palette));
      let vx, vy, vz, life, size, grav, drag, flutter, spin, tp, grow = 0;
      switch (type) {
        case 'leaf': {
          tp = T_LEAF;
          const sp = rnd(0.6, 2.4) * speed;
          vx = Math.cos(dirA) * sp; vz = Math.sin(dirA) * sp; vy = rnd(0.3, 2.6) * speed;
          grav = 5.5; drag = 1.6; flutter = 5; spin = rnd(-6, 6);
          life = rnd(1.1, 1.9); size = rnd(0.26, 0.4);
          break;
        }
        case 'petal': {
          tp = T_PETAL;
          const sp = rnd(0.3, 1.5) * speed;
          vx = Math.cos(dirA) * sp; vz = Math.sin(dirA) * sp; vy = rnd(0.2, 1.8) * speed;
          grav = 1.7; drag = 1.8; flutter = 7; spin = rnd(-4, 4);
          life = rnd(1.8, 3.0); size = rnd(0.2, 0.32);
          break;
        }
        case 'sparkle': {
          tp = T_SPARKLE;
          const sp = rnd(0.2, 1.3) * speed;
          vx = Math.cos(dirA) * sp; vz = Math.sin(dirA) * sp; vy = rnd(0.8, 2.6) * speed;
          grav = -0.6; drag = 1.9; flutter = 0; spin = rnd(-3, 3);
          life = rnd(0.55, 0.95); size = rnd(0.3, 0.5);
          break;
        }
        default: {                                   // puff
          tp = T_PUFF;
          const sp = rnd(0.3, 1.0) * speed;
          vx = Math.cos(dirA) * sp; vz = Math.sin(dirA) * sp; vy = rnd(0.2, 0.7) * speed;
          grav = -0.3; drag = 2.4; flutter = 0; spin = 0;
          life = rnd(0.35, 0.6); size = rnd(0.25, 0.4); grow = 1.4;
        }
      }
      const i3 = i * 3;
      this.pos[i3] = px; this.pos[i3 + 1] = py; this.pos[i3 + 2] = pz;
      this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
      this.life[i] = 0;
      this.max[i] = life * lifeK;
      this.size0[i] = size * sizeK * SIZE_K;
      this.angle[i] = Math.random() * TAU;
      this.spin[i] = spin;
      this.grav[i] = grav;
      this.drag[i] = drag;
      this.flutter[i] = flutter;
      this.phase[i] = Math.random() * TAU;
      this.type[i] = tp;
      this.grow[i] = grow;
      this.rgb[i3] = col.r; this.rgb[i3 + 1] = col.g; this.rgb[i3 + 2] = col.b;
    }
  }

  update(dt, camera, viewportHeightPx) {
    if (camera && viewportHeightPx) {
      this.material.uniforms.uScale.value = viewportHeightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    }
    dt = Math.min(dt, 0.1);
    this._time += dt;
    const P = this.pos, V = this.vel;
    const outPos = this.aPos.array, outCol = this.aColor.array, outPar = this.aParams.array;
    for (let i = 0; i < this.N; i++) {
      const i3 = i * 3, i4 = i * 4;
      if (this.life[i] >= this.max[i]) {           // dead: collapse to nothing
        outPar[i3] = 0; outCol[i4 + 3] = 0;
        continue;
      }
      this.life[i] += dt;
      const life = this.life[i], max = this.max[i];
      const u = life / max;
      // forces
      V[i3 + 1] -= this.grav[i] * dt;
      const k = Math.exp(-this.drag[i] * dt);
      V[i3] *= k; V[i3 + 2] *= k;
      if (this.grav[i] > 0) V[i3 + 1] *= Math.exp(-this.drag[i] * 0.5 * dt);   // terminal-ish velocity
      if (this.flutter[i] > 0) {
        const w = life * 6.5 + this.phase[i];
        V[i3] += Math.sin(w) * this.flutter[i] * dt;
        V[i3 + 2] += Math.cos(w * 0.8) * this.flutter[i] * dt;
      }
      P[i3] += V[i3] * dt; P[i3 + 1] += V[i3 + 1] * dt; P[i3 + 2] += V[i3 + 2] * dt;
      this.angle[i] += this.spin[i] * dt;

      // landing: lie on the ground briefly, then fade
      if (this.ground && this.grav[i] > 0) {
        const gy = this.ground(P[i3], P[i3 + 2]) + 0.06;
        if (P[i3 + 1] < gy) {
          P[i3 + 1] = gy; V[i3] = V[i3 + 1] = V[i3 + 2] = 0; this.spin[i] = 0; this.flutter[i] = 0; this.grav[i] = 0;
          this.max[i] = Math.min(this.max[i], life + 0.45);
        }
      }

      // fade / scale-out
      const remain = max - life;
      const fade = Math.min(1, remain / 0.35);
      let size = this.size0[i] * (1 + this.grow[i] * u);
      if (this.type[i] === T_SPARKLE) size *= 0.55 + 0.45 * Math.sin(Math.min(1, u * 1.6) * Math.PI) + 0.2 * (1 - u);
      else size *= 0.5 + 0.5 * fade;
      outPos[i3] = P[i3]; outPos[i3 + 1] = P[i3 + 1]; outPos[i3 + 2] = P[i3 + 2];
      outCol[i4] = this.rgb[i3]; outCol[i4 + 1] = this.rgb[i3 + 1]; outCol[i4 + 2] = this.rgb[i3 + 2];
      outCol[i4 + 3] = (this.type[i] === T_PUFF ? 0.8 : 1) * fade;
      outPar[i3] = size; outPar[i3 + 1] = this.angle[i]; outPar[i3 + 2] = this.type[i];
    }
    this.aPos.needsUpdate = true;
    this.aColor.needsUpdate = true;
    this.aParams.needsUpdate = true;
  }
}
