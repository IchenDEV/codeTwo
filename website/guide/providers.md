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

## Nine built-in providers

| Provider | Connection | C2 launches | Prerequisite |
| --- | --- | --- | --- |
| **Claude Code** | ACP adapter | `npx -y @agentclientprotocol/claude-agent-acp` | Node and an authenticated Claude Code setup |
| **OpenAI Codex** | App Server ACP adapter | `npx -y @agentclientprotocol/codex-acp@1.6.2` | Node and a local Codex runtime/login |
| **Grok** | Native ACP | `grok agent stdio` | Authenticated `grok` CLI on `PATH` |
| **Cursor** | CLI ACP mode | `cursor-agent --acp` | Authenticated `cursor-agent` on `PATH` |
| **OpenCode 1** | CLI ACP mode | `opencode acp` | Authenticated `opencode` on `PATH` |
| **OpenCode 2 (Beta)** | CLI ACP mode | `opencode2 acp` | Authenticated `opencode2` beta on `PATH` |
| **Pi** | Community ACP adapter | `npx -y pi-acp` | Node; `pi` on `PATH` for its config and credentials |
| **Kimi** | Native ACP | `kimi acp` | Authenticated `kimi` CLI on `PATH` |
| **ZCode (GLM)** | GLM ACP agent | `npx -y glm-acp-agent` | Node plus `Z_AI_API_KEY`, or one-time `--setup` |

### Native ACP

**Grok** and **Kimi** expose ACP directly, so C2 can launch them without a Node adapter.

### Built-in CLI ACP modes

**Cursor** and both **OpenCode** generations expose ACP modes in their CLIs. OpenCode 2 installs as
`opencode2` beside V1 rather than replacing `opencode`, so C2 exposes them as separate providers.
See the [OpenCode 2 documentation](https://opencode.ai/v2/docs) for the beta install and migration
boundary.

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

OpenCode 2 reports its current project/account model catalogue and model-specific variants as ACP
configuration options. C2 uses those live values—including `thought_level`—instead of assuming a
fixed effort ladder.

Provider-native features still depend on the chosen provider and adapter version. C2 projects only
tools with a real portable MCP boundary across providers; private provider runtimes stay native:

- **Computer Use** can come from the verified OpenAI fallback or an explicitly configured Cua/other
  MCP backend. A configured backend can target every provider or a named subset.
- **Browser Use** keeps the installed OpenAI Browser/Chrome runtime native to Codex because
  `node_repl` requires the active Codex turn and session. Browser Use, Playwright MCP, Chrome
  DevTools MCP, and other stdio/HTTP/SSE implementations can be registered in `host-tools.json`
  for compatible non-Codex providers.
- **C2 Browser** is not currently exposed to agents by the desktop host. The embedded BrowserView
  UI is separate from an authenticated ACP/MCP automation surface and lacks the required screenshot
  and evaluation primitives, so C2 reports this capability as unavailable.
- **Image Generation** and **Sites** remain provider-native until the host exposes a real portable
  MCP adapter. C2 reports them as unavailable for other providers instead of claiming false parity.

### Configure Cua or another computer-use MCP

C2 reads `host-tools.json` from its data directory. TUI/server use
`~/.codetwo/host-tools.json`; desktop uses the Electrobun app-data directory, or the directory in
`CODETWO_DATA_DIR` when that environment variable is set. In **Settings → Computer Use**, choose
one global Automatic, disabled, or compatible backend policy. Cua Driver is shown as
a built-in catalog option and becomes selectable when `cua-driver` is on `PATH`; other brands appear
after their MCP definition is added to this file. Selecting an entry activates it for every
compatible provider even when its legacy `enabled` flag is false.

For [Cua Driver](https://cua.ai/docs/reference/cua-driver/cli-reference), whose binary exposes a
stdio MCP server with `cua-driver mcp`:

```json
{
  "schema_version": 1,
  "computer_use_selection": {
    "*": "cua"
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

`computer_use_selection` is normally written by Settings under the `"*"` key. `automatic` prefers
the provider/native OpenAI bridge and falls back to the first compatible configured backend whose
legacy `enabled` flag is true; choosing a backend by name activates that backend even when the flag
is false. `disabled` prevents C2 from attaching an external bridge. Provider-native tools can still
remain available because C2 does not control tools implemented inside the provider itself.

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

In **Settings → Browser Use**, choose one global Automatic, no external backend, or configured
browser MCP option for new sessions. **OpenAI Browser / Chrome** remains compatible only with Codex;
portable MCP backends attach to every provider allowed by their `providers` and `exclude_providers`
scopes. Other brands use the `browser_use` array in the same `host-tools.json` file:

```json
{
  "schema_version": 1,
  "browser_use_selection": {
    "*": "browser-use"
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

`browser_use_selection` uses only the global `"*"` entry, matching Computer Use. Legacy
provider-specific entries are ignored and the next Settings change replaces them with the global
entry. Configured MCP backends are portable but still honor their provider scopes; provider-native
tools remain provider-owned. Existing sessions keep their startup MCP snapshot, so start a new
session after changing a Browser Use backend.

MCP servers are fixed when an ACP session starts. Every surface resolves them through the same Bun
Tool Broker:

- packaged Electrobun desktop's Rust host invokes the compiled sibling `codetwo-tool-broker` over
  JSON-RPC; TUI and server use the same boundary;
- the Rust core injects the returned plan for both `session/new` and `session/load`;
- the broker returns only native capability ids and standard MCP specs. OpenAI's private
  `node_repl` endpoint never crosses the Codex adapter boundary;
- configured Cua, Browser Use, Playwright, Chrome DevTools, cross-OS, and remote MCP backends follow
  their own runtime requirements.

After changing the selection, open a new session. The Rust host refreshes its broker plan after the
Settings save, but an already-live ACP session cannot add or replace MCP servers in place.

## The ACP loop

All nine providers enter the same core loop:

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
