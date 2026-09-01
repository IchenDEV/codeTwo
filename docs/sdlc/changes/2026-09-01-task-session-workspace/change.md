---
id: change-2026-09-01-task-session-workspace
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: user via the 2026-09-01 approval of UI prototype option A and direct implementation request
approved_at: 2026-09-01
created: 2026-09-01
updated: 2026-09-01
source: direct user requests following the approved Task, Session, worktree, and pull-request prototype, including the 2026-09-01 lint simplification and full interaction-optimization follow-ups
inputs: existing TaskBoard tasks, ordered Task sessionIds, Session worktree provenance, and current GitHub pull-request lookup
outputs: production Task list with inline Session history, an attention workflow, bounded transcript and search previews, and existing fork/split actions
scope: .github/workflows/desktop-design-system.yml, .gitignore, apps/desktop/bun.lock, apps/desktop/eslint.config.mjs, apps/desktop/package.json, apps/desktop/src/App.tsx, apps/desktop/src/components/ui/command.tsx, apps/desktop/src/i18n/strings.ts, apps/desktop/src/palette, apps/desktop/src/session/QuestionDialog.tsx, apps/desktop/src/taskboard, apps/desktop/stryker.taskboard.config.json, apps/desktop/tests, apps/desktop/tsconfig.stryker.json, docs/sdlc/changes/2026-09-01-task-session-workspace
next_trigger: human review of the draft follow-up pull request
verification_mode: owner
verified_by: codex
verified_at: 2026-09-01
---

# Make TaskBoard a Task-to-Session workspace

## Intent

The user approved prototype option A after reviewing how a Task, AI Session, worktree, and pull
request should relate. The current TaskBoard renders four card columns and stores a Task-level pull
request link, which hides Session history and makes later worktrees or pull requests appear to
replace earlier execution. The production surface should instead keep the interaction simple: a
Task is the durable unit of intent, its Sessions are the execution history, and each Session can
show at most the pull request belonging to its own checkout.

The direct request accepts the Intent and visible design direction. It does not authorize a pull
request, merge, release, deployment, or production mutation.

## Spec

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

### Acceptance criteria

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
- [x] AC-8: A visible All/Needs-you switch filters the existing Task projection without introducing
      another persisted state source; it reports its count, selects from visible results, and has a
      clear empty state in English and Chinese.
- [x] AC-9: Selecting a Session reads a bounded durable transcript preview without opening it, and
      Core-owned waiting or failure reasons remain visible.
- [x] AC-10: Pending permissions and structured questions use the existing global input queue;
      drafts survive rejection and selection advances only after Core confirms acceptance.
- [x] AC-11: Visible contextual Up/Down, J/K, Space, and Enter shortcuts do not intercept text
      fields, menus, dialogs, modified keys, or native controls.
- [x] AC-12: Existing Session search ranks a matching current Session first, distinguishes active
      and archived hits, and previews the selected hit read-only before Enter opens it.
- [x] AC-13: The inspector uses only Agent and Details progressive-disclosure tabs while retaining
      explicit activity, checkout, pull-request, light/dark, and narrow-focus behavior.
- [x] AC-14: Bounded transcript preview exposes the existing Session-reference fork and pane-tree
      split actions only when their required source boundary exists.

## Decision and gates

The user approved the option-A prototype and directly requested implementation. Ponytail review
selected reuse: ordered `sessionIds` already express Task history, SessionInfo already owns
worktree provenance, and the existing bounded GitHub lookup already resolves a checkout's current
pull request. No persisted Item, delivery, PR-history, or compatibility abstraction is added.

This is a medium-risk desktop UI change because it replaces the primary TaskBoard information
architecture while preserving existing local Task persistence. Human review remains required
before merge. Release and production Gates are not opened by this request.

## Plan

1. Project existing Tasks, SessionInfo records, activity, worktree paths, and best-effort GitHub
   status into Task and Session rows without changing storage.
2. Replace the column/card composition with the accepted dense list, inline Session history, and
   responsive inspector while reusing CodeTwo primitives and Task editor/actions.
3. Add only the copy needed by the accepted surface and preserve English/Chinese parity.
4. Update focused rendered coverage for hierarchy, selection, per-Session PR projection, existing
   Task actions, keyboard semantics, and narrow drawer behavior.
5. Build and inspect light, dark, desktop, and narrow renders against the accepted prototype.
6. Keep only deterministic quality checks: use ESLint for static rules, type-aware checks for
   unsafe `any`, and Stryker for the deterministic workspace model.
7. Reuse the existing `needs_you` lane, durable transcript, pending-input queue, Command Palette,
   pane tree, and Session-reference fork; do not add another inbox, search, or layout model.
8. Rebase onto the modular TaskBoard merged by PR #214, resolve both behavioral intents, and rerun
   focused, full, lifecycle, mutation, build, and rendered acceptance before opening a follow-up PR.

Rollback restores the previous TaskBoardPage composition. No Task snapshot migration or Core data
change is required, so rollback does not rewrite user data.

## Build

TaskBoard now projects the existing ordered `sessionIds` into an inline newest-first Session
history. Session activity and checkout provenance continue to come from Core; the page performs a
bounded, deduplicated lookup of the current pull request for each available Session checkout and
does not persist that projection into the Task snapshot. Archived worktrees are ignored.

The former four-column card view is now a progressive flat Task list with the accepted Task,
Session, open-PR, and updated-time columns. The Agent/Details inspector follows the selected Task
and Session, exposes the selected checkout and pull request, and hands a prompt back to the existing
Session composer instead of creating another chat model. Existing Task creation, editing, deletion,
stage changes, filters, and first/new Session actions remain available.

The workspace uses the repository's existing controls and design tokens. Container queries reduce
secondary list columns before 768 pixels and turn the inspector into a dismissible right drawer;
the default desktop composition remains a workspace plus 360-pixel inspector.

The follow-up quality pass split the 1,268-line TaskBoard page into responsibility-owned modules,
all below 250 physical lines, while preserving the existing rendered behavior. After adversarial
probes showed that the custom Halstead/CRAP analyzer and zero-dead-code/redundancy claims were not
reliable, that analyzer and its duplicate coverage/CI path were removed. ESLint now discovers new
TaskBoard TypeScript modules through a directory glob, applies cyclomatic, cognitive, file-size,
unused-code, local-redundancy, and type-aware unsafe-`any` rules, and allows narrowed `unknown` at
real data boundaries. `taskBoard.ts` and `TaskEditorDialog.tsx` remain explicit legacy exceptions.
Stryker plus the TypeScript checker separately requires zero surviving valid mutants in the
deterministic workspace model.

The interaction follow-up was rebased onto that modular result rather than restoring the earlier
single-file implementation. It reuses the existing `needs_you` projection for All/Needs-you,
`getTranscriptPage` for a bounded preview, the shared permission/elicitation queue for inline
answers, the Command Palette result model for current-first read-only previews, and the existing
pane tree and Session-reference fork paths. Narrow layout uses the shared modal with list inertness,
focus entry, and focus restoration; the default desktop composition remains a 360-pixel inspector.

## Verification

Verdict: verified.

The verification below was rerun after rebasing onto the PR #214 modular baseline.

### Acceptance evidence

- AC-1: PASS — `bun test tests/taskBoard.test.ts tests/taskBoardRendered.test.tsx` passed
  58 focused tests covering the flat list, progressive rendering, filters, create/edit/delete,
  stage moves, and start/continue actions. The rendered suite asserts that no Kanban columns remain.
- AC-2: PASS — `bun test tests/taskBoardRendered.test.tsx` and the
  [rendered TaskBoard suite](../../../../apps/desktop/tests/taskBoardRendered.test.tsx) attach two Sessions in oldest-first storage order,
  verifies S-2 then S-1 in the UI, marks only S-2 current, switches the inspector to historical
  S-1, and preserves Task ownership.
- AC-3: PASS — the same fixture resolves `/worktrees/session-current` to PR #102 and
  `/worktrees/session-old` to PR #101 simultaneously. The existing GitHub pull-request rendered
  regression suite also passed; loader errors are caught by the reused bounded sidebar projection.
- AC-4: PASS — `bun test tests/taskBoardRendered.test.tsx` covers a Task with no Session, current and historical
  Session selection, opening the selected Session, and moving an inspector prompt into that exact
  Session. Production wiring returns the prompt to the existing App composer without auto-sending.
- AC-5: PASS — Browser inspection produced the linked [desktop light](evidence/task-board-light.png), [desktop dark](evidence/task-board-dark.png),
  and [narrow drawer](evidence/task-board-narrow.png) evidence from the production component,
  and a 760-by-900 narrow viewport. At narrow width the 360-pixel inspector was an absolute right
  drawer, secondary list columns collapsed, the Task/Session/PR hierarchy remained operable, and
  the Browser console contained no warnings or errors.
- AC-6: PASS — after rebasing onto `origin/main` at `521f3b95`, the final `bun test` run passed
  848 desktop tests across 145 files with 5,034 assertions and zero failures.
  `bun run build:renderer` transformed 6,604 modules and passed with only the repository's existing
  large-chunk advisory.
  `bun script/verify/docs.ts`, both SDLC verification modes, `git diff --check`, and the five Gate
  self-tests all passed.
- AC-7: PASS — post-merge `bun run lint` and `bunx tsc --noEmit` passed. A temporary new-file probe proved the
  TaskBoard glob automatically applies the gate: inferred `any` from `JSON.parse` failed
  `no-unsafe-assignment`, explicit `any` failed `no-explicit-any`, and a narrowed `unknown` boundary
  passed; the probes were then removed. The fresh `bun run mutation:taskboard` run generated 170
  mutants for `workspaceModel.ts`: all 86 valid mutants were killed, 84 were rejected as TypeScript
  compile errors, and zero survived or lacked coverage.
- AC-8: PASS — `bun test tests/taskBoardRendered.test.tsx` covers view count, visible-result selection, empty state, and
  recovery when a new Task is hidden. Fresh Browser acceptance changed All tasks to Needs you,
  reduced ten visible Tasks to two, and retained the selected visible row.
- AC-9: PASS — `bun test tests/taskBoard.test.ts tests/taskBoardRendered.test.tsx` covers bounded chronological user/agent transcript entries,
  exclude tool/reasoning content, retain the latest durable user boundary, and load without opening
  the selected Session.
- AC-10: PASS — `bun test tests/taskBoardRendered.test.tsx tests/sessionState.test.ts` proves inline permission and structured-question
  answers remain visible on false acknowledgement, preserve typed drafts, and advance only on true.
- AC-11: PASS — `bun test tests/taskBoardRendered.test.tsx` covers J selection, Space preview, Enter open, prompt non-interception,
  and visible hints. Browser acceptance moved both selection and focus with J.
- AC-12: PASS — `bun test tests/commandPaletteRendered.test.tsx tests/sessionState.test.ts` proves current-first, active-before-archived
  ordering, archived labels, read-only preview, and no opening before Enter.
- AC-13: PASS — fresh [dark](evidence/task-board-dark.png), [light](evidence/task-board-light.png), and [narrow](evidence/task-board-narrow.png) Browser runs showed only Agent and Details tabs,
  zero page overflow, a 360-pixel fixed narrow dialog, background inertness, focus entry, and focus
  restoration to Show inspector. Browser console warnings and errors remained empty.
- AC-14: PASS — `bun test tests/taskBoardRendered.test.tsx tests/sessionState.test.ts` proves fork, split-right, and split-below use the selected Session and
  durable preview boundary; production wiring calls the existing pane-tree and Session-reference paths.

Residual risk: the lint Gate intentionally excludes the legacy 970-line `taskBoard.ts` and 255-line
`TaskEditorDialog.tsx`; those exceptions should be removed when the files are split for product
reasons. Lint catches local unused and redundant constructs but does not claim graph-wide dead code
or repository-wide duplication, and the removed custom analyzer no longer claims comparable
Halstead or branch-sensitive CRAP values. Mutation testing remains scoped to the deterministic
workspace model rather than UI glue or the repository's historical baseline.
Pull-request status remains deliberately best effort and depends on a usable local
checkout plus GitHub authentication/network; failure leaves an accurate checkout with no PR status.
The legacy manual Task link on the separate Pull Requests page remains compatible but is not yet a
Session-history view. The rendered Browser harness used production components and styles without
starting a second Core, so final human review in the native macOS window is still appropriate before
merge. No PR, push, merge, deployment, or release has been performed.

### Rendered evidence

- [Desktop light](evidence/task-board-light.png)
- [Desktop dark](evidence/task-board-dark.png)
- [Narrow drawer](evidence/task-board-narrow.png)

## Review and release

Approval: the user approved implementation on 2026-09-01.
Baseline pull request: [#214](https://github.com/IchenDEV/codeTwo/pull/214) (merged).
Release target: none requested.
Rollback: revert this change; Task and Session persistence is unchanged.
No release: the interaction follow-up is owner-verified; human review remains pending.

## Feedback

The accepted prototype established the intended interaction: Task 1:N Session, with each Session
showing at most the pull request of its own worktree. The 2026-09-01 follow-up requested keeping
only useful quality rules; the unreliable custom metrics were removed and the remaining lint gate
was made automatic and type-aware.

### Interaction optimization task list

- [x] T-1 / P0: All/Needs-you quick view backed only by the existing `needs_you` projection.
- [x] T-2 / P0: bounded transcript and waiting-reason preview without opening the Session.
- [x] T-3 / P0: inline answers through the shared queue with rejection-safe drafts.
- [x] T-4 / P0: contextual keyboard flow with visible hints and input exclusions.
- [x] T-5 / P1: current-first active/archived preview in existing Session search.
- [x] T-6 / P1: two-tab inspector with explicit status and narrow modal focus contract.
- [x] T-7 / P1: existing fork/split actions exposed only after preview provides a boundary.
