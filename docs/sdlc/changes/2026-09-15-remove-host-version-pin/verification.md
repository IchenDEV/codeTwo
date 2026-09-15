---
id: 2026-09-15-remove-host-version-pin
schema: 5
stage: verification
status: passed
owner: idevlab
created: 2026-09-15
based_on: plan.md
revision: 1beadbe394ceac0fa5b17686592f789cffe075ae
verification_mode: owner
verified_by: idevlab
verified_at: 2026-09-15
release_target: none
cleanup_status: complete
next_trigger: idevlab reviews verified work.
---

# Verification: Remove Host Version Pin

## Verification

- AC-1: PASS — `bun test tests/providerCapabilities.test.ts tests/toolBroker.test.ts` from
  `apps/desktop` reports `17 pass / 0 fail`. The new case
  `gates Computer Use on the OpenAI signature instead of a pinned host version` resolves
  `hostVersion` values `"99.0.0"`, `"1.2.3"`, and `null` on a signed host (`hostVerified: true`) and
  asserts `computer_use` is `ready` for both `codex` (native) and `claude_code` (portable adapter),
  and that no capability reason/fix contains `verified range`. Runtime confirmation:
  `bun toolBrokerRpc.ts` with a `tool.catalog` request against the real ChatGPT 26.908.70816 host
  now reports `computer_use` `ready` (previously `unverified`, fix "outside C2's verified range").
- AC-2: PASS — the new case `keeps Computer Use unavailable for an unsigned host with no version`
  sets `hostVerified: false` with `hostVersion: null` and asserts `computer_use` is `unavailable`
  with reason `A verified ChatGPT host and Computer Use service were not found.` and no MCP servers.
- AC-3: PASS — from `apps/desktop`: `bun run lint` reports `All matched files use the correct
  format` (504 files), `bun test` reports `916 pass / 3 skip / 0 fail` (919 tests across 164 files),
  and `bun run build` (Electrobun dev build) completes. At the repository root
  `bun script/verify/docs.ts` reports `catalog, links, schemas, and assets valid` and
  `bun script/verify/sdlc.ts --worktree` passes.

Verdict: verified.
Residual risk: this only removes a version allowlist; the real trust gate remains the OpenAI code
signature (`hostVerified`). Cross-provider Computer Use authorization is unchanged and still
blocked by the CUA parent code requirement (Team ID `2DC432GLL2`), which is out of scope here.

## Cleanup

Removed: all task-owned scratch under `/var/folders/nl/47s4vtc92m74_j8pmm7d0chh0000gn/T/opencode`
(the MCP probe scripts, the `codexprobe` scratch `CODEX_HOME`, the `cu-test` data dir, and
`screen.png`) were deleted; nothing remains from this task there. No test process was left running;
the four pre-existing `SkyComputerUseClient` processes belong to ChatGPT and C2 and were not touched.
Retained: `apps/desktop/node_modules` (installed to run the desktop checks) and the git-ignored
`apps/desktop/dist` and `apps/desktop/build` build outputs from `bun run build`. These are standard,
ignored toolchain/build trees, not task-owned scratch.
Retention owner: repository toolchain; next cleanup is the ordinary build-cache cleanup.
Cleanup trigger: not scheduled — ignored build caches only.
Processes: none owned by this task. `bun run build` spawned and exited its own helpers; no desktop
instance, daemon, or port was left running.
Evidence: `git status --porcelain` lists only the intended policy edit, the affected test edit, and
this record; `git check-ignore apps/desktop/dist apps/desktop/build apps/desktop/node_modules`
confirms the retained build trees are ignored.

## Review and release

Approval: pending — merge and external actions require their own authorization.
Rollback: See plan.md.
Release: No release requested; merge and external actions require their own authorization.
Feedback: Link an Incident and regression Eval when a real failure occurs.
