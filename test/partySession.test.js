// Host-session how-to memory: first/repeat routing, close/reopen, safe snapshots and no persistence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PARTY } from '../public/js/config.js';
import { flowTick, newFlow, goTo, normalisePrefs } from '../public/js/game/party/flowLogic.js';
import { createPartyDomain, freshState, normaliseState, hashView } from '../public/js/game/party/partyDomain.js';
import { GAME_IDS } from '../public/js/game/party/registry.js';
import { WorldSync } from '../public/js/net/worldSync.js';
import { SlotTable } from '../public/js/players/slotTable.js';
import { pair } from './fixtures/partyPair.js';

test('pick defaults to a first how-to; an already shown game goes straight to countdown', () => {
  for (const [context, expected] of [[{}, 'howto'], [{ howtoSeen: false }, 'howto'], [{ howtoSeen: true }, 'countdown']]) {
    const flow = newFlow(); goTo(flow, 'pick');
    assert.equal(flowTick(flow, PARTY.flow.roulette - .1, context), null);
    assert.equal(flowTick(flow, .2, context), expected);
  }
});

test('all games show a how-to once per host session; natural and debug routing agree on replicas', () => {
  const p = pair(); p.host.open(); p.flush();
  for (const id of GAME_IDS) {
    p.host.debug.play(id); p.flush();
    assert.equal(p.host.state.phase, 'pick');
    assert.equal(p.host.state.seenHowto.includes(id), false, 'roulette is not a shown card');
    p.run(PARTY.flow.roulette + .1);
    assert.equal(p.host.state.phase, 'howto');
    assert.equal(p.host.state.seenHowto.includes(id), true); p.equal(id + ' first card');
    p.host.debug.play(id); p.flush(); p.run(PARTY.flow.roulette + .1);
    assert.equal(p.host.state.phase, 'countdown'); assert.ok(p.host.state.g); p.equal(id + ' repeat');
    p.host.debug.play(id); p.flush(); p.host.skip(); p.flush();
    assert.equal(p.host.state.phase, 'countdown'); p.equal(id + ' debug repeat');
  }
  assert.deepEqual(p.host.state.seenHowto, GAME_IDS);
});

test('skip first shows the card; close/open remembers it, including after closing on the card', () => {
  const p = pair(); p.host.open({ games: ['vineskip'] }); p.flush();
  p.host.skip(); p.flush(); assert.equal(p.host.state.phase, 'pick');
  assert.deepEqual(p.host.state.seenHowto, []);
  p.host.skip(); p.flush(); assert.equal(p.host.state.phase, 'howto');
  p.host.close(); p.flush(); assert.deepEqual(p.host.state.seenHowto, ['vineskip']); p.equal('closed');
  p.host.open({ games: ['vineskip'] }); p.flush();
  p.host.skip(); p.flush(); p.host.skip(); p.flush();
  assert.equal(p.host.state.phase, 'countdown'); p.equal('reopened repeat');
});

test('late replica snapshots retain the same session memory and hash', () => {
  const p = pair(); p.host.open(); p.host.debug.play('feastround'); p.host.skip(); p.flush();
  const lateSync = new WorldSync({ role: 'replica', wallNow: () => p.clock.ms });
  const late = createPartyDomain({ sync: lateSync, table: new SlotTable(4) });
  lateSync.receive({ type: 'snapshot', seq: p.hSync.seq, screenId: 'late', hostTime: p.clock.ms,
    domains: { party: JSON.parse(JSON.stringify(p.host.state)) } });
  assert.deepEqual(late.state.seenHowto, ['feastround']);
  assert.equal(lateSync.hash(), p.hSync.hash());
  assert.notDeepEqual(hashView(late.state), hashView({ ...late.state, seenHowto: [] }), 'memory is hashed');
});

test('snapshot memory accepts only known IDs, deduplicates in registry order and defaults safely', () => {
  const pref = normalisePrefs(null, GAME_IDS);
  assert.deepEqual(freshState(pref).seenHowto, []);
  for (const value of [null, {}, 'vineskip', 5]) assert.deepEqual(normaliseState({ seenHowto: value }, pref).seenHowto, []);
  assert.deepEqual(normaliseState({ seenHowto: ['bumpers', 'unknown', 'vineskip', 'bumpers', {}, null] }, pref).seenHowto, ['vineskip', 'bumpers']);
});

test('preferences never save the how-to memory and a new host domain forgets', () => {
  let saved = null;
  const prefs = { read: () => saved, write: value => { saved = JSON.parse(JSON.stringify(value)); } };
  const create = () => {
    let domain;
    const sync = { isHost: true, register: (_, d) => { domain = d; }, emit() {},
      request: (_, kind, data, actor) => domain.handleRequest(kind, data, actor, 'host') };
    return createPartyDomain({ sync, table: new SlotTable(4), prefs, rng: () => .5 });
  };
  const host = create(); host.open(); host.debug.play('bumpers'); host.skip();
  assert.deepEqual(host.state.seenHowto, ['bumpers']);
  host.setMode({ difficulty: 'normal' });
  assert.equal(Object.hasOwn(saved, 'seenHowto'), false);
  const second = create(); second.open(); second.debug.play('bumpers'); second.skip();
  assert.equal(second.state.phase, 'howto');
  assert.deepEqual(second.state.seenHowto, ['bumpers']);
});

// The screen must perform stage / prop setup even when the host skips the how-to phase entirely.
test('every repeated game resets all real Players at countdown, with Timber axes and no how-to / practice layer', async () => {
  const { makeRuntime } = await import('./fixtures/partyRuntime80d.js');
  const { stageCentre, stageSpawns } = await import('../public/js/game/party/partyArea.js');
  const r = makeRuntime(); r.pm.spawnDebugPlayer('repeat'); r.party.open({ games: GAME_IDS, bots: 0 });
  for (const id of GAME_IDS) {
    await r.party.play(id); r.run(8, () => r.party.state.phase === 'howto'); assert.equal(r.party.state.phase, 'howto');
    r.party.skip(); r.frame(); assert.equal(r.party.state.phase, 'countdown');
    for (const p of r.pm.list) p.position.x += 0.5;
    const stage = r.party.debug.stage(id), update = stage.update, modes = [];
    stage.update = (dt, ctx) => { modes.push(ctx.mode); return update(dt, ctx); };
    await r.party.play(id); let cardSeen = false;
    r.run(8, () => { cardSeen ||= r.party.state.phase === 'howto'; return r.party.state.phase === 'countdown'; });
    assert.equal(cardSeen, false, id); assert.equal(r.party.state.phase, 'countdown'); assert.equal(r.party.ui.summary().card, null);
    assert.equal(modes.includes('practice'), false, id); const centre = stageCentre(id), spots = stageSpawns(id, r.pm.list.length);
    for (const [i, p] of r.pm.list.entries()) {
      const q = id === 'bumpers' ? { x: centre.x + r.party.state.g.balls[p.index].x, z: centre.z + r.party.state.g.balls[p.index].z } : spots[i];
      assert.ok(Math.hypot(p.position.x - q.x, p.position.z - q.z) < 1e-6, id + ' player ' + p.index);
      assert.equal(p.parts.handSocket.children.length > 0, id === 'timber', id + ' right-hand props');
    }
    stage.update = update;
  }
  r.party.close(); r.run(4);
});
