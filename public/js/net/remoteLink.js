// Host side of the phone-controller link. Connects to ws(s)://<page host>/ws, registers as host, receives the
// room code and relays controller events. Auto-reconnects with backoff (a reconnect yields a NEW room code).
//
//   const link = new RemoteLink();
//   link.on('room', (code) => ...);
//   link.on('controller-connected', (id, clientId) => ...);  link.on('controller-disconnected', (id) => ...);
//   link.on('input', (msg) => ...);                // { id, clientId, x, y, interact, cancel }
//   link.on('status', (connected) => ...);
//   link.sendTo(id, msg)                           // host -> one controller (relayed by the server as {type:'to-controller', id, msg})
//   link.code, link.controllers (Set of ids), link.clientIds (Map id -> clientId), link.connected
export class RemoteLink {
  constructor({ url = null } = {}) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = url || `${proto}//${location.host}/ws`;
    this.code = null;
    this.connected = false;
    this.controllers = new Set();
    this.clientIds = new Map();
    this._handlers = {};
    this._ws = null;
    this._retry = 0;
    this._timer = null;
    this._closed = false;
    this._connect();
  }

  on(type, fn) { (this._handlers[type] ||= []).push(fn); return this; }

  _emit(type, ...args) {
    for (const fn of this._handlers[type] || []) {
      try { fn(...args); } catch (err) { console.error(`RemoteLink handler (${type}):`, err); }
    }
  }

  _connect() {
    if (this._closed) return;
    let ws;
    try { ws = new WebSocket(this.url); } catch (_) { this._scheduleRetry(); return; }
    this._ws = ws;
    ws.onopen = () => {
      this._retry = 0;
      this.connected = true;
      ws.send(JSON.stringify({ type: 'host' }));
      this._emit('status', true);
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch (_) { return; }
      switch (m && m.type) {
        case 'room':
          this.code = m.code;
          this._emit('room', m.code);
          break;
        case 'controller-connected':
          this.controllers.add(m.id);
          this.clientIds.set(m.id, m.clientId || null);
          this._emit('controller-connected', m.id, m.clientId || null);
          break;
        case 'controller-disconnected':
          this.controllers.delete(m.id);
          this.clientIds.delete(m.id);
          this._emit('controller-disconnected', m.id);
          break;
        case 'input':
          this._emit('input', m);
          break;
        default: break;
      }
    };
    ws.onclose = () => {
      if (this._ws !== ws) return;
      this._ws = null;
      const had = this.connected;
      this.connected = false;
      this.code = null;
      // controllers are gone with the room; tell listeners so the HUD/inputs reset
      for (const id of [...this.controllers]) { this.controllers.delete(id); this.clientIds.delete(id); this._emit('controller-disconnected', id); }
      if (had) this._emit('status', false);
      this._emit('room', null);
      this._scheduleRetry();
    };
    ws.onerror = () => { /* onclose follows */ };
  }

  /** Send `msg` to one controller (by connection id) through the server relay. */
  sendTo(id, msg) {
    if (!this._ws || !this.connected || this._ws.readyState !== 1) return false;
    try { this._ws.send(JSON.stringify({ type: 'to-controller', id, msg })); return true; } catch (_) { return false; }
  }

  _scheduleRetry() {
    if (this._closed || this._timer) return;
    const delay = Math.min(5000, 500 * 2 ** this._retry++);
    this._timer = setTimeout(() => { this._timer = null; this._connect(); }, delay);
  }

  close() {
    this._closed = true;
    clearTimeout(this._timer);
    if (this._ws) this._ws.close();
  }
}
