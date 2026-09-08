---
id: 2026-09-08-ci-platform-contracts
schema: 5
stage: verification
status: passed
owner: codex
created: 2026-09-08
based_on: plan.md
revision: "worktree based on c6daaf25453b3111614e9b8d121ea991779d7025; scoped CI platform corrections"
verification_mode: owner
verified_by: codex
verified_at: 2026-09-08
release_target: none
cleanup_status: complete
---

# Verification: Ci Platform Contracts

## Verification

- AC-1: PASS — `bunx --package bun@1.3.10 bun test --timeout 15000 tests/pluginBridgeContract.test.ts tests/devProfile.test.ts tests/devWatcher.test.ts tests/composerGeometryContract.test.ts` in apps/desktop passed 16 tests with 151 assertions on macOS. Inspected Windows branch against the resolver's existing socket policy. Prior plugin contract failed on multiline argv.
- AC-2: PASS — The same `bun test` run exercised the installed watcher and both path separators. A direct `Bun.Glob` probe rejected a Windows runtime path under the old glob and accepted its escaped-separator equivalent; generated output stays ignored while source paths remain visible.
- AC-3: PASS — `bun test` composer contracts passed with bounded attribute matching; inspection of `.github/workflows/windows-desktop.yml` confirms `bun run test:ci` with the existing 15000 ms timeout. Prior Windows logs establish timeout, but do not identify the exact slow assertion.
- AC-4: PASS — `bun run test:ci` and `bunx --package bun@1.3.10 bun run test:ci` each passed 886 tests, skipped 3 opt-in host/Vite integrations, and failed 0. `bun run check`, `bunx tsc --noEmit`, `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts --worktree`, and `git diff --check` passed.

Verdict: verified.

- AC-6: PASS — `bun test script/verify/checks.test.ts script/verify/four-stage.test.ts script/devflow.test.ts` passed 32 tests and 269 assertions, including parsing all workflow YAML to assert one PR job, retained checks, no packaging PR triggers, nightly restricted to main pushes, and manual Windows/versioned releases. `bunx vite build` completed in 24.83 seconds with the existing chunk-size warning. `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts --worktree`, and `git diff --check` passed. Full desktop tests/lint/types are reused from the unchanged implementation above. Remote Actions and required-check rules were not changed or verified.

Bun 1.4 follow-up:
- AC-5: PASS — All five consolidated setup-bun steps pin 1.4.2. `bun --version` reports 1.4.2; `bun install --frozen-lockfile` succeeded in apps/desktop and website without lockfile edits; `bun run docs:build` completed. `bun test script/verify/checks.test.ts script/verify/four-stage.test.ts script/devflow.test.ts` passed 31 tests and 245 assertions. The preceding 886-test desktop run already used this exact version and unchanged desktop code. VitePress emitted a non-fatal logo-ink.svg resolution warning.
Residual risk: Native Windows event handling and packaging require subsequent Actions execution; no push or workflow dispatch was performed. Existing dual-window profile acceptance remains blocked in its original record. No product UI behavior changed, so no rendering or Core launch was needed.

## Cleanup

Removed: Disposable watcher/profile test directories through their existing finally/afterAll cleanup.
Removed: Newly generated website/.vitepress/dist after successful build verification.
Removed: Newly generated apps/desktop/dist (48 MiB), measured with `du -sh` and confirmed absent after scoped removal.
Retained: apps/desktop/node_modules (1.4 GiB) installed during diagnosis as reusable workspace dependencies; the Bun 1.3.10 package-manager cache is retained for reproducible CI checks.
Retention owner: codex, transferred to the next worker on this change.
Retained: website/node_modules as reusable website dependencies; same owner and worktree-disposal checkpoint as desktop dependencies.
Cleanup trigger: Reassess dependency retention on the next continuation; dispose with the worktree when its review is complete. Do not remove shared package caches.
Processes: All task-owned watcher probes exited; no desktop or Core was launched.
Evidence: A `bun -e` inventory of the OS temporary directory found no c2-watch-feedback-* or c2-profile-test-* entries after completion; scoped `ps` found no watcher probe. `du -sh apps/desktop/node_modules` reported 1.4 GiB.

## Review and release

Approval: User requested PR delivery in this task; merge approval remains pending.
Rollback: See plan.md.
Release: No release requested; merge and external actions require their own authorization.
Feedback: Link an Incident and regression Eval when a real failure occurs.
