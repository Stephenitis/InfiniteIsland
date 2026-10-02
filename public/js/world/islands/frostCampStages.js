// The Frostpine camp's three build stages, pure layout (PLAN Step 35b): where every piece of comfort 1 / 2 / 3 stands. No three.js, so the visuals
// (frostCampStageVisuals.js), the gameplay colliders (world/campStages.js) and the Node tests share it. Everything lives inside the camp's reserved spots
// (config FROST_CAMP.build / dens / tailStump, islands/frostCamp.js campReserved): the windbreak, woodpile, trough, four lantern posts and the shelter.
//
//   const L = campStageLayout(island)      -> {
//     fire {x, z}                          the camp fire (world)
//     stage1.windbreak { logs[{x,z,yaw,len,row,col}], posts[{x,z,h}], colliders[{x,z,r}], radius }   a curved log wall on the NORTH side (the back, seen from the camera)
//     stage1.woodpile  { x, z, yaw, colliders }                                                       a stack of split logs
//     stage1.benches   4 log benches at the four seat spots (the campfire's own bench layout; world/campfire.js builds them, this only lists the footprints for tests)
//     stage2.dens      [{ x, z, yaw, r }]  one straw-and-pine-bough bed per critter den spot (all eight; `yaw` = facing the fire)
//     stage2.posts     [{ x, z, yaw, h }]  four lantern posts with a crystal lantern each, `crystal` = the glow point (world x, z; y is height above the ground)
//     stage2.trough    { x, z, yaw, colliders }
//     stage2.bunting   [{ a, b }]          indices into stage2.posts that a string of flags joins
//     stage3.shelter   { x, z, hw, hl, ridge, eave, posts[{x,z}], colliders, lanterns[{x, z, y}] }  the A-frame (ridge along Z, the open gable faces the camera / south)
//     stage3.boxes     [{ x, z, yaw }]     edelweiss flower boxes beside the shelter
//     stage3.pines     [{ x, z, s, yaw }]  young pines planted round the clearing
//     colliders        { 1: [...], 2: [...], 3: [...] }    circle colliders each stage ADDS (world/campStages.js registers / removes them with the comfort level)
//     footprints       { 1: [{x,z,r}], 2: [...], 3: [...] }    every solid footprint of a stage (tests: inside the clearing, clear of the fire, seats, trail, dens)
//   Offsets are from the fire; "north" is -Z (the back of the camp from the default camera).
import { FROST_CAMP, FIRES } from '../../config.js';
import { campCentre, campReserved } from './frostCamp.js';
import { mulberry32 } from '../../utils/rng.js';

export const WIND_R = 5.2;                 // the windbreak arc's radius round the fire (u)
export const WIND_HALF = 0.32;             // half angle of the arc (rad, from north)
export const POST_H = 2.6;                 // lantern post height (u)
export const SHELTER = { hw: 1.5, hl: 2.0, ridge: 3.3, eave: 1.5, postH: 1.95 };   // half width (x), half length (z), ridge / eave heights, post height

export function campStageLayout(island) {
  const c = campCentre(island);
  const R = campReserved(island);
  const at = (dx, dz) => ({ x: c.x + dx, z: c.z + dz });
  const out = { fire: { ...c }, stage1: {}, stage2: {}, stage3: {} };

  // ---- stage 1: the windbreak (3 rows of logs along an arc behind the fire, a post at each end) --------------------------------------------------------
  {
    const logs = [], posts = [], colliders = [];
    const at2 = (th, r = WIND_R) => at(Math.sin(th) * r, -Math.cos(th) * r);
    const step = (WIND_HALF * 2) / 3;                                        // three full logs per row, ~1.1 u each
    for (let row = 0; row < 3; row++) {
      // the middle row is staggered: two full logs and two halves
      const edges = row === 1 ? [-WIND_HALF, -WIND_HALF + step / 2, -WIND_HALF + step * 1.5, WIND_HALF - step / 2, WIND_HALF] : [-WIND_HALF, -WIND_HALF + step, -WIND_HALF + step * 2, WIND_HALF];
      for (let i = 0; i + 1 < edges.length; i++) {
        const a = at2(edges[i]), b = at2(edges[i + 1]), mid = at2((edges[i] + edges[i + 1]) / 2);
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const col = Math.min(2, Math.floor(((edges[i] + edges[i + 1]) / 2 + WIND_HALF) / (WIND_HALF * 2 / 3)));
        logs.push({ x: mid.x, z: mid.z, yaw: -Math.atan2(b.z - a.z, b.x - a.x), len: +len.toFixed(3), row, col });
      }
    }
    for (const th of [-WIND_HALF, WIND_HALF]) { const p = at2(th); posts.push({ x: p.x, z: p.z, h: 1.75, col: th < 0 ? 0 : 2 }); }
    for (const th of [-0.3, -0.15, 0, 0.15, 0.3]) { const p = at2(th); colliders.push({ x: +p.x.toFixed(3), z: +p.z.toFixed(3), r: 0.45 }); }
    const wp = at(-6.4, 2.2);
    const woodpile = { x: wp.x, z: wp.z, yaw: 0.25, colliders: [{ x: wp.x, z: wp.z, r: 0.8 }] };
    out.stage1 = { windbreak: { logs, posts, colliders, radius: WIND_R }, woodpile };
    out.stage1.benches = FIRES.find((f) => f.id === 'frost').bench.angles.map((a) => ({ x: c.x + Math.cos(a) * FROST_CAMP.stumps.ring, z: c.z + Math.sin(a) * FROST_CAMP.stumps.ring, r: 0.85 }));
  }

  // ---- stage 2: dens, lantern posts, trough, bunting -------------------------------------------------------------------------------------------------
  {
    const dens = R.dens.map((d) => ({ x: d.x, z: d.z, yaw: Math.atan2(c.x - d.x, c.z - d.z), r: d.r }));   // local +Z of the bed points at the fire (rotate about Y by yaw)
    const posts = R.build.lanterns.map((l) => ({ x: l.x, z: l.z, h: POST_H, yaw: Math.atan2(c.x - l.x, c.z - l.z) }));
    const t = R.build.trough;
    const ty = 0.3, tdx = Math.cos(ty) * 0.42, tdz = -Math.sin(ty) * 0.42;
    const trough = { x: t.x, z: t.z, yaw: ty, colliders: [{ x: t.x - tdx, z: t.z - tdz, r: 0.42 }, { x: t.x + tdx, z: t.z + tdz, r: 0.42 }] };
    out.stage2 = { dens, posts, trough, bunting: [{ a: 0, b: 1 }, { a: 0, b: 2 }] };   // (north and west only: a string across the south would hang over the camera's view of the fire, the east side is the shelter)
  }

  // ---- stage 3: the grove shelter, flower boxes, young pines -----------------------------------------------------------------------------------------
  {
    const s = R.build.shelter;
    const { hw, hl, ridge, eave } = SHELTER;
    const posts = [[-hw, -hl], [hw, -hl], [-hw, hl], [hw, hl]].map(([dx, dz]) => ({ x: s.x + dx, z: s.z + dz }));
    const lanterns = [{ x: s.x, z: s.z - 1.1, y: ridge - 0.95 }, { x: s.x, z: s.z + 1.1, y: ridge - 0.95 }, { x: s.x - hw, z: s.z + hl + 0.2, y: SHELTER.postH - 0.55 }, { x: s.x + hw, z: s.z + hl + 0.2, y: SHELTER.postH - 0.55 }];
    const shelter = { x: s.x, z: s.z, hw, hl, ridge, eave, postH: SHELTER.postH, posts, colliders: posts.map((p) => ({ x: p.x, z: p.z, r: 0.27 })), lanterns };
    const boxes = [[-2.1, -0.9], [-2.1, 0.9], [2.1, -0.9], [2.1, 0.9]].map(([dx, dz]) => ({ x: s.x + dx, z: s.z + dz, yaw: Math.PI / 2 }));
    const rng = mulberry32(island.seed + 3503);
    const pines = [-125, -100, -75, -50, -25, -5, 150, 178].map((deg) => {
      const a = deg * Math.PI / 180, r = 12.0 + rng() * 1.0;
      const p = at(Math.cos(a) * r, Math.sin(a) * r);
      return { x: +p.x.toFixed(3), z: +p.z.toFixed(3), s: +(0.85 + rng() * 0.3).toFixed(3), yaw: +(rng() * 6.28).toFixed(3) };
    });
    out.stage3 = { shelter, boxes, pines };
  }

  // ---- colliders per stage ---------------------------------------------------------------------------------------------------------------------------------
  const c1 = [...out.stage1.windbreak.colliders, ...out.stage1.woodpile.colliders];
  const c2 = [...out.stage2.posts.map((p) => ({ x: p.x, z: p.z, r: 0.28 })), ...out.stage2.trough.colliders];
  const c3 = [...out.stage3.shelter.colliders, ...out.stage3.boxes.map((b) => ({ x: b.x, z: b.z, r: 0.5 })), ...out.stage3.pines.map((p) => ({ x: p.x, z: p.z, r: 0.35 }))];
  out.colliders = { 1: c1, 2: c2, 3: c3 };
  out.footprints = {
    1: [...c1, ...out.stage1.windbreak.posts.map((p) => ({ x: p.x, z: p.z, r: 0.2 })), ...out.stage1.benches.map((b) => ({ ...b, bench: true }))],
    2: [...c2, ...out.stage2.dens.map((d) => ({ x: d.x, z: d.z, r: d.r }))],
    3: c3,
  };
  return out;
}
