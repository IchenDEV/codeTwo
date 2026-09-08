---
id: 2026-09-08-ci-platform-contracts
schema: 5
stage: plan
status: accepted
owner: codex
created: 2026-09-08
based_on: spec.md
scope: apps/desktop/tests/pluginBridgeContract.test.ts, apps/desktop/tests/devProfile.test.ts, apps/desktop/tests/devWatcher.test.ts, apps/desktop/tests/composerGeometryContract.test.ts, apps/desktop/electrobun.config.ts, .github/workflows/, .agents/skills/codetwo-develop/references/development.md, .agents/skills/codetwo-develop/references/workflow.md, .agents/skills/codetwo-release/references/releasing.md, script/verify/checks.test.ts, docs/sdlc/changes/2026-09-08-simplify-sdlc/change.md, docs/sdlc/changes/2026-09-08-ci-platform-contracts/
---
# Plan: CI platform contracts

## Plan

Codex owns the scoped compatibility correction and regression checks. Run the four affected test files, desktop test:ci, lint and TypeScript, documentation and worktree scope validation. No UI behavior changes require rendering. Native Windows Actions requires a subsequent authorized push; local separator tests do not prove native event behavior.

Temporary resources: existing desktop node_modules installed for diagnosis is the reusable dependency directory. Watcher/profile tests own disposable c2-watch-feedback-* and c2-profile-test-* temporary directories and clean up children in finally/afterAll. No Core or desktop launch.

Rollback: Revert only these scoped changes.

CI consolidation: replace the two validation workflows with ci.yml and one Test job; keep path filtering and conditional mutation checks within that job. Keep nightly on main pushes per the user's follow-up; remove Windows packaging push triggers. Retarget the single historical link to the immutable old workflow. Add one routing regression to the existing lifecycle suite, run it, build the renderer, and reuse unchanged desktop test/lint/type results. Remove the newly generated apps/desktop/dist after verification. Existing repository rulesets may need their required check name updated to Test; do not change remote policy in this local implementation.

Bun upgrade: pin all six setup-bun steps to 1.4.2; reuse the matching desktop test/type/lint evidence, check frozen installs and the website build, and run the lifecycle tests under 1.4.2. Website dependencies are reusable workspace dependencies; remove newly generated site output after verification.
