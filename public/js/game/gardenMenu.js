// Mossback's material deliveries. Capture the job so a stale menu cannot donate to the next one.
import { getItem, itemName } from './catalog.js';
import { BACK_SVG, CAMP_SVG } from '../ui/icons.js';
export function createGardenMenu({ garden, mossback, dialog, inventory }) {
  const name = 'Mossback';
  const main = (p) => () => mossback.showMain(p, 2);
  const pages = (text, after) => dialog.showPages([text], { name, onFinish: after });
  function jobs(p) {
    if (!garden.open) { pages('Let us plant our first seed before we build. A garden needs something growing in it.', main(p)); return; }
    if (!garden.job) { pages('All sixteen beds, flowing water and a roof full of lanterns. Thank you, little gardeners!', main(p)); return; }
    dialog.showChoices(() => [
      ...garden.needs().filter((r) => r.left > 0).map((r) => ({ label: itemName(r.item, 1), icon: getItem(r.item).icon, detail: `${r.given}/${r.need} · Bag: ${inventory.count(r.item)}`, onSelect: () => materials(p, r.item) })),
      { label: 'Back', icon: BACK_SVG, onSelect: main(p) },
    ], { name, text: () => garden.job ? `${garden.job.name} (${garden.stage + 1}/3): ${garden.job.blurb}` : 'The garden is complete!', onCancel: main(p) });
  }
  function materials(p, item) {
    const job = garden.stage;
    const left = () => garden.stage === job ? garden.needs().find((r) => r.item === item)?.left || 0 : 0;
    const can = () => Math.min(left(), inventory.count(item));
    dialog.showChoices(() => {
      const n = can(), icon = getItem(item).icon;
      return [
        { label: 'Give 1', icon, disabled: n < 1, onSelect: () => give(1) },
        ...(n >= 5 ? [{ label: 'Give 5', icon, onSelect: () => give(5) }] : []),
        ...(n > 1 ? [{ label: `Give all (${n})`, icon, onSelect: () => give(n) }] : []),
        { label: 'Back', icon: BACK_SVG, onSelect: () => jobs(p) },
      ];
    }, { name, text: () => `${itemName(item, 2)}: ${left()} still needed. You have ${inventory.count(item)}.`, onCancel: () => jobs(p) });
    function give(n) {
      const finish = (r) => {
        if (!dialog.isOpen || dialog.owner !== p || dialog.menuId !== 'npc-mossback') return;
        if (!r.ok) {
          const line = { far: 'Come a little closer, little gardener.', locked: 'Plant a seed first.', none: 'We have none of that in the bag.', 'stale-job': 'That job is already finished. Let us look at what comes next.', 'not-needed': 'We have enough of that already.' }[r.reason] || 'Let us check the materials again.';
          pages(line, () => jobs(p)); return;
        }
        pages(r.result.completed ? 'The last materials! Let us make the garden grow.' : `Thank you for the ${r.result.n}!`, r.result.completed ? () => dialog.close() : () => jobs(p));
      };
      const r = garden.give(p, item, n, job);
      if (r?.then) { pages('Let me see...', () => jobs(p)); r.then(finish); } else finish(r);
    }
  }
  mossback.setRowProvider('jobs', (p) => ({ icon: CAMP_SVG, detail: garden.open ? (garden.job ? `Stage ${garden.stage}/3` : 'All done!') : 'Plant a seed first', onSelect: () => jobs(p) }));
  garden.on('change', () => { if (dialog.isOpen && dialog.menuId === 'npc-mossback') dialog.refresh(); });
  inventory.on('change', () => { if (dialog.isOpen && dialog.menuId === 'npc-mossback') dialog.refresh(); });
  return { jobs };
}
