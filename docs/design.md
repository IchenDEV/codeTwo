# C2 desktop design system

Status: **0.9.0 candidate**. The system is structurally frozen; it becomes 1.0.0 only after the
preview has been checked on Windows with Segoe UI/Cascadia in light and dark mode.

This document applies to `apps/desktop` only. The website has its own system; only brand and logo
assets may be shared. The machine-readable source is
`apps/desktop/src/design/tokens.css`. Do not copy token values into TypeScript.

Phase 1 establishes the system, development preview, automated contrast checks, and a no-growth
baseline for existing visual debt. It intentionally does not partially restyle the production UI.
Phase 2 migrates every desktop surface in one coordinated change and removes the legacy baseline.

Open the development-only preview with:

```text
bun run dev:renderer
http://localhost:1420/?design-system=1
```

The preview is not linked from production navigation and is removed from the production bundle by
the `import.meta.env.DEV` gate.

## Design direction

Freeze and strengthen the existing C2 visual language. It is a compact desktop tool, not a
mobile layout and not a showcase for decorative effects.

- One compact density. Content may remain comfortable; chrome stays tight.
- Quiet neutral planes establish hierarchy. C2 blue identifies the primary action.
- Persistent panels, cards, inputs, popovers, and dialogs are borderless and separated by solid
  surface tones plus controlled elevation.
- Hover changes surface or text tone only. It never lifts, scales, or blooms a shadow.
- Icons use Lucide and `currentColor`. Provider marks may keep their shape, never their brand color.
- Official themes are light, dark, and system. There is no user accent, provider theme, or custom
  palette.

## Token architecture

There are three levels, in this order:

1. `--ds-foundation-*` stores raw numbers and colors. Product code must never consume it.
2. Semantic roles such as `--ds-color-surface`, `--ds-space-section`, and
   `--ds-type-body-size` describe intent.
3. Shared-component aliases such as `--ds-button-height` and `--ds-dialog-radius` belong only to
   reusable primitives.

Business components may override layout—width, flex/grid, alignment, positioning, responsive
behavior, and semantic spacing. They may not override typography, color, radius, elevation,
control height, motion, or focus appearance. A missing visual treatment becomes a semantic variant
in the shared primitive, not a local class string.

## Color and surfaces

All app chrome consumes semantic OKLCH tokens. The five neutral planes are fixed:

| role | use |
| --- | --- |
| `canvas` | window content background |
| `sidebar` | application chrome; macOS may use native vibrancy |
| `surface` | cards, fields, persistent panels |
| `raised` | menus, popovers, tooltips |
| `modal` | dialogs and blocking surfaces |

Components cannot mix transparency to invent a sixth plane. macOS sidebar vibrancy is the only
native-material exception; Windows uses a solid sidebar. Cards, inputs, popovers, and dialogs are
always solid. Reduced Transparency forces the macOS sidebar to its solid token.

C2 blue is fixed for primary actions. Use no more than one primary action per local area.
Success, warning, destructive, and neutral keyboard focus have dedicated roles. A color change must
be made centrally, pass the light and dark contrast contracts, and land in an isolated visual-token
commit with light, dark, and narrow screenshots.

Dark mode separates planes with lightness and tighter dark shadows. Do not add a white hairline,
inner glow, or translucent glass to recover separation.

## Typography

Use the platform UI stack:

```css
-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

Monospace uses `ui-monospace`, SF Mono on macOS, and Cascadia/Consolas fallbacks on Windows. Do not
bundle Inter or force SF on Windows.

| role | size / line height | use |
| --- | --- | --- |
| Large title | 26 / 32 | rare top-level statement |
| Page title | 22 / 26 | full-page title |
| Section | 17 / 22 | section heading |
| Dialog | 15 / 20 | dialog and panel title |
| Body / control | 13 / 16 | rows, buttons, menus, single-line body |
| Callout | 12 / 15 | secondary descriptions and tab labels |
| Metadata | 11 / 14 | timestamps, paths, hints |
| Caption / keycap | 10 / 13 | badges and compact keyboard labels |

Transcript, Markdown, and document content use 13 / 20 for multi-line body text. Code blocks use
12 / 18. Content headings may use 15, 17, and 22; compact density applies to surrounding chrome,
not to reading comfort.

Tailwind's `text-xs`, `text-sm`, `text-base`, and arbitrary `text-[…]` values are not part of the
system.

## Spacing, geometry, and control height

Spacing is a 4px grid with one controlled 2px optical step:

| value | semantic role |
| --- | --- |
| 2 | optical correction |
| 4 | inline and metadata gap |
| 6 | icon/text and grouped controls |
| 8 | row horizontal inset and module gap |
| 12 | card, popover, and persistent-panel inset |
| 16 | section and form group |
| 24 | dialog and page gutter |
| 32 | large page section |

The radius scale is 4 / 8 / 12 / 16px:

- 4: checkbox, status mark, micro element.
- 8: button, input, menu item, list row.
- 12: card, popover, sidebar module.
- 16: dialog and large panel.

Fully round geometry is reserved for intrinsically circular objects. Icons are exactly 12 / 14 /
16px for inline, list, and control roles. Standard UI does not use 20px icons.

Control heights are 24px for mini/icon/inline controls, 28px for normal buttons, menus, and
toolbars, and 32px for inputs, selects, and important controls. A taller element is content input
such as Composer, not a generic large-button size.

## Elevation and borders

Elevation communicates a real layer and never changes on hover:

| role | use |
| --- | --- |
| `elevation-surface` | input, card, persistent panel |
| `elevation-raised` | menu, popover, tooltip |
| `elevation-modal` | dialog, blocking overlay |

Static borders and decorative rings are forbidden. The complete whitelist is:

- neutral keyboard focus;
- error or warning status;
- table, diff, code, or document content structure;
- resize divider or drag target;
- progress track.

## State contracts

Every shared control implements rest, hover, keyboard focus, disabled, and loading. Selected and
invalid are added where meaningful.

- **Focus:** a 2px neutral, high-contrast indicator, visible for keyboard focus only. No blue
  focus ring. Inputs may slightly raise their surface, but must not resize.
- **Invalid:** a persistent 2px destructive indicator plus adjacent error text.
- **Disabled:** 50% opacity and no pointer events; do not invent a disabled gray.
- **Read-only:** quiet fill and normal legibility.
- **Loading:** stable dimensions with a 14px spinner; do not swap to a differently sized control.

Button variants are Primary, Secondary, Ghost, and Destructive. Secondary is a neutral elevated
surface, Ghost has no shadow, and Destructive is red only for a destructive action. Outline is not
a variant.

Inputs use a neutral surface plus `elevation-surface`, without a border. Rest, hover, keyboard
focus, invalid, disabled, read-only, and loading all preserve the 32px field contract.

## Motion

| role | duration | use |
| --- | --- | --- |
| feedback | 120ms | hover, press, color, opacity |
| layer | 160ms | menu, popover, tooltip |
| dialog | 220ms | dialog, dock, tree |
| page | 280ms | full-page transition |

Entrances use `cubic-bezier(0.16, 1, 0.3, 1)` and exits use `ease-in`. Do not add spring, bounce,
hover scaling, or a one-off duration. Reduced Motion collapses all four semantic durations.

## Window behavior

The desktop minimum remains 800×500. Window classes are compact at 800–999px, standard at
1000–1399px, and wide at 1400px and above. Local modules use container queries when their own
available width—not the window—is the cause of a layout change. There is no mobile application
layout. Dialogs must avoid overflow around 400px for tests and auxiliary windows.

## Shared components and exceptions

Local shadcn/ui components remain the unique styled foundation. Interaction primitives use Base
UI behind `components/ui`; product surfaces use the Base `render` composition API and must not
import primitive libraries directly. Radix-backed wrappers and the direct `radix-ui` dependency
are not part of the desktop UI contract.

AI-native presentation patterns may use selected AI Elements source components under
`components/ai-elements`. Adapt them to C2 tokens and ACP data rather than adding Next.js or
AI SDK transport assumptions. Do not reimplement conversations, messages, reasoning, tools,
plans, or task progress inside product surfaces when an AI Element fits the behavior.

Terminal, Monaco/Shiki, and BlockNote are controlled content-renderer exceptions:

- their surrounding chrome uses C2 semantic tokens;
- xterm may use its fixed ANSI palette;
- Monaco/Shiki may own syntax colors and editor content typography;
- BlockNote may own document typography inside the document surface.

Every exception is file-scoped with a reason in `scripts/design-system-allowlist.json`.

## Accessibility

Version 1 includes Reduced Motion, Reduced Transparency, Increased Contrast, and Bold Text. Bold
Text is represented by `data-ds-bold-text` until Phase 2 wires the native desktop preference. There
is no independent UI zoom in v1; the product retains one compact density. Semantic colors are
checked in both schemes by `bun run check:design`.

## Behavioral laws retained from C2

- Live transcript follows the bottom only while the reader is already at the latest content.
  Pointer or keyboard interaction pauses following and exposes “Jump to latest.” Prepending history
  preserves the content under the reader.
- Actions provide perceptible feedback. Use the shared toast for outcomes, prefer undo for
  recoverable actions, and reserve confirmation dialogs for irreversible work.
- Tooltips explain unlabelled icons; they never contain information required to proceed.
- Errors remain visible long enough to read and act on.

## Enforcement and migration

Run from `apps/desktop`:

```bash
bun run check:design
bun test
bun run build
```

The checker reads CSS tokens directly, verifies declared contrast pairs, and scans TSX/CSS for
raw color, arbitrary values, off-scale type, spacing, radii, shadow, motion, borders, direct
foundation use, visual `!important`, and non-contract control heights. Errors include file, line,
matched value, and the expected replacement.

`scripts/design-system-baseline.json` records only pre-Phase-1 debt by rule, path, and value. CI
allows the count to decrease but never increase. New system files have zero baseline allowance.
Phase 2 removes all recorded violations and deletes the baseline in the same migration.

Pixel-diff CI is intentionally deferred because platform system-font rasterization differs. CI
enforces rules and contrast; the development preview is manually checked in light, dark, narrow,
Reduced Motion, Increased Contrast, and Bold Text. After the migration, evaluate separate macOS
and Windows visual baselines.

## Versioning and review

- Patch: documentation or alias correction with no semantic/visual change.
- Minor: token value change or additive semantic role.
- Major: token removal, rename, or meaning change.

Foundation changes belong in an isolated commit and require light, dark, and narrow screenshots.
A feature PR cannot casually change foundation values. Before 1.0.0, validate the Preview on
Windows in Segoe UI/Cascadia, light and dark; until then the status remains 0.9.x.
