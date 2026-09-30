// HUD: floating interact prompt bubble, toasts and the connected-inputs pill. Pure DOM overlay inside #hud.
//
//   const hud = createHud(document.getElementById('hud'));
//   hud.update(dt, { camera, target, activeSource, dialogOpen, promptText })   // every frame, after the camera moved (promptText optional override)
//   hud.toast('clink!', { icon: '✨', duration: 2000 })
//   hud.setInputConnected('gamepad', true)    // 'keyboard' | 'gamepad' | 'remote' (phone 📱; 'phone'/'touch' are aliases)
import * as THREE from 'three';
import { ICONS } from './icons.js';

// Inline SVGs (emoji render as empty boxes in some browsers).
const INPUT_ICONS = { keyboard: ICONS.keyboard, gamepad: ICONS.gamepad, remote: ICONS.phone };
const INPUT_ALIAS = { phone: 'remote', touch: 'remote', controller: 'gamepad', pad: 'gamepad' };

/** Height above an interactable's base where its prompt bubble is anchored. */
function anchorHeight(it) {
  const sc = it.object ? it.object.scale.y : (it.instance ? it.instance.scale : 1);
  switch (it.type) {
    case 'tree': return 3.6 * sc;
    case 'palm': return 3.4 * sc;
    case 'rock': return 0.9 * sc + 0.7;
    case 'bush': return 1.7 * sc;
    case 'flower': return 0.95 * sc;
    case 'sign': return 2.9 * sc;
    case 'item': return 1.75;
    default: return 1.6;
  }
}

export function createHud(root) {
  // ---- connected inputs pill (top-left)
  const pill = document.createElement('div');
  pill.className = 'hud-pill';
  const slots = {};
  for (const [name, icon] of Object.entries(INPUT_ICONS)) {
    const s = document.createElement('span');
    s.className = 'hud-slot';
    s.dataset.input = name;
    s.innerHTML = icon;
    s.title = name === 'keyboard' ? 'Keyboard' : name === 'gamepad' ? 'Gamepad' : 'Phone controller';
    s.hidden = name !== 'keyboard';
    pill.appendChild(s);
    slots[name] = s;
  }
  root.appendChild(pill);

  // ---- toasts (top-center stack)
  const toasts = document.createElement('div');
  toasts.className = 'hud-toasts';
  root.appendChild(toasts);

  // ---- interact prompt: outer (positioned) > pop (pop-in on target change) > bubble (idle bob)
  const prompt = document.createElement('div');
  prompt.className = 'hud-prompt';
  prompt.hidden = true;
  const pop = document.createElement('div');
  pop.className = 'hud-prompt-pop';
  const bubble = document.createElement('div');
  bubble.className = 'hud-prompt-bubble';
  const glyph = document.createElement('span');
  glyph.className = 'glyph key';
  glyph.textContent = 'E';
  const label = document.createElement('span');
  label.className = 'hud-prompt-label';
  bubble.append(glyph, label);
  pop.appendChild(bubble);
  prompt.appendChild(pop);
  root.appendChild(prompt);

  let shownId = null;          // interactable currently shown
  let shownText = '';
  let shownGlyph = '';
  let visible = false;
  let suppress = 0;            // seconds the prompt stays hidden (so effects aren't covered by it)
  const v = new THREE.Vector3();

  function setGlyph(kind) {
    if (kind === shownGlyph) return;
    shownGlyph = kind;
    if (kind === 'key') { glyph.className = 'glyph key'; glyph.textContent = 'E'; }
    else { glyph.className = 'glyph pad'; glyph.textContent = 'A'; }
  }

  function retriggerPop() {
    pop.classList.remove('pop');
    void pop.offsetWidth;        // restart the CSS animation
    pop.classList.add('pop');
  }

  function hidePrompt() {
    if (!visible) return;
    visible = false;
    prompt.hidden = true;
    shownId = null;
    shownText = '';
  }

  const hud = {
    root, prompt,

    /** Show / hide an input's icon in the top-left pill. */
    setInputConnected(name, connected) {
      name = INPUT_ALIAS[name] || name;
      const s = slots[name];
      if (!s) return;
      const on = !!connected;
      if (s.hidden === !on) return;
      s.hidden = !on;
      if (on) { s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop'); }
    },

    isInputConnected(name) {
      const s = slots[INPUT_ALIAS[name] || name];
      return !!s && !s.hidden;
    },

    /** Little comic toast at the top of the screen; auto-dismisses (default 2s). */
    toast(text, { duration = 2000, icon = '' } = {}) {
      const el = document.createElement('div');
      el.className = 'hud-toast';
      if (icon) {
        // `icon` is a name from ICONS ('gamepad', 'phone', 'sparkle', 'berry', 'speaker', 'muted'); anything else is shown as text.
        const ic = document.createElement('span');
        ic.className = 'hud-toast-icon';
        if (ICONS[icon]) ic.innerHTML = ICONS[icon]; else ic.textContent = icon;
        el.appendChild(ic);
      }
      el.appendChild(document.createTextNode(text));
      toasts.appendChild(el);
      while (toasts.children.length > 4) toasts.firstElementChild.remove();
      const kill = () => {
        el.classList.add('out');
        const done = () => el.remove();
        el.addEventListener('animationend', done, { once: true });
        setTimeout(done, 500);     // fallback if animations are disabled / throttled
      };
      setTimeout(kill, duration);
      return el;
    },

    /** Hide the prompt for a moment (after an interaction, so the effect isn't covered); it pops back in afterwards. */
    suppressPrompt(seconds = 0.7) { suppress = Math.max(suppress, seconds); hidePrompt(); },

    /** Reposition / refresh the prompt bubble. Call once per frame after the camera has moved. */
    update(dt, { camera, target, activeSource = 'keyboard', dialogOpen = false, promptText = null }) {
      if (suppress > 0) suppress -= dt;
      if (!target || dialogOpen || suppress > 0) { hidePrompt(); return; }

      const it = target;
      const pos = it.instance ? it.instance.position : it.position;
      v.set(pos.x, pos.y + anchorHeight(it), pos.z);
      camera.updateMatrixWorld();
      v.project(camera);
      if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { hidePrompt(); return; }

      if (!visible) { visible = true; prompt.hidden = false; }
      const text = promptText || it.prompt || 'Interact';   // promptText overrides (e.g. "Chop" / "Break" while holding a capable tool)
      if (shownId !== it.id || shownText !== text) {
        shownId = it.id;
        shownText = text;
        label.textContent = text;
        retriggerPop();
      }
      setGlyph(activeSource === 'keyboard' ? 'key' : 'pad');
      const w = window.innerWidth, h = window.innerHeight;
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      prompt.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    },
  };
  return hud;
}
