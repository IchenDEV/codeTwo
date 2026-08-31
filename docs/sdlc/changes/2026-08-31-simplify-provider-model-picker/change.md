---
id: change-2026-08-31-simplify-provider-model-picker
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: [user]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: direct user request with T3 model-picker reference and current CodeTwo screenshot
inputs: current Provider registry, provider-owned model choices, model favorites and preferences
outputs: one Composer model entry with Provider rail, search, and model selection
scope: apps/desktop/src/session/Composer.tsx, apps/desktop/tests/sceneChip.test.tsx, docs/sdlc/changes/2026-08-31-simplify-provider-model-picker
next_trigger: PR review; merge and release remain pending
verification_mode: owner
verified_by: codex
verified_at: 2026-08-31
---

# Simplify Provider and model selection

## Intent

The user asked to simplify CodeTwo's separate Provider and model controls using T3's model picker as
the reference. The accepted interaction is one compact trigger showing the Provider mark and current
model, opening one surface where the user can switch Provider, search models, and select a model.

## Spec

In the primary Composer controls, remove the separate visible Provider chip. Extend the existing
model picker with a narrow Provider icon rail and keep the searchable model list beside it. Reuse
the current Provider registry, ProviderIcon, model grouping, favorites, hidden-model preferences,
adapter-owned model options, disabled states, and existing callbacks. Provider loading, retry, and
unavailable states remain legible. Selecting a Provider updates the existing Provider state and
keeps the surface open so a model can be selected directly.

Do not copy T3-only shortcut labels, legacy sections, or new favorite semantics. Keep reasoning
effort independent because it is a separate provider-owned configuration axis. ModelPicker uses in
Side Chat and Project Settings remain model-only and retain their current compact surface.

### Acceptance criteria

- [x] AC-1: Primary Composer controls show one Provider/model trigger instead of separate Provider
      and model chips.
- [x] AC-2: The unified popup has a Provider icon rail, model search, and a scrollable model list
      whose selected/favorite/default states reuse existing behavior.
- [x] AC-3: Switching Provider updates the existing Provider callback and reveals that Provider's
      models without closing the popup; selecting a model uses the existing model callback.
- [x] AC-4: Reasoning effort, disabled/running behavior, provider loading/error states, Side Chat,
      and Project Settings model-only use remain intact.
- [x] AC-5: Focused/full tests, renderer build, rendered Browser interaction and reference-image
      comparison, and repository lifecycle checks pass.

## Decision and gates

The direct user request approves this medium-risk interaction simplification. The follow-up `pr`
authorizes PR creation only. Human review remains required before merge; release, deployment, and
external mutation remain unauthorized.

## Plan

1. Add a focused SessionControls regression for one trigger and Provider-to-model selection.
2. Extend ModelPicker with an optional Provider rail while preserving model-only callers.
3. Render an isolated realistic provider/model fixture and compare it with the T3 reference.

Rollback restores the separate ProviderPicker render in SessionControls and removes the optional
Provider rail from ModelPicker.

## Build

`SessionControls` now renders one `ModelPicker` entry for Provider and model selection. The
Provider-enabled picker reuses the current registry and callbacks in a compact icon rail, keeps the
searchable model projection and existing row states on the right, and leaves model-only callers on
their original surface. The separate effort selector remains unchanged.

## Verification

Verdict: verified.

The requested T3-style simplification is implemented and the changed behavior is covered by a
regression test plus an isolated rendered interaction check.

### Acceptance evidence

- AC-1: PASS — `bun test tests/sceneChip.test.tsx --test-name-pattern "combines Provider and model"`
  first failed against the separate Provider button, then passed after `SessionControls` exposed one
  Provider/model trigger.
- AC-2: PASS — the built-in Browser at `1280x720` showed a `480px`-wide popup fully inside the
  viewport, with a `56px` Provider rail, search field, scrollable model list, and selected/default/
  favorite row states. The saved Browser screenshot was compared with the supplied T3 reference
  using image inspection.
- AC-3: PASS — `bun test tests/sceneChip.test.tsx --test-name-pattern "combines Provider and model"`
  verifies the Provider callback, in-place model replacement, and model callback. The rendered flow
  also filtered for `Terra`, switched to Grok without closing, selected `Grok 4.6`, and updated the
  trigger without console errors.
- AC-4: PASS — `bun test tests/reasoningScaleRendered.test.tsx tests/sceneChip.test.tsx` passed 26
  tests and 92 expectations; `bunx tsc --noEmit` and focused ESLint also passed. Model-only picker
  tests remain in that passing suite.
- AC-5: PASS — `bun test` and `bun run build:renderer` passed. Repository lifecycle commands are
  recorded by the final verification pass below.

Residual risk: the visual exercise used an isolated renderer fixture rather than starting another
Core process, as required by the repository's single-owner rule. Its `1280x720` viewport is slightly
shorter than the supplied T3 screenshot. T3-only shortcut labels, Legacy models, and global favorite
navigation were intentionally not copied; no backend or provider protocol changed.

## Review and release

Approval: PR creation authorized by the user's follow-up `pr`; merge pending human review.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change bundle.
No release: PR creation is authorized; merge, deployment, and release remain unauthorized.

## Feedback

The T3 and CodeTwo screenshots are the accepted reference and current-state evidence; no post-change
feedback exists yet.
