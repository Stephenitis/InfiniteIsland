// Small round speaker button in the HUD (next to the phone button) that toggles the sound. Icons are inline SVG.
import { SPEAKER_ON_SVG, SPEAKER_OFF_SVG } from './icons.js';

export function createMuteButton(root, sfx) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'hud-mute-btn';
  const render = () => {
    btn.innerHTML = sfx.muted ? SPEAKER_OFF_SVG : SPEAKER_ON_SVG;
    btn.title = sfx.muted ? 'Sound off (M)' : 'Sound on (M)';
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-pressed', String(sfx.muted));
    btn.classList.toggle('muted', sfx.muted);
  };
  render();
  sfx.onChange(render);
  btn.addEventListener('click', () => {
    sfx.unlock();
    sfx.toggleMute();
    btn.blur();          // Space / Enter must keep meaning "interact", not "press this button again"
  });
  root.appendChild(btn);
  return btn;
}
