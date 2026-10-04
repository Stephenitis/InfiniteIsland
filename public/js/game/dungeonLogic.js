// Wildroot Hollow: deterministic host-owned rules, independent of rendering.
export const DUNGEON = { x: 1200, z: 1000, y: 8, hp: 100, safeZ: 8 };
export const STONE_CODE = [1, 1, 1, 3];
export const ROOMS = [
  { name: 'Safe bailey', x: 0, z: 16, w: 24, d: 16 },
  { name: 'Gate passage', x: 0, z: 7, w: 8, d: 10 },
  { name: 'Root hall', x: 0, z: 0, w: 12, d: 12 },
  { name: 'West passage', x: -10, z: 0, w: 16, d: 4 },
  { name: 'Fern library', x: -20, z: -4, w: 12, d: 12 },
  { name: 'Lost pantry passage', x: -30, z: -4, w: 16, d: 4 },
  { name: 'Lost pantry', x: -36, z: -4, w: 8, d: 8, deadEnd: true },
  { name: 'Cloister passage', x: -20, z: -14, w: 4, d: 16 },
  { name: 'North cloister', x: -10, z: -20, w: 24, d: 4 },
  { name: 'Well passage', x: -28, z: -20, w: 16, d: 4 },
  { name: 'Forgotten well', x: -34, z: -20, w: 8, d: 8, deadEnd: true },
  { name: 'King\'s passage', x: 0, z: -16, w: 4, d: 24 },
  { name: 'East passage', x: 10, z: -4, w: 16, d: 4 },
  { name: 'Bent passage', x: 20, z: -7, w: 4, d: 14 },
  { name: 'Ivy courtyard', x: 20, z: -12, w: 12, d: 12 },
  { name: 'Reliquary passage', x: 30, z: -12, w: 16, d: 4 },
  { name: 'Bloom reliquary', x: 36, z: -12, w: 8, d: 8, deadEnd: true },
  { name: 'East cloister', x: 20, z: -26, w: 4, d: 20 },
  { name: 'Throne passage', x: 12, z: -34, w: 16, d: 4 },
  { name: 'Overgrown throne', x: 0, z: -34, w: 16, d: 16 },
];
// Shared grid drives paving, wall boundaries, collision, sight and enemy navigation.
// Testing the union before clearance avoids artificial barriers at hallway/room joins.
export const TILE_SIZE = 2;
const tileKey = (x, z) => `${x},${z}`;
const tiles = new Map();
for (const r of ROOMS) for (let x = r.x - r.w / 2; x < r.x + r.w / 2; x += TILE_SIZE) {
  for (let z = r.z - r.d / 2; z < r.z + r.d / 2; z += TILE_SIZE) {
    const tx = Math.floor(x / TILE_SIZE), tz = Math.floor(z / TILE_SIZE);
    tiles.set(tileKey(tx, tz), { tx, tz, x: tx * TILE_SIZE + 1, z: tz * TILE_SIZE + 1 });
  }
}
export const DUNGEON_TILES = [...tiles.values()];
const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const DUNGEON_WALLS = DUNGEON_TILES.flatMap((t) => DIRECTIONS.flatMap(([dx, dz]) =>
  tiles.has(tileKey(t.tx + dx, t.tz + dz)) ? [] : [{ x: t.x + dx, z: t.z + dz, dx, dz }]));
const edges = DUNGEON_WALLS.map((w) => ({
  ax: DUNGEON.x + w.x - (w.dx ? 0 : 1), az: DUNGEON.z + w.z - (w.dx ? 1 : 0),
  bx: DUNGEON.x + w.x + (w.dx ? 0 : 1), bz: DUNGEON.z + w.z + (w.dx ? 1 : 0),
}));
const cellAt = (x, z) => tileKey(Math.floor((x - DUNGEON.x) / TILE_SIZE), Math.floor((z - DUNGEON.z) / TILE_SIZE));
const onFloor = (x, z) => tiles.has(cellAt(x, z));
function pointSegmentDistanceSq(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, length = dx * dx + dz * dz;
  const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length)) : 0;
  return (x - ax - t * dx) ** 2 + (z - az - t * dz) ** 2;
}
export function inDungeon(x, z, pad = 0) {
  if (!onFloor(x, z)) return false;
  if (!pad) return true;
  for (const e of edges) {
    if (x + pad < e.ax || x - pad > e.bx || z + pad < e.az || z - pad > e.bz) continue;
    if (pointSegmentDistanceSq(x, z, e.ax, e.az, e.bx, e.bz) < pad * pad) return false;
  }
  return true;
}
export function dungeonSight(a, b, pad = 0.12) {
  if (!onFloor(a.x, a.z) || !onFloor(b.x, b.z)) return false;
  const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x), minZ = Math.min(a.z, b.z), maxZ = Math.max(a.z, b.z);
  for (const e of edges) {
    if (maxX + pad < e.ax || minX - pad > e.bx || maxZ + pad < e.az || minZ - pad > e.bz) continue;
    // Exact swept-circle/segment clearance; sparse ray samples can miss a corner.
    const cross = (x, z, ax, az, bx, bz) => (bx - ax) * (z - az) - (bz - az) * (x - ax);
    const c1 = cross(e.ax, e.az, a.x, a.z, b.x, b.z), c2 = cross(e.bx, e.bz, a.x, a.z, b.x, b.z);
    const c3 = cross(a.x, a.z, e.ax, e.az, e.bx, e.bz), c4 = cross(b.x, b.z, e.ax, e.az, e.bx, e.bz);
    if (minX <= e.bx && maxX >= e.ax && minZ <= e.bz && maxZ >= e.az && c1 * c2 <= 0 && c3 * c4 <= 0) return false;
    const distance = Math.min(pointSegmentDistanceSq(a.x, a.z, e.ax, e.az, e.bx, e.bz), pointSegmentDistanceSq(b.x, b.z, e.ax, e.az, e.bx, e.bz),
      pointSegmentDistanceSq(e.ax, e.az, a.x, a.z, b.x, b.z), pointSegmentDistanceSq(e.bx, e.bz, a.x, a.z, b.x, b.z));
    if (distance < pad * pad) return false;
  }
  return true;
}
/** One reverse BFS per chasing player per tick; all its pursuers reuse the field. */
export function dungeonDistanceField(goal) {
  const start = tiles.get(cellAt(goal.x, goal.z)), field = new Map();
  if (!start) return field;
  const queue = [start]; field.set(tileKey(start.tx, start.tz), 0);
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i], d = field.get(tileKey(t.tx, t.tz));
    for (const [dx, dz] of DIRECTIONS) {
      const key = tileKey(t.tx + dx, t.tz + dz), next = tiles.get(key);
      if (next && !field.has(key)) { field.set(key, d + 1); queue.push(next); }
    }
  }
  return field;
}
export function dungeonWaypoint(from, goal, field = dungeonDistanceField(goal)) {
  if (dungeonSight(from, goal, 0.8)) return goal;
  const current = tiles.get(cellAt(from.x, from.z)); if (!current) return null;
  const distance = field.get(tileKey(current.tx, current.tz)); if (distance === undefined) return null;
  // Approach a cell centre only when a direct step would clip a concave corner.
  const centre = { x: DUNGEON.x + current.x, z: DUNGEON.z + current.z };
  for (const [dx, dz] of DIRECTIONS) {
    const next = tiles.get(tileKey(current.tx + dx, current.tz + dz));
    if (next && field.get(tileKey(next.tx, next.tz)) < distance) {
      const point = { x: DUNGEON.x + next.x, z: DUNGEON.z + next.z };
      return dungeonSight(from, point, 0.8) ? point : centre;
    }
  }
  return centre;
}
export function stoneProgress(progress, stone) {
  const sequence = [...STONE_CODE.slice(0, progress), stone];
  for (let n = Math.min(sequence.length, STONE_CODE.length); n > 0; n--) {
    if (sequence.slice(-n).every((v, i) => v === STONE_CODE[i])) return n;
  }
  return 0;
}
export const WEAPONS = {
  sword: { duration: 0.38, impact: 0.17, range: 3, arc: 0.65, damage: [14, 17, 25], stun: 0.22,
    keys: [[-1.9, -0.8, -0.35, -0.08], [0.3, 0.9, 0.45, 0.12]] },
  axe: { duration: 0.72, impact: 0.34, range: 3.3, arc: -0.15, damage: [29], stun: 0.5,
    keys: [[-2.2, -1.1, -0.65, -0.12], [0.55, 1.2, 0.7, 0.22]] },
  hammer: { duration: 1.08, impact: 0.52, range: 2.8, arc: 0.15, damage: [44], stun: 1.3,
    keys: [[-2.8, -0.25, 0, -0.2], [0.9, -0.1, 0.05, 0.38]] },
};
export const ENEMY_KINDS = {
  berry: { name: 'Brambleberry', hp: 38, speed: 2.3, damage: 9, color: '#ce729f', shape: 'fruit' },
  carrot: { name: 'Karate Carrot', hp: 52, speed: 1.8, damage: 12, color: '#f5ab68', shape: 'carrot' },
  turnip: { name: 'Turnip Tough', hp: 66, speed: 1.3, damage: 15, color: '#dbc3e8', shape: 'root' },
  sprout: { name: 'Snap Sprout', hp: 44, speed: 2, damage: 10, color: '#95c982', shape: 'plant' },
  pumpkin: { name: 'Pumpkin Patchkeeper', hp: 150, speed: 1.1, damage: 20, color: '#efbc7e', shape: 'pumpkin' },
};
const SPAWNS = [['sprout', -3, 0], ['berry', -20, -2], ['carrot', -20, -7], ['turnip', 20, -14],
  ['berry', 36, -12], ['sprout', -34, -20], ['carrot', -5, -33], ['turnip', 5, -33], ['pumpkin', 0, -38]];
export const foodHealing = (recipe) => ({ home: 25, frost: 45, ember: 65 })[recipe?.island] || 0;
export class DungeonRun {
  constructor() { this.time = 0; this.progress = 0; this.open = false; this.active = false; this.serial = 0; this.run = 0; this.members = {}; this.enemies = []; this.cleared = false; }
  strike(stone) { if (this.active) return false; if (this.open) return true; this.progress = stoneProgress(this.progress, stone); this.open = this.progress === 4; return this.open; }
  start(keys) {
    this.active = true; this.open = false; this.progress = 0; this.run++; this.serial++; this.cleared = false;
    this.members = Object.fromEntries(keys.map((key) => [key, this.newMember()]));
    this.enemies = SPAWNS.map(([kind, x, z], id) => ({ id, kind, x: DUNGEON.x + x, z: DUNGEON.z + z, hp: ENEMY_KINDS[kind].hp, wind: 0, cooldown: 0, stun: 0, target: null, aim: null }));
  }
  newMember() { return { hp: DUNGEON.hp, combatUntil: 0, invulnerable: 0, ready: 0, combo: 0, lastSword: -99, attack: null }; }
  leave() { this.active = false; this.open = false; this.progress = 0; this.serial++; }
  inCombat(key, positions) {
    const p = positions[key], m = this.members[key];
    return !!m && (this.time < m.combatUntil || !!p && this.enemies.some((e) => e.hp > 0 && Math.hypot(e.x - p.x, e.z - p.z) < 7 && p.z < DUNGEON.z + DUNGEON.safeZ && dungeonSight(e, p)));
  }
  attack(key, kind, facing, positions) {
    const m = this.members[key], w = WEAPONS[kind], p = positions[key];
    if (!this.active || !m || !w || !p || !inDungeon(p.x, p.z) || !Number.isFinite(facing) || this.time < m.ready) return null;
    const combo = kind === 'sword' && this.time - m.lastSword < 1.1 ? m.combo % 3 : 0;
    m.combo = combo + 1; if (kind === 'sword') m.lastSword = this.time; else m.lastSword = -99;
    m.ready = this.time + w.duration; m.combatUntil = this.time + 4;
    m.attack = { at: this.time + w.impact, kind, combo, facing, x: p.x, z: p.z, run: this.run };
    return { kind, combo };
  }
  eat(key, recipe, positions, consume) {
    const m = this.members[key], heal = foodHealing(recipe);
    if (!this.active || !m || m.hp >= DUNGEON.hp || !positions[key] || !inDungeon(positions[key].x, positions[key].z) || this.inCombat(key, positions) || !heal) return false;
    if (!consume(recipe.dish)) return false;
    m.hp = Math.min(DUNGEON.hp, m.hp + heal); return true;
  }
  update(dt, positions) {
    this.time += dt; if (!this.active) return null;
    for (const [key, m] of Object.entries(this.members)) {
      const a = m.attack; if (!a || a.at > this.time) continue;
      m.attack = null; const p = positions[key];
      if (!p || !inDungeon(p.x, p.z) || Math.hypot(p.x - a.x, p.z - a.z) > 3) continue;
      const w = WEAPONS[a.kind];
      for (const e of this.enemies) {
        const dx = e.x - p.x, dz = e.z - p.z, dist = Math.hypot(dx, dz);
        if (e.hp <= 0 || dist > w.range || !dungeonSight(p, e) || dist > 0.1 && (dx * Math.sin(a.facing) + dz * Math.cos(a.facing)) / dist < w.arc) continue;
        e.hp = Math.max(0, e.hp - w.damage[a.combo]); e.stun = w.stun; e.wind = 0; e.cooldown = 0.8;
        const nx = e.x + dx / (dist || 1) * 0.6, nz = e.z + dz / (dist || 1) * 0.6;
        if (inDungeon(nx, nz, 0.8)) { e.x = nx; e.z = nz; }
      }
    }
    const fields = new Map();
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      e.stun = Math.max(0, e.stun - dt); e.cooldown = Math.max(0, e.cooldown - dt);
      if (e.stun > 0) continue;
      const candidates = Object.keys(this.members).filter((k) => positions[k] && inDungeon(positions[k].x, positions[k].z) && positions[k].z < DUNGEON.z + DUNGEON.safeZ);
      const visible = candidates.filter((k) => Math.hypot(e.x - positions[k].x, e.z - positions[k].z) < 8 && dungeonSight(e, positions[k]));
      const key = visible.sort((a, b) => Math.hypot(e.x - positions[a].x, e.z - positions[a].z) - Math.hypot(e.x - positions[b].x, e.z - positions[b].z))[0]
        || (candidates.includes(e.target) && (e.aggroUntil || 0) > this.time ? e.target : null);
      const p = positions[key]; if (!p) { e.wind = 0; continue; }
      const dist = Math.hypot(e.x - p.x, e.z - p.z), m = this.members[key];
      if (visible.includes(key)) { if (!e.wind) e.target = key; e.aggroUntil = this.time + 5; }
      m.combatUntil = this.time + 3;
      if (e.wind > 0) {
        e.wind -= dt;
        if (e.wind <= 0) {
          const victim = this.members[e.target], vp = positions[e.target];
          if (victim && vp && vp.z < DUNGEON.z + DUNGEON.safeZ && Math.hypot(vp.x - e.aim.x, vp.z - e.aim.z) < 1.65 && dungeonSight(e, vp) && this.time >= victim.invulnerable) {
            victim.hp = Math.max(0, victim.hp - ENEMY_KINDS[e.kind].damage); victim.invulnerable = this.time + 0.9;
            if (victim.hp === 0) { const keys = Object.keys(this.members); this.start(keys); return 'reset'; }
          }
          e.cooldown = 1.3;
        }
      } else if (dist < 1.8 && !e.cooldown && dungeonSight(e, p)) { e.wind = 0.75; e.target = key; e.aim = { x: p.x, z: p.z }; }
      else if (dist > 1.35 || !dungeonSight(e, p, 0.8)) {
        let waypoint = p;
        if (!dungeonSight(e, p, 0.8)) {
          if (!fields.has(key)) fields.set(key, dungeonDistanceField(p));
          waypoint = dungeonWaypoint(e, p, fields.get(key));
        }
        if (!waypoint) continue;
        const length = Math.hypot(waypoint.x - e.x, waypoint.z - e.z);
        const stopDistance = dungeonSight(e, p, 0.8) ? 1.35 : 0;
        const step = Math.min(length, Math.max(0, dist - stopDistance), ENEMY_KINDS[e.kind].speed * dt);
        const nx = e.x + (waypoint.x - e.x) / (length || 1) * step, nz = e.z + (waypoint.z - e.z) / (length || 1) * step;
        if (nz < DUNGEON.z + DUNGEON.safeZ - 1 && inDungeon(nx, nz, 0.8) && dungeonSight(e, { x: nx, z: nz }, 0.8)) { e.x = nx; e.z = nz; }
      }
    }
    if (!this.cleared && this.enemies.every((e) => e.hp === 0)) { this.cleared = true; return 'cleared'; }
    return null;
  }
  snapshot() { return JSON.parse(JSON.stringify({ time: this.time, progress: this.progress, open: this.open, active: this.active, serial: this.serial, run: this.run, members: this.members, enemies: this.enemies, cleared: this.cleared })); }
  load(s) { Object.assign(this, s); }
}
