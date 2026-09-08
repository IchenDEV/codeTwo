# Artifact formats

Use the [canonical workflow](../../../.agents/skills/codetwo-develop/references/workflow.md) and its
[Intent](../../../.agents/skills/codetwo-develop/templates/intent.md),
[Spec](../../../.agents/skills/codetwo-develop/templates/spec.md),
[Plan](../../../.agents/skills/codetwo-develop/templates/plan.md), and
[Verification](../../../.agents/skills/codetwo-develop/templates/verification.md) templates for new
schema-5 changes. Each file owns its facts under one change directory; ordinary implementation
authorization is recorded once in Intent.

Historical schema-3 stage bundles and schema-4 `change.md` records retain their validation rules.
Do not mix formats or rewrite unrelated historical approvals. The
[checker](../../../script/verify/stage-bundle.ts) is the format enforcement source; this page
preserves links from historical records.
