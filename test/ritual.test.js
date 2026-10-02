import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RITUAL, ritualPathPoint, ritualIslandDistance, inRitualArea, ritualChannelPoint } from '../public/js/world/islands/ritual.js';
import { getHeight, getGroundType, isWalkable, regionOf } from '../public/js/world/terrain.js';
import { createRitualCircle } from '../public/js/world/ritualCircle.js';
import { createHarvest } from '../public/js/world/harvest.js';
import { getToolAction, TOOLS } from '../public/js/items/tools.js';
import { clearColliders, getColliders } from '../public/js/world/colliders.js';
import { clearInteractables, getInteractables, findNearest } from '../public/js/world/interactables.js';

test('ritual ford is continuously walkable from home to the circle, with deep water outside the shallows', () => {
  for (let n = 0; n <= 120; n++) {
    const t = n / 120;
    const p = ritualPathPoint(t), a = ritualPathPoint(Math.max(0, t - 0.001)), b = ritualPathPoint(Math.min(1, t + 0.001));
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    for (const offset of [-1, 0, 1]) {
      const x = p.x + offset * dz / length;
      const z = p.z - offset * dx / length;
      assert.ok(isWalkable(x, z), `path blocked at ${x},${z}`);
      assert.equal(regionOf(x, z), 'home');
    }
  }
  assert.ok(isWalkable(RITUAL.circle.x, RITUAL.circle.z));
  assert.ok(getHeight(-62, 43) < -0.35);
  for (const at of RITUAL.stones) assert.ok(isWalkable(at.x, at.z + 1.5));
});

test('the natural channel separates the shores with water that is shallow enough to wade', () => {
  for (let i = 0; i <= 80; i++) {
    const p = ritualChannelPoint(i / 80);
    const h = getHeight(p.x, p.z);
    assert.ok(h < -0.1 && h > -0.3, `channel depth at ${p.x},${p.z}: ${h}`);
    assert.equal(getGroundType(p.x, p.z), 'water');
    assert.ok(isWalkable(p.x, p.z));
  }
  for (const [x, z] of [[-38, 38], [-37, 40], [-36, 39]]) {
    assert.equal(getGroundType(x, z), 'water', 'former dry causeway is submerged');
    assert.ok(isWalkable(x, z));
  }
});

test('four varied stones on a concentric north arc survive repeated tool swings and replica events', () => {
  clearColliders(); clearInteractables();
  const scene = new THREE.Scene();
  const site = createRitualCircle(scene);
  assert.equal(site.stones.length, 4);
  const horizontalDistance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const spacing = horizontalDistance(site.stones[0].position, site.stones[1].position);
  assert.ok(new Set(RITUAL.stones.map((s) => s.height)).size > 1);
  const domains = {}, events = [];
  let kind = 'axe', drops = 0;
  const player = { index: 0, position: new THREE.Vector3(), swinging: false, swingProgress: 0, faceToward() {} };
  const actor = () => ({ screen: 'host', index: 0, pos: player.position });
  const sync = {
    isHost: true, screenId: 'host', register(name, domain) { domains[name] = domain; },
    emit(name, event, data) { events.push({ event, data }); }, actorFor: actor,
    request(name, event, data) { return domains[name].handleRequest(event, data, actor()); },
  };
  const items = {
    heldBy: () => ({ kind, state: 'held' }), heldByKey: () => ({ kind, state: 'held' }),
    swing() { player.swinging = true; player.swingProgress = 0; return true; },
  };
  const harvest = createHarvest({
    scene, players: { list: [player], p1: player, get: () => player }, items, sync,
    particles: { burst() {} }, hud: {}, interactions: { stopAnim() {} },
    props: { handles: { trees: [], palms: [], rocks: [] }, setWobble() {} },
    pickups: { spawnTo() { drops++; } }, extraTargets: site.stones,
  });
  for (const [i, stone] of site.stones.entries()) {
    assert.ok(stone.position.z < RITUAL.circle.z);
    assert.ok(Math.abs(Math.hypot(stone.position.x - RITUAL.circle.x, stone.position.z - RITUAL.circle.z) - 5.8) < 1e-10);
    if (i) assert.ok(Math.abs(horizontalDistance(stone.position, site.stones[i - 1].position) - spacing) < 1e-10);
    const it = stone.userData.interactable;
    assert.equal(it.onInteract, null, 'no empty-handed Inspect action');
    player.position.copy(stone.position).add(new THREE.Vector3(0, 0, 1.6));
    assert.equal(findNearest(player.position, 2.2, (entry) => entry.type !== 'ritualstone'), null);
    assert.equal(findNearest(player.position, 2.2, (entry) => !!getToolAction({ kind: 'shovel', state: 'held' }, entry)), it);
    for (kind of Object.keys(TOOLS)) {
      assert.equal(getToolAction({ kind, state: 'held' }, it), 'strike');
      for (let n = 0; n < 10; n++) {
        player.swinging = false;
        assert.equal(harvest.hit(it, player), true);
        const before = events.length;
        harvest.update(0.01);
        assert.equal(events.length, before, 'no hit before impact');
        player.swingProgress = 0.5;
        harvest.update(0.02);
        assert.equal(events.length, before + 1);
        assert.equal(events.at(-1).data.final, false);
        assert.ok(Math.abs(stone.children[0].rotation.x) > 0, 'stone rocks on impact');
        harvest.update(0.8);
        assert.equal(stone.children[0].rotation.x, 0);
        assert.equal(stone.children[0].scale.y, 1);
      }
    }
    // A replica event and even a malformed down snapshot must not destroy a standing stone.
    domains.harvest.applyEvent('hit', { id: it.id, dx: 1, dz: 0, final: true, actor: { screen: 'other', index: 0 } });
    domains.harvest.applySnapshot({ down: [{ id: it.id, in: 45 }] });
    harvest.update(1);
    assert.ok(stone.visible);
    assert.ok(getInteractables().includes(it));
    assert.ok(getColliders().some((c) => c.owner === stone));
  }
  assert.equal(drops, 0);
  assert.ok(harvest.states.every((s) => s.state === 'idle' && s.hits === 0 && s.regrowIn === null));
  assert.deepEqual(domains.harvest.snapshot(), { down: [] });
  clearColliders(); clearInteractables();
});

test('ritual outline is asymmetric, path bends and area music has a shoreline hysteresis band', () => {
  const a = ritualPathPoint(0), b = ritualPathPoint(1), mid = ritualPathPoint(0.5);
  assert.ok(Math.hypot(mid.x - (a.x + b.x) / 2, mid.z - (a.z + b.z) / 2) > 2);
  assert.notEqual(ritualIslandDistance(-56, 43), ritualIslandDistance(-40, 43));
  assert.ok(inRitualArea(-48, 45));
  assert.equal(inRitualArea(2, 12), false);
  let bands = 0;
  for (let z = 43; z < 58; z += 0.1) {
    if (!inRitualArea(-48, z) && inRitualArea(-48, z, true)) bands++;
  }
  assert.ok(bands > 8, 'entry and exit thresholds are separated');
});
