// Small sun/moon clock next to the sound controls. DOM changes only once per game minute.
import { SUN_SVG, MOON_SVG } from './icons.js';

const PHASE_MESSAGES = { dawn: 'Dawn is breaking', day: 'Good morning!', dusk: 'The sun is setting…', night: 'Nighttime' };

export function createTimeDial(root, { clock, hud }) {
  const el = document.createElement('div');
  el.className = 'hud-time-dial';
  el.setAttribute('role', 'img');
  el.innerHTML = `<svg viewBox="0 0 64 30" class="time-arc" aria-hidden="true"><path d="M8 25 A24 22 0 0 1 56 25" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="2 3"/></svg><span class="time-body"></span><span class="time-label"></span>`;
  root.querySelector('.hud-options').prepend(el);
  const body = el.querySelector('.time-body'), label = el.querySelector('.time-label');
  let lastMinute = -1, lastMoon = null;
  clock.on('phase', (phase) => hud.toast(PHASE_MESSAGES[phase], { icon: clock.isMoon ? MOON_SVG : SUN_SVG, duration: 2200 }));
  function update() {
    const minute = Math.floor(clock.hour * 60);
    if (minute === lastMinute && clock.isMoon === lastMoon) return;
    lastMinute = minute;
    lastMoon = clock.isMoon;
    const hour = Math.floor(minute / 60);
    const text = `${hour % 12 || 12}:${String(minute % 60).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
    label.textContent = text;
    el.title = `${clock.phase} · ${text}`;
    el.setAttribute('aria-label', el.title);
    body.innerHTML = clock.isMoon ? MOON_SVG : SUN_SVG;
    const progress = clock.isMoon ? ((clock.hour - 19.5 + 24) % 24) / 10 : (clock.hour - 5.5) / 14;
    const angle = Math.PI * (1 - progress);
    body.style.left = (32 + Math.cos(angle) * 24) + 'px';
    body.style.top = (25 - Math.sin(angle) * 22) + 'px';
    el.classList.toggle('night', clock.isMoon);
  }
  update();
  return { element: el, update };
}
