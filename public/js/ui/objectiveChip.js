// The section objective chip + edge arrows (Step 56), shown while a local player is inside a combat area. Step 57: the bailey's `train` objective lists its four moves under
// the card with a tick each (and counts its grace period down in the label).
//
//   const chip = createObjectiveChip(root, { camera });     // `camera` = the THREE camera (the arrows project world points through it)
//   chip.update(state, { inside, dt })                      // every frame; `state` = the synced DungeonRun, `inside` = a local player is in the area
//
// The chip sits where the quest tracker does (that one hides inside a run): a comic card with the section name, the objective label and a count pill ("Seal shards  2 / 3").
// It pops when the count changes and goes green when the objective is done. After COMBAT.objective.hintDelay seconds of the run's clock without progress (`obj.since`)
// up to four edge arrows (the regroup arrows' look, `.hud-edge`) point at what is left (objectiveTargets: guardians / pieces / the altar / braziers); they hide at the next progress.
import * as THREE from 'three';
import { COMBAT } from '../config.js';
import { AREAS } from '../game/areaLogic.js';
import { objectiveTargets, objectiveText } from '../game/objectives.js';
import { QUEST_SVG } from './icons.js';

const EDGE_PAD = 34;
const SEEN_MARGIN = 0.92;           // a target inside this fraction of the screen needs no arrow

export function createObjectiveChip(root, { camera }) {
  const el = document.createElement('div');
  el.className = 'objective-chip'; el.hidden = true; el.setAttribute('role', 'status');
  el.innerHTML = `<div class="oc-card"><span class="oc-badge">${QUEST_SVG}</span><span class="oc-text"><span class="oc-section"></span><span class="oc-label"></span></span><span class="oc-count"></span></div><ul class="oc-moves" hidden></ul>`;
  root.appendChild(el);
  const movesEl = el.querySelector('.oc-moves'), card = el.querySelector('.oc-card'), sectionEl = el.querySelector('.oc-section'), labelEl = el.querySelector('.oc-label'), countEl = el.querySelector('.oc-count');
  const arrows = [];
  const v = new THREE.Vector3();
  let lastCount = '', lastKey = '', lastMoves = '';
  function arrow(i) {
    if (arrows[i]) return arrows[i];
    const a = document.createElement('div'); a.className = 'hud-edge hud-edge-objective';
    a.innerHTML = '<i class="he-arrow"></i><span class="he-label"></span>'; root.appendChild(a);
    return (arrows[i] = { el: a, arrow: a.querySelector('.he-arrow'), label: a.querySelector('.he-label') });
  }
  const hideArrows = () => { for (const a of arrows) a.el.classList.remove('show'); };
  return {
    el,
    update(state, { inside = false } = {}) {
      const obj = state?.active && inside ? state.obj : null;
      el.hidden = !obj;
      if (!obj) { hideArrows(); lastKey = ''; return; }
      const area = AREAS[state.areaId] || AREAS.wildroot, text = objectiveText(obj, state.time), key = `${state.areaId}/${state.section}`;
      if (key !== lastKey) { lastKey = key; lastCount = ''; card.classList.remove('enter'); void card.offsetWidth; card.classList.add('enter'); }
      sectionEl.textContent = area.sections[state.section]?.name || area.name;
      labelEl.textContent = text.label;
      if (text.count !== lastCount) { if (lastCount) { card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop'); } lastCount = text.count; countEl.textContent = text.count; }
      card.classList.toggle('done', !!obj.complete);
      const moves = text.items ? text.items.map((m) => `${m.id}:${m.done ? 1 : 0}`).join() : '';
      if (moves !== lastMoves) {
        lastMoves = moves; movesEl.hidden = !text.items; movesEl.replaceChildren();
        for (const m of text.items || []) {
          const li = document.createElement('li'); li.className = m.done ? 'done' : ''; li.dataset.move = m.id;
          const tick = document.createElement('i'); tick.className = 'oc-tick'; const name = document.createElement('span'); name.textContent = m.label; li.append(tick, name); movesEl.appendChild(li);
        }
      }
      // the hint: nothing happened for a while -> point at what is left
      const idle = state.time - obj.since >= COMBAT.objective.hintDelay && !obj.complete;
      const targets = idle ? objectiveTargets(obj, state.enemies) : [];
      if (!targets.length) { hideArrows(); return; }
      camera.updateMatrixWorld();
      const w = window.innerWidth, h = window.innerHeight, oy = area.origin.y;
      targets.forEach((tg, i) => {
        const a = arrow(i);
        v.set(tg.x, oy + 0.8, tg.z).project(camera);
        let dx = v.x * w / 2, dy = -v.y * h / 2;
        if (v.z > 1) { dx = -dx; dy = -dy; }
        const onScreen = v.z <= 1 && Math.abs(v.x) < SEEN_MARGIN && Math.abs(v.y) < SEEN_MARGIN;
        a.el.classList.toggle('show', !onScreen);
        if (onScreen) return;
        const hx = w / 2 - EDGE_PAD, hy = h / 2 - EDGE_PAD, k = Math.min(hx / Math.max(1e-6, Math.abs(dx)), hy / Math.max(1e-6, Math.abs(dy)), 1);
        a.el.style.transform = `translate3d(${(w / 2 + dx * k).toFixed(1)}px, ${(h / 2 + dy * k).toFixed(1)}px, 0)`;
        a.arrow.style.transform = `rotate(${Math.atan2(dy, dx).toFixed(3)}rad)`;
        if (a.label.textContent !== tg.label) a.label.textContent = tg.label;
      });
      for (let i = targets.length; i < arrows.length; i++) arrows[i].el.classList.remove('show');
    },
  };
}
