# Plugin compatibility matrix — 2026-08-09

This matrix is the implementation ledger for Code2's Plugin Hub. It is based on the public
[Agent Plugins 1.0.0 specification](https://agent-plugins.org/specification), the current
[Codex plugin documentation](https://developers.openai.com/plugins/build/plugins), and the current
[Claude Code plugin reference](https://code.claude.com/docs/en/plugins-reference), checked on
2026-08-09. A checked row requires both implementation and automated or runtime evidence; file
detection alone is not conformance.

| Surface | Agent Plugins | Codex | Claude Code | Code2 baseline at start | Target evidence |
| --- | --- | --- | --- | --- | --- |
| Package manifest | root `plugin.json`, required `$schema` + `name`, closed schema | `.codex-plugin/plugin.json` | optional `.claude-plugin/plugin.json` | Codex/Claude files parsed through one permissive struct | Protocol-specific adapters and fixtures |
| Version selection | canonical local 1.0.0 schema; no network load | native manifest/version precedence | native manifest/marketplace version precedence | no schema selection | deterministic local validation |
| Multi-manifest package | portable core plus client extensions | native overlay | native overlay | first Codex/Claude manifest won | explicit standards list, conflict diagnostics, path dedupe |
| Skills | immediate children of `skills/`; invalid sibling isolation | manifest paths plus default `skills/` | `skills/`, root `SKILL.md`, custom paths | recursive discovery | per-standard discovery and failure boundaries |
| Commands/workflows | outside v1 portable core | current Codex-defined components | `commands/`, `workflows/` | not represented | inventory plus native runtime adapter |
| Agents | client extension only | current Codex-defined components | `agents/` and custom paths | Markdown agents mapped to Subagents | validated native adapter and inline fallback |
| MCP config | root `mcp.json` with matching schema | `.mcp.json` or manifest config | `.mcp.json` or manifest config | merged, permissive config | separate top-level/entry validation and diagnostics |
| MCP transports | stdio, Streamable HTTP, optional SSE | host-supported transports | host-supported transports | stdio/HTTP/SSE | declared transport, no fallback, per-entry isolation |
| MCP runtime vars | `PLUGIN_ROOT`, persistent `PLUGIN_DATA` | Codex plugin variables | Claude plugin variables | root expansion in command/args only | reserved env set last; persistent data directory |
| MCP path/URL safety | resolved-root containment, strict cwd and URL/header rules | native path and trust rules | native path and trust rules | basic path and URL prefix checks | traversal, loopback HTTP, header and placeholder tests |
| Hooks | extension namespace only | manifest/default hooks plus trust | manifest/default hooks plus trust | preserved as files only | lifecycle adapter and per-definition trust |
| Apps/connectors | extension namespace only | `.app.json` and registered connections | MCP-backed integrations | not represented | explicit auth/unsupported state when host service is required |
| LSP | extension namespace only | current Codex-defined components | `.lsp.json` and custom paths | desktop has project LSP only | plugin registration, lifecycle and diagnostics |
| Monitors/channels | extension namespace only | current Codex-defined components | monitors and channels | not represented | bounded process lifecycle and visible trust state |
| Settings/bin/themes/output styles | extension namespace only | current Codex-defined components | native component directories/files | preserved as bundle data | adapters or explicit incompatibility diagnostics |
| Install source | client-owned | local/Git/npm marketplace sources | local/Git/URL/npm marketplace sources | public GitHub only | source adapters and bounded downloads |
| Marketplace | client-owned | `.agents/plugins/marketplace.json` and documented compatibility paths | `.claude-plugin/marketplace.json` | built-in offline component market only | source persistence, refresh, browse and install |
| Scope/state | client-owned | documented repo/personal policies | user/project/local/managed | one app-data install, always enabled | scope, enabled, trusted, update status |
| Transactionality | client-owned | install/update safety | install/update safety | atomic package replacement | rollback tests and persistent data preservation |
| Uninstall | client-owned | bundle removal with owned state | optional persistent-data retention | bundle directory removal | owned-root checks and keep/delete-data choice |
| UI diagnostics | client-owned | inventory, permissions, auth | inventory, errors, context/runtime status | counts and generic install error | format/version/state badges and component diagnostics |

## Completion state

`未达到全量完成`.

Implemented and covered by build or automated tests in this change:

- Agent Plugins 1.0.0 local schema selection, manifest/skill/MCP validation, per-component failure
  isolation, strict path/URL/header rules, and persistent `PLUGIN_DATA`.
- Deterministic Agent Plugins > Codex > Claude Code manifest precedence with standards badges,
  conflict diagnostics, and deduplicated component paths.
- Native skill/command/agent/MCP discovery plus trust-gated stdio LSP registration and process
  teardown on update, disable, trust revocation, and uninstall.
- Atomic package replacement, executable-bit preservation, enabled/trusted state preservation,
  persistent-data keep/delete uninstall choices, and bounded local/GitHub imports.
- Codex and Claude Code marketplace parsing with invalid-entry isolation; local and public GitHub
  source installation; catalog/source diagnostics in Plugin Hub.

Remaining target rows:

- Runtime adapters for hooks, workflows, monitors, channels, apps/connectors, settings, bin, themes,
  output styles, user configuration, dependency graphs, and socket LSP. These are inventoried and
  shown as unsupported instead of being reported as ready.
- Install adapters for npm, archive URLs, non-GitHub Git hosts, private repositories, and source
  authentication/integrity policies beyond exact Git SHA checks.
- Persistent marketplace registry operations (add/refresh/remove), remote catalog fetching, update
  availability, renames, and cross-marketplace dependency resolution.
- Project/local/managed installation stores and policy enforcement. The model exposes scope, but
  this tranche installs into the existing user store only.
