---
id: change-2026-09-03-ultracite-init
kind: change
schema: 2
status: executing
risk: medium
owner: auto
approvers: user via the current 2026-09-03 implementation request
approved_at: 2026-09-03
created: 2026-09-03
updated: 2026-09-04
source: current user request to install and initialize https://www.ultracite.ai/
inputs: Ultracite setup docs, existing apps/desktop ESLint + Stylelint toolchain
outputs: Ultracite installed under apps/desktop with ESLint provider configs, preserved project lint constraints, and autofix applied where safe
scope: docs/sdlc/changes/2026-09-03-ultracite-init, apps/desktop
next_trigger: review residual non-fixable lint volume after autofix, then decide rule relaxations before merge
verification_mode: owner
verified_by: pending
verified_at: pending
---

# Install and initialize Ultracite for desktop

## Intent

The desktop app already uses a hand-tuned ESLint and Stylelint setup, including product-specific
rules for shared controls and semantic border radius. The user requested installing and initializing
[Ultracite](https://www.ultracite.ai/) so the project gets a zero-config lint/format preset and agent
or editor integration without inventing a parallel toolchain.

Desired outcome: Ultracite is installed and initialized in `apps/desktop` with the ESLint + Prettier
+ Stylelint provider (closest to the existing stack), while project-specific lint constraints remain
enforced. Non-goals: migrating website or Rust crates, enabling husky/lefthook, overwriting root
`AGENTS.md`, creating a root workspace package solely for Ultracite, or forcing Biome/Oxlint.

## Spec

- `apps/desktop` depends on `ultracite` and the ESLint-provider toolchain Ultracite installs.
- Generated Ultracite configs exist and extend the Ultracite ESLint / Prettier / Stylelint presets
  with the React framework preset.
- Existing desktop-specific ESLint restrictions (shared Button/Textarea, inline radius, Tailwind
  radius class ban) and Stylelint semantic `border-radius` allow-list remain in force after init.
- `ultracite doctor` reports a healthy setup for the desktop package.
- Lint entrypoints remain usable from `apps/desktop` (`bun run lint` and/or `ultracite check`).

### Acceptance criteria

- [x] AC-1: `ultracite` is present in `apps/desktop` dependencies and init configs exist for the ESLint provider.
- [x] AC-2: Project-specific ESLint and Stylelint constraints from before init are still expressed in config.
- [x] AC-3: `bunx ultracite doctor` succeeds in `apps/desktop`.
- [x] AC-4: Desktop lint script still runs (`bun run lint` or the Ultracite-wired equivalent) without config-load failure.

## Decision and gates

The user's direct implementation request accepts this Intent and Spec, with the user as named
approver. It authorizes repository implementation and local verification only. Merge, push, PR
creation, release, and production mutation remain separate human Gates.

Risk is medium because lint config changes can block builds and may surface many new diagnostics;
runtime product behavior and user data are unaffected.

## Plan

1. Record this Artifact as `executing` with explicit scope.
2. Initialize Ultracite non-interactively in `apps/desktop` with `--pm bun --linter eslint --frameworks react --editors cursor --hooks cursor`.
3. Re-apply desktop-specific ESLint and Stylelint constraints if init overwrote them.
4. Align package scripts with Ultracite check/fix where appropriate without dropping stylelint coverage.
5. Run doctor and lint; record evidence and residual risk.

## Build

- Ran `bunx ultracite@latest init --pm bun --linter eslint --frameworks react --editors cursor --hooks cursor --quiet` in `apps/desktop`.
- Restored project ESLint restrictions and Stylelint semantic radius allow-list on top of Ultracite presets.
- Added a local `.tsx` TypeScript parser override because Ultracite core currently wires the parser for `**/*.ts` only.
- Wired `lint` / `check` / `fix` to Ultracite while keeping `lint:code` and `lint:styles` helpers.
- On 2026-09-04, ran `bun run fix` across `apps/desktop` and restored accidentally rewritten generated icon/schema JSON.

## Verification

Verdict: autofix applied; full-tree clean lint still not claimed.

### Acceptance evidence

- AC-1: PASS — `apps/desktop/package.json` has `ultracite@7.10.7`; `eslint.config.mjs`, `prettier.config.mjs`, and `stylelint.config.mjs` exist and import Ultracite presets.
- AC-2: PASS — `eslint.config.mjs` retains `better-tailwindcss/no-restricted-classes` and `no-restricted-syntax` Button/Textarea/radius rules; `stylelint.config.mjs` retains `declaration-property-value-allowed-list` for semantic `border-radius`. Probe file hit `no-restricted-syntax` for raw `<button>`.
- AC-3: PASS — `bunx ultracite doctor` reported `8 passed, 0 warnings, 0 failed` (see `evidence/ultracite-doctor.txt`).
- AC-4: PASS — `bun run check` / `bun run fix` load config and report real diagnostics, not config-load failure. `bun script/verify/docs.ts` and `bun script/verify/sdlc.ts --worktree` both passed.

Residual risk: After autofix, `src/` still has about 8200 ESLint issues (dominated by non-fixable `sort-keys`, `func-style`, and React Compiler / type-safety rules) plus ~50 Stylelint naming-pattern issues. Full-tree `bun run lint` / `build:renderer` remain blocked until rules are relaxed or remaining diagnostics are fixed manually. Some files hit ESLint circular-fix warnings. Scripts/tests outside `tsconfig.json` include still produce project-service parse errors.

## Review and release

Approval: pending.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert the scoped desktop Ultracite dependency, config files, and autofixed sources; restore prior ESLint/Stylelint setup from `evidence/*.pre-ultracite` for configs.
No release: pending human disposition after reviewing residual lint volume.

## Feedback

No feedback yet.
