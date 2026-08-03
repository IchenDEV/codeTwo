# Architecture

codeTwo drives existing coding CLIs (Claude Code, OpenAI Codex, Grok) over the **Agent Client
Protocol (ACP)** and presents them through a **document-first** UI. One Rust core; two frontends.

## Why this shape

- **ACP is the common abstraction.** JSON-RPC over stdio, with entry points for all three
  providers (Grok natively; Claude Code & Codex via official adapters). We implement the client
  loop once and treat each backend as a launch command.
- **Codex is the template, not opencode.** opencode is now all-TypeScript + Electron. Codex is
  all-Rust with a `core` + a ratatui `tui` and an SQ/EQ event model. A Rust core lets the Tauri GUI
  and a ratatui TUI link the same code with no server/serialization boundary.

## Layers

```
                       crates/core  (Rust library — no UI)
   ┌──────────────────────────────────────────────────────────────────────┐
   │  acp        ACP client over stdio (JSON-RPC peer + wire types)         │
   │  provider   registry: launch spec + availability per backend          │
   │  session    session / message / part model                            │
   │  skill      skill library + document→prompt compiler                   │
   │  permission ask/allow/deny × tool+glob; modes incl. YOLO               │
   │  event      SQ/EQ types (Op in, Event out)                            │
   └───────────────▲───────────────────────────────────────▲──────────────┘
                   │ tauri::command + ipc::Channel          │ links directly
        apps/desktop/src-tauri (Rust bridge)          crates/tui (ratatui)  [M3]
                   │
     apps/desktop/src  (React + Vite + BlockNote)
```

## The SQ/EQ interface (`core::event`)

Frontends never touch ACP directly. They push [`Op`]s (NewSession, Prompt, Cancel,
AnswerPermission, …) and consume [`Event`]s (AgentText, ToolCall, PermissionRequest, TurnEnded, …).
- Tauri bridge: `Op` via `#[tauri::command]`, `Event` stream via `ipc::Channel`.
- TUI: calls the same core engine in-process, renders `Event`s in its draw loop.

The M1 engine is the piece that consumes `Op`s and, by driving `core::acp`, produces `Event`s. The
ACP `ClientHandler` implemented by the engine translates `session/update` → `Event`s and routes
`session/request_permission` through the permission engine (auto-answer or surface an `Ask`).

## ACP client (`core::acp`)

A minimal, self-contained JSON-RPC 2.0 peer over async byte streams (child stdio in prod; an
in-memory duplex in tests). Hand-written wire types keep us independent of any single adapter's
version churn; the official `agent-client-protocol` crate can be swapped in behind `AcpClient`.
Unknown `session/update` variants are logged and dropped rather than fatal ("code to the common
denominator, feature-detect the rest").

Prompt-turn loop: `initialize` → `session/new` → `session/prompt` → stream `session/update` →
answer `session/request_permission` → read `StopReason`. Proven end-to-end offline by
`crates/core/tests/acp_prompt_turn.rs` against a mock agent (no provider binary needed).

## Context sync: whose memory is it?

Two transcripts exist per conversation, and they are not the same thing (a distinction t3code's
server makes explicit, and we adopt):

- **The app-owned transcript** — messages/parts in SQLite. Canonical for *display*: it's what the
  rail, the transcript pane, and any future remote frontend render, and it survives anything.
- **The provider-native context** — the agent CLI's own session state (Claude Code's session
  files, Codex's rollouts, …). Canonical for *the model's memory*: we never reconstruct or replay
  it ourselves; we only hold a cursor to it — the ACP session id, persisted per session.

On revive (a session prompted after an app restart), the engine re-attaches to that cursor with
`session/load` when the agent advertised `loadSession` at `initialize` — the agent replays its
history (dropped by the handler: the store already has it) and the conversation continues with the
model's memory intact. No capability → straight to `session/new`, as before. A *failed* load falls
back to `session/new` and emits a notice: the transcript is kept, the memory is not — degrade
loudly, never silently. Model switches stay in-session (`session/set_model` /
`session/set_config_option`); an agent that refuses gets an actionable error ("start a new session
to use X") rather than a bare protocol failure. Cross-provider switches are not attempted at all:
a session is bound to its provider, because no provider can read another's native context.

## Skills (the differentiator) — `core::skill`

A skill has one of four kinds: `Fragment`, `AgentSkill`, `Mcp`, `Macro`. The document editor
serializes to neutral `DocBlock`s (text + skill blocks); `compile()` lowers them into a
`CompiledPrompt` = the markdown prompt (for `session/prompt`) plus MCP servers and agent-skills (for
`session/new`). The compiler lives in the core so the TUI reuses it verbatim.

## Terminal (`core::term`, `core::pty`)

The embedded terminal is a real emulator living in the core, not a byte pipe to xterm.js.
`core::pty` owns the child process and master fd; `core::term` pairs it with a `libghostty-vt`
`Terminal` — Ghostty's VT engine, which does escape-sequence parsing, scrollback, and reflow on
resize.

The point of putting that state in the core is that **a terminal outlives whatever is drawing it**.
Terminals are keyed by a stable id (`<session>-<slot>[-tmux]`), and attaching to one returns a VT
dump of its scrollback, screen, and cursor. A dock tab switch, a session change, or an app restart
re-attaches and replays; only closing the tab kills the child. It also means the terminal is
*readable*: `TerminalHandle::text` hands plain text to the agent, and the TUI can render the same
grid without a second emulator.

`libghostty-vt` is `!Send`, so each terminal owns a dedicated thread reached over a command
channel; the PTY reader feeds the same queue, which is why VT state is never observed mid-write.
The renderer still answers device queries (DA, DSR), so libghostty's `on_pty_write` is deliberately
left unregistered rather than replying twice.

> **Build requirement:** `libghostty-vt` compiles Ghostty from source with **Zig 0.15.2 exactly**
> (`brew install zig@0.15 && brew link --force zig@0.15`). This is the only non-Rust toolchain the
> workspace needs.

## Providers (`core::provider`)

| Provider | Launch | Notes |
|---|---|---|
| Claude Code | `npx -y @agentclientprotocol/claude-agent-acp` | needs Node; richest ACP surface |
| Codex | `npx -y @zed-industries/codex-acp` | needs Node; official Rust adapter |
| Grok | `grok agent stdio` | native ACP, no adapter |

`Provider::is_available()` does a PATH check to drive a startup health panel (missing CLI → clear
state, not a crash).

## Milestones

- **M0 (done):** workspace + tested core + Tauri/React/BlockNote scaffold + `/` skill menu.
- **M1 (done):** engine (Op→Event) with permission parking, SQLite session store + transcript,
  git-worktree manager, PTY, disk-backed skill library. All offline-tested.
- **M2 (done):** full GUI over the engine — session list, doc editor with inline skill nodes,
  live transcript, permission modal, embedded terminal, provider/mode pickers.
- **M3 (done):** ratatui TUI on the same core (session list, transcript, composer + `/` skill
  picker, inline permission prompts, provider/mode cyclers).
- **M4 (done, minus packaging):** lazy ACP session creation with MCP attach at `session/new`,
  dynamic add/remove skills reflected live in picker + compiler, transcript load on session select.
  **Remaining:** bundle a Node sidecar (so Claude/Codex adapters need no system Node) + app
  packaging/notarization — platform-specific, not verifiable in this environment.

## Test coverage (offline, no provider binary needed)

24 Rust tests across `core` + `tui`, incl. two protocol integration tests (full prompt turn;
permission parking then answer), MCP passthrough, real git-worktree add/remove, real PTY streaming,
skill compiler + persistence, and TUI state transitions. Frontend type-checks + builds; all three
Rust crates compile clean (zero warnings).

## Run

```sh
cargo test -p codetwo-core          # core, offline (mock ACP agent)
cd apps/desktop && bun install && bun run build   # frontend
cd apps/desktop && bun run tauri dev              # launch the desktop app (needs a display)
```
