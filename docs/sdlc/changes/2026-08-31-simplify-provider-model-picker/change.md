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
updated: 2026-09-01
source: direct user request with T3 model-picker reference and current CodeTwo screenshot
inputs: current Provider registry, provider-owned model choices, model favorites and preferences
outputs: one Composer model entry with Provider rail, search, and model selection
scope: apps/desktop/src/App.tsx, apps/desktop/src/session/Composer.tsx, apps/desktop/src/session/config.ts, apps/desktop/tests/checkoutPickerRendered.test.tsx, apps/desktop/tests/providerModelTransition.test.ts, apps/desktop/tests/sceneChip.test.tsx, docs/sdlc/changes/2026-08-31-simplify-provider-model-picker
next_trigger: human review and merge decision on PR #208
verification_mode: owner
verified_by: codex
verified_at: 2026-09-01
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
unavailable states remain legible. Choosing a Provider in the rail browses its models locally and
keeps the surface open. Selecting a model owned by another Provider applies Provider and model
atomically to a fresh session; it must never call `setModel` on the old Provider session.

Do not copy T3-only shortcut labels, legacy sections, or new favorite semantics. Keep reasoning
effort independent because it is a separate provider-owned configuration axis. ModelPicker uses in
Side Chat and Project Settings remain model-only and retain their current compact surface.

### Acceptance criteria

- [x] AC-1: Primary Composer controls show one Provider/model trigger instead of separate Provider
      and model chips.
- [x] AC-2: The unified popup has a Provider icon rail, model search, and a scrollable model list
      whose selected/favorite/default states reuse existing behavior.
- [x] AC-3: Switching the rail reveals that Provider's models without mutating the current session;
      selecting a foreign model starts a fresh session and applies Provider/model atomically.
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
Provider-enabled picker reuses the current registry in a compact icon rail, keeps the searchable
model projection and existing row states on the right, and leaves model-only callers on their
original surface. The former duplicate `ProviderPicker` was removed. Provider browsing stays local
to the open picker; choosing a foreign model invokes one `onProviderModel(provider, model)` intent,
and `App` creates a fresh session before pinning that Provider and applying its model. The separate
effort selector remains unchanged.

The popup uses shared menu width, separator, selectable-row, and quiet-fill primitives instead of
one-off picker border, ring, sizing, and selected-state contracts.

## Verification

Verdict: verified

The requested T3-style simplification is implemented and the changed behavior is covered by a
regression test plus an isolated rendered interaction check.

### Acceptance evidence

- AC-1: PASS — `bun test tests/sceneChip.test.tsx --test-name-pattern "combines Provider and model"`
  first failed against the separate Provider button, then passed after `SessionControls` exposed one
  Provider/model trigger.
- AC-2: PASS — `Browser screenshot inspection` showed the compact Provider rail, search field, scrollable
  model list, and selected/default/favorite row states in both the
  [dark desktop picker](../2026-08-31-replace-sidebar-drag-with-dnd-kit/evidence/model-picker-dark.png)
  and [light desktop picker](../2026-08-31-replace-sidebar-drag-with-dnd-kit/evidence/model-picker-light.png).
  At the emulated 800 px viewport, the [narrow picker](../2026-08-31-replace-sidebar-drag-with-dnd-kit/evidence/model-picker-narrow-dark.png)
  remained fully inside the viewport (`left 377`, `right 793`, width `416`).
- AC-3: PASS — `bun test tests/sceneChip.test.tsx` confirms Provider browsing invokes neither
  legacy session callback, while final selection emits exactly `grok / grok-4.6` through the atomic
  callback. `bun test tests/providerModelTransition.test.ts` confirms App creates a fresh draft
  before applying the pair, aborts without state mutation when draft creation fails, and skips
  creation for an existing blank draft. The rendered flow switched to Grok without closing,
  selected `Grok 4.6`, printed the exact `grok:grok-4.6:fresh-session` state, and updated the trigger
  without console errors.
- AC-4: PASS — `bun test tests/reasoningScaleRendered.test.tsx tests/sceneChip.test.tsx` passed 26
  tests and 92 expectations; `bunx tsc --noEmit` and focused ESLint also passed. Model-only picker
  tests remain in that passing suite.
- AC-5: PASS — `bun test` and `bun run build:renderer` passed. Repository lifecycle commands are
  recorded by the final verification pass below.

Residual risk: the visual exercise used an isolated renderer fixture rather than starting another
Core process, as required by the repository's single-owner rule. The App integration is covered by
the typed callback and fresh-session implementation, while the visual fixture proves the emitted
atomic intent rather than opening a real Provider subprocess. T3-only shortcut labels, Legacy
models, and global favorite navigation were intentionally not copied; no provider protocol changed.

## Review and release

Approval: [PR #208](https://github.com/IchenDEV/codeTwo/pull/208) created by user authorization;
merge pending human review.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change bundle.
No release: PR creation is authorized; merge, deployment, and release remain unauthorized.

## Feedback

The T3 and CodeTwo screenshots are the accepted reference and current-state evidence; no post-change
feedback exists yet.
