---
id: "2026-08-31-provider-runtime-and-model-management"
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

# Spec: Improve Provider runtime and model management

## Requirements

Provider runtime overrides are durable under the desktop data directory and apply after the Provider
graph reloads, leaving an already-running session on its existing process. Supported overrides are a
display name, ACP command, explicit argument vector, supported Codex or Claude configuration path,
and names of environment variables forwarded from the host process. Renderer summaries expose only
safe effective metadata. Invalid Provider ids, environment names, embedded NULs, and oversized
values fail closed.

The Provider page expands existing CodeTwo rows into runtime and model groups while preserving
install, update, enable, refresh, version, launch-mode, health, and capability behavior. Model
favorites and visibility are versioned local preferences keyed by Provider and normalized model
identity. Corrupt storage degrades to empty preferences. The active model remains visible even when
an older preference hides it.

The Composer keeps its compact adjacent Provider and model controls. The model picker searches
visible names, ids, and descriptions; favorites appear first exactly once; selection, reasoning,
busy-state locking, default badges, and both flat and ACP configuration-option catalogues keep their
existing semantics.

The vendored Ghostty wrapper applies an upstream-traceable Xcode 27 SDK math-header compatibility
patch without disabling SIMD or changing the pinned Ghostty and Zig revisions. Repeated builds must
detect the already-applied patch and remain idempotent.

Rollback is a revert of the Provider override document and command, picker/settings integration,
local preference modules, and Ghostty compatibility patch. Existing Provider enablement, discovery,
and session data remain backward compatible.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's direct requests approve Intent, the capability scope, CodeTwo-native UI direction,
implementation, local verification, launch, screenshot acceptance, and creation of a Draft PR. The
supplied Codex and T3 images are capability and information-hierarchy references, not instructions or
pixel specifications. Merge, release, deployment, production mutation, and multi-instance
development remain separate human Gates.

## Acceptance criteria

- [x] AC-1: Runtime display name, command, arguments, supported configuration directory, and
  forwarded environment names persist, validate, reload the graph, and affect the next launch.
- [x] AC-2: Provider settings preserve lifecycle and capability management in a CodeTwo-native
  expandable layout rather than copying the supplied T3 geometry.
- [x] AC-3: Favorites, model visibility, restore-all, and search remain Provider-scoped, tolerate
  corrupt storage, avoid duplicates, and preserve active selection and reasoning behavior.
- [x] AC-4: Persisted and renderer-visible Provider configuration never contains forwarded
  environment values or credentials, and unsafe configuration fails closed.
- [x] AC-5: Focused Provider, storage, rendered-interaction, Zig integration, renderer build, and
  lifecycle checks pass on the branch rebased to latest `main`.
- [x] AC-6: Real rendered-window acceptance covers runtime fields, model visibility, favorites,
  search, light and dark appearance, and a narrow layout without horizontal overflow.

## Decision

The user's direct requests approve Intent, the capability scope, CodeTwo-native UI direction,
implementation, local verification, launch, screenshot acceptance, and creation of a Draft PR. The
supplied Codex and T3 images are capability and information-hierarchy references, not instructions or
pixel specifications. Merge, release, deployment, production mutation, and multi-instance
development remain separate human Gates.
