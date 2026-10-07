// A storybook page's LOOK (Steps 48-49): the page as layered cardboard, built live from a page's data (game/pages/*.js, game/pageFormat.js). Everything is the game's own
// chunky toon style: vertex-coloured merged meshes with the dark #2b2340 outline hull, on a few depth planes so the narrow-FOV side camera (game/storybook.js) gets real parallax:
//
//   foreground  z +3.5 .. +5    little grass tufts in front of the lane (pages without tiles only)
//   lane        z 0             the TILES (Step 49): earth blocks with grass caps and scalloped lips, 45-degree wedges, wooden plank shelves, thorn brambles, spring flowers,
//                               built as chunked merged meshes (40 columns each); pits are dark holes in the earth; the campfires, berries, the five letters and the goal bookmark
//   decor       z -1.3          trees (the plank shelves sit in their canopies), bushes, flowers and signs a page's `decor` list asks for
//   mid layer   z -7 .. -14     paper cut-outs: trees, bushes, hills (flat boxes / squashed spheres, a little thickness, outlined)
//   back layer  z -32 .. -60    big painted hills (the sky itself is the day-cycle dome) and drifting paper clouds
//   ends        the page's two edges: the book's gutter (dark leather spine, a curl of paper, stitches) at the left, the stack of page edges at the right
//
//   const v = createPageVisuals(scene)     built once (empty); open(page) builds the page, close() frees every geometry / material / texture of it
//   v.open(page) / v.close() / v.isOpen / v.update(t)      v.group (Group 'storybook-page'), v.exitSpot (the ribbon's world x / z), v.summary()
//   v.setRun(run, { silent })      show a run's state at once (hide taken berries / letters, light its campfires) - a load / late join
//   v.collect(kind, id)            the pop for one taken item ('berry' | 'letter' | 'fire' (lights it) | 'goal') -> its world position (for sparkles)
//   v.boing(cx, cy)                squash the spring flower on tile (cx, cy)        v.itemPos(kind, id)  world { x, y, z } of an item
//   Step 50: v.open(page, grid) draws the run's WORKING grid (game/platformerLogic.js cloneGrid; the tool gates are tile kinds: stone blocks, cracked floors, bramble walls, soft soil,
//   hanging crates, geodes, logs, dropped crates); v.refresh(cells, hits) rebuilds only the 40-column chunks that changed (a broken block, a felled tree's log, a cracked block's new cracks);
//   v.hidden is a Set of "cx,cy" tiles the rebuild leaves undrawn until the caller deletes them and refreshes again (a log still tipping over)
// Step 52b: a page of theme 'snow' has frosted-blue rock with white snow caps, ICE tiles (pale blue, glossy), SNOW DRIFTS (white mounds), SLUSH (a grey-blue sludge over the pit), snow walls ('J'), pine / snowman / lantern decor and
// cut-out pines; the sled, the icicles, the crates, the buddies and the snowfall are world/pageSnowVisuals.js.
// The page group is only visible while a page is open; coordinates are world (the pocket at PAGE.x / PAGE.z / PAGE.y, game/storybookLogic.js).
// Draw calls (one page, no players): about 45, of which the 5 letters, the flames and the berries are 10 + 1 + 2.
import * as THREE from 'three';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../render/geo.js';
import { PAGE, pageExit, pageToWorld } from '../game/storybookLogic.js';
import { SOLID, ONEWAY, SLOPE_R, SLOPE_L, THORN, SPRING } from '../game/platformerLogic.js';
import { mulberry32 } from '../utils/rng.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const box = (color, p, s, r = [0, 0, 0]) => part(BOX, color, { p, s, r });
const FLOWER_COLORS = ['#ff93c6', '#ffd85e', '#ffffff', '#c9a4ff', '#ff7c6b'];
const DEPTH = 3.2, CAP_H = 0.22, DEEP = 8, CHUNK_COLS = 40;
const MEADOW_PAL = { earthA: '#c98a54', earthB: '#c4824c', cap: '#8fe36b', lipA: '#8fe36b', lipB: '#7bdc72', slope: '#c98a54', pit: '#3b2a4a', pit2: '#53406a' };
const SNOW_PAL = { earthA: '#8e9fd0', earthB: '#8496c8', cap: '#f6faff', lipA: '#ffffff', lipB: '#e6f0ff', slope: '#8e9fd0', pit: '#26325a', pit2: '#3a4a7a' };
const palOf = (page) => (page.theme === 'snow' ? SNOW_PAL : MEADOW_PAL);
const LETTER_COLORS = { F: '#ff7c6b', E: '#ffd85e', A: '#6fe0a6', S: '#6cc3ff', T: '#c79bff' };
const GLYPHS = {
  F: ['XXXX', 'X...', 'XXX.', 'X...', 'X...'],
  E: ['XXXX', 'X...', 'XXX.', 'X...', 'XXXX'],
  A: ['.XX.', 'X..X', 'XXXX', 'X..X', 'X..X'],
  S: ['.XXX', 'X...', '.XX.', '...X', 'XXX.'],
  T: ['XXXX', '.XX.', '.XX.', '.XX.', '.XX.'],
};

function meshOf(parts, name, { hull = 0.06, cast = false, receive = true } = {}) {
  if (!parts.length) parts = [box('#000000', [0, -999, 0], [0.001, 0.001, 0.001])];       // (Step 52a: a 40 column chunk that is all pit has no tiles: keep a speck so the merge has something)
  const geo = combine(parts);
  const mesh = new THREE.Mesh(geo, VERTEX_TOON);
  mesh.name = name; mesh.castShadow = cast; mesh.receiveShadow = receive;
  const outline = hull ? makeOutline(geo, hull) : null;
  if (outline) mesh.add(outline);
  return { mesh, geo, hullGeo: outline ? outline.geometry : null };
}

function lighten(hex) { const c = new THREE.Color(hex); c.lerp(new THREE.Color('#ffffff'), 0.28); return `#${c.getHexString()}`; }

// ---- the tiles ------------------------------------------------------------------------------------------------------------------------------------------
// a right-triangle prism: '/' has its right angle at the bottom right, '\' at the bottom left (flat-shaded: the faces are separate triangles)
const _wedges = {};
function wedgeGeo(dir) {
  if (_wedges[dir]) return _wedges[dir];
  const A = [0, 0], B = [1, 0], C = dir === '/' ? [1, 1] : [0, 1], hz = 0.5;
  const pts = [];
  const tri = (a, b, c) => pts.push(...a, ...b, ...c);
  const v = (p, z) => [p[0] - 0.5, p[1] - 0.5, z];
  const centre = [0, -0.1, 0];
  const add = (a, b, c) => {                                                                       // wind the triangle so its normal points away from the prism's middle
    const n = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a)).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...c), new THREE.Vector3(...a)));
    const m = new THREE.Vector3((a[0] + b[0] + c[0]) / 3 - centre[0], (a[1] + b[1] + c[1]) / 3 - centre[1], (a[2] + b[2] + c[2]) / 3 - centre[2]);
    if (n.dot(m) >= 0) tri(a, b, c); else tri(a, c, b);
  };
  add(v(A, hz), v(B, hz), v(C, hz)); add(v(A, -hz), v(B, -hz), v(C, -hz));                       // the two faces
  for (const [p, q] of [[A, B], [B, C], [C, A]]) { add(v(p, hz), v(q, hz), v(q, -hz)); add(v(p, hz), v(q, -hz), v(p, -hz)); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
  g.computeVertexNormals();
  _wedges[dir] = g;
  return g;
}

// ---- the tool gates (Step 50): each is one solid tile, drawn on its own over the earth
const GATE_DEPTH = 2.5;
function gateParts(kind, x, y, cx, cy, z0, hit, top) {
  const P = [];
  const front = z0 + (kind === 'I' || kind === 'M' ? DEPTH : GATE_DEPTH) / 2 + 0.02;
  if (kind === 'B') {                                                                              // a stone block: grey, bevelled, cracking as it is hit
    P.push(box(hit ? '#979ca8' : '#a9afbb', [cx, cy, z0], [0.96, 0.96, GATE_DEPTH]));
    P.push(box('#cfd4de', [cx, cy + 0.43, z0], [0.96, 0.12, GATE_DEPTH + 0.02]));
    P.push(box('#868b98', [cx, cy - 0.43, z0], [0.96, 0.12, GATE_DEPTH + 0.02]));
    if (hit) for (const [dx, dy, len, a] of [[-0.12, 0.12, 0.62, 0.5], [0.15, -0.08, 0.5, -0.7], [0.0, -0.3, 0.3, 0.2]]) P.push(box('#3d424d', [cx + dx, cy + dy, front], [0.07, len, 0.04], [0, 0, a]));
  } else if (kind === 'X') {                                                                       // cracked floor: earth with dark crack lines on the front and the top
    for (const [dx, dy, len, a] of [[-0.25, 0.1, 0.55, 0.6], [0.0, -0.1, 0.5, -0.7], [0.28, 0.15, 0.45, 0.5], [-0.05, 0.3, 0.3, -0.3]]) P.push(box('#4b3426', [cx + dx, cy + dy, front], [0.07, len, 0.04], [0, 0, a]));
    for (let k = 0; k < 3; k++) P.push(box('#4b3426', [cx - 0.3 + k * 0.3, cy + 0.5, z0 + (k - 1) * 0.55], [0.22, 0.04, 0.07], [0, 0.6, 0]));
    P.push(box('#b9824f', [cx, cy, z0], [0.94, 0.94, GATE_DEPTH - 0.05]));
  } else if (kind === 'W') {                                                                       // a bramble wall: a thorny tangle
    P.push(part(G.sphere, hit ? '#35693f' : '#3f7a4a', { p: [cx, cy, z0], s: [0.56, 0.54, 1.15] }));
    for (let k = 0; k < 5; k++) { const a = k * 1.3 + cx; P.push(part(G.cyl6, '#2f6a42', { p: [cx + Math.sin(a) * 0.2, cy + Math.cos(a * 1.4) * 0.2, z0 + Math.cos(a) * 0.5], r: [0, 0, Math.sin(a) * 1.2], s: [0.05, 0.95, 0.05] })); }
    for (let k = 0; k < 8; k++) { const a = k * 0.85 + cy; P.push(part(G.cone6, '#ff5d86', { p: [cx + Math.sin(a * 2.3) * 0.38, cy + Math.cos(a * 1.9) * 0.38, z0 + 1.12], r: [Math.PI / 2, 0, Math.sin(a)], s: [0.07, 0.24, 0.07] })); }
  } else if (kind === 'D') {                                                                       // soft soil: dark crumbly earth with pebbles
    P.push(box('#7a5236', [cx, cy, z0], [0.96, 0.96, GATE_DEPTH]));
    for (let k = 0; k < 5; k++) P.push(box(k % 2 ? '#a6764a' : '#5a3b27', [cx - 0.3 + (k * 0.37) % 0.62, cy - 0.3 + (k * 0.23) % 0.6, front], [0.14, 0.1, 0.04], [0, 0, k]));
  } else if (kind === 'H' || kind === 'K') {                                                       // a crate (H hangs on a vine to the top of the page)
    P.push(box('#c28a4f', [cx, cy, z0], [0.92, 0.92, 1.5]));
    P.push(box('#8e5b2e', [cx, cy, z0 + 0.76], [0.84, 0.1, 0.04])); P.push(box('#8e5b2e', [cx, cy, z0 + 0.76], [0.1, 0.84, 0.04]));
    P.push(box('#8e5b2e', [cx, cy + 0.44, z0], [0.96, 0.08, 1.54])); P.push(box('#8e5b2e', [cx, cy - 0.44, z0], [0.96, 0.08, 1.54]));
    if (kind === 'H') {
      const len = Math.max(0.5, top - (cy + 0.46));
      P.push(part(G.cyl6, '#3f7a4a', { p: [cx, cy + 0.46 + len / 2, z0], s: [0.06, len, 0.06] }));
      for (let k = 1; k < len; k += 1.6) P.push(part(G.sphere, '#58c96b', { p: [cx + (k % 2 ? 0.14 : -0.14), cy + 0.46 + k, z0], r: [0, 0, k % 2 ? 0.6 : -0.6], s: [0.16, 0.07, 0.1] }));
    }
  } else if (kind === 'I') {                                                                       // ice: pale blue, glossy, with highlights and a few frozen bubbles
    P.push(box('#b9e3fb', [cx, cy, z0], [1.0, 1.0, DEPTH]));
    P.push(box('#e4f7ff', [cx, cy + 0.44, z0], [1.0, 0.12, DEPTH + 0.1]));
    P.push(box('#ffffff', [cx - 0.18, cy + 0.5, z0 + DEPTH / 2 + 0.05], [0.42, 0.04, 0.04]));
    P.push(box('#9fd0f0', [cx, cy - 0.1, front + 0.5], [0.8, 0.05, 0.03]));
    P.push(part(G.sphereLo, '#e8f8ff', { p: [cx + 0.2, cy - 0.15, front + 0.52], s: [0.07, 0.07, 0.03] }));
  } else if (kind === 'M') {                                                                       // a snow drift: a white mound on a pale body
    P.push(box('#e6eefc', [cx, cy, z0], [1.0, 1.0, DEPTH]));
    P.push(part(G.sphere, '#ffffff', { p: [cx, cy + 0.5, z0], s: [0.62, 0.17, DEPTH * 0.5] }));
    P.push(part(G.sphereLo, '#f6faff', { p: [cx - 0.22, cy + 0.34, front + 0.1], s: [0.3, 0.2, 0.2] }));
    P.push(part(G.sphereLo, '#cfdff5', { p: [cx + 0.25, cy - 0.12, front + 0.1], s: [0.22, 0.1, 0.1] }));
  } else if (kind === 'J') {                                                                       // a snow wall: packed white blocks with blue seams and frost crystals
    P.push(box('#eef4ff', [cx, cy, z0], [0.98, 0.98, GATE_DEPTH]));
    P.push(box('#b9d2f0', [cx, cy + 0.0, front + 0.01], [0.9, 0.04, 0.03])); P.push(box('#b9d2f0', [cx - 0.24, cy, front + 0.01], [0.04, 0.9, 0.03]));
    P.push(part(G.cone6, '#cfeeff', { p: [cx + 0.2, cy + 0.2, front + 0.12], r: [Math.PI / 2, 0, 0.3], s: [0.08, 0.28, 0.08] }));
    P.push(part(G.sphereLo, '#ffffff', { p: [cx - 0.1, cy + 0.42, front + 0.05], s: [0.3, 0.12, 0.2] }));
  } else if (kind === 'R') {                                                                       // a geode: a rock full of crystals
    P.push(part(G.ico1, hit ? '#7b7f8e' : '#8c909e', { p: [cx, cy - 0.06, z0], s: [0.5, 0.44, 0.66] }));
    for (const [dx, h, a] of [[-0.2, 0.34, -0.4], [0.02, 0.44, 0.05], [0.22, 0.3, 0.45]]) P.push(part(G.cone6, '#c79bff', { p: [cx + dx, cy + 0.2 + h / 3, z0 + 0.35], r: [0, 0, a], s: [0.1, h, 0.1] }));
    P.push(part(G.cone6, '#e6d4ff', { p: [cx + 0.02, cy + 0.34, z0 + 0.5], s: [0.06, 0.3, 0.06] }));
  }
  return P;
}

function tileChunkParts(page, g, hits, c0, c1, hidden = null) {
  const H = g.H, P = [], pal = palOf(page);
  const ox = PAGE.x - g.W / 2, oy = PAGE.y - page.floorRows, z0 = PAGE.z;
  const at = (x, y) => g.at(x, y);
  const earth = (x, y) => { if (at(x, y) !== SOLID) return false; const k = g.kind(x, y); return k === '.' || k === 'X'; };
  // earth: vertical runs per column, merged across columns that share the same run, in short segments that alternate a tint
  const byKey = new Map();
  for (let x = c0; x < c1; x++) {
    for (let y = 0; y < H;) {
      if (!earth(x, y)) { y++; continue; }
      let y1 = y; while (y1 + 1 < H && earth(x, y1 + 1)) y1++;
      const k = `${y}:${y1}`; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(x);
      y = y1 + 1;
    }
  }
  let seg = 0;
  for (const [k, xs] of byKey) {
    const [y0, y1] = k.split(':').map(Number);
    xs.sort((a, b) => a - b);
    for (let i = 0; i < xs.length;) {
      let j = i; while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1 && j + 1 - i < 7) j++;
      const w = j - i + 1, bottom = oy + y0 - (y0 === 0 ? DEEP : 0), top = oy + y1 + 1;
      P.push(box(seg++ % 2 ? pal.earthB : pal.earthA, [ox + xs[i] + w / 2, (bottom + top) / 2, z0], [w, top - bottom, DEPTH]));
      i = j + 1;
    }
  }
  // cavities (a tunnel through a hill, a secret room under a cracked floor): a dark backing wall, so they read as hollows rather than holes through the page
  const cavity = (x, y) => at(x, y) !== SOLID && (at(x, y + 1) === SOLID || at(x, y + 2) === SOLID) && (at(x, y - 1) === SOLID || at(x, y - 2) === SOLID);
  for (let y = 0; y < H; y++) {
    let start = -1;
    for (let x = c0; x <= c1; x++) {
      const c = x < c1 && cavity(x, y);
      if (c && start < 0) start = x;
      if (!c && start >= 0) { const w = x - start; P.push(box('#6b4a33', [ox + start + w / 2, oy + y + 0.5, z0 - 1.45], [w, 1, 0.1])); start = -1; }
    }
  }
  // grass caps (merged along the exposed tops) + the scalloped front lip
  for (let y = 0; y < H; y++) {
    let start = -1;
    for (let x = c0; x <= c1; x++) {
      const exposed = x < c1 && earth(x, y) && at(x, y + 1) !== SOLID;
      if (exposed && start < 0) start = x;
      if (!exposed && start >= 0) {
        const w = x - start;
        P.push(box(pal.cap, [ox + start + w / 2, oy + y + 1 - CAP_H / 2 + 0.01, z0], [w + 0.04, CAP_H, DEPTH + 0.3]));
        start = -1;
      }
      if (exposed) P.push(part(G.sphereLo, (x + y) % 2 ? pal.lipB : pal.lipA, { p: [ox + x + 0.5, oy + y + 1 - 0.1, z0 + DEPTH / 2 + 0.12], s: [0.62, 0.3, 0.42] }));
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = c0; x < c1; x++) {
      const ch = at(x, y);
      const cx = ox + x + 0.5, cy = oy + y + 0.5;
      if (ch === SOLID) {
        const kd = hidden && hidden.has(`${x},${y}`) ? '.' : g.kind(x, y);
        if (kd !== '.' && kd !== 'L') P.push(...gateParts(kd, x, y, cx, cy, z0, (hits && hits[`${x},${y}`]) | 0, oy + H));
        else if (kd === 'L' && (g.kind(x - 1, y) !== 'L' || (hidden && hidden.has(`${x - 1},${y}`)))) {                                           // a felled tree: ONE log across its whole run of tiles
          let x1 = x; while (g.kind(x1 + 1, y) === 'L' && !(hidden && hidden.has(`${x1 + 1},${y}`))) x1++;
          const w = x1 - x + 1, mx = ox + x + w / 2;
          P.push(part(G.cyl8, '#9a6a44', { p: [mx, cy, z0], r: [0, 0, Math.PI / 2], s: [0.5, w, 0.5] }));
          P.push(part(G.cyl8, '#d9b384', { p: [ox + x + 0.02, cy, z0], r: [0, 0, Math.PI / 2], s: [0.45, 0.06, 0.45] }));
          P.push(part(G.cyl8, '#d9b384', { p: [ox + x1 + 0.98, cy, z0], r: [0, 0, Math.PI / 2], s: [0.45, 0.06, 0.45] }));
          for (let k = 0; k < w; k += 2) P.push(box('#7c5233', [ox + x + k + 0.6, cy + 0.1, z0 + 0.48], [0.5, 0.05, 0.04]));
        }
      }
      if (ch !== SOLID && g.kind(x, y) === 'y') {                                                       // Step 52b: slush: a grey-blue sludge over the pit (a thrown snowball freezes it)
        P.push(box('#9fb7c9', [cx, cy - 0.05, z0 - 0.2], [1.0, 0.8, 2.6]));
        P.push(part(G.sphere, '#c6d8e4', { p: [cx - 0.15, cy + 0.34, z0 + 0.5], s: [0.38, 0.12, 0.5] }));
        P.push(part(G.sphere, '#dfeaf2', { p: [cx + 0.2, cy + 0.3, z0 + 0.2], s: [0.26, 0.09, 0.4] }));
        P.push(part(G.sphereLo, '#7f98ad', { p: [cx + 0.05, cy + 0.12, z0 + 1.35], s: [0.3, 0.12, 0.1] }));
      }
      if (ch === SLOPE_R || ch === SLOPE_L) {
        const dir = ch === SLOPE_R ? '/' : '\\';
        P.push(part(wedgeGeo(dir), pal.slope, { p: [cx, cy, z0], s: [1, 1, DEPTH] }));
        const a = dir === '/' ? Math.PI / 4 : -Math.PI / 4, nx = dir === '/' ? -0.7071 : 0.7071;
        P.push(box(pal.cap, [cx - nx * 0.1 + 0.0, cy - 0.7071 * 0.1, z0], [1.4142 + 0.06, CAP_H, DEPTH + 0.3], [0, 0, a]));
      }
    }
  }
  // plank shelves (merged along their run)
  for (let y = 0; y < H; y++) {
    let start = -1;
    for (let x = c0; x <= c1; x++) {
      const is = x < c1 && at(x, y) === ONEWAY;
      if (is && start < 0) start = x;
      if (!is && start >= 0) {
        const w = x - start, mx = ox + start + w / 2, ty = oy + y + 1;
        P.push(box('#e0a063', [mx, ty - 0.13, z0], [w, 0.26, 1.7]));
        if (page.theme === 'snow') P.push(box('#f6faff', [mx, ty - 0.01, z0], [w + 0.04, 0.1, 1.76]));
        P.push(box('#b7773f', [mx, ty - 0.29, z0], [w - 0.1, 0.08, 1.5]));
        for (let k = 0; k < w; k++) P.push(box('#c98a54', [ox + start + k + 0.5, ty - 0.1, z0 + 0.86], [0.04, 0.2, 0.02]));   // plank seams on the front edge
        start = -1;
      }
    }
  }
  return P;
}

function detailParts(page, rng) {
  const g = page.grid, P = [];
  const ox = PAGE.x - g.W / 2, oy = PAGE.y - page.floorRows, z0 = PAGE.z;
  for (let y = 0; y < g.H; y++) {
    for (let x = 0; x < g.W; x++) {
      const ch = g.at(x, y), cx = ox + x + 0.5, by = oy + y;
      if (ch === THORN) {                                                                         // a bramble: curling vines and pink thorns
        for (let k = 0; k < 3; k++) P.push(part(G.cyl6, '#3f7a4a', { p: [cx - 0.28 + k * 0.28, by + 0.28, z0 + (k - 1) * 0.25], r: [0, 0, (k - 1) * 0.35], s: [0.05, 0.56, 0.05] }));
        for (let k = 0; k < 7; k++) {
          const a = k * 0.9 + x, px = cx + Math.sin(a * 2.1) * 0.36, pz = z0 + Math.cos(a * 1.7) * 0.35;
          P.push(part(G.cone6, '#ff5d86', { p: [px, by + 0.2 + (k % 3) * 0.14, pz], r: [0, 0, Math.sin(a) * 0.9], s: [0.07, 0.22, 0.07] }));
        }
        P.push(part(G.sphereLo, '#2f6a42', { p: [cx, by + 0.12, z0], s: [0.46, 0.16, 0.5] }));
      } else if (ch === SPRING) {                                                                 // the flower's stem and leaves (the head is its own instance: it squashes)
        P.push(part(G.cyl6, '#58c96b', { p: [cx, by + 0.17, z0], s: [0.06, 0.34, 0.06] }));
        P.push(part(G.sphere, '#58c96b', { p: [cx - 0.22, by + 0.1, z0 + 0.1], r: [0, 0, 0.5], s: [0.2, 0.06, 0.12] }));
        P.push(part(G.sphere, '#58c96b', { p: [cx + 0.22, by + 0.1, z0 - 0.1], r: [0, 0, -0.5], s: [0.2, 0.06, 0.12] }));
      }
    }
  }
  // campfire bases: a ring of stones, three logs (the flame is an instance)
  for (const f of page.campfires) {
    const cx = ox + f.x, by = oy + f.y;
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; P.push(part(G.ico1, '#9a93a6', { p: [cx + Math.cos(a) * 0.4, by + 0.1, z0 + Math.sin(a) * 0.3], s: [0.12, 0.1, 0.1] })); }
    for (let k = 0; k < 3; k++) P.push(part(G.cyl6, '#7a4a2a', { p: [cx, by + 0.14, z0], r: [Math.PI / 2 - 0.2, 0.0, 1.05 * k - 1.0], s: [0.07, 0.62, 0.07] }));
  }
  // decor: trees (trunk + canopy + fruit), bushes, flowers
  const topAt = (x) => { for (let y = g.H - 1; y >= 0; y--) { const ch = g.at(x, y); if (ch === SOLID) return y + 1; } return 2; };
  for (const d of page.decor || []) {
    const gx = Math.floor(d.x), base = oy + topAt(gx), x = ox + d.x + 0.5, s = d.s || 1;
    if (d.kind === 'tree') {
      const zt = z0 - 1.35;
      P.push(box('#9a6a44', [x, base + 2.6 * s, zt], [0.78 * s, 5.2 * s, 0.7]));
      P.push(box('#7c5233', [x + 0.2 * s, base + 2.2 * s, zt + 0.37], [0.2 * s, 4 * s, 0.04]));
      const cy = base + 4.4 * s;
      for (const [dx, dy, rx, ry] of [[0, 0, 2.6, 2.0], [-1.7, -0.5, 1.7, 1.4], [1.8, -0.4, 1.8, 1.5], [-0.6, 1.2, 1.7, 1.2], [1.0, 1.3, 1.5, 1.0]]) {
        P.push(part(G.sphere, (dx + dy) > 1 ? '#6dd079' : '#4fbf6e', { p: [x + dx * s, cy + dy * s, zt - 0.1], s: [rx * s, ry * s, 0.9] }));
      }
      for (let k = 0; k < 9; k++) {                                                                // apples / pears
        const a = rng() * Math.PI * 2, r = rng() * 0.8;
        P.push(part(G.sphereLo, k % 3 ? '#ff5d4d' : '#ffc94d', { p: [x + Math.cos(a) * r * 2.5 * s, cy + Math.sin(a) * r * 1.8 * s, zt + 0.45], s: [0.2, 0.2, 0.18] }));
      }
      P.push(box('#dcc79a', [x, base + 0.04, zt + 0.5], [1.6 * s, 0.06, 0.9]));
    } else if (d.kind === 'pine') {                                                              // Step 52b: a snow-dusted pine: stacked cones with white caps
      const zt = z0 - 1.35;
      P.push(box('#7a5233', [x, base + 0.7 * s, zt], [0.5 * s, 1.4 * s, 0.5]));
      [[1.8, 2.6, 1.2], [3.2, 2.1, 0.95], [4.5, 1.6, 0.7], [5.6, 1.1, 0.5]].forEach(([dy, w, h], k) => {
        P.push(part(G.cone6, k % 2 ? '#4aa58a' : '#3f8f7a', { p: [x, base + dy * s, zt], s: [w * 0.5 * s, h * 1.25 * s, w * 0.28 * s] }));
        P.push(part(G.cone6, '#f6faff', { p: [x, base + (dy + h * 0.42) * s, zt + 0.12], s: [w * 0.34 * s, h * 0.7 * s, w * 0.2 * s] }));
      });
      P.push(box('#f6faff', [x, base + 0.04, zt + 0.5], [1.6 * s, 0.06, 0.9]));
    } else if (d.kind === 'snowman') {
      P.push(part(G.sphere, '#ffffff', { p: [x, base + 0.62, z0 - 1.0], s: [0.78, 0.7, 0.55] }));
      P.push(part(G.sphere, '#ffffff', { p: [x, base + 1.52, z0 - 1.0], s: [0.55, 0.52, 0.45] }));
      P.push(part(G.sphere, '#ffffff', { p: [x, base + 2.2, z0 - 1.0], s: [0.38, 0.36, 0.34] }));
      P.push(part(G.sphereLo, '#2b2340', { p: [x - 0.12, base + 2.28, z0 - 0.68], s: [0.045, 0.05, 0.03] })); P.push(part(G.sphereLo, '#2b2340', { p: [x + 0.12, base + 2.28, z0 - 0.68], s: [0.045, 0.05, 0.03] }));
      P.push(part(G.cone6, '#ff8a3a', { p: [x, base + 2.18, z0 - 0.5], r: [Math.PI / 2, 0, 0], s: [0.06, 0.3, 0.06] }));
      P.push(box('#e8554e', [x, base + 1.92, z0 - 0.95], [0.78, 0.12, 0.5]));
      P.push(box('#2b2340', [x, base + 2.58, z0 - 1.0], [0.46, 0.22, 0.34])); P.push(box('#2b2340', [x, base + 2.46, z0 - 1.0], [0.62, 0.05, 0.5]));
      for (let k = 0; k < 3; k++) P.push(part(G.sphereLo, '#2b2340', { p: [x, base + 0.95 + k * 0.32, z0 - 0.6], s: [0.05, 0.05, 0.03] }));
    } else if (d.kind === 'lantern') {                                                           // a lamp post: a warm glowing lantern (unlit emissive look through bright vertex colours)
      P.push(part(G.cyl6, '#5a4a6a', { p: [x, base + 1.4, z0 - 0.9], s: [0.07, 2.8, 0.07] }));
      P.push(box('#5a4a6a', [x, base + 2.85, z0 - 0.9], [0.5, 0.08, 0.3]));
      P.push(box('#ffd27a', [x, base + 3.1, z0 - 0.9], [0.32, 0.42, 0.24])); P.push(box('#fff2b0', [x, base + 3.1, z0 - 0.78], [0.2, 0.3, 0.06]));
      P.push(part(G.cone6, '#5a4a6a', { p: [x, base + 3.42, z0 - 0.9], s: [0.26, 0.2, 0.2] }));
    } else if (d.kind === 'bush') {
      P.push(part(G.sphere, page.theme === 'snow' ? '#e4eefc' : '#58c96b', { p: [x, base + 0.45, z0 - 1.0], s: [0.95, 0.62, 0.5] }));
      P.push(part(G.sphere, page.theme === 'snow' ? '#f6faff' : '#74d983', { p: [x + 0.55, base + 0.35, z0 - 0.9], s: [0.6, 0.45, 0.4] }));
      for (let k = 0; k < 4; k++) P.push(part(G.sphereLo, page.theme === 'snow' ? '#ff9ab4' : '#ff7c9a', { p: [x - 0.5 + k * 0.35, base + 0.55 + (k % 2) * 0.15, z0 - 0.5], s: [0.09, 0.09, 0.08] }));
    } else if (d.kind === 'flower') {
      for (let k = -1; k <= 1; k++) {
        const c = FLOWER_COLORS[(gx + k + 5) % FLOWER_COLORS.length];
        P.push(part(G.cyl6, '#58c96b', { p: [x + k * 0.3, base + 0.3, z0 - 0.6], s: [0.035, 0.6, 0.035] }));
        P.push(part(G.sphereLo, c, { p: [x + k * 0.3, base + 0.66, z0 - 0.6], s: [0.16, 0.16, 0.1] }));
      }
    } else if (d.kind === 'sign') {
      P.push(part(G.cyl6, '#9a6a44', { p: [x, base + 0.9, z0 - 0.9], s: [0.07, 1.8, 0.07] }));
    }
  }
  return P;
}

function foregroundParts(page, rng) {
  const P = [], L = page.length, X0 = PAGE.x, Z0 = PAGE.z, Y0 = PAGE.y - page.floorRows + 2;
  for (let x = -L / 2 - 4; x <= L / 2 + 4; x += 1.9 + rng() * 1.4) {                              // tufts of grass blades
    const z = Z0 + 3.4 + rng() * 1.2;
    for (let k = 0; k < 3; k++) P.push(part(G.cone6, '#7fd36a', { p: [X0 + x + (k - 1) * 0.1, Y0 - 0.1, z], r: [0, 0, (k - 1) * 0.3], s: [0.06, 0.5 + rng() * 0.2, 0.04] }));
  }
  return P;
}

function midParts(page) {
  const P = [], X0 = PAGE.x, Z0 = PAGE.z, Y0 = PAGE.y;
  for (const m of page.mid || []) {
    const x = X0 + m.x, z = Z0 + m.z, s = m.s || 1, c = m.color || '#58c96b';
    if (m.kind === 'pine') {                                                                     // Step 52b: a flat cut-out pine with snow on its boughs
      P.push(box('#7a5233', [x, Y0 + 0.9 * s, z], [0.4 * s, 1.8 * s, 0.2 * s]));
      [[2.0, 3.0, 1.9], [3.5, 2.5, 1.6], [4.8, 1.9, 1.3], [5.8, 1.3, 1.0]].forEach(([dy, w, h], k) => {
        P.push(part(G.cone6, k % 2 ? lighten(c) : c, { p: [x, Y0 + dy * s, z], s: [w * 0.55 * s, h * s, 0.22 * s] }));
        P.push(part(G.cone6, '#f6faff', { p: [x, Y0 + (dy + h * 0.28) * s, z + 0.08 * s], s: [w * 0.38 * s, h * 0.6 * s, 0.16 * s] }));
      });
      P.push(box('#dce8f6', [x, Y0 + 0.05, z + 0.55 * s], [1.3 * s, 0.05, 1.1 * s]));
    } else if (m.kind === 'tree') {
      P.push(box('#9a6a44', [x, Y0 + 1.3 * s, z], [0.5 * s, 2.6 * s, 0.2 * s]));
      P.push(part(G.sphere, c, { p: [x, Y0 + 3.7 * s, z], s: [2.0 * s, 2.3 * s, 0.24 * s] }));
      P.push(part(G.sphere, lighten(c), { p: [x + 0.6 * s, Y0 + 4.4 * s, z + 0.12 * s], s: [1.1 * s, 1.2 * s, 0.14 * s] }));
      P.push(box('#dcc79a', [x, Y0 + 0.05, z + 0.55 * s], [1.3 * s, 0.05, 1.1 * s]));              // the folded paper tab the cut-out stands on
    } else if (m.kind === 'hill') {
      P.push(part(G.sphere, c, { p: [x, Y0 - 0.6 * s, z], s: [7 * s, 3.6 * s, 0.34 * s] }));
    } else {
      P.push(part(G.sphere, c, { p: [x, Y0 + 0.4 * s, z], s: [1.7 * s, 1.1 * s, 0.22 * s] }));
      P.push(box('#dcc79a', [x, Y0 + 0.05, z + 0.4 * s], [1.2 * s, 0.05, 0.8 * s]));
    }
  }
  return P;
}

function backParts(page) {
  const P = [], X0 = PAGE.x, Z0 = PAGE.z, Y0 = PAGE.y;
  for (const h of (page.back && page.back.hills) || []) {
    P.push(part(G.sphere, h.color, { p: [X0 + h.x, Y0 - h.h * 0.32, Z0 + h.z], s: [h.w / 2, h.h, 1.2] }));
  }
  return P;
}

function cloudParts(page) {
  const P = [], X0 = PAGE.x, Z0 = PAGE.z, Y0 = PAGE.y;
  for (const c of (page.back && page.back.clouds) || []) {
    const s = c.s || 1;
    for (const [dx, dy, w, h] of [[0, 0, 3.4, 1.1], [-2.2, -0.25, 2.2, 0.8], [2.3, -0.2, 2.4, 0.85], [0.4, 0.55, 2.0, 0.9]]) {
      P.push(part(G.sphere, '#ffffff', { p: [X0 + c.x + dx * s, Y0 + c.y + dy * s, Z0 + c.z], s: [w * s, h * s, 0.4 * s] }));
    }
  }
  return P;
}

function endParts(page) {
  const P = [], L = page.length, X0 = PAGE.x, Z0 = PAGE.z, Y0 = PAGE.y;
  const zc = Z0 - 14, zd = 46;                                                                    // the walls reach from far behind the back layer to just in front of the foreground
  // left: the gutter. A dark leather spine wall, a curl of paper rolling down into it, stitched with cream thread
  P.push(box('#6b4a3a', [X0 - L / 2 - 6.2, Y0 + 8, zc], [10, 40, zd]));
  P.push(box('#4d3429', [X0 - L / 2 - 1.1, Y0 + 8, zc], [0.5, 40, zd]));
  P.push(part(G.cyl8, '#fff4dc', { p: [X0 - L / 2 - 1.8, Y0 - 0.3, zc], r: [Math.PI / 2, 0, 0], s: [2.3, zd, 2.3] }));
  P.push(part(G.cyl8, '#ecd9ae', { p: [X0 - L / 2 - 1.8, Y0 - 0.3, zc], r: [Math.PI / 2, 0, 0], s: [2.0, zd + 0.02, 2.0] }));
  for (let y = Y0 + 2.5; y < Y0 + 26; y += 2.2) P.push(box('#fff4dc', [X0 - L / 2 - 1.4, y, Z0 + 4.2], [0.18, 1.3, 0.14]));   // stitches
  // right: the stack of page edges (alternating cream / buff), then the back cover
  for (let i = 0; i < 12; i++) {
    P.push(box(i % 2 ? '#f1e2bd' : '#fffaf0', [X0 + L / 2 + 0.7 + i * 0.5, Y0 + 8 + (i % 3) * 0.2, zc], [0.46, 40 - (i % 3) * 0.4, zd]));
  }
  P.push(box('#c2494f', [X0 + L / 2 + 7.2, Y0 + 8, zc], [1.4, 41, zd]));
  P.push(box('#ffd85e', [X0 + L / 2 + 6.4, Y0 + 8, zc], [0.1, 40, zd]));
  return P;
}

function exitParts(page) {
  const P = [], e = pageExit(page), Y0 = PAGE.y, z = PAGE.z - 0.85;
  P.push(part(G.cyl8, '#9a6a44', { p: [e.x, Y0 + 2.0, z], s: [0.12, 4.0, 0.12] }));
  P.push(part(G.sphere, '#ffd85e', { p: [e.x, Y0 + 4.1, z], s: [0.2, 0.2, 0.2] }));
  P.push(box('#ff5d73', [e.x + 0.55, Y0 + 2.9, z], [1.0, 2.2, 0.08]));                            // the ribbon bookmark
  P.push(part(G.cone6, '#ff5d73', { p: [e.x + 0.3, Y0 + 1.5, z], r: [Math.PI, 0, 0], s: [0.3, 0.5, 0.06] }));
  P.push(part(G.cone6, '#ff5d73', { p: [e.x + 0.8, Y0 + 1.5, z], r: [Math.PI, 0, 0], s: [0.3, 0.5, 0.06] }));
  P.push(part(G.cone6, '#ffd85e', { p: [e.x + 0.55, Y0 + 1.5, z + 0.06], r: [Math.PI, 0, 0], s: [0.14, 0.4, 0.14] }));
  P.push(box('#c2494f', [e.x - 0.15, Y0 + 0.28, z + 0.2], [1.0, 0.5, 0.7]));                      // a small closed book at the foot
  P.push(box('#fff4dc', [e.x - 0.15, Y0 + 0.28, z + 0.56], [0.9, 0.42, 0.04]));
  return P;
}

// pits are dark holes: a deep box behind the lane across every run of empty columns
function pitParts(page) {
  const g = page.grid, P = [], ox = PAGE.x - g.W / 2, oy = PAGE.y - page.floorRows;
  for (let x = 0; x < g.W;) {
    if (g.at(x, 0) === SOLID) { x++; continue; }
    let x1 = x; while (x1 + 1 < g.W && g.at(x1 + 1, 0) !== SOLID) x1++;
    const w = x1 - x + 1;
    const pal = palOf(page);
    P.push(box(pal.pit, [ox + x + w / 2, oy - DEEP / 2 + 1, PAGE.z - 1.7], [w + 0.1, DEEP + 2, 0.3]));
    P.push(box(pal.pit2, [ox + x + w / 2, oy + 0.6, PAGE.z - 1.5], [w + 0.1, 1.2, 0.1]));
    x = x1 + 1;
  }
  return P;
}

// ---- the goal bookmark ----------------------------------------------------------------------------------------------------------------------------------
function goalParts(page) {
  const P = [], w = pageToWorld(page, page.goal.x, page.goal.y), z = PAGE.z - 0.9;
  P.push(part(G.cyl8, '#9a6a44', { p: [w.x - 1.4, w.y + 3.0, z], s: [0.14, 6.0, 0.14] }));
  P.push(part(G.cyl8, '#9a6a44', { p: [w.x + 1.4, w.y + 3.0, z], s: [0.14, 6.0, 0.14] }));
  P.push(part(G.sphere, '#ffd85e', { p: [w.x - 1.4, w.y + 6.1, z], s: [0.26, 0.26, 0.26] }));
  P.push(part(G.sphere, '#ffd85e', { p: [w.x + 1.4, w.y + 6.1, z], s: [0.26, 0.26, 0.26] }));
  P.push(box('#9a6a44', [w.x, w.y + 5.7, z], [3.0, 0.16, 0.16]));
  P.push(box('#ff5d73', [w.x, w.y + 3.9, z + 0.02], [2.5, 3.6, 0.08]));                           // the big ribbon bookmark between the poles
  P.push(box('#ffd85e', [w.x, w.y + 5.45, z + 0.06], [2.5, 0.16, 0.06]));
  for (const dx of [-0.85, 0, 0.85]) P.push(part(G.cone6, '#ff5d73', { p: [w.x + dx, w.y + 1.9, z], r: [Math.PI, 0, 0], s: [0.44, 0.8, 0.08] }));
  P.push(box('#c2494f', [w.x, w.y + 0.3, z + 0.7], [2.4, 0.6, 1.0]));                            // a big closed book to stand beside
  P.push(box('#fff4dc', [w.x, w.y + 0.3, z + 1.21], [2.2, 0.5, 0.04]));
  return P;
}

const _tex = new Map();
function textTexture(key, draw, w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const FONT = '800 {S}px "Baloo 2", "Fredoka", "Trebuchet MS", system-ui, sans-serif';
function bannerTexture(name) {
  return textTexture('banner', (g) => {
    g.fillStyle = '#fff4dc'; g.fillRect(0, 0, 768, 256);
    g.lineWidth = 10; g.strokeStyle = '#2b2340'; g.strokeRect(5, 5, 758, 246);
    g.strokeStyle = '#ff7c6b'; g.lineWidth = 6; g.strokeRect(22, 22, 724, 212);
    g.fillStyle = '#6b4226'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = FONT.replace('{S}', '54'); g.fillText('A story page', 384, 82);
    g.font = FONT.replace('{S}', name.length > 12 ? '78' : '96'); g.fillText(name, 384, 168);
  }, 768, 256);
}
function signTexture(text) {
  return textTexture('sign', (g) => {
    g.fillStyle = '#f6e2b0'; g.fillRect(0, 0, 512, 192);
    g.lineWidth = 12; g.strokeStyle = '#2b2340'; g.strokeRect(6, 6, 500, 180);
    g.fillStyle = '#6b4226'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = FONT.replace('{S}', '46');
    const words = text.split(' '), lines = [''];
    for (const w of words) { const cur = lines[lines.length - 1]; if ((cur + ' ' + w).length > 17 && cur) lines.push(w); else lines[lines.length - 1] = cur ? cur + ' ' + w : w; }
    lines.forEach((l, i) => g.fillText(l, 256, 96 + (i - (lines.length - 1) / 2) * 56));
  }, 512, 192);
}
function glowTexture() {
  return textTexture('glow', (g) => {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0, 'rgba(255,244,190,0.95)'); grad.addColorStop(0.5, 'rgba(255,220,120,0.35)'); grad.addColorStop(1, 'rgba(255,220,120,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  }, 64, 64);
}

function letterGeo(ch) {
  const rows = GLYPHS[ch], c = 0.3, P = [], color = LETTER_COLORS[ch];
  rows.forEach((r, ry) => { for (let rx = 0; rx < r.length; rx++) if (r[rx] === 'X') P.push(box(color, [(rx - (r.length - 1) / 2) * c, ((rows.length - 1) / 2 - ry) * c, 0], [c * 1.02, c * 1.02, 0.4])); });
  return P;
}

export function createPageVisuals(scene) {
  const group = new THREE.Group();
  group.name = 'storybook-page';
  group.visible = false;
  scene.add(group);
  let built = null;                                            // { page, layers: [{ mesh, geo, hullGeo }], clouds, banner, items... }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
  let lastT = 0;
  const hidden = new Set();                                    // Step 50: "cx,cy" tiles not drawn yet (a log still tipping over, a crate still falling): v.hidden

  function disposeItems(b) {
    for (const o of b.owned) { o.removeFromParent(); if (o.dispose) o.dispose(); }
    for (const d of b.disposables) d.dispose();
  }
  function close() {
    if (!built) return;
    for (const l of built.layers) { l.mesh.removeFromParent(); l.geo.dispose(); if (l.hullGeo) l.hullGeo.dispose(); }
    disposeItems(built);
    built = null;
    group.visible = false;
  }

  function instanced(geo, material, count, name, hullThickness) {
    const mesh = new THREE.InstancedMesh(geo, material, count);
    mesh.name = name; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
    group.add(mesh);
    const owned = [mesh], disposables = [geo];
    let hull = null;
    if (hullThickness) {
      const o = makeOutline(geo, hullThickness);
      hull = new THREE.InstancedMesh(o.geometry, o.material, count);
      hull.name = `${name}-outline`; hull.instanceMatrix = mesh.instanceMatrix; hull.renderOrder = -1; hull.frustumCulled = false;
      group.add(hull); owned.push(hull); disposables.push(o.geometry);
    }
    return { mesh, hull, owned, disposables };
  }

  function open(page, grid = page.grid) {
    if (built && built.page === page) { group.visible = true; return; }
    close();
    const rng = mulberry32(0x5b00c ^ page.length);
    const layers = [];
    const owned = [], disposables = [];
    const hasTiles = !!page.grid;
    const tileLayers = [];
    if (hasTiles) {
      for (let c0 = 0; c0 < page.W; c0 += CHUNK_COLS) { const L = meshOf(tileChunkParts(page, grid, null, c0, Math.min(page.W, c0 + CHUNK_COLS), hidden), `page-tiles-${c0 / CHUNK_COLS}`, { hull: 0.07, cast: false, receive: true }); layers.push(L); tileLayers.push(L); }
      layers.push(meshOf([...detailParts(page, rng), ...pitParts(page), ...goalParts(page)], 'page-details', { hull: 0.035 }));
    }
    if (!hasTiles) layers.push(meshOf(foregroundParts(page, rng), 'page-foreground', { hull: 0.1 }));   // (a tiled page's grass lip is its own foreground)
    layers.push(meshOf(midParts(page), 'page-mid', { hull: 0.08 }));
    layers.push(meshOf(backParts(page), 'page-back', { hull: 0.16, receive: false }));
    const cloudLayer = meshOf(cloudParts(page), 'page-clouds', { hull: 0.1, receive: false });
    layers.push(cloudLayer);
    layers.push(meshOf(endParts(page), 'page-ends', { hull: 0.08 }));
    layers.push(meshOf(exitParts(page), 'page-exit', { hull: 0.045, cast: true }));
    for (const l of layers) group.add(l.mesh);
    const clouds = cloudLayer.mesh;
    // the title banner: a paper sign on two posts behind the party's start
    const bx = PAGE.x + page.spawnX + 3.5, bz = PAGE.z - 3.4;
    const bannerTex = bannerTexture(page.banner || page.name);
    const bannerMat = new THREE.MeshToonMaterial({ map: bannerTex, gradientMap: VERTEX_TOON.gradientMap });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 2.07), bannerMat);
    board.position.set(bx, PAGE.y + 5.3, bz);
    board.name = 'page-banner';
    group.add(board);
    owned.push(board); disposables.push(board.geometry, bannerMat, bannerTex);
    const posts = meshOf([
      part(G.cyl6, '#9a6a44', { p: [bx - 2.9, PAGE.y + 2.4, bz - 0.1], s: [0.1, 4.8, 0.1] }),
      part(G.cyl6, '#9a6a44', { p: [bx + 2.9, PAGE.y + 2.4, bz - 0.1], s: [0.1, 4.8, 0.1] }),
    ], 'page-banner-posts', { hull: 0.05 });
    group.add(posts.mesh);
    layers.push(posts);
    const b = built = { page, grid, tileLayers, layers, clouds, owned, disposables, berries: null, letters: {}, flames: null, springs: null, popT: new Map(), springT: new Map(), lit: new Set(), taken: new Set() };

    const adopt = (x) => { owned.push(...x.owned); disposables.push(...x.disposables); return x; };    // (so close() frees the instanced layers too)
    if (hasTiles) {
      // signs: a paper board each, facing the camera
      for (const d of page.decor || []) {
        if (d.kind !== 'sign') continue;
        const w = pageToWorld(page, Math.floor(d.x) + 0.5, 0), g = page.grid;
        let top = 2; for (let y = g.H - 1; y >= 0; y--) if (g.at(Math.floor(d.x), y) === SOLID) { top = y + 1; break; }
        const tex = signTexture(d.text || ''), mat = new THREE.MeshToonMaterial({ map: tex, gradientMap: VERTEX_TOON.gradientMap });
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.975), mat);
        sign.position.set(w.x, PAGE.y - page.floorRows + top + 2.0, PAGE.z - 0.82);
        group.add(sign); owned.push(sign); disposables.push(sign.geometry, mat, tex);
      }
      // berries: ONE instanced mesh (+ its hull)
      const bg = combine([
        part(G.sphere, '#ff4f6d', { s: [0.2, 0.22, 0.2] }),
        part(G.cone6, '#58c96b', { p: [0.02, 0.22, 0], r: [0, 0, 0.5], s: [0.07, 0.12, 0.03] }),
        part(G.sphereLo, '#ffd0d8', { p: [-0.07, 0.07, 0.15], s: [0.05, 0.05, 0.04] }),
      ]);
      b.berries = adopt(instanced(bg, VERTEX_TOON, Math.max(1, page.berries.length), 'page-berries', 0.035));
      b.berryPos = page.berries.map((e) => pageToWorld(page, e.x, e.y));
      // the five letters
      const gl = glowTexture();
      const pts = new Float32Array(5 * 3);
      const glowGeo = new THREE.BufferGeometry();
      glowGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      const glowMat = new THREE.PointsMaterial({ map: gl, color: '#fff2b0', size: 3.2, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const glow = new THREE.Points(glowGeo, glowMat); glow.frustumCulled = false; glow.renderOrder = 5; glow.name = 'page-letter-glow';
      group.add(glow); owned.push(glow); disposables.push(glowGeo, glowMat, gl);
      b.glow = glow;
      page.letters.forEach((l, i) => {
        const L = meshOf(letterGeo(l.ch), `page-letter-${l.ch}`, { hull: 0.05, cast: false, receive: false });
        const w = pageToWorld(page, l.x, l.y);
        L.mesh.position.set(w.x, w.y, PAGE.z);
        group.add(L.mesh);
        b.letters[l.ch] = { ...L, home: w, index: i, alive: true };
        disposables.push(L.geo); if (L.hullGeo) disposables.push(L.hullGeo);
        owned.push(L.mesh);
      });
      // campfire flames: ONE instanced mesh, scaled to nothing while unlit
      const fg = combine([
        part(G.cone6, '#ff8a3a', { p: [0, 0.34, 0], s: [0.26, 0.7, 0.2] }),
        part(G.cone6, '#ffd85e', { p: [0.02, 0.26, 0.04], s: [0.14, 0.45, 0.12] }),
      ]);
      b.flames = adopt(instanced(fg, new THREE.MeshBasicMaterial({ vertexColors: true }), Math.max(1, page.campfires.length), 'page-flames', 0));
      disposables.push(b.flames.mesh.material);
      b.firePos = page.campfires.map((f) => pageToWorld(page, f.x, f.y));
      // spring flower heads: instanced so they can squash
      const springs = [];
      for (let y = 0; y < page.grid.H; y++) for (let x = 0; x < page.W; x++) if (page.grid.at(x, y) === SPRING) springs.push({ cx: x, cy: y });
      const sg = combine([
        part(G.sphere, '#ff8fc0', { p: [0, 0, 0], s: [0.34, 0.14, 0.34] }),
        ...[0, 1, 2, 3, 4].map((k) => part(G.sphere, '#ffb3d6', { p: [Math.cos(k * 1.2566) * 0.26, 0.03, Math.sin(k * 1.2566) * 0.26], s: [0.17, 0.09, 0.17] })),
        part(G.sphere, '#ffd85e', { p: [0, 0.08, 0.0], s: [0.13, 0.1, 0.13] }),
      ]);
      b.springs = adopt(instanced(sg, VERTEX_TOON, Math.max(1, springs.length), 'page-springs', 0.04));
      b.springList = springs.map((s) => ({ ...s, w: pageToWorld(page, s.cx + 0.5, s.cy + 0.36) }));
      b.springCount = springs.length;
      layoutStatic(b);
    }
    group.visible = true;
  }

  const IDENT = new THREE.Matrix4().makeScale(0, 0, 0);
  function layoutStatic(b) {
    b.springList.forEach((s, i) => { _m.compose(_p.set(s.w.x, s.w.y, s.w.z), _q.identity(), _s.set(1, 1, 1)); b.springs.mesh.setMatrixAt(i, _m); });
    if (b.springCount < 1) b.springs.mesh.setMatrixAt(0, IDENT);
    b.springs.mesh.instanceMatrix.needsUpdate = true;
    if (!b.page.campfires.length) b.flames.mesh.setMatrixAt(0, IDENT);
  }

  function setRun(run, { silent = true } = {}) {
    const b = built; if (!b || !b.berries) return;
    b.taken = new Set(run.berries);
    b.lit = new Set(run.fires);
    for (const ch of Object.keys(b.letters)) { const taken = run.letters.includes(ch); b.letters[ch].alive = !taken; b.letters[ch].mesh.visible = !taken; }
    b.popT.clear();
  }
  function itemPos(kind, id) {
    const b = built; if (!b) return null;
    if (kind === 'berry') return b.berryPos[id] || null;
    if (kind === 'letter') return b.letters[id] ? b.letters[id].home : null;
    if (kind === 'fire') return b.firePos[id] || null;
    if (kind === 'flower') { const f = b.page.flowers[id]; return f ? pageToWorld(b.page, f.x, f.y) : null; }
    if (kind === 'goal') return pageToWorld(b.page, b.page.goal.x, b.page.goal.y + 2);
    if (kind === 'secret' && b.page.secret) return pageToWorld(b.page, b.page.secret.x, b.page.secret.y + 1);
    return null;
  }
  function collect(kind, id) {
    const b = built; if (!b) return null;
    const pos = itemPos(kind, id);
    if (kind === 'berry') { b.taken.add(id); b.popT.set(id, 0); }
    else if (kind === 'letter' && b.letters[id]) { b.letters[id].alive = false; b.letters[id].popT = 0; }
    else if (kind === 'fire') b.lit.add(id);
    return pos;
  }
  function boing(cx, cy) { if (built) built.springT.set(`${cx},${cy}`, 0); }
  /** Step 50: rebuild the tile chunks around changed cells (`cells` = [[cx, cy, ch]]) and draw the cracks of the blocks hit so far (`hits` = { "cx,cy": n }). */
  function refresh(cells, hits = null) {
    const b = built; if (!b || !b.tileLayers.length) return;
    const chunks = new Set();
    for (const [cx] of cells) for (const c of [cx - 1, cx, cx + 1]) if (c >= 0 && c < b.page.W) chunks.add(Math.floor(c / CHUNK_COLS));
    for (const ci of chunks) {
      const old = b.tileLayers[ci], c0 = ci * CHUNK_COLS;
      const L = meshOf(tileChunkParts(b.page, b.grid, hits, c0, Math.min(b.page.W, c0 + CHUNK_COLS), hidden), `page-tiles-${ci}`, { hull: 0.07, cast: false, receive: true });
      group.add(L.mesh);
      old.mesh.removeFromParent(); old.geo.dispose(); if (old.hullGeo) old.hullGeo.dispose();
      b.layers[b.layers.indexOf(old)] = L; b.tileLayers[ci] = L;
    }
  }

  function update(t) {
    const dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
    const b = built; if (!b) return;
    b.clouds.position.x = Math.sin(t * 0.05) * 3.5;
    if (!b.berries) return;
    // berries: bob + spin; a taken one swells and vanishes
    const page = b.page;
    for (let i = 0; i < page.berries.length; i++) {
      const w = b.berryPos[i];
      let k = 1;
      if (b.taken.has(i)) {
        const pt = b.popT.get(i);
        if (pt === undefined || pt > 0.22) k = 0; else { b.popT.set(i, pt + dt); k = 1 + Math.sin((pt / 0.22) * Math.PI * 0.5) * 0.6; if (pt > 0.12) k *= 1 - (pt - 0.12) / 0.1; }
      }
      _m.compose(_p.set(w.x, w.y + Math.sin(t * 2.2 + i * 1.7) * 0.07, w.z), _q.setFromEuler(_e.set(0, t * 1.8 + i, 0)), _s.set(k, k, k));
      b.berries.mesh.setMatrixAt(i, _m);
    }
    if (page.berries.length) b.berries.mesh.instanceMatrix.needsUpdate = true;
    // letters: a slow spin and bob, glowing; a taken one swells and pops away
    let gi = 0;
    const gp = b.glow.geometry.attributes.position;
    for (const l of page.letters) {
      const L = b.letters[l.ch]; if (!L) continue;
      let k = 1;
      if (!L.alive && L.popT !== undefined) {
        L.popT += dt;
        if (L.popT > 0.4) { L.mesh.visible = false; k = 0; } else k = 1 + Math.sin((L.popT / 0.4) * Math.PI * 0.5) * 0.9 * (1 - L.popT / 0.4);
      }
      L.mesh.visible = L.alive || (L.popT !== undefined && L.popT <= 0.4);
      L.mesh.position.y = L.home.y + Math.sin(t * 1.6 + L.index) * 0.12;
      L.mesh.rotation.y = Math.sin(t * 0.9 + L.index * 1.3) * 0.5;
      L.mesh.scale.setScalar(k);
      const on = L.mesh.visible && L.alive;
      gp.setXYZ(gi++, L.home.x, on ? L.mesh.position.y : -1000, L.home.z - 0.3);
    }
    gp.needsUpdate = true;
    // campfires: flicker when lit
    page.campfires.forEach((f, i) => {
      const w = b.firePos[i], on = b.lit.has(i);
      const k = on ? 1 + Math.sin(t * 13 + i * 2) * 0.12 + Math.sin(t * 23 + i) * 0.08 : 0;
      _m.compose(_p.set(w.x, w.y + 0.1, w.z + 0.02), _q.identity(), _s.set(k, k * (on ? 1 + Math.sin(t * 17 + i) * 0.1 : 1), k));
      b.flames.mesh.setMatrixAt(i, _m);
    });
    if (page.campfires.length) b.flames.mesh.instanceMatrix.needsUpdate = true;
    // spring heads squash after a bounce
    b.springList.forEach((s, i) => {
      const key = `${s.cx},${s.cy}`, bt = b.springT.get(key);
      let sy = 1, sxz = 1;
      if (bt !== undefined) {
        const u = bt / 0.5; b.springT.set(key, bt + dt);
        if (u >= 1) b.springT.delete(key); else { const e = Math.sin(u * Math.PI * 4) * (1 - u); sy = 1 - 0.55 * Math.max(0, e) + 0.35 * Math.max(0, -e); sxz = 1 / Math.sqrt(sy); }
      }
      _m.compose(_p.set(s.w.x, s.w.y - (1 - sy) * 0.05, s.w.z), _q.identity(), _s.set(sxz, sy, sxz));
      b.springs.mesh.setMatrixAt(i, _m);
    });
    if (b.springCount) b.springs.mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    group, open, close, setRun, collect, boing, itemPos, refresh, hidden,
    get isOpen() { return !!built && group.visible; },
    get exitSpot() { return built ? pageExit(built.page) : null; },
    update,
    summary() {
      if (!built) return { open: false };
      let calls = 0, tris = 0;
      group.traverse((o) => { if (o.isMesh && o.visible) { calls += o.castShadow ? 2 : 1; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } if (o.isPoints && o.visible) calls++; });
      return { open: true, page: built.page.id, drawCalls: calls, tris: Math.round(tris), berriesLeft: built.berries ? built.page.berries.length - built.taken.size : 0, lit: [...built.lit] };
    },
  };
}
