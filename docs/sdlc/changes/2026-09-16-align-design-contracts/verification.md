---
id: 2026-09-16-align-design-contracts
schema: 5
stage: verification
status: passed
owner: chenli
created: 2026-09-16
based_on: plan.md
revision: "833ecb8b (main) with the align-design-contracts change applied"
verification_mode: owner
verified_by: chenli
verified_at: 2026-09-16
release_target: none
cleanup_status: complete
---

# Verification: Align the design contracts with the code

## Verification

- AC-1: PASS — `layout-spec.json` now reports `titlebarHeight` 46 in both places, `normalControlHeight` 32 and `fieldControlHeight` 36; the rest of the file was audited against the code and already agreed (rail 288 with 220/420 clamps in `App.tsx:1518,1528`, dock 440 at `App.tsx:1514`, spacing 2–32, 768 content and settings measures, 800/1000/1400 breakpoints).
- AC-2: PASS — `bun test tests/designContract.test.ts` (6 tests) resolves the token chain `--ds-space-page → --ds-foundation-space-24` and asserts the spec against it, plus the rail/dock defaults and clamps and the 768 measure, so a future edit on either side fails the suite.
- AC-3: PASS — `docs/design/system.md` registers `src/settings/SettingsPrimitives.tsx` as the settings-scoped composition with its callers and adds the settings pages to the `PageHeader` row; `bun script/verify/docs.ts` reports catalog, links, schemas and assets valid.
- AC-4: PASS — The source contract counts four `<LoadFeedback>` call sites and no surviving hand-rolled `role="status"` block in `github/PullRequestsPage.tsx`. Rendered from the UI Lab pull-request scenario: with the lab fixture temporarily rejecting, the failure state rendered through `[data-slot="load-feedback"][data-state="error"]` with `role="alert"`, the message and the Retry button (capture `browser-artifacts/browser-screenshot-localhost-mu3vn3j9-73e9bbe1.png`); with it pending, the loading state rendered as `[data-state="loading"]`/`role="status"` with `Loading pull requests…`; after restoring the fixture byte-identically the ready state renders the rows again with no LoadFeedback node.
- AC-5: PASS — From `apps/desktop`: `bun run lint`, `bunx tsc --noEmit` (inside `build:renderer`), `bun test` (963 pass, 3 skip, 0 fail) and `bun run build:renderer`.

Verdict: verified.
Residual risk: the loading and failure captures required a temporarily patched lab fixture (restored byte-identical, `git status` clean for that file); the detail pane's own two states need a selected row and are covered structurally. The design doc's enforcement section still describes the lint scope loosely and was left as-is. The audit's false `ControlChip` claim is corrected in this record's Intent instead of the earlier report.

## Cleanup

Removed: the temporary lab-fixture patch (restored from the backup and diffed byte-identical), the
task-owned Vite dev server on port 1420 and its log at
`/var/folders/nl/47s4vtc92m74_j8pmm7d0chh0000gn/T/opencode/renderer-1420.log`, and the ignored
`apps/desktop/dist/` build output.
Retained: the failure-state screenshot in `/Users/chenli/.t3/userdata/browser-artifacts/` as AC-4
evidence.
Retention owner: chenli.
Cleanup trigger: remove the screenshot with the next browser-artifact cleanup after review.
Processes: the task-owned Vite server was stopped; `lsof -nP -iTCP:1420 -sTCP:LISTEN` and
`pgrep -fl "vite --port 1420"` match nothing. The user's dev window was left running.
Evidence: `git status --porcelain` lists only the four intended files plus this record bundle.

## Review and release

Approval: governance work was requested directly by the user (进行治理); merge and release are not
authorized.
Rollback: See plan.md.
Release: No release requested; merge and external actions require their own authorization.
Feedback: Link an Incident and regression Eval when a real failure occurs.
