// The Glimmerfrost cave mouth's place on Frostpine (Step 59): the ice-cave entrance to Glimmerfrost Caves on the west bank of the frozen lake. Pure data + the keep-clear test the
// island's placement reads (like rootgate.js for the Rootgate). The spot comes from the area registry (`AREAS.glimmerfrost.entrance`, game/areas/glimmerfrost.js). It was chosen as a CLEARING
// of Frostpine's existing seeded placement (no tree, boulder, log, snowman, spire, gathering spot, critter point, tool, lane, camp or lake bank within 8.8 u), so reserving it moves nothing:
// `frostPlacement.js` only claims it as a solid (and flowers / respawned dig spots keep off it), test/glimmerfrost.test.js proves the placement hashes are unchanged.
import { GLIMMERFROST } from '../../game/areas/glimmerfrost.js';

const E = GLIMMERFROST.entrance;
/** Centre (world), facing (a little west of south: the mouth looks at the default camera and the camp), the walk-up point in front of it and the keep-clear radius. */
export const CAVE_MOUTH = { x: E.x, z: E.z, yaw: -0.38, keepClear: 6.2, id: E.id };
CAVE_MOUTH.front = { x: E.x + Math.sin(CAVE_MOUTH.yaw) * 3.4, z: E.z + Math.cos(CAVE_MOUTH.yaw) * 3.4 };
/** Props / decor / gathering spots (radius `pad`) keep this far from the mouth. */
export const caveMouthReserved = (x, z, pad = 0) => Math.hypot(x - CAVE_MOUTH.x, z - CAVE_MOUTH.z) < CAVE_MOUTH.keepClear + pad;
