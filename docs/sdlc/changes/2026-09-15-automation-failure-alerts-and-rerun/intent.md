---
id: 2026-09-15-automation-failure-alerts-and-rerun
schema: 5
stage: intent
status: accepted
owner: chenli
created: 2026-09-15
source: user
risk: medium
approved_by: chenli
approved_at: 2026-09-15
approval_source: "Direct request: 开工，四项全做，分批；并按诚实原则先做其余三项。Batch 1 = 定时执行失败告警与重跑语义。"
next_trigger: chenli reviews verified work.
---

# Intent: Automation failure alerts and rerun semantics

## Intent

Scheduled automations already have durable cron scheduling, run history, run statuses, and a
manual "Run now". Two gaps remain for unattended use, taken from a competitive review of
todos.dev's scheduled-execution experience:

1. **A failed or attention-requiring run is silent.** `AutomationRunStatus::Failed` and
   `NeedsAttention` are persisted (`crates/core/src/automation.rs:598-612`), but nothing notifies a
   user who is not looking at the Automations page. The only host event is `automation-changed`
   (`apps/desktop/src-host/src/automation.rs:65-67`), a refresh hint for an already-open page.
2. **A run cannot be replayed as it ran.** Runs execute from the automation's *current* `prompt`
   (`apps/desktop/src-host/src/automation.rs:288`), so editing the instruction silently changes what
   a rerun would do, and history cannot reproduce the instruction that produced a given run.

Outcome: an unattended failure raises a native OS notification and an in-app alert with a rerun
action; a recorded run can be replayed with the exact instruction snapshot it used.

Constraints: preserve the durable claim/interrupt guarantees; add only additive, backfilled
storage; no new dependency; keep the existing `Run now` and manual-run behavior; no automatic
retry loop in this change. Non-goals: a per-run cost/token breakdown (deferred by the honest-usages
decision), a server-side scheduler for runs while the app is closed, and a configurable turn
timeout for hung runs.

Related implementation: `crates/core/src/automation.rs`,
`apps/desktop/src-host/src/automation.rs`, `apps/desktop/src/automation/AutomationsPage.tsx`.
