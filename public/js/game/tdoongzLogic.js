// Pure rules for the Tdoongz (PLAN Steps 64-66), the nine plush animal friends. No three.js import, so Node can test them (test/tdoongz.test.js).
//
//   TDOONG_IDS                                    the nine ids, in roster order (Step 64a = 'imnabong'; the model + config of the others land in 64b-64i)
//   planWander(centre, opts, isClear, segClear?)  a seeded wander graph round `centre` {x, z}:
//                                                   opts { rMin, rMax, count, minGap, seed, linkMax? (default 7), tries? }
//                                                   isClear(x, z) -> bool is injected (the runtime passes walkable ground clear of every collider), so Node tests it without the world
//                                                   segClear(a, b) -> bool (optional) judges a link; by default the segment is sampled every STEP_CHECK u with isClear
//                                                   -> { nodes: [{x, z}], links: [[i, j], ...], adj: [[j, ...], ...] }: only the largest connected component survives (nodes are re-indexed)
//   pickNext(graph, at, rng, recent = [])         a random neighbour of node `at`, avoiding the `recent` node indices when another choice exists; -1 when it has no neighbours
//   pathBlocked(from, to, others, r)              true when any of `others` ({x, z}) lies within r of the segment from -> to AND in front of `from` (a friend never waits for somebody behind it)
//
// Step 65 prelude: planIslandWander covers walkable island grids; wanderRoute picks
// linked paths to distant goals. The host owns the grid and movement. Compact
// packWanderGraph / unpackWanderGraph snapshots preserve node indices on replicas.
import { mulberry32 } from '../utils/rng.js';

export const TDOONG_IDS = ['imnabong', 'yubbuibbui', 'mokuring', 'shyamshyam', 'parkzyoni', 'myodette', 'dubnyangee', 'sonchaetty', 'tzukumi'];

export const STEP_CHECK = 0.5;                     // u between the clear tests along a link
const LINK_MAX = 7;                                // longest straight link between two wander nodes

/** True when every sampled point along a -> b (both ends included) is clear. */
export function segmentClear(a, b, isClear, step = STEP_CHECK) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(len / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (!isClear(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return true;
}

export function planWander(centre, { rMin = 5, rMax = 11, count = 10, minGap = 2.4, seed = 1, linkMax = LINK_MAX, tries = 0 } = {}, isClear = () => true, segClear = null) {
  const rng = mulberry32(seed);
  const nodes = [];
  const maxTries = tries || count * 60;
  for (let k = 0; k < maxTries && nodes.length < count; k++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rMin * rMin + rng() * (rMax * rMax - rMin * rMin));          // uniform over the annulus' area
    const p = { x: centre.x + Math.cos(a) * r, z: centre.z + Math.sin(a) * r };
    if (!isClear(p.x, p.z)) continue;
    if (nodes.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < minGap)) continue;
    nodes.push(p);
  }
  const judge = segClear || ((a, b) => segmentClear(a, b, isClear));
  const raw = nodes.map(() => []);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z) > linkMax) continue;
      if (judge(nodes[i], nodes[j])) { raw[i].push(j); raw[j].push(i); }
    }
  }
  return connectedGraph(nodes, raw);
}

// A regular grid covers the whole walkable island, including winding routes around
// ponds and hills. Local links keep planning linear rather than comparing every pair.
export function planIslandWander(island, isClear, { spacing = 3, segClear = null } = {}) {
  const nodes = [], cells = new Map(), raw = [];
  const n = Math.ceil(island.radius / spacing);
  for (let iz = -n; iz <= n; iz++) for (let ix = -n; ix <= n; ix++) {
    const x = island.x + ix * spacing, z = island.z + iz * spacing;
    if (Math.hypot(x - island.x, z - island.z) > island.radius - 1 || !isClear(x, z)) continue;
    cells.set(`${ix},${iz}`, nodes.length);
    nodes.push({ x, z }); raw.push([]);
  }
  const judge = segClear || ((a, b) => segmentClear(a, b, isClear));
  for (let iz = -n; iz <= n; iz++) for (let ix = -n; ix <= n; ix++) {
    const i = cells.get(`${ix},${iz}`);
    if (i === undefined) continue;
    for (const [dx, dz] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
      const j = cells.get(`${ix + dx},${iz + dz}`);
      if (j !== undefined && judge(nodes[i], nodes[j])) { raw[i].push(j); raw[j].push(i); }
    }
  }
  return connectedGraph(nodes, raw);
}

export function wanderRoute(graph, from, to) {
  if (from === to || !graph.nodes[from] || !graph.nodes[to]) return [];
  const prev = new Int32Array(graph.nodes.length).fill(-1), queue = [from];
  prev[from] = from;
  for (let i = 0; i < queue.length && prev[to] < 0; i++) {
    for (const j of graph.adj[queue[i]]) if (prev[j] < 0) { prev[j] = queue[i]; queue.push(j); }
  }
  if (prev[to] < 0) return [];
  const path = [];
  for (let j = to; j !== from; j = prev[j]) path.push(j);
  return path.reverse();
}

// One printable character per grid cell: bit 4 = node, bits 0-3 = forward
// links. A three-island snapshot is about 14 KB rather than hundreds of KB.
const GRID_EDGES = [[1, 0], [0, 1], [1, 1], [-1, 1]];
export function packWanderGraph(graph) {
  if (!graph.nodes.length) return { cells: '' };
  const xs = [...new Set(graph.nodes.map(p => p.x))].sort((a,b) => a-b);
  const zs = [...new Set(graph.nodes.map(p => p.z))].sort((a,b) => a-b);
  let step = Infinity;
  for (const values of [xs,zs]) for (let i=1;i<values.length;i++) step = Math.min(step, values[i]-values[i-1]);
  if (!Number.isFinite(step)) step = 3;
  const x = xs[0], z = zs[0], w = Math.round((xs.at(-1)-x)/step)+1, h = Math.round((zs.at(-1)-z)/step)+1;
  const map = new Map(graph.nodes.map((p,i) => [`${Math.round((p.x-x)/step)},${Math.round((p.z-z)/step)}`,i]));
  let cells = '';
  for (let iz=0;iz<h;iz++) for (let ix=0;ix<w;ix++) {
    const i = map.get(`${ix},${iz}`);
    let bits = 0;
    if (i !== undefined) {
      bits = 16;
      GRID_EDGES.forEach(([dx,dz],bit) => { const j=map.get(`${ix+dx},${iz+dz}`); if (j !== undefined && graph.adj[i].includes(j)) bits |= 1<<bit; });
    }
    cells += String.fromCharCode(65+bits);
  }
  return { x, z, step, w, h, cells };
}

export function unpackWanderGraph(data) {
  const nodes=[], adj=[], links=[], ids=new Map();
  if (!data?.cells) return { nodes, adj, links };
  for (let iz=0;iz<data.h;iz++) for (let ix=0;ix<data.w;ix++) {
    if ((data.cells.charCodeAt(iz*data.w+ix)-65)&16) {
      ids.set(`${ix},${iz}`,nodes.length);
      nodes.push({x:data.x+ix*data.step,z:data.z+iz*data.step}); adj.push([]);
    }
  }
  for (let iz=0;iz<data.h;iz++) for (let ix=0;ix<data.w;ix++) {
    const i=ids.get(`${ix},${iz}`), bits=data.cells.charCodeAt(iz*data.w+ix)-65;
    if (i === undefined) continue;
    GRID_EDGES.forEach(([dx,dz],bit) => {
      const j=ids.get(`${ix+dx},${iz+dz}`);
      if ((bits&(1<<bit)) && j !== undefined) { adj[i].push(j); adj[j].push(i); links.push([i,j]); }
    });
  }
  return { nodes, adj, links };
}

function connectedGraph(nodes, raw) {
  // keep the largest connected component (ties: the one holding the lowest node index)
  const comp = new Array(nodes.length).fill(-1);
  const sizes = [];
  for (let s = 0; s < nodes.length; s++) {
    if (comp[s] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [s];
    comp[s] = id;
    while (stack.length) {
      const u = stack.pop();
      size++;
      for (const v of raw[u]) if (comp[v] < 0) { comp[v] = id; stack.push(v); }
    }
    sizes.push(size);
  }
  let best = 0;
  sizes.forEach((n, i) => { if (n > sizes[best]) best = i; });
  const remap = new Array(nodes.length).fill(-1);
  const kept = [];
  nodes.forEach((p, i) => { if (comp[i] === best && sizes.length) { remap[i] = kept.length; kept.push(p); } });
  const adj = kept.map(() => []);
  const links = [];
  raw.forEach((list, i) => {
    if (remap[i] < 0) return;
    for (const j of list) {
      adj[remap[i]].push(remap[j]);
      if (i < j) links.push([remap[i], remap[j]]);
    }
  });
  return { nodes: kept, links, adj };
}

/** A random neighbour of `at`, avoiding `recent` when it can; -1 when `at` has no neighbours. */
export function pickNext(graph, at, rng, recent = []) {
  const all = (graph.adj && graph.adj[at]) || [];
  if (!all.length) return -1;
  const fresh = all.filter((j) => !recent.includes(j));
  const pool = fresh.length ? fresh : all;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

/** Does anybody stand on the way ahead? `others` = [{x, z}]; only points in front of `from` (dot > 0) within r of the segment count. */
export function pathBlocked(from, to, others, r) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-9) return false;
  for (const o of others) {
    const wx = o.x - from.x, wz = o.z - from.z;
    const t = (wx * dx + wz * dz) / len2;                  // 0 at `from`, 1 at `to`
    if (t <= 0) continue;                                  // behind (or beside) the start: not in the way
    const c = Math.min(1, t);
    const px = from.x + dx * c - o.x, pz = from.z + dz * c - o.z;
    if (px * px + pz * pz <= r * r) return true;
  }
  return false;
}
