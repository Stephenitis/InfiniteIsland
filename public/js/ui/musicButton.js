// Small round music-note button in the HUD (left of the speaker button) that toggles the background music. Icons are inline SVG.
import { MUSIC_ON_SVG, MUSIC_OFF_SVG } from './icons.js';

export function createMusicButton(root, music, sfx) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'hud-music-btn';
  const render = () => {
    const on = music.enabled;
    btn.innerHTML = on ? MUSIC_ON_SVG : MUSIC_OFF_SVG;
    btn.title = on ? 'Music on (N)' : 'Music off (N)';
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-pressed', String(!on));
    btn.classList.toggle('off', !on);
  };
  render();
  music.on('enabled', render);
  btn.addEventListener('click', () => {
    sfx.unlock();
    music.toggle();
    btn.blur();          // Space / Enter must keep meaning "interact", not "press this button again"
  });
  root.appendChild(btn);
  return btn;
}
