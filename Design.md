# C2 Desktop Design Standard

Status: accepted, 2026-09-09. Applies to the desktop renderer. This file owns visual design decisions; [the component contract](docs/design/system.md) owns token architecture, reusable-component APIs and implementation constraints. Existing release and platform verification boundaries remain unchanged. Values below are C2 decisions, not extracted Codex or ChatGPT internals.

## Scope and intent

Make controls compact, reading comfortable, navigation identifiable and repeated layouts predictable. This standard covers the workspace/composer, session rail, settings, shared buttons, fields, menus, tabs, dialogs and the panels composed from them. Preserve existing capabilities, permissions, provider routing, saved preferences and task data. No navigation feature is removed. Low-frequency options remain in the existing settings/popover controls.

## Shape and hierarchy

- Minimum control/menu-item radius: **12px**, explicitly confirmed by the user. Cards and dialogs: **16px**. Main composer: **24px**. Circular controls remain circular; small marks naturally clamp their radius.
- Persistent content surfaces are flat. Menus and dialogs may use the shared elevation/material. Hover and press never translate, scale, glow or increase shadow.
- Keep one primary action per local group. Use a neutral surface for ordinary controls and C2 blue for primary actions and links. Success, warning and destructive colors convey actual status.
- Page title, explanatory copy, content and action appear in that order. Headings and actions use the same content alignment grid.

## Color and interaction states

Default light palette: background `#FFFFFF`, foreground `#202123`, accent `#356DE6`. Default dark palette: background `#18191D`, foreground `#F2F4F8`, accent `#77A7FF`. Custom palettes remain supported by the same resolver; no page hardcodes these values.

Neutral fills are generated with `color-mix(in oklch, foreground N%, background)`. This defines exact behavior across palettes rather than maintaining a competing list of approximate hex colors.

| Role | Light N | Dark N | Purpose |
| --- | ---: | ---: | --- |
| quiet | 2.5 | 4 | Low-emphasis/read-only region |
| rest | 4 | 6 | Persistent input or secondary control |
| hover | 7 | 12 | Pointer or menu highlight |
| selected | 12 | 18 | Persistent current item |
| selected-hover | 16 | 23 | Current item under pointer |
| pressed | 20 | 28 | Pointer held down |

- Ordinary ghost, secondary and legacy outline buttons share this neutral ladder. Do not tint routine hover blue or multiply a state by opacity.
- Selection survives hover and mouse exit. Navigation exposes `aria-current` and a persistent neutral leading mark, so macOS vibrancy cannot hide the current item; tabs and menu selections retain their indicator/checkmark. Hover alone does not imply selection.
- Primary hover and press mix the foreground into the accent by 8% and 16%, preserving the paired foreground. Destructive actions keep their own semantic color pair.
- Keyboard focus is an independent **2px neutral high-contrast indicator**. It can coexist with selection and hover. Keep the existing neutral focus convention.
- Disabled controls do not respond to hover/press and remain inoperable. Their existing 50% opacity treatment remains; do not use it for normal supporting text.
- Ordinary text and essential descriptions must reach 4.5:1 against their actual surface. Do not stack opacity on supporting text or editor placeholders. Custom themes must be checked rather than assumed conformant.
- Feedback duration: **120ms**; respect Reduced Motion. A row without a primary action does not get an interactive hover treatment.

## Typography

Use the system UI stack (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, sans-serif). Keep the user's selected family and scale. Code stays independently configurable; preserve saved code sizes.

| Role | Default size / line height | Weight |
| --- | --- | --- |
| Large title | 28 / 34px | 600 |
| Page title | 20 / 28px | 600 |
| Content section | 18 / 24px | 600 |
| Dialog title | 16 / 22px | 600 |
| UI / controls | 14 / 20px | 400; emphasis 500 |
| Reading / editor prose | **15 / 24px** | 400 |
| Supporting copy | 13 / 20px | 400 |
| Metadata | 12 / 16px | 400 |
| Caption / keycap only | 11 / 14px | 400 |
| New-install code default | **13 / 20px** | 400 |

The typography resolver owns derived sizes; product components never calculate a second scale. Group headings in settings use the UI role with emphasis, not spaced-out uppercase metadata. Task titles remain legible even when metadata is compact.

## Spacing and geometry

Use the existing 2/4/6/8/12/16/24/32px scale: icon/text 6–8px, related controls 8px, label/field 8px, rows 16px combined separation, groups 24–32px, page inset 24px. Preserve 28/32/36px control heights and 32px navigation rows. Responsive layouts may stack fields; they must not hide labels or force horizontal scrolling.

- Expanded document content and its floating action bar share a **48rem outer measure**, centered in the available column with 24px side insets. Preserve the editor's block-handle gutter and enough bottom clearance for every line to scroll above the action bar.
- Compact composition remains a bounded input card. Expansion must reuse the same editor tree and preserve its draft.
- Settings use a consistent 24px page inset, aligned trailing controls and section grouping. Narrow content columns stack controls below labels.
- Session names lead the rail. Supporting text is bounded to one line; status, age and provider remain aligned. Routine row actions appear on hover/focus. External resource groups default collapsed only when no saved preference exists.
- File/diff/terminal panels retain task-appropriate density; shared chrome and controls follow this standard without constraining code to a prose column.

## Application rules

Update tokens/resolver and shared primitives before pages. The shared Button, Input, Textarea, Select, menus, Command, Tabs and navigation rows own interaction visuals. Feature components own content and layout only. Existing callers using a legacy outline Button are treated as neutral secondary controls until API migration; they do not introduce an outlined visual system.

Use the existing [component contract](docs/design/system.md) for accessibility, component admission, focus, materials and scanner rules. It must reference this file for visual values; changes to the two documents must remain consistent.

## Acceptance

Check light, dark and one non-default palette at normal and narrow widths. Exercise rest, hover, selected, selected-hover, pressed, keyboard focus and disabled states. Verify actual rendered colors and bounds, draft retention on expand/collapse, long Chinese labels, empty/error states and text scaling. A successful build is not visual acceptance. Implementation status and evidence belong only to the [change record](docs/sdlc/changes/2026-09-08-visual-coherence-standard/verification.md).
