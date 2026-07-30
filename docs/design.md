# Design standards

The desktop app's visual system. Everything here is enforced by tokens in
`apps/desktop/src/styles.css` where CSS can enforce it, and by convention where it can't.
When a new value seems needed, add a token — don't inline an arbitrary one.

## Type

Six sizes, named for their role. Use the token classes; `text-[Npx]` is a code smell
(the half-pixel sizes that used to litter the codebase — 11.5, 12.5, 13.5 — were drift,
not decisions).

| class          | size | role                                              |
| -------------- | ---- | ------------------------------------------------- |
| `text-cap`     | 10px | keycaps, badges, all-caps micro-labels, durations |
| `text-fine`    | 11px | metadata, preview lines, hints, timestamps        |
| `text-hint`    | 12px | secondary text, tab labels, descriptions          |
| `text-ui`      | 13px | **the default** — rows, buttons, menus, body text |
| `text-title`   | 15px | panel and dialog titles                           |
| `text-heading` | 17px | page headings, empty-state greetings              |

The editor (BlockNote) and settings page display headings have their own scale in
`styles.css`; those are content, not chrome.

Faces: Inter (UI), `--font-mono` (paths, shortcuts, diffs, token counts). No third face.

## Icons

Lucide only — one library, `currentColor`, consistent stroke. Provider brand marks are the
single exception (`providers/ProviderIcon.tsx`), drawn in `currentColor` for the same reason.

| class      | size | role                                           |
| ---------- | ---- | ---------------------------------------------- |
| `size-3`   | 12px | inline glyphs inside text lines                |
| `size-3.5` | 14px | menu rows, list rows, chips                    |
| `size-4`   | 16px | control buttons (the `size-8` icon button)     |
| `size-5`   | 20px | feature tiles (dock surface picker)            |

## Spacing

The Tailwind 4px grid; no arbitrary pixel padding. The recurring measures:

- **Module inset**: 8px (`m-2`) between floating modules and the window/each other.
- **Rail gutter**: `px-3` container + `px-2` rows — icons land on one vertical line.
- **Page gutter**: `px-6` inside full-page surfaces (settings).
- **Control rows**: `gap-1.5` between grouped controls, `gap-0.5` between icon buttons.
- **Text measure**: transcript and doc-mode editor cap at `max-w-[860px]`.

## Color

All color goes through the semantic tokens in `styles.css` (`--background`, `--muted-foreground`,
`--primary`, `--success`, `--warning`, `--destructive`, …), defined in oklch for both schemes.
Never hex/rgb in components — the sole exception is the terminal's 16-slot ANSI palette, which
its renderer parses itself.

Fills for borderless controls derive from foreground alpha so they work in both schemes:
`bg-foreground/[0.06]` resting, `[0.09]` hover (fields), `[0.04]` list tiles.

## Surfaces & borders

Borderless: layout is defined by shadow and fill, not lines (`surface-module`, ring-hairlines
`ring-1 ring-foreground/10` on overlays, `divide-*`/`border-*` only inside content like diffs).
See the module classes in `styles.css`.

## Motion

One curve — `cubic-bezier(0.16, 1, 0.3, 1)` — and four durations: 120–160ms overlays,
200–300ms layout (dock sweep), ~240–280ms page mounts. Classes: `pop-layer`, `dialog-layer`,
`overlay-layer`, `animate-page-in`, `animate-rise-in`, `animate-slide-in-right`. All motion
collapses under `prefers-reduced-motion`.

## Components

Source order when a control is needed:

1. **shadcn/ui primitive** in `components/ui/` (built on the `radix-ui` bundle) — menus are
   `DropdownMenu` (keyboard nav for free), composite anchored panels are `Popover`, centred
   surfaces are `Dialog`. Restyle in place to these standards.
2. A shared app component (`Chip`, `MenuSection`, `IconAction`…) when a primitive doesn't fit.
3. A new hand-rolled element only when neither exists — and it must consume the tokens above.

Don't hand-roll what Radix already ships: focus management, dismissal, and keyboard behavior
are the actual product of that dependency.
