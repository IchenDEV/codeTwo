---
id: 2026-09-15-automation-failure-alerts-and-rerun
schema: 5
stage: verification
status: blocked
owner: chenli
created: 2026-09-15
based_on: plan.md
revision: 9de1ebb12e833ebfdfc07a725f65a4ecf31de5b7 + uncommitted worktree changes
verification_mode: owner
verified_by: chenli
verified_at: 2026-09-15
release_target: none
cleanup_status: complete
next_trigger: A human renders the desktop, fails an automation run, and observes the native OS notification, the alert toast, and the per-row replay control; then re-verify AC-4/AC-5 and set this stage to passed.
---

# Verification: Automation failure alerts and rerun semantics

## Verification

- AC-1: PASS — `cargo test -p codetwo-core --lib automation` ran `runs_snapshot_their_instruction_and_a_rerun_replays_it`:
  the claimed run persists `Review the repository`, and after `update_automation` changes the live
  prompt the replay still carries `Review the repository`. The host executes `run.prompt`
  (`apps/desktop/src-host/src/automation.rs`, `Op::Prompt`) and `cargo check -p codetwo-desktop-host
  --all-targets` passes. Residual: no end-to-end agent turn was executed.
- AC-2: PASS — same test: `rerun_automation_run` returns a run whose snapshot is the source
  snapshot; a second rerun while the automation has an active run returns `None`; an unknown run id
  returns `None`.
- AC-3: PASS — `cargo test -p codetwo-core --lib automation` ran
  `alerts_fire_only_on_a_new_failure_or_attention_state`, proving the predicate fires for
  `running→failed`, `running→needs_attention`, `needs_attention→failed` and stays quiet for
  same-status, `succeeded`, `interrupted`, and `starting→running`. The host calls that predicate and
  emits `automation-alert` once per transition (compile-checked). Residual: no host-level behavioral
  test of the emitted event payload.
- AC-4: BLOCKED — `bunx tsc --noEmit` and `bunx vite build` pass, so the Electrobun main-process
  handler compiles and bundles. The actual native notification (Electrobun `Utils.showNotification`,
  macOS `NSUserNotificationCenter`) requires a real, code-signed desktop session and a failing run;
  no display was available and no instance was launched, so delivery was not observed.
- AC-5: BLOCKED — `bun run lint` and `bun test` keep the renderer green, and
  `tests/automationPageRendered.test.tsx` asserts the alert subscription, the rerun call, the
  `automations.rerun` label, and the per-row control at the source level. The harness has no host
  event channel, so the toast and the row control were not observed in a rendered window.
- AC-6: PASS — `cargo test -p codetwo-core --lib automation` ran
  `older_run_rows_gain_the_instruction_snapshot_from_their_automation`: an old-schema
  `automation_runs` table opens twice without error, keeps its one row, and backfills
  `Old instruction` from the owning automation.
- AC-7: PASS — the rerun test's unknown-id `None` and active-run `None` are surfaced by
  `AutomationRuntime::rerun` as a `PluginError` (`run not found or its automation already has an
  active run`), and the renderer shows `automations.rerunFailed`/`automations.alertFailed`. Store and
  host paths are test/compile-backed; the renderer error toast is not behavior-tested.

Verdict: blocked — implementation and repository checks pass, but the two UI acceptance criteria
(AC-4/AC-5) require an actual rendered desktop session that this environment cannot provide.
Residual risk: the native notification body text is English-only (the main process has no i18n), and
a genuinely empty instruction snapshot falls back to the automation's live prompt at replay time.

## Cleanup

Removed: none — no task-owned scratch roots were created. `bunx vite build` wrote the git-ignored
`apps/desktop/dist/`; it is not tracked and the renderer build is a shared output of the normal
check flow, so it was left in place rather than deleted.
Retained: none.
Retention owner: not applicable.
Cleanup trigger: not applicable.
Processes: none started; no desktop instance, server, or test daemon was launched (`git status`
shows only the intended source and record edits).
Evidence: `git status --porcelain` lists only the seven modified source files and this change
record; `git check-ignore apps/desktop/dist` confirms the build output is ignored.

## Review and release

Approval: pending — merge and external actions require their own authorization.
Rollback: See plan.md.
Release: No release requested; merge and external actions require their own authorization.
Feedback: Link an Incident and regression Eval when a real failure occurs.
