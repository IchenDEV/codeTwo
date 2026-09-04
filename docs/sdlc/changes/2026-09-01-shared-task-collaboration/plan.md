---
id: "2026-09-01-shared-task-collaboration"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: spec.md
risk: high
scope: crates/core/examples/live_demo.rs, crates/core/src/engine.rs, crates/core/src/event.rs, crates/core/src/lib.rs, crates/core/src/store.rs, crates/core/src/task.rs, crates/core/src/task_store.rs, crates/core/tests, crates/server/src/auth.rs, crates/server/src/lib.rs, crates/server/tests, crates/tui/src/app.rs, apps/desktop/src/App.tsx, apps/desktop/src/bridge.ts, apps/desktop/src-host/src/remote.rs, docs/sdlc/changes/2026-09-01-shared-task-collaboration
approved_by: "userthe 2026-09-01 direct request to implement the proposed P0 shared Task collaboration slice"
approved_at: "2026-09-01"
---

# Plan: Add the first shared Task collaboration loop

## Files and ownership

crates/core/examples/live_demo.rs, crates/core/src/engine.rs, crates/core/src/event.rs, crates/core/src/lib.rs, crates/core/src/store.rs, crates/core/src/task.rs, crates/core/src/task_store.rs, crates/core/tests, crates/server/src/auth.rs, crates/server/src/lib.rs, crates/server/tests, crates/tui/src/app.rs, apps/desktop/src/App.tsx, apps/desktop/src/bridge.ts, apps/desktop/src-host/src/remote.rs, docs/sdlc/changes/2026-09-01-shared-task-collaboration

## Order of work

1. Add the minimal Workspace, Member, shared Task collaboration, activity, Suggestion, and command
   receipt records to the existing Core Store with transactional revision checks.
2. Extend pairing tokens and Devices with an optional Member binding while preserving all existing
   protocol behavior; team authorization requires the binding.
3. Add authenticated team snapshot and mutation routes that derive the actor and map store conflicts
   to explicit responses.
4. Reuse the existing parallel Task creation path to attach execution to an already-created Task and
   submit the accepted Suggestion exactly once.
5. Prove the Alice/Bob/revocation/concurrent-approval/disconnect path with an offline real-Engine
   integration harness, then run the applicable repository Gates.

Rollback reverts the team routes and code while leaving the additive tables unread. No existing Task,
Session, auth credential, or TaskBoard local snapshot is rewritten or deleted.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

Implemented the first collaboration schema and projection in the existing Task Store: one
Workspace, Member identity, owner/collaborator access, revisioned comments and Suggestions,
attributed activity, owner Attention projection, and durable approval receipts. Existing Task
runtime storage remains the authority for Work Items, Agents, Session leases, and execution.

Extended remote pairing with locally issued member-bound invitations. Added authenticated team
snapshot, Attention, comment, Suggestion, and approval routes. The server derives the actor from the
credential, closes live sockets when a Device is revoked, isolates team execution events and
Sessions from unbound legacy devices, and blocks member credentials from raw terminal and Canvas
surfaces.

Approval reuses `Engine::attach_parallel_task_session`; the accepted Suggestion is submitted through
the existing provider Session path. Desktop Host exposes Workspace bootstrap and Member invite
commands. The renderer recognizes the new Task snapshot event but intentionally leaves the
production local TaskBoard and sidebar unchanged for this P0.

## Decision

The user accepted Intent and the bounded product model in the direct request. Ponytail review chose
the smallest shared seam: extend the existing Store, device pairing, Engine execution path, and
Server transport. It explicitly excludes TaskBoard migration, sidebar production UI, Feishu, review
requests, presence, multi-tenant tenancy, SSO, CRDTs, shared terminals, and deployment work.

This is high risk because it changes authentication meaning, adds durable schema, and mediates
execution. The user is the Intent/Spec approver, distinct from the implementation owner. An
independent verifier is required before this Artifact may become `verified`; merge, release, and
deployment remain separate human Gates.
