// Regional quest rows: each menu issues, prepares and cancels only its own fire's quest.
import { itemName } from './catalog.js';
import { QUEST_SVG, FEAST_SVG, LEAVE_SVG, BACK_SVG } from '../ui/icons.js';

/** 'Coconut, 2 Potatoes and Herb' */
export function describeNeeds(needs) {
  const parts = Object.entries(needs).map(([id, n]) => (n > 1 ? `${n} ${itemName(id, n)}` : `a ${itemName(id, 1)}`));
  if (parts.length < 2) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

// Every function below is per fire: `fire` is the instance whose menu is open (the sub-menus go back to ITS main menu, and "Prepare the feast!" needs
// THAT fire lit and starts the feast there).
export function createQuestMenu({ quests, dialog, hud, sfx = null, campfires, feast }) {
  const snd = (name, opts) => { if (sfx) sfx.play(name, opts); };
  const back = (p, index, fire) => fire.showMain(p, index);

  function ask(p, fire = null) {
    const q = quests.start(null, fire?.id || 'home');
    if (q && typeof q.then === 'function') {                     // replica: the host picks the template
      q.then((t) => { if (t && dialog.isOpen && dialog.owner === p && dialog.menuId === fire?.menuId) tell(t, fire); else if (t) { snd('chime'); } });
      return;
    }
    if (q) tell(q, fire);
  }

  function tell(q, fire = null) {
    snd('chime');
    dialog.showPages([
      `Ooh, my tummy is rumbling... I'm dreaming of ${q.name}: ${q.blurb}!`,
      `Bring me ${describeNeeds(q.needs)}. Come back to the fire with everything and we'll all feast together!`,
    ], { name: fire?.fire?.spirit || 'Campfire Spirit', onFinish: () => dialog.close() });   // (the Frostpine camp fire has its own spirit)
  }

  function confirmGiveUp(p, fire) {
    const q = quests.activeFor(fire.id);
    if (!q) { back(p, 2, fire); return; }
    dialog.showChoices([
      { label: 'Keep going', icon: BACK_SVG, onSelect: () => back(p, 2, fire) },
      {
        label: 'Yes, give up', icon: LEAVE_SVG,
        onSelect: () => {
          quests.giveUp(fire.id, q.id);
          snd('bip', { pitch: 0.8 });
          hud.toast('Quest given up. Ask for a new one any time!', { icon: 'quest', duration: 2600 });
          back(p, 2, fire);
        },
      },
    ], { name: fire.name, text: `Give up the ${q.name} quest? Your bag stays as it is.`, onCancel: () => back(p, 2, fire), index: 0 });
  }

  function choices(p, fire) {
    if (!quests.slots[fire.id]) return [];                       // (a fire without a quest slot shows no quest rows; since Step 72b every fire has one, the marsh hearth's is 'dusk')
    const q = quests.activeFor(fire.id);
    if (!q) {
      return [{ label: 'Ask for a quest', icon: QUEST_SVG, detail: quests.feasts ? `Feasts: ${quests.feasts}` : 'Shared by everyone', onSelect: () => ask(p, fire) }];
    }
    const rows = [];
    const prog = quests.progress(fire.id);
    const lit = fire.lit;                                        // THIS fire: the feast happens where it was prepared
    if (prog.every((r) => r.done)) {
      rows.push({
        label: 'Prepare the feast!', icon: FEAST_SVG, disabled: !lit, detail: lit ? '' : 'Light the fire first!',
        onDisabled: () => hud.toast('Light the fire first!', { icon: 'flame' }),
        onSelect: () => {
          if (!quests.satisfiedAt(fire.id)) { hud.toast('Something is missing from the bag!', { icon: 'quest' }); return; }
          dialog.close();
          feast.start(p, { fire });
        },
      });
    }
    rows.push({ label: 'Give up quest', icon: LEAVE_SVG, onSelect: () => confirmGiveUp(p, fire) });
    return rows;
  }

  for (const fire of campfires.list) fire.setQuestProvider((p, f) => choices(p, f || fire));
  quests.on('change', () => { if (dialog.isOpen && campfires.list.some((f) => f.menuId === dialog.menuId)) dialog.refresh(); });
  return { ask, confirmGiveUp, choices };
}

