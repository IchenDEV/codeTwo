---
id: eval-ai-native-sdlc-gates
kind: eval
status: active
owner: repository maintainers
approvers: user via the 2026-08-30 lifecycle migration request
created: 2026-08-30
updated: 2026-08-30
source: change-2026-08-30-ai-native-sdlc-migration
inputs: isolated temporary Git repositories and the live Artifact tree
outputs: deterministic success and failure-path assertions
next_trigger: any project instruction, lifecycle checker, template, CI Gate, or release Gate change
---

# Enforce AI-native lifecycle Gates

## Provenance

This Eval comes from the real
[AI-native SDLC migration](../changes/2026-08-30-ai-native-sdlc-migration.md), which replaces a
shape-only checker that could accept implementation before Intent approval and did not close
verification, release, Incident, or Eval evidence.

## Fixed input and environment

Run `bun test script/check-sdlc.test.ts` from a CodeTwo checkout with Bun 1.3.10. Each branch-diff
fixture is a temporary Git repository with a fixed baseline. The live check reads the current
repository without starting CodeTwo or using its runtime data.

## Allowed actions

The test may read the checkout and create, commit, mutate, and delete files only inside temporary
directories. It must not start CodeTwo, invoke providers, access production, change GitHub, publish,
deploy, or modify the user's application data.

## Observable acceptance

- A valid `executing` Artifact and the live repository pass.
- Superseded lifecycle sources, duplicate ids, and missing required sections fail.
- `verified` fails with unchecked acceptance, missing verdict, or missing residual risk.
- release readiness fails without approval or target; `released` fails without identity or smoke.
- a resolved Incident fails without recovery, follow-up change, or regression Eval links.
- an active Eval fails without linked provenance, result, or revision.
- an Artifact-only draft passes, but implementation beside that draft fails until it reaches
  `executing`; a branch with no changed change Artifact fails.

## Scoring and failure classes

Assertions are deterministic. A false pass is an enforcement regression. A false failure is a
checker compatibility defect. Bun or temporary-Git setup failure is an environment failure and
must not be reported as a lifecycle verdict.

## Last result

Result: pass.
Revision: working tree rebased onto `e3744874` on 2026-08-30.
Evidence: `bun test script/check-sdlc.test.ts` passed all 10 tests with 24 assertions; the live
checker passed; a temporary committed copy of the full diff passed `--base` branch
validation; the named migration change was rejected by the release Gate because it was not
`ready-to-release`. Two earlier test iterations exposed and then corrected target normalization and
fixture/base-diff defects, as recorded in the linked change Artifact.
