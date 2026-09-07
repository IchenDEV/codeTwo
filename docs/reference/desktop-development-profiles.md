# Desktop Development Profile Contract

Follow the [desktop launch rules](../../AGENTS.md#desktop-development-instances) before starting an instance.

## Required profile contract

When implementing or using true multi-instance development, introduce an explicit
`CODETWO_DEV_PROFILE` and make one profile the complete isolation boundary. Preserve the existing
single-instance behavior when no profile is supplied.

For every non-default profile, derive or require all of the following:

- a unique absolute `CODETWO_DATA_DIR`, preferably under the current worktree's ignored
  `.codex/run/instances/<profile>/data` directory;
- an explicit unique `CODETWO_DEV_PORT` used by Vite with `strictPort: true`;
- a profile-specific PID/ownership-lock path, Unix socket path, logs, and temporary runtime files;
- isolated build output when two instances could build concurrently;
- on macOS, a profile-specific development application name and bundle identifier when two app
  bundles will run at once, so Dock identity, TCC attribution, app capture, and UI automation do
  not select the wrong instance.

Validate profile names before using them in paths or identifiers. Accept a small slug alphabet,
reject traversal and empty values, and show the resolved profile, port, and data directory in the
startup output.

The intended interface after implementation is:

```bash
CODETWO_DEV_PROFILE=feature-a CODETWO_DEV_PORT=1421 bun run dev
CODETWO_DEV_PROFILE=plugin-dev CODETWO_DEV_PORT=1422 bun run dev
```

Do not present those commands as supported until the launcher, Vite configuration, bundle
metadata, and ownership checks have actually been implemented and exercised.

## Same-profile ownership

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
