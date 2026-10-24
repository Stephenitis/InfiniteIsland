# Setup, development and deployment

## Run locally

Use Node 24 and npm. Clone your own fork and run `npm ci` at its root. Copy `.env.example` to `.env.local` if using Supabase; without cloud configuration, local play and editor previews still work.

```sh
npm ci
PORT=3140 npm start
```

Open `http://localhost:3140/` for the game and `http://localhost:3140/?admin` for the editor. Without PORT, the server defaults to 3000. `npm start` builds the lazy UI first. Keep this terminal open. The local server also provides the existing WebSocket multiplayer relay.

In another terminal:

```sh
npm run dev:check
```

This runs tests immediately and after source edits, then rebuilds on success. Refresh the browser afterward. It does not start the server, provide hot reload, commit, or deploy. Stop with Ctrl+C. Restart after editing the watcher itself or installing dependencies. Choose batches with `npm run dev:check -- editor ui camera`; this is explicit selection, not dependency inference. Full checks remain required for cross-cutting release changes.

## Supabase

For a new installation, use a dedicated project and review/apply **all** SQL files in `supabase/migrations` in filename order, once. Follow [SUPABASE.md](SUPABASE.md) for Auth configuration, administrator membership, grants, RLS and verification. Use either the Dashboard SQL Editor or the migration workflow, not both for the same schema. Existing installations must reconcile their migration ledger before pushing migrations; this fork has documented manual-application history.

Set these browser-public values in `.env.local` and rebuild:

```dotenv
PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Never use a database password, service-role key or secret key in this configuration. Create the intended Auth account and explicitly register its UUID as an administrator using the SQL in SUPABASE.md. Dashboard sign-in does not grant in-game admin rights. Configure the actual local/deployed Auth redirect URLs. Enable anonymous sign-in and identity linking only when using the optional guest account flow; email delivery requires its own tested configuration.

Verify signed-out settings reads, rejection of ordinary-user publishing, admin publish/reload and propagation to a second browser. Character storage covers appearance/name, not a full cloud world save. Schema files do not transfer another person's live data or credentials. See the [official environment/migration guide](https://supabase.com/docs/guides/deployment/managing-environments) for the optional CLI workflow.

## Tests and history

```sh
npm test
npm run test:batch -- --list
npm run test:batch -- editor camera
npm run test:timings -- --json /tmp/island-timings.json
npm run test:history
```

All these test runners and the watcher append completed test results to `test-results/runs.jsonl` and refresh `test-results/history.md`. The table shows count and duration deltas against the last successful comparable selection on the same machine/runtime. Failures are retained; skipped/cancelled tests are visible. Abruptly killed processes without a final Node summary cannot produce a complete row. Direct `node --test` bypasses logging: use the repository commands. The local history is Git-ignored and survives restarts; CI uploads its history as an artifact. Test time excludes the subsequent build. It measures verification overhead, not browser FPS or loading performance.

See [TESTING.md](TESTING.md) for categories, SQL checks, historical timings and manual device checks.

## Vercel deployment

Import **your own fork** into Vercel. This repository supplies `vercel.json`: build command `npm run build`, output `dist`, framework Other. Set the two public Supabase variables in the appropriate Preview/Production environment and redeploy after changing them. Choose your intended production branch (this fork uses `main`). Pushes to a connected branch trigger deployments; GitHub test checks and Vercel builds are separate unless you configure a required deployment gate.

Vercel serves the static game and `/editor`; it does not run `server.js` as a persistent WebSocket relay. The default PeerJS/WebRTC transport is separate and can operate from static hosting; choosing the WebSocket transport requires separate relay hosting. Verify the public URL, source commit in `/generated/release-status.json`, editor layout and persistence before claiming a release is live. For formal GitHub/database release announcements, use [RELEASING.md](RELEASING.md); those require clean verified build metadata and trusted release credentials, not browser credentials.

Keep small tested commits, update documentation with behavior changes, and report exact validation results. Updating a fork deployment does not merge or deploy upstream.
