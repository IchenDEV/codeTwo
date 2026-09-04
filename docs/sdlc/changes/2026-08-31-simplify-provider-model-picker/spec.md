---
id: "2026-08-31-simplify-provider-model-picker"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: intent.md
risk: medium
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Spec: Simplify Provider and model selection

## Requirements

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

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The direct user request approves this medium-risk interaction simplification. The follow-up `pr`
authorizes PR creation only. Human review remains required before merge; release, deployment, and
external mutation remain unauthorized.

## Acceptance criteria

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

## Decision

The direct user request approves this medium-risk interaction simplification. The follow-up `pr`
authorizes PR creation only. Human review remains required before merge; release, deployment, and
external mutation remain unauthorized.
