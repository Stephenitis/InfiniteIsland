// Emberleaf Isle (Step 27a): the volcanic jungle island, centred east of home. Pure, deterministic height + ground-type
// functions (feature coordinates are offsets from the island centre; the functions take WORLD x, z).
//
// Tiers, from the coast inwards:
//   * beach ring     (h 0.3)  gold sand with black-sand stretches; a headland ("spit") reaches west towards home
//   * jungle lowland (h 1.5)  lush grass, plus a lagoon basin (below sea level, filled by the ocean like home's pond)
//   * terraced apron          three gentle terraces climbing towards the volcano (walkable)
//   * volcano cone            steep cliffs at the cone foot except two explicit walkable ramps up to a viewing ledge (h ~11-14, tilting up)
//                             just below the crater rim (peak ~16); the crater floor is lava (never walkable)
//   * hot spring              a small shallow basin on the lowland, ground type 'hotspring' (walkable)
//   * the waterfall          (Step 37c, emberFalls.js) a spring pool on the cone, a rock lip, the plunge pool with a ledge behind the falling water, a terrace cascade and a stream to the lagoon
//   * the garden hearth pad   (Step 37a) the middle terrace is levelled to the hearth's height inside EMBER_GARDEN.flat.r, blending back by flat.fade (the terraces themselves stay)
// Ground types: 'sand' 'blacksand' 'wetsand' 'grass' 'dirt' 'rock' 'lava' 'hotspring' 'water'.
import { createNoise2D, fbm } from '../../utils/noise.js';
import { WATER_LEVEL, DEEP_WATER_BLOCK, EMBER_GARDEN, EMBER_WATERFALL } from '../../config.js';
import { sstep, lerp, angleDiff, beachHeight, meadowRise, makeCoast } from './util.js';
import { createFalls } from './emberFalls.js';

const MAX_WALK_SLOPE = 0.8;
const CLIFF_RISE = 2.5;           // volcano cone cliff band (terraces top out at 5.7); the cone term below lifts the ledge towards the rim
const CONE_H = 9.0;               // concave cone: CONE_H * (1 - d / CONE_R)^2, so the flanks steepen towards the rim
const CONE_R = 70;
const RIM_BUMP = 1.5;
const CRATER_FLOOR = 7.0;
const LAGOON_BOTTOM = -1.2;
const SPRING_DIP = 0.55;

// Feature layout, island-local (x east, z south). The landing spit is at local (-117, -46).
export const EMBER_FEATURES = {
  volcano: { x: 15, z: -5 },
  terraces: [56, 49, 42],          // terrace riser radii (each +1.4 over 7 u)
  cliffR: 38,                      // radius of the cone's cliff band (the ramps stretch it inwards to the rim)
  rimR: 11,                        // crater rim ring radius
  craterR: 6.4,                    // lava floor radius
  rampAngles: [-2.85, 0.6],        // atan2(dz, dx) from the volcano centre: west-north-west (towards the bridge), east-south-east
  lagoon: { x: -45, z: 52, r: 8 },
  spring: { x: 58, z: -52, r: 3.4 },
  waterfall: EMBER_WATERFALL,      // Step 37c: the fall line, plunge pool, stream and the built design (`falls`); see emberFalls.js
};

export function createEmberIsland(island) {
  const cx = island.x, cz = island.z;
  const nA = createNoise2D(island.seed);
  const nB = createNoise2D(island.seed + 7);
  const nC = createNoise2D(island.seed + 23);
  const F = EMBER_FEATURES;
  const spits = [{ ax: cx - 80, az: cz - 46, bx: cx - 112, bz: cz - 46, r: 9.5 }];
  const inland = makeCoast(island, { spits });

  function rampMask(angle) {
    let m = 0;
    for (const ra of F.rampAngles) m = Math.max(m, 1 - sstep(0.22, 0.42, angleDiff(angle, ra)));
    return m;
  }
  const volcanoDist = (x, z) => Math.hypot(x - cx - F.volcano.x, z - cz - F.volcano.z);
  const lagoonBase = (x, z) => Math.hypot((x - cx - F.lagoon.x) / 1.1, z - cz - F.lagoon.z);
  const springBase = (x, z) => Math.hypot(x - cx - F.spring.x, z - cz - F.spring.z);
  const lagoonDist = (x, z) => lagoonBase(x, z) + 0.6 * nB(x * 0.22 + 3, z * 0.22);
  const springDist = (x, z) => springBase(x, z) + 0.35 * nB(x * 0.35 - 8, z * 0.35);
  /** Lava floor radius wobbles a little so the crater is not a perfect circle. */
  const craterRadius = (x, z) => F.craterR + 0.6 * nC(x * 0.3, z * 0.3);

  function baseHeight(x, z) {
    const lx = x - cx, lz = z - cz;
    const t = inland(x, z);
    let h = beachHeight(t) + meadowRise(t);
    let d = 99;
    if (t > 6) {
      const dvx = lx - F.volcano.x, dvz = lz - F.volcano.z;
      d = Math.hypot(dvx, dvz);
      if (d < 76) {
        if (d < CONE_R) { const k = 1 - d / CONE_R; h += CONE_H * k * k; }   // sloped, slightly concave volcano flanks
        // Terraced apron: three gentle steps climbing towards the cone.
        const wob = 2.2 * nA(lx * 0.04 + 5, lz * 0.04 - 2);
        for (const r of F.terraces) h += 1.4 * (1 - sstep(r, r + 4.5, d + wob));
        // Cone cliff band, stretched into walkable ramps inside the ramp wedges.
        const pf = F.cliffR - d + 2.0 * nA(lx * 0.06 + 20, lz * 0.06 - 9);
        if (pf > 0) h += CLIFF_RISE * sstep(0, 3.2 + 16 * rampMask(Math.atan2(dvz, dvx)), pf);
        // Rim: a ring bump the ledge climbs to, then the crater wall drops to the lava floor.
        if (d < 19) {
          h += RIM_BUMP * (1 - sstep(0, 7.5, Math.abs(d - F.rimR)));
          const cr = craterRadius(x, z);
          h = lerp(h, CRATER_FLOOR, 1 - sstep(cr - 0.8, cr + 3.4, d));
        }
      }
      h += sstep(8, 16, t) * 0.42 * fbm(x * 0.045, z * 0.045, 3, 2, 0.5, nB) * (d > 44 ? 1 : 0.1);   // keep the volcano's rock smooth (toon bands turn small bumps into noise)
    }

    // Lagoon (below the waterline, so the ocean plane fills it) and hot spring (shallow dip, stays above the water).
    if (lagoonBase(x, z) < 15) {                    // cheap reject before the noise
      const ld = lagoonDist(x, z);
      if (ld < 14) h = lerp(h, LAGOON_BOTTOM, 1 - sstep(F.lagoon.r - 4.5, 13.5, ld));
    }
    if (springBase(x, z) < 7) {
      const sd = springDist(x, z);
      if (sd < 6.5) h -= SPRING_DIP * (1 - sstep(F.spring.r - 0.8, 6.4, sd));
    }
    return h;
  }

  // The waterfall (Step 37c): carves the spring pool, channel, plunge pool, ledge, cascade and stream into the natural height field (pure, see emberFalls.js).
  const falls = createFalls(island, F.volcano, baseHeight);

  // The garden hearth pad (Step 37a): one small flat disc under the hearth so the ring, the four seats and the feast stand level. The natural height at the hearth is
  // sampled ONCE; everything near is eased to it, so there is no cliff and the terrace keeps its shape beyond flat.fade.
  const gardenX = cx + EMBER_GARDEN.x, gardenZ = cz + EMBER_GARDEN.z;
  const gardenH = baseHeight(gardenX, gardenZ);
  function height(x, z) {
    const h = falls.carve(x, z, baseHeight(x, z));
    const d = Math.hypot(x - gardenX, z - gardenZ);
    if (d >= EMBER_GARDEN.flat.fade) return h;
    return lerp(gardenH, h, sstep(EMBER_GARDEN.flat.r, EMBER_GARDEN.flat.fade, d));
  }

  function slopeAt(x, z, e) {
    const gx = (height(x + e, z) - height(x - e, z)) / (2 * e);
    const gz = (height(x, z + e) - height(x, z - e)) / (2 * e);
    return Math.hypot(gx, gz);
  }

  /** Black-sand stretches of the beach (low-frequency noise along the coast), 0..1 with a crisp edge at 0.5 (the ground-type threshold). */
  const blackSandMask = (x, z) => sstep(0.165, 0.185, nC(x * 0.022 + 7, z * 0.022 - 3));

  const inLava = (x, z, margin = 0) => volcanoDist(x, z) < craterRadius(x, z) + margin;

  function groundType(x, z) {
    const h = height(x, z);
    if (h < WATER_LEVEL - 0.03) return 'water';
    if (inLava(x, z)) return 'lava';
    const sy = falls.surface(x, z);                                // Step 37c: the waterfall's pools, channels and stream
    if (sy === sy) {
      if (h < sy - 0.03) return falls.fordAt(x, z) ? 'wetsand' : 'water';
      if (h < sy + 0.3) return falls.rockAt(x, z) ? 'rock' : 'wetsand';
    }
    if (falls.rockAt(x, z)) return 'rock';
    if (h < WATER_LEVEL + 0.2) return 'wetsand';
    if (springDist(x, z) < F.spring.r) return 'hotspring';
    const slope = slopeAt(x, z, 0.5);
    if (slope > 0.62 && h > 0.5) return h > 3.5 ? 'rock' : 'dirt';
    if (h > 7 && volcanoDist(x, z) < 39) return 'rock';
    if (inland(x, z) < 10.5) return blackSandMask(x, z) > 0.5 ? 'blacksand' : 'sand';
    return 'grass';
  }

  function walkable(x, z) {
    if (height(x, z) < WATER_LEVEL - DEEP_WATER_BLOCK) return false;
    if (inLava(x, z, 1.0)) return false;           // forgiving margin around the lava
    if (falls.blocked(x, z, height(x, z))) return false;   // the deep middle of the plunge pool
    return slopeAt(x, z, 0.4) < MAX_WALK_SLOPE;
  }

  /** Masks the mesh painter uses (kept here so colours and gameplay agree on where lava / black sand are). */
  function paintInfo(x, z, h) {
    const d = volcanoDist(x, z);
    const cr = craterRadius(x, z);
    const fm = falls.paintMasks(x, z, h ?? height(x, z));
    return {
      fallsRock: fm.rock,                              // Step 37c: the ledge / bluff / pool shore stone and the dark wet stone beside the water
      fallsWet: fm.wet,
      t: inland(x, z),
      black: blackSandMask(x, z),
      lava: 1 - sstep(cr - 0.5, cr + 0.9, d),
      spring: 1 - sstep(F.spring.r - 0.4, F.spring.r + 0.9, springDist(x, z)),
      volcano: 1 - sstep(32, 44, d),                // dark volcanic rock around the cone
    };
  }

  return { id: island.id, height, groundType, walkable, inland, paintInfo, gardenH, gardenX, gardenZ, falls };
}
