---
id: change-2026-09-01-shared-task-collaboration
kind: change
schema: 2
status: executing
risk: high
owner: codex
approvers: user via the 2026-09-01 direct request to implement the proposed P0 shared Task collaboration slice
approved_at: 2026-09-01
created: 2026-09-01
updated: 2026-09-01
source: direct user request referencing OpenClaw 2.0 and specifying the P0 shared Task plus two-member Suggestion approval execution loop
inputs: existing Core Task Store, remote device pairing, shared Engine event stream, and Task to Work Item to Agent to Session execution
outputs: one-server collaboration contract with member-bound devices, revisioned shared Task snapshots, attributable comments and Suggestions, and idempotent owner approval
scope: crates/core/examples/live_demo.rs, crates/core/src/engine.rs, crates/core/src/event.rs, crates/core/src/lib.rs, crates/core/src/store.rs, crates/core/src/task.rs, crates/core/src/task_store.rs, crates/core/tests, crates/server/src/auth.rs, crates/server/src/lib.rs, crates/server/tests, crates/tui/src/app.rs, apps/desktop/src/App.tsx, apps/desktop/src/bridge.ts, apps/desktop/src-host/src/remote.rs, docs/sdlc/changes/2026-09-01-shared-task-collaboration
next_trigger: independent verification of the authentication, concurrency, and execution acceptance criteria
verification_mode: independent
verified_by: pending
verified_at: pending
---

# Add the first shared Task collaboration loop

## Intent

One authoritative C2 Core can already serve multiple clients and persist Task, Work Item, Agent,
Session lease, and execution state, but remote credentials identify devices rather than people and
the production TaskBoard remains local browser state. The first collaboration increment must prove
that two named people can act on one durable Task without introducing a second team product, a
multi-tenant SaaS boundary, or a parallel execution model.

The user approved the P0 vertical slice: Alice owns a Task; Bob comments and proposes a Suggestion;
Alice approves it; the existing Core execution chain starts once; both clients observe the same
attributed state. The request does not authorize a production deployment, release, pull request,
or the later sidebar and TaskBoard visual migration.

## Spec

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

### Acceptance criteria

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

## Decision and gates

The user accepted Intent and the bounded product model in the direct request. Ponytail review chose
the smallest shared seam: extend the existing Store, device pairing, Engine execution path, and
Server transport. It explicitly excludes TaskBoard migration, sidebar production UI, Feishu, review
requests, presence, multi-tenant tenancy, SSO, CRDTs, shared terminals, and deployment work.

This is high risk because it changes authentication meaning, adds durable schema, and mediates
execution. The user is the Intent/Spec approver, distinct from the implementation owner. An
independent verifier is required before this Artifact may become `verified`; merge, release, and
deployment remain separate human Gates.

## Plan

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

## Build

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

## Verification

Verdict: implementation-owner evidence passes; independent high-risk verification remains pending.

### Acceptance evidence

- AC-1: PASS — the Server integration creates Alice and Bob, pairs server-bound identities, rejects
  unbound credentials, revokes Bob, and observes both HTTP denial and live socket closure.
- AC-2: PASS — Alice and Bob receive byte-equivalent Task snapshots; Bob's comment and Suggestion
  are attributed, and Alice alone receives the derived pending-Suggestion Attention item.
- AC-3: PASS — Store race coverage proves one durable approval claim and one replay receipt;
  integration coverage rejects Bob and replays Alice's command without another lease or prompt.
- AC-4: PASS — the offline real-Engine harness creates one Work Item, Executor, worktree, Session,
  and lease, writes one provider prompt, and does not depend on Bob's connection.
- AC-5: PASS — full Core and Server suites pass; legacy, T3, and C2 tests remain green. Unbound
  legacy clients cannot see or operate team Sessions, and team credentials cannot enter terminal or
  Canvas surfaces.
- AC-6: PASS — changed-file formatting and diff checks pass; documentation, SDLC contract, SDLC
  worktree, and Gate regression checks all pass.

Owner-run evidence:

- `cargo test -p codetwo-core -p codetwo-server` — PASS.
- `cargo test -p codetwo-desktop-host` — PASS, 20 tests.
- `cargo check --workspace` — PASS, including the TUI event consumer.
- `bun run build:renderer` from `apps/desktop` — PASS, including ESLint, Stylelint, TypeScript, and
  production Vite build.
- changed-Rust-file `rustfmt --check` plus `git diff --check` — PASS.
- `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, and
  `bun script/verify/sdlc.ts --worktree` — PASS.
- `bun test script/verify/checks.test.ts` — PASS, 5 tests.

Residual risk: the production TaskBoard/sidebar is still local and has no team interaction UI; this
slice is reachable through the Server contract and Desktop Host commands. Approval claim, Session
attachment, and provider submission span durable steps; setup failures become `execution_failed`
and are not automatically retried. Server deployment hardening, member deactivation management,
backups, TLS/Tailscale operation, and independent adversarial verification remain outside this
change.

## Review and release

Draft PR: [#218](https://github.com/IchenDEV/codeTwo/pull/218).
Approval: the user approved implementation on 2026-09-01.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert the implementation; additive collaboration tables remain inert and existing data is
not migrated or deleted.
No release: implementation is not yet independently verified or approved for release.

## Feedback

No runtime feedback exists yet; the first observation boundary is the two-client integration harness.
