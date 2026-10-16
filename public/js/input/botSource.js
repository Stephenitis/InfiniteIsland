// BotSource (Step 80a): an input source driven by code instead of a person, so a party bot is a REAL Player on the host whose "controller" is a brain. It implements the input contract (input/inputManager.js)
// exactly: `poll()` -> { x, y, interact, cancel, jump, charm, menu, interactTap, cancelTap, jumpTap, ... } with y up-positive, so physics, animation, sync and every game's rules treat a bot like a person
// (no cheating code paths). A game's bot(view, me, skill, rng) returns one frame of intent; the party runtime feeds it here.
//
//   const src = new BotSource();
//   src.intend({ x, y, interact, cancel, jump })   this frame's wishes: the stick (-1..1) and button presses. A button that is true for one frame is a TAP (an edge even if shorter than a frame), the way a quick thumb is
//   src.hold('interact', 1.2)                      hold a button down for 1.2 s (the how-to's "Ready!")
//   src.tick(dt)                                   once per frame (the runtime calls it before players.pollInput): ages the holds
//   src.release()                                  let everything go
//   src.poll()                                     what InputManager reads
export class BotSource {
  constructor() {
    this.name = 'bot';
    this.analog = true;
    this.x = 0; this.y = 0;
    this._holds = { interact: 0, cancel: 0, jump: 0 };          // seconds left
    this._taps = { interact: false, cancel: false, jump: false };
  }

  intend(i = {}) {
    this.x = Number.isFinite(i.x) ? Math.max(-1, Math.min(1, i.x)) : 0;
    this.y = Number.isFinite(i.y) ? Math.max(-1, Math.min(1, i.y)) : 0;
    for (const b of ['interact', 'cancel', 'jump']) if (i[b]) this._taps[b] = true;
  }

  hold(button, secs) { if (button in this._holds) this._holds[button] = Math.max(this._holds[button], secs); }
  tick(dt) { for (const b in this._holds) if (this._holds[b] > 0) this._holds[b] = Math.max(0, this._holds[b] - dt); }
  release() { this.x = this.y = 0; for (const b in this._holds) this._holds[b] = 0; for (const b in this._taps) this._taps[b] = false; }

  poll() {
    const t = this._taps;
    const out = {
      x: this.x, y: this.y,
      interact: this._holds.interact > 0, cancel: this._holds.cancel > 0, jump: this._holds.jump > 0, charm: false, menu: false,
      interactTap: t.interact, cancelTap: t.cancel, jumpTap: t.jump, charmTap: false, menuTap: false,
    };
    t.interact = t.cancel = t.jump = false;
    return out;
  }
}
