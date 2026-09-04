---
id: "2026-09-01-touchbar-plugin-surface"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: spec.md
risk: medium
scope: apps/desktop/native/window-effects, apps/desktop/src-host/src, apps/desktop/src/electrobun, apps/desktop/src/pluginModel.ts, apps/desktop/src/bridge.ts, apps/desktop/src/plugins, apps/desktop/src/App.tsx, apps/desktop/tests, crates/plugins/src/app/plugins/engine.rs, crates/plugins/src/bundle.rs, packs/agent-session-monitor, docs/reference, docs/sdlc/changes/2026-09-01-touchbar-plugin-surface
approved_by: "[user]"
approved_at: "2026-09-01"
---

# Plan: Project existing plugin UI actions to the Touch Bar

## Files and ownership

apps/desktop/native/window-effects, apps/desktop/src-host/src, apps/desktop/src/electrobun, apps/desktop/src/pluginModel.ts, apps/desktop/src/bridge.ts, apps/desktop/src/plugins, apps/desktop/src/App.tsx, apps/desktop/tests, crates/plugins/src/app/plugins/engine.rs, crates/plugins/src/bundle.rs, packs/agent-session-monitor, docs/reference, docs/sdlc/changes/2026-09-01-touchbar-plugin-surface

## Order of work

1. Add only `host.actions` to the existing UI slot contract and keep C2 Plugin Standard at 1.2.0.
2. Reuse existing plugin list, catalog, UI invocation, and engine/plugin change events in a small
   desktop controller with a two-method adapter seam.
3. Keep AppKit and `NSTouchBar` inside the macOS adapter; expose only redacted session summary and
   reveal-session capabilities to the example Runtime.
4. Validate the focused call path, native harness, bundle, and repository Gates.

Rollback removes the additional UI slot, example plugin, compact-action controller, native adapter,
and two extension-public commands. No persisted user data or plugin record migration is involved.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

The first implementation introduced C2 Plugin Standard 1.3.0, a `surfaces` contribution family,
two Hub commands, a dedicated typed event, Rust document types, catalog counts, policy identities,
and parallel TypeScript models. Full Ponytail review found no second consumer or document shape that
justified that framework.

The replacement reuses the existing C2 1.2.0 `ui` contribution with the semantic `host.actions`
slot. The controller reuses `plugins.list`, `plugins.catalog`, `plugins.invoke_ui`, `engine-event`,
and `plugins-changed`; document validation is local to the one host adapter boundary. The
agent-session-monitor bundle contains only generic action vocabulary and the AppKit code remains in
the macOS host.

## Decision

The user's direct implementation request accepts this medium-risk Intent. The later full Ponytail
request replaces the earlier parallel `surfaces` design with reuse of the existing UI contribution
path. Codex owns implementation and verification. Merge, release, deployment, plugin publication,
and production mutation remain separate human Gates.
