// Step 69c: Duskcrown's giant and titan mushrooms. Pure placement + keep-clear rules, the canopy fade rules, stem colliders registered once, the merged geometry / glow shader patch / rebuild safety (Node: no GPU).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ISLANDS, DUSK_FLORA, DUSK_CAMERA } from '../public/js/config.js';
import { getIslandModule } from '../public/js/world/islands/registry.js';
import { createDuskIsland } from '../public/js/world/islands/duskcrown.js';
import { buildDuskPlacement, MUSH, LANE_HALF, fadeRecord, COUNTS } from '../public/js/world/islands/duskPlacement.js';
import { segmentHitsCylinder, capCovers, fadeTargets, stepFade } from '../public/js/world/islands/duskFade.js';
import { registerDuskGameplay } from '../public/js/world/islands/duskWorld.js';
import { getMushroom, buildPoolGeometry } from '../public/js/world/islands/duskAssets.js';
import { buildDuskVisuals, duskFlora, patchToon, materials } from '../public/js/world/islands/duskVisuals.js';
import { getColliders } from '../public/js/world/colliders.js';
import { polyDist } from '../public/js/world/islands/scatter.js';

const island = ISLANDS.find((i) => i.id === 'duskcrown');
const mod = getIslandModule('duskcrown');
const L = mod.layout;
const P = buildDuskPlacement(island, mod);
const local = (it) => ({ lx: it.x - island.x, lz: it.z - island.z });
const CLIFF_BAND = 3.4 + 2.2 - 0.001;      // CLIFF_W + the placement's margin

test('placement is pure and deterministic: a fresh height module gives the identical plan, and the hash is pinned', () => {
  const again = buildDuskPlacement(island, createDuskIsland(island));
  assert.equal(again.hash(), P.hash());
  assert.deepEqual(again.items.map((i) => [i.id, i.x, i.z, i.s]), P.items.map((i) => [i.id, i.x, i.z, i.s]));
  assert.equal(P.hash(), 'a3374631');
});

test('counts, ids and sizes: groves of giants across the marsh, a few titans', () => {
  assert.ok(P.giants.length >= 40 && P.giants.length <= COUNTS.giants, `giants ${P.giants.length}`);
  assert.ok(P.titans.length >= 8 && P.titans.length <= COUNTS.titans, `titans ${P.titans.length}`);
  const ids = P.items.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => /^dusk-(giant-\d{3}|titan-\d{2})$/.test(id)));
  assert.ok(P.giants.some((g) => g.kind === 'giant-a') && P.giants.some((g) => g.kind === 'giant-b'));
  for (const g of P.giants) {
    const top = g.capTop - g.y;
    assert.ok(g.tall ? (top >= 6 && top <= 11) : (top >= 4.5 && top <= 8), `${g.id} cap top ${top}`);
    assert.ok(g.capR * 2 >= 6 && g.capR * 2 <= 12.7, `${g.id} cap width ${g.capR * 2}`);
    assert.ok(g.stemR * 2 >= 1.2 && g.stemR * 2 <= 2.8, `${g.id} stem ${g.stemR * 2}`);
  }
  const tallN = P.giants.filter((g) => g.tall).length;
  assert.ok(tallN >= P.giants.length * 0.3 && tallN <= P.giants.length * 0.7, `${tallN} of ${P.giants.length} are the tall class`);
  assert.ok(P.groves[0].n >= 4 && P.giants.filter((g) => g.tall && P.giants.some((o) => !o.tall && Math.hypot(o.x - g.x, o.z - g.z) < 14)).length >= 8, 'tall and short giants are mixed within groves');
  for (const t of P.titans) assert.ok(t.capTop - t.y >= 14 && t.capTop - t.y <= 22, `${t.id} ${t.capTop - t.y}`);
});

test('keep-clear: no stem on water, ponds + rims, the lagoon, streams, the cliff wall band, the landing, the notch or a reserved lane', () => {
  const lg = L.lagoon;
  for (const it of P.items) {
    const { lx, lz } = local(it), r = it.baseR;
    assert.equal(mod.groundType(it.x, it.z), 'marsh', it.id);
    assert.ok(mod.walkable(it.x, it.z), it.id);
    assert.ok(Math.abs(mod.height(it.x, it.z) - it.y) < 0.01);
    for (const p of L.ponds) assert.ok(Math.hypot(lx - p.x, lz - p.z) > p.r * 1.3 + r * 0.8, `${it.id} vs ${p.id}`);
    assert.ok(Math.hypot((lx - lg.x) / lg.rx, (lz - lg.z) / lg.rz) > 1.3, `${it.id} lagoon`);
    for (const s of L.streams) assert.ok(polyDist(s.pts, lx, lz) > 4.8 + r * 0.5, `${it.id} stream ${s.id}`);
    assert.ok(L.cliffC(lx, lz) < -(CLIFF_BAND + r * 0.8), `${it.id} cliff ${L.cliffC(lx, lz)}`);
    assert.ok(Math.hypot(lx - L.landing.x, lz - L.landing.z) > 30 + r, `${it.id} landing`);
    assert.ok(Math.hypot(lx - L.notch.x, lz - L.notch.z) > 24 + r, `${it.id} notch`);
    for (const lane of P.lanes) assert.ok(polyDist(lane, it.x, it.z) > LANE_HALF + r * 0.6, `${it.id} lane`);
  }
});

test('titans stand only along the cliff foot (10..34 u from the wall) or the coast (12..30 u inland)', () => {
  for (const t of P.titans) {
    const { lx, lz } = local(t), c = L.cliffC(lx, lz), coast = L.coastT(lx, lz);
    assert.ok((c < -10.5 && c > -34) || (coast > 12 && coast < 30), `${t.id} c ${c} coast ${coast}`);
  }
  assert.ok(P.titans.some((t) => { const { lx, lz } = local(t); return L.cliffC(lx, lz) > -34; }), 'at least one at the cliff foot');
});

test('lanes: BFS routes from the landing, long enough to be real, all walkable', () => {
  assert.ok(P.lanes.length >= 7);
  for (const lane of P.lanes) {
    assert.ok(lane.length >= 8);
    assert.ok(Math.hypot(lane[0][0] - (island.x + L.landing.x), lane[0][1] - (island.z + L.landing.z)) < 1);
    assert.ok(lane.every(([x, z]) => mod.walkable(x, z)));
  }
});

test('groves: the densest cluster has several giants and the debug stand points are walkable and clear of every stem', () => {
  assert.ok(P.groves[0].n >= 4);
  for (const s of [P.spots.grove, P.spots.titans]) {
    assert.ok(s && mod.walkable(s.x, s.z));
    assert.ok(P.items.every((i) => Math.hypot(s.x - i.x, s.z - i.z) > i.baseR + 1.5));
  }
});

test('canopy fade rules: a cap between the camera and a player, or over one, fades; others do not; the ease takes 0.25 s', () => {
  const cap = { x: 0, z: 0, r: 4, y0: 6, y1: 8.5 };
  const player = { x: 0, y: 1.1, z: 0 };
  assert.equal(capCovers(cap, { x: 0, y: 8.5, z: 13.5 }, player), true, 'standing under it');
  assert.equal(capCovers(cap, { x: 30, y: 8.5, z: 43.5 }, { x: 30, y: 1.1, z: 30 }), false, 'far to the side');
  assert.equal(capCovers(cap, { x: 0, y: 8.5, z: 6 }, { x: 0, y: 1.1, z: -6 }), true, 'the line to a player beyond it crosses the cap');
  assert.equal(segmentHitsCylinder({ x: 0, y: 40, z: 20 }, { x: 0, y: 1, z: 14 }, 0, 0, 4.7, 6, 8.5), false, 'a high camera line clears the cap');
  assert.equal(segmentHitsCylinder({ x: 0, y: 40, z: 20 }, { x: 0, y: 1, z: 0 }, 0, 0, 4.7, 6, 8.5), true, 'a line that comes down through the cap');
  const caps = [cap, { x: 100, z: 100, r: 4, y0: 6, y1: 9 }];
  assert.deepEqual(Array.from(fadeTargets(caps, { x: 0, y: 8.5, z: 13.5 }, [player])), [1, 0]);
  assert.deepEqual(Array.from(fadeTargets(caps, { x: 0, y: 8.5, z: 13.5 }, [{ x: 50, y: 1, z: 50 }, player])), [1, 0], 'any of several players');
  let v = 0, steps = 0;
  while (v < 1) { v = stepFade(v, 1, 1 / 60); steps++; }
  assert.ok(steps >= 14 && steps <= 16, `fade-in took ${steps} frames`);
  assert.equal(stepFade(1, 0, 10), 0);
});

test('every real cap fades for a player under it, also at the widest zoom camera', () => {
  const recs = P.items.map(fadeRecord);
  P.items.forEach((it, i) => {
    const under = { x: it.x + it.capR * 0.3, y: it.y + 1.1, z: it.z };
    for (const [oy, oz, zoom] of [[8.5, 13.5, 2.2], [DUSK_CAMERA.offset.y, DUSK_CAMERA.offset.z, 1], [DUSK_CAMERA.offset.y, DUSK_CAMERA.offset.z, 2.2]]) {   // the old camera at the widest zoom, the Duskcrown camera solo and at the widest zoom
      const cam = { x: under.x, y: under.y + oy * zoom, z: under.z + oz * zoom };
      assert.equal(fadeTargets(recs, cam, [under])[i], 1, `${it.id} @ ${oy}/${oz} x${zoom}`);
    }
  });
});

test('stem colliders: one per mushroom, registered once, at the stem base', () => {
  const before = getColliders().length;
  const d = registerDuskGameplay(island);
  assert.equal(d.colliders.length, P.items.length);
  assert.equal(getColliders().length, before + P.items.length + d.floraColliders.length);
  assert.equal(registerDuskGameplay(island), d);
  assert.equal(getColliders().length, before + P.items.length + d.floraColliders.length);
  d.colliders.forEach((c, i) => { assert.equal(c.x, P.items[i].x); assert.ok(Math.abs(c.r - P.items[i].baseR * 0.92) < 0.01); assert.equal(c.owner, P.items[i].id); });
});

test('geometry: merged, roled, within the triangle budget, with a fading outline hull and conforming pools', () => {
  for (const kind of ['giant-a', 'giant-b', 'titan']) {
    const a = getMushroom(kind), tris = a.geo.attributes.position.count / 3;
    assert.ok(a.geo.attributes.aRole && a.geo.attributes.color && a.geo.attributes.normal);
    assert.ok(tris > 300 && tris < 5200, `${kind} ${tris} tris`);
    const roles = new Set(Array.from(a.geo.attributes.aRole.array));
    for (const r of [0, 1, 2, 4, 5]) assert.ok(roles.has(r), `${kind} role ${r}`);
    assert.ok(a.geo.boundingBox.max.y > MUSH[kind].stemH);
    const hr = a.outlineGeo.attributes.aRole.array;
    assert.ok(hr.some((v) => v === 1) && hr.some((v) => v === 0));
    assert.ok(a.outlineGeo.attributes.position.count < a.geo.attributes.position.count);
  }
  const pool = buildPoolGeometry(P.items, (x, z) => mod.height(x, z));
  const pos = pool.attributes.position;
  for (let i = 0; i < pos.count; i += 7) assert.ok(Math.abs(pos.getY(i) - (mod.height(pos.getX(i), pos.getZ(i)) + DUSK_FLORA.poolLift)) < 1e-4);
  assert.ok(pool.index.count / 3 < 12000);
  const idx = pool.index.array, v = new THREE.Vector3(), w = new THREE.Vector3();
  const at = (k) => new THREE.Vector3().fromBufferAttribute(pos, idx[k]);
  for (let k = 0; k < idx.length; k += 3 * 40) {
    v.subVectors(at(k + 1), at(k)); w.subVectors(at(k + 2), at(k));
    assert.ok(v.cross(w).y > 0, 'pool triangles face up');
  }
});

test('the glow / fade shader patch finds every anchor in the toon shader, and the solid and pool materials share one program', () => {
  const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.toon.vertexShader, fragmentShader: THREE.ShaderLib.toon.fragmentShader };
  const v0 = sh.vertexShader, f0 = sh.fragmentShader;
  patchToon(sh);
  assert.notEqual(sh.vertexShader, v0); assert.notEqual(sh.fragmentShader, f0);
  for (const k of ['aRole', 'iInst', 'vFade = ', 'vPoolUv = uv']) assert.ok(sh.vertexShader.includes(k), k);
  for (const k of ['discard', 'totalEmissiveRadiance += vColor.rgb * glowK * uGlow', 'vRole > 5.5', 'fogK']) assert.ok(sh.fragmentShader.includes(k), k);
  assert.ok(sh.uniforms.uGlow, 'shares duskUniforms.uGlow');
  const { solidMat, poolMat, outlineMat } = materials();
  assert.equal(solidMat.customProgramCacheKey(), poolMat.customProgramCacheKey());
  const opaque = (m) => m.transparent === false && m.blending === THREE.NormalBlending;
  assert.equal(opaque(solidMat), opaque(poolMat));
  assert.equal(solidMat.onBeforeCompile, poolMat.onBeforeCompile);
  const oh = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
  outlineMat.onBeforeCompile(oh);
  assert.ok(oh.vertexShader.includes('uThick') && oh.fragmentShader.includes('discard'));
});

test('visuals build and rebuild without leaking: same meshes each time, the fade controller follows the current build, disposal clears it', () => {
  const data = registerDuskGameplay(island);
  const full = new THREE.Group();
  const a = buildDuskVisuals(island, data); full.add(a.group);
  const summaryA = a.summary();
  assert.equal(duskFlora.current, a);
  assert.equal(summaryA.items, P.items.length);
  assert.ok(summaryA.drawCalls <= 60, `${summaryA.drawCalls} draw calls if every chunk were visible`);
  const under = { x: P.giants[0].x, y: P.giants[0].y + 1.1, z: P.giants[0].z };
  const cam = { x: under.x, y: under.y + 8.5, z: under.z + 13.5 };
  assert.ok(duskFlora.settle(cam, [under]) >= 1);
  assert.ok(a.caps.some((c) => c.cur === 1));
  duskFlora.enabled = false; duskFlora.settle(cam, [under]);
  assert.ok(a.caps.every((c) => c.cur === 0));
  duskFlora.enabled = true;
  a.dispose();
  assert.equal(duskFlora.current, null);
  const b = buildDuskVisuals(island, data); full.add(b.group);
  assert.deepEqual(b.summary(), summaryA);
  assert.equal(duskFlora.current, b);
  assert.equal(getColliders().filter((c) => typeof c.owner === 'string' && c.owner.startsWith('dusk-')).length, P.items.length + data.floraColliders.length);
  b.dispose();
});
