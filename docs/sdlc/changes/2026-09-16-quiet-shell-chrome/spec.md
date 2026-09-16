---
id: 2026-09-16-quiet-shell-chrome
schema: 5
stage: spec
status: accepted
owner: chenli
created: 2026-09-16
based_on: intent.md
---

# Spec: Quiet the app shell chrome

## Design

1. **One titlebar gap.** `.session-header-toolbar` drops `gap-4` (16px) and the session action group
   drops `gap-2` (8px) for the semantic `gap-inline` (4px), matching `docs/design/system.md`
   ("Independent 28px controls use a 4px gap"). The two `@container session-header` gap overrides
   (`12px` below 36rem, `4px` below 28rem) are removed because they made narrow windows *wider* than
   the base, which is where the uneven reading came from. Control heights, fills, and labels are
   unchanged.
2. **Plain project mark.** `ProjectIcon` drops the `bg-foreground/[0.055]` tile and the
   `ring-1 ring-foreground/10` ring. The 12px `rounded-control` box stays so an uploaded icon image
   still clips to the same shape; without one, the folder glyph renders on the app plane. All three
   call sites (titlebar, worktree list, project picker) share the change.
3. **Unfilled workspace badges.** The checkout and pull-request badges drop `bg-fill-quiet`,
   `rounded-micro`, and the `px-1` pill padding, becoming inline icon+label meta in their existing
   tone (`text-foreground/55`, `text-success`, `text-destructive`, `text-warning`,
   `text-muted-foreground`). Because they are the only element on the workspace line that added a
   left offset, this also puts their text edge on the row title's edge: both lines are children of
   the same `data-session-content` container, which owns the row's single left inset.
4. **One composer control row.** `SessionControls` moves from its own line in the footer into the
   `controls` fragment before the flex spacer, so the compact composer renders one row:
   `[+] [collaboration] [goal] [statusline] [chips] … [expand] [voice] [run]`. The footer keeps a
   single `flex items-center` row; the session-options popover still opens beneath the chips, and the
   document-mode floating bar keeps its surface and position.
5. **Pull-request state by colour.** The rail badge keeps its state icon and `#number` and drops the
   visible state word; the tone still separates merged (success), failing/conflicting (destructive),
   running (warning) and the rest (muted), and the tooltip and `aria-label` keep the words for hover
   and assistive technology.
6. **No leading project mark.** The session header's breadcrumb loses the project icon span, its
   `ProjectIcon`/`Folder` conditional and the now-unused imports; the project name and `/` separator
   stay, and the narrow-window rule that hid the mark goes with it.
7. **No rail selection bar.** The selected rail row keeps `bg-fill-selected` and drops the
   `before:` vertical bar; nothing else changes and the row's other states are untouched.
8. **Quiet checkout-bar labels.** The checkout chip and the branch chip switch their label colour
   from `text-foreground/85` and `text-foreground/80` to the muted foreground.

## Acceptance criteria

- [x] AC-1: The titlebar toolbar renders one 4px gap across its controls and clusters; no 16px or 8px
  toolbar gap and no widening container-query override remains.
- [x] AC-2: The project mark renders with no tile fill and no ring at all three call sites.
- [x] AC-3: The workspace badges render with no background or pill padding, and the workspace line
  shares the row content container with the title line so their text edges agree.
- [x] AC-4: The compact composer renders the chips in the same row as `+ / voice / run`; the footer
  keeps one control row and the options popover still opens under the chips.
- [x] AC-5: Desktop lint, type, tests, and the renderer build pass; rendered captures show the
  titlebar gap, the plain project mark, the unfilled badges, and the single composer row.
- [x] AC-6: The rail's pull-request badge renders the state icon and `#number` only, coloured by
  state, with the state word still present in its `title` and `aria-label` and absent from the
  visible text.
- [x] AC-7: The session header renders the project name and `/` without a leading project mark, and
  no `ProjectIcon`/`Folder` fallback remains in that header.
- [x] AC-8: The selected rail row renders its selected fill with no leading bar.
- [x] AC-9: The checkout chip and the branch chip render their labels in the muted foreground.
