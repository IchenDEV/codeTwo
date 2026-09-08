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

## Scoring and failure classes

Assertions are deterministic. A false pass is an enforcement regression. A false failure is a
checker compatibility defect. Bun or temporary-Git setup failure is an environment failure and
must not be reported as a lifecycle verdict.

## Last result

Result: pass.
Revision: Four-stage SDLC worktree based on 948b703b on 2026-09-08, linked in Provenance.
Evidence: `bun test script/verify/checks.test.ts script/verify/four-stage.test.ts script/devflow.test.ts`
passed 28 tests and 217 assertions on Bun 1.4.2, and the same suite passed on CI-pinned Bun 1.3.10
using `npx --yes --package=bun@1.3.10 bun test script/verify/checks.test.ts script/verify/four-stage.test.ts script/devflow.test.ts`. The independent `verify_four_stage` agent authored 14 of these
contract tests and ran the complete suite. Cases cover generated drafts, ordinary authorization
reuse, independent high-risk design and verification, metadata ownership, checked criteria,
missing/duplicate/failing evidence, revision, schema compatibility, actual Git diff scope,
Draft/Ready/release gates, and Incident links. No provider or app runtime was started; writes and
commits were confined to disposable repositories. A missing-Intent directory alongside valid
records first reproduced a false pass; discovery now includes every stage filename and that
regression passes.

These deterministic tests and instruction inspection do not establish model behavioral improvement.
Reduced pauses and context use remain unmeasured without model replay.
