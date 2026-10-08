// Weapon tip cards (Step 57; Step 58 adds a card for the first CHARM a player takes, kind 'charm'): the first time a player on THIS SCREEN picks up each weapon kind inside a combat area, a small comic card shows what the buttons do with it, written
// with that player's own device's button names. Shown once per screen per weapon kind (the seen kinds live in localStorage `infiniteIsland.combatTips`, like the camp intros;
// `?newgame` clears them), dismissed by any button after `MIN_SHOW` s or by itself after `MAX_SHOW` s, and never blocks anyone: the cards ignore the pointer and sit at the
// bottom of the screen, one per player.
//
//   const tips = createTipCards(root);                     // root = the #hud element
//   tips.show(player, 'sword', source)                     // false if this screen has seen the sword's card already; `source` = player.actions.activeSource
//   tips.poke(player, pressed)                             // every frame for a player inside the area: `pressed` = Interact / Cancel / Jump went down this frame
//   tips.update(dt)                                        // real seconds; ages the cards and removes the finished ones
//   tips.seen(kind) / tips.reset() / tips.clear() / tips.count / tips.cards
//   buttonNames(source)                                    // pure: { kind: 'key' | 'pad' | 'word', tap, hold, special, jump, charm } for 'keyboard' | 'gamepad' | anything else (touch, phone)
import { NEW_GAME } from '../game/save.js';
import { ICONS } from './icons.js';

export const TIPS_KEY = 'infiniteIsland.combatTips';
export const MIN_SHOW = 1;          // s before a button press may dismiss it
export const MAX_SHOW = 7;          // s before it leaves by itself
/** What each weapon's three buttons do (short and cosy), by kind. */
export const WEAPON_TIPS = {
  sword: { name: 'Sword', tap: 'Quick three-hit combo', hold: 'Spin slash all around you', special: 'Dash-stab through a line' },
  axe: { name: 'Axe', tap: 'Wide cleave', hold: 'Overhead chop that cracks shells', special: 'Boomerang, hits both ways' },
  hammer: { name: 'Hammer', tap: 'Heavy slam', hold: 'Ground-pound ring', special: 'Shockwave that launches' },
  slingshot: { name: 'Slingshot', tap: 'Fire a pebble (reaches flyers)', hold: 'Piercing shot through a whole line', special: 'Seed scatter, a fan of pellets' },
  'watering-can': { name: 'Watering can', tap: 'Spray and knock back, soaks guardians', hold: 'Long jet, big knock-back', special: 'Rain cloud that heals friends' },
};
/** The charm card's lines (Step 58). */
export const CHARM_TIP = { name: 'Charm', cast: 'Cast your charm, then it recharges', swap: 'At a pedestal, Interact swaps charms' };
export function buttonNames(source) {
  if (source === 'keyboard' || source === undefined) return { kind: 'key', tap: 'E', hold: 'E', special: 'Q', jump: 'Space', charm: 'R' };
  if (source === 'gamepad') return { kind: 'pad', tap: 'A', hold: 'A', special: 'B', jump: 'Y', charm: 'X' };       // (standard and GameCube pads print the same letters; RB / R casts too)
  return { kind: 'word', tap: 'Interact', hold: 'Hold Interact', special: 'Cancel', jump: 'Jump', charm: 'Charm' };   // touch and phone controllers: the labelled buttons
}
const readSeen = () => { try { const v = JSON.parse(localStorage.getItem(TIPS_KEY) || '[]'); return Array.isArray(v) ? v.filter((k) => typeof k === 'string') : []; } catch { return []; } };
const writeSeen = (list) => { try { localStorage.setItem(TIPS_KEY, JSON.stringify(list)); } catch { /* private window: the cards just show again next load */ } };

export function createTipCards(root) {
  if (NEW_GAME) { try { localStorage.removeItem(TIPS_KEY); } catch { /* ignore */ } }
  const seenKinds = new Set(NEW_GAME ? [] : readSeen());
  const holder = document.createElement('div');
  holder.className = 'tip-cards'; holder.setAttribute('aria-live', 'polite'); root.appendChild(holder);
  const cards = new Map();           // player -> { el, age, kind, source }

  function glyph(names, text) {
    const g = document.createElement('span');
    if (names.kind === 'word') { g.className = 'tip-word'; g.textContent = text; } else { g.className = `glyph ${names.kind}`; g.textContent = text; }
    if (text.length > 1 && names.kind !== 'word') g.classList.add('wide');                 // (Space)
    return g;
  }
  /** One line: the button (a keycap / pad badge, or the touch button's word), then what it does. `hold` shows the Interact button again with a small "hold". */
  function row(names, key, label, text, hold = false) {
    const li = document.createElement('li'), name = document.createElement('span'), words = document.createElement('span');
    name.className = 'tip-key'; name.appendChild(glyph(names, hold && names.kind !== 'word' ? names.tap : names[key]));
    if (hold && names.kind !== 'word') { const h = document.createElement('small'); h.textContent = 'hold'; name.appendChild(h); }
    words.className = 'tip-text'; const b = document.createElement('b'); b.textContent = label; words.append(b, document.createTextNode(` ${text}`));
    li.append(name, words); return li;
  }
  function build(player, kind, source) {
    const tip = kind === 'charm' ? CHARM_TIP : WEAPON_TIPS[kind], names = buttonNames(source), el = document.createElement('div');
    el.className = 'tip-card'; el.setAttribute('role', 'status'); if (player.colors?.ui) el.style.setProperty('--tip', player.colors.ui);
    const head = document.createElement('div'); head.className = 'tip-head';
    const icon = document.createElement('span'); icon.className = 'tip-icon'; icon.innerHTML = kind === 'charm' ? ICONS.charm : ICONS[`tool-${kind}`] || '';
    const title = document.createElement('span'); title.className = 'tip-title'; title.textContent = tip.name;
    const who = document.createElement('span'); who.className = 'tip-who'; who.textContent = player.colors?.name || 'P1';
    head.append(icon, title, who);
    const list = document.createElement('ul');
    if (kind === 'charm') list.append(row(names, 'charm', 'Charm', tip.cast), row(names, 'tap', 'Pedestal', tip.swap));
    else list.append(row(names, 'tap', 'Tap', tip.tap), row(names, 'hold', 'Hold', tip.hold, true), row(names, 'special', 'Special', `${tip.special} (fills with hits and dodges)`), row(names, 'jump', 'Jump', 'Dodge-hop: a dash and a moment of safety'));
    const foot = document.createElement('div'); foot.className = 'tip-foot'; foot.textContent = 'Press any button to carry on';
    el.append(head, list, foot); return el;
  }
  function remove(player) { const c = cards.get(player); if (!c) return; c.el.classList.add('leaving'); setTimeout(() => c.el.remove(), 350); cards.delete(player); }
  return {
    holder,
    get count() { return cards.size; },
    get cards() { return [...cards.values()]; },
    seen: (kind) => seenKinds.has(kind),
    /** Show the card for `kind` to `player` unless this screen has already seen it. Returns whether a card appeared. */
    show(player, kind, source) {
      if (!(WEAPON_TIPS[kind] || kind === 'charm') || seenKinds.has(kind) || !player) return false;
      seenKinds.add(kind); writeSeen([...seenKinds]);
      remove(player);
      const el = build(player, kind, source); holder.appendChild(el); requestAnimationFrame?.(() => el.classList.add('in'));
      cards.set(player, { el, age: 0, kind, source }); return true;
    },
    poke(player, pressed) { const c = cards.get(player); if (c && pressed && c.age >= MIN_SHOW) remove(player); },
    update(dt) { for (const [player, c] of cards) { c.age += dt; if (c.age >= MAX_SHOW) remove(player); } },
    dismiss(player) { remove(player); },
    clear() { for (const player of [...cards.keys()]) remove(player); },
    reset() { seenKinds.clear(); writeSeen([]); },
  };
}
