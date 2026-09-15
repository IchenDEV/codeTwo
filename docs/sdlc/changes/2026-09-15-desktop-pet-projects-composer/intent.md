---
id: 2026-09-15-desktop-pet-projects-composer
schema: 5
stage: intent
status: accepted
owner: chenli
created: 2026-09-15
source: user
risk: low
approved_by: chenli
approved_at: 2026-09-15
approval_source: "Direct request in this session: (1) fix the desktop pet so it can be dragged and renders fully; (2) fix adding a project when no project exists; (3) the Composer input color reads badly and the theme Accent ('Active Color') is not applied to it."
next_trigger: chenli reviews verified work.
---

# Intent: Desktop pet, empty-project add, composer tone

## Intent

Three user-reported desktop defects in `apps/desktop`:

1. The desktop pet window cannot be dragged, and the sprite appears cut off.
2. When the workspace has no Project registered, there is no reachable way to add one.
3. The message Composer input color reads badly, and the theme Accent ("Active Color") is not
   applied to it.

Outcome: the pet is grabbable and fully visible; the empty rail offers "Add a project…"; the
Composer keeps its existing white/neutral surface. The user clarified item 3 as "keep the input box
white, and do not make the focus a special color", so no accent tint and no focus-color change were
introduced.

Constraints: keep the existing pet window model (transparent, always-on-top, context-menu close),
keep the current rail structure and strings, and reuse the existing appearance resolver — do not
introduce a new color token or a new add-project flow. Non-goals: recoloring the Composer,
redesigning the rail, or touching the Core/host protocol.

The direct request authorizes this bounded local work.
