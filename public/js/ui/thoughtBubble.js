// Thought bubbles over world points (PLAN Step 34a): a white cloud with an inline-SVG icon in it and two little trailing circles, like a speech bubble in a comic. Pure DOM overlay.
//
//   const thoughts = createThoughtBubbles(hudRoot)
//   thoughts.show(key, anchor, iconSvg, { seconds = 2.6, lift = 0 })   anchor = { x, y, z } (read every frame, so it follows a moving critter) or a function returning one;
//                                                                       one bubble per `key` (showing again restarts it); returns the key
//   thoughts.hide(key)
//   thoughts.update(dt, camera)                                         once per frame after the camera moved
//   thoughts.count                                                      bubbles on screen (debug / tests)
import * as THREE from 'three';

const v = new THREE.Vector3();
const MAX = 10;

export function createThoughtBubbles(hudRoot) {
  const layer = document.createElement('div');
  layer.className = 'thought-layer';
  hudRoot.appendChild(layer);
  const pool = [];
  const byKey = new Map();

  function make() {
    const el = document.createElement('div');
    el.className = 'thought';
    el.hidden = true;
    const cloud = document.createElement('div');
    cloud.className = 'thought-cloud';
    const ic = document.createElement('span');
    ic.className = 'thought-icon';
    cloud.appendChild(ic);
    el.appendChild(cloud);
    layer.appendChild(el);
    return { el, ic, key: null, t: 0, life: 0, anchor: null, lift: 0, alive: false };
  }

  return {
    show(key, anchor, iconSvg, { seconds = 2.6, lift = 0 } = {}) {
      let b = byKey.get(key);
      if (!b) {
        b = pool.find((q) => !q.alive);
        if (!b) {
          if (pool.length < MAX) { b = make(); pool.push(b); }
          else b = pool.reduce((a, q) => (q.t > a.t ? q : a));
        }
        if (b.key !== null) byKey.delete(b.key);
        byKey.set(key, b);
      }
      b.key = key; b.alive = true; b.t = 0; b.life = seconds; b.anchor = anchor; b.lift = lift;
      b.ic.innerHTML = iconSvg || '';
      b.el.hidden = false;
      b.el.classList.remove('pop'); void b.el.offsetWidth; b.el.classList.add('pop');
      b.el.style.opacity = '0';
      return key;
    },
    hide(key) {
      const b = byKey.get(key);
      if (!b) return;
      b.alive = false; b.el.hidden = true; byKey.delete(key); b.key = null;
    },
    update(dt, camera) {
      if (!byKey.size) return;
      const w = window.innerWidth, h = window.innerHeight;
      camera.updateMatrixWorld();
      for (const b of pool) {
        if (!b.alive) continue;
        b.t += dt;
        if (b.t >= b.life) { byKey.delete(b.key); b.key = null; b.alive = false; b.el.hidden = true; continue; }
        const a = typeof b.anchor === 'function' ? b.anchor() : b.anchor;
        if (!a) { b.el.style.opacity = '0'; continue; }
        v.set(a.x, a.y + b.lift, a.z).project(camera);
        if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) { b.el.style.opacity = '0'; continue; }
        const bob = Math.sin(b.t * 4) * 2;
        b.el.style.transform = `translate3d(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h + bob).toFixed(1)}px, 0)`;
        b.el.style.opacity = String(Math.min(1, b.t / 0.1) * Math.min(1, (b.life - b.t) / 0.3));
      }
    },
    get count() { return byKey.size; },
  };
}
