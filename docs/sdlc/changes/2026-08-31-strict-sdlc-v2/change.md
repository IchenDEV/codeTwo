---
id: change-2026-08-31-strict-sdlc-v2
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: user via the current 2026-08-31 implementation request
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: current user request, informed by Codex task 01a05173-aa39-7963-b3f4-d7d66616e53b
inputs: the accepted CodeTwo lifecycle, repository CI and release Gates, and the referenced theme workflow
outputs: strict schema-v2 Artifact enforcement, focused regression tests, and recorded dry-run evidence
scope: AGENTS.md, docs/sdlc, script/verify/sdlc.ts, script/verify/checks.test.ts, .github/pull_request_template.md
next_trigger: merge the approved pull request after required checks pass
verification_mode: owner
verified_by: codex
verified_at: 2026-08-31
---

# Harden CodeTwo's AI-native SDLC contract

## Intent

CodeTwo already has one canonical lifecycle, a Bun checker, CI, release gating, Incident templates,
and a real-task Eval. The current contract is still looser than the referenced theme workflow in
three observable ways: risk is prose rather than machine-readable state, one unrelated changed
Artifact can cover arbitrary branch files, and a checked acceptance list can be marked verified
without evidence mapped to each criterion. The normal local checker also cannot apply the branch
Gate to uncommitted work before handoff.

The desired outcome is a stricter, versioned contract for every new or updated change Artifact
without rewriting historical evidence merely to satisfy a new template. Product behavior and
external GitHub settings are not part of this change.

## Spec

- Schema-v2 change Artifacts declare risk, approved-at time, explicit repository scope, and
  verification identity in machine-readable flat metadata.
- Any change Artifact added or updated beside repository implementation must use schema v2. Legacy
  Artifacts remain readable until they are changed, at which point they are upgraded.
- The branch or worktree Gate rejects changed files not covered by an executing-or-later Artifact's
  explicit scope.
- Schema-v2 acceptance criteria use stable `AC-N` identifiers. `verified` requires one concrete
  `PASS` evidence mapping per criterion; `failed` retains `PASS`, `FAIL`, or `BLOCKED` mappings and
  at least one observed failure.
- High and critical risk changes require an approver and verifier distinct from the implementation
  owner. Lower-risk changes still retain separate merge and release human Gates.
- The same deterministic Gate runs against committed PR differences in CI and against local staged,
  unstaged, and untracked changes before handoff.

### Acceptance criteria

- [x] AC-1: A schema-v2 executing Artifact with valid risk, approval, scope, and pending verification passes.
- [x] AC-2: Invalid risk, unsafe scope, owner-approved high risk, and schema-v1 implementation changes fail deterministically.
- [x] AC-3: Verified schema-v2 Artifacts fail unless every unique acceptance ID has one concrete passing evidence mapping and verification identity.
- [x] AC-4: The local worktree Gate detects staged, unstaged, and untracked repository changes and rejects uncovered paths.
- [x] AC-5: Workflow, template, PR handoff, and root instructions describe the same strict versioned contract and human authorization boundary.
- [x] AC-6: The focused Eval, live repository check, live worktree Gate, and diff check pass with actual results recorded here.

## Decision and gates

The user's current direct implementation request accepts this Intent and its observable Spec, with
the user as named approver. It authorizes repository implementation and local verification only.
Merge, push, pull-request creation, release, deployment, external branch-protection changes, and
production mutation remain separate human or external Gates.

The change is medium risk because it modifies the repository enforcement path and can block later
work, but it does not alter product runtime, user data, credentials, signing, or production state.

## Plan

1. Version the compact change contract without creating another lifecycle registry.
2. Extend the Bun checker with risk, scope, acceptance-evidence, verification-identity, and local
   worktree enforcement.
3. Extend the existing real-task Eval with accepted and representative rejected fixtures.
4. Update the canonical workflow, template, root instruction, and PR handoff.
5. Run the focused tests, live checker, worktree Gate, and diff check; preserve any failed
   iterations and record residual risk.

Rollback is one repository revert of this hardening diff. Historical change, Incident, and Eval
Artifacts remain in place throughout.

## Build

The existing compact Artifact model remains authoritative. [`check-sdlc.ts`](../../../../script/verify/sdlc.ts)
now validates schema-2 risk, explicit path scope, independent high/critical approval and
verification, stable acceptance IDs, per-criterion evidence, and staged/unstaged/untracked
worktree changes. Its existing PR `--base` mode applies the same scope and schema Gate to committed
differences.

[`check-sdlc.test.ts`](../../../../script/verify/checks.test.ts) extends the real-task Eval from 10 to 14
tests. The canonical workflow, template, root instructions, and PR handoff now describe those exact
rules. No parallel registry, product code, runtime data, GitHub setting, or release workflow was
added or changed. There were no material deviations from the accepted Plan.

## Verification

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bun test script/verify/checks.test.ts` accepted the valid schema-2 executing fixture.
- AC-2: PASS — `bun test script/verify/checks.test.ts` rejected invalid risk, unsafe scope, owner-approved high risk, and changed schema-1 implementation fixtures.
- AC-3: PASS — `bun test script/verify/checks.test.ts` rejected non-passing mappings, missing verifier identity, and an owner-verified high-risk fixture.
- AC-4: PASS — `bun script/verify/sdlc.ts --worktree` passed the live diff; the focused fixture separately proved staged, unstaged, untracked, and uncovered-path behavior.
- AC-5: PASS — [`workflow.md`](../../workflow.md), [`change.md`](../../templates/change.md), [`AGENTS.md`](../../../../AGENTS.md), and the [PR template](../../../../.github/pull_request_template.md) now point to the same schema-2 contract and authorization boundary.
- AC-6: PASS — `bun test script/verify/checks.test.ts`, `bun script/verify/sdlc.ts`, `bun script/verify/sdlc.ts --worktree`, and `git diff --check` passed; an isolated committed copy of the full diff also passed `--base HEAD~1`.

Observed on 2026-08-31 with Bun 1.3.10 over baseline `cdbfefe9`:

- The focused Eval passed 14 tests with 35 assertions.
- The plain live Artifact-tree check and the live worktree Gate each returned
  `[sdlc] contract valid`.
- A temporary detached worktree applied the full eight-file diff, added this new Artifact, committed
  it over `cdbfefe9`, and passed `bun script/verify/sdlc.ts --base HEAD~1`. The temporary worktree was
  removed by the validation command's cleanup trap.
- `git diff --check` passed. Product build, rendered-window, package, release, and production smoke
  checks are not applicable because no product or release behavior changed.

Residual risk: the checker validates declared identity, dates, paths, and evidence shape; it cannot
prove that a named human actually approved the text or that evidence is semantically sufficient.
An author can intentionally broaden a non-root directory scope, so review still judges scope and
causality. Hosted CI and the external branch-protection requirement have not run for this unpushed
worktree, and CodeTwo still has no repository-owned production monitoring integration.

## Review and release

Approval: user approved pull-request creation and merge on 2026-08-31.
Pull request: [#189](https://github.com/IchenDEV/codeTwo/pull/189).
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this hardening diff to restore the preceding checker and contract.
No release: this process-only change does not itself publish a product package or mutate production.

Preparing or verifying this change does not authorize merge, push, deployment, or release.

## Feedback

The referenced theme task demonstrated machine-checked stage ordering, explicit risk, human
approval records, and fresh verification. CodeTwo keeps its existing compact Artifact model, but
adopts the enforceable parts that close real gaps rather than copying that repository's directory
shape.
