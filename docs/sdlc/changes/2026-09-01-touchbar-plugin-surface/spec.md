---
id: "2026-09-01-touchbar-plugin-surface"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: intent.md
risk: medium
approved_by: "[user]"
approved_at: "2026-09-01"
---

# Spec: Project existing plugin UI actions to the Touch Bar

## Requirements

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

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's direct implementation request accepts this medium-risk Intent. The later full Ponytail
request replaces the earlier parallel `surfaces` design with reuse of the existing UI contribution
path. Codex owns implementation and verification. Merge, release, deployment, plugin publication,
and production mutation remain separate human Gates.

## Acceptance criteria

- [x] AC-1: Existing 1.2.0 UI contribution parsing accepts `host.actions`; no 1.3 standard, `surfaces` manifest field, surface Hub command, or surface event protocol remains.
- [x] AC-2: The generic controller discovers only enabled, trusted, policy-active `host.actions`, validates bounded documents, refreshes on existing events, and invokes the owning UI contribution with cached input.
- [x] AC-3: The AppKit adapter renders state and accessibility, returns taps, clears safely, disposes resources, and is unavailable off macOS; Core and the example bundle contain no Touch Bar or AppKit knowledge.
- [x] AC-4: The agent-session-monitor Runtime orders at most three session actions, uses only `sessions.summary` and `desktop.reveal_session`, and ships as a valid C2 1.2.0 bundle.
- [x] AC-5: Focused desktop, Rust parser, Runtime, and native adapter checks pass together with repository documentation and lifecycle Gates.

## Decision

The user's direct implementation request accepts this medium-risk Intent. The later full Ponytail
request replaces the earlier parallel `surfaces` design with reuse of the existing UI contribution
path. Codex owns implementation and verification. Merge, release, deployment, plugin publication,
and production mutation remain separate human Gates.
