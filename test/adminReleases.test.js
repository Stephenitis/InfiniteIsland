import test from 'node:test';
import assert from 'node:assert/strict';
import { publishedReleaseHistory, RELEASES } from '../src/admin/releases.js';

test('published history only describes current or earlier builds and cannot add feature announcements', () => {
  const rows = publishedReleaseHistory([
    { version: '0.83.0', title: 'Now', changes: ['Ready'], noteworthy: true, features: [{ key: 'future' }] },
    { version: '0.82.3', title: 'Earlier' }, { version: '0.84.0', title: 'Future' }, { version: 'garbage' }, null,
  ]);
  assert.deepEqual(rows.map((r) => r.version), ['0.83.0', '0.82.3']);
  assert.equal(rows[0].features, undefined); assert.equal(rows[0].noteworthy, undefined);
  assert.equal(RELEASES[0].version, '0.83.0'); assert.deepEqual(publishedReleaseHistory(null), []);
});
test('public release data stays bounded and links reject executable or credential-bearing URLs', () => {
  const rows = publishedReleaseHistory([{ version: '0.83.0', changes: ['<script>text only</script>', 42], github_url: 'javascript:alert(1)', deployment_url: 'https://user:secret@example.com', published_at: 'invalid' },
    { version: '0.82.3', commit_sha: 'a'.repeat(40), deployment_url: 'https://example.vercel.app', published_at: '2026-10-24T00:00:00Z' }]);
  assert.equal(rows[0].github, null); assert.equal(rows[0].deployment, null); assert.equal(rows[0].date, null);
  assert.deepEqual(rows[0].changes, ['<script>text only</script>']);
  assert.match(rows[1].github, /github.com\/Stephenitis\/InfiniteIsland\/commit\//); assert.equal(rows[1].deployment, 'https://example.vercel.app/');
});
