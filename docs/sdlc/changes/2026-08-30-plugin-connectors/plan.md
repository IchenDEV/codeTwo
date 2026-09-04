---
id: "2026-08-30-plugin-connectors"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-30
based_on: spec.md
risk: high
scope: community/plugins/feishu, apps/desktop, crates/plugins, docs/reference/plugin-standard.md
approved_by: "chenli"
approved_at: "2026-08-30"
---

# Plan: Add connector contributions to the extension model

## Files and ownership

community/plugins/feishu, apps/desktop, crates/plugins, docs/reference/plugin-standard.md

## Order of work

Extend the manifest parser and installed model, add one ownership-checked connector invocation command,
project active descriptors into the renderer, migrate Feishu discovery and calls to that seam, and add
contract tests at the parser, runtime, bridge, and rendered-surface levels. Rollback removes the 1.2
descriptor support and restores the previous Feishu-specific host lookup.

For the authorization state, keep provider controls host-rendered but mount them only inside the owning
bundle's plugin details. The collaboration rail is a resource directory after authorization, not a
second setup surface.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

- Added the 1.2 manifest, installed-bundle, inventory, catalog, validation CLI,
  bridge, and localization contracts for connector contributions.
- Added `plugins.invoke_connector`, which checks bundle enablement and trust, contribution and command
  ownership, runtime realm, input shape, and capability-to-operation namespace before dispatching the
  standard `{ operation, input }` envelope.
- Moved the Feishu desktop surface to active connector discovery with `provider: feishu`; all
  provider calls now use standard operations through the connector facade.
- Updated the community Feishu bundle to C2 Plugin Standard 1.2 and version 0.3.0, removed its obsolete
  rail UI action, and reduced its public command surface to the connector dispatcher.
- Ponytail Full removed the one-value connector `kind`, unused label/description/order metadata,
  speculative reference/forwarding capabilities, per-connector policy components, and the redundant
  renderer-side enabled/trusted lookup and unused context payload. Bundle enablement remains the
  single product policy gate.
- Per the user's explicit instruction, removed C2 Plugin Standard 1.0/1.1 parsing and installed-record
  compatibility. Runtime commands and contribution arrays are now required installed data, and all
  checked-in C2 packs declare 1.2.
- Added a host-owned plugin-details extension point and moved Feishu app creation, account authorization,
  reauthorization, and disconnect controls into the owning community bundle's plugin details. The
  unauthorized rail and workspace now expose only a concise sign-in route and no resource groups.
- Extended the Feishu connector message result with `senderName` and `senderAvatarUrl`. The community
  adapter resolves every unique human sender in one Contacts batch, falls back to the basic-name batch
  when profile visibility blocks avatars, and leaves app/bot senders on the existing last-resort label.
  The desktop now uses that identity in the conversation, circular avatar, and Agent handoff prompt.

## Decision

The user's direct implementation request approves this Intent and Spec, with chenli as the named
approver. The user later authorized PR #185 and explicitly authorized its merge on 2026-08-31.
No publication, deployment, or release is authorized.
