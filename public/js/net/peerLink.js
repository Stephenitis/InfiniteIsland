// Host side of the phone-controller link over PeerJS (WebRTC data channels). Same public API and events as RemoteLink,
// so RemoteSource / PairPanel / main.js don't care which one they get:
//
//   const link = new PeerLink();
//   link.on('room', (code) => ...);                 // code once registered with the signalling server (null when lost)
//   link.on('controller-connected', (id, clientId) => ...);   link.on('controller-disconnected', (id) => ...);
//   link.on('input', (msg) => ...);                 // { id, clientId, x, y, interact, cancel }
//   link.sendTo(id, msg)                            // host -> one controller, directly over its data connection
//   link.on('status', (connected) => ...);          // connected to the PeerJS signalling server
//   link.code, link.controllers (Set of ids), link.connected
//
// The host registers as `infinite-island-<CODE>`. The code lives in sessionStorage so a page reload keeps it (phones
// simply auto-rejoin). Controllers dial that id and speak the same JSON messages as the WebSocket protocol.
import { PEER_PREFIX, PEERJS_URL, loadScript, makeCode } from './transport.js';

const SS_KEY = 'infiniteIsland.hostCode';
const ID_RETRIES = 3;          // a reload can collide with the old id for a moment
const ID_RETRY_MS = 1500;
const CONN_TIMEOUT_MS = 9000;  // controllers ping every 3 s; a silent data channel (phone died / left the network) is closed after this
const CONN_CHECK_MS = 2000;

const cleanClientId = (v) => { const s = String(v || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64); return s || null; };
const ssGet = () => { try { return sessionStorage.getItem(SS_KEY) || ''; } catch (_) { return ''; } };
const ssSet = (v) => { try { sessionStorage.setItem(SS_KEY, v); } catch (_) { /* ignore */ } };

export class PeerLink {
  constructor() {
    this.code = null;
    this.connected = false;
    this.controllers = new Set();
    this.clientIds = new Map();
    this._handlers = {};
    this._peer = null;
    this._conns = new Map();       // controller id -> DataConnection
    this._wantCode = ssGet() || makeCode();
    this._idTries = 0;
    this._retry = 0;
    this._timer = null;
    this._closed = false;
    ssSet(this._wantCode);
    window.addEventListener('pagehide', () => this.close());
    window.addEventListener('beforeunload', () => this.close());
    this._start();
  }

  on(type, fn) { (this._handlers[type] ||= []).push(fn); return this; }

  _emit(type, ...args) {
    for (const fn of this._handlers[type] || []) {
      try { fn(...args); } catch (err) { console.error(`PeerLink handler (${type}):`, err); }
    }
  }

  async _start() {
    if (this._closed) return;
    try { await loadScript(PEERJS_URL); } catch (err) { console.warn(err.message); return this._scheduleRetry(); }
    if (this._closed) return;
    if (typeof window.Peer !== 'function') return this._scheduleRetry();

    const code = this._wantCode;
    let peer;
    try { peer = new window.Peer(PEER_PREFIX + code, { debug: 0 }); } catch (err) { console.warn(err); return this._scheduleRetry(); }
    this._peer = peer;

    peer.on('open', () => {
      if (this._peer !== peer) return;
      this._retry = 0;
      this._idTries = 0;
      const first = !this.connected;
      this.connected = true;
      this.code = code;
      if (first) this._emit('status', true);
      this._emit('room', code);
    });

    peer.on('connection', (conn) => this._onConnection(conn));

    // Lost the signalling server (existing data channels keep working): just re-register.
    peer.on('disconnected', () => {
      if (this._peer !== peer || this._closed || peer.destroyed) return;
      this._setOffline();
      setTimeout(() => { if (this._peer === peer && !peer.destroyed && peer.disconnected) { try { peer.reconnect(); } catch (_) { /* ignore */ } } }, 1000);
    });

    peer.on('error', (err) => {
      if (this._peer !== peer) return;
      if (err && err.type === 'unavailable-id') {
        // our id is still registered (fast reload / duplicated tab): wait for it to expire, then give up and pick a new code
        this._dropPeer(peer);
        if (++this._idTries > ID_RETRIES) {
          this._idTries = 0;
          this._wantCode = makeCode();
          ssSet(this._wantCode);
          this._start();
        } else {
          this._timer = setTimeout(() => { this._timer = null; this._start(); }, ID_RETRY_MS);
        }
        return;
      }
      if (err && err.type === 'peer-unavailable') return;     // only meaningful for outgoing connections
      console.warn('PeerLink error:', err && err.type, err && err.message);
      if (peer.destroyed) { this._dropPeer(peer); this._scheduleRetry(); }
      // otherwise a 'disconnected' event follows for network / socket errors and we reconnect from there
    });

    peer.on('close', () => {
      if (this._peer !== peer) return;
      this._dropPeer(peer);
      this._scheduleRetry();
    });
  }

  _onConnection(conn) {
    if (this._closed) { try { conn.close(); } catch (_) { /* ignore */ } return; }
    let id = null;
    const release = () => {
      closed = true;
      clearTimeout(helloTimer);
      clearInterval(watchdog);
      if (id === null) return;
      if (this._conns.get(id) === conn) this._conns.delete(id);
      if (this.controllers.delete(id)) { this.clientIds.delete(id); this._emit('controller-disconnected', id); }
      id = null;
    };
    let closed = false, helloTimer = null, clientId = null, lastSeen = performance.now();
    const watchdog = setInterval(() => {
      if (closed) { clearInterval(watchdog); return; }
      if (performance.now() - lastSeen > CONN_TIMEOUT_MS) { try { conn.close(); } catch (_) { /* ignore */ } release(); }
    }, CONN_CHECK_MS);
    const register = () => {
      if (id !== null || closed) return;
      id = 1;
      while (this.controllers.has(id)) id++;         // lowest free connection number
      this._conns.set(id, conn);
      this.controllers.add(id);
      this.clientIds.set(id, clientId);
      try { conn.send({ type: 'joined', player: id }); } catch (_) { /* ignore */ }
      this._emit('controller-connected', id, clientId);
    };
    conn.on('open', () => {
      // The controller puts its persistent clientId in the connection metadata; a {type:'hello', clientId} message is the fallback.
      const md = conn.metadata;
      clientId = cleanClientId(md && md.clientId);
      if (clientId) register();
      else helloTimer = setTimeout(register, 800);
    });
    conn.on('data', (m) => {
      if (!m) return;
      lastSeen = performance.now();
      if (m.type === 'hello') {
        if (id === null && !closed) { clientId = cleanClientId(m.clientId); clearTimeout(helloTimer); register(); }
        return;
      }
      if (id === null || m.type !== 'input') return;
      this._emit('input', {
        type: 'input', id, clientId,
        x: Number(m.x) || 0, y: Number(m.y) || 0,
        interact: !!m.interact, cancel: !!m.cancel,
      });
    });
    conn.on('close', release);
    conn.on('error', release);
  }

  /** Send `msg` to one controller (by connection id) straight over its data connection. */
  sendTo(id, msg) {
    const conn = this._conns.get(id);
    if (!conn || !conn.open) return false;
    try { conn.send(msg); return true; } catch (_) { return false; }
  }

  /** Signalling lost but the peer (and its data channels) live on. */
  _setOffline() {
    if (!this.connected) return;
    this.connected = false;
    this._emit('status', false);
  }

  _dropPeer(peer) {
    if (this._peer !== peer) return;
    this._peer = null;
    try { if (!peer.destroyed) peer.destroy(); } catch (_) { /* ignore */ }
    for (const id of [...this.controllers]) { this.controllers.delete(id); this.clientIds.delete(id); this._emit('controller-disconnected', id); }
    this._conns.clear();
    const had = this.connected;
    this.connected = false;
    this.code = null;
    if (had) this._emit('status', false);
    this._emit('room', null);
  }

  _scheduleRetry() {
    if (this._closed || this._timer) return;
    const delay = Math.min(5000, 500 * 2 ** this._retry++);
    this._timer = setTimeout(() => { this._timer = null; this._start(); }, delay);
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    clearTimeout(this._timer);
    const peer = this._peer;
    this._peer = null;
    try { if (peer) peer.destroy(); } catch (_) { /* ignore */ }
  }
}
