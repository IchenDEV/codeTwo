---
id: "2026-08-31-remove-composer-resize-grip"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-31
source: direct user request with screenshot highlighting the non-working composer resize grip
risk: low
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Intent: Remove the composer resize grip

## Problem

The user identified the small horizontal grip at the top center of the prompt Composer and asked
to remove it because it cannot actually be dragged in the product. Remove the misleading control
and its resize-only state rather than leaving an invisible or dormant interaction. Preserve the
Composer card, its bounded compact height, the explicit full-page toggle, editor content, and all
send controls. The follow-up `pr` authorizes PR creation for this verified scope only; a broader
Composer redesign, merge, or release remains unauthorized.

## Proposed outcome

The user identified the small horizontal grip at the top center of the prompt Composer and asked

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's direct request accepts this low-risk deletion, and the follow-up `pr` authorizes PR
creation. Human review remains required before merge. No release, deployment, or external mutation
is authorized.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's direct request accepts this low-risk deletion, and the follow-up `pr` authorizes PR
creation. Human review remains required before merge. No release, deployment, or external mutation
is authorized.
