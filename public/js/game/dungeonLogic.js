// Wildroot Hollow: deterministic host-owned rules, independent of rendering.
//
// Step 55 (downed / revive / sections / party scaling), all on the host's clock:
//   * A member reaching 0 HP is DOWNED (`m.downed`, `m.downAt`), not out: it cannot attack, dodge, special or eat, guardians never target
//     or hit it and projectiles pass through. When EVERY member is downed (a solo player: at once) the party WIPES: `wipe()` returns the
//     whole party to the current section's start with full HP and Bloom 0 and resets that section's guardians + projectiles (`serial` and
//     `run` advance, so screens re-teleport and stale events are dropped). Earlier cleared sections would stay cleared (`section` index).
//   * Revive: a living member holding Interact within COMBAT.revive.radius of a downed one sends a heartbeat (`reviveBeat`, every
//     COMBAT.revive.beat s). The host keeps `m.revivers {key: time}` (a beat expires after 2.5 beats); progress `m.revive` (seconds) grows
//     while any valid reviver is there (two revivers = 1.5x), decays when none is, and a reviver who takes damage (or is stunned) is
//     dropped from every target and that target's progress resets to 0. At COMBAT.revive.hold the target is up at revive.hp (a fraction of
//     max) with revive.inv s of invulnerability.
//   * Self-revive: a downed member with a living friend still gets up alone after COMBAT.revive.selfDelay s, but only while the area is
//     calm: no living guardian within COMBAT.revive.calm u of it and none hunting (aggro, `aggroUntil`) a LIVING member. Nobody is stuck
//     if friends wander off, yet the timer never wakes a sprout in the middle of a fight.
//   * Party scaling: guardian HP = kind HP x COMBAT.scale.hp[members - 1] (`e.max`). `rescale()` runs at section start and whenever the
//     roster changes (`join` / `drop`): every living guardian keeps its FRACTION of max HP, so a join mid-fight neither heals nor kills.
//     Spawn tuples may carry a 4th element `extra` (extra guardians by member count [1..4], default none) for Step 57's sections.
//   * `notes` (not saved) queues { type: 'down' | 'revive' | 'wipe', key, self? } for the sync layer's toasts (`drainNotes()`).
import { PLAYER_HITSTUN, COMBAT } from '../config.js';
import { avoidance, gainBloom, bloomPips } from './combatLogic.js';
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
    keys: [[-1.9, -0.8, -0.35, -0.08], [0.3, 0.9, 0.45, 0.12]],
    // Step 54: hold Interact = `charged` (a 360 degree spin: arc -1 means every direction); Cancel = `special` (dash-stab; Cancel held with 3 pips = the big one)
    charged: { shape: 'spin', charge: 0.55, duration: 0.6, impact: 0.22, range: 2.6, arc: -1, damage: 26, stun: 0.5, push: 1.1, keys: [[-1.2, -2.2, -1.6, -0.05], [0.4, 1.8, 4.8, 0.1]] },
    special: { name: 'Dash-stab', duration: 0.5, dash: 4.5, bigDash: 7, time: 0.26, bigTime: 0.34, radius: 1.1, damage: 24, bigDamage: 44, stun: 0.6, keys: [[-0.2, 0.2, -0.3, 0.25], [-1.55, 0.1, 0.5, 0.3]] } },
  axe: { duration: 0.72, impact: 0.34, range: 3.3, arc: -0.15, damage: [29], stun: 0.5,
    keys: [[-2.2, -1.1, -0.65, -0.12], [0.55, 1.2, 0.7, 0.22]],
    // overhead chop: narrow and long, big damage, extra stun; armorBreak is the flag for the later armoured guardians
    charged: { shape: 'chop', charge: 0.7, duration: 1, impact: 0.5, range: 4.6, arc: 0.88, damage: 58, stun: 1.1, push: 0.9, armorBreak: true, keys: [[-3.0, -0.6, -0.2, -0.2], [0.9, 0.2, 0.15, 0.4]] },
    special: { name: 'Boomerang', duration: 0.55, range: 6, speed: 12, radius: 0.9, damage: 26, bigDamage: 36, stun: 0.4, spread: 0.38, keys: [[-2.4, -1.4, -0.8, -0.1], [0.5, 0.8, 1.0, 0.18]] } },
  hammer: { duration: 1.08, impact: 0.52, range: 2.8, arc: 0.15, damage: [44], stun: 1.3,
    keys: [[-2.8, -0.25, 0, -0.2], [0.9, -0.1, 0.05, 0.38]],
    charged: { shape: 'pound', charge: 0.9, duration: 1.3, impact: 0.62, range: 3, arc: -1, damage: 64, stun: 2.2, push: 0.8, keys: [[-3.1, -0.2, 0, -0.25], [1.1, -0.1, 0.05, 0.45]] },
    special: { name: 'Shockwave', duration: 0.85, radius: 3.5, bigRadius: 5.5, damage: 32, bigDamage: 56, stun: 1, launch: 0.9, bigLaunch: 1.4, keys: [[-3.0, -0.2, 0, -0.25], [1.1, -0.1, 0.05, 0.45]] },
  },
};
export const ENEMY_KINDS = {
  berry: { name: 'Brambleberry', hp: 38, speed: 2.3, damage: 9, color: '#ce729f', shape: 'fruit' },
  carrot: { name: 'Karate Carrot', hp: 52, speed: 1.8, damage: 12, color: '#f5ab68', shape: 'carrot' },
  turnip: { name: 'Turnip Tough', hp: 66, speed: 1.3, damage: 15, color: '#dbc3e8', shape: 'root' },
  sprout: { name: 'Snap Sprout', hp: 44, speed: 2, damage: 10, color: '#95c982', shape: 'plant' },
  pumpkin: { name: 'Pumpkin Patchkeeper', hp: 150, speed: 1.1, damage: 20, color: '#efbc7e', shape: 'pumpkin' },
};
// Attack footprints are shared with the warning/impact renderer.
export const GUARDIAN_ATTACKS = {
  hop: { wind: 0.75, range: 1.8, radius: 1.65, recovery: 1.3 },
  seed: { wind: 0.95, range: 7, speed: 5.5, radius: 0.65, life: 2.2, recovery: 2.1 },
  charge: { wind: 0.85, range: 4.8, speed: 8, radius: 0.95, life: 0.6, recovery: 1.8 },
  stomp: { wind: 1.05, range: 2.5, radius: 2.5, recovery: 2 },
  sweep: { wind: 0.65, range: 2.5, radius: 2.6, arc: 0.3, recovery: 1.4 },
  wave: { wind: 1.25, range: 4.8, radius: 4.8, life: 1.2, recovery: 2.6 },
};
export function guardianAttack(kind, distance) {
  return kind === 'berry' ? (distance > 2.3 ? 'seed' : 'hop') : ({ carrot: 'charge', turnip: 'stomp', sprout: 'sweep', pumpkin: 'wave' })[kind];
}
export function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, n = dx * dx + dz * dz;
  const u = n ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / n)) : 0;
  return Math.hypot(p.x - a.x - u * dx, p.z - a.z - u * dz);
}
export const SPAWNS = [['sprout', -3, 0], ['berry', -20, -2], ['carrot', -20, -7], ['turnip', 20, -14],
  ['berry', 36, -12], ['sprout', -34, -20], ['carrot', -5, -33], ['turnip', 5, -33], ['pumpkin', 0, -38]];
// Sections: each is a start point (where a wipe returns the party; players fan out `step` apart by slot) plus its guardians. Wildroot is one.
export const SECTIONS = [{ id: 'hollow', start: { x: -2.7, z: 10, step: 1.8 }, enemies: SPAWNS }];
export const sectionStart = (section, slot = 0) => { const s = SECTIONS[section]?.start || SECTIONS[0].start; return { x: DUNGEON.x + s.x + slot * s.step, z: DUNGEON.z + s.z }; };
export const partyScale = (n) => COMBAT.scale.hp[Math.max(0, Math.min(COMBAT.scale.hp.length, n) - 1)] || 1;
/** A section's guardians for a party of `n`: the base spawns plus each spawn's `extra[n - 1]` copies beside it. */
export function buildEnemies(section, n = 1) {
  const list = [], scale = partyScale(n);
  const make = (kind, x, z) => ({ id: list.length, kind, x: DUNGEON.x + x, z: DUNGEON.z + z, hp: 0, max: 0, wind: 0, cooldown: 0, stun: 0, target: null, aim: null });
  const spawns = section?.enemies || SPAWNS;
  for (const [kind, x, z] of spawns) list.push(make(kind, x, z));
  for (const [kind, x, z, extra] of spawns) for (let i = 0; i < (extra?.[Math.max(0, Math.min(3, n - 1))] || 0); i++) list.push(make(kind, x + 1.2 * (i + 1), z));
  for (const e of list) e.max = e.hp = Math.round(ENEMY_KINDS[e.kind].hp * scale);
  return list;
}
export const foodHealing = (recipe) => ({ home: 25, frost: 45, ember: 65 })[recipe?.island] || 0;
export class DungeonRun {
  constructor() { this.time = 0; this.progress = 0; this.open = false; this.active = false; this.serial = 0; this.run = 0; this.members = {}; this.enemies = []; this.projectiles = []; this.pprojectiles = []; this.effects = []; this.nextFX = 0; this.cleared = false; this.avoided = null; this.section = 0; this.notes = []; }
  strike(stone) { if (this.active) return false; if (this.open) return true; this.progress = stoneProgress(this.progress, stone); this.open = this.progress === 4; return this.open; }
  start(keys) {
    this.active = true; this.open = false; this.progress = 0; this.run++; this.serial++; this.cleared = false; this.projectiles = []; this.pprojectiles = []; this.effects = [];
    this.section = 0; this.notes = [];
    this.members = Object.fromEntries(keys.map((key) => [key, this.newMember()]));
    this.enemies = buildEnemies(SECTIONS[this.section], keys.length);
  }
  // ---- Step 55
  drainNotes() { const n = this.notes; this.notes = []; return n; }
  living() { return Object.keys(this.members).filter((k) => !this.members[k].downed); }
  /** A friend joined / left mid-run: guardians keep their fraction of max HP at the new party size. */
  join(key) { if (this.members[key]) return false; this.members[key] = this.newMember(); this.rescale(); return true; }
  drop(key) { if (!this.members[key]) return false; delete this.members[key]; this.rescale(); this.checkWipe(); return true; }
  rescale() {
    const scale = partyScale(Object.keys(this.members).length);
    for (const e of this.enemies) {
      const max = Math.round(ENEMY_KINDS[e.kind].hp * scale), was = e.max || ENEMY_KINDS[e.kind].hp;
      if (max === was && e.max) continue;
      e.hp = e.hp > 0 ? Math.max(1, Math.round(e.hp / was * max)) : 0; e.max = max;
    }
  }
  /** Everybody downed -> the party wipes. Returns true when it did. */
  checkWipe() {
    const keys = Object.keys(this.members);
    if (!this.active || !keys.length || !keys.every((k) => this.members[k].downed)) return false;
    this.wipe();
    for (const m of Object.values(this.members)) m.invulnerable = this.time + COMBAT.revive.wipeInv;   // a grace: replicas' poses still show the old spot for a moment
    return true;
  }
  /** Back to the current section's start: full HP, Bloom 0, that section's guardians and projectiles reset (earlier sections stay as they are). */
  wipe() {
    const keys = Object.keys(this.members);
    this.run++; this.serial++; this.projectiles = []; this.pprojectiles = []; this.effects = [];
    this.members = Object.fromEntries(keys.map((key) => [key, this.newMember()]));
    this.enemies = buildEnemies(SECTIONS[this.section], keys.length);
    this.cleared = false; this.notes.push({ type: 'wipe' });
  }
  down(key) {
    const m = this.members[key]; if (!m || m.downed) return;
    m.downed = true; m.downAt = this.time; m.revive = 0; m.revivers = {}; m.attack = null; m.dodge = null; m.bloom = 0; m.hp = 0;
    this.notes.push({ type: 'down', key });
  }
  getUp(key, self = false) {
    const m = this.members[key]; if (!m || !m.downed) return;
    m.downed = false; m.revive = 0; m.revivers = {}; m.hp = Math.max(1, Math.round(DUNGEON.hp * COMBAT.revive.hp)); m.invulnerable = this.time + COMBAT.revive.inv;
    m.stunUntil = 0; m.hurt = null; m.combatUntil = this.time;
    this.notes.push({ type: 'revive', key, self });
  }
  /** A reviver's heartbeat (Interact held beside a downed friend). Returns whether it counted. */
  reviveBeat(key, target, positions) {
    const m = this.members[key], t = this.members[target], p = positions[key], q = positions[target], c = COMBAT.revive;
    if (!this.active || !m || !t || key === target || m.downed || !t.downed || !p || !q || this.time < m.stunUntil) return false;
    if (Math.hypot(p.x - q.x, p.z - q.z) > c.radius + 0.4) return false;   // (a little slack: the screens measure from their own bodies)
    (t.revivers ||= {})[key] = this.time; return true;
  }
  /** Per tick: advance / decay revive progress, drop expired or hurt revivers, run the self-revive rule. */
  updateDowned(dt, positions) {
    const c = COMBAT.revive;
    for (const [key, m] of Object.entries(this.members)) {
      if (!m.downed) continue;
      const q = positions[key];
      for (const [by, at] of Object.entries(m.revivers || {})) {
        const r = this.members[by], p = positions[by];
        if (!r || r.downed || !p || !q || this.time - at > c.beat * 2.5 || this.time < r.stunUntil || Math.hypot(p.x - q.x, p.z - q.z) > c.radius + 0.4) delete m.revivers[by];
      }
      const n = Object.keys(m.revivers || {}).length;
      if (n) m.revive = (m.revive || 0) + dt * (1 + 0.5 * (n - 1));
      else m.revive = Math.max(0, (m.revive || 0) - dt * c.decay);
      if (m.revive >= c.hold) { this.getUp(key); continue; }
      if (this.time - m.downAt >= c.selfDelay && q && this.calm(q)) this.getUp(key, true);
    }
  }
  /** No living guardian near `p` and none hunting a living member. */
  calm(p) {
    return !this.enemies.some((e) => e.hp > 0 && (Math.hypot(e.x - p.x, e.z - p.z) < COMBAT.revive.calm
      || (e.aggroUntil || 0) > this.time && this.members[e.target] && !this.members[e.target].downed));
  }
  // Step 55 fields: downed, downAt, revive (seconds of progress), revivers { key: last heartbeat }
  // Step 54 fields: bloom (0..3 pips, a float), dodge { at, air, inv, dx, dz, perfect } + dodgeReady (the cooldown), specialInv (the dash-stab's i-frames)
  newMember() { return { hp: DUNGEON.hp, combatUntil: 0, invulnerable: 0, ready: 0, combo: 0, lastSword: -99, attack: null, stunUntil: 0, hurt: null, bloom: 0, dodge: null, dodgeReady: 0, specialInv: 0, downed: false, downAt: 0, revive: 0, revivers: {} }; }
  leave() { this.active = false; this.open = false; this.progress = 0; this.serial++; this.projectiles = []; this.pprojectiles = []; this.effects = []; }
  inCombat(key, positions) {
    const p = positions[key], m = this.members[key];
    return !!m && (this.time < m.combatUntil || !!p && this.enemies.some((e) => e.hp > 0 && Math.hypot(e.x - p.x, e.z - p.z) < 7 && p.z < DUNGEON.z + DUNGEON.safeZ && dungeonSight(e, p)));
  }
  /** A tap attack, or (charged) the weapon's charged attack. The caller validates the charge hold; here only cooldown / stun / tool. */
  attack(key, kind, facing, positions, charged = false) {
    const m = this.members[key], w = WEAPONS[kind], p = positions[key];
    if (!this.active || !m || m.downed || !w || !p || !inDungeon(p.x, p.z) || !Number.isFinite(facing) || this.time < m.ready || this.time < m.stunUntil) return null;
    if (charged) {
      m.combo = 0; m.lastSword = -99; m.ready = this.time + w.charged.duration; m.combatUntil = this.time + 4;
      m.attack = { at: this.time + w.charged.impact, kind, combo: 0, facing, x: p.x, z: p.z, run: this.run, charged: true };
      return { kind, combo: 0, charged: true };
    }
    const combo = kind === 'sword' && this.time - m.lastSword < 1.1 ? m.combo % 3 : 0;
    m.combo = combo + 1; if (kind === 'sword') m.lastSword = this.time; else m.lastSword = -99;
    m.ready = this.time + w.duration; m.combatUntil = this.time + 4;
    m.attack = { at: this.time + w.impact, kind, combo, facing, x: p.x, z: p.z, run: this.run };
    return { kind, combo };
  }
  eat(key, recipe, positions, consume) {
    const m = this.members[key], heal = foodHealing(recipe);
    if (!this.active || !m || m.downed || m.hp >= DUNGEON.hp || !positions[key] || !inDungeon(positions[key].x, positions[key].z) || this.inCombat(key, positions) || !heal) return false;
    if (!consume(recipe.dish)) return false;
    m.hp = Math.min(DUNGEON.hp, m.hp + heal); return true;
  }
  effect(kind, x, z, type = 'impact') {
    this.effects.push({ id: ++this.nextFX, kind, x, z, type, at: this.time });
  }
  damage(key, amount, kind, positions, origin = null) {
    const m = this.members[key], p = positions[key];
    this.avoided = null;
    if (!m || m.downed || !p || !inDungeon(p.x, p.z) || p.z >= DUNGEON.z + DUNGEON.safeZ || this.time < m.invulnerable) return false;
    // Step 54: the dodge-hop. Ground attacks miss a jumper, anything misses inside the i-frames; a hop started just before the hit is a perfect dodge.
    const av = avoidance(m, kind, this.time);
    if (av) {
      this.avoided = av.why;
      if (av.perfect && m.dodge && !m.dodge.perfect) {
        m.dodge.perfect = true; gainBloom(m, COMBAT.bloom.perfect);
        this.effect('dodge', p.x, p.z, 'perfect'); this.effects.at(-1).key = key;
      }
      return false;
    }
    gainBloom(m, -COMBAT.bloom.onHurt);
    m.hp = Math.max(0, m.hp - amount); m.invulnerable = this.time + 0.9; m.combatUntil = this.time + 3;
    this.effect(kind, p.x, p.z, 'hit');
    const dx = origin ? p.x - origin.x : 0, dz = origin ? p.z - origin.z : -1, length = Math.hypot(dx, dz) || 1;
    m.hurt = { id: this.nextFX, at: this.time, x: dx / length, z: dz / length };
    m.stunUntil = this.time + PLAYER_HITSTUN; m.attack = null;
    // a hurt reviver is interrupted: dropped from every target, whose progress starts over
    for (const t of Object.values(this.members)) if (t.revivers?.[key] !== undefined) { delete t.revivers[key]; if (!Object.keys(t.revivers).length) t.revive = 0; }
    if (!m.hp) { this.down(key); return this.checkWipe(); }
    return false;
  }
  release(e, positions) {
    const kind = e.attackKind || 'hop', spec = GUARDIAN_ATTACKS[kind];
    e.action = kind; e.actionAt = this.time; e.actionFor = kind === 'charge' ? spec.life : 0.5;
    e.cooldown = spec.recovery;
    const aim = e.aim || e, dx = aim.x - e.x, dz = aim.z - e.z, length = Math.hypot(dx, dz) || 1;
    e.facing = Math.atan2(dx, dz);
    this.effect(kind, kind === 'hop' ? aim.x : e.x, kind === 'hop' ? aim.z : e.z);
    this.effects.at(-1).facing = e.facing;
    if (['seed', 'charge', 'wave'].includes(kind)) {
      this.projectiles.push({ id: ++this.nextFX, kind, enemy: e.id, x: e.x, z: e.z, vx: dx / length * (spec.speed || 0), vz: dz / length * (spec.speed || 0), age: 0, radius: 0, hitKeys: [], damage: ENEMY_KINDS[e.kind].damage });
      return false;
    }
    const center = kind === 'hop' ? aim : e;
    for (const key of Object.keys(this.members)) {
      const p = positions[key]; if (!p || this.members[key].downed || Math.hypot(p.x - center.x, p.z - center.z) > spec.radius || !dungeonSight(e, p)) continue;
      if (kind === 'sweep') {
        const distance = Math.hypot(p.x - e.x, p.z - e.z) || 1;
        if (((p.x - e.x) * Math.sin(e.facing) + (p.z - e.z) * Math.cos(e.facing)) / distance < spec.arc) continue;
      }
      if (this.damage(key, ENEMY_KINDS[e.kind].damage, kind, positions, e)) return true;
    }
    return false;
  }
  /** One player hit on a guardian: damage (+50 % on a launched one), stun, nudge away from `from`, and the attacker's Bloom. */
  hitEnemy(key, e, amount, stun, from, push = 0.6) {
    if (e.hp <= 0) return 0;
    const dealt = e.airborne > this.time ? Math.round(amount * (1 + COMBAT.airborneBonus)) : amount;
    e.hp = Math.max(0, e.hp - dealt); e.stun = stun; e.wind = 0; e.cooldown = 0.8;
    const dx = e.x - from.x, dz = e.z - from.z, dist = Math.hypot(dx, dz) || 1;
    const nx = e.x + dx / dist * push, nz = e.z + dz / dist * push;
    if (push && inDungeon(nx, nz, 0.8)) { e.x = nx; e.z = nz; }
    gainBloom(this.members[key], COMBAT.bloom.perHit);
    return dealt;
  }
  /** The farthest point (<= want u) along a yaw that a body of radius 0.45 can reach without touching a wall. */
  reachAlong(p, facing, want) {
    const dx = Math.sin(facing), dz = Math.cos(facing); let at = { x: p.x, z: p.z }, travelled = 0;
    while (travelled < want - 1e-9) {
      const step = Math.min(0.25, want - travelled), next = { x: p.x + dx * (travelled + step), z: p.z + dz * (travelled + step) };
      if (!inDungeon(next.x, next.z, 0.45) || !dungeonSight(at, next, 0.3)) break;
      at = next; travelled += step;
    }
    return { x: at.x, z: at.z, dist: travelled };
  }
  /** Jump: a short low hop plus a dash (the screen moves its own body at once; the host owns the timing and the i-frames). */
  dodge(key, dx, dz, positions) {
    const m = this.members[key], p = positions[key], c = COMBAT.dodge;
    if (!this.active || !m || m.downed || !p || !inDungeon(p.x, p.z) || this.time < m.stunUntil || this.time < (m.dodgeReady || 0)) return null;
    const len = Math.hypot(dx, dz), ok = Number.isFinite(len) && len > 0.2;
    m.dodge = { at: this.time, air: c.air, inv: c.inv, dx: ok ? dx / len : 0, dz: ok ? dz / len : 0, perfect: false };
    m.dodgeReady = this.time + c.air + c.cooldown; m.attack = null; m.combatUntil = this.time + 2;
    return { dx: m.dodge.dx, dz: m.dodge.dz };
  }
  /**
   * Cancel = the weapon special. Spends 1 pip (big: all 3). Instant ones (dash-stab, shockwave) resolve here; the boomerang is a
   * player projectile. Returns the event for the screens ({ kind, big, facing, dist? }) or null.
   */
  special(key, kind, facing, positions, big = false) {
    const m = this.members[key], w = WEAPONS[kind], p = positions[key], s = w?.special;
    if (!this.active || !m || m.downed || !s || !p || !inDungeon(p.x, p.z) || !Number.isFinite(facing) || this.time < m.ready || this.time < m.stunUntil) return null;
    const cost = big ? COMBAT.bloom.max : 1;
    if (bloomPips(m) < cost) return null;
    gainBloom(m, -cost); m.ready = this.time + s.duration; m.combo = 0; m.lastSword = -99; m.attack = null; m.combatUntil = this.time + 4;
    const event = { kind, big, facing, special: true };
    if (kind === 'sword') {
      const end = this.reachAlong(p, facing, big ? s.bigDash : s.dash), time = big ? s.bigTime : s.time;
      event.dist = end.dist; event.time = time; m.specialInv = this.time + time;
      for (const e of this.enemies) {
        if (e.hp > 0 && segmentDistance(e, p, end) <= s.radius + 0.4) this.hitEnemy(key, e, big ? s.bigDamage : s.damage, s.stun, p, 0.5);
      }
      this.effect('dash', p.x, p.z, 'player'); Object.assign(this.effects.at(-1), { facing, size: end.dist });
    } else if (kind === 'axe') {
      for (const turn of big ? [-s.spread, s.spread] : [0]) {
        const yaw = facing + turn;
        this.pprojectiles.push({ id: ++this.nextFX, kind: 'boomerang', owner: key, x: p.x, z: p.z, dx: Math.sin(yaw), dz: Math.cos(yaw), phase: 'out', travelled: 0, age: 0, damage: big ? s.bigDamage : s.damage, hit: [[], []] });
      }
    } else if (kind === 'hammer') {
      const radius = big ? s.bigRadius : s.radius, launch = big ? s.bigLaunch : s.launch;
      for (const e of this.enemies) {
        if (e.hp <= 0 || Math.hypot(e.x - p.x, e.z - p.z) > radius || !dungeonSight(p, e)) continue;
        this.hitEnemy(key, e, big ? s.bigDamage : s.damage, Math.max(s.stun, launch), p, 0.8);
        if (e.hp > 0) { e.airborne = this.time + launch; e.airborneFor = launch; }   // launched AFTER the hit, so the wave itself never gets its own bonus
      }
      this.effect('shockwave', p.x, p.z, 'player'); Object.assign(this.effects.at(-1), { size: radius });
    }
    return event;
  }
  updatePlayerProjectiles(dt, positions) {
    const live = [];
    for (const b of this.pprojectiles) {
      const s = WEAPONS.axe.special, owner = positions[b.owner];
      if (!this.members[b.owner] || !owner) continue;
      b.age += dt; let gone = b.age > 6;
      const steps = Math.max(1, Math.ceil(dt / 0.05));
      for (let i = 0; i < steps && !gone; i++) {
        const h = dt / steps, prev = { x: b.x, z: b.z };
        let dx = b.dx, dz = b.dz;
        if (b.phase === 'back') {
          const tx = owner.x - b.x, tz = owner.z - b.z, d = Math.hypot(tx, tz);
          if (d < 0.8) { gone = true; break; }
          dx = tx / d; dz = tz / d; b.dx = dx; b.dz = dz;
        }
        const next = { x: b.x + dx * s.speed * h, z: b.z + dz * s.speed * h };
        if (!inDungeon(next.x, next.z, 0.2) || !dungeonSight(prev, next, 0.2)) {
          this.effect('boomerang', b.x, b.z, 'blocked');
          if (b.phase === 'out') { b.phase = 'back'; continue; }
          gone = true; break;                           // a returning axe that meets a wall (its owner went round a corner) simply drops
        }
        b.x = next.x; b.z = next.z;
        if (b.phase === 'out') { b.travelled += s.speed * h; if (b.travelled >= s.range) b.phase = 'back'; }
        const list = b.hit[b.phase === 'out' ? 0 : 1];
        for (const e of this.enemies) {
          if (e.hp <= 0 || list.includes(e.id) || segmentDistance(e, prev, b) > s.radius + 0.35) continue;
          list.push(e.id); this.hitEnemy(b.owner, e, b.damage, s.stun, prev, 0.4);
        }
      }
      if (!gone) live.push(b);
    }
    this.pprojectiles = live;
  }
  updateProjectiles(dt, positions) {
    const live = [];
    for (const a of this.projectiles) {
      const spec = GUARDIAN_ATTACKS[a.kind], enemy = this.enemies.find((e) => e.id === a.enemy);
      if (a.kind === 'charge' && (!enemy || enemy.hp <= 0 || enemy.stun > 0 || enemy.airborne > this.time)) continue;
      let ended = false;
      const remaining = Math.min(dt, Math.max(0, spec.life - a.age)), steps = Math.max(1, Math.ceil(remaining / 0.05));
      for (let i = 0; i < steps && !ended; i++) {
        const h = remaining / steps, prev = { x: a.x, z: a.z }, oldRadius = a.radius;
        a.age += h;
        if (a.kind === 'wave') a.radius = spec.radius * a.age / spec.life;
        else {
          const next = { x: a.x + a.vx * h, z: a.z + a.vz * h }, clearance = a.kind === 'charge' ? 0.8 : 0.2;
          if (next.z >= DUNGEON.z + DUNGEON.safeZ || !inDungeon(next.x, next.z, clearance) || !dungeonSight(prev, next, clearance)) { this.effect(a.kind, a.x, a.z, 'blocked'); ended = true; continue; }
          a.x = next.x; a.z = next.z;
          if (a.kind === 'charge') { enemy.x = a.x; enemy.z = a.z; }
        }
        for (const key of Object.keys(this.members)) {
          const p = positions[key]; if (!p || this.members[key].downed || !dungeonSight(a, p)) continue;
          const distance = Math.hypot(p.x - a.x, p.z - a.z);
          const hit = a.kind === 'wave' ? distance >= Math.max(0, oldRadius - 0.3) && distance <= a.radius + 0.3 : segmentDistance(p, prev, a) <= spec.radius;
          if (!hit || p.z >= DUNGEON.z + DUNGEON.safeZ || a.hitKeys?.includes(key)) continue;
          (a.hitKeys ||= []).push(key);
          if (this.damage(key, a.damage, a.kind, positions, a.kind === 'wave' ? a : prev)) return true;
          if (a.kind === 'seed' && this.avoided !== 'dodge' && this.avoided !== 'special') { this.effect('seed', a.x, a.z); ended = true; break; }   // (a seed passes through a perfect dodger)
        }
      }
      if (!ended && a.age < spec.life) live.push(a);
    }
    this.projectiles = live; return false;
  }
  update(dt, positions) {
    this.time += dt; if (!this.active) return null;
    for (const [key, m] of Object.entries(this.members)) {
      const a = m.attack; if (!a || a.at > this.time || m.downed) continue;
      m.attack = null; const p = positions[key];
      if (!p || !inDungeon(p.x, p.z) || Math.hypot(p.x - a.x, p.z - a.z) > 3) continue;
      const w = a.charged ? WEAPONS[a.kind].charged : WEAPONS[a.kind];
      if (a.charged) { this.effect(w.shape, p.x, p.z, 'player'); Object.assign(this.effects.at(-1), { facing: a.facing, size: w.range }); }
      for (const e of this.enemies) {
        const dx = e.x - p.x, dz = e.z - p.z, dist = Math.hypot(dx, dz);
        // (arc -1 = every direction: the spin and the pound ring)
        if (e.hp <= 0 || dist > w.range || !dungeonSight(p, e) || dist > 0.1 && (dx * Math.sin(a.facing) + dz * Math.cos(a.facing)) / dist < w.arc) continue;
        this.hitEnemy(key, e, a.charged ? w.damage : w.damage[a.combo], w.stun, p, w.push ?? 0.6);
      }
    }
    this.updatePlayerProjectiles(dt, positions);
    this.effects = this.effects.filter((fx) => this.time - fx.at < 1.2);
    if (this.updateProjectiles(dt, positions)) return 'wipe';
    this.updateDowned(dt, positions);
    if (this.checkWipe()) return 'wipe';
    const fields = new Map();
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      e.stun = Math.max(0, e.stun - dt); e.cooldown = Math.max(0, e.cooldown - dt);
      if (e.airborne > this.time) { e.wind = 0; continue; }   // launched by the hammer shockwave: can neither move nor attack until it lands
      if (e.stun > 0 || this.projectiles.some((a) => a.kind === 'charge' && a.enemy === e.id)) continue;
      const candidates = Object.keys(this.members).filter((k) => !this.members[k].downed && positions[k] && inDungeon(positions[k].x, positions[k].z) && positions[k].z < DUNGEON.z + DUNGEON.safeZ);
      const visible = candidates.filter((k) => Math.hypot(e.x - positions[k].x, e.z - positions[k].z) < 8 && dungeonSight(e, positions[k]));
      const key = visible.sort((a, b) => Math.hypot(e.x - positions[a].x, e.z - positions[a].z) - Math.hypot(e.x - positions[b].x, e.z - positions[b].z))[0]
        || (candidates.includes(e.target) && (e.aggroUntil || 0) > this.time ? e.target : null);
      const p = positions[key]; if (!p) { e.wind = 0; continue; }
      const dist = Math.hypot(e.x - p.x, e.z - p.z), m = this.members[key];
      if (visible.includes(key)) { if (!e.wind) e.target = key; e.aggroUntil = this.time + 5; }
      m.combatUntil = this.time + 3;
      if (e.wind > 0) {
        e.wind -= dt;
        if (e.wind <= 0 && this.release(e, positions)) return 'wipe';
      } else if (dist < GUARDIAN_ATTACKS[guardianAttack(e.kind, dist)].range && !e.cooldown && dungeonSight(e, p)) {
        e.attackKind = guardianAttack(e.kind, dist); e.wind = GUARDIAN_ATTACKS[e.attackKind].wind;
        e.target = key; e.aim = { x: p.x, z: p.z }; e.facing = Math.atan2(p.x - e.x, p.z - e.z);
      }
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
  snapshot() { return JSON.parse(JSON.stringify({ time: this.time, progress: this.progress, open: this.open, active: this.active, serial: this.serial, run: this.run, members: this.members, enemies: this.enemies, projectiles: this.projectiles, pprojectiles: this.pprojectiles, effects: this.effects, nextFX: this.nextFX, cleared: this.cleared, section: this.section })); }
  load(s) { Object.assign(this, s); }
}
