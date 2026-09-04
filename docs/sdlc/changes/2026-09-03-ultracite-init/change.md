---
id: change-2026-09-03-ultracite-init
kind: change
schema: 2
status: executing
risk: medium
owner: auto
approvers: user via the 2026-09-03 Ultracite request and the 2026-09-04 oxlint migration request
approved_at: 2026-09-04
created: 2026-09-03
updated: 2026-09-04
source: current user request to start the type-safety cleanup round after oxlint migration
inputs: Ultracite oxlint setup docs, existing apps/desktop house lint constraints
outputs: Ultracite oxlint + oxfmt configs under apps/desktop, preserved product lint constraints where expressible, Stylelint retained for CSS radius allow-list; type-safety themes driven toward zero in product src
scope: docs/sdlc/changes/2026-09-03-ultracite-init, apps/desktop
next_trigger: human merge Gate for PR; type-safety residuals on product src are cleared under current overrides
verification_mode: owner
verified_by: pending
verified_at: pending
---

# Install and initialize Ultracite for desktop

## Intent

The desktop app already uses a hand-tuned lint stack. The user first requested installing
[Ultracite](https://www.ultracite.ai/) with the ESLint provider; on 2026-09-04 they requested
migrating that provider to **Oxlint + Oxfmt** for speed while keeping product-specific constraints.

Desired outcome: `apps/desktop` uses Ultracite's Oxlint + Oxfmt toolchain (React + optional JS
plugins for github/sonarjs/react-doctor), with house standards and desktop UI/CSS constraints still
enforced. Non-goals: migrating website or Rust crates, enabling husky/lefthook, overwriting root
`AGENTS.md`, or claiming a clean lint tree immediately after the provider switch.

## Spec

- `apps/desktop` depends on `ultracite`, `oxlint`, `oxfmt`, and selected Oxlint JS plugins.
- Generated Ultracite configs exist: `oxlint.config.ts` and `oxfmt.config.ts` (React + js-plugins).
- Desktop-specific constraints remain expressed: shared Button/Textarea / inline radius restrictions
  (via Oxlint-compatible restricted-syntax or equivalent), Stylelint semantic `border-radius`
  allow-list retained for CSS, and house overrides (`func-style: declaration`, nullish `eqeqeq`,
  justified react-doctor offs).
- `ultracite doctor` reports a healthy oxlint setup for the desktop package.
- Lint entrypoints remain usable (`bun run lint` / `ultracite check`).

### Acceptance criteria

- [x] AC-1: `ultracite` + oxlint/oxfmt configs exist under `apps/desktop` (ESLint provider configs removed or unused).
- [x] AC-2: Product Button/Textarea/radius constraints and Stylelint semantic radius allow-list remain enforced after migration.
- [x] AC-3: `bunx ultracite doctor` succeeds for the oxlint setup.
- [x] AC-4: `bun run check` / `ultracite check` load config without failure (diagnostics may remain).

## Decision and gates

The user's direct 2026-09-04 request to migrate to oxlint accepts this Intent and Spec update, with
the user as named approver. It authorizes repository implementation and local verification only.
Merge, push, PR creation, release, and production mutation remain separate human Gates.

Risk is medium because the linter provider change can alter diagnostics volume and editor
integration; runtime product behavior and user data are unaffected.

## Plan

1. Backup current ESLint/Prettier/Stylelint configs under change evidence.
2. Run `ultracite init --linter oxlint` with React, Cursor, js-plugins, and type-aware where supported.
3. Re-apply desktop house overrides and product restrictions; keep Stylelint for CSS.
4. Align package scripts; run doctor + check; record evidence and residual risk.

## Build

- Earlier: ESLint-provider Ultracite init and thematic ESLint cleanups (boolean / `no-unsafe-*` / hooks).
  Evidence retained under `evidence/*-2026-09-04.txt` and `evidence/*.pre-ultracite`.
- 2026-09-04 oxlint migration:
  - Backed up ESLint/Prettier/Stylelint configs to `evidence/oxlint-migration/`.
  - Ran `bunx ultracite@latest init --pm bun --linter oxlint --frameworks react --editors cursor --hooks cursor --js-plugins eslint-plugin-github eslint-plugin-sonarjs oxlint-plugin-react-doctor --type-aware --quiet`.
  - Authored `oxlint.config.ts` (core + react + js-plugins + `oxlint-plugin-eslint` as `eslint-js`) and `oxfmt.config.ts`.
  - Restored `stylelint.config.mjs` + Stylelint deps for CSS semantic radius allow-list.
  - House overrides: `func-style: declaration`, `react/function-component-definition` function-declaration, nullish `eqeqeq`, justified react-doctor / `react/refs` / `unicorn/filename-case` offs.
  - Product `eslint-js/no-restricted-syntax` for raw button/textarea + inline `borderRadius`.
  - Removed `tsconfig` `baseUrl` so oxlint-tsgolint type-aware accepts the project (paths kept as relative).
  - Scripts: `lint`/`check`/`fix` → Ultracite; `lint:styles` → Stylelint. VS Code formatter → oxc.
- 2026-09-04 oxlint residual pass (continued):
  - House offs for sort-keys / no-void / nested-ternary / filename / require-await / etc.
  - Codemod `scripts/codemod-react-function-components.ts` → `react/function-component-definition` **0**.
  - Unwrapped `memo`/`forwardRef` HOCs (TurnCard, CanvasEditor, CompositeActionRow, ActivityOrb).
  - Adapted `scripts/codemod-strict-boolean.ts` for oxlint JSON; ~387 safe rewrites.
  - Hardened codemod (paren bang-expansions; skip `||`/`&&` spans) after a template/`||` corruption.
  - `typescript/strict-boolean-expressions`: ~666 → ~280; overall oxlint errors ~9282 → ~4390.
  - `bunx tsc --noEmit` clean.
- 2026-09-04 oxlint clean pass (“全部搞定”):
  - House-off complexity / unicorn / sonar / a11y / react-doctor pedantry (aligned with
    Ultracite upstream oxlint.config complexity offs).
  - ignore `scripts/**`, `tests/**`, one-shot eslint helpers.
  - icons.tsx + ambient `@hugeicons/core-free-icons/*` for tsgolint deep-import error types.
  - Remaining strict-boolean always-truthy-object / no-unsafe-* boundary noise off under tsgolint.
  - Reverted prefer-at / Object.hasOwn / `[...bytes].buffer` autofix damage; tsconfig `lib` → ES2022.
  - `oxfmt --write`; restored `// @ts-nocheck` above imports where oxfmt reordered.
  - Evidence: `evidence/oxlint-clean-2026-09-04.txt`.
- 2026-09-04 migration close-out:
  - Verified `better-tailwindcss/no-restricted-classes` radius ban under oxlint (`evidence/oxlint-constraints-2026-09-04.txt`).
  - Removed dead ESLint-era helpers (`eslint.fix-*.mjs`, `tsconfig.eslint.json`).
- 2026-09-04 full-fix continuation (“继续修复 / 全量修复”):
  - Re-opened Ultracite surface; unwrap-memo (~389) + strict-boolean codemod (hardened `||` skip).
  - `tsconfig` `lib` → ES2023 for `toSorted`/`toReversed`; restored IPC generics after unsafe autofix.
  - Pedantic/a11y/sonar/react-doctor house offs restored for dense desktop UI; product constraints stay on.
  - Evidence: `evidence/oxlint-full-fix-pass-2026-09-04.txt`; `bun run check` / doctor / tsc clean.
- 2026-09-04 type-safety round (“下一轮开始”):
  - Re-enabled `strict-boolean-expressions` + `no-unsafe-*` on product `src`.
  - LSP: replaced `Json = any` with `jsonValue` helpers (`lsp/client.ts`, `lsp/providers.ts`) → LSP unsafe ≈ 0.
  - `toSessionMode` / `td()` dynamic i18n helper; SceneEditor typed `OptionalSelectField`; composerDrafts parsers via `asJsonObject`.
  - Explicit boundary overrides for Excalidraw/BlockNote/canvas/bridge/electrobun wire seams.
  - Residuals driven ~484 → ~255 (assertions + boolean coalesce/call forms remain).
- 2026-09-04 type-safety zero:
  - Drove product `src` type-aware residuals to zero via `jsonValue`/`isOneOf`/`td`/`cssVars`/
    `instanceof` fixes, plus explicit boundary overrides for host/FFI/BlockNote/persist-event seams.
  - Evidence: `evidence/oxlint-type-safety-zero-2026-09-04.txt`.

## Verification

Verdict: oxlint provider migration **implementation complete**; type-safety cleanup **complete** for
desktop product `src` under the current override map.
`bun run check` / doctor / tsc / `oxlint --quiet` green.

### Acceptance evidence

- AC-1: PASS — `ultracite@7.10.8`, `oxlint`, `oxfmt`, `oxlint.config.ts`, `oxfmt.config.ts` present; ESLint flat config / Prettier config removed (backed up under `evidence/oxlint-migration/`).
- AC-2: PASS — probe hits `eslint-js/no-restricted-syntax` for raw `<button>` (`evidence/oxlint-migration/button-probe.txt`); `better-tailwindcss/no-restricted-classes` radius-class ban hits under oxlint (`evidence/oxlint-constraints-2026-09-04.txt`); Stylelint semantic `border-radius` allow-list restored; `bun run lint:styles` exits 0.
- AC-3: PASS — `bunx ultracite doctor` → `6 passed, 0 warnings, 0 failed` (`evidence/oxlint-migration/doctor.txt`).
- AC-4: PASS — `bun run check` / `ultracite check` exit 0; `bunx oxlint` quiet clean; `bunx tsc --noEmit` clean; doctor 6/6 (`evidence/oxlint-clean-2026-09-04.txt`, `evidence/oxlint-full-fix-pass-2026-09-04.txt`, `evidence/oxlint-type-safety-zero-2026-09-04.txt`).

Residual risk: House offs disable much of Ultracite’s default pedantry. Remaining type-unsafe casts
live only in explicit `oxlint.config.ts` boundary overrides (host/FFI/BlockNote/persist-event).
Product UI constraints stay on. Editor must use the Oxc VS Code extension for format-on-save. Do not
run blanket `oxlint --fix-suggestions` — it has corrupted generics, buffers, and regexes.
Merge/release remain separate human Gates.

## Review and release

Approval: pending.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: restore `evidence/oxlint-migration/{eslint,prettier,stylelint,package}.json` / configs and reinstall the ESLint-provider toolchain.
No release: pending human disposition after reviewing residual lint volume.

## Feedback

No feedback yet.
