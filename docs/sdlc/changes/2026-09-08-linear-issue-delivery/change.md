---
id: 2026-09-08-linear-issue-delivery
schema: 4
status: passed
owner: codex
created: 2026-09-08
source: user
risk: high
scope: Cargo.lock, crates/core/src/lib.rs, crates/core/src/issue_delivery.rs, crates/core/src/store.rs, crates/plugins/src/bundle.rs, crates/plugins/src/app/plugins/hub.rs, apps/desktop/src-host/, apps/desktop/src/App.tsx, apps/desktop/src/bridge.ts, apps/desktop/src/pluginModel.ts, apps/desktop/src/issues/, apps/desktop/src/plugins/, apps/desktop/src/i18n/strings.ts, apps/desktop/tests/, packs/linear/, docs/reference/plugin-standard.md, docs/reference/plugins.md, docs/sdlc/changes/2026-09-08-linear-issue-delivery/
approved_by: chenli
approved_at: 2026-09-08
approval_source: "Session: user confirmed the Linear Issue-to-delivery design with 确认."
design_approved_by: chenli
design_approved_at: 2026-09-08
design_approval_source: "Confirmed local CodeTwo entry, API-key credentials held by host, reusable tasks/worktrees, permission-bound PR creation/review continuation, actual merge-based completion, recovery and deduplicated Linear writeback."
next_trigger: Review the verified local implementation; live account acceptance and publication remain separate actions.
revision: "Worktree based on 948b703b, retaining prior plugin-runtime-reliability changes"
verification_mode: pair
verified_by: "verify_linear_adapter (independent agent)"
verified_at: 2026-09-08
release_target: none
---

# Linear Issue to delivery

## Intent

Deliver an independently installable Linear bundle and a host-rendered issue workflow: select an issue and repository, develop in a durable task/worktree, verify, create a linked PR, continue from review feedback, and synchronize actual merge results. Plugin processes perform short external operations; existing Core tasks own long-running development. Credentials stay in the system credential store and never enter task prompts or repository files.

User authorization covers local implementation and disposable verification. It does not authorize connecting a real Linear account, sending actual issue comments, pushing this repository, merging, or publishing a plugin. Existing repository rules govern tasks started through this product feature.

## Acceptance criteria

- [x] AC-1: The valid Linear bundle reads authenticated connection/team information, paginated issue search/detail/comments/attachments, and performs deduplicated milestone/state writes; errors never expose credentials.
- [x] AC-2: Host-owned credentials and connector routing enforce installed enabled/trusted ownership, while task prompts and persisted run records exclude secrets.
- [x] AC-3: One active issue/workspace/repository association reuses a durable Core task/session/worktree, survives restart, detects changed requirements, and supports continue/cancel without accidental completion.
- [x] AC-4: Validation receipts bind to Git HEAD; authorized PR creation and review continuation use the same task; only actual PR merge permits completed writeback, and sync failure is independently retryable.
- [x] AC-5: The desktop provides connection settings, searchable issue details, start controls, and recoverable development/PR/sync status using existing components; disabled plugins stop sync but retain tasks.

## Plan

Add a dependency-free Node Linear runtime and an issues connector capability. Add a narrow host controller backed by Core issue-delivery associations and existing task/session creation. Use the platform keyring library for credentials, GitHub CLI for PR facts, and explicit persisted permission flags for external delivery operations. Reuse the existing Issues UI entry and plugin details extension; maintain in-app polling only while the application runs. Test network adapters with fake responses, host boundaries with disposable stores/adapters, and actual rendered UI without live account mutations.

## Verification

- AC-1: PASS — `node --test packs/linear/plugin.test.js` passed 14 independent tests. `cargo run -p codetwo-plugins --example validate_bundle -- packs/linear`, `cargo run -p codetwo-plugins --example validate_marketplace -- packs/linear/marketplace.json`, and desktop `bun run plugin:validate ../../packs/linear` passed. Linear query and input shapes were checked against its official SDK schema; network tests use fake responses. The host suite also installs a disposable copy of the real bundle and exercises Extensions, connector routing, Node stdio, and issue normalization with only the network response substituted.
- AC-2: PASS — `cargo test -p codetwo-desktop-host --lib issue_delivery::tests` passed 22 independent tests, including credential ownership, disabled/untrusted gating, replacement of caller-supplied credentials, write permissions, and error redaction. Tests inject memory/refusing credential stores and never access real system credentials.
- AC-3: PASS — `cargo test -p codetwo-desktop-host --lib issue_delivery::tests` passed 22 independent tests covering SQLite reopen, one active tuple, explicit new attempts, task/session lease recovery, changed-base refusal, prompt acceptance receipts, updated comments/attachments, per-run cancellation, and terminal-state preservation.
- AC-4: PASS — The independent host suite verifies real temporary Git worktrees, exact-commit receipts, dirty/stale-checkout rejection, bound repository/branch/PR identity, fork PR refusal, merge-only completed-state writes, stable writeback retries, and recovery after sync errors. The broader `cargo test -p codetwo-desktop-host --lib` suite passed 42 tests, and `cargo check -p codetwo-desktop-host --all-targets` passed. Reverification reproduced a failure where local-only delivery called GitHub CLI before validation; the query now requires PR creation permission or an existing PR association. An isolated subprocess regression covers both GitLab and GitHub remotes with PR creation disabled and confirms that an existing bound PR remains monitored through merge.
- AC-5: PASS — `bun test tests/issueDeliveryRendered.test.tsx` passed 4 tests for credential form handling, explicit start permissions, disconnected-task recovery/history selection, and new-attempt authorization. The affected desktop plugin/UI suite passed 45 tests across 7 files, including snapshot-state coverage. `bun run build:renderer` passed lint, types, and production compilation. Agent-browser verified the actual React dialog with fake API data at a desktop dark viewport and 800x900 light viewport: search, selection, start, PR state, and sync retry; no browser errors. Temporary preview code was removed.

Verdict: verified.

Independent verification: `verify_linear_adapter`, 2026-09-08, pair mode, against this worktree. Broader checks include `cargo test -p codetwo-plugins --tests` (145 tests), host compilation, bundle/catalog validation, `bun script/verify/docs.ts`, the lifecycle Eval (`bun test script/verify/checks.test.ts script/devflow.test.ts`), and `git diff --check`. Final handoff uses `bun script/verify/sdlc.ts --worktree`.
Residual risk: No live Linear/GitHub account flow, actual system-keyring round trip, signed desktop package, or Windows/Linux runtime acceptance was performed. UI rendering uses fake API data. Attachments and linked documents are metadata/URLs; binary download and document extraction are not implemented. The source checkout's current branch is the supported base. Unix process groups are cleaned up; Windows only guarantees direct-child termination. Existing renderer chunk-size warnings remain. Workspace-wide `cargo fmt --all -- --check` also reports pre-existing differences outside this change; affected Rust files are checked separately. No OS sandbox is introduced.

## Review and release

Approval: User requested PR delivery with `pr` on 2026-09-08, authorizing commit, push, and PR creation for this change. Merge and release remain unrequested.
Rollback: Revert code; added association tables are additive and do not replace sessions or existing delegation records. Disconnect removes only this connector's credential.
Release: No release requested.
