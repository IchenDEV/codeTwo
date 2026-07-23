# codeTwo

A document-first coding-agent app. Compose prompts as a **structured document** (not a chat box),
weave in reusable **skills** with a `/` picker, and run them against existing coding CLIs —
**Claude Code**, **OpenAI Codex**, and **Grok** — behind one interface.

Ships two frontends over one shared Rust core:

- **Desktop** — Tauri v2 + React + BlockNote (the document editor).
- **TUI** — ratatui.

## How it works

All three provider CLIs are driven over the **Agent Client Protocol (ACP)** — JSON-RPC over stdio.
The core spawns each provider as a child process and speaks ACP to it. See
[`docs/architecture.md`](docs/architecture.md) and the plan for the full design.

```
crates/core   the brain: ACP client, engine, provider registry, sessions, skills, worktrees, permissions, pty
crates/tui    ratatui frontend (links core)
apps/desktop  Tauri desktop app + React/BlockNote UI (links core)
```

## Status

Milestones M0–M4 implemented and tested (packaging aside). One Rust core drives both a Tauri
desktop app and a ratatui TUI over ACP. See `docs/architecture.md`.

## Develop

```sh
# Rust core + TUI: build + test (offline; tests use a mock ACP agent, real git, real pty)
cargo test -p codetwo-core -p codetwo-tui

# Run the TUI (opens against your ~/.codetwo store)
cargo run -p codetwo-tui

# Desktop app (needs a display; spawns the frontend via Bun)
cd apps/desktop && bun install && bun run tauri dev
```

To actually drive an agent, one provider must be on PATH: `grok` (native ACP), or Node for
`npx @agentclientprotocol/claude-agent-acp` (Claude Code) / `npx @zed-industries/codex-acp` (Codex).
