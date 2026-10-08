// Combat core rules (Step 54): pure helpers shared by the host's DungeonRun and the screens. No rendering, no dungeon geometry
// (dungeonLogic.js passes its own wall tests in). Everything is Node-tested in test/combat.test.js.
//
//   GROUND_ATTACKS                      guardian attacks a hop clears (the others, seed and charge, still hit a jumper)
//   dodgeState(member, time)            -> { airborne, invulnerable, age } for the member's recorded dodge-hop
//   avoidance(member, kind, time)       -> null | { why: 'dodge' | 'air' | 'special', perfect } : does a hit of this kind miss right now?
//   gainBloom(member, amount)           change the 0..3 meter (rounded so 25 x 0.12 lands exactly on a pip)
//   bloomPips(member)                   whole pips available (0..3)
//   autoAim(from, facing, enemies, reach, opts)  soft aim: the facing snapped to the nearest living, visible enemy inside the cone
//
// How the host judges "airborne": never from a body's raw y (screens move locally and y is only cosmetic). The member's recorded
// dodge `{ at, air, inv }` is the truth: airborne = time in [at, at + air), invulnerable = time in [at, at + inv).
import { COMBAT } from '../config.js';

/** Feedback tier only. Flags are resolved by the authority; this never changes a hit. */
export function impactTier(move = 'tap', flags = [], kind = '') {
  if (flags.includes('finish')) return 4;
  if (flags.some((f) => ['big', 'shatter', 'crack', 'launch', 'plunge'].includes(f))) return 3;
  if (move === 'charged' || flags.includes('finisher') || flags.includes('air') || move === 'special' && kind !== 'boomerang') return 2;
  return 1;
}

// (Step 57: the radish's ring, the cabbage's slap, the walnut's tackle and the Patchkeeper's rolling charge are all low to the ground, so a dodge-hop clears them)
export const GROUND_ATTACKS = new Set(['hop', 'stomp', 'sweep', 'wave', 'ring', 'slap', 'tackle', 'roll', 'quake', 'flop', 'burn']);   // (Step 60: the toad's belly-flop is a ground ring and a burning patch is on the floor, so a dodge-hop clears both; its tongue lash, fireballs and lava blobs are not)   // (Step 59: the Snow Golem's quake is a ground ring too; the bat's dive, the frost cone, snowballs and falling icicles are NOT: a hop does not clear them)

export function dodgeState(m, time) {
  const d = m?.dodge;
  if (!d) return { airborne: false, invulnerable: false, age: -1 };
  const age = time - d.at;
  return { airborne: age >= 0 && age < d.air, invulnerable: age >= 0 && age < d.inv, age };
}

/** Does a hit of `kind` miss this member right now? Returns why (and whether it counts as a perfect dodge), or null. */
export function avoidance(m, kind, time) {
  const s = dodgeState(m, time);
  if (s.invulnerable) return { why: 'dodge', perfect: s.age <= COMBAT.dodge.perfect };
  if (s.airborne && GROUND_ATTACKS.has(kind)) return { why: 'air', perfect: false };
  if (time < (m?.specialInv || 0)) return { why: 'special', perfect: false };
  return null;
}

export const bloomPips = (m) => Math.floor(Math.max(0, Math.min(COMBAT.bloom.max, m?.bloom || 0)) + 1e-6);
export function gainBloom(m, amount) {
  if (!m) return 0;
  m.bloom = Math.round(Math.max(0, Math.min(COMBAT.bloom.max, (m.bloom || 0) + amount)) * 1e4) / 1e4;
  return m.bloom;
}

const angleDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
/**
 * Soft auto-aim. `facing` is a yaw (atan2(dx, dz)). Picks the nearest living enemy whose centre lies within `reach` + `reachBonus` u and
 * within `cone` degrees of the facing, and (when given) is visible through `opts.sight(from, enemy)`. Returns the aimed yaw, or the
 * original facing when nothing qualifies.
 */
export function autoAim(from, facing, enemies, reach, opts = {}) {
  const cone = (opts.cone ?? COMBAT.aim.cone) * Math.PI / 180, max = reach + (opts.reachBonus ?? COMBAT.aim.reachBonus);
  let best = null, bestDist = Infinity;
  for (const e of enemies || []) {
    if (!(e.hp > 0)) continue;
    const dx = e.x - from.x, dz = e.z - from.z, dist = Math.hypot(dx, dz);
    if (dist > max || dist < 0.05 || angleDiff(Math.atan2(dx, dz), facing) > cone) continue;
    if (opts.sight && !opts.sight(from, e)) continue;
    if (dist < bestDist) { best = e; bestDist = dist; }
  }
  return best ? Math.atan2(best.x - from.x, best.z - from.z) : facing;
}
