// One-tap "Play fullscreen" prompt for touch devices. Browsers only allow fullscreen from a user gesture, so this is a
// button rather than an automatic switch. Where the Fullscreen API is missing (iPhone Safari) it shows a one-time
// "Add to Home Screen" tip instead, since an installed web app is the only way to hide the browser bars there.
// Nothing shows when the game already runs as an installed app, or once the player dismissed it (per session for the
// button, per device for the tip). The ⋯ options menu keeps a permanent Fullscreen toggle.
//
//   createFullscreenPrompt(hudRoot, { hud, delay: 3 })   // call only on touch hosts
const DISMISS_KEY = 'infiniteIsland.fsPromptDismissed';   // sessionStorage
const TIP_KEY = 'infiniteIsland.homeScreenTipShown';      // localStorage
const FS_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';

const readFlag = (store, key) => { try { return store.getItem(key) === '1'; } catch (_) { return false; } };
const writeFlag = (store, key) => { try { store.setItem(key, '1'); } catch (_) { /* storage unavailable */ } };

export function isInstalledApp() {
  try {
    return window.matchMedia('(display-mode: fullscreen)').matches
      || window.matchMedia('(display-mode: standalone)').matches
      || navigator.standalone === true;
  } catch (_) { return false; }
}

/** Enter fullscreen, hiding the browser's navigation UI where supported. Resolves true on success. */
export async function enterFullscreen() {
  const el = document.documentElement;
  try {
    await el.requestFullscreen({ navigationUI: 'hide' });
    return true;
  } catch (_) {
    return false;
  }
}

export function createFullscreenPrompt(root, { hud, delay = 3 } = {}) {
  if (isInstalledApp()) return null;
  const canFullscreen = !!document.fullscreenEnabled;
  if (canFullscreen ? readFlag(sessionStorage, DISMISS_KEY) : readFlag(localStorage, TIP_KEY)) return null;

  const el = document.createElement('div');
  el.className = 'fs-prompt';
  el.hidden = true;
  if (canFullscreen) {
    el.innerHTML = `<button type="button" class="fs-go">${FS_ICON}<span>Play fullscreen</span></button>
      <button type="button" class="fs-close" aria-label="No thanks">&#x2715;</button>`;
  } else {
    el.innerHTML = `<div class="fs-tip">Tip: tap <b>Share</b>, then <b>Add to Home Screen</b> to play fullscreen</div>
      <button type="button" class="fs-close" aria-label="Close tip">&#x2715;</button>`;
  }
  root.appendChild(el);

  let timer = 0;
  const hide = () => {
    clearTimeout(timer);
    if (el.hidden || el.classList.contains('out')) return;
    el.classList.add('out');
    setTimeout(() => el.remove(), 350);
    document.removeEventListener('fullscreenchange', onChange);
  };
  const onChange = () => { if (document.fullscreenElement) hide(); };
  document.addEventListener('fullscreenchange', onChange);

  // Buttons act on click; stop the press reaching the game (it is not an Interact / Cancel).
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.querySelector('.fs-close').addEventListener('click', () => {
    writeFlag(canFullscreen ? sessionStorage : localStorage, canFullscreen ? DISMISS_KEY : TIP_KEY);
    hide();
  });
  el.querySelector('.fs-go')?.addEventListener('click', () => {
    // Hide right away: some embedded browsers leave the request pending instead of resolving or rejecting it.
    const req = enterFullscreen();
    hide();
    req.then((ok) => { if (!ok) hud?.toast('Fullscreen is unavailable here'); });
  });

  setTimeout(() => {
    if (!el.isConnected || document.fullscreenElement) return;
    el.hidden = false;
    if (!canFullscreen) writeFlag(localStorage, TIP_KEY);      // the tip shows once per device
    timer = setTimeout(hide, canFullscreen ? 20000 : 12000);
  }, delay * 1000);

  return { el, hide };
}
