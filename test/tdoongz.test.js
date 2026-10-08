// Step 64a: the Tdoongz' pure wander rules: a seeded, connected wander graph over an injected clear test, the next-stop pick and the blocked-path check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planWander, pickNext, pathBlocked, segmentClear, TDOONG_IDS } from '../public/js/game/tdoongzLogic.js';
import { TDOONGZ, FIRES } from '../public/js/config.js';
import { mulberry32 } from '../public/js/utils/rng.js';
import { SCRIPT } from '../public/js/game/tdoongzScript.js';

const C = { x: 7, z: 9.5 };
const OPTS = { rMin: 5, rMax: 11.5, count: 10, minGap: 2.4, seed: 64001 };
// a world with two "trees" and a wall: clear everywhere else
const solids = [{ x: 12, z: 9.5, r: 1.2 }, { x: 3, z: 14, r: 1.5 }, { x: 7, z: 20, r: 1.0 }];
const clear = (x, z) => solids.every((s) => Math.hypot(x - s.x, z - s.z) >= s.r + 0.4) && !(x > 9 && x < 9.6 && z > 12);

test('roster ids: nine, unique, Im Nabong first', () => {
  assert.equal(TDOONG_IDS.length, 9);
  assert.equal(new Set(TDOONG_IDS).size, 9);
  assert.equal(TDOONG_IDS[0], 'imnabong');
});

test('the config entry for Im Nabong fits the planner', () => {
  const t = TDOONGZ.imnabong;
  assert.equal(t.species, 'bunny');
  assert.equal(t.home.fire, 'home');
  const fire = FIRES.find((f) => f.id === t.home.fire);
  assert.ok(fire);
  assert.ok(t.home.rMin >= fire.bench.ring + 1.2, 'the wander ring stays outside the bench ring');
  assert.ok(t.speed > 0 && t.nearR > t.talkRadius && t.radius > 0);
});

test('Steps 64b-d: Yu Bbui Bbui, Mokuring and Shyam Shyam have valid entries, dialog and distinct gaits / seeds', () => {
  const ids = ['yubbuibbui', 'mokuring', 'shyamshyam'];
  const gaits = { yubbuibbui: 'trot', mokuring: 'walk', shyamshyam: 'scurry' };
  const fire = FIRES.find((f) => f.id === 'home');
  const seeds = new Set([TDOONGZ.imnabong.seed]);
  for (const id of ids) {
    assert.ok(TDOONG_IDS.includes(id), id);
    const t = TDOONGZ[id];
    assert.ok(t, id);
    assert.notEqual(t.talk, false, `${id} talks`);
    assert.equal(t.gait, gaits[id]);
    assert.equal(t.scale, 1.27);
    assert.equal(t.home.fire, 'home');
    assert.ok(t.home.rMin >= fire.bench.ring + 1.2 && t.home.rMax > t.home.rMin && t.home.rMax <= 14, `${id} stays round the fire`);
    assert.ok(t.speed > 0 && t.nearR > t.talkRadius && t.radius > 0 && t.name && t.korean && t.species);
    assert.ok(!seeds.has(t.seed), `${id} has its own seed`);
    seeds.add(t.seed);
  }
  assert.notEqual(TDOONGZ.imnabong.talk, false, 'Im Nabong keeps her dialog');
});

test('planWander is deterministic by seed and differs between seeds', () => {
  const a = planWander(C, OPTS, clear), b = planWander(C, OPTS, clear), c = planWander(C, { ...OPTS, seed: 7 }, clear);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.nodes, c.nodes);
});

test('every node is clear, inside the annulus and at least minGap from the others', () => {
  const g = planWander(C, OPTS, clear);
  assert.ok(g.nodes.length >= 5, `only ${g.nodes.length} nodes`);
  for (const [i, p] of g.nodes.entries()) {
    assert.ok(clear(p.x, p.z));
    const d = Math.hypot(p.x - C.x, p.z - C.z);
    assert.ok(d >= OPTS.rMin - 1e-9 && d <= OPTS.rMax + 1e-9, `node ${i} at ${d}`);
    for (let j = i + 1; j < g.nodes.length; j++) assert.ok(Math.hypot(p.x - g.nodes[j].x, p.z - g.nodes[j].z) >= OPTS.minGap - 1e-9);
  }
});

test('every link is a clear straight segment and the adjacency is symmetric', () => {
  const g = planWander(C, OPTS, clear);
  assert.ok(g.links.length >= g.nodes.length - 1);
  for (const [i, j] of g.links) {
    assert.ok(segmentClear(g.nodes[i], g.nodes[j], clear, 0.1), `link ${i}-${j}`);
    assert.ok(g.adj[i].includes(j) && g.adj[j].includes(i));
  }
  g.adj.forEach((list, i) => list.forEach((j) => assert.ok(g.adj[j].includes(i))));
});

test('the graph is connected', () => {
  for (const seed of [1, 2, 3, 64001, 99]) {
    const g = planWander(C, { ...OPTS, seed }, clear);
    const seen = new Set([0]);
    const stack = [0];
    while (stack.length) for (const v of g.adj[stack.pop()]) if (!seen.has(v)) { seen.add(v); stack.push(v); }
    assert.equal(seen.size, g.nodes.length, `seed ${seed}`);
  }
});

test('a custom segClear is honoured: a blocking judge leaves a single node', () => {
  const g = planWander(C, OPTS, clear, () => false);
  assert.equal(g.nodes.length, 1);
  assert.equal(g.links.length, 0);
});

test('an impossible world gives an empty graph without throwing', () => {
  const g = planWander(C, OPTS, () => false);
  assert.deepEqual(g, { nodes: [], links: [], adj: [] });
});

test('pickNext only returns neighbours and avoids the recent ones', () => {
  const g = planWander(C, OPTS, clear);
  const rng = mulberry32(5);
  const at = g.adj.findIndex((l) => l.length >= 2);
  assert.ok(at >= 0);
  for (let k = 0; k < 60; k++) {
    const n = pickNext(g, at, rng, []);
    assert.ok(g.adj[at].includes(n));
    const avoid = g.adj[at][0];
    const m = pickNext(g, at, rng, [avoid]);
    assert.ok(g.adj[at].includes(m));
    assert.notEqual(m, avoid);
  }
  // when every neighbour is recent it still moves
  assert.ok(g.adj[at].includes(pickNext(g, at, rng, g.adj[at])));
  assert.equal(pickNext({ adj: [[]] }, 0, rng, []), -1);
});

test('pathBlocked: only points in front, near the segment', () => {
  const from = { x: 0, z: 0 }, to = { x: 4, z: 0 };
  assert.equal(pathBlocked(from, to, [{ x: 2, z: 0.3 }], 0.6), true);           // on the way
  assert.equal(pathBlocked(from, to, [{ x: 2, z: 1.5 }], 0.6), false);          // beside it
  assert.equal(pathBlocked(from, to, [{ x: -1, z: 0 }], 0.6), false);           // behind
  assert.equal(pathBlocked(from, to, [{ x: 4.4, z: 0 }], 0.6), true);           // just past the end, within r of it
  assert.equal(pathBlocked(from, to, [{ x: 5, z: 0 }], 0.6), false);            // beyond the end
  assert.equal(pathBlocked(from, to, [{ x: 0.2, z: 0.1 }], 0.6), true);         // right in front of the start
  assert.equal(pathBlocked(from, to, [], 0.6), false);
  assert.equal(pathBlocked(from, from, [{ x: 0, z: 0 }], 0.6), false);          // no direction, no block
});

test('Step 64e: Park Zyoni is a quadruped with dialog, the biggest collider and her own gait / seed', () => {
  const t = TDOONGZ.parkzyoni;
  assert.ok(t && TDOONG_IDS.includes('parkzyoni'));
  assert.equal(t.gait, 'quad');
  assert.notEqual(t.talk, false);
  assert.equal(t.species, 'unicorn');
  assert.ok(t.scale >= 1.27 && t.scale <= 1.4, "about player size (the user asked for her a touch bigger)");
  const fire = FIRES.find((f) => f.id === t.home.fire);
  assert.ok(t.home.rMin >= fire.bench.ring + 1.2 && t.home.rMax > t.home.rMin && t.home.rMax <= 14);
  for (const [id, o] of Object.entries(TDOONGZ)) if (id !== 'parkzyoni') {
    assert.ok(t.radius > o.radius, `her collider is bigger than ${id}'s`);
    assert.notEqual(t.seed, o.seed);
  }
});

test('Tdoongz lines: every talking friend has an intro, a greeting, menu rows with pages and a bye', () => {
  const FLOURISHES = ['pat', 'peek', 'earflop', 'twirl', 'show', 'wave', 'wag', 'sniff', 'shake', 'scratch', 'sit', 'surprise', 'look', 'flutter', 'wiggle', 'nibble', 'swish', 'toss', 'stomp', 'pirouette', 'plie', 'bow', 'fluff', 'rest'];
  for (const [id, t] of Object.entries(TDOONGZ)) {
    if (t.talk === false) continue;
    const S = SCRIPT[id];
    assert.ok(S, `${id} has a script`);
    assert.ok(S.intro.length >= 2 && S.intro.every((p) => typeof p === 'string' && p.length > 10), `${id} intro`);
    assert.ok(S.greet && S.bye, `${id} greet / bye`);
    assert.ok(S.rows.length >= 2, `${id} rows`);
    for (const row of S.rows) {
      assert.ok(row.label && row.pages.length >= 1 && ['sparkle', 'heart', 'flame'].includes(row.icon), `${id}.${row.id}`);
      if (row.play) assert.ok(FLOURISHES.includes(row.play), `${id}.${row.id} plays a known flourish`);
    }
  }
});

test('Step 64f: Myodette is a gliding penguin with dialog, a wide collider and her own seed', () => {
  const t = TDOONGZ.myodette;
  assert.ok(t && TDOONG_IDS.includes('myodette'));
  assert.equal(t.gait, 'glide');
  assert.equal(t.species, 'penguin');
  assert.notEqual(t.talk, false);
  assert.equal(t.scale, 1.27);
  assert.ok(t.speed < 1 && t.radius > 0.56 && t.nearR > t.talkRadius);
  const fire = FIRES.find((f) => f.id === t.home.fire);
  assert.ok(t.home.rMin >= fire.bench.ring + 1.2 && t.home.rMax > t.home.rMin && t.home.rMax <= 14);
  for (const [id, o] of Object.entries(TDOONGZ)) if (id !== 'myodette') assert.notEqual(t.seed, o.seed);
  assert.ok(SCRIPT.myodette.rows.some((r) => r.play === 'pirouette') && SCRIPT.myodette.rows.some((r) => r.play === 'bow'));
});
