// Inventory HUD: a compact bar of icon + count chips (non-zero items only, catalogue order) and floating "+1 Apple" texts that
// rise from the point where something was collected.
//
//   const bar = createInventoryBar(hudRoot, inventory, { top: false });   // top: true when touch controls are on (bottom-left = joystick area)
//   bar.float('apple', 1, worldPos {x,y,z}, '#5fc4ff')   // floating text, tinted (multiplayer: the collecting player's colour); merges bursts
//   bar.update(dt, camera)                               // once per frame after the camera moved (projects + animates the floaters)
//   bar.pop(id)                                          // re-trigger a chip's pop animation
//
// The chips listen to inventory.on('change'), so anything that changes the bag (pickups, cooking, quests) is reflected and pops.
import * as THREE from 'three';
import { listItems, getItem, itemName } from '../game/catalog.js';

const FLOAT_LIFE = 1.15;        // s
const FLOAT_RISE = 58;          // px
const MAX_FLOATS = 14;
const MERGE_AGE = 0.55;         // s: a second pickup of the same item this soon joins the existing floater ("+2 Logs")
const MERGE_DIST = 1.6;         // world units

export function createInventoryBar(root, inventory, { top = false } = {}) {
  const bar = document.createElement('div');
  bar.className = 'hud-inv' + (top ? ' top' : '');
  bar.setAttribute('aria-label', 'Bag');
  bar.hidden = true;
  root.appendChild(bar);

  const chips = new Map();      // id -> { el, num, n }
  function chipFor(def) {
    let c = chips.get(def.id);
    if (c) return c;
    const el = document.createElement('div');
    el.className = 'inv-chip';
    el.dataset.id = def.id;
    el.title = def.name;
    el.style.setProperty('--ic', def.color);
    el.innerHTML = `<span class="inv-ic">${def.icon}</span><span class="inv-x">×</span><span class="inv-n">0</span>`;
    el.hidden = true;
    c = { el, num: el.querySelector('.inv-n'), n: 0, def };
    chips.set(def.id, c);
    // keep catalogue order in the DOM
    const order = listItems().map((d) => d.id);
    const idx = order.indexOf(def.id);
    let before = null;
    for (const [id, other] of chips) {
      if (id !== def.id && order.indexOf(id) > idx && (!before || order.indexOf(id) < order.indexOf(before.def.id))) before = other;
    }
    bar.insertBefore(el, before ? before.el : null);
    return c;
  }
  for (const def of listItems()) chipFor(def);

  function popChip(c) {
    c.el.classList.remove('pop');
    void c.el.offsetWidth;
    c.el.classList.add('pop');
  }

  function sync(id, animate) {
    const def = getItem(id);
    if (!def) return;
    const c = chipFor(def);
    const n = inventory.count(id);
    c.n = n;
    c.num.textContent = String(n);
    c.el.hidden = n <= 0;
    if (animate && n > 0) popChip(c);
    bar.hidden = !inventory.total;
  }
  for (const d of listItems()) sync(d.id, false);
  inventory.on('change', (e) => sync(e.id, e.delta !== 0));

  // ---- floating "+1 Apple" texts
  const floats = [];
  const v = new THREE.Vector3();
  function makeFloat() {
    const el = document.createElement('div');
    el.className = 'inv-float';
    el.innerHTML = '<span class="inv-float-ic"></span><span class="inv-float-t"></span>';
    root.appendChild(el);
    return { el, ic: el.firstChild, t: el.lastChild, alive: false, id: '', n: 0, x: 0, y: 0, z: 0, age: 0, jx: 0, oy: 0 };
  }
  const setText = (f) => {
    f.t.textContent = `+${f.n} ${itemName(f.id, f.n)}`;
  };

  const api = {
    /** Floating text for `n` x `id` collected at world point `at` (anything with x, y, z). `color` tints it (multiplayer). */
    float(id, n, at, color = null) {
      const def = getItem(id);
      if (!def || !at) return;
      // merge with a fresh floater of the same item that is right there ("+1 Log" x3 -> "+3 Logs")
      for (const f of floats) {
        if (f.alive && f.id === id && f.age < MERGE_AGE && Math.hypot(f.x - at.x, f.z - at.z) < MERGE_DIST && f.color === color) {
          f.n += n;
          f.age = Math.min(f.age, 0.12);
          setText(f);
          f.el.classList.remove('bump'); void f.el.offsetWidth; f.el.classList.add('bump');
          return;
        }
      }
      let f = floats.find((q) => !q.alive);
      if (!f) {
        if (floats.length < MAX_FLOATS) { f = makeFloat(); floats.push(f); }
        else f = floats.reduce((a, b) => (b.age > a.age ? b : a));      // recycle the oldest
      }
      f.alive = true; f.id = id; f.n = n; f.age = 0; f.color = color;
      f.x = at.x; f.y = at.y; f.z = at.z;
      f.jx = (Math.random() - 0.5) * 10;
      let stack = 0;                      // different items collected together stack upward instead of overlapping
      for (const q of floats) if (q !== f && q.alive && q.age < 0.9 && Math.hypot(q.x - at.x, q.z - at.z) < 2.2) stack++;
      f.oy = -stack * 24;
      f.ic.innerHTML = def.icon;
      f.el.style.setProperty('--fc', color || '#ffffff');
      f.el.classList.toggle('tinted', !!color);
      setText(f);
      f.el.hidden = false;
      f.el.classList.remove('bump'); void f.el.offsetWidth; f.el.classList.add('bump');
      f.el.style.opacity = '0';
    },

    pop(id) { const c = chips.get(id); if (c) popChip(c); },

    update(dt, camera) {
      if (!floats.length) return;
      const w = window.innerWidth, h = window.innerHeight;
      camera.updateMatrixWorld();
      for (const f of floats) {
        if (!f.alive) continue;
        f.age += dt;
        if (f.age >= FLOAT_LIFE) { f.alive = false; f.el.hidden = true; continue; }
        v.set(f.x, f.y, f.z).project(camera);
        if (v.z > 1) { f.el.style.opacity = '0'; continue; }
        const u = f.age / FLOAT_LIFE;
        const rise = FLOAT_RISE * (1 - Math.pow(1 - u, 2.2));
        const sx = (v.x * 0.5 + 0.5) * w + f.jx * 0.3, sy = (-v.y * 0.5 + 0.5) * h - rise + f.oy;
        f.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
        f.el.style.opacity = String(Math.min(1, f.age / 0.08) * Math.min(1, (FLOAT_LIFE - f.age) / 0.35));
      }
    },

    element: bar,
    get chips() { return chips; },
  };
  return api;
}
