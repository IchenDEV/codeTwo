---
id: "2026-09-02-browser-core-transport"
stage: verification
schema: 3
status: passed
owner: codex
created: 2026-09-02
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "codex"
verified_at: "2026-09-02"
release_target: none
release_identity: "not applicable until released."
---

# Verification: Reuse the desktop React renderer as a browser Web UI

## Automated checks

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bun test tests/coreTransport.test.ts`, `bunx tsc --noEmit`, and source inspection
  verified one `CoreTransport` interface, existing Electrobun delegation, explicit Web-mode
  selection, and unchanged fixture fallback outside Web mode.
- AC-2: PASS — `cargo test -p codetwo-server --test web_ui_commands`,
  `cargo test -p codetwo-desktop-host remote::tests`, and
  `cargo test -p codetwo-plugins --test project_plugin_graph` verified paired-personal auth,
  member rejection, missing-adapter rejection, preserved project call context, explicit host
  capability policy, and the shared lazy project-realm dispatch path.
- AC-3: PASS — a real `vite --mode web` renderer paired with one release desktop host on an
  isolated data directory loaded the existing React tree, providers, project and persisted
  Sessions, opened a transcript, created a durable Session from Core, received its live
  `session_created` event, and renamed it through the browser UI. Source/allowlist inspection
  verified the remaining prompt, prepare, cancel, permission, elicitation, policy, model, sandbox,
  archive, and pin calls use the same generic route rather than separate Web handlers.
- AC-4: PASS — `bun test tests/coreTransport.test.ts` verified explicit-token precedence over a
  stale bearer, single-flight pairing, concurrent command calls, bearer-free socket URLs, a fresh
  single-use ticket per connection, and retry after an intermediate ticket request failed. In the
  live browser, stopping Core for 6.5 seconds caused repeated ticket failures; after restart the
  same unreloaded tab received a newly created Session event.
- AC-5: PASS — `bun test` passed the full desktop suite with 864 tests and 5,122 expectations; the focused Core
  transport and bridge contract suite passed 6 tests with 53 expectations; task-board mutation
  testing scored 100%; and `bun run build:renderer` passed lint, TypeScript, and the 6,604-module
  Vite production build. Focused Rust tests, changed-file `rustfmt --check`, `git diff --check`, and
  the repository documentation/lifecycle/worktree Gates also passed.

Draft PR #219 `Desktop design system / validate` failed after 700 passing tests because the reconnect
test expected the second fake socket exactly 5ms after closing the first. The same test passed in
focused runs, identifying test scheduling under full-suite load rather than a product reconnect
failure.

The next full local desktop run passed that reconnect point and exposed the adjacent source
contract after 863 passing tests: it still required `bridge.ts` to call `desktopCall` directly.
The contract now verifies the intended single chain through `coreTransport.ts`, including its
desktop delegation, without weakening the one-boundary assertion.

Residual risk: this is intentionally a development Web mode. React assets are not yet embedded in
the Rust server, the compact phone remote remains separate, and desktop-container-only features
such as native windows, dialogs, updater, Appshots, pets, and embedded WebViews remain unavailable
in a browser. The live smoke test did not submit a prompt to an external provider; prompt transport
was checked at the shared command projection, allowlist, and authenticated generic route. The test
host used an isolated data directory and port because same-bundle desktop multi-instance identity
is a separate unresolved development limitation.

## Behavioral evidence

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bun test tests/coreTransport.test.ts`, `bunx tsc --noEmit`, and source inspection
  verified one `CoreTransport` interface, existing Electrobun delegation, explicit Web-mode
  selection, and unchanged fixture fallback outside Web mode.
- AC-2: PASS — `cargo test -p codetwo-server --test web_ui_commands`,
  `cargo test -p codetwo-desktop-host remote::tests`, and
  `cargo test -p codetwo-plugins --test project_plugin_graph` verified paired-personal auth,
  member rejection, missing-adapter rejection, preserved project call context, explicit host
  capability policy, and the shared lazy project-realm dispatch path.
- AC-3: PASS — a real `vite --mode web` renderer paired with one release desktop host on an
  isolated data directory loaded the existing React tree, providers, project and persisted
  Sessions, opened a transcript, created a durable Session from Core, received its live
  `session_created` event, and renamed it through the browser UI. Source/allowlist inspection
  verified the remaining prompt, prepare, cancel, permission, elicitation, policy, model, sandbox,
  archive, and pin calls use the same generic route rather than separate Web handlers.
- AC-4: PASS — `bun test tests/coreTransport.test.ts` verified explicit-token precedence over a
  stale bearer, single-flight pairing, concurrent command calls, bearer-free socket URLs, a fresh
  single-use ticket per connection, and retry after an intermediate ticket request failed. In the
  live browser, stopping Core for 6.5 seconds caused repeated ticket failures; after restart the
  same unreloaded tab received a newly created Session event.
- AC-5: PASS — `bun test` passed the full desktop suite with 864 tests and 5,122 expectations; the focused Core
  transport and bridge contract suite passed 6 tests with 53 expectations; task-board mutation
  testing scored 100%; and `bun run build:renderer` passed lint, TypeScript, and the 6,604-module
  Vite production build. Focused Rust tests, changed-file `rustfmt --check`, `git diff --check`, and
  the repository documentation/lifecycle/worktree Gates also passed.

Draft PR #219 `Desktop design system / validate` failed after 700 passing tests because the reconnect
test expected the second fake socket exactly 5ms after closing the first. The same test passed in
focused runs, identifying test scheduling under full-suite load rather than a product reconnect
failure.

The next full local desktop run passed that reconnect point and exposed the adjacent source
contract after 863 passing tests: it still required `bridge.ts` to call `desktopCall` directly.
The contract now verifies the intended single chain through `coreTransport.ts`, including its
desktop delegation, without weakening the one-boundary assertion.

Residual risk: this is intentionally a development Web mode. React assets are not yet embedded in
the Rust server, the compact phone remote remains separate, and desktop-container-only features
such as native windows, dialogs, updater, Appshots, pets, and embedded WebViews remain unavailable
in a browser. The live smoke test did not submit a prompt to an external provider; prompt transport
was checked at the shared command projection, allowlist, and authenticated generic route. The test
host used an isolated data directory and port because same-bundle desktop multi-instance identity
is a separate unresolved development limitation.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: this is intentionally a development Web mode. React assets are not yet embedded in

## Verdict

Verdict: verified..

## Review and release

Approval: implementation approved by the user on 2026-09-02; merge and release are not approved.
Review: Draft PR [#219](https://github.com/IchenDEV/codeTwo/pull/219) contains this change.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: remove the scoped Web transport and route; no data rollback is required.
No release: merge, deployment, and release are not authorized.

## Feedback

No post-implementation feedback exists yet.
