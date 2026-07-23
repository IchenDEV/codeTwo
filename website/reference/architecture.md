# Architecture

codeTwo is one Rust core with three frontends. Nothing in the core knows about a UI; frontends drive
it through a small submission/event interface.

## Layers

```
                       crates/core  (Rust library — the brain, no UI)
   ┌──────────────────────────────────────────────────────────────────────┐
   │  acp        ACP client over stdio (JSON-RPC peer + wire types)         │
   │  engine     turns Ops into Events by driving providers                 │
   │  provider   registry: launch spec + availability per backend           │
   │  session    session / message / part model                            │
   │  store      SQLite persistence (sessions + transcripts)               │
   │  skill      skill library + market + document→prompt compiler          │
   │  permission ask/allow/deny × tool+glob; modes incl. YOLO               │
   │  git        status · checkpoints · diff · commit/push                  │
   │  worktree   git worktree per session                                  │
   │  browser    annotation → prompt context                                │
   │  keymap     shared keybindings                                         │
   │  pty        embedded-terminal PTYs                                     │
   └───────────▲───────────────────────▲──────────────────────▲───────────┘
        Tauri desktop             ratatui TUI          codetwo-server (remote)
     (React + BlockNote)        (crates/tui)          (Axum WebSocket)
```

## The SQ/EQ interface

Frontends never touch ACP directly. They push **Ops** (NewSession, Prompt, Cancel, AnswerPermission,
SetPermissionMode, SetModel) and consume a stream of **Events** (AgentText, ToolCall,
PermissionRequest, TurnEnded, Error, …). See the [Op / Event protocol](/reference/protocol).

- The **desktop** bridge forwards Ops via Tauri commands and streams Events over a channel.
- The **TUI** calls the engine in-process and renders Events in its draw loop.
- The **server** forwards Ops from WebSocket clients and broadcasts Events back.

This is codex's Submission-Queue / Event-Queue pattern: one agent loop, many renderers.

## The engine

The engine owns sessions, spawns/initializes a provider per session, and implements the ACP client
callbacks. It translates `session/update` into Events, and routes `session/request_permission` either
by auto-answering from the permission policy or by **parking** the request and surfacing a
`PermissionRequest` event that the UI answers with an `AnswerPermission` op.

It also lazily creates the ACP session on the first prompt (so a document's MCP servers are attached
at `session/new`) and auto-checkpoints the workspace before each turn.

## The ACP client

A minimal, self-contained JSON-RPC 2.0 peer over async byte streams — child stdio in production, an
in-memory duplex in tests. Hand-written wire types keep codeTwo independent of any single adapter's
version churn; unknown update variants are logged and dropped rather than fatal.

## Persistence

A single SQLite database (`~/.codetwo/codetwo.db` / a platform data dir): sessions as rows, the
transcript as an ordered list of parts. The session list and history are shared across every surface
that opens the same file.

## Testing

The whole risky surface is tested offline — the ACP prompt-turn loop and permission parking run
against a mock agent over an in-memory duplex; git and PTY tests use real `git` and a real shell; the
server test does a real WebSocket handshake. No provider binary or network is required.
