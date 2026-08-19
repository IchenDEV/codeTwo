# Install & run

Code2 isn't published as a binary yet — you run it from source. It's a Cargo workspace plus a
Bun-built frontend.

## Prerequisites

| Tool                     | Why                                         | Notes                                         |
| ------------------------ | ------------------------------------------- | --------------------------------------------- |
| **Rust** (1.82+)         | builds the core, TUI, server, and Tauri app | [rustup.rs](https://rustup.rs)                |
| **Zig** (0.15.2 exactly) | builds the embedded Ghostty terminal engine | [ziglang.org](https://ziglang.org/download/)  |
| **Bun**                  | builds the desktop frontend                 | [bun.sh](https://bun.sh)                      |
| **git**                  | worktrees, checkpoints, source control      | usually already installed                     |
| A **provider CLI**       | to actually drive an agent                  | at least one of the supported providers below |

You also need the OS toolchain Tauri requires (Xcode CLT on macOS; `webkit2gtk` + build essentials on
Linux). See [tauri.app prerequisites](https://tauri.app/start/prerequisites/).

On macOS, install the pinned Zig version with Homebrew:

```sh
brew install zig@0.15
brew link --force zig@0.15
```

### At least one provider

To run a real turn you need one agent CLI on your `PATH`:

- **Grok** — `grok` (speaks ACP natively; simplest, no Node needed).
- **Claude Code** — Node/npx (Code2 launches `npx @agentclientprotocol/claude-agent-acp`).
- **Codex** — Node/npx (`npx -y @agentclientprotocol/codex-acp@1.1.14`).
- **Cursor** — `cursor-agent`.
- **OpenCode** — `opencode`.
- **Pi** — Node/npx (`npx -y pi-acp`, with `pi` on your `PATH` for its own config).
- **Kimi** — `kimi` (speaks ACP natively).
- **ZCode (GLM)** — Node/npx (`npx -y glm-acp-agent`) plus a `Z_AI_API_KEY`.

Code2 shows a health dot per provider so you can tell what's available. See
[Providers](/guide/providers).

## Clone & test the core

```sh
git clone https://github.com/IchenDEV/codeTwo
cd codeTwo

# Build + run the offline test suite (uses a mock ACP agent, real git, real pty)
cargo test -p codetwo-core -p codetwo-tui -p codetwo-server
```

## Run the desktop app

```sh
cd apps/desktop
bun install --frozen-lockfile
bun run tauri dev        # opens the desktop window
```

## Run the TUI

```sh
cargo run -p codetwo-tui
```

## Run remote control

```sh
cargo run -p codetwo-server   # prints a pairing URL + token + QR
```

See [Remote control](/guide/remote).

## Try it without a provider

Curious how a turn flows before installing a CLI? There's a self-contained demo that spawns a tiny
stub agent (needs `node`) and drives a full turn:

```sh
cargo run -p codetwo-core --example live_demo
```

Next: [Your first session](/guide/first-session).
