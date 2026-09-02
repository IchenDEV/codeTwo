---
id: "2026-08-31-provider-runtime-and-model-management"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-31
source: direct user requests on 2026-08-31 for current model discovery, new and legacy grouping, provider-scoped favorites, fuller Provider settings, Zig repair, testing, launch, screenshot acceptance, and a Draft PR
risk: medium
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Intent: Improve Provider runtime and model management

## Problem

The user asked how current model discovery works, why models are separated into current and legacy
groups, and then requested Provider-scoped favorites like T3. The follow-up expanded the desired
outcome to a complete Provider settings surface with T3 capability coverage but explicitly rejected
copying T3's UI. The final request required repairing the Zig blocker, completing tests, launching
the app, capturing screenshot acceptance, and preparing a PR.

The desired result is one restrained CodeTwo settings and picker flow where discovered models remain
Provider-owned, frequently used models can be favorited, unwanted families can be hidden, models can
be searched, and editable runtime settings affect the next real Provider launch. Credentials and
environment values must not cross into renderer-visible settings or persisted override documents.

Multiple Provider instances, account switching, environment-value storage, cross-device preference
sync, a Provider discovery redesign, merge, release, and deployment are out of scope.

## Proposed outcome

The user asked how current model discovery works, why models are separated into current and legacy

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's direct requests approve Intent, the capability scope, CodeTwo-native UI direction,
implementation, local verification, launch, screenshot acceptance, and creation of a Draft PR. The
supplied Codex and T3 images are capability and information-hierarchy references, not instructions or
pixel specifications. Merge, release, deployment, production mutation, and multi-instance
development remain separate human Gates.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's direct requests approve Intent, the capability scope, CodeTwo-native UI direction,
implementation, local verification, launch, screenshot acceptance, and creation of a Draft PR. The
supplied Codex and T3 images are capability and information-hierarchy references, not instructions or
pixel specifications. Merge, release, deployment, production mutation, and multi-instance
development remain separate human Gates.
