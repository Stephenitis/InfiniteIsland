// Inline SVG icons in the game's cute style (white fill, dark outline, pastel accents). Used instead of emoji
// because emoji fonts are missing in some browsers (they render as empty boxes). All icons are 24x24 and size with `1em`.
const O = '#2b2340';   // outline colour
const svg = (body, extra = '') => `<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false"${extra}>${body}</svg>`;

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

export const SPARKLE_SVG = svg(`
  <path d="M12 2.6c.9 4.6 2.8 6.5 7.4 7.4-4.6.9-6.5 2.8-7.4 7.4-.9-4.6-2.8-6.5-7.4-7.4 4.6-.9 6.5-2.8 7.4-7.4z"
        fill="#ffe066" stroke="${O}" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M19 15.5c.4 1.9 1.2 2.7 3 3-1.8.4-2.6 1.2-3 3-.4-1.8-1.2-2.6-3-3 1.8-.3 2.6-1.1 3-3z" fill="#fff" stroke="${O}" stroke-width="1.2" stroke-linejoin="round"/>`);

export const BERRY_SVG = svg(`
  <circle cx="12" cy="14" r="7" fill="#ff4d6d" stroke="${O}" stroke-width="2"/>
  <path d="M12 7.2c-.3-2 .5-3.6 2.4-4.4" fill="none" stroke="${O}" stroke-width="2" stroke-linecap="round"/>
  <ellipse cx="9.4" cy="8" rx="3.2" ry="1.7" transform="rotate(-25 9.4 8)" fill="#5fd07a" stroke="${O}" stroke-width="1.3"/>
  <circle cx="9.6" cy="12.6" r="1.3" fill="#fff" opacity=".85"/>`);

/** Name -> svg lookup for toast icons etc. */
export const ICONS = {
  keyboard: KEYBOARD_SVG, gamepad: GAMEPAD_SVG, phone: PHONE_SVG, remote: PHONE_SVG,
  speaker: SPEAKER_ON_SVG, muted: SPEAKER_OFF_SVG, sparkle: SPARKLE_SVG, berry: BERRY_SVG,
};
