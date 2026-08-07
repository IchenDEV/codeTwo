# Design standards

The desktop app's visual system. Everything here is enforced by tokens in
`apps/desktop/src/styles.css` where CSS can enforce it, and by convention where it can't.
When a new value seems needed, add a token — don't inline an arbitrary one.

## Type

Seven sizes, named for their role. Use the token classes; `text-[Npx]` is a code smell
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
| `text-display` | 22px | the single heading of a full-page surface         |

Tailwind's own scale — `text-xs`/`text-sm`/`text-base`/`text-lg` — is **not** part of this
system and must not appear in the app, including inside `components/ui/`. Those are 12/14/16/18px:
importing a shadcn component unedited is how 14px body text gets in, and 14px next to 13px doesn't
read as a decision, it reads as a mistake. Restyle the primitive to these tokens on the way in.

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

Fills for borderless controls derive from foreground alpha so they work in both schemes. Three
steps, as named tokens — not hand-written alphas, which is how six values (0.025 … 0.09) ended up
doing three jobs:

| class            | role                                                       |
| ---------------- | ---------------------------------------------------------- |
| `bg-fill-quiet`  | list tiles, read-only chips — present, not clickable-looking |
| `bg-fill-rest`   | fields and borderless buttons at rest                       |
| `bg-fill-hover`  | those same surfaces under the pointer                       |

The terminal is the one surface that stays dark in both schemes, so nothing drawn on it can use
`--foreground` (in light mode that's black on black). Its chrome reads from `bg-term-bg` /
`text-term-fg` instead — never `white/…`, which is the same hardcoding one step disguised.

## Radius

`rounded-sm` 6px (inline chips, rows inside a panel) · `rounded-md` 8px (**the default** — buttons,
fields, menu items) · `rounded-lg` 10px (cards, panels) · `rounded-xl` 14px (feature tiles).
The 12px on `.surface-module` is the window's own corner and matches `windowEffects.radius` in
`tauri.conf.json`; it isn't a general-purpose value.

## State

Every interactive element owes the same six answers, and they must be answered the same way
everywhere — a tree row, a menu item, a table row and a tab are not four different products.

| state    | how it's expressed                                                              |
| -------- | ------------------------------------------------------------------------------- |
| hover    | `hover:bg-accent/50` on rows, `hover:bg-fill-hover` on fields and bare buttons. Colour only — hover never moves layout or changes size |
| selected | `bg-accent` (+ `text-accent-foreground` when the row carries its own colour). A second, weaker rank — the cursor sitting on a row you haven't opened — is `bg-accent/70` |
| focus    | `focus-visible:ring-[3px] focus-visible:ring-ring/50`, never `outline-none` alone. Keyboard reachability is not optional, and Radix gives it for free if you don't fight it |
| active   | brightness or a ≤1px shift, `--motion-fast`. No bounce |
| disabled | `disabled:opacity-50 disabled:pointer-events-none`. Never a bespoke grey |
| loading  | keep the element's size, swap the label for a spinner, and block re-submit. A control that resizes when it starts working makes the page jump under the pointer |

Tabs are the deliberate exception: they mark selection with the underline in `tabs.tsx`, not a
fill, because a tab strip full of filled rectangles competes with the content it labels.

## Surfaces & borders

Borderless: layout is defined by shadow and fill, not lines (`surface-module`, ring-hairlines
`ring-1 ring-foreground/10` on overlays, `divide-*`/`border-*` only inside content like diffs).
See the module classes in `styles.css`.

## Motion

One curve and four durations, as tokens in `styles.css` — a hand-typed `0.18s` is the same drift
as a hand-typed hex.

| token             | value | use                                                            |
| ----------------- | ----- | -------------------------------------------------------------- |
| `--ease-standard` | `cubic-bezier(0.16, 1, 0.3, 1)` | everything that isn't an exit. Exits use `ease-in` |
| `--motion-fast`   | 120ms | hover, press, grabbers, opacity. Never moves layout             |
| `--motion-layer`  | 160ms | anchored surfaces: menus, popovers, tooltips                    |
| `--motion-normal` | 220ms | dialogs, dock sweep, tree branches — motion you watch travel    |
| `--motion-slow`   | 280ms | full-page mounts                                                |

In CSS use the variables; in a component use `duration-[var(--motion-fast)]`. The ready-made
classes cover most cases: `pop-layer`, `dialog-layer`, `overlay-layer`, `animate-page-in`,
`animate-rise-in`, `animate-slide-in-right`. Animation is for a change of state, not for proof
that the UI can move: no bounce, no spring, no scaling a card on hover. All motion collapses
under `prefers-reduced-motion`.

## Transcript

The main conversation and the document-mode side panel share one renderer; their variants may
change layout, never behavior or content. Live output follows the bottom only while the reader is
already at the latest content. Pointer or keyboard interaction pauses following, exposes a visible
“Jump to latest” action, and leaves the reading position untouched as new chunks arrive. Loading an
earlier page preserves the content under the reader instead of moving the viewport. Never start a
new smooth-scroll animation for each streamed chunk.

## Feedback & recovery

Every action needs a perceptible result, and the result is not always a dialog.

- **Say something happened.** `useToast()` from `ui/toast.tsx` is the app-wide channel; anything
  that can silently no-op (a disabled provider, a commit with nothing staged) must say so there.
- **Prefer undo to confirmation.** For anything recoverable, do it, report it, and pass an
  `action` to the toast: `toast("Deleted 3 files", "info", { label: "Undo", run: restore })`.
  A confirm dialog trains the reflex that dismisses it. Toasts carrying an undo stay up 8s.
- **Keep confirmation for the unrecoverable** — and label the button with the verb ("Delete
  branch"), never "OK".
- **Tooltips are for unlabelled icons.** Never put information there that the user must read to
  proceed; a tooltip is unreachable by touch and invisible to a keyboard until focus lands.
- **Errors linger** (8s) because they usually carry something worth reading.

## Components

Source order when a control is needed:

1. **shadcn/ui primitive** in `components/ui/` (built on the `radix-ui` bundle) — menus are
   `DropdownMenu` (keyboard nav for free), composite anchored panels are `Popover`, centred
   surfaces are `Dialog`. Restyle in place to these standards.
2. A shared app component (`Chip`, `MenuSection`, `IconAction`…) when a primitive doesn't fit.
3. A new hand-rolled element only when neither exists — and it must consume the tokens above.

Don't hand-roll what Radix already ships: focus management, dismissal, and keyboard behavior
are the actual product of that dependency.

There is exactly one implementation of each of Button, Input, Select, Checkbox, Tabs, Dialog,
Popover, DropdownMenu, ContextMenu, Tooltip, Command palette, the file Tree (`files/FilePanel`)
and the toast (`ui/toast`). A second one is a bug even when it looks right on its own page.

## Before you commit

A change that touches the UI should survive this list. Every item is greppable, so it's also
what a review looks for first:

- [ ] No hex, `rgb()` or `oklch()` in a component — only the terminal's ANSI palette is exempt.
- [ ] No `text-xs`/`text-sm`/`text-base`/`text-lg`, no `text-[Npx]`.
- [ ] No hand-written `bg-foreground/[0.0x]` — use `bg-fill-*`; no `white/…` outside the terminal.
- [ ] No literal transition durations or curves — use the motion tokens.
- [ ] Padding on the 4px grid; no arbitrary `p-[13px]`.
- [ ] Hover, focus-visible, disabled and (where it can be busy) loading all exist, and hover
      doesn't move anything.
- [ ] Both schemes checked — the dark one is not a filter over the light one.
- [ ] Nothing re-implements a component from the list above.
- [ ] Destructive or slow actions report their result, and recoverable ones offer undo instead of
      a confirmation.
