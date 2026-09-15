---
id: 2026-09-15-remove-host-version-pin
schema: 5
stage: plan
status: accepted
owner: idevlab
created: 2026-09-15
based_on: spec.md
scope: packages/tool-broker/src, apps/desktop/tests/providerCapabilities.test.ts, docs/sdlc/changes/2026-09-15-remove-host-version-pin
---

# Plan: Remove Host Version Pin

## Plan

Smallest implementation, owned by the broker policy layer:

1. `packages/tool-broker/src/broker.ts`: remove the `VERIFIED_HOST_VERSIONS` constant; set
   `hostState` from `evidence.hostVerified`; replace the two version-range fix strings with a
   signature-based remediation.
2. `apps/desktop/tests/providerCapabilities.test.ts`: add a regression case that resolves a signed
   host on an arbitrary version (for example `99.0.0`) to `computer_use` `ready` for `codex` and a
   non-Codex provider, and keeps an unsigned host `unavailable`. Keep existing `readyEvidence`
   version data (it is a realistic host version, not the pin).
3. `apps/desktop/tests/toolBroker.test.ts`: no behavior change expected; touched only if the removed
   constant changes an assertion.

Checks: desktop `bun test`, `bun run lint`, `bun run build` cover the affected policy and types;
`bun script/verify/sdlc.ts --worktree` covers records, scope, and structure. No rendered UI is needed
because capability state has no layout or interaction change; no Rust, package, or migration checks
apply because no crate, wire, or persisted format changes.

Temporary resources: none. Verification runs the existing test runner and produces no retained
build outputs beyond normal gitignored caches.

Rollback: revert the single broker commit; the constant and conditional are self-contained and no
persisted data or wire format depends on them.
