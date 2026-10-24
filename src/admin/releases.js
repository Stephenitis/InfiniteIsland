// Newest first. Keep historical entries; only noteworthy releases auto-open.
export const RELEASES = [{
  version: '0.83.0', title: 'Campfire & World Editor', noteworthy: true,
  features: [
    { key: 'cameraMode', label: 'Follow camera' },
    { key: 'musicTempo', label: 'Music tempo' },
    { key: 'butterflies', label: 'Calmer butterflies' },
    { key: 'intro', label: 'Island fly-in' },
  ],
  changes: [
    'Choose your appearance at the starting campfire. The other friends stay nearby with occasional greetings.',
    'Preview lighting, atmosphere, water, sound and camera settings in the world editor.',
    'Compare three live desktop and mobile views together, and export or import your settings.',
    'Try a smooth follow camera and an opening view of the island.',
    'Enjoy smoother ground shading, calmer butterflies and adjustable music tempo.',
    'Explore pastel autumn trees, varied grass, a smoother stream inlet and a furnished campsite.',
    'Carry a lantern, torch, daisy, pinwheel or umbrella as a cosmetic accessory.',
    'Open independent editor categories and roomy release notes with readable pages on phones.',
    'See the time of day on a subtle sun-and-moon bar. A shared glass dock keeps character, backpack and journal shortcuts available while switching panels.',
    'Rest in sleeping bags at night: the host can bring the shared world to morning when its clock is running.',
    'Hear a gentler opening tune and discover rare, softly twinkling firefly gatherings at night.',
  ],
  note: 'Shared publishing requires a configured database and an admin account. Local previews work without either.',
}];

export const RELEASE_SEEN_KEY = 'infiniteIsland.adminReleaseSeen.v1';

// Database history is optional public release metadata, never a source of executable features.
export function publishedReleaseHistory(rows, currentVersion = RELEASES[0].version) {
  const versionParts = (value) => typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value) ? value.split('.').map(Number) : null;
  const current = versionParts(currentVersion);
  const safeLink = (value) => {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
  };
  return (Array.isArray(rows) ? rows : []).slice(0, 20).flatMap((row) => {
    const version = versionParts(row?.version);
    if (!current || !version) return [];
    let compare = 0;
    for (let i = 0; i < 3; i++) if (version[i] !== current[i]) { compare = version[i] - current[i]; break; }
    if (compare > 0) return []; // A different deployment must not announce features in this running build.
    const text = (value, length) => typeof value === 'string' ? value.slice(0, length) : '';
    const date = row.deployed_at || row.published_at;
    return [{ version: row.version, title: text(row.title, 160),
      changes: (Array.isArray(row.changes) ? row.changes : []).filter((v) => typeof v === 'string').slice(0, 30).map((v) => v.slice(0, 1000)),
      note: text(row.note, 1500), date: typeof date === 'string' && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : null,
      github: safeLink(row.github_url) || (/^[a-f0-9]{40,64}$/.test(row.commit_sha || '') ? `https://github.com/Stephenitis/InfiniteIsland/commit/${row.commit_sha}` : null),
      deployment: safeLink(row.deployment_url),
    }];
  });
}
