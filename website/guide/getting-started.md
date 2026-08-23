# Install & run

C2 isn't published as a binary yet — you run it from source. It's a Cargo workspace plus an
Electrobun desktop host and Bun-built React renderer.

## Prerequisites

| Tool                     | Why                                         | Notes                                         |
| ------------------------ | ------------------------------------------- | --------------------------------------------- |
| **Rust** (1.82+)         | builds the core, TUI, server, and desktop sidecar | [rustup.rs](https://rustup.rs)           |
| **Zig** (0.15.2 exactly) | builds the embedded Ghostty terminal engine | [ziglang.org](https://ziglang.org/download/)  |
| **Bun**                  | builds the Electrobun host and desktop renderer | [bun.sh](https://bun.sh)                  |
| **git**                  | worktrees, checkpoints, source control      | usually already installed                     |
| A **provider CLI**       | to actually drive an agent                  | at least one of the supported providers below |

You also need your platform's native build tools. macOS builds use Xcode's command-line tools; the
layered `.icon` source additionally needs full Xcode.

On macOS, install the pinned Zig version with Homebrew:

```sh
brew install zig@0.15
brew link --force zig@0.15
```

### At least one provider

To run a real turn you need one agent CLI on your `PATH`:

- **Grok** — `grok` (speaks ACP natively; simplest, no Node needed).
- **Claude Code** — Node/npx (C2 launches `npx @agentclientprotocol/claude-agent-acp`).
- **Codex** — Node/npx (`npx -y @agentclientprotocol/codex-acp@1.6.2`).
- **Cursor** — `cursor-agent`.
- **OpenCode 1** — `opencode`.
- **OpenCode 2 (Beta)** — `opencode2`; V1 and V2 can be installed side by side.
- **Pi** — Node/npx (`npx -y pi-acp`, with `pi` on your `PATH` for its own config).
- **Kimi** — `kimi` (speaks ACP natively).
- **ZCode (GLM)** — Node/npx (`npx -y glm-acp-agent`) plus a `Z_AI_API_KEY`.

C2 shows a health dot per provider so you can tell what's available. See
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
bun run dev              # builds the renderer + Rust sidecar and opens Electrobun
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
