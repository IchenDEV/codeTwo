---
id: "2026-08-31-hide-codex-host-context"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-31
source: direct user feedback on 2026-08-31 that default C2 injection is excessive and remains visible in Codex
risk: medium
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Intent: Hide C2 host context from Codex user prompts

## Problem

The user reported that C2's default injected context is too large and remains visible in Codex.
The affected surface is the provider-owned Codex conversation: host routing, project rules,
recalled memory, and Auto Scene control data must not masquerade as text authored by the user.

The desired outcome is a concise Codex task whose visible user turn contains the user's document
and explicitly attached content only. C2 may still provide required host policy through a
provider-supported non-user instruction channel, rely on Codex-native project instruction loading,
or expose optional context through an explicit feature boundary. Other providers retain their
existing prompt transport unless the same boundary can be changed without weakening behavior.

Changing permission policy, Sites deployment safety, memory storage, scene permissions, the ACP
protocol, provider packages, or transcript history is out of scope.

## Proposed outcome

The user reported that C2's default injected context is too large and remains visible in Codex.

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's direct product feedback approves this Intent, implementation, and local verification.
The user is the named Intent approver and Codex is the implementation owner. No deployment,
release, merge, production mutation, provider-package publication, or user-data migration is
authorized.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's direct product feedback approves this Intent, implementation, and local verification.
The user is the named Intent approver and Codex is the implementation owner. No deployment,
release, merge, production mutation, provider-package publication, or user-data migration is
authorized.
