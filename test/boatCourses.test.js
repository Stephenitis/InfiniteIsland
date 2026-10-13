// Step 68b's pure course layouts: real-hop flights, timed sink rows and seeded clearing probes.
// Node tests intentionally use the real Emberleaf terrain, not a conveniently empty substitute.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { Player } from '../public/js/player/player.js';
import { ISLANDS, PLAYER_RADIUS } from '../public/js/config.js';
import { partCourses, partLayouts, PART_SITES } from '../public/js/world/islands/emberParts.js';
import { getIslandModule } from '../public/js/world/islands/registry.js';
import { validateCourse, simulateLink, padPos, stepHop, setHopClock, blocks, hopTime, registerCourse, clearCourses } from '../public/js/game/hopLogic.js';
import { buildEmberPlacement } from '../public/js/world/islands/emberPlacement.js';
import { planEmberGathering, planEmberTools } from '../public/js/world/islands/emberGathering.js';
import { planEmberSeeds } from '../public/js/world/islands/emberSeeds.js';
import { gardenZone, waterfallForbidden } from '../public/js/world/islands/emberGarden.js';
import { coveReserved } from '../public/js/world/islands/emberCove.js';
import { lavaMouthReserved } from '../public/js/world/islands/lavaMouth.js';
import { polyDist } from '../public/js/world/islands/scatter.js';
const island = ISLANDS.find((i) => i.id === 'ember'), terrain = getIslandModule('ember');
const layouts = partLayouts(island, terrain);

for (const part of ['sail', 'rudder', 'compass']) {
  test(`${part}: validator flies all links on real terrain, moving extremes and wet stopping`, () => {
    const c = layouts[part].course, result = validateCourse(c, terrain);
    assert.ok(result.ok, result.errors.join('; '));
    assert.equal(c.pads.filter((p) => p.cp).length, 3);
    assert.ok(c.pads.find((p) => p.id === c.start).cp);
    assert.ok(c.pads.find((p) => p.id === c.route[c.route.length - 2]).cp);
    for (const p of c.pads) assert.ok(Math.hypot(p.x - c.zone.x, p.z - c.zone.z) + p.r + (p.motion?.amp || 0) <= c.zone.r);
    if (part !== 'rudder') for (const p of c.pads) {
      const at = padPos(p, 0);
      assert.ok(!blocks(c, at.x, at.z, at.top, 0), `${p.id}: overhead tier blocks standing feet`);
    }
    assert.equal(c.backDown.label, 'Back down');
    assert.ok(c.backDown.to.y < c.backDown.from.y);
  });
  test(`${part}: scripted real-hop route reaches the goal through all three checkpoints`, () => {
    const c = layouts[part].course, visited = new Set([c.start]);
    let time = 3.2;
    for (let n = 1; n < c.route.length; n++) {
      const a = c.pads.find((p) => p.id === c.route[n - 1]), b = c.pads.find((p) => p.id === c.route[n]);
      const link = c.links.find((l) => l.a === a.id && l.b === b.id);
      let result;
      // Waiting is player input too: a still rock safely holds the departure while the clock advances.
      for (let w = 0; w <= 240; w++) {
        const at = time + w / 20;
        if (link.wait && (padPos(a, at).top < a.top - 0.01 || padPos(b, at + 0.45).top < b.top - 0.01)) continue;
        result = simulateLink(c, a, b, at, terrain);
        if (result.ok) { time = at + result.flight + 0.25; break; }
        if (!link.wait) break;
      }
      assert.ok(result?.ok, `${a.id} -> ${b.id}: ${result?.why}`);
      visited.add(b.id);
    }
    assert.ok(visited.has(c.goal));
    assert.ok(c.pads.filter((p) => p.cp).every((p) => visited.has(p.id)));
  });
  test(`${part}: validator rejects a too-wide hop and a broken checkpoint pad`, () => {
    const c = structuredClone(layouts[part].course);
    c.pads.find((p) => p.id === c.route[1]).x += 12;
    assert.equal(validateCourse(c, terrain).ok, false);
    const tall = structuredClone(layouts[part].course);
    tall.pads.find((p) => p.id === tall.route[1]).top = tall.pads[0].top + 0.8;
    assert.ok(validateCourse(tall, terrain).errors.some((e) => /rise/.test(e)));
    const small = structuredClone(layouts[part].course);
    small.pads.find((p) => p.cp).r = 0.5;
    assert.ok(validateCourse(small, terrain).errors.some((e) => /too small/.test(e)));
  });
}

test('rudder: every cooling row has an up plate at every clock phase and a still resting rock', () => {
  const c = layouts.rudder.course;
  for (let t = 0; t < 20; t += 0.025) {
    for (const row of c.rows) assert.ok(row.some((id) => !padPos(c.pads.find((p) => p.id === id), t).sunk), `${row} at ${t}`);
  }
  assert.ok(c.pads.filter((p) => p.kind === 'rock').every((p) => !p.motion));
  const b = { x: c.hazard.x + 7.9, z: c.hazard.z, y: c.hazard.y + 1, vy: 0, grounded: false, pad: null };
  let splash = false;
  for (let n = 0; n < 180; n++) if (stepHop(b, {}, c, n / 60, 1 / 60, terrain).splash) { splash = true; break; }
  assert.ok(splash, 'falling through the masked lava terrain splashes without damage');
});

test('part courses occupy clearings of the existing props, lanes, gathering, tools and seeds', () => {
  const p = buildEmberPlacement(island, terrain), g = planEmberGathering(island, terrain);
  const items = [...p.trees, ...p.boulders, ...p.ferns, ...p.flowers, ...p.decor, ...p.garden.plots,
    ...g.herbs, ...g.digs, ...planEmberTools(island, terrain), ...Object.values(planEmberSeeds(island, terrain, p))];
  for (const [part, site] of Object.entries(PART_SITES)) {
    const { anchor: a } = layouts[part];
    assert.ok(terrain.walkable(a.x, a.z));
    assert.ok(!gardenZone(island, a.x, a.z, site.keepClear));
    assert.ok(!waterfallForbidden(island, a.x, a.z, site.keepClear));
    assert.ok(!coveReserved(a.x, a.z, site.keepClear, island));
    assert.ok(!lavaMouthReserved(a.x, a.z, site.keepClear));
    for (const q of items) assert.ok(Math.hypot(q.x - a.x, q.z - a.z) - (q.r || 0.3) > site.keepClear, `${part}: ${q.id || q.layer} intrudes`);
    for (const lane of p.lanes) assert.ok(polyDist(lane, a.x, a.z) > site.keepClear + 2, `${part}: a walking lane intrudes`);
  }
});

test('Emberleaf placement remains at the Step 60 pinned hashes; layouts are cached and do not claim solids', () => {
  const hash = (o) => crypto.createHash('md5').update(JSON.stringify(o)).digest('hex').slice(0, 10);
  const p = buildEmberPlacement(island, terrain);
  assert.deepEqual({ trees: hash(p.trees), boulders: hash(p.boulders), ferns: hash(p.ferns), flowers: hash(p.flowers), decor: hash(p.decor), lanes: hash(p.lanes) },
    { trees: '2014801176', boulders: '98cd3aa689', ferns: '356ed6e089', flowers: '834b877a48', decor: 'abf0410989', lanes: '54052443b5' });
  assert.equal(p.solids.length, 189);
  assert.equal(partLayouts(island, terrain), layouts);
  assert.deepEqual(partCourses(island, terrain), Object.values(layouts).map((l) => l.course));
});

// Drive the actual Player vertical/checkpoint/respawn integration continuously. Horizontal input
// is prescribed through real Player._step collision; this does not measure keyboard feel.
function drivenPlayer(c, at) {
  const p = Object.create(Player.prototype);
  Object.assign(p, { position: new THREE.Vector3(at.x, at.top, at.z), velocity: { x: 0, z: 0 },
    _course: c, _courseJump: false, _glideHeld: false, _sq: 0, _sqVel: 0,
    _cb: { x: at.x, z: at.z, y: at.top, vy: 0, grounded: true, pad: at.id, checkpoint: at.id, splash: null },
    radius: PLAYER_RADIUS, moveGuard: null, _noGuard: false, dustBurst() {} });
  p._courseWalk = (x, z) => !blocks(c, x, z, p._cb.y, hopTime());
  return p;
}
for (const part of ['sail', 'rudder', 'compass']) test(`${part}: continuous Player vertical run preserves all checkpoints, then descends Back down`, (t) => {
  const c = layouts[part].course, p = drivenPlayer(c, c.pads[0]);
  let now = 0;
  setHopClock(() => now);
  const tick = (dx = 0, dz = 0) => { p._step(dx, dz); now += 1 / 60; p._courseVertical(1 / 60); };
  const walk = (x, z, target = null) => {
    for (let n = 0; n < 180; n++) {
      if (target) { const q = target(); x=q.x; z=q.z; }
      const dx = x - p.position.x, dz = z - p.position.z, d = Math.hypot(dx, dz);
      if (d < 0.025) break;
      const k = Math.min(1, 3 / 60 / d); tick(dx * k, dz * k);
      assert.ok(p._cb.grounded && !p._splashing, `repositioning remains on ${p._cb.pad} toward ${x},${z} at ${now}`);
    }
  };
  const visited = new Set([p._cb.checkpoint]);
  for (let n = 1; n < c.route.length; n++) {
    const a = c.pads.find((q) => q.id === c.route[n - 1]), b = c.pads.find((q) => q.id === c.route[n]);
    const link = c.links.find((q) => q.a === a.id && q.b === b.id);
    // For crust entries reserve enough up time for the entry, a short reposition and the exit.
    if (link.wait && b.motion) {
      for (let w = 0; w < 900 && [0.45, 1.1, 1.6].some((dt) => padPos(b, now + dt).top < b.top - 0.01); w++) tick();
    }
    let A = { ...padPos(a, now) }, B = { ...padPos(b, now + 0.4) };
    let dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz); dx /= d; dz /= d;
    walk(0, 0, () => {
      const at={...padPos(a,now)}, to={...padPos(b,now+0.4)}, d=Math.hypot(to.x-at.x,to.z-at.z);
      return {x:at.x+(to.x-at.x)/d*(a.r-0.35),z:at.z+(to.z-at.z)/d*(a.r-0.35)};
    });
    A = { ...padPos(a, now) }; B = { ...padPos(b, now + 0.4) };
    dx = B.x - A.x; dz = B.z - A.z; d = Math.hypot(dx, dz); dx /= d; dz /= d;
    const result = simulateLink(c, a, b, now, terrain);
    assert.ok(result.ok, `${part} timed departure ${a.id}: ${result.why}`);
    p._courseJump = true;
    // Like simulateLink, the first physics frame is at takeoff; horizontal increments follow it.
    tick();
    for (let f = 0; f < 180 && !p._cb.grounded && !p._splashing; f++) tick(dx * result.speed / 60, dz * result.speed / 60);
    assert.equal(p._cb.pad, b.id, `${a.id} -> ${b.id}`);
    visited.add(p._cb.checkpoint);
  }
  assert.equal(p._cb.pad, c.goal);
  t.diagnostic(`scripted route: ${now.toFixed(1)} s (prescribed horizontal movement)`);
  assert.ok(c.pads.filter((q) => q.cp).every((q) => visited.has(q.id)));
  // The return surface is continuous and steeper than a walk-up step; falling follows it downward.
  const back = c.backDown;
  walk(back.from.x, back.from.z);
  for (let f = 1; f <= 240; f++) {
    const u = f / 240, x = back.from.x + (back.to.x - back.from.x) * u, z = back.from.z + (back.to.z - back.from.z) * u;
    tick(x - p.position.x, z - p.position.z);
  }
  assert.ok(!p._splashing && Math.abs(p.position.y - back.to.y) < 0.4, `returned at ${p.position.y}, target ${back.to.y}`);
  setHopClock(() => 0);
});

test('rudder: actual Player falls into lava and respawns at the last midpoint checkpoint', () => {
  const c = layouts.rudder.course, mid = c.pads.find((q) => q.cp && q.id !== c.start), p = drivenPlayer(c, mid);
  let now = 0; setHopClock(() => now);
  p.position.x = c.hazard.x + 7.9; p.position.z = c.hazard.z;
  let sawSplash = false;
  for (let n = 0; n < 240; n++) { now += 1 / 60; p._courseVertical(1 / 60); sawSplash ||= !!p._splashing; if (sawSplash && !p._splashing) break; }
  assert.ok(sawSplash && !p._splashing);
  assert.equal(p._cb.pad, mid.id);
  assert.equal(p._cb.checkpoint, mid.id);
  assert.equal(p.position.x, mid.x); assert.equal(p.position.z, mid.z);
  setHopClock(() => 0);
});

for (const part of ['sail', 'compass']) test(`${part}: entering the start at ground height cannot skip to a higher spiral tier`, () => {
  const c = layouts[part].course, start = c.pads[0], p = drivenPlayer(c, start);
  p._course = null; p._cb = null;
  p.position.y = terrain.height(start.x, start.z);
  p._switchCourse(c);
  p._courseVertical(1 / 60);
  assert.ok(p.position.y < start.top + 0.4, `entry stands at ${p.position.y}`);
  assert.notEqual(p._cb.pad, c.goal);
});

test('compass: an actual Player sea fall respawns at the shell-bell checkpoint', () => {
  const c = layouts.compass.course, bell = c.pads.find((q) => q.id === c.route[c.route.length - 2]), p = drivenPlayer(c, bell);
  let now = 0; setHopClock(() => now);
  p.position.x = c.zone.x + 9; p.position.z = c.zone.z;
  assert.ok(terrain.height(p.position.x, p.position.z) < c.gapY, 'seaward fall is over ocean');
  let sawSplash = false;
  for (let n = 0; n < 300; n++) { now += 1 / 60; p._courseVertical(1 / 60); sawSplash ||= !!p._splashing; if (sawSplash && !p._splashing) break; }
  assert.ok(sawSplash && !p._splashing);
  assert.equal(p._cb.pad, bell.id); assert.equal(p._cb.checkpoint, bell.id);
  setHopClock(() => 0);
});

test('sail: an actual Player canopy fall lands safely on jungle ground', () => {
  const c = layouts.sail.course, goal = c.pads.find((q) => q.id === c.goal), p = drivenPlayer(c, goal);
  p.position.x = c.zone.x + 8; p.position.z = c.zone.z;
  for (let n = 0; n < 300; n++) { p._courseVertical(1 / 60); if (p._cb.grounded && p._cb.pad === null) break; }
  assert.ok(p._cb.grounded && !p._splashing);
  assert.equal(p._cb.pad, null);
  assert.equal(p.position.y, terrain.height(p.position.x, p.position.z));
});

for (const part of ['sail', 'rudder', 'compass']) test(`${part}: Back down crosses no pad side walls`, () => {
  const c = layouts[part].course, b = c.backDown;
  for (let n = 0; n <= 100; n++) {
    const u = n / 100, x = b.from.x + (b.to.x - b.from.x) * u, z = b.from.z + (b.to.z - b.from.z) * u;
    const y = b.from.y + (b.to.y - b.from.y) * u;
    assert.ok(!blocks(c, x, z, y, 0), `${part}: pad wall at return fraction ${u}`);
  }
});


test('rudder raised basin clears the unchanged slope and its approach joins ground to the start', () => {
  const c = layouts.rudder.course, h = c.hazard;
  for (let x = -8; x <= 8; x += 0.5) for (let z = -8; z <= 8; z += 0.5) {
    if (Math.hypot(x, z) < h.r) assert.ok(terrain.height(h.x + x, h.z + z) < h.y, 'no buried lava or rock tops');
  }
  const ramp = c.approach, start = c.pads[0];
  assert.equal(ramp.from.y, terrain.height(ramp.from.x, ramp.from.z));
  assert.equal(ramp.to.y, start.top);
  const p = drivenPlayer(c, { ...ramp.from, top: ramp.from.y, id: null });
  p._cb.checkpoint = c.start;
  for (let n = 1; n <= 240; n++) {
    const u = n / 240, x = ramp.from.x + (ramp.to.x - ramp.from.x) * u, z = ramp.from.z + (ramp.to.z - ramp.from.z) * u;
    assert.equal(blocks(c, x, z, p.position.y, 0), false);
    p.position.x = x; p.position.z = z; p._courseVertical(1 / 60);
  }
  assert.equal(p._cb.pad, c.start); assert.ok(p._cb.grounded);
});

for (const glide of [false, true]) test('real Player update walks out of sail zone without a vertical snap, glide='+glide, () => {
  clearCourses(); const c=layouts.sail.course; registerCourse(c);
  const goal=c.pads.find(q=>q.id===c.goal), p=drivenPlayer(c,goal);
  Object.assign(p,{root:new THREE.Group(),_t:0,speedScale:1,_turnRate:0,facing:0,_faceTo:null,
    _animatePose(){},_updateDust(){},_sailGlideArmed:glide});
  p._cb.glide=glide;
  // Outward from the tree, away from the return ramp and lower spiral tiers.
  let now=0;setHopClock(()=>now);
  let landed=false, outside=false;
  for(let i=0;i<900;i++){
    const prev=p.position.y, vy=p._cb?.vy||0;now+=1/60;
    p.update(1/60,{move:{x:-1,z:0},jumpHeld:glide});
    outside ||= Math.hypot(p.position.x-c.zone.x,p.position.z-c.zone.z)>c.zone.r;
    assert.ok(prev-p.position.y <= Math.max(0,-vy/60)+24/3600+0.001, 'drop exceeds gravity step');
    assert.ok(!p._splashing,'walkable ground has no splash');
    if(outside && p._cb?.grounded){landed=true;break;}
  }
  assert.ok(outside && landed);assert.equal(p._cb.glide,false);assert.equal(p._sailGlideArmed,false);
  clearCourses();setHopClock(()=>0);
});
