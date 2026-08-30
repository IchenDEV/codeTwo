---
id: change-2026-08-30-ai-native-sdlc-migration
kind: change
schema: 2
status: verified
risk: medium
owner: repository maintainers
approvers: user via the 2026-08-30 implementation request
approved_at: 2026-08-30
created: 2026-08-30
updated: 2026-08-31
source: current user request to apply the ai-native-sdlc skill and remove the existing lifecycle
inputs: docs/sdlc/workflow.md and the repository CI, review, release, and history mechanisms
outputs: docs/sdlc/evals/ai-native-sdlc-gates.md and the replacement repository lifecycle contract
scope: AGENTS.md, README.md, docs/sdlc, script/verify/sdlc.ts, script/verify/checks.test.ts, .github
next_trigger: the authorized direct push lands on origin/main
verification_mode: owner
verified_by: repository maintainers
verified_at: 2026-08-30
---

# Replace the repository lifecycle with the AI-native SDLC contract

## Intent

The user explicitly requested applying the current `ai-native-sdlc` rules to CodeTwo and removing
the existing lifecycle implementation. The repository already has useful CI, release, and
historical change evidence, but its checker mainly validates document shape. It can accept a
material build accompanied by an unaccepted Artifact and does not deterministically close
verification, release, Incident, or Eval gates.

The outcome is one project-specific lifecycle that preserves real historical evidence, removes the
superseded bootstrap implementation, and makes advancement depend on observable evidence and human
authorization rather than prose alone. Product behavior and external production state are out of
scope.

## Spec

- `docs/sdlc/workflow.md` remains the only repository lifecycle authority; issues, ADRs, designs,
  PRs, CI, releases, and monitoring remain authoritative for their own facts and are linked.
- Low-risk work uses one compact change Artifact. Higher-risk work links supporting ADR, design,
  migration, test, and release evidence from their existing authoritative locations without
  creating global parallel spec or plan registries.
- Material branch changes cannot pass with a draft, in-review, blocked, or superseded change.
- Verified or later changes require all acceptance criteria checked, an explicit verification
  verdict, actual evidence, and a residual-risk statement.
- Release readiness requires named approval, a target, and rollback evidence; a released state also
  requires immutable release identity and smoke evidence.
- Resolved Incidents link a follow-up change and regression Eval, or record a concrete blocker.
- Active Evals come from a real task or Incident and record a repeatable result.
- The previous bootstrap Artifact and its legacy-workflow Eval are removed after their durable
  repository facts are incorporated into the replacement workflow and regression case.

### Acceptance criteria

- [x] AC-1: Root instructions, README, PR handoff, CI, and release automation point to one workflow.
- [x] AC-2: The superseded bootstrap Artifact and legacy Eval no longer exist; product change history is
  retained.
- [x] AC-3: A project-native Bun/TypeScript checker enforces lifecycle shape, readiness, verification,
  release, Incident, Eval, single-source, and branch-diff gates.
- [x] AC-4: An isolated dry-run proves both the accepted path and representative failure paths.
- [x] AC-5: The live repository passes the replacement checker and focused tests.
- [x] AC-6: External branch protection and production monitoring are reported accurately rather than
  claimed as repository-controlled capabilities.

## Decision and gates

The current user request accepts the migration Intent and the stated removal constraint. It does
not authorize creating or merging a pull request, changing GitHub branch protection, dispatching a
release, deploying documentation, or mutating production. Those remain human or external Gates.

## Plan

1. Inventory the existing Artifact, CI, review, release, Incident, and Eval mechanisms.
2. Replace the workflow and templates while preserving authoritative historical evidence.
3. Strengthen the Bun/TypeScript checker and its isolated failure-path tests.
4. Remove the superseded bootstrap/Eval pair and add a real regression Eval for the new contract.
5. Run focused tests, live validation, workflow parsing, and diff checks; record actual results.

## Build

The migration replaces [`workflow.md`](../../workflow.md), all three templates, the Bun/TypeScript
checker and tests, the PR handoff, the `SDLC contract` workflow, and the versioned macOS release
Gate. Root instructions and README point to the same authority. Existing product change Artifacts
were migrated to the common metadata and explicit verification verdict without rewriting their
historical evidence.

The superseded `2026-08-29-sdlc-bootstrap.md` and `legacy-workflow-single-source.md` were removed.
Their durable single-source and failure-path intent is replaced by the current workflow and
[`ai-native-sdlc-gates.md`](../../evals/ai-native-sdlc-gates.md). No product code or UI changed.

## Verification

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
