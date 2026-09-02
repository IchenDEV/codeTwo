---
id: "2026-09-01-floating-pr-inspector-prototype"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-09-01
source: direct user visual-design feedback on the verified PR workspace and permanent UI Lab
risk: low
approved_by: "userthe 2026-09-01 request to try the PR workspace's trailing Inspector as a floating panel"
approved_at: "2026-09-01"
---

# Intent: Prototype a floating PR Inspector

## Problem

The verified PR workspace currently attaches its contextual Inspector directly to the primary
detail column. The user asked to try the trailing panel as a floating surface. The question is
visual and spatial: whether detaching the Inspector improves hierarchy without making PR content
feel obstructed or shrinking the primary review region too far.

The desired outcome is a reversible UI Lab comparison using the real `PullRequestsPage` and its
deterministic fixture. This change does not alter the production page, GitHub behavior, persisted
state, or remote data. It should make the requested floating direction the default comparison
while preserving the existing attached layout and a more aggressive overlay as references.

## Proposed outcome

The verified PR workspace currently attaches its contextual Inspector directly to the primary

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's direct request accepts this low-risk, development-only visual prototype for execution.
Codex owns implementation and owner verification. Selecting and promoting a production variant is
a later human design Gate. The prototype request alone did not authorize GitHub mutation; the
user's later `pr` request authorizes including this historical decision record in the verified
Draft PR scope, but does not authorize merge, release, deployment, or production mutation.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's direct request accepts this low-risk, development-only visual prototype for execution.
Codex owns implementation and owner verification. Selecting and promoting a production variant is
a later human design Gate. The prototype request alone did not authorize GitHub mutation; the
user's later `pr` request authorizes including this historical decision record in the verified
Draft PR scope, but does not authorize merge, release, deployment, or production mutation.
