---
id: eval-ai-native-sdlc-gates
kind: eval
status: active
owner: repository maintainers
approvers: user via the 2026-08-30 lifecycle migration request
created: 2026-08-30
updated: 2026-08-31
source: change-2026-08-30-ai-native-sdlc-migration
inputs: isolated temporary repositories, the live Artifact tree, and the documentation catalog
outputs: deterministic success and failure-path assertions
next_trigger: any project instruction, lifecycle checker, template, CI Gate, or release Gate change
---

# Enforce AI-native lifecycle Gates

## Provenance

This Eval comes from the real
[AI-native SDLC migration](../changes/2026-08-30-ai-native-sdlc-migration/intent.md), which replaces a
shape-only checker that could accept implementation before Intent approval and did not close
verification, release, Incident, or Eval evidence. The
[strict schema-3 hardening](../changes/2026-08-31-strict-sdlc-v2/intent.md) extends this same Eval
with risk, scope, criterion-to-evidence, verifier-identity, and local worktree regressions. The
[script organization](../changes/2026-08-31-organize-scripts/intent.md) condenses those failure
classes into one focused suite without changing either Gate.

## Fixed input and environment

Run `bun test script/verify/checks.test.ts` from a CodeTwo checkout with Bun 1.3.10. Branch-diff
fixtures use temporary Git repositories with fixed baselines; documentation fixtures use isolated
temporary directories. Live checks read the repository without starting CodeTwo or using its
runtime data.

## Allowed actions

The test may read the checkout and create, commit, mutate, and delete files only inside temporary
directories. It must not start CodeTwo, invoke providers, access production, change GitHub, publish,
deploy, or modify the user's application data.

## Observable acceptance

- Valid documentation, `executing` changes, and `verified` changes pass.
- Documentation drift fails for an unclassified file, broken local link, orphan image, or legacy
  change schema.
- Duplicate change ids, non-passing acceptance evidence, and owner-approved high-risk changes fail.
- release readiness fails without approval or target; `released` fails without identity or smoke.
- a resolved Incident fails without recovery, follow-up change, or regression Eval links.
- an active Eval fails without linked provenance, result, or revision.
- the committed branch Gate rejects uncovered paths and a changed schema-1 Artifact.
- the worktree Gate sees staged and untracked files and rejects paths outside the changed Artifact
  scope.

## Scoring and failure classes

Assertions are deterministic. A false pass is an enforcement regression. A false failure is a
checker compatibility defect. Bun or temporary-Git setup failure is an environment failure and
must not be reported as a lifecycle verdict.

## Last result

Result: pass.
Revision: uncommitted script-organization worktree over `cdbfefe9` on 2026-08-31. Evidence:
`bun test script/verify/checks.test.ts` passed all 5 focused tests with 23 assertions. The suite
covers the valid path plus documentation drift, acceptance and authority closure, release,
Incident/Eval evidence, committed branch scope/schema, and staged/untracked worktree scope.
`bun script/verify/docs.ts`, the plain lifecycle checker, and the `--worktree` Gate passed. The
first consolidated worktree fixture did not modify its Change Artifact and was corrected before
this passing result. Isolated committed-diff evidence is recorded in the governing script change.
