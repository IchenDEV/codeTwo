---
id: "2026-09-03-ultracite-init"
stage: intent
schema: 3
status: accepted
owner: auto
created: "2026-09-03"
source: "user via the 2026-09-03 Ultracite request and the 2026-09-04 oxlint migration request"
risk: medium
approved_by: "chenli"
approved_at: "2026-09-04"
---

# Intent: Install and initialize Ultracite for desktop

## Problem

The desktop app used a hand-tuned ESLint/Prettier/Stylelint stack. The user requested adopting
[Ultracite](https://www.ultracite.ai/) first with the ESLint provider, then migrating that provider
to **Oxlint + Oxfmt** for speed while keeping product-specific lint constraints. A follow-on
type-safety cleanup then re-enabled strict boolean and no-unsafe rules on product `src`.

## Proposed outcome

`apps/desktop` uses Ultracite's Oxlint + Oxfmt toolchain (React + optional JS plugins), with house
standards and desktop UI/CSS constraints still enforced, type-aware residuals cleared on product
`src` under explicit boundary overrides, and bun-test regressions from the cleanup repaired.

## Affected users and systems

Desktop package tooling and first-party TypeScript/React sources under `apps/desktop`. No Core,
server, protocol, or user-data migration.

## Constraints

- Preserve product Button/Textarea and inline radius restrictions where Oxlint can express them.
- Keep Stylelint for the CSS semantic `border-radius` allow-list.
- House overrides remain justified (`func-style: declaration`, nullish `eqeqeq`, selected
  react-doctor offs).
- Do not migrate website or Rust crates; do not enable husky/lefthook; do not overwrite root
  `AGENTS.md`.
- Do not run blanket `oxlint --fix-suggestions` (historically corrupted generics/buffers/regexes).

## Out of scope

- Multi-instance/profile work from `AGENTS.md`.
- Claiming a clean lint tree immediately after the provider switch without follow-up cleanup.
- Production release mutation.

## Success signals

- `ultracite doctor` is healthy for the oxlint setup.
- `bun run check` / `ultracite check` and `bunx tsc --noEmit` succeed.
- Product type-aware oxlint residuals are zero under the current override map.
- Focused desktop regression tests covering titlebar, SessionRail, canvas history, Feishu,
  policy contracts, and builtin links pass.

## Open questions

None.

## Decision

The user's direct 2026-09-03 Ultracite and 2026-09-04 oxlint/type-safety requests accept this
Intent, with user `chenli` as named approver. Merge/release remain separate human Gates.
