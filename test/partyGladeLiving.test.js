// Step 82a: renderer-free structural, camera, lifetime and runtime regression checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PARTY, TDOONGZ } from '../public/js/config.js';
import { createGlade, CAMERAS, lobbyGameplayPoints, sphereCoversPoint, meadowSurface } from '../public/js/world/party/glade.js';
import { distanceToShape } from '../public/js/world/party/scatter.js';
import { FollowCamera } from '../public/js/camera/followCamera.js';
import { createPartyLife, LIFE_CAPS, LIFE_PRESETS } from '../public/js/world/party/life.js';
import { acquirePartyMaterials, decorAsset, groundPatch } from '../public/js/world/party/decor.js';
import { waterUniforms } from '../public/js/world/water.js';
import { windTime } from '../public/js/world/wind.js';
import { VERTEX_TOON } from '../public/js/render/geo.js';
import { makeRuntime } from './fixtures/partyRuntime80d.js';
import { GLADE_POND, pondRadius, pondBank } from '../public/js/world/party/gladePond.js';
import { createTdoongModel } from '../public/js/npc/tdoongz.js';
import { estimateTriangles } from './fixtures/partyTriangles.js';

function cameraFor(aspect) {
  const c = new THREE.PerspectiveCamera(40, aspect, 0.1, 600), cfg = CAMERAS.lobby;
  const f = new FollowCamera(c, { offset: cfg.offset });
  f.update(0, { ...cfg.focus, y: cfg.focus.y - 0.9 }, Math.max(0.8, f.zoomForExtent(cfg.extent.w, cfg.extent.d, 0.4, false)));
  c.updateMatrixWorld(true); return c;
}
// Independent projection of the enclosing camera-space cube (conservative for a sphere).
function projectedBounds(sphere, camera) {
  const center = sphere.center.clone().applyMatrix4(camera.matrixWorldInverse), r = sphere.radius, corners = [];
  for (const x of [-r, r]) for (const y of [-r, r]) for (const z of [-r, r]) {
    const corner = center.clone().add(new THREE.Vector3(x, y, z));
    corner.z = Math.min(corner.z, -camera.near); // clip the cube before projection; behind-camera corners reverse x/y
    corners.push(corner.applyMatrix4(camera.projectionMatrix));
  }
  return { x0: Math.min(...corners.map(p => p.x)), x1: Math.max(...corners.map(p => p.x)), y0: Math.min(...corners.map(p => p.y)), y1: Math.max(...corners.map(p => p.y)) };
}

for (const aspect of [16 / 9, 9 / 16, 19.5 / 9]) test(`every lobby decoration sphere leaves gameplay clear at ${aspect}`, () => {
  const g = createGlade({ scene: new THREE.Scene() }), camera = cameraFor(aspect);
  const points = lobbyGameplayPoints().map(p => ({ screen: p.clone().project(camera), depth: -p.clone().applyMatrix4(camera.matrixWorldInverse).z }));
  assert.ok(g.bounds.length > 200, 'the merged batches expose individual piece bounds');
  for (const b of g.bounds) {
    const sphere = b.sphere.clone(); sphere.center.add(g.root.position);
    const viewDepth = -sphere.center.clone().applyMatrix4(camera.matrixWorldInverse).z;
    if (viewDepth + sphere.radius <= camera.near) continue; // wholly behind the camera cannot occlude players
    const q = projectedBounds(sphere, camera);
    if (b.lowCover) {
      assert.ok(b.top <= 0.45, b.kind);
      for (const keepOut of g.lowKeepOut) assert.ok(distanceToShape(keepOut, b.x, b.z) >= b.footprint + 0.079, b.kind);
    } else {
      const near = -sphere.center.clone().applyMatrix4(camera.matrixWorldInverse).z - sphere.radius;
      assert.ok(!points.some(({ screen: p, depth }) => near < depth && p.x >= q.x0 && p.x <= q.x1 && p.y >= q.y0 && p.y <= q.y1), b.kind);
    }
  }
  g.dispose();
});

test('coverage rejects a sphere in front, allows the same projection behind, and includes its near radius', () => {
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 100); camera.updateMatrixWorld(true);
  const point = new THREE.Vector3(0, 0, -10);
  assert.equal(sphereCoversPoint(new THREE.Sphere(new THREE.Vector3(0, 0, -5), 0.5), point, camera), true);
  assert.equal(sphereCoversPoint(new THREE.Sphere(new THREE.Vector3(0, 0, -15), 0.5), point, camera), false);
  assert.equal(sphereCoversPoint(new THREE.Sphere(new THREE.Vector3(0, 0, -10.2), 0.5), point, camera), true);
  assert.equal(sphereCoversPoint(new THREE.Sphere(new THREE.Vector3(8, 0, -5), 0.5), point, camera), false);
});

test('low cover fills the walkable meadow, thins toward the middle, and stays below 0.45 including flowers', () => {
  const g = createGlade({ scene: new THREE.Scene() }), low = g.bounds.filter(b => b.lowCover && b.zone === 'meadow');
  assert.ok(low.length >= 400); assert.ok(low.filter(b => b.kind.startsWith('flower')).length >= 180);
  assert.ok(low.every(b => Math.hypot(b.x, b.z) <= PARTY.lobby.r && b.top <= 0.45));
  const edge = low.filter(b => Math.hypot(b.x, b.z) > 10).length, middle = low.filter(b => Math.hypot(b.x, b.z) < 5).length;
  assert.ok(edge > middle * 4, `${edge} edge pieces vs ${middle} middle pieces`);
  g.dispose();
});

test('the inner meadow has an irregular radius and blends vertex colours into outer grass', () => {
  const g = meadowSurface(15.8, '#a8f07c', 0.02, true), p = g.attributes.position, c = g.attributes.color;
  const outer = new Map();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z), key = Math.atan2(z, x).toFixed(3);
    if (!outer.has(key) || r > outer.get(key).r) outer.set(key, { r, i, x, z });
  }
  const radii = [...outer.values()].filter(p => p.r > 14).map(p => p.r);
  assert.ok(Math.max(...radii) - Math.min(...radii) > 1.5);
  const grass = new THREE.Color('#8fe36b');
  for (const { r, i, x, z } of outer.values()) if (r > 14) {
    const noise = 0.98 + Math.sin(x * 0.8) * Math.cos(z * 0.67) * 0.025;
    assert.ok(Math.abs(c.getX(i) - grass.r * noise) < 1e-5);
    assert.ok(Math.abs(c.getY(i) - grass.g * noise) < 1e-5);
  }
  g.dispose();
});

test('lobby mesh / shadow estimate stays within +10; only two shared material extensions and no new lights', () => {
  const g = createGlade({ scene: new THREE.Scene() }); g.setVisible(true);
  const s = g.summary(), baseline = { meshes: 34, shadow: 8 };
  assert.equal(s.meshes, 40); assert.equal(s.shadowMeshes, 7);
  assert.ok(s.meshes + s.shadowMeshes - baseline.meshes - baseline.shadow <= 10);
  let lights = 0; g.root.traverse(o => { if (o.isLight) lights++; }); assert.equal(lights, 0);
  const mats = new Set(); g.root.traverse(o => { if (o.isMesh && !o.name.startsWith('tdoong')) mats.add(o.material); });
  assert.ok(mats.has(g.materials.sway) && mats.has(g.materials.water));
  for (const p of g.life.pools) assert.equal(p.mesh.material, VERTEX_TOON, 'life reuses the ordinary instanced toon variant');
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <project_vertex>' };
  g.materials.sway.onBeforeCompile(shader); assert.equal(shader.uniforms.uWindTime, windTime);
  assert.equal(g.materials.water.uniforms.uTime, waterUniforms.uTime);
  assert.match(g.materials.water.fragmentShader, /movingNormal/); assert.match(g.materials.water.fragmentShader, /smoothstep\(0.76/);
  g.dispose();
});

test('cached island assets are borrowed, retain colour, and are never disposed by the lobby', () => {
  const assets = ['oak', 'bush', 'grass', 'flowerPink', 'pine', 'birch', 'banana', 'fern', 'bamboo', 'giant-a', 'reed'].map(decorAsset);
  let disposed = 0; for (const a of assets) { assert.ok(a.attributes.color); a.addEventListener('dispose', () => disposed++); }
  const g = createGlade({ scene: new THREE.Scene() }); g.dispose(); assert.equal(disposed, 0);
  assert.equal(decorAsset('pine'), assets[4]);
  const p = groundPatch(); p.computeBoundingBox(); assert.ok(p.attributes.color.count > 64);
  const c = p.attributes.color; assert.ok(new Set(c.array).size > 30, 'noise and feathered colour edge'); p.dispose();
});

test('every preset uses one fixed instanced draw per kind, clamps caps and evolves without allocations or random sampling', () => {
  for (const [preset, kinds] of Object.entries(LIFE_PRESETS)) {
    const root = new THREE.Group(), life = createPartyLife({ root, seed: 15, preset });
    assert.equal(root.children.length, Object.keys(kinds).length);
    const arrays = life.pools.map(p => p.mesh.instanceMatrix.array);
    const old = Math.random; Math.random = () => { throw new Error('random motion'); };
    try { for (let t = 0; t < 100; t += 0.23) life.update(0.23, t); } finally { Math.random = old; }
    life.pools.forEach((p, i) => { assert.equal(p.mesh.instanceMatrix.array, arrays[i]); assert.ok(p.mesh.count <= LIFE_CAPS[p.kind]); assert.ok([...arrays[i]].every(Number.isFinite)); });
    life.dispose(); assert.equal(root.children.length, 0);
  }
  const root = new THREE.Group(), life = createPartyLife({ root, preset: Object.fromEntries(Object.keys(LIFE_CAPS).map(k => [k, 1000])) });
  for (const p of life.pools) assert.equal(p.mesh.count, LIFE_CAPS[p.kind]); life.dispose();
});

test('life is seed deterministic and independent of frame partition; meadow motion stays in safe thin habitats', () => {
  const g = createGlade({ scene: new THREE.Scene() }), b = createPartyLife({ root: new THREE.Group(), ...g.lifeOptions });
  const m = new THREE.Matrix4(), v = new THREE.Vector3();
  for (let t = 0; t <= 40; t += 0.25) {
    g.life.update(0.25, t); b.update(1 / 120, t);
    g.life.pools.forEach((p, k) => {
      assert.deepEqual(p.mesh.instanceMatrix.array, b.pools[k].mesh.instanceMatrix.array);
      for (let i = 0; i < p.mesh.count; i++) {
        p.mesh.getMatrixAt(i, m); v.setFromMatrixPosition(m);
        if (p.kind === 'butterfly') assert.ok(v.y <= 1.05 && v.y >= 0.39 && Math.hypot(v.x, v.z) > 6);
        else assert.ok(v.y > 8 || Math.hypot(v.x, v.z) > PARTY.lobby.r + 1);
      }
    });
  }
  g.dispose(); b.dispose();
});

test('shared material leases survive another lobby closing, then dispose exactly once', () => {
  const a = acquirePartyMaterials(), b = acquirePartyMaterials(); assert.equal(a.sway, b.sway); assert.equal(a.water, b.water);
  let n = 0; a.sway.addEventListener('dispose', () => n++); a.water.addEventListener('dispose', () => n++);
  a.release(); a.release(); assert.equal(n, 0); b.release(); assert.equal(n, 2);
});

test('minimum in-frame cover, flowers, backdrop, pennants and live instances at all three aspects', t => {
  const g = createGlade({ scene: new THREE.Scene() });
  for (const aspect of [16 / 9, 9 / 16, 19.5 / 9]) {
    const camera = cameraFor(aspect), visible = new Set(), counts = { decor: 0, lowCover: 0, flowers: 0, treesBushes: 0, centralBackdrop: 0, pennants: 0, life: 0, butterflies: 0 };
    for (const b of g.bounds) {
      const p = b.sphere.center.clone().add(g.root.position).project(camera);
      if (Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && Math.abs(p.z) < 1) {
        visible.add(b.kind); counts.decor++;
        if (b.lowCover) counts.lowCover++;
        if (b.kind.startsWith('flower')) counts.flowers++;
        if (['oak', 'birch', 'pine', 'spruce', 'bush'].includes(b.kind)) {
          counts.treesBushes++;
          if (Math.abs(p.x) < 0.5 && p.y > 0.35) counts.centralBackdrop++;
        }
        if (b.piece === 'pennant') counts.pennants++;
      }
    }
    const matrix = new THREE.Matrix4();
    for (const pool of g.life.pools) for (let i = 0; i < pool.mesh.count; i++) {
      pool.mesh.getMatrixAt(i, matrix);
      const p = new THREE.Vector3().setFromMatrixPosition(matrix).add(g.root.position).project(camera);
      if (Math.abs(matrix.determinant()) > 1e-9 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && Math.abs(p.z) < 1) {
        counts.life++; if (pool.kind === 'butterfly') counts.butterflies++;
      }
    }
    t.diagnostic(JSON.stringify({ aspect, ...counts }));
    assert.ok(counts.lowCover >= 120 && counts.flowers >= 60 && counts.treesBushes >= 6 && counts.centralBackdrop >= 4 && counts.pennants >= 20 && counts.butterflies >= 6);
    for (const kind of ['brook', 'frog', 'bunting', 'oak', 'flowerPink', 'grass']) assert.ok(visible.has(kind), `${aspect}: ${kind}`);
    const butterflies = g.life.pools.find(p => p.kind === 'butterfly');
    for (let time = 0; time <= 60; time++) {
      g.life.update(1, time); let inFrame = 0;
      for (let i = 0; i < butterflies.mesh.count; i++) {
        butterflies.mesh.getMatrixAt(i, matrix);
        const p = new THREE.Vector3().setFromMatrixPosition(matrix).add(g.root.position).project(camera);
        if (Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && Math.abs(p.z) < 1) inFrame++;
      }
      assert.ok(inFrame >= 6, `${aspect}: ${inFrame} butterflies at ${time}s`);
    }
    g.life.update(0, 0);
  }
  g.dispose();
});

for (const aspect of [16 / 9, 9 / 16, 19.5 / 9]) test(`each frame third has low cover and groves at ${aspect}`, t => {
  const g = createGlade({ scene: new THREE.Scene() }), camera = cameraFor(aspect);
  const thirds = Array.from({ length: 3 }, () => ({ decor: 0, lowCover: 0, treesBushes: 0 }));
  for (const b of g.bounds) {
    const p = b.sphere.center.clone().add(g.root.position).project(camera);
    if (Math.abs(p.x) >= 1 || Math.abs(p.y) >= 1 || Math.abs(p.z) >= 1) continue;
    const third = thirds[Math.min(2, Math.floor((p.x + 1) * 1.5))];
    third.decor++; if (b.lowCover) third.lowCover++;
    if (['oak', 'birch', 'pine', 'spruce', 'bush'].includes(b.kind)) third.treesBushes++;
  }
  t.diagnostic(JSON.stringify({ aspect, thirds }));
  for (const third of thirds) assert.ok(third.decor >= 150 && third.lowCover >= 100 && third.treesBushes >= 8, JSON.stringify(third));
  const outer = g.bounds.filter(b => b.zone === 'outer');
  // Never-visible pieces have been dropped; the in-frame per-third minimums above
  // remain unchanged. Keep a useful outer population rather than requiring waste.
  assert.ok(outer.length >= 900 && outer.every(b => Math.hypot(b.x, b.z) > PARTY.lobby.r && b.top <= 0.45));
  g.dispose();
});

test('triangle estimate includes instances, outlines and one shadow pass, but skips hidden parents', () => {
  const root = new THREE.Group(), geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, 3); mesh.castShadow = true; root.add(mesh);
  const outline = new THREE.Mesh(geometry, material); mesh.add(outline);
  const hidden = new THREE.Group(); hidden.visible = false; hidden.add(new THREE.Mesh(geometry, material)); root.add(hidden);
  assert.deepEqual(estimateTriangles(root), { primary: 48, shadow: 36, total: 84, meshes: 2 });
  mesh.count = 1; assert.equal(estimateTriangles(root).total, 36);
  mesh.dispose(); geometry.dispose(); material.dispose();
});

test('the full lobby with four real Players and even its heaviest cheering trio stays under 400k triangles', t => {
  const r = makeRuntime(); r.party.open({ bots: 'fill', mode: 'pick' }); r.run(4);
  assert.equal(r.pm.list.length, 4);
  const g = r.party.debug.glade(), count = o => estimateTriangles(o).total;
  const sum = list => list.reduce((n, o) => n + count(o), 0);
  const decor = g.root.children.filter(o => o.name === 'party-decor');
  const groups = {
    groundFixtures: count(g.root.getObjectByName('party-lobby')) + count(g.root.getObjectByName('party-lobby-fixtures')),
    foliage: count(decor[0]), scatteredGround: count(decor[1]),
    buntingPondFrog: sum(g.root.children.filter(o => ['party-bunting', 'party-water', 'party-frog'].includes(o.name))),
    life: sum(g.root.children.filter(o => o.name.startsWith('party-life-'))),
    cheerers: sum(g.root.children.filter(o => o.name.startsWith('tdoong-'))),
    players: sum(r.pm.list.map(p => p.root)),
  };
  const ordinary = estimateTriangles(r.scene);
  assert.equal(Object.values(groups).reduce((a, b) => a + b, 0), ordinary.total);
  // Fixture reproduces the measured ~716k old view as 714,658 triangles. Real rendering
  // culls whole objects; it still submits every vertex of each merged batch. Reserve
  // 10k for shared sky/FX absent from the harness (old GPU-minus-Node delta was ~1.3k).
  const reserve = 10000, cap = 400000;
  assert.ok(ordinary.total + reserve <= cap);
  const profiles = Object.keys(TDOONGZ).map(id => {
    const model = createTdoongModel(id), triangles = count(model.root); model.dispose(); return { id, triangles };
  }).sort((a, b) => b.triangles - a.triangles);
  g.setCheerers(profiles.slice(0, 3).map(p => p.id));
  const worst = estimateTriangles(r.scene);
  t.diagnostic(JSON.stringify({ groups, defaultTotal: ordinary.total, worstTrio: profiles.slice(0, 3), worstTotal: worst.total, reserve, budgetedWorst: worst.total + reserve, cap }));
  assert.ok(worst.total + reserve <= cap);
  for (const piece of g.root.children.filter(o => o.name === 'party-decor' || o.name === 'party-bunting' || o.name === 'party-frog' || o.name.startsWith('party-life-')))
    piece.traverse(o => { if (o.isMesh) assert.equal(o.castShadow, false, 'small scenery has no shadow draw'); });
  r.party.close(); r.run(2);
});

for (const aspect of [16 / 9, 9 / 16, 19.5 / 9]) test(`every visible disc-edge sample is behind a tree silhouette at ${aspect}`, t => {
  const g = createGlade({ scene: new THREE.Scene() }), camera = cameraFor(aspect), hit = new THREE.Vector3();
  g.root.updateMatrixWorld(true);
  const trees = g.bounds.filter(b => ['oak', 'birch', 'pine', 'spruce'].includes(b.kind)).map(b => b.sphere.clone().translate(g.root.position));
  const foliage = g.root.children.find(o => o.name === 'party-decor');
  let samples = 0, triangleSamples = 0;
  for (let i = 0; i < 1440; i++) {
    const a = i / 1440 * Math.PI * 2, at = new THREE.Vector3(42 * Math.cos(a), 0, 42 * Math.sin(a)).add(g.root.position);
    const screen = at.clone().project(camera);
    if (Math.abs(screen.x) >= 1 || Math.abs(screen.y) >= 1 || Math.abs(screen.z) >= 1) continue;
    samples++;
    const direction = at.clone().sub(camera.position).normalize(), ray = new THREE.Ray(camera.position, direction), distance = at.distanceTo(camera.position);
    assert.ok(trees.some(s => ray.intersectSphere(s, hit) && hit.distanceTo(camera.position) < distance), `bare edge at angle ${a}`);
    // Also probe the actual merged foliage triangles periodically: broad spheres alone
    // must not hide a visibly empty horizon in this regression check.
    if (i % 16 === 0) {
      triangleSamples++;
      assert.ok(new THREE.Raycaster(camera.position, direction, 0.1, distance - 0.02).intersectObject(foliage, false).length, `no drawn foliage at ${a}`);
    }
  }
  t.diagnostic(JSON.stringify({ aspect, edgeSamples: samples, actualTriangleSamples: triangleSamples, uncovered: 0 }));
  assert.ok(samples > 20 && triangleSamples > 0); g.dispose();
});

test('the pond is sunk into a real ground opening with banks, stones, reeds, a frog and clear sight lines', () => {
  const g = createGlade({ scene: new THREE.Scene() }), p = GLADE_POND;
  g.root.updateMatrixWorld(true);
  const ground = g.root.getObjectByName('party-lobby'), water = g.root.getObjectByName('party-water');
  const at = new THREE.Vector3(PARTY.origin.x + p.x, PARTY.origin.y + 2, PARTY.origin.z + p.z);
  const ray = new THREE.Raycaster(at, new THREE.Vector3(0, -1, 0));
  assert.ok(ray.intersectObject(ground, false)[0].point.y < PARTY.origin.y - 0.15, 'the meadow has an actual basin, no flat ground under the water');
  assert.ok(Math.abs(ray.intersectObject(water, false)[0].point.y - PARTY.origin.y - p.waterY) < 1e-6);
  const positions = water.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    assert.ok(positions.getY(i) < 0);
    assert.ok(Math.hypot(positions.getX(i), positions.getZ(i)) > PARTY.lobby.r + 1);
  }
  const bank = pondBank(), bp = bank.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    assert.ok(Math.hypot(bp.getX(i), bp.getZ(i)) > PARTY.lobby.r + 1);
    if (pondRadius(bp.getX(i), bp.getZ(i)) > 0.999) assert.ok(Math.abs(bp.getY(i)) < 1e-6, 'bank meets the turf');
  }
  bank.dispose();
  assert.ok(g.bounds.filter(b => b.zone === 'pond' && b.kind === 'pebble').length >= 6);
  assert.ok(g.bounds.filter(b => b.zone === 'pond' && b.kind === 'reed').length >= 4);
  const dragonflies = g.lifeOptions.habitats.dragonfly[0]; assert.equal(dragonflies.x, p.x); assert.equal(dragonflies.z, p.z);
  const frog = g.bounds.find(b => b.kind === 'frog').sphere.center; assert.ok(Math.hypot(frog.x - p.x, frog.z - p.z) < 3);
  assert.ok(g.materials.water.uniforms.uShallow.value.getHSL({}, THREE.SRGBColorSpace).s < 0.4, 'muted water');
  assert.notEqual(g.materials.water.uniforms.uFoam, waterUniforms.uFoam, 'island foam stays unchanged');
  for (const aspect of [16 / 9, 9 / 16, 19.5 / 9]) {
    const camera = cameraFor(aspect), center = new THREE.Vector3(PARTY.origin.x + p.x, PARTY.origin.y + p.waterY, PARTY.origin.z + p.z);
    const screen = center.clone().project(camera); assert.ok(Math.abs(screen.x) < 1 && Math.abs(screen.y) < 1);
    if (aspect !== 9 / 16) assert.ok(screen.x < -1 / 3, 'pond in the left third');
    let visible = 0;
    for (let i = 0; i < positions.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(positions, i).add(g.root.position).project(camera);
      if (Math.abs(v.x) < 1 && Math.abs(v.y) < 1) visible++;
    }
    assert.ok(visible / positions.count >= 0.7, 'most of the pond is inside even portrait');
    const direction = center.clone().sub(camera.position).normalize(), sight = new THREE.Ray(camera.position, direction), hit = new THREE.Vector3();
    for (const tree of g.bounds.filter(b => ['oak', 'birch', 'pine', 'spruce', 'bush'].includes(b.kind))) {
      const sphere = tree.sphere.clone().translate(g.root.position);
      assert.ok(!sight.intersectSphere(sphere, hit) || hit.distanceTo(camera.position) > center.distanceTo(camera.position), 'pond not hidden behind trees');
    }
  }
  g.dispose();
});

test('three build/update/close cycles dispose all owned geometry, instance buffers and materials', () => {
  const scene = new THREE.Scene();
  for (let cycle = 0; cycle < 3; cycle++) {
    const g = createGlade({ scene }); g.setVisible(true); g.update(0.1, 1); g.setCheerers(['dubnyangee', 'imnabong', 'mokuring']);
    g.setVisible(true);
    const geometries = new Set(), instances = [], disposed = new Map();
    g.root.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.isInstancedMesh) instances.push(o); });
    for (const geo of geometries) geo.addEventListener('dispose', () => disposed.set(geo, (disposed.get(geo) || 0) + 1));
    let freedInstances = 0; for (const o of instances) o.addEventListener('dispose', () => freedInstances++);
    g.dispose(); g.dispose(); assert.equal(scene.children.length, 0); assert.equal(freedInstances, instances.length);
    for (const geo of geometries) assert.equal(disposed.get(geo), 1, 'every owned mesh / outline geometry released once');
  }
});

test('real party close rebuilds lobby on reopen and restores previously hidden island ambient layers', () => {
  const rt = makeRuntime(), layers = ['butterfly-wings', 'butterfly-bodies', 'drifting-petals', 'ocean-glints', 'fireflies'].map((name, i) => {
    const o = new THREE.Group(); o.name = name; o.visible = i !== 2; rt.scene.add(o); return o;
  });
  const original = layers.map(o => o.visible);
  rt.party.open({ bots: 0 }); rt.run(2);
  const first = rt.party.debug.glade(); assert.ok(layers.every(o => !o.visible));
  rt.party.close(); rt.run(2); assert.equal(first.root.parent, null); assert.deepEqual(layers.map(o => o.visible), original);
  rt.party.open({ bots: 0 }); rt.run(2); const second = rt.party.debug.glade(); assert.notEqual(second, first);
  rt.party.close(); rt.run(2); assert.equal(second.root.parent, null); assert.deepEqual(layers.map(o => o.visible), original);
});
