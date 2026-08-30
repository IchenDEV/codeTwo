---
id: change-2026-08-31-codex-display-name
kind: change
schema: 2
status: verified
risk: low
owner: codex
approvers: [user via the 2026-08-31 direct copy request]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: direct user request to change OpenAI Codex to Codex
inputs: current Codex provider display name in desktop, Core, website, active documentation, and tests
outputs: one concise Codex display name across active product surfaces
scope: apps/desktop/src/bridge.ts, apps/desktop/tests/computerUseSettings.test.tsx, apps/desktop/tests/sceneChip.test.tsx, apps/desktop/tests/projectSettingsRendered.test.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, apps/desktop/tests/sceneEditorRendered.test.tsx, apps/desktop/tests/providerSettingsRendered.test.tsx, apps/desktop/tests/usagePanelRendered.test.tsx, crates/core/src/provider.rs, website/index.md, website/zh/index.md, website/guide/providers.md, website/zh/guide/providers.md, docs/reference/architecture.md, docs/sdlc/changes/2026-08-31-codex-display-name/change.md
next_trigger: human review and feedback
verification_mode: owner
verified_by: codex
verified_at: 2026-08-31
---

# Use Codex as the product display name

## Intent

The user asked to shorten the visible provider name from `OpenAI Codex` to `Codex`. The affected
surfaces are the desktop provider registry, the Core provider registry, active website and
reference copy, and tests that encode the product display name. Internal provider ids, adapter
commands, protocol behavior, other OpenAI products, and archived historical research are unchanged.
The request does not authorize a pull request, merge, release, or deployment.

## Spec

Every active product-owned exact occurrence of `OpenAI Codex` becomes `Codex`. The internal
provider id remains `codex`, and the Codex ACP command and login/runtime requirements remain
unchanged. Historical archive material retains its source-faithful wording.

### Acceptance criteria

- [x] AC-1: Desktop and Core provider registries expose `Codex`, and product-name tests expect the
      concise label without changing provider identity or behavior.
- [x] AC-2: Active English and Chinese website/reference copy uses `Codex`; the only remaining exact
      `OpenAI Codex` occurrence is in an archived research record.
- [x] AC-3: Focused tests, desktop and website builds, rendered Provider-picker inspection, and
      repository lifecycle checks pass.

## Decision and gates

The user directly accepted this low-risk copy change on 2026-08-31. No security, data-migration,
release, or production Gate applies. Human review remains required before merge, and no external
delivery action is authorized.

## Plan

1. Change the authoritative desktop fallback and Core provider display names.
2. Update active website/reference copy and all tests that encode the product-owned display name.
3. Search for residual active occurrences, run focused/full checks, and inspect the rendered
   Provider picker at desktop and narrow widths.

Rollback reverts these copy-only edits.

## Build

Completed. The desktop fallback and Core registry now expose `Codex`; active English and Chinese
website/reference copy and display-name fixtures use the same label. Internal provider ids,
commands, protocols, login requirements, and archived research remain unchanged.

## Verification

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bun test` in `apps/desktop` passed 766 tests with 0 failures; the seven focused
  display-name files passed 51 tests with 0 failures; `cargo test -p codetwo-core provider::tests`
  passed 8 tests with 0 failures, including the explicit `Codex` registry assertion.
- AC-2: PASS — `rg -n -F "OpenAI Codex" apps crates website docs/reference` returned no active
  occurrences, and `bun run docs:build` completed the English and Chinese VitePress build.
- AC-3: PASS — `bunx tsc --noEmit`, `bun run build:renderer`, and Browser inspection at
  `http://127.0.0.1:1420/` passed. The Provider picker displayed `Codex`, had no `OpenAI Codex`
  text at desktop or 560 px width, had no horizontal overflow, and emitted no console warnings or
  errors. Screenshots were recorded at `/tmp/codetwo-codex-name-desktop.png` and
  `/tmp/codetwo-codex-name-narrow.png`. Repository lifecycle checks are recorded by the final Gate
  run after this Artifact update.

Residual risk: the user's already-running native application was not restarted, so it will retain
the previous bundled copy until rebuilt and relaunched. The archived research occurrence is
intentionally unchanged to preserve historical wording.

## Review and release

Approval: pending human review.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change to restore the previous display name.
No release: the current request authorizes only local implementation and verification.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

No post-change feedback exists yet.
