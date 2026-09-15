---
id: 2026-09-15-automation-failure-alerts-and-rerun
schema: 5
stage: plan
status: accepted
owner: chenli
created: 2026-09-15
based_on: spec.md
scope: docs/sdlc/changes/2026-09-15-automation-failure-alerts-and-rerun/intent.md, docs/sdlc/changes/2026-09-15-automation-failure-alerts-and-rerun/spec.md, docs/sdlc/changes/2026-09-15-automation-failure-alerts-and-rerun/plan.md, docs/sdlc/changes/2026-09-15-automation-failure-alerts-and-rerun/verification.md, crates/core/src/automation.rs, apps/desktop/src-host/src/automation.rs, apps/desktop/src/electrobun/index.ts, apps/desktop/src/bridge.ts, apps/desktop/src/automation/AutomationsPage.tsx, apps/desktop/src/i18n/strings.ts, apps/desktop/tests/automationPageRendered.test.tsx
---

# Plan: Automation failure alerts and rerun semantics

## Plan

Smallest implementation, one owner per fact:

1. `crates/core/src/automation.rs` — add `prompt` to `automation_runs` (schema text + additive
   `ensure_run_column` guard + backfill in `install`), carry a `prompt` field through `AutomationRun`,
   `new_run`/`insert_run`/`run_from_row`, snapshot it in `claim_scheduled_automation_run` and
   `create_manual_automation_run`, and add `rerun_automation_run`. Add unit tests for the snapshot,
   the rerun refusal paths, and the legacy-schema backfill.
2. `apps/desktop/src-host/src/automation.rs` — execute `run.prompt`; add the `automation.rerun`
   command; emit `automation-alert` exactly on a transition into `failed`/`needs_attention` (from
   the event loop and the synchronous `fail` path).
3. `apps/desktop/src/electrobun/index.ts` — show `Utils.showNotification` for `automation-alert` in
   the host `onEvent`, before the renderer-ready branch.
4. `apps/desktop/src/bridge.ts` — add the `AutomationRun.prompt` field, `rerunAutomation(runId)`, and
   `onAutomationAlert(cb)` (typed alert payload).
5. `apps/desktop/src/automation/AutomationsPage.tsx` — subscribe to alerts and show an error toast
   with a rerun action; add a rerun action to each run-history row.
6. `apps/desktop/src/i18n/strings.ts` — add the new `automations.*` keys to both `en` and `zhCN`.
7. `apps/desktop/tests/automationPageRendered.test.tsx` — extend the rendered check to cover the
   alert subscription wiring where the harness allows.

Checks by risk and affected behavior:

- Rust core (persistence + replay): `cargo test -p codetwo-core automation` and
  `cargo check -p codetwo-core --all-targets`.
- Desktop host: `cargo check -p codetwo-desktop-host --all-targets`.
- Desktop renderer: from `apps/desktop`, `bun run lint`, `bun test`, `bun run build`.
- Repository: `bun script/verify/sdlc.ts --worktree` before handoff.
- Actual rendered window (AC-4/AC-5) is required by the workflow for UI acceptance. This
  environment has no display and the machine may own a live instance, so the real-window check is
  recorded as not performed with its residual risk rather than claimed.

Temporary resources: none. Tests use `Store::open_in_memory` and the shared ignored `target/`
directory; no task-owned scratch roots, processes, or ports are created.

Rollback: revert the change commit and delete this record's directory. The additive column is
tolerated by older code because it is unread, and existing rows are untouched.
