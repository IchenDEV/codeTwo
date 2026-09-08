---
id: 2026-09-08-workflow-cleanup
schema: 5
stage: plan
status: accepted
owner: codex
created: 2026-09-08
based_on: spec.md
scope: AGENTS.md, .agents/skills/codetwo-develop/SKILL.md, .agents/skills/codetwo-develop/references/workflow.md, .agents/skills/codetwo-develop/templates/plan.md, .agents/skills/codetwo-develop/templates/verification.md, .agents/skills/codetwo-release/SKILL.md, .agents/skills/codetwo-operations/SKILL.md, script/devflow.ts, script/devflow.test.ts, script/verify/stage-bundle.ts, script/verify/sdlc.ts, script/verify/four-stage.test.ts, docs/sdlc/evals/ai-native-sdlc-gates.md, docs/sdlc/changes/2026-09-08-workflow-cleanup/, docs/sdlc/changes/2026-09-08-desktop-dev-profiles/verification.md
---

# Plan: Workflow cleanup

## Plan

Codex owns policy links, template additions, the shared metadata validator and regression tests. Exercise pending, complete, retained and blocked cleanup; test historical compatibility and field-removal bypass through actual Git diffs and the PR CLI. Run the active lifecycle Eval, documentation and worktree scope checks. Reuse earlier native/renderer evidence because this change touches no application behavior.

Temporary resources: test-owned `codetwo-devflow-*` and `codetwo-four-stage-*` directories are removed in test `finally` blocks. No build output, GUI or provider process is needed. Record results here instead of adding another persistent report directory.

Rollback: Revert this scoped lifecycle increment without reverting the earlier profile implementation or deleting retained user/test data.
