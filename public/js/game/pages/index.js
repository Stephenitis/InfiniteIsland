// The registry of storybook pages: id -> parsed page (game/pageFormat.js). A page file is pure data (see orchardHop.js); every registered page is validated by test/platformer.test.js.
import { parsePage } from '../pageFormat.js';
import { ORCHARD_HOP } from './orchardHop.js';
import { WOODCUTTERS_WAY } from './woodcuttersWay.js';
import { KITE_HILL } from './kiteHill.js';
import { TIDEPOOL_RUN } from './tidepoolRun.js';
import { HIDDEN_ORCHARD } from './hiddenOrchard.js';
import { SNOWY_STEPS } from './snowySteps.js';
import { SLED_RUN } from './sledRun.js';
import { AURORA_NIGHT } from './auroraNight.js';
import { CANOPY_CLIMB } from './canopyClimb.js';
import { RIVER_RUN } from './riverRun.js';
import { LAVA_RISE } from './lavaRise.js';
import { VOLCANO_SPIRIT } from './volcanoSpirit.js';
import { HOT_SPRING } from './hotSpring.js';

export const PAGES = new Map([ORCHARD_HOP, WOODCUTTERS_WAY, KITE_HILL, TIDEPOOL_RUN, HIDDEN_ORCHARD, SNOWY_STEPS, SLED_RUN, AURORA_NIGHT, CANOPY_CLIMB, RIVER_RUN, LAVA_RISE, VOLCANO_SPIRIT, HOT_SPRING].map((raw) => { const page = parsePage(raw); return [page.id, page]; }));
export const getPage = (id) => PAGES.get(id) || null;
