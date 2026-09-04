---
id: "2026-08-31-panel-window-controls-safe-area"
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

# Verification: Keep panel headers clear of macOS window controls

## Automated checks

Verdict: verified.

- The isolated PR branch focused run passed 10 tests and 77 expectations. Existing asynchronous
  ScrollArea/bridge React `act(...)` warnings remained non-failing.
- `bun run build:renderer` passed the design-system source gate with 0 new violations and 616
  tracked legacy occurrences, TypeScript, the production Vite build with 6,396 transformed
  modules, and the generated-dist design check with 35 semantic selectors. Vite retained its
  existing large-chunk advisory.
- The first isolated build stopped because moving the Pull requests detail header invalidated a
  baseline location for its adjacent direct-token tab classes. Both affected detail tab groups now
  use the existing semantic control utilities; the complete rerun passed.
- Browser-backed inspection of the same scoped layout rules passed dark and light schemes at
  1280x720 and compact 680x720 widths with no horizontal overflow, framework overlay, or console
  errors. With the rail collapsed on macOS, both pages measured a 48px header and 96px safe inset.
- A read-only inspection of the already-running native C2 Dev window confirmed the system capture
  indicator/window-control group occupies the leading region covered by the repository's 96px
  safe-area contract. That app belongs to another worktree and is not evidence that this branch is
  running natively.

### Acceptance evidence

- AC-1: PASS — `Verification record above` preserves the original passing evidence.
- AC-2: PASS — `Verification record above` preserves the original passing evidence.
- AC-3: PASS — `Verification record above` preserves the original passing evidence.
- AC-4: PASS — `Verification record above` preserves the original passing evidence.

Residual risk: the compact detail surface cannot be populated in a renderer-only Browser because
the non-desktop bridge intentionally returns no Pull requests or Automations. The focused rendered
interaction tests therefore remain the branch-level evidence for that state. A second native Core
must not be launched while another worktree owns the default data directory.

## Behavioral evidence

Verdict: verified.

- The isolated PR branch focused run passed 10 tests and 77 expectations. Existing asynchronous
  ScrollArea/bridge React `act(...)` warnings remained non-failing.
- `bun run build:renderer` passed the design-system source gate with 0 new violations and 616
  tracked legacy occurrences, TypeScript, the production Vite build with 6,396 transformed
  modules, and the generated-dist design check with 35 semantic selectors. Vite retained its
  existing large-chunk advisory.
- The first isolated build stopped because moving the Pull requests detail header invalidated a
  baseline location for its adjacent direct-token tab classes. Both affected detail tab groups now
  use the existing semantic control utilities; the complete rerun passed.
- Browser-backed inspection of the same scoped layout rules passed dark and light schemes at
  1280x720 and compact 680x720 widths with no horizontal overflow, framework overlay, or console
  errors. With the rail collapsed on macOS, both pages measured a 48px header and 96px safe inset.
- A read-only inspection of the already-running native C2 Dev window confirmed the system capture
  indicator/window-control group occupies the leading region covered by the repository's 96px
  safe-area contract. That app belongs to another worktree and is not evidence that this branch is
  running natively.

### Acceptance evidence

- AC-1: PASS — `Verification record above` preserves the original passing evidence.
- AC-2: PASS — `Verification record above` preserves the original passing evidence.
- AC-3: PASS — `Verification record above` preserves the original passing evidence.
- AC-4: PASS — `Verification record above` preserves the original passing evidence.

Residual risk: the compact detail surface cannot be populated in a renderer-only Browser because
the non-desktop bridge intentionally returns no Pull requests or Automations. The focused rendered
interaction tests therefore remain the branch-level evidence for that state. A second native Core
must not be launched while another worktree owns the default data directory.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: the compact detail surface cannot be populated in a renderer-only Browser because

## Verdict

Verdict: verified..

## Review and release

Approval: the user authorized merging PR #186 through a direct `merge` instruction on 2026-08-31.
Review surface: [Draft PR #186](https://github.com/IchenDEV/codeTwo/pull/186).
Release target: none requested.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert the scoped PR commit.
No release: repository integration is authorized, but no package, deployment, or versioned release
was requested.

## Feedback

No post-change feedback exists yet.
