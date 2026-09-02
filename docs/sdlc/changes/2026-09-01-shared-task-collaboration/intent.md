---
id: "2026-09-01-shared-task-collaboration"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-09-01
source: direct user request referencing OpenClaw 2.0 and specifying the P0 shared Task plus two-member Suggestion approval execution loop
risk: high
approved_by: "userthe 2026-09-01 direct request to implement the proposed P0 shared Task collaboration slice"
approved_at: "2026-09-01"
---

# Intent: Add the first shared Task collaboration loop

## Problem

One authoritative C2 Core can already serve multiple clients and persist Task, Work Item, Agent,
Session lease, and execution state, but remote credentials identify devices rather than people and
the production TaskBoard remains local browser state. The first collaboration increment must prove
that two named people can act on one durable Task without introducing a second team product, a
multi-tenant SaaS boundary, or a parallel execution model.

The user approved the P0 vertical slice: Alice owns a Task; Bob comments and proposes a Suggestion;
Alice approves it; the existing Core execution chain starts once; both clients observe the same
attributed state. The request does not authorize a production deployment, release, pull request,
or the later sidebar and TaskBoard visual migration.

## Proposed outcome

One authoritative C2 Core can already serve multiple clients and persist Task, Work Item, Agent,

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user accepted Intent and the bounded product model in the direct request. Ponytail review chose
the smallest shared seam: extend the existing Store, device pairing, Engine execution path, and
Server transport. It explicitly excludes TaskBoard migration, sidebar production UI, Feishu, review
requests, presence, multi-tenant tenancy, SSO, CRDTs, shared terminals, and deployment work.

This is high risk because it changes authentication meaning, adds durable schema, and mediates
execution. The user is the Intent/Spec approver, distinct from the implementation owner. An
independent verifier is required before this Artifact may become `verified`; merge, release, and
deployment remain separate human Gates.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user accepted Intent and the bounded product model in the direct request. Ponytail review chose
the smallest shared seam: extend the existing Store, device pairing, Engine execution path, and
Server transport. It explicitly excludes TaskBoard migration, sidebar production UI, Feishu, review
requests, presence, multi-tenant tenancy, SSO, CRDTs, shared terminals, and deployment work.

This is high risk because it changes authentication meaning, adds durable schema, and mediates
execution. The user is the Intent/Spec approver, distinct from the implementation owner. An
independent verifier is required before this Artifact may become `verified`; merge, release, and
deployment remain separate human Gates.
