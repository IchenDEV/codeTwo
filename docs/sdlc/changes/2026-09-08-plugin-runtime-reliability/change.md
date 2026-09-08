---
id: 2026-09-08-plugin-runtime-reliability
schema: 4
status: passed
owner: codex
created: 2026-09-08
source: user
risk: high
scope: crates/plugins/, apps/desktop/src-host/src/host_events.rs, apps/desktop/src/bridge.ts, apps/desktop/src/App.tsx, apps/desktop/src/pluginModel.ts, apps/desktop/src/plugins/, apps/desktop/tests/, docs/reference/plugin-protocol.md, docs/reference/plugins.md, docs/reference/plugin-standard.md, docs/sdlc/changes/2026-09-08-plugin-runtime-reliability/
approved_by: chenli
approved_at: 2026-09-08
approval_source: "Session: user said 开始整改 after the proposed first round of protocol reliability and unified state queries."
design_approved_by: chenli
design_approved_at: 2026-09-08
design_approval_source: "Session: 开始整改 accepts the preceding design: bounded protocol calls and queues, cancellation, backend effective state, and retention of existing lifecycle and transport."
next_trigger: Human review of the verified local change; no merge or release authorized.
revision: "Worktree based on 948b703b"
verification_mode: pair
verified_by: "verify_protocol (independent agent)"
verified_at: 2026-09-08
release_target: none
---

# Plugin runtime reliability and state queries

## Intent

Implement the first round accepted by chenli on 2026-09-08: bounded plugin protocol work and a backend-owned plugin state query. Preserve the existing command transport, bundle trust gate, project policy, and single runtime lifecycle. Public API expansion, event realm changes, automatic marketplace updates, and OS sandboxing are outside this round.

## Acceptance criteria

- [x] AC-1: Plugin calls have a finite configurable deadline; timeout, cancellation, and transport failure release pending work and terminate the affected process without hanging other runtimes.
- [x] AC-2: Protocol frames, outbound queues, and concurrent callbacks are bounded; overload and malformed oversized input fail explicitly and clean up owned tasks.
- [x] AC-3: One backend query returns installed bundles and requested runtime catalogs with effective bundle state and process observations; disabled or untrusted bundles cannot appear executable.
- [x] AC-4: The desktop consumes the unified query, rejects superseded refresh results, and retains existing user/project controls and presentation.

## Plan

Keep the existing JSON-RPC wire methods. Centralize request deadlines, cancellation cleanup, bounded transport, and callback ownership in the protocol peer. Allow a bounded runtime command timeout override for long operations. Observe process state through the existing manager, without a second lifecycle controller.

Add an installed-inventory-locked snapshot command using existing catalogs and backend effective-state projection. Switch desktop refreshes to this command and retain presentation-only descriptors. Validate with duplex protocol tests, real-process teardown, inventory/policy integration tests, desktop tests/types/rendered checks, and independent review.

## Verification

- AC-1: PASS — `cargo test -p codetwo-plugins --test plugin_protocol --test plugin_protocol_limits --test plugin_process_lifecycle` passed; independent agent verified deadlines, cancellation, process teardown, and the dormant-to-failed path.
- AC-2: PASS — `cargo test -p codetwo-plugins --test plugin_protocol_limits` passed 12 independent behavior tests, including input/output limits, queue capacity, callback limits, and cleanup.
- AC-3: PASS — `cargo test -p codetwo-plugins --test project_bundle_runtime` passed 11 tests. Independent review verified trust, project policy, removal, consistent snapshots, and the request-path alias regression.
- AC-4: PASS — `bun test tests/pluginSnapshot.test.tsx tests/pluginCatalog.test.ts tests/pluginModel.test.ts tests/pluginManagerLifecycle.test.ts tests/pluginBridgeContract.test.ts tests/pluginManagerRendered.test.tsx tests/pluginComponentPolicyContract.test.ts` passed; `bun run build:renderer` and `cargo check -p codetwo-desktop-host --all-targets` passed. Independent review covered stale-response protection and state projection. Agent-browser verified the actual frontend preview at `http://127.0.0.1:15420`: plugin manager, search, and category switching at 1273x577 dark and 800x850 light, with no browser errors.

Verdict: verified.

The complete `cargo test -p codetwo-plugins` suite passed before the final alias fix; its affected project-bundle suite passed again afterward. `bun script/verify/docs.ts`, the lifecycle Eval (`bun test script/verify/checks.test.ts script/devflow.test.ts`), Rust formatting, and `git diff --check` passed. Final worktree scope checking uses `bun script/verify/sdlc.ts --worktree`.

Independent review: `verify_protocol` raised and verified fixes for handshake deadline coupling, terminal process observations being overwritten by activation, and frontend project-path aliases. An existing test expecting eager trusted-bundle startup was corrected to the already-implemented lazy contract.
Residual risk: Browser rendering used preview data; no installed desktop end-to-end launch, remote CI, or release was performed. The production bundle-size warning remains. No OS sandbox; process-wide cancellation can interrupt concurrent calls in the same plugin realm. No release or remote CI evidence requested.

## Review and release

Approval: User requested PR delivery with `pr` on 2026-09-08, authorizing commit, push, and PR creation for this change. Merge and release remain unrequested.
Rollback: Revert this change; existing manifests retain their default behavior apart from finite host resource limits. No persisted policy migration.
Release: No release requested.
