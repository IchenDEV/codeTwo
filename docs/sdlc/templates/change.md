---
id: change-YYYY-MM-DD-short-slug
kind: change
schema: 2
status: draft
risk: medium
owner: unassigned
approvers: []
approved_at: pending
created: YYYY-MM-DD
updated: YYYY-MM-DD
source: <stable request, issue, Incident, or feedback reference>
inputs: pending
outputs: pending
scope: <comma-separated repository files or directory prefixes>
next_trigger: owner reviews the Intent and observable acceptance
verification_mode: owner
verified_by: pending
verified_at: pending
---

Copy this template to `docs/sdlc/changes/<YYYY-MM-DD-short-slug>/change.md`. Keep evidence beside
it under `evidence/` when colocation is useful; do not copy lifecycle state into separate stage
files.

# Change title

## Intent

Record the problem and evidence, desired outcome, affected users and systems, constraints, and
non-goals. Do not lock in an implementation here.

## Spec

Link accepted design or ADR evidence when it exists. Otherwise record required behavior, failure
paths, interfaces, compatibility, security/data/operations constraints, rollout, rollback, and open
decisions.

### Acceptance criteria

- [ ] AC-1: State one observable result and its named verification method.

## Decision and gates

Record who accepted or blocked Intent/Spec and the stable source. List separate security, data,
design, merge, release, deployment, or production Gates. Implementation may start only after the
Artifact reaches `executing`.

## Plan

Map the smallest steps to acceptance criteria, affected modules, verification, dependencies, risk,
rollback, and Gates. Keep this executable, not ceremonial.

## Build

Link commits or the PR and record material deviations from the accepted Plan.

## Verification

Verdict: pending.

### Acceptance evidence

- AC-1: pending — map this to an actual command or linked runtime/visual artifact.

Preserve failed iterations and state skipped checks explicitly. Before `verified`, replace every
pending mapping with exactly one `PASS` mapping that cites a command or link. A `failed` change uses
`PASS`, `FAIL`, or `BLOCKED` mappings and retains at least one `FAIL`.

Residual risk: pending.

## Review and release

Approval: pending.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: pending.
No release: pending.

Before release readiness, replace Rollback with the concrete repository, migration, configuration,
or forward-fix path. Before closing an unreleased change, replace No release with the reviewed
disposition.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

Link follow-up change, Incident, or Eval Artifacts. State that no feedback exists only after a real
observation boundary.
