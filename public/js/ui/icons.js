// Inline SVG icons in the game's cute style (white fill, dark outline, pastel accents). Used instead of emoji
// because emoji fonts are missing in some browsers (they render as empty boxes). All icons are 24x24 and size with `1em`.
export const OUTLINE = '#2b2340';   // outline colour
const O = OUTLINE;
export const svg = (body, extra = '') => `<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false"${extra}>${body}</svg>`;

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

/** Name -> svg lookup for toast icons etc. (catalog.js adds one entry per item id, so hud.toast({icon:'apple'}) works too.) */
export const ICONS = {
  keyboard: KEYBOARD_SVG, gamepad: GAMEPAD_SVG, phone: PHONE_SVG, remote: PHONE_SVG,
  speaker: SPEAKER_ON_SVG, muted: SPEAKER_OFF_SVG, music: MUSIC_ON_SVG, musicOff: MUSIC_OFF_SVG, sparkle: SPARKLE_SVG, berry: BERRY_SVG,
  flame: FLAME_SVG, pot: POT_SVG, quest: QUEST_SVG, feast: FEAST_SVG, leave: LEAVE_SVG, back: BACK_SVG,
};
