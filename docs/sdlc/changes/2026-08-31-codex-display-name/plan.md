---
id: "2026-08-31-codex-display-name"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: low
scope: apps/desktop/src/bridge.ts, apps/desktop/tests/computerUseSettings.test.tsx, apps/desktop/tests/sceneChip.test.tsx, apps/desktop/tests/projectSettingsRendered.test.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, apps/desktop/tests/sceneEditorRendered.test.tsx, apps/desktop/tests/providerSettingsRendered.test.tsx, apps/desktop/tests/usagePanelRendered.test.tsx, crates/core/src/provider.rs, website/index.md, website/zh/index.md, website/guide/providers.md, website/zh/guide/providers.md, docs/reference/architecture.md, docs/sdlc/changes/2026-08-31-codex-display-name/change.md
approved_by: "[user via the 2026-08-31 direct copy request]"
approved_at: "2026-08-31"
---

# Plan: Use Codex as the product display name

## Files and ownership

apps/desktop/src/bridge.ts, apps/desktop/tests/computerUseSettings.test.tsx, apps/desktop/tests/sceneChip.test.tsx, apps/desktop/tests/projectSettingsRendered.test.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, apps/desktop/tests/sceneEditorRendered.test.tsx, apps/desktop/tests/providerSettingsRendered.test.tsx, apps/desktop/tests/usagePanelRendered.test.tsx, crates/core/src/provider.rs, website/index.md, website/zh/index.md, website/guide/providers.md, website/zh/guide/providers.md, docs/reference/architecture.md, docs/sdlc/changes/2026-08-31-codex-display-name/change.md

## Order of work

1. Change the authoritative desktop fallback and Core provider display names.
2. Update active website/reference copy and all tests that encode the product-owned display name.
3. Search for residual active occurrences, run focused/full checks, and inspect the rendered
   Provider picker at desktop and narrow widths.

Rollback reverts these copy-only edits.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

Completed. The desktop fallback and Core registry now expose `Codex`; active English and Chinese
website/reference copy and display-name fixtures use the same label. Internal provider ids,
commands, protocols, login requirements, and archived research remain unchanged.

## Decision

The user directly accepted this low-risk copy change on 2026-08-31. No security, data-migration,
release, or production Gate applies. Human review remains required before merge, and no external
delivery action is authorized.
