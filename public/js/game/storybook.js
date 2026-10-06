// Storybook mode (Steps 48-49): the book stands on Storybook Cay open a PAGE, and the whole party steps into it together. This module is the host-authoritative
// `storybook` sync domain, the whole-party transition (the page fold), the side-view mode (the follow camera is swapped for a narrow-FOV side camera, the islands and
// the sea are hidden, every player becomes a platformer body: game/pagePlayers.js) and everything the party does on a page: collecting berries and the five letters,
// lighting campfires, the hearts HUD, clearing the page (the tally card) and the saved progress. It follows Wildroot Hollow's pattern (game/dungeon.js): rules are PURE in
// game/storybookLogic.js + game/platformerLogic.js + game/pageFormat.js (Node-tested), a page's data is game/pages/*.js, its look is world/pageVisuals.js.
//
//   const storybook = createStorybook({ scene, camera, followCam, players, avatars, table, sync, hud, hudRoot, dialog, particles, sfx, cinematic, world, water, stands, items })
//   storybook.updatePlayers(dt, t)   once per tick BEFORE players.update: the platformer bodies move the page's players
//   storybook.update(dt, t)          once per tick AFTER players.update: the fold, entering / leaving, the HUD, the clear timer
//   storybook.afterAvatars()         once per tick after avatars.update (remote players' floor probe / puffs)
//   storybook.updateCamera(dt)       replaces followCam.update while pageMode: frames every player of the page (x and y, with a vertical dead zone), clamped to the page
//   storybook.preInput()             (kept for main.js: the page reads the players' input itself now)
//   storybook.pageMode               this screen currently shows a page          storybook.state   { active, page, serial } (shared, session-only)
//   storybook.run / storybook.progress    the party's collected items (session-only) / the saved progress (host-saved, synced)
//   storybook.contains(p)            the player stands in a page                 storybook.allowsTarget(it)   bookstand only on the island, pageexit only in a page
//   storybook.enter(pageId) / exit() debug: host path, no distance check        storybook.summary() / storybook.stands
//   storybook.debug                  { page, bodies, collect(kind, id), lightAll(), clear(), teleport(player, tx, ty), validate() }
//   storybook.promptFor(p)           the prompt bubble a page player should see ({ target, text }: "Take axe", "Chop", "Grab (Cancel)" ...) or null
//   storybook.dropPageTool(p)        Cancel held 2 s inside a page: the page tool goes back to its stand (a real tool stays in hand)    storybook.pw   the page world (game/pageWorld.js)
//   Step 50 debug: debug.give(player, tool) / enemies() / objects() / tiles() / spawn(kind, tx, ty) / killAll()
//
// Domain 'storybook' (host-owned; the open page and the run are SESSION-ONLY, the progress is saved: infinite-island.storybook.v1):
//   state { active, page, serial } + run { berries: [idx], letters: ['F'..], fires: [idx], cleared } + progress { v, pages: { id: { cleared, letters, bestBerries } } }
//   requests enter { page } / exit {} (as in Step 48), collect { kind: 'berry' | 'letter' | 'fire' | 'flower' | 'goal', id } (the actor is within PLATFORMER.collectReach of the item and it is not
//   taken yet: validateCollect), finish {} (anybody in the cleared page: skip the tally and go back to the Cay).
//   Step 50: the world of the page (tool gates, trees, enemies, throwables, page tools: game/pageWorld.js) is part of the snapshot (`world`) and the hash, its decisions are events
//   w { recs, actor, refill } (applied identically everywhere) and m (the 10 Hz motion of enemies and objects); its requests are take | untool | hit | soil | pound | stomp | grab | throw | drop | seedhit. The host serialises them and emits event state { state, run }
//   (enter / exit: the run starts fresh) or item { kind, id, actor, run, refill, progress? } (a replica hides / lights things ONLY from this event, never optimistically).
//   Snapshot = { ...state, run, progress }; hashView covers all three. Letters and the best berry count are saved only when the page is CLEARED (the goal touched).
//   EVERY screen reacts to the state alone: its local players that are not where the state says they should be (in the page when active, on the Cay when not) are moved by
//   a page fold (cover -> teleport + camera switch + hide / show the world -> reveal). So a screen that joins mid-page, or a player who joins on a screen, simply follows.
import * as THREE from 'three';
import {
  PAGE, STAND_REACH, LETTERS, setPageHalfLength, pageHalfLength, inPageArea, pageSpawn, pageExit, standFront, freshState, normaliseState, hashView, validateEnter, validateExit, applyEnter, applyExit,
  freshRun, normaliseRun, runView, validateCollect, applyCollect, pageToWorld, STORAGE_KEY, freshProgress, normaliseProgress, mergeClear, progressLine, progressView,
} from './storybookLogic.js';
import { PAGES, getPage } from './pages/index.js';
import { validatePage } from './pageFormat.js';
import { createPagePlayers } from './pagePlayers.js';
import { createPageWorld } from './pageWorld.js';
import { createPageTools } from './pageTools.js';
import { createPageActors } from '../world/pageActors.js';
import { storyRuntime } from '../world/islands/storyWorld.js';
import { createPageVisuals } from '../world/pageVisuals.js';
import { createPageFold } from '../ui/pageFold.js';
import { addInteractable } from '../world/interactables.js';
import { addCollider } from '../world/colliders.js';
import { BOOK_SVG, BACK_SVG, HEART_SVG, ICONS, FLOWER_CARD_SVG } from '../ui/icons.js';
import { NEW_GAME, loadSave, writeSave, clearSave } from './save.js';
import { PLATFORMER, PAGE_LIGHT } from '../config.js';

const SIDE = { fov: 30, offset: new THREE.Vector3(0, 2.8, 26), minZoom: 1.0, maxZoom: 3, margin: 5, lookAhead: 2.4, dzUp: 1.4, dzDown: 2.2, floorFrac: 0.25, yMargin: 3 };
const REASONS = {
  far: 'Stand a little closer to the book stand!',
  busy: 'The book is busy right now. Try again in a moment.',
  idle: 'Nothing to close right now.',
  outside: 'You are not inside a page.',
};

export function createStorybook({ scene, camera, followCam, players, avatars, table, sync, hud, hudRoot, dialog, particles, sfx, cinematic, world, water, stands = [], items }) {
  let state = freshState();
  let run = freshRun();
  let progress = freshProgress();
  let pageMode = false;
  let clearT = 0;                                              // host: seconds since the page was cleared (the tally card's hold)
  let tallyAt = -1;                                            // this screen: sim time the tally card appeared
  let simT = 0;
  let lastPageId = null;                                       // the page the party stepped into last: they come back out at ITS stand
  const visuals = createPageVisuals(scene);
  const actors = createPageActors(scene);
  const fold = createPageFold(hudRoot, { sfx });
  const baseOffset = followCam.offset.clone();
  const focus = new THREE.Vector3();
  const exits = new Map();                                     // page id -> its back-cover interactable

  if (NEW_GAME) clearSave(STORAGE_KEY);
  else progress = normaliseProgress(loadSave(STORAGE_KEY), PAGES);                       // (replicas never read it: game/save.js)
  const saveProgress = () => writeSave(STORAGE_KEY, progress);
  const curPage = () => (state.active ? getPage(state.page) : null);

  // ---- the back-cover ribbons: one interactable (and a collider so nobody walks through the pole) per page, registered once, only offered while that page is open
  for (const page of PAGES.values()) {
    const at = pageExit(page);
    addCollider({ x: at.x, z: PAGE.z - 0.85, r: 0.4, owner: page });
    exits.set(page.id, addInteractable({
      type: 'pageexit', object: null, position: new THREE.Vector3(at.x, PAGE.y, at.z), radius: 1.1, prompt: 'Close the book',
      onInteract: (_it, p) => openExitMenu(p, page),
    }));
  }

  // ---- the world of the open page (Step 50): tool gates, enemies, throwables, page tools
  const pw = createPageWorld({
    sync, players, avatars, items, particles, sfx, hud, visuals, actors, getPage: curPage, getRun: () => run,
    bodyOf: (p) => (pagePlayers ? pagePlayers.bodyOf(p) : null), lightFire: hostLightFire, refillAll: () => doRefill(),
  });

  // ---- requests (any local player; the host decides)
  function request(kind, data, p, quiet = false) {
    if (!p) return Promise.resolve(false);
    return Promise.resolve(sync.request('storybook', kind, data, sync.actorFor(p))).then((r) => {
      if (!r.ok && !quiet) hud.toast(REASONS[r.reason] || 'The book will not open right now.', { icon: 'sparkle', duration: 2800 });
      return r.ok;
    });
  }

  const lettersText = (page) => progressLine(progress, page).letters.map((l) => (l.found ? l.ch : '_')).join(' ');
  const flowersText = (page) => { const f = progressLine(progress, page).flowers; return f.length ? `   Flowers ${f.filter((x) => x.found).length}/${f.length}` : ''; };
  function openStandMenu(stand, p) {
    if (state.active || fold.running || dialog.isOpen || cinematic.busy) return;
    const page = getPage(stand.page);
    if (!page) return;
    const pl = progressLine(progress, page);
    dialog.open({
      owner: p, name: 'Storybook', text: `A page of the great book lies open: ${page.title ? page.title + ' - ' : ''}${page.name}. ${page.blurb} Everyone steps in together.`,
      choices: [
        { label: `${page.name}   ${lettersText(page)}${flowersText(page)}${pl.cleared ? '   Cleared!' : ''}`, icon: BOOK_SVG, onSelect: () => { dialog.close(); request('enter', { page: page.id }, p); } },
        { label: 'Not yet', icon: BACK_SVG, onSelect: () => dialog.close() },
      ],
      onCancel: () => dialog.close(),
    });
  }
  storyRuntime.onStand = openStandMenu;

  function openExitMenu(p, page) {
    if (!state.active || dialog.isOpen || fold.running) return;
    dialog.open({
      owner: p, name: page.name, text: 'Close the book? Everyone goes back to the Cay together. (Letters only count once the page is cleared.)',
      choices: [
        { label: 'Take everyone back to the Cay', icon: BACK_SVG, onSelect: () => { dialog.close(); request('exit', {}, p); } },
        { label: 'Keep reading', icon: BOOK_SVG, onSelect: () => dialog.close() },
      ],
      onCancel: () => dialog.close(),
    });
  }

  // ---- the HUD: the five letters + berries strip, per-player hearts, the tally card
  const hudEl = document.createElement('div');
  hudEl.className = 'page-hud'; hudEl.hidden = true;
  hudEl.innerHTML = `<div class="ph-strip"><div class="ph-letters">${LETTERS.map((c) => `<span class="ph-l" data-ch="${c}">${c}</span>`).join('')}</div>
    <div class="ph-flowers" hidden></div>
    <div class="ph-berries"><span class="ph-ico">${ICONS.berry}</span><b class="ph-count">0</b><span class="ph-total"></span></div></div><div class="ph-hearts"></div>`;
  hudRoot.appendChild(hudEl);
  const tallyEl = document.createElement('div');
  tallyEl.className = 'page-tally'; tallyEl.hidden = true;
  tallyEl.innerHTML = '<div class="pt-card"><div class="pt-stamp">Page cleared!</div><h2 class="pt-name"></h2><div class="pt-berries"></div><div class="pt-letters"></div><div class="pt-flowers"></div><div class="pt-hint">Jump to turn the page</div></div>';
  hudRoot.appendChild(tallyEl);
  let hudKey = '';
  function refreshHud() {
    const page = curPage();
    hudEl.hidden = !(pageMode && page);
    if (hudEl.hidden) { tallyEl.hidden = true; return; }
    const hearts = [];
    for (const p of players.list) { const l = pagePlayers.lifeOf(p); if (l) hearts.push(`${p.index}:${l.hearts}:${l.state}:${p.colors.ui}:${toolKind(p) || ''}`); }
    const bonus = pw.bonus, fl = (run.flowers || []).join('.');
    const key = `${state.serial}|${run.letters.join('')}|${run.berries.length}|${bonus}|${fl}|${run.cleared}|${hearts.join(',')}`;
    if (key === hudKey) return;
    hudKey = key;
    for (const el of hudEl.querySelectorAll('.ph-l')) el.classList.toggle('on', run.letters.includes(el.dataset.ch));
    hudEl.querySelector('.ph-count').textContent = String(run.berries.length + bonus);
    hudEl.querySelector('.ph-total').textContent = bonus ? `/ ${page.berries.length} (+${bonus})` : `/ ${page.berries.length}`;
    const flEl = hudEl.querySelector('.ph-flowers');
    flEl.hidden = !page.flowers.length;
    if (page.flowers.length) flEl.innerHTML = page.flowers.map((f) => `<span class="ph-f${(run.flowers || []).includes(f.id) ? ' on' : ''}">${FLOWER_CARD_SVG}</span>`).join('');
    hudEl.querySelector('.ph-hearts').innerHTML = players.list.filter((p) => pagePlayers.lifeOf(p)).map((p) => {
      const l = pagePlayers.lifeOf(p), tk = toolKind(p);
      let hs = '';
      for (let i = 0; i < PLATFORMER.hearts; i++) hs += `<span class="ph-h${i < l.hearts ? '' : ' off'}">${HEART_SVG}</span>`;
      return `<div class="ph-p${l.state === 'puff' ? ' puff' : ''}" style="--pc:${p.colors.ui}"><i class="ph-dot">P${p.index + 1}</i>${hs}${tk && ICONS['tool-' + tk] ? `<span class="ph-tool${items.pageToolOf(p) ? ' page' : ''}" title="${tk}">${ICONS['tool-' + tk]}</span>` : ''}</div>`;
    }).join('');
    if (run.cleared) {
      if (tallyEl.hidden) tallyAt = simT;
      tallyEl.hidden = false;
      tallyEl.querySelector('.pt-name').textContent = page.name;
      tallyEl.querySelector('.pt-berries').innerHTML = `<span class="ph-ico">${ICONS.berry}</span> ${run.berries.length} / ${page.berries.length} berries${bonus ? ` <small>+${bonus} bonus</small>` : ''}`;
      tallyEl.querySelector('.pt-letters').innerHTML = LETTERS.map((c) => `<span class="ph-l${run.letters.includes(c) ? ' on' : ''}" data-ch="${c}">${c}</span>`).join('');
      tallyEl.querySelector('.pt-flowers').innerHTML = page.flowers.map((f) => `<span class="ph-f${(run.flowers || []).includes(f.id) ? ' on' : ''}">${FLOWER_CARD_SVG}</span>`).join('');
    } else tallyEl.hidden = true;
  }

  const toolKind = (p) => items.pageToolOf(p) || (items.heldBy(p) ? items.heldBy(p).kind : null);

  // ---- state
  function toastFor(prev) {
    if (state.active && !prev.active) hud.toast(`Turning the page: ${getPage(state.page).name}`, { icon: 'book', duration: 2600 });
    else if (!state.active && prev.active) hud.toast('The book closes. Back on the Cay!', { icon: 'book', duration: 2600 });
  }
  function apply(next, announce = true, nextRun = null) {
    const prev = state;
    state = next;
    const page = curPage();
    if (page) setPageHalfLength(page.length / 2);
    const fresh = prev.serial !== state.serial || prev.page !== state.page;
    if (state.active) lastPageId = state.page;
    if (nextRun) run = normaliseRun(nextRun, page);
    else if (fresh) run = freshRun();
    if (state.active && page && (fresh || !pw.world)) pw.reset(page);                  // a world for the page (Step 50): pristine tiles, its enemies and throwables
    if (announce && (prev.active !== state.active || prev.serial !== state.serial)) toastFor(prev);
    if (pageMode && page) visuals.setRun(run);
    if (!state.active) { run = freshRun(); clearT = 0; tallyAt = -1; pw.world && pw.clear(); }
    reconcile();
  }
  function hostSet(next) {                                    // the host decides: apply here and tell every screen
    run = freshRun(); clearT = 0;
    apply(next, true, run);
    sync.emit('storybook', 'state', { state: { ...state }, run: runView(run) });
  }
  function doRefill(announce = true) {
    pagePlayers.refillAll();
    for (const p of players.list) if (pagePlayers.lifeOf(p)) particles.burst('heart', p.position, { count: 4, radius: 0.5 });
    if (announce) hud.toast('100 berries! Everybody\'s hearts are full.', { icon: 'sparkle', duration: 2600 });
    sfx.play('cooked', { vol: 0.6 });
  }
  /** HOST: a log landed in an unlit campfire (or any host-side reason to light one): the same event as walking up to it. */
  function hostLightFire(idx, actorRef) {
    const page = curPage();
    if (!sync.isHost || !state.active || !page || !Number.isInteger(idx) || idx < 0 || idx >= page.campfires.length || run.fires.includes(idx)) return;
    const r = applyCollect(run, page, 'fire', idx, pw.bonus);
    run = r.run;
    const ev = { kind: 'fire', id: idx, actor: actorRef || { screen: 'host', index: 0 }, run: runView(run), refill: false };
    applyItem(ev);
    sync.emit('storybook', 'item', ev);
  }
  function itemFx(kind, id, actorIdx, refill) {
    const page = curPage(); if (!page || !pageMode) return;
    const pos = visuals.collect(kind, id);
    if (!pos) return;
    const at = new THREE.Vector3(pos.x, pos.y, pos.z + 0.3);
    if (kind === 'berry') { particles.burst('sparkle', at, { count: 4, radius: 0.3 }); sfx.play('collect', { pitch: 1 + (run.berries.length % 8) * 0.06, vol: 0.5 }); }
    else if (kind === 'letter') {
      particles.burst('sparkle', at, { count: 16, radius: 0.9 }); particles.burst('confetti', at, { count: 18, radius: 0.6 });
      sfx.play('equip'); sfx.play('chime', { vol: 0.5 });
      hud.toast(`Letter ${id}! ${run.letters.length} of ${LETTERS.length}`, { icon: 'sparkle', duration: 2400 });
    } else if (kind === 'fire') {
      particles.burst('sparkle', at, { count: 10, radius: 0.6 }); particles.burst('smoke', at, { count: 2, radius: 0.3 });
      sfx.play('flare'); hud.toast('Campfire lit! You will come back here.', { icon: 'flame', duration: 2400 });
    } else if (kind === 'flower') {
      particles.burst('sparkle', at, { count: 14, radius: 0.8 }); particles.burst('petal', at, { count: 8, radius: 0.7 });
      sfx.play('equip'); sfx.play('chime', { vol: 0.5 });
      hud.toast(`Pressed flower ${(run.flowers || []).length} of ${page.flowers.length}!`, { icon: 'sparkle', duration: 2400 });
    } else if (kind === 'goal') {
      for (let k = 0; k < 3; k++) particles.burst('confetti', new THREE.Vector3(at.x + (k - 1) * 1.6, at.y + 2, at.z), { count: 40, radius: 1.4 });
      sfx.play('jingle'); hud.toast('Page cleared!', { icon: 'sparkle', duration: 3000 });
    }
    if (refill) doRefill();
  }
  function applyItem(d) {
    const page = curPage(); if (!page || !d) return;
    if (d.progress) progress = normaliseProgress(d.progress, PAGES);
    run = normaliseRun(d.run, page);
    itemFx(d.kind, d.kind === 'letter' || d.kind === 'goal' ? d.id : d.id | 0, d.actor, !!d.refill);
  }
  sync.register('storybook', {
    screenLeft: (screenId) => { if (sync.isHost) pw.releaseScreen(screenId); },
    snapshot: () => ({ ...state, run: runView(run), progress, world: pw.snapshot() }),
    hashView: () => ({ ...hashView(state), run: runView(run), progress: progressView(progress), world: pw.hashView() }),
    applySnapshot: (s) => {
      const next = normaliseState(s, PAGES);
      if (s && s.progress) progress = normaliseProgress(s.progress, PAGES);
      apply(next, false, s && s.run ? s.run : null);
      if (s && s.world && pw.world) { pw.loadSnapshot(s.world); visuals.hidden.clear(); visuals.refresh(Array.from({ length: Math.ceil(curPage().W / 40) }, (_, i) => [i * 40]), pw.world.hits); }
    },
    applyEvent(kind, d) {
      if (kind === 'state') apply(normaliseState(d && d.state, PAGES), true, d && d.run);
      else if (kind === 'item') applyItem(d);
      else if (kind === 'w' || kind === 'm') pw.applyEvent(kind, d);
    },
    handleRequest(kind, d, actor, screen) {
      if (!actor || table.get(actor.index)?.screen !== screen || table.get(actor.index)?.away || (cinematic.busy && kind !== 'collect')) return { reject: 'busy' };
      if (kind === 'enter') {
        const v = validateEnter({ state, pageId: d && d.page, pages: PAGES, actor, stands });
        if (!v.ok) return { reject: v.reason };
        hostSet(applyEnter(state, d.page));
        return true;
      }
      if (kind === 'exit') {
        const v = validateExit({ state, actor, pages: PAGES });
        if (!v.ok) return { reject: v.reason };
        hostSet(applyExit(state));
        return true;
      }
      if (kind === 'collect') {
        const page = curPage();
        const v = validateCollect({ state, run, page, kind: d && d.kind, id: d && d.id, actor, dug: pw.world ? pw.world.dug : [] });
        if (!v.ok) return { reject: v.reason };
        const r = applyCollect(run, page, d.kind, d.id, pw.bonus);
        run = r.run;
        const ev = { kind: d.kind, id: d.id, actor: { screen: actor.screen, index: actor.index }, run: runView(run), refill: r.refill };
        if (d.kind === 'goal') { progress = mergeClear(progress, page, run); saveProgress(); ev.progress = progress; clearT = 0; }
        applyItem(ev);
        sync.emit('storybook', 'item', ev);
        return true;
      }
      if (kind === 'finish') {
        if (!state.active || !run.cleared || !inPageArea(actor.pos.x, actor.pos.z)) return { reject: 'idle' };
        hostSet(applyExit(state));
        return true;
      }
      if (screen === 'host' && kind === 'debugTool') { const key = d && d.key, tool = d && d.tool; if (!pw.world || typeof key !== 'string') return { reject: 'closed' }; pw.debugRecs([{ t: 'tool', key, tool: tool || null }]); return true; }
      if (screen === 'host' && kind === 'debugWorld') { if (!pw.world || !Array.isArray(d && d.recs)) return { reject: 'closed' }; pw.debugRecs(d.recs); return true; }
      if (pw.handles(kind)) return pw.handleRequest(kind, d, actor);
      if (screen === 'host' && kind === 'debugEnter' && !state.active && getPage(d && d.page)) { hostSet(applyEnter(state, d.page)); return true; }   // (debug: no distance rule)
      if (screen === 'host' && kind === 'debugExit' && state.active) { hostSet(applyExit(state)); return true; }
      return { reject: 'unknown' };
    },
  });

  // ---- players in the page
  const pagePlayers = createPagePlayers({
    players, avatars, visuals, particles, sfx, hud, scene,
    getPage: curPage, getRun: () => run, getGrid: () => (pw.world ? pw.world.grid : null), getWorld: () => pw.world, inBook: (p) => inPageArea(p.position.x, p.position.z),
    onClaim: (kind, id, p) => {
      if (fold.running) return;
      Promise.resolve(sync.request('storybook', 'collect', { kind, id }, sync.actorFor(p))).then(() => {});
    },
    makeTools: (hurtFrom) => createPageTools({
      getPage: curPage, getWorld: () => pw.world, getRun: () => run, items, particles, sfx, hud, request, keyOf: (p) => pw.keyOf(p), toolOf: (key) => pw.toolOf(key), hurt: hurtFrom,
    }),
    dropHeld: (p) => { if (pw.holdOf(pw.keyOf(p))) request('drop', {}, p, true); },
  });

  // a player of this screen leaves: what they carry is put down and their page tool goes back (the host does it itself, a replica asks)
  players.on('leave', (p) => {
    if (!pw.world) return;
    const key = pw.keyOf(p);
    if (sync.isHost) { pw.release(key); if (pw.world.tools[key]) pw.debugRecs([{ t: 'tool', key, tool: null }]); }
    else { if (pw.holdOf(key)) request('drop', {}, p, true); if (pw.world.tools[key]) request('untool', {}, p, true); }
  });

  // ---- the side camera
  let camY = null, look = 0;
  function setMode(on) {
    pageMode = on;
    world.root.visible = !on;                                  // the islands, their props and the far versions
    water.group.visible = !on;                                 // the sea has no business in a book
    camY = null; look = 0;
    if (on) {
      visuals.open(getPage(state.page), pw.world ? pw.world.grid : undefined);
      actors.open(getPage(state.page));
      pw.syncTools();
      visuals.setRun(run);
      followCam.offset.copy(SIDE.offset);
      camera.fov = SIDE.fov; camera.updateProjectionMatrix();
      world.setViewHint(stands[0] ? { x: stands[0].x, z: stands[0].z } : null);   // the Cay stays full detail behind the scenes: no pop-in on the way back
    } else {
      visuals.close();
      actors.close();
      pw.clearTools();
      followCam.offset.copy(baseOffset);
      followCam.resize(window.innerWidth, window.innerHeight);   // restores the island FOV / aspect
      world.setViewHint(null);
    }
    followCam.snap();
    hudRoot.classList.toggle('storybook-active', on);
    hudKey = '';
  }

  // ---- moving the party (every screen, for ITS players)
  const localPlayers = () => players.list.filter((p) => !p.away && !p.leaving);
  const inBook = (p) => inPageArea(p.position.x, p.position.z);
  function move(p, at, entering) {
    dialog.close(); p._swingT = -1; if (p.setPose) p.setPose(null);
    particles.burst('puff', p.position, { count: 8, radius: 0.6 });
    if (!entering) pagePlayers.release(p);
    p.teleport(at.x, at.z);
    if (entering) { setPageHalfLength(curPage().length / 2); pagePlayers.spawn(p); }
    particles.burst('sparkle', p.position, { count: 10, radius: 0.7 });
  }
  function transition() {
    const want = state.active;
    const page = want ? getPage(state.page) : null;
    const front = stands.find((s) => s.page === lastPageId) || stands[0] || null;
    if (want !== pageMode && want) setMode(true);                 // (the page is built before the party spawns on its campfire)
    for (const p of localPlayers()) {
      if (want && !inBook(p)) move(p, pageSpawn(page, p.index), true);
      else if (!want && inBook(p) && front) move(p, standFront(front, p.index), false);
    }
    if (want !== pageMode) setMode(want);
    players._updateFocus();
    followCam.snap();
  }
  function reconcile() {
    if (fold.running) return;                                   // (re-checked when it ends)
    const want = state.active;
    const wrong = localPlayers().some((p) => inBook(p) !== want);
    if (!wrong && pageMode === want) return;
    fold.start(() => transition(), () => reconcile());
  }

  // ---- per frame
  const _xs = [], _ys = [];
  function updateCamera(dt) {
    const page = curPage();
    if (camera.fov !== SIDE.fov) { camera.fov = SIDE.fov; camera.updateProjectionMatrix(); }
    const dist0 = SIDE.offset.length() * followCam.framingZoom;
    const aspect = camera.aspect > 0 ? camera.aspect : 16 / 9;                                      // (a page loaded in a hidden 0 x 0 window has no aspect yet)
    const halfV1 = Math.tan(THREE.MathUtils.degToRad(SIDE.fov / 2)) * dist0, half1 = halfV1 * aspect;   // visible half height / width on the lane at zoom 1
    // everyone of the page frames the camera while they fit at the widest zoom; when somebody is too far away (a phone-sized screen, a far friend) this screen keeps ITS OWN players in view
    let vx = 0, n = 0, lo, hi, loY, hiY;
    for (const pass of [0, 1]) {
      _xs.length = 0; _ys.length = 0; vx = 0; n = 0;
      for (const p of players.list) if (!p.away && inBook(p)) { _xs.push(p.position.x); _ys.push(p.position.y); vx += p.velocity.x; n++; }
      if (pass === 0) for (const a of avatars.list) if (a.root.visible && inBook(a) && !a._puff) { _xs.push(a.position.x); _ys.push(a.position.y); vx += a.velocity.x; n++; }
      if (!_xs.length) { _xs.push(PAGE.x); _ys.push(PAGE.y); }
      lo = Math.min(..._xs); hi = Math.max(..._xs); loY = Math.min(..._ys); hiY = Math.max(..._ys);
      if (((hi - lo) / 2 + SIDE.margin) / half1 <= SIDE.maxZoom) break;
    }
    const minZoom = Math.max(SIDE.minZoom, Math.min(2.2, 0.9 / aspect));                         // a tall phone screen sees less sideways: start further out
    const zoom = Math.min(SIDE.maxZoom, Math.max(minZoom, ((hi - lo) / 2 + SIDE.margin) / half1, ((hiY - loY) / 2 + 2.6) / halfV1));
    const vis = half1 * zoom, visV = halfV1 * zoom, reach = pageHalfLength() + 1.5;                  // the page's two edges are never shown beyond
    look += (THREE.MathUtils.clamp(n ? vx / n / 8 : 0, -1, 1) * SIDE.lookAhead - look) * (1 - Math.exp(-2.2 * dt));
    const mid = (lo + hi) / 2 - PAGE.x + look;
    // vertical: a dead zone, so small hops never bob the camera; never below the page's floor band nor above its top
    const target = (loY + hiY) / 2 + 1.5, floorY = PAGE.y + visV * (1 - 2 * (aspect < 0.8 ? 0.34 : SIDE.floorFrac));   // the floor sits a quarter up the screen (a third on a tall phone: the touch buttons)
    if (camY === null) camY = Math.max(floorY, target);
    if (target > camY + SIDE.dzUp) camY = target - SIDE.dzUp; else if (target < camY - SIDE.dzDown) camY = target + SIDE.dzDown;
    camY = Math.max(camY, floorY);
    const yLo = PAGE.y - 5 + visV, yHi = page ? PAGE.y - page.floorRows + page.H + SIDE.yMargin - visV : floorY;
    const cy = yLo > yHi ? (yLo + yHi) / 2 : Math.max(yLo, Math.min(yHi, camY));
    const aim = followCam.touch ? (aspect < 0.8 ? 2.1 : 0.45) : 0;                                 // (FollowCamera aims a little above the focus for touch controls: undo it here)
    focus.set(PAGE.x + (vis >= reach ? 0 : Math.max(-reach + vis, Math.min(reach - vis, mid))), cy - 0.9 - aim, PAGE.z);
    followCam.update(dt, focus, zoom);
  }

  // clearing: the host waits out the tally card, then closes the book for everybody; any player may skip it
  function clearTick(dt) {
    if (!run.cleared || !state.active) return;
    if (sync.isHost) { clearT += dt; if (clearT >= PLATFORMER.clearHold && !fold.running) hostSet(applyExit(state)); }
    if (tallyAt >= 0 && simT - tallyAt > 0.9 && !fold.running) {
      for (const p of players.list) if (!p.away && p.actions && (p.actions.interactPressed || p.actions.jumpPressed) && inBook(p)) { request('finish', {}, p, true); tallyAt = simT + 3; break; }
    }
  }

  // ---- page lighting: lift the clock's light so a night page stays readable (PAGE_LIGHT in config); called after sky.setTimeOfDay each tick
  const _noonLight = new THREE.Color('#fff1d6'), _noonSky = new THREE.Color('#d6efff'), _noonGround = new THREE.Color('#bff0a0');
  function lightPage(sky, renderer, clock) {
    if (!pageMode) return;
    const k = PAGE_LIGHT.colourMix * Math.min(1, Math.max(0, clock.nightness));
    sky.sun.color.lerp(_noonLight, k);
    sky.hemi.color.lerp(_noonSky, k);
    sky.hemi.groundColor.lerp(_noonGround, k);
    sky.sun.intensity = Math.max(sky.sun.intensity, PAGE_LIGHT.lightMin);
    sky.hemi.intensity = Math.max(sky.hemi.intensity, PAGE_LIGHT.hemiMin);
    renderer.toneMappingExposure = Math.max(renderer.toneMappingExposure, PAGE_LIGHT.exposureMin);
  }

  const api = {
    lightPage,
    get state() { return state; },
    get run() { return run; },
    get progress() { return progress; },
    get pageMode() { return pageMode; },
    fold, visuals, stands, exits, pagePlayers,
    contains: (p) => state.active && inBook(p),
    allowsTarget: (it) => (it.type === 'pageexit' ? state.active : it.type === 'bookstand' ? !state.active && !fold.running : true),
    preInput() { /* (Step 48 trimmed the stick to left / right here; the platformer reads move.x and move.z itself) */ },
    updatePlayers(dt, t = 0) { simT = t; if (pageMode && state.active && !fold.running) pagePlayers.update(dt, t); },
    afterAvatars() { if (pageMode) pagePlayers.afterAvatars(); },
    update(dt, t = 0) {
      simT = t;
      fold.update(dt);
      if (!fold.running) reconcile();
      if (pageMode) {
        visuals.update(t);
        pw.update(dt, t);
        clearTick(dt);
        // lit campfires smoulder (a puff of smoke every so often)
        if (Math.floor(t / 1.6) !== Math.floor((t - dt) / 1.6) && curPage()) for (const i of run.fires) { const f = visuals.itemPos('fire', i); if (f && Math.abs(f.x - focus.x) < 22) particles.burst('smoke', new THREE.Vector3(f.x, f.y + 0.7, f.z), { count: 1, radius: 0.1 }); }
      }
      refreshHud();
    },
    updateCamera, pw, actors,
    promptFor(p) { return pageMode && state.active ? pagePlayers.tools.promptFor(p, pagePlayers.states.get(p)) : null; },
    dropPageTool(p) { if (items.pageToolOf(p)) request('untool', {}, p, true); },
    enter(pageId = 'orchard-hop') { return sync.request('storybook', 'debugEnter', { page: pageId }, sync.isHost ? { screen: 'host', index: 0, pos: { x: 0, y: 0, z: 0 } } : null); },
    exit() { return sync.request('storybook', 'debugExit', {}, sync.isHost ? { screen: 'host', index: 0, pos: { x: 0, y: 0, z: 0 } } : null); },
    summary() {
      return {
        state: { ...state }, mode: pageMode ? 'page' : 'island', fold: fold.summary(), standReach: STAND_REACH, run: runView(run), progress,
        players: localPlayers().map((p) => ({ slot: p.index, inBook: inBook(p), x: +p.position.x.toFixed(2), y: +p.position.y.toFixed(2), z: +p.position.z.toFixed(2) })),
        bodies: pagePlayers.summary(),
        stands: stands.map((s) => ({ id: s.id, page: s.page, x: +s.x.toFixed(2), z: +s.z.toFixed(2) })),
        visuals: visuals.summary(), actors: actors.summary(),
        world: pw.world ? { bonus: pw.world.bonus, tools: { ...pw.world.tools }, tiles: Object.keys(pw.world.cells).length, enemies: pw.world.enemies.filter((e) => e.st !== 'dead').length, objects: pw.world.objects.filter((o) => o.st !== 'gone').length } : null,
      };
    },
  };
  api.debug = {
    get page() { const p = curPage() || getPage('orchard-hop'); return p && { id: p.id, name: p.name, W: p.W, H: p.H, berries: p.berries.length, letters: p.letters.map((l) => l.ch + '@' + l.x.toFixed(1) + ',' + l.y.toFixed(1)), campfires: p.campfires.map((f) => `${f.index}@${f.x.toFixed(1)}`), start: p.start, goal: p.goal }; },
    get bodies() { return pagePlayers.summary(); },
    /** Collect an item through the real host path as the first local player standing in the page (skips the distance rule): collect('berry', 3) / ('letter', 'F') / ('fire', 1) / ('flower', 0) / ('goal'). */
    collect(kind, id = 0) {
      const page = curPage(); if (!page || !sync.isHost) return { ok: false, reason: 'not host / closed' };
      const p = localPlayers().find(inBook); if (!p) return { ok: false, reason: 'no player' };
      const at = kind === 'berry' ? page.berries[id] : kind === 'letter' ? page.letters.find((l) => l.ch === id) : kind === 'fire' ? page.campfires[id] : kind === 'flower' ? page.flowers[id] : page.goal;
      if (!at) return { ok: false, reason: 'bad-request' };
      const w = pageToWorld(page, at.x, at.y);
      return sync.request('storybook', 'collect', { kind, id }, { ...sync.actorFor(p), pos: { x: w.x, y: w.y, z: PAGE.z } });
    },
    lightAll() { const page = curPage(); return page ? page.campfires.map((f, i) => api.debug.collect('fire', i)) : []; },
    clear() { return api.debug.collect('goal', 0); },
    teleport(p, tx, ty) { pagePlayers.teleport(p, tx, ty); },
    /** Give a player a page tool through the real path (host): give(players.p1, 'axe'); give(p, null) takes it back. */
    give(p, tool) { return sync.request('storybook', 'debugTool', { key: pw.keyOf(p), tool }, sync.isHost ? { screen: 'host', index: 0, pos: { x: 0, y: 0, z: 0 } } : null); },
    enemies() { return pw.world ? pw.world.enemies.map((e) => ({ id: e.id, kind: e.kind, x: +e.x.toFixed(2), y: +e.y.toFixed(2), st: e.st, dir: e.dir, holder: e.holder })) : []; },
    objects() { return pw.world ? pw.world.objects.filter((o) => o.st !== 'gone').map((o) => ({ id: o.id, kind: o.kind, x: +o.x.toFixed(2), y: +o.y.toFixed(2), st: o.st, holder: o.holder, hostile: o.hostile })) : []; },
    tiles() { return pw.world ? { ...pw.world.cells } : {}; },
    /** Spawn an enemy ('acorn' | 'beetle' | 'bush') or a throwable ('stone' | 'fruit' | 'log') at tile (tx, ty) through the host. */
    spawn(kind, tx, ty) {
      if (!pw.world) return false;
      const recs = ['acorn', 'beetle', 'bush'].includes(kind) ? [{ t: 'spawnE', e: { id: pw.world.enemies.reduce((m, e) => Math.max(m, e.id + 1), 0), kind, x: tx, y: ty } }]
        : [{ t: 'spawn', objects: [{ id: pw.world.nextObj, kind, x: tx, y: ty, vx: 0, vy: 0, st: 'air' }] }];
      return sync.request('storybook', 'debugWorld', { recs }, sync.isHost ? { screen: 'host', index: 0, pos: { x: 0, y: 0, z: 0 } } : null);
    },
    killAll() {
      if (!pw.world) return false;
      const recs = pw.world.enemies.filter((e) => e.st !== 'dead').map((e) => ({ t: 'defeat', id: e.id, how: 'debug', x: e.x, y: e.y, bonus: 0 }));
      return recs.length ? sync.request('storybook', 'debugWorld', { recs }, sync.isHost ? { screen: 'host', index: 0, pos: { x: 0, y: 0, z: 0 } } : null) : false;
    },
    validate() { return validatePage(curPage() || getPage('orchard-hop')); },
  };
  return api;
}
