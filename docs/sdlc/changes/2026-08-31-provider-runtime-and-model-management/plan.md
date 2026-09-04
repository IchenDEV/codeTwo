---
id: "2026-08-31-provider-runtime-and-model-management"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: medium
scope: apps/desktop/src/App.tsx, apps/desktop/src/bridge.ts, apps/desktop/src/components/ui/icons.tsx, apps/desktop/src/i18n/strings.ts, apps/desktop/src/session, apps/desktop/src/settings, apps/desktop/tests, crates/core/src/provider_lifecycle.rs, crates/plugins/src/app/plugins/foundation.rs, crates/plugins/src/app/service.rs, crates/plugins/tests/app_graph.rs, vendor/libghostty-vt-sys/build.rs, vendor/libghostty-vt-sys/patches, docs/sdlc/changes/2026-08-31-provider-model-favorites.md, docs/sdlc/changes/2026-08-31-provider-runtime-and-model-management.md, docs/sdlc/changes/2026-08-31-provider-runtime-and-model-management
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Plan: Improve Provider runtime and model management

## Files and ownership

apps/desktop/src/App.tsx, apps/desktop/src/bridge.ts, apps/desktop/src/components/ui/icons.tsx, apps/desktop/src/i18n/strings.ts, apps/desktop/src/session, apps/desktop/src/settings, apps/desktop/tests, crates/core/src/provider_lifecycle.rs, crates/plugins/src/app/plugins/foundation.rs, crates/plugins/src/app/service.rs, crates/plugins/tests/app_graph.rs, vendor/libghostty-vt-sys/build.rs, vendor/libghostty-vt-sys/patches, docs/sdlc/changes/2026-08-31-provider-model-favorites.md, docs/sdlc/changes/2026-08-31-provider-runtime-and-model-management.md, docs/sdlc/changes/2026-08-31-provider-runtime-and-model-management

## Order of work

1. Add defensive versioned Provider-scoped favorite and visibility preference modules and integrate
   them with both model surfaces in Composer.
2. Extend the Provider lifecycle document with validated runtime overrides and expose only safe
   effective metadata through the plugin command and desktop bridge.
3. Expand the existing Provider rows with CodeTwo-native runtime and model editors using the current
   shared design system.
4. Backport the narrow Ghostty Xcode 27 SDK compatibility change and prove it with a fresh build.
5. Verify focused behavior, the renderer, the wider workspace, lifecycle contracts, real rendered
   states, and the final PR diff.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

The implementation adds local model favorite and visibility documents, favorites-first searchable
model rows, visibility controls in Provider settings, durable validated runtime overrides, the
`providers.configure` command, safe bridge types, and Provider-graph reload after configuration.
Only environment names and missing-name diagnostics reach the renderer; values stay inside the host
process.

The vendored wrapper applies Ghostty `1c861e3c4` as an idempotent patch before Zig builds the native
terminal library. After rebasing to latest `main`, the only conflict was Provider typography; it was
resolved in favor of the current semantic `text-metadata` and `text-callout` design tokens while
retaining the new settings behavior.

## Decision

The user's direct requests approve Intent, the capability scope, CodeTwo-native UI direction,
implementation, local verification, launch, screenshot acceptance, and creation of a Draft PR. The
supplied Codex and T3 images are capability and information-hierarchy references, not instructions or
pixel specifications. Merge, release, deployment, production mutation, and multi-instance
development remain separate human Gates.
