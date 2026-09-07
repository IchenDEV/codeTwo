# Desktop development instances

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

Until the [profile contract](../../../../docs/design/desktop-development-profiles.md) is implemented and
verified, assume `bun run dev` supports only one live dev instance. A distinct `CODETWO_DATA_DIR`
is a partial diagnostic workaround, not proof of safe multi-instance development.

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

Before implementing or changing development-instance isolation, read the
[development profile contract](../../../../docs/design/desktop-development-profiles.md). It preserves the
required profile boundaries, OS-backed ownership lock, and complete acceptance criteria. Do not
claim profile-based launches are supported until that contract is implemented and exercised.
