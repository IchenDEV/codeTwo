---
id: "2026-08-30-ai-native-sdlc-migration"
stage: verification
schema: 3
status: passed
owner: repository maintainers
created: 2026-08-30
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "repository maintainers"
verified_at: "2026-08-30"
release_target: none. This repository-process change does not itself ship a product release
release_identity: ""
---

# Verification: Replace the repository lifecycle with the AI-native SDLC contract

## Automated checks

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — [`workflow.md`](../../workflow.md), [`AGENTS.md`](../../../../AGENTS.md), and repository CI/release workflows point to the same lifecycle.
- AC-2: PASS — `git diff --check` and exact-path checks confirmed the superseded bootstrap Artifact and legacy Eval were absent while product history remained.
- AC-3: PASS — [`check-sdlc.ts`](../../../../script/verify/sdlc.ts) and [`check-sdlc.test.ts`](../../../../script/verify/checks.test.ts) implement the recorded Gates.
- AC-4: PASS — `bun script/verify/sdlc.ts --base e3744874` passed in an isolated committed temporary worktree.
- AC-5: PASS — `bun test script/verify/checks.test.ts` passed 10 tests with 24 assertions and `bun script/verify/sdlc.ts` returned `[sdlc] contract valid`.
- AC-6: PASS — [`workflow.md`](../../workflow.md) records branch protection and production monitoring as external or blocked rather than repository-controlled.

Observed on 2026-08-30 from the working tree rebased onto `e3744874`:

- `bun test script/verify/checks.test.ts` passed all 10 tests with 24 assertions. It covers valid
  execution, superseded sources,
  duplicate ids, missing sections, acceptance closure, verification verdict/risk, release approval,
  release identity/smoke, Incident feedback, Eval provenance/result, Artifact-only draft review,
  premature implementation, and missing-Artifact branch changes.
- `bun script/verify/sdlc.ts` returned `[sdlc] contract valid`.
- An isolated temporary worktree applied the complete repository diff, committed it over base
  `e3744874`, and passed `bun script/verify/sdlc.ts --base e3744874`; the worktree was removed after
  its dry-run.
- `bun script/verify/sdlc.ts --release-change change-2026-08-30-ai-native-sdlc-migration` failed as
  expected because this change is not `ready-to-release`.
- The first Ruby YAML command used an unavailable `Psych.safe_load_file`; a follow-up parsed both
  workflows before mistakenly including the Markdown PR template. The corrected Ruby 2.6-compatible
  command parsed `.github/workflows/sdlc.yml` and `.github/workflows/release-macos.yml` successfully.
- Exact file checks confirmed the superseded bootstrap and legacy Eval paths are absent.
- `git diff --check` passed. No product UI or runtime behavior changed, so rendered-window, Rust,
  packaging, and production smoke checks are not applicable to this repository-process change.
- The first push was rejected non-fast-forward because PR #183 landed four commits after the
  pre-push fetch. The migration rebased cleanly onto merge commit `e3744874`; its two new change
  Artifacts were preserved and migrated to the replacement contract before retrying.

Residual risk: no PR exists, so hosted CI and the external branch-protection requirement have not
been observed for this diff. Repository-owned production monitoring and automatic Incident
creation remain blocked as documented in the workflow. The checker validates deterministic fields,
links, states, and evidence markers; human review still judges whether the evidence is sufficient
for the actual risk.

## Behavioral evidence

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — [`workflow.md`](../../workflow.md), [`AGENTS.md`](../../../../AGENTS.md), and repository CI/release workflows point to the same lifecycle.
- AC-2: PASS — `git diff --check` and exact-path checks confirmed the superseded bootstrap Artifact and legacy Eval were absent while product history remained.
- AC-3: PASS — [`check-sdlc.ts`](../../../../script/verify/sdlc.ts) and [`check-sdlc.test.ts`](../../../../script/verify/checks.test.ts) implement the recorded Gates.
- AC-4: PASS — `bun script/verify/sdlc.ts --base e3744874` passed in an isolated committed temporary worktree.
- AC-5: PASS — `bun test script/verify/checks.test.ts` passed 10 tests with 24 assertions and `bun script/verify/sdlc.ts` returned `[sdlc] contract valid`.
- AC-6: PASS — [`workflow.md`](../../workflow.md) records branch protection and production monitoring as external or blocked rather than repository-controlled.

Observed on 2026-08-30 from the working tree rebased onto `e3744874`:

- `bun test script/verify/checks.test.ts` passed all 10 tests with 24 assertions. It covers valid
  execution, superseded sources,
  duplicate ids, missing sections, acceptance closure, verification verdict/risk, release approval,
  release identity/smoke, Incident feedback, Eval provenance/result, Artifact-only draft review,
  premature implementation, and missing-Artifact branch changes.
- `bun script/verify/sdlc.ts` returned `[sdlc] contract valid`.
- An isolated temporary worktree applied the complete repository diff, committed it over base
  `e3744874`, and passed `bun script/verify/sdlc.ts --base e3744874`; the worktree was removed after
  its dry-run.
- `bun script/verify/sdlc.ts --release-change change-2026-08-30-ai-native-sdlc-migration` failed as
  expected because this change is not `ready-to-release`.
- The first Ruby YAML command used an unavailable `Psych.safe_load_file`; a follow-up parsed both
  workflows before mistakenly including the Markdown PR template. The corrected Ruby 2.6-compatible
  command parsed `.github/workflows/sdlc.yml` and `.github/workflows/release-macos.yml` successfully.
- Exact file checks confirmed the superseded bootstrap and legacy Eval paths are absent.
- `git diff --check` passed. No product UI or runtime behavior changed, so rendered-window, Rust,
  packaging, and production smoke checks are not applicable to this repository-process change.
- The first push was rejected non-fast-forward because PR #183 landed four commits after the
  pre-push fetch. The migration rebased cleanly onto merge commit `e3744874`; its two new change
  Artifacts were preserved and migrated to the replacement contract before retrying.

Residual risk: no PR exists, so hosted CI and the external branch-protection requirement have not
been observed for this diff. Repository-owned production monitoring and automatic Incident
creation remain blocked as documented in the workflow. The checker validates deterministic fields,
links, states, and evidence markers; human review still judges whether the evidence is sufficient
for the actual risk.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: no PR exists, so hosted CI and the external branch-protection requirement have not

## Verdict

Verdict: verified..

## Review and release

Approval: the user authorized a direct push to `main` on 2026-08-30 after requiring the checker and
tests to use the repository's Bun/TypeScript stack instead of Python; that condition is satisfied.
Release target: none. This repository-process change does not itself ship a product release.
Rollback: revert the repository migration diff to restore the previous contract and checker.
No release: no versioned package, deployment, or production mutation is part of this change.

## Feedback

The active regression is
[`eval-ai-native-sdlc-gates`](../../evals/ai-native-sdlc-gates.md). New lifecycle enforcement changes
rerun that focused Eval. Real operational failures must create an Incident, a follow-up Intent, and
an Incident-derived Eval instead of expanding this generic case without provenance.

During handoff, the user rejected introducing Python into a repository with no Python source files.
The checker and all lifecycle tests, commands, documentation, and CI hooks were therefore migrated
to Bun/TypeScript before any commit or push.
