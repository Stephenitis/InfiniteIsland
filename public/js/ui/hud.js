// HUD: floating interact prompt bubbles (one per player, a pool of 4), toasts and the player roster. Pure DOM overlay inside #hud.
//
//   const hud = createHud(document.getElementById('hud'));
//   hud.update(dt, { camera, multi, prompts })   // every frame, after the camera moved
//       prompts: [{ key: playerIndex, target: interactable, text?: 'Chop' (overrides target.prompt), source: 'keyboard'|'gamepad'|...,
//                   color: '#5fc4ff', label: 'P2' }]   -> one bubble per entry (key 0..3). With `multi` the bubbles get the player's colour
//                   (border + a small "P2" badge); solo play looks like it always did. Bubbles that would overlap on screen (e.g. two
//                   players at the same tree) are stacked upward.
//   hud.suppressPrompt(seconds, key)   // hide one player's bubble for a moment (after an interaction)
//   hud.toast('clink!', { icon: 'sparkle' | 'apple' | '<svg ...>', duration: 2000 })   // a name from ICONS (catalog item ids too), a raw <svg> string or text
//   hud.setRoster([{ state: 'empty'|'active'|'away', label:'P1', color:'#ffc93c', icons:['keyboard','gamepad'] } x4])   // top-left player chips (PlayerManager)
import * as THREE from 'three';
import { ICONS } from './icons.js';

// Inline SVGs (emoji render as empty boxes in some browsers).
const INPUT_ALIAS = { phone: 'remote', touch: 'remote', controller: 'gamepad', pad: 'gamepad' };
const ROSTER_HINT = 'Press a button on a gamepad or connect a phone to join';

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
    case 'herb': return 1.1 * sc;
    case 'mushroom': return 1.0;
    case 'digspot': return 1.0;
    case 'campfire': return 2.3;
    default: return 1.6;
  }
}

export function createHud(root) {
  // ---- player roster (top-left): P1-P4 chips in the player colours, each with its device icon(s); empty slots show "+"
  const roster = document.createElement('div');
  roster.className = 'hud-roster';
  roster.setAttribute('aria-label', 'Players');
  const chips = [];
  for (let i = 0; i < 4; i++) {
    const chip = document.createElement('div');
    chip.className = 'roster-chip empty';
    chip.dataset.slot = String(i + 1);
    chip.innerHTML = '<span class="rc-label"></span><span class="rc-icons"></span><span class="rc-plus">+</span>';
    chip.title = ROSTER_HINT;
    roster.appendChild(chip);
    chips.push({ el: chip, label: chip.querySelector('.rc-label'), icons: chip.querySelector('.rc-icons'), sig: '' });
  }
  const rosterHint = document.createElement('div');
  rosterHint.className = 'roster-hint';
  rosterHint.textContent = ROSTER_HINT;
  roster.appendChild(rosterHint);
  root.appendChild(roster);
  setTimeout(() => rosterHint.classList.add('gone'), 12000);     // the tooltip on the "+" chips stays; the visible hint retires
  const inputState = new Map();                                    // legacy setInputConnected() bookkeeping

  // ---- toasts (top-center stack)
  const toasts = document.createElement('div');
  toasts.className = 'hud-toasts';
  root.appendChild(toasts);

  // ---- interact prompts: a pool of 4 bubbles (one per player slot). Each: outer (positioned) > pop (pop-in on target change) > bubble (idle bob)
  const bubbles = [];
  for (let i = 0; i < 4; i++) {
    const el = document.createElement('div');
    el.className = 'hud-prompt';
    el.hidden = true;
    const pop = document.createElement('div');
    pop.className = 'hud-prompt-pop';
    const bubble = document.createElement('div');
    bubble.className = 'hud-prompt-bubble';
    const badge = document.createElement('span');
    badge.className = 'hud-prompt-badge';
    badge.hidden = true;
    const glyph = document.createElement('span');
    glyph.className = 'glyph key';
    glyph.textContent = 'E';
    const label = document.createElement('span');
    label.className = 'hud-prompt-label';
    bubble.append(glyph, label, badge);
    pop.appendChild(bubble);
    el.appendChild(pop);
    root.appendChild(el);
    bubbles.push({
      el, pop, bubble, badge, glyph, label,
      visible: false, shownId: null, shownText: '', shownGlyph: '', shownColor: null, multi: false, suppress: 0,
      w: 120, x: 0, y: 0, ty: 0, sy: NaN,
    });
  }
  const prompt = bubbles[0].el;      // (P1's bubble; kept for older callers / tests)
  const STACK_H = 54;                // px a stacked bubble is lifted above the one it would overlap
  const v = new THREE.Vector3();

  function setGlyph(b, kind) {
    if (kind === b.shownGlyph) return;
    b.shownGlyph = kind;
    if (kind === 'key') { b.glyph.className = 'glyph key'; b.glyph.textContent = 'E'; }
    else { b.glyph.className = 'glyph pad'; b.glyph.textContent = 'A'; }
  }

  function retriggerPop(b) {
    b.pop.classList.remove('pop');
    void b.pop.offsetWidth;        // restart the CSS animation
    b.pop.classList.add('pop');
  }

  function hideBubble(b) {
    if (!b.visible) return;
    b.visible = false;
    b.el.hidden = true;
    b.shownId = null;
    b.shownText = '';
    b.sy = NaN;                      // snap to its stack slot when it reappears
  }

  const hud = {
    root, prompt, bubbles,

    /** Update the player roster chips (see the header comment for the slot shape). */
    setRoster(slots) {
      slots.forEach((s, i) => {
        const c = chips[i];
        if (!c) return;
        const sig = JSON.stringify(s);
        if (sig === c.sig) return;
        const wasEmpty = c.sig === '' || c.el.classList.contains('empty');
        c.sig = sig;
        c.el.style.setProperty('--pc', s.color);
        c.el.classList.toggle('empty', s.state === 'empty');
        c.el.classList.toggle('away', s.state === 'away');
        c.label.textContent = s.label;
        c.icons.innerHTML = (s.icons || []).map((n) => ICONS[n] || '').join('');
        c.el.title = s.state === 'empty' ? ROSTER_HINT : `${s.label} · ${(s.icons || []).join(' + ')}${s.state === 'away' ? ' (disconnected)' : ''}`;
        if (s.state !== 'empty' && wasEmpty) { c.el.classList.remove('pop'); void c.el.offsetWidth; c.el.classList.add('pop'); }
      });
    },

    /** Legacy (pre-multiplayer) input pill API: the roster replaced the pill, so this only remembers the flag. */
    setInputConnected(name, connected) { inputState.set(INPUT_ALIAS[name] || name, !!connected); },
    isInputConnected(name) { return !!inputState.get(INPUT_ALIAS[name] || name); },

    /** Little comic toast at the top of the screen; auto-dismisses (default 2s). */
    toast(text, { duration = 2000, icon = '' } = {}) {
      const el = document.createElement('div');
      el.className = 'hud-toast';
      if (icon) {
        // `icon` is a name from ICONS ('gamepad', 'phone', 'sparkle', 'berry', 'speaker', 'muted'); anything else is shown as text.
        const ic = document.createElement('span');
        ic.className = 'hud-toast-icon';
        if (ICONS[icon]) ic.innerHTML = ICONS[icon];
        else if (icon.startsWith('<svg')) ic.innerHTML = icon;
        else ic.textContent = icon;
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

    /** Hide one player's prompt for a moment (after an interaction, so the effect isn't covered); it pops back in afterwards. */
    suppressPrompt(seconds = 0.7, key = 0) {
      const b = bubbles[key];
      if (!b) return;
      b.suppress = Math.max(b.suppress, seconds);
      hideBubble(b);
    },

    /** Reposition / refresh the prompt bubbles. Call once per frame after the camera has moved. */
    update(dt, { camera, prompts = [], multi = false }) {
      const w = window.innerWidth, h = window.innerHeight;
      camera.updateMatrixWorld();
      const active = [];
      for (const b of bubbles) if (b.suppress > 0) b.suppress -= dt;
      const wanted = new Set();
      for (const p of prompts) {
        const b = bubbles[p.key];
        const it = p.target;
        if (!b || !it || b.suppress > 0) continue;
        const pos = it.instance ? it.instance.position : it.position;
        v.set(pos.x, pos.y + anchorHeight(it), pos.z);
        v.project(camera);
        if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
        wanted.add(b);

        if (!b.visible) { b.visible = true; b.el.hidden = false; b.shownText = ''; }
        const text = p.text || it.prompt || 'Interact';   // text overrides (e.g. "Chop" / "Break" while holding a capable tool)
        const kind = p.source === 'keyboard' || p.source === undefined ? 'key' : 'pad';
        let remeasure = false;
        if (b.shownId !== it.id || b.shownText !== text) {
          b.shownId = it.id;
          b.shownText = text;
          b.label.textContent = text;
          retriggerPop(b);
          remeasure = true;
        }
        if (kind !== b.shownGlyph) { setGlyph(b, kind); remeasure = true; }
        const colour = multi ? p.color : null;
        if (b.multi !== !!multi || b.shownColor !== colour || (multi && b.badge.textContent !== p.label)) {
          b.multi = !!multi;
          b.shownColor = colour;
          b.el.classList.toggle('multi', !!multi);
          b.badge.hidden = !multi;
          if (multi) { b.el.style.setProperty('--pc', p.color); b.badge.textContent = p.label || ''; }
          remeasure = true;
        }
        if (remeasure) b.w = b.bubble.offsetWidth || b.w;      // width only changes with text / glyph / badge
        b.x = (v.x * 0.5 + 0.5) * w;
        b.y = (-v.y * 0.5 + 0.5) * h;
        active.push(b);
      }
      for (const b of bubbles) if (!wanted.has(b)) hideBubble(b);

      // stack: bubbles whose screen boxes overlap are lifted above the earlier (lower-numbered) one
      const placed = [];
      for (const b of active) {
        let y = b.y;
        for (let guard = 0; guard < 5; guard++) {
          let hit = null;
          for (const q of placed) {
            if (Math.abs(q.x - b.x) < (q.w + b.w) * 0.5 + 6 && Math.abs(q.ty - y) < STACK_H - 4) { hit = q; break; }
          }
          if (!hit) break;
          y = hit.ty - STACK_H;
        }
        b.ty = y;
        placed.push(b);
        // ease the stack offset so bubbles glide instead of teleporting when players walk together / apart
        const target = y - b.y;
        if (Number.isNaN(b.sy)) b.sy = target;
        b.sy += (target - b.sy) * (1 - Math.exp(-14 * dt));
        if (Math.abs(target - b.sy) < 0.3) b.sy = target;
        b.el.style.transform = `translate3d(${b.x.toFixed(1)}px, ${(b.y + b.sy).toFixed(1)}px, 0)`;
      }
    },
  };
  return hud;
}
