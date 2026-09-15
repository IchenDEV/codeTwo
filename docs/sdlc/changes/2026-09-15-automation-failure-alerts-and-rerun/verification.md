---
id: 2026-09-15-automation-failure-alerts-and-rerun
schema: 5
stage: verification
status: passed
owner: chenli
created: 2026-09-15
based_on: plan.md
revision: pending-record-commit
verification_mode: owner
verified_by: chenli
verified_at: 2026-09-15
release_target: none
cleanup_status: complete
next_trigger: chenli reviews verified work.
---

# Verification: Automation failure alerts and rerun semantics

Accepted at the local/automated level on the requester's explicit instruction ("在本级验收").
Rendered behaviour is verified by tests that mount the real React components with data; the native
OS notification's delivery is not observable without the packaged app and is recorded as residual.

## Verification

- AC-1: PASS — `cargo test -p codetwo-core --lib automation` ran
  `runs_snapshot_their_instruction_and_a_rerun_replays_it`: the claimed run persists
  `Review the repository`, and after `update_automation` changes the live prompt the replay still
  carries `Review the repository`. The host executes `run.prompt`
  (`apps/desktop/src-host/src/automation.rs`, `Op::Prompt`) and
  `cargo check -p codetwo-desktop-host --all-targets` passes.
- AC-2: PASS — the same test: `rerun_automation_run` returns a run whose snapshot is the source
  snapshot; a second rerun while the automation has an active run returns `None`; an unknown run id
  returns `None`.
- AC-3: PASS — `cargo test -p codetwo-core --lib automation` ran
  `alerts_fire_only_on_a_new_failure_or_attention_state`, proving the predicate fires for
  `running→failed`, `running→needs_attention`, `needs_attention→failed` and stays quiet for
  same-status, `succeeded`, `interrupted`, and `starting→running`.
- AC-4: PASS — `bun test tests/automationAlert.test.ts` runs
  `automationAlertNotification` over the failure, needs-attention, and empty-payload cases, and
  `bunx tsc --noEmit` plus `bunx vite build` type-check and bundle the main-process handler that
  passes the result to Electrobun's `Utils.showNotification`. Residual: the notification's actual
  delivery to Notification Center is not observable without the packaged/signed app.
- AC-5: PASS — `bun test tests/automationPageRendered.test.tsx` mounts the real page with an
  injected alert subscription and asserts the rendered `role="alert"` toast reads
  `Automation failed: Nightly triage` and exposes a `Run again` action;
  `bun test tests/automationRunHistoryRendered.test.tsx` mocks the desktop bridge, renders the Runs
  tab with a failed run, finds the per-row `aria-label="Run again"` control, clicks it, and asserts
  `rerunAutomation("r1")` was called.
- AC-6: PASS — `cargo test -p codetwo-core --lib automation` ran
  `older_run_rows_gain_the_instruction_snapshot_from_their_automation`: an old-schema
  `automation_runs` table opens twice without error, keeps its one row, and backfills
  `Old instruction` from the owning automation.
- AC-7: PASS — the same core run proves the unknown-id `None` and active-run `None`, which
  `AutomationRuntime::rerun` surfaces as a `PluginError` (`run not found or its automation already
  has an active run`); the renderer paths for `automations.rerunFailed` and `automations.alertFailed`
  are covered by `bun test`.

Verdict: verified.
Residual risk: the OS notification body text is English-only (the main process has no i18n); a
genuinely empty instruction snapshot falls back to the automation's live prompt at replay time; and
native notification delivery was accepted on the mapping test plus the bundled call rather than
observed in a signed app.

## Cleanup

Removed: the temporary verification harness (`apps/desktop/verify-ui.html`, `verify-ui.tsx`,
`vite.verify.config.ts`) and its `/tmp/verify-ui-dist` output were removed after the render; the
headless browser and the transient `python3 -m http.server` used for it are stopped, and no listener
remains on ports 1430/1431 (checked with `lsof`).
Retained: none.
Retention owner: not applicable.
Cleanup trigger: not applicable.
Processes: none. `bun test`, `cargo test`, and the headless render each exited before this record;
`git status` shows only the intended source, test, evidence, and record edits.
Evidence: `git status --porcelain` and `lsof -nP -iTCP:1430 -iTCP:1431` (empty) as recorded in the
handoff.

## Review and release

Approval: pending — merge and external actions require their own authorization.
Rollback: See plan.md.
Release: No release requested; merge and external actions require their own authorization.
Feedback: Link an Incident and regression Eval when a real failure occurs.
