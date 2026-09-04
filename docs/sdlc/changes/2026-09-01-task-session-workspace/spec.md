---
id: "2026-09-01-task-session-workspace"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: intent.md
risk: medium
approved_by: "userthe 2026-09-01 approval of UI prototype option A and direct implementation request"
approved_at: "2026-09-01"
---

# Spec: Make TaskBoard a Task-to-Session workspace

## Requirements

TaskBoard becomes a dense list rather than a Kanban card grid. Expanding a Task reveals its ordered
Session history, newest first. Selecting a Session opens a persistent inspector with the Task,
Session activity, checkout/worktree identity, and the pull request currently resolved from that
Session's checkout. Multiple Sessions therefore expose multiple worktrees and pull requests without
adding a second ownership model or overwriting historical rows.

The existing Task model remains authoritative for title, description, stage, priority, labels,
ordering, and ordered `sessionIds`. Existing Session/Core records remain authoritative for runtime
activity and checkout provenance. GitHub status is a bounded, best-effort projection; missing `gh`,
authentication, network, a checkout, or a pull request leaves a quiet `No PR` state and never
blocks the Task list. This change does not introduce a new Item entity, duplicate Session data in
Task storage, run multiple Core instances, or migrate Task data. The existing Pull Requests page's
manual Task link is outside this first vertical slice and remains compatible, but TaskBoard no
longer treats a Task-level link as the execution truth.

The accepted desktop grid is the existing application navigation plus a Task workspace and a
360-pixel inspector. At constrained width the inspector becomes an overlay drawer; Task and
Session rows collapse secondary columns before primary text becomes unreadable. The surface uses
existing CodeTwo tokens, buttons, menus, focus treatment, typography, and reduced-motion behavior.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user approved the option-A prototype and directly requested implementation. Ponytail review
selected reuse: ordered `sessionIds` already express Task history, SessionInfo already owns
worktree provenance, and the existing bounded GitHub lookup already resolves a checkout's current
pull request. No persisted Item, delivery, PR-history, or compatibility abstraction is added.

This is a medium-risk desktop UI change because it replaces the primary TaskBoard information
architecture while preserving existing local Task persistence. Human review remains required
before merge. Release and production Gates are not opened by this request.

## Acceptance criteria

- [x] AC-1: TaskBoard renders one searchable/filterable Task list instead of four Kanban columns,
      while create, edit, delete, stage, priority, label, and start/continue actions remain available.
- [x] AC-2: Expanding a Task shows every available linked Session newest first, marks the current
      Session explicitly, and selecting a row updates the inspector without changing Task ownership.
- [x] AC-3: Each Session row and inspector resolve at most one pull request from that Session's own
      checkout; different Sessions can simultaneously show different worktrees and pull requests,
      and lookup failures remain quiet.
- [x] AC-4: The inspector shows accurate Task, Session, checkout/worktree, activity, and pull-request
      state, and its primary action opens the selected Session. A Task without a Session can still
      start its first Session.
- [x] AC-5: The accepted white, low-radius, table-driven hierarchy remains usable in desktop light,
      desktop dark, and narrow layouts; the narrow inspector is an operable dismissible drawer with
      no horizontal page overflow or clipped primary controls.
- [x] AC-6: Focused model/rendered tests, TypeScript, renderer build, design checks, lifecycle checks,
      and real rendered visual inspection pass without relevant console errors.
- [x] AC-7: TaskBoard workspace lint automatically covers new TypeScript modules, enforces useful
      complexity, file-size, unused-code, local-redundancy, and type-safe `any` rules, and the
      deterministic workspace model retains zero surviving valid mutants.

## Decision

The user approved the option-A prototype and directly requested implementation. Ponytail review
selected reuse: ordered `sessionIds` already express Task history, SessionInfo already owns
worktree provenance, and the existing bounded GitHub lookup already resolves a checkout's current
pull request. No persisted Item, delivery, PR-history, or compatibility abstraction is added.

This is a medium-risk desktop UI change because it replaces the primary TaskBoard information
architecture while preserving existing local Task persistence. Human review remains required
before merge. Release and production Gates are not opened by this request.
