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
template-loading and Skill-reference regression cases.

## Fixed input and environment

Run `bun test script/verify/checks.test.ts script/devflow.test.ts` from a CodeTwo checkout. CI pins Bun 1.3.10. Branch-diff
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

- New work needs only one record: existing request authorization enables bounded local work; a failed
  check can be preserved in a Draft PR, while Ready PR and release remain blocked.
- Schema 4 checks source, scope, unique/checked criteria, revision, and high-risk independent design.
- PR event JSON drives the base comparison and draft readiness; PR text never becomes shell code.
- Incident creation produces one linked follow-up rather than asking the operator to create it twice.

## Scoring and failure classes

Assertions are deterministic. A false pass is an enforcement regression. A false failure is a
checker compatibility defect. Bun or temporary-Git setup failure is an environment failure and
must not be reported as a lifecycle verdict.

## Last result

Result: pass.
Revision: Skill-owned documentation and approved Astra scaffold cleanup worktree on 2026-09-08, linked in Provenance.
Evidence: `npx --yes --package=bun@1.3.10 bun test script/verify/checks.test.ts script/devflow.test.ts`
passed 14 tests and 113 assertions on Bun 1.3.10, the CI runtime. Fixtures replay local failure and
correction, Draft/Ready transitions, changed-record links, event base validation, high-risk design,
release approval, scope freshness, deletions/renames, Incident follow-up, and Skill-owned template
loading. The documentation fixture rejects broken Skill reference links. No provider or app
runtime was started; test writes and commits were confined to disposable directories.

The contract suite and instruction inspection do not establish model behavioral improvement.
Reduced pauses, context use, and near-miss Skill selection remain unmeasured without model replay.
