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
  <a href="docs/README.md">Documentation</a> ·
  <a href="docs/reference/architecture.md">Architecture</a> ·
  <a href="docs/reference/plugin-standard.md">Plugin standard</a> ·
  <a href="docs/reference/plugin-protocol.md">Plugin protocol</a>
</p>

![C2 document editor with the skill picker open](docs/screenshots/slash-menu.png)

> [!IMPORTANT]
> C2 is pre-release software. Expect APIs, storage, and packaging details to change before 1.0.
> See the [release Skill](.agents/skills/codetwo-release/SKILL.md) for package channels and signing limitations.

## Why C2

Most coding-agent clients begin with a chat box. C2 begins with a document. You can shape a
long brief with headings and lists, insert skills and files exactly where they belong, inspect the
whole turn, and only then send it to the agent you choose.

- **Document-first prompts.** Compose in a BlockNote editor instead of squeezing a specification
  into a single-line input.
- **Eleven coding CLIs, one protocol.** Drive Claude Code, Codex, Grok, Cursor, OpenCode 1 or 2,
  Pi, Kimi, ZCode/GLM, Amp, and Droid through the
  [Agent Client Protocol](https://agentclientprotocol.com/).
- **Skills and complete plugins.** Insert reusable skills inline, or install GitHub packages that
  can include skills, subagents, MCP servers, and project scaffolds.
- **Local, inspectable continuity.** Sessions and project memory live in the shared Rust core;
  derived memories retain their sources and can be pinned or forgotten.
- **Git-aware execution.** Use per-session worktrees, automatic checkpoints, diffs, revert, and
  explicit commit/push flows.
- **Three surfaces.** C2 ships an Electrobun desktop app, a ratatui TUI, and a paired remote web
  client. All three compose the same Rust Core through the same plugin runtime; Electrobun is the
  desktop shell and relays one command/event protocol to its bundled Rust host.

## How it fits together

```text
Claude Code · Codex · Grok · Cursor · OpenCode 1 · OpenCode 2 · Pi · Kimi · GLM · Amp · Droid
                              │
                         ACP over stdio
                              │
                 Rust product core
                         │
               Plugin composition layer
                    ┌─────────┼─────────┐
                    │         │         │
                Desktop      TUI      Remote
          Electrobun + React  ratatui  Axum + WebSocket
```

C2's internals form a runtime-module graph inspired by
[cordis](https://github.com/cordiverse/cordis): storage, agent execution, git, memory, scenes, and
other subsystems declare what they require and provide. Separately installed extensions use the
small JSON-RPC [plugin protocol](docs/reference/plugin-protocol.md) and only the explicitly exported Extension
API; the internal Rust trait and Core commands are not the public plugin contract. Package,
lifecycle, scope, security, and host behavior follow the
[C2 Plugin Standard](docs/reference/plugin-standard.md).

## Build from source

Start with [source setup and local development](.agents/skills/codetwo-develop/references/development.md). It covers the pinned
Zig toolchain, desktop launch, TUI/server builds, and relevant checks. Provider setup is in the
[user guide](website/guide/providers.md).

For package channels, signing limitations, and authorized publication, use the
[release Skill](.agents/skills/codetwo-release/SKILL.md). To operate a programming node, use the
[operations Skill](.agents/skills/codetwo-operations/SKILL.md).

## Repository map

| Path                             | Purpose                                                                     |
| -------------------------------- | --------------------------------------------------------------------------- |
| [`crates/kernel`](crates/kernel) | Reactive plugin runtime and command registry                                |
| [`crates/core`](crates/core)     | Plugin-independent product domain: ACP, sessions, providers, policy, and persistence |
| [`crates/plugins`](crates/plugins) | Core adapters, built-in runtime graph, extension bundles, protocol, and marketplace |
| [`crates/tui`](crates/tui)       | ratatui frontend                                                            |
| [`crates/server`](crates/server) | Headless server, pairing, WebSocket protocol, and remote client             |
| [`apps/desktop`](apps/desktop)   | Electrobun + React + BlockNote desktop app                                  |
| [`packages/tool-broker`](packages/tool-broker) | Provider-neutral special-tool catalog and immutable routing plans |
| [`website`](website)             | VitePress documentation and GitHub Pages site                               |
| [`docs`](docs/README.md)         | Documentation map, current contracts, designs, research, and SDLC records   |
| [`script`](script/README.md)     | Development, build, and repository-verification entry points                |

## Contributing

Focused fixes, documentation improvements, and bug reports are welcome. Follow the
[development Skill](.agents/skills/codetwo-develop/SKILL.md), [design system](docs/design/system.md), and
[development lifecycle](.agents/skills/codetwo-develop/references/workflow.md). Keep one change record with observable acceptance
and actual evidence; scope and risk determine the required checks and human decisions.

## Security and privacy

C2 runs provider CLIs as local child processes and communicates with them over stdio. C2
does not change the provider's own network, authentication, data-retention, or tool policies;
review those separately before giving a provider access to sensitive code.

Remote access is bearer-token based and intended for a trusted LAN or Tailscale network. Do not
expose `codetwo-server` directly to the public internet. Please report a suspected vulnerability
privately to the repository owner rather than opening a public exploit report.

## License

Licensed under the [Apache License 2.0](LICENSE).
