// The lava-tube mouth's place on Emberleaf (Step 60): the entrance to Cinder Tubes on the volcano's east flank. Pure data + the keep-clear test the island's placement reads (like caveMouth.js
// for Glimmerfrost). The spot comes from the area registry (`AREAS.cinder.entrance`, game/areas/cinder.js). It was chosen as a CLEARING of Emberleaf's existing seeded placement (no tree, boulder,
// bamboo, tiki, fern, gathering spot, tool, seed, garden plot, lane, torch post or the waterfall corridor within 12 u, off the volcano ramps' wedge), so reserving it moves nothing:
// `emberPlacement.js` only claims it as a solid at the very END and the respawning dig / seed spots keep off it; test/cinder.test.js proves the placement hashes are unchanged.
import { CINDER } from '../../game/areas/cinder.js';

const E = CINDER.entrance;
/** Centre (world), facing (east-south-east: downhill, towards the default camera's side), the walk-up point in front of it and the keep-clear radius. */
export const LAVA_MOUTH = { x: E.x, z: E.z, yaw: 0.9, keepClear: 6.4, id: E.id };
LAVA_MOUTH.front = { x: E.x + Math.sin(LAVA_MOUTH.yaw) * 3.6, z: E.z + Math.cos(LAVA_MOUTH.yaw) * 3.6 };
/** Props / decor / gathering spots (radius `pad`) keep this far from the mouth. */
export const lavaMouthReserved = (x, z, pad = 0) => Math.hypot(x - LAVA_MOUTH.x, z - LAVA_MOUTH.z) < LAVA_MOUTH.keepClear + pad;
