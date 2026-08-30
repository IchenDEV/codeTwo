---
id: change-2026-08-31-replace-design-checker-with-lint
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: [user]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: direct user request to delete the custom design checker and use lint wherever possible
inputs: current desktop design checker, baseline and allowlist, desktop package scripts, CI workflow, design documentation
outputs: standard lint configuration, deleted custom checker artifacts, updated desktop build and CI gates, focused verification
scope: apps/desktop, .github/workflows/desktop-design-system.yml, docs/design/system.md
next_trigger: authorized pull request checks and repository merge; no product release is authorized
verification_mode: owner
verified_by: codex
verified_at: 2026-08-31
---

# Replace the custom design checker with standard lint tooling

## Intent

The desktop currently carries a bespoke TypeScript source scanner, a generated occurrence baseline,
and a file-scoped allowlist. The user explicitly requested that this checker be removed and that
maintained lint tooling perform the checks wherever practical. The desired result is a smaller,
ordinary toolchain with errors reported by lint rules instead of a repository-specific policy
engine.

This change covers the desktop checker, its tests and data files, package commands, the desktop
design workflow, and documentation that instructs contributors to use it. Product behavior,
design-token values, unrelated worktree changes, native Core ownership, and release packaging are
out of scope. The initial request authorized local implementation. The user subsequently authorized
PR creation and merge on 2026-08-31; release, deployment, and production mutation remain out of
scope.

## Spec

Use mature lint packages rather than recreating the deleted scanner in configuration code. ESLint
owns TypeScript, React Hooks, and Tailwind class restrictions; Stylelint owns maintained CSS and the
semantic radius declaration contract. The renderer build runs lint before TypeScript and Vite.
CI exposes lint as the named policy Gate and does not run the removed checker separately.

Rules that require a custom parser, occurrence baseline, contrast math, or compiled-CSS inspection
are deleted rather than reimplemented as another bespoke checker. TypeScript and Vite remain the
authority for compilation and Tailwind generation. Existing rendered tests remain the behavioral
authority. Historical change records keep their original command evidence unchanged.

### Acceptance criteria

- [x] AC-1: The custom design checker, allowlist, and occurrence baseline are deleted with no active
      package, test, workflow, README, or current design-document reference remaining.
- [x] AC-2: `bun run lint` uses installed ESLint and Stylelint packages and rejects legacy radius classes,
      arbitrary radius utilities, direct inline `borderRadius`, raw product `<textarea>`, and
      non-semantic CSS radius declarations where standard lint rules can express them.
- [x] AC-3: The current desktop source passes lint without introducing a replacement custom scanner,
      generated suppression baseline, or broad new ignore list.
- [x] AC-4: Migration-focused desktop tests, renderer build, diff hygiene, and lifecycle validation pass;
      the full desktop suite is run and any unrelated failure is recorded explicitly.

## Decision and gates

The user's direct implementation request accepts Intent and the deletion-first direction. Mature
lint dependencies are permitted because no suitable linter is currently installed. The user
accepted the human review Gate and authorized PR creation and merge on 2026-08-31. Publication and
release remain unapproved.

## Plan

1. Add the minimum ESLint, TypeScript/React, Tailwind, and Stylelint dependencies and flat configs.
2. Delete the scanner, its generated data, and scanner-specific tests; keep only behavioral design
   tests that still protect runtime or composition behavior.
3. Replace package and CI commands with `lint`, update contributor documentation, and remove every
   active reference to the checker.
4. Run lint, focused/full tests, renderer build, SDLC validation, and diff checks; record actual
   evidence and any enforcement intentionally retired.

Rollback restores the deleted checker files and prior package/workflow/documentation references,
then removes the lint dependencies and configs. No stored user data or external state changes.

## Build

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

## Verification

Verdict: verified.

- `bun run lint` — passed ESLint and Stylelint with zero warnings or errors.
- ESLint stdin probe — correctly rejected `rounded-lg`, inline `borderRadius`, and raw product
  `<textarea>` with three lint errors.
- Stylelint stdin probe — correctly rejected `border-radius: 7px`.
- `bun test tests/designSystem.test.ts tests/designSystemBusinessComponents.test.tsx
  tests/templateDialog.test.tsx tests/dockArchitecture.test.ts
  tests/dockPluginGateRendered.test.tsx` — 25 passed, 0 failed, 149 expectations.
- Post-rebase `bun run build:renderer` — lint, TypeScript, and Vite passed; 6,405 modules
  transformed. Vite kept its existing advisory about chunks larger than 500 kB.
- Active-reference search for the deleted checker command, script, baseline, allowlist, and
  compiled-CSS flag — no active references; historical change records were intentionally excluded.
- `git diff --check` — passed.
- Post-rebase `bun test` — 743 passed, 0 failed, and 3,482 expectations across 124 files. The
  component-policy contract now covers the main Composer, Quick Chat, and Side Chat voice gates.

### Acceptance evidence

- AC-1: PASS — `Verification record above` preserves the original passing evidence.
- AC-2: PASS — `Verification record above` preserves the original passing evidence.
- AC-3: PASS — `Verification record above` preserves the original passing evidence.
- AC-4: PASS — `Verification record above` preserves the original passing evidence.

Residual risk: ordinary lint cannot prove that every `50%` radius is applied to square geometry,
evaluate color contrast, or inspect arbitrary CSS embedded inside JavaScript strings without
reintroducing custom parsing. Those checks move to rendered accessibility review and focused tests.
Existing React `act(...)` warnings remain non-failing. No user data, native Core ownership, or
runtime persistence changed.

## Review and release

Approval: the user approved PR creation and merge on 2026-08-31 after local verification.
Review surface: [PR #188](https://github.com/IchenDEV/codeTwo/pull/188).
Release target: none requested.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: restore the previous checker/toolchain diff; no data migration is involved.
No release: PR creation and merge are authorized; no publication, tag, deployment, or product
release was requested.

## Feedback

No post-change feedback exists yet.
