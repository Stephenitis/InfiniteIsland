// Small legacy-game bridge. React/Fiber and cloud SDKs load only when needed.
import { createSettingsStore } from './worldSettings.js';
import { createEnvironmentBridge } from './environmentBridge.js';
import { attachVariant, normaliseVariant } from '../player/characterVariants.js';
import { attachHeldProp, normaliseHeldProp } from '../player/heldProps.js';
import { normaliseAppearance } from '../player/appearance.js';
import { characterPortrait } from '../player/portrait.js';
import { ISLANDS } from '../config.js';
import { islandIntroOptions } from '../camera/islandIntro.js';
import { createCampfireCast } from '../player/campfireCast.js';
import { createPersonalPanels } from '../ui/personalPanels.js';

const PREF_KEY = 'infiniteIsland.character.v1';
function readPreference() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || 'null'); } catch { return null; }
}
function style(name) {
  if (document.querySelector(`link[data-island-style="${name}"]`)) return;
  const el = document.createElement('link'); el.rel = 'stylesheet'; el.href = `/generated/${name}.css`; el.dataset.islandStyle = name; document.head.append(el);
}
export async function mountExtensions(game) {
  const bridge = createEnvironmentBridge({ ...game, ambienceAudio: game.ambienceAudio });
  let config = {};
  try { const response = await fetch('/generated/config.json', { cache: 'no-store' }); if (response.ok) config = await response.json(); } catch { /* Built-in defaults work offline. */ }
  let cloud = { configured: false };
  if (config.supabaseUrl && config.supabasePublishableKey) {
    try { const module = await import('/generated/cloud.js'); cloud = module.createCloud(config); } catch { /* Keep game playable if the service is unavailable. */ }
  }
  let storage = null;
  try { storage = localStorage; } catch { /* Blocked storage. */ }
  const settingsStore = createSettingsStore({ cloud, storage, apply: (settings, meta) => {
    bridge.apply(settings, meta);
    if (!meta.preview && Number.isInteger(meta.revision)) bridge.applyPublishedTime?.(settings, { revision: meta.revision });
  } });
  const preference = readPreference();
  let selected = { variant: normaliseVariant(preference?.variant), display_name: typeof preference?.display_name === 'string' ? preference.display_name.slice(0, 32) : '', appearance: normaliseAppearance(preference?.appearance) };
  let variantCleanup = attachVariant(game.player.character, selected.variant);
  game.player.characterVariant = selected.variant;
  const occupiedHand = () => !!game.player.holding;
  let propTime = 0, heldPropCleanup = attachHeldProp(game.player.character, selected.appearance.heldProp, { isOccupied: occupiedHand });
  game.player.heldProp = normaliseHeldProp(selected.appearance.heldProp);
  { const { heldProp, ...colors } = selected.appearance; game.player.character.setColors(colors); }
  let profiles = null, introPending = true, campCast = null, profileButton = null;
  const launchers = document.createElement('div'); launchers.className = 'island-tools';
  document.body.append(launchers);
  function chooseCharacter(character) {
    selected = { variant: normaliseVariant(character.variant ?? selected.variant), display_name: String(character.display_name ?? selected.display_name).trim().slice(0, 32), appearance: normaliseAppearance(character.appearance === undefined ? selected.appearance : character.appearance) };
    variantCleanup?.(); variantCleanup = attachVariant(game.player.character, selected.variant);
    game.player.characterVariant = selected.variant;
    { const { heldProp, ...colors } = selected.appearance; game.player.character.setColors(colors); }
    heldPropCleanup?.(); heldPropCleanup = attachHeldProp(game.player.character, selected.appearance.heldProp, { isOccupied: occupiedHand });
    game.player.heldProp = normaliseHeldProp(selected.appearance.heldProp);
    if (profileButton) profileButton.innerHTML = characterPortrait(selected.variant);
    campCast?.setSelected(selected.variant);
    try { localStorage.setItem(PREF_KEY, JSON.stringify(selected)); } catch { /* Appearance remains usable this session. */ }
  }
  const button = (label, handler) => { const el = document.createElement('button'); el.type = 'button'; el.textContent = label; el.addEventListener('click', handler); launchers.append(el); return el; };
  const notice = (message) => game.hud.toast(message, { duration: 4000 });
  async function loadProfiles() {
      if (!profiles) {
        style('profiles');
        const { mountProfiles } = await import('/generated/profiles.js');
        profiles = mountProfiles({ cloud, getCharacter: () => selected, setCharacter: chooseCharacter,
          getSave: () => ({ version: 1, character: selected }), onClose: () => bridge.setEditorOpen(false) });
      }
      return profiles;
  }
  const personalPanels = createPersonalPanels({ bagPanel: game.bagPanel, loadProfile: loadProfiles,
    blockProfile: (open) => { bridge.setEditorOpen(open); game.keyboard.releaseAll(); },
    onError: () => notice('Character account controls are unavailable. Your local game is unchanged.') });
  const openProfiles = () => personalPanels.toggle('profile');
  profileButton = button('My character', openProfiles);
  profileButton.className = 'island-profile-avatar';
  profileButton.setAttribute('aria-label', 'My character'); profileButton.title = 'My character';
  profileButton.innerHTML = characterPortrait(selected.variant);
  const personalButtons = [[profileButton, 'profile'], [game.hud.root.querySelector('.inv-bag-button'), 'bag'], [game.hud.root.querySelector('.hud-journal-dock'), 'journal']];
  for (const [el, name] of personalButtons) if (el) {
    el.dataset.personalPanel = name;
    el.addEventListener('click', (event) => { event.preventDefault(); event.stopImmediatePropagation(); personalPanels.toggle(name); }, { capture: true });
  }
  let admin = null;
  if (new URLSearchParams(location.search).has('admin') || location.pathname === '/editor') {
    style('admin');
    try { const { mountAdmin } = await import('/generated/admin.js'); admin = mountAdmin({ bridge, settingsStore, cloud }); }
    catch { notice('World editor could not load. The game is still available.'); }
  }
  // Fetch published settings asynchronously; network trouble must never gate first play.
  settingsStore.start();
  const onVisibility = () => { if (!document.hidden) settingsStore.refresh(); };
  document.addEventListener('visibilitychange', onVisibility);
  // Refresh is a low-frequency fallback if a free project's realtime connection is suspended.
  const refreshTimer = setInterval(() => { if (!document.hidden) settingsStore.refresh(); }, 60000);
  const editor = { bridge, settingsStore, cloud, get isOpen() { return bridge.isOpen || !!campCast?.isSelecting; }, get isSelecting() { return !!campCast?.isSelecting; }, get campCast() { return campCast; }, openProfiles, update: (dt) => { propTime += Number.isFinite(dt) ? Math.max(0, dt) : 0; heldPropCleanup?.update(propTime); campCast?.update(dt); } };
  function startIntro() {
    if (!introPending) return;
    introPending = false; // Only startup: reopening character selection must never replay the camera introduction.
    const count = game.players.list.filter((p) => !p.away).length + game.avatars.list.filter((p) => !p.away).length;
    if (settingsStore.getSnapshot().draft.intro && count === 1 && !bridge.isOpen && !game.controls && !game.cinematic.busy && !game.dungeon.state.active && !game.party.pageMode && !game.storybook.pageMode) {
      game.followCam.startIntro(islandIntroOptions(ISLANDS, game.player.position, game.followCam.camera));
    }
  }
  const homeFire = game.campfires.get('home');
  // Old saves may resume on another island: never move their player to force a first-time cosmetic choice.
  const atStartingCamp = Math.hypot(game.player.position.x - homeFire.position.x, game.player.position.z - homeFire.position.z) < 18;
  const canChooseAtStartup = atStartingCamp && !preference && !game.sync.isReplica && !new URLSearchParams(location.search).has('admin') && location.pathname !== '/editor' && !game.controls && !game.party.pageMode && !game.storybook.pageMode && !game.dungeon.state.active && !game.cinematic.busy;
  // The cast belongs to the real island scene on every screen. Choosing changes only this player's cosmetics.
  const castStyle = document.createElement('link'); castStyle.rel = 'stylesheet'; castStyle.href = '/campfire-friends.css'; document.head.append(castStyle);
  campCast = createCampfireCast({ scene: game.scene, camera: game.camera, canvas: game.renderer.domElement, player: game.player,
    keyboard: game.keyboard, welcomeFire: homeFire, fire: homeFire.fire, seats: homeFire.seats, selected: selected.variant, initialSelection: canChooseAtStartup,
    onChoose: (variant) => chooseCharacter({ variant }), onSettled: startIntro, hasActivity: () => game.players.activity,
    getBlocked: () => bridge.isOpen || game.cinematic.busy || game.party.pageMode || game.storybook.pageMode || game.dungeon.state.active || game.bagPanel.isOpen || game.pairPanel.isOpen || game.dialog.isOpen,
  });
  if (!canChooseAtStartup) startIntro();
  editor.dispose = () => { personalPanels.close(); clearInterval(refreshTimer); document.removeEventListener('visibilitychange', onVisibility); campCast?.dispose(); castStyle.remove(); variantCleanup?.(); heldPropCleanup?.(); profiles?.unmount(); admin?.unmount(); launchers.remove(); };
  return editor;
}
