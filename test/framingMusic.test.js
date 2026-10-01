import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FollowCamera } from '../public/js/camera/followCamera.js';
import { Music } from '../public/js/audio/music.js';
import { CAMERA_FOV } from '../public/js/config.js';

test('portrait touch framing preserves the desktop horizontal field of view', () => {
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 16 / 9, 0.1, 400);
  const follow = new FollowCamera(camera);
  follow.touch = true;
  const desktopWidth = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)) * (16 / 9);
  for (const [w, h] of [[320, 568], [375, 812], [430, 932], [812, 375], [768, 1024]]) {
    follow.resize(w, h);
    const width = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect * follow.framingZoom;
    assert.ok(width >= desktopWidth - 1e-8, `${w}x${h}: horizontal view became narrower`);
    assert.ok(camera.fov <= 100.00001, 'vertical FOV remains capped');
  }
});

test('next music track uses the current day or night pool and dawn prefers Morning Breeze', () => {
  const prior = globalThis.document;
  globalThis.document = { addEventListener() {} };
  try {
    const music = new Music({ onChange() {} });
    let phaseListener;
    const clock = { phase: 'day', nightness: 0, on(_type, fn) { phaseListener = fn; } };
    music.setClock(clock);
    assert.equal(music._chooseNext(0), 2); // Island Stroll
    assert.equal(music._chooseNext(2), 1); // Tide Pools
    clock.nightness = 1;
    assert.equal(music._chooseNext(1), 3); // Campfire Evening
    assert.equal(music._chooseNext(3), 1);
    clock.nightness = 0.2;
    phaseListener('dawn');
    assert.equal(music._chooseNext(3), 0);
    assert.equal(music._chooseNext(0), 2);
  } finally {
    globalThis.document = prior;
  }
});
