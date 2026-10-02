// Pop-in animation for build moments (PLAN Step 35b): the same squash-and-stretch drop the bridge segments use (bridgeMesh.js), for any piece of merged geometry.
//
//   const popper = createPopper({ parent })              parent = the Object3D the temporary meshes live under (geometry is in ITS local space)
//   popper.add(geometry, { delay, drop, outline, cast, onStart, onLand, onDone })
//         `geometry` = a vertex-coloured merged geometry (render/geo.js combine). The piece pivots on the centre of its footprint at the bottom, so it squashes toward
//         the ground. After `delay` s it appears small, drops `drop` u, grows to full size and lands at 45 % of the pop (onLand(pivot {x, y, z}), the thunk + dust),
//         then wobbles for ~0.3 s and is removed (onDone). The temporary mesh + outline hull exist only while it animates: the owner swaps in its merged mesh in onAllDone.
//   popper.update(dt)                                    drive the animations
//   popper.whenIdle(fn)                                  call fn once every piece has settled (immediately when none is running)
//   popper.busy / popper.clear()                         anything still animating / drop everything at once WITHOUT callbacks
import * as THREE from 'three';
import { VERTEX_TOON, makeOutline } from '../render/geo.js';

const POP_TIME = 0.6;                    // s per piece (the bridge's value)
const LAND_AT = 0.45;                    // fraction of the pop at which it lands
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createPopper({ parent }) {
  const anim = [];
  const idle = [];

  function add(geometry, { delay = 0, drop = 1.4, outline = 0.045, cast = false, onStart = null, onLand = null, onDone = null } = {}) {
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    const px = (bb.min.x + bb.max.x) / 2, py = bb.min.y, pz = (bb.min.z + bb.max.z) / 2;
    const geo = geometry.clone().translate(-px, -py, -pz);
    const g = new THREE.Group();
    g.position.set(px, py, pz);
    const mesh = new THREE.Mesh(geo, VERTEX_TOON);
    mesh.castShadow = cast; mesh.receiveShadow = true; mesh.frustumCulled = false;
    const hull = makeOutline(geo, outline);
    hull.frustumCulled = false;
    mesh.add(hull);
    g.add(mesh);
    g.visible = false;
    parent.add(g);
    anim.push({ g, geo, hull, px, py, pz, t: -delay, drop, landed: false, started: false, onStart, onLand, onDone });
  }

  function finish(a) {
    const i = anim.indexOf(a);
    if (i < 0) return;
    anim.splice(i, 1);
    a.g.removeFromParent(); a.geo.dispose();
    if (a.hull.geometry) a.hull.geometry.dispose();
    if (a.onDone) { try { a.onDone(); } catch (e) { console.error(e); } }
  }

  function update(dt) {
    for (const a of [...anim]) {
      if (!anim.includes(a)) continue;
      a.t += dt;
      if (a.t < 0) continue;
      if (!a.started) { a.started = true; a.g.visible = true; if (a.onStart) { try { a.onStart(); } catch (e) { console.error(e); } } }
      const u = clamp(a.t / POP_TIME, 0, 1);
      let y, sy, sxz;
      if (u < LAND_AT) { const p = u / LAND_AT; y = a.drop * (1 - p * p); sy = 1 + 0.25 * p; sxz = 1 - 0.1 * p; }
      else {
        if (!a.landed) { a.landed = true; if (a.onLand) { try { a.onLand({ x: a.px, y: a.py, z: a.pz }); } catch (e) { console.error(e); } } }
        const q = (u - LAND_AT) / (1 - LAND_AT);
        const e = Math.exp(-5 * q) * Math.cos(12 * q);
        y = 0; sy = 1 - 0.3 * e; sxz = 1 + 0.12 * e;
      }
      const grow = 0.55 + 0.45 * Math.min(1, u / 0.2);
      a.g.position.y = a.py + y;
      a.g.scale.set(sxz * grow, sy, sxz * grow);
      if (u >= 1) finish(a);
    }
    if (!anim.length && idle.length) for (const fn of idle.splice(0)) { try { fn(); } catch (e) { console.error(e); } }
  }

  return {
    add, update,
    whenIdle(fn) { if (!anim.length) fn(); else idle.push(fn); },
    get busy() { return anim.length > 0; },
    get count() { return anim.length; },
    clear() {
      for (const a of anim.splice(0)) { a.g.removeFromParent(); a.geo.dispose(); if (a.hull.geometry) a.hull.geometry.dispose(); }
      idle.length = 0;
    },
  };
}
