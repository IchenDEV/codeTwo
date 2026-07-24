# Providers

A **provider** is a coding CLI that codeTwo drives. codeTwo doesn't reimplement any agent logic — it
launches the CLI (or its ACP adapter) as a subprocess and speaks the **Agent Client Protocol (ACP)**
over its stdin/stdout.

## The Agent Client Protocol

ACP is an open, JSON-RPC-over-stdio protocol that decouples editors/apps from coding agents (think
"LSP for agents"). codeTwo implements the client side of the standard loop:

```
initialize → session/new → session/prompt → stream session/update
           → answer session/request_permission → read StopReason
```

Because everything is ACP, adding a provider is just a launch command.

## Built-in providers

| Provider | Launch | Needs Node |
| --- | --- | --- |
| **Claude Code** | `npx -y @agentclientprotocol/claude-agent-acp` | yes |
| **Codex** | `npx -y @zed-industries/codex-acp` | yes |
| **Grok** | `grok agent stdio` | no (native ACP) |
| **Cursor** | `cursor-agent --acp` | no |
| **OpenCode** | `opencode acp` | no |

::: tip
Grok is the simplest to start with — it speaks ACP natively, so there's no adapter and no Node
dependency. Claude Code has the richest ACP surface (diffs, terminals, plans, slash commands, MCP).
:::

## Availability & health

On startup codeTwo checks whether each provider's launch command resolves on your `PATH` and shows a
health dot in the config popover and at the foot of the session rail (green = available); the
composer's provider chip carries an amber dot when the picked CLI is missing. A missing CLI is a
clear state, not a crash — install the CLI and it lights up.

## Adapter flags may vary

The exact adapter invocation for Cursor and OpenCode can change between versions of those tools. If a
provider fails to launch, check the adapter's own docs for its ACP/stdio flag — the launch spec is
just a command, so it's easy to adjust.

## MCP tools

Providers that support MCP can be given extra tools at session start. In codeTwo, MCP servers come
from **MCP skills** — see [Skills](/guide/editor#skill-kinds) and the
[market](/guide/market)'s "Browser Tool" and "Filesystem Tool" entries.
