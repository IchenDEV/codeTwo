---
id: "2026-08-30-plugin-connectors"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-30
based_on: intent.md
risk: high
approved_by: "chenli"
approved_at: "2026-08-30"
---

# Spec: Add connector contributions to the extension model

## Requirements

C2 Plugin Standard 1.2 adds host-rendered connector descriptors. A connector declares only a stable
bundle-local id, a provider identifier, one command owned by the same runtime, and the capabilities
that are implemented now. The host invokes that command with an operation and input; the
bundle owns provider-specific authentication and data access. Connector code cannot inject React or
HTML and cannot invoke another bundle's command.

The initial capabilities cover connection, conversations, documents, tables, messaging, and turn
notifications. The existing Feishu surface becomes the first provider adapter: it is discovered
through the descriptor rather than the bundle name, and all host calls pass through the connector
invocation command. A connector for another provider cannot be rendered by the Feishu adapter.
Only C2 Plugin Standard 1.2 bundles and installed records are accepted.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's direct implementation request approves this Intent and Spec, with chenli as the named
approver. The user later authorized PR #185 and explicitly authorized its merge on 2026-08-31.
No publication, deployment, or release is authorized.

## Acceptance criteria

- [x] AC-1: A valid 1.2 bundle can declare a connector whose command is statically declared by the same
      runtime; unknown capabilities, commands, fields, and duplicate ids fail closed.
- [x] AC-2: C2 accepts only Plugin Standard 1.2; 1.0 and 1.1 manifests and installed records fail closed.
- [x] AC-3: Installed bundle inventory, catalog counts, and desktop bridge expose connector
      descriptors without starting an untrusted runtime.
- [x] AC-4: Connector invocation verifies enabled/trusted state, contribution ownership, command ownership,
      and caller realm before dispatching `{ operation, input }`.
- [x] AC-5: The desktop discovers the Feishu collaboration surface from an active connector and contains no
      plugin-name check or direct `feishu.*` command call for that surface.
- [x] AC-6: The community Feishu bundle declares the connector and implements its single operation dispatcher
      as its only public runtime command.
- [x] AC-7: Before Feishu authorization, the rail shows no contact, document, or Base groups; it presents
      only a concise sign-in prompt whose action opens the Feishu bundle's plugin settings.
- [x] AC-8: Feishu app setup and account authorization live in the Feishu plugin details rather than the
      collaboration workspace; successful authorization restores the existing resource directory.
- [ ] AC-9: The authorization boundary is covered in English and Chinese and checked in the rendered desktop.
- [x] AC-10: Conversation messages render the sender display name and avatar resolved by the connector; internal
      Feishu identifiers appear only as a last-resort fallback when no user profile is available.
- [ ] AC-11: Focused Rust, renderer, community-plugin, build, SDLC, and real-window checks pass.

## Decision

The user's direct implementation request approves this Intent and Spec, with chenli as the named
approver. The user later authorized PR #185 and explicitly authorized its merge on 2026-08-31.
No publication, deployment, or release is authorized.
