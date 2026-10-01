// "Connect a phone" panel: QR code + URL + room code tiles + connected controllers. Opens from the round HUD phone
// button or the P key; closes on Cancel (any input), Escape (mapped to cancel), P, the X button or a backdrop click.
//
//   const panel = new PairPanel(hudRoot, { onOpen, onClose, canOpen, controllerOnly });
//   The QR opens controller.html, which first asks "Use as controller" or "Play on this phone" (Step 23). `controllerOnly` (a joined
//   replica screen: the phone can only be a controller for THIS screen) adds &as=controller to skip the choice.
//   panel.setRoom(code | null);  panel.setControllers([{ key, label: 'P2' | null, color, away }]);  panel.handleInput(interactPressed, cancelPressed)
//   panel.isOpen
// The QR is generated in the browser (qrcode-generator from a CDN); if that fails the URL + code are still shown.
import { PHONE_SVG } from './icons.js';
import { getTransport, loadScript, QRCODE_URL } from '../net/transport.js';
export { PHONE_SVG };

export class PairPanel {
  constructor(root, { onOpen = null, onClose = null, canOpen = null, controllerOnly = false } = {}) {
    this.controllerOnly = controllerOnly;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.canOpen = canOpen;
    this.isOpen = false;
    this.code = null;
    this.controllers = [];
    this.base = location.origin;
    this.ws = getTransport() === 'ws';
    this._qrUrl = '';
    this._qrFailed = false;

    // ---- round HUD button (top-right)
    const btn = this.button = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hud-phone-btn';
    btn.title = 'Connect a phone (P)';
    btn.setAttribute('aria-label', 'Connect a phone');
    btn.innerHTML = PHONE_SVG;
    btn.addEventListener('click', () => this.toggle());
    root.appendChild(btn);

    // ---- modal
    const el = this.el = document.createElement('div');
    el.className = 'pair-backdrop';
    el.hidden = true;
    el.innerHTML = `
      <div class="pair-card" role="dialog" aria-label="Connect a phone">
        <button type="button" class="pair-close" aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6 L18 18 M18 6 L6 18" stroke="#2b2340" stroke-width="4" stroke-linecap="round"/></svg>
        </button>
        <h2 class="pair-title"><span class="pair-title-icon">${PHONE_SVG}</span> Connect a phone</h2>
        <div class="pair-body">
          <div class="pair-qr"><img alt="QR code to open the controller" width="200" height="200" hidden><div class="pair-connecting">Connecting…</div><div class="pair-noqr">QR unavailable.<br>Use the link &rarr;</div></div>
          <div class="pair-info">
            <div class="pair-label pair-lead">${controllerOnly
              ? 'Scan to use your phone as a controller for this screen'
              : 'Scan to join: use your phone as a controller, or play on it with your own camera'}</div>
            <div class="pair-label">or open</div>
            <div class="pair-url">…</div>
            <div class="pair-label">and type the room code</div>
            <div class="pair-code"></div>
            <div class="pair-hint">${this.ws ? 'Phone must be on the same Wi-Fi' : 'Works over any Wi-Fi or mobile data'}</div>
          </div>
        </div>
        <div class="pair-controllers"></div>
      </div>`;
    root.appendChild(el);
    this.qrImg = el.querySelector('.pair-qr img');
    this.qrBox = el.querySelector('.pair-qr');
    this.urlEl = el.querySelector('.pair-url');
    this.codeEl = el.querySelector('.pair-code');
    this.listEl = el.querySelector('.pair-controllers');
    el.querySelector('.pair-close').addEventListener('click', () => this.close());
    el.addEventListener('pointerdown', (e) => { if (e.target === el) this.close(); });

    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyP' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target && e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA') return;
      this.toggle();
    });

    this._render();
    this._loadInfo();
  }

  async _loadInfo() {
    // Only the local Node server has /api/info; on localhost use its LAN URL so a phone can reach it.
    if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname)) return;
    try {
      const r = await fetch('/api/info', { cache: 'no-store' });
      if (!r.ok) return;
      const info = await r.json();
      this.base = (info.lanUrls && info.lanUrls[0]) || location.origin;
    } catch (_) { /* keep location.origin */ }
    this._render();
  }

  get url() {
    return this.code ? `${this.base}/controller.html?room=${this.code}${this.ws ? '&transport=ws' : ''}${this.controllerOnly ? '&as=controller' : ''}` : '';
  }

  /** Render the QR as a crisp inline SVG (dark outline colour on white, 2-module quiet zone). */
  async _renderQr(url) {
    if (url === this._qrUrl) return;
    this._qrUrl = url;
    try {
      await loadScript(QRCODE_URL);
      if (this._qrUrl !== url) return;         // room changed while the library loaded
      const qr = window.qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      const n = qr.getModuleCount();
      const q = 2;
      let d = '';
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (!qr.isDark(r, c)) continue;
          let run = 1;
          while (c + run < n && qr.isDark(r, c + run)) run++;
          d += `M${c + q} ${r + q}h${run}v1h-${run}z`;
          c += run - 1;
        }
      }
      const size = n + q * 2;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
        `<rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#2b2340"/></svg>`;
      this.qrImg.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      this.qrImg.hidden = false;
      this.qrBox.classList.remove('noqr');
    } catch (err) {
      console.warn('QR generation unavailable:', err && err.message);
      if (this._qrUrl === url) { this._qrUrl = ''; this.qrImg.hidden = true; this.qrBox.classList.add('noqr'); }
    }
  }

  setRoom(code) { this.code = code || null; this._render(); }
  /** Phones currently connected, e.g. [{ key, label: 'P2', color: '#5fc4ff' }] (label null = connected but not playing yet). */
  setControllers(list) { this.controllers = [...list]; this._renderList(); }

  toggle() { this.isOpen ? this.close() : this.open(); }

  open() {
    if (this.isOpen) return;
    if (this.canOpen && !this.canOpen()) return;
    this.isOpen = true;
    this.el.hidden = false;
    this.el.classList.remove('closing');
    void this.el.offsetWidth;
    this.el.classList.add('open');
    this.button.classList.add('on');
    if (this.onOpen) this.onOpen(this);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('open');
    this.el.classList.add('closing');
    this.button.classList.remove('on');
    const el = this.el;
    setTimeout(() => { if (!this.isOpen) { el.hidden = true; el.classList.remove('closing'); } }, 200);
    if (this.onClose) this.onClose(this);
  }

  /** While open the panel owns interact/cancel. Returns true when it consumed the frame's presses. */
  handleInput(interactPressed, cancelPressed) {
    if (!this.isOpen) return false;
    if (cancelPressed) this.close();
    return true;
  }

  _render() {
    const url = this.url;
    this.qrBox.classList.toggle('waiting', !url);
    if (url) {
      this._renderQr(url);
      this._setUrl(url.replace(/^https?:\/\//, ''));
    } else {
      this._qrUrl = '';
      this.qrImg.hidden = true;
      this.qrImg.removeAttribute('src');
      this.qrBox.classList.remove('noqr');
      this._setUrl(`${this.base.replace(/^https?:\/\//, '')}/controller.html`);
    }
    this.codeEl.innerHTML = '';
    const letters = this.code ? this.code.split('') : ['·', '·', '·', '·'];
    letters.forEach((ch, i) => {
      const tile = document.createElement('span');
      tile.className = 'pair-tile';
      tile.style.setProperty('--i', i);
      tile.textContent = ch;
      this.codeEl.appendChild(tile);
    });
    this._renderList();
  }

  /** Show the URL with soft line-break points after / and ? so it wraps at sensible places. */
  _setUrl(text) {
    this.urlEl.textContent = '';
    text.split(/(?<=[/?])/).forEach((part) => {
      this.urlEl.append(part, document.createElement('wbr'));
    });
  }

  _renderList() {
    this.listEl.innerHTML = '';
    if (!this.controllers.length) {
      const e = document.createElement('span');
      e.className = 'pair-empty';
      e.textContent = 'No phones connected yet';
      this.listEl.appendChild(e);
      return;
    }
    for (const c of this.controllers) {
      const chip = document.createElement('span');
      chip.className = 'pair-chip' + (c.away ? ' away' : '');
      if (c.color) chip.style.setProperty('--pc', c.color);
      // "P2 · phone" once the phone drives a player; until it gives input it just says it is connected
      chip.innerHTML = c.label
        ? `${PHONE_SVG}<b class="pair-player">${c.label}</b> · phone${c.away ? ' (reconnecting…)' : ''}`
        : `${PHONE_SVG}<b>Phone</b> · press a button to join`;
      this.listEl.appendChild(chip);
    }
  }
}
