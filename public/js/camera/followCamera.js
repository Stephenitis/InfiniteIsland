// Fixed-angle, never-rotating follow camera (Animal Crossing style) that also drags the sun's shadow
// frustum along with the player so shadows stay crisp.
//
//   const cam = new FollowCamera(camera, { sun });
//   cam.update(dt, player.position)       // snaps on the first call
//   cam.resize(w, h)
import * as THREE from 'three';
import { CAMERA_OFFSET, CAMERA_FOLLOW_LERP, SHADOW_MAP_SIZE } from '../config.js';

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
    this._first = true;

    if (sun) {
      this._sunOffset = sun.position.clone().sub(sun.target.position);
      const sc = sun.shadow.camera;
      sc.left = -SHADOW_HALF; sc.right = SHADOW_HALF; sc.top = SHADOW_HALF; sc.bottom = -SHADOW_HALF;
      sc.updateProjectionMatrix();
      // Light-space basis used to snap the shadow frustum to whole shadow-map texels (no shimmering).
      const z = this._sunOffset.clone().normalize();
      this._lx = new THREE.Vector3(0, 1, 0).cross(z).normalize();
      this._ly = z.clone().cross(this._lx).normalize();
      this._texel = (SHADOW_HALF * 2) / (sun.shadow.mapSize.x || SHADOW_MAP_SIZE);
    }
  }

  /** Jump straight to the target on the next update (use after teleporting the player). */
  snap() { this._first = true; }

  update(dt, target) {
    const tx = target.x, ty = target.y + LOOK_UP, tz = target.z;
    if (this._first) {
      this.focus.set(tx, ty, tz);
      this._first = false;
    } else {
      const a = 1 - Math.exp(-this.lerp * dt);         // frame-rate independent
      this.focus.x += (tx - this.focus.x) * a;
      this.focus.z += (tz - this.focus.z) * a;
      this.focus.y += (ty - this.focus.y) * (1 - Math.exp(-this.lerp * 0.6 * dt));   // vertical eases a bit slower
    }
    if (this.enabled) {           // disabled in ?debug mode where OrbitControls owns the camera
      this.camera.position.copy(this.focus).add(this.offset);
      this.camera.lookAt(this.focus);
    }
    if (this.sun) this._updateSun();
  }

  _updateSun() {
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
    this._texel = (SHADOW_HALF * 2) / n;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
