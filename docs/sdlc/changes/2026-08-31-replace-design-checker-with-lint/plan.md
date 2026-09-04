---
id: "2026-08-31-replace-design-checker-with-lint"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: medium
scope: apps/desktop, .github/workflows/desktop-design-system.yml, docs/design/system.md
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Plan: Replace the custom design checker with standard lint tooling

## Files and ownership

apps/desktop, .github/workflows/desktop-design-system.yml, docs/design/system.md

## Order of work

1. Add the minimum ESLint, TypeScript/React, Tailwind, and Stylelint dependencies and flat configs.
2. Delete the scanner, its generated data, and scanner-specific tests; keep only behavioral design
   tests that still protect runtime or composition behavior.
3. Replace package and CI commands with `lint`, update contributor documentation, and remove every
   active reference to the checker.
4. Run lint, focused/full tests, renderer build, SDLC validation, and diff checks; record actual
   evidence and any enforcement intentionally retired.

Rollback restores the deleted checker files and prior package/workflow/documentation references,
then removes the lint dependencies and configs. No stored user data or external state changes.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

- Added flat ESLint configuration for JavaScript/TypeScript, React Hook ordering, Tailwind radius
  restrictions, raw product textareas, and inline radius declarations.
- Added Stylelint configuration for maintained CSS structure and semantic `border-radius` values.
- Deleted `scripts/check-design-system.ts`, `scripts/design-system-allowlist.json`, and
  `scripts/design-system-baseline.json`; removed scanner-specific fixture and baseline tests.
- Replaced `check:design` with `lint`, made the renderer build run lint before TypeScript and Vite,
  and moved the GitHub workflow to that standard Gate.
- Migrated the two raw product textareas to the shared `Textarea` primitive and moved the liquid
  tab indicator radius from an inline property to its CSS class/custom property seam.
- Updated current contributor and design documentation; historical lifecycle evidence remains
  unchanged.

## Decision

The user's direct implementation request accepts Intent and the deletion-first direction. Mature
lint dependencies are permitted because no suitable linter is currently installed. The user
accepted the human review Gate and authorized PR creation and merge on 2026-08-31. Publication and
release remain unapproved.
