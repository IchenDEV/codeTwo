---
id: "2026-09-03-migrate-cn-engine"
stage: spec
schema: 3
status: accepted
owner: composer
created: "2026-09-03"
based_on: intent.md
risk: low
approved_by: "user via the current 2026-09-03 install request"
approved_at: "2026-09-03"
---

# Spec: Migrate desktop class merging to `cn`

## Requirements

- `import { cn } from "@/lib/utils"` continues to accept the same inputs and resolve Tailwind
  conflicts with later utilities winning.
- Semantic size/spacing/radius/shadow/duration/ease extensions currently registered via
  `extendTailwindMerge` remain registered through `createCn` from `cn/config`.
- Direct first-party imports of `clsx` and `tailwind-merge` are removed; transitive deps may remain.
- Existing design-system merge tests continue to pass without expectation changes.

## User experience

Not applicable — internal dependency swap with no user-visible change.

## Technical design

Replace the `clsx` + `extendTailwindMerge` wrapper in `apps/desktop/src/lib/utils.ts` with
`createCn({ extend: ... })` from `cn/config`, preserving the extend tables.

## Security and privacy

No new network, storage, or permission surface; a build-time class-merge utility only.

## Alternatives and non-goals

Keeping `clsx` + `tailwind-merge` was rejected by the user's install request. Redesigning tokens
or changing call sites are non-goals.

## Areas of concern

Merge semantics rely on `cn`'s claimed parity with `tailwind-merge` for the registered semantic
tokens.

## Acceptance criteria

- [x] AC-1: `cn` is a direct dependency of `apps/desktop` and resolves from node_modules.
- [x] AC-2: `apps/desktop/src/lib/utils.ts` exports `cn` built with `createCn` and the prior extend config.
- [x] AC-3: `bun test apps/desktop/tests/designSystem.test.ts` passes with the same merge expectations.

## Decision

The user's direct install request accepts this Intent and Spec, with the user as named approver.
It authorizes repository implementation and local verification only.

Migrated from legacy schema-2 `change.md` on 2026-09-04; content preserved.
