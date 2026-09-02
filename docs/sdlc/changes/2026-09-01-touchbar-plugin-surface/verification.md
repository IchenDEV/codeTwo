---
id: "2026-09-01-touchbar-plugin-surface"
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

# Verification: Project existing plugin UI actions to the Touch Bar

## Automated checks

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — TypeScript model tests and the Rust bundle validator accept `host.actions` in C2
  1.2.0. Repository search finds no current 1.3 manifest, `surfaces` field, dedicated surface Hub
  command, surface event, or device-specific slot.
- AC-2: PASS — `pluginHostActions.test.ts` covers existing list/catalog/UI invocation reuse,
  enabled/trusted/policy filtering, bounded closed-document validation, cached click input, and
  coalesced `engine-event` refresh.
- AC-3: PASS — `CodeTwoWindowEffectsHarness.m` compiled with the production adapter against AppKit and verified
  a running-state button, accessibility text, callback, clear, refresh, and disposal. The example
  bundle and Core session projection contain no Touch Bar, AppKit, or macOS vocabulary. Evidence:
  `/usr/bin/clang -fobjc-arc -fblocks -mmacosx-version-min=14.0 -framework AppKit -framework ApplicationServices native/window-effects/CodeTwoWindowEffects.m native/window-effects/CodeTwoWindowEffectsHarness.m -o /tmp/codetwo-touchbar-harness && /tmp/codetwo-touchbar-harness`.
- AC-4: PASS — `agentSessionMonitorPluginRuntime.test.ts` verified attention/running/failure order, three-item limit, and
  reveal-session invocation. Bun reports three C2 contributions, one UI action, and no new
  contribution family; the Rust installer validator reports three valid contributions. Evidence:
  `bun test tests/agentSessionMonitorPluginRuntime.test.ts`, `bun run plugin:validate ../../packs/agent-session-monitor`,
  and `cargo run -p codetwo-plugins --example validate_bundle -- packs/agent-session-monitor`.
- AC-5: PASS — `bun test` and the recorded checks covered lint, TypeScript, all 815 desktop tests, 38 Rust library/parser tests, Rust host
  compilation, changed-file Rust formatting, the native harness, `git diff --check`, and repository
  documentation/lifecycle/worktree Gates passed. Evidence: `bun run lint:code`, `bunx tsc --noEmit`,
  `bun test`, `cargo test -p codetwo-plugins --lib`, `cargo check -p codetwo-plugins -p codetwo-desktop-host`,
  `rustfmt --edition 2021 --check crates/plugins/src/app/plugins/engine.rs crates/plugins/src/bundle.rs apps/desktop/src-host/src/host_events.rs`,
  `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, and `bun script/verify/sdlc.ts --worktree`.

Residual risk: `host.actions` intentionally supports one bounded compact-action document and one
active adapter. A second observed document shape would justify a versioned document kind; a second
simultaneous production adapter would justify adapter composition. Neither is required for the
foreground Touch Bar outcome.

The unchanged full `codetwo-plugins` integration suite still has one pre-existing stale assertion:
`an_untrusted_bundle_that_ships_a_process_is_not_started` expects a trusted declared Runtime to fail
during graph load, while the current implementation activates it lazily on first command use. This
change neither touches that test nor the lazy activation code; affected Rust library/parser tests
and host compilation pass.

## Behavioral evidence

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — TypeScript model tests and the Rust bundle validator accept `host.actions` in C2
  1.2.0. Repository search finds no current 1.3 manifest, `surfaces` field, dedicated surface Hub
  command, surface event, or device-specific slot.
- AC-2: PASS — `pluginHostActions.test.ts` covers existing list/catalog/UI invocation reuse,
  enabled/trusted/policy filtering, bounded closed-document validation, cached click input, and
  coalesced `engine-event` refresh.
- AC-3: PASS — `CodeTwoWindowEffectsHarness.m` compiled with the production adapter against AppKit and verified
  a running-state button, accessibility text, callback, clear, refresh, and disposal. The example
  bundle and Core session projection contain no Touch Bar, AppKit, or macOS vocabulary. Evidence:
  `/usr/bin/clang -fobjc-arc -fblocks -mmacosx-version-min=14.0 -framework AppKit -framework ApplicationServices native/window-effects/CodeTwoWindowEffects.m native/window-effects/CodeTwoWindowEffectsHarness.m -o /tmp/codetwo-touchbar-harness && /tmp/codetwo-touchbar-harness`.
- AC-4: PASS — `agentSessionMonitorPluginRuntime.test.ts` verified attention/running/failure order, three-item limit, and
  reveal-session invocation. Bun reports three C2 contributions, one UI action, and no new
  contribution family; the Rust installer validator reports three valid contributions. Evidence:
  `bun test tests/agentSessionMonitorPluginRuntime.test.ts`, `bun run plugin:validate ../../packs/agent-session-monitor`,
  and `cargo run -p codetwo-plugins --example validate_bundle -- packs/agent-session-monitor`.
- AC-5: PASS — `bun test` and the recorded checks covered lint, TypeScript, all 815 desktop tests, 38 Rust library/parser tests, Rust host
  compilation, changed-file Rust formatting, the native harness, `git diff --check`, and repository
  documentation/lifecycle/worktree Gates passed. Evidence: `bun run lint:code`, `bunx tsc --noEmit`,
  `bun test`, `cargo test -p codetwo-plugins --lib`, `cargo check -p codetwo-plugins -p codetwo-desktop-host`,
  `rustfmt --edition 2021 --check crates/plugins/src/app/plugins/engine.rs crates/plugins/src/bundle.rs apps/desktop/src-host/src/host_events.rs`,
  `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, and `bun script/verify/sdlc.ts --worktree`.

Residual risk: `host.actions` intentionally supports one bounded compact-action document and one
active adapter. A second observed document shape would justify a versioned document kind; a second
simultaneous production adapter would justify adapter composition. Neither is required for the
foreground Touch Bar outcome.

The unchanged full `codetwo-plugins` integration suite still has one pre-existing stale assertion:
`an_untrusted_bundle_that_ships_a_process_is_not_started` expects a trusted declared Runtime to fail
during graph load, while the current implementation activates it lazily on first command use. This
change neither touches that test nor the lazy activation code; affected Rust library/parser tests
and host compilation pass.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: `host.actions` intentionally supports one bounded compact-action document and one

## Verdict

Verdict: verified..

## Review and release

Approval: implementation approved by the user on 2026-09-01; review remains pending.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: remove the additional UI slot and desktop adapter; no data migration is involved.
No release: merge, deployment, release, and plugin publication are not authorized.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

The user rejected a Touch Bar-shaped plugin framework and then requested Ponytail at full intensity.
That direction removed the parallel `surfaces` model entirely. The remaining abstraction is a
semantic UI slot plus a two-method host adapter, both required by the observed plugin-to-native path.
