---
id: 2026-09-15-pi-computer-use-backend
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

# Verification: Pi Computer Use backend

## Verification

- AC-1: PASS — with the real host the broker RPC `tool.catalog` lists
  `pi-computer-use` at `available: true` with `providers: []` (Cua stays `available: false`), and
  `selection.set` for it writes `{"*": "pi-computer-use"}`. The rendered Computer Use settings page
  offers the option and saves it: `bun test tests/computerUseSettings.test.tsx` reports the new
  `offers the Pi Computer Use backend as a selectable option` case passing, alongside the new
  `registers pi-computer-use as a selectable built-in computer-use backend` case in
  `tests/providerCapabilities.test.ts`.
- AC-2: PASS — after that selection, `tool.resolve` for `claude_code` returns
  `mcp_servers: [{ name: "pi-computer-use", command: <bun>, args: [<piComputerUseMcp.ts>] }]` and
  reports `computer_use` `unverified` ("Configured computer-use MCP backend(s) attached: Pi Computer
  Use"), not `unavailable`. Codex with no selection still resolves the native plan unchanged.
- AC-3: PASS — piping `initialize` + `notifications/initialized` + `tools/list` into
  `bun apps/desktop/src/electrobun/toolBroker/piComputerUseMcp.ts` returns the eleven upstream tools
  (`find_roots`, `observe_ui`, `search_ui`, `expand_ui`, `inspect_ui`, `act_ui`, `read_text`,
  `wait_for`, `launch_browser`, `navigate_browser`, `evaluate_browser`) with JSON Schemas, and
  `tools/call` returns MCP text content; a failed call returns `isError: true`.
- AC-4: PASS — run with `HOME=/tmp/pi-cu-empty` (no helper app) the option is `available: false`
  with reason "Install @injaneity/pi-computer-use with its macOS helper app, and run C2 from Bun or
  set CODETWO_PI_COMPUTER_USE_BRIDGE.", and `selection.set` fails with that reason.
- AC-5: PASS — from `apps/desktop`: `bun run lint` reports all 505 files correctly formatted,
  `bun test` reports `918 pass / 3 skip / 0 fail` (921 tests, 164 files; the three affected files
  report `21 pass / 0 fail`), and `bun run build` (Electrobun dev build, including
  `build-tool-broker`) completes. `bun script/verify/sdlc.ts --worktree` passes at the repository
  root.
- AC-6: PASS — with both helper permissions granted, `bun apps/desktop/src/electrobun/toolBroker/piComputerUseMcp.ts` answered a sequential stdio probe (`initialize`, `tools/call find_roots` for
  Finder, `tools/call observe_ui` for `@r2`) with real UI data: three Finder windows (pid 712, e.g.
  `@r2 ec-mono`) and a 6943-character folded accessibility outline ("axsplitgroup … axtoolbar …
  axbutton").

Verdict: verified.
Residual risk: the bridge and `@injaneity/pi-computer-use` are resolved from the source tree and Bun,
so the backend is available in source/dev runs but not yet inside the packaged nightly/release app;
that packaging step (a sibling compiled entry, as `build-tool-broker` does) is the deferred
follow-up recorded in the Intent. The helper app must be present and its two TCC grants enabled
before any call works; both were granted interactively on this host.

## Cleanup

Removed: the spike project and probe scripts under
`/var/folders/nl/47s4vtc92m74_j8pmm7d0chh0000gn/T/opencode` (`pcu-spike`, `pcu`, `pi-bridge.ts`,
`seq_probe.py`, `picu-e2e`, `picu-none`), plus `/tmp/pi-cu-empty`. `apps/desktop/dist`,
`apps/desktop/build`, and the `node_modules` tree come from the checks and are standard, git-ignored
toolchain outputs.
Retained: `~/Applications/pi-computer-use.app` and its running helper daemon
(`bridge serve --socket ~/Library/Caches/pi-computer-use/bridge.sock`) — both are the feature's
runtime dependency, not scratch, and were created by this task.
Retention owner: idevlab; the helper is the pi-computer-use runtime the backend depends on.
Cleanup trigger: remove the helper app only if the backend is rolled back (see plan.md); the daemon
exits with the helper.
Processes: one retained helper daemon (above); no C2 instance, build, or test process was left
running, and the user's ChatGPT/C2 processes were never touched.
Evidence: `git status --porcelain` lists only the intended source, test, dependency, and record
edits; `pgrep -fl pi-computer-use` shows the single retained daemon.

## Review and release

Approval: pending — merge and external actions require their own authorization.
Rollback: See plan.md.
Release: No release requested; merge and external actions require their own authorization.
Feedback: Link an Incident and regression Eval when a real failure occurs.
