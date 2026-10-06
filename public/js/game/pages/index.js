// The registry of storybook pages (Step 48): id -> page data. A page file is pure data (see testMeadow.js); Step 49+ add real ones next to it.
import { TEST_MEADOW } from './testMeadow.js';

export const PAGES = new Map([[TEST_MEADOW.id, TEST_MEADOW]]);
export const getPage = (id) => PAGES.get(id) || null;
