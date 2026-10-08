// The look of Cinder Tubes (Step 60): dark basalt floors and walls, glowing lava pools and cracks, raised terraces with cliff faces and ramps, pepper plants and a checkpoint shrine at every later
// section's start. An area with `look: 'lava'` (game/areas/cinder.js) is dressed by this module instead of world/castleRuins.js; it follows the same grid as collision and navigation (including its
// HEIGHT BANDS: every slab stands at its tile's `h`, a ramp tile is a tilted slab, every cliff face gets rock bricks) and returns the same shape:
//   buildLavaDress(root, area) -> { sections: [Group...], sectionAt(x, z), update(t) }
// One Group per SECTION (`section-<id>`), each with up to three merged meshes: `<id>-paving` (the floor and the slabs under it, no shadow), `<id>-structure` (walls, cliffs, pillars, pepper plants, shrine;
// casts shadows) and `<id>-glow` (an UNLIT vertex-coloured mesh: lava pools, cracks, embers, so the tubes glow without a single light). The run shows only the sections next to the party
// (world/dungeonVisuals.js), which keeps the draw calls low. A tile belongs to the first section whose floor covers it (a gate's own tiles to the section it closes), a wall to the tile it stands on.
// Dresses (`section.dress`): 'mouth' (basalt with a trodden path), 'channel' (dark tube with lava pools), 'terraces' (stepped tiers), 'grove' (scorched red earth among pepper plants), 'hall' (black glass
// floor ringed by lava).
import * as THREE from 'three';
import { G, part, combine, VERTEX_TOON } from '../render/geo.js';
import { AREAS, TILE_SIZE, floorTiles } from '../game/areaLogic.js';

const BASALT = ['#4a4150', '#3d3546', '#564b5c', '#443a4d'];
const FLOOR = ['#76697c', '#6d6175', '#807285', '#685c70'];          // (playtest 0.60.0: floors lighter than the dark walls, for contrast)
const SCORCH = ['#8c6053', '#81584c', '#986858', '#865b4f'];
const GLASS = ['#3f3552', '#483c5c', '#3a304e', '#4e4262'];
const SOIL = ['#6b4a3a', '#5f4033', '#76523f'];
const LAVA = ['#ff8a3d', '#ff6a2a', '#ffb347', '#ff7a2a'];
// The terraces' tiers each have their own colour so the heights read at a glance: cool basalt below, warm ochre in the middle, sandy rust on top (by band height; a ramp blends by rounding).
const TIERS = { 0: ['#5d5470', '#564d69', '#655a78', '#514862'], 2: ['#93684a', '#8a6143', '#9c7151', '#845d41'], 4: ['#c19a68', '#b8915f', '#caa472', '#ae895a'] };
const tierPal = (h) => TIERS[Math.max(0, Math.min(4, Math.round(h / 2) * 2))];
const hash = (x, z, salt = 0) => { const n = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453; return n - Math.floor(n); };
const box = new THREE.BoxGeometry(1, 1, 1);
const tileKey = (tx, tz) => `${tx},${tz}`;
/** The glow material is shared by every Cinder section: `update(t)` makes the lava breathe. */
export const LAVA_MAT = new THREE.MeshBasicMaterial({ vertexColors: true });

export function buildLavaDress(root, area = AREAS.cinder) {
  const sections = area.sections, grid = area.grid;
  const owner = new Map();
  sections.forEach((s, i) => { for (const k of floorTiles(s.floor).keys()) if (!owner.has(k)) owner.set(k, i); });
  sections.forEach((s, i) => { if (s.gate) for (const k of grid.gateTiles.get(s.gate.id).keys()) if (!owner.has(k)) owner.set(k, i); });
  const lists = sections.map(() => ({ ground: [], structure: [], glow: [] }));
  const dressOf = (i) => sections[i].dress || 'channel';
  const brick = (target, x, y, z, sx, sy, sz, color, yaw = 0, tilt = 0) => target.push(part(box, color, { p: [x, y, z], s: [sx, sy, sz], r: [0, yaw, tilt] }));
  const lavaPools = [];                                                  // every lava circle of the area (local coordinates): their rims get a low kerb instead of a tall wall
  sections.forEach((s, i) => { for (const c of s.floor) if (c.carve && c.shape === 'circle' && c.kind === 'lava') lavaPools.push({ x: c.x, z: c.z, r: c.r, section: i }); });
  const nearLava = (x, z) => lavaPools.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 1.5);

  /** A glowing crystal / ember cluster (unlit). */
  function embers(i, x, y, z, scale = 1, seed = 0) {
    const C = lists[i].glow, base = LAVA[Math.floor(hash(x, z, seed) * LAVA.length)];
    C.push(part(G.cone6, base, { p: [x, y + 0.6 * scale, z], s: [0.18 * scale, 1.2 * scale, 0.18 * scale], r: [0.08, hash(x, z) * 6, 0.1] }));
    for (let n = 0; n < 2; n++) C.push(part(G.cone6, LAVA[(n + 1 + Math.floor(hash(z, x, seed) * 3)) % LAVA.length], { p: [x + (n ? 0.26 : -0.24) * scale, y + 0.34 * scale, z + 0.1 * (n ? 1 : -1) * scale], s: [0.12 * scale, 0.68 * scale, 0.12 * scale], r: [n ? 0.35 : -0.3, n, n ? -0.4 : 0.35] }));
  }
  /** A basalt pillar with a glowing top. */
  function pillar(S, i, x, y, z, height = 2.6) {
    brick(S, x, y + 0.2, z, 1.3, 0.4, 1.3, BASALT[1]);
    for (let n = 0; n < Math.floor(height / 0.55); n++) brick(S, x, y + 0.6 + n * 0.52, z, 0.95 - n * 0.05, 0.5, 0.95 - n * 0.05, BASALT[n % 4], n * 0.4);
    lists[i].glow.push(part(G.cone6, '#ffb347', { p: [x, y + height + 0.35, z], s: [0.22, 0.6, 0.22] }));
  }
  /** A big pepper plant (the grove's obstacles): a leafy bush with red, orange and yellow peppers hanging on it. */
  function pepperPlant(S, x, z, r) {
    S.push(part(G.cyl6, '#7a5538', { p: [x, 0.7, z], s: [0.12, 1.4, 0.12] }));
    for (let n = 0; n < 6; n++) { const a = n * Math.PI / 3 + hash(x, z), d = r * 0.55; S.push(part(G.sphere, n % 2 ? '#3f7a3a' : '#4f9a45', { p: [x + Math.cos(a) * d, 1.1 + (n % 3) * 0.28, z + Math.sin(a) * d], s: [0.85, 0.7, 0.85] })); }
    S.push(part(G.sphere, '#5fae55', { p: [x, 1.9, z], s: [r * 0.7, 0.8, r * 0.7] }));
    for (let n = 0; n < 7; n++) {
      const a = n * 2.4 + hash(z, x), d = r * (0.75 + (n % 3) * 0.12), col = ['#e8452c', '#ff8a3d', '#ffd45e', '#d8392b'][n % 4];
      S.push(part(G.cone6, col, { p: [x + Math.cos(a) * d, 1.05 + (n % 3) * 0.3, z + Math.sin(a) * d], s: [0.16, 0.5, 0.16], r: [Math.PI, a, 0] }));
    }
  }

  // ---- paving: one slab per tile (standing at the tile's height; a ramp tile is a tilted slab) and a patch on top
  for (const t of grid.allTiles) {
    const i = owner.get(tileKey(t.tx, t.tz)) ?? 0, dress = dressOf(i), G_ = lists[i].ground, h = hash(t.tx, t.tz), k = hash(t.tx + 3, t.tz - 5, 1);
    const pal = dress === 'grove' ? SCORCH : dress === 'hall' ? GLASS : dress === 'terraces' ? tierPal(t.h) : FLOOR, top = pal[Math.floor(k * pal.length)];
    if (t.ramp) {                                                          // a ramp tile: a slab tilted along the slope (its top passes through the tile centre's height) over a fill column
      const rs = t.ramp.s.ramp, along = t.ramp.axis, len = along === 'x' ? t.ramp.s.w : t.ramp.s.d;
      const dirSign = (rs.dir === '+z' || rs.dir === '+x') ? 1 : -1, ang = Math.atan((rs.to - rs.from) / len * dirSign), cos = Math.cos(ang);
      G_.push(part(box, top, { p: [t.x, t.h - 0.8 * cos, t.z], s: along === 'z' ? [TILE_SIZE, 1.6, TILE_SIZE / cos] : [TILE_SIZE / cos, 1.6, TILE_SIZE], r: along === 'z' ? [-ang, 0, 0] : [0, 0, ang] }));
      if (t.h > 0.4) G_.push(part(box, '#3a3140', { p: [t.x, (t.h - 2.6) / 2, t.z], s: [TILE_SIZE - 0.2, t.h + 0.6, TILE_SIZE - 0.2] }));
      continue;
    }
    const thick = t.h + 1.6;                                              // from the bottom (-1.6) up to the tile's height
    brick(G_, t.x, (t.h - 1.6) / 2, t.z, TILE_SIZE, thick, TILE_SIZE, dress === 'hall' ? '#1f1a2b' : '#3a3140');
    brick(G_, t.x, t.h - 0.03, t.z, TILE_SIZE - 0.06, 0.12, TILE_SIZE - 0.06, top);
    if (dress === 'mouth' && Math.abs(t.x) <= 2) brick(G_, t.x, t.h + 0.03, t.z, TILE_SIZE - 0.5, 0.06, TILE_SIZE - 0.5, '#8a7a6a');           // a trodden path to the stair
    else if (h > 0.55) brick(G_, t.x + (h - 0.8) * 0.8, t.h + 0.02, t.z + (k - 0.5) * 0.9, 0.7 + h * 0.4, 0.05, 0.6 + k * 0.4, dress === 'grove' ? SOIL[Math.floor(h * 3)] : dress === 'terraces' ? tierPal(t.h)[(Math.floor(h * 7) + 2) % 4] : '#8b7d8f', h * 6);
    if (h < 0.05 && dress !== 'mouth') lists[i].glow.push(part(box, LAVA[Math.floor(k * 4)], { p: [t.x + 0.2, t.h + 0.03, t.z - 0.2], s: [0.9, 0.04, 0.08], r: [0, h * 90, 0] }));      // a glowing crack in the floor
  }

  // ---- the cliff faces between the tiers: rock bricks from the lower floor up to the edge, and a glowing seam on some
  for (const [n, c] of grid.allCliffs.entries()) {
    const tx = Math.floor((c.x - c.dx) / TILE_SIZE), tz = Math.floor((c.z - c.dz) / TILE_SIZE), i = owner.get(tileKey(tx, tz)) ?? 0, S = lists[i].structure;
    const yaw = c.dx ? Math.PI / 2 : 0, rows = Math.max(1, Math.round((c.hi - c.lo) / 0.55));
    for (let r = 0; r < rows; r++) {
      const y = c.lo + 0.3 + r * (c.hi - c.lo - 0.3) / Math.max(1, rows - 1);
      for (const off of [-0.5, 0.5]) S.push(part(G.ico1, BASALT[(n + r + (off > 0 ? 1 : 0)) % 4], { p: [c.x + c.dx * 0.12 + (c.dx ? 0 : off), y, c.z + c.dz * 0.12 + (c.dx ? off : 0)], s: [c.dx ? 0.62 : 0.78, 0.42, c.dx ? 0.78 : 0.62], r: [0.1 * r, yaw + n + r, 0.1] }));
    }
    brick(S, c.x, c.hi + 0.04, c.z, c.dx ? 0.3 : TILE_SIZE, 0.1, c.dx ? TILE_SIZE : 0.3, '#ead0a8');          // a pale lip along the cliff top: the edge reads even in the dark (playtest 0.60.0)
    lists[i].glow.push(part(box, LAVA[n % 4], { p: [c.x + c.dx * 0.45, (c.hi + c.lo) / 2 + hash(n, 2) * 0.4 - 0.2, c.z + c.dz * 0.45], s: [c.dx ? 0.05 : 1.4, 0.08, c.dx ? 1.4 : 0.05], r: [0, 0, hash(n, 5) * 0.4 - 0.2] }));
    if (n % 3 === 0) embers(i, c.x + c.dx * 0.9, c.lo, c.z + c.dz * 0.9, 0.5 + hash(n, 9) * 0.3, n);        // a few ember crystals at the foot
  }

  // ---- the outer walls: tall on the north and sides, low on the south (the party stays visible); a low kerb round lava pools
  for (const [index, w] of grid.allWalls.entries()) {
    const tx = Math.floor((w.x - w.dx) / TILE_SIZE), tz = Math.floor((w.z - w.dz) / TILE_SIZE), tile = grid.allTiles.find((q) => q.tx === tx && q.tz === tz), base = tile ? tile.h : 0;
    const i = owner.get(tileKey(tx, tz)) ?? 0, dress = dressOf(i), S = lists[i].structure;
    const yaw = w.dx ? Math.PI / 2 : 0, h = hash(w.x, w.z), tall = nearLava(w.x, w.z) ? 0 : w.dz > 0 ? 1 + Math.floor(h * 2) : 3 + Math.floor(h * 3);
    const col = dress === 'grove' ? SCORCH : dress === 'hall' ? GLASS : BASALT;
    brick(S, w.x, base + 0.15, w.z, w.dx ? 0.9 : 2.1, 0.3, w.dx ? 2.1 : 0.9, BASALT[2]);
    if (!tall) { brick(S, w.x - w.dx * 0.1, base + 0.4, w.z - w.dz * 0.1, w.dx ? 0.7 : 1.9, 0.5, w.dx ? 1.9 : 0.7, '#2f2838'); continue; }
    for (let n = 0; n < tall; n++) {
      const off = (n % 2 ? 0.12 : -0.1);
      S.push(part(G.ico1, col[(index + n) % 4], { p: [w.x - w.dx * 0.1 + (w.dx ? 0 : off), base + 0.5 + n * 0.55, w.z - w.dz * 0.1 + (w.dx ? off : 0)], s: [w.dx ? 0.6 : 1.1, 0.42, w.dx ? 1.1 : 0.6], r: [0.1 * n, yaw + h * 2 + n, 0.12] }));
    }
    if (w.dz < 0 && h > 0.4) lists[i].glow.push(part(box, LAVA[index % 4], { p: [w.x - w.dx * 0.25, base + 0.7 + h * tall * 0.4, w.z - w.dz * 0.25], s: [w.dx ? 0.05 : 0.9, 0.07, w.dx ? 0.9 : 0.05], r: [0, 0, h * 0.5 - 0.2] }));      // a glowing seam in the wall
    if (index % 17 === 3) embers(i, w.x - w.dx * 0.9, base, w.z - w.dz * 0.9, 0.9, index);
  }

  // ---- the hand-placed landmarks of each section (local coordinates)
  sections.forEach((s, i) => {
    const S = lists[i].structure, dress = dressOf(i);
    for (const c of s.floor) {
      if (!c.carve || c.shape !== 'circle') continue;
      if (c.kind === 'rock') pillar(S, i, c.x, tileHeightAt(c.x, c.z), c.z, 1.8 + c.r);
      else if (c.kind === 'pepper') pepperPlant(S, c.x, c.z, c.r + 0.4);
      else if (c.kind === 'lava') {                                      // the pool: an unlit disc a little below the floor, a brighter core and bubbles
        lists[i].glow.push(part(G.cyl8, '#ff6a2a', { p: [c.x, -0.28, c.z], s: [c.r + 0.95, 0.05, c.r + 0.95] }));
        lists[i].glow.push(part(G.cyl8, '#ffb347', { p: [c.x, -0.24, c.z], s: [c.r * 0.6 + 0.3, 0.05, c.r * 0.6 + 0.3] }));
        for (let n = 0; n < 3; n++) { const a = n * 2.1 + hash(c.x, c.z), d = c.r * 0.5; lists[i].glow.push(part(G.sphereLo, '#ffe27a', { p: [c.x + Math.cos(a) * d, -0.18, c.z + Math.sin(a) * d], s: [0.17, 0.1, 0.17] })); }
      }
    }
    if (dress === 'mouth') {
      for (const [x, z, hgt] of [[-14, 62, 2.8], [14, 62, 2.4], [-14, 46, 3.4], [14, 46, 3]]) pillar(S, i, x, 0, z, hgt);
      for (const side of [-1, 1]) {                                      // banners on poles
        S.push(part(G.cyl6, '#8a6a4a', { p: [side * 9, 1.4, 63], s: [0.07, 2.8, 0.07] }));
        brick(S, side * 9 + 0.5, 2.3, 63, 0.9, 0.9, 0.05, side > 0 ? '#ff8a3d' : '#d8392b');
      }
      for (const [x, z] of [[-12, 50], [12, 62], [-12, 62]]) embers(i, x, 0, z, 1.1, 5);
    } else if (dress === 'channel') {
      for (const [x, z, r] of [[-7, 34, 1], [7, 25, 1.1], [-5.5, 12, 0.9]]) embers(i, x, 0, z, r, 7);
      for (const [x, z] of [[-7.4, 22], [7.4, 22]]) pillar(S, i, x, 0, z, 2.2);                                  // the posts at the tube between the rooms
    } else if (dress === 'terraces') {
      // torches along the cliff tops, rails along the ramps, a ring of stones round the sapling
      for (const [x, z, y] of [[-13, -2, 0], [13, -2, 0], [-13, -22, 2], [13, -22, 2], [-13, -40, 4], [13, -40, 4]]) pillar(S, i, x, y, z, 1.6);
      for (const [x0, x1, za, zb, ha, hb] of [[8, 12, -6, -14, 0, 2], [-12, -8, -26, -34, 2, 4]]) for (let n = 0; n < 4; n++) for (const x of [x0 - 0.35, x1 + 0.35]) {      // rail posts along both ramps
        const u = (n + 0.5) / 4; S.push(part(G.cyl6, '#6b5a72', { p: [x, ha + (hb - ha) * u + 0.45, za + (zb - za) * u], s: [0.09, 0.9, 0.09] }));
      }
      for (let n = 0; n < 10; n++) { const a = n * Math.PI / 5; brick(S, Math.cos(a) * 1.8, 2 + 0.12, -20 + Math.sin(a) * 1.8, 0.6, 0.24, 0.4, BASALT[n % 4], -a); }
    } else if (dress === 'hall') {
      const c = s.floor.find((q) => q.shape === 'circle' && !q.carve);
      for (let n = 0; n < 10; n++) { const a = Math.PI + (n + 0.5) * Math.PI / 10, R = c.r + 1.4; embers(i, c.x + Math.cos(a) * R, 0, c.z + Math.sin(a) * R, 1.4 + hash(n, 3) * 0.8, n); }
      const tz = c.z - c.r + 1.6;                                         // a block throne of basalt at the back
      brick(S, c.x, 0.3, tz, 3.6, 0.6, 1.6, BASALT[1]); brick(S, c.x, 1.2, tz - 0.6, 2.6, 1.4, 0.6, BASALT[2]);
      for (const side of [-1, 1]) lists[i].glow.push(part(G.cone6, '#ffb347', { p: [c.x + side * 1.5, 1.4, tz], s: [0.3, 1.5, 0.3] }));
    } else if (dress === 'grove') {
      for (const [x, z] of [[-14, -74], [14, -76], [-15, -96], [15, -98]]) embers(i, x, 0, z, 1.0, 11);
    }
    // ---- the checkpoint shrine at every later section's start: a ring of basalt stones round a glowing ember on a plinth
    const sh = s.safe.find((z) => z.r !== undefined);
    if (i > 0 && sh) {
      const r = Math.min(2.7, sh.r - 0.3), y = tileHeightAt(sh.x, sh.z);
      for (let n = 0; n < 10; n++) {
        const a = n * Math.PI * 2 / 10;
        brick(S, sh.x + Math.cos(a) * r, y + 0.12, sh.z + Math.sin(a) * r, 0.7, 0.24, 0.42, BASALT[n % 4], -a);
        if (n % 2) lists[i].glow.push(part(G.sphereLo, '#ffb347', { p: [sh.x + Math.cos(a) * (r + 0.1), y + 0.3, sh.z + Math.sin(a) * (r + 0.1)], s: [0.16, 0.08, 0.16] }));
      }
      S.push(part(G.cyl8, '#4a4150', { p: [sh.x, y + 0.3, sh.z], s: [0.5, 0.6, 0.5] }));
      S.push(part(G.cyl8, '#6b5a72', { p: [sh.x, y + 0.63, sh.z], s: [0.58, 0.08, 0.58] }));
      lists[i].glow.push(part(G.ico1, '#ffb347', { p: [sh.x, y + 1.05, sh.z], s: [0.22, 0.32, 0.22] }));
    }
  });
  function tileHeightAt(x, z) { return grid.heightAt(area.origin.x + x, area.origin.z + z); }

  // ---- the merged meshes, up to three per section
  const groups = sections.map((s, i) => {
    const group = new THREE.Group(); group.name = `section-${s.id}`; root.add(group);
    for (const [name, parts] of [['paving', lists[i].ground], ['structure', lists[i].structure], ['glow', lists[i].glow]]) {
      if (!parts.length) continue;
      const mesh = new THREE.Mesh(combine(parts), name === 'glow' ? LAVA_MAT : VERTEX_TOON); mesh.name = `${s.id}-${name}`;
      mesh.castShadow = name === 'structure'; mesh.receiveShadow = name !== 'glow'; group.add(mesh);
    }
    return group;
  });
  const sectionAt = (x, z) => owner.get(tileKey(Math.floor((x - area.origin.x) / TILE_SIZE), Math.floor((z - area.origin.z) / TILE_SIZE))) ?? null;
  return { sections: groups, sectionAt, update(t) { LAVA_MAT.color.setScalar(0.86 + Math.sin(t * 2.1) * 0.09 + Math.sin(t * 4.7) * 0.05); } };
}
