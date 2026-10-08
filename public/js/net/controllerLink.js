// Controller (phone) side of the link, one class per transport with the same tiny API so controller.js is transport-agnostic:
//
//   const link = createControllerLink({ onOpen, onClose, onMessage });
//   link.connect()      open the underlying connection (WebSocket / PeerJS peer); onOpen() when usable, onClose() when lost
//   link.join(code)     join a room, identifying this phone by its persistent clientId; answers arrive via onMessage as the
//                       WebSocket-protocol messages ({type:'joined', player} | {type:'assign', player, color} | {type:'host-left'} | {type:'error', message})
//                       Host feedback may also include {type:'rumble', ms}; visible, joined phones vibrate for at most 300 ms.
//   link.send(obj)      send a JSON message to the host (true if sent)
//   link.open           boolean, connection is usable
import { PEER_PREFIX, PEERJS_URL, getClientId, getTransport, loadScript } from './transport.js';

const CONNECT_TIMEOUT_MS = 10000;   // give up on a data channel that never opens
const ROOM_NOT_FOUND = 'Room not found. Check the code and try again.';

class WsControllerLink {
  constructor(h) {
    this.h = h;
    this.ws = null;
    this.open = false;
  }

  connect() {
    if (this.ws) { try { this.ws.onclose = null; this.ws.close(); } catch (_) { /* ignore */ } }
    this.open = false;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let sock;
    try { sock = new WebSocket(`${proto}//${location.host}/ws`); } catch (_) { this.h.onClose(); return; }
    this.ws = sock;
    sock.onopen = () => { this.open = true; this.h.onOpen(); };
    sock.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch (_) { return; }
      this.h.onMessage(m);
    };
    sock.onclose = () => {
      if (this.ws !== sock) return;
      this.open = false;
      this.h.onClose();
    };
    sock.onerror = () => { /* onclose follows */ };
  }

  join(code) { this.send({ type: 'join', code, clientId: getClientId() }); }

  send(obj) {
    if (!this.ws || !this.open) return false;
    this.ws.send(JSON.stringify(obj));
    return true;
  }

  /** Leave cleanly (page going away) so the host notices at once instead of after a timeout. */
  close() { try { if (this.ws) { this.ws.onclose = null; this.ws.close(); } } catch (_) { /* ignore */ } this.open = false; }
}

class PeerControllerLink {
  constructor(h) {
    this.h = h;
    this.peer = null;
    this.conn = null;
    this.connCode = '';
    this.timer = null;
    this.gen = 0;              // bumped on every connect() so callbacks of a superseded peer are ignored
  }

  get open() { return !!(this.peer && this.peer.open); }

  async connect() {
    const gen = ++this.gen;
    this._dropConn();
    if (this.peer) { try { this.peer.destroy(); } catch (_) { /* ignore */ } this.peer = null; }
    try { await loadScript(PEERJS_URL); } catch (_) { if (gen === this.gen) this.h.onClose(); return; }
    if (gen !== this.gen) return;
    let peer;
    try { peer = new window.Peer({ debug: 0 }); } catch (_) { this.h.onClose(); return; }
    this.peer = peer;
    peer.on('open', () => { if (gen === this.gen) this.h.onOpen(); });
    peer.on('disconnected', () => {
      // signalling lost: established data channels keep working; re-register so new joins are possible
      if (gen !== this.gen || peer.destroyed) return;
      setTimeout(() => { if (gen === this.gen && !peer.destroyed && peer.disconnected) { try { peer.reconnect(); } catch (_) { /* ignore */ } } }, 1000);
    });
    peer.on('close', () => { if (gen === this.gen) { this.peer = null; this._dropConn(); this.h.onClose(); } });
    peer.on('error', (err) => {
      if (gen !== this.gen) return;
      const type = err && err.type;
      if (type === 'peer-unavailable') {
        this._dropConn();
        this.h.onMessage({ type: 'error', message: ROOM_NOT_FOUND });
      } else if (peer.destroyed) {
        this.peer = null;
        this._dropConn();
        this.h.onClose();
      }
      // other errors: 'disconnected' / 'close' handle recovery
    });
  }

  join(code) {
    const peer = this.peer;
    if (!peer || !peer.open) return;                                   // onOpen() joins once registered
    if (this.conn && this.connCode === code) return;   // already joined / joining
    this._dropConn();
    let conn;
    try { conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json', metadata: { clientId: getClientId() } }); } catch (_) { this.h.onMessage({ type: 'error', message: ROOM_NOT_FOUND }); return; }
    this.conn = conn;
    this.connCode = code;
    this.timer = setTimeout(() => {
      if (this.conn !== conn) return;
      this._dropConn();
      this.h.onMessage({ type: 'error', message: ROOM_NOT_FOUND });
    }, CONNECT_TIMEOUT_MS);
    let opened = false;
    conn.on('open', () => {
      if (this.conn !== conn) return;
      opened = true;
      clearTimeout(this.timer);
      this.timer = null;
      try { conn.send({ type: 'hello', clientId: getClientId() }); } catch (_) { /* metadata already carries the id */ }
    });
    conn.on('data', (m) => { if (this.conn === conn && m && typeof m === 'object') this.h.onMessage(m); });
    conn.on('close', () => {
      if (this.conn !== conn) return;
      this._dropConn();
      // closed after joining = the game went away; closed before opening = nobody answered
      this.h.onMessage(opened ? { type: 'host-left' } : { type: 'error', message: ROOM_NOT_FOUND });
    });
    conn.on('error', () => {});
  }

  send(obj) {
    if (!this.conn || !this.conn.open) return false;
    try { this.conn.send(obj); return true; } catch (_) { return false; }
  }

  /** Leave cleanly (page going away) so the host notices at once instead of after an ICE timeout. */
  close() {
    this.gen++;
    this._dropConn();
    if (this.peer) { try { this.peer.destroy(); } catch (_) { /* ignore */ } this.peer = null; }
  }

  _dropConn() {
    clearTimeout(this.timer);
    this.timer = null;
    const c = this.conn;
    this.conn = null;
    this.connCode = '';
    if (c) { try { c.close(); } catch (_) { /* ignore */ } }
  }
}

export function createControllerLink(handlers) {
  return getTransport() === 'ws' ? new WsControllerLink(handlers) : new PeerControllerLink(handlers);
}
