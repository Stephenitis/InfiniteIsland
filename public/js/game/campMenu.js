// The camp's own voice in the fire menu (PLAN Step 33b + 35a): every FIRES entry with `camp: true` (the Frostpine camp fire, the Emberleaf garden hearth) gets
//   * a first-time intro from its spirit (config FIRES[].spirit, e.g. "Frostpine Fire Spirit"), once per screen the first time ANYONE on that screen opens its
//     menu: the pages are FIRES[].intro, or (Frostpine) the default below: the critters of Frostpine are hungry and the camp is bare;
//   * a "Camp jobs" row above "Leave" unless FIRES[].jobs is false (the garden hearth has no such row: its story and jobs come with Mossback, Steps 37b-39). The Frostpine
//     row (Step 35a) is the real thing, backed by `camp` (world/frostCamp.js): it is gated until a critter lives at the camp, then shows the current job (name, a line
//     about it, progress per material) and a "Bring materials" giving menu (Give 1 / Give 5 / Give all / Back, like the bridge builders'). Without `camp` the row stays a placeholder.
//
//   createCampMenu({ campfires, dialog, camp?, inventory? })  -> { seen(id), reset(id) }
//
// The "has the spirit introduced itself" flag is a per-screen UI memory in localStorage (`infiniteIsland.campIntro.<fireId>` = '1'), like the fullscreen-prompt
// flag: it is NOT shared game state (nothing to sync or save on the host), so a second screen hears the intro once too, and a replica reloading does not repeat
// it. ?newgame clears it with the other saves. Every storage access is wrapped (private windows can throw).
import { NEW_GAME } from './save.js';
import { getItem, itemName } from './catalog.js';
import { CAMP_SVG, BACK_SVG, SPARKLE_SVG } from '../ui/icons.js';

const key = (id) => `infiniteIsland.campIntro.${id}`;
const read = (id) => { try { return localStorage.getItem(key(id)) === '1'; } catch { return false; } };
const write = (id) => { try { localStorage.setItem(key(id), '1'); } catch { /* private window: the intro just plays again next load */ } };

export const CAMP_INTRO_PAGES = [
  'Brrr... hello, little campers! I am the Frostpine Fire Spirit. Isn\'t it chilly? This camp is awfully bare: just a ring of stones and a few old stumps.',
  'The critters of Frostpine are hungry, and they have nowhere warm to go! If somebody gave them a reason to come and a cosy place to stay...',
  'Keep my fire fed and cook something tasty. Come back to the fire for quests, feasts and, soon, camp jobs. I\'ll be right here, toasty!',
];
export const CAMP_JOBS_PAGES = ['Not yet... the critters need to find their way here first. Come back when somebody furry has moved in!'];
export const CAMP_LOCKED_PAGES = ['First, help a hungry critter find its way here... Feed one of the wild animals of Frostpine and I will have something to build the camp for!'];
export const CAMP_DONE_TEXT = 'The camp is as cozy as can be! Look at it glow. Thank you, my friends!';

export function createCampMenu({ campfires, dialog, camp = null, inventory = null }) {
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
    const name = fire.fire.spirit || 'Campfire Spirit';
    if (!camp || !inventory) {
      fire.setMenuExtras((p) => [{
        label: 'Camp jobs', icon: CAMP_SVG, detail: 'Coming soon',
        onSelect: () => dialog.showPages(CAMP_JOBS_PAGES, { name, onFinish: () => fire.showMain(p) }),
      }]);
      continue;
    }
    installJobs(fire, name);
  }

  function installJobs(fire, name) {
    const JOBS_INDEX = 3;                                                   // the row's place in the fire menu (Add a log, Cook, Quest, Camp jobs, Leave): showMain highlights it again
    const toMain = (p) => () => fire.showMain(p, JOBS_INDEX);
    const toJobs = (p) => () => jobsMenu(p);
    const pages = (p, list, after) => dialog.showPages(list, { name, onFinish: after || toJobs(p) });
    const have = (item) => inventory.count(item);
    const label = (r) => `${r.given} / ${r.need} ${itemName(r.item, 2).toLowerCase()}`;

    function jobsMenu(p) {
      const job = camp.job;
      if (!job) { dialog.showChoices([{ label: 'Back', icon: BACK_SVG, onSelect: toMain(p) }], { name, text: CAMP_DONE_TEXT, onCancel: toMain(p) }); return; }
      const rows = () => {
        const list = [];
        list.push({ label: 'Progress', icon: SPARKLE_SVG, detail: `${camp.progress().given} / ${camp.progress().total}`, onSelect: () => progressPages(p) });
        list.push({ label: 'Bring materials', icon: CAMP_SVG, onSelect: () => materialsMenu(p) });
        list.push({ label: 'Back', icon: BACK_SVG, onSelect: toMain(p) });
        return list;
      };
      dialog.showChoices(rows, { name, text: () => (camp.job ? `${camp.job.name} (${camp.progress().job + 1} / ${camp.jobs.length}): ${camp.job.blurb}` : CAMP_DONE_TEXT), onCancel: toMain(p) });
    }

    function progressPages(p) {
      const job = camp.job;
      if (!job) { pages(p, [CAMP_DONE_TEXT]); return; }
      pages(p, [`${job.name}: ${job.blurb}`, `So far: ${camp.needs().map(label).join(', ')}.`]);
    }

    function materialsMenu(p) {
      const rows = () => {
        const list = camp.needs().filter((r) => r.left > 0).map((r) => ({
          label: `${itemName(r.item, 1)}: ${r.given} / ${r.need}`, icon: getItem(r.item).icon, detail: `you have ${have(r.item)}`,
          onSelect: () => giveMenu(p, r.item),
        }));
        list.push({ label: 'Back', icon: BACK_SVG, onSelect: toJobs(p) });
        return list;
      };
      dialog.showChoices(rows, { name, text: 'What did you bring me? Pick a material to hand over.', onCancel: toJobs(p) });
    }

    function giveMenu(p, item) {
      const left = () => camp.needs().find((r) => r.item === item)?.left || 0;
      const nowCan = () => Math.min(have(item), left());
      if (left() < 1) { materialsMenu(p); return; }
      if (nowCan() < 1) { pages(p, [`You have no ${itemName(item, 2).toLowerCase()} on you yet! Gather some and come back. I still need ${left()}.`], () => materialsMenu(p)); return; }
      const rows = () => {
        const m = nowCan(), icon = getItem(item).icon, list = [];
        if (m >= 1) list.push({ label: 'Give 1', icon, onSelect: () => doGive(p, item, 1) });
        if (m > 5) list.push({ label: 'Give 5', icon, onSelect: () => doGive(p, item, 5) });
        if (m > 1) list.push({ label: `Give all (${m})`, icon, onSelect: () => doGive(p, item, m) });
        list.push({ label: 'Back', icon: BACK_SVG, onSelect: () => materialsMenu(p) });
        return list;
      };
      dialog.showChoices(rows, { name, text: () => `${itemName(item, 2)}: I still need ${left()}, and you have ${have(item)}.`, onCancel: () => materialsMenu(p) });
    }

    function afterGift(p, item, r) {
      if (!dialog.isOpen || dialog.owner !== p) return;
      if (!r.ok) {
        const text = {
          none: 'Your bag is empty of that, friend! Gather some and come back.', locked: CAMP_LOCKED_PAGES[0], done: CAMP_DONE_TEXT,
          'not-needed': 'I have all of that already! Thank you.', far: 'Come a little closer, friend!',
        }[r.reason] || 'Hmm, I did not quite catch that. Could you try again?';
        pages(p, [text], () => materialsMenu(p));
        return;
      }
      const res = r.result || {};
      if (res.completed) { pages(p, [`${res.n === 1 ? 'That one was' : `Those ${res.n} were`} the last! The job is done!`], () => dialog.close()); return; }
      const line = `${res.n === 1 ? 'Thank you!' : `Thank you for the ${res.n}!`}`;
      const more = (camp.needs().find((x) => x.item === item)?.left || 0) > 0 && have(item) > 0;
      pages(p, [line], more ? () => giveMenu(p, item) : () => materialsMenu(p));
    }

    function doGive(p, item, n) {
      const r = camp.give(p, item, n);
      if (r && typeof r.then === 'function') {
        pages(p, ['Let me see...'], () => materialsMenu(p));
        r.then((res) => afterGift(p, item, res));
      } else afterGift(p, item, r);
    }

    fire.setMenuExtras((p) => {
      if (!camp.open) {
        return [{ label: 'Camp jobs', icon: CAMP_SVG, detail: 'Needs a camp critter', onSelect: () => dialog.showPages(CAMP_LOCKED_PAGES, { name, onFinish: () => fire.showMain(p, JOBS_INDEX) }) }];
      }
      const pr = camp.progress();
      return [{ label: 'Camp jobs', icon: CAMP_SVG, detail: pr.done ? 'All done!' : `Comfort ${pr.comfort} / ${pr.max}`, onSelect: () => jobsMenu(p) }];
    });
  }
  return { seen: (id) => heard.has(id), reset(id) { heard.delete(id); try { localStorage.removeItem(key(id)); } catch { /* ignore */ } } };
}
