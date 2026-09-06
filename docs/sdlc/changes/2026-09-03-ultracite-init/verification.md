---
id: "2026-09-03-ultracite-init"
stage: verification
schema: 3
status: passed
owner: auto
created: "2026-09-03"
based_on: plan.md
commit: "0c07f698"
verification_mode: owner
verified_by: "auto"
verified_at: "2026-09-06"
release_target: none
release_identity: ""
---

# Verification: Install and initialize Ultracite for desktop

## Automated checks

- AC-1: PASS — `ultracite`, `oxlint`, `oxfmt`, `oxlint.config.ts`, and `oxfmt.config.ts` are present under `apps/desktop`; ESLint flat/Prettier desktop configs were removed and backed up under `evidence/oxlint-migration/` (`evidence/oxlint-clean-2026-09-04.txt`).
- AC-2: PASS — probe hits `eslint-js/no-restricted-syntax` for raw `<button>` (`evidence/oxlint-migration/button-probe.txt`); `better-tailwindcss/no-restricted-classes` radius-class ban hits under oxlint (`evidence/oxlint-constraints-2026-09-04.txt`); Stylelint semantic `border-radius` allow-list restored; `bun run lint:styles` exits 0.
- AC-3: PASS — `bunx ultracite doctor` → `6 passed, 0 warnings, 0 failed` (`evidence/oxlint-migration/doctor.txt`).
- AC-4: PASS — `bun run check`, `bunx oxlint --quiet`, and `bunx tsc --noEmit` exit 0 with type-safety zero and focused regressions recorded in `evidence/oxlint-type-safety-zero-2026-09-04.txt` and `evidence/type-safety-test-regressions-2026-09-06.txt`.

## Behavioral evidence

- AC-4: PASS — `bun test --timeout 15000 tests/titlebarDoubleClick.test.ts tests/pluginComponentPolicyContract.test.ts tests/sessionRailRendered.test.tsx tests/canvasHistoryRendered.test.tsx tests/canvasBlockRendered.test.tsx tests/feishuWorkspaceRendered.test.tsx tests/builtinLinks.test.ts` → 52 pass / 0 fail (`evidence/type-safety-test-regressions-2026-09-06.txt`).

## Visual evidence

Not captured — tooling migration and DOM-harness regressions; no screenshot harness required.

## Security and privacy evidence

No new network, storage, or permission surface; tooling and desktop UI source only.

## Deviations and residual risk

Residual risk: House offs disable much of Ultracite’s default pedantry. Remaining type-unsafe
casts live only in explicit `oxlint.config.ts` boundary overrides (host/FFI/BlockNote/persist-event).
Product UI constraints stay on. Editor must use the Oxc VS Code extension for format-on-save.
Do not run blanket `oxlint --fix-suggestions`. Source-contract tests were realigned after oxfmt
wrapping so smoke/`test:ci` stay deterministic; focused regression coverage plus check/tsc remains
the recorded proof. Schema-2 `change.md` was replaced by these schema-3 stage files to satisfy
main’s SDLC Gate.

## Verdict

Verdict: verified.

## Review and release

Approval: pending human merge review.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: restore `evidence/oxlint-migration/` configs and revert the desktop commits; no data or
persisted-state changes are involved.
No release: desktop tooling/UI change only; no product release is required to close after merge.

## Feedback

No feedback yet.
