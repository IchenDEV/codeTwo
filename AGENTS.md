# CodeTwo Repository Instructions

Follow the global Codex contract and the repository's existing architecture and design laws. Keep
changes narrowly scoped, preserve unrelated worktree state, and verify claims against the live
checkout.

## Development lifecycle

[`docs/sdlc/workflow.md`](docs/sdlc/workflow.md) is the single source of truth for material change
Artifacts, lifecycle states, Gates, verification evidence, release handoff, Incidents, and Evals.
Use [`docs/sdlc/development-workflow.md`](docs/sdlc/development-workflow.md) and
[`./script/devflow`](script/devflow) for daily change creation, approval recording, and validation.
Use the external [`sdlc-skill`](https://github.com/IchenDEV/sdlc-skill) `ai-native-sdlc` skill only
when guidance is needed to bootstrap or audit the development lifecycle, or improve it after an
incident. Reuse an installed copy first; the repository checker remains the enforcement source.

- A direct user implementation request may approve Intent. Record its source, constraints, named
  approver, and observable acceptance in one change bundle. Implementation requires accepted
  Intent, Spec, and Plan; use verification `in-progress` while executing. Artifact-only proposals
  may remain `draft` or `in-review`.
- Reuse accepted ADRs, design documents, issues, and PRs as evidence; link them from the change
  Artifact instead of copying their state into another tracker.
- Before handing off repository file changes, run `bun script/verify/docs.ts` and
  `bun script/verify/sdlc.ts --worktree`; the latter includes the full lifecycle check. Run
  `bun test script/verify/checks.test.ts` for Gate or lifecycle-contract changes, and
  `bun test script/devflow.test.ts` for devflow changes. Also run applicable active Evals.
  Read-only audits do not require these runs.
- A PR that changes repository files must change or add a canonical
  `docs/sdlc/changes/<date>-<slug>/` bundle with schema-3 stage files (`intent.md`, `spec.md`,
  `plan.md`, `verification.md`); implementation differences require that bundle's
  `intent.md`, `spec.md`, and `plan.md` to be `accepted` and every changed path to fall under its
  explicit `plan.md` scope.
- Do not create `docs/superpowers`, a parallel specs/plans tree, or another lifecycle registry.
- Every file under `docs/` must match exactly one rule in `docs/catalog.json`; dated research and
  completed plans belong under `docs/archive/`, and every documentation image must be referenced.
- Never mark a change verified, released, or closed without checked acceptance, an explicit
  verdict, actual evidence, residual risk, and the applicable human Gate.

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

Until the [profile contract](docs/reference/desktop-development-profiles.md) is implemented and
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
[development profile contract](docs/reference/desktop-development-profiles.md). It preserves the
required profile boundaries, OS-backed ownership lock, and complete acceptance criteria. Do not
claim profile-based launches are supported until that contract is implemented and exercised.
