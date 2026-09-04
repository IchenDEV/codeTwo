---
id: "2026-08-30-ai-native-sdlc-migration"
stage: spec
schema: 3
status: accepted
owner: repository maintainers
created: 2026-08-30
based_on: intent.md
risk: medium
approved_by: "userthe 2026-08-30 implementation request"
approved_at: "2026-08-30"
---

# Spec: Replace the repository lifecycle with the AI-native SDLC contract

## Requirements

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

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The current user request accepts the migration Intent and the stated removal constraint. It does
not authorize creating or merging a pull request, changing GitHub branch protection, dispatching a
release, deploying documentation, or mutating production. Those remain human or external Gates.

## Acceptance criteria

- [x] AC-1: Root instructions, README, PR handoff, CI, and release automation point to one workflow.
- [x] AC-2: The superseded bootstrap Artifact and legacy Eval no longer exist; product change history is
  retained.
- [x] AC-3: A project-native Bun/TypeScript checker enforces lifecycle shape, readiness, verification,
  release, Incident, Eval, single-source, and branch-diff gates.
- [x] AC-4: An isolated dry-run proves both the accepted path and representative failure paths.
- [x] AC-5: The live repository passes the replacement checker and focused tests.
- [x] AC-6: External branch protection and production monitoring are reported accurately rather than
  claimed as repository-controlled capabilities.

## Decision

The current user request accepts the migration Intent and the stated removal constraint. It does
not authorize creating or merging a pull request, changing GitHub branch protection, dispatching a
release, deploying documentation, or mutating production. Those remain human or external Gates.
