---
id: "2026-09-07-astra-scaffold-cleanup"
stage: intent
schema: 3
status: accepted
owner: codex
created: "2026-09-07"
source: "user"
risk: "low"
approved_by: "Chen Li"
approved_at: 2026-09-07
---

# Intent: Astra Scaffold Cleanup

## Problem

Always-on instructions contain an overbroad Sites trigger, a long development-profile specification, duplicated verification commands, and an ambiguous lifecycle-skill trigger.

## Proposed outcome

Narrow Sites and lifecycle-skill triggers, move the profile contract into a reference document, and remove duplicate handoff checks.

## Affected users and systems

CodeTwo contributors and provider sessions that receive the host Sites instructions.

## Constraints

Preserve Ponytail unchanged, stage approvals, production and sensitive-action approvals, live Core ownership, and all multi-instance acceptance requirements.

## Out of scope

No profile implementation, permission changes, deployment, plugin installation, model-specific prompt forks, or unrelated cleanup.

## Success signals

The four approved edits are present; profile detail and safety clauses are preserved; routing regression and repository Gates pass.

## Open questions

None within the approved audit scope.

## Decision

Chen Li approved the concrete edits from the preceding audit with “除`ponytail` 立即处理” on 2026-09-07. This approval covers the stated outcome, constraints, and surgical implementation plan for findings 2–5.
