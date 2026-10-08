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
//   * Step 56 (areas): `this.area` / `this.g` = the current area (game/areaLogic.js) and its grid (every wall / sight / navigation call goes through it),
//     `this.section` indexes its sections, `this.obj` is the section's objective state (game/objectives.js, host-ticked, in the snapshot). Completing an objective
//     opens that section's gate and moves on (`update` returns 'section'), or on the last section returns 'cleared'. A wipe restarts the CURRENT section.
//   * Step 57 (the Wildroot rework): safe zones are per SECTION (`section.safe` shapes, areaLogic.js `inSafe`; `isSafe(x, z, pad)` here), practice dummies (`practice` kinds: infinite HP,
//     a wobble + the hit number, they feed the `train` objective's moves through `noteMove`; the wave dummy's harmless wave tells a hop apart from a miss), the walnut's ARMOR
//     (damage x `armor` until an `armorBreak` hit cracks it), the cabbage's front SHIELD (`guarded`: hits from within COMBAT.shield.arc of its facing do x COMBAT.shield.mult
//     unless it is stunned / launched or the move `pierce`s), the Patchkeeper's phase 2 (`enterPhase2`: a roar, vine adds, the rolling charge that bounces off the arena
//     wall once) and the new guardian attacks `ring` / `slap` / `tackle` / `roll` / `dummywave`.
//   * Step 58 (charms): each member may hold ONE charm besides the weapon (`m.charm` id, `m.charmReady` host time; kept through a wipe, session-only). `castCharm` runs the
//     charm's `cast` (game/charms.js) on the host's clock; `pedestals` ({ id, x, z, charm, rack, section }, world coords) hold the Armory rack + each section's own, `swapCharm`
//     exchanges at one. All of it is in the snapshot; `start(keys, { armory })` builds the rack from the island's Armory.
//   * Step 59 (Glimmerfrost Caves): STATUSES on guardians (`e.frozen` / `e.chilled` host times): a FROZEN guardian cannot move or act, and a charged hit or a special on it SHATTERS it
//     (x COMBAT.frost.shatter, the freeze ends, shells / ice armor crack); `freezeEnemy` is Frost Nova's tool. FLYERS (the icicle bat, `flyer`) hover out of melee reach: only ranged things
//     (`opts.ranged`: slingshot pebbles, charms, the boomerang, the hammer shockwave) hit them, plus melee while `exposed` (winding up / diving / low after the dive / stunned / frozen).
//     ICE BLOCKS (`block` kinds, the Snowfield's frozen friends) break after COMBAT.rescue.hits hits from ANY source (`rescue` objective). Falling ICICLES (`section.icicles`,
//     `this.hazards`) are telegraphed circles that hit from above: a dodge-hop does not clear them, the i-frames do. The SLINGSHOT's pebbles are `pprojectiles` of kind 'pebble'
//     (tap, piercing charged shot, special scatter); they stop at walls, pop thrown snowballs and may pierce. The Snow Golem's second phase wears ICE ARMOR (`e.iceArmor`).
//     `m.chillUntil` slows a member (the frostcap's cone; screens apply COMBAT.frost.chillSlow).
//   * Step 60 (Cinder Tubes): REACTIONS (game/reactions.js: WET / BURNING / FROST statuses on guardians that combine into douse, frozen solid, steam and "Cool it!"; `hurtEnemy` = damage that
//     is not a player hit: burning ticks and steam), the WATERING CAN (spray / jet / rain cloud: `clouds` heal friends under them and wet guardians), EMBER SEED bursts and the Magma Toad's lava
//     blobs (`bursts`, pending impacts) leaving burning PATCHES (`patches`), the `burn` / `defend` / `hunt` objectives (a guardian walks to the defended sapling when no member is in sight and
//     hurts it through `hurtSapling`; a lost sapling resets the section like a wipe), chief modifiers (`fast` / `shield` / `split`), the toad's magma SHELL (`e.shell` 'magma' | 'stone'),
//     BLINDED guardians (`e.blind`) and LEDGES: a shove (`shove`) that crosses a cliff drops a guardian a tier (game/areaLogic.js "HEIGHT BANDS"). Movement uses `g.reach` (cliffs are walls),
//     sight and attacks use `g.sight` (height never blocks them).
//   * `notes` (not saved) queues { type: 'down' | 'revive' | 'wipe', key, self? } for the sync layer's toasts (`drainNotes()`).
import { PLAYER_HITSTUN, COMBAT } from '../config.js';
import { avoidance, gainBloom, bloomPips, dodgeState, impactTier } from './combatLogic.js';
import { AREAS, areaSectionStart, inSafe } from './areaLogic.js';
import { initObjective, tickObjective, lightBrazier, trainMove, freezeWater, burnBrambles, TRAIN_MOVES } from './objectives.js';
import { applyStatus, tickStatuses, REACTION_LIST } from './reactions.js';
import { ROOMS, SPAWNS } from './areas/wildroot.js';
import { CHARMS, charmInfo, rackPedestals, partyPedestals, swapAtPedestal } from './charms.js';
import { CHARM, REACTIONS as REACT } from '../config.js';
export const DUNGEON = { x: 1200, z: 1000, y: 8, hp: 100 };
export const STONE_CODE = [1, 1, 1, 3];
// Step 56: the grid, clearance, sight and navigation live in areaLogic.js (one grid per area, built from the area's sections' floor shapes). The names below
// are Wildroot's, kept so the rest of the game and the older tests keep working; DungeonRun itself uses its CURRENT area's grid (`this.g`).
export { ROOMS, SPAWNS };
export { TILE_SIZE } from './areaLogic.js';
const WILD = AREAS.wildroot, WILD_GRID = WILD.grid;
export const DUNGEON_TILES = WILD_GRID.allTiles;
export const DUNGEON_WALLS = WILD_GRID.allWalls;
export const inDungeon = (x, z, pad = 0) => WILD_GRID.inArea(x, z, pad);
export const dungeonSight = (a, b, pad = 0.12) => WILD_GRID.sight(a, b, pad);
export const dungeonDistanceField = (goal) => WILD_GRID.field(goal);
export const dungeonWaypoint = (from, goal, field) => WILD_GRID.waypoint(from, goal, field);
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
    special: { name: 'Dash-stab', pierce: true, duration: 0.5, dash: 4.5, bigDash: 7, time: 0.26, bigTime: 0.34, radius: 1.1, damage: 24, bigDamage: 44, stun: 0.6, keys: [[-0.2, 0.2, -0.3, 0.25], [-1.55, 0.1, 0.5, 0.3]] } },
  axe: { duration: 0.72, impact: 0.34, range: 3.3, arc: -0.15, damage: [29], stun: 0.5,
    keys: [[-2.2, -1.1, -0.65, -0.12], [0.55, 1.2, 0.7, 0.22]],
    // overhead chop: narrow and long, big damage, extra stun; armorBreak is the flag for the later armoured guardians
    charged: { shape: 'chop', charge: 0.7, duration: 1, impact: 0.5, range: 4.6, arc: 0.88, damage: 58, stun: 1.1, push: 0.9, armorBreak: true, keys: [[-3.0, -0.6, -0.2, -0.2], [0.9, 0.2, 0.15, 0.4]] },
    special: { name: 'Boomerang', duration: 0.55, range: 6, speed: 12, radius: 0.9, damage: 36, bigDamage: 50, stun: 0.4, spread: 0.38, keys: [[-2.4, -1.4, -0.8, -0.1], [0.5, 0.8, 1.0, 0.18]] } },
  hammer: { duration: 1.08, impact: 0.52, range: 2.8, arc: 0.15, damage: [44], stun: 1.3,
    keys: [[-2.8, -0.25, 0, -0.2], [0.9, -0.1, 0.05, 0.38]],
    charged: { shape: 'pound', charge: 0.9, duration: 1.3, impact: 0.62, range: 3, arc: -1, damage: 64, stun: 2.2, push: 0.8, armorBreak: true, keys: [[-3.1, -0.2, 0, -0.25], [1.1, -0.1, 0.05, 0.45]] },
    special: { name: 'Shockwave', armorBreak: true, pierce: true, duration: 0.85, radius: 3.8, bigRadius: 5.5, damage: 70, bigDamage: 120, stun: 1, launch: 0.9, bigLaunch: 1.4, keys: [[-3.0, -0.2, 0, -0.25], [1.1, -0.1, 0.05, 0.45]] },
  },
  // Step 59: the RANGED weapon. Tap = one pebble (fast, light, stops at the first guardian); hold = a piercing shot (passes through everything in its line, hits harder); Cancel = a seed scatter
  // (5 pellets in a fan, 7 and wider with a full Bloom meter). Every pebble stops at walls and carries `ranged` (flyers cannot dodge them by hovering); `range` in u.
  slingshot: { duration: 0.42, impact: 0.12, range: 9, arc: 0, damage: [10], stun: 0.15, ranged: true,
    keys: [[-0.6, -0.2, 0, -0.1], [-1.35, 0.1, 0.05, 0.12]],
    charged: { shape: 'pierce', charge: 0.6, duration: 0.7, impact: 0.2, range: 11, arc: 0, damage: 30, stun: 0.5, push: 0.6, pierce: true, keys: [[-0.4, -0.3, 0, -0.1], [-1.5, 0.15, 0.05, 0.2]] },
    special: { name: 'Seed scatter', duration: 0.6, range: 7, pellets: 5, bigPellets: 7, spread: 0.9, bigSpread: 1.3, damage: 11, bigDamage: 16, stun: 0.3, keys: [[-0.5, -0.3, 0, -0.1], [-1.5, 0.1, 0.05, 0.15]] } },
  // Step 60: the SUPPORT weapon. Light damage; its worth is what it does to a guardian: the tap is a short spray cone that knocks back (off ledges, too) and makes guardians WET, the hold a long
  // narrow jet with more knock-back, Cancel puts a RAIN CLOUD ahead for `life` s (the big one is wider and lasts longer): friends under it heal COMBAT.water.cloudHeal HP per cloudTick s (never above
  // their max, never a downed friend), guardians under it get wet, burning patches go out. Water counts as ranged (it reaches a hovering bat).
  'watering-can': { duration: 0.45, impact: 0.15, range: 3.2, arc: 0.55, damage: [5], stun: 0.25, push: 1.5, spray: true,
    keys: [[-0.9, -0.3, 0, -0.1], [-1.55, 0.2, 0.1, 0.2]],
    charged: { shape: 'jet', charge: 0.55, duration: 0.8, impact: 0.2, range: 6.2, arc: 0.93, damage: 12, stun: 0.45, push: 2.6, spray: true, keys: [[-0.8, -0.3, 0, -0.1], [-1.65, 0.3, 0.1, 0.25]] },
    special: { name: 'Rain cloud', duration: 0.6, range: 5, bigRange: 6, radius: 2.6, bigRadius: 3.4, life: 6, bigLife: 9, keys: [[-0.7, -0.3, 0, -0.1], [-1.7, 0.2, 0.1, 0.2]] } },
};
export const ENEMY_KINDS = {
  berry: { name: 'Brambleberry', hp: 38, speed: 2.3, damage: 9, color: '#ce729f', shape: 'fruit' },
  carrot: { name: 'Karate Carrot', hp: 52, speed: 1.8, damage: 12, color: '#f5ab68', shape: 'carrot' },
  turnip: { name: 'Turnip Tough', hp: 66, speed: 1.3, damage: 15, color: '#dbc3e8', shape: 'root' },
  sprout: { name: 'Snap Sprout', hp: 44, speed: 2, damage: 10, color: '#95c982', shape: 'plant' },
  pumpkin: { name: 'Pumpkin Patchkeeper', hp: 360, speed: 1.1, damage: 20, color: '#efbc7e', shape: 'pumpkin', boss: true, phase2: true },
  // Step 57: the gardens' ground-wave enemy, the halls' armored mini-boss, the ramparts' front-shielded guard and the bailey's practice dummies
  radish: { name: 'Rumble Radish', hp: 48, speed: 1.6, damage: 11, color: '#e8718c', shape: 'radish' },
  walnut: { name: 'Walnut Warden', hp: 160, speed: 0.9, damage: 18, color: '#a9774a', shape: 'walnut', armor: 0.35, mini: true },
  cabbage: { name: 'Cabbage Guard', hp: 70, speed: 1.5, damage: 12, color: '#9ed27f', shape: 'cabbage', shield: true },
  dummy: { name: 'Practice Dummy', hp: 100, speed: 0, damage: 0, color: '#d9b27a', shape: 'dummy', practice: true },
  wavedummy: { name: 'Wave Dummy', hp: 100, speed: 0, damage: 0, color: '#8fd6c8', shape: 'dummy', practice: true },
  // Step 59 (Glimmerfrost Caves): the snow puff (slow, rolls into you), the icicle bat (a FLYER: only ranged things hit it while it hovers), the frostcap mushroom mini-boss (a frost cone that
  // slows; its cap is armor until shattered), the Snow Golem (boss; ice armor in phase 2) and the two ice blocks (the Snowfield's frozen friends: NOT enemies, objective targets that every
  // hit cracks; `fixed` = their HP is the number of hits and never party-scaled)
  puff: { name: 'Snow Puff', hp: 40, speed: 1.2, damage: 10, color: '#eaf4ff', shape: 'puff' },
  bat: { name: 'Icicle Bat', hp: 32, speed: 3.4, damage: 9, color: '#a7d8ff', shape: 'bat', flyer: true },
  frostcap: { name: 'Frostcap', hp: 170, speed: 0.95, damage: 12, color: '#9fd3f0', shape: 'frostcap', mini: true, armor: 0.4 },
  golem: { name: 'Snow Golem', hp: 460, speed: 0.9, damage: 20, color: '#f2f8ff', shape: 'golem', boss: true, phase2: true, iceArmor: true },
  hareblock: { name: 'Ice Block (snow hare)', hp: COMBAT.rescue.hits, speed: 0, damage: 0, color: '#bfe6ff', shape: 'iceblock', block: true, fixed: true, friend: 'hare' },
  chickblock: { name: 'Ice Block (snow chick)', hp: COMBAT.rescue.hits, speed: 0, damage: 0, color: '#bfe6ff', shape: 'iceblock', block: true, fixed: true, friend: 'chick' },
  // Step 60 (Cinder Tubes): the pepper imp (small, lobs fireballs from range: `hold` = how close it comes, `aggro` = how far it notices a friend), the coconut crab (a front shield like the cabbage's),
  // the lava slug (leaves a burning trail), the Pepper Chiefs (three named hunt targets; a `chief` modifier from the spawn flags: fast / shield / split), their little peppers and the Magma Toad
  // (boss; its second phase wears a magma SHELL that only wet + frost cools into breakable stone)
  imp: { name: 'Pepper Imp', hp: 34, speed: 2.2, damage: 8, color: '#e8452c', shape: 'imp', hold: 5, aggro: 11 },
  crab: { name: 'Coconut Crab', hp: 72, speed: 1.5, damage: 11, color: '#9a6b43', shape: 'crab', shield: true },
  slug: { name: 'Lava Slug', hp: 56, speed: 1.4, damage: 9, color: '#ff8a3d', shape: 'slug', trail: true },
  chief: { name: 'Pepper Chief', hp: 150, speed: 1.6, damage: 14, color: '#d8392b', shape: 'chief', mini: true },
  pepperling: { name: 'Little Pepper', hp: 24, speed: 2.5, damage: 7, color: '#ef6a3a', shape: 'pepperling' },
  toad: { name: 'Magma Toad', hp: 520, speed: 0.9, damage: 18, color: '#7a8b4a', shape: 'toad', boss: true, phase2: true, shell: true },
};
// Attack footprints are shared with the warning/impact renderer.
export const GUARDIAN_ATTACKS = {
  hop: { wind: 0.75, range: 1.8, radius: 1.65, recovery: 1.3 },
  seed: { wind: 0.95, range: 7, speed: 5.5, radius: 0.65, life: 2.2, recovery: 2.1 },
  charge: { wind: 0.85, range: 4.8, speed: 8, radius: 0.95, life: 0.6, recovery: 1.8 },
  stomp: { wind: 1.05, range: 2.5, radius: 2.5, recovery: 2 },
  sweep: { wind: 0.65, range: 2.5, radius: 2.6, arc: 0.3, recovery: 1.4 },
  wave: { wind: 1.25, range: 4.8, radius: 4.8, life: 1.2, recovery: 2.6 },
  // Step 57: ring = the radish's small ground wave (hop it), slap = the cabbage's leaf slap (front arc), tackle = the walnut's slow roll, roll = the Patchkeeper's phase-2
  // rolling charge across the arena (bounces off the wall once), dummywave = the wave dummy's harmless wave (no damage: it only shows who hopped it)
  ring: { wind: 1, range: 3, radius: 4.4, life: 1, recovery: 2.6 },
  slap: { wind: 0.7, range: 2.3, radius: 2.5, arc: 0.5, recovery: 1.5 },
  tackle: { wind: 1.1, range: 5.5, speed: 5.5, radius: 1.15, life: 0.95, recovery: 2.6 },
  roll: { wind: 1.2, range: 16, speed: 9.5, radius: 1.5, life: 2.8, recovery: 2.2 },
  dummywave: { wind: 0.9, range: 14, radius: 4.4, life: 1.5, recovery: 3 },
  // Step 59: dive = the icicle bat's swoop (a rider like the carrot's charge; the bat is low and hittable for a moment afterwards), frostcone = the frostcap's frost spray (a cone that
  // chills), quake = the Snow Golem's big slow stomp (a ground ring: hop it), snowball = its thrown snowball (a seed-like missile: sidestep it, or shoot it down with a pebble)
  dive: { wind: 0.9, range: 6.5, speed: 10.5, radius: 0.9, life: 0.55, recovery: 3.2 },
  frostcone: { wind: 1.1, range: 5.2, radius: 5.2, arc: 0.55, recovery: 3.4 },
  quake: { wind: 1.4, range: 4.8, radius: 5.8, life: 1.3, recovery: 2.8 },
  snowball: { wind: 0.95, range: 9, speed: 6.5, radius: 0.8, life: 2.2, recovery: 2.4 },
  // Step 60: fireball = the pepper imp's fireball (a seed-like missile), lash = the Magma Toad's tongue (an instant lane in front of it), flop = its belly-flop (a ground ring: hop it),
  // spit = its lava blob (a lob: a telegraphed circle lands `flight` s later and leaves a burning patch; hopping does not clear it, the dodge's i-frames do)
  fireball: { wind: 0.9, range: 9.5, speed: 6.4, radius: 0.7, life: 1.9, recovery: 2.3 },
  lash: { wind: 0.95, range: 6.2, radius: 0.95, recovery: 2.4 },
  flop: { wind: 1.3, range: 4.6, radius: 5.4, life: 1.3, recovery: 2.5 },
  spit: { wind: 1.1, range: 9, radius: 1.3, recovery: 2.6, flight: 0.9 },
};
export const PROJECTILE_KINDS = ['seed', 'charge', 'wave', 'ring', 'dummywave', 'tackle', 'roll', 'dive', 'quake', 'snowball', 'fireball', 'flop'];
const RINGS = ['wave', 'ring', 'dummywave', 'quake', 'flop'];   // projectiles that are a ring growing from the attacker
const MISSILES = ['seed', 'snowball', 'fireball'];               // missiles that burst on the first member they hit (a perfect dodge lets them fly on)
const RIDERS = ['charge', 'tackle', 'roll', 'dive'];    // projectiles that ARE the attacker moving
/** Which attack a guardian starts at `distance` (`e` = the guardian: the Patchkeeper's phase 2 alternates its wave with the rolling charge). */
export function guardianAttack(kind, distance, e = null) {
  if (kind === 'pumpkin') return e?.phase2 && (e.attacks || 0) % 2 === 1 ? 'roll' : 'wave';
  if (kind === 'golem') return e?.phase2 && (e.attacks || 0) % 2 === 1 || distance > 4.6 ? 'snowball' : 'quake';       // (it throws from afar, quakes up close; phase 2 alternates)
  if (kind === 'toad') return distance > 6.4 ? 'spit' : (e?.attacks || 0) % 2 === 1 ? 'flop' : 'lash';             // (Step 60: lava blobs from afar, its tongue and its belly-flop up close)
  if (kind === 'chief') return e?.chief === 'fast' ? 'charge' : 'stomp';
  return kind === 'berry' ? (distance > 2.3 ? 'seed' : 'hop') : ({ carrot: 'charge', turnip: 'stomp', sprout: 'sweep', radish: 'ring', walnut: 'tackle', cabbage: 'slap', wavedummy: 'dummywave', puff: 'tackle', bat: 'dive', frostcap: 'frostcone', imp: 'fireball', crab: 'slap', slug: 'hop', pepperling: 'hop' })[kind];
}
export function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, n = dx * dx + dz * dz;
  const u = n ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / n)) : 0;
  return Math.hypot(p.x - a.x - u * dx, p.z - a.z - u * dz);
}
// Sections (areaLogic.js): each is a start point (where a wipe returns the party; players fan out `step` apart by slot), its guardians, a floor and an objective.
// Wildroot has one. `sectionStart(section, slot, area)` defaults to Wildroot.
export const SECTIONS = WILD.sections;
export const sectionStart = (section, slot = 0, area = WILD) => areaSectionStart(area, section, slot);
export const partyScale = (n) => COMBAT.scale.hp[Math.max(0, Math.min(COMBAT.scale.hp.length, n) - 1)] || 1;
/**
 * A section's guardians for a party of `n`: the base spawns plus each spawn's `extra[n - 1]` copies beside it. A spawn is `[kind, x, z, extra?, flags?]`
 * (local to `origin`; flags `{ boss }`, a kind's own `boss` is the default). `first` / `wave` serve a light brazier's wave (ids continue, enemies are tagged).
 */
export function buildEnemies(section, n = 1, origin = DUNGEON, { spawns = section?.enemies || SPAWNS, first = 0, wave } = {}) {
  const list = [], scale = partyScale(n);
  const make = (kind, x, z, flags) => {
    const e = { id: first + list.length, kind, x: origin.x + x, z: origin.z + z, hp: 0, max: 0, wind: 0, cooldown: 0, stun: 0, target: null, aim: null };
    if (flags?.boss ?? ENEMY_KINDS[kind].boss) e.boss = true;
    if (flags?.chief) { e.chief = flags.chief; e.name = flags.name || 'Chief'; }             // (Step 60: a hunt target and its modifier: fast / shield / split)
    if (ENEMY_KINDS[kind].block) { e.block = true; e.friend = ENEMY_KINDS[kind].friend; }
    if (wave !== undefined) e.wave = wave;
    return e;
  };
  for (const [kind, x, z, , flags] of spawns) list.push(make(kind, x, z, flags));
  for (const [kind, x, z, extra, flags] of spawns) for (let i = 0; i < (extra?.[Math.max(0, Math.min(3, n - 1))] || 0); i++) list.push(make(kind, x + 1.2 * (i + 1), z, flags));
  for (const e of list) e.max = e.hp = ENEMY_KINDS[e.kind].fixed ? ENEMY_KINDS[e.kind].hp : Math.round(ENEMY_KINDS[e.kind].hp * scale);
  return list;
}
export const foodHealing = (recipe) => ({ home: 25, frost: 45, ember: 65 })[recipe?.island] || 0;
export class DungeonRun {
  constructor() { this.time = 0; this.progress = 0; this.open = false; this.active = false; this.serial = 0; this.run = 0; this.members = {}; this.enemies = []; this.projectiles = []; this.pprojectiles = []; this.effects = []; this.nextFX = 0; this.cleared = false; this.avoided = null; this.pedestals = []; this.hazards = []; this.hazardNext = 0; this.hazardCount = 0; this.section = 0; this.notes = []; this.patches = []; this.clouds = []; this.bursts = []; this.found = new Set(); this.reactionLog = {}; this.setArea('wildroot'); this.mode = 'wild'; this.from = 'ritual'; this.obj = null; }
  strike(stone) { if (this.active) return false; if (this.open) return true; this.progress = stoneProgress(this.progress, stone); this.open = this.progress === 4; return this.open; }
  // ---- Step 56: the current area (areaLogic.js). `g` is its grid, ONE per area shared with terrain.js (which is what stops a player at a wall, so a closed gate
  // must be a wall there too): the run opens / closes its gates (`start`, `completeSection`, `load`).
  setArea(id) {
    this.area = AREAS[id] || AREAS.wildroot; this.areaId = this.area.id; this.g = this.area.grid;
  }
  /** Step 57: is (x, z) inside one of the area's safe shapes (each section's start: the bailey yard, the checkpoint shrines), grown by `pad` u? */
  isSafe(x, z, pad = 0) { return inSafe(this.area, x, z, pad); }
  get sectionDef() { return this.area.sections[this.section] || this.area.sections[0]; }
  /** The current section's guardians for the roster, plus its fresh objective state. */
  buildSection() {
    this.enemies = buildEnemies(this.sectionDef, Object.keys(this.members).length || 1, this.area.origin);
    this.hazards = []; this.hazardNext = this.time + 3;                   // (Step 59: a section's falling icicles start over with it)
    this.patches = []; this.clouds = []; this.bursts = [];                // (Step 60: and its fires, rain clouds and pending impacts)
    this.obj = initObjective(this.sectionDef.objective, this.objCtx({}));
  }
  objCtx(positions) {
    return { time: this.time, origin: this.area.origin, enemies: this.enemies, members: this.members, positions, def: this.sectionDef.objective,
      spawn: (tuples, wave) => this.spawnWave(tuples, wave), effect: (kind, x, z, type) => this.effect(kind, x, z, type) };
  }
  /** A brazier's wave: new guardians (ids continue, tagged with the brazier index), scaled for the party. */
  spawnWave(tuples, wave) {
    const first = this.enemies.reduce((m, e) => Math.max(m, e.id + 1), 0);
    this.enemies.push(...buildEnemies(this.sectionDef, Object.keys(this.members).length || 1, this.area.origin, { spawns: tuples, first, wave }));
  }
  /** Interact beside a brazier (the host validates who / where; this is the rule). */
  light(key, index, positions) {
    if (!this.active || this.cleared || !this.obj) return false;
    return lightBrazier(this.obj, this.sectionDef.objective, index, key, this.objCtx(positions));
  }
  /**
   * Begin a run in `area` (Wild mode; Thorny arrives with Step 62), at its first section. `from` = where the party came in ('ritual' | 'rootgate'): leaving returns there. The ritual's
   * stone code only resets when the run came from the ritual portal (the Rootgate leaves the stones as they were).
   */
  start(keys, { area = 'wildroot', mode = 'wild', from = 'ritual', section = 0, armory = null } = {}) {
    this.setArea(area); this.mode = mode; this.from = from;
    this.active = true; if (from === 'ritual') { this.open = false; this.progress = 0; } this.run++; this.serial++; this.cleared = false; this.projectiles = []; this.pprojectiles = []; this.effects = [];
    this.section = Math.max(0, Math.min(this.area.sections.length - 1, section | 0)); this.notes = [];      // (`section` is for tests and the debug hook: a real run always begins at section 0)
    this.members = Object.fromEntries(keys.map((key) => [key, this.newMember()]));
    this.pedestals = partyPedestals(this.area, rackPedestals(this.area, armory?.charms || []), keys.length);   // (one section pedestal per friend)
    this.g.setOpen(this.openGates()); this.buildSection();
  }
  /** The open gates: those of every section before the current one. */
  openGates() { return this.area.sections.slice(0, this.section).flatMap((s) => (s.gate ? [s.gate.id] : [])); }
  /** The current objective is done: open its gate and move on, or (the last section) the area is cleared. Returns 'cleared' | 'section'. */
  completeSection() {
    const s = this.sectionDef, o = this.area.origin;
    if (s.gate) {
      const tiles = [...this.g.gateTiles.get(s.gate.id).values()];
      const at = tiles.length ? { x: o.x + tiles.reduce((m, [tx]) => m + tx, 0) / tiles.length * 2 + 1, z: o.z + tiles.reduce((m, [, tz]) => m + tz, 0) / tiles.length * 2 + 1 } : { x: o.x, z: o.z };
      this.g.setOpen([...this.g.open, s.gate.id]); this.effect('gate', at.x, at.z, 'open'); this.effects.at(-1).gate = s.gate.id;
    }
    if (this.section >= this.area.sections.length - 1) { this.cleared = true; return 'cleared'; }
    this.section++; this.projectiles = [];
    this.notes.push({ type: 'section', section: this.section });
    this.buildSection(); return 'section';
  }
  // ---- Step 55
  drainNotes() { const n = this.notes; this.notes = []; return n; }
  living() { return Object.keys(this.members).filter((k) => !this.members[k].downed); }
  /** A friend joined / left mid-run: guardians keep their fraction of max HP at the new party size. */
  join(key) { if (this.members[key]) return false; this.members[key] = this.newMember(); this.rescale(); this.fitPedestals(); return true; }
  drop(key) { if (!this.members[key]) return false; delete this.members[key]; this.rescale(); this.fitPedestals(); this.checkWipe(); return true; }
  /** One section pedestal per friend: a join adds the next one, a leave removes an untouched spare. */
  fitPedestals() { if (this.active && this.area) this.pedestals = partyPedestals(this.area, this.pedestals, Object.keys(this.members).length); }
  rescale() {
    const scale = partyScale(Object.keys(this.members).length);
    for (const e of this.enemies) {
      if (ENEMY_KINDS[e.kind].fixed) continue;
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
    const keys = Object.keys(this.members), charms = Object.fromEntries(keys.map((k) => [k, this.members[k].charm || null]));
    this.run++; this.serial++; this.projectiles = []; this.pprojectiles = []; this.effects = [];
    this.members = Object.fromEntries(keys.map((key) => [key, { ...this.newMember(), charm: charms[key] }]));   // (a wipe keeps the charm you carry)
    this.buildSection();                                  // (the current section's guardians AND objective start over; the gates opened so far stay open)
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
  newMember() { return { hp: DUNGEON.hp, combatUntil: 0, invulnerable: 0, ready: 0, combo: 0, lastSword: -99, attack: null, stunUntil: 0, hurt: null, bloom: 0, dodge: null, dodgeReady: 0, specialInv: 0, downed: false, downAt: 0, revive: 0, revivers: {}, charm: null, charmReady: 0, chillUntil: 0 }; }
  leave() { this.active = false; if (this.from === 'ritual') { this.open = false; this.progress = 0; } this.serial++; this.projectiles = []; this.pprojectiles = []; this.effects = []; this.hazards = []; this.patches = []; this.clouds = []; this.bursts = []; }
  inCombat(key, positions) {
    const p = positions[key], m = this.members[key];
    return !!m && (this.time < m.combatUntil || !!p && this.enemies.some((e) => e.hp > 0 && Math.hypot(e.x - p.x, e.z - p.z) < 7 && !ENEMY_KINDS[e.kind].practice && !ENEMY_KINDS[e.kind].block && !this.isSafe(p.x, p.z) && this.g.sight(e, p)));
  }
  /** A tap attack, or (charged) the weapon's charged attack. The caller validates the charge hold; here only cooldown / stun / tool. */
  attack(key, kind, facing, positions, charged = false) {
    const m = this.members[key], w = WEAPONS[kind], p = positions[key];
    if (!this.active || !m || m.downed || !w || !p || !this.g.inArea(p.x, p.z) || !Number.isFinite(facing) || this.time < m.ready || this.time < m.stunUntil) return null;
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
  // ---- Step 58: charms
  /** Cast the held charm (the off-hand button). Returns the event for the screens ({ charm, facing, x, z, ... }) or null (none held / cooling down / downed / stunned / outside). */
  castCharm(key, facing, positions) {
    const m = this.members[key], p = positions[key], info = charmInfo(m?.charm);
    if (!this.active || !m || m.downed || !info || !p || !this.g.inArea(p.x, p.z) || !Number.isFinite(facing) || this.time < (m.charmReady || 0) || this.time < m.stunUntil) return null;
    m.charmReady = this.time + info.cooldown; m.combatUntil = this.time + 3;
    return info.cast(this, key, facing, positions);
  }
  /** Use a pedestal (Interact): take its charm / swap. Returns { took, left, ped } or null. */
  swapCharm(key, pedId, positions) {
    const m = this.members[key], p = positions[key], ped = this.pedestals.find((q) => q.id === pedId);
    if (!this.active || !m || m.downed || !ped || !p || !this.g.inArea(p.x, p.z) || ped.section > this.section || Math.hypot(p.x - ped.x, p.z - ped.z) > CHARM.castRange + 0.5) return null;
    const r = swapAtPedestal(m, ped);
    return r && { ...r, ped: ped.id };
  }
  /** Debug: put a charm (or nothing) straight into a member's off hand. */
  giveCharm(key, id) { const m = this.members[key]; if (!m || (id && !charmInfo(id))) return false; m.charm = id || null; m.charmReady = 0; return true; }
  eat(key, recipe, positions, consume) {
    const m = this.members[key], heal = foodHealing(recipe);
    if (!this.active || !m || m.downed || m.hp >= DUNGEON.hp || !positions[key] || !this.g.inArea(positions[key].x, positions[key].z) || this.inCombat(key, positions) || !heal) return false;
    if (!consume(recipe.dish)) return false;
    m.hp = Math.min(DUNGEON.hp, m.hp + heal); return true;
  }
  effect(kind, x, z, type = 'impact') {
    this.effects.push({ id: ++this.nextFX, kind, x, z, type, at: this.time });
  }
  /** A separate presentation id sequence preserves nextFX (projectile/patch ids are in hashes). */
  recordStrike(key, e, dmg, from, opts = {}, flags = []) {
    const def = ENEMY_KINDS[e.kind], kill = e.hp === 0 && !def.practice;
    if (kill && (def.boss || def.mini || !this.enemies.some((q) => q !== e && q.hp > 0 && !ENEMY_KINDS[q.kind]?.practice && !ENEMY_KINDS[q.kind]?.block))) flags.push('finish');
    const weapon = opts.weapon || opts.kind || 'sword';
    const move = opts.move || 'tap';
    this._strikeSerial = (this._strikeSerial || 0) + 1;
    this.effects.push({ id: `strike:${this.run}:${this._strikeSerial}`, kind: 'strike', type: impactTier(move, flags, opts.boomerang ? 'boomerang' : weapon), at: this.time,
      x: e.x, z: e.z, target: e.id, by: key, dmg, fx: { x: from?.x ?? e.x, z: from?.z ?? e.z - 1 }, weapon, move, flags, kill });
    Object.assign(this.effects.at(-1), { area: this.areaId, section: this.section, run: this.run, targetKind: e.kind, shape: opts.shape || null });
  }
  damage(key, amount, kind, positions, origin = null) {
    const m = this.members[key], p = positions[key];
    this.avoided = null;
    if (!m || m.downed || !p || !this.g.inArea(p.x, p.z) || this.isSafe(p.x, p.z) || this.time < m.invulnerable) return false;
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
    if (COMBAT.bloom.onHurt) gainBloom(m, -COMBAT.bloom.onHurt);
    m.hp = Math.max(0, m.hp - amount); m.invulnerable = this.time + 0.9; m.combatUntil = this.time + 3;
    this.effect(kind, p.x, p.z, 'hit');
    this.effects.at(-1).key = key;
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
    e.attacks = (e.attacks || 0) + 1;
    e.action = kind; e.actionAt = this.time; e.actionFor = RIDERS.includes(kind) ? spec.life : 0.5;
    e.cooldown = spec.recovery;
    if (kind === 'dive') e.low = this.time + spec.life + 1.2;            // (Step 59: a swooping bat is hittable by melee until it climbs again)
    const aim = e.aim || e, dx = aim.x - e.x, dz = aim.z - e.z, length = Math.hypot(dx, dz) || 1;
    if (!this.shielded(e)) e.facing = Math.atan2(dx, dz);   // (a shield guard slaps where its shield already points: it never snaps round, so flanking it works)
    this.effect(kind, kind === 'hop' ? aim.x : e.x, kind === 'hop' ? aim.z : e.z);
    this.effects.at(-1).facing = e.facing;
    if (kind === 'spit') {                                       // Step 60: the toad's lava blobs: telegraphed landing circles (three in its second phase, fanned out)
      const n = e.phase2 ? 3 : 1, base = Math.atan2(aim.x - e.x, aim.z - e.z), far = Math.min(spec.range, Math.hypot(aim.x - e.x, aim.z - e.z));
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.5, d = far * (i === 1 ? 0.8 : 1);
        let tx = e.x + Math.sin(a) * d, tz = e.z + Math.cos(a) * d;
        if (!this.g.inArea(tx, tz, 0.3)) { tx = aim.x; tz = aim.z; }
        this.bursts.push({ id: ++this.nextFX, kind: 'blob', enemy: e.id, x: tx, z: tz, fx: e.x, fz: e.z, at: this.time + spec.flight, radius: spec.radius });
      }
      return false;
    }
    if (kind === 'lash') {                                       // Step 60: the tongue lash: an instant lane in front of the toad (a hop does not clear it, the dodge's i-frames do)
      const sx = Math.sin(e.facing), sz = Math.cos(e.facing), lane = (q) => {
        const along = (q.x - e.x) * sx + (q.z - e.z) * sz, perp = Math.abs((q.x - e.x) * sz - (q.z - e.z) * sx);
        return along > -0.4 && along <= spec.range && perp <= spec.radius;
      };
      for (const key of Object.keys(this.members)) {
        const p = positions[key]; if (!p || this.members[key].downed || !lane(p) || !this.g.sight(e, p)) continue;
        if (this.damage(key, ENEMY_KINDS[e.kind].damage, kind, positions, e)) return true;
      }
      const sap = this.sapling(); if (sap && lane(sap)) this.hurtSapling(ENEMY_KINDS[e.kind].damage * COMBAT.defend.hit, e);
      return false;
    }
    if (PROJECTILE_KINDS.includes(kind)) {
      this.projectiles.push({ id: ++this.nextFX, kind, enemy: e.id, x: e.x, z: e.z, vx: dx / length * (spec.speed || 0), vz: dz / length * (spec.speed || 0), age: 0, radius: 0, hitKeys: [], damage: ENEMY_KINDS[e.kind].damage, bounces: 0 });
      return false;
    }
    const center = kind === 'hop' ? aim : e;
    for (const key of Object.keys(this.members)) {
      const p = positions[key]; if (!p || this.members[key].downed || Math.hypot(p.x - center.x, p.z - center.z) > spec.radius || !this.g.sight(e, p)) continue;
      if (kind === 'sweep' || kind === 'slap' || kind === 'frostcone') {
        const distance = Math.hypot(p.x - e.x, p.z - e.z) || 1;
        if (((p.x - e.x) * Math.sin(e.facing) + (p.z - e.z) * Math.cos(e.facing)) / distance < spec.arc) continue;
      }
      const before = this.members[key].hp;
      if (this.damage(key, ENEMY_KINDS[e.kind].damage, kind, positions, e)) return true;
      if (kind === 'frostcone' && this.members[key].hp < before) this.members[key].chillUntil = this.time + COMBAT.frost.chillFor;      // (the frost spray slows whoever it hits)
    }
    const sap = this.sapling();
    if (sap && kind !== 'dummywave' && Math.hypot(sap.x - center.x, sap.z - center.z) <= spec.radius + 0.5) this.hurtSapling(ENEMY_KINDS[e.kind].damage * COMBAT.defend.hit, e);
    return false;
  }
  // ---- Step 60: the defended sapling (the `defend` objective), the chiefs' shield and the helpers the reactions use
  /** The sapling of a running `defend` objective (alive, started, not finished), or null. */
  sapling() { const o = this.obj; return o?.type === 'defend' && o.started && !o.complete && !o.failed && o.sapling.hp > 0 ? o.sapling : null; }
  hurtSapling(amount, from = null) {
    const s = this.obj?.sapling; if (!s || s.hp <= 0 || this.time - (s.hurtAt ?? -9) < 0.25) return;
    s.hp = Math.max(0, s.hp - Math.max(1, Math.round(amount))); s.hurtAt = this.time;
    this.effect('sapling', s.x, s.z, 'hurt');
    if (s.hp <= 0) this.say(s.x, s.z, 'Wilted...', 'hint');
  }
  /** Does this guardian carry a front shield? The crab and the cabbage always do, a Pepper Chief when its modifier is `shield`. */
  shielded(e) { return !!ENEMY_KINDS[e.kind]?.shield || e.chief === 'shield'; }
  /**
   * Damage that is not a player hit (burning ticks, steam): no stun, no knock-back, no Bloom. Defeating a guardian this way counts the same (a splitting chief still splits). Returns the HP taken.
   */
  hurtEnemy(e, amount, key = null, via = 'burn') {
    const kind = ENEMY_KINDS[e.kind];
    if (!kind || e.hp <= 0 || kind.practice || kind.block) return 0;
    const dealt = Math.min(e.hp, Math.max(1, Math.round(amount)));
    e.hp -= dealt; if (via === 'steam') e.hitAt = this.time;
    if (e.hp <= 0) this.afterDefeat(e);
    else if (kind.phase2 && !e.phase2 && e.hp <= e.max * COMBAT.phase2.at) this.enterPhase2(e);
    this.recordStrike(key, e, dealt, e, { move: 'react', weapon: via }, via === 'fall' ? ['plunge'] : []);
    return dealt;
  }
  /** A guardian just reached 0 HP: a splitting Pepper Chief breaks into two little peppers (once). */
  afterDefeat(e) {
    if (e.dead) return; e.dead = true; e.burning = 0; e.wet = 0; e.frozen = 0; e.blind = 0;
    if (e.chief === 'split' && !e.split) {
      e.split = true;
      const first = this.enemies.reduce((m, q) => Math.max(m, q.id + 1), 0);
      const kids = buildEnemies(this.sectionDef, Object.keys(this.members).length || 1, this.area.origin, { spawns: [['pepperling', 0, 0], ['pepperling', 0, 0]], first, wave: e.wave });
      kids.forEach((k, i) => {
        const a = i ? Math.PI * 0.75 : -Math.PI * 0.25, bx = e.x + Math.sin(a) * 1.0, bz = e.z + Math.cos(a) * 1.0;
        k.x = this.g.inArea(bx, bz, 0.4) ? bx : e.x; k.z = this.g.inArea(bx, bz, 0.4) ? bz : e.z; k.parent = e.id; k.hp = k.max = Math.max(1, Math.round(k.max * 0.8)); k.stun = 0.5;
      });
      this.enemies.push(...kids); this.effect('chief', e.x, e.z, 'split'); this.say(e.x, e.z, 'It split!', 'hint');
    }
  }
  /** Record a reaction (an effect + a floating word; the first time of this run also queues a note for the host's save). */
  react(id, e, key = null) {
    const r = REACTION_LIST[id]; if (!r) return;
    const by = [...new Set([key, e.wetBy, e.burnBy].filter((k) => typeof k === 'string'))];
    this.effect('react', e.x, e.z, id); Object.assign(this.effects.at(-1), { by });
    this.say(e.x, e.z, r.word, 'react');
    this.reactionLog[id] = (this.reactionLog[id] || 0) + 1;
    if (!this.found.has(id)) { this.found.add(id); this.notes.push({ type: 'reaction', id, by }); }
  }
  /** A shove of `d` u along the unit vector (ux, uz): normally a nudge; a shove that crosses a cliff DOWNWARDS drops the guardian onto the lower tier (stunned, a little hurt). */
  shove(e, ux, uz, d) {
    if (!d) return false;
    const nx = e.x + ux * d, nz = e.z + uz * d;
    if (this.g.inArea(nx, nz, 0.8)) { e.x = nx; e.z = nz; return false; }
    const drop = this.g.dropPoint(e.x, e.z, ux, uz, d);
    if (!drop || this.isSafe(drop.x, drop.z)) return false;
    e.x = drop.x; e.z = drop.z; e.stun = Math.max(e.stun, COMBAT.ledge.stun); e.wind = 0; e.fell = this.time;
    this.effect('fall', e.x, e.z, 'drop'); this.say(e.x, e.z, 'Plunge!', 'tick');
    this.hurtEnemy(e, Math.max(1, e.max * COMBAT.ledge.fall), null, 'fall');
    return true;
  }
  /** A burning patch on the floor (an Ember Seed's burst, a slug's trail, a toad's blob): `life` s, radius `r`. The oldest go when there are too many. */
  addPatch(x, z, r, life, { owner = null, src = 'seed' } = {}) {
    this.patches.push({ id: ++this.nextFX, x, z, r, until: this.time + life, owner, src, hit: {} });
    while (this.patches.length > COMBAT.patch.cap) this.patches.shift();
  }
  /** A rain cloud (the watering can's special): heals friends under it, wets guardians, puts burning patches out. At most two per owner. */
  addCloud(owner, x, z, life, radius) {
    const mine = this.clouds.filter((c) => c.owner === owner);
    if (mine.length >= 2) this.clouds = this.clouds.filter((c) => c !== mine[0]);
    this.clouds.push({ id: ++this.nextFX, owner, x, z, r: radius, born: this.time, until: this.time + life, next: this.time + 0.15 });
  }
  /** Pending impacts: an Ember Seed lands (burst + patch + brambles) or a toad's lava blob lands (hurts friends, leaves a patch). Returns true when a friend's hit wiped the party. */
  updateBursts(positions) {
    const live = [];
    for (const b of this.bursts) {
      if (b.at > this.time) { live.push(b); continue; }
      if (b.kind === 'ember') {
        const s = CHARM.emberSeed, from = { x: b.x, z: b.z };
        this.effect('ember', b.x, b.z, 'burst');
        for (const e of this.enemies) {
          if (e.hp <= 0 || Math.hypot(e.x - b.x, e.z - b.z) > s.radius + 0.4) continue;
          this.hitEnemy(b.owner, e, s.damage, s.stun, from, 0.3, { move: 'charm', weapon: 'ember-seed', ranged: true });
          if (e.hp > 0) applyStatus(this, e, 'burning', b.owner);
        }
        this.addPatch(b.x, b.z, s.patchRadius, s.patchFor, { owner: b.owner, src: 'seed' });
        burnBrambles(this.obj, { x: b.x, z: b.z }, this.objCtx({}));
      } else {                                                    // 'blob'
        const owner = this.enemies.find((e) => e.id === b.enemy), dmg = owner ? ENEMY_KINDS[owner.kind].damage : 14;
        this.effect('blob', b.x, b.z, 'land');
        this.addPatch(b.x, b.z, 1.5, 4, { owner: null, src: 'toad' });
        for (const key of Object.keys(this.members)) {
          const p = positions[key]; if (!p || this.members[key].downed || Math.hypot(p.x - b.x, p.z - b.z) > b.radius) continue;
          if (this.damage(key, dmg, 'blob', positions, b)) return true;
        }
        const sap = this.sapling(); if (sap && Math.hypot(sap.x - b.x, sap.z - b.z) <= b.radius + 0.5) this.hurtSapling(dmg * COMBAT.defend.hit, owner);
      }
    }
    this.bursts = live; return false;
  }
  /** Burning patches: set guardians burning, hurt a member crossing one (gently, at most every COMBAT.patch.every s), scorch the sapling. A rain cloud puts them out (updateClouds). */
  updatePatches(positions) {
    this.patches = this.patches.filter((q) => q.until > this.time);
    const c = COMBAT.patch, sap = this.sapling();
    for (const q of this.patches) {
      for (const e of this.enemies) {
        if (e.hp <= 0 || (q.src && q.src === e.kind) || Math.hypot(e.x - q.x, e.z - q.z) > q.r + 0.3 || (e.airborne || 0) > this.time) continue;
        if ((e.burning || 0) > this.time + 1.5) continue;                                  // (already burning well: do not re-run the reactions every tick)
        applyStatus(this, e, 'burning', q.owner);
      }
      for (const key of Object.keys(this.members)) {
        const p = positions[key], m = this.members[key];
        if (!p || m.downed || this.isSafe(p.x, p.z) || Math.hypot(p.x - q.x, p.z - q.z) > q.r || this.time < (q.hit[key] || 0)) continue;
        q.hit[key] = this.time + c.every;
        if (this.damage(key, c.damage, 'burn', positions, q)) return true;
      }
      if (sap && Math.hypot(sap.x - q.x, sap.z - q.z) < q.r + 0.7 && this.time >= (q.hit.sap || 0)) { q.hit.sap = this.time + c.every; this.hurtSapling(2); }
    }
    return false;
  }
  /** Rain clouds tick: heal friends under them (never above max, never a downed one), wet guardians, heal the sapling, put burning patches out. */
  updateClouds(positions) {
    this.clouds = this.clouds.filter((c) => c.until > this.time);
    const w = COMBAT.water;
    for (const c of this.clouds) {
      if (this.time < c.next) continue;
      c.next = this.time + w.cloudTick;
      for (const [key, m] of Object.entries(this.members)) {
        const p = positions[key];
        if (!p || m.downed || m.hp >= DUNGEON.hp || Math.hypot(p.x - c.x, p.z - c.z) > c.r) continue;
        m.hp = Math.min(DUNGEON.hp, m.hp + w.cloudHeal); this.effect('rain', p.x, p.z, 'heal'); this.effects.at(-1).key = key;
      }
      for (const e of this.enemies) {
        if (e.hp <= 0 || Math.hypot(e.x - c.x, e.z - c.z) > c.r) continue;
        if ((e.wet || 0) > this.time + 3) continue;                                         // (soaked already: no reaction spam)
        applyStatus(this, e, 'wet', c.owner);
      }
      const sap = this.obj?.type === 'defend' && !this.obj.complete ? this.obj.sapling : null;
      if (sap && sap.hp > 0 && sap.hp < sap.max && Math.hypot(sap.x - c.x, sap.z - c.z) <= c.r + 0.5) { sap.hp = Math.min(sap.max, sap.hp + w.sapHeal); this.effect('rain', sap.x, sap.z, 'heal'); }
      const out = this.patches.filter((q) => Math.hypot(q.x - c.x, q.z - c.z) <= c.r + q.r * 0.5);
      if (out.length) { this.patches = this.patches.filter((q) => !out.includes(q)); for (const q of out) this.effect('douse', q.x, q.z, 'hiss'); }
    }
  }
  // ---- Step 57: floating words (the practice dummies' hit numbers, "Blocked!", "Cracked!", "Nice hop!"): an effect every screen shows once
  say(x, z, text, tone = 'hit') {
    this.effect('practice', x, z, 'text'); Object.assign(this.effects.at(-1), { text, tone });
  }
  /** The party did a `train` move (tap / charged / special / hop) for the first time: the bailey's chip ticks it. */
  noteMove(move, x, z) {
    if (this.obj?.type !== 'train' || !trainMove(this.obj, move, { time: this.time })) return;
    this.say(x, z, { tap: 'Tap hit!', charged: 'Charged hit!', special: 'Special!', hop: 'Nice hop!' }[move] || 'Nice!', 'tick');
  }
  /** Is the attacker at `from` inside the front arc of a shielded guardian's facing? */
  guarded(e, from) {
    if (!Number.isFinite(e.facing)) return false;
    const d = Math.atan2(from.x - e.x, from.z - e.z);
    return Math.abs(Math.atan2(Math.sin(d - e.facing), Math.cos(d - e.facing))) <= COMBAT.shield.arc * Math.PI / 180;
  }
  /**
   * One player hit on a guardian: damage (+50 % on a launched one), stun, nudge away from `from`, and the attacker's Bloom. `opts`: `move` ('tap' | 'charged' | 'special', for the
   * practice dummies), `armorBreak` (cracks a walnut's shell), `pierce` (a front shield does not stop it), `ranged` (Step 59: a pebble, a charm, the boomerang, the shockwave: a hovering
   * flyer cannot dodge it). A FROZEN guardian hit by a 'charged' or 'special' move SHATTERS (x COMBAT.frost.shatter, the freeze ends, shells and ice armor crack). Practice dummies never lose HP; a shielded guardian turns a front hit
   * into a x0.15 "Blocked!" (no stun, no knock-back, no Bloom); an armored one takes x`armor` and barely flinches until cracked.
   */
  hitEnemy(key, e, amount, stun, from, push = 0.6, opts = {}) {
    if (e.hp <= 0) return 0;
    const kind = ENEMY_KINDS[e.kind], member = this.members[key];
    if (kind.flyer && !opts.ranged && !this.exposed(e)) {                         // a hovering bat is out of melee reach: say so (at most once a second per bat)
      if (this.time - (e.missAt ?? -9) > 1) { e.missAt = this.time; this.say(e.x, e.z, 'Too high!', 'hint'); }
      return 0;
    }
    if (kind.block) {                                                              // an ice block: every hit from anything is one crack
      e.hp = Math.max(0, e.hp - 1); e.hitAt = this.time; gainBloom(member, COMBAT.bloom.perHit);
      this.effect('ice', e.x, e.z, e.hp ? 'crack' : 'break'); if (!e.hp) this.say(e.x, e.z, 'Free!', 'tick');
      this.recordStrike(key, e, 1, from, opts, ['soft']);
      return 1;
    }
    let dealt = e.airborne > this.time ? Math.round(amount * (1 + COMBAT.airborneBonus)) : amount, soft = false;
    const shatter = this.isFrozen(e) && (opts.move === 'charged' || opts.move === 'special') && !kind.practice;
    if (shatter) dealt = Math.round(dealt * (e.solid ? REACT.solidShatter : COMBAT.frost.shatter));       // (Step 60: frozen SOLID shatters harder)
    if (kind.practice) {
      e.hitAt = this.time; e.hits = (e.hits || 0) + 1; e.hp = e.max;
      gainBloom(member, COMBAT.bloom.perHit * COMBAT.train.bloomX);
      this.say(e.x, e.z, String(dealt), 'hit'); this.noteMove(opts.move || 'tap', e.x, e.z);
      this.recordStrike(key, e, dealt, from, opts, [...(opts.flags || [])]);
      return dealt;
    }
    if (this.shielded(e) && !opts.pierce && !(e.stun > 0) && !(e.airborne > this.time) && !this.isFrozen(e) && this.guarded(e, from)) {
      dealt = Math.max(1, Math.round(dealt * COMBAT.shield.mult)); e.hp = Math.max(0, e.hp - dealt); e.hitAt = this.time;
      this.effect('shield', e.x, e.z, 'block'); this.say(e.x, e.z, 'Blocked!', 'block');
      if (e.hp <= 0) this.afterDefeat(e);
      this.recordStrike(key, e, dealt, from, opts, ['blocked']);
      return dealt;
    }
    const wasCracked = !!e.cracked;
    if (e.shell) {                                                                    // Step 60: the Magma Toad's shell. Glowing magma shrugs off nearly everything; cooled to stone it cracks
      if (e.shell === 'magma') {
        dealt = Math.max(1, Math.round(dealt * COMBAT.toad.shell)); soft = true; this.effect('armor', e.x, e.z, 'clink');
        if (this.time - (e.hotAt ?? -9) > 1.5) { e.hotAt = this.time; this.say(e.x, e.z, 'Too hot!', 'hint'); }
      } else if (opts.armorBreak || opts.move === 'charged' || opts.move === 'special' || shatter) {
        e.shell = false; e.cracked = true; stun = Math.max(stun, COMBAT.armor.crackStun); this.effect('armor', e.x, e.z, 'crack'); this.say(e.x, e.z, 'Shell cracked!', 'crack');
      }
    }
    if ((kind.armor && !e.cracked) || e.iceArmor) {                                  // a shell (walnut, frostcap cap) or the golem's ice armor
      if (opts.armorBreak || shatter) { e.cracked = true; e.iceArmor = false; stun = Math.max(stun, COMBAT.armor.crackStun); this.effect('armor', e.x, e.z, 'crack'); if (!shatter) this.say(e.x, e.z, 'Cracked!', 'crack'); }
      else { dealt = Math.max(1, Math.round(dealt * (e.iceArmor ? COMBAT.frost.iceArmor : kind.armor))); soft = true; this.effect('armor', e.x, e.z, 'clink'); }
    }
    if (shatter) { e.frozen = 0; e.solid = false; this.effect('freeze', e.x, e.z, 'shatter'); this.say(e.x, e.z, 'Shatter!', 'crack'); }
    const flags = [...(opts.flags || [])];
    if (e.airborne > this.time) flags.push('air');
    if (shatter) flags.push('shatter');
    if (soft) flags.push('soft');
    if (!wasCracked && e.cracked) flags.push('crack');
    if (opts.launch) flags.push('launch');
    const beforeHP = e.hp;
    e.hp = Math.max(0, e.hp - dealt); e.hitAt = this.time;
    if (soft) e.stun = Math.max(e.stun, Math.min(stun, COMBAT.armor.softStun));            // (the shell shrugs it off: no stun-lock, the wind-up is not interrupted)
    else { e.stun = stun; e.wind = 0; e.cooldown = 0.8; }
    const dx = e.x - from.x, dz = e.z - from.z, dist = Math.hypot(dx, dz) || 1, pushed = soft ? push * 0.3 : push;
    this.shove(e, dx / dist, dz / dist, pushed);
    gainBloom(member, COMBAT.bloom.perHit);
    if (opts.wet && e.hp > 0) applyStatus(this, e, 'wet', key);                              // Step 60: water makes a guardian wet (and may react)
    if (e.hp <= 0) this.afterDefeat(e);
    else if (kind.phase2 && !e.phase2 && e.hp <= e.max * COMBAT.phase2.at) this.enterPhase2(e);
    this.recordStrike(key, e, Math.min(beforeHP, dealt), from, opts, flags);
    return dealt;
  }
  /** The Patchkeeper's second phase (once): a roar (stun), vine adds from the section's `phase2.adds` (party-scaled) and, from now on, the rolling charge every other attack. */
  enterPhase2(e) {
    e.phase2 = true; e.stun = Math.max(e.stun, COMBAT.phase2.stun); e.wind = 0; e.cooldown = 1.5; e.attacks = 0;
    const adds = this.sectionDef.phase2?.adds || [];
    if (adds.length) this.spawnWave(adds, 'phase2');
    if (ENEMY_KINDS[e.kind].iceArmor) e.iceArmor = true;                              // (Step 59: the Snow Golem grows ice armor; a shatter or the hammer cracks it)
    if (ENEMY_KINDS[e.kind].shell) { e.shell = 'magma'; e.stun = Math.max(e.stun, COMBAT.phase2.stun); }   // (Step 60: the Magma Toad grows a glowing magma shell; wet + frost cools it to stone)
    this.effect('phase', e.x, e.z, 'two'); this.effects.at(-1).what = e.kind; this.notes.push({ type: 'phase', kind: e.kind });
  }
  // ---- Step 59: statuses
  isFrozen(e) { return (e.frozen || 0) > this.time; }
  /** Can a melee hit land on this guardian right now? Everything but a hovering flyer: bats are reachable while winding up / diving / low after the dive / stunned / frozen / launched. */
  exposed(e) { return !ENEMY_KINDS[e.kind].flyer || e.wind > 0 || e.stun > 0 || this.isFrozen(e) || (e.low || 0) > this.time || e.airborne > this.time; }
  /**
   * Freeze a guardian (Frost Nova): it cannot move or act for CHARM.frostNova.freeze s (a boss or mini-boss only bossFreeze s, and it is chilled = slowed for chill s as well).
   * Ice blocks and practice dummies are left alone. Returns true when it froze.
   */
  freezeEnemy(e, key = null) {
    const kind = e && ENEMY_KINDS[e.kind];
    if (!e || e.hp <= 0 || !kind || kind.block || kind.practice) return false;
    return applyStatus(this, e, 'frozen', key).applied;          // (Step 60: game/reactions.js: wet -> frozen solid, burning -> a steam burst instead, a wet magma shell -> stone)
  }
  /** A Frost Nova was cast at `at` (world x / z): freezes the Frozen Ford if it reaches it (the `freeze` objective). Returns true when it did. */
  freezeWater(at) { return freezeWater(this.obj, at, this.objCtx({})); }
  /** Like reachAlong but for a LOB (an Ember Seed): it flies over cliffs, so only walls and the edge of the floor stop it. */
  lobAlong(p, facing, want) {
    const dx = Math.sin(facing), dz = Math.cos(facing); let at = { x: p.x, z: p.z }, travelled = 0;
    while (travelled < want - 1e-9) {
      const step = Math.min(0.25, want - travelled), next = { x: p.x + dx * (travelled + step), z: p.z + dz * (travelled + step) };
      if (!this.g.onFloor(next.x, next.z) || !this.g.sight(at, next, 0.3)) break;
      at = next; travelled += step;
    }
    return { x: at.x, z: at.z, dist: travelled };
  }
  /** The farthest point (<= want u) along a yaw that a body of radius 0.45 can reach without touching a wall. */
  reachAlong(p, facing, want) {
    const dx = Math.sin(facing), dz = Math.cos(facing); let at = { x: p.x, z: p.z }, travelled = 0;
    while (travelled < want - 1e-9) {
      const step = Math.min(0.25, want - travelled), next = { x: p.x + dx * (travelled + step), z: p.z + dz * (travelled + step) };
      if (!this.g.inArea(next.x, next.z, 0.45) || !this.g.sight(at, next, 0.3)) break;
      at = next; travelled += step;
    }
    return { x: at.x, z: at.z, dist: travelled };
  }
  /** Jump: a short low hop plus a dash (the screen moves its own body at once; the host owns the timing and the i-frames). */
  dodge(key, dx, dz, positions) {
    const m = this.members[key], p = positions[key], c = COMBAT.dodge;
    if (!this.active || !m || m.downed || !p || !this.g.inArea(p.x, p.z) || this.time < m.stunUntil || this.time < (m.dodgeReady || 0)) return null;
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
    if (!this.active || !m || m.downed || !s || !p || !this.g.inArea(p.x, p.z) || !Number.isFinite(facing) || this.time < m.ready || this.time < m.stunUntil) return null;
    const cost = big ? COMBAT.bloom.max : 1;
    if (bloomPips(m) < cost) return null;
    gainBloom(m, -cost); m.ready = this.time + s.duration; m.combo = 0; m.lastSword = -99; m.attack = null; m.combatUntil = this.time + 4;
    const event = { kind, big, facing, special: true };
    if (kind === 'sword') {
      const end = this.reachAlong(p, facing, big ? s.bigDash : s.dash), time = big ? s.bigTime : s.time;
      event.dist = end.dist; event.time = time; m.specialInv = this.time + time;
      for (const e of this.enemies) {
        if (e.hp > 0 && segmentDistance(e, p, end) <= s.radius + 0.4) this.hitEnemy(key, e, big ? s.bigDamage : s.damage, s.stun, p, 0.5, { move: 'special', weapon: kind, flags: big ? ['big'] : [], pierce: !!s.pierce });
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
        if (e.hp <= 0 || Math.hypot(e.x - p.x, e.z - p.z) > radius || !this.g.sight(p, e)) continue;
        this.hitEnemy(key, e, big ? s.bigDamage : s.damage, Math.max(s.stun, launch), p, 0.8, { move: 'special', weapon: kind, shape: 'shockwave', launch: true, flags: big ? ['big'] : [], armorBreak: !!s.armorBreak, pierce: !!s.pierce, ranged: true });
        if (e.hp > 0) { e.airborne = this.time + launch; e.airborneFor = launch; }   // launched AFTER the hit, so the wave itself never gets its own bonus
      }
      this.effect('shockwave', p.x, p.z, 'player'); Object.assign(this.effects.at(-1), { size: radius });
    } else if (kind === 'slingshot') {                    // Step 59: a fan of pellets (a full Bloom meter makes it wider and more of them)
      const n = big ? s.bigPellets : s.pellets, spread = big ? s.bigSpread : s.spread;
      for (let i = 0; i < n; i++) this.firePebble(key, p, facing - spread / 2 + spread * i / (n - 1), { range: s.range, damage: big ? s.bigDamage : s.damage, stun: s.stun, move: 'special' });
      event.pellets = n;
    } else if (kind === 'watering-can') {                  // Step 60: a rain cloud ahead (the big one is wider and lasts longer)
      const end = this.reachAlong(p, facing, big ? s.bigRange : s.range);
      this.addCloud(key, end.x, end.z, big ? s.bigLife : s.life, big ? s.bigRadius : s.radius);
      event.x = end.x; event.z = end.z; event.dist = end.dist; event.radius = big ? s.bigRadius : s.radius; event.life = big ? s.bigLife : s.life;
    }
    return event;
  }
  /** A slingshot pebble leaves `p` along the yaw `facing` (range in u; `pierce` passes through guardians; `move` is the hit's move for shatter / the practice dummies). */
  firePebble(key, p, facing, { range, damage, stun, pierce = false, move = 'tap', big = false }) {
    this.pprojectiles.push({ id: ++this.nextFX, kind: 'pebble', owner: key, x: p.x + Math.sin(facing) * 0.6, z: p.z + Math.cos(facing) * 0.6, dx: Math.sin(facing), dz: Math.cos(facing), travelled: 0.6, age: 0, range, damage, stun, pierce, move, big, hit: [] });
  }
  /** One pebble tick (sub-stepped): stops at walls, pops thrown snowballs, hits guardians (once each; a piercing shot flies on). Returns true when it is spent. */
  stepPebble(b, dt) {
    const steps = Math.max(1, Math.ceil(dt / 0.04));
    for (let i = 0; i < steps; i++) {
      const h = dt / steps, prev = { x: b.x, z: b.z }, next = { x: b.x + b.dx * COMBAT.sling.speed * h, z: b.z + b.dz * COMBAT.sling.speed * h };
      if (!this.g.inArea(next.x, next.z, 0.1) || !this.g.sight(prev, next, 0.1)) { this.effect('pebble', b.x, b.z, 'blocked'); return true; }
      b.x = next.x; b.z = next.z; b.travelled += COMBAT.sling.speed * h;
      for (const a of this.projectiles) {                                           // a pebble pops a thrown snowball
        if (a.kind !== 'snowball' || a.age >= 99 || segmentDistance(a, prev, b) > COMBAT.sling.snowballRadius) continue;
        a.age = 99; this.effect('snowball', a.x, a.z, 'pop'); this.say(a.x, a.z, 'Pop!', 'tick'); return true;
      }
      for (const e of this.enemies) {
        if (e.hp <= 0 || b.hit.includes(e.id) || segmentDistance(e, prev, b) > COMBAT.sling.radius + (ENEMY_KINDS[e.kind].boss ? 0.95 : 0.45)) continue;
        b.hit.push(e.id); this.hitEnemy(b.owner, e, b.damage, b.stun, prev, b.big ? 0.6 : 0.3, { move: b.move, weapon: 'slingshot', ranged: true, pierce: b.pierce });
        if (!b.pierce) return true;
      }
      if (b.travelled >= b.range) return true;
    }
    return false;
  }
  updatePlayerProjectiles(dt, positions) {
    const live = [];
    for (const b of this.pprojectiles) {
      if (b.kind === 'pebble') { b.age += dt; if (!this.members[b.owner] || this.stepPebble(b, dt)) continue; live.push(b); continue; }
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
        if (!this.g.inArea(next.x, next.z, 0.2) || !this.g.sight(prev, next, 0.2)) {
          this.effect('boomerang', b.x, b.z, 'blocked');
          if (b.phase === 'out') { b.phase = 'back'; continue; }
          gone = true; break;                           // a returning axe that meets a wall (its owner went round a corner) simply drops
        }
        b.x = next.x; b.z = next.z;
        if (b.phase === 'out') { b.travelled += s.speed * h; if (b.travelled >= s.range) b.phase = 'back'; }
        const list = b.hit[b.phase === 'out' ? 0 : 1];
        for (const e of this.enemies) {
          if (e.hp <= 0 || list.includes(e.id) || segmentDistance(e, prev, b) > s.radius + 0.35) continue;
          list.push(e.id); this.hitEnemy(b.owner, e, b.damage, s.stun, prev, 0.4, { move: 'special', weapon: 'axe', boomerang: true, ranged: true });
        }
      }
      if (!gone) live.push(b);
    }
    this.pprojectiles = live;
  }
  /** A rolling guardian met a wall: turn its velocity about the wall's normal (estimated from the free ground around it). False when it cannot bounce. */
  bounce(a) {
    let nx = 0, nz = 0;
    for (let i = 0; i < 16; i++) {
      const ang = i * Math.PI / 8, px = a.x + Math.cos(ang) * 0.9, pz = a.z + Math.sin(ang) * 0.9;
      if (this.g.inArea(px, pz, 0.8)) { nx += Math.cos(ang); nz += Math.sin(ang); }
    }
    const len = Math.hypot(nx, nz); if (len < 1e-6) return false;
    nx /= len; nz /= len;
    const dot = a.vx * nx + a.vz * nz; if (dot >= 0) return false;
    a.vx -= 2 * dot * nx; a.vz -= 2 * dot * nz; return true;
  }
  /** The wave dummy's ring crossed a member: a hop over it counts for the train objective ("Nice hop!"), standing in it only shows the hint. It never hurts. */
  practiceWave(key, p) {
    const m = this.members[key], s = dodgeState(m, this.time);
    if (s.airborne || s.invulnerable) this.noteMove('hop', p.x, p.z);
    else this.say(p.x, p.z, 'Hop!', 'hint');
  }
  updateProjectiles(dt, positions) {
    const live = [];
    for (const a of this.projectiles) {
      const spec = GUARDIAN_ATTACKS[a.kind], enemy = this.enemies.find((e) => e.id === a.enemy), rides = RIDERS.includes(a.kind), ring = RINGS.includes(a.kind);
      if (a.age >= 99) continue;                          // (a snowball popped by a pebble)
      if (rides && (!enemy || enemy.hp <= 0 || enemy.stun > 0 || enemy.airborne > this.time || this.isFrozen(enemy))) continue;
      let ended = false;
      const remaining = Math.min(dt, Math.max(0, spec.life - a.age)), steps = Math.max(1, Math.ceil(remaining / 0.05));
      for (let i = 0; i < steps && !ended; i++) {
        const h = remaining / steps, prev = { x: a.x, z: a.z }, oldRadius = a.radius;
        a.age += h;
        if (ring) a.radius = spec.radius * a.age / spec.life;
        else {
          const next = { x: a.x + a.vx * h, z: a.z + a.vz * h }, clearance = rides ? 0.8 : 0.2;
          if (this.isSafe(next.x, next.z) || !this.g.inArea(next.x, next.z, clearance) || !this.g.sight(prev, next, clearance)) {
            if (a.kind === 'roll' && (a.bounces || 0) < 1 && !this.isSafe(next.x, next.z) && this.bounce(a)) { a.bounces = (a.bounces || 0) + 1; this.effect('roll', a.x, a.z, 'bounce'); continue; }
            this.effect(a.kind, a.x, a.z, 'blocked'); ended = true; continue;
          }
          a.x = next.x; a.z = next.z;
          if (rides) { enemy.x = a.x; enemy.z = a.z; enemy.facing = Math.atan2(a.vx, a.vz); }
        }
        for (const key of Object.keys(this.members)) {
          const p = positions[key]; if (!p || this.members[key].downed || !this.g.sight(a, p)) continue;
          const distance = Math.hypot(p.x - a.x, p.z - a.z);
          const hit = ring ? distance >= Math.max(0, oldRadius - 0.3) && distance <= a.radius + 0.3 : segmentDistance(p, prev, a) <= spec.radius;
          if (!hit || (a.kind !== 'dummywave' && this.isSafe(p.x, p.z)) || a.hitKeys?.includes(key)) continue;
          (a.hitKeys ||= []).push(key);
          if (a.kind === 'dummywave') { this.practiceWave(key, p); continue; }
          if (this.damage(key, a.damage, a.kind, positions, ring ? a : prev)) return true;
          if ((a.kind === 'seed' || a.kind === 'snowball') && this.avoided !== 'dodge' && this.avoided !== 'special') { this.effect(a.kind, a.x, a.z); ended = true; break; }   // (a seed or snowball passes through a perfect dodger)
        }
      }
      if (!ended && a.age < spec.life) live.push(a);
    }
    this.projectiles = live; return false;
  }
  /** A practice dummy's turn: only the wave dummy acts (a slow harmless wave every few seconds while a member is near). */
  updatePractice(e, dt, positions) {
    if (e.kind !== 'wavedummy') return;
    const spec = GUARDIAN_ATTACKS.dummywave;
    if (e.wind > 0) { e.wind -= dt; if (e.wind <= 0) this.release(e, positions); return; }
    if (e.cooldown) return;
    const near = Object.keys(this.members).some((k) => !this.members[k].downed && positions[k] && Math.hypot(positions[k].x - e.x, positions[k].z - e.z) < spec.range);
    if (near) { e.attackKind = 'dummywave'; e.wind = spec.wind; e.aim = { x: e.x, z: e.z + 1 }; e.facing = 0; }
  }
  update(dt, positions) {
    this.time += dt; if (!this.active) return null;
    for (const [key, m] of Object.entries(this.members)) {
      const a = m.attack; if (!a || a.at > this.time || m.downed) continue;
      m.attack = null; const p = positions[key];
      if (!p || !this.g.inArea(p.x, p.z) || Math.hypot(p.x - a.x, p.z - a.z) > 3) continue;
      const w = a.charged ? WEAPONS[a.kind].charged : WEAPONS[a.kind];
      if (WEAPONS[a.kind].ranged) {                                               // Step 59: the slingshot lets a pebble fly instead of swinging
        this.firePebble(key, p, a.facing, { range: w.range, damage: a.charged ? w.damage : w.damage[0], stun: w.stun, pierce: !!w.pierce, move: a.charged ? 'charged' : 'tap', big: !!a.charged });
        continue;
      }
      if (a.charged) { this.effect(w.shape, p.x, p.z, 'player'); Object.assign(this.effects.at(-1), { facing: a.facing, size: w.range }); }
      for (const e of this.enemies) {
        const dx = e.x - p.x, dz = e.z - p.z, dist = Math.hypot(dx, dz);
        // (arc -1 = every direction: the spin and the pound ring)
        if (e.hp <= 0 || dist > w.range || !this.g.sight(p, e) || dist > 0.1 && (dx * Math.sin(a.facing) + dz * Math.cos(a.facing)) / dist < w.arc) continue;
        this.hitEnemy(key, e, a.charged ? w.damage : w.damage[a.combo], w.stun, p, w.push ?? 0.6, { move: a.charged ? 'charged' : 'tap', weapon: a.kind, flags: a.kind === 'sword' && a.combo === 2 ? ['finisher'] : [], armorBreak: !!w.armorBreak, wet: !!w.spray, ranged: !!w.spray });
      }
    }
    this.updatePlayerProjectiles(dt, positions);
    this.effects = this.effects.filter((fx) => this.time - fx.at < 1.2);
    if (this.updateProjectiles(dt, positions)) return 'wipe';
    this.updateDowned(dt, positions);
    if (this.checkWipe()) return 'wipe';
    if (this.updateBursts(positions) || this.updatePatches(positions)) return 'wipe';       // Step 60: landing seeds / blobs, burning patches, rain clouds, burning ticks
    this.updateClouds(positions); tickStatuses(this);
    const fields = new Map();
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      e.stun = Math.max(0, e.stun - dt); e.cooldown = Math.max(0, e.cooldown - dt);
      if (ENEMY_KINDS[e.kind].practice) { this.updatePractice(e, dt, positions); continue; }
      if (ENEMY_KINDS[e.kind].block) continue;                  // (Step 59: an ice block just sits there until it is cracked)
      if ((e.blind || 0) > this.time) { e.wind = 0; continue; }  // Step 60: blinded by steam: cannot target anything for a moment
      if (this.isFrozen(e)) { e.wind = 0; continue; }           // frozen: cannot move or act
      if (e.airborne > this.time) { e.wind = 0; continue; }   // launched by the hammer shockwave: can neither move nor attack until it lands
      if (e.stun > 0 || this.projectiles.some((a) => RIDERS.includes(a.kind) && a.enemy === e.id)) continue;
      const candidates = Object.keys(this.members).filter((k) => !this.members[k].downed && positions[k] && this.g.inArea(positions[k].x, positions[k].z) && !this.isSafe(positions[k].x, positions[k].z));
      const def = ENEMY_KINDS[e.kind], sap = this.sapling(), shielded = this.shielded(e), hold = def.flyer ? 4.2 : def.hold ?? 1.35;
      const visible = candidates.filter((k) => Math.hypot(e.x - positions[k].x, e.z - positions[k].z) < (def.aggro ?? 8) && this.g.sight(e, positions[k]));
      let key = visible.sort((a, b) => Math.hypot(e.x - positions[a].x, e.z - positions[a].z) - Math.hypot(e.x - positions[b].x, e.z - positions[b].z))[0]
        || (candidates.includes(e.target) && (e.aggroUntil || 0) > this.time ? e.target : null);
      if (key && key === e.target && !visible.includes(key) && Math.hypot(e.x - positions[key].x, e.z - positions[key].z) < 2 * (def.aggro ?? 8) && this.g.sight(e, positions[key])) e.aggroUntil = Math.max(e.aggroUntil || 0, this.time + 2);   // (Step 60: a guardian going round by a ramp keeps hunting a friend it can still see)
      let p = positions[key];
      if (!p && sap) { p = sap; key = null; }                                         // Step 60: nobody in sight: head for the defended sapling
      if (!p) { e.wind = 0; continue; }
      const dist = Math.hypot(e.x - p.x, e.z - p.z), m = key ? this.members[key] : null;
      if (key && visible.includes(key)) { if (!e.wind) e.target = key; e.aggroUntil = this.time + 5; }
      if (m) m.combatUntil = this.time + 3;
      if (shielded && !(e.wind > 0)) {                  // (the guard keeps its shield towards whoever it is fighting, but turns at a limited rate: circle it, or hit it mid-slap)
        const want = Math.atan2(p.x - e.x, p.z - e.z), cur = Number.isFinite(e.facing) ? e.facing : want, step = COMBAT.shield.turn * dt;
        e.facing = cur + Math.max(-step, Math.min(step, Math.atan2(Math.sin(want - cur), Math.cos(want - cur))));
      }
      if (e.wind > 0) {
        e.wind -= dt;
        if (e.wind <= 0 && this.release(e, positions)) return 'wipe';
      } else if (dist < GUARDIAN_ATTACKS[guardianAttack(e.kind, dist, e)].range && !e.cooldown && this.g.sight(e, p) && (!shielded || this.guarded(e, p))) {   // (a shield guard only slaps what is in front of it: behind it, it is still turning)
        e.attackKind = guardianAttack(e.kind, dist, e); e.wind = GUARDIAN_ATTACKS[e.attackKind].wind;
        e.target = key; e.aim = { x: p.x, z: p.z }; if (!shielded) e.facing = Math.atan2(p.x - e.x, p.z - e.z);
      }
      else if (dist > hold || !this.g.reach(e, p, 0.8)) {
        const slow = (e.chilled || 0) > this.time ? 0.5 : 1, direct = this.g.reach(e, p, 0.8);
        let waypoint = p;
        if (!direct) {                                                              // (Step 60: a cliff is a wall for walking: go round by the ramps)
          const fk = key ?? 'sapling';
          if (!fields.has(fk)) fields.set(fk, this.g.field(p));
          waypoint = this.g.waypoint(e, p, fields.get(fk));
        }
        if (!waypoint) continue;
        const length = Math.hypot(waypoint.x - e.x, waypoint.z - e.z);
        const stopDistance = direct ? hold : 0;
        const step = Math.min(length, Math.max(0, dist - stopDistance), def.speed * (e.chief === 'fast' ? 1.7 : 1) * slow * dt);
        const nx = e.x + (waypoint.x - e.x) / (length || 1) * step, nz = e.z + (waypoint.z - e.z) / (length || 1) * step;
        if (!this.isSafe(nx, nz, 1) && this.g.inArea(nx, nz, 0.8) && this.g.reach(e, { x: nx, z: nz }, 0.8)) {
          e.x = nx; e.z = nz;
          if (def.trail) { e.trailD = (e.trailD || 0) + step; if (e.trailD >= COMBAT.patch.slugEvery) { e.trailD = 0; this.addPatch(e.x, e.z, 0.9, COMBAT.patch.slugTrail, { src: 'slug' }); } }     // the lava slug leaves a burning trail
        }
      } else if (def.flyer) {                                     // a hovering bat circles its target while it waits for its next dive
        const side = e.id % 2 ? 1 : -1, ang = Math.atan2(p.x - e.x, p.z - e.z), step = def.speed * 0.6 * dt;
        const nx = e.x + Math.cos(ang) * side * step, nz = e.z - Math.sin(ang) * side * step;
        if (!this.isSafe(nx, nz, 1) && this.g.inArea(nx, nz, 0.8) && this.g.reach(e, { x: nx, z: nz }, 0.8)) { e.x = nx; e.z = nz; }
      }
    }
    if (this.updateHazards(dt, positions)) return 'wipe';
    if (!this.cleared && this.obj && tickObjective(this.obj, this.objCtx(positions))) return this.completeSection();
    if (this.obj?.failed) { this.notes.push({ type: 'sapling' }); this.wipe(); return 'wipe'; }       // Step 60: the sapling wilted: the section starts over like after a wipe
    return null;
  }
  // ---- Step 59: falling icicles. A section with `icicles: { zones, every, max }` drops them one at a time on a member standing in a zone: a circle shows for COMBAT.icicle.delay s, then
  // the icicle hits everything inside it from ABOVE (kind 'icicle' is not a ground attack: only the dodge's i-frames avoid it, hopping over it does not). Positions come from the run's own
  // counter, so the host alone decides (replicas just read `this.hazards`).
  updateHazards(dt, positions) {
    const cfg = this.sectionDef.icicles, c = COMBAT.icicle;
    if (!cfg) { if (this.hazards.length) this.hazards = []; return false; }
    const live = [];
    for (const h of this.hazards) {
      if (h.at > this.time) { live.push(h); continue; }
      this.effect('icicle', h.x, h.z, 'land');
      for (const key of Object.keys(this.members)) {
        const p = positions[key];
        if (p && !this.members[key].downed && Math.hypot(p.x - h.x, p.z - h.z) <= h.radius && this.damage(key, c.damage, 'icicle', positions, h)) { this.hazards = []; return true; }
      }
    }
    this.hazards = live;
    const n = Object.keys(this.members).length, o = this.area.origin;
    if (this.time < this.hazardNext || this.hazards.length >= Math.min(5, c.max + n - 1)) return false;
    const inZone = Object.keys(this.members).filter((k) => {
      const p = positions[k], m = this.members[k];
      return !m.downed && p && !this.isSafe(p.x, p.z, 1) && cfg.zones.some((z) => Math.abs(p.x - o.x - z.x) <= z.w / 2 && Math.abs(p.z - o.z - z.z) <= z.d / 2);
    });
    if (!inZone.length) { this.hazardNext = this.time + 0.5; return false; }
    const key = inZone[this.hazardCount % inZone.length], p = positions[key], k = this.hazardCount++;
    const hash = (a) => { const v = Math.sin(a * 127.1 + this.run * 311.7) * 43758.5453; return v - Math.floor(v); };
    const ang = hash(k + 1) * Math.PI * 2, dist = hash(k + 7) * 2.2;
    let x = p.x + Math.cos(ang) * dist, z = p.z + Math.sin(ang) * dist;
    if (!this.g.inArea(x, z, 0.4) || this.isSafe(x, z, 0.5)) { x = p.x; z = p.z; }
    this.hazards.push({ id: ++this.nextFX, x, z, at: this.time + c.delay, radius: c.radius });
    this.hazardNext = this.time + cfg.every / (1 + 0.25 * (n - 1));
    return false;
  }
  snapshot() { return JSON.parse(JSON.stringify({ time: this.time, progress: this.progress, open: this.open, active: this.active, serial: this.serial, run: this.run, members: this.members, enemies: this.enemies, projectiles: this.projectiles, pprojectiles: this.pprojectiles, effects: this.effects, nextFX: this.nextFX, cleared: this.cleared, section: this.section, pedestals: this.pedestals, hazards: this.hazards, patches: this.patches, clouds: this.clouds, bursts: this.bursts,
    areaId: this.areaId, mode: this.mode, from: this.from, obj: this.obj })); }
  load(s) {
    const { areaId, obj, ...rest } = s;
    Object.assign(this, rest);
    if ((areaId || 'wildroot') !== this.areaId || !this.g) this.setArea(areaId || 'wildroot');
    this.obj = obj || null; this.pedestals = rest.pedestals || []; this.hazards = rest.hazards || [];     // (an older snapshot has none)
    this.patches = rest.patches || []; this.clouds = rest.clouds || []; this.bursts = rest.bursts || [];
    this.g.setOpen(this.openGates());                       // (derived from the section index, so a snapshot never carries gate state of its own)
  }
}
