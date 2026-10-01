// The Frostpine camp, pure data (PLAN Step 33b): where it is, how it is painted, the reserved spots for later steps and the signposts. No three.js, so the
// terrain painter, the prop placement and the Node tests share it. Numbers live in config.js (FROST_CAMP, PATHS); the fire itself is config FIRES 'frost'.
//
//   campCentre(island)            -> { x, z } world position of the camp fire
//   campDist(island, x, z)        distance from a WORLD point to the camp fire
//   campPaint(island, x, z)       -> { w, ring } trampled-snow clearing weight 0..1 (soft noisy-free edge: the painter adds its own noise) and 0..1 "close to the fire" (ash / dirt)
//   campReserved(island)          -> { dens: [{ x, z, r }], build: { name: { x, z, r } | [..] }, tailStump } the spots reserved for Steps 34 / 35 / 36 (world coordinates)
//   campSigns(island)             -> [{ id, kind, x, z, yaw, pages }] the signposts (the landing one points up the trail, the camp one welcomes and points back to the bridge)
import { FROST_CAMP } from '../../config.js';
import { sstep } from './util.js';
import { getPath, pointAt } from '../paths.js';

export const campCentre = (island) => ({ x: island.x + FROST_CAMP.x, z: island.z + FROST_CAMP.z });
export const campDist = (island, x, z) => Math.hypot(x - island.x - FROST_CAMP.x, z - island.z - FROST_CAMP.z);

export function campPaint(island, x, z) {
  const d = campDist(island, x, z);
  return { w: 1 - sstep(FROST_CAMP.paint.full, FROST_CAMP.paint.fade, d), ring: 1 - sstep(2.2, 5.2, d) };
}

const world = (island, o) => ({ x: island.x + FROST_CAMP.x + o.dx, z: island.z + FROST_CAMP.z + o.dz, r: o.r });
export function campReserved(island) {
  const B = FROST_CAMP.build;
  const build = {};
  for (const k of Object.keys(B)) build[k] = Array.isArray(B[k]) ? B[k].map((o) => world(island, o)) : world(island, B[k]);
  return { dens: FROST_CAMP.dens.map((o) => world(island, o)), build, tailStump: world(island, FROST_CAMP.tailStump) };
}

// Signposts. Both boards face the default camera (+z, south) so they read from the follow view whichever way you walk the trail; lateral > 0 = the right of the
// walking direction (the camp-ward trail goes north, so that is east).
export function campSigns(island) {
  const p = getPath('frost-camp');
  if (!p || island.id !== 'frost') return [];
  const a = pointAt(island, p, 7, 3.4);
  const b = pointAt(island, p, p.length - 3.5, 3.6);
  return [
    {
      id: 'frost-sign-landing', kind: 'camp-up', x: a.x, z: a.z, yaw: -0.14,
      pages: ['Frostpine Camp: follow the trail north, past the lanterns! A cosy fire and a bubbling pot are waiting.'],
    },
    {
      id: 'frost-sign-camp', kind: 'camp-here', x: b.x, z: b.z, yaw: 0.16,
      pages: [
        'Welcome to the Frostpine camp! Toss a log on the fire, cook warm Frostpine dishes and feast together.',
        'The bridge back to the home island is down the trail, to the south.',
      ],
    },
  ];
}
