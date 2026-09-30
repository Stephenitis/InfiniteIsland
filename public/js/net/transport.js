// Shared bits for the phone link: which transport to use, room codes, and a cached <script> loader.
//   'peer' (default): PeerJS / WebRTC data channels through the free PeerJS cloud signalling server. Works from a
//                     plain static host (Vercel) and across networks.
//   'ws':             the local Node WebSocket relay (`npm start`, add ?transport=ws on both pages).

/** @returns {'peer'|'ws'} */
export function getTransport() {
  return new URLSearchParams(location.search).get('transport') === 'ws' ? 'ws' : 'peer';
}

// Same alphabet as server.js: letters only, no ambiguous ones (I, O, L).
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const PEER_PREFIX = 'infinite-island-';
export const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
export const QRCODE_URL = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';

const CLIENT_ID_KEY = 'infiniteIsland.clientId';
let _clientId = null;

/**
 * Persistent id of this phone (controller page), kept in localStorage so a reload / reconnect is recognised as the same
 * device and gets its old player back. `?cid=<id>` overrides it (handy to test several controllers in one browser, which
 * share localStorage). Falls back to a per-page-load random id when storage is blocked.
 */
export function getClientId() {
  if (_clientId) return _clientId;
  const clean = (v) => String(v || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  let id = clean(new URLSearchParams(location.search).get('cid'));
  if (!id) {
    try { id = clean(localStorage.getItem(CLIENT_ID_KEY)); } catch (_) { /* storage blocked */ }
    if (!id) {
      id = (crypto && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 24);
      try { localStorage.setItem(CLIENT_ID_KEY, id); } catch (_) { /* ignore */ }
    }
  }
  _clientId = id;
  return id;
}

const SCREEN_ID_KEY = 'infiniteIsland.screenId';
let _screenId = null;

/**
 * Identity of THIS page as a joined screen (a `?join=CODE` replica). Unlike the phone's clientId it is per TAB (sessionStorage), so two
 * replica tabs of one browser are two screens, while a reload of the same tab is recognised and gets its screen (and items) back.
 * `?cid=<id>` overrides it.
 */
export function getScreenClientId() {
  if (_screenId) return _screenId;
  const clean = (v) => String(v || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  let id = clean(new URLSearchParams(location.search).get('cid'));
  if (!id) {
    try { id = clean(sessionStorage.getItem(SCREEN_ID_KEY)); } catch (_) { /* storage blocked */ }
    if (!id) {
      id = (crypto && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 24);
      try { sessionStorage.setItem(SCREEN_ID_KEY, id); } catch (_) { /* ignore */ }
    }
  }
  _screenId = id;
  return id;
}

/** The room code of `?join=CODE` (a replica page), or '' on a normal host page. */
export function getJoinCode() {
  return String(new URLSearchParams(location.search).get('join') || '').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8);
}

export function makeCode() {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

const scripts = new Map();

/** Load a classic <script> once; the returned promise is cached per URL (a failed load can be retried). */
export function loadScript(url) {
  let p = scripts.get(url);
  if (p) return p;
  p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { s.remove(); reject(new Error(`Failed to load ${url}`)); };
    document.head.appendChild(s);
  });
  p.catch(() => scripts.delete(url));
  scripts.set(url, p);
  return p;
}
