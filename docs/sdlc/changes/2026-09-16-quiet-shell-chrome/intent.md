---
id: 2026-09-16-quiet-shell-chrome
schema: 5
stage: intent
status: accepted
owner: chenli
created: 2026-09-16
source: user
risk: medium
approved_by: chenli
approved_at: 2026-09-16
approval_source: "Direct request: a screenshot of the running dev build with five red annotations (统一间距 / 去掉背景 / 对齐问题 / 去掉背景 / composer config row), confirmed through the follow-up questions for the ambiguous marks."
next_trigger: chenli reviews the verified work.
---

# Intent: Quiet the app shell chrome

## Intent

The user reviewed the running dev build and marked five chrome problems in one annotated screenshot,
then confirmed the two ambiguous marks in a follow-up exchange:

1. the titlebar's right action cluster mixes 16px, 8px and 17px gaps and mixes filled and unfilled
   controls ("统一间距");
2. the project mark in the titlebar carries a filled tile with a ring ("去掉背景");
3. the session row's workspace badge line does not left-align with the row title ("对齐问题");
4. the two workspace badges render as filled pills ("去掉背景");
5. the composer's session-config chips occupy their own row above the `+ / voice / send` row, and
   the user wants them moved onto that row.

Measured before the change (renderer at 1728px, empty shell): `.session-header-toolbar` `gap: 16px`,
the session action group `gap: 8px`, and a 17px gap before the trailing layout control;
`ProjectIcon` renders `bg-foreground/[0.055]` plus `ring-1 ring-foreground/10`; the checkout and
pull-request badges render `bg-fill-quiet` with `px-1` pill padding; the composer footer stacks
`SessionControls` above the `controls` row.

Outcome: one 4px gap across the titlebar toolbar (the documented rhythm for independent 28px
controls), a plain project mark, unfilled workspace badges whose text starts at the title's edge, and
a composer whose config chips share the single control row with `+ / voice / send`.

Follow-up review in the same session added four more marks on the running build:

6. the rail's pull-request badge should carry its state by colour instead of the words
   ("用颜色表示合并状态，不要文字了"); the checkout badge and the numbers stay;
7. the session header's leading project mark should go entirely ("去掉前面的icon");
8. the selected rail row's left selection bar should go ("去掉这个组件前面的线"); the selected fill
   remains as the selection state;
9. the checkout bar's chips should use the quiet grey label ("改成输入框里面的按钮灰色字").

Constraints: no control is added, removed, or demoted — this is spacing, plane, and structure only.
Keep every aria-label, tooltip, popover, and keyboard path, the rail's drag/context-menu behaviour,
and both composer shapes (compact and document). No token, theme, or color value changes.

Non-goals: the action-budget reduction (demoting low-frequency actions into overflow), the status
vocabulary convergence, and the global spacing-vocabulary cleanup stay in their own records.

## Non-goals

No behavior, data, copy, or navigation change; no new component; no change to which controls exist.
