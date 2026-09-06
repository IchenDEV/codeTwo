---
id: "2026-09-03-ultracite-init"
stage: spec
schema: 3
status: accepted
owner: auto
created: "2026-09-03"
based_on: intent.md
risk: medium
approved_by: "chenli"
approved_at: "2026-09-04"
---

# Spec: Install and initialize Ultracite for desktop

## Requirements

- `apps/desktop` depends on `ultracite`, `oxlint`, `oxfmt`, and selected Oxlint JS plugins
  (github, sonarjs, react-doctor, eslint-js bridge where needed).
- Generated Ultracite configs exist: `oxlint.config.ts` and `oxfmt.config.ts` (React + js-plugins).
- Desktop-specific constraints remain expressed: shared Button/Textarea / inline radius restrictions
  (via Oxlint-compatible restricted-syntax or equivalent), Stylelint semantic `border-radius`
  allow-list retained for CSS, and house overrides (`func-style: declaration`, nullish `eqeqeq`,
  justified react-doctor offs).
- Product `src` type-aware themes (`strict-boolean-expressions`, `no-unsafe-*`) are driven to zero
  under explicit boundary overrides for host/FFI/BlockNote/persist-event seams.
- Bun-test regressions introduced by unsafe `instanceof`, post-increment rewrites, and dropping
  effect-stable `useCallback`/`useMemo` (React Compiler does not run under `bun test`) are fixed.
- Lint entrypoints remain usable (`bun run lint` / `ultracite check` / `bun run check`).

## User experience

Developers and CI use Ultracite/Oxlint/Oxfmt instead of the prior ESLint/Prettier desktop stack.
Editor format-on-save uses the Oxc VS Code extension. Product UI lint constraints still fail closed
on raw buttons/textareas and disallowed radius classes.

## Technical design

- Ultracite oxlint init under `apps/desktop` with React + Cursor hooks + type-aware tsgolint.
- `oxlint.config.ts` encodes house offs, product restricted-syntax, and boundary overrides.
- Stylelint retained solely for CSS radius allow-list (`lint:styles`).
- Type-safety helpers (`jsonValue`, `isOneOf`, `td`, `cssVars`) replace unsafe casts in product code.
- Effect-dependent handlers keep `useCallback`/`useMemo` where identity matters outside the Vite
  React Compiler pipeline (notably `bun test`).

## Security and privacy

No new network, storage, or permission surface. Lint/tooling changes only; user data untouched.

## Alternatives and non-goals

- Staying on ESLint Ultracite provider was rejected after the 2026-09-04 oxlint migration request.
- Disabling type-aware rules permanently was rejected; residuals are cleared or scoped to explicit
  boundary overrides instead.
- Website/Rust lint migration is out of scope.

## Areas of concern

- House offs disable much of Ultracite’s default pedantry; product UI constraints must stay on.
- Blanket `--fix-suggestions` is unsafe and must not be used as a cleanup strategy.
- Bun tests lack React Compiler memoization, so stripping `useCallback` from effect deps can hang
  suites even when Vite builds behave.

## Acceptance criteria

- [ ] AC-1: `ultracite` + oxlint/oxfmt configs exist under `apps/desktop` (ESLint provider configs
  removed or unused).
- [ ] AC-2: Product Button/Textarea/radius constraints and Stylelint semantic radius allow-list
  remain enforced after migration.
- [ ] AC-3: `bunx ultracite doctor` succeeds for the oxlint setup.
- [ ] AC-4: `bun run check` / `ultracite check` and `bunx tsc --noEmit` succeed with product type-aware
  residuals at zero under the current override map; focused desktop regression suite passes.

## Decision

The user's direct Ultracite/oxlint/type-safety requests accept this Spec, with user `chenli` as
named approver.
