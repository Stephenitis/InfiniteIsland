// The look of Glimmerfrost Caves (Step 59): snowy cave floors, icy rock walls, glowing crystals, boulders and a checkpoint shrine at every later section start. An area with `look: 'cave'`
// (game/areas/glimmerfrost.js) is dressed by this module instead of world/castleRuins.js; it follows the same grid as collision and navigation and returns the same shape:
//   buildCaveDress(root, area) -> { sections: [Group...], sectionAt(x, z) }
// One Group per SECTION (`section-<id>`), each with up to three merged meshes: `<id>-paving` (the floor, no shadow), `<id>-structure` (walls, boulders, stalagmites, shrine; casts shadows)
// and `<id>-crystals` (an UNLIT vertex-coloured mesh, so the crystals glow in the dark cave without a single light). The run shows only the sections next to the party
// (world/dungeonVisuals.js), which keeps the draw calls low. A tile belongs to the first section whose floor covers it (a gate's own tiles to the section it closes), a wall to the tile it stands on.
// Dresses (`section.dress`): 'mouth' (snow with a trodden path), 'ford' (blue ice), 'snowfield' (deep snow with boulders), 'gauntlet' (pale ice with floor cracks), 'glacier' (deep blue ice with a crystal ring).
import * as THREE from 'three';
import { G, part, combine, VERTEX_TOON } from '../render/geo.js';
import { AREAS, TILE_SIZE, floorTiles } from '../game/areaLogic.js';

const SNOW = ['#e4eefa', '#dae7f6', '#d0e0f2', '#e9f2fb'];
const ICE = ['#c9e3f5', '#bad9f0', '#d0e8f8', '#b0d3ec'];
const BLUE = ['#9ec9ea', '#8abbe3', '#a9d1ee', '#7fb2dd'];
const ROCK = ['#7d8cab', '#6c7b9e', '#8997b4', '#76859f'];
const GLOW = ['#7ff0ff', '#b7a2ff', '#ffc8f0', '#9bffd6'];
const hash = (x, z, salt = 0) => { const n = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453; return n - Math.floor(n); };
const box = new THREE.BoxGeometry(1, 1, 1);
const tileKey = (tx, tz) => `${tx},${tz}`;
const CRYSTAL_MAT = new THREE.MeshBasicMaterial({ vertexColors: true });

export function buildCaveDress(root, area = AREAS.glimmerfrost) {
  const sections = area.sections, grid = area.grid;
  const owner = new Map();
  sections.forEach((s, i) => { for (const k of floorTiles(s.floor).keys()) if (!owner.has(k)) owner.set(k, i); });
  sections.forEach((s, i) => { if (s.gate) for (const k of grid.gateTiles.get(s.gate.id).keys()) if (!owner.has(k)) owner.set(k, i); });
  const lists = sections.map(() => ({ ground: [], structure: [], crystal: [] }));
  const dressOf = (i) => sections[i].dress || 'snowfield';
  const brick = (target, x, y, z, sx, sy, sz, color, yaw = 0, tilt = 0) => target.push(part(box, color, { p: [x, y, z], s: [sx, sy, sz], r: [0, yaw, tilt] }));
  /** A cluster of glowing crystals (unlit) at (x, z): a tall spike and a couple of small ones. */
  function crystals(i, x, z, scale = 1, seed = 0) {
    const C = lists[i].crystal, base = GLOW[Math.floor(hash(x, z, seed) * GLOW.length)];
    C.push(part(G.cone6, base, { p: [x, 0.7 * scale, z], s: [0.2 * scale, 1.4 * scale, 0.2 * scale], r: [0.08, hash(x, z) * 6, 0.1] }));
    for (let n = 0; n < 2; n++) C.push(part(G.cone6, GLOW[(n + 1 + Math.floor(hash(z, x, seed) * 3)) % GLOW.length], { p: [x + (n ? 0.3 : -0.28) * scale, 0.4 * scale, z + 0.1 * (n ? 1 : -1) * scale], s: [0.13 * scale, 0.8 * scale, 0.13 * scale], r: [n ? 0.35 : -0.3, n, n ? -0.4 : 0.35] }));
  }
  /** A stalagmite / ice pillar: a stack of shrinking blocks with a pale tip. */
  function pillar(S, x, z, height = 2.6) {
    brick(S, x, 0.2, z, 1.3, 0.4, 1.3, ROCK[1]);
    for (let n = 0; n < Math.floor(height / 0.55); n++) brick(S, x, 0.6 + n * 0.52, z, 0.95 - n * 0.05, 0.5, 0.95 - n * 0.05, n % 2 ? BLUE[0] : ICE[n % 4], n * 0.4);
    S.push(part(G.cone6, '#e9f6ff', { p: [x, height + 0.5, z], s: [0.4, 0.9, 0.4] }));
  }
  function boulder(S, x, z, r) {                                         // a carved-out obstacle: an icy boulder with a snow cap
    S.push(part(G.ico1, ROCK[Math.floor(hash(x, z) * 4)], { p: [x, r * 0.55, z], s: [r * 0.95, r * 0.8, r * 0.9], r: [0.2, hash(x, z, 2) * 6, 0.1] }));
    S.push(part(G.sphereLo, '#f4f9ff', { p: [x, r * 1.1, z], s: [r * 0.7, r * 0.28, r * 0.66] }));
    S.push(part(G.cone6, '#cfeeff', { p: [x + r * 0.4, r * 0.7, z - r * 0.3], s: [0.18, 0.7, 0.18], r: [0.2, 0, -0.3] }));
  }

  // ---- paving: one slab and one inset patch per tile (the colours depend on the section's dress)
  for (const t of grid.allTiles) {
    const i = owner.get(tileKey(t.tx, t.tz)) ?? 0, dress = dressOf(i), G_ = lists[i].ground, h = hash(t.tx, t.tz), k = hash(t.tx + 3, t.tz - 5, 1);
    const slab = dress === 'glacier' ? BLUE[Math.floor(k * 4)] : dress === 'ford' || dress === 'gauntlet' ? ICE[Math.floor(k * 4)] : SNOW[Math.floor(k * 4)];
    brick(G_, t.x, -0.8, t.z, TILE_SIZE, 1.6, TILE_SIZE, dress === 'glacier' ? '#6c9bc6' : '#9fb6cf');
    brick(G_, t.x, -0.03, t.z, TILE_SIZE - 0.06, 0.12, TILE_SIZE - 0.06, slab);
    if (dress === 'mouth' && Math.abs(t.x) <= 2) brick(G_, t.x, 0.03, t.z, TILE_SIZE - 0.5, 0.06, TILE_SIZE - 0.5, '#d8c9b0');           // a trodden path to the stair
    else if (h > 0.55) brick(G_, t.x + (h - 0.8) * 0.8, 0.02, t.z + (k - 0.5) * 0.9, 0.7 + h * 0.4, 0.05, 0.6 + k * 0.4, dress === 'glacier' ? '#cfe6f8' : dress === 'snowfield' ? '#ffffff' : '#eaf6ff', h * 6);
    if (dress === 'gauntlet' && h > 0.9) lists[i].structure.push(part(box, '#7fa3c9', { p: [t.x + 0.2, 0.04, t.z - 0.2], s: [0.8, 0.05, 0.07], r: [0, h * 20, 0] }));   // a crack in the ice
    if (h < 0.03) crystals(i, t.x, t.z, 0.55, 3);
  }

  // ---- the cave walls: tall on the north and sides, low on the south so the party stays visible
  for (const [index, w] of grid.allWalls.entries()) {
    const tx = Math.floor((w.x - w.dx) / TILE_SIZE), tz = Math.floor((w.z - w.dz) / TILE_SIZE), i = owner.get(tileKey(tx, tz)) ?? 0, dress = dressOf(i), S = lists[i].structure;
    const yaw = w.dx ? Math.PI / 2 : 0, h = hash(w.x, w.z), tall = w.dz > 0 ? 1 + Math.floor(h * 2) : 3 + Math.floor(h * 3);
    const col = dress === 'glacier' ? BLUE : dress === 'snowfield' || dress === 'mouth' ? ICE : ROCK;
    brick(S, w.x, 0.15, w.z, w.dx ? 0.9 : 2.1, 0.3, w.dx ? 2.1 : 0.9, ROCK[2]);
    for (let n = 0; n < tall; n++) {
      const off = (n % 2 ? 0.12 : -0.1);
      S.push(part(G.ico1, col[(index + n) % 4], { p: [w.x - w.dx * 0.1 + (w.dx ? 0 : off), 0.5 + n * 0.55, w.z - w.dz * 0.1 + (w.dx ? off : 0)], s: [w.dx ? 0.6 : 1.1, 0.42, w.dx ? 1.1 : 0.6], r: [0.1 * n, yaw + h * 2 + n, 0.12] }));
    }
    if (w.dz < 0 && h > 0.35) S.push(part(G.sphereLo, '#ffffff', { p: [w.x, 0.62 + tall * 0.5, w.z + 0.05], s: [w.dx ? 0.45 : 1.0, 0.18, w.dx ? 1.0 : 0.45] }));        // snow on the ledges
    if (index % 11 === 0 && tall > 2) S.push(part(G.cone6, '#e1f2ff', { p: [w.x - w.dx * 0.55, 0.9 + tall * 0.4, w.z - w.dz * 0.55], s: [0.16, 0.9, 0.16], r: [Math.PI, 0, 0] }));   // an icicle
    if (index % 17 === 3) crystals(i, w.x - w.dx * 0.9, w.z - w.dz * 0.9, 0.9, index);
  }

  // ---- the hand-placed landmarks of each section (local coordinates)
  sections.forEach((s, i) => {
    const S = lists[i].structure, dress = dressOf(i);
    for (const c of s.floor) if (c.carve && c.shape === 'circle' && c.kind === 'boulder') boulder(S, c.x, c.z, c.r + 0.6);
    if (dress === 'mouth') {
      for (const [x, z, hgt] of [[-14, 62, 2.8], [14, 62, 2.4], [-14, 46, 3.4], [14, 46, 3]]) pillar(S, x, z, hgt);
      for (const side of [-1, 1]) {                                      // banners on poles
        S.push(part(G.cyl6, '#8a6a4a', { p: [side * 9, 1.4, 63], s: [0.07, 2.8, 0.07] }));
        brick(S, side * 9 + 0.5, 2.3, 63, 0.9, 0.9, 0.05, side > 0 ? '#5fa8d8' : '#e2705e');
      }
      for (const [x, z] of [[-12, 50], [12, 62], [-12, 62]]) crystals(i, x, z, 1.1, 5);
    } else if (dress === 'ford') {
      for (const [x, z, r] of [[-7, 33, 1], [7, 25, 1.1], [-4, 16, 0.9]]) crystals(i, x, z, r, 7);
    } else if (dress === 'snowfield') {
      for (const [x, z] of [[-14, -10], [15, -16], [-12, -24], [12, 4]]) { crystals(i, x, z, 1.2, 9); S.push(part(G.sphere, '#ffffff', { p: [x + 1.2, 0.22, z + 0.6], s: [1.1, 0.4, 0.9] })); }
    } else if (dress === 'gauntlet') {
      for (const z of [-37, -57, -77]) for (const side of [-1, 1]) pillar(S, side * 7.2, z, 2.2 + hash(z, side) * 1.2);
    } else if (dress === 'glacier') {
      const c = s.floor[0];
      for (let n = 0; n < 10; n++) { const a = Math.PI + (n + 0.5) * Math.PI / 10, R = c.r + 1.4; crystals(i, c.x + Math.cos(a) * R, c.z + Math.sin(a) * R, 1.5 + hash(n, 3) * 0.8, n); }
      const tz = c.z - c.r + 1.6;                                         // a block throne of ice at the back
      brick(S, c.x, 0.3, tz, 3.6, 0.6, 1.6, BLUE[1]); brick(S, c.x, 1.2, tz - 0.6, 2.6, 1.4, 0.6, ICE[0]);
      for (const side of [-1, 1]) S.push(part(G.cone6, '#e9f6ff', { p: [c.x + side * 1.5, 1.2, tz], s: [0.3, 1.5, 0.3] }));
    }
    // ---- the checkpoint shrine at every later section's start: a ring of ice stones round a glowing crystal
    const sh = s.safe.find((z) => z.r !== undefined);
    if (i > 0 && sh) {
      const r = Math.min(2.7, sh.r - 0.3);
      for (let n = 0; n < 10; n++) {
        const a = n * Math.PI * 2 / 10;
        brick(S, sh.x + Math.cos(a) * r, 0.12, sh.z + Math.sin(a) * r, 0.7, 0.24, 0.42, ICE[n % 4], -a);
        if (n % 2) S.push(part(G.sphereLo, '#ffffff', { p: [sh.x + Math.cos(a) * (r + 0.1), 0.3, sh.z + Math.sin(a) * (r + 0.1)], s: [0.2, 0.1, 0.2] }));
      }
      S.push(part(G.cyl8, '#9fb6cf', { p: [sh.x, 0.3, sh.z], s: [0.5, 0.6, 0.5] }));
      S.push(part(G.cyl8, '#e9f6ff', { p: [sh.x, 0.63, sh.z], s: [0.58, 0.08, 0.58] }));
      lists[i].crystal.push(part(G.ico1, '#8fffd0', { p: [sh.x, 1.05, sh.z], s: [0.22, 0.32, 0.22] }));
    }
  });

  // ---- the merged meshes, up to three per section
  const groups = sections.map((s, i) => {
    const group = new THREE.Group(); group.name = `section-${s.id}`; root.add(group);
    for (const [name, parts] of [['paving', lists[i].ground], ['structure', lists[i].structure], ['crystals', lists[i].crystal]]) {
      if (!parts.length) continue;
      const mesh = new THREE.Mesh(combine(parts), name === 'crystals' ? CRYSTAL_MAT : VERTEX_TOON); mesh.name = `${s.id}-${name}`;
      mesh.castShadow = name === 'structure'; mesh.receiveShadow = name !== 'crystals'; group.add(mesh);
    }
    return group;
  });
  const sectionAt = (x, z) => owner.get(tileKey(Math.floor((x - area.origin.x) / TILE_SIZE), Math.floor((z - area.origin.z) / TILE_SIZE))) ?? null;
  return { sections: groups, sectionAt };
}
