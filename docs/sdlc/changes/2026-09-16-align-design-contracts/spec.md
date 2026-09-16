---
id: 2026-09-16-align-design-contracts
schema: 5
stage: spec
status: accepted
owner: chenli
created: 2026-09-16
based_on: intent.md
---

# Spec: Align the design contracts with the code

## Design

1. **One vertical-rhythm truth.** `layout-spec.json` takes the token values: `shell.titlebarHeight`
   and `verticalRhythm.titlebarHeight` become 46 (`--ds-titlebar-height` /
   `--ds-titlebar-height: var(--ds-layout-titlebar-height)` = 46px), `normalControlHeight` becomes 32
   (`--ds-control-normal`) and `fieldControlHeight` becomes 36 (`--ds-control-field`). The rest of the
   file was audited and already matches the code: rail default 288 with 220/420 clamps, dock default
   440, spacing 2–32, `primaryColumn`/`settings` 768, and the 800/1000/1400 breakpoints.
2. **A drift check.** A new `tests/designContract.test.ts` parses `layout-spec.json`, `tokens.css`,
   `App.tsx` and the composer's measure so a future edit to either side fails the suite: token
   declarations (`--ds-control-mini/normal/field`, titlebar, spacing scale), the rail's persisted
   default and clamps, the dock's persisted default, and the page/settings measure against
   `max-w-3xl`.
3. **Registration, not relocation.** `docs/design/system.md` names
   `src/settings/SettingsPrimitives.tsx` as the settings-scoped composition of the shared primitives
   (`Page` → `SettingsPanel`/`PageHeader`, `Row`/`ProjectRow` → `SettingRow`, `GroupHeading`), lists
   its real callers, and adds the settings pages to the `PageHeader` caller list. The module keeps its
   path: it is a cohort-local composition, not a business primitive, and it is already covered by the
   same lint restrictions as every other product file.
4. **A live loading contract.** `github/PullRequestsPage.tsx` renders the shared `LoadFeedback` for
   the list and the detail pane, in both their loading and failure states, replacing four hand-rolled
   `role="status"`/`role="alert"` blocks. The shared component keeps its current treatment
   (`ActivityOrb` + message for loading, `CircleAlert` + message + retry for failure), and the page
   keeps its own messages and retry handlers.

## Acceptance criteria

- [x] AC-1: `layout-spec.json` reports titlebar 46, normal control 32 and field control 36 in both
  places, and no other value in the file contradicts the token sheet or the shell code.
- [x] AC-2: `tests/designContract.test.ts` fails if `layout-spec.json` drifts from the token values,
  the rail or dock defaults and clamps, the spacing scale, or the content measure.
- [x] AC-3: `docs/design/system.md` registers the settings-scoped shared module with its callers and
  lists the settings pages under `PageHeader`; `bun script/verify/docs.ts` passes.
- [x] AC-4: `PullRequestsPage` renders `LoadFeedback` for list loading, list failure, detail loading
  and detail failure, with no hand-rolled duplicate of those states left, and the rendered lab
  scenario still renders the workspace.
- [x] AC-5: Desktop lint, type, tests and the renderer build pass.
