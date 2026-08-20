# Providers

A **provider** is a coding-agent CLI that C2 drives over the **Agent Client Protocol (ACP)**.
C2 does not reimplement the agent or proxy model access: it starts the CLI—or an ACP adapter—as
a local child process and exchanges JSON-RPC messages over stdin/stdout.

Your provider account remains the source of authentication, subscription, quota, model access, and
billing. Install and sign in to the provider before starting a real C2 session.

## What “supported” means

For each built-in provider, C2 has a registered launch specification and a stable provider ID.
When you choose that provider for a session, C2:

1. checks whether the launch command resolves on `PATH`;
2. starts the native ACP endpoint or adapter locally;
3. initializes an ACP session and sends the compiled document as the prompt; and
4. normalizes streamed text, tool calls, permissions, plans, terminal updates, and turn completion
   into the same C2 event interface when the provider exposes them.

Support does **not** mean every provider exposes identical models or ACP features. C2 displays
what the active ACP endpoint actually reports rather than inventing parity.

## Eight built-in providers

| Provider | Connection | C2 launches | Prerequisite |
| --- | --- | --- | --- |
| **Claude Code** | ACP adapter | `npx -y @agentclientprotocol/claude-agent-acp` | Node and an authenticated Claude Code setup |
| **OpenAI Codex** | App Server ACP adapter | `npx -y @agentclientprotocol/codex-acp@1.1.14` | Node and a local Codex runtime/login |
| **Grok** | Native ACP | `grok agent stdio` | Authenticated `grok` CLI on `PATH` |
| **Cursor** | CLI ACP mode | `cursor-agent --acp` | Authenticated `cursor-agent` on `PATH` |
| **OpenCode** | CLI ACP mode | `opencode acp` | Authenticated `opencode` on `PATH` |
| **Pi** | Community ACP adapter | `npx -y pi-acp` | Node; `pi` on `PATH` for its config and credentials |
| **Kimi** | Native ACP | `kimi acp` | Authenticated `kimi` CLI on `PATH` |
| **ZCode (GLM)** | GLM ACP agent | `npx -y glm-acp-agent` | Node plus `Z_AI_API_KEY`, or one-time `--setup` |

### Native ACP

**Grok** and **Kimi** expose ACP directly, so C2 can launch them without a Node adapter.

### Built-in CLI ACP modes

**Cursor** and **OpenCode** expose ACP modes in their CLIs. Their flags can change between CLI
versions, so check the installed CLI's documentation if its default launch specification stops
working.

### Adapter-backed providers

**Claude Code**, **Codex**, **Pi**, and **ZCode (GLM)** launch through `npx`. Pi uses a community
adapter because Pi itself does not currently expose an ACP mode. The GLM entry launches the GLM ACP
agent—not the ZCode desktop app, which is itself an ACP client.

For GLM, provide `Z_AI_API_KEY` in the environment or run:

```sh
npx -y glm-acp-agent --setup
```

## Availability and authentication

C2 shows a health dot for every built-in provider:

- **green** means the registered launch command resolves on `PATH`;
- **missing** means C2 cannot find that command; and
- the composer warns before a new session if the selected launch command is missing.

The health check is intentionally narrow. It does not prove that credentials are valid, a provider
account has quota, or an adapter package can finish downloading. For an adapter-backed provider, a
green dot primarily confirms that `npx` is available.

## Models and special-tool capabilities

If the ACP endpoint reports models during `session/new`, C2 shows a model control and sends
`session/set_model` when you switch. If it reports no model list, C2 leaves model selection to
the provider's own CLI configuration.

Provider-native features still depend on the chosen provider and adapter version. Host tools are
projected separately through C2's provider-neutral tool layer, so they do not become Codex-only just
because C2 discovered them from the local OpenAI runtime:

- **Computer Use** is attached to non-Codex providers through its verified standalone stdio MCP
  adapter when the signed local service is available.
- **Chrome Browser** is attached through the configured `node_repl` MCP runtime when the Browser
  and Chrome plugins are enabled. Extension connectivity is verified on the first real call.
- **C2 Browser** is not currently exposed to agents by the Pure Bun Electrobun host. The embedded
  BrowserView UI is separate from an ACP/MCP tool surface, so C2 reports this capability as
  unavailable instead of silently routing through the removed Rust sidecar.
- **Image Generation** and **Sites** remain provider-native until the host exposes a real portable
  MCP adapter. C2 reports them as unavailable for other providers instead of claiming false parity.

MCP servers are fixed when an ACP session starts. The Pure Bun desktop host and Rust CoreApp host
implement the same logical provider-toolset interface as separate adapters:

- packaged Electrobun desktop performs discovery and ACP injection in TypeScript/Bun and does not
  launch the legacy Rust desktop sidecar;
- TUI and server perform discovery and ACP injection in the Rust core for both `session/new` and
  `session/load`;
- Rust-hosted interactive tools require the process to run as the logged-in user with an active
  macOS GUI session. Linux and headless/remote-only servers report Computer Use and Chrome as
  unavailable instead of claiming a broken bridge.

After enabling or repairing a host tool, restart C2 or open a new session. A saved session receives
the bridge when C2 reattaches it with `session/load`; an already-live ACP session cannot add MCP
servers in place.

## The ACP loop

All eight providers enter the same core loop:

```text
initialize → session/new → session/prompt → stream session/update
           → answer session/request_permission → read StopReason
```

This common transport is what lets the desktop app, TUI, and remote client share one provider-neutral
session and event model.

Providers that expose MCP support can receive extra tools at session start. In C2, MCP servers can
come from the provider-neutral host-tool layer described above or from **MCP skills**—see
[Skills](/guide/editor#skill-kinds) and the [market](/guide/market)'s Browser Tool and Filesystem
Tool entries.
