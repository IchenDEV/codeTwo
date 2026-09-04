---
id: "2026-09-01-taskboard-mutation-gate"
stage: spec
schema: 3
status: accepted
owner: Codex
created: 2026-09-01
based_on: intent.md
risk: low
approved_by: "[chenli]"
approved_at: "2026-09-01"
---

# Spec: Restore the TaskBoard mutation Gate

## Requirements

The existing workspace-model test suite must assert the translated label for all four projected
lanes. It must also prove that an actively running session uses the success tone even if its
persisted archived flag is set, so removing the explicit running branch changes an observed result.
The existing 100% mutation threshold remains unchanged.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

Chenli approved this correction by requesting “修复” after reviewing the failing PR #217 GitHub
Actions job. Codex owns implementation and verification. Human review and merge remain separate
Gates; this request does not authorize merge, release, deployment, or production mutation.

## Acceptance criteria

- [x] AC-1: Workspace-model tests distinguish the queue, running, needs-you, and done lane labels.
- [x] AC-2: Workspace-model tests distinguish the running tone from the archived-session fallback.
- [x] AC-3: The narrowed reproduction and complete TaskBoard mutation Gate report zero surviving mutants, and the desktop regression suite remains green.

## Decision

Chenli approved this correction by requesting “修复” after reviewing the failing PR #217 GitHub
Actions job. Codex owns implementation and verification. Human review and merge remain separate
Gates; this request does not authorize merge, release, deployment, or production mutation.
