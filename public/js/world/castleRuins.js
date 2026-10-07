// The look of a combat area's floor and walls: roofless, softly coloured ruins, hedged gardens, a wall walk and an overgrown throne. Everything follows the same grid as
// collision and navigation; front walls are broken low to keep the party visible.
//
// Step 57: an area is dressed SECTION by SECTION (`section.dress`: 'yard' | 'garden' | 'castle' | 'rampart' | 'throne', game/areas/wildroot.js). `buildCastleRuins(root, area)` adds
// one Group per section to `root` (`section-<id>`), each with two merged meshes (`<id>-paving`, no shadow; `<id>-structure` = walls + relics + overgrowth, casts shadows), so the
// run can hide the sections that are not next to the party (world/dungeonVisuals.js) and the draw calls stay low. A tile belongs to the first section whose floor covers it (a gate's
// own tiles to the section the gate closes); a wall belongs to the tile it stands on. Every section after the first gets a small CHECKPOINT SHRINE (a ring of stones and a glowing
// crystal on a plinth) where its safe circle is. Returns `{ sections: [Group...], sectionAt(x, z) }`.
import * as THREE from 'three';
import { G, part, combine, VERTEX_TOON } from '../render/geo.js';
import { AREAS, TILE_SIZE, floorTiles } from '../game/areaLogic.js';

const stone = ['#b2b6c4', '#c7c6ce', '#a6adbc', '#bcb8c5', '#c9c6bb'];
const warm = ['#cfc6b4', '#d8cfbe', '#c3bbaa', '#d3c9b2', '#cbc1ad'];
const grass = ['#8fc57a', '#9ccf84', '#86bb72', '#a5d68a'];
const hedgeGreens = ['#4f9a5a', '#5fae63', '#6fbf6c', '#58a45f'];
const hash = (x, z, salt = 0) => {
  const n = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453;
  return n - Math.floor(n);
};
const box = new THREE.BoxGeometry(1, 1, 1);
const tileKey = (tx, tz) => `${tx},${tz}`;

export function buildCastleRuins(root, area = AREAS.wildroot) {
  const sections = area.sections, grid = area.grid;
  // ---- which section owns each tile
  const owner = new Map();
  sections.forEach((s, i) => { for (const k of floorTiles(s.floor).keys()) if (!owner.has(k)) owner.set(k, i); });
  sections.forEach((s, i) => { if (s.gate) for (const k of grid.gateTiles.get(s.gate.id).keys()) if (!owner.has(k)) owner.set(k, i); });
  const lists = sections.map(() => ({ ground: [], structure: [] }));
  const dressOf = (i) => sections[i].dress || (area.dress === 'castle' ? 'castle' : 'ruin');
  const L = (i) => lists[i];
  function brick(target, x, y, z, sx, sy, sz, color, yaw = 0, tilt = 0) {
    target.push(part(box, color, { p: [x, y, z], s: [sx, sy, sz], r: [0, yaw, tilt] }));
  }
  function pillar(S, x, z, height = 3, mossy = true) {
    brick(S, x, 0.2, z, 1.2, 0.4, 1.2, '#999eac');
    for (let n = 0; n < Math.floor(height / 0.5); n++) brick(S, x, 0.65 + n * 0.48, z, 0.85, 0.43, 0.85, stone[n % stone.length], 0, n === Math.floor(height / 0.5) - 1 ? 0.09 : 0);
    brick(S, x, height + 0.25, z, 1.15, 0.25, 1.15, '#bcb8c5');
    if (!mossy) return;
    S.push(part(G.sphereLo, '#88a582', { p: [x, height + 0.43, z], s: [0.65, 0.09, 0.65] }));
    for (let n = 0; n < 5; n++) S.push(part(G.sphereLo, '#779e74', { p: [x + 0.5, height - n * 0.28, z + Math.sin(n) * 0.15], s: [0.1, 0.23, 0.12], r: [0, n, 0.4] }));
  }
  function arch(S, x, z, width, yaw, broken = false) {
    const radius = width / 2 + 0.45;
    for (const side of [-1, 1]) pillar(S, x + Math.cos(yaw) * radius * side, z - Math.sin(yaw) * radius * side, 2.1);
    for (let n = 0; n <= 10; n++) {
      if (broken && (n === 4 || n === 5)) continue;
      const a = -Math.PI / 2 + n * Math.PI / 10, offset = Math.sin(a) * radius;
      S.push(part(box, stone[n % stone.length], { p: [x + Math.cos(yaw) * offset, 2.3 + Math.cos(a) * radius * 0.7, z - Math.sin(yaw) * offset], s: [0.65, 0.48, 0.7], r: [0, yaw, -a] }));
    }
  }

  // ---- paving (one slab + four flagstones per tile; the colours depend on the section's dress)
  for (const t of grid.allTiles) {
    const i = owner.get(tileKey(t.tx, t.tz)) ?? 0, dress = dressOf(i), G_ = L(i).ground, h = hash(t.tx, t.tz);
    if (dress === 'garden') {
      const path = Math.abs(t.x) <= 2;                                  // a stone path down the middle
      brick(G_, t.x, -0.8, t.z, TILE_SIZE, 1.6, TILE_SIZE, '#7a6a52');
      for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) {
        const k = hash(t.tx + x, t.tz + z, 4);
        brick(G_, t.x - 0.5 + x, -0.06, t.z - 0.5 + z, 0.98, 0.15, 0.98, path ? warm[Math.floor(k * warm.length)] : grass[Math.floor(k * grass.length)]);
      }
      if (h > 0.62 && !path) for (let n = 0; n < 3; n++) L(i).structure.push(part(G.cone6, '#6fae5c', { p: [t.x - 0.5 + n * 0.45, 0.17, t.z + (n - 1) * 0.35], s: [0.05, 0.22, 0.05], r: [0.1, n, 0.2 * (n - 1)] }));
      if (h < 0.1) for (const [dx, dz, c] of [[-0.4, -0.2, '#ffd4e0'], [0.3, 0.3, '#fff4b8']]) L(i).structure.push(part(G.sphereLo, c, { p: [t.x + dx, 0.14, t.z + dz], s: [0.09, 0.06, 0.09] }));
      continue;
    }
    const courtyard = dress === 'castle' && Math.hypot(t.x - 20, t.z + 12) < 5;
    const hall = sections[i].floor[0], dais = dress === 'throne' && Math.hypot(t.x - hall.x, t.z - hall.z) < 4.2;
    brick(G_, t.x, -0.8, t.z, TILE_SIZE, 1.6, TILE_SIZE, dress === 'rampart' ? '#9a9588' : dress === 'throne' ? '#7d8a78' : '#85899d');
    // Four inset flagstones give every tile mortar seams and uneven old paving.
    for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) {
      const k = hash(t.tx + x, t.tz + z, 1);
      let color = stone[Math.floor(k * stone.length)];
      if (dress === 'rampart') color = warm[Math.floor(k * warm.length)];
      if (dress === 'yard' && Math.abs(t.x) <= 2) color = warm[Math.floor(k * warm.length)];                  // a lighter path from the portal to the stair
      if (dress === 'throne') color = dais ? '#d7cfbb' : (hash(t.tx + x, t.tz + z, 3) > 0.45 ? '#a9bb97' : '#bdc3b3');
      if (courtyard || (dress !== 'rampart' && dress !== 'throne' && hash(t.tx + x, t.tz + z, 3) > (dress === 'yard' ? 0.7 : 0.83))) color = '#a0b39a';
      brick(G_, t.x - 0.5 + x, -0.06, t.z - 0.5 + z, 0.94, 0.15, 0.94, color);
    }
    if (h > 0.86) {
      // Flat broken slab corner: a crack rather than a dangerous floor hole.
      brick(L(i).structure, t.x + 0.3, 0.035, t.z - 0.3, 0.42, 0.045, 0.07, '#727d88', h * 5);
      for (let n = 0; n < 3; n++) L(i).structure.push(part(G.sphereLo, '#7f9e79', { p: [t.x + 0.25 + n * 0.07, 0.09, t.z - 0.3], s: [0.035, 0.2 + n * 0.025, 0.05], r: [0.2, n, 0.3 - n * 0.3] }));
    }
  }

  // ---- the boundary walls
  for (const [index, w] of grid.allWalls.entries()) {
    const tx = Math.floor((w.x - w.dx) / TILE_SIZE), tz = Math.floor((w.z - w.dz) / TILE_SIZE), i = owner.get(tileKey(tx, tz)) ?? 0, dress = dressOf(i), S = L(i).structure;
    const yaw = w.dx ? Math.PI / 2 : 0, h = hash(w.x, w.z);
    if (dress === 'garden') {
      if (sections[i].floor.some((c) => c.carve && (c.kind === 'planter' || c.shape === 'circle') && (c.shape === 'circle' ? Math.hypot(w.x - c.x, w.z - c.z) <= c.r + 1 : Math.abs(w.x - c.x) <= c.w / 2 && Math.abs(w.z - c.z) <= c.d / 2))) continue;   // (a planter has its own stone rim, the fountain its basin)
      // hedges: low blobs along the south edges, taller on the others, with the odd flower
      const tall = w.dz > 0 ? 0.62 : 1.05 + h * 0.25;
      for (let n = 0; n < 2; n++) {
        const off = (n - 0.5) * 0.95;
        S.push(part(G.sphereLo, hedgeGreens[(index + n) % 4], { p: [w.x + (w.dx ? 0 : off), tall * 0.5, w.z + (w.dx ? off : 0)], s: [w.dx ? 0.62 : 0.62 + 0.18 * hash(index, n), tall * 0.58 + 0.1, w.dx ? 0.62 + 0.18 * hash(index, n) : 0.62], r: [0, h * 3, 0] }));
        if (tall > 0.8) S.push(part(G.sphereLo, hedgeGreens[(index + n + 2) % 4], { p: [w.x + (w.dx ? 0 : off), tall * 0.95, w.z + (w.dx ? off : 0)], s: [0.46, 0.36, 0.46] }));
      }
      if (h > 0.55) S.push(part(G.sphereLo, ['#ff9fb8', '#fff0a0', '#ffffff', '#ffb27a'][index % 4], { p: [w.x - w.dx * 0.3 + (w.dx ? 0 : (h - 0.8) * 1.2), tall + 0.12, w.z - w.dz * 0.3 + (w.dx ? (h - 0.8) * 1.2 : 0)], s: [0.1, 0.08, 0.1] }));
      if (index % 9 === 0) brick(S, w.x - w.dx * 0.1, 0.1, w.z - w.dz * 0.1, w.dx ? 0.5 : 1.9, 0.2, w.dx ? 1.9 : 0.5, '#b9b6a8');       // a stone edging stretch
      continue;
    }
    const rampart = dress === 'rampart', throne = dress === 'throne';
    // Tall north/side walls, low south walls: the ruin reads as a castle without obscuring the fixed-angle camera with intact foreground masonry.
    const rows = rampart ? (w.dz > 0 ? 2 : 3) : throne ? (w.dz > 0 ? 1 : 3) : w.dz > 0 ? 2 + (index % 4 === 0 ? 1 : 0) : 4 + Math.floor(h * 3);
    brick(S, w.x, 0.13, w.z, w.dx ? 0.78 : 2, 0.26, w.dx ? 2 : 0.78, rampart ? '#9a9588' : throne ? '#6c7468' : '#858b9a');
    for (let row = 0; row < rows; row++) for (let n = 0; n < 2; n++) {
      if (row === rows - 1 && !rampart && hash(w.x, w.z, n + 8) > 0.74) continue;
      const offset = n - 0.5 + (row % 2 ? 0.12 : -0.06);
      brick(S, w.x + (w.dx ? 0 : offset), 0.3 + row * 0.38, w.z + (w.dx ? offset : 0),
        0.93, 0.33, 0.65, rampart ? warm[(row + index + n) % warm.length] : throne ? ['#8b9482', '#7d8a78', '#9aa38f'][(row + n + index) % 3] : stone[(row + index + n) % stone.length], yaw, row === rows - 1 && !rampart ? (h - 0.5) * 0.1 : 0);
    }
    if (rampart) {
      // the parapet: a merlon on every other half-segment, with ivy trailing down the outside
      for (let n = 0; n < 2; n++) if ((index + n) % 2 === 0) brick(S, w.x + (w.dx ? 0 : (n - 0.5) * 0.98), 0.3 + rows * 0.38 + 0.2, w.z + (w.dx ? (n - 0.5) * 0.98 : 0), w.dx ? 0.65 : 0.86, 0.46, w.dx ? 0.86 : 0.65, '#ddd5c4');
      if (h > 0.4) {
        const faceX = w.x - w.dx * 0.4, faceZ = w.z - w.dz * 0.4;
        for (let n = 0; n < rows; n++) {
          const sway = Math.sin(n * 1.6 + h * 8) * 0.12;
          S.push(part(G.cyl6, '#5d8068', { p: [faceX + (w.dx ? 0 : sway), 0.3 + n * 0.35, faceZ + (w.dx ? sway : 0)], s: [0.03, 0.44, 0.03], r: [0, 0, sway] }));
          for (const side of [-1, 1]) S.push(part(G.sphereLo, n % 2 ? '#6fae5c' : '#8fcb78', { p: [faceX + (w.dx ? 0 : side * 0.14), 0.35 + n * 0.35, faceZ + (w.dx ? side * 0.14 : 0)], s: [w.dx ? 0.05 : 0.18, 0.1, w.dx ? 0.18 : 0.05], r: [0, 0, side * 0.4] }));
        }
      }
      continue;
    }
    if (throne) {                                                      // roots climbing the wall and a leaf or two
      if (index % 2 === 0) {
        for (let n = 0; n < 3; n++) S.push(part(G.cyl6, n % 2 ? '#6b4a33' : '#7e5a3d', { p: [w.x - w.dx * 0.35, 0.4 + n * 0.5, w.z - w.dz * 0.35], s: [0.1 - n * 0.015, 0.7, 0.1 - n * 0.015], r: [(w.dz ? 0.3 : 0) * (n % 2 ? 1 : -1), 0, (w.dx ? 0.3 : 0) * (n % 2 ? 1 : -1)] }));
        S.push(part(G.sphereLo, '#5fae63', { p: [w.x - w.dx * 0.4, 0.4 + rows * 0.38, w.z - w.dz * 0.4], s: [0.3, 0.12, 0.3] }));
      }
      continue;
    }
    if (index % 5 === 0) {
      // Surviving merlons give the wall its crenellated castle silhouette.
      brick(S, w.x, 0.48 + rows * 0.38, w.z, 0.62, 0.5, 0.72, '#b8b6c3', yaw, (h - 0.5) * 0.1);
    }
    if (h > 0.48) {
      S.push(part(G.sphereLo, '#809b7b', { p: [w.x, 0.25 + rows * 0.38, w.z], s: [w.dx ? 0.4 : 0.95, 0.08, w.dx ? 0.95 : 0.4] }));
      const faceX = w.x - w.dx * 0.4, faceZ = w.z - w.dz * 0.4;
      for (let n = 0; n < rows; n++) {
        const sway = Math.sin(n * 1.6 + h * 8) * 0.12;
        S.push(part(G.cyl6, '#5d8068', { p: [faceX + (w.dx ? 0 : sway), 0.3 + n * 0.35, faceZ + (w.dx ? sway : 0)], s: [0.025, 0.42, 0.025], r: [0, 0, sway] }));
        for (const side of [-1, 1]) S.push(part(G.sphereLo, n % 2 ? '#77986d' : '#a0bd86', { p: [faceX + (w.dx ? 0 : side * 0.13), 0.35 + n * 0.35, faceZ + (w.dx ? side * 0.13 : 0)], s: [w.dx ? 0.05 : 0.17, 0.1, w.dx ? 0.17 : 0.05], r: [0, 0, side * 0.4] }));
      }
    }
    if (index % 7 === 0) {
      const x = w.x - w.dx * 0.7, z = w.z - w.dz * 0.7;
      for (let n = 0; n < 3; n++) S.push(part(G.ico1, stone[n], { p: [x + (w.dx ? 0 : (n - 1) * 0.35), 0.13, z + (w.dx ? (n - 1) * 0.35 : 0)], s: [0.26, 0.18, 0.22], r: [0.2, h * 8 + n, 0.3] }));
      S.push(part(G.cyl6, '#efdfc6', { p: [x, 0.17, z], s: [0.08, 0.34, 0.08] }));
      S.push(part(G.sphereLo, index % 2 ? '#c1b2df' : '#a1d6c2', { p: [x, 0.4, z], s: [0.34, 0.18, 0.3] }));
    }
  }

  // ---- the hand-placed landmarks of each section (local coordinates)
  sections.forEach((s, i) => {
    const S = L(i).structure, dress = dressOf(i);
    if (dress === 'yard') {
      for (const [x, z, h] of [[-12, 62, 2.4], [12, 62, 2], [-12, 46, 3], [12, 46, 2.6]]) pillar(S, x, z, h);
      arch(S, 0, 45, 6.4, 0, true);
      for (const side of [-1, 1]) {                                    // training banners on poles
        S.push(part(G.cyl6, '#8a6a4a', { p: [side * 9, 1.4, 61], s: [0.07, 2.8, 0.07] }));
        brick(S, side * 9 + 0.5, 2.3, 61, 0.9, 0.9, 0.05, side > 0 ? '#e2705e' : '#5fa8d8');
      }
    } else if (dress === 'garden') {
      for (const c of s.floor) {
        if (!c.carve) continue;
        if (c.shape === 'circle') {                                    // the fountain: a stone basin, water and a spout
          for (let n = 0; n < 14; n++) { const a = n * Math.PI * 2 / 14; brick(S, c.x + Math.cos(a) * (c.r + 0.1), 0.28, c.z + Math.sin(a) * (c.r + 0.1), 1.2, 0.56, 0.5, stone[n % stone.length], -a); }
          S.push(part(G.cyl8, '#8fd0e6', { p: [c.x, 0.4, c.z], s: [c.r - 0.2, 0.05, c.r - 0.2] }));
          S.push(part(G.cyl8, '#b2b6c4', { p: [c.x, 0.7, c.z], s: [0.35, 0.8, 0.35] }));
          S.push(part(G.sphere, '#cfeaf5', { p: [c.x, 1.25, c.z], s: [0.28, 0.2, 0.28] }));
        } else if (c.kind === 'planter') {                             // a stone-rimmed bed of flowers
          for (const [dx, dz, w, d] of [[0, -c.d / 2, c.w + 0.5, 0.5], [0, c.d / 2, c.w + 0.5, 0.5], [-c.w / 2, 0, 0.5, c.d], [c.w / 2, 0, 0.5, c.d]]) brick(S, c.x + dx, 0.28, c.z + dz, w, 0.56, d, '#b9b6a8');
          brick(S, c.x, 0.3, c.z, c.w - 0.2, 0.5, c.d - 0.2, '#6b4a33');
          for (let n = 0; n < 14; n++) {
            const fx = c.x + (hash(n, c.x) - 0.5) * (c.w - 0.8), fz = c.z + (hash(n, c.z + 3) - 0.5) * (c.d - 0.8);
            S.push(part(G.cyl6, '#5fae63', { p: [fx, 0.7, fz], s: [0.025, 0.4, 0.025] }));
            S.push(part(G.sphereLo, ['#ff8fa8', '#fff0a0', '#ffffff', '#c39bff', '#ffb27a'][n % 5], { p: [fx, 0.95, fz], s: [0.17, 0.12, 0.17] }));
          }
        } else if (c.kind === 'hedge') {                               // a solid clipped hedge
          brick(S, c.x, 0.55, c.z, c.w - 0.5, 1.1, c.d - 0.5, '#4f9a5a');
          for (let n = 0; n < Math.round(c.w / 1.2); n++) S.push(part(G.sphereLo, hedgeGreens[n % 4], { p: [c.x - c.w / 2 + 0.7 + n * 1.2, 1.15, c.z], s: [0.62, 0.42, Math.max(0.55, c.d / 2 - 0.1)] }));
        }
      }
      // the stone path through the gardens' middle and a couple of small trees at the back corners
      for (const [x, z] of [[-14, 38], [14, 38]]) {
        S.push(part(G.cyl6, '#7a5538', { p: [x, 0.8, z], s: [0.18, 1.6, 0.18] }));
        S.push(part(G.sphere, '#5fae63', { p: [x, 2.1, z], s: [0.95, 0.8, 0.95] })); S.push(part(G.sphere, '#7fc374', { p: [x + 0.3, 2.45, z], s: [0.6, 0.5, 0.6] }));
      }
    } else if (dress === 'castle') {
      arch(S, 0, 8, 8.4, 0, true); arch(S, -7, 0, 4.4, Math.PI / 2, true);
      arch(S, 20, -18, 4.4, 0, true); arch(S, 0, -26, 4.4, 0);
      // Ruined corner towers reclaimed by sprouting roots.
      for (const [x, z, h] of [[-26, -9, 3.2], [26, -17, 3]]) pillar(S, x, z, h);
      // Library remnants against its back wall, with ferns replacing the books.
      for (let n = 0; n < 6; n++) {
        brick(S, -24.8 + n * 0.9, 0.5, -9.5, 0.8, 0.85, 0.8, '#a8a5b4');
        for (let leaf = 0; leaf < 4; leaf++) S.push(part(G.sphereLo, '#8db085', { p: [-24.8 + n * 0.9, 1.1, -9.5], s: [0.12, 0.55, 0.07], r: [0.3, leaf * 1.5, leaf * 0.35 - 0.55] }));
      }
      // Dead ends have distinct landmarks: a broken well, a pantry and a flower shrine.
      for (let n = 0; n < 12; n++) {
        const a = n * Math.PI / 6;
        brick(S, -35 + Math.cos(a) * 1.1, 0.18, -21 + Math.sin(a) * 1.1, 0.5, 0.3, 0.4, stone[n % stone.length], -a);
      }
      S.push(part(G.sphereLo, '#88b7a0', { p: [-35, 0.03, -21], s: [0.85, 0.025, 0.85] }));
      for (let n = 0; n < 3; n++) brick(S, -38.8, 0.22 + n * 0.28, -5.5 + n * 1.3, 0.7, 0.44, 1, '#b6a48e', n * 0.08);
      brick(S, 38.5, 0.4, -12, 0.8, 0.8, 2.8, '#bcb6ca');
      for (let n = 0; n < 9; n++) {
        S.push(part(G.cyl6, '#7a9d77', { p: [38.1, 0.65, -13 + n * 0.25], s: [0.04, 0.8, 0.04] }));
        S.push(part(G.sphereLo, n % 2 ? '#dcb2d3' : '#f0d7a7', { p: [38.1, 1.1 + n % 3 * 0.1, -13 + n * 0.25], s: [0.15, 0.12, 0.15] }));
      }
    } else if (dress === 'rampart') {
      const rect = s.floor[0];                                         // the room (the stair is the second rect): a tower pillar at each far corner and a banner on the back wall
      pillar(S, rect.x - rect.w / 2 + 0.4, rect.z - rect.d / 2 + 0.4, 2.8); pillar(S, rect.x + rect.w / 2 - 0.4, rect.z - rect.d / 2 + 0.4, 2.4);
      brick(S, rect.x - 3.2, 2.1, rect.z - rect.d / 2 + 0.55, 1, 1.5, 0.06, ['#5fa8d8', '#e2705e', '#9ad07a'][i % 3]);
      brick(S, rect.x + 3.2, 2.1, rect.z - rect.d / 2 + 0.55, 1, 1.5, 0.06, ['#e2705e', '#9ad07a', '#5fa8d8'][i % 3]);
    } else if (dress === 'throne') {
      const c = s.floor[0], tz = c.z - c.r + 1.4;                      // a throne reclaimed by sprouting roots, at the back of the round hall
      brick(S, c.x, 0.28, tz, 3.8, 0.56, 1.7, '#a4a6b6');
      brick(S, c.x, 1.1, tz - 0.6, 2.8, 1.4, 0.6, '#bbb3c7');
      for (const side of [-1, 1]) brick(S, c.x + side * 1.4, 0.75, tz, 0.4, 0.7, 1.6, '#9da3b2');
      for (let n = 0; n < 6; n++) S.push(part(G.sphereLo, n % 2 ? '#8aaf78' : '#6c9175', { p: [c.x + (n - 2.5) * 0.36, 1.6 + n % 2 * 0.18, tz - 0.6], s: [0.17, 0.7, 0.14], r: [0, n, (n - 2.5) * 0.2] }));
      for (let n = 0; n < 7; n++) {                                    // pillars standing around the hall's far half, outside its wall (the way in is to the south)
        const a = Math.PI + (n + 0.5) * Math.PI / 7, R = c.r + 1.5;
        pillar(S, c.x + Math.cos(a) * R, c.z + Math.sin(a) * R, 2.2 + hash(n, 5) * 1.4);
      }
    }
    // ---- the checkpoint shrine at every later section's start
    const sh = s.safe.find((z) => z.r !== undefined);
    if (i > 0 && sh) {
      const r = Math.min(2.7, sh.r - 0.3);
      for (let n = 0; n < 10; n++) {
        const a = n * Math.PI * 2 / 10;
        brick(S, sh.x + Math.cos(a) * r, 0.12, sh.z + Math.sin(a) * r, 0.7, 0.24, 0.42, stone[n % stone.length], -a);
        if (n % 2) S.push(part(G.sphereLo, '#9ad07a', { p: [sh.x + Math.cos(a) * (r + 0.1), 0.3, sh.z + Math.sin(a) * (r + 0.1)], s: [0.2, 0.1, 0.2] }));
      }
      S.push(part(G.cyl8, '#b2b6c4', { p: [sh.x, 0.3, sh.z], s: [0.5, 0.6, 0.5] }));
      S.push(part(G.cyl8, '#c9c6bb', { p: [sh.x, 0.63, sh.z], s: [0.58, 0.08, 0.58] }));
      S.push(part(G.ico1, '#8fffd0', { p: [sh.x, 1.05, sh.z], s: [0.22, 0.32, 0.22] }));
    }
  });

  // ---- the merged meshes, one pair per section
  const groups = sections.map((s, i) => {
    const group = new THREE.Group(); group.name = `section-${s.id}`; root.add(group);
    for (const [name, parts] of [['paving', lists[i].ground], ['structure', lists[i].structure]]) {
      if (!parts.length) continue;
      const mesh = new THREE.Mesh(combine(parts), VERTEX_TOON); mesh.name = `${s.id}-${name}`;
      mesh.castShadow = name !== 'paving'; mesh.receiveShadow = true; group.add(mesh);
    }
    return group;
  });
  // which section a world point stands in (null between areas): the visuals keep the sections around every PLAYER drawn, not just the run's current one
  const sectionAt = (x, z) => owner.get(tileKey(Math.floor((x - area.origin.x) / TILE_SIZE), Math.floor((z - area.origin.z) / TILE_SIZE))) ?? null;
  return { sections: groups, sectionAt };
}
