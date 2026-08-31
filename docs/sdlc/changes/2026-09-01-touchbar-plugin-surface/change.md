---
id: change-2026-09-01-touchbar-plugin-surface
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: [user]
approved_at: 2026-09-01
created: 2026-09-01
updated: 2026-09-01
source: user request on 2026-09-01 for a foreground-only Touch Bar plugin, followed by explicit direction to keep the plugin framework target-neutral and apply Ponytail at full intensity
inputs: C2 Plugin Standard 1.2.0 UI contributions, process Runtime commands, desktop host events, AppKit NSTouchBar
outputs: one target-neutral host.actions UI slot, a generic compact-action controller, a macOS Touch Bar adapter, and an installable agent-session-monitor plugin
scope: apps/desktop/native/window-effects, apps/desktop/src-host/src, apps/desktop/src/electrobun, apps/desktop/src/pluginModel.ts, apps/desktop/src/bridge.ts, apps/desktop/src/plugins, apps/desktop/src/App.tsx, apps/desktop/tests, crates/plugins/src/app/plugins/engine.rs, crates/plugins/src/bundle.rs, packs/agent-session-monitor, docs/reference, docs/sdlc/changes/2026-09-01-touchbar-plugin-surface
next_trigger: human review and an explicit merge or release decision
verification_mode: owner
verified_by: codex
verified_at: 2026-09-01
---

# Project existing plugin UI actions to the Touch Bar

## Intent

C2 should show agent-session actions on the public macOS Touch Bar while C2 is foreground. Session
selection, ordering, labels, and actions remain owned by an installable plugin. Core must not know
about AppKit, Touch Bar, windows, or a particular bundle.

The implementation must reuse the existing plugin model wherever it already satisfies the need. It
does not add cross-application persistence, private macOS APIs, arbitrary plugin renderer code,
direct SQLite reads, approval actions, or a universal UI document language.

## Spec

C2 Plugin Standard 1.2.0 gains one target-neutral `ui` slot, `host.actions`. This is a new value in
the existing UI contribution field, not a new contribution family or standard version. Discovery,
trust, enablement, component policy, command ownership, Runtime activation, and invocation continue
through `plugins.list`, `plugins.catalog`, and `plugins.invoke_ui`.

A `host.actions` command receives `context.operation` equal to `render` or `invoke`. `render`
returns at most eight semantic actions. The desktop controller rejects unknown fields, markup,
invalid ids, duplicate ids, unsupported states, oversized text, non-object input, and input larger
than 4 KiB before an adapter sees the document. It caches item input and uses the existing owned UI
invocation path for clicks. Existing `engine-event` and `plugins-changed` events trigger a debounced
refresh; there is no surface-specific event protocol.

The desktop host publishes only a `desktop-host-actions` capability marker and the narrow
`desktop.reveal_session` command. The engine publishes a redacted, read-only `sessions.summary`.
The generic controller depends on `HostActionAdapter.render(items)` and `dispose()`. Its macOS
implementation alone imports FFI and maps semantic state to public `NSTouchBar` controls.

### Acceptance criteria

- [x] AC-1: Existing 1.2.0 UI contribution parsing accepts `host.actions`; no 1.3 standard, `surfaces` manifest field, surface Hub command, or surface event protocol remains.
- [x] AC-2: The generic controller discovers only enabled, trusted, policy-active `host.actions`, validates bounded documents, refreshes on existing events, and invokes the owning UI contribution with cached input.
- [x] AC-3: The AppKit adapter renders state and accessibility, returns taps, clears safely, disposes resources, and is unavailable off macOS; Core and the example bundle contain no Touch Bar or AppKit knowledge.
- [x] AC-4: The agent-session-monitor Runtime orders at most three session actions, uses only `sessions.summary` and `desktop.reveal_session`, and ships as a valid C2 1.2.0 bundle.
- [x] AC-5: Focused desktop, Rust parser, Runtime, and native adapter checks pass together with repository documentation and lifecycle Gates.

## Decision and gates

The user's direct implementation request accepts this medium-risk Intent. The later full Ponytail
request replaces the earlier parallel `surfaces` design with reuse of the existing UI contribution
path. Codex owns implementation and verification. Merge, release, deployment, plugin publication,
and production mutation remain separate human Gates.

## Plan

1. Add only `host.actions` to the existing UI slot contract and keep C2 Plugin Standard at 1.2.0.
2. Reuse existing plugin list, catalog, UI invocation, and engine/plugin change events in a small
   desktop controller with a two-method adapter seam.
3. Keep AppKit and `NSTouchBar` inside the macOS adapter; expose only redacted session summary and
   reveal-session capabilities to the example Runtime.
4. Validate the focused call path, native harness, bundle, and repository Gates.

Rollback removes the additional UI slot, example plugin, compact-action controller, native adapter,
and two extension-public commands. No persisted user data or plugin record migration is involved.

## Build

The first implementation introduced C2 Plugin Standard 1.3.0, a `surfaces` contribution family,
two Hub commands, a dedicated typed event, Rust document types, catalog counts, policy identities,
and parallel TypeScript models. Full Ponytail review found no second consumer or document shape that
justified that framework.

The replacement reuses the existing C2 1.2.0 `ui` contribution with the semantic `host.actions`
slot. The controller reuses `plugins.list`, `plugins.catalog`, `plugins.invoke_ui`, `engine-event`,
and `plugins-changed`; document validation is local to the one host adapter boundary. The
agent-session-monitor bundle contains only generic action vocabulary and the AppKit code remains in
the macOS host.

## Verification

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
- AC-5: PASS — `bun test` and the recorded checks covered lint, TypeScript, all 797 desktop tests, 38 Rust library/parser tests, Rust host
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
