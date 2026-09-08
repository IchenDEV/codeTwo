# Contribute to CodeTwo

Build and run from the repository root unless a command names another directory. For product use,
start with the [user guide](../../../../website/guide/getting-started.md). The
[development lifecycle](workflow.md) owns scope, authorization, verification, and review.

## Build and run locally

Before launching the desktop, read the [instance preflight](../../codetwo-operations/references/desktop-instances.md).

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
./script/dev/run.sh
```

If this launcher's tracked instance is already running, normal launch refuses to replace it.
Use `./script/dev/run.sh --logs` or `--telemetry` to inspect it, or `--restart` to explicitly stop
and rebuild it. For concurrent workers, use a separate worktree and profile per instance:

```sh
CODETWO_DEV_PROFILE=feature-a CODETWO_DEV_PORT=1421 ./script/dev/run.sh
```

The [profile contract](../../../../docs/design/desktop-development-profiles.md) documents isolation,
renderer ports, stop/restart, and platform verification boundaries.

C2 detects provider CLIs on your `PATH`. Provider-specific setup and the exact adapter commands
are documented in [Providers](../../../../website/guide/providers.md).

### Other surfaces

From the repository root:

```sh
# Build the TUI, server, shared Web UI, and Bun Tool Broker
./script/build/hosts.sh release

# Terminal interface
./target/release/codetwo-tui

# Paired compact remote client
./target/release/codetwo-server

# Full React Web UI (starts one Core and opens the pairing link)
./target/release/codetwo-server webui

# Self-contained turn demo using a stub ACP agent (requires Node)
cargo run -p codetwo-core --example live_demo
```

Both server modes print a one-time pairing URL and token. `webui` serves the same React renderer as
the desktop app from the adjacent `web-ui` build directory and opens the local pairing URL; pass
`--no-open` to suppress that side effect, or `--ui-dir <path>` when the assets are packaged
elsewhere. Keep either mode on a trusted LAN or Tailscale tailnet; C2 does not provide a hosted
relay.

## Check the affected area

Choose relevant checks using the [workflow](workflow.md#test); the commands below are
available entry points, not a requirement to run every suite for every edit. Documentation-only
changes use `bun script/verify/docs.ts` and `bun script/verify/sdlc.ts --worktree`.

Run Rust checks for the affected crate and relevant consumers from the repository root.
Replace the package name below with the crate under change:

```sh
cargo check -p codetwo-core --all-targets
cargo test -p codetwo-core
```

Use workspace checks when the change spans crate boundaries or complete validation is requested:

```sh
cargo check --workspace --all-targets
cargo test --workspace
```

Use `./script/build/hosts.sh debug` when validation needs the built hosts. The existing CI matrix
is unchanged; these examples select the local iteration scope.

Run desktop checks from `apps/desktop`:

```sh
bun install --frozen-lockfile
bun run lint
bun test
bun run build
```

Build the documentation site from `website`:

```sh
bun install --frozen-lockfile
bun run docs:build
```

The desktop UI follows the repository's [design system](../../../../docs/design/system.md). Product surfaces use the
shared components under `apps/desktop/src/components/ui`; avoid introducing one-off interaction
primitives or visual tokens.


## Operating guides

| Task | Guide |
| --- | --- |
| Package a nightly or authorized versioned release | [Release guide](../../codetwo-release/references/releasing.md) |
| Build and operate a remote programming node | [Remote agent](../../codetwo-operations/references/remote-agent.md) |
| Configure concurrent development instances | [Profile configuration](../../../../docs/design/desktop-development-profiles.md) |
| Find development/build scripts | [Script index](../../../../script/README.md) |

Bug reports and focused pull requests are welcome. Link the canonical change record, keep scope
bounded, and attach applicable acceptance evidence. Starting a local change, delivering a PR,
merging, and publishing retain the separate authorization boundaries in the workflow.
