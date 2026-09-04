---
id: "2026-09-03-migrate-cn-engine"
stage: plan
schema: 3
status: accepted
owner: composer
created: "2026-09-03"
based_on: spec.md
risk: low
scope: apps/desktop/package.json, apps/desktop/bun.lock, apps/desktop/src/lib/utils.ts, docs/sdlc/changes/2026-09-03-migrate-cn-engine
approved_by: "user via the current 2026-09-03 install request"
approved_at: "2026-09-03"
---

# Plan: Migrate desktop class merging to `cn`

## Files and ownership

- `apps/desktop/package.json` + `apps/desktop/bun.lock` — dependency swap (owner: composer)
- `apps/desktop/src/lib/utils.ts` — `createCn` wrapper (owner: composer)
- `docs/sdlc/changes/2026-09-03-migrate-cn-engine/` — this change bundle

## Order of work

1. Add the `cn` package with Bun in `apps/desktop`.
2. Replace the `clsx` + `extendTailwindMerge` wrapper with `createCn` while preserving extend tables.
3. Remove direct `clsx` and `tailwind-merge` dependencies if unused by first-party code.
4. Run `designSystem.test.ts` and record evidence.

## Test-first proof

`bun test apps/desktop/tests/designSystem.test.ts` with unchanged expectations.

## Visual or integration proof

Not applicable — internal utility swap.

## Risks and mitigations

Merge semantics rely on `cn`'s claimed parity with `tailwind-merge` for the registered semantic
tokens; mitigated by the focused design-system merge tests.

## Rollback

Restore `clsx` + `tailwind-merge` in `utils.ts` and package.json, then `bun install`.

## Deviations

None.

## Decision

The user's direct install request accepts this Plan, with the user as named approver.

Migrated from legacy schema-2 `change.md` on 2026-09-04; content preserved.
