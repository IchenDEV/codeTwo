---
id: 2026-09-08-desktop-dev-profiles
schema: 5
stage: verification
status: blocked
owner: codex
created: 2026-09-08
based_on: plan.md
revision: "worktree based on 21ea4f3f19cb8e4fe8a82f7a91376726a3a0b277; local profile and stdio changes"
verification_mode: independent
verified_by: review_isolation
verified_at: 2026-09-08
release_target: none
cleanup_status: complete
next_trigger: Complete remaining dual-window interaction acceptance; the reproduced startup CPU storm is fixed in the linked follow-up.
---

# Verification: Desktop Dev Profiles

## Verification

- AC-1: PASS — `bun test apps/desktop/tests/devProfile.test.ts` checks disjoint worktree/profile identities and outputs, invalid configuration and Electrobun copy resolution. Related profile/channel/native-host/watcher tests after contention verification: 13 passed, 79 assertions, including rejection of release arguments before creating runtime state.
- AC-2: PASS — `CODETWO_TEST_HOST_BINARY="$PWD/.codex/run/verify-target/debug/codetwo-desktop-host" bun test apps/desktop/tests/devProfileHost.test.ts`: 2 passed, 17 assertions. Real offline ACP processes hold independent permission requests; duplicate data/socket launches fail, B shutdown leaves A intact, and A crash/restart reconciles its abandoned work. Python reproduces inherited and late nonblocking stdin plus a split UTF-8 request. Prior binaries fail those regressions. The independent reviewer checked the red/green evidence and byte-buffer preservation.
- AC-3: BLOCKED — Both macOS profiles completed concurrent full builds through postPackage with distinct app identities and directories. The final stdio-only release host was rebuilt and copied into both existing bundles; both copies match SHA256 `0ec2ec794c0c244dbde14f5e18fc0cc9dfb2ac3f1e572fcf46faec390e9cc547`. CUA observed both window identities and rendered the shared UI; after the final pipe correction A accepted an independent draft. Complete final dual-window interaction/CPU acceptance is not established: B capture timed out, one run logged an Electrobun internalBridgeHandler JSON error, and later both launchers exited normally before the CPU sampling window. User reported high CPU and subsequently confirmed closing both windows manually; these normal exits are not evidence of a crash. Do not claim complete desktop parallel validation.
- AC-4: PASS — `CODETWO_TEST_VITE=1 bun test apps/desktop/tests/devProfileVite.test.ts`: 1 passed, 6 assertions; two strict-port servers run together, a collision fails, and stopping B leaves A responding. Default profile/channel tests preserve legacy identities and output paths. Profile Vite does not silently proxy to a shared default Core.
- AC-5: PASS — `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts --worktree`, `git diff --check`, and the lifecycle Eval (28 passed, 217 assertions) passed. Documentation names unsupported platforms and incomplete native acceptance.

- AC-6: PASS — `bun test apps/desktop/tests/devWatcher.test.ts` runs the installed Electrobun watcher with real filesystem events and stubbed native/build actions. Before the fix, runtime logging alone produced 5 builds; afterward there is 1 initial build and exactly 1 additional build for a source edit. The independent reviewer reran it. A disposable real-launcher probe rejected 20 same-profile launches with code 75, max 17.6 ms, and no owner restart; B shutdown left A running. `NativeHost` tests reject 100 post-failure calls without spawning or writing IPC.

Verdict: blocked on final desktop responsiveness and CPU evidence; Core/launcher isolation is verified.

Rust evidence: `cargo test -p codetwo-plugins -p codetwo-desktop-host` passed before the final stdio increment; the affected desktop-host library suite and real host integration harness were rerun after it. `bun run lint` and `bunx tsc --noEmit` passed. The renderer build completed in both full profile builds; unchanged renderer assets were reused for the final native-only correction.

Independent verification: `review_isolation` reproduced and verified launcher bootstrap cancellation, readiness-based concurrent startup, B-only stopping, Core lock clone prevention and socket ownership in disposable projects. It independently reviewed the stdio correction and regression logs. Root performed actual package launch/render checks; those do not cover all final GUI criteria.

CPU evidence: the observed high-CPU snapshot showed Codex Renderer at 348.6%, Codex Service at 65.5%, and the CUA service at 28.1%; no test Core was running at that instant. This is an observation, not a causal diagnosis of the user's earlier peak. A later attempted 10-second C2 sample had no surviving matching processes because the user manually closed the windows; it is invalid as performance evidence. All assistant-owned test instances were stopped and CUA bindings reset. Do not claim CPU recovery from the empty sample.

Follow-up CPU diagnosis on 2026-09-08: a 10-second `ps` CPU-time delta measured Codex GPU process 53088 at 44.5%, with its role confirmed by `--type=gpu-process`. Six additional 5-second windows measured 41.4–46.1% for that GPU process and 9.1–10.7% for the formerly hot renderer. Two `sample <pid> 5 10` captures show graphics activity but have insufficient symbols for a JavaScript root cause. No monitored >100% peak recurred. C2 windows stayed closed, so these are not C2 performance acceptance results. A bounded summary and samples remain in `.codex/run/cpu-diagnosis/`; redundant logs were removed and all sampling processes exited. The original high-CPU process identity is awaiting user clarification.

Residual risk: complete two-window native interaction and CPU stability remain unverified. Linux launcher behavior and Windows default builds were not exercised; Windows profile launching fails explicitly. No live provider-account turns, signing/notarization, remote CI or release was performed. Shared OS desktop input and external provider homes/accounts remain outside profile isolation.

## Cleanup

Removed: 8.73 GiB of task-owned build caches, bundles, probes and stale sockets.
Retained: `.codex/run/instances/verify-a/data`, `.codex/run/instances/verify-b/data`, consolidated `.codex/run/profile-evidence/` logs, and `.codex/run/cpu-diagnosis/` samples for the unresolved GUI/CPU investigation.
Retention owner: codex, transferred to the next owner of this change on continuation.
Cleanup trigger: inspect on the next continuation; discard superseded diagnostic logs when the GUI/CPU investigation is resolved, and preserve possible user data until explicitly disposable.
Processes: no test profile or reviewer probe processes remained after cleanup.
Evidence: `du -sh .codex/run/instances/verify-a .codex/run/instances/verify-b .codex/run/profile-evidence` showed 560 KiB, 560 KiB and 524 KiB; the scoped `ps` inventory found no test processes.

The user requested cleanup after manually closing the windows. Launcher cleanup consolidates process-group draining, publishes owner metadata atomically, validates release arguments before side effects, prints the toolchain waiting notice once, and reads only the tail of runtime logs. Non-profile bootstrap cancellation now targets its actual child process.

`review_isolation` independently verified profile and non-profile download cancellation, readiness-based parallel startup, and B-only stopping with disposable CLI fixtures. No GUI or native rebuild was performed during cleanup. The focused TypeScript checks and 12 tests passed; applicable documentation, scope and lifecycle checks were rerun.

Removed approximately 8.73 GiB of assistant-created build caches, test bundles and binary probes, plus the disposable reviewer projects and empty CPU sample. Data directories for `verify-a` and `verify-b` were retained. Prior raw evidence logs were consolidated under the ignored `.codex/run/profile-evidence/` directory. Native regression commands require rebuilding their disposable binary before another run. This cleanup does not resolve AC-3. Subsequent contention verification found and fixed a runtime-output watcher feedback loop; it does not establish the cause of the earlier Codex Renderer CPU peak.

## Review and release

Approval: pending; no PR, merge or release requested.
Rollback: Revert the scoped change; preserve default user data. Disposable profile artifacts are in ignored runtime directories.
Release: none.


Contention verification closeout: removed the temporary launcher probe script, compiled idle CLI and its entire disposable project, temporary watcher projects, owned child processes and probe sockets. Retained only the small contention result and summary under the already recorded `.codex/run/cpu-diagnosis/` evidence root. The independent `review_isolation` verifier confirmed the watcher regression and minimal ignore-pattern correction. No desktop window, provider or native build was started; TypeScript, lint, documentation and scope checks passed.


Startup CPU follow-up: after the user clarified that the failure begins when two instances launch, actual native startup reproduced a renderer-driven request/process storm. The [startup correction](../2026-09-08-desktop-startup-request-loop/verification.md) records the before/after measurements, bounded disconnected-Core run and cleanup. This resolves the reproduced startup storm, while the broader AC-3 dual-window interaction acceptance remains blocked. The historical Codex Renderer peak is still not causally attributed.
