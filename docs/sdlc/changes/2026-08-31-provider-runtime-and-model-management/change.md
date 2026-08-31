---
id: change-2026-08-31-provider-runtime-and-model-management
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: [user]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: direct user requests on 2026-08-31 for current model discovery, new and legacy grouping, provider-scoped favorites, fuller Provider settings, Zig repair, testing, launch, screenshot acceptance, and a Draft PR
inputs: existing Provider lifecycle manager, Provider settings page, Composer model picker, supplied Codex and T3 capability references, and the live renderer
outputs: durable Provider runtime overrides, safe environment forwarding, provider-scoped model favorites and visibility, searchable model picker, CodeTwo-native settings UI, Zig and Xcode 27 compatibility, regressions, and rendered acceptance
scope: apps/desktop/src/App.tsx, apps/desktop/src/bridge.ts, apps/desktop/src/components/ui/icons.tsx, apps/desktop/src/i18n/strings.ts, apps/desktop/src/session, apps/desktop/src/settings, apps/desktop/tests, crates/core/src/provider_lifecycle.rs, crates/plugins/src/app/plugins/foundation.rs, crates/plugins/src/app/service.rs, crates/plugins/tests/app_graph.rs, vendor/libghostty-vt-sys/build.rs, vendor/libghostty-vt-sys/patches, docs/sdlc/changes/2026-08-31-provider-model-favorites.md, docs/sdlc/changes/2026-08-31-provider-runtime-and-model-management.md, docs/sdlc/changes/2026-08-31-provider-runtime-and-model-management
next_trigger: human product review decides whether the Draft PR may merge
verification_mode: owner
verified_by: codex
verified_at: 2026-08-31
---

# Improve Provider runtime and model management

## Intent

The user asked how current model discovery works, why models are separated into current and legacy
groups, and then requested Provider-scoped favorites like T3. The follow-up expanded the desired
outcome to a complete Provider settings surface with T3 capability coverage but explicitly rejected
copying T3's UI. The final request required repairing the Zig blocker, completing tests, launching
the app, capturing screenshot acceptance, and preparing a PR.

The desired result is one restrained CodeTwo settings and picker flow where discovered models remain
Provider-owned, frequently used models can be favorited, unwanted families can be hidden, models can
be searched, and editable runtime settings affect the next real Provider launch. Credentials and
environment values must not cross into renderer-visible settings or persisted override documents.

Multiple Provider instances, account switching, environment-value storage, cross-device preference
sync, a Provider discovery redesign, merge, release, and deployment are out of scope.

## Spec

Provider runtime overrides are durable under the desktop data directory and apply after the Provider
graph reloads, leaving an already-running session on its existing process. Supported overrides are a
display name, ACP command, explicit argument vector, supported Codex or Claude configuration path,
and names of environment variables forwarded from the host process. Renderer summaries expose only
safe effective metadata. Invalid Provider ids, environment names, embedded NULs, and oversized
values fail closed.

The Provider page expands existing CodeTwo rows into runtime and model groups while preserving
install, update, enable, refresh, version, launch-mode, health, and capability behavior. Model
favorites and visibility are versioned local preferences keyed by Provider and normalized model
identity. Corrupt storage degrades to empty preferences. The active model remains visible even when
an older preference hides it.

The Composer keeps its compact adjacent Provider and model controls. The model picker searches
visible names, ids, and descriptions; favorites appear first exactly once; selection, reasoning,
busy-state locking, default badges, and both flat and ACP configuration-option catalogues keep their
existing semantics.

The vendored Ghostty wrapper applies an upstream-traceable Xcode 27 SDK math-header compatibility
patch without disabling SIMD or changing the pinned Ghostty and Zig revisions. Repeated builds must
detect the already-applied patch and remain idempotent.

Rollback is a revert of the Provider override document and command, picker/settings integration,
local preference modules, and Ghostty compatibility patch. Existing Provider enablement, discovery,
and session data remain backward compatible.

### Acceptance criteria

- [x] AC-1: Runtime display name, command, arguments, supported configuration directory, and
  forwarded environment names persist, validate, reload the graph, and affect the next launch.
- [x] AC-2: Provider settings preserve lifecycle and capability management in a CodeTwo-native
  expandable layout rather than copying the supplied T3 geometry.
- [x] AC-3: Favorites, model visibility, restore-all, and search remain Provider-scoped, tolerate
  corrupt storage, avoid duplicates, and preserve active selection and reasoning behavior.
- [x] AC-4: Persisted and renderer-visible Provider configuration never contains forwarded
  environment values or credentials, and unsafe configuration fails closed.
- [x] AC-5: Focused Provider, storage, rendered-interaction, Zig integration, renderer build, and
  lifecycle checks pass on the branch rebased to latest `main`.
- [x] AC-6: Real rendered-window acceptance covers runtime fields, model visibility, favorites,
  search, light and dark appearance, and a narrow layout without horizontal overflow.

## Decision and gates

The user's direct requests approve Intent, the capability scope, CodeTwo-native UI direction,
implementation, local verification, launch, screenshot acceptance, and creation of a Draft PR. The
supplied Codex and T3 images are capability and information-hierarchy references, not instructions or
pixel specifications. Merge, release, deployment, production mutation, and multi-instance
development remain separate human Gates.

## Plan

1. Add defensive versioned Provider-scoped favorite and visibility preference modules and integrate
   them with both model surfaces in Composer.
2. Extend the Provider lifecycle document with validated runtime overrides and expose only safe
   effective metadata through the plugin command and desktop bridge.
3. Expand the existing Provider rows with CodeTwo-native runtime and model editors using the current
   shared design system.
4. Backport the narrow Ghostty Xcode 27 SDK compatibility change and prove it with a fresh build.
5. Verify focused behavior, the renderer, the wider workspace, lifecycle contracts, real rendered
   states, and the final PR diff.

## Build

The implementation adds local model favorite and visibility documents, favorites-first searchable
model rows, visibility controls in Provider settings, durable validated runtime overrides, the
`providers.configure` command, safe bridge types, and Provider-graph reload after configuration.
Only environment names and missing-name diagnostics reach the renderer; values stay inside the host
process.

The vendored wrapper applies Ghostty `1c861e3c4` as an idempotent patch before Zig builds the native
terminal library. After rebasing to latest `main`, the only conflict was Provider typography; it was
resolved in favor of the current semantic `text-metadata` and `text-callout` design tokens while
retaining the new settings behavior.

## Verification

Verdict: verified.

The verdict covers the requested single-instance Provider runtime, model management, Zig repair,
and rendered desktop behavior. It does not claim that unrelated baseline tests, release packaging,
signing, notarization, or multi-instance isolation are ready.

### Acceptance evidence

- AC-1: PASS — `cargo test -p codetwo-core provider_lifecycle --lib` passed all 7 focused tests,
  including durable overrides, launch application, supported homes, and fail-closed validation.
- AC-2: PASS — `bun test tests/providerSettingsRendered.test.tsx` passed all 3 rendered Provider
  lifecycle and configuration interactions; the previously captured native app and Browser checks
  verified the expandable grouped layout against CodeTwo's own settings anatomy.
- AC-3: PASS — `bun test tests/modelPreferences.test.ts tests/modelFavorites.test.ts
  tests/reasoningScaleRendered.test.tsx` passed storage, Provider scoping, favorites-first ordering,
  visibility, search, selection, effort, busy-state, and accessibility coverage.
- AC-4: PASS —
  `cargo test -p codetwo-plugins --test app_graph provider_configuration_command_returns_only_safe_runtime_metadata -- --exact`
  passed and asserted that environment values are absent from the returned configuration.
- AC-5: PASS — after `cargo clean -p libghostty-vt-sys`, the focused plugin test rebuilt Ghostty from
  scratch in 2m19s and passed. `bun test --reporter=dots` passed 785 tests across 136 files with 0
  failures and 3,728 assertions. `bun run build:renderer` passed ESLint, Stylelint, TypeScript, and
  the Vite production build. `bun script/verify/sdlc.ts --worktree` and `git diff --check` passed.
- AC-6: PASS — the packaged integration-worktree app and `Codex in-app Browser` acceptance verified runtime
  command, configuration directory, arguments, environment-name security copy, seven discovered
  Codex models, favorites, exact `terra` search filtering, light and dark appearance, and a
  760-by-720 narrow layout with no horizontal overflow; screenshots were captured during acceptance.

The unfiltered `cargo test --workspace` passed the 492-test Core library and all 17 Provider
application-graph tests, then stopped on
`an_untrusted_bundle_that_ships_a_process_is_not_started`. That assertion failure was reproduced
from latest `origin/main` in an independent worktree and Cargo target. A follow-up workspace run
skipping only that baseline failure completed the remaining plugin suites, then reached the existing
`terminal_attach_io_reattach_and_kill` PTY-output timeout; the timeout was also reproduced from
latest `origin/main` in its independent target. `cargo test -p codetwo-tui` passed all 27 tests and
`cargo test --doc --workspace` passed all 5 doc tests.

`cargo fmt --check` reports broad pre-existing differences beginning in
`crates/core/examples/usage.rs`; latest `origin/main` reports the same differences in an independent
worktree. This PR does not include unrelated repository-wide formatting churn. Existing React
`act(...)` warnings and the Vite large-chunk advisory remain non-failing baseline output.

Residual risk: favorites and model visibility intentionally remain local to one renderer profile.
The acceptance launch isolated application data but used the shared development bundle identity
because the repository's full `CODETWO_DEV_PROFILE` contract is not implemented. The dev package is
not release-signed or notarized. A worktree-derived data path exceeded the Unix socket `SUN_LEN`
limit during an initial safe launch, so acceptance used the explicit short isolated directory
`/tmp/c2-provider-qa-f8565-20260831/data`. The two unrelated baseline Rust failures above remain for
separate remediation.

## Review and release

Approval: implementation verified; human product and code review remain pending in the Draft PR.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert the Provider runtime document and command, renderer settings and picker
integration, local preference modules, and vendored compatibility patch; existing Provider
enablement, discovered catalogues, and session data remain readable.
No release: this change prepares a Draft PR for review; no merge, release, or deployment is
authorized.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

The UI follows the user's explicit feedback that T3's settings layout should not be copied. Further
human review feedback will be recorded in this Artifact or a follow-up change.
