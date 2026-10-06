// Storybook Cay (Step 48): a small, soft, papery meadow west of home. Pure, deterministic height + ground-type functions
// (feature coordinates are offsets from the island centre, STORY in config.js; the functions take WORLD x, z).
//
// Tiers, from the coast inwards:
//   * beach ring     (h 0.3)  pale sand, with a headland ("spit") reaching EAST towards home for the bridge landing
//   * meadow         (h 1.5)  gentle rolling grass (calm: nothing steep anywhere except the shore)
//   * the reading nook (STORY.pad)  the meadow is levelled under the giant book / awning / book stand, blending back by pad.fade
//   * the reading hill (STORY.hill) a soft rise on the north-west with the stacked-book shelves round its foot
//   * the ink pond   (STORY.ink)    a shallow dark puddle (just ABOVE the sea, ground type 'wetsand', walkable): painted ink-blue by the terrain painter
//   * the ribbon path (STORY.path)  a cream trail from the landing to the nook (ground type 'dirt')
// Ground types: 'sand' 'wetsand' 'grass' 'dirt' 'water'.
import { createNoise2D, fbm } from '../../utils/noise.js';
import { WATER_LEVEL, DEEP_WATER_BLOCK, STORY } from '../../config.js';
import { sstep, lerp, beachHeight, meadowRise, makeCoast } from './util.js';

const MAX_WALK_SLOPE = 0.8;
const INK_DIP = 0.3;                     // how far the ink pond sits below the meadow (stays above the water level)

/** Distance from (x, z) to a polyline of [x, z] points (world coordinates). */
function polyDistance(poly, x, z) {
  let best = Infinity;
  for (let i = 0; i + 1 < poly.length; i++) {
    const ax = poly[i][0], az = poly[i][1], bx = poly[i + 1][0], bz = poly[i + 1][1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const u = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / l2));
    const d = Math.hypot(x - (ax + dx * u), z - (az + dz * u));
    if (d < best) best = d;
  }
  return best;
}

export function createStoryIsland(island) {
  const cx = island.x, cz = island.z;
  const nA = createNoise2D(island.seed);
  const nB = createNoise2D(island.seed + 7);
  const spits = [{ ax: cx + 30, az: cz, bx: cx + 51, bz: cz, r: 8 }];   // the landing spit (the bridge lands at local (+52, 0); its shore stays west of home's x = -79 circle)
  const inland = makeCoast(island, { spits, amp1: 3.0, amp2: 1.4 });
  const pathWorld = STORY.path.map(([px, pz]) => [cx + px, cz + pz]);
  const inkX = cx + STORY.ink.x, inkZ = cz + STORY.ink.z;
  const inkDist = (x, z) => Math.hypot(x - inkX, z - inkZ) + 0.45 * nA(x * 0.3 + 4, z * 0.3 - 2);
  const pathDist = (x, z) => polyDistance(pathWorld, x, z);

  function baseHeight(x, z) {
    const lx = x - cx, lz = z - cz;
    const t = inland(x, z);
    let h = beachHeight(t) + meadowRise(t);
    if (t > 6) {
      h += sstep(8, 16, t) * 0.3 * fbm(x * 0.05, z * 0.05, 3, 2, 0.5, nB);        // calm rolling meadow
      const hd = Math.hypot(lx - STORY.hill.x, lz - STORY.hill.z) + 2.5 * nA(lx * 0.06 + 9, lz * 0.06 - 4);
      h += STORY.hill.h * (1 - sstep(STORY.hill.r * 0.4, STORY.hill.r, hd)) * sstep(8, 18, t);
    }
    const ink = Math.hypot(x - inkX, z - inkZ);
    if (ink < STORY.ink.r + 2) h -= INK_DIP * (1 - sstep(STORY.ink.r - 1.4, STORY.ink.r + 1.2, inkDist(x, z)));
    return h;
  }

  // The nook pad: the natural height at its centre is sampled ONCE and everything near is eased to it (no cliff, no steeper slope than the natural one).
  const padX = cx + STORY.pad.x, padZ = cz + STORY.pad.z;
  const padH = baseHeight(padX, padZ);
  function height(x, z) {
    const h = baseHeight(x, z);
    const d = Math.hypot(x - padX, z - padZ);
    if (d >= STORY.pad.fade) return h;
    return lerp(padH, h, sstep(STORY.pad.r, STORY.pad.fade, d));
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
    if (inkDist(x, z) < STORY.ink.r - 0.4) return 'wetsand';
    if (pathDist(x, z) < STORY.pathHalf) return 'dirt';
    if (inland(x, z) < 10.5) return 'sand';
    return 'grass';
  }

  function walkable(x, z) {
    if (height(x, z) < WATER_LEVEL - DEEP_WATER_BLOCK) return false;
    return slopeAt(x, z, 0.4) < MAX_WALK_SLOPE;
  }

  /** Masks the mesh painter uses (kept here so colours and gameplay agree on where the path / ink are). */
  function paintInfo(x, z, h) {
    return {
      t: inland(x, z),
      path: 1 - sstep(STORY.pathHalf * 0.8, STORY.pathHalf + 1.0, pathDist(x, z)),
      ink: 1 - sstep(STORY.ink.r - 1.0, STORY.ink.r + 0.6, inkDist(x, z)),
      pad: 1 - sstep(STORY.pad.r, STORY.pad.fade, Math.hypot(x - padX, z - padZ)),
      hill: sstep(0.6, 2.2, h - 1.5),
    };
  }

  return { id: island.id, height, groundType, walkable, inland, paintInfo, pathDist, inkDist, padH, padX, padZ, pathWorld };
}
