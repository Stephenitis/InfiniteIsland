// Read-only shared Bag panel (31a). Counts mirror inventory events; opening only freezes THIS screen's players.
// Keyboard Tab / B toggles from the game; inside, Tab keeps normal focus navigation. Cancel / backdrop closes.
import { listItems } from '../game/catalog.js';
import { bagGroups } from './inventoryTracking.js';
import { BAG_SVG } from './icons.js';

export function createBagPanel(root, { inventory, islands, collection = null, canOpen = () => true, onOpen = () => {}, onClose = () => {} }) {
  const el = document.createElement('div');
  el.className = 'bag-overlay'; el.hidden = true;
  el.innerHTML = `<section class="bag-panel" role="dialog" aria-modal="true" aria-labelledby="bag-title">
    <header><h2 id="bag-title">${BAG_SVG} Our Bag</h2><button type="button" class="bag-close" aria-label="Close bag">×</button></header>
    <p class="bag-intro">Shared by every islander. Supplies found on several islands are listed once.</p>
    <nav class="bag-tabs"><button type="button" data-tab="bag">Bag</button><button type="button" data-tab="journal">Journal</button></nav>
    <div class="bag-groups"></div><div class="journal-groups" hidden></div><footer>B / Cancel to close · Tab to move between buttons</footer></section>`;
  root.appendChild(el);
  const panel = el.firstElementChild, closeButton = el.querySelector('.bag-close'), groups = el.querySelector('.bag-groups');
  const rows = new Map();
  const journal = el.querySelector('.journal-groups'), intro = el.querySelector('.bag-intro');
  const tabs = [...el.querySelectorAll('.bag-tabs button')];
  let currentTab = 'bag';
  function selectTab(tab) {
    currentTab = tab;
    groups.hidden = tab !== 'bag'; journal.hidden = tab !== 'journal';
    intro.textContent = tab === 'bag' ? 'Shared by every islander. Supplies found on several islands are listed once.' : 'Discover beach glints and rare finds from shaking, digging and breaking rocks. Albums are shared by everyone.';
    for (const b of tabs) { b.classList.toggle('selected', b.dataset.tab === tab); b.setAttribute('aria-pressed', String(b.dataset.tab === tab)); }
    refreshJournal();
  }
  const journalRows = new Map(), journalHeads = new Map();
  if (collection) for (const island of islands) {
    const section = document.createElement('section'); section.className = 'bag-group';
    const head = document.createElement('h3'); journalHeads.set(island.id, head); section.appendChild(head);
    const list = document.createElement('ul'); section.appendChild(list);
    // Definitions are exposed on the log so the panel doesn't duplicate the collection catalog.
    for (const def of collection.definitions.filter((d) => d.island === island.id)) {
      const row = document.createElement('li'); row.dataset.id = def.id;
      row.innerHTML = `<span class="bag-icon"></span><span class="bag-name"></span><span class="journal-source"></span>`;
      journalRows.set(def.id, { row, def }); list.appendChild(row);
    }
    journal.appendChild(section);
  }
  function refreshJournal() {
    if (!collection) return;
    for (const island of islands) { const p = collection.progress(island.id); journalHeads.get(island.id).textContent = `${island.name} · ${p.have}/${p.total}${p.have === p.total ? ' · Complete!' : ''}`; }
    for (const { row, def } of journalRows.values()) {
      const found = collection.has(def.id); row.classList.toggle('empty', !found);
      row.querySelector('.bag-icon').innerHTML = found ? def.icon : '?';
      row.querySelector('.bag-name').textContent = found ? def.name : 'Undiscovered';
      row.querySelector('.journal-source').textContent = def.source === 'beach' ? 'Beach' : ({ shake: 'Shake', dig: 'Dig', break: 'Rock' })[def.source];
    }
  }
  collection?.onChange(refreshJournal);
  for (const b of tabs) b.addEventListener('click', () => selectTab(b.dataset.tab));
  for (const group of bagGroups(listItems(), islands)) {
    const section = document.createElement('section'); section.className = 'bag-group';
    const heading = document.createElement('h3'); heading.textContent = group.name; section.appendChild(heading);
    const list = document.createElement('ul'); section.appendChild(list);
    for (const def of group.items) {
      const row = document.createElement('li'); row.dataset.id = def.id;
      row.innerHTML = `<span class="bag-icon">${def.icon}</span><span class="bag-name"></span><span class="bag-count"></span>`;
      row.querySelector('.bag-name').textContent = def.name;
      rows.set(def.id, row); list.appendChild(row);
    }
    groups.appendChild(section);
  }
  let open = false, previousFocus = null;
  function refresh() {
    for (const [id, row] of rows) {
      const n = inventory.count(id);
      row.classList.toggle('empty', n <= 0);
      row.querySelector('.bag-count').textContent = `×${n}`;
    }
  }
  inventory.on('change', refresh);
  function close() {
    if (!open) return;
    open = false; el.hidden = true; root.classList.remove('bag-open');
    onClose();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }
  function show() {
    if (open || !canOpen()) return false;
    previousFocus = document.activeElement;
    refresh(); selectTab(currentTab); open = true; el.hidden = false; root.classList.add('bag-open');
    onOpen(); closeButton.focus({ preventScroll: true }); return true;
  }
  closeButton.addEventListener('click', close);
  el.addEventListener('pointerdown', (e) => { if (e.target === el) close(); });
  el.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') {
      const buttons = [closeButton, ...tabs], i = buttons.indexOf(document.activeElement);
      e.preventDefault(); buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && ['KeyB', 'Escape', 'KeyQ', 'Backspace'].includes(e.code)) {
      e.preventDefault(); if (!e.repeat) close();
    }
    e.stopPropagation();
  });
  return { open: show, close, journal() { selectTab('journal'); return show(); }, toggle: () => open ? close() : show(), get isOpen() { return open; }, element: el, panel };
}
