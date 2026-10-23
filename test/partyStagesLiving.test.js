// Living pass regression checks use the real stage geometry, camera and Players.
// They are structural Node checks; GPU rendering / visual feel need browser review.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PARTY } from '../public/js/config.js';
import { FollowCamera } from '../public/js/camera/followCamera.js';
import { createVineSkipWorld } from '../public/js/world/party/vineskip.js';
import { createTimberWorld } from '../public/js/world/party/timber.js';
import { createMarloSaysWorld } from '../public/js/world/party/marlosays.js';
import { createHuddleWorld } from '../public/js/world/party/huddle.js';
import { stageGameplayPoints, STAGE_ASPECTS, hostIdle, coastZ } from '../public/js/world/party/livingStage.js';
import { LOOKS } from '../public/js/world/party/glade.js';
import { DRESSING_KINDS } from '../public/js/world/party/stageDressing.js';
import { distanceToShape } from '../public/js/world/party/scatter.js';
import { acquirePartyMaterials } from '../public/js/world/party/decor.js';
import { LIFE_CAPS } from '../public/js/world/party/life.js';
import { waterUniforms } from '../public/js/world/water.js';
import { estimateTriangles } from './fixtures/partyTriangles.js';
import { makeRuntime } from './fixtures/partyRuntime80d.js';

const factories = { vineskip: createVineSkipWorld, timber: createTimberWorld, marlosays: createMarloSaysWorld, huddle: createHuddleWorld };
// Before: audited original stages in wait mode, including outline and sun passes.
const BEFORE = { vineskip: { triangles: 89264, draws: 31 }, timber: { triangles: 49524, draws: 12 }, marlosays: { triangles: 74656, draws: 16 }, huddle: { triangles: 82464, draws: 11 } };
const trees = new Set(['oak', 'birch', 'pine', 'spruce', 'snowPine', 'bush', 'coconut', 'banana', 'jungle', 'breadfruit']);
const build = id => { const w = factories[id]({ scene: new THREE.Scene() }); w.setVisible(true); w.update(0.1, { mode: 'wait' }); w.root.updateMatrixWorld(true); return w; };
function cameraFor(cfg, aspect) {
  const camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 600), follow = new FollowCamera(camera, {});
  follow.offset.set(cfg.offset.x, cfg.offset.y, cfg.offset.z);
  const zoom = Math.max(0.8, follow.zoomForExtent(cfg.extent.w, cfg.extent.d, 0.4, false));
  follow.update(0, { x: cfg.focus.x, y: cfg.focus.y - 0.9, z: cfg.focus.z }, zoom); camera.updateMatrixWorld(true); return camera;
}
const inFrame = p => Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && Math.abs(p.z) < 1;
// Independent cube-corner bound in view space, conservatively clipped at near.
function covers(s, p, camera) {
  const v = s.center.clone().applyMatrix4(camera.matrixWorldInverse), view = p.clone().applyMatrix4(camera.matrixWorldInverse);
  if (-v.z - s.radius >= -view.z || -v.z + s.radius <= camera.near) return false;
  const xy = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) xy.push(new THREE.Vector3(v.x + x * s.radius, v.y + y * s.radius, Math.min(-camera.near, v.z + z * s.radius)).applyMatrix4(camera.projectionMatrix));
  const screen = p.clone().project(camera);
  return screen.x >= Math.min(...xy.map(p => p.x)) && screen.x <= Math.max(...xy.map(p => p.x)) && screen.y >= Math.min(...xy.map(p => p.y)) && screen.y <= Math.max(...xy.map(p => p.y));
}

for (const id of Object.keys(factories)) {
  for (const aspect of STAGE_ASPECTS) test(`${id}: depth-aware occlusion and safe ground cover at ${aspect}`, () => {
    const w = build(id), camera = cameraFor(w.cam, aspect), points = stageGameplayPoints(id);
    for (const b of w.living.bounds) {
      if (b.lowCover) {
        assert.ok(b.top <= 0.45);
        for (const k of w.living.keepOut) assert.ok(distanceToShape(k, b.x, b.z) >= b.footprint * 0.65 - 1e-6, `${id} ${b.kind} keep-out`);
      } else {
        const s = b.sphere.clone().translate(w.root.position);
        assert.ok(points.every(p => !covers(s, p, camera)), `${id} ${b.kind} occludes gameplay`);
      }
    }
    w.dispose();
  });

  test(`${id}: useful scenery in every frame third and a covered ground horizon`, t => {
    const w = build(id);
    for (const aspect of STAGE_ASPECTS) {
      const camera = cameraFor(w.cam, aspect), counts = Array.from({ length: 3 }, () => ({ decor: 0, low: 0, trees: 0 }));
      for (const b of w.living.bounds) {
        const p = b.sphere.center.clone().add(w.root.position).project(camera); if (!inFrame(p)) continue;
        const n = counts[Math.min(2, Math.floor((p.x + 1) * 1.5))]; n.decor++; if (b.lowCover) n.low++; if (trees.has(b.kind)) n.trees++;
      }
      for (const n of counts) { assert.ok(n.decor >= (id === 'vineskip' ? 40 : 6)); assert.ok(n.low >= (id === 'vineskip' ? 35 : 2)); if (id !== 'marlosays' || aspect !== 9 / 16) assert.ok(n.trees >= 2); }
      let visibleEdge = 0;
      const spheres = w.living.decor.bounds.filter(b => trees.has(b.kind)).map(b => b.sphere.clone().translate(w.root.position));
      for (let i = 0; i < 1440; i++) {
        const a = i / 1440 * Math.PI * 2, p = new THREE.Vector3(Math.cos(a) * 44, 0, Math.sin(a) * 44).add(w.root.position);
        if (!inFrame(p.clone().project(camera))) continue; visibleEdge++;
        const ray = new THREE.Ray(camera.position, p.clone().sub(camera.position).normalize()), hit = new THREE.Vector3();
        const sea = id === 'marlosays' && p.z - w.root.position.z < coastZ(p.x - w.root.position.x);
        assert.ok(sea || spheres.some(s => ray.intersectSphere(s, hit) && hit.distanceTo(camera.position) < p.distanceTo(camera.position)), `${id}: bare disc edge at ${aspect}, angle ${a}`);
      }
      t.diagnostic(JSON.stringify({ id, aspect, thirds: counts, coveredEdgeSamples: visibleEdge }));
    }
    w.dispose();
  });

  for (const aspect of [16 / 9, 9 / 16]) test(`${id}: dressed 3x3 screen grid at ${aspect}`, t => {
    const w = build(id), camera = cameraFor(w.cam, aspect), grid = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ pieces: 0, broad: 0, clumps: 0, water: 0 })));
    for (const b of w.living.bounds) {
      const p = b.sphere.center.clone().add(w.root.position).project(camera); if (!inFrame(p)) continue;
      const n = grid[Math.min(2, Math.floor((1 - p.y) * 1.5))][Math.min(2, Math.floor((p.x + 1) * 1.5))];
      n.pieces++; if (b.sphere.radius > 0.65) n.broad++; if (DRESSING_KINDS.has(b.kind) || b.kind === 'patch' && b.zone === 'front') n.clumps++;
    }
    const ray = new THREE.Raycaster(), water = w.living.root.getObjectByName('party-stage-water');
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      const n = grid[row][col];
      if (id === 'marlosays') for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
        ray.setFromCamera(new THREE.Vector2(-1 + (col + (x + 0.5) / 5) * 2 / 3, 1 - (row + (y + 0.5) / 5) * 2 / 3), camera);
        const hit = ray.intersectObjects([water, w.living.root.getObjectByName('party-stage-ocean')].filter(Boolean), false)[0];
        if (hit && hit.point.z - w.root.position.z < coastZ(hit.point.x - w.root.position.x)) n.water++;
      }
      // Only the central judged pieces, and Timber's wide-view lane ends / benches,
      // may occupy a whole cell without ambient cover. Open ocean is itself dressed
      // with animated glints / shore foam; it must cover most of a water cell.
      const gameplay = (row === 1 && col === 1) || (id === 'timber' && aspect === 16 / 9 && row === 2 && col === 1);
      if (gameplay) continue;
      if (id === 'vineskip') {
        assert.ok(n.pieces >= (row === 2 && col === 1 && aspect === 16 / 9 ? 4 : 8));
        assert.ok(n.broad >= 2 || n.water >= 15);
        if (row === 2) assert.ok(n.clumps >= (aspect === 16 / 9 && col === 1 ? 3 : 8));
      } else {
        // Calm compositions may cross a cell boundary without putting their centre
        // inside it. Measure the UNION of broad silhouettes, rather than rewarding
        // hundreds of scattered centres. At least 2/49 samples must be dressed,
        // unless judged pieces / their protected approaches occupy most of the cell.
        let covered = 0, judged = 0;
        for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
          const sx = -1 + (col + (x + 0.5) / 7) * 2 / 3, sy = 1 - (row + (y + 0.5) / 7) * 2 / 3;
          ray.setFromCamera(new THREE.Vector2(sx, sy), camera);
          const ground = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -w.root.position.y), new THREE.Vector3());
          if (ground && w.living.keepOut.some(k => !k.sceneryOnly && distanceToShape(k, ground.x - w.root.position.x, ground.z - w.root.position.z) <= 0)) judged++;
          if (w.living.bounds.some(b => {
            if (b.sphere.radius < 0.65) return false;
            const view = b.sphere.center.clone().add(w.root.position).applyMatrix4(camera.matrixWorldInverse), d = -view.z;
            if (d <= b.sphere.radius) return false;
            const p = b.sphere.center.clone().add(w.root.position).project(camera);
            const rx = b.sphere.radius * camera.projectionMatrix.elements[0] / (d - b.sphere.radius), ry = b.sphere.radius * camera.projectionMatrix.elements[5] / (d - b.sphere.radius);
            return ((sx - p.x) / rx) ** 2 + ((sy - p.y) / ry) ** 2 < 1;
          })) covered++;
        }
        n.covered = covered; n.judged = judged;
        assert.ok(covered >= 2 || n.water >= 15 || judged >= 25, `${id} cell ${row}/${col}: ${covered}/49 broad coverage, ${judged}/49 gameplay`);
      }
    }
    const framing = w.living.bounds.filter(b => b.zone === 'frame'); assert.ok(framing.length >= (id === 'vineskip' ? 6 : 2));
    const clipped = framing.filter(b => {
      const p = b.sphere.center.clone().add(w.root.position).applyMatrix4(camera.matrixWorldInverse), d = -p.z;
      const x = p.x * camera.projectionMatrix.elements[0] / d, r = b.sphere.radius * camera.projectionMatrix.elements[0] / Math.max(camera.near, d - b.sphere.radius);
      return Math.abs(x) + r > 1 && Math.abs(x) - r < 1;
    });
    assert.ok(clipped.length >= 2, 'large silhouettes partly cut by camera edges');
    t.diagnostic(JSON.stringify({ id, aspect, grid })); w.dispose();
  });

  test(`${id}: no screen-grid ray below the horizon misses ground or water at any aspect`, t => {
    const w = build(id), ground = w.living.root.getObjectByName('party-living-ground'), water = w.living.root.getObjectByName('party-stage-water'), ray = new THREE.Raycaster();
    for (const aspect of STAGE_ASPECTS) {
      const camera = cameraFor(w.cam, aspect); let samples = 0;
      for (let row = 0; row < 25; row++) for (let col = 0; col < 33; col++) {
        ray.setFromCamera(new THREE.Vector2(-0.995 + col / 32 * 1.99, -0.995 + row / 24 * 1.99), camera);
        if (ray.ray.direction.y >= 0) continue; samples++;
        const floor = ray.intersectObject(ground, false)[0]; assert.ok(floor, `${id} floor hole ${aspect}, ${row}/${col}`);
        if (id === 'marlosays' && floor.point.z - w.root.position.z < coastZ(floor.point.x - w.root.position.x) - 0.3) {
          const sea = ray.intersectObjects([water, w.living.root.getObjectByName('party-stage-ocean')].filter(Boolean), false)[0]; assert.ok(sea && sea.distance < floor.distance, 'ocean continues to horizon; no sand beyond the water');
        }
      }
      assert.ok(samples >= 800); t.diagnostic(JSON.stringify({ id, aspect, groundRays: samples, misses: 0 }));
    }
    w.dispose();
  });

  test(`${id}: deterministic bounded life stays clear of judged pieces over two minutes`, () => {
    const a = build(id), b = build(id);
    assert.deepEqual(a.living.bounds.map(b => [b.kind, b.x, b.z, b.sphere.radius]), b.living.bounds.map(b => [b.kind, b.x, b.z, b.sphere.radius]));
    const matrix = new THREE.Matrix4(), pos = new THREE.Vector3();
    for (let t = 0; t < 120; t += 0.7) {
      a.living.life.update(0.7, t); b.living.life.update(0.7, t);
      for (let k = 0; k < a.living.life.pools.length; k++) {
        const p = a.living.life.pools[k], other = b.living.life.pools[k];
        assert.ok(p.mesh.count <= LIFE_CAPS[p.kind]); assert.equal(p.mesh.castShadow, false);
        assert.deepEqual(p.mesh.instanceMatrix.array, other.mesh.instanceMatrix.array);
        for (let i = 0; i < p.mesh.count; i++) {
          p.mesh.getMatrixAt(i, matrix); pos.setFromMatrixPosition(matrix);
          if (p.kind === 'breath') continue; // Intentional tiny horizontal exhalations at mouths, never falling hazards.
          if (p.kind === 'bird') { assert.ok(pos.y >= 8.6); assert.ok(pos.z < -19); continue; }
          if (id === 'vineskip') assert.ok(Math.hypot(pos.x, pos.z) > PARTY.vineskip.rimMax + 1, 'no insects at the rotating vine');
          if (id === 'timber') {
            if (p.kind === 'sawdust') { assert.ok(pos.z > 2); assert.ok(pos.y < 0.4); }
            else assert.ok(Math.abs(pos.x) > 13, 'leaves / insects outside lanes and stripe');
          }
          if (id === 'marlosays') assert.ok(Math.abs(pos.x) > 13 && pos.z > 6, 'crabs outside posts and flags');
          if (id === 'huddle') { assert.ok(Math.abs(pos.x) > 13, 'no snow dust or flakes above stumps'); if (p.kind === 'snowDust') assert.ok(pos.y >= 2.5 && pos.y <= 4.3); }
        }
      }
    }
    a.dispose(); b.dispose();
  });

  test(`${id}: shared program / draw / complete four-Player triangle budgets`, t => {
    const w = build(id), shared = acquirePartyMaterials(), env = w.living, wait = estimateTriangles(w.root);
    assert.equal(env.materials.sway, shared.sway); assert.equal(env.materials.water, shared.water);
    assert.equal(env.materials.water.uniforms.uTime, waterUniforms.uTime);
    let lights = 0, shadow = 0;
    w.root.traverse(o => { if (o.isLight) lights++; if (o.isMesh && o.visible && o.castShadow) shadow++; });
    env.root.traverse(o => { if (o.isMesh) { assert.equal(o.castShadow, false); assert.ok([shared.sway, shared.water, env.poolMaterial, env.root.getObjectByName('party-living-ground').material, w.root.getObjectByName('vineskip-vine')?.material].includes(o.material), 'no other scenery materials'); } });
    assert.equal(lights, 0); assert.ok(wait.meshes + shadow <= BEFORE[id].draws + 10);
    // Force every pooled shell / log half / ripple / heap visible together, more than
    // any actual game frame. Include all merged triangles; no frustum culling discount.
    w.root.traverse(o => { if (o.isMesh) o.visible = true; });
    const worst = estimateTriangles(w.root), rt = makeRuntime(); rt.party.open({ bots: 'fill', mode: 'pick' }); rt.run(4);
    assert.equal(rt.pm.list.length, 4);
    const players = rt.pm.list.reduce((sum, p) => sum + estimateTriangles(p.root).total, 0);
    assert.equal(players, 153240);
    // The main-session Vine review reported ~300k vs our previous idle 266493:
    // allow 40k for shared sky/FX, actor accessories and renderer/harness differences.
    const complete = worst.total + players + 40000; assert.ok(complete <= 400000, `${id}: ${complete}`);
    t.diagnostic(JSON.stringify({ id, before: BEFORE[id], afterWait: { triangles: wait.total, draws: wait.meshes + shadow }, worstStage: worst.total, fourPlayers: players, reserve: 40000, completeWithReserve: complete }));
    rt.party.close(); rt.run(2); w.dispose(); shared.release();
  });

  test(`${id}: stage hide/reopen and final disposal release every owned buffer exactly once`, () => {
    const w = build(id);
    for (let n = 0; n < 3; n++) {
      const env = w.living, geometries = new Set(), instances = [], freed = new Map();
      env.root.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.isInstancedMesh) instances.push(o); });
      for (const g of geometries) g.addEventListener('dispose', () => freed.set(g, (freed.get(g) || 0) + 1));
      let instanceDisposals = 0; for (const m of instances) m.addEventListener('dispose', () => instanceDisposals++);
      w.setVisible(false); assert.equal(w.living, null); assert.equal(env.root.parent, null);
      assert.equal(instanceDisposals, instances.length); for (const g of geometries) assert.equal(freed.get(g), 1);
      w.setVisible(true); assert.notEqual(w.living, env);
    }
    const geos = new Set(), freed = new Map(); w.root.traverse(o => { if (o.geometry) geos.add(o.geometry); });
    for (const g of geos) g.addEventListener('dispose', () => freed.set(g, (freed.get(g) || 0) + 1));
    w.dispose(); w.dispose(); assert.equal(w.root.parent, null);
    for (const g of geos) assert.equal(freed.get(g), 1, `${id}: owned stage / model / outline buffer`);
  });
}

test('real party changes and closes release 82b stages, reopening builds a fresh scene', async () => {
  const r = makeRuntime(); r.party.open({ bots: 'fill', mode: 'pick' }); r.run(4);
  let previous = null;
  for (const id of Object.keys(factories)) {
    await r.party.play(id); assert.ok(r.run(8, () => r.party.place === id)); const w = r.party.debug.stage(id);
    assert.ok(w.root.visible && w.living); if (previous) assert.equal(previous.root.parent, null);
    previous = w;
  }
  r.party.close(); r.run(2); assert.equal(previous.root.parent, null); assert.equal(previous.living, null);
  r.party.open({ bots: 0 }); r.run(2); await r.party.play('huddle'); assert.ok(r.run(8, () => r.party.place === 'huddle'));
  const fresh = r.party.debug.stage('huddle'); assert.notEqual(fresh, previous); assert.ok(fresh.root.visible);
  r.party.close(); r.run(2);
});

test('Timber flume water and Marlo pool meet their banks, without moving game pieces', () => {
  const t = build('timber'), m = build('marlosays'), v = build('vineskip');
  const film = t.living.root.getObjectByName('party-stage-water').geometry.attributes.position;
  for (let i = 0; i < film.count; i++) assert.ok(Math.abs(film.getY(i) - 0.315) < 1e-6, 'film just over the .30 trough floor and below the logs');
  const pool = m.living.root.getObjectByName('party-stage-water').geometry.attributes.position;
  for (let i = 0; i < pool.count; i++) assert.ok(pool.getY(i) <= 0.1 && pool.getY(i) >= 0.01, 'pool and sea flush with sand / rock shoulders');
  const down = new THREE.Vector3(0, -1, 0), ray = new THREE.Raycaster();
  for (const [w, x, z, expected] of [[t, PARTY.timber.lanes[0], -4, 0.30], [m, 0, PARTY.marlosays.postZ, 0.06]]) {
    ray.set(new THREE.Vector3(x, 3, z).add(w.root.position), down);
    const floor = ray.intersectObject(w.root.getObjectByName(`${w === t ? 'timber' : 'marlosays'}-base`), false)[0];
    const water = ray.intersectObject(w.living.root.getObjectByName('party-stage-water'), false)[0];
    assert.ok(Math.abs(floor.point.y - w.root.position.y - expected) < 1e-5);
    assert.ok(water.point.y > floor.point.y && water.point.y - floor.point.y < 0.04, 'water over floor, never buried or floating');
  }
  const sandNormals = m.living.root.getObjectByName('party-living-ground').geometry.attributes.normal;
  for (let i = 0; i < sandNormals.count; i++) assert.ok(sandNormals.getY(i) > 0, 'all beach and sea shoulders face upward');
  const flowers = v.living.root.getObjectByName('vineskip-planter-flowers'); assert.equal(flowers.material, v.living.materials.sway);
  flowers.geometry.computeBoundingBox(); assert.ok(flowers.geometry.boundingBox.max.y < 1.35, 'blooms below the vine arch');
  assert.ok(v.living.bounds.some(b => b.kind === 'volcano')); assert.ok(v.living.bounds.filter(b => b.kind === 'torch').length >= 3);
  assert.ok(v.living.bounds.some(b => b.kind === 'jungleGrove'), 'palms and hanging vines attached to their crowns');
  assert.ok(m.living.bounds.filter(b => b.kind === 'coastShells').length >= 3);
  t.dispose(); m.dispose(); v.dispose();
});

test('host breathing, leader gaze and small reactions are cosmetic and keep the feet fixed', () => {
  const root = new THREE.Group(), headGroup = new THREE.Group(), torso = new THREE.Group(); root.add(torso); torso.add(headGroup);
  root.position.set(10, 0, 20); const model = { root, torso, headGroup };
  const players = [{ index: 0, position: new THREE.Vector3(13, 0, 25) }, { index: 1, position: new THREE.Vector3(7, 0, 25) }];
  const v = { alive: { 0: true, 1: true }, totals: { 0: 10, 1: 20 }, done: false }, before = structuredClone(v);
  hostIdle(model, 1, v, players); assert.ok(headGroup.rotation.y < 0); assert.notEqual(torso.scale.y, 1); assert.deepEqual(v, before);
  v.totals[0] = 30; const scored = structuredClone(v); hostIdle(model, 1.5, v, players);
  assert.ok(headGroup.rotation.y > 0); assert.notEqual(headGroup.rotation.z, 0); assert.deepEqual(v, scored);
  assert.deepEqual(root.position.toArray(), [10, 0, 20]);
});

test('scenic wood and rocks stay in a few composed groups, distinct from game pieces', () => {
  const t = build('timber'), m = build('marlosays'), h = build('huddle');
  const count = (w, kind) => w.living.bounds.filter(b => b.kind === kind).length;
  assert.equal(count(t, 'mossLog'), 2); assert.equal(count(t, 'stumpGroup'), 2); assert.equal(count(t, 'woodpile'), 1);
  assert.equal(count(t, 'log') + count(t, 'stump'), 0, 'no random loose game-like wood');
  assert.ok(count(m, 'driftwood') <= 2); assert.ok(count(m, 'beachRocks') >= 2 && count(m, 'beachRocks') <= 3);
  assert.equal(count(m, 'rock'), 0); assert.equal(count(h, 'icePatch') + count(h, 'sled') + count(h, 'snowRock'), 0);
  assert.ok(count(h, 'cosySnowRock') <= 3 && count(h, 'cosyPine') >= 4);
  for (const w of [t, m, h]) w.dispose();
});

test('clear shallow tide pool reuses the water program and clock, and frees its private palette', () => {
  const w = build('marlosays'), env = w.living, pool = env.poolMaterial, sea = env.materials.water;
  assert.notEqual(pool, sea); assert.equal(pool.vertexShader, sea.vertexShader); assert.equal(pool.fragmentShader, sea.fragmentShader);
  assert.deepEqual(pool.defines, sea.defines); assert.equal(pool.uniforms.uTime, sea.uniforms.uTime);
  assert.equal(pool.uniforms.uNight.value, 0);
  for (const key of ['uShallow', 'uDeep']) {
    const c = pool.uniforms[key].value;
    assert.ok(c.g > c.r && c.b > c.r && c.g > 0.5, 'bright turquoise over sand');
  }
  let freed = 0; pool.addEventListener('dispose', () => freed++);
  w.setVisible(false); w.dispose(); assert.equal(freed, 1);
});

test('Huddle keeps blue snow variation and a subdued look, with no additive glare layer', () => {
  const w = build('huddle'), look = LOOKS[w.look];
  assert.ok(look.exposure <= 1 && look.sunIntensity < LOOKS.snow.sunIntensity && look.hemiIntensity < LOOKS.snow.hemiIntensity);
  w.root.traverse(o => { if (o.isMesh) assert.notEqual(o.material.blending, THREE.AdditiveBlending); });
  const colors = w.living.root.getObjectByName('party-living-ground').geometry.attributes.color;
  let lo = 1, hi = 0;
  for (let i = 0; i < colors.count; i++) { lo = Math.min(lo, colors.getX(i)); hi = Math.max(hi, colors.getX(i)); assert.ok(colors.getZ(i) > colors.getX(i), 'cool snow and blue shadow patches'); }
  assert.ok(hi - lo > 0.05 && lo > 0.7); assert.equal(w.living.bounds.filter(b => b.kind === 'frozenPond').length, 1);
  w.dispose();
});
