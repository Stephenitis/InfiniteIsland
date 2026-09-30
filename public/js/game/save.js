// Tiny localStorage save helper shared by the game-state modules (inventory now, campfire / quest later).
//
//   NEW_GAME            true when the page was opened with ?newgame (saved data must be ignored and cleared)
//   loadSave(key)       parsed JSON or null (never throws; storage can be blocked / full / private)
//   writeSave(key, v)   JSON.stringify into storage (never throws)
//   clearSave(key)
//
// ?newgame is stripped from the address bar right after it was read (history.replaceState), so a later reload keeps the
// progress made since; NEW_GAME itself stays true for the rest of the page's life so every module can react to it once.
const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
export const NEW_GAME = params.has('newgame');

if (NEW_GAME) {
  try {
    const rest = location.search.slice(1).split('&').filter((kv) => kv && kv.split('=')[0] !== 'newgame');
    history.replaceState(history.state, '', location.pathname + (rest.length ? '?' + rest.join('&') : '') + location.hash);
  } catch (_) { /* ignore */ }
}

export function loadSave(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

export function writeSave(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
}

export function clearSave(key) {
  try { localStorage.removeItem(key); } catch (_) { /* ignore */ }
}
