---
id: "2026-09-03-ultracite-init"
stage: plan
schema: 3
status: accepted
owner: auto
created: "2026-09-03"
based_on: spec.md
risk: medium
scope: apps/desktop, docs/sdlc/changes/2026-09-03-ultracite-init
approved_by: "chenli"
approved_at: "2026-09-04"
---

# Plan: Install and initialize Ultracite for desktop

## Files and ownership

- `apps/desktop/` — Ultracite/oxlint/oxfmt configs, package scripts, product `src` type-safety and
  bun-test regression fixes (owner: auto)
- `docs/sdlc/changes/2026-09-03-ultracite-init/` — schema-3 stage bundle + evidence (owner: auto)

## Order of work

1. Backup ESLint/Prettier/Stylelint configs under change evidence; run Ultracite oxlint init.
2. Re-apply desktop house overrides and product restrictions; keep Stylelint for CSS radius.
3. Align package scripts; drive thematic ESLint then oxlint residuals; record evidence.
4. Type-safety round: re-enable strict-boolean/no-unsafe; clear product residuals with helpers and
   boundary overrides.
5. Repair bun-test regressions (titlebar duck-typing, sidebar PR cursor, TurnCard/Feishu/PR panel
   effect stability, linux reveal stub); migrate this bundle from legacy `change.md` to schema-3
   stage files for repository Gates.

## Test-first proof

- Constraint probes and `ultracite doctor` / `bun run check` / `tsc --noEmit` as gate evidence.
- Focused desktop suite: titlebar, plugin policy contract, SessionRail, canvas history/block,
  Feishu workspace, builtin links.

## Visual or integration proof

Not required for tooling migration; rendered-DOM tests cover the regression repairs.

## Risks and mitigations

- Autofix damage — avoid blanket `--fix-suggestions`; revert corrupted patterns.
- Effect loops under `bun test` — restore `useCallback`/`useMemo` for effect deps outside Vite
  React Compiler.
- SDLC Gate drift — replace legacy `change.md` with accepted schema-3 stages and explicit scope.

## Rollback

Restore `evidence/oxlint-migration/` configs and reinstall the prior ESLint-provider toolchain;
revert the desktop type-safety/regression commits.

## Deviations

- Legacy schema-2 `change.md` was migrated verbatim into schema-3 `intent.md` / `spec.md` /
  `plan.md` / `verification.md` after main adopted four-stage SDLC, to unblock
  `bun script/verify/sdlc.ts` on PR merge.
- Plan scope uses `apps/desktop` because the oxlint/type-safety pass touched the desktop tree
  broadly (configs, scripts, product `src`, and tests).

## Decision

The user's direct Ultracite/oxlint/type-safety requests accept this Plan, with user `chenli` as
named approver.
