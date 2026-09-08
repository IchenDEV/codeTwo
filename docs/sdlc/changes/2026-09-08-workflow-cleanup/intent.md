---
id: 2026-09-08-workflow-cleanup
schema: 5
stage: intent
status: accepted
owner: codex
created: 2026-09-08
source: user
risk: medium
approved_by: chenli
approved_at: 2026-09-08
approval_source: "Session: user requested integrating cleanup into the overall workflow to prevent repeated artifact accumulation."
---

# Intent: Workflow cleanup

## Intent

Make ownership-aware cleanup a required work-cycle closeout, including failed, blocked and cancelled tasks. The motivating [profile work](../2026-09-08-desktop-dev-profiles/intent.md) accumulated about 8.73 GiB of disposable builds before explicit cleanup. Reuse the four-stage lifecycle and its checks; preserve user data, requested deliverables, unrelated workers and historical records. Do not launch GUI instances or introduce a deletion daemon.
