// Replica side of the world link (PLAN Step 22): a game page opened with `?join=CODE` connects to the host page of room CODE as a
// 'screen' (role:'screen', not a phone controller) and exchanges WorldSync messages (net/worldSync.js) with it.
// One class per transport with the same tiny API, like controllerLink.js:
//
//   const link = createScreenLink(code);            // PeerJS by default; the local WebSocket relay with ?transport=ws
//   link.on('status', (state) => ...)               // 'connecting' | 'open' | 'reconnecting' (host gone / link lost, retrying forever with backoff)
//   link.on('message', (msg) => ...)                // a JSON message from the host (hb heartbeats are swallowed)
//   link.send(msg)                                  // -> true when it went out
//   link.open, link.code, link.close()
//
// Reliable + ordered JSON data channel (PeerJS `reliable` / a WebSocket). The page's persistent per-tab screen id (getScreenClientId) is
// sent with the connection so a reload is recognised by the host and gets its screen back within the grace period.
import { PEER_PREFIX, PEERJS_URL, getScreenClientId, getTransport, loadScript } from './transport.js';

const CONNECT_TIMEOUT_MS = 10000;
const PING_MS = 3000;           // keeps the host's watchdog happy
const SILENT_MS = 13000;        // the host sends a heartbeat every 4 s: nothing for this long = the link is dead
const backoff = (n) => Math.min(5000, 500 * 2 ** n);

class Emitter {
  constructor() { this._h = {}; }
  on(type, fn) { (this._h[type] ||= []).push(fn); return this; }
  _emit(type, ...args) { for (const fn of this._h[type] || []) { try { fn(...args); } catch (err) { console.error(`ScreenLink handler (${type}):`, err); } } }
}

class PeerScreenLink extends Emitter {
  constructor(code) {
    super();
    this.code = code;
    this.open = false;
    this.state = 'connecting';
    this._peer = null;
    this._conn = null;
    this._gen = 0;
    this._retry = 0;
    this._timer = null;
    this._ping = null;
    this._lastSeen = 0;
    this._everOpen = false;
    this._closed = false;
    window.addEventListener('pagehide', () => this.close());
    window.addEventListener('beforeunload', () => this.close());
    this._connect();
  }

  _setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.open = s === 'open';
    this._emit('status', s);
  }

  async _connect() {
    if (this._closed) return;
    const gen = ++this._gen;
    this._setState(this._everOpen ? 'reconnecting' : 'connecting');
    if (!this._peer || this._peer.destroyed) {
      try { await loadScript(PEERJS_URL); } catch (_) { return this._scheduleRetry(gen); }
      if (gen !== this._gen || this._closed) return;
      let peer;
      try { peer = new window.Peer({ debug: 0 }); } catch (_) { return this._scheduleRetry(gen); }
      this._peer = peer;
      peer.on('open', () => { if (this._peer === peer && !this._conn) this._dial(peer); });
      peer.on('disconnected', () => {
        if (this._peer !== peer || peer.destroyed) return;
        setTimeout(() => { if (this._peer === peer && !peer.destroyed && peer.disconnected) { try { peer.reconnect(); } catch (_) { /* ignore */ } } }, 1000);
      });
      peer.on('close', () => { if (this._peer === peer) { this._peer = null; this._dropConn(); this._scheduleRetry(this._gen); } });
      peer.on('error', (err) => {
        if (this._peer !== peer) return;
        if (err && err.type === 'peer-unavailable') { this._dropConn(); this._scheduleRetry(this._gen); }       // the host is not (yet) there
        else if (peer.destroyed) { this._peer = null; this._dropConn(); this._scheduleRetry(this._gen); }
      });
    } else if (this._peer.open) {
      this._dial(this._peer);
    }
  }

  _dial(peer) {
    this._dropConn();
    let conn;
    try {
      conn = peer.connect(PEER_PREFIX + this.code, { reliable: true, serialization: 'json', metadata: { role: 'screen', clientId: getScreenClientId() } });
    } catch (_) { this._scheduleRetry(this._gen); return; }
    this._conn = conn;
    const gen = this._gen;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => { if (this._conn === conn && !conn.open) { this._dropConn(); this._scheduleRetry(gen); } }, CONNECT_TIMEOUT_MS);
    conn.on('open', () => {
      if (this._conn !== conn) return;
      clearTimeout(this._timer);
      this._timer = null;
      this._retry = 0;
      this._everOpen = true;
      this._lastSeen = performance.now();
      clearInterval(this._ping);
      this._ping = setInterval(() => {
        if (this._conn !== conn) return;
        if (performance.now() - this._lastSeen > SILENT_MS) { this._dropConn(); this._scheduleRetry(this._gen); return; }
        try { conn.send({ type: 'ping' }); } catch (_) { /* ignore */ }
      }, PING_MS);
      this._setState('open');
    });
    conn.on('data', (m) => {
      if (this._conn !== conn || !m || typeof m !== 'object') return;
      this._lastSeen = performance.now();
      if (m.type === 'hb') return;
      this._emit('message', m);
    });
    const lost = () => { if (this._conn === conn) { this._dropConn(); this._scheduleRetry(this._gen); } };
    conn.on('close', lost);
    conn.on('error', lost);
  }

  send(msg) {
    const c = this._conn;
    if (!c || !c.open) return false;
    try { c.send(msg); return true; } catch (_) { return false; }
  }

  _dropConn() {
    clearTimeout(this._timer);
    clearInterval(this._ping);
    this._timer = null;
    this._ping = null;
    const c = this._conn;
    this._conn = null;
    if (c) { try { c.close(); } catch (_) { /* ignore */ } }
  }

  _scheduleRetry(gen) {
    if (this._closed || gen !== this._gen) return;
    this._setState(this._everOpen ? 'reconnecting' : 'connecting');
    clearTimeout(this._timer);
    this._timer = setTimeout(() => { this._timer = null; this._connect(); }, backoff(this._retry++));
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    this._gen++;
    this._dropConn();
    clearTimeout(this._timer);
    const p = this._peer;
    this._peer = null;
    if (p) { try { p.destroy(); } catch (_) { /* ignore */ } }
    this._setState('connecting');
    this.open = false;
  }
}

class WsScreenLink extends Emitter {
  constructor(code) {
    super();
    this.code = code;
    this.open = false;
    this.state = 'connecting';
    this._ws = null;
    this._retry = 0;
    this._timer = null;
    this._everOpen = false;
    this._closed = false;
    window.addEventListener('pagehide', () => this.close());
    window.addEventListener('beforeunload', () => this.close());
    this._connect();
  }

  _setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.open = s === 'open';
    this._emit('status', s);
  }

  _connect() {
    if (this._closed) return;
    this._setState(this._everOpen ? 'reconnecting' : 'connecting');
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws;
    try { ws = new WebSocket(`${proto}//${location.host}/ws`); } catch (_) { this._scheduleRetry(); return; }
    this._ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'join', code: this.code, clientId: getScreenClientId(), role: 'screen' }));
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch (_) { return; }
      if (!m || this._ws !== ws) return;
      if (m.type === 'joined') { this._retry = 0; this._everOpen = true; this._setState('open'); return; }
      if (m.type === 'error' || m.type === 'host-left') { this._lost(ws); return; }     // room gone (a restarted relay host has a NEW code)
      if (m.type === 'hb') return;
      this._emit('message', m);
    };
    ws.onclose = () => this._lost(ws);
    ws.onerror = () => { /* onclose follows */ };
  }

  _lost(ws) {
    if (this._ws !== ws) return;
    this._ws = null;
    try { ws.onclose = null; ws.close(); } catch (_) { /* ignore */ }
    this._scheduleRetry();
  }

  send(msg) {
    if (!this._ws || !this.open || this._ws.readyState !== 1) return false;
    try { this._ws.send(JSON.stringify(msg)); return true; } catch (_) { return false; }
  }

  _scheduleRetry() {
    if (this._closed || this._timer) return;
    this._setState(this._everOpen ? 'reconnecting' : 'connecting');
    this._timer = setTimeout(() => { this._timer = null; this._connect(); }, backoff(this._retry++));
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    clearTimeout(this._timer);
    const ws = this._ws;
    this._ws = null;
    try { if (ws) { ws.onclose = null; ws.close(); } } catch (_) { /* ignore */ }
    this.open = false;
  }
}

export function createScreenLink(code) {
  return getTransport() === 'ws' ? new WsScreenLink(code) : new PeerScreenLink(code);
}
