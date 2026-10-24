import { test } from 'node:test';
import assert from 'node:assert/strict';
import { personalCharacter, personalSave, parsePersonalSave, createProfileStore } from '../src/profiles/model.js';

test('character serialization drops shared state, owner claims, arbitrary metadata and untrusted appearance', () => {
  const source = { variant: 'sunny', display_name: '  Hello\u0000 ', owner_id: 'other', inventory: { wood: 99 }, save_data: { admin: true }, appearance: { shirt: '#e0aaff', hat: 'url(evil)', role: 'admin' } };
  assert.deepEqual(personalSave(source), { version: 1, character: { variant: 'sunny', display_name: 'Hello', appearance: { shirt: '#e0aaff' } } });
  assert.equal([...personalCharacter({ display_name: '😀'.repeat(80) }).display_name].length, 32);
  assert.equal(personalCharacter({ variant: 'admin' }).variant, 'original');
  assert.throws(() => parsePersonalSave('{"world":{}}'));
  assert.throws(() => parsePersonalSave('x'.repeat(4097)));
  assert.deepEqual(parsePersonalSave(JSON.stringify(personalSave(source))), personalSave(source));
});
function fakeClient({ session = null, anonymousError = null, confirmed = false } = {}) {
  const calls = []; let current = session;
  const user = { id: 'owner', is_anonymous: !confirmed, email_confirmed_at: confirmed ? 'today' : null };
  const rows = [{ id: 'character', owner_id: 'owner', variant: 'pip', display_name: 'Pip' }, { id: 'foreign', owner_id: 'other', variant: 'sunny', display_name: 'Other' }];
  const query = { select(...args) { calls.push(['select', ...args]); return this; }, eq(...args) { calls.push(['eq', ...args]); return this; }, order() { return this; }, async limit() { return { data: rows, error: null }; }, async single() { return { data: rows[0], error: null }; }, insert(value) { calls.push(['insert', value]); return this; }, update(value) { calls.push(['update', value]); return this; } };
  const client = { from(table) { calls.push(['from', table]); return query; }, auth: {
    async getSession() { calls.push(['getSession']); return { data: { session: current }, error: null }; },
    async getUser() { calls.push(['getUser']); return { data: { user }, error: null }; },
    async signInAnonymously() { calls.push(['anonymous']); current = { user }; return { data: { session: current, user }, error: anonymousError }; },
    async updateUser(value) { calls.push(['updateUser', value]); return { data: { user }, error: null }; },
  } };
  return { client, calls };
}

test('listing while signed out never creates a guest; saving explicitly creates one and writes owner-bound personal data', async () => {
  const { client, calls } = fakeClient(), store = createProfileStore(client);
  assert.deepEqual(await store.list(), []); assert.equal(calls.some(([op]) => op === 'anonymous'), false);
  await store.save({ variant: 'pip', display_name: 'Pip', world: { coins: 99 } });
  assert.equal(calls.filter(([op]) => op === 'anonymous').length, 1);
  const insert = calls.find(([op]) => op === 'insert')[1];
  assert.equal(insert.owner_id, 'owner'); assert.equal(insert.save_data.world, undefined);
  const listed = await store.list(); assert.equal(listed.length, 1); assert.equal(listed[0].id, 'character');
  assert.ok(calls.some(([op, key, value]) => op === 'eq' && key === 'owner_id' && value === 'owner'));
  calls.length = 0; await store.save({ variant: 'pip' }, 'character');
  assert.ok(calls.some(([op, key, value]) => op === 'eq' && key === 'id' && value === 'character'));
  assert.ok(calls.some(([op, key, value]) => op === 'eq' && key === 'owner_id' && value === 'owner'));
});

test('guest protection links existing identity without signUp, and requires verified email before setting a password', async () => {
  const guest = fakeClient(), store = createProfileStore(guest.client);
  await store.linkEmail(' friend@example.com ');
  assert.deepEqual(guest.calls.find(([op]) => op === 'updateUser')[1], { email: 'friend@example.com' });
  await assert.rejects(() => store.setPassword('long-enough-password'), /Verify your email first/);
  const verified = fakeClient({ session: { user: {} }, confirmed: true });
  await createProfileStore(verified.client).setPassword('long-enough-password');
  assert.deepEqual(verified.calls.find(([op]) => op === 'updateUser')[1], { password: 'long-enough-password' });
});

test('disabled guest authentication fails with a local backup route, without inserting a cloud row', async () => {
  const { client, calls } = fakeClient({ anonymousError: new Error('disabled') });
  await assert.rejects(() => createProfileStore(client).save({ variant: 'original' }), /Download a copy/);
  assert.equal(calls.some(([op]) => op === 'insert'), false);
});

test('whimsical carry choices survive character backups while weapon claims and arbitrary appearance stay out', () => {
  for (const heldProp of ['none', 'lantern', 'torch', 'flower', 'pinwheel', 'umbrella']) {
    const source = { variant: 'clover', display_name: 'Fern', appearance: { heldProp, shirt: '#99bb88', damage: 999, tool: 'axe', owner_id: 'someone' }, world: { inventory: ['axe'] } };
    const snapshot = personalSave(source), restored = parsePersonalSave(JSON.stringify(snapshot));
    assert.deepEqual(restored.character.appearance, { heldProp, shirt: '#99bb88' });
    assert.equal(restored.character.world, undefined); assert.equal(restored.character.inventory, undefined);
    assert.deepEqual(personalCharacter(JSON.parse(JSON.stringify(restored.character))), restored.character, 'same whitelist survives local preference JSON');
  }
  for (const heldProp of ['axe', 'sword', 'script', { id: 'torch' }, null]) {
    assert.equal(personalCharacter({ appearance: { heldProp } }).appearance.heldProp, undefined);
  }
  assert.deepEqual(personalCharacter({ variant: 'original' }).appearance, {}, 'old characters remain empty-handed');
});

test('explicit cloud save stores the selected prop in owner-bound appearance and personal backup only', async () => {
  const { client, calls } = fakeClient({ session: { user: { id: 'owner' } } });
  await createProfileStore(client).save({ variant: 'rowan', appearance: { heldProp: 'lantern', gameplayPower: 100 }, inventory: { logs: 900 } });
  const payload = calls.find(([op]) => op === 'insert')[1];
  assert.equal(payload.owner_id, 'owner');
  assert.deepEqual(payload.appearance, { heldProp: 'lantern' });
  assert.deepEqual(payload.save_data.character.appearance, { heldProp: 'lantern' });
  assert.equal(payload.inventory, undefined);
  assert.equal(calls.some(([op]) => op === 'anonymous'), false, 'existing sessions are retained');
});
