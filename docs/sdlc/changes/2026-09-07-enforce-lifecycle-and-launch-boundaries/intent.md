---
id: "2026-09-07-enforce-lifecycle-and-launch-boundaries"
stage: intent
schema: 3
status: accepted
owner: codex
created: "2026-09-07"
source: "user"
risk: "medium"
approved_by: "Chen Li"
approved_at: 2026-09-07
---

# Intent: Enforce Lifecycle And Launch Boundaries

## Problem

Launch modes can terminate an existing development owner; lifecycle checks can reuse unchanged historical approval, hide conflicting acceptance results, accept unfinished markers, and reject legitimate draft stages.

## Proposed outcome

Enforce the existing launch and lifecycle boundaries with targeted regressions and matching operator documentation.

## Affected users and systems

CodeTwo contributors, their active development sessions, and repository reviewers.

## Constraints

Preserve user processes, OS ownership requirements, human approval, release checks, historical evidence, and the preceding scaffold cleanup. No new dependencies.

## Out of scope

Complete multi-instance profiles, native Core locking, conditional provider-rule loading, deployment, merge, and Ponytail changes.

## Success signals

The five reproduced failures are covered by passing targeted regressions and repository Gates.

## Open questions

None. Exact repeated historical evidence is one logical record; differing duplicate records are rejected.

## Decision

Chen Li authorized the five concrete fixes proposed in the preceding investigation with “开始修复” on 2026-09-07.
