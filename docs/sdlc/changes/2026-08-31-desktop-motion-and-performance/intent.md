---
id: "2026-08-31-desktop-motion-and-performance"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-31
source: current user request and follow-up that performance must be investigated independently from animation coverage
risk: medium
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Intent: Repair desktop motion and interaction performance

## Problem

The user reported that C2 feels slow and separated the symptom into two visible paths: some pages
have no entrance feedback, while other animation paths drop frames. The follow-up explicitly
requires a broader application-performance investigation rather than treating added animation as
the performance fix.

The measured baseline separates four concerns. The current native instance is quiet while idle,
with the renderer and Core each remaining around 0–0.5% CPU after instrumentation stops, so this
change does not pursue a speculative background polling rewrite. The old task board rendered all
141 tasks and produced a cold-open hitch trace with a 25 ms median render interval, 29.17 ms p95,
and a 54.17 ms maximum. The current progressive board renders three cards per lane by default and
improves that cold trace to 8.33 ms median, 16.67 ms p95, and 33.33 ms maximum, but its whole-page
translated entrance still produces a small cold-render tail. The current renderer entry is 4.58 MB
raw and 1.37 MB gzip while optional full-page modules are statically imported. Task-board, pull-
request, and plugin searches also filter their complete collections on the urgent input update.

This change fixes those measured paths without changing Core protocols, persisted data, page
information architecture, or release behavior. It preserves the existing three-card progressive
task-board contract and Reduced Motion behavior.

## Proposed outcome

The user reported that C2 feels slow and separated the symptom into two visible paths: some pages

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user explicitly approved implementation and then required the performance investigation to be
completed as part of the same request. The repository's existing motion tokens, progressive task
board, React lazy loading, deferred values, and CSS containment are sufficient; no new animation
library or virtualization dependency is approved. Merge, release, deployment, and termination of
another live C2 process remain separate human Gates.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user explicitly approved implementation and then required the performance investigation to be
completed as part of the same request. The repository's existing motion tokens, progressive task
board, React lazy loading, deferred values, and CSS containment are sufficient; no new animation
library or virtualization dependency is approved. Merge, release, deployment, and termination of
another live C2 process remain separate human Gates.
