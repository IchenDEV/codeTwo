---
id: 2026-09-16-align-design-contracts
schema: 5
stage: plan
status: accepted
owner: chenli
created: 2026-09-16
based_on: spec.md
scope: apps/desktop/layout-spec.json, apps/desktop/tests/designContract.test.ts, apps/desktop/src/github/PullRequestsPage.tsx, docs/design/system.md, docs/sdlc/changes/2026-09-16-align-design-contracts
---

# Plan: Align the design contracts with the code

## Plan

1. `apps/desktop/layout-spec.json` — `shell.titlebarHeight` and `verticalRhythm.titlebarHeight`
   48 → 46, `verticalRhythm.normalControlHeight` 28 → 32, `fieldControlHeight` 32 → 36. (AC-1)
2. `apps/desktop/tests/designContract.test.ts` — new source contract that parses the spec, the token
   sheet and the shell code and asserts agreement: titlebar/control heights, the rail's persisted
   default and 220/420 clamps, the dock's 440 default, the spacing scale, and the 768 content
   measure. (AC-2)
3. `docs/design/system.md` — register `src/settings/SettingsPrimitives.tsx` as the settings-scoped
   composition with its six callers, and add the settings pages to the `PageHeader` caller row.
   (AC-3)
4. `apps/desktop/src/github/PullRequestsPage.tsx` — route the list and detail loading/failure states
   through `LoadFeedback` and delete the four hand-rolled blocks, keeping the page's messages and
   retry handlers. (AC-4)
5. Correct the false `ControlChip` claim in this session's audit inside the Intent record; no code
   change, because the composer and `SceneChip` already have nine call sites. (record)

Checks by risk and affected behavior:

- Desktop: `bun run lint`, `bunx tsc --noEmit`, `bun test`, `bun run build:renderer` from
  `apps/desktop`.
- Rendered (AC-4): the UI Lab pull-request scenario renders the real workspace with fixtures from
  this worktree's renderer (`bun run dev:renderer`, port 1420); the loading and failure states are
  transient or Core-dependent, so they are covered by the source contract and recorded as residual
  risk instead of a claimed capture.
- Repository: `bun script/verify/sdlc.ts --worktree` and `bun script/verify/docs.ts` before handoff.

Temporary resources: the task-owned renderer log at
`/var/folders/nl/47s4vtc92m74_j8pmm7d0chh0000gn/T/opencode/renderer-1420.log`, the Vite server on
port 1420, and the ignored `apps/desktop/dist/` build output. All are stopped or removed before
handoff; screenshots are retained as Verification evidence.

Rollback: `git revert` of the single commit; the spec and doc edits are inert, and the page change
restores four local blocks.
