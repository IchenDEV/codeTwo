---
id: 2026-09-16-lint-ignore-build-output
schema: 5
stage: verification
status: passed
owner: chenli
created: 2026-09-16
based_on: plan.md
revision: "833ecb8b (main) with the lint-ignore-build-output change applied"
verification_mode: owner
verified_by: chenli
verified_at: 2026-09-16
release_target: none
cleanup_status: complete
---

# Verification: Keep the lint run away from build output

## Verification

- AC-1: PASS — With `apps/desktop/dist/` present (48 MB, including the 5 MB vendor bundle), `bun run lint` finished in 8.8 s and reported `All matched files use the correct format.` on 515 files. Before the change the same command with that directory present never returned: three attempts hit the agent's tool timeouts (300 s, 420 s, 600 s) while `oxlint`/`oxfmt` burned a core.
- AC-2: PASS — `bun run build:renderer` (lint, then `tsc --noEmit`, then the Vite build) completed with a previous `dist/` present: `All matched files use the correct format.` followed by `✓ built in 24.04s`, 39.6 s wall including the bundle.
- AC-3: PASS — The maintained verdict is unchanged from the earlier clean-tree runs in this session: `ultracite check src tests` reports `All matched files use the correct format.` on 475 files, and the full `bun run lint` reports the same on 515.

Verdict: verified.
Residual risk: the two ignored directories are the project's own gitignored outputs; a future build
directory with another name would need its own pattern. `oxfmt` still spends a few seconds walking
the ignored tree (8.8 s versus the 0.2 s clean-tree run), which is acceptable and far cheaper than
formatting the bundle.

## Cleanup

Removed: the ignored `apps/desktop/dist/` output recreated for the AC-2 check.
Retained: none.
Processes: none started or left behind; the user's dev window and the other worktrees' servers were
not touched.
Evidence: `git status --porcelain` lists only the config file plus this record bundle after cleanup.

## Review and release

Approval: the fix and its PR were requested directly by the user (pr); merge and release are not
authorized.
Rollback: See plan.md.
Release: No release requested; merge and external actions require their own authorization.
Review: [PR #240](https://github.com/IchenDEV/codeTwo/pull/240) carries this change on branch
t3code/lint-ignore-build-output, based on main 833ecb8b; the hosted CI Validate job passed (run
35086020084, job 104760912876, 2m58s).
Feedback: Link an Incident and regression Eval when a real failure occurs.
