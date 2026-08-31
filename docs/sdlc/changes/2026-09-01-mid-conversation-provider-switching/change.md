---
id: change-2026-09-01-mid-conversation-provider-switching
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: [user]
approved_at: 2026-09-01
created: 2026-09-01
updated: 2026-09-01
source: direct user request on 2026-09-01 to prioritize switching providers during an existing conversation and resolve compatibility problems
inputs: existing single-provider Session runtime, ACP adapters, durable transcript store, Composer provider picker, and provider lifecycle registry
outputs: atomic idle-session provider replacement, bounded provider-neutral continuation context, stale-runtime fencing, synchronized desktop state, live multi-provider canary, and compatibility regressions
scope: crates/core/src/engine.rs, crates/core/src/error.rs, crates/core/src/event.rs, crates/core/src/session.rs, crates/core/src/store.rs, crates/core/examples/exec.rs, crates/core/examples/live_demo.rs, crates/core/tests/engine_provider_switch.rs, crates/plugins/src/app/plugins/engine.rs, crates/tui/src/app.rs, apps/desktop/src/App.tsx, apps/desktop/src/bridge.ts, apps/desktop/src/i18n/strings.ts, apps/desktop/src/session/Composer.tsx, apps/desktop/src/session/config.ts, apps/desktop/tests/sceneChip.test.tsx, docs/sdlc/changes/2026-09-01-mid-conversation-provider-switching
next_trigger: human product and code review decides whether to merge this verified local change
verification_mode: owner
verified_by: codex
verified_at: 2026-09-01
---

# Continue one conversation across providers

## Intent

An existing CodeTwo Session owns one provider process and one provider-specific ACP resume cursor,
while the desktop provider picker can visually change without replacing that runtime. The result is
an unsafe mismatch: the Composer may name one provider while the next turn still runs on another,
and simply moving an ACP cursor across providers would be invalid.

The requested outcome is an explicit mid-conversation switch that preserves the user-visible
Session and transcript, starts the selected provider with a provider-neutral continuation, and
fails without damaging the original runtime when the switch cannot be completed. Existing files,
worktree identity, execution policy, memory policy, scenes, and transcript ordering must remain
unchanged.

Provider account migration, cross-provider native tool-state migration, automatic failover,
provider selection during a running or awaiting-input turn, release, and deployment are out of
scope.

## Spec

An idle, active Session may replace its provider without creating a new Session id. The new
provider must initialize successfully before durable state changes. The commit clears the old ACP
cursor, model, provider-owned configuration, capabilities, goal, context-window projection, and
memory-injection receipts, while retaining provider-neutral Session policy and workspace state.

The first prompt after a switch starts a fresh ACP session and receives a bounded continuation
projection made from canonical user prompts, assistant text, plan status, and tool title/status.
Provider reasoning and raw tool outputs are excluded. Oldest context may be truncated, but the
newest complete conversation records and an explicit truncation marker remain. The continuation is
cleared only after the new provider accepts its first prompt.

Switching is rejected while a turn or user-input request is active, while another switch owns the
Session, when the selected provider is unknown or unchanged, or when a managed Task lease fixes the
runtime compatibility identity. Candidate startup, initialization, persistence, or race failures
leave the old durable and live provider usable. Events from a detached provider are fenced before
its process is terminated.

The desktop picker reflects the provider owned by each Session, disables mutation during a turn or
switch, and reconciles all session shells from the authoritative switch event. Provider-specific
model/config/capability/context state is cleared before the selected provider's new state is
published.

Rollback is a revert of the switch command, Core transition, continuation projection, callback
fence, desktop reconciliation, and tests. Existing databases need no schema migration.

### Acceptance criteria

- [x] AC-1: An idle durable conversation switches providers in place, persists the new provider,
  clears the old ACP cursor/model, and keeps the Session id, transcript, policies, and workspace.
- [x] AC-2: The first turn on the new provider receives a bounded provider-neutral continuation,
  never attempts the old provider cursor, excludes reasoning/raw tool output, and clears the
  one-shot context after success.
- [x] AC-3: Running, awaiting-input, Task-leased, unavailable, failed-startup, and concurrent/racing
  switch paths fail safely while the original provider remains authoritative and usable.
- [x] AC-4: Focused and background desktop panes show the durable Session provider, lock the picker
  during unsafe states, and reset/repopulate provider-owned model, config, capability, goal, and
  context projections from Core events.
- [x] AC-5: Focused Core, plugin, rendered picker, renderer build, documentation, lifecycle, and
  worktree checks pass with actual evidence.
- [x] AC-6: An opt-in live canary starts with a durable user message and provider reply, then keeps
  that non-empty Session and recalls an unpredictable continuity key while switching across at
  least three locally authenticated real providers; every built-in named by the headless runner
  maps to its actual registry identity, and structured provider error data exposes an actionable
  cause without raw request metadata.

## Decision and gates

The user's direct implementation request accepts Intent and Spec for local implementation and
verification. Provider switching is medium risk because it changes runtime ownership and durable
session identity, but it does not change workspace files or database schema. Merge, release,
deployment, production mutation, and automatic provider failover remain separate human Gates.

## Plan

1. Add a durable compare-and-set provider transition and a bounded provider-neutral continuation
   projection.
2. Initialize a replacement ACP runtime before commit, serialize switches against turn starts,
   fence detached callbacks, and retain the original runtime on every pre-commit failure.
3. Expose the switch command and authoritative event, then reconcile Composer and per-pane state.
4. Exercise successful continuation, unsafe-state rejection, failed candidate rollback, stale
   callback fencing, rendered picker locking, and repository Gates.

## Build

Core now owns a serialized provider-switch transition. It starts and initializes a detached target
runtime, verifies the original runtime generation again, fences old callbacks, compare-and-sets
only the provider-owned durable fields, installs the replacement, and terminates the old process.
Prompt claims and queued plugin prompts reject while that transition owns the Session.

The one-shot continuation contains at most 48 Ki characters of canonical user messages,
assistant-visible text, plans, and tool title/status. It is newest-preserving, labels truncation,
never transfers the old ACP cursor, reasoning, tool inputs, or tool outputs, and places the current
user request after the historical context. Failed target startup, initialization, persistence, or
races reactivate the original callback fence and leave the original runtime authoritative.

Desktop and TUI consumers now reconcile the authoritative provider event. Desktop pane-local
configuration reads each durable Session provider, disables the picker while a turn or switch is
active, and clears provider-owned model/config/capability/goal/context projections before Core
repopulates them. Canvas retries remain in the same conversation after a successful switch.

The opt-in live canary drives the same Engine against locally authenticated real CLIs with an
in-memory Store and supports per-provider model selection. It writes a runtime-random continuity
key in the first user turn, asserts that both the user prompt and streamed provider reply are
durable before every switch, and requires each later provider to recover the key without receiving
it in the current prompt. Headless `exec` now maps its advertised Amp and Droid names to their
built-in registry identities. ACP error display extracts bounded provider-supplied `detail` text
from structured error data while omitting raw request metadata, so Droid's quota boundary is
actionable instead of collapsing to a generic internal error.

## Verification

Verdict: verified

The requested in-conversation provider-switch path and its safe failure boundaries meet the
acceptance criteria for local handoff. No merge or release is authorized.

### Acceptance evidence

- AC-1: PASS — `cargo test -p codetwo-core --test engine_provider_switch` passed five stdio integration tests; the success test retained the Session id, transcript, workspace, policy, creation time, and recency while persisting the new provider and clearing its old ACP cursor.
- AC-2: PASS — `cargo test -p codetwo-core` proved a fresh target `session/new`, ordered neutral history before the current prompt, excluded reasoning and raw tool secrets, enforced the 48 Ki character bound and newest-tail truncation, fenced detached callbacks, and cleared persisted continuation after the first successful target prompt.
- AC-3: PASS — `cargo test -p codetwo-core --test engine_provider_switch` passed awaiting-input rejection, missing-target rollback with a usable old provider, concurrent single-owner switching, and Task-lease rejection; the full `cargo test -p codetwo-core` command passed 488 unit tests and every Core integration suite.
- AC-4: PASS — `bun test tests/sceneChip.test.tsx tests/canvasDesktop.test.ts` passed 29 rendered/component tests, `cargo test -p codetwo-tui provider_change_reconciles_the_active_tui_shell` passed, and in-app Browser QA at `http://127.0.0.1:1420/` verified the C2 page, expandable provider menu, disabled-busy behavior, no framework overlay, and no console warnings or errors.
- AC-5: PASS — `bun run build:renderer`, `cargo check -p codetwo-plugins`, and `cargo check --workspace --all-targets` passed; `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, `bun script/verify/sdlc.ts --worktree`, and `git diff --check` also passed in the final Gate run.
- AC-6: PASS — `CODETWO_LIVE_SWITCH_PROVIDERS=codex,grok,cursor,codex cargo test -p codetwo-core --test engine_provider_switch live_providers_switch_in_place_and_back -- --ignored --nocapture` and the equivalent `opencode,kimi,opencode` run both passed after each pre-switch transcript durably contained the user prompt and streamed provider reply; every later real provider recovered a runtime-random continuity key available only in prior conversation content. `cargo test -p codetwo-core --example exec advertised_amp_and_droid_providers_use_builtin_identities` and `cargo test -p codetwo-core rpc_error_surfaces_structured_provider_detail_without_request_metadata` passed.

Residual risk: Provider-neutral continuation intentionally trades exact native state migration for
safe compatibility across unlike provider protocols; the bounded projection can omit old context,
and the target provider must rebuild its native state.

- Continuation is bounded by Unicode characters rather than each provider's tokenizer; a very long
  conversation intentionally drops the oldest context and may truncate the oldest retained record.
- Provider-native goals, config selectors, model state, tool sessions, and MCP session identity are
  intentionally reset instead of migrated. The selected provider rebuilds those projections.
- Active managed Task leases intentionally reject provider changes because their compatibility
  identity is fixed for the lease lifetime.
- This machine's OpenCode 2 installation requires authentication, and Droid reports that its
  weekly standard usage limit resets in one day. Both are external account readiness boundaries;
  the switch path now surfaces their actionable provider errors without raw request metadata.
- The repository-wide `cargo test -p codetwo-plugins` command has one stable unrelated baseline
  failure in `plugin_protocol::an_untrusted_bundle_that_ships_a_process_is_not_started` (expected
  Failed, observed Active). The changed plugin command compiles, workspace all-target checking
  passes, and the failing test is outside this Artifact's changed paths.

## Review and release

Approval: pending human product and code review after verification.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change bundle's Core, plugin, desktop, and test paths; no data migration is required.
No release: implementation and local verification do not authorize merge or release.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

No post-implementation feedback exists yet.
