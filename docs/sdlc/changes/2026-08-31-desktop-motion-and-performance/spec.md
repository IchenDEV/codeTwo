---
id: "2026-08-31-desktop-motion-and-performance"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: intent.md
risk: medium
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Spec: Repair desktop motion and interaction performance

## Requirements

Optional full-page product surfaces load on demand instead of joining the initial renderer entry.
The persistent session workspace remains available while a page chunk resolves, with a small
accessible loading state rather than an empty frame. Page modules share one entrance-motion role:
an opacity-only compositor transition for data-heavy pages, using the documented 280 ms page
duration and entrance curve. No full-page data surface translates its painted contents during
entry. Reduced Motion continues to collapse semantic durations.

Search inputs update immediately while collection filtering may use React's deferred value. The
task board, pull-request page, and plugin manager must present results for the latest settled query
without blocking keystroke feedback. Long session-rail rows may defer off-screen paint with an
intrinsic-size contract, but all rows remain in the semantic and keyboard navigation order.

Rollback is a repository revert of this change's lazy page boundary, shared motion class, deferred
search values, session-row containment, tests, and Artifact edits.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user explicitly approved implementation and then required the performance investigation to be
completed as part of the same request. The repository's existing motion tokens, progressive task
board, React lazy loading, deferred values, and CSS containment are sufficient; no new animation
library or virtualization dependency is approved. Merge, release, deployment, and termination of
another live C2 process remain separate human Gates.

## Acceptance criteria

- [x] AC-1: Optional Task board, Pull requests, Automations, Plugins, and Docker page implementations are
  absent from the initial renderer module and load only when requested.
- [x] AC-2: All five full-page routes expose the same shared page entrance class; the class animates only
  opacity and never translates a full data surface.
- [x] AC-3: Reduced Motion disables the page entrance through the existing semantic-duration contract.
- [x] AC-4: Task-board, pull-request, and plugin search filtering consumes a deferred query while the
  controlled input retains the immediate query.
- [x] AC-5: The task board still renders at most three initial cards per lane for a large persisted board.
- [x] AC-6: Off-screen session rows defer rendering work without removing sessions from DOM, keyboard,
  or accessibility order.
- [x] AC-7: The renderer entry shows a measurable raw and gzip reduction from the 4,575,989 byte and
  1,368,081 byte baseline, and route chunks are visible in the build output.
- [x] AC-8: Focused tests, type checking, renderer build, lint, SDLC checks, diff checks, console
  checks, and rendered route/search interaction verification pass.
- [x] AC-9: Browser frame sampling keeps repeated route transitions below a 33 ms long-frame ceiling;
  native WebKit evidence is reported separately when the current checkout can be launched without
  violating the single-profile ownership rule.

## Decision

The user explicitly approved implementation and then required the performance investigation to be
completed as part of the same request. The repository's existing motion tokens, progressive task
board, React lazy loading, deferred values, and CSS containment are sufficient; no new animation
library or virtualization dependency is approved. Merge, release, deployment, and termination of
another live C2 process remain separate human Gates.
