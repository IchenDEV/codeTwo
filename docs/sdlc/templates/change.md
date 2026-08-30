---
id: change-YYYY-MM-DD-short-slug
kind: change
status: draft
owner: unassigned
approvers: []
created: YYYY-MM-DD
updated: YYYY-MM-DD
source: <stable request, issue, Incident, or feedback reference>
inputs: pending
outputs: pending
next_trigger: owner reviews the Intent and observable acceptance
---

# Change title

## Intent

Record the problem and evidence, desired outcome, affected users and systems, constraints, and
non-goals. Do not lock in an implementation here.

## Spec

Link accepted design or ADR evidence when it exists. Otherwise record required behavior, failure
paths, interfaces, compatibility, security/data/operations constraints, rollout, rollback, and open
decisions.

### Acceptance criteria

- [ ] State one observable result and its named verification method.

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

Map every criterion to an actual command or runtime/visual result. Preserve failed iterations and
state skipped checks explicitly.

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
