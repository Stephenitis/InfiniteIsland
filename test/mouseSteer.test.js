// Mouse maths and source lifecycle; fake DOM targets exercise the real pointer listeners.
import test from 'node:test';
import assert from 'node:assert/strict';
import { steerFromHit, rayPlaneHit } from '../public/js/input/mouseSteer.js';
import { KeyboardSource } from '../public/js/input/keyboardSource.js';
import { InputManager } from '../public/js/input/inputManager.js';

const zero = { x: 0, y: 0 };
test('eight compass directions are full-speed source axes', () => {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const a = steerFromHit({ px: 3, pz: 5 }, { hx: 3 + dx, hz: 5 + dz }, { dead: 0.6 });
    assert.ok(Math.abs(Math.hypot(a.x, a.y) - 1) < 1e-12);
    assert.equal(Math.sign(a.x), Math.sign(dx));
    assert.equal(Math.sign(a.y), -Math.sign(dz) || 0);
  }
});
test('dead radius includes its boundary and rejects non-finite hits', () => {
  for (const hx of [0, 0.59, 0.6, NaN, Infinity]) assert.deepEqual(steerFromHit({ px: 0, pz: 0 }, { hx, hz: 0 }), zero);
  assert.deepEqual(steerFromHit({ px: 0, pz: 0 }, { hx: 0.601, hz: 0 }), { x: 1, y: 0 });
});
test('side mode uses only horizontal distance and never presses up or down', () => {
  for (const hz of [-100, 0, 100]) {
    assert.deepEqual(steerFromHit({ px: 0, pz: 0 }, { hx: 0.4, hz }, { dead: 0.4, side: true }), zero);
    assert.deepEqual(steerFromHit({ px: 0, pz: 0 }, { hx: -2, hz }, { dead: 0.4, side: true }), { x: -1, y: 0 });
  }
});
test('ray plane intersection accepts forward hits and rejects parallel, behind and invalid rays', () => {
  const o = { x: 1, y: 4, z: 2 }, d = { x: 2, y: -1, z: -3 };
  assert.deepEqual(rayPlaneHit(o, d, 1), { x: 7, y: 1, z: -7 });
  assert.equal(rayPlaneHit(o, d, 5), null);
  assert.equal(rayPlaneHit(o, { ...d, y: 0 }, 0), null);
  assert.equal(rayPlaneHit(o, { ...d, y: NaN }, 0), null);
  assert.equal(rayPlaneHit({ ...o, x: Infinity }, d, 0), null);
});
test('helpers reuse caller scratch objects', () => {
  const out = {}, hit = {};
  assert.equal(steerFromHit({ px: 0, pz: 0 }, { hx: 2, hz: 0 }, {}, out), out);
  assert.equal(rayPlaneHit({ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, 0, hit), hit);
});

class Target {
  constructor() { this.listeners = new Map(); this.classes = new Set(); this.classList = { remove: (c) => this.classes.delete(c) }; }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  fire(type, props = {}) { for (const fn of this.listeners.get(type) || []) fn({ type, target: this, preventDefault() {}, ...props }); }
  getBoundingClientRect() { return { left: 10, top: 20, width: 800, height: 600 }; }
  setPointerCapture(id) { this.capture = id; }
  releasePointerCapture(id) { assert.equal(id, this.capture); this.capture = null; }
}
function fixture(fn) {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  const win = globalThis.window = new Target(), doc = globalThis.document = new Target(), canvas = new Target();
  const k = new KeyboardSource(win); k.attachMouse(canvas);
  k.setSteer((x, y) => ({ x: x / 100, y: y / 100 }));
  const pointer = { pointerType: 'mouse', button: 0, buttons: 1, pointerId: 7, clientX: 110, clientY: 20 };
  try { fn({ k, canvas, win, doc, pointer }); } finally { k.dispose(); globalThis.window = oldWindow; globalThis.document = oldDocument; }
}
test('unused mouse preserves keyboard output, diagonals and tap latches', () => fixture(({ k, win }) => {
  assert.deepEqual(k.poll(), { x: 0, y: 0, interact: false, cancel: false, jump: false, interactTap: false, cancelTap: false, jumpTap: false, charm: false, charmTap: false });
  k.press('KeyW'); k.press('KeyD');
  assert.equal(k.poll().x, Math.SQRT1_2); assert.equal(k.poll().y, Math.SQRT1_2);
  win.fire('keydown', { code: 'Space' }); win.fire('keyup', { code: 'Space' });
  assert.equal(k.poll().jumpTap, true); assert.equal(k.poll().jump, false);
}));
test('mouse follows canvas pixels, capture and release; short clicks do not latch movement', () => fixture(({ k, canvas, pointer }) => {
  canvas.fire('pointerdown', pointer); assert.equal(canvas.capture, 7); assert.equal(k.poll().x, 1);
  canvas.fire('pointermove', { ...pointer, clientX: 60, clientY: 70 });
  assert.equal(k.poll().x, 0.5); assert.equal(k.poll().y, 0.5);
  canvas.fire('pointerup', pointer); assert.equal(k.poll().x, 0); assert.equal(canvas.capture, null);
  canvas.fire('pointerdown', pointer); canvas.fire('pointerup', pointer); assert.equal(k.poll().x, 0);
}));
test('touch, pen, other buttons and UI targets cannot steer or interrupt mouse capture', () => fixture(({ k, canvas, pointer }) => {
  for (const p of [{ pointerType: 'touch' }, { pointerType: 'pen' }, { button: 1 }, { button: 2 }, { target: new Target() }]) {
    canvas.fire('pointerdown', { ...pointer, ...p }); assert.equal(k.mouseHeld, false);
  }
  canvas.fire('pointerdown', pointer);
  canvas.fire('pointerup', { ...pointer, pointerType: 'touch' }); assert.equal(k.mouseHeld, true);
  canvas.fire('pointerup', { ...pointer, button: 2 }); assert.equal(k.mouseHeld, true);
}));
test('any movement key wins, including opposing keys; action keys work with mouse', () => fixture(({ k }) => {
  k.mouse(100, 0, true); k.press('KeyA'); k.press('KeyD'); assert.equal(k.poll().x, 0);
  k.release('KeyD'); assert.equal(k.poll().x, -1);
  k.release('KeyA'); k.press('Space'); k.press('KeyE'); k.press('KeyR'); k.press('Escape');
  const a = k.poll(); assert.equal(a.x, 1);
  for (const b of ['jump', 'interact', 'charm', 'cancel']) assert.equal(a[b], true);
}));
test('cancel, capture loss, blur, hidden document and releaseAll release mouse', () => fixture(({ k, canvas, win, doc, pointer }) => {
  for (const type of ['pointercancel', 'lostpointercapture']) { canvas.fire('pointerdown', pointer); canvas.fire(type, pointer); assert.equal(k.mouseHeld, false); }
  k.mouse(100, 0, true); win.fire('blur'); assert.equal(k.mouseHeld, false);
  k.mouse(100, 0, true); doc.hidden = true; doc.fire('visibilitychange'); assert.equal(k.mouseHeld, false);
  k.mouse(100, 0, true); k.releaseAll(); assert.equal(k.mouseHeld, false);
  canvas.fire('pointerdown', pointer); canvas.fire('pointermove', { ...pointer, buttons: 0 }); assert.equal(k.mouseHeld, false);
}));
test('blocking consumes held mouse and requires a new press', () => fixture(({ k }) => {
  k.setSteer(() => { k.releaseMouse(); return zero; }); k.mouse(100, 0, true); assert.equal(k.poll().x, 0);
  k.setSteer(() => ({ x: 1, y: 0 })); assert.equal(k.poll().x, 0);
  k.mouse(100, 0, true); assert.equal(k.poll().x, 1);
}));
test('mouse press at dead radius reports activity without movement or action buttons', () => fixture(({ k }) => {
  k.setSteer(() => zero); const input = new InputManager(); input.addSource('keyboard', k);
  k.mouse(0, 0, true); const a = input.update(); assert.equal(a.activity, true);
  assert.equal(a.move.x, 0); assert.equal(a.move.z, -0); assert.equal(a.interactPressed, false);
  k.releaseMouse(); assert.equal(input.update().activity, undefined);
}));
test('reattach and dispose remove pointer listeners and release capture', () => fixture(({ k, canvas, win, pointer }) => {
  canvas.fire('pointerdown', pointer); const next = new Target(); k.attachMouse(next);
  assert.equal(canvas.capture, null); canvas.fire('pointerdown', pointer); assert.equal(k.mouseHeld, false);
  next.fire('pointerdown', pointer); k.dispose(); assert.equal(next.capture, null);
  next.fire('pointerdown', pointer); assert.equal(k.mouseHeld, false);
  assert.equal(win.listeners.get('pointerup').size, 0);
}));
