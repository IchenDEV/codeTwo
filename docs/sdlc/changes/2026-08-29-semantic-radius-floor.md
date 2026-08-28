---
id: change-2026-08-29-semantic-radius-floor
kind: change
status: verified
owner: codex
created: 2026-08-29
updated: 2026-08-29
next_trigger: human review accepts the rendered geometry and release risk
---

# Raise the semantic radius floor

## Intent

The user requested one consistent radius increase across the desktop UI and annotated the new-task
surface with exact target values. The smallest visible semantic radius must be 12px. Module
containers that previously used 12px must move to 16px, while the repaired Composer remains at its
existing fixed 24px radius.

## Spec

Change the semantic geometry tokens rather than adding local overrides. Map both micro and control
radii to 12px, and both module and modal radii to 16px. Preserve fully round geometry for
intrinsically circular controls and preserve the 24px Composer radius.

### Acceptance criteria

- [x] No visible semantic role resolves below 12px; verify with the token contract test.
- [x] Add action, Run, and Scene controls resolve to 12px.
- [x] The split Open control resolves to 12px on each exposed outer edge and keeps the joined edge
      square.
- [x] Project health and Project checkout resolve to 16px.
- [x] The Composer remains 24px and its editor stays inside the painted card.
- [x] The annotated surface is checked at narrow and standard widths in light and dark appearance.
- [x] The focused regression tests, renderer build, design-system check, and SDLC check pass.

## Decision and gates

Intent and exact geometry are supplied directly by the user's 2026-08-29 browser annotations. No
permission to publish, merge, or release is implied.

## Plan

Update the semantic token mappings, the design-system preview labels, and the design law. Validate
the exact computed radii from the real callers and keep the change at the shared-token boundary.
Rollback is the inverse token mapping.

## Build

The semantic token source now maps micro and control to 12px and module and modal to 16px. A
compatibility bridge gives the remaining legacy `rounded`, `rounded-sm`, `rounded-md`, and
`rounded-lg` utilities the same 12px floor without changing joined-edge `rounded-*-none` behavior.
The design preview and design law show the new values.

## Verification

- Sol's minimal independent review ran `bun test tests/composerGeometryContract.test.ts` with 3
  passes, then `bun test tests/designSystem.test.ts -t "radii|radius"` with 2 passes and 12
  assertions. `git diff --check` also passed.
- At 811x998 in both light and dark appearance, computed corners were Add action 12px, Run 12px,
  Scene 12px, Open `12/0/0/12`, Open More `0/12/12/0`, Project health 16px, Project checkout 16px,
  and Composer 24px. The previously unannotated Split right control also moved from 4px to 12px.
- At 1280x800 in both light and dark appearance, the audited visible controls had no non-zero
  corner below 12px and the typed editor stayed within the Composer card.
- `bun run build:renderer`: passed TypeScript, Vite production build, source design check, and
  built-CSS design check; 0 new design violations and 35 semantic selectors generated.
- `python3 script/check_sdlc.py` and `git diff --check`: passed.

## Review and release

No PR, merge, or release requested. Human product review remains the next lifecycle trigger.

## Feedback

The exact Browser annotations are the accepted geometry source; no viewport-only overrides or
preview attributes were copied into production code.
