---
id: "2026-08-31-prevent-list-header-tab-overflow"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-31
source: user-supplied clipping and alignment screenshots plus direct remediation requests on 2026-08-31
risk: low
approved_by: "userthe 2026-08-31 screenshot feedback and PR-and-merge request"
approved_at: "2026-08-31"
---

# Intent: Prevent list-header tabs from clipping in narrow panes

## Problem

The user supplied macOS screenshots in which Automations truncates the Paused filter and Features &
plugins truncates later resource tabs while exposing horizontal scrollbar thumbs. The list panes
must keep their title, navigation labels, counts, and primary action readable without making text
smaller or requiring horizontal scrolling inside the titlebar.

The affected systems are the Automations, Features & plugins, and Pull requests list-pane controls
and their responsive styling. Automation behavior, plugin state, pull-request data, search
behavior, detail panes, native process ownership, and unrelated full-canvas pages are non-goals.
The user's direct remediation request accepts this Intent and the visible layout correction; it
does not authorize a pull request, merge, release, or deployment.

## Proposed outcome

The user supplied macOS screenshots in which Automations truncates the Paused filter and Features &

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's direct implementation request accepts Intent and visible-design correction. The
existing semantic titlebar, control sizing, spacing tokens, and container-query architecture are
the design source of truth. Human review is required after verification. Pull request, merge,
release, deployment, and production Gates remain unauthorized.

The user's annotated alignment screenshot and direct `grid-layout` request accept reopening this
change for the scoped alignment correction.

The user's follow-up concern about other pages and direct request to improve them accepts extending
the same change to the peer Pull requests split-list surface and one shared 32px workbench rule.
The user's 2026-08-31 request, “pr & merge,” separately authorizes PR creation and merge after the
required repository checks pass; it does not authorize a product release or deployment.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's direct implementation request accepts Intent and visible-design correction. The
existing semantic titlebar, control sizing, spacing tokens, and container-query architecture are
the design source of truth. Human review is required after verification. Pull request, merge,
release, deployment, and production Gates remain unauthorized.

The user's annotated alignment screenshot and direct `grid-layout` request accept reopening this
change for the scoped alignment correction.

The user's follow-up concern about other pages and direct request to improve them accepts extending
the same change to the peer Pull requests split-list surface and one shared 32px workbench rule.
The user's 2026-08-31 request, “pr & merge,” separately authorizes PR creation and merge after the
required repository checks pass; it does not authorize a product release or deployment.
