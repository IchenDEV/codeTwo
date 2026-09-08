# Desktop Development Profile Contract

Status: experimental implementation. Core and launcher checks pass; full dual-window responsiveness and CPU verification remain incomplete. Evidence is recorded in the [change record](../sdlc/changes/2026-09-08-desktop-dev-profiles/verification.md). Linux profile launching uses `flock` but has not been exercised; Windows profile launching is not supported. Default launches remain available on their existing platforms.

Follow the [desktop launch rules](../../AGENTS.md#desktop-development-instances) before starting an instance.

## Configuration and isolation

Use one Git worktree per code revision and one profile per running instance. From each repository root:

```bash
CODETWO_DEV_PROFILE=feature-a CODETWO_DEV_PORT=1421 ./script/dev/run.sh
CODETWO_DEV_PROFILE=feature-b CODETWO_DEV_PORT=1422 ./script/dev/run.sh
```

From `apps/desktop`, the same environment works with `bun run dev` and `bun run build`.
Profiles are lowercase slugs starting with a letter, at most 32 characters. A port from 1024–65535
is required. Profiles are dev-only; nightly/release packaging rejects them.

A profile uses the current canonical worktree plus its name as identity. The same name in another
worktree gets a different bundle identifier and short socket directory. Under the ignored
`.codex/run/instances/<profile>/` directory it owns:

- `data/`: SQLite, sessions, provider settings, plugins and automation state;
- `target/`: Cargo output; Cargo incrementally checks current source on every build;
- `dist/`, `vite-cache/`, `build/`, `artifacts/`: renderer and Electrobun output;
- `native/`: Swift scratch directories, Swift download cache and native helper outputs;
- `tmp/`, `owner.json`, `build.lock`, `runtime.log`: temporary files, launcher ownership and logs.

The broker uses `/tmp/codetwo-<worktree-profile-hash>/scenes.sock` to stay within Unix socket path
limits. The app name and bundle identifier contain the profile and worktree hash; the packaged app
also carries its resolved data and socket defaults. An explicit `CODETWO_DATA_DIR` must be absolute;
a shared override is rejected by Core ownership rather than silently falling back to another path.

The native desktop loads packaged `views://` assets; it does not start Vite or bind the configured
Vite port. For renderer development/testing, start `bun run dev:renderer` in each worktree with the
same profile environment. Vite uses the explicit port with `strictPort: true`. Profile Vite servers
have no default shared API proxy: Web UI testing must explicitly configure `CODETWO_WEB_CORE_URL`
for its separately owned Core server. A browser context alone does not isolate backend data.

The same profile cannot run two build/watch launchers concurrently. macOS uses `lockf`, Linux uses
`flock`; lock files are retained, while OS ownership is released on exit. First-time Electrobun
tool downloads are coordinated within the checkout; waiting profiles continue once tools are ready,
without waiting for another profile's dev watcher to exit. Install Bun dependencies before starting
workers. Separate profiles can build and run concurrently, including in the same checkout; separate
worktrees are still required for independent source revisions.

## Operations

Pass the same profile environment to `./script/dev/run.sh --stop`, `--restart`, `--debug`, or
`--logs`. Stop/restart validates the recorded process identity and targets only that launcher.
The launcher drains its dedicated CLI process group before releasing build ownership. Logs are
kept in `runtime.log`; `--logs` shows the resolved identity and recent output. Do not remove lock
files or kill unrelated processes to resolve a collision. Choose another profile/port or stop the
instance you own. A manually launched bundle can still hold its data-directory lock after its
launcher is gone; close that specific app before reusing its profile.

Profiles do not isolate the macOS login desktop, global mouse/keyboard focus, clipboard, system
permissions, third-party accounts or all provider-managed home directories. Use offline stub
providers for deterministic integration checks; never resume a shared persisted provider session
from independent Cores. Native global-input tests need coordination or separate OS desktops.

## Same-profile ownership

CoreApp holds ownership until it is dropped; in-process callers stop and drop the old Core before
booting its replacement. Cloning AppConfig never clones ownership. The broker additionally holds
a socket lock so two explicit socket overrides cannot replace each other.

Before opening SQLite, running migrations, normalizing interrupted work, purging transient state,
or removing/rebinding the scene socket, the native Core must acquire an operating-system-backed
exclusive lock under the resolved data directory.

- If the lock is held, fail fast with a clear "profile already running" error. Include safe owner
  diagnostics such as profile, PID, and data directory when available.
- A PID file alone is not sufficient; PID reuse and stale files must not grant ownership.
- Normal process exit and crashes must release the OS lock automatically.
- Startup recovery may mark in-flight work interrupted only after ownership is acquired.
- Never unlink a live instance's socket before ownership is established.

If shared state across independently hosted Core processes ever becomes a product requirement,
design that separately as a single Core daemon with multiple clients or as a durable lease and
fencing protocol. Do not weaken the development-profile lock ad hoc.

## Acceptance criteria

Do not call multi-instance development complete until an automated or agent-runnable harness proves
all of these behaviors:

1. Profiles A and B start concurrently on different ports and use different databases, sockets,
   provider child-process groups, and build/runtime directories.
2. A prompt or permission request in A cannot appear in, cancel, interrupt, or mutate B.
3. Starting a second process with profile A fails before database mutation, startup recovery, or
   socket replacement, while the first A process and its active turn continue normally.
4. After the first A process exits or crashes, A can restart and only its own genuinely abandoned
   in-flight work is reconciled as interrupted.
5. Stopping or rebuilding B does not stop, relaunch, or overwrite A.
6. The default no-profile launch remains backward compatible and does not move or rewrite existing
   user data unexpectedly.
7. Port collisions and invalid profiles fail with actionable messages; no launcher silently falls
   back to another port or shared directory.

For validation, capture the resolved instance identities and assert the exact user-visible symptom,
not merely that two processes stayed alive.

## Focused checks

From the repository root (use the required Zig toolchain on PATH):

```bash
CARGO_TARGET_DIR=.codex/run/verify-target cargo build -p codetwo-desktop-host
CODETWO_TEST_HOST_BINARY="$PWD/.codex/run/verify-target/debug/codetwo-desktop-host" bun test apps/desktop/tests/devProfileHost.test.ts
CODETWO_TEST_VITE=1 bun test apps/desktop/tests/devProfileVite.test.ts
bun test apps/desktop/tests/devProfile.test.ts
```

The host harness requires Python 3 on Unix to reproduce inherited nonblocking stdin. It uses
disposable data and real offline ACP child processes. It checks independent
permission waits, duplicate data/socket rejection, distinct provider process groups, B shutdown
while A remains waiting, and A crash/restart recovery. Native bundle rendering and platform-specific
build evidence belong to the linked verification record.
