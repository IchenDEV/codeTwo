---
id: eval-ai-native-sdlc-gates
kind: eval
status: active
owner: repository maintainers
approvers: user via the 2026-08-30 lifecycle migration request
created: 2026-08-30
updated: 2026-09-08
source: change-2026-08-30-ai-native-sdlc-migration
inputs: isolated temporary repositories, the live Artifact tree, and the documentation catalog
outputs: deterministic success and failure-path assertions
next_trigger: changes to authorization, routing, lifecycle behavior, template structure, or checkers; pure wording edits use documentation and scope checks only
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
classes into one focused suite without changing either Gate. The
[single-record redesign](../changes/2026-09-08-simplify-sdlc/change.md) adds regressions for the
observed four-file approval overhead, disconnected Ready PR check, and Incident follow-up linkage.
[Skill-owned documentation](../changes/2026-09-08-organize-documentation/change.md) adds the relocated
template-loading and Skill-reference regression cases. The
[four-stage contract](../changes/2026-09-08-four-stage-sdlc/intent.md) restores separate Intent, Spec,
Plan, and Verification files while retaining reusable request authorization and risk-based gates.

The [workflow cleanup change](../changes/2026-09-08-workflow-cleanup/intent.md) adds handoff cleanup
after repeated accumulation of disposable profile builds and probes.

## Fixed input and environment

Run `bun test script/verify/checks.test.ts script/verify/four-stage.test.ts script/devflow.test.ts` from a CodeTwo checkout. CI pins Bun 1.3.10. Branch-diff
fixtures use temporary Git repositories with fixed baselines; documentation fixtures use isolated
temporary directories. Live checks read the repository without starting CodeTwo or using its
runtime data.

## Allowed actions

The test may read the checkout and create, commit, mutate, and delete files only inside temporary
directories. It must not start CodeTwo, invoke providers, access production, change GitHub, publish,
deploy, or modify the user's application data.

## Observable acceptance

- Valid documentation, sequential draft stages, accepted plans, and passing verification records pass.
- Gaps, unapproved predecessors, unfinished markers, and differing evidence for the same acceptance id fail.
- Documentation drift fails for an unclassified file, broken local link, orphan image, or legacy
  change schema.
- Duplicate change ids, non-passing acceptance evidence, and owner-approved high-risk changes fail.
- Release readiness fails without approval, target, rollback, or passing evidence; remote publication and smoke remain externally verified facts.
- a resolved Incident fails without recovery, follow-up change, or regression Eval links.
- an active Eval fails without linked provenance, result, or revision.
- the committed branch Gate rejects uncovered paths, unchanged historical approval, and outdated stage schemas.
- the worktree Gate sees staged and untracked files and rejects paths outside the changed Artifact
  scope, including deleted paths and both sides of renames.

- Existing request authorization enables bounded local work; a failed
  check can be preserved in a Draft PR, while Ready PR and release remain blocked.
- Historical schema 4 checks source, scope, unique/checked criteria, revision, and high-risk independent design.
- New schema 5 creates four drafts together, keeps each authority field in its owning stage, and
  accepts ordinary Spec/Plan under Intent authorization. Missing stages, mixed schemas, missing
  high-risk design confirmation, and self-verification fail. AC-N maps from Spec to Verification
  while actual-diff scope and release checks continue to apply.
- PR event JSON drives the base comparison and draft readiness; PR text never becomes shell code.
- Incident creation produces one linked follow-up rather than asking the operator to create it twice.

- New/change-touched schema-5 records require cleanup tracking; deleting the field cannot bypass
  worktree, Ready PR or release checks. Pending cleanup blocks a passed result. Retained temporary
  resources require an owner and cleanup trigger; genuine blockers remain reportable. Historical
  untouched records remain readable. Tests clean their temporary repositories in `finally`.

## Scoring and failure classes

Assertions are deterministic. A false pass is an enforcement regression. A false failure is a
checker compatibility defect. Bun or temporary-Git setup failure is an environment failure and
must not be reported as a lifecycle verdict.

## Last result

Result: pass.
Revision: Workflow cleanup worktree based on 21ea4f3f on 2026-09-08, linked in Provenance.
Evidence: `bun test script/verify/checks.test.ts script/verify/four-stage.test.ts script/devflow.test.ts`
passed 31 tests and 245 assertions on Bun 1.4.2. New cases cover generated cleanup tracking,
pending cleanup blocking a passed result, incomplete retention/evidence, reportable cleanup
blockers, historical read compatibility, changed-record omission, and Ready PR/release omission
without a base comparison. Fixtures remove their temporary directories in `finally`. No GUI,
provider or native runtime was started.

Prior evidence: the four-stage suite passed 28 tests and 217 assertions on Bun 1.4.2 and CI-pinned
Bun 1.3.10. That older cross-version run is not evidence for the cleanup increment; the current
increment was checked locally on Bun 1.4.2. Remote CI was not run.

These deterministic tests enforce record completeness, not actual filesystem deletion or model
behavior. Agents must execute and inspect cleanup; this change adds no deletion daemon or scheduler.
