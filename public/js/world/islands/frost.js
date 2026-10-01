// Frostpine Isle (Step 27a): the alpine island, centred north of home. Pure, deterministic height + ground-type functions
// (island-local feature coordinates are offsets from the island centre; the functions take WORLD x, z).
//
// Tiers, from the coast inwards:
//   * beach ring    (h 0.3)  sand, with a headland ("spit") reaching south towards home for the bridge landing
//   * forest meadow (h 1.5)  grass
//   * foothills     (h 3.5)  a broad, gently rising mid tier (walkable everywhere)
//   * alpine plateau (h 8.2) snow, steep cliffs all round except three explicit walkable ramps (the home rampMask idea),
//                            with a few steep snowy peaks standing on it (not walkable)
//   * frozen lake   (h 0.45) a flat basin just ABOVE water level (the ocean plane must not fill it), ground type 'ice'
// Ground types: 'sand' 'wetsand' 'grass' 'dirt' 'snow' 'rock' 'ice' 'water'.
import { createNoise2D, fbm } from '../../utils/noise.js';
import { WATER_LEVEL, DEEP_WATER_BLOCK, HEIGHT_MEADOW } from '../../config.js';
import { sstep, lerp, angleDiff, beachHeight, meadowRise, makeCoast } from './util.js';

const MAX_WALK_SLOPE = 0.8;
const FOOT_H = 2.0;                    // foothill rise on top of the meadow (-> 3.5)
const PLATEAU_H = 8.2;                 // alpine plateau height (home's is 3.5)
const LAKE_H = 0.45;                   // frozen lake surface: above WATER_LEVEL so it is land, not ocean
const SNOW_LINE = 6.0;

// Feature layout, island-local (x east, z south). The landing spit is at local (9.5, +114.5).
export const FROST_FEATURES = {
  foothills: { x: 0, z: -22, r: 74 },
  plateau: { x: 0, z: -44, r: 37 },
  rampAngles: [Math.PI / 2, 0.15, 3.55],        // atan2(dz, dx) from the plateau centre: south, east, west-north-west
  peaks: [                                       // steep snowy cones standing on / behind the plateau
    { x: -14, z: -62, r: 10.5, h: 9.0 },
    { x: 17, z: -57, r: 8.5, h: 7.0 },
    { x: 0, z: -86, r: 15, h: 13.5 },
    { x: -26, z: -30, r: 7, h: 5.0 },
  ],
  lake: { x: 52, z: 38, rx: 15, rz: 11 },        // frozen lake
};

export function createFrostIsland(island) {
  const cx = island.x, cz = island.z;
  const nA = createNoise2D(island.seed);
  const nB = createNoise2D(island.seed + 7);
  const F = FROST_FEATURES;
  const spits = [{ ax: cx + 9.5, az: cz + 80, bx: cx + 9.5, bz: cz + 111, r: 9.5 }];
  const inland = makeCoast(island, { spits });

  function rampMask(lx, lz) {
    const a = Math.atan2(lz - F.plateau.z, lx - F.plateau.x);
    let m = 0;
    for (const ra of F.rampAngles) m = Math.max(m, 1 - sstep(0.2, 0.42, angleDiff(a, ra)));
    return m;
  }

  /** Elliptical distance to the lake centre, in "11 u" units (< 11 = inside the flat ice), before the shore wobble. */
  const lakeBase = (x, z) => Math.hypot((x - cx - F.lake.x) / (F.lake.rx / 11), (z - cz - F.lake.z) / (F.lake.rz / 11));
  /** lakeBase plus the noisy shore. Shared by height, ground type and paint. */
  const lakeDist = (x, z) => lakeBase(x, z) + 0.7 * nB(x * 0.2 + 5, z * 0.2);

  const snowLine = (x, z) => SNOW_LINE + 1.3 * nA(x * 0.09 + 31, z * 0.09 - 17);

  function height(x, z) {
    const lx = x - cx, lz = z - cz;
    const t = inland(x, z);
    let h = beachHeight(t) + meadowRise(t);
    if (t > 6) {
      // Foothills: a soft disc raising the mid tier; wide edges so it is walkable all round.
      const fd = Math.hypot(lx - F.foothills.x, lz - F.foothills.z) + 7 * nA(lx * 0.03 + 2, lz * 0.03 - 4);
      h += FOOT_H * (1 - sstep(F.foothills.r * 0.5, F.foothills.r, fd)) * sstep(10, 24, t);

      // Alpine plateau with ramp wedges that stretch the cliff edge into a walkable slope.
      const pf = F.plateau.r - Math.hypot(lx - F.plateau.x, lz - F.plateau.z) + 3.2 * nA(lx * 0.05 + 20, lz * 0.05 - 9);
      if (pf > 0) h += (PLATEAU_H - HEIGHT_MEADOW - FOOT_H) * sstep(0, 2.6 + 15 * rampMask(lx, lz), pf);

      // Snowy peaks
      for (const p of F.peaks) {
        const d0 = Math.hypot(lx - p.x, lz - p.z);
        if (d0 > p.r + 1.5) continue;                      // cheap reject before the noise
        const d = d0 + 1.2 * nB(lx * 0.12, lz * 0.12);
        if (d < p.r) h += p.h * Math.pow(1 - d / p.r, 1.05);
      }

      // Rolling detail
      h += sstep(8, 16, t) * 0.32 * (1 - 0.7 * sstep(3.5, 6, h)) * fbm(x * 0.045, z * 0.045, 3, 2, 0.5, nB);   // calmer snowfields
    }

    // Frozen lake basin: a flat shelf slightly above the sea, with soft banks.
    if (lakeBase(x, z) < 17.8) {
      const ld = lakeDist(x, z);
      if (ld < 17) h = lerp(h, LAKE_H, 1 - sstep(11, 16.5, ld));
    }
    return h;
  }

  function slopeAt(x, z, e) {
    const gx = (height(x + e, z) - height(x - e, z)) / (2 * e);
    const gz = (height(x, z + e) - height(x, z - e)) / (2 * e);
    return Math.hypot(gx, gz);
  }

  function groundType(x, z) {
    const h = height(x, z);
    if (h < WATER_LEVEL - 0.03) return 'water';
    if (h < WATER_LEVEL + 0.2) return 'wetsand';
    if (lakeDist(x, z) < 10.5 && h < LAKE_H + 0.25) return 'ice';
    const slope = slopeAt(x, z, 0.5);
    const snowy = h > snowLine(x, z);
    if (slope > 0.62 && h > 0.5) return snowy && slope < 1.4 ? 'snow' : (h > 3.2 ? 'rock' : 'dirt');
    if (snowy) return 'snow';
    if (inland(x, z) < 10.5) return 'sand';
    return 'grass';
  }

  function walkable(x, z) {
    if (height(x, z) < WATER_LEVEL - DEEP_WATER_BLOCK) return false;
    return slopeAt(x, z, 0.4) < MAX_WALK_SLOPE;
  }

  /** Masks the mesh painter uses (kept here so colours and gameplay agree on where snow / ice are). */
  function paintInfo(x, z, h) {
    return {
      t: inland(x, z),
      snow: sstep(-0.6, 0.6, h - snowLine(x, z)),
      ice: 1 - sstep(9.5, 11.5, lakeDist(x, z)),
    };
  }

  return { id: island.id, height, groundType, walkable, inland, paintInfo };
}
