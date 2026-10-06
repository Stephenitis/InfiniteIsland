// The registry of storybook pages: id -> parsed page (game/pageFormat.js). A page file is pure data (see orchardHop.js); every registered page is validated by test/platformer.test.js.
import { parsePage } from '../pageFormat.js';
import { ORCHARD_HOP } from './orchardHop.js';
import { WOODCUTTERS_WAY } from './woodcuttersWay.js';

export const PAGES = new Map([ORCHARD_HOP, WOODCUTTERS_WAY].map((raw) => { const page = parsePage(raw); return [page.id, page]; }));
export const getPage = (id) => PAGES.get(id) || null;
