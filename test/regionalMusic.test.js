import test from 'node:test';
import assert from 'node:assert/strict';
import { Music, getTrack, TRACK_TITLES, REGION_TRACKS } from '../public/js/audio/music.js';

test('regional playlists include two new original tracks each and keep the ritual theme isolated', () => {
  const prior = globalThis.document;
  globalThis.document = { addEventListener() {} };
  try {
    const music = new Music({ onChange() {} });
    music.setClock({ phase: 'day', nightness: 0, on() {} });
    for (const region of ['frost', 'ember', 'ritual']) {
      music.region = () => region;
      let after = -1;
      const heard = [];
      for (let i = 0; i < REGION_TRACKS[region].length * 2; i++) {
        after = music._chooseNext(after);
        heard.push(after);
      }
      assert.deepEqual(heard, [...REGION_TRACKS[region], ...REGION_TRACKS[region]]);
    }
    music.region = () => 'home';
    assert.equal(music._chooseNext(6), 0);
    assert.equal(music._chooseNext(0), 2);
    assert.equal(new Set(TRACK_TITLES).size, 11);
  } finally { globalThis.document = prior; }
});

test('new tracks have distinct melodies, finite notes and complete playable arrangements', () => {
  const signatures = new Set();
  for (let i = 6; i <= 10; i++) {
    const track = getTrack(i);
    assert.ok(track.steps * track.stepSec > 90);
    assert.ok(track.events.length > 180);
    assert.ok(track.events.some((e) => e.k === 'pad'));
    assert.ok(track.events.some((e) => e.k === 'bass'));
    let previous = -1;
    for (const event of track.events) {
      assert.ok(event.s >= previous && event.s < track.steps);
      previous = event.s;
      assert.ok(Number.isFinite(event.d) && event.d > 0);
      assert.ok(Number.isFinite(event.v) && event.v > 0 && event.v <= 1);
      for (const midi of Array.isArray(event.m) ? event.m : [event.m]) assert.ok(Number.isFinite(midi));
    }
    signatures.add(JSON.stringify(track.events.filter((e) => ['lead', 'marimba', 'bell'].includes(e.k)).map((e) => [e.s, e.m])));
  }
  assert.equal(signatures.size, 5);
  assert.ok(getTrack(6).events.some((e) => e.k === 'lead' && e.o.style === 'flute'));
});

test('area entry fades immediately, does not retrigger in the same area, and tracks movement while muted', () => {
  const prior = globalThis.document;
  globalThis.document = { addEventListener() {} };
  try {
    const music = new Music({ onChange() {} });
    let region = 'home';
    music.region = () => region;
    music.setClock({ phase: 'day', nightness: 0, on() {} });
    music.updateRegion();
    music._booted = true; music.ctx = { currentTime: 10 };
    music._idx = 0; music._state = 'playing'; music._seq = { old: true };
    const fades = [];
    music._retire = (seconds) => fades.push(seconds);
    region = 'ritual';
    assert.equal(music.updateRegion(), true);
    assert.equal(music._nextIdx, 6);
    assert.equal(music._state, 'gap');
    assert.equal(music._seq, null);
    assert.equal(music._gapUntil, 10.5);
    assert.equal(music.updateRegion(), false);
    assert.deepEqual(fades, [0.65]);
    music._enabled = false;
    region = 'frost';
    music.updateRegion();
    assert.equal(music._nextIdx, 4);
    region = 'ember';
    music.updateRegion();
    assert.equal(music._nextIdx, 5);
    region = 'home';
    music.updateRegion();
    assert.equal(music._nextIdx, 0);
  } finally { globalThis.document = prior; }
});
