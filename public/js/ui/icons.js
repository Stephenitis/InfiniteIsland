// Inline SVG icons in the game's cute style (white fill, dark outline, pastel accents). Used instead of emoji
// because emoji fonts are missing in some browsers (they render as empty boxes). All icons are 24x24 and size with `1em`.
export const OUTLINE = '#2b2340';   // outline colour
const O = OUTLINE;
export const svg = (body, extra = '') => `<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false"${extra}>${body}</svg>`;

export const BAG_SVG = svg(`<path d="M6 8h12l2 13H4z" fill="#ffd54a" stroke="${O}" stroke-width="2" stroke-linejoin="round"/><path d="M8 8V6a4 4 0 0 1 8 0v2" fill="none" stroke="${O}" stroke-width="2"/><path d="M9 14h6" stroke="${O}" stroke-width="2" stroke-linecap="round"/>`);

export const PHONE_SVG = svg(`
  <rect x="6" y="2.5" width="12" height="19" rx="3" fill="#fff" stroke="${O}" stroke-width="2"/>
  <rect x="8.3" y="5.5" width="7.4" height="9.5" rx="1" fill="#6fe3ef"/><circle cx="12" cy="18.4" r="1.2" fill="${O}"/>`);

export const KEYBOARD_SVG = svg(`
  <rect x="1.8" y="5.5" width="20.4" height="13" rx="3.4" fill="#fff" stroke="${O}" stroke-width="2"/>
  <g fill="#ffd54a" stroke="${O}" stroke-width="1.1">
    <rect x="4.6" y="8.2" width="3" height="2.6" rx="0.8"/><rect x="9" y="8.2" width="3" height="2.6" rx="0.8"/>
    <rect x="13.4" y="8.2" width="3" height="2.6" rx="0.8"/><rect x="17.8" y="8.2" width="2" height="2.6" rx="0.8"/>
  </g>
  <rect x="7" y="12.6" width="10" height="2.8" rx="1" fill="#ff8fbe" stroke="${O}" stroke-width="1.1"/>`);

export const GAMEPAD_SVG = svg(`
  <path d="M6.6 6.2h10.8c2.6 0 4.2 2.3 4.7 5.6l.6 4c.3 2.2-1 3.6-2.6 3.6-1.3 0-2.1-.7-3-1.9l-1.1-1.5H8.6l-1.1 1.5c-.9 1.2-1.7 1.9-3 1.9-1.6 0-2.9-1.4-2.6-3.6l.6-4c.5-3.3 2.1-5.6 4.1-5.6z"
        fill="#fff" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M7.4 9.2v4.4M5.2 11.4h4.4" stroke="${O}" stroke-width="2" stroke-linecap="round"/>
  <circle cx="15.6" cy="10.2" r="1.35" fill="#55d96a" stroke="${O}" stroke-width="1"/>
  <circle cx="18.2" cy="12.6" r="1.35" fill="#ff7a93" stroke="${O}" stroke-width="1"/>`);

/** "Plays on another screen": a little monitor with a phone in front of it (the roster badge of a remote player). */
export const SCREEN_SVG = svg(`
  <rect x="1.8" y="3.6" width="16.6" height="11.6" rx="2.4" fill="#fff" stroke="${O}" stroke-width="2"/>
  <rect x="4" y="5.8" width="12.2" height="7.2" rx="1" fill="#6fe3ef"/>
  <path d="M7 19.6h7.4M10.7 15.4v4.2" stroke="${O}" stroke-width="2" stroke-linecap="round"/>
  <rect x="15.6" y="10.2" width="6.4" height="11.4" rx="1.9" fill="#ffd54a" stroke="${O}" stroke-width="1.7"/>
  <circle cx="18.8" cy="19.2" r=".8" fill="${O}"/>`);

export const SPEAKER_ON_SVG = svg(`
  <path d="M3.6 9.4h3.4l4.6-3.9v13l-4.6-3.9H3.6z" fill="#fff" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M15 9.2c1.4 1.6 1.4 4 0 5.6M17.6 6.6c2.9 3 2.9 7.8 0 10.8" fill="none" stroke="${O}" stroke-width="2" stroke-linecap="round"/>`);

export const SPEAKER_OFF_SVG = svg(`
  <path d="M3.6 9.4h3.4l4.6-3.9v13l-4.6-3.9H3.6z" fill="#fff" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M15.4 9.6l5.4 5.4M20.8 9.6l-5.4 5.4" stroke="#e0507a" stroke-width="2.4" stroke-linecap="round"/>`);

export const MUSIC_ON_SVG = svg(`
  <path d="M9 17.4V6.2l10.4-2.2v11.4" fill="none" stroke="${O}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="M9 9.6l10.4-2.2" stroke="${O}" stroke-width="2" stroke-linecap="round"/>
  <ellipse cx="6.4" cy="17.6" rx="3.3" ry="2.7" fill="#ff8fbe" stroke="${O}" stroke-width="2"/>
  <ellipse cx="16.8" cy="15.4" rx="3.3" ry="2.7" fill="#ffd54a" stroke="${O}" stroke-width="2"/>`);

export const MUSIC_OFF_SVG = svg(`
  <g opacity=".5">
    <path d="M9 17.4V6.2l10.4-2.2v11.4" fill="none" stroke="${O}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M9 9.6l10.4-2.2" stroke="${O}" stroke-width="2" stroke-linecap="round"/>
    <ellipse cx="6.4" cy="17.6" rx="3.3" ry="2.7" fill="#fff" stroke="${O}" stroke-width="2"/>
    <ellipse cx="16.8" cy="15.4" rx="3.3" ry="2.7" fill="#fff" stroke="${O}" stroke-width="2"/>
  </g>
  <path d="M3.4 3.4l17.2 17.2" stroke="#e0507a" stroke-width="2.6" stroke-linecap="round"/>`);

export const SPARKLE_SVG = svg(`
  <path d="M12 2.6c.9 4.6 2.8 6.5 7.4 7.4-4.6.9-6.5 2.8-7.4 7.4-.9-4.6-2.8-6.5-7.4-7.4 4.6-.9 6.5-2.8 7.4-7.4z"
        fill="#ffe066" stroke="${O}" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M19 15.5c.4 1.9 1.2 2.7 3 3-1.8.4-2.6 1.2-3 3-.4-1.8-1.2-2.6-3-3 1.8-.3 2.6-1.1 3-3z" fill="#fff" stroke="${O}" stroke-width="1.2" stroke-linejoin="round"/>`);

export const BERRY_SVG = svg(`
  <circle cx="12" cy="14" r="7" fill="#ff4d6d" stroke="${O}" stroke-width="2"/>
  <path d="M12 7.2c-.3-2 .5-3.6 2.4-4.4" fill="none" stroke="${O}" stroke-width="2" stroke-linecap="round"/>
  <ellipse cx="9.4" cy="8" rx="3.2" ry="1.7" transform="rotate(-25 9.4 8)" fill="#5fd07a" stroke="${O}" stroke-width="1.3"/>
  <circle cx="9.6" cy="12.6" r="1.3" fill="#fff" opacity=".85"/>`);

export const FLAME_SVG = svg(`
  <path d="M12 2.4c.6 3.4 4.6 5.6 5.6 10 .9 4-1.8 8.4-5.6 8.4s-6.5-3.6-5.6-7.4c.5-2.1 1.8-3.2 2.4-4.8.3 1.3.9 2 1.7 2.4C10 7.6 10.6 4.6 12 2.4z"
        fill="#ff7a3d" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M12 10.8c.4 2 2.6 3.2 2.6 5.6 0 1.8-1.2 3.2-2.6 3.2s-2.6-1.4-2.6-3.2c0-1.6 1-2.2 1.6-3.4.3.7.6 1 1 1.1z" fill="#ffd23b"/>`);

/** Grey, "out" flame for the status readout of a cold fire. */
export const FLAME_OFF_SVG = svg(`
  <path d="M12 2.4c.6 3.4 4.6 5.6 5.6 10 .9 4-1.8 8.4-5.6 8.4s-6.5-3.6-5.6-7.4c.5-2.1 1.8-3.2 2.4-4.8.3 1.3.9 2 1.7 2.4C10 7.6 10.6 4.6 12 2.4z"
        fill="#c9c3da" stroke="${O}" stroke-width="2" stroke-linejoin="round" opacity=".75"/>`);

export const POT_SVG = svg(`
  <path d="M3 10.5h18v5.2c0 3.2-2.4 5.3-5.6 5.3H8.6C5.4 21 3 18.9 3 15.7z" fill="#8c84a8" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
  <rect x="1.6" y="8.6" width="20.8" height="3.4" rx="1.7" fill="#b9b4cc" stroke="${O}" stroke-width="2"/>
  <path d="M8.6 6.2c-.8-1.2.8-1.8 0-3M12.6 6.2c-.8-1.2.8-1.8 0-3M16.6 6.2c-.8-1.2.8-1.8 0-3" fill="none" stroke="${O}" stroke-width="1.7" stroke-linecap="round"/>`);

export const QUEST_SVG = svg(`
  <path d="M4.6 3.6h11.2c1.2 0 2 .8 2 2v13.8c0 1.1.6 1.7 1.6 1.7H7.4c-1.6 0-2.8-1.2-2.8-2.8z" fill="#fff8e0" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M17.8 19.4c0 1.1.6 1.7 1.6 1.7 1.3 0 1.9-.8 1.9-2v-1.6h-3.5z" fill="#ffd54a" stroke="${O}" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M8 8.4h6.4M8 12h6.4M8 15.6h3.8" stroke="#ff8fbe" stroke-width="1.8" stroke-linecap="round"/>`);

export const LEAVE_SVG = svg(`
  <path d="M14.4 4.2h4.4c1 0 1.8.8 1.8 1.8v12c0 1-.8 1.8-1.8 1.8h-4.4" fill="none" stroke="${O}" stroke-width="2" stroke-linecap="round"/>
  <path d="M3.4 12h10M9.8 7.6 14.2 12l-4.4 4.4" fill="none" stroke="${O}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`);

export const BACK_SVG = svg(`
  <path d="M9.4 6.4 4 12l5.4 5.6M4.6 12h10.6c2.8 0 4.8 1.8 4.8 4.4" fill="none" stroke="${O}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`);

export const FEAST_SVG = svg(`
  <ellipse cx="12" cy="17.6" rx="9.6" ry="3.4" fill="#fff" stroke="${O}" stroke-width="2"/>
  <ellipse cx="12" cy="16.6" rx="6.2" ry="1.9" fill="#ffe3ec"/>
  <circle cx="8.6" cy="12.4" r="3.3" fill="#ff5468" stroke="${O}" stroke-width="1.8"/>
  <circle cx="14.2" cy="11.6" r="3.6" fill="#ffb347" stroke="${O}" stroke-width="1.8"/>
  <circle cx="11.6" cy="8" r="3" fill="#7be05e" stroke="${O}" stroke-width="1.8"/>
  <path d="M5.4 4.4l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6zM19 3.6l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z" fill="#ffe066" stroke="${O}" stroke-width="1" stroke-linejoin="round"/>`);

export const HAT_SVG = svg(`
  <path d="M5.4 15.2C4.6 9.2 7.6 4.6 12 4.6s7.4 4.6 6.6 10.6z" fill="#ffc93c" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M5 14.6h14c1.1 0 1.8.8 1.8 1.8s-.7 1.8-1.8 1.8H5c-1.1 0-1.8-.8-1.8-1.8s.7-1.8 1.8-1.8z" fill="#ff8a5c" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
  <circle cx="12" cy="3.8" r="2" fill="#fff" stroke="${O}" stroke-width="1.6"/>
  <path d="M9 8.6c.6-1 1.6-1.6 2.8-1.7" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>`);

export const BRIDGE_SVG = svg(`
  <path d="M1.8 17.4V9.6M22.2 17.4V9.6" fill="none" stroke="${O}" stroke-width="4.2" stroke-linecap="round"/>
  <path d="M1.8 17.4V9.6M22.2 17.4V9.6" fill="none" stroke="#c98a54" stroke-width="2" stroke-linecap="round"/>
  <path d="M1.8 11.2C7 15.8 17 15.8 22.2 11.2" fill="none" stroke="${O}" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M1.8 11.2C7 15.8 17 15.8 22.2 11.2" fill="none" stroke="#f2cf96" stroke-width="1.6" stroke-linecap="round"/>
  <rect x="2.6" y="14.4" width="18.8" height="3.6" rx="1.4" fill="#c98a54" stroke="${O}" stroke-width="2"/>
  <path d="M8 14.6v3.2M12 14.6v3.2M16 14.6v3.2" stroke="#8f5b34" stroke-width="1.3" stroke-linecap="round"/>
  <path d="M2 21.4c3 1.2 5-.6 8 0s5 1.2 8 0 3-.6 4-.2" fill="none" stroke="#5fc4ff" stroke-width="1.8" stroke-linecap="round"/>`);

/** A little tent with a flame in front: the Frostpine camp (its menu row, signposts' icon, toasts). */
export const CAMP_SVG = svg(`
  <path d="M12 6.4V2.4" stroke="${O}" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M12 2.6l4 1.4-4 1.4z" fill="#ffd54a" stroke="${O}" stroke-width="1.3" stroke-linejoin="round"/>
  <path d="M2.2 20.4 12 6l9.8 14.4z" fill="#ff7a5c" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M12 20.4H8.6L12 11.2l3.4 9.2z" fill="#3a2f55" stroke="${O}" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M12 20.4c-1.7 0-2.5-1.1-2.5-2.1 0-1.3 1.2-1.8 1.5-3.2.9.6 1 1.3 1 1.8.4-.3.6-.7.6-1.2.9.8 1.9 1.5 1.9 2.6 0 1.1-.9 2.1-2.5 2.1z" fill="#ffb23c" stroke="${O}" stroke-width="1" stroke-linejoin="round"/>`);

/** Frostpine's critters (Step 34b): small round faces for the "moved into the camp" toast. */
export const FOX_SVG = svg(`
  <path d="M3.4 3.6l5.2 3.6M20.6 3.6l-5.2 3.6" stroke="${O}" stroke-width="5" stroke-linecap="round"/>
  <path d="M3.4 3.6l5.2 3.6M20.6 3.6l-5.2 3.6" stroke="#f27d2a" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M12 21c-5 0-8.6-3-8.6-7.6C3.4 9 7.2 6 12 6s8.6 3 8.6 7.4C20.6 18 17 21 12 21z" fill="#f27d2a" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M12 21c-2.6 0-4.6-1.2-5.8-3.2 1.6-.6 3.4-1.8 5.8-1.8s4.2 1.2 5.8 1.8C16.6 19.8 14.6 21 12 21z" fill="#fff6ea"/>
  <circle cx="8.6" cy="12.4" r="1.3" fill="${O}"/><circle cx="15.4" cy="12.4" r="1.3" fill="${O}"/><ellipse cx="12" cy="16.2" rx="1.5" ry="1.1" fill="${O}"/>`);

export const SQUIRREL_SVG = svg(`
  <path d="M19.6 20.400c3.2-1 3.8-6.6 1.2-9.8-1.8-2.2-4.4-2-4.2.2.1 1.5 1.7 1.8 1.8 3.4.1 2.2-2.6 3.4-2.6 3.400z" fill="#b9582c" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M5 8.4 3.8 3.800l4 1.800M14.6 5.600l3.8-1.6-1 4.6" fill="#b9582c" stroke="${O}" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M10.8 21C6.4 21 3.8 18.2 3.8 14.4 3.8 10.2 6.8 7 10.8 7s7 3.2 7 7.400c0 3.8-2.6 6.6-7 6.600z" fill="#b9582c" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
  <ellipse cx="10.8" cy="17.6" rx="3.6" ry="2.8" fill="#f6dcb4"/>
  <circle cx="7.8" cy="12.6" r="1.3" fill="${O}"/><circle cx="13.8" cy="12.6" r="1.3" fill="${O}"/><ellipse cx="10.8" cy="15.4" rx="1.2" ry="0.9" fill="#6b3a3a"/>`);

export const RABBIT_SVG = svg(`
  <path d="M8.2 11C6.6 7 6.6 2.8 8.6 2.800S11.4 7 11 11zM15.8 11c1.6-4 1.6-8.2-.4-8.200S12.6 7 13 11z" fill="#fff" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M8.8 9.600c-.6-2.4-.6-4.6 0-4.800M15.2 9.600c.6-2.4.6-4.6 0-4.8" stroke="#ff93b4" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M12 21.400c-5 0-8-2.8-8-6.6 0-3.8 3.2-6 8-6s8 2.2 8 6c0 3.8-3 6.6-8 6.600z" fill="#fff" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
  <circle cx="8.8" cy="14.4" r="1.3" fill="${O}"/><circle cx="15.2" cy="14.4" r="1.3" fill="${O}"/><ellipse cx="12" cy="17.2" rx="1.2" ry="0.9" fill="#ff93b4"/>`);

export const GROUSE_SVG = svg(`
  <path d="M18.6 14.200l3.2-3.600M19.6 17l2.8-.6M18.8 19.400l2.4 1.6" stroke="${O}" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M11.6 21.400c-5 0-8-3-8-7.400S7 6.4 11.6 6.4 19.6 9.6 19.6 14s-3 7.4-8 7.400z" fill="#a8673a" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M8.2 17.600c1.6 1.4 4.8 1.4 6.8 0M9 14.600c1.2.8 3.4.8 4.8 0" stroke="#7a4524" stroke-width="1.3" stroke-linecap="round" fill="none"/>
  <path d="M6.4 9.200c1.2-1.6 3.6-1.8 5-.2" fill="none" stroke="#e8453c" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M3.6 11.600l-2.2 1.4 2.2 1.200z" fill="#ffc93c" stroke="${O}" stroke-width="1.4" stroke-linejoin="round"/>
  <circle cx="7.2" cy="12" r="1.2" fill="${O}"/>`);

/** Name -> svg lookup for toast icons etc. (catalog.js adds one entry per item id, so hud.toast({icon:'apple'}) works too.) */
export const ICONS = {
  keyboard: KEYBOARD_SVG, gamepad: GAMEPAD_SVG, phone: PHONE_SVG, remote: PHONE_SVG, screen: SCREEN_SVG,
  speaker: SPEAKER_ON_SVG, muted: SPEAKER_OFF_SVG, music: MUSIC_ON_SVG, musicOff: MUSIC_OFF_SVG, sparkle: SPARKLE_SVG, berry: BERRY_SVG,
  flame: FLAME_SVG, pot: POT_SVG, quest: QUEST_SVG, feast: FEAST_SVG, hat: HAT_SVG, bridge: BRIDGE_SVG, leave: LEAVE_SVG, back: BACK_SVG, camp: CAMP_SVG, fox: FOX_SVG, squirrel: SQUIRREL_SVG, rabbit: RABBIT_SVG, grouse: GROUSE_SVG,
};

// Day/night clock icons (also used in phase-change toasts).
export const SUN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><g stroke="#7f531e" stroke-width="2" stroke-linecap="round"><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l1.5 1.5m13 13L20 20M4 20l1.5-1.5m13-13L20 4"/><circle cx="12" cy="12" r="6" fill="#ffd54a"/></g></svg>';
export const MOON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#e1eaff" stroke="#4f5c95" stroke-width="2"/><g fill="#a5b5d6"><circle cx="9" cy="8" r="2"/><circle cx="15" cy="14" r="2.5"/><circle cx="8" cy="16" r="1.4"/></g></svg>';

// ---- Tail icons (Step 36a): one per tail, for toasts, the reveal row and the tail stump menu (36b). TAIL_ICONS[id] with the ids of player/tails.js
// ('fox-1' ... 'grouse-3'); also reachable as ICONS['tail-fox-1'] etc. Level 3 is the rainbow version of the same shape.
export const TAIL_RAINBOW = ['#ff5a5a', '#ff9a3c', '#ffe14a', '#5ed16a', '#4aa8ff', '#a06bff'];
const TAIL_ICON_COLORS = {
  fox:      { 1: { body: '#f27d2a', tip: '#fff6ea' }, 2: { body: '#dde6ef', tip: '#ffffff' }, 3: { rainbow: true, tip: '#ffffff' } },
  squirrel: { 1: { body: '#b9582c', tip: '#e4a070' }, 2: { body: '#8e95a3', tip: '#d0d5de' }, 3: { rainbow: true } },
  rabbit:   { 1: { body: '#ffffff' }, 2: { body: '#c98a4a' }, 3: { rainbow: true } },
  grouse:   { 1: { body: '#a8673a', tip: '#eadfc8' }, 2: { body: '#f4f6fa', tip: '#4a4458' }, 3: { rainbow: true } },
};
function tailIcon(species, level) {
  const c = TAIL_ICON_COLORS[species][level], id = `tg-${species}-${level}`;
  const stops = (list) => list.map((k, i) => `<stop offset="${(i / list.length).toFixed(3)}" stop-color="${k}"/><stop offset="${((i + 1) / list.length).toFixed(3)}" stop-color="${k}"/>`).join('');
  const grad = (list) => `<defs><linearGradient id="${id}" x1="0.1" y1="0.9" x2="0.9" y2="0.1">${stops(list)}</linearGradient></defs>`;
  if (species === 'fox') {
    const fill = `url(#${id})`;
    const list = c.rainbow ? [...TAIL_RAINBOW.slice(0, 5).flatMap((k) => [k]), c.tip] : [c.body, c.body, c.body, c.body, c.body, c.tip];
    return svg(`${grad(list)}<path d="M3.6 20.6C3 11.4 9.6 3.6 20.4 3.4 20.8 13 15.4 21 3.6 20.6z" fill="${fill}" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>`);
  }
  if (species === 'squirrel') {
    const list = c.rainbow ? TAIL_RAINBOW : [c.body, c.body, c.body, c.body, c.body, c.tip];
    return svg(`${grad(list)}<path d="M4.6 21.2C2.6 15.600 8 14.400 9.200 10.400 10.400 6.400 6 5.200 6.400 2.800 13 1.800 20.600 5.600 20.400 12.800 20.200 18 15 21.800 4.600 21.200z" fill="url(#${id})" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>`);
  }
  if (species === 'rabbit') {
    const circles = '<circle cx="12" cy="13" r="7.600"/><circle cx="7.400" cy="9.400" r="4"/><circle cx="16.600" cy="9.200" r="4"/><circle cx="12" cy="6.400" r="3.600"/><circle cx="8" cy="17.600" r="3.600"/><circle cx="16.200" cy="17.600" r="3.600"/>';
    const list = c.rainbow ? TAIL_RAINBOW : [c.body];
    return svg(`${grad(list.length > 1 ? list : [c.body, c.body])}<g fill="${O}" stroke="${O}" stroke-width="3.400" stroke-linejoin="round">${circles}</g><g fill="url(#${id})">${circles}</g>`);
  }
  const feathers = [-52, -26, 0, 26, 52].map((a, i) => {
    const fill = c.rainbow ? TAIL_RAINBOW[[0, 1, 2, 3, 4][i]] : c.body;
    return `<g transform="rotate(${a} 12 22)"><ellipse cx="12" cy="12.400" rx="3" ry="9" fill="${fill}" stroke="${O}" stroke-width="1.800"/>${c.tip ? `<ellipse cx="12" cy="4.800" rx="2" ry="1.800" fill="${c.tip}"/>` : ''}</g>`;
  }).join('');
  return svg(feathers);
}
export const TAIL_ICONS = {};
for (const species of ['fox', 'squirrel', 'rabbit', 'grouse']) {
  for (const level of [1, 2, 3]) { const id = `${species}-${level}`; TAIL_ICONS[id] = tailIcon(species, level); ICONS['tail-' + id] = TAIL_ICONS[id]; }
}
