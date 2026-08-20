<p align="center">
  <img src="apps/desktop/assets/128x128@2x.png" width="104" alt="C2 app icon" />
</p>

<h1 align="center">C2</h1>

<p align="center">
  <strong>The document-first coding agent.</strong><br />
  Compose structured prompts, weave in reusable skills, and run your coding CLIs through one local interface.
</p>

<p align="center">
  <a href="https://ichendev.github.io/codeTwo/">Website</a> ·
  <a href="website/guide/getting-started.md">Get started</a> ·
  <a href="docs/architecture.md">Architecture</a> ·
  <a href="docs/plugin-standard.md">Plugin standard</a> ·
  <a href="docs/plugin-protocol.md">Plugin protocol</a>
</p>

![C2 document editor with the skill picker open](docs/screenshots/slash-menu.png)

> [!IMPORTANT]
> C2 is pre-release software. The core product works, but there are no signed binary releases
> yet. Build it from source and expect APIs, storage, and packaging details to change before 1.0.

## Why C2

Most coding-agent clients begin with a chat box. C2 begins with a document. You can shape a
long brief with headings and lists, insert skills and files exactly where they belong, inspect the
whole turn, and only then send it to the agent you choose.

- **Document-first prompts.** Compose in a BlockNote editor instead of squeezing a specification
  into a single-line input.
- **Eight coding CLIs, one protocol.** Drive Claude Code, Codex, Grok, Cursor, OpenCode, Pi, Kimi,
  and ZCode/GLM through the [Agent Client Protocol](https://agentclientprotocol.com/).
- **Skills and complete plugins.** Insert reusable skills inline, or install GitHub packages that
  can include skills, subagents, MCP servers, and project scaffolds.
- **Local, inspectable continuity.** Sessions and project memory live in the shared Rust core;
  derived memories retain their sources and can be pinned or forgotten.
- **Git-aware execution.** Use per-session worktrees, automatic checkpoints, diffs, revert, and
  explicit commit/push flows.
- **Three surfaces.** C2 ships an Electrobun desktop app, a ratatui TUI, and a paired remote web
  client. The experimental desktop build runs an in-process Bun host; the TUI and server retain the
  Rust core.

## How it fits together

```text
Claude Code · Codex · Grok · Cursor · OpenCode · Pi · Kimi · GLM
                              │
                         ACP over stdio
                              │
                 Rust core + plugin kernel
                    ┌─────────┼─────────┐
                    │         │         │
                Desktop      TUI      Remote
          Electrobun + React  ratatui  Axum + WebSocket
```

C2's internals form a plugin graph inspired by
[cordis](https://github.com/cordiverse/cordis): storage, agent execution, git, memory, scenes, and
other subsystems declare what they require and provide. Out-of-process plugins use the same small
JSON-RPC [plugin protocol](docs/plugin-protocol.md) as built-in commands. Package, lifecycle,
scope, security, and host behavior follow the [C2 Plugin Standard](docs/plugin-standard.md).

## Build from source

### Prerequisites

- Rust 1.82 or newer
- Zig **0.15.2** exactly, required by the embedded Ghostty terminal engine
- Bun
- Git
- Your platform's native build tools (Xcode command-line tools on macOS)
- At least one supported provider CLI if you want to run a real agent turn

On macOS, install the pinned Zig version with Homebrew:

```sh
brew install zig@0.15
brew link --force zig@0.15
```

Then clone the repository and run the desktop app:

```sh
git clone https://github.com/IchenDEV/codeTwo.git
cd codeTwo
./script/build_and_run.sh
```

C2 detects provider CLIs on your `PATH`. Provider-specific setup and the exact adapter commands
are documented in [Providers](website/guide/providers.md).

### Nightly package

Every push to `main`, plus the daily 02:17 Asia/Singapore schedule, builds and verifies an Apple
Silicon DMG in the [Nightly macOS package](.github/workflows/nightly-macos.yml) workflow. Download
`C2-nightly-macos-arm64-<commit>` from that run's artifacts. Nightly packages are ad-hoc signed but
not Apple-notarized, so they are for testing rather than general distribution.

### Versioned release

Run the [Release macOS](.github/workflows/release-macos.yml) workflow, enter a semantic version such
as `0.1.0`, and choose whether it is a prerelease. The workflow builds and verifies the versioned
Apple Silicon DMG before it creates the matching `v<version>` tag and publishes a GitHub Release
with the DMG and SHA-256 checksum. Existing tags are never overwritten.

Release packages are currently ad-hoc signed and not Apple-notarized. They are suitable for testing
through GitHub Releases, but a public production distribution still requires Developer ID signing
and notarization.

### Other surfaces

From the repository root:

```sh
# Terminal interface
cargo run -p codetwo-tui

# Paired remote web client
cargo run -p codetwo-server

# Self-contained turn demo using a stub ACP agent (requires Node)
cargo run -p codetwo-core --example live_demo
```

The remote server prints a one-time pairing URL and token. Keep it on a trusted LAN or Tailscale
tailnet; C2 does not provide a hosted relay.

## Repository map

| Path                             | Purpose                                                                     |
| -------------------------------- | --------------------------------------------------------------------------- |
| [`crates/kernel`](crates/kernel) | Reactive plugin runtime and command registry                                |
| [`crates/core`](crates/core)     | ACP engine, sessions, providers, memory, git, terminal, browser, and skills |
| [`crates/tui`](crates/tui)       | ratatui frontend                                                            |
| [`crates/server`](crates/server) | Headless server, pairing, WebSocket protocol, and remote client             |
| [`apps/desktop`](apps/desktop)   | Electrobun + React + BlockNote desktop app                                  |
| [`website`](website)             | VitePress documentation and GitHub Pages site                               |
| [`docs`](docs)                   | Architecture, design laws, roadmap, and protocol notes                      |

## Development

Run Rust checks from the repository root:

```sh
cargo check --workspace --all-targets
cargo test --workspace
```

Run desktop checks from `apps/desktop`:

```sh
bun install --frozen-lockfile
bun run check:design
bun test
bun run build
```

Build the documentation site from `website`:

```sh
bun install --frozen-lockfile
bun run docs:build
```

The desktop UI follows the repository's [design system](docs/design.md). Product surfaces use the
shared components under `apps/desktop/src/components/ui`; avoid introducing one-off interaction
primitives or visual tokens.

## Contributing

Bug reports, documentation fixes, and focused pull requests are welcome. For a large change, open
an issue first so the product boundary and protocol impact can be discussed before implementation.

Please keep changes scoped, add tests for behavior changes, and run the relevant checks above. A
pull request that changes user-visible desktop UI should include light, dark, and narrow viewport
evidence where applicable.

## Security and privacy

C2 runs provider CLIs as local child processes and communicates with them over stdio. C2
does not change the provider's own network, authentication, data-retention, or tool policies;
review those separately before giving a provider access to sensitive code.

Remote access is bearer-token based and intended for a trusted LAN or Tailscale network. Do not
expose `codetwo-server` directly to the public internet. Please report a suspected vulnerability
privately to the repository owner rather than opening a public exploit report.

## License

Licensed under the [Apache License 2.0](LICENSE).
