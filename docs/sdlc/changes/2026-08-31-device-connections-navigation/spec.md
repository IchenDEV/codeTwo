---
id: "2026-08-31-device-connections-navigation"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: intent.md
risk: medium
approved_by: "userthe 2026-08-31 device-connections feedback and merge instruction"
approved_at: "2026-08-31"
---

# Spec: Make device connections discoverable from the main sidebar

## Requirements

The main sidebar's fixed lower-left utility area is a single horizontal icon toolbar rather than
stacked labeled rows. Settings and Usage form a compact leading cluster; when the built-in remote
modal component is enabled, Device connections is anchored at the trailing edge with a
single-phone icon. Each button keeps a localized accessible name, hover tooltip, standard pointer
and keyboard behavior, and a visible focus treatment. Device connections uses a circular selected
state while its modal is open. Activating it opens the existing device-connections modal.

When the remote component is disabled in Plugins, the row is absent along with the component's
command and modal; Plugin Manager remains the recovery surface. This preserves the current plugin
lifecycle contract and does not present a dead connection affordance.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user supplied the failed visible state and explicitly asked where the connection menu is,
accepting a discoverable main-menu repair. Reusing the existing modal avoids a second pairing
surface or protocol path. The user's 2026-08-31 `pr` instruction authorized Draft PR #187 as the
human-review handoff, and the later `merge` instruction accepts the verified residual risk and
authorizes that PR's merge. It does not authorize release, deployment, or production mutation.

## Acceptance criteria

- [x] AC-1: The fixed lower-left utility group uses one horizontal icon-toolbar row instead of stacked
      labeled rows, reducing its vertical footprint.
- [x] AC-2: Settings and Usage remain available in the leading cluster; Device connections is anchored
      at the trailing edge when `remote.modal` is enabled.
- [x] AC-3: Every utility icon has a localized accessible name, tooltip, keyboard focus treatment, and a
      minimum standard control hit area.
- [x] AC-4: Device connections uses a circular selected state while its modal is open without inventing
      notification or connection-status dots.
- [x] AC-5: With `remote.modal` enabled, the main sidebar includes Device connections in the fixed
      lower-left utility group, not the upper feature group.
- [x] AC-6: Activating the row invokes the existing device-connections modal opener by pointer or
      keyboard-compatible button semantics.
- [x] AC-7: With `remote.modal` disabled, the row is not rendered and no dead affordance remains.
- [x] AC-8: The existing command-palette entry uses the same user-facing `Device connections` name.
- [x] AC-9: The lower-left entry uses a single-phone icon rather than the computer-and-phone sync icon.
- [x] AC-10: Focused rendered tests, renderer/design validation, SDLC validation, and isolated real UI
      inspection pass.

## Decision

The user supplied the failed visible state and explicitly asked where the connection menu is,
accepting a discoverable main-menu repair. Reusing the existing modal avoids a second pairing
surface or protocol path. The user's 2026-08-31 `pr` instruction authorized Draft PR #187 as the
human-review handoff, and the later `merge` instruction accepts the verified residual risk and
authorizes that PR's merge. It does not authorize release, deployment, or production mutation.
