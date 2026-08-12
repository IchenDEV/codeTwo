# Code2

A document-first coding-agent app. Compose prompts as a **structured document** (not a chat box),
weave in reusable **skills** with a `/` picker, and run them against existing coding CLIs —
**Claude Code**, **OpenAI Codex**, and **Grok** — behind one interface.

Its **Plugin Hub** installs complete GitHub packages: standard Skills, Subagent definitions,
stdio/HTTP/SSE MCP servers, and conflict-safe project scaffolds.

Ships two frontends over one shared Rust core:

- **Desktop** — Tauri v2 + React + BlockNote (the document editor).
- **TUI** — ratatui.

## How it works

Every provider CLI is driven over the **Agent Client Protocol (ACP)** — JSON-RPC over stdio.
The core spawns each provider as a child process and speaks ACP to it. See
[`docs/architecture.md`](docs/architecture.md) and the plan for the full design.

```
crates/core    the brain: ACP client, engine, providers, sessions, skills + market, permissions,
               project memory, worktrees, git (status/checkpoints/diff/commit), keymap, browser, pty
crates/tui     ratatui frontend (links core)
crates/server  headless remote-control server (WebSocket + pairing token + QR; links core)
apps/desktop   Tauri desktop app + React/BlockNote UI (links core + server)
```

## Status

Milestones M0–M4 implemented and tested (packaging aside). One Rust core drives both a Tauri
desktop app and a ratatui TUI over ACP. See `docs/architecture.md`.

## Develop

**Prerequisite: Zig 0.15.2.** The core embeds Ghostty's terminal engine (`libghostty-vt`), which is
built from source with Zig — and Ghostty pins that version exactly, so a newer Zig will not do:

```sh
brew install zig@0.15 && brew link --force zig@0.15   # macOS
```

```sh
# Rust core + TUI: build + test (offline; tests use a mock ACP agent, real git, real pty)
cargo test -p codetwo-core -p codetwo-tui

# Run the TUI (opens against your ~/.codetwo store)
cargo run -p codetwo-tui

# Remote control: run the headless server, then open the printed URL/QR on another device
cargo run -p codetwo-server            # prints a one-time pairing URL + token + QR
#   env: CODETWO_HOST (0.0.0.0), CODETWO_PORT (4599), CODETWO_PAIR_TTL (900)

# Desktop app (needs a display; builds a real .app so macOS privacy prompts work)
./script/build_and_run.sh
```

## Remote control

`codetwo-server` exposes the engine over WebSocket (`Op` in / `Event` out) behind a one-time pairing
flow and serves a small mobile web client at `/`. From the desktop you can also start the listener
in-process (Command palette → "Remote control" → turn on network access), where it exposes the
native T3 Code discovery, OAuth token-exchange, ticket and Effect RPC protocols as well. Scan its
`/pair#token=…` QR in T3 Code mobile to connect to the same live sessions over a local LAN or a
Tailscale tailnet. Devices persist and can be revoked.

To actually drive an agent, one provider must be on PATH: `grok` (native ACP), or Node for
`npx @agentclientprotocol/claude-agent-acp` (Claude Code) /
`npx @agentclientprotocol/codex-acp` (Codex).
