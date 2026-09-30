// Comic-style dialog box: name tag, typewriter text, bouncing triangle when a page is done, multiple pages.
// Optional `onChar(char)` callback fires when typewriter text is revealed (used for the quiet text blips).
//
//   const dialog = new Dialog(hudRoot, { onOpen, onClose });
//   dialog.open({ name: 'Signpost', pages: ['Hello!', 'Second page'], owner: player, tag: 'P2', color: '#5fc4ff' });
//   dialog.handleInput(interactPressed, cancelPressed)   // call with the OWNER's presses while dialog.isOpen (it consumes them)
//   dialog.update(dt)                                    // typewriter
//   dialog.isOpen
//   dialog.owner                                         // the player who opened it (main.js routes only that player's input here and
//                                                        // freezes only that player); null while closed. Optional `tag` / `color` add a
//                                                        // small coloured "P2" badge to the name tag (multiplayer).
//
// Interact: if typing -> finish the page; else next page / close after the last. Cancel closes immediately.
// Clicking / tapping the box behaves like Interact.
const CHARS_PER_SEC = 46;

export class Dialog {
  constructor(root, { onOpen = null, onClose = null, onChar = null } = {}) {
    this.onChar = onChar;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.isOpen = false;
    this.owner = null;
    this.pages = [];
    this.page = 0;
    this._chars = 0;           // characters revealed on the current page
    this._text = '';
    this._acc = 0;
    this.pageDone = false;

    const el = document.createElement('div');
    el.className = 'hud-dialog';
    el.hidden = true;
    el.innerHTML = `
      <div class="hud-dialog-box">
        <div class="hud-dialog-name"><span class="hud-dialog-title"></span><span class="hud-dialog-tag" hidden></span></div>
        <div class="hud-dialog-text"><span class="on"></span><span class="off"></span></div>
        <div class="hud-dialog-next" aria-hidden="true"></div>
      </div>`;
    root.appendChild(el);
    this.el = el;
    this.nameEl = el.querySelector('.hud-dialog-name');
    this.titleEl = el.querySelector('.hud-dialog-title');
    this.tagEl = el.querySelector('.hud-dialog-tag');
    this.onEl = el.querySelector('.on');
    this.offEl = el.querySelector('.off');
    this.nextEl = el.querySelector('.hud-dialog-next');
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); if (this.isOpen) this.handleInput(true, false); });
  }

  open({ name = '', pages = [''], owner = null, tag = '', color = '' } = {}) {
    if (this.isOpen) return;
    this.pages = pages.slice();
    this.page = 0;
    this.owner = owner;
    this.titleEl.textContent = name;
    this.nameEl.hidden = !name;
    this.tagEl.hidden = !tag;
    this.tagEl.textContent = tag;
    if (color) this.tagEl.style.setProperty('--pc', color);
    this.isOpen = true;
    this.el.hidden = false;
    this.el.classList.remove('closing');
    void this.el.offsetWidth;
    this.el.classList.add('open');
    this._startPage();
    if (this.onOpen) this.onOpen(this);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('open');
    this.el.classList.add('closing');
    const el = this.el;
    const finish = () => { if (!this.isOpen) { el.hidden = true; el.classList.remove('closing'); } };
    el.addEventListener('animationend', finish, { once: true });
    setTimeout(finish, 300);
    if (this.onClose) this.onClose(this);      // (still knows its owner here)
    this.owner = null;
  }

  _startPage() {
    this._text = this.pages[this.page] || '';
    this._chars = 0;
    this._acc = 0;
    this.pageDone = false;
    this.nextEl.classList.remove('show');
    this._render();
  }

  _render() {
    // Spread by code points so emoji aren't cut in half.
    const chars = Array.from(this._text);
    this.onEl.textContent = chars.slice(0, this._chars).join('');
    this.offEl.textContent = chars.slice(this._chars).join('');
  }

  _finishPage() {
    this._chars = Array.from(this._text).length;
    this.pageDone = true;
    this.nextEl.classList.add('show');
    this._render();
  }

  /** Consume this frame's presses. Returns true if the dialog was open (and thus swallowed them). */
  handleInput(interactPressed, cancelPressed) {
    if (!this.isOpen) return false;
    if (cancelPressed) { this.close(); return true; }
    if (interactPressed) {
      if (!this.pageDone) this._finishPage();
      else if (this.page + 1 < this.pages.length) { this.page++; this._startPage(); }
      else this.close();
    }
    return true;
  }

  update(dt) {
    if (!this.isOpen || this.pageDone) return;
    const total = Array.from(this._text).length;
    this._acc += dt * CHARS_PER_SEC;
    const n = Math.floor(this._acc);
    if (n > 0) {
      this._acc -= n;
      const chars = Array.from(this._text);
      // brief pause on sentence punctuation for a bit of speech rhythm
      const before = this._chars;
      this._chars = Math.min(total, this._chars + n);
      const last = chars[this._chars - 1];
      if (this._chars > before && /[.!?]/.test(last) && this._chars < total) this._acc -= 6;
      if (this._chars > before && this.onChar && last && /\S/.test(last)) this.onChar(last);
      this._render();
      if (this._chars >= total) this._finishPage();
    }
  }
}
