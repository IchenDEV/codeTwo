---
id: "2026-08-31-strict-sdlc-v2"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: intent.md
risk: medium
approved_by: "userthe current 2026-08-31 implementation request"
approved_at: "2026-08-31"
---

# Spec: Harden CodeTwo's AI-native SDLC contract

## Requirements

- Schema-v2 change Artifacts declare risk, approved-at time, explicit repository scope, and
  verification identity in machine-readable flat metadata.
- Any change Artifact added or updated beside repository implementation must use schema v2. Legacy
  Artifacts remain readable until they are changed, at which point they are upgraded.
- The branch or worktree Gate rejects changed files not covered by an executing-or-later Artifact's
  explicit scope.
- Schema-v2 acceptance criteria use stable `AC-N` identifiers. `verified` requires one concrete
  `PASS` evidence mapping per criterion; `failed` retains `PASS`, `FAIL`, or `BLOCKED` mappings and
  at least one observed failure.
- High and critical risk changes require an approver and verifier distinct from the implementation
  owner. Lower-risk changes still retain separate merge and release human Gates.
- The same deterministic Gate runs against committed PR differences in CI and against local staged,
  unstaged, and untracked changes before handoff.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's current direct implementation request accepts this Intent and its observable Spec, with
the user as named approver. It authorizes repository implementation and local verification only.
Merge, push, pull-request creation, release, deployment, external branch-protection changes, and
production mutation remain separate human or external Gates.

The change is medium risk because it modifies the repository enforcement path and can block later
work, but it does not alter product runtime, user data, credentials, signing, or production state.

## Acceptance criteria

- [x] AC-1: A schema-v2 executing Artifact with valid risk, approval, scope, and pending verification passes.
- [x] AC-2: Invalid risk, unsafe scope, owner-approved high risk, and schema-v1 implementation changes fail deterministically.
- [x] AC-3: Verified schema-v2 Artifacts fail unless every unique acceptance ID has one concrete passing evidence mapping and verification identity.
- [x] AC-4: The local worktree Gate detects staged, unstaged, and untracked repository changes and rejects uncovered paths.
- [x] AC-5: Workflow, template, PR handoff, and root instructions describe the same strict versioned contract and human authorization boundary.
- [x] AC-6: The focused Eval, live repository check, live worktree Gate, and diff check pass with actual results recorded here.

## Decision

The user's current direct implementation request accepts this Intent and its observable Spec, with
the user as named approver. It authorizes repository implementation and local verification only.
Merge, push, pull-request creation, release, deployment, external branch-protection changes, and
production mutation remain separate human or external Gates.

The change is medium risk because it modifies the repository enforcement path and can block later
work, but it does not alter product runtime, user data, credentials, signing, or production state.
