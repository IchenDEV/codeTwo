---
id: "2026-08-31-replace-design-checker-with-lint"
stage: verification
schema: 3
status: passed
owner: codex
created: 2026-08-31
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "codex"
verified_at: "2026-08-31"
release_target: none requested
release_identity: "not applicable until released."
---

# Verification: Replace the custom design checker with standard lint tooling

## Automated checks

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

## Behavioral evidence

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

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: ordinary lint cannot prove that every `50%` radius is applied to square geometry,

## Verdict

Verdict: verified..

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
