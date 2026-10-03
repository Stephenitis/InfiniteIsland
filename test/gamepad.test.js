import test from 'node:test';
import assert from 'node:assert/strict';
import { GamepadSource, gamecubePortEmpty } from '../public/js/input/gamepadSource.js';

// Readings captured from a Mayflash adapter (0079:1846) in Chrome on Windows.
const ID = 'GameCube Controller Adapter (Vendor: 0079 Product: 1846)';
const btns = (down = []) => Array.from({ length: 16 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 }));
const pad = (index, axes, down) => ({ index, id: ID, mapping: '', connected: true, axes: [...axes, 0, 0, 0, 1.29], buttons: btns(down) });
const EMPTY_ZERO = [0, 0, 0, -1, -1, 0];
const EMPTY_MID = [0.004, 0.004, 0.004, -1, -1, 0.004];
const EMPTY_CORNER = [1, -1, 0, -1, -1, 0];
const PLUGGED = [0.027, -0.01, 0.098, -0.784, -0.733, 0.059];

test('empty adapter ports are recognised, plugged controllers are not', () => {
  assert.equal(gamecubePortEmpty(pad(0, EMPTY_ZERO)), true);
  assert.equal(gamecubePortEmpty(pad(0, EMPTY_MID)), true);
  assert.equal(gamecubePortEmpty(pad(0, EMPTY_CORNER)), true);
  assert.equal(gamecubePortEmpty(pad(0, PLUGGED)), false);
  assert.equal(gamecubePortEmpty(pad(0, [0, 0, 0, -0.78, -0.75, 0])), false);   // resting triggers
  assert.equal(gamecubePortEmpty(pad(0, EMPTY_MID, [1])), false);                 // a button is down
});

test('pulling a controller from the adapter disconnects only that port', () => {
  const list = [pad(0, EMPTY_ZERO), pad(1, PLUGGED), pad(2, PLUGGED), pad(3, EMPTY_MID)];
  const hub = new GamepadSource({ addEventListener() {}, removeEventListener() {} });
  hub._read = () => list;
  const log = [];
  hub.on('connect', ({ index }) => log.push(`+${index}`)).on('disconnect', ({ index }) => log.push(`-${index}`));
  const info = console.info; console.info = () => {};
  try {
    hub.sync(0);
    assert.deepEqual([...hub.pads.keys()], [1, 2]);                 // empty ports never appear
    list[2] = pad(2, EMPTY_MID);
    hub.sync(100);
    assert.ok(hub.pads.has(2), 'a brief empty reading does not disconnect');
    hub.sync(600);
    assert.deepEqual([...hub.pads.keys()], [1]);
    list[0] = pad(0, PLUGGED);
    hub.sync(700);
    assert.deepEqual([...hub.pads.keys()].sort(), [0, 1]);
    assert.deepEqual(log, ['+1', '+2', '-2', '+0']);
  } finally {
    console.info = info;
  }
});
