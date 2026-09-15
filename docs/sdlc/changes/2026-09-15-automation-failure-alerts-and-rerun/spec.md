---
id: 2026-09-15-automation-failure-alerts-and-rerun
schema: 5
stage: spec
status: accepted
owner: chenli
created: 2026-09-15
based_on: intent.md
---

# Spec: Automation failure alerts and rerun semantics

## Design

### Instruction snapshot

`automation_runs` gains an additive `prompt TEXT NOT NULL DEFAULT ''` column, installed and
backfilled in `crate::automation::install` using the existing `table_has_column` guard pattern
(`crates/core/src/automation.rs:58-98`). The backfill copies the owning automation's current
`prompt` for rows created before the column existed; a genuinely empty snapshot falls back to the
live prompt at replay time, so legacy rows stay replayable.

`new_run` records the snapshot at claim/manual-run time. The desktop host executes `run.prompt`
(`apps/desktop/src-host/src/automation.rs:283-292`) instead of `automation.prompt`, so a mid-run
edit cannot change the running instruction and history can reproduce it.

### Replay

A new store method `rerun_automation_run(run_id, now)` resolves the run's owning automation, refuses
when that automation already has an active run (reusing `has_active_run`), and inserts a new run
whose snapshot is the source run's snapshot, falling back to the live prompt when the snapshot is
empty. It returns `None` for an unknown run id. The host exposes it as `automation.rerun {run_id}`
and spawns it through the same path as `run_now`, so replay uses the automation's current provider,
project, worktree, and permission configuration while keeping the original instruction.

### Failure and attention alerts

The host's automation event loop already resolves the active run for each terminal/attention event
(`apps/desktop/src-host/src/automation.rs:103-184`). Before persisting the new status it compares
the run's stored status; when the status actually changes into `Failed` or `NeedsAttention` it
emits a desktop event `automation-alert` carrying `{automation_id, run_id, automation_name, status,
error}`. A repeated event for a run already in that status emits nothing, so a burst of provider
events cannot storm the user. The synchronous failure path (`fail`) emits the same event after it
persists `Failed`.

The Electrobun main process handles `automation-alert` in `NativeHost`'s `onEvent`
(`apps/desktop/src/electrobun/index.ts:285-289`) with `Utils.showNotification({title, body})`, which
works on macOS, Windows, and Linux and does not depend on renderer readiness or window focus. The
renderer also receives the event through the existing desktop event channel; `AutomationsPage`
subscribes and shows an error toast whose action replays the run.

No automatic retry or turn timeout is introduced.

## Acceptance criteria

- [x] AC-1: A claimed scheduled run and a manual run each persist the instruction snapshot, and the
      executed prompt is the snapshot even after the automation prompt is edited.
- [x] AC-2: Rerunning a recorded run creates a new run that replays that run's snapshot; rerun is
      refused while the automation has an active run and returns no run for an unknown id.
- [x] AC-3: A run that transitions into `failed` or `needs_attention` emits exactly one
      `automation-alert` event for that transition, with automation id, run id, name, status, and
      error; `succeeded`/`interrupted` transitions and repeated same-status updates emit none.
- [x] AC-4: The desktop main process shows a native OS notification for `automation-alert`.
- [x] AC-5: The renderer shows an alert toast with a rerun action for `automation-alert`, and the run
      history exposes a rerun action that appends a new run.
- [x] AC-6: Opening a store whose `automation_runs` predates the snapshot column succeeds, preserves
      every existing row, and backfills the snapshot from the owning automation's prompt.
- [x] AC-7: Failure paths stay honest: an unknown rerun target and an active-run rerun surface an
      error rather than silently creating or dropping a run.
