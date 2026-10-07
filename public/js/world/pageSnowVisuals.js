// The LOOK of Frostpine Slopes' extras (Step 52b), built live from a page's data and animated from the host's world state. Everything is the game's own chunky toon style and a handful of draw calls:
//
//   icicles        ONE InstancedMesh (+ hull): hanging cones that wobble, fall and stick upright as a plank in a drift (game/pageSnowLogic.js states hang / wobble / fall / stuck / gone)
//   low branches   ONE merged mesh: snowy pine boughs hung from a rope (the sled's ducking obstacles, page.branches)
//   buddy crates   per crate a wooden crate (merged mesh) with the critter it holds sitting on it (npc/critters.js models; a crate whose species was never fed holds a SNOW HARE: the rabbit model with a red scarf)
//   buddies        the critter that follows a player who took one (local bodies and remote avatars alike: built from the world's `buddies`); when the buddy ends it hops away and shrinks
//   sleds          ONE InstancedMesh (+ hull): the sled under every rider (they are drawn from the riders list: local bodies and the pose bits of remote avatars)
//   thaw warning   ONE translucent InstancedMesh: ice from a snowball flickers white for its last PAGE_SNOW.thawWarnS seconds
//   snowfall       ONE Points layer of flakes that follows the camera (only on pages of theme 'snow'); aurora: three additive ribbons painted far behind the page (page.aurora)
//
//   const sv = createPageSnowVisuals(scene)      sv.open(page) / sv.close() / sv.isOpen / sv.update(t, dt, { world, focusX, riders: [{ key, x, y, face, duck, air }], buddies: [{ key, species, x, y, face, air, vx }], bloomK, sfx })
//   sv.summary()                                 draw calls and counts
// Coordinates are WORLD (x, y of the pocket); page tiles go through pageToWorld. Draw calls (Aurora Night, 4 riders / 4 buddies at most): about 40; Snowy Steps with its icicles and one crate: about 20.
import * as THREE from 'three';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../render/geo.js';
import { PAGE, pageToWorld } from '../game/storybookLogic.js';
import { createCritterModel } from '../npc/critters.js';
import { PAGE_SNOW as SN } from '../config.js';
import { FROZEN_WARN } from '../game/pageSnowLogic.js';

const BOX1 = new THREE.BoxGeometry(1, 1, 1);
const box = (color, p, s, r = [0, 0, 0]) => part(BOX1, color, { p, s, r });
const frac = (v) => v - Math.floor(v);
const hash = (i, k) => frac(Math.sin(i * 127.1 + k * 311.7) * 43758.5453);

// ---- geometries ---------------------------------------------------------------------------------------------------------------------------------------------
/** An icicle with its TIP at the origin, hanging DOWN from y = 0.9 (a big cone and two small ones). */
const icicleGeo = () => combine([
  part(G.cone6, '#cfeeff', { p: [0, 0.45, 0], r: [Math.PI, 0, 0], s: [0.2, 0.9, 0.2] }),
  part(G.cone6, '#e8f8ff', { p: [0.16, 0.7, 0.05], r: [Math.PI, 0, 0], s: [0.1, 0.5, 0.1] }),
  part(G.cone6, '#a9dcff', { p: [-0.15, 0.72, -0.04], r: [Math.PI, 0, 0], s: [0.09, 0.44, 0.09] }),
  part(G.sphereLo, '#ffffff', { p: [0, 0.82, 0.12], s: [0.06, 0.2, 0.04] }),
]);
const sledGeo = () => combine([
  box('#b5733a', [0, 0.28, 0], [1.5, 0.12, 0.7]),
  box('#e8554e', [0, 0.36, 0], [1.46, 0.05, 0.62]),
  box('#7a4a2a', [-0.45, 0.1, 0.3], [1.5, 0.08, 0.09]), box('#7a4a2a', [-0.45, 0.1, -0.3], [1.5, 0.08, 0.09]),
  part(G.cyl8, '#7a4a2a', { p: [0.72, 0.18, 0.3], r: [Math.PI / 2, 0, 0], s: [0.1, 0.09, 0.1] }), part(G.cyl8, '#7a4a2a', { p: [0.72, 0.18, -0.3], r: [Math.PI / 2, 0, 0], s: [0.1, 0.09, 0.1] }),
  box('#fff4dc', [-0.55, 0.38, 0], [0.4, 0.03, 0.5]),
]);
const warnGeo = () => combine([box('#ffffff', [0, 0, 0], [1.02, 1.02, 2.6])]);
function branchGeo(page) {
  const P = [], ox = PAGE.x - page.W / 2, oy = PAGE.y - page.floorRows;
  for (const br of page.branches) {
    const x = ox + br.cx + 0.5, y = oy + br.cy + 0.55, z = PAGE.z;
    P.push(box('#7a5233', [x, y + 0.2, z], [1.7, 0.2, 0.3], [0, 0, 0.04]));                                    // the bough
    for (const [dx, dy, s] of [[-0.5, 0.35, 0.5], [0.1, 0.42, 0.62], [0.55, 0.34, 0.46]]) P.push(part(G.sphere, '#3f8f7a', { p: [x + dx, y + dy, z + 0.12], s: [s, s * 0.55, 0.3] }));
    for (const dx of [-0.45, 0.2]) P.push(part(G.sphere, '#f4f8ff', { p: [x + dx, y + 0.62, z + 0.18], s: [0.34, 0.14, 0.26] }));                // snow on it
    for (const dx of [-0.7, 0.7]) P.push(part(G.cyl6, '#a8723f', { p: [x + dx, y + 2.0, z], s: [0.03, 3.6, 0.03] }));      // the ropes it hangs from
  }
  return P;
}
function crateParts() {
  return [
    box('#c28a4f', [0, 0.4, 0], [1.1, 0.8, 0.9]), box('#8e5b2e', [0, 0.78, 0.46], [1.14, 0.08, 0.06]), box('#8e5b2e', [0, 0.04, 0.46], [1.14, 0.08, 0.06]),
    box('#8e5b2e', [-0.5, 0.4, 0.46], [0.08, 0.8, 0.06]), box('#8e5b2e', [0.5, 0.4, 0.46], [0.08, 0.8, 0.06]), box('#fff4dc', [0, 0.42, 0.5], [0.5, 0.3, 0.04]),
    part(G.sphere, '#ff93c6', { p: [0, 0.42, 0.54], s: [0.1, 0.1, 0.03] }),
    box('#f4f8ff', [0, 0.86, 0], [1.2, 0.1, 1.0]),                                                            // snow on the lid line
  ];
}
function scarfParts() { return [box('#e8554e', [0, 0.05, 0], [0.34, 0.1, 0.34]), box('#e8554e', [0.1, -0.1, 0.14], [0.07, 0.24, 0.05], [0, 0, 0.2]), box('#fff4dc', [0, 0.05, 0.17], [0.34, 0.025, 0.02])]; }

export function createPageSnowVisuals(scene) {
  const group = new THREE.Group();
  group.name = 'storybook-page-snow';
  group.visible = false;
  scene.add(group);
  let built = null;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

  function instanced(geo, material, count, name, hull) {
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
  function push(L, x, y, z, ry, sx, sy, sz, rz = 0, rx = 0) {
    if (L.n >= L.cap) return;
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    L.mesh.setMatrixAt(L.n++, _m);
  }
  function end(L) { L.mesh.count = L.n; if (L.hull) L.hull.count = L.n; L.mesh.instanceMatrix.needsUpdate = true; }
  function singleMesh(parts, name, hull = 0.05) {
    const geo = combine(parts), mesh = new THREE.Mesh(geo, VERTEX_TOON);
    mesh.name = name; mesh.castShadow = false;
    const o = hull ? makeOutline(geo, hull) : null;
    if (o) mesh.add(o);
    return { mesh, geo, hullGeo: o ? o.geometry : null };
  }

  function close() {
    if (!built) return;
    for (const b of built.buddies.values()) disposeBuddy(b);
    for (const c of built.crateModels) if (c) { c.model.root.removeFromParent(); c.model.dispose(); if (c.scarf) disposeMesh(c.scarf); }
    for (const o of built.owned) o.removeFromParent();
    for (const d of built.disposables) d.dispose();
    group.visible = false;
    built = null;
  }
  function disposeMesh(m) { m.mesh.removeFromParent(); m.geo.dispose(); if (m.hullGeo) m.hullGeo.dispose(); }
  function disposeBuddy(b) { b.model.root.removeFromParent(); b.model.dispose(); if (b.scarf) disposeMesh(b.scarf); }

  function snowTexture() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'), grad = g.createRadialGradient(16, 16, 1, 16, 16, 15);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.6, 'rgba(255,255,255,0.8)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  function open(page) {
    if (built && built.page === page) { group.visible = true; return; }
    close();
    const owned = [], disposables = [];
    const own = (x) => { owned.push(...x.owned); disposables.push(...x.disposables); return x; };
    const b = built = { page, owned, disposables, icicles: null, branches: null, crateModels: page.crates.map(() => null), buddies: new Map(), leaving: [], sleds: null, warn: null, snow: null, aurora: [], calls: 0, flakes: null };
    if (page.icicles.length) b.icicles = own(instanced(icicleGeo(), VERTEX_TOON, page.icicles.length, 'page-icicles', 0.03));
    if (page.branches.length) { const m = singleMesh(branchGeo(page), 'page-branches', 0.04); group.add(m.mesh); owned.push(m.mesh); disposables.push(m.geo); if (m.hullGeo) disposables.push(m.hullGeo); b.branches = m; }
    page.crates.forEach((c, i) => {                                                                                // the crates themselves (the critters on them wait for the world: what they hold depends on the camp)
      const m = singleMesh(crateParts(), `page-crate-${i}`, 0.04), w = pageToWorld(page, c.x, c.y);
      m.mesh.position.set(w.x, w.y, PAGE.z - 0.1);
      group.add(m.mesh); owned.push(m.mesh); disposables.push(m.geo); if (m.hullGeo) disposables.push(m.hullGeo);
    });
    b.sleds = own(instanced(sledGeo(), VERTEX_TOON, 8, 'page-sleds', 0.035));
    {
      const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false });
      b.warn = own(instanced(warnGeo(), mat, 64, 'page-ice-warn', 0));
      disposables.push(mat);
    }
    if (page.theme === 'snow') {
      const N = 190, pos = new Float32Array(N * 3), geo = new THREE.BufferGeometry(), tex = snowTexture();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ map: tex, color: '#ffffff', size: 0.34, sizeAttenuation: true, transparent: true, depthWrite: false, opacity: 0.9 });
      const pts = new THREE.Points(geo, mat); pts.name = 'page-snowfall'; pts.frustumCulled = false; pts.renderOrder = 7;
      group.add(pts); owned.push(pts); disposables.push(geo, mat); if (tex) disposables.push(tex);
      b.flakes = { N, pos, seed: Array.from({ length: N }, (_, i) => [hash(i, 1), hash(i, 2), hash(i, 3), hash(i, 4)]), pts };
    }
    if (page.aurora) {
      const cols = [['#4dffb0', '#2fd6c8', '#7a6bff'], ['#6fffd0', '#4ad8ff', '#b06bff'], ['#3dffa0', '#38e0b8', '#8a7bff']];
      for (let k = 0; k < 3; k++) {
        const segs = 28, geo = new THREE.PlaneGeometry(1, 1, segs, 1), cs = new Float32Array((segs + 1) * 2 * 3);
        for (let i = 0; i <= segs; i++) for (let r = 0; r < 2; r++) {                                              // two rows of vertices: the bright lower edge and the fading upper edge
          const c = new THREE.Color(cols[k][Math.floor((i / segs) * 2.999)]);
          const f = r === 0 ? 1 : 0.0;
          cs.set([c.r * f, c.g * f, c.b * f], (r * (segs + 1) + i) * 3);
        }
        geo.setAttribute('color', new THREE.BufferAttribute(cs, 3));
        const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.6 });
        const mesh = new THREE.Mesh(geo, mat); mesh.name = `page-aurora-${k}`; mesh.frustumCulled = false; mesh.renderOrder = 2;
        group.add(mesh); owned.push(mesh); disposables.push(geo, mat);
        b.aurora.push({ mesh, geo, segs, k });
      }
    }
    group.visible = true;
  }

  function buddyModel(species) {
    const isHare = species === 'hare', model = createCritterModel(isHare ? 'rabbit' : species);
    const scale = isHare ? 1.25 : species === 'fox' ? 1.25 : 1.45;
    model.root.scale.setScalar(scale);
    let scarf = null;
    if (isHare) { scarf = singleMesh(scarfParts(), 'hare-scarf', 0.03); scarf.mesh.position.set(0, 0.5, 0.18); model.headGroup.add(scarf.mesh); }
    return { model, scarf, scale };
  }

  /** Where the page's tile (tx, ty) is in the world. */
  const W = (page, tx, ty) => pageToWorld(page, tx, ty);

  function update(t, dt, ctx = {}) {
    const bt = built; if (!bt) return;
    const { world, focusX = PAGE.x, riders = [], buddies = [], bloomK = 0 } = ctx, page = bt.page;
    // icicles
    if (bt.icicles && world) {
      begin(bt.icicles);
      for (const ic of world.icicles) {
        if (ic.st === 'gone') continue;
        const w = W(page, ic.x, ic.y);
        if (Math.abs(w.x - focusX) > 60) continue;
        if (ic.st === 'stuck') push(bt.icicles, w.x, w.y + 0.9, PAGE.z - 0.1, 0, 1, 1, 1, Math.PI);
        else push(bt.icicles, w.x + (ic.st === 'wobble' ? Math.sin(t * 52 + ic.id) * 0.05 : 0), w.y, PAGE.z - 0.1, 0, 1, 1, 1, ic.st === 'wobble' ? Math.sin(t * 40 + ic.id) * 0.1 : 0);
      }
      end(bt.icicles);
    }
    // thaw warning: the last seconds of a snowball's ice flicker
    if (bt.warn && world) {
      begin(bt.warn);
      for (const k of Object.keys(world.frozen)) {
        const left = world.frozen[k];
        if (left > FROZEN_WARN || left < -3) continue;
        if (Math.floor(t * 7) % 2) continue;
        const [cx, cy] = k.split(',').map(Number), w = W(page, cx + 0.5, cy + 0.5);
        push(bt.warn, w.x, w.y, PAGE.z, 0, 1, 1, 1);
      }
      end(bt.warn);
    }
    // crates: the critter each holds (built once the world says what the camp provided), idling
    if (world) page.crates.forEach((c, i) => {
      const spec = world.crates[i]; if (!spec) return;
      let cm = bt.crateModels[i];
      if (!cm || cm.species !== spec.species) {
        if (cm) { cm.model.root.removeFromParent(); cm.model.dispose(); if (cm.scarf) disposeMesh(cm.scarf); }
        const bm = buddyModel(spec.species);
        cm = bt.crateModels[i] = { ...bm, species: spec.species };
        group.add(cm.model.root);
      }
      const w = W(page, c.x, c.y);
      cm.model.root.visible = Math.abs(w.x - focusX) < 45;
      cm.model.root.position.set(w.x, w.y + 0.88, PAGE.z - 0.05);
      cm.model.root.rotation.y = Math.PI / 2 + Math.sin(t * 0.7 + i) * 0.35;
      cm.model.rig.position.y = Math.abs(Math.sin(t * 1.6 + i * 2)) * 0.05;
      cm.model.headGroup.rotation.y = Math.sin(t * 0.9 + i) * 0.4;
      cm.model.setBlink(frac(t * 0.37 + i * 0.3) < 0.04 ? 1 : 0);
    });
    // buddies following their players
    const seen = new Set();
    for (const bd of buddies) {
      seen.add(bd.key);
      let b = bt.buddies.get(bd.key);
      if (!b || b.species !== bd.species) {
        if (b) disposeBuddy(b);
        const bm = buddyModel(bd.species);
        b = { ...bm, species: bd.species, x: bd.x - bd.face * 0.8, y: bd.y, vy: 0, yaw: bd.face > 0 ? Math.PI / 2 : -Math.PI / 2, hop: 0 };
        group.add(b.model.root);
        bt.buddies.set(bd.key, b);
      }
      const k = 1 - Math.exp(-7 * dt), tx = bd.x - bd.face * 0.85;
      b.x += (tx - b.x) * k;
      b.y += (bd.y - b.y) * (1 - Math.exp(-14 * dt));
      b.yaw += (((bd.face > 0 ? Math.PI / 2 : -Math.PI / 2) - b.yaw)) * (1 - Math.exp(-10 * dt));
      const speed = Math.min(1, Math.abs(bd.vx || 0) / 6) * (bd.air ? 0.4 : 1);
      b.hop += dt * (3 + speed * 9);
      b.model.root.position.set(b.x, b.y + (bd.air ? 0.25 : 0), PAGE.z - 0.45);
      b.model.root.rotation.y = b.yaw;
      b.model.rig.position.y = Math.abs(Math.sin(b.hop)) * (0.04 + speed * 0.2);
      b.model.rig.rotation.z = (bd.air ? 0.2 : 0) * -bd.face;
      b.model.setBlink(frac(t * 0.41) < 0.04 ? 1 : 0);
    }
    for (const [key, b] of bt.buddies) if (!seen.has(key)) { bt.buddies.delete(key); bt.leaving.push({ b, t: 0 }); }     // the buddy hops away
    for (let i = bt.leaving.length - 1; i >= 0; i--) {
      const l = bt.leaving[i]; l.t += dt;
      const u = Math.min(1, l.t / 0.7), r = l.b.model.root;
      r.position.x += Math.sin(r.rotation.y) * dt * 5; r.position.y += Math.cos(u * Math.PI * 0.5) * dt * 4;       // (hops off the way it faces)
      r.scale.setScalar(l.b.scale * (1 - u * u));
      if (u >= 1) { disposeBuddy(l.b); bt.leaving.splice(i, 1); }
    }
    // sleds under the riders
    begin(bt.sleds);
    for (const r of riders) push(bt.sleds, r.x - 0.05, r.y - 0.04 - (r.duck ? 0.04 : 0), PAGE.z + 0.02, 0, 1, 1, 1, r.air === 1 ? 0.12 : r.air === 2 ? -0.1 : 0);
    end(bt.sleds);
    // snowfall: flakes drift down inside a box that follows the camera
    if (bt.flakes) {
      const F = bt.flakes, pos = F.pos, x0 = focusX - 32, y0 = PAGE.y - 3, H = 26;
      for (let i = 0; i < F.N; i++) {
        const [a, b2, c, d] = F.seed[i], speed = 0.9 + b2 * 1.6, fall = frac(a + (t * speed) / H);
        pos[i * 3] = x0 + frac(c + (focusX * 0.012)) * 64 + Math.sin(t * (0.5 + d) + i) * 0.7;
        pos[i * 3 + 1] = y0 + (1 - fall) * H;
        pos[i * 3 + 2] = PAGE.z - 7 + d * 12;
      }
      F.pts.geometry.attributes.position.needsUpdate = true;
    }
    // aurora ribbons (parallax: they ride the camera x at a fraction)
    for (const A of bt.aurora) {
      const p = A.geo.attributes.position, segs = A.segs, width = 90, cx = PAGE.x + (focusX - PAGE.x) * 0.82, base = PAGE.y + 5.5 + A.k * 2.4, z = PAGE.z - 27 - A.k * 3.5;     // (curtains hung just behind the cut-out layer, in front of the far hills: the camera sees little sky)
      for (let i = 0; i <= segs; i++) {
        const u = i / segs, x = cx + (u - 0.5) * width, wave = Math.sin(u * 7 + t * (0.25 + A.k * 0.1) + A.k * 2) * 1.6 + Math.sin(u * 17 - t * 0.4) * 0.5;
        const h = 5 + 3.5 * (0.5 + 0.5 * Math.sin(u * 5 + t * 0.3 + A.k)) + bloomK * 2;
        p.setXYZ(i, x, base + wave + h, z);                                                                   // (the PlaneGeometry's first row is the top: faded)
        p.setXYZ(segs + 1 + i, x, base + wave, z);
      }
      p.needsUpdate = true;
      A.mesh.material.opacity = 0.42 + 0.1 * Math.sin(t * 0.5 + A.k);
    }
  }

  return {
    group, open, close, update,
    get isOpen() { return !!built; },
    summary() {
      if (!built) return { open: false };
      let calls = 0;
      group.traverse((o) => { if (o.visible && (o.isMesh || o.isPoints)) { if (o.isInstancedMesh && o.count === 0) return; calls += o.castShadow ? 2 : 1; } });
      return { open: true, drawCalls: calls, buddies: built.buddies.size, crates: built.crateModels.filter(Boolean).map((c) => c.species), icicles: built.icicles ? built.icicles.n : 0, sleds: built.sleds ? built.sleds.n : 0 };
    },
  };
}
