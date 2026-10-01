// Fixed-angle, never-rotating follow camera (Animal Crossing style) that also drags the sun's shadow
// frustum along with the player so shadows stay crisp.
//
//   const cam = new FollowCamera(camera, { sun });
//   cam.update(dt, focusPoint, zoomTarget = 1)   // snaps on the first call; zoomTarget scales the camera offset (multiplayer)
//   cam.zoomForExtent(extentX, extentZ)          // zoom factor that frames a ground area (used with the players' bounding box)
//   cam.resize(w, h)
// With several players the focus is their centroid and the offset distance grows up to CAMERA_MAX_ZOOM x (eased); the sun's shadow
// box grows with it. With zoomTarget = 1 (solo) nothing changes.
import * as THREE from 'three';
import { CAMERA_OFFSET, CAMERA_FOLLOW_LERP, SHADOW_MAP_SIZE, CAMERA_MAX_ZOOM, CAMERA_ZOOM_MARGIN, CAMERA_ZOOM_LERP, CAMERA_FOV } from '../config.js';

const LOOK_UP = 0.9;             // look a little above the feet
const SHADOW_HALF = 26;          // half extent of the shadow box (52u wide, covers the visible ground)

export class FollowCamera {
  constructor(camera, { sun = null, offset = CAMERA_OFFSET, lerp = CAMERA_FOLLOW_LERP } = {}) {
    this.camera = camera;
    this.sun = sun;
    this.offset = new THREE.Vector3(offset.x, offset.y, offset.z);
    this.lerp = lerp;
    this.focus = new THREE.Vector3();       // smoothed look-at point
    this.enabled = true;
    this.zoom = 1;                          // current (smoothed) offset multiplier
    this.zoomTarget = 1;
    this._first = true;
    this._shadowZoom = 1;                   // quantised zoom the shadow box was last sized for
    this._shadowMap = sun ? (sun.shadow.mapSize.x || SHADOW_MAP_SIZE) : SHADOW_MAP_SIZE;
    this.touch = false;
    this.framingZoom = 1;
    this._shake = { amp: 0, t: 0, dur: 0 };   // additive camera offset that decays (see shake())

    if (sun) {
      this._sunOffset = sun.position.clone().sub(sun.target.position);
      this._lightDirection = this._sunOffset.clone().normalize();
      this._nextDirection = new THREE.Vector3();
      const sc = sun.shadow.camera;
      sc.left = -SHADOW_HALF; sc.right = SHADOW_HALF; sc.top = SHADOW_HALF; sc.bottom = -SHADOW_HALF;
      sc.updateProjectionMatrix();
      // Light-space basis used to snap the shadow frustum to whole shadow-map texels (no shimmering).
      const z = this._sunOffset.clone().normalize();
      this._lx = new THREE.Vector3(0, 1, 0).cross(z).normalize();
      this._ly = z.clone().cross(this._lx).normalize();
      this._texel = (SHADOW_HALF * 2) / this._shadowMap;
    }
  }

  /** Zoom factor (1..CAMERA_MAX_ZOOM) needed to keep a ground area of extentX x extentZ (plus a margin) in view. */
  zoomForExtent(extentX, extentZ, margin = CAMERA_ZOOM_MARGIN) {
    const off = this.offset;
    const dist = off.length() * this.framingZoom;
    const halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * dist;
    const pitch = Math.atan2(off.y, Math.hypot(off.x, off.z));
    const viewW = 2 * halfH * this.camera.aspect;              // ground width visible at zoom 1 (at the focus depth)
    const viewD = 2 * halfH / Math.max(0.2, Math.sin(pitch));   // ground depth visible at zoom 1
    const z = Math.max((extentX + margin * 2) / viewW, (extentZ + margin * 2) / viewD);
    return Math.min(CAMERA_MAX_ZOOM, Math.max(1, z));
  }

  /** Jump straight to the target on the next update (use after teleporting the player). */
  snap() { this._first = true; }

  /** Tiny additive camera shake: `amount` world units of jitter that decays to 0 over `duration` s (stronger shakes win). */
  shake(amount = 0.08, duration = 0.2) {
    const s = this._shake;
    const cur = s.dur > 0 ? s.amp * Math.pow(Math.max(0, 1 - s.t / s.dur), 2) : 0;
    if (amount >= cur) { s.amp = amount; s.t = 0; s.dur = duration; }
  }

  update(dt, target, zoomTarget = 1) {
    const tx = target.x, ty = target.y + LOOK_UP, tz = target.z;
    if (this._first) {
      this.focus.set(tx, ty, tz);
      this.zoom = this.zoomTarget = zoomTarget;
      this._first = false;
    } else {
      this.zoomTarget = zoomTarget;
      this.zoom += (zoomTarget - this.zoom) * (1 - Math.exp(-CAMERA_ZOOM_LERP * dt));
      if (Math.abs(zoomTarget - this.zoom) < 0.002) this.zoom = zoomTarget;   // land exactly (solo framing stays bit-identical)
      const a = 1 - Math.exp(-this.lerp * dt);         // frame-rate independent
      this.focus.x += (tx - this.focus.x) * a;
      this.focus.z += (tz - this.focus.z) * a;
      this.focus.y += (ty - this.focus.y) * (1 - Math.exp(-this.lerp * 0.6 * dt));   // vertical eases a bit slower
    }
    if (this.enabled) {           // disabled in ?debug mode where OrbitControls owns the camera
      this.camera.position.copy(this.focus).addScaledVector(this.offset, this.zoom * this.framingZoom);
      // Aim slightly above the player so touch controls and the upper HUD leave a clear playable band.
      const aimLift = this.touch ? (this.camera.aspect < 0.8 ? 2.1 : 0.45) : 0;
      this.camera.lookAt(this.focus.x, this.focus.y + aimLift, this.focus.z);
      const sh = this._shake;
      if (sh.dur > 0) {
        sh.t += dt;
        if (sh.t >= sh.dur) { sh.dur = 0; sh.amp = 0; }
        else {
          const k = sh.amp * Math.pow(1 - sh.t / sh.dur, 2);
          const w = sh.t * 55;
          this.camera.position.x += Math.sin(w * 1.3) * k;
          this.camera.position.y += Math.sin(w * 1.9 + 1.7) * k * 0.8;
          this.camera.position.z += Math.cos(w * 1.1 + 0.4) * k * 0.6;
        }
      }
    }
    if (this.sun) this._updateSun();
  }

  _updateSun() {
    // The clock rotates the light before this update. Rebuild its texel-snapping basis in place.
    this._sunOffset.subVectors(this.sun.position, this.sun.target.position);
    this._nextDirection.copy(this._sunOffset).normalize();
    if (this._nextDirection.distanceToSquared(this._lightDirection) > 1e-16) {
      this._lightDirection.copy(this._nextDirection);
      this._lx.set(0, 1, 0).cross(this._lightDirection);
      if (this._lx.lengthSq() < 1e-10) this._lx.set(1, 0, 0);
      else this._lx.normalize();
      this._ly.crossVectors(this._lightDirection, this._lx).normalize();
    }
    // Shadow box grows with the zoom. The zoom is quantised (1/8 steps) so the box - and with it the texel grid used for
    // snapping - stays put while the camera is stable, instead of shimmering through a continuous resize.
    const zq = Math.ceil(this.zoom * this.framingZoom * 8 - 1e-3) / 8;
    if (zq !== this._shadowZoom) {
      this._shadowZoom = zq;
      const half = SHADOW_HALF * zq;
      const sc = this.sun.shadow.camera;
      sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
      sc.updateProjectionMatrix();
      this._texel = (half * 2) / this._shadowMap;
    }
    const f = this.focus;
    // Snap the light's target to the shadow texel grid in light space.
    const px = f.dot(this._lx), py = f.dot(this._ly);
    const sx = Math.round(px / this._texel) * this._texel;
    const sy = Math.round(py / this._texel) * this._texel;
    const t = this.sun.target.position;
    t.copy(f).addScaledVector(this._lx, sx - px).addScaledVector(this._ly, sy - py);
    this.sun.position.copy(t).add(this._sunOffset);
    this.sun.target.updateMatrixWorld();
  }

  /** Keep the shadow-texel snapping in sync after the sun's shadow map size changes (quality fallback). */
  setShadowMapSize(n) {
    this._shadowMap = n;
    this._texel = (SHADOW_HALF * this._shadowZoom * 2) / n;
  }

  resize(w, h) {
    const aspect = w / h;
    this.camera.aspect = aspect;
    // Preserve the desktop horizontal field of view on tall touch screens.
    const base = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV * 0.5));
    const idealTan = this.touch && aspect < 16 / 9 ? base * (16 / 9) / aspect : base;
    const cappedTan = Math.min(idealTan, Math.tan(THREE.MathUtils.degToRad(50)));
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(cappedTan));
    this.framingZoom = idealTan / cappedTan;
    this.camera.updateProjectionMatrix();
  }
}
