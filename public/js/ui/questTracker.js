// Quest tracker HUD (PLAN Step 15): a comic-style card in the top-right corner (under the phone / mute buttons) for the shared campfire quest.
//
//   const tracker = createQuestTracker(hudRoot, { quests, inventory, hud, sfx, readyText });   // readyText() -> 'Return to the campfire!' (more than one fire: campfires.returnText())
//   tracker.update(dt)              // every tick: times the "visit the campfire" hint
//   tracker.flashIdle(seconds)      // show the small idle pill ("Feasts: 3 - Visit the campfire for a new quest!") for a while (after a feast)
//
// It shows the quest name, one row per requirement (icon, name, have/need), a green check + little pop when a row is satisfied, and - once everything
// is gathered - glows, bounces and says "Return to the campfire!". Footer: "Feasts: N". Without an active quest it is hidden, except for a small
// hint pill in the first minute of a session (and after a feast). Rows update live from inventory 'change' events.
// On narrow / short screens the card is compact: only the header shows and a tap on it unfolds the rows.
import { QUEST_SVG } from './icons.js';

const HINT_SECONDS = 60;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CHECK_SVG = '<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><path d="M5.6 12.8l4.2 4.2 8.6-9.4" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function createQuestTracker(root, { quests, inventory, hud = null, sfx = null, readyText = () => 'Return to the campfire!' }) {
  const el = document.createElement('div');
  el.className = 'quest-tracker';
  el.hidden = true;
  el.innerHTML = `
    <div class="qt-card">
      <div class="qt-head" role="button" tabindex="-1" aria-label="Quest">
        <span class="qt-badge">${QUEST_SVG}</span>
        <span class="qt-name"></span>
        <span class="qt-count"></span>
        <span class="qt-chev" aria-hidden="true"></span>
      </div>
      <div class="qt-rows"></div>
      <div class="qt-ready">Return to the campfire!</div>
      <div class="qt-foot"><span class="qt-feasts"></span></div>
    </div>
    <div class="qt-idle"><span class="qt-idle-feasts"></span><span class="qt-idle-hint">Visit the campfire for a quest</span></div>`;
  root.appendChild(el);
  const card = el.querySelector('.qt-card');
  const head = el.querySelector('.qt-head');
  const nameEl = el.querySelector('.qt-name');
  const countEl = el.querySelector('.qt-count');
  const rowsEl = el.querySelector('.qt-rows');
  const feastsEl = el.querySelector('.qt-feasts');
  const idleFeasts = el.querySelector('.qt-idle-feasts');
  const idleHint = el.querySelector('.qt-idle-hint');
  const readyEl = el.querySelector('.qt-ready');

  let shownQuest = null;        // template the rows were built for
  let rowEls = new Map();       // item id -> { el, n, done }
  let allDone = false;
  let idleT = HINT_SECONDS;     // seconds the idle pill still shows
  let idleFlash = false;        // the post-feast flavour of the idle pill
  let open = false;

  head.addEventListener('click', () => {
    open = !open;
    el.classList.toggle('open', open);
  });

  const pop = (node, cls = 'pop') => { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); };

  function buildRows(q) {
    rowsEl.innerHTML = '';
    rowEls = new Map();
    for (const r of quests.progress()) {
      const row = document.createElement('div');
      row.className = 'qt-row';
      row.dataset.id = r.id;
      row.innerHTML = `<span class="qt-check">${CHECK_SVG}</span><span class="qt-ic">${r.def ? r.def.icon : ''}</span><span class="qt-label">${esc(r.def ? r.def.name : r.id)}</span><span class="qt-n"></span>`;
      rowsEl.appendChild(row);
      rowEls.set(r.id, { el: row, n: row.querySelector('.qt-n'), done: false });
    }
    nameEl.textContent = q.name;
  }

  /** Sync rows / header with the bag. `announce` = play the little pops and sounds for rows that just became satisfied. */
  function sync(announce) {
    const q = quests.active;
    if (!q) return;
    let doneN = 0, total = 0, newly = 0;
    for (const r of quests.progress()) {
      total++;
      const row = rowEls.get(r.id);
      if (!row) continue;
      row.n.textContent = `${Math.min(r.have, r.need)}/${r.need}`;
      if (r.done) doneN++;
      if (r.done !== row.done) {
        row.done = r.done;
        row.el.classList.toggle('done', r.done);
        if (announce && r.done) { pop(row.el); newly++; }
      }
    }
    countEl.textContent = `${doneN}/${total}`;
    readyEl.textContent = readyText();
    const nowAll = doneN === total;
    if (nowAll !== allDone) {
      allDone = nowAll;
      el.classList.toggle('ready', nowAll);
      if (announce && nowAll) {
        pop(card, 'cheer');
        if (sfx) sfx.play('cooked', { vol: 0.8 });
        if (hud) hud.toast(`Everything gathered! ${readyText()}`, { icon: 'feast', duration: 3200 });
        newly = 0;
      }
    }
    if (announce && newly && sfx) sfx.play('chime', { pitch: 1.3, vol: 0.6 });
  }

  function render(animate = true) {
    const q = quests.active;
    feastsEl.textContent = `Feasts: ${quests.feasts}`;
    idleFeasts.textContent = quests.feasts ? `Feasts: ${quests.feasts}` : '';
    idleFeasts.hidden = !quests.feasts;
    if (!q) {
      if (shownQuest) { shownQuest = null; rowEls = new Map(); allDone = false; el.classList.remove('ready', 'has-quest'); }
      const showIdle = idleT > 0;
      el.hidden = !showIdle;
      el.classList.toggle('idle', showIdle);
      idleHint.textContent = idleFlash ? 'Visit the campfire for a new quest!' : 'Visit the campfire for a quest';
      return;
    }
    el.hidden = false;
    el.classList.remove('idle');
    el.classList.add('has-quest');
    if (shownQuest !== q) {
      shownQuest = q;
      allDone = false;
      el.classList.remove('ready');
      buildRows(q);
      open = false;
      el.classList.remove('open');
      if (animate) pop(card, 'enter');
      sync(false);
      if (quests.satisfied) { allDone = true; el.classList.add('ready'); }
    } else {
      sync(false);
    }
  }

  inventory.on('change', () => { if (quests.active && shownQuest === quests.active) sync(true); });
  quests.on('change', () => render(true));
  render(false);

  return {
    element: el,
    update(dt) {
      if (idleT > 0 && !quests.active) {
        idleT -= dt;
        if (idleT <= 0) { idleT = 0; idleFlash = false; render(false); }
      }
    },
    flashIdle(seconds = 12) {
      idleT = Math.max(idleT, seconds);
      idleFlash = true;
      render(false);
      pop(el.querySelector('.qt-idle'), 'enter');
    },
    summary() {
      return { hidden: el.hidden, idle: el.classList.contains('idle'), name: nameEl.textContent, count: countEl.textContent, ready: allDone, feasts: feastsEl.textContent, rows: [...rowEls].map(([id, r]) => `${id} ${r.n.textContent}${r.done ? ' ok' : ''}`) };
    },
  };
}
