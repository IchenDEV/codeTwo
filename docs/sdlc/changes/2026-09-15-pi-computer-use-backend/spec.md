---
id: 2026-09-15-pi-computer-use-backend
schema: 5
stage: spec
status: accepted
owner: idevlab
created: 2026-09-15
based_on: intent.md
---

# Spec: Pi Computer Use backend

## Design

**Bridge** — `apps/desktop/src/electrobun/toolBroker/piComputerUseMcp.ts`, a stdio MCP server run by
Bun. It imports the package's own extension entry with a registration-only stub
(`registerTool`/`registerCommand`/`on`) and captures the eleven tool descriptors, so MCP
`tools/list` reuses the upstream names, descriptions, and JSON Schemas instead of a duplicated copy
that would drift. `tools/call` invokes the captured `execute` with a minimal context
(`{ cwd: process.cwd(), hasUI: false, ui: { select, notify } }`); results map to MCP text content
and thrown errors return `isError: true`. Handles `initialize`, `tools/list`, `tools/call`, `ping`.

**Backend registration** — `providerTools.ts` adds `pi-computer-use` exactly like the existing
`cua` built-in: a `ComputerUseBackendOption` with `providers: []`, `excludeProviders: []`,
`enabled: false` (explicit selection only, so `automatic` never silently attaches it), plus its
`ConfiguredComputerUseBridge`. Availability requires a resolved helper app and a runnable bridge:
an explicit `PI_COMPUTER_USE_HELPER_APP_PATH` wins, otherwise `/Applications` then
`~/Applications/pi-computer-use.app` on darwin; the command is
`CODETWO_PI_COMPUTER_USE_BRIDGE` when set, else the current Bun/Node executable with the bridge file
present on disk. Built-ins are injected into every `loadConfiguredComputerUse` return path so the
backend works without a `host-tools.json`, and a corrupt/schema-mismatched config still fails closed
(`bridges: []`).

**Boundaries** — no ToolBroker policy change; Codex CUA behavior is unchanged; the bridge is a plain
configured MCP backend, so the existing selection, scope, and fail-closed rules apply. Dependency
`@injaneity/pi-computer-use@0.5.1` (MIT) is added to `apps/desktop`; its Pi-SDK peers are installed
but used only at runtime for the bridge's config-dir lookup. Packaging is deferred.

## Acceptance criteria

- [x] AC-1: `loadConfiguredComputerUse` lists `pi-computer-use` with `providers: []`; with the
      helper and bridge present it is `available` and selecting it persists `{"*": "pi-computer-use"}`.
- [x] AC-2: Resolving a non-Codex provider after that selection attaches the bridge server and
      reports `computer_use` as not `unavailable`; an unselected Codex still resolves native.
- [x] AC-3: The bridge serves MCP over stdio: `initialize`, `tools/list` returning the eleven
      upstream tools with JSON Schemas, and `tools/call` returning content or `isError`.
- [x] AC-4: With no helper or no runnable bridge the option is `unavailable` with an actionable
      reason and no bridge is attached; a selection naming it surfaces an error.
- [x] AC-5: Affected checks pass: desktop `bun run lint`, `bun test`, `bun run build`, and
      `bun script/verify/sdlc.ts --worktree`.
- [x] AC-6: On this macOS host with both helper permissions granted, a bridge `tools/call` returns
      real UI data (roots and an accessibility outline).
