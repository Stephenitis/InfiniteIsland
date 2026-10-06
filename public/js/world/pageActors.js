// What lives ON a storybook page besides the tiles (Step 50): the tool bookmark stands, the choppable trees, the dig spots, the pressed flowers, the three enemies and the throwable
// things. Everything is the game's own chunky toon style (vertex-coloured merged meshes with the dark outline hull) and mostly INSTANCED: one draw call per kind (+ its hull). It only
// DRAWS: the rules live in game/pageWorldLogic.js (the world state), the sync + presentation in game/pageWorld.js.
//
//   const actors = createPageActors(scene)
//   actors.open(page, visualsGroup)         build the static pieces (stands, trees, dig spots) and the instanced layers for the page; actors.close() frees everything
//   actors.update(t, dt, world, ctx)        once per frame: places every enemy / object / flower from the world state. ctx = { run (flowers found), holderPos(key) -> Vector3 | null }
//   actors.treeHit(i) / treeFall(i, dir, done)   wobble a tree / tip it over (done() when it lies down: the log tiles take over)
//   actors.crateDrop(cx, cy, landY, done)   a hanging crate falling to where it becomes a block (done() on landing)
//   actors.standPos(i) / enemyPos(e) / objectPos(o)     world positions (prompt bubbles, particles)
// Draw calls with the Woodcutter's Way busiest view (4 stands, 3 trees, 4 enemies, a handful of objects): about 36.
import * as THREE from 'three';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../render/geo.js';
import { buildItemModel } from '../items/models.js';
import { PAGE, pageToWorld } from '../game/storybookLogic.js';
import { BOX, OBJ_BOX } from '../game/pageWorldLogic.js';

const BOX1 = new THREE.BoxGeometry(1, 1, 1);
const box = (color, p, s, r = [0, 0, 0]) => part(BOX1, color, { p, s, r });
const STAND_COLORS = { axe: '#ff7c6b', hammer: '#ffd85e', shovel: '#6fe0a6', sword: '#c79bff' };
const TOOL_ORDER = ['axe', 'hammer', 'shovel', 'sword'];

// ---- models (facing +x, feet at the origin, one tile = one unit) ------------------------------------------------------------------------------------------
function acornGeo() {
  return combine([
    part(G.sphere, '#c98a54', { p: [0, 0.34, 0], s: [0.36, 0.32, 0.34] }),
    part(G.sphere, '#7a4a2a', { p: [0, 0.6, 0], s: [0.4, 0.2, 0.38] }),
    part(G.cone6, '#5a3a22', { p: [0.02, 0.84, 0], s: [0.07, 0.16, 0.07] }),
    part(G.sphereLo, '#ffffff', { p: [0.26, 0.42, 0.14], s: [0.1, 0.11, 0.06] }), part(G.sphereLo, '#ffffff', { p: [0.26, 0.42, -0.14], s: [0.1, 0.11, 0.06] }),
    part(G.sphereLo, '#2b2340', { p: [0.32, 0.41, 0.14], s: [0.05, 0.06, 0.04] }), part(G.sphereLo, '#2b2340', { p: [0.32, 0.41, -0.14], s: [0.05, 0.06, 0.04] }),
    box('#2b2340', [0.3, 0.53, 0.14], [0.04, 0.14, 0.05], [0, 0, 0.9]), box('#2b2340', [0.3, 0.53, -0.14], [0.04, 0.14, 0.05], [0, 0, 0.9]),
    part(G.sphereLo, '#7a4a2a', { p: [0.06, 0.07, 0.15], s: [0.14, 0.08, 0.1] }), part(G.sphereLo, '#7a4a2a', { p: [0.06, 0.07, -0.15], s: [0.14, 0.08, 0.1] }),
  ]);
}
function shellParts(withBody) {
  const P = [
    part(G.sphere, '#e8554e', { p: [0, 0.3, 0], s: [0.42, withBody ? 0.3 : 0.28, 0.46] }),
    part(G.sphereLo, '#2b2340', { p: [-0.1, 0.52, 0.1], s: [0.1, 0.05, 0.1] }), part(G.sphereLo, '#2b2340', { p: [0.12, 0.5, -0.12], s: [0.09, 0.05, 0.09] }), part(G.sphereLo, '#2b2340', { p: [0.0, 0.5, -0.26], s: [0.07, 0.04, 0.07] }),
    box('#fff4dc', [0, 0.28, 0], [0.8, 0.05, 0.9]),
  ];
  return P;
}
function beetleGeo() {
  return combine([
    ...shellParts(true),
    part(G.sphere, '#2b2340', { p: [0.4, 0.28, 0], s: [0.2, 0.18, 0.2] }),
    part(G.sphereLo, '#ffffff', { p: [0.52, 0.34, 0.08], s: [0.05, 0.06, 0.04] }), part(G.sphereLo, '#ffffff', { p: [0.52, 0.34, -0.08], s: [0.05, 0.06, 0.04] }),
    ...[-0.2, 0, 0.2].flatMap((x) => [part(G.cyl6, '#2b2340', { p: [x, 0.09, 0.28], r: [0.5, 0, 0], s: [0.04, 0.2, 0.04] }), part(G.cyl6, '#2b2340', { p: [x, 0.09, -0.28], r: [-0.5, 0, 0], s: [0.04, 0.2, 0.04] })]),
  ]);
}
const shellGeo = () => combine(shellParts(false));
function bushGeo() {
  const P = [
    part(G.sphere, '#3f9a5a', { p: [0, 0.55, 0], s: [0.58, 0.5, 0.56] }),
    part(G.sphere, '#58c96b', { p: [-0.2, 0.7, 0.1], s: [0.32, 0.28, 0.3] }),
    part(G.sphereLo, '#ffffff', { p: [0.4, 0.62, 0.17], s: [0.1, 0.12, 0.06] }), part(G.sphereLo, '#ffffff', { p: [0.4, 0.62, -0.17], s: [0.1, 0.12, 0.06] }),
    part(G.sphereLo, '#2b2340', { p: [0.47, 0.61, 0.17], s: [0.05, 0.06, 0.04] }), part(G.sphereLo, '#2b2340', { p: [0.47, 0.61, -0.17], s: [0.05, 0.06, 0.04] }),
    box('#2b2340', [0.45, 0.76, 0.17], [0.04, 0.16, 0.05], [0, 0, 0.9]), box('#2b2340', [0.45, 0.76, -0.17], [0.04, 0.16, 0.05], [0, 0, 0.9]),
    part(G.sphereLo, '#ff4f6d', { p: [0.15, 0.85, 0.2], s: [0.1, 0.1, 0.1] }), part(G.sphereLo, '#ff4f6d', { p: [-0.25, 0.9, -0.1], s: [0.1, 0.1, 0.1] }),
  ];
  for (let k = 0; k < 12; k++) { const a = k * 0.52; P.push(part(G.cone6, '#ff5d86', { p: [Math.cos(a) * 0.56, 0.5 + Math.sin(a * 1.7) * 0.28, Math.sin(a) * 0.5], r: [Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0], s: [0.07, 0.24, 0.07] })); }
  return combine(P);
}
const stoneGeo = () => combine([part(G.ico1, '#9ea5b0', { p: [0, 0.22, 0], s: [0.27, 0.22, 0.25] }), part(G.ico1, '#c3c9d3', { p: [-0.06, 0.3, 0.12], s: [0.1, 0.07, 0.07] })]);
const fruitGeo = () => combine([part(G.sphere, '#8c5a34', { p: [0, 0.3, 0], s: [0.3, 0.29, 0.3] }), part(G.sphereLo, '#3b2418', { p: [0.1, 0.45, 0.18], s: [0.05, 0.05, 0.04] }), part(G.sphereLo, '#3b2418', { p: [-0.05, 0.47, 0.2], s: [0.05, 0.05, 0.04] }), part(G.sphereLo, '#3b2418', { p: [0.04, 0.38, 0.26], s: [0.05, 0.05, 0.04] }), part(G.cone6, '#58c96b', { p: [0, 0.62, 0], s: [0.06, 0.12, 0.06] })]);
const logGeo = () => combine([part(G.cyl8, '#9a6a44', { p: [0, 0.22, 0], r: [0, 0, Math.PI / 2], s: [0.22, 1.05, 0.22] }), part(G.cyl8, '#d9b384', { p: [0.52, 0.22, 0], r: [0, 0, Math.PI / 2], s: [0.19, 0.05, 0.19] }), part(G.cyl8, '#d9b384', { p: [-0.52, 0.22, 0], r: [0, 0, Math.PI / 2], s: [0.19, 0.05, 0.19] })]);
const seedGeo = () => combine([part(G.sphere, '#7cc94f', { p: [0, 0.17, 0], s: [0.16, 0.16, 0.16] }), part(G.cone6, '#ff5d86', { p: [0.1, 0.17, 0], r: [0, 0, -Math.PI / 2], s: [0.07, 0.14, 0.07] })]);
function flowerCardGeo() {
  const P = [box('#fff4dc', [0, 0.45, 0], [0.62, 0.84, 0.05]), box('#e6d2a8', [0, 0.45, -0.035], [0.66, 0.88, 0.02]), part(G.cyl6, '#58c96b', { p: [0, 0.3, 0.04], s: [0.025, 0.4, 0.02] })];
  for (let k = 0; k < 5; k++) { const a = k * 1.2566 + 0.3; P.push(part(G.sphere, '#ff93c6', { p: [Math.cos(a) * 0.15, 0.62 + Math.sin(a) * 0.15, 0.06], s: [0.1, 0.1, 0.03] })); }
  P.push(part(G.sphere, '#ffd85e', { p: [0, 0.62, 0.075], s: [0.075, 0.075, 0.03] }));
  P.push(part(G.sphere, '#7fd36a', { p: [-0.12, 0.28, 0.06], r: [0, 0, 0.7], s: [0.12, 0.05, 0.02] }));
  return combine(P);
}
function moundGeo() {
  return combine([part(G.sphere, '#a6764a', { p: [0, 0.05, 0], s: [0.46, 0.26, 0.4] }), part(G.sphereLo, '#c99a66', { p: [-0.12, 0.2, 0.1], s: [0.1, 0.06, 0.08] }), part(G.sphereLo, '#fff2b0', { p: [0.14, 0.22, 0.16], s: [0.06, 0.06, 0.04] })]);
}
const holeGeo = () => combine([part(G.sphere, '#3b2a1c', { p: [0, 0.01, 0], s: [0.4, 0.04, 0.34] })]);
function treeGeo() {                                                       // a pop-up tree to chop, base at the origin (like the page's decor trees)
  const P = [box('#9a6a44', [0, 2.6, 0], [0.78, 5.2, 0.7]), box('#7c5233', [0.2, 2.2, 0.37], [0.2, 4, 0.04])];
  for (const [dx, dy, rx, ry, c] of [[0, 0, 2.6, 2.0, '#4fbf6e'], [-1.7, -0.5, 1.7, 1.4, '#4fbf6e'], [1.8, -0.4, 1.8, 1.5, '#6dd079'], [-0.6, 1.2, 1.7, 1.2, '#6dd079'], [1.0, 1.3, 1.5, 1.0, '#6dd079']]) P.push(part(G.sphere, c, { p: [dx, 4.6 + dy, 0], s: [rx, ry, 0.9] }));
  return combine(P);
}
function standGeo(color) {
  const P = [
    part(G.cyl8, '#9a6a44', { p: [0, 1.75, 0], s: [0.1, 3.5, 0.1] }), part(G.sphere, '#ffd85e', { p: [0, 3.55, 0], s: [0.2, 0.2, 0.2] }),
    box(color, [0.45, 2.1, 0.02], [0.8, 2.6, 0.08]), box('#fff4dc', [0.45, 3.28, 0.06], [0.8, 0.12, 0.05]),
    part(G.cone6, color, { p: [0.2, 0.62, 0.02], r: [Math.PI, 0, 0], s: [0.3, 0.5, 0.06] }), part(G.cone6, color, { p: [0.7, 0.62, 0.02], r: [Math.PI, 0, 0], s: [0.3, 0.5, 0.06] }),
    box('#c2494f', [-0.15, 0.2, 0.2], [0.9, 0.4, 0.6]), box('#fff4dc', [-0.15, 0.2, 0.5], [0.8, 0.34, 0.04]),
  ];
  return combine(P);
}

export function createPageActors(scene) {
  const group = new THREE.Group();
  group.name = 'storybook-actors';
  group.visible = false;
  scene.add(group);
  let built = null;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _v = new THREE.Vector3();

  function instanced(geo, count, name, hull = 0.035) {
    const mesh = new THREE.InstancedMesh(geo, VERTEX_TOON, Math.max(1, count));
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
  function push(L, x, y, z, ry, sx, sy, sz, rz = 0, rx = 0) {
    if (L.n >= L.cap) return;
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    L.mesh.setMatrixAt(L.n++, _m);
  }
  function end(L) { L.mesh.count = L.n; if (L.hull) L.hull.count = L.n; L.mesh.instanceMatrix.needsUpdate = true; }

  function singleMesh(geo, name, hull = 0.05) {
    const mesh = new THREE.Mesh(geo, VERTEX_TOON);
    mesh.name = name; mesh.castShadow = false;
    const o = hull ? makeOutline(geo, hull) : null;
    if (o) mesh.add(o);
    return { mesh, geo, hullGeo: o ? o.geometry : null };
  }

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
    const owned = [], disposables = [];
    const adopt = (L) => { owned.push(...L.owned); disposables.push(...L.disposables); return L; };
    const b = built = { page, owned, disposables, stands: [], trees: [], layers: {}, falling: [], t: 0 };
    const z0 = PAGE.z;
    // the tool bookmark stands: a pole, a ribbon in the tool's colour, the tool itself floating and turning above it
    page.stands.forEach((s, i) => {
      const w = pageToWorld(page, s.x, s.y), geo = standGeo(STAND_COLORS[s.tool] || '#ff7c6b');
      const S = singleMesh(geo, `page-stand-${s.tool}`, 0.045);
      S.mesh.position.set(w.x - 0.1, w.y, z0 - 0.5);
      group.add(S.mesh); owned.push(S.mesh); disposables.push(geo); if (S.hullGeo) disposables.push(S.hullGeo);
      const model = buildItemModel(s.tool, {});
      model.scale.setScalar(1.35);
      const holder = new THREE.Group();
      holder.position.set(w.x + 0.25, w.y + 4.4, z0 - 0.5);
      holder.add(model);
      model.traverse((o) => { if (o.geometry) disposables.push(o.geometry); });
      group.add(holder); owned.push(holder);
      b.stands.push({ tool: s.tool, i, pos: new THREE.Vector3(w.x, w.y, z0), holder, model, baseY: w.y + 4.4 });
    });
    // choppable trees
    const tGeo = treeGeo();
    page.trees.forEach((t) => {
      const w = pageToWorld(page, t.x, t.y);
      const T = singleMesh(tGeo.clone(), `page-tree-${t.i}`, 0.08);
      const holder = new THREE.Group();
      holder.position.set(w.x, w.y, z0 - 0.15);
      holder.add(T.mesh);
      group.add(holder); owned.push(holder); disposables.push(T.geo); if (T.hullGeo) disposables.push(T.hullGeo);
      b.trees.push({ i: t.i, holder, pos: new THREE.Vector3(w.x, w.y, z0), wob: 0, lastHits: 0, fall: null, felled: false });
    });
    tGeo.dispose();
    const mkI = (geo, n, name, hull) => adopt(instanced(geo, n, name, hull));
    const L = b.layers;
    if (page.digs.length) { L.mound = mkI(moundGeo(), page.digs.length, 'page-dig-mounds', 0.035); L.hole = mkI(holeGeo(), page.digs.length, 'page-dig-holes', 0); }
    if (page.flowers.length) L.flower = mkI(flowerCardGeo(), page.flowers.length, 'page-flowers', 0.03);
    const count = (k) => page.enemies.filter((e) => e.kind === k).length;
    if (count('acorn')) L.acorn = mkI(acornGeo(), count('acorn'), 'page-acorns', 0.04);
    if (count('beetle')) { L.beetle = mkI(beetleGeo(), count('beetle'), 'page-beetles', 0.04); L.shell = mkI(shellGeo(), count('beetle'), 'page-shells', 0.04); }
    if (count('bush')) L.bush = mkI(bushGeo(), count('bush'), 'page-bushes', 0.045);
    const oc = (k) => page.objects.filter((o) => o.kind === k).length;
    L.stone = mkI(stoneGeo(), Math.max(8, oc('stone') + 8), 'page-stones', 0.03);
    L.fruit = mkI(fruitGeo(), Math.max(4, oc('fruit') + 4), 'page-fruit', 0.03);
    L.log = mkI(logGeo(), Math.max(4, oc('log') + 4), 'page-logs', 0.03);
    if (count('bush')) L.seed = mkI(seedGeo(), 16, 'page-seeds', 0.025);
    group.visible = true;
  }

  const posOf = (page, x, y) => pageToWorld(page, x, y);
  function treeHit(i) { const t = built && built.trees[i]; if (t) t.wob = 1; }
  function treeFall(i, dir, done) {
    const t = built && built.trees[i]; if (!t || t.felled) { if (done) done(); return; }
    t.fall = { at: built.t, dir, done };
  }
  function crateDrop(cx, cy, landY, done) {
    if (!built) { if (done) done(); return; }
    const page = built.page, w = pageToWorld(page, cx + 0.5, cy + 0.5), l = pageToWorld(page, cx + 0.5, landY + 0.5);
    const geo = combine([box('#c28a4f', [0, 0, 0], [0.92, 0.92, 1.5]), box('#8e5b2e', [0, 0, 0.76], [0.84, 0.1, 0.04]), box('#8e5b2e', [0, 0, 0.76], [0.1, 0.84, 0.04])]);
    const C = singleMesh(geo, 'page-crate-drop', 0.04);
    C.mesh.position.set(w.x, w.y, PAGE.z);
    group.add(C.mesh);
    built.falling.push({ mesh: C.mesh, geo, hullGeo: C.hullGeo, from: w.y, to: l.y, at: built.t, done });
  }

  function update(t, dt, world, ctx) {
    const b = built; if (!b) return;
    b.t = t;
    const page = b.page;
    // stands: the tool bobs and turns
    for (const s of b.stands) { s.holder.position.y = s.baseY + Math.sin(t * 2 + s.i) * 0.14; s.model.rotation.y = t * 1.3 + s.i; s.model.rotation.z = Math.sin(t * 1.4 + s.i) * 0.15; }
    // trees
    for (const tr of b.trees) {
      if (!world) break;
      const n = world.hits[`t${tr.i}`] | 0;
      if (n > tr.lastHits) tr.wob = 1;
      tr.lastHits = n;
      const felled = tr.i in world.felled;
      if (felled && !tr.fall && !tr.felled) { tr.felled = true; tr.holder.visible = false; }          // (a late join: the log tiles show it already)
      if (tr.fall) {
        const u = Math.min(1, (t - tr.fall.at) / 0.8), e = u * u;
        tr.holder.rotation.z = -tr.fall.dir * (Math.PI / 2) * (e + (u >= 1 ? 0 : 0) );
        tr.holder.position.y = tr.pos.y - e * 0.0;
        if (u >= 1) { tr.felled = true; tr.holder.visible = false; const d = tr.fall.done; tr.fall = null; if (d) d(); }
      } else if (!tr.felled) { tr.wob = Math.max(0, tr.wob - dt * 2.2); tr.holder.rotation.z = Math.sin(t * 38) * 0.05 * tr.wob; }
    }
    for (let i = b.falling.length - 1; i >= 0; i--) {                                              // crates dropping from their vines
      const c = b.falling[i], u = Math.min(1, (t - c.at) / 0.45);
      c.mesh.position.y = c.from + (c.to - c.from) * u * u;
      if (u >= 1) { c.mesh.removeFromParent(); c.geo.dispose(); if (c.hullGeo) c.hullGeo.dispose(); b.falling.splice(i, 1); if (c.done) c.done(); }
    }
    // dig spots
    const L = b.layers;
    if (L.mound) {
      begin(L.mound); begin(L.hole);
      for (const d of page.digs) {
        const w = posOf(page, d.x, d.y), dug = world && world.dug.includes(d.i);
        if (dug) push(L.hole, w.x, w.y + 0.02, PAGE.z + 0.1, 0, 1, 1, 1); else push(L.mound, w.x, w.y, PAGE.z + 0.1, 0, 1 + Math.sin(t * 3 + d.i) * 0.04, 1 + Math.sin(t * 3 + d.i) * 0.08, 1);
      }
      end(L.mound); end(L.hole);
    }
    // pressed flowers
    if (L.flower) {
      begin(L.flower);
      page.flowers.forEach((f) => {
        if (ctx && ctx.run && ctx.run.flowers && ctx.run.flowers.includes(f.id)) return;
        if (f.buried !== null && !(world && world.dug.includes(f.buried))) return;
        const w = posOf(page, f.x, f.y);
        push(L.flower, w.x, w.y - 0.4 + Math.sin(t * 2.2 + f.id) * 0.1, PAGE.z, t * 1.6 + f.id, 1.3, 1.3, 1.3);
      });
      end(L.flower);
    }
    if (!world) return;
    // enemies
    for (const k of ['acorn', 'beetle', 'shell', 'bush']) if (L[k]) begin(L[k]);
    for (const e of world.enemies) {
      if (e.st === 'dead') continue;
      let wx, wy;
      if (e.holder && ctx.holderPos) { const hp = ctx.holderPos(e.holder); if (hp) { wx = hp.x; wy = hp.y + 1.75; } }
      if (wx === undefined) { const w = posOf(page, e.x, e.y); wx = w.x; wy = w.y; }
      if (e.rx === undefined || Math.abs(e.rx - wx) > 4 || Math.abs(e.ry - wy) > 4) { e.rx = wx; e.ry = wy; }
      const k = 1 - Math.exp(-22 * dt);
      e.rx += (wx - e.rx) * k; e.ry += (wy - e.ry) * k;
      const ry = e.dir < 0 ? Math.PI : 0, bob = Math.sin(t * 9 + e.id * 1.7);
      if (e.kind === 'acorn') {
        const stun = e.st === 'stun' || e.st === 'thrown';
        push(L.acorn, e.rx, e.ry + (e.st === 'walk' ? Math.abs(bob) * 0.06 : 0), PAGE.z, ry + (stun ? t * (e.st === 'thrown' ? 14 : 0) : 0), 1.1, 1.1 - (e.st === 'walk' ? Math.abs(bob) * 0.08 : 0), 1.1, stun ? (e.st === 'stun' ? Math.sin(t * 20) * 0.35 + 1.4 : 0) : 0);
      } else if (e.kind === 'beetle') {
        if (e.st === 'walk') push(L.beetle, e.rx, e.ry, PAGE.z, ry, 1.1, 1.1 - Math.abs(bob) * 0.05, 1.1);
        else push(L.shell, e.rx, e.ry, PAGE.z, ry + (e.st === 'slide' || e.st === 'thrown' ? t * 16 : 0), 1.2, 1.2, 1.2, e.st === 'slide' ? 0 : 0);
      } else if (e.kind === 'bush') {
        const sq = e.puff ? 0.85 : 1;
        push(L.bush, e.rx, e.ry, PAGE.z, e.dir < 0 ? Math.PI : 0, 1.15, 1.15 * (1 + Math.sin(t * 2 + e.id) * 0.03) * sq, 1.15);
      }
    }
    for (const k of ['acorn', 'beetle', 'shell', 'bush']) if (L[k]) end(L[k]);
    // throwables
    for (const k of ['stone', 'fruit', 'log', 'seed']) if (L[k]) begin(L[k]);
    for (const o of world.objects) {
      if (o.st === 'gone') continue;
      const l = L[o.kind]; if (!l) continue;
      let wx, wy;
      if (o.holder && ctx.holderPos) { const hp = ctx.holderPos(o.holder); if (hp) { wx = hp.x; wy = hp.y + 1.75; } }
      if (wx === undefined) { const w = posOf(page, o.x, o.y); wx = w.x; wy = w.y; }
      if (o.rx === undefined || Math.abs(o.rx - wx) > 5 || Math.abs(o.ry - wy) > 5) { o.rx = wx; o.ry = wy; }
      const k = 1 - Math.exp(-26 * dt);
      o.rx += (wx - o.rx) * k; o.ry += (wy - o.ry) * k;
      const spin = o.st === 'air' ? t * (o.kind === 'seed' ? 10 : 9) * (o.vx < 0 ? -1 : 1) : 0;
      const sc = o.kind === 'seed' && o.friendly ? 1.4 : 1;
      push(l, o.rx, o.ry, PAGE.z, o.kind === 'log' ? 0 : spin, sc, sc, sc, o.kind === 'log' ? spin * 0.5 : 0);
    }
    for (const k of ['stone', 'fruit', 'log', 'seed']) if (L[k]) end(L[k]);
  }

  return {
    group, open, close, update, treeHit, treeFall, crateDrop,
    get isOpen() { return !!built; },
    standPos: (i) => (built && built.stands[i] ? built.stands[i].pos : null),
    treePos: (i) => (built && built.trees[i] ? built.trees[i].pos : null),
    summary() {
      if (!built) return { open: false };
      let calls = 0;
      group.traverse((o) => { if ((o.isMesh) && o.visible) { if (o.isInstancedMesh && o.count === 0) return; calls++; } });
      return { open: true, drawCalls: calls, stands: built.stands.length, trees: built.trees.length };
    },
  };
}
