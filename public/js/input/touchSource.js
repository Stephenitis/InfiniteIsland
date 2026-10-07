// On-screen touch controls for when the game page itself runs on a touch device (or with ?touch for testing).
// Mounts the shared TouchControls widget inside the HUD and exposes it as an input source.
import { TouchControls } from '../ui/touchControls.js';

export function wantsTouch() {
  try {
    return new URLSearchParams(location.search).has('touch') || window.matchMedia('(pointer: coarse)').matches;
  } catch (_) { return false; }
}

export class TouchSource {
  constructor(container) {
    this.name = 'touch';
    this.analog = true;
    this.widget = new TouchControls(container);
  }

  poll() {
    const s = this.widget.state;
    const t = this.widget.takeTaps();
    return { x: s.x, y: s.y, interact: s.interact || t.interactTap, cancel: s.cancel || t.cancelTap, jump: s.jump || t.jumpTap,
      charm: s.charm || t.charmTap, interactTap: t.interactTap, cancelTap: t.cancelTap, jumpTap: t.jumpTap, charmTap: t.charmTap };
  }
}
