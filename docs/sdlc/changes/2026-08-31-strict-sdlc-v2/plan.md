---
id: "2026-08-31-strict-sdlc-v2"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: medium
scope: AGENTS.md, docs/sdlc, script/verify/sdlc.ts, script/verify/checks.test.ts, .github/pull_request_template.md
approved_by: "userthe current 2026-08-31 implementation request"
approved_at: "2026-08-31"
---

# Plan: Harden CodeTwo's AI-native SDLC contract

## Files and ownership

AGENTS.md, docs/sdlc, script/verify/sdlc.ts, script/verify/checks.test.ts, .github/pull_request_template.md

## Order of work

1. Version the compact change contract without creating another lifecycle registry.
2. Extend the Bun checker with risk, scope, acceptance-evidence, verification-identity, and local
   worktree enforcement.
3. Extend the existing real-task Eval with accepted and representative rejected fixtures.
4. Update the canonical workflow, template, root instruction, and PR handoff.
5. Run the focused tests, live checker, worktree Gate, and diff check; preserve any failed
   iterations and record residual risk.

Rollback is one repository revert of this hardening diff. Historical change, Incident, and Eval
Artifacts remain in place throughout.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

The existing compact Artifact model remains authoritative. [`check-sdlc.ts`](../../../../script/verify/sdlc.ts)
now validates schema-2 risk, explicit path scope, independent high/critical approval and
verification, stable acceptance IDs, per-criterion evidence, and staged/unstaged/untracked
worktree changes. Its existing PR `--base` mode applies the same scope and schema Gate to committed
differences.

[`check-sdlc.test.ts`](../../../../script/verify/checks.test.ts) extends the real-task Eval from 10 to 14
tests. The canonical workflow, template, root instructions, and PR handoff now describe those exact
rules. No parallel registry, product code, runtime data, GitHub setting, or release workflow was
added or changed. There were no material deviations from the accepted Plan.

## Decision

The user's current direct implementation request accepts this Intent and its observable Spec, with
the user as named approver. It authorizes repository implementation and local verification only.
Merge, push, pull-request creation, release, deployment, external branch-protection changes, and
production mutation remain separate human or external Gates.

The change is medium risk because it modifies the repository enforcement path and can block later
work, but it does not alter product runtime, user data, credentials, signing, or production state.
