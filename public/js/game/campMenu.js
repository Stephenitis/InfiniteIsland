// The camp's own voice in the fire menu (PLAN Step 33b): every FIRES entry with `camp: true` (the Frostpine camp fire, the Emberleaf garden hearth) gets
//   * a first-time intro from its spirit (config FIRES[].spirit, e.g. "Frostpine Fire Spirit"), once per screen the first time ANYONE on that screen opens its
//     menu: the pages are FIRES[].intro, or (Frostpine) the default below: the critters of Frostpine are hungry and the camp is bare;
//   * a "Camp jobs" row above "Leave" unless FIRES[].jobs is false: a placeholder ("Not yet...") that Step 35 replaces with the real camp jobs (the garden hearth has no
//     such row: its story and jobs come with Mossback, Steps 37b-39).
//
//   createCampMenu({ campfires, dialog })  -> { seen(id), reset(id) }
//
// The "has the spirit introduced itself" flag is a per-screen UI memory in localStorage (`infiniteIsland.campIntro.<fireId>` = '1'), like the fullscreen-prompt
// flag: it is NOT shared game state (nothing to sync or save on the host), so a second screen hears the intro once too, and a replica reloading does not repeat
// it. ?newgame clears it with the other saves. Every storage access is wrapped (private windows can throw).
import { NEW_GAME } from './save.js';
import { CAMP_SVG } from '../ui/icons.js';

const key = (id) => `infiniteIsland.campIntro.${id}`;
const read = (id) => { try { return localStorage.getItem(key(id)) === '1'; } catch { return false; } };
const write = (id) => { try { localStorage.setItem(key(id), '1'); } catch { /* private window: the intro just plays again next load */ } };

export const CAMP_INTRO_PAGES = [
  'Brrr... hello, little campers! I am the Frostpine Fire Spirit. Isn\'t it chilly? This camp is awfully bare: just a ring of stones and a few old stumps.',
  'The critters of Frostpine are hungry, and they have nowhere warm to go! If somebody gave them a reason to come and a cosy place to stay...',
  'Keep my fire fed and cook something tasty. Come back to the fire for quests, feasts and, soon, camp jobs. I\'ll be right here, toasty!',
];
export const CAMP_JOBS_PAGES = ['Not yet... the critters need to find their way here first. Come back when somebody furry has moved in!'];

export function createCampMenu({ campfires, dialog }) {
  const heard = new Set();
  for (const fire of campfires.list) {
    if (!fire.fire.camp) continue;
    if (NEW_GAME) { try { localStorage.removeItem(key(fire.id)); } catch { /* ignore */ } } else if (read(fire.id)) heard.add(fire.id);
    fire.setIntro(() => {
      if (heard.has(fire.id)) return null;
      heard.add(fire.id); write(fire.id);
      return fire.fire.intro || CAMP_INTRO_PAGES;
    });
    if (fire.fire.jobs === false) continue;
    fire.setMenuExtras((p) => [{
      label: 'Camp jobs', icon: CAMP_SVG, detail: 'Coming soon',
      onSelect: () => dialog.showPages(CAMP_JOBS_PAGES, { name: fire.fire.spirit || 'Campfire Spirit', onFinish: () => fire.showMain(p) }),
    }]);
  }
  return { seen: (id) => heard.has(id), reset(id) { heard.delete(id); try { localStorage.removeItem(key(id)); } catch { /* ignore */ } } };
}
