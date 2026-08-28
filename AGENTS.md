# CodeTwo Repository Instructions

Follow the global Codex contract and the repository's existing architecture and design laws. Keep
changes narrowly scoped, preserve unrelated worktree state, and verify claims against the live
checkout.

## Development lifecycle

[`docs/sdlc/workflow.md`](docs/sdlc/workflow.md) is the single source of truth for material change
artifacts, lifecycle states, gates, verification evidence, release handoff, incidents, and evals.

- A direct user implementation request may supply the accepted Intent. Record its source and the
  observable acceptance criteria in one change artifact before treating implementation as ready.
- Reuse accepted ADRs, design documents, issues, and PRs as evidence; link them from the change
  artifact instead of copying their state into another tracker.
- Run `python3 script/check_sdlc.py` before handoff. A PR that changes repository files must change
  or add a canonical file under `docs/sdlc/changes/`.
- Do not create `docs/superpowers`, a parallel specs/plans tree, or another lifecycle registry.
- Never mark a change verified, released, or closed without the corresponding observed evidence.

C2's product-level Scenes, Pipelines, task boards, and packs are application features and fixtures;
they are not repositories for this project's development-lifecycle state.

## Desktop development instances

Treat one desktop data directory as having exactly one live Core owner. Two Core processes must
never share the same SQLite database, provider-session cursors, plugin state, scene socket, or
automation state.

### Current limitations

- `apps/desktop/vite.config.ts` currently fixes the development server to port `1420` with
  `strictPort: true`.
- The desktop currently defaults to the data directory derived from the fixed dev application
  identifier. `CODETWO_DATA_DIR` overrides that directory, but it does not isolate the Vite port,
  bundle identifier, build output, or process ownership by itself.
- Core startup currently normalizes persisted in-flight sessions and automation runs as
  interrupted. The scene broker also replaces an existing socket at its configured path. Starting
  a second Core against a live first Core's data directory can therefore disrupt real work.
- The session `ActivityTracker` prevents concurrent turns only inside one process. It is not a
  cross-process ownership lock.
- Session Git worktrees isolate code changes; they do not make shared application state safe.

Until the profile contract below is implemented and verified, assume `bun run dev` supports only
one live dev instance. A distinct `CODETWO_DATA_DIR` is a partial diagnostic workaround, not proof
of safe multi-instance development.

### Launch rules

Before starting the desktop:

1. Inspect the intended port, running CodeTwo/Electrobun processes, and the data directory.
2. If port `1420` is occupied, check whether the existing dev server is healthy. Do not report a
   port collision as a product failure without checking it.
3. Do not kill or replace an existing user process merely to free a port or collect measurements.
   Reuse it when appropriate, choose an isolated instance, or report the blocker.
4. Do not start two Core processes with the same data directory. Do not open the same persisted
   provider session from two Core processes.
5. Use separate Git worktrees for concurrently developed code revisions. Do not run concurrent
   builders that write the same `dist`, Electrobun build, or Cargo target output.

If multiple windows need to show the same sessions, use one Core with multiple renderer windows.
Do not solve that requirement by sharing SQLite between multiple Core processes.

### Required profile contract

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

### Same-profile ownership

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

### Acceptance criteria

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
