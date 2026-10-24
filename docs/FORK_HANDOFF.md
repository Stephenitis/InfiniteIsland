# Claude orientation: Infinite Island fork

Read `docs/SETUP.md`, `docs/ARCHITECTURE.md`, `docs/TESTING.md`, and `docs/RELEASING.md` first. For database work, also read `docs/SUPABASE.md` and the committed migrations. Verify current Git/deployment state instead of treating historical README metrics as current.

## Architecture and boundaries

- `public/js/main.js` owns the existing Three.js scene and simulation. This is not a full React Three Fiber conversion.
- `public/js/settings/bootstrap.js` connects the legacy game to lazy React panels, settings and character preferences.
- `src/admin/` is the React world editor, release notes, help, and three-view comparison. `src/profiles/` is optional personal character UI. `src/cloud/` is the optional Supabase adapter.
- `public/js/settings/worldSettings.js` manages draft/published state; `environmentBridge.js` applies settings. Sliders preview privately; Publish is an explicit database operation with revision checks.
- `previewRuntime.js` isolates comparison/testing worlds: temporary storage, no cloud/multiplayer, muted audio. Preserve this isolation. `adminTools.js` exposes guarded travel and temporary unlocks, not persistent quest completion.
- Game saves/progression and character account storage are different. Do not promise full cloud world saves merely because `world_saves` exists.
- `src/characters/` contains an R3F/Drei bundle; it is not the active game's scene architecture. Avoid moving per-frame motion into React state.

## Working conventions

Preserve the existing art style, original character, instancing, save compatibility and host-authoritative networking. Use source inspection and browser checks; passing Node tests cannot certify graphics, audio, touch input or real-phone performance. Do not weaken tests by removing seeds or geometric coverage just to improve timings.

Use Node 24, `npm ci`, then `PORT=3140 npm start`. In another terminal use `npm run dev:check` (all tests) or explicit focused batches such as `npm run dev:check -- editor ui camera`. List batches with `npm run test:batch -- --list`. Categorize new test files in `scripts/test-batches.json` exactly once. Use these runners rather than bare `node --test` so every completed run is recorded in `test-results/history.md`. Keep full `npm test` plus `npm run build` for releases. Watchers need restarting after their own code changes; do not run duplicate watchers.

Keep docs and user-facing release notes current with coherent changes. Commit and push tested batches to the authorized fork branch; never assume permission to merge upstream or modify another person's deployment. No credentials in code or PR comments. Do not bypass database permissions or suppress dirty-build warnings to publish a release. The known hosted migration-ledger discrepancies and release-metadata investigation are documented, not resolved by merging source.

## Selecting portions of this PR

Prefer the PR's optional-adoption comments as a map. The foundation commit contains interdependent changes: blindly cherry-picking it takes more than one feature. Extract feature paths plus their imports, styles, config and tests, then test the resulting combination. Test tooling/docs are largely independent; editor persistence, scene additions and multiplayer appearance integration need their supporting modules. Keep the base game running without Supabase.
