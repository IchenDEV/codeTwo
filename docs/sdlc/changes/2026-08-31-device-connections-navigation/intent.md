---
id: "2026-08-31-device-connections-navigation"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-31
source: user-supplied C2 Dev appshots plus 2026-08-31 placement, phone-icon, and compact-toolbar follow-ups
risk: medium
approved_by: "userthe 2026-08-31 device-connections feedback and merge instruction"
approved_at: "2026-08-31"
---

# Intent: Make device connections discoverable from the main sidebar

## Problem

The desktop already implements remote pairing, paired-device management, and device sync, but the
main sidebar in the supplied appshot has no labeled device-connections destination. The only
general entry is a command-palette item named `Remote control`, while any plugin-contributed icon
does not communicate how to pair another C2 device. A user who has not memorized the command cannot
discover the connection flow.

The user directly requested a visible menu from the supplied running-app state. That request
accepts this Intent and its visible navigation outcome. The affected surface is the desktop main
sidebar and the existing remote modal opener. The pairing protocol, credentials, sync data model,
network listener, Plugin Manager policy, and Settings information architecture are unchanged.

## Proposed outcome

The desktop already implements remote pairing, paired-device management, and device sync, but the

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user supplied the failed visible state and explicitly asked where the connection menu is,
accepting a discoverable main-menu repair. Reusing the existing modal avoids a second pairing
surface or protocol path. The user's 2026-08-31 `pr` instruction authorized Draft PR #187 as the
human-review handoff, and the later `merge` instruction accepts the verified residual risk and
authorizes that PR's merge. It does not authorize release, deployment, or production mutation.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user supplied the failed visible state and explicitly asked where the connection menu is,
accepting a discoverable main-menu repair. Reusing the existing modal avoids a second pairing
surface or protocol path. The user's 2026-08-31 `pr` instruction authorized Draft PR #187 as the
human-review handoff, and the later `merge` instruction accepts the verified residual risk and
authorizes that PR's merge. It does not authorize release, deployment, or production mutation.
