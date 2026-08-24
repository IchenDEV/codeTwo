# Architecture

C2 drives existing coding CLIs (Claude Code, OpenAI Codex, Grok) over the **Agent Client
Protocol (ACP)** and presents them through a **document-first** UI. The desktop, TUI, and server all
use the same Rust core and Plugin Kernel. Electrobun is a desktop-shell adapter, not a second
business runtime.

## Why this shape

- **ACP is the common abstraction.** JSON-RPC over stdio, with entry points for all three
  providers (Grok natively; Claude Code & Codex via official adapters). We implement the client
  loop once and treat each backend as a launch command.
- **The Rust core is the single implementation.** The TUI and server link it directly. The desktop
  packages `codetwo-desktop-host`, which boots the same `CoreApp` graph plus desktop-owned
  automation, device-sync, event, language-server, and remote adapters. Bun owns windows, dialogs,
  updates, and the narrow JSON-lines process transport.

## Shape: a plugin graph, not a program with hooks

Everything below is a **plugin**. `crates/kernel` is a Rust port of
[cordis](https://github.com/cordiverse/cordis): contexts, services published by name, declared
injections, and scopes that undo everything a plugin did when it unloads. `crates/core/src/app`
defines C2's subsystems as plugins over it, and `CoreApp::boot(AppConfig)` assembles them from
config rather than from a constructor.

That is why the module list below reads as a menu rather than a build order: `store` and `engine`
have no fixed sequence, the app runs without either, and reconfiguring one reloads exactly what was
built on it. See [`docs/plugins.md`](plugins.md) for the model, how to write one, and what is still
hand-wired, and the [C2 Plugin Standard 1.0.0](plugin-standard.md) for the normative package,
lifecycle, scope, security, and host-capability contract.

A plugin does not have to be ours, or Rust. A bundle can ship a **process** that C2 speaks
JSON-RPC to over stdio; the commands it declares land in the same registry a built-in's do and are
callable from every frontend. Installing such a bundle still executes nothing — the process starts
only once the user marks it trusted. Spec: [`docs/plugin-protocol.md`](plugin-protocol.md).

## Layers

```
                 crates/kernel  (the plugin runtime — cordis in Rust)
                   crates/core  (Rust library — no UI)
   ┌──────────────────────────────────────────────────────────────┐
   │ ACP, providers, sessions, skills, policy, events and plugins │
   └──────────────────┬───────────────────────┬───────────────────┘
                      │ links directly        │ links directly
              crates/tui (ratatui)     crates/server (Axum)

   apps/desktop/src-host  (Rust CoreApp + desktop host plugins)
                      │ versioned JSON-lines commands + events
   apps/desktop/src/electrobun  (Bun window/dialog/update adapter)
                      │ one typed Electrobun `call` RPC
   apps/desktop/src  (React + Vite + BlockNote + sandboxed webviews)
```

## Device synchronization

Device sync follows the same ownership boundary. `codetwo-core` owns the versioned document,
SQLite snapshot/import operations, deterministic last-write-wins merge, append-only transcript
set, and deletion tombstones. The desktop `device-sync` host plugin owns private peer credentials,
five-minute scheduling, status/events, and the paired-device HTTP transport. The `remote` plugin
optionally injects that service and exposes it through `/api/device-sync/v1`; disabling either
plugin removes the corresponding commands or network protocol through normal graph teardown.

C2 sync pairing tokens and bearers are cryptographically separate from T3 and legacy remote-control
credentials. The accepting device persists only a bearer hash; the initiating device stores the raw
peer bearer in a `0600` state file. Snapshot requests are bounded to 64 MiB and use content versions
plus three merge retries so a concurrent writer yields an explicit conflict instead of silent loss.

## The SQ/EQ interface (`core::event`)

Frontends never touch ACP directly. They push [`Op`]s (NewSession, Prompt, Cancel,
AnswerPermission, …) and consume [`Event`]s (AgentText, ToolCall, PermissionRequest, TurnEnded, …).
- Electrobun desktop: the renderer makes one typed `call` RPC; Bun relays it to the bundled Rust
  Plugin Kernel, and reverse event envelopes carry engine, terminal, automation, and LSP streams.
- TUI: calls the same core engine in-process, renders `Event`s in its draw loop.

The Rust M1 engine consumes `Op`s and, by driving `core::acp`, produces `Event`s. Its ACP
`ClientHandler` translates `session/update` → `Event`s and routes `session/request_permission`
through the permission engine (auto-answer or surface an `Ask`). Desktop permission and sandbox
modes therefore have the same semantics as the TUI/server; a displayed policy is still not an
OS-enforced sandbox unless the selected provider supplies one.

## ACP client (`core::acp`)

A minimal, self-contained JSON-RPC 2.0 peer over async byte streams (child stdio in prod; an
in-memory duplex in tests). Hand-written wire types keep us independent of any single adapter's
version churn; the official `agent-client-protocol` crate can be swapped in behind `AcpClient`.
Unknown `session/update` variants are logged and dropped rather than fatal ("code to the common
denominator, feature-detect the rest").

Prompt-turn loop: `initialize` → `session/new` → `session/prompt` → stream `session/update` →
answer `session/request_permission` → read `StopReason`. Proven end-to-end offline by
`crates/core/tests/acp_prompt_turn.rs` against a mock agent (no provider binary needed).

We advertise one client capability at `initialize`: `elicitation.form`. That is what turns an
agent's structured question into a question — Claude Code's `AskUserQuestion` reaches the client as
`elicitation/create` only when the capability is present, and otherwise degrades into an
allow/reject prompt naming the tool but showing none of its options. `core::elicitation` normalizes
the request's JSON Schema into a render-ready `ElicitationForm`, which parks on the same pending-
input queue as permissions (`PendingInputKind::Elicitation`) and is answered with
`Op::AnswerElicitation`. Answers are sanitized against that form, so no client can send back a
value the agent never offered; a single-question form also projects onto permission-shaped options
so clients that only render approvals can still answer it. See
`crates/core/tests/engine_elicitation.rs`.

## Provider-neutral host tools

Special tools have one policy owner: the Bun `ToolBroker` under `packages/tool-broker`. Adapters
produce evidence; the broker exposes only `catalog(context)` and `resolve(request) -> ToolPlan`.
`ToolPlan` is deeply frozen and contains native capability ids, portable MCP server specs, and
short routing/safety instructions. It never contains a provider-private endpoint.

```text
 Codex native adapter              Configured MCP adapters
 (Computer/Browser/Image/Sites)    (Cua/Browser Use/Playwright/DevTools/custom)
              │ evidence                         │ evidence
              └──────────────┬───────────────────┘
                             ▼
                    packages/tool-broker
              catalog(context) │ resolve(request)
                             ▼
                  immutable ToolPlan + catalog
                             │
                      JSON-RPC adapter
                             │
                        Rust CoreApp
               ┌─────────────┼─────────────┐
     Electrobun desktop   ratatui TUI   Axum server

 SelectionStore ── host-tools.json
       ▲                    │
       └── settings commands┘
```

Every surface launches the compiled `codetwo-tool-broker` beside its Rust executable and
deserializes the same wire plan through `crates/core/src/host_tools.rs`; that Rust file contains
process and wire adaptation only. The packaged desktop resolves the broker beside
`codetwo-desktop-host`. `script/build_rust_hosts.sh` builds the sibling executables. During source
development the adapter can fall back to `bun toolBrokerRpc.ts`; installed hosts can also use
`CODETWO_TOOL_BROKER` or a broker on `PATH`.

`computer_use.select` and `browser_use.select` each write one global backend choice through the broker's
selection seam and refresh future plans. Each session snapshots its MCP set when created or
revived, so a settings change does not interrupt an existing session.

The signed OpenAI Computer Use adapter remains a built-in portable fallback. OpenAI Browser/Chrome
stays Codex-native because its runtime requires the active Codex turn and session; C2 never exports
its private `node_repl` endpoint to another provider. Entries in `host-tools.json` can attach Cua
Driver, Browser Use, Playwright, Chrome DevTools, or another standard MCP computer/browser-control
backend to compatible providers. Settings offers Automatic, no external backend, and every
configured backend as one global selection; provider scopes still determine where that backend can
actually attach.
An explicit selection replaces C2's portable OpenAI fallback. Provider-native tools remain owned
and enforced by their provider; a ToolPlan can select and advertise them but cannot export their
private transport or rewrite provider policy. Image Generation
and Sites remain unavailable outside Codex until their host exposes a portable MCP surface; C2 does
not claim parity based only on an installed plugin. Independently configured remote or cross-OS MCP
backends remain usable when their own runtime and the selected ACP transport support them.

## Context sync: whose memory is it?

Two transcripts and one recall layer can participate in a turn. They are not the same thing:

- **The app-owned transcript** — messages/parts in SQLite. Canonical for *display*: it's what the
  rail, the transcript pane, and any future remote frontend render, and it survives anything.
- **The provider-native context** — the agent CLI's own session state (Claude Code's session
  files, Codex's rollouts, …). Canonical for continuity *inside that provider session*: we never
  reconstruct or replay it ourselves; we only hold a cursor to it — the ACP session id, persisted
  per session.
- **C2 project memory** — provider-neutral L0–L3 recall in SQLite. It reuses raw transcript
  evidence and derives stable notes, earlier work episodes, and a project profile. It is canonical
  for none of the facts it contains: every derived row keeps evidence and is injected as untrusted,
  potentially stale reference data. L1/L3 consolidation is delayed, session read/write policy can
  narrow global controls, external-context provenance can gate learning, and every injection gets
  a separately persisted turn receipt. See [`docs/memory.md`](memory.md).

On revive (a session prompted after an app restart), the engine re-attaches to that cursor with
`session/load` when the agent advertised `loadSession` at `initialize` — the agent replays its
history (dropped by the handler: the store already has it) and the conversation continues with the
model's memory intact. No capability → straight to `session/new`, as before. A *failed* load falls
back to `session/new` and emits a notice: the transcript is kept, the memory is not — degrade
loudly, never silently. Model switches stay in-session (`session/set_model` /
`session/set_config_option`); an agent that refuses gets an actionable error ("start a new session
to use X") rather than a bare protocol failure. Cross-provider switches are not attempted at all:
a session is bound to its provider, because no provider can read another's native context.

Project memory is the intentionally small bridge across that boundary. Before prompt compilation
is sent, the engine retrieves a bounded project-scoped block and prepends it transiently. The
stored user transcript never contains that block. After a successful turn, capture examines the
original user document and the stored agent outcome. L2 is immediate; stable L1 candidates wait
for background maintenance. Expanded context is tracked as provenance and can be excluded from
durable learning.

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
| Codex | `npx -y @agentclientprotocol/codex-acp` | needs Node; Codex App Server adapter |
| Grok | `grok agent stdio` | native ACP, no adapter |

`Provider::is_available()` does a PATH check to drive a startup health panel (missing CLI → clear
state, not a crash).

## Milestones

- **M0 (done):** workspace + tested core + desktop React/BlockNote scaffold + `/` skill menu.
- **M1 (done):** engine (Op→Event) with permission parking, SQLite session store + transcript,
  git-worktree manager (creation and the explicit discard/cleanup flow), PTY, disk-backed skill
  library. All offline-tested.
- **M2 (done):** full GUI over the engine — session list, doc editor with inline skill nodes,
  live transcript, permission modal, embedded terminal, provider/mode pickers.
- **M3 (done):** ratatui TUI on the same core (session list, transcript, composer + `/` skill
  picker, inline permission prompts, provider/mode cyclers).
- **M4 (done):** lazy ACP session creation with MCP attach at `session/new`,
  dynamic add/remove skills reflected live in picker + compiler, transcript load on session select.
  **Remaining:** bundle a Node sidecar so Claude/Codex adapters need no system Node, plus signed and
  notarized release automation.

## Test coverage (offline, no provider binary needed)

24 Rust tests across `core` + `tui`, incl. two protocol integration tests (full prompt turn;
permission parking then answer), MCP passthrough, real git-worktree add/remove, real PTY streaming,
skill compiler + persistence, and TUI state transitions. Frontend type-checks + builds; all three
Rust crates compile clean (zero warnings).

## Run

```sh
cargo test -p codetwo-core          # core, offline (mock ACP agent)
cd apps/desktop && bun install && bun run build:renderer  # renderer only
cd apps/desktop && bun run dev                          # build and launch Electrobun
```
