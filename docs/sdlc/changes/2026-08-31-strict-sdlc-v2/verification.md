---
id: "2026-08-31-strict-sdlc-v2"
stage: verification
schema: 3
status: passed
owner: codex
created: 2026-08-31
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "codex"
verified_at: "2026-08-31"
release_target: none
release_identity: "not applicable until released."
---

# Verification: Harden CodeTwo's AI-native SDLC contract

## Automated checks

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bun test script/verify/checks.test.ts` accepted the valid schema-2 executing fixture.
- AC-2: PASS — `bun test script/verify/checks.test.ts` rejected invalid risk, unsafe scope, owner-approved high risk, and changed schema-1 implementation fixtures.
- AC-3: PASS — `bun test script/verify/checks.test.ts` rejected non-passing mappings, missing verifier identity, and an owner-verified high-risk fixture.
- AC-4: PASS — `bun script/verify/sdlc.ts --worktree` passed the live diff; the focused fixture separately proved staged, unstaged, untracked, and uncovered-path behavior.
- AC-5: PASS — [`workflow.md`](../../workflow.md), [`intent.md`](../../templates/intent.md), [`AGENTS.md`](../../../../AGENTS.md), and the [PR template](../../../../.github/pull_request_template.md) now point to the same schema-2 contract and authorization boundary.
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

## Behavioral evidence

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bun test script/verify/checks.test.ts` accepted the valid schema-2 executing fixture.
- AC-2: PASS — `bun test script/verify/checks.test.ts` rejected invalid risk, unsafe scope, owner-approved high risk, and changed schema-1 implementation fixtures.
- AC-3: PASS — `bun test script/verify/checks.test.ts` rejected non-passing mappings, missing verifier identity, and an owner-verified high-risk fixture.
- AC-4: PASS — `bun script/verify/sdlc.ts --worktree` passed the live diff; the focused fixture separately proved staged, unstaged, untracked, and uncovered-path behavior.
- AC-5: PASS — [`workflow.md`](../../workflow.md), [`intent.md`](../../templates/intent.md), [`AGENTS.md`](../../../../AGENTS.md), and the [PR template](../../../../.github/pull_request_template.md) now point to the same schema-2 contract and authorization boundary.
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

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: the checker validates declared identity, dates, paths, and evidence shape; it cannot

## Verdict

Verdict: verified..

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
