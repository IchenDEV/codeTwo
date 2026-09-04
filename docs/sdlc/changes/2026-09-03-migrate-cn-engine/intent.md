---
id: "2026-09-03-migrate-cn-engine"
stage: intent
schema: 3
status: accepted
owner: composer
created: "2026-09-03"
source: user request to install https://t.co/G0xVuZdd6H (cn package)
risk: low
approved_by: "user via the current 2026-09-03 install request"
approved_at: "2026-09-03"
---

# Intent: Migrate desktop class merging to `cn`

## Problem

The desktop app still merges Tailwind classes with `clsx` + `tailwind-merge`. The user asked to
install `cn` (https://t.co/G0xVuZdd6H / npm `cn`), a drop-in replacement that keeps the same merge
semantics while cutting join+conflict cost.

## Proposed outcome

Install `cn`, keep the existing `@/lib/utils` `cn` API and semantic theme extensions, and drop
direct `clsx` / `tailwind-merge` dependencies when unused by first-party code.

## Affected users and systems

The desktop app's class-merge utility (`apps/desktop/src/lib/utils.ts`) and its dependencies.

## Constraints

Keep the existing `cn` call signature and the registered semantic size/spacing/radius/shadow/
duration/ease extensions; no component call-site changes.

## Out of scope

Redesigning the design-system tokens, changing component call sites, or enabling `cn build`
ahead-of-time compilation.

## Success signals

`cn` is a direct dependency, the wrapper exports the same API, and the existing design-system
merge tests pass unchanged.

## Open questions

None.

## Decision

The user's direct install request accepts this Intent and Spec, with the user as named approver.
It authorizes repository implementation and local verification only. Merge, push, PR creation,
release, and production mutation remain separate human Gates.

Risk is low: API-compatible dependency swap behind an existing wrapper, covered by an existing
focused test.

Migrated from legacy schema-2 `change.md` on 2026-09-04 (change 2026-09-04-sidebar-project-actions);
content preserved verbatim from the original sections.
