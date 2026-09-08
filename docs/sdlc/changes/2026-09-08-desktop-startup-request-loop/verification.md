---
id: 2026-09-08-desktop-startup-request-loop
schema: 5
stage: verification
status: passed
owner: Codex
created: 2026-09-08
based_on: plan.md
revision: "worktree based on 21ea4f3f19cb8e4fe8a82f7a91376726a3a0b277; App startup callback correction"
verification_mode: owner
verified_by: Codex
verified_at: 2026-09-08
release_target: none
cleanup_status: complete
---

# Verification: Desktop Startup Request Loop

## Verification

- AC-1: PASS — `bun test tests/startupEffects.test.tsx` extracts the actual App startup callbacks and effects and renders them without compiler memoization. Before the change, ten unrelated rerenders increased each startup read from 1 to 11. Afterward reads remain unchanged; workspace/provider changes refresh their corresponding data. The combined focused run with providerRegistry, nativeHost and devProfile passed 13 tests / 80 assertions.
- AC-2: PASS — `bun test tests/startupEffects.test.tsx`: the source-extracted Core subscription remains single across ten rerenders; its asynchronously resolved disposer runs once after unmount. A retained event callback uses the latest render while retaining identity. Source inspection confirms Core dispatch reads the latest callback set.
- AC-3: PASS — `.codex/run/cpu-diagnosis/startup-result.json`: actual macOS startup reproduced a request/process storm with no watcher or GUI automation. A single instance reached a sampled 576.8% aggregate owned-process CPU and 561 observed process identities; dual startup produced repeated batches of 8–258 calls per command every approximately half second and hit the process-count guard. After the renderer correction, two independent profiles ran 35 seconds: providers.list and each session-list command remained at 1 per instance, 42 owned process identities were observed across the run, and owned-process CPU after ten seconds averaged 2.15% (maximum sampled 7.2%). A second 26-second dual run terminated only the two owned Core processes after three seconds: providers.list was bounded at 3 attempts per instance, session-list commands remained at 1, and owned-process CPU after ten seconds averaged 2.21%. Both corrected runs reached the deadline and left no owned processes.

Verdict: verified.

The reproduced startup request/process storm is corrected. `bunx tsc --noEmit`, `bun run lint`, renderer production build, documentation/scope checks and `git diff --check` passed.

Measurement limits: one fully used CPU core is 100%; figures above aggregate the launched process families and are not whole-machine percentages. New WebKit XPC processes were observed separately (mean 3.45% after ten seconds in the corrected dual run), without definitive client attribution. The first native stack sampler timed out and produced no valid stack. The old dual-run shutdown snapshot had one transient PID that exited on follow-up inspection. The second bundle reused identical native code, replaced only its resolved profile configuration and was locally ad hoc signed; this is a runtime comparison, not a second independent full build.

Residual risk: these bounded startup and disconnected-Core checks do not establish long-running provider-turn performance, full dual-window interaction, Linux/Windows behavior, or the cause of the historical Codex Renderer 348.6% snapshot. No live agent turn, merge or release was performed. React Compiler can still skip App; lifecycle correctness is now explicit.

## Cleanup

Removed: approximately 2.3 GiB of task-owned cpu-start/cpu-peer build outputs and bundles, their empty-session test databases, socket roots, WebKit caches, temporary source copies/scripts and runtime instrumentation. Duplicate monitoring logs were removed; raw process samples were compressed.
Retained: compact startup-result.json, compressed process evidence, request-count logs, compiler diagnostic and relevant build/test evidence under `.codex/run/cpu-diagnosis/`; pre-existing verify-a/verify-b data was preserved.
Retention owner: Codex and the code reviewer.
Cleanup trigger: remove superseded startup diagnostics after review or replacement evidence; keep the committed regression tests.
Processes: both isolated launch groups, provider children, build tools and sampling processes exited; profile locks were checked before removal. Final process inspection found no cpu-start/cpu-peer or desktop-host process.
Evidence: `.codex/run/cpu-diagnosis/startup-result.json`, `startup-cleanup.json`, `startup-final-tests.log`; `ps -Ao pid=,ppid=,pgid=,comm=` and profile-directory inspection.

## Review and release

Approval: pending human code review.
Rollback: See plan.md.
Release: No release requested or performed.
Feedback: Reproduced startup failure is protected by source-extracted lifecycle regression tests and actual runtime comparison.
