---
id: "2026-09-01-empty-heading-project-typography"
stage: verification
schema: 3
status: passed
owner: codex
created: 2026-09-01
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "codex"
verified_at: "2026-09-01"
release_target: none
release_identity: "not applicable until released."
---

# Verification: Match the empty-heading project typography

## Automated checks

Verdict: verified

### Acceptance evidence

- AC-1: PASS — the `Browser computed-style probe` initially measured the heading at
  `26px / 39px / 600` and the trigger at `14px / 20px / 500`; after the correction both measured
  `26px / 39px / 600`, with identical letter spacing and top/bottom bounds.
- AC-2: PASS — `bun test tests/composerGeometryContract.test.ts` passed 6 tests and 37 assertions,
  including the explicit whitespace after the dropdown. The rebuilt Chinese native window rendered
  `在 codeTwo 里做点什么？` with balanced separation. The added source-normalization regression
  passes for LF, CRLF, and CR input.
- AC-3: PASS — `Browser click QA` clicked the heading trigger and observed the Project dropdown menu open.
  The page remained nonblank, no framework overlay appeared, and console warnings/errors were empty.
- AC-4: PASS — `bun test` passed 844 tests and 5,032 assertions; the Electrobun watcher completed
  ESLint, Stylelint, TypeScript, Vite, native packaging, and relaunch. `bun script/verify/docs.ts`,
  both SDLC checks, and `bun test script/verify/checks.test.ts` passed. The rebuilt native window
  showed the corrected Chinese heading with one Core listening on port 50000. After the Windows CI
  portability fix, the current full desktop suite passed 861 tests and 5,114 assertions.

Residual risk: very long Project names may still force the full heading to wrap; this change preserves
the existing wrapping behavior and only makes the interactive text typographically continuous.

## Behavioral evidence

Verdict: verified

### Acceptance evidence

- AC-1: PASS — the `Browser computed-style probe` initially measured the heading at
  `26px / 39px / 600` and the trigger at `14px / 20px / 500`; after the correction both measured
  `26px / 39px / 600`, with identical letter spacing and top/bottom bounds.
- AC-2: PASS — `bun test tests/composerGeometryContract.test.ts` passed 6 tests and 37 assertions,
  including the explicit whitespace after the dropdown. The rebuilt Chinese native window rendered
  `在 codeTwo 里做点什么？` with balanced separation. The added source-normalization regression
  passes for LF, CRLF, and CR input.
- AC-3: PASS — `Browser click QA` clicked the heading trigger and observed the Project dropdown menu open.
  The page remained nonblank, no framework overlay appeared, and console warnings/errors were empty.
- AC-4: PASS — `bun test` passed 844 tests and 5,032 assertions; the Electrobun watcher completed
  ESLint, Stylelint, TypeScript, Vite, native packaging, and relaunch. `bun script/verify/docs.ts`,
  both SDLC checks, and `bun test script/verify/checks.test.ts` passed. The rebuilt native window
  showed the corrected Chinese heading with one Core listening on port 50000. After the Windows CI
  portability fix, the current full desktop suite passed 861 tests and 5,114 assertions.

Residual risk: very long Project names may still force the full heading to wrap; this change preserves
the existing wrapping behavior and only makes the interactive text typographically continuous.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: very long Project names may still force the full heading to wrap; this change preserves

## Verdict

Verdict: verified.

## Review and release

Draft PR: [#218](https://github.com/IchenDEV/codeTwo/pull/218).
Approval: the user approved implementation on 2026-09-01.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: remove the scoped presentation change.
No release: no merge, release, or deployment was requested.

## Feedback

The user supplied a native-window crop showing that `codeTwo` rendered substantially smaller than
the surrounding Chinese heading and touched the following phrase. PR #218 later exposed a Windows
failure because this contract compared an LF-only multiline literal with CRLF source text; the
test read boundary now makes the contract platform-neutral.
