---
id: "2026-08-31-group-session-toolbar-actions"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-31
source: user-supplied session-toolbar screenshots and iterative visual feedback on 2026-08-31
risk: medium
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Intent: Clarify the session toolbar hierarchy

## Problem

The user reported that the session titlebar mixed wide and narrow buttons, placed controls too close
together, varied icon tone, and exposed too many similar glyphs to distinguish reliably. The final
reference establishes hierarchy only: primary task actions should read as separate filled control
islands, while contextual and layout actions remain bare icons. Its large capsule radius and literal
glyphs are not authoritative.

The affected system is the renderer session titlebar. Action behavior, menu destinations, plugin
contributions, pane creation, Dock state, titlebar height, and application data are otherwise
unchanged.

## Proposed outcome

The user reported that the session titlebar mixed wide and narrow buttons, placed controls too close

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The final screenshot-backed direction supersedes experiments with transparent text-only items,
outlined capsules, split-button chevrons, and a shared package. After the verified screenshot was
shown, the user explicitly requested a PR on 2026-08-31. PR creation is authorized; merge, release,
deployment, and production mutation remain separate pending Gates.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The final screenshot-backed direction supersedes experiments with transparent text-only items,
outlined capsules, split-button chevrons, and a shared package. After the verified screenshot was
shown, the user explicitly requested a PR on 2026-08-31. PR creation is authorized; merge, release,
deployment, and production mutation remain separate pending Gates.
