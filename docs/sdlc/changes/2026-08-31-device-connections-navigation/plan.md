---
id: "2026-08-31-device-connections-navigation"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: medium
scope: apps/desktop
approved_by: "userthe 2026-08-31 device-connections feedback and merge instruction"
approved_at: "2026-08-31"
---

# Plan: Make device connections discoverable from the main sidebar

## Files and ownership

apps/desktop

## Order of work

1. Add a red-capable SessionRail rendering assertion for the missing labeled connection row.
2. Route an enabled-state boolean and opener from App into SessionRail, render one standard
   NavigationRow, and localize its label in English and Simplified Chinese.
3. Align the command-palette label with the visible menu and keep the existing component policy
   filter.
4. Run the focused UI test, renderer/design checks, SDLC contract check, and an isolated renderer
   interaction inspection.
5. Apply the user's follow-up by moving the row into the fixed utility group and changing its icon
   to a single phone; rerun the placement and rendered checks.
6. Apply the compact-toolbar reference by converting the stacked utility rows to icon-only buttons,
   preserving discoverability through tooltips and accessible names, and rerun rendered checks.

Rollback removes the sidebar prop/row and localization keys and restores the command label. No
stored data, credentials, protocol state, or migrations are changed.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

- Review handoff: [Draft PR #187](https://github.com/IchenDEV/codeTwo/pull/187).
- Added one standard NavigationRow to SessionRail's fixed lower-left utility group between Usage
  and Settings, using a single-phone icon and English/Simplified Chinese copy.
- Routed the live `remote.modal` component policy, open state, and existing RemoteModal opener from
  App into the rail. Narrow layouts close the overlay rail after selection.
- Renamed the command-palette action from developer-facing `Remote control` to the same localized
  `Device connections` label.
- Added rendered regression coverage for the enabled, clickable entry and the disabled-component
  absence path. No pairing, sync, credential, listener, or persistence code changed.
- Applied the user's first visual follow-up without changing the remote plugin policy, pairing
  protocol, or modal implementation.
- Replaced the three stacked utility rows with one 40px rendered toolbar. Settings and Usage use
  icon buttons in the leading cluster; Device connections remains a phone icon at the trailing edge.
- Added a shared module-level utility-button wrapper for tooltips, accessible labels, busy state,
  circular keyboard focus, and the blue selected treatment without adding new component state.
- Removed the rail-only provider logo, numeric quota meter, and visible labels from this compact
  surface; the full provider/window/remaining quota copy remains available through the Usage
  button's accessible label and tooltip.

## Decision

The user supplied the failed visible state and explicitly asked where the connection menu is,
accepting a discoverable main-menu repair. Reusing the existing modal avoids a second pairing
surface or protocol path. The user's 2026-08-31 `pr` instruction authorized Draft PR #187 as the
human-review handoff, and the later `merge` instruction accepts the verified residual risk and
authorizes that PR's merge. It does not authorize release, deployment, or production mutation.
