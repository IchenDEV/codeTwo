---
id: "2026-09-01-shared-task-collaboration"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: intent.md
risk: high
approved_by: "userthe 2026-09-01 direct request to implement the proposed P0 shared Task collaboration slice"
approved_at: "2026-09-01"
---

# Spec: Add the first shared Task collaboration loop

## Requirements

One server represents one trusted Workspace. A Member is distinct from a paired Device and from an
Agent. Team endpoints accept only member-bound device credentials and derive the actor from the
credential; request bodies cannot assert an actor. Revoking a device immediately removes its read
and write access. The initial role model is Workspace Admin and Member, plus exactly one owner per
Task.

Core persists the shared Task projection beside its existing Task runtime state. The projection is
revisioned and contains Task ownership, collaborators, comments, Suggestions, attributable activity,
and linked execution Sessions. Personal sidebar ordering and presence are outside this projection.
Comments do not execute. A Suggestion can be approved only by the Task owner. Approval uses both a
globally unique `command_id` and `expected_revision`; a replay returns its original receipt, while a
stale different command fails without starting execution. The accepted Suggestion enters the
existing Task to Work Item to Agent to Session path rather than creating a second runner.

This is collaboration control inside a trusted server boundary, not hostile-tenant isolation. The
design follows the useful OpenClaw 2.0 boundaries—one authoritative Gateway, verified operator
identity, durable session ownership, and idempotent stale-target protection—without importing its
agent-workspace terminology or UI hierarchy into C2.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user accepted Intent and the bounded product model in the direct request. Ponytail review chose
the smallest shared seam: extend the existing Store, device pairing, Engine execution path, and
Server transport. It explicitly excludes TaskBoard migration, sidebar production UI, Feishu, review
requests, presence, multi-tenant tenancy, SSO, CRDTs, shared terminals, and deployment work.

This is high risk because it changes authentication meaning, adds durable schema, and mediates
execution. The user is the Intent/Spec approver, distinct from the implementation owner. An
independent verifier is required before this Artifact may become `verified`; merge, release, and
deployment remain separate human Gates.

## Acceptance criteria

- [x] AC-1: A Workspace Admin and Member can be created, pairing binds each Device to one Member,
      the server derives every team actor from that binding, and revoking Bob's Device prevents
      subsequent Task reads and writes.
- [x] AC-2: Alice can create and own a shared Task; Bob can comment and submit a Suggestion; both
      authenticated clients receive byte-equivalent revisioned snapshots after refresh or reconnect,
      with every mutation attributed to the correct Member.
- [x] AC-3: Only the Task owner can approve a pending Suggestion. Approval with one `command_id` and
      `expected_revision` is durable and idempotent; replaying it or racing a stale approval cannot
      create a second execution.
- [x] AC-4: The winning approval attaches one Work Item, Executor Agent, Session, and lease to the
      existing Task, submits the accepted Suggestion once, and continues after Bob disconnects.
- [x] AC-5: Existing legacy, T3, and C2 pairing and remote Session control remain backward compatible;
      credentials without a Member cannot access the team surface.
- [x] AC-6: Focused Core store and Server integration tests, Core and Server test suites, formatting,
      and repository documentation and SDLC Gates pass.

## Decision

The user accepted Intent and the bounded product model in the direct request. Ponytail review chose
the smallest shared seam: extend the existing Store, device pairing, Engine execution path, and
Server transport. It explicitly excludes TaskBoard migration, sidebar production UI, Feishu, review
requests, presence, multi-tenant tenancy, SSO, CRDTs, shared terminals, and deployment work.

This is high risk because it changes authentication meaning, adds durable schema, and mediates
execution. The user is the Intent/Spec approver, distinct from the implementation owner. An
independent verifier is required before this Artifact may become `verified`; merge, release, and
deployment remain separate human Gates.
