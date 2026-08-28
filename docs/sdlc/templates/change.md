---
id: change-YYYY-MM-DD-short-slug
kind: change
status: draft
owner: unassigned
created: YYYY-MM-DD
updated: YYYY-MM-DD
next_trigger: owner reviews intent and acceptance criteria
---

# Change title

## Intent

Describe the problem, source evidence, desired outcome, affected users/systems, constraints, and
non-goals without locking in an implementation.

## Spec

Link an accepted design/ADR when one exists. Otherwise record required behavior, failure paths,
interfaces, compatibility, rollout, rollback, and open decisions.

### Acceptance criteria

- [ ] Each criterion is observable and has a named verification method.

## Decision and gates

Record who accepted the Intent/Spec, the source of that decision, and any separate security, data,
design, merge, or release Gate.

## Plan

Map the smallest implementation steps to acceptance criteria, affected modules, verification, risk,
and rollback.

## Build

Link implementation commits or the PR. Record material deviations from the accepted Plan.

## Verification

Record actual commands, environments, results, runtime/visual evidence, failed iterations, and
residual risk. Do not mark the artifact `verified` without evidence.

## Review and release

Record PR review, CI, release identity, target environment, smoke evidence, and rollback. Preparing
this section does not authorize merge or release.

## Feedback

Link follow-up Intent, Incident, or Eval artifacts. State `none observed` only after an actual
observation boundary.
