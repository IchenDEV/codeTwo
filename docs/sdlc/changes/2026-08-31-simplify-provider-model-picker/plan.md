---
id: "2026-08-31-simplify-provider-model-picker"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: medium
scope: apps/desktop/src/App.tsx, apps/desktop/src/session/Composer.tsx, apps/desktop/src/session/config.ts, apps/desktop/tests/checkoutPickerRendered.test.tsx, apps/desktop/tests/providerModelTransition.test.ts, apps/desktop/tests/sceneChip.test.tsx, docs/sdlc/changes/2026-08-31-simplify-provider-model-picker
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Plan: Simplify Provider and model selection

## Files and ownership

apps/desktop/src/App.tsx, apps/desktop/src/session/Composer.tsx, apps/desktop/src/session/config.ts, apps/desktop/tests/checkoutPickerRendered.test.tsx, apps/desktop/tests/providerModelTransition.test.ts, apps/desktop/tests/sceneChip.test.tsx, docs/sdlc/changes/2026-08-31-simplify-provider-model-picker

## Order of work

1. Add a focused SessionControls regression for one trigger and Provider-to-model selection.
2. Extend ModelPicker with an optional Provider switcher while preserving model-only callers.
3. Render an isolated realistic provider/model fixture in dark, light, and 800 px states; compare
   it with the T3 reference to confirm CodeTwo keeps a distinct hierarchy and component language.

Rollback restores the separate ProviderPicker render in SessionControls and removes the optional
Provider switcher from ModelPicker.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

`SessionControls` now renders one `ModelPicker` entry for Provider and model selection. The
Provider-enabled picker reuses the current registry in a compact horizontal switcher with visible
Provider names, icons, availability dots, and a quiet selected state. The switcher scrolls without
exposing a heavy scrollbar, keeps the searchable model projection below it, and leaves model-only
callers on their original surface. The former duplicate `ProviderPicker` was removed. Provider browsing stays local
to the open picker; choosing a foreign model invokes one `onProviderModel(provider, model)` intent,
and `App` creates a fresh session before pinning that Provider and applying its model. The separate
effort selector remains unchanged. For an available Provider whose catalogue is empty, the same
fresh-session intent carries `model = null`, closes the picker, and leaves model resolution to that
Provider instead of manufacturing a default.

The compact switcher renders the canonical `codex` Provider as `Codex`; registry names,
configuration surfaces, Provider IDs, protocols, and persisted session state remain unchanged.

The popup uses shared menu width, separator, selectable-row, and quiet-fill primitives instead of
one-off picker border, ring, sizing, and selected-state contracts.

## Decision

The direct user request approves this medium-risk interaction simplification. The follow-up `pr`
authorizes PR creation only. Human review remains required before merge; release, deployment, and
external mutation remain unauthorized.
