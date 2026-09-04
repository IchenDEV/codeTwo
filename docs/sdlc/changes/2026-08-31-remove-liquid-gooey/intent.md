---
id: "2026-08-31-remove-liquid-gooey"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-31
source: current user request and the element-level measurements recorded during the desktop performance investigation
risk: medium
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Intent: Remove the liquid interaction renderer

## Problem

The user asked to completely remove the liquid plugin after element-level profiling identified it
as a major source of interaction latency. In a 200-row selection harness, one selection using the
current liquid path caused 78 layouts, 89 style recalculations, and 57.286 ms of task time; the
plain selected-state path caused no layouts or style recalculations and 3.026 ms of task time.

This change removes the dependency and every runtime wrapper, SVG filter, observer, measurement,
fallback flag, and plugin-specific attribute. Session selection, tabs, and composer run/stop
controls retain visible, accessible state using the existing C2 tokens and native CSS. It does not
redesign those controls or change unrelated application motion.

## Proposed outcome

The user asked to completely remove the liquid plugin after element-level profiling identified it

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's implementation request approves Intent and deletion. Existing Base UI state attributes,
C2 color tokens, and CSS transitions are sufficient; no replacement animation dependency is
approved. Merge, release, deployment, and termination of a live C2 process remain separate human
Gates.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's implementation request approves Intent and deletion. Existing Base UI state attributes,
C2 color tokens, and CSS transitions are sufficient; no replacement animation dependency is
approved. Merge, release, deployment, and termination of a live C2 process remain separate human
Gates.
