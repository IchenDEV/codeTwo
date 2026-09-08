---
id: 2026-09-08-workflow-cleanup
schema: 5
stage: spec
status: accepted
owner: codex
created: 2026-09-08
based_on: intent.md
---

# Spec: Workflow cleanup

## Design

The existing workflow owns cleanup policy and other Skills link to it. Plan records temporary-resource ownership; Verification owns cleanup status, disposal evidence and accountable retention. Add deterministic completeness checks to existing worktree/PR/release gates, retaining schema-5 historical read compatibility. No checker performs deletion or terminates processes.

## Acceptance criteria

- [x] AC-1: Development, operations and release instructions route to one cleanup policy that covers all handoffs and preserves protected resources.
- [x] AC-2: Generated plans and verifications track resources and cleanup. Pending cleanup cannot pass verification; retained output requires ownership and a cleanup trigger; genuine blockers can be reported.
- [x] AC-3: Changed schema-5 bundles cannot bypass cleanup by omitting metadata, including Ready PR and release paths without a base diff. Unchanged historical records remain readable.
- [x] AC-4: The lifecycle Eval and documentation/scope checks pass with disposable test repositories removed; no GUI, provider or user runtime is started.
