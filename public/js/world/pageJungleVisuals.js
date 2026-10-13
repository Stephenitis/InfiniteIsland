// The LOOK of Emberleaf Canopy's extras (Step 53a), built live from a page's data and animated from the page clock and the host's world. Everything is the game's own chunky toon style (vertex-coloured merged
// meshes with the dark outline hull; the fire things are UNLIT bright materials so they glow, no lights) and a handful of draw calls:
//
//   vines          ONE InstancedMesh of rope segments (+ hull) and ONE of leaf bunches: a hanging rope that sways, or a straight rope through a swinger's hand (local bodies and the pose bit of remote avatars); the boughs they hang
//                  from are a static merged mesh
//   cannons        ONE InstancedMesh of barrels (+ hull) that TURN with the page clock (game/pageJungleLogic.js cannonAngle), pulse when loaded and kick back when fired; a static mesh of cradles; ONE instanced row of aim dots (the
//                  shot's parabola, 8 dots per cannon, follows the barrel)
//   canoe river    per canoe: a translucent water box, ONE instanced layer of drifting foam streaks, the floating logs (instanced), the low boughs (static merged mesh) and the canoe itself (a merged mesh that follows canoeCenter)
//   lava           a glowing box that rises (game/pageJungleLogic.js lavaLevel), a bright top strip, rising bubbles (instanced) and an additive heat glow
//   the Volcano Spirit   a hot body (unlit, glowing) and a cooled crust (toon grey), swapped by its mood and squashed by its clock; flame tufts, eyes, brows; the globs (instanced spheres) and their landing warnings
//                  (instanced translucent pillars + ground shadows); a stone plaque on the ring; the goal bookmark that pops up when the spirit is beaten
//   embers         ONE Points layer of warm sparks drifting up round the camera (every jungle page)
//
//   const jv = createPageJungleVisuals(scene)    jv.open(page) / jv.close() / jv.isOpen
//   jv.update(t, dt, { clock, run, world, focusX, loaded: Set<cannon index>, swingers: [{ i, x, y (feet), face }], particles, sfx })      jv.summary()
// Coordinates are WORLD (the pocket); page tiles go through pageToWorld. Draw calls: Canopy Climb about 14, River Run about 16, Lava Rise about 12, the boss arena about 22.
import * as THREE from 'three';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../render/geo.js';
import { PAGE, pageToWorld } from '../game/storybookLogic.js';
import { cannonAngle, canoeCenter, canoeDocked, lavaLevel } from '../game/pageJungleLogic.js';
import { bossRect } from '../game/pageBossLogic.js';
import { goalParts } from './pageVisuals.js';
import { PAGE_JUNGLE as J, PAGE_BOSS as B, PLATFORMER as P } from '../config.js';

const BOX1 = new THREE.BoxGeometry(1, 1, 1);
const box = (color, p, s, r = [0, 0, 0]) => part(BOX1, color, { p, s, r });
const frac = (v) => v - Math.floor(v);
const hash = (i, k) => frac(Math.sin(i * 127.1 + k * 311.7) * 43758.5453);
const SEG = 7;                                              // rope segments per vine

// ---- geometries ---------------------------------------------------------------------------------------------------------------------------------------------
const ropeGeo = () => combine([part(G.cyl6, '#a8723f', { p: [0, 0.5, 0], s: [0.07, 1.0, 0.07] })]);
const leafGeo = () => combine([                                                 // a bunch of three leaves on the rope
  part(G.sphere, '#3fa551', { p: [0.22, 0, 0.04], r: [0, 0, -0.7], s: [0.34, 0.1, 0.16] }), part(G.sphere, '#58cf72', { p: [-0.22, -0.05, -0.02], r: [0, 0, 0.7], s: [0.32, 0.09, 0.15] }),
  part(G.sphere, '#4fc468', { p: [0.02, -0.18, 0.08], r: [0, 0, 0.1], s: [0.2, 0.12, 0.14] }),
]);
const gripGeo = () => combine([part(G.sphere, '#8c5a34', { p: [0, 0, 0], s: [0.16, 0.2, 0.16] }), part(G.sphere, '#a8723f', { p: [0, -0.22, 0], s: [0.11, 0.14, 0.11] })]);
function boughParts(page) {
  const P2 = [], ox = PAGE.x - page.W / 2, oy = PAGE.y - page.floorRows, z = PAGE.z - 0.6;
  for (const v of page.vines) {
    const x = ox + v.x, y = oy + v.y;
    P2.push(part(G.cyl8, '#8c5a34', { p: [x, y + 0.25, z], r: [0, 0, Math.PI / 2], s: [0.3, 3.4, 0.3] }));           // the bough the rope hangs from
    P2.push(part(G.cyl8, '#a8723f', { p: [x + 1.8, y + 0.55, z], r: [0, 0, Math.PI / 2 - 0.4], s: [0.2, 1.3, 0.2] }));
    for (const [dx, dy, s] of [[-1.2, 0.35, 0.8], [0.1, 0.6, 1.0], [1.3, 0.55, 0.85], [-0.4, 0.15, 0.6]]) P2.push(part(G.sphere, dy > 0.5 ? '#58cf72' : '#3fa551', { p: [x + dx, y + dy + 0.15, z + 0.2], s: [0.8 * s, 0.5 * s, 0.4] }));
    P2.push(part(G.sphere, '#ffd84a', { p: [x + 0.7, y - 0.15, z + 0.35], s: [0.1, 0.1, 0.1] }));
    P2.push(part(G.cyl6, '#7a5233', { p: [x, y - 0.1, z + 0.12], s: [0.16, 0.2, 0.16] }));                       // the knot
  }
  return P2;
}
const barrelGeo = () => combine([                                               // facing +x, the muzzle at x = +0.85
  part(G.cyl8, '#8c5a34', { p: [0, 0, 0], r: [0, 0, Math.PI / 2], s: [0.6, 1.5, 0.6] }),
  part(G.cyl8, '#a8723f', { p: [0.5, 0, 0], r: [0, 0, Math.PI / 2], s: [0.66, 0.5, 0.66] }),
  part(G.cyl8, '#ffd24a', { p: [-0.35, 0, 0], r: [0, 0, Math.PI / 2], s: [0.64, 0.12, 0.64] }), part(G.cyl8, '#ffd24a', { p: [0.2, 0, 0], r: [0, 0, Math.PI / 2], s: [0.64, 0.12, 0.64] }),
  part(G.cyl8, '#ffd24a', { p: [0.78, 0, 0], r: [0, 0, Math.PI / 2], s: [0.7, 0.12, 0.7] }),
  part(G.cyl8, '#2b2340', { p: [0.835, 0, 0], r: [0, 0, Math.PI / 2], s: [0.46, 0.05, 0.46] }),                      // the dark mouth
  part(G.sphere, '#8c5a34', { p: [-0.75, 0, 0], s: [0.5, 0.5, 0.5] }),
  part(G.sphereLo, '#ff6a4a', { p: [-0.1, 0.5, 0.15], s: [0.1, 0.1, 0.08] }),                                          // a painted ember
]);
function cradleParts(page) {
  const P2 = [], ox = PAGE.x - page.W / 2, oy = PAGE.y - page.floorRows, z = PAGE.z - 0.1;
  for (const c of page.cannons) {
    const x = ox + c.x, y = oy + c.y;
    P2.push(part(G.cyl6, '#7a5233', { p: [x - 0.55, y - 0.85, z], r: [0, 0, 0.35], s: [0.1, 1.4, 0.1] }), part(G.cyl6, '#7a5233', { p: [x + 0.55, y - 0.85, z], r: [0, 0, -0.35], s: [0.1, 1.4, 0.1] }));
    P2.push(box('#5a3a22', [x, y - 0.58, z], [1.5, 0.12, 0.34]));
    for (const dx of [-0.5, 0.5]) P2.push(part(G.cyl6, '#a8723f', { p: [x + dx, y + 0.95, z - 0.1], s: [0.04, 0.9, 0.04] }));    // two hanging rope loops
    P2.push(part(G.sphere, '#58cf72', { p: [x - 0.9, y - 0.5, z + 0.1], r: [0, 0, 0.6], s: [0.5, 0.12, 0.2] }), part(G.sphere, '#3fa551', { p: [x + 0.9, y - 0.45, z + 0.1], r: [0, 0, -0.6], s: [0.5, 0.12, 0.2] }));
  }
  return P2;
}
const dotGeo = () => combine([part(G.sphereLo, '#fff6c4', { s: [0.15, 0.15, 0.08] })]);
const canoeGeo = () => combine([                                                 // facing +x; the deck (the floor riders stand on) is y = 0
  part(G.sphere, '#b57a4e', { p: [0, -0.2, 0], s: [1.95, 0.46, 0.66] }),
  part(G.sphere, '#8a5a34', { p: [0, -0.34, 0], s: [1.7, 0.3, 0.52] }),
  box('#8a5a34', [0, 0.12, 0.58], [3.1, 0.1, 0.1]), box('#8a5a34', [0, 0.12, -0.58], [3.1, 0.1, 0.1]),                    // the rims
  part(G.cone6, '#b57a4e', { p: [1.85, 0.34, 0], r: [0, 0, -1.25], s: [0.22, 0.9, 0.22] }), part(G.cone6, '#b57a4e', { p: [-1.85, 0.34, 0], r: [0, 0, 1.25], s: [0.22, 0.9, 0.22] }),
  box('#ff7c6b', [0.1, 0.0, 0.6], [2.4, 0.07, 0.04]), box('#ffd85e', [0.1, -0.12, 0.6], [2.2, 0.05, 0.04]),
  box('#6b4a2e', [-1.0, 0.0, 0], [0.18, 0.1, 1.1]), box('#6b4a2e', [1.0, 0.0, 0], [0.18, 0.1, 1.1]),                       // two thwarts
  part(G.cyl6, '#9a6a44', { p: [0.2, 0.55, 0.62], r: [0, 0, 0.5], s: [0.04, 1.5, 0.04] }), part(G.sphere, '#c2494f', { p: [0.55, 0.14, 0.64], r: [0, 0, 0.5], s: [0.22, 0.06, 0.06] }),
]);
const logGeo = () => combine([
  part(G.cyl8, '#9a6a44', { p: [0, 0, 0], r: [0, 0, Math.PI / 2], s: [0.3, 1.0, 0.3] }), part(G.cyl8, '#d9b384', { p: [0.5, 0, 0], r: [0, 0, Math.PI / 2], s: [0.26, 0.05, 0.26] }), part(G.cyl8, '#d9b384', { p: [-0.5, 0, 0], r: [0, 0, Math.PI / 2], s: [0.26, 0.05, 0.26] }),
  part(G.sphere, '#58cf72', { p: [0.1, 0.27, 0.05], s: [0.28, 0.08, 0.14] }), box('#7c5233', [-0.15, 0.1, 0.28], [0.4, 0.04, 0.04]),
]);
const foamGeo = () => combine([part(G.sphere, '#ffffff', { s: [0.5, 0.05, 0.1] })]);
function riverBoughs(page) {
  const P2 = [], ox = PAGE.x - page.W / 2, oy = PAGE.y - page.floorRows, z = PAGE.z - 0.1;
  for (const c of page.canoes) for (const bx of c.branches) {
    const x = ox + bx, top = oy + c.y + J.canoe.branchHigh + 0.35, low = oy + c.y + J.canoe.branchLow;
    P2.push(part(G.cyl8, '#8c5a34', { p: [x, top, z - 0.15], r: [0, 0, Math.PI / 2], s: [0.26, 3.0, 0.26] }));            // the bough across
    for (const [dx, h] of [[-0.3, 0.9], [0, 1.3], [0.3, 1.0]]) P2.push(part(G.cyl6, '#3f9a4a', { p: [x + dx, top - h / 2, z], s: [0.045, h, 0.045] }));      // hanging vines ...
    for (let k = 0; k < 6; k++) P2.push(part(G.sphere, k % 2 ? '#58cf72' : '#3fa551', { p: [x + (k % 3 - 1) * 0.3, low + 0.15 + k * 0.4, z + (k % 2) * 0.1], s: [0.34, 0.26, 0.2] }));           // ... and a curtain of leaves down to the bough height
    P2.push(part(G.sphere, '#ff5d86', { p: [x + 0.2, low + 0.1, z + 0.2], s: [0.12, 0.12, 0.1] }));
    P2.push(part(G.sphere, '#3fa551', { p: [x - 0.9, top + 0.15, z - 0.1], s: [0.6, 0.38, 0.3] }), part(G.sphere, '#58cf72', { p: [x + 0.8, top + 0.2, z - 0.1], s: [0.55, 0.36, 0.3] }));
  }
  return P2;
}

// ---- the Volcano Spirit ------------------------------------------------------------------------------------------------------------------------------------
function spiritParts(hot) {
  const body = hot ? ['#ff6a2a', '#ff8a3a', '#ffb34a'] : ['#6c6a78', '#7f7d8c', '#9a98a6'];
  const P2 = [];
  P2.push(part(G.sphere, body[0], { p: [0, 0.95, 0], s: [1.6, 1.0, 0.95] }));
  P2.push(part(G.sphere, body[1], { p: [0, 1.05, 0.25], s: [1.35, 0.8, 0.75] }));
  P2.push(part(G.sphere, body[0], { p: [-1.3, 0.55, 0.1], s: [0.55, 0.5, 0.5] })); P2.push(part(G.sphere, body[0], { p: [1.3, 0.55, 0.1], s: [0.55, 0.5, 0.5] }));        // little arm blobs
  P2.push(part(G.sphere, body[2], { p: [0, 0.4, 0.5], s: [1.3, 0.35, 0.5] }));
  if (hot) {
    for (const [dx, h] of [[-0.8, 0.9], [-0.35, 1.3], [0.2, 1.1], [0.75, 0.85], [0.0, 1.55]]) P2.push(part(G.cone6, h > 1.2 ? '#ffe27a' : '#ffb34a', { p: [dx, 1.75 + h * 0.2, 0], s: [0.34, h, 0.3] }));
    P2.push(part(G.sphere, '#ffffff', { p: [-0.5, 1.15, 0.92], s: [0.34, 0.38, 0.12] })); P2.push(part(G.sphere, '#ffffff', { p: [0.5, 1.15, 0.92], s: [0.34, 0.38, 0.12] }));          // eyes
    P2.push(part(G.sphereLo, '#2b2340', { p: [-0.46, 1.1, 1.01], s: [0.15, 0.2, 0.08] })); P2.push(part(G.sphereLo, '#2b2340', { p: [0.46, 1.1, 1.01], s: [0.15, 0.2, 0.08] }));
    P2.push(box('#2b2340', [-0.52, 1.52, 0.98], [0.62, 0.12, 0.08], [0, 0, -0.45])); P2.push(box('#2b2340', [0.52, 1.52, 0.98], [0.62, 0.12, 0.08], [0, 0, 0.45]));                        // angry brows
    P2.push(part(G.sphere, '#7a1d1d', { p: [0, 0.62, 0.98], s: [0.62, 0.3, 0.12] }));
    for (const dx of [-0.35, -0.1, 0.15, 0.4]) P2.push(box('#fff4dc', [dx, 0.78, 1.06], [0.12, 0.14, 0.05]));                                                                           // teeth
  } else {
    for (const [dx, h] of [[-0.6, 0.25], [0.1, 0.32], [0.65, 0.22]]) P2.push(part(G.cone6, '#55535f', { p: [dx, 1.85 + h * 0.1, 0], s: [0.3, h, 0.26] }));
    P2.push(box('#2b2340', [-0.5, 1.12, 0.98], [0.44, 0.07, 0.06])); P2.push(box('#2b2340', [0.5, 1.12, 0.98], [0.44, 0.07, 0.06]));                                                      // shut eyes
    P2.push(part(G.sphere, '#4a4854', { p: [0, 0.65, 0.98], s: [0.3, 0.1, 0.1] }));
    for (const [dx, dy, r] of [[-0.9, 1.3, 0.5], [0.9, 1.0, -0.6], [0.3, 1.55, 0.3]]) P2.push(box('#ff7a3a', [dx, dy, 0.9], [0.5, 0.045, 0.05], [0, 0, r]));                                      // glowing cracks
    P2.push(part(G.sphereLo, '#cfd3d9', { p: [0.85, 1.9, 0.5], s: [0.26, 0.2, 0.2] })); P2.push(part(G.sphereLo, '#cfd3d9', { p: [1.15, 2.2, 0.5], s: [0.19, 0.15, 0.15] }));         // sleepy smoke
  }
  return P2;
}
const globGeo = () => combine([part(G.sphere, '#ff7a2a', { s: [0.5, 0.5, 0.5] }), part(G.sphere, '#ffd05a', { p: [0.1, 0.12, 0.3], s: [0.26, 0.26, 0.22] }), part(G.cone6, '#ff9a3a', { p: [-0.2, 0.55, 0], s: [0.22, 0.5, 0.2] })]);
function plaqueParts(page) {
  const bs = page.boss, ox = PAGE.x - page.W / 2, oy = PAGE.y - page.floorRows, z = PAGE.z + 1.66, P2 = [];
  const x0 = ox + bs.ring[0], x1 = ox + bs.ring[1] + 1, base = oy + bs.y - 1;
  P2.push(box('#8d8a96', [(x0 + x1) / 2, oy + bs.y - 0.5 + 0.02, z], [x1 - x0, 1.0, 0.1]));
  for (let k = 0; k < 4; k++) P2.push(box('#ff7a3a', [x0 + (x1 - x0) * (0.2 + k * 0.2), oy + bs.y - 0.5, z + 0.06], [0.12, 0.5, 0.04]));
  P2.push(box('#6c6a78', [(x0 + x1) / 2, oy + bs.y + 0.02, PAGE.z], [x1 - x0 + 0.2, 0.12, 3.4]));
  return P2;
}

export function createPageJungleVisuals(scene) {
  const group = new THREE.Group();
  group.name = 'storybook-jungle';
  group.visible = false;
  scene.add(group);
  let built = null;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

  function instanced(geo, count, name, hull = 0.03, material = VERTEX_TOON) {
    const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, count));
    mesh.name = name; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.count = 0;
    group.add(mesh);
    const owned = [mesh], disposables = [geo];
    let hullMesh = null;
    if (hull) {
      const o = makeOutline(geo, hull);
      hullMesh = new THREE.InstancedMesh(o.geometry, o.material, Math.max(1, count));
      hullMesh.name = `${name}-outline`; hullMesh.instanceMatrix = mesh.instanceMatrix; hullMesh.renderOrder = -1; hullMesh.frustumCulled = false; hullMesh.count = 0;
      group.add(hullMesh); owned.push(hullMesh); disposables.push(o.geometry);
    }
    return { mesh, hull: hullMesh, owned, disposables, n: 0, cap: Math.max(1, count) };
  }
  const begin = (L) => { L.n = 0; };
  function push(L, x, y, z, rz, sx, sy, sz, ry = 0) {
    if (L.n >= L.cap) return;
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, ry, rz)), _s.set(sx, sy, sz));
    L.mesh.setMatrixAt(L.n++, _m);
  }
  function pushBetween(L, a, b, rad) {                                          // a unit rope (length 1 along +y) stretched between two points
    if (L.n >= L.cap) return;
    _b.copy(b).sub(a); const len = _b.length() || 1e-4;
    _q.setFromUnitVectors(_up, _b.multiplyScalar(1 / len));
    _m.compose(_a.copy(a), _q, _s.set(rad, len, rad));
    L.mesh.setMatrixAt(L.n++, _m);
  }
  function end(L) { L.mesh.count = L.n; if (L.hull) L.hull.count = L.n; L.mesh.instanceMatrix.needsUpdate = true; }
  function staticMesh(parts, name, hull = 0.05) {
    const geo = combine(parts), mesh = new THREE.Mesh(geo, VERTEX_TOON);
    mesh.name = name; mesh.castShadow = false; mesh.receiveShadow = true;
    const o = hull ? makeOutline(geo, hull) : null;
    if (o) mesh.add(o);
    group.add(mesh);
    return { mesh, owned: [mesh], disposables: o ? [geo, o.geometry] : [geo] };
  }
  const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, ...extra });

  function close() {
    if (!built) return;
    for (const o of built.owned) { o.removeFromParent(); if (o.dispose) o.dispose(); }
    for (const d of built.disposables) d.dispose();
    group.visible = false;
    built = null;
  }

  function open(page) {
    if (built && built.page === page) { group.visible = true; return; }
    close();
    if (page.theme !== 'jungle') return;
    const owned = [], disposables = [];
    const adopt = (L) => { owned.push(...L.owned); disposables.push(...L.disposables); return L; };
    const adoptS = (S) => { owned.push(...S.owned); disposables.push(...S.disposables); return S; };
    const b = built = { page, owned, disposables, t: 0, wasLoaded: new Set(), kick: {}, goalPop: -1, embers: null };
    const ox = PAGE.x - page.W / 2, oy = PAGE.y - page.floorRows, z0 = PAGE.z;
    if (page.vines.length) {
      adoptS(staticMesh(boughParts(page), 'jungle-boughs', 0.05));
      b.ropes = adopt(instanced(ropeGeo(), page.vines.length * SEG, 'jungle-ropes', 0.025));
      b.leaves = adopt(instanced(leafGeo(), page.vines.length * 4, 'jungle-rope-leaves', 0.02));
      b.grips = adopt(instanced(gripGeo(), page.vines.length, 'jungle-rope-grips', 0.02));
    }
    if (page.cannons.length) {
      adoptS(staticMesh(cradleParts(page), 'jungle-cradles', 0.04));
      b.barrels = adopt(instanced(barrelGeo(), page.cannons.length, 'jungle-barrels', 0.04));
      b.dots = adopt(instanced(dotGeo(), page.cannons.length * 8, 'jungle-aim-dots', 0.03));
    }
    b.rivers = [];
    page.canoes.forEach((c, i) => {
      const w0 = ox + c.x0, w1 = ox + c.x1, y = oy + c.y;
      const waterMat = basic('#3fb0e8', { transparent: true, opacity: 0.78 }), waterGeo = new THREE.BoxGeometry(w1 - w0, 6, 3.6);
      const water = new THREE.Mesh(waterGeo, waterMat); water.position.set((w0 + w1) / 2, y - 0.4 - 3, z0 + 0.2); water.name = 'jungle-water';
      const deep = new THREE.Mesh(new THREE.BoxGeometry(w1 - w0, 6, 2.2), basic('#2a86c4')); deep.position.set((w0 + w1) / 2, y - 3.4 - 3, z0 - 1.6); deep.name = 'jungle-water-deep';
      group.add(water, deep); owned.push(water, deep); disposables.push(waterGeo, deep.geometry, waterMat, deep.material);
      const foamMat = basic('#ffffff', { transparent: true, opacity: 0.8 }), foam = adopt(instanced(foamGeo(), 36, `jungle-foam-${i}`, 0, foamMat));
      disposables.push(foamMat);
      const logs = adopt(instanced(logGeo(), Math.max(1, c.logs.length), `jungle-logs-${i}`, 0.03));
      const bg = canoeGeo(), bm = new THREE.Mesh(bg, VERTEX_TOON); bm.name = 'jungle-canoe'; bm.castShadow = false;
      const bo = makeOutline(bg, 0.04); bm.add(bo); group.add(bm); owned.push(bm); disposables.push(bg, bo.geometry);
      b.rivers.push({ i, c, foam, logs, boat: bm, w0, w1, y });
    });
    if (page.canoes.length) adoptS(staticMesh(riverBoughs(page), 'jungle-boughs-river', 0.045));
    if (page.lava) {
      const lv = page.lava, w0 = ox + lv.x0, w1 = ox + lv.x1 + 1;
      const bodyMat = basic('#ff5a1f'), topMat = basic('#ffc04a'), glowMat = basic('#ff7a2a', { transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false });
      const midMat = basic('#ff7a2a'); disposables.push(midMat);
      const mid = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), midMat); mid.name = 'jungle-lava-mid'; group.add(mid); owned.push(mid); disposables.push(mid.geometry); mid.visible = false;
      const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), bodyMat), top = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), topMat), glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowMat);
      body.name = 'jungle-lava'; top.name = 'jungle-lava-top'; glow.name = 'jungle-lava-glow'; glow.renderOrder = 8;
      group.add(body, top, glow); owned.push(body, top, glow); disposables.push(body.geometry, top.geometry, glow.geometry, bodyMat, topMat, glowMat);
      const bubMat = basic('#ffd05a'); disposables.push(bubMat);
      const wavMat = basic('#ffb347'); disposables.push(wavMat);
      b.lava = { body, top, glow, mid, w0, w1, waves: adopt(instanced(G.sphereLo.clone(), 100, 'jungle-lava-waves', 0, wavMat)), bubbles: adopt(instanced(G.sphereLo.clone(), 14, 'jungle-lava-bubbles', 0, bubMat)) };
      for (const o of [body, top, glow]) o.visible = false;
    }
    if (page.boss) {
      const bs = page.boss, hotMat = new THREE.MeshBasicMaterial({ vertexColors: true });
      const hotGeo = combine(spiritParts(true)), coolGeo = combine(spiritParts(false));
      const hot = new THREE.Mesh(hotGeo, hotMat), cool = new THREE.Mesh(coolGeo, VERTEX_TOON), holder = new THREE.Group();
      hot.name = 'jungle-spirit-hot'; cool.name = 'jungle-spirit-cool';
      const ho = makeOutline(hotGeo, 0.05), co = makeOutline(coolGeo, 0.05); hot.add(ho); cool.add(co);
      holder.add(hot, cool); holder.position.set(ox + bs.x, oy + bs.y, z0 + 0.1); group.add(holder);
      const haloMat = basic('#ff8a3a', { transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }), halo = new THREE.Mesh(new THREE.CircleGeometry(2.6, 20), haloMat);
      halo.position.set(0, 1.2, -0.6); halo.renderOrder = 7; holder.add(halo);
      owned.push(holder); disposables.push(hotGeo, coolGeo, ho.geometry, co.geometry, halo.geometry, hotMat, haloMat);
      adoptS(staticMesh(plaqueParts(page), 'jungle-ring-plaque', 0.04));
      const globMat = new THREE.MeshBasicMaterial({ vertexColors: true }), globs = adopt(instanced(globGeo(), B.hp * 3 + 6, 'jungle-globs', 0.03, globMat));
      disposables.push(globMat);
      const warnMat = basic('#ff6a2a', { transparent: true, opacity: 0.4, depthWrite: false }), warn = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.16), warnMat, 8);
      warn.frustumCulled = false; warn.count = 0; warn.name = 'jungle-warn'; warn.renderOrder = 6; group.add(warn);
      const shMat = basic('#2b1a12', { transparent: true, opacity: 0.35, depthWrite: false }), shadow = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 4), shMat, 8);
      shadow.frustumCulled = false; shadow.count = 0; shadow.name = 'jungle-glob-shadows'; group.add(shadow);
      owned.push(warn, shadow); disposables.push(warn.geometry, shadow.geometry, warnMat, shMat);
      const goalGeo = combine(goalParts(page)), goal = new THREE.Mesh(goalGeo, VERTEX_TOON), gh = makeOutline(goalGeo, 0.035);
      goal.add(gh); goal.visible = false; goal.name = 'jungle-boss-goal'; group.add(goal); owned.push(goal); disposables.push(goalGeo, gh.geometry);
      const gw = pageToWorld(page, page.goal.x, page.goal.y); goal.position.set(0, 0, 0);
      b.boss = { holder, hot, cool, halo, globs, warn, shadow, goal, gx: gw.x, gy: gw.y, spec: bs, lastGlobs: 0, stretch: 0 };
    }
    {                                                                              // warm embers drifting up round the camera
      const n = 70, pos = new Float32Array(n * 3), geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ color: '#ffb066', size: 0.22, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
      const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.name = 'jungle-embers'; group.add(pts);
      owned.push(pts); disposables.push(geo, mat);
      b.embers = { pts, pos, n };
    }
    group.visible = true;
  }

  const wp = (page, x, y) => pageToWorld(page, x, y);

  function update(t, dt, ctx) {
    const b = built; if (!b) return;
    const page = b.page, clock = ctx.clock || 0, ox = PAGE.x - page.W / 2, oy = PAGE.y - page.floorRows, z0 = PAGE.z, run = ctx.run || {};
    b.t = t;
    // ---- vines
    if (b.ropes) {
      begin(b.ropes); begin(b.leaves); begin(b.grips);
      page.vines.forEach((v, i) => {
        const sw = (ctx.swingers || []).find((s) => s.i === i);
        const ax = ox + v.x, ay = oy + v.y;
        _a.set(ax, ay, z0 - 0.25);
        let tx, ty, bendX = 0;
        if (sw) {                                                               // straight through the swinger's hand to the rope's end
          const hx = sw.x, hy = sw.y + J.vine.hand, dx = hx - ax, dy = hy - ay, d = Math.hypot(dx, dy) || 1;
          tx = ax + (dx / d) * v.len; ty = ay + (dy / d) * v.len;
        } else { tx = ax; ty = ay - v.len; bendX = Math.sin(t * 0.9 + i * 1.7) * 0.18; }
        for (let k = 0; k < SEG; k++) {
          const u0 = k / SEG, u1 = (k + 1) / SEG;
          const p0 = _a.set(ax + (tx - ax) * u0 + bendX * u0 * u0, ay + (ty - ay) * u0, z0 - 0.25).clone(), p1 = _b.set(ax + (tx - ax) * u1 + bendX * u1 * u1, ay + (ty - ay) * u1, z0 - 0.25).clone();
          pushBetween(b.ropes, p0, p1, 1);
        }
        for (let k = 0; k < 4; k++) { const u = 0.22 + k * 0.2; push(b.leaves, ax + (tx - ax) * u + bendX * u * u, ay + (ty - ay) * u, z0 - 0.15, Math.sin(t * 1.3 + k + i) * 0.2, 1.1, 1.1, 1.1); }
        push(b.grips, tx + bendX, ty, z0 - 0.15, 0, 1, 1, 1);
      });
      end(b.ropes); end(b.leaves); end(b.grips);
    }
    // ---- cannons
    if (b.barrels) {
      begin(b.barrels); begin(b.dots);
      page.cannons.forEach((c, i) => {
        const a = cannonAngle(c, clock), w = wp(page, c.x, c.y), loaded = ctx.loaded && ctx.loaded.has(i);
        if (b.wasLoaded.has(i) && !loaded) b.kick[i] = 0.32;
        const kk = b.kick[i] > 0 ? (b.kick[i] -= dt, Math.max(0, b.kick[i]) / 0.32) : 0, sc = 1 + (loaded ? 0.1 + Math.sin(t * 14) * 0.04 : 0) - kk * 0.12;
        push(b.barrels, w.x - Math.cos(a) * kk * 0.35, w.y - Math.sin(a) * kk * 0.35, z0 + 0.05, a, sc, sc, sc);
        const sp = c.speed || J.cannon.speed, vx = Math.cos(a) * sp, vy = Math.sin(a) * sp;
        for (let k = 0; k < 8; k++) {
          const tt = 0.12 + k * 0.1, x = w.x + vx * tt, y = w.y - 0.7 + 0.7 + vy * tt - 0.5 * P.gravity * tt * tt, sz = 1.35 - k * 0.1;
          push(b.dots, x, y, z0 + 0.2, 0, sz, sz, sz);
        }
      });
      b.wasLoaded = new Set(ctx.loaded || []);
      end(b.barrels); end(b.dots);
    }
    // ---- the rivers
    for (const R of b.rivers) {
      const c = R.c, span = R.w1 - R.w0;
      begin(R.foam);
      for (let k = 0; k < 36; k++) { const x = R.w0 + frac(hash(k, 1) + clock * (0.05 + hash(k, 5) * 0.03)) * span; push(R.foam, x, R.y - 0.38 + 0.02, z0 + 0.9 + (k % 3) * 0.45, 0, 1 + hash(k, 2), 1, 1); }
      end(R.foam);
      begin(R.logs);
      c.logs.forEach((lx, k) => push(R.logs, ox + lx, R.y - 0.08 + Math.sin(t * 1.6 + k * 2.1) * 0.05, z0, Math.sin(t * 1.1 + k) * 0.05, 1, 1, 1));
      end(R.logs);
      const cx = ox + canoeCenter(c, run, clock, R.i);
      const moving = !canoeDocked(c, run, clock, R.i) && !!(run.canoe && run.canoe.i === R.i);
      R.boat.position.set(cx, R.y - 0.05 + Math.sin(t * 1.9) * (moving ? 0.035 : 0.02), z0 + 0.02);
      R.boat.rotation.z = Math.sin(t * 1.4) * (moving ? 0.025 : 0.012);
    }
    // ---- lava
    if (b.lava) {
      const L = b.lava, lv = page.lava, y = lavaLevel(lv, run.lava, clock), on = y !== null;
      for (const o of [L.body, L.top, L.glow, L.mid]) o.visible = on;
      if (on) {
        const wy = oy + y, bottom = oy - 3, w = L.w1 - L.w0 + 1.6, cx = (L.w0 + L.w1) / 2;
        L.body.position.set(cx, (wy + bottom) / 2 - 0.15, z0 + 0.3); L.body.scale.set(w, wy - bottom - 0.3, 4.4);
        L.mid.position.set(cx, wy - 0.95, z0 + 0.32); L.mid.scale.set(w, 1.4, 4.45);
        begin(L.waves);
        for (let k = 0; k * 1.1 < L.w1 - L.w0 + 1.2 && k < 100; k++) push(L.waves, L.w0 - 0.6 + k * 1.1, wy - 0.02 + Math.sin(t * 2.1 + k * 0.9) * 0.1 + Math.sin(t * 3.3 + k * 2.1) * 0.05, z0 + 2.45, 0, 0.75, 0.28 + 0.1 * Math.sin(t * 1.7 + k), 0.9);
        end(L.waves);
        L.top.position.set(cx, wy - 0.15 + Math.sin(t * 2.4) * 0.05, z0 + 0.3); L.top.scale.set(w, 0.34, 4.5);
        L.glow.position.set(cx, wy + 2.4, z0 + 2.7); L.glow.scale.set(w, 5.2, 1);
        L.glow.material.opacity = 0.26 + Math.sin(t * 3.1) * 0.04;
        begin(L.bubbles);
        for (let k = 0; k < 14; k++) { const u = frac(t * 0.35 + hash(k, 3)), x = L.w0 + hash(k, 4) * (L.w1 - L.w0), s = 0.1 + hash(k, 6) * 0.14; push(L.bubbles, x, wy + Math.sin(u * Math.PI) * (0.5 + hash(k, 7)), z0 + 2.2, 0, s, s * (u > 0.85 ? 0.3 : 1), s); }
        end(L.bubbles);
      } else { L.bubbles.mesh.count = 0; L.waves.mesh.count = 0; }
    }
    // ---- the Volcano Spirit
    const S = b.boss;
    if (S) {
      const bs = ctx.world && ctx.world.boss;
      const st = bs ? bs.st : 'sleep', age = bs ? bs.t : 0;
      const isHot = st === 'idle' || st === 'lob' || st === 'rise' || st === 'sink';
      const flash = st === 'hurt' && Math.floor(age * 14) % 2 === 0;
      S.hot.visible = isHot && !flash; S.cool.visible = !isHot && st !== 'dead' || flash;
      S.halo.visible = isHot; S.halo.material.opacity = 0.26 + Math.sin(t * 5) * 0.06;
      const rect = bs ? bossRect(bs) : [0, 0, 0, 2.3], hNow = Math.max(0.05, rect[3] - rect[1]), kY = st === 'dead' ? 0.001 : hNow / B.hHot;
      let sy = isHot ? 1 + Math.sin(t * 3.2) * 0.04 : 1, sx = 1;
      if (st === 'sink') sy = Math.max(0.35, hNow / B.hHot);
      if (st === 'rise') { const u = Math.min(1, age / B.rise); sy = 0.5 + 0.5 * u; }
      if (st === 'cooled' || st === 'hurt') sy = 0.7 + Math.sin(t * 1.2) * 0.015;
      if (st === 'sleep') sy = 0.62 + Math.sin(t * 0.9) * 0.02;
      if (st === 'hurt') sx = 1 + Math.sin(age * 40) * 0.05 * (1 - age / B.hurt);
      if (bs && bs.globs.length) { const newest = bs.globs.reduce((m, g) => Math.min(m, g.age), 9); if (newest < 0.25) sy += Math.sin((newest / 0.25) * Math.PI) * 0.18; }
      S.holder.visible = st !== 'dead' || age < 1.0;
      const dead = st === 'dead' ? Math.max(0, 1 - age / 1.0) : 1;
      S.holder.scale.set(sx * (0.9 + 0.1 * dead), sy * Math.max(0.05, dead) * (st === 'dead' ? 0.7 : 1), 1);
      if (st === 'dead' && age < 1.0) S.cool.visible = true;
      // the globs and their warnings
      const list = bs ? bs.globs : [];
      begin(S.globs); S.warn.count = 0; S.shadow.count = 0;
      list.forEach((g, k) => {
        const u = Math.min(1, g.age / g.dur), x0 = ox + g.x0, y0 = oy + g.y0, tx = ox + g.tx, ty = oy + g.ty;
        const x = x0 + (tx - x0) * u, y = y0 + (ty - y0) * u + 6 * 4 * u * (1 - u);
        push(S.globs, x, y, z0 + 0.3, t * 3 + k, 1, 1, 1);
        const h = 0.3 + 1.7 * u, pulse = 0.7 + 0.3 * Math.sin(t * 22 + k), w = (1 + (1 - u) * 0.7) * 2 * B.splash * (0.35 + 0.65 * u);
        _m.compose(_p.set(tx, ty + h / 2, z0 + 0.2), _q.identity(), _s.set(w, h, 1)); S.warn.setMatrixAt(k, _m);
        _m.compose(_p.set(tx, ty + 0.05, z0 + 0.3), _q.identity(), _s.set(B.splash * (0.4 + 0.8 * u), 0.05 + 0.08 * u, 0.9)); S.shadow.setMatrixAt(k, _m);
        S.warn.material.opacity = 0.25 + 0.2 * pulse;
      });
      end(S.globs);
      S.warn.count = Math.min(8, list.length); S.shadow.count = Math.min(8, list.length);
      S.warn.instanceMatrix.needsUpdate = true; S.shadow.instanceMatrix.needsUpdate = true;
      // the goal bookmark rises when the spirit is beaten
      const down = st === 'dead';
      if (down && S.goalPop < 0) { S.goalPop = ctx.silentGoal ? 1 : 0; S.goal.visible = true; if (!ctx.silentGoal && ctx.particles) ctx.particles.burst('sparkle', new THREE.Vector3(S.gx, S.gy + 3, z0 - 0.9), { count: 20, radius: 2, color: '#ffe27a' }); }
      if (!down) { S.goalPop = -1; S.goal.visible = false; }
      if (S.goalPop >= 0) { S.goalPop = Math.min(1, S.goalPop + dt / 0.9); const k = S.goalPop >= 1 ? 1 : 1 - Math.pow(1 - S.goalPop, 3) * Math.cos(S.goalPop * 8) * 0.9; S.goal.scale.set(Math.max(0.01, k), Math.max(0.01, k), 1); S.goal.position.set(S.gx * (1 - Math.max(0.01, k)), S.gy * (1 - Math.max(0.01, k)), 0); }
    }
    // ---- embers
    if (b.embers) {
      const E = b.embers, fx = ctx.focusX ?? PAGE.x;
      for (let k = 0; k < E.n; k++) {
        const u = frac(t * (0.08 + hash(k, 8) * 0.06) + hash(k, 9));
        E.pos[k * 3] = fx - 18 + hash(k, 10) * 36 + Math.sin(t * 0.7 + k) * 0.6; E.pos[k * 3 + 1] = PAGE.y - 1 + u * 20; E.pos[k * 3 + 2] = PAGE.z + 1 + hash(k, 11) * 4;
      }
      E.pts.geometry.attributes.position.needsUpdate = true;
    }
  }

  return {
    group, open, close, update,
    get isOpen() { return !!built && group.visible; },
    summary() {
      if (!built) return { open: false };
      let calls = 0;
      group.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.visible && (!o.isInstancedMesh || o.count > 0)) calls += 1; if (o.isPoints && o.visible) calls++; });
      return { open: true, page: built.page.id, drawCalls: calls, vines: built.page.vines.length, cannons: built.page.cannons.length, rivers: built.rivers.length, lava: !!built.lava, boss: !!built.boss };
    },
  };
}
