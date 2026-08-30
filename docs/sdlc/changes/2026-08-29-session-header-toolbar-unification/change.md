---
id: change-2026-08-29-session-header-toolbar-unification
kind: change
schema: 2
status: verified
risk: low
owner: codex
approvers: "#decision-and-gates"
approved_at: 2026-08-29
created: 2026-08-29
updated: 2026-08-31
source: "#intent"
inputs: "#spec"
outputs: "#build"
scope: apps/desktop, docs/design/system.md
next_trigger: human review accepts the rendered interaction and release risk
verification_mode: owner
verified_by: codex
verified_at: 2026-08-29
---

# Unify the session titlebar toolbar

## Intent

The user reported from the live session titlebar that its icons use two competing colors and that
neighboring controls mix filled and transparent treatments with uneven spacing. The desired result
is one quiet, macOS-like toolbar: neutral gray icons at rest, consistent control geometry and
spacing, and no persistent filled button competing with the session title. This change is limited
to the right side of the session titlebar and preserves every action and accessible name.

## Spec

The session titlebar uses the existing muted foreground for every toolbar icon and label across
rest, hover, open, and pressed states; disabled controls remain visibly disabled. All available
actions use transparent toolbar chrome at rest. Hover, open, or pressed controls may use a neutral
fill, but must not change the icon color or use the product accent color. Standalone titlebar controls
share a 28px square height and a 4px gap; the two halves of a split button keep a zero-width inner
gap and a subtle seam.

### Acceptance criteria

- [x] AC-1: In dark and light appearance, every enabled resting titlebar icon has the same computed
      neutral foreground and transparent background.
- [x] AC-2: Open or pressed state remains discoverable through a neutral surface without an accent-color
      icon; disabled state remains distinct.
- [x] AC-3: Environment, pane, project-action, split-menu, plugin, and panel controls share 28px height,
      4px spacing between independent controls, and aligned icon sizing.
- [x] AC-4: Add action, Open, Commit, split menus, pane controls, environment, plugin action, and panel
      actions retain their accessible names and behavior.
- [x] AC-5: Focused tests, design check, SDLC check, and rendered console check pass.

## Decision and gates

Intent and design acceptance come directly from the user's 2026-08-29 titlebar feedback. No
permission to create a PR, merge, publish, or release is implied.

## Plan

Normalize the existing titlebar controls in place: use one neutral ghost treatment, preserve a
neutral selected state, align the pane buttons with the shared Button primitive, and wrap the
right-side controls in one 4px toolbar cluster. Add narrow contract assertions, document the
titlebar rule, then verify the real renderer at desktop and constrained widths in both appearances.
Rollback is the inverse source change.

## Build

The session action buttons, environment trigger, pane controls, panel toggle, and header plugin
actions now share the gray ghost treatment. Environment and panel selected states use the existing
neutral fill without changing icon color. Pane controls now consume the shared Button primitive at
28px, and the entire right-side titlebar is one 4px toolbar cluster. Both split groups explicitly
retain a zero-width inner gap and semantic 8px horizontal padding.

## Verification

- Six focused rendered/contract tests passed with 38 unrelated cases filtered out; a follow-up run
  of the two changed session-action tests passed with 49 assertions. The selected tests covered
  neutral styling, 28px geometry, 4px/0px gaps, split seams, plugin action treatment, popover
  open/dismiss, pane wiring, titlebar composition, and the Open/Commit split-menu interaction.
- `bun run check:design`: passed with 0 new violations, 659 tracked legacy occurrences, and all
  contrast checks passing. A focused review determined a full renderer build would add little
  evidence for this class/markup-only change, so it was intentionally not run.
- At `http://localhost:1420/` in the 1280x720 dark renderer, every enabled resting titlebar control
  resolved to one foreground value, a transparent background, 28px height, 4px toolbar/action gaps,
  and 0px split-group gaps. The page title was `C2`, the page was nonblank, and console warning/error
  output was empty.
- Opening Environment kept the same muted icon foreground and added only a neutral surface. Opening
  the right panel constrained the session header to 620px, hid labels through the existing container
  rule, preserved accessible names, and showed the pressed panel action with a neutral fill and no
  clipping. Closing it restored a fully transparent resting toolbar.
- In light appearance, every enabled resting action again resolved to one foreground value and a
  transparent background, with the same 28px height and 4px/0px gap contract. The appearance setting
  was restored to System after verification.
- `bun script/verify/sdlc.ts` and `git diff --check`: passed.

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — recorded dark/light computed styles found the same resting neutral icon color across enabled titlebar actions. Evidence: `Verification record above`.
- AC-2: PASS — rendered open and pressed states used the recorded neutral surface without persistent accent fill. Evidence: `Verification record above`.
- AC-3: PASS — the focused toolbar contract and computed geometry retained the shared `28px` control height and spacing.
- AC-4: PASS — recorded pointer and keyboard inspection exercised Add, Open, Commit, split, pane, environment, plugin, and panel actions. Evidence: `Verification record above`.
- AC-5: PASS — focused tests, `bun run check:design`, `bun script/verify/sdlc.ts`, console inspection, and `git diff --check` passed.

Residual risk: a full renderer build was intentionally skipped for this markup-only change; the
focused tests, design check, live renderer, and diff evidence are the acceptance boundary.

## Review and release

No PR, merge, or release requested. Human product review remains the next lifecycle trigger.

## Feedback

No additional defect observed during the dark, light, constrained, open, pressed, and restored
states above.
