// Preserve the legacy ES-module game; bundle new React features as lazy chunks.
import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';

// Local browser-public configuration stays outside Git. Hosted environment variables take precedence.
try { process.loadEnvFile('.env.local'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
import { collectReleaseStatus } from './release-status.mjs';

await mkdir('public/generated', { recursive: true });
await rm('public/generated', { recursive: true, force: true });
await build({
  entryPoints: { admin: 'src/admin/index.jsx', cloud: 'src/cloud/index.js', characters: 'src/characters/index.jsx', profiles: 'src/profiles/index.jsx' },
  outdir: 'public/generated', bundle: true, splitting: true, format: 'esm', platform: 'browser', target: 'es2022',
  minify: true, sourcemap: false, external: ['three', 'three/*'],
  define: { 'process.env.NODE_ENV': '"production"' },
});
// These two values are browser-public by design. Never emit a secret/service-role key.
const url = process.env.PUBLIC_SUPABASE_URL || '';
const key = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
if (key.startsWith('sb_secret_')) throw new Error('A Supabase secret key cannot be published.');
if (key.split('.').length === 3) {
  try { if (JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role === 'service_role') throw new Error('A service-role key cannot be published.'); } catch (error) { if (error.message.includes('service-role')) throw error; }
}
await writeFile('public/generated/config.json', JSON.stringify({ supabaseUrl: url, supabasePublishableKey: key }));
const buildDate = new Date().toISOString();
const buildVersion = JSON.parse(await readFile('package.json', 'utf8')).version;
await writeFile('public/generated/release-status.json', JSON.stringify(await collectReleaseStatus({ source: 'build-snapshot', buildDate, buildVersion })));
if (!process.argv.includes('--local')) {
  await rm('dist', { recursive: true, force: true });
  await cp('public', 'dist', { recursive: true });
  // Pin and self-host the graphics library for reliable production loading.
  await cp('node_modules/three', 'dist/vendor/three', { recursive: true });
  const html = await readFile('dist/index.html', 'utf8');
  await writeFile('dist/index.html', html.replace("var cdn = 'https://cdn.jsdelivr.net/npm/three@0.186.1/';", "var cdn = '/vendor/three/';"));
}
console.log('Built lazy React features and static game.');
