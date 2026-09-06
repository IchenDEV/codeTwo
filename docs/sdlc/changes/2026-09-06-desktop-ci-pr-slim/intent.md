---
id: "2026-09-06-desktop-ci-pr-slim"
stage: intent
schema: 3
status: accepted
owner: auto
created: "2026-09-06"
source: "user request to slim over-tested desktop PR CI (drop multi-OS matrix)"
risk: low
approved_by: "chenli"
approved_at: "2026-09-06"
---

# Intent: Slim desktop PR CI to Ubuntu only

## Problem

After the hang fix, Desktop design-system still fans out macOS and Windows smoke jobs on every
`apps/desktop` PR. Authors see many check lines (including a second `validate` name colliding with
SDLC), pay for duplicate `bun install`, and get little signal because smoke unit tests are mostly
platform-agnostic JS. Cross-platform packaging already lives in Nightly / Windows package workflows.

## Proposed outcome

PR Desktop CI is one Ubuntu Gate (`desktop` job): path filter, lint/typecheck, timed full suite,
path-gated TaskBoard mutation, and Vite build. No macOS/Windows matrix on pull_request/push for
this workflow. Local `test:smoke` remains available.

## Affected users and systems

GitHub Actions Desktop design-system checks on PRs/pushes that touch `apps/desktop`. Nightly and
package workflows unchanged.

## Constraints

- Keep Ubuntu full `test:ci` + lint/typecheck + renderer build as the PR correctness Gate.
- Keep path-gated TaskBoard mutation.
- Do not remove Nightly macOS or Windows package workflows.
- Rename the former `validate` job so it does not collide with SDLC `validate` in the PR checklist.

## Out of scope

- Fixing remaining Ubuntu assertion failures.
- Changing Bun pin or SDLC contract workflow.

## Success signals

- `desktop-design-system.yml` has no OS matrix and no `test-cross-platform` job.
- PR checks show SDLC `validate` plus Desktop `changes`/`desktop` only (when desktop paths change).
- `bun script/verify/sdlc.ts --worktree` accepts this bundle.

## Open questions

None.

## Decision

The user's 2026-09-06 "开始处理" request accepts this Intent, with user `chenli` as named approver.
