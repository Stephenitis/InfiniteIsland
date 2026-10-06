// Where the eight Night-Bloom seeds are found on Emberleaf (PLAN Step 38a): the pure, deterministic plan (no three.js; Node-tested in test/seeds.test.js). It runs AFTER the placement and changes
// nothing in it: the breadfruit tree, the hibiscus and the plumeria of three finds are existing props picked from the placement (seeded), the other five spots are free ground found by snapping a design
// anchor (config SEEDS.anchors, island-local) to the nearest suitable point. Gameplay (interactables, requests) is world/seeds.js; the rules (time of day, tool) are game/seedLogic.js.
//
//   planEmberSeeds(island, mod, placement)  -> [{ id, kind, x, z, y, ref? }] in FLOWERS order. kind: 'dig' (shovel), 'shake' (ref = the placement tree record), 'boing' (ref = the placement flower
//       record), 'pick' (a glint to pick up), 'steam' (the spring's steaming rocks). Cached per terrain module.
import { SEEDS as S } from '../../config.js';
import { mulberry32 } from '../../utils/rng.js';
import { EMBER_FEATURES as F } from './ember.js';
import { landingFor, polyDist } from './scatter.js';
import { planEmberGathering, planEmberTools } from './emberGathering.js';
import { FLOWER_IDS } from '../../game/flowers.js';
import { SEED_RULES } from '../../game/seedLogic.js';

const cache = new WeakMap();

export function planEmberSeeds(island, mod, placement) {
  if (cache.has(mod)) return cache.get(mod);
  const lx = (v) => island.x + v.x, lz = (v) => island.z + v.z;          // island-local -> world
  const landing = landingFor(island), rng = mulberry32(island.seed + 3801);
  const walk = (x, z) => mod.walkable(x, z) && mod.height(x, z) > 0.05;
  const clear = (x, z, pad) => placement.solids.every((s) => Math.hypot(s.x - x, s.z - z) > s.r + pad);
  const garden = { x: island.x + 15, z: island.z + 43.3 };
  const nearLane = (x, z, d) => placement.lanes.some((l) => polyDist(l, x, z) < d);
  // other interactables that could win the "nearest" contest next to a flower: gathering plants, dig spots, tools and the other interactive flowers (trees / boulders come from the solids)
  // Original five tools determine the established seed props; extra tools must not reshuffle seeds.
  const gather = planEmberGathering(island, mod), others = [...gather.herbs, ...gather.digs, ...planEmberTools(island, mod).slice(0, 5)];
  const isolated = (p) => placement.solids.every((s) => (s.x === p.x && s.z === p.z) || Math.hypot(s.x - p.x, s.z - p.z) > s.r + 2.6)
    && others.every((o) => Math.hypot(o.x - p.x, o.z - p.z) > 3) && placement.flowers.every((f) => !f.interactive || f === p || Math.hypot(f.x - p.x, f.z - p.z) > 3.5);
  const pickOne = (list, take) => {                                       // a seeded pick among props that are easy to reach, stand alone and are not trivially close to the landing / garden
    const ok = list.filter((p) => isolated(p) && Math.hypot(p.x - landing.x, p.z - landing.z) > 28 && Math.hypot(p.x - garden.x, p.z - garden.z) > 14 && nearLane(p.x, p.z, 16) && !take.some((t) => Math.hypot(t.x - p.x, t.z - p.z) < 12));
    const pool = ok.length ? ok : list;
    return pool[Math.floor(rng() * pool.length)];
  };
  const spots = {}, taken = [];
  const put = (id, x, z, ref = null) => { spots[id] = { id, kind: SEED_RULES[id].kind, x, z, y: mod.height(x, z), ...(ref ? { ref } : {}) }; taken.push({ x, z }); };

  // Ember Lily: warm ash by the viewing ledge: the end of the walking route up the west-north-west ramp (placement.lanes[3]), a few units in towards the crater rim
  {
    const end = placement.lanes[3][placement.lanes[3].length - 1];
    const vx = island.x + F.volcano.x, vz = island.z + F.volcano.z, d = Math.hypot(end[0] - vx, end[1] - vz);
    let spot = { x: end[0], z: end[1] };
    for (const lift of [S.anchors.ashLift, S.anchors.ashLift * 0.5, 0]) {
      const k = (d - lift) / d, x = vx + (end[0] - vx) * k, z = vz + (end[1] - vz) * k;
      if (walk(x, z) && [0.25, 0.5, 0.75].every((u) => walk(end[0] + (x - end[0]) * u, end[1] + (z - end[1]) * u))) { spot = { x, z }; break; }
    }
    put('ember-lily', spot.x, spot.z);
  }

  // Moon Orchid: one particular breadfruit tree (shake it at night)
  put('moon-orchid', ...(t => [t.x, t.z, t])(pickOne(placement.trees.filter((t) => t.layer === 'breadfruit'), taken)));

  // Lagoon Lotus: the lagoon's water edge, on the shore angle nearest the design angle that has dry walkable ground just outside the water
  {
    const cx = lx(F.lagoon), cz = lz(F.lagoon);
    let best = null;
    for (const da of [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 1, -1]) {
      const a = S.anchors.lotusAngle + da;
      for (let d = 14; d >= 6; d -= 0.1) {
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (mod.height(x, z) < 0.3) { const bx = cx + Math.cos(a) * (d + 0.5), bz = cz + Math.sin(a) * (d + 0.5); if (walk(bx, bz) && clear(bx, bz, 0.8)) best = { x: bx, z: bz }; break; }
      }
      if (best) break;
    }
    put('lagoon-lotus', best.x, best.z);
  }

  // Steam Fern: the hot spring's steaming rocks, on the rim at the design angle
  {
    const cx = lx(F.spring), cz = lz(F.spring);
    let best = null;
    for (const da of [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9]) {
      const a = S.anchors.springAngle + da;
      for (const d of [F.spring.r + 1.1, F.spring.r + 1.6, F.spring.r + 2.2]) {
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (walk(x, z) && clear(x, z, 0.8)) { best = { x, z }; break; }
      }
      if (best) break;
    }
    put('steam-fern', best.x, best.z);
  }

  // Glow Hibiscus / Firefly Plumeria: one particular interactive flower each
  const flowers = placement.flowers.filter((f) => f.interactive);
  put('glow-hibiscus', ...(f => [f.x, f.z, f])(pickOne(flowers.filter((f) => f.layer === 'hibiscus'), taken)));
  put('firefly-plumeria', ...(f => [f.x, f.z, f])(pickOne(flowers.filter((f) => f.layer === 'plumeria'), taken)));

  // Starfruit Vine: the dead end of the ledge behind the waterfall
  put('starfruit-vine', mod.falls.data.ledgeSpot.x, mod.falls.data.ledgeSpot.z);

  // Sunbell: the black-sand beach, the nearest suitable sand to the design anchor
  {
    const ax = lx(S.anchors.beach), az = lz(S.anchors.beach);
    let best = null;
    for (let r = 0; r <= 40 && !best; r += 1) {
      for (let k = 0; k < 24 && !best; k++) {
        const a = (k / 24) * Math.PI * 2, x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r;
        if (mod.groundType(x, z) === 'blacksand' && walk(x, z) && mod.inland(x, z) > 1.2 && clear(x, z, 1.2) && taken.every((t) => Math.hypot(t.x - x, t.z - z) > 6)) best = { x, z };
      }
    }
    put('sunbell', best.x, best.z);
  }

  const plan = FLOWER_IDS.map((id) => spots[id]);
  cache.set(mod, plan);
  return plan;
}
