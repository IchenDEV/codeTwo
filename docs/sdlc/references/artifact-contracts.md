# Artifact formats

Use the [canonical workflow](../../../.agents/skills/codetwo-develop/references/workflow.md) and [single change template](../../../.agents/skills/codetwo-develop/templates/change.md)
for new work. Schema 4 stores authorization, scope, state, acceptance, and evidence once in
`changes/<date>-<slug>/change.md`.

Existing schema-3 `intent.md`, `spec.md`, `plan.md`, and `verification.md` retain their recorded
approval order and validation rules. Their templates remain for historical reference. Do not mix
formats or rewrite unrelated historical approvals. The [checker](../../../script/verify/stage-bundle.ts)
is the format enforcement source; this page preserves links from historical records.
