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
