---
id: "2026-09-01-mid-conversation-provider-switching"
stage: verification
schema: 3
status: passed
owner: codex
created: 2026-09-01
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "codex"
verified_at: "2026-09-01"
release_target: none
release_identity: "not applicable until released."
---

# Verification: Continue one conversation across providers

## Automated checks

Verdict: verified

The requested in-conversation provider-switch path and its safe failure boundaries meet the
acceptance criteria for local handoff. No merge or release is authorized.

### Acceptance evidence

- AC-1: PASS — `cargo test -p codetwo-core --test engine_provider_switch` passed five stdio integration tests; the success test retained the Session id, transcript, workspace, policy, creation time, and recency while persisting the new provider and clearing its old ACP cursor.
- AC-2: PASS — `cargo test -p codetwo-core` proved a fresh target `session/new`, ordered neutral history before the current prompt, excluded reasoning and raw tool secrets, enforced the 48 Ki character bound and newest-tail truncation, fenced detached callbacks, and cleared persisted continuation after the first successful target prompt.
- AC-3: PASS — `cargo test -p codetwo-core --test engine_provider_switch` passed awaiting-input rejection, missing-target rollback with a usable old provider, concurrent single-owner switching, and Task-lease rejection; the full `cargo test -p codetwo-core` command passed 488 unit tests and every Core integration suite.
- AC-4: PASS — `bun test tests/sceneChip.test.tsx tests/canvasDesktop.test.ts` passed 31 rendered/component tests, including the unified picker's disabled-busy behavior; `cargo test -p codetwo-tui provider_change_reconciles_the_active_tui_shell` passed. In-app Browser QA against the isolated renderer at `http://127.0.0.1:1420/` verified the C2 page identity, meaningful first render, expandable unified provider/model menu, no framework overlay, and no console warnings or errors.
- AC-5: PASS — `bun run build:renderer`, `cargo check -p codetwo-plugins`, and `cargo check --workspace --all-targets` passed; `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, `bun script/verify/sdlc.ts --worktree`, and `git diff --check` also passed in the final Gate run.
- AC-6: PASS — after merging current `origin/main`, `CODETWO_LIVE_SWITCH_PROVIDERS=codex,grok,cursor,codex cargo test -p codetwo-core --test engine_provider_switch live_providers_switch_in_place_and_back -- --ignored --nocapture` and the equivalent `opencode,kimi,opencode` run both passed after each pre-switch transcript durably contained the user prompt and streamed provider reply; every later real provider recovered a runtime-random continuity key available only in prior conversation content. `cargo test -p codetwo-core --example exec advertised_amp_and_droid_providers_use_builtin_identities` and `cargo test -p codetwo-core rpc_error_surfaces_structured_provider_detail_without_request_metadata` passed.

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

## Behavioral evidence

Verdict: verified

The requested in-conversation provider-switch path and its safe failure boundaries meet the
acceptance criteria for local handoff. No merge or release is authorized.

### Acceptance evidence

- AC-1: PASS — `cargo test -p codetwo-core --test engine_provider_switch` passed five stdio integration tests; the success test retained the Session id, transcript, workspace, policy, creation time, and recency while persisting the new provider and clearing its old ACP cursor.
- AC-2: PASS — `cargo test -p codetwo-core` proved a fresh target `session/new`, ordered neutral history before the current prompt, excluded reasoning and raw tool secrets, enforced the 48 Ki character bound and newest-tail truncation, fenced detached callbacks, and cleared persisted continuation after the first successful target prompt.
- AC-3: PASS — `cargo test -p codetwo-core --test engine_provider_switch` passed awaiting-input rejection, missing-target rollback with a usable old provider, concurrent single-owner switching, and Task-lease rejection; the full `cargo test -p codetwo-core` command passed 488 unit tests and every Core integration suite.
- AC-4: PASS — `bun test tests/sceneChip.test.tsx tests/canvasDesktop.test.ts` passed 31 rendered/component tests, including the unified picker's disabled-busy behavior; `cargo test -p codetwo-tui provider_change_reconciles_the_active_tui_shell` passed. In-app Browser QA against the isolated renderer at `http://127.0.0.1:1420/` verified the C2 page identity, meaningful first render, expandable unified provider/model menu, no framework overlay, and no console warnings or errors.
- AC-5: PASS — `bun run build:renderer`, `cargo check -p codetwo-plugins`, and `cargo check --workspace --all-targets` passed; `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, `bun script/verify/sdlc.ts --worktree`, and `git diff --check` also passed in the final Gate run.
- AC-6: PASS — after merging current `origin/main`, `CODETWO_LIVE_SWITCH_PROVIDERS=codex,grok,cursor,codex cargo test -p codetwo-core --test engine_provider_switch live_providers_switch_in_place_and_back -- --ignored --nocapture` and the equivalent `opencode,kimi,opencode` run both passed after each pre-switch transcript durably contained the user prompt and streamed provider reply; every later real provider recovered a runtime-random continuity key available only in prior conversation content. `cargo test -p codetwo-core --example exec advertised_amp_and_droid_providers_use_builtin_identities` and `cargo test -p codetwo-core rpc_error_surfaces_structured_provider_detail_without_request_metadata` passed.

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

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: Provider-neutral continuation intentionally trades exact native state migration for

## Verdict

Verdict: verified.

## Review and release

Approval: [user] approved on 2026-09-01. human product and code review after verification.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change bundle's Core, plugin, desktop, and test paths; no data migration is required.
No release: implementation and local verification do not authorize merge or release.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

No post-implementation feedback exists yet.
