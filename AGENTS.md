# CodeTwo Repository Instructions

Follow the global Codex contract and the repository's existing architecture and design laws. Keep
changes narrowly scoped, preserve unrelated worktree state, and verify claims against the live
checkout.

## Development lifecycle

- Project procedures belong to the matching Skill: [develop](.agents/skills/codetwo-develop/SKILL.md),
  [release](.agents/skills/codetwo-release/SKILL.md), or [operations](.agents/skills/codetwo-operations/SKILL.md).
  Their references and templates have one owner; `docs/` holds product contracts and records.
- [Workflow](.agents/skills/codetwo-develop/references/workflow.md) owns lifecycle, authorization, risk-based checks, and release
  boundaries. Use codetwo-develop references as needed for daily work. The external ai-native-sdlc
  Skill is for lifecycle setup, audit, or improvement, not ordinary implementation.
- New changes use `intent.md`, `spec.md`, `plan.md`, and `verification.md` under
  `docs/sdlc/changes/<date>-<slug>/`, created together with `./script/devflow new`.
  Link existing requests and design decisions; retain historical records.
- A direct implementation request authorizes bounded local work. Record its source, requester,
  constraints, and acceptance; elaborate reversible local design and plan without stepwise approval.
  High/critical design still needs an independent human decision. User instructions take precedence
  over Skills; reuse existing authorization for the same pending scope.
- Finish implementation, applicable checks, inspection, and fixes. Before repository-file handoff,
  run `bun script/verify/sdlc.ts --worktree`; run `bun script/verify/docs.ts` when documentation or
  links change. Authorization, routing, lifecycle behavior, template structure, or checker changes
  also run `bun test script/verify/checks.test.ts script/verify/four-stage.test.ts script/devflow.test.ts` (the active lifecycle Eval).
  Pure wording edits need only applicable documentation and scope checks. Reuse valid evidence.
- Apply the [cleanup and handoff contract](.agents/skills/codetwo-develop/references/workflow.md#cleanup-and-handoff)
  before every handoff, including failure, blockage or cancellation. Record disposal and accountable
  retention in Verification; preserve user data, deliverables and other workers' resources.
- UI changes need actual rendering. A passing local check does not prove remote CI, approval,
  publication, or production recovery. Record actual evidence, skipped checks, and residual risk.
- PR delivery, merge, release, destructive actions, external messages, and long-running automation
  need their corresponding authorization. Names in records do not authenticate approval.
- Every `docs/` file matches one `docs/catalog.json` rule; images must be referenced. Keep one
  lifecycle authority, no parallel specs/plans registry. Product Scenes, Pipelines, boards, and packs
  are application features, never this project's development tracker.

## Desktop development instances

One desktop data directory has exactly one live Core owner. Never stop or replace a user's
process merely to free a port or gather evidence. Before launching or restarting the desktop,
read and follow the [instance preflight](.agents/skills/codetwo-operations/references/desktop-instances.md).
Read the [profile contract](docs/design/desktop-development-profiles.md) before changing isolation;
profile-based launches are not supported until implemented and verified.
