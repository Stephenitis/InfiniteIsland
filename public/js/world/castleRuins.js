// A roofless, softly coloured castle ruin. Its masonry follows the same grid as
// collision and navigation; front walls are broken low to keep the party visible.
import * as THREE from 'three';
import { G, part, combine, VERTEX_TOON } from '../render/geo.js';
import { DUNGEON_TILES, DUNGEON_WALLS, TILE_SIZE } from '../game/dungeonLogic.js';

const stone = ['#b2b6c4', '#c7c6ce', '#a6adbc', '#bcb8c5', '#c9c6bb'];
const hash = (x, z, salt = 0) => {
  const n = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453;
  return n - Math.floor(n);
};
export function buildCastleRuins(root) {
  const box = new THREE.BoxGeometry(1, 1, 1), ground = [], walls = [], plants = [], details = [];
  function brick(target, x, y, z, sx, sy, sz, color, yaw = 0, tilt = 0) {
    target.push(part(box, color, { p: [x, y, z], s: [sx, sy, sz], r: [0, yaw, tilt] }));
  }
  for (const t of DUNGEON_TILES) {
    const h = hash(t.tx, t.tz), courtyard = Math.hypot(t.x - 20, t.z + 12) < 5;
    brick(ground, t.x, -0.8, t.z, TILE_SIZE, 1.6, TILE_SIZE, '#85899d');
    // Four inset flagstones give every tile mortar seams and uneven old paving.
    for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) {
      const moss = courtyard || hash(t.tx + x, t.tz + z, 3) > 0.83;
      brick(ground, t.x - 0.5 + x, -0.06, t.z - 0.5 + z, 0.94, 0.15, 0.94, moss ? '#a0b39a' : stone[Math.floor(hash(t.tx + x, t.tz + z, 1) * stone.length)]);
    }
    if (h > 0.86) {
      // Flat broken slab corner: a crack rather than a dangerous floor hole.
      brick(details, t.x + 0.3, 0.035, t.z - 0.3, 0.42, 0.045, 0.07, '#727d88', h * 5);
      for (let n = 0; n < 3; n++) plants.push(part(G.sphereLo, '#7f9e79', { p: [t.x + 0.25 + n * 0.07, 0.09, t.z - 0.3], s: [0.035, 0.2 + n * 0.025, 0.05], r: [0.2, n, 0.3 - n * 0.3] }));
    }
  }
  for (const [index, w] of DUNGEON_WALLS.entries()) {
    const yaw = w.dx ? Math.PI / 2 : 0, h = hash(w.x, w.z);
    // Tall north/side walls, low south walls: the ruin reads as a castle without
    // obscuring the fixed-angle camera with intact foreground masonry.
    const rows = w.dz > 0 ? 2 + (index % 4 === 0 ? 1 : 0) : 4 + Math.floor(h * 3);
    brick(walls, w.x, 0.13, w.z, w.dx ? 0.78 : 2, 0.26, w.dx ? 2 : 0.78, '#858b9a');
    for (let row = 0; row < rows; row++) for (let n = 0; n < 2; n++) {
      if (row === rows - 1 && hash(w.x, w.z, n + 8) > 0.74) continue;
      const offset = n - 0.5 + (row % 2 ? 0.12 : -0.06);
      brick(walls, w.x + (w.dx ? 0 : offset), 0.3 + row * 0.38, w.z + (w.dx ? offset : 0),
        0.93, 0.33, 0.65, stone[(row + index + n) % stone.length], yaw, row === rows - 1 ? (h - 0.5) * 0.1 : 0);
    }
    if (index % 5 === 0) {
      // Surviving merlons give the wall its crenellated castle silhouette.
      brick(walls, w.x, 0.48 + rows * 0.38, w.z, 0.62, 0.5, 0.72, '#b8b6c3', yaw, (h - 0.5) * 0.1);
    }
    if (h > 0.48) {
      plants.push(part(G.sphereLo, '#809b7b', { p: [w.x, 0.25 + rows * 0.38, w.z], s: [w.dx ? 0.4 : 0.95, 0.08, w.dx ? 0.95 : 0.4] }));
      const faceX = w.x - w.dx * 0.4, faceZ = w.z - w.dz * 0.4;
      for (let n = 0; n < rows; n++) {
        const sway = Math.sin(n * 1.6 + h * 8) * 0.12;
        plants.push(part(G.cyl6, '#5d8068', { p: [faceX + (w.dx ? 0 : sway), 0.3 + n * 0.35, faceZ + (w.dx ? sway : 0)], s: [0.025, 0.42, 0.025], r: [0, 0, sway] }));
        for (const side of [-1, 1]) plants.push(part(G.sphereLo, n % 2 ? '#77986d' : '#a0bd86', { p: [faceX + (w.dx ? 0 : side * 0.13), 0.35 + n * 0.35, faceZ + (w.dx ? side * 0.13 : 0)], s: [w.dx ? 0.05 : 0.17, 0.1, w.dx ? 0.17 : 0.05], r: [0, 0, side * 0.4] }));
      }
    }
    if (index % 7 === 0) {
      const x = w.x - w.dx * 0.7, z = w.z - w.dz * 0.7;
      for (let n = 0; n < 3; n++) details.push(part(G.ico1, stone[n], { p: [x + (w.dx ? 0 : (n - 1) * 0.35), 0.13, z + (w.dx ? (n - 1) * 0.35 : 0)], s: [0.26, 0.18, 0.22], r: [0.2, h * 8 + n, 0.3] }));
      plants.push(part(G.cyl6, '#efdfc6', { p: [x, 0.17, z], s: [0.08, 0.34, 0.08] }));
      plants.push(part(G.sphereLo, index % 2 ? '#c1b2df' : '#a1d6c2', { p: [x, 0.4, z], s: [0.34, 0.18, 0.3] }));
    }
  }
  function pillar(x, z, height = 3) {
    brick(details, x, 0.2, z, 1.2, 0.4, 1.2, '#999eac');
    for (let n = 0; n < Math.floor(height / 0.5); n++) brick(details, x, 0.65 + n * 0.48, z, 0.85, 0.43, 0.85, stone[n % stone.length], 0, n === Math.floor(height / 0.5) - 1 ? 0.09 : 0);
    brick(details, x, height + 0.25, z, 1.15, 0.25, 1.15, '#bcb8c5');
    plants.push(part(G.sphereLo, '#88a582', { p: [x, height + 0.43, z], s: [0.65, 0.09, 0.65] }));
    for (let n = 0; n < 5; n++) plants.push(part(G.sphereLo, '#779e74', { p: [x + 0.5, height - n * 0.28, z + Math.sin(n) * 0.15], s: [0.1, 0.23, 0.12], r: [0, n, 0.4] }));
  }
  function arch(x, z, width, yaw, broken = false) {
    const radius = width / 2 + 0.45;
    for (const side of [-1, 1]) pillar(x + Math.cos(yaw) * radius * side, z - Math.sin(yaw) * radius * side, 2.1);
    for (let n = 0; n <= 10; n++) {
      if (broken && (n === 4 || n === 5)) continue;
      const a = -Math.PI / 2 + n * Math.PI / 10, offset = Math.sin(a) * radius;
      details.push(part(box, stone[n % stone.length], { p: [x + Math.cos(yaw) * offset, 2.3 + Math.cos(a) * radius * 0.7, z - Math.sin(yaw) * offset], s: [0.65, 0.48, 0.7], r: [0, yaw, -a] }));
    }
  }
  arch(0, 8, 8.4, 0, true); arch(-7, 0, 4.4, Math.PI / 2, true);
  arch(20, -18, 4.4, 0, true); arch(0, -26, 4.4, 0);
  // Ruined corner towers and a throne reclaimed by sprouting roots.
  for (const [x, z, h] of [[-12, 22, 2.4], [12, 22, 2], [-26, -9, 3.2], [26, -17, 3], [-8, -40, 3.5], [8, -40, 2.8]]) pillar(x, z, h);
  brick(details, 0, 0.28, -40.8, 3.8, 0.56, 1.7, '#a4a6b6');
  brick(details, 0, 1.1, -41.4, 2.8, 1.4, 0.6, '#bbb3c7');
  for (const side of [-1, 1]) brick(details, side * 1.4, 0.75, -40.8, 0.4, 0.7, 1.6, '#9da3b2');
  for (let n = 0; n < 6; n++) plants.push(part(G.sphereLo, n % 2 ? '#8aaf78' : '#6c9175', { p: [(n - 2.5) * 0.36, 1.6 + n % 2 * 0.18, -41.4], s: [0.17, 0.7, 0.14], r: [0, n, (n - 2.5) * 0.2] }));
  // Library remnants against its back wall, with ferns replacing the books.
  for (let n = 0; n < 6; n++) {
    brick(details, -24.8 + n * 0.9, 0.5, -9.5, 0.8, 0.85, 0.8, '#a8a5b4');
    for (let leaf = 0; leaf < 4; leaf++) plants.push(part(G.sphereLo, '#8db085', { p: [-24.8 + n * 0.9, 1.1, -9.5], s: [0.12, 0.55, 0.07], r: [0.3, leaf * 1.5, leaf * 0.35 - 0.55] }));
  }
  // Dead ends have distinct landmarks: a broken well, a pantry and a flower shrine.
  for (let n = 0; n < 12; n++) {
    const a = n * Math.PI / 6;
    brick(details, -35 + Math.cos(a) * 1.1, 0.18, -21 + Math.sin(a) * 1.1, 0.5, 0.3, 0.4, stone[n % stone.length], -a);
  }
  plants.push(part(G.sphereLo, '#88b7a0', { p: [-35, 0.03, -21], s: [0.85, 0.025, 0.85] }));
  for (let n = 0; n < 3; n++) brick(details, -38.8, 0.22 + n * 0.28, -5.5 + n * 1.3, 0.7, 0.44, 1, '#b6a48e', n * 0.08);
  brick(details, 38.5, 0.4, -12, 0.8, 0.8, 2.8, '#bcb6ca');
  for (let n = 0; n < 9; n++) {
    plants.push(part(G.cyl6, '#7a9d77', { p: [38.1, 0.65, -13 + n * 0.25], s: [0.04, 0.8, 0.04] }));
    plants.push(part(G.sphereLo, n % 2 ? '#dcb2d3' : '#f0d7a7', { p: [38.1, 1.1 + n % 3 * 0.1, -13 + n * 0.25], s: [0.15, 0.12, 0.15] }));
  }
  for (const [name, parts] of [['castle-paving', ground], ['ruined-masonry', walls], ['castle-relics', details], ['castle-overgrowth', plants]]) {
    const mesh = new THREE.Mesh(combine(parts), VERTEX_TOON); mesh.name = name;
    mesh.castShadow = name !== 'castle-paving'; mesh.receiveShadow = true; root.add(mesh);
  }
  box.dispose();
}
