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
outputs: one Composer model entry with a CodeTwo Provider switcher, search, and model selection
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
model picker with a compact horizontal Provider switcher above the searchable model list. Show
Provider icons and names instead of copying T3's permanent left icon rail. Reuse the current
Provider registry, ProviderIcon, model grouping, favorites, hidden-model preferences,
adapter-owned model options, disabled states, and existing callbacks. Provider loading, retry, and
unavailable states remain legible. Choosing a Provider in the switcher browses its models locally and
keeps the surface open. Selecting a model owned by another Provider applies Provider and model
atomically to a fresh session; it must never call `setModel` on the old Provider session.
An installed Provider with an empty pre-session model catalogue is selected atomically with its
model left unspecified; the picker must not invent or persist a preset model.

Do not copy T3-only shortcut labels, legacy sections, or new favorite semantics. Keep reasoning
effort independent because it is a separate provider-owned configuration axis. ModelPicker uses in
Side Chat and Project Settings remain model-only and retain their current compact surface.

### Acceptance criteria

- [x] AC-1: Primary Composer controls show one Provider/model trigger instead of separate Provider
      and model chips.
- [x] AC-2: The unified popup has a horizontally scrollable Provider switcher with icon, name, and
      availability, plus model search and a scrollable model list whose selected/favorite/default
      states reuse existing behavior.
- [x] AC-3: Switching the Provider row reveals that Provider's models without mutating the current session;
      selecting a foreign model starts a fresh session and applies Provider/model atomically. An
      installed Provider with no catalogue is selectable with `model = null`.
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
2. Extend ModelPicker with an optional Provider switcher while preserving model-only callers.
3. Render an isolated realistic provider/model fixture in dark, light, and 800 px states; compare
   it with the T3 reference to confirm CodeTwo keeps a distinct hierarchy and component language.

Rollback restores the separate ProviderPicker render in SessionControls and removes the optional
Provider switcher from ModelPicker.

## Build

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

## Verification

Verdict: verified

Review-feedback corrections are included in this verdict.

The requested simplification now uses a CodeTwo-specific hierarchy rather than copying T3's left
rail, and the changed behavior is covered by a regression test plus isolated rendered interaction
checks.

### Acceptance evidence

- AC-1: PASS — `bun test tests/sceneChip.test.tsx --test-name-pattern "combines Provider and model"`
  first failed against the separate Provider button, then passed after `SessionControls` exposed one
  Provider/model trigger.
- AC-2: PASS — the initial [dark rail baseline](../2026-08-31-replace-sidebar-drag-with-dnd-kit/evidence/model-picker-dark.png),
  [light rail baseline](../2026-08-31-replace-sidebar-drag-with-dnd-kit/evidence/model-picker-light.png),
  and [800 px rail baseline](../2026-08-31-replace-sidebar-drag-with-dnd-kit/evidence/model-picker-narrow-dark.png)
  record the layout replaced by this feedback. The final Browser pass inspected the new horizontal
  Provider switcher, search field, scrollable model list, and selected/default/favorite row states
  in dark, light, and an 800 px iframe viewport: the popup remained fully visible, long Provider
  sets scrolled horizontally, and no
  scrollbar or clipped primary content remained. Direct `view_image` comparison confirmed that
  the T3 vertical rail, shortcut badges, and legacy section were not copied. A final rendered
  Browser check confirmed the compact switcher exposes `Codex` visually and through its accessible
  label, with zero remaining `OpenAI Codex` labels; the screenshot is
  `/tmp/codetwo-provider-picker-codex-label.png`. That label-only fixture contained two placeholder
  models and is not model-catalogue completeness evidence. A live `codex app-server` `model/list`
  query and the existing Core catalogue test confirm all seven current families; the frontend
  projects the Provider-owned list without maintaining a second hard-coded catalogue.
- AC-3: PASS — `bun test tests/sceneChip.test.tsx` confirms Provider browsing invokes neither
  legacy session callback, while final selection emits exactly `grok / grok-4.6` through the atomic
  callback. `bun test tests/providerModelTransition.test.ts` confirms App creates a fresh draft
  before applying the pair, aborts without state mutation when draft creation fails, and skips
  creation for an existing blank draft. The rendered flow switched to Grok without closing,
  selected `Grok 4.6`, printed the exact `grok:grok-4.6:fresh-session` state, and updated the trigger
  without console errors. The added empty-catalogue regression emits exactly `pi / null`; an
  isolated Browser interaction then showed `Provider: pi`, `Model: 未指定`, and a closed picker.
- AC-4: PASS — `bun test tests/reasoningScaleRendered.test.tsx tests/sceneChip.test.tsx` passed 26
  tests and 92 expectations; `bunx tsc --noEmit` and focused ESLint also passed. Model-only picker
  tests remain in that passing suite.
- AC-5: PASS — the final `bun test` passed 809 tests and 3,853 expectations; `bun run build`
  completed the production renderer and native package. Repository lifecycle commands are recorded
  by the final verification pass below.

### Visual comparison ledger

- Information architecture: T3's permanent vertical icon rail became a CodeTwo horizontal
  Provider switcher above the model content.
- Readability: icon-only navigation became icon plus Provider name, while availability remains a
  small semantic status dot.
- Density: the existing `w-menu-wide` popup, shared compact controls, and model-row rhythm remain;
  no shortcut badges, Legacy section, or second navigation column were added.
- Palette and typography: all surfaces, selected states, text sizes, radii, separators, and shadows
  use existing CodeTwo tokens and primitives in both dark and light themes.
- Responsive behavior: the Provider switcher scrolls horizontally without a visible scrollbar,
  and the full model workflow remained visible in the 800 px rendered state.
- Visible-copy diff: the compact Provider label was shortened from `OpenAI Codex` to the requested
  `Codex`; no new heading, category label, badge, or explanatory copy was introduced.

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

The T3 and CodeTwo screenshots are the accepted reference and current-state evidence. PR review
found that a Provider with no pre-session model catalogue had no selection path. The user clarified
that such Providers should be selectable directly and do not require any preset model.
After the reviewed fixes, the user requested a more polished UI that keeps the simplified unified
flow without copying T3's permanent left icon rail.
The user then requested the compact switcher label `OpenAI Codex` be shortened to `Codex`.
After reviewing that screenshot, the user noted that the model list appeared incomplete. Diagnosis
confirmed the screenshot fixture contained only two placeholder model families while the current
Codex catalogue exposes seven; the acceptance evidence must use the complete catalogue.
At the user's request to apply Ponytail, the duplicated seven-model frontend fixture was removed;
the existing Core catalogue contract and the Provider-owned frontend projection are the smaller
durable seams.
