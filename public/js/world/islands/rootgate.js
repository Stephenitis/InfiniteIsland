// The Rootgate's place on the home island (Step 56): the visible entrance to Wildroot Hollow, a root-wrapped stone archway in the eastern woods. Pure data + the keep-clear
// test that props.js reads (like ritual.js). The spot comes from the area registry (`AREAS.wildroot.entrance`, game/areas/wildroot.js) so a later area's island entrance is
// just another entry there; it was chosen as a clearing of the existing placement (no tree, rock, bush or flower within 4.5 u), so reserving it does not reshuffle home's props.
import { WILDROOT } from '../../game/areas/wildroot.js';
import { SPAWN } from './home.js';

const E = WILDROOT.entrance;
/** Centre, facing (the arch looks at the spawn / default camera side) and the walk-up point in front of it. */
export const ROOTGATE = { x: E.x, z: E.z, yaw: Math.atan2(SPAWN.x - E.x, SPAWN.z - E.z), keepClear: 4.0 };
ROOTGATE.front = { x: E.x + Math.sin(ROOTGATE.yaw) * 3.2, z: E.z + Math.cos(ROOTGATE.yaw) * 3.2 };
/** Props (radius `pad`) keep this far from the archway. */
export const rootgateReserved = (x, z, pad = 0) => Math.hypot(x - ROOTGATE.x, z - ROOTGATE.z) < ROOTGATE.keepClear + pad;
