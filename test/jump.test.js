// Step 47: the Jump button's input contract (InputManager edges / taps, keyboard Space, gamepad profiles, phone protocol back-compat).
import test from 'node:test';
import assert from 'node:assert/strict';
import { InputManager } from '../public/js/input/inputManager.js';
import { KeyboardSource } from '../public/js/input/keyboardSource.js';
import { GamepadSource, PROFILES } from '../public/js/input/gamepadSource.js';
import { RemoteSource } from '../public/js/input/remoteSource.js';

const scripted = (...frames) => { let i = 0; return { analog: true, poll: () => frames[Math.min(i++, frames.length - 1)] }; };

test('jump press edge fires once per hold and jumpHeld follows the button', () => {
  const m = new InputManager();
  m.addSource('s', scripted({ jump: false }, { jump: true }, { jump: true }, { jump: false }, { jump: true }));
  const seen = [];
  for (let i = 0; i < 5; i++) { const s = m.update(); seen.push([s.jumpPressed, s.jumpHeld]); }
  assert.deepEqual(seen, [[false, false], [true, true], [false, true], [false, false], [true, true]]);
});

test('jumpTap latches a sub-frame tap, even when the button was already down', () => {
  const m = new InputManager();
  m.addSource('s', scripted({ jump: false, jumpTap: true }, { jump: true, jumpTap: true }, { jump: true, jumpTap: true }));
  assert.equal(m.update().jumpPressed, true);        // tap that came and went
  assert.equal(m.update().jumpPressed, true);        // held + a fresh tap
  assert.equal(m.update().jumpPressed, true);        // another fresh tap while held
});

test('jump is independent of interact / cancel; sources without jump report false', () => {
  const m = new InputManager();
  m.addSource('s', scripted({ interact: true }, { cancel: true }, { jump: true }));
  let s = m.update();
  assert.deepEqual([s.interactPressed, s.cancelPressed, s.jumpPressed, s.jumpHeld], [true, false, false, false]);
  s = m.update();
  assert.deepEqual([s.interactPressed, s.cancelPressed, s.jumpPressed, s.cancelHeld], [false, true, false, true]);
  s = m.update();
  assert.deepEqual([s.interactPressed, s.cancelPressed, s.jumpPressed, s.cancelHeld], [false, false, true, false]);
});

test('a jump press alone marks its source as the active one', () => {
  const m = new InputManager({ activeSource: 'keyboard' });
  m.addSource('keyboard', scripted({}));
  m.addSource('pad', scripted({ jump: true }));
  assert.equal(m.update().activeSource, 'pad');
});

test('keyboard: Space is Jump (held + tap latch), not Interact; E and Enter stay Interact', () => {
  const listeners = [];
  const target = { addEventListener(t, f) { listeners.push([t, f]); }, removeEventListener() {} };
  const prevWindow = globalThis.window, prevDoc = globalThis.document;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.document = { addEventListener() {}, removeEventListener() {}, hidden: false };
  try {
    const k = new KeyboardSource(target);
    const down = listeners.find(([t]) => t === 'keydown')[1];
    const up = listeners.find(([t]) => t === 'keyup')[1];
    let prevented = false;
    down({ code: 'Space', preventDefault() { prevented = true; }, target: {} });
    up({ code: 'Space', target: {} });                       // tapped and released between polls
    assert.equal(prevented, true, 'Space stays in the preventDefault set');
    let p = k.poll();
    assert.equal(p.jump, true); assert.equal(p.jumpTap, true);
    assert.equal(p.interact, false); assert.equal(p.interactTap, false);
    p = k.poll();
    assert.equal(p.jump, false); assert.equal(p.jumpTap, false);
    k.press('Space');
    p = k.poll();
    assert.equal(p.jump, true); assert.equal(p.interact, false);
    k.releaseAll();
    for (const code of ['KeyE', 'Enter', 'NumpadEnter']) {
      k.press(code);
      p = k.poll();
      assert.equal(p.interact, true, code); assert.equal(p.jump, false, code);
      k.release(code);
    }
    k.dispose();
  } finally {
    globalThis.window = prevWindow; globalThis.document = prevDoc;
  }
});

// ---- gamepad profiles
const GC_ID = 'GameCube Controller Adapter (Vendor: 0079 Product: 1846)';
const btns = (down = []) => Array.from({ length: 16 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 }));
const read = (pad) => {
  const hub = new GamepadSource({ addEventListener() {}, removeEventListener() {} });
  hub._read = () => [pad];
  const info = console.info; console.info = () => {};
  try { hub.sync(0); } finally { console.info = info; }
  return { ...hub.view(pad.index).poll() };
};
const standard = (down) => ({ index: 0, id: 'Xbox Controller', mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: btns(down) });
const gamecube = (down) => ({ index: 0, id: GC_ID, mapping: '', connected: true, axes: [0.027, -0.01, 0.098, -0.784, -0.733, 0.059, 0, 0, 0, 1.29], buttons: btns(down) });

test('profiles list their jump buttons', () => {
  assert.deepEqual(PROFILES.standard.jump, [2, 3]);
  assert.deepEqual(PROFILES.gamecube.jump, [0, 3]);
});

test('standard pad: X (2) and Y (3) jump, A / B do not', () => {
  assert.equal(read(standard([2])).jump, true);
  assert.equal(read(standard([3])).jump, true);
  const a = read(standard([0])), b = read(standard([1]));
  assert.deepEqual([a.interact, a.cancel, a.jump], [true, false, false]);
  assert.deepEqual([b.interact, b.cancel, b.jump], [false, true, false]);
  const x = read(standard([2]));
  assert.deepEqual([x.interact, x.cancel], [false, false]);
});

test('GameCube adapter: X (0) and Y (3) jump, A (1) / B (2) keep their meaning', () => {
  for (const i of [0, 3]) {
    const o = read(gamecube([i]));
    assert.deepEqual([o.interact, o.cancel, o.jump], [false, false, true], `button ${i}`);
  }
  assert.deepEqual(['interact', 'cancel', 'jump'].map((k) => read(gamecube([1]))[k]), [true, false, false]);
  assert.deepEqual(['interact', 'cancel', 'jump'].map((k) => read(gamecube([2]))[k]), [false, true, false]);
});

test('a GameCube port is not "empty" while X is held, so jumping never disconnects the pad', () => {
  const hub = new GamepadSource({ addEventListener() {}, removeEventListener() {} });
  const empty = { index: 0, id: GC_ID, mapping: '', connected: true, axes: [0, 0, 0, -1, -1, 0, 0, 0, 0, 1.29], buttons: btns([0]) };
  hub._read = () => [empty];
  const info = console.info; console.info = () => {};
  try { hub.sync(0); } finally { console.info = info; }
  assert.equal(hub.pads.size, 1);
});

// ---- phone protocol
const fakeLink = () => {
  const h = {};
  return { on(t, f) { h[t] = f; }, emit(t, ...a) { h[t](...a); } };
};

test('remote: jump rides the input packet; packets without jump (old controller pages) read false', () => {
  const link = fakeLink();
  const remote = new RemoteSource(link);
  link.emit('controller-connected', 1, 'abc');
  const v = remote.view('c-abc');
  link.emit('input', { id: 1, clientId: 'abc', x: 0, y: 0, interact: false, cancel: false });       // old page: no jump field
  let p = v.poll();
  assert.equal(p.jump, false); assert.equal(p.jumpTap, false);
  link.emit('input', { id: 1, clientId: 'abc', x: 0, y: 0, interact: false, cancel: false, jump: true });
  link.emit('input', { id: 1, clientId: 'abc', x: 0, y: 0, interact: false, cancel: false, jump: false });   // down + up between polls
  p = v.poll();
  assert.equal(p.jumpTap, true, 'the down edge is latched');
  assert.equal(p.jump, true);
  p = v.poll();
  assert.equal(p.jumpTap, false); assert.equal(p.jump, false);
  link.emit('input', { id: 1, clientId: 'abc', x: 0, y: 0, interact: false, cancel: false, jump: true });
  p = v.poll(); p = v.poll();
  assert.equal(p.jump, true, 'held jump stays held');
  assert.equal(p.jumpTap, false);
  link.emit('input', { id: 1, clientId: 'abc', x: 0, y: 0, interact: true, cancel: false });         // old page again: jump released
  p = v.poll();
  assert.equal(p.jump, false); assert.equal(p.interact, true);
});

test('remote.inject takes jump too', () => {
  const remote = new RemoteSource(fakeLink());
  remote.inject('c-fake', { jump: true });
  const v = remote.view('c-fake');
  assert.equal(v.poll().jump, true);
  remote.inject('c-fake', {});
  assert.equal(v.poll().jump, false);
});
