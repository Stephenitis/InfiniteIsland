// Storybook mode (Step 48): the book stands on Storybook Cay open a PAGE, and the whole party steps into it together. This module is the host-authoritative
// `storybook` sync domain, the whole-party transition (the page fold) and the side-view mode: the follow camera is swapped for a narrow-FOV side camera, the islands
// and the sea are hidden, and every player is moved onto the page's flat lane. It follows Wildroot Hollow's pattern (game/dungeon.js): rules are PURE in
// game/storybookLogic.js (Node-tested), a page's data is game/pages/*.js, its look is world/pageVisuals.js. Step 49 replaces the simple left / right walking with real
// platformer physics; the state, the domain, the transition and the camera contract stay.
//
//   const storybook = createStorybook({ scene, camera, followCam, players, avatars, table, sync, hud, hudRoot, dialog, particles, sfx, cinematic, world, water, stands })
//   storybook.update(dt, t)          once per tick, AFTER players.update: the fold, entering / leaving, keeping the party on the lane
//   storybook.preInput()             once per tick, right after players.pollInput: up / down input is dropped (the strip only runs left / right)
//   storybook.updateCamera(dt)       replaces followCam.update while pageMode: frames every player of the page, clamped to the strip's ends
//   storybook.pageMode               this screen currently shows a page          storybook.state   { active, page, serial } (shared, session-only)
//   storybook.contains(p)            the player stands in a page                 storybook.allowsTarget(it)   bookstand only on the island, pageexit only in a page
//   storybook.enter(pageId) / exit() debug: host path, no distance check        storybook.summary() / storybook.stands
//
// Domain 'storybook' (host-owned, SESSION-ONLY: pages never save; a reload while in a page lands at the book stand through the player memory zone 'story'):
//   state { active, page, serial }; requests enter { page } (the actor stands within STAND_REACH of a stand that opens it, nothing is open) and exit {} (the actor is inside
//   the page near its back-cover ribbon); the host serialises them, bumps the serial and emits event state { state, message }. Snapshot = hashView = the state.
//   EVERY screen reacts to the state alone: its local players that are not where the state says they should be (in the page when active, on the Cay when not) are moved by
//   a page fold (cover -> teleport + camera switch + hide / show the world -> reveal). So a screen that joins mid-page, or a player who joins on a screen, simply follows.
import * as THREE from 'three';
import { PAGE, STAND_REACH, setPageHalfLength, pageHalfLength, inPageArea, pageSpawn, pageExit, standFront, freshState, normaliseState, hashView, validateEnter, validateExit, applyEnter, applyExit } from './storybookLogic.js';
import { PAGES, getPage } from './pages/index.js';
import { storyRuntime } from '../world/islands/storyWorld.js';
import { createPageVisuals } from '../world/pageVisuals.js';
import { createPageFold } from '../ui/pageFold.js';
import { addInteractable } from '../world/interactables.js';
import { addCollider } from '../world/colliders.js';
import { BOOK_SVG, BACK_SVG } from '../ui/icons.js';

const SIDE = { fov: 30, offset: new THREE.Vector3(0, 2.8, 26), focusY: 1.2, minZoom: 0.8, maxZoom: 3, margin: 5 };
const REASONS = {
  far: 'Stand a little closer to the book stand!',
  busy: 'The book is busy right now. Try again in a moment.',
  idle: 'Nothing to close right now.',
  outside: 'You are not inside a page.',
};

export function createStorybook({ scene, camera, followCam, players, avatars, table, sync, hud, hudRoot, dialog, particles, sfx, cinematic, world, water, stands = [] }) {
  let state = freshState();
  let pageMode = false;
  const visuals = createPageVisuals(scene);
  const fold = createPageFold(hudRoot, { sfx });
  const baseOffset = followCam.offset.clone();
  const focus = new THREE.Vector3();
  const exits = new Map();                                   // page id -> its back-cover interactable

  // ---- the back-cover ribbons: one interactable (and a collider so nobody walks through the pole) per page, registered once, only offered while that page is open
  for (const page of PAGES.values()) {
    const at = pageExit(page);
    addCollider({ x: at.x, z: PAGE.z - 0.85, r: 0.4, owner: page });
    exits.set(page.id, addInteractable({
      type: 'pageexit', object: null, position: new THREE.Vector3(at.x, PAGE.y, at.z), radius: 0.9, prompt: 'Close the book',
      onInteract: (_it, p) => openExitMenu(p, page),
    }));
  }

  // ---- requests (any local player; the host decides)
  function request(kind, data, p) {
    if (!p) return Promise.resolve(false);
    return Promise.resolve(sync.request('storybook', kind, data, sync.actorFor(p))).then((r) => {
      if (!r.ok) hud.toast(REASONS[r.reason] || 'The book will not open right now.', { icon: 'sparkle', duration: 2800 });
      return r.ok;
    });
  }

  function openStandMenu(stand, p) {
    if (state.active || fold.running || dialog.isOpen || cinematic.busy) return;
    const page = getPage(stand.page);
    if (!page) return;
    dialog.open({
      owner: p, name: 'Storybook', text: `A page of the great book lies open: ${page.name}. ${page.blurb} Everyone steps in together.`,
      choices: [
        { label: `Enter the page: ${page.name}`, icon: BOOK_SVG, onSelect: () => { dialog.close(); request('enter', { page: page.id }, p); } },
        { label: 'Not yet', icon: BACK_SVG, onSelect: () => dialog.close() },
      ],
      onCancel: () => dialog.close(),
    });
  }
  storyRuntime.onStand = openStandMenu;

  function openExitMenu(p, page) {
    if (!state.active || dialog.isOpen || fold.running) return;
    dialog.open({
      owner: p, name: page.name, text: 'Close the book? Everyone goes back to the Cay together.',
      choices: [
        { label: 'Take everyone back to the Cay', icon: BACK_SVG, onSelect: () => { dialog.close(); request('exit', {}, p); } },
        { label: 'Keep reading', icon: BOOK_SVG, onSelect: () => dialog.close() },
      ],
      onCancel: () => dialog.close(),
    });
  }

  // ---- state
  function toastFor(prev) {
    if (state.active && !prev.active) hud.toast(`Turning the page: ${getPage(state.page).name}`, { icon: 'book', duration: 2600 });
    else if (!state.active && prev.active) hud.toast('The book closes. Back on the Cay!', { icon: 'book', duration: 2600 });
  }
  function apply(next, announce = true) {
    const prev = state;
    state = next;
    if (state.active) setPageHalfLength(getPage(state.page).length / 2);
    if (announce && (prev.active !== state.active || prev.serial !== state.serial)) toastFor(prev);
    reconcile();
  }
  function hostSet(next) {                                    // the host decides: apply here and tell every screen
    apply(next);
    sync.emit('storybook', 'state', { state: { ...state } });
  }
  sync.register('storybook', {
    snapshot: () => ({ ...state }),
    hashView: () => hashView(state),
    applySnapshot: (s) => apply(normaliseState(s, PAGES), false),
    applyEvent(kind, d) { if (kind === 'state') apply(normaliseState(d && d.state, PAGES)); },
    handleRequest(kind, d, actor, screen) {
      if (!actor || table.get(actor.index)?.screen !== screen || table.get(actor.index)?.away || cinematic.busy) return { reject: 'busy' };
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
      if (screen === 'host' && kind === 'debugEnter' && !state.active && getPage(d && d.page)) { hostSet(applyEnter(state, d.page)); return true; }   // (debug: no distance rule)
      if (screen === 'host' && kind === 'debugExit' && state.active) { hostSet(applyExit(state)); return true; }
      return { reject: 'unknown' };
    },
  });

  // ---- the side camera
  function setMode(on) {
    pageMode = on;
    world.root.visible = !on;                                  // the islands, their props and the far versions
    water.group.visible = !on;                                 // the sea has no business in a book
    if (on) {
      visuals.open(getPage(state.page));
      followCam.offset.copy(SIDE.offset);
      camera.fov = SIDE.fov; camera.updateProjectionMatrix();
      world.setViewHint(stands[0] ? { x: stands[0].x, z: stands[0].z } : null);   // the Cay stays full detail behind the scenes: no pop-in on the way back
    } else {
      visuals.close();
      followCam.offset.copy(baseOffset);
      followCam.resize(window.innerWidth, window.innerHeight);   // restores the island FOV / aspect
      world.setViewHint(null);
    }
    followCam.snap();
    hudRoot.classList.toggle('storybook-active', on);
  }

  // ---- moving the party (every screen, for ITS players)
  const localPlayers = () => players.list.filter((p) => !p.away && !p.leaving);
  const inBook = (p) => inPageArea(p.position.x, p.position.z);
  function move(p, at) {
    dialog.close(); p._swingT = -1; if (p.setPose) p.setPose(null);
    particles.burst('puff', p.position, { count: 8, radius: 0.6 });
    p.teleport(at.x, at.z);
    particles.burst('sparkle', p.position, { count: 10, radius: 0.7 });
  }
  function transition() {
    const want = state.active;
    const page = want ? getPage(state.page) : null;
    const front = stands[0] || null;
    for (const p of localPlayers()) {
      if (want && !inBook(p)) move(p, pageSpawn(page, p.index));
      else if (!want && inBook(p) && front) move(p, standFront(front, p.index));
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
  const _xs = [];
  function updateCamera(dt) {
    _xs.length = 0;
    for (const p of players.list) if (!p.away && inBook(p)) _xs.push(p.position.x);
    for (const a of avatars.list) if (a.root.visible && inBook(a)) _xs.push(a.position.x);
    if (!_xs.length) _xs.push(PAGE.x);
    const lo = Math.min(..._xs), hi = Math.max(..._xs);
    if (camera.fov !== SIDE.fov) { camera.fov = SIDE.fov; camera.updateProjectionMatrix(); }
    const dist0 = SIDE.offset.length() * followCam.framingZoom;
    const aspect = camera.aspect > 0 ? camera.aspect : 16 / 9;                                      // (a page loaded in a hidden 0 x 0 window has no aspect yet)
    const half1 = Math.tan(THREE.MathUtils.degToRad(SIDE.fov / 2)) * dist0 * aspect;               // visible half width on the lane at zoom 1
    const zoom = Math.min(SIDE.maxZoom, Math.max(SIDE.minZoom, ((hi - lo) / 2 + SIDE.margin) / half1));
    const vis = half1 * zoom, reach = pageHalfLength() + 1.5;                                       // the page's two edges are never shown beyond
    const mid = (lo + hi) / 2 - PAGE.x;
    focus.set(PAGE.x + (vis >= reach ? 0 : Math.max(-reach + vis, Math.min(reach - vis, mid))), PAGE.y + SIDE.focusY, PAGE.z);
    followCam.update(dt, focus, zoom);
  }

  return {
    get state() { return state; },
    get pageMode() { return pageMode; },
    fold, visuals, stands, exits,
    contains: (p) => state.active && inBook(p),
    allowsTarget: (it) => (it.type === 'pageexit' ? state.active : it.type === 'bookstand' ? !state.active && !fold.running : true),
    preInput() {                                                // the strip only runs left / right: drop the up / down part of the input (and keep the speed of a diagonal)
      if (!pageMode) return;
      for (const p of players.list) {
        const m = p.actions && p.actions.move;
        if (!m) continue;
        const mag = Math.hypot(m.x, m.z);
        m.x = Math.abs(m.x) < 0.35 * mag ? 0 : Math.sign(m.x) * Math.min(1, mag);
        m.z = 0;
      }
    },
    update(dt, t = 0) {
      fold.update(dt);
      if (!fold.running) reconcile();
      if (pageMode) {
        const k = 1 - Math.exp(-10 * dt);                       // line the party up on the lane like cardboard cut-outs
        for (const p of players.list) if (inBook(p)) p.position.z += (PAGE.z - p.position.z) * k;
        visuals.update(t);
      }
    },
    updateCamera,
    enter(pageId = 'test-meadow') { return sync.request('storybook', 'debugEnter', { page: pageId }, sync.isHost ? { screen: 'host', index: 0, pos: { x: 0, y: 0, z: 0 } } : null); },
    exit() { return sync.request('storybook', 'debugExit', {}, sync.isHost ? { screen: 'host', index: 0, pos: { x: 0, y: 0, z: 0 } } : null); },
    summary() {
      return {
        state: { ...state }, mode: pageMode ? 'page' : 'island', fold: fold.summary(), standReach: STAND_REACH,
        players: localPlayers().map((p) => ({ slot: p.index, inBook: inBook(p), x: +p.position.x.toFixed(2), y: +p.position.y.toFixed(2), z: +p.position.z.toFixed(2) })),
        stands: stands.map((s) => ({ id: s.id, page: s.page, x: +s.x.toFixed(2), z: +s.z.toFixed(2) })),
        visuals: visuals.summary(),
      };
    },
  };
}
