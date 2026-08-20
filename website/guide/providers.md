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

Provider-native features still depend on the chosen provider and adapter version. C2 projects only
tools with a real portable MCP boundary across providers; private provider runtimes stay native:

- **Computer Use** can come from the verified OpenAI fallback or an explicitly configured Cua/other
  MCP backend. A configured backend can target every provider or a named subset.
- **Browser Use** keeps the installed OpenAI Browser/Chrome runtime native to Codex because
  `node_repl` requires the active Codex turn and session. Browser Use, Playwright MCP, Chrome
  DevTools MCP, and other stdio/HTTP/SSE implementations can be registered in `host-tools.json`
  for compatible non-Codex providers.
- **C2 Browser** is not currently exposed to agents by the Pure Bun Electrobun host. The embedded
  BrowserView UI is separate from an ACP/MCP tool surface, so C2 reports this capability as
  unavailable instead of silently routing through the removed Rust sidecar.
- **Image Generation** and **Sites** remain provider-native until the host exposes a real portable
  MCP adapter. C2 reports them as unavailable for other providers instead of claiming false parity.

### Configure Cua or another computer-use MCP

C2 reads `host-tools.json` from its data directory. TUI/server use
`~/.codetwo/host-tools.json`; desktop uses the Electrobun app-data directory, or the directory in
`CODETWO_DATA_DIR` when that environment variable is set. In **Settings → Computer Use**, choose
Automatic, no external backend, or one compatible backend for each provider. Cua Driver is shown as
a built-in catalog option and becomes selectable when `cua-driver` is on `PATH`; other brands appear
after their MCP definition is added to this file. Selecting an entry activates it for that provider
even when its legacy `enabled` flag is false.

For [Cua Driver](https://cua.ai/docs/reference/cua-driver/cli-reference), whose binary exposes a
stdio MCP server with `cua-driver mcp`:

```json
{
  "schema_version": 1,
  "computer_use_selection": {
    "claude_code": "cua",
    "codex": "automatic"
  },
  "computer_use": [
    {
      "id": "cua",
      "enabled": true,
      "display_name": "Cua Driver",
      "server": {
        "name": "cua-driver",
        "command": "cua-driver",
        "args": ["mcp"]
      }
    }
  ]
}
```

Omitting `providers` attaches the backend to every provider. Use `providers: ["claude_code"]` to
allow only named providers, or `exclude_providers: ["codex"]` to retain Codex's native tool. Any
other stdio MCP driver uses the same shape and can supply `env` as a string map and an optional
`cwd`.

`computer_use_selection` is normally written by Settings. `automatic` prefers the provider/native
OpenAI bridge and falls back to the first compatible configured backend whose legacy `enabled` flag
is true; choosing a backend by name activates that backend even when the flag is false. `disabled`
prevents C2 from attaching an external bridge. Provider-native tools can still remain available
because C2 does not control tools implemented inside the provider itself.

A remote MCP computer server uses this `server` shape instead:

```json
{
  "name": "remote-computer",
  "type": "http",
  "url": "http://127.0.0.1:8000/mcp",
  "headers": {}
}
```

HTTP and SSE entries fail before session creation if the selected ACP provider did not advertise
that transport. A resolved stdio command or configured URL is reported as **unverified** until its
first real MCP call succeeds. Duplicate server names and invalid commands fail closed and appear in
the provider capability reason.

OpenAI Responses CUA, Anthropic's versioned `computer` tool, and Gemini Computer Use are
model-API-native action loops, not interchangeable MCP servers. Their provider adapter may expose
them natively; C2 only shares them across providers when a real MCP driver or gateway is configured.

### Configure Browser Use or another browser MCP

In **Settings → Browser Use**, each provider can choose Automatic, no external backend, or any
compatible configured browser MCP. Codex can additionally choose **OpenAI Browser / Chrome** when
C2 verifies its installed native Browser runtime. Other brands use the `browser_use` array in the
same `host-tools.json` file:

```json
{
  "schema_version": 1,
  "browser_use_selection": {
    "claude_code": "browser-use",
    "codex": "openai-browser"
  },
  "browser_use": [
    {
      "id": "browser-use",
      "enabled": false,
      "display_name": "Browser Use",
      "server": {
        "command": "uvx",
        "args": ["--from", "browser-use[cli]", "browser-use", "--mcp"]
      }
    },
    {
      "id": "playwright",
      "enabled": false,
      "display_name": "Playwright MCP",
      "server": {
        "command": "npx",
        "args": ["-y", "@playwright/mcp@latest"]
      }
    },
    {
      "id": "chrome-devtools",
      "enabled": false,
      "display_name": "Chrome DevTools MCP",
      "server": {
        "command": "npx",
        "args": ["-y", "chrome-devtools-mcp@latest"]
      }
    }
  ]
}
```

These commands follow the official [Browser Use MCP](https://docs.browser-use.com/open-source/customize/integrations/mcp-server),
[Playwright MCP](https://github.com/microsoft/playwright-mcp), and
[Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) launch forms. C2 only
resolves the configured executable while loading settings; package download, browser permissions,
and MCP connectivity are verified when a new session first calls the backend. Pin package versions
instead of `@latest` when reproducible deployments matter.

A hosted browser MCP uses the normal remote transport shape. Keep the app-data file out of version
control and materialize credentials at deploy time instead of committing them:

```json
{
  "id": "browser-use-cloud",
  "display_name": "Browser Use Cloud",
  "server": {
    "name": "browser-use-cloud",
    "type": "http",
    "url": "https://api.browser-use.com/mcp",
    "headers": { "x-browser-use-api-key": "replace-at-deploy-time" }
  }
}
```

`browser_use_selection` has the same per-provider and `"*"` fallback semantics as Computer Use.
Configured MCP backends are portable; provider-native tools remain provider-owned. Existing
sessions keep their startup MCP snapshot, so start a new session after changing a Browser Use
backend.

MCP servers are fixed when an ACP session starts. The Pure Bun desktop host and Rust CoreApp host
implement the same logical provider-toolset interface as separate adapters:

- packaged Electrobun desktop performs discovery and ACP injection in TypeScript/Bun and does not
  launch the legacy Rust desktop sidecar;
- TUI and server perform discovery and ACP injection in the Rust core for both `session/new` and
  `session/load`;
- the built-in OpenAI interactive bridge requires the process to run as the logged-in user with an
  active macOS GUI session; configured Cua/cross-OS/remote MCP backends follow their own runtime
  requirements.

After changing the selection, open a new session. The desktop and Rust hosts refresh their discovery
state after the Settings save, but an already-live ACP session cannot add or replace MCP servers in
place.

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
