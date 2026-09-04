---
id: "2026-08-31-radius-compliance"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-31
source: direct user request to correct every radius that does not follow the project standard
risk: medium
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Intent: Enforce the product radius scale everywhere

## Problem

The user asked for every noncompliant corner radius in the desktop product to be corrected, after
an audit found legacy Tailwind utilities, direct token escape hatches, undersized fallbacks, and
unrestricted fully rounded geometry. The desired result is one visible and enforceable product
scale: structural square edges use 0, controls and non-circular capsules use 12px, cards and panels
use 16px, and 24px remains exclusive to the Composer. Fully round geometry is reserved for actual
circles.

The affected systems are renderer components, embedded visualization and annotation surfaces,
radius tokens and documentation, design-system enforcement, and focused rendered contracts. Data,
desktop process ownership, provider behavior, release packaging, and unrelated in-progress UI work
are non-goals. The initial request authorized implementation and visual correction. The user
subsequently authorized PR creation and merge on 2026-08-31; release, deployment, and production
mutation remain out of scope.

## Proposed outcome

The user asked for every noncompliant corner radius in the desktop product to be corrected, after

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's direct implementation request accepts Intent and the visible radius hierarchy. The
repository's existing semantic token system and current UI documentation are the design source of
truth. Human review remained the next Gate after verification. The user accepted that Gate and
authorized PR creation and merge on 2026-08-31. Release, deployment, and production mutation remain
unauthorized.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's direct implementation request accepts Intent and the visible radius hierarchy. The
repository's existing semantic token system and current UI documentation are the design source of
truth. Human review remained the next Gate after verification. The user accepted that Gate and
authorized PR creation and merge on 2026-08-31. Release, deployment, and production mutation remain
unauthorized.
