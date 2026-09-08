# Desktop development instances

Treat one desktop data directory as having exactly one live Core owner. Two Core processes must
never share the same SQLite database, provider-session cursors, plugin state, scene socket, or
automation state.

### Isolation

Use an explicit development profile for concurrent instances. The [profile contract](../../../../docs/design/desktop-development-profiles.md)
owns configuration, paths, ownership, stop/restart and verification boundaries. Default no-profile
launches still share the fixed development identity and support one live instance.

CoreApp acquires an OS-backed data-directory lock before startup recovery, and desktop startup
acquires it before binding the scene broker. The broker also locks its socket path. Do not remove
lock files to bypass ownership. Session worktrees isolate source revisions; profiles isolate app
runtime and build state. Global desktop input and external provider accounts remain shared.

### Launch rules

Before starting the desktop:

1. Inspect the intended port, running CodeTwo/Electrobun processes, and the data directory.
2. If the intended Vite port (default `1420`) is occupied, check whether the existing dev server is healthy. Do not report a
   port collision as a product failure without checking it.
3. Do not kill or replace an existing user process merely to free a port or collect measurements.
   Reuse it when appropriate, choose an isolated instance, or report the blocker.
4. Do not start two Core processes with the same data directory. Do not open the same persisted
   provider session from two Core processes.
5. Use separate Git worktrees for concurrently developed code revisions and distinct profiles for
   concurrent launchers. Use profile-aware scripts so renderer, native and Cargo outputs stay isolated.

If multiple windows need to show the same sessions, use one Core with multiple renderer windows.
Do not solve that requirement by sharing SQLite between multiple Core processes.

Before implementing or changing development-instance isolation, read the
[development profile contract](../../../../docs/design/desktop-development-profiles.md). It preserves the
required profile boundaries, OS-backed ownership lock, and complete acceptance criteria. Use only the platforms and launch paths whose verification is recorded there.
