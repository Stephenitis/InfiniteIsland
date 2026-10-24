# Test audit — 24 October 2026

Scope: combined fork through `5e8c79c`. This is a read-only audit; no tests were deleted or weakened. Latest recorded combined run: **1,464 passed, 0 failed, 33.78 seconds**, from a dirty pre-commit checkout. This is not the smaller standalone split-PR suite. Parallel test durations include contention and cannot be added together as promised savings. Test count is not a coverage score.

## Recommended simplifications

| Priority | Evidence / source | Recommendation | Coverage and risk |
|---|---|---|---|
| High | `test/partyTilty.test.js:164–177`: stage constructed/disposed 160 times; test reported 8.82s | Separate static mesh checks from the contact matrix; investigate one resettable stage fixture | Keep every contact assertion plus explicit construction/disposal coverage. Verify state reset before reusing mutable objects. |
| High | `test/partyStagesLiving.test.js:195` and `partyStagesLiving82c.test.js:188`: eight full-runtime setups remeasure the same four-player triangle baseline | Measure one immutable baseline per fixture suite | Keep every stage's independent budget assertions; measure savings, which are currently unknown. |
| Medium | `test/partyBonk.test.js:186–195`: 480 complete games; 14.65s | Separate deterministic smoke coverage from the complete balance sweep | Preserve full seeds/statistical thresholds for gameplay changes and releases. Never just cut seeds and assume the same confidence. |
| Medium | `test/partyBumpers.test.js:129,139`: 480 games in two sweeps; 6.29s and 4.64s | Collect win rate, duration and fairness from a declared shared seed/seat/difficulty matrix | The existing seed sets differ; these are overlapping purposes, not exact duplicates. Preserve extended coverage until equivalence is demonstrated. |
| Low | `test/personalPanels.test.js:16`: identical sequence repeated 12 times | Two explicit initial/cached cycles plus the existing asynchronous race tests | Primarily readability; negligible runtime savings expected. |
| Low | `test/adminReleases.test.js:12` pins `0.83.0` separately | Add bundled-release/game/package agreement to the central release metadata contract | Keep fixed historical fixture versions for comparison behavior; remove redundant current-version bookkeeping only. |

## Add confidence where it is missing

- Actual React panel interactions lack automated DOM coverage. Add a few behavior checks for slider-to-preview, failed Publish feedback, close/reopen cleanup and auth-account changes. Store/model tests do not prove JSX handler wiring. Avoid giant markup snapshots.
- `test/profiles.test.js:14` uses a success-oriented fake. Add error responses, rejected updates and foreign-owner results. Keep real SQL/RLS tests: client mocks cannot establish database authorization.
- The test labeled “stays bounded” in `test/adminReleases.test.js:14` should exercise oversized rows, changes, titles and notes, or narrow its description.
- History comparison currently keys on a batch label without verifying its file membership (`scripts/test-timings.mjs:18`, `scripts/test-history.mjs:12`). Record a selection fingerprint or clearly flag composition changes so a renamed/reused batch cannot imply an apples-to-apples timing comparison.
- Test-history resilience needs coverage for cancelled/skipped baseline eligibility, malformed records, concurrent refresh and write failures. Logging failures must not obscure the test outcome.
- The watcher's queue/build gating (`scripts/dev-check.mjs:8–29`) deserves focused fake-runner checks: edits during tests queue a fresh run, failures skip builds, and generated output cannot cause a loop.

## Keep these protections

Retain settings publication/sign-out/realtime races, ownership and RLS checks, host/replica compatibility, preview-save isolation, release identity/idempotency, and differential tests for optimized geometry helpers. They protect distinct failure modes.

Keep `duskFlora.test.js:130` rebuild duplication checks (5.39s) and `platformer.test.js:361` real-movement reachability (7.06s). Static geometry/graph assertions cannot substitute for those integration behaviors.

## Iteration policy

Use relevant named batches continuously for narrow work; keep the complete suite for cross-cutting changes/releases and CI. A future smoke/extended split should preserve the full suite by default and expose exactly which coverage was selected. The watcher remains in its current mode; this audit does not silently reduce it.

Start implementation with fixture reuse and central version bookkeeping, measure before/after on the same machine and source scope, then consider a smoke/extended simulation tier. Do not optimize for a smaller headline test count.
