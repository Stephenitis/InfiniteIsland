// The quest rows of the campfire menu (PLAN Step 15), plugged into EVERY fire (Step 33a) through campfire.setQuestProvider((player, fire) => rows):
//
//   no active quest         "Ask for a quest"  -> a short two-page intro from the Campfire Spirit (quest name, then the shopping list); the quest
//                                                 becomes active (the HUD tracker appears) and the dialog closes
//   active, incomplete      "Quest: <name>  2/4" -> a sub-menu listing every requirement with have/need chips;   "Give up quest" -> confirm sub-menu
//   active, every item in   "Prepare the feast!" (greyed with "Light the fire first!" while the fire is out) -> consumes the ingredients and starts the feast
//                           scene (game/feastScene.js); the two rows above stay available
//
// Everything is a function-valued choice list, so the rows re-evaluate when the bag or the fire changes while the menu is open.
// World sync (Step 22b): the menu is per screen, the quest is shared. On a replica "Ask for a quest" waits for the host to pick the template
// (quests.start() returns a Promise there) before the Campfire Spirit speaks; "Give up" and "Prepare the feast!" are requests too
// (feast.start(p) -> the host validates, consumes the ingredients and tells every screen to play the scene).
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
    const q = quests.start();
    if (q && typeof q.then === 'function') {                     // replica: the host picks the template
      q.then((t) => { if (t && dialog.isOpen && dialog.owner === p) tell(t, fire); else if (t) { snd('chime'); } });
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

  function listChoices(p, fire) {
    const q = quests.active;
    if (!q) return [{ label: 'Back', icon: BACK_SVG, onSelect: () => back(p, 2, fire) }];
    const rows = quests.progress().map((r) => ({
      label: r.def ? r.def.name : r.id, icon: r.def ? r.def.icon : '',
      chips: [{ icon: r.def ? r.def.icon : '', have: Math.min(r.have, r.need), need: r.need }],
      onSelect: () => snd('bip', { pitch: 1.2, vol: 0.4 }),
    }));
    rows.push({ label: 'Back', icon: BACK_SVG, onSelect: () => back(p, 2, fire) });
    return rows;
  }

  function showList(p, fire) {
    dialog.showChoices(() => listChoices(p, fire), {
      name: fire.name,
      text: () => (quests.active ? `${quests.active.name}: gather all of this, then come back to the fire!` : ''),
      onCancel: () => back(p, 2, fire),
      index: 0,
    });
  }

  function confirmGiveUp(p, fire) {
    const q = quests.active;
    if (!q) { back(p, 2, fire); return; }
    dialog.showChoices([
      { label: 'Keep going', icon: BACK_SVG, onSelect: () => back(p, 2, fire) },
      {
        label: 'Yes, give up', icon: LEAVE_SVG,
        onSelect: () => {
          quests.giveUp();
          snd('bip', { pitch: 0.8 });
          hud.toast('Quest given up. Ask for a new one any time!', { icon: 'quest', duration: 2600 });
          back(p, 2, fire);
        },
      },
    ], { name: fire.name, text: `Give up the ${q.name} quest? Your bag stays as it is.`, onCancel: () => back(p, 2, fire), index: 0 });
  }

  function choices(p, fire) {
    const q = quests.active;
    if (!q) {
      return [{ label: 'Ask for a quest', icon: QUEST_SVG, detail: quests.feasts ? `Feasts: ${quests.feasts}` : 'Shared by everyone', onSelect: () => ask(p, fire) }];
    }
    const rows = [];
    const prog = quests.progress();
    const lit = fire.lit;                                        // THIS fire: the feast happens where it was prepared
    if (prog.every((r) => r.done)) {
      rows.push({
        label: 'Prepare the feast!', icon: FEAST_SVG, disabled: !lit, detail: lit ? '' : 'Light the fire first!',
        onDisabled: () => hud.toast('Light the fire first!', { icon: 'flame' }),
        onSelect: () => {
          if (!quests.satisfied) { hud.toast('Something is missing from the bag!', { icon: 'quest' }); return; }
          dialog.close();
          feast.start(p, { fire });
        },
      });
    }
    rows.push({ label: `Quest: ${q.name}`, icon: QUEST_SVG, detail: `${prog.filter((r) => r.done).length}/${prog.length}`, onSelect: () => showList(p, fire) });
    rows.push({ label: 'Give up quest', icon: LEAVE_SVG, onSelect: () => confirmGiveUp(p, fire) });
    return rows;
  }

  for (const fire of campfires.list) fire.setQuestProvider((p, f) => choices(p, f || fire));
  quests.on('change', () => { if (dialog.isOpen && campfires.list.some((f) => f.menuId === dialog.menuId)) dialog.refresh(); });
  return { ask, showList, confirmGiveUp, choices };
}

